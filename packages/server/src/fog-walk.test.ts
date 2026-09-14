import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  ChatMessageBroadcast,
  CombatActionLogEntry,
  CombatView,
  InvitationSummary,
  ScenePoint,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * „Tylko po odsłoniętym" on real sockets (GM decision of 13.09.2026).
 *
 * Under painted fog a player's figure walks on revealed floor alone — the route
 * planner's rule, enforced again on the drop, because a drag goes nowhere near
 * the planner. The seam proved here is the one the decision rests on: a step
 * into the black is refused whatever stands there, so a refusal never draws
 * the player a wall they cannot see.
 *
 * The map, on a 100 px grid: a revealed room, a revealed island across two
 * columns of black, and a wall hidden in the black east of the room.
 *
 *          0          1000  1200    1600      2000
 *     0    ┌────────────┐     ┌───────┐
 *          │  revealed  │     │ island│
 *   400    │            │     └───────┘
 *   500    │            │          │   ← hidden wall, x = 1500, y 500–1100
 *          │            │          │
 *  1000    └────────────┘          │
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
    payload: { password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);

  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Kampania mgły' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const invite = (inviteRes.json() as InvitationSummary).token;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: `/api/join/${invite}`,
    payload: { name: 'Vex' },
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
  playerId = (joinRes.json() as { user: { id: string } }).user.id;
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

describe('a player under painted fog walks on revealed floor alone', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let vexTokenId: string;

  function moveVex(
    socket: ClientSocket,
    x: number,
    y: number,
    path?: ScenePoint[],
  ): Promise<SocketAck<{ x: number; y: number }>> {
    return emitAck<{ x: number; y: number }>(socket, 'token:move', {
      tokenId: vexTokenId,
      x,
      y,
      final: true,
      ...(path ? { path } : {}),
    });
  }

  async function positionOfVex(): Promise<{ x: number; y: number }> {
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    await emitAck(gm, 'state:request');
    const token = (await sync).tokens.find((t) => t.id === vexTokenId);
    if (!token) throw new Error('token missing from sync');
    return { x: token.x, y: token.y };
  }

  /** The next refusal card the GM gets — skipping whatever else the fight posts. */
  function refusalCard(ms = 3000): Promise<CombatActionLogEntry> {
    return new Promise((resolve, reject) => {
      const onMessage = (payload: ChatMessageBroadcast) => {
        const entry = payload.message.action as CombatActionLogEntry | undefined;
        if (payload.message.kind !== 'gmaction' || !entry?.refusal) return;
        clearTimeout(timer);
        gm.off('chat:message', onMessage);
        resolve(entry);
      };
      const timer = setTimeout(() => {
        gm.off('chat:message', onMessage);
        reject(new Error('no refusal card'));
      }, ms);
      gm.on('chat:message', onMessage);
    });
  }

  beforeAll(async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    sceneId = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Magazyn' }),
      'scene:create',
    ).id;
    // Mapa otwarta dla graczy (12.09): nowa scena wchodzi zamknięta.
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMoveLocked: false } });
    await emitAck(gm, 'scene:update', {
      sceneId,
      patch: { width: 2000, height: 2000, grid: { sizePx: 100 }, metersPerSquare: 2 },
    });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'fog' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    for (const rect of [
      { x: 0, y: 0, width: 1000, height: 1000 },
      { x: 1200, y: 0, width: 400, height: 400 },
    ]) {
      const painted = await emitAck(gm, 'fog:paint', {
        sceneId,
        shape: { kind: 'rect', mode: 'reveal', ...rect },
      });
      expect(painted.ok).toBe(true);
    }
    const wall = await emitAck(gm, 'wall:create', {
      sceneId,
      kind: 'wall',
      points: [
        { x: 1500, y: 500 },
        { x: 1500, y: 1100 },
      ],
    });
    expect(wall.ok).toBe(true);

    vexTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Vex',
        x: 200,
        y: 200,
        ownerId: playerId,
      }),
      'token:create',
    ).id;
  }, 30_000);

  it('lets the figure walk anywhere on revealed floor', async () => {
    expect((await moveVex(player, 700, 700)).ok).toBe(true);
    expect(await positionOfVex()).toEqual({ x: 700, y: 700 });
  });

  it('refuses a step off revealed floor into the black and leaves the figure where it was', async () => {
    expect(await moveVex(player, 1100, 700)).toEqual({ ok: false, error: 'MOVE_REFUSED' });
    expect(await positionOfVex()).toEqual({ x: 700, y: 700 });
  });

  it('refuses the straight line across a gap of black, though both ends are revealed', async () => {
    expect((await moveVex(gm, 800, 200)).ok).toBe(true);
    expect((await moveVex(player, 1300, 200)).ok).toBe(false);
    expect(await positionOfVex()).toEqual({ x: 800, y: 200 });
  });

  it('judges the route the client reported, not only where it ends', async () => {
    const detour = [
      { x: 1100, y: 200 },
      { x: 1100, y: 800 },
    ];
    expect((await moveVex(player, 800, 800, detour)).ok).toBe(false);
    expect((await moveVex(player, 800, 800, [{ x: 800, y: 500 }])).ok).toBe(true);
  });

  it('lets a figure put down in the black step out onto revealed floor — and no deeper in', async () => {
    expect((await moveVex(gm, 1000, 500)).ok).toBe(true);
    expect((await moveVex(player, 1100, 500)).ok).toBe(false);
    expect((await moveVex(player, 900, 500)).ok).toBe(true);
    expect(await positionOfVex()).toEqual({ x: 900, y: 500 });
  });

  it('never binds the GM', async () => {
    expect((await moveVex(gm, 1700, 1700)).ok).toBe(true);
    expect((await moveVex(gm, 700, 700)).ok).toBe(true);
  });

  it('puts „fog" on the GM’s card in a fight — never the hidden wall the route ran into', async () => {
    data(
      await emitAck<CombatView>(gm, 'combat:start', { sceneId, tokenIds: [vexTokenId] }),
      'combat:start',
    );
    // Before round 1 the GM is still setting the fight up and nothing is
    // enforced or carded (`findCombatantForToken`), so the fight has to begin.
    const begun = data(await emitAck<CombatView>(gm, 'combat:next', {}), 'combat:next');
    expect(begun.round).toBeGreaterThanOrEqual(1);
    const card = refusalCard();
    // Due east from (700, 700): into the black at x = 1000, through the wall at x = 1500.
    expect((await moveVex(player, 1700, 700)).ok).toBe(false);
    const entry = await card;
    expect(entry.refusal?.code).toBe('MOVE_INTO_FOG');
    expect(entry.refusal?.message).not.toContain('Coś stoi na drodze');
    await emitAck(gm, 'combat:end');
  });

  it('stops asking once the GM opens the map', async () => {
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    expect((await moveVex(player, 1100, 700)).ok).toBe(true);
  });
});
