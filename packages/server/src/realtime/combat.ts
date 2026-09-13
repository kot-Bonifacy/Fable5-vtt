import type {
  ChatMessageView,
  CombatAddPayload,
  CombatInitiativePayload,
  CombatOrderPayload,
  CombatRerollTiePayload,
  CombatRollAllPayload,
  CombatRollPayload,
  CombatStartPayload,
  CombatUpdateBroadcast,
  CombatView,
  CombatantView,
  GrappleView,
  RollBreakdownEntry,
  RollFormula,
  RollResult,
  SessionUser,
  TurnPointer,
} from '@vtt/shared';
import {
  COMBAT_INITIATIVE_MAX,
  COMBAT_INITIATIVE_MIN,
  MAX_COMBATANTS,
  ROLE_GM,
  filterCombatForPlayer,
  resolveInitiativeOrder,
  rollFormula,
  sortCombatants,
  tokenTableName,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Combat, Combatant, Scene, Token } from '../generated/prisma/client.js';
import {
  applyMoveBudget,
  freshTurnState,
  readSheetCarry,
  sheetActionBlock,
  readSheetInitiative,
  readSheetMoveBudget,
  sheetSlowedMoveModifier,
  spendTurnState,
  spendUsesAction,
  reinforcementsOf,
  turnBudgetOf,
  type SheetMoveBudget,
  type SheetRegistry,
  type SheetTurnCarry,
  type SheetTurnProblem,
  type SheetTurnSpend,
} from '../sheets.js';
import { createMixedRng } from './dice-rng.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { campaignRoom, gmRoom, sceneRoom } from './state.js';
import { requireCampaignScene } from './scenes.js';
import { INCLUDE_CHAT_NAMES, deliverRollMessage, toChatMessageView } from './chat-io.js';
import { sanitizeGesture } from './chat.js';

/**
 * The initiative tracker (stage 14).
 *
 * The tracker is core VTT state: participants, their initiative values and
 * whose turn it is. Everything system-specific — that CP RED rolls
 * `1d10 + REF` — is read through the sheet adapter (`sheets.ts`), the same
 * seam the token layer uses for HP.
 *
 * Visibility follows stage 05: a participant whose token is hidden never
 * appears in a player's payload, so the tracker cannot betray an ambush.
 */

/**
 * A combatant row together with everything needed to render and roll it.
 *
 * `token` is nullable since stage 26c: a Black ICE „zajmuje pierwsze miejsce
 * w Kolejce Inicjatywy" (s. 205) without ever standing anywhere on the map. It
 * is the only bodiless participant so far, and every rule that reaches for a
 * figure — moving, being shot at, catching fire, being held — simply skips a
 * row that has none. `combatantName` is what the tracker paints instead.
 */
export type CombatantRow = Combatant & {
  token: (Token & { character: { id: string; ownerId: string | null } | null }) | null;
};

/** The same row, narrowed to the participants that have a figure on the map. */
export type FiguredCombatantRow = CombatantRow & {
  tokenId: string;
  token: Token & { character: { id: string; ownerId: string | null } | null };
};

export function hasFigure(row: CombatantRow): row is FiguredCombatantRow {
  return row.token !== null && row.tokenId !== null;
}

/** „Kraken" — the name of a participant with no token to read it off. */
export function combatantName(row: CombatantRow): string {
  return row.token?.name ?? row.label ?? 'Uczestnik';
}

/**
 * The same participant as a chat card names it — the figure's alias when the GM
 * gave it one (13.09). The tracker keeps `combatantName`: there
 * `filterCombatForPlayer` swaps the name per viewer, and a stored card cannot.
 */
export function combatantTableName(row: CombatantRow): string {
  return row.token ? tokenTableName(row.token, row.token.name) : combatantName(row);
}

export type CombatRow = Combat & { combatants: CombatantRow[] };

const COMBAT_INCLUDE = {
  combatants: {
    include: {
      token: { include: { character: { select: { id: true, ownerId: true } } } },
    },
  },
} as const;

/**
 * Who controls a participant: the token's owner, or the linked sheet's. A
 * bodiless one is the GM's — „LOD-y zawsze kontroluje MG" (s. 205).
 */
export function combatantOwnerId(row: CombatantRow): string | null {
  return row.token?.ownerId ?? row.token?.character?.ownerId ?? null;
}

/**
 * The debt a participant's next turn starts with (stage 14e). Opaque to the
 * tracker like `turnState` itself: the core stores what the system wrote and
 * hands it straight back when the turn begins.
 */
function readTurnCarry(raw: string | null): SheetTurnCarry | null {
  return readSheetCarry(raw);
}

