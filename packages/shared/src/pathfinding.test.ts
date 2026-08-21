import { describe, expect, it } from 'vitest';
import {
  WALK_MAX_VISITED,
  clipWalkToBudget,
  firstBlockedStep,
  planWalk,
  reachableCells,
  thinWalk,
  walkGridForScene,
  type ScenePoint,
  type WalkGrid,
} from './index.js';

/**
 * A 10 × 10 lattice of 100 px cells anchored at the origin — the shape of a
 * small indoor scene, and small enough that a blocked-cell set can be written
 * out by hand.
 */
const GRID: WalkGrid = { cell: 100, originX: 0, originY: 0, cols: 10, rows: 10 };

/** Scene numbers for the metre arithmetic: one 100 px square is 2 m (CP RED). */
const SCENE = {
  grid: { sizePx: 100, offsetX: 0, offsetY: 0, color: '#334155', alpha: 0.3, visible: true },
  metersPerSquare: 2,
};

/** Turns a set of blocked „col,row" cells into the injected predicate. */
function blocking(blocked: readonly string[], grid: WalkGrid = GRID) {
  const set = new Set(blocked);
  return (centre: ScenePoint): boolean => {
    const col = Math.floor((centre.x - grid.originX) / grid.cell);
    const row = Math.floor((centre.y - grid.originY) / grid.cell);
    return !set.has(`${col},${row}`);
  };
}

/** Top-left position of a cell — what a waypoint of a plan is. */
function at(col: number, row: number, grid: WalkGrid = GRID): ScenePoint {
  return { x: grid.originX + col * grid.cell, y: grid.originY + row * grid.cell };
}

/** Every cell a route passes through, sampled at half a cell. */
function cellsAlong(points: readonly ScenePoint[], grid: WalkGrid = GRID): Set<string> {
  const seen = new Set<string>();
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!;
    const to = points[i]!;
    const steps = Math.max(
      1,
      Math.ceil((Math.hypot(to.x - from.x, to.y - from.y) / grid.cell) * 2),
    );
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      seen.add(
        `${Math.floor((x - grid.originX) / grid.cell)},${Math.floor((y - grid.originY) / grid.cell)}`,
      );
    }
  }
  return seen;
}

