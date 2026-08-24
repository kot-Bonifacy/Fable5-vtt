/**
 * Uchwyty zaznaczonego obiektu sceny (etap 27l) — przesuwanie i skalowanie.
 *
 * 27k dało jeden gest na kasowanie („warstwa → klik → `Delete`"); ten plik jest
 * geometrią drugiej połowy tej samej umowy: **klik zaznacza, przeciągnięcie
 * zaznaczonego przesuwa** (rozstrzygnięcie MG z 24.08). Wcześniej źle
 * postawiona osłona kasowała się i stawiała od nowa, bo nic na mapie nie dawało
 * się złapać po fakcie.
 *
 * Tak jak `scene-objects.ts`, to jest sama arytmetyka: bez Pixi, bez store'ów
 * i bez zdarzeń. Renderer pyta „co jest pod kursorem i gdzie to wyląduje", a
 * odpowiedź jest ta sama u klienta, w teście i (dla granic rozmiaru) na
 * serwerze.
 *
 * Siedem rodzajów obiektów sprowadza się tutaj do **trzech kształtów**:
 * punktu (lampa, gniazdo, pinezka), prostokąta (osłona, strefa, rysunek) i
 * odcinka (ściana). Nazwa rodzaju w ogóle tu nie wchodzi — kwadrat skaluje się
 * tak samo, czy jest samochodem, czy podłogą pod napięciem.
 */

import type { ScenePoint } from './measure.js';
import type { Rect } from './rects.js';
import { isPointInRect } from './rects.js';

/**
 * Który uchwyt trzyma kursor.
 *
 * `move` nie jest kwadracikiem na obrysie: to całe wnętrze (prostokąt), cała
 * linia (odcinek) albo sam znak (punkt). Rogi noszą nazwy stron świata, jak
 * `cursor: nwse-resize` w CSS, a końcówki odcinka są `start`/`end`, bo ściana
 * nie ma góry ani dołu.
 */
export const SCENE_HANDLE_IDS = ['move', 'nw', 'ne', 'sw', 'se', 'start', 'end'] as const;
export type SceneHandleId = (typeof SCENE_HANDLE_IDS)[number];

/** Kształt zaznaczonego obiektu — trzy przypadki na siedem rodzajów. */
export type SceneObjectShape =
  | { form: 'point'; x: number; y: number }
  | ({ form: 'rect' } & Rect)
  | { form: 'segment'; x1: number; y1: number; x2: number; y2: number };

/** Jeden uchwyt do narysowania: gdzie stoi i czym jest. */
export interface SceneHandle {
  id: SceneHandleId;
  x: number;
  y: number;
}

/**
 * Bok kwadracika uchwytu w pikselach **ekranu** — renderer mnoży go przez
 * `overlayScale()`, więc przy oddaleniu 0,18× uchwyt nadal daje się trafić.
 * Dziesięć pikseli to mniej niż pierścień zaznaczonej figury obok i tyle, ile
 * ma uchwyt skalowania okna (`WindowResizeGrip`).
 */
export const SCENE_HANDLE_SIZE_PX = 10;

/**
 * Najmniejszy prostokąt, do jakiego wolno ścisnąć obiekt, w pikselach sceny.
 *
 * Ta sama liczba, którą serwer trzyma jako `COVER_MIN_SIZE_PX` i
 * `ZONE_MIN_SIZE_PX`: uchwyt, który pozwala zjechać poniżej granicy przyjętej
 * przez serwer, kończy się cichą odmową w połowie gestu.
 */
export const SCENE_MIN_EXTENT_PX = 8;

/**
 * Rogi prostokąta albo końce odcinka. Punkt nie ma uchwytów — sam znak jest
 * całym uchwytem, bo lampa nie ma czego skalować, a kwadracik obok ikony byłby
 * mniejszym celem niż ona sama.
 */
export function sceneHandlesOf(shape: SceneObjectShape): SceneHandle[] {
  if (shape.form === 'point') return [];
  if (shape.form === 'segment') {
    return [
      { id: 'start', x: shape.x1, y: shape.y1 },
      { id: 'end', x: shape.x2, y: shape.y2 },
    ];
  }
  const right = shape.x + shape.width;
  const bottom = shape.y + shape.height;
  return [
    { id: 'nw', x: shape.x, y: shape.y },
    { id: 'ne', x: right, y: shape.y },
    { id: 'sw', x: shape.x, y: bottom },
    { id: 'se', x: right, y: bottom },
  ];
}

