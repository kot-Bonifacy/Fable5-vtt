import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CpredCharacterData,
  CpredItemViewWire,
  InventoryItemRefWire,
  TradeSideIndex,
  TradeSideView,
  TradeView,
} from '@vtt/shared';
import {
  CPRED_ITEM_LIST_LABELS,
  cpredInventoryView,
  cpredOfferViews,
  mayEditTradeOffer,
} from '@vtt/shared';
import {
  acceptTrade,
  cancelTrade,
  giveInventory,
  inventoryErrorText,
  offerTrade,
  respondTrade,
  tradeErrorText,
} from '../../socket.js';
import { useCharacterStore } from '../../stores/characterStore.js';
import { ItemViewIcon } from '../ItemIcons.js';
import { useExchangeDrag } from './drag.js';
import { formatEd, itemDetail, itemKey, refOf } from './items.js';

/**
 * Tryb `trade` okna „Wymiana” (38c, w jednym oknie od 46a) — dwa pola, dwie zgody.
 *
 * Lewa kolumna to mój ekwipunek pomniejszony o to, co już leży w polu; środek —
 * moje pole; prawa — pole drugiej strony z jej zgodą. Pole jest stanem
 * **serwera**: każde przeciągnięcie wysyła całą nową zawartość, a okno rysuje
 * to, co wróciło w `trade:update` (każda zmiana kasuje obie zgody — 23.09).
 *
 * Zanim druga strona przyjmie zaproszenie, zapraszający już kładzie rzeczy
 * w swoje pole, a koledze z drużyny może je posłać „bez czekania” — jako
 * propozycję z 38b, kartą czatu z „Przyjmij” (decyzja MG 6).
 *
 * MG przy handlu dwóch graczy widzi oba pola tylko do odczytu i może handel
 * przerwać — zatwierdzić za gracza nie może.
 */

type DragSource =
  | { from: 'inventory'; item: CpredItemViewWire }
  | { from: 'offer'; item: CpredItemViewWire }
  | { from: 'wallet' };

/**
 * Czy to, co leży w moim polu, nadal zgadza się z kartą. Liczone tą samą
 * funkcją, którą serwer sprawdza ofertę przed wykonaniem — więc ostrzeżenie
 * w oknie i odmowa `OFFER_STALE` mówią o tym samym.
 */
function offerIsStale(data: CpredCharacterData, side: TradeSideView): boolean {
  const check = cpredOfferViews(
    data,
    side.items.map((item) => refOf(item)),
  );
  if (!check.ok) return true;
  return JSON.stringify(check.views) !== JSON.stringify(side.items);
}

