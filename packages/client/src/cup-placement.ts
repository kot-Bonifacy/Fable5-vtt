import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useAuthStore } from './stores/authStore.js';

/**
 * Gdzie stoi kubek (zlecenie MG z 10.11.2026).
 *
 * Domyślnie kubek stoi w lewym dolnym rogu okna i wtedy pozycji nie ma wcale
 * (`null`), bo róg ustawia CSS razem z rezerwą w lewym panelu. Odblokowany
 * kubek można postawić gdziekolwiek, a pozycja zostaje w tej przeglądarce —
 * jest geometrią tego ekranu, jak położenie pływających okien
 * (`window-placement.ts`). Sama blokada nie jest zapisywana: po odświeżeniu
 * kubek ma znów rzucać, a odblokowany tylko się przesuwa.
 */

export interface CupPoint {
  x: number;
  y: number;
}

export interface CupViewport {
  width: number;
  height: number;
}

/** Średnica kubka: ikona 30 px, `padding` 0,55 rem i ramka 2 px z każdej strony. */
export const CUP_SIZE_PX = 52;
const CUP_EDGE_MARGIN_PX = 4;
/** Odstęp domyślnego kubka od rogu (1 rem w `.dice-cup`). */
const CUP_CORNER_OFFSET_PX = 16;

/** Sprowadza kubek na ekran — zapisana pozycja mogła przyjść z większego monitora. */
export function clampCupPosition(point: CupPoint, viewport: CupViewport): CupPoint {
  const fit = (value: number, span: number) =>
    Math.max(
      CUP_EDGE_MARGIN_PX,
      Math.min(value, Math.max(CUP_EDGE_MARGIN_PX, span - CUP_SIZE_PX - CUP_EDGE_MARGIN_PX)),
    );
  return { x: fit(point.x, viewport.width), y: fit(point.y, viewport.height) };
}

/** Lewy górny róg kubka stojącego w domyślnym rogu okna. */
export function defaultCupPosition(viewport: CupViewport): CupPoint {
  return { x: CUP_CORNER_OFFSET_PX, y: viewport.height - CUP_CORNER_OFFSET_PX - CUP_SIZE_PX };
}

/** W prawej połowie ekranu etykieta rzutu rośnie w lewo, żeby nie uciekła za krawędź. */
export function cupLabelOnLeft(point: CupPoint, viewport: CupViewport): boolean {
  return point.x + CUP_SIZE_PX / 2 > viewport.width / 2;
}

/**
 * Pozycja przestawionego kubka. Przy etykiecie po lewej kotwicą jest prawa
 * krawędź, żeby rosnąca etykieta nie przesuwała ikony.
 */
export function cupPlacedStyle(point: CupPoint, viewport: CupViewport): CSSProperties {
  const edge = cupLabelOnLeft(point, viewport)
    ? { left: 'auto', right: viewport.width - point.x - CUP_SIZE_PX }
    : { left: point.x };
  return { ...edge, top: point.y, bottom: 'auto' };
}

/** Odczyt z `localStorage`: wszystko inne niż para skończonych liczb to brak pozycji. */
export function parseCupPosition(raw: string | null): CupPoint | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { x, y } = value as Record<string, unknown>;
    return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x + y)
      ? { x, y }
      : null;
  } catch {
    return null;
  }
}

function storageKey(userId: string): string {
  return `vtt.cup.${userId}`;
}

function readPosition(userId: string | null): CupPoint | null {
  if (!userId) return null;
  try {
    return parseCupPosition(window.localStorage.getItem(storageKey(userId)));
  } catch {
    return null;
  }
}

function writePosition(userId: string | null, point: CupPoint | null): void {
  if (!userId) return;
  try {
    if (point) window.localStorage.setItem(storageKey(userId), JSON.stringify(point));
    else window.localStorage.removeItem(storageKey(userId));
  } catch {
    // Prywatne okno albo pełny dysk: kubek stoi, tylko nie pamięta gdzie.
  }
}

export function readCupViewport(): CupViewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * Pozycja kubka tego użytkownika, sprowadzona na bieżący ekran. Zapis trzyma
 * oryginał, więc chwilowo zmniejszone okno nie przesuwa kubka na stałe.
 */
export function useCupPlacement(): {
  position: CupPoint | null;
  viewport: CupViewport;
  place: (point: CupPoint | null) => void;
} {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [stored, setStored] = useState<CupPoint | null>(() => readPosition(userId));
  const [viewport, setViewport] = useState<CupViewport>(readCupViewport);

  useEffect(() => setStored(readPosition(userId)), [userId]);
  useEffect(() => {
    const onResize = () => setViewport(readCupViewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const place = useCallback(
    (point: CupPoint | null) => {
      setStored(point);
      writePosition(userId, point);
    },
    [userId],
  );

  return { position: stored ? clampCupPosition(stored, viewport) : null, viewport, place };
}
