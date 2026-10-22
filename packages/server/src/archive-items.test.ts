import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ArchiveImportResult, CampaignSummary, CardSubmissionEntry } from '@vtt/shared';
import { CARD_SUBMISSION_PATHS } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { createSession, SESSION_COOKIE } from './auth/sessions.js';
import { TEST_ADMIN } from './test-admin.js';
import { joinUrl } from './test-join.js';
import { patternPng } from './test-images.js';
import type { CharacterArchive } from './archive.js';
import type { BotArchive, PlayerCardsArchive, ShopArchive } from './archive-items.js';
import { downloadPackage, importArchive, multipartFile, repack } from './test-archive.js';

/**
 * Pojedyncze rzeczy i karta gracza (etap 57c).
 *
 *  - gracz pobiera kopię własnej karty (z portretem), cudzej nie,
 *  - zgłasza ją w drugiej kampanii tego samego MG, MG przyjmuje — karta
 *    z portretem jest u gracza; odrzucenie sprząta poczekalnię; w walce odmowa,
 *  - sklep i bot przeniesione do drugiej kampanii działają (towar z nakładką,
 *    osobowość, relacje po imieniu),
 *  - karty graczy jedną paczką.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const SUBMISSIONS = mkdtempSync(join(tmpdir(), 'vtt-submissions-'));

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
  cardSubmissionsDir: SUBMISSIONS,
};

let built: BuiltApp;
let gmCookie: string;
let gmId: string;
let campaignA: string;
let campaignB: string;
/** Gracz w A (konto A) i ten sam człowiek w B (nowe konto z linku B). */
let rogueA: { id: string; cookie: string };
let rogueB: { id: string; cookie: string };
let otherA: { id: string; cookie: string };
let kiraId: string;
let portraitUrl: string;

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

async function openAt(campaignId: string): Promise<void> {
  await built.prisma.user.update({ where: { id: gmId }, data: { openCampaignId: campaignId } });
}

async function joinAs(campaignId: string, name: string): Promise<{ id: string; cookie: string }> {
  const res = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, name),
  });
  const id = (res.json() as { user: { id: string } }).user.id;
  const session = await createSession(built.prisma, id, 1);
  return { id, cookie: `${SESSION_COOKIE}=${built.app.signCookie(session.id)}` };
}

async function get(url: string, cookie: string) {
  return built.app.inject({ method: 'GET', url, headers: { cookie } });
}

async function submit(cookie: string, zip: Buffer) {
  const { payload, headers } = multipartFile('karta.zip', zip);
  const res = await built.app.inject({
    method: 'POST',
    url: CARD_SUBMISSION_PATHS.submit,
    headers: { ...headers, cookie },
    payload,
  });
  return { status: res.statusCode, body: res.json() as Record<string, unknown> };
}

async function respond(messageId: number, action: 'accept' | 'refuse', cookie = gmCookie) {
  const res = await built.app.inject({
    method: 'POST',
    url: CARD_SUBMISSION_PATHS.respond(messageId),
    headers: { cookie },
    payload: { action },
  });
  return { status: res.statusCode, body: res.json() as Record<string, unknown> };
}

async function entryOf(messageId: number): Promise<CardSubmissionEntry> {
  const row = await built.prisma.chatMessage.findUniqueOrThrow({ where: { id: messageId } });
  return JSON.parse(row.payload!) as CardSubmissionEntry;
}

/** Paczka karty Kiry pobrana przez jej gracza w A. */
async function kiraPackage(): Promise<Buffer> {
  return repack(
    await downloadPackage<CharacterArchive>(
      built,
      `/api/archive/character/${kiraId}`,
      rogueA.cookie,
    ),
  );
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
  campaignB = await createCampaign('Druga zmiana');
  rogueA = await joinAs(campaignA, 'Rogue');
  otherA = await joinAs(campaignA, 'Vex');
  rogueB = await joinAs(campaignB, 'Rogue');

  const dir = join(config.uploadsDir, 'campaigns', campaignA, 'portraits');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'kira.png'), await patternPng(64));
  portraitUrl = `/uploads/campaigns/${campaignA}/portraits/kira.png`;
  kiraId = (
    await built.prisma.character.create({
      data: {
        campaignId: campaignA,
        name: 'Kira',
        ownerId: rogueA.id,
        portraitUrl,
        data: JSON.stringify({ roleId: 'solo', roleAbilityRank: 4 }),
      },
    })
  ).id;
}, 60_000);

