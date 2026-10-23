import { describe, expect, it } from 'vitest';
import {
  CPRED_DISARM_TRIED_MAX,
  cpredTrapDisarmDv,
  cpredTrapDisarmOpening,
  cpredTrapDisarmOutcome,
  cpredTrapDisarmTried,
} from './trapdisarm.js';

describe('rozbrajanie pułapki (58b)', () => {
  it('PT z nadpisania MG wygrywa z wpisem, a bez obu nie ma czego rozbrajać', () => {
    expect(cpredTrapDisarmDv(null, 13)).toBe(13);
    expect(cpredTrapDisarmDv(undefined, 13)).toBe(13);
    expect(cpredTrapDisarmDv(17, 13)).toBe(17);
    expect(cpredTrapDisarmDv(9, undefined)).toBe(9);
    expect(cpredTrapDisarmDv(null, undefined)).toBeNull();
  });

  it('Test Elektroniki i zabezpieczeń z PT strefy', () => {
    expect(
      cpredTrapDisarmOpening({ dv: 13, tried: [], characterId: 'c1', inCombat: false }),
    ).toEqual({ kind: 'test', skillId: 'electronics-security', dv: 13 });
  });

  it('odmawia bez PT, w walce i po nieudanej próbie — w tej kolejności', () => {
    expect(
      cpredTrapDisarmOpening({ dv: null, tried: ['c1'], characterId: 'c1', inCombat: true }),
    ).toEqual({ kind: 'refused', error: 'ZONE_NO_DISARM' });
    expect(
      cpredTrapDisarmOpening({ dv: 13, tried: ['c1'], characterId: 'c1', inCombat: true }),
    ).toEqual({ kind: 'refused', error: 'DISARM_IN_COMBAT' });
    expect(
      cpredTrapDisarmOpening({ dv: 13, tried: ['c1'], characterId: 'c1', inCombat: false }),
    ).toEqual({ kind: 'refused', error: 'DISARM_TRIED' });
    expect(
      cpredTrapDisarmOpening({ dv: 13, tried: ['c2'], characterId: 'c1', inCombat: false }).kind,
    ).toBe('test');
  });

  it('porażka o 5 i więcej odpala system, o mniej — nie', () => {
    expect(cpredTrapDisarmOutcome(true, 14, 13)).toBe('disarmed');
    expect(cpredTrapDisarmOutcome(false, 13, 13)).toBe('kept');
    expect(cpredTrapDisarmOutcome(false, 9, 13)).toBe('kept');
    expect(cpredTrapDisarmOutcome(false, 8, 13)).toBe('backfire');
    expect(cpredTrapDisarmOutcome(false, 2, 13)).toBe('backfire');
  });

  it('lista prób trzyma postać raz i ma sufit', () => {
    expect(cpredTrapDisarmTried(['a'], 'a')).toEqual(['a']);
    expect(cpredTrapDisarmTried(['a'], 'b')).toEqual(['a', 'b']);
    const full = Array.from({ length: CPRED_DISARM_TRIED_MAX }, (_, i) => `c${i}`);
    const next = cpredTrapDisarmTried(full, 'new');
    expect(next).toHaveLength(CPRED_DISARM_TRIED_MAX);
    expect(next.at(-1)).toBe('new');
  });
});
