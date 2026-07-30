/**
 * Walls, doors and windows (stages 18a, 18d) — core VTT, no game system.
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
 *
 * Stage 18d made both of those objects behave like things in a space rather than
 * switches on a board: a door has to be within arm's reach to be worked and can
 * be bolted, and a window shows what is behind it only from up close.
 */

import type { ScenePoint } from './measure.js';
import type { Segment } from './vision.js';

export const WALL_KINDS = ['wall', 'door', 'window'] as const;
/**
 * `wall` blocks sight always. `door` and `window` are **openings**: they can be
 * opened, bolted and worked by hand, and what they do to sight depends on that
 * state. A closed door blocks; a closed window blocks only for an observer
 * standing away from it (the net curtain, stage 18d) and dims the light that
 * passes it (`LIGHT_WINDOW_COST`); either one standing open is a hole in the
 * wall — no shadow, no toll on the light.
 */
export type WallKind = (typeof WALL_KINDS)[number];

/**
 * Can this be opened, bolted and reached for?
 *
 * Doors and windows are one mechanism with two skins. They differ only in what
 * they do while **closed** — a door is opaque, a window is a curtained pane —
 * and once open they are the same hole in a wall.
 */
export function isOpening(wall: Pick<WallView, 'kind'>): boolean {
  return wall.kind === 'door' || wall.kind === 'window';
}

/** One stored wall as it goes over the wire — GM only, save for open doors. */
export interface WallView {
  /** Autoincrement id; also the creation order within a chain. */
  id: number;
  sceneId: string;
  kind: WallKind;
  /** Openings only (doors and windows); a plain wall ignores it. */
  open: boolean;
  /** Openings only: players may operate this one, and therefore may see it. */
  playerToggle: boolean;
  /**
   * Openings only (stage 18d): bolted, and a player's click does nothing.
   *
   * **This field is scrubbed to `false` on its way to a player.** A locked door
   * still travels — a door you cannot see is a door you cannot try — but whether
   * it gives is something the character finds out by pulling the handle, not
   * something the client is told in advance. The GM's own list carries the truth.
   */
  locked: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Arm's reach, in metres (stage 18d) — how close a token has to stand to touch
 * a door, and how close to a window before the pane stops being a bright
 * rectangle and starts being a view.
 *
 * Two metres is one square on a Cyberpunk RED map, and on such a scene it works
 * out to exactly „the square next to it, diagonals included": the centre of an
 * adjacent square sits 1 m from the wall along its edge and 1,41 m from the
 * nearest end diagonally, while two squares out is 3 m and misses. Expressed in
 * metres rather than in squares so that gridless scenes and unusual scales get
 * an answer that still means the length of an arm.
 */
export const WALL_REACH_M = 2;

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
  /** Openings only; ignored on a plain wall. */
  playerToggle?: boolean;
}

/** Client → server payload of `wall:update` — retype or reflag one segment. */
export interface WallUpdatePayload {
  wallId: number;
  patch: {
    kind?: WallKind;
    playerToggle?: boolean;
    /** Openings only (stage 18d); bolting one also shuts it. */
    locked?: boolean;
  };
}

export interface WallDeletePayload {
  wallId: number;
}

export interface WallClearPayload {
  sceneId: string;
}

/**
 * Client → server payload of `opening:toggle`. Omitting `open` flips it, which
 * is what a click on the map means; the explicit form exists for tests and for a
 * future keyboard shortcut.
 *
 * One event for doors and windows rather than two, because the interaction is
 * identical down to the refusal codes — only the fiction differs, and fiction is
 * the GM's department.
 */
