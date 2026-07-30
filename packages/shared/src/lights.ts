/**
 * Light and darkness (stage 18b) — core VTT, no game system involved.
 *
 * Stage 18a answered „what can this token see?" with a visibility polygon. This
 * module answers the second half of the question a dark scene asks: „and is any
 * of it lit?". The geometry is deliberately the *same* geometry — a light is a
 * vision source standing somewhere else, blocked by the same walls — so nothing
 * here casts its own rays; it reuses `isSegmentClear` from `vision.ts`.
 *
 * The one thing this module does have to invent is how the answer travels.
 *
 * A light's illuminated region is clipped by walls, so its polygon *is* a
 * partial floor plan: sending a player the lit polygon of a room behind a wall
 * would hand over exactly what stage 18a refused to send. The rule „hidden data
 * does not leave the server" does not accept „the client draws it black" as an
 * answer. So the wire carries two much duller things instead:
 *
 *  - **`LightMask`** — a coarse grid of light levels (dark / dim / bright), cut
 *    down to the bounding box of that viewer's own field of view and forced dark
 *    outside it. One byte per cell before run-length encoding, half a grid
 *    square per cell, and nothing in it describes a wall the viewer cannot see.
 *    Scaled up with linear filtering it also looks like light should: soft.
 *  - **`LightGlow`** — position, radius and colour of the lamps a viewer can
 *    actually see, for the coloured layer over the map. A lamp in line of sight
 *    is a lamp they are looking at; its brightness is not a secret.
 */

import { metresPerPixel, type ScenePoint } from './measure.js';
import type { SceneView } from './scenes.js';
import { isPointVisible, isSegmentClear, segmentWithinRadius, type Segment } from './vision.js';

/** Nothing reaches this point. */
export const LIGHT_DARK = 0;
/** Lit, but only enough to make out shapes. */
export const LIGHT_DIM = 1;
/** Fully lit. */
export const LIGHT_BRIGHT = 2;
export type LightLevel = typeof LIGHT_DARK | typeof LIGHT_DIM | typeof LIGHT_BRIGHT;

export const LIGHT_RADIUS_MAX_METRES = 200;
export const LIGHT_MAX_PER_SCENE = 400;
/** A warm bulb — the colour a GM placing a lamp almost always wants. */
export const LIGHT_DEFAULT_COLOR = '#ffd9a0';
/**
 * The lamp palette offered in the toolbar. Cyberpunk-leaning on purpose: a warm
 * bulb, cold fluorescent, and four neon tubes, which between them cover most of
 * what lights a Night City interior. Any hex still validates — this is a set of
 * one-click choices, not a restriction.
 */
export const LIGHT_COLORS = [
  '#ffd9a0',
  '#e8f4ff',
  '#ff4d9d',
  '#22d3ee',
  '#a3e635',
  '#c084fc',
] as const;
export const LIGHT_DEFAULT_BRIGHT_M = 4;
export const LIGHT_DEFAULT_DIM_M = 10;
/** A hand torch, the default a token's light is offered with. */
export const TOKEN_LIGHT_DEFAULT_BRIGHT_M = 6;
export const TOKEN_LIGHT_DEFAULT_DIM_M = 14;

/**
 * How far a token sees in a dark scene with no light at all, in metres.
 *
 * Two metres is one grid square: you always make out your own square and the
 * one you are about to step into. It exists for a usability reason rather than a
 * rules one — a fully black screen reads as „the app broke", not as „it is dark
 * in here", and the GM who forgot to hand out torches gets a complaint instead
 * of tension. Proper darkvision is a character trait and waits for stage 23.
 */
export const SCENE_DARK_SIGHT_DEFAULT_M = 2;
export const SCENE_DARK_SIGHT_MAX_M = 30;

/** One stored light on the map — GM data, like a wall. */
export interface LightView {
  /** Autoincrement id. */
  id: number;
  sceneId: string;
  /** Centre in scene (world) pixels. */
  x: number;
  y: number;
  /** Full-brightness radius in metres. */
  brightM: number;
  /** Outer radius in metres; never below `brightM`. */
  dimM: number;
  color: string;
  /** Renderer-side alpha wobble — a candle or a failing neon. */
  flicker: boolean;
  /** Switched off lights stay on the map, dark, ready to be switched back. */
  enabled: boolean;
}

/**
 * A light carried by a token — a torch, a lamp, a flare.
 *
 * `on` is the only field a *player* may write, and only on a token they
 * control: sneaking down a corridor in the dark is the player's decision, and
 * having to ask the GM to put the torch out on the chat turns a tactical choice
 * into paperwork.
 */
export interface TokenLight {
  brightM: number;
  dimM: number;
  color: string;
  flicker: boolean;
  on: boolean;
}

