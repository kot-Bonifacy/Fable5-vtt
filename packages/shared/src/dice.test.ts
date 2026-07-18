import { describe, expect, it } from 'vitest';
import {
  createSeededRng,
  formatRollNotation,
  isCheckFormula,
  parseRollNotation,
  rollCheck,
  rollFormula,
  type DiceRng,
  type RollFormula,
} from './dice.js';

/** RNG returning scripted values in order; throws when the script runs out. */
function scriptedRng(values: number[]): DiceRng {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('scripted rng exhausted');
    return values[i++]!;
  };
}

function parse(notation: string): RollFormula {
  const parsed = parseRollNotation(notation);
  if (!parsed.ok) throw new Error(`expected ${notation} to parse, got ${parsed.error}`);
  return parsed.formula;
}

describe('parseRollNotation', () => {
  it('parses a single die with modifier', () => {
    expect(parse('1d10+7')).toEqual({
      terms: [
        { kind: 'dice', sign: 1, count: 1, sides: 10 },
        { kind: 'modifier', sign: 1, value: 7 },
      ],
    });
  });

  it('parses multiple terms with mixed signs', () => {
    expect(parse('2d6+3-1d4-2')).toEqual({
      terms: [
        { kind: 'dice', sign: 1, count: 2, sides: 6 },
        { kind: 'modifier', sign: 1, value: 3 },
        { kind: 'dice', sign: -1, count: 1, sides: 4 },
        { kind: 'modifier', sign: -1, value: 2 },
      ],
    });
  });

  it('defaults the dice count to 1 and accepts a leading sign', () => {
    expect(parse('d10')).toEqual({ terms: [{ kind: 'dice', sign: 1, count: 1, sides: 10 }] });
    expect(parse('-d6+2')).toEqual({
      terms: [
        { kind: 'dice', sign: -1, count: 1, sides: 6 },
        { kind: 'modifier', sign: 1, value: 2 },
      ],
    });
  });

  it('accepts the Polish k alias and ignores whitespace and case', () => {
    expect(parse(' 1K10 + 5 ')).toEqual(parse('1d10+5'));
    expect(parse('2k6')).toEqual(parse('2d6'));
  });

  it('rejects malformed input', () => {
    for (const bad of ['', '   ', 'abc', '1d', 'd', '+', '1d10++5', '1d10+', '2x6', '1.5d6']) {
      const parsed = parseRollNotation(bad);
      expect(parsed.ok, `should reject: "${bad}"`).toBe(false);
    }
  });

  it('rejects out-of-range dice', () => {
    expect(parseRollNotation('0d6')).toEqual({ ok: false, error: 'TOO_MANY_DICE' });
    expect(parseRollNotation('21d6')).toEqual({ ok: false, error: 'TOO_MANY_DICE' });
    expect(parseRollNotation('1d1')).toEqual({ ok: false, error: 'BAD_SIDES' });
    expect(parseRollNotation('1d1001')).toEqual({ ok: false, error: 'BAD_SIDES' });
    expect(parseRollNotation('1+1+1+1+1+1+1+1+1+1+1')).toEqual({
      ok: false,
      error: 'TOO_MANY_TERMS',
    });
  });
});

describe('formatRollNotation', () => {
  it('renders canonical notation', () => {
    expect(formatRollNotation(parse(' 1K10 +5 '))).toBe('1d10+5');
    expect(formatRollNotation(parse('-d6+2d4-1'))).toBe('-1d6+2d4-1');
  });
});

describe('isCheckFormula', () => {
  it('is true only for exactly one added d10', () => {
    expect(isCheckFormula(parse('1d10'))).toBe(true);
    expect(isCheckFormula(parse('1d10+7'))).toBe(true);
    expect(isCheckFormula(parse('2d10'))).toBe(false);
    expect(isCheckFormula(parse('1d10+1d10'))).toBe(false);
    expect(isCheckFormula(parse('-1d10+5'))).toBe(false);
    expect(isCheckFormula(parse('2d6+3'))).toBe(false);
  });
});

