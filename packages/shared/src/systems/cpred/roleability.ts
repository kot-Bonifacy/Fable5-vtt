/**
 * Zdolności Specjalne Ról (stage 30) — the thing that makes a Role more than a
 * word on the sheet.
 *
 * The Netrunner's Interfejs has had its own machinery since stage 26a
 * (`netrun.ts`), and it set the shape this file follows: an ability is matched
 * by its **printed name**, never by a role id, because the ids come from
 * `roles.json`, a data file the group may rename or translate differently.
 *
 * Stage 30a fills in the second of the ten: **Zmysł Walki** (s. 146), the only
 * Special Ability that is spent rather than merely owned. A Solo has as many
 * points as their rank and divides them between six combat abilities, „poza
 * walką, gdy rozpoczyna się walka albo w trakcie walki (w ramach Akcji)".
 *
 * Two of those six say „first in the Round", which is state of the *Round*, not
 * of the sheet — it lives in `CpredTurnLedger` (`turn.ts`) next to the round
 * stamps stage 14e already keeps. Everything else here is a pure function of
 * the allocation, so the client's preview and the server's verdict agree
 * without a context object travelling between them.
 */

import type { CpredCharacterData, CpredRegistry } from './character.js';

/**
 * The Solo's Special Ability, matched by name for the reason described above.
 * „Zdolnością Specjalną Solo jest Zmysł Walki" (s. 31, s. 146).
 */
export const CPRED_COMBAT_AWARENESS_ABILITY = 'Zmysł Walki';

/**
 * The rank of a named Special Ability on this sheet, or null when this
 * character does not have it at all.
 *
 * Null rather than zero, for the same reason `cpredInterfaceRank` returns null:
 * zero would read as „a Solo who is bad at it", and every caller here has to
 * tell „no ability" from „rank 0" to decide whether to render anything.
 */
export function cpredRoleAbilityRank(
  data: Pick<CpredCharacterData, 'roleId' | 'roleAbilityRank'>,
  registry: CpredRegistry,
  ability: string,
): number | null {
  if (!data.roleId) return null;
  const role = registry.roles.find((entry) => entry.id === data.roleId);
  if (!role || role.ability.trim().toLowerCase() !== ability.trim().toLowerCase()) return null;
  return Math.max(0, Math.round(data.roleAbilityRank));
}

/** The name of whatever Special Ability this sheet has; null when no Role. */
export function cpredRoleAbilityName(
  data: Pick<CpredCharacterData, 'roleId'>,
  registry: CpredRegistry,
): string | null {
  if (!data.roleId) return null;
  return registry.roles.find((entry) => entry.id === data.roleId)?.ability ?? null;
}

// ──────────────────────────── Zmysł Walki (s. 146) ────────────────────────────

export const CPRED_COMBAT_AWARENESS_IDS = [
  'damageReduction',
  'luckyEscape',
  'fastReflexes',
  'preciseAttack',
  'weakSpot',
  'threatSense',
] as const;
export type CpredCombatAwarenessId = (typeof CPRED_COMBAT_AWARENESS_IDS)[number];

/**
 * How points turn into an effect. Three shapes, because the rulebook prints
 * three:
 *
 *  - `perPoint` — „Każdy przydzielony punkt to +1" (Błyskawiczna reakcja,
 *    Wykrycie słabości, Wyczucie zagrożenia)
 *  - `steps` — a ladder of fixed prices („Za 3 punkty +1, za 6 punktów +2…":
 *    Precyzyjny atak, Redukcja obrażeń)
 *  - `flat` — one price, one switch („Za 4 punkty ignorujesz…": Wyjście
 *    z opresji)
 */
export type CpredCombatAwarenessShape = 'perPoint' | 'steps' | 'flat';

