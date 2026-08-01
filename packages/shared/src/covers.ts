/**
 * Cover as an object on the map (stage 16c) — core VTT, no game system.
 *
 * A cover is the car on the street, the concrete bollard, the crate somebody
 * ducks behind. It is defined by one sentence and everything here follows from
 * it: **it stops a bullet and it does not stop sight.** A cover that blocked
 * sight would simply be a wall, and a wall is what `walls.ts` is for.
 *
 * That single difference is also why a cover **travels to the client** while a
 * wall never does. The rule the project follows is „data a player cannot see
 * does not leave the server", and a wall qualifies — a floor plan is what the
 * party is meant to discover. A car parked in the street does not: everyone at
 * the table is looking straight at it, so hiding its row would only mean the
 * client could not draw it.
 *
 * The core keeps a cover's toughness as two plain numbers. *Where* those
 * numbers come from — the material × thickness table of Cyberpunk RED (s. 180)
 * — belongs to the system, and lives in `systems/cpred/covers.ts`. This module
 * never learns what „concrete" is.
 */

import type { ScenePoint } from './measure.js';
import type { Segment } from './vision.js';

/** One stored cover as it goes over the wire — to every viewer, not just the GM. */
export interface CoverView {
  /** Autoincrement id. */
  id: number;
  sceneId: string;
  /**
   * Catalogue preset this was placed from, kept opaque by the core: it is a
   * string the CP RED catalogue understands and this module only carries.
   */
  typeId: string;
  /** Label drawn on the map — „Samochód", „Betonowy słupek". */
  name: string;
  /** Top-left corner in scene (world) pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Body points. Zero means a wreck: the object is still on the map, still
   * drawn, and no longer stops anything (see `coverStanding`).
   */
  hpMax: number;
  hpCurrent: number;
}

/** Rectangles only, and axis-aligned (stage 16c: a rotated car is a POMYSLY entry). */
export const COVER_MIN_SIZE_PX = 8;
/** A cover larger than the scene is a mis-drag, not a barricade. */
export const COVER_MAX_SIZE_PX = 20000;
/** Guard against a client filling the table; a busy street runs to tens. */
export const COVER_MAX_PER_SCENE = 200;
/** Longest label the map is willing to draw. */
export const COVER_NAME_MAX = 40;
/** Hard ceiling on stored body points — the RAW table tops out at 50. */
export const COVER_HP_MAX = 999;

/** Client → server `cover:create`. Toughness is **not** here: the server reads it. */
export interface CoverCreatePayload {
  sceneId: string;
  /** Preset from the catalogue; decides the material, the label and the HP. */
  typeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Overrides the preset's label; blank keeps it. */
  name?: string;
}

/** Client → server `cover:update` — move, resize, rename or repair one cover. */
export interface CoverUpdatePayload {
  coverId: number;
  patch: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    name?: string;
    /** Current body points; the GM's way to dent or repair one by hand. */
    hpCurrent?: number;
  };
}

export interface CoverDeletePayload {
  coverId: number;
}

export interface CoverClearPayload {
  sceneId: string;
}

/**
 * Server → client `cover:sync` — the whole cover list of one scene, for
 * everybody. A full list rather than deltas, for the reason the wall list is
 * one: a scene holds tens of them and a list that cannot desync is worth more
 * than the bytes an upsert would save.
 */
export interface CoverSyncBroadcast {
  sceneId: string;
  covers: CoverView[];
}

/**
 * Is this cover still cover?
 *
 * „Jeśli PW osłony spadną do 0 … osłona zostaje zniszczona" (s. 179). A wrecked
 * car stays on the map — it is scenery, and the GM may still want it there —
 * but it stops a bullet no better than the air around it.
 */
export function coverStanding(cover: Pick<CoverView, 'hpCurrent'>): boolean {
  return cover.hpCurrent > 0;
}

