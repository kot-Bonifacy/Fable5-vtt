import { execSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ArchiveImportResult, CampaignSummary, MapUploadResult } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { TEST_ADMIN } from './test-admin.js';
import { joinUrl } from './test-join.js';
import { patternPng } from './test-images.js';
import type { CampaignArchive, CharacterArchive, SceneArchive } from './archive.js';
import {
  downloadPackage,
  importArchive,
  multipartFile,
  readPackage,
  repack,
  zipOf,
} from './test-archive.js';

/**
 * Paczki ZIP i wczytanie kampanii jako nowej (etap 57a).
 *
 * Kryteria ukończenia, które da się sprawdzić bez przeglądarki:
 *  - scena z mapą z kampanii A wczytana w B pokazuje mapę także po usunięciu
 *    pliku w A (paczka jest samowystarczalna),
 *  - zrzut kampanii wczytany jako nowa kampania odtwarza karty, sceny, tabele,
 *    sklepy, boty, dziennik i handouty, a powiązania wskazują nowe wiersze,
 *  - karta gracza wchodzi jako „czeka na gracza” i link zaproszenia ją przypisuje,
 *  - paczka uszkodzona, z plikiem spoza listy albo ze ścieżką poza katalogiem
 *    odmawia, zanim cokolwiek trafi do `uploads/`.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const IMPORT_MAX_BYTES = 3 * 1024 * 1024;

const config: ServerConfig = {
  port: 0,
  host: '127.0.0.1',
  clientOrigin: 'http://localhost:5173',
  databaseUrl: `file:${TEST_DB}`,
  gmName: 'MG',
  gmPassword: GM_PASSWORD,
  ...TEST_ADMIN,
  cookieSecret: 'test-cookie-secret',
  sessionTtlDays: 1,
  uploadsDir: mkdtempSync(join(tmpdir(), 'vtt-uploads-')),
  dataPublicDir: resolve(import.meta.dirname, '../../../data/public'),
  dataPrivateDir: resolve(import.meta.dirname, 'fixtures/no-private-data'),
  aiGatewayUrl: 'http://127.0.0.1:1',
  aiGatewayApiKey: '',
  aiHealthIntervalMs: 60_000,
  aiRequestTimeoutMs: 1000,
  archiveImportMaxBytes: IMPORT_MAX_BYTES,
};

let built: BuiltApp;
let gmCookie: string;
let gmId: string;
let playerId: string;
let campaignA: string;

function cookieOf(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error('missing set-cookie header');
  return raw.split(';')[0]!;
}

async function createCampaign(name: string): Promise<string> {
  const res = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name },
  });
  return (res.json() as CampaignSummary).id;
}

/** Kampania otwarta u MG — do niej idzie pobranie zrzutu i wczytanie karty/sceny. */
async function openAt(campaignId: string): Promise<void> {
  await built.prisma.user.update({ where: { id: gmId }, data: { openCampaignId: campaignId } });
}

/** Plik w katalogu kampanii, jakby go wgrano — zwraca adres. */
function seedFile(campaignId: string, dir: string, name: string, content: Buffer): string {
  const directory = join(config.uploadsDir, 'campaigns', campaignId, dir);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, name), content);
  return `/uploads/campaigns/${campaignId}/${dir}/${name}`;
}

const diskOf = (url: string) =>
  join(config.uploadsDir, ...url.replace(/^\/uploads\//, '').split('/'));
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');

async function fetchUpload(url: string): Promise<number> {
  const res = await built.app.inject({ method: 'GET', url, headers: { cookie: gmCookie } });
  return res.statusCode;
}

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: 'pipe',
  });
  built = await buildApp(config, { logger: false, sweepUploads: false });
  const login = await built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: 'MG', password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);
  gmId = (login.json() as { user: { id: string } }).user.id;
  campaignA = await createCampaign('Nocna zmiana');
  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignA, 'Rogue'),
  });
  playerId = (joinRes.json() as { user: { id: string } }).user.id;
}, 60_000);

afterAll(async () => {
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows potrafi jeszcze trzymać plik
  }
});

