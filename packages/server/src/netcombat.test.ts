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
  CombatView,
  CompendiumEntry,
  InvitationSummary,
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

/**
 * Walka w Sieci (etap 26c) na żywych gniazdach.
 *
 * Kości są prawdziwe (`createMixedRng`), więc rozstrzygnięcia wymuszają **dane
 * wpisów**, nie atrapa losowości: Czarny LOD „Zawsze trafia" ma ATK 30, a
 * „Nigdy nie trafia" — OBR 30. Przy Interfejsie 10 i jednej k10 (najwyżej 10,
 * bo Program nie eksploduje) obie strony rozstrzygają się wtedy arytmetycznie,
 * a test mówi o zasadach, nie o szczęściu.
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
let gmSocket: ClientSocket;
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
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 3000);
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

function errorOf(ack: SocketAck<unknown>): string | undefined {
  return ack.ok ? undefined : ack.error;
}

function waitFor<T>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
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

/** Bieżące PW karty — czytane z `state:sync`, bo tak samo czyta je klient. */
async function hpOf(characterId: string): Promise<number> {
  const sync = await roundTrip(gmSocket);
  const character = sync.characters.find((entry) => entry.id === characterId);
  if (!character) throw new Error('character missing from sync');
  return (character.data as { hpCurrent: number }).hpCurrent;
}

/** Trzy piętra: lobby, piętro z Czarnym LOD-em i Plik pod nim. */
function architectureWithIce(iceProgramId: string) {
  return {
    name: 'Sieć laboratorium',
    difficulty: 'standard',
    branches: [
      {
        id: 'trunk',
        parentFloor: null,
        floors: [
          { id: 'f0', kind: 'empty', label: 'Lobby' },
          { id: 'f1', kind: 'ice', label: 'Strażnik', programIds: [iceProgramId] },
          { id: 'f2', kind: 'file', label: 'Wyniki badań', dv: 1 },
        ],
      },
    ],
  };
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
    payload: { password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);

  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Kampania walki w Sieci' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const invite = (inviteRes.json() as InvitationSummary).token;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: `/api/join/${invite}`,
    payload: { name: 'Kolec' },
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
  const me = await built.app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { cookie: playerCookie },
  });
  playerId = (me.json() as { user: { id: string } }).user.id;
}, 60_000);

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // The database file may already be gone; nothing to clean up.
  }
});

