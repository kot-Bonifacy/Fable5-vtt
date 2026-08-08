import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  InvitationSummary,
  RulesChunkBroadcast,
  RulesDoneBroadcast,
  RulesIndexStatus,
  RulesSourcesBroadcast,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Asystent zasad na żywych gniazdach (etap 19a).
 *
 * Gateway jest podstawiony, więc testy nie zależą od GPU ani od zaindeksowanego
 * podręcznika. Treść „fragmentów" jest wymyślona — repozytorium jest publiczne.
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
  aiHealthIntervalMs: 200,
  aiRequestTimeoutMs: 5000,
};

const PASSAGE_ONE = {
  chunk_id: 11,
  text: 'Rozdział Testowy › Zużycie pancerza (s. 186)\n\nPo trafieniu wartość pancerza spada o jeden punkt.',
  source: '10-walka.md',
  chapter: 'Rozdział Testowy',
  section: 'Zużycie pancerza',
  page: 186,
  page_end: 186,
  score: 0.031,
  dense_rank: 1,
  fts_rank: 2,
};

const PASSAGE_TWO = {
  ...PASSAGE_ONE,
  chunk_id: 12,
  section: 'Naprawa pancerza',
  page: 187,
  page_end: 188,
  dense_rank: 2,
  fts_rank: null,
};

