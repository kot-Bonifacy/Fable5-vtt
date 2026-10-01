import { describe, expect, it } from 'vitest';
import { polishPlural } from './plural.js';

const figures = (n: number) => `${n} ${polishPlural(n, 'figura', 'figury', 'figur')}`;

describe('polishPlural', () => {
  it('picks one of the three Polish forms', () => {
    expect(figures(1)).toBe('1 figura');
    expect(figures(2)).toBe('2 figury');
    expect(figures(4)).toBe('4 figury');
    expect(figures(5)).toBe('5 figur');
    expect(figures(0)).toBe('0 figur');
  });

  it('treats the teens as „many” and 22–24 as „few”', () => {
    expect(figures(12)).toBe('12 figur');
    expect(figures(14)).toBe('14 figur');
    expect(figures(22)).toBe('22 figury');
    expect(figures(104)).toBe('104 figury');
    expect(figures(111)).toBe('111 figur');
    expect(figures(21)).toBe('21 figur');
  });
});
