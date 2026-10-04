import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  AuthState,
  CampaignDetail,
  CampaignSummary,
  CampaignSwitchBroadcast,
  ChatMessageBroadcast,
  SessionChangedPush,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import { ROLE_GM, SESSION_SLOTS_FULL_TEXT, sessionErrorText } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';
import { EVENTS } from './realtime/index.js';
import { BETWEEN_SESSIONS_EVENTS } from './realtime/session-clock.js';

/**
 * Etap 44c — sesje i sloty: przygotowanie bez slotu, start i koniec sesji,
 * limit dwóch naraz (także dla startów w tej samej chwili), zegar
 * bezczynności na sztucznym czasie, restart, biała lista zdarzeń gracza
 * między sesjami i przenoszenie gniazd wyłącznie własnej kampanii.
 *
 * Konfiguracja **z** sekcją `sessions` — reszta testów dymnych jedzie bez
 * niej, czyli z kampanią grającą od założenia (`config.ts`).
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const EMPTY_MINUTES = 15;
const IDLE_MINUTES = 180;
const MINUTE = 60_000;

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
  sessions: { maxSessions: 2, emptyMinutes: EMPTY_MINUTES, idleMinutes: IDLE_MINUTES },
};

/** Sztuczny zegar sesji — przesuwa go test, nie kalendarz. */
let now = Date.parse('2026-10-04T18:00:00Z');
const clock = () => now;

let built: BuiltApp;
let baseUrl: string;
const openSockets: ClientSocket[] = [];
let addressCounter = 1;

interface Gm {
  cookie: string;
  campaignId: string;
  playerCookie: string;
  playerName: string;
}

let alfa: Gm;
let beta: Gm;
let gamma: Gm;

function cookieOf(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error('missing set-cookie header');
  return raw.split(';')[0]!;
}

function connect(cookie: string): { socket: ClientSocket; firstSync: Promise<StateSyncPayload> } {
  const socket = ioClient(baseUrl, {
    extraHeaders: { cookie },
    reconnection: false,
    timeout: 3000,
  });
  openSockets.push(socket);
  const firstSync = nextEvent<StateSyncPayload>(socket, 'state:sync');
  return { socket, firstSync };
}

async function seated(cookie: string): Promise<{ socket: ClientSocket; sync: StateSyncPayload }> {
  const { socket, firstSync } = connect(cookie);
  return { socket, sync: await firstSync };
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 5000);
    socket.emit(event, payload, (ack: SocketAck<T>) => {
      clearTimeout(timer);
      resolvePromise(ack);
    });
  });
}

function nextEvent<T>(socket: ClientSocket, event: string, timeoutMs = 4000): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolvePromise(payload);
    });
  });
}

/** Wszystko, co gniazdo usłyszy od tej chwili — do sprawdzania ciszy. */
function recordAll(socket: ClientSocket): string[] {
  const heard: string[] = [];
  socket.onAny((event: string) => heard.push(event));
  return heard;
}

const settle = () => new Promise((resolvePromise) => setTimeout(resolvePromise, 150));

async function registerGm(loginName: string): Promise<string> {
  addressCounter += 1;
  const res = await built.app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { login: loginName, password: 'dlugie-haslo-1', repeat: 'dlugie-haslo-1' },
    remoteAddress: `10.44.3.${addressCounter}`,
  });
  expect(res.statusCode).toBe(201);
  return cookieOf(res.headers['set-cookie']);
}

async function createCampaign(cookie: string, name: string): Promise<CampaignSummary> {
  const res = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie },
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as CampaignSummary;
}

async function joinPlayer(campaignId: string, name: string): Promise<string> {
  const res = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, name),
  });
  expect(res.statusCode).toBe(200);
  return cookieOf(res.headers['set-cookie']);
}

