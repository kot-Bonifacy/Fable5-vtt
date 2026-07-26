import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  AiStatus,
  BotActivityBroadcast,
  BotActivityEntry,
  BotNoticeBroadcast,
  BotTraceBroadcast,
  BotView,
  CampaignSummary,
  ChatMessageBroadcast,
  ChatMessageView,
  InvitationSummary,
  SceneView,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Stage 11 smoke tests: bots as participants of the session chat.
 *
 * What is being pinned down here is mostly about visibility and control —
 * who triggers a bot, who sees its line, what never leaves the server (the
 * GM's diagnostics, whispers of other players) and that a dead gateway leaves
 * the chat fully usable.
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
  // Deliberately absent: tests run on the committed sample compendium,
  // which is also the "fresh clone without data/private" path.
  dataPrivateDir: resolve(import.meta.dirname, 'fixtures/no-private-data'),
  aiGatewayUrl: 'http://gateway.test',
  aiGatewayApiKey: 'test-key',
  aiHealthIntervalMs: 5000,
  aiRequestTimeoutMs: 5000,
  ttsTimeoutMs: 5000,
  ttsCacheMaxBytes: 8 * 1024 * 1024,
};

type ChatBody = {
  messages: { role: string; content: string }[];
  max_tokens: number | null;
  stop: string[] | null;
};

/** Scripted stand-in for the Python gateway. */
const gateway = {
  up: true,
  answers: [] as string[],
  bodies: [] as ChatBody[],
  tokenizeCalls: 0,
  contextSize: 32768,
  /** Slows one generation down so the queue and the stop button are testable. */
  delayMs: 0,
};

