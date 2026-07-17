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
  MapUploadResult,
  SceneActivateBroadcast,
  SceneListBroadcast,
  SceneUpdateBroadcast,
  SceneView,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

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
};

// Smallest valid 1×1 PNG — enough for the sniffing/dimension pipeline.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let built: BuiltApp;
let baseUrl: string;
let gmCookie: string;
let playerCookie: string;
const openSockets: ClientSocket[] = [];

function cookieOf(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error('missing set-cookie header');
  return raw.split(';')[0]!;
}

function createSocket(cookie: string): { socket: ClientSocket; firstSync: Promise<StateSyncPayload> } {
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

/** Resolves when `event` does NOT arrive within `ms`; rejects if it does. */
function expectSilence(socket: ClientSocket, event: string, ms = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    const onEvent = (payload: unknown) => {
      clearTimeout(timer);
      reject(new Error(`unexpected ${event}: ${JSON.stringify(payload)}`));
    };
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      resolve();
    }, ms);
    socket.once(event, onEvent);
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

function multipartBody(
  filename: string,
  content: Buffer,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----vtt${randomBytes(8).toString('hex')}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, content, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
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
    payload: { name: 'Kampania scen' },
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

describe('map upload', () => {
  it('accepts a PNG from the GM and serves it back', async () => {
    const { payload, headers } = multipartBody('mapa.png', PNG_1X1);
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/maps',
      headers: { ...headers, cookie: gmCookie },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const result = res.json() as MapUploadResult;
    expect(result).toMatchObject({ width: 1, height: 1 });
    expect(result.url).toMatch(/^\/uploads\/maps\/.+\.png$/);

    const served = await built.app.inject({ method: 'GET', url: result.url });
    expect(served.statusCode).toBe(200);
    expect(served.rawPayload.equals(PNG_1X1)).toBe(true);
  });

  it('rejects non-image content and player uploads', async () => {
    const bogus = multipartBody('mapa.png', Buffer.from('to nie jest obrazek'));
    const badContent = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/maps',
      headers: { ...bogus.headers, cookie: gmCookie },
      payload: bogus.payload,
    });
    expect(badContent.statusCode).toBe(400);

    const asPlayer = multipartBody('mapa.png', PNG_1X1);
    const forbidden = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/maps',
      headers: { ...asPlayer.headers, cookie: playerCookie },
      payload: asPlayer.payload,
    });
    expect(forbidden.statusCode).toBe(403);
  });
});

