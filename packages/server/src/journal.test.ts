import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  BotRelationView,
  BotTraceBroadcast,
  BotView,
  CampaignSummary,
  ChatMessageBroadcast,
  CharacterView,
  HandoutView,
  InvitationSummary,
  JournalDeleteBroadcast,
  JournalDraftBroadcast,
  JournalEntryView,
  JournalErrorBroadcast,
  JournalIndexStatus,
  JournalPlayerSyncPayload,
  JournalPlayerUpsertBroadcast,
  JournalProgressBroadcast,
  JournalSyncPayload,
  JournalUpsertBroadcast,
  KnowledgePreviewResult,
  RelationSyncPayload,
  SceneView,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Dziennik kampanii, streszczanie sesji i relacje NPC↔postacie (etap 19c) na
 * żywych gniazdach.
 *
 * Gateway jest podstawiony, ale z prawdziwą semantyką: pamięciowy indeks filtruje
 * po widoczności i tagach, a `/chat` oddaje kolejne przygotowane odpowiedzi. Dwie
 * rzeczy są przez to sprawdzalne bez GPU — że log dłuższy niż kontekst naprawdę
 * dzieli się na porcje, i że relacja trafia do promptu wyłącznie przy rozmówcy,
 * którego dotyczy.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';

/**
 * Ciasny kontekst w atrapie jest treścią testu, nie skrótem: przy prawdziwych
 * 32k trzeba by wygenerować kilka tysięcy wypowiedzi, żeby wymusić drugą porcję.
 */
const CONTEXT_SIZE = 2048;

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
  collections?: string[];
  top_k: number;
  tags: string[];
  visibility: string[];
}

const gateway = {
  up: true,
  index: new Map<string, Map<string, IndexedDocument>>(),
  searches: [] as SearchBody[],
  chatPrompts: [] as string[],
  answers: [] as string[],
  /** Odpowiedź, gdy skończą się przygotowane — mapowanie ma ich wiele. */
  fallback: 'Notatka.',
};

function collectionOf(name: string): Map<string, IndexedDocument> {
  const existing = gateway.index.get(name);
  if (existing) return existing;
  const created = new Map<string, IndexedDocument>();
  gateway.index.set(name, created);
  return created;
}

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
      context_size: CONTEXT_SIZE,
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
    return Response.json({ count: Math.ceil(text.length / 4), context_size: CONTEXT_SIZE });
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
    // Etap 19c: zapytanie może objąć kilka kolekcji naraz.
    const scope = search.collections?.length ? search.collections : [search.collection];
    const documents = scope
      .flatMap((name) => [...collectionOf(name).values()])
      .filter((document) => matches(document, search));
    return Response.json({
      collection: scope.join(','),
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
    return new Response(sseStream(gateway.answers.shift() ?? gateway.fallback), {
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
let campaignId: string;
let sceneId: string;
let gmUserId: string;
let playerUserId: string;
let journalCollectionName: string;
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

/** Pierwsze takie zdarzenie po gnieździe — rozgłoszenia nie mają acku. */
function waitFor<T>(socket: ClientSocket, event: string, ms = 4000): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolvePromise(payload);
    });
  });
}

async function until<T>(check: () => T | undefined, ms = 8000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await sleep(25);
  }
}

/** Wypowiedzi wstawiane wprost do bazy — czat jest tu materiałem, nie testem. */
async function seedChat(
  lines: { speaker?: string; text: string; kind?: string }[],
): Promise<number[]> {
  const ids: number[] = [];
  for (const line of lines) {
    const row = await built.prisma.chatMessage.create({
      data: {
        campaignId,
        authorId: gmUserId,
        kind: line.kind ?? 'say',
        text: line.text,
        sceneId,
        ...(line.speaker ? { speakerName: line.speaker } : {}),
      },
      select: { id: true },
    });
    ids.push(row.id);
  }
  return ids;
}

