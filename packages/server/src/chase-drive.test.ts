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
  ChaseSyncBroadcast,
  SceneUpdateBroadcast,
  CombatView,
  SceneVehicleView,
  SceneView,
  SocketAck,
  TokenView,
  VehicleDriveResult,
  VehicleView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';

/**
 * Etap 72 na żywych gniazdach: jazda w pościgu. Auto ma prędkość trwającą między
 * turami i pas ruchu; rusza się raz na rundę w turze swojego kierowcy
 * (`vehicle:drive` — gaz, hamulec, pas), a bez „Jedź” jedzie samo na koniec
 * tury. Na początku rundy kadr sztywno stawia auto drużyny na swoim miejscu,
 * auta bez tury jadą od razu, a to, co wyjechało za krawędź, odpada.
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
let ownerCookie: string;
let ownerId: string;
let riderCookie: string;
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
    payload: { name: 'Wiadukt' },
  });
  campaignId = (campaignRes.json() as CampaignSummary).id;
  const ownerRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Kord'),
  });
  ownerCookie = cookieOf(ownerRes.headers['set-cookie']);
  ownerId = (ownerRes.json() as { user: { id: string } }).user.id;
  const riderRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Wega'),
  });
  riderCookie = cookieOf(riderRes.headers['set-cookie']);
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

/** Wiersz sceny z kolumnami modelu jazdy (prędkość pościgu, suma przesunięć). */
const sceneRow = (id: string) => built.prisma.scene.findUniqueOrThrow({ where: { id } });
const vehicleRow = (id: string) =>
  built.prisma.sceneVehicle.findUniqueOrThrow({ where: { id }, include: { vehicle: true } });

/** Widok auta z najbliższego `chase:sync` po przestawieniu go w miejscu ręką MG. */
async function viewOf(gm: ClientSocket, sceneId: string, id: string): Promise<SceneVehicleView> {
  const synced = waitForMatch<ChaseSyncBroadcast>(
    gm,
    'chase:sync',
    (payload) => payload.sceneId === sceneId,
  );
  const current = await vehicleRow(id);
  await emitAck(gm, 'chase:move', { sceneVehicleId: id, x: current.x, y: current.y });
  return (await synced).vehicles.find((vehicle) => vehicle.id === id)!;
}

/** Scena pościgu 2400 × 1800, kratka 100 px, jazda w prawo, jezdnia 6–12 — dwa pasy po 3 kratki. */
async function chaseScene(gm: ClientSocket, owner: ClientSocket, name: string): Promise<SceneView> {
  const created = data(
    await emitAck<SceneView>(gm, 'scene:create', { name, kind: 'chase' }),
    'scene:create',
  );
  const scene = data(
    await emitAck<SceneView>(gm, 'scene:update', {
      sceneId: created.id,
      patch: {
        width: 2400,
        height: 1800,
        grid: { sizePx: 100 },
        chase: { direction: 'right', road: { from: 6, to: 12 }, tempo: 40 },
      },
    }),
    'scene:update',
  );
  const activated = waitForMatch(owner, 'scene:activate', () => true);
  await emitAck(gm, 'scene:activate', { sceneId: scene.id });
  await activated;
  // MG patrzy na tę scenę — `combat:next` idzie za oglądaną sceną gniazda.
  data(await emitAck(gm, 'scene:view', { sceneId: scene.id }), 'scene:view');
  return scene;
}

/** Postać gracza z REF 8 i Prowadzeniem 4 — zwykła jazda bez Testu, ruch nie zależy od kości. */
async function steadyDriver(gm: ClientSocket, name: string): Promise<CharacterView> {
  const hero = data(
    await emitAck<CharacterView<Record<string, Record<string, number>>>>(gm, 'character:create', {
      name,
      ownerId,
    }),
    'character:create',
  );
  data(
    await emitAck(gm, 'character:update', {
      characterId: hero.id,
      patch: {
        data: {
          stats: { ...hero.data.stats, ref: 8 },
          skills: { ...hero.data.skills, driving: 4 },
        },
      },
    }),
    'character:update',
  );
  return hero;
}

async function place(
  gm: ClientSocket,
  sceneId: string,
  vehicleId: string,
  x: number,
  y: number,
): Promise<SceneVehicleView> {
  return data(
    await emitAck<SceneVehicleView>(gm, 'chase:place', { sceneId, vehicleId, x, y }),
    'chase:place',
  );
}

async function seat(socket: ClientSocket, tokenId: string, sceneVehicleId: string, seatNo = 0) {
  const ack = await emitAck(socket, 'vehicle:seat', { tokenId, sceneVehicleId, seat: seatNo });
  if (!ack.ok) throw new Error(`vehicle:seat failed: ${JSON.stringify(ack)}`);
}

