import type { FastifyInstance } from 'fastify';
import type { AuthState, JoinInfo } from '@vtt/shared';
import { ROLE_PLAYER } from '@vtt/shared';
import type { AppContext } from '../context.js';
import type { PrismaClient } from '../db.js';
import { createSession, toSessionUser } from '../auth/sessions.js';
import { setSessionCookie } from './helpers.js';

const MAX_NAME_LENGTH = 32;

async function findValidInvitation(prisma: PrismaClient, token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { campaign: true },
  });
  if (!invitation || invitation.revokedAt || invitation.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  return invitation;
}

export function registerJoinRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/join/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const invitation = await findValidInvitation(ctx.prisma, token);
    if (!invitation) {
      return reply.code(404).send({ error: 'INVALID_INVITATION' });
    }

    const members = await ctx.prisma.campaignMember.findMany({
      where: { campaignId: invitation.campaignId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    });
    const info: JoinInfo = {
      campaignName: invitation.campaign.name,
      players: members.map((m) => m.user.name),
    };
    return info;
  });

  app.post('/api/join/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const invitation = await findValidInvitation(ctx.prisma, token);
    if (!invitation) {
      return reply.code(404).send({ error: 'INVALID_INVITATION' });
    }

    const { name } = (request.body ?? {}) as { name?: unknown };
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
      return reply.code(400).send({ error: 'INVALID_NAME' });
    }

    // Same name = same player returning (trusted friends group, no password).
    const existing = await ctx.prisma.user.findUnique({ where: { name: trimmed } });
    if (existing && existing.role !== ROLE_PLAYER) {
      return reply.code(400).send({ error: 'NAME_TAKEN' });
    }
    const user =
      existing ??
      (await ctx.prisma.user.create({ data: { name: trimmed, role: ROLE_PLAYER } }));

    await ctx.prisma.campaignMember.upsert({
      where: { campaignId_userId: { campaignId: invitation.campaignId, userId: user.id } },
      update: {},
      create: { campaignId: invitation.campaignId, userId: user.id },
    });

    const session = await createSession(ctx.prisma, user.id, ctx.config.sessionTtlDays);
    setSessionCookie(reply, session);
    const state: AuthState = {
      user: toSessionUser(user),
      activeCampaign: { id: invitation.campaign.id, name: invitation.campaign.name },
    };
    return state;
  });
}
