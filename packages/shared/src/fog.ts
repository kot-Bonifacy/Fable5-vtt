/**
 * Fog of war (stage 17) — core VTT, no game system involved.
 *
 * The fog is stored as an **ordered list of shapes**, never as a bitmap. A
 * scene starts fully covered; every shape either reveals or re-covers the area
 * it spans, and the *last* shape containing a point decides that point's fate.
 * That model buys three things a bitmap does not: the payload stays tiny (a
 * brush stroke is one row, not a megabyte of pixels), undo is `pop()`, and the
 * same geometry answers „may this player see that token?" on the server.
 *
 * Two shapes cover every tool of this stage:
 *  - `stroke` — the brush: a polyline with a radius, drawn round-capped, so one
 *    drag of the mouse is one shape no matter how many samples it took;
 *  - `rect` — the rectangle tool, and also „reveal everything" (one rect the
 *    size of the scene).
 *
 * „Cover everything" needs no shape at all: it clears the list, because the
 * base state already is covered.
 */

import type { ScenePoint } from './measure.js';
import type { SceneView } from './scenes.js';
import type { TokenView } from './tokens.js';

export const FOG_MODES = ['reveal', 'hide'] as const;
/** `reveal` uncovers the map underneath, `hide` puts the fog back. */
export type FogMode = (typeof FOG_MODES)[number];

/** One drag of the brush: a polyline with a radius, round caps and joins. */
export interface FogStroke {
  kind: 'stroke';
  mode: FogMode;
  points: ScenePoint[];
  /** Brush radius in scene pixels. */
  radius: number;
}

/** An axis-aligned rectangle; `width`/`height` are always positive. */
export interface FogRect {
  kind: 'rect';
  mode: FogMode;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type FogShape = FogStroke | FogRect;

/** A stored shape as it goes over the wire — the id doubles as the paint order. */
export type FogShapeView = FogShape & { id: number };

/** Fog of one scene, as sent to every viewer of it. */
export interface FogState {
  sceneId: string;
  /**
   * Is this scene painting fog at all? True exactly when its visibility mode
   * is `fog` (stage 18a) — the other two modes send an empty, disabled state,
   * while the painted shapes stay in the database waiting to be switched
   * back on.
   */
  enabled: boolean;
  /** Ascending by id — that *is* the paint order. */
  shapes: FogShapeView[];
  /**
   * The GM's overrides over dynamic vision (stage 18c) — the same brush, a
   * different meaning: `hide` keeps an area black however well lit and however
   * clear the line of sight, `reveal` shows it through walls.
   *
   * A separate list from `shapes` rather than a flag on them, because the two
   * are read against different backgrounds: fog starts covered and its shapes
   * decide everything, while an override starts *absent* and only speaks where
   * the GM painted. Sharing one list would turn every old „reveal" stroke into
   * a hole in the walls the moment a scene switched to dynamic vision. Only one
   * of the two lists is ever non-empty for a given scene mode.
   */
  overrides: FogShapeView[];
}

export const FOG_BRUSH_MIN_RADIUS = 8;
export const FOG_BRUSH_MAX_RADIUS = 2048;
export const FOG_DEFAULT_BRUSH_RADIUS = 120;
/** Max samples in one brush stroke; the client simplifies before sending. */
export const FOG_STROKE_MAX_POINTS = 512;
/**
 * Max shapes kept per scene. A long exploration session paints a few hundred;
 * the cap only stops a runaway client from filling the database, and the GM
 * can always compact the list with „reveal everything".
 */
export const FOG_MAX_SHAPES = 4000;

/** Client → server payload of `fog:paint`. */
export interface FogPaintPayload {
  sceneId: string;
  shape: FogShape;
}

/** Client → server payload of `fog:reset` — the sweeping buttons. */
export interface FogResetPayload {
  sceneId: string;
  /**
   * `reveal` uncovers the whole scene, `hide` puts it all back under cover,
   * `clear` drops every shape and hands the scene back to whatever decides
   * visibility underneath.
   *
   * `clear` only differs from `hide` on a scene whose brush paints GM overrides
   * (stage 18c): fog starts covered, so „cover everything" and „forget my
   * strokes" are the same button there, while an override starts absent and the
   * two are opposites — one blinds the party, the other lets the walls speak
   * again.
   */
  mode: FogMode | 'clear';
}

/** Client → server payload of `fog:undo` — drops the last painted shape. */
export interface FogUndoPayload {
  sceneId: string;
}

// The per-scene fog switch became one of the three modes of
// `SceneVisibilityPayload` in stage 18a — a scene decides between no cover,
// hand-painted fog and walls, and never runs two of them at once.

/**
 * Server → client `fog:paint`: one appended shape. Sequenced on the active
 * scene (it changes what players may see), targeted for GM previews.
 */
export interface FogPaintBroadcast {
  seq?: number;
  sceneId: string;
  shape: FogShapeView;
  /**
   * Which list the shape joins (stage 18c): the fog, or the GM's overrides
   * over dynamic vision. Decided by the scene's mode on the server — the client
   * is told, never asked.
   */
  override: boolean;
}

/** Server → client `fog:sync` — the whole fog after a reset, undo or toggle. */
export interface FogSyncBroadcast {
  seq?: number;
  fog: FogState;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFogMode(value: unknown): value is FogMode {
  return value === 'reveal' || value === 'hide';
}

/**
 * Validates a shape coming off the wire. Coordinates are *not* clamped to the
 * scene: a brush stroke that runs off the edge is normal painting, and a shape
 * outside the map simply affects nothing. Only the counts and the radius are
 * bounded, because those are what a malicious client could blow up.
 */
export function sanitizeFogShape(raw: unknown): FogShape | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  if (!isFogMode(input.mode)) return null;

