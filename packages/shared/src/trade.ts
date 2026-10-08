/**
 * Handel między dwiema kartami (etap 38c) — stan negocjacji, bez przedmiotów.
 *
 * Rdzeń VTT, nie CP RED: tutaj mieszka wyłącznie to, **kto** może co kliknąć
 * i **kiedy** handel jest gotów do wykonania. Czym są rzeczy w polach wymiany
 * i jak przechodzą z karty na kartę, wie warstwa systemu (`cpredSwapItems`,
 * `cpredOfferViews`); tu jadą jako adresy i gotowe do narysowania widoki.
 *
 * Rozstrzygnięcia MG z 23.09.2026, których pilnuje ten plik:
 *
 *  1. **Handel zaczyna się zaproszeniem.** Zaproszony dostaje okno po
 *     „Przyjmij"; zapraszający ma je od razu, w stanie „czeka na…", i może już
 *     kłaść rzeczy w swoje pole (etap 46a, jedno okno „Wymiana") — inaczej
 *     „Wyślij bez czekania" nie miałoby czego wysłać. Zgód w tym stanie nie ma.
 *  2. **Każda zmiana w którymkolwiek polu wymiany kasuje OBIE zgody.** Nikt
 *     nie podmieni przedmiotu w chwili, gdy druga strona już kliknęła. Zgoda
 *     niesie numer wersji, którą widział klikający — zgoda na starszą wersję
 *     przepada (`TRADE_CHANGED`), bo inaczej zmiana i kliknięcie wysłane w tej
 *     samej sekundzie rozminęłyby się na korzyść tego, kto zmienił.
 *  3. **Stronę NPC-a prowadzi MG.** Karta bez właściciela nie ma innego
 *     operatora. Stronę gracza prowadzi wyłącznie gracz — MG ogląda i może
 *     handel przerwać, ale nie zatwierdzi za nikogo.
 */

import type { CpredItemViewWire, InventoryItemRefWire } from './protocol.js';

/** `invited` czeka na drugą stronę, `open` to negocjacje, reszta jest zamknięta. */
export type TradeStatus = 'invited' | 'open' | 'done' | 'cancelled';

/** Najwięcej pozycji w jednym polu wymiany — tyle, ile „Zabierz wszystko" z 38b. */
export const TRADE_ITEMS_MAX = 40;

/** Jedna strona handlu tak, jak trzyma ją serwer. */
export interface TradeSideState {
  characterId: string;
  /** Nazwa, którą wolno wymówić przy stole (alias figury NPC-a, etap 13.09). */
  name: string;
  /** Właściciel karty; `null` znaczy NPC, którego prowadzi MG. */
  ownerId: string | null;
  /**
   * Karta drużyny (gracz albo towarzysz-bot, umowa #40) — jej id gracz i tak
   * zna, więc widok je niesie. Po nim okno „Wymiana” (46a) wysyła pole
   * zapraszającego „bez czekania” jako propozycję z 38b.
   */
  team?: boolean;
  /** Adresy w polu wymiany — zawsze z jawną ilością przy wyposażeniu. */
  items: InventoryItemRefWire[];
  /** Te same pozycje, gotowe do narysowania: „Zgrzyt 9 (12/30)". */
  views: CpredItemViewWire[];
  eddies: number;
  accepted: boolean;
}

export interface TradeState {
  id: string;
  campaignId: string;
  status: TradeStatus;
  /** Rośnie przy każdej zmianie pól wymiany — patrz rozstrzygnięcie 2. */
  version: number;
  /** Strona 0 zaprasza, strona 1 jest zaproszona. */
  sides: [TradeSideState, TradeSideState];
  /** Kto zamknął handel — dla plakietki „Przerwane — MG". */
  closedBy?: string;
  /** Ostatnia odmowa wykonania (`OUT_OF_REACH`, `OFFER_STALE`…) — obie strony ją widzą. */
  notice?: string;
}

/** Strona handlu tak, jak widzi ją konkretny użytkownik. */
export interface TradeSideView {
  /**
   * Id karty — dla tego, kto tę stronę prowadzi, dla MG i dla karty drużyny
   * (46a). Gracz nie poznaje `characterId` karty NPC-a żadną drogą (umowa
   * z etapu 05, #40).
   */
  characterId?: string;
  name: string;
  /** Tę stronę prowadzi patrzący — jego pole wymiany da się edytować. */
  mine: boolean;
  items: CpredItemViewWire[];
  eddies: number;
  accepted: boolean;
}

export interface TradeView {
  id: string;
  status: TradeStatus;
  version: number;
  sides: [TradeSideView, TradeSideView];
  closedBy?: string;
  notice?: string;
}

export type TradeSideIndex = 0 | 1;

/** Kto prowadzi stronę: właściciel karty albo — dla NPC — MG. */
export function mayOperateTradeSide(side: TradeSideState, userId: string, isGm: boolean): boolean {
  return side.ownerId === null ? isGm : side.ownerId === userId;
}