async function summarize(
  socket: ClientSocket,
  payload: Record<string, unknown> = {},
): Promise<{ draft: JournalDraftBroadcast | undefined; error: JournalErrorBroadcast | undefined }> {
  let draft: JournalDraftBroadcast | undefined;
  let failure: JournalErrorBroadcast | undefined;
  socket.on('journal:draft', (broadcast: JournalDraftBroadcast) => (draft = broadcast));
  socket.on('journal:error', (broadcast: JournalErrorBroadcast) => (failure = broadcast));
  await emitAck(socket, 'journal:summarize', payload);
  await until(() => ((draft ?? failure) ? true : undefined));
  return { draft, error: failure };
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

async function createCharacter(
  socket: ClientSocket,
  name: string,
  ownerId: string | null,
): Promise<string> {
  const created = dataOf(
    await emitAck<CharacterView>(socket, 'character:create', {
      name,
      ...(ownerId ? { ownerId } : {}),
    }),
  );
  return created.id;
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
    payload: { name: 'Poligon' },
  });
  campaignId = (campaignRes.json() as CampaignSummary).id;
  journalCollectionName = `journal:${campaignId}`;

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

  const gm = await built.prisma.user.findFirstOrThrow({ where: { role: 'GM' } });
  gmUserId = gm.id;
  const player = await built.prisma.user.findFirstOrThrow({ where: { name: 'Johnny' } });
  playerUserId = player.id;

  const socket = createSocket(gmCookie);
  await socket.firstSync;
  sceneId = dataOf(await emitAck<SceneView>(socket.socket, 'scene:create', { name: 'Bar' })).id;
  await emitAck(socket.socket, 'scene:activate', { sceneId });
  socket.socket.disconnect();
}, 60_000);

beforeEach(async () => {
  gateway.up = true;
  gateway.index.clear();
  gateway.searches = [];
  gateway.chatPrompts = [];
  gateway.answers = [];

  await built.prisma.botRelation.deleteMany({});
  await built.prisma.journalEntry.deleteMany({});
  await built.prisma.handout.deleteMany({});
  await built.prisma.botProfile.deleteMany({});
  await built.prisma.character.deleteMany({});
  await built.prisma.chatMessage.deleteMany({});

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

describe('dziennik kampanii', () => {
  it('nowy wpis rodzi się jako „tylko MG" i od razu ląduje w indeksie', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;

    const entry = dataOf(
      await emitAck<JournalEntryView>(gm.socket, 'journal:upsert', {
        title: 'Sesja pierwsza',
        body: 'Ekipa weszła do składu Militechu.',
      }),
    );

    // Streszczenie zna całą sesję — do botów trafia dopiero po decyzji MG.
    expect(entry.visibility).toBe('gm');
    expect(entry.stale).toBe(false);
    expect(gateway.index.get(journalCollectionName)?.size).toBe(1);
    gm.socket.disconnect();
  });

  it('trzyma dziennik w innej kolekcji niż baza wiedzy', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await emitAck(gm.socket, 'journal:upsert', { title: 'Sesja', body: 'Treść' });
    await emitAck(gm.socket, 'knowledge:upsert', {
      title: 'Klub',
      body: 'Bar w Watson.',
      type: 'place',
      tags: [],
      visibility: 'bots',
    });

    expect([...gateway.index.keys()].sort()).toEqual(
      [`campaign:${campaignId}`, journalCollectionName].sort(),
    );
    gm.socket.disconnect();
  });

  it('skasowany wpis znika też z pamięci botów', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const entry = dataOf(
      await emitAck<JournalEntryView>(gm.socket, 'journal:upsert', {
        title: 'Sesja',
        body: 'Treść',
      }),
    );

    await emitAck(gm.socket, 'journal:delete', { id: entry.id });

    expect(gateway.index.get(journalCollectionName)?.size).toBe(0);
    gm.socket.disconnect();
  });

  it('reindeks dogania zaległości i zapomina sieroty', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await emitAck(gm.socket, 'journal:upsert', { title: 'Sesja', body: 'Treść' });
    collectionOf(journalCollectionName).set('session:znikla', {
      source: 'session:znikla',
      text: 'Stara sesja',
      title: 'Stara sesja',
      tags: [],
      visibility: 'gm',
    });

    const status = dataOf(
      await emitAck<JournalIndexStatus>(gm.socket, 'journal:reindex', undefined),
    );

    expect(status.pending).toBe(0);
    expect([...gateway.index.get(journalCollectionName)!.keys()]).not.toContain('session:znikla');
    gm.socket.disconnect();
  });

  it('reindeks rozsyła odświeżone wpisy, a nie sam licznik', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const entry = dataOf(
      await emitAck<JournalEntryView>(gm.socket, 'journal:upsert', {
        title: 'Sesja',
        body: 'Treść',
      }),
    );

    const broadcasts: JournalUpsertBroadcast[] = [];
    gm.socket.on('journal:upsert', (payload: JournalUpsertBroadcast) => broadcasts.push(payload));

    await emitAck<JournalIndexStatus>(gm.socket, 'journal:reindex', undefined);

    // Bez tego chip „nieaktualny" wisiałby na wierszu aż do przeładowania strony.
    const broadcast = await until(() => broadcasts.find((one) => one.entry.id === entry.id));
    expect(broadcast.entry.stale).toBe(false);
    expect(broadcast.index.pending).toBe(0);
    gm.socket.disconnect();
  });

  it('wpis nieodsłonięty nie dociera do gracza w żadnym payloadzie', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    await player.firstSync;
    const seen: unknown[] = [];
    player.socket.on('journal:upsert', (payload: unknown) => seen.push(payload));

    await emitAck(gm.socket, 'journal:upsert', { title: 'Sesja', body: 'Sekrety fabuły' });
    const listed = dataOf(await emitAck<JournalPlayerSyncPayload>(player.socket, 'journal:list'));
    await sleep(120);

    // Zakładka gracza istnieje od 24b, ale wpis „tylko MG" nie pojawia się
    // w niej nawet jako id — filtr stoi w zapytaniu, nie w widoku.
    expect(listed.entries).toEqual([]);
    expect(seen).toEqual([]);
    gm.socket.disconnect();
    player.socket.disconnect();
  });
});

