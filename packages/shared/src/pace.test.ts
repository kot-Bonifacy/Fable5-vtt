import { describe, expect, it } from 'vitest';
import {
  PACE_FALLBACK_CAP_M,
  PACE_REFILL_MS,
  paceAvailable,
  paceFullInMs,
  paceOwed,
  paceReadyInMs,
  paceSpend,
} from './pace.js';

describe('pula metrów Eksploracji', () => {
  it('figura bez wpisu ma pełną pulę', () => {
    expect(paceAvailable(null, 12, 0)).toBe(12);
    expect(paceFullInMs(undefined, 12, 0)).toBe(0);
    expect(paceOwed(null, 12, 5_000)).toBe(0);
  });

  it('wydatek zostawia dług, który maleje liniowo i znika po pełnej odnowie', () => {
    const spent = paceSpend(null, 12, 12, 1_000);
    expect(spent).toEqual({ owedM: 12, at: 1_000 });
    expect(paceAvailable(spent, 12, 1_000)).toBe(0);
    expect(paceAvailable(spent, 12, 1_000 + PACE_REFILL_MS / 2)).toBeCloseTo(6);
    expect(paceAvailable(spent, 12, 1_000 + PACE_REFILL_MS)).toBe(12);
    expect(paceAvailable(spent, 12, 1_000 + PACE_REFILL_MS * 5)).toBe(12);
  });

  it('odmawia wydatku ponad zapas, z luzem na zaokrąglenia', () => {
    const half = paceSpend(null, 12, 6, 0);
    expect(paceSpend(half, 12, 6.04, 0)).not.toBeNull();
    expect(paceSpend(half, 12, 6.2, 0)).toBeNull();
    expect(paceSpend(null, 12, 13, 0)).toBeNull();
  });

  it('kolejne wydatki sumują dług, ale nigdy ponad pełną pulę', () => {
    const first = paceSpend(null, 10, 4, 0);
    const second = paceSpend(first, 10, 6.03, 0);
    expect(second?.owedM).toBe(10);
  });

  it('pełna odnowa trwa tyle samo przy każdej wielkości puli', () => {
    const small = paceSpend(null, 4, 4, 0);
    const big = paceSpend(null, 20, 20, 0);
    expect(paceFullInMs(small, 4, 0)).toBe(PACE_REFILL_MS);
    expect(paceFullInMs(big, 20, 0)).toBe(PACE_REFILL_MS);
  });

  it('mówi, za ile uzbiera dany odcinek', () => {
    const empty = paceSpend(null, 10, 10, 0);
    expect(paceReadyInMs(empty, 10, 1, 0)).toBe(PACE_REFILL_MS / 10);
    expect(paceReadyInMs(empty, 10, 50, 0)).toBe(PACE_REFILL_MS);
    expect(paceReadyInMs(null, 10, 3, 0)).toBe(0);
  });

  it('zmniejszona pula (np. pancerz) nie daje ujemnego zapasu', () => {
    const spent = paceSpend(null, 12, 10, 0);
    expect(paceAvailable(spent, 8, 0)).toBe(0);
  });

  it('niepoprawna pula bierze wartość zapasową', () => {
    expect(paceAvailable(null, Number.NaN, 0)).toBe(PACE_FALLBACK_CAP_M);
    expect(paceAvailable(null, 0, 0)).toBe(PACE_FALLBACK_CAP_M);
  });

  it('cofnięty zegar nie dopisuje długu', () => {
    const spent = paceSpend(null, 12, 12, 10_000);
    expect(paceAvailable(spent, 12, 5_000)).toBe(0);
  });
});
