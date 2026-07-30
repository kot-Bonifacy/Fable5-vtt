import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  ExplorationMask,
  ExplorationSyncBroadcast,
  InvitationSummary,
  LightView,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
  WallView,
} from '@vtt/shared';
import { decodeFlagRuns } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Stage 18c smoke tests: exploration memory and the GM's override, over live
 * sockets.
 *
 * `shared/exploration.test.ts` covers the grid arithmetic; what is tested here
 * is the pair of promises the stage makes:
 *
 *  - **the map is remembered, the people in it are not** — a room the party has
 *    walked stays on their plan, while a token standing in it disappears from
 *    the payload the moment nobody can see it;
 *  - **the GM's brush outranks the geometry** — „hide" keeps a lit, visible
 *    room black *and* takes its tokens out of the payload, „reveal" hands over
 *    a room behind a wall.
 *
 * The map is the one from stage 18a: a 1000×1000 room whose left wall has a
 * door in it, the player due west of the door, an NPC in the middle.
 *
 *        1000        2000
 *   1000  ┌───────────┐
 *         │           │
 *   1400  ╡  (door)   │
 *   1500  ·  · NPC ·  │   ← player at (500, 1500)
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

function errorOf(ack: SocketAck<unknown>): string | undefined {
  return ack.ok ? undefined : ack.error;
}

/** Has the party been here? Read out of an exploration mask off the wire. */
function exploredAt(mask: ExplorationMask, point: { x: number; y: number }): boolean {
  const col = Math.floor(point.x / mask.cell);
  const row = Math.floor(point.y / mask.cell);
  if (col < 0 || row < 0 || col >= mask.cols || row >= mask.rows) return false;
  return decodeFlagRuns(mask.runs, mask.cols * mask.rows)[row * mask.cols + col] === 1;
}

