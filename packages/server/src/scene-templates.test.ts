import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  CombatView,
  SceneTemplateCreateResult,
  SceneVehicleView,
  StateSyncPayload,
  TokenSyncBroadcast,
  SceneTemplateSummary,
  SocketAck,
} from '@vtt/shared';
import type { CpredCharacterData } from '@vtt/shared';
import { readCpredVehicle, seatedTokenPosition, vehicleSeatCentre } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';
import { chaseBodyOf } from './realtime/chase.js';

/**
 * Etap 66: sceny przykładowe z `data/public/scenes`. MG widzi listę wzorców
 * i zakłada z nich zwykłą scenę kampanii — z autami, kartami NPC-ów, figurami
 * w fotelach i notatkami MG. Testy chodzą na próbce kompendium (bez
 * `data/private`), więc wzorzec musi stanąć z alternatyw z próbki.
 *
 * Katalog wzorców to kopia scen z repo plus fikstura pościgu
 * (`fixtures/scene-templates/test-poscig`) — testy auta i foteli nie zależą
 * od tego, jakie pościgi akurat leżą w przykładowych (04.11 MG skasował
 * „Pościg na wiadukcie”, z którego fikstura powstała).
 */

const SCENE_TEMPLATES_DIR = mkdtempSync(join(tmpdir(), 'vtt-scene-templates-'));
cpSync(resolve(import.meta.dirname, '../../../data/public/scenes'), SCENE_TEMPLATES_DIR, {
  recursive: true,
});
cpSync(resolve(import.meta.dirname, 'fixtures/scene-templates'), SCENE_TEMPLATES_DIR, {
  recursive: true,
});

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
  sceneTemplatesDir: SCENE_TEMPLATES_DIR,
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
let campaignId: string;
const openSockets: ClientSocket[] = [];

function cookieOf(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error('missing set-cookie header');
  return raw.split(';')[0]!;
}

function connectWithSync(
  cookie: string,
): Promise<{ socket: ClientSocket; sync: StateSyncPayload }> {
  const socket = ioClient(baseUrl, {
    extraHeaders: { cookie },
    reconnection: false,
    timeout: 3000,
  });
  openSockets.push(socket);
  return new Promise((resolveSocket, reject) => {
    const timer = setTimeout(() => reject(new Error('state:sync timeout')), 4000);
    socket.once('connect_error', reject);
    socket.once('state:sync', (sync: StateSyncPayload) => {
      clearTimeout(timer);
      resolveSocket({ socket, sync });
    });
  });
}

async function connect(cookie: string): Promise<ClientSocket> {
  return (await connectWithSync(cookie)).socket;
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
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 8000);
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
    payload: { name: 'Przykłady' },
  });
  campaignId = (campaignRes.json() as CampaignSummary).id;
  const playerRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Kord'),
  });
  playerCookie = cookieOf(playerRes.headers['set-cookie']);
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

