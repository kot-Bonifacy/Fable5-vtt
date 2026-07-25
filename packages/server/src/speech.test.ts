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
  BotView,
  CampaignSummary,
  ChatMessageBroadcast,
  ChatMessageView,
  InvitationSummary,
  SceneView,
  SocketAck,
  SpeechPreviewResult,
  SpeechStatus,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Stage 12 smoke tests: speech of bots.
 *
 * The interesting parts are the rhythm and the degradation. A spoken line must
 * carry the reveal points that let the text be written out in step with the
 * voice, must not be streamed as provisional text (that would spoil the
 * punchline), and every failure of the speech engine must end in a plain,
 * whole, immediate chat line — never in a broken turn.
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
  aiHealthIntervalMs: 5000,
  aiRequestTimeoutMs: 5000,
  ttsTimeoutMs: 5000,
  ttsCacheMaxBytes: 8 * 1024 * 1024,
};

/** Scripted stand-in for the gateway, speech included. */
const gateway = {
  ttsAvailable: true,
  ttsFails: false,
  answers: [] as string[],
  ttsCalls: [] as { text: string; voice: string; speed: number; pitch: number }[],
};

/** 0,4 s of silence — enough to be a real, playable WAV. */
function wavBytes(): Buffer {
  const samples = 8820;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + samples * 2, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(22050, 24);
  header.writeUInt32LE(44100, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(samples * 2, 40);
  return Buffer.concat([header, Buffer.alloc(samples * 2)]);
}

function sseStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send('start', { reasoning: false });
      for (const part of text.match(/.{1,12}/gs) ?? []) send('delta', { text: part });
      send('done', { usage: { prompt_tokens: 50, completion_tokens: 10, generation_ms: 100 } });
      controller.close();
    },
  });
}

const aiFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

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
      tts: {
        engine: 'piper',
        device: 'cpu',
        available: gateway.ttsAvailable,
        loaded: true,
        queue_length: 0,
        busy: false,
        voices: 5,
        syntheses: 3,
        last_synth_ms: 140,
        vram_mb: 0,
      },
    });
  }
  if (url.endsWith('/tokenize')) {
    const body = JSON.parse(String(init?.body ?? '{}')) as { text?: string };
    return Response.json({ count: Math.ceil((body.text?.length ?? 0) / 4), context_size: 32768 });
  }
  if (url.endsWith('/tts')) {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      text: string;
      voice: string;
      speed: number;
      pitch: number;
    };
    gateway.ttsCalls.push(body);
    if (gateway.ttsFails) return new Response('engine down', { status: 503 });
    return Response.json({
      audio_base64: wavBytes().toString('base64'),
      format: 'wav',
      sample_rate: 22050,
      duration_ms: 400,
      // Two words, second one halfway through — the writing-out rhythm.
      reveal: [
        { ms: 0, chars: Math.min(5, body.text.length) },
        { ms: 200, chars: body.text.length },
      ],
      engine: 'piper',
      voice: body.voice,
      synth_ms: 42,
      spoken_text: body.text,
    });
  }
  if (url.endsWith('/chat')) {
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
let sceneId: string;
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
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 5000);
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
  activity: BotActivityEntry[][];
  status: SpeechStatus[];
} {
  const seen = {
    messages: [] as ChatMessageView[],
    activity: [] as BotActivityEntry[][],
    status: [] as SpeechStatus[],
  };
  socket.on('chat:message', (broadcast: ChatMessageBroadcast) =>
    seen.messages.push(broadcast.message),
  );
  socket.on('bot:activity', (broadcast: BotActivityBroadcast) =>
    seen.activity.push(broadcast.entries),
  );
  socket.on('speech:status', (status: SpeechStatus) => seen.status.push(status));
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

async function createBot(
  socket: ClientSocket,
  name: string,
  voice: Record<string, unknown> | null,
): Promise<BotView> {
  const created = await emitAck<BotView>(socket, 'bot:create', {
    name,
    data: {
      type: 'npc',
      persona: {
        personality: 'Fikserka z Watson.',
        motivations: '',
        secrets: '',
        speechStyle: '',
        catchphrases: [],
      },
    },
  });
  if (!created.ok || !created.data) throw new Error('bot:create failed');
  const patch: Record<string, unknown> = { active: true, sceneId };
  if (voice) patch.data = { voice };
  const updated = await emitAck<BotView>(socket, 'bot:update', {
    botId: created.data.id,
    patch,
  });
  if (!updated.ok || !updated.data) throw new Error('bot:update failed');
  return updated.data;
}

const SPEAKING_VOICE = {
  enabled: true,
  presetId: 'fixerka',
  sampleUrl: null,
  rate: 1,
  pitch: 1,
};

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
    payload: { name: 'Kampania z głosem' },
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

  const gm = createSocket(gmCookie);
  await gm.firstSync;
  const scene = await emitAck<SceneView>(gm.socket, 'scene:create', { name: 'Bar Afterlife' });
  if (!scene.ok || !scene.data) throw new Error('scene:create failed');
  sceneId = scene.data.id;
  await emitAck(gm.socket, 'scene:activate', { sceneId });
  gm.socket.disconnect();
}, 60_000);

