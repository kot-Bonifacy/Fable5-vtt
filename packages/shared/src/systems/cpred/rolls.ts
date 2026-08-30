/**
 * CP RED check rolls made from the character sheet (stage 08).
 *
 * Pure logic shared by the client (preview of the modifier), the server (the
 * authoritative roll) and, from stage 19, the bots: given a sheet and a roll
 * request it produces the formula plus a named breakdown of every modifier
 * that went into it.
 */

import {
  parseRollNotation,
  type RollAreaTarget,
  type RollBreakdownEntry,
  type RollFormula,
  type RollTerm,
} from '../../dice.js';
import {
  cpredSkillLabel,
  injuryDeathSavePenalty,
  type CpredCharacterData,
  type CpredRegistry,
} from './character.js';
import type { CpredAmmoProfile } from './ammo.js';
import { effectiveCpredStats } from './cyberware.js';
import { deathSaveTarget, hpMax } from './derived.js';
import {
  CPRED_HIT_LOCATION_LABELS,
  type CpredAimPoint,
  type CpredHitLocation,
} from './locations.js';
import { CPRED_STAT_LABELS, isCpredStatId, type CpredStatId, type CpredStats } from './stats.js';
import {
  cpredCharismaEffect,
  cpredCharismaProblem,
  cpredMedicineSkillLevel,
  cpredReliabilityChance,
  cpredRoleAbilityRank,
  cpredSheetCombatAwareness,
  cpredSheetFabrication,
  cpredSheetMoto,
  isCpredMedicineSkillId,
  CPRED_CHARISMA_ABILITY,
  CPRED_CHARISMA_AUDIENCE_LABELS,
  CPRED_CHARISMA_DV,
  CPRED_CREDIBILITY_ABILITY,
  CPRED_MEDICINE_SKILLS,
  CPRED_MOTO_SKILL_IDS,
  CPRED_PROOF_LEVELS,
  CPRED_REPAIR_SKILL_IDS,
  type CpredCharismaAudience,
  type CpredCharismaPurpose,
  type CpredProofLevel,
} from './roleability.js';

/**
 * „Za każdy punkt dodaj +1 do Testów Percepcji" (Wyczucie zagrożenia, s. 146).
 * The one skill a Combat Awareness point reaches outside a fight — matched by
 * id, which is the slug the importer writes and stage 13 verified against the
 * rulebook's own list.
 */
export const CPRED_PERCEPTION_SKILL_ID = 'perception';

/** Wound state, driven purely by current HP („Progi Ran", s. 186). */
export type CpredWoundState = 'healthy' | 'light' | 'serious' | 'mortal';

export const CPRED_WOUND_LABELS: Record<CpredWoundState, string> = {
  healthy: 'Bez ran',
  light: 'Lekko ranny',
  serious: 'Poważnie ranny',
  mortal: 'Śmiertelnie ranny',
};

/**
 * Wound state from a bare HP pair: full HP = unharmed, below max = lightly
 * wounded, at or below half of max = seriously wounded, below 1 = mortally
 * wounded. States replace each other — they never stack.
 *
 * Takes the numbers rather than a sheet so statist tokens (stage 05: their own
 * HP, no character) get the same thresholds as player characters.
 */
export function woundStateFromHp(hpCurrent: number, hpMaxValue: number): CpredWoundState {
  if (hpCurrent < 1) return 'mortal';
  if (hpCurrent <= Math.ceil(hpMaxValue / 2)) return 'serious';
  if (hpCurrent < hpMaxValue) return 'light';
  return 'healthy';
}