describe('streszczanie sesji', () => {
  it('log dłuższy niż kontekst dzieli się na porcje i nie gubi końcówki', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    // ~120 wypowiedzi po ~60 znaków to grubo ponad ciasny kontekst atrapy.
    await seedChat(
      Array.from({ length: 120 }, (_, index) => ({
        speaker: index % 2 === 0 ? 'Vex' : 'Barman',
        text: `Zdanie numer ${index} o tym, co ekipa robiła w składzie Militechu.`,
      })),
    );
    const progress: JournalProgressBroadcast[] = [];
    gm.socket.on('journal:progress', (payload: JournalProgressBroadcast) => progress.push(payload));
    gateway.fallback = '- ekipa weszła do składu';

    const { draft } = await summarize(gm.socket);

    expect(draft).toBeDefined();
    expect(draft!.batches).toBeGreaterThan(1);
    expect(draft!.draft.lineCount).toBe(120);
    // Ostatnia wypowiedź musi trafić do którejś z porcji — kryterium „bez obcięcia".
    expect(gateway.chatPrompts.some((prompt) => prompt.includes('Zdanie numer 119'))).toBe(true);
    expect(gateway.chatPrompts.filter((prompt) => prompt.includes('Fragment 1 z')).length).toBe(1);
    expect(progress.some((entry) => entry.stage === 'map' && entry.total > 1)).toBe(true);
    gm.socket.disconnect();
  }, 30_000);

  it('rzuty kości i szepty nie wchodzą do streszczenia', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await seedChat([
      { speaker: 'Vex', text: 'Wchodzimy bocznym wejściem.' },
      { text: 'Rzut na Skradanie: 17', kind: 'roll' },
      { text: 'Mam klucz do serwerowni', kind: 'whisper' },
    ]);

    await summarize(gm.socket);

    const mapped = gateway.chatPrompts.find((prompt) => prompt.includes('Fragment 1 z')) ?? '';
    expect(mapped).toContain('Wchodzimy bocznym wejściem');
    expect(mapped).not.toContain('Rzut na Skradanie');
    expect(mapped).not.toContain('klucz do serwerowni');
    gm.socket.disconnect();
  }, 20_000);

  it('szkic niesie tytuł z modelu i nie zapisuje się sam', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await seedChat([{ speaker: 'Vex', text: 'Skończyliśmy robotę w składzie.' }]);
    gateway.answers = ['- skończyli robotę', 'Tytuł: Skok na skład\n\nEkipa skończyła robotę.'];

    const { draft } = await summarize(gm.socket);

    expect(draft!.draft.title).toBe('Skok na skład');
    expect(draft!.draft.body).toBe('Ekipa skończyła robotę.');
    // Dziennik zostaje pusty do czasu „Zapisz do dziennika".
    const listed = dataOf(await emitAck<JournalSyncPayload>(gm.socket, 'journal:list'));
    expect(listed.entries).toHaveLength(0);
    gm.socket.disconnect();
  }, 20_000);

  it('następne streszczenie zaczyna się tam, gdzie skończyło poprzednie', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const ids = await seedChat([
      { speaker: 'Vex', text: 'Pierwsza sesja: wchodzimy do składu.' },
      { speaker: 'Vex', text: 'Pierwsza sesja: wychodzimy ze skrzyniami.' },
    ]);
    const first = await summarize(gm.socket);
    expect(first.draft!.draft.throughMessageId).toBe(ids.at(-1));

    await emitAck(gm.socket, 'journal:upsert', {
      title: 'Sesja pierwsza',
      body: 'Weszli i wyszli.',
      throughMessageId: first.draft!.draft.throughMessageId,
      lineCount: first.draft!.draft.lineCount,
    });
    await seedChat([{ speaker: 'Vex', text: 'Druga sesja: spotkanie z fikserem.' }]);
    gateway.chatPrompts = [];

    const second = await summarize(gm.socket);

    expect(second.draft!.draft.lineCount).toBe(1);
    const mapped = gateway.chatPrompts.find((prompt) => prompt.includes('Fragment 1 z')) ?? '';
    expect(mapped).toContain('spotkanie z fikserem');
    expect(mapped).not.toContain('Pierwsza sesja');
    gm.socket.disconnect();
  }, 20_000);

  it('pusty log kończy się nazwanym powodem, nie pustym wpisem', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;

    const { error } = await summarize(gm.socket);

    expect(error?.code).toBe('JOURNAL_EMPTY_LOG');
    gm.socket.disconnect();
  }, 20_000);

  it('bez gatewaya odmawia od razu, zamiast udawać, że streszcza', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await seedChat([{ speaker: 'Vex', text: 'Cokolwiek.' }]);
    gateway.up = false;
    await emitAck(gm.socket, 'ai:refresh');

    const ack = await emitAck(gm.socket, 'journal:summarize', {});

    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('AI_UNAVAILABLE');
    gm.socket.disconnect();
  }, 20_000);
});

