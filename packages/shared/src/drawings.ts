/**
 * Map drawings (stage 17b) — core VTT, no game system involved.
 *
 * A drawing is an annotation laid over the map: a sketched route, a circled
 * target, the name of a room. It follows the fog's data model from 17a — one
 * row per shape, geometry in a JSON column, an autoincrement id that doubles
 * as the paint order — but differs from it in two ways that matter:
 *
 *  - **anyone may draw.** The map is a shared whiteboard, so a drawing carries
 *    its author, and the eraser leans on that: a player removes their own
 *    lines, the GM removes anyone's.
 *  - **a drawing can live on the GM layer.** `gmOnly` is not a rendering flag;
 *    the server simply never emits such a drawing to a player socket, exactly
 *    like a note pin from 17a.
 *
 * Four shapes cover the five tools: the pencil and the line tool both store a
 * `path` (a straight line is a polyline of two points), and `rect`, `ellipse`
 * and `text` take one each.
 */

import type { ScenePoint } from './measure.js';

export const DRAWING_SHAPE_KINDS = ['path', 'rect', 'ellipse', 'text'] as const;
export type DrawingShapeKind = (typeof DRAWING_SHAPE_KINDS)[number];

/** Pencil and line tool: a polyline. One point renders as a dot. */
export interface DrawingPath {
  kind: 'path';
  points: ScenePoint[];
}

