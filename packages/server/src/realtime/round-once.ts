/**
 * „Pierwsze w tej Rundzie" (stage 30a).
 *
 * Two of the Solo's six Combat Awareness abilities fire once per Round rather
 * than once per Turn: Redukcja obrażeń takes HP off „pierwsze obrażenia
 * otrzymane w tej Rundzie" and Wykrycie słabości adds damage to „pierwszy udany
 * Atak w Rundzie" (s. 146). Neither is tied to whose turn it is — a Solo soaks
 * the first hit of the Round whoever threw it.
 *
 * That makes the Round the unit of book-keeping, and the Round already has a
 * ledger: `Combatant.turnEffects`, stamped with round numbers since stage 14e
 * precisely because a budget handed out fresh at the start of every turn cannot
 * hold anything that has to survive the GM stepping back through the queue.
 *
 * **No fight, no Round.** A figure that is not in a running combat gets
 * neither ability. The rulebook counts both in Rounds and this VTT has no
 * Rounds outside the tracker; the alternative — treating every single hit as
 * „the first" — would quietly make Redukcja obrażeń a permanent armour bonus.
 * Recorded in `decyzje-i-uproszczenia.md`.
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import { findCombatantForToken } from './combat.js';
import { clearRoundOnce, markRoundOnce, roundOnceUsed, type SheetRoundOnce } from '../sheets.js';

/**
 * Claims one once-a-Round ability for this figure, if it has not fired yet.
 *
 * Returns true exactly once per figure per Round — and writes the stamp in the
 * same call, so a caller cannot ask and then forget to book it.
 */
export async function claimRoundOnce(
  prisma: PrismaClient,
  sceneId: string,
  tokenId: string,
  id: SheetRoundOnce,
): Promise<boolean> {
  const found = await findCombatantForToken(prisma, sceneId, tokenId);
  if (!found) return false;
  const { combat, combatant } = found;
  if (roundOnceUsed(combatant.turnEffects, id, combat.round)) return false;
  await prisma.combatant.update({
    where: { id: combatant.id },
    data: { turnEffects: markRoundOnce(combatant.turnEffects, id, combat.round) },
  });
  return true;
}

/**
 * Gives one back — „Cofnij" on a damage card that a Solo's reduction had
 * already paid for. The scene is found from the token rather than passed in,
 * because the undo path holds an id and a log entry, not a scene.
 */
export async function releaseRoundOnce(
  prisma: PrismaClient,
  tokenId: string,
  id: SheetRoundOnce,
): Promise<void> {
  const token = await prisma.token.findUnique({
    where: { id: tokenId },
    select: { sceneId: true },
  });
  if (!token) return;
  const found = await findCombatantForToken(prisma, token.sceneId, tokenId);
  if (!found) return;
  const { combat, combatant } = found;
  if (!roundOnceUsed(combatant.turnEffects, id, combat.round)) return;
  await prisma.combatant.update({
    where: { id: combatant.id },
    data: { turnEffects: clearRoundOnce(combatant.turnEffects, id) },
  });
}
