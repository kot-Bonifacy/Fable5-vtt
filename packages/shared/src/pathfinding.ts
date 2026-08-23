/**
 * Walking a token from A to B (stage 16e) — core VTT, no game system involved.
 *
 * This module answers one question: „given a point I may stand on, a point I
 * clicked, and a way of telling passable ground from impassable, what is the
 * route?". It knows nothing about metres, turn budgets, walls or Cyberpunk RED,
 * and that ignorance is the point.
 *
 * **The passability predicate is injected, exactly the way `DiceRng` is.** The
 * two callers of `planWalk` have completely different ideas of what „passable"
 * means, and neither of them belongs in an A* implementation:
 *
 * | Who    | Where their passability comes from                           |
 * | ------ | ------------------------------------------------------------ |
 * | GM     | real wall geometry — an *edge* test (`isSegmentClear`)        |
 * | Player | „I can see it right now" — an *area* test (`isPointVisible`)  |
 *
 * That second row is the thing the stage stands on. A player's client is never
 * sent a single wall — and never will be — yet the route it computes goes round
 * them, because **the edge of the visibility polygon is a picture of the walls**.
 * The floor plan of a building nobody has entered stays on the server, and the
 * pathfinder below never learns that walls exist.
 *
 * **Why the party's memory (18c) is deliberately not in that column.** It looks
 * like it belongs — a known building ought to be crossable in one click, and the
 * exploration mask is right there on the client. It cannot be used, and the
 * reason is worth writing down because it is not obvious: a wall is *seen from
 * both sides*. Once a corridor has been walked, the cells on both sides of its
 * walls are remembered, so a route planned against memory strolls through
 * masonry. The mask records where the party has **been**, never what stopped
 * them. Current sight is the only thing on a player's client that still has the
 * walls in it — as a boundary rather than as data.
 *
 * The one place that boundary is *not* a wall is the horizon: the end of a sight
 * radius, the edge of the scene. Hence `truncated` — clicking into the black is
 * not a refusal but „walk that way until you run out of what you can see", which
 * is both what the games this imitates do and the GM's own framing of the stage:
 * nie dalej, niż widzisz.
 */

import type { SceneView } from './scenes.js';
import { polylineMetres, type ScenePoint } from './measure.js';
import { isSegmentClear, type Segment } from './vision.js';

/**
 * The lattice a route is planned on: cell (0, 0) has its top-left corner at
 * (`originX`, `originY`), and a node *is* a token's top-left corner.
 *
 * Anchoring nodes to the scene's own grid rather than to the token's current
 * position is deliberate and load-bearing: the server snaps every landing with
 * `snapTokenPosition`, so a route whose waypoints are already snapped lands
 * exactly where it was drawn. Planned on any other lattice, the last step would
 * be nudged by up to half a square on arrival — and half a square of unbilled
 * movement is how a client-side courtesy turns into a rules problem.
 */
export interface WalkGrid {
  /** Cell edge in scene pixels. */
  cell: number;
  /** Top-left corner of cell (0, 0) in scene pixels; 0 ≤ origin < cell. */
  originX: number;
  originY: number;
  /** How many whole cells fit inside the scene. */
  cols: number;
  rows: number;
}

/** „May a 1×1 token stand on the cell with this centre?" — injected per caller. */
export type WalkPassable = (centre: ScenePoint) => boolean;

/**
 * „May a figure cross straight from here to there?" — the second, optional half
 * of passability.
 *
 * A player's obstacles are *areas*: outside the visibility polygon is outside,
 * and a point test answers everything. The GM's obstacles are **lines** — a wall
 * is a segment, and two cells either side of it are both perfectly standable.
 * Without an edge test the GM's routes would step through their own walls, so
 * the caller that holds real geometry hands one in (`isSegmentClear`), and the
 * caller that holds a polygon does not.
 */
export type WalkStep = (from: ScenePoint, to: ScenePoint) => boolean;

