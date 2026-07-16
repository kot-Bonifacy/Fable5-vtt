import type { FastifyInstance } from 'fastify';
import type { AuthState } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import type { AppContext } from '../context.js';
import { verifyPassword } from '../auth/passwords.js';
import { createSession, deleteSession, toSessionUser } from '../auth/sessions.js';
import { requireAuth } from '../auth/guards.js';
import { clearSessionCookie, getActiveCampaign, setSessionCookie } from './helpers.js';

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post('/api/auth/login', async (request, reply) => {
    const { password } = (request.body ?? {}) as { password?: unknown };
    if (typeof password !== 'string' || password.length === 0) {
      return reply.code(400).send({ error: 'BAD_REQUEST' });
    }

    const gm = await ctx.prisma.user.findFirst({ where: { role: ROLE_GM } });
    if (!gm?.passwordHash || !(await verifyPassword(gm.passwordHash, password))) {
      return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
    }

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
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
    const state: AuthState = {
      user: request.user!,
      activeCampaign: await getActiveCampaign(ctx.prisma),
    };
    return state;
  });
}