function sseStream(
  text: string,
  signal: AbortSignal | null | undefined,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send('start', { reasoning: false });
      if (gateway.delayMs > 0) await new Promise((r) => setTimeout(r, gateway.delayMs));
      // A real fetch throws inside the body iteration once aborted; the fake has
      // to do the same, or the GM's stop button would look like it works.
      if (signal?.aborted) {
        controller.error(new DOMException('aborted', 'AbortError'));
        return;
      }
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
    return Response.json({
      status: 'ok',
      llama: 'ready',
      model: 'Qwythos-9B-v2-Q8_0.gguf',
      context_size: gateway.contextSize,
      queue_length: 0,
      busy: false,
      managed: true,
      restarts: 0,
      last_error: null,
      gpu: null,
    });
  }
  if (url.endsWith('/tokenize')) {
    gateway.tokenizeCalls += 1;
    const body = JSON.parse(String(init?.body ?? '{}')) as { text?: string };
    // Rough but monotonic, like a real tokenizer: ~4 characters per token.
    return Response.json({
      count: Math.ceil((body.text?.length ?? 0) / 4),
      context_size: gateway.contextSize,
    });
  }
  if (url.endsWith('/chat')) {
    gateway.bodies.push(JSON.parse(String(init?.body ?? '{}')) as ChatBody);
    const answer = gateway.answers.shift() ?? 'Nie mam nic do dodania.';
    return new Response(sseStream(answer, init?.signal), {
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
let otherPlayerCookie: string;
let sceneId: string;
let otherSceneId: string;
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
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 5000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolve(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

/** Everything a socket receives on chat, so negative assertions are possible. */
function collectChat(socket: ClientSocket): {
  messages: ChatMessageView[];
  notices: BotNoticeBroadcast[];
  traces: BotTraceBroadcast[];
  activity: BotActivityEntry[][];
} {
  const seen = {
    messages: [] as ChatMessageView[],
    notices: [] as BotNoticeBroadcast[],
    traces: [] as BotTraceBroadcast[],
    activity: [] as BotActivityEntry[][],
  };
  socket.on('chat:message', (broadcast: ChatMessageBroadcast) =>
    seen.messages.push(broadcast.message),
  );
  socket.on('bot:notice', (notice: BotNoticeBroadcast) => seen.notices.push(notice));
  socket.on('bot:trace', (trace: BotTraceBroadcast) => seen.traces.push(trace));
  socket.on('bot:activity', (broadcast: BotActivityBroadcast) =>
    seen.activity.push(broadcast.entries),
  );
  return seen;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until `check` returns a value or the deadline passes. */
async function until<T>(check: () => T | undefined, ms = 5000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await sleep(25);
  }
}

async function createBot(
  socket: ClientSocket,
  name: string,
  patch: Record<string, unknown> = {},
): Promise<BotView> {
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
  const update = await emitAck<BotView>(socket, 'bot:update', {
    botId: ack.data.id,
    patch: { active: true, ...patch },
  });
  if (!update.ok || !update.data) throw new Error('bot:update failed');
  return update.data;
}

function lastPrompt(): string {
  return (
    gateway.bodies
      .at(-1)
      ?.messages.map((message) => message.content)
      .join('\n---\n') ?? ''
  );
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

  for (const name of ['Johnny', 'Rogue']) {
    const joinRes = await built.app.inject({
      method: 'POST',
      url: `/api/join/${token}`,
      payload: { name },
    });
    const cookie = cookieOf(joinRes.headers['set-cookie']);
    if (name === 'Johnny') playerCookie = cookie;
    else otherPlayerCookie = cookie;
  }

  // Two scenes: one where the conversation happens, one to prove the bots'
  // memory really is scoped per scene.
  const gm = createSocket(gmCookie);
  await gm.firstSync;
  const scene = await emitAck<SceneView>(gm.socket, 'scene:create', { name: 'Bar Afterlife' });
  const other = await emitAck<SceneView>(gm.socket, 'scene:create', { name: 'Wieża Arasaki' });
  if (!scene.ok || !scene.data || !other.ok || !other.data) throw new Error('scene:create failed');
  sceneId = scene.data.id;
  otherSceneId = other.data.id;
  await emitAck(gm.socket, 'scene:activate', { sceneId });
  gm.socket.disconnect();
}, 60_000);

beforeEach(async () => {
  gateway.up = true;
  gateway.answers = [];
  gateway.bodies = [];
  gateway.tokenizeCalls = 0;
  gateway.contextSize = 32768;
  gateway.delayMs = 0;
  // A fresh slate: bots and transcript from a previous test would change who
  // gets called and what lands in the context window.
  await built.prisma.chatMessage.deleteMany({});
  await built.prisma.botProfile.deleteMany({});
  const gm = createSocket(gmCookie);
  await gm.firstSync;
  await emitAck<AiStatus>(gm.socket, 'ai:refresh');
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

describe('calling a bot on session chat', () => {
  it('answers a mention publicly and keeps the diagnostics with the GM', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Vex', { sceneId });
    const player = createSocket(playerCookie);
    await player.firstSync;
    const gmSeen = collectChat(gm.socket);
    const playerSeen = collectChat(player.socket);

    gateway.answers = ['Vex: Dwa tysiące i gadamy dalej.'];
    const ack = await emitAck(player.socket, 'chat:send', { text: 'Vex, masz dla nas robotę?' });
    expect(ack.ok).toBe(true);

    const line = await until(() => playerSeen.messages.find((m) => m.botId === bot.id));
    // Sanitized: the model's own name label is stripped before delivery.
    expect(line.text).toBe('Dwa tysiące i gadamy dalej.');
    expect(line.authorName).toBe('Vex');
    expect(line.kind).toBe('say');

    // The GM gets the trace; the player never receives one.
    const trace = await until(() => gmSeen.traces.find((t) => t.messageId === line.id));
    expect(trace.retried).toBe(false);
    expect(trace.warning).toBeNull();
    expect(trace.historyTurns).toBeGreaterThan(0);
    expect(playerSeen.traces).toEqual([]);
    // Nothing in the player's payload says „this was generated".
    expect(JSON.stringify(playerSeen.messages)).not.toContain('retried');

    // „Vex pisze…" reached the table, then the entry disappeared.
    expect(playerSeen.activity.some((entries) => entries.some((e) => e.state === 'typing'))).toBe(
      true,
    );
    await until(() => (playerSeen.activity.at(-1)?.length === 0 ? true : undefined));

    // Context: the player's line is in the prompt, labelled with their name.
    expect(lastPrompt()).toContain('Johnny: Vex, masz dla nas robotę?');
    expect(lastPrompt()).toContain('Miejsce sceny: Bar Afterlife');
    // Real tokenizer, not a character estimate.
    expect(gateway.tokenizeCalls).toBeGreaterThan(0);

    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('answers only the bot that was called when two stand in the scene', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const vex = await createBot(gm.socket, 'Vex', { sceneId });
    const sasha = await createBot(gm.socket, 'Sasha', { sceneId });
    const seen = collectChat(gm.socket);

    gateway.answers = ['Ja tu rządzę, nie Sasha.'];
    await emitAck(gm.socket, 'chat:send', { text: 'Vex, kto tu rządzi?' });
    await until(() => seen.messages.find((m) => m.botId === vex.id));
    await sleep(400);

    expect(seen.messages.filter((m) => m.botId === sasha.id)).toEqual([]);
    expect(gateway.bodies).toHaveLength(1);

    gm.socket.disconnect();
  });

  it('queues two called bots and answers one after another', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const vex = await createBot(gm.socket, 'Vex', { sceneId });
    const sasha = await createBot(gm.socket, 'Sasha', { sceneId });
    const seen = collectChat(gm.socket);

    gateway.delayMs = 150;
    gateway.answers = ['Jestem.', 'Ja też.'];
    await emitAck(gm.socket, 'chat:send', { text: 'Vex, Sasha — jesteście tam?' });

    // Both answered…
    await until(() => seen.messages.find((m) => m.botId === vex.id));
    await until(() => seen.messages.find((m) => m.botId === sasha.id));
    // …and the queue was visible while they waited.
    expect(
      seen.activity.some(
        (entries) => entries.length === 2 && entries.some((entry) => entry.state === 'queued'),
      ),
    ).toBe(true);
    // One generation at a time.
    expect(gateway.bodies).toHaveLength(2);

    gm.socket.disconnect();
  });

  it('keeps talking after its own line without being named again', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Vex', { sceneId });
    const seen = collectChat(gm.socket);

    gateway.answers = ['Pytaj dalej.', 'Trzy tysiące, koniec targu.'];
    await emitAck(gm.socket, 'chat:send', { text: 'Vex, słyszysz mnie?' });
    await until(() => seen.messages.find((m) => m.botId === bot.id));

    await emitAck(gm.socket, 'chat:send', { text: 'A ile za tę robotę?' });
    await until(() =>
      seen.messages.filter((m) => m.botId === bot.id).length === 2 ? true : undefined,
    );
    expect(gateway.bodies).toHaveLength(2);
    // The follow-up carries the whole exchange, the bot's own line included.
    expect(lastPrompt()).toContain('Pytaj dalej.');

    gm.socket.disconnect();
  });

  it('stays silent when it is not in the session or stands in another scene', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await createBot(gm.socket, 'Vex', { sceneId, active: false });
    await createBot(gm.socket, 'Sasha', { sceneId: otherSceneId });
    const seen = collectChat(gm.socket);

    await emitAck(gm.socket, 'chat:send', { text: 'Vex, Sasha — jesteście?' });
    await sleep(500);

    expect(gateway.bodies).toEqual([]);
    expect(seen.messages.filter((m) => m.botId)).toEqual([]);
    // Silence, not an error: from the table's point of view nobody was there.
    expect(seen.notices).toEqual([]);

    gm.socket.disconnect();
  });

  it('never lets a bot line call another bot', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const vex = await createBot(gm.socket, 'Vex', { sceneId });
    const sasha = await createBot(gm.socket, 'Sasha', { sceneId });
    const seen = collectChat(gm.socket);

    // The answer names the other bot — that must not start a chain.
    gateway.answers = ['Sasha wie więcej, spytaj Sashy.'];
    await emitAck(gm.socket, 'chat:send', { text: 'Vex, kto zabił Rippera?' });
    await until(() => seen.messages.find((m) => m.botId === vex.id));
    await sleep(500);

    expect(seen.messages.filter((m) => m.botId === sasha.id)).toEqual([]);
    expect(gateway.bodies).toHaveLength(1);

    gm.socket.disconnect();
  });
});

describe('names at the table are unique', () => {
  it('refuses a bot named like a player or like another bot', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const vex = await createBot(gm.socket, 'Vex', { sceneId });

    // A bot named „Johnny" would answer lines meant for the player Johnny.
    const clash = await emitAck(gm.socket, 'bot:create', { name: 'johnny' });
    expect(clash).toEqual({ ok: false, error: 'NAME_TAKEN' });
    const twin = await emitAck(gm.socket, 'bot:create', { name: 'VEX' });
    expect(twin).toEqual({ ok: false, error: 'NAME_TAKEN' });
    const rename = await emitAck(gm.socket, 'bot:update', {
      botId: vex.id,
      patch: { name: 'Rogue' },
    });
    expect(rename).toEqual({ ok: false, error: 'NAME_TAKEN' });
    // Renaming a bot to its own name is not a collision.
    const same = await emitAck<BotView>(gm.socket, 'bot:update', {
      botId: vex.id,
      patch: { name: 'Vex' },
    });
    expect(same.ok).toBe(true);

    // Duplicates pick the next free name instead of failing.
    const first = await emitAck<BotView>(gm.socket, 'bot:duplicate', { botId: vex.id });
    const second = await emitAck<BotView>(gm.socket, 'bot:duplicate', { botId: vex.id });
    expect(first.ok && first.data?.name).toBe('Vex (kopia)');
    expect(second.ok && second.data?.name).toBe('Vex (kopia 2)');

    gm.socket.disconnect();
  });
});

