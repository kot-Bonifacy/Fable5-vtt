import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  DrawingClearBroadcast,
  DrawingDeleteBroadcast,
  DrawingUpsertBroadcast,
  DrawingView,
  InvitationSummary,
  SceneView,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import { DRAWING_MAX_PER_SCENE } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Stage 17b smoke tests: map drawings over live sockets.
 *
 * Two things are worth proving here, and neither can be proven in a unit test:
 * that a GM-layer drawing never crosses the wire to a player (not in the live
 * broadcast, not in `state:sync` after a reconnect), and that the eraser's
 * ownership rule is enforced by the server rather than by the toolbar.
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
  ttsTimeoutMs: 5000,
  ttsCacheMaxBytes: 8 * 1024 * 1024,
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
  if (!ack.ok) throw new Error(`${what} failed: ${ack.error}`);
  if (ack.data === undefined) throw new Error(`${what} returned no data`);
  return ack.data;
}

/** Rejection code of an ack — `undefined` when the call actually succeeded. */
function errorOf(ack: SocketAck<unknown>): string | undefined {
  return ack.ok ? undefined : ack.error;
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

/** Round-trips `state:request` → `state:sync`; also flushes earlier emissions. */
async function roundTrip(socket: ClientSocket): Promise<StateSyncPayload> {
  const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
  await emitAck(socket, 'state:request');
  return sync;
}

/** Records every event of a name a socket receives, for leak assertions. */
function record<T>(socket: ClientSocket, event: string): T[] {
  const seen: T[] = [];
  socket.on(event, (payload: T) => seen.push(payload));
  return seen;
}

/** A short freehand stroke — the shape the pencil sends. */
function path(x: number, y: number) {
  return {
    kind: 'path',
    points: [
      { x, y },
      { x: x + 100, y: y + 50 },
    ],
  };
}

const style = { color: '#22d3ee', width: 6, filled: false };

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
    payload: { name: 'Kampania rysunków' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

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
    payload: { name: 'Rogue' },
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

describe('map drawings', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;

  beforeAll(async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Magazyn' }),
      'scene:create',
    );
    sceneId = scene.id;
    // Fog off: this stage is about drawings, and a covered scene only makes the
    // token pushes noisier.
    await emitAck(gm, 'fog:toggle', { sceneId, enabled: false });
    await emitAck(gm, 'scene:activate', { sceneId });
    await roundTrip(player);
  }, 30_000);

  it('shows a player drawing to everyone at the table, the author included', async () => {
    const seen = waitFor<DrawingUpsertBroadcast>(gm, 'drawing:upsert');
    const drawing = data(
      await emitAck<DrawingView>(player, 'drawing:create', {
        sceneId,
        shape: path(100, 100),
        style,
      }),
      'drawing:create',
    );
    expect(drawing.authorId).toBe(playerId);
    expect(drawing.authorName).toBe('Rogue');
    expect(drawing.gmOnly).toBe(false);

    const broadcast = await seen;
    expect(broadcast.drawing.id).toBe(drawing.id);
    // Campaign-wide state, so it is sequenced like a token or a fog shape.
    expect(broadcast.seq).toBeGreaterThan(0);
  });

  it('keeps a GM-layer drawing off the player socket — live and after a resync', async () => {
    const leaked = record<DrawingUpsertBroadcast>(player, 'drawing:upsert');
    const secret = data(
      await emitAck<DrawingView>(gm, 'drawing:create', {
        sceneId,
        shape: { kind: 'text', x: 500, y: 500, text: 'zasadzka', fontSize: 60 },
        style,
        gmOnly: true,
      }),
      'drawing:create',
    );
    expect(secret.gmOnly).toBe(true);

    // The GM sees it; the player must not, in any shape.
    const gmSync = await roundTrip(gm);
    expect(gmSync.drawings.map((d) => d.id)).toContain(secret.id);

    const playerSync = await roundTrip(player);
    expect(playerSync.drawings.map((d) => d.id)).not.toContain(secret.id);
    expect(JSON.stringify(playerSync.drawings)).not.toContain('zasadzka');
    expect(leaked.map((b) => b.drawing.id)).not.toContain(secret.id);
  });

  it('refuses the GM layer to a player — the flag is a role, not a request', async () => {
    const drawing = data(
      await emitAck<DrawingView>(player, 'drawing:create', {
        sceneId,
        shape: path(200, 200),
        style,
        gmOnly: true,
      }),
      'drawing:create',
    );
    expect(drawing.gmOnly).toBe(false);
    const gmSync = await roundTrip(gm);
    expect(gmSync.drawings.find((d) => d.id === drawing.id)?.gmOnly).toBe(false);
  });

  it('survives a restart of the connection: drawings come back in paint order', async () => {
    const sync = await roundTrip(player);
    const ids = sync.drawings.map((d) => d.id);
    expect(ids.length).toBeGreaterThan(1);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);

    const reconnected = createSocket(playerCookie);
    const fresh = await reconnected.firstSync;
    expect(fresh.drawings.map((d) => d.id)).toEqual(ids);
    reconnected.socket.disconnect();
  });

  it('lets the author erase their own drawing and refuses a foreign one', async () => {
    const mine = data(
      await emitAck<DrawingView>(player, 'drawing:create', {
        sceneId,
        shape: path(300, 300),
        style,
      }),
      'drawing:create',
    );
    const gmPublic = data(
      await emitAck<DrawingView>(gm, 'drawing:create', { sceneId, shape: path(400, 400), style }),
      'drawing:create',
    );

    const refused = await emitAck(player, 'drawing:delete', { drawingId: gmPublic.id });
    expect(refused.ok).toBe(false);
    expect(errorOf(refused)).toBe('FORBIDDEN');

    const removed = waitFor<DrawingDeleteBroadcast>(gm, 'drawing:delete');
    expect((await emitAck(player, 'drawing:delete', { drawingId: mine.id })).ok).toBe(true);
    expect((await removed).drawingId).toBe(mine.id);

    // …and the GM erases anyone's.
    expect((await emitAck(gm, 'drawing:delete', { drawingId: gmPublic.id })).ok).toBe(true);
    const sync = await roundTrip(player);
    expect(sync.drawings.map((d) => d.id)).not.toContain(gmPublic.id);
  });

  it("clears only the caller's drawings on „wyczyść moje”", async () => {
    const playerDrawing = data(
      await emitAck<DrawingView>(player, 'drawing:create', { sceneId, shape: path(10, 10), style }),
      'drawing:create',
    );
    const gmDrawing = data(
      await emitAck<DrawingView>(gm, 'drawing:create', { sceneId, shape: path(20, 20), style }),
      'drawing:create',
    );

    const cleared = waitFor<DrawingClearBroadcast>(gm, 'drawing:clear');
    expect((await emitAck(player, 'drawing:clear', { sceneId, scope: 'mine' })).ok).toBe(true);
    expect((await cleared).authorId).toBe(playerId);

    const sync = await roundTrip(gm);
    const ids = sync.drawings.map((d) => d.id);
    expect(ids).not.toContain(playerDrawing.id);
    expect(ids).toContain(gmDrawing.id);
    expect(sync.drawings.every((d) => d.authorId !== playerId)).toBe(true);
  });

  it('refuses „wyczyść wszystko" to a player and performs it for the GM', async () => {
    const refused = await emitAck(player, 'drawing:clear', { sceneId, scope: 'all' });
    expect(refused.ok).toBe(false);
    expect(errorOf(refused)).toBe('FORBIDDEN');

    const cleared = waitFor<DrawingClearBroadcast>(player, 'drawing:clear');
    expect((await emitAck(gm, 'drawing:clear', { sceneId, scope: 'all' })).ok).toBe(true);
    expect((await cleared).authorId).toBeNull();

    // The sweep takes the GM layer with it — nothing is left on the scene.
    expect((await roundTrip(gm)).drawings).toEqual([]);
    expect((await roundTrip(player)).drawings).toEqual([]);
  });

  it('rejects a malformed shape and an unknown drawing id', async () => {
    const bad = await emitAck(player, 'drawing:create', {
      sceneId,
      shape: { kind: 'cone', x: 0, y: 0 },
      style,
    });
    expect(bad.ok).toBe(false);
    expect(errorOf(bad)).toBe('BAD_REQUEST');

    const missing = await emitAck(player, 'drawing:delete', { drawingId: 999_999 });
    expect(missing.ok).toBe(false);
    expect(errorOf(missing)).toBe('DRAWING_NOT_FOUND');
  });

  it('refuses to draw on a scene the socket is not viewing', async () => {
    const other = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Inna scena' }),
      'scene:create',
    );
    const refused = await emitAck(player, 'drawing:create', {
      sceneId: other.id,
      shape: path(0, 0),
      style,
    });
    expect(refused.ok).toBe(false);
    expect(errorOf(refused)).toBe('SCENE_NOT_VIEWED');
  });

  it('caps how many drawings one scene may hold', async () => {
    // Filling the table through sockets would take a minute; the cap itself is
    // what matters, so the rows go in directly and one live call meets it.
    const rows = Array.from({ length: DRAWING_MAX_PER_SCENE }, () => ({
      sceneId,
      authorId: playerId,
      kind: 'path',
      data: JSON.stringify({ points: [{ x: 1, y: 1 }] }),
      color: '#22d3ee',
      width: 6,
      filled: false,
      gmOnly: false,
    }));
    await built.prisma.mapDrawing.createMany({ data: rows });

    const refused = await emitAck(player, 'drawing:create', { sceneId, shape: path(1, 1), style });
    expect(refused.ok).toBe(false);
    expect(errorOf(refused)).toBe('DRAWING_LIMIT_REACHED');

    // …and the GM's sweep brings the scene back under the cap.
    expect((await emitAck(gm, 'drawing:clear', { sceneId, scope: 'all' })).ok).toBe(true);
    expect(
      (await emitAck(player, 'drawing:create', { sceneId, shape: path(1, 1), style })).ok,
    ).toBe(true);
  }, 20_000);
});
