import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  AuthEndedPush,
  AuthState,
  CampaignSummary,
  CharacterView,
  ChatMessageBroadcast,
  InvitationSummary,
  JournalPendingPush,
  PortraitAssetView,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { LoginAttemptLimiter, SocketRateLimiter } from './rate-limit.js';

/**
 * Poprawki bezpieczeństwa z T2 (01.10): #10 (kampania i pula portretów tylko
 * dla członków, `/uploads/` za logowaniem), #11 (gniazdo po wylogowaniu
 * i wygaśnięciu sesji), #12 (limit złych haseł i zaproszeń), #13 (limit tempa
 * na gnieździe) — plus podpis postacią (#45) i licznik streszczenia (#43),
 * które jadą tymi samymi gniazdami.
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
  // Ten plik sprawdza właśnie limity — w pozostałych testach dymnych są wyłączone.
  rateLimits: true,
};

let built: BuiltApp;
let baseUrl: string;
let gmCookie: string;
let playerCookie: string;
let playerId: string;
let homeCampaignId: string;
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
    socket.emit(event, payload, (ack: SocketAck<T>) => {
      clearTimeout(timer);
      resolvePromise(ack);
    });
  });
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

function disconnected(socket: ClientSocket, timeoutMs = 4000): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    if (!socket.connected) {
      resolvePromise('already');
      return;
    }
    const timer = setTimeout(() => reject(new Error('disconnect timeout')), timeoutMs);
    socket.once('disconnect', (reason) => {
      clearTimeout(timer);
      resolvePromise(reason);
    });
  });
}

async function createCampaign(name: string): Promise<string> {
  const res = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as CampaignSummary).id;
}

/** Imienny link (etap 44b) — trasą MG, bo to test zabezpieczeń. */
async function invite(campaignId: string, name: string): Promise<string> {
  const res = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: { name },
  });
  return (res.json() as InvitationSummary).token;
}

async function joinAs(token: string): Promise<{ cookie: string; state: AuthState }> {
  const res = await built.app.inject({
    method: 'POST',
    url: `/api/join/${token}`,
    remoteAddress: '10.0.0.1',
  });
  expect(res.statusCode).toBe(200);
  return { cookie: cookieOf(res.headers['set-cookie']), state: res.json() as AuthState };
}

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: 'pipe',
  });
  built = await buildApp(config, { logger: false });
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const address = built.app.server.address();
  if (address === null || typeof address === 'string') throw new Error('no server address');
  baseUrl = `http://127.0.0.1:${address.port}`;

  const login = await built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: 'MG', password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);
  homeCampaignId = await createCampaign('Nocna zmiana');
  const player = await joinAs(await invite(homeCampaignId, 'Marek'));
  playerCookie = player.cookie;
  playerId = player.state.user.id;
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

