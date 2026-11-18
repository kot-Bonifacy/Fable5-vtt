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
 * points as their rank and divides them between six combat abilities — out of
 * combat, as a fight starts, or mid-fight for the price of an Action.
 *
 * Stage 71g2 (G37): every rule this file states — comments and UI strings alike
 * — is a paraphrase with a page number, never the printed sentence. The repo is
 * public and the rulebook is not; names of abilities, items and Skills stay,
 * because they are what the table calls things.
 *
 * Two of those six say „first in the Round", which is state of the *Round*, not
 * of the sheet — it lives in `CpredTurnLedger` (`turn.ts`) next to the round
 * stamps stage 14e already keeps. Everything else here is a pure function of
 * the allocation, so the client's preview and the server's verdict agree
 * without a context object travelling between them.
 */

import type {
  CpredCharacterData,
  CpredCyberdeck,
  CpredNetInstallRow,
  CpredRegistry,
} from './character.js';
// Type-only: the price bands of the catalogue are what the Technik's PT/time
// table is indexed by, and a value import would drag the whole compendium in.
import type { CompendiumEntry, CostCategory, ProgramEntry } from './compendium.js';
// A value import, and a safe one: `netrunning.ts` takes nothing from this module.
// The team's deck copies Programs with the very function the sheet uses.
import { netProgramProfileOf, netProgramSlots } from './netrunning.js';
import { CPRED_PRICE_SCALE_DURABLE } from './pricing.js';
import { HOUSING_DEFINITIONS, type HousingOption } from './economy.js';

/**
 * The Solo's Special Ability, matched by name for the reason described above.
 * The Solo's ability is Zmysł Walki (s. 31, s. 146).
 */
export const CPRED_COMBAT_AWARENESS_ABILITY = 'Zmysł Walki';

// ─────────────────────── Role i ich rangi (etap 29b) ───────────────────────

/**
 * One Role this character carries, and how far its Special Ability has come.
 *
 * Stage 29b — a character may take up a new Role once the old one's Special
 * Ability has reached rank 4 (s. 143). What the rulebook does *not* say is that
 * the old Role stops working: its rank can still be raised and its benefits
 * still used. So a Role, once had, is had for good, and
 * the sheet needs somewhere to keep the ones that are no longer current.
 */
export interface CpredRoleRank {
  roleId: string;
  rank: number;
}

/**
 * What any Special Ability lookup needs off a sheet.
 *
 * `roleId`/`roleAbilityRank` stay the **current** Role — the one the Street
 * sees (Reputacja, the token's card, the title of the sheet) — and everything
 * earned before it lives in `formerRoles`. Written as one alias because a
 * dozen call sites take this shape, and a dozen `Pick<…>` literals is how one
 * of them gets forgotten when the shape grows again.
 */
export type CpredRoleSheet = Pick<CpredCharacterData, 'roleId' | 'roleAbilityRank' | 'formerRoles'>;

/** Lowest rank of the current Role's Ability that lets a character change Role. */
export const CPRED_MULTICLASS_MIN_RANK = 4;

/**
 * Every Role on this sheet, current one first.
 *
 * Current-first matters: it is the order the sheet lists the ability panels in,
 * and „bieżąca" is the answer to „którą Rolą jesteś" even on a sheet carrying
 * three.
 */
export function cpredRoleRanks(data: CpredRoleSheet): CpredRoleRank[] {
  const rows: CpredRoleRank[] = [];
  if (data.roleId)
    rows.push({ roleId: data.roleId, rank: Math.max(0, Math.round(data.roleAbilityRank)) });
  const former: readonly CpredRoleRank[] = data.formerRoles ?? [];
  for (const entry of former) {
    if (rows.some((row) => row.roleId === entry.roleId)) continue;
    rows.push({ roleId: entry.roleId, rank: Math.max(0, Math.round(entry.rank)) });
  }
  return rows;
}

/** Does this sheet carry the named Role at all — current or former? */
export function cpredHasRole(data: CpredRoleSheet, roleId: string): boolean {
  return cpredRoleRanks(data).some((row) => row.roleId === roleId);
}

/**
 * The rank of a named Special Ability on this sheet, or null when this
 * character does not have it at all.
 *
 * Null rather than zero, for the same reason `cpredInterfaceRank` returns null:
 * zero would read as „a Solo who is bad at it", and every caller here has to
 * tell „no ability" from „rank 0" to decide whether to render anything.
 *
 * Stage 29b: this asks **every** Role, not just the current one, and that is
 * the whole of what multiclassing had to change in ten stage-30 abilities —
 * they all come through here. Two Roles printing the same ability name is not
 * a thing `roles.json` can do with the rulebook's own data; if a group renames
 * one into a collision, the higher rank wins rather than whichever came first.
 */
export function cpredRoleAbilityRank(
  data: CpredRoleSheet,
  registry: CpredRegistry,
  ability: string,
): number | null {
  const wanted = ability.trim().toLowerCase();
  let best: number | null = null;
  for (const row of cpredRoleRanks(data)) {
    const role = registry.roles.find((entry) => entry.id === row.roleId);
    if (!role || role.ability.trim().toLowerCase() !== wanted) continue;
    best = best === null ? row.rank : Math.max(best, row.rank);
  }
  return best;
}

/** The name of the **current** Role's Special Ability; null when no Role. */
export function cpredRoleAbilityName(
  data: Pick<CpredCharacterData, 'roleId'>,
  registry: CpredRegistry,
): string | null {
  if (!data.roleId) return null;
  return registry.roles.find((entry) => entry.id === data.roleId)?.ability ?? null;
}

/**
 * Reads the stored list of former Roles. Unknown ids survive parsing on
 * purpose — a compendium regenerated with a renamed Role must not silently
 * eat a rank somebody paid 600 PD for — and are refused at the door instead,
 * by `cpredRolesProblem`.
 */
export function readCpredFormerRoles(raw: unknown): CpredRoleRank[] {
  if (!Array.isArray(raw)) return [];
  const rows: CpredRoleRank[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.roleId !== 'string' || row.roleId.length === 0) continue;
    if (rows.some((kept) => kept.roleId === row.roleId)) continue;
    const rank =
      typeof row.rank === 'number' && Number.isFinite(row.rank)
        ? Math.max(1, Math.min(CPRED_ROLE_ABILITY_RANK_MAX, Math.round(row.rank)))
        : 1;
    rows.push({ roleId: row.roleId, rank });
  }
  return rows;
}

/** What is wrong with the Roles on a merged sheet, or null when nothing is. */
export type CpredRolesProblem = 'UNKNOWN_ROLE' | 'ROLE_TWICE';

/**
 * Why the sheet was refused, in words the GM can act on.
 *
 * Here rather than on the client for the reason every other problem table is
 * (`CPRED_FLEET_PROBLEMS`, `CPRED_SPECIALTY_PROBLEMS`): the code is the engine's
 * and so is the sentence, so the panel that greys a button out and the header
 * that reports a refusal read the same one.
 */
export const CPRED_ROLES_PROBLEMS: Record<CpredRolesProblem, string> = {
  UNKNOWN_ROLE: 'Nie znam takiej Roli — odśwież stronę albo popraw dane kampanii.',
  ROLE_TWICE: 'Ta Rola już jest na karcie — jedna Rola stoi na niej tylko raz.',
};

/**
 * Judged against the **merged** sheet for the reason Specialties and the
 * Nomada's Tabor are (stages 30b, 30d): the patch may set `roleId` and
 * `formerRoles` in one write, and „is this Role already here" cannot be
 * answered by looking at either half alone.
 */
