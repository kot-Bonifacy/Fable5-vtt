import type { CpredItemViewWire, InventoryItemRefWire } from '@vtt/shared';

/** Wspólne drobiazgi okna „Wymiana” — adres wiersza, klucz, podpis ilości. */

export function refOf(item: CpredItemViewWire, qty = item.qty): InventoryItemRefWire {
  return item.stackable
    ? { list: item.list, rowId: item.rowId, qty }
    : { list: item.list, rowId: item.rowId };
}

export function itemKey(item: Pick<CpredItemViewWire, 'list' | 'rowId'>): string {
  return `${item.list}:${item.rowId}`;
}

export function itemDetail(item: CpredItemViewWire): string {
  if (item.stackable) return item.qty > 1 ? `× ${item.qty}` : '';
  return item.detail;
}

/** Liczba z pola ilości przycięta do `1…max`; puste albo śmieć — `max`. */
export function clampQty(raw: string | undefined, max: number): number {
  const value = Number.parseInt(raw ?? '', 10);
  return Number.isInteger(value) ? Math.min(Math.max(value, 1), max) : max;
}