/** Status ids of a token, forgiving of a column somebody hand-edited. */
export function readTokenStatuses(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ *
 * The Hold (stage 14d). Tracker state, like the initiative queue: it is
 * a statement about participants and it dies with the fight. Stored once
 * — on the Held row, pointing at the Attacker — so „kto kogo" has exactly
 * one place to be wrong.
 * ------------------------------------------------------------------ */

/** Both ends of one Hold, resolved against the roster. */
export interface GrapplePair {
  attacker: CombatantRow;
  defender: CombatantRow;
}

/** The Hold this participant is in, from either end; null when free. */
export function findGrapple(combat: CombatRow, combatant: CombatantRow): GrapplePair | null {
  if (combatant.grappledById) {
    const attacker = combat.combatants.find((row) => row.id === combatant.grappledById);
    // A dangling pointer means the Attacker left the fight; the Hold left with
    // them, and the row is tidied up the next time anything writes to it.
    return attacker ? { attacker, defender: combatant } : null;
  }
  const defender = combat.combatants.find((row) => row.grappledById === combatant.id);
  return defender ? { attacker: combatant, defender } : null;
}

/** What the tracker paints for one participant's Hold. */
function grappleViewFor(combat: CombatRow, combatant: CombatantRow): GrappleView | undefined {
  const pair = findGrapple(combat, combatant);
  if (!pair) return undefined;
  const attacking = pair.attacker.id === combatant.id;
  const other = attacking ? pair.defender : pair.attacker;
  return {
    role: attacking ? 'attacker' : 'defender',
    otherId: other.id,
    otherName: combatantName(other),
    ...(pair.defender.humanShield ? { shield: true } : {}),
    ...(pair.defender.chokeStreak > 0 ? { chokeStreak: pair.defender.chokeStreak } : {}),
  };
}

export function toCombatantView(row: CombatantRow, combat: CombatRow): CombatantView {
  const view: CombatantView = {
    id: row.id,
    tokenId: row.tokenId,
    name: combatantName(row),
    // Carried, not applied: `filterCombatForPlayer` decides who gets which
    // name. A participant with no figure (a Black ICE) has no alias to carry.
    ...(row.token?.publicName !== null && row.token?.publicName !== undefined
      ? { publicName: row.token.publicName }
      : {}),
    imageUrl: row.token?.imageUrl ?? null,
    initiative: row.initiative,
    tieBreak: row.tieBreak,
    order: row.order,
    ownerId: combatantOwnerId(row),
  };
  if (row.token?.hidden) view.hidden = true;
  // The budget is the system's projection (stage 14b) — the tracker only paints
  // it. Absent until the participant's turn has actually begun.
  const budget = turnBudgetOf(row.turnState);
  if (budget) view.turn = row.actionBypass ? { ...budget, bypass: true } : budget;
  if (row.held) view.held = { trigger: row.heldTrigger, initiative: row.heldInitiative };
  const grapple = grappleViewFor(combat, row);
  if (grapple) view.grapple = grapple;
  // What their next turn already owes (stage 14e) — a wound that landed on
  // somebody else's turn is invisible until this row says so.
  const carry = readTurnCarry(row.nextTurnState);
  if (carry) {
    const owes = [carry.noAction, carry.noMove].filter((line): line is string => Boolean(line));
    if (owes.length > 0) view.owes = owes;
  }
  return view;
}

/** The GM's full view — sorted, with hidden participants included. */
export function toCombatView(row: CombatRow): CombatView {
  // Who is still on their way (stage 30c). The system reads its own column and
  // hands back rows; the tracker paints them and counts the rounds down.
  const reinforcements = reinforcementsOf(row.systemState);
  return {
    id: row.id,
    sceneId: row.sceneId,
    round: row.round,
    activeCombatantId: row.activeCombatantId,
    combatants: sortCombatants(row.combatants.map((combatant) => toCombatantView(combatant, row))),
    ...(reinforcements.length > 0 ? { reinforcements } : {}),
  };
}

/**
 * Is this token in a Hold, and is it being used as cover? Read by the attack
 * paths, which need the −2, the two-handed refusal and „Ludzka tarcza nie może
 * unikać" without dragging the whole grapple module in behind them.
 *
 * A token outside a running fight is never in a Hold: the relation only exists
 * inside combat, and ending the fight clears it (`clearGrapplesOfCombat`).
 */
export async function grappleStateForToken(
  prisma: PrismaClient,
  sceneId: string,
  tokenId: string,
): Promise<{ grappled: boolean; humanShield: boolean; shieldOf: CombatantRow | null }> {
  const free = { grappled: false, humanShield: false, shieldOf: null };
  const combat = await loadCombat(prisma, sceneId);
  if (!combat) return free;
  const combatant = combat.combatants.find((row) => row.tokenId === tokenId);
  if (!combatant) return free;
  const pair = findGrapple(combat, combatant);
  if (!pair) return free;
  return {
    grappled: true,
    // Only the Held one is ever the shield; the Attacker is the one behind it.
    humanShield: pair.defender.id === combatant.id && pair.defender.humanShield,
    shieldOf: pair.defender.humanShield && pair.attacker.id === combatant.id ? pair.defender : null,
  };
}

export async function loadCombat(prisma: PrismaClient, sceneId: string): Promise<CombatRow | null> {
  return prisma.combat.findUnique({ where: { sceneId }, include: COMBAT_INCLUDE });
}

export async function loadCombatById(prisma: PrismaClient, combatId: string): Promise<CombatRow> {
  const combat = await prisma.combat.findUnique({
    where: { id: combatId },
    include: COMBAT_INCLUDE,
  });
  if (!combat) throw new RealtimeError('COMBAT_NOT_FOUND');
  return combat;
}

/** Combat of a scene as one viewer sees it — used by `state:sync`. */
export async function fetchCombatFor(
  prisma: PrismaClient,
  sceneId: string,
  user: SessionUser,
): Promise<CombatView | null> {
  const row = await loadCombat(prisma, sceneId);
  if (!row) return null;
  const view = toCombatView(row);
  return user.role === ROLE_GM ? view : filterCombatForPlayer(view);
}

/**
 * Emits the current combat of a scene.
 *
 * Same shape as token emissions (stage 05): the active scene gets a sequenced
 * campaign-wide broadcast carrying the player-safe view, followed by the full
 * view targeted at the GM room (no seq — targeted emissions must not create
 * gaps). A non-active scene only reaches its viewers, i.e. a GM previewing it.
 */
function emitCombat(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  combat: CombatView | null,
): void {
  const full: CombatUpdateBroadcast = { sceneId: scene.id, combat };
  if (!scene.active) {
    deps.io.to(sceneRoom(scene.id)).emit('combat:update', full);
    return;
  }
  const room = campaignRoom(campaignId);
  const publicPayload: CombatUpdateBroadcast = {
    seq: deps.seqs.next(room),
    sceneId: scene.id,
    combat: combat ? filterCombatForPlayer(combat) : null,
  };
  deps.io.to(room).emit('combat:update', publicPayload);
  deps.io.to(gmRoom(campaignId)).emit('combat:update', full);
}

/**
 * Reloads and re-emits the combat of a scene. Called by the token layer after
 * a change that alters the tracker: a hidden token has to vanish from the
 * players' tracker as well as from their map, a renamed one has to update its
 * row, and a deleted one is cascaded out of the fight by the database.
 */
export async function emitCombatOfScene(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
): Promise<void> {
  const row = await loadCombat(deps.ctx.prisma, scene.id);
  emitCombat(deps, campaignId, scene, row ? toCombatView(row) : null);
}

export function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

function requireIdList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new RealtimeError('BAD_REQUEST');
  const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length === 0 || ids.length !== value.length) throw new RealtimeError('BAD_REQUEST');
  return [...new Set(ids)];
}

