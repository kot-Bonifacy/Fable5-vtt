import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthState, JoinInfo } from '@vtt/shared';
import { ROLE_PLAYER } from '@vtt/shared';
import type { AppContext } from '../context.js';
import type { Campaign, Invitation } from '../generated/prisma/client.js';
import { createSession, toSessionUser } from '../auth/sessions.js';
import { invitationState, playerNameTaken } from '../invitations.js';
import { refuseRateLimited, setSessionCookie, toCampaignSummary } from './helpers.js';

type LoadedInvitation = Invitation & { campaign: Campaign };

/**
 * Imienny link (etap 44b) albo odmowa. Nieznany i unieważniony link to 404
 * i liczy się do limitu zgadywania (#12); użyty i wygasły to 410 — token był
 * prawdziwy, więc gracz dostaje zdanie, co dalej, a nie „nieważne”.
 */
async function requireUsableInvitation(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<LoadedInvitation | null> {
  const { token } = request.params as { token: string };
  const invitation = await ctx.prisma.invitation.findUnique({
    where: { token },
    include: { campaign: true },
  });
  const state = invitation ? invitationState(invitation) : 'revoked';
  if (!invitation || state === 'revoked') {
    ctx.loginLimiter?.fail(request.ip);
    void reply.code(404).send({ error: 'INVALID_INVITATION' });
    return null;
  }
  if (state === 'used') {
    void reply.code(410).send({ error: 'INVITATION_USED' });
    return null;
  }
  if (state === 'expired') {
    void reply.code(410).send({ error: 'INVITATION_EXPIRED' });
    return null;
  }
  return invitation;
}

export function registerJoinRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/join/:token', async (request, reply) => {
    // Zgadywanie zaproszeń liczy się do tego samego limitu co złe hasła (#12).
    if (refuseRateLimited(ctx, request, reply)) return reply;
    const invitation = await requireUsableInvitation(ctx, request, reply);
    if (!invitation) return reply;
    const info: JoinInfo = {
      campaignName: invitation.campaign.name,
      playerName: invitation.name!,
      renewal: invitation.renewal,
    };
    return info;
  });

  /**
   * Wejście z linku. Imię bierze się z linku, nie z formularza: link nowego
   * gracza zakłada konto w tej kampanii, link odnowienia otwiera istniejące.
   * Oba zużywają się w tej samej transakcji, w której powstaje konto —
   * dwa równoczesne kliknięcia nie założą dwóch kont.
   */
  app.post('/api/join/:token', async (request, reply) => {
    if (refuseRateLimited(ctx, request, reply)) return reply;
    const invitation = await requireUsableInvitation(ctx, request, reply);
    if (!invitation) return reply;
    const name = invitation.name!;

    const outcome = await ctx.prisma
      .$transaction(async (tx) => {
        let userId = invitation.userId;
        if (invitation.renewal) {
          // Gracz, którego MG w międzyczasie usunął z kampanii, nie wraca kluczem.
          const member = userId
            ? await tx.campaignMember.findUnique({
                where: { campaignId_userId: { campaignId: invitation.campaignId, userId } },
              })
            : null;
          if (!member) return 'INVALID_INVITATION' as const;
        } else {
          if (await playerNameTaken(tx, invitation.campaignId, name, invitation.id)) {
            return 'NAME_TAKEN' as const;
          }
          const user = await tx.user.create({ data: { name, role: ROLE_PLAYER } });
          await tx.campaignMember.create({
            data: { campaignId: invitation.campaignId, userId: user.id },
          });
          userId = user.id;
        }
        const used = await tx.invitation.updateMany({
          where: { id: invitation.id, usedAt: null },
          data: { usedAt: new Date(), userId },
        });
        // Ktoś był szybszy tym samym linkiem — cała transakcja się cofa.
        if (used.count !== 1) throw new LinkAlreadyUsed();
        return tx.user.findUniqueOrThrow({ where: { id: userId! } });
      })
      .catch((error: unknown) => {
        if (error instanceof LinkAlreadyUsed) return 'INVITATION_USED' as const;
        throw error;
      });

    if (outcome === 'INVITATION_USED') return reply.code(410).send({ error: outcome });
    if (outcome === 'INVALID_INVITATION') return reply.code(404).send({ error: outcome });
    if (outcome === 'NAME_TAKEN') return reply.code(409).send({ error: outcome });

    const session = await createSession(ctx.prisma, outcome.id, ctx.config.sessionTtlDays);
    setSessionCookie(reply, session);
    const state: AuthState = {
      user: toSessionUser(outcome),
      activeCampaign: toCampaignSummary(invitation.campaign),
    };
    return state;
  });
}

class LinkAlreadyUsed extends Error {}