/** Axis-aligned rectangle; `width`/`height` are always positive. */
export interface DrawingRect {
  kind: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Ellipse given by its centre and radii — the shape a drag describes. */
export interface DrawingEllipse {
  kind: 'ellipse';
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
}

/**
 * A label on the map. `x`/`y` is the top-left corner and `fontSize` is in
 * **scene pixels**, so the text belongs to the map: it grows and shrinks with
 * it, the way a room name printed on a floor plan does. (Ruler labels and note
 * pins do the opposite — those are UI, not map content.)
 */
export interface DrawingText {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export type DrawingShape = DrawingPath | DrawingRect | DrawingEllipse | DrawingText;

/** How a shape is painted. The same three fields serve every kind. */
export interface DrawingStyle {
  /** `#rrggbb`; the only format stored, so the renderer can parse it blindly. */
  color: string;
  /** Stroke width in scene pixels. */
  width: number;
  /** Rect and ellipse only: also fill the interior at low alpha. */
  filled: boolean;
}

/** One stored drawing as it goes over the wire. */
export interface DrawingView {
  /** Autoincrement id — that *is* the paint order. */
  id: number;
  sceneId: string;
  authorId: string;
  /** Shown by the eraser („cudzy rysunek") and in the toolbar tooltips. */
  authorName: string;
  /** GM layer: such a drawing never reaches a player socket. */
  gmOnly: boolean;
  shape: DrawingShape;
  style: DrawingStyle;
}

export const DRAWING_MIN_WIDTH = 1;
export const DRAWING_MAX_WIDTH = 40;
/**
 * Widths are in scene pixels, so they shrink with the map — and a map is
 * normally viewed well below 1:1. Twelve is about an eighth of a grid square:
 * still a line rather than a smear up close, and thick enough to survive the
 * zoom a whole floor plan is read at. (Six, the first guess, disappeared into
 * a single screen pixel on a city-sized map.)
 */
export const DRAWING_DEFAULT_WIDTH = 12;

export const DRAWING_MIN_FONT_SIZE = 8;
export const DRAWING_MAX_FONT_SIZE = 400;
/**
 * About one grid square tall on the usual 100 px grid. Labels are sized in
 * scene pixels and a map is normally viewed well below 1:1, so half a square —
 * the first guess — came out as a dozen screen pixels: legible only when
 * leaning in. A caption on a floor plan is signage, not a footnote.
 */
export const DRAWING_DEFAULT_FONT_SIZE = 96;
/**
 * The size shipped before that measurement. A stored value identical to it was
 * never a deliberate choice — it is the old default sitting in localStorage —
 * so the client adopts the new one instead of preserving a size nobody picked.
 */
export const DRAWING_LEGACY_FONT_SIZE = 48;

export const DRAWING_TEXT_MAX_LENGTH = 120;
/** Max samples in one freehand path; the client simplifies before sending. */
export const DRAWING_PATH_MAX_POINTS = 512;
/**
 * Max drawings kept per scene. A busy planning session leaves a few dozen; the
 * cap only stops a runaway client from filling the database, and „wyczyść
 * wszystko" always brings the scene back to zero.
 */
export const DRAWING_MAX_PER_SCENE = 1000;

/** Alpha of the optional fill — enough to tint an area, not to hide the map. */
export const DRAWING_FILL_ALPHA = 0.25;

/**
 * Swatches offered by the toolbar. A closed palette rather than a colour
 * picker: six colours that stay legible over both a dark alley and a lit
 * floor plan cover every annotation, and the toolbar stays one row tall.
 */
export const DRAWING_COLORS = [
  '#22d3ee',
  '#a3e635',
  '#facc15',
  '#fb7185',
  '#c084fc',
  '#f8fafc',
] as const;
export const DRAWING_DEFAULT_COLOR: string = DRAWING_COLORS[0];

export const DEFAULT_DRAWING_STYLE: DrawingStyle = {
  color: DRAWING_DEFAULT_COLOR,
  width: DRAWING_DEFAULT_WIDTH,
  filled: false,
};

/** Client → server payload of `drawing:create`. */
export interface DrawingCreatePayload {
  sceneId: string;
  shape: DrawingShape;
  style: DrawingStyle;
  /** Ignored for a player — the server decides who may use the GM layer. */
  gmOnly?: boolean;
}

/** Client → server payload of `drawing:delete` (the eraser). */
export interface DrawingDeletePayload {
  drawingId: number;
}

/** Client → server payload of `drawing:clear`: „wyczyść moje" / „wyczyść wszystko". */
export interface DrawingClearPayload {
  sceneId: string;
  /** `all` is GM only; `mine` removes the caller's drawings on that scene. */
  scope: 'mine' | 'all';
}

/**
 * Server → client `drawing:upsert`. Sequenced when it goes campaign-wide;
 * GM-layer drawings are targeted at the GM room and therefore carry no seq,
 * for the same reason whispers do not.
 */
export interface DrawingUpsertBroadcast {
  seq?: number;
  drawing: DrawingView;
}

export interface DrawingDeleteBroadcast {
  seq?: number;
  sceneId: string;
  drawingId: number;
}

/**
 * Server → client `drawing:clear`. Carries the rule, not the resulting list:
 * every client already holds the drawings it is allowed to see, and „drop the
 * ones by this author" produces the right result on each of them without the
 * server having to compose a different payload per viewer.
 */
export interface DrawingClearBroadcast {
  seq?: number;
  sceneId: string;
  /** Whose drawings go; `null` means every drawing on the scene. */
  authorId: string | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFinitePoint(value: unknown): value is ScenePoint {
  if (typeof value !== 'object' || value === null) return false;
  const point = value as Record<string, unknown>;
  return (
    typeof point.x === 'number' &&
    Number.isFinite(point.x) &&
    typeof point.y === 'number' &&
    Number.isFinite(point.y)
  );
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Trims and bounds a label; null when nothing usable is left. */
export function sanitizeDrawingText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Newlines would let one label span the map; a drawing is a caption, not a
  // handout (those arrive in stage 24).
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0 || trimmed.length > DRAWING_TEXT_MAX_LENGTH) return null;
  return trimmed;
}

/**
 * Normalizes an untrusted style. Unlike the shape this never fails: a broken
 * colour is cosmetic, and refusing a whole drawing over it would be worse than
 * drawing it in the default colour.
 */
export function sanitizeDrawingStyle(raw: unknown): DrawingStyle {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_DRAWING_STYLE };
  const input = raw as Record<string, unknown>;
  const color =
    typeof input.color === 'string' && /^#[0-9a-f]{6}$/i.test(input.color)
      ? input.color.toLowerCase()
      : DRAWING_DEFAULT_COLOR;
  const width = finiteNumber(input.width)
    ? Math.round(clamp(input.width, DRAWING_MIN_WIDTH, DRAWING_MAX_WIDTH))
    : DRAWING_DEFAULT_WIDTH;
  return { color, width, filled: input.filled === true };
}

/**
 * Validates a shape coming off the wire. Coordinates are *not* clamped to the
 * scene — a sketch that runs off the edge is normal annotating — only counts
 * and sizes are bounded, because those are what a malicious client could blow
 * up.
 */
export function sanitizeDrawingShape(raw: unknown): DrawingShape | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;

