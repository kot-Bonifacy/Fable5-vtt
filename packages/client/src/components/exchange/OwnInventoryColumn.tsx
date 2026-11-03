import { useEffect, useMemo, useState } from 'react';
import type { InventoryItemRefWire } from '@vtt/shared';
import { cpredInventoryView } from '@vtt/shared';
import { useCharacterStore } from '../../stores/characterStore.js';
import { useOutsideHands } from '../../outside-hands.js';
import { MAP_DROP_ZONE, useExchangeDrag } from './drag.js';
import { ItemGrid, countLabel, useGridSelection, useItemTile } from './ItemGrid.js';
import { clampQty, formatEd, itemKey, refOf } from './items.js';
import { DragGhost, dropOnMap } from './map-drop-item.js';

/** Strefa upuszczenia tej kolumny — tu ciało i pojemnik oddają rzeczy (64c). */
export const OWN_DROP_ZONE = 'own';

/**
 * Kolumna „Mój ekwipunek” okna „Wymiana” w trybach, w których nic nie czeka
 * na zgodę drugiej strony: pojemnik, łup i okno bez wybranej drugiej strony
 * (etap 46b2).
 *
 * Od 64c to siatka kafli (`ItemGrid`): zaznaczenie z Ctrl/Shift niesie się
 * w całości na mapę — powstaje jeden „Stos” (decyzja MG z 09.10) — a z `onPut`
 * także do strefy `putZone` obok (otwarty pojemnik) albo dwuklikiem. Ilość
 * stosu bierze się z pola na pasku pod siatką; puste pole znaczy „wszystko”.
 * Sama kolumna jest strefą `own` — rodzic podświetla ją `dropHover`, gdy
 * niesie tu coś z ciała albo z pojemnika.
 */
export function OwnInventoryColumn({
  anchorId,
  busy = false,
  putZone,
  onPut,
  onHoverZone,
  dropHover = false,
}: {
  anchorId: string;
  busy?: boolean;
  /** Nazwa strefy, do której wolno upuścić (`data-exchange-drop`). */
  putZone?: string;
  /** Dwuklik, pasek i upuszczenie w `putZone`: rzeczy i gotówka do drugiej strony. */
  onPut?: (refs: InventoryItemRefWire[], eddies: number) => void;
  /** Strefa pod duchem — druga kolumna podświetla się, gdy to ona. */
  onHoverZone?: (zone: string | null) => void;
  /** Rodzic niesie nad tę kolumnę rzeczy z drugiej strony. */
  dropHover?: boolean;
}) {
  const anchor = useCharacterStore((s) => s.characters[anchorId]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [money, setMoney] = useState('');

  const outside = useOutsideHands();
  const items = useMemo(
    () => (anchor ? cpredInventoryView(anchor.data, outside) : []),
    [anchor, outside],
  );
  const wallet = anchor?.data.eddies ?? 0;
  const tile = useItemTile();
  const tiles = useMemo(() => items.map((item) => tile(item)), [items, tile]);
  const byKey = useMemo(() => new Map(items.map((item) => [itemKey(item), item])), [items]);
  const selection = useGridSelection(useMemo(() => tiles.map((t) => t.key), [tiles]));

  function refsFor(keys: string[]): InventoryItemRefWire[] {
    return keys.flatMap((key) => {
      const item = byKey.get(key);
      if (!item) return [];
      return [refOf(item, item.stackable ? clampQty(qty[key], item.qty) : item.qty)];
    });
  }

  function forget(keys: string[]) {
    selection.clear();
    setQty((current) => {
      const next = { ...current };
      for (const key of keys) delete next[key];
      return next;
    });
  }

  function put(keys: string[]) {
    if (!onPut) return;
    onPut(refsFor(keys), 0);
    forget(keys);
  }

  const { drag, hoverZone, handlers } = useExchangeDrag<{ keys: string[] }>(
    (source, zone) => {
      if (zone === putZone) put(source.keys);
    },
    busy,
    (source, point) => {
      void dropOnMap(anchorId, refsFor(source.keys), point).then((ok) => {
        if (ok) forget(source.keys);
      });
    },
  );

  useEffect(() => {
    onHoverZone?.(hoverZone);
  }, [hoverZone, onHoverZone]);

  const ghost =
    drag && drag.source.keys.length === 1
      ? (byKey.get(drag.source.keys[0]!)?.name ?? '')
      : countLabel(drag?.source.keys.length ?? 0);

  return (
    <div
      className={`trade-column trade-inventory${dropHover ? ' trade-zone--hover' : ''}`}
      data-exchange-drop={OWN_DROP_ZONE}
    >
      <p className="trade-column-title">Mój ekwipunek — {anchor?.name}</p>
      <ItemGrid
        tiles={tiles}
        selection={selection}
        label="Mój ekwipunek"
        emptyText="Na razie nic."
        hint={
          onPut
            ? 'Dwuklik albo przeciągnięcie obok wkłada, na mapę — kładzie na ziemi · Ctrl/Shift+klik — kilka naraz'
            : 'Przeciągnij na mapę, żeby położyć na ziemi · Ctrl/Shift+klik — kilka naraz'
        }
        {...(onPut
          ? {
              action: {
                label: 'Włóż →',
                title: 'Włóż zaznaczone',
                disabled: busy,
                run: put,
              },
            }
          : {})}
        qty={{
          label: (t) => `Ile sztuk: ${t.name}`,
          value: (t) => qty[t.key] ?? '',
          placeholder: (t) => String(t.qty ?? ''),
          onChange: (t, raw) => setQty((current) => ({ ...current, [t.key]: raw })),
        }}
        drag={(keys) => handlers({ keys })}
        minRows={3}
      />
      <div className="inventory-money">
        <span className="inventory-row-name">Portfel</span>
        <span className="inventory-row-detail">{formatEd(wallet)}</span>
        {onPut && wallet > 0 && (
          <>
            <input
              type="number"
              className="inventory-row-qty"
              min={1}
              max={wallet}
              placeholder={String(wallet)}
              aria-label="Ile eurodolców włożyć"
              value={money}
              onChange={(e) => setMoney(e.target.value)}
            />
            <button
              type="button"
              className="small-button"
              disabled={busy}
              title="Włóż eurodolce — zostawia wpis w historii karty"
              aria-label="Włóż eurodolce"
              onClick={() => {
                onPut([], clampQty(money, wallet));
                setMoney('');
              }}
            >
              →
            </button>
          </>
        )}
      </div>
      <DragGhost drag={drag} label={ghost} onMap={hoverZone === MAP_DROP_ZONE} />
    </div>
  );
}
