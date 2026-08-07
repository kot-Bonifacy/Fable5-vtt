import { create } from 'zustand';
import type { SmokeView, StateSyncPayload } from '@vtt/shared';

/**
 * Smoke hanging on the viewed scene (stage 16h).
 *
 * Populated for players as well as the GM, for the reason the covers are: a bank
 * of smoke in the street is something everybody is looking at. A client that did
 * not have it could draw neither the square nor the reason a roll came back four
 * points short.
 *
 * No catalogue and no picking helper — unlike a cover, nobody clicks a cloud.
 * It is placed by a round going off and cleared by the GM's eraser.
 */
interface SmokeStoreState {
  /** Ascending by id, which is also the order they were laid down in. */
  smoke: SmokeView[];

  applySync: (payload: StateSyncPayload) => void;
  setSmoke: (sceneId: string, smoke: SmokeView[]) => void;
}

export const useSmokeStore = create<SmokeStoreState>((set) => ({
  smoke: [],

  applySync: (payload) => set({ smoke: payload.smoke }),
  setSmoke: (_sceneId, smoke) => set({ smoke }),
}));
