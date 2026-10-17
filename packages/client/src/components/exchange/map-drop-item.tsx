import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { InventoryItemRefWire, ScenePoint } from '@vtt/shared';
import { dropInventory, inventoryErrorText } from '../../socket.js';
import { noteAck } from '../../notices.js';
import { useSceneStore } from '../../stores/sceneStore.js';
import { MAP_DROP_ZONE, useExchangeDrag } from './drag.js';

/**
 * „Stos” z wiersza ekwipunku upuszczonego na mapę (etap 46b2, wzór: Item Piles).
 *
 * Dwa wejścia, jedna droga (decyzja MG z 09.10): ikonka wiersza na karcie
 * postaci i wiersz kolumny „Mój ekwipunek” w oknie „Wymiana”. Oba kończą się
 * w `dropOnMap`, a serwer (`inventory:drop`) sam rozstrzyga zasięg ręki,
 * nowy stos albo dołożenie do stosu na tym samym polu.
 */

/** Punkt sceny → lewy górny róg pola, jak przy stawianiu żetonu; serwer dociąga do kratki. */
function landingCorner(point: ScenePoint): ScenePoint {
  const extent = useSceneStore.getState().effectiveScene?.grid.sizePx ?? 0;
  return { x: point.x - extent / 2, y: point.y - extent / 2 };
}

export async function dropOnMap(
  characterId: string,
  items: InventoryItemRefWire[],
  point: ScenePoint,
  eddies = 0,
): Promise<boolean> {
  const corner = landingCorner(point);
  const ack = await dropInventory({
    fromCharacterId: characterId,
    x: corner.x,
    y: corner.y,
    items,
    ...(eddies > 0 ? { eddies } : {}),
  });
  noteAck('exchange', ack, inventoryErrorText);
  return ack.ok;
}

/**
 * Duch przeciąganego wiersza — w portalu, bo okno i karta mają `clip-path`,
 * który uciąłby go na swojej krawędzi, zanim dojedzie do mapy.
 */
export function DragGhost({
  drag,
  label,
  onMap,
}: {
  drag: { x: number; y: number } | null;
  label: string;
  onMap: boolean;
}) {
  if (!drag) return null;
  return createPortal(
    <div className="trade-drag-ghost" style={{ left: drag.x + 12, top: drag.y + 8 }}>
      {label}
      {onMap && <span className="drag-ghost-hint"> — połóż tutaj</span>}
    </div>,
    document.body,
  );
}

interface SheetDropSource {
  ref: InventoryItemRefWire;
  name: string;
}

/**
 * Uchwyt na karcie postaci: ikonka wiersza (albo „⠿”, gdy wiersz jej nie ma),
 * którą łapie się i niesie na mapę. Leci cały wiersz — ilość wybiera się
 * w oknie „Wymiana” (decyzja MG z 09.10).
 */
export function MapDropHandle({
  characterId,
  source,
  children,
  disabled = false,
}: {
  characterId: string;
  source: SheetDropSource;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const { drag, hoverZone, handlers } = useExchangeDrag<SheetDropSource>(
    () => undefined,
    disabled,
    (dropped, point) => void dropOnMap(characterId, [dropped.ref], point),
  );
  return (
    <span
      className={`map-drop-handle${disabled ? '' : ' map-drop-handle--live'}`}
      title={disabled ? undefined : `Przeciągnij na mapę, żeby położyć: ${source.name}`}
      data-map-drop-handle
      {...handlers(source)}
    >
      {children ?? (
        <span className="trade-grip" aria-hidden="true">
          ⠿
        </span>
      )}
      <DragGhost drag={drag} label={source.name} onMap={hoverZone === MAP_DROP_ZONE} />
    </span>
  );
}