/** Wound state of a character sheet — the threshold follows from BC and SW. */
export function woundState(
  hpCurrent: number,
  stats: Pick<CpredStats, 'body' | 'will'>,
): CpredWoundState {
  return woundStateFromHp(hpCurrent, hpMax(stats));
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

/**
 * What can be rolled from a sheet: a Skill or Stat Check (stage 08), a weapon's
 * damage or a Death Save (stage 15), or Stabilizing somebody (stage 14b).
 * Only Checks obey the exploding-10 rule — and Stabilizing is one.
 */
export type CpredRollKind =
  | 'skill'
  | 'stat'
  | 'damage'
  | 'deathSave'
  | 'stabilize'
  | 'treatInjury'
  /** Test Efektu Charyzmy — ranga + 1k10 przeciw PT 8/10/12 (stage 30d). */
  | 'charisma'
  /** Test Rzetelności — sama 1k10 pod szansę „N na 10" (stage 30d). */
  | 'reliability'
  /** Potajemny Test Pogłosek MG — Wiarygodność + 1k10 (stage 30d). */
  | 'rumour';

/** Skills the rules name for Stabilizing (s. 222). Either one may be rolled. */
export const CPRED_FIRST_AID_SKILL_ID = 'first-aid';
export const CPRED_PARAMEDIC_SKILL_ID = 'paramedic';

/**
 * „PT ustabilizowania celu (w tym siebie) zależy od aktualnego progu ran"
 * (s. 222). An unhurt target has nothing to stabilize, so it shares the easiest
 * rung rather than getting a rule of its own.
 */
export const CPRED_STABILIZE_DV: Record<CpredWoundState, number> = {
  healthy: 10,
  light: 10,
  serious: 13,
  mortal: 15,
};

/** What the client asks the server to roll from a sheet. */
export interface CpredRollRequest {
  kind: CpredRollKind;
  /** Required for `kind: 'skill'` — an id from the skill registry. */
  skillId?: string;
  /** Required for `kind: 'stat'` — one of the ten CP RED stats. */
  statId?: CpredStatId;
  /** Required for `kind: 'damage'` — id of the weapon row on the sheet. */
  weaponRowId?: string;
  /** `kind: 'damage'`: where the shot is aimed. Defaults to the body (RAW). */
  location?: CpredHitLocation;
  /** Ad-hoc situational modifier (GM's call), −20…+20. */
  modifier?: number;
  /** Luck points spent from the pool; each adds +1 (declared before the roll). */
  luckSpent?: number;
  /**
   * Chat message id of the attack this damage follows (stage 16). The client
   * sends only the id; the server reads the notation, the multiplier and the
   * target off the stored attack and rewrites the three fields below, so a
   * client can neither pick its own burst multiplier nor its own target.
   */
  attackMessageId?: number;
  /** Server-filled: damage notation overriding the weapon row (burst = 2k6). */
  damageNotation?: string;
  /** Server-filled: autofire multiplier applied to the rolled total. */
  damageMultiplier?: number;
  /** Server-filled: token the damage is aimed at. */
  targetTokenId?: string;
  /** Server-filled: cover the damage is aimed at instead (stage 16c). */
  targetCoverId?: number;
  /**
   * Server-filled: everyone an area attack reached (stage 16d), so one roll can
   * be applied to all of them. Read off the stored attack like everything else
   * here — a client naming its own victims would be a client rolling damage on
   * whoever it liked.
   */
  areaTargets?: RollAreaTarget[];
  /**
   * Server-filled: the round that was fired (stage 16g), read off the stored
   * attack. It decides how much armour wears down, whether a Critical Injury is
   * drawn at all and whether the target catches fire — all of which a client
   * naming its own ammunition would be deciding for the GM.
   */
  ammo?: CpredAmmoProfile;
  /**
   * Server-filled: the Aimed Shot this damage follows (s. 170), read off the
   * stored attack for the same reason `ammo` is. `location` already carries the
   * head; this says whether the aim was at a leg or at a held item, neither of
   * which changes the armour but both of which cost the target something once
   * the damage lands.
   */
  aimedAt?: CpredAimPoint;
  /**
   * Server-filled: this damage came from a blade or a martial art, so only half
   * the defender's armour counts (s. 176, 178). Read off the stored attack for
   * exactly the reason `ammo` is — a client claiming its own armour penetration
   * would be a client deciding how much its target's vest is worth.
   */
  halvesArmor?: boolean;
  /**
   * Server-filled: damage „Wykrycie słabości" adds before armour (stage 30a),
   * read off the stored attack the same way `halvesArmor` is. The server has
   * already decided this was the Round's first successful Attack; by the time
   * the number gets here it is simply owed.
   */
  weakSpot?: number;
  /**
   * Required for `kind: 'stabilize'` — the token being stabilized, which RAW
   * allows to be your own. Unlike the damage fields above this one *is* the
   * client's choice; the server only checks it may be reached and seen.
   */
  stabilizeTokenId?: string;
  /** Server-filled: DV read off the target's wound threshold (10/13/15). */
  stabilizeDv?: number;
  /** Server-filled: whose name the card names. */
  stabilizeTargetName?: string;
  /**
   * `kind: 'treatInjury'` (stage 30b) — who is being treated and for what. The
   * two ids are the client's choice, like `stabilizeTokenId`; everything the
   * roll is judged against is read off the *target's* wound by the server.
   */
  treatTokenId?: string;
  treatInjuryId?: string;
  /** Which branch of the printed sentence is being rolled („Chirurgia PT 13"). */
  treatSkillId?: string;
  /** Server-filled: DV of that branch, read off the wound the target carries. */
  treatDv?: number;
  /** Server-filled: what the card names — the wound, and whose it is. */
  treatInjuryName?: string;
  treatTargetName?: string;
  /**
   * `kind: 'charisma'` (stage 30d) — how big the audience is and what the
   * Rocker wants from it. Both are the player's choice; what the table decides
   * is whether the rank allows the request at all, and that is read off the
   * sheet on both sides (`cpredCharismaProblem`).
   */
  charismaAudience?: CpredCharismaAudience;
  charismaPurpose?: CpredCharismaPurpose;
  /**
   * `kind: 'reliability'` (stage 30d) — how well the published material is
   * evidenced. „Ostateczne PT ustala MG", and so does this: nothing on the
   * sheet can tell whether a story carries four irrefutable proofs.
   */
  reliabilityProof?: CpredProofLevel;
}

/** Highest damage multiplier any weapon can reach — guards the stored value. */
export const CPRED_DAMAGE_MULTIPLIER_MAX = 10;

export type CpredRollProblem =
  | 'BAD_REQUEST'
  | 'UNKNOWN_SKILL'
  | 'UNKNOWN_STAT'
  | 'BAD_MODIFIER'
  | 'NOT_ENOUGH_LUCK'
  | 'UNKNOWN_WEAPON'
  | 'BAD_DAMAGE'
  /** Chirurgia asked for by somebody who has no points in the Specialty. */
  | 'NO_SURGERY'
  /** A Role's own roll asked for by a sheet whose Role is a different one. */
  | 'NO_ABILITY'
  /** „To żart, prawda? Jeszcze nie masz dużych grup fanów" (s. 144). */
  | 'NO_CROWD';

/** Damage metadata the chat card needs to offer „Zastosuj na celu". */
export interface CpredDamagePlan {
  location: CpredHitLocation;
  /** Weapon the damage came from, for the card's title. */
  weaponName: string;
  /** Damage armor cannot stop (injury effects, falls) — stage 15 leaves it false. */
  ignoreArmor?: boolean;
  /** Autofire's factor on the rolled total; absent means ×1 (stage 16). */
  multiplier?: number;
  /** Token the damage is aimed at, preselected by „Zastosuj" (stage 16). */
  targetTokenId?: string;
  /** Cover the damage is aimed at instead (stage 16c) — a car, not a person. */
  targetCoverId?: number;
  /** Everyone an area attack reached (stage 16d) — each applied separately. */
  areaTargets?: RollAreaTarget[];
  /** The round that was fired (stage 16g) — „Zastosuj" reads its effects. */
  ammo?: CpredAmmoProfile;
  /**
   * The Aimed Shot this damage follows (s. 170). Only a leg and a held item
   * ever land here — the head is already `location: 'head'` — and both are
   * consequences „Zastosuj" applies, not arithmetic this plan does.
   */
  aimedAt?: CpredAimPoint;
  /** Half the armour stops this one (s. 176) — a blade or a martial art. */
  halvesArmor?: boolean;
}

/** What „Leczenie" needs to judge itself and explain the verdict (stage 30b). */
export interface CpredTreatInjuryPlan {
  /** Beat this to take the wound off (RAW: strictly higher, as everywhere). */
  dv: number;
  targetName: string;
  /** Token whose sheet loses the wound on a success. */
  targetTokenId: string;
  /** Compendium id of the wound being treated. */
  injuryId: string;
  injuryName: string;
  /** Which branch of the printed sentence was rolled. */
  skillName: string;
}

/** What a Test Efektu Charyzmy is judged against (stage 30d). */
export interface CpredCharismaPlan {
  /** PT 8 / 10 / 12, by the size of the audience — never by the rank. */
  dv: number;
  audience: CpredCharismaAudience;
  purpose: CpredCharismaPurpose;
  /**
   * What the tier lets the Rocker ask of an audience this size, for the card's
   * detail line. Empty when the purpose is making new fans — the table has no
   * say there.
   */
  effect: string;
}

/**
 * A Test Rzetelności (stage 30d): one d10 against a chance out of ten, so the
 * number to beat travels rather than being derived from the die.
 */
export interface CpredReliabilityPlan {
  /** „Szansa N na 10, że odbiorcy uwierzą" — rank plus the proofs bonus. */
  chance: number;
  proof: CpredProofLevel;
  /** The tier's own chance, before the proofs — the card shows the arithmetic. */
  base: number;
}

/** The GM's secret Pogłoski roll (stage 30d) — a rank against four thresholds. */
export interface CpredRumourPlan {
  rank: number;
}

/** What „Ustabilizowanie" needs to judge itself and explain the verdict. */
export interface CpredStabilizePlan {
  /** Beat this to stabilize (RAW: the roll has to be strictly higher). */
  dv: number;
  targetName: string;
  /** Token whose sheet the success is applied to. */
  targetTokenId: string;
  /** Which of the two medical skills was rolled. */
  skillName: string;
}

/**
 * Death Save inputs read off the sheet: roll 1d10 under BODY, with +1 per save
 * already taken and +1 per injury that raises the base difficulty. The modifier
 * deliberately stays out of the formula — the die stands alone on the chat card
 * and the verdict explains the arithmetic.
 */
export interface CpredDeathSavePlan {
  /** Roll under this to survive (BODY). */
  target: number;
  /** Added to the die before the comparison. */
  modifier: number;
  savesTaken: number;
  injuryPenalty: number;
}

/** Everything needed to execute and explain one sheet roll. */
export interface CpredRollPlan {
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
  /** Whether the exploding-10 Check rule applies (Checks only). */
  checkRule: boolean;
  /** Present for `kind: 'damage'`. */
  damage?: CpredDamagePlan;
  /** Present for `kind: 'deathSave'`. */
  deathSave?: CpredDeathSavePlan;
  /** Present for `kind: 'stabilize'`. */
  stabilize?: CpredStabilizePlan;
  /** Present for `kind: 'treatInjury'`. */
  treatInjury?: CpredTreatInjuryPlan;
  /** Present for `kind: 'charisma'` (stage 30d). */
  charisma?: CpredCharismaPlan;
  /** Present for `kind: 'reliability'` (stage 30d). */
  reliability?: CpredReliabilityPlan;
  /** Present for `kind: 'rumour'` (stage 30d). */
  rumour?: CpredRumourPlan;
}

/**
 * Modifiers that come from the *world* rather than the sheet or the request —
 * being Held is −2 to every Action (stage 14d), and stage 14e adds the Critical
 * Injuries that bite in combat.
 *
 * A separate argument on purpose: these are filled in by the server from state
 * a client cannot see or forge, so they must not travel inside the request.
 */
export interface CpredRollContext {
  modifiers?: readonly RollBreakdownEntry[];
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/**
 * Validates a roll request against the sheet and builds its plan. Rejects
 * unknown skills/stats/weapons, out-of-range modifiers and spending more Luck
 * than the character has left — the server calls this before touching the dice.
 */
export function planCpredRoll(
  data: CpredCharacterData,
  registry: CpredRegistry,
  request: CpredRollRequest,
  context: CpredRollContext = {},
): { ok: true; plan: CpredRollPlan } | { ok: false; error: CpredRollProblem } {
  if (typeof request !== 'object' || request === null) return { ok: false, error: 'BAD_REQUEST' };

  const modifier = request.modifier ?? 0;
  if (!isInteger(modifier) || Math.abs(modifier) > CPRED_SITUATIONAL_MODIFIER_LIMIT) {
    return { ok: false, error: 'BAD_MODIFIER' };
  }
  const luckSpent = request.luckSpent ?? 0;
  if (!isInteger(luckSpent) || luckSpent < 0) return { ok: false, error: 'BAD_REQUEST' };
  if (luckSpent > data.luckCurrent) return { ok: false, error: 'NOT_ENOUGH_LUCK' };

  const state = woundState(data.hpCurrent, data.stats);

  // Damage and Death Saves are not Checks: no stat, no skill, no wound penalty
  // and no exploding 10. They share only the validation above.
  if (request.kind === 'damage') {
    // Luck buys successes on Checks, never damage.
    if (luckSpent > 0) return { ok: false, error: 'BAD_REQUEST' };
    return planDamageRoll(data, request, modifier, state);
  }
  if (request.kind === 'deathSave') {
    if (luckSpent > 0) return { ok: false, error: 'BAD_REQUEST' };
    return planDeathSaveRoll(data, state);
  }
  if (request.kind === 'stabilize') {
    return planStabilizeRoll(data, registry, request, modifier, luckSpent, state, context);
  }
  if (request.kind === 'treatInjury') {
    return planTreatInjuryRoll(data, registry, request, modifier, luckSpent, state, context);
  }
  // Stage 30d. Three rolls a Role owns outright: two of them are Checks (rank
  // instead of a stat+skill pair, everything else the same), and the third is
  // not a Check at all — the audience either believes or does not.
  if (request.kind === 'charisma') {
    return planCharismaRoll(data, registry, request, modifier, luckSpent, state, context);
  }
  if (request.kind === 'rumour') {
    return planRumourRoll(data, registry, modifier, luckSpent, state, context);
  }
  if (request.kind === 'reliability') {
    // „W Testach Rzetelności nie można wykorzystywać Szczęścia" (s. 152).
    if (luckSpent > 0) return { ok: false, error: 'BAD_REQUEST' };
    return planReliabilityRoll(data, registry, request);
  }

  const breakdown: RollBreakdownEntry[] = [];
  let title: string;
  let statId: CpredStatId;

  if (request.kind === 'skill') {
    const skill = registry.skills.find((entry) => entry.id === request.skillId);
    if (!skill) return { ok: false, error: 'UNKNOWN_SKILL' };
    statId = skill.stat;
    // „Nauka (Fizyka) (INT)" — the specialised skills say what they were bought
    // in, or nothing extra while nobody has named a field (stage 25a debt).
    title = `${cpredSkillLabel(skill, data)} (${CPRED_STAT_LABELS[statId].abbr})`;
    breakdown.push(...skillBreakdown(data, skill));
    // „Dodaj poziom tej Specjalizacji do Testów Podstawowych napraw,
    // Cyberinżynierii, Elektroniki i zabezpieczeń, Naprawy broni albo Naprawy
    // pojazdów" (s. 147). Read straight off the sheet, like Precyzyjny atak in
    // 30a, so the client's preview and the server's verdict cannot disagree.
    if (CPRED_REPAIR_SKILL_IDS.includes(skill.id)) {
      const repair = cpredSheetFabrication(data, registry).repair;
      if (repair > 0) {
        breakdown.push({ label: `Naprawa ${repair}`, value: repair, kind: 'situational' });
      }
    }
    // „Nomada dodaje poziom Moto do każdego wykonywanego Testu Prowadzenia
    // pojazdów lądowych, Żeglowania, Pilotowania […] i Naprawy" (s. 161) —
    // read off the sheet like Naprawa above, six skills and no context.
    if (CPRED_MOTO_SKILL_IDS.includes(skill.id)) {
      const moto = cpredSheetMoto(data, registry);
      if (moto > 0) {
        breakdown.push({ label: `Moto ${moto}`, value: moto, kind: 'situational' });
      }
    }
    if (skill.id === CPRED_PERCEPTION_SKILL_ID) {
      const threatSense = cpredSheetCombatAwareness(data, registry).perception;
      if (threatSense > 0) {
        breakdown.push({
          label: `Wyczucie zagrożenia ${threatSense}`,
          value: threatSense,
          kind: 'situational',
        });
      }
    }
  } else if (request.kind === 'stat') {
    if (!isCpredStatId(request.statId)) return { ok: false, error: 'UNKNOWN_STAT' };
    statId = request.statId;
    title = `${CPRED_STAT_LABELS[statId].name} (${CPRED_STAT_LABELS[statId].abbr})`;
    breakdown.push(statBreakdown(data, statId));
  } else {
    return { ok: false, error: 'BAD_REQUEST' };
  }

  return finishCheck(title, breakdown, state, modifier, luckSpent, {}, context);
}

/**
 * One stat, as the card shows it.
 *
 * The value is the *effective* one (stage 23a): EMP follows the Humanity left
 * after the chrome, so a character who sold six points of Empathy to a
 * ripperdoc rolls with what is left. When it differs from the sheet the label
 * says so — a player who reads „EMP 6" on their own sheet must not be quietly
 * handed a 4 with no explanation.
 */
function statBreakdown(data: CpredCharacterData, statId: CpredStatId): RollBreakdownEntry {
  const label = `${CPRED_STAT_LABELS[statId].name} (${CPRED_STAT_LABELS[statId].abbr})`;
  const value = effectiveCpredStats(data.stats, data.humanityCurrent)[statId];
  return {
    label:
      value === data.stats[statId]
        ? label
        : `${label} — obniżona Człowieczeństwem (baza ${data.stats[statId]})`,
    value,
    kind: 'stat',
  };
}

/** The stat + skill pair every Check opens with, named the way the card shows it. */
function skillBreakdown(
  data: CpredCharacterData,
  skill: { id: string; name: string; stat: CpredStatId },
): RollBreakdownEntry[] {
  const level = data.skills[skill.id] ?? 0;
  const name = cpredSkillLabel(skill, data);
  return [
    statBreakdown(data, skill.stat),
    // RAW: an untrained skill simply contributes nothing — the check still
    // happens on the bare stat, and the card says so.
    {
      label: level > 0 ? name : `${name} (nietrenowana)`,
      value: level,
      kind: 'skill',
    },
  ];
}

/**
 * The tail every Check shares: the automatic wound penalty, the GM's ad-hoc
 * modifier and declared Luck, folded into one flat term next to the d10.
 */
function finishCheck(
  title: string,
  breakdown: RollBreakdownEntry[],
  state: CpredWoundState,
  modifier: number,
  luckSpent: number,
  extra: Pick<CpredRollPlan, 'stabilize' | 'treatInjury' | 'charisma' | 'rumour'> = {},
  context: CpredRollContext = {},
): { ok: true; plan: CpredRollPlan } {
  const woundPenalty = woundCheckPenalty(state);
  if (woundPenalty !== 0) {
    breakdown.push({ label: CPRED_WOUND_LABELS[state], value: woundPenalty, kind: 'wound' });
  }
  // Next to the wound penalty, and for the same reason: the player has to see
  // where a −2 they did not ask for came from (stage 14d).
  for (const entry of context.modifiers ?? []) breakdown.push({ ...entry });
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
      checkRule: true,
      ...extra,
    },
  };
}

