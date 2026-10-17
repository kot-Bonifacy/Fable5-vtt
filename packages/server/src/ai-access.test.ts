import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  AiAccessView,
  AiErrorBroadcast,
  AiStatus,
  AiStatusBroadcast,
  CampaignSummary,
  OwnerAiState,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import { aiAccessReasonText } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';
import { TEST_ADMIN, adminCookie } from './test-admin.js';
import { AiAccess, aiEntitlement, pickLeaseHolder, type AiCampaignEntry } from './ai/access.js';
import type { AiGateway } from './ai/gateway.js';
import type { PrismaClient } from './db.js';
import { botFailureText } from './realtime/bot-runtime.js';

/**
 * Etap 44d — AI właściciela: prawo kampanii do AI (zgoda, przełącznik,
 * obecność), karencja 2 min (tu skrócona), dzierżawa jednej sesji naraz i jej
 * przekazanie, „Przejmij AI”, cofnięcie bez restartu, przerwanie strumienia po
 * utracie prawa i licznik żądań na atrapie gatewaya. Kanarek: prośby nie
 * słyszy nikt poza administratorem (etap 53; do 53 — kontami właściciela).
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const GRACE_MS = 400;

const config: ServerConfig = {
  port: 0,
  host: '127.0.0.1',
  clientOrigin: 'http://localhost:5173',
  databaseUrl: `file:${TEST_DB}`,
  gmName: 'MG',
  gmPassword: GM_PASSWORD,
  ...TEST_ADMIN,
  cookieSecret: 'test-cookie-secret',
  sessionTtlDays: 1,
  uploadsDir: mkdtempSync(join(tmpdir(), 'vtt-uploads-')),
  dataPublicDir: resolve(import.meta.dirname, '../../../data/public'),
  dataPrivateDir: resolve(import.meta.dirname, 'fixtures/no-private-data'),
  aiGatewayUrl: 'http://gateway.test',
  aiGatewayApiKey: '',
  aiHealthIntervalMs: 200,
  aiRequestTimeoutMs: 5000,
  aiOwnerGraceMs: GRACE_MS,
  sessions: { maxSessions: 2, emptyMinutes: 15, idleMinutes: 180 },
};

/* ------------------------- atrapa gatewaya ------------------------- */

/** Każde żądanie poza `/health` — to ma zostać zerem dla kampanii bez prawa. */
const gateway = {
  requests: [] as string[],
  /** `/chat` wisi po pierwszym kawałku, aż ktoś przerwie połączenie. */
  hang: false,
};

function sse(events: { event: string; data: unknown }[], hang: boolean, signal?: AbortSignal) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const { event, data } of events) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }
      if (!hang) {
        controller.close();
        return;
      }
      signal?.addEventListener('abort', () => controller.error(signal.reason));
    },
  });
}

const aiFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.endsWith('/health')) {
    return Response.json({
      status: 'ok',
      llama: 'ready',
      model: 'test.gguf',
      context_size: 8192,
      queue_length: 0,
      busy: false,
      managed: true,
      restarts: 0,
      last_error: null,
      gpu: null,
    });
  }
  gateway.requests.push(new URL(url).pathname);
  if (url.endsWith('/chat')) {
    const events = gateway.hang
      ? [{ event: 'delta', data: { text: 'Zaczynam…' } }]
      : [
          { event: 'delta', data: { text: 'Odpowiedź.' } },
          { event: 'done', data: { usage: null } },
        ];
    return new Response(sse(events, gateway.hang, init?.signal ?? undefined), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }
  return Response.json({ detail: 'nie w tym teście' }, { status: 503 });
};

/* ----------------------------- pomocnicy ---------------------------- */

let built: BuiltApp;
let baseUrl: string;
const openSockets: ClientSocket[] = [];
let addressCounter = 1;

let ownerGm: string;
let campaignA: string;
let marek: string;
let mgB: string;
let mgBUserId: string;
let campaignB: string;
let kuba: string;
/** Konto gracza właściciela w kampanii MG-B — flaga po „To konto właściciela”. */
let ownerPlayer: string;
/** Administrator (etap 53) — od niego są decyzje o AI, przełącznik i „Przejmij”. */
let admin: string;

function cookieOf(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error('missing set-cookie header');
  return raw.split(';')[0]!;
}

