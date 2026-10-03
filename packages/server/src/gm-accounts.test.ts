import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  AuthConfig,
  AuthEndedPush,
  AuthState,
  CampaignDetail,
  CampaignSummary,
  GmAccountView,
  PasswordResetInfo,
  PasswordResetLink,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { REGISTRATIONS_MAX } from './rate-limit.js';

/**
 * Konta MG (etap 44a): rejestracja, logowanie loginem, zmiana i reset hasła,
 * blokada, panel właściciela, kampanie tylko swoje i kopie całej bazy tylko
 * dla właściciela.
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
  // Limit rejestracji jest częścią tego, co sprawdzamy.
  rateLimits: true,
  backups: {
    dir: mkdtempSync(join(tmpdir(), 'vtt-backups-')),
    intervalMinutes: 0,
    keepHourly: 3,
    keepDaily: 3,
  },
};

let built: BuiltApp;
let baseUrl: string;
let ownerCookie: string;
const openSockets: ClientSocket[] = [];
/** Każdy test z innego adresu — limity per IP nie przeciekają między testami. */
let addressCounter = 1;
function freshAddress(): string {
  addressCounter += 1;
  return `10.44.0.${addressCounter}`;
}

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

function login(loginName: string, password: string, address = freshAddress()) {
  return built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: loginName, password },
    remoteAddress: address,
  });
}

function register(
  loginName: string,
  password: string,
  repeat = password,
  address = freshAddress(),
) {
  return built.app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { login: loginName, password, repeat },
    remoteAddress: address,
  });
}

/** Nowe konto MG i jego ciasteczko. */
async function registerGm(loginName: string, password = 'dlugie-haslo-1') {
  const res = await register(loginName, password);
  expect(res.statusCode).toBe(201);
  return { cookie: cookieOf(res.headers['set-cookie']), state: res.json() as AuthState };
}

async function createCampaign(cookie: string, name: string): Promise<string> {
  const res = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie },
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as CampaignSummary).id;
}

async function accounts(): Promise<GmAccountView[]> {
  const res = await built.app.inject({
    method: 'GET',
    url: '/api/owner/accounts',
    headers: { cookie: ownerCookie },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as GmAccountView[];
}

async function accountId(loginName: string): Promise<string> {
  const found = (await accounts()).find((a) => a.login === loginName);
  if (!found) throw new Error(`no account ${loginName}`);
  return found.id;
}

async function resetLink(id: string): Promise<PasswordResetLink> {
  const res = await built.app.inject({
    method: 'POST',
    url: `/api/owner/accounts/${id}/reset`,
    headers: { cookie: ownerCookie },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as PasswordResetLink;
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

  const res = await login('MG', GM_PASSWORD);
  expect(res.statusCode).toBe(200);
  ownerCookie = cookieOf(res.headers['set-cookie']);
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

describe('konto właściciela z .env', () => {
  it('loguje się loginem GM_NAME bez względu na wielkość liter i niesie flagę właściciela', async () => {
    const res = await login('mg', GM_PASSWORD);
    expect(res.statusCode).toBe(200);
    const state = res.json() as AuthState;
    expect(state.user.owner).toBe(true);
    expect(state.user.name).toBe('MG');
  });

  it('zły login i złe hasło dają ten sam kod', async () => {
    const wrongPassword = await login('MG', 'nie-to-haslo');
    const wrongLogin = await login('nikt-taki', GM_PASSWORD);
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongLogin.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual({ error: 'INVALID_CREDENTIALS' });
    expect(wrongLogin.json()).toEqual({ error: 'INVALID_CREDENTIALS' });
  });

  it('samo hasło bez loginu to zły wniosek', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: GM_PASSWORD },
      remoteAddress: freshAddress(),
    });
    expect(res.statusCode).toBe(400);
  });

  it('nie zmienia hasła w UI — to robi .env', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: { cookie: ownerCookie },
      payload: { current: GM_PASSWORD, password: 'nowe-haslo-123', repeat: 'nowe-haslo-123' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'PASSWORD_FROM_ENV' });
  });
});

