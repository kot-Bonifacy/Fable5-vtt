import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  AiStatus,
  BotActionTraceBroadcast,
  BotView,
  CampaignSummary,
  CharacterView,
  ChatMessageBroadcast,
  ChatMessageView,
  CpredCharacterData,
  InvitationSummary,
  SceneView,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Stage 20a smoke tests: a bot that rolls dice.
 *
 * The fake gateway answers with whatever JSON the test scripts — including
 * answers a real grammar could never produce. That is the point: the grammar
 * is the first guard, and these tests pin down the second one, the code, by
 * forcing exactly the outputs the grammar would have made impossible.
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
  aiGatewayUrl: 'http://gateway.test',
  aiGatewayApiKey: 'test-key',
  aiHealthIntervalMs: 5000,
  aiRequestTimeoutMs: 5000,
  ttsTimeoutMs: 5000,
  ttsCacheMaxBytes: 8 * 1024 * 1024,
};

type ChatBody = {
  messages: { role: string; content: string }[];
  json_schema: Record<string, unknown> | null;
  max_tokens: number | null;
};

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
      for (const part of text.match(/.{1,16}/gs) ?? []) send('delta', { text: part });
      send('done', { usage: { prompt_tokens: 80, completion_tokens: 12, generation_ms: 60 } });
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
      context_size: 32768,
      queue_length: 0,
      busy: false,
      managed: true,
      restarts: 0,
      last_error: null,
      gpu: null,
    });
  }
  if (url.endsWith('/tokenize')) {
    const body = JSON.parse(String(init?.body ?? '{}')) as { text?: string };
    return Response.json({ count: Math.ceil((body.text?.length ?? 0) / 4), context_size: 32768 });
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
let otherCookie: string;
let playerId: string;
let sceneId: string;
let characterId: string;
const openSockets: ClientSocket[] = [];

function cookieOf(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
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
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
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
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 6000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolve(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

function collect(socket: ClientSocket): {
  messages: ChatMessageView[];
  updates: ChatMessageView[];
  traces: BotActionTraceBroadcast[];
} {
  const seen = {
    messages: [] as ChatMessageView[],
    updates: [] as ChatMessageView[],
    traces: [] as BotActionTraceBroadcast[],
  };
  socket.on('chat:message', (b: ChatMessageBroadcast) => seen.messages.push(b.message));
  socket.on('chat:update', (b: ChatMessageBroadcast) => seen.updates.push(b.message));
  socket.on('bot:action-trace', (t: BotActionTraceBroadcast) => seen.traces.push(t));
  return seen;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until<T>(check: () => T | undefined, ms = 5000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await sleep(25);
  }
}

/** A bot with a sheet — the only kind that can roll anything (stage 20a). */
async function createBot(
  socket: ClientSocket,
  name: string,
  patch: Record<string, unknown> = {},
): Promise<BotView> {
  const created = await emitAck<BotView>(socket, 'bot:create', {
    name,
    data: {
      type: 'companion',
      knowledge: { world: 'Night City', campaign: '', people: '', forbidden: '' },
    },
  });
  if (!created.ok || !created.data) throw new Error('bot:create failed');
  const updated = await emitAck<BotView>(socket, 'bot:update', {
    botId: created.data.id,
    patch: { active: true, sceneId, characterId, ...patch },
  });
  if (!updated.ok || !updated.data) throw new Error(`bot:update failed`);
  return updated.data;
}

function decision(body: Record<string, unknown>): string {
  return JSON.stringify(body);
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

  const campaign = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Kampania akcji' },
  });
  const campaignId = (campaign.json() as CampaignSummary).id;

  const invite = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const token = (invite.json() as InvitationSummary).token;
  for (const name of ['Johnny', 'Rogue']) {
    const join = await built.app.inject({
      method: 'POST',
      url: `/api/join/${token}`,
      payload: { name },
    });
    const cookie = cookieOf(join.headers['set-cookie']);
    if (name === 'Johnny') {
      playerCookie = cookie;
      const me = await built.app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie },
      });
      playerId = (me.json() as { user: { id: string } }).user.id;
    } else otherCookie = cookie;
  }

  const gm = createSocket(gmCookie);
  await gm.firstSync;
  const scene = await emitAck<SceneView>(gm.socket, 'scene:create', { name: 'Bar Afterlife' });
  if (!scene.ok || !scene.data) throw new Error('scene:create failed');
  sceneId = scene.data.id;
  await emitAck(gm.socket, 'scene:activate', { sceneId });

  const character = await emitAck<CharacterView>(gm.socket, 'character:create', { name: 'Kolec' });
  if (!character.ok || !character.data) throw new Error('character:create failed');
  characterId = character.data.id;
  const stats = (character.data.data as CpredCharacterData).stats;
  await emitAck(gm.socket, 'character:update', {
    characterId,
    patch: { data: { stats: { ...stats, int: 7 }, skills: { perception: 5, brawling: 2 } } },
  });
  gm.socket.disconnect();
}, 60_000);