describe('planWalk', () => {
  it('walks a straight line as a single leg', () => {
    const plan = planWalk(at(0, 0), at(5, 0), { grid: GRID, isPassable: () => true });
    expect(plan).not.toBeNull();
    expect(plan!.truncated).toBe(false);
    expect(plan!.points).toEqual([at(0, 0), at(5, 0)]);
  });

  it('turns an L-shaped corner instead of walking through the wall', () => {
    // A vertical wall at col 3 with a gap at row 5: the only way from the left
    // half to the right half is round the bottom of it.
    const wall = ['3,0', '3,1', '3,2', '3,3', '3,4'];
    const plan = planWalk(at(1, 1), at(5, 1), { grid: GRID, isPassable: blocking(wall) });
    expect(plan).not.toBeNull();
    expect(plan!.truncated).toBe(false);
    const cells = cellsAlong(plan!.points);
    for (const blocked of wall) expect(cells.has(blocked)).toBe(false);
    // A route that bends is longer than the straight line it could not take.
    expect(plan!.points.length).toBeGreaterThan(2);
    expect(plan!.points[plan!.points.length - 1]).toEqual(at(5, 1));
  });

  it('stops at the nearest reachable cell when the goal is walled off', () => {
    // A 2 × 2 room in the corner, sealed: the goal inside it is unreachable.
    const wall = ['2,0', '2,1', '2,2', '0,2', '1,2'];
    const plan = planWalk(at(5, 5), at(0, 0), { grid: GRID, isPassable: blocking(wall) });
    expect(plan).not.toBeNull();
    expect(plan!.truncated).toBe(true);
    const end = plan!.points[plan!.points.length - 1]!;
    // It got as close to the sealed room as the walls allow, and stopped
    // outside it rather than refusing to move at all.
    expect(plan!.points.length).toBeGreaterThan(1);
    expect(cellsAlong(plan!.points).has('0,0')).toBe(false);
    expect(Math.hypot(end.x, end.y)).toBeLessThan(Math.hypot(at(5, 5).x, at(5, 5).y));
  });

  it('refuses to start when the token is not standing anywhere walkable', () => {
    expect(planWalk(at(1, 1), at(5, 5), { grid: GRID, isPassable: () => false })).toBeNull();
  });

  it('clamps a goal outside the lattice to its edge', () => {
    const plan = planWalk(at(1, 1), at(40, 40), { grid: GRID, isPassable: () => true });
    expect(plan).not.toBeNull();
    const end = plan!.points[plan!.points.length - 1]!;
    expect(end).toEqual(at(9, 9));
    expect(plan!.truncated).toBe(false);
  });

  it('does not squeeze a 2×2 token through a one-cell gap', () => {
    // A full-height wall with a single open cell at row 5: passable for a 1×1
    // token, far too narrow for a figure two cells across.
    const wall = ['4,0', '4,1', '4,2', '4,3', '4,4', '4,6', '4,7', '4,8', '4,9'];
    const options = { grid: GRID, isPassable: blocking(wall) };

    const small = planWalk(at(1, 5), at(7, 5), options);
    expect(small!.truncated).toBe(false);
    expect(cellsAlong(small!.points).has('4,5')).toBe(true);

    const large = planWalk(at(1, 5), at(7, 5), { ...options, size: 2 });
    expect(large!.truncated).toBe(true);
    for (const point of large!.points) expect(point.x).toBeLessThan(at(4, 0).x);
  });

  it('lets a 2×2 token through a two-cell gap', () => {
    const wall = ['4,0', '4,1', '4,2', '4,3', '4,6', '4,7', '4,8', '4,9'];
    const plan = planWalk(at(1, 4), at(7, 4), { grid: GRID, isPassable: blocking(wall), size: 2 });
    expect(plan!.truncated).toBe(false);
    expect(plan!.points[plan!.points.length - 1]).toEqual(at(7, 4));
  });

  it('never cuts a diagonal between two blocked corners', () => {
    // The classic seam: (2,1) and (1,2) blocked, so the step from (1,1) to
    // (2,2) would pass exactly through the join of two walls.
    const plan = planWalk(at(1, 1), at(2, 2), {
      grid: GRID,
      isPassable: blocking(['2,1', '1,2']),
      smooth: false,
    });
    // The cell is reachable — the long way round — but never by the one step
    // that would thread the join of the two walls.
    expect(plan!.truncated).toBe(false);
    expect(plan!.points.length).toBeGreaterThan(2);
    const cells = cellsAlong(plan!.points);
    expect(cells.has('2,1')).toBe(false);
    expect(cells.has('1,2')).toBe(false);
  });

  it('gives the same polyline for the same pair of points', () => {
    const wall = ['3,0', '3,1', '3,2', '3,3', '3,4', '6,9', '6,8', '6,7', '6,6'];
    const options = { grid: GRID, isPassable: blocking(wall) };
    const first = planWalk(at(0, 0), at(9, 9), options);
    const second = planWalk(at(0, 0), at(9, 9), options);
    expect(second!.points).toEqual(first!.points);
    expect(second!.visited).toBe(first!.visited);
  });

  it('keeps the search inside its radius', () => {
    const plan = planWalk(at(0, 0), at(9, 9), {
      grid: GRID,
      isPassable: () => true,
      radiusCells: 3,
    });
    expect(plan!.truncated).toBe(true);
    const end = plan!.points[plan!.points.length - 1]!;
    expect(end).toEqual(at(3, 3));
  });

  it('honours the visited ceiling on a hopeless search', () => {
    // A big empty lattice with the goal sealed off: without a ceiling the
    // search would expand every cell it can reach before giving up.
    const big: WalkGrid = { cell: 100, originX: 0, originY: 0, cols: 300, rows: 300 };
    const plan = planWalk(at(0, 0, big), at(299, 299, big), {
      grid: big,
      isPassable: () => true,
      radiusCells: 500,
      maxVisited: 200,
    });
    expect(plan!.visited).toBeLessThanOrEqual(200);
    expect(plan!.truncated).toBe(true);
  });

  it('defaults the ceiling to WALK_MAX_VISITED', () => {
    const big: WalkGrid = { cell: 100, originX: 0, originY: 0, cols: 400, rows: 400 };
    const plan = planWalk(at(0, 0, big), at(399, 0, big), {
      grid: big,
      isPassable: blocking(['1,0', '1,1'], big),
      radiusCells: 400,
    });
    expect(plan!.visited).toBeLessThanOrEqual(WALK_MAX_VISITED);
  });

  it('plans on the scene grid, offset included', () => {
    const grid = walkGridForScene({ width: 1000, height: 1000, grid: { sizePx: 100 } }, 30, 30);
    expect(grid.cols).toBe(9);
    expect(grid.rows).toBe(9);
    const plan = planWalk({ x: 30, y: 30 }, { x: 430, y: 30 }, { grid, isPassable: () => true });
    // Every waypoint is a snapped position: origin plus a whole number of cells.
    for (const point of plan!.points) {
      expect((point.x - 30) % 100).toBe(0);
      expect((point.y - 30) % 100).toBe(0);
    }
  });
});

