/**
 * CP RED damage resolution (stage 15) — pure logic, no IO.
 *
 * The rulebook's procedure, in the order it happens at the table:
 *  1. the attacker rolls damage,
 *  2. the SP of the armor protecting the hit location is subtracted,
 *  3. an Aimed Shot to the head doubles whatever got through the armor,
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
import { CPRED_HIT_LOCATION_LABELS, type CpredHitLocation } from './locations.js';
import { CPRED_WOUND_LABELS, woundStateFromHp, type CpredWoundState } from './rolls.js';

/** Attack penalty of an Aimed Shot (RAW −8) — shown as a hint, applied in stage 16. */
export const CPRED_AIMED_SHOT_PENALTY = -8;

/** Damage that gets through armor on a head hit is doubled (RAW). */
export const CPRED_HEAD_DAMAGE_MULTIPLIER = 2;

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
export const CPRED_MANAGED_WOUND_STATUS_IDS: string[] = Object.values(CPRED_WOUND_STATUS_IDS).filter(
  (id): id is string => id !== null,
);

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
}

export interface CpredDamageOutcome {
  location: CpredHitLocation;
  damageRolled: number;
  /** SP that was subtracted (0 when the damage ignores armor). */
  armorSp: number;
  /** Damage left after armor and the head multiplier — what hits HP. */
  damageThrough: number;
  /** True when the head multiplier was applied. */
  doubled: boolean;
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
  const armorSp = ignoreArmor ? 0 : spBefore;

  const afterArmor = Math.max(0, damageRolled - armorSp);
  const doubled = input.location === 'head' && afterArmor > 0;
  const damageThrough = doubled ? afterArmor * CPRED_HEAD_DAMAGE_MULTIPLIER : afterArmor;

  const criticalInjury = input.criticalInjury === true;
  const bonusDamage = criticalInjury ? CPRED_CRITICAL_INJURY_BONUS_DAMAGE : 0;

  const hpBefore = Math.round(input.hpCurrent);
  const hpMaxValue = Math.max(1, Math.round(input.hpMax));
  // HP floor at 0: „poniżej 1 PW" is Mortally Wounded, and the rules never
  // track how far below zero someone is.
  const hpAfter = clampToRange(hpBefore - damageThrough - bonusDamage, 0, hpMaxValue);

  // Only damage that actually made it through the armor damages the armor.
  const ablated = !ignoreArmor && spBefore > 0 && afterArmor > 0;
  const spAfter = ablated ? Math.max(0, spBefore - CPRED_ABLATION_PER_HIT) : spBefore;

  return {
    location: input.location,
    damageRolled,
    armorSp,
    damageThrough,
    doubled,
    bonusDamage,
    hpLost: hpBefore - hpAfter,
    hpBefore,
    hpAfter,
    spBefore,
    spAfter,
    ablated,
    woundBefore: woundStateFromHp(hpBefore, hpMaxValue),
    woundAfter: woundStateFromHp(hpAfter, hpMaxValue),
    criticalInjury,
  };
}

/** The armor piece that protects a location: the highest SP still standing. */
export function effectiveArmor(
  armor: readonly CpredArmorRow[],
  location: CpredHitLocation,
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
): CriticalInjuryDraw {
  const pool = entries.filter((entry) => entry.table === table);
  const rolls: { total: number; dice: [number, number] }[] = [];
  const taken = new Set(existingIds);

  for (let attempt = 0; attempt < CRITICAL_INJURY_MAX_ATTEMPTS; attempt++) {
    const roll = roll2d6(rng);
    rolls.push(roll);
    const entry = pool.find((candidate) => candidate.roll === roll.total) ?? null;
    if (!entry) return { entry: null, rolls, exhausted: false };
    if (!taken.has(entry.id)) return { entry, rolls, exhausted: false };
    // Every injury of the table already present — stop instead of looping.
    if (pool.every((candidate) => taken.has(candidate.id))) {
      return { entry: null, rolls, exhausted: true };
    }
  }
  return { entry: null, rolls, exhausted: true };
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
