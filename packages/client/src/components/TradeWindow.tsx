import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type {
  CpredCharacterData,
  CpredItemViewWire,
  InventoryItemRefWire,
  TradePartnerView,
  TradeSideView,
  TradeView,
} from '@vtt/shared';
import {
  CPRED_ITEM_LIST_LABELS,
  cpredInventoryView,
  cpredOfferViews,
  isTradeActive,
} from '@vtt/shared';
import {
  acceptTrade,
  cancelTrade,
  fetchTradePartners,
  inviteTrade,
  offerTrade,
  tradeErrorText,
} from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useTradeStore } from '../stores/tradeStore.js';
import { useWindowPlacement } from '../window-placement.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';

/**
 * Okno handlu (etap 38c) — dwa pola wymiany, dwie zgody.
 *
 * Lewa kolumna to własny ekwipunek (z `characterStore`, jak w oknie „Wymiana"
 * z 38b), prawa — dwa pola wymiany: moje i drugiej strony. Przedmiot kładzie
 * się w polu **przeciągnięciem** albo strzałką przy wierszu (klawiatura,
 * czytnik ekranu). Przeciąganie jest na zdarzeniach wskaźnika, nie na HTML5
 * drag-and-drop — to drugie nie działa na dotyku, a stół gra też na iPadzie.
 *
 * Pole wymiany jest stanem **serwera**: każde przeciągnięcie wysyła całą nową
 * zawartość pola, a okno rysuje to, co wróciło w `trade:update`. Dzięki temu
 * obie strony widzą zawsze to samo i żadna zgoda nie dotyczy czegoś, czego
 * druga strona nie zobaczyła (rozstrzygnięcie MG z 23.09: każda zmiana kasuje
 * obie zgody).
 *
 * MG przy handlu dwóch graczy widzi oba pola tylko do odczytu i może handel
 * przerwać — zatwierdzić za gracza nie może.
 */

/** Skąd ciągnie się rzecz: z ekwipunku do pola albo z pola z powrotem. */
type DragSource =
  | { from: 'inventory'; item: CpredItemViewWire }
  | { from: 'offer'; item: CpredItemViewWire }
  | { from: 'wallet' };

type DropZone = 'offer' | 'inventory';

/** Ile pikseli wskaźnik musi przejechać, żeby naciśnięcie było przeciąganiem, a nie kliknięciem. */
const DRAG_THRESHOLD_PX = 5;

export function TradeWindow() {
  const openId = useTradeStore((s) => s.openId);
  const trade = useTradeStore((s) => (s.openId ? s.trades[s.openId] : undefined));
  if (!openId || !trade || trade.status !== 'open') return null;
  return <OpenTrade key={trade.id} trade={trade} />;
}

function refOf(item: CpredItemViewWire, qty = item.qty): InventoryItemRefWire {
  return item.stackable
    ? { list: item.list, rowId: item.rowId, qty }
    : { list: item.list, rowId: item.rowId };
}

function itemKey(item: Pick<CpredItemViewWire, 'list' | 'rowId'>): string {
  return `${item.list}:${item.rowId}`;
}

function itemDetail(item: CpredItemViewWire): string {
  if (item.stackable) return item.qty > 1 ? `× ${item.qty}` : '';
  return item.detail;
}

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

