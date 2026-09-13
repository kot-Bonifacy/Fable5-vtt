/**
 * Field of view (stage 18a) — core VTT, no game system involved.
 *
 * Given a point and a set of blocking segments, this produces the **visibility
 * polygon**: the star-shaped region an observer standing there can actually
 * see. Both ends of the wire use it, but for different reasons:
 *
 *  - the **server** asks „is this token's centre inside the polygon?" before it
 *    puts that token in a player's payload — the only definition of hidden the
 *    project accepts;
 *  - the **client** receives the finished polygon and cuts it out of a black
 *    sheet, exactly the way the fog of 17a is composited.
 *
 * The algorithm is the classical angular sweep: every segment endpoint defines
 * a direction worth sampling, a ray is cast slightly to each side of it (so the
 * sweep catches both the corner it stops on and the wall behind it), the
 * nearest hit wins, and the hits sorted by angle *are* the polygon.
 *
 * The scene rectangle is always part of the segment list, which is what keeps
 * the polygon finite when the observer looks out of an open door.
 */

import type { LightGlow, LightMask } from './lights.js';
import type { ScenePoint } from './measure.js';

/** A blocking edge in scene pixels. Walls, doors and the scene border alike. */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** One thing that sees (stage 18a: a token; 18b will add light sources). */
export interface VisionSource {
  origin: ScenePoint;
  /** Sight limit in scene pixels; null = as far as the walls allow. */
  radiusPx: number | null;
}

/**
 * Server → client `vision:sync` — the finished polygons of one viewer, in scene
 * pixels. Targeted per socket and carrying no seq, like `token:sync`: every
 * player's field of view is different, so this can never be a room broadcast.
 *
 * This is the whole reason walls stay on the server. The client is handed the
 * *result* of the raycast and never the geometry that produced it, so a player
 * holding the developer tools open still cannot read the floor plan of a
 * building their character has not entered.
 */
export interface VisionSyncBroadcast {
  /** Figure visibility; null disables the translucent barrier cover. */
  figurePolygons?: ScenePoint[][] | null;
  sceneId: string;
  /** One polygon per vision source; an empty list means „sees nothing". */
  polygons: ScenePoint[][];
  /**
   * Light levels inside the polygons above (stage 18b); null on a scene that is
   * not dark, where being seen is the whole of being visible.
   *
   * A grid rather than the light polygons, for the same reason the walls stayed
   * behind: a light's polygon is clipped by walls and therefore *is* a floor
   * plan. See `lights.ts`.
   */
  light?: LightMask | null;
  /** Lamps this viewer can see, for the coloured layer; empty on a lit scene. */
  glows?: LightGlow[];
}

/** Default sight limit in metres offered by the UI; null stays „unlimited". */
export const VISION_RANGE_MAX_METRES = 500;

/**
 * Angular nudge to each side of a corner, in radians. A ray aimed exactly at a
 * vertex is ambiguous — it may or may not be counted as hitting the segments
 * meeting there — so the sweep also samples just past it on both sides, which
 * is what produces the two points a shadow edge needs.
 */
const ANGLE_EPSILON = 1e-5;
/**
 * A hit closer than this is ignored. Without it a token standing exactly on a
 * wall (or on the scene border) would blind itself: every ray would terminate
 * at distance zero and the polygon would collapse to a point.
 */
const MIN_HIT_DISTANCE = 0.01;
/**
 * How many rays approximate a sight radius. Sixty-four is a circle no one reads
 * as a polygon at table zoom, and it only applies to sources that *have* a
 * radius — an unlimited one casts rays at corners alone.
 */
const RADIUS_RAY_COUNT = 64;

/** The four edges of the scene, so a polygon is always bounded. */
export function sceneBoundsSegments(bounds: { width: number; height: number }): Segment[] {
  const { width, height } = bounds;
  return [
    { x1: 0, y1: 0, x2: width, y2: 0 },
    { x1: width, y1: 0, x2: width, y2: height },
    { x1: width, y1: height, x2: 0, y2: height },
    { x1: 0, y1: height, x2: 0, y2: 0 },
  ];
}

/**
 * Distance from `origin` along the unit vector (dx, dy) to the segment, or null
 * when the ray misses it. Solves the ray/segment system directly rather than
 * clipping, because the sweep runs this tens of thousands of times per frame of
 * GM editing and every allocation would show.
 */
function rayHitDistance(
  origin: ScenePoint,
  dx: number,
  dy: number,
  segment: Segment,
): number | null {
  const sdx = segment.x2 - segment.x1;
  const sdy = segment.y2 - segment.y1;
  const denominator = dx * sdy - dy * sdx;
  // Parallel (or a degenerate segment): no single crossing to report.
  if (Math.abs(denominator) < 1e-12) return null;
  const ox = segment.x1 - origin.x;
  const oy = segment.y1 - origin.y;
  // t = distance along the ray, u = position along the segment (0..1).
  const t = (ox * sdy - oy * sdx) / denominator;
  const u = (ox * dy - oy * dx) / denominator;
  if (t < MIN_HIT_DISTANCE) return null;
  if (u < 0 || u > 1) return null;
  return t;
}

/** Nearest blocking hit along a ray, capped by the sight radius. */
function castRay(
  origin: ScenePoint,
  angle: number,
  segments: readonly Segment[],
  radiusPx: number | null,
): ScenePoint {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let nearest = radiusPx ?? Number.POSITIVE_INFINITY;
  for (const segment of segments) {
    const distance = rayHitDistance(origin, dx, dy, segment);
    if (distance !== null && distance < nearest) nearest = distance;
  }
  // The scene border is always in `segments`, so an unlimited source still
  // terminates; this guard only covers a caller that passed none at all.
  if (!Number.isFinite(nearest)) nearest = 0;
  return { x: origin.x + dx * nearest, y: origin.y + dy * nearest };
}

