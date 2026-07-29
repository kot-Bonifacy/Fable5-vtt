import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  InvitationSummary,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
  VisionSyncBroadcast,
  WallView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Stage 18a smoke tests: walls, doors and the field of view, over live sockets.
 *
 * The point is not that the polygon is pretty — `shared/vision.test.ts` covers
 * the geometry. What is tested here is the promise the architecture makes: a
 * player's socket never receives the floor plan, and never receives a token
 * standing behind a wall. Every assertion looks at what actually crossed the
 * wire.
 *
 * The map every test shares: a 1000×1000 room whose left wall has a door in it,
 * the player standing due west of that door, an NPC in the middle of the room.
 *
 *        1000        2000
 *   1000  ┌───────────┐
 *         │           │
 *   1400  ╡  (door)   │
 *   1500  ·  · NPC ·  │      ← the player is at (500, 1500), off to the left
 *   1600  ╡           │
 *         │           │
 *   2000  └───────────┘
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

function waitFor<T>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function roundTrip(socket: ClientSocket): Promise<StateSyncPayload> {
  const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
  await emitAck(socket, 'state:request');
  return sync;
}

/** The rejection code of an ack, or undefined when it succeeded. */
function errorOf(ack: SocketAck<unknown>): string | undefined {
  return ack.ok ? undefined : ack.error;
}

