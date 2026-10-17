import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import type { AiAccessDecision, AiAccessStatus, SessionUser } from '@vtt/shared';
import { isAiAccessStatus, normalizeGmLogin, ROLE_GM, ROLE_PLAYER } from '@vtt/shared';
import type { AppContext } from '../context.js';
import { requireAdmin, requireAuth, requireGm } from '../auth/guards.js';
import { verifyPassword } from '../auth/passwords.js';
import {
  aiAccessView,
  buildOwnerAiState,
  pushMyAiAccess,
  pushOwnerAiState,
} from '../realtime/ai-access.js';
import { refuseRateLimited } from './helpers.js';
import { notifyAdmins } from '../realtime/admin-room.js';

/**
 * AI właściciela (etap 44d) — trasy.
 *
 * - MG bez własnego AI: `GET /api/ai-access`, `POST /api/ai-access/request`.
 * - Administrator (etap 53; do 53 — każde konto z flagą właściciela):
 *   `GET /api/admin/ai`, decyzja o prośbie, „Udostępniam AI”, „Przejmij AI”.
 * - Gracz: `POST`/`DELETE /api/auth/owner-link` — „To konto właściciela”
 *   z loginem i hasłem konta MG właściciela (decyzja MG z 04.10). Od etapu 53
 *   flaga daje już tylko obecność właściciela — panel AI ma administrator.
 */

/**
 * Skąd do czego wolno przejść decyzją administratora. Zgoda także bez prośby
 * (`none`, etap 53): administrator nadaje AI z listy kont MG.
 */
const DECISIONS: Record<AiAccessDecision, { from: AiAccessStatus[]; to: AiAccessStatus }> = {
  grant: { from: ['none', 'requested', 'rejected', 'revoked'], to: 'granted' },
  reject: { from: ['requested'], to: 'rejected' },
  revoke: { from: ['granted'], to: 'revoked' },
};

function isDecision(value: unknown): value is AiAccessDecision {
  return value === 'grant' || value === 'reject' || value === 'revoke';
}

