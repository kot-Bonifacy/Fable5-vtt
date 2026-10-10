import { describe, expect, it } from 'vitest';
import type { CompendiumEntry } from './compendium.js';
import { SHOP_TIERS, buildCompendium, isShopTier, validateCompendiumEntry } from './compendium.js';
import { cpredScaledEntry } from './pricing.js';
import {
  CREATION_ROLE_TOOL_TIER,
  CREATION_SHOP_TIER,
  EMPTY_SHOP_RULES,
  SHOP_TIER_LABELS,
  clampShopTier,
  creationShopRefusalText,
  creationShopVerdict,
  entryWithinTier,
  isCpredRoleTool,
  mergeShopRules,
  parseShopRules,
  readShopTierOverrides,
  shopTierForPrice,
  shopTierOf,
  shopTierRefusalText,
  shopTierVerdict,
  withShopTiers,
  type CreationShopRules,
} from './shop.js';

// Etap 47a: wpisy jak w rejestrze — ceny podręcznika przeliczone cennikiem domowym.
function gear(overrides: Record<string, unknown> = {}): CompendiumEntry {
  return cpredScaledEntry({
    id: 'gear.test',
    category: 'gear',
    name: 'Przedmiot testowy',
    cost: null,
    ...overrides,
  } as CompendiumEntry);
}

function weapon(overrides: Record<string, unknown> = {}): CompendiumEntry {
  return cpredScaledEntry({
    id: 'weapon.test',
    category: 'weapon',
    name: 'Broń testowa',
    weaponTypeId: 'weapon-type.heavy-pistol',
    quality: 'standard',
    cost: 100,
    ...overrides,
  } as CompendiumEntry);
}

function entry(fields: Record<string, unknown>): CompendiumEntry {
  return cpredScaledEntry({
    id: 'entry.test',
    name: 'Wpis testowy',
    cost: 100,
    ...fields,
  } as CompendiumEntry);
}

describe('shopTierForPrice', () => {
  it('puts the rulebook price ladder on four rungs', () => {
    // Tanie 10, Codzienne 20, Drogie 50 — everything a kiosk sells.
    expect(shopTierForPrice(10)).toBe(1);
    expect(shopTierForPrice(20)).toBe(1);
    expect(shopTierForPrice(50)).toBe(1);
    // Premium 100, Kosztowne 500 — what a working merc buys.
    expect(shopTierForPrice(100)).toBe(2);
    expect(shopTierForPrice(500)).toBe(2);
    // Bardzo kosztowne 1000.
    expect(shopTierForPrice(1000)).toBe(3);
    // Luksusowe 5000 and above.
    expect(shopTierForPrice(5000)).toBe(4);
    expect(shopTierForPrice(10_000)).toBe(4);
  });

  it('reads the price between two rungs on the lower one', () => {
    // A branded gun at 550 ed is priced above „Kosztowne" but nowhere near
    // „Bardzo kosztowne" — it stays professional gear, not corporate.
    expect(shopTierForPrice(51)).toBe(2);
    expect(shopTierForPrice(550)).toBe(3);
    expect(shopTierForPrice(1001)).toBe(4);
  });

  it('treats an entry with no price at all as street level', () => {
    // „Cena: —" is a row nobody finished typing; the buy path refuses it for
    // having no price, and it must not become a rarity by accident.
    expect(shopTierForPrice(null)).toBe(1);
    expect(shopTierOf(gear())).toBe(1);
  });
});

describe('shopTierOf', () => {
  it('derives the tier from the printed price', () => {
    expect(shopTierOf(gear({ cost: 20 }))).toBe(1);
    expect(shopTierOf(gear({ cost: 1000 }))).toBe(3);
  });

  it('derives it from the band when the entry carries only a band', () => {
    expect(shopTierOf(gear({ cost: null, costCategory: 'luxury' }))).toBe(4);
    expect(shopTierOf(gear({ cost: null, costCategory: 'everyday' }))).toBe(1);
  });

  it('lets the entry override the rung its price would put it on', () => {
    // The GM's own call: a cheap gun that is still hard to come by.
    expect(shopTierOf(gear({ cost: 20, tier: 4 }))).toBe(4);
    expect(shopTierOf(gear({ cost: 5000, tier: 1 }))).toBe(1);
  });
});

