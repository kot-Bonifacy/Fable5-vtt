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

  it('keeps the whole cyberware row the tables print (stage 23a)', () => {
    const result = validateCompendiumEntry({
      category: 'cyberware',
      name: 'Celownik optyczny',
      type: 'cyberoptics',
      install: 'clinic',
      humanityLoss: '1k6',
      humanityLossFixed: 3,
      humanityLossHalved: true,
      slotCost: 2,
      requires: 'cyberoka',
      cost: 500,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.entry.category !== 'cyberware') return;
    expect(result.entry).toMatchObject({
      type: 'cyberoptics',
      install: 'clinic',
      humanityLossFixed: 3,
      humanityLossHalved: true,
      slotCost: 2,
      requires: 'cyberoka',
    });
  });

  it('drops an unknown cyberware family instead of refusing the entry', () => {
    const result = validateCompendiumEntry({
      category: 'cyberware',
      name: 'Wszczep MG',
      type: 'wynalazek',
      cost: 100,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.entry.category !== 'cyberware') return;
    expect(result.entry.type).toBeUndefined();
  });

  it('refuses a slot count outside the schema', () => {
    const result = validateCompendiumEntry({
      category: 'cyberware',
      name: 'Cyberręka',
      slots: 99,
      cost: 500,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.field).toBe('slots');
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

/**
 * Stage 26a — Programs, Black ICE and Demons. Numbers below are invented, like
 * everything else in this suite.
 */
describe('program entries', () => {
  function programInput(extra: Record<string, unknown> = {}) {
    return {
      category: 'program',
      name: 'Iskra',
      cost: 20,
      programClass: 'booster',
      atk: 0,
      def: 0,
      rez: 6,
      ...extra,
    };
  }

  it('takes a Booster and gives it one deck slot', () => {
    const result = validateCompendiumEntry(programInput());
    expect(result.ok).toBe(true);
    if (!result.ok || result.entry.category !== 'program') return;
    expect(result.entry.id).toBe('program.iskra');
    expect(result.entry.programClass).toBe('booster');
    expect(result.entry.slots).toBeUndefined();
  });

  it('refuses an entry with no class', () => {
    const result = validateCompendiumEntry(programInput({ programClass: 'jakiś' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.field).toBe('programClass');
  });

  it('keeps PER and PRĘ on Black ICE and drops them everywhere else', () => {
    const ice = validateCompendiumEntry(
      programInput({ programClass: 'attacker', blackIce: true, per: 4, speed: 6 }),
    );
    expect(ice.ok && ice.entry.category === 'program' ? ice.entry.per : null).toBe(4);

    const plain = validateCompendiumEntry(programInput({ per: 4, speed: 6 }));
    expect(plain.ok && plain.entry.category === 'program' ? plain.entry.per : 'dropped').toBe(
      undefined,
    );
  });

  it('refuses a stat outside the range any Program could carry', () => {
    expect(validateCompendiumEntry(programInput({ rez: 900 })).ok).toBe(false);
  });

  it('stores a slot count only when it differs from what the class implies', () => {
    const implied = validateCompendiumEntry(
      programInput({ programClass: 'attacker', blackIce: true, slots: 2 }),
    );
    expect(implied.ok && implied.entry.category === 'program' ? implied.entry.slots : 'set').toBe(
      undefined,
    );
    const odd = validateCompendiumEntry(programInput({ slots: 3 }));
    expect(odd.ok && odd.entry.category === 'program' ? odd.entry.slots : null).toBe(3);
  });

  it('takes a Demon under a slug the id rules allow', () => {
    const result = validateCompendiumEntry({
      category: 'netDefense',
      name: 'Chochlik',
      cost: 1000,
      defenseKind: 'demon',
      rez: 12,
      interfaceRank: 3,
      netActions: 2,
      combatValue: 12,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.entry.category !== 'netDefense') return;
    expect(result.entry.id).toBe('demon.chochlik');
    expect(result.entry.combatValue).toBe(12);
  });

  it('refuses a Net defender with no kind', () => {
    const result = validateCompendiumEntry({ category: 'netDefense', name: 'Coś', cost: 0 });
    expect(result.ok).toBe(false);
  });

  it('takes a defence system with only the cells its table prints (stage 26d)', () => {
    // Kamera obserwacyjna nie ma Wartości bojowej ani RUCH-u i to nie jest
    // wiersz w połowie wypełniony — to jest kamera.
    const camera = validateCompendiumEntry({
      category: 'netDefense',
      name: 'Oko korytarza',
      cost: 500,
      defenseKind: 'environment',
      disableDv: 9,
      disableMinutes: 1,
      hp: 5,
      spotDv: 17,
      trigger: 'Cel wchodzi na korytarz.',
    });
    expect(camera.ok).toBe(true);
    if (!camera.ok || camera.entry.category !== 'netDefense') return;
    expect(camera.entry.spotDv).toBe(17);
    // Pusta komórka zostaje pusta: „PW: brak" to nie „PW 0".
    expect(camera.entry.combatValue).toBeUndefined();
    expect(camera.entry.rez).toBeUndefined();
  });

  it('keeps a turret’s Combat Value and refuses a nonsense one', () => {
    const turret = validateCompendiumEntry({
      category: 'netDefense',
      name: 'Grzechot',
      cost: 5000,
      defenseKind: 'emplacement',
      combatValue: 14,
      hp: 25,
      disableDv: 17,
    });
    expect(
      turret.ok && turret.entry.category === 'netDefense' ? turret.entry.combatValue : null,
    ).toBe(14);
    expect(
      validateCompendiumEntry({
        category: 'netDefense',
        name: 'Zły dron',
        cost: 0,
        defenseKind: 'drone',
        move: -3,
      }).ok,
    ).toBe(false);
  });

  it('still demands all four numbers from a Demon', () => {
    const result = validateCompendiumEntry({
      category: 'netDefense',
      name: 'Kulawy demon',
      cost: 1000,
      defenseKind: 'demon',
      rez: 12,
      interfaceRank: 'trzy',
    });
    expect(result.ok).toBe(false);
  });

  it('keeps a defence system’s effect as data (stage 26f)', () => {
    const floor = validateCompendiumEntry({
      category: 'netDefense',
      name: 'Podłoga pod ladą',
      cost: 1000,
      defenseKind: 'environment',
      disableDv: 13,
      hp: 20,
      spotDv: 17,
      trigger: 'Cel wchodzi na zelektryfikowany obszar.',
      effects: { damage: '6k6', noAblation: true, repeats: true },
    });
    expect(floor.ok).toBe(true);
    if (!floor.ok || floor.entry.category !== 'netDefense') return;
    expect(floor.entry.effects).toEqual({ damage: '6k6', noAblation: true, repeats: true });
  });

  it('takes a defence system whose effect will not parse, and drops the effect', () => {
    // Wiersz z połamanym efektem to wiersz, który MG rozstrzyga sam — tam, gdzie
    // stały wszystkie te wiersze przed 26f. Odmowa zapisu byłaby regresją.
    const broken = validateCompendiumEntry({
      category: 'netDefense',
      name: 'Coś dziwnego',
      cost: 1000,
      defenseKind: 'environment',
      disableDv: 13,
      effects: { damage: 42, check: { skillId: 'athletics' } },
    });
    expect(broken.ok).toBe(true);
    if (!broken.ok || broken.entry.category !== 'netDefense') return;
    expect(broken.entry.effects).toBeUndefined();
  });

  it('takes deck slots on gear and refuses a nonsense count', () => {
    const deck = validateCompendiumEntry({
      category: 'gear',
      name: 'Dek przykładowy',
      cost: 300,
      deckSlots: 6,
    });
    expect(deck.ok && deck.entry.category === 'gear' ? deck.entry.deckSlots : null).toBe(6);
    expect(
      validateCompendiumEntry({ category: 'gear', name: 'Zły dek', cost: 0, deckSlots: 0 }).ok,
    ).toBe(false);
  });
});

/**
 * 29.08: dwa pola, które przenoszą efekt rany z prozy do danych — mnożnik
 * trafień w głowę („Pęknięta czaszka", s. 188) i kara warunkowa, której VTT
 * nie zastosuje samo („−4 do wszystkich Akcji wykonywanych tą ręką", s. 187).
 */
describe('validateCompendiumEntry — rana krytyczna, pola z 29.08', () => {
  function injury(overrides: Record<string, unknown> = {}) {
    return {
      category: 'criticalInjury',
      name: 'Pęknięta czaszka',
      table: 'head',
      roll: 9,
      description: 'Pomnóż obrażenia głowy przez 3.',
      cost: null,
      ...overrides,
    };
  }

  it('zapisuje mnożnik ×3', () => {
    const result = validateCompendiumEntry(injury({ headDamageMultiplier: 3 }));
    expect(result.ok && result.entry.category === 'criticalInjury' && result.entry).toMatchObject({
      headDamageMultiplier: 3,
    });
  });

  it('nie zapisuje ×2 — to i tak robi każde trafienie w głowę', () => {
    const result = validateCompendiumEntry(injury({ headDamageMultiplier: 2 }));
    expect(result.ok && 'headDamageMultiplier' in result.entry).toBe(false);
  });

  it('odrzuca mnożnik spoza zakresu zamiast wpuścić literówkę MG', () => {
    expect(validateCompendiumEntry(injury({ headDamageMultiplier: 1 })).ok).toBe(false);
    expect(validateCompendiumEntry(injury({ headDamageMultiplier: 99 })).ok).toBe(false);
  });

  it('zapisuje karę warunkową razem z warunkiem', () => {
    const result = validateCompendiumEntry(
      injury({
        name: 'Strzaskane palce',
        table: 'body',
        roll: 11,
        conditionalPenalty: { value: -4, condition: 'wszystkich Akcji wykonywanych tą ręką' },
      }),
    );
    expect(result.ok && result.entry.category === 'criticalInjury' && result.entry).toMatchObject({
      conditionalPenalty: { value: -4, condition: 'wszystkich Akcji wykonywanych tą ręką' },
    });
  });

  it('odmawia kary bez warunku — sama liczba to `actionPenalty`', () => {
    const result = validateCompendiumEntry(injury({ conditionalPenalty: { value: -4 } }));
    expect(result.ok).toBe(false);
  });

  it('odmawia kary dodatniej — rana nikomu nie pomaga', () => {
    const result = validateCompendiumEntry(
      injury({ conditionalPenalty: { value: 2, condition: 'czegokolwiek' } }),
    );
    expect(result.ok).toBe(false);
  });
});

describe('validateWeaponType — połowa pancerza', () => {
  function type(overrides: Record<string, unknown> = {}) {
    return {
      id: 'weapon-type.custom',
      name: 'Nóż motylkowy',
      skillId: 'melee-weapon',
      damage: '2k6',
      melee: true,
      ...overrides,
    };
  }

  it('przyjmuje flagę na broni białej', () => {
    const registry = buildCompendium([{ weaponTypes: [type({ halvesArmor: true })], entries: [] }]);
    expect(registry.weaponTypeById.get('weapon-type.custom')?.halvesArmor).toBe(true);
  });

  it('odrzuca ją na broni dystansowej — to zasada walki wręcz', () => {
    const registry = buildCompendium([
      { weaponTypes: [type({ melee: false, halvesArmor: true })], entries: [] },
    ]);
    expect(registry.weaponTypeById.get('weapon-type.custom')?.halvesArmor).toBeUndefined();
  });

  it('przenosi ją na rozwiązaną broń, więc planner widzi ją bez pytania o typ', () => {
    const registry = buildCompendium([{ weaponTypes: [type({ halvesArmor: true })], entries: [] }]);
    const entry = validateCompendiumEntry({
      category: 'weapon',
      id: 'weapon.noz',
      name: 'Nóż',
      cost: 50,
      weaponTypeId: 'weapon-type.custom',
    });
    if (!entry.ok) throw new Error('nie zbudowałem wpisu broni');
    const resolved = resolveWeapon(entry.entry as WeaponEntry, registry);
    expect(resolved.halvesArmor).toBe(true);
  });
});
