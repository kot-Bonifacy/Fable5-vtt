import { useEffect, useMemo, useState } from 'react';
import type {
  CpredItemViewWire,
  InventoryItemRefWire,
  InventorySourceView,
  SocketAck,
} from '@vtt/shared';
import { CPRED_ITEM_LIST_LABELS, INVENTORY_NOTE_MAX, cpredInventoryView } from '@vtt/shared';
import {
  fetchInventorySources,
  giveInventory,
  inventoryErrorText,
  takeInventory,
} from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useInventoryStore } from '../stores/inventoryStore.js';
import { useWindowPlacement } from '../window-placement.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';

/**
 * Okno „Wymiana" (etap 38b) — jedno miejsce na przekazanie, łup i przeszukanie.
 *
 * Dwa wejścia, jeden komponent: guzik z zakładki „Ekwipunek" karty postaci
 * i „Przeszukaj" w menu figury u MG. Różni je wyłącznie to, czyja karta stoi
 * po lewej — reszta jest identyczna, bo z punktu widzenia obu kart „oddaję ci
 * stimpak" i „zdejmuję pistolet z ciała" to ta sama czynność.
 *
 * Co okno **wie**, a czego nie: lewa kolumna własnej karty rysuje się z tego,
 * co klient już ma (`characterStore`), a ekwipunek cudzej figury przychodzi
 * z serwera razem z prawem do niego. Klient nie zna `characterId` cudzego
 * żetonu i nie ma go poznać — to część prywatna żetonu od etapu 05.
 */

/** Skąd bierzemy: własna karta albo figura obok. */
type SourceKey = string;

const ANCHOR = '@anchor';

export function InventoryWindow() {
  const anchorId = useInventoryStore((s) => s.anchorId);
  if (!anchorId) return null;
  return <ExchangeWindow anchorId={anchorId} />;
}

