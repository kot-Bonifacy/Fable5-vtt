import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  SceneTemplateCreateResult,
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
      vehicles: 2,
      figures: 3,
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
    // Próbka z `data/public` ma alternatywę dla każdego wpisu wzorca.
    expect(result.missing).toEqual([]);

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
    expect(placed).toHaveLength(2);
    const taxi = placed.find((row) => row.vehicle.name === 'Kradziona taksówka')!;
    const pickup = placed.find((row) => row.vehicle.name === 'Pickup Maelstromu')!;
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

    const tokens = await built.prisma.token.findMany({
      where: { sceneId: scene.id },
      include: { character: true },
      orderBy: { vehicleSeat: 'asc' },
    });
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
    expect(await built.prisma.vehicle.count({ where: { campaignId } })).toBe(4);
    expect(await built.prisma.character.count({ where: { campaignId } })).toBe(6);
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