/**
 * „Następna tura” MG. Runda z dwoma kierowcami staje na Wyścigu (72c) i czeka
 * na kubek gracza — te testy nie są o Wyścigu, więc MG go pomija drugim
 * kliknięciem (zryw 0 dla wszystkich, bez utraty kontroli).
 */
async function next(gm: ClientSocket, what: string): Promise<CombatView> {
  const view = data(await emitAck<CombatView>(gm, 'combat:next'), what);
  if (view.round < 1 || view.activeCombatantId !== null) return view;
  return data(await emitAck<CombatView>(gm, 'combat:next'), `${what} — pomija Wyścig`);
}

async function startCombat(
  gm: ClientSocket,
  sceneId: string,
  order: string[],
): Promise<CombatView> {
  const started = data(
    await emitAck<CombatView>(gm, 'combat:start', { sceneId, tokenIds: order }),
    'combat:start',
  );
  for (const [index, tokenId] of order.entries()) {
    await built.prisma.combatant.updateMany({
      where: { combatId: started.id, tokenId },
      data: { initiative: 20 - index },
    });
  }
  return next(gm, 'combat:next round 1');
}

describe('etap 72: jazda w turze kierowcy — prędkość, pas i kadr', () => {
  let gm: ClientSocket;
  let owner: ClientSocket;
  let rider: ClientSocket;
  let scene: SceneView;
  let car: SceneVehicleView;
  let heroToken: TokenView;

  it('poza walką kierowca przesuwa auto ręką, a kokpit jeszcze nie działa', async () => {
    gm = await connect(gmCookie);
    owner = await connect(ownerCookie);
    rider = await connect(riderCookie);
    scene = await chaseScene(gm, owner, 'Autostrada');
    const hero = await steadyDriver(gm, 'Iskra');
    const vehicle = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', {
        catalogId: 'vehicle.sample-kompakt',
        ownerCharacterId: hero.id,
      }),
      'vehicle:create',
    );
    car = await place(gm, scene.id, vehicle.id, 1200, 750);
    // Kompakt: Ruch 20 = 100 mil/h. Bez kierowcy ruszy z prędkością 0.
    expect(car).toMatchObject({
      control: 'none',
      speed: 0,
      maxSpeed: 20,
      lane: 0,
      moved: false,
      party: true,
      moving: false,
    });
    heroToken = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Iskra',
        x: 100,
        y: 100,
        ownerId,
        characterId: hero.id,
      }),
      'token:create',
    );
    await seat(owner, heroToken.id, car.id);
    const moved = data(
      await emitAck<SceneVehicleView>(owner, 'chase:move', {
        sceneVehicleId: car.id,
        x: 1900,
        y: 750,
      }),
      'chase:move out of combat',
    );
    // Z kierowcą ruszy z prędkością startową sceny (40), najwyżej swoim Ruchem.
    expect(moved).toMatchObject({ x: 1900, control: 'driver', speed: 20, moving: true });
    expect(
      await emitAck(rider, 'chase:move', { sceneVehicleId: car.id, x: 1000, y: 750 }),
    ).toMatchObject({ ok: false, error: 'NOT_DRIVER' });
    expect(
      await emitAck(owner, 'vehicle:drive', { sceneVehicleId: car.id, pedal: 'gas', laneDelta: 0 }),
    ).toMatchObject({ ok: false, error: 'DRIVE_COMBAT_ONLY' });
  });

  it('runda 1: prędkość startowa, a kadr sztywno stawia auto drużyny na 30% od tyłu', async () => {
    const seatedBefore = await built.prisma.token.findUniqueOrThrow({
      where: { id: heroToken.id },
    });
    // Gracz dowiaduje się o rundzie z widoku sceny (72b2): prędkość pościgu
    // włącza mu kokpit, suma przesunięć przesuwa drogę razem z autami.
    const seen = waitForMatch<SceneUpdateBroadcast>(
      owner,
      'scene:update',
      (payload) => payload.scene.id === scene.id && payload.scene.chase.pursuitSpeed !== null,
    );
    await startCombat(gm, scene.id, [heroToken.id]);
    expect((await seen).scene.chase).toMatchObject({ pursuitSpeed: 20 });
    expect((await seen).scene.chase.shiftSq).toBeCloseTo(-11.8);
    // 30% z 2400 px = 720: przesunięcie −11,8 kratki niesie auto i figurę w fotelu.
    expect(await vehicleRow(car.id)).toMatchObject({ x: 720, y: 750, speed: 20 });
    const row = await sceneRow(scene.id);
    expect(row.chasePursuitSpeed).toBe(20);
    expect(row.chaseShiftSq).toBeCloseTo(-11.8);
    const seatedAfter = await built.prisma.token.findUniqueOrThrow({ where: { id: heroToken.id } });
    expect(seatedAfter.x).toBeCloseTo(seatedBefore.x - 1180);
  });

  it('w walce gracz nie ciągnie auta: gaz, hamulec i pas, raz na rundę', async () => {
    expect(
      await emitAck(owner, 'chase:move', { sceneVehicleId: car.id, x: 900, y: 750 }),
    ).toMatchObject({ ok: false, error: 'USE_COCKPIT' });
    expect(
      await emitAck(owner, 'vehicle:drive', { sceneVehicleId: car.id, pedal: 'gas', laneDelta: 0 }),
    ).toMatchObject({ ok: false, error: 'AT_MAX_SPEED' });
    expect(
      await emitAck(owner, 'vehicle:drive', { sceneVehicleId: car.id, pedal: null, laneDelta: -1 }),
    ).toMatchObject({ ok: false, error: 'LANE_EDGE' });

    // Hamulec: 20 → 0, przy prędkości pościgu 20 auto cofa się o 5 kratek; pas niżej.
    const result = data(
      await emitAck<VehicleDriveResult>(owner, 'vehicle:drive', {
        sceneVehicleId: car.id,
        pedal: 'brake',
        laneDelta: 1,
      }),
      'vehicle:drive brake',
    );
    expect(result).toMatchObject({
      moved: true,
      vehicle: { x: 220, y: 1050, speed: 0, lane: 1, moved: true },
    });
    expect(
      await emitAck(owner, 'vehicle:drive', { sceneVehicleId: car.id, pedal: null, laneDelta: 0 }),
    ).toMatchObject({ ok: false, error: 'ALREADY_DROVE' });
    // Kierowca dalej nie biega, a Kompakt nie ma Nitro.
    expect(await emitAck(owner, 'combat:action', { actionId: 'run' })).toMatchObject({
      ok: false,
      error: 'RUN_BLOCKED',
    });
    expect(await emitAck(owner, 'vehicle:nitro', { sceneVehicleId: car.id })).toMatchObject({
      ok: false,
      error: 'NO_NITRO',
    });
  });

  it('runda 2: stojące auto kadru zatrzymuje pościg; kadr przesuwa się raz na rundę', async () => {
    await next(gm, 'combat:next round 2');
    expect(await vehicleRow(car.id)).toMatchObject({ x: 720, y: 1050, speed: 0 });
    const after = await sceneRow(scene.id);
    expect(after.chasePursuitSpeed).toBe(0);
    expect(after.chaseShiftSq).toBeCloseTo(-6.8);

    data(await emitAck<CombatView>(gm, 'combat:previous'), 'combat:previous');
    await next(gm, 'combat:next round 2 again');
    expect((await vehicleRow(car.id)).x).toBe(720);
    expect((await sceneRow(scene.id)).chaseShiftSq).toBeCloseTo(-6.8);
  });

  it('gaz przy stojącym pościgu wysuwa auto do przodu, a następna runda je dogania', async () => {
    const result = data(
      await emitAck<VehicleDriveResult>(owner, 'vehicle:drive', {
        sceneVehicleId: car.id,
        pedal: 'gas',
        laneDelta: 0,
      }),
      'vehicle:drive gas',
    );
    // 0 → 10 Ruchu (50 mil/h): (10 − 0) / 4 = 2,5 kratki do przodu.
    expect(result).toMatchObject({ moved: true, vehicle: { x: 970, speed: 10 } });
    await next(gm, 'combat:next round 3');
    expect(await vehicleRow(car.id)).toMatchObject({ x: 720, speed: 10 });
    expect((await sceneRow(scene.id)).chasePursuitSpeed).toBe(10);
  });

  it('auto bez kontroli jedzie samo na koniec tury: 1k6 na pas, a kontrola wraca z rundą', async () => {
    await built.prisma.sceneVehicle.update({
      where: { id: car.id },
      data: { lostControl: true },
    });
    expect(
      await emitAck(owner, 'vehicle:drive', { sceneVehicleId: car.id, pedal: null, laneDelta: 0 }),
    ).toMatchObject({ ok: false, error: 'VEHICLE_OUT_OF_CONTROL' });
    await next(gm, 'combat:next round 4');
    const line = await built.prisma.chatMessage.findFirst({
      where: { campaignId, kind: 'action', text: 'Utrata kontroli' },
      orderBy: { id: 'desc' },
    });
    expect(line?.payload).toMatch(/1k6: [1-6] — (pas wyżej|prosto|pas niżej)/);
    expect(await vehicleRow(car.id)).toMatchObject({ lostControl: false, movedRound: 3 });
  });

  it('zgaszony silnik nie jedzie, a gracz uruchamia go sam', async () => {
    data(
      await emitAck<SceneVehicleView>(owner, 'vehicle:engine', {
        sceneVehicleId: car.id,
        on: false,
      }),
      'vehicle:engine off',
    );
    expect(
      await emitAck(owner, 'vehicle:drive', { sceneVehicleId: car.id, pedal: null, laneDelta: 0 }),
    ).toMatchObject({ ok: false, error: 'VEHICLE_NOT_STARTED' });
    // Uruchomienie to Akcja, a Akcję tej tury zjadło zgaszenie — następna tura.
    await next(gm, 'combat:next round 5');
    const on = data(
      await emitAck<SceneVehicleView>(owner, 'vehicle:engine', {
        sceneVehicleId: car.id,
        on: true,
      }),
      'vehicle:engine on',
    );
    expect(on.started).toBe(true);
  });

  // Zaległość z 04.11: eskorta zablokowana na stojącej drodze nie miała jak
  // odjechać — MG zdejmuje auto z pościgu ręką, jak wyjazd przednią krawędzią.
  it('MG: „Ucieka” zdejmuje auto z pościgu razem z załogą i jej turą', async () => {
    const combat = await built.prisma.combat.findFirstOrThrow({ where: { sceneId: scene.id } });
    expect(await emitAck(owner, 'chase:escape', { sceneVehicleId: car.id })).toMatchObject({
      ok: false,
    });
    const hidden = waitForMatch<ChaseSyncBroadcast>(
      owner,
      'chase:sync',
      (payload) => payload.sceneId === scene.id && payload.vehicles.length === 0,
    );
    const gone = data(
      await emitAck<SceneVehicleView>(gm, 'chase:escape', { sceneVehicleId: car.id }),
      'chase:escape',
    );
    await hidden;
    expect(gone.status).toBe('escaped');
    const after = await built.prisma.combat.findUnique({
      where: { id: combat.id },
      include: { combatants: true },
    });
    expect(after?.combatants).toEqual([]);
    expect(after?.activeCombatantId).toBeNull();
    const note = await built.prisma.chatMessage.findFirst({
      where: { campaignId, kind: 'action', text: 'Ucieka' },
    });
    expect(note).not.toBeNull();
    const back = data(
      await emitAck<SceneVehicleView>(gm, 'chase:restore', { sceneVehicleId: car.id }),
      'chase:restore after escape',
    );
    expect(back.status).toBe('racing');
  });

  it('koniec walki zdejmuje prędkości — poza walką widać prędkość startową', async () => {
    const seen = waitForMatch<SceneUpdateBroadcast>(
      owner,
      'scene:update',
      (payload) => payload.scene.id === scene.id && payload.scene.chase.pursuitSpeed === null,
    );
    expect((await emitAck(gm, 'combat:end')).ok).toBe(true);
    await seen;
    expect(await vehicleRow(car.id)).toMatchObject({ speed: 0, movedRound: 0 });
    expect((await sceneRow(scene.id)).chasePursuitSpeed).toBeNull();
    expect(await viewOf(gm, scene.id, car.id)).toMatchObject({ speed: 20, moved: false });
  });
});