describe('whispering with a bot', () => {
  it('is private to the player and the GM, and the answer comes back whispered', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Vex', { sceneId });
    const player = createSocket(playerCookie);
    const other = createSocket(otherPlayerCookie);
    await Promise.all([player.firstSync, other.firstSync]);
    const gmSeen = collectChat(gm.socket);
    const playerSeen = collectChat(player.socket);
    const otherSeen = collectChat(other.socket);

    gateway.answers = ['Zostaw to między nami.'];
    await emitAck(player.socket, 'chat:send', { text: '/w @Vex mam coś tylko dla ciebie' });

    const answer = await until(() =>
      playerSeen.messages.find((m) => m.botId === bot.id && m.kind === 'whisper'),
    );
    expect(answer.text).toBe('Zostaw to między nami.');
    expect(answer.recipientName).toBe('Johnny');
    // The GM oversees bot whispers…
    await until(() => gmSeen.messages.find((m) => m.botId === bot.id && m.kind === 'whisper'));
    // …the other player learns nothing at all, not even that a bot is typing.
    expect(otherSeen.messages).toEqual([]);
    expect(otherSeen.activity.flat()).toEqual([]);
    expect(JSON.stringify(otherSeen)).not.toContain('tylko dla ciebie');

    // The prompt knows this is a private exchange.
    expect(lastPrompt()).toContain('Rozmawiacie na osobności');

    gm.socket.disconnect();
    player.socket.disconnect();
    other.socket.disconnect();
  });

  it('hides whispers from the bot context of a different bot', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const vex = await createBot(gm.socket, 'Vex', { sceneId });
    await createBot(gm.socket, 'Sasha', { sceneId });
    const player = createSocket(playerCookie);
    await player.firstSync;
    const seen = collectChat(gm.socket);

    gateway.answers = ['Jasne.', 'Nie wiem, o czym mówisz.'];
    await emitAck(player.socket, 'chat:send', { text: '/w Vex kod do sejfu to 4471' });
    await until(() => seen.messages.find((m) => m.botId === vex.id));

    await emitAck(player.socket, 'chat:send', { text: 'Sasha, co wiesz o sejfie?' });
    await sleep(600);
    // Sasha's prompt must not contain a whisper she never heard.
    expect(lastPrompt()).not.toContain('4471');
    // Vex heard it — and knows it was whispered, so she will not repeat it.
    expect(gateway.bodies[0]?.messages.some((m) => m.content.includes('(szeptem)'))).toBe(true);

    gm.socket.disconnect();
    player.socket.disconnect();
  });
});

