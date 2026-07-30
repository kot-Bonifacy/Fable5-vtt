import { describe, expect, it } from 'vitest';
import {
  LIGHT_BRIGHT,
  LIGHT_DARK,
  LIGHT_DIM,
  buildLightMask,
  decodeLevelRuns,
  encodeLevelRuns,
  isPointLit,
  lightLevelAt,
  lightMaskCellPx,
  orderLightRadii,
  polygonsBounds,
  sanitizeDarkSight,
  sanitizeLightPatch,
  sanitizeTokenLight,
  toLightSource,
  type LightSource,
} from './lights.js';
import { computeVisionPolygon, sceneBoundsSegments, type Segment } from './vision.js';

/**
 * Stage 18b: the geometry that decides whether what a token can see is lit.
 *
 * Same shape of test as 18a — small floor plans reasoned out on paper — because
 * the question is the same one the server asks before a token goes into a
 * payload, now with a second condition on it.
 */

const BOUNDS = { width: 1000, height: 1000 };
const BORDER = sceneBoundsSegments(BOUNDS);

function lamp(x: number, y: number, brightPx: number, dimPx: number): LightSource {
  return { origin: { x, y }, brightPx, dimPx, color: '#ffffff', flicker: false };
}

describe('lightLevelAt', () => {
  it('is bright inside the bright radius, dim outside it, dark beyond the reach', () => {
    const sources = [lamp(500, 500, 100, 200)];
    expect(lightLevelAt({ x: 550, y: 500 }, sources, BORDER)).toBe(LIGHT_BRIGHT);
    expect(lightLevelAt({ x: 650, y: 500 }, sources, BORDER)).toBe(LIGHT_DIM);
    expect(lightLevelAt({ x: 750, y: 500 }, sources, BORDER)).toBe(LIGHT_DARK);
  });

  it('does not shine through a wall', () => {
    const wall: Segment = { x1: 600, y1: 400, x2: 600, y2: 600 };
    const sources = [lamp(500, 500, 300, 300)];
    // The same distance from the lamp in two directions: one into the wall's
    // shadow, one down the open side of the room.
    expect(lightLevelAt({ x: 700, y: 500 }, sources, [wall, ...BORDER])).toBe(LIGHT_DARK);
    expect(lightLevelAt({ x: 300, y: 500 }, sources, [wall, ...BORDER])).toBe(LIGHT_BRIGHT);
  });

  it('takes the brightest of several lights', () => {
    const sources = [lamp(400, 500, 50, 300), lamp(600, 500, 150, 300)];
    // 100 px from the second lamp (bright) and 100 px from the first (dim only).
    expect(lightLevelAt({ x: 500, y: 500 }, sources, BORDER)).toBe(LIGHT_BRIGHT);
  });

  it('a switched-off lamp is simply absent from the sources', () => {
    expect(isPointLit({ x: 500, y: 500 }, [], BORDER)).toBe(false);
  });

  it('lights a point standing exactly on the lamp', () => {
    // A token carrying its own torch: the origin must not blind itself the way
    // a wall hit at distance zero would.
    expect(isPointLit({ x: 500, y: 500 }, [lamp(500, 500, 100, 200)], BORDER)).toBe(true);
  });
});

describe('orderLightRadii', () => {
  it('widens the dim radius rather than rejecting an inverted pair', () => {
    expect(orderLightRadii(10, 4)).toEqual({ brightM: 10, dimM: 10 });
    expect(orderLightRadii(4, 10)).toEqual({ brightM: 4, dimM: 10 });
  });
});

describe('run-length coding', () => {
  it('round-trips a level array', () => {
    const levels = new Uint8Array([0, 0, 0, 1, 1, 2, 0]);
    const runs = encodeLevelRuns(levels);
    expect(runs).toEqual([0, 3, 1, 2, 2, 1, 0, 1]);
    expect([...decodeLevelRuns(runs, levels.length)]).toEqual([...levels]);
  });

  it('leaves the tail dark when the runs come up short', () => {
    // A malformed mask must not take the map down with it.
    expect([...decodeLevelRuns([2, 2], 5)]).toEqual([2, 2, 0, 0, 0]);
  });

  it('ignores a run with a nonsensical length', () => {
    expect([...decodeLevelRuns([2, -3, 1, 2], 4)]).toEqual([1, 1, 0, 0]);
  });

  it('encodes an empty array as no runs at all', () => {
    expect(encodeLevelRuns(new Uint8Array())).toEqual([]);
  });
});

describe('polygonsBounds', () => {
  it('is null when there is no polygon — a viewer with no token', () => {
    expect(polygonsBounds([])).toBeNull();
  });

  it('spans every polygon', () => {
    expect(
      polygonsBounds([
        [
          { x: 10, y: 20 },
          { x: 30, y: 20 },
        ],
        [
          { x: 5, y: 50 },
          { x: 40, y: 60 },
        ],
      ]),
    ).toEqual({ x: 5, y: 20, width: 35, height: 40 });
  });
});