export function registerAiAccessRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  io: SocketIOServer,
): void {
  const push = { io, ctx };

  /** Po zmianie zgody: brama liczy prawo od nowa, właściciel i MG widzą nowy stan. */
  async function afterChange(userId: string): Promise<void> {
    await ctx.ai.refresh();
    await pushOwnerAiState(push);
    await pushMyAiAccess(push, userId);
  }

  app.get('/api/ai-access', { preHandler: requireGm }, async (request) => {
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: request.user!.id } });
    return aiAccessView(user);
  });

  /**
   * „Poproś o dostęp do AI właściciela”. Odrzucona albo cofnięta prośba może
   * wrócić; czekająca i zatwierdzona zostają, jak są (podwójny klik nic nie psuje).
   */
  app.post('/api/ai-access/request', { preHandler: requireGm }, async (request, reply) => {
    const me = request.user!;
    if (me.owner) return reply.code(409).send({ error: 'OWNER_ACCOUNT' });
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    const status = isAiAccessStatus(user.aiAccess) ? user.aiAccess : 'none';
    if (status === 'requested' || status === 'granted') return aiAccessView(user);
    const updated = await ctx.prisma.user.update({
      where: { id: me.id },
      data: { aiAccess: 'requested', aiRequestedAt: new Date(), aiDecidedAt: null },
    });
    request.log.info({ userId: me.id }, 'AI access requested');
    await afterChange(me.id);
    notifyAdmins(io);
    return aiAccessView(updated);
  });

  app.get('/api/admin/ai', { preHandler: requireAdmin }, async () => buildOwnerAiState(ctx));

  /** „Zatwierdź”, „Odrzuć”, „Cofnij” — cofnięcie działa od razu, bez restartu. */
  app.post(
    '/api/admin/ai/requests/:userId',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const { decision } = (request.body ?? {}) as { decision?: unknown };
      if (!isDecision(decision)) return reply.code(400).send({ error: 'BAD_REQUEST' });
      const user = await ctx.prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.role !== ROLE_GM || user.owner) {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      const status = isAiAccessStatus(user.aiAccess) ? user.aiAccess : 'none';
      const rule = DECISIONS[decision];
      if (!rule.from.includes(status)) return reply.code(409).send({ error: 'BAD_DECISION' });
      await ctx.prisma.user.update({
        where: { id: userId },
        data: { aiAccess: rule.to, aiDecidedAt: new Date() },
      });
      notifyAdmins(io);
      request.log.info({ userId, decision }, 'AI access decided');
      await afterChange(userId);
      return buildOwnerAiState(ctx);
    },
  );

  /** „Udostępniam AI” — w pamięci serwera; po restarcie i nowym wejściu wyłączony. */
  app.post('/api/admin/ai/sharing', { preHandler: requireAdmin }, async (request, reply) => {
    const { on } = (request.body ?? {}) as { on?: unknown };
    if (typeof on !== 'boolean') return reply.code(400).send({ error: 'BAD_REQUEST' });
    ctx.ai.setSharing(on);
    request.log.info({ on }, 'owner AI sharing changed');
    return buildOwnerAiState(ctx);
  });

  /** „Przejmij AI” — tylko dla trwającej sesji z konta MG właściciela. */
  app.post('/api/admin/ai/take', { preHandler: requireAdmin }, async (request, reply) => {
    const refused = ctx.ai.takeOver();
    if (refused) return reply.code(409).send({ error: refused });
    request.log.info('owner took the AI over');
    return buildOwnerAiState(ctx);
  });

  /** Gniazda konta dostają nową flagę od razu — obecność właściciela i panel. */
  function setLiveOwnerFlag(userId: string, owner: boolean): void {
    for (const socket of io.sockets.sockets.values()) {
      const user = socket.data.user as SessionUser | undefined;
      if (user?.id !== userId) continue;
      socket.data.user = { ...user, owner };
      if (owner) ctx.ai.ownerConnected(socket.id);
      else ctx.ai.ownerDisconnected(socket.id);
    }
  }

  /**
   * „To konto właściciela” na koncie gracza: login i hasło konta MG właściciela
   * dają flagę. Złe hasło liczy się do limitu prób jak logowanie (#12).
   */
  app.post('/api/auth/owner-link', { preHandler: requireAuth }, async (request, reply) => {
    const me = request.user!;
    if (me.role !== ROLE_PLAYER) return reply.code(403).send({ error: 'FORBIDDEN' });
    const body = (request.body ?? {}) as { login?: unknown; password?: unknown };
    if (typeof body.login !== 'string' || typeof body.password !== 'string' || !body.password) {
      return reply.code(400).send({ error: 'BAD_REQUEST' });
    }
    if (refuseRateLimited(ctx, request, reply)) return reply;
    const owner = await ctx.prisma.user.findUnique({
      where: { login: normalizeGmLogin(body.login) },
    });
    const valid =
      owner?.role === ROLE_GM &&
      owner.owner &&
      owner.passwordHash !== null &&
      (await verifyPassword(owner.passwordHash, body.password));
    if (!valid) {
      ctx.loginLimiter?.fail(request.ip);
      return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
    }
    ctx.loginLimiter?.succeed(request.ip);
    await ctx.prisma.user.update({ where: { id: me.id }, data: { owner: true } });
    setLiveOwnerFlag(me.id, true);
    request.log.info({ userId: me.id }, 'player account linked to the owner');
    await pushOwnerAiState(push);
    return { owner: true };
  });

  app.delete('/api/auth/owner-link', { preHandler: requireAuth }, async (request, reply) => {
    const me = request.user!;
    if (me.role !== ROLE_PLAYER) return reply.code(403).send({ error: 'FORBIDDEN' });
    await ctx.prisma.user.update({ where: { id: me.id }, data: { owner: false } });
    setLiveOwnerFlag(me.id, false);
    request.log.info({ userId: me.id }, 'player account unlinked from the owner');
    return { owner: false };
  });
}