  if (input.kind === 'stroke') {
    if (!Array.isArray(input.points)) return null;
    if (input.points.length < 1 || input.points.length > FOG_STROKE_MAX_POINTS) return null;
    const points: ScenePoint[] = [];
    for (const value of input.points) {
      if (!isFinitePoint(value)) return null;
      points.push({ x: Math.round(value.x), y: Math.round(value.y) });
    }
    if (typeof input.radius !== 'number' || !Number.isFinite(input.radius)) return null;
    return {
      kind: 'stroke',
      mode: input.mode,
      points,
      radius: Math.round(clamp(input.radius, FOG_BRUSH_MIN_RADIUS, FOG_BRUSH_MAX_RADIUS)),
    };
  }

  if (input.kind === 'rect') {
    const { x, y, width, height } = input;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      return null;
    }
    // A drag can go up-left, so normalize to a positive extent.
    const left = Math.round(Math.min(x, x + width));
    const top = Math.round(Math.min(y, y + height));
    const w = Math.round(Math.abs(width));
    const h = Math.round(Math.abs(height));
    if (w < 1 || h < 1) return null;
    return { kind: 'rect', mode: input.mode, x: left, y: top, width: w, height: h };
  }

  return null;
}

/** Shortest distance from a point to a segment, in scene pixels. */
function distanceToSegment(point: ScenePoint, a: ScenePoint, b: ScenePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  // A stroke of one sample (a click, not a drag) is just a disc at that point.
  if (lengthSq === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq, 0, 1);
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** Does the shape cover this point? Round caps and joins, like the brush draws. */
export function fogShapeContains(shape: FogShape, point: ScenePoint): boolean {
  if (shape.kind === 'rect') {
    return (
      point.x >= shape.x &&
      point.x <= shape.x + shape.width &&
      point.y >= shape.y &&
      point.y <= shape.y + shape.height
    );
  }
  const { points, radius } = shape;
  const first = points[0];
  if (!first) return false;
  if (points.length === 1) return Math.hypot(point.x - first.x, point.y - first.y) <= radius;
  for (let i = 1; i < points.length; i++) {
    if (distanceToSegment(point, points[i - 1]!, points[i]!) <= radius) return true;
  }
  return false;
}

/**
 * The axis-aligned box a shape can cover, brush radius included — the cheap
 * „could this shape matter here at all?" asked before `fogShapeContains`. A
 * stroke with no points covers nothing and gets a box nothing overlaps.
 */
export function fogShapeBounds(shape: FogShape): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (shape.kind === 'rect') {
    return {
      minX: shape.x,
      minY: shape.y,
      maxX: shape.x + shape.width,
      maxY: shape.y + shape.height,
    };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of shape.points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    minX: minX - shape.radius,
    minY: minY - shape.radius,
    maxX: maxX + shape.radius,
    maxY: maxY + shape.radius,
  };
}

/**
 * Is this point uncovered? The scene starts covered, so the answer is the mode
 * of the last shape containing the point — and `false` when no shape does.
 * Walking the list backwards means the common case (a point under the newest
 * reveal) stops on the first hit.
 */
export function isPointRevealed(point: ScenePoint, fog: Pick<FogState, 'enabled' | 'shapes'>) {
  if (!fog.enabled) return true;
  for (let i = fog.shapes.length - 1; i >= 0; i--) {
    const shape = fog.shapes[i]!;
    if (fogShapeContains(shape, point)) return shape.mode === 'reveal';
  }
  return false;
}

/**
 * The GM's verdict on one point, or null where they have not painted (stage
 * 18c): `reveal` — show it whatever the walls say, `hide` — keep it black
 * whatever the light says.
 *
 * The last shape containing the point wins, exactly as in the fog: the brush is
 * the same, so „paint over your mistake" has to mean the same thing. Null is a
 * real answer and the usual one — it means „the walls and the lamps decide",
 * which is what dynamic vision is for.
 */
export function fogOverrideAt(
  point: ScenePoint,
  overrides: readonly FogShapeView[],
): FogMode | null {
  for (let i = overrides.length - 1; i >= 0; i--) {
    const shape = overrides[i]!;
    if (fogShapeContains(shape, point)) return shape.mode;
  }
  return null;
}

/**
 * Is this token standing in the dark? Measured at its centre — the same point
 * the ruler and the range bands use, so „where a token is" means one thing
 * across the whole VTT. A 2×2 token straddling the fog edge therefore follows
 * its middle, which is both predictable and easy for the GM to reason about.
 */
export function isTokenInFog(
  token: Pick<TokenView, 'x' | 'y' | 'size'>,
  scene: Pick<SceneView, 'grid'>,
  fog: Pick<FogState, 'enabled' | 'shapes'>,
): boolean {
  const half = (token.size * scene.grid.sizePx) / 2;
  return !isPointRevealed({ x: token.x + half, y: token.y + half }, fog);
}

/**
 * A shape that uncovers a whole scene — what „reveal everything" stores. It is
 * a single row that also compacts the list: the server drops everything before
 * it, because nothing painted earlier can still show through.
 */
export function fullSceneReveal(scene: Pick<SceneView, 'width' | 'height'>): FogRect {
  return { kind: 'rect', mode: 'reveal', x: 0, y: 0, width: scene.width, height: scene.height };
}

/**
 * The opposite shape, and the one only an override set needs (stage 18c): fog
 * is covered to begin with, but „everyone goes blind" over dynamic vision has
 * to be written down.
 */
export function fullSceneHide(scene: Pick<SceneView, 'width' | 'height'>): FogRect {
  return { kind: 'rect', mode: 'hide', x: 0, y: 0, width: scene.width, height: scene.height };
}
