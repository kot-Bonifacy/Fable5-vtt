import { describe, expect, it } from 'vitest';
import { WALL_REACH_M, isWallWithinReach, sightSegmentsFor, type WallView } from './walls.js';
import { computeVisionPolygon, isPointInPolygon, sceneBoundsSegments } from './vision.js';

/**
 * Stage 18d: arm's reach, and the net curtain in a window.
 *
 * Both are one idea in two places — a door and a window are objects standing in a
 * room, and how far away you are decides what you can do with them. The geometry
 * lives here so the server can be tested for what it *sends* rather than for what
 * it computes; `server/walls.test.ts` does that half over live sockets.
 *
 * The shared floor plan: a 1000×1000 map with a room in its north-east corner
 * whose south wall is solid and whose west wall is a window. „Inside" is around
 * (700, 300), the street is to the west.
 *
 *         400         900
 *   100    ┌───────────┐
 *          ┊           │      ┊ = the window (x = 400, y 100…500)
 *   300    ┊   inside  │
 *          ┊           │
 *   500    └───────────┘
 */

const BOUNDS = { width: 1000, height: 1000 };
/** One metre is fifty pixels on this map, so arm's reach is 100 px. */
const REACH_PX = WALL_REACH_M * 50;

function makeWall(
  id: number,
  kind: WallView['kind'],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  extra: Partial<WallView> = {},
): WallView {
  return {
    id,
    sceneId: 's',
    kind,
    open: false,
    playerToggle: false,
    locked: false,
    x1,
    y1,
    x2,
    y2,
    ...extra,
  };
}

const WINDOW = makeWall(1, 'window', 400, 100, 400, 500);
const PLAN: WallView[] = [
  makeWall(2, 'wall', 400, 100, 900, 100),
  makeWall(3, 'wall', 900, 100, 900, 500),
  makeWall(4, 'wall', 900, 500, 400, 500),
  WINDOW,
];

/** What one observer can see, with the curtain rule applied at `reachPx`. */
function seeFrom(origin: { x: number; y: number }, curtainReachPx: number | null) {
  const segments = [
    ...sightSegmentsFor(PLAN, origin, { curtainReachPx }),
    ...sceneBoundsSegments(BOUNDS),
  ];
  return computeVisionPolygon(origin, segments, null);
}

describe('sightSegmentsFor — the net curtain', () => {
  it('makes a window a blocker for anyone standing away from it', () => {
    const fromStreet = { x: 200, y: 300 };
    const segments = sightSegmentsFor(PLAN, fromStreet, { curtainReachPx: REACH_PX });
    expect(segments).toHaveLength(4);
    expect(segments).toContainEqual({ x1: 400, y1: 100, x2: 400, y2: 500 });
    // …and the room behind it is genuinely out of the polygon, not merely dim.
    expect(isPointInPolygon({ x: 700, y: 300 }, seeFrom(fromStreet, REACH_PX))).toBe(false);
  });

  it('opens the window once the observer walks up to it', () => {
    // 2 m from the pane in a scene where a metre is fifty pixels.
    const atTheGlass = { x: 320, y: 300 };
    const segments = sightSegmentsFor(PLAN, atTheGlass, { curtainReachPx: REACH_PX });
    expect(segments).toHaveLength(3);
    expect(isPointInPolygon({ x: 700, y: 300 }, seeFrom(atTheGlass, REACH_PX))).toBe(true);
  });

  it('is symmetric — someone inside has to walk up to the window too', () => {
    const deepInside = { x: 800, y: 300 };
    const atTheGlass = { x: 480, y: 300 };
    expect(isPointInPolygon({ x: 200, y: 300 }, seeFrom(deepInside, REACH_PX))).toBe(false);
    expect(isPointInPolygon({ x: 200, y: 300 }, seeFrom(atTheGlass, REACH_PX))).toBe(true);
  });

  it('measures to the nearest point of the pane, so a shop front opens whole', () => {
    // Level with the far end of the window rather than with its middle: one
    // window is one object, and standing at its edge is standing at it.
    const atTheEnd = { x: 350, y: 130 };
    expect(sightSegmentsFor(PLAN, atTheEnd, { curtainReachPx: REACH_PX })).not.toContainEqual({
      x1: 400,
      y1: 100,
      x2: 400,
      y2: 500,
    });
    expect(isPointInPolygon({ x: 700, y: 450 }, seeFrom(atTheEnd, REACH_PX))).toBe(true);
  });

  it('is switched off entirely by a null reach — that is what a dark scene passes', () => {
    const fromStreet = { x: 200, y: 300 };
    expect(sightSegmentsFor(PLAN, fromStreet, { curtainReachPx: null })).toHaveLength(3);
    // The stage 18b/18c behaviour, unchanged: at night a lit window is more
    // visible from a distance, not less.
    expect(isPointInPolygon({ x: 700, y: 300 }, seeFrom(fromStreet, null))).toBe(true);
  });

  it('never applies to an open door — a door standing open is open', () => {
    const plan = [makeWall(5, 'door', 400, 100, 400, 500, { open: true })];
    expect(sightSegmentsFor(plan, { x: 0, y: 300 }, { curtainReachPx: REACH_PX })).toEqual([]);
    // A closed one blocks for everybody, however close they stand.
    const shut = [makeWall(5, 'door', 400, 100, 400, 500)];
    expect(sightSegmentsFor(shut, { x: 390, y: 300 }, { curtainReachPx: REACH_PX })).toHaveLength(
      1,
    );
  });
});

describe('isWallWithinReach — arm’s reach', () => {
  const door = { x1: 400, y1: 100, x2: 400, y2: 300 };

  it('accepts a token in the next square, diagonals included', () => {
    // A 2 m grid puts the centre of the adjacent square 1 m from the wall along
    // its edge, and 1,41 m from the nearest end diagonally.
    expect(isWallWithinReach(door, [{ x: 350, y: 200 }], REACH_PX)).toBe(true);
    expect(isWallWithinReach(door, [{ x: 350, y: 50 }], REACH_PX)).toBe(true);
  });

  it('refuses a token two squares out', () => {
    expect(isWallWithinReach(door, [{ x: 250, y: 200 }], REACH_PX)).toBe(false);
  });

  it('reaches along the whole segment, not only opposite its middle', () => {
    expect(isWallWithinReach(door, [{ x: 380, y: 290 }], REACH_PX)).toBe(true);
  });

  it('takes any one of the viewer’s tokens — the party has more than one hand', () => {
    const far = { x: 100, y: 900 };
    const near = { x: 380, y: 200 };
    expect(isWallWithinReach(door, [far], REACH_PX)).toBe(false);
    expect(isWallWithinReach(door, [far, near], REACH_PX)).toBe(true);
  });

  it('is false for a viewer with no tokens at all', () => {
    expect(isWallWithinReach(door, [], REACH_PX)).toBe(false);
  });
});
