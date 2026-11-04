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
import { readCpredVehicle } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';
import { paceTesting } from './realtime/pace.js';

paceTesting.off = true;

/**
 * Przegląd pościgu (03.11, decyzje MG) na żywych gniazdach: Test zwykłej jazdy
 * w ramach Akcji Ruchu (Nitro dalej działa), stojące auto przed zderzakiem
 * wzywa kierowcę jak przeszkoda, taranowany wrak ląduje za autem, utrata
 * kontroli wjeżdża w przeszkodę, MG przestawiający auto zwalnia przeszkodę,
 * pieszego taranowanie bije tylko jego.
 *
 * Kości: `VTT_DICE_SCRIPT`, jak w `hidden-figures.test.ts`. Katalog: próbka
 * z repo plus wymyślony karabin pod id broni pokładowej i rana z taranowania
 * — w katalogu tymczasowym, który zastępuje próbkę w całości.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const DICE = join(mkdtempSync(join(tmpdir(), 'vtt-review-dice-')), 'dice.txt');
const previousDiceScript = process.env.VTT_DICE_SCRIPT;
function scriptDice(faces: number[]): void {
  writeFileSync(DICE, faces.join(' '));
}

const PUBLIC_DIR = resolve(import.meta.dirname, '../../../data/public');
const PRIVATE_DIR = mkdtempSync(join(tmpdir(), 'vtt-review-private-'));
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
    payload: { name: 'Przegląd pościgu' },
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

describe('przegląd pościgu 03.11', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let scene: SceneView;
  let carA: SceneVehicleView;
  let carB: SceneVehicleView;
  let carW: SceneVehicleView;
  let vexId = '';
  let vexToken: TokenView;
  let gangerToken: TokenView;
  let combatId = '';

  const placedRow = (id: string) => built.prisma.sceneVehicle.findUniqueOrThrow({ where: { id } });
  const hpOf = async (sceneVehicleId: string) =>
    readCpredVehicle(
      (
        await built.prisma.vehicle.findUniqueOrThrow({
          where: { id: (await placedRow(sceneVehicleId)).vehicleId },
        })
      ).system,
    ).hp;
  const obstacle = (id: string) => built.prisma.chaseObstacle.findUnique({ where: { id } });
  const combat = () => built.prisma.combat.findUniqueOrThrow({ where: { id: combatId } });
  const vexCombatant = () =>
    built.prisma.combatant.findFirstOrThrow({ where: { tokenId: vexToken.id } });
  const toVex = async () => {
    const id = (await vexCombatant()).id;
    for (let i = 0; i < 4 && (await combat()).activeCombatantId !== id; i += 1) {
      data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next → Vex');
    }
    expect((await combat()).activeCombatantId).toBe(id);
  };
  const newRound = async () => {
    const round = (await combat()).round;
    for (let i = 0; i < 4 && (await combat()).round === round; i += 1) {
      data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next → runda');
    }
  };
  const drivingCards = () =>
    built.prisma.chatMessage.count({
      where: { kind: 'roll', text: { startsWith: 'Zwykła jazda' } },
    });
  const place = async (vehicleId: string, x: number, y: number) =>
    data(
      await emitAck<SceneVehicleView>(gm, 'chase:place', { sceneId: scene.id, vehicleId, x, y }),
      'chase:place',
    );
  const kompakt = async (ownerCharacterId?: string) =>
    data(
      await emitAck<VehicleView>(gm, 'vehicle:create', {
        catalogId: 'vehicle.sample-kompakt',
        ...(ownerCharacterId ? { ownerCharacterId } : {}),
      }),
      'vehicle:create',
    );

  it('stawia scenę: słaby kierowca Vex z Nitro, gang na górnym pasie, wrak przed Vex', async () => {
    gm = await connect(gmCookie);
    player = await connect(playerCookie);
    scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Przegląd', kind: 'chase' }),
      'scene:create',
    );
    // Tempo = Ruch kompaktu: jadące auta stoją w kadrze, stojące dryfują 5 kratek w tył.
    scene = data(
      await emitAck<SceneView>(gm, 'scene:update', {
        sceneId: scene.id,
        patch: {
          width: 3000,
          height: 1800,
          grid: { sizePx: 100 },
          chase: { direction: 'right', road: { from: 6, to: 12 }, tempo: 20 },
        },
      }),
      'scene:update',
    );
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId: scene.id });
    await activated;
    const vex = data(
      await emitAck<CharacterView<CpredCharacterData>>(gm, 'character:create', {
        name: 'Vex',
        ownerId: playerId,
      }),
      'character:create',
    );
    vexId = vex.id;
    // REF 4 + Prowadzenie 2 = 6 ≤ 9: Test zwykłej jazdy w każdej turze.
    data(
      await emitAck(gm, 'character:update', {
        characterId: vex.id,
        patch: { data: { stats: { ...vex.data.stats, ref: 4 }, skills: { driving: 2 } } },
      }),
      'character:update',
    );
    const ganger = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Ganger' }),
      'character:create ganger',
    );
    const ours = await kompakt(vex.id);
    data(
      await emitAck(gm, 'vehicle:update', {
        vehicleId: ours.id,
        patch: { system: { upgrades: [{ id: 'u-nitro', upgradeId: 'nitro', notes: '' }] } },
      }),
      'vehicle:update',
    );
    const wreck = await kompakt();
    carA = await place(ours.id, 1800, 1050);
    carB = await place((await kompakt()).id, 1000, 750);
    carW = await place(wreck.id, 2600, 1050);
    const stats = readCpredVehicle(
      (await built.prisma.vehicle.findUniqueOrThrow({ where: { id: wreck.id } })).system,
    );
    await built.prisma.vehicle.update({
      where: { id: wreck.id },
      data: { system: JSON.stringify({ ...stats, hp: 0 }) },
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
    expect(
      (
        await emitAck(player, 'vehicle:seat', {
          tokenId: vexToken.id,
          sceneVehicleId: carA.id,
          seat: 0,
        })
      ).ok,
    ).toBe(true);
    gangerToken = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Ganger',
        x: 100,
        y: 300,
        characterId: ganger.id,
      }),
      'token:create ganger',
    );
    expect(
      (
        await emitAck(gm, 'vehicle:seat', {
          tokenId: gangerToken.id,
          sceneVehicleId: carB.id,
          seat: 0,
        })
      ).ok,
    ).toBe(true);
    const started = data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId: scene.id,
        tokenIds: [vexToken.id, gangerToken.id],
      }),
      'combat:start',
    );
    combatId = started.id;
    for (const row of started.combatants) {
      await built.prisma.combatant.update({
        where: { id: row.id },
        data: { initiative: row.tokenId === gangerToken.id ? 15 : 12 },
      });
    }
    data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next runda 1');
  });

  it('Test zwykłej jazdy idzie w ramach Akcji Ruchu: słaby kierowca odpala Nitro i jedzie', async () => {
    await toVex();
    expect(
      (await emitAck<SceneVehicleView>(player, 'vehicle:nitro', { sceneVehicleId: carA.id })).ok,
    ).toBe(true);
    // 4 + 2 + 9 = 15 ≥ 10.
    scriptDice([9]);
    const moved = data(
      await emitAck<SceneVehicleView>(player, 'chase:move', {
        sceneVehicleId: carA.id,
        x: 2000,
        y: 1050,
      }),
      'chase:move po Nitro',
    );
    expect(moved.x).toBe(2000);
    expect(await drivingCards()).toBe(1);
    // Drugi odcinek tej samej tury — bez drugiego Testu.
    data(
      await emitAck<SceneVehicleView>(player, 'chase:move', {
        sceneVehicleId: carA.id,
        x: 2050,
        y: 1050,
      }),
      'chase:move drugi odcinek',
    );
    expect(await drivingCards()).toBe(1);
    const turn = JSON.parse((await vexCombatant()).turnState ?? '{}') as {
      action: { id: string } | null;
      drivingTested?: boolean;
    };
    expect(turn.action?.id).toBe('vehicle-nitro');
    expect(turn.drivingTested).toBe(true);
  });

  it('wrak dryfuje przed zderzak Vex i czeka na wybór; Gwałtowny skręt zostawia go za autem', async () => {
    await newRound();
    const wreck = await placedRow(carW.id);
    expect(wreck.blockingId).toBe(carA.id);
    // Przód Vex (2050 + 250) plus połowa wraku.
    expect(wreck.x).toBeCloseTo(2550, 0);
    await toVex();
    expect(
      await emitAck(player, 'chase:move', { sceneVehicleId: carA.id, x: 2100, y: 1050 }),
    ).toMatchObject({ ok: false, error: 'OBSTACLE_PENDING' });
    // 4 + 2 + 8 = 14 ≥ 13.
    scriptDice([8]);
    const view = data(
      await emitAck<SceneVehicleView>(player, 'chase:vehicle-answer', {
        sceneVehicleId: carW.id,
        choice: 'swerve',
      }),
      'chase:vehicle-answer',
    );
    expect(view).toMatchObject({ control: 'driver', hp: 45 });
    const after = await placedRow(carW.id);
    expect(after.blockingId).toBeNull();
    expect(after.x).toBeCloseTo(2050 - 250 - 250 - 5, 0);
    expect(
      await emitAck(player, 'chase:vehicle-answer', { sceneVehicleId: carW.id, choice: 'ram' }),
    ).toMatchObject({ ok: false, error: 'OBSTACLE_NOT_BLOCKING' });
  });

  it('taranowany wrak nie zostaje pod autem — ląduje za tylnym zderzakiem', async () => {
    await built.prisma.sceneVehicle.update({ where: { id: carW.id }, data: { x: 2550.01 } });
    // Test jazdy 9, wrak 6 × 1, auto Vex 6 × 1.
    scriptDice([9, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    const view = data(
      await emitAck<SceneVehicleView>(player, 'chase:move', {
        sceneVehicleId: carA.id,
        x: 2350,
        y: 1050,
        ram: true,
      }),
      'chase:move ram',
    );
    expect(view.x).toBeCloseTo(2350, 0);
    expect(view.hp).toBe(45 - 6);
    expect((await placedRow(carW.id)).x).toBeCloseTo(2350 - 250 - 250 - 5, 0);
  });

  it('auto, które weszło w rundę bez kontroli, wjeżdża w przeszkodę samo', async () => {
    await built.prisma.sceneVehicle.update({ where: { id: carB.id }, data: { lostControl: true } });
    const spawned = data(
      await emitAck<ChaseObstacleView>(gm, 'chase:obstacle-spawn', {
        sceneId: scene.id,
        kind: 'barricade',
        x: 500,
        y: 750,
      }),
      'chase:obstacle-spawn',
    );
    // Bryła barykady (3 × 1, 30 PW), ale rozbijalna — beton rozbija auto
    // (04.11.2026, osobny test niżej).
    await built.prisma.chaseObstacle.update({
      where: { id: spawned.id },
      data: { x: 1350, driftRound: 0, kind: 'custom' },
    });
    // Przeszkoda 6 × 1 (30 → 24), auto gangu 6 × 1 (45 → 39).
    scriptDice([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    await newRound();
    // Przeszkoda przeżyła (24 PW), ale reaguje tylko z pierwszym autem — znika
    // z drogi (decyzja MG z 04.11.2026).
    expect(await obstacle(spawned.id)).toBeNull();
    expect(await hpOf(carB.id)).toBe(39);
    expect((await placedRow(carB.id)).lostControl).toBe(false);
  });

  it('beton nie ustępuje: auto bez kontroli jest od razu wrakiem, barykada zostaje (04.11.2026)', async () => {
    const before = await placedRow(carB.id);
    const hpBefore = await hpOf(carB.id);
    await built.prisma.sceneVehicle.update({ where: { id: carB.id }, data: { lostControl: true } });
    const spawned = data(
      await emitAck<ChaseObstacleView>(gm, 'chase:obstacle-spawn', {
        sceneId: scene.id,
        kind: 'barricade',
        x: 500,
        y: 750,
      }),
      'chase:obstacle-spawn',
    );
    await built.prisma.chaseObstacle.update({
      where: { id: spawned.id },
      data: { x: 1350, driftRound: 0 },
    });
    await newRound();
    // Bez kości taranowania: auto PUK 0, beton bez szkody.
    expect(await hpOf(carB.id)).toBe(0);
    const row = await obstacle(spawned.id);
    expect(row).toMatchObject({ hp: 30, blockingId: null });
    expect(JSON.parse(row!.passed)).toContain(carB.id);
    const crash = await built.prisma.chatMessage.findFirst({
      where: { kind: 'action', text: 'Rozbite na betonie' },
    });
    expect(crash).not.toBeNull();

    // Sprzątanie dla kolejnych testów: auto wraca do stanu sprzed zderzenia.
    expect((await emitAck(gm, 'chase:obstacle-remove', { obstacleId: spawned.id })).ok).toBe(true);
    const vehicle = await built.prisma.vehicle.findUniqueOrThrow({
      where: { id: before.vehicleId },
    });
    await built.prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { system: JSON.stringify({ ...readCpredVehicle(vehicle.system), hp: hpBefore }) },
    });
    await built.prisma.sceneVehicle.update({
      where: { id: carB.id },
      data: { x: before.x, y: before.y, lostControl: false },
    });
  });

  it('MG przestawia auto z czekającą przeszkodą — przeszkoda już na nie nie czeka', async () => {
    const spawned = data(
      await emitAck<ChaseObstacleView>(gm, 'chase:obstacle-spawn', {
        sceneId: scene.id,
        kind: 'barricade',
        x: 500,
        y: 750,
      }),
      'chase:obstacle-spawn',
    );
    await built.prisma.chaseObstacle.update({
      where: { id: spawned.id },
      data: { x: 1350, driftRound: 0 },
    });
    await newRound();
    expect((await obstacle(spawned.id))?.blockingId).toBe(carB.id);
    data(
      await emitAck<SceneVehicleView>(gm, 'chase:move', {
        sceneVehicleId: carB.id,
        x: 700,
        y: 750,
      }),
      'chase:move MG',
    );
    expect((await obstacle(spawned.id))?.blockingId).toBeNull();
    expect((await emitAck(gm, 'chase:obstacle-remove', { obstacleId: spawned.id })).ok).toBe(true);
  });

  it('zgaszone auto dryfuje w auto bez kontroli — zderzenie od razu, stojące ląduje za nim', async () => {
    const stalled = await place((await kompakt()).id, 1650, 750);
    data(
      await emitAck<SceneVehicleView>(gm, 'vehicle:engine', {
        sceneVehicleId: stalled.id,
        on: false,
      }),
      'vehicle:engine off',
    );
    await built.prisma.sceneVehicle.update({ where: { id: carB.id }, data: { lostControl: true } });
    // Zgaszone auto 6 × 1 (45 → 39), auto gangu 6 × 1 (39 → 33).
    scriptDice([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    await newRound();
    expect(await hpOf(stalled.id)).toBe(39);
    expect(await hpOf(carB.id)).toBe(33);
    const row = await placedRow(stalled.id);
    expect(row.blockingId).toBeNull();
    expect(row.x).toBeCloseTo(700 - 250 - 250 - 5, 0);
  });

  it('taranowanie pieszego bije tylko pieszego — auto bez PUK, kierowca bez Rany', async () => {
    const walker = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Przechodzień' }),
      'character:create',
    );
    data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Przechodzień',
        x: 2650,
        y: 1000,
        characterId: walker.id,
      }),
      'token:create walker',
    );
    await toVex();
    const injuriesBefore = (
      await built.prisma.character.findUniqueOrThrow({ where: { id: vexId } })
    ).data.split(INJURY_ID).length;
    const hpBefore = await hpOf(carA.id);
    // Test jazdy 9, Unik pieszego 2 (porażka), 6k6 w pieszego.
    scriptDice([9, 2, 1, 1, 1, 1, 1, 1]);
    data(
      await emitAck<SceneVehicleView>(player, 'chase:move', {
        sceneVehicleId: carA.id,
        x: 2750,
        y: 1050,
        ram: true,
      }),
      'chase:move pieszy',
    );
    expect(await hpOf(carA.id)).toBe(hpBefore);
    const injuriesAfter = (
      await built.prisma.character.findUniqueOrThrow({ where: { id: vexId } })
    ).data.split(INJURY_ID).length;
    expect(injuriesAfter).toBe(injuriesBefore);
    const walkerData = (
      await built.prisma.character.findUniqueOrThrow({ where: { id: walker.id } })
    ).data;
    expect(walkerData).toContain(INJURY_ID);
  });
});
