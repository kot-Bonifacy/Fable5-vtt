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
  PortraitAssetView,
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
  // Deliberately absent: tests run on the committed sample compendium,
  // which is also the "fresh clone without data/private" path.
  dataPrivateDir: resolve(import.meta.dirname, 'fixtures/no-private-data'),
  // The gateway is never reachable in these suites — bots stay unavailable.
  aiGatewayUrl: 'http://127.0.0.1:1',
  aiGatewayApiKey: '',
  aiHealthIntervalMs: 60_000,
  aiRequestTimeoutMs: 1000,
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

/**
 * Pula portretów (zaległość 23.08): dokłada MG, ogląda cały stół.
 *
 * Różnica wobec biblioteki żetonów wyżej jest jedna i jest celowa — listę
 * portretów **widzi gracz**, bo to z niej wybiera obrazek swojej postaci.
 */
describe('portrait pool', () => {
  let assetId = '';

  it('takes a GM upload and shows it to players; a player cannot upload', async () => {
    const { payload, headers } = multipartBody('Rache Bartmoss.png', PNG_1X1);
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/portrait-assets',
      headers: { ...headers, cookie: gmCookie },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const asset = res.json() as PortraitAssetView;
    assetId = asset.id;
    expect(asset.name).toBe('Rache Bartmoss');
    expect(asset.url).toMatch(/^\/uploads\/portraits\/.+\.png$/);

    const seenByPlayer = await built.app.inject({
      method: 'GET',
      url: '/api/portrait-assets',
      headers: { cookie: playerCookie },
    });
    expect(seenByPlayer.statusCode).toBe(200);
    expect((seenByPlayer.json() as PortraitAssetView[]).map((a) => a.id)).toContain(assetId);

    const asPlayer = multipartBody('gracz.png', PNG_1X1);
    const refused = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/portrait-assets',
      headers: { ...asPlayer.headers, cookie: playerCookie },
      payload: asPlayer.payload,
    });
    expect(refused.statusCode).toBe(403);
  });

  it('keeps the direct portrait upload for the GM alone', async () => {
    const { payload, headers } = multipartBody('wprost.png', PNG_1X1);
    const refused = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/portraits',
      headers: { ...headers, cookie: playerCookie },
      payload,
    });
    expect(refused.statusCode).toBe(403);

    const allowed = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/portraits',
      headers: { ...headers, cookie: gmCookie },
      payload,
    });
    expect(allowed.statusCode).toBe(201);
  });

  it('lets the GM take a portrait off the pool, and nobody else', async () => {
    const refused = await built.app.inject({
      method: 'DELETE',
      url: `/api/portrait-assets/${assetId}`,
      headers: { cookie: playerCookie },
    });
    expect(refused.statusCode).toBe(403);

    const removed = await built.app.inject({
      method: 'DELETE',
      url: `/api/portrait-assets/${assetId}`,
      headers: { cookie: gmCookie },
    });
    expect(removed.statusCode).toBe(204);

    const list = await built.app.inject({
      method: 'GET',
      url: '/api/portrait-assets',
      headers: { cookie: gmCookie },
    });
    expect((list.json() as PortraitAssetView[]).map((a) => a.id)).not.toContain(assetId);
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
    // Stage 17: a fresh scene starts under fog, which would hide these
    // tokens from the player. This suite is not about fog — light it up.
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
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

  /**
   * The frames of a drag and of a march (stage 16e) are sent fire-and-forget:
   * one argument, no acknowledgement. They used to be swallowed on arrival —
   * the payload was mistaken for the missing callback — so everyone but the
   * mover saw the figure stand still and then jump to where it landed.
   */
  it('broadcasts an ack-less intermediate frame — a walk must not arrive in one jump', async () => {
    const gmSees = waitFor<TokenMoveBroadcast>(gm, 'token:move');
    player.emit('token:move', { tokenId: ownTokenId, x: 342, y: 528, final: false });
    const frame = await gmSees;
    // Mid-stride positions are clamped, never snapped: the figure is between
    // two squares, which is the whole point of an intermediate frame.
    expect(frame).toMatchObject({ tokenId: ownTokenId, x: 342, y: 528, final: false });
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

  /**
   * Stage 27j. The angle a figure is turned to is server state like everything
   * else: walking writes it, a hand may overwrite it, and the next walk wins
   * again. These four cover the whole contract.
   */
  it('turns a figure the way it walked, and says so on the drop', async () => {
    const gmSees = waitFor<TokenMoveBroadcast>(gm, 'token:move');
    // Straight up the map from (300, 500): the drop is the only frame that
    // carries an angle, and „up" is negative Y.
    const ack = await emitAck<{ x: number; y: number }>(player, 'token:move', {
      tokenId: ownTokenId,
      x: 300,
      y: 100,
      final: true,
    });
    expect(ack.ok).toBe(true);
    expect(await gmSees).toMatchObject({ tokenId: ownTokenId, facing: 0 });

    const payload = await roundTrip(player);
    expect(payload.tokens.find((t) => t.id === ownTokenId)?.facing).toBe(0);
  });

  it('measures the turn from the route walked, not the line to the landing', async () => {
    // Out east and then back north: the straight line to the landing square
    // points north-east, the last leg of the route points north.
    const ack = await emitAck<{ x: number; y: number }>(player, 'token:move', {
      tokenId: ownTokenId,
      x: 500,
      y: 300,
      final: true,
      path: [
        { x: 500, y: 100 },
        { x: 500, y: 300 },
      ],
    });
    expect(ack.ok).toBe(true);
    const payload = await roundTrip(player);
    // The last leg went *down* the map (y grows), so the figure faces down.
    expect(payload.tokens.find((t) => t.id === ownTokenId)?.facing).toBe(180);
  });

  it('lets the owner turn their own figure by hand and everybody see it', async () => {
    const gmSees = waitFor<TokenUpsertBroadcast>(gm, 'token:upsert');
    const ack = await emitAck<TokenView>(player, 'token:facing', {
      tokenId: ownTokenId,
      facing: 271.4,
    });
    expect(ack.ok).toBe(true);
    // Folded to a whole degree on the way in, like every other angle.
    expect(ack.ok && ack.data?.facing).toBe(271);
    expect((await gmSees).token).toMatchObject({ id: ownTokenId, facing: 271 });
  });

  it('refuses a hand-turn of a foreign figure, and hides that a hidden one exists', async () => {
    const foreign = await emitAck(player, 'token:facing', { tokenId: npcTokenId, facing: 90 });
    expect(foreign.ok).toBe(false);
    expect(!foreign.ok && foreign.error).toBe('FORBIDDEN');

    const hidden = await emitAck(player, 'token:facing', { tokenId: hiddenTokenId, facing: 90 });
    expect(hidden.ok).toBe(false);
    expect(!hidden.ok && hidden.error).toBe('TOKEN_NOT_FOUND');

    const broken = await emitAck(player, 'token:facing', { tokenId: ownTokenId, facing: 'north' });
    expect(broken.ok).toBe(false);
    expect(!broken.ok && broken.error).toBe('BAD_REQUEST');
  });

  it('deletes tokens campaign-wide', async () => {
    const gone = waitFor<TokenDeleteBroadcast>(player, 'token:delete');
    const ack = await emitAck(gm, 'token:delete', { tokenId: npcTokenId });
    expect(ack.ok).toBe(true);
    expect(await gone).toMatchObject({ tokenId: npcTokenId });
  });
});

/**
 * Kosz biblioteki żetonów (zaległość z 22.08, zrobiona 27.08).
 *
 * Odwrotnie niż w puli portretów wyżej: zdjęcie grafiki **rusza scenę**, bo
 * żeton, który ją nosił, wraca do krążka. Dlatego to zdarzenie gniazda, a nie
 * trasa REST — i dlatego test patrzy nie tylko na listę, ale i na `token:upsert`.
 */
describe('token library bin', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let assetId = '';
  let assetUrl = '';
  let tokenId = '';

  it('clears the picture off every figure wearing it', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const { payload, headers } = multipartBody('Do skasowania.png', PNG_1X1);
    const upload = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/tokens',
      headers: { ...headers, cookie: gmCookie },
      payload,
    });
    const asset = upload.json() as TokenAssetView;
    assetId = asset.id;
    assetUrl = asset.url;

    const scene = await emitAck<SceneView>(gm, 'scene:create', { name: 'Kosz biblioteki' });
    if (!scene.ok || !scene.data) throw new Error('scene:create failed');
    await emitAck(gm, 'scene:visibility', { sceneId: scene.data.id, visibility: 'open' });
    await emitAck(gm, 'scene:activate', { sceneId: scene.data.id });

    const token = await emitAck<TokenView>(gm, 'token:create', {
      sceneId: scene.data.id,
      name: 'Nosi tę grafikę',
      imageUrl: assetUrl,
      x: 100,
      y: 100,
    });
    if (!token.ok || !token.data) throw new Error('token:create failed');
    tokenId = token.data.id;
    expect(token.data.imageUrl).toBe(assetUrl);

    const upsert = waitFor<TokenUpsertBroadcast>(gm, 'token:upsert');
    const removed = await emitAck<{ clearedTokens: number }>(gm, 'token:asset-delete', { assetId });
    expect(removed).toMatchObject({ ok: true, data: { clearedTokens: 1 } });
    expect((await upsert).token).toMatchObject({ id: tokenId, imageUrl: null });

    const list = await built.app.inject({
      method: 'GET',
      url: '/api/token-assets',
      headers: { cookie: gmCookie },
    });
    expect((list.json() as TokenAssetView[]).map((a) => a.id)).not.toContain(assetId);
  });

  it('refuses a player, an unknown id and a second run', async () => {
    expect(await emitAck(player, 'token:asset-delete', { assetId })).toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await emitAck(gm, 'token:asset-delete', { assetId })).toMatchObject({
      ok: false,
      error: 'ASSET_NOT_FOUND',
    });
    expect(await emitAck(gm, 'token:asset-delete', {})).toMatchObject({
      ok: false,
      error: 'BAD_REQUEST',
    });
  });

  /**
   * Plik zostaje na dysku do najbliższego przebiegu `uploads-gc` — ale nikt go
   * już nie wymienia, więc zbieracz ma go zabrać. Tu wystarczy sprawdzić samą
   * przesłankę: żaden żeton ani wpis biblioteki nie trzyma już tego adresu.
   */
  it('leaves the file unreferenced for the sweeper', async () => {
    const state = await roundTrip(gm);
    expect(JSON.stringify(state)).not.toContain(assetUrl);
  });
});
