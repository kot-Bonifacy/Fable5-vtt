import { describe, expect, it } from 'vitest';
import type { FogShapeView } from './fog.js';
import { WALL_STRETCH_MAX, revealedStretches } from './walls.js';

/**
 * What a player's route planner is told about on a map painted by hand
 * (13.09.2026, GM decision): the stretches of walls standing on revealed floor,
 * cut to within one piece of the edge of the reveal.
 *
 * The plan: a wall along y = 0 from x = 0 to x = 400, cut into pieces of 50 px,
 * so the middles asked about sit at 25, 75, … 375.
 */

const WALL = { x1: 0, y1: 0, x2: 400, y2: 0 };
const STEP = 50;

let nextId = 1;

function rect(
  mode: FogShapeView['mode'],
  x: number,
  y: number,
  width: number,
  height: number,
): FogShapeView {
  return { id: nextId++, kind: 'rect', mode, x, y, width, height };
}

function fogOf(...shapes: FogShapeView[]) {
  return { enabled: true, shapes };
}

describe('revealedStretches', () => {
  it('hands back every segment untouched on a map without fog', () => {
    expect(revealedStretches([WALL], { enabled: false, shapes: [] }, STEP)).toEqual([WALL]);
  });

  it('hands back nothing while the map is covered', () => {
    expect(revealedStretches([WALL], fogOf(), STEP)).toEqual([]);
    expect(revealedStretches([WALL], fogOf(rect('hide', -100, -100, 600, 200)), STEP)).toEqual([]);
  });

  it('keeps a wall in full view exactly as it went in', () => {
    expect(revealedStretches([WALL], fogOf(rect('reveal', -10, -10, 420, 20)), STEP)).toEqual([
      WALL,
    ]);
  });

  it('cuts a wall at the edge of a reveal, to within one piece', () => {
    // Middles at 25, 75 and 125 are revealed, 175 is not.
    expect(revealedStretches([WALL], fogOf(rect('reveal', -10, -10, 140, 20)), STEP)).toEqual([
      { x1: 0, y1: 0, x2: 150, y2: 0 },
    ]);
  });

  it('keeps the direction of a wall traced the other way', () => {
    const reversed = { x1: 400, y1: 0, x2: 0, y2: 0 };
    expect(revealedStretches([reversed], fogOf(rect('reveal', -10, -10, 140, 20)), STEP)).toEqual([
      { x1: 150, y1: 0, x2: 0, y2: 0 },
    ]);
  });

  it('lets a hide painted later cut a hole in a reveal', () => {
    // Hidden middles: 175 and 225 (140…260); 275 is revealed again.
    const fog = fogOf(rect('reveal', -10, -10, 420, 20), rect('hide', 140, -10, 120, 20));
    expect(revealedStretches([WALL], fog, STEP)).toEqual([
      { x1: 0, y1: 0, x2: 150, y2: 0 },
      { x1: 250, y1: 0, x2: 400, y2: 0 },
    ]);
  });

  it('reaches a wall with the brush radius, not only with the points of the stroke', () => {
    // The stroke runs 60…80 px above the wall; its 70 px radius reaches the
    // middles at 175 and 225 (65 px away) and none further out (96 px).
    const stroke: FogShapeView = {
      id: nextId++,
      kind: 'stroke',
      mode: 'reveal',
      points: [
        { x: 200, y: -80 },
        { x: 200, y: -60 },
      ],
      radius: 70,
    };
    expect(revealedStretches([WALL], fogOf(stroke), STEP)).toEqual([
      { x1: 150, y1: 0, x2: 250, y2: 0 },
    ]);
  });

  it('drops a wall standing wholly under the fog and keeps its neighbour', () => {
    const buried = { x1: 0, y1: 500, x2: 400, y2: 500 };
    expect(
      revealedStretches([buried, WALL], fogOf(rect('reveal', -10, -10, 420, 20)), STEP),
    ).toEqual([WALL]);
  });

  it('cuts a very long wall into at most WALL_STRETCH_MAX pieces', () => {
    const long = { x1: 0, y1: 0, x2: 100_000, y2: 0 };
    const stretches = revealedStretches([long], fogOf(rect('reveal', -10, -10, 50_010, 20)), 1);
    expect(stretches).toHaveLength(1);
    expect(stretches[0]!.x1).toBe(0);
    expect(stretches[0]!.x2).toBeGreaterThanOrEqual(50_000);
    expect(stretches[0]!.x2).toBeLessThanOrEqual(50_000 + 100_000 / WALL_STRETCH_MAX);
  });
});
