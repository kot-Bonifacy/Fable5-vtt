import type {
  CompendiumEntry,
  CpredCharacterData,
  CpredItemRef,
  CpredMerchantBuyLine,
  CpredMerchantQuote,
  CpredPriceContext,
  CpredShelfRow,
  MerchantView,
} from '@vtt/shared';
import {
  cpredBuyBackPiece,
  cpredMerchantQuote,
  cpredRowCatalogPrice,
  entryPrice,
} from '@vtt/shared';

/**
 * Stopka okna sklepu (etap 46a) — suma liczona **tą samą** funkcją, którą
 * serwer porównuje z `expectTotal` (`cpredMerchantQuote`). Klient nie ma
 * drugiej arytmetyki: inna cena w oknie niż w bazie byłaby od razu
 * `QUOTE_CHANGED` przy każdym zakupie.
 */

/** Ceny katalogu z kompendium klienta (własne wpisy MG przychodzą w tym samym magazynie). */
export function clientPriceContext(entries: Record<string, CompendiumEntry>): CpredPriceContext {
  return {
    priceOf: (id) => {
      const entry = entries[id];
      return entry ? entryPrice(entry) : null;
    },
  };
}

/**
 * Półka z drutu w kształcie, którego chce wycena. Wiersz ukryty i bez ceny ma
 * tylko MG — kupić się go i tak nie da (serwer liczy półkę gracza).
 */
export function quoteShelf(view: MerchantView): CpredShelfRow[] {
  return view.rows
    .filter((row) => row.hidden !== true && row.price !== null)
    .map((row) => ({ ...row, hidden: false }));
}

export function merchantQuote(
  view: MerchantView,
  buyer: CpredCharacterData,
  buy: readonly CpredMerchantBuyLine[],
  sell: readonly CpredItemRef[],
  ctx: CpredPriceContext,
): CpredMerchantQuote {
  return cpredMerchantQuote({
    shelf: quoteShelf(view),
    buyer,
    buy,
    sell,
    buyBackPct: view.buyBackPct,
    merchantCash: view.cash,
    ctx,
  });
}

/** Ile handlarz da za sztukę wiersza z mojej karty; `null` — bez ceny w katalogu. */
export function buyBackOf(
  data: CpredCharacterData,
  list: CpredItemRef['list'],
  rowId: string,
  buyBackPct: number,
  ctx: CpredPriceContext,
): number | null {
  const row = (data[list] as { id: string }[]).find((candidate) => candidate.id === rowId);
  if (!row) return null;
  return cpredBuyBackPiece(
    cpredRowCatalogPrice(list, row as Parameters<typeof cpredRowCatalogPrice>[1], ctx),
    buyBackPct,
  );
}
