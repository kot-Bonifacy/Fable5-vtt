import { describe, expect, it } from 'vitest';
import {
  formatMetres,
  metresBetween,
  metresBetweenTokens,
  metresForRules,
  metresPerPixel,
  polylineMetres,
  sanitizeRulerPoints,
  squaresForDistance,
  tokenCentre,
  RULER_MAX_POINTS,
} from './measure.js';

/** A 100 px grid at the CP RED default of 2 m per square: 1 px = 2 cm. */
const scene = {
  grid: { sizePx: 100, offsetX: 0, offsetY: 0, color: '#fff', alpha: 1, visible: true },
  metersPerSquare: 2,
};

describe('metresPerPixel', () => {
  it('divides the square in metres by the square in pixels', () => {
    expect(metresPerPixel(scene)).toBeCloseTo(0.02);
  });

  it('returns 0 for a degenerate grid instead of dividing by zero', () => {
    expect(metresPerPixel({ ...scene, grid: { ...scene.grid, sizePx: 0 } })).toBe(0);
  });
});

describe('tokenCentre', () => {
  it('measures a 1×1 token from the middle of its square', () => {
    expect(tokenCentre({ x: 200, y: 300, size: 1 }, scene)).toEqual({ x: 250, y: 350 });
  });

  it('measures a 2×2 token from the middle of the whole footprint', () => {
    expect(tokenCentre({ x: 200, y: 300, size: 2 }, scene)).toEqual({ x: 300, y: 400 });
  });
});

describe('metresBetween', () => {
  it('converts a straight run of squares into metres', () => {
    // 12 squares of 100 px = 1200 px = 24 m.
    expect(metresBetween({ x: 0, y: 0 }, { x: 1200, y: 0 }, scene)).toBe(24);
  });

  it('measures diagonals as the straight line, not as squares stepped', () => {
    // Three squares across and four down is five squares of hypotenuse = 10 m.
    expect(metresBetween({ x: 0, y: 0 }, { x: 300, y: 400 }, scene)).toBe(10);
  });

  it('rounds to one decimal', () => {
    expect(metresBetween({ x: 0, y: 0 }, { x: 333, y: 0 }, scene)).toBe(6.7);
  });
});

describe('metresBetweenTokens', () => {
  it('measures centre to centre, so token size shifts the distance', () => {
    const shooter = { x: 0, y: 0, size: 1 };
    const small = { x: 1000, y: 0, size: 1 };
    const large = { x: 1000, y: 0, size: 2 };
    expect(metresBetweenTokens(shooter, small, scene)).toBe(20);
    // The big target's centre sits half a square further away.
    expect(metresBetweenTokens(shooter, large, scene)).toBe(21);
  });
});

describe('polylineMetres', () => {
  it('adds the legs of a multi-point measurement', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 400 },
    ];
    expect(polylineMetres(points, scene)).toBe(14);
  });

  it('is zero for a single point', () => {
    expect(polylineMetres([{ x: 10, y: 10 }], scene)).toBe(0);
  });
});

describe('metresForRules', () => {
  it('rounds half up, so an ambiguous distance lands in the harder band', () => {
    expect(metresForRules(6.4)).toBe(6);
    expect(metresForRules(6.5)).toBe(7);
  });

  it('never goes negative', () => {
    expect(metresForRules(-3)).toBe(0);
  });
});

describe('formatMetres', () => {
  it('uses a Polish decimal comma, a non-breaking space and no trailing zero', () => {
    expect(formatMetres(24)).toBe('24 m');
    expect(formatMetres(6.5)).toBe('6,5 m');
    expect(formatMetres(6.04)).toBe('6 m');
  });
});

describe('squaresForDistance', () => {
  it('converts metres back into squares', () => {
    expect(squaresForDistance(24, scene)).toBe(12);
  });
});

describe('sanitizeRulerPoints', () => {
  it('accepts a two-point line and rounds to whole pixels', () => {
    expect(
      sanitizeRulerPoints([
        { x: 1.4, y: 2.6 },
        { x: 10, y: 10 },
      ]),
    ).toEqual([
      { x: 1, y: 3 },
      { x: 10, y: 10 },
    ]);
  });

  it('rejects a line with fewer than two points', () => {
    expect(sanitizeRulerPoints([{ x: 0, y: 0 }])).toBeNull();
  });

  it('rejects more points than the limit', () => {
    const many = Array.from({ length: RULER_MAX_POINTS + 1 }, (_, i) => ({ x: i, y: 0 }));
    expect(sanitizeRulerPoints(many)).toBeNull();
  });

  it('rejects non-finite coordinates', () => {
    expect(
      sanitizeRulerPoints([
        { x: 0, y: 0 },
        { x: Number.NaN, y: 0 },
      ]),
    ).toBeNull();
    expect(
      sanitizeRulerPoints([
        { x: 0, y: 0 },
        { x: Number.POSITIVE_INFINITY, y: 0 },
      ]),
    ).toBeNull();
  });

  it('rejects anything that is not an array of points', () => {
    expect(sanitizeRulerPoints('12 m')).toBeNull();
    expect(sanitizeRulerPoints([{ x: 0 }, { x: 1, y: 1 }])).toBeNull();
  });
});
