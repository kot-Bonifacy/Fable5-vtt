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

/**
 * One consumable of a turn, as the tracker paints it (stage 14b).
 *
 * The core knows only „this participant has `used` of `max` of something the
 * system calls `label`". What the something *is* — a Move Action, an Attack
 * Action, the two attacks an LA 2 weapon fits into one — is entirely the game
 * system's business, exactly like `tieBreak` above is REF only in CP RED.
 */
export interface TurnResourceView {
  id: string;
  label: string;
  used: number;
  max: number;
  /**
   * Why this resource cannot be used at all, in the system's own words („Uraz
   * kręgosłupa: w kolejnej Turze nie możesz wykonać Akcji").
   *
   * Absent when nothing is blocking it — and a resource merely *spent* is not
   * blocked. The difference is the whole point: both paint the pip as used, but
   * only one of them can tell the button underneath why it refuses.
   */
  blocked?: string;
}

/**
 * A continuous consumable of a turn — pips cannot express „7,5 z 12 m"
 * (stage 14c). Still system-agnostic: the core paints a number, a maximum and
 * whatever unit the system names, and knows nothing about metres or RUCH.
 */
export interface TurnDistanceView {
  label: string;
  used: number;
  max: number;
  /** Unit suffix as the system writes it („m"). */
  unit: string;
  /** The mover declared hard going — the system charges double per unit. */
  hard?: boolean;
  /** Why the maximum is what it is („Pancerz −2 · Złamana noga −4"). */
  note?: string;
}

/** A participant's turn budget, filled in by the active game system. */
export interface TurnBudgetView {
  resources: TurnResourceView[];
  /** Distance left this turn; absent when the system does not measure one. */
  distance?: TurnDistanceView;
  /** What the Action went to, e.g. „Atak: Ciężki pistolet + Maczeta". */
  note?: string;
  /**
   * How far past the budget this participant has gone. Only the GM's own NPCs
   * can get here — a player's action is refused instead of counted.
   */
  overspent?: number;
  /** A one-shot pass from the GM is waiting to be used („przepuść"). */
  bypass?: boolean;
}

/**
 * „Wstrzymanie Akcji" — the Action is reserved rather than spent, so the
 * participant may still act after their turn ends (s. 168). The declaration is
 * core tracker data: it is a statement about the initiative queue, and firing
 * it moves the participant inside that queue.
 */
export interface HeldActionView {
  /** What will make the held Action happen; null when a queue value was named. */
  trigger: string | null;
  /** Initiative value the participant will drop to; null when a trigger was described. */
  initiative: number | null;
}

/**
 * A grapple this participant is part of (stage 14d).
 *
 * Core tracker data for the same reason the initiative queue is: it is a
 * statement about *participants*, and it ends when the fight does. What being
 * held costs — the −2, the lost Move Action, the two-handed weapons — is the
 * game system's business and never reaches this file.
 *
 * The other side is named, so a hidden participant's row must be scrubbed
 * before a player sees it (`filterCombatForPlayer`): the name would betray
 * somebody the player cannot see.
 */
export interface GrappleView {
  /** `attacker` holds; `defender` is being held. */
  role: 'attacker' | 'defender';
  /** The participant on the other end. */
  otherId: string;
  otherName: string;
  /** The Attacker is using the Held one as cover (stage 14d). */
  shield?: boolean;
  /** Rounds of choking in a row — the tracker warns before the third. */
  chokeStreak?: number;
}

