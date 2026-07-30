import type {
  ChatMessageView,
  CombatActionLogEntry,
  CombatActionPayload,
  CombatAllowPayload,
  CombatHoldPayload,
  CombatHoldReleasePayload,
  CombatResetTurnPayload,
  CombatView,
  SessionUser,
} from '@vtt/shared';
import {
  COMBAT_ACTION_NOTE_MAX_LENGTH,
  COMBAT_HOLD_TRIGGER_MAX_LENGTH,
  COMBAT_INITIATIVE_MAX,
  COMBAT_INITIATIVE_MIN,
  ROLE_GM,
} from '@vtt/shared';
import type { Scene } from '../generated/prisma/client.js';
import {
  freshTurnState,
  sheetActionName,
  sheetActionReserves,
  turnActionAvailable,
  turnProblemMessage,
} from '../sheets.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import {
  combatantOwnerId,
  emitReloaded,
  fireHeldAction,
  findCombatantForToken,
  loadCombatById,
  renumberOrder,
  requireCampaignId,
  requireCombatant,
  spendTurnForCombatant,
  spendTurnForToken,
  type CombatRow,
  type CombatantRow,
  type TurnSpendOutcome,
  type TurnSpendProblem,
} from './combat.js';
import {
  INCLUDE_CHAT_NAMES,
  broadcastChatMessage,
  deliverChatMessageTo,
  toChatMessageView,
} from './chat-io.js';
import type { SheetTurnSpend } from '../sheets.js';

/**
 * The action economy (stage 14b).
 *
 * A turn is „1 Akcja Ruchu + 1 inna Akcja" (s. 168), and this module is what
 * makes that sentence binding. Three rules shape everything below:
 *
 *  - **The server decides.** A player's intention is validated against the
 *    stored budget; nothing about how much is left ever comes off the wire.
 *  - **The GM is never blocked.** Their own NPCs spend past the budget with the
 *    overspend counted and shown, because a GM improvising a fight should not
 *    be arguing with a checkbox.
 *  - **A refusal is a conversation, not a wall.** It lands as a card only the
 *    GM (and the player who tried) can see, with a „Przepuść" button that grants
 *    a single-use pass — the table's „no, go ahead, you did move first".
 *
 * Reactions stay outside all of this: an Evasion roll, a forced WILL check
 * against suppressive fire and a Death Save happen on somebody else's turn and
 * cost nothing, which is why none of those paths call in here.
 */

/** Polish text for every refusal the tracker can produce. */
export function turnRefusalMessage(problem: TurnSpendProblem): string {
  if (problem === 'NOT_YOUR_TURN') return 'To nie jest twoja tura.';
  return turnProblemMessage(problem);
}

function requireText(value: unknown, limit: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new RealtimeError('BAD_REQUEST');
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > limit) throw new RealtimeError('BAD_REQUEST');
  return trimmed;
}

/**
 * Writes the chat line for a spent action. Public and unremarkable on purpose:
 * „Vex — Przeładowanie" is what a table says out loud, and from stage 19 it is
 * also what a bot reads to know the fight happened.
 */