function ExchangeWindow({ anchorId }: { anchorId: string }) {
  const anchorTokenId = useInventoryStore((s) => s.anchorTokenId);
  const close = useInventoryStore((s) => s.close);
  const anchor = useCharacterStore((s) => s.characters[anchorId]);

  const [sources, setSources] = useState<InventorySourceView[]>([]);
  const [targets, setTargets] = useState<{ id: string; name: string }[]>([]);
  const [sourceKey, setSourceKey] = useState<SourceKey>(ANCHOR);
  const [targetId, setTargetId] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [money, setMoney] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Odświeżenie po każdym zapisie karty: `updatedAt` jest stemplem serwera, więc
  // zmienia się dokładnie wtedy, gdy ekwipunek naprawdę pojechał — a nie przy
  // optymistycznej łacie, która wyprzedza odpowiedź (pułapka z 23b).
  const savedAt = anchor?.updatedAt;
  useEffect(() => {
    let alive = true;
    void fetchInventorySources({
      characterId: anchorId,
      ...(anchorTokenId ? { tokenId: anchorTokenId } : {}),
    }).then((ack) => {
      if (!alive) return;
      if (!ack.ok) {
        setMessage(inventoryErrorText(ack.error));
        return;
      }
      if (!ack.data) return;
      setSources(ack.data.sources);
      setTargets(ack.data.targets);
    });
    return () => {
      alive = false;
    };
  }, [anchorId, anchorTokenId, savedAt]);

  const placement = useWindowPlacement('inventory', () => ({ x: 200, y: 120 }));

  const source = sourceKey === ANCHOR ? null : sources.find((row) => row.tokenId === sourceKey);
  const items: CpredItemViewWire[] = useMemo(() => {
    if (source) return source.items;
    return anchor ? cpredInventoryView(anchor.data) : [];
  }, [source, anchor]);
  const purse = source ? source.eddies : (anchor?.data.eddies ?? 0);

  // Łup ląduje na karcie, dla której otwarto okno; oddaje się komuś wskazanemu.
  const effectiveTarget = source ? targetId || anchorId : targetId;
  const targetName = source
    ? (targets.find((row) => row.id === targetId)?.name ?? anchor?.name ?? '')
    : (targets.find((row) => row.id === targetId)?.name ?? '');

  async function move(refs: InventoryItemRefWire[], eddies: number) {
    if (!effectiveTarget) {
      setMessage('Wskaż, komu to ma trafić.');
      return;
    }
    setBusy(true);
    const ack: SocketAck<{ messageId: number; pending?: boolean }> = source
      ? await takeInventory({
          fromTokenId: source.tokenId!,
          toCharacterId: effectiveTarget,
          items: refs,
          ...(eddies > 0 ? { eddies } : {}),
        })
      : await giveInventory({
          fromCharacterId: anchorId,
          toCharacterId: effectiveTarget,
          items: refs,
          ...(eddies > 0 ? { eddies } : {}),
          ...(note.trim() ? { note: note.trim().slice(0, INVENTORY_NOTE_MAX) } : {}),
        });
    setBusy(false);
    if (!ack.ok) {
      setMessage(inventoryErrorText(ack.error));
      return;
    }
    setMoney('');
    setQty({});
    // O tym, czy cokolwiek czeka, mówi serwer: kartę bez właściciela nie ma
    // kto przyjąć, więc przeniesienie już się wykonało.
    const pending = !source && ack.data?.pending === true;
    setMessage(
      source
        ? `Zabrane na kartę: ${targetName || 'twoja karta'}.`
        : pending
          ? `Wysłane do: ${targetName} — czeka na przyjęcie.`
          : `Przekazane: ${targetName}.`,
    );
    // Odpowiedź serwera zmieni karty rozgłoszeniem; listę źródeł odświeżamy tu,
    // bo cudza figura nie jedzie do nas przez `character:upsert`.
    const refreshed = await fetchInventorySources({
      characterId: anchorId,
      ...(anchorTokenId ? { tokenId: anchorTokenId } : {}),
    });
    if (refreshed.ok && refreshed.data) {
      setSources(refreshed.data.sources);
      setTargets(refreshed.data.targets);
    }
  }

  function refFor(item: CpredItemViewWire): InventoryItemRefWire {
    const raw = Number.parseInt(qty[item.rowId] ?? '', 10);
    const want = Number.isInteger(raw) ? Math.min(Math.max(raw, 1), item.qty) : item.qty;
    return item.stackable
      ? { list: item.list, rowId: item.rowId, qty: want }
      : { list: item.list, rowId: item.rowId };
  }

  if (!anchor) return null;

  return (
    <section
      ref={placement.ref}
      className="inventory-window"
      style={placement.style}
      aria-label="Wymiana przedmiotów"
    >
      <div className="inventory-window-header" {...placement.dragProps}>
        <span className="inventory-window-title">Wymiana</span>
        <button
          type="button"
          className="sheet-close"
          onClick={close}
          title="Zamknij okno wymiany"
          aria-label="Zamknij okno wymiany"
        >
          ✕
        </button>
      </div>

      <div className="inventory-window-body">
        <div className="inventory-ends">
          <label className="inventory-end">
            Skąd
            <select
              value={sourceKey}
              onChange={(e) => {
                setSourceKey(e.target.value);
                setMessage(null);
              }}
            >
              <option value={ANCHOR}>{anchor.name}</option>
              {sources.map((row) => (
                <option key={row.tokenId} value={row.tokenId}>
                  {row.name}
                  {row.metres === undefined ? '' : ` — ${row.metres} m`}
                </option>
              ))}
            </select>
          </label>
          <span className="inventory-arrow" aria-hidden="true">
            →
          </span>
          <label className="inventory-end">
            Dokąd
            <select
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                setMessage(null);
              }}
            >
              <option value="">{source ? `${anchor.name} (twoja karta)` : '— wybierz —'}</option>
              {targets.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {sources.length === 0 && (
          <p className="inventory-hint">
            W zasięgu ręki nie ma nikogo, kogo dałoby się przeszukać. Przeszukać można figurę, która
            leży albo nie żyje i nie ma właściciela.
          </p>
        )}

        {items.length === 0 ? (
          <p className="inventory-empty">Ta karta nie ma nic w ekwipunku.</p>
        ) : (
          <ul className="inventory-list">
            {items.map((item) => (
              <li key={`${item.list}:${item.rowId}`} className="inventory-row">
                <span className="inventory-row-name" title={CPRED_ITEM_LIST_LABELS[item.list]}>
                  {item.name}
                </span>
                <span className="inventory-row-detail">
                  {item.stackable && item.qty > 1 ? `× ${item.qty}` : item.detail}
                </span>
                {item.stackable && item.qty > 1 && (
                  <input
                    type="number"
                    className="inventory-row-qty"
                    min={1}
                    max={item.qty}
                    placeholder={String(item.qty)}
                    aria-label={`Ile sztuk: ${item.name}`}
                    value={qty[item.rowId] ?? ''}
                    onChange={(e) =>
                      setQty((current) => ({ ...current, [item.rowId]: e.target.value }))
                    }
                  />
                )}
                <button
                  type="button"
                  className="small-button"
                  disabled={busy}
                  title={source ? 'Zabierz na kartę' : 'Przekaż'}
                  aria-label={`${source ? 'Zabierz' : 'Przekaż'}: ${item.name}`}
                  onClick={() => void move([refFor(item)], 0)}
                >
                  →
                </button>
              </li>
            ))}
          </ul>
        )}

        {purse > 0 && (
          <div className="inventory-money">
            <span className="inventory-row-name">Gotówka</span>
            <span className="inventory-row-detail">{purse} ed</span>
            <input
              type="number"
              className="inventory-row-qty"
              min={1}
              max={purse}
              placeholder={String(purse)}
              aria-label="Ile eurodolców"
              value={money}
              onChange={(e) => setMoney(e.target.value)}
            />
            <button
              type="button"
              className="small-button"
              disabled={busy}
              title="Przenieś eurodolce — zostawia wpis w historii obu kart"
              aria-label={source ? 'Zabierz eurodolce' : 'Przekaż eurodolce'}
              onClick={() => {
                const raw = Number.parseInt(money, 10);
                const want = Number.isInteger(raw) ? Math.min(Math.max(raw, 1), purse) : purse;
                void move([], want);
              }}
            >
              →
            </button>
          </div>
        )}

        {!source && (
          <label className="inventory-note">
            Dopisek
            <input
              type="text"
              maxLength={INVENTORY_NOTE_MAX}
              placeholder="za co (opcjonalnie)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        )}

        <div className="inventory-actions">
          <button
            type="button"
            className="small-button"
            disabled={busy || items.length === 0}
            title={
              source
                ? 'Zdejmij z ciała wszystko naraz, razem z gotówką'
                : 'Przekaż cały ekwipunek tej karty razem z gotówką'
            }
            onClick={() =>
              void move(
                items.map((item) => refFor(item)),
                purse,
              )
            }
          >
            {source ? 'Zabierz wszystko' : 'Przekaż wszystko'}
          </button>
        </div>

        {message && <p className="inventory-message">{message}</p>}
      </div>
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}
