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
  NetRunAbilityResult,
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
 * Kamera przejęta w Sieci (zlecenie MG z 20.10) na żywych gniazdach.
 *
 * Netrunner, który trzyma węzeł kamery stojącej na mapie, widzi jej oczami:
 * stożek 90° wzdłuż kierunku figury, na scenie z widzeniem Dynamicznym. Tutaj
 * sprawdzane jest to, czego nie dosięgnie test czysty — że figury w stożku
 * trafiają do payloadu **tylko** netrunnera, że „Obróć” przestawia figurę
 * kamery, a wyłączenie samo przelicza widok.
 *
 * Mapa: jedno pole to 100 px i 2 m.
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
/** Gracz spoza runu — sprawdza, czego nie widzi reszta stołu (#37). */
let bystanderCookie: string;
let bystanderId: string;
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
    payload: { name: 'Kampania kamer' },
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

  const bystanderRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, invite, 'Gapa'),
  });
  bystanderCookie = cookieOf(bystanderRes.headers['set-cookie']);
  bystanderId = (bystanderRes.json() as { user: { id: string } }).user.id;
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

describe('kamera przejęta w Sieci (20.10)', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let bystander: ClientSocket;
  let sceneId: string;
  let runId: string;
  let cameraTokenId: string;

  /**
   * Mapa 2000 × 2000, ściana na y = 1000 przez całą szerokość. Netrunner
   * i gapa stoją nad nią, kamera, „Strażnik” (na wschód od kamery) i „Kot”
   * (na południe) — pod nią. Bez kamery nikt z graczy nie widzi dołu mapy.
   */
  it('stawia monitoring: ściana, kamera, dwóch na dole i węzeł z kamerą', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    const bystanderConn = createSocket(bystanderCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    bystander = bystanderConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync, bystanderConn.firstSync]);

    const netrunner = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Kolec', ownerId: playerId }),
      'character:create',
    );
    await emitAck(gm, 'character:update', {
      characterId: netrunner.id,
      patch: {
        data: {
          roleId: 'netrunner',
          roleAbilityRank: 10,
          cyberdeck: { name: 'Cyberdek zwykłej jakości', slots: 7, installed: [] },
        },
      },
    });

    sceneId = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Monitoring' }),
      'scene',
    ).id;
    await emitAck(gm, 'scene:update', {
      sceneId,
      patch: { width: 2000, height: 2000, grid: { sizePx: 100 }, metersPerSquare: 2 },
    });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'dynamic' });
    await emitAck(gm, 'wall:create', {
      sceneId,
      kind: 'wall',
      points: [
        { x: 0, y: 1000 },
        { x: 2000, y: 1000 },
      ],
    });

    const tokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kolec',
        x: 0,
        y: 0,
        ownerId: playerId,
        characterId: netrunner.id,
      }),
      'token:create',
    ).id;
    await emitAck(gm, 'token:create', {
      sceneId,
      name: 'Gapa',
      x: 300,
      y: 0,
      ownerId: bystanderId,
    });
    cameraTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kamera',
        x: 400,
        y: 1400,
      }),
      'token:create',
    ).id;
    // Kamera patrzy na wschód — na Strażnika, plecami do niczego.
    await emitAck(gm, 'token:facing', { tokenId: cameraTokenId, facing: 90 });
    await emitAck(gm, 'token:create', { sceneId, name: 'Strażnik', x: 1200, y: 1400 });
    await emitAck(gm, 'token:create', { sceneId, name: 'Kot', x: 400, y: 1800 });

    const architectureId = data(
      await emitAck<NetArchitectureView>(gm, 'net:save', {
        architecture: {
          name: 'Sieć monitoringu',
          difficulty: 'standard',
          branches: [
            {
              id: 'trunk',
              parentFloor: null,
              floors: [
                {
                  id: 'f0',
                  kind: 'controlNode',
                  label: 'Węzeł kamer',
                  dv: 1,
                  devices: [
                    {
                      id: 'dev-cam',
                      name: 'Kamera w korytarzu',
                      deviceKind: 'camera',
                      tokenId: cameraTokenId,
                    },
                  ],
                },
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
        x: 50,
        y: 50,
        name: 'Terminal',
        architectureId,
        hidden: false,
      }),
      'netpoint:place',
    );
    runId = data(
      await emitAck<NetRunPayload>(player, 'netrun:start', { tokenId, accessPointId: point.id }),
      'netrun:start',
    ).runId;
  });

  async function namesSeenBy(socket: ClientSocket): Promise<string[]> {
    return (await roundTrip(socket)).tokens.map((token) => token.name).sort();
  }

  it('bez przejętego węzła kamera niczego nie pokazuje', async () => {
    const seen = await namesSeenBy(player);
    expect(seen).not.toContain('Strażnik');
    expect(seen).not.toContain('Kot');
  });

  it('po Kontroli netrunner widzi przez kamerę to, co w jej stożku — i tylko on', async () => {
    let result = data(
      await emitAck<NetRunAbilityResult>(player, 'netrun:ability', { runId, ability: 'control' }),
      'netrun:ability',
    );
    for (let attempt = 1; attempt < 6 && !result.success; attempt += 1) {
      result = data(
        await emitAck<NetRunAbilityResult>(player, 'netrun:ability', { runId, ability: 'control' }),
        'netrun:ability',
      );
    }
    expect(result.success).toBe(true);

    const seen = await namesSeenBy(player);
    expect(seen).toContain('Strażnik');
    // Kot stoi na południe od kamery, poza jej 90°.
    expect(seen).not.toContain('Kot');
    // Gapa jest w drużynie, ale przez kamerę patrzy sam netrunner (decyzja MG).
    expect(await namesSeenBy(bystander)).not.toContain('Strażnik');
  });

  it('niesie w oknie Sieci położenie i kierunek kamery', async () => {
    const run = (await roundTrip(player)).netRuns.find((entry) => entry.runId === runId)!;
    const camera = run.run.branches[0]!.floors[0]!.devices![0]!;
    expect(camera.at).toEqual({ sceneId, x: 450, y: 1450 });
    expect(camera.facing).toBe(90);
  });

  it('„Obróć” na południe przestawia figurę kamery i to, co widzi netrunner', async () => {
    const turned = data(
      await emitAck<NetRunAbilityResult>(player, 'netrun:device', {
        runId,
        floorId: 'f0',
        deviceId: 'dev-cam',
        operation: 'turn',
        facing: 180,
      }),
      'netrun:device',
    );
    expect(turned.summary).toBe('Kamera w korytarzu — obrócona na południe.');
    const camera = (await roundTrip(gm)).tokens.find((token) => token.id === cameraTokenId);
    expect(camera?.facing).toBe(180);
    const seen = await namesSeenBy(player);
    expect(seen).toContain('Kot');
    expect(seen).not.toContain('Strażnik');
  });

  it('wyłączona kamera gaśnie, a widok netrunnera wraca do jego oczu', async () => {
    const pushed = waitFor<{ sceneId: string }>(player, 'vision:sync');
    expect(
      (
        await emitAck(player, 'netrun:device', {
          runId,
          floorId: 'f0',
          deviceId: 'dev-cam',
          operation: 'off',
        })
      ).ok,
    ).toBe(true);
    // Zmiana tego, kto przez co patrzy, sama przelicza widok (`emitRuns`).
    expect((await pushed).sceneId).toBe(sceneId);
    const seen = await namesSeenBy(player);
    expect(seen).not.toContain('Kot');
    expect(seen).not.toContain('Strażnik');
  });
});