export interface CpredCombatAwarenessDefinition {
  id: CpredCombatAwarenessId;
  /** Printed name, as the sheet's panel and the roll breakdown say it. */
  name: string;
  /** What it does, in the rulebook's own words — the panel's tooltip. */
  description: string;
  shape: CpredCombatAwarenessShape;
  /**
   * Point costs that buy something, ascending. For `perPoint` this is the
   * whole legal range (1…10); for `steps` and `flat` it is exactly the prices
   * the rulebook prints, and nothing between them is a legal spend.
   */
  costs: readonly number[];
  /** Page the rule is printed on, for the panel's footnote. */
  page: number;
}

/** Highest number of points any one ability may hold — the Solo's own cap. */
export const CPRED_ROLE_ABILITY_RANK_MAX = 10;

/**
 * The six abilities of s. 146, in the order the rulebook prints them.
 *
 * `costs` is the whole rule: a spend that is not on this list is not a spend
 * the rulebook allows. Precyzyjny atak at 4 points would buy exactly what 3
 * buys and waste one — so the panel refuses it rather than silently rounding,
 * which is the same bargain `cpredCombatAwarenessProblem` makes on the server.
 */
export const CPRED_COMBAT_AWARENESS: readonly CpredCombatAwarenessDefinition[] = [
  {
    id: 'damageReduction',
    name: 'Redukcja obrażeń',
    description:
      'Za 2 punkty zmniejsz o 1 pierwsze obrażenia otrzymane w tej Rundzie; za 4 punkty o 2, ' +
      'za 6 o 3, za 8 o 4, za 10 o 5.',
    shape: 'steps',
    costs: [2, 4, 6, 8, 10],
    page: 146,
  },
  {
    id: 'luckyEscape',
    name: 'Wyjście z opresji',
    description:
      'Za 4 punkty ignorujesz Krytyczne porażki (wyniki 1 na kości) wyrzucone w Testach ataku. ' +
      'Wynik nadal liczy się jako 1.',
    shape: 'flat',
    costs: [4],
    page: 146,
  },
  {
    id: 'fastReflexes',
    name: 'Błyskawiczna reakcja',
    description: 'Każdy przydzielony punkt to +1 do rzutów na Inicjatywę.',
    shape: 'perPoint',
    costs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    page: 146,
  },
  {
    id: 'preciseAttack',
    name: 'Precyzyjny atak',
    description:
      'Za 3 punkty dodajesz +1 do każdego wykonywanego Ataku; za 6 punktów +2, za 9 punktów +3.',
    shape: 'steps',
    costs: [3, 6, 9],
    page: 146,
  },
  {
    id: 'weakSpot',
    name: 'Wykrycie słabości',
    description:
      'Za każdy punkt dodajesz +1 do obrażeń (przed uwzględnieniem pancerza) zadanych ' +
      'pierwszym udanym Atakiem w Rundzie.',
    shape: 'perPoint',
    costs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    page: 146,
  },
  {
    id: 'threatSense',
    name: 'Wyczucie zagrożenia',
    description: 'Za każdy punkt dodaj +1 do Testów Percepcji.',
    shape: 'perPoint',
    costs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    page: 146,
  },
];

/** Definition of one ability by id — the panel and the breakdown both want it. */
export function cpredCombatAwarenessDefinition(
  id: CpredCombatAwarenessId,
): CpredCombatAwarenessDefinition {
  // Non-null: the id type is the list's own keys, so the compiler guarantees it.
  return CPRED_COMBAT_AWARENESS.find((entry) => entry.id === id)!;
}

/**
 * Points a Solo has put into each ability. Absent keys mean zero — an
 * allocation nobody has touched serializes as `{}`, which is what every sheet
 * that is not a Solo's carries.
 */
export type CpredCombatAwareness = Partial<Record<CpredCombatAwarenessId, number>>;

/** Points spent in total — what the panel subtracts from the rank. */
export function cpredCombatAwarenessSpent(allocation: CpredCombatAwareness): number {
  return CPRED_COMBAT_AWARENESS_IDS.reduce(
    (total, id) => total + Math.max(0, Math.round(allocation[id] ?? 0)),
    0,
  );
}