describe('propozycje relacji', () => {
  it('wyciąga propozycje ze streszczenia, ale ŻADNEJ nie zapisuje', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Barman', null);
    const vexId = await createCharacter(gm.socket, 'Vex', playerUserId);
    await seedChat([{ speaker: 'Vex', text: 'Zabieram kasę z baru i wychodzę.' }]);
    gateway.answers = [
      '- Vex okradł barmana',
      'Tytuł: Kradzież w barze\n\nVex okradł barmana na oczach gości.',
      'Barman | Vex | -2 | Okradł go na oczach gości',
    ];

    const { draft } = await summarize(gm.socket);

    expect(draft!.proposals).toEqual([
      {
        botId: bot.id,
        botName: 'Barman',
        characterId: vexId,
        characterName: 'Vex',
        value: -2,
        currentValue: 0,
        note: 'Okradł go na oczach gości',
      },
    ]);
    // Kryterium etapu: relacja zmienia się wyłącznie po kliknięciu MG.
    expect(await built.prisma.botRelation.count()).toBe(0);
    gm.socket.disconnect();
  }, 20_000);

  it('pomija NPC-ów i postacie, których model sobie wymyślił', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await createBot(gm.socket, 'Barman', null);
    await createCharacter(gm.socket, 'Vex', playerUserId);
    await seedChat([{ speaker: 'Vex', text: 'Rozmowa o niczym.' }]);
    gateway.answers = [
      '- nic',
      'Tytuł: Nic\n\nNic się nie stało.',
      ['Barman | Ktoś Nieznany | -2 | powód', 'Nikt Taki | Vex | +2 | powód'].join('\n'),
    ];

    const { draft } = await summarize(gm.socket);

    expect(draft!.proposals).toEqual([]);
    gm.socket.disconnect();
  }, 20_000);

  it('nie proponuje tego, co już jest zapisane', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Barman', null);
    const vexId = await createCharacter(gm.socket, 'Vex', playerUserId);
    await emitAck(gm.socket, 'relation:set', {
      botId: bot.id,
      characterId: vexId,
      value: -2,
      note: 'Okradł go',
    });
    await seedChat([{ speaker: 'Vex', text: 'Znowu w barze.' }]);
    gateway.answers = [
      '- nic nowego',
      'Tytuł: Nic\n\nVex wpadł do baru.',
      'Barman | Vex | -2 | Nadal go nie znosi',
    ];

    const { draft } = await summarize(gm.socket);

    expect(draft!.proposals).toEqual([]);
    gm.socket.disconnect();
  }, 20_000);
});

