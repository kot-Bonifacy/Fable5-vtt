import type { SceneVisibility } from '@vtt/shared';

/**
 * Does a player's field of view confine where their route planner may step
 * (stages 16e, 18a)?
 *
 * Only under dynamic vision, and only once the first field of view has arrived;
 * every other mode leaves the floor open and hands the obstacles over as bare
 * segments (`blocker:sync`). The mode has to be asked, not the vision alone:
 * since stage 42c a fogged or open map receives a `vision:sync` too — polygons
 * empty, carrying only the figure mask — and „walk only where you can see" over
 * an empty polygon list refused every step on the map until the page was
 * reloaded (regression found 13.09.2026).
 */
export function confinesWalkToSight(visibility: SceneVisibility, hasVision: boolean): boolean {
  return visibility === 'dynamic' && hasVision;
}