/** Client → server payload of `light:create` (GM only). */
export interface LightCreatePayload {
  sceneId: string;
  x: number;
  y: number;
  brightM?: number;
  dimM?: number;
  color?: string;
  flicker?: boolean;
}

/** Mutable light fields; a patch carries any subset. */
export interface LightPatch {
  x?: number;
  y?: number;
  brightM?: number;
  dimM?: number;
  color?: string;
  flicker?: boolean;
  enabled?: boolean;
}

export interface LightUpdatePayload {
  lightId: number;
  patch: LightPatch;
}

export interface LightDeletePayload {
  lightId: number;
}

/**
 * Client → server payload of `token:light` — the switch on a carried light.
 *
 * Its own event rather than a field of `TokenPatch`, because `token:update` is
 * GM-only by design and this is the one light operation a player performs.
 * Omitting `on` flips it, which is what clicking the button means.
 */
export interface TokenLightTogglePayload {
  tokenId: string;
  on?: boolean;
}

/**
 * Server → client `light:sync` — every light of one scene, GM only.
 *
 * A full list rather than deltas, for the reason walls send one: lights change
 * while the GM is dressing a scene, there are tens of them, and a list that
 * cannot desync is worth more than the bytes.
 */
export interface LightSyncBroadcast {
  sceneId: string;
  lights: LightView[];
}

/** A light as the renderer needs it: scene pixels, no metres left. */
export interface LightSource {
  origin: ScenePoint;
  brightPx: number;
  dimPx: number;
  color: string;
  flicker: boolean;
}

/**
 * One lamp a viewer can see, for the coloured layer over the map. Carries no
 * geometry beyond its own circle — the walls that shape its light are not in
 * here, and the darkness cover above the layer trims whatever spills.
 */
export interface LightGlow {
  x: number;
  y: number;
  brightPx: number;
  dimPx: number;
  color: string;
  flicker: boolean;
}

/**
 * Light levels of the area one viewer can see, as a coarse grid.
 *
 * Anchored to whole cells so the same world position always lands in the same
 * cell no matter which viewer asked, and clipped to the viewer's own field of
 * view: every cell outside it is `LIGHT_DARK`, whatever is really there.
 */
export interface LightMask {
  /** Top-left corner of the covered area, in scene pixels. */
  x: number;
  y: number;
  /** Cell edge in scene pixels. */
  cell: number;
  cols: number;
  rows: number;
  /**
   * Flat run-length pairs — `[level, count, level, count, …]` in row-major
   * order. A mask is mostly uniform (a lit room, a dark corridor), so this is
   * both smaller than a byte array and cheaper than base64 on either end.
   */
  runs: number[];
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Rounds a radius to one decimal inside [0, max]; null when unusable. */
function sanitizeRadius(raw: unknown): number | null {
  if (!isFiniteNumber(raw)) return null;
  return Math.round(clamp(raw, 0, LIGHT_RADIUS_MAX_METRES) * 10) / 10;
}

function sanitizeColor(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && HEX_COLOR_RE.test(raw) ? raw.toLowerCase() : fallback;
}

/**
 * Normalizes a raw (untrusted) light patch. Returns null when the patch is not
 * an object or a provided field is unusable — an unknown field is dropped.
 *
 * The two radii are *not* ordered here: a patch may legitimately carry only one
 * of them, and the caller knows the stored value of the other. `orderLightRadii`
 * does the ordering once the pair is complete.
 */
export function sanitizeLightPatch(raw: unknown): LightPatch | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const patch: LightPatch = {};

  if ('x' in input) {
    if (!isFiniteNumber(input.x)) return null;
    patch.x = Math.round(input.x);
  }
  if ('y' in input) {
    if (!isFiniteNumber(input.y)) return null;
    patch.y = Math.round(input.y);
  }
  if ('brightM' in input) {
    const bright = sanitizeRadius(input.brightM);
    if (bright === null) return null;
    patch.brightM = bright;
  }
  if ('dimM' in input) {
    const dim = sanitizeRadius(input.dimM);
    if (dim === null) return null;
    patch.dimM = dim;
  }
  if ('color' in input) {
    if (typeof input.color !== 'string' || !HEX_COLOR_RE.test(input.color)) return null;
    patch.color = input.color.toLowerCase();
  }
  if ('flicker' in input) {
    if (typeof input.flicker !== 'boolean') return null;
    patch.flicker = input.flicker;
  }
  if ('enabled' in input) {
    if (typeof input.enabled !== 'boolean') return null;
    patch.enabled = input.enabled;
  }
  return patch;
}

/**
 * The dim radius is the outer one, so a pair that came in the other way round
 * is widened rather than rejected: a GM typing „bright 10, dim 4" means a light
 * that reaches 10 m, and refusing the edit would only be pedantic.
 */
