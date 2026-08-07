/**
 * Effects that come off by themselves (stage 16h) — pure arithmetic, no IO.
 *
 * Until this stage everything the VTT put on a figure stayed until somebody
 * took it off. The one exception, „Przygwożdżony" (14e), expires at the end of
 * its carrier's own turn and needs no clock at all — `expiresAtTurnEnd` is a
 * boolean. Tear gas is the first thing that lasts a *duration*: „przez minutę".
 *
 * A minute is six rounds, and that is the whole of the arithmetic. What it is
 * not is a wall clock: a round takes ten seconds of fiction and several minutes
 * of table, so counting real seconds would take the blindness off the victim
 * before their next turn came round. So the timer runs on rounds — and outside
 * a fight, where no round ever ticks, it does not run at all: the effect stays
 * and the GM gets a card with a button (session decision, 2026-08-07). Nothing
 * disappears without a person or a round deciding it, which is the same bargain
 * `damage:apply` makes with „Cofnij".
 */

/** „Runda trwa 10 sekund" — the clock every duration is measured in. */
export const CPRED_ROUND_SECONDS = 10;

/** The duration the ammunition table keeps reaching for: „na minutę". */
export const CPRED_MINUTE_S = 60;

/** Rounds a duration lasts, rounded up — half a round of blindness is a round. */
export function cpredRoundsFor(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.max(1, Math.ceil(seconds / CPRED_ROUND_SECONDS));
}

/**
 * The round an effect applied *now* comes off at, or null outside a fight.
 *
 * Null is not an error and not „forever": it is the honest answer when nothing
 * is counting. The effect is still marked as timed, and it is the GM's card
 * that ends it.
 */
export function cpredExpiryRound(currentRound: number | null, seconds: number): number | null {
  if (currentRound === null || !Number.isFinite(currentRound) || currentRound < 1) return null;
  const rounds = cpredRoundsFor(seconds);
  return rounds > 0 ? Math.round(currentRound) + rounds : null;
}

/**
 * What put a timed effect on a figure and when it comes off.
 *
 * Stored beside the status rather than inside its id, so „Nieprzytomny" from a
 * sleep round and „Nieprzytomny" from a choke are the same status to every rule
 * that reads it — only one of them has a timer.
 */
export interface CpredTimedEffect {
  /** Round of the running combat it expires at; absent when nothing counts. */
  expiresAtRound?: number;
  /** „Amunicja usypiająca" — what the prompt card and the sheet say. */
  source: string;
  /** Duration in seconds of fiction, for the label („na minutę"). */
  durationS: number;
}

/** True once the round counter has caught up with the timer. */
export function cpredTimedExpired(timer: CpredTimedEffect, round: number): boolean {
  return timer.expiresAtRound !== undefined && round >= timer.expiresAtRound;
}

/** „na minutę" / „na 30 s" — how a duration reads on a card. */
export function describeCpredDuration(seconds: number): string {
  if (seconds === CPRED_MINUTE_S) return 'na minutę';
  if (seconds >= CPRED_MINUTE_S && seconds % CPRED_MINUTE_S === 0) {
    return `na ${seconds / CPRED_MINUTE_S} min`;
  }
  return `na ${seconds} s`;
}

/**
 * „na minutę — do rundy 9" / „na minutę — poza walką, zdejmuje MG".
 *
 * The second half matters more than it looks: a player whose character is
 * unconscious needs to know whether anything is counting down, and the two
 * cases are not distinguishable from the status badge alone.
 */
export function describeCpredTimer(timer: CpredTimedEffect): string {
  const duration = describeCpredDuration(timer.durationS);
  return timer.expiresAtRound !== undefined
    ? `${duration} — do rundy ${timer.expiresAtRound}`
    : `${duration} — poza walką, zdejmuje MG`;
}