  if (input.kind === 'path') {
    if (!Array.isArray(input.points)) return null;
    if (input.points.length < 1 || input.points.length > DRAWING_PATH_MAX_POINTS) return null;
    const points: ScenePoint[] = [];
    for (const value of input.points) {
      if (!isFinitePoint(value)) return null;
      points.push({ x: Math.round(value.x), y: Math.round(value.y) });
    }
    return { kind: 'path', points };
  }

  if (input.kind === 'rect') {
    const { x, y, width, height } = input;
    if (!finiteNumber(x) || !finiteNumber(y) || !finiteNumber(width) || !finiteNumber(height)) {
      return null;
    }
    // A drag can go up-left, so normalize to a positive extent.
    const left = Math.round(Math.min(x, x + width));
    const top = Math.round(Math.min(y, y + height));
    const w = Math.round(Math.abs(width));
    const h = Math.round(Math.abs(height));
    if (w < 1 || h < 1) return null;
    return { kind: 'rect', x: left, y: top, width: w, height: h };
  }

  if (input.kind === 'ellipse') {
    const { x, y, radiusX, radiusY } = input;
    if (!finiteNumber(x) || !finiteNumber(y) || !finiteNumber(radiusX) || !finiteNumber(radiusY)) {
      return null;
    }
    const rx = Math.round(Math.abs(radiusX));
    const ry = Math.round(Math.abs(radiusY));
    if (rx < 1 || ry < 1) return null;
    return { kind: 'ellipse', x: Math.round(x), y: Math.round(y), radiusX: rx, radiusY: ry };
  }

  if (input.kind === 'text') {
    const { x, y } = input;
    if (!finiteNumber(x) || !finiteNumber(y)) return null;
    const text = sanitizeDrawingText(input.text);
    if (text === null) return null;
    const fontSize = finiteNumber(input.fontSize)
      ? Math.round(clamp(input.fontSize, DRAWING_MIN_FONT_SIZE, DRAWING_MAX_FONT_SIZE))
      : DRAWING_DEFAULT_FONT_SIZE;
    return { kind: 'text', x: Math.round(x), y: Math.round(y), text, fontSize };
  }

  return null;
}

/** Shortest distance from a point to a segment, in scene pixels. */
function distanceToSegment(point: ScenePoint, a: ScenePoint, b: ScenePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq, 0, 1);
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/**
 * Rough on-screen extent of a label. Pixi measures text properly, but the
 * eraser has to answer „did I click this?" without a renderer, so a caption is
 * treated as a box: 0.55 em per character is close enough for a hit area, and
 * erring on the wide side is the friendly direction.
 */
export function drawingTextBounds(shape: DrawingText): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: shape.x,
    y: shape.y,
    width: Math.max(shape.fontSize * 0.55 * shape.text.length, shape.fontSize),
    height: shape.fontSize * 1.2,
  };
}

/**
 * Did the user click this drawing? Used by the eraser, so it is deliberately
 * generous: `tolerance` (scene pixels) widens the hit area beyond the stroke
 * so a thin line can still be grabbed at low zoom.
 *
 * An unfilled rect or ellipse is only its outline — clicking the empty middle
 * of a circled area erases nothing, which is what lets the GM circle a whole
 * room and still erase the sketch inside it.
 */