describe('etap 66: sceny przykładowe', () => {
  let gm: ClientSocket;

  it('MG widzi wzorce, gracz nie', async () => {
    gm = await connect(gmCookie);
    const player = await connect(playerCookie);
    const list = data(await emitAck<SceneTemplateSummary[]>(gm, 'scene:templates'), 'templates');
    expect(list.find((row) => row.id === 'test-poscig')).toMatchObject({
      name: 'Pościg testowy',
      category: 'examples',
      kind: 'chase',
      backgroundUrl: null,
      vehicles: 3,
      figures: 5,
    });
    expect(await emitAck(player, 'scene:templates')).toMatchObject({ ok: false });
    expect(
      await emitAck(player, 'scene:from-template', { templateId: 'test-poscig' }),
    ).toMatchObject({ ok: false });
  });

  it('nieznany albo podejrzany wzorzec — TEMPLATE_NOT_FOUND', async () => {
    for (const templateId of ['nie-ma-takiego', '../private', 'Poscig']) {
      expect(await emitAck(gm, 'scene:from-template', { templateId })).toMatchObject({
        ok: false,
        error: 'TEMPLATE_NOT_FOUND',
      });
    }
  });

  it('wzorzec pościgu staje z autami, gangerami w fotelach i notatkami MG', async () => {
    const result = data(
      await emitAck<SceneTemplateCreateResult>(gm, 'scene:from-template', {
        templateId: 'test-poscig',
      }),
      'from-template',
    );
    // Próbka z `data/public` ma alternatywę dla każdego wpisu wzorca; nieznany
    // stan figury (66c) wypada i trafia na listę dla MG.
    expect(result.missing).toEqual(['status:nie-ma-takiego-stanu']);

    const scene = await built.prisma.scene.findUniqueOrThrow({ where: { id: result.sceneId } });
    expect(scene).toMatchObject({
      campaignId,
      name: 'Pościg testowy',
      active: false,
      kind: 'chase',
      chaseDirection: 'left',
      chaseTempo: 40,
      chaseRoadFrom: 3,
      chaseRoadTo: 9,
      visibility: 'open',
      metersPerSquare: 1,
      backgroundUrl: null,
      width: 1448,
      height: 1086,
    });
    expect(scene.spawnX).toBeCloseTo(6.5 * 60.333333);

    const placed = await built.prisma.sceneVehicle.findMany({
      where: { sceneId: scene.id },
      include: { vehicle: true },
    });
    expect(placed).toHaveLength(3);
    const taxi = placed.find((row) => row.vehicle.name === 'Kradziona taksówka')!;
    const pickup = placed.find((row) => row.vehicle.name === 'Pickup Maelstromu')!;
    const reserve = placed.find((row) => row.vehicle.name === 'Posiłki Maelstromu')!;
    expect([taxi.status, pickup.status, reserve.status]).toEqual(['racing', 'racing', 'behind']);
    expect(taxi.vehicle).toMatchObject({ campaignId, ownerCharacterId: null });
    expect(taxi.vehicle.imageUrl).toBe('/art/vehicles/car-taxi.webp');
    expect(readCpredVehicle(taxi.vehicle.system).upgrades.map((row) => row.upgradeId)).toEqual([
      'spikes',
    ]);
    const pickupStats = readCpredVehicle(pickup.vehicle.system);
    expect(pickupStats.catalogId).toBe('vehicle.sample-kompakt');
    expect(pickupStats.upgrades.map((row) => row.upgradeId)).toEqual(['reinforced', 'ram']);
    // Wzmocniona konstrukcja: PUK pełne z +20.
    expect(pickupStats.hp).toBe(pickupStats.hpMax + 20);
    // Taksówka z przodu (droga jedzie w lewo), pickup z tyłu, obie w pasie 3–9.
    expect(taxi.x).toBeLessThan(pickup.x);
    for (const row of placed) {
      expect(row.y - 1.5 * scene.gridSizePx).toBeGreaterThanOrEqual(3 * scene.gridSizePx - 0.01);
      expect(row.y + 1.5 * scene.gridSizePx).toBeLessThanOrEqual(9 * scene.gridSizePx + 0.01);
    }

    const all = await built.prisma.token.findMany({
      where: { sceneId: scene.id },
      include: { character: true },
      orderBy: { vehicleSeat: 'asc' },
    });
    expect(all).toHaveLength(5);
    const hostage = all.find((row) => row.name === 'Zakładnik')!;
    expect(hostage).toMatchObject({ sceneVehicleId: taxi.id, vehicleSeat: 3 });
    expect(JSON.parse(hostage.statuses)).toEqual(['unconscious']);
    const tokens = all.filter((row) => row.sceneVehicleId === pickup.id);
    expect(tokens.map((row) => [row.name, row.vehicleSeat])).toEqual([
      ['Szczęka', 0],
      ['Bolec', 1],
      ['Rdza', 2],
    ]);
    for (const token of tokens) {
      expect(token.sceneVehicleId).toBe(pickup.id);
      expect(token.disposition).toBe('hostile');
      const seat = vehicleSeatCentre(
        pickup,
        chaseBodyOf(pickup.vehicle),
        token.vehicleSeat!,
        'left',
        scene.gridSizePx,
      )!;
      expect({ x: token.x, y: token.y }).toEqual(seatedTokenPosition(seat, 1, scene.gridSizePx));
      expect(token.character).toMatchObject({ campaignId, ownerId: null });
    }
    // Karta zapisana tak, jak widzi ją stół (`mergeCharacterData`) — czytamy surowy JSON.
    const boss = JSON.parse(tokens[2]!.character!.data) as CpredCharacterData;
    expect(boss.stats.body).toBe(8);
    expect(boss.weapons.map((row) => row.name)).toEqual(
      expect.arrayContaining(['Zardzewiak', 'Szpon']),
    );
    expect(boss.armor.map((row) => row.location).sort()).toEqual(['body', 'head']);

    const notes = await built.prisma.mapNote.findMany({ where: { sceneId: scene.id } });
    expect(notes).toHaveLength(3);
    expect(notes.every((note) => note.text.length > 100)).toBe(true);
  });

  it('druga kopia tego samego wzorca dostaje numer w nazwie', async () => {
    const again = data(
      await emitAck<SceneTemplateCreateResult>(gm, 'scene:from-template', {
        templateId: 'test-poscig',
      }),
      'from-template 2',
    );
    const scene = await built.prisma.scene.findUniqueOrThrow({ where: { id: again.sceneId } });
    expect(scene.name).toBe('Pościg testowy 2');
    // Każda kopia ma własne auta i karty — nic nie jest dzielone między scenami.
    expect(await built.prisma.vehicle.count({ where: { campaignId } })).toBe(6);
    expect(await built.prisma.character.count({ where: { campaignId } })).toBe(10);
  });

  it('auto w rezerwie (66c): gracz nie widzi ani auta, ani załogi; załoga poza walką do „Przywróć”', async () => {
    const result = data(
      await emitAck<SceneTemplateCreateResult>(gm, 'scene:from-template', {
        templateId: 'test-poscig',
      }),
      'from-template 3',
    );
    const sceneId = result.sceneId;
    const reserve = await built.prisma.sceneVehicle.findFirstOrThrow({
      where: { sceneId, status: 'behind' },
    });
    const crew = await built.prisma.token.findFirstOrThrow({
      where: { sceneId, sceneVehicleId: reserve.id },
    });
    expect(crew.name).toBe('Gwint');

    expect((await emitAck(gm, 'scene:activate', { sceneId })).ok).toBe(true);
    const { socket: player, sync } = await connectWithSync(playerCookie);
    expect(sync.scene?.id).toBe(sceneId);
    expect(sync.sceneVehicles.map((row) => row.id)).not.toContain(reserve.id);
    expect(sync.tokens.map((row) => row.name).sort()).toEqual(
      ['Bolec', 'Rdza', 'Szczęka', 'Zakładnik'].sort(),
    );
    // MG widzi wszystko.
    const { sync: gmSync } = await connectWithSync(gmCookie);
    expect(gmSync.tokens.map((row) => row.id)).toContain(crew.id);

    // „Wszystkie figury na scenie” — załoga rezerwy zostaje poza kolejką.
    const everyone = await built.prisma.token.findMany({ where: { sceneId } });
    const combat = data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId,
        tokenIds: everyone.map((row) => row.id),
      }),
      'combat:start',
    );
    expect(combat.combatants.map((row) => row.tokenId)).not.toContain(crew.id);
    expect(combat.combatants).toHaveLength(4);

    // „Przywróć do pościgu” wprowadza auto i załogę na mapę gracza.
    const shown = waitForMatch<TokenSyncBroadcast>(player, 'token:sync', (payload) =>
      payload.tokens.some((row) => row.id === crew.id),
    );
    const back = data(
      await emitAck<SceneVehicleView>(gm, 'chase:restore', { sceneVehicleId: reserve.id }),
      'chase:restore',
    );
    expect(back.status).toBe('racing');
    expect((await shown).tokens.find((row) => row.id === crew.id)?.name).toBe('Gwint');
  });
});