describe('rejestracja', () => {
  it('mówi, że jest otwarta', async () => {
    const res = await built.app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(res.json()).toEqual({ registration: true } satisfies AuthConfig);
  });

  it('zakłada konto MG, loguje od razu i sadza je przy stole jako „MG”', async () => {
    const { cookie, state } = await registerGm('Bartek');
    expect(state.user).toMatchObject({ role: 'GM', name: 'MG', owner: false });
    expect(state.activeCampaign).toBeNull();
    const me = await built.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    // Login trzymany małymi literami — wejście „BARTEK” to to samo konto.
    expect((await login('BARTEK', 'dlugie-haslo-1')).statusCode).toBe(200);
  });

  it('odmawia złego loginu i słabego hasła kodami, które zna formularz', async () => {
    expect((await register('ab', 'dlugie-haslo-1')).json()).toEqual({ error: 'LOGIN_INVALID' });
    expect((await register('ze spacją', 'dlugie-haslo-1')).json()).toEqual({
      error: 'LOGIN_INVALID',
    });
    expect((await register('żółw', 'dlugie-haslo-1')).json()).toEqual({ error: 'LOGIN_INVALID' });
    expect((await register('krotkie', 'krotkie')).json()).toEqual({
      error: 'PASSWORD_TOO_SHORT',
    });
    expect((await register('takiesamo10', 'TakieSamo10')).json()).toEqual({
      error: 'PASSWORD_SAME_AS_LOGIN',
    });
    expect((await register('rozne', 'dlugie-haslo-1', 'dlugie-haslo-2')).json()).toEqual({
      error: 'PASSWORD_MISMATCH',
    });
  });

  it('zajęty login to LOGIN_TAKEN bez względu na wielkość liter', async () => {
    await registerGm('zajety');
    const again = await register('Zajety', 'inne-dlugie-haslo');
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: 'LOGIN_TAKEN' });
    // „MG” ma dwie litery, więc odpada już na długości; właściciel z env nie
    // podlega regule loginu, a zajętość jego loginu sprawdza trasa niezależnie.
    expect((await register('mg', 'inne-dlugie-haslo')).statusCode).toBe(400);
  });

  it(`wpuszcza najwyżej ${REGISTRATIONS_MAX} kont z jednego adresu na godzinę`, async () => {
    const address = freshAddress();
    for (let i = 0; i < REGISTRATIONS_MAX; i += 1) {
      const res = await register(`seryjny-${i}`, 'dlugie-haslo-1', 'dlugie-haslo-1', address);
      expect(res.statusCode).toBe(201);
    }
    const over = await register('seryjny-x', 'dlugie-haslo-1', 'dlugie-haslo-1', address);
    expect(over.statusCode).toBe(429);
    expect(over.json()).toMatchObject({ error: 'TOO_MANY_REGISTRATIONS' });
    expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
    // Inny adres zakłada dalej.
    expect((await register('z-innego', 'dlugie-haslo-1')).statusCode).toBe(201);
  });
});

describe('kampanie są własnością MG', () => {
  it('każdy widzi tylko swoje, a cudzej nie aktywuje ani nie zaprasza do niej', async () => {
    const ownerCampaign = await createCampaign(ownerCookie, 'Kampania właściciela');
    const kasia = await registerGm('kasia');
    const kasiaCampaign = await createCampaign(kasia.cookie, 'Kampania Kasi');

    const ownList = await built.app.inject({
      method: 'GET',
      url: '/api/campaigns',
      headers: { cookie: kasia.cookie },
    });
    expect((ownList.json() as CampaignDetail[]).map((c) => c.id)).toEqual([kasiaCampaign]);
    const ownerList = await built.app.inject({
      method: 'GET',
      url: '/api/campaigns',
      headers: { cookie: ownerCookie },
    });
    const ownerIds = (ownerList.json() as CampaignDetail[]).map((c) => c.id);
    expect(ownerIds).toContain(ownerCampaign);
    expect(ownerIds).not.toContain(kasiaCampaign);

    const invite = await built.app.inject({
      method: 'POST',
      url: `/api/campaigns/${ownerCampaign}/invitations`,
      headers: { cookie: kasia.cookie },
      payload: { name: 'Podrzutek' },
    });
    expect(invite.statusCode).toBe(404);
    const sandbox = await built.app.inject({
      method: 'POST',
      url: `/api/campaigns/${ownerCampaign}/sandbox`,
      headers: { cookie: kasia.cookie },
      payload: { sandbox: true },
    });
    expect(sandbox.statusCode).toBe(404);

    const { socket, firstSync } = createSocket(kasia.cookie);
    await firstSync;
    const ack = await emitAck(socket, 'campaign:activate', { campaignId: ownerCampaign });
    expect(ack).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('MG nie dostaje cudzej aktywnej kampanii — ani z REST, ani przez gniazdo', async () => {
    const ownerCampaign = await createCampaign(ownerCookie, 'Aktywna u właściciela');
    const { socket, firstSync } = createSocket(ownerCookie);
    await firstSync;
    expect((await emitAck(socket, 'campaign:activate', { campaignId: ownerCampaign })).ok).toBe(
      true,
    );

    const tomek = await registerGm('tomek');
    expect(tomek.state.activeCampaign).toBeNull();
    const me = await built.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: tomek.cookie },
    });
    expect((me.json() as AuthState).activeCampaign).toBeNull();
    const tomekSocket = createSocket(tomek.cookie);
    const sync = await tomekSocket.firstSync;
    expect(sync.scene).toBeNull();
    expect(sync.characters ?? []).toEqual([]);
  });
});

