import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignDetail,
  CampaignSummary,
  ChatMessageView,
  ChatRecolorPush,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import { GM_AUTHOR_COLOR, PLAYER_COLORS } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { exportCampaign } from './archive.js';
import { joinUrl } from './test-join.js';

/**
 * Etap 60c: kolor gracza na czacie. Kolor liczy serwer przy budowie widoku —
 * ten sam u każdego widza, w historii i po restarcie — a zmiana MG
 * przemalowuje karty na ekranach (`chat:recolor`).
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
  aiGatewayUrl: 'http://127.0.0.1:1',
  aiGatewayApiKey: '',
  aiHealthIntervalMs: 60_000,
  aiRequestTimeoutMs: 1000,
};

let built: BuiltApp;
let baseUrl: string;
let gmCookie: string;
let olaCookie: string;
let marekCookie: string;
let olaId: string;
let marekId: string;
let campaignId: string;
const openSockets: ClientSocket[] = [];

function cookieOf(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error('missing set-cookie header');
  return raw.split(';')[0]!;
}

async function listen(app: BuiltApp): Promise<string> {
  await app.app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.app.server.address();
  if (address === null || typeof address === 'string') throw new Error('no server address');
  return `http://127.0.0.1:${address.port}`;
}

/** Świeże gniazdo i jego pierwszy `state:sync` — tak klient dostaje historię. */
function connect(
  cookie: string,
  url = baseUrl,
  ms = 4000,
): Promise<{ socket: ClientSocket; sync: StateSyncPayload }> {
  const socket = ioClient(url, { extraHeaders: { cookie }, reconnection: false, timeout: ms });
  openSockets.push(socket);
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('state:sync timeout'));
    }, ms);
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.once('state:sync', (sync: StateSyncPayload) => {
      clearTimeout(timer);
      resolvePromise({ socket, sync });
    });
  });
}

function emitAck(socket: ClientSocket, event: string, payload: unknown): Promise<SocketAck> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 3000);
    socket.emit(event, payload, (response: SocketAck) => {
      clearTimeout(timer);
      resolvePromise(response);
    });
  });
}

function nextEvent<T>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolvePromise(payload);
    });
  });
}

const byText = (messages: ChatMessageView[], text: string) => {
  const found = messages.find((message) => message.text === text);
  if (!found) throw new Error(`brak wiersza „${text}”`);
  return found;
};