export function orderLightRadii(brightM: number, dimM: number): { brightM: number; dimM: number } {
  return { brightM, dimM: Math.max(brightM, dimM) };
}

/**
 * Validates a token's light. Like the HP pair, `null` is a real value (the token
 * carries nothing) and `undefined` signals a rejection.
 */
export function sanitizeTokenLight(raw: unknown): TokenLight | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'object') return undefined;
  const input = raw as Record<string, unknown>;
  const bright = sanitizeRadius(input.brightM ?? 0);
  const dim = sanitizeRadius(input.dimM ?? 0);
  if (bright === null || dim === null) return undefined;
  const ordered = orderLightRadii(bright, dim);
  // A light that reaches nowhere is no light: folding it into null keeps „does
  // this token carry a lamp?" a single question instead of two.
  if (ordered.dimM <= 0) return null;
  return {
    ...ordered,
    color: sanitizeColor(input.color, LIGHT_DEFAULT_COLOR),
    flicker: input.flicker === true,
    on: input.on !== false,
  };
}

/** Minimum sight in darkness, in metres; 0 means „nothing without a light". */
export function sanitizeDarkSight(raw: unknown): number | null {
  if (!isFiniteNumber(raw)) return null;
  return Math.round(clamp(raw, 0, SCENE_DARK_SIGHT_MAX_M) * 10) / 10;
}

/** A radius in metres as scene pixels; 0 when the scene has no usable scale. */
export function metresToPixels(
  metres: number,
  scene: Pick<SceneView, 'grid' | 'metersPerSquare'>,
): number {
  const perPixel = metresPerPixel(scene);
  if (perPixel <= 0) return 0;
  return metres / perPixel;
}

/** Builds the renderer-space source of a light standing at `origin`. */
export function toLightSource(
  origin: ScenePoint,
  spec: { brightM: number; dimM: number; color: string; flicker: boolean },
  scene: Pick<SceneView, 'grid' | 'metersPerSquare'>,
): LightSource {
  const ordered = orderLightRadii(spec.brightM, spec.dimM);
  return {
    origin,
    brightPx: metresToPixels(ordered.brightM, scene),
    dimPx: metresToPixels(ordered.dimM, scene),
    color: spec.color,
    flicker: spec.flicker,
  };
}

/** How far a source reaches at all. */
export function lightReachPx(source: LightSource): number {
  return Math.max(source.brightPx, source.dimPx);
}

/**
 * The brightest level reaching this point, walls taken into account.
 *
 * Line of sight from the light rather than a point-in-polygon test on a
 * pre-computed light polygon: the polygon would need hundreds of vertices to
 * answer the same question, and this is the query the server runs per token per
 * viewer — „is that NPC standing in the dark?" — so it has to be cheap.
 */
export function lightLevelAt(
  point: ScenePoint,
  sources: readonly LightSource[],
  segments: readonly Segment[],
): LightLevel {
  let best: LightLevel = LIGHT_DARK;
  for (const source of sources) {
    if (best === LIGHT_BRIGHT) break;
    const reach = lightReachPx(source);
    if (reach <= 0) continue;
    const distance = Math.hypot(point.x - source.origin.x, point.y - source.origin.y);
    if (distance > reach) continue;
    const level: LightLevel = distance <= source.brightPx ? LIGHT_BRIGHT : LIGHT_DIM;
    if (level <= best) continue;
    if (!isSegmentClear(source.origin, point, segments)) continue;
    best = level;
  }
  return best;
}

/** Is anything at all reaching this point? */
export function isPointLit(
  point: ScenePoint,
  sources: readonly LightSource[],
  segments: readonly Segment[],
): boolean {
  return lightLevelAt(point, sources, segments) !== LIGHT_DARK;
}

