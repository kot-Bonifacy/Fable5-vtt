/**
 * CP RED damage resolution (stage 15) — pure logic, no IO.
 *
 * The rulebook's procedure, in the order it happens at the table:
 *  1. the attacker rolls damage,
 *  2. the SP of the armor protecting the hit location is subtracted — halved
 *     and rounded up when a blade or a martial art landed the hit (s. 176),
 *  3. an Aimed Shot to the head doubles whatever got through the armor (×3 if
 *     the target already has a cracked skull, s. 188),
 *  4. the remainder comes off Hit Points,
 *  5. armor that let damage through is ablated by 1,
 *  6. two or more sixes on the damage dice inflict a Critical Injury: 5 bonus
 *     damage straight to Hit Points (armor stops none of it, and it ablates
 *     nothing) plus a 2d6 roll on the injury table for that location.
 *
 * The same function runs on the server (authoritative) and in the client's
 * preview, so „ile mi zostanie PW" can never disagree with what happens.
 */

import type { DiceRng } from '../../dice.js';
import type { CpredArmorRow, CpredCriticalInjuryRow } from './character.js';
import {
  criticalInjuryEffect,
  type CriticalInjuryEntry,
  type CriticalInjuryTable,
} from './compendium.js';
import {
  CPRED_HEAD_DAMAGE_MULTIPLIER,
  CPRED_HEAD_DAMAGE_MULTIPLIER_MAX,
  CPRED_HIT_LOCATION_LABELS,
  type ArmorLocation,
  type CpredHitLocation,
} from './locations.js';
import { CPRED_WOUND_LABELS, woundStateFromHp, type CpredWoundState } from './rolls.js';

/** Attack penalty of an Aimed Shot (RAW −8) — shown as a hint, applied in stage 16. */
export const CPRED_AIMED_SHOT_PENALTY = -8;

/** Bonus damage of a Critical Injury: straight to HP, armor stops none of it. */
export const CPRED_CRITICAL_INJURY_BONUS_DAMAGE = 5;

/** SP lost by the protecting armor whenever damage gets through it. */
export const CPRED_ABLATION_PER_HIT = 1;

/** Sixes needed on the damage dice to inflict a Critical Injury. */
export const CPRED_CRITICAL_INJURY_SIXES = 2;

/**
 * Status ids (`data/public/cpred/statuses.json`) the wound states drive. The
 * server keeps exactly these three in sync with HP on every token bound to a
 * sheet; anything else on the token is the GM's manual business.
 */
export const CPRED_WOUND_STATUS_IDS: Record<CpredWoundState, string | null> = {
  healthy: null,
  light: null,
  serious: 'seriously-wounded',
  mortal: 'mortally-wounded',
};

/** All ids this module manages, so the caller can strip the stale ones. */
export const CPRED_MANAGED_WOUND_STATUS_IDS: string[] = Object.values(
  CPRED_WOUND_STATUS_IDS,
).filter((id): id is string => id !== null);

/**
 * Wound statuses a token with these HP should carry. Works for sheetless
 * statists too — the thresholds only ever need current and max HP.
 */
export function woundStatusIds(hpCurrent: number, hpMaxValue: number): string[] {
  const id = CPRED_WOUND_STATUS_IDS[woundStateFromHp(hpCurrent, hpMaxValue)];
  return id ? [id] : [];
}

/** Applies the managed wound statuses onto an existing status list. */
export function applyWoundStatuses(
  statuses: readonly string[],
  hpCurrent: number,
  hpMaxValue: number,
): string[] {
  const kept = statuses.filter((id) => !CPRED_MANAGED_WOUND_STATUS_IDS.includes(id));
  return [...kept, ...woundStatusIds(hpCurrent, hpMaxValue)];
}