export function drawingHitTest(
  drawing: Pick<DrawingView, 'shape' | 'style'>,
  point: ScenePoint,
  tolerance = 0,
): boolean {
  const { shape, style } = drawing;
  const reach = style.width / 2 + Math.max(0, tolerance);

  if (shape.kind === 'path') {
    const first = shape.points[0];
    if (!first) return false;
    if (shape.points.length === 1) return Math.hypot(point.x - first.x, point.y - first.y) <= reach;
    for (let i = 1; i < shape.points.length; i++) {
      if (distanceToSegment(point, shape.points[i - 1]!, shape.points[i]!) <= reach) return true;
    }
    return false;
  }

  if (shape.kind === 'rect') {
    const outside =
      point.x < shape.x - reach ||
      point.x > shape.x + shape.width + reach ||
      point.y < shape.y - reach ||
      point.y > shape.y + shape.height + reach;
    if (outside) return false;
    if (style.filled) return true;
    const inside =
      point.x > shape.x + reach &&
      point.x < shape.x + shape.width - reach &&
      point.y > shape.y + reach &&
      point.y < shape.y + shape.height - reach;
    return !inside;
  }

  if (shape.kind === 'ellipse') {
    const outerX = shape.radiusX + reach;
    const outerY = shape.radiusY + reach;
    const dx = point.x - shape.x;
    const dy = point.y - shape.y;
    if ((dx / outerX) ** 2 + (dy / outerY) ** 2 > 1) return false;
    if (style.filled) return true;
    const innerX = shape.radiusX - reach;
    const innerY = shape.radiusY - reach;
    if (innerX <= 0 || innerY <= 0) return true;
    return (dx / innerX) ** 2 + (dy / innerY) ** 2 >= 1;
  }

  const box = drawingTextBounds(shape);
  return (
    point.x >= box.x - tolerance &&
    point.x <= box.x + box.width + tolerance &&
    point.y >= box.y - tolerance &&
    point.y <= box.y + box.height + tolerance
  );
}

/**
 * Picks the drawing a click lands on: the newest one wins, because that is the
 * one drawn on top. `canErase` keeps a player from even trying to remove
 * someone else's line — the server refuses it anyway, but reaching *through*
 * a foreign drawing to erase one's own underneath is the behaviour that feels
 * right at the table.
 */
export function pickDrawingAt(
  drawings: DrawingView[],
  point: ScenePoint,
  tolerance: number,
  canErase: (drawing: DrawingView) => boolean,
): DrawingView | null {
  let best: DrawingView | null = null;
  for (const drawing of drawings) {
    if (!canErase(drawing)) continue;
    if (!drawingHitTest(drawing, point, tolerance)) continue;
    if (!best || drawing.id > best.id) best = drawing;
  }
  return best;
}

/**
 * Douglas–Peucker: drops the samples a polyline does not need. A freehand
 * stroke arrives at pointer rate — several hundred points for one gesture —
 * and storing every one of them would put a megabyte of noise in the database
 * for a line the eye reads as smooth. Run on the client *before* sending.
 */
export function simplifyPath(points: ScenePoint[], tolerance: number): ScenePoint[] {
  if (points.length <= 2 || tolerance <= 0) return points.map((point) => ({ ...point }));

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  // Iterative rather than recursive: a 512-point stroke is not deep, but the
  // explicit stack keeps the worst case (every point kept) off the call stack.
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let farthest = -1;
    let maxDistance = tolerance;
    for (let i = start + 1; i < end; i++) {
      const distance = distanceToSegment(points[i]!, points[start]!, points[end]!);
      if (distance > maxDistance) {
        maxDistance = distance;
        farthest = i;
      }
    }
    if (farthest === -1) continue;
    keep[farthest] = true;
    stack.push([start, farthest], [farthest, end]);
  }

  const result: ScenePoint[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) result.push({ ...points[i]! });
  return result;
}
