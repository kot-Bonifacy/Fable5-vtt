/**
 * Combat tracker — core VTT state (stage 14).
 *
 * Deliberately system-agnostic: the tracker knows participants, their
 * initiative values and whose turn it is. What "initiative" means (CP RED:
 * `1d10 + REF`, ties broken by REF and finally by a re-roll) is supplied by
 * the game system through the server's sheet adapter, so a future RPG system
 * only replaces the formula, never this file.
 */

/** Hard cap on participants — one fight at one table, not a battle simulator. */
export const MAX_COMBATANTS = 40;

/** Bounds for a manually typed initiative value. */
export const COMBAT_INITIATIVE_MIN = -20;
export const COMBAT_INITIATIVE_MAX = 99;

/** One participant of a combat, as delivered to a client. */
export interface CombatantView {
  id: string;
  tokenId: string;
  /**
   * Name and portrait are denormalized from the token so a tracker row still
   * renders while the token layer is catching up (scene switch, resync).
   */
  name: string;
  imageUrl: string | null;
  /** Rolled initiative; null = not rolled yet (sorts last). */
  initiative: number | null;
  /** Secondary sort supplied by the system (CP RED: REF); null = unknown. */
  tieBreak: number | null;
  /** Manual position inside a tie group — set by the GM's drag. */
  order: number;
  /** Player controlling the participant (token owner or sheet owner). */
  ownerId: string | null;
  /** GM-only: this participant is hidden from players. Never sent to them. */
  hidden?: boolean;
}

/** A combat as one viewer sees it (players never receive hidden participants). */
export interface CombatView {
  id: string;
  sceneId: string;
  /** 0 = participants gathered, round 1 has not started yet. */
  round: number;
  /** Whose turn it is; null before the start or when hidden from this viewer. */
  activeCombatantId: string | null;
  /** Already sorted by `compareCombatants`. */
  combatants: CombatantView[];
}

/** Where the turn pointer lands after a step. */
export interface TurnPointer {
  round: number;
  activeCombatantId: string | null;
}

function initiativeRank(value: number | null): number {
  return value === null ? Number.NEGATIVE_INFINITY : value;
}

/**
 * Display order: highest initiative first, everything else decided by the
 * manual position. Unrolled participants sit at the bottom.
 *
 * The system's tie-breaker is deliberately absent here — it is applied once,
 * when positions are (re)assigned after a roll (`resolveInitiativeOrder`), so
 * that the GM's drag afterwards has the final say inside a tie. Initiative
 * itself always wins: someone who rolled higher can never be dragged below
 * someone who rolled lower, only given a different number.
 */
export function compareCombatants(a: CombatantView, b: CombatantView): number {
  const byInitiative = initiativeRank(b.initiative) - initiativeRank(a.initiative);
  if (byInitiative !== 0) return byInitiative;
  return a.order - b.order;
}

export function sortCombatants(combatants: CombatantView[]): CombatantView[] {
  return [...combatants].sort(compareCombatants);
}

/**
 * The order positions are renumbered to after initiative changes: initiative,
 * then the system's tie-breaker (CP RED: REF), then the previous manual
 * position — so a drag between two genuinely tied participants survives every
 * later renumbering.
 */
export function resolveInitiativeOrder(combatants: CombatantView[]): CombatantView[] {
  return [...combatants].sort((a, b) => {
    const byInitiative = initiativeRank(b.initiative) - initiativeRank(a.initiative);
    if (byInitiative !== 0) return byInitiative;
    const byTieBreak = initiativeRank(b.tieBreak) - initiativeRank(a.tieBreak);
    if (byTieBreak !== 0) return byTieBreak;
    return a.order - b.order;
  });
}

/**
 * Participants sharing both initiative and tie-breaker — a genuine tie that
 * RAW resolves with a re-roll (Easy Mode: „Remisy należy rozstrzygnąć
 * ponownym rzutem"). Groups of one are not returned.
 */