export function cpredRolesProblem(
  data: CpredRoleSheet,
  registry: CpredRegistry,
): CpredRolesProblem | null {
  const seen = new Set<string>();
  const former: readonly CpredRoleRank[] = data.formerRoles ?? [];
  for (const row of [...(data.roleId ? [{ roleId: data.roleId }] : []), ...former]) {
    if (!registry.roles.some((entry) => entry.id === row.roleId)) return 'UNKNOWN_ROLE';
    if (seen.has(row.roleId)) return 'ROLE_TWICE';
    seen.add(row.roleId);
  }
  return null;
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
 *  - `perPoint` — every point is +1 (Błyskawiczna reakcja, Wykrycie słabości,
 *    Wyczucie zagrożenia)
 *  - `steps` — a ladder of fixed prices, +1 per rung (Precyzyjny atak,
 *    Redukcja obrażeń)
 *  - `flat` — one price, one switch (Wyjście z opresji at 4)
 */
export type CpredCombatAwarenessShape = 'perPoint' | 'steps' | 'flat';

export interface CpredCombatAwarenessDefinition {
  id: CpredCombatAwarenessId;
  /** Printed name, as the sheet's panel and the roll breakdown say it. */
  name: string;
  /** What it does, paraphrased (G37) — the panel's tooltip. */
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
      'Pierwsze obrażenia, które dostajesz w Rundzie, maleją o 1 na każde pełne 2 punkty ' +
      '(2 → −1, 4 → −2 … 10 → −5).',
    shape: 'steps',
    costs: [2, 4, 6, 8, 10],
    page: 146,
  },
  {
    id: 'luckyEscape',
    name: 'Wyjście z opresji',
    description:
      'Przy 4 punktach jedynka na kości w Teście ataku nie wywołuje Krytycznej porażki — ' +
      'liczysz ją po prostu jako 1.',
    shape: 'flat',
    costs: [4],
    page: 146,
  },
  {
    id: 'fastReflexes',
    name: 'Błyskawiczna reakcja',
    description: 'Inicjatywa rośnie o 1 za każdy punkt.',
    shape: 'perPoint',
    costs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    page: 146,
  },
  {
    id: 'preciseAttack',
    name: 'Precyzyjny atak',
    description: 'Premia do wszystkich Twoich Ataków: +1 przy 3 punktach, +2 przy 6, +3 przy 9.',
    shape: 'steps',
    costs: [3, 6, 9],
    page: 146,
  },
  {
    id: 'weakSpot',
    name: 'Wykrycie słabości',
    description:
      'Pierwszy celny Atak w Rundzie rani mocniej: +1 za każdy punkt, doliczane, zanim ' +
      'zadziała pancerz.',
    shape: 'perPoint',
    costs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    page: 146,
  },
  {
    id: 'threatSense',
    name: 'Wyczucie zagrożenia',
    description: 'Testy Percepcji: +1 za każdy punkt.',
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
  data: CpredRoleSheet & Pick<CpredCharacterData, 'combatAwareness'>,
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

// ───────── Specjalizacje kupowane przy awansie (s. 147–151, etap 30b) ─────────

/**
 * Two Special Abilities are not a rank but a *purse*: the Technik's Twórca and
 * the Medyk's Medycyna both hand out points at every level and make you name
 * what you spent them on. That shared machinery lives here once — it is the
 * whole reason stage 30b holds those two and nothing else.
 *
 * The rulebook prints the two rules one page apart and they are **not** the
 * same, whatever the stage description said before it was checked:
 *
 *  - Twórca: each level gives one point to each of **two different**
 *    Specialties of the Technik's choosing (s. 147)
 *  - Medycyna: each level gives **one** point to **one** of the three
 *    Specialties (s. 149)
 *
 * So one hands out two points a level and the other one — which is `perRank`
 * below. What both share is the ceiling: a single level can put at most **one**
 * point into any one Specialty, so no Specialty may ever hold more points than
 * the ability's rank.
 */
export interface CpredSpecialtyDefinition<Id extends string = string> {
  id: Id;
  /** Printed name, as the panel and the roll breakdown say it. */
  name: string;
  /** What it does, paraphrased (G37) — the panel's tooltip. */
  description: string;
  /**
   * Ceiling the rulebook prints for this Specialty on top of the rank one
   * (five points for two of the Medyk's, s. 150), or the point past which more
   * points buy nothing at all.
   */
  max: number;
  page: number;
}

/** How an ability turns one level into points. */
export interface CpredSpecialtyRules {
  /** Points one level hands out — 2 for Twórca, 1 for Medycyna. */
  perRank: number;
  /** Different Specialties one level must be split between (2 / 1). */
  across: number;
}

/** Points put into each Specialty; absent keys mean zero, as in stage 30a. */
export type CpredSpecialtyAllocation<Id extends string = string> = Partial<Record<Id, number>>;

export type CpredSpecialtyProblem =
  'NO_ABILITY' | 'NOT_ENOUGH_POINTS' | 'SPECIALTY_CAP' | 'BAD_VALUE';

export const CPRED_SPECIALTY_PROBLEMS: Record<CpredSpecialtyProblem, string> = {
  NO_ABILITY: 'Ta postać nie ma tej Zdolności Specjalnej.',
  NOT_ENOUGH_POINTS: 'Rozdzielasz więcej punktów, niż daje poziom tej Zdolności.',
  SPECIALTY_CAP: 'Ta Specjalizacja jest już na swoim maksimum.',
  BAD_VALUE: 'Liczba punktów musi być całkowita i nieujemna.',
};

/** Points the ability has handed out in total at this rank. */
export function cpredSpecialtyPool(rules: CpredSpecialtyRules, rank: number): number {
  return Math.max(0, Math.round(rank)) * rules.perRank;
}

/**
 * Ceiling of one Specialty at this rank.
 *
 * `rank` because one level puts at most one point here, `max` because the
 * rulebook caps two of them outright — and because a sixth point in Chirurgia
 * would buy the eleventh point of a Skill that stops at ten. Refusing rather
 * than silently accepting is the bargain stage 30a made with Precyzyjny atak 4.
 */
export function cpredSpecialtyCap(definition: CpredSpecialtyDefinition, rank: number): number {
  return Math.min(definition.max, Math.max(0, Math.round(rank)));
}

/** Points spent in total — what the panel subtracts from the purse. */
export function cpredSpecialtySpent(allocation: CpredSpecialtyAllocation): number {
  return Object.values(allocation).reduce<number>(
    (total, points) => total + Math.max(0, Math.round(points ?? 0)),
    0,
  );
}

/**
 * Judges a proposed allocation. Null = it is legal.
 *
 * The two conditions below are not an approximation of „two different
 * Specialties a level" — they are exactly equivalent to it. Any allocation whose points sum to at most `perRank × rank` with no
 * Specialty above `rank` can be dealt out level by level in legal pairs, and
 * nothing else can. That is why no history of past level-ups is stored: the
 * numbers on the sheet already say whether they could have been bought.
 *
 * An allocation short of the full purse is legal on purpose: it is the sheet of
 * somebody who has just gone up a level and has not chosen yet, which is
 * precisely the moment the panel exists to catch.
 */
export function cpredSpecialtyProblem(
  allocation: CpredSpecialtyAllocation,
  definitions: readonly CpredSpecialtyDefinition[],
  rules: CpredSpecialtyRules,
  rank: number | null,
): CpredSpecialtyProblem | null {
  if (rank === null) {
    return cpredSpecialtySpent(allocation) === 0 ? null : 'NO_ABILITY';
  }
  for (const [id, points] of Object.entries(allocation)) {
    if (points === undefined) continue;
    const definition = definitions.find((entry) => entry.id === id);
    if (!definition) return 'BAD_VALUE';
    if (!Number.isInteger(points) || points < 0) return 'BAD_VALUE';
    if (points > cpredSpecialtyCap(definition, rank)) return 'SPECIALTY_CAP';
  }
  if (cpredSpecialtySpent(allocation) > cpredSpecialtyPool(rules, rank)) {
    return 'NOT_ENOUGH_POINTS';
  }
  return null;
}

/**
 * Reads a stored allocation, dropping anything unreadable — the lenient twin of
 * the judge above, for the same reason `readCpredCombatAwareness` is lenient: a
 * sheet whose rank the GM lowered afterwards must still open.
 */
export function readCpredSpecialties<Id extends string>(
  raw: unknown,
  ids: readonly Id[],
): CpredSpecialtyAllocation<Id> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const allocation: CpredSpecialtyAllocation<Id> = {};
  for (const id of ids) {
    const value = input[id];
    if (!Number.isInteger(value)) continue;
    const points = Math.min(Math.max(value as number, 0), CPRED_ROLE_ABILITY_RANK_MAX);
    if (points > 0) allocation[id] = points;
  }
  return allocation;
}

/** „Naprawa 2, Ulepszanie 1" — one line for a chat card or a tooltip. */
export function describeSpecialties(
  allocation: CpredSpecialtyAllocation,
  definitions: readonly CpredSpecialtyDefinition[],
): string {
  const parts = definitions
    .filter((entry) => (allocation[entry.id] ?? 0) > 0)
    .map((entry) => `${entry.name} ${allocation[entry.id]!}`);
  return parts.length > 0 ? parts.join(', ') : 'nic nie rozdzielono';
}

// ─────────────────────── Twórca (Technik, s. 147–149) ───────────────────────

/** The Technik's ability is Twórca (s. 31, s. 147). */
export const CPRED_FABRICATION_ABILITY = 'Twórca';

export const CPRED_FABRICATION_IDS = ['repair', 'upgrade', 'fabricate', 'invent'] as const;
export type CpredFabricationId = (typeof CPRED_FABRICATION_IDS)[number];

/** Two points a level, split between two different Specialties (s. 147). */
export const CPRED_FABRICATION_RULES: CpredSpecialtyRules = { perRank: 2, across: 2 };

export const CPRED_FABRICATION: readonly CpredSpecialtyDefinition<CpredFabricationId>[] = [
  {
    id: 'repair',
    name: 'Naprawa',
    description:
      'Poziom tej Specjalizacji dochodzi do Testów technicznych — Podstawowe naprawy, ' +
      'Cyberinżynieria, Elektronika i zabezpieczenia, Naprawa broni, Naprawa pojazdów — o ile Test ' +
      'nie należy do innej Specjalizacji Twórcy. Od poziomu 1 daje też prowizorkę za Akcję.',
    max: CPRED_ROLE_ABILITY_RANK_MAX,
    page: 147,
  },
  {
    id: 'upgrade',
    name: 'Ulepszanie',
    description:
      'Jedna z dziesięciu przeróbek z s. 148; każdą rzecz ulepsza się tą Specjalizacją ' +
      'najwyżej raz.',
    max: CPRED_ROLE_ABILITY_RANK_MAX,
    page: 148,
  },
  {
    id: 'fabricate',
    name: 'Wytwarzanie',
    description:
      'Budujesz z surowców rzecz, którą znasz. Surowce kosztują tyle, co pasmo cenowe o stopień ' +
      'tańsze od gotowej rzeczy (Superluksusowe: połowa ceny).',
    max: CPRED_ROLE_ABILITY_RANK_MAX,
    page: 148,
  },
  {
    id: 'invent',
    name: 'Wynajdywanie',
    description:
      'Projektujesz przeróbkę istniejącej rzeczy albo całkiem nowy wynalazek; tańszy niż ' +
      'Kosztowny być nie może.',
    max: CPRED_ROLE_ABILITY_RANK_MAX,
    page: 148,
  },
];

export type CpredFabrication = CpredSpecialtyAllocation<CpredFabricationId>;

/**
 * Skills „Naprawa" adds its level to (s. 147).
 *
 * Ids of the rulebook's own skill list, not names: this list is read against
 * `registry.skills`, which is a data file the group may translate — but the ids
 * are minted by the importer and stable. The exception for Tests that belong to
 * another Twórca Specialty is why crafting and inventing are **not** here: those
 * Tests add their own Specialty instead, and adding both would pay twice.
 */
export const CPRED_REPAIR_SKILL_IDS: readonly string[] = [
  'basic-tech',
  'cybertech',
  'electronics-security',
  'weaponstech',
  'land-vehicle-tech',
  'sea-vehicle-tech',
  'air-vehicle-tech',
];

/**
 * PT and time of Ulepszanie / Wytwarzanie / Wynajdywanie, by the price band of
 * the thing being made (s. 148). Superluksusowe shares Luksusowe's PT and pays
 * in time instead — a month per slice of the price (the rulebook's slice is
 * 10 000 ed; the house price list of stage 47a multiplied prices by ten, so the
 * slice here is 100 000 ed).
 */
export const CPRED_FABRICATION_TASK: Record<CostCategory, { dv: number; time: string }> = {
  cheap: { dv: 9, time: '1 godzina' },
  everyday: { dv: 9, time: '1 godzina' },
  costly: { dv: 13, time: '6 godzin' },
  premium: { dv: 17, time: '1 dzień' },
  expensive: { dv: 21, time: '1 tydzień' },
  veryExpensive: { dv: 24, time: '2 tygodnie' },
  luxury: { dv: 29, time: '1 miesiąc' },
  superLuxury: { dv: 29, time: '1 miesiąc na każde 100 000 ed ceny' },
};

export interface CpredFabricationEffects {
  /** Rank of Twórca itself — the purse the points came out of. */
  rank: number;
  spent: number;
  /** Points still unspent — the panel's „do rozdzielenia". */
  left: number;
  repair: number;
  upgrade: number;
  fabricate: number;
  invent: number;
}

export const CPRED_NO_FABRICATION: CpredFabricationEffects = {
  rank: 0,
  spent: 0,
  left: 0,
  repair: 0,
  upgrade: 0,
  fabricate: 0,
  invent: 0,
};

export function cpredFabricationEffects(
  allocation: CpredFabrication,
  rank: number,
): CpredFabricationEffects {
  const pool = cpredSpecialtyPool(CPRED_FABRICATION_RULES, rank);
  const points = (id: CpredFabricationId): number => Math.max(0, Math.round(allocation[id] ?? 0));
  const spent = cpredSpecialtySpent(allocation);
  return {
    rank: Math.max(0, Math.round(rank)),
    spent,
    left: Math.max(0, pool - spent),
    repair: points('repair'),
    upgrade: points('upgrade'),
    fabricate: points('fabricate'),
    invent: points('invent'),
  };
}

/**
 * The Technik's own Specialties, read straight off a sheet — zeroes for
 * everybody else, so no caller has to branch on „is this a Technik".
 */
export function cpredSheetFabrication(
  data: CpredRoleSheet & Pick<CpredCharacterData, 'fabrication'>,
  registry: CpredRegistry,
): CpredFabricationEffects {
  const rank = cpredRoleAbilityRank(data, registry, CPRED_FABRICATION_ABILITY);
  if (rank === null) return CPRED_NO_FABRICATION;
  return cpredFabricationEffects(data.fabrication, rank);
}

export function cpredFabricationProblem(
  allocation: CpredFabrication,
  rank: number | null,
): CpredSpecialtyProblem | null {
  return cpredSpecialtyProblem(allocation, CPRED_FABRICATION, CPRED_FABRICATION_RULES, rank);
}

export function readCpredFabrication(raw: unknown): CpredFabrication {
  return readCpredSpecialties(raw, CPRED_FABRICATION_IDS);
}

// ─────────────────────── Medycyna (Medyk, s. 149–151) ───────────────────────

/** The Medyk's ability is Medycyna (s. 31, s. 149). */
export const CPRED_MEDICINE_ABILITY = 'Medycyna';

export const CPRED_MEDICINE_IDS = ['surgery', 'pharma', 'cryo'] as const;
export type CpredMedicineId = (typeof CPRED_MEDICINE_IDS)[number];

/** One point a level, into one Specialty (s. 149) — half the Technik's purse. */
export const CPRED_MEDICINE_RULES: CpredSpecialtyRules = { perRank: 1, across: 1 };

/**
 * Ceiling the rulebook prints for Farmaceutyki and Obsługa kriosystemów: five
 * points each (s. 150).
 *
 * Chirurgia gets the same number for a different reason: each of its points is
 * worth two of the Skill, and the Skill stops at ten. A sixth point would buy
 * nothing at all, so it is refused rather than accepted and wasted — the same
 * bargain stage 30a struck with Precyzyjny atak 4.
 */
export const CPRED_MEDICINE_SPECIALTY_MAX = 5;

export const CPRED_MEDICINE: readonly CpredSpecialtyDefinition<CpredMedicineId>[] = [
  {
    id: 'surgery',
    name: 'Chirurgia',
    description:
      'Jeden punkt tu to dwa poziomy Umiejętności Chirurgia, najwyżej 10. Chirurgią zszywa się ' +
      'najcięższe Rany Krytyczne i wszczepia chrom; poza Medykiem nikt jej nie ma.',
    max: CPRED_MEDICINE_SPECIALTY_MAX,
    page: 149,
  },
  {
    id: 'pharma',
    name: 'Technologia Medyczna (Farmaceutyki)',
    description:
      'Jeden punkt tu to poziom Technologii Medycznej (najwyżej 10) i jeden nowy środek do ' +
      'wyboru: Antybiotyk, Dynadetoks, Turbo uzdrawiacz, Stym albo Zryw.',
    max: CPRED_MEDICINE_SPECIALTY_MAX,
    page: 149,
  },
  {
    id: 'cryo',
    name: 'Technologia Medyczna (Obsługa kriosystemów)',
    description:
      'Jeden punkt tu to poziom Technologii Medycznej (najwyżej 10); kolejne progi dają ' +
      'kriopompę i kriozbiorniki (tabela na s. 150).',
    max: CPRED_MEDICINE_SPECIALTY_MAX,
    page: 150,
  },
];

export type CpredMedicine = CpredSpecialtyAllocation<CpredMedicineId>;

/** Ceiling of a Skill bought through Medycyna — ten, like any Skill (s. 149). */
export const CPRED_MEDICINE_SKILL_MAX = 10;

/**
 * The two Skills Medycyna hands out.
 *
 * They are **not** in `skills.json` and must not be: the rulebook's skill list
 * does not print them, because only a Medyk gets them and only through this
 * Specialty (s. 149). Their level is a function of the
 * allocation, not a number anybody types — which is exactly why they are here
 * rather than in the registry, where a level could be edited free of charge.
 */
export const CPRED_MEDICINE_SKILLS = [
  { id: 'medicine.surgery', name: 'Chirurgia', stat: 'tech' as const },
  { id: 'medicine.medtech', name: 'Technologia Medyczna', stat: 'tech' as const },
] as const;

export type CpredMedicineSkillId = (typeof CPRED_MEDICINE_SKILLS)[number]['id'];

export function isCpredMedicineSkillId(value: unknown): value is CpredMedicineSkillId {
  return CPRED_MEDICINE_SKILLS.some((skill) => skill.id === value);
}

export interface CpredMedicineEffects {
  rank: number;
  spent: number;
  left: number;
  surgery: number;
  pharma: number;
  cryo: number;
  /** Two Skill levels per Chirurgia point, ceiling 10 (s. 149). */
  surgerySkill: number;
  /** Farmaceutyki and Obsługa kriosystemów points added together (s. 149). */
  medtechSkill: number;
}

export const CPRED_NO_MEDICINE: CpredMedicineEffects = {
  rank: 0,
  spent: 0,
  left: 0,
  surgery: 0,
  pharma: 0,
  cryo: 0,
  surgerySkill: 0,
  medtechSkill: 0,
};

export function cpredMedicineEffects(
  allocation: CpredMedicine,
  rank: number,
): CpredMedicineEffects {
  const pool = cpredSpecialtyPool(CPRED_MEDICINE_RULES, rank);
  const points = (id: CpredMedicineId): number => Math.max(0, Math.round(allocation[id] ?? 0));
  const spent = cpredSpecialtySpent(allocation);
  const surgery = points('surgery');
  const pharma = points('pharma');
  const cryo = points('cryo');
  return {
    rank: Math.max(0, Math.round(rank)),
    spent,
    left: Math.max(0, pool - spent),
    surgery,
    pharma,
    cryo,
    surgerySkill: Math.min(CPRED_MEDICINE_SKILL_MAX, surgery * 2),
    medtechSkill: Math.min(CPRED_MEDICINE_SKILL_MAX, pharma + cryo),
  };
}

export function cpredSheetMedicine(
  data: CpredRoleSheet & Pick<CpredCharacterData, 'medicine'>,
  registry: CpredRegistry,
): CpredMedicineEffects {
  const rank = cpredRoleAbilityRank(data, registry, CPRED_MEDICINE_ABILITY);
  if (rank === null) return CPRED_NO_MEDICINE;
  return cpredMedicineEffects(data.medicine, rank);
}

export function cpredMedicineProblem(
  allocation: CpredMedicine,
  rank: number | null,
): CpredSpecialtyProblem | null {
  return cpredSpecialtyProblem(allocation, CPRED_MEDICINE, CPRED_MEDICINE_RULES, rank);
}

export function readCpredMedicine(raw: unknown): CpredMedicine {
  return readCpredSpecialties(raw, CPRED_MEDICINE_IDS);
}

/**
 * Level of one Medyk-only Skill on this sheet — 0 for everybody who is not a
 * Medyk, which is what „nie ma tej Umiejętności" means for a Check.
 */
export function cpredMedicineSkillLevel(
  data: CpredRoleSheet & Pick<CpredCharacterData, 'medicine'>,
  registry: CpredRegistry,
  skillId: CpredMedicineSkillId,
): number {
  const effects = cpredSheetMedicine(data, registry);
  return skillId === 'medicine.surgery' ? effects.surgerySkill : effects.medtechSkill;
}

/**
 * Farmaceutyki (s. 150) mieszkają od tej sesji w `pharma.ts`, a nie tu.
 *
 * Odkąd dawka jest przedmiotem, katalog czyta **walidacja karty**
 * (`CpredGearRow.consumable`), a `character.ts` bierze z tego pliku wartości —
 * odwrotny kierunek niż dziś. `pharma.ts` nie importuje niczego, więc leży
 * pod obydwoma i żadna strona nie musi się zastanawiać nad kolejnością.
 */

/** What each point of Obsługa kriosystemów brings (s. 150) — the panel's table. */
export const CPRED_CRYO_LEVELS: readonly string[] = [
  'Jedna kriopompa.',
  'Zarejestrowany Technik kriozbiorników: stały dostęp do 1 kriozbiornika w krioośrodku.',
  '1 własny kriozbiornik, zamontowany w wybranym pomieszczeniu.',
  '2 dodatkowe kriozbiorniki; kriopompa ma 2 ładunki i przewozi dwie osoby.',
  '3 dodatkowe kriozbiorniki; kriopompa ma 3 ładunki i przewozi trzy osoby.',
];

/**
 * Both allocations judged against the rank the sheet actually carries.
 *
 * `applyCharacterPatch` can only check shapes and ceilings — the patch may
 * raise the rank, lower it, or not mention it at all — so the purse is counted
 * here, against the merged sheet, exactly where the answer is knowable. Null
 * means both fit.
 */
export function cpredSpecialtiesProblem(
  data: CpredRoleSheet & Pick<CpredCharacterData, 'medicine' | 'fabrication'>,
  registry: CpredRegistry,
): CpredSpecialtyProblem | null {
  return (
    cpredMedicineProblem(
      data.medicine,
      cpredRoleAbilityRank(data, registry, CPRED_MEDICINE_ABILITY),
    ) ??
    cpredFabricationProblem(
      data.fabrication,
      cpredRoleAbilityRank(data, registry, CPRED_FABRICATION_ABILITY),
    )
  );
}

// ────────────────── Ulepszanie: dziesięć skutków z s. 148 ──────────────────

/** What kind of sheet row an upgrade can be put on. */
export type CpredUpgradeTarget = 'weapon' | 'armor' | 'gear' | 'cyberware' | 'vehicle';

export interface CpredItemUpgradeDefinition {
  id: string;
  /** Short label for the row's chip. */
  name: string;
  /** What the upgrade does, paraphrased (G37) — what the table plays out. */
  text: string;
  /** Rows this may be put on; `vehicle` has nowhere to land yet (no vehicles). */
  targets: readonly CpredUpgradeTarget[];
  /**
   * Co VTT liczy samo, gdy wiersz niesie ten stempel — zdanie do panelu
   * Twórcy. Do etapu 71d1 liczyło się tylko +1 OB; od 71d1 (G14–G16) także
   * gniazdo, jakość Doskonała, broń do ukrycia i UC wszczepu
   * (`itemupgrade.ts`), od 71c2 szybsza naprawa. Bez pola — skutek prozą.
   */
  vtt?: string;
}

/**
 * The ten ways Ulepszanie changes an item, each usable once per item (s. 148).
 *
 * **Ten of them, not eleven** — the stage description said eleven and the page
 * prints ten bullets; counted at the source, like the six abilities of Zmysł
 * Walki in 30a.
 *
 * The list is printed in full — including the nine the engine cannot compute —
 * because a Technik choosing an upgrade is choosing from ten, and a menu
 * showing one would quietly rewrite the Role.
 */
export const CPRED_ITEM_UPGRADES: readonly CpredItemUpgradeDefinition[] = [
  {
    id: 'humanity',
    name: 'Łagodniejsza cyborgizacja',
    text:
      'Wszczep (nie borgizacja) o UC 2k6 albo większej kosztuje przy montażu o 1k6 mniej ' +
      'Człowieczeństwa.',
    targets: ['cyberware'],
    vtt: 'UC przy montażu znalezionego wszczepu niższa o 1k6',
  },
  {
    id: 'slot',
    name: 'Dodatkowe gniazdo',
    text:
      'Rzecz zyskuje jedno gniazdo więcej (na Dodatki, Programy, Ulepszenia sprzętowe i ' +
      'podobne) — takie samo jak te, które już ma.',
    targets: ['weapon', 'gear', 'cyberware'],
    vtt: 'czwarte gniazdo broni, gniazdo deku, opcja wszczepu bazowego',
  },
  {
    id: 'fastRepair',
    name: 'Szybsza naprawa',
    text: 'Po przeróbce każda kolejna naprawa tej rzeczy trwa o połowę krócej.',
    targets: ['weapon', 'armor', 'gear'],
    vtt: 'połowa czasu zwykłej naprawy',
  },
  {
    id: 'concealable',
    name: 'Broń do ukrycia',
    text: 'Jednoręczna broń, która dotąd nie mieściła się pod ubraniem, daje się schować.',
    targets: ['weapon'],
    vtt: 'broń „do ukrycia” na karcie',
  },
  {
    id: 'excellent',
    name: 'Jakość Doskonała',
    text: 'Broń Zwykłej jakości staje się Doskonała.',
    targets: ['weapon'],
    vtt: '+1 do Testów ataku',
  },
  {
    id: 'exoticSlot',
    name: 'Gniazdo w broni egzotycznej',
    text: 'Broń egzotyczna dostaje jedno gniazdo na Dodatek.',
    targets: ['weapon'],
    vtt: 'jedno gniazdo dodatku',
  },
  {
    id: 'exoticAmmo',
    name: 'Amunicja niestandardowa',
    text:
      'Broń egzotyczna przyjmuje jeden wybrany rodzaj amunicji niestandardowej — w typie, ' +
      'którego i tak używa.',
    targets: ['weapon'],
  },
  {
    id: 'armorSp',
    name: '+1 OB',
    text: 'OB rzeczy, która w ogóle ma OB, rośnie o 1.',
    targets: ['armor'],
    vtt: '+1 OB na wierszu pancerza',
  },
  {
    id: 'vehicleMod',
    name: 'Ulepszenie pojazdu',
    text: 'Montujesz w aucie ulepszenie z progu Moto 1 (tego, które Nomada ma od poziomu 1).',
    targets: ['vehicle'],
  },
  {
    id: 'invention',
    name: 'Montaż wynalazku',
    text:
      'Wbudowujesz ulepszenie z Wynajdywania; surowce kosztują tyle, ile MG wycenił przy ' +
      'wynalazku.',
    targets: ['weapon', 'armor', 'gear', 'cyberware'],
  },
];

/** Upgrades that may be put on a row of this kind. */
export function cpredUpgradesFor(target: CpredUpgradeTarget): CpredItemUpgradeDefinition[] {
  return CPRED_ITEM_UPGRADES.filter((entry) => entry.targets.includes(target));
}

export function cpredItemUpgrade(id: string): CpredItemUpgradeDefinition | null {
  return CPRED_ITEM_UPGRADES.find((entry) => entry.id === id) ?? null;
}

/**
 * Prowizorka (s. 147): how long a field repair holds.
 *
 * Ten minutes per level of Naprawa — sixty rounds a level, which is longer than any fight this VTT has ever run. That is why it
 * carries no round timer: a countdown that can never reach zero is a countdown
 * nobody reads. The row keeps what the piece was worth before, and a button
 * puts it back — the same bargain stage 16h struck for effects outside combat.
 */
export const CPRED_FIELD_REPAIR_MINUTES_PER_LEVEL = 10;

export function cpredFieldRepairMinutes(repairLevel: number): number {
  return Math.max(0, Math.round(repairLevel)) * CPRED_FIELD_REPAIR_MINUTES_PER_LEVEL;
}

// ────────────────── Wsparcie (Stróż Prawa, s. 158–159) ──────────────────

/** The Stróż Prawa's ability is Wsparcie (s. 37, s. 158). */
export const CPRED_BACKUP_ABILITY = 'Wsparcie';

/**
 * One category of Backup, exactly as the rulebook prints it.
 *
 * Six of them, not five: 1–2, 3–4, 5–7, 8, 9 and 10 each get their own block on
 * s. 158–159, and the top three are single levels because the officers stop
 * being interchangeable — a Marshal on a superbike is not two C-SWAT troopers.
 *
 * Wartość bojowa is the one number an officer attacks and defends with — Stat
 * and Skill already added up — which is the shape `combatProfileWithCombatValue`
 * already gives a turret (26e). `move` and `body` stay real numbers, because RAW
 * keeps them for distance and for effects that read RUCH or BC (a Death Save,
 * for one).
 */
export interface CpredBackupTier {
  id: string;
  /** Who answers the radio — the block's title. */
  name: string;
  /**
   * One of them, for the name on the figure. „Miejscowe krawężniki 1" reads
   * like a typo on a token; „Krawężnik 1" reads like a person.
   */
  unit: string;
  /** Lowest ability level that may call this group. */
  minLevel: number;
  /** Highest level this block covers; equal to `minLevel` for the top three. */
  maxLevel: number;
  /** How many officers arrive. */
  count: number;
  /** Wartość bojowa — attack *and* defence, plus 1d10. */
  combatValue: number;
  /** OB — the armour's SP, same on head and body. */
  sp: number;
  /** PW of each officer. */
  hp: number;
  /** RUCH. */
  move: number;
  /** BC. */
  body: number;
  /** Weapon each of them fires; looked up in the compendium by this name. */
  weapon: string;
  /**
   * Etap 71f (G31, STR-13): druga broń wyższych kategorii — granatnik szeryfa,
   * wyrzutnia C-SWAT, pistolet przy karabinie. Drugi wiersz broni na karcie
   * figury; szukana po nazwie jak pierwsza, a nieznana katalogowi wypada.
   */
  secondWeapon?: string;
  /** The rest of what they bring, as the block lists it. */
  loadout: string;
  /** Who they are and how they get there. */
  description: string;
  /**
   * Skills the group may roll its Wartość bojowa in. Only the federal team has
   * a list (s. 159) — nobody below level 10 does anything but shoot.
   */
  skills?: readonly string[];
  page: number;
}

/** The six categories, lowest first — the order the rulebook prints them in. */
export const CPRED_BACKUP_TIERS: readonly CpredBackupTier[] = [
  {
    id: 'corp-security',
    name: 'Korporacyjne służby bezpieczeństwa',
    unit: 'Korpogliniarz',
    minLevel: 1,
    maxLevel: 2,
    count: 4,
    combatValue: 8,
    sp: 7,
    hp: 20,
    move: 4,
    body: 4,
    weapon: 'Ciężki pistolet',
    loadout: 'Ciężkie pistolety, Kevlar',
    description: 'Czwórka ochroniarzy z pobliskiej korporacji; zjawiają się pieszo.',
    page: 158,
  },
  {
    id: 'beat-cops',
    name: 'Miejscowe krawężniki',
    unit: 'Krawężnik',
    minLevel: 3,
    maxLevel: 4,
    count: 4,
    combatValue: 10,
    sp: 7,
    hp: 25,
    move: 5,
    body: 5,
    weapon: 'Ciężki pistolet',
    loadout: 'Ciężkie pistolety, Kevlar',
    description: 'Czteroosobowy patrol w dwóch samochodach kompaktowych.',
    page: 158,
  },
  {
    id: 'state-police',
    name: 'Policja stanowa',
    unit: 'Funkcjonariusz drogówki',
    minLevel: 5,
    maxLevel: 7,
    count: 2,
    combatValue: 14,
    sp: 13,
    hp: 35,
    move: 4,
    body: 4,
    weapon: 'Karabin szturmowy',
    secondWeapon: 'Ciężki pistolet',
    loadout: 'Ciężkie pistolety, Karabiny szturmowe, Ciężkie kurtki kuloodporne',
    description:
      'Para z drogówki, która pilnuje autostrad i zamożnych przedmieść wokół Miasta; ' +
      'podjeżdża Samochodem sportowym.',
    page: 158,
  },
  {
    id: 'marshal',
    name: 'Marshal ze Strefy Odzyskanej',
    unit: 'Marshal',
    minLevel: 8,
    maxLevel: 8,
    count: 1,
    combatValue: 16,
    sp: 15,
    hp: 50,
    move: 6,
    body: 6,
    weapon: 'Karabin szturmowy',
    secondWeapon: 'Granatnik',
    loadout: 'Bardzo ciężki pistolet, Karabin szturmowy, Granatnik, Ubranie kuloodporne',
    description:
      'Samotny szeryf Stref odzyskanych i świeżo stawianych miasteczek, rodem z westernu; ' +
      'nadjeżdża na Supermotocyklu.',
    page: 159,
  },
  {
    id: 'c-swat',
    name: 'C-SWAT',
    unit: 'C-SWAT',
    minLevel: 9,
    maxLevel: 9,
    count: 2,
    combatValue: 15,
    sp: 18,
    hp: 35,
    move: 4,
    body: 4,
    weapon: 'Karabin szturmowy',
    secondWeapon: 'Wyrzutnia rakiet',
    loadout: 'Karabiny szturmowe, Wyrzutnie rakiet, Metalgear',
    description: 'Dwóch ciężko uzbrojonych z Psychobrygady; spadają z nieba w AV-4.',
    page: 159,
  },
  {
    id: 'federal',
    name: 'Organizacja policyjna / Interpol / FBI / Netwatch',
    unit: 'Agent federalny',
    minLevel: 10,
    maxLevel: 10,
    count: 2,
    combatValue: 14,
    sp: 11,
    hp: 35,
    move: 6,
    body: 6,
    weapon: 'Karabin szturmowy',
    secondWeapon: 'Bardzo ciężki pistolet',
    loadout: 'Bardzo ciężkie pistolety, Karabiny szturmowe, Lekkie kurtki przeciwpancerne',
    description:
      'Agenci federalni albo międzynarodowi — najcięższe Wsparcie; para przylatuje AV-4. ' +
      'Jako jedyni nie znikają po walce, tylko zostają przy zabezpieczaniu miejsca zdarzenia, ' +
      'a przy tej samej „sprawie” wracają na wezwanie ci sami dwaj.',
    skills: [
      'Aktorstwo',
      'Atrakcyjność',
      'Dedukcja',
      'Fałszerstwo',
      'Kryminologia',
      'Kryptografia',
      'Księgowość',
      'Odporność na tortury/narkotyki',
      'Percepcja',
      'Przesłuchiwanie',
      'Ratownictwo medyczne',
      'Skradanie się',
      'Tropienie',
      'Ukrycie/znalezienie przedmiotu',
      'Wykształcenie',
    ],
    page: 159,
  },
];

/** The category that covers this Backup level; null outside 1–10. */
export function cpredBackupTierAt(level: number): CpredBackupTier | null {
  const value = Math.round(level);
  return (
    CPRED_BACKUP_TIERS.find((tier) => value >= tier.minLevel && value <= tier.maxLevel) ?? null
  );
}

export function cpredBackupTier(id: string): CpredBackupTier | null {
  return CPRED_BACKUP_TIERS.find((tier) => tier.id === id) ?? null;
}

/**
 * Any group at or below the ability's rank may be called (s. 158) — so the
 * choice is the Lawman's, and a
 * rank 7 officer may deliberately whistle up four beat cops instead of the
 * state police.
 */
export function cpredBackupTiersFor(rank: number): CpredBackupTier[] {
  const value = Math.max(0, Math.round(rank));
  return CPRED_BACKUP_TIERS.filter((tier) => tier.minLevel <= value);
}

/** The category above — the next block down the page. */
export function cpredBackupTierAfter(tier: CpredBackupTier): CpredBackupTier | null {
  const index = CPRED_BACKUP_TIERS.findIndex((entry) => entry.id === tier.id);
  if (index < 0) return null;
  return CPRED_BACKUP_TIERS[index + 1] ?? null;
}

/** Call roll: 1d10 at or under the rank answers (s. 158). */
export const CPRED_BACKUP_CALL_DIE = 10;
/** Arrival: 1d6 Rounds (s. 158). */
export const CPRED_BACKUP_ARRIVAL_DIE = 6;
/** The rank at which a six sends two groups instead of promoting one. */
export const CPRED_BACKUP_DOUBLE_RANK = 10;

export interface CpredBackupOutcome {
  /** Somebody picked up. */
  answered: boolean;
  /** Category that actually turns up; null when nobody answered. */
  tierId: string | null;
  /** Rounds until they get there; null when nobody answered. */
  rounds: number | null;
  /** A six came up on the arrival die. */
  escalated: boolean;
  /**
   * At rank 10 a six brings two different groups instead of a bigger one.
   * Which second group is not printed, so the VTT
   * does not invent one: it says two are coming and lets the GM name the other
   * (session decision, 2026-08-29).
   */
  secondGroup: boolean;
}

/**
 * The whole call, as one function of two dice.
 *
 * Both rolls are handed in rather than rolled here, for the reason every rule in
 * this package takes its randomness from outside: the server rolls through the
 * dice engine so the table sees the numbers, and the test suite rolls whatever
 * it needs to.
 *
 * A six escalates past the Lawman's own rank on purpose. The rule that sends the
 * next category up says nothing about the ceiling that governs *calling*, and
 * the reward for the six is precisely
 * that somebody bigger than you could ask for turned up.
 */
export function cpredBackupCall(
  rank: number,
  level: number,
  callRoll: number,
  arrivalRoll: number,
): CpredBackupOutcome {
  const ability = Math.max(0, Math.round(rank));
  const called = cpredBackupTierAt(level);
  const answered = called !== null && callRoll >= 1 && callRoll <= ability;
  if (!answered || called === null) {
    return { answered: false, tierId: null, rounds: null, escalated: false, secondGroup: false };
  }
  const rounds = Math.max(1, Math.round(arrivalRoll));
  const escalated = rounds === CPRED_BACKUP_ARRIVAL_DIE;
  if (!escalated) {
    return { answered: true, tierId: called.id, rounds, escalated: false, secondGroup: false };
  }
  if (ability >= CPRED_BACKUP_DOUBLE_RANK) {
    return { answered: true, tierId: called.id, rounds, escalated: true, secondGroup: true };
  }
  const promoted = cpredBackupTierAfter(called) ?? called;
  return { answered: true, tierId: promoted.id, rounds, escalated: true, secondGroup: false };
}

/**
 * Umiejętności kategorii jako profil bojowy: id → Wartość bojowa (31.08).
 *
 * Agenci rzucają Wartością bojową w Testach z listy na s. 159 — jedna liczba
 * w piętnastu miejscach, bo Wartość
 * bojowa to już suma Cechy i Umiejętności. Stąd `combatValue` przy każdym
 * wpisie, a nie poziom do dodania do czegokolwiek.
 *
 * Szukanie **po nazwie**, jak broni w `spawnBackup` i jak rany w
 * `criticalInjuryAt`: id w `skills.json` powstają przy imporcie i nie są
 * niczym, na czym można oprzeć tabelę wpisaną w kod. Porównanie ignoruje
 * wielkość liter, bo już raz nie trafiło: podręcznik drukuje „Ukrycie/
 * znalezienie przedmiotu", a plik danych ma „Ukrycie/Znalezienie przedmiotu",
 * i ta jedna litera po cichu zabierała agentom federalnym Umiejętność.
 *
 * Nazwa, która nie ma odpowiednika w rejestrze, wypada — tak samo jak broń,
 * której nie ma w katalogu, degraduje się do pięści. Figura z czternastoma
 * Testami jest do rozegrania; figura, która nie powstała, bo w pliku brakuje
 * wiersza, nie jest.
 */
export function cpredBackupSkillLevels(
  tier: CpredBackupTier,
  registry: CpredRegistry,
): Record<string, number> {
  if (!tier.skills || tier.skills.length === 0) return {};
  const byName = new Map(registry.skills.map((skill) => [skill.name.trim().toLowerCase(), skill]));
  const levels: Record<string, number> = {};
  for (const name of tier.skills) {
    const skill = byName.get(name.trim().toLowerCase());
    if (skill) levels[skill.id] = tier.combatValue;
  }
  return levels;
}

/** „Wartość bojowa X · OB X · PW X · RUCH X · BC X" — the block, on one line. */
export function describeBackupTier(tier: CpredBackupTier): string {
  return (
    `Wartość bojowa ${tier.combatValue} · OB ${tier.sp} · PW ${tier.hp} · ` +
    `RUCH ${tier.move} · BC ${tier.body}`
  );
}

/**
 * A Backup officer as a token's combat profile.
 *
 * The whole reason 30c is one stage rather than two: the rulebook hands the GM
 * five numbers and this VTT already has a home for exactly those five. Nothing
 * here is a new kind of figure — it is the statist of 16b with its Skill half
 * filled in from Wartość bojowa, the same substitution `combatProfileWithCombatValue`
 * makes for a turret.
 *
 * Three deliberate details:
 *
 *  - `evasion` is the combat value, not zero. The value serves attack **and**
 *    defence — an officer parries a machete with the same figure he
 *    shoots with, and REF/DEX stay at zero so the breakdown reads honestly.
 *  - `noBulletDodge` is what the rule that Backup cannot dodge bullets
 *    actually costs. Without it the flag would be decoration: `attack:evade` in
 *    this project ducks bullets as happily as blades.
 *  - `weaponDamage` is left for the caller to fill from the compendium, by name.
 *    An id in this file would be an id from a generated data file, and those are
 *    the ones that go stale (the same reason `criticalInjuryAt` matches names).
 */
export function cpredBackupProfile(tier: CpredBackupTier): CpredBackupProfileSeed {
  return {
    ref: 0,
    dex: 0,
    body: tier.body,
    will: 0,
    move: tier.move,
    skillLevel: tier.combatValue,
    evasion: tier.combatValue,
    armorSp: tier.sp,
    weaponName: tier.weapon,
    noBulletDodge: true,
  };
}

/**
 * What `cpredBackupProfile` knows without asking the compendium.
 *
 * Structurally a `CpredCombatProfile` minus the three weapon fields the catalogue
 * owns — spelled out here rather than imported so this module keeps the
 * type-only relationship with `statist.ts` that stops the two from forming an
 * import cycle through `character.ts`.
 */
export interface CpredBackupProfileSeed {
  ref: number;
  dex: number;
  body: number;
  will: number;
  move: number;
  skillLevel: number;
  evasion: number;
  armorSp: number;
  weaponName: string;
  noBulletDodge: true;
}

// ─────────────── Praca Zespołowa (Korpo, s. 153–157) ───────────────

/** The Korpo's ability is Praca Zespołowa (s. 36, s. 153). */
export const CPRED_TEAMWORK_ABILITY = 'Praca Zespołowa';

/**
 * Team size by rank: the first member joins at 3, one more at 5 and at 9, never
 * more than three (s. 154).
 */
export const CPRED_TEAM_SLOT_LEVELS: readonly number[] = [3, 5, 9];
export const CPRED_TEAM_MAX = CPRED_TEAM_SLOT_LEVELS.length;

/** How many employees this rank is entitled to — 0 below level 3. */
export function cpredTeamSlots(rank: number): number {
  const value = Math.max(0, Math.round(rank));
  return CPRED_TEAM_SLOT_LEVELS.filter((level) => value >= level).length;
}

/**
 * Everything else the ability pays for, level by level (s. 153).
 *
 * Prose rather than mechanics on purpose: a conapt, a Trauma Team subscription
 * and a McPosiadłość are the GM's world, not the engine's arithmetic — the one
 * thing here the VTT could compute (rent) is already the Lifestyle of 23b, and
 * a rent-free flat is something the table applies, not a discount the
 * settlement can guess at.
 */
export interface CpredTeamworkPerk {
  level: number;
  name: string;
  text: string;
}

export const CPRED_TEAMWORK_PERKS: readonly CpredTeamworkPerk[] = [
  {
    level: 1,
    name: 'Premia motywacyjna',
    text:
      'Firmowy garnitur (kurtka, tułów, nogi, stopy) — każdy pozna, dla kogo pracujesz. ' +
      'Kto próbuje go sprzedać, ściąga na siebie podejrzenia.',
  },
  {
    level: 2,
    name: 'Korporacyjny kwaterunek',
    text:
      'Mieszkasz w konapcie firmy i nie płacisz za niego ani czynszu, ani rachunków; ' +
      'za Styl życia płacisz dalej sam.',
  },
  { level: 3, name: 'Pierwszy członek zespołu', text: 'HR przydziela ci pierwszego pracownika.' },
  { level: 5, name: 'Drugi członek zespołu', text: 'Do zespołu dochodzi druga osoba.' },
  {
    level: 6,
    name: 'Korporacyjne Ubezpieczenie Zdrowotne',
    text: 'Trauma Team w wersji srebrnej, a rachunek co miesiąc reguluje firma.',
  },
  {
    level: 7,
    name: 'Dom w Bobrowisku',
    text: 'Firma przenosi cię do domu w Bobrowisku, osiedlu korporacji w jej Strefie.',
  },
  {
    level: 8,
    name: 'Platynowy Trauma Team',
    text: 'Trauma Team awansuje do wersji platynowej.',
  },
  { level: 9, name: 'Trzeci członek zespołu', text: 'Zespół osiąga maksymalny rozmiar.' },
  {
    level: 10,
    name: 'Luksus',
    text:
      'Do wyboru: McPosiadłość w Bobrowisku albo penthouse w wieżowcu Strefy ' + 'Korporacyjnej.',
  },
];

/**
 * Czy ta karta może mieszkać w `option` (etap 48a, decyzja MG z 10.10).
 * Zwykłe Zakwaterowanie — zawsze (czynsz zapłaci rozliczenie miesiąca);
 * korporacyjne — od rangi Pracy Zespołowej z `HousingDefinition.teamworkRank`,
 * liczonej z każdej Roli na karcie, jak każda Zdolność.
 */
export function cpredHousingAllowed(
  option: HousingOption,
  data: CpredRoleSheet,
  registry: CpredRegistry,
): boolean {
  const need = HOUSING_DEFINITIONS[option].teamworkRank;
  if (need === undefined) return true;
  return (cpredRoleAbilityRank(data, registry, CPRED_TEAMWORK_ABILITY) ?? 0) >= need;
}

/** Perks this rank has already unlocked, lowest first. */
export function cpredTeamworkPerks(rank: number): CpredTeamworkPerk[] {
  const value = Math.max(0, Math.round(rank));
  return CPRED_TEAMWORK_PERKS.filter((perk) => perk.level <= value);
}

export const CPRED_TEAM_PROFESSION_IDS = [
  'bodyguard',
  'agent',
  'driver',
  'netrunner',
  'techie',
] as const;
export type CpredTeamProfessionId = (typeof CPRED_TEAM_PROFESSION_IDS)[number];

/**
 * One row of a profession's 1k6 table.
 *
 * Nine numbers, not ten: the tables print INT, REF, ZW, TECH, CHA, SW, RUCH, BC
 * and EMP, and **no Szczęście**. That is not an omission to paper over — an
 * employee is not a Player Character, and Luck is the stat that says otherwise.
 * The generated sheet gets 0, which is what „only Player Characters spend
 * Luck" has meant in this project since the statist of 16b.
 */
export interface CpredTeamStatRow {
  int: number;
  ref: number;
  dex: number;
  tech: number;
  cool: number;
  will: number;
  move: number;
  body: number;
  emp: number;
}

/**
 * A profession HR can hire for (s. 155–157).
 *
 * The skill packages are stored as `skillId → level` because that is what a
 * sheet stores; the rulebook's three bands (Skills at +2 / +4 / +6) are a
 * printing convenience, and preserving them here would mean every reader of the
 * data flattening them again.
 *
 * Two names in every package are not skills but *named* skills: „Język (Slang
 * uliczny)" and „Wiedza lokalna (Twój dom)". The first goes where 25b put every
 * language — `lifepath.language`, next to the Culture of Origin — and the
 * second into `skillSpecialties`, which is exactly the map that exists for
 * Skills that make you name a field.
 */
export interface CpredTeamProfession {
  id: CpredTeamProfessionId;
  name: string;
  /** The job on paper — what the payroll says. */
  cover: string;
  /** The job in fact — paraphrased (G37). */
  duty: string;
  /** Six rows; index 0 is a roll of 1. */
  rows: readonly CpredTeamStatRow[];
  /** The +2/+4/+6 packages, merged. */
  skills: Readonly<Record<string, number>>;
  /** Skills the rulebook names a field for. */
  skillSpecialties: Readonly<Record<string, string>>;
  /** The language of the „Język (…)" entry, or null when the package has none. */
  language: string | null;
  /**
   * Special Ability the package hands out, by **name** — the Corporate
   * Netrunner's package opens with the Netrunner's Interfejs, which is a Role,
   * not a skill. Null for the other four.
   */
  ability: { name: string; rank: number } | null;
  /**
   * The deck out of the Netrunner's gear list — the one piece
   * of gear a sheet cannot do without, because `netrun:*` refuses a character
   * with no deck. Null for the other four.
   */
  cyberdeck: CpredTeamCyberdeck | null;
  /** Implants — prose, and see `cpredTeamMemberPatch` for why. */
  cyberware: string;
  /** Gear minus the armour, the pistol and the deck, which become real rows. */
  gear: string;
  page: number;
}

/**
 * A package's deck as printed: a slot count and Programs by **name**.
 *
 * The Programs' numbers stay in the compendium — a copy here would stop
 * agreeing with the catalogue the first time the GM edited a row — and reach
 * the sheet only at hiring, copied the way every other row is.
 */
export interface CpredTeamCyberdeck {
  /** Catalogue name of the deck, found by name like the pistol. */
  name: string;
  /** Seven — the printed number, not the catalogue row's. */
  slots: number;
  programs: readonly string[];
}

/** Shared by all five packages: a light armorjack, SP 11. */
export const CPRED_TEAM_ARMOR = { name: 'Lekka kurtka kuloodporna', sp: 11 } as const;
/** And a very heavy pistol with fifty basic rounds. */
export const CPRED_TEAM_WEAPON = {
  name: 'Bardzo ciężki pistolet',
  damage: '4k6',
  magazine: 8,
} as const;
/** The team's armour ceiling is the armour HR issues (s. 154). */
export const CPRED_TEAM_ARMOR_SP_MAX = CPRED_TEAM_ARMOR.sp;

export const CPRED_TEAM_PROFESSIONS: readonly CpredTeamProfession[] = [
  {
    id: 'bodyguard',
    name: 'Firmowy ochroniarz',
    cover: 'Osoba towarzysząca, osobisty trener',
    duty: 'Osłania Korpo przed każdym zagrożeniem.',
    rows: [
      { int: 3, ref: 7, dex: 7, tech: 4, cool: 7, will: 6, move: 4, body: 8, emp: 4 },
      { int: 5, ref: 8, dex: 6, tech: 2, cool: 7, will: 8, move: 4, body: 8, emp: 2 },
      { int: 4, ref: 8, dex: 5, tech: 3, cool: 7, will: 8, move: 6, body: 6, emp: 3 },
      { int: 4, ref: 7, dex: 8, tech: 4, cool: 7, will: 7, move: 4, body: 7, emp: 2 },
      { int: 3, ref: 8, dex: 5, tech: 2, cool: 8, will: 7, move: 4, body: 6, emp: 7 },
      { int: 5, ref: 7, dex: 7, tech: 2, cool: 7, will: 6, move: 5, body: 7, emp: 4 },
    ],
    skills: {
      language: 2,
      concentration: 2,
      conversation: 2,
      'human-perception': 2,
      persuasion: 2,
      'first-aid': 2,
      stealth: 2,
      'local-expert': 2,
      education: 2,
      athletics: 4,
      'resist-torture-drugs': 4,
      perception: 4,
      interrogation: 4,
      tactics: 4,
      evasion: 4,
      brawling: 6,
      handgun: 6,
    },
    skillSpecialties: { 'local-expert': 'Twój dom' },
    language: 'Slang uliczny',
    ability: null,
    cyberdeck: null,
    cyberware:
      'Ulepszone przeciwciała, Pancerz podskórny (OB 11), Zestaw cyberaudio, Agent wewnętrzny, ' +
      'Odbiornik lokalizatora',
    gear: 'Agent; zwykła amunicja do B.C. pistoletu ×50',
    page: 155,
  },
  {
    id: 'agent',
    name: 'Korporacyjny tajny agent',
    cover: 'Asystent, stylista',
    duty: 'Załatwia brudne sprawy, żeby nic nie przylgnęło do Korpo.',
    rows: [
      { int: 4, ref: 8, dex: 5, tech: 4, cool: 6, will: 8, move: 5, body: 7, emp: 3 },
      { int: 3, ref: 8, dex: 6, tech: 2, cool: 8, will: 6, move: 6, body: 6, emp: 5 },
      { int: 6, ref: 7, dex: 5, tech: 5, cool: 7, will: 6, move: 3, body: 7, emp: 4 },
      { int: 5, ref: 6, dex: 5, tech: 3, cool: 6, will: 8, move: 7, body: 6, emp: 4 },
      { int: 3, ref: 8, dex: 4, tech: 4, cool: 8, will: 7, move: 4, body: 8, emp: 4 },
      { int: 5, ref: 8, dex: 3, tech: 7, cool: 7, will: 8, move: 3, body: 6, emp: 3 },
    ],
    skills: {
      athletics: 2,
      brawling: 2,
      language: 2,
      concentration: 2,
      conversation: 2,
      perception: 2,
      persuasion: 2,
      'first-aid': 2,
      'local-expert': 2,
      education: 2,
      bureaucracy: 4,
      trading: 4,
      'wardrobe-style': 4,
      'human-perception': 4,
      'pick-lock': 4,
      business: 4,
      bribery: 4,
      evasion: 4,
      streetwise: 4,
      handgun: 6,
      stealth: 6,
    },
    skillSpecialties: { 'local-expert': 'Twój dom' },
    language: 'Slang uliczny',
    ability: null,
    cyberdeck: null,
    cyberware:
      'Cyberoczy (para: widzenie w ciemności/podczerwień/UV, zmiana koloru); cyberręka ' +
      '(dłoń-hak, wysuwana broń dystansowa — b. ciężki pistolet, pokrycie Realskinn)',
    gear: 'Agent; zwykła amunicja do B.C. pistoletu ×50',
    page: 155,
  },
  {
    id: 'driver',
    name: 'Szofer korporacyjny',
    cover: 'Lokaj, osobisty kierowca',
    duty: 'Siedzi za sterami wszystkiego, czym zespół jeździ i lata, i dba o te maszyny.',
    rows: [
      { int: 5, ref: 8, dex: 6, tech: 4, cool: 6, will: 5, move: 6, body: 5, emp: 5 },
      { int: 5, ref: 7, dex: 7, tech: 5, cool: 5, will: 7, move: 4, body: 7, emp: 3 },
      { int: 6, ref: 8, dex: 8, tech: 4, cool: 7, will: 4, move: 5, body: 6, emp: 2 },
      { int: 8, ref: 7, dex: 4, tech: 5, cool: 4, will: 7, move: 5, body: 6, emp: 4 },
      { int: 7, ref: 8, dex: 3, tech: 5, cool: 7, will: 6, move: 4, body: 6, emp: 4 },
      { int: 6, ref: 8, dex: 6, tech: 6, cool: 8, will: 5, move: 3, body: 5, emp: 3 },
    ],
    skills: {
      athletics: 2,
      language: 2,
      concentration: 2,
      conversation: 2,
      'human-perception': 2,
      perception: 2,
      persuasion: 2,
      'first-aid': 2,
      'local-expert': 2,
      education: 2,
      brawling: 4,
      'land-vehicle-tech': 4,
      'sea-vehicle-tech': 4,
      'pilot-air-vehicle': 4,
      stealth: 4,
      tracking: 4,
      evasion: 4,
      endurance: 4,
      'pilot-sea-vehicle': 4,
      handgun: 6,
      driving: 6,
    },
    skillSpecialties: { 'local-expert': 'Twój dom' },
    language: 'Slang uliczny',
    ability: null,
    cyberdeck: null,
    cyberware:
      'Radar/Sonar, Zestaw cyberaudio, Agent wewnętrzny, odbiornik lokalizatora, wykrywacz radaru',
    gear: 'Samochód kompaktowy (ulepszone fotele); zwykła amunicja do B.C. pistoletu ×50',
    page: 156,
  },
  {
    id: 'netrunner',
    name: 'Korporacyjny netrunner',
    cover: 'Informatyk, analityk',
    duty: 'Włamuje się do Sieci i zdobywa informacje.',
    rows: [
      { int: 6, ref: 7, dex: 8, tech: 7, cool: 5, will: 4, move: 5, body: 5, emp: 3 },
      { int: 7, ref: 8, dex: 4, tech: 6, cool: 8, will: 3, move: 4, body: 6, emp: 4 },
      { int: 5, ref: 6, dex: 8, tech: 8, cool: 6, will: 6, move: 4, body: 4, emp: 3 },
      { int: 7, ref: 8, dex: 5, tech: 6, cool: 4, will: 4, move: 6, body: 5, emp: 5 },
      { int: 5, ref: 8, dex: 8, tech: 5, cool: 5, will: 3, move: 6, body: 4, emp: 6 },
      { int: 8, ref: 7, dex: 6, tech: 6, cool: 4, will: 7, move: 4, body: 4, emp: 4 },
    ],
    skills: {
      athletics: 2,
      brawling: 2,
      language: 2,
      concentration: 2,
      conversation: 2,
      'human-perception': 2,
      perception: 2,
      persuasion: 2,
      'first-aid': 2,
      evasion: 2,
      'local-expert': 2,
      handgun: 4,
      cybertech: 4,
      'electronics-security': 4,
      forgery: 4,
      cryptography: 4,
      'basic-tech': 4,
      'library-search': 4,
      stealth: 4,
      education: 4,
    },
    skillSpecialties: { 'local-expert': 'Twój dom' },
    language: 'Slang uliczny',
    // Interfejs at +2 — the one
    // entry in all five packages that is a Role rather than a skill, and the
    // reason a team member had to be a real sheet: a cyberdeck needs one.
    ability: { name: 'Interfejs', rank: 2 },
    // A seven-slot deck with four Programs — the catalogue's
    // seven-slot deck is the ordinary-quality one. Out of `gear` since
    // 13.09.2026: a deck written as prose is a deck `netrun:*` refuses.
    cyberdeck: {
      name: 'Cyberdek (zwykłej jakości)',
      slots: 7,
      programs: ['Miecz', 'Zabójca', 'Robak', 'Pancerz'],
    },
    cyberware:
      'Sprzęg neuralny, Gniazdo czipów, Edytor bólu, Gniazda interfejsu, Cyberoczy z wirtualem',
    gear: 'Agent; zwykła amunicja do B.C. pistoletu ×50',
    page: 156,
  },
  {
    id: 'techie',
    name: 'Technik korporacji',
    cover: 'Informatyk, stażysta',
    duty: 'Utrzymuje sprzęt i broń zespołu na chodzie.',
    rows: [
      { int: 8, ref: 8, dex: 5, tech: 7, cool: 3, will: 4, move: 4, body: 5, emp: 6 },
      { int: 8, ref: 7, dex: 6, tech: 8, cool: 3, will: 5, move: 5, body: 4, emp: 4 },
      { int: 8, ref: 6, dex: 5, tech: 8, cool: 4, will: 3, move: 3, body: 7, emp: 6 },
      { int: 8, ref: 8, dex: 5, tech: 7, cool: 4, will: 4, move: 4, body: 5, emp: 5 },
      { int: 7, ref: 7, dex: 3, tech: 7, cool: 5, will: 3, move: 6, body: 6, emp: 3 },
      { int: 7, ref: 8, dex: 5, tech: 8, cool: 6, will: 3, move: 3, body: 5, emp: 5 },
    ],
    skills: {
      athletics: 2,
      brawling: 2,
      language: 2,
      concentration: 2,
      conversation: 2,
      'human-perception': 2,
      perception: 2,
      persuasion: 2,
      'first-aid': 2,
      stealth: 2,
      evasion: 2,
      'local-expert': 2,
      handgun: 4,
      weaponstech: 4,
      education: 4,
      cybertech: 6,
      'electronics-security': 6,
      'basic-tech': 6,
    },
    skillSpecialties: { 'local-expert': 'Twój dom' },
    language: 'Slang uliczny',
    ability: null,
    cyberdeck: null,
    cyberware:
      'Dłoń z narzędziami, Zestaw cyberaudio, Agent wewnętrzny, wykrywacz podsłuchu, ' +
      'rejestrator dźwięku',
    gear: 'Zwykła amunicja do B.C. pistoletu ×50',
    page: 157,
  },
];

export function cpredTeamProfession(id: string): CpredTeamProfession | null {
  return CPRED_TEAM_PROFESSIONS.find((entry) => entry.id === id) ?? null;
}

/** Stats come from one 1d6 roll on the profession's table (s. 155). */
export function cpredTeamStats(
  profession: CpredTeamProfession,
  roll: number,
): CpredTeamStatRow | null {
  const index = Math.round(roll) - 1;
  return profession.rows[index] ?? null;
}

/** What `cpredTeamCyberdeck` built, and the Programs it had nothing to put in. */
export interface CpredTeamCyberdeckBuild {
  deck: CpredCyberdeck;
  /** No Program of that name in the compendium, or no room left — prose on the sheet. */
  missing: string[];
}

/**
 * The employee's deck as sheet data (13.09.2026).
 *
 * Found **by name**, like the pistol, because the group may re-slug the
 * catalogue; copied with `netProgramProfileOf`, like the sheet does, so the deck
 * HR hands out is the deck a player would have built by hand. What the catalogue
 * does not know is not invented — it comes back in `missing` for the caller to
 * write down. Same for a Program the GM enlarged past the free slots: an
 * overfull deck fails `validateCyberdeck` and would vanish on the next read.
 */
export function cpredTeamCyberdeck(
  spec: CpredTeamCyberdeck,
  entries: readonly CompendiumEntry[],
): CpredTeamCyberdeckBuild {
  const key = (name: string) => name.trim().toLowerCase();
  const deckEntry = entries.find(
    (entry) => entry.category === 'gear' && key(entry.name) === key(spec.name),
  );
  const installed: CpredNetInstallRow[] = [];
  const missing: string[] = [];
  let used = 0;
  spec.programs.forEach((name, index) => {
    const entry = entries.find(
      (candidate): candidate is ProgramEntry =>
        candidate.category === 'program' && key(candidate.name) === key(name),
    );
    const slotCost = entry ? netProgramSlots(entry) : 0;
    if (!entry || used + slotCost > spec.slots) {
      missing.push(name);
      return;
    }
    used += slotCost;
    installed.push({
      id: `team-program-${index + 1}`,
      compendiumId: entry.id,
      name: entry.name,
      notes: '',
      kind: 'program',
      slotCost,
      program: netProgramProfileOf(entry),
    });
  });
  return {
    deck: {
      ...(deckEntry ? { compendiumId: deckEntry.id } : {}),
      name: deckEntry?.name ?? spec.name,
      slots: spec.slots,
      installed,
    },
    missing,
  };
}

// ─────────────────────────── Lojalność (s. 154) ───────────────────────────

/** Starting Loyalty is 1d6 + 1 — and the same die decides whether an order is obeyed. */
export const CPRED_LOYALTY_DIE = 6;
/** Loyalty above 10 drops back to 10 when a session ends. */
export const CPRED_LOYALTY_SESSION_CAP = 10;
/** A replacement starts at Loyalty 1. */
export const CPRED_LOYALTY_REPLACEMENT = 1;
/** And HR charges the Korpo 200 ed for the trouble. */
export const CPRED_LOYALTY_REPLACEMENT_FEE = 200;

/** Bounds the stored number is clamped to; the rule itself has none. */
export const CPRED_LOYALTY_MIN = -30;
export const CPRED_LOYALTY_MAX = 30;

export function cpredStartingLoyalty(roll: number): number {
  return Math.max(1, Math.round(roll)) + 1;
}

/**
 * An order: the GM rolls 1d6 and the employee obeys when the die is **below**
 * their current Loyalty (s. 154).
 *
 * Strictly less, which is why this is a function rather than an inline `<=`
 * somewhere: Loyalty 1 obeys nothing at all, and that asymmetry is the whole
 * point of a fresh replacement starting there.
 */
export function cpredLoyaltyObeys(roll: number, loyalty: number): boolean {
  return Math.round(roll) < Math.round(loyalty);
}

/** Loyalty at 0 or below: the employee is working against the Korpo. */
export function cpredLoyaltyTreacherous(loyalty: number): boolean {
  return Math.round(loyalty) <= 0;
}

/** What the number becomes between sessions. */
export function cpredLoyaltyAfterSession(loyalty: number): number {
  const value = Math.round(loyalty);
  return value > CPRED_LOYALTY_SESSION_CAP ? CPRED_LOYALTY_SESSION_CAP : value;
}

export interface CpredLoyaltyChange {
  id: string;
  value: number;
  text: string;
}

/**
 * The two tables of s. 154, in one list because they are one question: „what
 * did the Korpo just do to this person". A single list also means the panel
 * cannot show a gain where a loss belongs — the sign is the data.
 */
export const CPRED_LOYALTY_CHANGES: readonly CpredLoyaltyChange[] = [
  {
    id: 'compliment',
    value: 1,
    text:
      'Pochwała za dobrą robotę. Pochwały sypane co chwilę w jednym tygodniu przestają ' +
      'działać — Lojalność tej osoby już nie wzrośnie.',
  },
  { id: 'bonus', value: 4, text: 'Nagroda albo premia warta 200 ed lub więcej.' },
  { id: 'backing', value: 4, text: 'Stanięcie po jego stronie w sporze z Górą.' },
  { id: 'cut', value: 6, text: 'Oddanie mu 20% zarobku z ostatniego zlecenia.' },
  {
    id: 'leave',
    value: 6,
    text: 'Urlop na koszt firmy — tę sesję pracownik spędza poza grą.',
  },
  {
    id: 'risk',
    value: 8,
    text: 'Ryzykowanie własną skórą, żeby go ratować.',
  },
  {
    id: 'neglect',
    value: -1,
    text: 'Cała sesja minęła, a jego Lojalność ani drgnęła.',
  },
  { id: 'criticism', value: -2, text: 'Ostra krytyka — jego samego albo tego, co robi.' },
  {
    id: 'silence',
    value: -4,
    text: 'Pominięcie jego udziału w sukcesie albo zapomniane urodziny.',
  },
  { id: 'no-bonus', value: -6, text: 'Obiecana premia nie przyszła.' },
  { id: 'thrown-up', value: -6, text: 'Wystawienie go Górze jako kozła ofiarnego.' },
  { id: 'abandoned', value: -8, text: 'Porzucenie go w trakcie walki.' },
];

export function cpredLoyaltyChange(id: string): CpredLoyaltyChange | null {
  return CPRED_LOYALTY_CHANGES.find((entry) => entry.id === id) ?? null;
}

// ────────────────────── Zespół zapisany na karcie Korpo ──────────────────────

/**
 * One employee, as the **Korpo's** sheet remembers them.
 *
 * On the employer rather than on the employee, and that is the whole design
 * decision of this half of the stage. Loyalty is not a property of a person —
 * it is a property of a working relationship, and the sentence that governs it
 * (the Korpo gives an order, the employee obeys or not) names both sides. Keeping
 * the roster here also makes the cap enforceable in one place: the number of
 * rows is checked against the rank that pays for them.
 *
 * The employee themselves is an ordinary GM-owned `Character` row, which is why
 * only an id lives here: they get hurt, they heal, they roll their skills, and
 * every one of those paths already works on a sheet.
 */
export interface CpredTeamMember {
  characterId: string;
  professionId: string;
  loyalty: number;
  /**
   * The employee's name, copied off their sheet (#74, 03.10.2026). The sheet
   * is the GM's NPC and never travels to the Korpo's player, so without this
   * copy the player's panel could only say „Pracownik". Written at hiring and
   * kept in step by the server when the GM renames the sheet.
   */
  name?: string;
  /**
   * Etap 71e (G25, KOR-13): Lojalność wzrosła w tej sesji. Ustawia każda
   * dodatnia zmiana z tabeli, zdejmuje zamknięcie sesji.
   */
  grew?: true;
  /**
   * Etap 71e (G25): sesja zamknęła się bez wzrostu — propozycja −1 czeka na
   * MG (zastosuj albo pomiń), automatu nie ma.
   */
  neglectDue?: true;
}

/** The longest name a roster row keeps — the same cap a sheet's name has. */
const CPRED_TEAM_NAME_MAX = 64;

export type CpredTeamProblem = 'NO_ABILITY' | 'TEAM_FULL' | 'UNKNOWN_PROFESSION' | 'BAD_VALUE';

export const CPRED_TEAM_PROBLEMS: Record<CpredTeamProblem, string> = {
  NO_ABILITY: 'Ta postać nie ma Zdolności Specjalnej Praca Zespołowa.',
  TEAM_FULL: 'Zespół jest pełny — kolejny pracownik dochodzi dopiero na wyższym poziomie.',
  UNKNOWN_PROFESSION: 'Nie znam takiego zawodu.',
  BAD_VALUE: 'Lojalność poza dopuszczalnym zakresem.',
};

/** Reads the roster off a stored sheet, dropping whatever does not parse. */
export function readCpredTeam(raw: unknown): CpredTeamMember[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const team: CpredTeamMember[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.characterId !== 'string' || row.characterId.length === 0) continue;
    if (typeof row.professionId !== 'string' || cpredTeamProfession(row.professionId) === null) {
      continue;
    }
    // One person cannot be hired twice; a duplicate would give the panel two
    // rows that write the same Loyalty and disagree about it.
    if (seen.has(row.characterId)) continue;
    seen.add(row.characterId);
    const loyalty =
      typeof row.loyalty === 'number' && Number.isFinite(row.loyalty) ? Math.round(row.loyalty) : 1;
    const name = typeof row.name === 'string' ? row.name.trim().slice(0, CPRED_TEAM_NAME_MAX) : '';
    team.push({
      characterId: row.characterId,
      professionId: row.professionId,
      loyalty: Math.min(CPRED_LOYALTY_MAX, Math.max(CPRED_LOYALTY_MIN, loyalty)),
      ...(name.length > 0 ? { name } : {}),
      ...(row.grew === true ? { grew: true as const } : {}),
      ...(row.neglectDue === true ? { neglectDue: true as const } : {}),
    });
  }
  return team.slice(0, CPRED_TEAM_MAX);
}

