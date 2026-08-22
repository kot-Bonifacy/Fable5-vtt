import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  AiStatus,
  BotActionProposal,
  BotActionTraceBroadcast,
  BotPlayTurnResult,
  BotView,
  CampaignSummary,
  CharacterView,
  ChatMessageBroadcast,
  ChatMessageView,
  CombatView,
  CpredCharacterData,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Etap 20b — tura bota w walce, na żywych gniazdach.
 *
 * Atrapa gatewaya odpowiada dokładnie tym, co skryptuje test — łącznie
 * z odpowiedziami, których prawdziwa gramatyka nigdy by nie wypuściła. To jest
 * cały sens tego pliku: gramatyka jest pierwszym bezpiecznikiem, a te przypadki
 * przypinają drugi, czyli kod. Kryterium etapu brzmi wprost: „Bot nie jest
 * w stanie wykonać nielegalnej akcji — potwierdzone testem z wymuszoną złą
 * odpowiedzią LLM".
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
/** Scena ma 100 px na kratkę i 2 m na kratkę — 1 m = 50 px. */
const PX_PER_M = 50;

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

type ChatBody = {
  messages: { role: string; content: string }[];
  json_schema: Record<string, unknown> | null;
};

const gateway = { up: true, answers: [] as string[], bodies: [] as ChatBody[] };

function sseStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send('start', { reasoning: false });
      for (const part of text.match(/.{1,16}/gs) ?? []) send('delta', { text: part });
      send('done', { usage: { prompt_tokens: 90, completion_tokens: 14, generation_ms: 55 } });
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
    return new Response(sseStream(gateway.answers.shift() ?? '{"akcja":"pas","powod":"."}'), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }
  return new Response('not found', { status: 404 });
};