export interface WalkPlanOptions {
  grid: WalkGrid;
  isPassable: WalkPassable;
  /** Optional edge test; omit when the passability model is area-shaped. */
  canStep?: WalkStep;
  /** Footprint in cells: a 2×2 token needs all four of them (default 1). */
  size?: number;
  /**
   * How far from the start the search may wander, in cells. Kept near the
   * *budget* rather than near the map: a 4096 px scene with 100 px squares is
   * 40 × 40 cells, but a scene with a fine grid can be several hundred thousand,
   * and nobody walks across one of those in a turn.
   */
  radiusCells?: number;
  /** Hard ceiling on expanded nodes, whatever the radius says. */
  maxVisited?: number;
  /** Straighten the finished route (default true). */
  smooth?: boolean;
}

export interface WalkPlan {
  /**
   * Token top-left positions in scene pixels. The first is the start cell —
   * which is where the token *snaps to*, not necessarily where it stands, so a
   * caller measuring the cost prepends the token's real position.
   */
  points: ScenePoint[];
  /** The goal could not be reached; this route ends as near it as it got. */
  truncated: boolean;
  /** Nodes expanded — the ceiling's only observable, and what the tests read. */
  visited: number;
}

/** Default search radius in cells; ~40 squares of open ground out of combat. */
export const WALK_RADIUS_CELLS = 40;
/**
 * Node ceiling. Reached only by a search with nowhere to go — a token walled
 * into a large room clicking at the far side of the map — where it is the
 * difference between a route drawn late and a frozen tab.
 */
export const WALK_MAX_VISITED = 12_000;

/** Diagonal step cost. A square is a square, so its diagonal is √2 of one. */
const DIAGONAL = Math.SQRT2;

/** The eight neighbours, ordered so equal-cost ties always break the same way. */
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

/**
 * The walking lattice of a scene. `sizePx` is used even on a gridless map: the
 * GM sizes the grid to the artwork whether or not the overlay is drawn, which
 * is the same assumption `metresPerPixel` already makes.
 */
export function walkGridForScene(
  scene: { width: number; height: number; grid: { sizePx: number } },
  originX: number,
  originY: number,
): WalkGrid {
  const cell = scene.grid.sizePx;
  if (!Number.isFinite(cell) || cell <= 0) {
    return { cell: 1, originX: 0, originY: 0, cols: 0, rows: 0 };
  }
  return {
    cell,
    originX,
    originY,
    cols: Math.max(0, Math.floor((scene.width - originX) / cell)),
    rows: Math.max(0, Math.floor((scene.height - originY) / cell)),
  };
}

/** Top-left corner of a cell, in scene pixels. */
function cellPosition(grid: WalkGrid, col: number, row: number): ScenePoint {
  return { x: grid.originX + col * grid.cell, y: grid.originY + row * grid.cell };
}

/** Nearest node to a token position — the cell that position snaps to. */
function cellOfPosition(grid: WalkGrid, position: ScenePoint): { col: number; row: number } {
  return {
    col: Math.round((position.x - grid.originX) / grid.cell),
    row: Math.round((position.y - grid.originY) / grid.cell),
  };
}

/**
 * Is every cell of a `size × size` footprint anchored here passable?
 *
 * Without this a 2×2 token squeezes through a one-metre doorway: the centre of
 * the gap is perfectly visible, so a point test says yes, and the figure ends up
 * standing in a wall on both sides of it.
 */
function isNodeOpen(
  grid: WalkGrid,
  isPassable: WalkPassable,
  size: number,
  col: number,
  row: number,
): boolean {
  if (col < 0 || row < 0) return false;
  if (col + size > grid.cols || row + size > grid.rows) return false;
  const half = grid.cell / 2;
  for (let dr = 0; dr < size; dr++) {
    for (let dc = 0; dc < size; dc++) {
      const centre = {
        x: grid.originX + (col + dc) * grid.cell + half,
        y: grid.originY + (row + dr) * grid.cell + half,
      };
      if (!isPassable(centre)) return false;
    }
  }
  return true;
}

/**
 * Does the **whole figure** clear the edges on a straight step?
 *
 * `canStep` answers about a line, and until 23.08 the planner drew exactly one
 * of them: centre to centre. For a 1×1 token that line *is* the body, but a 2×2
 * figure keeps its centre a whole cell away from each wall, so a single centre
 * line let half the token walk through masonry — the preview drew a route
 * straight across two walls that the server then refused after a few
 * centimetres, and the figure stopped with no explanation.
 *
 * One line per cell of the footprint, the same lanes `firstBlockedStep` has
 * traced since 21.08, so the route the client draws and the verdict the server
 * gives ask the geometry the same question.
 */
