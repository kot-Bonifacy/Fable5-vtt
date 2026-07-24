/**
 * CP RED check rolls made from the character sheet (stage 08).
 *
 * Pure logic shared by the client (preview of the modifier), the server (the
 * authoritative roll) and, from stage 19, the bots: given a sheet and a roll
 * request it produces the formula plus a named breakdown of every modifier
 * that went into it.
 */

import type { RollBreakdownEntry, RollFormula, RollTerm } from '../../dice.js';
import type { CpredCharacterData, CpredRegistry } from './character.js';
import { hpMax, seriousWoundThreshold } from './derived.js';
import { CPRED_STAT_LABELS, isCpredStatId, type CpredStatId, type CpredStats } from './stats.js';

/** Wound state, driven purely by current HP (Easy Mode "Progi Rany"). */
export type CpredWoundState = 'healthy' | 'light' | 'serious' | 'mortal';

export const CPRED_WOUND_LABELS: Record<CpredWoundState, string> = {
  healthy: 'Bez ran',
  light: 'Lekko ranny',
  serious: 'Poważnie ranny',
  mortal: 'Śmiertelnie ranny',
};

/**
 * Wound state for the given HP: full HP = unharmed, below max = lightly
 * wounded, at or below half of max = seriously wounded, below 1 = mortally
 * wounded. States replace each other — they never stack.
 */
export function woundState(
  hpCurrent: number,
  stats: Pick<CpredStats, 'body' | 'will'>,
): CpredWoundState {
  if (hpCurrent < 1) return 'mortal';
  if (hpCurrent <= seriousWoundThreshold(stats)) return 'serious';
  if (hpCurrent < hpMax(stats)) return 'light';
  return 'healthy';
}

/** Penalty applied to every check: −2 seriously wounded, −4 mortally wounded. */
export function woundCheckPenalty(state: CpredWoundState): number {
  switch (state) {
    case 'serious':
      return -2;
    case 'mortal':
      return -4;
    default:
      return 0;
  }
}

/** MOVE penalty of the wound state (−6 when mortally wounded). */
export function woundMovePenalty(state: CpredWoundState): number {
  return state === 'mortal' ? -6 : 0;
}

/** MOVE after wound penalties — never drops below 1 (RAW minimum). */
export function effectiveMove(stats: Pick<CpredStats, 'move'>, state: CpredWoundState): number {
  return Math.max(1, stats.move + woundMovePenalty(state));
}

/** Bounds of the ad-hoc situational modifier offered by the roll dialog. */
export const CPRED_SITUATIONAL_MODIFIER_LIMIT = 20;

export type CpredRollTargetKind = 'skill' | 'stat';

/** What the client asks the server to roll from a sheet. */
export interface CpredRollRequest {
  kind: CpredRollTargetKind;
  /** Required for `kind: 'skill'` — an id from the skill registry. */
  skillId?: string;
  /** Required for `kind: 'stat'` — one of the ten CP RED stats. */
  statId?: CpredStatId;
  /** Ad-hoc situational modifier (GM's call), −20…+20. */
  modifier?: number;
  /** Luck points spent from the pool; each adds +1 (declared before the roll). */
  luckSpent?: number;
}

export type CpredRollProblem =
  'BAD_REQUEST' | 'UNKNOWN_SKILL' | 'UNKNOWN_STAT' | 'BAD_MODIFIER' | 'NOT_ENOUGH_LUCK';

/** Everything needed to execute and explain one sheet check. */
export interface CpredCheckPlan {
  /** Chat-card title, e.g. `Percepcja (INT)`. */
  title: string;
  /** `1d10 + <total>` — the flat term is omitted when the total is zero. */
  formula: RollFormula;
  breakdown: RollBreakdownEntry[];
  /** Sum of every breakdown entry — the formula's flat modifier. */
  modifierTotal: number;
  woundState: CpredWoundState;
  /** Luck actually spent (0 when the request omitted it). */
  luckSpent: number;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/**
 * Validates a roll request against the sheet and builds its plan. Rejects
 * unknown skills/stats, out-of-range modifiers and spending more Luck than
 * the character has left — the server calls this before touching the dice.
 */
export function planCpredCheck(
  data: CpredCharacterData,
  registry: CpredRegistry,
  request: CpredRollRequest,
): { ok: true; plan: CpredCheckPlan } | { ok: false; error: CpredRollProblem } {
  if (typeof request !== 'object' || request === null) return { ok: false, error: 'BAD_REQUEST' };

  const modifier = request.modifier ?? 0;
  if (!isInteger(modifier) || Math.abs(modifier) > CPRED_SITUATIONAL_MODIFIER_LIMIT) {
    return { ok: false, error: 'BAD_MODIFIER' };
  }
  const luckSpent = request.luckSpent ?? 0;
  if (!isInteger(luckSpent) || luckSpent < 0) return { ok: false, error: 'BAD_REQUEST' };
  if (luckSpent > data.luckCurrent) return { ok: false, error: 'NOT_ENOUGH_LUCK' };

  const breakdown: RollBreakdownEntry[] = [];
  let title: string;
  let statId: CpredStatId;

  if (request.kind === 'skill') {
    const skill = registry.skills.find((entry) => entry.id === request.skillId);
    if (!skill) return { ok: false, error: 'UNKNOWN_SKILL' };
    statId = skill.stat;
    const level = data.skills[skill.id] ?? 0;
    const statValue = data.stats[statId];
    title = `${skill.name} (${CPRED_STAT_LABELS[statId].abbr})`;
    breakdown.push({
      label: `${CPRED_STAT_LABELS[statId].name} (${CPRED_STAT_LABELS[statId].abbr})`,
      value: statValue,
      kind: 'stat',
    });
    // RAW: an untrained skill simply contributes nothing — the check still
    // happens on the bare stat, and the card says so.
    breakdown.push({
      label: level > 0 ? skill.name : `${skill.name} (nietrenowana)`,
      value: level,
      kind: 'skill',
    });
  } else if (request.kind === 'stat') {
    if (!isCpredStatId(request.statId)) return { ok: false, error: 'UNKNOWN_STAT' };
    statId = request.statId;
    title = `${CPRED_STAT_LABELS[statId].name} (${CPRED_STAT_LABELS[statId].abbr})`;
    breakdown.push({
      label: `${CPRED_STAT_LABELS[statId].name} (${CPRED_STAT_LABELS[statId].abbr})`,
      value: data.stats[statId],
      kind: 'stat',
    });
  } else {
    return { ok: false, error: 'BAD_REQUEST' };
  }

  const state = woundState(data.hpCurrent, data.stats);
  const woundPenalty = woundCheckPenalty(state);
  if (woundPenalty !== 0) {
    breakdown.push({ label: CPRED_WOUND_LABELS[state], value: woundPenalty, kind: 'wound' });
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

  return {
    ok: true,
    plan: {
      title,
      formula: { terms },
      breakdown,
      modifierTotal,
      woundState: state,
      luckSpent,
    },
  };
}