let built: BuiltApp;
let baseUrl: string;
let gmCookie: string;
let campaignId: string;
let playerId: string;
let sceneId: string;
let characterId: string;
let botTokenId: string;
let enemyTokenId: string;
let allyTokenId: string;
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
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 8000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolve(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

function data<T>(ack: SocketAck<T>, what: string): T {
  if (!ack.ok || ack.data === undefined) throw new Error(`${what} failed: ${JSON.stringify(ack)}`);
  return ack.data;
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

async function until<T>(check: () => T | undefined, ms = 6000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await sleep(25);
  }
}

/** Bot prowadzący figurę Kai — wiązanie idzie przez kartę postaci. */
async function createBot(
  socket: ClientSocket,
  patch: Record<string, unknown> = {},
): Promise<BotView> {
  const created = data(
    await emitAck<BotView>(socket, 'bot:create', {
      name: 'Kolec',
      data: { type: 'npc', knowledge: { world: '', campaign: '', people: '', forbidden: '' } },
    }),
    'bot:create',
  );
  return data(
    await emitAck<BotView>(socket, 'bot:update', {
      botId: created.id,
      patch: { active: true, sceneId, characterId, ...patch },
    }),
    'bot:update',
  );
}

function decision(body: Record<string, unknown>): string {
  return JSON.stringify(body);
}

/** Stawia figurę bota i wroga w danej odległości od siebie, na jednej linii. */
async function place(socket: ClientSocket, tokenId: string, metres: number): Promise<void> {
  await emitAck(socket, 'token:move', {
    tokenId,
    x: metres * PX_PER_M,
    y: 0,
    final: true,
  });
}

/** Tracker, jak widzi go MG — jedzie w `state:sync`, nie ma własnego zapytania. */
async function combatOf(socket: ClientSocket): Promise<CombatView> {
  const sync = new Promise<StateSyncPayload>((resolve) =>
    socket.once('state:sync', (payload: StateSyncPayload) => resolve(payload)),
  );
  await emitAck(socket, 'state:request');
  const combat = (await sync).combat;
  if (!combat) throw new Error('no combat in sync');
  return combat;
}

/** Zaczyna walkę tak, że tura należy do bota. */
async function startFight(socket: ClientSocket): Promise<CombatView> {
  await emitAck(socket, 'combat:start', {
    sceneId,
    tokenIds: [botTokenId, enemyTokenId, allyTokenId],
  });
  const combat = await combatOf(socket);
  for (const row of combat.combatants) {
    await emitAck(socket, 'combat:set-initiative', {
      combatantId: row.id,
      initiative: row.tokenId === botTokenId ? 20 : 5,
    });
  }
  // Runda 1 zaczyna się od najwyższej inicjatywy, czyli od figury bota.
  return data(await emitAck<CombatView>(socket, 'combat:next'), 'combat:next');
}

async function endFight(socket: ClientSocket): Promise<void> {
  await emitAck(socket, 'combat:end', { sceneId });
}

/** Naboje w magazynku Kai — karta jest wspólna dla całego zestawu. */
async function ammoOf(): Promise<number> {
  const character = await built.prisma.character.findUnique({ where: { id: characterId } });
  const sheet = JSON.parse(character!.data) as CpredCharacterData;
  return sheet.weapons.find((row) => row.id === 'w-pistol')?.ammoCurrent ?? -1;
}

/** Świeży widok tokenu — po ruchu bota pozycja jest w bazie, nie w teście. */
async function tokenOf(socket: ClientSocket, tokenId: string): Promise<TokenView> {
  const sync = new Promise<StateSyncPayload>((resolve) =>
    socket.once('state:sync', (payload: StateSyncPayload) => resolve(payload)),
  );
  await emitAck(socket, 'state:request');
  const token = (await sync).tokens.find((row) => row.id === tokenId);
  if (!token) throw new Error('token missing from sync');
  return token;
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
    payload: { name: 'Poligon botów' },
  });
  campaignId = (campaign.json() as CampaignSummary).id;

  const invite = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const join = await built.app.inject({
    method: 'POST',
    url: `/api/join/${(invite.json() as { token: string }).token}`,
    payload: { name: 'Rico' },
  });
  const me = await built.app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { cookie: cookieOf(join.headers['set-cookie']) },
  });
  playerId = (me.json() as { user: { id: string } }).user.id;

  const gm = createSocket(gmCookie);
  await gm.firstSync;

  const scene = data(
    await emitAck<SceneView>(gm.socket, 'scene:create', { name: 'Hala' }),
    'scene',
  );
  sceneId = scene.id;
  await emitAck(gm.socket, 'scene:update', { sceneId, patch: { width: 8000, height: 2000 } });
  // Bez mgły: ten zestaw bada widoczność figury bota (ściany), nie pędzel MG.
  await emitAck(gm.socket, 'scene:visibility', { sceneId, visibility: 'open' });
  await emitAck(gm.socket, 'scene:activate', { sceneId });

  const character = data(
    await emitAck<CharacterView>(gm.socket, 'character:create', { name: 'Kaya' }),
    'character:create',
  );
  characterId = character.id;
  await emitAck(gm.socket, 'character:update', {
    characterId,
    patch: {
      data: {
        stats: { ...(character.data as CpredCharacterData).stats, ref: 6, dex: 5, move: 6 },
        skills: { handgun: 5, evasion: 3 },
        weapons: [
          {
            id: 'w-pistol',
            name: 'Zgrzyt 9',
            notes: '',
            compendiumId: 'weapon.zgrzyt-9',
            damage: '2k6',
            ammoCurrent: 10,
            ammoMax: 10,
            ammoType: '',
            rof: '2',
          },
        ],
      },
    },
  });

  const bot = data(
    await emitAck<TokenView>(gm.socket, 'token:create', {
      sceneId,
      name: 'Kaya',
      x: 0,
      y: 0,
      characterId,
    }),
    'token:create',
  );
  botTokenId = bot.id;
  const enemy = data(
    await emitAck<TokenView>(gm.socket, 'token:create', {
      sceneId,
      name: 'Rico',
      x: 600,
      y: 0,
      ownerId: playerId,
    }),
    'token:create',
  );
  enemyTokenId = enemy.id;
  const ally = data(
    await emitAck<TokenView>(gm.socket, 'token:create', { sceneId, name: 'Vex', x: 200, y: 0 }),
    'token:create',
  );
  allyTokenId = ally.id;
  gm.socket.disconnect();
}, 60_000);