function record<T>(socket: ClientSocket, event: string): T[] {
  const seen: T[] = [];
  socket.on(event, (payload: T) => seen.push(payload));
  return seen;
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
    payload: { name: 'Kampania ścian' },
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

describe('walls and dynamic vision', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  /** In the middle of the sealed room, centre (1500, 1500). */
  let npcTokenId: string;
  /** The player's own, centre (500, 1500) — due west of the door. */
  let ownTokenId: string;
  /** The door in the room's left wall, flagged as the players' to open. */
  let doorId: number;
  /** A door in plain sight the GM did *not* flag. */
  let lockedDoorId: number;
  /** A flagged door far away, behind the room — visible to nobody. */
  let farDoorId: number;

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
    await emitAck(gm, 'scene:update', {
      sceneId,
      patch: { width: 4000, height: 4000, grid: { sizePx: 100 }, metersPerSquare: 2 },
    });
    await emitAck(gm, 'scene:activate', { sceneId });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'dynamic' });

    // The room: three sides plus the two stubs of the left wall around the door.
    await emitAck(gm, 'wall:create', {
      sceneId,
      kind: 'wall',
      points: [
        { x: 1000, y: 1000 },
        { x: 2000, y: 1000 },
        { x: 2000, y: 2000 },
        { x: 1000, y: 2000 },
        { x: 1000, y: 1600 },
      ],
    });
    await emitAck(gm, 'wall:create', {
      sceneId,
      kind: 'wall',
      points: [
        { x: 1000, y: 1400 },
        { x: 1000, y: 1000 },
      ],
    });
    doorId = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId,
        kind: 'door',
        playerToggle: true,
        points: [
          { x: 1000, y: 1400 },
          { x: 1000, y: 1600 },
        ],
      }),
      'wall:create door',
    )[0]!.id;
    lockedDoorId = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId,
        kind: 'door',
        points: [
          { x: 400, y: 1000 },
          { x: 600, y: 1000 },
        ],
      }),
      'wall:create locked door',
    )[0]!.id;
    farDoorId = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId,
        kind: 'door',
        playerToggle: true,
        points: [
          { x: 3000, y: 3000 },
          { x: 3000, y: 3200 },
        ],
      }),
      'wall:create far door',
    )[0]!.id;

    npcTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', { sceneId, name: 'Ganger', x: 1450, y: 1450 }),
      'token:create',
    ).id;
    ownTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Rogue',
        x: 450,
        y: 1450,
        ownerId: playerId,
      }),
      'token:create',
    ).id;
    await roundTrip(player);
  }, 30_000);

  it('never sends a player the floor plan', async () => {
    const leaked = record<unknown>(player, 'wall:sync');
    await roundTrip(gm);
    const sync = await roundTrip(player);

    expect(sync.walls).toEqual([]);
    expect(leaked).toEqual([]);
    // The GM has the same walls the player was not given.
    const gmSync = await roundTrip(gm);
    expect(gmSync.walls.length).toBe(8);
    // Not one wall id crossed to the player in any shape, doors excepted.
    const doorIds = new Set(sync.doors.map((door) => door.id));
    for (const wall of gmSync.walls) {
      if (doorIds.has(wall.id)) continue;
      expect(JSON.stringify(sync)).not.toContain(`"id":${wall.id},"sceneId"`);
    }
  });

  it('hides a token behind a closed door — in the payload, not just on screen', async () => {
    const sync = await roundTrip(player);
    expect(sync.scene?.visibility).toBe('dynamic');
    // Own token always; the NPC sealed in the room never.
    expect(sync.tokens.map((t) => t.id)).toEqual([ownTokenId]);
    expect(sync.vision?.polygons.length).toBe(1);
    expect(sync.vision?.polygons[0]!.length).toBeGreaterThan(3);
  });

  it('opening the door reveals the room and the NPC in it', async () => {
    const pushed = waitFor<{ sceneId: string; tokens: TokenView[] }>(player, 'token:sync');
    data(await emitAck<WallView>(gm, 'door:toggle', { wallId: doorId, open: true }), 'door:toggle');
    expect((await pushed).tokens.map((t) => t.id)).toContain(npcTokenId);

    const sync = await roundTrip(player);
    expect(sync.tokens.map((t) => t.id)).toContain(npcTokenId);

    // …and closing it takes the NPC away again.
    await emitAck(gm, 'door:toggle', { wallId: doorId, open: false });
    const closed = await roundTrip(player);
    expect(closed.tokens.map((t) => t.id)).not.toContain(npcTokenId);
  });

  it('gives a player only the doors they may open and can actually see', async () => {
    const sync = await roundTrip(player);
    const ids = sync.doors.map((door) => door.id);
    expect(ids).toContain(doorId);
    // Flagged, but the room stands between the player and it.
    expect(ids).not.toContain(farDoorId);
    // In plain sight, but the GM never handed it over.
    expect(ids).not.toContain(lockedDoorId);
  });

  it('lets a player work their door, and refuses the other two', async () => {
    expect((await emitAck(player, 'door:toggle', { wallId: doorId })).ok).toBe(true);
    expect((await emitAck(player, 'door:toggle', { wallId: doorId })).ok).toBe(true);

    expect(errorOf(await emitAck(player, 'door:toggle', { wallId: lockedDoorId }))).toBe(
      'FORBIDDEN',
    );
    // A door out of sight is refused like a token out of sight: the rejection
    // must not become a way to learn it is there.
    expect(errorOf(await emitAck(player, 'door:toggle', { wallId: farDoorId }))).toBe(
      'WALL_NOT_FOUND',
    );
  });

  it('is GM-only for everything except opening a door', async () => {
    expect(
      (
        await emitAck(player, 'wall:create', {
          sceneId,
          kind: 'wall',
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
        })
      ).ok,
    ).toBe(false);
    expect((await emitAck(player, 'wall:delete', { wallId: doorId })).ok).toBe(false);
    expect((await emitAck(player, 'wall:clear', { sceneId })).ok).toBe(false);
    expect(
      (await emitAck(player, 'wall:update', { wallId: doorId, patch: { kind: 'window' } })).ok,
    ).toBe(false);
    expect((await emitAck(player, 'scene:visibility', { sceneId, visibility: 'open' })).ok).toBe(
      false,
    );
  });

  it('honours a token sight range', async () => {
    await emitAck(gm, 'door:toggle', { wallId: doorId, open: true });
    // 4 m at 2 m per 100 px square = 200 px: short of the door, 500 px away.
    await emitAck(gm, 'token:update', { tokenId: ownTokenId, patch: { visionRange: 4 } });
    const near = await roundTrip(player);
    expect(near.tokens.map((t) => t.id)).not.toContain(npcTokenId);
    expect(near.doors.map((d) => d.id)).not.toContain(doorId);

    // Back to „as far as the walls allow" and the open door does its job.
    await emitAck(gm, 'token:update', { tokenId: ownTokenId, patch: { visionRange: null } });
    const far = await roundTrip(player);
    expect(far.tokens.map((t) => t.id)).toContain(npcTokenId);
    await emitAck(gm, 'door:toggle', { wallId: doorId, open: false });
  });

  it('never streams a concealed token to a player, not even mid-drag', async () => {
    const moves = record<{ tokenId: string }>(player, 'token:move');
    const upserts = record<{ token: TokenView }>(player, 'token:upsert');

    // The GM walks the NPC around inside the sealed room.
    await emitAck(gm, 'token:move', { tokenId: npcTokenId, x: 1200, y: 1200, final: false });
    await emitAck(gm, 'token:move', { tokenId: npcTokenId, x: 1700, y: 1700, final: false });
    await emitAck(gm, 'token:move', { tokenId: npcTokenId, x: 1450, y: 1450, final: true });
    await emitAck(gm, 'token:update', { tokenId: npcTokenId, patch: { name: 'Ganger z nożem' } });
    await roundTrip(player);

    expect(moves.filter((m) => m.tokenId === npcTokenId)).toEqual([]);
    expect(upserts.filter((u) => u.token.id === npcTokenId)).toEqual([]);
  });

  it('sends the player a fresh field of view as their own token moves', async () => {
    const pushed = waitFor<VisionSyncBroadcast>(player, 'vision:sync');
    await emitAck(player, 'token:move', { tokenId: ownTokenId, x: 450, y: 1050, final: true });
    const vision = await pushed;
    expect(vision.sceneId).toBe(sceneId);
    expect(vision.polygons).toHaveLength(1);
    await emitAck(player, 'token:move', { tokenId: ownTokenId, x: 450, y: 1450, final: true });
  });

  it('shows a player with no token on the scene nothing at all', async () => {
    await emitAck(gm, 'token:update', { tokenId: ownTokenId, patch: { ownerId: null } });
    const blind = await roundTrip(player);
    expect(blind.vision?.polygons).toEqual([]);
    expect(blind.tokens).toEqual([]);
    expect(blind.doors).toEqual([]);

    await emitAck(gm, 'token:update', { tokenId: ownTokenId, patch: { ownerId: playerId } });
    const restored = await roundTrip(player);
    expect(restored.tokens.map((t) => t.id)).toEqual([ownTokenId]);
  });

  it('keeps walls and door states across a reconnect', async () => {
    await emitAck(gm, 'door:toggle', { wallId: doorId, open: true });
    const fresh = createSocket(gmCookie);
    const sync = await fresh.firstSync;
    expect(sync.walls.length).toBe(8);
    expect(sync.walls.find((wall) => wall.id === doorId)?.open).toBe(true);
    expect(sync.walls.filter((wall) => wall.kind === 'door')).toHaveLength(3);
    await emitAck(gm, 'door:toggle', { wallId: doorId, open: false });
  });

  it('erases one wall and then the lot', async () => {
    const before = (await roundTrip(gm)).walls.length;
    await emitAck(gm, 'wall:delete', { wallId: lockedDoorId });
    expect((await roundTrip(gm)).walls.length).toBe(before - 1);

    await emitAck(gm, 'wall:clear', { sceneId });
    const cleared = await roundTrip(gm);
    expect(cleared.walls).toEqual([]);
    // With nothing left to block the view, the NPC is in plain sight.
    const sync = await roundTrip(player);
    expect(sync.tokens.map((t) => t.id)).toContain(npcTokenId);
  });

  it('rejects a chain that is not a wall', async () => {
    expect((await emitAck(gm, 'wall:create', { sceneId, points: [{ x: 1, y: 1 }] })).ok).toBe(
      false,
    );
    expect((await emitAck(gm, 'wall:create', { sceneId, points: 'nope' })).ok).toBe(false);
    expect(
      (
        await emitAck(gm, 'wall:create', {
          sceneId,
          points: [
            { x: 1, y: Number.NaN },
            { x: 2, y: 2 },
          ],
        })
      ).ok,
    ).toBe(false);
    expect((await roundTrip(gm)).walls).toEqual([]);
  });
});
