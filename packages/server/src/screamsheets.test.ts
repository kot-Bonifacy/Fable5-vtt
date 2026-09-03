import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  ChatMessageBroadcast,
  HandoutLogEntry,
  HandoutSyncPayload,
  HandoutView,
  InvitationSummary,
  ScreamsheetDraftBroadcast,
  ScreamsheetErrorBroadcast,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Screamsheety na żywych gniazdach (etap 24c).
 *
 * Atrapa gatewaya oddaje przygotowany artykuł, więc sprawdzalne bez GPU jest
 * to, co w tym etapie naprawdę może się zepsuć: że hasło MG dociera do promptu,
 * że szkic **nie zapisuje się sam** (treść modelu nie ma prawa dojść do graczy
 * bez decyzji MG), że rodzaj handoutu przeżywa zapis i udostępnienie, i że
 * z martwym gatewayem odmowa wraca kodem, który klient umie powiedzieć po
 * polsku. Jakość samego tekstu mierzy się przy stole, nie tutaj.
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

const gateway = {
  up: true,
  prompts: [] as string[],
  answers: [] as string[],
  fallback: [
    'NAGŁÓWEK: Krwawa noc w Kabuki',
    'LEAD: Trzy ciała przed klubem, NCPD milczy.',
    'TREŚĆ:',
    'Strzelanina zaczęła się tuż po drugiej w nocy.',
  ].join('\n'),
};

function sseStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send('start', { reasoning: false });
      send('delta', { text });
      send('done', { usage: { completion_tokens: 120, generation_ms: 1500 } });
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
  if (url.endsWith('/chat')) {
    const payload = JSON.parse(String(init?.body ?? '{}')) as {
      messages: { content: string }[];
      temperature?: number;
    };
    gateway.prompts.push(payload.messages.map((message) => message.content).join('\n---\n'));
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
let playerId: string;
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

function waitFor<T>(socket: ClientSocket, event: string, ms = 5000): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolvePromise(payload);
    });
  });
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

function data<T>(ack: SocketAck<T>, what: string): T {
  if (!ack.ok) throw new Error(`${what} failed: ${ack.error}`);
  if (ack.data === undefined) throw new Error(`${what} returned no data`);
  return ack.data;
}

let gmSocket: ClientSocket;
let playerSocket: ClientSocket;

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
    payload: { name: 'Poligon' },
  });
  const campaignId = (campaign.json() as CampaignSummary).id;

  const invite = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const token = (invite.json() as InvitationSummary).token;
  const joined = await built.app.inject({
    method: 'POST',
    url: `/api/join/${token}`,
    payload: { name: 'Vex' },
  });
  playerCookie = cookieOf(joined.headers['set-cookie']);
  playerId = (joined.json() as { user: { id: string } }).user.id;

  const gm = createSocket(gmCookie);
  gmSocket = gm.socket;
  await gm.firstSync;
  const player = createSocket(playerCookie);
  playerSocket = player.socket;
  await player.firstSync;
  // Zdrowie gatewaya sprawdza się w tle — pierwsze zapytanie idzie przy starcie.
  await new Promise((done) => setTimeout(done, 100));
}, 60_000);

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await built?.app.close();
  try {
    unlinkSync(TEST_DB.replace('./', ''));
  } catch {
    /* plik testowy mógł już zniknąć */
  }
});

beforeEach(() => {
  gateway.up = true;
  gateway.prompts.length = 0;
  gateway.answers.length = 0;
});

describe('screamsheet:generate', () => {
  it('pisze artykuł z hasła MG i oddaje go jako szkic', async () => {
    const draftPromise = waitFor<ScreamsheetDraftBroadcast>(gmSocket, 'screamsheet:draft');
    const ack = await emitAck<{ requestId: string }>(gmSocket, 'screamsheet:generate', {
      topic: 'strzelanina w Kabuki',
      outlet: 'NET-54',
    });
    expect(ack.ok).toBe(true);

    const broadcast = await draftPromise;
    expect(broadcast.requestId).toBe(data(ack, 'screamsheet:generate').requestId);
    expect(broadcast.draft.headline).toBe('Krwawa noc w Kabuki');
    expect(broadcast.draft.lead).toBe('Trzy ciała przed klubem, NCPD milczy.');
    expect(broadcast.draft.body).toContain('Strzelanina zaczęła się');

    const prompt = gateway.prompts.at(-1) ?? '';
    expect(prompt).toContain('strzelanina w Kabuki');
    expect(prompt).toContain('NET-54');
    // Nazwa kampanii wchodzi do promptu — brukowiec ma pisać o tym stole.
    expect(prompt).toContain('Poligon');
  });

  it('nie zapisuje niczego — szkic czeka na decyzję MG', async () => {
    const before = await emitAck<HandoutSyncPayload>(gmSocket, 'handout:list');
    const countBefore = data(before, 'handout:list').handouts.length;

    const draftPromise = waitFor<ScreamsheetDraftBroadcast>(gmSocket, 'screamsheet:draft');
    await emitAck(gmSocket, 'screamsheet:generate', { topic: 'nalot na Watson' });
    await draftPromise;

    const after = await emitAck<HandoutSyncPayload>(gmSocket, 'handout:list');
    expect(data(after, 'handout:list').handouts).toHaveLength(countBefore);
  });

  it('bez hasła nie pyta modelu', async () => {
    const ack = await emitAck(gmSocket, 'screamsheet:generate', { topic: '   ' });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('EMPTY_TOPIC');
    expect(gateway.prompts).toHaveLength(0);
  });

  it('gracz nie pisze screamsheetów', async () => {
    const ack = await emitAck(playerSocket, 'screamsheet:generate', { topic: 'cokolwiek' });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('FORBIDDEN');
  });

  it('z pustej odpowiedzi modelu robi błąd, a nie pusty formularz', async () => {
    gateway.answers.push('   ');
    const errorPromise = waitFor<ScreamsheetErrorBroadcast>(gmSocket, 'screamsheet:error');
    await emitAck(gmSocket, 'screamsheet:generate', { topic: 'cisza w eterze' });
    const broadcast = await errorPromise;
    expect(broadcast.code).toBe('AI_ERROR');
  });

  it('czyta odpowiedź modelu, który zgubił etykiety', async () => {
    gateway.answers.push(
      'Ogień w Watson\nSpłonął magazyn Militechu.\nStraż przyjechała po godzinie.',
    );
    const draftPromise = waitFor<ScreamsheetDraftBroadcast>(gmSocket, 'screamsheet:draft');
    await emitAck(gmSocket, 'screamsheet:generate', { topic: 'pożar' });
    const broadcast = await draftPromise;
    expect(broadcast.draft.headline).toBe('Ogień w Watson');
    expect(broadcast.draft.lead).toBe('Spłonął magazyn Militechu.');
    expect(broadcast.draft.body).toBe('Straż przyjechała po godzinie.');
  });
});

