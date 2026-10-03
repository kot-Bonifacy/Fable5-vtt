import type { FastifyReply, FastifyRequest } from 'fastify';
import '@fastify/cookie';
import type { CampaignSummary, SessionUser } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import type { AppContext } from '../context.js';
import type { PrismaClient } from '../db.js';
import type { Session } from '../generated/prisma/client.js';
import { SESSION_COOKIE } from '../auth/sessions.js';

/**
 * Aktywna kampania **dla tego konta** (#10, 01.10): MG — tylko własna (etap
 * 44a, `Campaign.gmId`), gracz — tylko wtedy, gdy jest jej członkiem. Gracz
 * innej kampanii dostawał z REST nazwę cudzej aktywnej kampanii i jej pulę
 * portretów — gniazdo pilnowało tego od początku (`resolveSocketCampaign`),
 * trasy HTTP nie.
 *
 * Kampania aktywna jest jeszcze jedna na serwer (aktywna per MG to 44c), więc
 * MG, którego kampania nie jest tą jedną, siedzi przy pustym stole.
 */
export async function getUserActiveCampaign(
  prisma: PrismaClient,
  user: SessionUser,
): Promise<CampaignSummary | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!campaign) return null;
  const summary = { id: campaign.id, name: campaign.name, sandbox: campaign.sandbox };
  if (user.role === ROLE_GM) return campaignRunBy(campaign, user.id) ? summary : null;
  const membership = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId: campaign.id, userId: user.id } },
  });
  return membership ? summary : null;
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
