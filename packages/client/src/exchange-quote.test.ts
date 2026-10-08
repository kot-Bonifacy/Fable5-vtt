import { describe, expect, it } from 'vitest';
import type { CompendiumEntry, MerchantView } from '@vtt/shared';
import { createDefaultCharacterData } from '@vtt/shared';
import { buyBackOf, clientPriceContext, merchantQuote, quoteShelf } from './exchange-quote.js';

/**
 * Etap 46a: stopka okna sklepu. Suma w oknie ma być **tą samą** liczbą, którą
 * serwer porówna z `expectTotal` — a wiersze, które widzi tylko MG (ukryte,
 * bez ceny), nie mogą wejść do koszyka nawet u MG.
 */

const entries = {
  'gear.stimpak': { id: 'gear.stimpak', cost: 50 },
  'weapon.pistol': { id: 'weapon.pistol', cost: 100 },
} as unknown as Record<string, CompendiumEntry>;

const ctx = clientPriceContext(entries);

function view(patch: Partial<MerchantView> = {}): MerchantView {
  return {
    id: 'm1',
    name: 'Spod lady',
    access: 'reach',
    betweenSessions: false,
    priceMul: 120,
    buyBackPct: 50,
    cash: 500,
    rows: [
      {
        list: 'gear',
        rowId: 'g-stim',
        name: 'Stimpak',
        detail: '',
        qty: 3,
        stackable: true,
        compendiumId: 'gear.stimpak',
        price: 60,
        infinite: true,
      },
      {
        list: 'gear',
        rowId: 'g-ronin',
        name: 'Ronin',
        detail: '',
        qty: 1,
        stackable: true,
        price: 600,
        infinite: false,
        hidden: true,
      },
      {
        list: 'gear',
        rowId: 'g-chip',
        name: 'Chip',
        detail: '',
        qty: 1,
        stackable: true,
        price: null,
        infinite: false,
      },
    ],
    ...patch,
  };
}

function buyer() {
  const data = createDefaultCharacterData();
  data.eddies = 1000;
  data.weapons = [
    {
      id: 'w-pistol',
      name: 'Pistolet ciężki',
      notes: '',
      compendiumId: 'weapon.pistol',
      damage: '3k6',
      ammoCurrent: 8,
      ammoMax: 8,
      ammoType: '',
      rof: '2',
    },
  ];
  return data;
}

describe('stopka sklepu', () => {
  it('ceny katalogu z kompendium klienta', () => {
    expect(ctx.priceOf('gear.stimpak')).toBe(50);
    expect(ctx.priceOf('nie-ma')).toBeNull();
  });

  it('ukryty wiersz i wiersz bez ceny nie trafiają do wyceny nawet u MG', () => {
    expect(quoteShelf(view()).map((row) => row.rowId)).toEqual(['g-stim']);
    const quote = merchantQuote(
      view(),
      buyer(),
      [{ list: 'gear', rowId: 'g-ronin', qty: 1 }],
      [],
      ctx,
    );
    expect(quote.problems.map((problem) => problem.code)).toContain('ROW_NOT_FOUND');
  });

  it('kupno i sprzedaż w jednej transakcji: razem = zakupy − odkup', () => {
    const quote = merchantQuote(
      view(),
      buyer(),
      [{ list: 'gear', rowId: 'g-stim', qty: 2 }],
      [{ list: 'weapons', rowId: 'w-pistol' }],
      ctx,
    );
    expect(quote).toMatchObject({ buy: 120, sell: 50, total: 70, problems: [] });
  });

  it('odkup przy wierszu mojej karty: połowa katalogu, bez katalogu — brak ceny', () => {
    const data = buyer();
    expect(buyBackOf(data, 'weapons', 'w-pistol', 50, ctx)).toBe(50);
    expect(buyBackOf(data, 'weapons', 'nie-ma', 50, ctx)).toBeNull();
  });
});