/**
 * „Ustabilizowanie" (s. 222): TECH + Pierwsza pomoc *or* Ratownictwo medyczne
 * against a DV read off the target's wound threshold. An ordinary Check in
 * every other respect — the wound penalty of the *medic* still applies, which
 * is why a mortally wounded character stabilizing themselves is so hard.
 *
 * When the caller names no skill, the better of the two is rolled: at the table
 * nobody picks the worse way to save a friend.
 */
function planStabilizeRoll(
  data: CpredCharacterData,
  registry: CpredRegistry,
  request: CpredRollRequest,
  modifier: number,
  luckSpent: number,
  state: CpredWoundState,
  context: CpredRollContext = {},
): { ok: true; plan: CpredRollPlan } | { ok: false; error: CpredRollProblem } {
  const allowed = [CPRED_FIRST_AID_SKILL_ID, CPRED_PARAMEDIC_SKILL_ID];
  const candidates = registry.skills.filter((entry) => allowed.includes(entry.id));
  if (candidates.length === 0) return { ok: false, error: 'UNKNOWN_SKILL' };

  const named = request.skillId
    ? candidates.find((entry) => entry.id === request.skillId)
    : undefined;
  if (request.skillId && !named) return { ok: false, error: 'UNKNOWN_SKILL' };
  const skill =
    named ??
    candidates.reduce((best, entry) =>
      (data.skills[entry.id] ?? 0) > (data.skills[best.id] ?? 0) ? entry : best,
    );

  const dv = request.stabilizeDv;
  const targetTokenId = request.stabilizeTokenId;
  if (!isInteger(dv) || typeof targetTokenId !== 'string' || targetTokenId.length === 0) {
    return { ok: false, error: 'BAD_REQUEST' };
  }
  const targetName = request.stabilizeTargetName ?? 'cel';

  return finishCheck(
    `Ustabilizowanie → ${targetName}`,
    skillBreakdown(data, skill),
    state,
    modifier,
    luckSpent,
    { stabilize: { dv, targetName, targetTokenId, skillName: skill.name } },
    context,
  );
}

