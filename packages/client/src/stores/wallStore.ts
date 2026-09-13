import { create } from 'zustand';
import {
  isOpening,
  type ScenePoint,
  type Segment,
  type StateSyncPayload,
  type WallView,
} from '@vtt/shared';

/**
 * Walls, openings and the field of view of the viewed scene (stage 18a).
 *
 * Two very different things live here on purpose, because they are two halves
 * of one question — „what does this map let me see?" — answered differently
 * depending on who is asking:
 *
 *  - **`walls`** is GM data. A player's socket never receives a wall, so for a
 *    player this list is simply always empty and the wall layer draws nothing.
 *  - **`polygons`** is what a player gets *instead*: the finished field of view
 *    their own tokens describe, computed on the server. The client cuts it out
 *    of a black sheet and never learns what produced its shape.
 *
 * `openings` is the deliberate crack between the two: the doors *and windows*
 * the GM flagged as the players' to work, and only while they are in sight.
 */
interface WallStoreState {
  /** GM only; ascending by id. */
  walls: WallView[];
  /** Player's field of view, one polygon per vision source. */
  polygons: ScenePoint[][];
  /** Whether a `vision:sync` has ever arrived for the current scene. */
  hasVision: boolean;
  /** Openings this viewer may operate (GM: taken from `walls` instead). */
  openings: WallView[];
  /**
   * What a player's route planner walks round although they can see past it
   * (stage 42a) — barriers, shut gates, a closed window they stand at. Bare
   * segments, never walls; empty for the GM, whose planner reads `walls`.
   */
  blockers: Segment[];

  applySync: (payload: StateSyncPayload) => void;
  setWalls: (sceneId: string, walls: WallView[]) => void;
  setVision: (polygons: ScenePoint[][]) => void;
  setOpenings: (openings: WallView[]) => void;
  setBlockers: (blockers: Segment[]) => void;
}

export const useWallStore = create<WallStoreState>((set) => ({
  walls: [],
  polygons: [],
  hasVision: false,
  openings: [],
  blockers: [],

  applySync: (payload) =>
    set({
      walls: payload.walls,
      polygons: payload.vision?.polygons ?? [],
      hasVision: payload.vision !== null,
      openings: payload.openings,
      blockers: payload.blockers ?? [],
    }),

  setWalls: (_sceneId, walls) => set({ walls }),
  setVision: (polygons) => set({ polygons, hasVision: true }),
  setOpenings: (openings) => set({ openings }),
  setBlockers: (blockers) => set({ blockers }),
}));

// The chain being traced lives in the renderer, not here: it changes at pointer
// rate and never leaves the client, so putting it in a store would re-render
// the component tree for every mouse move and buy nothing.

/**
 * The openings this viewer can click: every door and window for the GM, the
 * flagged ones a player was actually sent.
 */
export function clickableOpenings(state: WallStoreState, isGm: boolean): WallView[] {
  return isGm ? state.walls.filter(isOpening) : state.openings;
}