function nextEvent<T>(socket: ClientSocket, event: string, timeoutMs = 4000): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolvePromise(payload);
    });
  });
}

/** Gniazdo administratora — bez stołu, więc bez `state:sync`; czeka na samo połączenie. */
async function adminSocket(): Promise<ClientSocket> {
  const socket = ioClient(baseUrl, {
    extraHeaders: { cookie: admin },
    reconnection: false,
    timeout: 3000,
  });
  openSockets.push(socket);
  await new Promise<void>((resolvePromise, reject) => {
    socket.once('connect', () => resolvePromise());
    socket.once('connect_error', reject);
  });
  return socket;
}

async function seated(cookie: string): Promise<{ socket: ClientSocket; sync: StateSyncPayload }> {
  const socket = ioClient(baseUrl, {
    extraHeaders: { cookie },
    reconnection: false,
    timeout: 3000,
  });
  openSockets.push(socket);
  const sync = await nextEvent<StateSyncPayload>(socket, 'state:sync');
  return { socket, sync };
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 5000);
    socket.emit(event, payload, (ack: SocketAck<T>) => {
      clearTimeout(timer);
      resolvePromise(ack);
    });
  });
}

/** Ostatni status AI, jaki gniazdo dostało — z `state:sync` i z `ai:status`. */
function trackStatus(socket: ClientSocket, initial: AiStatus): () => AiStatus {
  let last = initial;
  socket.on('ai:status', (broadcast: AiStatusBroadcast) => {
    last = broadcast.status;
  });
  return () => last;
}

async function until(check: () => boolean, ms = 3000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > ms) throw new Error('condition timeout');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
}

const settle = () => new Promise((resolvePromise) => setTimeout(resolvePromise, 150));

function recordAll(socket: ClientSocket): { event: string; payload: string }[] {
  const heard: { event: string; payload: string }[] = [];
  socket.onAny((event: string, ...args: unknown[]) =>
    heard.push({ event, payload: JSON.stringify(args) }),
  );
  return heard;
}

function disconnectAll(): void {
  for (const socket of openSockets.splice(0)) socket.disconnect();
}

async function rest<T>(
  cookie: string,
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  payload?: unknown,
): Promise<{ status: number; body: T }> {
  const res = await built.app.inject({
    method,
    url,
    headers: { cookie },
    ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
    remoteAddress: '10.44.4.1',
  });
  return { status: res.statusCode, body: res.json() as T };
}

async function createCampaign(cookie: string, name: string): Promise<string> {
  const res = await rest<CampaignSummary>(cookie, 'POST', '/api/campaigns', { name });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function joinPlayer(campaignId: string, name: string): Promise<string> {
  const res = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, name),
  });
  expect(res.statusCode).toBe(200);
  return cookieOf(res.headers['set-cookie']);
}

async function setSharing(on: boolean): Promise<OwnerAiState> {
  const res = await rest<OwnerAiState>(admin, 'POST', '/api/admin/ai/sharing', { on });
  expect(res.status).toBe(200);
  return res.body;
}

async function decide(decision: 'grant' | 'reject' | 'revoke'): Promise<number> {
  return (await rest(admin, 'POST', `/api/admin/ai/requests/${mgBUserId}`, { decision })).status;
}

async function sessionOf(cookie: string, campaignId: string, start: boolean): Promise<void> {
  const { socket } = await seated(cookie);
  const ack = await emitAck(socket, start ? 'session:start' : 'session:end', { campaignId });
  expect(ack.ok).toBe(true);
  socket.disconnect();
}

/** Prośba, zgoda i przełącznik — stan „MG-B ma prawo”, gdy właściciel siedzi. */
async function grantAndShare(): Promise<void> {
  await rest(mgB, 'POST', '/api/ai-access/request');
  const status = (await built.prisma.user.findUniqueOrThrow({ where: { id: mgBUserId } })).aiAccess;
  if (status !== 'granted') expect(await decide('grant')).toBe(200);
  await setSharing(true);
}

