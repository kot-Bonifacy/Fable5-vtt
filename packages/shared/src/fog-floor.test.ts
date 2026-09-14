import { describe, expect, it } from 'vitest';
import { fogFloorPassable, type FloorStanding, type FogShape, type FogState } from './fog.js';
import { firstClosedFloorStep } from './pathfinding.js';

/**
 * „Tylko po odsłoniętym" (GM decision of 13.09.2026): under painted fog a
 * player's figure walks on revealed floor alone. The client's planner and the
 * server's verdict both stand on these two functions.
 */

/** A 100 px lattice anchored at the scene's corner. */
const GRID = { cell: 100, originX: 0, originY: 0 };

function fogOf(...shapes: FogShape[]): Pick<FogState, 'enabled' | 'shapes'> {
  return { enabled: true, shapes: shapes.map((shape, index) => ({ ...shape, id: index + 1 })) };
}

function reveal(x: number, y: number, width: number, height: number): FogShape {
  return { kind: 'rect', mode: 'reveal', x, y, width, height };
}

/** Centre of cell (col, row) on `GRID`. */
function centre(col: number, row: number) {
  return { x: col * 100 + 50, y: row * 100 + 50 };
}

describe('fogFloorPassable', () => {
  const room = fogOf(reveal(0, 0, 500, 300));

  it('lets a figure onto revealed floor and nowhere else', () => {
    const passable = fogFloorPassable(room);
    expect(passable(centre(4, 2))).toBe(true);
    expect(passable(centre(5, 2))).toBe(false);
    expect(passable(centre(0, 3))).toBe(false);
  });

  it('follows the last shape: floor the GM covered again is closed again', () => {
    const covered = fogOf(reveal(0, 0, 500, 300), {
      kind: 'rect',
      mode: 'hide',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const passable = fogFloorPassable(covered);
    expect(passable(centre(0, 0))).toBe(false);
    expect(passable(centre(1, 0))).toBe(true);
  });

  it('confines nothing on a scene that paints no fog', () => {
    expect(fogFloorPassable({ enabled: false, shapes: [] })(centre(9, 9))).toBe(true);
  });

  it('exempts the cells the figure stands on, asked afresh on every call', () => {
    let standing: FloorStanding | null = { x: 800, y: 800, extent: 200 };
    const passable = fogFloorPassable(room, () => standing);
    expect(passable(centre(8, 8))).toBe(true);
    expect(passable(centre(9, 9))).toBe(true);
    expect(passable(centre(10, 8))).toBe(false);
    standing = null;
    expect(passable(centre(8, 8))).toBe(false);
  });
});

describe('firstClosedFloorStep', () => {
  // Two revealed rooms on rows 0–2: columns 0–4 and 7–9, two columns of black between.
  const rooms = fogOf(reveal(0, 0, 500, 300), reveal(700, 0, 300, 300));

  it('lets a route that stays on revealed floor through', () => {
    const route = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 200 },
    ];
    expect(firstClosedFloorStep(route, GRID, fogFloorPassable(rooms))).toBeNull();
  });

  it('refuses the straight line across the black, though both ends are revealed', () => {
    const from = { x: 300, y: 100 };
    const to = { x: 800, y: 100 };
    expect(firstClosedFloorStep([from, to], GRID, fogFloorPassable(rooms))).toEqual({ from, to });
  });

  it('names the leg that stepped off revealed floor, not the first one', () => {
    const route = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 600, y: 0 },
    ];
    expect(firstClosedFloorStep(route, GRID, fogFloorPassable(rooms))).toEqual({
      from: route[1],
      to: route[2],
    });
  });

  it('never lets a straight leg cut the corner the planner walked round', () => {
    // An L of revealed floor: the top row, and the right-hand column under it.
    const ell = fogFloorPassable(fogOf(reveal(0, 0, 300, 100), reveal(200, 0, 100, 300)));
    const roundTheCorner = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
    ];
    expect(firstClosedFloorStep(roundTheCorner, GRID, ell)).toBeNull();
    expect(
      firstClosedFloorStep(
        [
          { x: 0, y: 0 },
          { x: 200, y: 200 },
        ],
        GRID,
        ell,
      ),
    ).not.toBeNull();
  });

  it('holds the whole body of a large figure to the floor, not its middle', () => {
    const passable = fogFloorPassable(rooms);
    const along = [
      { x: 0, y: 100 },
      { x: 200, y: 100 },
    ];
    expect(firstClosedFloorStep(along, GRID, passable, 2)).toBeNull();
    // One row down puts the figure's lower half on row 3, which is black.
    const down = [
      { x: 0, y: 100 },
      { x: 0, y: 200 },
    ];
    expect(firstClosedFloorStep(down, GRID, passable, 2)).toEqual({ from: down[0], to: down[1] });
  });

  it('lets a figure standing in the black step out onto revealed floor — and no deeper in', () => {
    const standing = { x: 500, y: 100, extent: 100 };
    const passable = fogFloorPassable(rooms, () => standing);
    const out = [
      { x: 500, y: 100 },
      { x: 400, y: 100 },
    ];
    expect(firstClosedFloorStep(out, GRID, passable)).toBeNull();
    const deeper = [
      { x: 500, y: 100 },
      { x: 600, y: 100 },
    ];
    expect(firstClosedFloorStep(deeper, GRID, passable)).toEqual({
      from: deeper[0],
      to: deeper[1],
    });
  });

  it('has nothing to judge on a route that never left its square', () => {
    const passable = fogFloorPassable(rooms);
    expect(firstClosedFloorStep([], GRID, passable)).toBeNull();
    expect(firstClosedFloorStep([{ x: 900, y: 900 }], GRID, passable)).toBeNull();
  });

  it('samples the lattice the grid offset shifted', () => {
    // Cells start at (30, 30), so this reveal is exactly cells (0, 0) and (1, 0).
    const shifted = { cell: 100, originX: 30, originY: 30 };
    const passable = fogFloorPassable(fogOf(reveal(30, 30, 200, 100)));
    const across = [
      { x: 30, y: 30 },
      { x: 130, y: 30 },
    ];
    expect(firstClosedFloorStep(across, shifted, passable)).toBeNull();
    const down = [
      { x: 30, y: 30 },
      { x: 30, y: 130 },
    ];
    expect(firstClosedFloorStep(down, shifted, passable)).not.toBeNull();
  });
});
