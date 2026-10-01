import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import type { AuthState } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import type { AppContext } from '../context.js';
import { verifyPassword } from '../auth/passwords.js';
import { createSession, deleteSession, toSessionUser } from '../auth/sessions.js';
import { requireAuth } from '../auth/guards.js';
import { endSessionSockets } from '../realtime/session-guard.js';
import {
  clearSessionCookie,
  getActiveCampaign,
  getUserActiveCampaign,
  refuseRateLimited,
  setSessionCookie,
} from './helpers.js';

export function registerAuthRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  io: SocketIOServer,
): void {
  app.post('/api/auth/login', async (request, reply) => {
    const { password } = (request.body ?? {}) as { password?: unknown };
    if (typeof password !== 'string' || password.length === 0) {
      return reply.code(400).send({ error: 'BAD_REQUEST' });
    }
    // #12: limit sprawdzany **przed** hasłem — zablokowany adres nie dowiaduje
    // się, czy trafił.
    if (refuseRateLimited(ctx, request, reply)) return reply;

    const gm = await ctx.prisma.user.findFirst({ where: { role: ROLE_GM } });
    if (!gm?.passwordHash || !(await verifyPassword(gm.passwordHash, password))) {
      ctx.loginLimiter?.fail(request.ip);
      return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
    }
    ctx.loginLimiter?.succeed(request.ip);

    const session = await createSession(ctx.prisma, gm.id, ctx.config.sessionTtlDays);
    setSessionCookie(reply, session);
    const state: AuthState = {
      user: toSessionUser(gm),
      activeCampaign: await getActiveCampaign(ctx.prisma),
    };
    return state;
  });

  app.post('/api/auth/logout', async (request, reply) => {
    if (request.sessionId) {
      await deleteSession(ctx.prisma, request.sessionId);
      // #11: otwarte gniazda tej sesji (inne karty też) tracą połączenie.
      endSessionSockets(io, request.sessionId, 'logout');
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
    const state: AuthState = {
      user: request.user!,
      // Gracz spoza aktywnej kampanii nie dostaje nawet jej nazwy (#10).
      activeCampaign: await getUserActiveCampaign(ctx.prisma, request.user!),
    };
    return state;
  });
}