function laneClear(
  canStep: WalkStep,
  lanes: readonly ScenePoint[],
  from: ScenePoint,
  to: ScenePoint,
): boolean {
  for (const lane of lanes) {
    if (
      !canStep({ x: from.x + lane.x, y: from.y + lane.y }, { x: to.x + lane.x, y: to.y + lane.y })
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Is the footprint clear all the way along a straight run between two nodes?
 *
 * Used by the smoothing pass, and strict on purpose: the token is sampled every
 * half cell and *every* cell it overlaps at each sample is tested, so a shortcut
 * can never clip the corner it was meant to walk round. The straight line has to
 * be genuinely walkable, not merely walkable at its endpoints.
 */
function isRunOpen(
  grid: WalkGrid,
  isPassable: WalkPassable,
  canStep: WalkStep | undefined,
  lanes: readonly ScenePoint[],
  size: number,
  from: ScenePoint,
  to: ScenePoint,
): boolean {
  const extent = size * grid.cell;
  // A straightened leg crosses everything the steps it replaces crossed, so the
  // edge test has to hold over the whole run — measured centre to centre, which
  // is where every other distance in the project is measured, and once per lane
  // of the footprint.
  if (canStep) {
    const half = extent / 2;
    const fromCentre = { x: from.x + half, y: from.y + half };
    const toCentre = { x: to.x + half, y: to.y + half };
    if (!laneClear(canStep, lanes, fromCentre, toCentre)) return false;
  }
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil((distance / grid.cell) * 2));
  const half = grid.cell / 2;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    // The footprint of an off-lattice sample straddles one more cell per axis
    // than a snapped one, and all of them have to hold the token.
    const colFrom = Math.floor((x - grid.originX) / grid.cell);
    const colTo = Math.floor((x + extent - 1 - grid.originX) / grid.cell);
    const rowFrom = Math.floor((y - grid.originY) / grid.cell);
    const rowTo = Math.floor((y + extent - 1 - grid.originY) / grid.cell);
    for (let row = rowFrom; row <= rowTo; row++) {
      if (row < 0 || row >= grid.rows) return false;
      for (let col = colFrom; col <= colTo; col++) {
        if (col < 0 || col >= grid.cols) return false;
        if (
          !isPassable({
            x: grid.originX + col * grid.cell + half,
            y: grid.originY + row * grid.cell + half,
          })
        ) {
          return false;
        }
      }
    }
  }
  return true;
}

/** Centre of a `size × size` footprint anchored at a cell, in scene pixels. */
function footprintCentre(grid: WalkGrid, size: number, col: number, row: number): ScenePoint {
  const half = (size * grid.cell) / 2;
  return { x: grid.originX + col * grid.cell + half, y: grid.originY + row * grid.cell + half };
}

/** Octile distance — the exact cost of an unobstructed 8-way walk. */
function heuristic(dc: number, dr: number): number {
  const dx = Math.abs(dc);
  const dy = Math.abs(dr);
  return dx + dy + (DIAGONAL - 2) * Math.min(dx, dy);
}

interface OpenNode {
  index: number;
  f: number;
  h: number;
}

/**
 * A binary heap whose comparator never returns „either" — ties break on the
 * heuristic and then on the cell index, so the same two points always produce
 * the same polyline. Determinism is not an aesthetic here: the route is drawn
 * under the cursor and then walked, and a path that reshuffles between the
 * preview and the click would be a figure walking somewhere it was not sent.
 */
class NodeHeap {
  private readonly items: OpenNode[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: OpenNode): void {
    this.items.push(node);
    let child = this.items.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (NodeHeap.before(this.items[child]!, this.items[parent]!) === false) break;
      this.swap(child, parent);
      child = parent;
    }
  }

  pop(): OpenNode | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last;
      let parent = 0;
      for (;;) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let best = parent;
        if (left < this.items.length && NodeHeap.before(this.items[left]!, this.items[best]!)) {
          best = left;
        }
        if (right < this.items.length && NodeHeap.before(this.items[right]!, this.items[best]!)) {
          best = right;
        }
        if (best === parent) break;
        this.swap(parent, best);
        parent = best;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const tmp = this.items[a]!;
    this.items[a] = this.items[b]!;
    this.items[b] = tmp;
  }

  private static before(a: OpenNode, b: OpenNode): boolean {
    if (a.f !== b.f) return a.f < b.f;
    if (a.h !== b.h) return a.h < b.h;
    return a.index < b.index;
  }
}

