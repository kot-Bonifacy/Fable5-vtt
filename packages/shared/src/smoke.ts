/**
 * Smoke on the map (stage 16h) — core VTT, no game system.
 *
 * A cloud is defined by one sentence, and everything here follows from it:
 * **it makes things harder and it does not hide them.** The rulebook says only
 * that „działania w dymie mają zwykle −4" (s. 347) and says nothing at all about
 * sight, so the session ruled it that way on purpose (2026-08-07): a cloud that
 * blocked vision would be a moving wall, and moving walls belong to a stage that
 * has one. What the cloud carries instead is a penalty — a number the rules
 * layer splices into a roll's breakdown under its own name, exactly as „Trzymanie
 * −2" has been doing since 14d.
 *
 * Like a cover and unlike a wall, smoke **travels to every client**: a cloud in
 * the middle of the street is not a secret, and a player who cannot see the
 * square cannot decide whether to walk round it.
 *
 * The square is measured here rather than borrowed from the grenade's blast
 * (`systems/cpred/areas.ts`), which computes exactly the same shape: the core
 * does not import the game system, and „a square in scene pixels" is core
 * geometry that would still be true for a system with no grenades in it.
 */

import { metresPerPixel, type ScenePoint } from './measure.js';
import type { SceneView } from './scenes.js';

/** Scene fields a cloud needs: the grid it is measured on and its metre scale. */
export type SmokeScene = Pick<SceneView, 'grid' | 'metersPerSquare'>;

/** One stored cloud as it goes over the wire. */
export interface SmokeView {
  /** Autoincrement id. */
  id: number;
  sceneId: string;
  /** Label drawn on the map and printed in a roll's breakdown — „Dym". */
  name: string;
  /** Centre of the square in scene (world) pixels. */
  x: number;
  y: number;
  /** Side of the square in metres; the rulebook's cloud is 10 m across. */
  sideM: number;
  /** What every check made inside costs, as a negative number. */
  penalty: number;
}

/**
 * Server → client `smoke:sync` — the whole cloud list of one scene, for
 * everybody. A full list rather than deltas, for the reason the cover list is
 * one: a scene holds a handful, and a list that cannot desync is worth more
 * than the bytes an upsert would save.
 */
export interface SmokeSyncBroadcast {
  sceneId: string;
  smoke: SmokeView[];
}

/** The GM clears one cloud, or every cloud on a scene when `smokeId` is absent. */
export interface SmokeClearPayload {
  sceneId: string;
  smokeId?: number;
}

/** Largest cloud anybody may place — a sanity bound, not a rule. */
export const SMOKE_SIDE_M_MAX = 60;

/** Steepest penalty a cloud may carry; the printed one is −4. */
export const SMOKE_PENALTY_MIN = -10;

/**
 * Slack on the boundary, in scene pixels — the same reasoning the blast square
 * uses: token centres land exactly on the edge often enough that floating point
 * noise would otherwise decide a roll.
 */
const EDGE_EPSILON_PX = 0.001;

/** Side of a cloud in scene pixels, or 0 on a scene with an unusable grid. */
export function smokeSidePx(smoke: Pick<SmokeView, 'sideM'>, scene: SmokeScene): number {
  const perPixel = metresPerPixel(scene);
  return perPixel > 0 ? smoke.sideM / perPixel : 0;
}

/**
 * Is this point inside the cloud? Inclusive on the edge, for the reason above.
 */
export function isInSmoke(
  smoke: Pick<SmokeView, 'x' | 'y' | 'sideM'>,
  point: ScenePoint,
  scene: SmokeScene,
): boolean {
  const half = smokeSidePx(smoke, scene) / 2;
  if (half <= 0) return false;
  return (
    Math.abs(point.x - smoke.x) <= half + EDGE_EPSILON_PX &&
    Math.abs(point.y - smoke.y) <= half + EDGE_EPSILON_PX
  );
}

/**
 * The clouds a figure at this point is standing in.
 *
 * A list rather than the first hit: two grenades make two rows in the
 * breakdown, and folding them into one number here would hide from the player
 * that the second one landed. Whether they stack is the rules layer's call.
 */
export function smokeAt(
  clouds: readonly SmokeView[],
  point: ScenePoint,
  scene: SmokeScene,
): SmokeView[] {
  return clouds.filter((cloud) => isInSmoke(cloud, point, scene));
}
