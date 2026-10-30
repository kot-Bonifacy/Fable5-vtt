import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CpredCharacterData,
  CpredItemRef,
  CpredItemViewWire,
  CpredMerchantBuyLine,
  MerchantShelfRowView,
} from '@vtt/shared';
import {
  CPRED_MERCHANT_PROBLEM_TEXTS,
  MERCHANT_CLOSED_LABELS,
  cpredInventoryView,
} from '@vtt/shared';
import { buyBackOf, clientPriceContext, merchantQuote } from '../../exchange-quote.js';
import { clearNotices, notifyInfo, notifyRefusal } from '../../notices.js';
import { dealMerchant, merchantErrorText, viewMerchant } from '../../socket.js';
import { useCharacterStore } from '../../stores/characterStore.js';
import { COMBAT_LOCKED_HINT, useCombatLocked } from '../../stores/combatStore.js';
import { useCompendiumStore } from '../../stores/compendiumStore.js';
import { useExchangeStore } from '../../stores/exchangeStore.js';
import { InlineNotice } from '../NoticeColumn.js';
import { useExchangeDrag } from './drag.js';
import { ItemGrid, countLabel, useGridSelection, useItemTile, type GridTile } from './ItemGrid.js';
import { formatEd, itemKey } from './items.js';

/**
 * Tryb `merchant` okna „Wymiana” (etap 46a, wzór: *Merchant* z Item Piles).
 *
 * Lewa kolumna: mój ekwipunek z ceną odkupu na każdym kaflu. Środek: moje
 * pole sprzedaży i koszyk. Prawa: półka handlarza — tak, jak przyciął ją
 * serwer dla mnie (bez ukrytego towaru i bez id jego karty). Jedno „Zapłać”
 * robi kupno i sprzedaż w jednej transakcji, od ręki, bez zgody MG
 * (decyzja 4), także w grze solo. Od 64c każda kolumna to siatka kafli
 * (`ItemGrid`) z zaznaczaniem wielu.
 *
 * Stopka liczy sumę **tą samą** funkcją co serwer, a „Zapłać” wysyła ją jako
 * `expectTotal`: gdy w międzyczasie MG zmienił cenę albo ktoś wykupił ostatnią
 * sztukę, serwer odpowiada `QUOTE_CHANGED`, a okno pobiera półkę na nowo —
 * nigdy nie płaci się po cichu innej ceny.
 */

type DragSource = { from: 'inventory' | 'sell' | 'shelf' | 'basket'; keys: string[] };

/** Najwięcej kopii z wiersza „∞” w jednym koszyku — tyle przyjmie serwer. */
const BUY_QTY_MAX = 999;

function maxBuy(row: MerchantShelfRowView): number {
  return row.infinite ? BUY_QTY_MAX : row.qty;
}

function signed(value: number): string {
  if (value === 0) return formatEd(0);
  return value > 0 ? `−${formatEd(value)}` : `+${formatEd(-value)}`;
}

