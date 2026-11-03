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
  CpredCharacterData,
  CpredVehicleStats,
  SocketAck,
  StateSyncPayload,
  VehicleDeleteBroadcast,
  VehicleUpsertBroadcast,
  VehicleView,
} from '@vtt/shared';
import { cpredVehicleDerived, readCpredFleet } from '@vtt/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';
import { exportCharacter, importCharacter } from './archive.js';
import { exportCampaign } from './archive.js';
import { loadCompendium } from './compendium.js';
import { loadCpredRegistry } from './cpred.js';
import { backfillFleetVehicles } from './vehicles.js';

/**
 * Etap 65a na żywych gniazdach: pojazd jako własność postaci. MG zakłada pojazd
 * z katalogu i zmienia wszystko, gracz tylko nazwę i grafikę wbudowaną, wiersz
 * „Pojazd” Taboru Rodziny staje się prawdziwym pojazdem, a ulepszenie z Moto
 * ląduje w nim według reguł s. 163–165. Do tego stare wiersze Taboru przy
 * starcie i paczka karty. Katalog to wymyślona próbka z `data/public`.
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

const silentLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as FastifyBaseLogger;

let built: BuiltApp;
let baseUrl: string;
let gmCookie: string;
let playerCookie: string;
let playerId: string;
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

const statsOf = (vehicle: VehicleView) => vehicle.system as CpredVehicleStats;

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
    payload: { name: 'Autostrada' },
  });
  campaignId = (campaignRes.json() as CampaignSummary).id;
  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Kord'),
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

describe('etap 65a: pojazd jako własność postaci', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let heroId: string;
  let nomadId: string;
  let carId: string;
  let npcCarId: string;

  it('MG zakłada pojazd z katalogu — gracz widzi pojazd swojej karty, nie auto NPC-a', async () => {
    gm = await connect(gmCookie);
    player = await connect(playerCookie);
    heroId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Iskra', ownerId: playerId }),
      'character:create',
    ).id;

    const seen = waitForMatch<VehicleUpsertBroadcast>(player, 'vehicle:upsert', () => true);
    const car = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', {
        catalogId: 'vehicle.sample-kompakt',
        ownerCharacterId: heroId,
      }),
      'vehicle:create',
    );
    carId = car.id;
    expect(car).toMatchObject({ name: 'Kompakt Zetka', layout: 'car-4', widthSq: 3, lengthSq: 5 });
    expect(statsOf(car)).toMatchObject({ hp: 45, hpMax: 45, seats: 4, move: 20, kind: 'car' });
    expect((await seen).vehicle.id).toBe(carId);

    npcCarId = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', {
        catalogId: 'vehicle.sample-strzala',
        ownerCharacterId: null,
        name: 'Wóz Maelstromu',
      }),
      'vehicle:create',
    ).id;
    const playerSync = await syncOf(player);
    expect(playerSync.vehicles.map((row) => row.id)).toEqual([carId]);
    expect((await syncOf(gm)).vehicles.map((row) => row.id).sort()).toEqual(
      [carId, npcCarId].sort(),
    );
  });

  it('gracz nie zakłada pojazdu, nie rusza cudzego, a swój tylko nazywa', async () => {
    const create = await emitAck(player, 'vehicle:create', {
      catalogId: 'vehicle.sample-kompakt',
      ownerCharacterId: heroId,
    });
    expect(create).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    expect(
      await emitAck(player, 'vehicle:rename', { vehicleId: npcCarId, name: 'Moje' }),
    ).toMatchObject({ ok: false, error: 'VEHICLE_NOT_FOUND' });
    expect(
      await emitAck(player, 'vehicle:rename', { vehicleId: carId, imageUrl: '/uploads/x.png' }),
    ).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    const renamed = data(
      await emitAck<VehicleView>(player, 'vehicle:rename', {
        vehicleId: carId,
        name: 'Rdzawa Zetka',
        imageUrl: '/art/vehicles/compact-red.webp',
      }),
      'vehicle:rename',
    );
    expect(renamed).toMatchObject({
      name: 'Rdzawa Zetka',
      imageUrl: '/art/vehicles/compact-red.webp',
    });
    expect(
      await emitAck(player, 'vehicle:update', { vehicleId: carId, patch: { name: 'X' } }),
    ).toMatchObject({ ok: false, error: 'FORBIDDEN' });
  });

  it('MG montuje ulepszenia według s. 163–165', async () => {
    const refused = await emitAck(gm, 'vehicle:update', {
      vehicleId: carId,
      patch: { system: { upgrades: [{ id: 'a', upgradeId: 'rocketPod' }] } },
    });
    expect(refused).toMatchObject({ ok: false, error: 'UPGRADE_NEEDS_REINFORCED' });
    const upgraded = data(
      await emitAck<VehicleView>(gm, 'vehicle:update', {
        vehicleId: carId,
        patch: {
          system: {
            upgrades: [
              { id: 'a', upgradeId: 'rocketPod' },
              { id: 'b', upgradeId: 'reinforced' },
              { id: 'c', upgradeId: 'extraSeats' },
            ],
          },
        },
      }),
      'vehicle:update',
    );
    const derived = cpredVehicleDerived(statsOf(upgraded));
    expect(derived).toMatchObject({ hpMax: 65, seats: 6 });
    expect(upgraded.layout).toBe('car-6');
    // Wzmocniona konstrukcja dokłada 20 także do bieżących PUK (MG 03.11).
    expect(statsOf(upgraded).hp).toBe(65);
  });

  it('okno MG wysyła układ zawsze, a fotele i tak idą za ulepszeniami', async () => {
    // Łata dokładnie taka, jak z `VehicleEditor`: wszystkie pola naraz.
    const editorPatch = (view: VehicleView, upgrades: CpredVehicleStats['upgrades']) => {
      const stats = statsOf(view);
      return {
        vehicleId: view.id,
        patch: {
          name: view.name,
          layout: view.layout,
          widthSq: view.widthSq,
          lengthSq: view.lengthSq,
          system: { ...stats, upgrades },
        },
      };
    };
    const current = data(
      await emitAck<VehicleView>(gm, 'vehicle:update', { vehicleId: carId, patch: {} }),
      'vehicle:update noop',
    );
    const without = data(
      await emitAck<VehicleView>(
        gm,
        'vehicle:update',
        editorPatch(
          current,
          statsOf(current).upgrades.filter((row) => row.upgradeId !== 'extraSeats'),
        ),
      ),
      'vehicle:update editor -seats',
    );
    expect(without.layout).toBe('car-4');
    const back = data(
      await emitAck<VehicleView>(
        gm,
        'vehicle:update',
        editorPatch(without, [
          ...statsOf(without).upgrades,
          { id: 'c2', upgradeId: 'extraSeats', notes: '' },
        ]),
      ),
      'vehicle:update editor +seats',
    );
    expect(back.layout).toBe('car-6');
    // Układ wybrany ręką w tej samej łacie wygrywa z fotelami.
    const chosen = data(
      await emitAck<VehicleView>(gm, 'vehicle:update', {
        ...editorPatch(
          back,
          statsOf(back).upgrades.filter((row) => row.id !== 'c2'),
        ),
        patch: {
          ...editorPatch(
            back,
            statsOf(back).upgrades.filter((row) => row.id !== 'c2'),
          ).patch,
          layout: 'van-8',
        },
      }),
      'vehicle:update editor chosen layout',
    );
    expect(chosen.layout).toBe('van-8');
    await emitAck(gm, 'vehicle:update', { vehicleId: carId, patch: { layout: 'car-4' } });
  });

  it('wiersz „Pojazd” Taboru staje się pojazdem, a ulepszenie Moto ląduje w nim', async () => {
    nomadId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Kord', ownerId: playerId }),
      'character:create',
    ).id;
    expect(
      (
        await emitAck(gm, 'character:update', {
          characterId: nomadId,
          patch: { data: { roleId: 'nomad', roleAbilityRank: 4 } },
        })
      ).ok,
    ).toBe(true);

    const upsert = waitForMatch<VehicleUpsertBroadcast>(
      player,
      'vehicle:upsert',
      (payload) => payload.vehicle.ownerCharacterId === nomadId,
    );
    const saved = data(
      await emitAck<CharacterView>(player, 'character:update', {
        characterId: nomadId,
        patch: {
          data: {
            fleet: [
              {
                id: 'bike',
                kind: 'vehicle',
                name: 'Skuter miejski Wiórek',
                level: 1,
                compendiumId: 'vehicle.sample-skuter-miejski',
              },
            ],
          },
        },
      }),
      'character:update',
    );
    const [row] = readCpredFleet((saved.data as CpredCharacterData).fleet);
    const bike = (await upsert).vehicle;
    expect(row?.vehicleId).toBe(bike.id);
    expect(bike).toMatchObject({ layout: 'bike-2', widthSq: 2, lengthSq: 3 });
    expect(statsOf(bike)).toMatchObject({ kind: 'motorcycle', fleetRowId: 'bike' });

    // Pług nie dla motocykla — odmowa z reguły pojazdu, karta bez zmian.
    const fleet = (saved.data as CpredCharacterData).fleet;
    expect(
      await emitAck(player, 'character:update', {
        characterId: nomadId,
        patch: {
          data: {
            fleet: [
              ...fleet,
              {
                id: 'plow',
                kind: 'upgrade',
                name: 'Pług',
                level: 1,
                vehicleId: bike.id,
                upgradeId: 'ram',
              },
            ],
          },
        },
      }),
    ).toMatchObject({ ok: false, error: 'UPGRADE_NOT_FOR_KIND' });

    const withNitro = waitForMatch<VehicleUpsertBroadcast>(
      player,
      'vehicle:upsert',
      (payload) => payload.vehicle.id === bike.id && statsOf(payload.vehicle).upgrades.length > 0,
    );
    expect(
      (
        await emitAck(player, 'character:update', {
          characterId: nomadId,
          patch: {
            data: {
              fleet: [
                ...fleet,
                {
                  id: 'n2o',
                  kind: 'upgrade',
                  name: 'Nitro',
                  level: 1,
                  vehicleId: bike.id,
                  upgradeId: 'nitro',
                },
              ],
            },
          },
        })
      ).ok,
    ).toBe(true);
    expect(statsOf((await withNitro).vehicle).upgrades).toEqual([
      { id: 'fleet-n2o', upgradeId: 'nitro', fleetRowId: 'n2o', notes: '' },
    ]);

    // Wiersz z ulepszeniem z Taboru zmienia wyłącznie karta — okno MG go zostawia.
    const gmEdit = data(
      await emitAck<VehicleView>(gm, 'vehicle:update', {
        vehicleId: bike.id,
        patch: { system: { upgrades: [] } },
      }),
      'vehicle:update',
    );
    expect(statsOf(gmEdit).upgrades.map((entry) => entry.upgradeId)).toEqual(['nitro']);
    expect(await emitAck(gm, 'vehicle:delete', { vehicleId: bike.id })).toMatchObject({
      ok: false,
      error: 'VEHICLE_IN_FLEET',
    });
  });

  it('inny pojazd z katalogu w tym samym wierszu: nowe liczby i nazwa, gdy niezmieniona', async () => {
    const before = (await syncOf(player)).vehicles.find((row) => row.ownerCharacterId === nomadId)!;
    const fleet = readCpredFleet(
      (
        (await syncOf(player)).characters.find((row) => row.id === nomadId)!
          .data as CpredCharacterData
      ).fleet,
    );
    const rebased = waitForMatch<VehicleUpsertBroadcast>(
      player,
      'vehicle:upsert',
      (payload) => payload.vehicle.id === before.id && statsOf(payload.vehicle).kind === 'car',
    );
    expect(
      (
        await emitAck(player, 'character:update', {
          characterId: nomadId,
          patch: {
            data: {
              fleet: fleet.map((row) =>
                row.id === 'bike'
                  ? { ...row, compendiumId: 'vehicle.sample-kompakt', name: 'Kompakt Zetka' }
                  : row,
              ),
            },
          },
        })
      ).ok,
    ).toBe(true);
    const after = (await rebased).vehicle;
    expect(after).toMatchObject({ name: 'Kompakt Zetka', layout: 'car-4' });
    expect(statsOf(after)).toMatchObject({
      hpMax: 45,
      hp: 45,
      catalogId: 'vehicle.sample-kompakt',
    });
  });

  it('pojazd z progu ponad Moto jest odrzucany', async () => {
    expect(
      await emitAck(player, 'character:update', {
        characterId: nomadId,
        patch: {
          data: {
            fleet: [
              {
                id: 'fast',
                kind: 'vehicle',
                name: 'Strzała Klasy S',
                level: 1,
                compendiumId: 'vehicle.sample-strzala',
              },
            ],
          },
        },
      }),
    ).toMatchObject({ ok: false, error: 'LEVEL_ABOVE_RANK' });
  });

  it('łata bez `vehicleId` (autozapis przed echem) nie zakłada drugiego pojazdu', async () => {
    const before = await built.prisma.vehicle.count({ where: { ownerCharacterId: nomadId } });
    expect(
      (
        await emitAck(player, 'character:update', {
          characterId: nomadId,
          patch: {
            data: {
              fleet: [
                {
                  id: 'bike',
                  kind: 'vehicle',
                  name: 'Skuter miejski Wiórek',
                  level: 1,
                  compendiumId: 'vehicle.sample-skuter-miejski',
                },
              ],
            },
          },
        })
      ).ok,
    ).toBe(true);
    expect(await built.prisma.vehicle.count({ where: { ownerCharacterId: nomadId } })).toBe(before);
  });

  it('wiersz zdjęty z Taboru zabiera swój pojazd', async () => {
    const bike = (await syncOf(player)).vehicles.find((row) => row.ownerCharacterId === nomadId)!;
    const gone = waitForMatch<VehicleDeleteBroadcast>(
      player,
      'vehicle:delete',
      (payload) => payload.vehicleId === bike.id,
    );
    expect(
      (
        await emitAck(player, 'character:update', {
          characterId: nomadId,
          patch: { data: { fleet: [] } },
        })
      ).ok,
    ).toBe(true);
    await gone;
    expect(await built.prisma.vehicle.findUnique({ where: { id: bike.id } })).toBeNull();
  });

  it('stary wiersz „Pojazd” z samą nazwą dostaje pojazd przy starcie', async () => {
    const registry = await loadCpredRegistry(
      config.dataPublicDir,
      config.dataPrivateDir,
      silentLog,
    );
    const compendium = await loadCompendium(config.dataPublicDir, config.dataPrivateDir, silentLog);
    const row = await built.prisma.character.findUniqueOrThrow({ where: { id: nomadId } });
    const sheet = JSON.parse(row.data) as CpredCharacterData;
    await built.prisma.character.update({
      where: { id: nomadId },
      data: {
        data: JSON.stringify({
          ...sheet,
          fleet: [{ id: 'old', kind: 'vehicle', name: 'Kompakt Zetka wujka', level: 1, notes: '' }],
        }),
      },
    });
    await backfillFleetVehicles(built.prisma, compendium, registry, silentLog);
    const after = JSON.parse(
      (await built.prisma.character.findUniqueOrThrow({ where: { id: nomadId } })).data,
    ) as CpredCharacterData;
    const [old] = readCpredFleet(after.fleet);
    expect(old?.vehicleId).toBeTruthy();
    expect(old?.compendiumId).toBe('vehicle.sample-kompakt');
    const vehicle = await built.prisma.vehicle.findUniqueOrThrow({
      where: { id: old!.vehicleId! },
    });
    expect(vehicle).toMatchObject({ ownerCharacterId: nomadId, name: 'Kompakt Zetka wujka' });
    // Drugi start niczego już nie dokłada.
    await backfillFleetVehicles(built.prisma, compendium, registry, silentLog);
    expect(await built.prisma.vehicle.count({ where: { ownerCharacterId: nomadId } })).toBe(1);
  });

  it('paczka karty wiezie jej pojazdy, a Tabor wskazuje je po nowych id', async () => {
    const registry = await loadCpredRegistry(
      config.dataPublicDir,
      config.dataPrivateDir,
      silentLog,
    );
    const file = await exportCharacter(built.prisma, nomadId);
    expect(file?.payload.vehicles).toHaveLength(1);
    const result = await importCharacter(built.prisma, registry, file, {
      campaignId,
      ownerId: null,
      name: 'Kord (kopia)',
    });
    if ('code' in result) throw new Error(result.code);
    const copy = JSON.parse(
      (await built.prisma.character.findUniqueOrThrow({ where: { id: result.id } })).data,
    ) as CpredCharacterData;
    const [row] = readCpredFleet(copy.fleet);
    const vehicle = await built.prisma.vehicle.findUniqueOrThrow({
      where: { id: row!.vehicleId! },
    });
    expect(vehicle.ownerCharacterId).toBe(result.id);
    expect(vehicle.id).not.toBe(file!.payload.vehicles![0]!.id);

    const campaign = await exportCampaign(built.prisma, campaignId, { includeChat: false });
    expect(campaign?.payload.vehicles?.length).toBe(
      await built.prisma.vehicle.count({ where: { campaignId } }),
    );
  });

  it('skasowana karta zostawia pojazd MG', async () => {
    const gone = waitForMatch<VehicleDeleteBroadcast>(
      player,
      'vehicle:delete',
      (payload) => payload.vehicleId === carId,
    );
    const orphan = waitForMatch<VehicleUpsertBroadcast>(
      gm,
      'vehicle:upsert',
      (payload) => payload.vehicle.id === carId,
    );
    expect((await emitAck(gm, 'character:delete', { characterId: heroId })).ok).toBe(true);
    await gone;
    expect((await orphan).vehicle.ownerCharacterId).toBeNull();
  });
});
