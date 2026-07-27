/**
 * CP RED attacks (stage 16) — pure logic, no IO.
 *
 * The rulebook resolves an attack as one roll against a Difficulty Value:
 *
 *  - ranged: REF + weapon skill + 1d10 against a DV read off the range table
 *    for that weapon type and the measured distance (s. 173);
 *  - autofire: REF + „Ogień ciągły" + 1d10 against the *autofire* table, and
 *    the damage is 2d6 multiplied by how far the roll beat the DV, capped per
 *    weapon type (s. 173–174);
 *  - suppressive fire: the attacker's REF + „Ogień ciągły" + 1d10 becomes the
 *    DV every target has to beat with WILL + „Koncentracja" + 1d10 (s. 174);
 *  - melee: DEX + melee skill + 1d10 against the defender's DEX + „Unik" +
 *    1d10 (s. 176).
 *
 * Ties always go to the defender, so a hit needs a total strictly above the DV
 * („W przypadku remisu Broniący zawsze wygrywa", s. 169).
 *
 * Melee — and a ranged attack the defender chooses to dodge — is an opposed
 * roll in the rules, which would mean waiting for a second player before the
 * attack can resolve. Instead the plan carries a *stand-in* DV built from the
 * defender's sheet (DEX + Evasion + `CPRED_PASSIVE_DIE`), and the defender may
 * replace it with a real roll from the chat card afterwards. The maths of the
 * stand-in matches the opposed roll closely: swapping a d10 for its average
 * shifts the odds by a couple of percent, not by a category.
 */

import {
  parseRollNotation,
  type RollBreakdownEntry,
  type RollFormula,
  type RollTerm,
} from '../../dice.js';
import type { CpredCharacterData, CpredRegistry, CpredWeaponRow } from './character.js';
import {
  CPRED_RANGE_BANDS,
  dvForRange,
  rangeBandLabel,
  type AutofireProfile,
  type ResolvedWeapon,
} from './compendium.js';
import { CPRED_AIMED_SHOT_PENALTY } from './damage.js';
import { CPRED_HIT_LOCATION_LABELS, type CpredHitLocation } from './locations.js';
import {
  CPRED_SITUATIONAL_MODIFIER_LIMIT,
  CPRED_WOUND_LABELS,
  woundCheckPenalty,
  woundState,
  type CpredWoundState,
} from './rolls.js';
import { CPRED_STAT_LABELS } from './stats.js';

/** How the attack is being made. Melee follows from the weapon, not from here. */
export const CPRED_ATTACK_MODES = ['single', 'autofire', 'suppressive'] as const;
export type CpredAttackMode = (typeof CPRED_ATTACK_MODES)[number];

export const CPRED_ATTACK_MODE_LABELS: Record<CpredAttackMode, string> = {
  single: 'Pojedynczy strzał',
  autofire: 'Ogień ciągły',
  suppressive: 'Ogień zaporowy',
};

/** Reach of a melee attack — „Atakowany cel musi znajdować się do 2 m od ciebie". */
export const CPRED_MELEE_REACH_M = 2;

/** A burst and a suppressive volley each cost an Action and ten rounds. */
export const CPRED_BURST_AMMO_COST = 10;

/** Everyone visible within this radius has to make the WILL check. */
export const CPRED_SUPPRESSIVE_RANGE_M = 25;

/** Damage of a burst before the multiplier (RAW: always 2d6). */
export const CPRED_AUTOFIRE_DAMAGE = '2k6';

/** Skill ids the combat rules name directly. */
export const CPRED_AUTOFIRE_SKILL_ID = 'autofire';
export const CPRED_EVASION_SKILL_ID = 'evasion';
export const CPRED_CONCENTRATION_SKILL_ID = 'concentration';

/**
 * DV of an unopposed swing at a target with no sheet to dodge with. 13 is the
 * rulebook's „Codzienny" rung of the difficulty ladder (s. 168) — the ordinary
 * difficulty, which is what hitting an ordinary statist is.
 */
export const CPRED_EVERYDAY_DV = 13;

/**
 * The die a stand-in DV substitutes for the defender's 1d10. Half of ten: an
 * average roll, rounded the way the rest of the rules round (down).
 */
export const CPRED_PASSIVE_DIE = 5;

