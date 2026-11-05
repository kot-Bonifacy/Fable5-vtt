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
  CombatView,
  SceneVehicleView,
  SceneView,
  SocketAck,
  TokenView,
  VehicleView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';

/**
 * Etap 65c na żywych gniazdach: jazda w pościgu. Kierowca sam przesuwa auto —
 * poza walką bez budżetu, w walce za metry Akcji Ruchu (`Ruch / 4` kratek, bez
 * Biegu). Na początku rundy auto dryfuje o `(Ruch − tempo) / 4`, raz na rundę,
 * a auto za tylną krawędzią zostaje w tyle: jego figury wychodzą z kolejki, MG
 * je przywraca. Zgaszony silnik nie jedzie.
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

describe('etap 65c: jazda, tempo i odpadanie', () => {
  let gm: ClientSocket;
  let owner: ClientSocket;
  let rider: ClientSocket;
  let scene: SceneView;
  let car: SceneVehicleView;
  let heroToken: TokenView;

  const carRow = () => built.prisma.sceneVehicle.findUniqueOrThrow({ where: { id: car.id } });
  const tokenRow = (id: string) => built.prisma.token.findUniqueOrThrow({ where: { id } });

  it('kierowca poza walką przesuwa swoje auto bez budżetu, pasażer — nie', async () => {
    gm = await connect(gmCookie);
    owner = await connect(ownerCookie);
    rider = await connect(riderCookie);
    scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Autostrada', kind: 'chase' }),
      'scene:create',
    );
    scene = data(
      await emitAck<SceneView>(gm, 'scene:update', {
        sceneId: scene.id,
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

    const hero = data(
      await emitAck<CharacterView<Record<string, Record<string, number>>>>(gm, 'character:create', {
        name: 'Iskra',
        ownerId,
      }),
      'character:create',
    );
    // REF + Prowadzenie > 9 — zwykła jazda bez Testu, więc ruch nie zależy od kości.
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
    const vehicle = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', {
        catalogId: 'vehicle.sample-kompakt',
        ownerCharacterId: hero.id,
      }),
      'vehicle:create',
    );
    car = data(
      await emitAck<SceneVehicleView>(gm, 'chase:place', {
        sceneId: scene.id,
        vehicleId: vehicle.id,
        x: 1200,
        y: 900,
      }),
      'chase:place',
    );
    // Kompakt: Ruch 20 — 5 kratek na Akcję Ruchu. Auto drużyny bez kierowcy stoi,
    // więc droga stoi razem z nim (decyzja MG z 05.11.2026): bez dryfu.
    expect(car).toMatchObject({
      started: true,
      control: 'none',
      moveSq: 5,
      driftSq: 0,
      speed: 0,
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
    const seated = await emitAck(owner, 'vehicle:seat', {
      tokenId: heroToken.id,
      sceneVehicleId: car.id,
      seat: 0,
    });
    expect(seated.ok).toBe(true);

    const moved = data(
      await emitAck<SceneVehicleView>(owner, 'chase:move', {
        sceneVehicleId: car.id,
        x: 1900,
        y: 900,
      }),
      'chase:move out of combat',
    );
    // Z kierowcą jedzie Ruchem 20 przy tempie 40: dryf −5.
    expect(moved).toMatchObject({ x: 1900, y: 900, control: 'driver', driftSq: -5, moving: true });
    expect(
      await emitAck(rider, 'chase:move', { sceneVehicleId: car.id, x: 1000, y: 900 }),
    ).toMatchObject({ ok: false, error: 'NOT_DRIVER' });
  });

  it('w walce auto jedzie z Akcji Ruchu kierowcy, a Biegu nie ma', async () => {
    const started = data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId: scene.id,
        tokenIds: [heroToken.id],
      }),
      'combat:start',
    );
    await built.prisma.combatant.updateMany({
      where: { combatId: started.id },
      data: { initiative: 12 },
    });
    data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next round 1');

    expect(
      await emitAck(owner, 'chase:move', { sceneVehicleId: car.id, x: 1200, y: 900 }),
    ).toMatchObject({ ok: false, error: 'NO_MOVE_LEFT' });
    data(
      await emitAck<SceneVehicleView>(owner, 'chase:move', {
        sceneVehicleId: car.id,
        x: 1500,
        y: 900,
      }),
      'chase:move in budget',
    );
    data(
      await emitAck<SceneVehicleView>(owner, 'chase:move', {
        sceneVehicleId: car.id,
        x: 1400,
        y: 900,
      }),
      'chase:move rest of budget',
    );
    expect(
      await emitAck(owner, 'chase:move', { sceneVehicleId: car.id, x: 1300, y: 900 }),
    ).toMatchObject({ ok: false, error: 'NO_MOVE_LEFT' });
    expect(await emitAck(owner, 'combat:action', { actionId: 'run' })).toMatchObject({
      ok: false,
      error: 'RUN_BLOCKED',
    });
    expect(await emitAck(owner, 'vehicle:nitro', { sceneVehicleId: car.id })).toMatchObject({
      ok: false,
      error: 'NO_NITRO',
    });
  });

  it('nowa runda przesuwa auto i figury o dryf — raz na rundę', async () => {
    data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next round 2');
    expect(await carRow()).toMatchObject({ x: 900, driftRound: 2, status: 'racing' });
    expect((await tokenRow(heroToken.id)).x).toBeLessThan(1000);

    data(await emitAck<CombatView>(gm, 'combat:previous'), 'combat:previous');
    data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next round 2 again');
    expect((await carRow()).x).toBe(900);
  });

  it('auto za tylną krawędzią zostaje w tyle i schodzi z kolejki; MG je przywraca', async () => {
    data(
      await emitAck<SceneVehicleView>(gm, 'chase:move', { sceneVehicleId: car.id, x: 0, y: 900 }),
      'chase:move to the edge',
    );
    expect((await carRow()).x).toBe(250);
    const hidden = waitForMatch<ChaseSyncBroadcast>(
      owner,
      'chase:sync',
      (payload) => payload.sceneId === scene.id && payload.vehicles.length === 0,
    );
    const view = data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next round 3');
    await hidden;
    expect(await carRow()).toMatchObject({ status: 'behind' });
    expect(view.combatants).toEqual([]);
    const note = await built.prisma.chatMessage.findFirst({
      where: { campaignId, kind: 'action', text: 'Zostaje w tyle' },
    });
    expect(note).not.toBeNull();

    const back = data(
      await emitAck<SceneVehicleView>(gm, 'chase:restore', { sceneVehicleId: car.id }),
      'chase:restore',
    );
    expect(back).toMatchObject({ status: 'racing', x: 250 });
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
      await emitAck(owner, 'chase:move', { sceneVehicleId: car.id, x: 600, y: 900 }),
    ).toMatchObject({ ok: false, error: 'VEHICLE_NOT_STARTED' });
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
    const joined = data(
      await emitAck<CombatView>(gm, 'combat:add', { tokenIds: [heroToken.id] }),
      'combat:add',
    );
    const hero = joined.combatants.find((row) => row.tokenId === heroToken.id)!;
    await built.prisma.combat.update({
      where: { id: joined.id },
      data: { activeCombatantId: hero.id },
    });
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
    const combat = await built.prisma.combat.findUnique({
      where: { id: joined.id },
      include: { combatants: true },
    });
    expect(combat?.combatants).toEqual([]);
    expect(combat?.activeCombatantId).toBeNull();
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
});

describe('rama pościgu i auto bez kierowcy (decyzja MG z 05.11.2026)', () => {
  let gm: ClientSocket;
  let owner: ClientSocket;
  let scene: SceneView;
  let party: SceneVehicleView;
  let npc: SceneVehicleView;
  let heroToken: TokenView;
  let npcDriver: TokenView;

  const row = (id: string) => built.prisma.sceneVehicle.findUniqueOrThrow({ where: { id } });
  const viewOf = async (id: string) => {
    const synced = waitForMatch<ChaseSyncBroadcast>(
      gm,
      'chase:sync',
      (payload) => payload.sceneId === scene.id,
    );
    // Odświeżenie przez przestawienie auta w miejscu — `chase:sync` z widokami.
    const current = await row(id);
    await emitAck(gm, 'chase:move', { sceneVehicleId: id, x: current.x, y: current.y });
    return (await synced).vehicles.find((vehicle) => vehicle.id === id)!;
  };

  it('stojące auto drużyny zatrzymuje drogę, a jadące auto NPC-a odjeżdża do przodu', async () => {
    gm = await connect(gmCookie);
    owner = await connect(ownerCookie);
    scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Estakada', kind: 'chase' }),
      'scene:create',
    );
    scene = data(
      await emitAck<SceneView>(gm, 'scene:update', {
        sceneId: scene.id,
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

    const hero = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Rdza', ownerId }),
      'character:create',
    );
    const ours = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', {
        catalogId: 'vehicle.sample-kompakt',
        ownerCharacterId: hero.id,
      }),
      'vehicle:create ours',
    );
    const theirs = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', { catalogId: 'vehicle.sample-kompakt' }),
      'vehicle:create theirs',
    );
    party = data(
      await emitAck<SceneVehicleView>(gm, 'chase:place', {
        sceneId: scene.id,
        vehicleId: ours.id,
        x: 1200,
        y: 750,
      }),
      'chase:place ours',
    );
    npc = data(
      await emitAck<SceneVehicleView>(gm, 'chase:place', {
        sceneId: scene.id,
        vehicleId: theirs.id,
        x: 600,
        y: 1050,
      }),
      'chase:place theirs',
    );
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
    expect(
      (
        await emitAck(gm, 'vehicle:seat', {
          tokenId: npcDriver.id,
          sceneVehicleId: npc.id,
          seat: 0,
        })
      ).ok,
    ).toBe(true);

    // Auto drużyny bez kierowcy stoi, więc rama stoi: NPC (Ruch 20) jedzie +5.
    expect(await viewOf(party.id)).toMatchObject({
      party: true,
      speed: 0,
      moving: false,
      driftSq: 0,
    });
    expect(await viewOf(npc.id)).toMatchObject({
      party: false,
      speed: 20,
      moving: true,
      driftSq: 5,
    });

    const started = data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId: scene.id,
        tokenIds: [npcDriver.id],
      }),
      'combat:start',
    );
    await built.prisma.combatant.updateMany({
      where: { combatId: started.id },
      data: { initiative: 10 },
    });
    data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next round 1');
    // Runda 1 zapamiętuje pęd: NPC jedzie (20), auto drużyny stoi (0).
    expect(await row(npc.id)).toMatchObject({ momentum: 20 });
    expect(await row(party.id)).toMatchObject({ momentum: 0 });
    data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next round 2');
    expect((await row(party.id)).x).toBe(1200);
    expect((await row(npc.id)).x).toBe(1100);
  });

  it('kierowca pada — auto toczy się i co rundę zwalnia o połowę', async () => {
    // Drużyna siada za kierownicą — rama znów ma tempo 40.
    expect(
      (
        await emitAck(owner, 'vehicle:seat', {
          tokenId: heroToken.id,
          sceneVehicleId: party.id,
          seat: 0,
        })
      ).ok,
    ).toBe(true);
    await built.prisma.token.update({
      where: { id: npcDriver.id },
      data: { statuses: JSON.stringify(['unconscious']) },
    });
    // Pęd 20 → w następnej rundzie 10: dryf (10 − 40) / 4 = −7,5.
    expect(await viewOf(npc.id)).toMatchObject({
      control: 'none',
      speed: 20,
      moving: true,
      driftSq: -7.5,
    });
    // Nieprzytomny Wolt traci turę, więc jedno „Następna tura” to rundy 3 i 4:
    // NPC toczy się 10 (−7,5), potem 5 (−8,75) i wypada za tylną krawędź, a auto
    // drużyny jedzie Ruchem 20 przy tempie 40 (−5 na rundę).
    data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next rounds 3–4');
    expect(await row(npc.id)).toMatchObject({ x: 1100 - 750 - 875, momentum: 5, status: 'behind' });
    expect((await row(party.id)).x).toBe(1200 - 500 - 500);
  });

  it('stan kierowcy z ręki MG odświeża auta bez ruszania nimi (luka z 05.11)', async () => {
    // Rdza za kierownicą Wozu prowadzi; MG nadaje mu „Nieprzytomny” — samo to
    // ma rozesłać auta z `control: 'none'`, bez `chase:move` ani nowej rundy.
    const lost = waitForMatch<ChaseSyncBroadcast>(
      gm,
      'chase:sync',
      (payload) =>
        payload.sceneId === scene.id &&
        payload.vehicles.some((vehicle) => vehicle.id === party.id && vehicle.control === 'none'),
    );
    expect(
      (
        await emitAck(gm, 'token:update', {
          tokenId: heroToken.id,
          patch: { statuses: ['unconscious'] },
        })
      ).ok,
    ).toBe(true);
    await lost;
    const back = waitForMatch<ChaseSyncBroadcast>(
      owner,
      'chase:sync',
      (payload) =>
        payload.sceneId === scene.id &&
        payload.vehicles.some((vehicle) => vehicle.id === party.id && vehicle.control === 'driver'),
    );
    await emitAck(gm, 'token:update', { tokenId: heroToken.id, patch: { statuses: [] } });
    await back;
  });

  it('koniec walki zdejmuje pęd — poza walką auto bez kierowcy stoi', async () => {
    expect((await emitAck(gm, 'combat:end')).ok).toBe(true);
    expect(await row(npc.id)).toMatchObject({ momentum: null });
    expect(await viewOf(npc.id)).toMatchObject({ speed: 0, moving: false });
  });
});