/**
 * The route from one token position to another, or null when the token is not
 * standing anywhere a route could start.
 *
 * Both points are **token top-left corners**, not centres and not pointer
 * positions — the caller centres the footprint on the click, because only it
 * knows how big the figure is on screen.
 *
 * An unreachable goal is answered rather than refused: the search keeps the
 * node that got closest and hands back the route to it with `truncated` set.
 * „Walk that way" is a better answer than „no" for a click into the dark, and
 * for a click into a sealed room it is the only honest one.
 */
export function planWalk(
  from: ScenePoint,
  to: ScenePoint,
  options: WalkPlanOptions,
): WalkPlan | null {
  const { grid, isPassable, canStep } = options;
  const size = Math.max(1, Math.round(options.size ?? 1));
  // One lane per cell of the footprint, worked out once: the edge test runs on
  // every neighbour of every node, and a 2×2 figure has four of them.
  const lanes = footprintLanes({ size, cell: grid.cell });
  const radius = Math.max(1, Math.round(options.radiusCells ?? WALK_RADIUS_CELLS));
  const maxVisited = Math.max(1, Math.round(options.maxVisited ?? WALK_MAX_VISITED));
  if (grid.cols < size || grid.rows < size || grid.cell <= 0) return null;

  const start = cellOfPosition(grid, from);
  const goal = cellOfPosition(grid, to);
  // The goal is clamped rather than rejected: a click past the edge of the map
  // is a click at the edge of the map, which is where the figure can walk to.
  const goalCol = Math.min(Math.max(goal.col, 0), grid.cols - size);
  const goalRow = Math.min(Math.max(goal.row, 0), grid.rows - size);
  if (!isNodeOpen(grid, isPassable, size, start.col, start.row)) return null;

  const width = grid.cols;
  const startIndex = start.row * width + start.col;
  const goalIndex = goalRow * width + goalCol;
  const gScore = new Map<number, number>([[startIndex, 0]]);
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  const open = new NodeHeap();
  const startH = heuristic(goalCol - start.col, goalRow - start.row);
  open.push({ index: startIndex, f: startH, h: startH });

  let bestIndex = startIndex;
  let bestH = startH;
  let bestG = 0;
  let visited = 0;
  let reached = startIndex === goalIndex;

  while (open.size > 0 && visited < maxVisited) {
    const current = open.pop()!;
    if (closed.has(current.index)) continue;
    closed.add(current.index);
    visited++;

    const col = current.index % width;
    const row = (current.index - col) / width;
    const g = gScore.get(current.index) ?? 0;
    // „Closest to the goal" beats „cheapest to get to": a route that ends one
    // square from a locked door is what the player asked for, even when a
    // nearer node was reached first.
    if (current.h < bestH || (current.h === bestH && g < bestG)) {
      bestIndex = current.index;
      bestH = current.h;
      bestG = g;
    }
    if (current.index === goalIndex) {
      reached = true;
      break;
    }

    for (const [dc, dr] of NEIGHBOURS) {
      const nextCol = col + dc;
      const nextRow = row + dr;
      const nextIndex = nextRow * width + nextCol;
      if (closed.has(nextIndex)) continue;
      // Chebyshev radius, so the reachable area is the square the budget can
      // cover in any direction rather than a diamond.
      if (Math.max(Math.abs(nextCol - start.col), Math.abs(nextRow - start.row)) > radius) continue;
      if (!isNodeOpen(grid, isPassable, size, nextCol, nextRow)) continue;
      // A diagonal between two blocked corners is a body squeezing through a
      // seam in the wall; both orthogonal neighbours have to be open for it.
      if (dc !== 0 && dr !== 0) {
        if (!isNodeOpen(grid, isPassable, size, col + dc, row)) continue;
        if (!isNodeOpen(grid, isPassable, size, col, row + dr)) continue;
      }
      // Areas are answered by the cell tests above; lines need this one.
      if (
        canStep &&
        !laneClear(
          canStep,
          lanes,
          footprintCentre(grid, size, col, row),
          footprintCentre(grid, size, nextCol, nextRow),
        )
      ) {
        continue;
      }
      const step = dc !== 0 && dr !== 0 ? DIAGONAL : 1;
      const tentative = g + step;
      const known = gScore.get(nextIndex);
      if (known !== undefined && tentative >= known - 1e-9) continue;
      gScore.set(nextIndex, tentative);
      cameFrom.set(nextIndex, current.index);
      const h = heuristic(goalCol - nextCol, goalRow - nextRow);
      open.push({ index: nextIndex, f: tentative + h, h });
    }
  }

  const endIndex = reached ? goalIndex : bestIndex;
  const cells: number[] = [endIndex];
  let cursor = endIndex;
  while (cursor !== startIndex) {
    const previous = cameFrom.get(cursor);
    if (previous === undefined) break;
    cells.push(previous);
    cursor = previous;
  }
  cells.reverse();

  const points = cells.map((index) => {
    const col = index % width;
    return cellPosition(grid, col, (index - col) / width);
  });
  const smoothed =
    options.smooth === false ? points : smoothWalk(points, grid, isPassable, canStep, size);
  return { points: smoothed, truncated: !reached, visited };
}

