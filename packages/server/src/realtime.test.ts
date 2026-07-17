import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  ChatHistoryPage,
  ChatMessageBroadcast,
  InvitationSummary,
  PresenceBroadcast,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

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
};

let built: BuiltApp;
let baseUrl: string;
let gmCookie: string;
let rogueCookie: string;
let vexCookie: string;
const openSockets: ClientSocket[] = [];

function cookieOf(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error('missing set-cookie header');
  return raw.split(';')[0]!;
}

/**
 * Creates a client socket with a `state:sync` listener attached before the
 * connection completes, so the initial sync is never missed.
 */
function createSocket(cookie: string): { socket: ClientSocket; firstSync: Promise<StateSyncPayload> } {
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

/** Resolves when `event` does NOT arrive within `ms`; rejects if it does. */
function expectSilence(socket: ClientSocket, event: string, ms = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    const onEvent = (payload: unknown) => {
      clearTimeout(timer);
      reject(new Error(`unexpected ${event}: ${JSON.stringify(payload)}`));
    };
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      resolve();
    }, ms);
    socket.once(event, onEvent);
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

async function joinPlayer(token: string, name: string): Promise<string> {
  const res = await built.app.inject({
    method: 'POST',
    url: `/api/join/${token}`,
    payload: { name },
  });
  expect(res.statusCode).toBe(200);
  return cookieOf(res.headers['set-cookie']);
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
    payload: { name: 'Kampania realtime' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const token = (inviteRes.json() as InvitationSummary).token;

  rogueCookie = await joinPlayer(token, 'Rogue');
  vexCookie = await joinPlayer(token, 'Vex');
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

describe('state sync and presence', () => {
  it('sends state:sync with campaign and presence on connect', async () => {
    const { socket, firstSync } = createSocket(gmCookie);
    const sync = await firstSync;
    expect(sync.campaign?.name).toBe('Kampania realtime');
    expect(sync.presence).toEqual([{ userId: expect.any(String), name: 'MG', role: 'GM' }]);
    expect(sync.messages).toEqual([]);
    socket.disconnect();
  });

  it('updates presence when players join and leave', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;

    const joined = waitFor<PresenceBroadcast>(gm.socket, 'presence:update');
    const rogue = createSocket(rogueCookie);
    await rogue.firstSync;
    const afterJoin = await joined;
    expect(afterJoin.presence.map((p) => p.name)).toEqual(['MG', 'Rogue']);

    const left = waitFor<PresenceBroadcast>(gm.socket, 'presence:update');
    rogue.socket.disconnect();
    const afterLeave = await left;
    expect(afterLeave.presence.map((p) => p.name)).toEqual(['MG']);
    gm.socket.disconnect();
  });

  it('deduplicates presence for two tabs of the same user', async () => {
    const first = createSocket(gmCookie);
    await first.firstSync;
    const second = createSocket(gmCookie);
    const sync = await second.firstSync;
    expect(sync.presence.filter((p) => p.name === 'MG')).toHaveLength(1);
    first.socket.disconnect();
    second.socket.disconnect();
  });

  it('answers state:request with a fresh state:sync', async () => {
    const { socket, firstSync } = createSocket(gmCookie);
    await firstSync;
    const resync = waitFor<StateSyncPayload>(socket, 'state:sync');
    socket.emit('state:request');
    expect((await resync).campaign?.name).toBe('Kampania realtime');
    socket.disconnect();
  });
});

describe('chat', () => {
  it('broadcasts a public message to everyone with consecutive seq', async () => {
    const gm = createSocket(gmCookie);
    const rogue = createSocket(rogueCookie);
    await Promise.all([gm.firstSync, rogue.firstSync]);

    const gmMsg = waitFor<ChatMessageBroadcast>(gm.socket, 'chat:message');
    const rogueMsg = waitFor<ChatMessageBroadcast>(rogue.socket, 'chat:message');
    const ack = await emitAck(rogue.socket, 'chat:send', { text: 'cześć wszystkim' });
    expect(ack.ok).toBe(true);

    const [toGm, toRogue] = await Promise.all([gmMsg, rogueMsg]);
    expect(toGm.message.text).toBe('cześć wszystkim');
    expect(toGm.message.authorName).toBe('Rogue');
    expect(toGm.message.kind).toBe('say');
    expect(toGm.seq).toEqual(expect.any(Number));
    expect(toRogue.message.id).toBe(toGm.message.id);

    gm.socket.disconnect();
    rogue.socket.disconnect();
  });

  it('rejects an unknown command and an empty message', async () => {
    const { socket, firstSync } = createSocket(rogueCookie);
    await firstSync;
    expect(await emitAck(socket, 'chat:send', { text: '/dance' })).toEqual({
      ok: false,
      error: 'UNKNOWN_COMMAND',
    });
    expect(await emitAck(socket, 'chat:send', { text: '   ' })).toEqual({
      ok: false,
      error: 'EMPTY_MESSAGE',
    });
    socket.disconnect();
  });
});

describe('whispers', () => {
  it('delivers a whisper only to the sender and the recipient', async () => {
    const gm = createSocket(gmCookie);
    const rogue = createSocket(rogueCookie);
    const vex = createSocket(vexCookie);
    await Promise.all([gm.firstSync, rogue.firstSync, vex.firstSync]);

    const toRogue = waitFor<ChatMessageBroadcast>(rogue.socket, 'chat:message');
    const toVex = waitFor<ChatMessageBroadcast>(vex.socket, 'chat:message');
    const gmSilent = expectSilence(gm.socket, 'chat:message');

    const ack = await emitAck(rogue.socket, 'chat:send', { text: '/w Vex tajny plan' });
    expect(ack.ok).toBe(true);

    const [senderCopy, recipientCopy] = await Promise.all([toRogue, toVex]);
    expect(recipientCopy.message).toMatchObject({
      kind: 'whisper',
      authorName: 'Rogue',
      recipientName: 'Vex',
      text: 'tajny plan',
    });
    expect(senderCopy.message.id).toBe(recipientCopy.message.id);
    // Whispers are targeted deliveries — they carry no room seq.
    expect(recipientCopy.seq).toBeUndefined();

    // The GM (third participant) never receives the payload.
    await gmSilent;

    gm.socket.disconnect();
    rogue.socket.disconnect();
    vex.socket.disconnect();
  });

  it('resolves whisper targets case-insensitively (also the GM by name)', async () => {
    const gm = createSocket(gmCookie);
    const rogue = createSocket(rogueCookie);
    await Promise.all([gm.firstSync, rogue.firstSync]);

    const toGm = waitFor<ChatMessageBroadcast>(gm.socket, 'chat:message');
    const ack = await emitAck(rogue.socket, 'chat:send', { text: '/w mg melduję się' });
    expect(ack.ok).toBe(true);
    expect((await toGm).message).toMatchObject({ kind: 'whisper', recipientName: 'MG' });

    gm.socket.disconnect();
    rogue.socket.disconnect();
  });

  it('rejects whispers to unknown users and to oneself', async () => {
    const { socket, firstSync } = createSocket(rogueCookie);
    await firstSync;
    expect(await emitAck(socket, 'chat:send', { text: '/w Nikt hej' })).toEqual({
      ok: false,
      error: 'TARGET_NOT_FOUND',
    });
    expect(await emitAck(socket, 'chat:send', { text: '/w Rogue hej' })).toEqual({
      ok: false,
      error: 'TARGET_IS_SELF',
    });
    socket.disconnect();
  });

  it('hides other people’s whispers from history and sync', async () => {
    // Whisper Rogue → Vex exists from the earlier test; the GM must not see it.
    const gm = createSocket(gmCookie);
    const gmSync = await gm.firstSync;
    // The GM does see whispers addressed to them (/w mg …), but never the
    // Rogue → Vex one.
    expect(gmSync.messages.some((m) => m.kind === 'whisper' && m.text === 'tajny plan')).toBe(
      false,
    );

    const vex = createSocket(vexCookie);
    const vexSync = await vex.firstSync;
    expect(
      vexSync.messages.some((m) => m.kind === 'whisper' && m.text === 'tajny plan'),
    ).toBe(true);

    gm.socket.disconnect();
    vex.socket.disconnect();
  });
});

describe('history pagination', () => {
  it('pages backwards with beforeId and reports hasMore', async () => {
    const { socket, firstSync } = createSocket(gmCookie);
    await firstSync;

    for (let i = 1; i <= 5; i += 1) {
      const ack = await emitAck(socket, 'chat:send', { text: `wiadomość ${i}` });
      expect(ack.ok).toBe(true);
    }

    // Get the newest page to find the cursor.
    const syncPromise = waitFor<StateSyncPayload>(socket, 'state:sync');
    socket.emit('state:request');
    const sync = await syncPromise;
    const newestIds = sync.messages.map((m) => m.id);
    expect(newestIds.length).toBeGreaterThanOrEqual(5);

    const page = await emitAck<ChatHistoryPage>(socket, 'chat:history', {
      beforeId: newestIds.at(-3),
      limit: 2,
    });
    if (!page.ok || !page.data) throw new Error('history request failed');
    expect(page.data.messages).toHaveLength(2);
    // Ascending, directly preceding the cursor.
    const idx = newestIds.indexOf(newestIds.at(-3)!);
    expect(page.data.messages.map((m) => m.id)).toEqual(newestIds.slice(idx - 2, idx));
    expect(page.data.hasMore).toBe(true);

    expect(await emitAck(socket, 'chat:history', { beforeId: -1 })).toEqual({
      ok: false,
      error: 'BAD_REQUEST',
    });

    socket.disconnect();
  });
});

describe('resync after disconnect', () => {
  it('replays messages missed while offline in the next state:sync', async () => {
    const rogue = createSocket(rogueCookie);
    await rogue.firstSync;
    rogue.socket.disconnect();

    const vex = createSocket(vexCookie);
    await vex.firstSync;
    const ack = await emitAck(vex.socket, 'chat:send', { text: 'wysłane pod nieobecność' });
    expect(ack.ok).toBe(true);

    const rogueAgain = createSocket(rogueCookie);
    const sync = await rogueAgain.firstSync;
    expect(sync.messages.some((m) => m.text === 'wysłane pod nieobecność')).toBe(true);

    vex.socket.disconnect();
    rogueAgain.socket.disconnect();
  });
});
