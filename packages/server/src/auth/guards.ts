import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SessionUser } from '@vtt/shared';
import { ROLE_ADMIN, ROLE_GM } from '@vtt/shared';

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

/**
 * Konto administratora (etap 53): konta MG, sesje i ich dziennik, AI
 * właściciela, rejestracja i kopie całej bazy. Do etapu 53 to samo robiło
 * konto MG z flagą właściciela — dziś ono już nie zarządza (decyzja MG z 17.10).
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    return reply.code(401).send({ error: 'UNAUTHORIZED' });
  }
  if (request.user.role !== ROLE_ADMIN) {
    return reply.code(403).send({ error: 'FORBIDDEN' });
  }
}

/** Konto z hasłem: MG albo administrator (zmiana własnego hasła, etap 53). */
export async function requirePasswordAccount(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    return reply.code(401).send({ error: 'UNAUTHORIZED' });
  }
  if (request.user.role !== ROLE_GM && request.user.role !== ROLE_ADMIN) {
    return reply.code(403).send({ error: 'FORBIDDEN' });
  }
}

/**
 * Trasy, które konto z hasłem tymczasowym (etap 53) dostaje, zanim ustawi
 * własne: kim jestem, zmiana hasła, wylogowanie — i drogi wejścia, które
 * w ogóle nie czytają zalogowanego konta.
 */
export const TEMPORARY_PASSWORD_ROUTES = new Set([
  '/api/auth/me',
  '/api/auth/password',
  '/api/auth/logout',
  '/api/auth/config',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/reset/:token',
  '/api/join/:token',
]);
