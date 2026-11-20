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
 * Etap 72d na żywych gniazdach — mechanika pod pełny kokpit: Nagłe zatrzymanie
 * (PT 13) jako trzecia odpowiedź na przeszkodę, stojące auto, którego nic nie
 * najeżdża, skręt o dwa pasy po udanym Gwałtownym skręcie i tura kierowcy bez
 * licznika metrów. Kości: `VTT_DICE_SCRIPT`; katalog jak w `chase-obstacles.test.ts`.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const DICE = join(mkdtempSync(join(tmpdir(), 'vtt-cockpit-dice-')), 'dice.txt');
const previousDiceScript = process.env.VTT_DICE_SCRIPT;
function scriptDice(faces: number[]): void {
  writeFileSync(DICE, faces.join(' '));
}

const PUBLIC_DIR = resolve(import.meta.dirname, '../../../data/public');
const PRIVATE_DIR = mkdtempSync(join(tmpdir(), 'vtt-cockpit-private-'));
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
    payload: { name: 'Kokpit 72d' },
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

describe('etap 72d: Nagłe zatrzymanie, skręt o dwa pasy, kierowca bez metrów', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let scene: SceneView;
  let carA: SceneVehicleView;
  let carB: SceneVehicleView;
  let vexToken: TokenView;
  let gangerToken: TokenView;

  const obstacleRows = () => built.prisma.chaseObstacle.findMany({ where: { sceneId: scene.id } });
  const placedRow = (id: string) => built.prisma.sceneVehicle.findUniqueOrThrow({ where: { id } });
  const blockNotes = () =>
    built.prisma.chatMessage.count({ where: { kind: 'action', text: 'Przeszkoda na drodze' } });

  /** „Następna tura” MG; runda stojąca na Wyścigu (kubek Vex) — drugie kliknięcie go pomija. */
  const next = async (label: string) => {
    const view = data(await emitAck<CombatView>(gm, 'combat:next'), label);
    if (view.round < 1 || view.activeCombatantId !== null) return view;
    return data(await emitAck<CombatView>(gm, 'combat:next'), `${label} — pomija Wyścig`);
  };

  it('stawia scenę: trzy szerokie pasy, Vex z przodu na górnym, gang z tyłu na dolnym', async () => {
    gm = await connect(gmCookie);
    player = await connect(playerCookie);
    scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Kokpit', kind: 'chase' }),
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

    const sheet = async (name: string, ownerId?: string) => {
      const created = data(
        await emitAck<CharacterView<CpredCharacterData>>(gm, 'character:create', {
          name,
          ...(ownerId ? { ownerId } : {}),
        }),
        `character:create ${name}`,
      );
      // REF 8 + Prowadzenie 4: Manewr PT 13 zdaje z kością 2 i więcej.
      data(
        await emitAck(gm, 'character:update', {
          characterId: created.id,
          patch: { data: { stats: { ...created.data.stats, ref: 8 }, skills: { driving: 4 } } },
        }),
        `character:update ${name}`,
      );
      return created;
    };
    const vex = await sheet('Vex', playerId);
    const ganger = await sheet('Ganger');
    const ours = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', {
        catalogId: 'vehicle.sample-kompakt',
        ownerCharacterId: vex.id,
      }),
      'vehicle:create ours',
    );
    const theirs = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', { catalogId: 'vehicle.sample-kompakt' }),
      'vehicle:create theirs',
    );
    const place = async (vehicleId: string, x: number, y: number) =>
      data(
        await emitAck<SceneVehicleView>(gm, 'chase:place', { sceneId: scene.id, vehicleId, x, y }),
        'chase:place',
      );
    carA = await place(ours.id, 1800, 300);
    carB = await place(theirs.id, 1000, 1500);
    expect(carA.lane).toBe(0);
    expect(carB.lane).toBe(2);
    expect(carA.swerveReady).toBe(false);

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
        y: 300,
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

  it('tura kierowcy nie liczy metrów — sam żeton Akcji Ruchu, bez Biegu', async () => {
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
    const view = await next('runda 1');
    const vexTurn = view.combatants.find((row) => row.tokenId === vexToken.id)!;
    expect(view.activeCombatantId).toBe(vexTurn.id);
    expect(vexTurn.turn?.distance).toBeUndefined();
    expect(vexTurn.turn?.resources.map((row) => row.id)).toContain('move');
    // Kadr: auto drużyny 1800 → 2100 (70% z 3000), gang o 3 kratki za nim.
    expect((await placedRow(carA.id)).x).toBe(2100);
    expect((await placedRow(carB.id)).x).toBe(1300);
  });

  it('przeszkoda dojeżdża do auta gangu, a MG odpowiada Nagłym zatrzymaniem', async () => {
    // Tura Vex w rundzie 1 — MG wypuszcza furgon na dolny pas (przy przedniej krawędzi).
    const spawned = data(
      await emitAck<ChaseObstacleView>(gm, 'chase:obstacle-spawn', {
        sceneId: scene.id,
        kind: 'civilian-car',
        name: 'Furgon',
        hp: 10,
        x: 500,
        y: 1500,
      }),
      'chase:obstacle-spawn',
    );
    expect(spawned).toMatchObject({ x: 2750, y: 1500 });
    // Runda 2: furgon 2750 → 2250; runda 3: staje przy zderzaku gangu (1300 + 250 + 250).
    await next('runda 1: gang');
    await next('runda 2');
    await next('runda 2: gang');
    const before = await blockNotes();
    await next('runda 3');
    const [row] = await obstacleRows();
    expect(row).toMatchObject({ blockingId: carB.id });
    expect(row!.x).toBeCloseTo(1800, 0);
    expect(await blockNotes()).toBe(before + 1);

    // Odpowiedź spoza listy odbija się od serwera.
    expect(
      await emitAck(gm, 'chase:obstacle-answer', { obstacleId: row!.id, choice: 'brake' }),
    ).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
    // 8 + 4 + 5 = 17 > 13 — auto gangu staje zderzak w zderzak.
    scriptDice([5]);
    const answered = data(
      await emitAck<SceneVehicleView>(gm, 'chase:obstacle-answer', {
        obstacleId: row!.id,
        choice: 'stop',
      }),
      'chase:obstacle-answer stop',
    );
    expect(answered.speed).toBe(0);
    expect(answered.control).toBe('driver');
    const [after] = await obstacleRows();
    expect(after).toMatchObject({ blockingId: null });
    expect(after!.x).toBeCloseTo(1800, 0);
    const rolls = await built.prisma.chatMessage.findMany({ where: { kind: 'roll' } });
    expect(rolls.some((entry) => JSON.stringify(entry).includes('Nagłe zatrzymanie'))).toBe(true);
  });

  it('stojące auto nic nie najeżdża: przeszkoda staje przy zderzaku bez pytania', async () => {
    // Tura gangu w rundzie 3: auto stoi (0 mil/h), więc bez „Jedź” zostaje w tyle
    // o 5 kratek na koniec tury — a furgon na początku rundy 4 tyle samo.
    await next('runda 3: gang');
    const before = await blockNotes();
    await next('runda 4');
    expect((await placedRow(carB.id)).x).toBe(800);
    const [row] = await obstacleRows();
    // Furgon 1800 → 1300 i staje przy zderzaku stojącego gangu (800 + 250 + 250).
    expect(row).toMatchObject({ blockingId: null });
    expect(row!.x).toBeCloseTo(1300, 0);
    expect(await blockNotes()).toBe(before);
  });

  it('dwa pasy naraz tylko po udanym Gwałtownym skręcie w tej rundzie', async () => {
    // Runda 4, tura Vex.
    expect(
      await emitAck(player, 'vehicle:drive', {
        sceneVehicleId: carA.id,
        pedal: null,
        laneDelta: 2,
      }),
    ).toMatchObject({ ok: false, error: 'SWERVE_NEEDED' });
    expect(
      await emitAck(player, 'vehicle:drive', {
        sceneVehicleId: carA.id,
        pedal: null,
        laneDelta: 3,
      }),
    ).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
    scriptDice([5]);
    const swerved = data(
      await emitAck<SceneVehicleView>(player, 'vehicle:maneuver', {
        sceneVehicleId: carA.id,
        maneuverId: 'swerve',
      }),
      'vehicle:maneuver swerve',
    );
    expect(swerved.swerveReady).toBe(true);
    const drove = data(
      await emitAck<{ moved: boolean; vehicle?: SceneVehicleView }>(player, 'vehicle:drive', {
        sceneVehicleId: carA.id,
        pedal: null,
        laneDelta: 2,
      }),
      'vehicle:drive +2',
    );
    expect(drove.moved).toBe(true);
    expect(drove.vehicle).toMatchObject({ lane: 2, swerveReady: false, moved: true });
    expect((await placedRow(carA.id)).y).toBe(1500);
  });
});