describe('zmiana hasła', () => {
  it('wymaga obecnego hasła, wylogowuje inne sesje i zostawia tę', async () => {
    const { cookie } = await registerGm('ola', 'stare-haslo-ola');
    const other = cookieOf((await login('ola', 'stare-haslo-ola')).headers['set-cookie']);
    const { socket: otherSocket, firstSync } = createSocket(other);
    await firstSync;
    const ended = nextEvent<AuthEndedPush>(otherSocket, 'auth:ended');

    const wrong = await built.app.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: { cookie },
      payload: { current: 'nie-to', password: 'nowe-haslo-ola', repeat: 'nowe-haslo-ola' },
      remoteAddress: freshAddress(),
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toEqual({ error: 'WRONG_PASSWORD' });

    const weak = await built.app.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: { cookie },
      payload: { current: 'stare-haslo-ola', password: 'krotkie', repeat: 'krotkie' },
    });
    expect(weak.json()).toEqual({ error: 'PASSWORD_TOO_SHORT' });

    const ok = await built.app.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: { cookie },
      payload: { current: 'stare-haslo-ola', password: 'nowe-haslo-ola', repeat: 'nowe-haslo-ola' },
    });
    expect(ok.statusCode).toBe(200);
    expect(await ended).toEqual({ reason: 'password' });

    const meHere = await built.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });
    expect(meHere.statusCode).toBe(200);
    const meThere = await built.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: other },
    });
    expect(meThere.statusCode).toBe(401);
    expect((await login('ola', 'stare-haslo-ola')).statusCode).toBe(401);
    expect((await login('ola', 'nowe-haslo-ola')).statusCode).toBe(200);
  });
});

describe('panel właściciela', () => {
  it('jest tylko dla właściciela', async () => {
    const { cookie } = await registerGm('ciekawski');
    for (const [method, url] of [
      ['GET', '/api/owner/accounts'],
      ['POST', `/api/owner/accounts/${await accountId('ciekawski')}/reset`],
      ['POST', `/api/owner/accounts/${await accountId('ciekawski')}/block`],
    ] as const) {
      const res = await built.app.inject({
        method,
        url,
        headers: { cookie },
        payload: { blocked: true },
      });
      expect(res.statusCode, url).toBe(403);
    }
  });

  it('liczy kampanie i pokazuje ostatnie wejście', async () => {
    const { cookie } = await registerGm('liczony');
    await createCampaign(cookie, 'Pierwsza');
    await createCampaign(cookie, 'Druga');
    const row = (await accounts()).find((a) => a.login === 'liczony');
    expect(row).toMatchObject({ owner: false, blocked: false, campaigns: 2 });
    expect(row?.lastSeenAt).not.toBeNull();
    expect((await accounts()).find((a) => a.login === 'mg')?.owner).toBe(true);
  });

  it('nie resetuje ani nie blokuje konta właściciela', async () => {
    const id = await accountId('mg');
    const reset = await built.app.inject({
      method: 'POST',
      url: `/api/owner/accounts/${id}/reset`,
      headers: { cookie: ownerCookie },
    });
    expect(reset.statusCode).toBe(409);
    const block = await built.app.inject({
      method: 'POST',
      url: `/api/owner/accounts/${id}/block`,
      headers: { cookie: ownerCookie },
      payload: { blocked: true },
    });
    expect(block.statusCode).toBe(409);
  });
});