/** Cells a figure can still stand on this turn (stage 27j). */
export interface ReachOptions extends Omit<WalkPlanOptions, 'smooth'> {
  /**
   * How far the figure may walk, counted the way A* counts it: one per
   * orthogonal step, √2 per diagonal. The caller converts its metres — it is
   * the one that knows the scene's scale and what the going costs.
   */
  budgetCells: number;
}

/** One reachable cell: where the figure would stand and what getting there costs. */
export interface ReachCell extends ScenePoint {
  /** Cost in the same units as `budgetCells`, cheapest route first. */
  cost: number;
}

/**
 * Every square the figure can still reach this turn — the shaded floor a
 * tactical game shows the moment you pick somebody up (stage 27j).
 *
 * Dijkstra rather than A*, because there is no goal: the question is „where
 * *could* I go", and answering it for one square at a time is what made the old
 * map a guessing game. The frontier is the budget itself, so the flood is
 * bounded by the turn rather than by the map — a MOVE 6 character on a 100 px
 * grid opens about a hundred and twenty cells, which is a frame's worth of work
 * and is why this may run under the cursor.
 *
 * The start cell is included: standing still is always affordable, and leaving
 * it out would draw a hole under the figure.
 */
export function reachableCells(from: ScenePoint, options: ReachOptions): ReachCell[] {
  const { grid, isPassable, canStep } = options;
  const size = Math.max(1, Math.round(options.size ?? 1));
  // One lane per cell of the footprint, worked out once: the edge test runs on
  // every neighbour of every node, and a 2×2 figure has four of them.
  const lanes = footprintLanes({ size, cell: grid.cell });
  const budget = options.budgetCells;
  if (!Number.isFinite(budget) || budget < 0) return [];
  if (grid.cols < size || grid.rows < size || grid.cell <= 0) return [];

  const radius = Math.max(1, Math.round(options.radiusCells ?? WALK_RADIUS_CELLS));
  const maxVisited = Math.max(1, Math.round(options.maxVisited ?? WALK_MAX_VISITED));
  const start = cellOfPosition(grid, from);
  if (!isNodeOpen(grid, isPassable, size, start.col, start.row)) return [];

  const width = grid.cols;
  const startIndex = start.row * width + start.col;
  const cost = new Map<number, number>([[startIndex, 0]]);
  const closed = new Set<number>();
  const open = new NodeHeap();
  open.push({ index: startIndex, f: 0, h: 0 });

  const cells: ReachCell[] = [];
  let visited = 0;
  while (open.size > 0 && visited < maxVisited) {
    const current = open.pop()!;
    if (closed.has(current.index)) continue;
    closed.add(current.index);
    visited++;

    const col = current.index % width;
    const row = (current.index - col) / width;
    const g = cost.get(current.index) ?? 0;
    cells.push({ ...cellPosition(grid, col, row), cost: g });

    for (const [dc, dr] of NEIGHBOURS) {
      const nextCol = col + dc;
      const nextRow = row + dr;
      const nextIndex = nextRow * width + nextCol;
      if (closed.has(nextIndex)) continue;
      if (Math.max(Math.abs(nextCol - start.col), Math.abs(nextRow - start.row)) > radius) continue;
      const step = dc !== 0 && dr !== 0 ? DIAGONAL : 1;
      const tentative = g + step;
      // The budget is the whole point of the flood: a square the turn cannot
      // pay for is not shaded, and a hair of tolerance keeps floating-point
      // sums of √2 from shaving the last ring off a diagonal walk.
      if (tentative > budget + 1e-9) continue;
      if (!isNodeOpen(grid, isPassable, size, nextCol, nextRow)) continue;
      if (dc !== 0 && dr !== 0) {
        if (!isNodeOpen(grid, isPassable, size, col + dc, row)) continue;
        if (!isNodeOpen(grid, isPassable, size, col, row + dr)) continue;
      }
      if (
        canStep &&
        !laneClear(
          canStep,
          lanes,
          footprintCentre(grid, size, col, row),
          footprintCentre(grid, size, nextCol, nextRow),
        )
      ) {
        continue;
      }
      const known = cost.get(nextIndex);
      if (known !== undefined && tentative >= known - 1e-9) continue;
      cost.set(nextIndex, tentative);
      open.push({ index: nextIndex, f: tentative, h: 0 });
    }
  }
  return cells;
}

