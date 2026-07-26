import { create } from 'zustand';
import type {
  CompendiumCategory,
  CompendiumEntry,
  StateSyncPayload,
  WeaponTypeDefinition,
} from '@vtt/shared';
import { searchCompendium } from '@vtt/shared';

/**
 * The item catalogue (stage 13). Unlike characters or bots this is shared,
 * unfiltered data — everyone at the table sees the same entries — so the store
 * only mirrors what the server sent and holds the browse/search UI state.
 */

/** Stable empty array: a new [] per render would loop zustand selectors. */
const NO_ENTRIES: CompendiumEntry[] = [];

interface CompendiumStoreState {
  entries: Record<string, CompendiumEntry>;
  order: string[];
  weaponTypes: WeaponTypeDefinition[];
  weaponTypeById: Record<string, WeaponTypeDefinition>;

  /** Browse state of the side panel. */
  category: CompendiumCategory;
  query: string;
  /** Entry whose card is open; null shows the list. */
  selectedId: string | null;
  /** Entry being edited by the GM; 'new' opens an empty editor. */
  editing: string | null;

  applySync: (payload: StateSyncPayload) => void;
  applyUpsert: (entry: CompendiumEntry) => void;
  applyDelete: (id: string) => void;
  setCategory: (category: CompendiumCategory) => void;
  setQuery: (query: string) => void;
  select: (id: string | null) => void;
  edit: (id: string | null) => void;
}

function indexEntries(entries: CompendiumEntry[]): Pick<CompendiumStoreState, 'entries' | 'order'> {
  const byId: Record<string, CompendiumEntry> = {};
  const order: string[] = [];
  for (const entry of entries) {
    byId[entry.id] = entry;
    order.push(entry.id);
  }
  return { entries: byId, order };
}

export const useCompendiumStore = create<CompendiumStoreState>((set) => ({
  entries: {},
  order: [],
  weaponTypes: [],
  weaponTypeById: {},
  category: 'weapon',
  query: '',
  selectedId: null,
  editing: null,

  applySync: (payload) =>
    set((state) => {
      const { weaponTypes, entries } = payload.compendium;
      const indexed = indexEntries(entries);
      return {
        ...indexed,
        weaponTypes,
        weaponTypeById: Object.fromEntries(weaponTypes.map((type) => [type.id, type])),
        // A selected entry that vanished falls back to the list.
        selectedId: state.selectedId && state.selectedId in indexed.entries ? state.selectedId : null,
      };
    }),

  applyUpsert: (entry) =>
    set((state) => ({
      entries: { ...state.entries, [entry.id]: entry },
      order: entry.id in state.entries ? state.order : [...state.order, entry.id],
    })),

  applyDelete: (id) =>
    set((state) => {
      const entries = { ...state.entries };
      delete entries[id];
      return {
        entries,
        order: state.order.filter((entryId) => entryId !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
        editing: state.editing === id ? null : state.editing,
      };
    }),

  setCategory: (category) => set({ category, selectedId: null }),
  setQuery: (query) => set({ query }),
  select: (selectedId) => set({ selectedId }),
  edit: (editing) => set({ editing }),
}));

/** Entries of the active category matching the search box, in server order. */
export function visibleEntries(state: CompendiumStoreState): CompendiumEntry[] {
  const all = state.order.map((id) => state.entries[id]).filter((e): e is CompendiumEntry => !!e);
  if (all.length === 0) return NO_ENTRIES;
  return searchCompendium(all, state.query, state.category);
}

export function entryCount(state: CompendiumStoreState, category: CompendiumCategory): number {
  let count = 0;
  for (const id of state.order) if (state.entries[id]?.category === category) count += 1;
  return count;
}
