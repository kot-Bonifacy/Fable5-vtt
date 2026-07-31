import type {
  CombatActionLogEntry,
  CombatActionPayload,
  CombatAllowPayload,
  CombatHoldPayload,
  CombatHoldReleasePayload,
  CombatResetTurnPayload,
  CombatTerrainPayload,
  CombatView,
  CombatantIdPayload,
  SessionUser,
} from '@vtt/shared';
import {
  COMBAT_ACTION_NOTE_MAX_LENGTH,
  COMBAT_HOLD_TRIGGER_MAX_LENGTH,
  COMBAT_INITIATIVE_MAX,
  COMBAT_INITIATIVE_MIN,
  CPRED_ACTION_EXTINGUISH,
  CPRED_ACTION_STAND_UP,
  ROLE_GM,
  nextTurn,
  previousTurn,
} from '@vtt/shared';
import type { Scene } from '../generated/prisma/client.js';
import {
  SHEET_ON_FIRE_STATUS_ID,
  SHEET_PRONE_STATUS_ID,
  freshTurnState,
  setTurnHardTerrain,
  sheetActionName,
  sheetActionReserves,
  turnActionAvailable,
} from '../sheets.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import {
  applyTurnPointer,
  combatantOwnerId,
  dueHold,
  emitCombatOfScene,
  emitReloaded,
  fireHeldAction,
  findCombatantForToken,
  loadCombatById,
  loadCombat,
  moveBudgetForCombatant,
  renumberOrder,
  requireCampaignId,
  requireCombatant,
  spendTurnForCombatant,
  spendTurnForToken,
  toCombatView,
  type CombatRow,
  type CombatantRow,
  type TurnSpendOutcome,
} from './combat.js';
import { INCLUDE_CHAT_NAMES, deliverChatMessageTo, toChatMessageView } from './chat-io.js';
import type { SheetTurnSpend } from '../sheets.js';
import { actionEntry, logRefusedAction, logSpentAction, turnRefusalMessage } from './combat-log.js';
import { emitTokenUpsert } from './tokens.js';
import { clearGrapplesOf } from './grapple-state.js';
import { advanceTurn } from './turn-effects.js';
import { requireCampaignScene } from './scenes.js';

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

function requireText(value: unknown, limit: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new RealtimeError('BAD_REQUEST');
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > limit) throw new RealtimeError('BAD_REQUEST');
  return trimmed;
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
      // A status refusal brings its own sentence („Nieprzytomny token nie
      // wykonuje Akcji"); everything else is looked up by code.
      refusal: {
        code: outcome.error,
        message: outcome.message ?? turnRefusalMessage(outcome.error),
      },
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

/**
 * Actions whose whole point is to take a status off the token that paid for
 * them. „Wstanie" is what stops „Powalony" refusing every walk (stage 14c), and
 * „Ugaszenie" is what stops the fire billing you at the end of every turn
 * (stage 14e) — in both cases the player would otherwise pay an Action and see
 * nothing change.
 */
const STATUS_CLEARED_BY_ACTION: Readonly<Record<string, string>> = {
  [CPRED_ACTION_STAND_UP]: SHEET_PRONE_STATUS_ID,
  [CPRED_ACTION_EXTINGUISH]: SHEET_ON_FIRE_STATUS_ID,
};

