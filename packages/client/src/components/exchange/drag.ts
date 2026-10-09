import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { ScenePoint } from '@vtt/shared';
import { mapPointUnder, showMapDropGhost } from '../../map/map-drop.js';

/**
 * Przeciąganie w oknie „Wymiana” (38c, od 46a wspólne dla handlu i sklepu).
 *
 * Na zdarzeniach wskaźnika, nie na HTML5 drag-and-drop — to drugie nie działa
 * na dotyku. Strefę upuszczenia znaczy atrybut `data-exchange-drop`, a
 * `elementFromPoint` znajduje ją pod duchem (duch ma `pointer-events: none`).
 *
 * Stan „przeciągam” siedzi w `ref`, nie w stanie Reacta: szybki ruch daje
 * jeden `pointermove` i od razu `pointerup`, zanim React przerysuje — puszczenie
 * sprawdzane stanem wyglądałoby jak kliknięcie (pułapka `ui` z 23.09). Stan
 * Reacta służy wyłącznie do rysowania ducha i podświetlenia strefy.
 *
 * Etap 46b2: z `onMapDrop` wiersz da się też puścić na płótno mapy („Stos”).
 * Mapa jest strefą `map` wtedy, gdy pod kursorem nie ma żadnej strefy okna —
 * okno leży nad mapą, więc wygrywa to, co widać na wierzchu. Ducha takiego
 * przeciągania trzeba rysować przez `DragGhost` (portal): okno ma `clip-path`
 * i obcięłoby go na swojej krawędzi.
 */

/** Strefa „płótno mapy” — `hoverZone` i podświetlenie wiersza. */
export const MAP_DROP_ZONE = 'map';

/** Ile pikseli wskaźnik musi przejechać, żeby naciśnięcie było przeciąganiem, a nie kliknięciem. */
const DRAG_THRESHOLD_PX = 5;

export interface ExchangeDrag<S> {
  /** Co jest teraz ciągnięte i gdzie stoi duch — do rysowania. */
  drag: { source: S; x: number; y: number } | null;
  /** Strefa pod wskaźnikiem w tej chwili. */
  hoverZone: string | null;
  /** Uchwyty do rozłożenia na wierszu, który da się złapać. */
  handlers: (source: S) => {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: () => void;
  };
}

function zoneAt(x: number, y: number): string | null {
  const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-exchange-drop]');
  return hit?.dataset.exchangeDrop ?? null;
}

export function useExchangeDrag<S>(
  onDrop: (source: S, zone: string) => void,
  disabled = false,
  onMapDrop?: (source: S, point: ScenePoint) => void,
): ExchangeDrag<S> {
  const [drag, setDrag] = useState<{ source: S; x: number; y: number } | null>(null);
  const [hoverZone, setHoverZone] = useState<string | null>(null);
  const pending = useRef<{
    source: S;
    x: number;
    y: number;
    id: number;
    moving: boolean;
  } | null>(null);

  const isFar = (start: { x: number; y: number }, event: ReactPointerEvent<HTMLElement>) =>
    Math.hypot(event.clientX - start.x, event.clientY - start.y) >= DRAG_THRESHOLD_PX;

  const reset = () => {
    pending.current = null;
    setDrag(null);
    setHoverZone(null);
    if (onMapDrop) showMapDropGhost(null);
  };

  /** Strefa okna pod kursorem, a bez niej — płótno mapy, gdy wolno na nie upuszczać. */
  const target = (x: number, y: number): { zone: string; point?: ScenePoint } | null => {
    const zone = zoneAt(x, y);
    if (zone) return { zone };
    if (!onMapDrop) return null;
    const point = mapPointUnder(x, y);
    return point ? { zone: MAP_DROP_ZONE, point } : null;
  };

  const handlers = (source: S) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || disabled) return;
      // Kontrolki w wierszu (strzałka, pole ilości) klika się normalnie.
      if ((event.target as HTMLElement).closest('button, input, select')) return;
      pending.current = {
        source,
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId,
        moving: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const start = pending.current;
      if (!start || start.id !== event.pointerId) return;
      if (!start.moving && !isFar(start, event)) return;
      start.moving = true;
      setDrag({ source: start.source, x: event.clientX, y: event.clientY });
      const under = target(event.clientX, event.clientY);
      setHoverZone(under?.zone ?? null);
      if (onMapDrop) showMapDropGhost(under?.point ?? null);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const start = pending.current;
      reset();
      if (!start || start.id !== event.pointerId) return;
      if (!start.moving && !isFar(start, event)) return;
      const under = target(event.clientX, event.clientY);
      if (!under) return;
      if (under.point) onMapDrop?.(start.source, under.point);
      else onDrop(start.source, under.zone);
    },
    onPointerCancel: reset,
  });

  return { drag, hoverZone, handlers };
}
