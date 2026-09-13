/**
 * CP RED grappling (stage 14d) — pure logic, no IO.
 *
 * „Aby określić skuteczność Pochwycenia, Atakujący i Broniący wykonują Test
 * ZW + Bijatyka + 1k10" (s. 176). Everything below follows from that sentence
 * and the four paragraphs after it:
 *
 *  - a won opposed test buys either a **Hold** or one item out of the loser's
 *    hands (the item version is descriptive here — inventory is another stage);
 *  - inside a Hold **both** sides take −2 „do wszystkich Akcji", the Held one
 *    loses their Move Action, the Attacker drags them along on theirs, and
 *    neither may use a two-handed weapon;
 *  - the Attacker lets go for free; anybody else — the Held one or a third
 *    party — needs an Action and a won test, and success „kończy Trzymanie dla
 *    wszystkich";
 *  - **Duszenie** and **Rzut** cost an Action, deal damage equal to the
 *    Attacker's BODY and are not reduced by armor (nor do they damage it);
 *  - a **Ludzka tarcza** puts the Attacker behind cover against ranged attacks
 *    they can see, except aimed head shots, and forbids the shield to dodge.
 *
 * The relation itself is not modelled here: this file answers questions about
 * one pair, and the tracker stores who is holding whom (stage 14d decision —
 * the Hold lives in combat state, like the initiative queue).
 */

import type { CpredCharacterData, CpredRegistry } from './character.js';
import { CPRED_PASSIVE_DIE } from './attacks.js';
import { resolveCpredDamage, type CpredDamageOutcome } from './damage.js';
import { woundStateFromHp, type CpredWoundState } from './rolls.js';
import { cpredEffectiveStats } from './stateffects.js';

/** „Obaj walczący ... otrzymują modyfikator −2 do wszystkich Akcji" (s. 176). */
export const CPRED_GRAPPLE_PENALTY = -2;

/** The skill both sides of the opposed test roll — and the stat it hangs on. */
export const CPRED_BRAWLING_SKILL_ID = 'brawling';

/** „Jeśli Atakujący Dusi ten sam cel przez 3 Rundy pod rząd" (s. 177). */
export const CPRED_CHOKE_ROUNDS_TO_UNCONSCIOUS = 3;

/** Label the tracker and the chat cards use for the −2. */
export const CPRED_GRAPPLE_PENALTY_LABEL = 'Trzymanie';

/** Which side of a Hold a participant is on. */
export type CpredGrappleRole = 'attacker' | 'defender';

/** What the Attacker took out of a won opposed test. */
export type CpredGrappleIntent = 'hold' | 'item';

/**
 * ZW + Bijatyka — the fixed half of both sides' roll. Takes the registry
 * because the skill's governing stat is data (a house rule may move Bijatyka
 * off DEX and the arithmetic follows).
 */
export function cpredGrappleBase(data: CpredCharacterData, registry: CpredRegistry): number {
  const skill = registry.skills.find((entry) => entry.id === CPRED_BRAWLING_SKILL_ID);
  // Etap 39: Cecha **jak teraz** — Zwarcie jest rzutem przeciwstawnym, a obie
  // strony mają prawo być pod czymś, co obniżyło im Zwinność.
  const stats = cpredEffectiveStats(data);
  const stat = skill ? stats[skill.stat] : stats.dex;
  return stat + (data.skills[CPRED_BRAWLING_SKILL_ID] ?? 0);
}

/**
 * Stand-in DV of a defender who is not rolling yet — ZW + Bijatyka + half a
 * die, the same shape stage 16 uses for melee (`passiveEvasionDv`). The
 * defender may replace it with a real roll („Broń się"), which is the whole
 * point of the stand-in: nobody waits for an absent player.
 *
 * `modifier` carries whatever the defender's own state adds — being Held by
 * somebody else is −2 for them too, and it would be wrong to charge the
 * attacker's penalty while ignoring theirs.
 */
export function cpredPassiveGrappleDv(
  data: CpredCharacterData,
  registry: CpredRegistry,
  modifier = 0,
): number {
  return cpredGrappleBase(data, registry) + CPRED_PASSIVE_DIE + modifier;
}

/**
 * DV of a defender with no sheet at all. A statist's bare DEX 5 and no training
 * is the same default the suppressive-fire path uses for WILL (stage 16).
 */
export const CPRED_STATIST_GRAPPLE_DV = 5 + CPRED_PASSIVE_DIE;

/**
 * Who won. Ties go to the defender, as everywhere else in CP RED — „wygra ten
 * rzut sporny" means strictly higher, the same rule attacks obey (s. 165).
 */
export function resolveCpredGrappleTest(
  attackerTotal: number,
  defenderTotal: number,
): { won: boolean; margin: number } {
  return { won: attackerTotal > defenderTotal, margin: attackerTotal - defenderTotal };
}

/** Damage equal to the Attacker's BODY, straight into HP (Duszenie and Rzut). */
export interface CpredGrappleDamageInput {
  /** Attacker's BODY — the damage, flat, no dice. */
  body: number;
  hpCurrent: number;
  hpMax: number;
}

export interface CpredChokeInput extends CpredGrappleDamageInput {
  /** Rounds this target has been choked in a row, *including* this one. */
  roundsInARow: number;
}

/** One squeeze, resolved. */
export interface CpredChokeOutcome extends CpredGrappleDamageOutcome {
  /** The target passes out. */
  unconscious: boolean;
  /**
   * Why: `floor` = the damage would have taken them below 0 and RAW parks them
   * at 1 HP instead; `streak` = the third round in a row. Null when they held on.
   */
  unconsciousReason: 'floor' | 'streak' | null;
  roundsInARow: number;
}

