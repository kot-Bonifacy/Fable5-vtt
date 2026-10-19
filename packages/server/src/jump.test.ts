import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  ChatMessageView,
  CharacterView,
  CombatView,
  CombatantView,
  CpredCharacterData,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenJumpOptionsView,
  TokenView,
} from '@vtt/shared';
import { PACE_REFILL_MS } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { paceClock, paceOwedNow } from './realtime/pace.js';
import { joinUrl } from './test-join.js';

/**
 * Skok (zlecenie MG z 19.10.2026), na prawdziwych gniazdach.
 *
 * Dwie kratki w jednym z ośmiu kierunków, ponad barierą i osłoną, nigdy przez
 * ścianę ani drzwi, nie do osłony i nie na figurę; 8 m z puli Eksploracji albo
 * z dystansu tury. Kto tylu metrów nie ma, nie skacze.
 *
 * Plan (kratka 100 px = 2 m): Vex stoi na (500, 500), środek (550, 550).
 *  - bariera x = 650, y 400…700 — przeskakuje się ją na wschód i skosem;
 *  - ściana x = 450, y 400…700 — zamyka zachód i oba zachodnie skosy;
 *  - drzwi y = 650, x 470…620 — zamykają południe;
 *  - samochód (osłona) x 500…600, y 400…470 — przeskakuje się go na północ;
 *  - skrzynia (osłona) x 700…800, y 300…400 — na niej skos północno-wschodni
 *    by wylądował, więc go nie ma.
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
    payload: { name: 'Kampania skoku' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Vex'),
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
  playerId = (joinRes.json() as { user: { id: string } }).user.id;
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

describe('skok (19.10.2026)', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;
  let sceneId: string;
  let cardId: string;
  let stats: CpredCharacterData['stats'];
  let vexTokenId: string;
  /** Pula Vexa: RUCH 10 → 20 m. */
  const CAP_M = 20;
  const HOME = { x: 500, y: 500 };
  let now = 9_000_000;

  function refill(): void {
    now += PACE_REFILL_MS;
  }

  const options = (socket: ClientSocket = vex) =>
    emitAck<TokenJumpOptionsView>(socket, 'token:jump-options', { tokenId: vexTokenId });
  const jump = (dx: number, dy: number, socket: ClientSocket = vex) =>
    emitAck<{ x: number; y: number }>(socket, 'token:jump', { tokenId: vexTokenId, dx, dy });

  async function home(): Promise<void> {
    const ack = await emitAck(gm, 'token:move', { tokenId: vexTokenId, ...HOME, final: true });
    expect(ack.ok).toBe(true);
  }

  async function setMove(move: number): Promise<void> {
    const ack = await emitAck(gm, 'character:update', {
      characterId: cardId,
      patch: { data: { stats: { ...stats, move } } },
    });
    expect(ack.ok).toBe(true);
  }

  it('zakłada stół: Eksploracja, Vex, bariera, ściana, drzwi i dwie osłony', async () => {
    paceClock.now = () => now;
    const gmConn = createSocket(gmCookie);
    const vexConn = createSocket(playerCookie);
    gm = gmConn.socket;
    vex = vexConn.socket;
    await Promise.all([gmConn.firstSync, vexConn.firstSync]);

    sceneId = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Parking' }), 'scene').id;
    await emitAck(gm, 'scene:update', {
      sceneId,
      patch: { width: 2000, height: 2000, grid: { sizePx: 100 }, metersPerSquare: 2 },
    });
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMove: 'explore' } });
    const activated = waitFor(vex, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    const card = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Vex', ownerId: playerId }),
      'character:create',
    );
    cardId = card.id;
    stats = { ...(card.data as CpredCharacterData).stats, ref: 6, move: 10, body: 6 };
    await setMove(10);
    vexTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Vex',
        ...HOME,
        characterId: card.id,
      }),
      'token:create',
    ).id;

    const wall = async (kind: string, points: { x: number; y: number }[]) =>
      expect((await emitAck(gm, 'wall:create', { sceneId, kind, points })).ok).toBe(true);
    await wall('barrier', [
      { x: 650, y: 400 },
      { x: 650, y: 700 },
    ]);
    await wall('wall', [
      { x: 450, y: 400 },
      { x: 450, y: 700 },
    ]);
    await wall('door', [
      { x: 470, y: 650 },
      { x: 620, y: 650 },
    ]);
    const cover = async (x: number, y: number, width: number, height: number) =>
      data(
        await emitAck(gm, 'cover:create', { sceneId, typeId: 'car', x, y, width, height }),
        'cover:create',
      );
    await cover(500, 400, 100, 70);
    await cover(700, 300, 100, 100);
  });

  it('podaje pola ponad barierą i osłoną, bez ściany, drzwi i lądowania w osłonie', async () => {
    expect(data(await options(), 'options')).toEqual({
      options: [
        { dx: 0, dy: -1, x: 500, y: 300 },
        { dx: 1, dy: 0, x: 700, y: 500 },
        { dx: 1, dy: 1, x: 700, y: 700 },
      ],
      refusal: null,
    });
  });

  it('skok przez ścianę, drzwi albo do osłony wraca odmową i niczego nie bierze', async () => {
    refill();
    expect(await jump(-1, 0)).toEqual({ ok: false, error: 'MOVE_BLOCKED_BY_TERRAIN' });
    expect(await jump(0, 1)).toEqual({ ok: false, error: 'MOVE_BLOCKED_BY_TERRAIN' });
    expect(await jump(1, -1)).toEqual({ ok: false, error: 'MOVE_BLOCKED_BY_TERRAIN' });
    expect(await jump(2, 0)).toEqual({ ok: false, error: 'BAD_REQUEST' });
    expect(paceOwedNow(vexTokenId, CAP_M)).toBe(0);
  });

  it('skok ponad barierą ląduje dwie kratki dalej i płaci 8 m z puli', async () => {
    refill();
    const gmSaw = waitFor<{ tokenId: string; x: number; y: number; final: boolean }>(
      gm,
      'token:move',
    );
    expect(await jump(1, 0)).toEqual({ ok: true, data: { x: 700, y: 500 } });
    expect(await gmSaw).toMatchObject({ tokenId: vexTokenId, x: 700, y: 500, final: true });
    expect(paceOwedNow(vexTokenId, CAP_M)).toBeCloseTo(8, 5);
    // I z powrotem — ta sama bariera, druga strona.
    expect(await jump(-1, 0)).toEqual({ ok: true, data: { x: 500, y: 500 } });
    expect(paceOwedNow(vexTokenId, CAP_M)).toBeCloseTo(16, 5);
  });

  it('pusta pula: skok czeka na oddech, a lista mówi dlaczego', async () => {
    expect(await jump(1, 0)).toEqual({ ok: false, error: 'MOVE_PACE' });
    const view = data(await options(), 'options');
    expect(view.options).toEqual([]);
    expect(view.refusal).toMatch(/Złap oddech/);
    refill();
    expect(data(await options(), 'options').options).toHaveLength(3);
  });

  it('postać, której pula nie mieści 8 m, nie skacze wcale', async () => {
    await setMove(3);
    const view = data(await options(), 'options');
    expect(view.options).toEqual([]);
    expect(view.refusal).toMatch(/najwyżej 6\u00A0m/);
    expect(await jump(1, 0)).toEqual({ ok: false, error: 'JUMP_NO_METRES' });
    await setMove(10);
  });

  it('na zajętym polu nie wyląduje, przez wroga nie przeskoczy', async () => {
    refill();
    const gang = data(
      await emitAck<TokenView>(gm, 'token:create', { sceneId, name: 'Gang', x: 700, y: 500 }),
      'token:create Gang',
    );
    expect(await jump(1, 0)).toEqual({ ok: false, error: 'MOVE_BLOCKED_BY_FIGURE' });
    // Na drodze skosem (600, 600) — przez wroga się nie skacze.
    await emitAck(gm, 'token:move', { tokenId: gang.id, x: 600, y: 600, final: true });
    expect(await jump(1, 1)).toEqual({ ok: false, error: 'MOVE_BLOCKED_BY_FIGURE' });
    expect(data(await options(), 'options').options).toEqual([
      { dx: 0, dy: -1, x: 500, y: 300 },
      { dx: 1, dy: 0, x: 700, y: 500 },
    ]);
    await emitAck(gm, 'token:delete', { tokenId: gang.id });
  });

  it('Powalony i Stop nie skaczą, a MG przez ścianę też nie', async () => {
    refill();
    await emitAck(gm, 'token:update', { tokenId: vexTokenId, patch: { statuses: ['prone'] } });
    expect(await jump(1, 0)).toEqual({ ok: false, error: 'JUMP_STATUS' });
    expect(data(await options(), 'options').refusal).not.toBeNull();
    await emitAck(gm, 'token:update', { tokenId: vexTokenId, patch: { statuses: [] } });

    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMove: 'stop' } });
    expect(await jump(1, 0)).toEqual({ ok: false, error: 'MOVE_LOCKED' });
    expect(data(await options(), 'options').refusal).toBe('Ruch wstrzymany przez MG.');
    // MG Stop nie wiąże — ale ściana tak.
    expect(await jump(-1, 0, gm)).toEqual({ ok: false, error: 'MOVE_BLOCKED_BY_TERRAIN' });
    expect(await jump(0, -1, gm)).toEqual({ ok: true, data: { x: 500, y: 300 } });
    await home();
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMove: 'explore' } });
  });

  it('w walce płaci z dystansu tury, pada na czacie i kończy się z metrami', async () => {
    refill();
    // Ganger daleko na zachodzie, szybszy od Vexa — pierwsza tura jest jego.
    const gang = data(
      await emitAck<TokenView>(gm, 'token:create', { sceneId, name: 'Gang', x: 100, y: 1500 }),
      'token:create Gang',
    );
    const combat = data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId,
        tokenIds: [vexTokenId, gang.id],
      }),
      'combat:start',
    );
    const rowOf = (tokenId: string) => {
      const row = combat.combatants.find((entry: CombatantView) => entry.tokenId === tokenId);
      if (!row) throw new Error('participant missing from the tracker');
      return row;
    };
    await emitAck(gm, 'combat:set-initiative', {
      combatantId: rowOf(vexTokenId).id,
      initiative: 20,
    });
    await emitAck(gm, 'combat:set-initiative', { combatantId: rowOf(gang.id).id, initiative: 25 });
    data(await emitAck<CombatView>(gm, 'combat:next', {}), 'combat:next');
    expect(await jump(1, 0)).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(data(await options(), 'options').refusal).toBe('To nie jest twoja tura.');
    data(await emitAck<CombatView>(gm, 'combat:next', {}), 'combat:next');

    const line = waitFor<{ message: ChatMessageView }>(vex, 'chat:message');
    expect(await jump(1, 0)).toEqual({ ok: true, data: { x: 700, y: 500 } });
    expect((await line).message).toMatchObject({ kind: 'action', text: 'Skok' });
    // Pula Eksploracji w walce milczy.
    expect(paceOwedNow(vexTokenId, CAP_M)).toBe(0);
    expect((await jump(-1, 0)).ok).toBe(true);
    // 16 z 20 m — na trzeci skok brakuje.
    const view = data(await options(), 'options');
    expect(view.options).toEqual([]);
    expect(view.refusal).toMatch(/^Skok kosztuje 8 m ruchu\. Za daleko o 4 m/);
    expect(await jump(1, 0)).toEqual({ ok: false, error: 'JUMP_NO_METRES' });
    await emitAck(gm, 'combat:end', {});
    await emitAck(gm, 'token:delete', { tokenId: gang.id });
    await home();
  });

  it('pod mgłą skacze się tylko na odsłonięte pole', async () => {
    refill();
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'fog' });
    const painted = await emitAck(gm, 'fog:paint', {
      sceneId,
      shape: { kind: 'rect', mode: 'reveal', x: 400, y: 200, width: 300, height: 500 },
    });
    expect(painted.ok).toBe(true);
    // Na północ odsłonięte (500, 300), na wschód (700, 500) — już nie.
    expect(data(await options(), 'options').options).toEqual([{ dx: 0, dy: -1, x: 500, y: 300 }]);
    expect(await jump(1, 0)).toEqual({ ok: false, error: 'MOVE_INTO_FOG' });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
  });
});
