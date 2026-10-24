import { describe, expect, it } from 'vitest';
import { buildCompendium } from './compendium.js';
import { cpredIsChemEntry } from './drugs.js';
import {
  CPRED_PHARMACEUTICALS,
  CPRED_PHARMA_COMPENDIUM_FILE,
  cpredHasAirhypo,
  cpredPharmaOfRow,
} from './pharma.js';
import { cpredScaleCatalogPrices } from './pricing.js';
import { purchasedSheetRow } from './shopping.js';

describe('cpredHasAirhypo', () => {
  it('finds the syringe by name, whatever the case and spacing', () => {
    expect(cpredHasAirhypo([{ name: '  strzykawka BEZIGŁOWA ', qty: 1 }])).toBe(true);
  });

  it('ignores a row with nothing left and anything that only looks similar', () => {
    expect(cpredHasAirhypo([{ name: 'Strzykawka bezigłowa', qty: 0 }])).toBe(false);
    expect(cpredHasAirhypo([{ name: 'Strzykawka', qty: 3 }])).toBe(false);
    expect(cpredHasAirhypo([])).toBe(false);
  });
});

describe('farmaceutyki na półce (zasada domowa z 24.10)', () => {
  const registry = cpredScaleCatalogPrices(buildCompendium([CPRED_PHARMA_COMPENDIUM_FILE]));

  it('every pharmaceutical is a valid priced gear entry on the chems shelf', () => {
    expect(registry.entries).toHaveLength(CPRED_PHARMACEUTICALS.length);
    for (const entry of registry.entries) {
      expect(entry.category).toBe('gear');
      expect(cpredIsChemEntry(entry)).toBe(true);
    }
    // Pasmo Drogie ×3, Premium z wyjątkiem ×3 — dawka, nie sprzęt trwały.
    expect(registry.entryById.get('gear.antybiotyk')?.cost).toBe(150);
    expect(registry.entryById.get('gear.stym')?.cost).toBe(300);
  });

  it('a bought dose is the same counted row the Medic crafts', () => {
    const entry = registry.entryById.get('gear.turbo-uzdrawiacz')!;
    const bought = purchasedSheetRow(entry, null, 'r1');
    expect(bought?.list).toBe('gear');
    expect(bought?.row).toMatchObject({ consumable: 'pharma.turbo-uzdrawiacz', qty: 1 });
  });

  it('recognizes a dose by consumable or entry, never by a typed-in name', () => {
    expect(cpredPharmaOfRow({ compendiumId: 'gear.stym' })?.id).toBe('pharma.stym');
    expect(cpredPharmaOfRow({ consumable: 'pharma.zryw' })?.id).toBe('pharma.zryw');
    expect(cpredPharmaOfRow({ compendiumId: 'gear.lom' })).toBeNull();
    expect(cpredPharmaOfRow({})).toBeNull();
  });
});
