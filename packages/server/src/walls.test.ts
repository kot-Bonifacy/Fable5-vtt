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
  BlockerSyncBroadcast,
  LightView,
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
  /** A door in plain sight the GM did *not* flag as the players'. */
  let privateDoorId: number;
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
    // Mapa otwarta dla graczy (12.09): nowa scena wchodzi **zamknięta**, a ten
    // zestaw jest o ruchu figur, nie o blokadzie.
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMoveLocked: false } });
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
    privateDoorId = data(
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

  /**
   * Walls stop bodies, not only sight (sesja naprawcza 21.08).
   *
   * Until this was enforced the server took any drop it could clamp: a player
   * could pull their figure through the wall of a room they had never entered.
   * The route planner of 16e already knew better, but a drag never asks it.
   */
  it('refuses a player dragged through a closed door, and allows it once open', async () => {
    await emitAck(gm, 'opening:toggle', { wallId: doorId, open: false });
    // Rogue stands at x = 450, the door is the gap at x = 1000 between
    // y = 1400 and y = 1600, and the NPC waits inside at x = 1450.
    const refused = await emitAck(player, 'token:move', {
      tokenId: ownTokenId,
      x: 1450,
      y: 1450,
      final: true,
    });
    expect(errorOf(refused)).toBe('MOVE_REFUSED');

    await emitAck(gm, 'opening:toggle', { wallId: doorId, open: true });
    const allowed = await emitAck(player, 'token:move', {
      tokenId: ownTokenId,
      x: 1450,
      y: 1450,
      final: true,
    });
    expect(allowed.ok).toBe(true);

    // The refusal says nothing about *what* stopped them: a player who cannot
    // see a wall must not map the building by bumping into it.
    expect(JSON.stringify(refused)).not.toContain('door');
    expect(JSON.stringify(refused)).not.toContain('1000');

    await emitAck(gm, 'opening:toggle', { wallId: doorId, open: false });
    await emitAck(gm, 'token:move', { tokenId: ownTokenId, x: 450, y: 1450, final: true });
  });

  /**
   * Stage 27j's open end, closed 22.08: the check traced the centre of the
   * figure, so a 2×2 token walked through the wall with half of itself while
   * its middle went through the gap. Same drag, same door, two sizes.
   */
  it('refuses a 2×2 figure the gap its centre would fit through', async () => {
    await emitAck(gm, 'opening:toggle', { wallId: doorId, open: true });
    // Narrow the doorway from below: what is left of the gap is y = 1400…1520,
    // wide enough for one figure and not for two abreast. Deliberately off the
    // grid — a stub ending exactly on the centre line would refuse both sizes
    // and prove nothing.
    const stubId = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId,
        kind: 'wall',
        points: [
          { x: 1000, y: 1520 },
          { x: 1000, y: 1600 },
        ],
      }),
      'wall:create stub',
    )[0]!.id;

    try {
      await emitAck(gm, 'token:move', { tokenId: ownTokenId, x: 400, y: 1400, final: true });
      const oneByOne = await emitAck(player, 'token:move', {
        tokenId: ownTokenId,
        x: 1400,
        y: 1400,
        final: true,
      });
      expect(oneByOne.ok).toBe(true);

      await emitAck(gm, 'token:move', { tokenId: ownTokenId, x: 400, y: 1400, final: true });
      await emitAck(gm, 'token:update', { tokenId: ownTokenId, patch: { size: 2 } });
      const twoByTwo = await emitAck(player, 'token:move', {
        tokenId: ownTokenId,
        x: 1400,
        y: 1400,
        final: true,
      });
      // Its centre walks the same clear line; its lower half walks into the stub.
      expect(errorOf(twoByTwo)).toBe('MOVE_REFUSED');
      // …and says nothing about what stopped it, like every refusal in here.
      expect(JSON.stringify(twoByTwo)).not.toContain('1520');
    } finally {
      // Unconditionally: the scene is shared with every test below, and a
      // stray stub wall would make five of them fail for the wrong reason.
      await emitAck(gm, 'token:update', { tokenId: ownTokenId, patch: { size: 1 } });
      await emitAck(gm, 'wall:delete', { wallId: stubId });
      await emitAck(gm, 'opening:toggle', { wallId: doorId, open: false });
      await emitAck(gm, 'token:move', { tokenId: ownTokenId, x: 450, y: 1450, final: true });
    }
  });

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
    const doorIds = new Set(sync.openings.map((door) => door.id));
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
    data(
      await emitAck<WallView>(gm, 'opening:toggle', { wallId: doorId, open: true }),
      'opening:toggle',
    );
    expect((await pushed).tokens.map((t) => t.id)).toContain(npcTokenId);

    const sync = await roundTrip(player);
    expect(sync.tokens.map((t) => t.id)).toContain(npcTokenId);

    // …and closing it takes the NPC away again.
    await emitAck(gm, 'opening:toggle', { wallId: doorId, open: false });
    const closed = await roundTrip(player);
    expect(closed.tokens.map((t) => t.id)).not.toContain(npcTokenId);
  });

  it('gives a player only the doors they may open and can actually see', async () => {
    const sync = await roundTrip(player);
    const ids = sync.openings.map((door) => door.id);
    expect(ids).toContain(doorId);
    // Flagged, but the room stands between the player and it.
    expect(ids).not.toContain(farDoorId);
    // In plain sight, but the GM never handed it over.
    expect(ids).not.toContain(privateDoorId);
  });

  it('refuses a door the player can see but is standing 10 m from (stage 18d)', async () => {
    // The token has not moved: it is at (500, 1500) and the door is at x = 1000,
    // which on a 2 m square of 100 px is ten metres of corridor.
    expect((await roundTrip(player)).openings.map((door) => door.id)).toContain(doorId);
    expect(errorOf(await emitAck(player, 'opening:toggle', { wallId: doorId }))).toBe(
      'OPENING_OUT_OF_REACH',
    );
  });

  it('lets the same player work the same door once they walk up to it', async () => {
    // One square west of the door: 2 m from its nearest point, arm's reach.
    await emitAck(player, 'token:move', { tokenId: ownTokenId, x: 850, y: 1450, final: true });
    expect((await emitAck(player, 'opening:toggle', { wallId: doorId })).ok).toBe(true);
    expect((await emitAck(player, 'opening:toggle', { wallId: doorId })).ok).toBe(true);
    await emitAck(player, 'token:move', { tokenId: ownTokenId, x: 450, y: 1450, final: true });
  });

  it('refuses the other two doors for reasons that give nothing away', async () => {
    expect(errorOf(await emitAck(player, 'opening:toggle', { wallId: privateDoorId }))).toBe(
      'FORBIDDEN',
    );
    // A door out of sight is refused like a token out of sight: the rejection
    // must not become a way to learn it is there.
    expect(errorOf(await emitAck(player, 'opening:toggle', { wallId: farDoorId }))).toBe(
      'WALL_NOT_FOUND',
    );
  });

  it('bolts a door: the player is refused, the GM is not (stage 18d)', async () => {
    await emitAck(player, 'token:move', { tokenId: ownTokenId, x: 850, y: 1450, final: true });
    data(
      await emitAck<WallView>(gm, 'wall:update', { wallId: doorId, patch: { locked: true } }),
      'wall:update lock',
    );

    expect(errorOf(await emitAck(player, 'opening:toggle', { wallId: doorId }))).toBe(
      'OPENING_LOCKED',
    );
    // The GM works a bolted door normally — the bolt is the players' problem.
    const opened = data(
      await emitAck<WallView>(gm, 'opening:toggle', { wallId: doorId, open: true }),
      'opening:toggle by gm',
    );
    expect(opened.open).toBe(true);
    expect(opened.locked).toBe(true);

    // Unbolting hands it back to the player, who is still standing at the handle.
    await emitAck(gm, 'wall:update', { wallId: doorId, patch: { locked: false } });
    expect((await emitAck(player, 'opening:toggle', { wallId: doorId })).ok).toBe(true);
    await emitAck(gm, 'opening:toggle', { wallId: doorId, open: false });
    await emitAck(player, 'token:move', { tokenId: ownTokenId, x: 450, y: 1450, final: true });
  });

  it('the reach check runs before the bolt, so „too far" never leaks „locked"', async () => {
    await emitAck(gm, 'wall:update', { wallId: doorId, patch: { locked: true } });
    // Standing 10 m away, the answer must be the distance and nothing else: which
    // doors are worth breaking into is not something to be probed by clicking.
    expect(errorOf(await emitAck(player, 'opening:toggle', { wallId: doorId }))).toBe(
      'OPENING_OUT_OF_REACH',
    );
    await emitAck(gm, 'wall:update', { wallId: doorId, patch: { locked: false } });
  });

  it('shuts an open door when it is bolted', async () => {
    await emitAck(gm, 'opening:toggle', { wallId: doorId, open: true });
    const bolted = data(
      await emitAck<WallView>(gm, 'wall:update', { wallId: doorId, patch: { locked: true } }),
      'wall:update lock open door',
    );
    expect(bolted.open).toBe(false);
    await emitAck(gm, 'wall:update', { wallId: doorId, patch: { locked: false } });
  });

  it('never tells a player whether a door is bolted', async () => {
    await emitAck(gm, 'wall:update', { wallId: doorId, patch: { locked: true } });
    const sync = await roundTrip(player);
    const door = sync.openings.find((entry) => entry.id === doorId);
    // The door itself still travels — a door you cannot see is a door you cannot
    // try — but the bolt is scrubbed out of it.
    expect(door).toBeDefined();
    expect(door?.locked).toBe(false);
    expect(JSON.stringify(sync.openings)).not.toContain('"locked":true');
    // The GM's own list carries the truth.
    const gmSync = await roundTrip(gm);
    expect(gmSync.walls.find((wall) => wall.id === doorId)?.locked).toBe(true);
    await emitAck(gm, 'wall:update', { wallId: doorId, patch: { locked: false } });
  });

  it('drops the bolt when a door is retyped into something that cannot have one', async () => {
    await emitAck(gm, 'wall:update', { wallId: privateDoorId, patch: { locked: true } });
    const asWall = data(
      await emitAck<WallView>(gm, 'wall:update', {
        wallId: privateDoorId,
        patch: { kind: 'wall' },
      }),
      'wall:update retype',
    );
    expect(asWall.locked).toBe(false);
    // …and a bolt cannot be put on a wall in the first place.
    const stillUnlocked = data(
      await emitAck<WallView>(gm, 'wall:update', {
        wallId: privateDoorId,
        patch: { locked: true },
      }),
      'wall:update lock a wall',
    );
    expect(stillUnlocked.locked).toBe(false);
    await emitAck(gm, 'wall:update', { wallId: privateDoorId, patch: { kind: 'door' } });
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
    await emitAck(gm, 'opening:toggle', { wallId: doorId, open: true });
    // 4 m at 2 m per 100 px square = 200 px: short of the door, 500 px away.
    await emitAck(gm, 'token:update', { tokenId: ownTokenId, patch: { visionRange: 4 } });
    const near = await roundTrip(player);
    expect(near.tokens.map((t) => t.id)).not.toContain(npcTokenId);
    expect(near.openings.map((d) => d.id)).not.toContain(doorId);

    // Back to „as far as the walls allow" and the open door does its job.
    await emitAck(gm, 'token:update', { tokenId: ownTokenId, patch: { visionRange: null } });
    const far = await roundTrip(player);
    expect(far.tokens.map((t) => t.id)).toContain(npcTokenId);
    await emitAck(gm, 'opening:toggle', { wallId: doorId, open: false });
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
    expect(blind.openings).toEqual([]);

    await emitAck(gm, 'token:update', { tokenId: ownTokenId, patch: { ownerId: playerId } });
    const restored = await roundTrip(player);
    expect(restored.tokens.map((t) => t.id)).toEqual([ownTokenId]);
  });

  it('keeps walls and door states across a reconnect', async () => {
    await emitAck(gm, 'opening:toggle', { wallId: doorId, open: true });
    const fresh = createSocket(gmCookie);
    const sync = await fresh.firstSync;
    expect(sync.walls.length).toBe(8);
    expect(sync.walls.find((wall) => wall.id === doorId)?.open).toBe(true);
    expect(sync.walls.filter((wall) => wall.kind === 'door')).toHaveLength(3);
    await emitAck(gm, 'opening:toggle', { wallId: doorId, open: false });
  });

  it('moves a segment from its card, and refuses one squashed to a point', async () => {
    const moved = data(
      await emitAck<WallView>(gm, 'wall:update', {
        wallId: farDoorId,
        patch: { x1: 100, y1: 200, x2: 300, y2: 200 },
      }),
      'wall:update geometry',
    );
    expect([moved.x1, moved.y1, moved.x2, moved.y2]).toEqual([100, 200, 300, 200]);
    // Retypowanie i przesunięcie w jednym patchu — karta wysyła, co widzi.
    const retyped = data(
      await emitAck<WallView>(gm, 'wall:update', {
        wallId: farDoorId,
        patch: { kind: 'window', y2: 400 },
      }),
      'wall:update kind + geometry',
    );
    expect(retyped.kind).toBe('window');
    expect([retyped.x1, retyped.y1, retyped.x2, retyped.y2]).toEqual([100, 200, 300, 400]);

    // Odcinek zwinięty do punktu nie zasłania niczego, a raycast dostaje
    // kierunek, którego nie umie policzyć.
    expect(
      errorOf(
        await emitAck(gm, 'wall:update', {
          wallId: farDoorId,
          patch: { x1: 100, y1: 200, x2: 101, y2: 200 },
        }),
      ),
    ).toBe('BAD_REQUEST');
    expect(
      errorOf(await emitAck(gm, 'wall:update', { wallId: farDoorId, patch: { x2: 'daleko' } })),
    ).toBe('BAD_REQUEST');

    // Przywrócone, żeby dalsze testy zastały ścianę tam, gdzie ją zostawiły.
    await emitAck(gm, 'wall:update', { wallId: farDoorId, patch: { kind: 'door' } });
  });

  it('erases one wall and then the lot', async () => {
    const before = (await roundTrip(gm)).walls.length;
    await emitAck(gm, 'wall:delete', { wallId: privateDoorId });
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

/**
 * Stage 18d: the net curtain in a window, asserted on the token payload rather
 * than on the polygon — the question is whether the NPC behind the glass is a
 * row the player's socket receives at all.
 *
 * A shop front on a 4000×4000 map, one metre to fifty pixels:
 *
 *        2000        3000
 *   1000  ┌───────────┐
 *         ┊           │      ┊ = the window, x = 2000, y 1000…2000
 *   1500  ┊    NPC    │      the street runs north–south to the west
 *         ┊           │
 *   2000  └───────────┘
 */
/**
 * Stage 42a: a barrier stops a body, not an eye.
 *
 * The yard: a fence along x = 1000 with a gate in it at y 1400…1600, the player
 * west of the gate right under a free-standing window, a guard in the yard, and a
 * sealed room far to the south-east with another fence locked inside it.
 *
 * Positions are what the server snaps them to: a token asked for at (450, 1450)
 * lands on (500, 1500) — `Math.round(4.5)` is 5 — so its middle is (550, 1550).
 *
 *            1000
 *   1000      ║            ║ = barrier, ┆ = gate, ─ = window (y = 1480, x 300…700)
 *   1480  ──  ┆
 *   1550  ·   ┆   · guard
 *   1600      ║
 *   2000      ║                         ┌────┐ (3000…3800)
 *                                       │ ║  │ ← a fence nobody can see
 *                                       └────┘
 */
describe('a barrier stops a body, not an eye (stage 42a)', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let ownTokenId: string;
  let guardTokenId: string;
  let gateId: number;

  const NORTH = { x1: 1000, y1: 1000, x2: 1000, y2: 1400 };
  const GATE = { x1: 1000, y1: 1400, x2: 1000, y2: 1600 };
  const SOUTH = { x1: 1000, y1: 1600, x2: 1000, y2: 2000 };
  // 70 px (1,4 m) above the player's middle at (550, 1550) — inside arm's reach
  // with room to spare, so the curtain never hinges on a boundary.
  const PANE = { x1: 300, y1: 1480, x2: 700, y2: 1480 };
  const LOCKED_IN = { x1: 3400, y1: 3100, x2: 3400, y2: 3700 };

  type Seg = { x1: number; y1: number; x2: number; y2: number };
  const pointsOf = (segment: Seg) => [
    { x: segment.x1, y: segment.y1 },
    { x: segment.x2, y: segment.y2 },
  ];
  const has = (segments: Seg[], wanted: Seg) =>
    segments.some(
      (s) => s.x1 === wanted.x1 && s.y1 === wanted.y1 && s.x2 === wanted.x2 && s.y2 === wanted.y2,
    );

  /**
   * The next `blocker:sync` whose list passes `accept`.
   *
   * A move or a door ends with its ack, but the vision push that follows it can
   * land a moment later — a plain `once` placed after a GM's move back to the
   * start caught that stale push instead of the one the test was about.
   */
  function blockersWhere(accept: (segments: Seg[]) => boolean, ms = 3000): Promise<Seg[]> {
    return new Promise((resolve, reject) => {
      const onSync = (payload: BlockerSyncBroadcast) => {
        if (payload.sceneId !== sceneId || !accept(payload.segments)) return;
        clearTimeout(timer);
        player.off('blocker:sync', onSync);
        resolve(payload.segments);
      };
      const timer = setTimeout(() => {
        player.off('blocker:sync', onSync);
        reject(new Error('blocker:sync with the expected list never came'));
      }, ms);
      player.on('blocker:sync', onSync);
    });
  }

  async function moveOwn(socket: ClientSocket, x: number, y: number) {
    return emitAck(socket, 'token:move', { tokenId: ownTokenId, x, y, final: true });
  }

  beforeAll(async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    sceneId = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Plac' }),
      'scene:create',
    ).id;
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMoveLocked: false } });
    await emitAck(gm, 'scene:update', {
      sceneId,
      patch: { width: 4000, height: 4000, grid: { sizePx: 100 }, metersPerSquare: 2 },
    });
    await emitAck(gm, 'scene:activate', { sceneId });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'dynamic' });

    await emitAck(gm, 'wall:create', { sceneId, kind: 'barrier', points: pointsOf(NORTH) });
    gateId = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId,
        kind: 'gate',
        playerToggle: true,
        points: pointsOf(GATE),
      }),
      'wall:create gate',
    )[0]!.id;
    await emitAck(gm, 'wall:create', { sceneId, kind: 'barrier', points: pointsOf(SOUTH) });
    await emitAck(gm, 'wall:create', { sceneId, kind: 'window', points: pointsOf(PANE) });
    await emitAck(gm, 'wall:create', {
      sceneId,
      kind: 'wall',
      points: [
        { x: 3000, y: 3000 },
        { x: 3800, y: 3000 },
        { x: 3800, y: 3800 },
        { x: 3000, y: 3800 },
        { x: 3000, y: 3000 },
      ],
    });
    await emitAck(gm, 'wall:create', { sceneId, kind: 'barrier', points: pointsOf(LOCKED_IN) });

    guardTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', { sceneId, name: 'Strażnik', x: 1450, y: 1450 }),
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

  it('shows the player the yard behind the fence, and whoever stands in it', async () => {
    const sync = await roundTrip(player);
    expect(sync.tokens.map((token) => token.id)).toContain(guardTokenId);
    expect(sync.walls).toEqual([]);
  });

  it('hands the route planner what is in sight — never a fence in a sealed room', async () => {
    const { blockers } = await roundTrip(player);
    expect(blockers).toContainEqual(NORTH);
    expect(blockers).toContainEqual(GATE);
    expect(blockers).toContainEqual(SOUTH);
    // The pane is 2 m away: the curtain is off, the floor beyond it is in view.
    expect(blockers).toContainEqual(PANE);
    expect(blockers).not.toContainEqual(LOCKED_IN);
    expect(blockers).toHaveLength(4);
  });

  it('refuses a figure dragged through the barrier itself', async () => {
    // Middles (550, 1550) → (1550, 950) cross x = 1000 at y = 1280: the northern
    // fence, well clear of the gate below it.
    expect(errorOf(await moveOwn(player, 1450, 850))).toBe('MOVE_REFUSED');
  });

  it('refuses the shut gate, and lets the figure through once it stands open', async () => {
    expect(errorOf(await moveOwn(player, 1450, 1450))).toBe('MOVE_REFUSED');

    // An open gate is nothing to walk round, so it leaves the planner's list.
    const opened = blockersWhere((segments) => !has(segments, GATE));
    await emitAck(gm, 'opening:toggle', { wallId: gateId, open: true });
    expect(await opened).toContainEqual(NORTH);

    expect(errorOf(await moveOwn(player, 1450, 1450))).toBeUndefined();

    await moveOwn(gm, 450, 1450);
    await emitAck(gm, 'opening:toggle', { wallId: gateId, open: false });
  });

  it('lets the player open the gate from arm’s length, like a door', async () => {
    expect(errorOf(await emitAck(player, 'opening:toggle', { wallId: gateId }))).toBe(
      'OPENING_OUT_OF_REACH',
    );
    await moveOwn(gm, 850, 1450);
    const opened = await emitAck<WallView>(player, 'opening:toggle', { wallId: gateId });
    expect(data(opened, 'opening:toggle').open).toBe(true);

    await emitAck(gm, 'opening:toggle', { wallId: gateId, open: false });
    await moveOwn(gm, 450, 1450);
  });

  it('takes the pane off the list once the figure steps back from it', async () => {
    // Two squares south, middle at (550, 1750): 5,4 m from the glass, which is a
    // wall again from there.
    const stepped = blockersWhere((segments) => !has(segments, PANE));
    await moveOwn(gm, 450, 1650);
    expect(await stepped).toContainEqual(NORTH);

    const back = blockersWhere((segments) => has(segments, PANE));
    await moveOwn(gm, 450, 1450);
    await back;
  });

  it('on a fogged map hands over only the fences the GM has revealed a piece of', async () => {
    // Nothing is revealed on a freshly fogged map, so nothing is handed over.
    const covered = blockersWhere((segments) => segments.length === 0);
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'fog' });
    await covered;

    const uncovered = blockersWhere((segments) => segments.length > 0);
    await emitAck(gm, 'fog:paint', {
      sceneId,
      shape: { kind: 'rect', mode: 'reveal', x: 900, y: 1300, width: 200, height: 200 },
    });
    // Only the tip of the northern fence and the top of the gate are uncovered —
    // a glimpse of a fence is that fence. No window: that is the floor plan.
    const revealed = await uncovered;
    expect(revealed).toContainEqual(NORTH);
    expect(revealed).toContainEqual(GATE);
    expect(revealed).not.toContainEqual(SOUTH);
    expect(revealed).not.toContainEqual(PANE);
  });

  it('on an open map hands over every fence, wherever it stands', async () => {
    const everything = blockersWhere((segments) => has(segments, LOCKED_IN));
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const segments = await everything;
    expect(segments).not.toContainEqual(PANE);
    expect(segments).toHaveLength(4);
  });

  it('sizes a lamp to the whole lot, not to the fence around it', async () => {
    // A fenced square 8 m across, lamp in the middle. Counted as walls, the fence
    // would make it a 5,7 m room; left out, the lamp reaches for the open map.
    await emitAck(gm, 'wall:create', {
      sceneId,
      kind: 'barrier',
      points: [
        { x: 2000, y: 200 },
        { x: 2400, y: 200 },
        { x: 2400, y: 600 },
        { x: 2000, y: 600 },
        { x: 2000, y: 200 },
      ],
    });
    const lamp = data(
      await emitAck<LightView>(gm, 'light:create', { sceneId, x: 2200, y: 400, fitRoom: true }),
      'light:create fitRoom',
    );
    expect(lamp.dimM).toBe(50);
  });
});

