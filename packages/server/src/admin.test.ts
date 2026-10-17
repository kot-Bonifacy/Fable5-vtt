import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  AdminDeleteAccountResult,
  AdminSessionsView,
  AdminSettingsView,
  AuthEndedPush,
  AuthState,
  CampaignSummary,
  GmAccountView,
  SessionChangedPush,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { ensureAdminUser } from './auth/seed.js';
import { joinUrl } from './test-join.js';
import { TEST_ADMIN, TEST_ADMIN_OWN_PASSWORD, adminCookie } from './test-admin.js';

/**
 * Konto administratora (etap 53): zakładane z `.env` z hasłem tymczasowym,
 * które trzeba zmienić, zanim serwer odpowie czymkolwiek innym; panel kont MG
 * (hasło tymczasowe, usunięcie), sesje (lista, „Zakończ”, dziennik z graczami)
 * i przełącznik rejestracji.
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
  ...TEST_ADMIN,
  cookieSecret: 'test-cookie-secret',
  sessionTtlDays: 1,
  uploadsDir: mkdtempSync(join(tmpdir(), 'vtt-uploads-')),
  dataPublicDir: resolve(import.meta.dirname, '../../../data/public'),
  dataPrivateDir: resolve(import.meta.dirname, 'fixtures/no-private-data'),
  aiGatewayUrl: 'http://127.0.0.1:1',
  aiGatewayApiKey: '',
  aiHealthIntervalMs: 60_000,
  aiRequestTimeoutMs: 1000,
  sessions: { maxSessions: 2, emptyMinutes: 15, idleMinutes: 180 },
};

let built: BuiltApp;
let baseUrl: string;
const openSockets: ClientSocket[] = [];
let addressCounter = 1;
function freshAddress(): string {
  addressCounter += 1;
  return `10.53.1.${addressCounter}`;
}

function cookieOf(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error('missing set-cookie header');
  return raw.split(';')[0]!;
}

function connect(cookie: string): ClientSocket {
  const socket = ioClient(baseUrl, {
    extraHeaders: { cookie },
    reconnection: false,
    timeout: 3000,
  });
  openSockets.push(socket);
  return socket;
}

async function seated(cookie: string): Promise<{ socket: ClientSocket; sync: StateSyncPayload }> {
  const socket = connect(cookie);
  const sync = await new Promise<StateSyncPayload>((resolvePromise, reject) => {
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

function nextEvent<T>(socket: ClientSocket, event: string, timeoutMs = 4000): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolvePromise(payload);
    });
  });
}

function login(loginName: string, password: string) {
  return built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: loginName, password },
    remoteAddress: freshAddress(),
  });
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
    remoteAddress: freshAddress(),
  });
  return { status: res.statusCode, body: res.json() as T };
}

async function registerGm(loginName: string, password = 'dlugie-haslo-1'): Promise<string> {
  const res = await built.app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { login: loginName, password, repeat: password },
    remoteAddress: freshAddress(),
  });
  expect(res.statusCode).toBe(201);
  return cookieOf(res.headers['set-cookie']);
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

async function accountId(admin: string, loginName: string): Promise<string> {
  const list = await rest<GmAccountView[]>(admin, 'GET', '/api/admin/accounts');
  const found = list.body.find((account) => account.login === loginName);
  if (!found) throw new Error(`no account ${loginName}`);
  return found.id;
}

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: 'pipe',
  });
  built = await buildApp(config, { logger: false, sweepUploads: false });
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const address = built.app.server.address();
  if (address === null || typeof address === 'string') throw new Error('no server address');
  baseUrl = `http://127.0.0.1:${address.port}`;
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

describe('konto administratora z .env', () => {
  it('wchodzi hasłem tymczasowym i do zmiany hasła nie dostaje niczego innego', async () => {
    const res = await login(TEST_ADMIN.adminLogin.toUpperCase(), TEST_ADMIN.adminPassword);
    expect(res.statusCode).toBe(200);
    const state = res.json() as AuthState;
    expect(state.user).toMatchObject({
      role: 'ADMIN',
      owner: true,
      mustChangePassword: true,
      login: TEST_ADMIN.adminLogin,
    });
    expect(state.activeCampaign).toBeNull();
    const cookie = cookieOf(res.headers['set-cookie']);

    expect((await rest(cookie, 'GET', '/api/auth/me')).status).toBe(200);
    for (const [method, url] of [
      ['GET', '/api/admin/accounts'],
      ['GET', '/api/admin/sessions'],
      ['GET', '/api/admin/ai'],
      ['GET', '/api/campaigns'],
    ] as const) {
      const refused = await rest(cookie, method, url);
      expect(refused.status, url).toBe(403);
      expect(refused.body).toEqual({ error: 'PASSWORD_CHANGE_REQUIRED' });
    }
    // Gniazdo też czeka na własne hasło.
    const socket = connect(cookie);
    const error = await new Promise<Error>((resolvePromise) =>
      socket.once('connect_error', resolvePromise),
    );
    expect(error.message).toBe('PASSWORD_CHANGE_REQUIRED');

    // To samo hasło drugi raz nie zdejmuje tymczasowego.
    const same = await rest(cookie, 'POST', '/api/auth/password', {
      current: TEST_ADMIN.adminPassword,
      password: TEST_ADMIN.adminPassword,
      repeat: TEST_ADMIN.adminPassword,
    });
    expect(same.body).toEqual({ error: 'PASSWORD_UNCHANGED' });

    const changed = await rest<{ ok: boolean; user: AuthState['user'] }>(
      cookie,
      'POST',
      '/api/auth/password',
      {
        current: TEST_ADMIN.adminPassword,
        password: TEST_ADMIN_OWN_PASSWORD,
        repeat: TEST_ADMIN_OWN_PASSWORD,
      },
    );
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBeUndefined();
    expect((await rest(cookie, 'GET', '/api/admin/accounts')).status).toBe(200);
    expect((await login(TEST_ADMIN.adminLogin, TEST_ADMIN.adminPassword)).statusCode).toBe(401);
  });

  it('restart nie cofa zmienionego hasła, a flaga awaryjna tak', async () => {
    const log = built.app.log;
    await ensureAdminUser(built.prisma, config, log);
    expect((await login(TEST_ADMIN.adminLogin, TEST_ADMIN_OWN_PASSWORD)).statusCode).toBe(200);

    await ensureAdminUser(built.prisma, { ...config, adminPasswordReset: true }, log);
    expect((await login(TEST_ADMIN.adminLogin, TEST_ADMIN_OWN_PASSWORD)).statusCode).toBe(401);
    const back = await login(TEST_ADMIN.adminLogin, TEST_ADMIN.adminPassword);
    expect((back.json() as AuthState).user.mustChangePassword).toBe(true);
    // Drugi start z flagą niczego już nie zmienia — ani skrótu, ani sesji.
    const hash = async () =>
      (await built.prisma.user.findUniqueOrThrow({ where: { login: TEST_ADMIN.adminLogin } }))
        .passwordHash;
    const before = await hash();
    await ensureAdminUser(built.prisma, { ...config, adminPasswordReset: true }, log);
    expect(await hash()).toBe(before);
    expect((await rest(cookieOf(back.headers['set-cookie']), 'GET', '/api/auth/me')).status).toBe(
      200,
    );
    // Z powrotem do stanu, który znają pozostałe przypadki.
    await adminCookie(built);
  });

  it('login administratora jest zajęty dla rejestracji', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        login: TEST_ADMIN.adminLogin,
        password: 'dlugie-haslo-1',
        repeat: 'dlugie-haslo-1',
      },
      remoteAddress: freshAddress(),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'LOGIN_TAKEN' });
  });

  it('konto MG z loginem administratora nie zostaje przejęte zmianą .env', async () => {
    await registerGm('przejmowany');
    await ensureAdminUser(built.prisma, { ...config, adminLogin: 'przejmowany' }, built.app.log);
    const row = await built.prisma.user.findUniqueOrThrow({ where: { login: 'przejmowany' } });
    expect(row).toMatchObject({ role: 'GM', owner: false, mustChangePassword: false });
  });
});

describe('hasło tymczasowe MG', () => {
  it('administrator je ustawia, MG wchodzi nim i musi od razu ustawić własne', async () => {
    const admin = await adminCookie(built);
    const gm = await registerGm('zapominalska', 'pierwsze-haslo');
    const live = await seated(gm);
    const ended = nextEvent<AuthEndedPush>(live.socket, 'auth:ended');
    const id = await accountId(admin, 'zapominalska');

    const weak = await rest(admin, 'POST', `/api/admin/accounts/${id}/password`, {
      password: 'krotkie',
    });
    expect(weak.body).toEqual({ error: 'PASSWORD_TOO_SHORT' });
    const set = await rest(admin, 'POST', `/api/admin/accounts/${id}/password`, {
      password: 'tymczasowe-zap',
    });
    expect(set.status).toBe(200);
    expect(await ended).toEqual({ reason: 'password' });
    const row = (await rest<GmAccountView[]>(admin, 'GET', '/api/admin/accounts')).body.find(
      (account) => account.id === id,
    );
    expect(row?.temporaryPassword).toBe(true);

    expect((await login('zapominalska', 'pierwsze-haslo')).statusCode).toBe(401);
    const entered = await login('zapominalska', 'tymczasowe-zap');
    expect((entered.json() as AuthState).user.mustChangePassword).toBe(true);
    const cookie = cookieOf(entered.headers['set-cookie']);
    expect((await rest(cookie, 'GET', '/api/campaigns')).body).toEqual({
      error: 'PASSWORD_CHANGE_REQUIRED',
    });
    const own = await rest(cookie, 'POST', '/api/auth/password', {
      current: 'tymczasowe-zap',
      password: 'wlasne-haslo-zap',
      repeat: 'wlasne-haslo-zap',
    });
    expect(own.status).toBe(200);
    expect((await rest(cookie, 'GET', '/api/campaigns')).status).toBe(200);
  });

  it('konta MG właściciela panel nie zmienia', async () => {
    const admin = await adminCookie(built);
    const id = await accountId(admin, 'mg');
    const res = await rest(admin, 'POST', `/api/admin/accounts/${id}/password`, {
      password: 'cokolwiek-dlugiego',
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'OWNER_ACCOUNT' });
    expect((await login('MG', GM_PASSWORD)).statusCode).toBe(200);
  });
});

describe('sesje w panelu administratora', () => {
  it('lista trwających, „Zakończ”, dziennik z graczami i powodem', async () => {
    const admin = await adminCookie(built);
    const gm = await registerGm('sesyjny');
    const campaignId = await createCampaign(gm, 'Noc w Watson');
    const player = await joinPlayer(campaignId, 'Ola');

    const table = await seated(gm);
    const adminLive = connect(admin);
    await new Promise<void>((resolvePromise) => adminLive.once('connect', () => resolvePromise()));
    const ping = nextEvent<undefined>(adminLive, 'admin:changed');
    expect((await emitAck(table.socket, 'session:start', { campaignId })).ok).toBe(true);
    await ping;
    const playerLive = await seated(player);
    expect(playerLive.sync.scene).toBeDefined();

    let view = (await rest<AdminSessionsView>(admin, 'GET', '/api/admin/sessions')).body;
    expect(view.maxSessions).toBe(2);
    expect(view.running).toEqual([
      expect.objectContaining({ campaignId, campaignName: 'Noc w Watson', gmLogin: 'sesyjny' }),
    ]);
    expect(view.running[0]!.atTable).toEqual(['Ola']);
    const open = view.history.find((row) => row.campaignId === campaignId);
    expect(open).toMatchObject({ endedAt: null, endReason: null });
    // Gracz trafia do dziennika chwilę po posadzeniu (zapis w tle).
    await expect
      .poll(async () => {
        const rows = (await rest<AdminSessionsView>(admin, 'GET', '/api/admin/sessions')).body;
        return rows.history.find((row) => row.campaignId === campaignId)?.players;
      })
      .toEqual(['Ola']);

    // MG ani gracz nie kończą cudzym przyciskiem administratora.
    for (const cookie of [gm, player]) {
      expect((await rest(cookie, 'POST', `/api/admin/sessions/${campaignId}/end`)).status).toBe(
        403,
      );
    }
    const changed = nextEvent<SessionChangedPush>(playerLive.socket, 'session:changed');
    const end = await rest(admin, 'POST', `/api/admin/sessions/${campaignId}/end`);
    expect(end.status).toBe(200);
    expect((await changed).reason).toBe('admin');
    expect((await rest(admin, 'POST', `/api/admin/sessions/${campaignId}/end`)).status).toBe(409);

    view = (await rest<AdminSessionsView>(admin, 'GET', '/api/admin/sessions')).body;
    expect(view.running).toEqual([]);
    expect(view.history.find((row) => row.campaignId === campaignId)).toMatchObject({
      endReason: 'admin',
      players: ['Ola'],
    });
    expect(view.history.find((row) => row.campaignId === campaignId)?.endedAt).not.toBeNull();
    // MG dostaje wpis, gracz nie.
    const gmChat = await built.prisma.chatMessage.findFirst({
      where: { campaignId, kind: 'gmaction', text: { contains: 'administrator' } },
    });
    expect(gmChat).not.toBeNull();
  });
});

describe('usunięcie konta MG', () => {
  it('wymaga loginu, kończy sesję, usuwa kampanie, graczy i pliki — dziennik zostaje', async () => {
    const admin = await adminCookie(built);
    const gm = await registerGm('odchodzacy');
    const campaignId = await createCampaign(gm, 'Ostatnia robota');
    const player = await joinPlayer(campaignId, 'Zbyszek');
    const table = await seated(gm);
    expect((await emitAck(table.socket, 'session:start', { campaignId })).ok).toBe(true);
    expect(
      (await emitAck(table.socket, 'chat:send', { text: 'Do zobaczenia w Afterlife.' })).ok,
    ).toBe(true);
    const playerLive = await seated(player);
    const playerEnded = nextEvent<AuthEndedPush>(playerLive.socket, 'auth:ended');
    const uploads = join(config.uploadsDir, 'campaigns', campaignId, 'maps');
    mkdirSync(uploads, { recursive: true });
    writeFileSync(join(uploads, 'mapa.png'), 'x');
    const id = await accountId(admin, 'odchodzacy');

    const wrong = await rest(admin, 'DELETE', `/api/admin/accounts/${id}`, { confirm: 'inny' });
    expect(wrong.body).toEqual({ error: 'CONFIRM_MISMATCH' });
    expect(await built.prisma.user.findUnique({ where: { id } })).not.toBeNull();

    const removed = await rest<AdminDeleteAccountResult>(
      admin,
      'DELETE',
      `/api/admin/accounts/${id}`,
      { confirm: 'Odchodzacy' },
    );
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ campaigns: 1, players: 1 });
    expect(await playerEnded).toEqual({ reason: 'deleted' });

    expect(await built.prisma.user.findUnique({ where: { id } })).toBeNull();
    expect(await built.prisma.campaign.findUnique({ where: { id: campaignId } })).toBeNull();
    expect(await built.prisma.user.count({ where: { name: 'Zbyszek' } })).toBe(0);
    expect(await built.prisma.chatMessage.count({ where: { campaignId } })).toBe(0);
    expect(existsSync(join(config.uploadsDir, 'campaigns', campaignId))).toBe(false);
    expect((await login('odchodzacy', 'dlugie-haslo-1')).statusCode).toBe(401);

    const history = (await rest<AdminSessionsView>(admin, 'GET', '/api/admin/sessions')).body;
    expect(history.history.find((row) => row.campaignName === 'Ostatnia robota')).toMatchObject({
      campaignId: null,
      gmLogin: 'odchodzacy',
      endReason: 'deleted',
    });
  });

  it('konta właściciela nie usuwa', async () => {
    const admin = await adminCookie(built);
    const id = await accountId(admin, 'mg');
    const res = await rest(admin, 'DELETE', `/api/admin/accounts/${id}`, { confirm: 'mg' });
    expect(res.status).toBe(409);
    expect(await built.prisma.user.findUnique({ where: { id } })).not.toBeNull();
  });
});

describe('przełącznik rejestracji', () => {
  it('panel wygrywa z .env i od razu zmienia ekran logowania', async () => {
    const admin = await adminCookie(built);
    const closed = await rest<AdminSettingsView>(admin, 'POST', '/api/admin/settings', {
      registration: false,
    });
    expect(closed.body).toEqual({ registration: false });
    expect((await rest(admin, 'GET', '/api/auth/config')).body).toEqual({ registration: false });
    const refused = await built.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { login: 'spozniony', password: 'dlugie-haslo-1', repeat: 'dlugie-haslo-1' },
      remoteAddress: freshAddress(),
    });
    expect(refused.json()).toEqual({ error: 'REGISTRATION_CLOSED' });

    const reopened = await rest<AdminSettingsView>(admin, 'POST', '/api/admin/settings', {
      registration: true,
    });
    expect(reopened.body).toEqual({ registration: true });
    expect((await rest(admin, 'GET', '/api/admin/settings')).body).toEqual({ registration: true });
  });
});
