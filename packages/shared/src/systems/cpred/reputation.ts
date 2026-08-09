/**
 * Reputacja i Konfrontacja (stage 23c) — pure logic, no IO.
 *
 * Two rules, three paragraphs of the rulebook (s. 193–194), and one decision
 * that shapes the whole file:
 *
 *  - **Reputacja is not a number the GM types.** „Reputacja związana z nowym
 *    wyczynem zastąpi poprzednią tylko wtedy, jeśli będzie wyższa" — the value
 *    is therefore *derived* from the list of deeds, and the list is what the GM
 *    edits. A separate editable number beside the list would be a second source
 *    of truth for one fact, and the rule about replacement would live in the
 *    GM's head instead of here.
 *  - **Zła sława counts as a minus.** „Jeśli słyniesz z tchórzostwa, twój poziom
 *    Reputacji traktuje się jako wartość ujemną" — so a deed carries a flag, and
 *    the sign appears only where the rules ask for it: in a Konfrontacja. The
 *    recognition roll does not care *why* people have heard of you.
 *  - **Konfrontacja is CHA + Reputacja + 1k10 on both sides, and a draw does
 *    nothing.** Unlike every other opposed test in this project, a tie is not a
 *    defender's win: „w przypadku remisu obie strony nie są pewne wyniku i nic
 *    się nie dzieje". Hence a three-valued outcome rather than a boolean.
 *
 * The loser's −2 is deliberately *not* automatic here: RAW gives them a choice
 * („przegrany może: Wycofać się… albo Nie wycofywać się, ale otrzymać
 * modyfikator −2"), and this module only says who lost. Which of the two
 * happened is a decision somebody at the table makes, and the server records.
 */

import { CPRED_PASSIVE_DIE } from './attacks.js';
import type { CpredCharacterData, CpredReputationSource } from './character.js';

/** „Modyfikator −2 do wszystkich Akcji wymierzonych w tego przeciwnika." */
export const CPRED_FACEDOWN_PENALTY = -2;

/** What the breakdown row of that −2 is called. */
export const CPRED_FACEDOWN_PENALTY_LABEL = 'Przegrana Konfrontacja';

/** Status the loser wears while they carry it (`data/public/cpred/statuses.json`). */
export const CPRED_INTIMIDATED_STATUS_ID = 'intimidated';

/** What the rulebook's table says each level means — shown next to the number. */
export const REPUTATION_LEVEL_REACH: Readonly<Record<number, string>> = {
  1: 'Każdy, kto wtedy tam był.',
  2: 'Najbliżsi znajomi słyszeli o tym wydarzeniu.',
  3: 'Wszyscy współpracownicy i znajomi.',
  4: 'Cała okolica o tym mówi.',
  5: 'Osoby spoza twojego sąsiedztwa słyszały o tobie.',
  6: 'Osoby spoza twojego sąsiedztwa rozpoznają cię na ulicy.',
  7: 'O twoim wyczynie napisała gazeta lub dwie.',
  8: 'Twoje wyczyny regularnie trafiają na paski screamsheets.',
  9: 'O twoich wyczynach regularnie huczą media.',
  10: 'Zna cię cały świat.',
};

/** The number the rules use, and where it came from. */
export interface CpredReputation {
  /** 0 when nobody has heard of them — „Większość Postaci zaczyna z Reputacją 0". */
  level: number;
  /** True when the winning deed is a shameful one. */
  notorious: boolean;
  /** The deed that won, so the sheet and the card can name it. */
  source: CpredReputationSource | null;
}

export const NO_REPUTATION: CpredReputation = { level: 0, notorious: false, source: null };

/**
 * The current Reputation of a sheet.
 *
 * „Reputacja związana z nowym wyczynem zastąpi poprzednią tylko wtedy, jeśli
 * będzie wyższa" — read literally, that makes the highest level the current
 * one, whatever order the deeds happened in. Ties go to the *later* deed: two
 * fours mean people talk about the fresher one, and a shameful four earned last
 * night is exactly the case the rule about bad reputation is written for.
 */
