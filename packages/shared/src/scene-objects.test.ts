import { describe, expect, it } from 'vitest';
import {
  SCENE_OBJECT_KINDS,
  pickSceneObject,
  sceneObjectCountLabel,
  sceneObjectTolerance,
} from './scene-objects.js';
import { wallEndpointNear } from './walls.js';
import type { WallView } from './walls.js';
import type { CoverView } from './covers.js';
import type { DefenseZoneView } from './zones.js';
import type { DrawingView } from './drawings.js';

/**
 * Etap 27k — co jest pod kursorem na uzbrojonej warstwie.
 *
 * Scena testowa ma kratkę 100 px, a wszystko leży **na sobie**, w jednym rogu:
 * to jedyny sposób, żeby pytanie o pierwszeństwo warstw miało sens.
 *
 *     (200,200) ┌──────────────┐ (400,400)
 *               │ osłona       │      strefa: (150,150)–(450,450)
 *               │  ┌────┐      │      rysunek (prostokąt): (250,250)–(350,350)
 *               │  │    │      │      ściana: (200,200)–(400,200)
 *               │  └────┘      │      lampa: (300,300)
 *               └──────────────┘      gniazdo: (320,300)
 */

const GRID = 100;

const wall: WallView = {
  id: 1,
  sceneId: 's',
  kind: 'wall',
  open: false,
  playerToggle: false,
  locked: false,
  x1: 200,
  y1: 200,
  x2: 400,
  y2: 200,
};

const cover: CoverView = {
  id: 10,
  sceneId: 's',
  typeId: 'car',
  name: 'Samochód',
  x: 200,
  y: 200,
  width: 200,
  height: 200,
  hpMax: 25,
  hpCurrent: 25,
};

const zone: DefenseZoneView = {
  id: 20,
  sceneId: 's',
  entryId: 'defense.podloga',
  name: 'Podłoga',
  x: 150,
  y: 150,
  width: 300,
  height: 300,
  armed: true,
  hidden: false,
  hpMax: 0,
  hpCurrent: 0,
};

const drawing: DrawingView = {
  id: 30,
  sceneId: 's',
  authorId: 'gm',
  authorName: 'MG',
  gmOnly: false,
  shape: { kind: 'rect', x: 250, y: 250, width: 100, height: 100 },
  style: { color: '#ffffff', width: 4, filled: true },
};

const playerDrawing: DrawingView = {
  ...drawing,
  id: 31,
  authorId: 'avatar9',
  authorName: 'Gracz',
};

const light = { id: 40, x: 300, y: 300 };
const netpoint = { id: 50, x: 320, y: 300 };
const note = { id: 'n1', x: 320, y: 300 };

const ALL = {
  walls: [wall],
  covers: [cover],
  zones: [zone],
  drawings: [drawing],
  lights: [light],
  netpoints: [netpoint],
  notes: [note],
};

