import { describe, expect, it } from 'vitest';
import {
  computeVisionPolygon,
  computeVisionPolygons,
  isPointInPolygon,
  isPointVisible,
  sceneBoundsSegments,
  type Segment,
} from './vision.js';
import {
  blockingSegments,
  distanceToWall,
  pickWallAt,
  sanitizeWallChain,
  snapWallPoint,
  wallBlocksSight,
  wallMidpoint,
  type WallView,
} from './walls.js';

/**
 * Stage 18a: the geometry that decides what a player is allowed to see.
 *
 * Every case here is a floor plan small enough to reason about on paper — the
 * point is not that the polygon has the right number of vertices, but that the
 * right *points* fall inside and outside it, because that is exactly the
 * question the server asks before it puts a token in a payload.
 */

const BOUNDS = { width: 1000, height: 1000 };

/** Convenience: the polygon an observer sees, scene border always included. */
function seeFrom(
  origin: { x: number; y: number },
  walls: Segment[],
  radiusPx: number | null = null,
) {
  return computeVisionPolygon(origin, [...walls, ...sceneBoundsSegments(BOUNDS)], radiusPx);
}

function wall(id: number, x1: number, y1: number, x2: number, y2: number): WallView {
  return {
    id,
    sceneId: 's',
    kind: 'wall',
    open: false,
    playerToggle: false,
    locked: false,
    armor: 0,
    x1,
    y1,
    x2,
    y2,
  };
}

describe('computeVisionPolygon', () => {
  it('sees the whole scene when nothing blocks', () => {
    const polygon = seeFrom({ x: 500, y: 500 }, []);
    expect(polygon.length).toBeGreaterThanOrEqual(4);
    // Every corner of the map is inside — an empty room hides nothing.
    for (const corner of [
      { x: 10, y: 10 },
      { x: 990, y: 10 },
      { x: 990, y: 990 },
      { x: 10, y: 990 },
    ]) {
      expect(isPointInPolygon(corner, polygon)).toBe(true);
    }
  });

  it('stops at a wall: what is behind it is out, what is in front of it is in', () => {
    // A vertical wall at x = 600, spanning the middle of the map.
    const blocker: Segment = { x1: 600, y1: 200, x2: 600, y2: 800 };
    const polygon = seeFrom({ x: 300, y: 500 }, [blocker]);

    expect(isPointInPolygon({ x: 550, y: 500 }, polygon)).toBe(true);
    expect(isPointInPolygon({ x: 700, y: 500 }, polygon)).toBe(false);
    // Past the end of the wall the view opens up again — a wall casts a shadow,
    // it does not divide the map in two. (The sight line to this point passes
    // above y = 200, clear of the wall's top end; a point whose line of sight
    // grazes that end exactly is ambiguous by construction and is not asserted.)
    expect(isPointInPolygon({ x: 700, y: 50 }, polygon)).toBe(true);
  });

  it('sees around a corner only as far as the corner allows', () => {
    // An L: one arm along y = 400 from x = 400 rightwards, one down x = 400.
    const walls: Segment[] = [
      { x1: 400, y1: 400, x2: 900, y2: 400 },
      { x1: 400, y1: 400, x2: 400, y2: 900 },
    ];
    const polygon = seeFrom({ x: 200, y: 200 }, walls);

    // The near side of both arms is visible…
    expect(isPointInPolygon({ x: 300, y: 300 }, polygon)).toBe(true);
    // …and the pocket behind the corner is not.
    expect(isPointInPolygon({ x: 600, y: 600 }, polygon)).toBe(false);
  });

  it('confines an observer shut inside a room', () => {
    const room: Segment[] = [
      { x1: 200, y1: 200, x2: 400, y2: 200 },
      { x1: 400, y1: 200, x2: 400, y2: 400 },
      { x1: 400, y1: 400, x2: 200, y2: 400 },
      { x1: 200, y1: 400, x2: 200, y2: 200 },
    ];
    const polygon = seeFrom({ x: 300, y: 300 }, room);

    expect(isPointInPolygon({ x: 380, y: 380 }, polygon)).toBe(true);
    expect(isPointInPolygon({ x: 500, y: 300 }, polygon)).toBe(false);
    expect(isPointInPolygon({ x: 900, y: 900 }, polygon)).toBe(false);
  });

  it('honours a sight radius in open space', () => {
    const polygon = seeFrom({ x: 500, y: 500 }, [], 100);
    expect(isPointInPolygon({ x: 560, y: 500 }, polygon)).toBe(true);
    expect(isPointInPolygon({ x: 650, y: 500 }, polygon)).toBe(false);
    // The radius is a limit, not a shape of its own: the map border is further
    // away than the radius, so nothing near it can be inside.
    expect(isPointInPolygon({ x: 20, y: 500 }, polygon)).toBe(false);
  });

  it('lets a wall cut a radius short but never extend it', () => {
    const polygon = seeFrom({ x: 500, y: 500 }, [{ x1: 550, y1: 300, x2: 550, y2: 700 }], 300);
    expect(isPointInPolygon({ x: 530, y: 500 }, polygon)).toBe(true);
    expect(isPointInPolygon({ x: 600, y: 500 }, polygon)).toBe(false);
    // Away from the wall the radius still applies.
    expect(isPointInPolygon({ x: 500, y: 700 }, polygon)).toBe(true);
    expect(isPointInPolygon({ x: 500, y: 900 }, polygon)).toBe(false);
  });

  it('does not blind an observer standing on a wall', () => {
    // A token parked exactly on the segment: the naive raycast terminates every
    // ray at distance zero and the polygon collapses.
    const polygon = seeFrom({ x: 500, y: 500 }, [{ x1: 300, y1: 500, x2: 700, y2: 500 }]);
    expect(polygon.length).toBeGreaterThan(3);
    expect(isPointInPolygon({ x: 500, y: 400 }, polygon)).toBe(true);
  });

  it('combines the polygons of several sources', () => {
    const walls = [...sceneBoundsSegments(BOUNDS), { x1: 500, y1: 0, x2: 500, y2: 1000 }];
    // The wall runs the full height, so neither observer can see the other half.
    const polygons = computeVisionPolygons(
      [
        { origin: { x: 200, y: 500 }, radiusPx: null },
        { origin: { x: 800, y: 500 }, radiusPx: null },
      ],
      walls,
    );
    expect(polygons).toHaveLength(2);
    expect(isPointVisible({ x: 300, y: 500 }, polygons)).toBe(true);
    expect(isPointVisible({ x: 700, y: 500 }, polygons)).toBe(true);
    // One source alone would answer „no" to one of those two.
    expect(isPointInPolygon({ x: 700, y: 500 }, polygons[0]!)).toBe(false);
  });

  it('sees nothing worth reporting without segments', () => {
    expect(computeVisionPolygon({ x: 0, y: 0 }, [])).toEqual([]);
    expect(isPointVisible({ x: 0, y: 0 }, [])).toBe(false);
  });
});

