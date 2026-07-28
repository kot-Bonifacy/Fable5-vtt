import { describe, expect, it } from 'vitest';
import {
  FOG_BRUSH_MAX_RADIUS,
  FOG_BRUSH_MIN_RADIUS,
  FOG_STROKE_MAX_POINTS,
  fogShapeContains,
  fullSceneReveal,
  isPointRevealed,
  isTokenInFog,
  sanitizeFogShape,
  type FogShape,
  type FogShapeView,
} from './fog.js';
import type { SceneView } from './scenes.js';
import type { TokenView } from './tokens.js';

const scene: Pick<SceneView, 'grid' | 'width' | 'height'> = {
  grid: { sizePx: 100, offsetX: 0, offsetY: 0, color: '#000000', alpha: 0.35, visible: true },
  width: 2000,
  height: 1000,
};

/** Numbers the shapes the way the database does — the id is the paint order. */
function ordered(shapes: FogShape[]): FogShapeView[] {
  return shapes.map((shape, index) => ({ ...shape, id: index + 1 }));
}

function rect(mode: 'reveal' | 'hide', x: number, y: number, width: number, height: number) {
  return { kind: 'rect', mode, x, y, width, height } as const;
}

function token(x: number, y: number, size = 1): Pick<TokenView, 'x' | 'y' | 'size'> {
  return { x, y, size };
}

describe('sanitizeFogShape', () => {
  it('accepts a brush stroke and rounds it to whole pixels', () => {
    const shape = sanitizeFogShape({
      kind: 'stroke',
      mode: 'reveal',
      points: [
        { x: 10.4, y: 20.6 },
        { x: 30, y: 40 },
      ],
      radius: 55.5,
    });
    expect(shape).toEqual({
      kind: 'stroke',
      mode: 'reveal',
      points: [
        { x: 10, y: 21 },
        { x: 30, y: 40 },
      ],
      radius: 56,
    });
  });

  it('clamps the brush radius to the allowed range', () => {
    const tiny = sanitizeFogShape({
      kind: 'stroke',
      mode: 'reveal',
      points: [{ x: 0, y: 0 }],
      radius: 1,
    });
    const huge = sanitizeFogShape({
      kind: 'stroke',
      mode: 'reveal',
      points: [{ x: 0, y: 0 }],
      radius: 999_999,
    });
    expect(tiny).toMatchObject({ radius: FOG_BRUSH_MIN_RADIUS });
    expect(huge).toMatchObject({ radius: FOG_BRUSH_MAX_RADIUS });
  });

  it('normalizes a rectangle dragged up and to the left', () => {
    expect(
      sanitizeFogShape({ kind: 'rect', mode: 'hide', x: 300, y: 200, width: -100, height: -50 }),
    ).toEqual({ kind: 'rect', mode: 'hide', x: 200, y: 150, width: 100, height: 50 });
  });

  it('rejects unusable payloads', () => {
    expect(sanitizeFogShape(null)).toBeNull();
    expect(sanitizeFogShape({ kind: 'circle', mode: 'reveal' })).toBeNull();
    expect(
      sanitizeFogShape({ kind: 'rect', mode: 'nope', x: 0, y: 0, width: 1, height: 1 }),
    ).toBeNull();
    expect(
      sanitizeFogShape({ kind: 'rect', mode: 'reveal', x: 0, y: 0, width: 0, height: 5 }),
    ).toBeNull();
    expect(sanitizeFogShape({ kind: 'stroke', mode: 'reveal', points: [], radius: 50 })).toBeNull();
    expect(
      sanitizeFogShape({
        kind: 'stroke',
        mode: 'reveal',
        points: [{ x: 0, y: Infinity }],
        radius: 50,
      }),
    ).toBeNull();
  });

  it('refuses a stroke longer than the cap instead of truncating it', () => {
    const points = Array.from({ length: FOG_STROKE_MAX_POINTS + 1 }, (_, i) => ({ x: i, y: 0 }));
    expect(sanitizeFogShape({ kind: 'stroke', mode: 'reveal', points, radius: 50 })).toBeNull();
  });
});

