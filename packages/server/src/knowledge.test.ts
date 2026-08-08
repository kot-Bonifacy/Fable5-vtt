import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  BotTraceBroadcast,
  BotView,
  CampaignSummary,
  ChatMessageBroadcast,
  ChatMessageView,
  InvitationSummary,
  KnowledgeDeleteBroadcast,
  KnowledgeEntryView,
  KnowledgeIndexStatus,
  KnowledgePreviewResult,
  KnowledgeSyncPayload,
  KnowledgeUpsertBroadcast,
  SceneView,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Baza wiedzy kampanii na żywych gniazdach (etap 19b).
 *
 * Gateway jest podstawiony, ale **z prawdziwą semantyką filtra**: atrapa trzyma
 * zaindeksowane dokumenty w pamięci i odsiewa je po widoczności i tagach tak samo
 * jak SQLite po drugiej stronie. Bez tego „wpis spoza uprawnień nie dociera do
 * promptu" byłoby testem atrapy, a nie serwera — a to jest kryterium etapu.
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
};

interface IndexedDocument {
  source: string;
  text: string;
  title: string;
  tags: string[];
  visibility: string;
}

interface SearchBody {
  query: string;
  collection: string;
  top_k: number;
  tags: string[];
  visibility: string[];
}

/** Podstawiony gateway z pamięciowym indeksem. */
const gateway = {
  up: true,
  /** kolekcja → źródło → dokument */
  index: new Map<string, Map<string, IndexedDocument>>(),
  searches: [] as SearchBody[],
  chatPrompts: [] as string[],
  answers: [] as string[],
  indexCalls: 0,
  /** Wymusza odmowę indeksowania bez kładzenia całego gatewaya. */
  refuseIndex: false,
};

function collectionOf(name: string): Map<string, IndexedDocument> {
  const existing = gateway.index.get(name);
  if (existing) return existing;
  const created = new Map<string, IndexedDocument>();
  gateway.index.set(name, created);
  return created;
}

/**
 * To samo, co robi SQLite: filtr po widoczności i „którykolwiek z tagów", a
 * potem dopasowanie tekstu. Przycinanie końcówki fleksyjnej jest przepisane z
 * `fts_query` w gatewayu — bez niego „o klubie" nie trafiłoby w „Klub".
 */
function matches(document: IndexedDocument, body: SearchBody): boolean {
  if (body.visibility.length > 0 && !body.visibility.includes(document.visibility)) return false;
  if (body.tags.length > 0 && !body.tags.some((tag) => document.tags.includes(tag))) return false;
  const haystack = document.text.toLowerCase();
  const words = body.query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.some(
    (word) => word.length > 3 && haystack.includes(word.slice(0, Math.max(4, word.length - 3))),
  );
}

function sseStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send('start', { reasoning: false });
      send('delta', { text });
      send('done', { usage: { completion_tokens: 12, generation_ms: 300 } });
      controller.close();
    },
  });
}

const aiFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!gateway.up) throw new TypeError('fetch failed');
  const body = (): Record<string, unknown> =>
    JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;

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
    const text = String((body() as { text?: string }).text ?? '');
    return Response.json({ count: Math.ceil(text.length / 4), context_size: 32768 });
  }
  if (url.endsWith('/rag/status')) {
    return Response.json({
      enabled: true,
      reason: null,
      model: 'bge-m3',
      device: 'cpu',
      model_mismatch: false,
      collections: [...gateway.index.entries()].map(([name, documents]) => ({
        name,
        documents: documents.size,
        chunks: documents.size,
        tokens: 100 * documents.size,
        indexed_at: '2026-08-08T09:00:00+00:00',
      })),
      indexing: { running: false, done: 0, total: 0, error: null },
    });
  }
  if (url.endsWith('/rag/search')) {
    const search = body() as unknown as SearchBody;
    gateway.searches.push(search);
    const documents = [...collectionOf(search.collection).values()].filter((document) =>
      matches(document, search),
    );
    return Response.json({
      collection: search.collection,
      query: search.query,
      hits: documents.slice(0, search.top_k).map((document, position) => ({
        chunk_id: position + 1,
        text: document.text,
        source: document.source,
        chapter: document.title,
        section: '',
        page: null,
        page_end: null,
        score: 1 - position / 10,
        dense_rank: position + 1,
        fts_rank: null,
      })),
      took_ms: 12,
    });
  }
  if (url.endsWith('/rag/index')) {
    gateway.indexCalls += 1;
    if (gateway.refuseIndex)
      return Response.json({ detail: 'indeksowanie już trwa' }, { status: 503 });
    const payload = body() as { collection: string; documents: IndexedDocument[] };
    const target = collectionOf(payload.collection);
    for (const document of payload.documents) target.set(document.source, document);
    return Response.json({
      collection: payload.collection,
      documents: payload.documents.length,
      chunks: payload.documents.length,
      duration_ms: 5,
      error: null,
    });
  }
  if (url.endsWith('/rag/forget')) {
    const payload = body() as { collection: string; sources: string[] };
    const target = collectionOf(payload.collection);
    let removed = 0;
    for (const source of payload.sources) if (target.delete(source)) removed += 1;
    return Response.json({ removed });
  }
  if (url.includes('/rag/collections/') && url.endsWith('/sources')) {
    const name = decodeURIComponent(url.split('/rag/collections/')[1]!.replace('/sources', ''));
    return Response.json({ sources: [...collectionOf(name).keys()] });
  }
  if (url.endsWith('/chat')) {
    const payload = body() as { messages: { content: string }[] };
    gateway.chatPrompts.push(payload.messages.map((message) => message.content).join('\n---\n'));
    return new Response(sseStream(gateway.answers.shift() ?? 'Nie kojarzę.'), {
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
/** Nazwa kolekcji RAG tej kampanii — jedna na kampanię, patrz `knowledgeCollection`. */
let campaignCollection: string;
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
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
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
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 5000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolvePromise(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

function dataOf<T>(ack: SocketAck<T>): T {
  if (!ack.ok) throw new Error(`oczekiwano sukcesu, przyszło ${ack.error}`);
  if (ack.data === undefined) throw new Error('ack bez danych');
  return ack.data;
}

const sleep = (ms: number) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function until<T>(check: () => T | undefined, ms = 5000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await sleep(25);
  }
}

const KLUB = {
  title: 'Klub Afterlife',
  body: 'Bar w podziemiach dawnej kliniki. Solówki szukają tam zleceń, a barman miesza drinki nazwane po zmarłych.',
  type: 'place' as const,
  tags: ['miejsca'],
  visibility: 'bots' as const,
};

const SEKRET = {
  title: 'Kto sypie ekipę',
  body: 'Fikserka Vex sprzedaje Militechowi informacje o klientach klubu Afterlife.',
  type: 'note' as const,
  tags: ['miejsca', 'intrygi'],
  visibility: 'gm' as const,
};

async function addEntry(
  socket: ClientSocket,
  entry: Record<string, unknown>,
): Promise<KnowledgeEntryView> {
  return dataOf(await emitAck<KnowledgeEntryView>(socket, 'knowledge:upsert', entry));
}

async function createBot(
  socket: ClientSocket,
  name: string,
  knowledgeContext: Record<string, unknown> | null,
): Promise<BotView> {
  const created = dataOf(
    await emitAck<BotView>(socket, 'bot:create', {
      name,
      data: {
        type: 'npc',
        persona: {
          personality: 'Barman, który słyszał wszystko.',
          motivations: 'Dotrwać do końca zmiany.',
          secrets: '',
          speechStyle: 'Krótko i bez emocji.',
          catchphrases: [],
        },
        knowledge: { world: 'Night City, 2045.', campaign: '', people: '', forbidden: '' },
        ...(knowledgeContext ? { knowledgeContext } : {}),
      },
    }),
  );
  return dataOf(
    await emitAck<BotView>(socket, 'bot:update', {
      botId: created.id,
      patch: { active: true, sceneId },
    }),
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
    payload: { name: 'Kampania wiedzy' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;
  campaignCollection = `campaign:${campaignId}`;

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
  sceneId = dataOf(await emitAck<SceneView>(gm.socket, 'scene:create', { name: 'Bar' })).id;
  await emitAck(gm.socket, 'scene:activate', { sceneId });
  gm.socket.disconnect();
}, 60_000);

beforeEach(async () => {
  gateway.up = true;
  gateway.refuseIndex = false;
  gateway.index.clear();
  gateway.searches = [];
  gateway.chatPrompts = [];
  gateway.answers = [];
  gateway.indexCalls = 0;

  // Czysta baza przed każdym testem — wpisy i boty zostawiane przez poprzednie
  // przypadki zmieniałyby wynik wyszukiwania w kolejnych.
  await built.prisma.knowledgeEntry.deleteMany({});
  await built.prisma.botProfile.deleteMany({});

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

describe('knowledge CRUD', () => {
  it('saves an entry, indexes it at once and tells the GM', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const broadcasts: KnowledgeUpsertBroadcast[] = [];
    gm.socket.on('knowledge:upsert', (payload: KnowledgeUpsertBroadcast) =>
      broadcasts.push(payload),
    );

    const entry = await addEntry(gm.socket, KLUB);

    expect(entry.title).toBe('Klub Afterlife');
    expect(entry.stale).toBe(false);
    expect(entry.indexedAt).not.toBeNull();
    expect(gateway.indexCalls).toBe(1);
    const broadcast = await until(() => broadcasts.at(-1));
    expect(broadcast.entry.id).toBe(entry.id);
    gm.socket.disconnect();
  });

  it('normalizes tags so a bot’s permission can ever match', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const entry = await addEntry(gm.socket, { ...KLUB, tags: ['Miejsca', 'WATSON', 'miejsca'] });
    expect(entry.tags).toEqual(['miejsca', 'watson']);
    gm.socket.disconnect();
  });

  it('refuses an entry with no title', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const ack = await emitAck(gm.socket, 'knowledge:upsert', { ...KLUB, title: '   ' });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toContain('INVALID_ENTRY');
    gm.socket.disconnect();
  });

  it('keeps the whole base away from players', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    await player.firstSync;
    const seen: unknown[] = [];
    player.socket.on('knowledge:upsert', (payload: unknown) => seen.push(payload));
    player.socket.on('knowledge:delete', (payload: unknown) => seen.push(payload));

    const entry = await addEntry(gm.socket, SEKRET);
    const listed = await emitAck<KnowledgeSyncPayload>(player.socket, 'knowledge:list');
    await emitAck(gm.socket, 'knowledge:delete', { id: entry.id });
    await sleep(120);

    expect(listed.ok).toBe(false);
    if (!listed.ok) expect(listed.error).toBe('FORBIDDEN');
    expect(seen).toEqual([]);
    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('a deleted entry stops being remembered', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const deletes: KnowledgeDeleteBroadcast[] = [];
    gm.socket.on('knowledge:delete', (payload: KnowledgeDeleteBroadcast) => deletes.push(payload));

    const entry = await addEntry(gm.socket, KLUB);
    expect(gateway.index.get(campaignCollection)!.size).toBe(1);

    await emitAck(gm.socket, 'knowledge:delete', { id: entry.id });

    expect(gateway.index.get(campaignCollection)!.size).toBe(0);
    await until(() => deletes.at(-1));
    gm.socket.disconnect();
  });

  it('a save with the gateway down keeps the entry and marks it stale', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    gateway.refuseIndex = true;

    const entry = await addEntry(gm.socket, KLUB);

    // Indeksowanie jest kopią, nie zapisem — nieudane nie może zgubić notatki MG.
    expect(entry.stale).toBe(true);
    expect(entry.indexedAt).toBeNull();
    const listed = dataOf(await emitAck<KnowledgeSyncPayload>(gm.socket, 'knowledge:list'));
    expect(listed.entries).toHaveLength(1);
    expect(listed.index.pending).toBe(1);
    gm.socket.disconnect();
  });

  it('reindex catches up the stale entries and prunes orphans', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    gateway.refuseIndex = true;
    await addEntry(gm.socket, KLUB);
    gateway.refuseIndex = false;

    // Sierota: dokument, którego nie ma już w bazie (skasowany przy leżącym gatewayu).
    collectionOf(campaignCollection).set('entry:zniknal', {
      source: 'entry:zniknal',
      text: 'Stary wpis',
      title: 'Stary wpis',
      tags: [],
      visibility: 'bots',
    });

    const status = dataOf(
      await emitAck<KnowledgeIndexStatus>(gm.socket, 'knowledge:reindex', undefined),
    );

    expect(status.pending).toBe(0);
    const documents = gateway.index.get(campaignCollection)!;
    expect([...documents.keys()]).not.toContain('entry:zniknal');
    expect(documents.size).toBe(1);
    gm.socket.disconnect();
  });

  it('reindexing twice adds nothing', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await addEntry(gm.socket, KLUB);
    await addEntry(gm.socket, SEKRET);

    await emitAck(gm.socket, 'knowledge:reindex', undefined);
    const first = gateway.index.get(campaignCollection)!.size;
    await emitAck(gm.socket, 'knowledge:reindex', undefined);

    expect(gateway.index.get(campaignCollection)!.size).toBe(first);
    expect(first).toBe(2);
    gm.socket.disconnect();
  });
});

