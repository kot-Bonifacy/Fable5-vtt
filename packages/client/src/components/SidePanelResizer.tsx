import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Drag handle on the left edge of the side panel.
 *
 * The compendium's stat grid and the range DV table need more room than chat
 * does, so the panel width is the player's choice and is remembered between
 * sessions. Pixi resizes itself (the map host has `resizeTo`), so widening the
 * panel does not need any extra plumbing on the map side.
 */

const STORAGE_KEY = 'vtt.sidePanelWidth';
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 280;
/** Always leave this much room for the map, whatever the window size. */
const MIN_MAP_WIDTH = 320;
const KEYBOARD_STEP = 24;

function maxWidth(): number {
  return Math.max(MIN_WIDTH, window.innerWidth - MIN_MAP_WIDTH);
}

function clampWidth(value: number): number {
  return Math.min(Math.max(Math.round(value), MIN_WIDTH), maxWidth());
}

function readStoredWidth(): number {
  const stored = Number(window.localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : DEFAULT_WIDTH;
}

export function useSidePanelWidth(): number {
  const [width, setWidth] = useState(readStoredWidth);

  useEffect(() => {
    const onResize = () => setWidth((current) => clampWidth(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<number>).detail;
      if (typeof detail === 'number') setWidth(clampWidth(detail));
    };
    window.addEventListener('vtt:side-panel-width', onChange);
    return () => window.removeEventListener('vtt:side-panel-width', onChange);
  }, []);

  return width;
}

function publishWidth(width: number): void {
  const clamped = clampWidth(width);
  window.localStorage.setItem(STORAGE_KEY, String(clamped));
  window.dispatchEvent(new CustomEvent('vtt:side-panel-width', { detail: clamped }));
}

export function SidePanelResizer({ width }: { width: number }) {
  const dragging = useRef(false);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragging.current = true;
      const startX = event.clientX;
      const startWidth = width;
      // Dragging right shrinks the panel, so the delta is inverted.
      const onMove = (moveEvent: PointerEvent) =>
        publishWidth(startWidth + (startX - moveEvent.clientX));
      const onUp = () => {
        dragging.current = false;
        document.body.classList.remove('is-resizing');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      document.body.classList.add('is-resizing');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [width],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') publishWidth(width + KEYBOARD_STEP);
      else if (event.key === 'ArrowRight') publishWidth(width - KEYBOARD_STEP);
      else return;
      event.preventDefault();
    },
    [width],
  );

  return (
    <div
      className="side-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Szerokość panelu — przeciągnij lub użyj strzałek"
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => publishWidth(DEFAULT_WIDTH)}
      title="Przeciągnij, aby zmienić szerokość. Dwuklik przywraca domyślną."
    />
  );
}