describe('etap 66c: „Ostatni zjazd”', () => {
  it('staje na Neonowej ulicy bez braków: cztery auta, osiem NPC-ów, Rydwan w rezerwie, drużyna bez figur', async () => {
    const gm = await connect(gmCookie);
    const list = data(await emitAck<SceneTemplateSummary[]>(gm, 'scene:templates'), 'templates');
    expect(list.find((row) => row.id === 'ostatni-zjazd')).toMatchObject({
      name: 'Ostatni zjazd',
      kind: 'chase',
      backgroundUrl: '/art/roads/neon-street.webp',
      vehicles: 4,
      figures: 8,
    });
    const result = data(
      await emitAck<SceneTemplateCreateResult>(gm, 'scene:from-template', {
        templateId: 'ostatni-zjazd',
      }),
      'from-template',
    );
    expect(result.missing).toEqual([]);

    const scene = await built.prisma.scene.findUniqueOrThrow({ where: { id: result.sceneId } });
    expect(scene).toMatchObject({
      kind: 'chase',
      backgroundUrl: '/art/roads/neon-street.webp',
      backgroundWidth: 3500,
      backgroundHeight: 2400,
      width: 3500,
      height: 2400,
      gridSizePx: 100,
      chaseDirection: 'left',
      chaseTempo: 40,
      chaseRunning: true,
      chaseRoadFrom: 6,
      chaseRoadTo: 18,
      spawnX: 3300,
      spawnY: 1600,
    });

    const placed = await built.prisma.sceneVehicle.findMany({
      where: { sceneId: scene.id },
      include: { vehicle: true },
    });
    const byName = new Map(placed.map((row) => [row.vehicle.name, row]));
    expect([...byName.keys()].sort()).toEqual(
      ['Eskorta', 'Furgon Halcyonu', 'Rydwan', 'Wóz od Matyldy'].sort(),
    );
    const van = byName.get('Furgon Halcyonu')!;
    // Furgon to model MG (06.11): sześć foteli w rzędach furgonu, grafika Militechu.
    expect(van.vehicle).toMatchObject({
      layout: 'van-6',
      widthSq: 3,
      lengthSq: 7,
      imageUrl: '/art/vehicles/militech-furgon.webp',
    });
    expect(readCpredVehicle(van.vehicle.system)).toMatchObject({
      catalogId: 'vehicle.militech-furgon',
      seats: 6,
      van: true,
    });
    expect(readCpredVehicle(van.vehicle.system).upgrades.map((row) => row.upgradeId)).toEqual([
      'reinforced',
      'armoredHull',
      'bulletproofGlass',
      'nitro',
    ]);
    expect(byName.get('Rydwan')!.status).toBe('behind');
    expect(
      placed
        .filter((row) => row.status === 'racing')
        .map((row) => row.vehicle.name)
        .sort(),
    ).toEqual(['Eskorta', 'Furgon Halcyonu', 'Wóz od Matyldy'].sort());
    // Furgon z przodu (jazda w lewo), Wóz drużyny z tyłu.
    expect(van.x).toBeLessThan(byName.get('Eskorta')!.x);
    expect(byName.get('Eskorta')!.x).toBeLessThan(byName.get('Wóz od Matyldy')!.x);

    const tokens = await built.prisma.token.findMany({ where: { sceneId: scene.id } });
    expect(tokens).toHaveLength(8);
    // Drużyna siada sama — w Wozie od Matyldy nie ma nikogo.
    expect(tokens.some((row) => row.sceneVehicleId === byName.get('Wóz od Matyldy')!.id)).toBe(
      false,
    );
    const seats = Object.fromEntries(
      tokens.map((row) => [
        row.name,
        [placed.find((car) => car.id === row.sceneVehicleId)?.vehicle.name, row.vehicleSeat],
      ]),
    );
    expect(seats).toEqual({
      Wolt: ['Furgon Halcyonu', 0],
      Kłoda: ['Furgon Halcyonu', 4],
      Iskra: ['Furgon Halcyonu', 5],
      Mewa: ['Eskorta', 0],
      Szron: ['Eskorta', 1],
      Lutka: ['Eskorta', 3],
      Grot: ['Rydwan', 0],
      Kabel: ['Rydwan', 1],
    });
    const iskra = tokens.find((row) => row.name === 'Iskra')!;
    expect(iskra.disposition).toBe('neutral');
    expect(JSON.parse(iskra.statuses)).toEqual(['unconscious']);
    expect(await built.prisma.mapNote.count({ where: { sceneId: scene.id } })).toBe(5);
  });
});

