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

/**
 * Wykrycie w Sieci zaczyna walkę (decyzja MG z 14.11) na żywych gniazdach.
 *
 * Czarny LOD, który wykrył netrunnera, i ostatecznie nieudane Maskowanie
 * zakładają starcie jak zauważenie wroga (etap 56): runda 0, pasek MG z tekstem
 * o Sieci (`sighting.net`), drużyna stoi — także w Sieci. „Rozpocznij walkę”
 * stawia LOD-a na czele kolejki (s. 205), a hamulec MG wstrzymuje alarm.
 *
 * Rozstrzygnięcia wymuszają liczby wpisów: „Strażnik” ma PRĘ 0 (netrunner
 * zawsze ucieka przed darmowym atakiem) i PER 30 (Maskowanie pod jego okiem
 * nigdy się nie udaje), ATK 0 i tylko kradnie Akcję Sieciową.
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
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 4000);
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

function waitFor<T>(socket: ClientSocket, event: string, ms = 4000): Promise<T> {
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
    payload: { name: 'Kampania wykrycia w Sieci' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Kolec'),
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
  playerId = (joinRes.json() as { user: { id: string } }).user.id;
}, 60_000);

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // Windows may still hold the file; nothing to clean up.
  }
});

describe('wykrycie w Sieci zaczyna walkę (decyzja MG z 14.11)', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let tokenId: string;
  let runId: string;

  const GUARD = 'ice-f1-0';

  async function runOf(socket: ClientSocket): Promise<NetRunPayload> {
    const sync = await roundTrip(socket);
    const run = sync.netRuns.find((entry) => entry.runId === runId);
    if (!run) throw new Error('run missing from sync');
    return run;
  }

  async function combatOf(socket: ClientSocket = gm): Promise<CombatView | null> {
    return (await roundTrip(socket)).combat;
  }

  const rowNamed = (combat: CombatView, name: string) =>
    combat.combatants.find((row) => row.name === name);

  const cloak = () =>
    emitAck<NetRunAbilityResult>(player, 'netrun:ability', { runId, ability: 'cloak' });

  /** Próby Maskowania do ostatecznej porażki; zwraca walkę sprzed ostatniej. */
  async function cloakUntilFailed(): Promise<CombatView | null> {
    let before: CombatView | null = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      before = await combatOf();
      const result = data(await cloak(), 'netrun:ability (cloak)');
      expect(result.success).toBe(false);
      if ((await runOf(player)).run.here?.cloak === 'failed') return before;
    }
    throw new Error('Maskowanie nie skończyło się porażką w dziesięciu próbach');
  }

  it('stawia stół bez walki: netrunner w gnieździe, Strażnik na piętrze niżej', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    data(
      await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
        entry: {
          category: 'program',
          name: 'Strażnik',
          programClass: 'attacker',
          target: 'antiPersonnel',
          blackIce: true,
          atk: 0,
          def: 30,
          rez: 30,
          per: 30,
          speed: 0,
          effects: { hooks: ['stealNetAction'] },
        },
      }),
      'compendium:upsert (Strażnik)',
    );

    const character = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Kolec', ownerId: playerId }),
      'character:create',
    );
    await emitAck(gm, 'character:update', {
      characterId: character.id,
      patch: {
        data: {
          roleId: 'netrunner',
          roleAbilityRank: 10,
          cyberdeck: { name: 'Dek testowy', slots: 6, installed: [] },
        },
      },
    });

    sceneId = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Archiwum' }),
      'scene:create',
    ).id;
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMove: 'explore' } });
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
        characterId: character.id,
      }),
      'token:create',
    ).id;

    const architectureId = data(
      await emitAck<NetArchitectureView>(gm, 'net:save', {
        architecture: {
          name: 'Sieć archiwum',
          difficulty: 'standard',
          branches: [
            {
              id: 'trunk',
              parentFloor: null,
              floors: [
                { id: 'f0', kind: 'empty', label: 'Wejście' },
                { id: 'f1', kind: 'ice', label: 'Strażnik', programIds: ['program.straznik'] },
                { id: 'f2', kind: 'empty', label: 'Korytarz' },
              ],
            },
          ],
        },
      }),
      'net:save',
    ).id;
    const pointId = data(
      await emitAck<NetAccessPointView>(gm, 'netpoint:place', {
        sceneId,
        x: 50,
        y: 50,
        name: 'Terminal archiwum',
        architectureId,
        hidden: false,
      }),
      'netpoint:place',
    ).id;

    runId = data(
      await emitAck<NetRunPayload>(player, 'netrun:start', { tokenId, accessPointId: pointId }),
      'netrun:start',
    ).runId;
    expect(await combatOf()).toBeNull();
  });

  it('LOD, który wykrył netrunnera, zakłada starcie „Przed walką” z paskiem MG o Sieci', async () => {
    data(
      await emitAck<NetRunPayload>(player, 'netrun:move', {
        runId,
        to: { branchId: 'trunk', floor: 1 },
      }),
      'netrun:move (1)',
    );
    const guard = (await runOf(gm)).run.combat.ice.find((entry) => entry.id === GUARD);
    expect(guard).toMatchObject({ mode: 'hunting', detected: true });

    const combat = await combatOf();
    expect(combat?.round).toBe(0);
    expect(combat?.sighting).toEqual({
      spotterIds: [tokenId],
      foeIds: [],
      net: { foes: ['Strażnik'], traces: false },
    });
    expect(rowNamed(combat!, 'Kolec')).toBeDefined();
    expect(rowNamed(combat!, 'Strażnik')).toBeDefined();
    // Gracz widzi starcie, ale nie to, skąd się wzięło.
    expect(await combatOf(player)).not.toHaveProperty('sighting');
  });

  it('drużyna stoi — w Sieci też — dopóki MG nie zdecyduje', async () => {
    const refused = await emitAck(player, 'netrun:move', {
      runId,
      to: { branchId: 'trunk', floor: 0 },
    });
    expect(errorOf(refused)).toBe('COMBAT_PENDING');
    expect((await runOf(player)).run.here?.id).toBe('f1');
  });

  it('„Rozpocznij walkę” stawia LOD-a na czele kolejki, nawet przed szybszym', async () => {
    const before = (await combatOf())!;
    await emitAck(gm, 'combat:set-initiative', {
      combatantId: rowNamed(before, 'Kolec')!.id,
      initiative: 12,
    });
    data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next (start)');
    const started = (await combatOf())!;
    expect(started.round).toBe(1);
    expect(rowNamed(started, 'Strażnik')?.initiative).toBe(13);
    expect(started.combatants[0]?.name).toBe('Strażnik');
    // LOD zagrał swoją Turę sam, wskaźnik przeszedł na Kolca.
    expect(started.activeCombatantId).toBe(rowNamed(started, 'Kolec')!.id);
  });

  it('nieudane Maskowanie pod okiem Strażnika zakłada starcie dopiero przy ostatniej próbie', async () => {
    // „Odwołaj” MG: walki nie ma, Strażnik dalej poluje.
    expect((await emitAck(gm, 'combat:end', { sceneId })).ok).toBe(true);
    expect(await combatOf()).toBeNull();

    const beforeLast = await cloakUntilFailed();
    // Pierwsze pechowe próby niczego nie zakładają.
    expect(beforeLast).toBeNull();
    const combat = await combatOf();
    expect(combat?.round).toBe(0);
    expect(combat?.sighting).toEqual({
      spotterIds: [tokenId],
      foeIds: [],
      net: { foes: ['Strażnik'], traces: true },
    });
    // Tylko drużyna i strażnik piętra, który już poluje.
    expect(combat?.combatants.map((row) => row.name).sort()).toEqual(['Kolec', 'Strażnik']);
  });

  it('z hamulcem MG nieudane Maskowanie zostawia tylko ślad', async () => {
    expect((await emitAck(gm, 'combat:end', { sceneId })).ok).toBe(true);
    expect((await emitAck(gm, 'netrun:defense:pause', { runId, paused: true })).ok).toBe(true);
    await emitAck(gm, 'netrun:hacks:reset', { runId });
    expect((await runOf(player)).run.here?.cloak).not.toBe('failed');

    await cloakUntilFailed();
    expect(await combatOf()).toBeNull();
  });
});
