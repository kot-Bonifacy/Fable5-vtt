import { describe, expect, it } from 'vitest';
import type { CompendiumEntry } from './compendium.js';
import { cpredScaledEntry } from './pricing.js';
import {
  CPRED_ASSORTMENT_DEFAULT,
  cpredAssortmentCategoryOf,
  cpredAssortmentCovers,
  cpredAssortmentOffers,
  cpredAssortmentSummary,
  cpredCatalogRowId,
  isCpredCatalogRowId,
  readCpredAssortmentPatch,
  readCpredMerchantAssortment,
  type CpredMerchantAssortment,
} from './assortment.js';
import { createDefaultCharacterData, type CpredCharacterData } from './character.js';
import {
  cpredMerchantDeal,
  cpredMerchantQuote,
  cpredMerchantShelf,
  type CpredPriceContext,
} from './merchant.js';
import { entryPrice } from './economy.js';

/**
 * Asortyment handlarza (zlecenie MG z 02.11.2026): poziom „pozostałych”
 * i osobne poziomy kategorii. Wzorcowe sklepy z samego zlecenia — aptekarz
 * (Używki i leki 4, reszta 1) i podrzędny sklep z bronią (Broń i Pancerz 3,
 * reszta 1).
 */

function entry(fields: Record<string, unknown>): CompendiumEntry {
  return cpredScaledEntry({ name: 'Wpis', cost: 100, ...fields } as CompendiumEntry);
}

const knife = entry({
  id: 'weapon.knife',
  category: 'weapon',
  name: 'Nóż',
  weaponTypeId: 'weapon-type.light-melee',
  quality: 'standard',
  cost: 50,
});
const rifle = entry({
  id: 'weapon.rifle',
  category: 'weapon',
  name: 'Karabin szturmowy',
  weaponTypeId: 'weapon-type.assault-rifle',
  quality: 'standard',
  cost: 500,
});
const launcher = entry({
  id: 'weapon.launcher',
  category: 'weapon',
  name: 'Wyrzutnia rakiet',
  weaponTypeId: 'weapon-type.rocket-launcher',
  quality: 'standard',
  cost: 500,
});
const leather = entry({
  id: 'armor.leather',
  category: 'armor',
  name: 'Skóra',
  sp: 4,
  locations: ['body', 'head'],
  penalty: 0,
  cost: 20,
});
const plate = entry({
  id: 'armor.plate',
  category: 'armor',
  name: 'Pancerz bojowy',
  sp: 13,
  locations: ['body', 'head'],
  penalty: 0,
  cost: 100,
});
// Narkotyk uliczny z `drugs.ts` — wpis „Sprzętu”, który panel zbiera na półkę „Używki i leki”.
const glass = entry({
  id: 'gear.blekitne-szklo',
  category: 'gear',
  name: 'Błękitne szkło',
  cost: 50,
  tier: 4,
});
const torch = entry({ id: 'gear.torch', category: 'gear', name: 'Latarka', cost: 20 });
const radio = entry({ id: 'gear.radio', category: 'gear', name: 'Radio', cost: 100, tier: 2 });
const injury = entry({ id: 'injury.arm', category: 'criticalInjury', name: 'Złamana ręka' });

const CATALOG = [knife, rifle, launcher, leather, plate, glass, torch, radio, injury];
const registry = { weaponTypeById: new Map() };

const PHARMACY: CpredMerchantAssortment = { base: 1, categories: { chems: 4 } };
const GUN_SHOP: CpredMerchantAssortment = { base: 1, categories: { weapon: 3, armor: 3 } };

function offeredIds(assortment: CpredMerchantAssortment): string[] {
  return cpredAssortmentOffers(CATALOG, assortment, registry).map(
    (offer) => offer.row.compendiumId!,
  );
}

describe('cpredAssortmentCategoryOf', () => {
  it('puts drugs on their own shelf and leaves the rest of the gear as gear', () => {
    expect(cpredAssortmentCategoryOf(glass)).toBe('chems');
    expect(cpredAssortmentCategoryOf(torch)).toBe('gear');
    expect(cpredAssortmentCategoryOf(rifle)).toBe('weapon');
    expect(cpredAssortmentCategoryOf(injury)).toBeNull();
  });
});