async function makeGm(loginName: string, campaign: string, player: string): Promise<Gm> {
  const cookie = loginName === 'MG' ? await ownerCookie() : await registerGm(loginName);
  const summary = await createCampaign(cookie, campaign);
  return {
    cookie,
    campaignId: summary.id,
    playerCookie: await joinPlayer(summary.id, player),
    playerName: player,
  };
}

async function ownerCookie(): Promise<string> {
  const res = await built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: 'MG', password: GM_PASSWORD },
  });
  return cookieOf(res.headers['set-cookie']);
}

async function runningCount(): Promise<number> {
  return built.prisma.campaign.count({ where: { sessionStartedAt: { not: null } } });
}

async function campaignRow(id: string) {
  return built.prisma.campaign.findUniqueOrThrow({ where: { id } });
}

/** MG kończy sesję swoją kartą (jeśli trwa) — sprzątanie między testami. */
async function endIfRunning(gm: Gm): Promise<void> {
  if (!(await campaignRow(gm.campaignId)).sessionStartedAt) return;
  const { socket } = await seated(gm.cookie);
  expect((await emitAck(socket, 'session:end', { campaignId: gm.campaignId })).ok).toBe(true);
  socket.disconnect();
}

function disconnectAll(): void {
  for (const socket of openSockets.splice(0)) socket.disconnect();
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

  alfa = await makeGm('MG', 'Ulice Night City', 'Kuba');
  beta = await makeGm('bartek', 'Pustkowia', 'Ola');
  gamma = await makeGm('celina', 'Watson', 'Igor');
}, 60_000);

afterAll(async () => {
  disconnectAll();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

describe('przygotowanie i widok między sesjami', () => {
  it('nowa kampania otwiera się u MG bez sesji, a gracz czeka bez stołu', async () => {
    expect((await campaignRow(alfa.campaignId)).sessionStartedAt).toBeNull();
    expect(await runningCount()).toBe(0);

    const gm = await seated(alfa.cookie);
    expect(gm.sync.campaign?.id).toBe(alfa.campaignId);
    expect(gm.sync.campaign?.sessionStartedAt).toBeNull();
    // MG przygotowuje: scena powstaje i staje się aktywna bez slotu.
    const scene = await emitAck<{ id: string }>(gm.socket, 'scene:create', { name: 'Zaułek' });
    expect(scene.ok).toBe(true);
    const sceneId = scene.ok ? scene.data!.id : '';
    expect((await emitAck(gm.socket, 'scene:activate', { sceneId })).ok).toBe(true);

    const player = await seated(alfa.playerCookie);
    expect(player.sync.campaign?.id).toBe(alfa.campaignId);
    expect(player.sync.campaign?.sessionStartedAt).toBeNull();
    expect(player.sync.scene).toBeNull();
    expect(player.sync.tokens).toEqual([]);

    // REST mówi to samo: kampania gracza, bez sesji.
    const me = await built.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: alfa.playerCookie },
    });
    expect((me.json() as AuthState).activeCampaign?.id).toBe(alfa.campaignId);

    // MG widzi gracza jako obecnego, ale poza stołem.
    const presence = (await emitAckSync(gm.socket)).presence;
    expect(presence.find((entry) => entry.name === 'Kuba')).toMatchObject({ atTable: false });
    expect(presence.find((entry) => entry.role === ROLE_GM)).toMatchObject({ atTable: true });

    disconnectAll();
  });

  it('gracz między sesjami nie wykona zdarzenia stołu, także z konsoli', async () => {
    const player = await seated(alfa.playerCookie);
    for (const [event, payload] of [
      ['chat:send', { text: 'hej' }],
      ['token:move', { tokenId: 'x', x: 1, y: 1 }],
      ['character:roll', { characterId: 'x', request: { kind: 'stat', statId: 'ref' } }],
      ['map:ping', { x: 1, y: 1 }],
      ['attack:roll', { tokenId: 'x' }],
      ['combat:roll', {}],
    ] as const) {
      expect(await emitAck(player.socket, event, payload)).toEqual({
        ok: false,
        error: 'SESSION_NOT_RUNNING',
      });
    }
    // Czytanie wolno.
    expect((await emitAck(player.socket, 'journal:list', {})).ok).toBe(true);
    expect((await emitAck(player.socket, 'handout:list', {})).ok).toBe(true);
    disconnectAll();
  });

  it('czat przygotowania nie dociera do gracza ani na żywo, ani w historii — szept tak', async () => {
    const gm = await seated(alfa.cookie);
    const player = await seated(alfa.playerCookie);
    const heard: ChatMessageBroadcast[] = [];
    player.socket.on('chat:message', (payload: ChatMessageBroadcast) => heard.push(payload));

    expect((await emitAck(gm.socket, 'chat:send', { text: 'rzut próbny przed sesją' })).ok).toBe(
      true,
    );
    expect((await emitAck(gm.socket, 'chat:send', { text: '/r 1d10' })).ok).toBe(true);
    expect(
      (await emitAck(gm.socket, 'chat:send', { text: '/w Kuba do zobaczenia w piątek' })).ok,
    ).toBe(true);
    await settle();
    expect(heard.map((entry) => entry.message.text)).toEqual(['do zobaczenia w piątek']);

    const rows = await built.prisma.chatMessage.findMany({
      where: { campaignId: alfa.campaignId },
    });
    expect(rows.length).toBe(3);
    expect(rows.every((row) => row.prep)).toBe(true);

    // Po starcie sesji historia gracza ma wyłącznie szept.
    const sync = nextEvent<StateSyncPayload>(player.socket, 'state:sync');
    expect((await emitAck(gm.socket, 'session:start', { campaignId: alfa.campaignId })).ok).toBe(
      true,
    );
    expect((await sync).messages.map((message) => message.text)).toEqual([
      'do zobaczenia w piątek',
    ]);
    // MG widzi swoje przygotowanie.
    const gmHistory = await emitAckSync(gm.socket);
    expect(gmHistory.messages.length).toBe(3);

    // W trakcie sesji czat działa jak dawniej — także w historii gracza.
    expect((await emitAck(gm.socket, 'chat:send', { text: 'witajcie w Night City' })).ok).toBe(
      true,
    );
    const later = await emitAckSync(player.socket);
    expect(later.messages.map((message) => message.text)).toContain('witajcie w Night City');

    disconnectAll();
    await endIfRunning(alfa);
  });
});