async function logSpentAction(
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
async function logRefusedAction(
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

/** The log entry describing one attempt, spent or refused. */
function actionEntry(
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
 * Books a spend on behalf of a token and turns a refusal into both a realtime
 * error (which the client shows inline) and the GM's card. Used by the paths
 * that predate the budget — attacks and reloading.
 *
 * A token that is not in a running fight passes straight through: the budget
 * only exists inside combat, and a scene without a tracker is still a scene.
 */
export async function requireTurnSpend(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  tokenId: string,
  spend: SheetTurnSpend,
  user: SessionUser,
  actionId: string,
  options: { silent?: boolean } = {},
): Promise<void> {
  const outcome = await spendTurnForToken(deps, scene, tokenId, spend, user);
  await settleSpend(deps, campaignId, scene, user, outcome, actionId, null, options);
}

/**
 * Common tail of every spend: emit the tracker, log what happened, and throw
 * when it was a refusal.
 *
 * `silent` suppresses the *public* line for paths that already announce
 * themselves — an attack posts its own roll card, and „Vex — Atak" underneath
 * it would just be noise. A refusal is never silent.
 */
async function settleSpend(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  user: SessionUser,
  outcome: TurnSpendOutcome,
  actionId: string,
  note: string | null,
  options: { silent?: boolean } = {},
): Promise<CombatView | null> {
  if (outcome.kind === 'not-in-combat') return null;
  const name = sheetActionName(actionId);

  if (outcome.kind === 'refused') {
    const entry: CombatActionLogEntry = {
      ...actionEntry(outcome.combatant, actionId, name, note),
      refusal: { code: outcome.error, message: turnRefusalMessage(outcome.error) },
    };
    await logRefusedAction(deps, campaignId, user, entry);
    throw new RealtimeError(outcome.error);
  }

  const view = await emitReloaded(deps, campaignId, scene, outcome.combatant.combatId);
  if (options.silent === true && !outcome.forced && !outcome.bypassed) return view;
  const entry: CombatActionLogEntry = {
    ...actionEntry(outcome.combatant, actionId, name, note),
    ...(outcome.forced ? { overspent: true } : {}),
    ...(outcome.bypassed ? { passed: true } : {}),
  };
  await logSpentAction(deps, campaignId, user, entry);
  return view;
}

/** The participant a payload names, or the one this player controls. */
async function resolveCombatant(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  combatantId: unknown,
): Promise<{ combat: CombatRow; combatant: CombatantRow; scene: Scene }> {
  const found = await requireCombatant(deps.ctx.prisma, campaignId, combatantId);
  if (user.role === ROLE_GM) return found;
  // A player may only ever spend their own budget — and must not be able to
  // confirm that a hidden participant exists by poking at its id.
  if (found.combatant.token.hidden) throw new RealtimeError('COMBATANT_NOT_FOUND');
  if (combatantOwnerId(found.combatant) !== user.id) throw new RealtimeError('FORBIDDEN');
  return found;
}

/** The participant this player controls in the fight on their viewed scene. */
async function myCombatant(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  sceneId: string | null,
  combatantId: unknown,
): Promise<{ combat: CombatRow; combatant: CombatantRow; scene: Scene }> {
  if (typeof combatantId === 'string' && combatantId.length > 0) {
    return resolveCombatant(deps, campaignId, user, combatantId);
  }
  if (!sceneId) throw new RealtimeError('COMBAT_NOT_FOUND');
  const scene = await deps.ctx.prisma.scene.findUnique({ where: { id: sceneId } });
  if (!scene || scene.campaignId !== campaignId) throw new RealtimeError('COMBAT_NOT_FOUND');
  const combat = await deps.ctx.prisma.combat.findUnique({
    where: { sceneId },
    include: {
      combatants: {
        include: { token: { include: { character: { select: { id: true, ownerId: true } } } } },
      },
    },
  });
  if (!combat) throw new RealtimeError('COMBAT_NOT_FOUND');
  const mine = combat.combatants.filter((row) => combatantOwnerId(row) === user.id);
  const combatant = mine.find((row) => row.id === combat.activeCombatantId) ?? mine[0] ?? undefined;
  if (!combatant) throw new RealtimeError('COMBATANT_NOT_FOUND');
  return { combat, combatant, scene };
}

/**
 * A participant spends part of their turn on a catalogued action.
 *
 * Actions with a resolution of their own (attacks, reloading, stabilizing) are
 * booked by their own path and refused here, so nothing is ever charged twice.
 */
export const combatActionEvent = defineEvent<CombatActionPayload, CombatView>({
  name: 'combat:action',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const actionId = payload?.actionId;
    if (typeof actionId !== 'string' || actionId.length === 0) {
      throw new RealtimeError('BAD_REQUEST');
    }
    if (sheetActionReserves(actionId)) throw new RealtimeError('USE_HOLD_EVENT');
    const note = requireText(payload?.note, COMBAT_ACTION_NOTE_MAX_LENGTH);

    const { combat, combatant, scene } = await myCombatant(
      deps,
      campaignId,
      user,
      socket.data.viewedSceneId,
      payload?.combatantId,
    );
    const outcome = await spendTurnForCombatant(
      deps,
      combat,
      combatant,
      { kind: 'action', actionId },
      user,
    );
    // `settleSpend` already emitted the fresh tracker — re-emitting it here
    // would burn a second seq for one action.
    const view = await settleSpend(deps, campaignId, scene, user, outcome, actionId, note);
    return view ?? (await emitReloaded(deps, campaignId, scene, combat.id));
  },
});

/**
 * „Przepuść": the GM waves one refused action through. It is a single-use pass
 * on the participant, not a standing exemption — the next spend consumes it,
 * and the start of anybody's turn wipes whatever is left over.
 *
 * The player re-clicks their own button afterwards. Replaying the intention for
 * them would mean storing a whole request (dice gesture included) and firing it
 * against a state that has since moved on; a second click is honest.
 */
export const combatAllowEvent = defineEvent<CombatAllowPayload, CombatView>({
  name: 'combat:allow',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { combat, combatant, scene } = await requireCombatant(
      deps.ctx.prisma,
      campaignId,
      payload?.combatantId,
    );
    await deps.ctx.prisma.combatant.update({
      where: { id: combatant.id },
      data: { actionBypass: true },
    });

    // Mark the card that asked, so the GM can see they already answered it.
    const messageId = payload?.messageId;
    if (typeof messageId === 'number' && Number.isInteger(messageId)) {
      const message = await deps.ctx.prisma.chatMessage.findUnique({
        where: { id: messageId },
        include: INCLUDE_CHAT_NAMES,
      });
      if (message && message.campaignId === campaignId && message.payload) {
        const entry = JSON.parse(message.payload) as CombatActionLogEntry;
        const saved = await deps.ctx.prisma.chatMessage.update({
          where: { id: message.id },
          data: { payload: JSON.stringify({ ...entry, passed: true }) },
          include: INCLUDE_CHAT_NAMES,
        });
        const view = toChatMessageView(saved);
        await deliverChatMessageTo(deps, campaignId, view, [message.authorId], true, 'chat:update');
      }
    }
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

/**
 * „Wstrzymanie Akcji" (s. 168): the Action is *reserved*, not spent, so it
 * stays available after the turn ends. RAW wants either a described trigger or
 * a value in the initiative queue — a declaration naming neither would be a
 * participant who simply acts whenever they like.
 */
export const combatHoldEvent = defineEvent<CombatHoldPayload, CombatView>({
  name: 'combat:hold',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const trigger = requireText(payload?.trigger, COMBAT_HOLD_TRIGGER_MAX_LENGTH);
    const rawInitiative = payload?.initiative;
    let initiative: number | null = null;
    if (rawInitiative !== undefined && rawInitiative !== null) {
      if (!Number.isInteger(rawInitiative)) throw new RealtimeError('BAD_REQUEST');
      if (rawInitiative < COMBAT_INITIATIVE_MIN || rawInitiative > COMBAT_INITIATIVE_MAX) {
        throw new RealtimeError('BAD_REQUEST');
      }
      initiative = rawInitiative;
    }
    if (trigger === null && initiative === null) throw new RealtimeError('HOLD_NEEDS_DECLARATION');

    const { combat, combatant, scene } = await myCombatant(
      deps,
      campaignId,
      user,
      socket.data.viewedSceneId,
      payload?.combatantId,
    );
    if (user.role !== ROLE_GM) {
      if (combat.activeCombatantId !== combatant.id) throw new RealtimeError('NOT_YOUR_TURN');
      // Holding reserves the Action, so there has to be one left to reserve.
      if (!turnActionAvailable(combatant.turnState)) throw new RealtimeError('NO_ACTION_LEFT');
    }
    await deps.ctx.prisma.combatant.update({
      where: { id: combatant.id },
      data: { held: true, heldTrigger: trigger, heldInitiative: initiative },
    });
    await logSpentAction(deps, campaignId, user, {
      ...actionEntry(combatant, 'hold', sheetActionName('hold'), trigger),
      ...(initiative !== null ? { note: `przy inicjatywie ${initiative}` } : {}),
    });
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

/**
 * The GM fires a held Action by hand — the path for a declaration whose trigger
 * is a sentence rather than a number („gdy ktoś wyjdzie zza rogu"). A hold tied
 * to a queue value fires by itself on the way past it (`dueHold`).
 */
export const combatHoldReleaseEvent = defineEvent<CombatHoldReleasePayload, CombatView>({
  name: 'combat:hold-release',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { combat, combatant, scene } = await requireCombatant(
      deps.ctx.prisma,
      campaignId,
      payload?.combatantId,
    );
    if (!combatant.held) throw new RealtimeError('NOTHING_HELD');
    await fireHeldAction(deps.ctx.prisma, combat, combatant);
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

/** The GM hands a participant their whole turn back — the escape hatch. */
export const combatResetTurnEvent = defineEvent<CombatResetTurnPayload, CombatView>({
  name: 'combat:reset-turn',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { combat, combatant, scene } = await requireCombatant(
      deps.ctx.prisma,
      campaignId,
      payload?.combatantId,
    );
    await deps.ctx.prisma.combatant.update({
      where: { id: combatant.id },
      data: { turnState: freshTurnState(), actionBypass: false },
    });
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

/** Re-exported so callers outside this module can find a participant's row. */
export { findCombatantForToken, loadCombatById, renumberOrder };
