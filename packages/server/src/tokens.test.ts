import sharp from 'sharp';
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
  SceneView,
  SocketAck,
  StateSyncPayload,
  PortraitAssetView,
  PortraitCropBroadcast,
  PortraitWantedRow,
  TokenAimBroadcast,
  TokenTargetBroadcast,
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
import { backfillPortraitAssets } from './portrait-backfill.js';
import { joinUrl } from './test-join.js';
import { paceTesting } from './realtime/pace.js';

// Ten plik nie pyta o pulę Eksploracji — do etapu 52 chodził w „Swobodnym”,
// który zniknął; ściany, mgła i reszta nie muszą iść po 12 m na raz.
paceTesting.off = true;

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
/** Katalog plików kampanii testu (etap 44b). */
let uploadsBase = '';
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
    payload: { login: 'MG', password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);

  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Kampania tokenów' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;
  uploadsBase = `/uploads/campaigns/${campaignId}/`;

  // Etap 44b: linki są imienne — wystawia je `joinUrl` przy każdym wejściu.
  const token = campaignId;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, token, 'Rogue'),
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
    expect(asset.url).toMatch(/^\/uploads\/campaigns\/[\w-]+\/tokens\/.+\.png$/);

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
    const { payload, headers } = multipartBody(
      'Rache Bartmoss.png',
      await sharp({ create: { width: 256, height: 256, channels: 3, background: 'red' } })
        .png()
        .toBuffer(),
    );
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
    expect(asset.url).toMatch(/^\/uploads\/campaigns\/[\w-]+\/portraits\/.+\.webp$/);

    const seenByPlayer = await built.app.inject({
      method: 'GET',
      url: '/api/portrait-assets',
      headers: { cookie: playerCookie },
    });
    expect(seenByPlayer.statusCode).toBe(200);
    expect((seenByPlayer.json() as PortraitAssetView[]).map((a) => a.id)).toContain(assetId);

    const asPlayer = multipartBody(
      'gracz.png',
      await sharp({ create: { width: 256, height: 256, channels: 3, background: 'red' } })
        .png()
        .toBuffer(),
    );
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
    const { payload, headers } = multipartBody(
      'wprost.png',
      await sharp({ create: { width: 256, height: 256, channels: 3, background: 'red' } })
        .png()
        .toBuffer(),
    );
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
      // Kadr wolno od 12.09 wywieźć poza obraz (zgłoszenie MG: inaczej górnych
      // pikseli portretu nie dało się wciągnąć w krążek), więc 0,9 i 0,1
      // przechodzą bez zmiany — ścina się dopiero to, co wypada poza grafikę.
      const ack = await emitAck<PortraitAssetView>(gmConn.socket, 'portrait:crop', {
        assetId,
        crop: { x: 0.9, y: 0.1, zoom: 2 },
      });
      if (!ack.ok || !ack.data) throw new Error('portrait:crop failed');
      expect(ack.data.crop).toEqual({ x: 0.9, y: 0.1, zoom: 2 });
      expect((await heard).asset?.crop).toEqual({ x: 0.9, y: 0.1, zoom: 2 });

      // Poza obraz nie wychodzi już sam punkt kadru: 1,4 wraca jako 1.
      const beyond = await emitAck<PortraitAssetView>(gmConn.socket, 'portrait:crop', {
        assetId,
        crop: { x: 1.4, y: -0.2, zoom: 2 },
      });
      if (!beyond.ok || !beyond.data) throw new Error('portrait:crop failed');
      expect(beyond.data.crop).toEqual({ x: 1, y: 0, zoom: 2 });

      // Zapisane, a nie tylko odesłane.
      const list = await built.app.inject({
        method: 'GET',
        url: '/api/portrait-assets',
        headers: { cookie: playerCookie },
      });
      const stored = (list.json() as PortraitAssetView[]).find((a) => a.id === assetId);
      expect(stored?.crop).toEqual({ x: 1, y: 0, zoom: 2 });

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
        await emitAck(playerConn.socket, 'character:update', {
          characterId: card.data.id,
          patch: { portraitUrl: ack.data.url },
        }),
      ).toMatchObject({ ok: false, error: 'FORBIDDEN' });
      expect(
        (
          await emitAck(gmConn.socket, 'character:update', {
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
      expect(own.data.bannerCrop).toBeNull();

      // Baner lewego panelu (25.09): właściciel kadruje oba wystąpienia.
      const banner = await emitAck<PortraitAssetView>(playerConn.socket, 'portrait:crop', {
        assetId,
        crop: { x: 0.3, y: 0.7, zoom: 2 },
        bannerCrop: { x: 0.5, y: 0.5, zoom: 2 },
      });
      if (!banner.ok || !banner.data) throw new Error('banner portrait:crop failed');
      expect(banner.data.bannerCrop).toEqual({ x: 0.5, y: 0.5, zoom: 2 });
      // Bez pola kadr banera zostaje, `null` wraca do „jak żeton”.
      const kept = await emitAck<PortraitAssetView>(playerConn.socket, 'portrait:crop', {
        assetId,
        crop: { x: 0.3, y: 0.7, zoom: 2 },
      });
      expect(kept.ok && kept.data?.bannerCrop).toEqual({ x: 0.5, y: 0.5, zoom: 2 });
      const reset = await emitAck<PortraitAssetView>(playerConn.socket, 'portrait:crop', {
        assetId,
        crop: { x: 0.3, y: 0.7, zoom: 2 },
        bannerCrop: null,
      });
      expect(reset.ok && reset.data?.bannerCrop).toBeNull();
      expect(
        await emitAck(playerConn.socket, 'portrait:crop', {
          assetId,
          crop: { x: 0.3, y: 0.7, zoom: 2 },
          bannerCrop: { x: 'góra' },
        }),
      ).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
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
    const before = await built.prisma.portraitAsset.findUniqueOrThrow({ where: { id: assetId } });
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
    const withCrops = await built.app.inject({
      method: 'GET',
      url: '/api/portrait-assets?includeRetired=true',
      headers: { cookie: gmCookie },
    });
    expect((withCrops.json() as PortraitAssetView[]).find((a) => a.id === assetId)).toMatchObject({
      retired: true,
      url: before.url,
      crop: { x: before.cropX, y: before.cropY, zoom: before.cropZoom },
    });
    await backfillPortraitAssets(built.prisma, config.uploadsDir, built.app.log);
    expect(await built.prisma.portraitAsset.findUnique({ where: { id: assetId } })).toMatchObject({
      retired: true,
      cropZoom: before.cropZoom,
    });
    expect(await built.prisma.portraitAsset.count({ where: { url: before.url } })).toBe(1);
  });

  it('rejects invalid dimensions and a changed campaign before saving a portrait', async () => {
    const body = multipartBody('small.png', PNG_1X1);
    const count = await built.prisma.portraitAsset.count();
    const small = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/portrait-assets',
      headers: { ...body.headers, cookie: gmCookie },
      payload: body.payload,
    });
    expect(small.statusCode).toBe(400);
    expect(small.json()).toEqual({ error: 'IMAGE_TOO_SMALL' });
    const moved = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/portrait-assets?campaignId=another-campaign',
      headers: { ...body.headers, cookie: gmCookie },
      payload: body.payload,
    });
    expect(moved.statusCode).toBe(409);
    expect(moved.json()).toEqual({ error: 'CAMPAIGN_CHANGED' });
    expect(await built.prisma.portraitAsset.count()).toBe(count);
  });

  /**
   * Portrety NPC (23.09) — twarz i nazwa zdradzają, kogo drużyna dopiero
   * spotka, więc gracz ich nie dostaje. Wyjątek jest jeden: portret, który coś
   * już nosi, jedzie do gracza jako sam adres i kadr, bez nazwy — jego mapa
   * musi ująć figurę NPC-a tak samo jak mapa MG.
   */
  it('keeps GM-only portraits away from players until something wears them', async () => {
    const { payload, headers } = multipartBody(
      'Adam Smasher.png',
      await sharp({ create: { width: 256, height: 256, channels: 3, background: 'blue' } })
        .png()
        .toBuffer(),
    );
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/portrait-assets?gmOnly=true',
      headers: { ...headers, cookie: gmCookie },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const npc = res.json() as PortraitAssetView;
    expect(npc.gmOnly).toBe(true);

    const listFor = async (cookie: string) =>
      (
        await built.app.inject({
          url: '/api/portrait-assets?includeRetired=true',
          headers: { cookie },
        })
      ).json() as PortraitAssetView[];
    expect((await listFor(gmCookie)).find((a) => a.id === npc.id)?.name).toBe('Adam Smasher');
    expect((await listFor(playerCookie)).map((a) => a.id)).not.toContain(npc.id);

    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);
    try {
      // Kadr nieprzypisanego portretu NPC: MG dostaje wiersz, gracz — każ zapomnieć.
      const gmHeard = waitFor<PortraitCropBroadcast>(gmConn.socket, 'portrait:crop');
      const playerHeard = waitFor<PortraitCropBroadcast>(playerConn.socket, 'portrait:crop');
      const crop = { assetId: npc.id, crop: { x: 0.4, y: 0.3, zoom: 1.5 } };
      expect((await emitAck(gmConn.socket, 'portrait:crop', crop)).ok).toBe(true);
      const [toGm, toPlayer] = await Promise.all([gmHeard, playerHeard]);
      expect(toGm.asset?.name).toBe('Adam Smasher');
      expect(toPlayer).toEqual({ seq: toGm.seq, removedId: npc.id });

      // Karta NPC-a nosi portret — gracz dostaje adres i kadr, bez nazwy.
      const card = await emitAck<CharacterView>(gmConn.socket, 'character:create', {
        name: 'Smasher',
      });
      if (!card.ok || !card.data) throw new Error('character:create failed');
      expect(
        (
          await emitAck(gmConn.socket, 'character:update', {
            characterId: card.data.id,
            patch: { portraitUrl: npc.url },
          })
        ).ok,
      ).toBe(true);
      expect((await listFor(playerCookie)).find((a) => a.id === npc.id)).toMatchObject({
        name: '',
        gmOnly: true,
        url: npc.url,
        crop: { x: 0.4, y: 0.3, zoom: 1.5 },
      });
      const worn = waitFor<PortraitCropBroadcast>(playerConn.socket, 'portrait:crop');
      expect((await emitAck(gmConn.socket, 'portrait:crop', crop)).ok).toBe(true);
      expect((await worn).asset).toMatchObject({ id: npc.id, name: '' });

      // Przeniesienie do puli graczy — jawne, z nazwą; przestawia wyłącznie MG.
      expect(
        await emitAck(playerConn.socket, 'portrait:visibility', {
          assetId: npc.id,
          gmOnly: false,
        }),
      ).toMatchObject({ ok: false, error: 'FORBIDDEN' });
      const opened = waitFor<PortraitCropBroadcast>(playerConn.socket, 'portrait:visibility');
      const toggled = await emitAck<PortraitAssetView>(gmConn.socket, 'portrait:visibility', {
        assetId: npc.id,
        gmOnly: false,
      });
      expect(toggled.ok && toggled.data?.gmOnly).toBe(false);
      expect((await opened).asset).toMatchObject({ name: 'Adam Smasher', gmOnly: false });
      expect(
        await emitAck(gmConn.socket, 'portrait:visibility', { assetId: npc.id, gmOnly: 'tak' }),
      ).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
    } finally {
      gmConn.socket.close();
      playerConn.socket.close();
    }
  });

  /**
   * #68 (03.10.2026): gracz bez wolnej twarzy w puli prosi MG o portret,
   * MG widzi prośbę, a nowy portret w puli graczy ją zdejmuje.
   */
  it('lets a player ask for a portrait only when the pool has none left', async () => {
    const open = await built.prisma.portraitAsset.findMany({
      where: { retired: false, gmOnly: false },
      select: { id: true },
    });
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);
    try {
      if (open.length > 0) {
        expect(await emitAck(playerConn.socket, 'portrait:want', undefined)).toEqual({
          ok: false,
          error: 'PORTRAIT_AVAILABLE',
        });
      }
      await built.prisma.portraitAsset.updateMany({
        where: { id: { in: open.map((row) => row.id) } },
        data: { retired: true },
      });
      const heard = waitFor<PortraitWantedRow[]>(gmConn.socket, 'portrait:wanted-sync');
      const asked = await emitAck<PortraitWantedRow[]>(
        playerConn.socket,
        'portrait:want',
        undefined,
      );
      expect(asked.ok).toBe(true);
      const rows = await heard;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.userName).toBeTruthy();
      expect(await emitAck(gmConn.socket, 'portrait:wanted', undefined)).toEqual({
        ok: true,
        data: rows,
      });
      expect(await emitAck(gmConn.socket, 'portrait:want', undefined)).toMatchObject({
        ok: false,
        error: 'FORBIDDEN',
      });

      const { payload, headers } = multipartBody(
        'Nowa twarz.png',
        await sharp({ create: { width: 256, height: 256, channels: 3, background: 'red' } })
          .png()
          .toBuffer(),
      );
      const res = await built.app.inject({
        method: 'POST',
        url: '/api/uploads/portrait-assets',
        headers: { ...headers, cookie: gmCookie },
        payload,
      });
      expect(res.statusCode).toBe(201);
      expect(await emitAck(gmConn.socket, 'portrait:wanted', undefined)).toEqual({
        ok: true,
        data: [],
      });
    } finally {
      await built.prisma.portraitAsset.updateMany({
        where: { id: { in: open.map((row) => row.id) } },
        data: { retired: false },
      });
      gmConn.socket.close();
      playerConn.socket.close();
    }
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
    // Mapa otwarta dla graczy (12.09): nowa scena wchodzi **zamknięta**, a ten
    // zestaw jest o ruchu figur, nie o blokadzie.
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMove: 'explore' } });
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
    // Etap 43a: what is left of it travels as a share, never as numbers.
    expect(npcView.hpShare).toEqual({ ratio: 1, rung: 'healthy' });
    expect('hpShare' in ownView).toBe(false);

    // The hidden token's create broadcast never reached the player either.
    expect(JSON.stringify(playerTokenTraffic)).not.toContain(hiddenTokenId);

    const gmPayload = await roundTrip(gm);
    expect(gmPayload.tokens).toHaveLength(3);
    expect(gmPayload.tokens.find((t) => t.id === npcTokenId)!.hp).toEqual({
      current: 25,
      max: 25,
    });
  });

  it('tells players how hurt a foreign figure is without its HP (stage 43a)', async () => {
    const upserted = waitFor<TokenUpsertBroadcast>(player, 'token:upsert');
    const hurt = await emitAck(gm, 'token:update', {
      tokenId: npcTokenId,
      patch: { hp: { current: 10, max: 25 } },
    });
    expect(hurt.ok).toBe(true);
    const upsert = await upserted;
    expect(upsert.token.id).toBe(npcTokenId);
    expect('hp' in upsert.token).toBe(false);
    expect(upsert.token.hpShare).toEqual({ ratio: 0.4, rung: 'serious' });

    const restored = await emitAck(gm, 'token:update', {
      tokenId: npcTokenId,
      patch: { hp: { current: 25, max: 25 } },
    });
    expect(restored.ok).toBe(true);
    await roundTrip(player);
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
    // Od etapu 52 klatka gracza idzie po zatwierdzonej trasie — (342, 528)
    // leży w połowie odcinka (300, 500) → (384, 556).
    const approved = await emitAck(player, 'token:walk', {
      tokenId: ownTokenId,
      route: [{ x: 384, y: 556 }],
    });
    expect(approved.ok).toBe(true);
    const gmSees = waitFor<TokenMoveBroadcast>(gm, 'token:move');
    player.emit('token:move', { tokenId: ownTokenId, x: 342, y: 528, final: false });
    const frame = await gmSees;
    // Mid-stride positions are clamped, never snapped: the figure is between
    // two squares, which is the whole point of an intermediate frame.
    expect(frame).toMatchObject({ tokenId: ownTokenId, x: 342, y: 528, final: false });
  });

  /**
   * Blokada ruchu graczy po mapie (zlecenie MG, 12.09.2026).
   *
   * Powód jest z sesji, nie z reguł: drużyna, która dostanie mapę przed
   * rozpoczęciem gry, obejdzie ją własną figurą i pozna zanim MG cokolwiek
   * powie. Trzy rzeczy są tu sprawdzane naraz i każda już raz byłaby dziurą:
   * odrzucona ma być **także klatka pośrednia** (inaczej gracz przeszedłby
   * mapę bez ani jednego `final`), MG nie jest blokadą związany **nigdy**,
   * a scena tworzona od zera wchodzi **zamknięta**.
   */
  it('nie pozwala graczowi ruszyć figurą na mapie zamkniętej przez MG', async () => {
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMove: 'stop' } });

    expect(
      await emitAck(player, 'token:move', { tokenId: ownTokenId, x: 600, y: 600, final: true }),
    ).toEqual({ ok: false, error: 'MOVE_LOCKED' });
    // Klatka pośrednia też — bez tego mapę da się przejść samym ciągnięciem.
    expect(
      await emitAck(player, 'token:move', { tokenId: ownTokenId, x: 342, y: 528, final: false }),
    ).toEqual({ ok: false, error: 'MOVE_LOCKED' });

    // MG chodzi po zamkniętej mapie jak po każdej innej.
    const byGm = await emitAck<{ x: number; y: number }>(gm, 'token:move', {
      tokenId: ownTokenId,
      x: 600,
      y: 600,
      final: true,
    });
    expect(byGm.ok).toBe(true);

    // Powrót na (300, 500) nie jest kosmetyką: kolejne testy w tym zestawie
    // liczą kierunek marszu od tego pola.
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMove: 'explore' } });
    const opened = await emitAck<{ x: number; y: number }>(player, 'token:move', {
      tokenId: ownTokenId,
      x: 300,
      y: 500,
      final: true,
    });
    expect(opened.ok && opened.data).toEqual({ x: 300, y: 500 });
  });

  // Etap 45: nowa scena startuje w Stop i — jak Token Vision w Foundry —
  // w widoczności Dynamicznej z pamięcią odkrytego.
  it('zakłada nową scenę w Stop i Dynamicznej, a gracz widzi tryb ruchu w widoku sceny', async () => {
    const fresh = await emitAck<SceneView>(gm, 'scene:create', { name: 'Świeża mapa' });
    if (!fresh.ok || !fresh.data) throw new Error('scene:create failed');
    expect(fresh.data.playerMove).toBe('stop');
    expect(fresh.data.visibility).toBe('dynamic');
    expect(fresh.data.explore).toBe(true);

    const opened = await emitAck<SceneView>(gm, 'scene:update', {
      sceneId: fresh.data.id,
      patch: { playerMove: 'explore' },
    });
    expect(opened.ok && opened.data?.playerMove).toBe('explore');
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

  it('stawia figurę rannej karty z naklejką rany od razu (zaległość 17.10)', async () => {
    const card = await emitAck<CharacterView>(gm, 'character:create', { name: 'Konający' });
    if (!card.ok || !card.data) throw new Error('character:create failed');
    await emitAck(gm, 'character:update', {
      characterId: card.data.id,
      patch: { data: { hpCurrent: 0 } },
    });
    const placed = await emitAck<TokenView>(gm, 'token:create', {
      sceneId,
      name: 'Konający',
      x: 1500,
      y: 1500,
      characterId: card.data.id,
    });
    expect(placed.ok && placed.data?.statuses).toEqual(['mortally-wounded']);

    // Przepięcie figury bez karty na ranną kartę też dokleja naklejkę.
    const bare = await emitAck<TokenView>(gm, 'token:create', {
      sceneId,
      name: 'Bez karty',
      x: 1700,
      y: 1500,
    });
    if (!bare.ok || !bare.data) throw new Error('token:create failed');
    const linked = await emitAck<TokenView>(gm, 'token:update', {
      tokenId: bare.data.id,
      patch: { characterId: card.data.id },
    });
    expect(linked.ok && linked.data?.statuses).toEqual(['mortally-wounded']);

    for (const token of [placed.data, bare.data]) {
      if (token) await emitAck(gm, 'token:delete', { tokenId: token.id });
    }
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

  /**
   * Grot celowania widzi cały stół (03.10). Ulotny: idzie do tych, którzy widzą
   * figurę, nie wraca do nadawcy i nie zmienia kąta zapisanego w bazie.
   */
  it('sends the aim of a figure to the table without storing it', async () => {
    const before = (await roundTrip(gm)).tokens.find((t) => t.id === ownTokenId)?.facing;
    const echoes: TokenAimBroadcast[] = [];
    const onEcho = (broadcast: TokenAimBroadcast) => echoes.push(broadcast);
    player.on('token:aim', onEcho);

    const gmSees = waitFor<TokenAimBroadcast>(gm, 'token:aim');
    const aimed = await emitAck(player, 'token:aim', { tokenId: ownTokenId, facing: 135.6 });
    expect(aimed.ok).toBe(true);
    expect(await gmSees).toEqual({ sceneId, tokenId: ownTokenId, facing: 136 });

    const stored = (await roundTrip(gm)).tokens.find((t) => t.id === ownTokenId)?.facing;
    expect(stored).toBe(before);

    const released = waitFor<TokenAimBroadcast>(gm, 'token:aim');
    expect((await emitAck(player, 'token:aim', { tokenId: ownTokenId, facing: null })).ok).toBe(
      true,
    );
    expect(await released).toEqual({ sceneId, tokenId: ownTokenId, facing: null });

    await roundTrip(player);
    player.off('token:aim', onEcho);
    expect(echoes).toEqual([]);
  });

  it('keeps the aim of a hidden figure from players and refuses a foreign one', async () => {
    const leaks: unknown[] = [];
    const onLeak = (broadcast: unknown) => leaks.push(broadcast);
    player.on('token:aim', onLeak);
    expect((await emitAck(gm, 'token:aim', { tokenId: hiddenTokenId, facing: 90 })).ok).toBe(true);
    expect((await emitAck(gm, 'token:aim', { tokenId: hiddenTokenId, facing: null })).ok).toBe(
      true,
    );
    await roundTrip(player);
    player.off('token:aim', onLeak);
    expect(leaks).toEqual([]);

    const foreign = await emitAck(player, 'token:aim', { tokenId: npcTokenId, facing: 90 });
    expect(!foreign.ok && foreign.error).toBe('FORBIDDEN');
    const hidden = await emitAck(player, 'token:aim', { tokenId: hiddenTokenId, facing: 90 });
    expect(!hidden.ok && hidden.error).toBe('TOKEN_NOT_FOUND');
    const broken = await emitAck(player, 'token:aim', { tokenId: ownTokenId, facing: 'north' });
    expect(!broken.ok && broken.error).toBe('BAD_REQUEST');
  });

  it('takes the aim down when the aiming socket goes away', async () => {
    const second = createSocket(gmCookie);
    await second.firstSync;
    const seen = waitFor<TokenAimBroadcast>(player, 'token:aim');
    expect(
      (await emitAck(second.socket, 'token:aim', { tokenId: npcTokenId, facing: 45 })).ok,
    ).toBe(true);
    expect(await seen).toMatchObject({ tokenId: npcTokenId, facing: 45 });

    // Nowy cel tego samego gniazda zdejmuje stary grot — gniazdo ma jeden celownik.
    const switched = new Promise<TokenAimBroadcast[]>((resolve) => {
      const got: TokenAimBroadcast[] = [];
      const on = (broadcast: TokenAimBroadcast) => {
        got.push(broadcast);
        if (got.length === 2) {
          player.off('token:aim', on);
          resolve(got);
        }
      };
      player.on('token:aim', on);
    });
    expect((await emitAck(second.socket, 'token:aim', { tokenId: ownTokenId, facing: 0 })).ok).toBe(
      true,
    );
    expect(await switched).toEqual([
      { sceneId, tokenId: npcTokenId, facing: null },
      { sceneId, tokenId: ownTokenId, facing: 0 },
    ]);

    const gone = waitFor<TokenAimBroadcast>(player, 'token:aim');
    second.socket.disconnect();
    expect(await gone).toEqual({ sceneId, tokenId: ownTokenId, facing: null });
  });

  /**
   * Trwały cel (etap 50c): należy do figury-strzelca, żyje w pamięci serwera,
   * dochodzi do tych, którzy widzą obie figury, i wraca w `state:sync`.
   */
  it('keeps a standing target for everybody who sees both figures, through a resync', async () => {
    const gmSees = waitFor<TokenTargetBroadcast>(gm, 'token:target');
    const set = await emitAck<TokenTargetBroadcast>(player, 'token:target', {
      tokenId: ownTokenId,
      targetId: npcTokenId,
    });
    expect(set.ok && set.data).toEqual({ sceneId, tokenId: ownTokenId, targetId: npcTokenId });
    expect(await gmSees).toEqual({ sceneId, tokenId: ownTokenId, targetId: npcTokenId });

    expect((await roundTrip(gm)).targets).toEqual([{ tokenId: ownTokenId, targetId: npcTokenId }]);
    expect((await roundTrip(player)).targets).toEqual([
      { tokenId: ownTokenId, targetId: npcTokenId },
    ]);

    const released = waitFor<TokenTargetBroadcast>(gm, 'token:target');
    expect(
      (await emitAck(player, 'token:target', { tokenId: ownTokenId, targetId: null })).ok,
    ).toBe(true);
    expect(await released).toEqual({ sceneId, tokenId: ownTokenId, targetId: null });
    expect((await roundTrip(player)).targets).toEqual([]);
  });

  it('keeps a target on a hidden figure from players and refuses what they may not aim', async () => {
    const leaks: unknown[] = [];
    const onLeak = (broadcast: unknown) => leaks.push(broadcast);
    player.on('token:target', onLeak);
    expect(
      (await emitAck(gm, 'token:target', { tokenId: npcTokenId, targetId: hiddenTokenId })).ok,
    ).toBe(true);
    expect(
      (await emitAck(gm, 'token:target', { tokenId: hiddenTokenId, targetId: ownTokenId })).ok,
    ).toBe(true);
    const playerSync = await roundTrip(player);
    expect(playerSync.targets).toEqual([]);
    expect(JSON.stringify(playerSync)).not.toContain(hiddenTokenId);
    expect((await roundTrip(gm)).targets).toHaveLength(2);
    // Zdjęcie też nie dochodzi — gracz nie dostał tych celów.
    expect((await emitAck(gm, 'token:target', { tokenId: npcTokenId, targetId: null })).ok).toBe(
      true,
    );
    expect((await emitAck(gm, 'token:target', { tokenId: hiddenTokenId, targetId: null })).ok).toBe(
      true,
    );
    await roundTrip(player);
    player.off('token:target', onLeak);
    expect(leaks).toEqual([]);

    const hidden = await emitAck(player, 'token:target', {
      tokenId: ownTokenId,
      targetId: hiddenTokenId,
    });
    expect(!hidden.ok && hidden.error).toBe('TOKEN_NOT_FOUND');
    const foreign = await emitAck(player, 'token:target', {
      tokenId: npcTokenId,
      targetId: ownTokenId,
    });
    expect(!foreign.ok && foreign.error).toBe('FORBIDDEN');
    const self = await emitAck(player, 'token:target', {
      tokenId: ownTokenId,
      targetId: ownTokenId,
    });
    expect(!self.ok && self.error).toBe('BAD_REQUEST');
    const broken = await emitAck(player, 'token:target', { tokenId: ownTokenId, targetId: 7 });
    expect(!broken.ok && broken.error).toBe('BAD_REQUEST');
  });

  it('takes the targets of a scene down with the end of the fight', async () => {
    const seen = waitFor<TokenTargetBroadcast>(player, 'token:target');
    expect(
      (await emitAck(gm, 'token:target', { tokenId: npcTokenId, targetId: ownTokenId })).ok,
    ).toBe(true);
    expect(await seen).toEqual({ sceneId, tokenId: npcTokenId, targetId: ownTokenId });

    const ended = waitFor<TokenTargetBroadcast>(player, 'token:target');
    expect((await emitAck(gm, 'combat:end', {})).ok).toBe(true);
    expect(await ended).toEqual({ sceneId, tokenId: npcTokenId, targetId: null });
    expect((await roundTrip(gm)).targets).toEqual([]);
  });

  it('deletes tokens campaign-wide', async () => {
    // Skasowana figura przestaje być celem (etap 50c).
    expect(
      (await emitAck(player, 'token:target', { tokenId: ownTokenId, targetId: npcTokenId })).ok,
    ).toBe(true);
    const untargeted = waitFor<TokenTargetBroadcast>(player, 'token:target');
    const gone = waitFor<TokenDeleteBroadcast>(player, 'token:delete');
    const ack = await emitAck(gm, 'token:delete', { tokenId: npcTokenId });
    expect(ack.ok).toBe(true);
    expect(await gone).toMatchObject({ tokenId: npcTokenId });
    expect(await untargeted).toEqual({ sceneId, tokenId: ownTokenId, targetId: null });
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
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMove: 'explore' } });
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

  it('przestawia figury karty za jej portretem, ale nie grafikę z biblioteki żetonów', async () => {
    const card = await emitAck<CharacterView>(gm, 'character:create', { name: 'Paser 23.09' });
    if (!card.ok || !card.data) throw new Error('character:create failed');
    const place = async (imageUrl?: string) => {
      const token = await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Paser 23.09',
        x: 600,
        y: 600,
        characterId: card.data!.id,
        ...(imageUrl ? { imageUrl } : {}),
      });
      if (!token.ok || !token.data) throw new Error('token:create failed');
      return token.data.id;
    };
    const bare = await place();
    const art = await place(`${uploadsBase}tokens/wlasna-grafika.png`);
    const imageOf = async (id: string) =>
      (await stateOf(gm)).tokens.find((entry) => entry.id === id)?.imageUrl;
    for (const url of [
      `${uploadsBase}portraits/paser-1.webp`,
      `${uploadsBase}portraits/paser-2.webp`,
    ]) {
      expect(
        (
          await emitAck(gm, 'character:update', {
            characterId: card.data.id,
            patch: { portraitUrl: url },
          })
        ).ok,
      ).toBe(true);
      expect(await imageOf(bare)).toBe(url);
      expect(await imageOf(art)).toBe(`${uploadsBase}tokens/wlasna-grafika.png`);
    }
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
