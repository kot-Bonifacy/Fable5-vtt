/**
 * Axis-aligned rectangles in scene pixels — core VTT geometry, no game system.
 *
 * Extracted from `covers.ts` in stage 26f, when the defended zone turned out to
 * be the *third* thing on the map shaped like a rectangle somebody drags out
 * (cover 16c, smoke square 16h, defended zone 26f). The three differ in what
 * they mean and share every line of „is this point inside" and „did that path
 * cross it", so the meaning stays in the three modules and the arithmetic lives
 * here.
 *
 * Everything works in **scene (world) pixels**. Metres never appear: a rectangle
 * does not know what a metre is, and the two modules that do already carry the
 * scene's own scale.
 */

import type { ScenePoint } from './measure.js';
import type { Segment } from './vision.js';

/** A rectangle with a top-left corner and a positive size, in scene pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The four edges of a rectangle, clockwise from the top-left corner. */
export function rectSegments(rect: Rect): Segment[] {
  const { x, y, width, height } = rect;
  const right = x + width;
  const bottom = y + height;
  return [
    { x1: x, y1: y, x2: right, y2: y },
    { x1: right, y1: y, x2: right, y2: bottom },
    { x1: right, y1: bottom, x2: x, y2: bottom },
    { x1: x, y1: bottom, x2: x, y2: y },
  ];
}

/** Is this point inside the rectangle (edges included)? */
export function isPointInRect(rect: Rect, point: ScenePoint): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/** Shortest distance from a point to the rectangle, in scene pixels; 0 inside. */
export function distanceToRect(point: ScenePoint, rect: Rect): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

/**
 * Does the straight line from `from` to `to` pass through this rectangle?
 *
 * The endpoints count as inside: a figure standing *in* the footprint is in it,
 * and a path that starts there has already crossed.
 */
export function segmentCrossesRect(rect: Rect, from: ScenePoint, to: ScenePoint): boolean {
  if (isPointInRect(rect, from) || isPointInRect(rect, to)) return true;
  for (const edge of rectSegments(rect)) {
    if (segmentsIntersect(from, to, { x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 })) {
      return true;
    }
  }
  return false;
}

/** Standard orientation test; collinear touching counts as an intersection. */
function segmentsIntersect(
  a1: ScenePoint,
  a2: ScenePoint,
  b1: ScenePoint,
  b2: ScenePoint,
): boolean {
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return (
    (d1 === 0 && onSegment(b1, b2, a1)) ||
    (d2 === 0 && onSegment(b1, b2, a2)) ||
    (d3 === 0 && onSegment(a1, a2, b1)) ||
    (d4 === 0 && onSegment(a1, a2, b2))
  );
}

function cross(a: ScenePoint, b: ScenePoint, p: ScenePoint): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

function onSegment(a: ScenePoint, b: ScenePoint, p: ScenePoint): boolean {
  return (
    Math.min(a.x, b.x) <= p.x &&
    p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y &&
    p.y <= Math.max(a.y, b.y)
  );
}

/**
 * Turns a drag into a stored rectangle, or null when it was a stray click.
 *
 * Rounded to whole scene pixels — the things this builds are things in the
 * world, and half a pixel of a car is nothing anybody meant to draw. A drag may
 * run in any direction; the result always starts at its top-left corner so
 * every later test can assume it.
 */
export function sanitizeRect(raw: unknown, bounds: { min: number; max: number }): Rect | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const numbers = [value.x, value.y, value.width, value.height];
  if (!numbers.every((n): n is number => typeof n === 'number' && Number.isFinite(n))) return null;
  const width = Math.round(Math.abs(value.width as number));
  const height = Math.round(Math.abs(value.height as number));
  if (width < bounds.min || height < bounds.min) return null;
  if (width > bounds.max || height > bounds.max) return null;
  const x = Math.round(Math.min(value.x as number, (value.x as number) + (value.width as number)));
  const y = Math.round(Math.min(value.y as number, (value.y as number) + (value.height as number)));
  return { x, y, width, height };
}