describe('reset hasła', () => {
  it('link działa raz, wylogowuje stare sesje i od razu loguje', async () => {
    const { cookie } = await registerGm('zapominalski', 'pierwsze-haslo');
    const { socket, firstSync } = createSocket(cookie);
    await firstSync;
    const ended = nextEvent<AuthEndedPush>(socket, 'auth:ended');
    const link = await resetLink(await accountId('zapominalski'));
    expect(new Date(link.expiresAt).getTime() - Date.now()).toBeGreaterThan(23.9 * 3600_000);

    const info = await built.app.inject({ method: 'GET', url: `/api/auth/reset/${link.token}` });
    expect(info.json()).toEqual({ login: 'zapominalski' } satisfies PasswordResetInfo);

    const mismatch = await built.app.inject({
      method: 'POST',
      url: `/api/auth/reset/${link.token}`,
      payload: { password: 'nowe-haslo-zap', repeat: 'inne-haslo-zap' },
    });
    expect(mismatch.json()).toEqual({ error: 'PASSWORD_MISMATCH' });

    const ok = await built.app.inject({
      method: 'POST',
      url: `/api/auth/reset/${link.token}`,
      payload: { password: 'nowe-haslo-zap', repeat: 'nowe-haslo-zap' },
    });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as AuthState).user.role).toBe('GM');
    expect(await ended).toEqual({ reason: 'password' });

    const again = await built.app.inject({
      method: 'POST',
      url: `/api/auth/reset/${link.token}`,
      payload: { password: 'trzecie-haslo-zap', repeat: 'trzecie-haslo-zap' },
      remoteAddress: freshAddress(),
    });
    expect(again.statusCode).toBe(404);
    expect(again.json()).toEqual({ error: 'INVALID_RESET' });
    expect((await login('zapominalski', 'pierwsze-haslo')).statusCode).toBe(401);
    expect((await login('zapominalski', 'nowe-haslo-zap')).statusCode).toBe(200);
  });

  it('wygasa po dobie, a nowy link unieważnia poprzedni', async () => {
    await registerGm('spozniony');
    const id = await accountId('spozniony');
    const first = await resetLink(id);
    const second = await resetLink(id);
    const stale = await built.app.inject({
      method: 'GET',
      url: `/api/auth/reset/${first.token}`,
      remoteAddress: freshAddress(),
    });
    expect(stale.statusCode).toBe(404);

    await built.prisma.passwordReset.updateMany({
      where: { userId: id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await built.app.inject({
      method: 'POST',
      url: `/api/auth/reset/${second.token}`,
      payload: { password: 'nowe-haslo-sp', repeat: 'nowe-haslo-sp' },
      remoteAddress: freshAddress(),
    });
    expect(expired.statusCode).toBe(404);
  });

  it('w bazie leży skrót, nie token', async () => {
    await registerGm('skrot');
    const link = await resetLink(await accountId('skrot'));
    const rows = await built.prisma.passwordReset.findMany();
    expect(rows.some((row) => row.tokenHash === link.token)).toBe(false);
  });
});

describe('blokada konta', () => {
  it('wylogowuje, odmawia logowania i znika po odblokowaniu; kampanie zostają', async () => {
    const { cookie } = await registerGm('psotnik', 'haslo-psotnika');
    const campaignId = await createCampaign(cookie, 'Kampania psotnika');
    const { socket, firstSync } = createSocket(cookie);
    await firstSync;
    const ended = nextEvent<AuthEndedPush>(socket, 'auth:ended');
    const id = await accountId('psotnik');

    const block = await built.app.inject({
      method: 'POST',
      url: `/api/owner/accounts/${id}/block`,
      headers: { cookie: ownerCookie },
      payload: { blocked: true },
    });
    expect(block.statusCode).toBe(200);
    expect(await ended).toEqual({ reason: 'blocked' });
    const me = await built.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
    const refused = await login('psotnik', 'haslo-psotnika');
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toEqual({ error: 'ACCOUNT_BLOCKED' });
    // Złe hasło do zablokowanego konta nie zdradza blokady.
    expect((await login('psotnik', 'zle-haslo-psotnika')).json()).toEqual({
      error: 'INVALID_CREDENTIALS',
    });
    expect((await accounts()).find((a) => a.login === 'psotnik')?.blocked).toBe(true);
    expect(await built.prisma.campaign.findUnique({ where: { id: campaignId } })).not.toBeNull();

    await built.app.inject({
      method: 'POST',
      url: `/api/owner/accounts/${id}/block`,
      headers: { cookie: ownerCookie },
      payload: { blocked: false },
    });
    expect((await login('psotnik', 'haslo-psotnika')).statusCode).toBe(200);
  });
});

describe('kopie całej bazy tylko dla właściciela', () => {
  it('zwykły MG dostaje FORBIDDEN, właściciel listę', async () => {
    const { cookie } = await registerGm('bez-kopii');
    const gm = createSocket(cookie);
    await gm.firstSync;
    expect(await emitAck(gm.socket, 'archive:list')).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await emitAck(gm.socket, 'archive:snapshot')).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });

    const owner = createSocket(ownerCookie);
    await owner.firstSync;
    const list = await emitAck<{ directory: string }>(owner.socket, 'archive:list');
    expect(list.ok).toBe(true);
  });
});

describe('rejestracja wyłączona', () => {
  it('odmawia REGISTRATION_CLOSED i mówi o tym ekranowi logowania', async () => {
    config.registrationOpen = false;
    try {
      const cfg = await built.app.inject({ method: 'GET', url: '/api/auth/config' });
      expect(cfg.json()).toEqual({ registration: false });
      const res = await register('za-pozno', 'dlugie-haslo-1');
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'REGISTRATION_CLOSED' });
    } finally {
      config.registrationOpen = undefined;
    }
  });
});