/**
 * Co kursor złapał: uchwyt skalowania, uchwyt przesuwania, czy nic.
 *
 * Rogi wygrywają z wnętrzem i to jest cała reguła pierwszeństwa: uchwyt leży
 * **na** obrysie, więc gdyby wnętrze sprawdzało się pierwsze, prostokąta nie
 * dałoby się nigdy przeskalować — każde złapanie rogu byłoby przesunięciem.
 *
 * `tolerance` jest w pikselach **sceny** (renderer przelicza z ekranu), i tą
 * samą liczbą mierzy się grubość odcinka: ściana ma zero szerokości, więc bez
 * marginesu „kliknij w linię" nie jest czynnością do wykonania.
 */
export function pickSceneHandle(
  shape: SceneObjectShape,
  point: ScenePoint,
  tolerance: number,
): SceneHandleId | null {
  for (const handle of sceneHandlesOf(shape)) {
    if (Math.hypot(point.x - handle.x, point.y - handle.y) <= tolerance) return handle.id;
  }
  if (shape.form === 'point') {
    return Math.hypot(point.x - shape.x, point.y - shape.y) <= tolerance ? 'move' : null;
  }
  if (shape.form === 'segment') {
    return distanceToSegment(point, shape) <= tolerance ? 'move' : null;
  }
  // Prostokąt łapie się za wnętrze — i celowo także tuż za obrysem, bo cienki
  // pasek strefy o wysokości 8 px inaczej nie miałby środka do trafienia.
  const grown: Rect = {
    x: shape.x - tolerance,
    y: shape.y - tolerance,
    width: shape.width + tolerance * 2,
    height: shape.height + tolerance * 2,
  };
  return isPointInRect(grown, point) ? 'move' : null;
}

function distanceToSegment(
  point: ScenePoint,
  segment: { x1: number; y1: number; x2: number; y2: number },
): number {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - segment.x1, point.y - segment.y1);
  const raw = ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / lengthSq;
  const t = Math.min(1, Math.max(0, raw));
  return Math.hypot(point.x - (segment.x1 + t * dx), point.y - (segment.y1 + t * dy));
}

/**
 * Przyciąganie do przecięcia kratki (decyzja MG z 24.08: domyślnie tak,
 * `Ctrl` na czas gestu wyłącza).
 *
 * Do **przecięć**, nie do środków pól, bo obiekty mapy leżą wzdłuż krawędzi
 * kwadratów: ściana biegnie po krawędzi, osłona wypełnia całe pole. Figury
 * przyciągają się inaczej (`snapTokenToGrid`) i to jest właściwa różnica —
 * żeton stoi *w* polu.
 *
 * `offset` to przesunięcie kratki ze sceny: kratka narysowana od 30 px musi
 * przyciągać do 30, 130, 230…, inaczej „przy kratce" znaczy „obok kratki".
 */
export function snapScenePoint(
  point: ScenePoint,
  grid: { sizePx: number; offsetX?: number; offsetY?: number } | null,
): ScenePoint {
  const size = grid?.sizePx;
  if (size === undefined || !Number.isFinite(size) || size <= 0) {
    return { x: Math.round(point.x), y: Math.round(point.y) };
  }
  const ox = grid?.offsetX ?? 0;
  const oy = grid?.offsetY ?? 0;
  return {
    x: Math.round((point.x - ox) / size) * size + ox,
    y: Math.round((point.y - oy) / size) * size + oy,
  };
}

/**
 * Gdzie obiekt wyląduje po przeciągnięciu uchwytu.
 *
 * Bierze **punkt docelowy**, nie sam wektor przesunięcia, bo przyciąganie
 * dotyczy miejsca, w którym coś ma stanąć, a nie długości ruchu ręki. Przy
 * `move` prostokąta i odcinka przyciąga się jeden wybrany punkt (lewy górny
 * róg, pierwsza końcówka), a reszta figury jedzie za nim sztywno — inaczej
 * przesunięcie deformowałoby kształt.
 *
 * `snap` jest funkcją, a nie flagą, bo końcówka ściany przyciąga się do
 * **końcówek innych ścian** przed kratką (`snapWallPoint`), a osłona nie ma
 * takiego odpowiednika. Wywołujący wie, co trzyma.
 */