beforeEach(async () => {
  gateway.up = true;
  gateway.answers = [];
  gateway.bodies = [];
  await built.prisma.chatMessage.deleteMany({});
  await built.prisma.botProfile.deleteMany({});
  await built.prisma.wall.deleteMany({});
  const gm = createSocket(gmCookie);
  await gm.firstSync;
  await emitAck<AiStatus>(gm.socket, 'ai:refresh');
  await emitAck(gm.socket, 'combat:end', { sceneId }).catch(() => undefined);
  await emitAck(gm.socket, 'scene:visibility', { sceneId, visibility: 'open' });
  await place(gm.socket, botTokenId, 0);
  await place(gm.socket, enemyTokenId, 12);
  await place(gm.socket, allyTokenId, 4);
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

describe('tactical state', () => {
  it('sends the visible figures as an enum, not as free text', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await createBot(gm.socket, { data: { autonomy: 'auto' } });
    await startFight(gm.socket);
    gateway.answers = [decision({ akcja: 'pas', cel: 'Rico', bron: 'Zgrzyt 9', powod: 'Czekam.' })];

    await emitAck<BotPlayTurnResult>(gm.socket, 'bot:play-turn', { tokenId: botTokenId });

    const schema = gateway.bodies.at(-1)!.json_schema as {
      properties: { cel: { enum: string[] }; akcja: { enum: string[] } };
      required: string[];
    };
    expect(schema.properties.cel.enum).toEqual(expect.arrayContaining(['Rico', 'Vex']));
    expect(schema.properties.akcja.enum).toContain('atak');
    // Lekcja z 20a: pole opcjonalne 9B pomija, więc oba są wymagane zawsze.
    expect(schema.required).toEqual(['akcja', 'cel', 'bron', 'powod']);
    await endFight(gm.socket);
    gm.socket.disconnect();
  });

  it('measures the distances for the model instead of sending coordinates', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await createBot(gm.socket, { data: { autonomy: 'auto' } });
    await startFight(gm.socket);
    gateway.answers = [decision({ akcja: 'pas', cel: 'Rico', bron: 'Zgrzyt 9', powod: '.' })];

    await emitAck(gm.socket, 'bot:play-turn', { tokenId: botTokenId });

    const system = gateway.bodies.at(-1)!.messages[0]!.content;
    expect(system).toContain('Rico — przeciwnik · 12 m');
    expect(system).toContain('Vex — sojusznik · 4 m');
    expect(system).toContain('Zgrzyt 9');
    await endFight(gm.socket);
    gm.socket.disconnect();
  });

  // Widoczność liczona per token, nie per gracz — punkt zakresu etapu. Bot
  // działa kontem MG, które widzi wszystko, więc bez tego strzelałby przez mur.
  it('leaves out a figure its own token cannot see', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await emitAck(gm.socket, 'scene:visibility', { sceneId, visibility: 'dynamic' });
    // Ściana w poprzek hali, między Kayą a Rikiem (Vex zostaje po tej stronie).
    await emitAck(gm.socket, 'wall:create', {
      sceneId,
      points: [
        { x: 400, y: 0 },
        { x: 400, y: 1600 },
      ],
      kind: 'wall',
    });
    await createBot(gm.socket, { data: { autonomy: 'auto' } });
    await startFight(gm.socket);
    gateway.answers = [decision({ akcja: 'pas', cel: 'Vex', bron: 'Zgrzyt 9', powod: '.' })];

    await emitAck(gm.socket, 'bot:play-turn', { tokenId: botTokenId });

    const schema = gateway.bodies.at(-1)!.json_schema as {
      properties: { cel: { enum: string[] } };
    };
    expect(schema.properties.cel.enum).toContain('Vex');
    expect(schema.properties.cel.enum).not.toContain('Rico');
    await endFight(gm.socket);
    gm.socket.disconnect();
  });

  it('drops the attack from the menu once the Action is gone', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await createBot(gm.socket, { data: { autonomy: 'auto' } });
    await startFight(gm.socket);
    gateway.answers = [
      decision({ akcja: 'atak', cel: 'Rico', bron: 'Zgrzyt 9', powod: 'Strzelam.' }),
      decision({ akcja: 'pas', cel: 'Rico', bron: 'Zgrzyt 9', powod: 'Koniec.' }),
    ];

    await emitAck(gm.socket, 'bot:play-turn', { tokenId: botTokenId });

    // Drugi krok tury widzi już wydaną Akcję.
    const second = gateway.bodies.at(-1)!.json_schema as {
      properties: { akcja: { enum: string[] } };
    };
    expect(second.properties.akcja.enum).not.toContain('atak');
    expect(gateway.bodies.at(-1)!.messages[0]!.content).toContain('Akcja: wykorzystana');
    await endFight(gm.socket);
    gm.socket.disconnect();
  });
});

