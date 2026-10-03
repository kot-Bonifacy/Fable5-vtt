import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { CampaignDetail, CpredDataPayload } from '@vtt/shared';
import { GAME_TIME_DEFAULT, INVITATION_TTL_HOURS, ROLE_PLAYER, gameMonthKey } from '@vtt/shared';
import type { AppContext } from '../context.js';
import { requireAuth, requireGm } from '../auth/guards.js';
import { playerNameTaken, sanitizePlayerName, toInvitationSummary } from '../invitations.js';
import { ownCampaign as ownCampaignOf } from './helpers.js';

const HOUR_MS = 60 * 60 * 1000;
const MAX_CAMPAIGN_NAME_LENGTH = 64;

/** Ważność nieużytego linku: domyślnie tydzień (decyzja MG z 03.10), test może skrócić. */
function invitationExpiry(body: unknown): Date {
  const { expiresInHours } = (body ?? {}) as { expiresInHours?: unknown };
  const hours =
    typeof expiresInHours === 'number' &&
    expiresInHours > 0 &&
    expiresInHours <= INVITATION_TTL_HOURS
      ? expiresInHours
      : INVITATION_TTL_HOURS;
  return new Date(Date.now() + hours * HOUR_MS);
}

const newToken = (): string => randomBytes(24).toString('base64url');

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

  const ownCampaign = (id: string, userId: string) => ownCampaignOf(ctx.prisma, id, userId);

  app.get('/api/campaigns', gmOnly, async (request) => {
    // Każdy MG widzi tylko swoje kampanie (etap 44a).
    const campaigns = await ctx.prisma.campaign.findMany({
      where: { OR: [{ gmId: request.user!.id }, { gmId: null }] },
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
    const gmId = request.user!.id;
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
          gmId,
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
    const campaign = await ownCampaign(id, request.user!.id);
    if (!campaign) return reply.code(404).send({ error: 'CAMPAIGN_NOT_FOUND' });
    const updated = await ctx.prisma.campaign.update({ where: { id }, data: { sandbox } });
    return { id: updated.id, name: updated.name, sandbox: updated.sandbox };
  });

  /**
   * „Nowy gracz” (etap 44b): imienny link, który przy pierwszym użyciu zakłada
   * konto o tym imieniu w tej kampanii i się zużywa.
   */
  app.post('/api/campaigns/:id/invitations', gmOnly, async (request, reply) => {
    const { id } = request.params as { id: string };
    const campaign = await ownCampaign(id, request.user!.id);
    if (!campaign) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
    const name = sanitizePlayerName((request.body as { name?: unknown } | undefined)?.name);
    if (name === null) return reply.code(400).send({ error: 'INVALID_NAME' });
    if (await playerNameTaken(ctx.prisma, campaign.id, name)) {
      return reply.code(409).send({ error: 'NAME_TAKEN' });
    }

    const invitation = await ctx.prisma.invitation.create({
      data: {
        token: newToken(),
        campaignId: campaign.id,
        name,
        expiresAt: invitationExpiry(request.body),
      },
    });
    return reply.code(201).send(toInvitationSummary(invitation));
  });

  /**
   * „Link odnowienia” (etap 44b): gracz na nowym komputerze albo bez
   * ciasteczka wraca na **to samo** konto. Poprzedni czekający link odnowienia
   * tego gracza traci ważność — klucz do jednego konta jest jeden naraz.
   * Inne urządzenia gracza zostają zalogowane (decyzja MG z 03.10).
   */
  app.post('/api/campaigns/:id/players/:userId/renewal', gmOnly, async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    const campaign = await ownCampaign(id, request.user!.id);
    if (!campaign) return reply.code(404).send({ error: 'NOT_FOUND' });
    const member = await ctx.prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId: campaign.id, userId } },
      include: { user: true },
    });
    if (!member || member.user.role !== ROLE_PLAYER) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    const invitation = await ctx.prisma.$transaction(async (tx) => {
      await tx.invitation.updateMany({
        where: { campaignId: campaign.id, userId, renewal: true, usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.invitation.create({
        data: {
          token: newToken(),
          campaignId: campaign.id,
          name: member.user.name,
          userId,
          renewal: true,
          expiresAt: invitationExpiry(request.body),
        },
      });
    });
    return reply.code(201).send(toInvitationSummary(invitation));
  });

  app.post('/api/invitations/:id/revoke', gmOnly, async (request, reply) => {
    const { id } = request.params as { id: string };
    const invitation = await ctx.prisma.invitation.findUnique({ where: { id } });
    if (!invitation || !(await ownCampaign(invitation.campaignId, request.user!.id))) {
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
