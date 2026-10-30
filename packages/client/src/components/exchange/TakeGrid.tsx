import { useEffect, useMemo, useState } from 'react';
import type { CpredItemViewWire, InventoryItemRefWire } from '@vtt/shared';
import { useExchangeDrag } from './drag.js';
import { ItemGrid, countLabel, useGridSelection, useItemTile } from './ItemGrid.js';
import { clampQty, itemKey, refOf } from './items.js';
import { DragGhost } from './map-drop-item.js';
import { OWN_DROP_ZONE } from './OwnInventoryColumn.js';

/**
 * Siatka rzeczy, które się bierze od ręki (etap 64c): ciało w trybie `loot`
 * i otwarty pojemnik. Dwuklik, „← Weź” na pasku albo przeciągnięcie na mój
 * ekwipunek (strefa `own`) zabiera całe zaznaczenie jednym żądaniem; ilość
 * stosu — z pola na pasku, puste znaczy „wszystko”.
 *
 * Lista przychodzi z serwera po każdym wzięciu, więc zaznaczenie samo gubi
 * to, czego już nie ma.
 */
export function TakeGrid({
  items,
  label,
  busy,
  emptyText,
  onTake,
  onHoverZone,
}: {
  items: CpredItemViewWire[];
  label: string;
  busy: boolean;
  emptyText?: string;
  onTake: (refs: InventoryItemRefWire[]) => void;
  /** Strefa pod duchem — kolumna mojego ekwipunku podświetla się nad `own`. */
  onHoverZone?: (zone: string | null) => void;
}) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const tile = useItemTile();
  const tiles = useMemo(() => items.map((item) => tile(item)), [items, tile]);
  const byKey = useMemo(() => new Map(items.map((item) => [itemKey(item), item])), [items]);
  const selection = useGridSelection(useMemo(() => tiles.map((t) => t.key), [tiles]));

  function take(keys: string[]) {
    const refs = keys.flatMap((key) => {
      const item = byKey.get(key);
      if (!item) return [];
      return [refOf(item, item.stackable ? clampQty(qty[key], item.qty) : item.qty)];
    });
    if (refs.length === 0) return;
    selection.clear();
    setQty({});
    onTake(refs);
  }

  const { drag, hoverZone, handlers } = useExchangeDrag<{ keys: string[] }>((source, zone) => {
    if (zone === OWN_DROP_ZONE) take(source.keys);
  }, busy);

  useEffect(() => {
    onHoverZone?.(hoverZone);
  }, [hoverZone, onHoverZone]);

  const ghost =
    drag && drag.source.keys.length === 1
      ? (byKey.get(drag.source.keys[0]!)?.name ?? '')
      : countLabel(drag?.source.keys.length ?? 0);

  return (
    <>
      <ItemGrid
        tiles={tiles}
        selection={selection}
        label={label}
        {...(emptyText ? { emptyText } : {})}
        hint="Dwuklik albo przeciągnięcie na swój ekwipunek zabiera · Ctrl/Shift+klik — kilka naraz"
        action={{
          label: '← Weź',
          title: 'Weź zaznaczone na swoją kartę',
          disabled: busy,
          run: take,
        }}
        qty={{
          label: (t) => `Ile sztuk wziąć: ${t.name}`,
          value: (t) => qty[t.key] ?? '',
          placeholder: (t) => String(t.qty ?? ''),
          onChange: (t, raw) => setQty((current) => ({ ...current, [t.key]: raw })),
        }}
        drag={(keys) => handlers({ keys })}
        minRows={3}
      />
      <DragGhost drag={drag} label={ghost} onMap={false} />
    </>
  );
}