describe('relacje NPC↔postacie', () => {
  it('MG zapisuje relację, a gracze jej nie widzą', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    await player.firstSync;
    const seen: unknown[] = [];
    player.socket.on('relation:upsert', (payload: unknown) => seen.push(payload));

    const bot = await createBot(gm.socket, 'Barman', null);
    const vexId = await createCharacter(gm.socket, 'Vex', playerUserId);
    const relation = dataOf(
      await emitAck<BotRelationView>(gm.socket, 'relation:set', {
        botId: bot.id,
        characterId: vexId,
        value: -5,
        note: '  Okradł go  ',
      }),
    );

    // Skala jest zamknięta: −5 z UI (albo z modelu) schodzi do −3.
    expect(relation.value).toBe(-3);
    expect(relation.note).toBe('Okradł go');
    expect(relation.characterName).toBe('Vex');
    const listed = await emitAck<RelationSyncPayload>(player.socket, 'relation:list');
    expect(listed.ok).toBe(false);
    await sleep(100);
    expect(seen).toEqual([]);
    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('ustawienie tej samej pary nadpisuje, a nie dokłada', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Barman', null);
    const vexId = await createCharacter(gm.socket, 'Vex', playerUserId);

    await emitAck(gm.socket, 'relation:set', {
      botId: bot.id,
      characterId: vexId,
      value: -2,
      note: 'a',
    });
    await emitAck(gm.socket, 'relation:set', {
      botId: bot.id,
      characterId: vexId,
      value: 3,
      note: 'b',
    });

    const listed = dataOf(await emitAck<RelationSyncPayload>(gm.socket, 'relation:list'));
    expect(listed.relations).toHaveLength(1);
    expect(listed.relations[0]).toMatchObject({ value: 3, note: 'b' });
    gm.socket.disconnect();
  });

  it('usunięcie relacji zdejmuje ją z listy', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const bot = await createBot(gm.socket, 'Barman', null);
    const vexId = await createCharacter(gm.socket, 'Vex', playerUserId);
    await emitAck(gm.socket, 'relation:set', {
      botId: bot.id,
      characterId: vexId,
      value: 1,
      note: '',
    });

    await emitAck(gm.socket, 'relation:delete', { botId: bot.id, characterId: vexId });

    const listed = dataOf(await emitAck<RelationSyncPayload>(gm.socket, 'relation:list'));
    expect(listed.relations).toEqual([]);
    gm.socket.disconnect();
  });

  it('relacja wchodzi do promptu tylko przy rozmówcy, którego dotyczy', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    await player.firstSync;
    const traces: BotTraceBroadcast[] = [];
    gm.socket.on('bot:trace', (trace: BotTraceBroadcast) => traces.push(trace));

    const bot = await createBot(gm.socket, 'Barman', null);
    const vexId = await createCharacter(gm.socket, 'Vex', playerUserId);
    // Postać MG w tej samej kampanii — bot ma do niej inne nastawienie.
    const rico = await createCharacter(gm.socket, 'Rico', null);
    await emitAck(gm.socket, 'relation:set', {
      botId: bot.id,
      characterId: vexId,
      value: -3,
      note: 'Okradł go na oczach gości.',
    });
    await emitAck(gm.socket, 'relation:set', {
      botId: bot.id,
      characterId: rico,
      value: 3,
      note: 'Wyciągnął go z opresji.',
    });
    gateway.answers = ['Czego chcesz.'];

    await emitAck(player.socket, 'chat:send', { text: 'Barman, nalej coś.' });
    const trace = await until(() => traces.at(-1));

    expect(trace.relation).toEqual({ characterName: 'Vex', value: -3 });
    const prompt = gateway.chatPrompts.at(-1) ?? '';
    expect(prompt).toContain('Rozmawiasz z: Vex.');
    expect(prompt).toContain('zaprzysięgły wróg');
    // Nastawienie do CUDZEJ postaci nie ma prawa pojawić się w tym prompcie.
    // (Samo imię Rico w prompcie jest — to lista osób przy stole z etapu 11.)
    expect(prompt).not.toContain('Wyciągnął go z opresji');
    expect(prompt).not.toContain('oddany przyjaciel');
    gm.socket.disconnect();
    player.socket.disconnect();
  }, 20_000);

  it('bez zapisanej relacji prompt milczy o nastawieniu', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    await player.firstSync;
    const traces: BotTraceBroadcast[] = [];
    gm.socket.on('bot:trace', (trace: BotTraceBroadcast) => traces.push(trace));

    await createBot(gm.socket, 'Barman', null);
    await createCharacter(gm.socket, 'Vex', playerUserId);
    gateway.answers = ['Czego chcesz.'];

    await emitAck(player.socket, 'chat:send', { text: 'Barman, nalej coś.' });
    const trace = await until(() => traces.at(-1));

    expect(trace.relation).toBeUndefined();
    expect(gateway.chatPrompts.at(-1) ?? '').not.toContain('Z kim rozmawiasz');
    gm.socket.disconnect();
    player.socket.disconnect();
  }, 20_000);
});