afterAll(async () => {
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows potrafi jeszcze trzymać plik
  }
});

describe('gracz: kopia własnej karty', () => {
  it('pobiera swoją kartę z portretem, cudzej nie widzi', async () => {
    const file = await downloadPackage<CharacterArchive>(
      built,
      `/api/archive/character/${kiraId}`,
      rogueA.cookie,
    );
    expect(file.payload.name).toBe('Kira');
    expect(file.payload.owner).toEqual({ id: rogueA.id, name: 'Rogue' });
    expect(file.manifest.entries.map((entry) => entry.url)).toEqual([portraitUrl]);
    // Cudza karta wygląda jak nieistniejąca — także dla gracza tej samej kampanii.
    expect((await get(`/api/archive/character/${kiraId}`, otherA.cookie)).statusCode).toBe(404);
    expect((await get(`/api/archive/character/${kiraId}`, rogueB.cookie)).statusCode).toBe(404);
    // Pozostałe pobrania są dalej wyłącznie MG.
    expect((await get('/api/archive/players', rogueA.cookie)).statusCode).toBe(403);
  });
});

describe('gracz: zgłoszenie karty do wczytania', () => {
  it('zgłoszenie → MG przyjmuje → karta z portretem jest u gracza w B', async () => {
    const zip = await kiraPackage();
    const sent = await submit(rogueB.cookie, zip);
    expect(sent.status).toBe(201);
    const messageId = sent.body.messageId as number;
    const entry = await entryOf(messageId);
    expect(entry).toMatchObject({
      userId: rogueB.id,
      userName: 'Rogue',
      name: 'Kira',
      roleRank: 4,
      hasPortrait: true,
      status: 'open',
    });
    // Do decyzji MG karty w kampanii nie ma — jest tylko w poczekalni.
    expect(await built.prisma.character.count({ where: { campaignId: campaignB } })).toBe(0);
    expect(readdirSync(SUBMISSIONS)).toContain(entry.submissionId);

    // Podgląd portretu: MG kampanii i zgłaszający tak, inni nie.
    const portrait = CARD_SUBMISSION_PATHS.portrait(entry.submissionId);
    expect((await get(portrait, gmCookie)).statusCode).toBe(200);
    expect((await get(portrait, rogueB.cookie)).statusCode).toBe(200);
    expect((await get(portrait, otherA.cookie)).statusCode).toBe(404);

    // Drugie zgłoszenie czeka na pierwsze; gracz sam nie przyjmie.
    expect((await submit(rogueB.cookie, zip)).body.error).toBe('SUBMISSION_PENDING');
    expect((await respond(messageId, 'accept', rogueB.cookie)).status).toBe(403);

    const accepted = await respond(messageId, 'accept');
    expect(accepted.status).toBe(200);
    const card = await built.prisma.character.findUniqueOrThrow({
      where: { id: accepted.body.characterId as string },
    });
    expect(card).toMatchObject({ campaignId: campaignB, ownerId: rogueB.id, playReady: true });
    expect(card.portraitUrl).toMatch(new RegExp(`^/uploads/campaigns/${campaignB}/portraits/`));
    expect(existsSync(join(config.uploadsDir, ...card.portraitUrl!.split('/').slice(2)))).toBe(
      true,
    );
    expect((await get(card.portraitUrl!, rogueB.cookie)).statusCode).toBe(200);
    expect(await entryOf(messageId)).toMatchObject({ status: 'accepted', characterId: card.id });
    expect(readdirSync(SUBMISSIONS)).not.toContain(entry.submissionId);
    // Rozstrzygnięte zostaje rozstrzygnięte.
    expect((await respond(messageId, 'refuse')).body.error).toBe('SUBMISSION_CLOSED');
  });

  it('odrzucenie sprząta plik z poczekalni i nie zakłada karty', async () => {
    const before = await built.prisma.character.count({ where: { campaignId: campaignB } });
    const sent = await submit(rogueB.cookie, await kiraPackage());
    const messageId = sent.body.messageId as number;
    const { submissionId } = await entryOf(messageId);
    expect(readdirSync(SUBMISSIONS)).toContain(submissionId);
    expect((await respond(messageId, 'refuse')).status).toBe(200);
    expect(await entryOf(messageId)).toMatchObject({ status: 'refused', byName: 'MG' });
    expect(readdirSync(SUBMISSIONS)).not.toContain(submissionId);
    expect(await built.prisma.character.count({ where: { campaignId: campaignB } })).toBe(before);
  });

  it('w trwającym starciu gracz karty nie zgłasza; MG nie zgłasza wcale', async () => {
    const scene = await built.prisma.scene.create({
      data: { campaignId: campaignB, name: 'Ring' },
    });
    const combat = await built.prisma.combat.create({ data: { sceneId: scene.id } });
    const zip = await kiraPackage();
    expect(await submit(rogueB.cookie, zip)).toEqual({
      status: 409,
      body: { error: 'COMBAT_LOCKED' },
    });
    await built.prisma.combat.delete({ where: { id: combat.id } });
    expect((await submit(gmCookie, zip)).status).toBe(403);
  });

  it('paczka innego rodzaju niż karta — odmowa', async () => {
    await openAt(campaignA);
    const scene = await built.prisma.scene.create({ data: { campaignId: campaignA, name: 'X' } });
    const scenePackage = repack(
      await downloadPackage(built, `/api/archive/scene/${scene.id}`, gmCookie),
    );
    expect((await submit(rogueB.cookie, await scenePackage)).body.error).toBe('ARCHIVE_WRONG_KIND');
  });
});

