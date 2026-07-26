import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  AiChunkBroadcast,
  AiDoneBroadcast,
  AiStatus,
  AiStatusBroadcast,
  CampaignSummary,
  InvitationSummary,
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
  uploadsDir: mkdtempSync(join(tmpdir(), 'vtt-uploads-')),
  dataPublicDir: resolve(import.meta.dirname, '../../../data/public'),
  // Deliberately absent: tests run on the committed sample compendium,
  // which is also the "fresh clone without data/private" path.
  dataPrivateDir: resolve(import.meta.dirname, 'fixtures/no-private-data'),
  aiGatewayUrl: 'http://gateway.test',
  aiGatewayApiKey: 'test-key',
  // Fast polling so „gateway came back” is observable inside a test.
  aiHealthIntervalMs: 200,
  aiRequestTimeoutMs: 5000,
  ttsTimeoutMs: 5000,
  ttsCacheMaxBytes: 8 * 1024 * 1024,
};

/** Test-controlled stand-in for the Python gateway. */
const gateway = {
  up: true,
  /** Chunks the fake llama-server streams back, in order. */
  script: [] as { event: string; data: unknown }[],
  lastBody: null as Record<string, unknown> | null,
  lastApiKey: null as string | null,
};

function sseStream(events: { event: string; data: unknown }[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const { event, data } of events) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }
      controller.close();
    },
  });
}

const aiFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!gateway.up) throw new TypeError('fetch failed');

  if (url.endsWith('/health')) {
    return new Response(
      JSON.stringify({
        status: 'ok',
        llama: 'ready',
        model: 'Qwythos-9B-v2-Q8_0.gguf',
        context_size: 16384,
        queue_length: 0,
        busy: false,
        managed: true,
        restarts: 0,
        last_error: null,
        gpu: { name: 'RTX 5070 Ti', memory_total_mb: 16303, memory_used_mb: 11866 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }
  if (url.endsWith('/chat')) {
    gateway.lastBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    gateway.lastApiKey =
      (init?.headers as Record<string, string> | undefined)?.['x-api-key'] ?? null;
    return new Response(sseStream(gateway.script), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }
  return new Response('not found', { status: 404 });
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

/** Collects streamed chunks until `ai:done` (or `ai:error`) arrives. */
function collectAnswer(
  socket: ClientSocket,
  ms = 3000,
): Promise<{
  answer: string;
  thinking: string;
  done: AiDoneBroadcast | null;
  error: string | null;
}> {
  return new Promise((resolve, reject) => {
    let answer = '';
    let thinking = '';
    const timer = setTimeout(() => reject(new Error('ai stream timeout')), ms);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('ai:chunk', onChunk);
      socket.off('ai:done', onDone);
      socket.off('ai:error', onError);
    };
    const onChunk = (chunk: AiChunkBroadcast) => {
      if (chunk.kind === 'delta') answer += chunk.text;
      else thinking += chunk.text;
    };
    const onDone = (done: AiDoneBroadcast) => {
      cleanup();
      resolve({ answer, thinking, done, error: null });
    };
    const onError = (error: { code: string }) => {
      cleanup();
      resolve({ answer, thinking, done: null, error: error.code });
    };
    socket.on('ai:chunk', onChunk);
    socket.once('ai:done', onDone);
    socket.once('ai:error', onError);
  });
}

async function waitForStatus(
  socket: ClientSocket,
  predicate: (status: AiStatus) => boolean,
  ms = 4000,
): Promise<AiStatus> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ai:status timeout')), ms);
    const onStatus = (broadcast: AiStatusBroadcast) => {
      if (!predicate(broadcast.status)) return;
      clearTimeout(timer);
      socket.off('ai:status', onStatus);
      resolve(broadcast.status);
    };
    socket.on('ai:status', onStatus);
  });
}

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: 'pipe',
  });
  built = await buildApp(config, { logger: false, aiFetch });
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
    payload: { name: 'Kampania AI' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const token = (inviteRes.json() as InvitationSummary).token;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: `/api/join/${token}`,
    payload: { name: 'Rogue' },
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
}, 60_000);

beforeEach(async () => {
  gateway.up = true;
  gateway.script = [
    { event: 'start', data: { reasoning: false } },
    { event: 'delta', data: { text: 'Cześć, ' } },
    { event: 'delta', data: { text: 'tu Vex.' } },
    {
      event: 'done',
      data: {
        usage: {
          prompt_tokens: 20,
          completion_tokens: 4,
          generation_ms: 300,
          tokens_per_second: 13.3,
        },
      },
    },
  ];
  // Make sure the server sees a healthy gateway before each case.
  await refreshServerStatus();
});

async function refreshServerStatus(): Promise<void> {
  const { socket, firstSync } = createSocket(gmCookie);
  await firstSync;
  await emitAck<AiStatus>(socket, 'ai:refresh');
  socket.disconnect();
}

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