describe('entryWithinTier', () => {
  it('sells everything up to the campaign level and nothing above it', () => {
    const rifle = gear({ cost: 500 });
    expect(entryWithinTier(rifle, 1)).toBe(false);
    expect(entryWithinTier(rifle, 2)).toBe(true);
    expect(entryWithinTier(rifle, 4)).toBe(true);
  });

  it('holds the character creator to street level', () => {
    expect(CREATION_SHOP_TIER).toBe(1);
    expect(entryWithinTier(gear({ cost: 100 }), CREATION_SHOP_TIER)).toBe(false);
    expect(entryWithinTier(gear({ cost: 50 }), CREATION_SHOP_TIER)).toBe(true);
  });
});

describe('clampShopTier', () => {
  it('accepts the four tiers and folds everything else into range', () => {
    for (const tier of SHOP_TIERS) expect(clampShopTier(tier)).toBe(tier);
    expect(clampShopTier(0)).toBe(1);
    expect(clampShopTier(9)).toBe(4);
    expect(clampShopTier(2.4)).toBe(2);
    expect(clampShopTier('3')).toBe(1);
    expect(clampShopTier(null)).toBe(1);
    expect(clampShopTier(Number.NaN)).toBe(1);
  });

  it('knows a tier from anything else', () => {
    expect(isShopTier(1)).toBe(true);
    expect(isShopTier(5)).toBe(false);
    expect(isShopTier('1')).toBe(false);
  });
});

describe('shopTierRefusalText', () => {
  it('names both levels, because „nie stać cię" would be a lie', () => {
    expect(shopTierRefusalText(3, 1)).toBe(
      'Poziom 3 (Wojskowe) — kampania ma odblokowany 1 (Uliczne).',
    );
    expect(SHOP_TIER_LABELS[4]).toBe('Czarny rynek');
  });
});

