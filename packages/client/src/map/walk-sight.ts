import type { SceneVisibility } from '@vtt/shared';

/**
 * Which floor a player's route planner may step on (stages 16e, 18a; 13.09.2026).
 *
 * - `sight` — the field of view their own tokens describe. Dynamic vision only,
 *   and only once the first field of view has arrived.
 * - `revealed` — the revealed floor of a painted fog (GM decision of
 *   13.09.2026), plus the cells the figure stands on. The server refuses a step
 *   into the black on the drop as well.
 * - `open` — every point; what stands in the way arrives as bare segments
 *   (`blocker:sync`).
 *
 * The mode has to be asked, not the vision alone: since stage 42c a fogged or
 * open map receives a `vision:sync` too — polygons empty, carrying only the
 * figure mask — and „walk only where you can see" over an empty polygon list
 * refused every step on the map until the page was reloaded (regression found
 * 13.09.2026).
 */
export type WalkFloor = 'sight' | 'revealed' | 'open';

export function walkFloorFor(visibility: SceneVisibility, hasVision: boolean): WalkFloor {
  if (visibility === 'fog') return 'revealed';
  return visibility === 'dynamic' && hasVision ? 'sight' : 'open';
}