describe('automat', () => {
  it('shoots through the ordinary attack path, and the card looks ordinary', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    await createBot(gm.socket, { data: { autonomy: 'auto' } });
    await startFight(gm.socket);
    gateway.answers = [
      decision({ akcja: 'atak', cel: 'Rico', bron: 'Zgrzyt 9', powod: 'Strzelam do wroga.' }),
      decision({ akcja: 'pas', cel: 'Rico', bron: 'Zgrzyt 9', powod: 'Koniec tury.' }),
    ];

    const ack = data(
      await emitAck<BotPlayTurnResult>(gm.socket, 'bot:play-turn', { tokenId: botTokenId }),
      'bot:play-turn',
    );

    expect(ack.outcome).toBe('pass');
    const card = await until(() => seen.messages.find((message) => message.roll?.attack));
    // Karta jest zwyczajną kartą ataku: gracze nie mają jak poznać, że strzelał
    // model — dokładnie jak przy rzutach z 20a i wypowiedziach z 11.
    expect(card.kind).toBe('roll');
    expect(card.roll?.attack?.label).toContain('Zgrzyt 9');
    expect(card.proposal).toBeUndefined();
    await endFight(gm.socket);
    gm.socket.disconnect();
  });

  it('spends ammunition through the real weapon row', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await createBot(gm.socket, { data: { autonomy: 'auto' } });
    await startFight(gm.socket);
    gateway.answers = [
      decision({ akcja: 'atak', cel: 'Rico', bron: 'Zgrzyt 9', powod: '.' }),
      decision({ akcja: 'pas', cel: 'Rico', bron: 'Zgrzyt 9', powod: '.' }),
    ];
    const before = await ammoOf();

    await emitAck(gm.socket, 'bot:play-turn', { tokenId: botTokenId });

    expect(await ammoOf()).toBe(before - 1);
    await endFight(gm.socket);
    gm.socket.disconnect();
  });

  it('walks towards a target and stops inside the turn’s metres', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await createBot(gm.socket, { data: { autonomy: 'auto' } });
    // Rico daleko: RUCH 6 daje 12 m, a do niego jest 40.
    await place(gm.socket, enemyTokenId, 40);
    await startFight(gm.socket);
    gateway.answers = [
      decision({ akcja: 'podejście', cel: 'Rico', bron: 'Zgrzyt 9', powod: 'Podchodzę.' }),
      decision({ akcja: 'pas', cel: 'Rico', bron: 'Zgrzyt 9', powod: '.' }),
    ];

    await emitAck(gm.socket, 'bot:play-turn', { tokenId: botTokenId });

    const moved = await tokenOf(gm.socket, botTokenId);
    expect(moved.x).toBeGreaterThan(0);
    // 12 m budżetu z RUCH 6, plus pół kratki tolerancji na zaokrąglenie do pola.
    expect(moved.x).toBeLessThanOrEqual(12 * PX_PER_M + 50);
    await endFight(gm.socket);
    gm.socket.disconnect();
  });

  it('plays a whole turn: walk in, then shoot', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    await createBot(gm.socket, { data: { autonomy: 'auto' } });
    await place(gm.socket, enemyTokenId, 20);
    await startFight(gm.socket);
    gateway.answers = [
      decision({ akcja: 'podejście', cel: 'Rico', bron: 'Zgrzyt 9', powod: 'Podchodzę.' }),
      decision({ akcja: 'atak', cel: 'Rico', bron: 'Zgrzyt 9', powod: 'Strzelam z bliska.' }),
    ];

    const ack = data(
      await emitAck<BotPlayTurnResult>(gm.socket, 'bot:play-turn', { tokenId: botTokenId }),
      'bot:play-turn',
    );

    expect(ack.steps).toBe(2);
    expect(ack.outcome).toBe('executed');
    const moved = await tokenOf(gm.socket, botTokenId);
    expect(moved.x).toBeGreaterThan(0);
    expect(seen.messages.some((message) => message.roll?.attack)).toBe(true);
    await endFight(gm.socket);
    gm.socket.disconnect();
  });

  it('reloads through weapon:reload rather than by writing the sheet', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await built.prisma.character.update({
      where: { id: characterId },
      data: {
        data: JSON.stringify({
          ...(JSON.parse(
            (await built.prisma.character.findUnique({ where: { id: characterId } }))!.data,
          ) as CpredCharacterData),
          weapons: [
            {
              id: 'w-pistol',
              name: 'Zgrzyt 9',
              notes: '',
              compendiumId: 'weapon.zgrzyt-9',
              damage: '2k6',
              ammoCurrent: 0,
              ammoMax: 10,
              ammoType: '',
              rof: '2',
            },
          ],
        }),
      },
    });
    await createBot(gm.socket, { data: { autonomy: 'auto' } });
    await startFight(gm.socket);
    gateway.answers = [
      decision({ akcja: 'przeładowanie', cel: 'Rico', bron: 'Zgrzyt 9', powod: 'Pusto.' }),
      decision({ akcja: 'pas', cel: 'Rico', bron: 'Zgrzyt 9', powod: '.' }),
    ];

    await emitAck(gm.socket, 'bot:play-turn', { tokenId: botTokenId });

    const sheet = JSON.parse(
      (await built.prisma.character.findUnique({ where: { id: characterId } }))!.data,
    ) as CpredCharacterData;
    expect(sheet.weapons[0]?.ammoCurrent).toBe(10);
    await endFight(gm.socket);
    gm.socket.disconnect();
  });
});

