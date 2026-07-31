/**
 * What CP RED statuses *do* (stages 14d–14e) — pure logic, no IO.
 *
 * Until 14d the answer was scattered: movement had its own table of blocking
 * ids (stage 14c), the action economy had none at all, and „Nieprzytomny nie
 * robi nic" was true only because nobody clicked. One table now answers every
 * question the turn asks — may this token walk, may it act, may it dodge, and
 * what does simply *being* in this state cost each round.
 *
 * Stage 14e added the last of those. A status that burns is not a special case
 * with a branch of its own: it is a row with a `dot` field, read by the one
 * hook that runs when a turn changes hands. The Critical Injuries join the same
 * table from the other side — their machine effects ride on the injury row as
 * data (`noActionNextTurn`, `dotAfterRun`…), so a GM who types a row of their
 * own into the compendium gets it enforced exactly like a printed one.
 *
 * The ids come from `data/public/cpred/statuses.json`; what they *mean* is
 * CP RED and therefore lives here. The refusals are finished Polish sentences
 * on purpose: „grappled" tells the player nothing, and the person being refused
 * is the one who has to understand why.
 */

import type { CpredCriticalInjuryRow } from './character.js';
import { CPRED_CRITICAL_INJURY_BONUS_DAMAGE } from './damage.js';

/** When in a turn periodic damage lands. */
export type CpredDotPhase = 'turn-start' | 'turn-end';

/** Where the number comes from: a value the GM sets, or the victim's BODY. */
export type CpredDotSource = 'fixed' | 'body';

/** Periodic damage one status deals — straight to Hit Points, never through armor. */
export interface CpredStatusDot {
  phase: CpredDotPhase;
  source: CpredDotSource;
  /**
   * Damage when nobody said otherwise. Meaningless for `source: 'body'`, which
   * reads the sheet instead.
   */
  defaultDamage: number;
  /** What the chat card calls it. */
  label: string;
}

/** Machine-readable effects of one status. An absent field means „no effect". */
export interface CpredStatusEffect {
  /** Polish name, as `statuses.json` prints it. */
  name: string;
  /** Refusal shown when this status stops a Move Action. */
  noMove?: string;
  /** Refusal shown when this status stops every Action. */
  noAction?: string;
  /** Refusal shown when this status stops an Evasion roll (stage 16's „Unik"). */
  noDodge?: string;
  /** Damage this status deals every turn of its carrier (stage 14e). */
  dot?: CpredStatusDot;
  /**
   * Shown at the start of the carrier's turn. A nudge, not a rule — the one
   * thing „Przygwożdżony" can honestly be while the map has no cover model.
   */
  reminder?: string;
  /** The status comes off by itself at the end of its carrier's own turn. */
  expiresAtTurnEnd?: boolean;
}

/**
 * The table. Order is deliberate: the worst state comes first, so a token that
 * is both Dead and Prone is refused for being dead.
 */
export const CPRED_STATUS_EFFECTS: Readonly<Record<string, CpredStatusEffect>> = {
  dead: {
    name: 'Martwy',
    noMove: 'Martwy token nie może się poruszać.',
    noAction: 'Martwy token nie wykonuje Akcji.',
    noDodge: 'Martwy token nie unika.',
  },
  unconscious: {
    name: 'Nieprzytomny',
    noMove: 'Nieprzytomny token nie może się poruszać.',
    noAction: 'Nieprzytomny token nie wykonuje Akcji.',
    noDodge: 'Nieprzytomny token nie unika.',
  },
  prone: {
    name: 'Powalony',
    noMove: 'Powalony token musi najpierw wstać (Akcja „Wstanie").',
  },
  immobilized: {
    name: 'Unieruchomiony',
    noMove: 'Unieruchomiony token nie może wykonać Akcji Ruchu.',
  },
  grappled: {
    name: 'Pochwycony',
    noMove: 'Pochwycony token nie może wykonać własnej Akcji Ruchu.',
  },
  'on-fire': {
    name: 'Podpalony',
    // „Płomienie zadają obrażenia na koniec każdej Tury i ignorują pancerz."
    dot: {
      phase: 'turn-end',
      source: 'fixed',
      defaultDamage: 4,
      label: 'Podpalony',
    },
    reminder: 'Palisz się — Akcja „Ugaszenie" gasi płomienie.',
  },
  drowning: {
    name: 'Tonięcie',
    // Suffocating costs BODY at the *start* of the turn: the round that begins
    // under water is already paid for, whatever the victim does with it.
    dot: {
      phase: 'turn-start',
      source: 'body',
      defaultDamage: 0,
      label: 'Tonięcie',
    },
  },
  poisoned: {
    name: 'Zatruty',
    dot: {
      phase: 'turn-end',
      source: 'fixed',
      defaultDamage: 2,
      label: 'Zatruty',
    },
  },
  suppressed: {
    name: 'Przygwożdżony',
    reminder: 'Ostrzał przygwoździł cię do ziemi — rusz się do osłony.',
    expiresAtTurnEnd: true,
  },
};

