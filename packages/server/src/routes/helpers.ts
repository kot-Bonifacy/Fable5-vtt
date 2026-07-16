import type { FastifyReply } from 'fastify';
import '@fastify/cookie';
import type { CampaignSummary } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Session } from '../generated/prisma/client.js';
import { SESSION_COOKIE } from '../auth/sessions.js';

export async function getActiveCampaign(prisma: PrismaClient): Promise<CampaignSummary | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'desc' },
  });
  return campaign ? { id: campaign.id, name: campaign.name } : null;
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