export function dragSceneShape(
  shape: SceneObjectShape,
  handle: SceneHandleId,
  target: ScenePoint,
  options: {
    /** Punkt startu gestu — różnica względem niego jest przesunięciem. */
    origin: ScenePoint;
    snap?: (point: ScenePoint) => ScenePoint;
    /** Najmniejszy bok prostokąta; poniżej niego serwer i tak odmówi. */
    minExtent?: number;
  },
): SceneObjectShape {
  const snap =
    options.snap ?? ((point: ScenePoint) => ({ x: Math.round(point.x), y: Math.round(point.y) }));
  const minExtent = options.minExtent ?? SCENE_MIN_EXTENT_PX;
  const dx = target.x - options.origin.x;
  const dy = target.y - options.origin.y;

  if (shape.form === 'point') {
    const moved = snap({ x: shape.x + dx, y: shape.y + dy });
    return { form: 'point', x: moved.x, y: moved.y };
  }

  if (shape.form === 'segment') {
    if (handle === 'start' || handle === 'end') {
      const held = handle === 'start' ? { x: shape.x1, y: shape.y1 } : { x: shape.x2, y: shape.y2 };
      const moved = snap({ x: held.x + dx, y: held.y + dy });
      return handle === 'start'
        ? { form: 'segment', x1: moved.x, y1: moved.y, x2: shape.x2, y2: shape.y2 }
        : { form: 'segment', x1: shape.x1, y1: shape.y1, x2: moved.x, y2: moved.y };
    }
    // Cały odcinek: przyciąga się pierwsza końcówka, druga jedzie za nią o tyle
    // samo. Przyciąganie obu osobno wykrzywiłoby ścianę postawioną pod kątem.
    const moved = snap({ x: shape.x1 + dx, y: shape.y1 + dy });
    const shiftX = moved.x - shape.x1;
    const shiftY = moved.y - shape.y1;
    return {
      form: 'segment',
      x1: shape.x1 + shiftX,
      y1: shape.y1 + shiftY,
      x2: shape.x2 + shiftX,
      y2: shape.y2 + shiftY,
    };
  }

  if (handle === 'move') {
    const moved = snap({ x: shape.x + dx, y: shape.y + dy });
    return { form: 'rect', x: moved.x, y: moved.y, width: shape.width, height: shape.height };
  }

  // Skalowanie: róg naprzeciwko stoi w miejscu i to on jest kotwicą. Dzięki
  // temu przeciągnięcie rogu **przez** przeciwległy odwraca prostokąt zamiast
  // ścisnąć go do zera — tak samo jak rysowanie osłony ruchem w lewo w górę.
  const right = shape.x + shape.width;
  const bottom = shape.y + shape.height;
  const anchor = {
    x: handle === 'nw' || handle === 'sw' ? right : shape.x,
    y: handle === 'nw' || handle === 'ne' ? bottom : shape.y,
  };
  const held = {
    x: handle === 'nw' || handle === 'sw' ? shape.x : right,
    y: handle === 'nw' || handle === 'ne' ? shape.y : bottom,
  };
  const moved = snap({ x: held.x + dx, y: held.y + dy });
  const x = Math.min(anchor.x, moved.x);
  const y = Math.min(anchor.y, moved.y);
  return {
    form: 'rect',
    x,
    y,
    width: Math.max(minExtent, Math.abs(moved.x - anchor.x)),
    height: Math.max(minExtent, Math.abs(moved.y - anchor.y)),
  };
}

/**
 * Jak ma wyglądać kursor nad danym uchwytem. Zwykłe nazwy CSS, bo to jedyna
 * rzecz, którą przeglądarka rozumie bez tłumaczenia — a kursor jest tu jedyną
 * podpowiedzią „to da się złapać" przed pierwszym przeciągnięciem.
 */
export function sceneHandleCursor(handle: SceneHandleId): string {
  switch (handle) {
    case 'move':
      return 'move';
    case 'nw':
    case 'se':
      return 'nwse-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'start':
    case 'end':
      return 'grab';
  }
}
