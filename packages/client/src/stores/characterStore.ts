import { create } from 'zustand';
import type {
  CharacterPatch,
  CharacterView,
  CpredCharacterData,
  CpredRegistry,
  StateSyncPayload,
} from '@vtt/shared';
import { EMPTY_CPRED_REGISTRY, buildCpredRegistry, mergeCharacterData } from '@vtt/shared';

export type CharacterSheetView = CharacterView<CpredCharacterData>;

export type SaveState = 'saving' | 'saved' | 'error';

interface CharacterStoreState {
  /** Characters this user may see, keyed by id (server-filtered). */
  characters: Record<string, CharacterSheetView>;
  /** Insertion order (createdAt asc from the server). */
  order: string[];
  /** Open sheet windows; the last entry renders on top. */
  openSheets: string[];
  /** Outstanding `character:update` acks per character (autosave in flight). */
  pendingSaves: Record<string, number>;
  saveStates: Record<string, SaveState>;
  /** CP RED data files, fetched once from /public/cpred/. */
  registry: CpredRegistry;

  applySync: (payload: StateSyncPayload) => void;
  applyUpsert: (character: CharacterView) => void;
  applyDelete: (characterId: string) => void;
  /** Optimistic merge of a local edit — the debounced save follows. */
  localPatch: (characterId: string, patch: CharacterPatch) => void;
  beginSave: (characterId: string) => void;
  endSave: (characterId: string, serverView: CharacterView | null, ok: boolean) => void;
  openSheet: (characterId: string) => void;
  closeSheet: (characterId: string) => void;
  focusSheet: (characterId: string) => void;
  setRegistry: (registry: CpredRegistry) => void;
}

function asSheetView(view: CharacterView): CharacterSheetView {
  return view as CharacterSheetView;
}

export const useCharacterStore = create<CharacterStoreState>((set, get) => ({
  characters: {},
  order: [],
  openSheets: [],
  pendingSaves: {},
  saveStates: {},
  registry: EMPTY_CPRED_REGISTRY,

  applySync: (payload) =>
    set((state) => {
      const characters: Record<string, CharacterSheetView> = {};
      const order: string[] = [];
      for (const character of payload.characters) {
        characters[character.id] = asSheetView(character);
        order.push(character.id);
      }
      // A character that vanished (deleted / reassigned) closes its window.
      const openSheets = state.openSheets.filter((id) => id in characters);
      return { characters, order, openSheets };
    }),

  applyUpsert: (character) =>
    set((state) => {
      // While our own edits are in flight, the incoming (possibly older)
      // snapshot must not clobber the optimistic state — the final ack
      // applies the authoritative view instead.
      if ((state.pendingSaves[character.id] ?? 0) > 0) return state;
      const known = character.id in state.characters;
      return {
        characters: { ...state.characters, [character.id]: asSheetView(character) },
        order: known ? state.order : [...state.order, character.id],
      };
    }),

  applyDelete: (characterId) =>
    set((state) => {
      if (!(characterId in state.characters)) return state;
      const characters = { ...state.characters };
      delete characters[characterId];
      return {
        characters,
        order: state.order.filter((id) => id !== characterId),
        openSheets: state.openSheets.filter((id) => id !== characterId),
      };
    }),

  localPatch: (characterId, patch) =>
    set((state) => {
      const current = state.characters[characterId];
      if (!current) return state;
      const next: CharacterSheetView = { ...current };
      if (patch.name !== undefined) next.name = patch.name;
      if (patch.portraitUrl !== undefined) next.portraitUrl = patch.portraitUrl;
      if (patch.ownerId !== undefined) next.ownerId = patch.ownerId;
      if (patch.data !== undefined) {
        next.data = mergeCharacterData(current.data, patch.data as Partial<CpredCharacterData>);
      }
      return { characters: { ...state.characters, [characterId]: next } };
    }),

  beginSave: (characterId) =>
    set((state) => ({
      pendingSaves: {
        ...state.pendingSaves,
        [characterId]: (state.pendingSaves[characterId] ?? 0) + 1,
      },
      saveStates: { ...state.saveStates, [characterId]: 'saving' },
    })),

  endSave: (characterId, serverView, ok) =>
    set((state) => {
      const pending = Math.max(0, (state.pendingSaves[characterId] ?? 1) - 1);
      const next: Partial<CharacterStoreState> = {
        pendingSaves: { ...state.pendingSaves, [characterId]: pending },
        saveStates: { ...state.saveStates, [characterId]: ok ? 'saved' : 'error' },
      };
      // Last in-flight save resolved — adopt the server's authoritative view.
      if (ok && pending === 0 && serverView && characterId in state.characters) {
        next.characters = {
          ...state.characters,
          [characterId]: asSheetView(serverView),
        };
      }
      return next;
    }),

  openSheet: (characterId) =>
    set((state) => {
      if (!(characterId in state.characters)) return state;
      const others = state.openSheets.filter((id) => id !== characterId);
      return { openSheets: [...others, characterId] };
    }),

  closeSheet: (characterId) =>
    set((state) => ({ openSheets: state.openSheets.filter((id) => id !== characterId) })),

  focusSheet: (characterId) => {
    const { openSheets } = get();
    if (openSheets.at(-1) === characterId) return;
    set((state) => ({
      openSheets: [...state.openSheets.filter((id) => id !== characterId), characterId],
    }));
  },

  setRegistry: (registry) => set({ registry }),
}));

let cpredDataRequested = false;

/** Fetches the CP RED data files once per session (static, committed data). */
export function ensureCpredDataLoaded(): void {
  if (cpredDataRequested) return;
  cpredDataRequested = true;
  Promise.all([
    fetch('/public/cpred/skills.json').then((res) =>
      res.ok ? res.json() : Promise.reject(new Error(String(res.status))),
    ),
    fetch('/public/cpred/roles.json').then((res) =>
      res.ok ? res.json() : Promise.reject(new Error(String(res.status))),
    ),
  ])
    .then(([skills, roles]) => {
      useCharacterStore.getState().setRegistry(buildCpredRegistry(skills, roles));
    })
    .catch(() => {
      // Missing data only leaves the sheet without skill/role rows.
      cpredDataRequested = false;
    });
}