/**
 * „Leczenie" of one Critical Injury (stage 30b): TECH + whichever skill the
 * printed sentence names, against the DV printed beside it.
 *
 * The branch is the healer's choice and the DV is not — it is read off the
 * wound the *target* carries, on the server, exactly as `stabilizeDv` is. What
 * is checked here is the one thing the rules gate: Chirurgia is not a skill
 * everybody has a level 0 in, it is a skill a non-Medyk does not have at all,
 * so asking for it without the Specialty is refused rather than rolled at zero.
 */
function planTreatInjuryRoll(
  data: CpredCharacterData,
  registry: CpredRegistry,
  request: CpredRollRequest,
  modifier: number,
  luckSpent: number,
  state: CpredWoundState,
  context: CpredRollContext = {},
): { ok: true; plan: CpredRollPlan } | { ok: false; error: CpredRollProblem } {
  const dv = request.treatDv;
  const targetTokenId = request.treatTokenId;
  const injuryId = request.treatInjuryId;
  const skillId = request.treatSkillId;
  if (
    !isInteger(dv) ||
    typeof targetTokenId !== 'string' ||
    targetTokenId.length === 0 ||
    typeof injuryId !== 'string' ||
    injuryId.length === 0 ||
    typeof skillId !== 'string'
  ) {
    return { ok: false, error: 'BAD_REQUEST' };
  }

  let breakdown: RollBreakdownEntry[];
  let skillName: string;
  if (isCpredMedicineSkillId(skillId)) {
    const medicSkill = CPRED_MEDICINE_SKILLS.find((entry) => entry.id === skillId)!;
    const level = cpredMedicineSkillLevel(data, registry, skillId);
    // Not `UNKNOWN_SKILL` by accident: for this healer the skill really does
    // not exist, and the sentence the client shows says why (`cpredCareRefusal`).
    if (level < 1) return { ok: false, error: 'NO_SURGERY' };
    skillName = medicSkill.name;
    breakdown = [
      statBreakdown(data, medicSkill.stat),
      { label: `${medicSkill.name} (Medycyna)`, value: level, kind: 'skill' },
    ];
  } else {
    const skill = registry.skills.find((entry) => entry.id === skillId);
    if (!skill) return { ok: false, error: 'UNKNOWN_SKILL' };
    skillName = skill.name;
    breakdown = skillBreakdown(data, skill);
  }

  const injuryName = request.treatInjuryName ?? 'rana';
  const targetName = request.treatTargetName ?? 'cel';
  return finishCheck(
    `Leczenie: ${injuryName} → ${targetName}`,
    breakdown,
    state,
    modifier,
    luckSpent,
    { treatInjury: { dv, targetName, targetTokenId, injuryId, injuryName, skillName } },
    context,
  );
}