describe('rollFormula', () => {
  it('sums dice and modifiers with signs', () => {
    const result = rollFormula(parse('2d6+3-1d4'), scriptedRng([4, 5, 2]));
    expect(result.terms).toEqual([
      { kind: 'dice', sign: 1, count: 2, sides: 6, rolls: [4, 5], subtotal: 9 },
      { kind: 'modifier', sign: 1, value: 3, subtotal: 3 },
      { kind: 'dice', sign: -1, count: 1, sides: 4, rolls: [2], subtotal: -2 },
    ]);
    expect(result.total).toBe(10);
    expect(result.notation).toBe('2d6+3-1d4');
    expect(result.critical).toBeUndefined();
    expect(result.criticalDamage).toBe(false);
  });

  it('applies the crit rule: natural 10 adds one extra d10', () => {
    const result = rollFormula(parse('1d10+7'), scriptedRng([10, 6]));
    expect(result.critical).toEqual({ type: 'crit', extraRoll: 6 });
    expect(result.total).toBe(10 + 6 + 7);
  });

  it('applies the fumble rule: natural 1 subtracts one extra d10', () => {
    const result = rollFormula(parse('1d10+7'), scriptedRng([1, 4]));
    expect(result.critical).toEqual({ type: 'fumble', extraRoll: 4 });
    expect(result.total).toBe(1 - 4 + 7);
  });

  it('never chains the extra die (a 10 on the reroll does not explode)', () => {
    // The scripted RNG would throw on a third draw — no chain happens.
    const result = rollFormula(parse('1d10'), scriptedRng([10, 10]));
    expect(result.critical).toEqual({ type: 'crit', extraRoll: 10 });
    expect(result.total).toBe(20);
  });

  it('does not apply the check rule outside check formulas', () => {
    const twoDice = rollFormula(parse('2d10'), scriptedRng([10, 1]));
    expect(twoDice.critical).toBeUndefined();
    expect(twoDice.total).toBe(11);
  });

  it('flags critical damage on two or more added sixes', () => {
    expect(rollFormula(parse('3d6'), scriptedRng([6, 6, 2])).criticalDamage).toBe(true);
    expect(rollFormula(parse('3d6'), scriptedRng([6, 5, 2])).criticalDamage).toBe(false);
    // Sixes across separate d6 terms still count together.
    expect(rollFormula(parse('1d6+1d6'), scriptedRng([6, 6])).criticalDamage).toBe(true);
    // Subtracted d6 dice never contribute to the flag.
    expect(rollFormula(parse('2d6-2d6'), scriptedRng([6, 1, 6, 6])).criticalDamage).toBe(false);
  });
});

describe('rollCheck', () => {
  it('builds 1d10+modifier with the check rule active', () => {
    const result = rollCheck(7, scriptedRng([10, 3]));
    expect(result.notation).toBe('1d10+7');
    expect(result.critical).toEqual({ type: 'crit', extraRoll: 3 });
    expect(result.total).toBe(20);
  });

  it('supports negative and zero modifiers', () => {
    expect(rollCheck(-2, scriptedRng([5])).total).toBe(3);
    expect(rollCheck(-2, scriptedRng([5])).notation).toBe('1d10-2');
    expect(rollCheck(0, scriptedRng([5])).notation).toBe('1d10');
  });
});

describe('createSeededRng', () => {
  it('is deterministic for a given seed and stays within [1, sides]', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    for (let i = 0; i < 200; i++) {
      const roll = a(10);
      expect(roll).toBe(b(10));
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(10);
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    const rollsA = Array.from({ length: 20 }, () => a(10));
    const rollsB = Array.from({ length: 20 }, () => b(10));
    expect(rollsA).not.toEqual(rollsB);
  });
});
