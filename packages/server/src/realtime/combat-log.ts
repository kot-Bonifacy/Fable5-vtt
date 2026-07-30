import type { ChatMessageView, CombatActionLogEntry, SessionUser } from '@vtt/shared';
import { turnProblemMessage } from '../sheets.js';
import type { RealtimeDeps } from './registry.js';
import type { CombatantRow, TurnSpendProblem } from './combat.js';
import {
  INCLUDE_CHAT_NAMES,
  broadcastChatMessage,
  deliverChatMessageTo,
  toChatMessageView,
} from './chat-io.js';

/**
 * What a spent or refused turn looks like on chat (stages 14b–14c).
 *
 * Its own module because two callers write these cards — the action economy
 * (`combat-actions.ts`) and movement (`movement.ts`) — and the token layer sits
 * between them: `token:move` needs the movement validator, which needs the
 * card, which must not drag the whole action catalogue back in behind it.
 */

/** Polish text for every refusal the tracker can produce. */
export function turnRefusalMessage(problem: TurnSpendProblem): string {
  if (problem === 'NOT_YOUR_TURN') return 'To nie jest twoja tura.';
  // A status refusal always arrives with a sentence of its own (the table in
  // `statuses.ts` names each one); this is the fallback nobody should see.
  if (problem === 'STATUS_BLOCKED') return 'Stan tokenu nie pozwala na tę Akcję.';
  return turnProblemMessage(problem);
}

/** The log entry describing one attempt, spent or refused. */
export function actionEntry(
  combatant: CombatantRow,
  actionId: string,
  actionName: string,
  note: string | null,
): CombatActionLogEntry {
  return {
    combatantId: combatant.id,
    actorName: combatant.token.name,
    actionId,
    actionName,
    ...(note ? { note } : {}),
  };
}

/**
 * Writes the chat line for a spent action. Public and unremarkable on purpose:
 * „Vex — Przeładowanie" is what a table says out loud, and from stage 19 it is
 * also what a bot reads to know the fight happened.
 */
export async function logSpentAction(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  entry: CombatActionLogEntry,
): Promise<void> {
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId: user.id,
      kind: 'action',
      text: entry.actionName,
      payload: JSON.stringify(entry),
    },
    include: INCLUDE_CHAT_NAMES,
  });
  broadcastChatMessage(deps, campaignId, toChatMessageView(stored));
}

/**
 * Writes the refusal card. It goes to the GM and to the player who tried —
 * nobody else needs to watch somebody run out of Actions, and the GM needs the
 * „Przepuść" button in a place they cannot scroll past.
 */
export async function logRefusedAction(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  entry: CombatActionLogEntry,
): Promise<ChatMessageView> {
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId: user.id,
      kind: 'gmaction',
      text: entry.actionName,
      payload: JSON.stringify(entry),
    },
    include: INCLUDE_CHAT_NAMES,
  });
  const view = toChatMessageView(stored);
  await deliverChatMessageTo(deps, campaignId, view, [user.id], true);
  return view;
}
