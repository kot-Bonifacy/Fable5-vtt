import { useMemo, useState } from 'react';
import type { InventoryItemRefWire } from '@vtt/shared';
import { INVENTORY_NOTE_MAX, cpredInventoryView } from '@vtt/shared';
import { clearNotices, notifyInfo, notifyRefusal } from '../../notices.js';
import { giveInventory, inventoryErrorText } from '../../socket.js';
import { useCharacterStore } from '../../stores/characterStore.js';
import { useExchangeDrag } from './drag.js';
import { ItemGrid, countLabel, useGridSelection, useItemTile } from './ItemGrid.js';
import { clampQty, formatEd, itemKey, refOf } from './items.js';
import { DragGhost } from './map-drop-item.js';

/**
 * Tryb `gm` okna „Wymiana” (decyzja MG 8) — narzędzie MG z 38b w nowym oknie.
 *
 * Z karty, na której otwarto okno (lewa kolumna, od 64c siatka z zaznaczaniem
 * wielu), na dowolną kartę („Dokąd”), bez niczyich zgód. Wyjątkiem jest karta gracza: tam dalej idzie propozycja
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

  const items = useMemo(() => (anchor ? cpredInventoryView(anchor.data) : []), [anchor]);
  const tile = useItemTile();
  const tiles = useMemo(() => items.map((item) => tile(item)), [items, tile]);
  const byKey = useMemo(() => new Map(items.map((item) => [itemKey(item), item])), [items]);
  const selection = useGridSelection(useMemo(() => tiles.map((t) => t.key), [tiles]));
  const purse = anchor?.data.eddies ?? 0;
  const targetName = targets.find((row) => row.id === targetId)?.name ?? '';

  async function give(refs: InventoryItemRefWire[], eddies: number) {
    if (!targetId) {
      notifyRefusal('exchange', 'Wskaż, komu to ma trafić.');
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
      notifyRefusal('exchange', inventoryErrorText(ack.error));
      return;
    }
    setMoney('');
    setQty({});
    selection.clear();
    notifyInfo(
      ack.data?.pending === true
        ? `Wysłane do: ${targetName} — czeka na przyjęcie.`
        : `Przekazane: ${targetName}.`,
      { topic: 'exchange' },
    );
  }

  function refsFor(keys: string[]): InventoryItemRefWire[] {
    return keys.flatMap((key) => {
      const item = byKey.get(key);
      if (!item) return [];
      return [refOf(item, item.stackable ? clampQty(qty[key], item.qty) : item.qty)];
    });
  }

  const { drag, hoverZone, handlers } = useExchangeDrag<{ keys: string[] }>((source, zone) => {
    if (zone === 'target') void give(refsFor(source.keys), 0);
  }, busy);

  return (
    <>
      <div className="exchange-columns exchange-columns--two">
        <div className="trade-column">
          <p className="trade-column-title">Skąd — {anchor?.name}</p>
          <ItemGrid
            tiles={tiles}
            selection={selection}
            label={`Skąd — ${anchor?.name ?? ''}`}
            emptyText="Ta karta nie ma nic w ekwipunku."
            hint="Dwuklik albo przeciągnięcie na „Dokąd” przekazuje · Ctrl/Shift+klik — kilka naraz"
            action={{
              label: 'Przekaż →',
              title: 'Przekaż zaznaczone na wybraną kartę',
              disabled: busy,
              run: (keys) => void give(refsFor(keys), 0),
            }}
            qty={{
              label: (t) => `Ile sztuk: ${t.name}`,
              value: (t) => qty[t.key] ?? '',
              placeholder: (t) => String(t.qty ?? ''),
              onChange: (t, raw) => setQty((current) => ({ ...current, [t.key]: raw })),
            }}
            drag={(keys) => handlers({ keys })}
            minRows={3}
          />
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

        <div
          className={`trade-zone trade-zone--mine${hoverZone === 'target' ? ' trade-zone--hover' : ''}`}
          data-exchange-drop="target"
        >
          <label className="inventory-end">
            Dokąd
            <select
              value={targetId}
              aria-label="Dokąd"
              onChange={(e) => {
                setTargetId(e.target.value);
                clearNotices('exchange');
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

      <DragGhost
        drag={drag}
        label={
          drag && drag.source.keys.length === 1
            ? (byKey.get(drag.source.keys[0]!)?.name ?? '')
            : countLabel(drag?.source.keys.length ?? 0)
        }
        onMap={false}
      />

      <div className="trade-footer">
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
