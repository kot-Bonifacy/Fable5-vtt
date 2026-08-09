import { describe, expect, it } from 'vitest';
import {
  CPRED_FACEDOWN_PENALTY,
  cpredFacedownBase,
  cpredFacedownReputationModifier,
  cpredPassiveFacedownTotal,
  cpredRecognises,
  cpredReputation,
  cpredSheetReputation,
  NO_REPUTATION,
  resolveCpredFacedown,
} from './reputation.js';
import { createDefaultCharacterData, type CpredReputationSource } from './character.js';
import { CPRED_PASSIVE_DIE } from './attacks.js';
import { validateCharacterDataPatch, parseCharacterData } from './character.js';
import { EMPTY_CPRED_REGISTRY } from './character.js';

function deed(
  id: string,
  level: number,
  extra: Partial<CpredReputationSource> = {},
): CpredReputationSource {
  return { id, level, note: `wyczyn ${id}`, ...extra };
}

describe('cpredReputation', () => {
  it('is zero for a character nobody has heard of', () => {
    expect(cpredReputation([])).toEqual(NO_REPUTATION);
    expect(cpredReputation([]).level).toBe(0);
  });

  it('takes the highest level, whatever order the deeds were entered in', () => {
    const current = cpredReputation([deed('a', 2), deed('b', 7), deed('c', 4)]);
    expect(current.level).toBe(7);
    expect(current.source?.id).toBe('b');
  });

  it('never lets a lower deed replace a higher one (RAW s. 193)', () => {
    // The GM adds a fresh deed worth 3 to somebody already famous at 8.
    const current = cpredReputation([deed('koncert', 8), deed('bijatyka', 3)]);
    expect(current.level).toBe(8);
    expect(current.source?.id).toBe('koncert');
  });

  it('gives an equal level to the newer deed — the fresher story is the one told', () => {
    const current = cpredReputation([deed('stare', 4), deed('nowe', 4, { notorious: true })]);
    expect(current.source?.id).toBe('nowe');
    expect(current.notorious).toBe(true);
  });

  it('carries the shameful flag of the winning deed only', () => {
    const current = cpredReputation([
      deed('tchorzostwo', 2, { notorious: true }),
      deed('napad', 6),
    ]);
    expect(current.level).toBe(6);
    expect(current.notorious).toBe(false);
  });

  it('reads straight off a sheet', () => {
    const data = { ...createDefaultCharacterData(), reputationSources: [deed('a', 5)] };
    expect(cpredSheetReputation(data).level).toBe(5);
  });
});

describe('cpredFacedownReputationModifier', () => {
  it('adds fame and subtracts infamy (the asterisk in „CHA + Reputacja*")', () => {
    expect(cpredFacedownReputationModifier({ level: 4, notorious: false, source: null })).toBe(4);
    expect(cpredFacedownReputationModifier({ level: 4, notorious: true, source: null })).toBe(-4);
    expect(cpredFacedownReputationModifier(NO_REPUTATION)).toBe(0);
  });

  it('builds the fixed half of the roll from CHA and Reputation', () => {
    expect(cpredFacedownBase(7, { level: 3, notorious: false, source: null })).toBe(10);
    // Famous for running away: CHA 7 and Reputation 3 leaves 4.
    expect(cpredFacedownBase(7, { level: 3, notorious: true, source: null })).toBe(4);
  });

  it('substitutes half a die for the side that has not rolled', () => {
    expect(cpredPassiveFacedownTotal(6, NO_REPUTATION)).toBe(6 + CPRED_PASSIVE_DIE);
  });
});

describe('resolveCpredFacedown', () => {
  it('gives the win to whoever rolled higher', () => {
    expect(resolveCpredFacedown(18, 12)).toEqual({ outcome: 'win', margin: 6 });
    expect(resolveCpredFacedown(11, 15)).toEqual({ outcome: 'loss', margin: -4 });
  });

  it('resolves a draw to nobody — unlike every other opposed test in CP RED', () => {
    // s. 194: „obie strony nie są pewne wyniku i nic się nie dzieje". An attack
    // or a Pochwycenie would hand this to the defender.
    expect(resolveCpredFacedown(14, 14).outcome).toBe('tie');
  });

  it('names the penalty the loser may take instead of withdrawing', () => {
    expect(CPRED_FACEDOWN_PENALTY).toBe(-2);
  });
});

describe('cpredRecognises', () => {
  it('recognises on a roll strictly below the level (s. 193)', () => {
    expect(cpredRecognises(3, 4)).toBe(true);
    expect(cpredRecognises(4, 4)).toBe(false);
    expect(cpredRecognises(5, 4)).toBe(false);
  });

  it('never recognises somebody nobody has heard of', () => {
    for (let roll = 1; roll <= 10; roll += 1) expect(cpredRecognises(roll, 0)).toBe(false);
  });

  it('never recognises a Reputation of 1, and lets a 10 slip past a Reputation of 10', () => {
    // Both fall out of „niższy od" read literally, and both surprise people:
    // the lowest a d10 shows is 1, so level 1 has no winning roll at all, and
    // level 10 still fails on a natural 10. The chance is (level − 1)/10.
    for (let roll = 1; roll <= 10; roll += 1) expect(cpredRecognises(roll, 1)).toBe(false);
    expect(cpredRecognises(9, 10)).toBe(true);
    expect(cpredRecognises(10, 10)).toBe(false);
  });
});

describe('reputation rows on the sheet', () => {
  it('accepts a well-formed deed', () => {
    const result = validateCharacterDataPatch(
      {
        reputationSources: [{ id: 'a1', level: 6, note: 'Koncert w Afterlife', at: '2026-08-09' }],
      },
      EMPTY_CPRED_REGISTRY,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patch.reputationSources?.[0]?.at).toBe('2026-08-09');
  });

  it('refuses a level outside the rulebook table', () => {
    for (const level of [0, 11, 2.5]) {
      const result = validateCharacterDataPatch(
        { reputationSources: [{ id: 'a1', level, note: '' }] },
        EMPTY_CPRED_REGISTRY,
      );
      expect(result.ok).toBe(false);
    }
  });

  it('drops a half-typed date instead of blocking the save', () => {
    const result = validateCharacterDataPatch(
      { reputationSources: [{ id: 'a1', level: 2, note: '', at: '2026-08' }] },
      EMPTY_CPRED_REGISTRY,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patch.reputationSources?.[0]?.at).toBeUndefined();
  });

  it('survives a round trip through the stored JSON column', () => {
    const data = {
      ...createDefaultCharacterData(),
      reputationSources: [deed('a1', 9, { notorious: true, at: '2026-01-02' })],
    };
    const parsed = parseCharacterData(JSON.stringify(data), EMPTY_CPRED_REGISTRY);
    expect(cpredSheetReputation(parsed)).toMatchObject({ level: 9, notorious: true });
  });

  it('defaults an old sheet written before stage 23c to no reputation', () => {
    const parsed = parseCharacterData('{"schemaVersion":2}', EMPTY_CPRED_REGISTRY);
    expect(parsed.reputationSources).toEqual([]);
    expect(cpredSheetReputation(parsed).level).toBe(0);
  });
});