export interface CpredDamageInput {
  /** Total rolled on the damage dice. */
  damage: number;
  location: CpredHitLocation;
  /** Current SP of the armor protecting that location (0 = unarmored). */
  armorSp: number;
  hpCurrent: number;
  hpMax: number;
  /** True when two or more damage dice came up 6. */
  criticalInjury?: boolean;
  /** Damage armor cannot stop (thrown targets, injury effects, poison…). */
  ignoreArmor?: boolean;
  /**
   * The hit only meets half the armour, rounding up (s. 176, 178).
   *
   * „Obrażenia zadane każdym rodzajem broni białej ignorują połowę pancerza
   * Broniącego się, zaokrąglając w górę" — and the same sentence is printed
   * again for Sztuki walki (s. 178). Bijatyka is explicitly excluded („Obrażenia
   * zadane Bijatyką nie ignorują połowy pancerza", s. 177) and so is a melee
   * weapon that was *thrown* („rozpatruje się pełną OB pancerza, a nie połowę",
   * s. 177) — which is why this arrives as a flag on the hit rather than as
   * „is this melee?" asked here.
   *
   * Only the *stopping* is halved. Ablation still eats the full SP, because the
   * rulebook's own worked example wears an OB 11 jacket down to 10 while
   * treating it as OB 6 for the hit (s. 176).
   */
  halvesArmor?: boolean;
  /**
   * What a head hit multiplies by, when something has changed it (s. 188).
   *
   * Defaults to the printed ×2. „Pęknięta czaszka" raises it to ×3, and the
   * number is read off the wound the *target* carries — so this is an input,
   * not a constant the engine applies from a table of injury names.
   */
  headMultiplier?: number;
  /**
   * Stopping Power the armor loses when this hit gets through (stage 16g).
   * Defaults to RAW's single point; armour-piercing rounds take two, and rubber
   * ones take none at all („pancerz … nie ulega uszkodzeniu", s. 346).
   */
  ablation?: number;
  /**
   * The hit cannot take a target off their feet: „Jeśli obrażenia … sprawią, że
   * PW celu, który ma więcej niż 1 PW, spadną poniżej 0, zamiast tego cel
   * zostaje na 1 PW" (rubber ammunition, s. 346).
   */
  nonLethal?: boolean;
  /**
   * HP the defender's own training takes off this hit (stage 30a): „Za 2 punkty
   * zmniejsz o 1 pierwsze obrażenia otrzymane w tej Rundzie" (Redukcja obrażeń,
   * s. 146).
   *
   * Applied to what got **through** the armour, not to the dice. The rulebook
   * says „otrzymane obrażenia" here and says „przed uwzględnieniem pancerza"
   * three paragraphs later for Wykrycie słabości — the two phrasings are only
   * worth printing separately if they mean opposite ends of the sum.
   *
   * Whether this hit is the Round's *first* is decided by the caller: the round
   * is state of the fight, not of the sheet (`CpredTurnLedger`).
   */
  damageReduction?: number;
}

export interface CpredDamageOutcome {
  location: CpredHitLocation;
  damageRolled: number;
  /** SP that was subtracted (0 when the damage ignores armor, halved by a blade). */
  armorSp: number;
  /** True when only half the armour counted — the melee rule of s. 176. */
  armorHalved: boolean;
  /** Damage left after armor, the head multiplier and any Damage Reduction. */
  damageThrough: number;
  /** HP that Redukcja obrażeń kept off the target (0 when none applied). */
  damageReduced: number;
  /** True when the head multiplier was applied. */
  doubled: boolean;
  /** The multiplier a head hit used; 1 when none was (`doubled: false`). */
  headMultiplier: number;
  /** Critical Injury bonus damage included in `hpLost` (0 when none). */
  bonusDamage: number;
  /** Total HP actually lost (never more than the HP that were there). */
  hpLost: number;
  hpBefore: number;
  hpAfter: number;
  /** SP of the protecting armor before and after ablation. */
  spBefore: number;
  spAfter: number;
  ablated: boolean;
  /**
   * True when the non-lethal floor caught the target — they would have dropped
   * below 1 HP and did not (stage 16g). Shown on the card, because a target
   * standing at exactly 1 HP after a burst is otherwise unexplainable.
   */
  heldAtOne: boolean;
  woundBefore: CpredWoundState;
  woundAfter: CpredWoundState;
  /** True when the hit scored a Critical Injury (the table roll is separate). */
  criticalInjury: boolean;
}