/** Loads a combat plus its scene, rejecting anything outside the campaign. */
export async function requireCombatant(
  prisma: PrismaClient,
  campaignId: string,
  combatantId: unknown,
): Promise<{ combat: CombatRow; combatant: CombatantRow; scene: Scene }> {
  if (typeof combatantId !== 'string' || combatantId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const combatant = await prisma.combatant.findUnique({
    where: { id: combatantId },
    include: { combat: { include: { scene: true } } },
  });
  if (!combatant) throw new RealtimeError('COMBATANT_NOT_FOUND');
  const scene = combatant.combat.scene;
  if (scene.campaignId !== campaignId) throw new RealtimeError('COMBATANT_NOT_FOUND');
  const combat = await loadCombatById(prisma, combatant.combatId);
  const row = combat.combatants.find((c) => c.id === combatant.id);
  if (!row) throw new RealtimeError('COMBATANT_NOT_FOUND');
  return { combat, combatant: row, scene };
}

/** The running combat of the scene these tokens sit on (all must share it). */
async function requireCombatOfTokens(
  prisma: PrismaClient,
  campaignId: string,
  tokenIds: string[],
): Promise<{ combat: CombatRow; scene: Scene; tokens: Token[] }> {
  const tokens = await prisma.token.findMany({
    where: { id: { in: tokenIds } },
    include: { scene: true },
  });
  if (tokens.length !== tokenIds.length) throw new RealtimeError('TOKEN_NOT_FOUND');
  const scene = tokens[0]?.scene;
  if (!scene || scene.campaignId !== campaignId) throw new RealtimeError('TOKEN_NOT_FOUND');
  if (tokens.some((token) => token.sceneId !== scene.id)) throw new RealtimeError('BAD_REQUEST');
  const combat = await loadCombat(prisma, scene.id);
  if (!combat) throw new RealtimeError('COMBAT_NOT_FOUND');
  return {
    combat,
    scene,
    tokens: tokens.map(({ scene: _scene, ...token }) => token as Token),
  };
}

/** Rolls `1d10 + modifier` without the check rule — initiative never crits. */
function rollInitiative(
  modifier: number,
  entropy: string | undefined,
): { result: RollResult; formula: RollFormula } {
  const terms: RollFormula['terms'] = [{ kind: 'dice', sign: 1, count: 1, sides: 10 }];
  if (modifier !== 0) {
    terms.push({ kind: 'modifier', sign: modifier < 0 ? -1 : 1, value: Math.abs(modifier) });
  }
  const formula: RollFormula = { terms };
  return { result: rollFormula(formula, createMixedRng(entropy), { checkRule: false }), formula };
}

/**
 * A bare 1d10, for a figure the rules give no REF (stage 30c).
 *
 * Wsparcie is the case: its printed block carries a Wartość bojowa, an OB, PW,
 * RUCH and BC and no reflexes at all. Adding the combat value would park a
 * C-SWAT trooper at the top of every queue for ever; leaving the row unrolled
 * would hide the reinforcements at the bottom until somebody noticed them.
 */
export function rollFlatInitiative(): number {
  return rollInitiative(0, undefined).result.total;
}

/**
 * Initiative inputs of one participant. A statist without a sheet rolls a bare
 * 1d10 — the GM can always type a value in by hand afterwards.
 */
function initiativeInputsOf(
  row: CombatantRow,
  registry: SheetRegistry,
  sheets: Map<string, string>,
): { modifier: number; tieBreak: number | null; label: string | null } {
  const characterId = row.token?.character?.id;
  const data = characterId ? sheets.get(characterId) : undefined;
  if (data === undefined) return { modifier: 0, tieBreak: null, label: null };
  const initiative = readSheetInitiative({ data }, registry);
  return { modifier: initiative.modifier, tieBreak: initiative.tieBreak, label: initiative.label };
}

/** Sheet payloads of the given participants (character id → data JSON). */
async function loadCombatSheets(
  prisma: PrismaClient,
  rows: CombatantRow[],
): Promise<Map<string, string>> {
  const ids = rows
    .map((row) => row.token?.character?.id)
    .filter((id): id is string => typeof id === 'string');
  if (ids.length === 0) return new Map();
  const characters = await prisma.character.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, data: true },
  });
  return new Map(characters.map((c) => [c.id, c.data]));
}

