import { describe, expect, it } from 'vitest';
import {
  COST_CATEGORIES,
  buildCompendium,
  dvForRange,
  formatCost,
  resolveWeapon,
  searchCompendium,
  validateCompendiumEntry,
  type CompendiumEntry,
  type CostCategory,
  type WeaponEntry,
} from './compendium.js';
import { slugify } from './ids.js';

const weaponType = {
  id: 'weapon-type.heavy-pistol',
  name: 'Ciężki pistolet',
  skillId: 'handgun',
  damage: '3k6',
  magazine: 8,
  rof: 2,
  hands: 1,
  concealable: true,
  attachmentSlots: 3,
  melee: false,
  rangeDv: [13, 15, 20, 25, 30, 30, null, null],
};

function weapon(overrides: Partial<WeaponEntry> = {}): unknown {
  return {
    id: 'weapon.test',
    category: 'weapon',
    name: 'Testowa spluwa',
    weaponTypeId: weaponType.id,
    quality: 'standard',
    cost: 100,
    ...overrides,
  };
}

describe('slugify', () => {
  it('transliterates Polish letters', () => {
    expect(slugify('Ciężki pistolet')).toBe('ciezki-pistolet');
    expect(slugify('Kurtka skórzana ŻÓŁW')).toBe('kurtka-skorzana-zolw');
  });

  it('collapses punctuation and trims separators', () => {
    expect(slugify('  Nomad .357 Magnum!  ')).toBe('nomad-357-magnum');
  });
});