export interface OpeningTogglePayload {
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
 * Server → client `opening:sync` — the doors *and windows* one player may
 * currently operate and see. Targeted per socket (no seq), because the list
 * differs per viewer.
 */
export interface OpeningSyncBroadcast {
  sceneId: string;
  openings: WallView[];
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isWallKind(value: unknown): value is WallKind {
  return value === 'wall' || value === 'door' || value === 'window';
}

/**
 * Does this wall stop a line of sight for everybody, wherever they stand?
 *
 * A closed window answers `false` here and is nonetheless a blocker for most
 * observers — see `sightSegmentsFor`. This function is the part of the answer
 * that does not depend on who is asking, and it is what the *light* uses: a pane
 * dims a beam (`LIGHT_WINDOW_COST`), it never stops it.
 */
export function wallBlocksSight(wall: Pick<WallView, 'kind' | 'open'>): boolean {
  if (wall.kind === 'window') return false;
  if (wall.kind === 'door') return !wall.open;
  return true;
}

/**
 * The panes that currently take their toll on light passing through them
 * (`LIGHT_WINDOW_COST`) — closed windows, and only those.
 *
 * An **open** window is a hole: nothing is left to dim the beam, which is what
 * makes „the window is open" legible on a dark map without anyone saying so. A
 * door is absent from this list in both states — shut it blocks outright, open
 * it costs nothing.
 */
export function tollingWindows(walls: readonly WallView[]): Segment[] {
  const panes: Segment[] = [];
  for (const wall of walls) {
    if (wall.kind !== 'window' || wall.open) continue;
    panes.push({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 });
  }
  return panes;
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
 * What blocks sight **for one observer** (stage 18d) — the walls everybody is
 * stopped by, plus the windows this particular observer is too far from to see
 * through.
 *
 * This is the „net curtain" rule, and it is the reason the segment list stopped
 * being shared between viewers. A window is a bright rectangle from the street:
 * a curtain, a grimy pane or a half-drawn blind gives away that there is a room
 * behind it and nothing about what is in the room. Walk up to it and you look
 * through. The rule is deliberately symmetric — the geometry has no idea which
 * side is „inside", and neither has a net curtain.
 *
 * `curtainReachPx` of `null` switches the rule off, which is what a **dark**
 * scene passes: at night a lit window is *more* visible from a distance, not
 * less, and there the pane already costs the light that comes through it.
 *
 * An **open** window is never curtained. There is no glass in the way any more,
 * so it behaves like a doorway — which is the whole point of being able to open
 * one, and the reason a burglar shoves the sash up before looking in.
 *
 * The reach is measured to the nearest point of the pane, so standing at one end
 * of a shop front opens the whole of it. That is a simplification, and the right
 * one: a window is one object, and splitting a pane into the bit you are level
 * with and the bit you are not would be geometry nobody at the table asked for.
 */
export function sightSegmentsFor(
  walls: readonly WallView[],
  origin: ScenePoint,
  options: { curtainReachPx: number | null },
): Segment[] {
  const reach = options.curtainReachPx;
  const segments: Segment[] = [];
  for (const wall of walls) {
    if (wallBlocksSight(wall)) {
      segments.push({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 });
      continue;
    }
    // Only closed windows get the curtain treatment. Anything standing open —
    // a door or a sash — is a hole, and a hole hides nothing from anybody.
    if (reach === null || wall.kind !== 'window' || wall.open) continue;
    if (distanceToWall(origin, wall) <= reach) continue;
    segments.push({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 });
  }
  return segments;
}

/**
 * Is any of these points within `reachPx` of the wall (stage 18d)?
 *
 * „Arm's reach" for a door: the distance runs from a token's centre — the point
 * the ruler, the range bands and the field of view all measure from — to the
 * nearest point of the segment, so a door is reachable from anywhere along it
 * rather than only opposite its middle.
 */
export function isWallWithinReach(
  wall: Segment,
  origins: readonly ScenePoint[],
  reachPx: number,
): boolean {
  return origins.some((origin) => distanceToWall(origin, wall) <= reachPx);
}

/**
 * The walls of a room with every door shut and every window boarded (stage
 * 18c) — the shape of the space itself rather than of what can be seen from it.
 *
 * „How big is this room?" and „what can be seen from here?" are different
 * questions and want different segment lists. Measuring a lamp with the doors
 * as they happen to stand would size it by whatever is beyond the one that is
 * open: a bedroom with its door ajar measures as the whole floor. The light
 * still spills through that doorway when it is drawn — the raycast at render
 * time uses the real doors — it just no longer decides how strong the bulb is.
 */
export function roomSegments(walls: readonly WallView[]): Segment[] {
  return walls.map((wall) => ({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 }));
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
