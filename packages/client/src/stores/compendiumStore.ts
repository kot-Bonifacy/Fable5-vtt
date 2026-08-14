import { create } from 'zustand';
import type {
  CompendiumCategory,
  CompendiumEntry,
  ShopTier,
  StateSyncPayload,
  WeaponTypeDefinition,
} from '@vtt/shared';
import { SHOP_TIER_MIN, searchCompendium } from '@vtt/shared';

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
  /**
   * Highest availability tier this campaign has unlocked (stage 25c). Entries
   * above it stay **visible and greyed out** rather than hidden: a player is
   * meant to see what is worth working towards.
   */
  shopTier: ShopTier;

  /** Browse state of the side panel. */
  category: CompendiumCategory;
  query: string;
  /** Entry whose card is open; null shows the list. */
  selectedId: string | null;
  /** Entry being edited by the GM; 'new' opens an empty editor. */
  editing: string | null;

  applySync: (payload: StateSyncPayload) => void;
  applyShopTier: (tier: ShopTier) => void;
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
  shopTier: SHOP_TIER_MIN,
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
        shopTier: payload.shopTier ?? SHOP_TIER_MIN,
        // A selected entry that vanished falls back to the list.
        selectedId:
          state.selectedId && state.selectedId in indexed.entries ? state.selectedId : null,
      };
    }),

  applyShopTier: (shopTier) => set({ shopTier }),

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

/**
 * Derived views. These are plain functions, NOT zustand selectors: they build
 * new arrays and objects, and a selector that returns a fresh reference on
 * every render sends React into an update loop ("The result of getSnapshot
 * should be cached"). Components read the raw `entries`/`order` slices — those
 * keep their identity between renders — and call these inside `useMemo`.
 */

/** Entries of the active category matching the search box, in server order. */
export function visibleEntries(
  entries: Record<string, CompendiumEntry>,
  order: string[],
  query: string,
  category: CompendiumCategory,
): CompendiumEntry[] {
  const all = order.map((id) => entries[id]).filter((e): e is CompendiumEntry => !!e);
  if (all.length === 0) return NO_ENTRIES;
  return searchCompendium(all, query, category);
}

/** How many entries each category holds, for the badges on the category chips. */
export function countByCategory(
  entries: Record<string, CompendiumEntry>,
  order: string[],
): Record<CompendiumCategory, number> {
  const counts: Record<CompendiumCategory, number> = {
    weapon: 0,
    ammo: 0,
    armor: 0,
    gear: 0,
    cyberware: 0,
    criticalInjury: 0,
  };
  for (const id of order) {
    const entry = entries[id];
    if (entry) counts[entry.category] += 1;
  }
  return counts;
}
