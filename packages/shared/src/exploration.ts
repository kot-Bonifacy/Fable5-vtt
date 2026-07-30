/**
 * Exploration memory (stage 18c) — core VTT, no game system involved.
 *
 * Stages 18a and 18b answer „what can this token see *now*?". This module
 * answers the question a group asks the moment they leave a room: „what did we
 * already see?". The map stays on the plan; the tokens do not, because a
 * remembered corridor is a memory of a corridor and not a live feed of who is
 * standing in it.
 *
 * **Why a grid, when fog (17a) and drawings (17b) are shape lists.** What has
 * to be remembered is „visible *and* lit" — the intersection of one viewer's
 * polygon with the reach of lamps standing somewhere else entirely. A shape
 * list cannot express that without clipping polygons against each other, and
 * would grow by one shape per push forever. A grid turns it into a point test,
 * has a size that depends on the map rather than on the length of the session,
 * and — the property that decides it, for something merged ten times a second
 * while a token is dragged — merging into it is idempotent.
 *
 * The cell is the light mask's cell (half a grid square, one metre on a CP RED
 * map) and the grid is anchored at the scene origin, so a cell is the same
 * square for every viewer, in every push, across restarts. That is also what
 * makes merging a light mask nearly free: both grids are multiples of the same
 * cell, so a mask cell maps onto an exploration cell by integer offset.
 */

import { LIGHT_DARK, decodeLevelRuns, polygonsBounds, type LightMask } from './lights.js';
import type { ScenePoint } from './measure.js';
import { isPointVisible } from './vision.js';

/** Explored area of one scene, as the server holds it. */
export interface ExplorationGrid {
  /** Cell edge in scene pixels. */
  cell: number;
  cols: number;
  rows: number;
  /** One byte per cell, row-major: 0 unexplored, 1 explored. */
  cells: Uint8Array;
}

/**
 * Explored area as it goes over the wire and into the database.
 *
 * Unlike a light mask this is the *whole* scene rather than one viewer's
 * bounding box, and it is the same for everybody: exploration is the party's
 * shared knowledge, so it can be broadcast once instead of composed per socket.
 * It never describes a cell nobody has seen, which is what makes that safe.
 */
export interface ExplorationMask {
  cell: number;
  cols: number;
  rows: number;
  /**
   * Alternating run lengths in row-major order, starting with *unexplored*:
   * `[unexplored, explored, unexplored, …]`. A leading zero is how a grid that
   * starts explored says so. Half-explored maps compress to a few hundred
   * numbers; the encoding is the one thing here that has to stay cheap, because
   * it runs on every push that reveals something new.
   */
  runs: number[];
}

/** Server → client `explore:sync`; a null mask means „this scene forgets". */
export interface ExplorationSyncBroadcast {
  sceneId: string;
  mask: ExplorationMask | null;
}

/** Client → server `explore:forget` (GM only) — wipe one scene's memory. */
export interface ExplorationForgetPayload {
  sceneId: string;
}

/** How many cells cover a scene at this cell size. */
export function explorationDimensions(
  scene: { width: number; height: number },
  cell: number,
): { cols: number; rows: number } {
  const size = Math.max(1, Math.round(cell));
  return {
    cols: Math.max(1, Math.ceil(scene.width / size)),
    rows: Math.max(1, Math.ceil(scene.height / size)),
  };
}

/** An empty grid: nothing seen yet, which is where every scene starts. */
export function createExplorationGrid(cell: number, cols: number, rows: number): ExplorationGrid {
  const size = Math.max(1, Math.round(cell));
  const width = Math.max(1, Math.round(cols));
  const height = Math.max(1, Math.round(rows));
  return { cell: size, cols: width, rows: height, cells: new Uint8Array(width * height) };
}

/** Run-length encodes a 0/1 grid into alternating counts, starting with 0s. */
export function encodeFlagRuns(cells: Uint8Array): number[] {
  const runs: number[] = [];
  let expected = 0;
  let count = 0;
  for (let i = 0; i < cells.length; i++) {
    const flag = cells[i] ? 1 : 0;
    if (flag === expected) {
      count++;
      continue;
    }
    runs.push(count);
    expected = expected === 0 ? 1 : 0;
    count = 1;
  }
  if (count > 0 || runs.length === 0) runs.push(count);
  return runs;
}

/**
 * Expands alternating run lengths back into `count` cells. A malformed list
 * leaves the rest unexplored rather than throwing: exploration is a rendering
 * hint plus a filter, and a corrupt row must not take the scene down — the
 * worst it can do is make the party walk a corridor twice.
 */
