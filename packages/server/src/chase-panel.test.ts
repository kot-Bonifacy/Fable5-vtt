import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  CharacterView,
  ChaseObstacleView,
  CombatView,
  CpredCharacterData,
  SceneVehicleView,
  SceneView,
  SocketAck,
  TokenView,
  VehicleView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';
import { paceTesting } from './realtime/pace.js';

paceTesting.off = true;

/**
 * Etap 72f2 na żywych gniazdach — okno „Pościg” MG: przeszkoda na pas
 * i odległość przed autem (`chase:obstacle-spawn` z `lane`, `beforeId`,
 * `gapSq`, zawsze w kadrze), posiłki z pasem, stroną kadru i prędkością
 * (`chase:restore`), poprawka prędkości w walce i własna prędkość startowa
 * przed walką (`chase:set-speed`), auto kadru (`chase:anchor`).
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const DICE = join(mkdtempSync(join(tmpdir(), 'vtt-panel-dice-')), 'dice.txt');
const previousDiceScript = process.env.VTT_DICE_SCRIPT;
function scriptDice(faces: number[]): void {
  writeFileSync(DICE, faces.join(' '));
}

const PUBLIC_DIR = resolve(import.meta.dirname, '../../../data/public');
const PRIVATE_DIR = mkdtempSync(join(tmpdir(), 'vtt-panel-private-'));
const INJURY_ID = 'injury.test-whiplash';

function writeFixtureCompendium(): void {
  const dir = join(PRIVATE_DIR, 'cpred', 'compendium');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'sample.json'),
    readFileSync(join(PUBLIC_DIR, 'cpred', 'compendium', 'sample.json'), 'utf8'),
  );
  writeFileSync(
    join(dir, 'chase.json'),
    JSON.stringify({
      schemaVersion: 1,
      source: 'test 65d2 — wymyślone',
      weaponTypes: [],
      entries: [
        {
          id: 'weapon.assault-rifle',
          category: 'weapon',
          name: 'Karabin testowy',
          weaponTypeId: 'weapon-type.sample-rifle',
          quality: 'standard',
          cost: 50,
          costCategory: 'costly',
        },
        {
          id: INJURY_ID,
          category: 'criticalInjury',
          name: 'Odgięciowy uraz kręgosłupa szyjnego',
          table: 'head',
          roll: 8,
          description: 'Wymyślony opis do testu.',
          cost: null,
          source: 'test',
          quickFix: 'test',
          treatment: 'test',
          deathSavePenalty: 1,
        },
      ],
    }),
  );
}

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
  dataPublicDir: PUBLIC_DIR,
  dataPrivateDir: PRIVATE_DIR,
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

function waitFor(socket: ClientSocket, event: string, ms = 4000): Promise<unknown> {
  return new Promise((resolveEvent, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: unknown) => {
      clearTimeout(timer);
      resolveEvent(payload);
    });
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
  process.env.VTT_DICE_SCRIPT = DICE;
  scriptDice([]);
  writeFixtureCompendium();
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
    payload: { name: 'Okno 72f2' },
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
  if (previousDiceScript === undefined) delete process.env.VTT_DICE_SCRIPT;
  else process.env.VTT_DICE_SCRIPT = previousDiceScript;
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

describe('etap 72f2: okno „Pościg” MG', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let scene: SceneView;
  let carA: SceneVehicleView;
  let carB: SceneVehicleView;
  let reserve1: SceneVehicleView;
  let reserve2: SceneVehicleView;
  let vexToken: TokenView;
  let gangerToken: TokenView;

  const placedRow = (id: string) => built.prisma.sceneVehicle.findUniqueOrThrow({ where: { id } });

  /** „Następna tura” MG; runda stojąca na Wyścigu (kubek Vex) — drugie kliknięcie go pomija. */
  const next = async (label: string) => {
    const view = data(await emitAck<CombatView>(gm, 'combat:next'), label);
    if (view.round < 1 || view.activeCombatantId !== null) return view;
    return data(await emitAck<CombatView>(gm, 'combat:next'), `${label} — pomija Wyścig`);
  };

  it('stawia scenę: Vex z przodu, gang z tyłu, dwa auta w rezerwie', async () => {
    gm = await connect(gmCookie);
    player = await connect(playerCookie);
    scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Okno', kind: 'chase' }),
      'scene:create',
    );
    scene = data(
      await emitAck<SceneView>(gm, 'scene:update', {
        sceneId: scene.id,
        patch: {
          width: 3000,
          height: 1800,
          grid: { sizePx: 100 },
          chase: { direction: 'right', road: { from: 0, to: 18 }, tempo: 20 },
        },
      }),
      'scene:update',
    );
    // Trzy pasy po 6 kratek: środki na 300, 900 i 1500 px. Drużyna na czele ucieka.
    await built.prisma.scene.update({
      where: { id: scene.id },
      data: { chaseLanes: 3, chaseRole: 'flee' },
    });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId: scene.id });
    await activated;

    const sheet = async (name: string, ownerId?: string) =>
      data(
        await emitAck<CharacterView<CpredCharacterData>>(gm, 'character:create', {
          name,
          ...(ownerId ? { ownerId } : {}),
        }),
        `character:create ${name}`,
      );
    const vex = await sheet('Vex', playerId);
    const ganger = await sheet('Ganger');
    const car = async (catalogId: string, ownerCharacterId?: string) =>
      data(
        await emitAck<VehicleView>(gm, 'vehicle:create', {
          catalogId,
          ...(ownerCharacterId ? { ownerCharacterId } : {}),
        }),
        `vehicle:create ${catalogId}`,
      );
    const ours = await car('vehicle.sample-kompakt', vex.id);
    const theirs = await car('vehicle.sample-strzala');
    const police1 = await car('vehicle.sample-kompakt');
    const police2 = await car('vehicle.sample-kompakt');
    const place = async (vehicleId: string, x: number, y: number) =>
      data(
        await emitAck<SceneVehicleView>(gm, 'chase:place', { sceneId: scene.id, vehicleId, x, y }),
        'chase:place',
      );
    carA = await place(ours.id, 1800, 300);
    carB = await place(theirs.id, 300, 300);
    reserve1 = await place(police1.id, 1200, 1500);
    reserve2 = await place(police2.id, 2000, 1500);
    // Rezerwa jak ze wzorca (66c): poza pościgiem do „Przywróć”.
    await built.prisma.sceneVehicle.updateMany({
      where: { id: { in: [reserve1.id, reserve2.id] } },
      data: { status: 'behind' },
    });

    vexToken = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Vex',
        x: 100,
        y: 100,
        ownerId: playerId,
        characterId: vex.id,
      }),
      'token:create vex',
    );
    gangerToken = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Ganger',
        x: 100,
        y: 1500,
        characterId: ganger.id,
      }),
      'token:create ganger',
    );
    const seat = async (socket: ClientSocket, tokenId: string, sceneVehicleId: string) =>
      expect((await emitAck(socket, 'vehicle:seat', { tokenId, sceneVehicleId, seat: 0 })).ok).toBe(
        true,
      );
    await seat(player, vexToken.id, carA.id);
    await seat(gm, gangerToken.id, carB.id);
  });

  it('przed walką MG daje autu własną prędkość startową i ją zdejmuje', async () => {
    expect(
      await emitAck(player, 'chase:set-speed', { sceneVehicleId: carB.id, speed: 10 }),
    ).toMatchObject({ ok: false });
    const set = data(
      await emitAck<SceneVehicleView>(gm, 'chase:set-speed', {
        sceneVehicleId: carB.id,
        speed: 10,
      }),
      'chase:set-speed 10',
    );
    // Zapowiedź startu idzie w widoku: 10 zamiast prędkości sceny (20).
    expect(set).toMatchObject({ startSpeed: 10, speed: 10 });
    expect(await placedRow(carB.id)).toMatchObject({ startSpeed: 10, speed: 0 });
    const reset = data(
      await emitAck<SceneVehicleView>(gm, 'chase:set-speed', {
        sceneVehicleId: carB.id,
        speed: null,
      }),
      'chase:set-speed null',
    );
    expect(reset).toMatchObject({ startSpeed: null, speed: 20 });
    expect(
      await emitAck(gm, 'chase:set-speed', { sceneVehicleId: carB.id, speed: -5 }),
    ).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
    data(
      await emitAck(gm, 'chase:set-speed', { sceneVehicleId: carB.id, speed: 10 }),
      'chase:set-speed 10 znowu',
    );
  });

  it('MG wskazuje auto kadru i wraca do reguły domyślnej', async () => {
    expect(
      await emitAck(player, 'chase:anchor', { sceneId: scene.id, vehicleId: carB.id }),
    ).toMatchObject({ ok: false });
    const update = waitFor(gm, 'scene:update');
    expect((await emitAck(gm, 'chase:anchor', { sceneId: scene.id, vehicleId: carB.id })).ok).toBe(
      true,
    );
    const broadcast = (await update) as { scene: SceneView };
    expect(broadcast.scene.chase.anchorId).toBe(carB.id);
    expect((await emitAck(gm, 'chase:anchor', { sceneId: scene.id, vehicleId: null })).ok).toBe(
      true,
    );
    expect(
      (await built.prisma.scene.findUniqueOrThrow({ where: { id: scene.id } })).chaseAnchorId,
    ).toBeNull();
    expect(
      await emitAck(gm, 'chase:anchor', { sceneId: scene.id, vehicleId: 'brak' }),
    ).toMatchObject({ ok: false, error: 'VEHICLE_NOT_FOUND' });
  });

  it('w walce: auto rusza z własnej prędkości startowej, MG poprawia prędkość', async () => {
    const started = data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId: scene.id,
        tokenIds: [vexToken.id, gangerToken.id],
      }),
      'combat:start',
    );
    for (const row of started.combatants) {
      await built.prisma.combatant.update({
        where: { id: row.id },
        data: { initiative: row.tokenId === vexToken.id ? 15 : 12 },
      });
    }
    // Runda 1: kadr — Vex 1800 → 2100 (70% z 3000), Strzała 300 → 600.
    await next('runda 1');
    expect(await placedRow(carA.id)).toMatchObject({ x: 2100, speed: 20 });
    expect(await placedRow(carB.id)).toMatchObject({ x: 600, speed: 10 });

    // W walce poprawka zmienia prędkość trwałą, najwyżej do Ruchu auta.
    data(
      await emitAck(gm, 'chase:set-speed', { sceneVehicleId: carB.id, speed: 35 }),
      'chase:set-speed 35',
    );
    expect(await placedRow(carB.id)).toMatchObject({ speed: 35 });
    data(
      await emitAck(gm, 'chase:set-speed', { sceneVehicleId: carA.id, speed: 999 }),
      'chase:set-speed 999',
    );
    expect(await placedRow(carA.id)).toMatchObject({ speed: 20 });
    expect(
      await emitAck(gm, 'chase:set-speed', { sceneVehicleId: carB.id, speed: null }),
    ).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
  });

  it('przeszkoda staje na pasie N kratek przed autem, zawsze w kadrze', async () => {
    // Kompakt 5 kratek: zderzak Vex na 2350; barykada 1 kratka wzdłuż.
    const spawned = data(
      await emitAck<ChaseObstacleView>(gm, 'chase:obstacle-spawn', {
        sceneId: scene.id,
        kind: 'barricade',
        lane: 1,
        beforeId: carA.id,
        gapSq: 4,
      }),
      'chase:obstacle-spawn 4',
    );
    expect(spawned).toMatchObject({ x: 2800, y: 900 });
    // Za daleko — przy przedniej krawędzi; bez auta — tak samo.
    const far = data(
      await emitAck<ChaseObstacleView>(gm, 'chase:obstacle-spawn', {
        sceneId: scene.id,
        kind: 'barricade',
        lane: 2,
        beforeId: carA.id,
        gapSq: 40,
      }),
      'chase:obstacle-spawn 40',
    );
    expect(far).toMatchObject({ x: 2950, y: 1500 });
    const edge = data(
      await emitAck<ChaseObstacleView>(gm, 'chase:obstacle-spawn', {
        sceneId: scene.id,
        kind: 'barricade',
        lane: 0,
      }),
      'chase:obstacle-spawn krawędź',
    );
    expect(edge).toMatchObject({ x: 2950, y: 300 });
    expect(
      await emitAck(gm, 'chase:obstacle-spawn', { sceneId: scene.id, kind: 'barricade', lane: 3 }),
    ).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
    expect(
      await emitAck(gm, 'chase:obstacle-spawn', {
        sceneId: scene.id,
        kind: 'barricade',
        lane: 0,
        beforeId: carA.id,
      }),
    ).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
    // Auto przy samej przedniej krawędzi nie ma przed sobą miejsca.
    await built.prisma.sceneVehicle.update({ where: { id: carA.id }, data: { x: 2800 } });
    expect(
      await emitAck(gm, 'chase:obstacle-spawn', {
        sceneId: scene.id,
        kind: 'barricade',
        lane: 0,
        beforeId: carA.id,
        gapSq: 0,
      }),
    ).toMatchObject({ ok: false, error: 'OBSTACLE_NO_ROOM' });
    await built.prisma.sceneVehicle.update({ where: { id: carA.id }, data: { x: 2100 } });
    await built.prisma.chaseObstacle.deleteMany({ where: { sceneId: scene.id } });
  });

  it('posiłki wjeżdżają na wybranym pasie przy wybranej krawędzi, z prędkością pościgu', async () => {
    expect(
      await emitAck(gm, 'chase:restore', { sceneVehicleId: reserve1.id, lane: 2, side: 'bok' }),
    ).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
    expect(
      await emitAck(gm, 'chase:restore', { sceneVehicleId: reserve1.id, lane: 7, side: 'rear' }),
    ).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
    const first = data(
      await emitAck<SceneVehicleView>(gm, 'chase:restore', {
        sceneVehicleId: reserve1.id,
        lane: 2,
        side: 'rear',
      }),
      'chase:restore rear',
    );
    // Prędkość pościgu tej rundy = auto kadru (Vex, 20 z początku rundy).
    expect(first).toMatchObject({ status: 'racing', x: 250, y: 1500, speed: 20 });
    // Drugie auto przy tej samej krawędzi — kratka po kratce, aż bryły się nie stykają.
    const second = data(
      await emitAck<SceneVehicleView>(gm, 'chase:restore', {
        sceneVehicleId: reserve2.id,
        lane: 2,
        side: 'rear',
        speed: 10,
      }),
      'chase:restore rear 2',
    );
    expect(second).toMatchObject({ status: 'racing', x: 850, y: 1500, speed: 10 });
    // Ucieka i wraca od przodu z prędkością z pola, przyciętą do Ruchu auta.
    data(await emitAck(gm, 'chase:escape', { sceneVehicleId: reserve2.id }), 'chase:escape');
    const front = data(
      await emitAck<SceneVehicleView>(gm, 'chase:restore', {
        sceneVehicleId: reserve2.id,
        lane: 1,
        side: 'front',
        speed: 80,
      }),
      'chase:restore front',
    );
    expect(front).toMatchObject({ status: 'racing', x: 2750, y: 900, speed: 20 });
  });
});
