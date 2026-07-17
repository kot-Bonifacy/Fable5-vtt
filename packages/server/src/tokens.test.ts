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
  TokenAssetView,
  TokenDeleteBroadcast,
  TokenMoveBroadcast,
  TokenUpsertBroadcast,
  TokenView,
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

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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

/**
 * Round-trips `state:request` → `state:sync`. Server emissions per socket are
 * ordered, so once the sync arrives every earlier broadcast has, too — this
 * both flushes in-flight traffic and returns the fresh state.
 */
async function roundTrip(socket: ClientSocket): Promise<StateSyncPayload> {
  const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
  await emitAck(socket, 'state:request');
  return sync;
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
    payload: { name: 'Kampania tokenów' },
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

describe('token asset library', () => {
  it('stores a GM upload and lists it; players are forbidden', async () => {
    const { payload, headers } = multipartBody('Morgan Blackhand.png', PNG_1X1);
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/tokens',
      headers: { ...headers, cookie: gmCookie },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const asset = res.json() as TokenAssetView;
    expect(asset.name).toBe('Morgan Blackhand');
    expect(asset.url).toMatch(/^\/uploads\/tokens\/.+\.png$/);

    const list = await built.app.inject({
      method: 'GET',
      url: '/api/token-assets',
      headers: { cookie: gmCookie },
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as TokenAssetView[]).map((a) => a.id)).toContain(asset.id);

    const forbidden = await built.app.inject({
      method: 'GET',
      url: '/api/token-assets',
      headers: { cookie: playerCookie },
    });
    expect(forbidden.statusCode).toBe(403);
  });
});

describe('tokens', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let ownTokenId: string;
  let npcTokenId: string;
  let hiddenTokenId: string;
  /** Every token event the player socket ever receives — leak detector. */
  const playerTokenTraffic: unknown[] = [];

  it('sets up an active scene with visible, owned and hidden tokens', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    for (const event of ['token:upsert', 'token:delete', 'token:move']) {
      player.on(event, (payload: unknown) => playerTokenTraffic.push(payload));
    }
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const created = await emitAck<SceneView>(gm, 'scene:create', { name: 'Zaułek' });
    if (!created.ok || !created.data) throw new Error('scene:create failed');
    sceneId = created.data.id;
    const activated = waitFor(player, 'scene:activate');
    expect((await emitAck(gm, 'scene:activate', { sceneId })).ok).toBe(true);
    await activated;

    const own = await emitAck<TokenView>(gm, 'token:create', {
      sceneId,
      name: 'Rogue',
      x: 130,
      y: 170,
      ownerId: playerId,
      hp: { current: 20, max: 30 },
    });
    if (!own.ok || !own.data) throw new Error(`own token:create failed`);
    ownTokenId = own.data.id;
    // Positions snap on the server (default grid: 100 px, no offset).
    expect(own.data).toMatchObject({ x: 100, y: 200, size: 1 });

    const npc = await emitAck<TokenView>(gm, 'token:create', {
      sceneId,
      name: 'Bouncer',
      x: 400,
      y: 400,
      hp: { current: 25, max: 25 },
    });
    if (!npc.ok || !npc.data) throw new Error('npc token:create failed');
    npcTokenId = npc.data.id;

    const hidden = await emitAck<TokenView>(gm, 'token:create', {
      sceneId,
      name: 'Zaczajony cyberpsychol',
      x: 700,
      y: 700,
      hidden: true,
    });
    if (!hidden.ok || !hidden.data) throw new Error('hidden token:create failed');
    hiddenTokenId = hidden.data.id;
  });

  it('never sends hidden tokens or foreign HP to players', async () => {
    const payload = await roundTrip(player);
    const raw = JSON.stringify(payload);

    expect(payload.tokens.map((t) => t.id).sort()).toEqual([npcTokenId, ownTokenId].sort());
    expect(raw).not.toContain(hiddenTokenId);
    expect(raw).not.toContain('cyberpsychol');

    const ownView = payload.tokens.find((t) => t.id === ownTokenId)!;
    expect(ownView.hp).toEqual({ current: 20, max: 30 });
    const npcView = payload.tokens.find((t) => t.id === npcTokenId)!;
    // The key must be absent entirely — foreign HP never crosses the wire.
    expect('hp' in npcView).toBe(false);

    // The hidden token's create broadcast never reached the player either.
    expect(JSON.stringify(playerTokenTraffic)).not.toContain(hiddenTokenId);

    const gmPayload = await roundTrip(gm);
    expect(gmPayload.tokens).toHaveLength(3);
    expect(gmPayload.tokens.find((t) => t.id === npcTokenId)!.hp).toEqual({
      current: 25,
      max: 25,
    });
  });

  it('lets the owner move their token with server-side snapping', async () => {
    const gmSees = waitFor<TokenMoveBroadcast>(gm, 'token:move');
    const ack = await emitAck<{ x: number; y: number }>(player, 'token:move', {
      tokenId: ownTokenId,
      x: 342,
      y: 528,
      final: true,
    });
    expect(ack.ok).toBe(true);
    expect(ack.ok && ack.data).toEqual({ x: 300, y: 500 });
    expect(await gmSees).toMatchObject({ tokenId: ownTokenId, x: 300, y: 500, final: true });
  });

  it('rejects a player moving a foreign or hidden token', async () => {
    const foreign = await emitAck(player, 'token:move', {
      tokenId: npcTokenId,
      x: 0,
      y: 0,
      final: true,
    });
    expect(foreign).toEqual({ ok: false, error: 'FORBIDDEN' });

    // Hidden tokens must not even reveal their existence.
    const hidden = await emitAck(player, 'token:move', {
      tokenId: hiddenTokenId,
      x: 0,
      y: 0,
      final: true,
    });
    expect(hidden).toEqual({ ok: false, error: 'TOKEN_NOT_FOUND' });

    const create = await emitAck(player, 'token:create', { sceneId, name: 'X', x: 0, y: 0 });
    expect(create).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('keeps GM moves of hidden tokens out of player traffic', async () => {
    const ack = await emitAck(gm, 'token:move', {
      tokenId: hiddenTokenId,
      x: 800,
      y: 800,
      final: true,
    });
    expect(ack.ok).toBe(true);
    // Flush the player socket, then check nothing about the token arrived.
    await roundTrip(player);
    expect(JSON.stringify(playerTokenTraffic)).not.toContain(hiddenTokenId);
  });

  it('hiding removes the token from players instantly; revealing brings it back', async () => {
    const removed = waitFor<TokenDeleteBroadcast>(player, 'token:delete');
    const hide = await emitAck(gm, 'token:update', {
      tokenId: npcTokenId,
      patch: { hidden: true },
    });
    expect(hide.ok).toBe(true);
    expect(await removed).toMatchObject({ tokenId: npcTokenId, sceneId });

    const reappeared = waitFor<TokenUpsertBroadcast>(player, 'token:upsert');
    const show = await emitAck(gm, 'token:update', {
      tokenId: npcTokenId,
      patch: { hidden: false },
    });
    expect(show.ok).toBe(true);
    const upsert = await reappeared;
    expect(upsert.token).toMatchObject({ id: npcTokenId, hidden: false });
    expect('hp' in upsert.token).toBe(false);
  });

  it('validates statuses against the data registry', async () => {
    const updated = await emitAck<TokenView>(gm, 'token:update', {
      tokenId: npcTokenId,
      patch: { statuses: ['stunned', 'nie-istnieje', 'on-fire'] },
    });
    expect(updated.ok).toBe(true);
    expect(updated.ok && updated.data?.statuses).toEqual(['stunned', 'on-fire']);
  });

  it('deletes tokens campaign-wide', async () => {
    const gone = waitFor<TokenDeleteBroadcast>(player, 'token:delete');
    const ack = await emitAck(gm, 'token:delete', { tokenId: npcTokenId });
    expect(ack.ok).toBe(true);
    expect(await gone).toMatchObject({ tokenId: npcTokenId });
  });
});