/**
 * Rolls initiative for the given participants and persists the results — the
 * GM's „rzuć wszystkim", which stays off chat on purpose: five cards for five
 * NPCs would bury the conversation.
 */
async function rollFor(deps: RealtimeDeps, targets: CombatantRow[]): Promise<void> {
  const sheets = await loadCombatSheets(deps.ctx.prisma, targets);
  for (const row of targets) {
    const inputs = initiativeInputsOf(row, deps.ctx.cpred, sheets);
    const { result } = rollInitiative(inputs.modifier, undefined);
    await deps.ctx.prisma.combatant.update({
      where: { id: row.id },
      data: { initiative: result.total, tieBreak: inputs.tieBreak },
    });
  }
}

/**
 * Re-assigns manual positions after initiative changed: the system's
 * tie-breaker (CP RED: REF) resolves equal totals automatically, and a drag
 * between genuinely tied participants survives, because the previous position
 * is the last criterion.
 */
export async function renumberOrder(prisma: PrismaClient, combat: CombatRow): Promise<void> {
  const ordered = resolveInitiativeOrder(
    combat.combatants.map((combatant) => toCombatantView(combatant, combat)),
  );
  await Promise.all(
    ordered.map((combatant, index) =>
      prisma.combatant.update({ where: { id: combatant.id }, data: { order: index } }),
    ),
  );
}

/**
 * Moves the turn pointer and does the turn's housekeeping (stage 14b).
 *
 * `startTurn` is what makes „a turn began" real: the participant who is up
 * gets a fresh budget from the game system, so their Move Action and Action
 * are back — and everybody's one-shot pass from the GM expires, because
 * „przepuść" means *this* action, not a standing permission.
 *
 * A new round also wipes every „Wstrzymanie Akcji" nobody fired: RAW keeps a
 * held Action inside the Round it was declared in, and a declaration that
 * outlived its round would let a player act twice in the next one.
 *
 * Stepping *back* deliberately leaves budgets alone — the GM is correcting the
 * pointer, not replaying the turn. „Zwróć turę" is the button for that.
 */
