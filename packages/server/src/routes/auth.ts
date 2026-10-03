import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import type { AuthConfig, AuthState, PasswordResetInfo } from '@vtt/shared';
import { ROLE_GM, gmLoginError, gmPasswordError, normalizeGmLogin } from '@vtt/shared';
import type { AppContext } from '../context.js';
import { Prisma, type User } from '../generated/prisma/client.js';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import { createSession, deleteSession, endUserSessions, toSessionUser } from '../auth/sessions.js';
import { consumePasswordReset, findValidPasswordReset } from '../auth/password-reset.js';
import { requireAuth, requireGm } from '../auth/guards.js';
import { endSessionSockets } from '../realtime/session-guard.js';
import {
  clearSessionCookie,
  getUserActiveCampaign,
  refuseRateLimited,
  setSessionCookie,
} from './helpers.js';

/** Imię przy stole każdego konta MG z rejestracji (decyzja MG z 03.10). */
const REGISTERED_GM_NAME = 'MG';

function stringField(body: unknown, key: string): string | null {
  const value = (body as Record<string, unknown> | null | undefined)?.[key];
  return typeof value === 'string' ? value : null;
}

/** Sesja, ciasteczko i stan logowania — wspólny koniec logowania, rejestracji i resetu. */
async function signIn(ctx: AppContext, reply: FastifyReply, user: User): Promise<AuthState> {
  const session = await createSession(ctx.prisma, user.id, ctx.config.sessionTtlDays);
  setSessionCookie(reply, session);
  const sessionUser = toSessionUser(user);
  return {
    user: sessionUser,
    activeCampaign: await getUserActiveCampaign(ctx.prisma, sessionUser),
  };
}

