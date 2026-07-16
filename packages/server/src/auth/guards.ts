import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SessionUser } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
    /** Id of the session backing `user`, when authenticated via cookie. */
    sessionId: string | null;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    return reply.code(401).send({ error: 'UNAUTHORIZED' });
  }
}

export async function requireGm(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    return reply.code(401).send({ error: 'UNAUTHORIZED' });
  }
  if (request.user.role !== ROLE_GM) {
    return reply.code(403).send({ error: 'FORBIDDEN' });
  }
}