describe('a window is a net curtain on a lit scene', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let npcTokenId: string;
  let ownTokenId: string;
  /** The shop front itself, flagged as the players' to work (stage 18e). */
  let windowId: number;

  beforeAll(async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Witryna' }),
      'scene:create',
    );
    sceneId = scene.id;
    // Mapa otwarta dla graczy (12.09): nowa scena wchodzi **zamknięta**, a ten
    // zestaw jest o ruchu figur, nie o blokadzie.
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMoveLocked: false } });
    await emitAck(gm, 'scene:update', {
      sceneId,
      patch: { width: 4000, height: 4000, grid: { sizePx: 100 }, metersPerSquare: 2 },
    });
    await emitAck(gm, 'scene:activate', { sceneId });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'dynamic' });

    await emitAck(gm, 'wall:create', {
      sceneId,
      kind: 'wall',
      points: [
        { x: 2000, y: 1000 },
        { x: 3000, y: 1000 },
        { x: 3000, y: 2000 },
        { x: 2000, y: 2000 },
      ],
    });
    windowId = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId,
        kind: 'window',
        playerToggle: true,
        points: [
          { x: 2000, y: 1000 },
          { x: 2000, y: 2000 },
        ],
      }),
      'wall:create window',
    )[0]!.id;

    npcTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Sprzedawca',
        x: 2450,
        y: 1450,
      }),
      'token:create npc',
    ).id;
    ownTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Rogue',
        x: 1450,
        y: 1450,
        ownerId: playerId,
      }),
      'token:create own',
    ).id;
    await roundTrip(player);
  }, 30_000);

  it('keeps the shop out of the payload from across the street', async () => {
    // Ten metres from the glass: from the street the window is a bright
    // rectangle, and the man behind it is not a row anybody receives.
    const sync = await roundTrip(player);
    expect(sync.tokens.map((token) => token.id)).toEqual([ownTokenId]);
  });

  it('shows it the moment the token stands at the glass', async () => {
    await emitAck(player, 'token:move', { tokenId: ownTokenId, x: 1850, y: 1450, final: true });
    const sync = await roundTrip(player);
    expect(sync.tokens.map((token) => token.id)).toContain(npcTokenId);
  });

  it('takes it away again when the token steps back', async () => {
    await emitAck(player, 'token:move', { tokenId: ownTokenId, x: 1450, y: 1450, final: true });
    const sync = await roundTrip(player);
    expect(sync.tokens.map((token) => token.id)).not.toContain(npcTokenId);
  });

  it('does not apply in the dark — a lit window is more visible at night, not less', async () => {
    // The asymmetry the whole lighting model exists for: standing in a dark
    // street, looking into a lit lobby. The curtain rule is off here on purpose,
    // and the glass instead charges the light that comes through it (18c).
    const lamp = data(
      await emitAck<{ id: number }>(gm, 'light:create', {
        sceneId,
        x: 2500,
        y: 1500,
        brightM: 8,
        dimM: 14,
        color: '#ffd9a0',
        flicker: false,
      }),
      'light:create',
    );
    await emitAck(gm, 'scene:lighting', { sceneId, dark: true, darkSightM: 2 });
    const sync = await roundTrip(player);
    expect(sync.tokens.map((token) => token.id)).toContain(npcTokenId);

    await emitAck(gm, 'scene:lighting', { sceneId, dark: false });
    await emitAck(gm, 'light:delete', { lightId: lamp.id });
  });

  /* Stage 18e: the window is an object with a latch, not just a pane. */

  it('hands the player the window itself — it is what they are looking at', async () => {
    const sync = await roundTrip(player);
    // Flagged, in view, and on the list even though it is the very thing
    // stopping them seeing past it: from the street a shop front is the most
    // conspicuous object on the wall.
    expect(sync.openings.map((opening) => opening.id)).toContain(windowId);
  });

  it('refuses to open it from across the street', async () => {
    expect(errorOf(await emitAck(player, 'opening:toggle', { wallId: windowId }))).toBe(
      'OPENING_OUT_OF_REACH',
    );
  });

  it('opens it from the pavement, and the curtain is gone for good', async () => {
    await emitAck(player, 'token:move', { tokenId: ownTokenId, x: 1850, y: 1450, final: true });
    const opened = data(
      await emitAck<WallView>(player, 'opening:toggle', { wallId: windowId }),
      'opening:toggle window',
    );
    expect(opened.open).toBe(true);

    // Back across the street: with the sash up there is no glass to hide behind,
    // so the shop keeper is a row the player receives from ten metres away.
    await emitAck(player, 'token:move', { tokenId: ownTokenId, x: 1450, y: 1450, final: true });
    const sync = await roundTrip(player);
    expect(sync.tokens.map((token) => token.id)).toContain(npcTokenId);

    await emitAck(gm, 'opening:toggle', { wallId: windowId, open: false });
    const shut = await roundTrip(player);
    expect(shut.tokens.map((token) => token.id)).not.toContain(npcTokenId);
  });

  it('bolts shut against a player standing right at it', async () => {
    await emitAck(gm, 'wall:update', { wallId: windowId, patch: { locked: true } });
    await emitAck(player, 'token:move', { tokenId: ownTokenId, x: 1850, y: 1450, final: true });
    expect(errorOf(await emitAck(player, 'opening:toggle', { wallId: windowId }))).toBe(
      'OPENING_LOCKED',
    );

    // …and the latch itself never crossed the wire.
    const sync = await roundTrip(player);
    expect(sync.openings.find((opening) => opening.id === windowId)?.locked).toBe(false);

    await emitAck(gm, 'wall:update', { wallId: windowId, patch: { locked: false } });
    await emitAck(player, 'token:move', { tokenId: ownTokenId, x: 1450, y: 1450, final: true });
  });

  it('stops dimming the light once it is open', async () => {
    // A lamp 13 m inside throws just short of a man in the street through glass
    // (the pane charges the reach beyond it double) and reaches him once the
    // sash is up. Nothing else changes — same lamp, same distance, same dark.
    const lamp = data(
      await emitAck<{ id: number }>(gm, 'light:create', {
        sceneId,
        x: 2500,
        y: 1500,
        brightM: 8,
        dimM: 14,
        color: '#ffd9a0',
        flicker: false,
      }),
      'light:create',
    );
    const outsideId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kurier',
        x: 1800,
        y: 1450,
      }),
      'token:create outside',
    ).id;
    await emitAck(gm, 'scene:lighting', { sceneId, dark: true, darkSightM: 2 });

    const throughGlass = await roundTrip(player);
    expect(throughGlass.tokens.map((token) => token.id)).not.toContain(outsideId);

    await emitAck(gm, 'opening:toggle', { wallId: windowId, open: true });
    const throughAir = await roundTrip(player);
    expect(throughAir.tokens.map((token) => token.id)).toContain(outsideId);

    await emitAck(gm, 'opening:toggle', { wallId: windowId, open: false });
    await emitAck(gm, 'scene:lighting', { sceneId, dark: false });
    await emitAck(gm, 'light:delete', { lightId: lamp.id });
    await emitAck(gm, 'token:delete', { tokenId: outsideId });
  });
});
