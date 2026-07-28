import { describe, expect, it } from 'vitest';
import {
  DRAWING_DEFAULT_COLOR,
  DRAWING_DEFAULT_FONT_SIZE,
  DRAWING_DEFAULT_WIDTH,
  DRAWING_FONT_PRESETS,
  DRAWING_MAX_FONT_SIZE,
  DRAWING_MIN_FONT_SIZE,
  DRAWING_MAX_WIDTH,
  DRAWING_PATH_MAX_POINTS,
  DRAWING_TEXT_MAX_LENGTH,
  drawingHitTest,
  drawingTextBounds,
  pickDrawingAt,
  sanitizeDrawingShape,
  sanitizeDrawingStyle,
  sanitizeDrawingText,
  simplifyPath,
  type DrawingShape,
  type DrawingStyle,
  type DrawingText,
  type DrawingView,
} from './drawings.js';
import type { ScenePoint } from './measure.js';

const line: DrawingStyle = { color: '#22d3ee', width: 6, filled: false };
const filled: DrawingStyle = { color: '#22d3ee', width: 6, filled: true };

function drawing(shape: DrawingShape, style: DrawingStyle, id = 1, authorId = 'u1'): DrawingView {
  return {
    id,
    sceneId: 's1',
    authorId,
    authorName: 'Autor',
    gmOnly: false,
    shape,
    style,
  };
}

describe('sanitizeDrawingShape', () => {
  it('accepts a path and rounds it to whole pixels', () => {
    const shape = sanitizeDrawingShape({
      kind: 'path',
      points: [
        { x: 10.4, y: 20.6 },
        { x: 30, y: 40 },
      ],
    });
    expect(shape).toEqual({
      kind: 'path',
      points: [
        { x: 10, y: 21 },
        { x: 30, y: 40 },
      ],
    });
  });

  it('accepts a single-point path — a pencil dot is a legitimate mark', () => {
    expect(sanitizeDrawingShape({ kind: 'path', points: [{ x: 5, y: 5 }] })).toEqual({
      kind: 'path',
      points: [{ x: 5, y: 5 }],
    });
  });

  it('rejects a path longer than the cap and one with a broken point', () => {
    const points = Array.from({ length: DRAWING_PATH_MAX_POINTS + 1 }, (_, i) => ({ x: i, y: i }));
    expect(sanitizeDrawingShape({ kind: 'path', points })).toBeNull();
    expect(
      sanitizeDrawingShape({
        kind: 'path',
        points: [
          { x: 1, y: 2 },
          { x: Number.NaN, y: 0 },
        ],
      }),
    ).toBeNull();
  });

  it('normalizes a rectangle dragged up and to the left', () => {
    expect(
      sanitizeDrawingShape({ kind: 'rect', x: 300, y: 200, width: -100, height: -50 }),
    ).toEqual({ kind: 'rect', x: 200, y: 150, width: 100, height: 50 });
  });

  it('rejects a degenerate rectangle and a degenerate ellipse', () => {
    expect(sanitizeDrawingShape({ kind: 'rect', x: 0, y: 0, width: 0, height: 10 })).toBeNull();
    expect(
      sanitizeDrawingShape({ kind: 'ellipse', x: 0, y: 0, radiusX: 0.2, radiusY: 40 }),
    ).toBeNull();
  });

  it('takes an ellipse by centre and radii, absolute values', () => {
    expect(
      sanitizeDrawingShape({ kind: 'ellipse', x: 100, y: 120, radiusX: -40, radiusY: 25.6 }),
    ).toEqual({ kind: 'ellipse', x: 100, y: 120, radiusX: 40, radiusY: 26 });
  });

  it('collapses whitespace in a label and clamps its font size', () => {
    expect(
      sanitizeDrawingShape({
        kind: 'text',
        x: 10,
        y: 20,
        text: '  Magazyn \n  broni  ',
        fontSize: 10_000,
      }),
    ).toEqual({
      kind: 'text',
      x: 10,
      y: 20,
      text: 'Magazyn broni',
      fontSize: DRAWING_MAX_FONT_SIZE,
    });
  });

  it('falls back to the default font size and rejects empty or oversized text', () => {
    expect(sanitizeDrawingShape({ kind: 'text', x: 0, y: 0, text: 'Hol' })).toEqual({
      kind: 'text',
      x: 0,
      y: 0,
      text: 'Hol',
      fontSize: DRAWING_DEFAULT_FONT_SIZE,
    });
    expect(sanitizeDrawingShape({ kind: 'text', x: 0, y: 0, text: '   ' })).toBeNull();
    expect(
      sanitizeDrawingShape({
        kind: 'text',
        x: 0,
        y: 0,
        text: 'x'.repeat(DRAWING_TEXT_MAX_LENGTH + 1),
      }),
    ).toBeNull();
  });

  it('rejects an unknown kind and a non-object', () => {
    expect(sanitizeDrawingShape({ kind: 'cone', x: 0, y: 0 })).toBeNull();
    expect(sanitizeDrawingShape(null)).toBeNull();
    expect(sanitizeDrawingShape('rect')).toBeNull();
  });
});