export async function applyTurnPointer(
  deps: RealtimeDeps,
  combat: CombatRow,
  pointer: TurnPointer,
  startTurn: boolean,
): Promise<void> {
  const prisma = deps.ctx.prisma;
  await prisma.combat.update({
    where: { id: combat.id },
    data: { round: pointer.round, activeCombatantId: pointer.activeCombatantId },
  });
  if (pointer.round !== combat.round) {
    await prisma.combatant.updateMany({
      where: { combatId: combat.id, held: true },
      data: { held: false, heldTrigger: null, heldInitiative: null },
    });
  }
  if (!startTurn) return;
  await prisma.combatant.updateMany({
    where: { combatId: combat.id, actionBypass: true },
    data: { actionBypass: false },
  });
  if (pointer.activeCombatantId === null) return;
  // The fresh budget carries the distance this participant may cover, read off
  // their sheet at the moment their turn begins (stage 14c) — and whatever the
  // previous turn left them owing (stage 14e: a spine injury takes the Action
  // of a turn that had not begun when the wound landed). The debt is spent
  // here, so it can never be paid twice.
  const starting = combat.combatants.find((row) => row.id === pointer.activeCombatantId);
  const move = starting ? await moveBudgetForCombatant(deps, starting) : null;
  const carry = starting ? readTurnCarry(starting.nextTurnState) : null;
  await prisma.combatant.update({
    where: { id: pointer.activeCombatantId },
    // A participant who held an Action into somebody else's turn keeps it: the
    // reservation is cleared when it fires, not when their own turn comes back.
    data: {
      turnState: freshTurnState(move, carry),
      nextTurnState: null,
      held: false,
      heldTrigger: null,
      heldInitiative: null,
    },
  });
}

/**
 * The held Action that is due before the turn moves on (stage 14b).
 *
 * „Wstrzymanie Akcji" may name a value in the initiative queue instead of a
 * trigger, and the count descends through that value on its way to the next
 * participant — so the wait ends by itself, without the GM remembering. A hold
 * declared with a *described* trigger is never picked up here: judging whether
 * „gdy ktoś wyjdzie zza rogu" happened is the GM's job, and the tracker offers
 * them a button instead.
 */
export function dueHold(combat: CombatRow, pointer: TurnPointer): CombatantRow | null {
  const waiting = combat.combatants.filter(
    (row) => row.held && row.heldInitiative !== null && row.id !== pointer.activeCombatantId,
  );
  if (waiting.length === 0) return null;
  // Wrapping into the next round is the last chance: an unfired declaration
  // expires with the round, so anything still waiting is due now.
  const wrapping = pointer.round !== combat.round;
  const nextInitiative =
    combat.combatants.find((row) => row.id === pointer.activeCombatantId)?.initiative ?? null;
  const due = waiting.filter(
    (row) => wrapping || nextInitiative === null || row.heldInitiative! > nextInitiative,
  );
  if (due.length === 0) return null;
  return due.reduce((best, row) => (row.heldInitiative! > best.heldInitiative! ? row : best));
}

/**
 * Hands the turn to a participant whose held Action just came up. Their budget
 * is deliberately *not* refreshed — the reserved Action is the one they saved
 * during their own turn, and handing them a fresh turn would be a second one.
 */
export async function fireHeldAction(
  prisma: PrismaClient,
  combat: CombatRow,
  row: CombatantRow,
): Promise<void> {
  await prisma.combatant.update({
    where: { id: row.id },
    data: {
      held: false,
      heldTrigger: null,
      heldInitiative: null,
      // „Przestawia uczestnika na zadeklarowaną wartość kolejki" — from here on
      // they act at the value they waited for, this round and the next.
      ...(row.heldInitiative !== null ? { initiative: row.heldInitiative } : {}),
    },
  });
  await prisma.combat.update({
    where: { id: combat.id },
    data: { activeCombatantId: row.id },
  });
  if (row.heldInitiative !== null) {
    await renumberOrder(prisma, await loadCombatById(prisma, combat.id));
  }
}

export async function emitReloaded(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  combatId: string,
): Promise<CombatView> {
  const row = await loadCombatById(deps.ctx.prisma, combatId);
  const view = toCombatView(row);
  emitCombat(deps, campaignId, scene, view);
  return view;
}

/* ------------------------------------------------------------------ *
 * Turn budget (stage 14b)
 * ------------------------------------------------------------------ */

/** What came of trying to spend part of a turn. */
export type TurnSpendOutcome =
  /** No fight is running here, or this token is not in it — nothing to enforce. */
  | { kind: 'not-in-combat' }
  | {
      kind: 'spent';
      combatant: CombatantRow;
      /** The GM went past the budget; counted, never blocked. */
      forced: boolean;
      /** A one-shot „przepuść" was burned to make this legal. */
      bypassed: boolean;
    }
  | {
      kind: 'refused';
      combatant: CombatantRow;
      error: TurnSpendProblem;
      /**
       * The budget the refusal was measured against — the participant's stored
       * state with the freshest allowance already folded in, so a message can
       * say „zostało ci 4,5 m" and mean it.
       */
      judged: string | null;
      /** Ready sentence, when the refusal came with one (statuses, stage 14d). */
      message?: string;
    };

