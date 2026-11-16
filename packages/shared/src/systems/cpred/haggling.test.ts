import { describe, expect, it } from 'vitest';
import {
  CPRED_DEBTS_MAX,
  CPRED_LUXURY_PRICE,
  cpredCounterBonus,
  cpredCutPrice,
  cpredDebtDue,
  cpredDebtsFallingDue,
  cpredHaggleDiscountAt,
  cpredHaggleOnDeal,
  cpredHaggleUsableAt,
  cpredMerchantSaleCut,
  cpredRaisedPrice,
  readCpredCounterHaggle,
  readCpredDebts,
  readCpredHaggleOpponent,
  type CpredDebt,
} from './haggling.js';
import { cpredMerchantDeal, cpredMerchantQuote, type CpredPriceContext } from './merchant.js';
import { createDefaultCharacterData, type CpredCharacterData } from './character.js';
import { gameTimeFromInput, formatGameDate } from '../../gametime.js';
import { readCpredHaggle } from './roleability.js';
import { COST_CATEGORY_PRICE } from './economy.js';

/**
 * Etap 71e (G20–G23): handel i pieniądze Fixera. Targ na koszyku, rzut przy
 * ladzie handlarza-Fixera i raty „pół teraz, pół za miesiąc”.
 */

const percent10 = { dealId: 'percent10', discount: 10, note: '' };
const percent20 = { dealId: 'percent20', discount: 20, note: '' };

describe('targ na transakcji (G21–G23)', () => {
  it('procent idzie na cięższą stronę koszyka; remis — zakup', () => {
    expect(cpredHaggleOnDeal(percent10, [{ price: 100, qty: 2 }], 50)).toEqual({
      buyOff: 20,
      sellUp: 0,
      deferred: 0,
      spent: true,
    });
    expect(cpredHaggleOnDeal(percent20, [{ price: 100, qty: 1 }], 500)).toMatchObject({
      buyOff: 0,
      sellUp: 100,
      spent: true,
    });
    expect(cpredHaggleOnDeal(percent10, [{ price: 50, qty: 1 }], 50).buyOff).toBe(5);
    expect(cpredHaggleOnDeal(percent10, [], 0).spent).toBe(false);
  });

  it('szósta sztuka: jedna darmowa sztuka najdroższej pozycji z co najmniej sześcioma', () => {
    const sixth = { dealId: 'sixthFree', discount: 0, note: '' };
    expect(
      cpredHaggleOnDeal(
        sixth,
        [
          { price: 20, qty: 6 },
          { price: 50, qty: 7 },
          { price: 500, qty: 5 },
        ],
        0,
      ),
    ).toMatchObject({ buyOff: 50, spent: true });
    // Pięć sztuk to jeszcze nie „szósta gratis” — targ zostaje na karcie.
    expect(cpredHaggleOnDeal(sixth, [{ price: 20, qty: 5 }], 0).spent).toBe(false);
  });

  it('pół teraz, pół za miesiąc: połowa rzeczy Luksusowych (od 5000 ed) na ratę', () => {
    const half = { dealId: 'halfLater', discount: 0, note: '' };
    expect(
      cpredHaggleOnDeal(
        half,
        [
          { price: 5001, qty: 1 },
          { price: 1000, qty: 2 },
        ],
        0,
      ),
    ).toMatchObject({ deferred: 2500, buyOff: 0, spent: true });
    expect(cpredHaggleOnDeal(half, [{ price: 4999, qty: 3 }], 0).spent).toBe(false);
    expect(
      cpredHaggleOnDeal(half, [{ price: 10_000, qty: 1 }], 0, { halfLaterClosed: true }).spent,
    ).toBe(false);
  });

  it('próg Luksusowych to cena pasma z drabiny s. 342', () => {
    expect(CPRED_LUXURY_PRICE).toBe(COST_CATEGORY_PRICE.luxury);
  });

  it('Podwyżka dla Ekipy i podwójna zapłata nie ruszają koszyka', () => {
    for (const dealId of ['crewRaise', 'doublePay']) {
      expect(
        cpredHaggleOnDeal({ dealId, discount: 0, note: '' }, [{ price: 100, qty: 9 }], 100),
      ).toMatchObject({ spent: false });
    }
  });

  it('podwyżka sprzedaży i cięcie skupu zaokrąglają w dół', () => {
    expect(cpredRaisedPrice(55, 10)).toBe(60);
    expect(cpredCutPrice(55, 10)).toBe(49);
    expect(cpredCutPrice(55, 0)).toBe(55);
  });
});