/**
 * Test Efektu Charyzmy (stage 30d): „wartość Efektu Charyzmy + 1k10" (s. 144).
 *
 * The only Check in the game with **no stat and no skill** in it — the rank
 * stands where CHA + Perswazja would. That is not an omission: the Rocker is
 * rolling their standing with a crowd, not their tongue, and a sheet with
 * CHA 8 does not get to borrow it.
 *
 * The wound penalty, the GM's modifier and Luck all still apply: it is a Test,
 * and every Test in this VTT goes through `finishCheck` for exactly that
 * reason.
 */
function planCharismaRoll(
  data: CpredCharacterData,
  registry: CpredRegistry,
  request: CpredRollRequest,
  modifier: number,
  luckSpent: number,
  state: CpredWoundState,
  context: CpredRollContext,
): { ok: true; plan: CpredRollPlan } | { ok: false; error: CpredRollProblem } {
  const rank = cpredRoleAbilityRank(data, registry, CPRED_CHARISMA_ABILITY);
  const audience = request.charismaAudience;
  const purpose = request.charismaPurpose ?? 'favour';
  const problem = cpredCharismaProblem(rank, audience, purpose);
  if (problem === 'NO_ABILITY') return { ok: false, error: 'NO_ABILITY' };
  // Not a refusal by accident: „Jeśli tak nie jest, próba automatycznie się nie
  // udaje" (s. 144) — a request the tier does not carry never reaches the dice.
  if (problem === 'NO_CROWD') return { ok: false, error: 'NO_CROWD' };
  if (problem !== null || audience === undefined) return { ok: false, error: 'BAD_REQUEST' };

  const dv = CPRED_CHARISMA_DV[audience];
  const effect = purpose === 'favour' ? (cpredCharismaEffect(rank!, audience) ?? '') : '';
  const title =
    purpose === 'fans'
      ? `Efekt Charyzmy: nowi fani — ${CPRED_CHARISMA_AUDIENCE_LABELS[audience]}`
      : `Efekt Charyzmy: przysługa — ${CPRED_CHARISMA_AUDIENCE_LABELS[audience]}`;
  return finishCheck(
    title,
    [{ label: `${CPRED_CHARISMA_ABILITY} ${rank}`, value: rank!, kind: 'skill' }],
    state,
    modifier,
    luckSpent,
    { charisma: { dv, audience, purpose, effect } },
    context,
  );
}