/**
 * Whether this roster is one the rank can afford — the twin of
 * `cpredSpecialtiesProblem`, and checked in the same place for the same reason:
 * the size of the entitlement depends on a rank an ordinary patch cannot see.
 */
export function cpredTeamProblem(
  team: readonly CpredTeamMember[],
  rank: number | null,
): CpredTeamProblem | null {
  if (team.length === 0) return null;
  if (rank === null) return 'NO_ABILITY';
  if (team.length > cpredTeamSlots(rank)) return 'TEAM_FULL';
  for (const member of team) {
    if (cpredTeamProfession(member.professionId) === null) return 'UNKNOWN_PROFESSION';
    if (member.loyalty < CPRED_LOYALTY_MIN || member.loyalty > CPRED_LOYALTY_MAX)
      return 'BAD_VALUE';
  }
  return null;
}

/** „Ochroniarz · Lojalność 5" — the roster line, for the chat and the log. */
export function describeTeamMember(member: CpredTeamMember): string {
  const profession = cpredTeamProfession(member.professionId);
  return `${profession?.name ?? member.professionId} · Lojalność ${member.loyalty}`;
}

// ───────────────── Wsparcie w drodze: stan trwającej walki ─────────────────

/**
 * A group that has answered the radio and is still on its way.
 *
 * Lives in the combat's `systemState` rather than in a table of its own, and
 * the lifetime is the argument: arrival in 1d6 Rounds measures a
 * distance in a unit that only exists while a fight is running, and a call
 * whose fight has ended is a call nobody is counting any more. Ending the
 * combat drops the column with it, which is exactly right — the officers did
 * not vanish, they simply arrive in the fiction rather than on the tracker.
 *
 * Outside a fight nothing is stored at all: the group is placed the moment the
 * GM says so, because there is no round for them to wait a number of.
 */