/** How many cells the party has walked in total. */
function exploredCount(mask: ExplorationMask): number {
  let count = 0;
  for (const cell of decodeFlagRuns(mask.runs, mask.cols * mask.rows)) count += cell;
  return count;
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
    payload: { name: 'Kampania eksploracji' },
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

describe('exploration memory', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  /** In the middle of the sealed room, centre (1500, 1500). */
  let npcTokenId: string;
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
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Zwiedzany magazyn' }),
      'scene:create',
    );
    sceneId = scene.id;
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
    await roundTrip(player);
  }, 30_000);

  it('starts remembering, because a map that forgets needs more explaining', async () => {
    const sync = await roundTrip(player);
    expect(sync.scene?.explore).toBe(true);
    expect(sync.exploration).not.toBeNull();
    // Standing outside the room, the player has already seen the ground around
    // themselves — the memory is not empty, but it stops at the wall.
    expect(exploredAt(sync.exploration!, { x: 500, y: 1500 })).toBe(true);
    expect(exploredAt(sync.exploration!, { x: 1500, y: 1500 })).toBe(false);
  });

  it('keeps the room on the plan after the door shuts — without the NPC in it', async () => {
    await emitAck(gm, 'door:toggle', { wallId: doorId, open: true });
    const open = await roundTrip(player);
    // Through the open door: the room is seen and its occupant is real.
    expect(exploredAt(open.exploration!, { x: 1500, y: 1500 })).toBe(true);
    expect(open.tokens.map((t) => t.id)).toContain(npcTokenId);

    await emitAck(gm, 'door:toggle', { wallId: doorId, open: false });
    const shut = await roundTrip(player);
    // The map is remembered…
    expect(exploredAt(shut.exploration!, { x: 1500, y: 1500 })).toBe(true);
    // …and the man in it is not. This is the whole point of the stage: a
    // remembered room is a memory of a room, not a live feed of who is in it.
    expect(shut.tokens.map((t) => t.id)).not.toContain(npcTokenId);
  });

  it('survives a reconnect, because it lives in a row and not in a socket', async () => {
    const before = (await roundTrip(player)).exploration!;
    const again = createSocket(playerCookie);
    const sync = await again.firstSync;
    expect(exploredCount(sync.exploration!)).toBe(exploredCount(before));
    expect(exploredAt(sync.exploration!, { x: 1500, y: 1500 })).toBe(true);
    again.socket.disconnect();
  });

  it('remembers only what was lit once the lights go out', async () => {
    await emitAck(gm, 'explore:forget', { sceneId });
    const forgotten = await roundTrip(player);
    expect(exploredCount(forgotten.exploration!)).toBe(0);

    // Pitch dark, no torch: a player makes out one grid square around
    // themselves, and that is all the map may remember.
    await emitAck(gm, 'scene:lighting', { sceneId, dark: true, darkSightM: 2 });
    await emitAck(gm, 'door:toggle', { wallId: doorId, open: true });
    const groping = await roundTrip(player);
    expect(exploredAt(groping.exploration!, { x: 500, y: 1500 })).toBe(true);
    // The room beyond the open door is in plain view and pitch dark: in view is
    // not the same as visible, and only visible is remembered.
    expect(exploredAt(groping.exploration!, { x: 1500, y: 1500 })).toBe(false);

    // A torch that reaches the room writes it into the memory.
    await emitAck(gm, 'token:update', {
      tokenId: ownTokenId,
      patch: { light: { brightM: 8, dimM: 30, color: '#ffd9a0', flicker: false, on: true } },
    });
    const lit = await roundTrip(player);
    expect(exploredAt(lit.exploration!, { x: 1500, y: 1500 })).toBe(true);

    await emitAck(gm, 'token:update', {
      tokenId: ownTokenId,
      patch: { light: { brightM: 0, dimM: 0, color: '#ffd9a0', flicker: false, on: false } },
    });
    await emitAck(gm, 'scene:lighting', { sceneId, dark: false });
  });

  it('pushes a discovery to everyone as one shared broadcast', async () => {
    await emitAck(gm, 'explore:forget', { sceneId });
    const pushed = waitFor<ExplorationSyncBroadcast>(gm, 'explore:sync');
    // Any change to what the player sees re-derives their vision, which is what
    // feeds the memory — working the door is the cheapest such change.
    await emitAck(gm, 'door:toggle', { wallId: doorId, open: false });
    await emitAck(gm, 'door:toggle', { wallId: doorId, open: true });
    const broadcast = await pushed;
    expect(broadcast.sceneId).toBe(sceneId);
    expect(exploredCount(broadcast.mask!)).toBeGreaterThan(0);
  });

  it('stops remembering when the GM says so, and keeps what it had', async () => {
    const remembered = exploredCount((await roundTrip(player)).exploration!);
    expect(remembered).toBeGreaterThan(0);

    await emitAck(gm, 'scene:explore', { sceneId, explore: false });
    const off = await roundTrip(player);
    expect(off.scene?.explore).toBe(false);
    expect(off.exploration).toBeNull();

    // Switched back on, the memory is where it was — the switch hides it, the
    // „forget" button is what destroys it.
    await emitAck(gm, 'scene:explore', { sceneId, explore: true });
    const on = await roundTrip(player);
    expect(exploredCount(on.exploration!)).toBe(remembered);
  });

  it("is the GM's alone to switch and to wipe", async () => {
    expect((await emitAck(player, 'scene:explore', { sceneId, explore: false })).ok).toBe(false);
    expect((await emitAck(player, 'explore:forget', { sceneId })).ok).toBe(false);
    expect(errorOf(await emitAck(gm, 'scene:explore', { sceneId, explore: 'tak' }))).toBe(
      'BAD_REQUEST',
    );
  });
});

