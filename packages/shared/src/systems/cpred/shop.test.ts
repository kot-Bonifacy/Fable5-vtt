import { describe, expect, it } from 'vitest';
import type { CompendiumEntry } from './compendium.js';
import { SHOP_TIERS, isShopTier, validateCompendiumEntry } from './compendium.js';
import {
  CREATION_SHOP_TIER,
  SHOP_TIER_LABELS,
  clampShopTier,
  entryWithinTier,
  shopTierForPrice,
  shopTierOf,
  shopTierRefusalText,
} from './shop.js';

function gear(overrides: Partial<CompendiumEntry> = {}): CompendiumEntry {
  return {
    id: 'gear.test',
    category: 'gear',
    name: 'Przedmiot testowy',
    cost: null,
    ...overrides,
  } as CompendiumEntry;
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
      'Poziom 3 (Korporacyjne) — kampania ma odblokowany 1 (Uliczne).',
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
      expect(shopTierOf(result.entry)).toBe(4);
    }
  });
});
