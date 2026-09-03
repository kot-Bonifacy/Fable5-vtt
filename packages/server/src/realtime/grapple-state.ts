import type { CpredTimedEffect } from '@vtt/shared';
import type { RealtimeDeps } from './registry.js';
import { SHEET_GRAPPLED_STATUS_ID, writeSheetStatusTimer } from '../sheets.js';
import { readTokenStatuses, type CombatRow, type CombatantRow } from './combat.js';
import { emitTokensById } from './tokens.js';

/**
 * Where a Hold is written down (stage 14d).
 *
 * Its own module for the reason `combat-log.ts` is: the tracker (`combat.ts`)
 * must be able to end a fight's Holds, and ending one touches token *statuses*,
 * which live behind `tokens.ts` — and `tokens.ts` already imports the tracker.
 * Everything that writes the relation therefore sits here, below both.
 *
 * The relation lives on the **Held** participant (`grappledById` points at the
 * Attacker), because that is the row every rule interrogates: may this one walk,
 * is this one a shield, how many rounds has it been choked. The `grappled`
 * status on the token is a picture of that row, kept in step from here — never
 * the other way round.
 */

/**
 * Adds a status id to a token, if it is not already there.
 *
 * The optional timer is what makes „Nieprzytomny na minutę" (s. 223) different
 * from the choke's „Nieprzytomny" — same status to every rule that reads it,
 * only one of them counts rounds. Written even onto a status the token already
 * carries: a fresh minute on an old sticker is the honest answer when somebody
 * gets knocked out twice.
 */
export async function addTokenStatus(
  deps: RealtimeDeps,
  campaignId: string,
  tokenId: string,
  statusId: string,
  timer?: CpredTimedEffect,
): Promise<void> {
  const token = await deps.ctx.prisma.token.findUnique({ where: { id: tokenId } });
  if (!token) return;
  const statuses = readTokenStatuses(token.statuses);
  const known = statuses.includes(statusId);
  if (known && !timer) return;
  await deps.ctx.prisma.token.update({
    where: { id: tokenId },
    data: {
      statuses: JSON.stringify(known ? statuses : [...statuses, statusId]),
      ...(timer ? { statusData: writeSheetStatusTimer(token.statusData, statusId, timer) } : {}),
    },
  });
  await emitTokensById(deps, campaignId, [tokenId]);
}

/** Takes a status id off a token, if it is there. */
export async function removeTokenStatus(
  deps: RealtimeDeps,
  campaignId: string,
  tokenId: string,
  statusId: string,
): Promise<void> {
  const token = await deps.ctx.prisma.token.findUnique({ where: { id: tokenId } });
  if (!token) return;
  const statuses = readTokenStatuses(token.statuses);
  if (!statuses.includes(statusId)) return;
  await deps.ctx.prisma.token.update({
    where: { id: tokenId },
    data: { statuses: JSON.stringify(statuses.filter((id) => id !== statusId)) },
  });
  await emitTokensById(deps, campaignId, [tokenId]);
}

/** Starts a Hold — the Attacker's id written onto the one being held. */
export async function beginGrapple(
  deps: RealtimeDeps,
  campaignId: string,
  attacker: CombatantRow,
  defender: CombatantRow,
): Promise<void> {
  await deps.ctx.prisma.combatant.update({
    where: { id: defender.id },
    data: { grappledById: attacker.id, chokeStreak: 0, chokeRound: null, humanShield: false },
  });
  // Nothing without a figure is ever Held, so the sticker simply has nowhere
  // to go — the relation above is still worth writing for the tracker's sake.
  if (defender.tokenId) {
    await addTokenStatus(deps, campaignId, defender.tokenId, SHEET_GRAPPLED_STATUS_ID);
  }
}

/**
 * Ends a Hold — „Trzymanie kończy się dla wszystkich uczestników". Everything
 * the Hold carried goes with it: the choke streak, the shield, the sticker.
 */
export async function endGrapple(
  deps: RealtimeDeps,
  campaignId: string,
  defender: CombatantRow,
): Promise<void> {
  await deps.ctx.prisma.combatant.update({
    where: { id: defender.id },
    data: { grappledById: null, chokeStreak: 0, chokeRound: null, humanShield: false },
  });
  if (defender.tokenId) {
    await removeTokenStatus(deps, campaignId, defender.tokenId, SHEET_GRAPPLED_STATUS_ID);
  }
}

/**
 * Clears every Hold of a fight that is ending — or of a participant leaving it.
 *
 * The database would drop the relation on its own (both rows cascade with the
 * combat), but the *sticker* would survive on the map, and a `grappled` token
 * nobody is holding is a token that silently cannot walk. So the statuses come
 * off explicitly, from both ends of every pair.
 */
export async function clearGrapplesOf(
  deps: RealtimeDeps,
  campaignId: string,
  combat: CombatRow,
  /** Limit the clean-up to Holds this participant is part of. */
  onlyFor?: CombatantRow,
): Promise<void> {
  for (const row of combat.combatants) {
    if (row.grappledById === null) continue;
    if (onlyFor && row.id !== onlyFor.id && row.grappledById !== onlyFor.id) continue;
    await endGrapple(deps, campaignId, row);
  }
}
