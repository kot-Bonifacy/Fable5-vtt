import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

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
 */

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
      setHoverZone(zoneAt(event.clientX, event.clientY));
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const start = pending.current;
      reset();
      if (!start || start.id !== event.pointerId) return;
      if (!start.moving && !isFar(start, event)) return;
      const zone = zoneAt(event.clientX, event.clientY);
      if (zone) onDrop(start.source, zone);
    },
    onPointerCancel: reset,
  });

  return { drag, hoverZone, handlers };
}