beforeEach(async () => {
  gateway.ttsAvailable = true;
  gateway.ttsFails = false;
  gateway.answers = [];
  gateway.ttsCalls = [];
  await built.prisma.chatMessage.deleteMany({});
  await built.prisma.botProfile.deleteMany({});
  await built.prisma.campaign.updateMany({ data: { speechEnabled: true } });
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

describe('a bot with a voice', () => {
  it('delivers the line with audio and a writing-out rhythm', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Rina', SPEAKING_VOICE);
    const player = createSocket(playerCookie);
    await player.firstSync;
    const seen = collect(player.socket);

    gateway.answers = ['Dwa tysiące i gadamy dalej.'];
    await emitAck(player.socket, 'chat:send', { text: 'Rina, masz robotę?' });

    const line = await until(() => seen.messages.find((m) => m.botId === bot.id));
    expect(line.speech).toBeDefined();
    expect(line.speech?.audioUrl).toMatch(/^\/api\/tts\/[a-f0-9]{32}$/);
    expect(line.speech?.durationMs).toBe(400);
    expect(line.speech?.reveal.at(-1)?.chars).toBe(line.text.length);
    expect(line.speech?.voiceId).toBe('fixerka');

    // Preset parameters reach the engine (the „Fikserka" model, not a default).
    expect(gateway.ttsCalls[0]?.voice).toBe('pl_PL-gosia-medium');

    // And the audio is actually downloadable.
    const audio = await built.app.inject({
      method: 'GET',
      url: line.speech!.audioUrl!,
      headers: { cookie: playerCookie },
    });
    expect(audio.statusCode).toBe(200);
    expect(audio.headers['content-type']).toBe('audio/wav');
    expect(audio.rawPayload.subarray(0, 4).toString('ascii')).toBe('RIFF');
  });

  it('never streams the sentence as text before it is spoken', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await createBot(gm.socket, 'Rina', SPEAKING_VOICE);
    const player = createSocket(playerCookie);
    await player.firstSync;
    const seen = collect(player.socket);

    gateway.answers = ['To będzie kosztowało trzy tysiące, skarbie.'];
    await emitAck(player.socket, 'chat:send', { text: 'Rina, ile za tę robotę?' });
    await until(() => seen.messages.find((m) => m.botId));

    // „mówi…" is announced, but not one character of the answer leaks early.
    const texts = seen.activity.flat().map((entry) => entry.text);
    expect(texts.every((text) => text === '')).toBe(true);
    expect(seen.activity.flat().some((entry) => entry.speaking === true)).toBe(true);
  });

  it('speaks a line the GM typed in the NPC’s name, like a generated one', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Rina', SPEAKING_VOICE);
    const player = createSocket(playerCookie);
    await player.firstSync;
    const seen = collect(player.socket);

    await emitAck(gm.socket, 'bot:say', { botId: bot.id, text: 'Wynocha stąd.' });
    const line = await until(() => seen.messages.find((m) => m.botId === bot.id));
    expect(line.speech?.audioUrl).toBeTruthy();
  });

  it('synthesizes a repeated line only once (cache by text and voice)', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Rina', SPEAKING_VOICE);
    const player = createSocket(playerCookie);
    await player.firstSync;
    const seen = collect(player.socket);

    await emitAck(gm.socket, 'bot:say', { botId: bot.id, text: 'Ta sama kwestia dwa razy.' });
    await until(() => seen.messages.find((m) => m.botId === bot.id));
    await emitAck(gm.socket, 'bot:say', { botId: bot.id, text: 'Ta sama kwestia dwa razy.' });
    await until(() =>
      seen.messages.filter((m) => m.botId === bot.id).length === 2 ? true : undefined,
    );

    expect(gateway.ttsCalls).toHaveLength(1);
  });
});