describe('scena z mapą — paczka jest samowystarczalna', () => {
  it('mapa z kampanii A jest w B także po usunięciu pliku w A', async () => {
    await openAt(campaignA);
    const { payload, headers } = multipartFile('brama.png', await patternPng(256));
    const upload = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/maps',
      headers: { ...headers, cookie: gmCookie },
      payload,
    });
    expect(upload.statusCode).toBe(201);
    const map = upload.json() as MapUploadResult;
    const scene = await built.prisma.scene.create({
      data: { campaignId: campaignA, name: 'Brama', backgroundUrl: map.url },
    });
    await built.prisma.token.create({
      data: { sceneId: scene.id, name: 'Wartownik', x: 10, y: 20, imageUrl: map.url },
    });

    const file = await downloadPackage<SceneArchive>(
      built,
      `/api/archive/scene/${scene.id}`,
      gmCookie,
    );
    // Manifest pierwszy, dane drugie, potem grafiki — człowiek z `unzip -l` widzi układ.
    expect(file.order.slice(0, 2)).toEqual(['manifest.json', 'data.json']);
    expect(file.manifest.entries).toHaveLength(1);
    const [entry] = file.manifest.entries;
    expect(entry).toMatchObject({ url: map.url, path: `files/maps/${map.url.split('/').pop()}` });
    expect(entry!.sha256).toBe(sha(file.files.get(entry!.path)!));
    expect(entry!.bytes).toBe(file.files.get(entry!.path)!.length);

    const campaignB = await createCampaign('Druga kampania');
    await openAt(campaignB);
    unlinkSync(diskOf(map.url));
    expect(await fetchUpload(map.url)).toBe(404);

    const zip = await repack(file);
    const { status, body } = await importArchive(built, gmCookie, zip);
    expect(status).toBe(201);
    const result = body as unknown as ArchiveImportResult;
    expect(result).toMatchObject({ kind: 'scene', name: 'Brama' });
    const back = await built.prisma.scene.findUniqueOrThrow({ where: { id: result.id } });
    expect(back.campaignId).toBe(campaignB);
    expect(back.backgroundUrl).toMatch(new RegExp(`^/uploads/campaigns/${campaignB}/maps/`));
    expect(await fetchUpload(back.backgroundUrl!)).toBe(200);
    const token = await built.prisma.token.findFirstOrThrow({ where: { sceneId: back.id } });
    expect(token.imageUrl).toBe(back.backgroundUrl);
  });

  it('karta z portretem jedzie w obie strony', async () => {
    await openAt(campaignA);
    const portrait = seedFile(campaignA, 'portraits', 'twarz_1.webp', randomBytes(2048));
    const card = await built.prisma.character.create({
      data: { campaignId: campaignA, name: 'Iskra', ownerId: playerId, portraitUrl: portrait },
    });
    const file = await downloadPackage<CharacterArchive>(
      built,
      `/api/archive/character/${card.id}`,
      gmCookie,
    );
    expect(file.files.has('files/portraits/twarz_1.webp')).toBe(true);

    const campaignC = await createCampaign('Trzecia kampania');
    await openAt(campaignC);
    const { status, body } = await importArchive(built, gmCookie, await repack(file));
    expect(status).toBe(201);
    const row = await built.prisma.character.findUniqueOrThrow({
      where: { id: (body as unknown as ArchiveImportResult).id },
    });
    expect(row.portraitUrl).toBe(`/uploads/campaigns/${campaignC}/portraits/twarz_1.webp`);
    expect(existsSync(diskOf(row.portraitUrl!))).toBe(true);
    // Rogue nie siedzi w kampanii C — karta czeka na niego z imieniem z pliku.
    expect(row).toMatchObject({ ownerId: null, pendingOwnerName: 'Rogue' });

    // Ten sam plik drugi raz do tej samej kampanii nie dubluje grafiki.
    const again = await importArchive(built, gmCookie, await repack(file));
    const twin = await built.prisma.character.findUniqueOrThrow({
      where: { id: (again.body as unknown as ArchiveImportResult).id },
    });
    expect(twin.portraitUrl).toBe(row.portraitUrl);
  });
});

