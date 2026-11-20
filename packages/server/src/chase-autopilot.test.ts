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
  ChaseSyncBroadcast,
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
 * Etap 72e na żywych gniazdach — autopilot aut NPC-ów: zamiar `chase:intent`
 * (tylko MG, tajemnica przed graczami), plan w widoku MG w turze kierowcy,
 * jazda planem na koniec tury, nadpisanie kokpitem i hamulec sceny
 * `chase:autopilot`. Kości: `VTT_DICE_SCRIPT`; katalog jak w `chase-obstacles.test.ts`.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const DICE = join(mkdtempSync(join(tmpdir(), 'vtt-pilot-dice-')), 'dice.txt');
const previousDiceScript = process.env.VTT_DICE_SCRIPT;
function scriptDice(faces: number[]): void {
  writeFileSync(DICE, faces.join(' '));
}

const PUBLIC_DIR = resolve(import.meta.dirname, '../../../data/public');
const PRIVATE_DIR = mkdtempSync(join(tmpdir(), 'vtt-pilot-private-'));
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
    payload: { name: 'Autopilot 72e' },
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

describe('etap 72e: zamiar i autopilot aut NPC-ów', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let scene: SceneView;
  let carA: SceneVehicleView;
  let carB: SceneVehicleView;
  let vexToken: TokenView;
  let gangerToken: TokenView;

  const placedRow = (id: string) => built.prisma.sceneVehicle.findUniqueOrThrow({ where: { id } });

  /** „Następna tura” MG; runda stojąca na Wyścigu (kubek Vex) — drugie kliknięcie go pomija. */
  const next = async (label: string) => {
    const view = data(await emitAck<CombatView>(gm, 'combat:next'), label);
    if (view.round < 1 || view.activeCombatantId !== null) return view;
    return data(await emitAck<CombatView>(gm, 'combat:next'), `${label} — pomija Wyścig`);
  };
  const activeToken = (view: CombatView) =>
    view.combatants.find((row) => row.id === view.activeCombatantId)?.tokenId ?? null;
  /** Widok auta gangu, jaki dostaje MG (z zamiarem i planem) — świeży `chase:sync`. */
  const gmView = async () => {
    const row = await placedRow(carB.id);
    const sync = waitFor(gm, 'chase:sync');
    await emitAck(gm, 'chase:intent', {
      sceneVehicleId: carB.id,
      intent: row.intent,
      targetId: row.intentTargetId,
    });
    const payload = (await sync) as ChaseSyncBroadcast;
    return payload.vehicles.find((entry) => entry.id === carB.id)!;
  };

  it('stawia scenę: Vex z przodu na górnym pasie, gang w Strzale daleko z tyłu', async () => {
    gm = await connect(gmCookie);
    player = await connect(playerCookie);
    scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Autopilot', kind: 'chase' }),
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
    expect(scene.chase.autopilot).toBe(true);
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
    const ours = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', {
        catalogId: 'vehicle.sample-kompakt',
        ownerCharacterId: vex.id,
      }),
      'vehicle:create ours',
    );
    const theirs = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', { catalogId: 'vehicle.sample-strzala' }),
      'vehicle:create theirs',
    );
    const place = async (vehicleId: string, x: number, y: number) =>
      data(
        await emitAck<SceneVehicleView>(gm, 'chase:place', { sceneId: scene.id, vehicleId, x, y }),
        'chase:place',
      );
    carA = await place(ours.id, 1800, 300);
    carB = await place(theirs.id, 300, 300);

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

  it('zamiar nadaje tylko MG, z celem w kadrze, i nie dla auta z graczem za kierownicą', async () => {
    expect(
      await emitAck(player, 'chase:intent', { sceneVehicleId: carB.id, intent: 'flee' }),
    ).toMatchObject({ ok: false });
    expect(
      await emitAck(gm, 'chase:intent', { sceneVehicleId: carB.id, intent: 'pursue' }),
    ).toMatchObject({ ok: false, error: 'INTENT_TARGET_NEEDED' });
    expect(
      await emitAck(gm, 'chase:intent', {
        sceneVehicleId: carB.id,
        intent: 'pursue',
        targetId: carB.id,
      }),
    ).toMatchObject({ ok: false, error: 'INTENT_TARGET_NEEDED' });
    expect(
      await emitAck(gm, 'chase:intent', { sceneVehicleId: carB.id, intent: 'zygzak' }),
    ).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
    expect(
      await emitAck(gm, 'chase:intent', { sceneVehicleId: carA.id, intent: 'flee' }),
    ).toMatchObject({ ok: false, error: 'PLAYER_DRIVES' });

    // „Trzymaj dystans” zapamiętuje odstęp środków z tej chwili: 300 − 1800 = −15 kratek.
    expect(
      (
        await emitAck(gm, 'chase:intent', {
          sceneVehicleId: carB.id,
          intent: 'keep',
          targetId: carA.id,
        })
      ).ok,
    ).toBe(true);
    expect(await placedRow(carB.id)).toMatchObject({
      intent: 'keep',
      intentTargetId: carA.id,
      intentGapSq: -15,
    });

    // Zamiar widzi MG; graczowi `chase:sync` jedzie bez niego.
    const gmSync = waitFor(gm, 'chase:sync');
    const playerSync = waitFor(player, 'chase:sync');
    expect(
      (
        await emitAck(gm, 'chase:intent', {
          sceneVehicleId: carB.id,
          intent: 'pursue',
          targetId: carA.id,
        })
      ).ok,
    ).toBe(true);
    const forGm = ((await gmSync) as ChaseSyncBroadcast).vehicles.find((v) => v.id === carB.id)!;
    const forPlayer = ((await playerSync) as ChaseSyncBroadcast).vehicles.find(
      (v) => v.id === carB.id,
    )!;
    expect(forGm.intent).toEqual({ intent: 'pursue', targetId: carA.id, gapSq: null, plan: null });
    expect(forPlayer).toBeDefined();
    expect(forPlayer.intent).toBeUndefined();
    expect(await placedRow(carB.id)).toMatchObject({ intentGapSq: null });
  });

  it('w turze kierowcy-NPC-a MG widzi plan, a na koniec tury auto jedzie nim samo', async () => {
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
    // Runda 1: kadr — Vex 1800 → 2100 (70% z 3000), Strzała 300 → 600; tura Vex.
    const round1 = await next('runda 1');
    expect(activeToken(round1)).toBe(vexToken.id);
    expect((await placedRow(carB.id)).x).toBe(600);
    // W cudzej turze planu nie ma.
    expect((await gmView()).intent?.plan).toBeNull();

    // Plan przychodzi do MG sam, ze zmianą tury (bez żadnej czynności).
    let lastSync: ChaseSyncBroadcast | null = null;
    const track = (payload: ChaseSyncBroadcast) => {
      lastSync = payload;
    };
    gm.on('chase:sync', track);
    const gangerTurn = await next('runda 1: gang');
    gm.off('chase:sync', track);
    expect(activeToken(gangerTurn)).toBe(gangerToken.id);
    const pushed = (lastSync as ChaseSyncBroadcast | null)?.vehicles.find((v) => v.id === carB.id);
    expect(pushed?.intent?.plan).toEqual({ pedal: 'gas', laneDelta: 0 });
    // Strzała 10 kratek za kompaktem, oba 100 mil/h — autopilot dodaje gazu.
    const view = await gmView();
    expect(view.intent?.plan).toEqual({ pedal: 'gas', laneDelta: 0 });
    expect(view.moved).toBe(false);

    await next('runda 2');
    const after = await placedRow(carB.id);
    // Gaz: 20 → 30 Ruchu, przesunięcie (30 − 20) / 4 = 2,5 kratki.
    expect(after.speed).toBe(30);
    expect(after.x).toBe(850);
    expect(after.y).toBe(300);
  });

  it('MG nadpisuje plan kokpitem — koniec tury nie jedzie drugi raz', async () => {
    const gangerTurn = await next('runda 2: gang');
    expect(activeToken(gangerTurn)).toBe(gangerToken.id);
    expect((await gmView()).intent?.plan).not.toBeNull();
    const drove = data(
      await emitAck<{ moved: boolean; vehicle?: SceneVehicleView }>(gm, 'vehicle:drive', {
        sceneVehicleId: carB.id,
        pedal: 'brake',
        laneDelta: 1,
      }),
      'vehicle:drive MG',
    );
    expect(drove.moved).toBe(true);
    // Odpowiedź zdarzenia nie niesie zamiaru — ta sama droga służy graczom.
    expect(drove.vehicle?.intent).toBeUndefined();
    const driven = await placedRow(carB.id);
    expect(driven.speed).toBe(10);
    expect((await gmView()).intent?.plan).toBeNull();
    await next('runda 3');
    expect(await placedRow(carB.id)).toMatchObject({ x: driven.x, y: driven.y, speed: 10 });
  });

  it('„Uciekaj” co turę dodaje gazu', async () => {
    expect(
      (await emitAck(gm, 'chase:intent', { sceneVehicleId: carB.id, intent: 'flee' })).ok,
    ).toBe(true);
    // Dwie tury gangu z gazem: 10 → 20 → 30 Ruchu (bez przeszkód, cel nie jest potrzebny).
    for (let turn = 0; turn < 2; turn += 1) {
      await next(`gang ${turn}`);
      await next(`Vex ${turn}`);
    }
    expect((await placedRow(carB.id)).speed).toBe(30);
  });

  it('hamulec sceny wyłącza autopilota: plan znika, auto jedzie prosto', async () => {
    expect((await emitAck(gm, 'chase:autopilot', { sceneId: scene.id, on: 'nie' })).ok).toBe(false);
    expect((await emitAck(player, 'chase:autopilot', { sceneId: scene.id, on: false })).ok).toBe(
      false,
    );
    expect((await emitAck(gm, 'chase:autopilot', { sceneId: scene.id, on: false })).ok).toBe(true);
    const row = await built.prisma.scene.findUniqueOrThrow({ where: { id: scene.id } });
    expect(row.chaseAutopilot).toBe(false);

    await emitAck(gm, 'chase:intent', {
      sceneVehicleId: carB.id,
      intent: 'pursue',
      targetId: carA.id,
    });
    await built.prisma.sceneVehicle.update({ where: { id: carB.id }, data: { speed: 40 } });
    const turn = await next('hamulec');
    const gangerTurn = activeToken(turn) === gangerToken.id ? turn : await next('hamulec: gang');
    expect(activeToken(gangerTurn)).toBe(gangerToken.id);
    expect((await gmView()).intent?.plan).toBeNull();
    await next('hamulec: Vex');
    expect((await placedRow(carB.id)).speed).toBe(40);
  });
});