describe('druga strona targu (G20)', () => {
  it('handlarz-Fixer urywa 10% od 1. poziomu Znajomości, 20% od 9.', () => {
    expect(cpredMerchantSaleCut(null)).toBe(0);
    expect(cpredMerchantSaleCut(0)).toBe(0);
    expect(cpredMerchantSaleCut(1)).toBe(10);
    expect(cpredMerchantSaleCut(8)).toBe(10);
    expect(cpredMerchantSaleCut(9)).toBe(20);
  });

  it('suma z karty handlarza: CHA + Handel + Znajomości, w zakresie pola MG', () => {
    expect(cpredCounterBonus({ cool: 6, trading: 4, operator: 0 })).toBe(10);
    expect(cpredCounterBonus({ cool: 8, trading: 10, operator: 10 })).toBe(28);
    expect(cpredCounterBonus({ cool: 20, trading: 20, operator: 20 })).toBe(30);
  });

  it('targ dobity przy ladzie działa tylko u tego handlarza; targ z MG — wszędzie', () => {
    const atCounter = { ...percent10, merchantId: 'm1' };
    expect(cpredHaggleUsableAt(atCounter, 'm1')).toBe(atCounter);
    expect(cpredHaggleUsableAt(atCounter, 'm2')).toBeNull();
    expect(cpredHaggleDiscountAt(atCounter, null)).toBe(0);
    expect(cpredHaggleDiscountAt(percent10, null)).toBe(10);
    expect(cpredHaggleDiscountAt(percent10, 'm2')).toBe(10);
  });

  it('czytniki przyjmują starą kartę i odrzucają śmieci', () => {
    expect(readCpredHaggle({ ...percent10, merchantId: 'm1' })?.merchantId).toBe('m1');
    expect(readCpredHaggle(percent10)).not.toHaveProperty('merchantId');
    expect(readCpredHaggleOpponent({ bonus: 14, label: ' Paser ' })).toEqual({
      bonus: 14,
      label: 'Paser',
    });
    expect(readCpredHaggleOpponent({ bonus: 31 })).toBeNull();
    expect(readCpredHaggleOpponent(null)).toBeNull();
    expect(readCpredCounterHaggle({ merchantId: 'm1', won: true, note: '1 vs 0' })).toEqual({
      merchantId: 'm1',
      won: true,
      note: '1 vs 0',
    });
    expect(readCpredCounterHaggle({ won: true })).toBeNull();
    const defaults = createDefaultCharacterData();
    expect(defaults.debts).toEqual([]);
    expect(defaults.halfLaterClosed).toBe(false);
    expect(defaults.counterHaggle).toBeNull();
    expect(defaults.haggleOpponent).toBeNull();
  });
});

describe('raty (G23)', () => {
  it('termin to ten sam dzień miesiąc później — 31 stycznia daje koniec lutego', () => {
    const jan31 = gameTimeFromInput('2045-01-31', '12:00')!;
    expect(formatGameDate(cpredDebtDue(jan31))).toBe(
      formatGameDate(gameTimeFromInput('2045-02-28', '12:00')!),
    );
    const mar15 = gameTimeFromInput('2045-03-15', '08:30')!;
    expect(cpredDebtDue(mar15)).toBe(gameTimeFromInput('2045-04-15', '08:30'));
  });

  it('termin mija raz — zaległej raty przemiatanie nie zwraca drugi raz', () => {
    const debts: CpredDebt[] = [
      { id: 'a', creditor: 'Lada', label: '', amount: 2500, dueAtMinute: 100 },
      { id: 'b', creditor: 'Lada', label: '', amount: 10, dueAtMinute: 500 },
      { id: 'c', creditor: 'Lada', label: '', amount: 10, dueAtMinute: 50, overdue: true },
    ];
    expect(cpredDebtsFallingDue(debts, 200).map((row) => row.id)).toEqual(['a']);
    expect(cpredDebtsFallingDue(debts, null)).toEqual([]);
  });

  it('czytnik rat odrzuca zły wiersz i trzyma limit', () => {
    const many = Array.from({ length: CPRED_DEBTS_MAX + 3 }, (_, index) => ({
      id: `d${index}`,
      creditor: 'X',
      label: '',
      amount: 5,
      dueAtMinute: 1,
    }));
    expect(readCpredDebts([...many, { id: 'zero', amount: 0, dueAtMinute: 1 }])).toHaveLength(
      CPRED_DEBTS_MAX,
    );
    expect(readCpredDebts('nie')).toEqual([]);
  });
});

