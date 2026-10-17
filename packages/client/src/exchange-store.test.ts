import { beforeEach, describe, expect, it } from 'vitest';
import type { TradeSideView, TradeView } from '@vtt/shared';
import { GM_ANY_KEY, liveTradeKey, useExchangeStore } from './stores/exchangeStore.js';

/**
 * Etap 46a: magazyn jednego okna „Wymiana”. Pilnuje tego, co widać przy
 * stole: przyjęte zaproszenie otwiera okno stronom handlu (a nie MG, który
 * tylko patrzy), zmiana drugiej strony nie zamyka okna, a koniec handlu
 * zostawia okno na karcie i ślad w doku.
 */

function side(patch: Partial<TradeSideView> = {}): TradeSideView {
  return { name: 'Vex', mine: false, items: [], eddies: 0, accepted: false, ...patch };
}

function trade(patch: Partial<TradeView> = {}): TradeView {
  return {
    id: 't1',
    status: 'invited',
    version: 1,
    sides: [side({ mine: true, characterId: 'c-vex' }), side({ name: 'Rico' })],
    ...patch,
  };
}

const store = () => useExchangeStore.getState();

beforeEach(() => {
  useExchangeStore.setState({ trades: {}, window: null, shops: [], shelves: {} });
});

describe('exchangeStore — handel', () => {
  it('zaproszenie nie otwiera okna, przyjęte zaproszenie — tak, na mojej karcie', () => {
    store().applyTrade(trade());
    expect(store().window).toBeNull();
    store().applyTrade(trade({ status: 'open' }));
    expect(store().window).toEqual({ anchorId: 'c-vex', tokenId: null, selected: 'live:t1' });
  });

  it('MG patrzący na handel graczy nie dostaje okna na siłę', () => {
    const watched = { sides: [side(), side({ name: 'Rico' })] as [TradeSideView, TradeSideView] };
    store().applyTrade(trade(watched));
    store().applyTrade(trade({ ...watched, status: 'open' }));
    expect(store().window).toBeNull();
    expect(Object.keys(store().trades)).toEqual(['t1']);
  });

  it('przyjęty handel nie przełącza okna, w którym ktoś przegląda sklep', () => {
    store().openWindow('c-vex', { selected: 'merchant:m1' });
    store().applyTrade(trade());
    store().applyTrade(trade({ status: 'open' }));
    expect(store().window?.selected).toBe('merchant:m1');
  });

  it('zmiana drugiej strony nie zamyka okna; powrót do handlu po kluczu', () => {
    store().applyTrade(trade({ status: 'open' }));
    store().select('merchant:m1');
    expect(store().window).toMatchObject({ anchorId: 'c-vex', selected: 'merchant:m1' });
    store().select(liveTradeKey('t1'));
    expect(store().window?.selected).toBe('live:t1');
  });

  it('zakończony handel znika z listy i zamyka swoje okno', () => {
    store().applyTrade(trade({ status: 'open' }));
    store().applyTrade(trade({ status: 'done', closedBy: 'Rico' }));
    expect(store().trades).toEqual({});
    expect(store().window).toBeNull();
  });

  it('po F5 `trade:list` odtwarza handel, a okno zgubionego zamyka', () => {
    store().openWindow('c-vex', { selected: 'live:t9' });
    store().replaceTrades([trade({ status: 'open' })]);
    expect(Object.keys(store().trades)).toEqual(['t1']);
    expect(store().window).toBeNull();
  });

  it('koniec cudzego handlu nie rusza okna, które patrzy gdzie indziej', () => {
    store().applyTrade(trade({ status: 'open' }));
    store().openWindow('c-vex', { selected: 'merchant:m1' });
    store().applyTrade(trade({ status: 'cancelled' }));
    expect(store().window?.selected).toBe('merchant:m1');
  });

  it('podgląd MG zamyka się razem z handlem, bo nie ma własnej karty', () => {
    const watched = { sides: [side(), side({ name: 'Rico' })] as [TradeSideView, TradeSideView] };
    store().applyTrade(trade({ ...watched, status: 'open' }));
    store().openTrade('t1');
    expect(store().window).toEqual({ anchorId: null, tokenId: null, selected: 'live:t1' });
    store().applyTrade(trade({ ...watched, status: 'cancelled' }));
    expect(store().window).toBeNull();
  });
});

describe('exchangeStore — sklepy', () => {
  it('półka podmienia się w całości i znika z `merchant:gone`', () => {
    const shelf = {
      id: 'm1',
      name: 'Spod lady',
      access: 'reach' as const,
      betweenSessions: false,
      priceMul: 120,
      buyBackPct: 50,
      cash: 500,
      rows: [],
    };
    store().applyShelf(shelf);
    store().applyShelf({ ...shelf, cash: 380 });
    expect(store().shelves.m1?.cash).toBe(380);
    store().dropShelf('m1');
    expect(store().shelves).toEqual({});
  });

  it('tryb MG bez figury ma własny klucz', () => {
    store().openWindow('c-paser', { selected: GM_ANY_KEY });
    expect(store().window?.selected).toBe('gm:any');
  });
});
