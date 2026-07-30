import { describe, expect, it } from 'vitest';
import {
  createExplorationGrid,
  decodeFlagRuns,
  encodeFlagRuns,
  explorationDimensions,
  fromExplorationMask,
  hasExploration,
  isPointExplored,
  mergeExploration,
  toExplorationMask,
} from './exploration.js';
import { LIGHT_BRIGHT, LIGHT_DARK, LIGHT_DIM, encodeLevelRuns, type LightMask } from './lights.js';
import { computeVisionPolygon, type Segment } from './vision.js';
import type { ScenePoint } from './measure.js';

/**
 * Stage 18c: what the party remembers.
 *
 * The two properties that matter are that the memory only ever grows by what
 * was *actually* seen — lit, on a dark scene — and that merging the same sight
 * twice changes nothing, because it runs ten times a second while a token is
 * being dragged.
 */

/** A light mask of uniform level over `cols`×`rows` cells at (x, y). */
function maskOf(
  x: number,
  y: number,
  cols: number,
  rows: number,
  cell: number,
  fill: (col: number, row: number) => number,
): LightMask {
  const levels = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) levels[row * cols + col] = fill(col, row);
  }
  return { x, y, cell, cols, rows, runs: encodeLevelRuns(levels) };
}

function square(cx: number, cy: number, half: number): ScenePoint[] {
  return [
    { x: cx - half, y: cy - half },
    { x: cx + half, y: cy - half },
    { x: cx + half, y: cy + half },
    { x: cx - half, y: cy + half },
  ];
}

describe('exploration grid', () => {
  it('covers the scene in whole cells', () => {
    expect(explorationDimensions({ width: 4000, height: 3000 }, 50)).toEqual({
      cols: 80,
      rows: 60,
    });
    // A map that does not divide evenly gets the extra cell rather than a gap.
    expect(explorationDimensions({ width: 4010, height: 3000 }, 50).cols).toBe(81);
  });

  it('starts with nothing seen', () => {
    const grid = createExplorationGrid(50, 10, 10);
    expect(hasExploration(grid)).toBe(false);
    expect(isPointExplored({ x: 100, y: 100 }, grid)).toBe(false);
  });

  it('answers outside its own bounds without throwing', () => {
    const grid = createExplorationGrid(50, 10, 10);
    grid.cells.fill(1);
    expect(isPointExplored({ x: -10, y: 100 }, grid)).toBe(false);
    expect(isPointExplored({ x: 100000, y: 100 }, grid)).toBe(false);
  });
});

describe('run-length encoding', () => {
  it('round-trips an arbitrary grid', () => {
    const cells = new Uint8Array(97);
    for (let i = 0; i < cells.length; i++) cells[i] = i % 7 === 0 || i > 80 ? 1 : 0;
    expect(decodeFlagRuns(encodeFlagRuns(cells), cells.length)).toEqual(cells);
  });

  it('starts the alternation at unexplored, with a leading zero when needed', () => {
    const cells = Uint8Array.from([1, 1, 0, 0, 0, 1]);
    // No unexplored cells first, so the first run is empty.
    expect(encodeFlagRuns(cells)).toEqual([0, 2, 3, 1]);
    expect(decodeFlagRuns([0, 2, 3, 1], 6)).toEqual(cells);
  });

  it('encodes an empty grid as one run and survives a corrupt one', () => {
    expect(encodeFlagRuns(new Uint8Array(12))).toEqual([12]);
    // A list that runs out leaves the rest unexplored rather than throwing.
    expect(decodeFlagRuns([2, 1], 6)).toEqual(Uint8Array.from([0, 0, 1, 0, 0, 0]));
    // A negative or non-numeric run counts as empty and the alternation goes
    // on — a corrupt row costs at most a misremembered cell, never the scene.
    expect(decodeFlagRuns([2, -5, Number.NaN, 2], 6)).toEqual(Uint8Array.from([0, 0, 1, 1, 0, 0]));
  });

  it('survives the trip through storage', () => {
    const grid = createExplorationGrid(50, 8, 6);
    grid.cells[0] = 1;
    grid.cells[17] = 1;
    grid.cells[47] = 1;
    expect(fromExplorationMask(toExplorationMask(grid)).cells).toEqual(grid.cells);
  });
});

