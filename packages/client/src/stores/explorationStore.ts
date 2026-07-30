import { create } from 'zustand';
import type { ExplorationMask, StateSyncPayload } from '@vtt/shared';

/**
 * What the party has already seen on the viewed scene (stage 18c).
 *
 * Its own store rather than a field of `wallStore`, because it is the one piece
 * of visibility data that is *not* this viewer's own: the polygons say what my
 * tokens see right now, the mask here says where the group has been. It arrives
 * as one broadcast for everybody and is safe to hold whole — it only ever
 * describes ground somebody walked.
 *
 * Null means „this scene does not remember", which is a different thing from an
 * empty mask (a scene that remembers, where nobody has been yet).
 */
interface ExplorationStoreState {
  mask: ExplorationMask | null;

  applySync: (payload: StateSyncPayload) => void;
  setExploration: (mask: ExplorationMask | null) => void;
}

export const useExplorationStore = create<ExplorationStoreState>((set) => ({
  mask: null,

  applySync: (payload) => set({ mask: payload.exploration }),
  setExploration: (mask) => set({ mask }),
}));