describe('uprawnienia bota', () => {
  it('a bot with no context never even asks', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await addEntry(gm.socket, KLUB);
    const bot = await createBot(gm.socket, 'Barman', null);

    const preview = dataOf(
      await emitAck<KnowledgePreviewResult>(gm.socket, 'knowledge:preview', {
        botId: bot.id,
        message: 'Co wiesz o klubie Afterlife?',
      }),
    );

    // „Pusty zbiór = zachowanie z etapu 11" ma być darmowe: żadnego zapytania.
    expect(gateway.searches).toHaveLength(0);
    expect(preview.passages).toHaveLength(0);
    expect(preview.prompt).not.toContain('Co pamiętasz');
    expect(preview.reason).toContain('nie ma dostępu');
    gm.socket.disconnect();
  });

  it('a bot with the right tag recalls the entry', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await addEntry(gm.socket, KLUB);
    const bot = await createBot(gm.socket, 'Barman', {
      sources: ['campaign'],
      tags: ['miejsca'],
      topK: 3,
    });

    const preview = dataOf(
      await emitAck<KnowledgePreviewResult>(gm.socket, 'knowledge:preview', {
        botId: bot.id,
        message: 'Co wiesz o klubie Afterlife?',
      }),
    );

    expect(preview.passages.map((passage) => passage.title)).toEqual(['Klub Afterlife']);
    expect(preview.prompt).toContain('Co pamiętasz na ten temat');
    expect(preview.prompt).toContain('barman miesza drinki');
    expect(gateway.searches[0]).toMatchObject({ tags: ['miejsca'], visibility: ['bots'] });
    gm.socket.disconnect();
  });

  it('a fragment outside the bot’s tags never reaches the prompt', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await addEntry(gm.socket, KLUB);
    const bot = await createBot(gm.socket, 'Kurier', {
      sources: ['campaign'],
      tags: ['pojazdy'],
      topK: 3,
    });

    const preview = dataOf(
      await emitAck<KnowledgePreviewResult>(gm.socket, 'knowledge:preview', {
        botId: bot.id,
        message: 'Co wiesz o klubie Afterlife?',
      }),
    );

    expect(preview.passages).toHaveLength(0);
    expect(preview.prompt).not.toContain('barman miesza drinki');
    expect(preview.reason).toContain('Nic w bazie wiedzy nie pasuje');
    gm.socket.disconnect();
  });

  it('a „tylko MG" entry never reaches a bot, even with a matching tag', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await addEntry(gm.socket, SEKRET);
    const bot = await createBot(gm.socket, 'Barman', {
      sources: ['campaign'],
      tags: ['miejsca'],
      topK: 3,
    });

    const preview = dataOf(
      await emitAck<KnowledgePreviewResult>(gm.socket, 'knowledge:preview', {
        botId: bot.id,
        message: 'Kto sypie ekipę Militechowi?',
      }),
    );

    expect(preview.passages).toHaveLength(0);
    expect(preview.prompt).not.toContain('Militech');
    // Widoczność jedzie w zapytaniu, nie w obcinaniu wyników po fakcie.
    expect(gateway.searches[0]?.visibility).toEqual(['bots']);
    gm.socket.disconnect();
  });

  it('an edited entry shows up in the next answer without a restart', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const entry = await addEntry(gm.socket, KLUB);
    const bot = await createBot(gm.socket, 'Barman', {
      sources: ['campaign'],
      tags: ['miejsca'],
      topK: 3,
    });

    await addEntry(gm.socket, {
      id: entry.id,
      ...KLUB,
      body: 'Klub Afterlife spłonął w zeszłym tygodniu, został zwęglony szyld.',
    });
    const preview = dataOf(
      await emitAck<KnowledgePreviewResult>(gm.socket, 'knowledge:preview', {
        botId: bot.id,
        message: 'Co wiesz o klubie Afterlife?',
      }),
    );

    expect(preview.prompt).toContain('spłonął w zeszłym tygodniu');
    expect(preview.prompt).not.toContain('barman miesza drinki');
    gm.socket.disconnect();
  });
});

