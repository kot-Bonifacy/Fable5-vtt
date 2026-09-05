import { create } from 'zustand';
import type {
  CharacterPatch,
  CharacterView,
  CpredCharacterData,
  CpredDataPayload,
  CpredRegistry,
  StateSyncPayload,
} from '@vtt/shared';
import {
  EMPTY_CPRED_REGISTRY,
  buildCpredRegistry,
  mergeCharacterData,
  withCreationData,
  withLifepathData,
} from '@vtt/shared';

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
  /**
   * Refusal code of the last failed save, per character.
   *
   * Kept beside `saveStates` rather than inside it, because „coś poszło nie
   * tak" is not a diagnosis: until 02.09 a refused patch showed a red „Błąd
   * zapisu!" and nothing else, so the GM could not tell a lost connection from
   * „Ta Rola już jest na karcie".
   */
  saveErrors: Record<string, string>;
  /**
   * What the server last said each sheet looks like.
   *
   * A shadow copy, because `characters` carries optimistic edits the server has
   * not seen yet — and when the server refuses one, there is nothing else to go
   * back to: a refusal ack carries no view (`{ ok: false, error }`), and the
   * broadcast that would have carried one is never sent, precisely because
   * nothing changed.
   */
  serverViews: Record<string, CharacterSheetView>;
  /** CP RED data files, fetched once from `/api/cpred/data`. */
  registry: CpredRegistry;

  applySync: (payload: StateSyncPayload) => void;
  applyUpsert: (character: CharacterView) => void;
  applyDelete: (characterId: string) => void;
  /** Optimistic merge of a local edit — the debounced save follows. */
  localPatch: (characterId: string, patch: CharacterPatch) => void;
  beginSave: (characterId: string) => void;
  endSave: (
    characterId: string,
    serverView: CharacterView | null,
    ok: boolean,
    errorCode?: string,
  ) => void;
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
  saveErrors: {},
  serverViews: {},
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
      return { characters, order, openSheets, serverViews: { ...characters } };
    }),

  applyUpsert: (character) =>
    set((state) => {
      const view = asSheetView(character);
      // The shadow copy is written either way: it is *the server's* word, and
      // the whole point of keeping it is to have somewhere to go back to when
      // an optimistic edit is refused.
      const serverViews = { ...state.serverViews, [character.id]: view };
      // While our own edits are in flight, the incoming (possibly older)
      // snapshot must not clobber the optimistic state — the final ack
      // applies the authoritative view instead.
      if ((state.pendingSaves[character.id] ?? 0) > 0) return { serverViews };
      const known = character.id in state.characters;
      return {
        characters: { ...state.characters, [character.id]: view },
        order: known ? state.order : [...state.order, character.id],
        serverViews,
      };
    }),

  applyDelete: (characterId) =>
    set((state) => {
      if (!(characterId in state.characters)) return state;
      const characters = { ...state.characters };
      delete characters[characterId];
      const serverViews = { ...state.serverViews };
      delete serverViews[characterId];
      return {
        characters,
        order: state.order.filter((id) => id !== characterId),
        openSheets: state.openSheets.filter((id) => id !== characterId),
        serverViews,
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

  endSave: (characterId, serverView, ok, errorCode) =>
    set((state) => {
      const pending = Math.max(0, (state.pendingSaves[characterId] ?? 1) - 1);
      const saveErrors = { ...state.saveErrors };
      if (ok) delete saveErrors[characterId];
      else saveErrors[characterId] = errorCode ?? 'SAVE_FAILED';
      const next: Partial<CharacterStoreState> = {
        pendingSaves: { ...state.pendingSaves, [characterId]: pending },
        saveStates: { ...state.saveStates, [characterId]: ok ? 'saved' : 'error' },
        saveErrors,
      };
      // Last in-flight save resolved — adopt the server's authoritative view.
      if (ok && pending === 0 && serverView && characterId in state.characters) {
        const view = asSheetView(serverView);
        next.characters = { ...state.characters, [characterId]: view };
        next.serverViews = { ...state.serverViews, [characterId]: view };
        return next;
      }
      /**
       * Refused, and nothing else of ours is on the way — put the sheet back to
       * what the server has.
       *
       * Without this the optimistic edit simply *stays* (02.09): the GM picks a
       * Role the character already had, the server answers `ROLE_TWICE` and
       * writes nothing, and the card goes on showing the new Role — title bar
       * included — until the page is reloaded. The condition mirrors the one
       * above for the same reason: a save still in flight will settle the truth
       * itself, and reverting under it would only flash an older sheet.
       */
      if (!ok && pending === 0) {
        const known = state.serverViews[characterId];
        if (known && characterId in state.characters) {
          next.characters = { ...state.characters, [characterId]: known };
        }
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

/**
 * Fetches the CP RED data files once per session.
 *
 * From stage 25a this goes through `/api/cpred/data` rather than the static
 * `/public/cpred/*.json`, and that is a fix, not a refactor: the static route
 * serves the **sample** files from the repo, while the server itself reads the
 * full list out of `data/private/`. The sheet therefore knew 42 skills and the
 * server 66 — twenty-four of them, `Cyberinżynieria` and `Podstawowe naprawy`
 * among them, could not be set on any sheet. One endpoint, one registry.
 */
export function ensureCpredDataLoaded(): void {
  if (cpredDataRequested) return;
  cpredDataRequested = true;
  fetch('/api/cpred/data')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((payload: CpredDataPayload) => {
      const registry = buildCpredRegistry({ skills: payload.skills }, { roles: payload.roles });
      useCharacterStore
        .getState()
        .setRegistry(
          withLifepathData(withCreationData(registry, payload.creation), payload.lifepath),
        );
    })
    .catch(() => {
      // Missing data only leaves the sheet without skill/role rows.
      cpredDataRequested = false;
    });
}