export interface CpredBackupPending {
  id: string;
  /** Category on its way (`CpredBackupTier.id`). */
  tierId: string;
  /** Round they step onto the map at. */
  arriveAtRound: number;
  /** Figure that called them — they arrive next to it. */
  callerTokenId: string | null;
  /** Who called, for the chat line and the tracker row. */
  callerName: string;
  /**
   * Two different groups come, and the rulebook does not say which
   * second one, so the VTT does not invent it: the row carries the question
   * until the GM names a category (session decision, 2026-08-29).
   */
  awaitingSecond?: boolean;
}

/** Everything the game system keeps about a running fight. One field, so far. */
export interface CpredCombatState {
  backup: CpredBackupPending[];
}

export const CPRED_EMPTY_COMBAT_STATE: CpredCombatState = { backup: [] };

/** Most groups one fight will track; a radio that never stops is not a rule. */
export const CPRED_BACKUP_PENDING_MAX = 8;

/** Reads the opaque column, repairing whatever it finds. Never throws. */
export function readCpredCombatState(raw: unknown): CpredCombatState {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length === 0) return { backup: [] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { backup: [] };
    }
  }
  if (typeof parsed !== 'object' || parsed === null) return { backup: [] };
  const list = (parsed as Record<string, unknown>).backup;
  if (!Array.isArray(list)) return { backup: [] };
  const backup: CpredBackupPending[] = [];
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || row.id.length === 0) continue;
    if (typeof row.tierId !== 'string' || cpredBackupTier(row.tierId) === null) continue;
    if (typeof row.arriveAtRound !== 'number' || !Number.isFinite(row.arriveAtRound)) continue;
    backup.push({
      id: row.id,
      tierId: row.tierId,
      arriveAtRound: Math.max(1, Math.round(row.arriveAtRound)),
      callerTokenId: typeof row.callerTokenId === 'string' ? row.callerTokenId : null,
      callerName: typeof row.callerName === 'string' ? row.callerName : '',
      ...(row.awaitingSecond === true ? { awaitingSecond: true as const } : {}),
    });
  }
  return { backup: backup.slice(0, CPRED_BACKUP_PENDING_MAX) };
}