export function TradePane({ trade }: { trade: TradeView }) {
  const mineIndex = trade.sides.findIndex((side) => side.mine);
  const mine = mineIndex === -1 ? null : trade.sides[mineIndex]!;
  const other = mineIndex === -1 ? null : trade.sides[mineIndex === 0 ? 1 : 0];
  const card = useCharacterStore((s) =>
    mine?.characterId ? s.characters[mine.characterId] : undefined,
  );
  const data = card?.data as CpredCharacterData | undefined;
  const editable = mine !== null && mayEditTradeOffer(trade, mineIndex as TradeSideIndex);
  const invited = trade.status === 'invited';

  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [money, setMoney] = useState(String(mine?.eddies ?? 0));
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const moneyRef = useRef<HTMLInputElement>(null);

  // Pole gotówki pokazuje to, co naprawdę leży w ofercie, gdy tylko serwer to
  // potwierdzi — także wtedy, gdy zmianę zrobiło inne okno tej samej osoby.
  useEffect(() => setMoney(String(mine?.eddies ?? 0)), [mine?.eddies]);
  useEffect(() => setQtyDraft({}), [trade.version]);

  const offered = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of mine?.items ?? []) map.set(itemKey(item), item.qty);
    return map;
  }, [mine?.items]);

  // Ekwipunek pomniejszony o to, co już leży w polu — ta sama sztuka nie może
  // leżeć w dwóch miejscach naraz.
  const inventory = useMemo(() => {
    if (!data) return [];
    return cpredInventoryView(data)
      .map((item) => ({ ...item, qty: item.qty - (offered.get(itemKey(item)) ?? 0) }))
      .filter((item) => item.qty > 0 && (item.stackable || !offered.has(itemKey(item))));
  }, [data, offered]);

  const wallet = data?.eddies ?? 0;
  const stale = mine && data ? offerIsStale(data, mine) : false;

  async function send(items: InventoryItemRefWire[], eddies: number) {
    setBusy(true);
    const ack = await offerTrade({ tradeId: trade.id, items, eddies });
    setBusy(false);
    setMessage(ack.ok ? null : tradeErrorText(ack.error));
  }

  function currentRefs(): InventoryItemRefWire[] {
    return (mine?.items ?? []).map((item) => refOf(item));
  }

  function addToOffer(item: CpredItemViewWire) {
    if (!mine || !editable) return;
    const refs = currentRefs();
    const index = refs.findIndex((ref) => ref.list === item.list && ref.rowId === item.rowId);
    if (index === -1) refs.push(refOf(item));
    else if (item.stackable) refs[index] = refOf(item, (refs[index]!.qty ?? 0) + item.qty);
    void send(refs, mine.eddies);
  }

  function removeFromOffer(item: CpredItemViewWire) {
    if (!mine) return;
    void send(
      currentRefs().filter((ref) => !(ref.list === item.list && ref.rowId === item.rowId)),
      mine.eddies,
    );
  }

  function commitQty(item: CpredItemViewWire) {
    if (!mine) return;
    const raw = Number.parseInt(qtyDraft[itemKey(item)] ?? '', 10);
    if (!Number.isInteger(raw) || raw === item.qty) return;
    const onCard = (data ? cpredInventoryView(data) : []).find(
      (row) => itemKey(row) === itemKey(item),
    );
    const want = Math.min(Math.max(raw, 0), onCard?.qty ?? item.qty);
    if (want === 0) {
      removeFromOffer(item);
      return;
    }
    void send(
      currentRefs().map((ref) =>
        ref.list === item.list && ref.rowId === item.rowId ? { ...ref, qty: want } : ref,
      ),
      mine.eddies,
    );
  }

  function commitMoney() {
    if (!mine) return;
    const raw = Number.parseInt(money, 10);
    const want = Number.isInteger(raw) ? Math.min(Math.max(raw, 0), wallet) : 0;
    setMoney(String(want));
    if (want !== mine.eddies) void send(currentRefs(), want);
  }

  async function toggleAccept() {
    if (!mine) return;
    setBusy(true);
    const ack = await acceptTrade({
      tradeId: trade.id,
      version: trade.version,
      accepted: !mine.accepted,
    });
    setBusy(false);
    setMessage(ack.ok ? null : tradeErrorText(ack.error));
  }

  async function stop() {
    const ack = await cancelTrade(trade.id);
    if (!ack.ok) setMessage(tradeErrorText(ack.error));
  }

  async function answer(accept: boolean) {
    const ack = await respondTrade(trade.id, accept);
    if (!ack.ok) setMessage(tradeErrorText(ack.error));
  }

  /**
   * „Wyślij bez czekania” (decyzja MG 6): pole zapraszającego jedzie do kolegi
   * jako propozycja z 38b, a zaproszenie znika — nikt nie czeka na drugą
   * stronę, która może dziś w ogóle nie przyjść.
   */
  async function sendNow() {
    if (!mine?.characterId || !other?.characterId) return;
    setBusy(true);
    const ack = await giveInventory({
      fromCharacterId: mine.characterId,
      toCharacterId: other.characterId,
      items: currentRefs(),
      ...(mine.eddies > 0 ? { eddies: mine.eddies } : {}),
    });
    if (!ack.ok) {
      setBusy(false);
      setMessage(inventoryErrorText(ack.error));
      return;
    }
    await cancelTrade(trade.id);
    setBusy(false);
  }

  const { drag, hoverZone, handlers } = useExchangeDrag<DragSource>((source, zone) => {
    if (zone === 'offer' && source.from === 'inventory') addToOffer(source.item);
    else if (zone === 'offer' && source.from === 'wallet') {
      moneyRef.current?.focus();
      moneyRef.current?.select();
    } else if (zone === 'inventory' && source.from === 'offer') removeFromOffer(source.item);
  }, busy || !editable);

  const spectator = mine === null;
  const emptyOffer = (mine?.items.length ?? 0) === 0 && (mine?.eddies ?? 0) === 0;

  return (
    <>
      <div
        className={`exchange-columns${spectator ? ' exchange-columns--two' : ' exchange-columns--three'}`}
      >
        {!spectator && (
          <div
            className={`trade-column trade-inventory${hoverZone === 'inventory' && drag?.source.from === 'offer' ? ' trade-zone--hover' : ''}`}
            data-exchange-drop="inventory"
          >
            <p className="trade-column-title">Mój ekwipunek — {mine?.name}</p>
            {inventory.length === 0 && (
              <p className="inventory-empty">Nie zostało nic, co dałoby się położyć w polu.</p>
            )}
            <ul className="inventory-list">
              {inventory.map((item) => (
                <li
                  key={itemKey(item)}
                  className="inventory-row trade-draggable"
                  title={`${CPRED_ITEM_LIST_LABELS[item.list]} — przeciągnij do pola wymiany`}
                  {...handlers({ from: 'inventory', item })}
                >
                  <span className="trade-grip" aria-hidden="true">
                    ⠿
                  </span>
                  <ItemViewIcon item={item} />
                  <span className="inventory-row-name">{item.name}</span>
                  <span className="inventory-row-detail">{itemDetail(item)}</span>
                  <button
                    type="button"
                    className="small-button"
                    disabled={busy || !editable}
                    title="Połóż w polu wymiany"
                    aria-label={`Połóż w polu wymiany: ${item.name}`}
                    onClick={() => addToOffer(item)}
                  >
                    →
                  </button>
                </li>
              ))}
            </ul>
            {wallet > 0 && (
              <div
                className="inventory-money trade-draggable"
                title="Przeciągnij portfel do pola wymiany, żeby wpisać kwotę"
                {...handlers({ from: 'wallet' })}
              >
                <span className="trade-grip" aria-hidden="true">
                  ⠿
                </span>
                <span className="inventory-row-name">Portfel</span>
                <span className="inventory-row-detail">{formatEd(wallet)}</span>
              </div>
            )}
          </div>
        )}

        {trade.sides.map((side, index) =>
          side.mine ? (
            <OfferZone
              key={index}
              side={side}
              editable={editable}
              hover={hoverZone === 'offer' && drag !== null && drag.source.from !== 'offer'}
              stale={stale}
              invited={invited}
            >
              {side.items.map((item) => (
                <li
                  key={itemKey(item)}
                  className="inventory-row trade-draggable"
                  title="Przeciągnij z powrotem do ekwipunku, żeby zdjąć z pola"
                  {...handlers({ from: 'offer', item })}
                >
                  <span className="trade-grip" aria-hidden="true">
                    ⠿
                  </span>
                  <ItemViewIcon item={item} />
                  <span className="inventory-row-name">{item.name}</span>
                  {item.stackable ? (
                    <input
                      type="number"
                      className="inventory-row-qty"
                      min={0}
                      aria-label={`Ile sztuk w polu: ${item.name}`}
                      value={qtyDraft[itemKey(item)] ?? String(item.qty)}
                      disabled={busy || !editable}
                      onChange={(e) =>
                        setQtyDraft((current) => ({ ...current, [itemKey(item)]: e.target.value }))
                      }
                      onBlur={() => commitQty(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitQty(item);
                      }}
                    />
                  ) : (
                    <span className="inventory-row-detail">{item.detail}</span>
                  )}
                  <button
                    type="button"
                    className="small-button"
                    disabled={busy || !editable}
                    title="Zdejmij z pola wymiany"
                    aria-label={`Zdejmij z pola wymiany: ${item.name}`}
                    onClick={() => removeFromOffer(item)}
                  >
                    ←
                  </button>
                </li>
              ))}
              <li className="inventory-money trade-money">
                <span className="inventory-row-name">Gotówka</span>
                <input
                  ref={moneyRef}
                  type="number"
                  className="inventory-row-qty"
                  min={0}
                  max={wallet}
                  aria-label="Ile eurodolców w polu wymiany"
                  value={money}
                  disabled={busy || !editable}
                  onChange={(e) => setMoney(e.target.value)}
                  onBlur={commitMoney}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitMoney();
                  }}
                />
                <span className="inventory-row-detail">z {formatEd(wallet)}</span>
              </li>
            </OfferZone>
          ) : (
            <OfferZone
              key={index}
              side={side}
              editable={false}
              hover={false}
              stale={false}
              invited={invited}
            >
              {side.items.map((item) => (
                <li key={itemKey(item)} className="inventory-row">
                  <ItemViewIcon item={item} />
                  <span className="inventory-row-name">{item.name}</span>
                  <span className="inventory-row-detail">{itemDetail(item)}</span>
                </li>
              ))}
              {side.eddies > 0 && (
                <li className="inventory-money">
                  <span className="inventory-row-name">Gotówka</span>
                  <span className="inventory-row-detail">{formatEd(side.eddies)}</span>
                </li>
              )}
            </OfferZone>
          ),
        )}
      </div>

      <div className="trade-footer">
        {trade.notice && <p className="trade-notice">{tradeErrorText(trade.notice)}</p>}
        {message && <p className="inventory-message">{message}</p>}
        {spectator ? (
          <p className="inventory-hint">
            Podgląd MG — zgodę dają wyłącznie strony handlu. Możesz handel przerwać.
          </p>
        ) : invited && mineIndex === 0 ? (
          <p className="inventory-hint">
            Czekasz, aż {other?.name} przyjmie zaproszenie — możesz już kłaść rzeczy w swoje pole.
            {other?.characterId
              ? ' Koledze z drużyny wyślesz je też bez czekania, jako propozycję do przyjęcia.'
              : ''}
          </p>
        ) : invited ? (
          <p className="inventory-hint">{other?.name} zaprasza cię do handlu.</p>
        ) : (
          <p className="inventory-hint">
            Przeciągnij rzeczy do swojego pola. Każda zmiana w którymkolwiek polu zdejmuje obie
            zgody; wymiana dzieje się, gdy zgodzicie się oboje.
          </p>
        )}
        <div className="inventory-actions">
          {mine && !invited && (
            <button
              type="button"
              className={`small-button${mine.accepted ? '' : ' small-button--primary'}`}
              disabled={busy || (!mine.accepted && stale)}
              title={
                mine.accepted
                  ? 'Cofnij zgodę'
                  : 'Zgadzam się na to, co leży w OBU polach w tej chwili'
              }
              onClick={() => void toggleAccept()}
            >
              {mine.accepted ? 'Cofnij zgodę' : 'Zgadzam się'}
            </button>
          )}
          {mine && invited && mineIndex === 0 && other?.characterId && (
            <button
              type="button"
              className="small-button small-button--primary"
              disabled={busy || emptyOffer || stale}
              title="Wyślij to, co leży w twoim polu, jako propozycję — kolega przyjmie ją z czatu"
              onClick={() => void sendNow()}
            >
              Wyślij bez czekania
            </button>
          )}
          {mine && invited && mineIndex === 1 && (
            <>
              <button
                type="button"
                className="small-button small-button--primary"
                onClick={() => void answer(true)}
              >
                Przyjmij
              </button>
              <button type="button" className="small-button" onClick={() => void answer(false)}>
                Odrzuć
              </button>
            </>
          )}
          {!(mine && invited && mineIndex === 1) && (
            <button
              type="button"
              className="small-button"
              disabled={busy}
              title="Przerwij — nic nie zmieni się na żadnej karcie"
              onClick={() => void stop()}
            >
              {invited && mineIndex === 0 ? 'Wycofaj zaproszenie' : 'Przerwij handel'}
            </button>
          )}
        </div>
      </div>

      {drag && (
        <div className="trade-drag-ghost" style={{ left: drag.x + 12, top: drag.y + 8 }}>
          {drag.source.from === 'wallet' ? 'Portfel' : drag.source.item.name}
        </div>
      )}
    </>
  );
}

