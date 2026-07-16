import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { CampaignDetail, InvitationSummary } from '@vtt/shared';
import type { AppContext } from '../context.js';
import { requireGm } from '../auth/guards.js';
import type { Invitation } from '../generated/prisma/client.js';

const DEFAULT_INVITATION_TTL_HOURS = 7 * 24;
const HOUR_MS = 60 * 60 * 1000;
const MAX_CAMPAIGN_NAME_LENGTH = 64;

function toInvitationSummary(invitation: Invitation): InvitationSummary {
  return {
    id: invitation.id,
    token: invitation.token,
    expiresAt: invitation.expiresAt.toISOString(),
    revoked: invitation.revokedAt !== null,
    createdAt: invitation.createdAt.toISOString(),
  };
}

export function registerCampaignRoutes(app: FastifyInstance, ctx: AppContext): void {
  const gmOnly = { preHandler: requireGm };

  app.get('/api/campaigns', gmOnly, async () => {
    const campaigns = await ctx.prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        members: { include: { user: true }, orderBy: { joinedAt: 'asc' } },
        invitations: { orderBy: { createdAt: 'desc' } },
      },
    });
    const detail: CampaignDetail[] = campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      active: c.active,
      createdAt: c.createdAt.toISOString(),
      players: c.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        joinedAt: m.joinedAt.toISOString(),
      })),
      invitations: c.invitations.map(toInvitationSummary),
    }));
    return detail;
  });

  app.post('/api/campaigns', gmOnly, async (request, reply) => {
    const { name } = (request.body ?? {}) as { name?: unknown };
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (trimmed.length === 0 || trimmed.length > MAX_CAMPAIGN_NAME_LENGTH) {
      return reply.code(400).send({ error: 'INVALID_NAME' });
    }

    // Single active campaign at a time (see stage notes) — new one takes over.
    const campaign = await ctx.prisma.$transaction(async (tx) => {
      await tx.campaign.updateMany({ data: { active: false } });
      return tx.campaign.create({ data: { name: trimmed, active: true } });
    });
    return reply.code(201).send({ id: campaign.id, name: campaign.name });
  });

  app.post('/api/campaigns/:id/invitations', gmOnly, async (request, reply) => {
    const { id } = request.params as { id: string };
    const campaign = await ctx.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    const { expiresInHours } = (request.body ?? {}) as { expiresInHours?: unknown };
    const ttlHours =
      typeof expiresInHours === 'number' && expiresInHours > 0
        ? expiresInHours
        : DEFAULT_INVITATION_TTL_HOURS;

    const invitation = await ctx.prisma.invitation.create({
      data: {
        token: randomBytes(24).toString('base64url'),
        campaignId: campaign.id,
        expiresAt: new Date(Date.now() + ttlHours * HOUR_MS),
      },
    });
    return reply.code(201).send(toInvitationSummary(invitation));
  });

  app.post('/api/invitations/:id/revoke', gmOnly, async (request, reply) => {
    const { id } = request.params as { id: string };
    const invitation = await ctx.prisma.invitation.findUnique({ where: { id } });
    if (!invitation) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
    const revoked = invitation.revokedAt
      ? invitation
      : await ctx.prisma.invitation.update({
          where: { id },
          data: { revokedAt: new Date() },
        });
    return toInvitationSummary(revoked);
  });
}