describe('bot czyta dziennik', () => {
  it('wpis „tylko MG" nie dociera do bota, choćby miał uprawnienie', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await emitAck(gm.socket, 'journal:upsert', {
      title: 'Sesja pierwsza',
      body: 'Ekipa okradła skład Militechu i uciekła kanałami.',
      tags: ['sesje'],
      visibility: 'gm',
    });
    const bot = await createBot(gm.socket, 'Barman', {
      sources: ['journal'],
      tags: ['sesje'],
      topK: 3,
    });

    const preview = dataOf(
      await emitAck<KnowledgePreviewResult>(gm.socket, 'knowledge:preview', {
        botId: bot.id,
        message: 'Co słychać w składzie Militechu?',
      }),
    );

    expect(preview.passages).toHaveLength(0);
    expect(preview.prompt).not.toContain('kanałami');
    gm.socket.disconnect();
  });

  it('wpis udostępniony botom wraca jako jego pamięć', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await emitAck(gm.socket, 'journal:upsert', {
      title: 'Sesja pierwsza',
      body: 'Ekipa okradła skład Militechu i uciekła kanałami.',
      tags: ['sesje'],
      visibility: 'bots',
    });
    const bot = await createBot(gm.socket, 'Barman', {
      sources: ['journal'],
      tags: ['sesje'],
      topK: 3,
    });

    const preview = dataOf(
      await emitAck<KnowledgePreviewResult>(gm.socket, 'knowledge:preview', {
        botId: bot.id,
        message: 'Co słychać w składzie Militechu?',
      }),
    );

    expect(preview.prompt).toContain('kanałami');
    expect(gateway.searches.at(-1)?.collections).toEqual([journalCollectionName]);
    gm.socket.disconnect();
  });

  it('bot bez dziennika w źródłach nie pyta o tę kolekcję', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await emitAck(gm.socket, 'journal:upsert', {
      title: 'Sesja pierwsza',
      body: 'Ekipa okradła skład Militechu i uciekła kanałami.',
      tags: ['sesje'],
      visibility: 'bots',
    });
    const bot = await createBot(gm.socket, 'Barman', {
      sources: ['campaign'],
      tags: ['sesje'],
      topK: 3,
    });

    const preview = dataOf(
      await emitAck<KnowledgePreviewResult>(gm.socket, 'knowledge:preview', {
        botId: bot.id,
        message: 'Co słychać w składzie Militechu?',
      }),
    );

    expect(preview.prompt).not.toContain('kanałami');
    expect(gateway.searches.at(-1)?.collections).toEqual([`campaign:${campaignId}`]);
    gm.socket.disconnect();
  });

  it('bot z obydwoma źródłami szuka w nich JEDNYM zapytaniem', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await emitAck(gm.socket, 'journal:upsert', {
      title: 'Sesja pierwsza',
      body: 'Ekipa okradła skład Militechu i uciekła kanałami.',
      tags: ['sesje'],
      visibility: 'bots',
    });
    await emitAck(gm.socket, 'knowledge:upsert', {
      title: 'Skład Militechu',
      body: 'Magazyn przy dokach, pilnowany przez dwóch ochroniarzy.',
      type: 'place',
      tags: ['sesje'],
      visibility: 'bots',
    });
    const bot = await createBot(gm.socket, 'Barman', {
      sources: ['campaign', 'journal'],
      tags: ['sesje'],
      topK: 3,
    });
    gateway.searches = [];

    const preview = dataOf(
      await emitAck<KnowledgePreviewResult>(gm.socket, 'knowledge:preview', {
        botId: bot.id,
        message: 'Co słychać w składzie Militechu?',
      }),
    );

    // Jedno wyszukiwanie: fragmenty z obu źródeł konkurują o te same miejsca.
    expect(gateway.searches).toHaveLength(1);
    expect(gateway.searches[0]?.collections).toEqual([
      `campaign:${campaignId}`,
      journalCollectionName,
    ]);
    expect(preview.prompt).toContain('kanałami');
    expect(preview.prompt).toContain('dwóch ochroniarzy');
    gm.socket.disconnect();
  });
});

/**
 * Dziennik dla stołu (etap 24b) na żywych gniazdach.
 *
 * Testy pilnują dwóch granic, dla których ten etap istnieje: **wpis
 * nieodsłonięty nie dociera do gracza w żadnym payloadzie**, a **odnośnik do
 * materiału nie pokazuje nawet tytułu temu, komu MG tego materiału nie dał**.
 * Asercje czytają to, co naprawdę przyszło po gnieździe, nie to, co ukryłoby UI.
 */