function OfferZone({
  side,
  editable,
  hover,
  stale,
  invited,
  children,
}: {
  side: TradeSideView;
  editable: boolean;
  hover: boolean;
  stale: boolean;
  invited: boolean;
  children: React.ReactNode;
}) {
  const empty = side.items.length === 0 && (side.mine || side.eddies === 0);
  return (
    <div
      className={`trade-zone${side.mine ? ' trade-zone--mine' : ''}${hover ? ' trade-zone--hover' : ''}${side.accepted ? ' trade-zone--accepted' : ''}`}
      {...(editable ? { 'data-exchange-drop': 'offer' } : {})}
    >
      <p className="trade-column-title">
        {side.mine ? 'Moje pole wymiany' : `Pole wymiany: ${side.name}`}
        {!invited && (
          <span className={`trade-consent${side.accepted ? ' trade-consent--yes' : ''}`}>
            {side.accepted ? '✔ zgoda' : 'bez zgody'}
          </span>
        )}
      </p>
      {stale && (
        <p className="trade-notice">
          Coś z tego pola zmieniło się na karcie — popraw ofertę, zanim się zgodzisz.
        </p>
      )}
      {invited && !side.mine && <p className="inventory-empty">Czeka na {side.name}…</p>}
      {empty && !side.mine && !invited && <p className="inventory-empty">Na razie pusto.</p>}
      {empty && editable && <p className="inventory-empty">Upuść tu przedmiot z ekwipunku.</p>}
      <ul className="inventory-list">{children}</ul>
    </div>
  );
}
