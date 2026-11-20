import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  CharacterView,
  ChaseRaceLogEntry,
  ChatMessageBroadcast,
  CheckCallEntry,
  CombatView,
  SceneUpdateBroadcast,
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
 * Etap 72c na żywych gniazdach: Wyścig — Test przeciwstawny Prowadzenia na
 * początku każdej rundy pościgu. Za NPC-ów rzuca serwer, kierowca-gracz
 * dostaje wezwanie na kubek, a runda stoi bez tury, dopóki nie rzuci; MG
 * rzuca za gracza albo go pomija („Pomiń Wyścig”, „Następna tura”), a koniec
 * walki przerywa Wyścig. Zryw dolicza się do ruchu w turze kierowcy, a słaby
 * kierowca, który nie zdał, traci kontrolę.
 *
 * Kości: `VTT_DICE_SCRIPT`, jak w `chase-review.test.ts`.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const DICE = join(mkdtempSync(join(tmpdir(), 'vtt-race-dice-')), 'dice.txt');
const previousDiceScript = process.env.VTT_DICE_SCRIPT;
function scriptDice(faces: number[]): void {
  writeFileSync(DICE, faces.join(' '));
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
  process.env.VTT_DICE_SCRIPT = DICE;
  scriptDice([]);
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
    payload: { name: 'Wyścig' },
  });
  campaignId = (campaignRes.json() as CampaignSummary).id;
  const ownerRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Kord'),
  });
  ownerCookie = cookieOf(ownerRes.headers['set-cookie']);
  ownerId = (ownerRes.json() as { user: { id: string } }).user.id;
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

const vehicleRow = (id: string) => built.prisma.sceneVehicle.findUniqueOrThrow({ where: { id } });
const combatOf = (sceneId: string) => built.prisma.combat.findFirstOrThrow({ where: { sceneId } });
const sceneRow = (id: string) => built.prisma.scene.findUniqueOrThrow({ where: { id } });

/** Ostatnia karta Wyścigu i jej treść. */
async function raceCard(): Promise<{ id: number; entry: ChaseRaceLogEntry }> {
  const row = await built.prisma.chatMessage.findFirstOrThrow({
    where: { campaignId, kind: 'chaserace' },
    orderBy: { id: 'desc' },
  });
  return { id: row.id, entry: JSON.parse(row.payload!) as ChaseRaceLogEntry };
}

async function callOf(messageId: number): Promise<CheckCallEntry> {
  const row = await built.prisma.chatMessage.findUniqueOrThrow({ where: { id: messageId } });
  return JSON.parse(row.payload!) as CheckCallEntry;
}

const rowOf = (entry: ChaseRaceLogEntry, vehicleId: string) =>
  entry.rows.find((row) => row.vehicleId === vehicleId)!;

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
        chase: { direction: 'right', road: { from: 6, to: 12 }, tempo: 20 },
      },
    }),
    'scene:update',
  );
  const activated = waitForMatch(owner, 'scene:activate', () => true);
  await emitAck(gm, 'scene:activate', { sceneId: scene.id });
  await activated;
  data(await emitAck(gm, 'scene:view', { sceneId: scene.id }), 'scene:view');
  return scene;
}

/** Karta z liczbami poprawionymi wprost w bazie (Rola, blok statystyk). */
async function sheetWith(
  gm: ClientSocket,
  name: string,
  owner: string | null,
  patch: (sheet: Record<string, unknown>) => Record<string, unknown>,
): Promise<CharacterView> {
  const created = data(
    await emitAck<CharacterView>(gm, 'character:create', {
      name,
      ...(owner ? { ownerId: owner } : {}),
    }),
    'character:create',
  );
  const row = await built.prisma.character.findUniqueOrThrow({ where: { id: created.id } });
  const sheet = JSON.parse(row.data) as Record<string, unknown>;
  await built.prisma.character.update({
    where: { id: created.id },
    data: { data: JSON.stringify(patch(sheet)) },
  });
  return created;
}