/** Refusal codes this module can produce — the client maps them to Polish. */
export type TurnSpendProblem = SheetTurnProblem | 'NOT_YOUR_TURN' | 'STATUS_BLOCKED';

/**
 * Books one spend against a participant's turn.
 *
 * Three rules, in this order:
 *
 *  1. **Outside your own turn you do not act.** The exceptions are a declared
 *     „Wstrzymanie Akcji" (the whole point of which is acting later) and a
 *     one-shot pass from the GM.
 *  2. **The system judges the budget.** Whether two attacks fit into one Action
 *     is CP RED's business, not the tracker's.
 *  3. **The GM is never blocked.** Their own NPCs go past the budget with the
 *     overspend counted, so the tracker says so out loud (stage decision).
 */
async function applySpend(
  deps: RealtimeDeps,
  combat: CombatRow,
  combatant: CombatantRow,
  spend: SheetTurnSpend,
  user: SessionUser,
): Promise<TurnSpendOutcome> {
  const isGm = user.role === ROLE_GM;
  const bypassed = combatant.actionBypass;
  if (!isGm && !bypassed) {
    const mine = combat.activeCombatantId === combatant.id;
    // A declared „Wstrzymanie Akcji" excuses acting out of turn — but only for
    // the Action it reserved. Nobody reserves a walk (stage 14c).
    const excused = combatant.held && spendUsesAction(spend);
    if (!mine && !excused) {
      return { kind: 'refused', combatant, error: 'NOT_YOUR_TURN', judged: combatant.turnState };
    }
    // Some states are not an arithmetic problem: an unconscious participant has
    // a full budget and still does nothing with it (stage 14d). Movement asks
    // the same table its own question and answers it in metres, so it is left
    // to `validateTokenMove`.
    if (spend.kind !== 'move') {
      const message = combatant.token
        ? sheetActionBlock(readTokenStatuses(combatant.token.statuses))
        : null;
      if (message) {
        return {
          kind: 'refused',
          combatant,
          error: 'STATUS_BLOCKED',
          judged: combatant.turnState,
          message,
        };
      }
    }
  }

  // Movement is judged against the sheet as it is *now*: armor shed between
  // drags, or a leg broken on somebody else's turn, changes what is left.
  const judged =
    spend.kind === 'move'
      ? applyMoveBudget(combatant.turnState, await moveBudgetForCombatant(deps, combatant))
      : combatant.turnState;

  const result = spendTurnState(judged, spend, isGm || bypassed);
  if (!result.ok) {
    // A wound that took the turn's Action away answers with its own sentence
    // („Uraz kręgosłupa: w tej turze nie wykonujesz Akcji") — stage 14e.
    return {
      kind: 'refused',
      combatant,
      error: result.error,
      judged,
      ...(result.message ? { message: result.message } : {}),
    };
  }

  // Firing a reserved Action ends the reservation — a hold is spent once.
  const releasesHold = combatant.held && spendUsesAction(spend);
  await deps.ctx.prisma.combatant.update({
    where: { id: combatant.id },
    data: {
      turnState: result.state,
      ...(bypassed ? { actionBypass: false } : {}),
      ...(releasesHold ? { held: false, heldTrigger: null, heldInitiative: null } : {}),
    },
  });
  return { kind: 'spent', combatant, forced: result.forced, bypassed };
}

/**
 * How far this participant may go, read from the sheet they are bound to.
 * A statist without one returns `null`: the tracker then counts whole Move
 * Actions as it did in stage 14b rather than inventing a RUCH for them.
 */
export async function moveBudgetForCombatant(
  deps: RealtimeDeps,
  row: CombatantRow,
): Promise<SheetMoveBudget | null> {
  const characterId = row.token?.character?.id;
  if (!characterId) return null;
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: characterId },
    select: { data: true },
  });
  if (!character) return null;
  // Stage 26f: what is stuck to this figure's legs lives on the *token*, not on
  // the sheet — so the budget is asked for both and the note names both.
  const slowed = row.token ? sheetSlowedMoveModifier(row.token) : null;
  return readSheetMoveBudget(character, deps.ctx.cpred, slowed ? [slowed] : []);
}

/** The participant a token is playing in the fight running on its scene. */
export async function findCombatantForToken(
  prisma: PrismaClient,
  sceneId: string,
  tokenId: string,
): Promise<{ combat: CombatRow; combatant: CombatantRow } | null> {
  const combat = await loadCombat(prisma, sceneId);
  // Before round 1 the GM is still setting the fight up: there is no turn to
  // be outside of, so nothing is enforced yet.
  if (!combat || combat.round < 1) return null;
  const combatant = combat.combatants.find((row) => row.tokenId === tokenId);
  return combatant ? { combat, combatant } : null;
}