beforeEach(async () => {
  gateway.up = true;
  gateway.answers = [];
  gateway.bodies = [];
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

describe('decision pass', () => {
  it('sends the skill menu as a JSON schema, not as free text', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Kolec');
    gateway.answers = [decision({ akcja: 'rzut', umiejetnosc: 'Percepcja', powod: 'Nasłuchuję.' })];

    const ack = await emitAck(gm.socket, 'bot:act', {
      botId: bot.id,
      request: 'Kolec, rzuć na Percepcję',
    });
    expect(ack.ok).toBe(true);

    const body = gateway.bodies.at(-1)!;
    const schema = body.json_schema as {
      properties: { umiejetnosc: { enum: string[] } };
    };
    expect(schema.properties.umiejetnosc.enum).toContain('Percepcja');
    // The prompt is the decision prompt, not the character's — no persona in it.
    expect(body.messages[0]!.content).toContain('modułem decyzyjnym');
    gm.socket.disconnect();
  });

  it('a bot in „proposal" mode posts a card instead of rolling', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    const bot = await createBot(gm.socket, 'Kolec');
    gateway.answers = [decision({ akcja: 'rzut', umiejetnosc: 'Percepcja', powod: 'Nasłuchuję.' })];

    await emitAck(gm.socket, 'bot:act', { botId: bot.id, request: 'rzuć na Percepcję' });
    const card = await until(() => seen.messages.find((m) => m.kind === 'proposal'));
    expect(card.proposal?.optionLabel).toBe('Percepcja');
    expect(card.proposal?.characterName).toBe('Kolec');
    expect(card.proposal?.resolution).toBeUndefined();
    // Nothing was rolled yet.
    expect(seen.messages.some((m) => m.kind === 'roll')).toBe(false);

    const trace = await until(() => seen.traces.at(-1));
    expect(trace.outcome).toBe('proposed');
    expect(trace.optionLabel).toBe('Percepcja');
    gm.socket.disconnect();
  });

  it('a bot in „auto" mode rolls straight away, and the card looks like anyone else’s', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    await player.firstSync;
    const gmSeen = collect(gm.socket);
    const playerSeen = collect(player.socket);
    const bot = await createBot(gm.socket, 'Kolec', { data: { autonomy: 'auto' } });
    gateway.answers = [decision({ akcja: 'rzut', umiejetnosc: 'Percepcja', powod: 'Nasłuchuję.' })];

    await emitAck(gm.socket, 'bot:act', { botId: bot.id, request: 'rzuć na Percepcję' });

    const roll = await until(() => playerSeen.messages.find((m) => m.kind === 'roll'));
    expect(roll.roll?.actor).toBe('Kolec');
    // Stage 11's rule, extended to mechanics: nothing on the card says „bot".
    expect(JSON.stringify(roll)).not.toContain('bot');
    expect(playerSeen.messages.some((m) => m.kind === 'proposal')).toBe(false);
    expect(playerSeen.traces).toEqual([]);
    expect((await until(() => gmSeen.traces.at(-1))).outcome).toBe('executed');
    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('a „controlled" bot never reaches the model at all', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    const bot = await createBot(gm.socket, 'Kolec', { data: { autonomy: 'controlled' } });
    gateway.bodies = [];

    await emitAck(gm.socket, 'bot:act', { botId: bot.id, request: 'rzuć na Percepcję' });
    await sleep(150);
    expect(gateway.bodies).toEqual([]);
    expect(seen.messages.some((m) => m.kind === 'proposal')).toBe(false);
    gm.socket.disconnect();
  });
});

