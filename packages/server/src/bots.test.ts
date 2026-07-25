import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  AiStatus,
  BotChunkBroadcast,
  BotLesson,
  BotReplyBroadcast,
  BotView,
  CampaignSummary,
  InvitationSummary,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Stage 10 smoke tests: bot profiles stay with the GM, the test conversation
 * runs through the guardrails (sanitize → detect → one retry) and a GM
 * correction turns into a lesson that lands in the next prompt.
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
  aiGatewayUrl: 'http://gateway.test',
  aiGatewayApiKey: 'test-key',
  aiHealthIntervalMs: 200,
  aiRequestTimeoutMs: 5000,
  ttsTimeoutMs: 5000,
  ttsCacheMaxBytes: 8 * 1024 * 1024,
};

type ChatBody = {
  messages: { role: string; content: string }[];
  temperature: number | null;
  max_tokens: number | null;
  stop: string[] | null;
};

/** Scripted stand-in for the Python gateway; each /chat call shifts one script. */
const gateway = {
  up: true,
  answers: [] as string[],
  bodies: [] as ChatBody[],
};

function sseStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send('start', { reasoning: false });
      for (const part of text.match(/.{1,12}/gs) ?? []) send('delta', { text: part });
      send('done', {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          generation_ms: 250,
          tokens_per_second: 80,
        },
      });
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
        context_size: 32768,
        queue_length: 0,
        busy: false,
        managed: true,
        restarts: 0,
        last_error: null,
        gpu: null,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }
  if (url.endsWith('/chat')) {
    gateway.bodies.push(JSON.parse(String(init?.body ?? '{}')) as ChatBody);
    const answer = gateway.answers.shift() ?? 'Nie mam nic do dodania.';
    return new Response(sseStream(answer), {
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
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 4000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolve(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

/** Runs one test conversation turn and collects everything the server sends. */
function collectReply(
  socket: ClientSocket,
  ms = 4000,
): Promise<{
  reply: BotReplyBroadcast | null;
  streamed: string;
  resets: number;
  error: string | null;
}> {
  return new Promise((resolve, reject) => {
    let streamed = '';
    let resets = 0;
    const timer = setTimeout(() => reject(new Error('bot reply timeout')), ms);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('bot:chunk', onChunk);
      socket.off('bot:reply', onReply);
      socket.off('bot:error', onError);
    };
    const onChunk = (chunk: BotChunkBroadcast) => {
      if (chunk.reset) {
        resets += 1;
        streamed = '';
        return;
      }
      streamed += chunk.text;
    };
    const onReply = (reply: BotReplyBroadcast) => {
      cleanup();
      resolve({ reply, streamed, resets, error: null });
    };
    const onError = (error: { code: string }) => {
      cleanup();
      resolve({ reply: null, streamed, resets, error: error.code });
    };
    socket.on('bot:chunk', onChunk);
    socket.once('bot:reply', onReply);
    socket.once('bot:error', onError);
  });
}

async function createBot(socket: ClientSocket, name: string): Promise<BotView> {
  const ack = await emitAck<BotView>(socket, 'bot:create', {
    name,
    data: {
      type: 'npc',
      persona: {
        personality: 'Cyniczna fikserka z Watson.',
        motivations: 'Spłacić dług u gangu.',
        secrets: 'Sypie gangowi o klientach.',
        speechStyle: 'Krótkie zdania, slang.',
        catchphrases: ['Czas to eddiesy, skarbie.'],
      },
      knowledge: { world: 'Night City, 2045.', campaign: '', people: '', forbidden: '' },
    },
  });
  if (!ack.ok || !ack.data)
    throw new Error(`bot:create failed: ${!ack.ok ? ack.error : 'no data'}`);
  return ack.data;
}

function lastPrompt(): string {
  const body = gateway.bodies.at(-1);
  return body?.messages.map((message) => message.content).join('\n---\n') ?? '';
}

async function refreshServerStatus(socket: ClientSocket): Promise<void> {
  await emitAck<AiStatus>(socket, 'ai:refresh');
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
    payload: { name: 'Kampania botów' },
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
    payload: { name: 'Johnny' },
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
}, 60_000);

beforeEach(async () => {
  gateway.up = true;
  gateway.answers = [];
  gateway.bodies = [];
  // Names at the table are unique since stage 11, so each test starts with an
  // empty roster instead of piling up „Vex" profiles.
  await built.prisma.botProfile.deleteMany({});
  const gm = createSocket(gmCookie);
  await gm.firstSync;
  await refreshServerStatus(gm.socket);
  gm.socket.disconnect();
});

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

describe('bot profiles are GM-only', () => {
  it('survives a reconnect and never reaches a player', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Vex');
    expect(bot.data.persona.personality).toContain('fikserka');
    gm.socket.disconnect();

    // A fresh connection proves the profile is persisted, not in memory.
    const gmAgain = createSocket(gmCookie);
    const sync = await gmAgain.firstSync;
    expect(sync.bots.map((entry) => entry.name)).toContain('Vex');

    const player = createSocket(playerCookie);
    const playerSync = await player.firstSync;
    expect(playerSync.bots).toEqual([]);
    // The secret lives in the profile — it must not travel to a player.
    expect(JSON.stringify(playerSync)).not.toContain('Sypie gangowi');

    const create = await emitAck(player.socket, 'bot:create', { name: 'Podszywacz' });
    expect(create).toEqual({ ok: false, error: 'FORBIDDEN' });
    const chat = await emitAck(player.socket, 'bot:chat', { botId: bot.id, message: 'Cześć' });
    expect(chat).toEqual({ ok: false, error: 'FORBIDDEN' });

    gmAgain.socket.disconnect();
    player.socket.disconnect();
  });
});

describe('test conversation', () => {
  it('compiles the profile into the prompt and cleans the answer', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Vex');

    gateway.answers = ['Vex: *zapala papierosa* Dwa tysiące i gadamy dalej.'];
    const stream = collectReply(gm.socket);
    const ack = await emitAck<{ requestId: string }>(gm.socket, 'bot:chat', {
      botId: bot.id,
      message: 'Masz dla nas robotę?',
    });
    expect(ack.ok).toBe(true);

    const result = await stream;
    // The name label and the stage direction are stripped before delivery.
    expect(result.reply?.text).toBe('Dwa tysiące i gadamy dalej.');
    expect(result.reply?.retried).toBe(false);
    expect(result.reply?.warning).toBeNull();
    expect(result.streamed).toContain('zapala papierosa');

    const body = gateway.bodies.at(-1)!;
    expect(body.messages[0]?.role).toBe('system');
    expect(body.messages[0]?.content).toContain('Cyniczna fikserka z Watson.');
    expect(body.messages[0]?.content).toContain('Żelazne zasady');
    // The role anchor must be the LAST thing the model reads.
    expect(body.messages.at(-1)?.content).toContain('[Przypomnienie] Jesteś Vex.');
    expect(body.temperature).toBe(0.85);
    // Stop sequences cut the model off when it writes for the table.
    expect(body.stop).toContain('\nJohnny:');

    gm.socket.disconnect();
  });

  it('regenerates once when the bot admits to being an AI', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Vex');

    gateway.answers = [
      'Jako model językowy nie mam uczuć ani znajomych w Watson.',
      'Znajomych mam aż za wielu. Pytanie, czy któryś ci się przyda.',
    ];
    const stream = collectReply(gm.socket);
    await emitAck(gm.socket, 'bot:chat', { botId: bot.id, message: 'Znasz kogoś w Watson?' });
    const result = await stream;

    expect(result.reply?.retried).toBe(true);
    expect(result.reply?.warning).toBeNull();
    expect(result.reply?.text).toBe(
      'Znajomych mam aż za wielu. Pytanie, czy któryś ci się przyda.',
    );
    // The client is told to drop the provisional text of the failed attempt.
    expect(result.resets).toBe(1);
    expect(gateway.bodies).toHaveLength(2);
    expect(gateway.bodies[1]?.messages.at(-1)?.content).toContain(
      'przyznanie się do bycia sztuczną inteligencją',
    );

    gm.socket.disconnect();
  });

  it('delivers a sanitized answer with a warning when the retry also slips', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Vex');

    gateway.answers = ['OOC: chyba nie o to pytasz.', 'Zapytaj o to mistrza gry, ja nie wiem.'];
    const stream = collectReply(gm.socket);
    await emitAck(gm.socket, 'bot:chat', { botId: bot.id, message: 'Kto zabił Sashę?' });
    const result = await stream;

    expect(result.reply?.retried).toBe(true);
    expect(result.reply?.warning).toBe('komentarz spoza świata gry');
    expect(result.reply?.text).toBe('Zapytaj o to mistrza gry, ja nie wiem.');

    gm.socket.disconnect();
  });

  it('refuses to run with the gateway down and keeps the profile editable', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Vex');

    gateway.up = false;
    await refreshServerStatus(gm.socket);
    const chat = await emitAck(gm.socket, 'bot:chat', { botId: bot.id, message: 'Jesteś tam?' });
    expect(chat).toEqual({ ok: false, error: 'AI_UNAVAILABLE' });

    const rename = await emitAck<BotView>(gm.socket, 'bot:update', {
      botId: bot.id,
      patch: { name: 'Vex z Watson' },
    });
    expect(rename.ok).toBe(true);

    gm.socket.disconnect();
  });
});

