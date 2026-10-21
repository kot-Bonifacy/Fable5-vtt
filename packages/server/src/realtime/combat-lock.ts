import { ROLE_GM } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import { RealtimeError } from './registry.js';

/**
 * Blokada rozwoju postaci w walce (zlecenie MG z 21.10.2026).
 *
 * Póki w kampanii stoi jakikolwiek tracker walki — od „Załóż starcie”, także
 * w rundzie 0 i na scenie, której gracz nie widzi — gracz nie wydaje PD, nie
 * zmienia Roli, nie rozdziela Specjalizacji ani Taboru, nie zakłada i nie
 * kończy nowej postaci, nie robi zakupów, nie prosi o wszczep i nie zmienia
 * Zakwaterowania ani Poziomu życia. MG (i boty, które działają na jego koncie)
 * przechodzi zawsze: sędzia musi móc naprawić kartę w środku starcia.
 *
 * Nowa droga, która rozwija postać albo wydaje jej pieniądze poza walką, woła
 * `refuseInCombat` przed pierwszym zapisem.
 */
export async function campaignInCombat(prisma: PrismaClient, campaignId: string): Promise<boolean> {
  return (await prisma.combat.count({ where: { scene: { campaignId } } })) > 0;
}

export async function refuseInCombat(
  prisma: PrismaClient,
  campaignId: string,
  user: { role: string },
): Promise<void> {
  if (user.role === ROLE_GM) return;
  if (await campaignInCombat(prisma, campaignId)) throw new RealtimeError('COMBAT_LOCKED');
}
