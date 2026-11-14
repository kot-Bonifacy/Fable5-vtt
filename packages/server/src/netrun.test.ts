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
  CpredNetPosition,
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
import { joinUrl } from './test-join.js';
import { runFloor } from './test-net.js';
import { paceTesting } from './realtime/pace.js';

// Ten plik nie pyta o pulę Eksploracji — do etapu 52 chodził w „Swobodnym”,
// który zniknął; ściany, mgła i reszta nie muszą iść po 12 m na raz.
paceTesting.off = true;

/**
 * Smoke tests of the run (stage 26b) on real sockets.
 *
 * What is tested here is exactly what the pure tests in `shared` cannot reach:
 * that a floor nobody has entered is **absent from the payload** rather than
 * hidden in it, that the 6 m from the socket is measured on the server, and
 * that walking away tears the run down without anybody asking.
 *
 * The map: one square is 100 px and 2 m, so a metre is 50 px. The socket sits
 * at the centre of the first square; the netrunner starts on top of it.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const PX_PER_M = 50;

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

/**
 * A four-floor trunk: a lobby, a very easy password, a File and a control node.
 *
 * The password's DV is 1 on purpose — the roll is real (`createMixedRng`), and
 * a test that needs a Backdoor to land must not be a coin toss. Everything the
 * DV itself decides is asserted through the ability's own verdict instead.
 */
