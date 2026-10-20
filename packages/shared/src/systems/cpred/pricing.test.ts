import { describe, expect, it } from 'vitest';
import type { CompendiumEntry } from './compendium.js';
import { buildCompendium } from './compendium.js';
import { entryPrice } from './economy.js';
import {
  CPRED_PRICE_SCALE_AMMO,
  CPRED_PRICE_SCALE_DURABLE,
  cpredCatalogPriceScale,
  cpredScaleCatalogPrices,
  cpredScaledEntry,
} from './pricing.js';
import { shopTierForPrice, shopTierOf } from './shop.js';

function entry(fields: Record<string, unknown>): CompendiumEntry {
  return { id: 'entry.test', name: 'Wpis', cost: 100, ...fields } as CompendiumEntry;
}

describe('cennik domowy (etap 47a)', () => {
  it('mnoży sprzęt trwały ×10, drobny sprzęt ogólny ×3, a amunicję zostawia', () => {
    expect(cpredCatalogPriceScale(entry({ category: 'weapon' }))).toBe(CPRED_PRICE_SCALE_DURABLE);
    expect(cpredCatalogPriceScale(entry({ category: 'armor' }))).toBe(10);
    expect(cpredCatalogPriceScale(entry({ category: 'cyberware', costCategory: 'cheap' }))).toBe(
      10,
    );
    expect(cpredCatalogPriceScale(entry({ category: 'program' }))).toBe(10);
    expect(cpredCatalogPriceScale(entry({ category: 'ammo', costCategory: 'expensive' }))).toBe(
      CPRED_PRICE_SCALE_AMMO,
    );
    expect(cpredScaledEntry(entry({ category: 'ammo', cost: 10 })).cost).toBe(10);
    // Sprzęt ogólny: Tanie, Codzienne i Drogie (10–50 ed) to drobiazg…
    for (const band of ['cheap', 'everyday', 'costly']) {
      expect(cpredCatalogPriceScale(entry({ category: 'gear', costCategory: band }))).toBe(3);
    }
    // …od Premium w górę — elektronika i narzędzia.
    expect(cpredCatalogPriceScale(entry({ category: 'gear', costCategory: 'premium' }))).toBe(10);
    // Komputer z tanich pasm jest wyjątkiem: 150 ed byłoby dziesięć razy taniej od agenta.
    expect(
      cpredCatalogPriceScale(
        entry({ id: 'gear.komputer', category: 'gear', costCategory: 'costly' }),
      ),
    ).toBe(10);
    // Słuchawki wygłuszające ×2: 2000 ed zamiast 10 000 (decyzja MG z 10.10.2026).
    const earProtectors = cpredScaledEntry(
      entry({
        id: 'gear.automatyczne-sluchawki-wygluszajace',
        category: 'gear',
        cost: 1000,
        costCategory: 'veryExpensive',
      }),
    );
    expect(earProtectors.cost).toBe(2000);
    expect(shopTierOf(earProtectors)).toBe(shopTierForPrice(1000));
    // Magazynek bębnowy ×4: 2000 ed, dalej tańszy od broni z dodatkami, a nie droższy od pistoletu.
    const drum = cpredScaledEntry(
      entry({ id: 'attachment.drum-magazine', category: 'attachment', cost: 500 }),
    );
    expect(drum.cost).toBe(2000);
    // Nóż z marketu nie kosztuje jak pistolet (decyzja MG z 20.10.2026).
    const knife = cpredScaledEntry(
      entry({ id: 'weapon.light-melee', category: 'weapon', cost: 50, costCategory: 'costly' }),
    );
    expect(knife.cost).toBe(50);
    expect(shopTierOf(knife)).toBe(shopTierForPrice(50));
    const pistol = cpredScaledEntry(
      entry({ id: 'weapon.medium-pistol', category: 'weapon', cost: 50, costCategory: 'costly' }),
    );
    expect(pistol.cost).toBe(500);
  });

  it('zmienia kwotę, a pasmo zostawia', () => {
    const pistol = cpredScaledEntry(
      entry({ category: 'weapon', cost: 100, costCategory: 'premium' }),
    );
    expect(pistol.cost).toBe(1000);
    expect(pistol.costCategory).toBe('premium');
    // Bez ceny i za darmo — nic do mnożenia.
    expect(cpredScaledEntry(entry({ category: 'weapon', cost: null })).cost).toBeNull();
    expect(cpredScaledEntry(entry({ category: 'weapon', cost: 0 })).cost).toBe(0);
  });

  it('wpis z samym pasmem kosztuje cenę pasma razy mnożnik swojego rodzaju', () => {
    expect(entryPrice(entry({ category: 'weapon', cost: null, costCategory: 'premium' }))).toBe(
      1000,
    );
    expect(entryPrice(entry({ category: 'gear', cost: null, costCategory: 'everyday' }))).toBe(60);
  });

  it('przelicza cały katalog i jego indeks naraz', () => {
    const registry = cpredScaleCatalogPrices(
      buildCompendium([
        {
          entries: [
            {
              id: 'gear.latarka',
              category: 'gear',
              name: 'Latarka',
              cost: 20,
              costCategory: 'everyday',
            },
            {
              id: 'gear.agent',
              category: 'gear',
              name: 'Agent',
              cost: 100,
              costCategory: 'premium',
            },
          ],
        },
      ]),
    );
    expect(registry.entryById.get('gear.latarka')?.cost).toBe(60);
    expect(registry.entryById.get('gear.agent')?.cost).toBe(1000);
    expect(registry.entries.find((row) => row.id === 'gear.agent')?.cost).toBe(1000);
  });

  it('nie przesuwa rzeczy między poziomami sklepu', () => {
    // Rodzaj bez reguły czyta drabinę cen podręcznika — po przeliczniku
    // wpis ląduje dokładnie tam, gdzie stała jego cena z podręcznika.
    for (const [category, cost, costCategory] of [
      ['gear', 20, 'everyday'],
      ['gear', 50, 'costly'],
      ['gear', 100, 'premium'],
      ['gear', 1000, 'veryExpensive'],
      ['gear', 5000, 'luxury'],
      ['ammo', 100, 'premium'],
    ] as const) {
      const scaled = cpredScaledEntry(entry({ category, cost, costCategory }));
      expect(shopTierOf(scaled), `${category} ${cost}`).toBe(shopTierForPrice(cost));
    }
  });
});
