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
 * Etap 65e na żywych gniazdach: przeszkody MG tylko w walce, przeszkoda na
 * torze auta wzywa kierowcę (Gwałtowny skręt albo taranowanie), auto bez
 * kierowcy wjeżdża w nią samo, kolczatka z wyrzutni i jej Test.
 *
 * Kości: `VTT_DICE_SCRIPT`, jak w `hidden-figures.test.ts`. Katalog: próbka
 * z repo plus wymyślony karabin pod id broni pokładowej i rana z taranowania
 * — w katalogu tymczasowym, który zastępuje próbkę w całości.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const DICE = join(mkdtempSync(join(tmpdir(), 'vtt-obstacle-dice-')), 'dice.txt');
const previousDiceScript = process.env.VTT_DICE_SCRIPT;
function scriptDice(faces: number[]): void {
  writeFileSync(DICE, faces.join(' '));
}

const PUBLIC_DIR = resolve(import.meta.dirname, '../../../data/public');
const PRIVATE_DIR = mkdtempSync(join(tmpdir(), 'vtt-obstacle-private-'));
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
    payload: { name: 'Pościg przez roboty drogowe' },
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

describe('etap 65e: przeszkody, ruch uliczny i kolczatka', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let scene: SceneView;
  let carA: SceneVehicleView;
  let carB: SceneVehicleView;
  let carC: SceneVehicleView;
  let vexToken: TokenView;
  let gangerToken: TokenView;

  const obstacleRows = () =>
    built.prisma.chaseObstacle.findMany({
      where: { sceneId: scene.id },
      orderBy: { createdAt: 'asc' },
    });
  const placedRow = (id: string) => built.prisma.sceneVehicle.findUniqueOrThrow({ where: { id } });
  const statsOf = async (vehicleId: string) =>
    readCpredVehicle(
      (await built.prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } })).system,
    );
  /** Dwie tury (gang 15, Vex 12) — nowa runda i dryf. */
  const nextRound = async (label: string) => {
    data(await emitAck<CombatView>(gm, 'combat:next'), `${label}: Vex`);
    data(await emitAck<CombatView>(gm, 'combat:next'), `${label}: nowa runda`);
  };

  it('stawia scenę: auto Vex na dolnym pasie, auto gangu z wyrzutnią na górnym', async () => {
    gm = await connect(gmCookie);
    player = await connect(playerCookie);
    scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Roboty', kind: 'chase' }),
      'scene:create',
    );
    // Tempo = Ruch kompaktu (20): auta nie dryfują, przeszkoda zbliża się 5 kratek na rundę.
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
    // REF 8 + Prowadzenie 4: zwykła jazda bez Testu, Gwałtowny skręt 12 + k10 przeciw 13.
    data(
      await emitAck(gm, 'character:update', {
        characterId: vex.id,
        patch: { data: { stats: { ...vex.data.stats, ref: 8 }, skills: { driving: 4 } } },
      }),
      'character:update',
    );
    const ganger = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Ganger' }),
      'character:create ganger',
    );
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
    data(
      await emitAck(gm, 'vehicle:update', {
        vehicleId: theirs.id,
        patch: { system: { upgrades: [{ id: 'u-spikes', upgradeId: 'spikes', notes: '' }] } },
      }),
      'vehicle:update theirs',
    );
    const empty = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', { catalogId: 'vehicle.sample-kompakt' }),
      'vehicle:create empty',
    );
    const place = async (vehicleId: string, x: number, y: number) =>
      data(
        await emitAck<SceneVehicleView>(gm, 'chase:place', { sceneId: scene.id, vehicleId, x, y }),
        'chase:place',
      );
    carA = await place(ours.id, 1800, 1050);
    carB = await place(theirs.id, 1000, 750);
    // Auto bez kierowcy jedzie za autem gangu — kolczatka jest dla niego.
    carC = await place(empty.id, 300, 750);
    expect(carB.spikesLeft).toBe(1);
    expect(carA.spikesLeft).toBe(0);

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
  });

  it('poza walką MG nie wypuści przeszkody', async () => {
    expect(
      await emitAck(gm, 'chase:obstacle-spawn', {
        sceneId: scene.id,
        kind: 'barricade',
        x: 500,
        y: 1050,
      }),
    ).toMatchObject({ ok: false, error: 'OBSTACLE_COMBAT_ONLY' });
    expect(await emitAck(gm, 'vehicle:spikes', { sceneVehicleId: carB.id })).toMatchObject({
      ok: false,
      error: 'SPIKES_COMBAT_ONLY',
    });
    expect(await obstacleRows()).toEqual([]);
  });

  it('przeszkoda na torze auta staje przy zderzaku i wzywa kierowcę', async () => {
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
        data: { initiative: row.tokenId === gangerToken.id ? 15 : 12 },
      });
    }
    data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next round 1');
    // Gracz nie wypuszcza przeszkód.
    expect(
      await emitAck(player, 'chase:obstacle-spawn', {
        sceneId: scene.id,
        kind: 'barricade',
        x: 500,
        y: 1050,
      }),
    ).toMatchObject({ ok: false });

    const spawned = data(
      await emitAck<ChaseObstacleView>(gm, 'chase:obstacle-spawn', {
        sceneId: scene.id,
        kind: 'civilian-car',
        name: 'Furgon',
        hp: 10,
        x: 500,
        y: 1050,
      }),
      'chase:obstacle-spawn',
    );
    // Przy przedniej krawędzi, na pasie spod kursora.
    expect(spawned).toMatchObject({
      kind: 'civilian-car',
      name: 'Furgon',
      hp: 10,
      x: 2750,
      y: 1050,
    });
    expect(spawned.imageUrl).toMatch(/^\/art\/vehicles\//);

    await nextRound('runda 2');
    const [row] = await obstacleRows();
    expect(row).toMatchObject({ blockingId: carA.id, driftRound: 2 });
    // Zderzak auta (1800 + 250) plus połowa furgonu (250).
    expect(row!.x).toBeCloseTo(2300, 0);
    const note = await built.prisma.chatMessage.findFirst({
      where: { kind: 'action', text: 'Przeszkoda na drodze' },
    });
    expect(note).not.toBeNull();
    // Najpierw odpowiedź — jazda czeka.
    expect(
      await emitAck(player, 'chase:move', { sceneVehicleId: carA.id, x: 1900, y: 1050 }),
    ).toMatchObject({ ok: false, error: 'OBSTACLE_PENDING' });
  });

  it('udany Gwałtowny skręt: przeszkoda znika z drogi, auto bez szkody', async () => {
    const [row] = await obstacleRows();
    // 8 + 4 + 5 = 17 ≥ 13.
    scriptDice([5]);
    const view = data(
      await emitAck<SceneVehicleView>(player, 'chase:obstacle-answer', {
        obstacleId: row!.id,
        choice: 'swerve',
      }),
      'chase:obstacle-answer swerve',
    );
    expect(view).toMatchObject({ control: 'driver', hp: 45 });
    // Przeszkoda reaguje tylko z pierwszym autem (decyzja MG z 04.11.2026).
    expect((await obstacleRows()).some((entry) => entry.id === row!.id)).toBe(false);
    const card = await built.prisma.chatMessage.findFirst({
      where: { kind: 'roll', text: { startsWith: 'Manewr: Gwałtowny skręt' } },
    });
    expect(card).not.toBeNull();
    expect(
      await emitAck(player, 'chase:obstacle-answer', { obstacleId: row!.id, choice: 'ram' }),
    ).toMatchObject({ ok: false });
  });

  it('taranowanie rozbija słabą przeszkodę i zabiera autu 6k6', async () => {
    data(
      await emitAck<ChaseObstacleView>(gm, 'chase:obstacle-spawn', {
        sceneId: scene.id,
        kind: 'civilian-car',
        name: 'Taksówka',
        hp: 10,
        x: 500,
        y: 1050,
      }),
      'chase:obstacle-spawn 2',
    );
    // Kolczatka gangu (Akcja kierowcy-NPC-a w jego turze) — ląduje za autem B.
    const dropped = data(
      await emitAck<SceneVehicleView>(gm, 'vehicle:spikes', { sceneVehicleId: carB.id }),
      'vehicle:spikes',
    );
    expect(dropped).toMatchObject({ spikesLeft: 0, refillable: true });
    expect(await emitAck(gm, 'vehicle:spikes', { sceneVehicleId: carB.id })).toMatchObject({
      ok: false,
      error: 'NO_SPIKES',
    });
    expect(await emitAck(player, 'vehicle:spikes', { sceneVehicleId: carA.id })).toMatchObject({
      ok: false,
      error: 'NO_SPIKES',
    });
    const spikes = (await obstacleRows()).find((entry) => entry.kind === 'spikes')!;
    expect(spikes).toMatchObject({ x: 1000 - 250 - 50 - 5, y: 750, droppedById: carB.id });
    // MG uzupełnia wyrzutnię (03.11) — gracz nie może.
    expect(await emitAck(player, 'vehicle:refill', { sceneVehicleId: carB.id })).toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(
      data(
        await emitAck<SceneVehicleView>(gm, 'vehicle:refill', { sceneVehicleId: carB.id }),
        'vehicle:refill',
      ),
    ).toMatchObject({ spikesLeft: 1, refillable: false });
    await built.prisma.sceneVehicle.update({ where: { id: carB.id }, data: { spikesUsed: 1 } });

    // Runda 3: taksówka staje przed Vex, a auto bez kierowcy wjeżdża na kolczatkę
    // (bez kierowcy Testu nie ma — 4k6 w słaby punkt: 3+3+3+3 = 12, po OB 0 ×2 = 24).
    scriptDice([3, 3, 3, 3]);
    await nextRound('runda 3');
    expect((await statsOf((await placedRow(carC.id)).vehicleId)).hp).toBe(45 - 24);
    // Kolczatka reaguje tylko z pierwszym autem, potem znika (decyzja MG z 04.11.2026).
    expect((await obstacleRows()).some((entry) => entry.kind === 'spikes')).toBe(false);
    // Gang jedzie z przodu — po własnej kolczatce nie przejeżdża.
    expect((await statsOf((await placedRow(carB.id)).vehicleId)).hp).toBe(45);

    const taxi = (await obstacleRows()).find((entry) => entry.name === 'Taksówka')!;
    expect(taxi.blockingId).toBe(carA.id);
    // Taksówka 36 (rozbita), auto Vex 6.
    scriptDice([6, 6, 6, 6, 6, 6, 1, 1, 1, 1, 1, 1]);
    const view = data(
      await emitAck<SceneVehicleView>(player, 'chase:obstacle-answer', {
        obstacleId: taxi.id,
        choice: 'ram',
      }),
      'chase:obstacle-answer ram',
    );
    expect(view.hp).toBe(45 - 6);
    expect((await obstacleRows()).some((entry) => entry.id === taxi.id)).toBe(false);
    const broken = await built.prisma.chatMessage.findFirst({
      where: { kind: 'action', text: 'Przeszkoda rozbita' },
    });
    expect(broken).not.toBeNull();
    // Sześć szóstek w przeszkodę nie obiecuje Rany krytycznej (zaległość 66c z 04.11).
    const taxiRoll = await built.prisma.chatMessage.findFirst({
      where: { kind: 'roll', text: { contains: '→ Taksówka' } },
    });
    expect(JSON.parse(taxiRoll!.payload!)).toMatchObject({ total: 36, criticalDamage: false });
  });

  it('auto bez kierowcy wjeżdża w przeszkodę samo; MG zdejmuje przeszkody z drogi', async () => {
    // Auto cywilne na pasie auta bez kierowcy (C stoi na x = 300, przód 550);
    // na aucie gangu (B, x = 1000) stoi od wypuszczenia, więc go nie trafia.
    const lane = data(
      await emitAck<ChaseObstacleView>(gm, 'chase:obstacle-spawn', {
        sceneId: scene.id,
        kind: 'civilian-car',
        hp: 50,
        x: 500,
        y: 750,
      }),
      'chase:obstacle-spawn 3',
    );
    // Wypuszczona na x = 2750 jechałaby kilka rund — stawiamy ją bliżej.
    await built.prisma.chaseObstacle.update({ where: { id: lane.id }, data: { x: 1100 } });
    const hpBefore = (await statsOf((await placedRow(carC.id)).vehicleId)).hp;
    // Barykada 6k6 → 6 (zostaje), auto C 6k6 → 6.
    scriptDice([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    await nextRound('runda 4');
    expect((await statsOf((await placedRow(carC.id)).vehicleId)).hp).toBe(hpBefore - 6);
    // Przeżyła zderzenie (44 PW), ale reaguje tylko z pierwszym autem — znika
    // (decyzja MG z 04.11.2026; do tego dnia stawała za autem C).
    expect((await obstacleRows()).some((entry) => entry.id === lane.id)).toBe(false);

    for (const entry of await obstacleRows()) {
      expect((await emitAck(gm, 'chase:obstacle-remove', { obstacleId: entry.id })).ok).toBe(true);
    }
    expect(await obstacleRows()).toEqual([]);
    expect(await emitAck(player, 'chase:obstacle-remove', { obstacleId: lane.id })).toMatchObject({
      ok: false,
    });
  });
});
