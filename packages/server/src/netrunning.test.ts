import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  InvitationSummary,
  NetArchitectureListPayload,
  NetArchitectureRollResult,
  NetArchitectureView,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import { netDeepestBranch, netFloorCount, validateNetArchitecture } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Smoke tests for the Net Architecture library (stage 26a).
 *
 * `dataPrivateDir` points at a directory that does not exist on purpose: the
 * generator has to work off the committed sample tables, which is also the
 * „fresh clone without data/private" path from the stage's criteria.
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

function waitFor<T>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
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

/** A trunk of three floors: a File, a password and a floor of Black ICE. */
function sampleArchitecture(name = 'Sieć magazynu') {
  return {
    name,
    difficulty: 'standard',
    branches: [
      {
        parentFloor: null,
        floors: [
          { kind: 'file', label: 'Listy przewozowe', dv: 7 },
          { kind: 'password', label: 'Brama', dv: 7 },
          { kind: 'ice', label: 'Zasadzka', programIds: ['program.osa'] },
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
    payload: { name: 'Kampania sieciowa' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const token = (inviteRes.json() as InvitationSummary).token;

  const join = await built.app.inject({
    method: 'POST',
    url: `/api/join/${token}`,
    payload: { name: 'Vex' },
  });
  playerCookie = cookieOf(join.headers['set-cookie']);
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

describe('net architecture library', () => {
  it('starts empty and takes a hand-built architecture', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;

    const empty = await emitAck<NetArchitectureListPayload>(gm.socket, 'net:list');
    expect(empty.ok).toBe(true);
    expect(empty.data?.architectures ?? []).toHaveLength(0);

    const saved = await emitAck<NetArchitectureView>(gm.socket, 'net:save', {
      architecture: sampleArchitecture(),
    });
    expect(saved.ok).toBe(true);
    expect(saved.data?.name).toBe('Sieć magazynu');
    expect(saved.data?.floors).toBe(3);

    const listed = await emitAck<NetArchitectureListPayload>(gm.socket, 'net:list');
    expect(listed.data?.architectures.map((entry) => entry.name)).toContain('Sieć magazynu');
  });

  it('reads a stored architecture back with every floor intact', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const saved = await emitAck<NetArchitectureView>(gm.socket, 'net:save', {
      architecture: sampleArchitecture('Sieć biura'),
    });
    const id = saved.data?.id;
    expect(id).toBeDefined();

    const fetched = await emitAck<NetArchitectureView>(gm.socket, 'net:get', { id });
    expect(fetched.ok).toBe(true);
    const floors = fetched.data?.architecture.branches[0]?.floors ?? [];
    expect(floors.map((floor) => floor.kind)).toEqual(['file', 'password', 'ice']);
    expect(floors[1]?.dv).toBe(7);
    expect(floors[2]?.programIds).toEqual(['program.osa']);
  });

  it('broadcasts the refreshed list to the GM room on save', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const broadcast = waitFor<NetArchitectureListPayload>(gm.socket, 'net:architectures');
    await emitAck(gm.socket, 'net:save', { architecture: sampleArchitecture('Sieć klubu') });
    const payload = await broadcast;
    expect(payload.architectures.map((entry) => entry.name)).toContain('Sieć klubu');
  });

  it('refuses an architecture with no trunk, in Polish', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const ack = await emitAck(gm.socket, 'net:save', {
      architecture: { name: 'Bez trzonu', branches: [] },
    });
    expect(ack.ok).toBe(false);
    if (ack.ok) return;
    expect(ack.error).toContain('INVALID_ARCHITECTURE:');
    expect(ack.error).toContain('trzon');
  });

  it('never lets a player near the library — not the list, not one row', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const saved = await emitAck<NetArchitectureView>(gm.socket, 'net:save', {
      architecture: sampleArchitecture('Sieć tajna'),
    });

    const player = createSocket(playerCookie);
    await player.firstSync;
    const list = await emitAck(player.socket, 'net:list');
    expect(list.ok).toBe(false);
    const get = await emitAck(player.socket, 'net:get', { id: saved.data?.id });
    expect(get.ok).toBe(false);
    const save = await emitAck(player.socket, 'net:save', { architecture: sampleArchitecture() });
    expect(save.ok).toBe(false);
  });

  it('deletes an architecture and says so to the GM room', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const saved = await emitAck<NetArchitectureView>(gm.socket, 'net:save', {
      architecture: sampleArchitecture('Sieć do skasowania'),
    });
    const id = saved.data?.id;

    const broadcast = waitFor<{ id: string }>(gm.socket, 'net:deleted');
    const ack = await emitAck(gm.socket, 'net:delete', { id });
    expect(ack.ok).toBe(true);
    expect((await broadcast).id).toBe(id);

    const gone = await emitAck(gm.socket, 'net:get', { id });
    expect(gone.ok).toBe(false);
    if (gone.ok) return;
    expect(gone.error).toBe('ARCHITECTURE_NOT_FOUND');
  });

  it('edits an architecture in place instead of leaving a second copy', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const saved = await emitAck<NetArchitectureView>(gm.socket, 'net:save', {
      architecture: sampleArchitecture('Sieć do poprawki'),
    });
    const id = saved.data?.id;
    const before = (await emitAck<NetArchitectureListPayload>(gm.socket, 'net:list')).data
      ?.architectures.length;

    await emitAck(gm.socket, 'net:save', {
      id,
      architecture: { ...sampleArchitecture('Sieć poprawiona'), difficulty: 'advanced' },
    });
    const after = await emitAck<NetArchitectureListPayload>(gm.socket, 'net:list');
    expect(after.data?.architectures.length).toBe(before);
    const row = after.data?.architectures.find((entry) => entry.id === id);
    expect(row?.name).toBe('Sieć poprawiona');
    expect(row?.difficulty).toBe('advanced');
  });
});