/**
 * Pogłoski (stage 30d): „MG wykonuje potajemny Test twojej Wiarygodności +
 * 1k10" (s. 151). Shaped exactly like the Charisma check above — the rank
 * stands alone — and judged against four thresholds at once rather than one.
 */
function planRumourRoll(
  data: CpredCharacterData,
  registry: CpredRegistry,
  modifier: number,
  luckSpent: number,
  state: CpredWoundState,
  context: CpredRollContext,
): { ok: true; plan: CpredRollPlan } | { ok: false; error: CpredRollProblem } {
  const rank = cpredRoleAbilityRank(data, registry, CPRED_CREDIBILITY_ABILITY);
  if (rank === null) return { ok: false, error: 'NO_ABILITY' };
  return finishCheck(
    'Pogłoski',
    [{ label: `${CPRED_CREDIBILITY_ABILITY} ${rank}`, value: rank, kind: 'skill' }],
    state,
    modifier,
    luckSpent,
    { rumour: { rank } },
    context,
  );
}

/**
 * Test Rzetelności (stage 30d): „rzuć 1k10 […] Szansa N na 10, że odbiorcy
 * uwierzą" (s. 151–152).
 *
 * Not a Check and deliberately not built like one: no stat, no skill, no wound
 * penalty, no exploding ten and — RAW, in as many words — no Luck. What the
 * rank buys is the *chance*, not the roll, so the die stands bare and the plan
 * carries the number it is read against. The same shape a Death Save has, for
 * the same reason.
 */