describe('etap 66d: „Zastaw”', () => {
  it('staje na Neonowej ulicy bez braków: kombi, furgon Militechu, radiowóz w rezerwie, Śrubka skrępowany', async () => {
    const gm = await connect(gmCookie);
    const list = data(await emitAck<SceneTemplateSummary[]>(gm, 'scene:templates'), 'templates');
    expect(list.find((row) => row.id === 'zastaw')).toMatchObject({
      name: 'Zastaw',
      kind: 'chase',
      backgroundUrl: '/art/roads/neon-street.webp',
      vehicles: 3,
      figures: 5,
    });
    const result = data(
      await emitAck<SceneTemplateCreateResult>(gm, 'scene:from-template', {
        templateId: 'zastaw',
      }),
      'from-template',
    );
    expect(result.missing).toEqual([]);

    const scene = await built.prisma.scene.findUniqueOrThrow({ where: { id: result.sceneId } });
    expect(scene).toMatchObject({
      kind: 'chase',
      backgroundUrl: '/art/roads/neon-street.webp',
      chaseDirection: 'left',
      chaseTempo: 40,
      chaseRunning: true,
      chaseRoadFrom: 6,
      chaseRoadTo: 18,
      spawnX: 2600,
      spawnY: 1600,
    });

    const placed = await built.prisma.sceneVehicle.findMany({
      where: { sceneId: scene.id },
      include: { vehicle: true },
    });
    const byName = new Map(placed.map((row) => [row.vehicle.name, row]));
    expect([...byName.keys()].sort()).toEqual(
      ['Furgon Militechu', 'Kombi drużyny', 'Radiowóz NCPD'].sort(),
    );
    const van = byName.get('Furgon Militechu')!;
    expect(van.vehicle).toMatchObject({
      layout: 'van-6',
      imageUrl: '/art/vehicles/militech-furgon.webp',
    });
    expect(readCpredVehicle(van.vehicle.system).upgrades.map((row) => row.upgradeId)).toEqual([
      'armoredHull',
      'bulletproofGlass',
      'nitro',
    ]);
    const party = byName.get('Kombi drużyny')!;
    expect(readCpredVehicle(party.vehicle.system)).toMatchObject({ catalogId: 'vehicle.wloczega' });
    expect(readCpredVehicle(party.vehicle.system).upgrades.map((row) => row.upgradeId)).toEqual([
      'ram',
      'nitro',
    ]);
    expect(byName.get('Radiowóz NCPD')!.status).toBe('behind');
    // Furgon z przodu (jazda w lewo), kombi drużyny za nim, radiowóz za kadrem z tyłu.
    expect(van.x).toBeLessThan(party.x);
    expect(party.x).toBeLessThan(byName.get('Radiowóz NCPD')!.x);

    const tokens = await built.prisma.token.findMany({ where: { sceneId: scene.id } });
    expect(tokens).toHaveLength(5);
    expect(tokens.some((row) => row.sceneVehicleId === party.id)).toBe(false);
    const seats = Object.fromEntries(
      tokens.map((row) => [
        row.name,
        [placed.find((car) => car.id === row.sceneVehicleId)?.vehicle.name, row.vehicleSeat],
      ]),
    );
    expect(seats).toEqual({
      Brzoza: ['Furgon Militechu', 0],
      Hak: ['Furgon Militechu', 1],
      Śrubka: ['Furgon Militechu', 5],
      Wronka: ['Radiowóz NCPD', 0],
      Lis: ['Radiowóz NCPD', 1],
    });
    const boy = tokens.find((row) => row.name === 'Śrubka')!;
    expect(boy.disposition).toBe('neutral');
    expect(JSON.parse(boy.statuses)).toEqual(['immobilized']);
    expect(await built.prisma.mapNote.count({ where: { sceneId: scene.id } })).toBe(5);
  });
});

