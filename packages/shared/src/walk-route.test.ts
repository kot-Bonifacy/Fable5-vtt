import { describe, expect, it } from 'vitest';
import {
  firstFigureBlock,
  laneHitsFigure,
  overlapsFigure,
  pointInFigure,
  projectOntoRoute,
  routeLengths,
  routeWaypointsBefore,
} from './walk-route.js';

const C = 50;
const at = (col: number, row: number) => ({ x: col * C, y: row * C });

describe('projectOntoRoute', () => {
  const route = [at(0, 0), at(4, 0), at(4, 3)];

  it('measures the route', () => {
    expect(routeLengths(route)).toEqual([0, 200, 350]);
  });

  it('puts a point beside the route back on it', () => {
    const hit = projectOntoRoute(route, { x: 120, y: 30 });
    expect(hit.point).toEqual({ x: 120, y: 0 });
    expect(hit.distance).toBe(120);
    expect(hit.offset).toBe(30);
  });

  it('pulls a point behind a wall onto the nearest leg', () => {
    // A hand-made frame far off the route lands on the route, not where it was sent.
    const hit = projectOntoRoute(route, { x: 900, y: 900 });
    expect(hit.point).toEqual(at(4, 3));
    expect(hit.distance).toBe(350);
  });

  it('never goes before the start', () => {
    expect(projectOntoRoute(route, { x: -500, y: 0 }).distance).toBe(0);
  });

  it('lists the waypoints already passed', () => {
    expect(routeWaypointsBefore(route, 120)).toEqual([]);
    expect(routeWaypointsBefore(route, 260)).toEqual([at(4, 0)]);
    expect(routeWaypointsBefore(route, 350)).toEqual([at(4, 0)]);
  });
});

describe('firstFigureBlock', () => {
  const none = { pass: [], land: [] };

  it('lets a free route through', () => {
    expect(firstFigureBlock([at(0, 0), at(5, 0)], 1, C, none)).toBeNull();
  });

  it('stops a walk through a figure on the way', () => {
    const enemy = { ...at(2, 0), size: 1 };
    expect(firstFigureBlock([at(0, 0), at(5, 0)], 1, C, { pass: [enemy], land: [enemy] })).toBe(
      'pass',
    );
  });

  it('lets a figure walk alongside another', () => {
    const enemy = { ...at(2, 1), size: 1 };
    expect(
      firstFigureBlock([at(0, 0), at(5, 0)], 1, C, { pass: [enemy], land: [enemy] }),
    ).toBeNull();
  });

  it('does not cut a corner diagonally past a figure', () => {
    const enemy = { ...at(1, 0), size: 1 };
    expect(firstFigureBlock([at(0, 0), at(1, 1)], 1, C, { pass: [enemy], land: [] })).toBe('pass');
  });

  it('lets an ally be walked through but not stood on', () => {
    const ally = { ...at(2, 0), size: 1 };
    expect(firstFigureBlock([at(0, 0), at(5, 0)], 1, C, { pass: [], land: [ally] })).toBeNull();
    expect(firstFigureBlock([at(0, 0), at(2, 0)], 1, C, { pass: [], land: [ally] })).toBe('land');
  });

  it('checks the whole footprint of a large figure', () => {
    const enemy = { ...at(3, 1), size: 1 };
    // A 2×2 figure walking row 0 covers rows 0–1, so the figure on row 1 is in the way.
    expect(firstFigureBlock([at(0, 0), at(6, 0)], 2, C, { pass: [enemy], land: [] })).toBe('pass');
  });

  it('lets a figure step off one it was placed on', () => {
    const under = { ...at(0, 0), size: 1 };
    expect(
      firstFigureBlock([at(0, 0), at(3, 0)], 1, C, { pass: [under], land: [under] }),
    ).toBeNull();
  });
});

describe('planner questions agree with firstFigureBlock', () => {
  const enemy = { ...at(2, 0), size: 1 };
  const centre = (col: number, row: number) => ({ x: col * C + C / 2, y: row * C + C / 2 });

  it('a cell centre inside a figure is taken', () => {
    expect(pointInFigure(centre(2, 0), enemy, C)).toBe(true);
    expect(pointInFigure(centre(3, 0), enemy, C)).toBe(false);
  });

  it('a lane through the figure is blocked, a lane alongside is not', () => {
    expect(laneHitsFigure(centre(0, 0), centre(5, 0), enemy, C)).toBe(true);
    expect(laneHitsFigure(centre(0, 1), centre(5, 1), enemy, C)).toBe(false);
    // Corner cut: the same answer the sweep gives.
    const corner = { ...at(1, 0), size: 1 };
    expect(laneHitsFigure(centre(0, 0), centre(1, 1), corner, C)).toBe(true);
    expect(firstFigureBlock([at(0, 0), at(1, 1)], 1, C, { pass: [corner], land: [] })).toBe('pass');
  });

  it('knows when a figure already overlaps the mover', () => {
    expect(overlapsFigure(at(2, 0), 1, C, enemy)).toBe(true);
    expect(overlapsFigure(at(1, 0), 2, C, enemy)).toBe(true);
    expect(overlapsFigure(at(0, 0), 2, C, enemy)).toBe(false);
  });
});
