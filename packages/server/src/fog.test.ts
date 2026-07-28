import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  FogShapeView,
  InvitationSummary,
  MapNoteView,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Stage 17 smoke tests: fog of war and the GM layer over live sockets.
 *
 * The point of these is not that the fog renders — it is that a player's
 * socket never receives what the fog is meant to hide. Every assertion here
 * looks at what actually crossed the wire for the player, which is the only
 * definition of „hidden" the project accepts.
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
  if (!ack.ok || ack.data === undefined) throw new Error(`${what} failed: ${ack.error ?? '?'}`);
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

describe('fog of war', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  /** Sits at (100,100)-(200,200); centre (150,150). GM-owned NPC. */
  let npcTokenId: string;
  /** Owned by the player, parked far away in the dark at centre (2050,2050). */
  let ownTokenId: string;

  beforeAll(async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Zaułek' }),
      'scene:create',
    );
    sceneId = scene.id;
    await emitAck(gm, 'scene:update', {
      sceneId,
      patch: { width: 4000, height: 4000, grid: { sizePx: 100 } },
    });
    await emitAck(gm, 'scene:activate', { sceneId });

    npcTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', { sceneId, name: 'Ganger', x: 100, y: 100 }),
      'token:create',
    ).id;
    ownTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Rogue',
        x: 2000,
        y: 2000,
        ownerId: playerId,
      }),
      'token:create',
    ).id;
    await roundTrip(player);
  }, 30_000);

  it('starts covered: a new scene hides every token the player does not control', async () => {
    const sync = await roundTrip(player);
    expect(sync.fog).not.toBeNull();
    expect(sync.fog?.enabled).toBe(true);
    expect(sync.fog?.shapes).toEqual([]);
    // The NPC is in the dark; the player's own token stays, by design.
    expect(sync.tokens.map((t) => t.id)).toEqual([ownTokenId]);
  });

  it('reveals a token when the GM paints over it, and takes it back on re-cover', async () => {
    const revealed = data(
      await emitAck<FogShapeView>(gm, 'fog:paint', {
        sceneId,
        shape: { kind: 'rect', mode: 'reveal', x: 0, y: 0, width: 400, height: 400 },
      }),
      'fog:paint',
    );
    expect(revealed.id).toBeGreaterThan(0);

    const afterReveal = await roundTrip(player);
    expect(afterReveal.tokens.map((t) => t.id)).toContain(npcTokenId);
    expect(afterReveal.fog?.shapes).toHaveLength(1);

    // Painting fog back over the same spot must remove it again — order wins,
    // there is no „reveal beats hide" precedence.
    await emitAck(gm, 'fog:paint', {
      sceneId,
      shape: { kind: 'rect', mode: 'hide', x: 0, y: 0, width: 400, height: 400 },
    });
    const afterHide = await roundTrip(player);
    expect(afterHide.tokens.map((t) => t.id)).not.toContain(npcTokenId);
    // Undo drops the re-cover and the NPC comes back.
    await emitAck(gm, 'fog:undo', { sceneId });
    const afterUndo = await roundTrip(player);
    expect(afterUndo.tokens.map((t) => t.id)).toContain(npcTokenId);
  });

  it('pushes the player a filtered token list the moment the fog changes', async () => {
    await emitAck(gm, 'fog:reset', { sceneId, mode: 'hide' });
    await roundTrip(player);

    const sync = waitFor<{ sceneId: string; tokens: TokenView[] }>(player, 'token:sync');
    await emitAck(gm, 'fog:paint', {
      sceneId,
      shape: { kind: 'stroke', mode: 'reveal', points: [{ x: 150, y: 150 }], radius: 80 },
    });
    const pushed = await sync;
    expect(pushed.sceneId).toBe(sceneId);
    expect(pushed.tokens.map((t) => t.id)).toContain(npcTokenId);
  });

  it('never broadcasts a concealed token to a player, not even as it moves', async () => {
    await emitAck(gm, 'fog:reset', { sceneId, mode: 'hide' });
    await roundTrip(player);

    const upserts = record<{ token: TokenView }>(player, 'token:upsert');
    const moves = record<{ tokenId: string }>(player, 'token:move');

    // The GM walks the NPC around the dark part of the map.
    await emitAck(gm, 'token:move', { tokenId: npcTokenId, x: 500, y: 500, final: true });
    await emitAck(gm, 'token:move', { tokenId: npcTokenId, x: 900, y: 900, final: true });
    // Renaming it emits an upsert through the ordinary path.
    await emitAck(gm, 'token:update', { tokenId: npcTokenId, patch: { name: 'Ganger z nożem' } });
    await roundTrip(player);

    expect(upserts.filter((u) => u.token.id === npcTokenId)).toEqual([]);
    expect(moves.filter((m) => m.tokenId === npcTokenId)).toEqual([]);
    // …while the GM sees all of it.
    const gmSync = await roundTrip(gm);
    expect(gmSync.tokens.map((t) => t.id)).toContain(npcTokenId);
  });

  it('is GM-only: a player cannot paint, reset, undo or toggle the fog', async () => {
    const paint = await emitAck(player, 'fog:paint', {
      sceneId,
      shape: { kind: 'rect', mode: 'reveal', x: 0, y: 0, width: 4000, height: 4000 },
    });
    expect(paint.ok).toBe(false);
    expect((await emitAck(player, 'fog:reset', { sceneId, mode: 'reveal' })).ok).toBe(false);
    expect((await emitAck(player, 'fog:undo', { sceneId })).ok).toBe(false);
    expect((await emitAck(player, 'fog:toggle', { sceneId, enabled: false })).ok).toBe(false);

    const sync = await roundTrip(player);
    expect(sync.tokens.map((t) => t.id)).not.toContain(npcTokenId);
  });

  it('rejects malformed shapes rather than storing them', async () => {
    const before = (await roundTrip(gm)).fog?.shapes.length ?? 0;
    expect((await emitAck(gm, 'fog:paint', { sceneId, shape: { kind: 'blob' } })).ok).toBe(false);
    expect(
      (await emitAck(gm, 'fog:paint', { sceneId, shape: { kind: 'rect', mode: 'reveal' } })).ok,
    ).toBe(false);
    expect(
      (
        await emitAck(gm, 'fog:paint', {
          sceneId,
          shape: { kind: 'stroke', mode: 'reveal', points: [], radius: 10 },
        })
      ).ok,
    ).toBe(false);
    expect((await roundTrip(gm)).fog?.shapes.length ?? 0).toBe(before);
  });

  it('switching fog off lights the scene up; switching it back on restores the paint', async () => {
    // An earlier test walked the NPC into the dark — put it back where the
    // reveal below can reach it.
    await emitAck(gm, 'token:move', { tokenId: npcTokenId, x: 100, y: 100, final: true });
    await emitAck(gm, 'fog:reset', { sceneId, mode: 'hide' });
    await emitAck(gm, 'fog:paint', {
      sceneId,
      shape: { kind: 'rect', mode: 'reveal', x: 0, y: 0, width: 400, height: 400 },
    });
    await emitAck(gm, 'fog:toggle', { sceneId, enabled: false });

    const lit = await roundTrip(player);
    expect(lit.fog?.enabled).toBe(false);
    expect(lit.scene?.fogEnabled).toBe(false);
    expect(lit.tokens.map((t) => t.id)).toEqual(expect.arrayContaining([npcTokenId, ownTokenId]));

    await emitAck(gm, 'fog:toggle', { sceneId, enabled: true });
    const dark = await roundTrip(player);
    expect(dark.fog?.enabled).toBe(true);
    // The reveal painted before the switch survived it.
    expect(dark.fog?.shapes).toHaveLength(1);
    expect(dark.tokens.map((t) => t.id)).toContain(npcTokenId);
  });

  it('reveal-everything compacts the shape list to a single rectangle', async () => {
    await emitAck(gm, 'fog:paint', {
      sceneId,
      shape: { kind: 'stroke', mode: 'reveal', points: [{ x: 10, y: 10 }], radius: 20 },
    });
    await emitAck(gm, 'fog:reset', { sceneId, mode: 'reveal' });
    const sync = await roundTrip(player);
    expect(sync.fog?.shapes).toHaveLength(1);
    expect(sync.fog?.shapes[0]).toMatchObject({
      kind: 'rect',
      mode: 'reveal',
      x: 0,
      y: 0,
      width: 4000,
      height: 4000,
    });
    expect(sync.tokens.map((t) => t.id)).toEqual(expect.arrayContaining([npcTokenId, ownTokenId]));
  });
});

