import { describe, expect, it } from 'vitest';
import {
  buildCpredRegistry,
  createDefaultCharacterData,
  mergeCharacterData,
  parseCharacterData,
  validateCharacterDataPatch,
  type CpredRegistry,
} from './character.js';
import { deathSaveTarget, hpMax, humanityMax, seriousWoundThreshold, skillBase } from './derived.js';
import { sanitizeCharacterName } from '../../characters.js';

const registry: CpredRegistry = buildCpredRegistry(
  {
    skills: [
      { id: 'handgun', name: 'Broń krótka', stat: 'ref' },
      { id: 'paramedic', name: 'Ratownictwo medyczne', stat: 'tech', multiplier: 2 },
    ],
  },
  {
    roles: [
      { id: 'solo', name: 'Solo', ability: 'Zmysł Walki' },
      { id: 'medtech', name: 'Medyk', ability: 'Medycyna' },
    ],
  },
);

describe('derived values', () => {
  it('computes hpMax = 10 + 5*ceil((body+will)/2)', () => {
    expect(hpMax({ body: 5, will: 5 })).toBe(35);
    expect(hpMax({ body: 3, will: 8 })).toBe(40); // Forty from Easy Mode
    expect(hpMax({ body: 7, will: 6 })).toBe(45); // Mover from Easy Mode
    expect(hpMax({ body: 2, will: 2 })).toBe(20);
    expect(hpMax({ body: 10, will: 10 })).toBe(60);
  });

  it('computes the seriously wounded threshold as half hpMax rounded up', () => {
    expect(seriousWoundThreshold({ body: 3, will: 8 })).toBe(20);
    expect(seriousWoundThreshold({ body: 6, will: 3 })).toBe(18); // 35 HP → 18
    expect(seriousWoundThreshold({ body: 7, will: 6 })).toBe(23); // Mover: 45 → 23
  });

  it('death save target equals BODY', () => {
    expect(deathSaveTarget({ body: 7 })).toBe(7);
  });

  it('humanity max is EMP × 10', () => {
    expect(humanityMax({ emp: 6 })).toBe(60);
  });

  it('skill base is stat + level', () => {
    expect(skillBase(7, 6)).toBe(13);
  });
});

describe('hp recomputation on stat changes (stage criterion)', () => {
  it('changing BODY/WILL changes hpMax and clamps hpCurrent', () => {
    const data = createDefaultCharacterData(); // stats all 5 → 35 HP
    expect(data.hpCurrent).toBe(35);
    const weakened = mergeCharacterData(data, { stats: { ...data.stats, body: 2, will: 2 } });
    expect(hpMax(weakened.stats)).toBe(20);
    expect(weakened.hpCurrent).toBe(20); // clamped down from 35
    const buffed = mergeCharacterData(weakened, { stats: { ...weakened.stats, body: 8 } });
    expect(hpMax(buffed.stats)).toBe(35);
    expect(buffed.hpCurrent).toBe(20); // raising max never heals
  });

  it('clamps luck and humanity to their stat-derived maxima', () => {
    const data = createDefaultCharacterData();
    const merged = mergeCharacterData(data, { stats: { ...data.stats, luck: 2, emp: 3 } });
    expect(merged.luckCurrent).toBe(2);
    expect(merged.humanityCurrent).toBe(30);
  });
});

describe('validateCharacterDataPatch', () => {
  it('accepts a valid patch', () => {
    const result = validateCharacterDataPatch(
      {
        stats: { ...createDefaultCharacterData().stats, ref: 8 },
        skills: { handgun: 6 },
        roleId: 'solo',
        roleAbilityRank: 4,
        eddies: 500,
        weapons: [{ id: 'w1', name: 'Ciężki pistolet', damage: '3k6', ammo: '8', rof: '2', notes: '' }],
      },
      registry,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.skills).toEqual({ handgun: 6 });
      expect(result.patch.roleId).toBe('solo');
    }
  });

  it('rejects out-of-range stats with a Polish message', () => {
    const stats = { ...createDefaultCharacterData().stats, int: 11 };
    const result = validateCharacterDataPatch({ stats }, registry);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.field).toBe('stats.int');
      expect(result.issues[0]?.message).toContain('od 1 do 10');
      expect(result.issues[0]?.message).toContain('Inteligencja');
    }
  });

  it('rejects non-integer and negative stat values', () => {
    const base = createDefaultCharacterData().stats;
    expect(validateCharacterDataPatch({ stats: { ...base, dex: 5.5 } }, registry).ok).toBe(false);
    expect(validateCharacterDataPatch({ stats: { ...base, dex: 0 } }, registry).ok).toBe(false);
  });

  it('rejects unknown roles, accepts null', () => {
    expect(validateCharacterDataPatch({ roleId: 'jedi' }, registry).ok).toBe(false);
    expect(validateCharacterDataPatch({ roleId: null }, registry).ok).toBe(true);
  });

  it('drops unknown skill ids but rejects bad levels', () => {
    const dropped = validateCharacterDataPatch({ skills: { flying: 3, handgun: 2 } }, registry);
    expect(dropped.ok).toBe(true);
    if (dropped.ok) expect(dropped.patch.skills).toEqual({ handgun: 2 });
    expect(validateCharacterDataPatch({ skills: { handgun: 11 } }, registry).ok).toBe(false);
  });

  it('removes level-0 skills from the record', () => {
    const result = validateCharacterDataPatch({ skills: { handgun: 0, paramedic: 4 } }, registry);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patch.skills).toEqual({ paramedic: 4 });
  });

  it('rejects oversized item lists and bad rows', () => {
    const rows = Array.from({ length: 41 }, (_, i) => ({ id: `g${i}`, name: 'x', notes: '', qty: 1 }));
    expect(validateCharacterDataPatch({ gear: rows }, registry).ok).toBe(false);
    expect(
      validateCharacterDataPatch({ armor: [{ id: 'a1', name: 'Kurtka', notes: '', sp: 99 }] }, registry)
        .ok,
    ).toBe(false);
  });

  it('rejects negative eddies', () => {
    const result = validateCharacterDataPatch({ eddies: -5 }, registry);
    expect(result.ok).toBe(false);
  });
});

describe('parseCharacterData', () => {
  it('fills defaults for malformed JSON', () => {
    const data = parseCharacterData('not-json', registry);
    expect(data.schemaVersion).toBe(1);
    expect(data.stats.int).toBe(5);
  });

  it('keeps valid fields and defaults invalid ones', () => {
    const data = parseCharacterData(
      JSON.stringify({ eddies: 1234, roleId: 'ghost', skills: { handgun: 3 } }),
      registry,
    );
    expect(data.eddies).toBe(1234);
    expect(data.roleId).toBeNull();
    expect(data.skills).toEqual({ handgun: 3 });
  });
});

describe('sanitizeCharacterName', () => {
  it('trims and bounds the name', () => {
    expect(sanitizeCharacterName('  Mover ')).toBe('Mover');
    expect(sanitizeCharacterName('')).toBeNull();
    expect(sanitizeCharacterName('x'.repeat(65))).toBeNull();
    expect(sanitizeCharacterName(42)).toBeNull();
  });
});
