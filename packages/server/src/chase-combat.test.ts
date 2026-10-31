import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  AttackRollResult,
  CampaignSummary,
  CharacterView,
  ChatMessageBroadcast,
  ChaseSyncBroadcast,
  CpredCharacterData,
  DamageLogEntry,
  SceneVehicleView,
  SceneView,
  SocketAck,
  TokenView,
  VehicleView,
} from '@vtt/shared';
import { readCpredVehicle } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';
import { paceTesting } from './realtime/pace.js';

paceTesting.off = true;

/**
 * Etap 65d1 na żywych gniazdach: ostrzał auta na scenie pościgu. Pasażer za
 * szybą kuloodporną jest za osłoną (karta odmowy, nic nie wydane), szyba
 * przyjmuje obrażenia osobno, kadłub bierze obrażenia minus OB, słaby punkt
 * mnoży ×2, a PUK 0 robi wrak, którego nie da się uruchomić; „Cofnij” go skleja.
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
let playerCookie: string;
let playerId: string;
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
    payload: { name: 'Ostrzał na wiadukcie' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;
  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Vex'),
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

describe('etap 65d1: ostrzał auta i pasażera', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let characterId: string;
  let shooterId: string;
  let passengerId: string;
  let vehicle: VehicleView;
  let car: SceneVehicleView;

  const vehicleStats = async () =>
    readCpredVehicle(
      (await built.prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).system,
    );

  /** Strzał gracza; duży modyfikator — ten zestaw jest o aucie, nie o kościach. */
  async function shoot(target: Record<string, unknown>, request: Record<string, unknown> = {}) {
    const message = waitForMatch<ChatMessageBroadcast>(
      gm,
      'chat:message',
      (payload) => payload.message.roll?.attack !== undefined,
    );
    const ack = await emitAck<AttackRollResult>(player, 'attack:roll', {
      characterId,
      ...target,
      attackerTokenId: shooterId,
      request: { weaponRowId: 'w-pistol', mode: 'single', modifier: 20, ...request },
    });
    if (!ack.ok) return { error: ack.error };
    if (ack.data && 'blocked' in ack.data && ack.data.blocked) return { blocked: ack.data.blocked };
    const broadcast = await message;
    return { card: broadcast.message.roll!.attack!, messageId: broadcast.message.id };
  }

  /** Obrażenia za kartę ataku — rozliczają się same; zwraca wpis z auta. */
  async function damage(attackMessageId: number): Promise<{ entry: DamageLogEntry; id: number }> {
    const log = waitForMatch<ChatMessageBroadcast>(
      gm,
      'chat:message',
      (payload) => payload.message.damage?.targetVehicleId === car.id,
    );
    data(
      await emitAck(player, 'character:roll', {
        characterId,
        request: { kind: 'damage', weaponRowId: 'w-pistol', attackMessageId },
      }),
      'character:roll damage',
    );
    const broadcast = await log;
    return { entry: broadcast.message.damage!, id: broadcast.message.id };
  }

  it('stawia scenę: strzelec na jezdni, auto z szybami kuloodpornymi i pasażer', async () => {
    gm = await connect(gmCookie);
    player = await connect(playerCookie);
    const character = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Vex', ownerId: playerId }),
      'character:create',
    );
    characterId = character.id;
    data(
      await emitAck(gm, 'character:update', {
        characterId,
        patch: {
          data: {
            stats: { ...(character.data as CpredCharacterData).stats, ref: 6, dex: 5 },
            skills: { handgun: 5 },
            weapons: [
              {
                id: 'w-pistol',
                name: 'Zgrzyt 9',
                notes: '',
                compendiumId: 'weapon.zgrzyt-9',
                damage: '2k6',
                ammoCurrent: 60,
                ammoMax: 60,
                ammoType: '',
                rof: '2',
              },
            ],
          },
        },
      }),
      'character:update',
    );
    let scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Wiadukt', kind: 'chase' }),
      'scene:create',
    );
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
    const activated = waitForMatch(player, 'scene:activate', () => true);
    await emitAck(gm, 'scene:activate', { sceneId: scene.id });
    await activated;

    vehicle = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', { catalogId: 'vehicle.sample-kompakt' }),
      'vehicle:create',
    );
    data(
      await emitAck(gm, 'vehicle:update', {
        vehicleId: vehicle.id,
        patch: {
          system: {
            upgrades: [
              { id: 'u-hull', upgradeId: 'armoredHull', notes: '' },
              { id: 'u-glass', upgradeId: 'bulletproofGlass', notes: '' },
            ],
          },
        },
      }),
      'vehicle:update',
    );
    const synced = waitForMatch<ChaseSyncBroadcast>(player, 'chase:sync', (payload) =>
      payload.vehicles.some((entry) => entry.vehicleId === vehicle.id),
    );
    car = data(
      await emitAck<SceneVehicleView>(gm, 'chase:place', {
        sceneId: scene.id,
        vehicleId: vehicle.id,
        x: 1200,
        y: 900,
      }),
      'chase:place',
    );
    // Panel auta: PUK i OB jawne dla stołu, szyby z PW każdej burty.
    expect(car).toMatchObject({ hp: 45, hpMax: 45, armorSp: 13, status: 'racing' });
    expect(car.windows?.rear).toEqual({ hp: 15, max: 15 });
    expect(car.upgrades).toEqual(['Opancerzenie kadłuba', 'Szyby kuloodporne']);
    const seen = (await synced).vehicles.find((entry) => entry.id === car.id);
    expect(seen?.hp).toBe(45);

    // Strzelec stoi za autem (jazda w prawo), w tym samym pasie.
    shooterId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Vex',
        x: 150,
        y: 850,
        ownerId: playerId,
        characterId,
      }),
      'token:create shooter',
    ).id;
    passengerId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Ganger',
        x: 100,
        y: 100,
        hp: { current: 30, max: 30 },
      }),
      'token:create passenger',
    ).id;
    expect(
      (await emitAck(gm, 'vehicle:seat', { tokenId: passengerId, sceneVehicleId: car.id, seat: 1 }))
        .ok,
    ).toBe(true);
  });

  it('pasażer za szybą kuloodporną: karta odmowy z tylną szybą, nic nie wydane', async () => {
    const shot = await shoot({ targetTokenId: passengerId });
    expect(shot.blocked).toMatchObject({
      kind: 'window',
      sceneVehicleId: car.id,
      side: 'rear',
      hpCurrent: 15,
      hpMax: 15,
    });
    const row = await built.prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect((JSON.parse(row.data) as CpredCharacterData).weapons[0]!.ammoCurrent).toBe(60);
  });

  it('szyba przyjmuje obrażenia osobno — kadłub nietknięty', async () => {
    const shot = await shoot({ targetVehicleId: car.id, targetWindow: 'rear' });
    expect(shot.card).toMatchObject({ hit: true, targetVehicleId: car.id, targetWindow: 'rear' });
    // Auto nie robi uników — obrażenia nie czekają na nikogo.
    expect(shot.card?.evasionPending).toBeUndefined();
    const { entry } = await damage(shot.messageId!);
    expect(entry.targetWindow).toBe('rear');
    expect(entry.hp?.before).toBe(15);
    const stats = await vehicleStats();
    expect(stats.windows.rear).toBe(entry.hp!.after);
    expect(stats.hp).toBe(45);
  });

  it('kadłub: obrażenia minus OB 13, słaby punkt ×2 po OB i −8 w rzucie', async () => {
    // Bez opancerzenia, żeby 2k6 przeszło przez kadłub i ×2 było widać.
    data(
      await emitAck(gm, 'vehicle:update', {
        vehicleId: vehicle.id,
        patch: {
          system: { upgrades: [{ id: 'u-glass', upgradeId: 'bulletproofGlass', notes: '' }] },
        },
      }),
      'vehicle:update',
    );
    const shot = await shoot({ targetVehicleId: car.id }, { weakSpot: true });
    expect(shot.card).toMatchObject({ hit: true, targetVehicleId: car.id });
    expect(shot.card?.system).toMatchObject({ vehicleWeakSpot: true, aimed: true });
    const { entry } = await damage(shot.messageId!);
    expect(entry).toMatchObject({
      locationLabel: 'słaby punkt pojazdu',
      armorSp: 0,
      doubled: true,
    });
    expect(entry.hpLost).toBe(Math.min(45, entry.damageRolled * 2));
    expect((await vehicleStats()).hp).toBe(45 - entry.hpLost);
  });

  it('PUK 0 to wrak: stoi, silnika nie uruchomisz, „Cofnij” go skleja', async () => {
    data(
      await emitAck(gm, 'vehicle:update', { vehicleId: vehicle.id, patch: { system: { hp: 1 } } }),
      'vehicle:update hp',
    );
    const wrecked = waitForMatch<ChaseSyncBroadcast>(gm, 'chase:sync', (payload) =>
      payload.vehicles.some((entry) => entry.id === car.id && entry.status === 'wrecked'),
    );
    const shot = await shoot({ targetVehicleId: car.id });
    const { entry, id } = await damage(shot.messageId!);
    expect(entry.hp).toMatchObject({ before: 1, after: 0 });
    expect(entry.woundLabel).toMatch(/^Pojazd zniszczony/);
    const view = (await wrecked).vehicles.find((row) => row.id === car.id)!;
    expect(view).toMatchObject({ hp: 0, status: 'wrecked', moveSq: 0, driftSq: -10 });

    await emitAck(gm, 'vehicle:engine', { sceneVehicleId: car.id, on: false });
    expect(await emitAck(gm, 'vehicle:engine', { sceneVehicleId: car.id, on: true })).toMatchObject(
      { ok: false, error: 'VEHICLE_WRECKED' },
    );

    const repaired = waitForMatch<ChaseSyncBroadcast>(gm, 'chase:sync', (payload) =>
      payload.vehicles.some((row) => row.id === car.id && row.hp === 1),
    );
    expect((await emitAck(gm, 'damage:undo', { messageId: id })).ok).toBe(true);
    expect((await repaired).vehicles.find((row) => row.id === car.id)?.status).toBe('racing');
  });

  it('własnego auta się nie ostrzeliwuje, a auta spoza pościgu gracz nie celuje', async () => {
    expect(
      (await emitAck(gm, 'vehicle:seat', { tokenId: shooterId, sceneVehicleId: car.id, seat: 2 }))
        .ok,
    ).toBe(true);
    expect(await shoot({ targetVehicleId: car.id })).toEqual({ error: 'OWN_VEHICLE' });
    // Z wnętrza auta szyby nie ma między strzelcem a pasażerem.
    const inside = await shoot({ targetTokenId: passengerId });
    expect(inside.blocked).toBeUndefined();
    expect(inside.card?.targetTokenId).toBe(passengerId);

    await built.prisma.sceneVehicle.update({ where: { id: car.id }, data: { status: 'behind' } });
    expect(await shoot({ targetVehicleId: 'nope' })).toEqual({ error: 'VEHICLE_NOT_FOUND' });
  });

  it('Ulepszone zespolenie: kierowca motocykla ze złączem i REF 8 unika za motocykl (s. 165)', async () => {
    await built.prisma.sceneVehicle.update({ where: { id: car.id }, data: { status: 'racing' } });
    const rider = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Iskra' }),
      'character:create rider',
    );
    data(
      await emitAck(gm, 'character:update', {
        characterId: rider.id,
        patch: {
          data: {
            stats: { ...(rider.data as CpredCharacterData).stats, ref: 8 },
            cyberware: [{ id: 'cw-plugs', name: 'Złącza interfejsu', notes: '' }],
          },
        },
      }),
      'character:update rider',
    );
    const sceneId = (await built.prisma.sceneVehicle.findUniqueOrThrow({ where: { id: car.id } }))
      .sceneId;
    const bikeRow = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', {
        catalogId: 'vehicle.sample-skuter-miejski',
      }),
      'vehicle:create bike',
    );
    data(
      await emitAck(gm, 'vehicle:update', {
        vehicleId: bikeRow.id,
        patch: { system: { upgrades: [{ id: 'u-link', upgradeId: 'interfaceLink', notes: '' }] } },
      }),
      'vehicle:update bike',
    );
    const bike = data(
      await emitAck<SceneVehicleView>(gm, 'chase:place', {
        sceneId,
        vehicleId: bikeRow.id,
        x: 1200,
        y: 1100,
      }),
      'chase:place bike',
    );
    const riderToken = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Iskra',
        x: 100,
        y: 100,
        characterId: rider.id,
      }),
      'token:create rider',
    );
    expect(
      (
        await emitAck(gm, 'vehicle:seat', {
          tokenId: riderToken.id,
          sceneVehicleId: bike.id,
          seat: 0,
        })
      ).ok,
    ).toBe(true);
    const shot = await shoot({ targetVehicleId: bike.id });
    expect(shot.card).toMatchObject({ hit: true, evasionBy: riderToken.id });
    expect(shot.card?.evasionPending).toEqual([riderToken.id]);
  });
});