describe('pickSceneObject — warstwa decyduje, co wolno złapać', () => {
  it('narzędzie widzi wyłącznie własny rodzaj, choćby leżało pod nim pięć innych', () => {
    // Punkt (300,300) leży w osłonie, w strefie, w rysunku i na lampie naraz.
    const point = { x: 300, y: 300 };
    expect(pickSceneObject(point, { covers: [cover] }, { gridSizePx: GRID })).toEqual({
      kind: 'cover',
      id: 10,
    });
    expect(pickSceneObject(point, { zones: [zone] }, { gridSizePx: GRID })).toEqual({
      kind: 'zone',
      id: 20,
    });
    expect(pickSceneObject(point, { lights: [light] }, { gridSizePx: GRID })).toEqual({
      kind: 'light',
      id: 40,
    });
  });

  it('gdy warstw jest kilka, wygrywa ta rysowana najwyżej', () => {
    // Pinezka nad gniazdem, gniazdo nad lampą, lampa nad ścianą, ściana nad
    // strefą, strefa nad osłoną, osłona nad rysunkiem.
    expect(pickSceneObject({ x: 320, y: 300 }, ALL, { gridSizePx: GRID })).toEqual({
      kind: 'note',
      id: 'n1',
    });
    const withoutNotes = { ...ALL, notes: [] };
    expect(pickSceneObject({ x: 320, y: 300 }, withoutNotes, { gridSizePx: GRID })).toEqual({
      kind: 'netpoint',
      id: 50,
    });
    const withoutMarkers = { ...withoutNotes, netpoints: [], lights: [] };
    // (320,300) jest 100 px pod ścianą — poza jej promieniem 20 px — więc
    // pierwszy trafiony jest prostokąt strefy.
    expect(pickSceneObject({ x: 320, y: 300 }, withoutMarkers, { gridSizePx: GRID })).toEqual({
      kind: 'zone',
      id: 20,
    });
  });

  it('pusty punkt to null, a nie przypadkowy najbliższy obiekt', () => {
    expect(pickSceneObject({ x: 900, y: 900 }, ALL, { gridSizePx: GRID })).toBeNull();
  });

  it('gracz sięga przez cudzą kreskę do własnej pod nią', () => {
    const point = { x: 300, y: 300 };
    const drawings = [drawing, playerDrawing];
    expect(
      pickSceneObject(
        point,
        { drawings },
        { gridSizePx: GRID, canPickDrawing: (entry) => entry.authorId === 'avatar9' },
      ),
    ).toEqual({ kind: 'drawing', id: 31 });
    // Bez filtru wygrywa nowszy rysunek — ten, który leży na wierzchu.
    expect(pickSceneObject(point, { drawings }, { gridSizePx: GRID })).toEqual({
      kind: 'drawing',
      id: 31,
    });
    // A gracz, który nie narysował niczego, nie łapie nic.
    expect(
      pickSceneObject(point, { drawings }, { gridSizePx: GRID, canPickDrawing: () => false }),
    ).toBeNull();
  });

  it('promień chwytania rośnie z kratką — inaczej przy oddaleniu nie da się trafić', () => {
    expect(sceneObjectTolerance('wall', 100)).toBe(20);
    expect(sceneObjectTolerance('wall', 20)).toBe(8);
    // Prostokąty trafia się wnętrzem, więc żadnego marginesu nie mają.
    expect(sceneObjectTolerance('cover', 100)).toBe(0);
    expect(sceneObjectTolerance('zone', 100)).toBe(0);
  });

  it('każdy rodzaj ma promień — nowy wpis w liście nie przejdzie bez niego', () => {
    for (const kind of SCENE_OBJECT_KINDS) {
      expect(Number.isFinite(sceneObjectTolerance(kind, GRID))).toBe(true);
    }
  });
});

describe('wallEndpointNear — końcówka rysuje, środek zaznacza', () => {
  it('klik przy narożniku oddaje ten narożnik', () => {
    expect(wallEndpointNear([wall], { x: 205, y: 203 })).toEqual({ x: 200, y: 200 });
    expect(wallEndpointNear([wall], { x: 398, y: 200 })).toEqual({ x: 400, y: 200 });
  });

  it('klik w środek segmentu nie jest końcówką, choć trafia w ścianę', () => {
    const middle = { x: 300, y: 200 };
    expect(wallEndpointNear([wall], middle)).toBeNull();
    // …i właśnie dlatego ta sama współrzędna zaznacza ścianę.
    expect(pickSceneObject(middle, { walls: [wall] }, { gridSizePx: GRID })).toEqual({
      kind: 'wall',
      id: 1,
    });
  });
});

describe('sceneObjectCountLabel — polskie formy liczby', () => {
  it('jedna, kilka, wiele', () => {
    expect(sceneObjectCountLabel('wall', 1)).toBe('ścianę');
    expect(sceneObjectCountLabel('wall', 3)).toBe('3 ściany');
    expect(sceneObjectCountLabel('wall', 7)).toBe('7 ścian');
  });

  it('nastki idą z formą dopełniaczową, nie mianownikową', () => {
    expect(sceneObjectCountLabel('cover', 12)).toBe('12 osłon');
    expect(sceneObjectCountLabel('cover', 14)).toBe('14 osłon');
    expect(sceneObjectCountLabel('cover', 22)).toBe('22 osłony');
  });
});
