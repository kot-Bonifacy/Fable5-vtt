/**
 * Handlarz w CP RED (etap 46a): ile kosztuje wiersz, ile handlarz za niego da
 * i jak koszyk przechodzi z karty na kartę.
 *
 * Rdzeń (`merchants.ts`) wie, że jest półka, nakładka MG i mnożnik. Tu
 * mieszka to, czego rdzeń wiedzieć nie może: cena wiersza bierze się
 * z katalogu (`entryPrice` — liczba z tabeli albo cena pasma, s. 342), broń
 * liczy zamontowane dodatki, pancerz traci na wartości razem z OB, a targ
 * Fixera (30d) zdejmuje procent z zakupów jednej transakcji.
 *
 * Trzy zasady, których pilnuje ten plik:
 *
 *  - **jedna funkcja na cenę** — `cpredMerchantQuote` liczy stopkę okna
 *    u klienta i sumę, którą serwer porównuje z `expectTotal`; transakcja
 *    (`cpredMerchantDeal`) woła ją sama, więc nie ma drugiej arytmetyki,
 *  - **obie strony najpierw zdejmują, potem kładą** — jak `cpredSwapItems`
 *    (umowa 38c): stos po drodze nie połknie cudzych sztuk, a limit wierszy
 *    liczy się na stanie końcowym,
 *  - **wiersz „∞” zostaje**, a kupujący dostaje kopię z nowym id.
 */

import type { MerchantRowOverlay, MerchantRowOverlays } from '../../merchants.js';
import { merchantRowKey, pruneMerchantRows } from '../../merchants.js';
import type {
  CpredArmorRow,
  CpredCharacterData,
  CpredGearRow,
  CpredItemRow,
  CpredWeaponRow,
} from './character.js';
import {
  CPRED_ITEM_LISTS,
  cpredItemListsOverflow,
  cpredItemLists,
  cpredItemView,
  cpredLandRows,
  cpredRowId,
  cpredTakeRows,
  cpredWithItemLists,
  type CpredItemList,
  type CpredItemRef,
  type CpredItemView,
  type CpredTakenRow,
} from './inventory.js';
import { cpredHaggledPrice } from './roleability.js';

/** Cena wpisu katalogu po id — serwer i klient podają ją z własnego kompendium. */
export interface CpredPriceContext {
  priceOf(compendiumId: string): number | null;
}

/* ------------------------------------------------------------------ *
 * Ceny
 * ------------------------------------------------------------------ */

/**
 * Cena katalogowa jednej sztuki wiersza albo `null`, gdy wiersz nie pochodzi
 * z katalogu (ręcznie wpisany „Chip z kodem”) albo wpis nie mówi nic o cenie.
 *
 * Broń liczy zamontowane dodatki — Ronin z celownikiem kosztował więcej niż
 * goły Ronin i tyle samo jest wart. Dodatek, którego katalog już nie zna,
 * nie dodaje nic (zwalnia slot tak samo w `attachments.ts`). Pancerz traci na
 * wartości razem z OB: kurtka 7/11 jest warta 7/11 ceny.
 */
export function cpredRowCatalogPrice(
  list: CpredItemList,
  row: CpredItemRow,
  ctx: CpredPriceContext,
): number | null {
  if (!row.compendiumId) return null;
  const base = ctx.priceOf(row.compendiumId);
  if (base === null) return null;
  if (list === 'weapons') {
    const weapon = row as CpredWeaponRow;
    let total = base;
    for (const id of weapon.attachmentIds ?? []) total += ctx.priceOf(id) ?? 0;
    return total;
  }
  if (list === 'armor') {
    const armor = row as CpredArmorRow;
    if (armor.sp <= 0) return base;
    return (base * Math.max(0, Math.min(armor.spCurrent, armor.sp))) / armor.sp;
  }
  return base;
}

/**
 * Cena sztuki na półce: nakładka MG wygrywa i **nie** mnoży się przez
 * `priceMul` (MG wpisał cenę, a nie bazę), inaczej katalog × mnożnik,
 * zaokrąglony do pełnych eurodolców.
 */