export function findInitiativeTies(combatants: CombatantView[]): CombatantView[][] {
  const groups = new Map<string, CombatantView[]>();
  for (const combatant of combatants) {
    if (combatant.initiative === null) continue;
    const key = `${combatant.initiative}:${combatant.tieBreak ?? 'x'}`;
    const group = groups.get(key);
    if (group) group.push(combatant);
    else groups.set(key, [combatant]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export function activeCombatant(combat: CombatView): CombatantView | null {
  if (!combat.activeCombatantId) return null;
  return combat.combatants.find((c) => c.id === combat.activeCombatantId) ?? null;
}

/**
 * Advances the turn. The first step starts round 1 on the highest initiative;
 * stepping past the last participant opens the next round from the top. An
 * active participant that vanished (killed, removed) restarts the round order
 * rather than stalling the tracker.
 */
export function nextTurn(combat: CombatView): TurnPointer {
  const ordered = sortCombatants(combat.combatants);
  const first = ordered[0];
  if (!first) return { round: combat.round, activeCombatantId: null };
  if (combat.round === 0 || combat.activeCombatantId === null) {
    return { round: Math.max(1, combat.round), activeCombatantId: first.id };
  }
  const index = ordered.findIndex((c) => c.id === combat.activeCombatantId);
  if (index === -1) return { round: combat.round, activeCombatantId: first.id };
  const next = ordered[index + 1];
  if (next) return { round: combat.round, activeCombatantId: next.id };
  return { round: combat.round + 1, activeCombatantId: first.id };
}

/** Steps back one turn; never before round 1's first participant. */
export function previousTurn(combat: CombatView): TurnPointer {
  const ordered = sortCombatants(combat.combatants);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (!first || !last) return { round: combat.round, activeCombatantId: null };
  if (combat.round === 0) return { round: combat.round, activeCombatantId: null };
  const index = ordered.findIndex((c) => c.id === combat.activeCombatantId);
  if (index === -1) return { round: combat.round, activeCombatantId: last.id };
  const previous = ordered[index - 1];
  if (previous) return { round: combat.round, activeCombatantId: previous.id };
  if (combat.round > 1) return { round: combat.round - 1, activeCombatantId: last.id };
  return { round: 1, activeCombatantId: first.id };
}

/**
 * The player-facing view: hidden participants are removed entirely — their
 * existence must not leak, so the payload simply has fewer rows (the same rule
 * as hidden tokens in stage 05). When the hidden participant is the one acting,
 * players see the round without an active row rather than a placeholder that
 * would betray that someone is there.
 */
export function filterCombatForPlayer(combat: CombatView): CombatView {
  const combatants = combat.combatants
    .filter((combatant) => combatant.hidden !== true)
    .map(({ hidden: _hidden, ...rest }) => rest);
  const activeVisible = combatants.some((c) => c.id === combat.activeCombatantId);
  return {
    id: combat.id,
    sceneId: combat.sceneId,
    round: combat.round,
    activeCombatantId: activeVisible ? combat.activeCombatantId : null,
    combatants,
  };
}

/** Server → client state of one scene's combat (`null` = no fight running). */
export interface CombatUpdateBroadcast {
  /** Present only on campaign-wide broadcasts (active scene, public view). */
  seq?: number;
  sceneId: string;
  combat: CombatView | null;
}

/** GM starts a fight with the selected tokens of a scene. */
export interface CombatStartPayload {
  /** Defaults to the socket's viewed scene. */
  sceneId?: string;
  tokenIds: string[];
}

/** GM adds reinforcements to a running fight. */
export interface CombatAddPayload {
  tokenIds: string[];
}

export interface CombatantIdPayload {
  combatantId: string;
}

/** GM types an initiative value by hand (statists without a sheet). */
export interface CombatInitiativePayload {
  combatantId: string;
  /** null clears the value — the participant drops to the bottom. */
  initiative: number | null;
}

/** GM rolls for everyone; `rerollAll` also re-rolls values already there. */
export interface CombatRollAllPayload {
  rerollAll?: boolean;
}

/** GM re-rolls one tie group (RAW resolution of a tie). */
export interface CombatRerollTiePayload {
  combatantIds: string[];
}

/** GM drags the tracker into a new order (ids in the intended order). */
export interface CombatOrderPayload {
  combatantIds: string[];
}