/* ------------------------------ przebieg ---------------------------- */

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: 'pipe',
  });
  built = await buildApp(config, { logger: false, aiFetch, sweepUploads: false });
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const address = built.app.server.address();
  if (address === null || typeof address === 'string') throw new Error('no server address');
  baseUrl = `http://127.0.0.1:${address.port}`;

  const login = await built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: 'MG', password: GM_PASSWORD },
  });
  ownerGm = cookieOf(login.headers['set-cookie']);
  admin = await adminCookie(built);
  campaignA = await createCampaign(ownerGm, 'Ulice Night City');
  marek = await joinPlayer(campaignA, 'Marek');

  addressCounter += 1;
  const reg = await built.app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { login: 'bartek', password: 'dlugie-haslo-1', repeat: 'dlugie-haslo-1' },
    remoteAddress: `10.44.5.${addressCounter}`,
  });
  mgB = cookieOf(reg.headers['set-cookie']);
  mgBUserId = (await built.prisma.user.findUniqueOrThrow({ where: { login: 'bartek' } })).id;
  campaignB = await createCampaign(mgB, 'Pustkowia');
  kuba = await joinPlayer(campaignB, 'Kuba');
  ownerPlayer = await joinPlayer(campaignB, 'Wlasciciel');

  // Gateway zdrowy, zanim cokolwiek zapyta.
  await until(() => built.realtime.deps.ctx.ai.gateway.getStatus().available);
}, 60_000);

beforeEach(async () => {
  disconnectAll();
  await settle();
  gateway.requests = [];
  gateway.hang = false;
  // Każdy przypadek zaczyna bez sesji, bez zgody i z wyłączonym przełącznikiem.
  for (const id of [campaignA, campaignB]) {
    await built.prisma.campaign.update({ where: { id }, data: { sessionStartedAt: null } });
  }
  await built.prisma.user.update({
    where: { id: mgBUserId },
    data: { aiAccess: null, aiRequestedAt: null, aiDecidedAt: null },
  });
  const ai = built.realtime.deps.ctx.ai;
  await ai.refresh();
  // Karta właściciela z poprzedniego przypadku jest zamknięta — bez czekania karencji.
  ai.expireGrace();
  ai.setSharing(false);
});

