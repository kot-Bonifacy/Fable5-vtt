import { create } from 'zustand';
import type { KnowledgeEntryView, KnowledgeIndexStatus } from '@vtt/shared';
import { emptyKnowledgeIndexStatus } from '@vtt/shared';

/**
 * Baza wiedzy kampanii u klienta (etap 19b).
 *
 * Wpisy dostaje wyłącznie MG (serwer emituje do `gmRoom`), więc store nigdy nie
 * istnieje po stronie gracza — nie ma tu żadnej filtracji do zrobienia.
 */
interface KnowledgeState {
  entries: Record<string, KnowledgeEntryView>;
  /** Kolejność wyświetlania, po tytule; przeliczana przy każdej zmianie. */
  order: string[];
  index: KnowledgeIndexStatus;
  /** Wpis otwarty w formularzu; `new` = nowy, null = formularz zamknięty. */
  editing: string | 'new' | null;
  loaded: boolean;

  replaceAll: (entries: KnowledgeEntryView[], index: KnowledgeIndexStatus) => void;
  upsert: (entry: KnowledgeEntryView, index?: KnowledgeIndexStatus) => void;
  remove: (id: string, index?: KnowledgeIndexStatus) => void;
  setIndex: (index: KnowledgeIndexStatus) => void;
  setEditing: (editing: string | 'new' | null) => void;
}

const collator = new Intl.Collator('pl');

function sortIds(entries: Record<string, KnowledgeEntryView>): string[] {
  return Object.values(entries)
    .sort((a, b) => collator.compare(a.title, b.title))
    .map((entry) => entry.id);
}

export const useKnowledgeStore = create<KnowledgeState>((set) => ({
  entries: {},
  order: [],
  index: emptyKnowledgeIndexStatus(),
  editing: null,
  loaded: false,

  replaceAll: (entries, index) => {
    const byId: Record<string, KnowledgeEntryView> = {};
    for (const entry of entries) byId[entry.id] = entry;
    set({ entries: byId, order: sortIds(byId), index, loaded: true });
  },

  upsert: (entry, index) =>
    set((state) => {
      const entries = { ...state.entries, [entry.id]: entry };
      return { entries, order: sortIds(entries), ...(index ? { index } : {}) };
    }),

  remove: (id, index) =>
    set((state) => {
      const entries = { ...state.entries };
      delete entries[id];
      return {
        entries,
        order: sortIds(entries),
        ...(index ? { index } : {}),
        editing: state.editing === id ? null : state.editing,
      };
    }),

  setIndex: (index) => set({ index }),
  setEditing: (editing) => set({ editing }),
}));