/**
 * Spends part of the turn of whoever is playing this token. Used by the paths
 * that already existed before the budget did (attacks, reloading): a token that
 * is not in the fight simply passes through untouched.
 */
export async function spendTurnForToken(
  deps: RealtimeDeps,
  scene: Scene,
  tokenId: string,
  spend: SheetTurnSpend,
  user: SessionUser,
): Promise<TurnSpendOutcome> {
  const found = await findCombatantForToken(deps.ctx.prisma, scene.id, tokenId);
  if (!found) return { kind: 'not-in-combat' };
  return applySpend(deps, found.combat, found.combatant, spend, user);
}

/** The same, for a participant the caller already resolved. */
export async function spendTurnForCombatant(
  deps: RealtimeDeps,
  combat: CombatRow,
  combatant: CombatantRow,
  spend: SheetTurnSpend,
  user: SessionUser,
): Promise<TurnSpendOutcome> {
  return applySpend(deps, combat, combatant, spend, user);
}

export const combatStartEvent = defineEvent<CombatStartPayload, CombatView>({
  name: 'combat:start',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const sceneId = payload?.sceneId ?? socket.data.viewedSceneId;
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, sceneId);
    const tokenIds = requireIdList(payload?.tokenIds);
    if (tokenIds.length > MAX_COMBATANTS) throw new RealtimeError('TOO_MANY_COMBATANTS');

    const tokens = await deps.ctx.prisma.token.findMany({
      where: { id: { in: tokenIds }, sceneId: scene.id },
    });
    if (tokens.length !== tokenIds.length) throw new RealtimeError('TOKEN_NOT_FOUND');

    // Starting a fight replaces whatever was running on that scene.
    await deps.ctx.prisma.combat.deleteMany({ where: { sceneId: scene.id } });
    const combat = await deps.ctx.prisma.combat.create({
      data: {
        sceneId: scene.id,
        combatants: {
          create: tokenIds.map((tokenId, index) => ({ tokenId, order: index })),
        },
      },
    });
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

export const combatAddEvent = defineEvent<CombatAddPayload, CombatView>({
  name: 'combat:add',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const tokenIds = requireIdList(payload?.tokenIds);
    const { combat, scene } = await requireCombatOfTokens(deps.ctx.prisma, campaignId, tokenIds);

    const known = new Set(combat.combatants.map((c) => c.tokenId));
    const fresh = tokenIds.filter((id) => !known.has(id));
    if (combat.combatants.length + fresh.length > MAX_COMBATANTS) {
      throw new RealtimeError('TOO_MANY_COMBATANTS');
    }
    // Reinforcements start at the bottom until they roll — their initiative
    // then slots them into the running order (RAW: they act on their own roll).
    let order = combat.combatants.length;
    for (const tokenId of fresh) {
      await deps.ctx.prisma.combatant.create({
        data: { combatId: combat.id, tokenId, order: order++ },
      });
    }
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

export const combatRollAllEvent = defineEvent<CombatRollAllPayload, CombatView>({
  name: 'combat:roll-all',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const sceneId = socket.data.viewedSceneId;
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, sceneId);
    const combat = await loadCombat(deps.ctx.prisma, scene.id);
    if (!combat) throw new RealtimeError('COMBAT_NOT_FOUND');

    const rerollAll = payload?.rerollAll === true;
    // A Black ICE (stage 26c) is never rolled for: its place in the queue comes
    // from the rule („o jeden punkt wyżej", s. 205), not from a die.
    const rollable = combat.combatants.filter(hasFigure);
    const targets = rerollAll ? rollable : rollable.filter((row) => row.initiative === null);
    await rollFor(deps, targets);
    const reloaded = await loadCombatById(deps.ctx.prisma, combat.id);
    await renumberOrder(deps.ctx.prisma, reloaded);
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

export const combatRerollTieEvent = defineEvent<CombatRerollTiePayload, CombatView>({
  name: 'combat:reroll-tie',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const ids = requireIdList(payload?.combatantIds);
    const { combat, scene } = await requireCombatant(deps.ctx.prisma, campaignId, ids[0]);
    const targets = combat.combatants.filter((row) => ids.includes(row.id));
    if (targets.length !== ids.length) throw new RealtimeError('COMBATANT_NOT_FOUND');

    await rollFor(deps, targets);
    const reloaded = await loadCombatById(deps.ctx.prisma, combat.id);
    await renumberOrder(deps.ctx.prisma, reloaded);
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

/**
 * One participant rolls their own initiative — the path behind the dice cup,
 * so a player's initiative keeps the physical gesture and lands on chat like
 * any other roll (stage 08: rolls that matter always go through the cup).
 */
export const combatRollEvent = defineEvent<CombatRollPayload, { initiative: number }>({
  name: 'combat:roll',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { combat, combatant, scene } = await requireCombatant(
      deps.ctx.prisma,
      campaignId,
      payload?.combatantId,
    );
    // A Black ICE takes its place „o jeden punkt wyżej" (s. 205) rather than
    // rolling for it — there is no REF to add and nothing to reroll.
    if (!hasFigure(combatant)) throw new RealtimeError('COMBATANT_HAS_NO_FIGURE');
    if (user.role !== ROLE_GM) {
      // A hidden participant must not even be confirmable by a player.
      if (combatant.token.hidden) throw new RealtimeError('COMBATANT_NOT_FOUND');
      if (combatantOwnerId(combatant) !== user.id) throw new RealtimeError('FORBIDDEN');
    }

    const sheets = await loadCombatSheets(deps.ctx.prisma, [combatant]);
    const inputs = initiativeInputsOf(combatant, deps.ctx.cpred, sheets);
    const gesture = sanitizeGesture(payload?.gesture);
    const { result } = rollInitiative(inputs.modifier, gesture?.entropy);

    const breakdown: RollBreakdownEntry[] = [];
    if (inputs.label !== null) {
      breakdown.push({ label: inputs.label, value: inputs.modifier, kind: 'stat' });
    }
    result.title = 'Inicjatywa';
    result.actor = combatantTableName(combatant);
    if (breakdown.length > 0) result.breakdown = breakdown;
    if (gesture && gesture.strength > 0) result.tossStrength = gesture.strength;
    if (gesture?.toss) result.toss = gesture.toss;

    await deps.ctx.prisma.combatant.update({
      where: { id: combatant.id },
      data: { initiative: result.total, tieBreak: inputs.tieBreak },
    });

    const stored = await deps.ctx.prisma.chatMessage.create({
      data: {
        campaignId,
        authorId: user.id,
        kind: 'roll',
        text: 'Inicjatywa',
        payload: JSON.stringify(result),
        sceneId: scene.id,
      },
      include: INCLUDE_CHAT_NAMES,
    });
    const view: ChatMessageView = toChatMessageView(stored);
    await deliverRollMessage(deps, campaignId, user.id, view);

    const reloaded = await loadCombatById(deps.ctx.prisma, combat.id);
    await renumberOrder(deps.ctx.prisma, reloaded);
    await emitReloaded(deps, campaignId, scene, combat.id);
    return { initiative: result.total };
  },
});

export const combatSetInitiativeEvent = defineEvent<CombatInitiativePayload, CombatView>({
  name: 'combat:set-initiative',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { combat, combatant, scene } = await requireCombatant(
      deps.ctx.prisma,
      campaignId,
      payload?.combatantId,
    );
    const value = payload?.initiative;
    if (value !== null) {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new RealtimeError('BAD_REQUEST');
      }
      if (value < COMBAT_INITIATIVE_MIN || value > COMBAT_INITIATIVE_MAX) {
        throw new RealtimeError('BAD_REQUEST');
      }
    }
    await deps.ctx.prisma.combatant.update({
      where: { id: combatant.id },
      data: { initiative: value },
    });
    // A typed-in value slots the participant into the order the same way a
    // rolled one does (REF resolving equal totals).
    await renumberOrder(deps.ctx.prisma, await loadCombatById(deps.ctx.prisma, combat.id));
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

export const combatOrderEvent = defineEvent<CombatOrderPayload, CombatView>({
  name: 'combat:order',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const ids = requireIdList(payload?.combatantIds);
    const { combat, scene } = await requireCombatant(deps.ctx.prisma, campaignId, ids[0]);
    // The drag must arrive as a permutation of exactly this fight's roster.
    const known = new Set(combat.combatants.map((c) => c.id));
    if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
      throw new RealtimeError('BAD_REQUEST');
    }
    await Promise.all(
      ids.map((id, index) =>
        deps.ctx.prisma.combatant.update({ where: { id }, data: { order: index } }),
      ),
    );
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

/**
 * `combat:next`, `combat:previous`, `combat:remove` and `combat:end` all live
 * in `combat-actions.ts`, not here.
 *
 * Every one of them now has consequences on the *map* — a Hold that ends has to
 * take the „Pochwycony" sticker off the token (stage 14d), and a turn that ends
 * burns whoever is on fire (stage 14e) — and the token layer already imports
 * this module, so the tracker cannot import it back. What stays here is the
 * pointer arithmetic itself (`applyTurnPointer`, `dueHold`, `fireHeldAction`),
 * which the events above call.
 */
