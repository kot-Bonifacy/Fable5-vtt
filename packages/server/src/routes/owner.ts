import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import type { GmAccountView } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import type { AppContext } from '../context.js';
import type { User } from '../generated/prisma/client.js';
import { requireOwner } from '../auth/guards.js';
import { createPasswordReset } from '../auth/password-reset.js';
import { endUserSessions } from '../auth/sessions.js';

/**
 * Panel właściciela serwera (etap 44a): konta MG, reset hasła i blokada.
 *
 * Konta właściciela (flaga `owner`) stoją na liście, ale ani resetu, ani
 * blokady nie dostają — hasło bierze się z `.env`, a zablokowanie samego
 * siebie zamknęłoby jedyne drzwi do tego panelu.
 */
export function registerOwnerRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  io: SocketIOServer,
): void {
  const ownerOnly = { preHandler: requireOwner };

  app.get('/api/owner/accounts', ownerOnly, async () => {
    const users = await ctx.prisma.user.findMany({
      where: { role: ROLE_GM },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { campaignsRun: true } } },
    });
    const accounts: GmAccountView[] = users.map((user) => ({
      id: user.id,
      login: user.login ?? user.name,
      owner: user.owner,
      blocked: user.blockedAt !== null,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
      campaigns: user._count.campaignsRun,
    }));
    return accounts;
  });

  /** Konto MG, które właściciel może ruszyć — albo kod odmowy. */
  async function managedAccount(
    id: string,
  ): Promise<{ user: User } | { error: string; status: number }> {
    const user = await ctx.prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== ROLE_GM) return { error: 'NOT_FOUND', status: 404 };
    if (user.owner) return { error: 'OWNER_ACCOUNT', status: 409 };
    return { user };
  }

  /** Jednorazowy link ustawienia hasła, ważny dobę — właściciel przekazuje go poza VTT. */
  app.post('/api/owner/accounts/:id/reset', ownerOnly, async (request, reply) => {
    const { id } = request.params as { id: string };
    const found = await managedAccount(id);
    if ('error' in found) return reply.code(found.status).send({ error: found.error });
    return reply.code(201).send(await createPasswordReset(ctx.prisma, found.user.id));
  });

  /**
   * „Zablokuj” / „Odblokuj” (decyzja MG z 03.10). Blokada kończy każdą sesję
   * konta i odmawia logowania; kampanie zostają w bazie nietknięte.
   */
  app.post('/api/owner/accounts/:id/block', ownerOnly, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { blocked } = (request.body ?? {}) as { blocked?: unknown };
    if (typeof blocked !== 'boolean') return reply.code(400).send({ error: 'BAD_REQUEST' });
    const found = await managedAccount(id);
    if ('error' in found) return reply.code(found.status).send({ error: found.error });

    await ctx.prisma.user.update({
      where: { id: found.user.id },
      data: { blockedAt: blocked ? (found.user.blockedAt ?? new Date()) : null },
    });
    if (blocked) await endUserSessions(ctx.prisma, io, found.user.id, 'blocked');
    // Zablokowany MG traci też zgodę na AI właściciela (44d) — od razu.
    await ctx.ai.refresh();
    request.log.info({ userId: found.user.id, blocked }, 'GM account block changed');
    return { ok: true };
  });
}