async function clearStatusAfterAction(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  combatant: CombatantRow,
  actionId: string,
): Promise<void> {
  const statusId = STATUS_CLEARED_BY_ACTION[actionId];
  if (!statusId) return;
  let statuses: string[];
  try {
    const parsed: unknown = JSON.parse(combatant.token.statuses);
    statuses = Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return;
  }
  if (!statuses.includes(statusId)) return;
  const token = await deps.ctx.prisma.token.update({
    where: { id: combatant.tokenId },
    data: { statuses: JSON.stringify(statuses.filter((id) => id !== statusId)) },
  });
  await emitTokenUpsert(deps, campaignId, scene, token);
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
export async function myCombatant(
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
    // Some Actions also change the map: standing up drops „Powalony" and
    // beating out the flames drops „Podpalony". Paying and seeing nothing
    // change would be the worst of both.
    if (outcome.kind === 'spent') {
      await clearStatusAfterAction(deps, campaignId, scene, combatant, actionId);
    }
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
    const move = await moveBudgetForCombatant(deps, combatant);
    await deps.ctx.prisma.combatant.update({
      where: { id: combatant.id },
      data: { turnState: freshTurnState(move), actionBypass: false },
    });
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

/**
 * „Ruch utrudniony" (stage 14c): every metre of path costs two of budget.
 *
 * The mover declares it, not the map: the VTT has no idea which squares are
 * water, rubble or a fence, and asking the GM to paint terrain before every
 * fight would cost more than it is worth. The declaration rides in the tracker
 * where the GM can see it — and take it back if they disagree.
 */
export const combatTerrainEvent = defineEvent<CombatTerrainPayload, CombatView>({
  name: 'combat:terrain',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    if (typeof payload?.hard !== 'boolean') throw new RealtimeError('BAD_REQUEST');
    const { combat, combatant, scene } = await myCombatant(
      deps,
      campaignId,
      user,
      socket.data.viewedSceneId,
      payload?.combatantId,
    );
    if (user.role !== ROLE_GM && combat.activeCombatantId !== combatant.id) {
      throw new RealtimeError('NOT_YOUR_TURN');
    }
    await deps.ctx.prisma.combatant.update({
      where: { id: combatant.id },
      data: { turnState: setTurnHardTerrain(combatant.turnState, payload.hard) },
    });
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

/**
 * Taking a participant out of the fight (death, flight, a mistake).
 *
 * Here rather than in `combat.ts` because it reaches onto the map: a Hold that
 * loses either end has to give the „Pochwycony" sticker back, or the survivor
 * is left with a token that silently refuses to walk (stage 14d).
 */
export const combatRemoveEvent = defineEvent<CombatantIdPayload, CombatView>({
  name: 'combat:remove',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { combat, combatant, scene } = await requireCombatant(
      deps.ctx.prisma,
      campaignId,
      payload?.combatantId,
    );

    // Removing whoever is acting (death, flight) hands the turn on rather than
    // stalling the tracker with a pointer to nobody.
    if (combat.activeCombatantId === combatant.id) {
      const pointer = nextTurn(toCombatView(combat));
      const activeCombatantId =
        pointer.activeCombatantId === combatant.id ? null : pointer.activeCombatantId;
      await applyTurnPointer(deps, combat, { ...pointer, activeCombatantId }, true);
    }
    await clearGrapplesOf(deps, campaignId, combat, combatant);
    await deps.ctx.prisma.combatant.delete({ where: { id: combatant.id } });
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

/**
 * Advances the turn. The GM always may; the acting participant's own player
 * may end their turn („Kończę turę") — the server re-checks who that is, so a
 * player can never skip somebody else's turn.
 *
 * Here rather than in `combat.ts` because ending a turn now *does* things
 * (stage 14e): fire burns, ribs re-open, „Przygwożdżony" lifts. All of that
 * writes token state, which sits below this module and above the tracker.
 */
export const combatNextEvent = defineEvent<undefined, CombatView>({
  name: 'combat:next',
  handler: async ({ deps, socket, user }) => {
    const campaignId = requireCampaignId(socket.data);
    const sceneId = socket.data.viewedSceneId;
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, sceneId);
    const combat = await loadCombat(deps.ctx.prisma, scene.id);
    if (!combat) throw new RealtimeError('COMBAT_NOT_FOUND');

    if (user.role !== ROLE_GM) {
      const active = combat.combatants.find((row) => row.id === combat.activeCombatantId);
      if (!active || active.token.hidden) throw new RealtimeError('FORBIDDEN');
      if (combatantOwnerId(active) !== user.id) throw new RealtimeError('FORBIDDEN');
    }

    const pointer = nextTurn(toCombatView(combat));
    // A declaration tied to a value in the queue fires on the way past it,
    // before anybody else gets their turn. Nobody's turn *ended* in that case —
    // the queue merely stepped aside — so the hooks stay out of it.
    const held = dueHold(combat, pointer);
    if (held) await fireHeldAction(deps.ctx.prisma, combat, held);
    else await advanceTurn(deps, campaignId, scene, combat, pointer, user);
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

/**
 * The GM steps the pointer back. Deliberately hookless: this is a correction,
 * not a replay. Budgets have been left alone here since stage 14b, and stage
 * 14e follows the same line — otherwise a GM fixing a mis-click would set the
 * same NPC on fire again. „Zwróć turę" is the button for a genuine do-over.
 */
export const combatPreviousEvent = defineEvent<undefined, CombatView>({
  name: 'combat:previous',
  role: ROLE_GM,
  handler: async ({ deps, socket }) => {
    const campaignId = requireCampaignId(socket.data);
    const sceneId = socket.data.viewedSceneId;
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, sceneId);
    const combat = await loadCombat(deps.ctx.prisma, scene.id);
    if (!combat) throw new RealtimeError('COMBAT_NOT_FOUND');

    const pointer = previousTurn(toCombatView(combat));
    await applyTurnPointer(deps, combat, pointer, false);
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

/**
 * Ending the fight. The rows cascade away with the combat, but the Holds have
 * to be undone first: a relation that dies quietly would leave „Pochwycony"
 * painted on tokens nobody is holding any more.
 */
export const combatEndEvent = defineEvent({
  name: 'combat:end',
  role: ROLE_GM,
  handler: async ({ deps, socket }) => {
    const campaignId = requireCampaignId(socket.data);
    const sceneId = socket.data.viewedSceneId;
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, sceneId);
    const combat = await loadCombat(deps.ctx.prisma, scene.id);
    if (combat) await clearGrapplesOf(deps, campaignId, combat);
    // Ending clears the state completely — round history is not persisted.
    await deps.ctx.prisma.combat.deleteMany({ where: { sceneId: scene.id } });
    await emitCombatOfScene(deps, campaignId, scene);
  },
});

/** Re-exported so callers outside this module can find a participant's row. */
export { findCombatantForToken, loadCombatById, renumberOrder };
