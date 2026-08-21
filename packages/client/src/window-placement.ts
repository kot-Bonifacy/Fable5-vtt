import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { useAuthStore } from './stores/authStore.js';

/**
 * Pływające okna: przeciąganie, skalowanie i pamięć położenia (etap 27f).
 *
 * Do 27e siedem okien — karta postaci, edytor bota, kreator, handout, edytor
 * Architektury, run w Sieci i ustawienia — nosiło **tę samą, skopiowaną**
 * logikę przeciągania (`dragRef` z `startX`/`baseX`, ograniczenie do
 * `innerWidth - 120`). Żadne nie umiało zmiany rozmiaru i żadne nie pamiętało,
 * gdzie je postawiono: każde otwarcie karty stawiało ją na nowo na środku
 * mapy, a MG, który chciał widzieć jednocześnie kartę i czat, przesuwał ją
 * w kółko. Ten moduł jest jedynym miejscem, które to wie.
 *
 * Umowa jest taka jak w Foundry: za belkę się ciągnie, za prawy dolny róg
 * rozciąga, a okno wraca tam, gdzie się je zostawiło.
 */

/** Pozycja rogu; rozmiar tylko wtedy, gdy użytkownik świadomie rozciągnął okno. */
export interface WindowPlacement {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/**
 * Ile okna musi zostać na ekranie. Belka ma być zawsze do złapania — okno
 * wypchnięte za krawędź (mniejszy monitor, złożony pasek, obrócony tablet)
 * inaczej zostałoby nie do odzyskania inaczej niż przez wyczyszczenie
 * `localStorage`.
 */
const KEEP_VISIBLE_X = 120;
const KEEP_VISIBLE_Y = 48;

const MIN_WIDTH = 280;
const MIN_HEIGHT = 160;

/**
 * Klucz jest **per użytkownik**, choć w jednej przeglądarce rzadko siedzą dwie
 * osoby: MG i gracz otwierani obok siebie stoją na różnych originach
 * (`localhost` kontra `[::1]`), więc i tak mają osobne `localStorage`. Dopisek
 * z identyfikatorem kosztuje jedną linię, a chroni przed sytuacją, w której
 * ktoś się wyloguje i zastanie cudzy układ okien.
 */
function storageKey(windowKey: string): string | null {
  const user = useAuthStore.getState().user;
  return user ? `vtt.window.${user.id}.${windowKey}` : null;
}

function readPlacement(windowKey: string): WindowPlacement | null {
  const key = storageKey(windowKey);
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = parsed as Record<string, unknown>;
    if (typeof value.x !== 'number' || typeof value.y !== 'number') return null;
    return {
      x: value.x,
      y: value.y,
      width: typeof value.width === 'number' ? value.width : undefined,
      height: typeof value.height === 'number' ? value.height : undefined,
    };
  } catch {
    // Zepsuty wpis nie może zablokować otwarcia okna — trudno, stanie domyślnie.
    return null;
  }
}

function writePlacement(windowKey: string, placement: WindowPlacement): void {
  const key = storageKey(windowKey);
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(placement));
  } catch {
    // Prywatne okno przeglądarki albo pełny dysk. Okno działa, tylko nie pamięta.
  }
}

/**
 * Sprowadza okno z powrotem na ekran. Wołane przy otwarciu i przy każdej
 * zmianie rozmiaru przeglądarki, bo zapisana pozycja pochodzi z monitora,
 * którego już może nie być.
 *
 * `measured` to zmierzony rozmiar okna — znany dopiero po pierwszym
 * wyrenderowaniu, bo dopóki nikt nie rozciągnął okna, jego szerokość zna sam
 * CSS. Gdy jest, okno wraca **całe**: pierwsza wersja tej funkcji trzymała się
 * samego progu „120 px belki na ekranie" i sprowadzała okno z x = 9000
 * do x = innerWidth − 120, czyli do paska widocznego rogiem. Formalnie
 * na ekranie, praktycznie nie do przeczytania.
 */
export function clampPlacement(
  placement: WindowPlacement,
  measured?: { width: number; height: number },
): WindowPlacement {
  const width = placement.width
    ? Math.min(placement.width, Math.max(MIN_WIDTH, window.innerWidth - 16))
    : undefined;
  const height = placement.height
    ? Math.min(placement.height, Math.max(MIN_HEIGHT, window.innerHeight - 16))
    : undefined;
  // Okno większe od okna przeglądarki i tak nie zmieści się w całości —
  // wtedy zostaje próg „róg zawsze do złapania".
  const room = (span: number | undefined, viewport: number, keep: number) =>
    span === undefined ? viewport - keep : Math.max(0, viewport - span);
  return {
    x: Math.max(
      0,
      Math.min(room(width ?? measured?.width, window.innerWidth, KEEP_VISIBLE_X), placement.x),
    ),
    y: Math.max(
      0,
      Math.min(room(height ?? measured?.height, window.innerHeight, KEEP_VISIBLE_Y), placement.y),
    ),
    width,
    height,
  };
}

export interface FloatingWindow {
  /** Na `<section>` okna — z niego bierze się rozmiar startowy przy skalowaniu. */
  ref: RefObject<HTMLElement | null>;
  /** `left`/`top`, a po rozciągnięciu także `width`/`height`. */
  style: CSSProperties;
  /** Na belkę okna. */
  dragProps: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  };
  /** Na uchwyt w prawym dolnym rogu (`<WindowResizeGrip />`). */
  resizeProps: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  };
}