describe('DRAWING_FONT_PRESETS', () => {
  it('is an ascending ladder inside the allowed range', () => {
    const sizes = DRAWING_FONT_PRESETS.map((preset) => preset.size);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    for (const size of sizes) {
      expect(size).toBeGreaterThanOrEqual(DRAWING_MIN_FONT_SIZE);
      expect(size).toBeLessThanOrEqual(DRAWING_MAX_FONT_SIZE);
      // A preset the sanitizer would silently rewrite is a broken button.
      expect(
        sanitizeDrawingShape({ kind: 'text', x: 0, y: 0, text: 'Hol', fontSize: size }),
      ).toEqual({ kind: 'text', x: 0, y: 0, text: 'Hol', fontSize: size });
    }
  });

  it('offers the default as one of its rungs', () => {
    expect(DRAWING_FONT_PRESETS.map((preset) => preset.size)).toContain(DRAWING_DEFAULT_FONT_SIZE);
  });
});

describe('sanitizeDrawingText', () => {
  it('trims, collapses and bounds', () => {
    expect(sanitizeDrawingText('  Zaułek  Jig-Jig  ')).toBe('Zaułek Jig-Jig');
    expect(sanitizeDrawingText(42)).toBeNull();
  });
});

describe('sanitizeDrawingStyle', () => {
  it('never fails — a broken style falls back to the defaults', () => {
    expect(sanitizeDrawingStyle(null)).toEqual({
      color: DRAWING_DEFAULT_COLOR,
      width: DRAWING_DEFAULT_WIDTH,
      filled: false,
    });
    expect(
      sanitizeDrawingStyle({ color: 'red; drop table', width: 'gruba', filled: 'tak' }),
    ).toEqual({ color: DRAWING_DEFAULT_COLOR, width: DRAWING_DEFAULT_WIDTH, filled: false });
  });

  it('lowercases a valid colour and clamps the width', () => {
    expect(sanitizeDrawingStyle({ color: '#A3E635', width: 999, filled: true })).toEqual({
      color: '#a3e635',
      width: DRAWING_MAX_WIDTH,
      filled: true,
    });
  });
});

