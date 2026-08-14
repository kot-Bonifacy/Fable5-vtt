import { create } from 'zustand';
import type { CpredNetArchitecture, NetArchitectureSummary } from '@vtt/shared';

/**
 * Biblioteka Architektur Sieciowych u klienta (etap 26a).
 *
 * Serwer emituje wyłącznie do pokoju MG, więc ten store nigdy nie zapełnia się
 * u gracza — nie ma tu nic do filtrowania. Lista trzyma same podsumowania;
 * pełny szyb przychodzi dopiero przy otwarciu edytora (`net:get`), bo to on
 * niesie PT, Czarne LOD-y i notatki MG.
 */
interface NetState {
  architectures: NetArchitectureSummary[];
  loaded: boolean;
  /** Architektura otwarta w edytorze; `new` = nowa, null = edytor zamknięty. */
  editing: string | 'new' | null;
  /** Roboczy szyb w edytorze — zapisuje się dopiero na „Zapisz". */
  draft: CpredNetArchitecture | null;
  /** Ostatni ślad losowania, do pokazania nad szybem. */
  rollSummary: string | null;

  replaceAll: (architectures: NetArchitectureSummary[]) => void;
  remove: (id: string) => void;
  open: (id: string | 'new', draft: CpredNetArchitecture | null, rollSummary?: string) => void;
  close: () => void;
  setDraft: (draft: CpredNetArchitecture) => void;
}

export const useNetStore = create<NetState>((set) => ({
  architectures: [],
  loaded: false,
  editing: null,
  draft: null,
  rollSummary: null,

  replaceAll: (architectures) => set({ architectures, loaded: true }),

  remove: (id) =>
    set((state) => ({
      architectures: state.architectures.filter((entry) => entry.id !== id),
      ...(state.editing === id ? { editing: null, draft: null } : {}),
    })),

  open: (id, draft, rollSummary) => set({ editing: id, draft, rollSummary: rollSummary ?? null }),

  close: () => set({ editing: null, draft: null, rollSummary: null }),

  setDraft: (draft) => set({ draft }),
}));