function sampleArchitecture() {
  return {
    name: 'Sieć magazynu',
    difficulty: 'standard',
    branches: [
      {
        id: 'trunk',
        parentFloor: null,
        floors: [
          { id: 'f0', kind: 'empty', label: 'Lobby' },
          { id: 'f1', kind: 'password', label: 'Brama serwisowa', dv: 1 },
          { id: 'f2', kind: 'file', label: 'Listy przewozowe', dv: 1, notes: 'Manifest przemytu' },
          { id: 'f3', kind: 'controlNode', label: 'Kamery', dv: 1 },
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
    payload: { login: 'MG', password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);

  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Kampania runów' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  // Etap 44b: linki są imienne — wystawia je `joinUrl` przy każdym wejściu.
  const invite = campaignId;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, invite, 'Kolec'),
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

describe('run netrunnera na żywych gniazdach', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let architectureId: string;
  let netrunnerId: string;
  let netrunnerTokenId: string;
  let soloTokenId: string;
  let pointId: number;
  let runId: string;

  function floorOf(run: NetRunPayload, id: string) {
    return runFloor(run, id);
  }

  async function runOf(socket: ClientSocket): Promise<NetRunPayload | undefined> {
    const sync = await roundTrip(socket);
    return sync.netRuns[0];
  }

  it('sets the table: a Netrunner with a deck, a Solo without one, and a socket', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const netrunner = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Kolec', ownerId: playerId }),
      'character:create',
    );
    netrunnerId = netrunner.id;
    // Interface 10 for the same reason the DVs are 1: the dice are real, and
    // the tests below are about the rules, not about luck.
    await emitAck(gm, 'character:update', {
      characterId: netrunner.id,
      patch: {
        data: {
          roleId: 'netrunner',
          roleAbilityRank: 10,
          cyberdeck: { name: 'Cyberdek zwykłej jakości', slots: 7, installed: [] },
        },
      },
    });
    const solo = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Rico', ownerId: playerId }),
      'character:create',
    );
    await emitAck(gm, 'character:update', {
      characterId: solo.id,
      patch: { data: { roleId: 'solo', roleAbilityRank: 6 } },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Magazyn' }), 'scene');
    sceneId = scene.id;
    // Mapa otwarta dla graczy (12.09): nowa scena wchodzi **zamknięta**, a ten
    // zestaw jest o ruchu figur, nie o blokadzie.
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMove: 'explore' } });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    netrunnerTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kolec',
        x: 0,
        y: 0,
        ownerId: playerId,
        characterId: netrunner.id,
      }),
      'token:create',
    ).id;
    soloTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Rico',
        x: 0,
        y: 200,
        ownerId: playerId,
        characterId: solo.id,
      }),
      'token:create',
    ).id;

    architectureId = data(
      await emitAck<NetArchitectureView>(gm, 'net:save', { architecture: sampleArchitecture() }),
      'net:save',
    ).id;
    expect(architectureId).toBeTruthy();
  });

  it('never lets a hidden socket reach a player', async () => {
    const point = data(
      await emitAck<NetAccessPointView>(gm, 'netpoint:place', {
        sceneId,
        // Centre of the first square, so the netrunner standing on it is 0 m away.
        x: 50,
        y: 50,
        name: 'Terminal serwisowy',
        architectureId,
      }),
      'netpoint:place',
    );
    pointId = point.id;
    expect(point.hidden).toBe(true);

    const gmSync = await roundTrip(gm);
    expect(gmSync.accessPoints.map((entry) => entry.name)).toEqual(['Terminal serwisowy']);
    const playerSync = await roundTrip(player);
    expect(playerSync.accessPoints).toEqual([]);
  });

  it('refuses a player who names a hidden socket by id', async () => {
    const ack = await emitAck(player, 'netrun:start', {
      tokenId: netrunnerTokenId,
      accessPointId: pointId,
    });
    expect(errorOf(ack)).toBe('ACCESS_POINT_NOT_FOUND');
  });

  it('moves a socket from its card, in both axes at once', async () => {
    const moved = data(
      await emitAck<NetAccessPointView>(gm, 'netpoint:update', { id: pointId, x: 640, y: 320 }),
      'netpoint:update position',
    );
    expect([moved.x, moved.y]).toEqual([640, 320]);
    // Jedna oś w patchu bierze drugą z wiersza — gniazdo nie jeździ po linii.
    expect(
      data(
        await emitAck<NetAccessPointView>(gm, 'netpoint:update', { id: pointId, x: 700 }),
        'netpoint:update one axis',
      ).y,
    ).toBe(320);
    expect(errorOf(await emitAck(gm, 'netpoint:update', { id: pointId, x: 'tam' }))).toBe(
      'BAD_REQUEST',
    );
    // Z powrotem na środek pierwszego pola: dalsze testy mierzą stąd zasięg
    // podłączenia, więc gniazdo ma zastać ich tam, gdzie je postawiono.
    await emitAck(gm, 'netpoint:update', { id: pointId, x: 50, y: 50 });
  });

  it('gives a revealed socket to the player without the GM half of it', async () => {
    await emitAck(gm, 'netpoint:update', {
      id: pointId,
      hidden: false,
      notes: 'Steruje bramą i kamerami',
    });
    const sync = await roundTrip(player);
    const point = sync.accessPoints[0];
    expect(point?.name).toBe('Terminal serwisowy');
    // Finding the socket tells you there is a socket — not what runs behind it.
    expect(point?.architectureName).toBeUndefined();
    expect(point?.notes).toBeUndefined();
  });

  it('refuses a sheet with no Interface at all', async () => {
    const ack = await emitAck(player, 'netrun:start', {
      tokenId: soloTokenId,
      accessPointId: pointId,
    });
    expect(errorOf(ack)).toBe('NET_NO_INTERFACE');
  });

  it('refuses a netrunner standing further than 6 m from the socket', async () => {
    // 12 m away: the figure walks off and tries to jack in from there.
    await emitAck(player, 'token:move', {
      tokenId: netrunnerTokenId,
      x: 12 * PX_PER_M,
      y: 0,
      final: true,
    });
    const ack = await emitAck(player, 'netrun:start', {
      tokenId: netrunnerTokenId,
      accessPointId: pointId,
    });
    expect(errorOf(ack)).toBe('NET_OUT_OF_RANGE');
  });

  it('jacks in from arm’s reach and shows the player only the floor they stand on', async () => {
    await emitAck(player, 'token:move', { tokenId: netrunnerTokenId, x: 0, y: 0, final: true });
    const started = data(
      await emitAck<NetRunPayload>(player, 'netrun:start', {
        tokenId: netrunnerTokenId,
        accessPointId: pointId,
      }),
      'netrun:start',
    );
    runId = started.runId;
    expect(started.interfaceRank).toBe(10);
    expect(started.run.position).toEqual({ branchId: 'trunk', floor: 0 });

    expect(started.run.here?.label).toBe('Lobby');
    // Etap 70a: one door down, bare — and of the rest of the shaft nothing at
    // all. No id, no label, no placeholder to count.
    expect(started.run.exits).toEqual({
      up: null,
      down: [{ to: { branchId: 'trunk', floor: 1 }, knowledge: 'unknown' }],
    });
    expect(started.run.trail.map((step) => step.id)).toEqual(['f0']);
    expect(started.run.shaft).toBeUndefined();
    expect('branches' in started.run).toBe(false);
    const wire = JSON.stringify(started);
    for (const secret of [
      '"f1"',
      '"f2"',
      '"f3"',
      'Brama serwisowa',
      'Listy przewozowe',
      'Kamery',
    ]) {
      expect(wire).not.toContain(secret);
    }
    // The same cut on the wire the window listens to, not only in the ack.
    const synced = JSON.stringify((await roundTrip(player)).netRuns);
    for (const secret of [
      '"f1"',
      '"f2"',
      '"f3"',
      'Brama serwisowa',
      'Listy przewozowe',
      'Kamery',
    ]) {
      expect(synced).not.toContain(secret);
    }
    // #32: the architecture's name is the GM's label — the player's window says „SIEĆ".
    expect(started.run.architectureName).toBeUndefined();
    expect((await roundTrip(player)).netRuns[0]?.run.architectureName).toBeUndefined();
  });

  it('gives the GM the whole shaft of the same run', async () => {
    const sync = await roundTrip(gm);
    const run = sync.netRuns.find((entry) => entry.runId === runId);
    expect(run?.gmView).toBe(true);
    expect(run?.run.architectureName).toBeTruthy();
    const floors = run!.run.shaft![0]!.floors;
    expect(floors.map((floor) => floor.kind)).toEqual(['empty', 'password', 'file', 'controlNode']);
    expect(floors[3]!.dv).toBe(1);
  });

  it('answers a floor the player has not reached like a floor that is not there (70a)', async () => {
    const move = (socket: ClientSocket, to: CpredNetPosition) =>
      emitAck(socket, 'netrun:move', { runId, to }).then(errorOf);
    // Floor 3 exists behind a password, floor 30 and branch „b9” do not: one
    // refusal for all three, so the depth cannot be felt out by asking.
    const real = await move(player, { branchId: 'trunk', floor: 3 });
    expect(real).toBeTruthy();
    expect(real).not.toContain('Brama serwisowa');
    expect(await move(player, { branchId: 'trunk', floor: 30 })).toBe(real);
    expect(await move(player, { branchId: 'b9', floor: 0 })).toBe(real);
    // The GM moves the netrunner without that limit — and so hears the truth:
    // the ready Polish sentence, with the password named in it.
    expect(await move(gm, { branchId: 'trunk', floor: 3 })).toContain('Brama serwisowa');
    expect(await move(gm, { branchId: 'trunk', floor: 30 })).toBe(real);
    // The same for a device: a node not reached and a floor that is not there.
    const operate = (floorId: string) =>
      emitAck(player, 'netrun:device', {
        runId,
        floorId,
        deviceId: 'whatever',
        operation: 'off',
      }).then(errorOf);
    expect(await operate('f3')).toBe('NET_NODE_NOT_HELD');
    expect(await operate('f33')).toBe('NET_NODE_NOT_HELD');
    expect(await operate('f0')).toBe('NET_NODE_NOT_HELD');
  });

  it('lets the lift stop on the password itself and breaks it with Backdoor', async () => {
    const onFloor = data(
      await emitAck<NetRunPayload>(player, 'netrun:move', {
        runId,
        to: { branchId: 'trunk', floor: 1 },
      }),
      'netrun:move',
    );
    expect(floorOf(onFloor, 'f1')?.knowledge).toBe('entered');
    expect(floorOf(onFloor, 'f1')?.dv).toBe(1);
    // One floor down, exactly one floor more in the payload (70a).
    expect(onFloor.run.trail.map((step) => step.id)).toEqual(['f0', 'f1']);
    expect(onFloor.run.exits.down).toEqual([
      { to: { branchId: 'trunk', floor: 2 }, knowledge: 'unknown', blocked: true },
    ]);
    expect(JSON.stringify(onFloor)).not.toContain('Listy przewozowe');
    expect(JSON.stringify(onFloor)).not.toContain('"f2"');
    // The password underfoot holds the door below it.
    const held = await emitAck(player, 'netrun:move', {
      runId,
      to: { branchId: 'trunk', floor: 2 },
    });
    expect(errorOf(held)).toContain('Brama serwisowa');

    // The dice are real, so the loop is the honest way to reach a broken
    // password: each attempt asserts the invariant that the verdict and the
    // stored state agree, whichever way it went.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = data(
        await emitAck<NetRunAbilityResult>(player, 'netrun:ability', {
          runId,
          ability: 'backdoor',
        }),
        'netrun:ability',
      );
      const run = await runOf(player);
      expect(floorOf(run!, 'f1')?.broken === true).toBe(result.success);
      if (result.success) return;
      // Zlecenie MG z 02.11: a failed floor is spent until the GM gives it back.
      await emitAck(gm, 'netrun:hacks:reset', { runId });
    }
    throw new Error('ten Backdoorów z PT 1 nie przeszło — to nie jest pech, to błąd');
  });

  it('refuses an ability on a floor that has nothing for it', async () => {
    const ack = await emitAck(player, 'netrun:ability', { runId, ability: 'eyed' });
    expect(errorOf(ack)).toBe('NET_WRONG_FLOOR');
  });

  it('refuses the two abilities stage 26c owns', async () => {
    expect(errorOf(await emitAck(player, 'netrun:ability', { runId, ability: 'slide' }))).toBe(
      'NET_ABILITY_LATER',
    );
    expect(errorOf(await emitAck(player, 'netrun:ability', { runId, ability: 'zap' }))).toBe(
      'NET_ABILITY_LATER',
    );
  });

  it('walks the whole shaft once the password is broken', async () => {
    // Door by door since 70a: floor 3 is not a door of floor 1.
    const onFile = data(
      await emitAck<NetRunPayload>(player, 'netrun:move', {
        runId,
        to: { branchId: 'trunk', floor: 2 },
      }),
      'netrun:move',
    );
    expect(onFile.run.here?.id).toBe('f2');
    expect(JSON.stringify(onFile)).not.toContain('Kamery');
    const run = data(
      await emitAck<NetRunPayload>(player, 'netrun:move', {
        runId,
        to: { branchId: 'trunk', floor: 3 },
      }),
      'netrun:move',
    );
    expect(run.run.position).toEqual({ branchId: 'trunk', floor: 3 });
    // Every floor walked through is entered, not only the destination.
    expect(floorOf(run, 'f2')?.knowledge).toBe('entered');
    expect(floorOf(run, 'f2')?.label).toBe('Listy przewozowe');
    // The GM's note on the File stays GM-only until Ajdi succeeds.
    expect(floorOf(run, 'f2')?.notes).toBeUndefined();
  });

  it('seizes a control node and stores the DV of taking it back', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = data(
        await emitAck<NetRunAbilityResult>(player, 'netrun:ability', {
          runId,
          ability: 'control',
        }),
        'netrun:ability',
      );
      const run = await runOf(player);
      const held = floorOf(run!, 'f3')?.controlledDv;
      if (result.success) {
        expect(held).toBe(result.total);
        return;
      }
      expect(held).toBeUndefined();
      await emitAck(gm, 'netrun:hacks:reset', { runId });
    }
    throw new Error('dziesięć Kontroli z PT 1 nie przeszło');
  });

  it('gives one try per floor: a failed Ajdi is spent until the GM hands it back', async () => {
    // A DV no roll can beat: Interfejs 10 + d10 with a critical tops out at 30,
    // and a Check has to beat the DV, not meet it.
    const hard = sampleArchitecture();
    hard.branches[0]!.floors[2]!.dv = 30;
    data(await emitAck(gm, 'net:save', { id: architectureId, architecture: hard }), 'net:save');
    await emitAck(player, 'netrun:move', { runId, to: { branchId: 'trunk', floor: 2 } });

    const failed = data(
      await emitAck<NetRunAbilityResult>(player, 'netrun:ability', { runId, ability: 'eyed' }),
      'netrun:ability',
    );
    expect(failed.success).toBe(false);
    expect(floorOf((await runOf(player))!, 'f2')?.hackFailed).toBe(true);
    // The other floors are untouched.
    expect(floorOf((await runOf(player))!, 'f3')?.hackFailed).toBeUndefined();

    const again = await emitAck(player, 'netrun:ability', { runId, ability: 'eyed' });
    expect(errorOf(again)).toBe('NET_HACK_FAILED');

    // Only the GM gives the try back.
    expect(errorOf(await emitAck(player, 'netrun:hacks:reset', { runId }))).toBe('FORBIDDEN');
    await emitAck(gm, 'netrun:hacks:reset', { runId });
    expect(floorOf((await runOf(player))!, 'f2')?.hackFailed).toBeUndefined();

    // 70a (66e pkt 23): the netrunner's full line names the public one it
    // stands in for, so their chat shows one row for the copy, not two.
    const lines: { id: number; kind: string; action?: { note?: string; shadows?: number } }[] = [];
    const onLine = (frame: { message: (typeof lines)[number] }) => lines.push(frame.message);
    player.on('chat:message', onLine);
    data(await emitAck(player, 'netrun:copy', { runId, floorId: 'f2' }), 'netrun:copy');
    await new Promise((resolve) => setTimeout(resolve, 150));
    player.off('chat:message', onLine);
    const shown = lines.find((line) => line.kind === 'action');
    const full = lines.find((line) => line.kind === 'gmaction');
    expect(full?.action?.note).toBe('Listy przewozowe');
    expect(full?.action?.shadows).toBe(shown?.id);

    data(
      await emitAck(gm, 'net:save', { id: architectureId, architecture: sampleArchitecture() }),
      'net:save',
    );
    await emitAck(player, 'netrun:move', { runId, to: { branchId: 'trunk', floor: 3 } });
  });

  it('leaves a Virus on the bottom floor and keeps it past the disconnection', async () => {
    // 70a: the server says where a Virus may go — the client has no shaft to
    // find the bottom in.
    expect((await runOf(player))!.run.here?.virusAllowed).toBe(true);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = data(
        await emitAck<NetRunAbilityResult>(player, 'netrun:ability', {
          runId,
          ability: 'virus',
          virus: { description: 'Co pięć minut zmienia hasła', dv: 1, actions: 1 },
        }),
        'netrun:ability',
      );
      if (!result.success) {
        // A failed Virus spends the try on this floor until the GM gives it back.
        await emitAck(gm, 'netrun:hacks:reset', { runId });
        continue;
      }
      const run = await runOf(player);
      expect(run?.run.viruses[0]?.description).toBe('Co pięć minut zmienia hasła');
      // „PT zniszczenia tego Wirusa jest równe wynikowi rzutu" — the total.
      expect(run?.run.viruses[0]?.dv).toBe(result.total);
      return;
    }
    throw new Error('dziesięć Wirusów z PT 1 nie przeszło');
  });

  it('gives Zwiad one roll per floor, Maskowanie one Turn per floor, a failed Virus none', async () => {
    const open = async (ability: string, extra: object = {}) =>
      emitAck<NetRunAbilityResult>(player, 'netrun:ability', { runId, ability, ...extra });

    data(await open('scout'), 'netrun:ability');
    expect(errorOf(await open('scout'))).toBe('NET_TRY_SPENT');
    expect((await runOf(player))!.run.spentAbilities).toContain('scout');

    // Zasada domowa MG z 14.11: outside a fight the stay on a floor is one
    // Turn — as many tries as Net Actions, and the first success closes it.
    let masked = false;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = data(await open('cloak'), 'netrun:ability');
      if (result.success) {
        masked = true;
        break;
      }
      const here = (await runOf(player))!.run.here!;
      if (here.cloak === 'failed') break;
      expect(here.cloak).toBe('trying');
    }
    expect((await runOf(player))!.run.here?.cloak).toBe(masked ? 'masked' : 'failed');
    expect(errorOf(await open('cloak'))).toBe(masked ? 'NET_CLOAK_DONE' : 'NET_CLOAK_FAILED');
    expect((await runOf(player))!.run.spentAbilities).toContain('cloak');

    // PT 30 for a Virus no roll can beat: the failure spends the try, and the
    // refusal comes before a single step of the next one is written.
    const lost = data(
      await open('virus', { virus: { description: 'Nie przejdzie', dv: 30, actions: 1 } }),
      'netrun:ability',
    );
    expect(lost.success).toBe(false);
    expect(
      errorOf(await open('virus', { virus: { description: 'Drugi raz', dv: 1, actions: 1 } })),
    ).toBe('NET_TRY_SPENT');

    const before = (await runOf(gm))!;
    expect(before.run.spentTries).toBe(2);
    expect(before.run.here?.cloak).toBe(masked ? 'masked' : 'failed');
    await emitAck(gm, 'netrun:hacks:reset', { runId });
    const after = (await runOf(player))!;
    // A masked floor is a success and stays masked; a failed one is a try back.
    expect(after.run.spentAbilities).toEqual(masked ? ['cloak'] : []);
    expect(after.run.spentTries).toBe(0);
  });

  it('refuses a Virus anywhere but the bottom', async () => {
    await emitAck(player, 'netrun:move', { runId, to: { branchId: 'trunk', floor: 0 } });
    const ack = await emitAck(player, 'netrun:ability', {
      runId,
      ability: 'virus',
      virus: { description: 'Cokolwiek', dv: 1, actions: 1 },
    });
    expect(errorOf(ack)).toBe('NET_NOT_BOTTOM');
    await emitAck(player, 'netrun:move', { runId, to: { branchId: 'trunk', floor: 3 } });
  });

  it('tears the run down when the figure walks out of range', async () => {
    expect((await roundTrip(player)).netRuns).toHaveLength(1);
    // Zasada domowa MG z 02.11: podłączona figura gracza nie rusza się wcale —
    // ani poza zasięg, ani o krok w jego obrębie, ani marszem, ani skokiem.
    expect(
      errorOf(
        await emitAck(player, 'token:move', {
          tokenId: netrunnerTokenId,
          x: 20 * PX_PER_M,
          y: 0,
          final: true,
        }),
      ),
    ).toBe('NET_JACKED_IN_MOVE');
    expect(
      errorOf(await emitAck(player, 'token:move', { tokenId: netrunnerTokenId, x: 100, y: 0 })),
    ).toBe('NET_JACKED_IN_MOVE');
    expect(
      errorOf(
        await emitAck(player, 'token:walk', {
          tokenId: netrunnerTokenId,
          route: [{ x: 100, y: 0 }],
        }),
      ),
    ).toBe('NET_JACKED_IN_MOVE');
    const jump = await emitAck<{ refusal: string | null }>(player, 'token:jump-options', {
      tokenId: netrunnerTokenId,
    });
    expect(jump.ok && jump.data?.refusal).toContain('podłączona do Sieci');
    expect((await roundTrip(player)).netRuns).toHaveLength(1);

    // Ręka MG (sędzia) dalej przenosi figurę — a wyniesiona poza 6 m
    // odłącza się awaryjnie, jak w podręczniku (s. 198).
    await emitAck(gm, 'token:move', {
      tokenId: netrunnerTokenId,
      x: 20 * PX_PER_M,
      y: 0,
      final: true,
    });
    const sync = await roundTrip(player);
    expect(sync.netRuns).toHaveLength(0);
    // And the architecture keeps what the run left behind.
    await emitAck(player, 'token:move', { tokenId: netrunnerTokenId, x: 0, y: 0, final: true });
    const again = data(
      await emitAck<NetRunPayload>(player, 'netrun:start', {
        tokenId: netrunnerTokenId,
        accessPointId: pointId,
      }),
      'netrun:start',
    );
    runId = again.runId;
    expect(again.run.viruses).toHaveLength(1);
    // Zasada domowa MG z 02.11 (wbrew „Odłączenie resetuje obronę", s. 198):
    // what this character achieved on this scene comes back with them — the
    // broken password and the node, with the DV of taking it back.
    expect(floorOf(again, 'f1')?.broken).toBe(true);
    expect(floorOf(again, 'f1')?.knowledge).toBe('entered');
    expect(floorOf(again, 'f3')?.controlledDv).toBeGreaterThan(1);
    // The one try of Zwiad-free floors is untouched, the Virus try was spent
    // by no failure: nothing is greyed out at the entrance.
    expect(again.run.spentAbilities).toEqual([]);
  });

  it('finds a hidden socket with the Scanner', async () => {
    const near = data(
      await emitAck<NetAccessPointView>(gm, 'netpoint:place', {
        sceneId,
        // Half a metre from the netrunner's own square.
        x: 75,
        y: 50,
        name: 'Gniazdo pod biurkiem',
        architectureId,
      }),
      'netpoint:place',
    );
    expect((await roundTrip(player)).accessPoints.map((entry) => entry.id)).not.toContain(near.id);

    const scan = data(
      await emitAck<NetRunAbilityResult>(player, 'netrun:scan', { tokenId: netrunnerTokenId }),
      'netrun:scan',
    );
    expect(scan.total).toBeGreaterThan(0);
    expect((await roundTrip(player)).accessPoints.map((entry) => entry.id)).toContain(near.id);
  });

  it('takes Luck from the cup into the Scanner: checked before the Action, spent with the dice', async () => {
    await emitAck(gm, 'character:update', {
      characterId: netrunnerId,
      patch: { data: { luckCurrent: 3 } },
    });
    const luckLeft = async () =>
      (
        JSON.parse(
          (await built.prisma.character.findUniqueOrThrow({ where: { id: netrunnerId } })).data,
        ) as { luckCurrent: number }
      ).luckCurrent;

    // Więcej, niż jest w puli — odmowa, a pula zostaje nietknięta.
    const tooMuch = await emitAck(player, 'netrun:scan', {
      tokenId: netrunnerTokenId,
      luckSpent: 4,
    });
    expect(errorOf(tooMuch)).toBe('NOT_ENOUGH_LUCK');
    expect(await luckLeft()).toBe(3);

    const card = waitFor<{
      message: { roll?: { breakdown?: { label: string; value: number; kind?: string }[] } };
    }>(player, 'chat:message');
    data(
      await emitAck<NetRunAbilityResult>(player, 'netrun:scan', {
        tokenId: netrunnerTokenId,
        luckSpent: 2,
      }),
      'netrun:scan',
    );
    expect(await luckLeft()).toBe(1);
    expect((await card).message.roll?.breakdown).toContainEqual({ label: 'Szczęście (2 pkt)', value: 2, kind: 'luck' });
  });

  it('jacks out on purpose and forgets the shaft', async () => {
    const ack = await emitAck(player, 'netrun:leave', { runId });
    expect(ack.ok).toBe(true);
    expect((await roundTrip(player)).netRuns).toHaveLength(0);
    expect((await roundTrip(gm)).netRuns).toHaveLength(0);
  });

  it('never shows a run to a player who is not the netrunner', async () => {
    // The GM drives their own figure into the same socket; the player must not
    // see the run at all — not an empty shaft, not a row of question marks.
    const gmTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'NPC netrunner',
        x: 0,
        y: 0,
      }),
      'token:create',
    ).id;
    const ack = await emitAck(gm, 'netrun:start', {
      tokenId: gmTokenId,
      accessPointId: pointId,
    });
    // A figure with no sheet has no Interface — the refusal is the point.
    expect(errorOf(ack)).toBe('NET_NO_INTERFACE');
    expect((await roundTrip(player)).netRuns).toHaveLength(0);
  });

  /**
   * Etap 29a, kryterium ukończenia: „Podniesiony Interfejs Netrunnera działa
   * w `netrun.ts` od razu, bez przeładowania".
   *
   * Interfejs jest jedyną Zdolnością Specjalną z mechaniką **starszą niż etap
   * 30**, więc jako jedyna ma dwie drogi do tej samej liczby: kartę i trwający
   * run. Serwer czyta kartę świeżo przy każdej akcji sieciowej, ale samo to nie
   * wystarcza — okno runu stoi u gracza na payloadzie sprzed zakupu, dopóki
   * `character:advance` nie pchnie `netrun:sync`. Bez tego netrunner, który
   * kupił rangę w środku runu, widzi budżet o jeden zapis za stary, a to jest
   * dokładnie ta chwila, w której się ją kupuje.
   *
   * Kryterium przetrwało etap bez testu i bez oględzin (znalezione 09.09).
   */
  it('kupiona ranga Interfejsu dochodzi do trwającego runu bez ponownego wejścia', async () => {
    // Sufit drabinki to 10, a stół stawiał netrunnera właśnie na nim — niżej,
    // żeby w ogóle było co kupić, i z zapasem na jeden szczebel (240 PD za 4).
    await emitAck(gm, 'character:update', {
      characterId: netrunnerId,
      patch: { data: { roleAbilityRank: 3, improvementPoints: 240 } },
    });
    await emitAck(player, 'token:move', { tokenId: netrunnerTokenId, x: 0, y: 0, final: true });
    const started = data(
      await emitAck<NetRunPayload>(player, 'netrun:start', {
        tokenId: netrunnerTokenId,
        accessPointId: pointId,
      }),
      'netrun:start',
    );
    expect(started.interfaceRank).toBe(3);

    const pushed = waitFor<{ runs: NetRunPayload[] }>(player, 'netrun:sync');
    const bought = data(
      await emitAck<CharacterView>(player, 'character:advance', {
        characterId: netrunnerId,
        kind: 'ability',
        to: 4,
      }),
      'character:advance',
    );
    expect(bought.id).toBe(netrunnerId);

    // Nie „po ponownym wejściu" i nie „po `state:request`" — sam broadcast.
    const synced = await pushed;
    const run = synced.runs.find((entry) => entry.runId === started.runId);
    expect(run?.interfaceRank).toBe(4);
  });
});
