import type { InvitationState, InvitationSummary } from '@vtt/shared';
import { PLAYER_NAME_MAX_LENGTH } from '@vtt/shared';
import type { PrismaClient } from './db.js';
import type { Invitation } from './generated/prisma/client.js';

/**
 * Imienne linki graczy (etap 44b, decyzje MG z 03.10 i 24.10).
 *
 * Link jest stałym kluczem do jednego miejsca przy stole: MG wypisuje na nim
 * imię, pierwsze użycie zakłada konto gracza w tej kampanii, a każde następne
 * wpuszcza na to samo konto — z dowolnego komputera, bez wylogowania innych
 * urządzeń. Do 24.10 link działał raz i tydzień, ale gracze wchodzili tylko
 * linkami i MG co chwilę wystawiał nowe. **Link odnowienia** zastępuje
 * zgubiony albo wyciekły klucz: poprzednie linki gracza przestają działać.
 * Do 44b link był anonimowy, a imię wpisywał gracz, więc kto znał imię,
 * wchodził na cudze konto.
 */

export function invitationState(invitation: Invitation, now = Date.now()): InvitationState {
  if (invitation.revokedAt || invitation.name === null) return 'revoked';
  if (invitation.usedAt) return 'used';
  // Termin ma tylko link z jawnie skróconą ważnością, i tylko póki nikt go nie użył.
  if (invitation.expiresAt && invitation.expiresAt.getTime() <= now) return 'expired';
  return 'waiting';
}

export function toInvitationSummary(invitation: Invitation): InvitationSummary {
  return {
    id: invitation.id,
    token: invitation.token,
    expiresAt: invitation.expiresAt?.toISOString() ?? null,
    revoked: invitation.revokedAt !== null,
    createdAt: invitation.createdAt.toISOString(),
    name: invitation.name,
    renewal: invitation.renewal,
    usedAt: invitation.usedAt?.toISOString() ?? null,
    state: invitationState(invitation),
    characterId: invitation.characterId,
  };
}

/** Imię z formularza MG albo null, gdy puste, za długie lub z niewidocznymi znakami. */
export function sanitizePlayerName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length === 0 || name.length > PLAYER_NAME_MAX_LENGTH) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

/**
 * Czy imię jest już zajęte przy tym stole (wielkość liter bez znaczenia):
 * przez gracza kampanii, przez czekający link nowego gracza albo przez MG,
 * którego imię przy stole widzą wszyscy. Kuba u MG-A i Kuba u MG-B to dwa
 * różne konta — unikalność jest w kampanii, nie na serwerze.
 */
export async function playerNameTaken(
  prisma: Pick<PrismaClient, 'campaign' | 'campaignMember' | 'invitation'>,
  campaignId: string,
  name: string,
  /** Link, z którego gracz właśnie wchodzi — jego własne imię nie jest „zajęte”. */
  exceptInvitationId?: string,
): Promise<boolean> {
  const wanted = name.toLocaleLowerCase('pl');
  const [campaign, members, links] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId }, select: { gm: true } }),
    prisma.campaignMember.findMany({
      where: { campaignId },
      select: { user: { select: { name: true } } },
    }),
    prisma.invitation.findMany({
      where: {
        campaignId,
        ...(exceptInvitationId ? { id: { not: exceptInvitationId } } : {}),
        renewal: false,
        usedAt: null,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { name: true },
    }),
  ]);
  const names = [
    campaign?.gm?.name ?? null,
    ...members.map((member) => member.user.name),
    ...links.map((link) => link.name),
  ];
  return names.some((taken) => taken?.toLocaleLowerCase('pl') === wanted);
}