describe('tier on a catalogue entry', () => {
  it('survives validation', () => {
    const result = validateCompendiumEntry({
      id: 'gear.przyklad',
      category: 'gear',
      name: 'Przykład',
      cost: 20,
      tier: 3,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entry.tier).toBe(3);
  });

  it('is dropped rather than refused when it makes no sense', () => {
    // A nonsense tier must not cost the campaign a catalogue row — the entry
    // simply falls back to the rung its price puts it on.
    const result = validateCompendiumEntry({
      id: 'gear.przyklad',
      category: 'gear',
      name: 'Przykład',
      cost: 5000,
      tier: 42,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.tier).toBeUndefined();
      expect(shopTierOf(cpredScaledEntry(result.entry))).toBe(4);
    }
  });
});

describe('shopTierVerdict — rule by kind (naprawa 3b)', () => {
  it('reads a weapon off its type, not its price', () => {
    // Until 17.09 a 500 ed rocket launcher sat on „Zawodowe" with a camera.
    expect(shopTierOf(weapon({ weaponTypeId: 'weapon-type.rocket-launcher', cost: 500 }))).toBe(4);
    expect(shopTierOf(weapon({ weaponTypeId: 'weapon-type.assault-rifle', cost: 500 }))).toBe(3);
    expect(shopTierOf(weapon({ weaponTypeId: 'weapon-type.heavy-pistol', cost: 100 }))).toBe(2);
    expect(shopTierOf(weapon({ weaponTypeId: 'weapon-type.medium-pistol', cost: 50 }))).toBe(1);
    expect(shopTierOf(weapon({ weaponTypeId: 'weapon-type.heavy-melee', cost: 100 }))).toBe(1);
  });

  it('puts an excellent weapon one rung up and says why', () => {
    const verdict = shopTierVerdict(
      weapon({ weaponTypeId: 'weapon-type.medium-pistol', quality: 'excellent', cost: 550 }),
      { weaponTypeName: () => 'Średni pistolet' },
    );
    expect(verdict).toEqual({
      tier: 2,
      source: 'kind',
      reason: 'typ broni: Średni pistolet · doskonała jakość +1',
    });
  });

  it('lets price push a kind up, never down', () => {
    // A 5000 ed branded shotgun is black market; a 20 ed rifle is still military.
    const luxury = shopTierVerdict(weapon({ weaponTypeId: 'weapon-type.shotgun', cost: 5000 }));
    expect(luxury.tier).toBe(4);
    expect(luxury.reason).toMatch(/cena 50\s000 ed podnosi poziom$/);
    expect(shopTierOf(weapon({ weaponTypeId: 'weapon-type.assault-rifle', cost: 20 }))).toBe(3);
    // „Bardzo kosztowne" lifts street kinds to at least Zawodowe.
    expect(shopTierOf(entry({ category: 'armor', sp: 7, locations: ['body'], cost: 1000 }))).toBe(
      2,
    );
    expect(shopTierOf(entry({ category: 'cyberware', type: 'fashionware', cost: 1000 }))).toBe(2);
  });

  it('reads armour off its SP', () => {
    const armor = (sp: number) => entry({ category: 'armor', sp, locations: ['body'] });
    expect([4, 7, 10, 12, 13, 15, 18].map((sp) => shopTierOf(armor(sp)))).toEqual([
      1, 1, 2, 2, 3, 3, 4,
    ]);
  });

  it('reads cyberware off its family and Programs off their class', () => {
    const cyber = (type: string) => entry({ category: 'cyberware', type });
    expect(shopTierOf(cyber('fashionware'))).toBe(1);
    expect(shopTierOf(cyber('cyberoptics'))).toBe(2);
    expect(shopTierOf(cyber('borgware'))).toBe(4);
    const program = (programClass: string, blackIce = false) =>
      entry({ category: 'program', programClass, blackIce, atk: 0, def: 0, rez: 0, cost: 50 });
    expect(shopTierOf(program('booster'))).toBe(2);
    expect(shopTierOf(program('attacker'))).toBe(3);
    // Black ICE at 50 ed used to be street level.
    expect(shopTierVerdict(program('attacker', true))).toEqual({
      tier: 4,
      source: 'kind',
      reason: 'Czarny LOD',
    });
    expect(shopTierOf(gear({ cost: 100, deckSlots: 4 }))).toBe(2);
  });

  it('falls back on the price ladder for a kind it cannot read', () => {
    expect(shopTierVerdict(gear({ cost: 500 }))).toEqual({
      tier: 2,
      source: 'price',
      reason: 'cena 5 000 ed — brak reguły dla tego rodzaju',
    });
    expect(shopTierVerdict(weapon({ weaponTypeId: null, cost: 20 })).source).toBe('price');
  });

  it('takes the GM over the entry and the entry over the rule', () => {
    const vial = gear({ id: 'gear.vial', cost: 100, tier: 4 });
    expect(shopTierVerdict(vial)).toEqual({
      tier: 4,
      source: 'entry',
      reason: 'przypisane w danych kompendium',
    });
    expect(shopTierVerdict(vial, { overrides: { 'gear.vial': 2 } })).toEqual({
      tier: 2,
      source: 'campaign',
      reason: 'ustawione przez MG w tej kampanii',
    });
    // An explicit tier is not lifted by price.
    expect(shopTierOf(gear({ cost: 5000, tier: 3 }))).toBe(3);
  });
});

describe('readShopTierOverrides', () => {
  it('keeps id → tier pairs and drops everything else', () => {
    expect(readShopTierOverrides('{"a":2,"b":9,"c":"3","":1}')).toEqual({ a: 2 });
    expect(readShopTierOverrides('nie json')).toEqual({});
    expect(readShopTierOverrides(null)).toEqual({});
    expect(readShopTierOverrides([1, 2])).toEqual({});
  });
});

describe('shop-tiers.json', () => {
  it('parses tiers and Role tools and reports junk', () => {
    const { rules, issues } = parseShopRules({
      tiers: { 'gear.a': 2, 'gear.b': 7 },
      roleTools: {
        medtech: { entries: ['gear.a', 5] },
        solo: { weaponTypes: ['weapon-type.shotgun'] },
        nomad: 'nie',
      },
    });
    expect(rules).toEqual({
      tiers: { 'gear.a': 2 },
      roleTools: {
        medtech: { weaponTypes: [], entries: ['gear.a'] },
        solo: { weaponTypes: ['weapon-type.shotgun'], entries: [] },
      },
    });
    expect(issues).toHaveLength(2);
    expect(parseShopRules(null).issues).toHaveLength(1);
  });

  it('lets the private file win per id and per Role', () => {
    const merged = mergeShopRules(
      { tiers: { a: 1, b: 2 }, roleTools: { solo: { weaponTypes: ['x'], entries: [] } } },
      { tiers: { b: 3 }, roleTools: { solo: { weaponTypes: [], entries: ['y'] } } },
    );
    expect(merged).toEqual({
      tiers: { a: 1, b: 3 },
      roleTools: { solo: { weaponTypes: [], entries: ['y'] } },
    });
    expect(mergeShopRules(EMPTY_SHOP_RULES, EMPTY_SHOP_RULES)).toEqual(EMPTY_SHOP_RULES);
  });

  it('writes the assignments onto the catalogue entries', () => {
    const registry = buildCompendium([
      {
        entries: [
          { id: 'gear.vial', category: 'gear', name: 'Fiolka', cost: 100 },
          { id: 'gear.torch', category: 'gear', name: 'Latarka', cost: 20 },
        ],
      },
    ]);
    const tiered = withShopTiers(registry, { 'gear.vial': 4, 'gear.unknown': 2 });
    expect(tiered.entryById.get('gear.vial')?.tier).toBe(4);
    expect(tiered.entryById.get('gear.torch')?.tier).toBeUndefined();
    expect(tiered.entries.find((row) => row.id === 'gear.vial')?.tier).toBe(4);
    // The loaded registry itself is not mutated.
    expect(registry.entryById.get('gear.vial')?.tier).toBeUndefined();
  });
});

describe('creationShopVerdict — Role tools (naprawa 3b)', () => {
  const rules: CreationShopRules = {
    roleTools: {
      medtech: { weaponTypes: [], entries: ['gear.medbag', 'gear.military'] },
      solo: { weaponTypes: ['weapon-type.heavy-pistol'], entries: [] },
    },
  };
  const medbag = gear({ id: 'gear.medbag', cost: 100, tier: 2 });
  const military = gear({ id: 'gear.military', cost: 100, tier: 3 });

  it('sells street level to everybody', () => {
    expect(creationShopVerdict(gear({ cost: 20 }), null, rules)).toEqual({
      allowed: true,
      tier: 1,
      roleTool: false,
    });
  });

  it('sells a Role its own tools up to Zawodowe and nobody else', () => {
    expect(CREATION_ROLE_TOOL_TIER).toBe(2);
    expect(creationShopVerdict(medbag, 'medtech', rules)).toEqual({
      allowed: true,
      tier: 2,
      roleTool: true,
    });
    expect(creationShopVerdict(medbag, 'solo', rules).allowed).toBe(false);
    expect(creationShopVerdict(medbag, null, rules).allowed).toBe(false);
    expect(creationShopVerdict(military, 'medtech', rules)).toEqual({
      allowed: false,
      tier: 3,
      roleTool: true,
    });
  });

  it('matches every weapon of a listed type, branded ones included', () => {
    const avenger = weapon({ id: 'weapon.avenger', cost: 100 });
    const fancy = weapon({ id: 'weapon.fancy', quality: 'excellent', cost: 550 });
    expect(isCpredRoleTool(avenger, rules.roleTools.solo)).toBe(true);
    expect(creationShopVerdict(avenger, 'solo', rules).allowed).toBe(true);
    // Excellent quality climbs to Wojskowe — past the cap.
    expect(creationShopVerdict(fancy, 'solo', rules)).toEqual({
      allowed: false,
      tier: 3,
      roleTool: true,
    });
  });

  it('follows the GM when a tool is moved up for this campaign', () => {
    const moved = { ...rules, overrides: { 'gear.medbag': 3 as const } };
    expect(creationShopVerdict(medbag, 'medtech', moved).allowed).toBe(false);
  });

  it('explains the refusal in the creator’s own terms', () => {
    expect(creationShopRefusalText(2, false)).toBe(
      'Poziom 2 (Zawodowe) — w kreatorze tylko Uliczne i narzędzia własnej Roli.',
    );
    expect(creationShopRefusalText(3, true)).toBe(
      'Poziom 3 (Wojskowe) — narzędzia Roli kreator sprzedaje najwyżej do poziomu 2 (Zawodowe).',
    );
  });
});
