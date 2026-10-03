import { randomBytes } from 'node:crypto';
import { ROLE_PLAYER } from '@vtt/shared';
import type { PrismaClient } from './db.js';

/**
 * Adres wejścia gracza dla testów dymnych (etap 44b) — tylko dla `*.test.ts`.
 *
 * Do 44b test robił jeden anonimowy link i wchodził nim pod kolejnymi
 * imionami, a to samo imię wracało na to samo konto. Od 44b link jest imienny
 * i działa raz, więc pomocnik wystawia go za MG wprost w bazie: nowemu graczowi
 * link nowego gracza, a temu, który już siedzi w kampanii — link odnowienia.
 * Wychodzi to samo zachowanie, tyle że w obrębie kampanii, jak chce 44b.
 * Ścieżkę MG przez trasy sprawdza `campaign-isolation.test.ts`.
 */
export async function joinUrl(
  built: { prisma: PrismaClient },
  campaignId: string,
  name: string,
): Promise<string> {
  const member = await built.prisma.campaignMember.findFirst({
    where: { campaignId, user: { name, role: ROLE_PLAYER } },
    select: { userId: true },
  });
  const token = randomBytes(18).toString('base64url');
  await built.prisma.invitation.create({
    data: {
      token,
      campaignId,
      name,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      ...(member ? { userId: member.userId, renewal: true } : {}),
    },
  });
  return `/api/join/${token}`;
}