/**
 * Groups whose round has come.
 *
 * `>=` rather than `===` on purpose: the GM steps back and forward through the
 * queue, ends a fight and starts another, and a group whose exact round was
 * skipped would wait forever. Anything owed arrives at the first round that is
 * late enough — the same forgiving comparison `cpredTimedExpired` makes.
 */
export function cpredBackupDue(state: CpredCombatState, round: number): CpredBackupPending[] {
  return state.backup.filter((entry) => !entry.awaitingSecond && round >= entry.arriveAtRound);
}

/** „Miejscowe krawężniki ×4 — przybywają w rundzie 7" — the tracker's row. */
export function describeBackupPending(entry: CpredBackupPending): string {
  const tier = cpredBackupTier(entry.tierId);
  if (!tier) return 'Wsparcie w drodze';
  // Samo „kto" — ilu ich jest, niesie `ReinforcementView.count` i maluje to
  // pasek inicjatywy sam (`{row.label} ×{row.count}`). Doklejone tutaj ×N
  // wychodziło w Kolejce jako „Korporacyjne służby bezpieczeństwa ×4 ×4"
  // (znalezione przy oględzinach 30c).
  return tier.name;
}

/* ══════════════════════════════════════════════════════════════════════════ *
 *  Etap 30d — cztery Zdolności, które nie dotykają wymiany ognia
 *
 *  Rocker, Fixer, Nomada i Media zamykają etap 30, a łączy je kształt, którego
 *  poprzednie trzy sesje nie miały: **drabina rang**. Podręcznik drukuje je
 *  ramkami „POZIOMY 1 I 2", „POZIOMY 3 I 4"… aż do dziewiątki, gdzie przestaje
 *  parować — więc szczeblem jest przedział, nie liczba, i stąd `min`/`max`
 *  zamiast wiersza na każdy poziom.
 *
 *  Wszystko, co poniżej, jest czytane **z samej karty**: ranga plus tabela.
 *  Świat (kto jest fanem, kto sprzedaje, kto uwierzy) zostaje przy MG i nigdzie
 *  tu nie wchodzi — dokładnie tak, jak planer ataku zostawia zasięgi mapie.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Wspólny szczebel drabiny: przedział rang plus strona, na której stoi. */