/** What one ability's points buy, given its ladder; 0 when nothing is spent. */
export function cpredCombatAwarenessValue(id: CpredCombatAwarenessId, points: number): number {
  const spent = Math.max(0, Math.round(points));
  if (spent === 0) return 0;
  const { shape, costs } = cpredCombatAwarenessDefinition(id);
  if (shape === 'perPoint') return Math.min(spent, CPRED_ROLE_ABILITY_RANK_MAX);
  // A ladder pays for the highest rung the spend reaches — and only exact
  // spends get here, because `cpredCombatAwarenessProblem` refuses the rest.
  // Rounding down rather than refusing keeps an older sheet readable if the
  // GM ever edits a rank downwards underneath a saved allocation.
  let value = 0;
  costs.forEach((cost, index) => {
    if (spent >= cost) value = index + 1;
  });
  return value;
}

/** Every effect the current allocation is worth, in one object. */
export interface CpredCombatAwarenessEffects {
  /** Rank of the ability itself — the pool the points came out of. */
  rank: number;
  spent: number;
  /** Points still unspent; never negative (an over-spend is refused earlier). */
  left: number;
  /** HP taken off the *first* damage suffered in a Round (0…5). */
  damageReduction: number;
  /** „Wyjście z opresji" is paid for: a natural 1 on an attack costs nothing. */
  ignoresFumble: boolean;
  /** Added to Initiative rolls. */
  initiative: number;
  /** Added to every Attack Check. */
  attack: number;
  /** Added to the damage of the first successful Attack in a Round, pre-armour. */
  weakSpot: number;
  /** Added to Perception Checks. */
  perception: number;
}

/** The zero effects — what everyone who is not a Solo gets. */
export const CPRED_NO_COMBAT_AWARENESS: CpredCombatAwarenessEffects = {
  rank: 0,
  spent: 0,
  left: 0,
  damageReduction: 0,
  ignoresFumble: false,
  initiative: 0,
  attack: 0,
  weakSpot: 0,
  perception: 0,
};

/** Turns an allocation into the six numbers the rest of the engine reads. */
export function cpredCombatAwarenessEffects(
  allocation: CpredCombatAwareness,
  rank: number,
): CpredCombatAwarenessEffects {
  const pool = Math.max(0, Math.round(rank));
  const points = (id: CpredCombatAwarenessId): number =>
    Math.max(0, Math.round(allocation[id] ?? 0));
  const spent = cpredCombatAwarenessSpent(allocation);
  return {
    rank: pool,
    spent,
    left: Math.max(0, pool - spent),
    damageReduction: cpredCombatAwarenessValue('damageReduction', points('damageReduction')),
    ignoresFumble: cpredCombatAwarenessValue('luckyEscape', points('luckyEscape')) > 0,
    initiative: cpredCombatAwarenessValue('fastReflexes', points('fastReflexes')),
    attack: cpredCombatAwarenessValue('preciseAttack', points('preciseAttack')),
    weakSpot: cpredCombatAwarenessValue('weakSpot', points('weakSpot')),
    perception: cpredCombatAwarenessValue('threatSense', points('threatSense')),
  };
}

/**
 * The Solo's own effects, read straight off a sheet. Returns the zero object
 * for everybody else, so callers never branch on „is this a Solo" — the same
 * bargain `combatProfileSheet` made for statists in 29.08.
 */
export function cpredSheetCombatAwareness(
  data: Pick<CpredCharacterData, 'roleId' | 'roleAbilityRank' | 'combatAwareness'>,
  registry: CpredRegistry,
): CpredCombatAwarenessEffects {
  const rank = cpredRoleAbilityRank(data, registry, CPRED_COMBAT_AWARENESS_ABILITY);
  if (rank === null) return CPRED_NO_COMBAT_AWARENESS;
  return cpredCombatAwarenessEffects(data.combatAwareness, rank);
}