describe('cpredAssortmentCovers', () => {
  it('gives the pharmacy every drug and only street goods elsewhere', () => {
    expect(cpredAssortmentCovers(glass, PHARMACY)).toBe(true);
    expect(cpredAssortmentCovers(torch, PHARMACY)).toBe(true);
    expect(cpredAssortmentCovers(knife, PHARMACY)).toBe(true);
    expect(cpredAssortmentCovers(radio, PHARMACY)).toBe(false);
    expect(cpredAssortmentCovers(rifle, PHARMACY)).toBe(false);
  });

  it('gives the gun shop military weapons and armour but not the black market', () => {
    expect(cpredAssortmentCovers(rifle, GUN_SHOP)).toBe(true);
    expect(cpredAssortmentCovers(plate, GUN_SHOP)).toBe(true);
    expect(cpredAssortmentCovers(launcher, GUN_SHOP)).toBe(false);
    expect(cpredAssortmentCovers(glass, GUN_SHOP)).toBe(false);
    expect(cpredAssortmentCovers(torch, GUN_SHOP)).toBe(true);
  });

  it('reads 0 as „does not carry this category”, also below the base level', () => {
    const noWeapons: CpredMerchantAssortment = { base: 4, categories: { weapon: 0 } };
    expect(cpredAssortmentCovers(knife, noWeapons)).toBe(false);
    expect(cpredAssortmentCovers(plate, noWeapons)).toBe(true);
  });

  it('never trades critical injuries', () => {
    expect(cpredAssortmentCovers(injury, { base: 4, categories: {} })).toBe(false);
  });

  it('follows the GM’s tier overrides of the campaign', () => {
    expect(cpredAssortmentCovers(rifle, PHARMACY, { overrides: { 'weapon.rifle': 1 } })).toBe(true);
  });
});

describe('cpredAssortmentOffers', () => {
  it('lists the covered entries as sheet rows with catalogue ids', () => {
    expect(offeredIds(PHARMACY)).toEqual([
      'weapon.knife',
      'armor.leather',
      'gear.blekitne-szklo',
      'gear.torch',
    ]);
    const offers = cpredAssortmentOffers(CATALOG, GUN_SHOP, registry);
    expect(offers.map((offer) => offer.list)).toEqual([
      'weapons',
      'weapons',
      'armor',
      'armor',
      'gear',
    ]);
    expect(offers[0]!.row.id).toBe(cpredCatalogRowId('weapon.knife'));
    expect(isCpredCatalogRowId(offers[0]!.row.id)).toBe(true);
    expect(isCpredCatalogRowId('a1b2c3d4')).toBe(false);
  });
});

describe('readCpredMerchantAssortment', () => {
  it('reads the column and drops bad categories one by one', () => {
    expect(
      readCpredMerchantAssortment(
        JSON.stringify({ base: 2, categories: { chems: 4, weapon: 9, nonsense: 1 } }),
      ),
    ).toEqual({ base: 2, categories: { chems: 4 } });
  });

  it('turns an empty or broken column into „no assortment”', () => {
    expect(readCpredMerchantAssortment(null)).toBeNull();
    expect(readCpredMerchantAssortment('')).toBeNull();
    expect(readCpredMerchantAssortment('{"base":7}')).toBeNull();
  });
});

describe('readCpredAssortmentPatch', () => {
  it('accepts null (switch off) and a whole good object', () => {
    expect(readCpredAssortmentPatch(null)).toBeNull();
    expect(readCpredAssortmentPatch(GUN_SHOP)).toEqual(GUN_SHOP);
    expect(readCpredAssortmentPatch(CPRED_ASSORTMENT_DEFAULT)).toEqual({ base: 1, categories: {} });
  });

  it('refuses the request when any part is wrong', () => {
    expect(readCpredAssortmentPatch({ base: 5 })).toBeUndefined();
    expect(readCpredAssortmentPatch({ base: 1, categories: { weapon: 7 } })).toBeUndefined();
    expect(readCpredAssortmentPatch({ base: 1, categories: { ammo: 2 } })).toBeUndefined();
    expect(readCpredAssortmentPatch('1')).toBeUndefined();
  });
});

