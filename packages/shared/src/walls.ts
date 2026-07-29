/**
 * Walls and doors (stage 18a) — core VTT, no game system involved.
 *
 * A wall is stored as a single segment, not as a chain: the editor draws chains
 * because that is how a floor plan is traced, but the raycast in `vision.ts`
 * consumes segments, and „one gesture, N rows" keeps the eraser working on the
 * piece the GM actually clicked.
 *
 * The rule that shapes this whole module: **walls never reach a player.** Where
 * fog (17a) and drawings (17b) send players a mask they are allowed to see, a
 * wall layout is the floor plan of a building the party has not entered yet.
 * Players receive one thing only — doors the GM flagged as theirs to open, and
 * only while those doors lie inside their own field of view.
 */

import type { ScenePoint } from './measure.js';
import type { Segment } from './vision.js';

export const WALL_KINDS = ['wall', 'door', 'window'] as const;
/**
 * `wall` blocks sight always, `door` only while closed, `window` never — the
 * last one exists so a GM can mark glass and railings that will block *movement*
 * once the VTT knows collisions at all (it does not yet; see POMYSLY.md).
 */
export type WallKind = (typeof WALL_KINDS)[number];

/** One stored wall as it goes over the wire — GM only, save for open doors. */
export interface WallView {
  /** Autoincrement id; also the creation order within a chain. */
  id: number;
  sceneId: string;
  kind: WallKind;
  /** Doors only; a wall or window ignores it. */
  open: boolean;
  /** Doors only: players may operate this one, and therefore may see it. */
  playerToggle: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Max points in one drawn chain — a guard against a runaway client. */
export const WALL_CHAIN_MAX_POINTS = 128;
/**
 * Max walls kept per scene. A detailed floor plan runs to a couple of hundred
 * segments; the cap only stops a client from filling the database, and the sight
 * calculation stays comfortable well past it.
 */
export const WALL_MAX_PER_SCENE = 2000;
/** Shorter than this and the segment is a stray click, not a wall. */
export const WALL_MIN_LENGTH = 2;
/**
 * How close a new point has to be to an existing endpoint to snap onto it, in
 * scene pixels. Snapping to *walls* matters more than snapping to the grid: a
 * one-pixel gap between two segments is a slit that light pours through, and it
 * is invisible at the zoom a whole floor plan is drawn at.
 */
export const WALL_ENDPOINT_SNAP_PX = 12;

/** Client → server payload of `wall:create` — one drawn chain. */
export interface WallCreatePayload {
  sceneId: string;
  /** Consecutive points; N points become N−1 segments. */
  points: ScenePoint[];
  kind: WallKind;
  /** Doors only; ignored for other kinds. */
  playerToggle?: boolean;
}

/** Client → server payload of `wall:update` — retype or reflag one segment. */
export interface WallUpdatePayload {
  wallId: number;
  patch: {
    kind?: WallKind;
    playerToggle?: boolean;
  };
}

export interface WallDeletePayload {
  wallId: number;
}

export interface WallClearPayload {
  sceneId: string;
}

/**
 * Client → server payload of `door:toggle`. Omitting `open` flips the door,
 * which is what a click on the map means; the explicit form exists for tests
 * and for a future keyboard shortcut.
 */
export interface DoorTogglePayload {
  wallId: number;
  open?: boolean;
}

/**
 * Server → client `wall:sync` — the whole wall list of one scene, GM only.
 *
 * A full list rather than deltas: walls change only while the GM is editing,
 * a scene holds tens of them, and a list that cannot desync is worth more here
 * than the bytes an upsert would save.
 */
export interface WallSyncBroadcast {
  sceneId: string;
  walls: WallView[];
}

/**
 * Server → client `door:sync` — the operable doors one player may currently
 * see. Targeted per socket (no seq), because the list differs per viewer.
 */
export interface DoorSyncBroadcast {
  sceneId: string;
  doors: WallView[];
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isWallKind(value: unknown): value is WallKind {
  return value === 'wall' || value === 'door' || value === 'window';
}

/** Does this wall stop a line of sight right now? */
export function wallBlocksSight(wall: Pick<WallView, 'kind' | 'open'>): boolean {
  if (wall.kind === 'window') return false;
  if (wall.kind === 'door') return !wall.open;
  return true;
}

/** The subset of walls the raycast cares about, as bare segments. */
export function blockingSegments(walls: readonly WallView[]): Segment[] {
  const segments: Segment[] = [];
  for (const wall of walls) {
    if (!wallBlocksSight(wall)) continue;
    segments.push({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 });
  }
  return segments;
}

/**
 * Validates a drawn chain and turns it into segments. Points are rounded to
 * whole scene pixels and consecutive duplicates are dropped — a click that did
 * not move is not a wall, and a zero-length segment would give the raycast a
 * direction it cannot compute.
 */
export function sanitizeWallChain(raw: unknown): Segment[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length < 2 || raw.length > WALL_CHAIN_MAX_POINTS) return null;
  const points: ScenePoint[] = [];
  for (const value of raw) {
    if (typeof value !== 'object' || value === null) return null;
    const point = value as Record<string, unknown>;
    if (!finiteNumber(point.x) || !finiteNumber(point.y)) return null;
    const next = { x: Math.round(point.x), y: Math.round(point.y) };
    const last = points[points.length - 1];
    if (last && Math.hypot(next.x - last.x, next.y - last.y) < WALL_MIN_LENGTH) continue;
    points.push(next);
  }
  if (points.length < 2) return null;
  const segments: Segment[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  return segments;
}

/** Shortest distance from a point to a wall, in scene pixels. */
export function distanceToWall(point: ScenePoint, wall: Segment): number {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - wall.x1, point.y - wall.y1);
  let t = ((point.x - wall.x1) * dx + (point.y - wall.y1) * dy) / lengthSq;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(point.x - (wall.x1 + t * dx), point.y - (wall.y1 + t * dy));
}

/** Midpoint of a wall — where the door glyph sits and what „is it visible?" asks. */
export function wallMidpoint(wall: Segment): ScenePoint {
  return { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
}

/** The wall a click lands on: nearest within `tolerance`, else null. */
export function pickWallAt(
  walls: readonly WallView[],
  point: ScenePoint,
  tolerance: number,
): WallView | null {
  let best: WallView | null = null;
  let bestDistance = tolerance;
  for (const wall of walls) {
    const distance = distanceToWall(point, wall);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = wall;
    }
  }
  return best;
}

/**
 * Where a drawn point should actually land. An existing wall endpoint wins over
 * the grid: closing a room exactly is what makes the difference between a sealed
 * wall and a slit that lights the whole map, and the GM cannot see a two-pixel
 * gap at the zoom a floor plan is traced at.
 */
export function snapWallPoint(
  point: ScenePoint,
  walls: readonly WallView[],
  options: { gridSizePx: number | null; snapRadiusPx?: number },
): ScenePoint {
  const snapRadius = options.snapRadiusPx ?? WALL_ENDPOINT_SNAP_PX;
  let best: ScenePoint | null = null;
  let bestDistance = snapRadius;
  for (const wall of walls) {
    for (const candidate of [
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 },
    ]) {
      const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
  }
  if (best) return { ...best };

  const size = options.gridSizePx;
  if (size !== null && Number.isFinite(size) && size > 0) {
    // Walls run along the edges of squares, not through their middles, so the
    // grid snap targets intersections.
    return { x: Math.round(point.x / size) * size, y: Math.round(point.y / size) * size };
  }
  return { x: Math.round(point.x), y: Math.round(point.y) };
}