afterAll(async () => {
  disconnectAll();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

/* -------------------------- logika bez sieci ------------------------ */

function entry(patch: Partial<AiCampaignEntry> & { id: string }): AiCampaignEntry {
  return {
    name: patch.id,
    gmLogin: 'x',
    ownerCampaign: false,
    granted: false,
    sessionStartedAt: null,
    ...patch,
  };
}

describe('prawo do AI — wszystkie kombinacje warunków', () => {
  it('kampania właściciela ma prawo zawsze, inna tylko przy zgodzie, obecności i przełączniku', () => {
    const own = entry({ id: 'a', ownerCampaign: true });
    for (const sharing of [false, true]) {
      for (const ownerPresent of [false, true]) {
        expect(aiEntitlement(own, { sharing, ownerPresent })).toBeNull();
        for (const granted of [false, true]) {
          const other = entry({ id: 'b', granted });
          const expected = !granted
            ? 'no-consent'
            : !ownerPresent
              ? 'owner-absent'
              : !sharing
                ? 'sharing-off'
                : null;
          expect(aiEntitlement(other, { sharing, ownerPresent })).toBe(expected);
        }
      }
    }
  });

  it('dzierżawa: posiadacz zostaje, potem najwcześniej rozpoczęta uprawniona sesja', () => {
    const all = [
      entry({ id: 'a', ownerCampaign: true, sessionStartedAt: 300 }),
      entry({ id: 'b', granted: true, sessionStartedAt: 100 }),
      entry({ id: 'c', granted: true, sessionStartedAt: 200 }),
      entry({ id: 'd', granted: true }),
    ];
    const everyone = () => true;
    expect(pickLeaseHolder(all, null, everyone)).toBe('b');
    expect(pickLeaseHolder(all, 'a', everyone)).toBe('a');
    // Posiadacz bez sesji (przygotowanie) nie trzyma AI.
    expect(pickLeaseHolder(all, 'd', everyone)).toBe('b');
    // Utrata prawa przekazuje dalej.
    expect(pickLeaseHolder(all, 'b', (e) => e.id !== 'b')).toBe('c');
    expect(pickLeaseHolder(all, null, () => false)).toBeNull();
  });

  it('nieudana tura bota po odebraniu AI mówi powód, a nie „model zajęty”', () => {
    const busy = aiAccessReasonText('busy');
    expect(botFailureText('AI_UNAVAILABLE', busy)).toBe(`${busy} Zagraj tę turę ręką.`);
    expect(botFailureText('AI_UNAVAILABLE', 'kolejka pełna')).toContain('Model jest zajęty');
  });
});

describe('jedna brama przed gatewayem', () => {
  it('kod gry nie sięga po gateway inaczej niż przez bramę kampanii', () => {
    // Zdrowie gatewaya jest serwera, nie kampanii — to jedyne dozwolone wyjątki.
    const allowed = new Set([
      'realtime/ai.ts: await deps.ctx.ai.gateway.checkHealth();',
      'realtime/index.ts: ctx.ai.gateway.onStatusChange(() => broadcastAiStatus(deps));',
    ]);
    const found: string[] = [];
    const root = resolve(import.meta.dirname);
    for (const dir of ['realtime', 'routes', '.']) {
      for (const name of readdirSync(join(root, dir))) {
        if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
        const text = readFileSync(join(root, dir, name), 'utf8');
        for (const line of text.split(/\r?\n/)) {
          if (
            /\.gateway\b|new AiGateway|ctx\.ai\.(streamChat|searchRules|indexDocuments)/.test(line)
          ) {
            const where = `${dir === '.' ? '' : `${dir}/`}${name}: ${line.trim()}`;
            if (!allowed.has(where) && !where.startsWith('app.ts:')) found.push(where);
          }
        }
      }
    }
    expect(found).toEqual([]);
  });
});

describe('RAG — kolekcje per kampania', () => {
  it('zapytanie kampanii nie czyta cudzej kolekcji, zapis do cudzej nie wychodzi', async () => {
    const seen: { search: string[][]; index: string[] } = { search: [], index: [] };
    const fake = {
      getStatus: () => ({ available: true }),
      searchRules: async (_q: string, _k: number, scope: string[]) => {
        seen.search.push(scope);
        return { ok: true, result: { passages: [], tookMs: 1 } };
      },
      indexDocuments: async (collection: string) => {
        seen.index.push(collection);
        return { ok: true, result: { chunks: 0, documents: 0 } };
      },
    } as unknown as AiGateway;
    const prisma = {
      campaign: {
        findMany: async () => [
          {
            id: 'A',
            name: 'A',
            sessionStartedAt: null,
            gm: { login: 'mg', name: 'MG', owner: true, aiAccess: null, blockedAt: null },
          },
        ],
      },
    } as unknown as PrismaClient;
    const access = new AiAccess(prisma, fake, { ownerGraceMs: 1000, requestTimeoutMs: 1000 });
    await access.refresh();
    const ai = access.forCampaign('A');

    await ai.searchRules('kto', 3, [
      'campaign:A',
      'journal:A',
      'campaign:B',
      'journal:B',
      'rulebook',
    ]);
    expect(seen.search).toEqual([['campaign:A', 'journal:A', 'rulebook']]);
    const foreign = await ai.indexDocuments('campaign:B', []);
    expect(foreign.ok).toBe(false);
    expect(seen.index).toEqual([]);
    expect((await ai.indexDocuments('campaign:A', [])).ok).toBe(true);
    expect(seen.index).toEqual(['campaign:A']);
    access.stop();
  });
});

/* ---------------------------- na serwerze --------------------------- */

describe('bez prawa do AI nic nie wychodzi do gatewaya', () => {
  it('bez zgody: boty MG-B niedostępne z powodem, gracz wie tylko „niedostępne”, licznik zero', async () => {
    // Właściciel obecny i udostępnia — brakuje wyłącznie zgody.
    await seated(ownerGm);
    await setSharing(true);
    const b = await seated(mgB);
    expect(b.sync.ai.available).toBe(false);
    expect(b.sync.ai.reason).toBe('no-consent');
    const player = await seated(kuba);
    expect(player.sync.ai.available).toBe(false);
    expect(player.sync.ai).not.toHaveProperty('reason');
    expect(player.sync.ai).not.toHaveProperty('model');

    expect(await emitAck(b.socket, 'ai:ask', { prompt: 'Halo?' })).toEqual({
      ok: false,
      error: 'AI_UNAVAILABLE',
    });
    expect(await emitAck(b.socket, 'rules:ask', { question: 'Ile kosztuje granat?' })).toEqual({
      ok: false,
      error: 'AI_UNAVAILABLE',
    });
    const bot = await emitAck<{ id: string }>(b.socket, 'bot:create', { name: 'Paser' });
    expect(bot.ok).toBe(true);
    if (!bot.ok || !bot.data) throw new Error('bot:create');
    expect(
      await emitAck(b.socket, 'bot:chat', { botId: bot.data.id, message: 'Masz coś dla mnie?' }),
    ).toEqual({ ok: false, error: 'AI_UNAVAILABLE' });
    // Baza wiedzy zapisuje się w bazie, ale do indeksu nie idzie nic.
    const knowledge = await emitAck(b.socket, 'knowledge:upsert', {
      title: 'Kanarek B',
      body: 'Sekret kampanii B.',
      type: 'place',
      tags: [],
      visibility: 'bots',
    });
    expect(knowledge.ok).toBe(true);
    await emitAck(b.socket, 'knowledge:reindex');
    await emitAck(b.socket, 'journal:reindex');
    const rules = await emitAck<{ reason: string | null }>(b.socket, 'rules:status');
    expect(rules.ok && rules.data?.reason).toBe(aiAccessReasonText('no-consent'));
    await settle();
    expect(gateway.requests).toEqual([]);

    // Kampania właściciela w tym samym czasie pyta normalnie.
    const a = await seated(ownerGm);
    expect(a.sync.ai.available).toBe(true);
    expect((await emitAck(a.socket, 'ai:ask', { prompt: 'Test' })).ok).toBe(true);
    await until(() => gateway.requests.includes('/chat'));
  });
});

describe('prośba i panel administratora', () => {
  it('prośbę widzi wyłącznie administrator — konta właściciela już nie (etap 53)', async () => {
    // Konto gracza właściciela w kampanii MG-B łączy się hasłem właściciela —
    // od etapu 53 to już tylko obecność dla „Udostępniam AI”.
    expect(
      (await rest(ownerPlayer, 'POST', '/api/auth/owner-link', { login: 'mg', password: 'zle' }))
        .status,
    ).toBe(401);
    expect(
      (
        await rest(ownerPlayer, 'POST', '/api/auth/owner-link', {
          login: 'MG',
          password: GM_PASSWORD,
        })
      ).status,
    ).toBe(200);
    // Zwykły gracz i MG nie łączą się w ten sposób.
    expect(
      (await rest(mgB, 'POST', '/api/auth/owner-link', { login: 'MG', password: GM_PASSWORD }))
        .status,
    ).toBe(403);
    // Panelu AI nie dostaje nikt poza administratorem — także konto MG właściciela.
    for (const cookie of [mgB, kuba, ownerGm, ownerPlayer]) {
      expect((await rest(cookie, 'GET', '/api/admin/ai')).status).toBe(403);
      expect((await rest(cookie, 'POST', '/api/admin/ai/sharing', { on: true })).status).toBe(403);
      expect(
        (await rest(cookie, 'POST', `/api/admin/ai/requests/${mgBUserId}`, { decision: 'grant' }))
          .status,
      ).toBe(403);
    }

    const adminLive = await adminSocket();
    const b = await seated(mgB);
    const others = [
      b,
      await seated(kuba),
      await seated(marek),
      await seated(ownerGm),
      await seated(ownerPlayer),
    ];
    const heard = others.map((entry) => recordAll(entry.socket));
    const adminPush = nextEvent<OwnerAiState>(adminLive, 'ai-access:owner');
    const mine = nextEvent<AiAccessView>(b.socket, 'ai-access:mine');

    const requested = await rest<AiAccessView>(mgB, 'POST', '/api/ai-access/request');
    expect(requested.body.status).toBe('requested');
    const push = await adminPush;
    expect(push.pending).toBe(1);
    expect(push.requests[0]).toMatchObject({ login: 'bartek', status: 'requested' });
    expect((await mine).status).toBe('requested');
    await settle();
    // Kanarek: login proszącego nie trafia do nikogo poza administratorem
    // (MG-B dostaje tylko własny stan, bez cudzych loginów).
    for (const record of heard) {
      expect(record.filter((entry) => entry.event === 'ai-access:owner')).toEqual([]);
      expect(record.some((entry) => entry.payload.includes('"login":"bartek"'))).toBe(false);
    }
    const fromAdmin = await rest<OwnerAiState>(admin, 'GET', '/api/admin/ai');
    expect(fromAdmin.status).toBe(200);
    expect(fromAdmin.body.pending).toBe(1);

    // Odrzucenie, ponowna prośba, zatwierdzenie; zła decyzja w złym stanie — 409.
    expect(await decide('reject')).toBe(200);
    expect(await decide('revoke')).toBe(409);
    expect((await rest<AiAccessView>(mgB, 'GET', '/api/ai-access')).body.status).toBe('rejected');
    expect((await rest<AiAccessView>(mgB, 'POST', '/api/ai-access/request')).body.status).toBe(
      'requested',
    );
    expect(await decide('grant')).toBe(200);
    expect((await rest<AiAccessView>(mgB, 'GET', '/api/ai-access')).body.status).toBe('granted');
    // Właściciel nie prosi sam siebie.
    expect((await rest(ownerGm, 'POST', '/api/ai-access/request')).status).toBe(409);
  });

  it('administrator nadaje AI także bez prośby MG (etap 53)', async () => {
    expect((await rest<AiAccessView>(mgB, 'GET', '/api/ai-access')).body.status).toBe('none');
    expect(await decide('reject')).toBe(409);
    expect(await decide('grant')).toBe(200);
    expect((await rest<AiAccessView>(mgB, 'GET', '/api/ai-access')).body.status).toBe('granted');
  });

  it('gniazdo administratora to obecność właściciela, ale nie siada przy stole', async () => {
    expect(await decide('grant')).toBe(200);
    const b = await seated(mgB);
    const status = trackStatus(b.socket, b.sync.ai);
    expect(status().reason).toBe('owner-absent');

    const adminLive = await adminSocket();
    const heard = recordAll(adminLive);
    await until(() => status().reason === 'sharing-off');
    await setSharing(true);
    await until(() => status().available);
    await settle();
    // Żadnego stanu gry: ani `state:sync`, ani zdarzeń stołu.
    expect(heard.map((entry) => entry.event)).not.toContain('state:sync');
    expect(heard.some((entry) => entry.event.startsWith('chat:'))).toBe(false);
  });
});

describe('zgoda, przełącznik i obecność właściciela', () => {
  it('zgoda + przełącznik + obecność = boty MG-B odpowiadają; karencja wyłącza przełącznik', async () => {
    await rest(mgB, 'POST', '/api/ai-access/request');
    expect(await decide('grant')).toBe(200);
    // Właściciel nieobecny (nikt z flagą nie siedzi).
    const b = await seated(mgB);
    const status = trackStatus(b.socket, b.sync.ai);
    expect(status().reason).toBe('owner-absent');

    // Wchodzi kontem gracza — obecny, ale przełącznik wyłączony.
    const ownerAsPlayer = await seated(ownerPlayer);
    await until(() => status().reason === 'sharing-off');
    await setSharing(true);
    await until(() => status().available);
    expect(status().reason).toBeNull();
    expect((await emitAck(b.socket, 'ai:ask', { prompt: 'Teraz?' })).ok).toBe(true);
    await until(() => gateway.requests.includes('/chat'));

    // F5 w karencji: przełącznik zostaje.
    ownerAsPlayer.socket.disconnect();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, GRACE_MS / 3));
    await seated(ownerPlayer);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, GRACE_MS));
    expect(status().available).toBe(true);

    // Zamknięcie ostatniej karty: po karencji boty gasną, przełącznik wyłączony.
    disconnectAllExcept(b.socket);
    await settle();
    expect(status().available).toBe(true);
    await until(() => status().reason === 'owner-absent', GRACE_MS * 5);
    expect(built.realtime.deps.ctx.ai.sharingOn()).toBe(false);
    // Nowe wejście zaczyna od „nie udostępniam”.
    await seated(ownerGm);
    await until(() => status().reason === 'sharing-off');
    gateway.requests = [];
    expect(await emitAck(b.socket, 'ai:ask', { prompt: 'A teraz?' })).toEqual({
      ok: false,
      error: 'AI_UNAVAILABLE',
    });
    await settle();
    expect(gateway.requests).toEqual([]);
  });
});