describe('MG: sklep, bot i karty graczy do drugiej kampanii', () => {
  it('sklep wchodzi z kartą handlarza, towarem i nakładką MG — zamknięty', async () => {
    const handler = await built.prisma.character.create({
      data: {
        campaignId: campaignA,
        name: 'Paser',
        data: JSON.stringify({
          gear: [{ id: 'g1', name: 'Latarka', quantity: 3 }],
        }),
      },
    });
    const merchant = await built.prisma.merchant.create({
      data: {
        campaignId: campaignA,
        characterId: handler.id,
        sign: 'Spod lady',
        open: true,
        access: 'remote',
        priceMul: 120,
        rows: JSON.stringify({ 'gear:g1': { hidden: true } }),
      },
    });
    const file = await downloadPackage<ShopArchive>(
      built,
      `/api/archive/shop/${merchant.id}`,
      gmCookie,
    );
    expect(file.manifest.kind).toBe('shop');
    await openAt(campaignB);
    const { status, body } = await importArchive(built, gmCookie, await repack(file));
    expect(status).toBe(201);
    const result = body as unknown as ArchiveImportResult;
    expect(result).toMatchObject({ kind: 'shop', name: 'Spod lady' });
    const shop = await built.prisma.merchant.findUniqueOrThrow({
      where: { id: result.id },
      include: { character: true },
    });
    expect(shop).toMatchObject({
      campaignId: campaignB,
      open: false,
      access: 'remote',
      priceMul: 120,
    });
    expect(JSON.parse(shop.rows)).toEqual({ 'gear:g1': { hidden: true } });
    expect(shop.character).toMatchObject({ campaignId: campaignB, name: 'Paser', ownerId: null });
    const gear = (JSON.parse(shop.character.data) as { gear: { id: string; name: string }[] }).gear;
    expect(gear.map((row) => [row.id, row.name])).toContainEqual(['g1', 'Latarka']);
  });

  it('bot wchodzi z osobowością, relacje wracają do postaci o tym imieniu', async () => {
    const vexA = await built.prisma.character.create({
      data: { campaignId: campaignA, name: 'Vex', ownerId: otherA.id },
    });
    const bot = await built.prisma.botProfile.create({
      data: {
        campaignId: campaignA,
        name: 'Rzeźnik',
        active: true,
        characterId: kiraId,
        data: JSON.stringify({
          type: 'npc',
          persona: { personality: 'Mrukliwy', motivations: '', secrets: '', speechStyle: '' },
          controllerUserId: otherA.id,
        }),
      },
    });
    await built.prisma.botRelation.createMany({
      data: [
        { botId: bot.id, characterId: kiraId, value: 2, note: 'Uratowała mu skórę' },
        { botId: bot.id, characterId: vexA.id, value: -1, note: 'Dług' },
      ],
    });

    await openAt(campaignA);
    const file = await downloadPackage<BotArchive>(built, `/api/archive/bot/${bot.id}`, gmCookie);
    expect(file.payload.relations).toHaveLength(2);
    await openAt(campaignB);
    const { status, body } = await importArchive(built, gmCookie, await repack(file));
    expect(status).toBe(201);
    const result = body as unknown as ArchiveImportResult;
    expect(result.note).toContain('Vex');

    const copy = await built.prisma.botProfile.findUniqueOrThrow({
      where: { id: result.id },
      include: { relations: { include: { character: true } } },
    });
    const kiraB = await built.prisma.character.findFirstOrThrow({
      where: { campaignId: campaignB, name: 'Kira' },
    });
    expect(copy).toMatchObject({ campaignId: campaignB, active: false, characterId: kiraB.id });
    const data = JSON.parse(copy.data) as {
      persona: { personality: string };
      controllerUserId: string | null;
    };
    expect(data.persona.personality).toBe('Mrukliwy');
    // Sterujący z A nie siedzi w B — konto nie przechodzi.
    expect(data.controllerUserId).toBeNull();
    expect(copy.relations.map((row) => [row.character.name, row.value, row.note])).toEqual([
      ['Kira', 2, 'Uratowała mu skórę'],
    ]);
  });

  it('karty graczy jedną paczką: w B wraca do gracza, reszta czeka', async () => {
    await openAt(campaignA);
    const file = await downloadPackage<PlayerCardsArchive>(built, '/api/archive/players', gmCookie);
    expect(file.manifest.kind).toBe('characters');
    // Kira i Vex mają graczy; Paser (sklep) to NPC i nie jedzie.
    expect(file.payload.characters.map((card) => card.name).sort()).toEqual(['Kira', 'Vex']);
    expect(file.manifest.entries.map((entry) => entry.url)).toContain(portraitUrl);

    await openAt(campaignB);
    const before = await built.prisma.character.count({ where: { campaignId: campaignB } });
    const { status, body } = await importArchive(built, gmCookie, await repack(file));
    expect(status).toBe(201);
    expect(body.kind).toBe('characters');
    const fresh = await built.prisma.character.findMany({
      where: { campaignId: campaignB },
      orderBy: { createdAt: 'asc' },
      skip: before,
    });
    // Konta z A nie siedzą w B — obie karty czekają na gracza po imieniu.
    expect(fresh.map((card) => [card.name, card.ownerId, card.pendingOwnerName])).toEqual([
      ['Kira', null, 'Rogue'],
      ['Vex', null, 'Vex'],
    ]);
  });

  it('cudzy sklep i bot wyglądają jak nieistniejące', async () => {
    expect((await get('/api/archive/shop/nie-ma', gmCookie)).statusCode).toBe(404);
    expect((await get('/api/archive/bot/nie-ma', gmCookie)).statusCode).toBe(404);
  });
});