describe('lightMaskCellPx', () => {
  it('is half a grid square — one metre on a CP RED map', () => {
    expect(lightMaskCellPx({ gridMode: 'grid', grid: gridOf(100) })).toBe(50);
  });

  it('falls back to a fixed cell on a gridless scene', () => {
    expect(lightMaskCellPx({ gridMode: 'gridless', grid: gridOf(0) })).toBe(50);
  });

  it('never goes below eight pixels, however fine the grid', () => {
    expect(lightMaskCellPx({ gridMode: 'grid', grid: gridOf(4) })).toBe(8);
  });
});

function gridOf(sizePx: number) {
  return { sizePx, offsetX: 0, offsetY: 0, color: '#000000', alpha: 0.35, visible: true };
}

describe('buildLightMask', () => {
  /** Level of the cell containing a world point, read back out of a mask. */
  function levelAt(
    mask: ReturnType<typeof buildLightMask>,
    point: { x: number; y: number },
  ): number {
    const col = Math.floor((point.x - mask.x) / mask.cell);
    const row = Math.floor((point.y - mask.y) / mask.cell);
    if (col < 0 || row < 0 || col >= mask.cols || row >= mask.rows) return LIGHT_DARK;
    return decodeLevelRuns(mask.runs, mask.cols * mask.rows)[row * mask.cols + col]!;
  }

  const openView = [computeVisionPolygon({ x: 500, y: 500 }, BORDER, null)];

  it('describes the light levels around a lamp', () => {
    const mask = buildLightMask({
      bounds: { x: 300, y: 300, width: 400, height: 400 },
      cellPx: 50,
      sources: [lamp(500, 500, 100, 200)],
      segments: BORDER,
      polygons: openView,
    });
    expect(levelAt(mask, { x: 510, y: 510 })).toBe(LIGHT_BRIGHT);
    expect(levelAt(mask, { x: 660, y: 510 })).toBe(LIGHT_DIM);
    // Just inside the bounds but out of the lamp's reach.
    expect(levelAt(mask, { x: 310, y: 310 })).toBe(LIGHT_DARK);
  });

  it('is anchored to whole cells, so two viewers agree on where a cell is', () => {
    const first = buildLightMask({
      bounds: { x: 337, y: 337, width: 100, height: 100 },
      cellPx: 50,
      sources: [],
      segments: BORDER,
      polygons: openView,
    });
    const second = buildLightMask({
      bounds: { x: 361, y: 349, width: 100, height: 100 },
      cellPx: 50,
      sources: [],
      segments: BORDER,
      polygons: openView,
    });
    expect(first.x % first.cell).toBe(0);
    expect(second.x % second.cell).toBe(0);
    expect(first.y % first.cell).toBe(0);
  });

  it('forces every cell outside the field of view dark', () => {
    // The whole point of the representation: a lit room behind a wall must not
    // appear in the mask, because the mask would then be a floor plan.
    const wall: Segment = { x1: 600, y1: 0, x2: 600, y2: 1000 };
    const segments = [wall, ...BORDER];
    const viewer = { x: 400, y: 500 };
    const polygons = [computeVisionPolygon(viewer, segments, null)];
    const mask = buildLightMask({
      bounds: { x: 200, y: 300, width: 600, height: 400 },
      cellPx: 50,
      // A lamp on the far side of the wall, lighting its own room brightly.
      sources: [lamp(700, 500, 200, 300)],
      segments,
      polygons,
    });
    expect(levelAt(mask, { x: 700, y: 500 })).toBe(LIGHT_DARK);
    expect(levelAt(mask, { x: 750, y: 520 })).toBe(LIGHT_DARK);
  });

  it('lights the far room once the wall has a gap the viewer looks through', () => {
    // Same lamp, same viewer — only the wall changed, and now the light the
    // viewer can actually see is in the mask. This is the door-opening case.
    const segments = [
      { x1: 600, y1: 0, x2: 600, y2: 450 },
      { x1: 600, y1: 550, x2: 600, y2: 1000 },
      ...BORDER,
    ];
    const polygons = [computeVisionPolygon({ x: 400, y: 500 }, segments, null)];
    const mask = buildLightMask({
      bounds: { x: 200, y: 300, width: 600, height: 400 },
      cellPx: 50,
      sources: [lamp(700, 500, 200, 300)],
      segments,
      polygons,
    });
    expect(levelAt(mask, { x: 700, y: 500 })).toBe(LIGHT_BRIGHT);
  });

  it('is entirely dark when the viewer sees nothing', () => {
    const mask = buildLightMask({
      bounds: { x: 0, y: 0, width: 200, height: 200 },
      cellPx: 50,
      sources: [lamp(100, 100, 100, 100)],
      segments: BORDER,
      polygons: [],
    });
    expect(mask.runs).toEqual([LIGHT_DARK, mask.cols * mask.rows]);
  });
});

/**
 * The stage's performance criterion, measured rather than eyeballed.
 *
 * What is timed is one complete server-side answer for one viewer on the map the
 * criterion describes — ~50 wall segments and 10 lights — because that is what
 * has to fit inside a frame for the darkness to feel attached to the token: the
 * visibility polygon plus the light mask over its bounding box. The renderer's
 * own frame rate is measured in the browser (see POSTEP.md); this is the half
 * that could plausibly blow the budget, since it runs per viewer per push.
 */