describe('walls', () => {
  it('blocks sight by kind and door state', () => {
    expect(wallBlocksSight({ kind: 'wall', open: false })).toBe(true);
    expect(wallBlocksSight({ kind: 'window', open: false })).toBe(false);
    expect(wallBlocksSight({ kind: 'door', open: false })).toBe(true);
    expect(wallBlocksSight({ kind: 'door', open: true })).toBe(false);
  });

  it('an opened door stops being a segment the raycast sees', () => {
    const walls: WallView[] = [
      wall(1, 0, 0, 100, 0),
      { ...wall(2, 100, 0, 200, 0), kind: 'door', open: false },
    ];
    expect(blockingSegments(walls)).toHaveLength(2);
    walls[1]!.open = true;
    expect(blockingSegments(walls)).toHaveLength(1);
  });

  it('turns a drawn chain into segments and rejects the useless ones', () => {
    const segments = sanitizeWallChain([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(segments).toEqual([
      { x1: 0, y1: 0, x2: 100, y2: 0 },
      { x1: 100, y1: 0, x2: 100, y2: 100 },
    ]);
    // A click that never moved is not a wall.
    expect(sanitizeWallChain([{ x: 5, y: 5 }])).toBeNull();
    expect(
      sanitizeWallChain([
        { x: 5, y: 5 },
        { x: 5, y: 5 },
      ]),
    ).toBeNull();
    expect(sanitizeWallChain([{ x: 5, y: Number.NaN }])).toBeNull();
    expect(sanitizeWallChain('nope')).toBeNull();
  });

  it('picks the wall a click is nearest to, within tolerance', () => {
    const walls = [wall(1, 0, 0, 100, 0), wall(2, 0, 200, 100, 200)];
    expect(pickWallAt(walls, { x: 50, y: 8 }, 20)?.id).toBe(1);
    expect(pickWallAt(walls, { x: 50, y: 195 }, 20)?.id).toBe(2);
    expect(pickWallAt(walls, { x: 50, y: 100 }, 20)).toBeNull();
    expect(distanceToWall({ x: 50, y: 30 }, walls[0]!)).toBe(30);
    expect(wallMidpoint(walls[0]!)).toEqual({ x: 50, y: 0 });
  });

  it('snaps to an existing endpoint before it snaps to the grid', () => {
    const walls = [wall(1, 300, 300, 400, 300)];
    // Six pixels off an endpoint: the endpoint wins, even though the grid
    // intersection at (300,300) happens to be the same point here…
    expect(snapWallPoint({ x: 306, y: 302 }, walls, { gridSizePx: 100 })).toEqual({
      x: 300,
      y: 300,
    });
    // …and here it is not: the endpoint is nowhere near a grid line.
    const odd = [wall(2, 317, 486, 400, 486)];
    expect(snapWallPoint({ x: 320, y: 490 }, odd, { gridSizePx: 100 })).toEqual({ x: 317, y: 486 });
    // Far from any wall, the grid takes over.
    expect(snapWallPoint({ x: 612, y: 688 }, walls, { gridSizePx: 100 })).toEqual({
      x: 600,
      y: 700,
    });
    // Gridless scenes just round.
    expect(snapWallPoint({ x: 612.4, y: 688.6 }, [], { gridSizePx: null })).toEqual({
      x: 612,
      y: 689,
    });
  });
});
