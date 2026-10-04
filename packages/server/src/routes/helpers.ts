import type { FastifyReply, FastifyRequest } from 'fastify';
import '@fastify/cookie';
import type { CampaignSummary, SessionUser } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import type { AppContext } from '../context.js';
import type { PrismaClient } from '../db.js';
import type { Session } from '../generated/prisma/client.js';
import { SESSION_COOKIE } from '../auth/sessions.js';

/** Kampania w kształcie, który jedzie do klienta (nagłówek, `state:sync`). */
export function toCampaignSummary(campaign: {
  id: string;
  name: string;
  sandbox: boolean;
  sessionStartedAt: Date | null;
  lastSessionEndedAt: Date | null;
}): CampaignSummary {
  return {
    id: campaign.id,
    name: campaign.name,
    sandbox: campaign.sandbox,
    sessionStartedAt: campaign.sessionStartedAt?.toISOString() ?? null,
    lastSessionEndedAt: campaign.lastSessionEndedAt?.toISOString() ?? null,
  };
}

/**
 * Kampania **tego konta** (od etapu 44c nie ma już jednej aktywnej na serwer).
 *
 * - **MG** — kampania otwarta u niego (`User.openCampaignId`), przy której
 *   przygotowuje albo prowadzi sesję. Bez wpisu: własna z trwającą sesją,
 *   a gdy takiej nie ma — najnowsza własna. Cudza nigdy (etap 44a).
 * - **Gracz** — kampania, do której należy jego konto (44b). Stare konta
 *   z kilku kampanii (sprzed 44b) dostają tę z trwającą sesją, potem najnowszą.
 *
 * Kampania gracza nie zależy od tego, czy sesja trwa — o stole decyduje
 * `sessionStartedAt` (widok „Między sesjami”), nie brak kampanii.
 */
export async function getUserActiveCampaign(
  prisma: PrismaClient,
  user: SessionUser,
): Promise<CampaignSummary | null> {
  if (user.role === ROLE_GM) {
    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: { openCampaign: true },
    });
    const open = account?.openCampaign;
    if (open && campaignRunBy(open, user.id)) return toCampaignSummary(open);
    const own = await prisma.campaign.findFirst({
      where: { OR: [{ gmId: user.id }, { gmId: null }] },
      orderBy: [{ sessionStartedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    return own ? toCampaignSummary(own) : null;
  }
  const membership = await prisma.campaignMember.findFirst({
    where: { userId: user.id },
    include: { campaign: true },
    orderBy: [
      { campaign: { sessionStartedAt: { sort: 'desc', nulls: 'last' } } },
      { joinedAt: 'desc' },
    ],
  });
  return membership ? toCampaignSummary(membership.campaign) : null;
}

/**
 * Kampania tego MG albo null (etap 44a, wspólna dla tras od 44b) — cudza
 * wygląda dokładnie jak nieistniejąca, żeby id nie zdradzało, że po drugiej
 * stronie coś jest.
 */
export async function ownCampaign(prisma: PrismaClient, campaignId: string, userId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  return campaign && campaignRunBy(campaign, userId) ? campaign : null;
}

/**
 * Czy kampanię prowadzi ten MG (etap 44a). Kampania bez `gmId` — założona
 * z pominięciem trasy, w testach — należy do każdego MG, jak przed 44a.
 */
export function campaignRunBy(campaign: { gmId: string | null }, userId: string): boolean {
  return campaign.gmId === null || campaign.gmId === userId;
}

export function setSessionCookie(reply: FastifyReply, session: Session): void {
  reply.setCookie(SESSION_COOKIE, session.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    signed: true,
    expires: session.expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/**
 * 429 z `Retry-After` dla adresu po serii złych haseł albo zaproszeń (#12).
 * Zwraca true, gdy odpowiedź już poszła.
 */
export function refuseRateLimited(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const retryAfter = ctx.loginLimiter?.retryAfter(request.ip) ?? null;
  if (retryAfter === null) return false;
  void reply
    .code(429)
    .header('Retry-After', String(retryAfter))
    .send({ error: 'TOO_MANY_ATTEMPTS', retryAfter });
  return true;
}
