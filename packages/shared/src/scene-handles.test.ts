import { describe, expect, it } from 'vitest';
import {
  SCENE_MIN_EXTENT_PX,
  dragSceneShape,
  pickSceneHandle,
  sceneHandleCursor,
  sceneHandlesOf,
  snapScenePoint,
  type SceneObjectShape,
} from './scene-handles.js';

const rect: SceneObjectShape = { form: 'rect', x: 100, y: 200, width: 300, height: 100 };
const segment: SceneObjectShape = { form: 'segment', x1: 0, y1: 0, x2: 400, y2: 0 };
const marker: SceneObjectShape = { form: 'point', x: 500, y: 500 };

const grid = { sizePx: 100, offsetX: 0, offsetY: 0 };
const snapToGrid = (point: { x: number; y: number }) => snapScenePoint(point, grid);

describe('sceneHandlesOf', () => {
  it('daje prostokątowi cztery rogi', () => {
    expect(sceneHandlesOf(rect)).toEqual([
      { id: 'nw', x: 100, y: 200 },
      { id: 'ne', x: 400, y: 200 },
      { id: 'sw', x: 100, y: 300 },
      { id: 'se', x: 400, y: 300 },
    ]);
  });

  it('daje odcinkowi dwie końcówki', () => {
    expect(sceneHandlesOf(segment)).toEqual([
      { id: 'start', x: 0, y: 0 },
      { id: 'end', x: 400, y: 0 },
    ]);
  });

  it('nie daje punktowi żadnego — sam znak jest uchwytem', () => {
    expect(sceneHandlesOf(marker)).toEqual([]);
    expect(pickSceneHandle(marker, { x: 504, y: 497 }, 12)).toBe('move');
    expect(pickSceneHandle(marker, { x: 540, y: 500 }, 12)).toBeNull();
  });
});

describe('pickSceneHandle', () => {
  it('róg wygrywa z wnętrzem — inaczej nic nie dałoby się przeskalować', () => {
    // Punkt leży i w promieniu rogu, i wewnątrz prostokąta.
    expect(pickSceneHandle(rect, { x: 103, y: 203 }, 12)).toBe('nw');
  });

  it('wnętrze prostokąta przesuwa', () => {
    expect(pickSceneHandle(rect, { x: 250, y: 250 }, 12)).toBe('move');
  });

  it('poza obrysem z marginesem nie łapie nic', () => {
    expect(pickSceneHandle(rect, { x: 250, y: 320 }, 12)).toBeNull();
  });

  it('cienki pasek strefy ma co złapać dzięki marginesowi', () => {
    const strip: SceneObjectShape = { form: 'rect', x: 0, y: 0, width: 400, height: 8 };
    expect(pickSceneHandle(strip, { x: 200, y: 4 }, 12)).toBe('move');
  });

  it('linia ściany łapie się z marginesem, bo ma zero szerokości', () => {
    expect(pickSceneHandle(segment, { x: 200, y: 6 }, 12)).toBe('move');
    expect(pickSceneHandle(segment, { x: 200, y: 40 }, 12)).toBeNull();
    expect(pickSceneHandle(segment, { x: 3, y: 3 }, 12)).toBe('start');
  });
});

