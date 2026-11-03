import { describe, expect, it } from 'vitest';
import { rollShowsTotal } from './chat-roll-total.js';

describe('rollShowsTotal', () => {
  it('writes the sum when the roll has no outcome badge', () => {
    expect(rollShowsTotal({ total: 11 })).toBe(true);
  });

  it('skips the sum the Test badge already opens with', () => {
    const outcome = { success: true, label: 'Sukces', detail: '21 > PT 15' };
    expect(rollShowsTotal({ total: 21, outcome })).toBe(false);
    const opposed = { success: false, label: 'Porażka', detail: '12 vs 14 (druga strona: …)' };
    expect(rollShowsTotal({ total: 12, outcome: opposed })).toBe(false);
  });

  it('keeps the sum when the badge speaks of something else', () => {
    expect(
      rollShowsTotal({
        total: 17,
        outcome: { success: true, label: 'Skaner', detail: '3 gniazda' },
      }),
    ).toBe(true);
    expect(
      rollShowsTotal({ total: 7, outcome: { success: true, label: 'Targ dobity', detail: '' } }),
    ).toBe(true);
  });

  it('does not take a longer number for the sum', () => {
    const outcome = { success: true, label: 'Sukces', detail: '210 vs PT 15' };
    expect(rollShowsTotal({ total: 21, outcome })).toBe(true);
  });

  it('reads a negative sum', () => {
    const outcome = { success: false, label: 'Porażka', detail: '-2 ≤ PT 9' };
    expect(rollShowsTotal({ total: -2, outcome })).toBe(false);
  });
});