describe('degradation and control', () => {
  it('delivers a plain line when the speech engine is down', async () => {
    gateway.ttsAvailable = false;
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await emitAck<AiStatus>(gm.socket, 'ai:refresh');
    const bot = await createBot(gm.socket, 'Rina', SPEAKING_VOICE);
    const player = createSocket(playerCookie);
    await player.firstSync;
    const seen = collect(player.socket);

    await emitAck(gm.socket, 'bot:say', {
      botId: bot.id,
      text: 'Silnik mowy leży, więc mówię tekstem.',
    });
    const line = await until(() => seen.messages.find((m) => m.botId === bot.id));
    expect(line.speech).toBeUndefined();
    expect(line.text).toBe('Silnik mowy leży, więc mówię tekstem.');
    expect(gateway.ttsCalls).toHaveLength(0);
  });

  it('delivers a plain line when synthesis itself fails', async () => {
    gateway.ttsFails = true;
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Rina', SPEAKING_VOICE);
    const player = createSocket(playerCookie);
    await player.firstSync;
    const seen = collect(player.socket);

    await emitAck(gm.socket, 'bot:say', {
      botId: bot.id,
      text: 'Synteza padła, ale kwestia idzie dalej.',
    });
    const line = await until(() => seen.messages.find((m) => m.botId === bot.id));
    expect(line.speech).toBeUndefined();
    expect(gateway.ttsCalls).toHaveLength(1);
  });

  it('stays silent for a bot with speech turned off in its profile', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Rina', null);
    const player = createSocket(playerCookie);
    await player.firstSync;
    const seen = collect(player.socket);

    await emitAck(gm.socket, 'bot:say', { botId: bot.id, text: 'Ten NPC nie ma głosu.' });
    const line = await until(() => seen.messages.find((m) => m.botId === bot.id));
    expect(line.speech).toBeUndefined();
  });

  it('silences the whole table when the GM turns speech off', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Rina', SPEAKING_VOICE);
    const player = createSocket(playerCookie);
    await player.firstSync;
    const seen = collect(player.socket);

    const toggled = await emitAck<{ enabled: boolean }>(gm.socket, 'speech:toggle', {
      enabled: false,
    });
    expect(toggled.ok).toBe(true);

    await emitAck(gm.socket, 'bot:say', { botId: bot.id, text: 'MG wyłączył mowę przy stole.' });
    const line = await until(() => seen.messages.find((m) => m.botId === bot.id));
    expect(line.speech).toBeUndefined();

    // The switch itself reaches the player, so the UI can show it.
    const status = await until(() => seen.status.at(-1));
    expect(status.enabled).toBe(false);
  });

  it('keeps engine diagnostics away from players', async () => {
    const gm = createSocket(gmCookie);
    const gmSeen = collect(gm.socket);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    const playerSeen = collect(player.socket);
    await player.firstSync;

    const gmStatus = await until(() => gmSeen.status.at(-1));
    expect(gmStatus.engine).toBe('piper');
    expect(gmStatus.voices).toBeGreaterThan(0);

    const playerStatus = await until(() => playerSeen.status.at(-1));
    expect(playerStatus.available).toBe(true);
    expect(Object.keys(playerStatus).sort()).toEqual(['available', 'enabled']);
  });

  it('refuses a preview to a player and serves one to the GM', async () => {
    const player = createSocket(playerCookie);
    await player.firstSync;
    const refused = await emitAck<SpeechPreviewResult>(player.socket, 'speech:preview', {
      presetId: 'fixerka',
    });
    expect(refused.ok).toBe(false);

    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const preview = await emitAck<SpeechPreviewResult>(gm.socket, 'speech:preview', {
      presetId: 'fixerka',
      text: 'Za 250 eddiesów.',
    });
    expect(preview.ok).toBe(true);
    expect(preview.data?.audioUrl).toMatch(/^\/api\/tts\//);
    expect(preview.data?.spokenText).toBe('Za 250 eddiesów.');
  });

  it('answers 404 for audio that was swept from the cache', async () => {
    const response = await built.app.inject({
      method: 'GET',
      url: `/api/tts/${'0'.repeat(32)}`,
      headers: { cookie: playerCookie },
    });
    expect(response.statusCode).toBe(404);
  });
});