describe('etap 66b: wzorzec zwykłej mapy — „Fabryka dronów”', () => {
  it('staje ciemna, ze ścianami, osłonami, urządzeniami, gniazdami i Siecią z uśpionymi dronami', async () => {
    const gm = await connect(gmCookie);
    const list = data(await emitAck<SceneTemplateSummary[]>(gm, 'scene:templates'), 'templates');
    expect(list.find((row) => row.id === 'fabryka-dronow')).toMatchObject({
      kind: 'map',
      vehicles: 0,
      figures: 19,
    });
    const result = data(
      await emitAck<SceneTemplateCreateResult>(gm, 'scene:from-template', {
        templateId: 'fabryka-dronow',
      }),
      'from-template',
    );
    // Próbka ma alternatywę dla broni dronów i Czarnego LOD-u.
    expect(result.missing).toEqual([]);

    const scene = await built.prisma.scene.findUniqueOrThrow({ where: { id: result.sceneId } });
    expect(scene).toMatchObject({
      kind: 'map',
      visibility: 'dynamic',
      dark: true,
      darkSightM: 4,
      explore: true,
      partySight: false,
      playerMove: 'explore',
      metersPerSquare: 2,
    });

    const walls = await built.prisma.wall.findMany({ where: { sceneId: scene.id } });
    expect(walls).toHaveLength(82);
    const doors = walls.filter((wall) => wall.kind === 'door');
    expect(doors).toHaveLength(4);
    expect(doors.filter((door) => door.locked)).toHaveLength(1);
    expect(walls.filter((wall) => wall.kind === 'barrier').every((wall) => wall.armor === 10)).toBe(
      true,
    );
    expect(await built.prisma.cover.count({ where: { sceneId: scene.id } })).toBe(10);

    const tokens = await built.prisma.token.findMany({
      where: { sceneId: scene.id },
      include: { character: true },
    });
    expect(tokens).toHaveLength(19);
    expect(tokens.filter((token) => token.glyph === 'camera')).toHaveLength(4);
    const camera = tokens.find((token) => token.name === 'Kamera lądowisk')!;
    expect(camera).toMatchObject({ facing: 90, visionRange: 60, disposition: 'neutral' });
    // Środek kratki ze wzorca to środek figury: lewy górny róg o pół kratki wcześniej.
    expect(camera.x + scene.gridSizePx / 2).toBeCloseTo(880, 0);

    const prototype = tokens.find((token) => token.name === 'Prototyp „Sowa”')!;
    const sheet = JSON.parse(prototype.character!.data) as CpredCharacterData;
    expect(sheet.gear.map((row) => row.name)).toContain('Drzazga z danymi „Sowa”');
    expect(sheet.statBlock).toMatchObject({ combatValue: 14, hpMax: 30 });
    expect(sheet.weapons.map((row) => row.name)).toContain('Zardzewiak');

    const points = await built.prisma.netAccessPoint.findMany({ where: { sceneId: scene.id } });
    expect(points).toHaveLength(5);
    expect(points.every((point) => point.hidden && point.architectureId)).toBe(true);
    const architecture = await built.prisma.netArchitecture.findUniqueOrThrow({
      where: { id: points[0]!.architectureId! },
    });
    expect(architecture).toMatchObject({ campaignId, name: 'Sieć fabryki dronów' });
    const floors = (JSON.parse(architecture.data) as { branches: { floors: unknown[] }[] })
      .branches[0]!.floors as {
      kind: string;
      devices?: { tokenId: string }[];
      programIds?: string[];
    }[];
    expect(floors).toHaveLength(8);
    const tokenIds = new Set(tokens.map((token) => token.id));
    const wired = floors.flatMap((floor) => floor.devices ?? []);
    expect(wired).toHaveLength(19);
    expect(wired.every((device) => tokenIds.has(device.tokenId))).toBe(true);
    expect(floors.find((floor) => floor.kind === 'ice')!.programIds).toEqual(['program.osa']);
    const runtime = JSON.parse(architecture.runtime) as { devices: { on: boolean }[] };
    expect(runtime.devices.filter((device) => !device.on)).toHaveLength(11);
  });
});