/** Którą stronę prowadzi ten użytkownik; `null`, gdy żadnej (MG przy handlu graczy). */
export function tradeSideOf(
  trade: TradeState,
  userId: string,
  isGm: boolean,
): TradeSideIndex | null {
  if (mayOperateTradeSide(trade.sides[0], userId, isGm)) return 0;
  if (mayOperateTradeSide(trade.sides[1], userId, isGm)) return 1;
  return null;
}

/** Kto widzi handel: obie strony i MG (rozstrzygnięcie MG — podgląd i przerwanie). */
export function mayViewTrade(trade: TradeState, userId: string, isGm: boolean): boolean {
  return isGm || tradeSideOf(trade, userId, isGm) !== null;
}

/** Kto może przerwać: każda ze stron i MG, także w handlu dwóch graczy. */
export function mayCancelTrade(trade: TradeState, userId: string, isGm: boolean): boolean {
  return isTradeActive(trade) && mayViewTrade(trade, userId, isGm);
}

export function isTradeActive(trade: Pick<TradeState, 'status'>): boolean {
  return trade.status === 'invited' || trade.status === 'open';
}

/** Oba pola puste — nie ma czego wymieniać, więc nie ma czego zatwierdzać. */
export function isTradeEmpty(trade: Pick<TradeState, 'sides'>): boolean {
  return trade.sides.every((side) => side.items.length === 0 && side.eddies === 0);
}

/**
 * Czy ta strona może teraz zmieniać swoje pole wymiany (rozstrzygnięcie 1):
 * w negocjacjach obie, przed przyjęciem zaproszenia — wyłącznie zapraszający.
 */
export function mayEditTradeOffer(
  trade: Pick<TradeState, 'status'>,
  side: TradeSideIndex,
): boolean {
  if (trade.status === 'open') return true;
  return trade.status === 'invited' && side === 0;
}

/**
 * Nowa zawartość pola wymiany jednej strony. Kasuje **obie** zgody i podbija
 * wersję — rozstrzygnięcie 2 w nagłówku pliku.
 */
export function setTradeOffer(
  trade: TradeState,
  side: TradeSideIndex,
  offer: Pick<TradeSideState, 'items' | 'views' | 'eddies'>,
): TradeState {
  const sides = trade.sides.map((current, index) => ({
    ...current,
    ...(index === side ? offer : {}),
    accepted: false,
  })) as [TradeSideState, TradeSideState];
  const { notice: _notice, ...rest } = trade;
  return { ...rest, sides, version: trade.version + 1 };
}

export type TradeAcceptError = 'TRADE_NOT_OPEN' | 'TRADE_CHANGED' | 'TRADE_EMPTY';

/**
 * Zgoda albo jej cofnięcie. Zgoda przechodzi wyłącznie na wersję, którą
 * klikający widział; cofnięcie zawsze (nie ma czego pilnować).
 */
export function setTradeAccept(
  trade: TradeState,
  side: TradeSideIndex,
  accepted: boolean,
  seenVersion: number,
): { ok: true; trade: TradeState } | { ok: false; error: TradeAcceptError } {
  if (trade.status !== 'open') return { ok: false, error: 'TRADE_NOT_OPEN' };
  if (accepted && seenVersion !== trade.version) return { ok: false, error: 'TRADE_CHANGED' };
  if (accepted && isTradeEmpty(trade)) return { ok: false, error: 'TRADE_EMPTY' };
  const sides = trade.sides.map((current, index) =>
    index === side ? { ...current, accepted } : current,
  ) as [TradeSideState, TradeSideState];
  return { ok: true, trade: { ...trade, sides } };
}

/** Obie strony zgodziły się na tę samą wersję — serwer wykonuje wymianę. */
export function isTradeReady(trade: TradeState): boolean {
  return (
    trade.status === 'open' && trade.sides.every((side) => side.accepted) && !isTradeEmpty(trade)
  );
}

/**
 * Odmowa wykonania: zgody przepadają, powód zostaje na widoku obu stron.
 * Wersja rośnie, bo stan, na który się zgadzano, właśnie okazał się nieaktualny.
 */
export function withTradeNotice(trade: TradeState, notice: string): TradeState {
  const sides = trade.sides.map((side) => ({ ...side, accepted: false })) as [
    TradeSideState,
    TradeSideState,
  ];
  return { ...trade, sides, version: trade.version + 1, notice };
}

/** Widok dla jednego patrzącego — bez `characterId` kart spoza drużyny. */
export function tradeViewFor(trade: TradeState, userId: string, isGm: boolean): TradeView {
  const sides = trade.sides.map((side) => {
    const mine = mayOperateTradeSide(side, userId, isGm);
    return {
      ...(mine || isGm || side.team === true ? { characterId: side.characterId } : {}),
      name: side.name,
      mine,
      items: side.views,
      eddies: side.eddies,
      accepted: side.accepted,
    };
  }) as [TradeSideView, TradeSideView];
  return {
    id: trade.id,
    status: trade.status,
    version: trade.version,
    sides,
    ...(trade.closedBy ? { closedBy: trade.closedBy } : {}),
    ...(trade.notice ? { notice: trade.notice } : {}),
  };
}
