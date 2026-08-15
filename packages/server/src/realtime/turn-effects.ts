import type {
  CombatActionLogEntry,
  DamageLogEntry,
  SessionUser,
  TokenEffectPayload,
  TokenHp,
  TurnPointer,
} from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import type { Scene } from '../generated/prisma/client.js';
import {
  applyPeriodicDamageToSheet,
  applyPeriodicDamageToTokenHp,
  markTurnPhase,
  mergeSheetCarry,
  readSheetBody,
  readSheetInjuries,
  readSheetStatusData,
  sheetExpiringStatuses,
  sheetInjuryTurnEnd,
  sheetPeriodicDamage,
  sheetStatusHasDialableDamage,
  sheetTurnReminders,
  sheetWoundStatuses,
  turnMetresWalked,
  turnPhaseAlreadyRan,
  writeSheetStatusData,
  type SheetPeriodicDamage,
  type SheetTurnCarry,
} from '../sheets.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import {
  applyTurnPointer,
  hasFigure,
  loadCombatById,
  readTokenStatuses,
  requireCampaignId,
  type CombatRow,
  type CombatantRow,
  type FiguredCombatantRow,
} from './combat.js';
import { removeTokenStatus } from './grapple-state.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import {
  emitTokenUpsert,
  emitTokensById,
  emitTokensOfCharacter,
  requireCampaignToken,
} from './tokens.js';
import { sweepTimedEffects } from './timed-effects.js';
import {
  INCLUDE_CHAT_NAMES,
  broadcastChatMessage,
  broadcastRedactedChatMessage,
  toChatMessageView,
} from './chat-io.js';

/**
 * The turn's automatic half (stage 14e).
 *
 * Stage 14b made a turn a budget and 14c made movement cost metres, but both
 * still needed somebody to click. This module is what happens *by itself* when
 * the pointer moves: fire burns, water suffocates, ribs re-open, a pinned NPC
 * stops being pinned, and a turn that owes its Action begins already missing it.
 *
 * Three rules shape it:
 *
 *  - **One doorway.** `advanceTurn` is the only path that ends a turn and starts
 *    the next one, so „what happens at a turn boundary" has exactly one place to
 *    be. The core (`combat.ts`) still knows nothing about fire: it moves the
 *    pointer and hands out fresh budgets, and every CP RED word below reaches it
 *    through `sheets.ts`.
 *  - **Never twice.** Each participant's budget records the round its end-of-turn
 *    effects fired in, so a GM stepping back and forward through the queue cannot
 *    burn the same NPC two rounds' worth. Stepping *back* runs no hooks at all —
 *    it is a correction of the pointer, exactly as it has been since 14b.
 *  - **Damage goes where damage goes.** The periodic hits land as ordinary
 *    `damage` cards, so „Cofnij" works on a fire exactly as it works on a
 *    bullet, and the absolute HP stay redacted to the GM and the target's owner.
 *
 * Its own module for the reason `grapple-state.ts` and `combat-log.ts` are:
 * everything here writes token statuses and HP, which live behind `tokens.ts` —
 * and `tokens.ts` already imports the tracker, so the tracker cannot import this.
 */

/** The two moments a turn hands control to the game system. */
export type TurnPhase = 'turn-start' | 'turn-end';

/** Damage one status or injury owed, once it has actually been written down. */
interface AppliedPeriodicDamage {
  due: SheetPeriodicDamage;
  log: DamageLogEntry;
}

/**
 * Moves the turn on, running the system's hooks around the pointer.
 *
 * The order matters and is the order a table plays in: the turn that is ending
 * pays what it owes *before* the next one begins, because a character who burns
 * to death on their own turn does not get to act in the next one.
 */
export async function advanceTurn(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  combat: CombatRow,
  pointer: TurnPointer,
  user: SessionUser,
): Promise<void> {
  const leaving = combat.combatants.find((row) => row.id === combat.activeCombatantId) ?? null;
  if (leaving) await runTurnEnd(deps, campaignId, scene, combat, leaving, user);

  // The roster is re-read: the end-of-turn hook may have written a carry, and
  // `applyTurnPointer` is what spends it into the fresh budget.
  const refreshed = await loadCombatById(deps.ctx.prisma, combat.id);
  await applyTurnPointer(deps, refreshed, pointer, true);

  // Stage 16h: a minute is six rounds, and this is where they are counted. Swept
  // over the whole scene rather than the queue — a bystander blinded by tear gas
  // has no turn to hang a hook on, and „the civilian never recovers" would be a
  // bug nobody would think to look for.
  await sweepTimedEffects(deps, campaignId, scene, pointer.round);

  if (pointer.activeCombatantId === null) return;
  const started = await loadCombatById(deps.ctx.prisma, combat.id);
  const starting = started.combatants.find((row) => row.id === pointer.activeCombatantId);
  if (starting) await runTurnStart(deps, campaignId, scene, started, starting, user);
}

