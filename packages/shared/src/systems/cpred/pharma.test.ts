import { describe, expect, it } from 'vitest';
import { cpredHasAirhypo } from './pharma.js';

describe('cpredHasAirhypo', () => {
  it('finds the syringe by name, whatever the case and spacing', () => {
    expect(cpredHasAirhypo([{ name: '  strzykawka BEZIGŁOWA ', qty: 1 }])).toBe(true);
  });

  it('ignores a row with nothing left and anything that only looks similar', () => {
    expect(cpredHasAirhypo([{ name: 'Strzykawka bezigłowa', qty: 0 }])).toBe(false);
    expect(cpredHasAirhypo([{ name: 'Strzykawka', qty: 3 }])).toBe(false);
    expect(cpredHasAirhypo([])).toBe(false);
  });
});