/** Aimed shots are single shots only (RAW: „Strzelając ogniem ciągłym, nie można Celować"). */
export function canAimInMode(mode: CpredAttackMode): boolean {
  return mode === 'single';
}

/**
 * Brawling and martial arts damage, from the attacker's BODY (s. 176). A
 * cyberarm lifts a weak attacker to the 2d6 rung, which the caller passes in
 * as `cyberarm` because cyberware only arrives in stage 23.
 */
export function unarmedDamage(body: number, cyberarm = false): string {
  if (body >= 11) return '4k6';
  if (body >= 7) return '3k6';
  if (body >= 5 || cyberarm) return '2k6';
  return '1k6';
}

/** The range band a distance falls into, or null when it is off the table. */
export function rangeBandFor(metres: number): (typeof CPRED_RANGE_BANDS)[number] | null {
  return CPRED_RANGE_BANDS.find((band) => metres >= band.min && metres <= band.max) ?? null;
}

/** DV of a burst at this distance; null when the autofire table does not reach. */
export function autofireDvForRange(profile: AutofireProfile | undefined, metres: number): number | null {
  if (!profile) return null;
  return dvForRange(profile.rangeDv, metres);
}

/**
 * The burst's damage multiplier: how far the roll beat the DV, never more than
 * the weapon's cap and never less than one (a hit always does its 2d6).
 */
export function autofireMultiplier(margin: number, max: number): number {
  return Math.max(1, Math.min(Math.round(margin), Math.round(max)));
}

/** Stand-in DV of a defender who has a sheet: DEX + Evasion + half a die. */
export function passiveEvasionDv(data: CpredCharacterData, registry: CpredRegistry): number {
  return evasionBase(data, registry) + CPRED_PASSIVE_DIE;
}

/** DEX + Evasion — the defender's side of the opposed roll, without the die. */
export function evasionBase(data: CpredCharacterData, registry: CpredRegistry): number {
  const skill = registry.skills.find((entry) => entry.id === CPRED_EVASION_SKILL_ID);
  const stat = skill ? data.stats[skill.stat] : data.stats.dex;
  return stat + (data.skills[CPRED_EVASION_SKILL_ID] ?? 0);
}

/** What the client asks the server to resolve. Distance is never sent — it is measured. */
export interface CpredAttackRequest {
  /** Weapon row on the attacker's sheet. */
  weaponRowId: string;
  mode: CpredAttackMode;
  /** Skill to roll with, when the weapon row carries no compendium type. */
  skillId?: string;
  /** Aimed shot at the head: −8 to hit, doubled damage through armor. */
  aimed?: boolean;
  modifier?: number;
  luckSpent?: number;
}

/** The target's side, as the server measured and read it. */
export interface CpredAttackTarget {
  name: string;
  /** Whole metres between the two tokens (see `metresForRules`). */
  metres: number;
  /**
   * Stand-in DV from the defender's sheet. Absent for a statist token, which
   * falls back to the everyday DV.
   */
  evasionDv?: number;
}

export type CpredAttackProblem =
  | 'BAD_REQUEST'
  | 'BAD_MODIFIER'
  | 'NOT_ENOUGH_LUCK'
  | 'UNKNOWN_WEAPON'
  | 'UNKNOWN_SKILL'
  | 'BAD_DAMAGE'
  | 'NO_AUTOFIRE'
  | 'NO_SUPPRESSIVE'
  | 'OUT_OF_RANGE'
  | 'MELEE_OUT_OF_REACH'
  | 'RANGED_WEAPON_IN_MELEE'
  | 'NOT_ENOUGH_AMMO';

/** Everything the chat card needs to explain a hit — and to offer the damage roll. */
export interface CpredAttackMeta {
  mode: CpredAttackMode;
  modeLabel: string;
  weaponRowId: string;
  weaponName: string;
  melee: boolean;
  /** Damage notation rolled on a hit; a burst always rolls 2k6. */
  damage: string;
  /** Where the shot is aimed — decides the armor and the ×2 in stage 15. */
  location: CpredHitLocation;
  aimed: boolean;
  targetName: string;
  /** Target token, so „Obrażenia" can pre-select it in stage 15's controls. */
  targetTokenId: string;
  metres: number;
  /** „13–25 m", or null for melee and suppressive fire. */
  rangeLabel: string | null;
  /**
   * DV the roll is measured against; null for suppressive fire, whose DV is
   * the attacker's own total.
   */
  dv: number | null;
  dvSource: 'range' | 'autofire' | 'evasion' | 'everyday' | 'suppressive';
  /** Cap of the burst multiplier, present for `mode: 'autofire'`. */
  autofireMax?: number;
  /** Rounds this attack spends. */
  ammoCost: number;
  ammoBefore: number;
  ammoAfter: number;
}

