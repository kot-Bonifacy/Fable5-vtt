import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  AuthState,
  CampaignDetail,
  CampaignSummary,
  InvitationSummary,
  JoinInfo,
  SocketAck,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

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
  // Deliberately absent: tests run on the committed sample compendium,
  // which is also the "fresh clone without data/private" path.
  dataPrivateDir: resolve(import.meta.dirname, 'fixtures/no-private-data'),
  // The gateway is never reachable in these suites — bots stay unavailable.
  aiGatewayUrl: 'http://127.0.0.1:1',
  aiGatewayApiKey: '',
  aiHealthIntervalMs: 60_000,
  aiRequestTimeoutMs: 1000,
};

let built: BuiltApp;
let baseUrl: string;
let gmCookie: string;
let playerCookie: string;
let inviteToken: string;
let invitationId: string;
let playerId: string;
let campaignId: string;
const openSockets: ClientSocket[] = [];

function cookieOf(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error('missing set-cookie header');
  return raw.split(';')[0]!;
}

function connectSocket(cookie?: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, {
      extraHeaders: cookie ? { cookie } : {},
      reconnection: false,
      timeout: 3000,
    });
    openSockets.push(socket);
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(err));
  });
}

function emitWithAck(socket: ClientSocket, event: string, payload?: unknown): Promise<SocketAck> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ack timeout')), 3000);
    const done = (response: SocketAck) => {
      clearTimeout(timer);
      resolve(response);
    };
    if (payload === undefined) socket.emit(event, done);
    else socket.emit(event, payload, done);
  });
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

describe('health', () => {
  it('responds ok', async () => {
    const res = await built.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });
});

describe('GM login', () => {
  it('rejects a wrong password', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'MG', password: 'zle-haslo' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts the GM password and sets a session cookie', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'MG', password: GM_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    const state = res.json() as AuthState;
    expect(state.user.role).toBe('GM');
    gmCookie = cookieOf(res.headers['set-cookie']);
  });

  it('returns the GM from /api/auth/me with the cookie', async () => {
    const res = await built.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: gmCookie },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as AuthState).user.name).toBe('MG');
  });

  it('rejects /api/auth/me without a cookie', async () => {
    const res = await built.app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });
});

