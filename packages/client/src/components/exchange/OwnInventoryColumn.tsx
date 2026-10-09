import { useEffect, useState } from 'react';
import type { CpredItemViewWire, InventoryItemRefWire } from '@vtt/shared';
import { CPRED_ITEM_LIST_LABELS, cpredInventoryView } from '@vtt/shared';
import { useCharacterStore } from '../../stores/characterStore.js';
import { ItemViewIcon } from '../ItemIcons.js';
import { MAP_DROP_ZONE, useExchangeDrag } from './drag.js';
import { clampQty, itemDetail, itemKey, refOf } from './items.js';
import { DragGhost, dropOnMap } from './map-drop-item.js';

/**
 * Kolumna „Mój ekwipunek” okna „Wymiana” w trybach, w których nic nie czeka
 * na zgodę drugiej strony: pojemnik, łup i okno bez wybranej drugiej strony
 * (etap 46b2).
 *
 * Każdy wiersz da się przeciągnąć na mapę — powstaje „Stos” (decyzja MG
 * z 09.10) — a z `onPut` także do strefy `putZone` obok (otwarty pojemnik).
 * Ilość wiersza, który się składa w stos, bierze się z pola przy nim; puste
 * pole znaczy „wszystko”.
 */
export function OwnInventoryColumn({
  anchorId,
  busy = false,
  putZone,
  onPut,
  onHoverZone,
}: {
  anchorId: string;
  busy?: boolean;
  /** Nazwa strefy, do której wolno upuścić (`data-exchange-drop`). */
  putZone?: string;
  /** „→” i upuszczenie w `putZone`: wiersze i gotówka do drugiej strony. */
  onPut?: (refs: InventoryItemRefWire[], eddies: number) => void;
  /** Strefa pod duchem — druga kolumna podświetla się, gdy to ona. */
  onHoverZone?: (zone: string | null) => void;
}) {
  const anchor = useCharacterStore((s) => s.characters[anchorId]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [money, setMoney] = useState('');

  const items = anchor ? cpredInventoryView(anchor.data) : [];
  const wallet = anchor?.data.eddies ?? 0;

  function refFor(item: CpredItemViewWire): InventoryItemRefWire {
    return refOf(item, item.stackable ? clampQty(qty[itemKey(item)], item.qty) : item.qty);
  }

  const { drag, hoverZone, handlers } = useExchangeDrag<CpredItemViewWire>(
    (item, zone) => {
      if (zone === putZone && onPut) onPut([refFor(item)], 0);
    },
    busy,
    (item, point) => {
      void dropOnMap(anchorId, [refFor(item)], point).then((ok) => {
        if (ok) setQty((current) => ({ ...current, [itemKey(item)]: '' }));
      });
    },
  );

  useEffect(() => {
    onHoverZone?.(hoverZone);
  }, [hoverZone, onHoverZone]);

  return (
    <div className="trade-column">
      <p className="trade-column-title">Mój ekwipunek — {anchor?.name}</p>
      {items.length === 0 && <p className="inventory-empty">Na razie nic.</p>}
      <ul className="inventory-list">
        {items.map((item) => (
          <li
            key={itemKey(item)}
            className="inventory-row trade-draggable"
            title={`${CPRED_ITEM_LIST_LABELS[item.list]} — ${
              onPut ? 'przeciągnij obok albo na mapę' : 'przeciągnij na mapę, żeby położyć'
            }`}
            data-own-item={item.name}
            {...handlers(item)}
          >
            <span className="trade-grip" aria-hidden="true">
              ⠿
            </span>
            <ItemViewIcon item={item} />
            <span className="inventory-row-name">{item.name}</span>
            <span className="inventory-row-detail">{itemDetail(item)}</span>
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
            {onPut && (
              <button
                type="button"
                className="small-button"
                disabled={busy}
                title="Włóż do pojemnika"
                aria-label={`Włóż: ${item.name}`}
                onClick={() => onPut([refFor(item)], 0)}
              >
                →
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="inventory-money">
        <span className="inventory-row-name">Portfel</span>
        <span className="inventory-row-detail">{wallet} ed</span>
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
      <DragGhost drag={drag} label={drag?.source.name ?? ''} onMap={hoverZone === MAP_DROP_ZONE} />
    </div>
  );
}
