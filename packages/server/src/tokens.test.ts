import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  MapPingBroadcast,
  InvitationSummary,
  SceneView,
  SocketAck,
  StateSyncPayload,
  PortraitAssetView,
  PortraitCropBroadcast,
  TokenAssetView,
  TokenDeleteBroadcast,
  TokenMoveBroadcast,
  TokenUpsertBroadcast,
  TokenView,
} from '@vtt/shared';
import type { CharacterView, CpredCharacterData } from '@vtt/shared';
import { DEFAULT_PORTRAIT_CROP } from '@vtt/shared';
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

  /**
   * Od 12.09 wgranie portretu ma jedno wejście: trasę puli. Osobna
   * `/api/uploads/portraits`, która kładła plik bez wiersza w bazie, zniknęła —
   * portret bez wiersza nie miał gdzie trzymać kadru na mapie.
   */
  it('keeps the portrait upload for the GM alone, and only through the pool', async () => {
    const { payload, headers } = multipartBody('wprost.png', PNG_1X1);
    const refused = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/portrait-assets',
      headers: { ...headers, cookie: playerCookie },
      payload,
    });
    expect(refused.statusCode).toBe(403);

    const allowed = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/portrait-assets',
      headers: { ...headers, cookie: gmCookie },
      payload,
    });
    expect(allowed.statusCode).toBe(201);

    const gone = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/portraits',
      headers: { ...headers, cookie: gmCookie },
      payload,
    });
    expect(gone.statusCode).toBe(404);
  });

  /**
   * Kadr na mapie (12.09) — jedyne, co da się w wierszu puli zmienić po
   * wgraniu pliku, i jedyna rzecz z tego obszaru, która idzie gniazdem.
   *
   * Rozgłoszenie musi dojść **do gracza**, bo kadr jest cechą obrazka: MG
   * poprawia ujęcie raz, a przestawia je każdej figurze, która ten plik nosi,
   * u wszystkich naraz.
   */
  it('lets the GM reframe a portrait, tells the table, and clamps the numbers', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);
    try {
      const heard = waitFor<PortraitCropBroadcast>(playerConn.socket, 'portrait:crop');
      // Fikstura jest kwadratem 1 × 1, więc przy zoomie 2 swoboda kadru to
      // ćwiartka w każdą stronę — 0,9 i 0,1 muszą wrócić jako 0,75 i 0,25.
      const ack = await emitAck<PortraitAssetView>(gmConn.socket, 'portrait:crop', {
        assetId,
        crop: { x: 0.9, y: 0.1, zoom: 2 },
      });
      if (!ack.ok || !ack.data) throw new Error('portrait:crop failed');
      expect(ack.data.crop).toEqual({ x: 0.75, y: 0.25, zoom: 2 });
      expect((await heard).asset.crop).toEqual({ x: 0.75, y: 0.25, zoom: 2 });

      // Zapisane, a nie tylko odesłane.
      const list = await built.app.inject({
        method: 'GET',
        url: '/api/portrait-assets',
        headers: { cookie: playerCookie },
      });
      const stored = (list.json() as PortraitAssetView[]).find((a) => a.id === assetId);
      expect(stored?.crop).toEqual({ x: 0.75, y: 0.25, zoom: 2 });

      // Gracz nie kadruje **cudzego** obrazka.
      expect(
        await emitAck(playerConn.socket, 'portrait:crop', {
          assetId,
          crop: DEFAULT_PORTRAIT_CROP,
        }),
      ).toMatchObject({ ok: false, error: 'FORBIDDEN' });

      // …ale własny kadruje. Portret wybiera się raz, przy tworzeniu postaci,
      // i w rozgrywce gracz go nie zmienia — kadr na mapie zmienić może
      // (decyzja MG z 12.09), bo to jego figura stoi na stole.
      const card = await emitAck<CharacterView>(gmConn.socket, 'character:create', {
        name: 'Kadrujący',
        ownerId: playerId,
      });
      if (!card.ok || !card.data) throw new Error('character:create failed');
      expect(
        (
          await emitAck(playerConn.socket, 'character:update', {
            characterId: card.data.id,
            patch: { portraitUrl: ack.data.url },
          })
        ).ok,
      ).toBe(true);
      const own = await emitAck<PortraitAssetView>(playerConn.socket, 'portrait:crop', {
        assetId,
        crop: { x: 0.3, y: 0.7, zoom: 2 },
      });
      if (!own.ok || !own.data) throw new Error('player portrait:crop failed');
      expect(own.data.crop).toEqual({ x: 0.3, y: 0.7, zoom: 2 });
      // Kadrem nie jest cokolwiek: brak pola albo tekst to złe żądanie.
      expect(
        await emitAck(gmConn.socket, 'portrait:crop', { assetId, crop: { x: 0.5, y: 0.5 } }),
      ).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
      expect(
        await emitAck(gmConn.socket, 'portrait:crop', {
          assetId: 'nie-ma',
          crop: DEFAULT_PORTRAIT_CROP,
        }),
      ).toMatchObject({ ok: false, error: 'NOT_FOUND' });
    } finally {
      gmConn.socket.close();
      playerConn.socket.close();
    }
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

  /**
   * The alias (03.09). „Snajper Arasaki" is the GM's name for a figure the
   * table has not identified yet — so the *real* one must not be on the wire,
   * the way a hidden token and unrevealed fog are not. Three states, one
   * column: a text, the empty string (no label at all) and null (no alias).
   */
  it('sends players the alias and keeps the real name off their wire', async () => {
    const upsert = waitFor<TokenUpsertBroadcast>(player, 'token:upsert');
    expect(
      (
        await emitAck(gm, 'token:update', {
          tokenId: npcTokenId,
          patch: { name: 'Snajper Arasaki', publicName: 'Ochroniarz' },
        })
      ).ok,
    ).toBe(true);
    expect((await upsert).token.name).toBe('Ochroniarz');

    const payload = await roundTrip(player);
    expect(payload.tokens.find((t) => t.id === npcTokenId)!.name).toBe('Ochroniarz');
    expect(JSON.stringify(payload)).not.toContain('Snajper Arasaki');
    // Even the existence of a second name is the GM's business.
    expect('publicName' in payload.tokens.find((t) => t.id === npcTokenId)!).toBe(false);

    // The GM keeps both — the editor has to show what the table is told.
    const gmView = (await roundTrip(gm)).tokens.find((t) => t.id === npcTokenId)!;
    expect(gmView.name).toBe('Snajper Arasaki');
    expect(gmView.publicName).toBe('Ochroniarz');
  });

  it('leaves the figure unlabelled for an empty alias, and gives the name back for none', async () => {
    expect(
      (await emitAck(gm, 'token:update', { tokenId: npcTokenId, patch: { publicName: '' } })).ok,
    ).toBe(true);
    const blank = await roundTrip(player);
    expect(blank.tokens.find((t) => t.id === npcTokenId)!.name).toBe('');
    expect(JSON.stringify(blank)).not.toContain('Snajper Arasaki');

    expect(
      (await emitAck(gm, 'token:update', { tokenId: npcTokenId, patch: { publicName: null } })).ok,
    ).toBe(true);
    const plain = await roundTrip(player);
    // Alias zdjęty: figura wraca do własnej nazwy, jak każdy token od etapu 05.
    expect(plain.tokens.find((t) => t.id === npcTokenId)!.name).toBe('Snajper Arasaki');
    // Sprzątanie po tym teście — reszta pliku zna tę figurę jako „Bouncer".
    await emitAck(gm, 'token:update', { tokenId: npcTokenId, patch: { name: 'Bouncer' } });
  });

  it('refuses a player writing an alias of their own', async () => {
    const ack = await emitAck(player, 'token:update', {
      tokenId: ownTokenId,
      patch: { publicName: 'Nikt' },
    });
    expect(ack.ok).toBe(false);
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

/**
 * Ping i kopia figury (etap 35).
 *
 * Własna scena i własne gniazda, żeby detektor przecieków z `describe('tokens')`
 * nie liczył ruchu, o który ten zestaw sam prosi.
 */
describe('ping i kopia figury (etap 35)', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let gangerId: string;

  it('stawia scenę z gangerem i profilem bojowym statysty', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const created = await emitAck<SceneView>(gm, 'scene:create', { name: 'Zaułek 35' });
    if (!created.ok || !created.data) throw new Error('scene:create failed');
    sceneId = created.data.id;
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    expect((await emitAck(gm, 'scene:activate', { sceneId })).ok).toBe(true);
    await activated;
    // Aktywacja przenosi na nową scenę wyłącznie tych, którzy nie patrzą nigdzie
    // indziej: to gniazdo MG wstało przy scenie poprzedniego zestawu, więc
    // `viewedSceneId` trzeba przestawić wprost — inaczej ping odbija się
    // o `SCENE_NOT_VIEWED`, a `state:sync` odsyła żetony tamtej mapy.
    expect((await emitAck(gm, 'scene:view', { sceneId })).ok).toBe(true);

    const ganger = await emitAck<TokenView>(gm, 'token:create', {
      sceneId,
      name: 'Ganger',
      x: 300,
      y: 300,
      hp: { current: 8, max: 25 },
    });
    if (!ganger.ok || !ganger.data) throw new Error('token:create failed');
    gangerId = ganger.data.id;
    // Figura ze statystykami i naklejką: kopia ma wziąć pierwsze, a nie drugie.
    expect(
      await emitAck(gm, 'token:stat', {
        tokenId: gangerId,
        quick: {
          ref: 6,
          dex: 6,
          body: 7,
          will: 5,
          skillLevel: 4,
          evasion: 4,
          armorSp: 11,
          weaponId: null,
          weaponName: '',
          weaponDamage: '',
          ammoCurrent: 0,
          ammoMax: 0,
          hpCurrent: 8,
          hpMax: 25,
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await emitAck(gm, 'token:update', { tokenId: gangerId, patch: { statuses: ['bleeding'] } }),
    ).toMatchObject({ ok: true });
  });

  it('rozsyła ping do widzów sceny i nie zapisuje po nim niczego', async () => {
    const seen = waitFor<MapPingBroadcast>(player, 'map:ping');
    expect(
      await emitAck(gm, 'map:ping', { sceneId, x: 512.4, y: 640.6, pull: true }),
    ).toMatchObject({ ok: true });
    const ping = await seen;
    expect(ping).toMatchObject({ sceneId, x: 512, y: 641, pull: true });
    expect(ping.userName).toBe('MG');

    // Ping jest gestem, nie stanem: po synchronizacji nie ma po nim śladu ani
    // w scenie, ani w historii czatu — to jest cała treść „bez `seq`, bez zapisu".
    const state = await roundTrip(player);
    expect(JSON.stringify(state)).not.toContain('512');
    expect(state.messages.some((message) => message.text?.includes('ping'))).toBe(false);
  });

  it('ścina graczowi przyciągnięcie widoku, ale samego pingu nie odmawia', async () => {
    const seen = waitFor<MapPingBroadcast>(gm, 'map:ping');
    expect(
      await emitAck(player, 'map:ping', { sceneId, x: 100, y: 100, pull: true }),
    ).toMatchObject({ ok: true });
    expect(await seen).toMatchObject({ pull: false, userName: 'Rogue' });
  });

  it('odmawia pingu na scenie, której ten socket nie ogląda', async () => {
    const other = await emitAck<SceneView>(gm, 'scene:create', { name: 'Inna mapa' });
    if (!other.ok || !other.data) throw new Error('scene:create failed');
    expect(
      await emitAck(player, 'map:ping', { sceneId: other.data.id, x: 10, y: 10 }),
    ).toMatchObject({ ok: false, error: 'SCENE_NOT_VIEWED' });
    expect(await emitAck(gm, 'map:ping', { sceneId, x: NaN, y: 0 })).toMatchObject({
      ok: false,
      error: 'BAD_REQUEST',
    });
  });

  it('kopiuje figurę: numer z całej sceny, profil bojowy, świeże PW', async () => {
    const copy = await emitAck<TokenView>(gm, 'token:duplicate', { tokenId: gangerId });
    if (!copy.ok || !copy.data) throw new Error('token:duplicate failed');
    expect(copy.data.name).toBe('Ganger 2');
    // Świeża figura (decyzja MG): pełne PW i żadnej naklejki po oryginale.
    expect(copy.data.hp).toEqual({ current: 25, max: 25 });
    expect(copy.data.statuses).toEqual([]);
    // Obok, nie pod spodem — i przyciągnięte do kratki jak każda inna pozycja.
    expect(copy.data.x).toBe(400);
    expect(copy.data.y).toBe(300);
    // Kopia figury MG dostaje **własną** kartę (etap 38a): bez niej nie
    // strzela, a wspólna oznaczałaby jedne PW dla dwóch gangerów.
    const state = await roundTrip(gm);
    const stored = state.tokens.find((token) => token.id === copy.data?.id);
    expect(stored?.characterId).toBeTruthy();
    expect(stored?.characterId).not.toBe(gangerId);
    const card = state.characters.find((entry) => entry.id === stored?.characterId)?.data as
      CpredCharacterData | undefined;
    expect(card?.skills.evasion).toBe(4);
    expect(card?.armor[0]?.sp).toBe(11);

    const third = await emitAck<TokenView>(gm, 'token:duplicate', { tokenId: copy.data.id });
    if (!third.ok || !third.data) throw new Error('second token:duplicate failed');
    // Rdzeń nazwy, nie pełna nazwa: „Ganger 2 2" byłoby błędem numeracji.
    expect(third.data.name).toBe('Ganger 3');
  });

  it('stawia kopię tam, gdzie ją upuszczono, i przycina do sceny', async () => {
    const copy = await emitAck<TokenView>(gm, 'token:duplicate', {
      tokenId: gangerId,
      x: 749,
      y: 51,
    });
    if (!copy.ok || !copy.data) throw new Error('token:duplicate failed');
    expect(copy.data).toMatchObject({ x: 700, y: 100 });
  });

  it('nie pozwala graczowi kopiować figur', async () => {
    expect(await emitAck(player, 'token:duplicate', { tokenId: gangerId })).toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
    });
  });
});

/**
 * Statysta jako karta postaci (etap 38a).
 *
 * Dwie rzeczy, których do 38a nie było: `token:stat` **zakłada figurze kartę**
 * zamiast pisać w kolumnę żetonu, a kosz figury pyta, czy zabrać tę kartę ze
 * sobą. Drugie jest pytaniem, a nie automatem, bo MG odrzucił znacznik
 * odróżniający kartę gangera od karty Vex — więc serwer sprawdza dwie rzeczy
 * zamiast czytać flagę: karta bez właściciela i bez innej figury pod sobą.
 */
describe('statysta jako karta postaci (etap 38a)', () => {
  let gm: ClientSocket;
  let sceneId: string;
  let gangerId: string;
  let cardId: string;

  const QUICK = {
    ref: 6,
    dex: 5,
    body: 7,
    will: 4,
    skillLevel: 5,
    evasion: 3,
    armorSp: 11,
    weaponId: null,
    weaponName: 'Obrzyn',
    weaponDamage: '3k6',
    ammoCurrent: 2,
    ammoMax: 2,
    hpCurrent: 30,
    hpMax: 30,
  };

  async function stateOf(socket: ClientSocket): Promise<StateSyncPayload> {
    const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
    await emitAck(socket, 'state:request');
    return sync;
  }

  it('zakłada kartę figurze, która jej nie miała, i zabiera żetonowi własne PW', async () => {
    const conn = createSocket(gmCookie);
    gm = conn.socket;
    await conn.firstSync;

    const created = await emitAck<SceneView>(gm, 'scene:create', { name: 'Zaułek 38a' });
    if (!created.ok || !created.data) throw new Error('scene:create failed');
    sceneId = created.data.id;
    expect((await emitAck(gm, 'scene:activate', { sceneId })).ok).toBe(true);
    expect((await emitAck(gm, 'scene:view', { sceneId })).ok).toBe(true);

    const ganger = await emitAck<TokenView>(gm, 'token:create', {
      sceneId,
      name: 'Ganger 38a',
      x: 200,
      y: 200,
      hp: { current: 12, max: 25 },
    });
    if (!ganger.ok || !ganger.data) throw new Error('token:create failed');
    gangerId = ganger.data.id;

    const statted = await emitAck<TokenView>(gm, 'token:stat', { tokenId: gangerId, quick: QUICK });
    if (!statted.ok || !statted.data) throw new Error('token:stat failed');
    cardId = statted.data.characterId!;
    expect(cardId).toBeTruthy();
    // PW jadą z karty, nie z żetonu — dwa domy dla jednej liczby to jest to,
    // jak się rozjeżdżają.
    expect(statted.data.hp).toEqual({ current: 30, max: 30 });

    const state = await stateOf(gm);
    const card = state.characters.find((entry) => entry.id === cardId);
    expect(card?.name).toBe('Ganger 38a');
    // Karta stoi w rosterze obok postaci graczy — MG odrzucił 05.09 osobną
    // kategorię dla statystów.
    expect(card?.ownerId).toBeNull();
    const sheet = card?.data as CpredCharacterData;
    expect(sheet.stats.ref).toBe(6);
    expect(sheet.weapons[0]?.name).toBe('Obrzyn');
    // Wydrukowane PW: 30, choć z BC 7 i SW 4 wychodziłoby 40.
    expect(sheet.statBlock?.hpMax).toBe(30);
  });

  it('drugie wywołanie poprawia tę samą kartę, a nie zakłada nowej', async () => {
    const again = await emitAck<TokenView>(gm, 'token:stat', {
      tokenId: gangerId,
      quick: { ...QUICK, armorSp: 4 },
    });
    if (!again.ok || !again.data) throw new Error('token:stat failed');
    expect(again.data.characterId).toBe(cardId);
    const state = await stateOf(gm);
    const sheet = state.characters.find((entry) => entry.id === cardId)?.data as CpredCharacterData;
    expect(sheet.armor.every((row) => row.sp === 4)).toBe(true);
  });

  it('nie kasuje karty, dopóki nikt o to nie poprosi', async () => {
    const copy = await emitAck<TokenView>(gm, 'token:duplicate', { tokenId: gangerId });
    if (!copy.ok || !copy.data) throw new Error('token:duplicate failed');
    expect((await emitAck(gm, 'token:delete', { tokenId: copy.data.id })).ok).toBe(true);
    const state = await stateOf(gm);
    expect(state.characters.some((entry) => entry.id === copy.data!.characterId)).toBe(true);
  });

  it('kasuje kartę razem z figurą, gdy MG powie „tak"', async () => {
    const copy = await emitAck<TokenView>(gm, 'token:duplicate', { tokenId: gangerId });
    if (!copy.ok || !copy.data) throw new Error('token:duplicate failed');
    const copyCardId = copy.data.characterId!;
    expect(copyCardId).not.toBe(cardId);
    expect(
      (await emitAck(gm, 'token:delete', { tokenId: copy.data.id, deleteCharacter: true })).ok,
    ).toBe(true);
    const state = await stateOf(gm);
    expect(state.characters.some((entry) => entry.id === copyCardId)).toBe(false);
    // Oryginał i jego karta stoją nietknięte.
    expect(state.characters.some((entry) => entry.id === cardId)).toBe(true);
  });

  it('nie zabiera karty gracza, choćby klient poprosił', async () => {
    const card = await emitAck<CharacterView>(gm, 'character:create', {
      name: 'Vex 38a',
      ownerId: playerId,
    });
    if (!card.ok || !card.data) throw new Error('character:create failed');
    const token = await emitAck<TokenView>(gm, 'token:create', {
      sceneId,
      name: 'Vex 38a',
      x: 400,
      y: 400,
      characterId: card.data.id,
    });
    if (!token.ok || !token.data) throw new Error('token:create failed');
    expect(
      (await emitAck(gm, 'token:delete', { tokenId: token.data.id, deleteCharacter: true })).ok,
    ).toBe(true);
    const state = await stateOf(gm);
    expect(state.characters.some((entry) => entry.id === card.data!.id)).toBe(true);
  });

  it('nie zabiera karty, pod którą stoi jeszcze inna figura', async () => {
    const second = await emitAck<TokenView>(gm, 'token:create', {
      sceneId,
      name: 'Ganger 38a bis',
      x: 500,
      y: 500,
      characterId: cardId,
    });
    if (!second.ok || !second.data) throw new Error('token:create failed');
    expect(
      (await emitAck(gm, 'token:delete', { tokenId: second.data.id, deleteCharacter: true })).ok,
    ).toBe(true);
    const state = await stateOf(gm);
    expect(state.characters.some((entry) => entry.id === cardId)).toBe(true);
    expect(state.tokens.some((entry) => entry.id === gangerId)).toBe(true);
  });
});
