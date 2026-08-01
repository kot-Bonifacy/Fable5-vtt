import { create } from 'zustand';
import type { CoverView, ScenePoint, StateSyncPayload } from '@vtt/shared';
import { coverStanding, pickCoverAt } from '@vtt/shared';

/**
 * Cover standing on the viewed scene (stage 16c).
 *
 * The odd one out among the map's object stores, and worth saying why: this
 * one is populated for **players** as well. A wall list is a floor plan the
 * party has not walked yet, so `wallStore.walls` is empty for anybody but the
 * GM; a car parked in the street is something everyone is looking at, so it
 * arrives whole — with its body points, which is how a player decides whether
 * the bonnet will hold for another round.
 *
 * The catalogue (material × thickness → PW) is *not* here. It is static data
 * fetched once from `/public/cpred/covers.json` and only the GM's tool palette
 * needs it, so it lives next to the tool settings in `mapToolStore`.
 */
interface CoverStoreState {
  /** Ascending by id — which is the paint order, and the click order. */
  covers: CoverView[];

  applySync: (payload: StateSyncPayload) => void;
  setCovers: (sceneId: string, covers: CoverView[]) => void;
}

export const useCoverStore = create<CoverStoreState>((set) => ({
  covers: [],

  applySync: (payload) => set({ covers: payload.covers }),
  setCovers: (_sceneId, covers) => set({ covers }),
}));

/** Cover under a point, topmost first; null when the click was on open ground. */
export function coverAt(point: ScenePoint): CoverView | null {
  return pickCoverAt(useCoverStore.getState().covers, point);
}

/** Cover that still stops a bullet — a wreck is scenery, not cover. */
export function standingCovers(covers: readonly CoverView[]): CoverView[] {
  return covers.filter(coverStanding);
}