describe('etap 66e: „Po zamknięciu” — światła, zamki, strefa w Sieci, pojemnik z kluczem', () => {
  it('staje na próbce bez braków, a gracz nie dostaje ukrytych kamer, strefy ani notatek', async () => {
    const gm = await connect(gmCookie);
    const result = data(
      await emitAck<SceneTemplateCreateResult>(gm, 'scene:from-template', {
        templateId: 'po-zamknieciu',
      }),
      'from-template',
    );
    // Próbka ma alternatywy: strzelbę, pistolety, PM, kurtkę i wymyśloną podłogę.
    expect(result.missing).toEqual([]);
    const sceneId = result.sceneId;
    const scene = await built.prisma.scene.findUniqueOrThrow({ where: { id: sceneId } });
    expect(scene).toMatchObject({ dark: true, darkSightM: 4, playerMove: 'explore' });

    // Ściany ze sceny MG (32 ściany, 11 drzwi, okno, 2 bramy) + drzwi z kuchni na salę; cztery zamki.
    const walls = await built.prisma.wall.findMany({ where: { sceneId } });
    expect(walls).toHaveLength(47);
    const locked = walls.filter((wall) => wall.locked);
    expect(locked).toHaveLength(4);
    expect(locked.map((wall) => (JSON.parse(wall.lockRule!) as { dv: number }).dv).sort()).toEqual([
      13, 13, 15, 17,
    ]);
    expect(await built.prisma.mapLight.count({ where: { sceneId } })).toBe(5);
    expect(await built.prisma.cover.count({ where: { sceneId } })).toBe(6);

    const tokens = await built.prisma.token.findMany({
      where: { sceneId },
      include: { character: true },
    });
    expect(tokens).toHaveLength(10);
    const cameras = tokens.filter((token) => token.glyph === 'camera');
    expect(cameras).toHaveLength(5);
    expect(cameras.every((token) => token.hidden)).toBe(true);
    const sheetOf = (name: string) =>
      JSON.parse(
        tokens.find((token) => token.name === name)!.character!.data,
      ) as CpredCharacterData;
    expect(sheetOf('Bogdan „Kucharz” Rataj').eddies).toBe(300);

    // Szafka: zamknięta na zamek PT 13, klucz w plecaku Małego, PM i 200 ed w środku.
    const szafka = sheetOf('Szafka ochrony');
    expect(szafka.container).toMatchObject({ lock: 'locked', dv: 13 });
    expect(szafka.container!.keyId).toBeTruthy();
    expect(szafka.weapons.map((row) => row.name)).toEqual(['Zardzewiak']);
    expect(szafka.eddies).toBe(200);
    const key = sheetOf('Ochroniarz „Mały”').gear.find((row) => row.key);
    expect(key).toMatchObject({ name: 'Klucz: Szafka ochrony', key: szafka.container!.keyId });

    // Sieć: węzeł zabezpieczeń trzyma wieżyczkę, podłogę i drzwi gabinetu.
    const points = await built.prisma.netAccessPoint.findMany({ where: { sceneId } });
    expect(points).toHaveLength(2);
    const architecture = await built.prisma.netArchitecture.findUniqueOrThrow({
      where: { id: points[0]!.architectureId! },
    });
    const floors = (
      JSON.parse(architecture.data) as {
        branches: {
          floors: {
            id: string;
            devices?: { id: string; deviceKind: string; tokenId?: string; wallId?: number }[];
          }[];
        }[];
      }
    ).branches[0]!.floors;
    expect(floors).toHaveLength(4);
    expect(floors[1]!.devices).toHaveLength(5);
    const security = floors[2]!.devices!;
    expect(security.map((device) => device.deviceKind)).toEqual(['turret', 'environment', 'door']);
    const office = walls.find((wall) => wall.id === security[2]!.wallId)!;
    expect(office).toMatchObject({ kind: 'door', locked: true });
    expect((JSON.parse(office.lockRule!) as { dv: number }).dv).toBe(17);

    const [zone] = await built.prisma.defenseZone.findMany({ where: { sceneId } });
    expect(zone).toMatchObject({
      entryId: 'defense.iskrownik',
      name: 'Podłoga elektryczna',
      hidden: true,
      armed: true,
      hpMax: 20,
      architectureId: architecture.id,
      floorId: floors[2]!.id,
      deviceId: security[1]!.id,
    });
    expect(zone!.width).toBeCloseTo(4 * scene.gridSizePx, 3);

    // Kanarek: gracz na aktywnej scenie nie dostaje ukrytych kamer, strefy,
    // zamków ani notatek MG.
    const player = await connect(playerCookie);
    const activated = waitForMatch(player, 'scene:activate', () => true);
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;
    const { sync } = await connectWithSync(playerCookie);
    expect(sync.scene?.id).toBe(sceneId);
    const seen = JSON.stringify(sync);
    for (const secret of ['Kamera — gabinet', 'Podłoga elektryczna', 'PO ZAMKNIĘCIU', 'lockRule']) {
      expect(seen.includes(secret), secret).toBe(false);
    }
    expect(sync.notes).toEqual([]);
  });
});
