import { describe, expect, it } from 'vitest';
import { cpredHidingDv, cpredHidingDvText } from './hiding.js';

/** Kości z listy, po kolei. */
function dice(...values: number[]) {
  let index = 0;
  return () => values[index++] ?? 1;
}

describe('cpredHidingDv (58d)', () => {
  it('rolls the hider’s Stealth into the DV the spotter has to beat', () => {
    const hiding = cpredHidingDv({ stealth: { total: 12, label: 'Skradanie' } }, dice(7));
    expect(hiding).toEqual({ source: 'stealth', dv: 19, base: 12, die: 7, label: 'Skradanie' });
    expect(cpredHidingDvText(hiding!)).toBe('Skradanie 12 + 7 = 19');
  });

  it('applies the check rule — a natural 10 explodes, a natural 1 drops', () => {
    expect(cpredHidingDv({ stealth: { total: 12, label: 'Skradanie' } }, dice(10, 4))?.dv).toBe(26);
    expect(cpredHidingDv({ stealth: { total: 12, label: 'Skradanie' } }, dice(1, 6))?.dv).toBe(7);
  });

  it('a sheet outranks the GM’s number — the figure rolls what it has', () => {
    const hiding = cpredHidingDv(
      { stealth: { total: 4, label: 'Skradanie' }, spotDv: 30 },
      dice(5),
    );
    expect(hiding?.source).toBe('stealth');
    expect(hiding?.dv).toBe(9);
  });

  it('a figure without a sheet takes the GM’s DV', () => {
    const hiding = cpredHidingDv({ stealth: null, spotDv: 15 }, dice(9));
    expect(hiding).toEqual({ source: 'gm', dv: 15 });
    expect(cpredHidingDvText(hiding!)).toBe('PT od MG 15');
  });

  it('no sheet and no DV — nobody spots it by rolling', () => {
    expect(cpredHidingDv({ stealth: null, spotDv: null }, dice(9))).toBeNull();
    expect(cpredHidingDv({}, dice(9))).toBeNull();
  });
});