export function decodeFlagRuns(runs: readonly number[], count: number): Uint8Array {
  const cells = new Uint8Array(Math.max(0, count));
  let index = 0;
  let flag = 0;
  for (const raw of runs) {
    const length = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
    const end = Math.min(cells.length, index + length);
    if (flag === 1) for (let i = index; i < end; i++) cells[i] = 1;
    index = end;
    flag = flag === 0 ? 1 : 0;
    if (index >= cells.length) break;
  }
  return cells;
}

/** The grid as it travels and as it is stored. */
export function toExplorationMask(grid: ExplorationGrid): ExplorationMask {
  return {
    cell: grid.cell,
    cols: grid.cols,
    rows: grid.rows,
    runs: encodeFlagRuns(grid.cells),
  };
}

/** The stored form back as a grid. */
export function fromExplorationMask(mask: ExplorationMask): ExplorationGrid {
  const grid = createExplorationGrid(mask.cell, mask.cols, mask.rows);
  grid.cells.set(decodeFlagRuns(mask.runs, grid.cols * grid.rows).subarray(0, grid.cells.length));
  return grid;
}

/** Is any cell of this grid explored? */
export function hasExploration(grid: ExplorationGrid): boolean {
  return grid.cells.some((cell) => cell !== 0);
}

/** Was this scene point already seen by the party? */
export function isPointExplored(point: ScenePoint, grid: ExplorationGrid): boolean {
  const col = Math.floor(point.x / grid.cell);
  const row = Math.floor(point.y / grid.cell);
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
  return grid.cells[row * grid.cols + col] === 1;
}

/**
 * Folds one viewer's current sight into the party's memory, and reports how
 * many cells that added — zero meaning „nothing to store, nothing to push",
 * which is the common case once a group is walking around a room they know.
 *
 * On a dark scene the light mask *is* the answer: it already holds „inside my
 * polygon and lit by something", zeroed everywhere else, which is precisely
 * what may be remembered. On a lit scene there is no mask and the polygons are
 * the whole of it.
 *
 * A mask whose cell size no longer matches the grid is ignored rather than
 * mis-merged; the caller rebuilds the grid when the scene's grid changes.
 */
export function mergeExploration(
  grid: ExplorationGrid,
  sight: { polygons: readonly (readonly ScenePoint[])[]; mask?: LightMask | null },
): number {
  const mask = sight.mask ?? null;
  if (mask) {
    if (mask.cell !== grid.cell) return 0;
    return mergeLightMask(grid, mask);
  }
  return mergePolygons(grid, sight.polygons);
}

/** Merge path for a dark scene: every lit cell of the viewer's own mask. */
function mergeLightMask(grid: ExplorationGrid, mask: LightMask): number {
  // Both grids step by the same cell and the mask origin is a whole number of
  // cells from the scene origin, so this is an integer offset, not a resample.
  const offsetCol = Math.round(mask.x / grid.cell);
  const offsetRow = Math.round(mask.y / grid.cell);
  const levels = decodeLevelRuns(mask.runs, mask.cols * mask.rows);
  let added = 0;
  for (let row = 0; row < mask.rows; row++) {
    const gridRow = offsetRow + row;
    if (gridRow < 0 || gridRow >= grid.rows) continue;
    for (let col = 0; col < mask.cols; col++) {
      if (levels[row * mask.cols + col] === LIGHT_DARK) continue;
      const gridCol = offsetCol + col;
      if (gridCol < 0 || gridCol >= grid.cols) continue;
      const index = gridRow * grid.cols + gridCol;
      if (grid.cells[index] === 1) continue;
      grid.cells[index] = 1;
      added++;
    }
  }
  return added;
}

/** Merge path for a lit scene: everything inside the polygons. */
function mergePolygons(
  grid: ExplorationGrid,
  polygons: readonly (readonly ScenePoint[])[],
): number {
  const bounds = polygonsBounds(polygons);
  if (!bounds) return 0;
  const colFrom = Math.max(0, Math.floor(bounds.x / grid.cell));
  const colTo = Math.min(grid.cols - 1, Math.ceil((bounds.x + bounds.width) / grid.cell));
  const rowFrom = Math.max(0, Math.floor(bounds.y / grid.cell));
  const rowTo = Math.min(grid.rows - 1, Math.ceil((bounds.y + bounds.height) / grid.cell));
  let added = 0;
  for (let row = rowFrom; row <= rowTo; row++) {
    const y = row * grid.cell + grid.cell / 2;
    for (let col = colFrom; col <= colTo; col++) {
      const index = row * grid.cols + col;
      if (grid.cells[index] === 1) continue;
      if (!isPointVisible({ x: col * grid.cell + grid.cell / 2, y }, polygons)) continue;
      grid.cells[index] = 1;
      added++;
    }
  }
  return added;
}
