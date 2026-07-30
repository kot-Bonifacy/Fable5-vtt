/**
 * What CP RED statuses *do* (stage 14d) — pure logic, no IO.
 *
 * Until this stage the answer was scattered: movement had its own table of
 * blocking ids (stage 14c), the action economy had none at all, and „Nieprzytomny
 * nie robi nic" was true only because nobody clicked. One table now answers
 * three questions — may this token walk, may it act, may it dodge — and both
 * validators read it instead of growing their own lists.
 *
 * The ids come from `data/public/cpred/statuses.json`; what they *mean* is
 * CP RED and therefore lives here. The refusals are finished Polish sentences
 * on purpose: „grappled" tells the player nothing, and the person being refused
 * is the one who has to understand why.
 */

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
}

/**
 * The table. Order is deliberate: the worst state comes first, so a token that
 * is both Dead and Prone is refused for being dead.
 *
 * Stage 14e extends this with the timed effects (burning, drowning) and with
 * the Critical Injuries that take a turn's Action away; the shape is already
 * the one those need.
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