/**
 * End of one participant's turn: what the round cost them for simply being on
 * fire, poisoned, or wounded in a way that punishes walking.
 */
export async function runTurnEnd(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  combat: CombatRow,
  combatant: CombatantRow,
  user: SessionUser,
): Promise<void> {
  // The guard. Without it „cofnij turę" followed by „następna tura" is a second
  // helping of fire for a participant who only lived through the round once.
  if (turnPhaseAlreadyRan(combatant.turnEffects, 'turn-end', combat.round)) return;
  // Nothing here means anything without a body: fire, poison and broken ribs
  // are what a figure carries. A Black ICE (stage 26c) has none of that.
  if (!hasFigure(combatant)) return;

  const statuses = readTokenStatuses(combatant.token.statuses);
  const sheet = await sheetOf(deps, combatant);
  const injuries = sheet ? readSheetInjuries(sheet, deps.ctx.cpred) : [];

  const due: SheetPeriodicDamage[] = [
    ...sheetPeriodicDamage(statuses, 'turn-end', {
      values: readSheetStatusData(combatant.token.statusData),
      ...(sheet ? { body: readSheetBody(sheet, deps.ctx.cpred) } : {}),
    }),
  ];

  // „Na koniec każdej Tury, w której przemieściłeś się ponad 4 m na piechotę…"
  // — the metres of *path*, which is why 14e keeps them apart from the budget.
  const walked = turnMetresWalked(combatant.turnState);
  const fromInjuries = sheetInjuryTurnEnd(injuries, walked);
  due.push(...fromInjuries.damage);

  const applied = await applyPeriodicDamage(deps, campaignId, combatant, due);

  // „Przygwożdżony" is a one-round state: it goes away with the turn it cost.
  for (const statusId of sheetExpiringStatuses(statuses)) {
    await removeTokenStatus(deps, campaignId, combatant.tokenId, statusId);
  }

  const carry = mergeSheetCarry(readCarry(combatant), fromInjuries.carry);
  await deps.ctx.prisma.combatant.update({
    where: { id: combatant.id },
    data: {
      turnEffects: markTurnPhase(combatant.turnEffects, 'turn-end', combat.round),
      nextTurnState: carry ? JSON.stringify(carry) : null,
    },
  });

  if (applied.length > 0 || fromInjuries.carry) {
    await logTurnEffects(deps, campaignId, user, combatant, applied, fromInjuries.carry, walked);
  }
}

/**
 * Start of one participant's turn: what is owed before they may do anything,
 * plus the nudges that are not rules.
 *
 * The Death Save prompt is deliberately *not* here — it has lived on the client
 * since stage 15, where it belongs: the roll goes through the dice cup like
 * every other roll at this table, and the client already knows whose turn it is
 * and what the sheet says. The banner is a reminder, not an event.
 */
export async function runTurnStart(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  combat: CombatRow,
  combatant: CombatantRow,
  user: SessionUser,
): Promise<void> {
  // The same guard on the other side, and the reason the ledger lives in its
  // own column: stepping the pointer back and forward hands this participant a
  // *fresh* budget, so a marker inside the budget would already be gone.
  if (turnPhaseAlreadyRan(combatant.turnEffects, 'turn-start', combat.round)) return;
  if (!hasFigure(combatant)) return;
  await deps.ctx.prisma.combatant.update({
    where: { id: combatant.id },
    data: { turnEffects: markTurnPhase(combatant.turnEffects, 'turn-start', combat.round) },
  });

  const statuses = readTokenStatuses(combatant.token.statuses);
  const sheet = await sheetOf(deps, combatant);
  const due = sheetPeriodicDamage(statuses, 'turn-start', {
    values: readSheetStatusData(combatant.token.statusData),
    ...(sheet ? { body: readSheetBody(sheet, deps.ctx.cpred) } : {}),
  });
  const applied = await applyPeriodicDamage(deps, campaignId, combatant, due);

  const reminders = sheetTurnReminders(statuses);
  if (applied.length > 0 || reminders.length > 0) {
    await logTurnStart(deps, campaignId, user, combatant, applied, reminders);
  }
}

