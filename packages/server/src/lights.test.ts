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
  LightMask,
  LightView,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
  WallView,
} from '@vtt/shared';
import { LIGHT_DARK, decodeLevelRuns } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Stage 18b smoke tests: darkness, lamps and torches, over live sockets.
 *
 * `shared/lights.test.ts` covers the geometry; what is tested here is the
 * promise the architecture makes once light is part of the answer:
 *
 *  - a token that is **in view but unlit** is as absent from a player's payload
 *    as one behind a wall;
 *  - the lamp rows never reach a player, and neither does the light of a room
 *    they cannot see into — the mask is checked cell by cell for that;
 *  - the torch switch is the player's, and only on their own token.
 *
 * The map is the one from stage 18a, in the dark: a 1000×1000 room whose left
 * wall has a door in it, the player due west of the door, an NPC in the middle
 * of the room, and a second NPC standing right next to the player.
 *
 *        1000        2000
 *   1000  ┌───────────┐
 *         │           │
 *   1400  ╡  (door)   │
 *   1500  ·  · NPC ·  │   ← player at (500, 1500); „Cień" at (560, 1500)
 *   1600  ╡           │
 *         │           │
 *   2000  └───────────┘
 *
 * The scene is 2 m per 100 px square, so one metre is fifty scene pixels and
 * the player stands 20 m from the NPC in the room.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
/** 2 m per 100 px square — the CP RED default this scene is built on. */
const PX_PER_METRE = 50;

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

function errorOf(ack: SocketAck<unknown>): string | undefined {
  return ack.ok ? undefined : ack.error;
}

function record<T>(socket: ClientSocket, event: string): T[] {
  const seen: T[] = [];
  socket.on(event, (payload: T) => seen.push(payload));
  return seen;
}

