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
  CompendiumEntry,
  DefenseZoneView,
  NetRunAbilityResult,
  WallView,
  NetAccessPointView,
  NetArchitectureView,
  NetRunPayload,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';

/**
 * Sieć ze sceny (etap 62, zlecenie MG z 28.10) na żywych gniazdach.
 *
 * W grze netrunner 1. poziomu podłączył się w „restauracji Mariana” i nie
 * zobaczył żadnej kamery: MG postawił je na mapie, ale nie wpisał w węzeł
 * Architektury, a gniazdo nie miało Architektury wcale. Teraz figura z ikoną
 * urządzenia sama jest urządzeniem Sieci, a netrunner widzi jej nazwę i rodzaj
 * od podłączenia.
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

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 4000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolve(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

function data<T>(ack: SocketAck<T>, what: string): T {
  if (!ack.ok) throw new Error(`${what} failed: ${ack.error}`);
  if (ack.data === undefined) throw new Error(`${what} returned no data`);
  return ack.data;
}

function waitFor<T>(socket: ClientSocket, event: string, ms = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function roundTrip(socket: ClientSocket): Promise<StateSyncPayload> {
  const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
  await emitAck(socket, 'state:request');
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
    payload: { name: 'Kampania restauracji' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  // Etap 44b: linki są imienne — wystawia je `joinUrl` przy każdym wejściu.
  const invite = campaignId;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, invite, 'Kolec'),
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
    // Windows may still hold the file; nothing to clean up.
  }
});

describe('Sieć ze sceny (etap 62)', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let tokenId: string;
  let cameraId: string;
  let turretId: string;
  let netrunnerId: string;
  let firstRun: NetRunPayload;

  async function architectures(): Promise<{ id: string; name: string }[]> {
    return data(
      await emitAck<{ architectures: { id: string; name: string }[] }>(gm, 'net:list'),
      'net:list',
    ).architectures;
  }

  async function architecture(id: string): Promise<NetArchitectureView> {
    return data(await emitAck<NetArchitectureView>(gm, 'net:get', { id }), 'net:get');
  }

  const nodeDevices = (view: NetArchitectureView) =>
    view.architecture.branches
      .flatMap((branch) => branch.floors)
      .filter((floor) => floor.kind === 'controlNode')
      .map((floor) => (floor.devices ?? []).map((device) => device.tokenId));

  it('gniazdo bez Architektury: podłączenie składa Sieć z urządzeń sceny', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const netrunner = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Iskra', ownerId: playerId }),
      'character:create',
    );
    netrunnerId = netrunner.id;
    // Netrunner 1. poziomu: Interfejs 2 i dek ze startu, bez Programów.
    await emitAck(gm, 'character:update', {
      characterId: netrunner.id,
      patch: {
        data: {
          roleId: 'netrunner',
          roleAbilityRank: 2,
          cyberdeck: { name: 'Cyberdek zwykłej jakości', slots: 7, installed: [] },
        },
      },
    });

    sceneId = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'restauracja Mariana' }),
      'scene',
    ).id;
    await emitAck(gm, 'scene:update', {
      sceneId,
      patch: { width: 2000, height: 2000, grid: { sizePx: 100 }, metersPerSquare: 2 },
    });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    tokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Iskra',
        x: 0,
        y: 0,
        ownerId: playerId,
        characterId: netrunner.id,
      }),
      'token:create',
    ).id;
    // Kamera na warstwie MG: gracz nie zna jej nazwy, więc widzi sam rodzaj.
    cameraId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kamera nad barem',
        x: 1400,
        y: 1400,
        glyph: 'camera',
        hidden: true,
      }),
      'token:create',
    ).id;
    turretId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Wieżyczka',
        x: 1600,
        y: 1400,
        glyph: 'turret',
      }),
      'token:create',
    ).id;
    await emitAck(gm, 'token:create', { sceneId, name: 'Mina', x: 900, y: 900, glyph: 'mine' });
    await emitAck(gm, 'token:create', { sceneId, name: 'Marian', x: 800, y: 800 });

    const point = data(
      await emitAck<NetAccessPointView>(gm, 'netpoint:place', {
        sceneId,
        x: 50,
        y: 50,
        name: 'Gniazdo przy kasie',
        architectureId: null,
        hidden: false,
      }),
      'netpoint:place',
    );
    expect(point.architectureId).toBeNull();

    firstRun = data(
      await emitAck<NetRunPayload>(player, 'netrun:start', { tokenId, accessPointId: point.id }),
      'netrun:start',
    );

    const scene = (await architectures()).find(
      (entry) => entry.name === 'Sieć: restauracja Mariana',
    );
    expect(scene?.id).toBe(firstRun.run.architectureId);
    // Etap 70d: węzły wg rodzaju — kamera w „Monitoringu”, wieżyczka w „Obronie”.
    expect(nodeDevices(await architecture(scene!.id))).toEqual([[cameraId], [turretId]]);
    expect(firstRun.run.architectureName).toBeUndefined();
  });

  it('od podłączenia okno nie mówi o urządzeniach nic (70a, decyzja MG nr 2 z 11.11)', () => {
    expect(firstRun.run.nodeDevices).toBeUndefined();
    expect(firstRun.run.exits.down).toEqual([
      { to: { branchId: 'trunk', floor: 1 }, knowledge: 'unknown' },
    ]);
    const wire = JSON.stringify(firstRun);
    expect(wire).not.toContain('Wieżyczka');
    expect(wire).not.toContain('Kamera');
    expect(wire).not.toContain(cameraId);
  });

  it('na piętrze węzła, przed Kontrolą: nazwa i rodzaj; mina i ludzie są poza Siecią', async () => {
    const onNode = data(
      await emitAck<NetRunPayload>(player, 'netrun:move', {
        runId: firstRun.runId,
        to: { branchId: 'trunk', floor: 1 },
      }),
      'netrun:move',
    );
    // Piętro 1 to „Monitoring” (70d) — wieżyczka stoi w „Obronie” niżej.
    expect(onNode.run.here?.label).toBe('Monitoring');
    expect(onNode.run.nodeDevices).toEqual([{ name: 'Kamera', deviceKind: 'camera' }]);
    // Bez przycisków i bez miejsca kamery na mapie — to daje dopiero Kontrola.
    expect(onNode.run.here?.devices).toBeUndefined();
    expect(JSON.stringify(onNode)).not.toContain('Kamera nad barem');
    expect(JSON.stringify(onNode)).not.toContain(cameraId);
    // MG nie potrzebuje skrótu: ma pełną listę na piętrze planu.
    const gmRun = (await roundTrip(gm)).netRuns.find((run) => run.runId === firstRun.runId)!;
    expect(gmRun.run.nodeDevices).toBeUndefined();
    expect(gmRun.run.here?.devices).toHaveLength(1);
  });

  it('gniazdo zostaje podpięte do złożonej Sieci', async () => {
    const sync = await roundTrip(gm);
    const point = sync.accessPoints.find((entry) => entry.name === 'Gniazdo przy kasie');
    expect(point?.architectureId).toBe(firstRun.run.architectureId);
  });

  it('Architektura MG: nowa figura dochodzi do pierwszego węzła, podpięta gdzie indziej nie', async () => {
    await emitAck(player, 'netrun:leave', { runId: firstRun.runId });
    const droneId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Dron ochrony',
        x: 1200,
        y: 200,
        glyph: 'drone',
      }),
      'token:create',
    ).id;
    const ownId = data(
      await emitAck<NetArchitectureView>(gm, 'net:save', {
        architecture: {
          name: 'Zaplecze',
          difficulty: 'standard',
          branches: [
            {
              id: 'trunk',
              parentFloor: null,
              floors: [
                // Węzeł na wejściu: lista urządzeń przychodzi dopiero na piętrze
                // węzła (70a), a ten test jest o dopinaniu figur, nie o haśle.
                { id: 'f0', kind: 'controlNode', label: 'Węzeł zaplecza', dv: 10, devices: [] },
                { id: 'f1', kind: 'password', label: 'Hasło', dv: 6 },
              ],
            },
          ],
        },
      }),
      'net:save',
    ).id;
    const point = data(
      await emitAck<NetAccessPointView>(gm, 'netpoint:place', {
        sceneId,
        x: 60,
        y: 60,
        name: 'Gniazdo na zapleczu',
        architectureId: ownId,
        hidden: false,
      }),
      'netpoint:place',
    );
    const run = data(
      await emitAck<NetRunPayload>(player, 'netrun:start', { tokenId, accessPointId: point.id }),
      'netrun:start',
    );
    expect(nodeDevices(await architecture(ownId))).toEqual([[droneId]]);
    expect(run.run.nodeDevices).toEqual([{ name: 'Dron ochrony', deviceKind: 'drone' }]);
  });

  it('kamera postawiona w trakcie runu dochodzi od razu, bez ponownego podłączenia (29.10)', async () => {
    const owned = (await architectures()).find((entry) => entry.name === 'Zaplecze')!;
    const synced = new Promise<NetRunPayload[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('netrun:sync timeout')), 4000);
      const onSync = ({ runs }: { runs: NetRunPayload[] }) => {
        if (!runs.some((run) => run.run.nodeDevices?.some((d) => d.deviceKind === 'camera')))
          return;
        clearTimeout(timer);
        player.off('netrun:sync', onSync);
        resolve(runs);
      };
      player.on('netrun:sync', onSync);
    });
    const lateCamera = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kamera w magazynie',
        x: 1000,
        y: 1600,
        glyph: 'camera',
      }),
      'token:create',
    ).id;
    expect(nodeDevices(await architecture(owned.id))[0]).toContain(lateCamera);
    const runs = await synced;
    expect(runs[0]!.run.nodeDevices).toContainEqual({
      name: 'Kamera w magazynie',
      deviceKind: 'camera',
    });

    // Ikona nadana zwykłej figurze w trakcie runu działa tak samo.
    const plain = data(
      await emitAck<TokenView>(gm, 'token:create', { sceneId, name: 'Czujnik', x: 600, y: 600 }),
      'token:create',
    ).id;
    expect(nodeDevices(await architecture(owned.id))[0]).not.toContain(plain);
    await emitAck(gm, 'token:update', { tokenId: plain, patch: { glyph: 'sensor' } });
    expect(nodeDevices(await architecture(owned.id))[0]).toContain(plain);
  });

  // ─────────────── etap 70d: węzły wg rodzaju, strefy i drzwi ───────────────

  describe('węzły wg rodzaju, strefy i drzwi (70d)', () => {
    let hallId: string;
    let runnerId: string;
    let hallCamera: string;
    let hallTurret: string;
    let floorZone: DefenseZoneView;
    let quietZone: DefenseZoneView;
    let doorId: number;
    let run: NetRunPayload;

    const floorsOf = (view: NetArchitectureView) => view.architecture.branches[0]!.floors;

    it('scena z kamerą, wieżyczką, podłogą i drzwiami składa trzy węzły, a strefa się wiąże', async () => {
      await emitAck(player, 'netrun:leave', {
        runId: (await roundTrip(player)).netRuns[0]?.runId ?? '',
      });
      data(
        await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
          entry: {
            category: 'netDefense',
            name: 'Podłoga elektryczna',
            cost: 1000,
            defenseKind: 'environment',
            disableDv: 13,
            hp: 20,
            spotDv: 17,
            trigger: 'Cel wchodzi na zelektryfikowany obszar.',
            effects: { damage: '6k6', noAblation: true, repeats: true },
          },
        }),
        'compendium:upsert (podłoga)',
      );
      hallId = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Hala' }), 'scene').id;
      await emitAck(gm, 'scene:update', {
        sceneId: hallId,
        patch: { width: 2000, height: 2000, grid: { sizePx: 100 }, metersPerSquare: 2 },
      });
      const activated = waitFor(player, 'scene:activate');
      await emitAck(gm, 'scene:activate', { sceneId: hallId });
      await activated;
      await emitAck(gm, 'scene:view', { sceneId: hallId });
      runnerId = data(
        await emitAck<TokenView>(gm, 'token:create', {
          sceneId: hallId,
          name: 'Iskra',
          x: 0,
          y: 0,
          ownerId: playerId,
          characterId: netrunnerId,
        }),
        'token:create',
      ).id;
      hallCamera = data(
        await emitAck<TokenView>(gm, 'token:create', {
          sceneId: hallId,
          name: 'Kamera hali',
          x: 1400,
          y: 200,
          glyph: 'camera',
        }),
        'token:create',
      ).id;
      hallTurret = data(
        await emitAck<TokenView>(gm, 'token:create', {
          sceneId: hallId,
          name: 'Wieżyczka hali',
          x: 1600,
          y: 200,
          glyph: 'turret',
        }),
        'token:create',
      ).id;
      floorZone = data(
        await emitAck<DefenseZoneView>(gm, 'zone:create', {
          sceneId: hallId,
          entryId: 'defense.podloga-elektryczna',
          x: 400,
          y: 0,
          width: 200,
          height: 200,
          hidden: false,
        }),
        'zone:create',
      );
      quietZone = data(
        await emitAck<DefenseZoneView>(gm, 'zone:create', {
          sceneId: hallId,
          entryId: 'defense.podloga-elektryczna',
          name: 'Podłoga w składzie',
          x: 400,
          y: 800,
          width: 200,
          height: 200,
        }),
        'zone:create',
      );
      await emitAck(gm, 'zone:update', { zoneId: quietZone.id, patch: { netExcluded: true } });
      const [door] = data(
        await emitAck<WallView[]>(gm, 'wall:create', {
          sceneId: hallId,
          points: [
            { x: 1000, y: 0 },
            { x: 1000, y: 100 },
          ],
          kind: 'door',
        }),
        'wall:create',
      );
      doorId = door!.id;
      const flagged = data(
        await emitAck<WallView>(gm, 'wall:update', {
          wallId: doorId,
          patch: { netControlled: true },
        }),
        'wall:update',
      );
      expect(flagged.netControlled).toBe(true);
      // Zwykła ściana nie jest urządzeniem — przełącznik nic na niej nie zapisze.
      const [plain] = data(
        await emitAck<WallView[]>(gm, 'wall:create', {
          sceneId: hallId,
          points: [
            { x: 1200, y: 0 },
            { x: 1200, y: 100 },
          ],
          kind: 'wall',
        }),
        'wall:create',
      );
      const ignored = data(
        await emitAck<WallView>(gm, 'wall:update', {
          wallId: plain!.id,
          patch: { netControlled: true },
        }),
        'wall:update',
      );
      expect(ignored.netControlled).toBeUndefined();

      const point = data(
        await emitAck<NetAccessPointView>(gm, 'netpoint:place', {
          sceneId: hallId,
          x: 50,
          y: 50,
          name: 'Gniazdo hali',
          architectureId: null,
          hidden: false,
        }),
        'netpoint:place',
      );
      run = data(
        await emitAck<NetRunPayload>(player, 'netrun:start', {
          tokenId: runnerId,
          accessPointId: point.id,
        }),
        'netrun:start',
      );
      const built = await architecture(run.run.architectureId);
      const floors = floorsOf(built);
      expect(floors.map((floor) => floor.label)).toEqual([
        'Wejście',
        'Monitoring',
        'Obrona',
        'Instalacje',
      ]);
      expect(floors[1]!.devices?.map((device) => device.tokenId)).toEqual([hallCamera]);
      expect(floors[2]!.devices?.map((device) => device.tokenId)).toEqual([hallTurret]);
      // Podłoga i drzwi w „Instalacjach”; strefa „Poza Siecią” — nie.
      expect(floors[3]!.devices).toEqual([
        { id: `zone-${floorZone.id}`, name: 'Podłoga elektryczna', deviceKind: 'environment' },
        { id: `wall-${doorId}`, name: 'Drzwi', deviceKind: 'door', wallId: doorId },
      ]);
      const zones = (await roundTrip(gm)).zones;
      expect(zones.find((zone) => zone.id === floorZone.id)).toMatchObject({
        architectureId: run.run.architectureId,
        floorId: floors[3]!.id,
        deviceId: `zone-${floorZone.id}`,
      });
      expect(zones.find((zone) => zone.id === quietZone.id)?.deviceId).toBeUndefined();
    });

    it('gracz nie dostaje „Sterowane z Sieci” ani „Poza Siecią”', async () => {
      await emitAck(gm, 'wall:update', { wallId: doorId, patch: { playerToggle: true } });
      const sync = await roundTrip(player);
      // Gracz dostaje otwory polem `openings` (`playerOpeningView`), ścian wcale.
      const door = sync.openings.find((wall) => wall.id === doorId);
      expect(door).toBeDefined();
      expect(door?.netControlled).toBeUndefined();
      expect(JSON.stringify(sync.zones)).not.toContain('netExcluded');
      expect(JSON.stringify(sync.zones)).not.toContain(`zone-${floorZone.id}`);
    });

    it('po Kontroli „Instalacji” urządzenie strefy niesie jej numer, a „Wyłącz” ją rozbraja', async () => {
      // PT węzła ze sceny to 8 — test nie gra o kość, więc MG zbija go do 1.
      const built = await architecture(run.run.architectureId);
      const easy = {
        ...built.architecture,
        branches: built.architecture.branches.map((branch) => ({
          ...branch,
          floors: branch.floors.map((floor) =>
            floor.kind === 'controlNode' ? { ...floor, dv: 1 } : floor,
          ),
        })),
      };
      data(
        await emitAck(gm, 'net:save', { id: run.run.architectureId, architecture: easy }),
        'net:save',
      );
      for (const floor of [1, 2, 3]) {
        data(
          await emitAck<NetRunPayload>(player, 'netrun:move', {
            runId: run.runId,
            to: { branchId: 'trunk', floor },
          }),
          'netrun:move',
        );
      }
      const result = data(
        await emitAck<NetRunAbilityResult>(player, 'netrun:ability', {
          runId: run.runId,
          ability: 'control',
        }),
        'netrun:ability',
      );
      expect(result.success).toBe(true);
      const held = (await roundTrip(player)).netRuns.find((entry) => entry.runId === run.runId)!;
      const devices = held.run.here?.devices ?? [];
      const switchable = devices.find((device) => device.zoneId === floorZone.id);
      expect(switchable).toMatchObject({ id: `zone-${floorZone.id}`, on: true });
      expect(devices.find((device) => device.wallId === doorId)?.zoneId).toBeUndefined();

      data(
        await emitAck<NetRunAbilityResult>(player, 'netrun:device', {
          runId: run.runId,
          floorId: held.run.here!.id,
          deviceId: switchable!.id,
          operation: 'off',
        }),
        'netrun:device (off)',
      );
      const after = (await roundTrip(player)).netRuns.find((entry) => entry.runId === run.runId)!;
      expect(after.run.here?.devices?.find((d) => d.zoneId === floorZone.id)?.on).toBe(false);

      // Drzwi otwiera ten sam węzeł — bez rygla w drodze (s. 199).
      data(
        await emitAck<NetRunAbilityResult>(player, 'netrun:device', {
          runId: run.runId,
          floorId: held.run.here!.id,
          deviceId: `wall-${doorId}`,
          operation: 'open',
        }),
        'netrun:device (open)',
      );
      expect((await roundTrip(gm)).walls.find((wall) => wall.id === doorId)?.open).toBe(true);
    });

    it('nowa strefa i nowe drzwi „Sterowane z Sieci” dochodzą do „Instalacji” w trakcie runu', async () => {
      const late = data(
        await emitAck<DefenseZoneView>(gm, 'zone:create', {
          sceneId: hallId,
          entryId: 'defense.podloga-elektryczna',
          name: 'Podłoga przy windzie',
          x: 800,
          y: 800,
          width: 200,
          height: 200,
        }),
        'zone:create',
      );
      const [second] = data(
        await emitAck<WallView[]>(gm, 'wall:create', {
          sceneId: hallId,
          points: [
            { x: 1500, y: 600 },
            { x: 1500, y: 700 },
          ],
          kind: 'door',
        }),
        'wall:create',
      );
      await emitAck(gm, 'wall:update', { wallId: second!.id, patch: { netControlled: true } });
      const installations = floorsOf(await architecture(run.run.architectureId))[3]!;
      expect(installations.devices?.map((device) => device.id)).toEqual([
        `zone-${floorZone.id}`,
        `wall-${doorId}`,
        `zone-${late.id}`,
        `wall-${second!.id}`,
      ]);
      // Dwoje drzwi na scenie — nowe dostają numer.
      expect(installations.devices?.[3]?.name).toBe('Drzwi 2');

      // Odhaczone drzwi i „Poza Siecią” schodzą z węzła, węzeł zostaje.
      await emitAck(gm, 'wall:update', { wallId: second!.id, patch: { netControlled: false } });
      await emitAck(gm, 'zone:update', { zoneId: late.id, patch: { netExcluded: true } });
      const trimmed = floorsOf(await architecture(run.run.architectureId));
      expect(trimmed).toHaveLength(4);
      expect(trimmed[3]!.devices?.map((device) => device.id)).toEqual([
        `zone-${floorZone.id}`,
        `wall-${doorId}`,
      ]);
      const zones = (await roundTrip(gm)).zones;
      expect(zones.find((zone) => zone.id === late.id)?.deviceId).toBeUndefined();
    });

    it('Architektura MG nie bierze stref ani drzwi sama — wiąże je karta strefy (#33)', async () => {
      await emitAck(player, 'netrun:leave', { runId: run.runId });
      const ownId = data(
        await emitAck<NetArchitectureView>(gm, 'net:save', {
          architecture: {
            name: 'Brama hali',
            difficulty: 'standard',
            branches: [
              {
                id: 'trunk',
                parentFloor: null,
                floors: [{ id: 'f0', kind: 'controlNode', label: 'Węzeł', dv: 10, devices: [] }],
              },
            ],
          },
        }),
        'net:save',
      ).id;
      const unbound = data(
        await emitAck<DefenseZoneView>(gm, 'zone:create', {
          sceneId: hallId,
          entryId: 'defense.podloga-elektryczna',
          name: 'Podłoga bramy',
          x: 1200,
          y: 1200,
          width: 200,
          height: 200,
        }),
        'zone:create',
      );
      const point = data(
        await emitAck<NetAccessPointView>(gm, 'netpoint:place', {
          sceneId: hallId,
          x: 60,
          y: 60,
          name: 'Gniazdo bramy',
          architectureId: ownId,
          hidden: false,
        }),
        'netpoint:place',
      );
      data(
        await emitAck<NetRunPayload>(player, 'netrun:start', {
          tokenId: runnerId,
          accessPointId: point.id,
        }),
        'netrun:start',
      );
      const own = await architecture(ownId);
      expect(JSON.stringify(own.architecture)).not.toContain(`zone-${unbound.id}`);
      expect(JSON.stringify(own.architecture)).not.toContain('"wallId"');
    });
  });
});