describe('bezpieczniki', () => {
  // Odpowiedzi poniżej prawdziwa gramatyka by nie wypuściła. Cały sens: kod
  // musi je odrzucić także wtedy, gdy gramatyka zawiedzie.
  it('refuses an attack on a figure the bot cannot see', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    await emitAck(gm.socket, 'scene:visibility', { sceneId, visibility: 'dynamic' });
    await emitAck(gm.socket, 'wall:create', {
      sceneId,
      points: [
        { x: 400, y: 0 },
        { x: 400, y: 1600 },
      ],
      kind: 'wall',
    });
    await createBot(gm.socket, { data: { autonomy: 'auto' } });
    await startFight(gm.socket);
    gateway.answers = [
      decision({ akcja: 'atak', cel: 'Rico', bron: 'Zgrzyt 9', powod: 'Strzelam przez mur.' }),
      decision({ akcja: 'atak', cel: 'Rico', bron: 'Zgrzyt 9', powod: 'To samo jeszcze raz.' }),
    ];

    const ack = data(
      await emitAck<BotPlayTurnResult>(gm.socket, 'bot:play-turn', { tokenId: botTokenId }),
      'bot:play-turn',
    );

    expect(ack.outcome).toBe('refused');
    expect(seen.messages.some((message) => message.roll?.attack)).toBe(false);
    const refused = await until(() => seen.traces.find((t) => t.outcome === 'refused'));
    expect(refused.refusal).toContain('figurę');
    await endFight(gm.socket);
    gm.socket.disconnect();
  });

  it('refuses a weapon the sheet does not carry', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    await createBot(gm.socket, { data: { autonomy: 'auto' } });
    await startFight(gm.socket);
    gateway.answers = [
      decision({ akcja: 'atak', cel: 'Rico', bron: 'Wyrzutnia rakiet', powod: '.' }),
      decision({ akcja: 'atak', cel: 'Rico', bron: 'Wyrzutnia rakiet', powod: '.' }),
    ];

    const ack = data(
      await emitAck<BotPlayTurnResult>(gm.socket, 'bot:play-turn', { tokenId: botTokenId }),
      'bot:play-turn',
    );

    expect(ack.outcome).toBe('refused');
    expect(seen.messages.some((message) => message.roll?.attack)).toBe(false);
    await endFight(gm.socket);
    gm.socket.disconnect();
  });

  it('gives the model exactly one correction, then stops', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    await createBot(gm.socket, { data: { autonomy: 'auto' } });
    await startFight(gm.socket);
    // Pierwsza odpowiedź nie do sparsowania, druga poprawna.
    gateway.answers = [
      'Podchodzę do Rica i strzelam.',
      decision({ akcja: 'atak', cel: 'Rico', bron: 'Zgrzyt 9', powod: 'Strzelam.' }),
      decision({ akcja: 'pas', cel: 'Rico', bron: 'Zgrzyt 9', powod: '.' }),
    ];

    await emitAck(gm.socket, 'bot:play-turn', { tokenId: botTokenId });

    const executed = await until(() => seen.traces.find((t) => t.outcome === 'executed'));
    expect(executed.retried).toBe(true);
    expect(seen.messages.some((message) => message.roll?.attack)).toBe(true);
    await endFight(gm.socket);
    gm.socket.disconnect();
  });

  it('will not walk a figure that has no Move Action left', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await createBot(gm.socket, { data: { autonomy: 'auto' } });
    await startFight(gm.socket);
    gateway.answers = [
      decision({ akcja: 'podejście', cel: 'Rico', bron: 'Zgrzyt 9', powod: '.' }),
      decision({ akcja: 'podejście', cel: 'Rico', bron: 'Zgrzyt 9', powod: 'Jeszcze raz.' }),
    ];

    await emitAck(gm.socket, 'bot:play-turn', { tokenId: botTokenId });

    // Drugi krok nie ma już ruchu, więc „podejście" wypada z enuma i model
    // dostaje menu bez niego — figura nie może przejść dwóch Akcji Ruchu.
    const second = gateway.bodies.at(-1)!.json_schema as {
      properties: { akcja: { enum: string[] } };
    };
    expect(second.properties.akcja.enum).not.toContain('podejście');
    await endFight(gm.socket);
    gm.socket.disconnect();
  });

  // Do 22.08 wszystkie trzy powody nieudanego podejścia jechały jako jedno
  // zdanie „droga jest zablokowana", więc MG szedł szukać ściany, której nie ma.
  it('says the bot already stands there instead of blaming a wall', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    await createBot(gm.socket, { data: { autonomy: 'auto' } });
    // Rico tuż obok: podejście zwija się do zera i nie jest ruchem.
    await place(gm.socket, enemyTokenId, 1);
    await startFight(gm.socket);
    gateway.answers = [
      decision({ akcja: 'podejście', cel: 'Rico', bron: 'Zgrzyt 9', powod: 'Podchodzę.' }),
      decision({ akcja: 'pas', cel: 'Rico', bron: 'Zgrzyt 9', powod: '.' }),
    ];

    await emitAck(gm.socket, 'bot:play-turn', { tokenId: botTokenId });

    const refused = await until(() => seen.traces.find((t) => t.refusal));
    expect(refused.refusal).toContain('Już tam stoisz');
    expect(refused.refusal).not.toContain('zablokowana');
    await endFight(gm.socket);
    gm.socket.disconnect();
  });

  it('blames the budget, not a wall, when the target is simply too far', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    await createBot(gm.socket, { data: { autonomy: 'auto' } });
    await place(gm.socket, enemyTokenId, 40);
    await startFight(gm.socket);
    // Cała Akcja Ruchu spalona podejściem, więc drugie „podejście" nie ma metrów.
    gateway.answers = [
      decision({ akcja: 'podejście', cel: 'Rico', bron: 'Zgrzyt 9', powod: 'Podchodzę.' }),
      decision({ akcja: 'pas', cel: 'Rico', bron: 'Zgrzyt 9', powod: '.' }),
    ];

    await emitAck(gm.socket, 'bot:play-turn', { tokenId: botTokenId });

    // Odmowy tu nie ma — chodzi o to, że droga JEST i bot nią idzie; test
    // pilnuje, żeby rozdzielenie kodów nie zamieniło zwykłego marszu w odmowę.
    const moved = await tokenOf(gm.socket, botTokenId);
    expect(moved.x).toBeGreaterThan(0);
    expect(seen.traces.some((t) => t.refusal?.includes('zablokowana'))).toBe(false);
    await endFight(gm.socket);
    gm.socket.disconnect();
  });

  it('refuses a figure that no bot drives', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await startFight(gm.socket);

    const ack = data(
      await emitAck<BotPlayTurnResult>(gm.socket, 'bot:play-turn', { tokenId: enemyTokenId }),
      'bot:play-turn',
    );

    expect(ack.outcome).toBe('refused');
    expect(ack.refusal).toContain('bot');
    expect(gateway.bodies).toHaveLength(0);
    await endFight(gm.socket);
    gm.socket.disconnect();
  });

  it('never even asks the model in the controlled mode', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await createBot(gm.socket, { data: { autonomy: 'controlled' } });
    await startFight(gm.socket);

    const ack = data(
      await emitAck<BotPlayTurnResult>(gm.socket, 'bot:play-turn', { tokenId: botTokenId }),
      'bot:play-turn',
    );

    expect(ack.outcome).toBe('refused');
    expect(ack.refusal).toContain('kontrolowanym');
    expect(gateway.bodies).toHaveLength(0);
    await endFight(gm.socket);
    gm.socket.disconnect();
  });

  it('degrades gracefully when the gateway is down', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await createBot(gm.socket, { data: { autonomy: 'auto' } });
    await startFight(gm.socket);
    gateway.up = false;
    await emitAck<AiStatus>(gm.socket, 'ai:refresh');

    const ack = await emitAck<BotPlayTurnResult>(gm.socket, 'bot:play-turn', {
      tokenId: botTokenId,
    });

    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('AI_UNAVAILABLE');
    gateway.up = true;
    await endFight(gm.socket);
    gm.socket.disconnect();
  });

  it('refuses to be played by a player', async () => {
    const invite = await built.app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/invitations`,
      headers: { cookie: gmCookie },
      payload: {},
    });
    const join = await built.app.inject({
      method: 'POST',
      url: `/api/join/${(invite.json() as { token: string }).token}`,
      payload: { name: 'Vex' },
    });
    const player = createSocket(cookieOf(join.headers['set-cookie']));
    await player.firstSync;

    const ack = await emitAck(player.socket, 'bot:play-turn', { tokenId: botTokenId });

    expect(ack.ok).toBe(false);
    player.socket.disconnect();
  });
});

describe('propozycja', () => {
  it('posts a card instead of acting, and acts on approval', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    await createBot(gm.socket, { data: { autonomy: 'proposal' } });
    await startFight(gm.socket);
    gateway.answers = [
      decision({ akcja: 'atak', cel: 'Rico', bron: 'Zgrzyt 9', powod: 'Strzelam do wroga.' }),
      decision({ akcja: 'pas', cel: 'Rico', bron: 'Zgrzyt 9', powod: '.' }),
    ];

    const ack = data(
      await emitAck<BotPlayTurnResult>(gm.socket, 'bot:play-turn', { tokenId: botTokenId }),
      'bot:play-turn',
    );
    expect(ack.outcome).toBe('proposed');
    expect(seen.messages.some((message) => message.roll?.attack)).toBe(false);

    const card = await until(() => seen.messages.find((message) => message.kind === 'proposal'));
    const proposal = card.proposal as BotActionProposal;
    expect(proposal.combat?.kind).toBe('attack');
    expect(proposal.combat?.summary).toBe('Atak: Rico — Zgrzyt 9');
    expect(proposal.reason).toBe('Strzelam do wroga.');

    await emitAck(gm.socket, 'bot:proposal', { messageId: card.id, approve: true });

    const rolled = await until(() => seen.messages.find((message) => message.roll?.attack));
    expect(rolled.roll?.attack?.label).toContain('Zgrzyt 9');
    await endFight(gm.socket);
    gm.socket.disconnect();
  });

  it('does nothing at all when the card is rejected', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    await createBot(gm.socket, { data: { autonomy: 'proposal' } });
    await startFight(gm.socket);
    gateway.answers = [decision({ akcja: 'atak', cel: 'Rico', bron: 'Zgrzyt 9', powod: '.' })];

    await emitAck(gm.socket, 'bot:play-turn', { tokenId: botTokenId });
    const card = await until(() => seen.messages.find((message) => message.kind === 'proposal'));
    await emitAck(gm.socket, 'bot:proposal', { messageId: card.id, approve: false });

    await sleep(150);
    expect(seen.messages.some((message) => message.roll?.attack)).toBe(false);
    const updated = await until(() => seen.updates.find((message) => message.id === card.id));
    expect((updated.proposal as BotActionProposal).resolution).toBe('rejected');
    await endFight(gm.socket);
    gm.socket.disconnect();
  });

  // Między propozycją a kliknięciem może minąć runda: nic z karty nie jest
  // zaufane, a decyzja jest odtwarzana na świeżym stanie taktycznym.
  it('refuses an approval whose target has left the scene', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const seen = collect(gm.socket);
    await createBot(gm.socket, { data: { autonomy: 'proposal' } });
    await startFight(gm.socket);
    gateway.answers = [decision({ akcja: 'atak', cel: 'Rico', bron: 'Zgrzyt 9', powod: '.' })];

    await emitAck(gm.socket, 'bot:play-turn', { tokenId: botTokenId });
    const card = await until(() => seen.messages.find((message) => message.kind === 'proposal'));
    await emitAck(gm.socket, 'combat:remove', {
      combatantId: (await combatOf(gm.socket)).combatants.find(
        (row) => row.tokenId === enemyTokenId,
      )!.id,
    });
    await emitAck(gm.socket, 'token:delete', { tokenId: enemyTokenId });

    await emitAck(gm.socket, 'bot:proposal', { messageId: card.id, approve: true });

    await sleep(150);
    expect(seen.messages.some((message) => message.roll?.attack)).toBe(false);
    const updated = await until(() => seen.updates.find((message) => message.id === card.id));
    expect((updated.proposal as BotActionProposal).blocked).toBeTruthy();

    // Sprzątanie: reszta zestawu liczy na trzy figury na scenie.
    const recreated = data(
      await emitAck<TokenView>(gm.socket, 'token:create', {
        sceneId,
        name: 'Rico',
        x: 600,
        y: 0,
        ownerId: playerId,
      }),
      'token:create',
    );
    enemyTokenId = recreated.id;
    await endFight(gm.socket);
    gm.socket.disconnect();
  });
});
