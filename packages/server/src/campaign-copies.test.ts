import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  ArchiveImportResult,
  CampaignCopyListView,
  CampaignRollbackResult,
  CampaignSummary,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import { CAMPAIGN_COPY_PATHS } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';
import { downloadPackage, importArchive, repack } from './test-archive.js';
import type { CampaignArchive } from './archive.js';

/**
 * Kopie kampanii i cofnięcie (etap 57b) — szew między sesją, dyskiem i bazą.
 *
 * Czysty plan rotacji jest w `shared` (`campaign-copies.test.ts`); tutaj:
 * że start i koniec sesji (każdą drogą) zostawiają kopie, że zegar sesji
 * dokłada kopię co godzinę, że po 11 sesjach zostaje 10, że cofnięcie wymienia
 * zawartość gry, a zostawia graczy, czat, zaproszenia i id kart, i że stara
 * zawartość jest w kampanii „przed cofnięciem”, którą MG może usunąć.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const CAMPAIGN = 'Noc w Watsonie';
const MINUTE = 60_000;

const backupDir = mkdtempSync(join(tmpdir(), 'vtt-backups-'));
const config: ServerConfig = {
  port: 0,
  host: '127.0.0.1',
  clientOrigin: 'http://localhost:5173',
  databaseUrl: `file:${TEST_DB}`,
  gmName: 'MG',
  gmPassword: GM_PASSWORD,
  cookieSecret: 'test-cookie-secret',
  sessionTtlDays: 1,
  uploadsDir: mkdtempSync(join(tmpdir(), 'vtt-uploads-')),
  dataPublicDir: resolve(import.meta.dirname, '../../../data/public'),
  dataPrivateDir: resolve(import.meta.dirname, 'fixtures/no-private-data'),
  aiGatewayUrl: 'http://127.0.0.1:1',
  aiGatewayApiKey: '',
  aiHealthIntervalMs: 60_000,
  aiRequestTimeoutMs: 1000,
  sessions: { maxSessions: 2, emptyMinutes: 720, idleMinutes: 720 },
  // Kopie bazy wyłączone (`intervalMinutes: 0`), kopie kampanii — włączone.
  backups: {
    dir: backupDir,
    intervalMinutes: 0,
    keepHourly: 24,
    keepDaily: 14,
    campaignKeepSessions: 10,
    campaignIntervalMinutes: 60,
  },
};

let now = Date.parse('2026-10-22T18:00:00Z');
const clock = () => now;

let built: BuiltApp;
let baseUrl: string;
let gmCookie: string;
let gmId: string;
let campaignId: string;
let playerId: string;
let playerCookie: string;
let gmSocket: ClientSocket;
/** Kopia ze startu sesji, do której cofa `cofnięcie`. */
let startCopy: string;
let portrait: string;
const openSockets: ClientSocket[] = [];

function cookieOf(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error('missing set-cookie header');
  return raw.split(';')[0]!;
}

function connect(cookie: string): Promise<ClientSocket> {
  const socket = ioClient(baseUrl, { extraHeaders: { cookie }, reconnection: false });
  openSockets.push(socket);
  return new Promise((res, rej) => {
    socket.once('connect', () => res(socket));
    socket.once('connect_error', rej);
  });
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`${event} ack timeout`)), 5000);
    socket.emit(event, payload, (response: SocketAck<T>) => {
      clearTimeout(timer);
      res(response);
    });
  });
}

const copies = () => built.realtime.deps.ctx.copies!;

async function playSession(minutes = 30): Promise<void> {
  expect((await emitAck(gmSocket, 'session:start', { campaignId })).ok).toBe(true);
  now += minutes * MINUTE;
  expect((await emitAck(gmSocket, 'session:end', { campaignId })).ok).toBe(true);
  now += MINUTE;
  await copies().settled();
}