describe('lessons — the bot learns from GM corrections', () => {
  it('phrases a correction into a rule and uses it in the next prompt', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Vex');

    gateway.answers = ['Mów krócej — najwyżej dwa zdania.'];
    const teach = await emitAck<{ lesson: BotLesson; bot: BotView }>(gm.socket, 'bot:teach', {
      botId: bot.id,
      correction: 'za dużo gada, ma być zwięźle',
      quote: 'A wiesz, kiedyś w Watson…',
    });
    expect(teach.ok).toBe(true);
    expect(teach.ok && teach.data?.lesson.text).toBe('Mów krócej — najwyżej dwa zdania.');
    // The GM's own wording is kept next to the phrased rule.
    expect(teach.ok && teach.data?.lesson.note).toBe('za dużo gada, ma być zwięźle');

    gateway.answers = ['Dwa tysiące. Koniec.'];
    const stream = collectReply(gm.socket);
    await emitAck(gm.socket, 'bot:chat', { botId: bot.id, message: 'Ile za robotę?' });
    await stream;

    const prompt = lastPrompt();
    expect(prompt).toContain('Wnioski z gry');
    expect(prompt).toContain('Mów krócej — najwyżej dwa zdania.');
    // The newest lesson also rides in the anchor at the end of the context.
    expect(gateway.bodies.at(-1)?.messages.at(-1)?.content).toContain('Mów krócej');

    gm.socket.disconnect();
  });

  it('stores the correction verbatim when the gateway is down', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Vex');

    gateway.up = false;
    await refreshServerStatus(gm.socket);
    const teach = await emitAck<{ lesson: BotLesson; bot: BotView }>(gm.socket, 'bot:teach', {
      botId: bot.id,
      correction: 'Nie zdradzaj adresu kryjówki.',
    });
    expect(teach.ok && teach.data?.lesson.text).toBe('Nie zdradzaj adresu kryjówki.');

    gm.socket.disconnect();
  });

  it('applies a live profile edit to the very next line', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Vex');

    const update = await emitAck<BotView>(gm.socket, 'bot:update', {
      botId: bot.id,
      patch: {
        data: {
          persona: {
            personality: 'Od dziś przerażona i uległa — gang ją złamał.',
            motivations: 'Przetrwać do rana.',
            secrets: '',
            speechStyle: 'Szeptem, urywanymi zdaniami.',
            catchphrases: [],
          },
        },
      },
    });
    expect(update.ok).toBe(true);

    gateway.answers = ['Nie tutaj. Proszę.'];
    const stream = collectReply(gm.socket);
    await emitAck(gm.socket, 'bot:chat', { botId: bot.id, message: 'Co się z tobą dzieje?' });
    await stream;

    expect(lastPrompt()).toContain('Od dziś przerażona i uległa');
    expect(lastPrompt()).not.toContain('Cyniczna fikserka z Watson.');

    gm.socket.disconnect();
  });
});