describe('#10 — aktywna kampania i jej pliki tylko dla członków', () => {
  it('gracz innej kampanii nie dostaje nazwy aktywnej kampanii ani jej puli portretów', async () => {
    const png = await sharp({
      create: { width: 256, height: 256, channels: 3, background: '#c33' },
    })
      .png()
      .toBuffer();
    const boundary = `----vtt${randomBytes(8).toString('hex')}`;
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="twarz.png"\r\n` +
          'Content-Type: image/png\r\n\r\n',
      ),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const upload = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/portrait-assets',
      headers: { cookie: gmCookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    expect(upload.statusCode).toBe(201);
    const asset = upload.json() as PortraitAssetView;

    // Druga kampania z własnym graczem; MG wraca potem do „Nocnej zmiany”.
    const other = await createCampaign('Obca kampania');
    const stranger = await joinAs(await invite(other, 'Obcy'));
    expect(stranger.state.activeCampaign?.id).toBe(other);
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    expect((await emitAck(gm.socket, 'campaign:activate', { campaignId: homeCampaignId })).ok).toBe(
      true,
    );
    gm.socket.disconnect();

    const me = await built.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: stranger.cookie },
    });
    expect((me.json() as AuthState).activeCampaign).toBeNull();
    const pool = await built.app.inject({
      method: 'GET',
      url: '/api/portrait-assets',
      headers: { cookie: stranger.cookie },
    });
    expect(pool.json()).toEqual([]);

    // Członek kampanii dalej widzi pulę i nazwę.
    const member = await built.app.inject({
      method: 'GET',
      url: '/api/portrait-assets',
      headers: { cookie: playerCookie },
    });
    expect((member.json() as PortraitAssetView[]).map((row) => row.url)).toContain(asset.url);
    const memberMe = await built.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: playerCookie },
    });
    expect((memberMe.json() as AuthState).activeCampaign?.id).toBe(homeCampaignId);

    // Plik: z ciasteczkiem tak, bez — nie.
    const withCookie = await built.app.inject({
      method: 'GET',
      url: asset.url,
      headers: { cookie: playerCookie },
    });
    expect(withCookie.statusCode).toBe(200);
    const anonymous = await built.app.inject({ method: 'GET', url: asset.url });
    expect(anonymous.statusCode).toBe(401);
  });
});

describe('#11 — gniazdo żyje tyle, co sesja', () => {
  it('wylogowanie rozłącza otwarte gniazda tej sesji z powodem „logout”', async () => {
    const { cookie } = await joinAs(await invite(homeCampaignId, 'Ola'));
    const first = createSocket(cookie);
    const second = createSocket(cookie);
    await Promise.all([first.firstSync, second.firstSync]);
    // Gniazdo innej sesji tego samego stołu zostaje.
    const marek = createSocket(playerCookie);
    await marek.firstSync;

    const ended = nextEvent<AuthEndedPush>(second.socket, 'auth:ended');
    const gone = Promise.all([disconnected(first.socket), disconnected(second.socket)]);
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(await ended).toEqual({ reason: 'logout' });
    expect(await gone).toEqual(['io server disconnect', 'io server disconnect']);
    expect(marek.socket.connected).toBe(true);
    expect((await emitAck(marek.socket, 'chat:history', { beforeId: 1_000_000 })).ok).toBe(true);
    marek.socket.disconnect();
  });

  it('wygasła sesja: gniazdo dostaje „expired” i rozłączenie, zanim cokolwiek wyśle', async () => {
    const user = await built.prisma.user.findFirstOrThrow({ where: { name: 'Marek' } });
    const session = await built.prisma.session.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() + 1500) },
    });
    const cookie = `vtt_sid=${encodeURIComponent(built.app.signCookie(session.id))}`;
    const { socket, firstSync } = createSocket(cookie);
    await firstSync;
    const ended = nextEvent<AuthEndedPush>(socket, 'auth:ended', 5000);
    const gone = disconnected(socket, 5000);
    expect(await ended).toEqual({ reason: 'expired' });
    expect(await gone).toBe('io server disconnect');

    // Ponowne połączenie tym ciasteczkiem odbija się od `io.use`.
    const again = createSocket(cookie);
    await expect(again.firstSync).rejects.toThrow('UNAUTHORIZED');
  });
});

describe('#12 — limit złych haseł i zaproszeń per adres', () => {
  it('po 10 złych hasłach adres dostaje 429 także na dobre hasło; inny adres wchodzi', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const res = await built.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { login: 'MG', password: `zgaduje-${i}` },
        remoteAddress: '203.0.113.7',
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses.slice(10)).toEqual([429, 429]);

    const blocked = await built.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'MG', password: GM_PASSWORD },
      remoteAddress: '203.0.113.7',
    });
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    const elsewhere = await built.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'MG', password: GM_PASSWORD },
      remoteAddress: '198.51.100.2',
    });
    expect(elsewhere.statusCode).toBe(200);
  });

  it('zgadywanie zaproszeń liczy się do tego samego limitu', async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await built.app.inject({
        method: 'GET',
        url: `/api/join/zgadywane-${i}`,
        remoteAddress: '203.0.113.9',
      });
      expect(res.statusCode).toBe(404);
    }
    const limited = await built.app.inject({
      method: 'POST',
      url: `/api/join/${await invite(homeCampaignId, 'Zgadywacz')}`,
      remoteAddress: '203.0.113.9',
    });
    expect(limited.statusCode).toBe(429);
  });

  it('okno przesuwne: adres odzyskuje próby po 15 minutach, udane wejście zeruje licznik', () => {
    const limiter = new LoginAttemptLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i += 1) limiter.fail('a', t0 + i * 1000);
    expect(limiter.retryAfter('a', t0 + 10_000)).toBe(15 * 60 - 10);
    expect(limiter.retryAfter('a', t0 + 15 * 60_000)).toBeNull();
    limiter.fail('b', t0);
    limiter.succeed('b');
    for (let i = 0; i < 9; i += 1) limiter.fail('b', t0);
    expect(limiter.retryAfter('b', t0)).toBeNull();
  });
});

describe('#13 — limit tempa zdarzeń gniazda per konto', () => {
  it('zalew czatu jednego gracza dostaje RATE_LIMITED, a MG pisze bez przeszkód', async () => {
    const flood = createSocket(playerCookie);
    const gm = createSocket(gmCookie);
    await Promise.all([flood.firstSync, gm.firstSync]);
    const before = await built.prisma.chatMessage.count({
      where: { text: { startsWith: 'ZALEW' } },
    });
    const acks = await Promise.all(
      Array.from({ length: 150 }, (_, i) =>
        emitAck(flood.socket, 'chat:send', { text: `ZALEW ${i}` }),
      ),
    );
    const refused = acks.filter((ack) => !ack.ok && ack.error === 'RATE_LIMITED').length;
    const stored =
      (await built.prisma.chatMessage.count({ where: { text: { startsWith: 'ZALEW' } } })) - before;
    // Dokładne liczby pilnuje test wiadra niżej — tu zależą od tempa maszyny.
    expect(refused).toBeGreaterThan(0);
    expect(stored).toBeLessThan(150);
    expect(stored + refused).toBe(150);

    const gmAck = await emitAck(gm.socket, 'chat:send', { text: 'MG w trakcie zalewu.' });
    expect(gmAck.ok).toBe(true);
    flood.socket.disconnect();
    gm.socket.disconnect();
  });

  it('wiadro: zapas 60, potem 20 na sekundę; klatki bez potwierdzenia mają osobne 40', () => {
    const limiter = new SocketRateLimiter();
    const t0 = 5_000;
    let allowed = 0;
    for (let i = 0; i < 100; i += 1) if (limiter.allow('u', 'acked', t0)) allowed += 1;
    expect(allowed).toBe(60);
    expect(limiter.allow('u', 'acked', t0 + 40)).toBe(false);
    expect(limiter.allow('u', 'acked', t0 + 50)).toBe(true);
    // Osobne wiadro: przeciąganie nie zjada zapasu czatu i odwrotnie.
    expect(limiter.allow('u', 'fireAndForget', t0)).toBe(true);
    expect(limiter.allow('inny', 'acked', t0)).toBe(true);
  });
});

describe('#45 i #43 — wypowiedź gracza podpisana postacią, licznik streszczenia u MG', () => {
  it('say gracza nosi imię postaci, konto jedzie w podpowiedzi; MG dostaje journal:pending', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const created = await emitAck<CharacterView>(gm.socket, 'character:create', {
      name: 'Kowal',
      ownerId: playerId,
    });
    expect(created.ok).toBe(true);
    // Nowe wiadro limitu — poprzedni test wyczerpał zapas Marka.
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 3500));

    const player = createSocket(playerCookie);
    await player.firstSync;
    const broadcast = nextEvent<ChatMessageBroadcast>(gm.socket, 'chat:message');
    const pending = nextEvent<JournalPendingPush>(gm.socket, 'journal:pending');
    const ack = await emitAck(player.socket, 'chat:send', { text: 'Paser, masz coś dla mnie?' });
    expect(ack.ok).toBe(true);

    const { message } = await broadcast;
    expect(message.authorName).toBe('Kowal');
    expect(message.accountName).toBe('Marek');
    const row = await built.prisma.chatMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(row.speakerName).toBe('Kowal');

    const says = await built.prisma.chatMessage.count({
      where: { campaignId: homeCampaignId, kind: 'say' },
    });
    expect((await pending).pendingLines).toBe(says);

    // MG mówi nazwą konta — bez podpisu postacią i bez podpowiedzi.
    const gmBroadcast = nextEvent<ChatMessageBroadcast>(player.socket, 'chat:message');
    await emitAck(gm.socket, 'chat:send', { text: 'Paser kiwa głową.' });
    const gmLine = (await gmBroadcast).message;
    expect(gmLine.authorName).toBe('MG');
    expect(gmLine.accountName).toBeUndefined();
    gm.socket.disconnect();
    player.socket.disconnect();
  }, 20_000);
});