describe('cpredAssortmentSummary', () => {
  it('says the categories first, then the rest', () => {
    expect(cpredAssortmentSummary(GUN_SHOP)).toBe('Broń 3 · Pancerz 3 · pozostałe 1');
    expect(cpredAssortmentSummary({ base: 0, categories: { chems: 4 } })).toBe(
      'Używki i leki 4 · pozostałe —',
    );
  });
});

describe('catalogue shelf in a deal', () => {
  const byId = new Map(CATALOG.map((e) => [e.id, e]));
  const ctx: CpredPriceContext = {
    priceOf: (id) => {
      const found = byId.get(id);
      return found ? entryPrice(found) : null;
    },
    buysBack: (id) => {
      const found = byId.get(id);
      return found !== undefined && cpredAssortmentCovers(found, PHARMACY);
    },
  };
  const catalog = cpredAssortmentOffers(CATALOG, PHARMACY, registry);

  function buyer(): CpredCharacterData {
    return { ...createDefaultCharacterData(), eddies: 10_000 };
  }

  it('puts the offers on the shelf as „∞” rows at the shop’s price', () => {
    const shelf = cpredMerchantShelf(createDefaultCharacterData(), {}, 200, ctx, {
      forGm: false,
      catalog,
    });
    const row = shelf.find((r) => r.rowId === cpredCatalogRowId('gear.torch'))!;
    expect(row).toMatchObject({ list: 'gear', infinite: true, catalog: true });
    expect(row.price).toBe(entryPrice(torch)! * 2);
  });

  it('sells copies with fresh ids and leaves the shelf as it was', () => {
    let n = 0;
    const result = cpredMerchantDeal({
      buyer: buyer(),
      merchant: createDefaultCharacterData(),
      overlays: {},
      priceMul: 100,
      buyBackPct: 50,
      cashInfinite: true,
      buy: [
        { list: 'gear', rowId: cpredCatalogRowId('gear.blekitne-szklo'), qty: 3 },
        { list: 'weapons', rowId: cpredCatalogRowId('weapon.knife'), qty: 2 },
      ],
      sell: [],
      ctx,
      catalog,
      makeId: () => `id${++n}`,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const glassRow = result.result.buyer.gear.find((r) => r.compendiumId === 'gear.blekitne-szklo');
    expect(glassRow?.qty).toBe(3);
    expect(isCpredCatalogRowId(glassRow!.id)).toBe(false);
    expect(
      result.result.buyer.weapons.filter((r) => r.compendiumId === 'weapon.knife'),
    ).toHaveLength(2);
    expect(result.result.quote.buy).toBe(entryPrice(glass)! * 3 + entryPrice(knife)! * 2);
  });

  it('refuses a catalogue row outside the range', () => {
    const quote = cpredMerchantQuote({
      shelf: cpredMerchantShelf(createDefaultCharacterData(), {}, 100, ctx, {
        forGm: false,
        catalog,
      }),
      buyer: buyer(),
      buy: [{ list: 'weapons', rowId: cpredCatalogRowId('weapon.rifle'), qty: 1 }],
      sell: [],
      buyBackPct: 50,
      merchantCash: null,
      ctx,
    });
    expect(quote.problems.map((p) => p.code)).toContain('ROW_NOT_FOUND');
  });

  it('buys back only what is in the range', () => {
    const data = buyer();
    data.weapons = [
      {
        id: 'w1',
        name: 'Karabin',
        notes: '',
        compendiumId: 'weapon.rifle',
        damage: '5k6',
        ammoCurrent: 0,
        ammoMax: 25,
        ammoType: '',
        rof: '1',
      },
      {
        id: 'w2',
        name: 'Nóż',
        notes: '',
        compendiumId: 'weapon.knife',
        damage: '1k6',
        ammoCurrent: 0,
        ammoMax: 0,
        ammoType: '',
        rof: '2',
      },
    ];
    const quote = cpredMerchantQuote({
      shelf: [],
      buyer: data,
      buy: [],
      sell: [
        { list: 'weapons', rowId: 'w1' },
        { list: 'weapons', rowId: 'w2' },
      ],
      buyBackPct: 50,
      merchantCash: null,
      ctx,
    });
    expect(quote.problems).toEqual([{ code: 'NOT_IN_RANGE', side: 'sell', key: 'weapons:w1' }]);
    expect(quote.sell).toBe(Math.floor(entryPrice(knife)! / 2));
  });
});