/** One participant of a combat, as delivered to a client. */
export interface CombatantView {
  id: string;
  /**
   * Figure this row stands for; null for a participant with no body in the
   * Soma — so far only a Black ICE fighting in the Net (stage 26c), which takes
   * its place in the queue („o jeden punkt wyżej", s. 205) without standing
   * anywhere on the map. Anything that needs a figure skips such a row.
   */
  tokenId: string | null;
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
  /**
   * What is left of this participant's turn (stage 14b); absent before the
   * fight starts. Safe to send to everyone who can see the row at all —
   * a hidden participant is dropped whole, budget included.
   */
  turn?: TurnBudgetView;
  /** Declared „Wstrzymanie Akcji", until it fires or the round ends. */
  held?: HeldActionView;
  /** The Hold this participant is in, if any (stage 14d). */
  grapple?: GrappleView;
  /**
   * Ready sentences their *next* turn will start already missing (stage 14e) —
   * „Uraz kręgosłupa: w tej turze nie wykonujesz Akcji". Shown before the turn
   * begins on purpose: a GM planning the round needs to know the NPC they were
   * counting on is about to lose their Action.
   */
  owes?: string[];
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
  const visibleIds = new Set(
    combat.combatants.filter((c) => c.hidden !== true).map((combatant) => combatant.id),
  );
  const combatants = combat.combatants
    .filter((combatant) => combatant.hidden !== true)
    .map(({ hidden: _hidden, ...rest }) => {
      // A Hold naming somebody the player cannot see would announce them by
      // name. The row keeps its budget and loses only the relation.
      if (rest.grapple && !visibleIds.has(rest.grapple.otherId)) {
        const { grapple: _grapple, ...withoutGrapple } = rest;
        return withoutGrapple;
      }
      return rest;
    });
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

/**
 * A participant spends part of their turn on a catalogued action (stage 14b).
 *
 * The action id belongs to the game system's catalogue — the core only carries
 * it. `combatantId` is optional for a player: the server resolves it to the
 * participant they control, so nobody can spend somebody else's budget.
 */
export interface CombatActionPayload {
  combatantId?: string;
  actionId: string;
  /** Free-text detail shown on the chat line („wyważam drzwi"). */
  note?: string;
}

/** GM lets one refused action through — a single-use pass („przepuść"). */
export interface CombatAllowPayload {
  combatantId: string;
  /** Chat card the refusal landed on, so it can be marked as passed. */
  messageId?: number;
}

/**
 * Declaring „Wstrzymanie Akcji": either a described trigger or a value in the
 * initiative queue (RAW allows both), plus the intended target of the action.
 */
export interface CombatHoldPayload {
  combatantId?: string;
  trigger?: string;
  initiative?: number | null;
}

/** The held Action fires: the participant drops to the declared queue value. */
export interface CombatHoldReleasePayload {
  combatantId: string;
}

/** GM hands a participant their whole turn back (the escape hatch). */
export interface CombatResetTurnPayload {
  combatantId: string;
}

/**
 * The mover declares that this turn's going is hard — swimming, climbing,
 * rubble (stage 14c). The player says it, the GM sees it, and the system
 * decides what it costs.
 */
export interface CombatTerrainPayload {
  combatantId?: string;
  hard: boolean;
}

/**
 * The GM sets — or lifts — a status that costs its carrier something every turn
 * (stage 14e): fire, poison, drowning.
 *
 * One event for both halves because at the table it is one decision: „pali się,
 * i to mocno". The intensity travels as a plain number and the server decides
 * whether that status accepts one at all (drowning reads BODY, and no dial can
 * overwrite it).
 */
export interface TokenEffectPayload {
  tokenId: string;
  /** Status id from the registry (`on-fire`, `poisoned`, `drowning`). */
  statusId: string;
  /** false takes the status off and forgets its number. */
  active: boolean;
  /** Damage per turn, for the statuses that accept a dial; null = the default. */
  damage?: number | null;
}

/**
 * The GM ends a timed effect by hand (stage 16h) — „Minęła minuta".
 *
 * Both lists in one call because one round put them there in one sentence:
 * a flashbang leaves two Critical Injuries, a sleep round two statuses, and
 * clearing them one at a time would leave a figure half-blind for a click.
 *
 * Not the same event as `token:effect`: that one is the GM *deciding* a status,
 * this one is a duration running out. They differ in what may be refused —
 * only a wound that carries a timer may be healed this way.
 */
export interface EffectExpirePayload {
  tokenId: string;
  /** Timed statuses to lift („Powalony", „Nieprzytomny"). */
  statusIds?: string[];
  /** Timed Critical Injuries to heal, by compendium id. */
  injuryIds?: string[];
  /** The damage card the button was pressed on, so it stops offering it. */
  messageId?: number;
}

/**
 * Pochwycenie, or wrestling free of one (stage 14d). Both are the same opposed
 * test from the tracker's point of view: somebody spends an Action, rolls, and
 * the Hold either starts or ends.
 *
 * No distance travels here, for the same reason attacks send none (stage 16):
 * the server measures it. Neither does a DV — it is read off the defender's
 * sheet.
 */
export interface CombatGrapplePayload<TGesture = unknown> {
  /** Sheet doing the grabbing; defaults to the caller's own. */
  characterId?: string;
  /** Token doing the grabbing, when the sheet has several on the scene. */
  attackerTokenId?: string;
  /** Who is being grabbed — or, for an escape, who is being wrestled free of. */
  targetTokenId: string;
  /**
   * `hold` (default) starts a Hold; `item` takes something out of the target's
   * hands (descriptive this stage); `escape` breaks a Hold the target is the
   * Attacker of — RAW lets a third party try, not only the one being held.
   */
  intent?: 'hold' | 'item' | 'escape';
  modifier?: number;
  luckSpent?: number;
  gesture?: TGesture;
}

/** The defender answers a Pochwycenie with a roll of their own („Broń się"). */
export interface CombatGrappleResistPayload<TGesture = unknown> {
  /** Chat card of the attempt being contested. */
  messageId: number;
  characterId?: string;
  gesture?: TGesture;
}

/**
 * Konfrontacja (stage 23c) — „pojedynek spojrzeń i siły woli".
 *
 * Shaped like `CombatGrapplePayload` and deliberately not folded into it: this
 * one costs no Action, needs no combat to be running and measures no distance,
 * because RAW puts it *before* the fight („dwóch ulicznych zabijaków staje
 * naprzeciw siebie przed walką").
 */
export interface CombatFacedownPayload<TGesture = unknown> {
  /** Sheet staring them down; defaults to the caller's own. */
  characterId?: string;
  /** Token doing the staring, when the sheet has several on the scene. */
  challengerTokenId?: string;
  /** Who is being stared down. */
  targetTokenId: string;
  modifier?: number;
  luckSpent?: number;
  gesture?: TGesture;
}

/** The other side answers a Konfrontacja with a roll of their own („Postaw się"). */
export interface CombatFacedownResistPayload<TGesture = unknown> {
  /** Chat card of the Konfrontacja being contested. */
  messageId: number;
  characterId?: string;
  gesture?: TGesture;
}

/**
 * What the loser of a Konfrontacja does about it (s. 194). RAW gives them the
 * choice — „Wycofać się… albo Nie wycofywać się, ale otrzymać modyfikator −2" —
 * so the VTT applies neither until somebody says which.
 */
export interface CombatFacedownConcedePayload {
  /** Chat card of the Konfrontacja being settled. */
  messageId: number;
  choice: 'withdraw' | 'stand';
}

/**
 * „Czy go znam?" (s. 193) — 1k10 against the other person's Reputation, rolled
 * on meeting them. No gesture: it is a flat die with nothing to weigh up, and
 * the answer is information, not a Check.
 */
export interface ReputationRecognisePayload {
  /** Who is doing the recognising; defaults to the caller's own sheet. */
  characterId?: string;
  /** Whom they are looking at. */
  targetTokenId: string;
}

/** Something only the Attacker of a Hold can do — no roll, just an Action. */
export interface CombatGrappleActionPayload {
  /** Participant acting; defaults to the one the caller controls. */
  combatantId?: string;
  kind: 'choke' | 'throw' | 'human-shield' | 'release';
}

/** Longest trigger description the tracker will store. */
export const COMBAT_HOLD_TRIGGER_MAX_LENGTH = 120;

/** Longest note a chat line about an action may carry. */
export const COMBAT_ACTION_NOTE_MAX_LENGTH = 120;