/** `state:request` i czekanie na odpowiedź. */
async function emitAckSync(socket: ClientSocket): Promise<StateSyncPayload> {
  const sync = nextEvent<StateSyncPayload>(socket, 'state:sync');
  socket.emit('state:request');
  return sync;
}

describe('start i koniec sesji', () => {
  it('start sadza graczy tej kampanii, a druga grupa niczego nie słyszy', async () => {
    const gm = await seated(alfa.cookie);
    const player = await seated(alfa.playerCookie);
    const stranger = await seated(beta.playerCookie);
    const strangerGm = await seated(beta.cookie);
    const strangerHeard = recordAll(stranger.socket);
    const strangerGmHeard = recordAll(strangerGm.socket);

    const playerSync = nextEvent<StateSyncPayload>(player.socket, 'state:sync');
    const playerChanged = nextEvent<SessionChangedPush>(player.socket, 'session:changed');
    const gmChanged = nextEvent<SessionChangedPush>(gm.socket, 'session:changed');
    const started = await emitAck<CampaignSummary>(gm.socket, 'session:start', {
      campaignId: alfa.campaignId,
    });
    expect(started.ok).toBe(true);
    expect(started.ok && started.data?.sessionStartedAt).toBe(new Date(now).toISOString());

    const sync = await playerSync;
    expect(sync.campaign?.sessionStartedAt).not.toBeNull();
    // Na stole jest aktywna scena przygotowana przez MG.
    expect(sync.scene?.name).toBe('Zaułek');
    expect((await playerChanged).campaign.sessionStartedAt).not.toBeNull();
    expect((await gmChanged).campaign.id).toBe(alfa.campaignId);

    // Przy stole gracz pisze i rzuca.
    expect((await emitAck(player.socket, 'chat:send', { text: 'jestem' })).ok).toBe(true);
    await settle();
    expect(strangerHeard).toEqual([]);
    expect(strangerGmHeard).toEqual([]);

    // Koniec: gracz wraca do poczekalni, MG zostaje przy stole.
    const awaySync = nextEvent<StateSyncPayload>(player.socket, 'state:sync');
    const ended = nextEvent<SessionChangedPush>(player.socket, 'session:changed');
    expect(await emitAck(gm.socket, 'session:end', { campaignId: alfa.campaignId })).toEqual({
      ok: true,
    });
    const away = await awaySync;
    expect(away.scene).toBeNull();
    expect(away.campaign?.sessionStartedAt).toBeNull();
    expect(away.campaign?.lastSessionEndedAt).toBe(new Date(now).toISOString());
    expect((await ended).reason).toBe('gm');
    expect(await emitAck(player.socket, 'chat:send', { text: 'jeszcze' })).toEqual({
      ok: false,
      error: 'SESSION_NOT_RUNNING',
    });
    // MG po końcu dalej przygotowuje przy tej samej scenie.
    expect((await emitAckSync(gm.socket)).scene?.name).toBe('Zaułek');
    await settle();
    expect(strangerHeard).toEqual([]);
    expect(strangerGmHeard).toEqual([]);
    disconnectAll();
  });

  it('dwie grupy grają naraz: czat i rzuty jednej nie docierają do drugiej', async () => {
    const gmA = await seated(alfa.cookie);
    const gmB = await seated(beta.cookie);
    expect((await emitAck(gmA.socket, 'session:start', { campaignId: alfa.campaignId })).ok).toBe(
      true,
    );
    expect((await emitAck(gmB.socket, 'session:start', { campaignId: beta.campaignId })).ok).toBe(
      true,
    );
    const kuba = await seated(alfa.playerCookie);
    const ola = await seated(beta.playerCookie);
    expect(kuba.sync.campaign?.sessionStartedAt).not.toBeNull();
    expect(ola.sync.campaign?.sessionStartedAt).not.toBeNull();
    const olaHeard: ChatMessageBroadcast[] = [];
    ola.socket.on('chat:message', (payload: ChatMessageBroadcast) => olaHeard.push(payload));
    const kubaHeard: ChatMessageBroadcast[] = [];
    kuba.socket.on('chat:message', (payload: ChatMessageBroadcast) => kubaHeard.push(payload));

    expect((await emitAck(kuba.socket, 'chat:send', { text: 'grupa A' })).ok).toBe(true);
    expect((await emitAck(kuba.socket, 'chat:send', { text: '/r 1d10' })).ok).toBe(true);
    expect((await emitAck(ola.socket, 'chat:send', { text: 'grupa B' })).ok).toBe(true);
    await settle();
    expect(olaHeard.map((entry) => entry.message.text)).toEqual(['grupa B']);
    expect(kubaHeard.map((entry) => entry.message.text)).not.toContain('grupa B');

    // Koniec sesji A nie rusza B.
    const olaEvents = recordAll(ola.socket);
    expect((await emitAck(gmA.socket, 'session:end', { campaignId: alfa.campaignId })).ok).toBe(
      true,
    );
    await settle();
    expect(olaEvents).toEqual([]);
    expect((await campaignRow(beta.campaignId)).sessionStartedAt).not.toBeNull();
    disconnectAll();
    await endIfRunning(beta);
  });
});