async function listView(cookie = gmCookie): Promise<CampaignCopyListView> {
  const res = await built.app.inject({
    method: 'GET',
    url: CAMPAIGN_COPY_PATHS.list,
    headers: { cookie },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as CampaignCopyListView;
}

async function restore(name: string, confirm: string) {
  return built.app.inject({
    method: 'POST',
    url: CAMPAIGN_COPY_PATHS.restore(name),
    headers: { cookie: gmCookie },
    payload: { confirm },
  });
}

/** Plik w katalogu kampanii, jakby go wgrano — zwraca adres. */
function seedFile(dir: string, name: string): string {
  const directory = join(config.uploadsDir, 'campaigns', campaignId, dir);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, name), randomBytes(1024));
  return `/uploads/campaigns/${campaignId}/${dir}/${name}`;
}

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: 'pipe',
  });
  built = await buildApp(config, { logger: false, clock, sweepUploads: false });
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const address = built.app.server.address();
  if (address === null || typeof address === 'string') throw new Error('no server address');
  baseUrl = `http://127.0.0.1:${address.port}`;

  const login = await built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: 'MG', password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);
  gmId = (login.json() as { user: { id: string } }).user.id;
  const created = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: CAMPAIGN },
  });
  campaignId = (created.json() as CampaignSummary).id;
  const joined = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Rogue'),
  });
  playerCookie = cookieOf(joined.headers['set-cookie']);
  playerId = (joined.json() as { user: { id: string } }).user.id;
  gmSocket = await connect(gmCookie);
}, 60_000);

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows potrafi jeszcze trzymać plik
  }
});

describe('kopie przy sesji', () => {
  it('start i koniec sesji zostawiają dwie kopie tej samej sesji', async () => {
    expect((await listView()).copies).toEqual([]);
    await playSession();
    const view = await listView();
    expect(view).toMatchObject({ enabled: true, campaignName: CAMPAIGN, sessionRunning: false });
    expect(view.copies.map((copy) => copy.reason)).toEqual(['end', 'start']);
    const [end, start] = view.copies;
    expect(start!.sessionStartedAt).not.toBeNull();
    expect(end!.sessionStartedAt).toBe(start!.sessionStartedAt);
    // Kopia nie niesie czatu, a niesie walki — to kopia do cofania, nie do czytania.
    const data = (await copies().read(campaignId, start!.name))!.file.payload as CampaignArchive;
    expect(data.chat).toBeNull();
    expect(data.combats).toEqual([]);
  });

  it('w trakcie sesji zegar dokłada kopię co godzinę', async () => {
    expect((await emitAck(gmSocket, 'session:start', { campaignId })).ok).toBe(true);
    await copies().settled();
    now += 59 * MINUTE;
    await built.realtime.sweepSessions();
    await copies().settled();
    expect((await listView()).copies.filter((copy) => copy.reason === 'hourly')).toHaveLength(0);
    now += 2 * MINUTE;
    await built.realtime.sweepSessions();
    await copies().settled();
    const hourly = (await listView()).copies.filter((copy) => copy.reason === 'hourly');
    expect(hourly).toHaveLength(1);
    expect(hourly[0]!.sessionStartedAt).toBe(new Date(now - 61 * MINUTE).toISOString());
    expect((await listView()).sessionRunning).toBe(true);

    // Koniec sesji z panelu administratora to ta sama droga — też zostawia kopię.
    const { endSession } = await import('./realtime/sessions.js');
    await endSession(built.realtime.deps, campaignId, 'admin');
    await copies().settled();
    expect((await listView()).copies[0]!.reason).toBe('end');
  });

  it('po 11 sesjach zostają kopie z 10 ostatnich', async () => {
    // Dwie sesje już były; dziewięć kolejnych daje jedenaście.
    for (let n = 0; n < 9; n += 1) await playSession();
    const sessions = new Set((await listView()).copies.map((copy) => copy.sessionStartedAt));
    expect(sessions.size).toBe(10);
    expect(readdirSync(copies().dirOf(campaignId)).some((name) => name.endsWith('.partial'))).toBe(
      false,
    );
  });

  it('gracz nie widzi kopii ani nie cofa', async () => {
    const list = await built.app.inject({
      method: 'GET',
      url: CAMPAIGN_COPY_PATHS.list,
      headers: { cookie: playerCookie },
    });
    expect(list.statusCode).toBe(403);
    const name = (await listView()).copies[0]!.name;
    const back = await built.app.inject({
      method: 'POST',
      url: CAMPAIGN_COPY_PATHS.restore(name),
      headers: { cookie: playerCookie },
      payload: { confirm: CAMPAIGN },
    });
    expect(back.statusCode).toBe(403);
  });
});

