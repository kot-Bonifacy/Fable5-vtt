import { beforeEach, describe, expect, it } from 'vitest';
import type { TradeSideView, TradeView } from '@vtt/shared';
import { useTradeStore } from './stores/tradeStore.js';

/**
 * Etap 38c: magazyn handli. Pilnuje dwóch zachowań, które widać przy stole:
 * okno otwiera się samo stronom handlu dokładnie w chwili, gdy zaproszenie
 * zostało przyjęte (a nie MG, który tylko patrzy), i zakończony handel znika
 * z listy, zostawiając ślad dla doku.
 */

function side(patch: Partial<TradeSideView> = {}): TradeSideView {
  return { name: 'Vex', mine: false, items: [], eddies: 0, accepted: false, ...patch };
}

function trade(patch: Partial<TradeView> = {}): TradeView {
  return {
    id: 't1',
    status: 'invited',
    version: 1,
    sides: [side({ mine: true }), side({ name: 'Rico' })],
    ...patch,
  };
}

beforeEach(() => {
  useTradeStore.setState({ trades: {}, openId: null, pickerFor: null, lastClosed: null });
});

describe('tradeStore', () => {
  it('zaproszenie nie otwiera okna, przyjęte zaproszenie — tak', () => {
    useTradeStore.getState().apply(trade());
    expect(useTradeStore.getState().openId).toBeNull();
    useTradeStore.getState().apply(trade({ status: 'open' }));
    expect(useTradeStore.getState().openId).toBe('t1');
  });

  it('MG patrzący na handel graczy nie dostaje okna na siłę', () => {
    const watched = { sides: [side(), side({ name: 'Rico' })] as [TradeSideView, TradeSideView] };
    useTradeStore.getState().apply(trade(watched));
    useTradeStore.getState().apply(trade({ ...watched, status: 'open' }));
    expect(useTradeStore.getState().openId).toBeNull();
    expect(Object.keys(useTradeStore.getState().trades)).toEqual(['t1']);
  });

  it('zwinięte okno nie wraca samo przy kolejnej zmianie pola', () => {
    useTradeStore.getState().apply(trade({ status: 'open' }));
    useTradeStore.getState().open(null);
    useTradeStore.getState().apply(trade({ status: 'open', version: 2 }));
    expect(useTradeStore.getState().openId).toBeNull();
  });

  it('zakończony handel znika z listy i zamyka okno, zostawiając ślad', () => {
    useTradeStore.getState().apply(trade({ status: 'open' }));
    useTradeStore.getState().apply(trade({ status: 'done', closedBy: 'Rico' }));
    const state = useTradeStore.getState();
    expect(state.trades).toEqual({});
    expect(state.openId).toBeNull();
    expect(state.lastClosed?.status).toBe('done');
  });
});
