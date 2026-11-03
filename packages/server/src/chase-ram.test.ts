import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  AttackRollResult,
  CampaignSummary,
  CharacterView,
  CombatView,
  CpredCharacterData,
  SceneVehicleView,
  SceneView,
  SocketAck,
  TokenView,
  VehicleView,
} from '@vtt/shared';
import { cpredMountRowId, readCpredVehicle } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';
import { paceTesting } from './realtime/pace.js';

paceTesting.off = true;

/**
 * Etap 65d2 na żywych gniazdach: Manewr kierowcy (porażka — utrata kontroli),
 * wezwanie MG do Manewru bez kosztu Akcji, taranowanie (auto staje przed
 * przeszkodą albo w nią wjeżdża; Pług bojowy chroni taranującego, Rana dla
 * jadących uderzonym), Unik pieszego i broń pokładowa kierowcy.
 *
 * Kości: `VTT_DICE_SCRIPT`, jak w `hidden-figures.test.ts`. Katalog: próbka
 * z repo plus wymyślony karabin pod id broni pokładowej i rana z taranowania
 * — w katalogu tymczasowym, który zastępuje próbkę w całości.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const DICE = join(mkdtempSync(join(tmpdir(), 'vtt-ram-dice-')), 'dice.txt');
const previousDiceScript = process.env.VTT_DICE_SCRIPT;
function scriptDice(faces: number[]): void {
  writeFileSync(DICE, faces.join(' '));
}

const PUBLIC_DIR = resolve(import.meta.dirname, '../../../data/public');
const PRIVATE_DIR = mkdtempSync(join(tmpdir(), 'vtt-ram-private-'));
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
    payload: { name: 'Pościg na estakadzie' },
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

describe('etap 65d2: Manewr, taranowanie i broń pokładowa', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let scene: SceneView;
  let ours: VehicleView;
  let theirs: VehicleView;
  let carA: SceneVehicleView;
  let carB: SceneVehicleView;
  let vexId: string;
  let vexToken: TokenView;
  let gangerCharacterId: string;

  const placedRow = (id: string) => built.prisma.sceneVehicle.findUniqueOrThrow({ where: { id } });
  const statsOf = async (vehicleId: string) =>
    readCpredVehicle(
      (await built.prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } })).system,
    );
  const sheetOf = async (characterId: string) =>
    JSON.parse(
      (await built.prisma.character.findUniqueOrThrow({ where: { id: characterId } })).data,
    ) as CpredCharacterData;

  it('stawia scenę: auto Vex z Pługiem i karabinem, przed nim auto gangu', async () => {
    gm = await connect(gmCookie);
    player = await connect(playerCookie);
    scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Estakada', kind: 'chase' }),
      'scene:create',
    );
    scene = data(
      await emitAck<SceneView>(gm, 'scene:update', {
        sceneId: scene.id,
        patch: {
          width: 3000,
          height: 1800,
          grid: { sizePx: 100 },
          chase: { direction: 'right', road: { from: 6, to: 12 }, tempo: 40 },
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
    // REF + Prowadzenie > 9 — zwykła jazda bez Testu, Manewr: 12 + k10.
    data(
      await emitAck(gm, 'character:update', {
        characterId: vexId,
        patch: {
          data: {
            stats: { ...vex.data.stats, ref: 8 },
            skills: { driving: 4, autofire: 6 },
          },
        },
      }),
      'character:update',
    );
    const ganger = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Ganger' }),
      'character:create ganger',
    );
    gangerCharacterId = ganger.id;

    ours = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', {
        catalogId: 'vehicle.sample-kompakt',
        ownerCharacterId: vexId,
      }),
      'vehicle:create ours',
    );
    data(
      await emitAck(gm, 'vehicle:update', {
        vehicleId: ours.id,
        patch: {
          system: {
            upgrades: [
              { id: 'u-plow', upgradeId: 'ram', notes: '' },
              { id: 'u-mg', upgradeId: 'machineGun', notes: '' },
            ],
          },
        },
      }),
      'vehicle:update ours',
    );
    theirs = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', { catalogId: 'vehicle.sample-kompakt' }),
      'vehicle:create theirs',
    );
    carA = data(
      await emitAck<SceneVehicleView>(gm, 'chase:place', {
        sceneId: scene.id,
        vehicleId: ours.id,
        x: 800,
        y: 900,
      }),
      'chase:place A',
    );
    carB = data(
      await emitAck<SceneVehicleView>(gm, 'chase:place', {
        sceneId: scene.id,
        vehicleId: theirs.id,
        x: 1600,
        y: 900,
      }),
      'chase:place B',
    );
    // Menu auta: pięć manewrów jezdni z PT, broń pokładowa z pełnym magazynkiem.
    expect(carA.maneuvers.map((entry) => entry.label)).toContain('Zawrót na ręcznym (PT 17)');
    expect(carA.mounts).toEqual([{ id: 'u-mg', upgradeId: 'machineGun' }]);
    expect(carA).toMatchObject({ maneuverCall: null, moving: true });

    vexToken = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Vex',
        x: 100,
        y: 100,
        ownerId: playerId,
        characterId: vexId,
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
    const gangerToken = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Ganger',
        x: 100,
        y: 300,
        characterId: gangerCharacterId,
      }),
      'token:create ganger',
    );
    expect(
      (
        await emitAck(gm, 'vehicle:seat', {
          tokenId: gangerToken.id,
          sceneVehicleId: carB.id,
          seat: 1,
        })
      ).ok,
    ).toBe(true);

    const started = data(
      await emitAck<CombatView>(gm, 'combat:start', { sceneId: scene.id, tokenIds: [vexToken.id] }),
      'combat:start',
    );
    await built.prisma.combatant.updateMany({
      where: { combatId: started.id },
      data: { initiative: 12 },
    });
    data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next round 1');
  });

  it('Manewr gracza kosztuje Akcję, a oblany oddaje auto MG', async () => {
    // 8 + 4 + 1, Krytyczna Porażka odejmuje drugą kość: 12 < 17.
    scriptDice([1, 1]);
    const view = data(
      await emitAck<SceneVehicleView>(player, 'vehicle:maneuver', {
        sceneVehicleId: carA.id,
        maneuverId: 'bootleg',
      }),
      'vehicle:maneuver',
    );
    expect(view.control).toBe('lost');
    expect(await emitAck(player, 'combat:action', { actionId: 'aim' })).toMatchObject({
      ok: false,
    });
    expect(
      await emitAck(player, 'vehicle:maneuver', { sceneVehicleId: carA.id, maneuverId: 'swerve' }),
    ).toMatchObject({ ok: false, error: 'VEHICLE_OUT_OF_CONTROL' });
    const card = await built.prisma.chatMessage.findFirst({
      where: { kind: 'roll', text: { startsWith: 'Manewr: Zawrót na ręcznym' } },
    });
    expect(card).not.toBeNull();
    expect(
      await emitAck(player, 'vehicle:maneuver', { sceneVehicleId: carA.id, maneuverId: 'loop' }),
    ).toMatchObject({ ok: false, error: 'UNKNOWN_MANEUVER' });
    data(
      await emitAck<SceneVehicleView>(gm, 'vehicle:control', { sceneVehicleId: carA.id }),
      'vehicle:control',
    );
  });

  it('na wezwanie MG Manewr nie kosztuje Akcji, a wezwanie znika po rzucie', async () => {
    const called = data(
      await emitAck<SceneVehicleView>(gm, 'vehicle:maneuver-call', {
        sceneVehicleId: carA.id,
        maneuverId: 'swerve',
      }),
      'vehicle:maneuver-call',
    );
    expect(called.maneuverCall).toEqual({ id: 'swerve', label: 'Gwałtowny skręt (PT 13)' });
    expect(
      await emitAck(player, 'vehicle:maneuver-call', { sceneVehicleId: carA.id, maneuverId: null }),
    ).toMatchObject({ ok: false });
    // Akcja tej tury już poszła na Zawrót — wezwanie i tak przechodzi.
    scriptDice([9]);
    const done = data(
      await emitAck<SceneVehicleView>(player, 'vehicle:maneuver', {
        sceneVehicleId: carA.id,
        maneuverId: 'swerve',
      }),
      'vehicle:maneuver called',
    );
    expect(done).toMatchObject({ maneuverCall: null, control: 'driver' });
  });

  it('bez taranowania auto staje przed autem na drodze i płaci tylko za dojazd', async () => {
    const moved = data(
      await emitAck<SceneVehicleView>(player, 'chase:move', {
        sceneVehicleId: carA.id,
        x: 1500,
        y: 900,
      }),
      'chase:move stop',
    );
    // Przód A (x + 250) dotyka tyłu B (1600 − 250): środek A na 1100.
    expect(moved.x).toBeCloseTo(1100, 1);
    expect((await placedRow(carB.id)).x).toBe(1600);
    expect((await statsOf(theirs.id)).hp).toBe(45);
  });

  it('taranowanie Pługiem przodem: uderzony 6k6 i Rana dla jadących, taranujący cały', async () => {
    scriptDice([6, 6, 6, 6, 6, 6]);
    const after = data(
      await emitAck<SceneVehicleView>(player, 'chase:move', {
        sceneVehicleId: carA.id,
        x: 1300,
        y: 900,
        ram: true,
      }),
      'chase:move ram',
    );
    // 36 z 45 PUK — B stoi, więc A zatrzymuje się na nim.
    expect((await statsOf(theirs.id)).hp).toBe(9);
    expect((await statsOf(ours.id)).hp).toBe(45);
    expect(after.x).toBeCloseTo(1100, 0);
    const ganger = await sheetOf(gangerCharacterId);
    expect(ganger.criticalInjuries.map((row) => row.id)).toContain(INJURY_ID);
    expect((await sheetOf(vexId)).criticalInjuries).toEqual([]);
    const line = await built.prisma.chatMessage.findFirst({
      where: { kind: 'action', text: 'Taranowanie' },
    });
    expect(line).not.toBeNull();
  });

  it('pieszy uskakuje Testem ZW + Unik PT 13 — bez obrażeń, auto jedzie dalej', async () => {
    const walker = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Przechodzień',
        x: 2200,
        y: 850,
        hp: { current: 20, max: 20 },
      }),
      'token:create walker',
    );
    // Figura bez karty: ZW 5 + Unik 0 + 9 = 14 ≥ 13.
    scriptDice([9]);
    const moved = data(
      await emitAck<SceneVehicleView>(gm, 'chase:move', {
        sceneVehicleId: carB.id,
        x: 2600,
        y: 900,
        ram: true,
      }),
      'chase:move gm ram walker',
    );
    expect(moved.x).toBe(2600);
    const row = await built.prisma.token.findUniqueOrThrow({ where: { id: walker.id } });
    expect(row.hpCurrent).toBe(20);
  });

  it('broń pokładowa: kierowca strzela Ogniem ciągłym w cel przed autem, magazynek w aucie', async () => {
    scriptDice([]);
    data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next round 2');
    const rowId = cpredMountRowId(ours.id, 'u-mg');
    const shoot = (mode: string, target: Record<string, unknown>) =>
      emitAck<AttackRollResult>(player, 'attack:roll', {
        characterId: vexId,
        attackerTokenId: vexToken.id,
        ...target,
        request: { weaponRowId: rowId, mode },
      });
    expect(await shoot('single', { targetVehicleId: carB.id })).toMatchObject({
      ok: false,
      error: 'MOUNT_AUTOFIRE_ONLY',
    });
    const behind = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Ogon',
        x: 100,
        y: 850,
        hp: { current: 20, max: 20 },
      }),
      'token:create behind',
    );
    expect(await shoot('autofire', { targetTokenId: behind.id })).toMatchObject({
      ok: false,
      error: 'MOUNT_FRONT_ONLY',
    });
    data(await shoot('autofire', { targetVehicleId: carB.id }), 'attack:roll mount');
    expect((await statsOf(ours.id)).mountAmmo['u-mg']).toBe(20);
    // Karta kierowcy bez broni pokładowej — wiersz mieszka w aucie.
    expect((await sheetOf(vexId)).weapons.some((row) => row.id === rowId)).toBe(false);

    expect(
      await emitAck(player, 'vehicle:mount-reload', {
        sceneVehicleId: carA.id,
        upgradeRowId: 'u-mg',
      }),
    ).toMatchObject({ ok: false, error: 'MOUNT_RELOAD_MOVING' });
    data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next round 3');
    await emitAck(gm, 'vehicle:engine', { sceneVehicleId: carA.id, on: false });
    data(
      await emitAck<SceneVehicleView>(player, 'vehicle:mount-reload', {
        sceneVehicleId: carA.id,
        upgradeRowId: 'u-mg',
      }),
      'vehicle:mount-reload',
    );
    expect((await statsOf(ours.id)).mountAmmo['u-mg']).toBe(30);
  });

  it('dryf nie przepycha auta przez auto — staje przy zderzaku, bez obrażeń', async () => {
    // A ma zgaszony silnik (dryf −10), B stoi kratkę za nim w tym samym pasie.
    // B ma kierowcę (przegląd 03.11: auto bez kontroli wjechałoby w A od razu).
    const ganger = await built.prisma.token.findFirstOrThrow({
      where: { sceneVehicleId: carB.id },
    });
    expect(
      (await emitAck(gm, 'vehicle:seat', { tokenId: ganger.id, sceneVehicleId: carB.id, seat: 0 }))
        .ok,
    ).toBe(true);
    const a = await placedRow(carA.id);
    await built.prisma.sceneVehicle.update({
      where: { id: carB.id },
      data: { x: a.x - 600, y: a.y },
    });
    const hpBefore = (await statsOf(theirs.id)).hp;
    data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next round 4');
    const afterA = await placedRow(carA.id);
    // A staje przy przednim zderzaku B (środki o 500 px), zanim B sam dryfuje.
    expect(afterA.x).toBeCloseTo(a.x - 100, 0);
    expect((await statsOf(theirs.id)).hp).toBe(hpBefore);
    // Stojące A czeka na wybór kierowcy B: Gwałtowny skręt albo taranowanie.
    expect(afterA.blockingId).toBe(carB.id);
  });
});