/**
 * The polygon an observer at `origin` can see, in scene pixels, ordered by
 * angle. Pass the blocking segments **including** the scene border (see
 * `sceneBoundsSegments`) — an unbounded set would let rays run to infinity.
 */
export function computeVisionPolygon(
  origin: ScenePoint,
  segments: readonly Segment[],
  radiusPx: number | null = null,
): ScenePoint[] {
  const radius = radiusPx !== null && Number.isFinite(radiusPx) && radiusPx > 0 ? radiusPx : null;
  const angles: number[] = [];

  for (const segment of segments) {
    // A segment entirely beyond the sight radius can neither block nor bound
    // anything this observer sees; skipping it early is what keeps a large map
    // with hundreds of walls cheap for a torch-sized source.
    if (radius !== null && !segmentWithinRadius(origin, segment, radius)) continue;
    for (const [x, y] of [
      [segment.x1, segment.y1],
      [segment.x2, segment.y2],
    ] as const) {
      const angle = Math.atan2(y - origin.y, x - origin.x);
      angles.push(angle - ANGLE_EPSILON, angle, angle + ANGLE_EPSILON);
    }
  }

  // A radius needs rays of its own: without a corner to aim at there would be
  // nothing sampling the open space, and the circle would come out as whatever
  // polygon the nearby walls happened to describe.
  if (radius !== null) {
    for (let i = 0; i < RADIUS_RAY_COUNT; i++) {
      angles.push((i / RADIUS_RAY_COUNT) * Math.PI * 2 - Math.PI);
    }
  }
  if (angles.length === 0) return [];

  angles.sort((a, b) => a - b);
  const polygon: ScenePoint[] = [];
  let previous = Number.NaN;
  for (const angle of angles) {
    // Duplicate directions (shared corners, overlapping walls) would add
    // degenerate edges the point-in-polygon test then has to wade through.
    if (Math.abs(angle - previous) < ANGLE_EPSILON / 2) continue;
    previous = angle;
    polygon.push(castRay(origin, angle, segments, radius));
  }
  return polygon;
}

/**
 * Is any part of the segment within `radius` of the point?
 *
 * Exported for the light mask (stage 18b), which pre-filters the wall list per
 * light: a torch is shadowed only by walls it can reach, and on a full floor
 * plan that is the difference between eight segment tests per cell and two
 * hundred.
 */
export function segmentWithinRadius(point: ScenePoint, segment: Segment, radius: number): boolean {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - segment.x1, point.y - segment.y1) <= radius;
  let t = ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / lengthSq;
  t = Math.min(1, Math.max(0, t));
  const nearestX = segment.x1 + t * dx;
  const nearestY = segment.y1 + t * dy;
  return Math.hypot(point.x - nearestX, point.y - nearestY) <= radius;
}

/** One polygon per source, in the order the sources were given. */
export function computeVisionPolygons(
  sources: readonly VisionSource[],
  segments: readonly Segment[],
): ScenePoint[][] {
  return sources.map((source) => computeVisionPolygon(source.origin, segments, source.radiusPx));
}

/**
 * Even–odd ray casting. Points exactly on an edge are deliberately *not*
 * special-cased: a token straddling the boundary of what someone can see is
 * decided by floating point either way, and no rule would make that feel more
 * principled than it is.
 */
export function isPointInPolygon(point: ScenePoint, polygon: readonly ScenePoint[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const straddles = a.y > point.y !== b.y > point.y;
    if (!straddles) continue;
    const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < x) inside = !inside;
  }
  return inside;
}

/**
 * Is the straight line between two points free of blockers?
 *
 * Used for doors rather than the polygon test: a closed door *is* the boundary
 * of the visibility polygon, so asking „is its midpoint inside?" gets a coin
 * flip from floating point. A direct line-of-sight test answers the question
 * that was actually being asked — can this viewer see that door from here.
 * Pass the blocking segments **without** the door being tested.
 */
export function isSegmentClear(
  from: ScenePoint,
  to: ScenePoint,
  segments: readonly Segment[],
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < MIN_HIT_DISTANCE) return true;
  const ux = dx / length;
  const uy = dy / length;
  for (const segment of segments) {
    const distance = rayHitDistance(from, ux, uy, segment);
    // A blocker exactly at the target does not block the target itself.
    if (distance !== null && distance < length - MIN_HIT_DISTANCE) return false;
  }
  return true;
}

/**
 * Where the straight line from `from` to `to` crosses a segment, as a distance
 * from `from` in scene pixels — or null when it does not (stage 42b).
 *
 * The same crossing `isSegmentClear` asks about, for the one caller that needs
 * more than a yes: a barrier lets a round through at a price, so the line has to
 * say which barriers it passed and where, not only whether one was there. The
 * edge rules are shared on purpose — something at the very start of the line or
 * exactly at its end is not in the way.
 */
export function segmentCrossingDistance(
  from: ScenePoint,
  to: ScenePoint,
  segment: Segment,
): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < MIN_HIT_DISTANCE) return null;
  const distance = rayHitDistance(from, dx / length, dy / length, segment);
  return distance !== null && distance < length - MIN_HIT_DISTANCE ? distance : null;
}

/** Can *any* of the viewer's sources see this point? */
export function isPointVisible(
  point: ScenePoint,
  polygons: readonly (readonly ScenePoint[])[],
): boolean {
  for (const polygon of polygons) if (isPointInPolygon(point, polygon)) return true;
  return false;
}
