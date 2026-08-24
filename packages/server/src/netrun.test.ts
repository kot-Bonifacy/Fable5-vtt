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
    payload: { password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);

  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Kampania runów' },
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
});

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
  let netrunnerTokenId: string;
  let soloTokenId: string;
  let pointId: number;
  let runId: string;

  function floorOf(run: NetRunPayload, id: string) {
    return run.run.branches[0]!.floors.find((floor) => floor.id === id);
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

    const floors = started.run.branches[0]!.floors;
    expect(floors[0]!.knowledge).toBe('entered');
    expect(floors[0]!.label).toBe('Lobby');
    // Everything below is a `?`: no kind, no label, no DV in the payload at all.
    for (const floor of floors.slice(1)) {
      expect(floor.knowledge).toBe('hidden');
      expect(floor.kind).toBeNull();
      expect(floor.label).toBeUndefined();
      expect(floor.dv).toBeUndefined();
    }
    expect(JSON.stringify(started)).not.toContain('Listy przewozowe');
  });

  it('gives the GM the whole shaft of the same run', async () => {
    const sync = await roundTrip(gm);
    const run = sync.netRuns.find((entry) => entry.runId === runId);
    expect(run?.gmView).toBe(true);
    const floors = run!.run.branches[0]!.floors;
    expect(floors.map((floor) => floor.kind)).toEqual(['empty', 'password', 'file', 'controlNode']);
    expect(floors[3]!.dv).toBe(1);
  });

  it('refuses to walk past a password nobody has broken', async () => {
    const ack = await emitAck(player, 'netrun:move', {
      runId,
      to: { branchId: 'trunk', floor: 3 } satisfies CpredNetPosition,
    });
    // The refusal is the ready Polish sentence, with the floor named in it.
    expect(errorOf(ack)).toContain('Brama serwisowa');
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
    }
    throw new Error('dziesięć Kontroli z PT 1 nie przeszło');
  });

  it('leaves a Virus on the bottom floor and keeps it past the disconnection', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = data(
        await emitAck<NetRunAbilityResult>(player, 'netrun:ability', {
          runId,
          ability: 'virus',
          virus: { description: 'Co pięć minut zmienia hasła', dv: 1, actions: 1 },
        }),
        'netrun:ability',
      );
      if (!result.success) continue;
      const run = await runOf(player);
      expect(run?.run.viruses[0]?.description).toBe('Co pięć minut zmienia hasła');
      // „PT zniszczenia tego Wirusa jest równe wynikowi rzutu" — the total.
      expect(run?.run.viruses[0]?.dv).toBe(result.total);
      return;
    }
    throw new Error('dziesięć Wirusów z PT 1 nie przeszło');
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
    await emitAck(player, 'token:move', {
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
    // „Odłączenie resetuje obronę Architektury" — the broken password is not.
    expect(floorOf(again, 'f1')?.broken).toBeUndefined();
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
});
