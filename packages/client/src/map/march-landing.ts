import type { ScenePoint } from '@vtt/shared';

/**
 * Which way an interrupted march rounds to a square.
 *
 * `nearest` is the plain snap every stop used until 13.09.2026. `ahead` is for
 * the interruption that is about what the figure *sees*. A figure that leans
 * past a corner mid-step, spots somebody and is then rounded back to the square
 * it came from stands where nobody is visible again: the server takes the
 * newcomer away, the chat says „someone appeared", and every march from that
 * square is cut at the same spot (found on the stage 42c inspection).
 */
export type MarchLanding = 'nearest' | 'ahead';

/** How far short of half a square the `ahead` probe stops. */
const AHEAD_SLACK_PX = 0.5;

/**
 * The point an interrupted march is snapped from, in token top-left pixels.
 *
 * For `ahead`, the probe moves along the leg towards the next waypoint by just
 * under half a square and never past it, so the round-to-nearest snap that
 * follows picks the square the figure was stepping into rather than the one it
 * was leaving. A figure standing exactly on a square stays there — hence „just
 * under". Along the leg, not axis by axis: routes are smoothed, and pushing each
 * axis on its own off a leg that hugs the end of a wall lands on the far side of
 * that end, which the server refuses.
 *
 * The snap can still leave the leg by up to half a square, so the caller checks
 * the step to the result against the planner's edge test.
 */
export function marchStopPoint(
  position: ScenePoint,
  next: ScenePoint | undefined,
  cellPx: number,
  landing: MarchLanding,
): ScenePoint {
  if (landing === 'nearest' || !next || !(cellPx > 0)) return position;
  const dx = next.x - position.x;
  const dy = next.y - position.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return position;
  const step = Math.min(length, Math.max(0, cellPx / 2 - AHEAD_SLACK_PX));
  return { x: position.x + (dx / length) * step, y: position.y + (dy / length) * step };
}