describe('scene lifecycle', () => {
  let sceneAId: string;
  let sceneBId: string;

  it('lets the GM create scenes with CP RED defaults; players are forbidden', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;

    const created = await emitAck<SceneView>(gm.socket, 'scene:create', { name: 'Ulica' });
    if (!created.ok || !created.data) throw new Error('scene:create failed');
    sceneAId = created.data.id;
    expect(created.data).toMatchObject({
      name: 'Ulica',
      active: false,
      background: null,
      gridMode: 'grid',
      metersPerSquare: 2,
    });
    expect(created.data.grid.sizePx).toBe(100);

    const listUpdate = waitFor<SceneListBroadcast>(gm.socket, 'scene:list');
    const second = await emitAck<SceneView>(gm.socket, 'scene:create', { name: 'Klub Totentanz' });
    if (!second.ok || !second.data) throw new Error('second scene:create failed');
    sceneBId = second.data.id;
    expect((await listUpdate).scenes.map((s) => s.name)).toEqual(['Ulica', 'Klub Totentanz']);

    const player = createSocket(playerCookie);
    await player.firstSync;
    expect(await emitAck(player.socket, 'scene:create', { name: 'Nielegalna' })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });

    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('keeps non-active scene updates and the scene list away from players', async () => {
    const gm = createSocket(gmCookie);
    const player = createSocket(playerCookie);
    const [gmSync, playerSync] = await Promise.all([gm.firstSync, player.firstSync]);

    // GM sees the manager list; the player gets nothing scene-related yet.
    expect(gmSync.scenes.map((s) => s.name)).toEqual(['Ulica', 'Klub Totentanz']);
    expect(playerSync.scenes).toEqual([]);
    expect(playerSync.scene).toBeNull();

    // GM previews scene A and edits it — the player must stay silent.
    const viewAck = await emitAck<SceneView>(gm.socket, 'scene:view', { sceneId: sceneAId });
    expect(viewAck.ok).toBe(true);

    const gmUpdate = waitFor<SceneUpdateBroadcast>(gm.socket, 'scene:update');
    const playerSilent = expectSilence(player.socket, 'scene:update');
    const updateAck = await emitAck<SceneView>(gm.socket, 'scene:update', {
      sceneId: sceneAId,
      patch: { grid: { sizePx: 50, color: '#ff0000' } },
    });
    if (!updateAck.ok || !updateAck.data) throw new Error('scene:update failed');
    expect(updateAck.data.grid).toMatchObject({ sizePx: 50, color: '#ff0000' });

    const preview = await gmUpdate;
    expect(preview.seq).toBeUndefined();
    expect(preview.scene.grid.sizePx).toBe(50);
    await playerSilent;

    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('activation switches every player to the scene with a sequenced broadcast', async () => {
    const gm = createSocket(gmCookie);
    const player = createSocket(playerCookie);
    await Promise.all([gm.firstSync, player.firstSync]);

    const playerActivate = waitFor<SceneActivateBroadcast>(player.socket, 'scene:activate');
    const gmActivate = waitFor<SceneActivateBroadcast>(gm.socket, 'scene:activate');
    const ack = await emitAck(gm.socket, 'scene:activate', { sceneId: sceneAId });
    expect(ack.ok).toBe(true);

    const toPlayer = await playerActivate;
    expect(toPlayer.seq).toEqual(expect.any(Number));
    expect(toPlayer.scene).toMatchObject({ id: sceneAId, name: 'Ulica', active: true });
    await gmActivate;

    // Player now views the active scene — updates reach them with a seq.
    const playerUpdate = waitFor<SceneUpdateBroadcast>(player.socket, 'scene:update');
    const updateAck = await emitAck(gm.socket, 'scene:update', {
      sceneId: sceneAId,
      patch: { gridMode: 'gridless' },
    });
    expect(updateAck.ok).toBe(true);
    const broadcast = await playerUpdate;
    expect(broadcast.seq).toEqual(expect.any(Number));
    expect(broadcast.scene.gridMode).toBe('gridless');

    // A reconnecting player syncs straight into the active scene.
    const playerAgain = createSocket(playerCookie);
    const sync = await playerAgain.firstSync;
    expect(sync.scene?.id).toBe(sceneAId);
    expect(sync.scenes).toEqual([]);

    gm.socket.disconnect();
    player.socket.disconnect();
    playerAgain.socket.disconnect();
  });

  it('adopts background dimensions as scene size on upload patch', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const ack = await emitAck<SceneView>(gm.socket, 'scene:update', {
      sceneId: sceneBId,
      patch: { background: { url: '/uploads/maps/x.png', width: 4096, height: 2048 } },
    });
    if (!ack.ok || !ack.data) throw new Error('scene:update failed');
    expect(ack.data).toMatchObject({ width: 4096, height: 2048 });
    gm.socket.disconnect();
  });

  it('refuses to delete the active scene, deletes inactive ones', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;

    expect(await emitAck(gm.socket, 'scene:delete', { sceneId: sceneAId })).toEqual({
      ok: false,
      error: 'SCENE_ACTIVE',
    });

    const listUpdate = waitFor<SceneListBroadcast>(gm.socket, 'scene:list');
    const ack = await emitAck(gm.socket, 'scene:delete', { sceneId: sceneBId });
    expect(ack.ok).toBe(true);
    expect((await listUpdate).scenes.map((s) => s.name)).toEqual(['Ulica']);

    gm.socket.disconnect();
  });
});