/** 429 z `Retry-After` po pięciu kontach z jednego adresu w ciągu godziny (44a). */
function refuseTooManyRegistrations(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const retryAfter = ctx.registrationLimiter?.retryAfter(request.ip) ?? null;
  if (retryAfter === null) return false;
  void reply
    .code(429)
    .header('Retry-After', String(retryAfter))
    .send({ error: 'TOO_MANY_REGISTRATIONS', retryAfter });
  return true;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  io: SocketIOServer,
): void {
  /** Co pokazać na ekranie logowania, zanim ktokolwiek się zaloguje. */
  app.get('/api/auth/config', async () => {
    const config: AuthConfig = { registration: ctx.config.registrationOpen !== false };
    return config;
  });

  /**
   * Logowanie MG loginem i hasłem (etap 44a). Zły login i złe hasło dają ten sam
   * kod — odpowiedź nie mówi, czy login istnieje. Blokada wychodzi dopiero po
   * dobrym haśle, więc nie zdradza niczego zgadującemu.
   */
  app.post('/api/auth/login', async (request, reply) => {
    const login = stringField(request.body, 'login');
    const password = stringField(request.body, 'password');
    if (login === null || password === null || login.trim().length === 0 || !password) {
      return reply.code(400).send({ error: 'BAD_REQUEST' });
    }
    // #12: limit sprawdzany **przed** hasłem — zablokowany adres nie dowiaduje
    // się, czy trafił.
    if (refuseRateLimited(ctx, request, reply)) return reply;

    const gm = await ctx.prisma.user.findUnique({ where: { login: normalizeGmLogin(login) } });
    const valid =
      gm?.role === ROLE_GM &&
      gm.passwordHash !== null &&
      (await verifyPassword(gm.passwordHash, password));
    if (!gm || !valid) {
      ctx.loginLimiter?.fail(request.ip);
      return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
    }
    ctx.loginLimiter?.succeed(request.ip);
    if (gm.blockedAt) return reply.code(403).send({ error: 'ACCOUNT_BLOCKED' });

    const seen = await ctx.prisma.user.update({
      where: { id: gm.id },
      data: { lastSeenAt: new Date() },
    });
    return signIn(ctx, reply, seen);
  });

  /**
   * Rejestracja konta MG (etap 44a): login, hasło, powtórzenie — i od razu
   * zalogowany. Konto siada przy stole jako „MG”; login służy tylko do wejścia.
   */
  app.post('/api/auth/register', async (request, reply) => {
    if (ctx.config.registrationOpen === false) {
      return reply.code(403).send({ error: 'REGISTRATION_CLOSED' });
    }
    const login = stringField(request.body, 'login');
    const password = stringField(request.body, 'password');
    const repeat = stringField(request.body, 'repeat');
    if (login === null || password === null || repeat === null) {
      return reply.code(400).send({ error: 'BAD_REQUEST' });
    }
    const invalid = gmLoginError(login) ?? gmPasswordError(password, repeat, login);
    if (invalid) return reply.code(400).send({ error: invalid });
    if (refuseTooManyRegistrations(ctx, request, reply)) return reply;

    const normalized = normalizeGmLogin(login);
    // Login właściciela jest zajęty także wtedy, gdy jego konta jeszcze nie ma
    // (`GM_PASSWORD` pusty) — inaczej pierwszy chętny zostałby właścicielem.
    if (normalized === normalizeGmLogin(ctx.config.gmName)) {
      return reply.code(409).send({ error: 'LOGIN_TAKEN' });
    }
    let user: User;
    try {
      user = await ctx.prisma.user.create({
        data: {
          name: REGISTERED_GM_NAME,
          login: normalized,
          role: ROLE_GM,
          passwordHash: await hashPassword(password),
          lastSeenAt: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return reply.code(409).send({ error: 'LOGIN_TAKEN' });
      }
      throw error;
    }
    ctx.registrationLimiter?.fail(request.ip);
    request.log.info({ userId: user.id, login: normalized }, 'GM account registered');
    return reply.code(201).send(await signIn(ctx, reply, user));
  });

  /**
   * Zmiana hasła MG (etap 44a): obecne i nowe dwa razy. Inne sesje konta są
   * wylogowane, ta zostaje. Konto właściciela bierze hasło z `.env` — tu by się
   * zmieniło do najbliższego restartu, więc odmowa.
   */
  app.post('/api/auth/password', { preHandler: requireGm }, async (request, reply) => {
    const user = request.user!;
    if (user.owner) return reply.code(409).send({ error: 'PASSWORD_FROM_ENV' });
    const current = stringField(request.body, 'current');
    const password = stringField(request.body, 'password');
    const repeat = stringField(request.body, 'repeat');
    if (current === null || password === null || repeat === null) {
      return reply.code(400).send({ error: 'BAD_REQUEST' });
    }
    if (refuseRateLimited(ctx, request, reply)) return reply;

    const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!row.passwordHash || !(await verifyPassword(row.passwordHash, current))) {
      ctx.loginLimiter?.fail(request.ip);
      return reply.code(401).send({ error: 'WRONG_PASSWORD' });
    }
    const invalid = gmPasswordError(password, repeat, row.login);
    if (invalid) return reply.code(400).send({ error: invalid });

    await ctx.prisma.user.update({
      where: { id: row.id },
      data: { passwordHash: await hashPassword(password) },
    });
    await endUserSessions(ctx.prisma, io, row.id, 'password', request.sessionId);
    return { ok: true };
  });

  /** Czyje hasło ustawia link — ekran pokazuje login, zanim MG wpisze nowe. */
  app.get('/api/auth/reset/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    // Zgadywanie linków liczy się do limitu złych haseł, jak zaproszenia (#12).
    if (refuseRateLimited(ctx, request, reply)) return reply;
    const reset = await findValidPasswordReset(ctx.prisma, token);
    if (!reset?.user.login) {
      ctx.loginLimiter?.fail(request.ip);
      return reply.code(404).send({ error: 'INVALID_RESET' });
    }
    const info: PasswordResetInfo = { login: reset.user.login };
    return info;
  });

  /**
   * Ustawienie hasła z linku od właściciela (etap 44a). Link działa raz; każda
   * dotychczasowa sesja konta kończy się, a ta przeglądarka wchodzi od razu.
   */
  app.post('/api/auth/reset/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    if (refuseRateLimited(ctx, request, reply)) return reply;
    const reset = await findValidPasswordReset(ctx.prisma, token);
    if (!reset?.user.login) {
      ctx.loginLimiter?.fail(request.ip);
      return reply.code(404).send({ error: 'INVALID_RESET' });
    }
    const password = stringField(request.body, 'password');
    const repeat = stringField(request.body, 'repeat');
    if (password === null || repeat === null) {
      return reply.code(400).send({ error: 'BAD_REQUEST' });
    }
    const invalid = gmPasswordError(password, repeat, reset.user.login);
    if (invalid) return reply.code(400).send({ error: invalid });
    if (reset.user.blockedAt) return reply.code(403).send({ error: 'ACCOUNT_BLOCKED' });
    if (!(await consumePasswordReset(ctx.prisma, reset.id))) {
      return reply.code(404).send({ error: 'INVALID_RESET' });
    }

    const user = await ctx.prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash: await hashPassword(password), lastSeenAt: new Date() },
    });
    await endUserSessions(ctx.prisma, io, user.id, 'password');
    return signIn(ctx, reply, user);
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
      // Gracz spoza aktywnej kampanii nie dostaje nawet jej nazwy (#10), MG —
      // cudzej kampanii (44a).
      activeCampaign: await getUserActiveCampaign(ctx.prisma, request.user!),
    };
    return state;
  });
}