const withStats = (sheet: Record<string, unknown>, stats: Record<string, number>) => ({
  ...sheet,
  stats: { ...(sheet.stats as Record<string, number>), ...stats },
});

async function car(gm: ClientSocket, ownerCharacterId?: string): Promise<VehicleView> {
  return data(
    await emitAck<VehicleView>(gm, 'vehicle:create', {
      catalogId: 'vehicle.sample-kompakt',
      ...(ownerCharacterId ? { ownerCharacterId } : {}),
    }),
    'vehicle:create',
  );
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

async function figure(
  gm: ClientSocket,
  sceneId: string,
  name: string,
  extra: Record<string, unknown> = {},
): Promise<TokenView> {
  return data(
    await emitAck<TokenView>(gm, 'token:create', { sceneId, name, x: 100, y: 100, ...extra }),
    'token:create',
  );
}

async function seat(socket: ClientSocket, tokenId: string, sceneVehicleId: string) {
  const ack = await emitAck(socket, 'vehicle:seat', { tokenId, sceneVehicleId, seat: 0 });
  if (!ack.ok) throw new Error(`vehicle:seat failed: ${JSON.stringify(ack)}`);
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
  return data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next round 1');
}

function rollFromCup(owner: ClientSocket, characterId: string, callMessageId: number) {
  return emitAck(owner, 'character:roll', {
    characterId,
    request: { kind: 'skill', skillId: 'driving' },
    visibility: 'public',
    callMessageId,
  });
}

describe('etap 72c: Wyścig — gracz kubkiem, NPC od serwera, runda czeka', () => {
  let gm: ClientSocket;
  let owner: ClientSocket;
  let scene: SceneView;
  let ours: SceneVehicleView;
  let theirs: SceneVehicleView;
  let rdza: CharacterView;
  let rdzaToken: TokenView;

  it('runda 1 stoi bez tury: NPC rzucił, gracz ma wezwanie na kubek', async () => {
    gm = await connect(gmCookie);
    owner = await connect(ownerCookie);
    scene = await chaseScene(gm, owner, 'Most');
    // REF 4 + Prowadzenie 2 = 6 ≤ 9: słaby kierowca z pełną kartą (postać gracza).
    rdza = await sheetWith(gm, 'Rdza', ownerId, (sheet) => ({
      ...withStats(sheet, { ref: 4 }),
      skills: { driving: 2 },
    }));
    ours = await place(gm, scene.id, (await car(gm, rdza.id)).id, 1200, 750);
    theirs = await place(gm, scene.id, (await car(gm)).id, 1200, 1050);
    rdzaToken = await figure(gm, scene.id, 'Rdza', { ownerId, characterId: rdza.id });
    // Wolt — figura bez karty: czyste 1k10.
    const wolt = await figure(gm, scene.id, 'Wolt');
    await seat(owner, rdzaToken.id, ours.id);
    await seat(gm, wolt.id, theirs.id);

    const waiting = waitForMatch<SceneUpdateBroadcast>(
      owner,
      'scene:update',
      (payload) => payload.scene.id === scene.id && payload.scene.chase.race !== null,
    );
    const cardSeen = waitForMatch<ChatMessageBroadcast>(
      owner,
      'chat:message',
      (payload) => payload.message.kind === 'chaserace',
    );
    scriptDice([3]);
    const round1 = await startCombat(gm, scene.id, [rdzaToken.id, wolt.id]);
    // Gracz widzi wynik NPC-a, ale nie to, z czego się składa (karta NPC-a zostaje u MG).
    const seenRow = (await cardSeen).message.chaseRace!.rows.find(
      (row) => row.vehicleId === theirs.id,
    )!;
    expect(seenRow.total).toBe(3);
    expect(seenRow.dice).toBeUndefined();
    expect(round1).toMatchObject({ round: 1, activeCombatantId: null });
    expect((await waiting).scene.chase.race).toMatchObject({ round: 1, waitingFor: ['Rdza'] });

    const { entry } = await raceCard();
    expect(entry).toMatchObject({ round: 1, solo: false, status: 'waiting' });
    expect(rowOf(entry, theirs.id)).toMatchObject({ total: 3, by: 'npc', weak: false });
    const mine = rowOf(entry, ours.id);
    expect(mine).toMatchObject({ ownerId, weak: true, driverName: 'Rdza' });
    expect(mine.total).toBeUndefined();
    const call = await callOf(mine.callMessageId!);
    // Słaby kierowca: jego Wyścig jest też Testem zwykłej jazdy — PT 10 na wezwaniu.
    expect(call).toMatchObject({ characterId: rdza.id, dv: 10, ownerId });
    expect(call.system).toMatchObject({
      chaseRace: { sceneId: scene.id, round: 1, vehicleId: ours.id },
    });

    // Nikt nie ma tury: gracz nie jedzie, MG nie cofa.
    expect(
      await emitAck(owner, 'vehicle:drive', {
        sceneVehicleId: ours.id,
        pedal: 'gas',
        laneDelta: 0,
      }),
    ).toMatchObject({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(await emitAck(gm, 'combat:previous')).toMatchObject({
      ok: false,
      error: 'RACE_PENDING',
    });
  });

  it('rzut gracza kubkiem rozstrzyga Wyścig: zryw 5 kratek i runda rusza', async () => {
    const callId = rowOf((await raceCard()).entry, ours.id).callMessageId!;
    // 4 + 2 + 9 = 15 > PT 10 — panuje nad autem; zryw ⌊(15 − 3) / 2⌋ = 6 → sufit 5.
    scriptDice([9]);
    expect((await rollFromCup(owner, rdza.id, callId)).ok).toBe(true);
    const done = (await raceCard()).entry;
    expect(done.status).toBe('done');
    expect(rowOf(done, ours.id)).toMatchObject({
      total: 15,
      by: 'player',
      bonus: 5,
      lostControl: false,
    });
    expect(rowOf(done, theirs.id)).toMatchObject({ bonus: 0 });
    expect((await callOf(callId)).resolved).toMatchObject({ total: 15, success: true });
    expect(await vehicleRow(ours.id)).toMatchObject({ raceBonus: 5, lostControl: false });
    // Karta rzutu gracza mówi o jeździe, nie „Zdane / PT 0”.
    const card = await built.prisma.chatMessage.findFirstOrThrow({
      where: { campaignId, kind: 'roll' },
      orderBy: { id: 'desc' },
    });
    expect(JSON.parse(card.payload!)).toMatchObject({ outcome: { label: 'Panuje nad autem' } });
    // Runda ruszyła od pierwszego w kolejce — Rdzy.
    const first = await built.prisma.combatant.findFirstOrThrow({
      where: { tokenId: rdzaToken.id },
    });
    expect((await combatOf(scene.id)).activeCombatantId).toBe(first.id);
    expect((await sceneRow(scene.id)).chaseRace).toContain('"status":"done"');
    // Zryw w ruchu: prędkość równa pościgowi, więc auto jedzie o sam zryw.
    const before = (await vehicleRow(ours.id)).x;
    const moved = data(
      await emitAck<VehicleDriveResult>(owner, 'vehicle:drive', {
        sceneVehicleId: ours.id,
        pedal: null,
        laneDelta: 0,
      }),
      'vehicle:drive',
    );
    expect(moved.moved).toBe(true);
    expect((await vehicleRow(ours.id)).x).toBeCloseTo(before + 500, 0);
  });

  it('MG rzuca za gracza; słaby kierowca nie zdaje i traci kontrolę', async () => {
    data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next to Wolt');
    // Wolt 5, Rdza (rzut MG) 4 + 2 + 2 = 8 ≤ PT 10.
    scriptDice([5, 2]);
    const paused = data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next round 2');
    expect(paused).toMatchObject({ round: 2, activeCombatantId: null });
    const { id, entry } = await raceCard();
    expect(entry.round).toBe(2);
    const callId = rowOf(entry, ours.id).callMessageId!;
    expect(
      await emitAck(owner, 'chase:race-roll', { messageId: id, vehicleId: ours.id }),
    ).toMatchObject({ ok: false });
    expect((await emitAck(gm, 'chase:race-roll', { messageId: id, vehicleId: ours.id })).ok).toBe(
      true,
    );
    const done = (await raceCard()).entry;
    expect(rowOf(done, ours.id)).toMatchObject({
      total: 8,
      by: 'gm',
      bonus: 0,
      lostControl: true,
    });
    expect((await callOf(callId)).resolved).toMatchObject({ total: 8, success: false });
    expect(await vehicleRow(ours.id)).toMatchObject({ lostControl: true, speed: 10, raceBonus: 0 });
    expect(
      await built.prisma.chatMessage.findFirst({
        where: { campaignId, kind: 'action', text: 'Utrata kontroli' },
      }),
    ).not.toBeNull();
    expect((await combatOf(scene.id)).activeCombatantId).not.toBeNull();
    expect(
      await emitAck(owner, 'vehicle:drive', { sceneVehicleId: ours.id, pedal: null, laneDelta: 0 }),
    ).toMatchObject({ ok: false, error: 'VEHICLE_OUT_OF_CONTROL' });
  });

  it('„Następna tura” MG pomija gracza, który nie rzucił — bez zrywu i bez utraty kontroli', async () => {
    // Koniec tury Rdzy: auto bez kontroli jedzie samo (1k6: 3 — prosto); potem Wolt 4.
    scriptDice([3]);
    data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next to Wolt');
    scriptDice([4]);
    data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next round 3');
    const { entry } = await raceCard();
    expect(entry).toMatchObject({ round: 3, status: 'waiting' });
    const callId = rowOf(entry, ours.id).callMessageId!;
    const resumed = data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next skips');
    expect(resumed.round).toBe(3);
    expect(resumed.activeCombatantId).not.toBeNull();
    const done = (await raceCard()).entry;
    expect(done.status).toBe('done');
    expect(rowOf(done, ours.id)).toMatchObject({ skipped: true });
    expect(rowOf(done, ours.id).lostControl).toBeUndefined();
    expect(rowOf(done, theirs.id)).toMatchObject({ total: 4, bonus: 0 });
    expect((await callOf(callId)).cancelled).toBeDefined();
    expect(await vehicleRow(ours.id)).toMatchObject({ lostControl: false, raceBonus: 0 });
    // Spóźniony kubek po pominięciu — wezwanie zamknięte.
    expect(await rollFromCup(owner, rdza.id, callId)).toMatchObject({
      ok: false,
      error: 'CALL_CLOSED',
    });
  });

  it('koniec walki przerywa czekający Wyścig: karta przerwana, wezwanie odwołane', async () => {
    data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next to Wolt');
    scriptDice([6]);
    data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next round 4');
    const { id, entry } = await raceCard();
    expect(entry).toMatchObject({ round: 4, status: 'waiting' });
    const callId = rowOf(entry, ours.id).callMessageId!;
    expect((await emitAck(gm, 'combat:end')).ok).toBe(true);
    expect((await raceCard()).entry.status).toBe('cancelled');
    expect((await callOf(callId)).cancelled).toBeDefined();
    expect((await sceneRow(scene.id)).chaseRace).toBeNull();
    expect(await emitAck(gm, 'chase:race-skip', { messageId: id })).toMatchObject({
      ok: false,
      error: 'RACE_NOT_WAITING',
    });
  });
});

describe('etap 72c: kierowcy bez pełnej karty i Nomada z Moto (NOM-02, NOM-03)', () => {
  it('statysta rzuca REF + 1k10 bez utraty kontroli, Wsparcie czyste 1k10, Moto wchodzi do rzutu', async () => {
    const gm = await connect(gmCookie);
    const owner = await connect(ownerCookie);
    const scene = await chaseScene(gm, owner, 'Pustkowie');
    // Nomada: REF 5 + Prowadzenie 4 + Moto 1 = 10 > 9 — nie jest słabym kierowcą (NOM-03).
    const nomad = await sheetWith(gm, 'Szakal', ownerId, (sheet) => ({
      ...withStats(sheet, { ref: 5 }),
      skills: { driving: 4 },
      roleId: 'nomad',
      roleAbilityRank: 1,
    }));
    // Statysta: REF 6, bez Prowadzenia, z ogólnym poziomem broni 6 — ten się nie podstawia.
    const ganger = await sheetWith(gm, 'Ganger', null, (sheet) => ({
      ...withStats(sheet, { ref: 6 }),
      statBlock: { combatValue: null, weaponSkill: 6, noBulletDodge: false, hpMax: 20 },
    }));
    // Funkcjonariusz Wsparcia: Wartość bojowa 14, także pod Prowadzeniem — do Wyścigu nie wchodzi.
    const officer = await sheetWith(gm, 'Funkcjonariusz', null, (sheet) => ({
      ...withStats(sheet, { ref: 0 }),
      skills: { driving: 14 },
      statBlock: { combatValue: 14, weaponSkill: null, noBulletDodge: true, hpMax: 30 },
    }));
    const a = await place(gm, scene.id, (await car(gm, nomad.id)).id, 1200, 750);
    const b = await place(gm, scene.id, (await car(gm)).id, 1200, 1050);
    const c = await place(gm, scene.id, (await car(gm)).id, 600, 1050);
    const tA = await figure(gm, scene.id, 'Szakal', { ownerId, characterId: nomad.id });
    const tB = await figure(gm, scene.id, 'Ganger', { characterId: ganger.id });
    const tC = await figure(gm, scene.id, 'Funkcjonariusz', { characterId: officer.id });
    await seat(owner, tA.id, a.id);
    await seat(gm, tB.id, b.id);
    await seat(gm, tC.id, c.id);
    // Obaj NPC-e po 4: Ganger 6 + 0 + 4 = 10, funkcjonariusz 4.
    scriptDice([4, 4]);
    await startCombat(gm, scene.id, [tA.id, tB.id, tC.id]);
    const { entry } = await raceCard();
    // Statysta z wynikiem 10 nie traci kontroli — reguła słabego kierowcy go nie dotyczy.
    expect(rowOf(entry, b.id)).toMatchObject({ total: 10, weak: false });
    expect(rowOf(entry, c.id)).toMatchObject({ total: 4, weak: false });
    const mine = rowOf(entry, a.id);
    expect(mine.weak).toBe(false);
    // Wezwanie bez PT — to sam Wyścig, nie Test jazdy.
    expect((await callOf(mine.callMessageId!)).dv).toBeUndefined();
    // 5 + 4 + Moto 1 + 6 = 16.
    scriptDice([6]);
    expect((await rollFromCup(owner, nomad.id, mine.callMessageId!)).ok).toBe(true);
    const done = (await raceCard()).entry;
    const nomadRow = rowOf(done, a.id);
    expect(nomadRow.total).toBe(16);
    expect(nomadRow.breakdown?.some((part) => part.label.includes('Moto'))).toBe(true);
    // Zryw od najniższego (4): Szakal ⌊12 / 2⌋ = 6 → 5, Ganger 3, funkcjonariusz 0.
    expect(nomadRow.bonus).toBe(5);
    expect(rowOf(done, b.id)).toMatchObject({ bonus: 3, lostControl: false });
    expect(rowOf(done, c.id)).toMatchObject({ bonus: 0, lostControl: false });
    const card = await built.prisma.chatMessage.findFirstOrThrow({
      where: { campaignId, kind: 'roll' },
      orderBy: { id: 'desc' },
    });
    expect(JSON.parse(card.payload!)).toMatchObject({ outcome: { label: 'Wyścig' } });
  });
});