describe('etap 72: koniec tury bez „Jedź”, zderzenie na drodze i auta bez tury', () => {
  let gm: ClientSocket;
  let owner: ClientSocket;
  let scene: SceneView;
  let party: SceneVehicleView;
  let chaser: SceneVehicleView;
  let wreck: SceneVehicleView;
  let heroToken: TokenView;
  let npcDriver: TokenView;

  it('stawia scenę: auto drużyny, szybki pościg za nim na tym samym pasie, pusty furgon', async () => {
    gm = await connect(gmCookie);
    owner = await connect(ownerCookie);
    scene = await chaseScene(gm, owner, 'Wiadukt');
    const hero = await steadyDriver(gm, 'Rdza');
    const ours = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', {
        catalogId: 'vehicle.sample-kompakt',
        ownerCharacterId: hero.id,
      }),
      'vehicle:create ours',
    );
    // Strzała: Ruch 60 — na starcie prędkość startowa sceny 40 (200 mil/h).
    const fast = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', { catalogId: 'vehicle.sample-strzala' }),
      'vehicle:create chaser',
    );
    const empty = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', { catalogId: 'vehicle.sample-kompakt' }),
      'vehicle:create empty',
    );
    party = await place(gm, scene.id, ours.id, 1200, 750);
    chaser = await place(gm, scene.id, fast.id, 500, 750);
    wreck = await place(gm, scene.id, empty.id, 1200, 1050);
    heroToken = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Rdza',
        x: 100,
        y: 100,
        ownerId,
        characterId: hero.id,
      }),
      'token:create hero',
    );
    npcDriver = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Wolt',
        x: 100,
        y: 300,
      }),
      'token:create npc',
    );
    await seat(owner, heroToken.id, party.id);
    await seat(gm, npcDriver.id, chaser.id);
    await startCombat(gm, scene.id, [heroToken.id, npcDriver.id]);
    // Kadr: auto drużyny 1200 → 720 (−4,8 kratki), reszta o tyle samo.
    expect(await vehicleRow(party.id)).toMatchObject({ x: 720, speed: 20 });
    expect(await vehicleRow(chaser.id)).toMatchObject({ x: 20, speed: 40 });
    expect(await vehicleRow(wreck.id)).toMatchObject({ x: 720, speed: 0 });
  });

  it('MG prowadzi auto NPC-a tylko w turze jego kierowcy', async () => {
    expect(
      await emitAck(gm, 'vehicle:drive', { sceneVehicleId: chaser.id, pedal: null, laneDelta: 0 }),
    ).toMatchObject({ ok: false, error: 'NOT_YOUR_TURN' });
    // Rdza kończy turę bez „Jedź”: ta sama prędkość co pościg — auto stoi w kadrze.
    await next(gm, 'combat:next to Wolt');
    expect(await vehicleRow(party.id)).toMatchObject({ x: 720, movedRound: 1 });
  });

  it('szybszy dojeżdża do wolniejszego: serwer pyta, a „Zwolnij za nim” bierze jego prędkość', async () => {
    // (40 − 20) / 4 = +5 kratek, a po 2 kratkach stoi auto drużyny.
    const asked = data(
      await emitAck<VehicleDriveResult>(gm, 'vehicle:drive', {
        sceneVehicleId: chaser.id,
        pedal: null,
        laneDelta: 0,
      }),
      'vehicle:drive asks',
    );
    expect(asked).toEqual({
      moved: false,
      contact: { name: 'Kompakt Zetka', kind: 'vehicle', side: false, canSlow: true, speed: 20 },
    });
    expect((await vehicleRow(chaser.id)).movedRound).toBe(0);
    const slowed = data(
      await emitAck<VehicleDriveResult>(gm, 'vehicle:drive', {
        sceneVehicleId: chaser.id,
        pedal: null,
        laneDelta: 0,
        onContact: 'slow',
      }),
      'vehicle:drive slow',
    );
    expect(slowed).toMatchObject({ moved: true, vehicle: { speed: 20, moved: true } });
    expect((await vehicleRow(chaser.id)).x).toBeCloseTo(220, 0);
  });

  it('auto bez tury jedzie na początku rundy: pusty furgon zostaje w tyle i odpada', async () => {
    // Furgon bez kierowcy stoi (0), pościg jedzie 20: −5 kratek na rundę.
    await next(gm, 'combat:next round 2');
    expect(await vehicleRow(wreck.id)).toMatchObject({ x: 220, movedRound: 2 });
    // Rdza — znowu bez „Jedź”; Wolt też: z auta dojeżdżającego wolniejszego nic nie zostaje.
    await next(gm, 'combat:next to Wolt');
    await next(gm, 'combat:next round 3');
    expect(await vehicleRow(wreck.id)).toMatchObject({ status: 'behind' });
    const note = await built.prisma.chatMessage.findFirst({
      where: { campaignId, kind: 'action', text: 'Zostaje w tyle' },
    });
    expect(note).not.toBeNull();
  });

  it('koniec tury bez „Jedź”, gdy hamulec nie wystarcza — taranowanie', async () => {
    // MG podkręca pościg do 60 (300 mil/h): różnica 40 > 20 — zwykły hamulec nie wystarczy.
    await built.prisma.sceneVehicle.update({ where: { id: chaser.id }, data: { speed: 60 } });
    const hpBefore = (await viewOf(gm, scene.id, party.id)).hp;
    await next(gm, 'combat:next to Wolt');
    await next(gm, 'combat:next round 4');
    const card = await built.prisma.chatMessage.findFirst({
      where: { campaignId, kind: 'action', text: 'Taranowanie' },
    });
    expect(card).not.toBeNull();
    expect((await viewOf(gm, scene.id, party.id)).hp).toBeLessThan(hpBefore);
  });
});