/** Machine-readable refusal of a proposed allocation. */
export type CpredCombatAwarenessProblem =
  'NO_ABILITY' | 'NOT_ENOUGH_POINTS' | 'BAD_STEP' | 'BAD_VALUE';

export const CPRED_COMBAT_AWARENESS_PROBLEMS: Record<CpredCombatAwarenessProblem, string> = {
  NO_ABILITY: 'Ta postać nie ma Zmysłu Walki.',
  NOT_ENOUGH_POINTS: 'Rozdzielasz więcej punktów, niż masz Zmysłu Walki.',
  BAD_STEP: 'Ta zdolność kupuje się w całych progach — pośrednia liczba punktów nic nie daje.',
  BAD_VALUE: 'Liczba punktów musi być całkowita i nieujemna.',
};

/**
 * Judges a proposed allocation against a rank. Null = it is legal.
 *
 * Deliberately strict about the ladders: 4 points in Precyzyjny atak buy the
 * same +1 that 3 buy, so accepting it would quietly burn a point the Solo could
 * have spent elsewhere. The panel disables those numbers; this refuses them.
 */
export function cpredCombatAwarenessProblem(
  allocation: CpredCombatAwareness,
  rank: number | null,
): CpredCombatAwarenessProblem | null {
  if (rank === null) {
    // An empty allocation on a sheet with no Combat Awareness is not a problem
    // — it is what every other Role's sheet carries.
    return cpredCombatAwarenessSpent(allocation) === 0 ? null : 'NO_ABILITY';
  }
  for (const id of CPRED_COMBAT_AWARENESS_IDS) {
    const points = allocation[id];
    if (points === undefined) continue;
    if (!Number.isInteger(points) || points < 0) return 'BAD_VALUE';
    if (points === 0) continue;
    const { shape, costs } = cpredCombatAwarenessDefinition(id);
    if (shape === 'perPoint') {
      if (points > CPRED_ROLE_ABILITY_RANK_MAX) return 'BAD_VALUE';
    } else if (!costs.includes(points)) {
      return 'BAD_STEP';
    }
  }
  if (cpredCombatAwarenessSpent(allocation) > Math.max(0, Math.round(rank))) {
    return 'NOT_ENOUGH_POINTS';
  }
  return null;
}

/**
 * Reads a stored allocation, dropping anything unreadable.
 *
 * Lenient on purpose, unlike `cpredCombatAwarenessProblem`: this is the path a
 * saved sheet takes, and a sheet whose rank the GM lowered afterwards must
 * still open. What it cannot do is invent points — every value is clamped to
 * the legal range, and a spend past the pool is caught when it is *changed*.
 */
export function readCpredCombatAwareness(raw: unknown): CpredCombatAwareness {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const allocation: CpredCombatAwareness = {};
  for (const id of CPRED_COMBAT_AWARENESS_IDS) {
    const value = input[id];
    if (!Number.isInteger(value)) continue;
    const points = Math.min(Math.max(value as number, 0), CPRED_ROLE_ABILITY_RANK_MAX);
    if (points > 0) allocation[id] = points;
  }
  return allocation;
}

/**
 * The allocation as one line of prose — the chat sentence a Solo's
 * reallocation posts, and the tooltip of the hotbar box.
 *
 * „nic nie rozdzielono" rather than an empty string: a Solo who spent an Action
 * to move every point out of Redukcja obrażeń has done something, and the table
 * has to be able to read it.
 */
export function describeCombatAwareness(allocation: CpredCombatAwareness): string {
  const parts = CPRED_COMBAT_AWARENESS.filter((entry) => (allocation[entry.id] ?? 0) > 0).map(
    (entry) => {
      const points = allocation[entry.id]!;
      const value = cpredCombatAwarenessValue(entry.id, points);
      const worth = entry.shape === 'flat' ? '' : ` ${value}`;
      return `${entry.name}${worth} (${points} pkt)`;
    },
  );
  return parts.length > 0 ? parts.join(', ') : 'nic nie rozdzielono';
}
