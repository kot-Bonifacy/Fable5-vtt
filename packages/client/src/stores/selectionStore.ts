import { create } from 'zustand';
import { useSceneStore } from './sceneStore.js';

/**
 * What this viewer has under attention — core VTT, no game system.
 *
 * Its own tiny store rather than a field of `tokenStore`, for the same reason
 * `explorationStore` is separate from `wallStore`: the token list is *the map*,
 * shared by everyone and arriving from the server, while this is one viewer's
 * private pointer state that never travels. Nobody else at the table needs to
 * know which figure I have clicked on.
 *
 * Two pointers, not one, and the difference is the whole point:
 *
 * - **`tokenId` — the steered figure.** Only ever a token this user may
 *   actually move, because it exists to answer „who walks when I click the
 *   floor?" and nothing else. What the dashed ring on the map means is
 *   therefore exactly „this one obeys me".
 * - **`focusTokenId` — the figure the left rail is describing.** It outlives
 *   the selection: a player who has put their weapon away, or who has not
 *   clicked anything since logging in, still wants their own portrait, points
 *   and turn budget on screen rather than „Nikt nie wybrany". Showing is not
 *   steering, so a token in the rail does *not* start walking on a stray click
 *   on the floor — the rail only fills in what a click would otherwise have to.
 *
 * The rail's pointer is remembered per scene in `localStorage`, so a reload
 * comes back to the figure that was last clicked rather than to a default.
 */

const FOCUS_KEY = 'vtt.hudFocus';
/** Enough scenes for a campaign's worth of maps; the oldest fall off the end. */
const FOCUS_LIMIT = 20;

type FocusMemory = Record<string, string>;

function readFocusMemory(): FocusMemory {
  try {
    const raw = window.localStorage.getItem(FOCUS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const memory: FocusMemory = {};
    for (const [sceneId, tokenId] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof tokenId === 'string') memory[sceneId] = tokenId;
    }
    return memory;
  } catch {
    // Private mode, or somebody's hand-edited entry. Losing the memory only
    // costs one click.
    return {};
  }
}

function currentSceneId(): string | null {
  return useSceneStore.getState().effectiveScene?.id ?? null;
}

/** Files the rail's pointer under the scene it belongs to. */
function rememberFocus(tokenId: string): void {
  const sceneId = currentSceneId();
  if (!sceneId) return;
  const memory = readFocusMemory();
  if (memory[sceneId] === tokenId) return;
  // Re-inserting moves the scene to the end of the insertion order, so the
  // trim below drops the map nobody has looked at in the longest.
  delete memory[sceneId];
  const kept = Object.entries(memory).slice(-(FOCUS_LIMIT - 1));
  try {
    window.localStorage.setItem(
      FOCUS_KEY,
      JSON.stringify({ ...Object.fromEntries(kept), [sceneId]: tokenId }),
    );
  } catch {
    // See above.
  }
}

/**
 * The figure the rail was last showing on this scene, or null.
 *
 * Deliberately unvalidated: this store does not know the token list, so the
 * caller checks whether the remembered figure is still on the map (`hud.ts`
 * does, and falls back to a default when it is not).
 */
export function recalledFocusTokenId(): string | null {
  const sceneId = currentSceneId();
  return sceneId ? (readFocusMemory()[sceneId] ?? null) : null;
}

interface SelectionStoreState {
  tokenId: string | null;
  focusTokenId: string | null;
  /**
   * Zaznaczenie wielu figur (etap 35) — trzeci wskaźnik obok dwóch wyżej.
   *
   * **Prywatny jak tamte i nigdy nie jedzie po sieci**: „ramka" to wskaźnik
   * jednej przeglądarki, a nie stan stołu. Nikt nie musi wiedzieć, że MG
   * obwiódł akurat tych czterech gangerów.
   *
   * Trzyma **wyłącznie figury, którymi ten widz może sterować** — i to nie jest
   * wygoda, tylko cała odpowiedź na „gracz z ramką na całą mapę". Filtruje
   * `MapRenderer`, bo to on ma `movableTokens`; u MG przechodzi wszystko, bo MG
   * sterować może wszystkim.
   *
   * Pusta lista znaczy „nie ma zaznaczenia grupowego". Jedna figura w środku
   * też jest grupą — pasek operacji pokazuje się dopiero od dwóch, ale reguły
   * (wykluczanie ze scenerią, `Esc`, ruch grupowy) nie mają powodu robić z
   * jedynki przypadku szczególnego.
   */
  groupIds: string[];
  /**
   * Was the rail emptied on purpose? Only then may it stay empty while a
   * default is available — „never mind" has to actually mean something.
   */
  dismissed: boolean;

