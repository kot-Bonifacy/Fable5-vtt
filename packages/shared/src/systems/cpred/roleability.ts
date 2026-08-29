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
// Type-only: the price bands of the catalogue are what the Technik's PT/time
// table is indexed by, and a value import would drag the whole compendium in.
import type { CostCategory } from './compendium.js';

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
 *  - „Gdy Technik podnosi poziom zdolności Twórca o jeden, zyskuje po punkcie
 *    w **dwóch różnych**, wybranych przez siebie Specjalizacjach" (s. 147)
 *  - „Gdy Medyk zwiększa poziom zdolności Medycyna, wybiera **jedną** z trzech
 *    Specjalizacji Medycyny […] i przydziela do niej **jeden** punkt" (s. 149)
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
  /** What it does, in the rulebook's own words — the panel's tooltip. */
  description: string;
  /**
   * Ceiling the rulebook prints for this Specialty on top of the rank one
   * („Tej Specjalizacji można przyznać maksimum 5 punktów", s. 150), or the
   * point past which more points buy nothing at all.
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
 * The two conditions below are not an approximation of „po punkcie w dwóch
 * różnych Specjalizacjach przy każdym awansie" — they are exactly equivalent to
 * it. Any allocation whose points sum to at most `perRank × rank` with no
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

/** „Zdolnością Specjalną Technika jest Twórca" (s. 31, s. 147). */
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
      'Dodaj poziom tej Specjalizacji do Testów Podstawowych napraw, Cyberinżynierii, Elektroniki ' +
      'i zabezpieczeń, Naprawy broni albo Naprawy pojazdów, chyba że dany Test wiąże się z inną ' +
      'Specjalizacją Twórcy. Od poziomu 1 możesz też w ramach Akcji zrobić prowizorkę.',
    max: CPRED_ROLE_ABILITY_RANK_MAX,
    page: 147,
  },
  {
    id: 'upgrade',
    name: 'Ulepszanie',
    description:
      'Ulepsza przedmiot na jeden z dziesięciu sposobów z s. 148. Za pomocą tej Specjalizacji dany ' +
      'przedmiot można ulepszyć tylko raz.',
    max: CPRED_ROLE_ABILITY_RANK_MAX,
    page: 148,
  },
  {
    id: 'fabricate',
    name: 'Wytwarzanie',
    description:
      'Pozwala wytworzyć z surowców znany sobie przedmiot. Surowce z kategorii cenowej o jeden ' +
      'niższej niż wytwarzany przedmiot (Superluksusowe: połowa ceny).',
    max: CPRED_ROLE_ABILITY_RANK_MAX,
    page: 148,
  },
  {
    id: 'invent',
    name: 'Wynajdywanie',
    description:
      'Wynajdujesz ulepszenie istniejącego przedmiotu albo coś zupełnie nowego. Najniższa możliwa ' +
      'Kategoria Cenowa wynalazku to Kosztowny.',
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
 * are minted by the importer and stable. „chyba że dany Test wiąże się z inną
 * Specjalizacją Twórcy" is why crafting and inventing are **not** here: those
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
 * in time instead — „1 miesiąc na każde 10 000 ed ceny".
 */
export const CPRED_FABRICATION_TASK: Record<CostCategory, { dv: number; time: string }> = {
  cheap: { dv: 9, time: '1 godzina' },
  everyday: { dv: 9, time: '1 godzina' },
  costly: { dv: 13, time: '6 godzin' },
  premium: { dv: 17, time: '1 dzień' },
  expensive: { dv: 21, time: '1 tydzień' },
  veryExpensive: { dv: 24, time: '2 tygodnie' },
  luxury: { dv: 29, time: '1 miesiąc' },
  superLuxury: { dv: 29, time: '1 miesiąc na każde 10 000 ed ceny' },
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
  data: Pick<CpredCharacterData, 'roleId' | 'roleAbilityRank' | 'fabrication'>,
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

/** „Zdolnością Specjalną Medyka jest Medycyna" (s. 31, s. 149). */
export const CPRED_MEDICINE_ABILITY = 'Medycyna';

export const CPRED_MEDICINE_IDS = ['surgery', 'pharma', 'cryo'] as const;
export type CpredMedicineId = (typeof CPRED_MEDICINE_IDS)[number];

/** One point a level, into one Specialty (s. 149) — half the Technik's purse. */
export const CPRED_MEDICINE_RULES: CpredSpecialtyRules = { perRank: 1, across: 1 };

/**
 * Ceiling the rulebook prints for Farmaceutyki and Obsługa kriosystemów („Tej
 * Specjalizacji można przyznać maksimum 5 punktów", s. 150).
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
      'Za każdy punkt otrzymujesz 2 punkty w Umiejętności Chirurgia (do maksimum 10). Chirurgia ' +
      'leczy najpoważniejsze Rany Krytyczne i wszczepia cyborgizacje; jest dostępna wyłącznie ' +
      'Medykom.',
    max: CPRED_MEDICINE_SPECIALTY_MAX,
    page: 149,
  },
  {
    id: 'pharma',
    name: 'Technologia Medyczna (Farmaceutyki)',
    description:
      'Za każdy punkt 1 punkt w Umiejętności Technologia Medyczna (do maksimum 10) oraz dostęp do ' +
      'jednego z pięciu środków: Antybiotyk, Dynadetoks, Turbo uzdrawiacz, Stym, Zryw.',
    max: CPRED_MEDICINE_SPECIALTY_MAX,
    page: 149,
  },
  {
    id: 'cryo',
    name: 'Technologia Medyczna (Obsługa kriosystemów)',
    description:
      'Za każdy punkt 1 punkt w Umiejętności Technologia Medyczna (do maksimum 10) oraz kolejne ' +
      'kriopompy i kriozbiorniki wg tabeli poziomów z s. 150.',
    max: CPRED_MEDICINE_SPECIALTY_MAX,
    page: 150,
  },
];

export type CpredMedicine = CpredSpecialtyAllocation<CpredMedicineId>;

/** Ceiling of a Skill bought through Medycyna — „do maksimum 10" (s. 149). */
export const CPRED_MEDICINE_SKILL_MAX = 10;

/**
 * The two Skills Medycyna hands out.
 *
 * They are **not** in `skills.json` and must not be: the rulebook's skill list
 * does not print them, because „Ta Umiejętność jest dostępna tylko dla Medyków
 * i tylko poprzez tę Specjalizację" (s. 149). Their level is a function of the
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
  /** „2 punkty w Umiejętności Chirurgia" za punkt, sufit 10 (s. 149). */
  surgerySkill: number;
  /** „równa się sumie punktów Farmaceutyków i Obsługi kriosystemów" (s. 149). */
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
  data: Pick<CpredCharacterData, 'roleId' | 'roleAbilityRank' | 'medicine'>,
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
  data: Pick<CpredCharacterData, 'roleId' | 'roleAbilityRank' | 'medicine'>,
  registry: CpredRegistry,
  skillId: CpredMedicineSkillId,
): number {
  const effects = cpredSheetMedicine(data, registry);
  return skillId === 'medicine.surgery' ? effects.surgerySkill : effects.medtechSkill;
}

/**
 * The five drugs one point of Farmaceutyki each unlocks (s. 150).
 *
 * Printed here and shown by the panel, but nothing in the engine reads them:
 * producing and administering a dose needs a consumable the sheet does not
 * model (gear rows are free text), so the doses stay the GM's to hand out.
 * Recorded in `decyzje-i-uproszczenia.md` rather than left as a silent gap.
 */
export const CPRED_PHARMACEUTICALS: readonly { name: string; effect: string }[] = [
  {
    name: 'Antybiotyk',
    effect:
      'Osoba, która rozpoczęła naturalny powrót do zdrowia, przez tydzień odzyskuje codziennie ' +
      'dodatkowe 2 PW. Efekty kilku antybiotyków nie kumulują się.',
  },
  {
    name: 'Dynadetoks',
    effect: 'Organizm błyskawicznie oczyszcza się z narkotyków, trucizn i alkoholu.',
  },
  {
    name: 'Turbo uzdrawiacz',
    effect:
      'O ile cel nie jest Śmiertelnie Ranny, natychmiast leczy PW równe sumie BUDOWY CIAŁA ' +
      'i SIŁY WOLI. Skuteczny raz dziennie.',
  },
  {
    name: 'Stym',
    effect: 'Przez godzinę cel ignoruje kary za bycie Poważnie Rannym. Skuteczny raz dziennie.',
  },
  {
    name: 'Zryw',
    effect: 'Cel przez 24 godziny funkcjonuje w pełni sprawnie bez snu. Skuteczny raz na tydzień.',
  },
];

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
  data: Pick<CpredCharacterData, 'roleId' | 'roleAbilityRank' | 'medicine' | 'fabrication'>,
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
  /** The rulebook's own sentence — what the table plays out. */
  text: string;
  /** Rows this may be put on; `vehicle` has nowhere to land yet (no vehicles). */
  targets: readonly CpredUpgradeTarget[];
  /**
   * The one arithmetic effect the VTT can honour by itself: +1 OB. Everything
   * else on this list needs machinery the VTT does not have — attachment slots
   * (stage 31), weapon quality (which nothing reads), repair times, vehicles —
   * so it is recorded on the row and played at the table. Written down in
   * `decyzje-i-uproszczenia.md`, not left as a silent gap.
   */
  effect?: 'armorSp';
}