describe('zrzut kampanii → nowa kampania', () => {
  it('odtwarza zawartość z powiązaniami na nowych wierszach, bez starych id', async () => {
    await openAt(campaignA);
    const portrait = seedFile(campaignA, 'portraits', 'bot_1.webp', randomBytes(512));
    const player = await built.prisma.character.create({
      data: { campaignId: campaignA, name: 'Kowal', ownerId: playerId },
    });
    const template = await built.prisma.character.create({
      data: { campaignId: campaignA, name: 'Ganger', template: true },
    });
    const copy = await built.prisma.character.create({
      data: { campaignId: campaignA, name: 'Ganger 1', templateId: template.id },
    });
    const dealer = await built.prisma.character.create({
      data: { campaignId: campaignA, name: 'Paser', portraitUrl: portrait },
    });
    await built.prisma.ledgerEntry.create({
      data: {
        campaignId: campaignA,
        characterId: player.id,
        kind: 'pay',
        amount: 500,
        balance: 500,
        label: 'Wypłata',
      },
    });
    const scene = await built.prisma.scene.create({
      data: { campaignId: campaignA, name: 'Magazyn', active: true },
    });
    const playerToken = await built.prisma.token.create({
      data: {
        sceneId: scene.id,
        name: 'Kowal',
        x: 0,
        y: 0,
        characterId: player.id,
        ownerId: playerId,
        statusData: JSON.stringify({ grappledBy: copy.id }),
      },
    });
    const turret = await built.prisma.token.create({
      data: { sceneId: scene.id, name: 'Wieżyczka', x: 100, y: 0, characterId: copy.id },
    });
    const door = await built.prisma.wall.create({
      data: { sceneId: scene.id, kind: 'door', x1: 0, y1: 0, x2: 50, y2: 0 },
    });
    await built.prisma.wall.create({
      data: { sceneId: scene.id, kind: 'wall', x1: 0, y1: 50, x2: 50, y2: 50 },
    });
    const architecture = await built.prisma.netArchitecture.create({
      data: {
        campaignId: campaignA,
        name: 'Brama',
        data: JSON.stringify({
          branches: [
            {
              floors: [
                {
                  id: 'f1',
                  devices: [
                    { id: 'd1', deviceKind: 'door', wallId: door.id },
                    { id: 'd2', deviceKind: 'camera', tokenId: turret.id },
                  ],
                },
              ],
            },
          ],
        }),
      },
    });
    await built.prisma.netAccessPoint.create({
      data: { sceneId: scene.id, architectureId: architecture.id, name: 'Terminal', x: 5, y: 5 },
    });
    await built.prisma.defenseZone.create({
      data: {
        sceneId: scene.id,
        entryId: 'defense.wiezyczka',
        name: 'Wieżyczka',
        x: 0,
        y: 0,
        width: 2,
        height: 2,
        tokenId: turret.id,
        exempt: JSON.stringify([playerToken.id]),
        sightings: JSON.stringify({ users: [playerId], tried: [player.id] }),
        architectureId: architecture.id,
        floorId: 'f1',
        deviceId: 'd2',
      },
    });
    const bot = await built.prisma.botProfile.create({
      data: {
        campaignId: campaignA,
        name: 'Paser',
        portraitUrl: portrait,
        data: JSON.stringify({ persona: 'handlarz' }),
        characterId: dealer.id,
        sceneId: scene.id,
      },
    });
    await built.prisma.botRelation.create({
      data: { botId: bot.id, characterId: player.id, value: 2, note: 'stały klient' },
    });
    await built.prisma.merchant.create({
      data: { campaignId: campaignA, characterId: dealer.id, sign: 'Lombard', open: true },
    });
    const sub = await built.prisma.randomTable.create({
      data: { campaignId: campaignA, name: 'Łup — szczegół' },
    });
    const table = await built.prisma.randomTable.create({
      data: {
        campaignId: campaignA,
        name: 'Łup',
        rows: {
          create: [
            { min: 1, max: 5, text: 'Nic', position: 0 },
            { min: 6, max: 10, text: 'Coś', position: 1, subTableId: sub.id },
          ],
        },
      },
    });
    const entry = await built.prisma.journalEntry.create({
      data: { campaignId: campaignA, title: 'Sesja 1', body: 'Brama padła.', sessionDate: '22.10' },
    });
    const handout = await built.prisma.handout.create({
      data: { campaignId: campaignA, title: 'Plan bramy', body: `Patrz [portret](${portrait})` },
    });
    await built.prisma.journalHandout.create({
      data: { entryId: entry.id, handoutId: handout.id },
    });
    await built.prisma.handoutShare.create({ data: { handoutId: handout.id, userId: playerId } });
    await built.prisma.knowledgeEntry.create({
      data: { campaignId: campaignA, title: 'Paser', body: 'Zna każdego.', indexedDigest: 'x' },
    });
    await built.prisma.campaign.update({
      where: { id: campaignA },
      data: { gameTime: 40_000_000 },
    });

    const res = await built.app.inject({
      method: 'GET',
      url: '/api/archive/campaign?chat=1',
      headers: { cookie: gmCookie },
    });
    expect(res.statusCode).toBe(200);
    const file = await readPackage<CampaignArchive>(res.rawPayload);
    expect(file.manifest.counts).toMatchObject({ randomTables: 2 });
    expect(file.manifest.omitted.join(' ')).toContain('Członkostwo');

    const openBefore = (await built.prisma.user.findUniqueOrThrow({ where: { id: gmId } }))
      .openCampaignId;
    const { status, body } = await importArchive(built, gmCookie, res.rawPayload);
    expect(status).toBe(201);
    const result = body as unknown as ArchiveImportResult;
    expect(result.kind).toBe('campaign');
    expect(result.id).not.toBe(campaignA);
    // Ta sama nazwa już jest u tego MG — wczytana dostaje dopisek.
    expect(result.name).toMatch(/^Nocna zmiana \(z pliku \d\d\.\d\d\)$/);
    expect(result.note).toContain('Rogue');
    const fresh = result.id;

    // Nowa kampania nie otwiera się sama (decyzja MG 2).
    const gm = await built.prisma.user.findUniqueOrThrow({ where: { id: gmId } });
    expect(gm.openCampaignId).toBe(openBefore);
    const campaign = await built.prisma.campaign.findUniqueOrThrow({ where: { id: fresh } });
    expect(campaign).toMatchObject({ gmId, gameTime: 40_000_000, sessionStartedAt: null });
    expect(await built.prisma.campaignMember.count({ where: { campaignId: fresh } })).toBe(0);

    // Karty: komplet, gracz czeka, wzorzec i kopia powiązane, historia jest.
    const cards = await built.prisma.character.findMany({ where: { campaignId: fresh } });
    expect(cards.map((c) => c.name).sort()).toEqual(
      (await built.prisma.character.findMany({ where: { campaignId: campaignA } }))
        .map((c) => c.name)
        .sort(),
    );
    const byName = (name: string) => cards.find((c) => c.name === name)!;
    expect(byName('Kowal')).toMatchObject({ ownerId: null, pendingOwnerName: 'Rogue' });
    expect(byName('Ganger 1').templateId).toBe(byName('Ganger').id);
    expect(byName('Paser').portraitUrl).toBe(`/uploads/campaigns/${fresh}/portraits/bot_1.webp`);
    expect(existsSync(diskOf(byName('Paser').portraitUrl!))).toBe(true);
    expect(
      await built.prisma.ledgerEntry.count({ where: { characterId: byName('Kowal').id } }),
    ).toBe(1);

    // Scena: aktywna jak w pliku, figury na nowych kartach, gracz figury odpada.
    const freshScene = await built.prisma.scene.findFirstOrThrow({
      where: { campaignId: fresh, name: 'Magazyn' },
      include: { tokens: true, walls: true, accessPoints: true, defenseZones: true },
    });
    expect(freshScene.active).toBe(true);
    const kowal = freshScene.tokens.find((t) => t.name === 'Kowal')!;
    const wieza = freshScene.tokens.find((t) => t.name === 'Wieżyczka')!;
    expect(kowal).toMatchObject({ characterId: byName('Kowal').id, ownerId: null });
    expect(JSON.parse(kowal.statusData)).toEqual({ grappledBy: byName('Ganger 1').id });
    expect(wieza.characterId).toBe(byName('Ganger 1').id);

    // Sieć: drzwi na nowej ścianie, kamera na nowej figurze, punkt i strefa na nowej architekturze.
    const freshArch = await built.prisma.netArchitecture.findFirstOrThrow({
      where: { campaignId: fresh },
    });
    const devices = (
      JSON.parse(freshArch.data) as {
        branches: { floors: { devices: { wallId?: number; tokenId?: string }[] }[] }[];
      }
    ).branches[0]!.floors[0]!.devices;
    const freshDoor = freshScene.walls.find((w) => w.kind === 'door')!;
    expect(devices[0]!.wallId).toBe(freshDoor.id);
    expect(freshDoor.id).not.toBe(door.id);
    expect(devices[1]!.tokenId).toBe(wieza.id);
    expect(freshScene.accessPoints[0]!.architectureId).toBe(freshArch.id);
    const zone = freshScene.defenseZones[0]!;
    expect(zone).toMatchObject({ tokenId: wieza.id, architectureId: freshArch.id, deviceId: 'd2' });
    expect(JSON.parse(zone.exempt)).toEqual([kowal.id]);
    expect(JSON.parse(zone.sightings)).toEqual({ users: [playerId], tried: [byName('Kowal').id] });

    // Bot z relacją, sklep na karcie handlarza, tabele z podtabelą.
    const freshBot = await built.prisma.botProfile.findFirstOrThrow({
      where: { campaignId: fresh },
      include: { relations: true },
    });
    expect(freshBot).toMatchObject({ characterId: byName('Paser').id, sceneId: freshScene.id });
    expect(freshBot.relations).toEqual([
      expect.objectContaining({ characterId: byName('Kowal').id, value: 2, note: 'stały klient' }),
    ]);
    const shop = await built.prisma.merchant.findFirstOrThrow({ where: { campaignId: fresh } });
    expect(shop).toMatchObject({ characterId: byName('Paser').id, sign: 'Lombard', open: true });
    const tables = await built.prisma.randomTable.findMany({
      where: { campaignId: fresh },
      include: { rows: { orderBy: { position: 'asc' } } },
    });
    const loot = tables.find((t) => t.name === 'Łup')!;
    const detail = tables.find((t) => t.name === 'Łup — szczegół')!;
    expect(loot.rows.map((r) => r.text)).toEqual(['Nic', 'Coś']);
    expect(loot.rows[1]!.subTableId).toBe(detail.id);
    expect(loot.id).not.toBe(table.id);

    // Dziennik z przypiętym handoutem; wiedza do ponownego indeksu; udostępnienie
    // graczowi, którego tu nie ma, przepada.
    const freshEntry = await built.prisma.journalEntry.findFirstOrThrow({
      where: { campaignId: fresh },
      include: { handouts: true },
    });
    const freshHandout = await built.prisma.handout.findFirstOrThrow({
      where: { campaignId: fresh },
      include: { shares: true },
    });
    expect(freshEntry.handouts).toEqual([expect.objectContaining({ handoutId: freshHandout.id })]);
    expect(freshHandout.shares).toEqual([]);
    expect(freshHandout.body).toContain(`/uploads/campaigns/${fresh}/portraits/bot_1.webp`);
    const knowledge = await built.prisma.knowledgeEntry.findFirstOrThrow({
      where: { campaignId: fresh },
    });
    expect(knowledge.indexedDigest).toBeNull();
    // Czat jedzie w pliku do przeczytania, ale nie wjeżdża.
    expect(await built.prisma.chatMessage.count({ where: { campaignId: fresh } })).toBe(0);

    // Żaden wiersz nowej kampanii nie wskazuje wiersza kampanii A.
    const oldIds = [
      ...(await built.prisma.character.findMany({ where: { campaignId: campaignA } })),
      ...(await built.prisma.scene.findMany({ where: { campaignId: campaignA } })),
      ...(await built.prisma.token.findMany({ where: { scene: { campaignId: campaignA } } })),
      ...(await built.prisma.botProfile.findMany({ where: { campaignId: campaignA } })),
      ...(await built.prisma.netArchitecture.findMany({ where: { campaignId: campaignA } })),
      ...(await built.prisma.randomTable.findMany({ where: { campaignId: campaignA } })),
      ...(await built.prisma.handout.findMany({ where: { campaignId: campaignA } })),
      ...(await built.prisma.journalEntry.findMany({ where: { campaignId: campaignA } })),
    ].map((row) => row.id);
    const dump = JSON.stringify(
      await built.prisma.campaign.findUniqueOrThrow({
        where: { id: fresh },
        include: {
          characters: { include: { ledger: true, advancement: true, relations: true } },
          scenes: {
            include: { tokens: true, walls: true, accessPoints: true, defenseZones: true },
          },
          bots: { include: { relations: true } },
          architectures: true,
          randomTables: { include: { rows: true } },
          journal: { include: { handouts: true } },
          handouts: true,
          merchants: true,
          knowledge: true,
        },
      }),
    );
    expect(oldIds.filter((id) => dump.includes(id))).toEqual([]);
    expect(dump).not.toContain(`/uploads/campaigns/${campaignA}/`);
  });

  it('karta czekająca na gracza przechodzi do niego z linkiem „Nowy gracz”', async () => {
    const fresh = (await built.prisma.campaign.findFirstOrThrow({
      where: { name: { startsWith: 'Nocna zmiana (z pliku' } },
    }))!.id;
    const card = await built.prisma.character.findFirstOrThrow({
      where: { campaignId: fresh, name: 'Kowal' },
    });
    const listed = await built.app.inject({
      method: 'GET',
      url: '/api/campaigns',
      headers: { cookie: gmCookie },
    });
    const detail = (listed.json() as { id: string; pendingCards: unknown[] }[]).find(
      (c) => c.id === fresh,
    )!;
    // Iskra z testu portretu też czeka na Rogue'a — lista ma obie.
    expect(detail.pendingCards).toContainEqual({
      id: card.id,
      name: 'Kowal',
      pendingOwner: 'Rogue',
    });

    const refused = await built.app.inject({
      method: 'POST',
      url: `/api/campaigns/${fresh}/invitations`,
      headers: { cookie: gmCookie },
      payload: { name: 'Marek', characterId: 'nie-ma-takiej' },
    });
    expect(refused.statusCode).toBe(404);

    const invite = await built.app.inject({
      method: 'POST',
      url: `/api/campaigns/${fresh}/invitations`,
      headers: { cookie: gmCookie },
      payload: { name: 'Marek', characterId: card.id },
    });
    expect(invite.statusCode).toBe(201);
    const { token, characterId } = invite.json() as { token: string; characterId: string };
    expect(characterId).toBe(card.id);
    const joined = await built.app.inject({ method: 'POST', url: `/api/join/${token}` });
    expect(joined.statusCode).toBe(200);
    const marek = (joined.json() as { user: { id: string } }).user.id;

    const after = await built.prisma.character.findUniqueOrThrow({ where: { id: card.id } });
    expect(after).toMatchObject({ ownerId: marek, pendingOwnerName: null, pendingOwnerId: null });
    // Figura karty idzie za kartą, jak przy przypisaniu z nagłówka.
    const figure = await built.prisma.token.findFirstOrThrow({ where: { characterId: card.id } });
    expect(figure.ownerId).toBe(marek);
  });

  it('stary zrzut JSON z etapu 33 też wchodzi jako nowa kampania', async () => {
    await openAt(campaignA);
    const res = await built.app.inject({
      method: 'GET',
      url: '/api/archive/campaign?chat=0',
      headers: { cookie: gmCookie },
    });
    const file = await readPackage<CampaignArchive>(res.rawPayload);
    const { status, body } = await importArchive(built, gmCookie, {
      manifest: file.manifest,
      payload: file.payload,
    });
    expect(status).toBe(201);
    const fresh = (body as unknown as ArchiveImportResult).id;
    expect(await built.prisma.character.count({ where: { campaignId: fresh } })).toBe(
      file.payload.characters.length,
    );
    // Plik z etapu 33 nie niesie grafik — portret z kampanii tego MG kopiuje
    // `localizeArchiveUploads`, jak przy karcie i scenie.
    const paser = await built.prisma.character.findFirstOrThrow({
      where: { campaignId: fresh, name: 'Paser' },
    });
    expect(paser.portraitUrl).toBe(`/uploads/campaigns/${fresh}/portraits/bot_1.webp`);
  });
});