/** The four edges of a cover, in scene pixels. */
export function coverSegments(cover: Pick<CoverView, 'x' | 'y' | 'width' | 'height'>): Segment[] {
  const { x, y, width, height } = cover;
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
export function isPointInCover(
  cover: Pick<CoverView, 'x' | 'y' | 'width' | 'height'>,
  point: ScenePoint,
): boolean {
  return (
    point.x >= cover.x &&
    point.x <= cover.x + cover.width &&
    point.y >= cover.y &&
    point.y <= cover.y + cover.height
  );
}

/** Shortest distance from a point to the rectangle, in scene pixels; 0 inside it. */
export function distanceToCover(
  point: ScenePoint,
  cover: Pick<CoverView, 'x' | 'y' | 'width' | 'height'>,
): number {
  const dx = Math.max(cover.x - point.x, 0, point.x - (cover.x + cover.width));
  const dy = Math.max(cover.y - point.y, 0, point.y - (cover.y + cover.height));
  return Math.hypot(dx, dy);
}

/**
 * The covers that stop a bullet fired from `origin` (stage 16c).
 *
 * The exemption is the whole point of the function: a cover you are **standing
 * at** does not stop your own shots. Without it every cover would be a trap —
 * you would duck behind the car and discover you can no longer fire over the
 * bonnet, which is the opposite of what taking cover is for.
 *
 * The threshold is arm's reach (`WALL_REACH_M` from stage 18d), measured to the
 * nearest point of the rectangle. It is deliberately the same number that
 * decides whether a hand can work a door: „stoi przy tym" should mean one thing
 * across the VTT, and a car is exactly as far away as the door you can open.
 *
 * A wrecked cover (0 PW) is not in the list at all.
 */
export function fireCoverSegments(
  covers: readonly CoverView[],
  origin: ScenePoint,
  reachPx: number,
): Segment[] {
  const segments: Segment[] = [];
  for (const cover of covers) {
    if (!coverStanding(cover)) continue;
    if (distanceToCover(origin, cover) <= reachPx) continue;
    segments.push(...coverSegments(cover));
  }
  return segments;
}

/**
 * What stops a **body** (stage 16c). Every standing cover, with no exemption:
 * you can shoot over the bonnet of the car you are leaning on, and you still
 * cannot walk through it.
 *
 * Used by the route planner of stage 16e, which is why it takes the plain list
 * — the planner works on segments and knows nothing about covers.
 */
export function coverMovementSegments(covers: readonly CoverView[]): Segment[] {
  const segments: Segment[] = [];
  for (const cover of covers) {
    if (!coverStanding(cover)) continue;
    segments.push(...coverSegments(cover));
  }
  return segments;
}

/**
 * Which cover stands between two points, if any — the nearest one to the
 * shooter.
 *
 * Returns the cover itself rather than a yes/no, because the refusal it
 * produces has to be able to say *what* is in the way and offer it as a target.
 * That is the difference between a wall and a cover once again: a wall's
 * refusal can only be „coś stoi na drodze", while a cover can name the car and
 * put a button under it.
 */
export function coverInLineOfFire(
  covers: readonly CoverView[],
  from: ScenePoint,
  to: ScenePoint,
  reachPx: number,
): CoverView | null {
  let nearest: CoverView | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const cover of covers) {
    if (!coverStanding(cover)) continue;
    if (distanceToCover(from, cover) <= reachPx) continue;
    if (!segmentCrossesCover(cover, from, to)) continue;
    const distance = distanceToCover(from, cover);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = cover;
    }
  }
  return nearest;
}

/**
 * Does the straight line from `from` to `to` pass through this rectangle?
 *
 * The endpoints count as inside: a target standing *in* the cover's footprint
 * (a gunner in the car, a body on the bonnet) is behind it as far as the rules
 * are concerned, and a shooter inside it is exempted a step earlier by reach.
 */
export function segmentCrossesCover(
  cover: Pick<CoverView, 'x' | 'y' | 'width' | 'height'>,
  from: ScenePoint,
  to: ScenePoint,
): boolean {
  if (isPointInCover(cover, from) || isPointInCover(cover, to)) return true;
  for (const edge of coverSegments(cover)) {
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
 * The cover a click lands on: the topmost (last placed) one containing the
 * point, else null. Later rows win because that is the order they are drawn in,
 * and a click should hit what the eye sees.
 */
export function pickCoverAt(covers: readonly CoverView[], point: ScenePoint): CoverView | null {
  for (let i = covers.length - 1; i >= 0; i--) {
    const cover = covers[i]!;
    if (isPointInCover(cover, point)) return cover;
  }
  return null;
}

/** A dragged rectangle normalised to a top-left corner and a positive size. */
export interface CoverRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Turns a drag into a stored rectangle, or null when it was a stray click.
 * Rounded to whole scene pixels — a cover is a thing in the world, and half a
 * pixel of a car is nothing anybody meant to draw.
 */
export function sanitizeCoverRect(raw: unknown): CoverRect | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const numbers = [value.x, value.y, value.width, value.height];
  if (!numbers.every((n): n is number => typeof n === 'number' && Number.isFinite(n))) return null;
  const width = Math.round(Math.abs(value.width as number));
  const height = Math.round(Math.abs(value.height as number));
  if (width < COVER_MIN_SIZE_PX || height < COVER_MIN_SIZE_PX) return null;
  if (width > COVER_MAX_SIZE_PX || height > COVER_MAX_SIZE_PX) return null;
  // A drag may run in any direction; the stored rectangle always starts at its
  // top-left corner so every later test can assume it.
  const x = Math.round(Math.min(value.x as number, (value.x as number) + (value.width as number)));
  const y = Math.round(Math.min(value.y as number, (value.y as number) + (value.height as number)));
  return { x, y, width, height };
}

/** Trims a GM-typed label; empty means „keep the preset's name". */
export function sanitizeCoverName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, COVER_NAME_MAX);
  return trimmed.length > 0 ? trimmed : null;
}

/** „Samochód · 18/25 PW" — the one-line description used on cards and tooltips. */
export function coverLabel(cover: CoverView): string {
  if (!coverStanding(cover)) return `${cover.name} (wrak)`;
  return `${cover.name} · ${cover.hpCurrent}/${cover.hpMax} PW`;
}
