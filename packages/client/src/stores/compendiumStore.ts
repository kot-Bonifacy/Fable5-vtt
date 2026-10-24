import { create } from 'zustand';
import type {
  CatalogShopping,
  CompendiumCategory,
  CompendiumEntry,
  CpredShopRoleTools,
  ShopTier,
  ShopTierContext,
  StateSyncPayload,
  WeaponTypeDefinition,
} from '@vtt/shared';
import {
  COMPENDIUM_CATEGORIES,
  COMPENDIUM_CATEGORY_LABELS,
  CPRED_PHARMACEUTICALS,
  SHOP_TIER_MIN,
  cpredIsChemEntry,
  searchCompendium,
} from '@vtt/shared';

/**
 * The item catalogue (stage 13). Unlike characters or bots this is shared,
 * unfiltered data — everyone at the table sees the same entries — so the store
 * only mirrors what the server sent and holds the browse/search UI state.
 */

/** Stable empty array: a new [] per render would loop zustand selectors. */
const NO_ENTRIES: CompendiumEntry[] = [];

/**
 * A tab of the panel. Mostly a category, plus „Używki i leki” (24.10): drugs,
 * alcohol and toxin vials are `gear` entries in the data, the pharmaceuticals
 * are not entries at all (the Medic crafts them), and the GM wanted all of it
 * on one shelf instead of lost among „Sprzęt”.
 */
export type CompendiumShelf = CompendiumCategory | 'chems';

export const COMPENDIUM_SHELVES: readonly CompendiumShelf[] = COMPENDIUM_CATEGORIES.flatMap(
  (category): CompendiumShelf[] => (category === 'gear' ? ['gear', 'chems'] : [category]),
);

export const COMPENDIUM_SHELF_LABELS: Record<CompendiumShelf, string> = {
  ...COMPENDIUM_CATEGORY_LABELS,
  chems: 'Używki i leki',
};

export function shelfOf(entry: CompendiumEntry): CompendiumShelf {
  return entry.category === 'gear' && cpredIsChemEntry(entry) ? 'chems' : entry.category;
}

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
  /**
   * The GM's per-entry availability choices for this campaign (naprawa 3b) —
   * pass them to `shopTierOf` everywhere a tier is shown, or the list and the
   * server will disagree about what is locked.
   */
  shopTierOverrides: Record<string, ShopTier>;
  /**
   * „Zakupy z katalogu” (etap 46a): `merchants` chowa graczowi „Kup” — kupuje
   * się wtedy u handlarzy. Serwer i tak odmawia (`CATALOG_CLOSED`).
   */
  catalogShopping: CatalogShopping;
  /** What each Role may buy above street level in the creator (naprawa 3b). */
  roleTools: Record<string, CpredShopRoleTools>;

  /** Browse state of the side panel. */
  category: CompendiumShelf;
  query: string;
  /** Entry whose card is open; null shows the list. */
  selectedId: string | null;
  /** Entry being edited by the GM; 'new' opens an empty editor. */
  editing: string | null;

  applySync: (payload: StateSyncPayload) => void;
  applyShopTier: (tier: ShopTier) => void;
  applyCatalogShopping: (mode: CatalogShopping) => void;
  applyShopEntryTier: (entryId: string, tier: ShopTier | null) => void;
  applyUpsert: (entry: CompendiumEntry) => void;
  applyDelete: (id: string) => void;
  setCategory: (category: CompendiumShelf) => void;
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
  shopTierOverrides: {},
  catalogShopping: 'everywhere',
  roleTools: {},
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
        shopTierOverrides: payload.shopTierOverrides ?? {},
        catalogShopping: payload.catalogShopping ?? 'everywhere',
        roleTools: payload.compendium.roleTools ?? {},
        // A selected entry that vanished falls back to the list.
        selectedId:
          state.selectedId && state.selectedId in indexed.entries ? state.selectedId : null,
      };
    }),

  applyShopTier: (shopTier) => set({ shopTier }),
  applyCatalogShopping: (catalogShopping) => set({ catalogShopping }),

  applyShopEntryTier: (entryId, tier) =>
    set((state) => {
      const shopTierOverrides = { ...state.shopTierOverrides };
      if (tier === null) delete shopTierOverrides[entryId];
      else shopTierOverrides[entryId] = tier;
      return { shopTierOverrides };
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

/**
 * Derived views. These are plain functions, NOT zustand selectors: they build
 * new arrays and objects, and a selector that returns a fresh reference on
 * every render sends React into an update loop ("The result of getSnapshot
 * should be cached"). Components read the raw `entries`/`order` slices — those
 * keep their identity between renders — and call these inside `useMemo`.
 */

/**
 * What `shopTierVerdict` needs from this store: the GM's choices and weapon type
 * names for the reason line. Build it inside `useMemo` — a fresh object per
 * render is fine there and a selector returning one would loop React.
 */
export function shopTierContextOf(
  overrides: Record<string, ShopTier>,
  weaponTypeById: Record<string, WeaponTypeDefinition>,
): ShopTierContext {
  return { overrides, weaponTypeName: (id) => weaponTypeById[id]?.name };
}

/** Entries of the active shelf matching the search box, in server order. */
export function visibleEntries(
  entries: Record<string, CompendiumEntry>,
  order: string[],
  query: string,
  shelf: CompendiumShelf,
): CompendiumEntry[] {
  const all = order
    .map((id) => entries[id])
    .filter((e): e is CompendiumEntry => !!e && shelfOf(e) === shelf);
  if (all.length === 0) return NO_ENTRIES;
  return searchCompendium(all, query);
}

/**
 * How many entries each shelf holds, for the badges on the tabs. „Używki
 * i leki” also counts the pharmaceuticals listed under its entries.
 */
export function countByCategory(
  entries: Record<string, CompendiumEntry>,
  order: string[],
): Record<CompendiumShelf, number> {
  const counts = Object.fromEntries(COMPENDIUM_SHELVES.map((shelf) => [shelf, 0])) as Record<
    CompendiumShelf,
    number
  >;
  counts.chems = CPRED_PHARMACEUTICALS.length;
  for (const id of order) {
    const entry = entries[id];
    if (entry) counts[shelfOf(entry)] += 1;
  }
  return counts;
}
