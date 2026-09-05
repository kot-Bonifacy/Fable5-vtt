import { describe, expect, it } from 'vitest';
import { sanitizePingPoint } from './ping.js';

describe('sanitizePingPoint (etap 35)', () => {
  it('zaokrągla punkt do pełnych pikseli sceny', () => {
    expect(sanitizePingPoint(512.4, 640.6)).toEqual({ x: 512, y: 641 });
  });

  it('odrzuca wszystko, co nie jest parą skończonych liczb', () => {
    expect(sanitizePingPoint(NaN, 0)).toBeNull();
    expect(sanitizePingPoint(0, Infinity)).toBeNull();
    expect(sanitizePingPoint('100', 0)).toBeNull();
    expect(sanitizePingPoint(undefined, undefined)).toBeNull();
  });

  it('przepuszcza punkt spoza sceny — granice sądzi wołający, nie ta funkcja', () => {
    expect(sanitizePingPoint(-40, 99999)).toEqual({ x: -40, y: 99999 });
  });
});
