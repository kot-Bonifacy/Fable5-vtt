import { create } from 'zustand';
import type { FogShapeView, FogState, StateSyncPayload } from '@vtt/shared';

/**
 * The fog mask of the viewed scene (stage 17).
 *
 * The client holds exactly what the server sent: an ordered shape list plus
 * the scene's fog switch. It never invents a shape of its own — a stroke the
 * GM is drawing right now lives in `pending` until the server acknowledges it,
 * so the mask on screen is always either confirmed state or a clearly
 * temporary preview.
 */
interface FogStoreState {
  fog: FogState | null;
  /** The stroke or rectangle under the cursor, not yet sent. */
  pending: FogShapeView | null;

  applySync: (payload: StateSyncPayload) => void;
  setFog: (fog: FogState | null) => void;
  append: (sceneId: string, shape: FogShapeView, override: boolean) => void;
  setPending: (pending: FogShapeView | null) => void;
}

export const useFogStore = create<FogStoreState>((set) => ({
  fog: null,
  pending: null,

  applySync: (payload) => set({ fog: payload.fog, pending: null }),
  setFog: (fog) => set({ fog, pending: null }),

  append: (sceneId, shape, override) =>
    set((state) => {
      // A broadcast for a scene we are not looking at (the GM previewing
      // another map) must not land in this mask.
      if (!state.fog || state.fog.sceneId !== sceneId) return state;
      // The same brush fills two lists (stage 18c) and the server says which.
      const list = override ? state.fog.overrides : state.fog.shapes;
      if (list.some((existing) => existing.id === shape.id)) return state;
      const fog = override
        ? { ...state.fog, overrides: [...state.fog.overrides, shape] }
        : { ...state.fog, shapes: [...state.fog.shapes, shape] };
      return { fog, pending: null };
    }),

  setPending: (pending) => set({ pending }),
}));