export function MerchantPane({ anchorId, merchantId }: { anchorId: string; merchantId: string }) {
  const anchor = useCharacterStore((s) => s.characters[anchorId]);
  const data = anchor?.data as CpredCharacterData | undefined;
  const view = useExchangeStore((s) => s.shelves[merchantId]);
  const entries = useCompendiumStore((s) => s.entries);
  const ctx = useMemo(() => clientPriceContext(entries), [entries]);

  const [basket, setBasket] = useState<Record<string, number>>({});
  // 21.10.2026: w walce gracz nie handluje — koszyk zostaje na po starciu.
  const inCombat = useCombatLocked();
  const [selling, setSelling] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    const ack = await viewMerchant(merchantId);
    if (ack.ok && ack.data) {
      useExchangeStore.getState().applyShelf(ack.data.merchant);
      setLoadError(null);
    } else if (!ack.ok) {
      setLoadError(merchantErrorText(ack.error));
    }
  }

  useEffect(() => {
    setBasket({});
    setSelling({});
    void load();
  }, [merchantId]);

  // Półkę zabrał serwer (`merchant:gone`: koniec sesji, MG zamknął sklep
  // zdalny, figura zeszła ze sceny) — pytamy jeszcze raz, żeby okno powiedziało
  // dlaczego, zamiast wisieć na „Wczytuję półkę…”.
  const hadView = useRef(false);
  useEffect(() => {
    if (view) hadView.current = true;
    else if (hadView.current) {
      hadView.current = false;
      void load();
    }
  }, [view]);

  const shelf = useMemo(() => (view?.rows ?? []).filter((row) => row.hidden !== true), [view]);
  const rowByKey = useMemo(() => new Map(shelf.map((row) => [itemKey(row), row])), [shelf]);

  // Towar, którego już nie ma na półce, wypada z koszyka sam — inaczej stopka
  // pokazywałaby „Tego towaru już nie ma” bez wskazania, o który wiersz chodzi.
  useEffect(() => {
    setBasket((current) => {
      const next: Record<string, number> = {};
      for (const [key, qty] of Object.entries(current)) {
        const row = rowByKey.get(key);
        if (row) next[key] = Math.min(qty, maxBuy(row));
      }
      return next;
    });
  }, [rowByKey]);

  const myItems = useMemo(() => (data ? cpredInventoryView(data) : []), [data]);
  const myByKey = useMemo(() => new Map(myItems.map((item) => [itemKey(item), item])), [myItems]);

  useEffect(() => {
    setSelling((current) => {
      const next: Record<string, number> = {};
      for (const [key, qty] of Object.entries(current)) {
        const item = myByKey.get(key);
        if (item) next[key] = Math.min(qty, item.qty);
      }
      return next;
    });
  }, [myByKey]);

  // Półka i karta potrafią przyjść przed odpowiedzią na „Zapłać” (rozgłoszenie
  // wyprzedza ack): wiersz, którego już nie ma, wypada z linii od razu, w tym
  // samym renderze — sprzątanie stanu w efekcie przyszłoby o klatkę za późno.
  const buyLines: CpredMerchantBuyLine[] = Object.entries(basket).flatMap(([key, qty]) => {
    const row = rowByKey.get(key);
    return row ? [{ list: row.list, rowId: row.rowId, qty }] : [];
  });
  const sellRefs: CpredItemRef[] = Object.entries(selling).flatMap(([key, qty]) => {
    const item = myByKey.get(key);
    if (!item) return [];
    return [
      item.stackable
        ? { list: item.list, rowId: item.rowId, qty }
        : { list: item.list, rowId: item.rowId },
    ];
  });

  const quote = useMemo(
    () => (view && data ? merchantQuote(view, data, buyLines, sellRefs, ctx) : null),
    [view, data, basket, selling, ctx],
  );

  const buyBack = (item: CpredItemViewWire): number | null =>
    view && data ? buyBackOf(data, item.list, item.rowId, view.buyBackPct, ctx) : null;

  function addToBasket(row: MerchantShelfRowView, qty = 1) {
    setBasket((current) => ({
      ...current,
      [itemKey(row)]: Math.min((current[itemKey(row)] ?? 0) + qty, maxBuy(row)),
    }));
  }

  function setBasketQty(row: MerchantShelfRowView, raw: string) {
    const qty = Number.parseInt(raw, 10);
    setBasket((current) => {
      const next = { ...current };
      if (!Number.isInteger(qty) || qty <= 0) delete next[itemKey(row)];
      else next[itemKey(row)] = Math.min(qty, maxBuy(row));
      return next;
    });
  }

  function addToSell(item: CpredItemViewWire) {
    if (buyBack(item) === null || (view?.buyBackPct ?? 0) <= 0) return;
    setSelling((current) => ({ ...current, [itemKey(item)]: item.qty }));
  }

  function setSellQty(item: CpredItemViewWire, raw: string) {
    const qty = Number.parseInt(raw, 10);
    setSelling((current) => {
      const next = { ...current };
      if (!Number.isInteger(qty) || qty <= 0) delete next[itemKey(item)];
      else next[itemKey(item)] = Math.min(qty, item.qty);
      return next;
    });
  }

  function drop(key: string, from: 'basket' | 'selling') {
    const setter = from === 'basket' ? setBasket : setSelling;
    setter((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function pay() {
    if (!quote || !view) return;
    setBusy(true);
    const ack = await dealMerchant({
      merchantId,
      characterId: anchorId,
      buy: buyLines,
      sell: sellRefs,
      expectTotal: quote.total,
    });
    setBusy(false);
    if (!ack.ok) {
      notifyRefusal('exchange', merchantErrorText(ack.error));
      // Półka mogła się zmienić (cena, ostatnia sztuka, handlarz padł) —
      // pokazujemy nową, zanim ktoś kliknie drugi raz.
      void load();
      return;
    }
    setBasket({});
    setSelling({});
    const total = ack.data?.total ?? quote.total;
    clearNotices('exchange');
    notifyInfo(
      `${total >= 0 ? `Zapłacone: ${formatEd(total)}` : `Dostajesz: ${formatEd(-total)}`}. Zostało ${ack.data ? formatEd(ack.data.balance) : '? ed'}.`,
      { title: 'Sklep', topic: 'exchange' },
    );
  }

  const tile = useItemTile();
  const wallet = data?.eddies ?? 0;
  const inventory = myItems
    .map((item) => ({ ...item, qty: item.qty - (selling[itemKey(item)] ?? 0) }))
    .filter((item) => item.qty > 0);
  const inventoryTiles: GridTile[] = inventory.map((item) => {
    const piece = buyBack(item);
    const sellable = piece !== null && (view?.buyBackPct ?? 0) > 0;
    return tile(item, {
      ...(sellable ? { price: formatEd(piece) } : {}),
      blocked: !sellable,
      blockedHint:
        (view?.buyBackPct ?? 0) <= 0
          ? 'Ten handlarz nic nie skupuje.'
          : 'Bez ceny w katalogu — handlarz tego nie wyceni.',
    });
  });
  const sellTiles: GridTile[] = Object.entries(selling).flatMap(([key, qty]) => {
    const item = myByKey.get(key);
    if (!item) return [];
    return [
      tile(item, {
        ...(item.stackable ? { badge: `×${qty}` } : {}),
        price: `+${formatEd((buyBack(item) ?? 0) * qty)}`,
      }),
    ];
  });
  const basketTiles: GridTile[] = Object.entries(basket).flatMap(([key, qty]) => {
    const row = rowByKey.get(key);
    if (!row) return [];
    return [
      tile(row, {
        badge: `×${qty}`,
        qty: maxBuy(row),
        stackable: row.stackable || row.infinite === true,
        price: `−${formatEd((row.price ?? 0) * qty)}`,
      }),
    ];
  });
  const shelfTiles: GridTile[] = shelf.map((row) => {
    const left = row.infinite ? Infinity : row.qty - (basket[itemKey(row)] ?? 0);
    return tile(row, {
      ...(row.infinite ? { badge: '∞' } : {}),
      price: row.price === null ? '⚠ bez ceny' : formatEd(row.price),
      blocked: row.price === null || left <= 0,
      blockedHint:
        row.price === null ? 'Bez ceny — gracze tego nie widzą' : 'Wszystko już w koszyku',
    });
  });
  const inventorySelection = useGridSelection(inventoryTiles.map((t) => t.key));
  const sellSelection = useGridSelection(sellTiles.map((t) => t.key));
  const basketSelection = useGridSelection(basketTiles.map((t) => t.key));
  const shelfSelection = useGridSelection(shelfTiles.map((t) => t.key));

  // Etap 64c: każda kolumna to siatka z zaznaczaniem wielu — dwuklik, pasek
  // i przeciągnięcie przenoszą całe zaznaczenie.
  const sellItems = (keys: string[]) => {
    for (const key of keys) {
      const item = myByKey.get(key);
      if (item) addToSell(item);
    }
    inventorySelection.clear();
  };
  const unsell = (keys: string[]) => {
    for (const key of keys) drop(key, 'selling');
    sellSelection.clear();
  };
  const buyRows = (keys: string[]) => {
    for (const key of keys) {
      const row = rowByKey.get(key);
      if (row) addToBasket(row);
    }
    shelfSelection.clear();
  };
  const unbuy = (keys: string[]) => {
    for (const key of keys) drop(key, 'basket');
    basketSelection.clear();
  };

  const closed = view?.closed;
  const { drag, hoverZone, handlers } = useExchangeDrag<DragSource>((source, zone) => {
    if (source.from === 'inventory' && zone === 'sell') sellItems(source.keys);
    else if (source.from === 'sell' && zone === 'inventory') unsell(source.keys);
    else if (source.from === 'shelf' && zone === 'basket') buyRows(source.keys);
    else if (source.from === 'basket' && zone === 'shelf') unbuy(source.keys);
  }, busy);
  const grab = (from: DragSource['from']) => (keys: string[]) => handlers({ from, keys });

  if (!view) {
    return (
      <div className="trade-footer">
        {loadError ? (
          <InlineNotice tone="danger" title="Sklep" role="status">
            {loadError}
          </InlineNotice>
        ) : (
          <p className="inventory-hint">Wczytuję półkę…</p>
        )}
      </div>
    );
  }

  const problems = (quote?.problems ?? []).filter((problem) => problem.code !== 'NOTHING_TO_DEAL');
  const problemTexts = [
    ...new Set(problems.map((problem) => CPRED_MERCHANT_PROBLEM_TEXTS[problem.code])),
  ];
  const empty = buyLines.length === 0 && sellRefs.length === 0;
  const paid = quote ? quote.buy - quote.haggleOff : 0;

  return (
    <>
      {closed && (
        <InlineNotice tone="warn" title="Sklep nieczynny" className="exchange-closed" role="status">
          {MERCHANT_CLOSED_LABELS[closed]} — półkę widać, kupić się nie da.
        </InlineNotice>
      )}
      <div className="exchange-columns exchange-columns--three">
        <div
          className={`trade-column trade-inventory${hoverZone === 'inventory' && drag?.source.from === 'sell' ? ' trade-zone--hover' : ''}`}
          data-exchange-drop="inventory"
        >
          <p className="trade-column-title">Mój ekwipunek — {anchor?.name}</p>
          <ItemGrid
            tiles={inventoryTiles}
            selection={inventorySelection}
            label="Mój ekwipunek"
            hint="Dwuklik albo przeciągnięcie kładzie w polu sprzedaży · Ctrl/Shift+klik — kilka"
            action={{
              label: 'Sprzedaj →',
              title: 'Połóż zaznaczone w polu sprzedaży',
              disabled: busy,
              run: sellItems,
            }}
            drag={grab('inventory')}
            minRows={3}
          />
          <div className="inventory-money">
            <span className="inventory-row-name">Gotówka</span>
            <span className="inventory-row-detail">{formatEd(wallet)}</span>
          </div>
        </div>

        <div className="trade-column">
          <div
            className={`trade-zone trade-zone--mine${hoverZone === 'sell' && drag?.source.from === 'inventory' ? ' trade-zone--hover' : ''}`}
            data-exchange-drop="sell"
          >
            <p className="trade-column-title">Sprzedaję</p>
            <ItemGrid
              tiles={sellTiles}
              selection={sellSelection}
              label="Sprzedaję"
              emptyText={
                view.buyBackPct > 0
                  ? `Handlarz skupuje za ${view.buyBackPct}% ceny katalogowej.`
                  : 'Ten handlarz nic nie skupuje.'
              }
              hint="Dwuklik albo przeciągnięcie z powrotem zdejmuje"
              action={{
                label: '← Nie sprzedawaj',
                title: 'Zdejmij zaznaczone z pola sprzedaży',
                disabled: busy,
                run: unsell,
              }}
              qty={{
                label: (t) => `Ile sztuk sprzedajesz: ${t.name}`,
                value: (t) => String(selling[t.key] ?? ''),
                min: 0,
                show: (t) => t.stackable === true,
                onChange: (t, raw) => {
                  const item = myByKey.get(t.key);
                  if (item) setSellQty(item, raw);
                },
              }}
              drag={grab('sell')}
              minRows={1}
            />
          </div>
          <div
            className={`trade-zone trade-zone--mine${hoverZone === 'basket' && drag?.source.from === 'shelf' ? ' trade-zone--hover' : ''}`}
            data-exchange-drop="basket"
          >
            <p className="trade-column-title">Kupuję</p>
            <ItemGrid
              tiles={basketTiles}
              selection={basketSelection}
              label="Kupuję"
              emptyText="Przeciągnij tu towar z półki."
              hint="Dwuklik albo przeciągnięcie z powrotem odkłada na półkę"
              action={{
                label: 'Odłóż →',
                title: 'Odłóż zaznaczone na półkę',
                disabled: busy,
                run: unbuy,
              }}
              qty={{
                label: (t) => `Ile sztuk kupujesz: ${t.name}`,
                value: (t) => String(basket[t.key] ?? ''),
                min: 0,
                show: (t) => t.stackable === true,
                onChange: (t, raw) => {
                  const row = rowByKey.get(t.key);
                  if (row) setBasketQty(row, raw);
                },
              }}
              drag={grab('basket')}
              minRows={1}
            />
          </div>
        </div>

        <div
          className={`trade-zone${hoverZone === 'shelf' && drag?.source.from === 'basket' ? ' trade-zone--hover' : ''}`}
          data-exchange-drop="shelf"
        >
          <p className="trade-column-title">Towar: {view.name}</p>
          <ItemGrid
            tiles={shelfTiles}
            selection={shelfSelection}
            label={`Towar: ${view.name}`}
            emptyText="Półka jest pusta."
            hint="Dwuklik albo przeciągnięcie wkłada do koszyka · Ctrl/Shift+klik — kilka"
            action={{
              label: '← Do koszyka',
              title: 'Włóż zaznaczone do koszyka',
              disabled: busy,
              run: buyRows,
            }}
            drag={grab('shelf')}
            minRows={3}
          />
          <div className="inventory-money">
            <span className="inventory-row-name">Kasa handlarza</span>
            <span className="inventory-row-detail">
              {view.cash === null ? 'bez dna' : formatEd(view.cash)}
            </span>
          </div>
        </div>
      </div>

      <div className="trade-footer">
        {quote && !empty && (
          <p className="exchange-total" data-testid="exchange-total">
            Płacisz {formatEd(paid)} · dostajesz {formatEd(quote.sell)} · razem{' '}
            {signed(quote.total)} · zostanie {formatEd(wallet - quote.total)}
            {quote.haggleOff > 0 ? ` (targ Fixera: −${formatEd(quote.haggleOff)})` : ''}
          </p>
        )}
        {problemTexts.length > 0 && (
          <InlineNotice tone="warn" title="Nie da się zapłacić" role="status">
            {problemTexts.join(' ')}
          </InlineNotice>
        )}
        <div className="inventory-actions">
          <button
            type="button"
            className="small-button small-button--primary"
            disabled={busy || empty || problems.length > 0 || closed !== undefined || inCombat}
            title={inCombat ? COMBAT_LOCKED_HINT : 'Kupno i sprzedaż w jednej transakcji, od ręki'}
            onClick={() => void pay()}
          >
            Zapłać
          </button>
        </div>
      </div>

      {drag && (
        <div className="trade-drag-ghost" style={{ left: drag.x + 12, top: drag.y + 8 }}>
          {drag.source.keys.length === 1
            ? (myByKey.get(drag.source.keys[0]!)?.name ??
              rowByKey.get(drag.source.keys[0]!)?.name ??
              '')
            : countLabel(drag.source.keys.length)}
        </div>
      )}
    </>
  );
}
