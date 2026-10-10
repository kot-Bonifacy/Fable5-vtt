import { useState } from 'react';
import type { CpredItemViewWire, ExchangeCounterpartView, InventoryItemRefWire } from '@vtt/shared';
import { CPRED_ITEM_LIST_LABELS } from '@vtt/shared';
import { inventoryErrorText, takeInventory } from '../../socket.js';
import { useCharacterStore } from '../../stores/characterStore.js';
import { ItemViewIcon } from '../ItemIcons.js';
import { clampQty, formatEd, itemDetail, itemKey, refOf } from './items.js';
import { OwnInventoryColumn } from './OwnInventoryColumn.js';

/**
 * Tryb `loot` okna „Wymiana” (38b, w jednym oknie od 46a) — ciało, które leży
 * albo nie żyje i nie ma właściciela. Bierze się od ręki, bez niczyjej zgody:
 * „Weź” przy wierszu albo „Zabierz wszystko” razem z gotówką.
 *
 * Ekwipunek ciała przyszedł z serwera razem z prawem do niego
 * (`exchange:counterparts`) — gracz nie zna karty cudzej figury. Po każdym
 * wzięciu lista przychodzi od nowa (`onChanged`), bo cudza karta nie jedzie do
 * gracza przez `character:upsert`.
 */
export function LootPane({
  anchorId,
  body,
  onChanged,
}: {
  anchorId: string;
  body: ExchangeCounterpartView;
  onChanged: () => void;
}) {
  const anchor = useCharacterStore((s) => s.characters[anchorId]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [money, setMoney] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const items = body.items ?? [];
  const purse = body.eddies ?? 0;

  async function take(refs: InventoryItemRefWire[], eddies: number) {
    if (!body.tokenId) return;
    setBusy(true);
    const ack = await takeInventory({
      fromTokenId: body.tokenId,
      toCharacterId: anchorId,
      items: refs,
      ...(eddies > 0 ? { eddies } : {}),
    });
    setBusy(false);
    if (!ack.ok) {
      setMessage(inventoryErrorText(ack.error));
      return;
    }
    setQty({});
    setMoney('');
    setMessage(`Zabrane na kartę: ${anchor?.name ?? 'twoja karta'}.`);
    onChanged();
  }

  function refFor(item: CpredItemViewWire): InventoryItemRefWire {
    return refOf(item, item.stackable ? clampQty(qty[itemKey(item)], item.qty) : item.qty);
  }

  return (
    <>
      <div className="exchange-columns exchange-columns--two">
        {/* 46b2: mój ekwipunek z przeciąganiem na mapę („Stos”). */}
        <OwnInventoryColumn anchorId={anchorId} busy={busy} />

        <div className="trade-zone">
          <p className="trade-column-title">Przy ciele: {body.name}</p>
          {items.length === 0 && purse === 0 && (
            <p className="inventory-empty">Nic tu już nie zostało.</p>
          )}
          <ul className="inventory-list">
            {items.map((item) => (
              <li key={itemKey(item)} className="inventory-row">
                <button
                  type="button"
                  className="small-button"
                  disabled={busy}
                  title="Weź na swoją kartę"
                  aria-label={`Weź: ${item.name}`}
                  onClick={() => void take([refFor(item)], 0)}
                >
                  ←
                </button>
                <ItemViewIcon item={item} />
                <span className="inventory-row-name" title={CPRED_ITEM_LIST_LABELS[item.list]}>
                  {item.name}
                </span>
                <span className="inventory-row-detail">{itemDetail(item) || item.detail}</span>
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
              </li>
            ))}
          </ul>
          {purse > 0 && (
            <div className="inventory-money">
              <button
                type="button"
                className="small-button"
                disabled={busy}
                title="Weź eurodolce — zostawia wpis w historii obu kart"
                aria-label="Weź eurodolce"
                onClick={() => void take([], clampQty(money, purse))}
              >
                ←
              </button>
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
            </div>
          )}
        </div>
      </div>

      <div className="trade-footer">
        {message && <p className="inventory-message">{message}</p>}
        <p className="inventory-hint">
          Ciało przeszukuje się od ręki — nikt nie musi się na to zgadzać.
        </p>
        <div className="inventory-actions">
          <button
            type="button"
            className="small-button small-button--primary"
            disabled={busy || (items.length === 0 && purse === 0)}
            title="Zdejmij z ciała wszystko naraz, razem z gotówką"
            onClick={() =>
              void take(
                items.map((item) => refOf(item)),
                purse,
              )
            }
          >
            Zabierz wszystko
          </button>
        </div>
      </div>
    </>
  );
}