describe('dziennik dla stołu (24b)', () => {
  const sharedIdsOf = async (socket: ClientSocket): Promise<string[]> =>
    dataOf(await emitAck<JournalPlayerSyncPayload>(socket, 'journal:list')).entries.map(
      (entry) => entry.id,
    );

  async function createHandout(socket: ClientSocket, title: string): Promise<string> {
    return dataOf(
      await emitAck<HandoutView>(socket, 'handout:upsert', {
        title,
        body: 'Treść materiału.',
        image: null,
      }),
    ).id;
  }

  it('odsłonięty wpis dociera do gracza — bez tagów, widoczności i stanu indeksu', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    await player.firstSync;
    const pushed = waitFor<JournalPlayerUpsertBroadcast>(player.socket, 'journal:upsert');

    const entry = dataOf(
      await emitAck<JournalEntryView>(gm.socket, 'journal:upsert', {
        title: 'Wjazd na Zaułek',
        body: 'Ekipa weszła bocznym wejściem.',
        tags: ['sesje'],
        visibility: 'bots',
        sharedWithPlayers: true,
      }),
    );
    expect(entry.sharedWithPlayers).toBe(true);

    const seen = (await pushed).entry;
    expect(seen.title).toBe('Wjazd na Zaułek');
    expect(seen.handouts).toEqual([]);
    // Tagi są językiem uprawnień botów, a `stale` sprawą gatewaya — po tamtej
    // stronie stołu nie ma ich czego szukać.
    expect(seen).not.toHaveProperty('tags');
    expect(seen).not.toHaveProperty('visibility');
    expect(seen).not.toHaveProperty('stale');
    expect(await sharedIdsOf(player.socket)).toEqual([entry.id]);

    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('zostawia jedną linię na czacie i tylko przy odsłonięciu', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    await player.firstSync;
    const line = waitFor<ChatMessageBroadcast>(player.socket, 'chat:message');

    const entry = dataOf(
      await emitAck<JournalEntryView>(gm.socket, 'journal:upsert', {
        title: 'Wjazd na Zaułek',
        body: 'Ekipa weszła bocznym wejściem.',
        sharedWithPlayers: true,
      }),
    );

    const message = (await line).message;
    expect(message.kind).toBe('journal');
    expect(message.journal).toEqual({
      entryId: entry.id,
      title: 'Wjazd na Zaułek',
      sessionDate: entry.sessionDate,
    });

    // Poprawka literówki w odsłoniętym wpisie nie jest odsłonięciem, więc nie
    // ma prawa zawiadamiać stołu drugi raz („udostępnienie jest zdarzeniem").
    const silence: unknown[] = [];
    player.socket.on('chat:message', (payload: unknown) => silence.push(payload));
    await emitAck(gm.socket, 'journal:upsert', {
      id: entry.id,
      title: 'Wjazd na Zaułek',
      body: 'Ekipa weszła bocznym wejściem, po cichu.',
      sharedWithPlayers: true,
    });
    await sleep(150);
    expect(silence).toEqual([]);

    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('zdjęcie ze stołu zabiera wpis graczowi bez przeładowania', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    await player.firstSync;

    const entry = dataOf(
      await emitAck<JournalEntryView>(gm.socket, 'journal:upsert', {
        title: 'Sesja',
        body: 'Treść',
        sharedWithPlayers: true,
      }),
    );
    expect(await sharedIdsOf(player.socket)).toEqual([entry.id]);

    const revoked = waitFor<JournalDeleteBroadcast>(player.socket, 'journal:delete');
    await emitAck(gm.socket, 'journal:upsert', {
      id: entry.id,
      title: 'Sesja',
      body: 'Treść',
      sharedWithPlayers: false,
    });

    expect((await revoked).id).toBe(entry.id);
    expect(await sharedIdsOf(player.socket)).toEqual([]);

    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('usunięcie wpisu znika też graczowi', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    await player.firstSync;

    const entry = dataOf(
      await emitAck<JournalEntryView>(gm.socket, 'journal:upsert', {
        title: 'Sesja',
        body: 'Treść',
        sharedWithPlayers: true,
      }),
    );
    const gone = waitFor<JournalDeleteBroadcast>(player.socket, 'journal:delete');
    await emitAck(gm.socket, 'journal:delete', { id: entry.id });

    expect((await gone).id).toBe(entry.id);
    expect(await sharedIdsOf(player.socket)).toEqual([]);

    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('gracz czyta kronikę, ale jej nie pisze', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    await player.firstSync;
    const entry = dataOf(
      await emitAck<JournalEntryView>(gm.socket, 'journal:upsert', {
        title: 'Sesja',
        body: 'Treść',
        sharedWithPlayers: true,
      }),
    );

    expect(
      await emitAck(player.socket, 'journal:upsert', { title: 'Moja wersja', body: 'x' }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await emitAck(player.socket, 'journal:delete', { id: entry.id })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await emitAck(player.socket, 'journal:summarize', {})).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await sharedIdsOf(player.socket)).toEqual([entry.id]);

    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('odnośnik do materiału widzi tylko gracz, któremu MG go dał', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    await player.firstSync;

    const handoutId = await createHandout(gm.socket, 'Mapa Zaułka');
    const entry = dataOf(
      await emitAck<JournalEntryView>(gm.socket, 'journal:upsert', {
        title: 'Wjazd na Zaułek',
        body: 'Plan był na mapie.',
        sharedWithPlayers: true,
        handoutIds: [handoutId],
      }),
    );
    // MG widzi przypięcie od razu.
    expect(entry.handouts).toEqual([{ id: handoutId, title: 'Mapa Zaułka', hasImage: false }]);

    // Gracz bez udostępnienia nie dostaje nawet tytułu materiału.
    const before = dataOf(await emitAck<JournalPlayerSyncPayload>(player.socket, 'journal:list'));
    expect(before.entries[0]?.handouts).toEqual([]);

    // Udostępnienie handoutu odświeża odnośnik bez przeładowywania zakładki.
    const linked = waitFor<JournalPlayerUpsertBroadcast>(player.socket, 'journal:upsert');
    await emitAck(gm.socket, 'handout:share', { id: handoutId, userIds: [playerUserId] });
    expect((await linked).entry.handouts).toEqual([
      { id: handoutId, title: 'Mapa Zaułka', hasImage: false },
    ]);

    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('usunięcie materiału zdejmuje odnośnik graczowi', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    await player.firstSync;

    const handoutId = await createHandout(gm.socket, 'Mapa Zaułka');
    await emitAck(gm.socket, 'handout:share', { id: handoutId, userIds: [playerUserId] });
    // Na to rozgłoszenie trzeba poczekać, zanim nasłuchujemy następnego: ack MG
    // wraca wcześniej, niż gniazdo gracza zdąży odebrać swoją kopię.
    const linked = waitFor<JournalPlayerUpsertBroadcast>(player.socket, 'journal:upsert');
    await emitAck<JournalEntryView>(gm.socket, 'journal:upsert', {
      title: 'Wjazd na Zaułek',
      body: 'Plan był na mapie.',
      sharedWithPlayers: true,
      handoutIds: [handoutId],
    });
    expect((await linked).entry.handouts).toHaveLength(1);

    const updated = waitFor<JournalPlayerUpsertBroadcast>(player.socket, 'journal:upsert');
    await emitAck(gm.socket, 'handout:delete', { id: handoutId });
    expect((await updated).entry.handouts).toEqual([]);

    gm.socket.disconnect();
    player.socket.disconnect();
  });

  it('odrzuca przypięcie materiału spoza kampanii', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const ack = await emitAck(gm.socket, 'journal:upsert', {
      title: 'Sesja',
      body: 'Treść',
      handoutIds: ['nie-ma-takiego'],
    });
    expect(ack).toEqual({ ok: false, error: 'UNKNOWN_HANDOUT' });
    gm.socket.disconnect();
  });

  it('MG dostaje listę materiałów do przypięcia, gracz nie', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const player = createSocket(playerCookie);
    await player.firstSync;
    await createHandout(gm.socket, 'Mapa Zaułka');

    const gmView = dataOf(await emitAck<JournalSyncPayload>(gm.socket, 'journal:list'));
    expect(gmView.handouts.map((handout) => handout.title)).toEqual(['Mapa Zaułka']);
    // Kształt gracza nie ma tego pola w ogóle — nie jest ono „puste", tylko go nie ma.
    const playerView = dataOf(
      await emitAck<JournalPlayerSyncPayload>(player.socket, 'journal:list'),
    );
    expect(playerView).not.toHaveProperty('handouts');
    expect(playerView).not.toHaveProperty('index');

    gm.socket.disconnect();
    player.socket.disconnect();
  });
});