describe('architecture generator on live sockets', () => {
  it('rolls a shape off the sample tables and hands back a saveable draft', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const ack = await emitAck<NetArchitectureRollResult>(gm.socket, 'net:roll', {
      name: 'Wylosowana',
      difficulty: 'standard',
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok || !ack.data) return;
    expect(ack.data.summary).toContain('3k6');
    expect(netFloorCount(ack.data.architecture)).toBeGreaterThanOrEqual(3);
    expect(validateNetArchitecture(ack.data.architecture).ok).toBe(true);
    // Whatever the dice said, one column has to be the deepest — the Virus
    // needs somewhere to go.
    expect(netDeepestBranch(ack.data.architecture)).not.toBeNull();
  });

  it('takes a fixed shape from the GM and says the dice were not used', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const ack = await emitAck<NetArchitectureRollResult>(gm.socket, 'net:roll', {
      name: 'Cztery piętra',
      difficulty: 'basic',
      floors: 4,
      branches: 0,
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok || !ack.data) return;
    expect(netFloorCount(ack.data.architecture)).toBe(4);
    expect(ack.data.summary).toContain('bez rzutu');
  });

  it('does not store the roll — a shape the GM dislikes costs nothing', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const before = (await emitAck<NetArchitectureListPayload>(gm.socket, 'net:list')).data
      ?.architectures.length;
    await emitAck(gm.socket, 'net:roll', { name: 'Nietrafiona', difficulty: 'high' });
    const after = (await emitAck<NetArchitectureListPayload>(gm.socket, 'net:list')).data
      ?.architectures.length;
    expect(after).toBe(before);
  });

  it('refuses to roll for a player', async () => {
    const player = createSocket(playerCookie);
    await player.firstSync;
    const ack = await emitAck(player.socket, 'net:roll', { name: 'Nie moja', difficulty: 'basic' });
    expect(ack.ok).toBe(false);
  });
});

describe('programs in the catalogue', () => {
  it('ships the sample Programs and Demons to everyone at the table', async () => {
    const gm = createSocket(gmCookie);
    const player = createSocket(playerCookie);
    const [gmSync, playerSync] = await Promise.all([gm.firstSync, player.firstSync]);

    const programs = gmSync.compendium.entries.filter((entry) => entry.category === 'program');
    expect(programs.length).toBeGreaterThan(0);
    // The catalogue is shared reference data, unlike the architecture library.
    expect(playerSync.compendium.entries.filter((e) => e.category === 'program').length).toBe(
      programs.length,
    );
    expect(gmSync.compendium.entries.some((entry) => entry.category === 'netDefense')).toBe(true);
  });

  it('gives the sample cyberdeck its slot count', async () => {
    const gm = createSocket(gmCookie);
    const sync = await gm.firstSync;
    const deck = sync.compendium.entries.find(
      (entry) => entry.category === 'gear' && entry.deckSlots !== undefined,
    );
    expect(deck).toBeDefined();
  });
});
