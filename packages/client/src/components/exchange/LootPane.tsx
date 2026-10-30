import { useState } from 'react';
import type { ExchangeCounterpartView, InventoryItemRefWire } from '@vtt/shared';
import { notifyInfo, notifyRefusal } from '../../notices.js';
import { inventoryErrorText, takeInventory } from '../../socket.js';
import { useCharacterStore } from '../../stores/characterStore.js';
import { clampQty, formatEd, refOf } from './items.js';
import { OWN_DROP_ZONE, OwnInventoryColumn } from './OwnInventoryColumn.js';
import { TakeGrid } from './TakeGrid.js';

/**
 * Tryb `loot` okna „Wymiana” (38b, w jednym oknie od 46a) — ciało, które leży
 * albo nie żyje i nie ma właściciela. Bierze się od ręki, bez niczyjej zgody:
 * zaznaczenie z siatki (dwuklik, „← Weź”, przeciągnięcie na mój ekwipunek —
 * od 64c) albo „Zabierz wszystko” razem z gotówką.
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
  const [money, setMoney] = useState('');
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

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
      notifyRefusal('exchange', inventoryErrorText(ack.error));
      return;
    }
    setMoney('');
    notifyInfo(`Zabrane na kartę: ${anchor?.name ?? 'twoja karta'}.`, { topic: 'exchange' });
    onChanged();
  }

  return (
    <>
      <div className="exchange-columns exchange-columns--two">
        {/* 46b2: mój ekwipunek z przeciąganiem na mapę („Stos”). */}
        <OwnInventoryColumn anchorId={anchorId} busy={busy} dropHover={hover === OWN_DROP_ZONE} />

        <div className="trade-zone">
          <p className="trade-column-title">Przy ciele: {body.name}</p>
          <TakeGrid
            items={items}
            label={`Przy ciele: ${body.name}`}
            busy={busy}
            {...(purse === 0 ? { emptyText: 'Nic tu już nie zostało.' } : {})}
            onTake={(refs) => void take(refs, 0)}
            onHoverZone={setHover}
          />
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
