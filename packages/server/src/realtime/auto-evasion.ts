import type { SessionUser } from '@vtt/shared';
import { cpredAutoDodge, parseCharacterData } from '@vtt/shared';
import { toSessionUser } from '../auth/sessions.js';
import { campaignGmUser } from './campaign-gm.js';
import type { RealtimeDeps } from './registry.js';

/**
 * Unik i Odskok, które serwer rzuca sam (etap 63b, decyzje MG 4–6 z 28.10).
 *
 * „Większość graczy zawsze go używa” — więc trafienie w postać gracza
 * z zaznaczonym „Unik i Odskok automatycznie” (domyślnie tak, `cpredAutoDodge`)
 * i w bota-towarzysza (zawsze) nie woła już obrońcy: serwer rzuca ZW + Unik bez
 * Szczęścia zaraz po karcie ataku, tą samą drogą co `attack:evade`, a kości 3D
 * lecą jak przy rzucie z kubka. NPC-e MG zostają przy wezwaniu i „Bez uniku”.
 */

/** Kto rzuca Unik za tę figurę: konto gracza albo MG za bota; null — nikt sam. */
export interface AutoEvasionHand {
  tokenId: string;
  characterId: string;
  user: SessionUser;
}

/**
 * Figury z `pending`, za które Unik rzuci serwer, z ręką, która go rzuca.
 *
 * Kryterium czyta **kartę**, nie żeton: bot-towarzysz jest kartą przypiętą do
 * profilu bota (jak w `botForToken`), postać gracza — kartą z właścicielem.
 * Figura bez karty unika żetonem, a to robota MG, więc tu nie trafia.
 */
export async function autoEvasionHandsOf(
  deps: RealtimeDeps,
  campaignId: string,
  pending: readonly string[],
): Promise<AutoEvasionHand[]> {
  const hands: AutoEvasionHand[] = [];
  let gm: SessionUser | null | undefined;
  for (const tokenId of pending) {
    const token = await deps.ctx.prisma.token.findUnique({ where: { id: tokenId } });
    if (!token?.characterId) continue;
    const character = await deps.ctx.prisma.character.findUnique({
      where: { id: token.characterId },
    });
    if (!character || character.campaignId !== campaignId) continue;
    const bot = await deps.ctx.prisma.botProfile.findFirst({
      where: { campaignId, archived: false, characterId: character.id },
      select: { id: true },
    });
    if (bot) {
      // Bot rzuca kontem MG, jak każda jego mechanika (`botActorUser`).
      if (gm === undefined) {
        const row = await campaignGmUser(deps.ctx.prisma, campaignId);
        gm = row ? toSessionUser(row) : null;
      }
      if (gm) hands.push({ tokenId, characterId: character.id, user: gm });
      continue;
    }
    if (!character.ownerId) continue;
    if (!cpredAutoDodge(parseCharacterData(character.data, deps.ctx.cpred))) continue;
    const owner = await deps.ctx.prisma.user.findUnique({ where: { id: character.ownerId } });
    if (owner) hands.push({ tokenId, characterId: character.id, user: toSessionUser(owner) });
  }
  return hands;
}
