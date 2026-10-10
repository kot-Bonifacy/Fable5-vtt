import { describe, expect, it } from 'vitest';
import {
  cpredBuyBackPiece,
  cpredMerchantDeal,
  cpredMerchantQuote,
  cpredMerchantShelf,
  cpredRowCatalogPrice,
  cpredShelfPrice,
  type CpredPriceContext,
} from './merchant.js';
import {
  ITEM_ROWS_MAX,
  createDefaultCharacterData,
  type CpredArmorRow,
  type CpredCharacterData,
  type CpredGearRow,
  type CpredWeaponRow,
} from './character.js';
import type { MerchantRowOverlays } from '../../merchants.js';
import { cpredBareHandsRows } from './barehands.js';

/**
 * Etap 46a: handlarz. Testy pilnują trzech rzeczy, które przy sklepie najłatwiej
 * zepsuć po cichu: **ceny w oknie = ceny w transakcji** (jedna funkcja wyceny),
 * **wiersz „∞” nie ubywa**, a **ukryty towar nie istnieje dla gracza**.
 */

const PRICES: Record<string, number> = {
  'weapon.pistol': 100,
  'weapon.ronin': 500,
  'attachment.scope': 100,
  'armor.jacket': 110,
  'gear.stimpak': 50,
  'gear.vial': 20,
};

const ctx: CpredPriceContext = { priceOf: (id) => PRICES[id] ?? null };

let counter = 0;
const makeId = () => `new${++counter}`;

function pistol(id = 'w-pistol'): CpredWeaponRow {
  return {
    id,
    name: 'Pistolet ciężki',
    notes: '',
    compendiumId: 'weapon.pistol',
    damage: '3k6',
    ammoCurrent: 8,
    ammoMax: 8,
    ammoType: 'Pistoletowa ciężka',
    rof: '2',
  };
}

function ronin(): CpredWeaponRow {
  return { ...pistol('w-ronin'), name: 'Militech Ronin', compendiumId: 'weapon.ronin' };
}

function jacket(spCurrent = 11): CpredArmorRow {
  return {
    id: 'a-jacket',
    name: 'Kurtka kuloodporna',
    notes: '',
    compendiumId: 'armor.jacket',
    sp: 11,
    spCurrent,
    location: 'body',
    equipped: true,
    penalty: 0,
  };
}

function stimpaks(qty: number, id = 'g-stim'): CpredGearRow {
  return { id, name: 'Stimpak', notes: '', compendiumId: 'gear.stimpak', qty };
}

const chip: CpredGearRow = { id: 'g-chip', name: 'Chip z kodem', notes: '', qty: 1 };

function sheet(patch: Partial<CpredCharacterData> = {}): CpredCharacterData {
  return { ...createDefaultCharacterData(), ...patch };
}

function paser(): CpredCharacterData {
  return sheet({
    weapons: [ronin()],
    armor: [jacket()],
    gear: [stimpaks(3), chip],
    eddies: 500,
  });
}

function kowal(): CpredCharacterData {
  return sheet({ weapons: [pistol()], gear: [stimpaks(1, 'g-own'), { ...chip }], eddies: 620 });
}

describe('ceny wiersza', () => {
  it('katalog × mnożnik sklepu, zaokrąglone do pełnych eurodolców', () => {
    expect(cpredShelfPrice(50, undefined, 120)).toBe(60);
    expect(cpredShelfPrice(55, undefined, 110)).toBe(61);
  });

  it('cena wpisana przez MG wygrywa z katalogiem i nie mnoży się', () => {
    expect(cpredShelfPrice(50, { price: 45 }, 200)).toBe(45);
    expect(cpredShelfPrice(null, { price: 10 }, 120)).toBe(10);
  });

  it('broń liczy zamontowane dodatki, a nieznany dodatek nie dodaje nic', () => {
    const scoped = { ...pistol(), attachmentIds: ['attachment.scope', 'attachment.gone'] };
    expect(cpredRowCatalogPrice('weapons', scoped, ctx)).toBe(200);
  });

  it('wiersz bez wpisu katalogu nie ma ceny', () => {
    expect(cpredRowCatalogPrice('gear', chip, ctx)).toBeNull();
  });

  it('pancerz traci wartość razem z OB', () => {
    expect(cpredRowCatalogPrice('armor', jacket(7), ctx)).toBe(70);
  });

  it('odkup: procent katalogu w dół, 0% nic', () => {
    expect(cpredBuyBackPiece(110, 50)).toBe(55);
    expect(cpredBuyBackPiece(75, 50)).toBe(37);
    expect(cpredBuyBackPiece(null, 50)).toBeNull();
  });
});