/**
 * Removes the waypoints a straight line already covers.
 *
 * Two things need this. A twenty-square corridor is one leg, not twenty, and
 * `token:move` carries at most `TOKEN_PATH_MAX_POINTS` of them; and a route
 * drawn as a staircase of diagonal steps looks like a bug even when its length
 * is right. The check is `isRunOpen`, which sweeps the whole footprint — so
 * straightening can shorten a route but never push it through anything.
 */
function smoothWalk(
  points: readonly ScenePoint[],
  grid: WalkGrid,
  isPassable: WalkPassable,
  canStep: WalkStep | undefined,
  size: number,
): ScenePoint[] {
  if (points.length <= 2) return [...points];
  const lanes = footprintLanes({ size, cell: grid.cell });
  const result: ScenePoint[] = [points[0]!];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let next = anchor + 1;
    for (let candidate = points.length - 1; candidate > anchor + 1; candidate--) {
      if (isRunOpen(grid, isPassable, canStep, lanes, size, points[anchor]!, points[candidate]!)) {
        next = candidate;
        break;
      }
    }
    result.push(points[next]!);
    anchor = next;
  }
  return result;
}

/** What is left of a route once the turn's movement runs out (stage 14c/16e). */
export interface WalkBudget {
  /** Metres of ground still walkable — already divided by any cost factor. */
  metresLeft: number;
  /** Metres of budget one metre of ground costs (2 in hard going). */
  costFactor: number;
}

export interface ClippedWalk {
  /** The part that will actually be walked; always at least the first point. */
  points: ScenePoint[];
  /** Ground covered by `points`, in metres. */
  metres: number;
  /** Budget that costs, i.e. `metres × costFactor`. */
  spent: number;
  /** False when the budget cut the route short. */
  complete: boolean;
}

/**
 * „Go as far as you can" (decision of stage 16e) rather than „you cannot go
 * there". A click past the edge of the turn walks to the edge of the turn, the
 * way XCOM and Divinity do it, and the marker showing where the figure will
 * stop is drawn from this.
 *
 * The cut lands on a **waypoint**, never in the middle of a leg, and that is not
 * a rounding convenience: waypoints are snapped positions, so the server's own
 * `snapTokenPosition` cannot nudge the landing past a budget the client thought
 * it had met — which would refuse the move it just promised.
 */