describe('walka w Sieci na żywych gniazdach', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let characterId: string;
  let tokenId: string;
  let pointId: number;
  let runId: string;

  async function runOf(socket: ClientSocket): Promise<NetRunPayload | undefined> {
    const sync = await roundTrip(socket);
    return sync.netRuns[0];
  }

  /**
   * Powtarza rzut netrunnera, dopóki nie wyjdzie.
   *
   * Test ataku w Sieci jest Testem, więc obowiązuje go zasada krytyka: naturalna
   * jedynka odejmuje kolejną k10 i potrafi przegrać nawet z zerową Obroną. To
   * poprawne zachowanie i dlatego test na nie czeka, zamiast je wykluczać.
   */
  async function untilItLands(
    event: string,
    payload: unknown,
    tries = 6,
  ): Promise<NetRunAbilityResult> {
    let last: NetRunAbilityResult | undefined;
    for (let attempt = 0; attempt < tries; attempt += 1) {
      last = data(await emitAck<NetRunAbilityResult>(player, event, payload), event);
      if (last.success) return last;
    }
    return last!;
  }

  /** Zjeżdża na piętro z LOD-em i zwraca świeży run. */
  async function goToIceFloor(): Promise<NetRunPayload> {
    return data(
      await emitAck<NetRunPayload>(player, 'netrun:move', {
        runId,
        to: { branchId: 'trunk', floor: 1 },
      }),
      'netrun:move',
    );
  }

  it('sets the table: a netrunner with a deck, three Programs and a socket', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    gmSocket = gm;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    // Dwa wpisy MG, których liczby rozstrzygają rzuty bez udziału szczęścia.
    data(
      await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
        entry: {
          category: 'program',
          name: 'Zawsze trafia',
          programClass: 'attacker',
          target: 'antiPersonnel',
          blackIce: true,
          atk: 30,
          def: 0,
          rez: 24,
          per: 0,
          speed: 30,
          effects: { vsBrain: 1, hooks: ['stealNetAction'] },
        },
      }),
      'compendium:upsert (LOD)',
    );
    data(
      await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
        entry: {
          category: 'program',
          name: 'Nigdy nie trafia',
          programClass: 'attacker',
          target: 'antiPersonnel',
          blackIce: true,
          atk: 0,
          def: 30,
          rez: 30,
          per: 30,
          speed: 0,
          effects: { vsBrain: 1 },
        },
      }),
      'compendium:upsert (LOD odporny)',
    );

    const character = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Kolec', ownerId: playerId }),
      'character:create',
    );
    characterId = character.id;
    await emitAck(gm, 'character:update', {
      characterId,
      patch: {
        data: {
          roleId: 'netrunner',
          roleAbilityRank: 10,
          cyberdeck: {
            name: 'Dek przykładowy',
            slots: 6,
            installed: [
              {
                id: 'deck-hammer',
                kind: 'program',
                name: 'Dziurkacz',
                slotCost: 1,
                program: {
                  programClass: 'attacker',
                  target: 'antiProgram',
                  atk: 1,
                  def: 0,
                  rez: 0,
                  effects: { vsProgram: 2, vsBlackIce: 2 },
                },
              },
              {
                id: 'deck-armour',
                kind: 'program',
                name: 'Parasol',
                slotCost: 1,
                program: {
                  programClass: 'defender',
                  atk: 0,
                  def: 0,
                  rez: 6,
                  effects: { guard: { kind: 'armour', value: 2 }, singleCopy: true },
                },
              },
              {
                id: 'deck-armour-2',
                kind: 'program',
                name: 'Parasol',
                slotCost: 1,
                program: {
                  programClass: 'defender',
                  atk: 0,
                  def: 0,
                  rez: 6,
                  effects: { guard: { kind: 'armour', value: 2 }, singleCopy: true },
                },
              },
              {
                id: 'deck-glue',
                kind: 'program',
                name: 'Superklej',
                slotCost: 1,
                program: {
                  programClass: 'attacker',
                  target: 'antiPersonnel',
                  atk: 2,
                  def: 0,
                  rez: 0,
                  effects: { hooks: ['glue'], glue: 'd6rounds', oncePerEntry: true },
                },
              },
            ],
          },
        },
      },
    });

    const scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Laboratorium' }),
      'scene',
    );
    sceneId = scene.id;
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    tokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kolec',
        x: 0,
        y: 0,
        ownerId: playerId,
        characterId,
      }),
      'token:create',
    ).id;

    const architectureId = data(
      await emitAck<NetArchitectureView>(gm, 'net:save', {
        architecture: architectureWithIce('program.zawsze-trafia'),
      }),
      'net:save',
    ).id;
    pointId = data(
      await emitAck<NetAccessPointView>(gm, 'netpoint:place', {
        sceneId,
        x: 50,
        y: 50,
        name: 'Terminal',
        architectureId,
        hidden: false,
      }),
      'netpoint:place',
    ).id;

    runId = data(
      await emitAck<NetRunPayload>(player, 'netrun:start', { tokenId, accessPointId: pointId }),
      'netrun:start',
    ).runId;
    expect(runId).toBeTruthy();
  });

  it('puts the deck in the payload without anybody asking', async () => {
    const run = await runOf(player);
    expect(run?.run.combat.deck.map((slot) => slot.name)).toEqual([
      'Dziurkacz',
      'Parasol',
      'Parasol',
      'Superklej',
    ]);
    // Klasa Programu decyduje, czy jest czym uderzyć w Czarnego LOD-a.
    expect(run?.run.combat.deck.find((slot) => slot.name === 'Dziurkacz')?.vsIce).toBe(2);
    expect(run?.run.combat.deck.find((slot) => slot.name === 'Superklej')?.vsIce).toBe(0);
    expect(run?.run.combat.ice).toEqual([]);
  });

  it('puts a Black ICE in the shaft the moment the door opens', async () => {
    const moved = await goToIceFloor();
    expect(moved.run.combat.ice).toHaveLength(1);
    expect(moved.run.combat.ice[0]).toMatchObject({
      name: 'Zawsze trafia',
      mode: 'lurking',
      detected: false,
      here: true,
      rezCurrent: 24,
      rezMax: 24,
    });
    // Gracz nie dostaje liczb LOD-a, dopóki nie rozstrzygnie ich rzutem.
    expect(moved.run.combat.ice[0]!.atk).toBeUndefined();
    expect(moved.run.combat.ice[0]!.effect).toBeUndefined();

    const forGm = await runOf(gm);
    expect(forGm?.run.combat.ice[0]).toMatchObject({ atk: 30, def: 0, per: 0, speed: 30 });
  });

  it('does not put a second copy of the same ICE in a corridor walked twice', async () => {
    await emitAck(player, 'netrun:move', { runId, to: { branchId: 'trunk', floor: 0 } });
    const again = await goToIceFloor();
    expect(again.run.combat.ice).toHaveLength(1);
  });

  it('never lets a player fire the Black ICE', async () => {
    const iceId = (await runOf(player))!.run.combat.ice[0]!.id;
    expect(errorOf(await emitAck(player, 'netrun:ice:detect', { runId, iceId }))).toBe('FORBIDDEN');
    expect(errorOf(await emitAck(player, 'netrun:ice:turn', { runId, iceId }))).toBe('FORBIDDEN');
  });

  it('runs a Defender, and refuses the second copy of a single-copy Program', async () => {
    const ran = data(
      await emitAck<NetRunAbilityResult>(player, 'netrun:program', {
        runId,
        rowId: 'deck-armour',
        action: 'run',
      }),
      'netrun:program',
    );
    expect(ran.summary).toContain('Parasol');

    const twin = await emitAck(player, 'netrun:program', {
      runId,
      rowId: 'deck-armour-2',
      action: 'run',
    });
    expect(errorOf(twin)).toBe('NET_PROGRAM_SINGLE_COPY');

    const run = await runOf(player);
    const slot = run?.run.combat.deck.find((entry) => entry.rowId === 'deck-armour');
    expect(slot?.rezzedId).toBeTruthy();
    expect(slot?.rezCurrent).toBe(6);
    expect(run?.run.combat.brainArmour).toBe(2);
  });

  it('refuses to keep an Aggressor running — it is fired, not held', async () => {
    const ack = await emitAck(player, 'netrun:program', {
      runId,
      rowId: 'deck-hammer',
      action: 'run',
    });
    expect(errorOf(ack)).toBe('NET_PROGRAM_IS_ATTACKER');
  });

  it('lands a Dziurkacz on a defenceless Black ICE and takes REZ off it', async () => {
    const iceId = (await runOf(player))!.run.combat.ice[0]!.id;
    // Interfejs 10 + ATK 1 + 1k10 przeciw OBR 0 + 1k10 — poza fumblem pewne.
    const result = await untilItLands('netrun:attack', { runId, iceId, rowId: 'deck-hammer' });
    expect(result.success).toBe(true);
    const run = await runOf(player);
    expect(run!.run.combat.ice[0]!.rezCurrent).toBeLessThan(24);
  });

  it('refuses an anti-personnel Program pointed at a Program', async () => {
    const iceId = (await runOf(player))!.run.combat.ice[0]!.id;
    const ack = await emitAck(player, 'netrun:attack', { runId, iceId, rowId: 'deck-glue' });
    expect(errorOf(ack)).toBe('NET_PROGRAM_WRONG_TARGET');
  });

  it('lets Paf through with no Program at all', async () => {
    const iceId = (await runOf(player))!.run.combat.ice[0]!.id;
    const before = (await runOf(player))!.run.combat.ice[0]!.rezCurrent;
    const result = await untilItLands('netrun:attack', { runId, iceId });
    expect(result.success).toBe(true);
    expect((await runOf(player))!.run.combat.ice[0]!.rezCurrent).toBeLessThan(before);
  });

  it('derezzes the ICE when its REZ runs out and takes it out of the fight', async () => {
    const iceId = (await runOf(player))!.run.combat.ice[0]!.id;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const run = await runOf(player);
      if (run!.run.combat.ice[0]!.mode === 'derezzed') break;
      await emitAck(player, 'netrun:attack', { runId, iceId, rowId: 'deck-hammer' });
    }
    const run = await runOf(player);
    expect(run!.run.combat.ice[0]!.mode).toBe('derezzed');
    expect(run!.run.combat.ice[0]!.rezCurrent).toBe(0);

    const again = await emitAck(player, 'netrun:attack', { runId, iceId, rowId: 'deck-hammer' });
    expect(errorOf(again)).toBe('NET_ICE_DOWN');
  });

  it('sends the netrunner home and starts again against an ICE that always hits', async () => {
    await emitAck(player, 'netrun:leave', { runId });
    const architectureId = data(
      await emitAck<NetArchitectureView>(gm, 'net:save', {
        architecture: {
          ...architectureWithIce('program.zawsze-trafia'),
          name: 'Sieć laboratorium II',
        },
      }),
      'net:save',
    ).id;
    await emitAck(gm, 'netpoint:update', { id: pointId, architectureId });
    runId = data(
      await emitAck<NetRunPayload>(player, 'netrun:start', { tokenId, accessPointId: pointId }),
      'netrun:start',
    ).runId;
    await goToIceFloor();
    expect((await runOf(player))!.run.combat.ice[0]!.name).toBe('Zawsze trafia');
  });

  it('hits the brain on detection, and Pancerz takes its four off the top', async () => {
    const hpBefore = await hpOf(characterId);

    const iceId = (await runOf(gm))!.run.combat.ice[0]!.id;
    const result = data(
      await emitAck<NetRunAbilityResult>(gm, 'netrun:ice:detect', { runId, iceId }),
      'netrun:ice:detect',
    );
    // PRĘ 30 przeciw Interfejsowi 10 — darmowy atak jest pewny.
    expect(result.success).toBe(false);
    expect(result.summary).toContain('darmowy atak');

    // 1k6 w mózg minus Pancerz 2 — czasem 0, więc PW nie rosną i nie muszą spaść.
    expect(await hpOf(characterId)).toBeLessThanOrEqual(hpBefore);

    const run = await runOf(player);
    expect(run!.run.combat.ice[0]).toMatchObject({ mode: 'hunting', detected: true });
    // Efekt Mózgoklepa: kolejny pakiet Akcji Sieciowych będzie o jedną krótszy.
    expect(run!.run.combat.netActionDebt).toBeGreaterThan(0);
    // Napotkany LOD przestaje być tajemnicą także dla gracza.
    expect(run!.run.combat.ice[0]!.effect).toContain('w mózg');
  });

  it('refuses a second detection of the same Black ICE', async () => {
    const iceId = (await runOf(gm))!.run.combat.ice[0]!.id;
    const ack = await emitAck(gm, 'netrun:ice:detect', { runId, iceId });
    expect(errorOf(ack)).toBe('NET_ICE_ALREADY_DETECTED');
  });

  it('gives the Black ICE its own Turn, and only the GM may take it', async () => {
    const iceId = (await runOf(gm))!.run.combat.ice[0]!.id;
    const result = data(
      await emitAck<NetRunAbilityResult>(gm, 'netrun:ice:turn', { runId, iceId }),
      'netrun:ice:turn',
    );
    // ATK 30 przeciw Interfejsowi 10 + 1k10 — trafienie jest pewne.
    expect(result.success).toBe(true);
    expect(result.summary).toContain('trafia');
  });

  it('slides out of the fight and leaves the Black ICE lurking behind', async () => {
    const iceId = (await runOf(player))!.run.combat.ice[0]!.id;
    // PER 0 przeciw Interfejsowi 10 — ucieczka pewna poza fumblem.
    const result = await untilItLands('netrun:slide', {
      runId,
      iceId,
      to: { branchId: 'trunk', floor: 0 },
    });
    expect(result.success).toBe(true);
    const run = await runOf(player);
    expect(run!.run.position).toEqual({ branchId: 'trunk', floor: 0 });
    expect(run!.run.combat.ice[0]!.mode).toBe('lurking');
    // „Zostaje tam, gdzie zakończył się pościg" — na piętrze, z którego uciekł.
    expect(run!.run.combat.ice[0]!.floorId).toBe('f1');
  });

  it('bills an unsafe exit for every Black ICE still running', async () => {
    await goToIceFloor();
    const hpBefore = await hpOf(characterId);

    // Wyjście poza 6 m bez odłączenia — awaryjne odłączenie z rachunkiem.
    await emitAck(player, 'token:move', { tokenId, x: 1200, y: 0, final: true });
    await new Promise((done) => setTimeout(done, 200));

    expect(await hpOf(characterId)).toBeLessThanOrEqual(hpBefore);
    expect(await runOf(player)).toBeUndefined();
  });

  it('keeps a bodiless participant out of a player’s way in the tracker', async () => {
    // Kolejka inicjatywy z jedną figurą — wystarczy, żeby LOD miał gdzie wejść.
    await emitAck(player, 'token:move', { tokenId, x: 0, y: 0, final: true });
    const combat = data(
      await emitAck<CombatView>(gm, 'combat:start', { sceneId, tokenIds: [tokenId] }),
      'combat:start',
    );
    expect(combat.combatants).toHaveLength(1);
    await emitAck(gm, 'combat:set-initiative', {
      combatantId: combat.combatants[0]!.id,
      initiative: 12,
    });

    runId = data(
      await emitAck<NetRunPayload>(player, 'netrun:start', { tokenId, accessPointId: pointId }),
      'netrun:start',
    ).runId;
    await goToIceFloor();
    const iceId = (await runOf(gm))!.run.combat.ice[0]!.id;
    await emitAck(gm, 'netrun:ice:detect', { runId, iceId });

    const after = (await roundTrip(gm)).combat;
    const guest = after?.combatants.find((row) => row.tokenId === null);
    expect(guest?.name).toBe('Zawsze trafia');
    // „O jeden punkt wyżej niż … Netrunner, który do tej pory zajmował to miejsce".
    expect(guest?.initiative).toBe(13);
    // Rzut inicjatywy dla bytu bez ciała nie ma sensu i serwer go odmawia.
    expect(errorOf(await emitAck(gm, 'combat:roll', { combatantId: guest!.id }))).toBeTruthy();
  });
});