describe('koszyk sklepu z targiem i handlarzem-Fixerem', () => {
  const PRICES: Record<string, number> = { 'gear.ammo': 10, 'gear.car': 6000, 'gear.knife': 100 };
  const ctx: CpredPriceContext = { priceOf: (id) => PRICES[id] ?? null };
  const merchant = (): CpredCharacterData => ({
    ...createDefaultCharacterData(),
    eddies: 50_000,
    gear: [
      { id: 'ammo', name: 'Amunicja', qty: 50, notes: '', compendiumId: 'gear.ammo' },
      { id: 'car', name: 'Luksusowy zegarek', qty: 1, notes: '', compendiumId: 'gear.car' },
    ],
  });
  const fixer = (patch: Partial<CpredCharacterData> = {}): CpredCharacterData => ({
    ...createDefaultCharacterData(),
    eddies: 10_000,
    gear: [{ id: 'knife', name: 'Nóż', qty: 1, notes: '', compendiumId: 'gear.knife' }],
    ...patch,
  });
  const deal = (
    buyer: CpredCharacterData,
    extra: Partial<Parameters<typeof cpredMerchantDeal>[0]>,
  ) =>
    cpredMerchantDeal({
      buyer,
      merchant: merchant(),
      overlays: {},
      priceMul: 100,
      buyBackPct: 50,
      cashInfinite: false,
      buy: [],
      sell: [],
      ctx,
      merchantId: 'm1',
      makeId: () => 'x',
      ...extra,
    });

  it('handlarz-Fixer urywa przy skupie, dopóki sprzedający nie wygra z nim rzutu (FIX-14)', () => {
    const lost = deal(fixer(), { sell: [{ list: 'gear', rowId: 'knife' }], saleCut: 10 });
    if (!lost.ok) throw new Error(lost.error);
    expect(lost.result.quote).toMatchObject({ sell: 45, saleCutOff: 5, total: -45 });

    const won = fixer({ counterHaggle: { merchantId: 'm1', won: true, note: '' } });
    const fair = deal(won, { sell: [{ list: 'gear', rowId: 'knife' }], saleCut: 10 });
    if (!fair.ok) throw new Error(fair.error);
    expect(fair.result.quote).toMatchObject({ sell: 50, saleCutOff: 0 });
    // Transakcja przy tej ladzie zdejmuje rzut — następny targ od nowa.
    expect(fair.result.buyer.counterHaggle).toBeNull();

    // Wygrana przy innej ladzie nic tu nie daje.
    const elsewhere = fixer({ counterHaggle: { merchantId: 'm2', won: true, note: '' } });
    const other = deal(elsewhere, { sell: [{ list: 'gear', rowId: 'knife' }], saleCut: 10 });
    if (!other.ok) throw new Error(other.error);
    expect(other.result.quote.saleCutOff).toBe(5);
    expect(other.result.buyer.counterHaggle).not.toBeNull();
  });

  it('pół teraz, pół za miesiąc: płaci połowę, druga połowa w `deferred`, targ znika', () => {
    const buyer = fixer({ haggle: { dealId: 'halfLater', discount: 0, note: '' } });
    const result = deal(buyer, { buy: [{ list: 'gear', rowId: 'car', qty: 1 }] });
    if (!result.ok) throw new Error(result.error);
    expect(result.result.quote).toMatchObject({
      buy: 6000,
      deferred: 3000,
      paid: 3000,
      total: 3000,
    });
    expect(result.result.buyer.haggle).toBeNull();
  });

  it('za dużo rat — odmowa `TOO_MANY_DEBTS`', () => {
    const debts = Array.from({ length: CPRED_DEBTS_MAX }, (_, index) => ({
      id: `d${index}`,
      creditor: 'X',
      label: '',
      amount: 5,
      dueAtMinute: 1,
    }));
    const quote = cpredMerchantQuote({
      shelf: [
        {
          list: 'gear',
          rowId: 'car',
          name: 'Zegarek',
          detail: '',
          qty: 1,
          stackable: true,
          price: 6000,
          infinite: false,
          hidden: false,
        },
      ],
      buyer: fixer({ haggle: { dealId: 'halfLater', discount: 0, note: '' }, debts }),
      buy: [{ list: 'gear', rowId: 'car', qty: 1 }],
      sell: [],
      buyBackPct: 50,
      merchantCash: null,
      ctx,
    });
    expect(quote.problems.map((problem) => problem.code)).toContain('TOO_MANY_DEBTS');
  });

  it('szósta sztuka w koszyku sklepu', () => {
    const buyer = fixer({ haggle: { dealId: 'sixthFree', discount: 0, note: '' } });
    const result = deal(buyer, { buy: [{ list: 'gear', rowId: 'ammo', qty: 6 }] });
    if (!result.ok) throw new Error(result.error);
    expect(result.result.quote).toMatchObject({ buy: 60, haggleOff: 10, paid: 50 });
  });

  it('targ dobity przy innej ladzie nie działa i zostaje na karcie', () => {
    const buyer = fixer({ haggle: { ...percent10, merchantId: 'm2' } });
    const result = deal(buyer, { buy: [{ list: 'gear', rowId: 'ammo', qty: 2 }] });
    if (!result.ok) throw new Error(result.error);
    expect(result.result.quote.haggleOff).toBe(0);
    expect(result.result.buyer.haggle).not.toBeNull();
  });
});
