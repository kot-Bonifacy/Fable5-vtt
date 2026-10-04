import { create } from 'zustand';
import type { AiAccessView, OwnerAiRequest, OwnerAiState } from '@vtt/shared';
import { apiGet } from '../api.js';

/**
 * AI właściciela (etap 44d) po stronie klienta.
 *
 * - `state` — panel właściciela (prośby, „Udostępniam AI”, kto trzyma AI);
 *   tylko na kontach z flagą, odświeżany pushem `ai-access:owner`.
 * - `mine` — prośba zwykłego MG o dostęp (Panel MG), push `ai-access:mine`.
 */
interface OwnerAiStore {
  state: OwnerAiState | null;
  mine: AiAccessView | null;
  /** Pływające okno „AI właściciela” (znaczek w górnym pasku). */
  open: boolean;
  setOpen: (open: boolean) => void;
  setState: (state: OwnerAiState) => void;
  setMine: (mine: AiAccessView) => void;
  /** Pierwszy odczyt z REST — po wejściu i po otwarciu okna. */
  load: () => Promise<void>;
  loadMine: () => Promise<void>;
  reset: () => void;
}

export const useOwnerAiStore = create<OwnerAiStore>((set) => ({
  state: null,
  mine: null,
  open: false,
  setOpen: (open) => set({ open }),
  setState: (state) => set({ state }),
  setMine: (mine) => set({ mine }),
  load: async () => {
    try {
      set({ state: await apiGet<OwnerAiState>('/api/owner/ai') });
    } catch {
      // Konto bez flagi albo serwer chwilowo niedostępny — panel zostaje pusty.
    }
  },
  loadMine: async () => {
    try {
      set({ mine: await apiGet<AiAccessView>('/api/ai-access') });
    } catch {
      // jak wyżej
    }
  },
  reset: () => set({ state: null, mine: null, open: false }),
}));

/** Prośby, które przyszły od ostatniego stanu — do powiadomienia na czacie. */
export function freshAiRequests(
  before: OwnerAiState | null,
  after: OwnerAiState,
): OwnerAiRequest[] {
  const waiting = new Set(
    (before?.requests ?? [])
      .filter((request) => request.status === 'requested')
      .map((request) => `${request.userId}:${request.requestedAt}`),
  );
  return after.requests.filter(
    (request) =>
      request.status === 'requested' && !waiting.has(`${request.userId}:${request.requestedAt}`),
  );
}