function planReliabilityRoll(
  data: CpredCharacterData,
  registry: CpredRegistry,
  request: CpredRollRequest,
): { ok: true; plan: CpredRollPlan } | { ok: false; error: CpredRollProblem } {
  const rank = cpredRoleAbilityRank(data, registry, CPRED_CREDIBILITY_ABILITY);
  if (rank === null) return { ok: false, error: 'NO_ABILITY' };
  const proof = request.reliabilityProof ?? 'none';
  if (!(CPRED_PROOF_LEVELS as readonly string[]).includes(proof)) {
    return { ok: false, error: 'BAD_REQUEST' };
  }
  const base = cpredReliabilityChance(rank, 'none');
  return {
    ok: true,
    plan: {
      title: 'Test Rzetelności',
      formula: { terms: [{ kind: 'dice', sign: 1, count: 1, sides: 10 }] },
      breakdown: [],
      modifierTotal: 0,
      woundState: woundState(data.hpCurrent, data.stats),
      luckSpent: 0,
      checkRule: false,
      reliability: { chance: cpredReliabilityChance(rank, proof), proof, base },
    },
  };
}

/**
 * A weapon's damage roll: the notation stored on the sheet row, plus an
 * optional flat modifier from the GM. The hit location travels with the plan
 * so the chat card can offer „Zastosuj" against the right armor.
 */
