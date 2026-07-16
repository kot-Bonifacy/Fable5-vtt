import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { AuthState, CampaignSummary, InvitationSummary, JoinInfo, SocketAck } from '@vtt/shared';
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
};

let built: BuiltApp;
let baseUrl: string;
let gmCookie: string;
let playerCookie: string;
let inviteToken: string;
let invitationId: string;
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

function emitWithAck(socket: ClientSocket, event: string): Promise<SocketAck> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ack timeout')), 3000);
    socket.emit(event, (response: SocketAck) => {
      clearTimeout(timer);
      resolve(response);
    });
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
      payload: { password: 'zle-haslo' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts the GM password and sets a session cookie', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: GM_PASSWORD },
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

  it('creates an invitation link', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/invitations`,
      headers: { cookie: gmCookie },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const invitation = res.json() as InvitationSummary;
    inviteToken = invitation.token;
    invitationId = invitation.id;
    expect(invitation.revoked).toBe(false);
  });
});

describe('player join flow', () => {
  it('shows campaign info for a valid token', async () => {
    const res = await built.app.inject({ method: 'GET', url: `/api/join/${inviteToken}` });
    expect(res.statusCode).toBe(200);
    const info = res.json() as JoinInfo;
    expect(info.campaignName).toBe('Testowa kampania');
    expect(info.players).toEqual([]);
  });

  it('lets a player join with a fresh name', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: `/api/join/${inviteToken}`,
      payload: { name: 'Rogue' },
    });
    expect(res.statusCode).toBe(200);
    const state = res.json() as AuthState;
    expect(state.user.role).toBe('PLAYER');
    expect(state.activeCampaign?.id).toBe(campaignId);
    playerCookie = cookieOf(res.headers['set-cookie']);
  });

  it('lists the player for the next join attempt', async () => {
    const res = await built.app.inject({ method: 'GET', url: `/api/join/${inviteToken}` });
    expect((res.json() as JoinInfo).players).toEqual(['Rogue']);
  });

  it('rejects joining with the GM name', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: `/api/join/${inviteToken}`,
      payload: { name: 'MG' },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe('NAME_TAKEN');
  });

  it('rejects an unknown token', async () => {
    const res = await built.app.inject({ method: 'GET', url: '/api/join/nie-ma-takiego' });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an expired invitation', async () => {
    const expired = await built.prisma.invitation.create({
      data: {
        token: 'expired-token',
        campaignId,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const res = await built.app.inject({ method: 'GET', url: `/api/join/${expired.token}` });
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
  it('revokes the invitation', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: `/api/invitations/${invitationId}/revoke`,
      headers: { cookie: gmCookie },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as InvitationSummary).revoked).toBe(true);
  });

  it('rejects the revoked link for both info and join', async () => {
    const infoRes = await built.app.inject({ method: 'GET', url: `/api/join/${inviteToken}` });
    expect(infoRes.statusCode).toBe(404);
    const joinRes = await built.app.inject({
      method: 'POST',
      url: `/api/join/${inviteToken}`,
      payload: { name: 'Ktokolwiek' },
    });
    expect(joinRes.statusCode).toBe(404);
  });
});

describe('role enforcement (Socket.IO)', () => {
  it('rejects a socket handshake without a session', async () => {
    await expect(connectSocket()).rejects.toThrow();
  });

  it('answers gm:ping for the GM', async () => {
    const socket = await connectSocket(gmCookie);
    const ack = await emitWithAck(socket, 'gm:ping');
    expect(ack).toEqual({ ok: true });
  });

  it('denies gm:ping for a player', async () => {
    const socket = await connectSocket(playerCookie);
    const ack = await emitWithAck(socket, 'gm:ping');
    expect(ack).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});