describe('cofnięcie', () => {
  let cardId: string;
  let sceneId: string;
  let tokenId: string;
  let rollback: CampaignRollbackResult;

  it('odmawia w trakcie sesji, bez nazwy i dla nieistniejącej kopii', async () => {
    const name = (await listView()).copies[0]!.name;
    expect((await emitAck(gmSocket, 'session:start', { campaignId })).ok).toBe(true);
    const running = await restore(name, CAMPAIGN);
    expect(running.statusCode).toBe(409);
    expect(running.json()).toEqual({ error: 'SESSION_ACTIVE' });
    expect((await emitAck(gmSocket, 'session:end', { campaignId })).ok).toBe(true);
    await copies().settled();

    const wrongName = await restore(name, 'Noc w Wats');
    expect(wrongName.statusCode).toBe(400);
    expect(wrongName.json()).toEqual({ error: 'CONFIRM_MISMATCH' });
    const missing = await restore('copy-20200101-000000-000-start', CAMPAIGN);
    expect(missing.statusCode).toBe(404);
    const outside = await restore('..', CAMPAIGN);
    expect(outside.statusCode).toBe(404);
  });

  it('wraca stan gry sprzed sesji, a gracze, czat i id zostają', async () => {
    portrait = seedFile('portraits', 'iskra_1.webp');
    const card = await built.prisma.character.create({
      data: {
        campaignId,
        name: 'Iskra',
        ownerId: playerId,
        portraitUrl: portrait,
        data: JSON.stringify({ notes: 'przed sesją' }),
      },
    });
    cardId = card.id;
    const scene = await built.prisma.scene.create({
      data: { campaignId, name: 'Bar Watson', active: true },
    });
    sceneId = scene.id;
    const token = await built.prisma.token.create({
      data: { sceneId, name: 'Iskra', characterId: cardId, ownerId: playerId, x: 1, y: 1 },
    });
    tokenId = token.id;
    const bot = await built.prisma.botProfile.create({
      data: { campaignId, name: 'Barman', sceneId },
    });
    const combat = await built.prisma.combat.create({
      data: { sceneId, round: 2, combatants: { create: [{ tokenId, initiative: 14 }] } },
      include: { combatants: true },
    });
    await built.prisma.combat.update({
      where: { id: combat.id },
      data: { activeCombatantId: combat.combatants[0]!.id },
    });
    const invitation = await built.prisma.invitation.findFirstOrThrow({ where: { campaignId } });

    // Sesja: karta i scena się zmieniają, przybywa scena, padają słowa na czacie.
    expect((await emitAck(gmSocket, 'session:start', { campaignId })).ok).toBe(true);
    await copies().settled();
    startCopy = (await listView()).copies[0]!.name;
    await built.prisma.character.update({
      where: { id: cardId },
      data: { data: JSON.stringify({ notes: 'po sesji' }) },
    });
    await built.prisma.combat.delete({ where: { id: combat.id } });
    await built.prisma.scene.create({ data: { campaignId, name: 'Nowa scena' } });
    const line = await built.prisma.chatMessage.create({
      data: {
        campaignId,
        authorId: gmId,
        kind: 'say',
        text: 'Barman nalewa.',
        botId: bot.id,
        sceneId,
      },
    });
    const chatBefore = await built.prisma.chatMessage.count({ where: { campaignId } });
    const revisionBefore = (
      await built.prisma.character.findUniqueOrThrow({ where: { id: cardId } })
    ).revision;
    now += 30 * MINUTE;
    expect((await emitAck(gmSocket, 'session:end', { campaignId })).ok).toBe(true);
    await copies().settled();

    const res = await restore(startCopy, '  noc w watsonie ');
    expect(res.statusCode).toBe(200);
    rollback = res.json() as CampaignRollbackResult;
    expect(rollback.copy.name).toBe(startCopy);
    expect(rollback.previous.name).toMatch(/^Noc w Watsonie \(przed cofnięciem \d\d\.\d\d\)$/);

    // Ta sama karta, ten sam gracz, stan sprzed sesji.
    const back = await built.prisma.character.findUniqueOrThrow({ where: { id: cardId } });
    expect(back.campaignId).toBe(campaignId);
    expect(back.ownerId).toBe(playerId);
    expect((JSON.parse(back.data) as { notes: string }).notes).toBe('przed sesją');
    expect(back.portraitUrl).toBe(portrait);
    // Rewizja rośnie — klient z kartą sprzed cofnięcia przyjmie tę z kopii (#49).
    expect(back.revision).toBeGreaterThan(revisionBefore);
    const portraitRes = await built.app.inject({
      method: 'GET',
      url: portrait,
      headers: { cookie: gmCookie },
    });
    expect(portraitRes.statusCode).toBe(200);
    const scenes = await built.prisma.scene.findMany({ where: { campaignId } });
    expect(scenes.map((row) => row.name).sort()).toEqual(['Bar Watson']);
    const backToken = await built.prisma.token.findUniqueOrThrow({ where: { id: tokenId } });
    expect(backToken).toMatchObject({ sceneId, characterId: cardId, ownerId: playerId });
    // Walka trwała między sesjami — wraca razem z kolejką.
    const backCombat = await built.prisma.combat.findUniqueOrThrow({
      where: { sceneId },
      include: { combatants: true },
    });
    expect(backCombat).toMatchObject({ id: combat.id, round: 2 });
    expect(backCombat.activeCombatantId).toBe(combat.combatants[0]!.id);
    expect(backCombat.combatants[0]).toMatchObject({ tokenId, initiative: 14 });

    // Tożsamość: gracze, zaproszenia, czat (komplet i ze wskazaniami).
    expect(
      await built.prisma.campaignMember.findMany({
        where: { campaignId },
        select: { userId: true },
      }),
    ).toEqual([{ userId: playerId }]);
    expect(
      await built.prisma.invitation.findUnique({ where: { id: invitation.id } }),
    ).not.toBeNull();
    expect(await built.prisma.chatMessage.count({ where: { campaignId } })).toBeGreaterThanOrEqual(
      chatBefore,
    );
    expect(
      await built.prisma.chatMessage.findUniqueOrThrow({ where: { id: line.id } }),
    ).toMatchObject({ botId: bot.id, sceneId });
    // Kopia bezpieczeństwa stanu sprzed cofnięcia jest na liście.
    const view = await listView();
    expect(view.copies.find((copy) => copy.name === rollback.safetyCopy)?.reason).toBe('rollback');
  });

  it('stan sprzed cofnięcia jest w osobnej kampanii bez graczy', async () => {
    const previous = await built.prisma.campaign.findUniqueOrThrow({
      where: { id: rollback.previous.id },
      include: { members: true, characters: true, scenes: true },
    });
    expect(previous.gmId).toBe(gmId);
    expect(previous.members).toEqual([]);
    expect(previous.scenes.map((row) => row.name).sort()).toEqual(['Bar Watson', 'Nowa scena']);
    const card = previous.characters.find((row) => row.name === 'Iskra')!;
    expect(card.id).not.toBe(cardId);
    expect((JSON.parse(card.data) as { notes: string }).notes).toBe('po sesji');
    // Karta gracza czeka na niego — w tej kampanii go nie ma.
    expect(card).toMatchObject({ ownerId: null, pendingOwnerName: 'Rogue' });
    expect(card.portraitUrl).toMatch(new RegExp(`^/uploads/campaigns/${previous.id}/portraits/`));
  });

  it('gracz po cofnięciu wchodzi do tej samej kampanii i widzi swoją kartę', async () => {
    const player = await connect(playerCookie);
    // Gracz w poczekalni dostaje swój `state:sync` przy połączeniu — liczy się
    // ten, który przychodzi ze startem sesji (z kartami).
    const sync = new Promise<StateSyncPayload>((res) => {
      player.on('state:sync', (payload: StateSyncPayload) => {
        if (payload.characters.some((row) => row.id === cardId)) res(payload);
      });
    });
    expect((await emitAck(gmSocket, 'session:start', { campaignId })).ok).toBe(true);
    const state = await sync;
    const mine = state.characters.find((row) => row.id === cardId);
    expect(mine?.ownerId).toBe(playerId);
    expect((mine?.data as { notes?: string } | undefined)?.notes).toBe('przed sesją');
    expect((await emitAck(gmSocket, 'session:end', { campaignId })).ok).toBe(true);
    await copies().settled();
    player.disconnect();
  });

  it('pobrana kopia to paczka, którą wczytuje „Wczytaj z pliku…”', async () => {
    const file = await downloadPackage<CampaignArchive>(
      built,
      CAMPAIGN_COPY_PATHS.download(startCopy),
      gmCookie,
    );
    expect(file.manifest.kind).toBe('campaign');
    expect(file.files.has('files/portraits/iskra_1.webp')).toBe(true);
    const { status, body } = await importArchive(built, gmCookie, await repack(file));
    expect(status).toBe(201);
    expect((body as unknown as ArchiveImportResult).kind).toBe('campaign');
  });
});