describe('ai status visibility', () => {
  it('gives the GM full diagnostics and the player only availability', async () => {
    const gm = createSocket(gmCookie);
    const gmSync = await gm.firstSync;
    expect(gmSync.ai.available).toBe(true);
    expect(gmSync.ai.model).toBe('Qwythos-9B-v2-Q8_0.gguf');
    expect(gmSync.ai.gpu?.memoryUsedMb).toBe(11866);

    const player = createSocket(playerCookie);
    const playerSync = await player.firstSync;
    expect(playerSync.ai.available).toBe(true);
    // Diagnostics never leave the server for players.
    expect(playerSync.ai.model).toBeUndefined();
    expect(playerSync.ai.gpu).toBeUndefined();
    expect(playerSync.ai.error).toBeUndefined();

    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('refuses ai:ask from a player', async () => {
    const player = createSocket(playerCookie);
    await player.firstSync;
    const ack = await emitAck(player.socket, 'ai:ask', { prompt: 'Zdradź mi sekrety MG' });
    expect(ack).toEqual({ ok: false, error: 'FORBIDDEN' });
    player.socket.disconnect();
  });
});

describe('ai:ask streaming', () => {
  it('streams the answer to the asking GM and reports usage', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;

    const stream = collectAnswer(gm.socket);
    const ack = await emitAck<{ requestId: string }>(gm.socket, 'ai:ask', {
      prompt: 'Przedstaw się jako fikserka',
      system: 'Jesteś Vex.',
      purpose: 'test',
    });
    expect(ack.ok).toBe(true);

    const result = await stream;
    expect(result.answer).toBe('Cześć, tu Vex.');
    expect(result.thinking).toBe('');
    expect(result.done?.usage?.tokensPerSecond).toBe(13.3);

    // The system prompt is passed through, and the API key is attached.
    expect(gateway.lastApiKey).toBe('test-key');
    const messages = gateway.lastBody?.messages as { role: string; content: string }[];
    expect(messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(messages[0]?.content).toBe('Jesteś Vex.');

    gm.socket.disconnect();
  });

  it('passes reasoning through only when asked for it', async () => {
    gateway.script = [
      { event: 'think', data: { text: 'zastanawiam się' } },
      { event: 'delta', data: { text: 'DV wynosi 15.' } },
      { event: 'done', data: { usage: null } },
    ];
    const gm = createSocket(gmCookie);
    await gm.firstSync;

    const stream = collectAnswer(gm.socket);
    await emitAck(gm.socket, 'ai:ask', {
      prompt: 'Jaka jest DV skoku?',
      purpose: 'gm_assistant',
      reasoning: true,
    });
    const result = await stream;
    expect(result.thinking).toBe('zastanawiam się');
    expect(result.answer).toBe('DV wynosi 15.');
    expect(gateway.lastBody?.reasoning).toBe(true);

    gm.socket.disconnect();
  });

  it('rejects an empty prompt without touching the gateway', async () => {
    gateway.lastBody = null;
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const ack = await emitAck(gm.socket, 'ai:ask', { prompt: '   ' });
    expect(ack).toEqual({ ok: false, error: 'AI_EMPTY_PROMPT' });
    expect(gateway.lastBody).toBeNull();
    gm.socket.disconnect();
  });
});

describe('degradation when the gateway is down', () => {
  it('marks bots offline, refuses ai:ask and keeps the rest of the VTT working', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    await player.firstSync;

    const gmOffline = waitForStatus(gm.socket, (status) => !status.available);
    const playerOffline = waitForStatus(player.socket, (status) => !status.available);
    gateway.up = false;
    await emitAck(gm.socket, 'ai:refresh');

    const gmStatus = await gmOffline;
    expect(gmStatus.llama).toBe('unreachable');
    expect(gmStatus.error).toBeTruthy();
    const playerStatus = await playerOffline;
    expect(playerStatus.available).toBe(false);
    expect(playerStatus.error).toBeUndefined();

    const ask = await emitAck(gm.socket, 'ai:ask', { prompt: 'Jesteś tam?' });
    expect(ask).toEqual({ ok: false, error: 'AI_UNAVAILABLE' });

    // The rest of the VTT is unaffected by a dead gateway.
    const chat = await emitAck(player.socket, 'chat:send', { text: 'Gramy dalej' });
    expect(chat.ok).toBe(true);

    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('flips back to available when the gateway returns, without a client action', async () => {
    gateway.up = false;
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await emitAck(gm.socket, 'ai:refresh');

    const back = waitForStatus(gm.socket, (status) => status.available);
    gateway.up = true;
    // No explicit refresh: the periodic health-check must notice on its own.
    const status = await back;
    expect(status.llama).toBe('ready');
    expect(status.model).toBe('Qwythos-9B-v2-Q8_0.gguf');

    gm.socket.disconnect();
  });
});