/**
 * „Ulepsza przedmiot na jeden z poniższych sposobów. Za pomocą tej
 * specjalizacji dany przedmiot można ulepszyć tylko raz" (s. 148).
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
      'Obniżasz Utratę Człowieczeństwa za cyborgizacje niebędące borgizacjami o 1k6, jeśli UC ' +
      'tej cyborgizacji wynosi 2k6 lub więcej.',
    targets: ['cyberware'],
  },
  {
    id: 'slot',
    name: 'Dodatkowe gniazdo',
    text:
      'Zwiększasz o 1 liczbę gniazd przedmiotu na Dodatki, Programy/Ulepszenia sprzętowe, ' +
      'modyfikacje itp. Nowe gniazdo musi być tego samego rodzaju, co gniazda już posiadane.',
    targets: ['weapon', 'gear', 'cyberware'],
  },
  {
    id: 'fastRepair',
    name: 'Szybsza naprawa',
    text: 'Przeprojektowujesz przedmiot, dzięki czemu w przyszłości można go naprawić dwa razy szybciej.',
    targets: ['weapon', 'armor', 'gear'],
  },
  {
    id: 'concealable',
    name: 'Broń do ukrycia',
    text: 'Przebudowujesz jednoręczną broń, której standardowo nie da się ukryć, tak, że można ją ukryć.',
    targets: ['weapon'],
  },
  {
    id: 'excellent',
    name: 'Jakość Doskonała',
    text: 'Podnosisz jakość broni ze Zwykłej na Doskonałą.',
    targets: ['weapon'],
  },
  {
    id: 'exoticSlot',
    name: 'Gniazdo w broni egzotycznej',
    text: 'Dodajesz gniazdo dodatku do broni egzotycznej.',
    targets: ['weapon'],
  },
  {
    id: 'exoticAmmo',
    name: 'Amunicja niestandardowa',
    text:
      'Przebudowujesz broń egzotyczną tak, by mogła strzelać jednym, określonym rodzajem ' +
      'amunicji niestandardowej, tego samego typu, co amunicja standardowo w niej stosowana.',
    targets: ['weapon'],
  },
  {
    id: 'armorSp',
    name: '+1 OB',
    text: 'Zwiększasz OB przedmiotu o 1, ale tylko jeśli przedmiot ma jakąś OB.',
    targets: ['armor'],
    effect: 'armorSp',
  },
  {
    id: 'vehicleMod',
    name: 'Ulepszenie pojazdu',
    text: 'Dodajesz do pojazdu ulepszenie, które wymaga Zdolności Specjalnej Nomady na poziomie 1.',
    targets: ['vehicle'],
  },
  {
    id: 'invention',
    name: 'Montaż wynalazku',
    text:
      'Montujesz ulepszenie wynalezione za pomocą Specjalizacji Wynajdywanie. Wymaga surowców ' +
      'w Kategorii Cenowej ustalonej przez MG, gdy przedmiot był wynajdywany.',
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
 * „Prowizorka" (s. 147): how long a field repair holds.
 *
 * „Prowizorka działa przez 10 minut na poziom tej Specjalizacji" — sixty rounds
 * a level, which is longer than any fight this VTT has ever run. That is why it
 * carries no round timer: a countdown that can never reach zero is a countdown
 * nobody reads. The row keeps what the piece was worth before, and a button
 * puts it back — the same bargain stage 16h struck for effects outside combat.
 */
export const CPRED_FIELD_REPAIR_MINUTES_PER_LEVEL = 10;

export function cpredFieldRepairMinutes(repairLevel: number): number {
  return Math.max(0, Math.round(repairLevel)) * CPRED_FIELD_REPAIR_MINUTES_PER_LEVEL;
}