export function clipWalkToBudget(
  points: readonly ScenePoint[],
  scene: Pick<SceneView, 'grid' | 'metersPerSquare'>,
  budget: WalkBudget | null,
): ClippedWalk {
  const first = points[0];
  if (!first) return { points: [], metres: 0, spent: 0, complete: true };
  const full = polylineMetres(points, scene);
  const factor = budget && budget.costFactor > 0 ? budget.costFactor : 1;
  if (!budget) return { points: [...points], metres: full, spent: full * factor, complete: true };

  const allowed = Math.max(0, budget.metresLeft) / factor;
  // A tenth of a metre of slack: the metre count is rounded to one decimal on
  // both ends of the wire, and „12 m of 12 m" must not come back refused.
  if (full <= allowed + 0.05) {
    return { points: [...points], metres: full, spent: full * factor, complete: true };
  }

  const kept: ScenePoint[] = [first];
  for (let i = 1; i < points.length; i++) {
    const candidate = [...kept, points[i]!];
    if (polylineMetres(candidate, scene) > allowed + 0.05) break;
    kept.push(points[i]!);
  }
  const metres = polylineMetres(kept, scene);
  return { points: kept, metres, spent: metres * factor, complete: false };
}

/**
 * Thins a route to fit `TOKEN_PATH_MAX_POINTS`, keeping both ends.
 *
 * Only a genuine maze gets here — a smoothed route is usually two or three
 * points. Dropping waypoints makes the reported route slightly shorter than the
 * one walked, which is the same direction the drag path already errs in (a
 * thinned drag undercharges by the wobble it removed), and the alternative is a
 * payload the server rejects outright and replaces with a straight line.
 */
export function thinWalk(points: readonly ScenePoint[], limit: number): ScenePoint[] {
  if (points.length <= limit || limit < 2) return [...points];
  const result: ScenePoint[] = [];
  const step = (points.length - 1) / (limit - 1);
  for (let i = 0; i < limit - 1; i++) result.push(points[Math.round(i * step)]!);
  result.push(points[points.length - 1]!);
  return result;
}

/**
 * The first step of a walked route that goes through something solid, or null
 * when the whole route is clear.
 *
 * The server's half of stage 16e's promise. The client plans routes that respect
 * walls and covers, but planning is not enforcement: a **drag** never goes near
 * the planner, so before this existed a player could pull their figure straight
 * through a wall and the server stored it. The check has to live here rather
 * than in the pathfinder because the two callers disagree about everything else
 * — one plans, one judges — and agree only on the geometry.
 *
 * Returns the offending step rather than a boolean so the refusal can say
 * *where* the route stopped, which is the difference between „nie da się" and
 * „nie tędy".
 */
export function firstBlockedStep(
  path: readonly ScenePoint[],
  segments: readonly Segment[],
  footprint?: { size: number; cell: number },
): { from: ScenePoint; to: ScenePoint } | null {
  if (segments.length === 0) return null;
  const lanes = footprintLanes(footprint);
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1]!;
    const to = path[i]!;
    for (const lane of lanes) {
      const a = { x: from.x + lane.x, y: from.y + lane.y };
      const b = { x: to.x + lane.x, y: to.y + lane.y };
      if (!isSegmentClear(a, b, segments)) return { from, to };
    }
  }
  return null;
}

/**
 * Offsets from a figure's centre to the centre of every cell it stands on.
 *
 * A 1×1 token is one lane through its middle, which is what this check has
 * always traced. Anything bigger is *four* lanes or more, and the difference is
 * not academic: a 2×2 figure walking a corridor keeps its centre a whole metre
 * away from each wall, so a single centre line lets half the token pass through
 * masonry (stage 27j, 21.08).
 *
 * Cell centres rather than the outline, because that is what the planner tests
 * (`isNodeOpen` samples the same points): the server's verdict and the route the
 * client drew have to be able to agree, and they can only do that by asking the
 * geometry the same question.
 */
function footprintLanes(footprint?: { size: number; cell: number }): ScenePoint[] {
  const size = Math.max(1, Math.round(footprint?.size ?? 1));
  const cell = footprint?.cell ?? 0;
  if (size === 1 || cell <= 0) return [{ x: 0, y: 0 }];
  const lanes: ScenePoint[] = [];
  const first = -((size - 1) / 2) * cell;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      lanes.push({ x: first + col * cell, y: first + row * cell });
    }
  }
  return lanes;
}