describe('validateCompendiumEntry', () => {
  it('accepts a weapon that inherits its damage from a base type', () => {
    const result = validateCompendiumEntry(weapon());
    expect(result.ok).toBe(true);
  });

  it('derives the id from the name when none is given', () => {
    const result = validateCompendiumEntry(weapon({ id: undefined as unknown as string }));
    expect(result.ok && result.entry.id).toBe('weapon.testowa-spluwa');
  });

  it('requires damage when there is no base type', () => {
    const result = validateCompendiumEntry(weapon({ weaponTypeId: null }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.field).toBe('damage');
    expect(result.issues[0]?.message).toContain('obrażenia');
  });

  it('rejects damage that is not dice notation', () => {
    const result = validateCompendiumEntry(weapon({ weaponTypeId: null, damage: 'dużo' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.message).toContain('3k6');
  });

  it('accepts the Polish dice alias', () => {
    const result = validateCompendiumEntry(weapon({ weaponTypeId: null, damage: '5k6' }));
    expect(result.ok).toBe(true);
  });

  it('rejects armor without a location', () => {
    const result = validateCompendiumEntry({
      category: 'armor',
      name: 'Nic',
      sp: 7,
      locations: [],
      cost: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.field).toBe('locations');
  });

  it('rejects an armor penalty that is positive', () => {
    const result = validateCompendiumEntry({
      category: 'armor',
      name: 'Kurtka',
      sp: 7,
      locations: ['body'],
      penalty: 2,
      cost: null,
    });
    expect(result.ok).toBe(false);
  });

  it('keeps a cyberware humanity loss in dice notation', () => {
    const result = validateCompendiumEntry({
      category: 'cyberware',
      name: 'Cyberoko',
      humanityLoss: '2k6',
      cost: 100,
    });
    expect(result.ok && result.entry.category === 'cyberware' && result.entry.humanityLoss).toBe(
      '2k6',
    );
  });

  it('reports an unknown category instead of guessing', () => {
    const result = validateCompendiumEntry({ category: 'pojazd', name: 'Auto' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.field).toBe('category');
  });
});

describe('buildCompendium', () => {
  it('drops malformed rows instead of throwing', () => {
    const registry = buildCompendium([
      { weaponTypes: [weaponType, { id: 'bad' }], entries: [weapon(), { category: 'weapon' }] },
    ]);
    expect(registry.weaponTypes).toHaveLength(1);
    expect(registry.entries).toHaveLength(1);
  });

  it('lets later files win on id collisions (private overrides public)', () => {
    const registry = buildCompendium([
      { entries: [weapon({ name: 'Wersja przykładowa' })] },
      { entries: [weapon({ name: 'Wersja z podręcznika' })] },
    ]);
    expect(registry.entries[0]?.name).toBe('Wersja z podręcznika');
  });

  it('inherits the file source when an entry does not state its own', () => {
    const registry = buildCompendium([{ source: 'Easy Mode', entries: [weapon()] }]);
    expect(registry.entries[0]?.source).toBe('Easy Mode');
  });

  it('sorts entries with Polish collation', () => {
    const registry = buildCompendium([
      {
        entries: [
          weapon({ id: 'weapon.z', name: 'Zgrzyt' }),
          weapon({ id: 'weapon.l', name: 'Łom' }),
          weapon({ id: 'weapon.a', name: 'Ambit' }),
        ],
      },
    ]);
    expect(registry.entries.map((entry) => entry.name)).toEqual(['Ambit', 'Łom', 'Zgrzyt']);
  });
});

describe('resolveWeapon', () => {
  const registry = buildCompendium([{ weaponTypes: [weaponType], entries: [weapon()] }]);

  it('takes the numbers from the base type', () => {
    const entry = registry.entries[0] as WeaponEntry;
    const resolved = resolveWeapon(entry, registry);
    expect(resolved).toMatchObject({ damage: '3k6', magazine: 8, rof: 2, hands: 1 });
    expect(resolved.typeName).toBe('Ciężki pistolet');
  });

  it('lets the entry override single fields', () => {
    const custom = validateCompendiumEntry(weapon({ magazine: 6, rof: 1 }));
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;
    const resolved = resolveWeapon(custom.entry as WeaponEntry, registry);
    expect(resolved.magazine).toBe(6);
    expect(resolved.rof).toBe(1);
    expect(resolved.damage).toBe('3k6');
  });

  it('falls back to a safe default for an unknown base type', () => {
    const orphan = validateCompendiumEntry(
      weapon({ weaponTypeId: 'weapon-type.nieznany', damage: '2k6' }),
    );
    expect(orphan.ok).toBe(true);
    if (!orphan.ok) return;
    expect(resolveWeapon(orphan.entry as WeaponEntry, registry).damage).toBe('2k6');
  });
});

describe('dvForRange', () => {
  it('picks the DV of the band containing the distance', () => {
    expect(dvForRange(weaponType.rangeDv, 0)).toBe(13);
    expect(dvForRange(weaponType.rangeDv, 6)).toBe(13);
    expect(dvForRange(weaponType.rangeDv, 7)).toBe(15);
    expect(dvForRange(weaponType.rangeDv, 100)).toBe(30);
  });

  it('returns null beyond the weapon reach and for missing tables', () => {
    expect(dvForRange(weaponType.rangeDv, 250)).toBeNull();
    expect(dvForRange(weaponType.rangeDv, 5000)).toBeNull();
    expect(dvForRange(undefined, 10)).toBeNull();
    expect(dvForRange(weaponType.rangeDv, -1)).toBeNull();
  });
});

describe('searchCompendium', () => {
  const entries = buildCompendium([
    {
      weaponTypes: [weaponType],
      entries: [
        weapon({ id: 'weapon.a', name: 'Ciężka spluwa' }),
        weapon({ id: 'weapon.b', name: 'Lekki nóż', nameOriginal: 'Light Knife' }),
        {
          id: 'armor.k',
          category: 'armor',
          name: 'Kurtka skórzana',
          sp: 4,
          locations: ['body'],
          cost: 20,
        },
      ] as CompendiumEntry[],
    },
  ]).entries;

  it('ignores diacritics and case', () => {
    expect(searchCompendium(entries, 'ciezka').map((e) => e.name)).toEqual(['Ciężka spluwa']);
    expect(searchCompendium(entries, 'SKÓRZANA')).toHaveLength(1);
  });

  it('matches the original English name too', () => {
    expect(searchCompendium(entries, 'knife')).toHaveLength(1);
  });

  it('filters by category', () => {
    expect(searchCompendium(entries, '', 'armor')).toHaveLength(1);
    expect(searchCompendium(entries, '', 'weapon')).toHaveLength(2);
  });
});

describe('formatCost', () => {
  it('shows the band next to the price', () => {
    expect(formatCost({ cost: 550, costCategory: 'expensive' })).toBe('550 ed (Kosztowne)');
    expect(formatCost({ cost: 100 })).toBe('100 ed');
    expect(formatCost({ cost: null })).toBe('—');
    expect(formatCost({ cost: null, costCategory: 'costly' })).toBe('Drogie');
  });

  /**
   * „Drogie" (50 ed) sits below „Kosztowne" (500 ed) in the Polish edition —
   * the reverse of what the English band names suggest, and exactly the pair
   * that was swapped here until the rulebook import (stage 13). The ladder is
   * one price per band, so the price pins the label.
   */
  it('keeps the Polish bands in the rulebook order', () => {
    const ladder: [number, CostCategory, string][] = [
      [10, 'cheap', 'Tanie'],
      [20, 'everyday', 'Codzienne'],
      [50, 'costly', 'Drogie'],
      [100, 'premium', 'Premium'],
      [500, 'expensive', 'Kosztowne'],
      [1000, 'veryExpensive', 'Bardzo kosztowne'],
      [5000, 'luxury', 'Luksusowe'],
      [10_000, 'superLuxury', 'Superluksusowe'],
    ];
    expect(ladder.map(([, band]) => band)).toEqual([...COST_CATEGORIES]);
    for (const [cost, band, label] of ladder) {
      expect(formatCost({ cost, costCategory: band })).toBe(`${cost} ed (${label})`);
    }
  });
});

/**
 * Stage 16h flags on an ammunition row. The validator is the only thing between
 * a hand-typed catalogue and the combat code, so the cases that matter are the
 * half-filled ones: a check with no DV, a failure that costs nothing, a cloud
 * with a positive penalty.
 */
describe('ammunition without damage (stage 16h)', () => {
  function ammoInput(overrides: Record<string, unknown>) {
    return {
      id: 'ammo.test',
      category: 'ammo',
      name: 'Nabój testowy',
      cost: 10,
      patterns: ['grenade'],
      ...overrides,
    };
  }

  it('keeps a well-formed forced check whole', () => {
    const result = validateCompendiumEntry(
      ammoInput({
        noDamage: true,
        check: {
          skillId: 'resist-torture-drugs',
          skillLabel: 'Odporność na tortury/narkotyki',
          statId: 'will',
          dv: 13,
          biologicalOnly: true,
          failure: { damage: '2k6', statuses: ['prone'], durationS: 60 },
        },
      }),
    );
    expect(result.ok).toBe(true);
    const entry = result.ok && result.entry.category === 'ammo' ? result.entry : null;
    expect(entry?.noDamage).toBe(true);
    expect(entry?.check?.dv).toBe(13);
    expect(entry?.check?.statId).toBe('will');
    expect(entry?.check?.failure.durationS).toBe(60);
  });

  it('refuses a failure that costs nothing — it would roll dice for no reason', () => {
    const result = validateCompendiumEntry(
      ammoInput({ check: { skillId: 'resist-torture-drugs', dv: 13, failure: {} } }),
    );
    expect(result.ok).toBe(false);
  });

  it('refuses a check with no DV to beat', () => {
    const result = validateCompendiumEntry(
      ammoInput({ check: { skillId: 'resist-torture-drugs', failure: { damage: '2k6' } } }),
    );
    expect(result.ok).toBe(false);
  });

  it('refuses damage that is not dice', () => {
    const result = validateCompendiumEntry(
      ammoInput({
        check: { skillId: 'resist-torture-drugs', dv: 13, failure: { damage: 'dużo' } },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('takes a cloud of smoke and refuses one that helps the target', () => {
    const good = validateCompendiumEntry(ammoInput({ smoke: { sideM: 10, penalty: -4 } }));
    expect(good.ok).toBe(true);
    const bad = validateCompendiumEntry(ammoInput({ smoke: { sideM: 10, penalty: 4 } }));
    expect(bad.ok).toBe(false);
  });

  it('takes the smart round and keeps its cyberware warning', () => {
    const result = validateCompendiumEntry(
      ammoInput({ smart: { maxMiss: 4, bonus: 10, requires: 'Celownik optyczny' } }),
    );
    const entry = result.ok && result.entry.category === 'ammo' ? result.entry : null;
    expect(entry?.smart).toEqual({ maxMiss: 4, bonus: 10, requires: 'Celownik optyczny' });
  });
});
