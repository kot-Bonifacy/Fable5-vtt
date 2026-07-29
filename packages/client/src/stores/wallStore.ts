import { create } from 'zustand';
import type { ScenePoint, StateSyncPayload, WallView } from '@vtt/shared';

/**
 * Walls, doors and the field of view of the viewed scene (stage 18a).
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
 * `doors` is the deliberate crack between the two: doors the GM flagged as the
 * players' to open, and only while they are in sight.
 */
interface WallStoreState {
  /** GM only; ascending by id. */
  walls: WallView[];
  /** Player's field of view, one polygon per vision source. */
  polygons: ScenePoint[][];
  /** Whether a `vision:sync` has ever arrived for the current scene. */
  hasVision: boolean;
  /** Doors this viewer may operate (GM: taken from `walls` instead). */
  doors: WallView[];

  applySync: (payload: StateSyncPayload) => void;
  setWalls: (sceneId: string, walls: WallView[]) => void;
  setVision: (polygons: ScenePoint[][]) => void;
  setDoors: (doors: WallView[]) => void;
}

export const useWallStore = create<WallStoreState>((set) => ({
  walls: [],
  polygons: [],
  hasVision: false,
  doors: [],

  applySync: (payload) =>
    set({
      walls: payload.walls,
      polygons: payload.vision?.polygons ?? [],
      hasVision: payload.vision !== null,
      doors: payload.doors,
    }),

  setWalls: (_sceneId, walls) => set({ walls }),
  setVision: (polygons) => set({ polygons, hasVision: true }),
  setDoors: (doors) => set({ doors }),
}));

// The chain being traced lives in the renderer, not here: it changes at pointer
// rate and never leaves the client, so putting it in a store would re-render
// the component tree for every mouse move and buy nothing.

/** The doors this viewer can click: every door for the GM, the flagged ones else. */
export function clickableDoors(state: WallStoreState, isGm: boolean): WallView[] {
  return isGm ? state.walls.filter((wall) => wall.kind === 'door') : state.doors;
}
