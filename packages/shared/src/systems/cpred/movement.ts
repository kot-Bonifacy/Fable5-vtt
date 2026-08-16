/**
 * CP RED movement (stage 14c) — pure logic, no IO.
 *
 * „Możesz przemieścić się o RUCH × 2 metry" (s. 168). That sentence needs two
 * things the tracker cannot supply on its own:
 *
 *  - **an effective RUCH**, which is the sheet's stat minus what is currently
 *    weighing the character down: heavy armor, Critical Injuries to the legs
 *    and lungs, and being Mortally Wounded. RAW never lets it fall below 1 —
 *    a dying character crawls, they do not become furniture;
 *  - **permission to move at all**, which some statuses simply take away.
 *
 * Every modifier here arrives as *data*: the armor penalty rides on the sheet's
 * armor row (copied from the catalogue, like SP), and an injury's penalty rides
 * on the injury row (copied from the compendium, like `deathSavePenalty` in
 * stage 15). There is deliberately no table of injury names in this file —
 * a GM who types „Zmiażdżona stopa −3" into the compendium gets it enforced.
 */

import type { CpredArmorRow, CpredCriticalInjuryRow } from './character.js';
import { woundMovePenalty, woundStateFromHp, type CpredWoundState } from './rolls.js';

/** Metres one point of RUCH is worth per Move Action (RAW: RUCH × 2). */
export const CPRED_METRES_PER_MOVE_POINT = 2;

/** „RUCH nigdy nie spada poniżej 1" — the floor every modifier stops at. */
export const CPRED_MIN_MOVE = 1;

/**
 * Movement cost multiplier of hard going — swimming, climbing, rubble.
 * RAW: „każdy metr kosztuje 2 metry ruchu".
 */
export const CPRED_HARD_TERRAIN_FACTOR = 2;

/** Everything that can lower RUCH, gathered from one character's sheet. */
export interface CpredMoveInput {
  /** RUCH as printed on the sheet. */
  move: number;
  /** Worn armor; only the equipped pieces weigh anything. */
  armor?: readonly CpredArmorRow[];
  /** Critical Injuries suffered right now. */
  injuries?: readonly CpredCriticalInjuryRow[];
  /** Wound state — Mortally Wounded costs 6 points of RUCH. */
  wound?: CpredWoundState;
  /**
   * Penalties that do not come off the sheet at all (stage 26f).
   *
   * „Maź … redukująca RUCH o 2k6 punktów, dopóki cel … nie opuści bronionego
   * obszaru" (s. 216) is a thing standing on the *token*, not a wound and not a
   * piece of armour, and it is rolled once rather than derived — so the caller
   * hands the finished modifier in, named, and it joins the same list every
   * other penalty appears in.
   */
  extra?: readonly CpredMoveModifier[];
}

/** One line of „skąd ten RUCH" — shown to the GM, never guessed at. */
export interface CpredMoveModifier {
  label: string;
  value: number;
}

export interface CpredMoveBudget {
  /** RUCH after every penalty, floored at 1. */
  move: number;
  /** Metres one Move Action buys: `move × 2`. */
  metresPerMove: number;
  /** What was subtracted, in the order it was applied. */
  modifiers: CpredMoveModifier[];
  /** True when the penalties would have gone below the RAW minimum. */
  floored: boolean;
}

/**
 * The armor penalty of a set of worn pieces.
 *
 * „Kary nie sumują się — liczy się najwyższa" (s. 185): a character in a heavy
 * jacket *and* a helmet is slowed by the worse of the two, not by both. Carried
 * but unworn armor weighs nothing here — it protects nothing either (stage 15).
 */
export function armorMovePenalty(armor: readonly CpredArmorRow[] | undefined): number {
  if (!armor || armor.length === 0) return 0;
  let worst = 0;
  for (const row of armor) {
    if (row.equipped === false) continue;
    const penalty = row.penalty ?? 0;
    if (penalty < worst) worst = penalty;
  }
  return worst;
}

/** Combined RUCH penalty of the Critical Injuries a character carries. */
export function injuryMovePenalty(injuries: readonly CpredCriticalInjuryRow[] | undefined): number {
  if (!injuries || injuries.length === 0) return 0;
  return injuries.reduce((sum, injury) => sum + (injury.movePenalty ?? 0), 0);
}

/**
 * Effective RUCH and the metres it buys. The modifier list exists so the
 * tracker can explain a shrunken budget („Złamana noga −4") instead of quietly
 * refusing a drag the player thought was legal.
 */
export function cpredMoveBudget(input: CpredMoveInput): CpredMoveBudget {
  const modifiers: CpredMoveModifier[] = [];
  const armor = armorMovePenalty(input.armor);
  if (armor !== 0) modifiers.push({ label: 'Pancerz', value: armor });
  const wound = input.wound ? woundMovePenalty(input.wound) : 0;
  if (wound !== 0) modifiers.push({ label: 'Śmiertelnie ranny', value: wound });
  for (const injury of input.injuries ?? []) {
    if (injury.movePenalty) modifiers.push({ label: injury.name, value: injury.movePenalty });
  }
  for (const modifier of input.extra ?? []) {
    if (modifier.value !== 0) modifiers.push(modifier);
  }

  const base = Number.isFinite(input.move) ? Math.round(input.move) : CPRED_MIN_MOVE;
  const raw = base + modifiers.reduce((sum, modifier) => sum + modifier.value, 0);
  const move = Math.max(CPRED_MIN_MOVE, raw);
  return {
    move,
    metresPerMove: move * CPRED_METRES_PER_MOVE_POINT,
    modifiers,
    floored: raw < CPRED_MIN_MOVE,
  };
}

/** The same, taken straight off a sheet's HP so the caller need not classify. */
export function cpredMoveBudgetFromSheet(input: {
  move: number;
  hpCurrent: number;
  hpMax: number;
  armor?: readonly CpredArmorRow[];
  injuries?: readonly CpredCriticalInjuryRow[];
  extra?: readonly CpredMoveModifier[];
}): CpredMoveBudget {
  return cpredMoveBudget({
    move: input.move,
    armor: input.armor,
    injuries: input.injuries,
    ...(input.extra ? { extra: input.extra } : {}),
    wound: woundStateFromHp(input.hpCurrent, input.hpMax),
  });
}

/**
 * Which statuses stop a token walking used to live here (stage 14c). Stage 14d
 * moved that table to `statuses.ts`, where it answers three questions instead of
 * one — movement, Actions and dodges all read the same rows now.
 */

/**
 * Metres of budget one metre of path costs. Hard going doubles it; everything
 * else the rules charge for (jumps, falls) stays the GM's call this stage.
 */
export function cpredTerrainFactor(hard: boolean | undefined): number {
  return hard === true ? CPRED_HARD_TERRAIN_FACTOR : 1;
}