describe('safeguards', () => {
  it('refuses a skill the bot does not have — the model cannot invent one', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    const bot = await createBot(gm.socket, 'Kolec');
    // Twice: the first answer is rejected, the retry repeats the mistake.
    gateway.answers = [
      decision({ akcja: 'rzut', umiejetnosc: 'Netrunning', powod: 'Wejdę do sieci.' }),
      decision({ akcja: 'rzut', umiejetnosc: 'Netrunning', powod: 'Wejdę do sieci.' }),
    ];

    await emitAck(gm.socket, 'bot:act', { botId: bot.id, request: 'rzuć na coś' });
    const trace = await until(() => seen.traces.at(-1));
    expect(trace.outcome).toBe('refused');
    expect(trace.retried).toBe(true);
    expect(seen.messages.some((m) => m.kind === 'proposal' || m.kind === 'roll')).toBe(false);
    gm.socket.disconnect();
  });

  it('gives the model one correction, and takes the second answer', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    const bot = await createBot(gm.socket, 'Kolec');
    gateway.answers = [
      'Jasne, rzucam na percepcję!',
      decision({ akcja: 'rzut', umiejetnosc: 'Percepcja', powod: 'Nasłuchuję.' }),
    ];

    await emitAck(gm.socket, 'bot:act', { botId: bot.id, request: 'rzuć na Percepcję' });
    const card = await until(() => seen.messages.find((m) => m.kind === 'proposal'));
    expect(card.proposal?.optionLabel).toBe('Percepcja');
    expect((await until(() => seen.traces.at(-1))).retried).toBe(true);
    // The correction says exactly what was wrong, and nothing else.
    expect(gateway.bodies.at(-1)!.messages.at(-1)!.content).toContain('została odrzucona');
    gm.socket.disconnect();
  });

  it('a bot without a sheet is offered no roll at all', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    const bot = await createBot(gm.socket, 'Kolec', { characterId: null });
    gateway.answers = [decision({ akcja: 'rzut', umiejetnosc: 'Percepcja', powod: 'x' })];

    await emitAck(gm.socket, 'bot:act', { botId: bot.id, request: 'rzuć na Percepcję' });
    await sleep(200);
    // The schema itself carries no skill list, so the grammar cannot produce one.
    const schema = gateway.bodies.at(-1)!.json_schema as { properties: Record<string, unknown> };
    expect(schema.properties.umiejetnosc).toBeUndefined();
    expect(seen.messages.some((m) => m.kind === 'proposal')).toBe(false);
    gm.socket.disconnect();
  });

  it('degrades to nothing when the gateway is down, and chat keeps working', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Kolec');
    gateway.up = false;
    await emitAck<AiStatus>(gm.socket, 'ai:refresh');

    const ack = await emitAck(gm.socket, 'bot:act', {
      botId: bot.id,
      request: 'rzuć na Percepcję',
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('AI_UNAVAILABLE');

    gateway.up = true;
    await emitAck<AiStatus>(gm.socket, 'ai:refresh');
    const said = await emitAck(gm.socket, 'chat:send', { text: 'Idziemy dalej.' });
    expect(said.ok).toBe(true);
    gm.socket.disconnect();
  });
});