describe('limit sesji', () => {
  it('trzeci MG przygotowuje, przy starcie słyszy o zajętych miejscach, po końcu jednej startuje', async () => {
    const a = await seated(alfa.cookie);
    const b = await seated(beta.cookie);
    const c = await seated(gamma.cookie);
    expect((await emitAck(a.socket, 'session:start', { campaignId: alfa.campaignId })).ok).toBe(
      true,
    );
    expect((await emitAck(b.socket, 'session:start', { campaignId: beta.campaignId })).ok).toBe(
      true,
    );

    // Przygotowanie trzeciego działa bez slotu.
    expect((await emitAck(c.socket, 'scene:create', { name: 'Watson nocą' })).ok).toBe(true);
    const refused = await emitAck(c.socket, 'session:start', { campaignId: gamma.campaignId });
    expect(refused).toEqual({ ok: false, error: 'SESSION_SLOTS_FULL' });
    expect(sessionErrorText('SESSION_SLOTS_FULL')).toBe(SESSION_SLOTS_FULL_TEXT);
    expect(await runningCount()).toBe(2);

    expect((await emitAck(a.socket, 'session:end', { campaignId: alfa.campaignId })).ok).toBe(true);
    expect((await emitAck(c.socket, 'session:start', { campaignId: gamma.campaignId })).ok).toBe(
      true,
    );
    expect(await runningCount()).toBe(2);
    disconnectAll();
    await endIfRunning(beta);
    await endIfRunning(gamma);
  });

  it('trzy starty w tej samej chwili dają dokładnie dwie sesje', async () => {
    const sockets = await Promise.all([alfa, beta, gamma].map((gm) => seated(gm.cookie)));
    const acks = await Promise.all(
      [alfa, beta, gamma].map((gm, index) =>
        emitAck(sockets[index]!.socket, 'session:start', { campaignId: gm.campaignId }),
      ),
    );
    expect(acks.filter((ack) => ack.ok).length).toBe(2);
    expect(acks.filter((ack) => !ack.ok)).toEqual([{ ok: false, error: 'SESSION_SLOTS_FULL' }]);
    expect(await runningCount()).toBe(2);
    disconnectAll();
    for (const gm of [alfa, beta, gamma]) await endIfRunning(gm);
  });

  it('dwie karty jednego MG naraz to jedna sesja, nie dwie', async () => {
    const first = await seated(alfa.cookie);
    const second = await seated(alfa.cookie);
    const acks = await Promise.all(
      [first, second].map((tab) =>
        emitAck(tab.socket, 'session:start', { campaignId: alfa.campaignId }),
      ),
    );
    expect(acks.every((ack) => ack.ok)).toBe(true);
    expect(await runningCount()).toBe(1);
    disconnectAll();
    await endIfRunning(alfa);
  });
});