function OpenTrade({ trade }: { trade: TradeView }) {
  const close = () => useTradeStore.getState().open(null);
  const mineIndex = trade.sides.findIndex((side) => side.mine);
  const mine = mineIndex === -1 ? null : trade.sides[mineIndex]!;
  const card = useCharacterStore((s) =>
    mine?.characterId ? s.characters[mine.characterId] : undefined,
  );
  const data = card?.data as CpredCharacterData | undefined;

  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [money, setMoney] = useState(String(mine?.eddies ?? 0));
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const moneyRef = useRef<HTMLInputElement>(null);

  // Pole gotówki pokazuje to, co naprawdę leży w ofercie, gdy tylko serwer to
  // potwierdzi — także wtedy, gdy zmianę zrobiło inne okno tej samej osoby.
  useEffect(() => setMoney(String(mine?.eddies ?? 0)), [mine?.eddies]);
  useEffect(() => setQtyDraft({}), [trade.version]);

  const placement = useWindowPlacement('trade', () => ({ x: 240, y: 110 }));

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
    if (!mine) return;
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

  /* ----- Przeciąganie na zdarzeniach wskaźnika ----- */

  const [drag, setDrag] = useState<{ source: DragSource; x: number; y: number } | null>(null);
  const [hoverZone, setHoverZone] = useState<DropZone | null>(null);
  // Stan przeciągania w `ref`, nie w stanie Reacta: szybki ruch potrafi dać
  // jeden `pointermove` i od razu `pointerup`, zanim React przerysuje okno —
  // puszczenie sprawdzane stanem wyglądałoby wtedy jak zwykłe kliknięcie
  // i rzecz nie lądowała w polu (złapane przy oględzinach 23.09).
  const pending = useRef<{
    source: DragSource;
    x: number;
    y: number;
    id: number;
    moving: boolean;
  } | null>(null);

  function zoneAt(x: number, y: number): DropZone | null {
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-trade-drop]');
    const zone = hit?.dataset.tradeDrop;
    return zone === 'offer' || zone === 'inventory' ? zone : null;
  }

  function isFar(start: { x: number; y: number }, event: ReactPointerEvent<HTMLElement>) {
    return Math.hypot(event.clientX - start.x, event.clientY - start.y) >= DRAG_THRESHOLD_PX;
  }

  function startDrag(event: ReactPointerEvent<HTMLElement>, source: DragSource) {
    if (event.button !== 0 || !mine || busy) return;
    // Kontrolki w wierszu (strzałka, pole ilości) klika się normalnie.
    if ((event.target as HTMLElement).closest('button, input')) return;
    pending.current = {
      source,
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
      moving: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    const start = pending.current;
    if (!start || start.id !== event.pointerId) return;
    if (!start.moving && !isFar(start, event)) return;
    start.moving = true;
    setDrag({ source: start.source, x: event.clientX, y: event.clientY });
    setHoverZone(zoneAt(event.clientX, event.clientY));
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    const start = pending.current;
    pending.current = null;
    setDrag(null);
    setHoverZone(null);
    if (!start || start.id !== event.pointerId) return;
    if (!start.moving && !isFar(start, event)) return;
    const zone = zoneAt(event.clientX, event.clientY);
    const source = start.source;
    if (zone === 'offer' && source.from === 'inventory') addToOffer(source.item);
    else if (zone === 'offer' && source.from === 'wallet') {
      moneyRef.current?.focus();
      moneyRef.current?.select();
    } else if (zone === 'inventory' && source.from === 'offer') removeFromOffer(source.item);
  }

  const dragHandlers = (source: DragSource) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => startDrag(event, source),
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: () => {
      pending.current = null;
      setDrag(null);
      setHoverZone(null);
    },
  });

  const title = `${trade.sides[0].name} ⇄ ${trade.sides[1].name}`;
  const spectator = mine === null;

  return (
    <section
      ref={placement.ref}
      className="inventory-window trade-window"
      style={placement.style}
      aria-label={`Handel: ${title}`}
      data-owns-keys
    >
      <div className="inventory-window-header" {...placement.dragProps}>
        <span className="inventory-window-title">Handel: {title}</span>
        <button
          type="button"
          className="sheet-close"
          onClick={close}
          title="Zwiń okno — handel trwa dalej i czeka w rogu mapy"
          aria-label="Zwiń okno handlu"
        >
          ✕
        </button>
      </div>

      <div
        className={`inventory-window-body trade-body${spectator ? ' trade-body--spectator' : ''}`}
      >
        {!spectator && (
          <div
            className={`trade-column trade-inventory${hoverZone === 'inventory' && drag?.source.from === 'offer' ? ' trade-zone--hover' : ''}`}
            data-trade-drop="inventory"
          >
            <p className="trade-column-title">Twój ekwipunek — {mine?.name}</p>
            {inventory.length === 0 && (
              <p className="inventory-empty">Nie zostało nic, co dałoby się położyć w polu.</p>
            )}
            <ul className="inventory-list">
              {inventory.map((item) => (
                <li
                  key={itemKey(item)}
                  className="inventory-row trade-draggable"
                  title={`${CPRED_ITEM_LIST_LABELS[item.list]} — przeciągnij do pola wymiany`}
                  {...dragHandlers({ from: 'inventory', item })}
                >
                  <span className="trade-grip" aria-hidden="true">
                    ⠿
                  </span>
                  <span className="inventory-row-name">{item.name}</span>
                  <span className="inventory-row-detail">{itemDetail(item)}</span>
                  <button
                    type="button"
                    className="small-button"
                    disabled={busy}
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
                {...dragHandlers({ from: 'wallet' })}
              >
                <span className="trade-grip" aria-hidden="true">
                  ⠿
                </span>
                <span className="inventory-row-name">Portfel</span>
                <span className="inventory-row-detail">{wallet} ed</span>
              </div>
            )}
          </div>
        )}

        <div className="trade-column trade-offers">
          {trade.sides.map((side, index) =>
            side.mine ? (
              <OfferZone
                key={index}
                side={side}
                editable
                hover={hoverZone === 'offer' && drag !== null && drag.source.from !== 'offer'}
                stale={stale}
              >
                {side.items.map((item) => (
                  <li
                    key={itemKey(item)}
                    className="inventory-row trade-draggable"
                    title="Przeciągnij z powrotem do ekwipunku, żeby zdjąć z pola"
                    {...dragHandlers({ from: 'offer', item })}
                  >
                    <span className="trade-grip" aria-hidden="true">
                      ⠿
                    </span>
                    <span className="inventory-row-name">{item.name}</span>
                    {item.stackable ? (
                      <input
                        type="number"
                        className="inventory-row-qty"
                        min={0}
                        aria-label={`Ile sztuk w polu: ${item.name}`}
                        value={qtyDraft[itemKey(item)] ?? String(item.qty)}
                        disabled={busy}
                        onChange={(e) =>
                          setQtyDraft((current) => ({
                            ...current,
                            [itemKey(item)]: e.target.value,
                          }))
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
                      disabled={busy}
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
                    disabled={busy}
                    onChange={(e) => setMoney(e.target.value)}
                    onBlur={commitMoney}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitMoney();
                    }}
                  />
                  <span className="inventory-row-detail">z {wallet} ed</span>
                </li>
              </OfferZone>
            ) : (
              <OfferZone key={index} side={side} editable={false} hover={false} stale={false}>
                {side.items.map((item) => (
                  <li key={itemKey(item)} className="inventory-row">
                    <span className="inventory-row-name">{item.name}</span>
                    <span className="inventory-row-detail">{itemDetail(item)}</span>
                  </li>
                ))}
                {side.eddies > 0 && (
                  <li className="inventory-money">
                    <span className="inventory-row-name">Gotówka</span>
                    <span className="inventory-row-detail">{side.eddies} ed</span>
                  </li>
                )}
              </OfferZone>
            ),
          )}
        </div>
      </div>

      <div className="trade-footer">
        {trade.notice && <p className="trade-notice">{tradeErrorText(trade.notice)}</p>}
        {message && <p className="inventory-message">{message}</p>}
        {spectator ? (
          <p className="inventory-hint">
            Podgląd MG — zgodę dają wyłącznie strony handlu. Możesz handel przerwać.
          </p>
        ) : (
          <p className="inventory-hint">
            Przeciągnij rzeczy do swojego pola. Każda zmiana w którymkolwiek polu zdejmuje obie
            zgody; wymiana dzieje się, gdy zgodzicie się oboje.
          </p>
        )}
        <div className="inventory-actions">
          {mine && (
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
          <button
            type="button"
            className="small-button"
            disabled={busy}
            title="Przerwij handel — nic nie zmieni się na żadnej karcie"
            onClick={() => void stop()}
          >
            Przerwij handel
          </button>
        </div>
      </div>

      {drag && (
        <div className="trade-drag-ghost" style={{ left: drag.x + 12, top: drag.y + 8 }}>
          {drag.source.from === 'wallet' ? 'Portfel' : drag.source.item.name}
        </div>
      )}
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}

function OfferZone({
  side,
  editable,
  hover,
  stale,
  children,
}: {
  side: TradeSideView;
  editable: boolean;
  hover: boolean;
  stale: boolean;
  children: React.ReactNode;
}) {
  const empty = side.items.length === 0 && (editable || side.eddies === 0);
  return (
    <div
      className={`trade-zone${editable ? ' trade-zone--mine' : ''}${hover ? ' trade-zone--hover' : ''}${side.accepted ? ' trade-zone--accepted' : ''}`}
      {...(editable ? { 'data-trade-drop': 'offer' } : {})}
    >
      <p className="trade-column-title">
        {editable ? 'Twoje pole wymiany' : `Pole wymiany: ${side.name}`}
        <span className={`trade-consent${side.accepted ? ' trade-consent--yes' : ''}`}>
          {side.accepted ? '✔ zgoda' : 'bez zgody'}
        </span>
      </p>
      {stale && (
        <p className="trade-notice">
          Coś z tego pola zmieniło się na karcie — popraw ofertę, zanim się zgodzisz.
        </p>
      )}
      {empty && !editable && <p className="inventory-empty">Na razie pusto.</p>}
      {empty && editable && <p className="inventory-empty">Upuść tu przedmiot z ekwipunku.</p>}
      <ul className="inventory-list">{children}</ul>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Wybór partnera — „Handel…" z karty postaci i z menu figury MG
 * ------------------------------------------------------------------ */

export function TradePartnerPicker() {
  const characterId = useTradeStore((s) => s.pickerFor);
  if (!characterId) return null;
  return <PartnerPicker key={characterId} characterId={characterId} />;
}

function PartnerPicker({ characterId }: { characterId: string }) {
  const close = () => useTradeStore.getState().openPicker(null);
  const card = useCharacterStore((s) => s.characters[characterId]);
  const [partners, setPartners] = useState<TradePartnerView[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const placement = useWindowPlacement('trade-picker', () => ({ x: 260, y: 140 }));

  useEffect(() => {
    let alive = true;
    void fetchTradePartners(characterId).then((ack) => {
      if (!alive) return;
      if (!ack.ok) setMessage(tradeErrorText(ack.error));
      else setPartners(ack.data?.partners ?? []);
    });
    return () => {
      alive = false;
    };
  }, [characterId]);

  async function invite(partner: TradePartnerView) {
    setBusy(true);
    const ack = await inviteTrade({
      fromCharacterId: characterId,
      ...(partner.tokenId
        ? { toTokenId: partner.tokenId }
        : { toCharacterId: partner.characterId }),
    });
    setBusy(false);
    if (!ack.ok) {
      setMessage(tradeErrorText(ack.error));
      return;
    }
    close();
  }

  return (
    <section
      ref={placement.ref}
      className="inventory-window trade-picker"
      style={placement.style}
      aria-label="Z kim handlować"
    >
      <div className="inventory-window-header" {...placement.dragProps}>
        <span className="inventory-window-title">Handel: {card?.name ?? ''}</span>
        <button
          type="button"
          className="sheet-close"
          onClick={close}
          title="Zamknij"
          aria-label="Zamknij wybór partnera handlu"
        >
          ✕
        </button>
      </div>
      <div className="inventory-window-body">
        <p className="inventory-hint">
          Z kim handlować? Handluje się na wyciągnięcie ręki; karty graczy poza wspólną sceną są
          zawsze na liście.
        </p>
        {partners === null && !message && <p className="inventory-hint">Szukam…</p>}
        {partners?.length === 0 && (
          <p className="inventory-empty">Nikogo w zasięgu ręki, z kim dałoby się handlować.</p>
        )}
        <ul className="inventory-list">
          {partners?.map((partner) => (
            <li key={partner.tokenId ?? partner.characterId} className="inventory-row">
              <span className="inventory-row-name">{partner.name}</span>
              <span className="inventory-row-detail">
                {partner.metres === undefined ? 'poza sceną' : `${partner.metres} m`}
              </span>
              <button
                type="button"
                className="small-button"
                disabled={busy}
                title="Wyślij zaproszenie do handlu"
                onClick={() => void invite(partner)}
              >
                Zaproś
              </button>
            </li>
          ))}
        </ul>
        {message && <p className="inventory-message">{message}</p>}
      </div>
    </section>
  );
}

/** Czy ta karta ma teraz otwarty handel — przycisk „Handel…" otwiera wtedy jego okno. */
export function activeTradeFor(characterId: string): TradeView | undefined {
  return Object.values(useTradeStore.getState().trades).find(
    (trade) => isTradeActive(trade) && trade.sides.some((side) => side.characterId === characterId),
  );
}
