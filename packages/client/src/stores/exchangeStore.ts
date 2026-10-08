import { create } from 'zustand';
import type { MerchantListItem, MerchantView, TradeView } from '@vtt/shared';
import { isTradeActive } from '@vtt/shared';

/**
 * Jedno okno „Wymiana” (etap 46a) — handle, sklepy i to, co okno pokazuje.
 *
 * Zastępuje dwa magazyny z 38b/38c (`inventoryStore` i `tradeStore`), bo
 * okno jest jedno: o tym, czy rysuje handel, łup, sklep czy tryb MG, decyduje
 * wybrana **druga strona**, a zmiana strony nie zamyka okna.
 *
 * Źródłem prawdy dalej jest serwer: handel podmienia się w całości z każdym
 * `trade:update` (po F5 odtwarza go `trade:list`), półka — z każdym
 * `merchant:update`, lista sklepów — z `merchant:shops`. Ekwipunek własnej
 * karty czyta się z `characterStore`; drugi magazyn na te same rzeczy
 * rozjechałby się przy pierwszym `character:upsert`.
 */

/** Klucz otwartego handlu na liście drugich stron okna. */
export function liveTradeKey(tradeId: string): string {
  return `live:${tradeId}`;
}

/** Tryb MG bez wskazanej figury: „Dokąd” — dowolna karta. */
export const GM_ANY_KEY = 'gm:any';

export function tradeIdOfKey(key: string | null): string | null {
  return key?.startsWith('live:') ? key.slice('live:'.length) : null;
}

export interface ExchangeWindowState {
  /** Karta „mojej strony”; `null` — podgląd MG cudzego handlu. */
  anchorId: string | null;
  /** Figura wskazana z mapy — serwer dokłada ją do listy (u MG także spoza zasięgu). */
  tokenId: string | null;
  /**
   * Wybrana druga strona: klucz z `exchange:counterparts`, `live:<id>` dla
   * trwającego handlu albo `gm:any`; `null` — jeszcze nikogo nie wybrano.
   */
  selected: string | null;
}

interface ExchangeStoreState {
  trades: Record<string, TradeView>;
  /** Ostatnie zamknięcie — dok pokazuje je chwilę, żeby „przerwane” nie znikało bez słowa. */
  lastClosed: TradeView | null;
  window: ExchangeWindowState | null;
  /** Sklepy dla doku „Sklepy (N)” i ekranu „Między sesjami” (u MG — wszystkie). */
  shops: MerchantListItem[];
  /** Półki, które ten klient ogląda — przycięte przez serwer dla tego widza. */
  shelves: Record<string, MerchantView>;

  openWindow: (anchorId: string, options?: { tokenId?: string; selected?: string }) => void;
  /** Okno handlu — po stronie, którą prowadzę, albo podgląd MG. */
  openTrade: (tradeId: string) => void;
  select: (key: string | null) => void;
  closeWindow: () => void;

  applyTrade: (trade: TradeView) => void;
  replaceTrades: (trades: TradeView[]) => void;
  dismissClosed: () => void;

  setShops: (shops: MerchantListItem[]) => void;
  applyShelf: (shelf: MerchantView) => void;
  dropShelf: (merchantId: string) => void;
}

function windowForTrade(trade: TradeView): ExchangeWindowState {
  const mine = trade.sides.find((side) => side.mine);
  return {
    anchorId: mine?.characterId ?? null,
    tokenId: null,
    selected: liveTradeKey(trade.id),
  };
}

export const useExchangeStore = create<ExchangeStoreState>((set) => ({
  trades: {},
  lastClosed: null,
  window: null,
  shops: [],
  shelves: {},

  openWindow: (anchorId, options) =>
    set({
      window: {
        anchorId,
        tokenId: options?.tokenId ?? null,
        selected: options?.selected ?? null,
      },
    }),

  openTrade: (tradeId) =>
    set((state) => {
      const trade = state.trades[tradeId];
      return trade ? { window: windowForTrade(trade) } : {};
    }),

  select: (key) =>
    set((state) => (state.window ? { window: { ...state.window, selected: key } } : {})),

  closeWindow: () => set({ window: null }),

  applyTrade: (trade) =>
    set((state) => {
      const trades = { ...state.trades };
      const key = liveTradeKey(trade.id);
      if (isTradeActive(trade)) {
        trades[trade.id] = trade;
        // Handel, który właśnie ruszył, otwiera się sam temu, kto w nim bierze
        // udział — ale tylko wtedy, gdy okno jest zamknięte. Okna, w którym
        // ktoś właśnie przegląda półkę, nie przełączamy mu pod ręką; handel
        // czeka w doku („Otwórz”).
        const opens =
          trade.status === 'open' &&
          state.trades[trade.id]?.status !== 'open' &&
          trade.sides.some((side) => side.mine) &&
          state.window === null;
        return { trades, window: opens ? windowForTrade(trade) : state.window };
      }
      delete trades[trade.id];
      // Koniec handlu zamyka okno, które go pokazywało — jak w 38c. Zostawione
      // otwarte stało bez strony nad kartą postaci (oględziny 08.10).
      return {
        trades,
        lastClosed: trade,
        window: state.window?.selected === key ? null : state.window,
      };
    }),

  replaceTrades: (list) =>
    set((state) => {
      const trades: Record<string, TradeView> = {};
      for (const trade of list) if (isTradeActive(trade)) trades[trade.id] = trade;
      const tradeId = tradeIdOfKey(state.window?.selected ?? null);
      const lost = tradeId !== null && !trades[tradeId];
      return { trades, window: lost ? null : state.window };
    }),

  dismissClosed: () => set({ lastClosed: null }),

  setShops: (shops) => set({ shops }),

  applyShelf: (shelf) => set((state) => ({ shelves: { ...state.shelves, [shelf.id]: shelf } })),

  dropShelf: (merchantId) =>
    set((state) => {
      if (!(merchantId in state.shelves)) return {};
      const shelves = { ...state.shelves };
      delete shelves[merchantId];
      return { shelves };
    }),
}));

/** Trwający handel tej karty — karta handluje na jeden front naraz (`CHARACTER_BUSY`). */
export function activeTradeOf(characterId: string): TradeView | undefined {
  return Object.values(useExchangeStore.getState().trades).find(
    (trade) => isTradeActive(trade) && trade.sides.some((side) => side.characterId === characterId),
  );
}
