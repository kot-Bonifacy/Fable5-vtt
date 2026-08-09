import type { CpredStats } from './stats.js';

/**
 * Derived values of a CP RED character. Pure functions of the stats — the
 * sheet recomputes them on every BODY/WILL/EMP change instead of storing them.
 */

/** Max HP: 10 + 5 × ⌈(BC + SW) / 2⌉. */
export function hpMax(stats: Pick<CpredStats, 'body' | 'will'>): number {
  return 10 + 5 * Math.ceil((stats.body + stats.will) / 2);
}

/**
 * Seriously Wounded threshold: half of max HP, rounded up. At or below this
 * many HP the character takes the wound penalties.
 */
export function seriousWoundThreshold(stats: Pick<CpredStats, 'body' | 'will'>): number {
  return Math.ceil(hpMax(stats) / 2);
}

/** Death Save target: roll under BODY on 1d10 to survive a Mortally Wounded turn. */
export function deathSaveTarget(stats: Pick<CpredStats, 'body'>): number {
  return stats.body;
}

/**
 * Humanity a character starts from: base EMP × 10 (s. 229).
 *
 * The *usable* maximum is lower once there is chrome in the body — that is
 * `humanityMaxWith` in `cyberware.ts`, which subtracts the ceiling penalties.
 * This one stays here because it is a pure function of the stats, and because
 * the cyberware module builds on it rather than replacing it.
 */
export function humanityMax(stats: Pick<CpredStats, 'emp'>): number {
  return stats.emp * 10;
}

/** Skill base ("BAZA" on the sheet): stat value + skill level. */
export function skillBase(statValue: number, level: number): number {
  return statValue + level;
}