/** The sheet behind a participant, when they have one. */
async function sheetOf(deps: RealtimeDeps, combatant: FiguredCombatantRow) {
  const characterId = combatant.token.character?.id;
  if (!characterId) return null;
  return deps.ctx.prisma.character.findUnique({ where: { id: characterId } });
}

/** The debt already written on a participant's row, if any. */
function readCarry(combatant: CombatantRow): SheetTurnCarry | null {
  if (!combatant.nextTurnState) return null;
  try {
    const parsed: unknown = JSON.parse(combatant.nextTurnState);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = parsed as { noAction?: unknown; noMove?: unknown };
    return {
      ...(typeof value.noAction === 'string' ? { noAction: value.noAction } : {}),
      ...(typeof value.noMove === 'string' ? { noMove: value.noMove } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Writes every line of periodic damage to whichever of the two places holds the
 * target's HP, one at a time so each lands as its own undoable card.
 *
 * A target already at zero is skipped rather than hit for nothing: „ogień pali
 * trupa" is not a rule, and an endless run of 0-damage cards would bury chat.
 */
async function applyPeriodicDamage(
  deps: RealtimeDeps,
  campaignId: string,
  combatant: FiguredCombatantRow,
  due: readonly SheetPeriodicDamage[],
): Promise<AppliedPeriodicDamage[]> {
  const applied: AppliedPeriodicDamage[] = [];
  for (const entry of due) {
    const log = await applyOnePeriodicHit(deps, campaignId, combatant, entry);
    if (log) applied.push({ due: entry, log });
  }
  return applied;
}

async function applyOnePeriodicHit(
  deps: RealtimeDeps,
  campaignId: string,
  combatant: FiguredCombatantRow,
  entry: SheetPeriodicDamage,
): Promise<DamageLogEntry | null> {
  const characterId = combatant.token.character?.id ?? null;
  if (characterId) {
    const character = await deps.ctx.prisma.character.findUnique({ where: { id: characterId } });
    if (!character) return null;
    const applied = applyPeriodicDamageToSheet(character, deps.ctx.cpred, entry.damage);
    if (applied.log.hpLost === 0) return null;
    const saved = await deps.ctx.prisma.character.update({
      where: { id: character.id },
      data: { data: applied.data },
    });
    await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
    await emitTokensOfCharacter(deps, campaignId, saved);
    return logEntryFor(combatant, entry, applied.log, characterId);
  }

  const hp: TokenHp | null =
    combatant.token.hpMax === null
      ? null
      : { current: combatant.token.hpCurrent ?? 0, max: combatant.token.hpMax };
  // A statist with no HP at all cannot burn: there is nothing to subtract from,
  // and inventing a pool for them would be worse than the GM's judgement.
  if (!hp) return null;
  const applied = applyPeriodicDamageToTokenHp(hp, entry.damage);
  if (applied.log.hpLost === 0) return null;
  await deps.ctx.prisma.token.update({
    where: { id: combatant.tokenId },
    data: {
      hpCurrent: applied.hp.current,
      statuses: JSON.stringify(
        sheetWoundStatuses(readTokenStatuses(combatant.token.statuses), applied.hp),
      ),
    },
  });
  await emitTokensById(deps, campaignId, [combatant.tokenId]);
  return logEntryFor(combatant, entry, applied.log, null);
}

function logEntryFor(
  combatant: FiguredCombatantRow,
  entry: SheetPeriodicDamage,
  log: Omit<DamageLogEntry, 'targetTokenId' | 'targetName' | 'characterId' | 'targetOwnerId'>,
  characterId: string | null,
): DamageLogEntry {
  return {
    ...log,
    targetTokenId: combatant.tokenId,
    targetName: combatant.token.name,
    characterId,
    targetOwnerId: combatant.token.character?.ownerId ?? combatant.token.ownerId,
    injuryNote: `${entry.label} — obrażenia okresowe, bez pancerza`,
  };
}

/** Posts one damage card per hit, in the stage 15 shape „Cofnij" understands. */
async function postDamageCards(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  applied: readonly AppliedPeriodicDamage[],
): Promise<void> {
  for (const { due, log } of applied) {
    const stored = await deps.ctx.prisma.chatMessage.create({
      data: {
        campaignId,
        authorId: user.id,
        kind: 'damage',
        text: `${log.targetName} — ${due.label}`,
        payload: JSON.stringify(log),
      },
      include: INCLUDE_CHAT_NAMES,
    });
    await broadcastRedactedChatMessage(deps, campaignId, toChatMessageView(stored));
  }
}

/**
 * The public line for what the end of a turn did, next to the damage cards.
 *
 * Two audiences want different things here: the damage card carries the numbers
 * (redacted), and this line carries the *reason* — „Vex — koniec tury: Podpalony
 * · Złamane żebra (przeszedł 9 m)". It is the same `action` card the rest of the
 * tracker writes, so stage 19's bots read the fight from one kind of message.
 */
async function logTurnEffects(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  combatant: FiguredCombatantRow,
  applied: readonly AppliedPeriodicDamage[],
  carry: SheetTurnCarry | null,
  walked: number,
): Promise<void> {
  await postDamageCards(deps, campaignId, user, applied);
  const parts = applied.map(({ due }) => due.label);
  if (carry?.noMove) parts.push(carry.noMove);
  if (parts.length === 0) return;
  const entry: CombatActionLogEntry = {
    combatantId: combatant.id,
    actorName: combatant.token.name,
    actionId: 'turn-end',
    actionName: 'Koniec tury',
    note: `${parts.join(' · ')}${walked > 0 ? ` · przeszedł ${formatWalked(walked)}` : ''}`,
  };
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

/** The same, for the start of a turn — drowning, and the nudges. */
async function logTurnStart(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  combatant: FiguredCombatantRow,
  applied: readonly AppliedPeriodicDamage[],
  reminders: readonly string[],
): Promise<void> {
  await postDamageCards(deps, campaignId, user, applied);
  const parts = [...applied.map(({ due }) => due.label), ...reminders];
  if (parts.length === 0) return;
  const entry: CombatActionLogEntry = {
    combatantId: combatant.id,
    actorName: combatant.token.name,
    actionId: 'turn-start',
    actionName: 'Początek tury',
    note: parts.join(' · '),
  };
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

function formatWalked(metres: number): string {
  const rounded = Math.round(metres * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1).replace('.', ',')} m`;
}

/**
 * A wound that owes the *next* turn its Action, written onto the tracker row of
 * whoever it landed on. Called from the damage path, which is the only place
 * that knows an injury was drawn — and which may well be running on somebody
 * else's turn.
 *
 * A target who is not in the fight simply has nowhere to owe it; the GM plays
 * that out by hand, exactly as they do a statist's Critical Injury.
 */
export async function oweCarryToToken(
  deps: RealtimeDeps,
  sceneId: string,
  tokenId: string,
  carry: SheetTurnCarry,
): Promise<void> {
  const combat = await deps.ctx.prisma.combat.findUnique({
    where: { sceneId },
    include: { combatants: true },
  });
  if (!combat) return;
  const row = combat.combatants.find((entry) => entry.tokenId === tokenId);
  if (!row) return;
  const merged = mergeSheetCarry(
    row.nextTurnState ? (JSON.parse(row.nextTurnState) as SheetTurnCarry) : null,
    carry,
  );
  await deps.ctx.prisma.combatant.update({
    where: { id: row.id },
    data: { nextTurnState: merged ? JSON.stringify(merged) : null },
  });
}

/**
 * The GM sets a periodic status, with its number (stage 14e).
 *
 * A GM event because the *source* of a fire is never in the model: the VTT does
 * not know that the barrel exploded or that the character is under water. What
 * it does know is what a status costs once it is there, which is exactly the
 * division of labour „ruch utrudniony" settled in 14c.
 *
 * Both halves in one call, because at the table it is one sentence — and the
 * dial is refused for a status the rules compute themselves (drowning is BODY,
 * whatever the client sends).
 */
export const tokenEffectEvent = defineEvent<TokenEffectPayload, { statuses: string[] }>({
  name: 'token:effect',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const statusId = payload?.statusId;
    if (typeof statusId !== 'string' || !deps.ctx.statuses.ids.has(statusId)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    if (typeof payload?.active !== 'boolean') throw new RealtimeError('BAD_REQUEST');
    const { token, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaignId,
      payload?.tokenId,
    );

    const statuses = readTokenStatuses(token.statuses);
    const next = payload.active
      ? statuses.includes(statusId)
        ? statuses
        : [...statuses, statusId]
      : statuses.filter((id) => id !== statusId);

    // A number only sticks to a status whose damage the rules let anybody set.
    let damage: number | null = null;
    if (payload.active && sheetStatusHasDialableDamage(statusId)) {
      const requested = payload.damage;
      if (requested !== undefined && requested !== null) {
        if (!Number.isInteger(requested) || requested < 0 || requested > EFFECT_DAMAGE_MAX) {
          throw new RealtimeError('BAD_REQUEST');
        }
        damage = requested;
      }
    }

    const saved = await deps.ctx.prisma.token.update({
      where: { id: token.id },
      data: {
        statuses: JSON.stringify(next),
        statusData: writeSheetStatusData(token.statusData, statusId, damage),
      },
    });
    await emitTokenUpsert(deps, campaignId, scene, saved);
    return { statuses: next };
  },
});

/** Highest per-turn damage the GM may dial in — a sanity rail, not a rule. */
const EFFECT_DAMAGE_MAX = 100;

/**
 * Pins a token that lost its WILL check against suppressive fire (stage 16's
 * forced check, stage 14e's consequence). Soft by design: the map has no cover
 * model, so the status nags rather than refuses, and it lifts by itself at the
 * end of the pinned token's own turn.
 */
export async function pinToken(
  deps: RealtimeDeps,
  campaignId: string,
  tokenId: string,
  statusId: string,
): Promise<void> {
  const token = await deps.ctx.prisma.token.findUnique({ where: { id: tokenId } });
  if (!token) return;
  const statuses = readTokenStatuses(token.statuses);
  if (statuses.includes(statusId)) return;
  await deps.ctx.prisma.token.update({
    where: { id: tokenId },
    data: { statuses: JSON.stringify([...statuses, statusId]) },
  });
  await emitTokensById(deps, campaignId, [tokenId]);
}

/** What setting a periodic status did, so „Cofnij" can put it back. */
export interface AppliedStatusEffect {
  statusId: string;
  /** True when the token was not carrying the status before. */
  added: boolean;
  /** The number it carried before, or null when it had none. */
  damageBefore: number | null;
}

/**
 * Sets a burning (or otherwise periodic) status with the number the *source*
 * dictates — a round of incendiary ammunition burns for 2, a flamethrower for 4
 * (stages 16g, s. 346 and 348).
 *
 * „Efekty tego ataku z kilku źródeł nie kumulują się" (s. 346), and the
 * flamethrower says how they combine instead: „ten efekt zastępuje efekt
 * podpalenia zadający mniejsze obrażenia". So two fires are not two fires — the
 * fiercer one wins, and a weaker one changes nothing at all.
 */
export async function igniteToken(
  deps: RealtimeDeps,
  campaignId: string,
  tokenId: string,
  effect: { statusId: string; damage: number },
): Promise<AppliedStatusEffect | null> {
  const token = await deps.ctx.prisma.token.findUnique({ where: { id: tokenId } });
  if (!token) return null;
  const statuses = readTokenStatuses(token.statuses);
  const values = readSheetStatusData(token.statusData);
  const before = values[effect.statusId];
  const carried = statuses.includes(effect.statusId);
  const current = carried ? (before ?? defaultPeriodicDamage(effect.statusId)) : 0;
  if (carried && current >= effect.damage) return null;

  await deps.ctx.prisma.token.update({
    where: { id: tokenId },
    data: {
      statuses: JSON.stringify(carried ? statuses : [...statuses, effect.statusId]),
      statusData: writeSheetStatusData(token.statusData, effect.statusId, effect.damage),
    },
  });
  await emitTokensById(deps, campaignId, [tokenId]);
  return {
    statusId: effect.statusId,
    added: !carried,
    damageBefore: before === undefined ? null : before,
  };
}

/** Puts a status's number back where it was; used by „Cofnij" (stage 16g). */
export async function restoreStatusValues(
  deps: RealtimeDeps,
  campaignId: string,
  tokenId: string,
  values: Readonly<Record<string, number | null>>,
): Promise<void> {
  const entries = Object.entries(values);
  if (entries.length === 0) return;
  const token = await deps.ctx.prisma.token.findUnique({ where: { id: tokenId } });
  if (!token) return;
  let statusData = token.statusData;
  for (const [statusId, damage] of entries) {
    statusData = writeSheetStatusData(statusData, statusId, damage);
  }
  await deps.ctx.prisma.token.update({ where: { id: tokenId }, data: { statusData } });
  await emitTokensById(deps, campaignId, [tokenId]);
}

/** How hard this status burns when nobody set a number — the table's own value. */
function defaultPeriodicDamage(statusId: string): number {
  const due = [
    ...sheetPeriodicDamage([statusId], 'turn-end'),
    ...sheetPeriodicDamage([statusId], 'turn-start'),
  ];
  return due[0]?.damage ?? 0;
}