/** Ids of the statuses in the table, in the order refusals are checked. */
const STATUS_ORDER = Object.keys(CPRED_STATUS_EFFECTS);

function firstBlock(
  statuses: readonly string[],
  field: 'noMove' | 'noAction' | 'noDodge',
): string | null {
  for (const id of STATUS_ORDER) {
    if (!statuses.includes(id)) continue;
    const message = CPRED_STATUS_EFFECTS[id]![field];
    if (message) return message;
  }
  return null;
}

/** The first status refusing this token its move, or null when free to go. */
export function cpredMovementBlock(statuses: readonly string[]): string | null {
  return firstBlock(statuses, 'noMove');
}

/**
 * The first status refusing this token an Action, or null. Deliberately coarser
 * than movement: a Grappled character may still act (at −2), which is exactly
 * why Duszenie is worth an Action to the one doing the holding.
 */
export function cpredActionBlock(statuses: readonly string[]): string | null {
  return firstBlock(statuses, 'noAction');
}

/** The first status refusing this token a dodge, or null. */
export function cpredDodgeBlock(statuses: readonly string[]): string | null {
  return firstBlock(statuses, 'noDodge');
}

/** Status the „Wstanie" Action takes off the token that spent it. */
export const CPRED_PRONE_STATUS_ID = 'prone';

/** Status a Held participant carries while the relation lasts (stage 14d). */
export const CPRED_GRAPPLED_STATUS_ID = 'grappled';

/** Status a choked-out participant gets — and a thrown one never does. */
export const CPRED_UNCONSCIOUS_STATUS_ID = 'unconscious';

/** Burning — the status the „Ugaszenie" Action exists to remove (stage 14e). */
export const CPRED_ON_FIRE_STATUS_ID = 'on-fire';

/** Pinned by suppressive fire (stage 16's forced WILL check, lost). */
export const CPRED_SUPPRESSED_STATUS_ID = 'suppressed';

/** Drowning or suffocating — BODY damage at the start of every turn. */
export const CPRED_DROWNING_STATUS_ID = 'drowning';

/** Generic poison: the same machinery as fire, with a value the GM picks. */
export const CPRED_POISONED_STATUS_ID = 'poisoned';

/**
 * How fiercely something burns. RAW scales the damage with the fire rather than
 * with the victim, so the GM picks a rung when they set the status — a splash
 * of burning fuel and a lit cigarette are not the same wound.
 */
export const CPRED_FIRE_INTENSITIES: readonly { damage: number; label: string }[] = [
  { damage: 2, label: 'Małe' },
  { damage: 4, label: 'Średnie' },
  { damage: 6, label: 'Duże' },
];

/** Statuses whose damage the GM may dial; everything else is fixed by the rules. */
export function cpredStatusHasDialableDamage(statusId: string): boolean {
  return CPRED_STATUS_EFFECTS[statusId]?.dot?.source === 'fixed';
}

/** One line of periodic damage owed by a token right now. */
export interface CpredPeriodicDamage {
  statusId: string;
  label: string;
  damage: number;
}

/**
 * Periodic damage due in this phase of the turn.
 *
 * `values` is the per-token dial (fire intensity, poison strength) — absent
 * entries fall back to the table's default, so a status the GM dropped on a
 * token without thinking about numbers still does something.
 */
export function cpredPeriodicDamage(
  statuses: readonly string[],
  phase: CpredDotPhase,
  input: { values?: Readonly<Record<string, number>>; body?: number } = {},
): CpredPeriodicDamage[] {
  const due: CpredPeriodicDamage[] = [];
  for (const id of STATUS_ORDER) {
    if (!statuses.includes(id)) continue;
    const dot = CPRED_STATUS_EFFECTS[id]!.dot;
    if (!dot || dot.phase !== phase) continue;
    const dialed = input.values?.[id];
    const damage =
      dot.source === 'body'
        ? Math.max(0, Math.round(input.body ?? 0))
        : Math.max(0, Math.round(typeof dialed === 'number' ? dialed : dot.defaultDamage));
    if (damage <= 0) continue;
    due.push({ statusId: id, label: dot.label, damage });
  }
  return due;
}