describe('clipWalkToBudget', () => {
  const route = [at(0, 0), at(6, 0)]; // six squares = 12 m

  it('leaves a route that fits alone', () => {
    const clipped = clipWalkToBudget(route, SCENE, { metresLeft: 12, costFactor: 1 });
    expect(clipped.complete).toBe(true);
    expect(clipped.metres).toBe(12);
    expect(clipped.spent).toBe(12);
  });

  it('cuts a route that does not fit, and reports where it stops', () => {
    const legs = [at(0, 0), at(2, 0), at(4, 0), at(6, 0)];
    const clipped = clipWalkToBudget(legs, SCENE, { metresLeft: 5, costFactor: 1 });
    expect(clipped.complete).toBe(false);
    // Waypoints only: four metres fits, eight does not, so it stops at the
    // first one — where the token also snaps.
    expect(clipped.points).toEqual([at(0, 0), at(2, 0)]);
    expect(clipped.metres).toBe(4);
  });

  it('charges hard going double, so half the ground fits', () => {
    const legs = [at(0, 0), at(1, 0), at(2, 0), at(3, 0), at(4, 0), at(5, 0), at(6, 0)];
    // Twelve metres of budget buy six metres of ground when every one costs two.
    const clipped = clipWalkToBudget(legs, SCENE, { metresLeft: 12, costFactor: 2 });
    expect(clipped.metres).toBe(6);
    expect(clipped.spent).toBe(12);
    expect(clipped.complete).toBe(false);
  });

  it('walks nowhere when the budget is gone', () => {
    const clipped = clipWalkToBudget(route, SCENE, { metresLeft: 0, costFactor: 1 });
    expect(clipped.points).toEqual([at(0, 0)]);
    expect(clipped.metres).toBe(0);
    expect(clipped.complete).toBe(false);
  });

  it('measures without judging when nothing is enforcing a budget', () => {
    const clipped = clipWalkToBudget(route, SCENE, null);
    expect(clipped.complete).toBe(true);
    expect(clipped.metres).toBe(12);
  });
});

describe('thinWalk', () => {
  it('leaves a short route alone', () => {
    const points = [at(0, 0), at(1, 0), at(2, 0)];
    expect(thinWalk(points, 64)).toEqual(points);
  });

  it('keeps both ends of a route it has to thin', () => {
    const points = Array.from({ length: 100 }, (_, i) => at(i % 10, Math.floor(i / 10)));
    const thinned = thinWalk(points, 10);
    expect(thinned).toHaveLength(10);
    expect(thinned[0]).toEqual(points[0]);
    expect(thinned[9]).toEqual(points[99]);
  });
});

/**
 * Stage 27j: the shaded floor. A budget is not a number in the corner of the
 * screen — it is the set of squares the figure may still stand on, and the map
 * has to be able to draw it before anybody clicks.
 */
