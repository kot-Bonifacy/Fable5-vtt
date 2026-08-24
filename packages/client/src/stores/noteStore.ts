import { create } from 'zustand';
import type { MapNoteView, StateSyncPayload } from '@vtt/shared';

/**
 * GM layer notes (stage 17). The list is always empty for a player, because
 * the server never sends one — this store simply holds whatever arrived.
 *
 * Które pinezki są otwarte, a która dopiero powstaje, **nie jest** tutaj od
 * 27l: to jest stan karty, wspólny dla siedmiu rodzajów obiektów sceny, więc
 * mieszka w `sceneCardStore`. Ten store trzyma same dane.
 */
interface NoteStoreState {
  notes: Record<string, MapNoteView>;

  applySync: (payload: StateSyncPayload) => void;
  upsert: (note: MapNoteView) => void;
  remove: (noteId: string) => void;
}

export const useNoteStore = create<NoteStoreState>((set) => ({
  notes: {},

  applySync: (payload) =>
    set(() => {
      const notes: Record<string, MapNoteView> = {};
      for (const note of payload.notes) notes[note.id] = note;
      return { notes };
    }),

  upsert: (note) => set((state) => ({ notes: { ...state.notes, [note.id]: note } })),

  remove: (noteId) =>
    set((state) => {
      if (!(noteId in state.notes)) return state;
      const notes = { ...state.notes };
      delete notes[noteId];
      return { notes };
    }),
}));