export interface CpredAbilityTier {
  id: string;
  /** Najniższa i najwyższa ranga tego szczebla — „POZIOMY 7 I 8" to 7 i 8. */
  min: number;
  max: number;
  page: number;
}

/** Szczebel, na którym stoi ta ranga; null poniżej pierwszego (ranga 0). */
export function cpredAbilityTierAt<T extends CpredAbilityTier>(
  tiers: readonly T[],
  rank: number,
): T | null {
  return tiers.find((tier) => rank >= tier.min && rank <= tier.max) ?? null;
}

/** Szczeble aż do tej rangi włącznie — cała droga, którą postać przeszła. */
export function cpredAbilityTiersUpTo<T extends CpredAbilityTier>(
  tiers: readonly T[],
  rank: number,
): T[] {
  return tiers.filter((tier) => tier.min <= rank);
}

// ──────────────────── Efekt Charyzmy (Rocker, s. 144–145) ────────────────────

export const CPRED_CHARISMA_ABILITY = 'Efekt Charyzmy';

/**
 * Liczebność publiczności, bo to ona — a nie ranga — ustawia PT: 8 przy
 * jednym słuchaczu, 10 przy grupce do sześciu, 12 przy tłumie (s. 144). Te same
 * trzy progi obsługują oba zastosowania Zdolności.
 */
export const CPRED_CHARISMA_AUDIENCES = ['single', 'small', 'large'] as const;
export type CpredCharismaAudience = (typeof CPRED_CHARISMA_AUDIENCES)[number];

export const CPRED_CHARISMA_DV: Record<CpredCharismaAudience, number> = {
  single: 8,
  small: 10,
  large: 12,
};

export const CPRED_CHARISMA_AUDIENCE_LABELS: Record<CpredCharismaAudience, string> = {
  single: 'Pojedynczy fan',
  small: 'Mała grupa (do 6)',
  large: 'Duża grupa',
};

/**
 * Po co Rocker rzuca. Dwa zastosowania jednej Zdolności, oba tym samym Testem
 * i przeciw tym samym PT, ale o różnych stawkach:
 *
 *  - `fans` — zjednanie sobie ludzi, którzy fanami jeszcze nie są (o ile nie
 *    są wrogo nastawieni); **tylko poza walką**, i tabela rang tu nie rządzi:
 *    nowych fanów robi się na każdym poziomie.
 *  - `favour` — prośba do tych, którzy fanami już są. Tu tabela rozstrzyga, czy
 *    żądanie w ogóle wolno postawić — za duże przepada bez rzutu (s. 144).
 */
export const CPRED_CHARISMA_PURPOSES = ['fans', 'favour'] as const;
export type CpredCharismaPurpose = (typeof CPRED_CHARISMA_PURPOSES)[number];

export const CPRED_CHARISMA_PURPOSE_LABELS: Record<CpredCharismaPurpose, string> = {
  fans: 'Zrób z nich fanów',
  favour: 'Poproś fanów o przysługę',
};

export interface CpredCharismaTier extends CpredAbilityTier {
  /** Największa scena, na którą Rockera jeszcze wpuszczą. */
  venues: string;
  /**
   * Co wolno wyprosić u publiczności tej wielkości. `null` znaczy „takiej
   * publiczności jeszcze nie masz" — jedyny taki wpis w tabeli to duża grupa
   * przy randze 1–2, i to nie jest żart redakcyjny, tylko
   * zasada: żądanie nieadekwatne do poziomu **nie dochodzi do kości**.
   */
  effects: Record<CpredCharismaAudience, string | null>;
}

export const CPRED_CHARISMA_TIERS: readonly CpredCharismaTier[] = [
  {
    id: 'charisma-1-2',
    min: 1,
    max: 2,
    page: 144,
    venues: 'Małe miejscowe kluby',
    effects: {
      single: 'Drobna przysługa od jednego fana — postawi drinka albo obiad, podrzuci autem.',
      small: 'Grupka do 6 osób łapie Rockera na ulicy po autograf, pamiątkę i rozmowę.',
      large: null,
    },
  },
  {
    id: 'charisma-3-4',
    min: 3,
    max: 4,
    page: 144,
    venues: 'Popularne kluby',
    effects: {
      single: 'Przekonany fan zrobi coś większego: zaprosi do łóżka, poleci Rockera, komu trzeba.',
      small:
        'Grupka do 6 osób kręci się przy Rockerze na stałe i zapewnia imprezę: alkohol, prochy.',
      large: 'Wierna publika kupuje płyty, gadżety i wszystko z jego logo.',
    },
  },
  {
    id: 'charisma-5-6',
    min: 5,
    max: 6,
    page: 145,
    venues: 'Duże, ważne kluby',
    effects: {
      single:
        'Fan złamie dla niego prawo po drobnemu (podwędzi coś ze sklepu) albo stanie do bójki.',
      small:
        'Grupka do 6 osób to jego świta: zawsze pod ręką, załatwia, przynosi, spełnia kaprysy.',
      large: 'Fani w całym Mieście i miastach wokół — wierni i gotowi na spore przysługi.',
    },
  },
  {
    id: 'charisma-7-8',
    min: 7,
    max: 8,
    page: 145,
    venues: 'Mniejsze sale koncertowe, lokalny kanał wideo',
    effects: {
      single: 'Fan nadstawi za niego karku i o nic nie zapyta.',
      small: 'Grupka do 6 osób złamie dla niego prawo po drobnemu albo stanie do bójki.',
      large:
        'Fanatycznie wierni: tłuką się z fanami konkurencji, donoszą, co słychać, i stawiają się na każde wezwanie.',
    },
  },
  {
    id: 'charisma-9',
    min: 9,
    max: 9,
    page: 145,
    venues: 'Wielkie sale koncertowe, ogólnokrajowe kanały wideo',
    effects: {
      single: 'Fan pójdzie na poważne przestępstwo — kradzież czegoś cennego, pobicie.',
      small: 'Grupka do 6 osób pójdzie na poważne przestępstwo — kradzież czegoś cennego, pobicie.',
      large: 'Tłum bez własnej woli: wywoła rozruchy, zdemoluje, zabije.',
    },
  },
  {
    id: 'charisma-10',
    min: 10,
    max: 10,
    page: 145,
    venues: 'Wielkie stadiony, kanał wideo na cały świat',
    effects: {
      single: 'Fan odda za niego życie i o nic nie zapyta.',
      small: 'Grupka do 6 osób nadstawi za niego karku — to jego ochrona.',
      large: 'Sekta rozsiana po świecie — prywatne wojsko, które zrobi niemal wszystko.',
    },
  },
];

/** Odmowa tam, gdzie tabela nie daje „dużej grupy" — jedyne takie miejsce. */
export const CPRED_CHARISMA_NO_CROWD =
  'Na tłum fanów jeszcze za wcześnie — tej publiczności Rocker nie ma.';

export function cpredCharismaTierAt(rank: number): CpredCharismaTier | null {
  return cpredAbilityTierAt(CPRED_CHARISMA_TIERS, rank);
}

/**
 * Czego wolno żądać od publiczności tej wielkości przy tej randze — albo null,
 * gdy takiej publiczności Rocker jeszcze nie ma.
 */
export function cpredCharismaEffect(rank: number, audience: CpredCharismaAudience): string | null {
  return cpredCharismaTierAt(rank)?.effects[audience] ?? null;
}

export type CpredCharismaProblem = 'NO_ABILITY' | 'NO_CROWD' | 'BAD_VALUE';

export const CPRED_CHARISMA_PROBLEMS: Record<CpredCharismaProblem, string> = {
  NO_ABILITY: 'Ta postać nie ma Zdolności Specjalnej Efekt Charyzmy.',
  NO_CROWD: CPRED_CHARISMA_NO_CROWD,
  BAD_VALUE: 'Nie ma takiej publiczności ani takiego zastosowania.',
};

/**
 * Czy ten Test w ogóle wolno rzucić. Robienie nowych fanów nie pyta tabeli —
 * pyta o nią tylko prośba, bo tylko ona jest żądaniem, które musi pasować
 * do bieżącej rangi Efektu Charyzmy (s. 144).
 */
export function cpredCharismaProblem(
  rank: number | null,
  audience: unknown,
  purpose: unknown,
): CpredCharismaProblem | null {
  if (rank === null) return 'NO_ABILITY';
  if (!(CPRED_CHARISMA_AUDIENCES as readonly unknown[]).includes(audience)) return 'BAD_VALUE';
  if (!(CPRED_CHARISMA_PURPOSES as readonly unknown[]).includes(purpose)) return 'BAD_VALUE';
  if (
    purpose === 'favour' &&
    cpredCharismaEffect(rank, audience as CpredCharismaAudience) === null
  ) {
    return 'NO_CROWD';
  }
  return null;
}