export function cpredShelfPrice(
  catalog: number | null,
  overlay: MerchantRowOverlay | undefined,
  priceMul: number,
): number | null {
  if (overlay?.price !== undefined) return overlay.price;
  if (catalog === null) return null;
  return Math.round((catalog * priceMul) / 100);
}

/** Ile handlarz da za sztukę: katalog × odkup, w dół; `null` — bez ceny. */
export function cpredBuyBackPiece(catalog: number | null, buyBackPct: number): number | null {
  if (catalog === null) return null;
  return Math.floor((catalog * buyBackPct) / 100);
}

/* ------------------------------------------------------------------ *
 * Półka
 * ------------------------------------------------------------------ */

export interface CpredShelfRow extends CpredItemView {
  /** Cena za sztukę; `null` — bez ceny (gracz takiego wiersza nie dostaje). */
  price: number | null;
  infinite: boolean;
  hidden: boolean;
  /** Cena wpisana ręką przez MG. */
  priceOverride?: number;
}

/**
 * Półka handlarza: jego ekwipunek z cenami i nakładką MG.
 *
 * `forGm: false` zostawia wyłącznie to, co gracz może kupić — bez ukrytych
 * wierszy (dane niewidoczne dla gracza nie opuszczają serwera) i bez wierszy
 * bez ceny. MG widzi wszystko, z flagami.
 */
