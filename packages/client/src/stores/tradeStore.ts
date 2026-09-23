import { create } from 'zustand';
import type { TradeView } from '@vtt/shared';
import { isTradeActive } from '@vtt/shared';

/**
 * Handel (etap 38c) — handle, które ten użytkownik widzi, i które okno jest otwarte.
 *
 * Źródłem prawdy jest serwer: każde `trade:update` podmienia cały widok, a po
 * przeładowaniu strony `trade:list` odtwarza listę. Klient nie składa handlu
 * z kawałków — pola wymiany rysuje dokładnie to, na co druga strona się zgadza.
 *
 * Ekwipunek własnej karty (lewa kolumna okna) czyta się z `characterStore`,
 * tak jak w oknie „Wymiana" z 38b; drugi magazyn na te same rzeczy rozjechałby
 * się przy pierwszym `character:upsert`.
 */
interface TradeStoreState {
  trades: Record<string, TradeView>;
  /** Okno handlu, które jest rozwinięte; inne czekają zwinięte w doku. */
  openId: string | null;
  /** Karta, dla której wybiera się partnera („Handel…" z karty albo z menu figury). */
  pickerFor: string | null;
  /** Ostatnie zamknięcie — dok pokazuje je chwilę, żeby „przerwane" nie znikało bez słowa. */
  lastClosed: TradeView | null;

  apply: (trade: TradeView) => void;
  replace: (trades: TradeView[]) => void;
  open: (tradeId: string | null) => void;
  openPicker: (characterId: string | null) => void;
  dismissClosed: () => void;
}

export const useTradeStore = create<TradeStoreState>((set) => ({
  trades: {},
  openId: null,
  pickerFor: null,
  lastClosed: null,

  apply: (trade) =>
    set((state) => {
      const trades = { ...state.trades };
      if (isTradeActive(trade)) {
        trades[trade.id] = trade;
        // Handel, który właśnie ruszył, otwiera się sam temu, kto w nim bierze
        // udział — zaproszony dostaje najpierw pytanie w doku, nie całe okno.
        const opens =
          trade.status === 'open' &&
          state.trades[trade.id]?.status !== 'open' &&
          trade.sides.some((side) => side.mine);
        return { trades, openId: opens ? trade.id : state.openId };
      }
      delete trades[trade.id];
      return {
        trades,
        openId: state.openId === trade.id ? null : state.openId,
        lastClosed: trade,
      };
    }),

  replace: (list) =>
    set((state) => {
      const trades: Record<string, TradeView> = {};
      for (const trade of list) if (isTradeActive(trade)) trades[trade.id] = trade;
      return {
        trades,
        openId: state.openId && trades[state.openId] ? state.openId : null,
      };
    }),

  open: (tradeId) => set({ openId: tradeId }),
  openPicker: (characterId) => set({ pickerFor: characterId }),
  dismissClosed: () => set({ lastClosed: null }),
}));
