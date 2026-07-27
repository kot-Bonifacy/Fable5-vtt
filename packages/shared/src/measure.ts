/**
 * Measuring distance on the map (stage 16) — core VTT, no game system.
 *
 * Everything here works in two coordinate spaces:
 *  - scene pixels, which is what tokens and the ruler store, and
 *  - metres, which is what the rules and the players talk in.
 *
 * The conversion is one number per scene (`metersPerSquare` over the grid's
 * `sizePx`), so a map drawn at any resolution measures correctly as long as
 * the GM set the grid up. A gridless scene has no square to scale by; the
 * scene still carries `metersPerSquare` and `grid.sizePx`, and we use them,
 * because the GM sizes the grid to the map even when the overlay is hidden.
 *
 * Diagonals are plain Euclidean distance. Cyberpunk RED never prints a
 * diagonal rule (unlike D&D's 5-10-5) — it just says a square is 2 m — so the
 * straight line between two points is both the simplest and the most faithful
 * reading.
 */

import type { SceneView } from './scenes.js';
import type { TokenView } from './tokens.js';

/** A point in scene (world) pixels. */
export interface ScenePoint {
  x: number;
  y: number;
}

/** Maximum waypoints of one ruler line — a guard against runaway payloads. */
export const RULER_MAX_POINTS = 24;

/** How long a shared ruler stays on other people's screens after the last update. */
export const RULER_IDLE_TIMEOUT_MS = 15_000;

/** Metres per scene pixel. Falls back to the CP RED default (2 m per square). */
export function metresPerPixel(scene: Pick<SceneView, 'grid' | 'metersPerSquare'>): number {
  const sizePx = scene.grid.sizePx;
  if (!Number.isFinite(sizePx) || sizePx <= 0) return 0;
  const metres = Number.isFinite(scene.metersPerSquare) ? scene.metersPerSquare : 2;
  return metres / sizePx;
}

/**
 * Centre of a token in scene pixels. Token positions are the top-left corner
 * and `size` is the edge in squares, so a 2×2 token measures from its middle,
 * not from its corner — which is what „środek—środek" means at the table.
 */
export function tokenCentre(
  token: Pick<TokenView, 'x' | 'y' | 'size'>,
  scene: Pick<SceneView, 'grid'>,
): ScenePoint {
  const half = (token.size * scene.grid.sizePx) / 2;
  return { x: token.x + half, y: token.y + half };
}

/** Straight-line distance between two scene points, in pixels. */
export function pixelDistance(from: ScenePoint, to: ScenePoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

/** Total length of a polyline in pixels (a multi-leg ruler measurement). */
export function polylinePixelLength(points: readonly ScenePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += pixelDistance(points[i - 1]!, points[i]!);
  return total;
}

/**
 * Distance in metres, rounded to one decimal — enough precision to tell 6.4 m
 * from 6.6 m without pretending the map is a surveying instrument.
 */
export function metresBetween(
  from: ScenePoint,
  to: ScenePoint,
  scene: Pick<SceneView, 'grid' | 'metersPerSquare'>,
): number {
  return Math.round(pixelDistance(from, to) * metresPerPixel(scene) * 10) / 10;
}

/** Same, along a polyline. */
export function polylineMetres(
  points: readonly ScenePoint[],
  scene: Pick<SceneView, 'grid' | 'metersPerSquare'>,
): number {
  return Math.round(polylinePixelLength(points) * metresPerPixel(scene) * 10) / 10;
}

/** Distance between two tokens, centre to centre, in metres. */
export function metresBetweenTokens(
  from: Pick<TokenView, 'x' | 'y' | 'size'>,
  to: Pick<TokenView, 'x' | 'y' | 'size'>,
  scene: Pick<SceneView, 'grid' | 'metersPerSquare'>,
): number {
  return metresBetween(tokenCentre(from, scene), tokenCentre(to, scene), scene);
}

/**
 * The whole metre a rules lookup uses. Range bands are written in whole metres
 * („7 – 12 m"), so a measured 6.5 m has to land in one of them; rounding half
 * up puts the ambiguous case in the harder band, which is the reading a GM
 * would give at the table.
 */
export function metresForRules(metres: number): number {
  return Math.max(0, Math.round(metres));
}

/** „24 m" / „6,5 m" — the label on the ruler and on chat cards. */
export function formatMetres(metres: number): string {
  const rounded = Math.round(metres * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
  // Non-breaking space: the label sits on the map and must never wrap between
  // the number and its unit.
  return `${text}\u00A0m`;
}

/** Distance expressed in squares, for the ruler's second reading. */
export function squaresForDistance(
  metres: number,
  scene: Pick<SceneView, 'metersPerSquare'>,
): number {
  const perSquare = Number.isFinite(scene.metersPerSquare) ? scene.metersPerSquare : 2;
  if (perSquare <= 0) return 0;
  return Math.round((metres / perSquare) * 10) / 10;
}

/** „21,7 pola" — the squares reading, with the same Polish comma as metres. */
export function formatSquares(squares: number): string {
  const rounded = Math.round(squares * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
  return `${text} pola`;
}

/** Client → server payload of `ruler:update` — the line being dragged. */
export interface RulerUpdatePayload {
  sceneId: string;
  points: ScenePoint[];
  /** GM only: keep the measurement off everyone else's screen. */
  private?: boolean;
}

/** Client → server payload of `ruler:clear`. */
export interface RulerClearPayload {
  sceneId: string;
}

/**
 * Server → client `ruler:update`. Ephemeral like intermediate token drags: it
 * carries no seq, is never stored and never replays on a resync.
 */
export interface RulerBroadcast {
  sceneId: string;
  userId: string;
  userName: string;
  points: ScenePoint[];
}

/** Server → client `ruler:clear` — the measurer let go. */
export interface RulerClearBroadcast {
  sceneId: string;
  userId: string;
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

/**
 * Validates a ruler polyline coming off the wire: 2…`RULER_MAX_POINTS` finite
 * points, rounded to whole pixels. Returns null when the payload is unusable.
 */
export function sanitizeRulerPoints(raw: unknown): ScenePoint[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > RULER_MAX_POINTS) return null;
  const points: ScenePoint[] = [];
  for (const value of raw) {
    if (!isFinitePoint(value)) return null;
    points.push({ x: Math.round(value.x), y: Math.round(value.y) });
  }
  return points;
}