describe('GM layer notes', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;

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
    await emitAck(gm, 'scene:activate', { sceneId });
    // The GM keeps its own viewed scene across an activation (stage 04), and
    // this socket was already looking at the previous one.
    await emitAck(gm, 'scene:view', { sceneId });
    await roundTrip(player);
  }, 30_000);

  it('never reaches a player — not in a broadcast, not in a sync', async () => {
    const leaked = record<unknown>(player, 'note:upsert');
    const gmNotes = waitFor<{ note: MapNoteView }>(gm, 'note:upsert');

    const note = data(
      await emitAck<MapNoteView>(gm, 'note:create', {
        sceneId,
        x: 640,
        y: 480,
        icon: '💀',
        text: 'Za drzwiami czeka zasadzka — 3 gangerów.',
      }),
      'note:create',
    );
    expect((await gmNotes).note.id).toBe(note.id);

    const playerSync = await roundTrip(player);
    expect(playerSync.notes).toEqual([]);
    expect(leaked).toEqual([]);
    // The whole payload must not contain the text anywhere else either.
    expect(JSON.stringify(playerSync)).not.toContain('zasadzka');

    const gmSync = await roundTrip(gm);
    expect(gmSync.notes.map((n) => n.id)).toContain(note.id);
    expect(gmSync.notes[0]?.icon).toBe('💀');
  });

  it('is GM-only and survives a reconnect', async () => {
    const created = data(
      await emitAck<MapNoteView>(gm, 'note:create', {
        sceneId,
        x: 10,
        y: 10,
        text: 'Karta dostępu',
      }),
      'note:create',
    );
    expect((await emitAck(player, 'note:create', { sceneId, x: 0, y: 0, text: 'x' })).ok).toBe(
      false,
    );
    expect(
      (await emitAck(player, 'note:update', { noteId: created.id, patch: { text: 'x' } })).ok,
    ).toBe(false);
    expect((await emitAck(player, 'note:delete', { noteId: created.id })).ok).toBe(false);

    await emitAck(gm, 'note:update', {
      noteId: created.id,
      patch: { text: 'Karta dostępu — poziom 3' },
    });

    // Fresh socket = the reconnect path; the note comes back from the database.
    const reconnect = createSocket(gmCookie);
    const sync = await reconnect.firstSync;
    const found = sync.notes.find((n) => n.id === created.id);
    expect(found?.text).toBe('Karta dostępu — poziom 3');

    await emitAck(gm, 'note:delete', { noteId: created.id });
    expect((await roundTrip(gm)).notes.map((n) => n.id)).not.toContain(created.id);
  });

  it('rejects empty text and unknown notes', async () => {
    expect((await emitAck(gm, 'note:create', { sceneId, x: 0, y: 0, text: '   ' })).ok).toBe(false);
    expect((await emitAck(gm, 'note:delete', { noteId: 'nie-ma-takiej' })).ok).toBe(false);
  });
});