describe('campaigns and invitations (GM)', () => {
  it('creates a campaign', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie: gmCookie },
      payload: { name: 'Testowa kampania' },
    });
    expect(res.statusCode).toBe(201);
    campaignId = (res.json() as CampaignSummary).id;
  });

  /**
   * Poligon czy stół (postulat MG z 22.08). Flaga jest **stanem**, nie
   * uprawnieniem — trasa niczego nie blokuje, a wartość ma dojechać do klienta
   * tą samą drogą, co nazwa kampanii, bo w interfejsie stoją obok siebie.
   */
  it('marks a campaign as a sandbox and back', async () => {
    const created = await built.app.inject({
      method: 'GET',
      url: '/api/campaigns',
      headers: { cookie: gmCookie },
    });
    expect((created.json() as CampaignDetail[])[0]?.sandbox).toBe(false);

    const on = await built.app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/sandbox`,
      headers: { cookie: gmCookie },
      payload: { sandbox: true },
    });
    expect(on.statusCode).toBe(200);
    expect((on.json() as CampaignSummary).sandbox).toBe(true);

    // Ta sama flaga w `/api/auth/me`: chip w pasku czyta aktywną kampanię
    // stamtąd, nie z listy kampanii.
    const me = await built.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: gmCookie },
    });
    expect((me.json() as AuthState).activeCampaign?.sandbox).toBe(true);

    const off = await built.app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/sandbox`,
      headers: { cookie: gmCookie },
      payload: { sandbox: false },
    });
    expect((off.json() as CampaignSummary).sandbox).toBe(false);
  });

  it('refuses a sandbox flag that is not a boolean', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/sandbox`,
      headers: { cookie: gmCookie },
      payload: { sandbox: 'tak' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('creates a named invitation link (stage 44b)', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/invitations`,
      headers: { cookie: gmCookie },
      payload: { name: 'Rogue' },
    });
    expect(res.statusCode).toBe(201);
    const invitation = res.json() as InvitationSummary;
    inviteToken = invitation.token;
    invitationId = invitation.id;
    expect(invitation).toMatchObject({ name: 'Rogue', renewal: false, state: 'waiting' });
    // Tydzień (decyzja MG z 03.10), nie rok jak anonimowy link sprzed 44b.
    const days = (new Date(invitation.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it('refuses a link without a name, with the GM name, or a name already waiting', async () => {
    for (const [name, error] of [
      [undefined, 'INVALID_NAME'],
      ['   ', 'INVALID_NAME'],
      ['x'.repeat(33), 'INVALID_NAME'],
      ['mg', 'NAME_TAKEN'],
      ['rogue', 'NAME_TAKEN'],
    ] as const) {
      const res = await built.app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaignId}/invitations`,
        headers: { cookie: gmCookie },
        payload: name === undefined ? {} : { name },
      });
      expect((res.json() as { error: string }).error, String(name)).toBe(error);
    }
  });
});

describe('player join flow (stage 44b — named links)', () => {
  it('shows the campaign and the name written on the link', async () => {
    const res = await built.app.inject({ method: 'GET', url: `/api/join/${inviteToken}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      campaignName: 'Testowa kampania',
      playerName: 'Rogue',
      renewal: false,
    } satisfies JoinInfo);
  });

  it('joins under the name from the link, whatever the form says', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: `/api/join/${inviteToken}`,
      payload: { name: 'Ktoś inny' },
    });
    expect(res.statusCode).toBe(200);
    const state = res.json() as AuthState;
    expect(state.user).toMatchObject({ role: 'PLAYER', name: 'Rogue' });
    expect(state.activeCampaign?.id).toBe(campaignId);
    playerCookie = cookieOf(res.headers['set-cookie']);
    playerId = state.user.id;
  });

  it('works once — a used link says so, for both info and join', async () => {
    const info = await built.app.inject({ method: 'GET', url: `/api/join/${inviteToken}` });
    expect(info.statusCode).toBe(410);
    expect(info.json()).toEqual({ error: 'INVITATION_USED' });
    const again = await built.app.inject({ method: 'POST', url: `/api/join/${inviteToken}` });
    expect(again.statusCode).toBe(410);
    const listed = await built.app.inject({
      method: 'GET',
      url: '/api/campaigns',
      headers: { cookie: gmCookie },
    });
    const link = (listed.json() as CampaignDetail[])
      .flatMap((campaign) => campaign.invitations)
      .find((row) => row.id === invitationId);
    expect(link).toMatchObject({ state: 'used', name: 'Rogue' });
    expect(link?.usedAt).not.toBeNull();
  });

  it('a renewal link opens the same account and keeps the other device signed in', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/players/${playerId}/renewal`,
      headers: { cookie: gmCookie },
    });
    expect(res.statusCode).toBe(201);
    const renewal = res.json() as InvitationSummary;
    expect(renewal).toMatchObject({ name: 'Rogue', renewal: true, state: 'waiting' });
    const info = await built.app.inject({ method: 'GET', url: `/api/join/${renewal.token}` });
    expect(info.json()).toMatchObject({ playerName: 'Rogue', renewal: true });

    const join = await built.app.inject({ method: 'POST', url: `/api/join/${renewal.token}` });
    expect(join.statusCode).toBe(200);
    expect((join.json() as AuthState).user.id).toBe(playerId);
    // Stary komputer dalej zalogowany (decyzja MG z 03.10).
    const me = await built.app.inject({ url: '/api/auth/me', headers: { cookie: playerCookie } });
    expect((me.json() as AuthState).user.id).toBe(playerId);
    const second = await built.app.inject({ method: 'POST', url: `/api/join/${renewal.token}` });
    expect(second.statusCode).toBe(410);
  });

  it('a newer renewal link voids the older one still waiting', async () => {
    const issue = async () =>
      (
        await built.app.inject({
          method: 'POST',
          url: `/api/campaigns/${campaignId}/players/${playerId}/renewal`,
          headers: { cookie: gmCookie },
        })
      ).json() as InvitationSummary;
    const older = await issue();
    await issue();
    const res = await built.app.inject({ method: 'GET', url: `/api/join/${older.token}` });
    expect(res.statusCode).toBe(404);
  });

  it('refuses a renewal for somebody who is not a player of this campaign', async () => {
    const gm = await built.prisma.user.findFirstOrThrow({ where: { login: 'mg' } });
    for (const userId of ['nie-ma-takiego', gm.id]) {
      const res = await built.app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaignId}/players/${userId}/renewal`,
        headers: { cookie: gmCookie },
      });
      expect(res.statusCode).toBe(404);
    }
  });

  it('refuses a new-player link for a name somebody already plays', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/invitations`,
      headers: { cookie: gmCookie },
      payload: { name: 'ROGUE' },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toBe('NAME_TAKEN');
  });

  it('rejects an unknown token', async () => {
    const res = await built.app.inject({ method: 'GET', url: '/api/join/nie-ma-takiego' });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an expired invitation with its own code', async () => {
    const expired = await built.prisma.invitation.create({
      data: {
        token: 'expired-token',
        campaignId,
        name: 'Spóźniony',
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const res = await built.app.inject({ method: 'GET', url: `/api/join/${expired.token}` });
    expect(res.statusCode).toBe(410);
    expect(res.json()).toEqual({ error: 'INVITATION_EXPIRED' });
  });

  it('a pre-44b anonymous link no longer lets anybody in', async () => {
    const legacy = await built.prisma.invitation.create({
      data: { token: 'anonimowy', campaignId, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const res = await built.app.inject({
      method: 'POST',
      url: `/api/join/${legacy.token}`,
      payload: { name: 'Rogue' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('role enforcement (HTTP)', () => {
  it('denies campaign creation to a player', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie: playerCookie },
      payload: { name: 'Nielegalna' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('denies campaign creation to anonymous users', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/campaigns',
      payload: { name: 'Nielegalna' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('denies invitation listing to a player', async () => {
    const res = await built.app.inject({
      method: 'GET',
      url: '/api/campaigns',
      headers: { cookie: playerCookie },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('invitation revocation', () => {
  it('revokes a waiting link and refuses it for both info and join', async () => {
    const created = await built.app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/invitations`,
      headers: { cookie: gmCookie },
      payload: { name: 'Odwołany' },
    });
    const link = created.json() as InvitationSummary;
    const res = await built.app.inject({
      method: 'POST',
      url: `/api/invitations/${link.id}/revoke`,
      headers: { cookie: gmCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ revoked: true, state: 'revoked' });

    const infoRes = await built.app.inject({ method: 'GET', url: `/api/join/${link.token}` });
    expect(infoRes.statusCode).toBe(404);
    const joinRes = await built.app.inject({ method: 'POST', url: `/api/join/${link.token}` });
    expect(joinRes.statusCode).toBe(404);
    // Imię z unieważnionego linku wolno dać od nowa.
    const again = await built.app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/invitations`,
      headers: { cookie: gmCookie },
      payload: { name: 'Odwołany' },
    });
    expect(again.statusCode).toBe(201);
  });
});

describe('role enforcement (Socket.IO)', () => {
  it('rejects a socket handshake without a session', async () => {
    await expect(connectSocket()).rejects.toThrow();
  });

  /*
   * Bramka roli na żywym zdarzeniu (etap 35).
   *
   * Do 05.09 pilnowała jej atrapa `gm:ping` z etapu 03 — nazwa bez treści,
   * którą etap 35 wreszcie zastąpił prawdziwym pingiem mapy (`map:ping`, dla
   * każdego przy stole). Pokrycie samego wzorca zostaje tutaj, przeniesione na
   * pierwsze lepsze zdarzenie tylko dla MG: rejestr sprawdza rolę **przed**
   * wejściem w handler, więc gracz odbija się o `FORBIDDEN`, a MG dochodzi do
   * środka i dostaje odmowę merytoryczną (nie ma takiej figury). Ta różnica
   * kodów jest dowodem, że bramka przepuściła jednego, a drugiego nie.
   */
  it('przepuszcza MG przez bramkę roli do zdarzenia tylko dla MG', async () => {
    const socket = await connectSocket(gmCookie);
    const ack = await emitWithAck(socket, 'token:duplicate', { tokenId: 'brak' });
    expect(ack).toEqual({ ok: false, error: 'TOKEN_NOT_FOUND' });
  });

  it('odbija gracza od zdarzenia tylko dla MG', async () => {
    const socket = await connectSocket(playerCookie);
    const ack = await emitWithAck(socket, 'token:duplicate', { tokenId: 'brak' });
    expect(ack).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});