describe('fogShapeContains', () => {
  it('treats a one-point stroke as a disc', () => {
    const dot = sanitizeFogShape({
      kind: 'stroke',
      mode: 'reveal',
      points: [{ x: 100, y: 100 }],
      radius: 50,
    })!;
    expect(fogShapeContains(dot, { x: 140, y: 100 })).toBe(true);
    expect(fogShapeContains(dot, { x: 151, y: 100 })).toBe(false);
  });

  it('covers the band around a multi-segment stroke, not just its samples', () => {
    const stroke: FogShape = {
      kind: 'stroke',
      mode: 'reveal',
      points: [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 400 },
      ],
      radius: 30,
    };
    // Halfway along a leg — a per-sample test would miss this.
    expect(fogShapeContains(stroke, { x: 200, y: 25 })).toBe(true);
    expect(fogShapeContains(stroke, { x: 200, y: 35 })).toBe(false);
    // Round join at the corner.
    expect(fogShapeContains(stroke, { x: 420, y: 20 })).toBe(true);
  });

  it('includes the rectangle border', () => {
    const box = rect('reveal', 100, 100, 200, 100);
    expect(fogShapeContains(box, { x: 100, y: 100 })).toBe(true);
    expect(fogShapeContains(box, { x: 300, y: 200 })).toBe(true);
    expect(fogShapeContains(box, { x: 301, y: 150 })).toBe(false);
  });
});

describe('isPointRevealed', () => {
  it('starts covered — an empty scene reveals nothing', () => {
    expect(isPointRevealed({ x: 10, y: 10 }, { enabled: true, shapes: [] })).toBe(false);
  });

  it('reveals nothing but what was painted', () => {
    const fog = { enabled: true, shapes: ordered([rect('reveal', 0, 0, 500, 500)]) };
    expect(isPointRevealed({ x: 250, y: 250 }, fog)).toBe(true);
    expect(isPointRevealed({ x: 600, y: 250 }, fog)).toBe(false);
  });

  it('lets a later shape overrule an earlier one', () => {
    const fog = {
      enabled: true,
      shapes: ordered([rect('reveal', 0, 0, 500, 500), rect('hide', 200, 200, 100, 100)]),
    };
    expect(isPointRevealed({ x: 100, y: 100 }, fog)).toBe(true);
    expect(isPointRevealed({ x: 250, y: 250 }, fog)).toBe(false);
  });

  it('re-reveals an area covered in between (order, not precedence)', () => {
    const fog = {
      enabled: true,
      shapes: ordered([
        rect('reveal', 0, 0, 500, 500),
        rect('hide', 200, 200, 100, 100),
        rect('reveal', 220, 220, 20, 20),
      ]),
    };
    expect(isPointRevealed({ x: 230, y: 230 }, fog)).toBe(true);
    expect(isPointRevealed({ x: 280, y: 280 }, fog)).toBe(false);
  });

  it('reveals everything when fog is switched off for the scene', () => {
    expect(isPointRevealed({ x: 9999, y: 9999 }, { enabled: false, shapes: [] })).toBe(true);
  });
});

describe('isTokenInFog', () => {
  it('measures at the token centre, not its corner', () => {
    // 2×2 token at (0,0) spans 0..200 px, so its centre sits at (100, 100).
    const fog = { enabled: true, shapes: ordered([rect('reveal', 90, 90, 20, 20)]) };
    expect(isTokenInFog(token(0, 0, 2), scene, fog)).toBe(false);
    // The same reveal does not catch a 1×1 token at the same spot (centre 50,50).
    expect(isTokenInFog(token(0, 0, 1), scene, fog)).toBe(true);
  });

  it('hides a token standing outside every reveal', () => {
    const fog = { enabled: true, shapes: ordered([rect('reveal', 0, 0, 200, 200)]) };
    expect(isTokenInFog(token(0, 0), scene, fog)).toBe(false);
    expect(isTokenInFog(token(900, 400), scene, fog)).toBe(true);
  });
});

describe('fullSceneReveal', () => {
  it('uncovers every corner of the scene', () => {
    const fog = { enabled: true, shapes: ordered([fullSceneReveal(scene)]) };
    expect(isPointRevealed({ x: 0, y: 0 }, fog)).toBe(true);
    expect(isPointRevealed({ x: scene.width, y: scene.height }, fog)).toBe(true);
  });
});
