import { describe, expect, it } from 'vitest';
import type { CompendiumEntry } from './compendium.js';
import {
  COST_CATEGORY_PRICE,
  HOUSING_DEFINITIONS,
  LIFESTYLE_DEFINITIONS,
  entryPrice,
  formatEddies,
  formatLedgerAmount,
  formatLifestyle,
  formatPurchasePrice,
  isHousingOption,
  isLedgerKind,
  isLifestyleLevel,
  monthlyCostOf,
  settleMonth,
} from './economy.js';
import { purchasedSheetRow } from './shopping.js';

describe('entryPrice', () => {
  it('prefers the printed number over the band', () => {
    expect(entryPrice({ cost: 550, costCategory: 'costly' })).toBe(550);
  });

  it('falls back to the band price when the material gives only a band', () => {
    // The rulebook's ladder: Drogie = 50, Kosztowne = 500 (s. 342). The Polish
    // names are the trap — „Drogie" sits *below* „Kosztowne".
    expect(entryPrice({ cost: null, costCategory: 'costly' })).toBe(50);
    expect(entryPrice({ cost: null, costCategory: 'expensive' })).toBe(500);
    expect(COST_CATEGORY_PRICE.superLuxury).toBe(10_000);
  });

  it('returns null for an entry that says nothing about money', () => {
    expect(entryPrice({ cost: null })).toBeNull();
  });

  it('names the band when the price came from it', () => {
    expect(formatPurchasePrice({ cost: null, costCategory: 'premium' })).toBe(
      '100 ed (cena pasma Premium)',
    );
    expect(formatPurchasePrice({ cost: 550, costCategory: 'costly' })).toBe('550 ed');
    expect(formatPurchasePrice({ cost: null })).toBeNull();
  });
});

describe('lifestyle', () => {
  it('bills food and rent as one month (s. 376)', () => {
    // The starting package of s. 105: „Na karmie" plus a container = 1100 ed,
    // exactly the number the rulebook quotes.
    const cost = monthlyCostOf({ level: 'kibble', housing: 'container' });
    expect(cost.lifestyle).toBe(100);
    expect(cost.rent).toBe(1000);
    expect(cost.total).toBe(1100);
  });

  it('charges no rent for the street and for corpo housing', () => {
    expect(monthlyCostOf({ level: 'kibble', housing: 'street' }).total).toBe(100);
    // „Podarunek od twojej Korporacji" — free to live in, and the price of it
    // is a job rather than eddies.
    expect(HOUSING_DEFINITIONS.corpoConapt.rent).toBe(0);
    expect(monthlyCostOf({ level: 'freshFood', housing: 'corpoConapt' }).total).toBe(1500);
  });

  it('keeps the four Lifestyle rungs of the table', () => {
    expect(LIFESTYLE_DEFINITIONS.prepack.monthly).toBe(300);
    expect(LIFESTYLE_DEFINITIONS.goodPrepack.monthly).toBe(600);
    expect(LIFESTYLE_DEFINITIONS.freshFood.monthly).toBe(1500);
  });

  it('formats the sheet line', () => {
    expect(formatLifestyle({ level: 'kibble', housing: 'container' })).toBe(
      'Na karmie · Kontener — 1100 ed / mies.',
    );
  });

  it('guards unknown values coming off an old sheet', () => {
    expect(isLifestyleLevel('kibble')).toBe(true);
    expect(isLifestyleLevel('caviar')).toBe(false);
    expect(isHousingOption('penthouse')).toBe(true);
    expect(isHousingOption(null)).toBe(false);
  });
});

describe('settleMonth', () => {
  it('takes the whole bill when the wallet covers it', () => {
    const result = settleMonth(5000, { level: 'prepack', housing: 'studio' });
    expect(result.due).toBe(1800);
    expect(result.charged).toBe(1800);
    expect(result.shortfall).toBe(0);
  });

  it('empties the wallet and reports the rest as an underpayment', () => {
    // Decision of the GM (09.08.2026): what the wallet has, it pays; the week
    // of grace and the Death Saves that follow (s. 376) stay with the GM.
    const result = settleMonth(400, { level: 'kibble', housing: 'container' });
    expect(result.due).toBe(1100);
    expect(result.charged).toBe(400);
    expect(result.shortfall).toBe(700);
  });

  it('charges nothing from an empty wallet', () => {
    const result = settleMonth(0, { level: 'freshFood', housing: 'penthouse' });
    expect(result.charged).toBe(0);
    expect(result.shortfall).toBe(16_500);
  });
});

describe('formatting', () => {
  it('groups thousands with a narrow no-break space, so a rent never wraps', () => {
    expect(formatEddies(15_000)).toBe('15 000');
    expect(formatEddies(500)).toBe('500');
    expect(formatEddies(1_500_000)).toBe('1 500 000');
  });

  it('signs the audit amounts', () => {
    expect(formatLedgerAmount(-100)).toBe('−100 ed');
    expect(formatLedgerAmount(2500)).toBe('+2 500 ed');
  });

  it('guards ledger kinds', () => {
    expect(isLedgerKind('purchase')).toBe(true);
    expect(isLedgerKind('bribe')).toBe(false);
  });
});

describe('purchasedSheetRow', () => {
  const weapon: CompendiumEntry = {
    id: 'weapon.zgrzyt-9',
    name: 'Zgrzyt 9',
    category: 'weapon',
    cost: 100,
    weaponTypeId: 'weapon-type.heavy-pistol',
    quality: 'standard',
    features: ['Złącze smartguna'],
  };

  it('arrives loaded, with a copy of the resolved numbers', () => {
    const row = purchasedSheetRow(
      weapon,
      {
        damage: '3k6',
        magazine: 8,
        rof: 2,
        hands: 1,
        concealable: true,
        attachmentSlots: 3,
        skillId: 'bron-krotka',
        melee: false,
      },
      'row1',
    );
    expect(row).toEqual({
      list: 'weapons',
      row: {
        id: 'row1',
        name: 'Zgrzyt 9',
        compendiumId: 'weapon.zgrzyt-9',
        notes: 'Złącze smartguna',
        damage: '3k6',
        ammoCurrent: 8,
        ammoMax: 8,
        ammoType: '',
        rof: '2',
      },
    });
  });

  it('puts armor on the body and copies its penalty', () => {
    const row = purchasedSheetRow(
      {
        id: 'armor.kevlar',
        name: 'Kamizelka',
        category: 'armor',
        cost: 100,
        sp: 11,
        locations: ['head', 'body'],
        penalty: -2,
      },
      null,
      'row2',
    );
    expect(row).toEqual({
      list: 'armor',
      row: {
        id: 'row2',
        name: 'Kamizelka',
        compendiumId: 'armor.kevlar',
        notes: '',
        sp: 11,
        spCurrent: 11,
        location: 'body',
        penalty: -2,
      },
    });
  });

  it('refuses the three categories nobody buys onto a sheet this way', () => {
    const cyberware: CompendiumEntry = {
      id: 'cyberware.kerenzikov',
      name: 'Kerenzikov',
      category: 'cyberware',
      cost: 500,
      humanityLoss: '4k6',
    };
    expect(purchasedSheetRow(cyberware, null, 'row3')).toBeNull();
    expect(
      purchasedSheetRow(
        {
          id: 'ammo.basic',
          name: 'Zwykła',
          category: 'ammo',
          cost: 10,
          patterns: ['bullet'],
        },
        null,
        'row4',
      ),
    ).toBeNull();
  });
});