describe('usunięcie kampanii przez MG', () => {
  it('odmawia otwartej, w trakcie sesji i bez nazwy, a potem usuwa', async () => {
    const remove = (id: string, confirm: string) =>
      built.app.inject({
        method: 'DELETE',
        url: `/api/campaigns/${id}`,
        headers: { cookie: gmCookie },
        payload: { confirm },
      });
    const open = await remove(campaignId, CAMPAIGN);
    expect(open.statusCode).toBe(409);
    expect(open.json()).toEqual({ error: 'CAMPAIGN_OPEN' });

    const { id, name } = (
      await built.prisma.campaign.findMany({ where: { name: { contains: 'przed cofnięciem' } } })
    )[0]!;
    expect((await remove(id, 'coś innego')).statusCode).toBe(400);
    const playerTry = await built.app.inject({
      method: 'DELETE',
      url: `/api/campaigns/${id}`,
      headers: { cookie: playerCookie },
      payload: { confirm: name },
    });
    expect(playerTry.statusCode).toBe(403);

    const uploads = join(config.uploadsDir, 'campaigns', id);
    expect(existsSync(uploads)).toBe(true);
    const done = await remove(id, name);
    expect(done.statusCode).toBe(200);
    expect(done.json()).toEqual({ players: 0 });
    expect(await built.prisma.campaign.findUnique({ where: { id } })).toBeNull();
    expect(existsSync(uploads)).toBe(false);
    // Pliki kampanii i kopii zostają — usunięte były tylko dowiązania.
    const copy = await copies().read(campaignId, startCopy);
    expect(copy!.files.size).toBeGreaterThan(0);
    expect([...copy!.files.values()].every((disk) => existsSync(disk))).toBe(true);
    // Grafika w kopii to dowiązanie, nie druga kopia pliku.
    expect([...copy!.files.values()].every((disk) => statSync(disk).nlink > 1)).toBe(true);
    const still = await built.app.inject({
      method: 'GET',
      url: portrait,
      headers: { cookie: gmCookie },
    });
    expect(still.statusCode).toBe(200);
  });

  it('odmawia kampanii z trwającą sesją', async () => {
    const other = await built.app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie: gmCookie },
      payload: { name: 'Druga' },
    });
    const otherId = (other.json() as CampaignSummary).id;
    // Druga kampania jest otwarta; sesja w pierwszej — ustawiona wprost.
    await built.prisma.campaign.update({
      where: { id: campaignId },
      data: { sessionStartedAt: new Date(now) },
    });
    const res = await built.app.inject({
      method: 'DELETE',
      url: `/api/campaigns/${campaignId}`,
      headers: { cookie: gmCookie },
      payload: { confirm: CAMPAIGN },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'SESSION_ACTIVE' });
    await built.prisma.campaign.update({
      where: { id: campaignId },
      data: { sessionStartedAt: null },
    });
    expect(otherId).toBeTruthy();
  });
});