describe('mergeExploration on a dark scene', () => {
  const cell = 50;

  it('remembers the lit cells of the mask and nothing else', () => {
    const grid = createExplorationGrid(cell, 20, 20);
    // A 4×4 patch at (200, 200); the left half lit, the right half dark.
    const mask = maskOf(200, 200, 4, 4, cell, (col) => (col < 2 ? LIGHT_BRIGHT : LIGHT_DARK));
    expect(mergeExploration(grid, { polygons: [], mask })).toBe(8);

    expect(isPointExplored({ x: 225, y: 225 }, grid)).toBe(true);
    expect(isPointExplored({ x: 325, y: 225 }, grid)).toBe(false);
    // Nothing outside the mask's own patch.
    expect(isPointExplored({ x: 125, y: 225 }, grid)).toBe(false);
  });

  it('counts dim as seen — you made out the shape of the room', () => {
    const grid = createExplorationGrid(cell, 20, 20);
    const mask = maskOf(200, 200, 2, 2, cell, () => LIGHT_DIM);
    expect(mergeExploration(grid, { polygons: [], mask })).toBe(4);
    expect(isPointExplored({ x: 225, y: 225 }, grid)).toBe(true);
  });

  it('is idempotent: the same sight twice adds nothing', () => {
    const grid = createExplorationGrid(cell, 20, 20);
    const mask = maskOf(200, 200, 4, 4, cell, () => LIGHT_BRIGHT);
    expect(mergeExploration(grid, { polygons: [], mask })).toBe(16);
    expect(mergeExploration(grid, { polygons: [], mask })).toBe(0);
    expect(mergeExploration(grid, { polygons: [], mask })).toBe(0);
  });

  it('clips a mask that hangs off the edge of the scene', () => {
    const grid = createExplorationGrid(cell, 4, 4);
    // Four cells wide starting at the last column: three of them are off-map.
    const mask = maskOf(150, 150, 4, 4, cell, () => LIGHT_BRIGHT);
    expect(mergeExploration(grid, { polygons: [], mask })).toBe(1);
    expect(isPointExplored({ x: 175, y: 175 }, grid)).toBe(true);
  });

  it('refuses a mask drawn on a different cell size rather than mis-merging', () => {
    const grid = createExplorationGrid(cell, 20, 20);
    const mask = maskOf(200, 200, 4, 4, 37, () => LIGHT_BRIGHT);
    expect(mergeExploration(grid, { polygons: [], mask })).toBe(0);
    expect(hasExploration(grid)).toBe(false);
  });
});

describe('mergeExploration on a lit scene', () => {
  const cell = 50;

  it('remembers what is inside the polygons', () => {
    const grid = createExplorationGrid(cell, 20, 20);
    const added = mergeExploration(grid, { polygons: [square(500, 500, 100)], mask: null });
    expect(added).toBeGreaterThan(0);
    expect(isPointExplored({ x: 500, y: 500 }, grid)).toBe(true);
    // Just outside the square.
    expect(isPointExplored({ x: 700, y: 500 }, grid)).toBe(false);
  });

  it('takes the shape of the walls, because the polygon already has', () => {
    // A room with one wall down the middle and the viewer on the left of it.
    const segments: Segment[] = [
      { x1: 0, y1: 0, x2: 1000, y2: 0 },
      { x1: 1000, y1: 0, x2: 1000, y2: 1000 },
      { x1: 1000, y1: 1000, x2: 0, y2: 1000 },
      { x1: 0, y1: 1000, x2: 0, y2: 0 },
      { x1: 500, y1: 0, x2: 500, y2: 1000 },
    ];
    const grid = createExplorationGrid(cell, 20, 20);
    const polygon = computeVisionPolygon({ x: 250, y: 500 }, segments, null);
    mergeExploration(grid, { polygons: [polygon], mask: null });

    expect(isPointExplored({ x: 250, y: 500 }, grid)).toBe(true);
    // Behind the wall: never seen, never remembered.
    expect(isPointExplored({ x: 750, y: 500 }, grid)).toBe(false);
  });

  it('adds nothing for a viewer with no polygons at all', () => {
    const grid = createExplorationGrid(cell, 20, 20);
    expect(mergeExploration(grid, { polygons: [], mask: null })).toBe(0);
  });
});
