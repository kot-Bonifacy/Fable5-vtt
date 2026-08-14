import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  ChatMessageBroadcast,
  CharacterView,
  CpredCharacterData,
  CpredCreationDraft,
  CpredDataPayload,
  CreationDraftView,
  InvitationSummary,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import { CPRED_STAT_IDS, buildCpredRegistry, withCreationData } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * The character creator (stage 25a), on live sockets.
 *
 * Runs on the committed sample `creation.json` — the same „fresh clone without
 * data/private" path every other suite uses — so the numbers below are the
 * sample's, not the rulebook's.
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
let vexCookie: string;
let vexId: string;
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

function waitFor<T>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

type Draft = CreationDraftView<CpredCreationDraft>;

async function patch(socket: ClientSocket, body: Record<string, unknown>): Promise<Draft> {
  return data(await emitAck<Draft>(socket, 'creation:patch', { patch: body }), 'creation:patch');
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
    payload: { name: 'Sesja zerowa' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const token = (inviteRes.json() as InvitationSummary).token;

  const joinVex = await built.app.inject({
    method: 'POST',
    url: `/api/join/${token}`,
    payload: { name: 'Vex' },
  });
  vexCookie = cookieOf(joinVex.headers['set-cookie']);
  vexId = (joinVex.json() as { user: { id: string } }).user.id;
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

describe('GET /api/cpred/data', () => {
  it('serves the registry the server itself validates against', async () => {
    const res = await built.app.inject({
      method: 'GET',
      url: '/api/cpred/data',
      headers: { cookie: vexCookie },
    });
    expect(res.statusCode).toBe(200);
    const payload = res.json() as CpredDataPayload;
    expect(payload.skills.length).toBeGreaterThan(0);
    expect(payload.roles.length).toBe(10);
    const registry = withCreationData(
      buildCpredRegistry({ skills: payload.skills }, { roles: payload.roles }),
      payload.creation,
    );
    expect(registry.creation?.roles).toHaveLength(10);
  });

  it('is not open to the street', async () => {
    const res = await built.app.inject({ method: 'GET', url: '/api/cpred/data' });
    expect(res.statusCode).toBe(401);
  });
});

describe('kreator postaci', () => {
  let vex: ClientSocket;
  let gm: ClientSocket;
  let roleSkills: string[] = [];

  it('opens a fresh draft and hands the same one back on a second click', async () => {
    const vexConn = createSocket(vexCookie);
    const gmConn = createSocket(gmCookie);
    vex = vexConn.socket;
    gm = gmConn.socket;
    await Promise.all([vexConn.firstSync, gmConn.firstSync]);

    const first = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
    expect(first.draft.step).toBe('role');
    expect(first.draft.roleId).toBeNull();

    await patch(vex, { name: 'Zgrzyt' });
    const second = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
    expect(second.draft.name).toBe('Zgrzyt');
  });

  it('refuses a Role that is not in the data files', async () => {
    const ack = await emitAck<Draft>(vex, 'creation:patch', { patch: { roleId: 'wampir' } });
    expect(ack.ok).toBe(false);
    expect(ack.error).toBe('INVALID_DATA');
  });

  it('refuses stats written by hand when the method is the one that rolls them', async () => {
    await patch(vex, { method: 'edgerunner', roleId: 'solo' });
    const ack = await emitAck<Draft>(vex, 'creation:patch', {
      patch: { stats: Object.fromEntries(CPRED_STAT_IDS.map((id) => [id, 8])) },
    });
    expect(ack.ok).toBe(false);
    expect(ack.error).toBe('INVALID_DATA');
  });

  it('rolls the spread on the server and puts the card on the chat', async () => {
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const rolled = data(await emitAck<Draft>(vex, 'creation:roll'), 'creation:roll');

    for (const id of CPRED_STAT_IDS) {
      const roll = rolled.draft.statRolls[id];
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(10);
      expect(rolled.draft.stats[id]).toBeGreaterThan(0);
    }

    const message = await card;
    const roll = message.message.roll;
    expect(roll?.notation).toBe('10k10');
    expect(roll?.title).toContain('Rozkład Cech');
    // The card's total is what the spread is worth, not the meaningless sum of
    // ten row numbers.
    const spread = CPRED_STAT_IDS.reduce((sum, id) => sum + (rolled.draft.stats[id] ?? 0), 0);
    expect(roll?.total).toBe(spread);
    expect(roll?.breakdown).toHaveLength(CPRED_STAT_IDS.length);
  });

  it('reads every rolled stat out of the Role template, not out of thin air', async () => {
    const res = await built.app.inject({
      method: 'GET',
      url: '/api/cpred/data',
      headers: { cookie: vexCookie },
    });
    const payload = res.json() as CpredDataPayload;
    const registry = withCreationData(
      buildCpredRegistry({ skills: payload.skills }, { roles: payload.roles }),
      payload.creation,
    );
    const creation = registry.creation!;
    const solo = creation.roles.find((role) => role.id === 'solo')!;
    roleSkills = solo.skills;

    const current = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
    for (const id of CPRED_STAT_IDS) {
      const roll = current.draft.statRolls[id]!;
      const column = creation.statOrder.indexOf(id);
      expect(current.draft.stats[id]).toBe(solo.statTemplates[roll - 1]![column]);
    }
  });

  it('will not roll for the method that buys its stats', async () => {
    await patch(vex, { method: 'complete' });
    const ack = await emitAck<Draft>(vex, 'creation:roll');
    expect(ack.ok).toBe(false);
    expect(ack.error).toBe('METHOD_DOES_NOT_ROLL');
    // Switching the method threw the rolled spread away — it was read off a
    // template this method never looks at.
    const back = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
    expect(back.draft.stats.body).toBeUndefined();
  });

  it('drops skills that leave the Role list when the Role changes', async () => {
    await patch(vex, { method: 'edgerunner', roleId: 'netrunner' });
    const netrunner = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
    // Cryptography is a Netrunner's; a Solo has never heard of it.
    await patch(vex, { skills: { ...netrunner.draft.skills, cryptography: 4 } });
    const withCrypto = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
    expect(withCrypto.draft.skills.cryptography).toBe(4);

    const back = await patch(vex, { roleId: 'solo' });
    expect(back.draft.skills.cryptography).toBeUndefined();
  });

  it('refuses to finish a draft the rules are still unhappy about', async () => {
    const ack = await emitAck<CharacterView>(vex, 'creation:finish');
    expect(ack.ok).toBe(false);
    expect(ack.error).toBe('CREATION_INCOMPLETE');
  });

  it('finishes into a real sheet the player owns, and the draft is gone', async () => {
    await patch(vex, { method: 'edgerunner', roleId: 'solo', name: 'Zgrzyt' });
    data(await emitAck<Draft>(vex, 'creation:roll'), 'creation:roll');
    await patch(vex, { skills: Object.fromEntries(roleSkills.map((id) => [id, 4])) });

    const character = data(await emitAck<CharacterView>(vex, 'creation:finish'), 'creation:finish');
    expect(character.name).toBe('Zgrzyt');
    expect(character.ownerId).toBe(vexId);
    const sheet = character.data as CpredCharacterData;
    expect(sheet.roleId).toBe('solo');
    expect(sheet.roleAbilityRank).toBe(4);
    expect(sheet.hpCurrent).toBeGreaterThan(0);
    expect(sheet.skills.athletics).toBe(4);

    // The wizard opens on a clean sheet afterwards, not on the finished one.
    const fresh = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
    expect(fresh.draft.roleId).toBeNull();
    expect(fresh.draft.name).toBe('');
  });

  it('keeps the draft across a reconnect — that is why it is in the database', async () => {
    await patch(vex, { roleId: 'fixer', name: 'Kolec' });
    vex.disconnect();
    const again = createSocket(vexCookie);
    vex = again.socket;
    await again.firstSync;
    const restored = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
    expect(restored.draft.roleId).toBe('fixer');
    expect(restored.draft.name).toBe('Kolec');
  });

  it('throws the draft away on request', async () => {
    const ack = await emitAck(vex, 'creation:discard');
    expect(ack.ok).toBe(true);
    const fresh = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
    expect(fresh.draft.roleId).toBeNull();
  });

  it('gives the GM the same wizard, with a character that belongs to nobody', async () => {
    data(await emitAck<Draft>(gm, 'creation:start'), 'creation:start');
    await patch(gm, { method: 'complete', roleId: 'medtech', name: 'Doktor' });
    await patch(gm, { stats: Object.fromEntries(CPRED_STAT_IDS.map((id) => [id, 6])) });
    const res = await built.app.inject({
      method: 'GET',
      url: '/api/cpred/data',
      headers: { cookie: gmCookie },
    });
    const payload = res.json() as CpredDataPayload;
    const registry = withCreationData(
      buildCpredRegistry({ skills: payload.skills }, { roles: payload.roles }),
      payload.creation,
    );
    const basics = registry.creation!.basicSkills;
    await patch(gm, { skills: Object.fromEntries(basics.map((id) => [id, 2])) });

    const character = data(await emitAck<CharacterView>(gm, 'creation:finish'), 'creation:finish');
    expect(character.name).toBe('Doktor');
    expect(character.ownerId).toBeNull();
    expect((character.data as CpredCharacterData).stats.body).toBe(6);
  });
});