  /** A figure was picked (click, `Tab`); null merely drops the steering. */
  select: (tokenId: string | null) => void;
  /**
   * Pokaż tę figurę w pasku, ale jej nie bierz (31.08).
   *
   * Klik w cudzą figurę nie robił dotąd nic: sterować nią nie wolno, więc
   * `MapRenderer` cicho wychodził. Pasek jednak od 27h **opisuje** figurę,
   * zanim ktokolwiek nią pokieruje (`HudContext.steering`), a od 31.08 opisuje
   * też jej rany — a Medyk gracza ma mieć co załatać na figurze, która nie jest
   * jego. Stąd trzecia droga: ognisko paska bez sterowania.
   */
  focus: (tokenId: string) => void;
  /**
   * Zaznacza podaną listę figur (ramka, `Ctrl+A`). Steruje **pierwszą z nich** —
   * kliknięcie w podłogę ma dalej znaczyć „idź tam", a nie przestać cokolwiek
   * znaczyć tylko dlatego, że zaznaczonych jest sześć.
   */
  setGroup: (tokenIds: string[]) => void;
  /** `Shift`+klik: dokłada figurę do zaznaczenia albo ją z niego odejmuje. */
  toggleInGroup: (tokenId: string) => void;
  /** Zdejmuje samo zaznaczenie grupowe; sterowana figura zostaje. */
  clearGroup: () => void;
  /** „Never mind": nothing is steered and the rail goes quiet until a pick. */
  dismiss: () => void;
  /** New scene: forget both pointers and re-read what was remembered here. */
  resetFocus: () => void;
}

export const useSelectionStore = create<SelectionStoreState>((set) => ({
  tokenId: null,
  focusTokenId: null,
  groupIds: [],
  dismissed: false,

  select: (tokenId) => {
    if (tokenId === null) {
      // Steering stops, the rail does not: this is the path a finished march,
      // a vanished token or a scene wipe comes through, and none of them is
      // the user saying „show me nothing".
      set({ tokenId: null });
      return;
    }
    rememberFocus(tokenId);
    // Pojedynczy wybór **zastępuje** grupę: bez tego „kliknąłem obok"
    // zostawiałoby pod spodem sześć figur, które następna operacja grupowa
    // nadal by ruszyła. Zerowanie siedzi tutaj, a nie na wejściu do `select`,
    // bo `select(null)` leci przy każdym zakończonym marszu — a marsz jednej
    // figury z zaznaczonej szóstki nie jest powodem, żeby zapomnieć pozostałe.
    set({ tokenId, focusTokenId: tokenId, groupIds: [], dismissed: false });
  },

  focus: (tokenId) => {
    rememberFocus(tokenId);
    // `tokenId` zostaje nietknięte: figura, którą ktoś prowadzi, ma nią zostać,
    // choćby pasek pokazywał teraz kogoś innego.
    set({ focusTokenId: tokenId, dismissed: false });
  },

  setGroup: (tokenIds) => {
    const groupIds = [...new Set(tokenIds)];
    const anchor = groupIds[0] ?? null;
    if (anchor) rememberFocus(anchor);
    set({
      groupIds,
      tokenId: anchor,
      focusTokenId: anchor ?? recalledFocusTokenId(),
      dismissed: false,
    });
  },

  toggleInGroup: (tokenId) =>
    set((state) => {
      // Pierwsze `Shift`+kliknięcie na czystym stole robi z pojedynczego wyboru
      // grupę dwuelementową, zamiast wyrzucać figurę, którą widz właśnie wziął.
      const base =
        state.groupIds.length > 0 ? state.groupIds : state.tokenId ? [state.tokenId] : [];
      const groupIds = base.includes(tokenId)
        ? base.filter((id) => id !== tokenId)
        : [...base, tokenId];
      const anchor = groupIds.includes(state.tokenId ?? '') ? state.tokenId : (groupIds[0] ?? null);
      return { groupIds, tokenId: anchor, focusTokenId: anchor ?? state.focusTokenId };
    }),

  clearGroup: () => set({ groupIds: [] }),

  dismiss: () => set({ tokenId: null, focusTokenId: null, groupIds: [], dismissed: true }),

  resetFocus: () =>
    set({
      tokenId: null,
      focusTokenId: recalledFocusTokenId(),
      groupIds: [],
      dismissed: false,
    }),
}));