export interface CpredGrappleDamageOutcome {
  damage: number;
  hpBefore: number;
  hpAfter: number;
  hpLost: number;
  woundBefore: CpredWoundState;
  woundAfter: CpredWoundState;
}

function bareDamage(input: CpredGrappleDamageInput): CpredDamageOutcome {
  // The same resolver every hit goes through, with armor switched off — RAW
  // says these damages „ignorują pancerz Broniącego i nie uszkadzają go", which
  // is exactly what `ignoreArmor` already means (stage 15).
  return resolveCpredDamage({
    damage: Math.max(0, Math.round(input.body)),
    location: 'body',
    armorSp: 0,
    hpCurrent: input.hpCurrent,
    hpMax: input.hpMax,
    ignoreArmor: true,
  });
}

function toGrappleOutcome(
  outcome: CpredDamageOutcome,
  hpAfter: number,
  hpMaxValue: number,
): CpredGrappleDamageOutcome {
  return {
    damage: outcome.damageRolled,
    hpBefore: outcome.hpBefore,
    hpAfter,
    hpLost: outcome.hpBefore - hpAfter,
    woundBefore: outcome.woundBefore,
    woundAfter: woundStateFromHp(hpAfter, hpMaxValue),
  };
}

/**
 * Duszenie (s. 177).
 *
 * Two ways out of consciousness, and they are not the same rule:
 *
 *  - **the floor.** „Jeśli obrażenia zadane Duszeniem sprawią, że PW celu, który
 *    ma więcej niż 1 PW, spadną **poniżej 0**, zamiast tego cel zostaje na 1 PW
 *    i staje się Nieprzytomny." Read literally — and it is implemented
 *    literally — damage landing a target *exactly* on 0 is not caught by this
 *    clause: they drop to 0 and are Mortally Wounded like anybody else. The
 *    protection is for the choke that would have killed outright.
 *  - **the streak.** Three rounds in a row and they are out „bez względu na stan
 *    Punktów Wytrzymałości" — a healthy target with 40 HP included.
 */
export function resolveCpredChoke(input: CpredChokeInput): CpredChokeOutcome {
  const outcome = bareDamage(input);
  const hpMaxValue = Math.max(1, Math.round(input.hpMax));
  const raw = outcome.hpBefore - outcome.damageRolled;
  const floored = outcome.hpBefore > 1 && raw < 0;
  const hpAfter = floored ? 1 : outcome.hpAfter;
  const streak = Math.max(0, Math.round(input.roundsInARow)) >= CPRED_CHOKE_ROUNDS_TO_UNCONSCIOUS;

  return {
    ...toGrappleOutcome(outcome, hpAfter, hpMaxValue),
    unconscious: floored || streak,
    // The floor is what the player feels first, so it is named first when both
    // happen to fire on the same squeeze.
    unconsciousReason: floored ? 'floor' : streak ? 'streak' : null,
    roundsInARow: Math.max(0, Math.round(input.roundsInARow)),
  };
}

/**
 * Rzut (s. 177): the same BODY damage, and then the Hold is over — „automatycznie
 * kończysz go Trzymać (co usuwa tobie i Broniącemu modyfikator −2)" — with the
 * target Prone. No floor here: a throw can kill.
 */
export function resolveCpredThrow(input: CpredGrappleDamageInput): CpredGrappleDamageOutcome {
  const outcome = bareDamage(input);
  return toGrappleOutcome(outcome, outcome.hpAfter, Math.max(1, Math.round(input.hpMax)));
}

/**
 * Does a Ludzka tarcza cover this attack? „Nie można nimi zasłaniać się przed
 * atakami bronią białą ani przed atakami dystansowymi wycelowanymi w twoją
 * głowę" (s. 178) — everything else the holder can see, it stops.
 */
export function cpredHumanShieldCovers(attack: { melee: boolean; aimedAtHead: boolean }): boolean {
  return !attack.melee && !attack.aimedAtHead;
}

/**
 * How many rounds in a row this target has now been choked. Consecutive means
 * consecutive: a round in which nobody squeezed starts the count over, which is
 * why the previous round is stored rather than a bare counter.
 */
export function nextCpredChokeStreak(
  previousRound: number | null,
  round: number,
  streak: number,
): number {
  if (previousRound === null) return 1;
  // Two squeezes inside one round cannot happen (one Action), but a GM forcing
  // it must not be rewarded with a faster blackout.
  if (previousRound === round) return Math.max(1, streak);
  if (previousRound === round - 1) return Math.max(1, streak) + 1;
  return 1;
}

/** Refusals the grapple paths produce, in the language the table speaks. */
export const CPRED_GRAPPLE_PROBLEM_MESSAGES = {
  GRAPPLE_OUT_OF_REACH: 'Zbyt daleko — Pochwycenie wymaga zwarcia (2 m).',
  GRAPPLE_BLOCKED: 'Między wami stoi przeszkoda — przez nią nikogo nie pochwycisz.',
  NOT_GRAPPLING: 'Nikogo nie Trzymasz.',
  NOT_GRAPPLED: 'Ten uczestnik nie jest w Trzymaniu.',
  ALREADY_GRAPPLED: 'Ten cel jest już Trzymany.',
  GRAPPLE_NEEDS_SHEET: 'Pochwycenie wymaga karty postaci po stronie atakującego.',
  GRAPPLE_TWO_HANDED: 'W Trzymaniu nie można używać broni dwuręcznych.',
  SHIELD_CANNOT_DODGE: 'Ludzka tarcza nie może unikać ataków dystansowych.',
  NOT_THE_DEFENDER: 'Tylko Broniący może się bronić przed tym Pochwyceniem.',
} as const;

export type CpredGrappleProblem = keyof typeof CPRED_GRAPPLE_PROBLEM_MESSAGES;