export function cpredReputation(sources: readonly CpredReputationSource[]): CpredReputation {
  let best: CpredReputationSource | null = null;
  for (const source of sources) {
    // `>=` rather than `>`: on equal levels the one further down the list wins,
    // and the sheet keeps the list in the order the GM typed it — newest last.
    if (!best || source.level >= best.level) best = source;
  }
  if (!best || best.level <= 0) return NO_REPUTATION;
  return { level: best.level, notorious: best.notorious === true, source: best };
}

/** Shorthand for the two callers that hold a whole sheet. */
export function cpredSheetReputation(data: CpredCharacterData): CpredReputation {
  return cpredReputation(data.reputationSources);
}

/**
 * What Reputation adds to a Konfrontacja roll. Positive when they are famous,
 * negative when they are notorious — the asterisk in „CHA + Reputacja*".
 */
export function cpredFacedownReputationModifier(reputation: CpredReputation): number {
  return reputation.notorious ? -reputation.level : reputation.level;
}

/** CHA + Reputacja* — the fixed half of one side's Konfrontacja roll. */
export function cpredFacedownBase(cool: number, reputation: CpredReputation): number {
  return cool + cpredFacedownReputationModifier(reputation);
}

/**
 * Stand-in total of a side that has not rolled — CHA + Reputacja* + half a die,
 * the same shape melee (stage 16) and Pochwycenie (stage 14d) use. The defender
 * may replace it with a real roll from the chat card, which is the whole point:
 * nobody waits for an absent player, and nobody is denied their own dice.
 */
export function cpredPassiveFacedownTotal(cool: number, reputation: CpredReputation): number {
  return cpredFacedownBase(cool, reputation) + CPRED_PASSIVE_DIE;
}

/** Which side of a resolved Konfrontacja somebody is on. */
export type CpredFacedownOutcome = 'win' | 'tie' | 'loss';

/**
 * Who backed down, from the challenger's point of view.
 *
 * The odd one out among this project's opposed tests: a tie goes to *nobody*.
 * Everywhere else („W przypadku remisu Broniący zawsze wygrywa", s. 169) the
 * defender takes it, but the Konfrontacja paragraph overrides that in as many
 * words — „obie strony nie są pewne wyniku i nic się nie dzieje".
 */
export function resolveCpredFacedown(
  challengerTotal: number,
  defenderTotal: number,
): { outcome: CpredFacedownOutcome; margin: number } {
  const margin = challengerTotal - defenderTotal;
  return { outcome: margin > 0 ? 'win' : margin < 0 ? 'loss' : 'tie', margin };
}

/** What the loser chose to do about it (s. 194). */
export type CpredFacedownConcession = 'withdraw' | 'stand';

/**
 * Does this 1k10 mean „I have heard of you"?
 *
 * „Jeśli wynik jest niższy od aktualnego Poziomu Reputacji napotkanej osoby,
 * znasz tę osobę" — strictly lower, which has two consequences worth knowing
 * before somebody reports them as bugs: a Reputation of **1 is never
 * recognised** (the lowest a d10 shows is 1, and 1 < 1 is false), and even a
 * Reputation of **10 fails on a natural 10**. The chance is (level − 1)/10.
 */
export function cpredRecognises(roll: number, level: number): boolean {
  return roll < level;
}

/** Refusals the Konfrontacja paths produce, in the language the table speaks. */
export const CPRED_FACEDOWN_PROBLEM_MESSAGES = {
  FACEDOWN_SELF: 'Nie da się stanąć oko w oko z samym sobą.',
  FACEDOWN_NOT_THE_LOSER: 'Tylko przegrany Konfrontację decyduje, czy się wycofa.',
  FACEDOWN_ALREADY_SETTLED: 'Ta Konfrontacja została już rozstrzygnięta.',
  FACEDOWN_NO_LOSER: 'Remis — żadna ze stron nie ustąpiła, nie ma czego rozstrzygać.',
  NOT_AN_OPPOSED_TEST: 'Ta karta nie jest testem spornym.',
} as const;

export type CpredFacedownProblem = keyof typeof CPRED_FACEDOWN_PROBLEM_MESSAGES;
