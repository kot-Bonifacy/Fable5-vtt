import { useState } from 'react';
import type { CpredItemViewWire, InventoryItemRefWire } from '@vtt/shared';
import { CPRED_ITEM_LIST_LABELS, INVENTORY_NOTE_MAX, cpredInventoryView } from '@vtt/shared';
import { giveInventory, inventoryErrorText } from '../../socket.js';
import { useCharacterStore } from '../../stores/characterStore.js';
import { ItemViewIcon } from '../ItemIcons.js';
import { clampQty, formatEd, itemKey, refOf } from './items.js';

/**
 * Tryb `gm` okna „Wymiana” (decyzja MG 8) — narzędzie MG z 38b w nowym oknie.
 *
 * Z karty, na której otwarto okno (lewa kolumna), na dowolną kartę („Dokąd”),
 * bez niczyich zgód. Wyjątkiem jest karta gracza: tam dalej idzie propozycja
 * z „Przyjmij”, bo o tym, co ląduje na karcie, decyduje jej właściciel —
 * o tym, czy coś czeka, mówi serwer (`pending`), nie zgadywanie w oknie.
 */
export function GmPane({
  anchorId,
  targets,
  initialTarget,
}: {
  anchorId: string;
  targets: { id: string; name: string }[];
  initialTarget: string | null;
}) {
  const anchor = useCharacterStore((s) => s.characters[anchorId]);
  const [targetId, setTargetId] = useState(initialTarget ?? '');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [money, setMoney] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const items = anchor ? cpredInventoryView(anchor.data) : [];
  const purse = anchor?.data.eddies ?? 0;
  const targetName = targets.find((row) => row.id === targetId)?.name ?? '';

  async function give(refs: InventoryItemRefWire[], eddies: number) {
    if (!targetId) {
      setMessage('Wskaż, komu to ma trafić.');
      return;
    }
    setBusy(true);
    const ack = await giveInventory({
      fromCharacterId: anchorId,
      toCharacterId: targetId,
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
    setMessage(
      ack.data?.pending === true
        ? `Wysłane do: ${targetName} — czeka na przyjęcie.`
        : `Przekazane: ${targetName}.`,
    );
  }

  function refFor(item: CpredItemViewWire): InventoryItemRefWire {
    return refOf(item, item.stackable ? clampQty(qty[itemKey(item)], item.qty) : item.qty);
  }

  return (
    <>
      <div className="exchange-columns exchange-columns--two">
        <div className="trade-column">
          <p className="trade-column-title">Skąd — {anchor?.name}</p>
          {items.length === 0 && (
            <p className="inventory-empty">Ta karta nie ma nic w ekwipunku.</p>
          )}
          <ul className="inventory-list">
            {items.map((item) => (
              <li key={itemKey(item)} className="inventory-row">
                <ItemViewIcon item={item} />
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
                    value={qty[itemKey(item)] ?? ''}
                    onChange={(e) =>
                      setQty((current) => ({ ...current, [itemKey(item)]: e.target.value }))
                    }
                  />
                )}
                <button
                  type="button"
                  className="small-button"
                  disabled={busy}
                  title="Przekaż"
                  aria-label={`Przekaż: ${item.name}`}
                  onClick={() => void give([refFor(item)], 0)}
                >
                  →
                </button>
              </li>
            ))}
          </ul>
          {purse > 0 && (
            <div className="inventory-money">
              <span className="inventory-row-name">Gotówka</span>
              <span className="inventory-row-detail">{formatEd(purse)}</span>
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
                aria-label="Przekaż eurodolce"
                onClick={() => void give([], clampQty(money, purse))}
              >
                →
              </button>
            </div>
          )}
        </div>

        <div className="trade-zone">
          <label className="inventory-end">
            Dokąd
            <select
              value={targetId}
              aria-label="Dokąd"
              onChange={(e) => {
                setTargetId(e.target.value);
                setMessage(null);
              }}
            >
              <option value="">— wybierz kartę —</option>
              {targets.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
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
          <p className="inventory-hint">
            Na kartę NPC-a rzecz trafia od ręki. Na kartę gracza idzie propozycja — gracz przyjmuje
            ją z czatu.
          </p>
        </div>
      </div>

      <div className="trade-footer">
        {message && <p className="inventory-message">{message}</p>}
        <div className="inventory-actions">
          <button
            type="button"
            className="small-button"
            disabled={busy || (items.length === 0 && purse === 0)}
            title="Przekaż cały ekwipunek tej karty razem z gotówką"
            onClick={() =>
              void give(
                items.map((item) => refOf(item)),
                purse,
              )
            }
          >
            Przekaż wszystko
          </button>
        </div>
      </div>
    </>
  );
}