/** Podstawiony gateway — sterowany z testów. */
const gateway = {
  up: true,
  ragEnabled: true,
  chunks: 42,
  mismatch: false,
  indexing: { running: false, done: 0, total: 0, error: null as string | null },
  searchStatus: 200,
  searchDetail: 'indeks jest pusty',
  hits: [PASSAGE_ONE, PASSAGE_TWO],
  script: [] as { event: string; data: unknown }[],
  /**
   * Scenariusze kolejnych wywołań `/chat`, zużywane po kolei. Potrzebne tam,
   * gdzie jedno pytanie wywołuje model dwa razy (powtórka bez rozumowania) —
   * podmiana `script` w locie była wyścigiem.
   */
  scriptQueue: [] as { event: string; data: unknown }[][],
  chatBody: null as Record<string, unknown> | null,
  chatCalls: 0,
  indexCalls: 0,
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const aiFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!gateway.up) throw new TypeError('fetch failed');

  if (url.endsWith('/health')) {
    return json({
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
  if (url.endsWith('/rag/status')) {
    return json({
      enabled: gateway.ragEnabled,
      reason: gateway.ragEnabled ? null : 'RAG wyłączony w konfiguracji (GATEWAY_RAG_ENABLED=0)',
      model: 'bge-m3',
      device: 'cpu',
      model_mismatch: gateway.mismatch,
      collections:
        gateway.chunks > 0
          ? [
              {
                name: 'rulebook',
                documents: 21,
                chunks: gateway.chunks,
                tokens: 400_000,
                indexed_at: '2026-08-08T09:00:00+00:00',
              },
            ]
          : [],
      indexing: gateway.indexing,
    });
  }
  if (url.endsWith('/rag/search')) {
    if (gateway.searchStatus !== 200) {
      return json({ detail: gateway.searchDetail }, gateway.searchStatus);
    }
    return json({ collection: 'rulebook', query: '', hits: gateway.hits, took_ms: 37 });
  }
  if (url.endsWith('/rag/index/rulebook')) {
    gateway.indexCalls += 1;
    if (!gateway.ragEnabled) return json({ detail: 'nie znaleziono katalogu podręcznika' }, 503);
    gateway.indexing = { running: true, done: 3, total: 21, error: null };
    return json({ status: 'started' }, 202);
  }
  if (url.endsWith('/chat')) {
    gateway.chatBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    gateway.chatCalls += 1;
    const script = gateway.scriptQueue.shift() ?? gateway.script;
    return new Response(sseStream(script), {
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
  const firstSync = new Promise<StateSyncPayload>((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error('state:sync timeout')), 4000);
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.once('state:sync', (payload: StateSyncPayload) => {
      clearTimeout(timer);
      resolvePromise(payload);
    });
  });
  return { socket, firstSync };
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 3000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolvePromise(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

/** Rozpakowuje udany ack — inaczej `ack.data` jest po stronie typów opcjonalne. */
function dataOf<T>(ack: SocketAck<T>): T {
  if (!ack.ok) throw new Error(`oczekiwano sukcesu, przyszło ${ack.error}`);
  if (ack.data === undefined) throw new Error('ack bez danych');
  return ack.data;
}

interface RulesOutcome {
  sources: RulesSourcesBroadcast | null;
  answer: string;
  thinking: string;
  done: RulesDoneBroadcast | null;
  error: string | null;
  /** Czy fragmenty przyszły PRZED pierwszym tokenem odpowiedzi. */
  sourcesFirst: boolean;
}

function collectRules(socket: ClientSocket, ms = 3000): Promise<RulesOutcome> {
  return new Promise((resolvePromise, reject) => {
    const outcome: RulesOutcome = {
      sources: null,
      answer: '',
      thinking: '',
      done: null,
      error: null,
      sourcesFirst: true,
    };
    const timer = setTimeout(() => reject(new Error('rules stream timeout')), ms);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('rules:sources', onSources);
      socket.off('rules:chunk', onChunk);
      socket.off('rules:done', onDone);
      socket.off('rules:error', onError);
    };
    const onSources = (payload: RulesSourcesBroadcast) => {
      outcome.sources = payload;
    };
    const onChunk = (chunk: RulesChunkBroadcast) => {
      if (outcome.sources === null) outcome.sourcesFirst = false;
      if (chunk.kind === 'delta') outcome.answer += chunk.text;
      else outcome.thinking += chunk.text;
    };
    const onDone = (done: RulesDoneBroadcast) => {
      outcome.done = done;
      cleanup();
      resolvePromise(outcome);
    };
    const onError = (error: { code: string }) => {
      outcome.error = error.code;
      cleanup();
      resolvePromise(outcome);
    };
    socket.on('rules:sources', onSources);
    socket.on('rules:chunk', onChunk);
    socket.once('rules:done', onDone);
    socket.once('rules:error', onError);
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
    payload: { name: 'Kampania zasad' },
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
  gateway.ragEnabled = true;
  gateway.chunks = 42;
  gateway.mismatch = false;
  gateway.indexing = { running: false, done: 0, total: 0, error: null };
  gateway.searchStatus = 200;
  gateway.hits = [PASSAGE_ONE, PASSAGE_TWO];
  gateway.chatBody = null;
  gateway.chatCalls = 0;
  gateway.scriptQueue = [];
  gateway.indexCalls = 0;
  gateway.script = [
    { event: 'think', data: { text: 'sprawdzam fragment 1' } },
    { event: 'delta', data: { text: 'Pancerz traci 1 OB [1].' } },
    { event: 'done', data: { usage: { completion_tokens: 9, generation_ms: 400 } } },
  ];
  const { socket, firstSync } = createSocket(gmCookie);
  await firstSync;
  await emitAck(socket, 'ai:refresh');
  socket.disconnect();
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

describe('rules:ask', () => {
  it('sends the passages before the first token of the answer', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;

    const stream = collectRules(gm.socket);
    const ack = await emitAck<{ requestId: string }>(gm.socket, 'rules:ask', {
      question: 'Co się dzieje z pancerzem po trafieniu?',
    });
    expect(ack.ok).toBe(true);

    const result = await stream;
    // Kryterium etapu: MG widzi, na czym asystent się opiera, nawet gdyby
    // generacja padła w połowie.
    expect(result.sourcesFirst).toBe(true);
    expect(result.sources?.passages).toHaveLength(2);
    expect(result.sources?.searchMs).toBe(37);
    expect(result.answer).toBe('Pancerz traci 1 OB [1].');
    expect(result.thinking).toBe('sprawdzam fragment 1');
    expect(result.done?.completionTokens).toBe(9);
    expect(result.done?.totalMs).toBeGreaterThanOrEqual(0);

    gm.socket.disconnect();
  });

  it('carries the citation of every passage to the client', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const stream = collectRules(gm.socket);
    await emitAck(gm.socket, 'rules:ask', { question: 'Ablacja pancerza?' });
    const result = await stream;

    const [first, second] = result.sources!.passages;
    expect(first).toMatchObject({
      chapter: 'Rozdział Testowy',
      section: 'Zużycie pancerza',
      page: 186,
    });
    expect(first?.pageEnd).toBe(186);
    expect(second?.pageEnd).toBe(188);
    // Ranking obu połówek hybrydy dociera do UI — bez tego nie da się zdiagnozować
    // złego wyszukiwania.
    expect(first?.denseRank).toBe(1);
    expect(second?.keywordRank).toBeNull();

    gm.socket.disconnect();
  });

  it('builds a numbered prompt out of the passages and asks for a cold answer', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const stream = collectRules(gm.socket);
    await emitAck(gm.socket, 'rules:ask', { question: 'Jak działa pancerz?' });
    await stream;

    const messages = gateway.chatBody?.messages as { role: string; content: string }[];
    expect(messages.map((message) => message.role)).toEqual(['system', 'user']);
    expect(messages[0]?.content).toContain('TYLKO na podanych fragmentach');
    expect(messages[1]?.content).toContain('[1] Rozdział Testowy › Zużycie pancerza, s. 186');
    expect(messages[1]?.content).toContain('[2] Rozdział Testowy › Naprawa pancerza, s. 187–188');
    // Pytanie na końcu kontekstu — tam patrzy model 9B.
    expect(
      messages[1]?.content.trimEnd().endsWith('Pytanie Mistrza Gry: Jak działa pancerz?'),
    ).toBe(true);
    expect(gateway.chatBody?.purpose).toBe('gm_assistant');
    expect(gateway.chatBody?.temperature).toBe(0.2);

    gm.socket.disconnect();
  });

  it('nie narzuca limitu tokenów, gdy rozumowanie jest włączone', async () => {
    // Regresja z oględzin 08.08: blok think i odpowiedź dzielą jedną pulę
    // `max_tokens`. Własny limit zastępował `reasoning_max_tokens` gatewaya i
    // model oddawał PUSTĄ odpowiedź przy komplecie poprawnych cytatów.
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const stream = collectRules(gm.socket);
    await emitAck(gm.socket, 'rules:ask', { question: 'Jak działa pancerz?' });
    await stream;

    expect(gateway.chatBody?.reasoning).toBe(true);
    expect(gateway.chatBody?.max_tokens ?? null).toBeNull();
    gm.socket.disconnect();
  });

  it('powtarza pytanie bez rozumowania, gdy think zjadł całą pulę tokenów', async () => {
    // Zaobserwowane 08.08 na żywym modelu: 1536 tokenów samego rozumowania i
    // PUSTA odpowiedź przy komplecie poprawnych cytatów. `reasoning_budget`
    // llama-servera tego nie pilnuje, więc pilnuje tego serwer VTT.
    gateway.scriptQueue = [
      // Pierwsza generacja: samo rozumowanie, ani jednego tokenu treści.
      [
        { event: 'think', data: { text: 'myślę i myślę i myślę' } },
        { event: 'done', data: { usage: { completion_tokens: 1536 } } },
      ],
      // Powtórka: konkretna odpowiedź.
      [
        { event: 'delta', data: { text: 'Osłona daje OB równe jej wytrzymałości. [1]' } },
        { event: 'done', data: { usage: { completion_tokens: 60 } } },
      ],
    ];
    const gm = createSocket(gmCookie);
    await gm.firstSync;

    const stream = collectRules(gm.socket, 6000);
    await emitAck(gm.socket, 'rules:ask', { question: 'Jak działa osłona?' });
    const result = await stream;

    expect(gateway.chatCalls).toBe(2);
    expect(result.answer).toBe('Osłona daje OB równe jej wytrzymałości. [1]');
    expect(result.done?.retriedWithoutReasoning).toBe(true);
    // Powtórka idzie bez rozumowania i z limitem — inaczej wpadłaby w tę samą pułapkę.
    expect(gateway.chatBody?.reasoning).toBe(false);
    expect(gateway.chatBody?.max_tokens).toBe(420);
    // Fragmenty wyszukujemy raz — powtórka kosztuje samą generację.
    expect(result.sources?.passages).toHaveLength(2);
    gm.socket.disconnect();
  });

  it('nie powtarza, gdy rozumowanie zwróciło odpowiedź', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const stream = collectRules(gm.socket);
    await emitAck(gm.socket, 'rules:ask', { question: 'Jak działa pancerz?' });
    const result = await stream;

    expect(result.answer).toBe('Pancerz traci 1 OB [1].');
    expect(result.done?.retriedWithoutReasoning).toBeUndefined();
    expect(gateway.chatBody?.reasoning).toBe(true);
    gm.socket.disconnect();
  });

  it('bez rozumowania trzyma odpowiedź na krótkiej smyczy', async () => {
    gateway.script = [
      { event: 'delta', data: { text: 'Krótka odpowiedź.' } },
      { event: 'done', data: { usage: null } },
    ];
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const stream = collectRules(gm.socket);
    await emitAck(gm.socket, 'rules:ask', { question: 'Pytanie?', reasoning: false });
    await stream;

    expect(gateway.chatBody?.max_tokens).toBe(420);
    gm.socket.disconnect();
  });

  it('turns off reasoning when the GM asks it to', async () => {
    gateway.script = [
      { event: 'delta', data: { text: 'Krótka odpowiedź.' } },
      { event: 'done', data: { usage: null } },
    ];
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const stream = collectRules(gm.socket);
    await emitAck(gm.socket, 'rules:ask', { question: 'Pytanie?', reasoning: false });
    await stream;

    expect(gateway.chatBody?.reasoning).toBe(false);
    gm.socket.disconnect();
  });

  it('refuses an empty question without touching the gateway', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const ack = await emitAck(gm.socket, 'rules:ask', { question: '   ' });
    expect(ack).toEqual({ ok: false, error: 'RULES_EMPTY_QUESTION' });
    expect(gateway.chatBody).toBeNull();
    gm.socket.disconnect();
  });

  it('refuses a player — the passages are book text', async () => {
    const player = createSocket(playerCookie);
    await player.firstSync;
    const ack = await emitAck(player.socket, 'rules:ask', { question: 'Jak działa pancerz?' });
    expect(ack).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(gateway.chatBody).toBeNull();
    player.socket.disconnect();
  });
});

describe('degradacja bez indeksu', () => {
  it('nie woła modelu, gdy wyszukiwanie odmawia', async () => {
    gateway.searchStatus = 503;
    gateway.searchDetail = 'podręcznik nie jest jeszcze zaindeksowany';
    const gm = createSocket(gmCookie);
    await gm.firstSync;

    const stream = collectRules(gm.socket);
    await emitAck(gm.socket, 'rules:ask', { question: 'Cokolwiek?' });
    const result = await stream;

    expect(result.error).toBe('RAG_UNAVAILABLE');
    // Pytanie modelu bez fragmentów dałoby odpowiedź zmyśloną — lepiej żadnej.
    expect(gateway.chatBody).toBeNull();
    gm.socket.disconnect();
  });

  it('odmawia, gdy sam model jest niedostępny', async () => {
    gateway.up = false;
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await emitAck(gm.socket, 'ai:refresh');

    const ack = await emitAck(gm.socket, 'rules:ask', { question: 'Pytanie?' });
    expect(ack).toEqual({ ok: false, error: 'AI_UNAVAILABLE' });
    gm.socket.disconnect();
  });
});

describe('rules:status', () => {
  it('mówi „gotowy" i podaje liczbę fragmentów', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const ack = await emitAck<RulesIndexStatus>(gm.socket, 'rules:status');

    expect(dataOf(ack)).toMatchObject({
      enabled: true,
      ready: true,
      model: 'bge-m3',
      device: 'cpu',
      chunks: 42,
      documents: 21,
      reason: null,
    });
    gm.socket.disconnect();
  });

  it('pusty indeks to nie awaria, tylko powód po polsku', async () => {
    gateway.chunks = 0;
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const ack = await emitAck<RulesIndexStatus>(gm.socket, 'rules:status');

    expect(dataOf(ack).enabled).toBe(true);
    expect(dataOf(ack).ready).toBe(false);
    expect(dataOf(ack).reason).toContain('nie jest jeszcze zaindeksowany');
    gm.socket.disconnect();
  });

  it('indeks zbudowany innym modelem każe zaindeksować ponownie', async () => {
    gateway.mismatch = true;
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const ack = await emitAck<RulesIndexStatus>(gm.socket, 'rules:status');

    expect(dataOf(ack).ready).toBe(false);
    expect(dataOf(ack).reason).toContain('zaindeksuj podręcznik ponownie');
    gm.socket.disconnect();
  });

  it('martwy gateway daje status z powodem, nie wyjątek', async () => {
    gateway.up = false;
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const ack = await emitAck<RulesIndexStatus>(gm.socket, 'rules:status');

    expect(ack.ok).toBe(true);
    expect(dataOf(ack).ready).toBe(false);
    expect(dataOf(ack).reason).toContain('brak połączenia z AI Gateway');
    gm.socket.disconnect();
  });

  it('jest niedostępny dla gracza', async () => {
    const player = createSocket(playerCookie);
    await player.firstSync;
    expect(await emitAck(player.socket, 'rules:status')).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    player.socket.disconnect();
  });
});

describe('rules:index', () => {
  it('uruchamia indeksowanie i oddaje postęp', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const ack = await emitAck<RulesIndexStatus>(gm.socket, 'rules:index');

    expect(gateway.indexCalls).toBe(1);
    expect(dataOf(ack).indexing).toBe(true);
    expect(dataOf(ack).progress).toEqual({ done: 3, total: 21 });
    gm.socket.disconnect();
  });

  it('odmowę gatewaya oddaje jako powód, nie jako goły kod błędu', async () => {
    gateway.ragEnabled = false;
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const ack = await emitAck<RulesIndexStatus>(gm.socket, 'rules:index');

    expect(ack.ok).toBe(true);
    expect(dataOf(ack).reason).toContain('nie znaleziono katalogu podręcznika');
    gm.socket.disconnect();
  });

  it('jest niedostępny dla gracza', async () => {
    const player = createSocket(playerCookie);
    await player.firstSync;
    expect(await emitAck(player.socket, 'rules:index')).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(gateway.indexCalls).toBe(0);
    player.socket.disconnect();
  });
});