describe('bot na czacie', () => {
  it('answers from the knowledge base and leaves the GM a trace of what it used', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    await player.firstSync;
    const traces: BotTraceBroadcast[] = [];
    const playerTraces: BotTraceBroadcast[] = [];
    const messages: ChatMessageView[] = [];
    gm.socket.on('bot:trace', (trace: BotTraceBroadcast) => traces.push(trace));
    player.socket.on('bot:trace', (trace: BotTraceBroadcast) => playerTraces.push(trace));
    player.socket.on('chat:message', (broadcast: ChatMessageBroadcast) =>
      messages.push(broadcast.message),
    );

    await addEntry(gm.socket, KLUB);
    await createBot(gm.socket, 'Barman', { sources: ['campaign'], tags: ['miejsca'], topK: 3 });
    gateway.answers = ['Afterlife? Schodzisz do dawnej kliniki i pytasz o zlecenie.'];

    await emitAck(player.socket, 'chat:send', {
      text: 'Barman, co wiesz o klubie Afterlife?',
    });

    const trace = await until(() => traces.at(-1));
    expect(trace.knowledgeTitles).toEqual(['Klub Afterlife']);
    // Fragment naprawdę pojechał do modelu, nie tylko do śladu.
    expect(gateway.chatPrompts.at(-1)).toContain('barman miesza drinki');
    // Gracz dostaje samą wypowiedź — ślad jest diagnostyką MG.
    expect(playerTraces).toEqual([]);
    expect(messages.some((message) => message.text.includes('dawnej kliniki'))).toBe(true);
    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('a dead gateway leaves the bot answering from its profile', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await addEntry(gm.socket, KLUB);
    const bot = await createBot(gm.socket, 'Barman', {
      sources: ['campaign'],
      tags: ['miejsca'],
      topK: 3,
    });
    gateway.up = false;

    const ack = await emitAck<KnowledgePreviewResult>(gm.socket, 'knowledge:preview', {
      botId: bot.id,
      message: 'Co wiesz o klubie Afterlife?',
    });

    // Degradacja: brak wiedzy to nazwany powód w podglądzie, nie wyjątek.
    expect(ack.ok).toBe(true);
    if (ack.ok && ack.data) {
      expect(ack.data.passages).toHaveLength(0);
      expect(ack.data.prompt).toContain('Barman');
    }
    gm.socket.disconnect();
  });
});