function disconnectAllExcept(keep: ClientSocket): void {
  for (const socket of openSockets.splice(0)) {
    if (socket === keep) openSockets.push(socket);
    else socket.disconnect();
  }
}

describe('dzierżawa AI', () => {
  it('pierwsza sesja trzyma AI, koniec przekazuje drugiej, „Przejmij” odbiera bez cofania zgody', async () => {
    await seated(ownerGm);
    await grantAndShare();
    const b = await seated(mgB);
    const status = trackStatus(b.socket, b.sync.ai);
    // Nikt nie trzyma AI — przygotowanie MG-B może pytać.
    expect(b.sync.ai.available).toBe(true);
    expect((await rest(admin, 'POST', '/api/admin/ai/take')).body).toEqual({
      error: 'NO_OWN_SESSION',
    });

    await sessionOf(ownerGm, campaignA, true);
    await until(() => status().reason === 'busy');
    let owner = await rest<OwnerAiState>(admin, 'GET', '/api/admin/ai');
    expect(owner.body.lease).toMatchObject({ campaignId: campaignA, own: true });
    expect(owner.body.canTakeOver).toBe(false);

    // MG-B zaczyna sesję — AI dalej u pierwszej.
    expect((await emitAck(b.socket, 'session:start', { campaignId: campaignB })).ok).toBe(true);
    await settle();
    expect(status().reason).toBe('busy');
    gateway.requests = [];
    expect(await emitAck(b.socket, 'ai:ask', { prompt: '?' })).toEqual({
      ok: false,
      error: 'AI_UNAVAILABLE',
    });

    // Koniec sesji właściciela przekazuje AI sesji MG-B.
    await sessionOf(ownerGm, campaignA, false);
    await until(() => status().available);
    expect(gateway.requests).toEqual([]);
    // Właściciel wraca do gry — AI zostaje u MG-B (pierwszy, a nie ważniejszy).
    await sessionOf(ownerGm, campaignA, true);
    await settle();
    expect(status().available).toBe(true);
    owner = await rest<OwnerAiState>(admin, 'GET', '/api/admin/ai');
    expect(owner.body.lease).toMatchObject({
      campaignId: campaignB,
      gmLogin: 'bartek',
      own: false,
    });
    expect(owner.body.canTakeOver).toBe(true);

    // „Przejmij AI”.
    const taken = await rest<OwnerAiState>(admin, 'POST', '/api/admin/ai/take');
    expect(taken.status).toBe(200);
    expect(taken.body.lease).toMatchObject({ campaignId: campaignA, own: true });
    await until(() => status().reason === 'busy');
    expect((await rest<AiAccessView>(mgB, 'GET', '/api/ai-access')).body.status).toBe('granted');
    // Koniec sesji właściciela oddaje AI z powrotem.
    await sessionOf(ownerGm, campaignA, false);
    await until(() => status().available);
  });

  it('odebranie AI w trakcie strumienia kończy go błędem, a cofnięcie działa bez restartu', async () => {
    await seated(ownerGm);
    await grantAndShare();
    const b = await seated(mgB);
    const status = trackStatus(b.socket, b.sync.ai);
    expect((await emitAck(b.socket, 'session:start', { campaignId: campaignB })).ok).toBe(true);
    await until(() => status().available);

    gateway.hang = true;
    const failed = nextEvent<AiErrorBroadcast>(b.socket, 'ai:error');
    expect((await emitAck(b.socket, 'ai:ask', { prompt: 'Opowiadaj…' })).ok).toBe(true);
    await until(() => gateway.requests.includes('/chat'));

    expect(await decide('revoke')).toBe(200);
    const error = await failed;
    expect(error.code).toBe('AI_UNAVAILABLE');
    expect(error.detail).toBe(aiAccessReasonText('no-consent'));
    await until(() => status().reason === 'no-consent');

    gateway.requests = [];
    gateway.hang = false;
    expect(await emitAck(b.socket, 'ai:ask', { prompt: 'Jeszcze raz?' })).toEqual({
      ok: false,
      error: 'AI_UNAVAILABLE',
    });
    await settle();
    expect(gateway.requests).toEqual([]);
  });

  it('wyłączenie przełącznika odbiera AI sesji MG-B, kampanii właściciela nie', async () => {
    await seated(ownerGm);
    await grantAndShare();
    const b = await seated(mgB);
    const status = trackStatus(b.socket, b.sync.ai);
    await until(() => status().available);
    await setSharing(false);
    await until(() => status().reason === 'sharing-off');
    const a = await seated(ownerGm);
    expect(a.sync.ai.available).toBe(true);
  });
});
