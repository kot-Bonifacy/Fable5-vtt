import { create } from 'zustand';
import type { MapNoteView, StateSyncPayload } from '@vtt/shared';

/**
 * GM layer notes (stage 17). The list is always empty for a player, because
 * the server never sends one — this store simply holds whatever arrived.
 */
interface NoteStoreState {
  notes: Record<string, MapNoteView>;
  /** Note open in the editor; `null` = nothing being edited. */
  editingId: string | null;
  /** Pending pin: the map was clicked with the note tool, text not typed yet. */
  draft: { x: number; y: number } | null;

  applySync: (payload: StateSyncPayload) => void;
  upsert: (note: MapNoteView) => void;
  remove: (noteId: string) => void;
  setEditing: (noteId: string | null) => void;
  setDraft: (draft: { x: number; y: number } | null) => void;
}

export const useNoteStore = create<NoteStoreState>((set) => ({
  notes: {},
  editingId: null,
  draft: null,

  applySync: (payload) =>
    set(() => {
      const notes: Record<string, MapNoteView> = {};
      for (const note of payload.notes) notes[note.id] = note;
      return { notes, editingId: null, draft: null };
    }),

  upsert: (note) => set((state) => ({ notes: { ...state.notes, [note.id]: note } })),

  remove: (noteId) =>
    set((state) => {
      if (!(noteId in state.notes)) return state;
      const notes = { ...state.notes };
      delete notes[noteId];
      return { notes, editingId: state.editingId === noteId ? null : state.editingId };
    }),

  setEditing: (editingId) => set({ editingId, draft: null }),
  setDraft: (draft) => set({ draft, editingId: null }),
}));