interface DragState {
  pointerX: number;
  pointerY: number;
  baseX: number;
  baseY: number;
}

interface ResizeState {
  pointerX: number;
  pointerY: number;
  baseWidth: number;
  baseHeight: number;
}

/**
 * @param windowKey  Tożsamość okna w pamięci: `settings`, `sheet:<id>`,
 *                   `handout:<id>`. Karta konkretnej postaci wraca tam, gdzie
 *                   ją zostawiono, a nie tam, gdzie stała ostatnia karta.
 * @param fallback   Gdzie postawić okno otwierane po raz pierwszy. Liczone
 *                   leniwie, bo zwykle zależy od `window.innerWidth`.
 */
export function useWindowPlacement(
  windowKey: string,
  fallback: () => { x: number; y: number },
): FloatingWindow {
  const ref = useRef<HTMLElement | null>(null);
  const [placement, setPlacement] = useState<WindowPlacement>(() =>
    clampPlacement(readPlacement(windowKey) ?? fallback()),
  );
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  /**
   * Kopia stanu do odczytu z uchwytów zdarzeń. Aktualizator `setState` bywa
   * w trybie ścisłym wołany dwa razy, więc nie jest miejscem na skutki uboczne
   * — a moment wciśnięcia i puszczenia uchwytu potrzebuje *bieżącej* pozycji.
   */
  const placementRef = useRef(placement);
  const apply = useCallback((next: WindowPlacement) => {
    placementRef.current = next;
    setPlacement(next);
  }, []);

  /**
   * Zapis idzie na puszczenie uchwytu, nie na każdą klatkę ruchu: przeciągnięcie
   * okna przez ekran to ~200 zdarzeń, a `localStorage` jest synchroniczny.
   */
  const remember = useCallback(
    (next: WindowPlacement) => {
      writePlacement(windowKey, next);
    },
    [windowKey],
  );

  /** Zmierzony rozmiar okna — dopiero on pozwala sprowadzić je na ekran w całości. */
  const measure = useCallback(() => {
    const box = ref.current?.getBoundingClientRect();
    return box ? { width: box.width, height: box.height } : undefined;
  }, []);

  useEffect(() => {
    // Pierwszy przebieg zaraz po wyrenderowaniu: zapis mógł przyjechać
    // z większego monitora i wskazywać miejsce, w którym okna dziś nie widać.
    apply(clampPlacement(placementRef.current, measure()));
    const onResize = () => apply(clampPlacement(placementRef.current, measure()));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [apply, measure]);

  const startDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    // Przyciski i pola w belce zachowują się normalnie — belka karty postaci
    // nosi imię do edycji i ✕ do zamknięcia.
    if ((event.target as HTMLElement).closest('button, input, a, select, textarea')) return;
    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      baseX: placementRef.current.x,
      baseY: placementRef.current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const moveDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      apply(
        clampPlacement(
          {
            ...placementRef.current,
            x: drag.baseX + event.clientX - drag.pointerX,
            y: drag.baseY + event.clientY - drag.pointerY,
          },
          measure(),
        ),
      );
    },
    [apply, measure],
  );

  const endDrag = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    remember(placementRef.current);
  }, [remember]);

  const startResize = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    // Rozmiar startowy bierze się z **wyrenderowanego** okna, nie z zapisu:
    // dopóki nikt nie rozciągnął okna, jego szerokość zna wyłącznie CSS
    // (`width: min(680px, 100vw - 24px)`).
    resizeRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      baseWidth: box.width,
      baseHeight: box.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    // Uchwyt siedzi w rogu okna, które zwykle nasłuchuje kliknięcia (wysunięcie
    // na wierzch); samo skalowanie nie jest kliknięciem w treść.
    event.stopPropagation();
  }, []);

  const moveResize = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const resize = resizeRef.current;
      if (!resize) return;
      apply(
        clampPlacement({
          ...placementRef.current,
          width: Math.max(MIN_WIDTH, resize.baseWidth + event.clientX - resize.pointerX),
          height: Math.max(MIN_HEIGHT, resize.baseHeight + event.clientY - resize.pointerY),
        }),
      );
    },
    [apply],
  );

  const endResize = useCallback(() => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    remember(placementRef.current);
  }, [remember]);

  /**
   * `maxWidth`/`maxHeight` znikają dopiero wtedy, gdy okno ma własny rozmiar.
   * Bez tego `max-height: min(78vh, 860px)` z arkusza przycinałoby okno
   * rozciągnięte na pełny ekran i uchwyt uciekałby spod kursora.
   */
  const style: CSSProperties = { left: placement.x, top: placement.y };
  if (placement.width !== undefined) {
    style.width = placement.width;
    style.maxWidth = 'none';
  }
  if (placement.height !== undefined) {
    style.height = placement.height;
    style.maxHeight = 'none';
  }

  return {
    ref,
    style,
    dragProps: {
      onPointerDown: startDrag,
      onPointerMove: moveDrag,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
    resizeProps: {
      onPointerDown: startResize,
      onPointerMove: moveResize,
      onPointerUp: endResize,
      onPointerCancel: endResize,
    },
  };
}