export function cpredMerchantShelf(
  merchant: CpredCharacterData,
  overlays: MerchantRowOverlays,
  priceMul: number,
  ctx: CpredPriceContext,
  options: { forGm: boolean },
): CpredShelfRow[] {
  const rows: CpredShelfRow[] = [];
  for (const list of CPRED_ITEM_LISTS) {
    for (const row of merchant[list] as CpredItemRow[]) {
      const overlay = overlays[merchantRowKey(list, row.id)];
      const price = cpredShelfPrice(cpredRowCatalogPrice(list, row, ctx), overlay, priceMul);
      const hidden = overlay?.hidden === true;
      if (!options.forGm && (hidden || price === null)) continue;
      rows.push({
        ...cpredItemView(list, row),
        price,
        infinite: overlay?.infinite === true,
        hidden,
        ...(overlay?.price !== undefined ? { priceOverride: overlay.price } : {}),
      });
    }
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * Wycena koszyka
 * ------------------------------------------------------------------ */

/** Jedna pozycja koszyka: wiersz półki i ile sztuk (kopii przy „∞”). */
export interface CpredMerchantBuyLine {
  list: CpredItemList;
  rowId: string;
  qty: number;
}

export type CpredMerchantProblemCode =
  | 'ROW_NOT_FOUND'
  | 'OUT_OF_STOCK'
  | 'BAD_QTY'
  | 'NO_PRICE'
  | 'NOT_BUYING'
  | 'ITEM_NOT_FOUND'
  | 'NOT_ENOUGH_EDDIES'
  | 'MERCHANT_NO_CASH'
  | 'NOTHING_TO_DEAL';

/** Powód odmowy; `side` i `key` wskazują wiersz, którego dotyczy (brak — całość). */
export interface CpredMerchantProblem {
  code: CpredMerchantProblemCode;
  side?: 'buy' | 'sell';
  key?: string;
}

export interface CpredMerchantQuote {
  /** Suma koszyka przed targiem. */
  buy: number;
  /** Ile zdjął targ Fixera (0 bez targu albo bez zakupów). */
  haggleOff: number;
  /** Suma pola sprzedaży — tyle handlarz płaci. */
  sell: number;
  /** Netto po stronie kupującego: dodatnie płaci, ujemne dostaje. */
  total: number;
  problems: CpredMerchantProblem[];
}

export interface CpredMerchantQuoteInput {
  /** Półka tak, jak widzi ją kupujący (`cpredMerchantShelf`, `forGm: false`). */
  shelf: readonly CpredShelfRow[];
  /** Karta kupującego: portfel, targ Fixera i ekwipunek do sprzedania. */
  buyer: CpredCharacterData;
  buy: readonly CpredMerchantBuyLine[];
  sell: readonly CpredItemRef[];
  buyBackPct: number;
  /** Kasa handlarza; `null` — „bez dna”. */
  merchantCash: number | null;
  ctx: CpredPriceContext;
}

function rowsOfList(data: CpredCharacterData, list: CpredItemList): CpredItemRow[] {
  return data[list] as CpredItemRow[];
}

/**
 * Wycena koszyka i pola sprzedaży — z listą powodów, dla których nie da się
 * zapłacić. Klient rysuje nią stopkę okna, serwer liczy nią sumę transakcji.
 *
 * Targ Fixera (`haggle`, 30d) zdejmuje procent z **sumy zakupów** tej jednej
 * transakcji — „w czasie jednej transakcji można dobić tylko jednego targu”
 * (ta sama zasada co `economy:buy`). Sprzedaży nie dotyczy.
 */
export function cpredMerchantQuote(input: CpredMerchantQuoteInput): CpredMerchantQuote {
  const { shelf, buyer, buy, sell, buyBackPct, merchantCash, ctx } = input;
  const problems: CpredMerchantProblem[] = [];
  let buySum = 0;

  const seen = new Set<string>();
  for (const line of buy) {
    const key = merchantRowKey(line.list, line.rowId);
    const row = shelf.find(
      (candidate) => candidate.list === line.list && candidate.rowId === line.rowId,
    );
    if (seen.has(key) || !Number.isInteger(line.qty) || line.qty < 1) {
      problems.push({ code: 'BAD_QTY', side: 'buy', key });
      continue;
    }
    seen.add(key);
    if (!row || row.hidden) {
      problems.push({ code: 'ROW_NOT_FOUND', side: 'buy', key });
      continue;
    }
    if (row.price === null) {
      problems.push({ code: 'NO_PRICE', side: 'buy', key });
      continue;
    }
    // Broń i pancerz to pojedyncze przedmioty z własnym stanem: więcej niż
    // jedna sztuka istnieje tylko jako kopie wiersza „bez dna”.
    if (!row.infinite && line.qty > row.qty) {
      problems.push({ code: row.stackable ? 'OUT_OF_STOCK' : 'BAD_QTY', side: 'buy', key });
      continue;
    }
    buySum += row.price * line.qty;
  }

  let sellSum = 0;
  const sold = new Set<string>();
  for (const ref of sell) {
    const key = merchantRowKey(ref.list, ref.rowId);
    const row = rowsOfList(buyer, ref.list).find((candidate) => candidate.id === ref.rowId);
    if (sold.has(key)) {
      problems.push({ code: 'BAD_QTY', side: 'sell', key });
      continue;
    }
    sold.add(key);
    if (!row) {
      problems.push({ code: 'ITEM_NOT_FOUND', side: 'sell', key });
      continue;
    }
    const qty = ref.list === 'gear' ? (ref.qty ?? (row as CpredGearRow).qty) : 1;
    if (
      ref.list === 'gear' &&
      (!Number.isInteger(qty) || qty < 1 || qty > (row as CpredGearRow).qty)
    ) {
      problems.push({ code: 'BAD_QTY', side: 'sell', key });
      continue;
    }
    if (buyBackPct <= 0) {
      problems.push({ code: 'NOT_BUYING', side: 'sell', key });
      continue;
    }
    const piece = cpredBuyBackPiece(cpredRowCatalogPrice(ref.list, row, ctx), buyBackPct);
    if (piece === null) {
      problems.push({ code: 'NO_PRICE', side: 'sell', key });
      continue;
    }
    sellSum += piece * qty;
  }

  const discount = buyer.haggle && buyer.haggle.discount > 0 ? buyer.haggle.discount : 0;
  const buyNet = buySum > 0 ? cpredHaggledPrice(buySum, discount) : 0;
  const total = buyNet - sellSum;

  if (buy.length === 0 && sell.length === 0) problems.push({ code: 'NOTHING_TO_DEAL' });
  if (total > 0 && buyer.eddies < total) problems.push({ code: 'NOT_ENOUGH_EDDIES' });
  if (total < 0 && merchantCash !== null && merchantCash < -total) {
    problems.push({ code: 'MERCHANT_NO_CASH' });
  }

  return { buy: buySum, haggleOff: buySum - buyNet, sell: sellSum, total, problems };
}

/* ------------------------------------------------------------------ *
 * Transakcja
 * ------------------------------------------------------------------ */

export interface CpredMerchantDealInput {
  buyer: CpredCharacterData;
  merchant: CpredCharacterData;
  overlays: MerchantRowOverlays;
  priceMul: number;
  buyBackPct: number;
  /** Kasa „bez dna” — wtedy kasy handlarza nie sprawdza się wcale. */
  cashInfinite: boolean;
  buy: readonly CpredMerchantBuyLine[];
  sell: readonly CpredItemRef[];
  ctx: CpredPriceContext;
  makeId?: () => string;
}

export type CpredMerchantDealError = CpredMerchantProblemCode | 'TOO_MANY_ROWS';

export interface CpredMerchantDealResult {
  /** Karty po transakcji — wyłącznie ekwipunek i targ; gotówkę zapisuje serwer. */
  buyer: CpredCharacterData;
  merchant: CpredCharacterData;
  /** Nakładki bez wierszy, które zniknęły z półki. */
  overlays: MerchantRowOverlays;
  quote: CpredMerchantQuote;
  /** Co kupujący dostał i co oddał — źródło zdania na czacie. */
  bought: CpredItemView[];
  sold: CpredItemView[];
}

/** Kopia wiersza „bez dna”: świeże id i — dla wyposażenia — zamówiona ilość. */
function shelfCopy(list: CpredItemList, row: CpredItemRow, qty: number, makeId: () => string) {
  const copy = list === 'gear' ? { ...(row as CpredGearRow), qty } : { ...row };
  return { ...copy, id: makeId() } as CpredItemRow;
}

/**
 * Koszyk i pole sprzedaży w jednej czystej operacji na dwóch kartach.
 *
 * Wycena i wszystkie odmowy pochodzą z `cpredMerchantQuote` liczonej **tu**,
 * na kartach, które serwer przeczytał wewnątrz transakcji — więc dwa zakupy
 * ostatniej sztuki w tej samej chwili kończą się jedną sprzedażą
 * i `OUT_OF_STOCK`. Gotówki ta funkcja nie rusza: saldo pisze serwer przez
 * `applyBalance`, bo każdy ruch zostawia wiersz historii.
 */
export function cpredMerchantDeal(
  input: CpredMerchantDealInput,
): { ok: true; result: CpredMerchantDealResult } | { ok: false; error: CpredMerchantDealError } {
  const makeId = input.makeId ?? cpredRowId;
  const shelf = cpredMerchantShelf(input.merchant, input.overlays, input.priceMul, input.ctx, {
    forGm: false,
  });
  const quote = cpredMerchantQuote({
    shelf,
    buyer: input.buyer,
    buy: input.buy,
    sell: input.sell,
    buyBackPct: input.buyBackPct,
    merchantCash: input.cashInfinite ? null : input.merchant.eddies,
    ctx: input.ctx,
  });
  const problem = quote.problems[0];
  if (problem) return { ok: false, error: problem.code };

  // Obie strony najpierw zdejmują: handlarz to, co nie jest „bez dna”,
  // kupujący — pole sprzedaży.
  const merchantLists = cpredItemLists(input.merchant);
  const buyerLists = cpredItemLists(input.buyer);
  const fromShelf: CpredTakenRow[] = [];
  const takeRefs: CpredItemRef[] = [];
  for (const line of input.buy) {
    const row = shelf.find(
      (candidate) => candidate.list === line.list && candidate.rowId === line.rowId,
    )!;
    if (row.infinite) {
      const source = rowsOfList(input.merchant, line.list).find(
        (candidate) => candidate.id === line.rowId,
      )!;
      // Broń i pancerz „bez dna” to osobne kopie; wyposażenie — jeden stos.
      const copies = line.list === 'gear' ? 1 : line.qty;
      for (let index = 0; index < copies; index += 1) {
        const copy = shelfCopy(line.list, source, line.qty, makeId);
        fromShelf.push({ list: line.list, row: copy, view: { ...cpredItemView(line.list, copy) } });
      }
      continue;
    }
    takeRefs.push(
      line.list === 'gear'
        ? { list: line.list, rowId: line.rowId, qty: line.qty }
        : { list: line.list, rowId: line.rowId },
    );
  }
  const tookShelf = cpredTakeRows(merchantLists, takeRefs);
  if (!tookShelf.ok)
    return { ok: false, error: tookShelf.error === 'BAD_QTY' ? 'OUT_OF_STOCK' : 'ROW_NOT_FOUND' };
  const tookBuyer = cpredTakeRows(buyerLists, input.sell);
  if (!tookBuyer.ok) {
    return { ok: false, error: tookBuyer.error === 'BAD_QTY' ? 'BAD_QTY' : 'ITEM_NOT_FOUND' };
  }

  // Nakładki przycina się PO zdjęciu, a PRZED położeniem: wiersz sprzedany do
  // zera traci klucz, a rzecz od kupującego wyląduje z id, którego nie ma na
  // żadnej liście — więc i w żadnej nakładce.
  const remaining = new Set<string>();
  for (const list of CPRED_ITEM_LISTS) {
    for (const row of merchantLists[list]) remaining.add(merchantRowKey(list, row.id));
  }
  const overlays = pruneMerchantRows(input.overlays, remaining);

  const bought = [...fromShelf, ...tookShelf.taken];
  cpredLandRows(buyerLists, bought, makeId);
  cpredLandRows(merchantLists, tookBuyer.taken, makeId);
  if (cpredItemListsOverflow(buyerLists) || cpredItemListsOverflow(merchantLists)) {
    return { ok: false, error: 'TOO_MANY_ROWS' };
  }

  // Targ znika w tym samym zapisie, który go wydał (umowa `economy:buy`, 30d).
  const haggleSpent = quote.buy > 0 && (input.buyer.haggle?.discount ?? 0) > 0;
  const buyer = cpredWithItemLists(input.buyer, buyerLists);
  return {
    ok: true,
    result: {
      buyer: haggleSpent ? { ...buyer, haggle: null } : buyer,
      merchant: cpredWithItemLists(input.merchant, merchantLists),
      overlays,
      quote,
      bought: bought.map((entry) => entry.view),
      sold: tookBuyer.taken.map((entry) => entry.view),
    },
  };
}

export const CPRED_MERCHANT_PROBLEM_TEXTS: Record<CpredMerchantDealError, string> = {
  ROW_NOT_FOUND: 'Tego towaru już nie ma na półce.',
  OUT_OF_STOCK: 'Handlarz nie ma tylu sztuk.',
  BAD_QTY: 'Zła ilość.',
  NO_PRICE: 'Ta rzecz nie ma ceny w katalogu — handlarz jej nie wyceni.',
  NOT_BUYING: 'Ten handlarz nic nie skupuje.',
  ITEM_NOT_FOUND: 'Tej rzeczy nie ma już na twojej karcie.',
  NOT_ENOUGH_EDDIES: 'Nie stać cię na to.',
  MERCHANT_NO_CASH: 'Handlarza nie stać na tyle.',
  NOTHING_TO_DEAL: 'Koszyk i pole sprzedaży są puste.',
  TOO_MANY_ROWS: 'Na karcie nie zmieści się więcej wierszy.',
};