describe('odmowy paczki', () => {
  let good: Awaited<ReturnType<typeof downloadPackage<SceneArchive>>>;

  beforeAll(async () => {
    await openAt(campaignA);
    const url = seedFile(campaignA, 'maps', 'odmowa_1.webp', randomBytes(4096));
    const scene = await built.prisma.scene.create({
      data: { campaignId: campaignA, name: 'Odmowy', backgroundUrl: url },
    });
    good = await downloadPackage<SceneArchive>(built, `/api/archive/scene/${scene.id}`, gmCookie);
  });

  const scenesNamed = () => built.prisma.scene.count({ where: { name: 'Odmowy' } });
  const refused = async (zip: Buffer, error: string, status = 400) => {
    const before = await scenesNamed();
    const res = await importArchive(built, gmCookie, zip);
    expect(res).toEqual({ status, body: { error } });
    expect(await scenesNamed()).toBe(before);
  };

  it('plik spoza listy w manifeście', async () => {
    const zip = await zipOf([
      { path: 'manifest.json', data: JSON.stringify(good.manifest) },
      { path: 'data.json', data: JSON.stringify(good.payload) },
      ...[...good.files].map(([path, data]) => ({ path, data })),
      { path: 'files/tokens/obcy_1.webp', data: randomBytes(16) },
    ]);
    await refused(zip, 'ARCHIVE_PACKAGE_UNLISTED');
  });

  it('plik niezgodny ze skrótem z manifestu', async () => {
    const manifest = structuredClone(good.manifest);
    manifest.entries[0]!.sha256 = 'f'.repeat(64);
    const zip = await zipOf([
      { path: 'manifest.json', data: JSON.stringify(manifest) },
      { path: 'data.json', data: JSON.stringify(good.payload) },
      ...[...good.files].map(([path, data]) => ({ path, data })),
    ]);
    await refused(zip, 'ARCHIVE_PACKAGE_CORRUPT');
  });

  it('ścieżka wychodząca poza katalog (zip slip)', async () => {
    // yazl nie zapisze `..` — podmieniamy nazwę w gotowych bajtach (ta sama długość).
    const safe = 'files/maps/zipslip_1.webp';
    const evil = '../../../../zipslip1.webp';
    expect(evil.length).toBe(safe.length);
    const zip = await zipOf([
      { path: 'manifest.json', data: JSON.stringify(good.manifest) },
      { path: 'data.json', data: JSON.stringify(good.payload) },
      { path: safe, data: randomBytes(16) },
    ]);
    const patched = Buffer.from(zip.toString('latin1').split(safe).join(evil), 'latin1');
    await refused(patched, 'ARCHIVE_PACKAGE_UNSAFE_PATH');
    expect(existsSync(join(tmpdir(), 'zipslip1.webp'))).toBe(false);
  });

  it('uszkodzony ZIP i plik ponad limit', async () => {
    const zip = await repack(good);
    await refused(zip.subarray(0, zip.length - 40), 'ARCHIVE_PACKAGE_CORRUPT');
    const huge = Buffer.concat([Buffer.from('PK\u0003\u0004'), randomBytes(IMPORT_MAX_BYTES + 10)]);
    await refused(huge, 'ARCHIVE_PACKAGE_TOO_LARGE', 413);
  });

  it('dobra paczka po tym wszystkim dalej wchodzi', async () => {
    const res = await importArchive(built, gmCookie, await repack(good));
    expect(res.status).toBe(201);
  });
});
