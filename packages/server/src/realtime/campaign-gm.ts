import { ROLE_GM } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { User } from '../generated/prisma/client.js';

/**
 * Konto MG kampanii (etap 44a) — to, którym pisze system: linie NPC-ów botów,
 * ich mechanika, wpisy „Czas” i strefy odpalane przy ruchu gracza.
 *
 * Do 44a było to „pierwsze konto MG w bazie”, co przy jednym MG znaczyło to
 * samo. Przy wielu MG linia bota w kampanii MG-B szłaby kontem właściciela.
 * Kampania bez `gmId` (założona z pominięciem trasy — testy) bierze dawną
 * odpowiedź.
 */
export async function campaignGmUser(
  prisma: PrismaClient,
  campaignId: string,
): Promise<User | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { gm: true },
  });
  if (campaign?.gm) return campaign.gm;
  return prisma.user.findFirst({ where: { role: ROLE_GM }, orderBy: { createdAt: 'asc' } });
}