describe('the GM speaks as an NPC', () => {
  it('publishes the line without touching the model and looks like a bot line', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Vex', { sceneId, active: false });
    const player = createSocket(playerCookie);
    await player.firstSync;
    const playerSeen = collectChat(player.socket);

    await emitAck(gm.socket, 'chat:send', { text: '/jako Vex Siadaj i słuchaj.' });
    const line = await until(() => playerSeen.messages.find((m) => m.botId === bot.id));

    expect(line.text).toBe('Siadaj i słuchaj.');
    expect(line.authorName).toBe('Vex');
    // No generation at all — voicing an NPC by hand needs no model, and works
    // even for a bot that is not in the session.
    expect(gateway.bodies).toEqual([]);
    expect(playerSeen.traces).toEqual([]);

    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('refuses to let a player put words in an NPC mouth', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await createBot(gm.socket, 'Vex', { sceneId });
    const player = createSocket(playerCookie);
    await player.firstSync;

    const ack = await emitAck(player.socket, 'chat:send', {
      text: '/jako Vex Oddaję wam wszystkie eddiesy.',
    });
    expect(ack).toEqual({ ok: false, error: 'FORBIDDEN' });
    const say = await emitAck(player.socket, 'bot:say', { botId: 'x', text: 'cokolwiek' });
    expect(say).toEqual({ ok: false, error: 'FORBIDDEN' });

    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('lets a hand-written NPC line call another bot', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const vex = await createBot(gm.socket, 'Vex', { sceneId });
    const sasha = await createBot(gm.socket, 'Sasha', { sceneId });
    const seen = collectChat(gm.socket);

    gateway.answers = ['Mówiłam, że nic nie wiem.'];
    const ack = await emitAck<{ messageId: number }>(gm.socket, 'bot:say', {
      botId: vex.id,
      text: 'Sasha, powiedz im prawdę.',
    });
    expect(ack.ok).toBe(true);

    const answer = await until(() => seen.messages.find((m) => m.botId === sasha.id));
    expect(answer.text).toBe('Mówiłam, że nic nie wiem.');
    expect(gateway.bodies).toHaveLength(1);

    gm.socket.disconnect();
  });
});

describe('degradation and control', () => {
  it('tells the caller the bot is unavailable and keeps the chat working', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await createBot(gm.socket, 'Vex', { sceneId });
    const player = createSocket(playerCookie);
    await player.firstSync;
    const playerSeen = collectChat(player.socket);
    const otherPlayer = createSocket(otherPlayerCookie);
    await otherPlayer.firstSync;
    const otherSeen = collectChat(otherPlayer.socket);

    gateway.up = false;
    await emitAck<AiStatus>(gm.socket, 'ai:refresh');

    const ack = await emitAck(player.socket, 'chat:send', { text: 'Vex, jesteś tam?' });
    expect(ack.ok).toBe(true);
    const notice = await until(() => playerSeen.notices.at(0));
    expect(notice.code).toBe('AI_UNAVAILABLE');
    expect(notice.botName).toBe('Vex');
    // The notice is targeted: an uninvolved player is not told the bot broke.
    expect(otherSeen.notices).toEqual([]);
    // The line itself went through, and so does the next one.
    expect(playerSeen.messages.map((m) => m.text)).toContain('Vex, jesteś tam?');
    const second = await emitAck(player.socket, 'chat:send', { text: 'To gadajmy sami.' });
    expect(second.ok).toBe(true);
    await until(() => playerSeen.messages.find((m) => m.text === 'To gadajmy sami.'));

    gm.socket.disconnect();
    player.socket.disconnect();
    otherPlayer.socket.disconnect();
  });

  it('stops a queued bot on the GM command', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await createBot(gm.socket, 'Vex', { sceneId });
    await createBot(gm.socket, 'Sasha', { sceneId });
    const seen = collectChat(gm.socket);

    gateway.delayMs = 400;
    gateway.answers = ['Jestem.', 'Ja też.'];
    await emitAck(gm.socket, 'chat:send', { text: 'Vex, Sasha — jesteście tam?' });
    await until(() => (seen.activity.at(-1)?.length === 2 ? true : undefined));

    await emitAck(gm.socket, 'bot:stop', {});
    await until(() => (seen.activity.at(-1)?.length === 0 ? true : undefined));
    await sleep(600);

    // The queued turn never reached the model; the transcript stays clean.
    expect(gateway.bodies).toHaveLength(1);
    expect(seen.messages.filter((m) => m.botId)).toEqual([]);

    gm.socket.disconnect();
  });

  it('trims the context to the window measured by the tokenizer', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Vex', { sceneId });
    const seen = collectChat(gm.socket);

    // A tiny window forces the trim; the tokenizer decides what fits.
    gateway.contextSize = 1024;
    await emitAck<AiStatus>(gm.socket, 'ai:refresh');
    for (let i = 0; i < 8; i += 1) {
      await emitAck(gm.socket, 'chat:send', {
        text: `Stara gadka numer ${i}: ${'eddiesy '.repeat(20)}`,
      });
    }

    gateway.answers = ['Krótko: nie.'];
    await emitAck(gm.socket, 'chat:send', { text: 'Vex, wchodzisz w to?' });
    await until(() => seen.messages.find((m) => m.botId === bot.id));

    const prompt = lastPrompt();
    expect(prompt).toContain('Vex, wchodzisz w to?');
    // The oldest lines were dropped to fit the window.
    expect(prompt).not.toContain('Stara gadka numer 0');
    const trace = await until(() => seen.traces.at(-1));
    expect(trace.historyTurns).toBeLessThan(9);
    expect(trace.promptTokens).not.toBeNull();
    // Measured, not estimated: several tokenize round-trips per turn.
    expect(gateway.tokenizeCalls).toBeGreaterThan(1);

    gm.socket.disconnect();
  });

  it('keeps a bot line out of another scene’s memory', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Vex', { sceneId: null });
    const seen = collectChat(gm.socket);

    gateway.answers = ['Zapamiętam.', 'Nie wiem, o czym mówisz.'];
    await emitAck(gm.socket, 'chat:send', { text: 'Vex, hasło to niebieski tygrys.' });
    await until(() => seen.messages.find((m) => m.botId === bot.id));

    // The GM moves to the other scene and asks again.
    await emitAck<SceneView>(gm.socket, 'scene:view', { sceneId: otherSceneId });
    await emitAck(gm.socket, 'chat:send', { text: 'Vex, jakie było hasło?' });
    await until(() =>
      seen.messages.filter((m) => m.botId === bot.id).length === 2 ? true : undefined,
    );

    expect(lastPrompt()).not.toContain('niebieski tygrys');
    expect(lastPrompt()).toContain('Miejsce sceny: Wieża Arasaki');

    await emitAck<SceneView>(gm.socket, 'scene:view', { sceneId });
    gm.socket.disconnect();
  });
});