function planDamageRoll(
  data: CpredCharacterData,
  request: CpredRollRequest,
  modifier: number,
  state: CpredWoundState,
): { ok: true; plan: CpredRollPlan } | { ok: false; error: CpredRollProblem } {
  const weapon = data.weapons.find((row) => row.id === request.weaponRowId);
  if (!weapon) return { ok: false, error: 'UNKNOWN_WEAPON' };
  // A burst rolls 2d6 whatever the weapon prints, so the attack that produced
  // it may override the notation — but only the server ever fills that in.
  const parsed = parseRollNotation(request.damageNotation ?? weapon.damage ?? '');
  if (!parsed.ok || !parsed.formula.terms.some((term) => term.kind === 'dice')) {
    return { ok: false, error: 'BAD_DAMAGE' };
  }
  const multiplier = request.damageMultiplier ?? 1;
  if (!isInteger(multiplier) || multiplier < 1 || multiplier > CPRED_DAMAGE_MULTIPLIER_MAX) {
    return { ok: false, error: 'BAD_DAMAGE' };
  }

  const location: CpredHitLocation = request.location === 'head' ? 'head' : 'body';
  const breakdown: RollBreakdownEntry[] = [];
  const terms = [...parsed.formula.terms];
  // „+1 do obrażeń (przed uwzględnieniem pancerza)" (s. 146) — a term on the
  // damage roll, so the armour it then has to beat is the full one.
  const weakSpot = Math.max(0, Math.round(request.weakSpot ?? 0));
  if (weakSpot > 0) {
    breakdown.push({
      label: `Wykrycie słabości ${weakSpot}`,
      value: weakSpot,
      kind: 'situational',
    });
    terms.push({ kind: 'modifier', sign: 1, value: weakSpot });
  }
  if (modifier !== 0) {
    breakdown.push({ label: 'Modyfikator obrażeń', value: modifier, kind: 'situational' });
    terms.push({ kind: 'modifier', sign: modifier < 0 ? -1 : 1, value: Math.abs(modifier) });
  }

  const suffix = multiplier > 1 ? ` ×${multiplier}` : '';
  return {
    ok: true,
    plan: {
      title: `${weapon.name} — obrażenia (${CPRED_HIT_LOCATION_LABELS[location]})${suffix}`,
      formula: { terms },
      breakdown,
      modifierTotal: modifier + weakSpot,
      woundState: state,
      luckSpent: 0,
      checkRule: false,
      damage: {
        location,
        weaponName: weapon.name,
        ...(multiplier > 1 ? { multiplier } : {}),
        ...(request.targetTokenId ? { targetTokenId: request.targetTokenId } : {}),
        ...(request.targetCoverId !== undefined ? { targetCoverId: request.targetCoverId } : {}),
        ...(request.areaTargets ? { areaTargets: request.areaTargets } : {}),
        ...(request.ammo ? { ammo: request.ammo } : {}),
        ...(request.aimedAt ? { aimedAt: request.aimedAt } : {}),
        ...(request.halvesArmor ? { halvesArmor: true as const } : {}),
      },
    },
  };
}

/** A Death Save: a bare 1d10 judged against BODY (see `CpredDeathSavePlan`). */
function planDeathSaveRoll(
  data: CpredCharacterData,
  state: CpredWoundState,
): { ok: true; plan: CpredRollPlan } {
  const target = deathSaveTarget(data.stats);
  const savesTaken = Math.max(0, Math.round(data.deathSaves));
  const injuryPenalty = injuryDeathSavePenalty(data.criticalInjuries);
  return {
    ok: true,
    plan: {
      title: 'Test Przeżywalności',
      formula: { terms: [{ kind: 'dice', sign: 1, count: 1, sides: 10 }] },
      breakdown: [],
      modifierTotal: 0,
      woundState: state,
      luckSpent: 0,
      checkRule: false,
      deathSave: { target, modifier: savesTaken + injuryPenalty, savesTaken, injuryPenalty },
    },
  };
}

export interface CpredDeathSaveOutcome {
  survived: boolean;
  /** The die alone, before the modifier. */
  natural: number;
  /** Die plus modifier — what is compared against the target. */
  total: number;
  target: number;
  modifier: number;
  /** True when a natural 10 failed the save regardless of the numbers. */
  automaticFailure: boolean;
}

/**
 * Resolves one Death Save: you survive by rolling (die + modifier) under BODY.
 * A natural 10 always fails, however high BODY is (RAW).
 */
export function resolveCpredDeathSave(
  natural: number,
  plan: Pick<CpredDeathSavePlan, 'target' | 'modifier'>,
): CpredDeathSaveOutcome {
  const total = natural + plan.modifier;
  const automaticFailure = natural === 10;
  return {
    survived: !automaticFailure && total < plan.target,
    natural,
    total,
    target: plan.target,
    modifier: plan.modifier,
    automaticFailure,
  };
}
