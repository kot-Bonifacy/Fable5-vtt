import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { CampaignDetail, CpredDataPayload, InvitationSummary } from '@vtt/shared';
import { GAME_TIME_DEFAULT, gameMonthKey } from '@vtt/shared';
import type { AppContext } from '../context.js';
import { requireAuth, requireGm } from '../auth/guards.js';
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

  /**
   * The cover catalogue (stage 16c) — material × thickness and the presets.
   *
   * Served from the server's own copy rather than as a static file, and that is
   * the whole reason the route exists: `data/private/` **replaces** its public
   * counterpart, the private directory is never served, and a palette reading
   * the public samples would advertise body points the server does not use. One
   * source of the numbers, on the side that decides them.
   */
  app.get('/api/cpred/covers', async () => ctx.covers);

  /**
   * Skills, Roles and the character-creation tables — the same registry the
   * server validates sheets against.
   *
   * Same reason as the covers route above, and the same bug it was written to
   * avoid: until stage 25a the client read `/public/cpred/skills.json` off the
   * static route, so it knew the 42 sample skills while the server knew the 66
   * imported from the rulebook. Twenty-four skills existed on one side of the
   * socket only. Behind `requireAuth`, because the private files are rulebook
   * content and the static route is open to anyone.
   */
  app.get('/api/cpred/data', { preHandler: requireAuth }, async () => {
    const payload: CpredDataPayload = {
      skills: ctx.cpred.skills,
      roles: ctx.cpred.roles,
      creation: ctx.cpred.creation,
      lifepath: ctx.cpred.lifepath,
    };
    return payload;
  });

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
      sandbox: c.sandbox,
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
      return tx.campaign.create({
        data: {
          name: trimmed,
          active: true,
          // Zegar świata rusza od miesiąca, który uznajemy za rozliczony
          // (etap 37): świeży stół nie zaczyna od zaległego czynszu, ale
          // pierwsze przekroczenie granicy miesiąca ma już z czym porównać.
          settledMonth: gameMonthKey(GAME_TIME_DEFAULT),
        },
      });
    });
    return reply
      .code(201)
      .send({ id: campaign.id, name: campaign.name, sandbox: campaign.sandbox });
  });

  /**
   * „To jest poligon" / „to jest stół" (postulat MG z 22.08).
   *
   * Osobna trasa, a nie pole w tworzeniu kampanii, bo odpowiedź zmienia się
   * w trakcie życia kampanii: „Poligon bojowy" powstał jako zwykły stół i
   * dopiero z czasem stał się miejscem, w którym wolno wszystko. Flaga niczego
   * nie blokuje — o tym, co robi, mówi komentarz przy kolumnie w schemacie.
   */
  app.post('/api/campaigns/:id/sandbox', gmOnly, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sandbox } = (request.body ?? {}) as { sandbox?: unknown };
    if (typeof sandbox !== 'boolean') return reply.code(400).send({ error: 'BAD_REQUEST' });
    const campaign = await ctx.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) return reply.code(404).send({ error: 'CAMPAIGN_NOT_FOUND' });
    const updated = await ctx.prisma.campaign.update({ where: { id }, data: { sandbox } });
    return { id: updated.id, name: updated.name, sandbox: updated.sandbox };
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
