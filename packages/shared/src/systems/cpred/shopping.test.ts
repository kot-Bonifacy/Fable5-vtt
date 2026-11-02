import { describe, expect, it } from 'vitest';
import type { CpredArmorRow } from './character.js';
import type { CompendiumEntry } from './compendium.js';
import { armorWornOnLabel } from './locations.js';
import { purchasedArmorLocation, purchasedSheetRow } from './shopping.js';

// Invented catalogue row — the real armor list lives in data/private.
const jacket = {
  id: 'armor.test-jacket',
  name: 'Kurtka testowa',
  category: 'armor',
  sp: 9,
  locations: ['head', 'body'],
} as unknown as CompendiumEntry;

function worn(location: CpredArmorRow['location'], equipped?: boolean): CpredArmorRow {
  return {
    id: `worn-${location}`,
    name: 'Coś',
    notes: '',
    sp: 7,
    spCurrent: 7,
    location,
    ...(equipped === undefined ? {} : { equipped }),
  };
}

function locationOf(armor: CpredArmorRow[]) {
  const built = purchasedSheetRow(jacket, null, 'new', armor);
  return built?.list === 'armor' ? built.row.location : null;
}

describe('purchased armor location (one piece covers one spot)', () => {
  it('puts the first piece on the body', () => {
    expect(locationOf([])).toBe('body');
  });

  it('puts the second piece on the bare head', () => {
    expect(locationOf([worn('body')])).toBe('head');
  });

  it('ignores a piece that is carried, not worn', () => {
    expect(locationOf([worn('body', false)])).toBe('body');
  });

  it('falls back to the body when both spots are covered', () => {
    expect(locationOf([worn('body'), worn('head')])).toBe('body');
  });

  it('keeps a shield in hand whatever is worn', () => {
    expect(purchasedArmorLocation(['shield'], [])).toBe('shield');
    expect(purchasedArmorLocation(['shield'], [worn('shield')])).toBe('shield');
  });

  it('defaults to the body without a sheet', () => {
    const built = purchasedSheetRow(jacket, null, 'new');
    expect(built?.list === 'armor' && built.row.location).toBe('body');
  });
});

describe('armorWornOnLabel', () => {
  it('reads several locations as a choice, not a sum', () => {
    const label = armorWornOnLabel(['body', 'head']);
    expect(label).toMatch(/^głowę albo korpus/);
    expect(label).toContain('jedną lokację');
  });

  it('names a single location plainly', () => {
    expect(armorWornOnLabel(['head'])).toBe('głowę');
    expect(armorWornOnLabel(['shield'])).toBe('rękę (tarcza)');
  });
});