function clampToRange(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Resolves one hit. Deliberately takes plain numbers rather than a sheet: the
 * same maths serves a linked character, a statist token with its own HP, and
 * the GM's manual "target has SP 7" override.
 */
export function resolveCpredDamage(input: CpredDamageInput): CpredDamageOutcome {
  const damageRolled = Math.max(0, Math.round(input.damage));
  const ignoreArmor = input.ignoreArmor === true;
  const spBefore = Math.max(0, Math.round(input.armorSp));
  // „ignorują połowę pancerza … zaokrąglając w górę" (s. 176): OB 11 stops 6,
  // which is `ceil(11 / 2)` — the half that is *ignored* rounds down, so the
  // half that still protects rounds up. The rulebook's example is exactly this.
  const armorHalved = !ignoreArmor && input.halvesArmor === true && spBefore > 0;
  const armorSp = ignoreArmor ? 0 : armorHalved ? Math.ceil(spBefore / 2) : spBefore;

  const afterArmor = Math.max(0, damageRolled - armorSp);
  const doubled = input.location === 'head' && afterArmor > 0;
  // ×2 unless the target's own skull says otherwise (s. 188). Clamped rather
  // than trusted: the number arrives from a compendium row a GM may retype.
  const headMultiplier = doubled
    ? clampToRange(
        Math.round(input.headMultiplier ?? CPRED_HEAD_DAMAGE_MULTIPLIER),
        CPRED_HEAD_DAMAGE_MULTIPLIER,
        CPRED_HEAD_DAMAGE_MULTIPLIER_MAX,
      )
    : 1;
  const multiplied = doubled ? afterArmor * headMultiplier : afterArmor;
  // Applied last, and only to damage that actually arrived: a Solo who takes
  // nothing has nothing to reduce, and the armour has already done its work.
  const reduction = Math.max(0, Math.round(input.damageReduction ?? 0));
  const damageReduced = Math.min(reduction, multiplied);
  const damageThrough = multiplied - damageReduced;

  const criticalInjury = input.criticalInjury === true;
  const bonusDamage = criticalInjury ? CPRED_CRITICAL_INJURY_BONUS_DAMAGE : 0;

  const hpBefore = Math.round(input.hpCurrent);
  const hpMaxValue = Math.max(1, Math.round(input.hpMax));
  // HP floor at 0: „poniżej 1 PW" is Mortally Wounded, and the rules never
  // track how far below zero someone is.
  const raw = clampToRange(hpBefore - damageThrough - bonusDamage, 0, hpMaxValue);
  // Rubber ammunition stops one step higher (s. 346). The condition is the
  // rule's own: somebody already down to their last point can still be finished
  // off with a baton round — it is only the *fall* that is cushioned.
  const heldAtOne = input.nonLethal === true && hpBefore > 1 && raw < 1;
  const hpAfter = heldAtOne ? 1 : raw;

  // Only damage that actually made it through the armor damages the armor —
  // and it wears down the *whole* piece, not the half a blade had to beat
  // („pancerz Rico ulega uszkodzeniu, czyli jego OB spada o 1", s. 176: the
  // jacket goes 11 → 10 in the same paragraph that treats it as 6).
  const ablation = Math.max(0, Math.round(input.ablation ?? CPRED_ABLATION_PER_HIT));
  const ablated = !ignoreArmor && spBefore > 0 && afterArmor > 0 && ablation > 0;
  const spAfter = ablated ? Math.max(0, spBefore - ablation) : spBefore;

  return {
    location: input.location,
    damageRolled,
    armorSp,
    armorHalved,
    damageThrough,
    damageReduced,
    doubled,
    headMultiplier,
    bonusDamage,
    hpLost: hpBefore - hpAfter,
    hpBefore,
    hpAfter,
    spBefore,
    spAfter,
    ablated,
    heldAtOne,
    woundBefore: woundStateFromHp(hpBefore, hpMaxValue),
    woundAfter: woundStateFromHp(hpAfter, hpMaxValue),
    criticalInjury,
  };
}

/**
 * The armor piece that protects a location: the highest SP still standing.
 *
 * Takes an `ArmorLocation`, not a hit location, so the sheet's three printed
 * rows (Głowa / Ciało / Tarcza — stage 27b) name the very piece the damage flow
 * would use. A shield is never picked automatically for a hit; it is picked
 * here only because the sheet has a row for it.
 */
export function effectiveArmor(
  armor: readonly CpredArmorRow[],
  location: ArmorLocation,
): CpredArmorRow | null {
  let best: CpredArmorRow | null = null;
  for (const row of armor) {
    if (row.location !== location) continue;
    if (row.equipped === false) continue;
    if (!best || row.spCurrent > best.spCurrent) best = row;
  }
  return best;
}

/** Current SP protecting a location — 0 when nothing is worn there. */
export function effectiveArmorSp(
  armor: readonly CpredArmorRow[],
  location: CpredHitLocation,
): number {
  return effectiveArmor(armor, location)?.spCurrent ?? 0;
}

/** 2d6 outcome distribution helper: the sum of two dice from the given RNG. */
function roll2d6(rng: DiceRng): { total: number; dice: [number, number] } {
  const first = rng(6);
  const second = rng(6);
  return { total: first + second, dice: [first, second] };
}

export interface CriticalInjuryDraw {
  /** The drawn injury; null when the table has no entry for the rolled value. */
  entry: CriticalInjuryEntry | null;
  /** Every 2d6 roll made, including the re-rolls for duplicates. */
  rolls: { total: number; dice: [number, number] }[];
  /** True when the re-rolls ran out — RAW says keep rolling, we give up. */
  exhausted: boolean;
  /**
   * A second wound the same hit inflicted (stage 16g: dumdum rounds, s. 345).
   *
   * „Gdy ta amunicja spowoduje Ranę Krytyczną Ciało obce, cel rzuca ponownie …,
   * dopóki nie wylosuje rany innej niż Ciało obce. Następnie cel otrzymuje
   * **także** tę wylosowaną Ranę Krytyczną" — so the first injury stays and this
   * one joins it. „Nie zadaje ona kolejnych obrażeń dodatkowych": the 5 points
   * of bonus damage are still counted once, which is why this is a separate
   * field rather than a second call.
   */
  extra?: { entry: CriticalInjuryEntry; rolled: number };
}

/** How many times a duplicate injury is re-rolled before we give up. */
export const CRITICAL_INJURY_MAX_ATTEMPTS = 8;

/**
 * Draws a Critical Injury (RAW: 2d6, re-rolling injuries the target already
 * suffers). An empty or incomplete table is not an error — the GM simply has
 * not filled that table in yet (the head table is missing from the free
 * material), and the caller reports „brak wpisu w tabeli" on the chat card.
 */
export function drawCriticalInjury(
  entries: readonly CriticalInjuryEntry[],
  table: CriticalInjuryTable,
  rng: DiceRng,
  existingIds: readonly string[] = [],
  /**
   * Injuries that make the round draw a *second* one (stage 16g: „Ciało obce"
   * hit by a dumdum). Passed as ids rather than a flag because the whole of
   * ammunition is data — the engine must not learn what a foreign body is.
   */
  options: { extraOnIds?: readonly string[] } = {},
): CriticalInjuryDraw {
  const pool = entries.filter((entry) => entry.table === table);
  const rolls: { total: number; dice: [number, number] }[] = [];
  const taken = new Set(existingIds);
  const first = drawOneInjury(pool, rng, rolls, taken);
  if (!first.entry || !options.extraOnIds?.includes(first.entry.id)) return first;

  // The round chewed its way in. RAW keeps rolling until the table gives
  // something other than the wound that triggered it — and both stay.
  taken.add(first.entry.id);
  const second = drawOneInjury(pool, rng, rolls, taken, first.entry.id);
  if (!second.entry) return { ...first, rolls, exhausted: second.exhausted };
  return {
    ...first,
    rolls,
    extra: { entry: second.entry, rolled: rolls[rolls.length - 1]!.total },
  };
}

/**
 * One 2d6 draw with the RAW re-rolls: an injury the target already suffers is
 * rolled again, and so is `forbiddenId` when the caller has one (dumdum).
 * Appends every roll to `rolls`, so the card can show the whole sequence.
 */
function drawOneInjury(
  pool: readonly CriticalInjuryEntry[],
  rng: DiceRng,
  rolls: { total: number; dice: [number, number] }[],
  taken: ReadonlySet<string>,
  forbiddenId?: string,
): CriticalInjuryDraw {
  for (let attempt = 0; attempt < CRITICAL_INJURY_MAX_ATTEMPTS; attempt++) {
    const roll = roll2d6(rng);
    rolls.push(roll);
    const entry = pool.find((candidate) => candidate.roll === roll.total) ?? null;
    if (!entry) return { entry: null, rolls, exhausted: false };
    if (!taken.has(entry.id) && entry.id !== forbiddenId) return { entry, rolls, exhausted: false };
    // Every injury of the table already present — stop instead of looping.
    if (pool.every((candidate) => taken.has(candidate.id) || candidate.id === forbiddenId)) {
      return { entry: null, rolls, exhausted: true };
    }
  }
  return { entry: null, rolls, exhausted: true };
}

/**
 * Where „Złamana noga" sits in the printed table: body, 2k6 = 8 (s. 187).
 *
 * An aimed leg shot inflicts *that* injury by name rather than by a roll, so
 * the engine has to be able to find it. It is looked up by table and roll, not
 * by id or by name: the id is minted from the Polish name at import time and
 * the GM may retype the row, but „ósemka w tabeli korpusu" is the rulebook's
 * own address for it and survives both.
 */
export const CPRED_BROKEN_LEG_TABLE: CriticalInjuryTable = 'body';
export const CPRED_BROKEN_LEG_ROLL = 8;

/** The entry a table holds at one 2d6 value, or null when nobody typed it in. */
export function criticalInjuryAt(
  entries: readonly CriticalInjuryEntry[],
  table: CriticalInjuryTable,
  roll: number,
): CriticalInjuryEntry | null {
  return entries.find((entry) => entry.table === table && entry.roll === roll) ?? null;
}

/** Sheet row created from a drawn injury. */
export function toCriticalInjuryRow(
  entry: CriticalInjuryEntry,
  rolled: number,
): CpredCriticalInjuryRow {
  return {
    id: entry.id,
    name: entry.name,
    effect: criticalInjuryEffect(entry),
    rolled,
    ...(entry.deathSavePenalty ? { deathSavePenalty: entry.deathSavePenalty } : {}),
    // Stage 14c: the injury's RUCH cost travels with the wound, so editing the
    // table later never rewrites a leg that is already broken.
    ...(entry.movePenalty ? { movePenalty: entry.movePenalty } : {}),
    // Stage 14e: so do the machine effects the turn hooks read.
    ...(entry.noActionNextTurn ? { noActionNextTurn: true as const } : {}),
    ...(entry.noMoveAfterRun ? { noMoveAfterRun: true as const } : {}),
    ...(entry.dotAfterRun ? { dotAfterRun: true as const } : {}),
    ...(entry.noDodge ? { noDodge: true as const } : {}),
    ...(entry.actionPenalty ? { actionPenalty: entry.actionPenalty } : {}),
    // Stage 29.08: the two effects a wound has on the *next* hit rather than on
    // its owner's rolls — the skull that turns ×2 into ×3, and the penalty that
    // only bites under a condition no VTT can check for itself.
    ...(entry.headDamageMultiplier ? { headDamageMultiplier: entry.headDamageMultiplier } : {}),
    ...(entry.conditionalPenalty ? { conditionalPenalty: { ...entry.conditionalPenalty } } : {}),
  };
}

/** „Poważnie ranny → Śmiertelnie ranny" for the chat card. */
export function woundTransitionLabel(outcome: CpredDamageOutcome): string | null {
  if (outcome.woundBefore === outcome.woundAfter) return null;
  return `${CPRED_WOUND_LABELS[outcome.woundBefore]} → ${CPRED_WOUND_LABELS[outcome.woundAfter]}`;
}

/** Hit-location label used on cards and buttons ("Głowa"). */
export function hitLocationLabel(location: CpredHitLocation): string {
  return CPRED_HIT_LOCATION_LABELS[location];
}