describe('półka', () => {
  const overlays: MerchantRowOverlays = {
    'gear:g-stim': { infinite: true },
    'weapons:w-ronin': { hidden: true },
  };

  it('gracz nie dostaje ukrytego wiersza ani wiersza bez ceny', () => {
    const shelf = cpredMerchantShelf(paser(), overlays, 120, ctx, { forGm: false });
    expect(shelf.map((row) => row.name)).toEqual(['Kurtka kuloodporna', 'Stimpak']);
    expect(shelf.find((row) => row.name === 'Stimpak')).toMatchObject({
      price: 60,
      infinite: true,
    });
  });

  it('MG widzi wszystko, z flagami i wierszem bez ceny', () => {
    const shelf = cpredMerchantShelf(paser(), overlays, 120, ctx, { forGm: true });
    expect(shelf).toHaveLength(4);
    expect(shelf.find((row) => row.name === 'Militech Ronin')).toMatchObject({
      hidden: true,
      price: 600,
    });
    expect(shelf.find((row) => row.name === 'Chip z kodem')).toMatchObject({ price: null });
  });

  it('gołe ręce handlarza nie trafiają na półkę — ani graczowi, ani MG (47b)', () => {
    const data = paser();
    const armed = { ...data, weapons: [...data.weapons, ...cpredBareHandsRows(data)] };
    for (const forGm of [false, true]) {
      const names = cpredMerchantShelf(armed, overlays, 120, ctx, { forGm }).map((row) => row.name);
      expect(names).not.toContain('Bijatyka');
    }
  });
});

describe('wycena koszyka', () => {
  const shelfOf = (data = paser(), overlays: MerchantRowOverlays = {}, mul = 120) =>
    cpredMerchantShelf(data, overlays, mul, ctx, { forGm: false });

  it('zakup i sprzedaż w jednej wycenie; netto po stronie kupującego', () => {
    const quote = cpredMerchantQuote({
      shelf: shelfOf(),
      buyer: kowal(),
      buy: [{ list: 'gear', rowId: 'g-stim', qty: 2 }],
      sell: [{ list: 'weapons', rowId: 'w-pistol' }],
      buyBackPct: 50,
      merchantCash: 500,
      ctx,
    });
    expect(quote).toEqual({ buy: 120, haggleOff: 0, sell: 50, total: 70, problems: [] });
  });

  it('targ Fixera zdejmuje procent wyłącznie z zakupów', () => {
    const buyer = sheet({
      ...kowal(),
      haggle: { dealId: 'percent10', discount: 10, note: '19 vs 14' },
    });
    const quote = cpredMerchantQuote({
      shelf: shelfOf(),
      buyer,
      buy: [{ list: 'gear', rowId: 'g-stim', qty: 2 }],
      sell: [{ list: 'weapons', rowId: 'w-pistol' }],
      buyBackPct: 50,
      merchantCash: 500,
      ctx,
    });
    expect(quote.haggleOff).toBe(12);
    expect(quote.total).toBe(108 - 50);
  });

  it('wiersz bez katalogu nie da się sprzedać, a sklep z odkupem 0% nie skupuje', () => {
    const base = { shelf: shelfOf(), buyer: kowal(), buy: [], merchantCash: 500, ctx };
    expect(
      cpredMerchantQuote({ ...base, sell: [{ list: 'gear', rowId: 'g-chip' }], buyBackPct: 50 })
        .problems,
    ).toEqual([{ code: 'NO_PRICE', side: 'sell', key: 'gear:g-chip' }]);
    expect(
      cpredMerchantQuote({ ...base, sell: [{ list: 'weapons', rowId: 'w-pistol' }], buyBackPct: 0 })
        .problems[0]?.code,
    ).toBe('NOT_BUYING');
  });

  it('ukryty wiersz z podrobionego żądania nie istnieje', () => {
    const quote = cpredMerchantQuote({
      shelf: shelfOf(paser(), { 'weapons:w-ronin': { hidden: true } }),
      buyer: kowal(),
      buy: [{ list: 'weapons', rowId: 'w-ronin', qty: 1 }],
      sell: [],
      buyBackPct: 50,
      merchantCash: 500,
      ctx,
    });
    expect(quote.problems[0]?.code).toBe('ROW_NOT_FOUND');
  });

  it('portfel kupującego i kasa handlarza', () => {
    const poor = sheet({ ...kowal(), eddies: 10 });
    expect(
      cpredMerchantQuote({
        shelf: shelfOf(),
        buyer: poor,
        buy: [{ list: 'armor', rowId: 'a-jacket', qty: 1 }],
        sell: [],
        buyBackPct: 50,
        merchantCash: 500,
        ctx,
      }).problems,
    ).toEqual([{ code: 'NOT_ENOUGH_EDDIES' }]);
    expect(
      cpredMerchantQuote({
        shelf: shelfOf(),
        buyer: kowal(),
        buy: [],
        sell: [{ list: 'weapons', rowId: 'w-pistol' }],
        buyBackPct: 50,
        merchantCash: 20,
        ctx,
      }).problems,
    ).toEqual([{ code: 'MERCHANT_NO_CASH' }]);
  });

  it('więcej sztuk niż na półce to brak towaru; pusty koszyk to nic do zrobienia', () => {
    const base = {
      shelf: shelfOf(),
      buyer: kowal(),
      sell: [],
      buyBackPct: 50,
      merchantCash: 500,
      ctx,
    };
    expect(
      cpredMerchantQuote({ ...base, buy: [{ list: 'gear', rowId: 'g-stim', qty: 4 }] }).problems[0]
        ?.code,
    ).toBe('OUT_OF_STOCK');
    expect(cpredMerchantQuote({ ...base, buy: [] }).problems[0]?.code).toBe('NOTHING_TO_DEAL');
  });
});

