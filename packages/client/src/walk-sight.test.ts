import { describe, expect, it } from 'vitest';
import { isPointVisible, planWalk, type ScenePoint } from '@vtt/shared';
import { sightStepTest, walkFloorFor } from './map/walk-sight.js';

describe('walkFloorFor', () => {
  it('confines a route to sight under dynamic vision once it has arrived', () => {
    expect(walkFloorFor('dynamic', true)).toBe('sight');
  });

  it('leaves the floor open under dynamic vision until the first field of view', () => {
    expect(walkFloorFor('dynamic', false)).toBe('open');
  });

  it('keeps a route on revealed floor under painted fog, vision push or not (13.09.2026)', () => {
    expect(walkFloorFor('fog', true)).toBe('revealed');
    expect(walkFloorFor('fog', false)).toBe('revealed');
  });

  it('never confines a route on an open map, even after a vision push (42c)', () => {
    expect(walkFloorFor('open', true)).toBe('open');
    expect(walkFloorFor('open', false)).toBe('open');
  });
});

describe('sightStepTest (66e, pkt 16)', () => {
  // Biuro 0–60 × 0–40, korytarz 0–100 × 40–60, drzwi x 20–30 na y = 40.
  // Oko w biurze widzi biuro i słup przez drzwi; kamera widzi cały korytarz.
  const own: ScenePoint[] = [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 60, y: 40 },
    { x: 30, y: 40 },
    { x: 30, y: 60 },
    { x: 20, y: 60 },
    { x: 20, y: 40 },
    { x: 0, y: 40 },
  ];
  const camera: ScenePoint[] = [
    { x: 0, y: 40 },
    { x: 100, y: 40 },
    { x: 100, y: 60 },
    { x: 0, y: 60 },
  ];
  const polygons = [own, camera];
  const grid = { cell: 10, originX: 0, originY: 0, cols: 10, rows: 6 };
  const isPassable = (point: ScenePoint) => isPointVisible(point, polygons);

  /** Gdzie trasa przecina ścianę y = 40 — środkami pól, jak kroki planera. */
  function crossings(points: readonly ScenePoint[]): number[] {
    const xs: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = { x: points[i - 1]!.x + 5, y: points[i - 1]!.y + 5 };
      const b = { x: points[i]!.x + 5, y: points[i]!.y + 5 };
      if ((a.y - 40) * (b.y - 40) < 0) xs.push(a.x + ((40 - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    return xs;
  }

  it('bez testu krawędzi suma dwóch oczu przepuszcza krok przez ścianę', () => {
    const plan = planWalk({ x: 40, y: 20 }, { x: 70, y: 50 }, { grid, isPassable });
    expect(plan?.truncated).toBe(false);
    expect(crossings(plan!.points).some((x) => x < 20 || x > 30)).toBe(true);
  });

  it('z testem trasa wychodzi drzwiami', () => {
    const canStep = sightStepTest(polygons, 5);
    const plan = planWalk({ x: 40, y: 20 }, { x: 70, y: 50 }, { grid, isPassable, canStep });
    expect(plan?.truncated).toBe(false);
    const xs = crossings(plan!.points);
    expect(xs.length).toBeGreaterThan(0);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(20);
      expect(x).toBeLessThanOrEqual(30);
    }
  });

  it('przy jednym wielokącie nic nie dokłada', () => {
    expect(sightStepTest([own], 5)).toBeUndefined();
  });
});