describe('performance of one viewer update', () => {
  it('computes a polygon and its light mask well inside a frame', () => {
    const segments: Segment[] = [...BORDER];
    // A floor plan: five rooms off a corridor, 50 segments in total.
    for (let room = 0; room < 5; room++) {
      const left = 100 + room * 160;
      for (const [x1, y1, x2, y2] of [
        [left, 200, left + 140, 200],
        [left + 140, 200, left + 140, 400],
        [left + 140, 400, left, 400],
        [left, 400, left, 200],
        [left, 600, left + 140, 600],
        [left + 140, 600, left + 140, 800],
        [left + 140, 800, left, 800],
        [left, 800, left, 600],
        [left, 480, left + 140, 480],
      ] as const) {
        segments.push({ x1, y1, x2, y2 });
      }
    }
    expect(segments.length).toBeGreaterThanOrEqual(49);

    const sources = Array.from({ length: 10 }, (_, i) =>
      lamp(150 + (i % 5) * 160, i < 5 ? 300 : 700, 120, 260),
    );
    const viewer = { x: 500, y: 500 };

    const runs = 30;
    const started = performance.now();
    for (let i = 0; i < runs; i++) {
      // The viewer shifts slightly so nothing can be cached between rounds.
      const origin = { x: viewer.x + i, y: viewer.y };
      const polygons = [computeVisionPolygon(origin, segments, 900)];
      const bounds = polygonsBounds(polygons)!;
      buildLightMask({ bounds, cellPx: 50, sources, segments, polygons });
    }
    const perUpdate = (performance.now() - started) / runs;
    // Logged so the number lands in the session notes, not just in a pass/fail.
    console.log(`[18b] one viewer update: ${perUpdate.toFixed(2)} ms`);
    // A frame at 60 fps is 16.7 ms and this runs once per push, not per frame,
    // so the budget is deliberately generous — it is a regression guard, not a
    // benchmark.
    expect(perUpdate).toBeLessThan(16);
  });
});

describe('toLightSource', () => {
  const scene = { grid: gridOf(100), metersPerSquare: 2 };

  it('converts metres to scene pixels through the grid scale', () => {
    const source = toLightSource({ x: 0, y: 0 }, source6and14(), scene);
    // 2 m per 100 px square → 50 px per metre.
    expect(source.brightPx).toBeCloseTo(300);
    expect(source.dimPx).toBeCloseTo(700);
  });

  function source6and14() {
    return { brightM: 6, dimM: 14, color: '#ffffff', flicker: false };
  }
});

describe('sanitizeTokenLight', () => {
  it('folds a lamp that reaches nowhere into „carries nothing"', () => {
    expect(sanitizeTokenLight({ brightM: 0, dimM: 0 })).toBeNull();
    expect(sanitizeTokenLight(null)).toBeNull();
  });

  it('defaults the colour and keeps the switch on', () => {
    expect(sanitizeTokenLight({ brightM: 4, dimM: 8 })).toEqual({
      brightM: 4,
      dimM: 8,
      color: '#ffd9a0',
      flicker: false,
      on: true,
    });
  });

  it('rejects a non-object, which is what signals a bad patch', () => {
    expect(sanitizeTokenLight('torch')).toBeUndefined();
  });

  it('orders the radii and lowercases the colour', () => {
    expect(sanitizeTokenLight({ brightM: 9, dimM: 3, color: '#FF0000', on: false })).toEqual({
      brightM: 9,
      dimM: 9,
      color: '#ff0000',
      flicker: false,
      on: false,
    });
  });
});

describe('sanitizeLightPatch', () => {
  it('drops unknown fields and keeps the known ones', () => {
    expect(sanitizeLightPatch({ x: 10.4, y: -3.6, sneaky: 1 })).toEqual({ x: 10, y: -4 });
  });

  it('rejects a malformed colour rather than silently substituting one', () => {
    // A patch is an edit the GM made; a typo has to come back as an error.
    expect(sanitizeLightPatch({ color: 'red' })).toBeNull();
  });

  it('clamps a runaway radius', () => {
    expect(sanitizeLightPatch({ dimM: 1e9 })?.dimM).toBe(200);
  });

  it('rejects a non-object', () => {
    expect(sanitizeLightPatch(42)).toBeNull();
  });
});

describe('sanitizeDarkSight', () => {
  it('accepts zero — „nothing at all without a light"', () => {
    expect(sanitizeDarkSight(0)).toBe(0);
  });

  it('clamps and rounds to one decimal', () => {
    expect(sanitizeDarkSight(2.46)).toBe(2.5);
    expect(sanitizeDarkSight(1000)).toBe(30);
    expect(sanitizeDarkSight(-5)).toBe(0);
  });

  it('is null for anything that is not a number', () => {
    expect(sanitizeDarkSight('2')).toBeNull();
  });
});
