import { create } from 'zustand';
import type { DrawingView, StateSyncPayload } from '@vtt/shared';

/**
 * Drawings of the viewed scene (stage 17b).
 *
 * Like the fog store, this holds exactly what the server sent — a player's map
 * simply never contains a GM-layer drawing, because that row never left the
 * server. The shape under the cursor is *not* here: an unfinished gesture is
 * pure presentation, so it lives in the renderer and never touches React.
 */
interface DrawingStoreState {
  drawings: Record<number, DrawingView>;
  /** Text tool: where the caret was dropped; the editor fills in the words. */
  textDraft: { x: number; y: number } | null;

  applySync: (payload: StateSyncPayload) => void;
  upsert: (drawing: DrawingView) => void;
  remove: (drawingId: number) => void;
  /** Applies a `drawing:clear` sweep; `authorId` null means the whole scene. */
  clear: (sceneId: string, authorId: string | null) => void;
  setTextDraft: (draft: { x: number; y: number } | null) => void;
}

export const useDrawingStore = create<DrawingStoreState>((set) => ({
  drawings: {},
  textDraft: null,

  applySync: (payload) =>
    set(() => {
      const drawings: Record<number, DrawingView> = {};
      for (const drawing of payload.drawings) drawings[drawing.id] = drawing;
      return { drawings, textDraft: null };
    }),

  upsert: (drawing) => set((state) => ({ drawings: { ...state.drawings, [drawing.id]: drawing } })),

  remove: (drawingId) =>
    set((state) => {
      if (!(drawingId in state.drawings)) return state;
      const drawings = { ...state.drawings };
      delete drawings[drawingId];
      return { drawings };
    }),

  clear: (sceneId, authorId) =>
    set((state) => {
      const drawings: Record<number, DrawingView> = {};
      for (const drawing of Object.values(state.drawings)) {
        if (drawing.sceneId === sceneId && (authorId === null || drawing.authorId === authorId)) {
          continue;
        }
        drawings[drawing.id] = drawing;
      }
      return { drawings };
    }),

  setTextDraft: (textDraft) => set({ textDraft }),
}));

/** Paint order — the id is the order rows were written, so ascending is enough. */
export function sortedDrawings(drawings: Record<number, DrawingView>): DrawingView[] {
  return Object.values(drawings).sort((a, b) => a.id - b.id);
}