describe("the GM's override over dynamic vision", () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let npcTokenId: string;
  let ownTokenId: string;

  beforeAll(async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Scena nadpisań' }),
      'scene:create',
    );
    sceneId = scene.id;
    await emitAck(gm, 'scene:update', {
      sceneId,
      patch: { width: 4000, height: 4000, grid: { sizePx: 100 }, metersPerSquare: 2 },
    });
    await emitAck(gm, 'scene:activate', { sceneId });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'dynamic' });
    // A wall straight down the middle: the player west of it, an NPC east.
    await emitAck(gm, 'wall:create', {
      sceneId,
      kind: 'wall',
      points: [
        { x: 1000, y: 0 },
        { x: 1000, y: 4000 },
      ],
    });
    npcTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', { sceneId, name: 'Cień', x: 1450, y: 1450 }),
      'token:create npc',
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
    await roundTrip(player);
  }, 30_000);

  it('paints into the override set, not into the fog', async () => {
    const painted = await emitAck(gm, 'fog:paint', {
      sceneId,
      shape: { kind: 'rect', mode: 'reveal', x: 1200, y: 1200, width: 600, height: 600 },
    });
    expect(painted.ok).toBe(true);
    const sync = await roundTrip(player);
    // The fog list stays empty and disabled — this scene is not painting fog.
    expect(sync.fog?.enabled).toBe(false);
    expect(sync.fog?.shapes).toEqual([]);
    expect(sync.fog?.overrides.length).toBe(1);
  });

  it('hands a player a token behind a wall where the GM revealed', async () => {
    const sync = await roundTrip(player);
    // No line of sight at all: the wall is unbroken and the NPC is behind it.
    // The override is the only reason this token exists here.
    expect(sync.tokens.map((t) => t.id)).toContain(npcTokenId);
  });

  it('takes a token away where the GM covered, however well lit', async () => {
    await emitAck(gm, 'fog:reset', { sceneId, mode: 'clear' });
    // Move the NPC to the player's own side, in plain view. Position travels
    // on `token:move`, not in the patch — the patch is what a token *is*.
    await emitAck(gm, 'token:move', { tokenId: npcTokenId, x: 550, y: 1450, final: true });
    const visible = await roundTrip(player);
    expect(visible.tokens.map((t) => t.id)).toContain(npcTokenId);

    await emitAck(gm, 'fog:paint', {
      sceneId,
      shape: { kind: 'rect', mode: 'hide', x: 500, y: 1400, width: 300, height: 300 },
    });
    const hidden = await roundTrip(player);
    expect(hidden.tokens.map((t) => t.id)).not.toContain(npcTokenId);
    // Their own token is never taken away, whatever the GM paints over it.
    expect(hidden.tokens.map((t) => t.id)).toContain(ownTokenId);
  });

  it('lets the last stroke win, like the fog brush it is', async () => {
    await emitAck(gm, 'fog:paint', {
      sceneId,
      shape: { kind: 'rect', mode: 'reveal', x: 500, y: 1400, width: 300, height: 300 },
    });
    const back = await roundTrip(player);
    expect(back.tokens.map((t) => t.id)).toContain(npcTokenId);
  });

  it('clears back to what the walls say', async () => {
    await emitAck(gm, 'fog:reset', { sceneId, mode: 'clear' });
    const cleared = await roundTrip(player);
    expect(cleared.fog?.overrides).toEqual([]);
    // Still on the player's own side, so the walls alone show it.
    expect(cleared.tokens.map((t) => t.id)).toContain(npcTokenId);

    await emitAck(gm, 'token:move', { tokenId: npcTokenId, x: 1450, y: 1450, final: true });
    const behind = await roundTrip(player);
    expect(behind.tokens.map((t) => t.id)).not.toContain(npcTokenId);
  });

  it('blinds everybody on demand, and that is a stored shape', async () => {
    await emitAck(gm, 'fog:reset', { sceneId, mode: 'hide' });
    const blind = await roundTrip(player);
    expect(blind.fog?.overrides.length).toBe(1);
    expect(blind.fog?.overrides[0]?.mode).toBe('hide');
    expect(blind.tokens.map((t) => t.id)).toEqual([ownTokenId]);
    await emitAck(gm, 'fog:reset', { sceneId, mode: 'clear' });
  });

  it('keeps the two sets apart across a mode change', async () => {
    await emitAck(gm, 'fog:paint', {
      sceneId,
      shape: { kind: 'rect', mode: 'reveal', x: 1200, y: 1200, width: 600, height: 600 },
    });
    // Switching to hand-painted fog must not read that override as a reveal —
    // it would open half the map the moment the GM changed their mind.
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'fog' });
    const fogMode = await roundTrip(player);
    expect(fogMode.fog?.enabled).toBe(true);
    expect(fogMode.fog?.shapes).toEqual([]);
    expect(fogMode.fog?.overrides).toEqual([]);
    // A fog scene starts covered, so nothing but their own token is left.
    expect(fogMode.tokens.map((t) => t.id)).toEqual([ownTokenId]);

    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'dynamic' });
    const backToWalls = await roundTrip(player);
    expect(backToWalls.fog?.overrides.length).toBe(1);
  });

  it('is refused to a player, brush and buttons alike', async () => {
    expect(
      (
        await emitAck(player, 'fog:paint', {
          sceneId,
          shape: { kind: 'rect', mode: 'reveal', x: 0, y: 0, width: 100, height: 100 },
        })
      ).ok,
    ).toBe(false);
    expect((await emitAck(player, 'fog:reset', { sceneId, mode: 'clear' })).ok).toBe(false);
    expect(errorOf(await emitAck(gm, 'fog:reset', { sceneId, mode: 'wyczyść' }))).toBe(
      'BAD_REQUEST',
    );
  });
});