describe('drawingHitTest', () => {
  it('hits along a path but not beside it', () => {
    const path = drawing(
      {
        kind: 'path',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      },
      line,
    );
    expect(drawingHitTest(path, { x: 50, y: 2 })).toBe(true);
    expect(drawingHitTest(path, { x: 50, y: 20 })).toBe(false);
    // Tolerance is what lets a thin line be grabbed at low zoom.
    expect(drawingHitTest(path, { x: 50, y: 20 }, 20)).toBe(true);
  });

  it('treats a single-point path as a dot', () => {
    const dot = drawing({ kind: 'path', points: [{ x: 10, y: 10 }] }, line);
    expect(drawingHitTest(dot, { x: 11, y: 11 })).toBe(true);
    expect(drawingHitTest(dot, { x: 40, y: 40 })).toBe(false);
  });

  it('hits the outline of an unfilled rectangle, but not its empty middle', () => {
    const shape: DrawingShape = { kind: 'rect', x: 0, y: 0, width: 200, height: 100 };
    expect(drawingHitTest(drawing(shape, line), { x: 100, y: 1 })).toBe(true);
    expect(drawingHitTest(drawing(shape, line), { x: 100, y: 50 })).toBe(false);
    // …and the whole interior once it is filled.
    expect(drawingHitTest(drawing(shape, filled), { x: 100, y: 50 })).toBe(true);
    expect(drawingHitTest(drawing(shape, filled), { x: 300, y: 50 })).toBe(false);
  });

  it('hits the rim of an unfilled ellipse, but not its centre', () => {
    const shape: DrawingShape = { kind: 'ellipse', x: 100, y: 100, radiusX: 50, radiusY: 30 };
    expect(drawingHitTest(drawing(shape, line), { x: 150, y: 100 })).toBe(true);
    expect(drawingHitTest(drawing(shape, line), { x: 100, y: 100 })).toBe(false);
    expect(drawingHitTest(drawing(shape, filled), { x: 100, y: 100 })).toBe(true);
    expect(drawingHitTest(drawing(shape, line), { x: 200, y: 100 })).toBe(false);
  });

  it('hits a label inside its measured box', () => {
    const shape: DrawingText = { kind: 'text', x: 10, y: 20, text: 'Magazyn', fontSize: 40 };
    const box = drawingTextBounds(shape);
    expect(box.width).toBeGreaterThan(40);
    expect(drawingHitTest(drawing(shape, line), { x: 12, y: 25 })).toBe(true);
    expect(drawingHitTest(drawing(shape, line), { x: box.x + box.width + 30, y: 25 })).toBe(false);
  });
});

describe('pickDrawingAt', () => {
  const mine = drawing({ kind: 'rect', x: 0, y: 0, width: 100, height: 100 }, filled, 1, 'me');
  const yours = drawing({ kind: 'rect', x: 0, y: 0, width: 100, height: 100 }, filled, 2, 'you');

  it('picks the newest drawing under the point', () => {
    expect(pickDrawingAt([mine, yours], { x: 50, y: 50 }, 0, () => true)?.id).toBe(2);
  });

  it('reaches through a drawing the user may not erase', () => {
    const picked = pickDrawingAt([mine, yours], { x: 50, y: 50 }, 0, (d) => d.authorId === 'me');
    expect(picked?.id).toBe(1);
  });

  it('returns null when nothing is under the point', () => {
    expect(pickDrawingAt([mine, yours], { x: 500, y: 500 }, 0, () => true)).toBeNull();
  });
});

describe('simplifyPath', () => {
  it('drops points that lie on the line and keeps the endpoints', () => {
    const points: ScenePoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0.4 },
      { x: 20, y: -0.3 },
      { x: 30, y: 0 },
    ];
    expect(simplifyPath(points, 2)).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
    ]);
  });

  it('keeps a corner the stroke actually turns at', () => {
    const points: ScenePoint[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(simplifyPath(points, 2)).toHaveLength(3);
  });

  it('thins a noisy freehand stroke by an order of magnitude', () => {
    const points: ScenePoint[] = Array.from({ length: 400 }, (_, i) => ({
      x: i,
      y: Math.sin(i / 40) * 100 + (i % 2 === 0 ? 0.5 : -0.5),
    }));
    const simplified = simplifyPath(points, 3);
    expect(simplified.length).toBeLessThan(40);
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified.at(-1)).toEqual(points.at(-1));
  });

  it('returns a copy, never the array it was given', () => {
    const points: ScenePoint[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    const simplified = simplifyPath(points, 5);
    expect(simplified).toEqual(points);
    expect(simplified[0]).not.toBe(points[0]);
  });
});