/** A planned attack: the roll to make, plus everything needed to judge it. */
export interface CpredAttackPlan {
  title: string;
  formula: RollFormula;
  breakdown: RollBreakdownEntry[];
  modifierTotal: number;
  woundState: CpredWoundState;
  luckSpent: number;
  attack: CpredAttackMeta;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/** Weapon types whose damage comes from the attacker's body, not the weapon. */
const UNARMED_TYPE_IDS = new Set(['weapon-type.brawling', 'weapon-type.martial-arts']);

/**
 * Damage notation for one hit: the row's own damage, except for bare hands,
 * whose damage the rules read off the attacker's BODY.
 */
export function attackDamageNotation(
  row: Pick<CpredWeaponRow, 'damage'>,
  stats: Pick<CpredCharacterData['stats'], 'body'>,
  weaponTypeId?: string | null,
): string {
  if (weaponTypeId && UNARMED_TYPE_IDS.has(weaponTypeId)) return unarmedDamage(stats.body);
  return row.damage;
}

/**
 * Validates an attack against the attacker's sheet, the weapon's catalogue
 * entry and the measured distance, then builds the roll and its breakdown.
 * Runs unchanged on the client (preview) and the server (authoritative).
 */
export function planCpredAttack(
  data: CpredCharacterData,
  registry: CpredRegistry,
  request: CpredAttackRequest,
  weapon: {
    row: CpredWeaponRow;
    resolved: ResolvedWeapon | null;
    /** Type id of the row's compendium entry, when it has one. */
    typeId?: string | null;
  },
  target: CpredAttackTarget & { tokenId: string },
): { ok: true; plan: CpredAttackPlan } | { ok: false; error: CpredAttackProblem } {
  if (typeof request !== 'object' || request === null) return { ok: false, error: 'BAD_REQUEST' };
  const mode: CpredAttackMode = (CPRED_ATTACK_MODES as readonly string[]).includes(request.mode)
    ? request.mode
    : 'single';

  const modifier = request.modifier ?? 0;
  if (!isInteger(modifier) || Math.abs(modifier) > CPRED_SITUATIONAL_MODIFIER_LIMIT) {
    return { ok: false, error: 'BAD_MODIFIER' };
  }
  const luckSpent = request.luckSpent ?? 0;
  if (!isInteger(luckSpent) || luckSpent < 0) return { ok: false, error: 'BAD_REQUEST' };
  if (luckSpent > data.luckCurrent) return { ok: false, error: 'NOT_ENOUGH_LUCK' };
  if (!isInteger(target.metres) || target.metres < 0) return { ok: false, error: 'BAD_REQUEST' };

  const { row, resolved } = weapon;
  const melee = resolved?.melee ?? false;

  // Reach and range: the map decides whether this attack is possible at all.
  if (melee && target.metres > CPRED_MELEE_REACH_M) {
    return { ok: false, error: 'MELEE_OUT_OF_REACH' };
  }
  if (!melee && mode !== 'suppressive' && !resolved?.rangeDv) {
    // A ranged weapon with no range table is a hand-typed row; without the
    // table there is no DV to shoot against.
    return { ok: false, error: 'UNKNOWN_WEAPON' };
  }
  if (melee && mode !== 'single') return { ok: false, error: 'BAD_REQUEST' };

  // Fire modes are a property of the weapon type, and both cost ten rounds.
  if (mode === 'autofire' && !resolved?.autofire) return { ok: false, error: 'NO_AUTOFIRE' };
  if (mode === 'suppressive' && resolved?.suppressive !== true) {
    return { ok: false, error: 'NO_SUPPRESSIVE' };
  }

  const ammoCost = attackAmmoCost(mode, row);
  if (ammoCost > 0 && row.ammoCurrent < ammoCost) return { ok: false, error: 'NOT_ENOUGH_AMMO' };

  // Which skill fires this attack: bursts always use „Ogień ciągły", anything
  // else uses the weapon type's skill (the sheet's row may name its own).
  const skillId =
    mode === 'single'
      ? (resolved?.skillId ?? request.skillId ?? null)
      : CPRED_AUTOFIRE_SKILL_ID;
  const skill = skillId ? registry.skills.find((entry) => entry.id === skillId) : undefined;
  if (!skill) return { ok: false, error: 'UNKNOWN_SKILL' };

  const aimed = request.aimed === true && canAimInMode(mode) && !melee;
  const location: CpredHitLocation = aimed ? 'head' : 'body';

  const damage =
    mode === 'autofire'
      ? CPRED_AUTOFIRE_DAMAGE
      : attackDamageNotation(row, data.stats, weapon.typeId);
  if (mode !== 'suppressive') {
    const parsed = parseRollNotation(damage);
    if (!parsed.ok || !parsed.formula.terms.some((term) => term.kind === 'dice')) {
      return { ok: false, error: 'BAD_DAMAGE' };
    }
  }

  const dvResult = attackDv(mode, melee, resolved, target);
  if (dvResult === 'OUT_OF_RANGE') return { ok: false, error: 'OUT_OF_RANGE' };

  // Modifier breakdown, in the order the rules apply it.
  const state = woundState(data.hpCurrent, data.stats);
  const statId = skill.stat;
  const breakdown: RollBreakdownEntry[] = [
    {
      label: `${CPRED_STAT_LABELS[statId].name} (${CPRED_STAT_LABELS[statId].abbr})`,
      value: data.stats[statId],
      kind: 'stat',
    },
    {
      label: (data.skills[skill.id] ?? 0) > 0 ? skill.name : `${skill.name} (nietrenowana)`,
      value: data.skills[skill.id] ?? 0,
      kind: 'skill',
    },
  ];
  const woundPenalty = woundCheckPenalty(state);
  if (woundPenalty !== 0) {
    breakdown.push({ label: CPRED_WOUND_LABELS[state], value: woundPenalty, kind: 'wound' });
  }
  if (aimed) {
    breakdown.push({
      label: `Strzał celowany (${CPRED_HIT_LOCATION_LABELS.head})`,
      value: CPRED_AIMED_SHOT_PENALTY,
      kind: 'situational',
    });
  }
  if (modifier !== 0) {
    breakdown.push({ label: 'Modyfikator sytuacyjny', value: modifier, kind: 'situational' });
  }
  if (luckSpent > 0) {
    breakdown.push({ label: `Szczęście (${luckSpent} pkt)`, value: luckSpent, kind: 'luck' });
  }

  const modifierTotal = breakdown.reduce((sum, entry) => sum + entry.value, 0);
  const terms: RollTerm[] = [{ kind: 'dice', sign: 1, count: 1, sides: 10 }];
  if (modifierTotal !== 0) {
    terms.push({
      kind: 'modifier',
      sign: modifierTotal < 0 ? -1 : 1,
      value: Math.abs(modifierTotal),
    });
  }

  const band = melee || mode === 'suppressive' ? null : rangeBandFor(target.metres);
  const title =
    mode === 'single'
      ? `${row.name} → ${target.name}`
      : `${row.name} → ${CPRED_ATTACK_MODE_LABELS[mode].toLowerCase()}`;

  return {
    ok: true,
    plan: {
      title,
      formula: { terms },
      breakdown,
      modifierTotal,
      woundState: state,
      luckSpent,
      attack: {
        mode,
        modeLabel: CPRED_ATTACK_MODE_LABELS[mode],
        weaponRowId: row.id,
        weaponName: row.name,
        melee,
        damage,
        location,
        aimed,
        targetName: target.name,
        targetTokenId: target.tokenId,
        metres: target.metres,
        rangeLabel: band ? rangeBandLabel(band) : null,
        dv: dvResult.dv,
        dvSource: dvResult.source,
        ...(mode === 'autofire' && resolved?.autofire
          ? { autofireMax: resolved.autofire.max }
          : {}),
        ammoCost,
        ammoBefore: row.ammoCurrent,
        ammoAfter: row.ammoCurrent - ammoCost,
      },
    },
  };
}

/** Rounds an attack spends: one per shot, ten per burst, none if untracked. */
export function attackAmmoCost(
  mode: CpredAttackMode,
  row: Pick<CpredWeaponRow, 'ammoMax'>,
): number {
  if (row.ammoMax <= 0) return 0;
  return mode === 'single' ? 1 : CPRED_BURST_AMMO_COST;
}

type DvResult = { dv: number | null; source: CpredAttackMeta['dvSource'] };

function attackDv(
  mode: CpredAttackMode,
  melee: boolean,
  resolved: ResolvedWeapon | null,
  target: CpredAttackTarget,
): DvResult | 'OUT_OF_RANGE' {
  // The suppressing player's own total becomes the DV their targets face.
  if (mode === 'suppressive') return { dv: null, source: 'suppressive' };
  if (melee) {
    return target.evasionDv !== undefined
      ? { dv: target.evasionDv, source: 'evasion' }
      : { dv: CPRED_EVERYDAY_DV, source: 'everyday' };
  }
  const dv =
    mode === 'autofire'
      ? autofireDvForRange(resolved?.autofire, target.metres)
      : dvForRange(resolved?.rangeDv, target.metres);
  if (dv === null) return 'OUT_OF_RANGE';
  return { dv, source: mode === 'autofire' ? 'autofire' : 'range' };
}

/** Outcome of one attack roll against its DV. */
export interface CpredAttackOutcome {
  hit: boolean;
  /** How far the roll beat the DV; 0 or less on a miss. */
  margin: number;
  /** Burst damage multiplier, present only for autofire hits. */
  multiplier?: number;
}

/**
 * Judges a roll against a DV. Ties go to the defender, so the total has to be
 * strictly higher — the single place that rule is encoded.
 */
export function resolveCpredAttack(
  total: number,
  dv: number,
  autofireMax?: number,
): CpredAttackOutcome {
  const margin = total - dv;
  const hit = margin > 0;
  if (!hit) return { hit, margin };
  return {
    hit,
    margin,
    ...(autofireMax ? { multiplier: autofireMultiplier(margin, autofireMax) } : {}),
  };
}

/** One target's forced WILL check against suppressive fire. */
export interface CpredSuppressionResult {
  tokenId: string;
  name: string;
  metres: number;
  /** The 1d10 rolled for the check. */
  die: number;
  /** WILL + Concentration, without the die. */
  modifier: number;
  total: number;
  /** True when the target held its ground. */
  resisted: boolean;
}

/** WILL + „Koncentracja" of a sheet — the target's side of suppressive fire. */
export function concentrationBase(data: CpredCharacterData, registry: CpredRegistry): number {
  const skill = registry.skills.find((entry) => entry.id === CPRED_CONCENTRATION_SKILL_ID);
  const stat = skill ? data.stats[skill.stat] : data.stats.will;
  return stat + (data.skills[CPRED_CONCENTRATION_SKILL_ID] ?? 0);
}

/** Polish problem messages, shown next to the weapon that could not fire. */
export const CPRED_ATTACK_PROBLEM_MESSAGES: Record<CpredAttackProblem, string> = {
  BAD_REQUEST: 'Nieprawidłowe żądanie ataku.',
  BAD_MODIFIER: `Modyfikator musi mieścić się w zakresie ±${CPRED_SITUATIONAL_MODIFIER_LIMIT}.`,
  NOT_ENOUGH_LUCK: 'Nie masz tylu punktów Szczęścia.',
  UNKNOWN_WEAPON: 'Ta broń nie ma tabeli zasięgów — uzupełnij typ broni w kompendium.',
  UNKNOWN_SKILL: 'Nie wiem, jaką umiejętnością strzelać z tej broni.',
  BAD_DAMAGE: 'Obrażenia broni nie są poprawną notacją kości.',
  NO_AUTOFIRE: 'Ta broń nie ma ognia ciągłego.',
  NO_SUPPRESSIVE: 'Tą bronią nie poprowadzisz ognia zaporowego.',
  OUT_OF_RANGE: 'Cel jest poza zasięgiem tej broni.',
  MELEE_OUT_OF_REACH: `Do ataku wręcz cel musi być nie dalej niż ${CPRED_MELEE_REACH_M} m.`,
  RANGED_WEAPON_IN_MELEE: 'Tej broni nie użyjesz w zwarciu.',
  NOT_ENOUGH_AMMO: 'Za mało amunicji — przeładuj broń.',
};