describe('lighting a room in one click', () => {
  let gm: ClientSocket;
  let sceneId: string;

  beforeAll(async () => {
    const gmConn = createSocket(gmCookie);
    gm = gmConn.socket;
    await gmConn.firstSync;

    const scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Pomieszczenia' }),
      'scene:create',
    );
    sceneId = scene.id;
    await emitAck(gm, 'scene:update', {
      sceneId,
      patch: { width: 4000, height: 4000, grid: { sizePx: 100 }, metersPerSquare: 2 },
    });
    // A 400×400 px room (8×8 m) with the lamp going in the middle of it.
    await emitAck(gm, 'wall:create', {
      sceneId,
      kind: 'wall',
      points: [
        { x: 1000, y: 1000 },
        { x: 1400, y: 1000 },
        { x: 1400, y: 1400 },
        { x: 1000, y: 1400 },
        { x: 1000, y: 1000 },
      ],
    });
  }, 30_000);

  it('sizes the lamp to the walls around it, ignoring the radii sent along', async () => {
    const lamp = data(
      await emitAck<LightView>(gm, 'light:create', {
        sceneId,
        x: 1200,
        y: 1200,
        brightM: 99,
        dimM: 99,
        fitRoom: true,
      }),
      'light:create fitRoom',
    );
    // Corner to corner of an 8×8 m room is ~5.7 m from the middle.
    expect(lamp.dimM).toBeGreaterThan(5);
    expect(lamp.dimM).toBeLessThan(6.5);
    expect(lamp.brightM).toBeLessThan(lamp.dimM);
    await emitAck(gm, 'light:delete', { lightId: lamp.id });
  });

  it('measures the room with its doors shut, however they happen to stand', async () => {
    // The failure this covers, found by clicking: a room with one door standing
    // open measured as „everything the doorway leads to" — a 6 m bedroom came
    // out as a 50 m floodlight. The light still spills through the open door
    // when it is drawn; it just no longer decides how strong the bulb is.
    const door = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId,
        kind: 'door',
        points: [
          { x: 1400, y: 1150 },
          { x: 1400, y: 1250 },
        ],
      }),
      'wall:create door',
    )[0]!;
    await emitAck(gm, 'door:toggle', { wallId: door.id, open: true });

    const lamp = data(
      await emitAck<LightView>(gm, 'light:create', {
        sceneId,
        x: 1200,
        y: 1200,
        fitRoom: true,
      }),
      'light:create fitRoom with open door',
    );
    expect(lamp.dimM).toBeLessThan(6.5);
    await emitAck(gm, 'light:delete', { lightId: lamp.id });
    await emitAck(gm, 'wall:delete', { wallId: door.id });
  });

  it('re-measures an existing lamp when asked, and leaves it alone otherwise', async () => {
    const lamp = data(
      await emitAck<LightView>(gm, 'light:create', { sceneId, x: 1200, y: 1200, dimM: 40 }),
      'light:create',
    );
    expect(lamp.dimM).toBe(40);

    const fitted = data(
      await emitAck<LightView>(gm, 'light:update', {
        lightId: lamp.id,
        patch: {},
        fitRoom: true,
      }),
      'light:update fitRoom',
    );
    expect(fitted.dimM).toBeLessThan(6.5);

    // Moving *and* fitting in one patch measures where it lands, not where it
    // was: outside the room the fit reaches for the whole 80 m map, and is
    // capped instead.
    const moved = data(
      await emitAck<LightView>(gm, 'light:update', {
        lightId: lamp.id,
        patch: { x: 3000, y: 3000 },
        fitRoom: true,
      }),
      'light:update move and fit',
    );
    expect(moved.dimM).toBe(50);
    await emitAck(gm, 'light:delete', { lightId: lamp.id });
  });
});