/** Po odmowie Rocker czeka tydzień, zanim poprosi tych fanów o to samo (s. 144). */
export const CPRED_CHARISMA_REFUSAL_DAYS = 7;

// ────────────────────── Znajomości (Fixer, s. 159–161) ──────────────────────

export const CPRED_OPERATOR_ABILITY = 'Znajomości';

/** Targowanie się to CHA + Handel + ranga Znajomości + 1k10 (s. 159). */
export const CPRED_HAGGLE_SKILL_ID = 'trading';

/**
 * Jeden targ z drabiny. Sześć wierszy, po jednym na szczebel — wolno dobić
 * jednego targu z rangi Fixera **albo niższej**, więc to menu, a nie automat:
 * Fixer rangi 9 wybiera spośród pięciu.
 *
 * `discount` niesie tylko te dwa, które VTT umie policzyć do końca (−10% i −20%
 * przy zakupie). Pozostałe cztery opisują pieniądze, których w tym projekcie
 * nie ma: szóstą sztukę hurtu, ratę za miesiąc, wynagrodzenie Ekipy i zapłatę
 * za Zlecenie. Stoją w menu, bo Fixer wybiera z sześciu — menu z dwoma po cichu
 * przepisałoby Rolę (ta sama decyzja, co przy Ulepszaniu z 30b).
 */
export interface CpredHaggleDeal {
  id: string;
  /** Najniższa ranga Znajomości, która pozwala dobić tego targu. */
  level: number;
  name: string;
  text: string;
  /** Procent zniżki przy zakupie; brak = targ, którego VTT nie liczy. */
  discount?: number;
}

export const CPRED_HAGGLE_DEALS: readonly CpredHaggleDeal[] = [
  {
    id: 'percent10',
    level: 1,
    name: 'Dziesięć procent',
    text: 'Cena przesuwa się o 10% na Twoją korzyść — w górę przy sprzedaży, w dół przy zakupie.',
    discount: 10,
  },
  {
    id: 'sixthFree',
    level: 3,
    name: 'Szósta sztuka gratis',
    text: 'Przy zakupie co najmniej pięciu jednakowych sztuk szósta idzie gratis.',
  },
  {
    id: 'crewRaise',
    level: 5,
    name: 'Podwyżka dla Ekipy',
    text: 'Każdy z Ekipy dostaje od zleceniodawcy 20% więcej.',
  },
  {
    id: 'halfLater',
    level: 7,
    name: 'Pół teraz, pół za miesiąc',
    text:
      'Rzecz Luksusową albo Superluksusową bierzesz za pół ceny, drugą połowę oddajesz po ' +
      'miesiącu. Niespłacona rata zamyka Ci ten targ na dobre, u każdego.',
  },
  {
    id: 'percent20',
    level: 9,
    name: 'Dwadzieścia procent',
    text: 'Cena przesuwa się o 20% na Twoją korzyść — w górę przy sprzedaży, w dół przy zakupie.',
    discount: 20,
  },
  {
    id: 'doublePay',
    level: 10,
    name: 'Podwójna zapłata',
    text: 'Za Niebezpieczne Zlecenie zleceniodawca płaci każdemu z Ekipy dwa razy tyle.',
  },
];

export function cpredHaggleDeal(id: string): CpredHaggleDeal | null {
  return CPRED_HAGGLE_DEALS.find((deal) => deal.id === id) ?? null;
}

/** Targi w zasięgu tej rangi — z jej szczebla i niższych. */
export function cpredHaggleDeals(rank: number): CpredHaggleDeal[] {
  return CPRED_HAGGLE_DEALS.filter((deal) => deal.level <= rank);
}

export interface CpredOperatorTier extends CpredAbilityTier {
  /** Z kim Fixer robi interesy na tym szczeblu. */
  contacts: string;
  /**
   * Najwyższe pasmo cenowe zawsze osiągalne. `null` na szczeblu 5–6, bo ten
   * jeden **nie drukuje pasma**: w jego miejscu stoi Nocny. Pasmo z niższego
   * szczebla wtedy zostaje — patrz `cpredOperatorReach`.
   */
  reach: CostCategory | null;
  /** Zasięg jednym zdaniem (z Nocnym i Nocnym Północnym), sparafrazowany (G37). */
  reachText: string;
  /** Targ, który ten szczebel otwiera — id z `CPRED_HAGGLE_DEALS`. */
  dealId: string;
  /** „Wazeliniarz" — w ile kultur Fixer umie się wtopić. */
  chameleon: string;
}

export const CPRED_OPERATOR_TIERS: readonly CpredOperatorTier[] = [
  {
    id: 'operator-1-2',
    min: 1,
    max: 2,
    page: 160,
    contacts: 'Lokalni liderzy, szefowie gangów, urzędnicy z dzielnicy',
    reach: 'everyday',
    reachText: 'Rzeczy Tanie i Codzienne zdobędziesz zawsze — choćby po kawałku.',
    dealId: 'percent10',
    chameleon: 'Kultury i grupy okolicy, gangi też, znasz na wylot.',
  },
  {
    id: 'operator-3-4',
    min: 3,
    max: 4,
    page: 160,
    contacts: 'Szefowie gangów z całego Miasta, drobni politycy, kierownicy średniego szczebla',
    reach: 'expensive',
    reachText: 'Rzeczy Kosztowne i tańsze zdobędziesz zawsze.',
    dealId: 'sixthFree',
    chameleon:
      'Wtapiasz się w jeszcze jedną kulturę; jej język wpisz jako Umiejętność na poziomie 4.',
  },
  {
    id: 'operator-5-6',
    min: 5,
    max: 6,
    page: 160,
    contacts: 'Grube ryby Miasta: radni, lokalne gwiazdy',
    reach: null,
    reachText:
      'Co miesiąc z Fixerami Twojej rangi stawiasz Nocny — tam jest towar z każdego pasma ' +
      'cenowego (s. 338).',
    dealId: 'crewRaise',
    chameleon: 'Wtapiasz się w dwie kultury więcej (razem trzy); ich języki wpisz na poziomie 4.',
  },
  {
    id: 'operator-7-8',
    min: 7,
    max: 8,
    page: 161,
    contacts: 'Dyrektorzy miejscowych Korporacji, władze Miasta, znane gwiazdy',
    reach: 'veryExpensive',
    reachText: 'Rzeczy Bardzo kosztowne i tańsze zdobędziesz zawsze.',
    dealId: 'halfLater',
    chameleon: 'Wtapiasz się w trzy kultury więcej (razem cztery); ich języki wpisz na poziomie 4.',
  },
  {
    id: 'operator-9',
    min: 9,
    max: 9,
    page: 161,
    contacts: 'Regionalne kierownictwo Korporacji, politycy stanowi, sławy',
    reach: 'luxury',
    reachText:
      'Rzeczy Luksusowe i tańsze zdobędziesz zawsze. Przy Nocnym zwołasz też Nocny Północny ' +
      '— zjazd bossów półświatka.',
    dealId: 'percent20',
    chameleon: 'Wtapiasz się nie tylko w kultury okolicy, ale i w Korporacje oraz agencje rządowe.',
  },
  {
    id: 'operator-10',
    min: 10,
    max: 10,
    page: 161,
    contacts: 'Przywódcy światowi, prezesi wielkich Korporacji, gwiazdy znane wszędzie',
    reach: 'superLuxury',
    reachText: 'Rzeczy Superluksusowe i tańsze zdobędziesz zawsze.',
    dealId: 'doublePay',
    chameleon:
      'Wtopisz się niemal wszędzie — także w tajne stowarzyszenia, sekty i kluby „tylko dla członków”.',
  },
];

export function cpredOperatorTierAt(rank: number): CpredOperatorTier | null {
  return cpredAbilityTierAt(CPRED_OPERATOR_TIERS, rank);
}

/** Poziomy Znajomości, na których Wazeliniarz daje nową kulturę (s. 160–161, FAQ). */
export const CPRED_OPERATOR_LANGUAGE_RANKS: readonly number[] = [3, 5, 7];

/**
 * Przypomnienie przy awansie (etap 71g1, G36; FIX-12): Znajomości na 3, 5 albo 7
 * to nowa kultura i jej język na poziomie 4. VTT trzyma jeden wiersz Języka
 * (wiele języków — `POMYSLY.md`), więc automat tylko przypomina; null — awans
 * innej Zdolności albo poziom bez nowej kultury.
 */
export function cpredOperatorLanguageReminder(ability: string, to: number): string | null {
  if (ability !== CPRED_OPERATOR_ABILITY || !CPRED_OPERATOR_LANGUAGE_RANKS.includes(to)) {
    return null;
  }
  return (
    `Znajomości ${to} — Wazeliniarz: nowa kultura i jej język na poziomie 4, inny niż już ` +
    'znane (s. 160–161). Karta ma jeden wiersz Języka — dopisz go w notatkach.'
  );
}

/**
 * Pasmo, do którego Fixer zawsze sięgnie.
 *
 * Szuka **w dół**, bo szczebel 5–6 nie drukuje pasma — w jego miejscu stoi
 * Nocny. Fixer rangi 6 nie sięga więc gorzej niż rangi 4: zatrzymuje pasmo
 * poprzedniego szczebla i dostaje Nocny na dokładkę. Odczyt w drugą stronę
 * („szczebel bez pasma to brak Zasięgu") kazałby awansowi odebrać zdolność, co
 * byłoby jedynym takim miejscem w całym podręczniku.
 */
export function cpredOperatorReach(rank: number): CostCategory | null {
  for (let index = CPRED_OPERATOR_TIERS.length - 1; index >= 0; index -= 1) {
    const tier = CPRED_OPERATOR_TIERS[index]!;
    if (tier.min <= rank && tier.reach !== null) return tier.reach;
  }
  return null;
}

/**
 * Targ dobity i czekający na wykorzystanie — jedna sztuka na karcie, bo
 * jedna transakcja znosi tylko jeden targ (s. 159).
 *
 * Zapisuje go wyłącznie serwer po udanym Targowaniu się (`character:haggle`),
 * a zdejmuje albo zakup, albo ręka Fixera. Ten sam układ, co przy `eddies`
 * z 23b: rzecz, która zmienia cenę, nie może mieć obok siebie drzwi bez rzutu.
 */
export interface CpredHaggleStruck {
  dealId: string;
  /** Procent zniżki przy najbliższym zakupie; 0 dla targów, których VTT nie liczy. */
  discount: number;
  /** Arytmetyka rzutu, dla dymka przy chipie: „19 vs 14". */
  note: string;
  /**
   * Etap 71e (G20): targ dobity przy ladzie tego handlarza — działa tylko
   * u niego. Brak — targ z sumą od MG, działa wszędzie (jak od 30d).
   */
  merchantId?: string;
}

export function readCpredHaggle(raw: unknown): CpredHaggleStruck | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const deal = typeof input.dealId === 'string' ? cpredHaggleDeal(input.dealId) : null;
  if (!deal) return null;
  const discount =
    typeof input.discount === 'number' && Number.isFinite(input.discount)
      ? Math.max(0, Math.min(100, Math.round(input.discount)))
      : (deal.discount ?? 0);
  const merchantId =
    typeof input.merchantId === 'string' &&
    input.merchantId.length > 0 &&
    input.merchantId.length <= 64
      ? input.merchantId
      : undefined;
  return {
    dealId: deal.id,
    discount,
    note: typeof input.note === 'string' ? input.note.slice(0, 120) : '',
    ...(merchantId !== undefined ? { merchantId } : {}),
  };
}

/** Cena po zniżce z dobitego targu — zaokrąglona w górę, na korzyść sprzedawcy. */
export function cpredHaggledPrice(price: number, discount: number): number {
  if (discount <= 0) return price;
  return Math.max(0, Math.ceil((price * (100 - discount)) / 100));
}

export type CpredHaggleProblem = 'NO_ABILITY' | 'UNKNOWN_DEAL' | 'DEAL_ABOVE_RANK' | 'BAD_VALUE';

export const CPRED_HAGGLE_PROBLEMS: Record<CpredHaggleProblem, string> = {
  NO_ABILITY: 'Ta postać nie ma Zdolności Specjalnej Znajomości.',
  UNKNOWN_DEAL: 'Nie ma takiego targu.',
  DEAL_ABOVE_RANK: 'Ten targ jest powyżej poziomu twoich Znajomości.',
  BAD_VALUE: 'Modyfikator drugiej strony jest poza zakresem.',
};

/** Ile wolno wpisać jako „CHA + Handel + Znajomości" drugiej strony. */
export const CPRED_HAGGLE_OPPONENT_MAX = 30;

export function cpredHaggleProblem(
  rank: number | null,
  dealId: unknown,
  opponentBonus: number,
): CpredHaggleProblem | null {
  if (rank === null) return 'NO_ABILITY';
  if (
    !Number.isInteger(opponentBonus) ||
    opponentBonus < 0 ||
    opponentBonus > CPRED_HAGGLE_OPPONENT_MAX
  ) {
    return 'BAD_VALUE';
  }
  if (typeof dealId !== 'string') return 'UNKNOWN_DEAL';
  const deal = cpredHaggleDeal(dealId);
  if (!deal) return 'UNKNOWN_DEAL';
  if (deal.level > rank) return 'DEAL_ABOVE_RANK';
  return null;
}

// ───────────────────────── Moto (Nomada, s. 161–163) ─────────────────────────

export const CPRED_MOTO_ABILITY = 'Moto';

/**
 * Ranga Moto dochodzi do Testów prowadzenia wszystkiego, co jeździ, pływa
 * i lata, oraz do Testów naprawy tych samych trzech rodzajów maszyn (s. 161).
 *
 * Sześć Umiejętności i ani jednej więcej — trzy o prowadzeniu, trzy o naprawie.
 * Bliźniak `CPRED_REPAIR_SKILL_IDS` z 30b i liczony tak samo: **wprost z karty**
 * w planerze rzutu, żeby podgląd klienta i werdykt serwera nie mogły się
 * rozjechać.
 */
export const CPRED_MOTO_SKILL_IDS: readonly string[] = [
  'driving',
  'pilot-sea-vehicle',
  'pilot-air-vehicle',
  'land-vehicle-tech',
  'air-vehicle-tech',
  'sea-vehicle-tech',
];

/** Poziom Moto tej karty, albo 0 — dodatek do sześciu Testów wyżej. */
export function cpredSheetMoto(data: CpredRoleSheet, registry: CpredRegistry): number {
  return cpredRoleAbilityRank(data, registry, CPRED_MOTO_ABILITY) ?? 0;
}

/** Który pojazd Taboru stoi w zasięgu którego poziomu (tabela s. 162). */
export interface CpredFleetTier extends CpredAbilityTier {
  vehicles: string;
}

export const CPRED_MOTO_FLEET: readonly CpredFleetTier[] = [
  {
    id: 'fleet-1-4',
    min: 1,
    max: 4,
    page: 162,
    vehicles: 'Motocykl standardowy, samochód kompaktowy, skuter wodny, żyrokopter',
  },
  {
    id: 'fleet-5-6',
    min: 5,
    max: 6,
    page: 162,
    vehicles: 'Helikopter, samochód sportowy, motorówka',
  },
  { id: 'fleet-7-8', min: 7, max: 8, page: 162, vehicles: 'AV-4, łódź kabinowa, supermotocykl' },
  { id: 'fleet-9-10', min: 9, max: 10, page: 162, vehicles: 'Aerozep, AV-9, supersamochód, jacht' },
];

export function cpredFleetTierAt(rank: number): CpredFleetTier | null {
  return cpredAbilityTierAt(CPRED_MOTO_FLEET, rank);
}

/**
 * Każdy awans Moto daje do wyboru: nowy pojazd w Taborze Rodziny albo
 * ulepszenie jednego z tych, które już w nim są (s. 161) — więc wiersz jest
 * jednego z dwóch rodzajów, a wierszy jest tyle, ile awansów.
 */