describe('dragSceneShape — przesuwanie', () => {
  it('przesuwa prostokąt bez zmiany rozmiaru i przyciąga lewy górny róg', () => {
    const moved = dragSceneShape(
      rect,
      'move',
      { x: 340, y: 260 },
      {
        origin: { x: 250, y: 250 },
        snap: snapToGrid,
      },
    );
    expect(moved).toEqual({ form: 'rect', x: 200, y: 200, width: 300, height: 100 });
  });

  it('przesuwa odcinek sztywno — druga końcówka idzie o tyle samo', () => {
    const diagonal: SceneObjectShape = { form: 'segment', x1: 10, y1: 10, x2: 210, y2: 130 };
    const moved = dragSceneShape(
      diagonal,
      'move',
      { x: 120, y: 90 },
      {
        origin: { x: 10, y: 10 },
        snap: snapToGrid,
      },
    );
    // Pierwsza końcówka ląduje na przecięciu (100, 100); druga zachowuje wektor.
    expect(moved).toEqual({ form: 'segment', x1: 100, y1: 100, x2: 300, y2: 220 });
  });

  it('przesuwa punkt na przecięcie kratki', () => {
    const moved = dragSceneShape(
      marker,
      'move',
      { x: 640, y: 460 },
      {
        origin: { x: 500, y: 500 },
        snap: snapToGrid,
      },
    );
    expect(moved).toEqual({ form: 'point', x: 600, y: 500 });
  });

  it('honoruje przesunięcie kratki', () => {
    const offset = { sizePx: 100, offsetX: 30, offsetY: 30 };
    expect(snapScenePoint({ x: 128, y: 35 }, offset)).toEqual({ x: 130, y: 30 });
  });

  it('bez kratki zaokrągla do piksela', () => {
    expect(snapScenePoint({ x: 12.4, y: 88.7 }, null)).toEqual({ x: 12, y: 89 });
    expect(snapScenePoint({ x: 12.4, y: 88.7 }, { sizePx: 0 })).toEqual({ x: 12, y: 89 });
  });
});

describe('dragSceneShape — skalowanie prostokąta', () => {
  it('trzyma róg naprzeciwko w miejscu', () => {
    const scaled = dragSceneShape(
      rect,
      'se',
      { x: 590, y: 410 },
      {
        origin: { x: 400, y: 300 },
        snap: snapToGrid,
      },
    );
    expect(scaled).toEqual({ form: 'rect', x: 100, y: 200, width: 500, height: 200 });
  });

  it('ciągnięty w lewo górny róg zmienia początek, nie rozmiar ujemny', () => {
    const scaled = dragSceneShape(
      rect,
      'nw',
      { x: -10, y: 90 },
      {
        origin: { x: 100, y: 200 },
        snap: snapToGrid,
      },
    );
    expect(scaled).toEqual({ form: 'rect', x: 0, y: 100, width: 400, height: 200 });
  });

  it('przeciągnięcie rogu przez przeciwległy odwraca prostokąt', () => {
    const scaled = dragSceneShape(
      rect,
      'nw',
      { x: 600, y: 500 },
      {
        origin: { x: 100, y: 200 },
        snap: snapToGrid,
      },
    );
    expect(scaled).toEqual({ form: 'rect', x: 400, y: 300, width: 200, height: 200 });
  });

  it('nie schodzi poniżej minimum przyjmowanego przez serwer', () => {
    const scaled = dragSceneShape(
      rect,
      'se',
      { x: 400, y: 300 },
      {
        origin: { x: 400, y: 300 },
        snap: (point) => point,
        minExtent: SCENE_MIN_EXTENT_PX,
      },
    ) as Extract<SceneObjectShape, { form: 'rect' }>;
    expect(scaled.width).toBeGreaterThanOrEqual(SCENE_MIN_EXTENT_PX);
    expect(scaled.height).toBeGreaterThanOrEqual(SCENE_MIN_EXTENT_PX);
  });
});

describe('dragSceneShape — końcówki odcinka', () => {
  it('rusza tylko złapaną końcówkę', () => {
    const moved = dragSceneShape(
      segment,
      'end',
      { x: 420, y: 190 },
      {
        origin: { x: 400, y: 0 },
        snap: snapToGrid,
      },
    );
    expect(moved).toEqual({ form: 'segment', x1: 0, y1: 0, x2: 400, y2: 200 });
  });

  it('i tę drugą też', () => {
    const moved = dragSceneShape(
      segment,
      'start',
      { x: 90, y: -20 },
      {
        origin: { x: 0, y: 0 },
        snap: snapToGrid,
      },
    );
    expect(moved).toEqual({ form: 'segment', x1: 100, y1: 0, x2: 400, y2: 0 });
  });
});

describe('sceneHandleCursor', () => {
  it('daje każdemu uchwytowi kursor, który przeglądarka rozumie', () => {
    expect(sceneHandleCursor('move')).toBe('move');
    expect(sceneHandleCursor('nw')).toBe('nwse-resize');
    expect(sceneHandleCursor('ne')).toBe('nesw-resize');
    expect(sceneHandleCursor('start')).toBe('grab');
  });
});
