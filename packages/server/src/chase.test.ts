import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  CharacterView,
  ChaseSyncBroadcast,
  SceneVehicleView,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
  VehicleView,
} from '@vtt/shared';
import {
  chaseRoadByUrl,
  chaseRoadPatch,
  seatedTokenPosition,
  vehicleSeatCentre,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';
import { exportCampaign } from './archive.js';

/**
 * Etap 65b na żywych gniazdach: scena pościgu. MG zakłada scenę „Pościg”, stawia
 * auta na drodze (przycięte do pasa jezdni), gracze sami siadają w fotelach —
 * kierownica tylko dla właściciela auta albo za jego zgodą — a ruch auta niesie
 * figury z foteli. Figura w fotelu nie chodzi, a z auta wyciąga ją tylko MG.
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
let ownerCookie: string;
let ownerId: string;
let riderCookie: string;
let riderId: string;
let campaignId: string;
const openSockets: ClientSocket[] = [];

function cookieOf(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error('missing set-cookie header');
  return raw.split(';')[0]!;
}

function connect(cookie: string): Promise<ClientSocket> {
  const socket = ioClient(baseUrl, {
    extraHeaders: { cookie },
    reconnection: false,
    timeout: 3000,
  });
  openSockets.push(socket);
  return new Promise((resolveSocket, reject) => {
    const timer = setTimeout(() => reject(new Error('state:sync timeout')), 4000);
    socket.once('connect_error', reject);
    socket.once('state:sync', () => {
      clearTimeout(timer);
      resolveSocket(socket);
    });
  });
}

function waitForMatch<T>(
  socket: ClientSocket,
  event: string,
  matches: (payload: T) => boolean,
  ms = 4000,
): Promise<T> {
  return new Promise((resolveEvent, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`${event} timeout`));
    }, ms);
    const listener = (payload: T) => {
      if (!matches(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolveEvent(payload);
    };
    socket.on(event, listener);
  });
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolveAck, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 6000);
    socket.emit(event, payload, (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolveAck(response);
    });
  });
}

function data<T>(ack: SocketAck<T>, what: string): T {
  if (!ack.ok || ack.data === undefined) throw new Error(`${what} failed: ${JSON.stringify(ack)}`);
  return ack.data;
}

async function syncOf(socket: ClientSocket): Promise<StateSyncPayload> {
  const sync = waitForMatch<StateSyncPayload>(socket, 'state:sync', () => true);
  socket.emit('state:request');
  return sync;
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
    payload: { name: 'Wiadukt' },
  });
  campaignId = (campaignRes.json() as CampaignSummary).id;
  const ownerRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Kord'),
  });
  ownerCookie = cookieOf(ownerRes.headers['set-cookie']);
  ownerId = (ownerRes.json() as { user: { id: string } }).user.id;
  const riderRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Wega'),
  });
  riderCookie = cookieOf(riderRes.headers['set-cookie']);
  riderId = (riderRes.json() as { user: { id: string } }).user.id;
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

describe('etap 65b: scena pościgu, auta i fotele', () => {
  let gm: ClientSocket;
  let owner: ClientSocket;
  let rider: ClientSocket;
  let scene: SceneView;
  let carId: string;
  let npcCarId: string;
  let car: SceneVehicleView;
  let npcCar: SceneVehicleView;
  let heroToken: TokenView;
  let riderToken: TokenView;

  const tokenRow = (id: string) => built.prisma.token.findUniqueOrThrow({ where: { id } });

  it('„Pościg” startuje otwarty, w skali 1 m, a auto staje w pasie jezdni', async () => {
    gm = await connect(gmCookie);
    owner = await connect(ownerCookie);
    rider = await connect(riderCookie);

    scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Wiadukt', kind: 'chase' }),
      'scene:create',
    );
    expect(scene).toMatchObject({
      kind: 'chase',
      visibility: 'open',
      metersPerSquare: 1,
      ambience: 'car',
    });
    scene = data(
      await emitAck<SceneView>(gm, 'scene:update', {
        sceneId: scene.id,
        patch: {
          width: 2400,
          height: 1800,
          grid: { sizePx: 100 },
          chase: { direction: 'right', road: { from: 6, to: 12 }, tempo: 40 },
        },
      }),
      'scene:update',
    );
    expect(scene.chase).toEqual({
      direction: 'right',
      tempo: 40,
      running: true,
      road: { from: 6, to: 12 },
    });
    const activated = waitForMatch(owner, 'scene:activate', () => true);
    await emitAck(gm, 'scene:activate', { sceneId: scene.id });
    await activated;

    const plain = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Klub' }),
      'scene:create map',
    );
    expect(plain.kind).toBe('map');
    expect(plain.ambience).toBe('none');

    const hero = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Iskra', ownerId }),
      'character:create Iskra',
    );
    const pal = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Wega', ownerId: riderId }),
      'character:create Wega',
    );
    carId = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', {
        catalogId: 'vehicle.sample-kompakt',
        ownerCharacterId: hero.id,
      }),
      'vehicle:create',
    ).id;
    npcCarId = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', {
        catalogId: 'vehicle.sample-kompakt',
        ownerCharacterId: null,
        name: 'Wóz Maelstromu',
      }),
      'vehicle:create npc',
    ).id;

    expect(
      await emitAck(gm, 'chase:place', { sceneId: plain.id, vehicleId: carId, x: 1, y: 1 }),
    ).toMatchObject({ ok: false, error: 'NOT_A_CHASE' });
    expect(
      await emitAck(owner, 'chase:place', { sceneId: scene.id, vehicleId: carId, x: 1, y: 1 }),
    ).toMatchObject({ ok: false, error: 'FORBIDDEN' });

    const riderSees = waitForMatch<ChaseSyncBroadcast>(
      rider,
      'chase:sync',
      (payload) => payload.vehicles.length === 1,
    );
    car = data(
      await emitAck<SceneVehicleView>(gm, 'chase:place', {
        sceneId: scene.id,
        vehicleId: carId,
        x: 900,
        y: 100,
      }),
      'chase:place',
    );
    // Jazda w prawo: w poprzek (y) pas 600–1200, bryła 3 kratki → środek ≥ 750.
    expect(car).toMatchObject({ x: 900, y: 750, layout: 'car-4', status: 'racing' });
    expect((await riderSees).vehicles[0]!.name).toBe('Kompakt Zetka');
    npcCar = data(
      await emitAck<SceneVehicleView>(gm, 'chase:place', {
        sceneId: scene.id,
        vehicleId: npcCarId,
        x: 1600,
        y: 1050,
      }),
      'chase:place npc',
    );
    // Gracz dostaje auto NPC-a ze sceną, choć nie ma go w `vehicles`.
    const sync = await syncOf(rider);
    expect(sync.sceneVehicles.map((row) => row.name).sort()).toEqual(
      ['Kompakt Zetka', 'Wóz Maelstromu'].sort(),
    );
    expect(sync.vehicles).toEqual([]);

    heroToken = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Iskra',
        x: 200,
        y: 200,
        ownerId,
        characterId: hero.id,
      }),
      'token:create Iskra',
    );
    riderToken = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Wega',
        x: 300,
        y: 200,
        ownerId: riderId,
        characterId: pal.id,
      }),
      'token:create Wega',
    );
    expect(heroToken.vehicleSeat).toBeNull();
  });

  it('gracz siada w fotelu, a kierownicę bierze tylko właściciel albo za jego zgodą', async () => {
    expect(
      (
        await emitAck(rider, 'vehicle:seat', {
          tokenId: riderToken.id,
          sceneVehicleId: car.id,
          seat: 1,
        })
      ).ok,
    ).toBe(true);
    const seated = await tokenRow(riderToken.id);
    const seatAt = vehicleSeatCentre(car, car, 1, 'right', 100)!;
    expect({ x: seated.x, y: seated.y }).toEqual(seatedTokenPosition(seatAt, 1, 100));
    expect(seated).toMatchObject({ sceneVehicleId: car.id, vehicleSeat: 1 });

    expect(
      await emitAck(rider, 'vehicle:seat', {
        tokenId: riderToken.id,
        sceneVehicleId: car.id,
        seat: 0,
      }),
    ).toMatchObject({ ok: false, error: 'DRIVER_SEAT_FORBIDDEN' });
    expect(
      await emitAck(rider, 'vehicle:seat', {
        tokenId: heroToken.id,
        sceneVehicleId: car.id,
        seat: 2,
      }),
    ).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    expect(
      await emitAck(owner, 'vehicle:seat', {
        tokenId: heroToken.id,
        sceneVehicleId: car.id,
        seat: 1,
      }),
    ).toMatchObject({ ok: false, error: 'SEAT_TAKEN' });
    expect(
      await emitAck(rider, 'vehicle:seat', {
        tokenId: riderToken.id,
        sceneVehicleId: npcCar.id,
        seat: 1,
      }),
    ).toMatchObject({ ok: false, error: 'VEHICLE_SWITCH_GM_ONLY' });

    // Właściciel siada za kierownicą swojego auta, potem przesiada się do tyłu.
    expect(
      (
        await emitAck(owner, 'vehicle:seat', {
          tokenId: heroToken.id,
          sceneVehicleId: car.id,
          seat: 0,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await emitAck(owner, 'vehicle:seat', {
          tokenId: heroToken.id,
          sceneVehicleId: car.id,
          seat: 2,
        })
      ).ok,
    ).toBe(true);

    // Zgoda: tylko właściciel (albo MG), i trzyma się karty figury.
    expect(
      await emitAck(rider, 'vehicle:allow-driver', {
        sceneVehicleId: car.id,
        tokenId: riderToken.id,
        allow: true,
      }),
    ).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    const granted = data(
      await emitAck<SceneVehicleView>(owner, 'vehicle:allow-driver', {
        sceneVehicleId: car.id,
        tokenId: riderToken.id,
        allow: true,
      }),
      'vehicle:allow-driver',
    );
    expect(granted.driverTokenIds).toEqual([riderToken.id]);
    expect(
      (
        await emitAck(rider, 'vehicle:seat', {
          tokenId: riderToken.id,
          sceneVehicleId: car.id,
          seat: 0,
        })
      ).ok,
    ).toBe(true);
    expect((await tokenRow(riderToken.id)).vehicleSeat).toBe(0);
  });

  it('figura w fotelu nie chodzi — ani krokiem, ani marszem', async () => {
    await emitAck(gm, 'scene:update', { sceneId: scene.id, patch: { playerMove: 'explore' } });
    expect(
      await emitAck(rider, 'token:move', { tokenId: riderToken.id, x: 0, y: 0, final: true }),
    ).toMatchObject({ ok: false, error: 'IN_VEHICLE' });
    expect(
      await emitAck(rider, 'token:walk', {
        tokenId: riderToken.id,
        route: [{ x: 100, y: 100 }],
      }),
    ).toMatchObject({ ok: false, error: 'IN_VEHICLE' });
    // 04.11.2026: klik MG w jezdnię też nie wyprowadza figury marszem —
    // wysiadka to przeciągnięcie (`token:move` ręką MG).
    expect(
      await emitAck(gm, 'token:walk', { tokenId: riderToken.id, route: [{ x: 100, y: 100 }] }),
    ).toMatchObject({ ok: false, error: 'IN_VEHICLE' });
  });

  it('ruch auta niesie figury z foteli', async () => {
    const moved = waitForMatch<{ token: TokenView }>(
      owner,
      'token:upsert',
      (payload) => payload.token.id === heroToken.id && payload.token.x > 1000,
    );
    const after = data(
      await emitAck<SceneVehicleView>(gm, 'chase:move', {
        sceneVehicleId: car.id,
        x: 1300,
        y: 1000,
      }),
      'chase:move',
    );
    expect(after).toMatchObject({ x: 1300, y: 1000 });
    const expected = seatedTokenPosition(vehicleSeatCentre(after, after, 2, 'right', 100)!, 1, 100);
    const row = await tokenRow(heroToken.id);
    expect({ x: row.x, y: row.y }).toEqual(expected);
    expect((await moved).token.vehicleSeat).toEqual({ sceneVehicleId: car.id, seat: 2 });
    expect(
      await emitAck(owner, 'chase:move', { sceneVehicleId: car.id, x: 0, y: 0 }),
    ).toMatchObject({ ok: false, error: 'NOT_DRIVER' });
  });

  it('MG przesadza do innego auta upuszczeniem i wysadza na jezdnię', async () => {
    const seat = vehicleSeatCentre(npcCar, npcCar, 1, 'right', 100)!;
    const corner = seatedTokenPosition(seat, 1, 100);
    expect(
      (
        await emitAck(gm, 'token:move', {
          tokenId: heroToken.id,
          x: corner.x,
          y: corner.y,
          final: true,
        })
      ).ok,
    ).toBe(true);
    expect(await tokenRow(heroToken.id)).toMatchObject({
      sceneVehicleId: npcCar.id,
      vehicleSeat: 1,
    });

    expect(
      (await emitAck(gm, 'token:move', { tokenId: heroToken.id, x: 100, y: 100, final: true })).ok,
    ).toBe(true);
    expect(await tokenRow(heroToken.id)).toMatchObject({ sceneVehicleId: null, vehicleSeat: null });
  });

  it('kampania w paczce niesie auta na scenie i fotele', async () => {
    const file = await exportCampaign(built.prisma, campaignId, { includeChat: false });
    const chaseScene = file?.payload.scenes.find((row) => row.id === scene.id);
    expect(chaseScene?.sceneVehicles?.length).toBe(2);
    expect(chaseScene?.scene).toMatchObject({ kind: 'chase', chaseDirection: 'right' });
    const seatedRow = chaseScene?.tokens.find((row) => row.id === riderToken.id);
    expect(seatedRow).toMatchObject({ sceneVehicleId: car.id, vehicleSeat: 0 });
  });

  it('pościg zamieniony w mapę wysadza wszystkich na miejscu', async () => {
    const before = await tokenRow(riderToken.id);
    const emptied = waitForMatch<ChaseSyncBroadcast>(
      rider,
      'chase:sync',
      (payload) => payload.vehicles.length === 0,
    );
    const asMap = data(
      await emitAck<SceneView>(gm, 'scene:update', { sceneId: scene.id, patch: { kind: 'map' } }),
      'scene:update kind',
    );
    // Mapa nie słyszy jazdy, którą dał jej pościg.
    expect(asMap.ambience).toBe('none');
    await emptied;
    const after = await tokenRow(riderToken.id);
    expect(after).toMatchObject({ sceneVehicleId: null, x: before.x, y: before.y });
    expect(await built.prisma.sceneVehicle.count({ where: { sceneId: scene.id } })).toBe(0);
  });

  it('skasowany pojazd schodzi z drogi', async () => {
    const back = data(
      await emitAck<SceneView>(gm, 'scene:update', { sceneId: scene.id, patch: { kind: 'chase' } }),
      'scene:update kind chase',
    );
    expect(back.ambience).toBe('car');
    data(
      await emitAck<SceneVehicleView>(gm, 'chase:place', {
        sceneId: scene.id,
        vehicleId: npcCarId,
        x: 1000,
        y: 900,
      }),
      'chase:place again',
    );
    const gone = waitForMatch<ChaseSyncBroadcast>(
      gm,
      'chase:sync',
      (payload) => payload.sceneId === scene.id && payload.vehicles.length === 0,
    );
    expect((await emitAck(gm, 'vehicle:delete', { vehicleId: npcCarId })).ok).toBe(true);
    await gone;
  });
});

describe('kreator pościgu (03.11): wbudowana droga jako tło', () => {
  it('MG kładzie drogę z listy jedną łatą, a adres spoza listy odpada', async () => {
    const gm = await connect(gmCookie);
    const created = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Autostrada', kind: 'chase' }),
      'scene:create',
    );
    // Domyślnie auta jadą w lewo (decyzja MG z 04.11).
    expect(created.chase.direction).toBe('left');
    const preset = chaseRoadByUrl('/art/roads/highway.webp')!;
    // Rozmiar z drutu się nie liczy — serwer bierze go z listy dróg.
    const patch = chaseRoadPatch(preset);
    const view = data(
      await emitAck<SceneView>(gm, 'scene:update', {
        sceneId: created.id,
        patch: { ...patch, background: { url: preset.url, width: 10, height: 10 } },
      }),
      'scene:update road',
    );
    expect(view.background).toEqual({ url: preset.url, width: 3500, height: 1800 });
    expect(view).toMatchObject({ width: 3500, height: 1800, metersPerSquare: 1 });
    expect(view.grid).toMatchObject({ sizePx: 100, offsetX: 0, offsetY: 0 });
    expect(view.chase).toMatchObject({ direction: 'left', road: { from: 2, to: 16 } });

    const fake = await emitAck(gm, 'scene:update', {
      sceneId: created.id,
      patch: { background: { url: '/art/roads/nope.webp', width: 3500, height: 1800 } },
    });
    expect(fake).toMatchObject({ ok: false, error: 'UPLOAD_NOT_FOUND' });

    // Mapa zamieniona w pościg też rusza w lewo, choć kolumna stoi na „w prawo”.
    const plain = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Parking' }),
      'scene:create map',
    );
    const switched = data(
      await emitAck<SceneView>(gm, 'scene:update', {
        sceneId: plain.id,
        patch: { kind: 'chase' },
      }),
      'scene:update kind',
    );
    expect(switched.chase.direction).toBe('left');

    const file = await exportCampaign(built.prisma, campaignId, { includeChat: false });
    expect(JSON.stringify(file)).toContain('/art/roads/highway.webp');
  });
});