/** Light level of the cell containing a world point, read out of a wire mask. */
function levelAt(mask: LightMask, point: { x: number; y: number }): number {
  const col = Math.floor((point.x - mask.x) / mask.cell);
  const row = Math.floor((point.y - mask.y) / mask.cell);
  if (col < 0 || row < 0 || col >= mask.cols || row >= mask.rows) return LIGHT_DARK;
  return decodeLevelRuns(mask.runs, mask.cols * mask.rows)[row * mask.cols + col]!;
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
    payload: { name: 'Kampania ciemności' },
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

describe('darkness, lamps and torches', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  /** In the middle of the sealed room, centre (1500, 1500) — 20 m away. */
  let npcTokenId: string;
  /** Right next to the player, centre (560, 1500) — barely over a metre. */
  let neighbourTokenId: string;
  /** The player's own, centre (500, 1500) — due west of the door. */
  let ownTokenId: string;
  let doorId: number;

  beforeAll(async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Ciemny magazyn' }),
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

    npcTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', { sceneId, name: 'Ganger', x: 1450, y: 1450 }),
      'token:create npc',
    ).id;
    neighbourTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', { sceneId, name: 'Cień', x: 510, y: 1450 }),
      'token:create neighbour',
    ).id;
    ownTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Rogue',
        x: 450,
        y: 1450,
        ownerId: playerId,
      }),
      'token:create own',
    ).id;
    // The lights go out, and the door is opened: from here on the only thing
    // hiding the NPC in the room is the dark.
    data(await emitAck<SceneView>(gm, 'scene:lighting', { sceneId, dark: true }), 'scene:lighting');
    await emitAck(gm, 'opening:toggle', { wallId: doorId, open: true });
    await roundTrip(player);
  }, 30_000);

  it('turns darkness on as a property of the scene', async () => {
    const sync = await roundTrip(player);
    expect(sync.scene?.dark).toBe(true);
    // One grid square, the default that keeps a black screen from reading as a
    // crash.
    expect(sync.scene?.darkSightM).toBe(2);
  });

  it('hides an unlit token even with the door wide open — in the payload', async () => {
    const sync = await roundTrip(player);
    const ids = sync.tokens.map((t) => t.id);
    // In plain view through the open door, 20 m away, and pitch dark.
    expect(ids).not.toContain(npcTokenId);
    // Their own token always, whatever the light does.
    expect(ids).toContain(ownTokenId);
  });

  it('leaves the „po omacku" radius: a token an arm away is still there', async () => {
    const sync = await roundTrip(player);
    expect(sync.tokens.map((t) => t.id)).toContain(neighbourTokenId);
  });

  it('zero „po omacku" is total darkness, and it is reversible', async () => {
    await emitAck(gm, 'scene:lighting', { sceneId, darkSightM: 0 });
    const blind = await roundTrip(player);
    expect(blind.tokens.map((t) => t.id)).not.toContain(neighbourTokenId);
    // Own token survives even total darkness — losing it reads as a bug.
    expect(blind.tokens.map((t) => t.id)).toContain(ownTokenId);

    await emitAck(gm, 'scene:lighting', { sceneId, darkSightM: 2 });
    const back = await roundTrip(player);
    expect(back.tokens.map((t) => t.id)).toContain(neighbourTokenId);
  });

  it('a lamp in the room reveals the NPC — and a closed door takes it back', async () => {
    const lamp = data(
      await emitAck<LightView>(gm, 'light:create', {
        sceneId,
        x: 1500,
        y: 1500,
        brightM: 6,
        dimM: 12,
      }),
      'light:create',
    );
    const lit = await roundTrip(player);
    expect(lit.tokens.map((t) => t.id)).toContain(npcTokenId);

    // The light is blocked by the same geometry sight is: shutting the door
    // takes both away.
    await emitAck(gm, 'opening:toggle', { wallId: doorId, open: false });
    const shut = await roundTrip(player);
    expect(shut.tokens.map((t) => t.id)).not.toContain(npcTokenId);

    await emitAck(gm, 'opening:toggle', { wallId: doorId, open: true });
    // Switching the lamp off is not the same as deleting it, and has the same
    // effect on what the player may see.
    await emitAck(gm, 'light:update', { lightId: lamp.id, patch: { enabled: false } });
    const off = await roundTrip(player);
    expect(off.tokens.map((t) => t.id)).not.toContain(npcTokenId);

    await emitAck(gm, 'light:delete', { lightId: lamp.id });
    const gone = await roundTrip(player);
    expect(gone.tokens.map((t) => t.id)).not.toContain(npcTokenId);
  });

  it('never describes the light of a room the player cannot see into', async () => {
    // This is the leak the mask representation exists to prevent: a lamp's own
    // polygon is clipped by walls, so it *is* a floor plan.
    const lamp = data(
      await emitAck<LightView>(gm, 'light:create', {
        sceneId,
        x: 1500,
        y: 1500,
        brightM: 8,
        dimM: 16,
      }),
      'light:create',
    );
    await emitAck(gm, 'opening:toggle', { wallId: doorId, open: false });
    const sync = await roundTrip(player);
    const mask = sync.vision?.light;
    expect(mask).toBeTruthy();
    // Dark at the lamp itself and at a point beside it, both inside the room.
    expect(levelAt(mask!, { x: 1500, y: 1500 })).toBe(LIGHT_DARK);
    expect(levelAt(mask!, { x: 1700, y: 1600 })).toBe(LIGHT_DARK);
    // And no glow of a lamp behind a wall, either.
    expect(sync.vision?.glows ?? []).toEqual([]);

    await emitAck(gm, 'light:delete', { lightId: lamp.id });
    await emitAck(gm, 'opening:toggle', { wallId: doorId, open: true });
  });

  it('a torch on the player token lights the room through the open door', async () => {
    // 30 m of dim reach covers the 20 m to the NPC.
    await emitAck(gm, 'token:update', {
      tokenId: ownTokenId,
      patch: { light: { brightM: 8, dimM: 30, color: '#ffd9a0', flicker: false, on: true } },
    });
    const lit = await roundTrip(player);
    expect(lit.tokens.map((t) => t.id)).toContain(npcTokenId);
    // The mask says so too, at the NPC's own square.
    expect(levelAt(lit.vision!.light!, { x: 1500, y: 1500 })).not.toBe(LIGHT_DARK);
    // The torch is private to its controller, and it is a glow they can see.
    const own = lit.tokens.find((t) => t.id === ownTokenId);
    expect(own?.light?.dimM).toBe(30);
    expect(lit.vision?.glows?.length).toBe(1);
  });

  it('lets the player put their own torch out — and the room goes with it', async () => {
    const pushed = waitFor<{ tokens: TokenView[] }>(player, 'token:sync');
    data(await emitAck<TokenView>(player, 'token:light', { tokenId: ownTokenId }), 'token:light');
    expect((await pushed).tokens.map((t) => t.id)).not.toContain(npcTokenId);

    const dark = await roundTrip(player);
    expect(dark.tokens.find((t) => t.id === ownTokenId)?.light?.on).toBe(false);
    expect(dark.tokens.map((t) => t.id)).not.toContain(npcTokenId);

    // …and light it again.
    await emitAck(player, 'token:light', { tokenId: ownTokenId, on: true });
    const relit = await roundTrip(player);
    expect(relit.tokens.map((t) => t.id)).toContain(npcTokenId);
  });

  it('refuses a torch switch on a token the player does not control', async () => {
    await emitAck(gm, 'token:update', {
      tokenId: neighbourTokenId,
      patch: { light: { brightM: 2, dimM: 4, color: '#ffd9a0', flicker: false, on: true } },
    });
    expect(errorOf(await emitAck(player, 'token:light', { tokenId: neighbourTokenId }))).toBe(
      'FORBIDDEN',
    );
    // A token with no lamp has no switch to flip, whoever asks.
    expect(errorOf(await emitAck(gm, 'token:light', { tokenId: npcTokenId }))).toBe('NO_LIGHT');
    // The GM may work anybody's.
    expect((await emitAck(gm, 'token:light', { tokenId: neighbourTokenId, on: false })).ok).toBe(
      true,
    );
  });

  it('a hidden token does not give itself away with its own torch', async () => {
    // The leak this covers: the token is filtered out of the payload, but its
    // lamp used to light the map for everyone and to appear in the glow layer
    // at its exact position — the ambush announced by the thing hiding it.
    await emitAck(gm, 'scene:lighting', { sceneId, darkSightM: 0 });
    await emitAck(player, 'token:light', { tokenId: ownTokenId, on: false });
    await emitAck(gm, 'token:update', {
      tokenId: neighbourTokenId,
      patch: {
        hidden: true,
        light: { brightM: 4, dimM: 10, color: '#ffd9a0', flicker: false, on: true },
      },
    });

    const hidden = await roundTrip(player);
    expect(hidden.tokens.map((t) => t.id)).not.toContain(neighbourTokenId);
    expect(hidden.vision?.glows ?? []).toEqual([]);
    // Its own square, one metre from the player, is still pitch dark.
    expect(levelAt(hidden.vision!.light!, { x: 560, y: 1500 })).toBe(LIGHT_DARK);

    // Revealed again, the very same lamp does all the things it should.
    await emitAck(gm, 'token:update', { tokenId: neighbourTokenId, patch: { hidden: false } });
    const shown = await roundTrip(player);
    expect(shown.tokens.map((t) => t.id)).toContain(neighbourTokenId);
    expect(shown.vision?.glows?.length).toBe(1);
    expect(levelAt(shown.vision!.light!, { x: 560, y: 1500 })).not.toBe(LIGHT_DARK);

    await emitAck(gm, 'token:update', {
      tokenId: neighbourTokenId,
      patch: { light: { brightM: 0, dimM: 0, color: '#ffd9a0', flicker: false, on: false } },
    });
    await emitAck(gm, 'scene:lighting', { sceneId, darkSightM: 2 });
  });

  it('still lights the way for the owner of a hidden token', async () => {
    // The mistake the per-viewer filter exists to avoid: dropping hidden
    // bearers from the scene outright would blind a sneaking player with their
    // own torch.
    await emitAck(gm, 'scene:lighting', { sceneId, darkSightM: 0 });
    // Lit by the GM, because a hidden token is out of its own owner's reach as
    // well: it is absent from their token list, so `token:light` refuses it the
    // way it refuses any token the player cannot see. Sight from it is another
    // matter and has worked since stage 18a — which is exactly why its light
    // has to keep working too.
    await emitAck(gm, 'token:update', {
      tokenId: ownTokenId,
      patch: {
        hidden: true,
        light: { brightM: 8, dimM: 30, color: '#ffd9a0', flicker: false, on: true },
      },
    });

    const sneaking = await roundTrip(player);
    // 30 m of dim reach from their own (hidden) token still crosses the room.
    expect(levelAt(sneaking.vision!.light!, { x: 1500, y: 1500 })).not.toBe(LIGHT_DARK);
    expect(sneaking.tokens.map((t) => t.id)).toContain(npcTokenId);

    await emitAck(gm, 'token:update', { tokenId: ownTokenId, patch: { hidden: false } });
    await emitAck(gm, 'scene:lighting', { sceneId, darkSightM: 2 });
  });

  it('never sends a player the lamp rows', async () => {
    const leaked = record<unknown>(player, 'light:sync');
    const lamp = data(
      await emitAck<LightView>(gm, 'light:create', { sceneId, x: 1500, y: 1500 }),
      'light:create',
    );
    const sync = await roundTrip(player);
    expect(sync.lights).toEqual([]);
    expect(leaked).toEqual([]);

    const gmSync = await roundTrip(gm);
    expect(gmSync.lights.map((entry) => entry.id)).toContain(lamp.id);
    // The GM is never covered, so they get no mask and no polygons at all.
    expect(gmSync.vision).toBeNull();
    await emitAck(gm, 'light:delete', { lightId: lamp.id });
  });

  it('sends no light mask on a scene that is not dark', async () => {
    await emitAck(gm, 'scene:lighting', { sceneId, dark: false });
    const lit = await roundTrip(player);
    expect(lit.scene?.dark).toBe(false);
    expect(lit.vision?.light ?? null).toBeNull();
    // With the door open and nothing gating on light, the NPC is simply seen.
    expect(lit.tokens.map((t) => t.id)).toContain(npcTokenId);
    await emitAck(gm, 'scene:lighting', { sceneId, dark: true });
  });

  it('is GM-only for everything except the torch switch', async () => {
    expect((await emitAck(player, 'light:create', { sceneId, x: 100, y: 100 })).ok).toBe(false);
    expect((await emitAck(player, 'light:update', { lightId: 1, patch: { dimM: 99 } })).ok).toBe(
      false,
    );
    expect((await emitAck(player, 'light:delete', { lightId: 1 })).ok).toBe(false);
    expect((await emitAck(player, 'scene:lighting', { sceneId, dark: false })).ok).toBe(false);
  });

  it('validates what it stores', async () => {
    expect(errorOf(await emitAck(gm, 'light:create', { sceneId, x: 'tu', y: 10 }))).toBe(
      'BAD_REQUEST',
    );
    expect(
      errorOf(await emitAck(gm, 'light:update', { lightId: 999999, patch: { dimM: 3 } })),
    ).toBe('LIGHT_NOT_FOUND');
    expect(errorOf(await emitAck(gm, 'scene:lighting', { sceneId, darkSightM: 'dużo' }))).toBe(
      'BAD_REQUEST',
    );
    // The dim radius is the outer one: an inverted pair is widened, not refused.
    const lamp = data(
      await emitAck<LightView>(gm, 'light:create', {
        sceneId,
        x: 3000,
        y: 3000,
        brightM: 10,
        dimM: 4,
      }),
      'light:create',
    );
    expect(lamp.dimM).toBe(10);
    await emitAck(gm, 'light:delete', { lightId: lamp.id });
  });

  it('keeps the metre scale of the scene: a torch reaches exactly as far as it says', async () => {
    // 4 m of dim reach is 200 px here — short of the neighbour at 60 px, and
    // nowhere near the NPC at 1000 px.
    await emitAck(gm, 'scene:lighting', { sceneId, darkSightM: 0 });
    await emitAck(gm, 'token:update', {
      tokenId: ownTokenId,
      patch: { light: { brightM: 2, dimM: 4, color: '#ffd9a0', flicker: false, on: true } },
    });
    const near = await roundTrip(player);
    expect(4 * PX_PER_METRE).toBe(200);
    expect(near.tokens.map((t) => t.id)).toContain(neighbourTokenId);
    expect(near.tokens.map((t) => t.id)).not.toContain(npcTokenId);
    await emitAck(gm, 'scene:lighting', { sceneId, darkSightM: 2 });
  });
});