describe('resolving a proposal', () => {
  it('„Zatwierdź" rolls through the ordinary sheet path', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    await player.firstSync;
    const gmSeen = collect(gm.socket);
    const playerSeen = collect(player.socket);
    const bot = await createBot(gm.socket, 'Kolec');
    gateway.answers = [decision({ akcja: 'rzut', umiejetnosc: 'Percepcja', powod: 'Nasłuchuję.' })];

    await emitAck(gm.socket, 'bot:act', { botId: bot.id, request: 'rzuć na Percepcję' });
    const card = await until(() => gmSeen.messages.find((m) => m.kind === 'proposal'));

    const ack = await emitAck<{ rollMessageId: number | null }>(gm.socket, 'bot:proposal', {
      messageId: card.id,
      approve: true,
    });
    expect(ack.ok).toBe(true);

    const roll = await until(() => playerSeen.messages.find((m) => m.kind === 'roll'));
    expect(roll.roll?.actor).toBe('Kolec');
    expect(roll.roll?.title).toContain('Percepcja');
    // The card records the answer, so a reload does not offer the buttons again.
    const updated = await until(() => gmSeen.updates.find((m) => m.id === card.id));
    expect(updated.proposal?.resolution).toBe('approved');
    expect(updated.proposal?.rollMessageId).toBe(roll.id);
    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('„Odrzuć" leaves nothing but a closed card', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    const bot = await createBot(gm.socket, 'Kolec');
    gateway.answers = [decision({ akcja: 'rzut', umiejetnosc: 'Percepcja', powod: 'Nasłuchuję.' })];

    await emitAck(gm.socket, 'bot:act', { botId: bot.id, request: 'rzuć na Percepcję' });
    const card = await until(() => seen.messages.find((m) => m.kind === 'proposal'));
    await emitAck(gm.socket, 'bot:proposal', { messageId: card.id, approve: false });

    const updated = await until(() => seen.updates.find((m) => m.id === card.id));
    expect(updated.proposal?.resolution).toBe('rejected');
    expect(seen.messages.some((m) => m.kind === 'roll')).toBe(false);
    // A second click finds the card already answered.
    const again = await emitAck(gm.socket, 'bot:proposal', { messageId: card.id, approve: true });
    expect(again.ok).toBe(false);
    gm.socket.disconnect();
  });

  it('reaches the steering player, and nobody else', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    await player.firstSync;
    const other = createSocket(otherCookie);
    await other.firstSync;
    const playerSeen = collect(player.socket);
    const otherSeen = collect(other.socket);
    const bot = await createBot(gm.socket, 'Kolec', { data: { controllerUserId: playerId } });
    gateway.answers = [decision({ akcja: 'rzut', umiejetnosc: 'Percepcja', powod: 'Nasłuchuję.' })];

    await emitAck(gm.socket, 'bot:act', { botId: bot.id, request: 'rzuć na Percepcję' });
    const card = await until(() => playerSeen.messages.find((m) => m.kind === 'proposal'));
    expect(otherSeen.messages.some((m) => m.kind === 'proposal')).toBe(false);

    // The steering player may answer it; the other player may not.
    const refused = await emitAck(other.socket, 'bot:proposal', {
      messageId: card.id,
      approve: true,
    });
    expect(refused.ok).toBe(false);
    const allowed = await emitAck(player.socket, 'bot:proposal', {
      messageId: card.id,
      approve: true,
    });
    expect(allowed.ok).toBe(true);
    gm.socket.disconnect();
    player.socket.disconnect();
    other.socket.disconnect();
  });

  it('refuses when the bot lost its sheet between the card and the click', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    const bot = await createBot(gm.socket, 'Kolec');
    gateway.answers = [decision({ akcja: 'rzut', umiejetnosc: 'Percepcja', powod: 'Nasłuchuję.' })];

    await emitAck(gm.socket, 'bot:act', { botId: bot.id, request: 'rzuć na Percepcję' });
    const card = await until(() => seen.messages.find((m) => m.kind === 'proposal'));
    await emitAck(gm.socket, 'bot:update', { botId: bot.id, patch: { characterId: null } });

    const ack = await emitAck(gm.socket, 'bot:proposal', { messageId: card.id, approve: true });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('BOT_CHARACTER_CHANGED');
    gm.socket.disconnect();
  });
});

describe('a request typed on chat', () => {
  it('turns into a proposal instead of a spoken line', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    const bot = await createBot(gm.socket, 'Kolec');
    gateway.answers = [decision({ akcja: 'rzut', umiejetnosc: 'Percepcja', powod: 'Nasłuchuję.' })];

    await emitAck(gm.socket, 'chat:send', { text: 'Kolec, rzuć na Percepcję' });
    const card = await until(() => seen.messages.find((m) => m.kind === 'proposal'));
    expect(card.proposal?.request).toContain('rzuć na Percepcję');
    // No second generation: the roll IS the answer to that line.
    expect(gateway.bodies).toHaveLength(1);
    expect(seen.messages.some((m) => m.botId === bot.id && m.kind === 'say')).toBe(false);
    gm.socket.disconnect();
  });

  it('ordinary conversation costs exactly one generation, as before stage 20a', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    const bot = await createBot(gm.socket, 'Kolec');
    gateway.answers = ['Nalane. Coś jeszcze?'];

    await emitAck(gm.socket, 'chat:send', { text: 'Kolec, nalej mi czegoś mocnego' });
    await until(() => seen.messages.find((m) => m.botId === bot.id && m.kind === 'say'));
    expect(gateway.bodies).toHaveLength(1);
    expect(gateway.bodies[0]!.json_schema).toBeNull();
    gm.socket.disconnect();
  });

  it('a model that reads the line as small talk falls back to speaking', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    const bot = await createBot(gm.socket, 'Kolec');
    gateway.answers = [
      decision({ akcja: 'rozmowa', powod: 'To była przechwałka, nie prośba o test.' }),
      'Rzucałem gorszymi rzeczami, skarbie.',
    ];

    await emitAck(gm.socket, 'chat:send', { text: 'Kolec, rzucałeś kiedyś nożem?' });
    const line = await until(() =>
      seen.messages.find((m) => m.botId === bot.id && m.kind === 'say'),
    );
    expect(line.text).toContain('Rzucałem');
    expect(seen.messages.some((m) => m.kind === 'proposal')).toBe(false);
    gm.socket.disconnect();
  });
});
