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
    expect(nodeDevices(await architecture(scene!.id))).toEqual([[cameraId, turretId]]);
    expect(firstRun.run.architectureName).toBeUndefined();
  });

  it('netrunner od razu widzi nazwę i rodzaj urządzeń; mina i ludzie są poza Siecią', () => {
    expect(firstRun.run.sightedDevices).toEqual([
      { name: 'Kamera', deviceKind: 'camera' },
      { name: 'Wieżyczka', deviceKind: 'turret' },
    ]);
  });

  it('przed Kontrolą: węzeł zakryty, bez przycisków i bez miejsca kamery na mapie', () => {
    const floors = firstRun.run.branches.flatMap((branch) => branch.floors);
    expect(floors.map((floor) => floor.knowledge)).toEqual(['entered', 'hidden']);
    expect(floors.every((floor) => !floor.devices)).toBe(true);
    expect(JSON.stringify(firstRun)).not.toContain('Kamera nad barem');
    expect(JSON.stringify(firstRun)).not.toContain(cameraId);
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
                { id: 'f0', kind: 'password', label: 'Hasło', dv: 6 },
                { id: 'f1', kind: 'controlNode', label: 'Węzeł zaplecza', dv: 10, devices: [] },
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
    expect(run.run.sightedDevices).toEqual([{ name: 'Dron ochrony', deviceKind: 'drone' }]);
  });
});
