import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { CampaignSummary, ChatClearedPush, SocketAck, StateSyncPayload } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';

/**
 * „Wyczyść czat” MG (24.10.2026): `chat:clear` kasuje cały czat kampanii,
 * stół dostaje push, a historia po ponownym połączeniu jest pusta.
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
let olaCookie: string;
let campaignId: string;
const openSockets: ClientSocket[] = [];

function cookieOf(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error('missing set-cookie header');
  return raw.split(';')[0]!;
}

async function listen(app: BuiltApp): Promise<string> {
  await app.app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.app.server.address();
  if (address === null || typeof address === 'string') throw new Error('no server address');
  return `http://127.0.0.1:${address.port}`;
}

/** Świeże gniazdo i jego pierwszy `state:sync` — tak klient dostaje historię. */
function connect(
  cookie: string,
  url = baseUrl,
  ms = 4000,
): Promise<{ socket: ClientSocket; sync: StateSyncPayload }> {
  const socket = ioClient(url, { extraHeaders: { cookie }, reconnection: false, timeout: ms });
  openSockets.push(socket);
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('state:sync timeout'));
    }, ms);
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.once('state:sync', (sync: StateSyncPayload) => {
      clearTimeout(timer);
      resolvePromise({ socket, sync });
    });
  });
}

function emitAck(socket: ClientSocket, event: string, payload: unknown): Promise<SocketAck> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 3000);
    socket.emit(event, payload, (response: SocketAck) => {
      clearTimeout(timer);
      resolvePromise(response);
    });
  });
}

function nextEvent<T>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolvePromise(payload);
    });
  });
}

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: 'pipe',
  });
  built = await buildApp(config, { logger: false });
  baseUrl = await listen(built);

  const login = await built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: 'MG', password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);
  const created = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Czysty czat' },
  });
  campaignId = (created.json() as CampaignSummary).id;
  olaCookie = cookieOf(
    (await built.app.inject({ method: 'POST', url: await joinUrl(built, campaignId, 'Ola') }))
      .headers['set-cookie'],
  );
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

describe('chat:clear', () => {
  it('gracz nie czyści, puste wywołanie MG niczego nie usuwa', async () => {
    const ola = await connect(olaCookie);
    const gm = await connect(gmCookie);
    expect((await emitAck(ola.socket, 'chat:send', { text: 'Zostaję.' })).ok).toBe(true);
    expect(await emitAck(ola.socket, 'chat:clear', { confirm: true })).toMatchObject({
      ok: false,
    });
    expect(await emitAck(gm.socket, 'chat:clear', {})).toMatchObject({
      ok: false,
      error: 'BAD_REQUEST',
    });
    expect(await built.prisma.chatMessage.count({ where: { campaignId } })).toBe(1);
  });

  it('MG czyści — stół dostaje push, historia jest pusta', async () => {
    const ola = await connect(olaCookie);
    const gm = await connect(gmCookie);
    expect((await emitAck(gm.socket, 'chat:send', { text: 'Przygotowanie MG.' })).ok).toBe(true);
    const cleared = nextEvent<ChatClearedPush>(ola.socket, 'chat:clear');
    const ack = await emitAck(gm.socket, 'chat:clear', { confirm: true });
    expect(ack).toEqual({ ok: true, data: { removed: 2 } });
    expect(await cleared).toEqual({ removed: 2 });
    expect(await built.prisma.chatMessage.count({ where: { campaignId } })).toBe(0);
    expect((await connect(olaCookie)).sync.messages).toEqual([]);
    expect((await connect(gmCookie)).sync.messages).toEqual([]);
  });
});
