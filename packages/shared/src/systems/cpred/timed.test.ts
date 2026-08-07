import { describe, expect, it } from 'vitest';
import {
  CPRED_MINUTE_S,
  CPRED_ROUND_SECONDS,
  cpredExpiryRound,
  cpredRoundsFor,
  cpredTimedExpired,
  describeCpredDuration,
  describeCpredTimer,
} from './timed.js';

/**
 * „Na minutę" (stage 16h) — the first duration this VTT counts.
 *
 * The arithmetic is small and the edge cases are all about *not* counting: no
 * fight, a fight that has not started, a duration nobody set. Each of them has
 * to leave the effect in place rather than expiring it early, because an effect
 * that quietly lifts is worse than one somebody has to click away.
 */
describe('cpredRoundsFor', () => {
  it('turns a minute into six rounds', () => {
    expect(cpredRoundsFor(CPRED_MINUTE_S)).toBe(CPRED_MINUTE_S / CPRED_ROUND_SECONDS);
    expect(cpredRoundsFor(CPRED_MINUTE_S)).toBe(6);
  });

  it('rounds up — half a round of blindness is a round', () => {
    expect(cpredRoundsFor(15)).toBe(2);
    expect(cpredRoundsFor(1)).toBe(1);
  });

  it('counts nothing for a duration nobody set', () => {
    expect(cpredRoundsFor(0)).toBe(0);
    expect(cpredRoundsFor(-30)).toBe(0);
    expect(cpredRoundsFor(Number.NaN)).toBe(0);
  });
});

describe('cpredExpiryRound', () => {
  it('adds the duration to the round it was applied in', () => {
    expect(cpredExpiryRound(3, CPRED_MINUTE_S)).toBe(9);
  });

  it('gives no round outside a fight — nothing is counting', () => {
    expect(cpredExpiryRound(null, CPRED_MINUTE_S)).toBeNull();
  });

  it('gives no round before the first one starts', () => {
    // Round 0 is „participants gathered, nobody has acted yet".
    expect(cpredExpiryRound(0, CPRED_MINUTE_S)).toBeNull();
  });
});

describe('cpredTimedExpired', () => {
  const timer = { source: 'Amunicja usypiająca', durationS: CPRED_MINUTE_S, expiresAtRound: 9 };

  it('holds until the round counter catches up', () => {
    expect(cpredTimedExpired(timer, 8)).toBe(false);
    expect(cpredTimedExpired(timer, 9)).toBe(true);
    expect(cpredTimedExpired(timer, 12)).toBe(true);
  });

  it('never expires a timer with no round to expire at', () => {
    const outside = { source: 'Amunicja łzawiąca', durationS: CPRED_MINUTE_S };
    expect(cpredTimedExpired(outside, 1)).toBe(false);
    expect(cpredTimedExpired(outside, 9999)).toBe(false);
  });
});

describe('describing a timer', () => {
  it('names the common duration in words', () => {
    expect(describeCpredDuration(CPRED_MINUTE_S)).toBe('na minutę');
    expect(describeCpredDuration(120)).toBe('na 2 min');
    expect(describeCpredDuration(30)).toBe('na 30 s');
  });

  it('says whether anything is counting down', () => {
    expect(
      describeCpredTimer({ source: 'x', durationS: CPRED_MINUTE_S, expiresAtRound: 9 }),
    ).toContain('do rundy 9');
    expect(describeCpredTimer({ source: 'x', durationS: CPRED_MINUTE_S })).toContain('zdejmuje MG');
  });
});