function setColor(color: unknown, userId = marekId, cookie = gmCookie, id = campaignId) {
  return built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${id}/players/${userId}/color`,
    headers: { cookie },
    payload: { color },
  });
}

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: 'pipe',
  });
  built = await buildApp(config, { logger: false });
  baseUrl = await listen(built);

  const login = await built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: 'MG', password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);
  const created = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Kolory Night City' },
  });
  campaignId = (created.json() as CampaignSummary).id;

  const join = async (name: string) =>
    cookieOf(
      (await built.app.inject({ method: 'POST', url: await joinUrl(built, campaignId, name) }))
        .headers['set-cookie'],
    );
  olaCookie = await join('Ola');
  marekCookie = await join('Marek');
  const members = await built.prisma.campaignMember.findMany({
    where: { campaignId },
    include: { user: true },
  });
  olaId = members.find((member) => member.user.name === 'Ola')!.userId;
  marekId = members.find((member) => member.user.name === 'Marek')!.userId;
  // Kolejność dołączenia jawnie: dwa wejścia w tej samej milisekundzie
  // rozstrzygałoby id, a test ma pilnować kolejności.
  await built.prisma.campaignMember.update({
    where: { campaignId_userId: { campaignId, userId: olaId } },
    data: { joinedAt: new Date('2026-10-01T12:00:00Z') },
  });
  await built.prisma.campaignMember.update({
    where: { campaignId_userId: { campaignId, userId: marekId } },
    data: { joinedAt: new Date('2026-10-02T12:00:00Z') },
  });
}, 60_000);

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

describe('kolor gracza (etap 60c)', () => {
  it('kolor z palety po kolejności dołączenia, MG w bursztynie — na żywo i w historii', async () => {
    const ola = await connect(olaCookie);
    const marek = await connect(marekCookie);
    const gm = await connect(gmCookie);
    const live = nextEvent<{ message: ChatMessageView }>(ola.socket, 'chat:message');
    expect((await emitAck(ola.socket, 'chat:send', { text: 'Ola tu jest.' })).ok).toBe(true);
    expect((await live).message.authorColor).toBe(PLAYER_COLORS[0]);
    expect((await emitAck(marek.socket, 'chat:send', { text: 'Marek też.' })).ok).toBe(true);
    expect((await emitAck(gm.socket, 'chat:send', { text: 'MG zaczyna.' })).ok).toBe(true);

    const olaHistory = (await connect(olaCookie)).sync.messages;
    expect(byText(olaHistory, 'Ola tu jest.').authorColor).toBe(PLAYER_COLORS[0]);
    // Gracza nieobecnego przy stole też — kolor nie zależy od obecności.
    marek.socket.disconnect();
    expect(byText((await connect(olaCookie)).sync.messages, 'Marek też.').authorColor).toBe(
      PLAYER_COLORS[1],
    );
    // Wypowiedź MG bez sesji to jego przygotowanie — widzi ją tylko MG.
    const gmHistory = (await connect(gmCookie)).sync.messages;
    expect(byText(gmHistory, 'MG zaczyna.').authorColor).toBe(GM_AUTHOR_COLOR);
    expect(byText(gmHistory, 'Marek też.').authorColor).toBe(PLAYER_COLORS[1]);
  });

  it('MG zmienia kolor — stół dostaje `chat:recolor`, lista graczy go pokazuje', async () => {
    const ola = await connect(olaCookie);
    const recolor = nextEvent<ChatRecolorPush>(ola.socket, 'chat:recolor');
    const res = await setColor('lime');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: marekId, color: 'lime' });
    expect(await recolor).toEqual({ userId: marekId, color: 'lime' });

    const list = await built.app.inject({
      method: 'GET',
      url: '/api/campaigns',
      headers: { cookie: gmCookie },
    });
    const players = (list.json() as CampaignDetail[]).find((c) => c.id === campaignId)!.players;
    expect(players.map((player) => [player.name, player.color])).toEqual([
      ['Ola', null],
      ['Marek', 'lime'],
    ]);
    // Wybór Marka nie przesuwa Oli.
    expect(byText((await connect(olaCookie)).sync.messages, 'Ola tu jest.').authorColor).toBe(
      PLAYER_COLORS[0],
    );
  });

  it('odmowy: zła nazwa, obcy gracz, gracz zamiast MG', async () => {
    expect((await setColor('#ff0000')).statusCode).toBe(400);
    expect((await setColor('gm')).statusCode).toBe(400);
    expect((await setColor('sky', 'nie-ma-takiego')).statusCode).toBe(404);
    expect((await setColor('sky', marekId, gmCookie, 'nie-ma-takiej')).statusCode).toBe(404);
    expect((await setColor('sky', marekId, olaCookie)).statusCode).toBe(403);
    const row = await built.prisma.campaignMember.findUniqueOrThrow({
      where: { campaignId_userId: { campaignId, userId: marekId } },
    });
    expect(row.color).toBe('lime');
  });

  // Drugi `buildApp` pod obciążeniem całej suity trwa dłużej niż domyślne 5 s.
  it(
    'kolor przeżywa restart serwera i jedzie w eksporcie kampanii',
    { timeout: 30_000 },
    async () => {
      // Drugi proces na tej samej bazie — tak wygląda serwer po restarcie.
      const restarted = await buildApp(config, { logger: false, sweepUploads: false });
      let socket: ClientSocket | undefined;
      try {
        await restarted.realtime.ready;
        const url = await listen(restarted);
        const { socket: olaSocket, sync } = await connect(olaCookie, url, 15_000);
        socket = olaSocket;
        expect(byText(sync.messages, 'Marek też.').authorColor).toBe('lime');
        expect(byText(sync.messages, 'Ola tu jest.').authorColor).toBe(PLAYER_COLORS[0]);
      } finally {
        // Otwarte gniazdo trzymałoby `close()` drugiego procesu.
        socket?.disconnect();
        await restarted.app.close();
      }
      const file = await exportCampaign(built.prisma, campaignId, { includeChat: false });
      expect(file!.payload.members.map((member) => [member.userId, member.color]).sort()).toEqual(
        [
          [olaId, null],
          [marekId, 'lime'],
        ].sort(),
      );
    },
  );

  it('„z kolejności” wraca do koloru z palety', async () => {
    const res = await setColor(null);
    expect(res.json()).toEqual({ userId: marekId, color: PLAYER_COLORS[1] });
    expect(byText((await connect(olaCookie)).sync.messages, 'Marek też.').authorColor).toBe(
      PLAYER_COLORS[1],
    );
  });
});