describe('transakcja', () => {
  const deal = (patch: Partial<Parameters<typeof cpredMerchantDeal>[0]> = {}) =>
    cpredMerchantDeal({
      buyer: kowal(),
      merchant: paser(),
      overlays: {},
      priceMul: 120,
      buyBackPct: 50,
      cashInfinite: false,
      buy: [],
      sell: [],
      ctx,
      makeId,
      ...patch,
    });

  it('wiersz „∞” zostaje, a kupujący dostaje kopię z nowym id, sklejoną ze swoim stosem', () => {
    const result = deal({
      overlays: { 'gear:g-stim': { infinite: true } },
      buy: [{ list: 'gear', rowId: 'g-stim', qty: 2 }],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.result.merchant.gear.find((row) => row.id === 'g-stim')?.qty).toBe(3);
    // Kowal miał jeden stimpak z tego samego wpisu — kopia skleja się z nim.
    expect(result.result.buyer.gear.find((row) => row.compendiumId === 'gear.stimpak')?.qty).toBe(
      3,
    );
  });

  it('broń „∞” to osobne kopie, każda z własnym id', () => {
    const result = deal({
      buyer: sheet({ eddies: 5000 }),
      overlays: { 'weapons:w-ronin': { infinite: true } },
      buy: [{ list: 'weapons', rowId: 'w-ronin', qty: 2 }],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.result.buyer.weapons).toHaveLength(2);
    expect(new Set(result.result.buyer.weapons.map((row) => row.id)).size).toBe(2);
    expect(result.result.merchant.weapons).toHaveLength(1);
  });

  it('zwykły wiersz ubywa, a przy zerze znika razem ze swoją nakładką', () => {
    const result = deal({
      overlays: { 'gear:g-stim': { price: 40 } },
      buy: [{ list: 'gear', rowId: 'g-stim', qty: 3 }],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.result.merchant.gear.map((row) => row.id)).toEqual(['g-chip']);
    expect(result.result.overlays).toEqual({});
    expect(result.result.quote.total).toBe(120);
  });

  it('pancerz przychodzi zdjęty', () => {
    const result = deal({ buy: [{ list: 'armor', rowId: 'a-jacket', qty: 1 }] });
    if (!result.ok) throw new Error(result.error);
    expect(result.result.buyer.armor[0]?.equipped).toBe(false);
  });

  it('kupno i sprzedaż w jednej transakcji: sprzedana broń ląduje na półce', () => {
    const result = deal({
      buy: [{ list: 'gear', rowId: 'g-stim', qty: 1 }],
      sell: [{ list: 'weapons', rowId: 'w-pistol' }],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.result.buyer.weapons).toHaveLength(0);
    expect(result.result.merchant.weapons.map((row) => row.name)).toEqual([
      'Militech Ronin',
      'Pistolet ciężki',
    ]);
    expect(result.result.sold.map((view) => view.name)).toEqual(['Pistolet ciężki']);
    expect(result.result.quote.total).toBe(60 - 50);
  });

  it('odkupiona rzecz nie dziedziczy nakładki sprzedanego wiersza o tym samym id', () => {
    // Paser sprzedaje swój ostatni pistolet (ukryty dla innych powodów nie był,
    // ale miał cenę MG) i w tej samej chwili odkupuje pistolet o tym samym id.
    const merchant = sheet({ ...paser(), weapons: [pistol('w-x')] });
    const buyer = sheet({ ...kowal(), weapons: [pistol('w-x')], eddies: 1000 });
    const result = deal({
      merchant,
      buyer,
      overlays: { 'weapons:w-x': { price: 1 } },
      buy: [{ list: 'weapons', rowId: 'w-x', qty: 1 }],
      sell: [{ list: 'weapons', rowId: 'w-x' }],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.result.overlays).toEqual({});
  });

  it('targ Fixera znika w tym samym zapisie, który go wydał', () => {
    const buyer = sheet({
      ...kowal(),
      haggle: { dealId: 'percent10', discount: 10, note: '19 vs 14' },
    });
    const result = deal({ buyer, buy: [{ list: 'gear', rowId: 'g-stim', qty: 1 }] });
    if (!result.ok) throw new Error(result.error);
    expect(result.result.buyer.haggle).toBeNull();
    const selling = deal({ buyer, sell: [{ list: 'weapons', rowId: 'w-pistol' }] });
    if (!selling.ok) throw new Error(selling.error);
    expect(selling.result.buyer.haggle).not.toBeNull();
  });

  it('limit wierszy liczy się na stanie końcowym', () => {
    const full = Array.from({ length: ITEM_ROWS_MAX }, (_, index) => pistol(`w${index}`));
    const buyer = sheet({ weapons: full, eddies: 5000 });
    // Pełna lista, ale jedna broń wychodzi, a druga wchodzi — mieści się.
    const swap = deal({
      buyer,
      buy: [{ list: 'weapons', rowId: 'w-ronin', qty: 1 }],
      sell: [{ list: 'weapons', rowId: 'w0' }],
    });
    expect(swap.ok).toBe(true);
    const over = deal({ buyer, buy: [{ list: 'weapons', rowId: 'w-ronin', qty: 1 }] });
    expect(over).toEqual({ ok: false, error: 'TOO_MANY_ROWS' });
  });

  it('wycena w transakcji = wycena w oknie', () => {
    const input = {
      buy: [
        { list: 'gear' as const, rowId: 'g-stim', qty: 2 },
        { list: 'armor' as const, rowId: 'a-jacket', qty: 1 },
      ],
      sell: [{ list: 'weapons' as const, rowId: 'w-pistol' }],
    };
    const quote = cpredMerchantQuote({
      shelf: cpredMerchantShelf(paser(), {}, 120, ctx, { forGm: false }),
      buyer: kowal(),
      ...input,
      buyBackPct: 50,
      merchantCash: 500,
      ctx,
    });
    const result = deal(input);
    if (!result.ok) throw new Error(result.error);
    expect(result.result.quote).toEqual(quote);
  });

  it('kasa „bez dna” nie sprawdza kasy handlarza', () => {
    const broke = sheet({ ...paser(), eddies: 0 });
    expect(deal({ merchant: broke, sell: [{ list: 'weapons', rowId: 'w-pistol' }] })).toEqual({
      ok: false,
      error: 'MERCHANT_NO_CASH',
    });
    expect(
      deal({ merchant: broke, cashInfinite: true, sell: [{ list: 'weapons', rowId: 'w-pistol' }] })
        .ok,
    ).toBe(true);
  });
});