describe('otwarcie innej kampanii', () => {
  it('z trwającą sesją nie wolno; po końcu przenoszą się tylko gniazda tego MG', async () => {
    const second = await createCampaign(alfa.cookie, 'Druga kampania Alfy');
    // Nowa kampania otwiera się u MG, który nie ma trwającej sesji.
    const list = await built.app.inject({
      method: 'GET',
      url: '/api/campaigns',
      headers: { cookie: alfa.cookie },
    });
    const detail = list.json() as CampaignDetail[];
    expect(detail.find((entry) => entry.id === second.id)?.open).toBe(true);

    const gm = await seated(alfa.cookie);
    expect(gm.sync.campaign?.id).toBe(second.id);
    expect((await emitAck(gm.socket, 'campaign:open', { campaignId: alfa.campaignId })).ok).toBe(
      true,
    );
    expect((await emitAck(gm.socket, 'session:start', { campaignId: alfa.campaignId })).ok).toBe(
      true,
    );
    const player = await seated(alfa.playerCookie);
    const otherGm = await seated(beta.cookie);
    const otherHeard = recordAll(otherGm.socket);

    expect(await emitAck(gm.socket, 'campaign:open', { campaignId: second.id })).toEqual({
      ok: false,
      error: 'SESSION_RUNNING',
    });
    // Kampania założona w trakcie sesji nie odbiera MG stołu.
    const third = await createCampaign(alfa.cookie, 'Trzecia kampania Alfy');
    const after = await built.app.inject({
      method: 'GET',
      url: '/api/campaigns',
      headers: { cookie: alfa.cookie },
    });
    const opened = (after.json() as CampaignDetail[]).filter((entry) => entry.open);
    expect(opened.map((entry) => entry.id)).toEqual([alfa.campaignId]);
    expect(third.sessionStartedAt).toBeNull();
    // Sesję zaczyna się tylko w otwartej kampanii.
    expect(await emitAck(gm.socket, 'session:start', { campaignId: second.id })).toEqual({
      ok: false,
      error: 'CAMPAIGN_NOT_OPEN',
    });

    expect((await emitAck(gm.socket, 'session:end', { campaignId: alfa.campaignId })).ok).toBe(
      true,
    );
    const playerHeard = recordAll(player.socket);
    const gmSwitch = nextEvent<CampaignSwitchBroadcast>(gm.socket, 'campaign:switch');
    const gmSync = nextEvent<StateSyncPayload>(gm.socket, 'state:sync');
    expect((await emitAck(gm.socket, 'campaign:open', { campaignId: second.id })).ok).toBe(true);
    expect((await gmSwitch).campaign?.id).toBe(second.id);
    const fresh = await gmSync;
    expect(fresh.campaign?.id).toBe(second.id);
    expect(fresh.scene).toBeNull();
    await settle();
    // Gracz kampanii A i drugi MG nie dostają niczego.
    expect(playerHeard).toEqual([]);
    expect(otherHeard).toEqual([]);
    // Cudza i nieznana kampania wyglądają tak samo, gracz nie otwiera niczego.
    expect(await emitAck(gm.socket, 'campaign:open', { campaignId: beta.campaignId })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(await emitAck(gm.socket, 'campaign:open', { campaignId: 'nie-ma-takiej' })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(await emitAck(gm.socket, 'campaign:open', {})).toEqual({
      ok: false,
      error: 'BAD_REQUEST',
    });
    expect(await emitAck(player.socket, 'campaign:open', { campaignId: alfa.campaignId })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await emitAck(otherGm.socket, 'session:start', { campaignId: alfa.campaignId })).toEqual(
      { ok: false, error: 'NOT_FOUND' },
    );

    // Z powrotem do pierwszej — dla kolejnych testów.
    expect((await emitAck(gm.socket, 'campaign:open', { campaignId: alfa.campaignId })).ok).toBe(
      true,
    );
    disconnectAll();
  });
});

describe('bezczynność (sztuczny zegar)', () => {
  it(`pusty stół przez ${EMPTY_MINUTES} min zwalnia slot i zostawia wpis dla MG`, async () => {
    const gm = await seated(alfa.cookie);
    expect((await emitAck(gm.socket, 'session:start', { campaignId: alfa.campaignId })).ok).toBe(
      true,
    );
    // Ktoś siedzi przy stole — zegar pustki stoi.
    now += 30 * MINUTE;
    expect(await built.realtime.sweepSessions()).toEqual([]);
    disconnectAll();
    await settle();
    expect(await built.realtime.sweepSessions()).toEqual([]);
    now += (EMPTY_MINUTES - 1) * MINUTE;
    expect(await built.realtime.sweepSessions()).toEqual([]);
    now += 2 * MINUTE;
    expect(await built.realtime.sweepSessions()).toEqual([alfa.campaignId]);
    expect((await campaignRow(alfa.campaignId)).sessionStartedAt).toBeNull();

    const note = await built.prisma.chatMessage.findFirst({
      where: { campaignId: alfa.campaignId, kind: 'gmaction' },
      orderBy: { id: 'desc' },
    });
    expect(note?.text).toContain('nikogo nie było przy stole');
    expect(note?.prep).toBe(true);
    // Gracz wpisu nie zobaczy, MG tak.
    const player = await seated(alfa.playerCookie);
    expect(player.sync.messages.some((message) => message.kind === 'gmaction')).toBe(false);
    const back = await seated(alfa.cookie);
    expect(back.sync.messages.at(-1)?.text).toContain('nikogo nie było przy stole');
    disconnectAll();
  });

  it(`${IDLE_MINUTES / 60} h bez zdarzenia gry zwalnia slot, a zdarzenie gry przesuwa próg`, async () => {
    const gm = await seated(alfa.cookie);
    const ended = nextEvent<SessionChangedPush>(gm.socket, 'session:changed', 2000);
    expect((await emitAck(gm.socket, 'session:start', { campaignId: alfa.campaignId })).ok).toBe(
      true,
    );
    await ended;
    now += 100 * MINUTE;
    // Zdarzenie gry — licznik od nowa.
    expect((await emitAck(gm.socket, 'chat:send', { text: 'jeszcze tu jestem' })).ok).toBe(true);
    now += 100 * MINUTE;
    // Odczyt to nie gra.
    await emitAckSync(gm.socket);
    expect(await built.realtime.sweepSessions()).toEqual([]);
    now += (IDLE_MINUTES - 100 - 1) * MINUTE;
    expect(await built.realtime.sweepSessions()).toEqual([]);
    const autoEnd = nextEvent<SessionChangedPush>(gm.socket, 'session:changed');
    now += 2 * MINUTE;
    expect(await built.realtime.sweepSessions()).toEqual([alfa.campaignId]);
    expect((await autoEnd).reason).toBe('idle');
    disconnectAll();
  });

  it('trwająca sesja przeżywa restart, a liczniki ruszają od restartu', async () => {
    const gm = await seated(alfa.cookie);
    expect((await emitAck(gm.socket, 'session:start', { campaignId: alfa.campaignId })).ok).toBe(
      true,
    );
    disconnectAll();
    now += 10 * MINUTE;

    // Drugi proces na tej samej bazie — tak wygląda serwer po restarcie.
    const restarted = await buildApp(config, { logger: false, clock, sweepUploads: false });
    try {
      await restarted.realtime.ready;
      expect(restarted.realtime.deps.sessions.tracked()).toEqual([alfa.campaignId]);
      expect(await restarted.realtime.sweepSessions()).toEqual([]);
      now += (EMPTY_MINUTES - 1) * MINUTE;
      expect(await restarted.realtime.sweepSessions()).toEqual([]);
      now += 2 * MINUTE;
      expect(await restarted.realtime.sweepSessions()).toEqual([alfa.campaignId]);
    } finally {
      await restarted.app.close();
    }
    built.realtime.deps.sessions.forget(alfa.campaignId);
  });
});

describe('biała lista zdarzeń między sesjami', () => {
  it('każde zdarzenie gracza spoza listy daje SESSION_NOT_RUNNING, z listy — przechodzi bramkę', async () => {
    const unknown = [...BETWEEN_SESSIONS_EVENTS].filter(
      (name) => !EVENTS.some((event) => event.name === name),
    );
    expect(unknown).toEqual([]);

    const player = await seated(gamma.playerCookie);
    expect(player.sync.campaign?.sessionStartedAt).toBeNull();
    const playerEvents = EVENTS.filter((event) => event.role !== ROLE_GM);
    const leaked: string[] = [];
    const blocked: string[] = [];
    for (const event of playerEvents) {
      const ack = await emitAck(player.socket, event.name, {});
      const refused = !ack.ok && ack.error === 'SESSION_NOT_RUNNING';
      if (BETWEEN_SESSIONS_EVENTS.has(event.name) && refused) blocked.push(event.name);
      if (!BETWEEN_SESSIONS_EVENTS.has(event.name) && !refused) leaked.push(event.name);
    }
    expect(leaked).toEqual([]);
    expect(blocked).toEqual([]);
    disconnectAll();
  });
});