/** Statuses that come off by themselves when their carrier's turn ends. */
export function cpredExpiringStatuses(statuses: readonly string[]): string[] {
  return statuses.filter((id) => CPRED_STATUS_EFFECTS[id]?.expiresAtTurnEnd === true);
}

/** Nudges to show the participant whose turn just began; never a refusal. */
export function cpredTurnReminders(statuses: readonly string[]): string[] {
  const notes: string[] = [];
  for (const id of STATUS_ORDER) {
    if (!statuses.includes(id)) continue;
    const reminder = CPRED_STATUS_EFFECTS[id]!.reminder;
    if (reminder) notes.push(reminder);
  }
  return notes;
}

/* ------------------------------------------------------------------ *
 * Critical Injuries, from the other side of the same table (stage 14e)
 * ------------------------------------------------------------------ */

/**
 * „Na koniec każdej Tury, w której przemieściłeś się ponad 4 m na piechotę…" —
 * the threshold three printed injuries share, and the one a GM's own row gets
 * for free by ticking the same flag.
 */
export const CPRED_INJURY_RUN_THRESHOLD_M = 4;

/** True when this turn's walking was far enough to wake the running injuries. */
export function cpredRanFarEnough(metresWalked: number): boolean {
  return Number.isFinite(metresWalked) && metresWalked > CPRED_INJURY_RUN_THRESHOLD_M;
}

/** What a Critical Injury imposes on a turn that has not started yet. */
export interface CpredTurnCarry {
  /** Ready sentence refusing the Action, or null. */
  noAction?: string;
  /** Ready sentence refusing the Move Action, or null. */
  noMove?: string;
}

/**
 * The carry an injury creates the moment it is drawn. Only the spine does this:
 * „W swojej kolejnej Turze nie możesz wykonać Akcji, ale możesz wykonać Akcję
 * Ruchu" is a debt against the *next* turn, incurred when the wound lands —
 * which may well be somebody else's turn.
 */
export function cpredInjuryCarryOnDraw(injury: {
  name: string;
  noActionNextTurn?: boolean;
}): CpredTurnCarry | null {
  if (injury.noActionNextTurn !== true) return null;
  return { noAction: `${injury.name}: w tej turze nie wykonujesz Akcji (Akcja Ruchu zostaje).` };
}

/** What the injuries owe when a turn ends — the carry, and the damage. */
export interface CpredInjuryTurnEnd {
  carry: CpredTurnCarry;
  damage: CpredPeriodicDamage[];
}

/**
 * End of a turn, read off the injuries the character carries.
 *
 * Both effects hang on the same sentence — „ponad 4 m na piechotę" — so both
 * are decided from one number: the metres of path actually walked, before the
 * hard-going multiplier doubles the *budget* (stage 14c). Rubble makes a walk
 * expensive, not longer, and a rib does not know what the ground was like.
 */
export function cpredInjuryTurnEnd(
  injuries: readonly CpredCriticalInjuryRow[],
  metresWalked: number,
): CpredInjuryTurnEnd {
  const carry: CpredTurnCarry = {};
  const damage: CpredPeriodicDamage[] = [];
  if (!cpredRanFarEnough(metresWalked)) return { carry, damage };

  for (const injury of injuries) {
    if (injury.noMoveAfterRun === true && carry.noMove === undefined) {
      carry.noMove = `${injury.name}: po marszu ponad ${CPRED_INJURY_RUN_THRESHOLD_M} m w tej turze nie wykonujesz Akcji Ruchu.`;
    }
    if (injury.dotAfterRun === true) {
      damage.push({
        statusId: injury.id,
        label: injury.name,
        damage: CPRED_CRITICAL_INJURY_BONUS_DAMAGE,
      });
    }
  }
  return { carry, damage };
}

/** The first injury refusing this character a dodge („Odcięta noga"), or null. */
export function cpredInjuryDodgeBlock(injuries: readonly CpredCriticalInjuryRow[]): string | null {
  const found = injuries.find((injury) => injury.noDodge === true);
  return found ? `${found.name}: nie możesz unikać ataków.` : null;
}

/**
 * Flat penalties the injuries add to every Check made from the sheet — the
 * same named-entry treatment „Trzymanie −2" gets in stage 14d, so a player can
 * always see where a missing point went.
 */
export function cpredInjuryModifiers(
  injuries: readonly CpredCriticalInjuryRow[],
): { label: string; value: number }[] {
  return injuries
    .filter((injury) => typeof injury.actionPenalty === 'number' && injury.actionPenalty !== 0)
    .map((injury) => ({ label: injury.name, value: injury.actionPenalty! }));
}