export const CPRED_FLEET_KINDS = ['vehicle', 'upgrade'] as const;
export type CpredFleetKind = (typeof CPRED_FLEET_KINDS)[number];

export const CPRED_FLEET_KIND_LABELS: Record<CpredFleetKind, string> = {
  vehicle: 'Pojazd',
  upgrade: 'Ulepszenie',
};

export interface CpredFleetRow {
  id: string;
  kind: CpredFleetKind;
  name: string;
  /** Kategoria wpisu — nie wyższa niż ranga Moto (1…10). */
  level: number;
  notes: string;
  /**
   * Etap 65a: wiersz „Pojazd” wybiera pojazd z katalogu (`compendiumId`), a serwer
   * zakłada mu prawdziwy `Vehicle` i wpisuje jego id (`vehicleId`). Wiersz
   * „Ulepszenie” wskazuje pojazd Taboru (`vehicleId`) i ulepszenie z s. 163–165
   * (`upgradeId`). Bez tych pól wiersz jest tym, czym był w 30d — nazwą.
   */
  compendiumId?: string;
  vehicleId?: string;
  upgradeId?: string;
}

export const CPRED_FLEET_NAME_MAX = 80;
export const CPRED_FLEET_NOTES_MAX = 240;

export type CpredFleetProblem =
  | 'NO_ABILITY'
  | 'TOO_MANY'
  | 'LEVEL_ABOVE_RANK'
  // Etap 71c1 (G38): wybór spoza tabeli s. 162 — odmawia `character:update`.
  | 'NOT_FLEET_VEHICLE';

export const CPRED_FLEET_PROBLEMS: Record<CpredFleetProblem, string> = {
  NO_ABILITY: 'Ta postać nie ma Zdolności Specjalnej Moto.',
  TOO_MANY: 'Tabor ma tyle wpisów, ile masz poziomów Moto — każdy awans to jeden.',
  LEVEL_ABOVE_RANK: 'Ten wpis jest z kategorii wyższej niż twój poziom Moto.',
  NOT_FLEET_VEHICLE: 'Tabor Rodziny to tylko pojazdy z tabeli s. 162 (z progiem Moto).',
};

export function readCpredFleet(raw: unknown): CpredFleetRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: CpredFleetRow[] = [];
  for (const entry of raw.slice(0, CPRED_ROLE_ABILITY_RANK_MAX)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === 'string' && row.id.length > 0 ? row.id : null;
    const name = typeof row.name === 'string' ? row.name.trim().slice(0, CPRED_FLEET_NAME_MAX) : '';
    if (!id || name.length === 0) continue;
    const kind = (CPRED_FLEET_KINDS as readonly unknown[]).includes(row.kind)
      ? (row.kind as CpredFleetKind)
      : 'vehicle';
    const level =
      typeof row.level === 'number' && Number.isFinite(row.level)
        ? Math.max(1, Math.min(CPRED_ROLE_ABILITY_RANK_MAX, Math.round(row.level)))
        : 1;
    const ref = (value: unknown): string | undefined =>
      typeof value === 'string' && value.length > 0 && value.length <= 120 ? value : undefined;
    const compendiumId = kind === 'vehicle' ? ref(row.compendiumId) : undefined;
    const vehicleId = ref(row.vehicleId);
    const upgradeId = kind === 'upgrade' ? ref(row.upgradeId) : undefined;
    rows.push({
      id,
      kind,
      name,
      level,
      notes: typeof row.notes === 'string' ? row.notes.slice(0, CPRED_FLEET_NOTES_MAX) : '',
      ...(compendiumId ? { compendiumId } : {}),
      ...(vehicleId ? { vehicleId } : {}),
      ...(upgradeId ? { upgradeId } : {}),
    });
  }
  return rows;
}

/**
 * Czy taki Tabor da się kupić awansami. Dwa warunki, oba wprost z jednego
 * zdania podręcznika: wpisów najwyżej tyle, ile poziomów, i żaden wpis nie
 * z kategorii wyższej niż poziom. Ta sama umowa, co przy Specjalizacjach z 30b —
 * niezmiennik zamiast historii awansów.
 */
export function cpredFleetProblem(
  rows: readonly CpredFleetRow[],
  rank: number | null,
): CpredFleetProblem | null {
  if (rank === null) return rows.length === 0 ? null : 'NO_ABILITY';
  if (rows.length > rank) return 'TOO_MANY';
  if (rows.some((row) => row.level > rank)) return 'LEVEL_ABOVE_RANK';
  return null;
}

/** Naprawa u Rodziny kosztuje Nomadę 500 ed (s. 162). */
export const CPRED_MOTO_REPAIR_FEE = 500;

/**
 * Na poziomie 10 każde ulepszenie Taboru kosztuje 1000 ed (s. 162).
 * Cennik domowy (etap 47a): ulepszenie to sprzęt, więc ×10; naprawa wyżej to
 * usługa i zostaje jak w podręczniku.
 */
export const CPRED_MOTO_UPGRADE_FEE = 1000 * CPRED_PRICE_SCALE_DURABLE;

/** Poziom, na którym Nomada wchodzi do władz Rodziny i bierze cały Tabor. */
export const CPRED_MOTO_ELDER_LEVEL = 10;

// ───────────────────── Wiarygodność (Media, s. 151–153) ─────────────────────

export const CPRED_CREDIBILITY_ABILITY = 'Wiarygodność';

export interface CpredCredibilityTier extends CpredAbilityTier {
  /** Dostęp — z kim Media umie się skontaktować. */
  access: string;
  /** Zasięg — do ilu odbiorców dociera materiał. */
  audience: string;
  /** Rzetelność — szansa N na 10, że publika da wiarę materiałowi. */
  reliability: number;
  /** Efekt — skala zmian, jakie publikacja powoduje. */
  effect: string;
}

export const CPRED_CREDIBILITY_TIERS: readonly CpredCredibilityTier[] = [
  {
    id: 'credibility-1-2',
    min: 1,
    max: 2,
    page: 152,
    access: 'Przywódcy z sąsiedztwa, szefowie gangów, lokalni urzędnicy',
    audience: 'Tylko najbliższa okolica.',
    reliability: 2,
    effect: 'Drobne zmiany: płotki dostają nauczkę i może trochę się pohamują.',
  },
  {
    id: 'credibility-3-4',
    min: 3,
    max: 4,
    page: 152,
    access:
      'Szefowie gangów z całego Miasta, drobni politycy, kierownicy średniego szczebla, znane twarze z dzielnicy',
    audience: 'Masz rozpoznawalne nazwisko w lokalnym Kanale Aktualności albo Banku Danych.',
    reliability: 3,
    effect: 'Widoczne skutki: drobni gracze półświatka idą siedzieć albo tracą wpływy.',
  },
  {
    id: 'credibility-5-6',
    min: 5,
    max: 6,
    page: 152,
    access: 'Grube ryby Miasta: radni, lokalne gwiazdy',
    audience: 'Czyta i ogląda cię całe Miasto — Kanały Aktualności i TV.',
    reliability: 4,
    effect: 'Miasto się zmienia: grube ryby trafiają za kraty, rada uchwala nowe przepisy.',
  },
  {
    id: 'credibility-7-8',
    min: 7,
    max: 8,
    page: 152,
    access: 'Dyrektorzy miejscowych Korporacji, władze Miasta, znane gwiazdy',
    audience: 'Twoje materiały zna cały stan, a Ty jesteś już trochę gwiazdą.',
    reliability: 5,
    effect: 'Skutki w kilku miastach; średnie Korporacje i urzędy tracą wpływy.',
  },
  {
    id: 'credibility-9',
    min: 9,
    max: 9,
    page: 152,
    access: 'Regionalne kierownictwo Korporacji, politycy stanowi, sławy',
    audience: 'Rozpoznaje cię spora część kraju — z ogólnokrajowego kanału informacyjnego.',
    reliability: 6,
    effect: 'Skutki w całym kraju: upadają wielkie Korporacje albo rząd.',
  },
  {
    id: 'credibility-10',
    min: 10,
    max: 10,
    page: 153,
    access: 'Przywódcy światowi, prezesi wielkich Korporacji, gwiazdy znane wszędzie',
    audience: 'Zna cię cały świat; ważne osoby przychodzą, gdy coś ma wyciec dyskretnie.',
    reliability: 7,
    effect: 'Świat się zmienia: upadają rządy i Megakorporacje, rodzą się prawa międzynarodowe.',
  },
];

export function cpredCredibilityTierAt(rank: number): CpredCredibilityTier | null {
  return cpredAbilityTierAt(CPRED_CREDIBILITY_TIERS, rank);
}

/** Test Rzetelności to jedna k10 i nic więcej (s. 151). */
export const CPRED_RELIABILITY_DIE = 10;

/**
 * Dowody w materiale. Podręcznik drukuje dwie premie, które się sumują: +1 za
 * co najmniej jeden solidny, czytelny dowód i +2 za więcej niż cztery
 * nie do podważenia. Ponieważ materiał z pięcioma
 * niepodważalnymi dowodami ma tym samym ten jeden rzetelny, trzeci stopień
 * niesie sumę obu — i dlatego to jedna lista, a nie dwa niezależne pola.
 */
export const CPRED_PROOF_LEVELS = ['none', 'solid', 'irrefutable'] as const;
export type CpredProofLevel = (typeof CPRED_PROOF_LEVELS)[number];

export const CPRED_PROOF_BONUS: Record<CpredProofLevel, number> = {
  none: 0,
  solid: 1,
  irrefutable: 3,
};

export const CPRED_PROOF_LABELS: Record<CpredProofLevel, string> = {
  none: 'Bez twardych dowodów',
  solid: 'Rzetelny, zrozumiały dowód (+1)',
  irrefutable: 'Ponad 4 niepodważalne dowody (+1 i +2)',
};

/** Szansa „N na 10”, że publika da wiarę — z rangi i z dowodów w materiale. */
export function cpredReliabilityChance(rank: number, proof: CpredProofLevel): number {
  const tier = cpredCredibilityTierAt(rank);
  if (!tier) return 0;
  return Math.max(0, Math.min(CPRED_RELIABILITY_DIE, tier.reliability + CPRED_PROOF_BONUS[proof]));
}

/** „Szansa 2 na 10" znaczy: 1 albo 2 na kości. Przy szansie 10 wierzą zawsze. */
export function cpredAudienceBelieves(roll: number, chance: number): boolean {
  return roll >= 1 && roll <= chance;
}

/**
 * Pogłoski (s. 151). MG co najmniej dwa razy w tygodniu rzuca w ukryciu
 * Wiarygodność + 1k10 — kolumna „Zasłyszane" to progi tego rzutu,
 * kolumna „Aktywne" to PT zwykłego Testu Umiejętności, gdy Media szuka sam
 * (Przeszukiwanie baz danych, Konwersacja, Przesłuchiwanie).
 */
export interface CpredRumourTier {
  id: string;
  name: string;
  description: string;
  /** PT potajemnego rzutu MG. */
  passive: number;
  /** PT Testu Umiejętności, gdy Media szuka aktywnie. */
  active: number;
}

export const CPRED_RUMOUR_TIERS: readonly CpredRumourTier[] = [
  {
    id: 'vague',
    name: 'Mglista pogłoska',
    description: 'Absolutne minimum informacji — tyle, by ruszyć z poszukiwaniem prawdy.',
    passive: 7,
    active: 13,
  },
  {
    id: 'typical',
    name: 'Typowa pogłoska',
    description: 'Wystarczy, żeby śledztwo ruszyło o krok dalej.',
    passive: 9,
    active: 15,
  },
  {
    id: 'confirmed',
    name: 'Sprawdzona pogłoska',
    description: 'Jak typowa, ale z konkretami: nazwiska, miejsca, daty.',
    passive: 11,
    active: 17,
  },
  {
    id: 'detailed',
    name: 'Szczegółowa pogłoska',
    description: 'Zawiera to, co po sprawdzeniu bywa materiałem dowodowym reportażu.',
    passive: 13,
    active: 21,
  },
];

/** Ile razy w tygodniu MG rzuca ten Test — co najmniej dwa. */
export const CPRED_RUMOUR_ROLLS_PER_WEEK = 2;

/**
 * Pogłoska, którą przynosi ten wynik — najwyższy pobity próg.
 *
 * Remis nie zdaje — tabela żąda wyniku ponad PT i tak samo działa ogólna
 * zasada Testu (s. 130–131). Do 30.08 stało tu `>=` na podstawie decyzji MG z 28.08, która
 * cytowała nieistniejące w polskim wydaniu „równy lub wyższy"; poprawione.
 */
export function cpredRumourHeard(total: number): CpredRumourTier | null {
  let best: CpredRumourTier | null = null;
  for (const tier of CPRED_RUMOUR_TIERS) if (total > tier.passive) best = tier;
  return best;
}

/**
 * Czy Tabor Rodziny mieści się w poziomie Moto na tej karcie (etap 30d).
 *
 * Bliźniak `cpredSpecialtiesProblem` i z tego samego powodu: liczba wpisów
 * zależy od rangi, a `applyCharacterPatch` rangi nie widzi — łata może ją
 * podnieść, obniżyć albo nie wspomnieć o niej wcale. Liczy się więc na
 * scalonej karcie, gdzie odpowiedź jest znana.
 */
export function cpredFleetSheetProblem(
  data: CpredRoleSheet & Pick<CpredCharacterData, 'fleet'>,
  registry: CpredRegistry,
): CpredFleetProblem | null {
  return cpredFleetProblem(data.fleet, cpredRoleAbilityRank(data, registry, CPRED_MOTO_ABILITY));
}

/**
 * Zdejmuje z karty sakiewkę Zdolności, której karta już nie ma (etap 30b/30d).
 *
 * MG zmienia `roleId` zwykłą łatą — od 29a to dla niego pole jak każde inne,
 * inaczej niż u gracza, gdzie `character:role-change` odkłada starą Rolę do
 * `formerRoles` i Zdolność zostaje znaleziona. Bez tego odłożenia przydział
 * przeżywa Zdolność, a `cpredSpecialtiesProblem` i `cpredFleetSheetProblem`
 * odrzucają wtedy **każdą** kolejną łatę karty zdaniem „Ta postać nie ma tej
 * Zdolności Specjalnej" — łącznie z tą, która Rolę zmienia. Tak to wyszło przy
 * oględzinach: Medyka z wydanymi punktami Specjalizacji nie dało się zrobić
 * niczym innym, a zdanie odmowy mówiło o Specjalizacji, nie o Roli.
 *
 * Punkty bez Zdolności, która je kupiła, nie są punktami, więc schodzą. Przy
 * wieloklasowości nie schodzi nic: tam Zdolność wciąż się znajduje i żaden
 * z trzech warunków niżej nie jest spełniony.
 */
export function cpredDropOrphanedRolePurses<
  T extends CpredRoleSheet & Pick<CpredCharacterData, 'medicine' | 'fabrication' | 'fleet'>,
>(data: T, registry: CpredRegistry): T {
  const orphaned = (ability: string): boolean =>
    cpredRoleAbilityRank(data, registry, ability) === null;
  const patch: Partial<T> = {};
  if (cpredSpecialtySpent(data.medicine) > 0 && orphaned(CPRED_MEDICINE_ABILITY))
    (patch as { medicine: CpredMedicine }).medicine = {};
  if (cpredSpecialtySpent(data.fabrication) > 0 && orphaned(CPRED_FABRICATION_ABILITY))
    (patch as { fabrication: CpredFabrication }).fabrication = {};
  if (data.fleet.length > 0 && orphaned(CPRED_MOTO_ABILITY))
    (patch as { fleet: CpredFleetRow[] }).fleet = [];
  return Object.keys(patch).length === 0 ? data : { ...data, ...patch };
}
