import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  CampaignSwitchBroadcast,
  InvitationSummary,
  SceneView,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Przełączenie aktywnej kampanii pod podpiętymi ekranami (błąd #1 z sesji
 * testów walki 08.08, naprawiony 22.08).
 *
 * Do poprawki zmiana aktywnej kampanii była wpisem w bazie i niczym więcej:
 * gniazda zostawały w pokojach poprzedniej kampanii, więc mapa, czat i kolejka
 * inicjatywy pokazywały poprzedni stół aż do przeładowania karty. Sprawdzane
 * jest to, czego nie widać w bazie: że gniazdo **zmienia pokój**, że dostaje
 * pełny nowy stan i że gracz spoza nowej kampanii zostaje bez stołu zamiast
 * z cudzym.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';

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
};

let built: BuiltApp;
let baseUrl: string;
let gmCookie: string;
/** Gracz zaproszony do pierwszej kampanii — w drugiej nie ma go wcale. */
let oldPlayerCookie: string;
/** Gracz zaproszony do drugiej kampanii. */
let newPlayerCookie: string;
let firstCampaign: CampaignSummary;
let secondCampaign: CampaignSummary;
let firstSceneId: string;
const openSockets: ClientSocket[] = [];

function cookieOf(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error('missing set-cookie header');
  return raw.split(';')[0]!;
}

function createSocket(cookie: string): {
  socket: ClientSocket;
  firstSync: Promise<StateSyncPayload>;
} {
  const socket = ioClient(baseUrl, {
    extraHeaders: { cookie },
    reconnection: false,
    timeout: 3000,
  });
  openSockets.push(socket);
  const firstSync = new Promise<StateSyncPayload>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('state:sync timeout')), 4000);
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.once('state:sync', (payload: StateSyncPayload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
  return { socket, firstSync };
}

function waitFor<T>(socket: ClientSocket, event: string, ms = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 4000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolve(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

function data<T>(ack: SocketAck<T>, what: string): T {
  if (!ack.ok || ack.data === undefined) throw new Error(`${what} failed: ${JSON.stringify(ack)}`);
  return ack.data;
}

async function createCampaign(name: string): Promise<CampaignSummary> {
  const res = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name },
  });
  return res.json() as CampaignSummary;
}

async function invitePlayer(campaignId: string, name: string): Promise<string> {
  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const token = (inviteRes.json() as InvitationSummary).token;
  const joinRes = await built.app.inject({
    method: 'POST',
    url: `/api/join/${token}`,
    payload: { name },
  });
  return cookieOf(joinRes.headers['set-cookie']);
}

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: 'pipe',
  });
  built = await buildApp(config, { logger: false });
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const address = built.app.server.address();
  if (address === null || typeof address === 'string') throw new Error('no server address');
  baseUrl = `http://127.0.0.1:${address.port}`;

  const login = await built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);

  firstCampaign = await createCampaign('Ulice Night City');
  oldPlayerCookie = await invitePlayer(firstCampaign.id, 'Tony');

  // Pierwsza kampania dostaje własną scenę — po powrocie do niej gniazdo ma
  // wylądować w tej scenie, a nie w żadnej.
  const gm = createSocket(gmCookie);
  await gm.firstSync;
  const scene = data(
    await emitAck<SceneView>(gm.socket, 'scene:create', { name: 'Zaułek' }),
    'scene',
  );
  firstSceneId = scene.id;
  await emitAck(gm.socket, 'scene:activate', { sceneId: scene.id });
  gm.socket.disconnect();

  // Utworzenie drugiej kampanii dezaktywuje pierwszą (zachowanie z etapu 02).
  secondCampaign = await createCampaign('Poligon bojowy');
  newPlayerCookie = await invitePlayer(secondCampaign.id, 'Kai');
}, 60_000);

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

describe('campaign:activate', () => {
  it('moves every connected socket to the campaign the GM picked', async () => {
    const gm = createSocket(gmCookie);
    const player = createSocket(oldPlayerCookie);
    // Gracz pierwszej kampanii jest w tej chwili bez stołu — druga jest aktywna.
    expect((await gm.firstSync).campaign?.id).toBe(secondCampaign.id);
    expect((await player.firstSync).campaign).toBeNull();

    const gmSwitch = waitFor<CampaignSwitchBroadcast>(gm.socket, 'campaign:switch');
    const gmSync = waitFor<StateSyncPayload>(gm.socket, 'state:sync');
    const playerSync = waitFor<StateSyncPayload>(player.socket, 'state:sync');
    expect(await emitAck(gm.socket, 'campaign:activate', { campaignId: firstCampaign.id })).toEqual(
      { ok: true },
    );

    expect((await gmSwitch).campaign?.id).toBe(firstCampaign.id);
    const fresh = await gmSync;
    expect(fresh.campaign?.id).toBe(firstCampaign.id);
    // Cała treść poprawki: razem z kampanią przychodzi jej **scena**, czyli to,
    // co do 22.08 zostawało przy poprzednim stole aż do przeładowania karty.
    expect(fresh.scene?.id).toBe(firstSceneId);
    // …i gracz, który należy do nowej kampanii, dostaje ją bez pytania.
    expect((await playerSync).campaign?.id).toBe(firstCampaign.id);

    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('leaves a player of the abandoned campaign without a table, not with somebody elses', async () => {
    const gm = createSocket(gmCookie);
    const stranger = createSocket(newPlayerCookie);
    await gm.firstSync;
    // Kai jest członkiem drugiej kampanii; aktywna jest pierwsza (test wyżej).
    expect((await stranger.firstSync).campaign).toBeNull();

    const back = waitFor<CampaignSwitchBroadcast>(stranger.socket, 'campaign:switch');
    const strangerSync = waitFor<StateSyncPayload>(stranger.socket, 'state:sync');
    await emitAck(gm.socket, 'campaign:activate', { campaignId: secondCampaign.id });
    expect((await back).campaign?.id).toBe(secondCampaign.id);
    expect((await strangerSync).campaign?.id).toBe(secondCampaign.id);

    // A teraz z powrotem — ten sam gracz musi stracić stół, nie odziedziczyć cudzy.
    const away = waitFor<CampaignSwitchBroadcast>(stranger.socket, 'campaign:switch');
    const awaySync = waitFor<StateSyncPayload>(stranger.socket, 'state:sync');
    await emitAck(gm.socket, 'campaign:activate', { campaignId: firstCampaign.id });
    expect((await away).campaign).toBeNull();
    const empty = await awaySync;
    expect(empty.campaign).toBeNull();
    expect(empty.scene).toBeNull();
    expect(empty.tokens).toEqual([]);

    gm.socket.disconnect();
    stranger.socket.disconnect();
  });

  it('refuses an unknown campaign and a player asking', async () => {
    const gm = createSocket(gmCookie);
    const player = createSocket(oldPlayerCookie);
    await Promise.all([gm.firstSync, player.firstSync]);

    expect(await emitAck(gm.socket, 'campaign:activate', { campaignId: 'nie-ma-takiej' })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(await emitAck(gm.socket, 'campaign:activate', {})).toEqual({
      ok: false,
      error: 'BAD_REQUEST',
    });
    expect(
      await emitAck(player.socket, 'campaign:activate', { campaignId: secondCampaign.id }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });

    gm.socket.disconnect();
    player.socket.disconnect();
  });
});
