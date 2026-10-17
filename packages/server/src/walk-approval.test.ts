import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  CharacterView,
  CombatView,
  CombatantView,
  CpredCharacterData,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenMoveBroadcast,
  TokenView,
} from '@vtt/shared';
import { PACE_REFILL_MS } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { paceClock, paceOwedNow } from './realtime/pace.js';
import { joinUrl } from './test-join.js';

/**
 * Etap 52 — trasa marszu gracza zatwierdzana przez serwer, na prawdziwych gniazdach.
 *
 * Do 52 klatka pośrednia gracza była pozycją z ręki: przeciągnięcie figury
 * przez mur odsłaniało pokój za nim, choć lądowanie wracało odmową. Tu szew:
 * klatka bez `token:walk` nie istnieje, klatka „za ścianą” ląduje na trasie,
 * trasa przez wroga, ścianę albo ponad pulę odpada przed pierwszym krokiem,
 * a zatwierdzenie niczego nie pobiera — płaci lądowanie, za przebyty kawałek.
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
let playerCookie: string;
let playerId: string;
let olaId: string;
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

function waitFor<T>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
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
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 3000);
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
    payload: { login: 'MG', password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);

  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Kampania marszu' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Vex'),
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
  playerId = (joinRes.json() as { user: { id: string } }).user.id;
  const olaRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Ola'),
  });
  olaId = (olaRes.json() as { user: { id: string } }).user.id;
}, 60_000);

afterAll(async () => {
  paceClock.now = () => Date.now();
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

describe('trasa marszu gracza (etap 52)', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;
  let sceneId: string;
  let vexTokenId: string;
  /** Pula Vexa: RUCH 10 → 20 m = 1000 px (kratka 100 px = 2 m). */
  const CAP_M = 20;
  const VEX = { x: 100, y: 100 };
  let now = 5_000_000;

  /** Pełna pula: zegar puli stoi między krokami, więc przesuwa go tylko test. */
  function refill(): void {
    now += PACE_REFILL_MS;
  }

  function walk(route: { x: number; y: number }[]): Promise<SocketAck<{ tokenId: string }>> {
    return emitAck(vex, 'token:walk', { tokenId: vexTokenId, route });
  }

  function step(
    socket: ClientSocket,
    x: number,
    y: number,
    final: boolean,
  ): Promise<SocketAck<{ x: number; y: number }>> {
    return emitAck(socket, 'token:move', { tokenId: vexTokenId, x, y, final });
  }

  async function home(): Promise<void> {
    expect((await step(gm, VEX.x, VEX.y, true)).ok).toBe(true);
  }

  it('zakłada stół: Eksploracja, Vex, Ola (drużyna), Gang (wróg), Cień (ukryty), ściana', async () => {
    // Zegar puli stoi: nic się nie odnawia między krokami testu.
    paceClock.now = () => now;
    const gmConn = createSocket(gmCookie);
    const vexConn = createSocket(playerCookie);
    gm = gmConn.socket;
    vex = vexConn.socket;
    await Promise.all([gmConn.firstSync, vexConn.firstSync]);

    sceneId = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Hala' }), 'scene').id;
    await emitAck(gm, 'scene:update', {
      sceneId,
      patch: { width: 4000, height: 4000, grid: { sizePx: 100 }, metersPerSquare: 2 },
    });
    // Bez siatki: pozycje bez przyciągania, metry co do piksela.
    await emitAck(gm, 'scene:update', {
      sceneId,
      patch: { gridMode: 'gridless', playerMove: 'explore' },
    });
    const activated = waitFor(vex, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    const card = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Vex', ownerId: playerId }),
      'character:create',
    );
    await emitAck(gm, 'character:update', {
      characterId: card.id,
      patch: {
        data: { stats: { ...(card.data as CpredCharacterData).stats, ref: 6, move: 10, body: 6 } },
      },
    });
    vexTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Vex',
        ...VEX,
        characterId: card.id,
      }),
      'token:create',
    ).id;
    const place = async (name: string, x: number, y: number, extra: object = {}) =>
      data(
        await emitAck<TokenView>(gm, 'token:create', { sceneId, name, x, y, ...extra }),
        `token:create ${name}`,
      );
    await place('Ola', 500, 100, { ownerId: olaId });
    await place('Gang', 100, 500);
    const shadow = await place('Cień', 800, 100);
    await emitAck(gm, 'token:update', { tokenId: shadow.id, patch: { hidden: true } });
    await emitAck(gm, 'wall:create', {
      sceneId,
      kind: 'wall',
      points: [
        { x: 1300, y: 0 },
        { x: 1300, y: 4000 },
      ],
    });
  });

  it('klatka pośrednia bez zatwierdzonej trasy nie istnieje', async () => {
    expect(await step(vex, 1600, 100, false)).toEqual({ ok: false, error: 'MOVE_NOT_PLANNED' });
  });

  it('lądowanie bez trasy dalej przechodzi pełne sprawdzenie', async () => {
    expect(await step(vex, 1600, 100, true)).toEqual({
      ok: false,
      error: 'MOVE_BLOCKED_BY_TERRAIN',
    });
    expect(await step(vex, 200, 100, true)).toEqual({ ok: true, data: { x: 200, y: 100 } });
    await home();
  });

  it('trasa przez ścianę albo przez wroga odpada przed pierwszym krokiem', async () => {
    expect(await walk([{ x: 1500, y: 100 }])).toEqual({
      ok: false,
      error: 'MOVE_BLOCKED_BY_TERRAIN',
    });
    expect(await walk([{ x: 100, y: 800 }])).toEqual({
      ok: false,
      error: 'MOVE_BLOCKED_BY_FIGURE',
    });
    // Obok wroga, nie przez niego — można.
    const beside = await walk([
      { x: 300, y: 100 },
      { x: 300, y: 800 },
    ]);
    expect(beside.ok).toBe(true);
  });

  it('przez kompana i niewidocznego przejdziesz, na kompanie nie staniesz', async () => {
    expect((await walk([{ x: 1000, y: 100 }])).ok).toBe(true);
    expect(await walk([{ x: 500, y: 100 }])).toEqual({
      ok: false,
      error: 'MOVE_BLOCKED_BY_FIGURE',
    });
  });

  it('trasa ponad pulę odpada, a zatwierdzenie niczego z puli nie bierze', async () => {
    refill();
    expect(await walk([{ x: 1150, y: 100 }])).toEqual({ ok: false, error: 'MOVE_PACE' });
    expect((await walk([{ x: 1000, y: 100 }])).ok).toBe(true);
    expect(paceOwedNow(vexTokenId, CAP_M)).toBe(0);
  });

  it('klatka zza muru ląduje na trasie, a lądowanie płaci za przebyty kawałek', async () => {
    refill();
    expect((await walk([{ x: 1000, y: 100 }])).ok).toBe(true);
    const gmSaw = waitFor<TokenMoveBroadcast>(gm, 'token:move');
    expect(await step(vex, 1700, 1500, false)).toEqual({ ok: true, data: { x: 1000, y: 100 } });
    expect(await gmSaw).toMatchObject({ x: 1000, y: 100, final: false });
    expect(await step(vex, 420, 900, false)).toEqual({ ok: true, data: { x: 420, y: 100 } });
    expect(await step(vex, 400, 100, true)).toEqual({ ok: true, data: { x: 400, y: 100 } });
    // 300 px = 6 m z puli 20 m.
    expect(paceOwedNow(vexTokenId, CAP_M)).toBeCloseTo(6, 5);
    // Po lądowaniu trasy już nie ma.
    expect(await step(vex, 500, 100, false)).toEqual({ ok: false, error: 'MOVE_NOT_PLANNED' });
    await home();
  });

  it('lądowanie płaci do najdalszego punktu, do którego doszły klatki', async () => {
    refill();
    const approved = await walk([
      { x: 300, y: 100 },
      { x: 300, y: 800 },
    ]);
    expect(approved.ok).toBe(true);
    // Klatki doszły do (300, 700), lądowanie wraca na róg (300, 100).
    expect((await step(vex, 300, 700, false)).ok).toBe(true);
    expect(await step(vex, 300, 100, true)).toEqual({ ok: true, data: { x: 300, y: 100 } });
    // Start → róg (300, 100) → z powrotem na róg: 200 px = 4 m, nie 0.
    expect(paceOwedNow(vexTokenId, CAP_M)).toBeCloseTo(4, 5);
    await home();
  });

  it('lądowanie daleko od trasy to nie ten marsz — trasa przepada, lądowanie ocenia się samo', async () => {
    refill();
    const approved = await walk([
      { x: 300, y: 100 },
      { x: 300, y: 800 },
    ]);
    expect(approved.ok).toBe(true);
    expect(await step(vex, 1600, 100, true)).toEqual({
      ok: false,
      error: 'MOVE_BLOCKED_BY_TERRAIN',
    });
    expect(await step(vex, 300, 300, false)).toEqual({ ok: false, error: 'MOVE_NOT_PLANNED' });
  });

  it('MG chodzi jak dotąd — bez trasy i bez rzutowania', async () => {
    expect(await step(gm, 1700, 1500, false)).toEqual({ ok: true, data: { x: 1700, y: 1500 } });
    await home();
  });

  it('w walce zatwierdzenie liczy Turę na sucho, a płaci lądowanie', async () => {
    const combat = data(
      await emitAck<CombatView>(gm, 'combat:start', { sceneId, tokenIds: [vexTokenId] }),
      'combat:start',
    );
    const row = combat.combatants.find((entry: CombatantView) => entry.tokenId === vexTokenId);
    if (!row) throw new Error('Vex missing from the tracker');
    await emitAck(gm, 'combat:set-initiative', { combatantId: row.id, initiative: 20 });
    data(await emitAck<CombatView>(gm, 'combat:next', {}), 'combat:next');

    // 18 m z 20 m — dwa razy, bo pierwsze zatwierdzenie niczego nie wydało.
    expect((await walk([{ x: 1000, y: 100 }])).ok).toBe(true);
    expect((await walk([{ x: 1000, y: 100 }])).ok).toBe(true);
    expect((await step(vex, 1000, 100, true)).ok).toBe(true);
    // Zostały 2 m — 4 m już nie.
    expect(await walk([{ x: 1000, y: 300 }])).toEqual({ ok: false, error: 'MOVE_REFUSED' });
    await emitAck(gm, 'combat:end', {});
    await home();
  });

  it('w walce marsz w drugi pas bierze Bieg dopiero, gdy metry go sięgają (etap 54)', async () => {
    /** Tura Vexa tak, jak widzi ją MG. */
    async function turnOf(): Promise<CombatantView['turn']> {
      const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
      await emitAck(gm, 'state:request');
      const row = (await sync).combat?.combatants.find((entry) => entry.tokenId === vexTokenId);
      return row?.turn;
    }
    async function startFight(): Promise<void> {
      const combat = data(
        await emitAck<CombatView>(gm, 'combat:start', { sceneId, tokenIds: [vexTokenId] }),
        'combat:start',
      );
      const row = combat.combatants.find((entry: CombatantView) => entry.tokenId === vexTokenId);
      if (!row) throw new Error('Vex missing from the tracker');
      await emitAck(gm, 'combat:set-initiative', { combatantId: row.id, initiative: 20 });
      data(await emitAck<CombatView>(gm, 'combat:next', {}), 'combat:next');
    }
    const actionUsed = async (): Promise<number | undefined> =>
      (await turnOf())?.resources.find((entry) => entry.id === 'action')?.used;

    await startFight();
    // ~36 m przy 20 m Ruchu (mur stoi na x = 1300, Gang pod Vexem): bez flagi
    // odmowa, z flagą zgoda — i nic jeszcze nie wydane.
    const far = [
      { x: 1100, y: 300 },
      { x: 1100, y: 1100 },
    ];
    expect(await walk(far)).toEqual({ ok: false, error: 'MOVE_REFUSED' });
    const walkRun = (route: typeof far) =>
      emitAck(vex, 'token:walk', { tokenId: vexTokenId, route, extra: true });
    const landRun = (x: number, y: number) =>
      emitAck(vex, 'token:move', { tokenId: vexTokenId, x, y, final: true, extra: true });
    expect((await walkRun(far)).ok).toBe(true);
    expect(await actionUsed()).toBe(0);
    // Marsz przerwany przed bursztynem (~10 m) — Akcja zostaje.
    for (let x = 200; x <= 600; x += 100) {
      expect((await step(vex, x, 100 + (x - 100) * 0.2, false)).ok).toBe(true);
    }
    expect((await landRun(600, 200)).ok).toBe(true);
    expect(await actionUsed()).toBe(0);
    // Dalej, w bursztyn (razem ~36 m): Bieg zaksięgowany, pas rośnie do 40 m.
    expect((await walkRun(far)).ok).toBe(true);
    expect((await landRun(1100, 1100)).ok).toBe(true);
    const turn = await turnOf();
    expect(turn?.resources.find((entry) => entry.id === 'action')?.used).toBe(1);
    expect(turn?.distance?.max).toBe(40);
    expect(turn?.distance?.used).toBeGreaterThan(20);
    expect(turn?.distance?.extra).toBeUndefined();
    await emitAck(gm, 'combat:end', {});
    await home();

    // Akcja wydana wcześniej (Wstanie): bursztynu nie ma, flaga nic nie daje.
    await startFight();
    expect((await emitAck(vex, 'combat:action', { actionId: 'stand-up' })).ok).toBe(true);
    expect(
      await emitAck(vex, 'token:walk', { tokenId: vexTokenId, route: far, extra: true }),
    ).toEqual({ ok: false, error: 'MOVE_REFUSED' });
    await emitAck(gm, 'combat:end', {});
    await home();
  });
});