/** Bounding box of a set of polygons in scene pixels; null when there is none. */
export function polygonsBounds(
  polygons: readonly (readonly ScenePoint[])[],
): { x: number; y: number; width: number; height: number } | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const polygon of polygons) {
    for (const point of polygon) {
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

/**
 * Cell edge of the light mask, in scene pixels: half a grid square, which is one
 * metre on a CP RED map. Fine enough that a torch edge reads as a circle,
 * coarse enough that a whole field of view is a few hundred cells.
 */
export function lightMaskCellPx(scene: Pick<SceneView, 'gridMode' | 'grid'>): number {
  const size = scene.grid.sizePx;
  if (scene.gridMode === 'grid' && Number.isFinite(size) && size > 0) {
    return Math.max(8, Math.round(size / 2));
  }
  return 50;
}

/** Run-length encodes a level array into flat `[level, count, …]` pairs. */
export function encodeLevelRuns(levels: Uint8Array): number[] {
  const runs: number[] = [];
  if (levels.length === 0) return runs;
  let current = levels[0]!;
  let count = 1;
  for (let i = 1; i < levels.length; i++) {
    const level = levels[i]!;
    if (level === current) {
      count++;
      continue;
    }
    runs.push(current, count);
    current = level;
    count = 1;
  }
  runs.push(current, count);
  return runs;
}

/**
 * Expands run-length pairs back into `count` levels. A short or malformed run
 * list leaves the rest dark rather than throwing — the mask is a rendering hint
 * and a broken one must not take the map down with it.
 */
export function decodeLevelRuns(runs: readonly number[], count: number): Uint8Array {
  const levels = new Uint8Array(Math.max(0, count));
  let index = 0;
  for (let i = 0; i + 1 < runs.length; i += 2) {
    const level = runs[i]!;
    const length = runs[i + 1]!;
    if (!Number.isFinite(level) || !Number.isFinite(length) || length <= 0) continue;
    const end = Math.min(levels.length, index + length);
    for (; index < end; index++) levels[index] = level;
    if (index >= levels.length) break;
  }
  return levels;
}

export interface LightMaskInput {
  /** Area to cover — normally the bounding box of the viewer's own polygons. */
  bounds: { x: number; y: number; width: number; height: number };
  cellPx: number;
  sources: readonly LightSource[];
  /** Everything that blocks light: walls, closed doors, the scene border. */
  segments: readonly Segment[];
  /**
   * The viewer's field of view. Cells outside it are forced dark, which is what
   * keeps the mask from describing a lit room behind a wall — the leak this
   * whole representation exists to avoid.
   */
  polygons: readonly (readonly ScenePoint[])[];
}

/**
 * Builds the light mask of one viewer.
 *
 * Cell centres are the sample points, and the loops are ordered light-first so
 * the expensive part — a line-of-sight test per cell — only runs for cells a
 * light could actually reach. A source that lights nothing inside `bounds`
 * costs two comparisons.
 */
export function buildLightMask(input: LightMaskInput): LightMask {
  const cell = Math.max(1, Math.round(input.cellPx));
  // Anchored to whole cells: the same world point then always falls in the same
  // cell, whoever is looking, so two viewers never disagree by half a metre.
  const originX = Math.floor(input.bounds.x / cell) * cell;
  const originY = Math.floor(input.bounds.y / cell) * cell;
  const cols = Math.max(1, Math.ceil((input.bounds.x + input.bounds.width - originX) / cell) + 1);
  const rows = Math.max(1, Math.ceil((input.bounds.y + input.bounds.height - originY) / cell) + 1);
  const levels = new Uint8Array(cols * rows);

  for (const source of input.sources) {
    const reach = lightReachPx(source);
    if (reach <= 0) continue;
    // Only walls near the light can shadow it; on a full floor plan this is the
    // difference between eight segment tests per cell and two hundred.
    const near = input.segments.filter((segment) =>
      segmentWithinRadius(source.origin, segment, reach),
    );
    const colFrom = Math.max(0, Math.floor((source.origin.x - reach - originX) / cell));
    const colTo = Math.min(cols - 1, Math.ceil((source.origin.x + reach - originX) / cell));
    const rowFrom = Math.max(0, Math.floor((source.origin.y - reach - originY) / cell));
    const rowTo = Math.min(rows - 1, Math.ceil((source.origin.y + reach - originY) / cell));

    for (let row = rowFrom; row <= rowTo; row++) {
      const py = originY + row * cell + cell / 2;
      for (let col = colFrom; col <= colTo; col++) {
        const index = row * cols + col;
        if (levels[index] === LIGHT_BRIGHT) continue;
        const px = originX + col * cell + cell / 2;
        const distance = Math.hypot(px - source.origin.x, py - source.origin.y);
        if (distance > reach) continue;
        const level = distance <= source.brightPx ? LIGHT_BRIGHT : LIGHT_DIM;
        if (level <= levels[index]!) continue;
        if (!isSegmentClear(source.origin, { x: px, y: py }, near)) continue;
        levels[index] = level;
      }
    }
  }

  // Clip to what the viewer sees. Only cells that came out lit need the test,
  // which is why it runs here and not inside the loop above.
  for (let row = 0; row < rows; row++) {
    const py = originY + row * cell + cell / 2;
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      if (levels[index] === LIGHT_DARK) continue;
      if (!isPointVisible({ x: originX + col * cell + cell / 2, y: py }, input.polygons)) {
        levels[index] = LIGHT_DARK;
      }
    }
  }

  return { x: originX, y: originY, cell, cols, rows, runs: encodeLevelRuns(levels) };
}