describe('screamsheet jako handout', () => {
  it('przeżywa zapis, udostępnienie i dociera do gracza z meblami gazety', async () => {
    const saved = await emitAck<HandoutView>(gmSocket, 'handout:upsert', {
      title: 'Krwawa noc w Kabuki',
      body: 'NCPD milczy.',
      image: null,
      kind: 'screamsheet',
      screamsheet: {
        lead: 'Trzech martwych przed klubem.',
        outlet: 'NET-54',
        dateline: 'Night City, 12 września 2045',
      },
    });
    expect(saved.ok).toBe(true);
    const handout = data(saved, 'handout:upsert');
    expect(handout.kind).toBe('screamsheet');
    expect(handout.screamsheet?.outlet).toBe('NET-54');

    const openPromise = waitFor<{ handout: HandoutView }>(playerSocket, 'handout:open');
    const chatPromise = waitFor<ChatMessageBroadcast>(playerSocket, 'chat:message');
    const shared = await emitAck<HandoutView>(gmSocket, 'handout:share', {
      id: handout.id,
      userIds: [playerId],
    });
    expect(shared.ok).toBe(true);

    const open = await openPromise;
    expect(open.handout.kind).toBe('screamsheet');
    expect(open.handout.screamsheet?.lead).toBe('Trzech martwych przed klubem.');
    // Reguła z 24a stoi dalej: gracz nie wie, komu jeszcze MG to pokazał.
    expect(open.handout.sharedWith).toBeUndefined();

    const chat = await chatPromise;
    const entry = chat.message.handout as HandoutLogEntry;
    expect(entry.kind).toBe('screamsheet');
  });

  it('odrzuca gazetę bez artykułu', async () => {
    const ack = await emitAck(gmSocket, 'handout:upsert', {
      title: 'Pusta pierwsza strona',
      body: '   ',
      image: null,
      kind: 'screamsheet',
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toContain('Screamsheet musi mieć treść artykułu');
  });

  it('uzupełnia brakującą winietę i datę wartościami domyślnymi', async () => {
    const ack = await emitAck<HandoutView>(gmSocket, 'handout:upsert', {
      title: 'Bez winiety',
      body: 'Treść.',
      image: null,
      kind: 'screamsheet',
      screamsheet: { lead: '', outlet: '', dateline: '' },
    });
    expect(ack.ok).toBe(true);
    const handout = data(ack, 'handout:upsert');
    expect(handout.screamsheet?.outlet).toBe('WIADOMOŚCI NIGHT CITY');
    expect(handout.screamsheet?.dateline).toBe('Night City, wrzesień 2045');
  });

  it('zwykły handout zostaje notatką bez mebli gazety', async () => {
    const ack = await emitAck<HandoutView>(gmSocket, 'handout:upsert', {
      title: 'Notatka fixera',
      body: 'Spotkanie o 22:00.',
      image: null,
    });
    expect(ack.ok).toBe(true);
    const handout = data(ack, 'handout:upsert');
    expect(handout.kind).toBe('note');
    expect(handout.screamsheet).toBeNull();
  });
});

describe('degradacja bez gatewaya', () => {
  it('odmawia generacji, gdy gateway leży', async () => {
    gateway.up = false;
    // Status odświeża się cyklicznie; tu wymuszamy odczyt zdrowia od razu.
    await emitAck(gmSocket, 'ai:refresh');
    const ack = await emitAck(gmSocket, 'screamsheet:generate', { topic: 'strzelanina w Kabuki' });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('AI_UNAVAILABLE');
  });

  it('ręczny screamsheet zapisuje się i bez modelu', async () => {
    gateway.up = false;
    const ack = await emitAck<HandoutView>(gmSocket, 'handout:upsert', {
      title: 'Napisane ręką MG',
      body: 'Cała treść od Mistrza Gry.',
      image: null,
      kind: 'screamsheet',
      screamsheet: { lead: 'Bez modelu.', outlet: 'NET-54', dateline: '2045' },
    });
    expect(ack.ok).toBe(true);
    expect(data(ack, 'handout:upsert').kind).toBe('screamsheet');
  });
});