describe('reachableCells (stage 27j)', () => {
  /** „col,row" of every cell the flood returned, for set comparisons. */
  function keys(cells: readonly { x: number; y: number }[], grid: WalkGrid = GRID): Set<string> {
    return new Set(
      cells.map(
        (cell) => `${(cell.x - grid.originX) / grid.cell},${(cell.y - grid.originY) / grid.cell}`,
      ),
    );
  }

  it('always includes the square the figure is standing on', () => {
    const cells = reachableCells(at(4, 4), { grid: GRID, isPassable: () => true, budgetCells: 0 });
    expect(cells).toEqual([{ x: 400, y: 400, cost: 0 }]);
  });

  it('opens the eight neighbours for one step of budget, and no more', () => {
    const cells = reachableCells(at(4, 4), { grid: GRID, isPassable: () => true, budgetCells: 1 });
    // The four orthogonal ones cost 1; the diagonals cost √2 and are out of reach.
    expect(keys(cells)).toEqual(new Set(['4,4', '3,4', '5,4', '4,3', '4,5']));
  });

  it('pays √2 for a diagonal, exactly as the route does', () => {
    const cells = reachableCells(at(4, 4), {
      grid: GRID,
      isPassable: () => true,
      budgetCells: Math.SQRT2,
    });
    const corner = cells.find((cell) => cell.x === 500 && cell.y === 500);
    expect(corner?.cost).toBeCloseTo(Math.SQRT2, 6);
  });

  it('does not shade the far side of a wall', () => {
    // A full-height wall in column 5 — everything east of it needs a way round
    // that a three-cell budget cannot afford.
    const wall = Array.from({ length: 10 }, (_, row) => `5,${row}`);
    const cells = reachableCells(at(4, 4), {
      grid: GRID,
      isPassable: blocking(wall),
      budgetCells: 3,
    });
    expect([...keys(cells)].some((key) => Number(key.split(',')[0]) >= 5)).toBe(false);
  });

  it('refuses to shade anything when the figure is standing somewhere impossible', () => {
    expect(
      reachableCells(at(4, 4), { grid: GRID, isPassable: () => false, budgetCells: 5 }),
    ).toEqual([]);
  });

  it('needs the whole footprint of a big figure, not just its corner', () => {
    // A 2×2 figure at (0,0) with a pillar at (2,0): the square east of it is
    // affordable, but the figure would not fit on it.
    const cells = reachableCells(at(0, 0), {
      grid: GRID,
      isPassable: blocking(['2,0']),
      size: 2,
      budgetCells: 1,
    });
    expect(keys(cells).has('1,0')).toBe(false);
    expect(keys(cells).has('0,1')).toBe(true);
  });

  it('honours the edge test the GM hands in, the way the route does', () => {
    // A line the figure may not cross between column 4 and column 5.
    const cells = reachableCells(at(4, 4), {
      grid: GRID,
      isPassable: () => true,
      canStep: (from, to) => !(from.x < 500 && to.x > 500) && !(from.x > 500 && to.x < 500),
      budgetCells: 2,
    });
    expect(keys(cells).has('5,4')).toBe(false);
    expect(keys(cells).has('3,4')).toBe(true);
  });

  it('reports the cheapest cost for every square, not the first one found', () => {
    const cells = reachableCells(at(0, 0), { grid: GRID, isPassable: () => true, budgetCells: 4 });
    const two = cells.find((cell) => cell.x === 200 && cell.y === 0);
    expect(two?.cost).toBeCloseTo(2, 6);
  });

  it('stops at the node ceiling instead of flooding a huge map', () => {
    const big: WalkGrid = { cell: 10, originX: 0, originY: 0, cols: 400, rows: 400 };
    const cells = reachableCells(
      { x: 2000, y: 2000 },
      { grid: big, isPassable: () => true, budgetCells: 1000, maxVisited: 500 },
    );
    expect(cells.length).toBeLessThanOrEqual(500);
  });
});

describe('firstBlockedStep', () => {
  /** A wall down the middle of the lattice: x = 300, from y = 0 to y = 500. */
  const WALL = [{ x1: 300, y1: 0, x2: 300, y2: 500 }];

  it('lets a route through when nothing stands in the way', () => {
    expect(firstBlockedStep([at(0, 0), at(2, 0), at(2, 4)], WALL)).toBeNull();
  });

  it('finds the step that goes through a wall and names both its ends', () => {
    const blocked = firstBlockedStep([at(1, 1), at(5, 1)], WALL);
    expect(blocked).toEqual({ from: at(1, 1), to: at(5, 1) });
  });

  it('passes a route that goes round the end of the wall', () => {
    // The wall stops at y = 500, so row 6 is open ground.
    expect(firstBlockedStep([at(1, 1), at(1, 6), at(5, 6), at(5, 1)], WALL)).toBeNull();
  });

  it('blames the crossing leg, not the first one', () => {
    const blocked = firstBlockedStep([at(0, 0), at(2, 0), at(5, 0)], WALL);
    expect(blocked).toEqual({ from: at(2, 0), to: at(5, 0) });
  });

  it('has nothing to say about an empty scene or a route of one point', () => {
    expect(firstBlockedStep([at(1, 1), at(5, 1)], [])).toBeNull();
    expect(firstBlockedStep([at(1, 1)], WALL)).toBeNull();
  });
});
