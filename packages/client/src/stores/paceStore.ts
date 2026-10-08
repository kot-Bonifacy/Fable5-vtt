import { create } from 'zustand';
import type { PaceState, TokenPaceBroadcast } from '@vtt/shared';

/**
 * Pula metrów Eksploracji figur tego gracza (etap 45).
 *
 * Serwer liczy prawdę i przysyła dług puli po każdym kroku (`token:pace`);
 * tu leży on z **własnym** znacznikiem czasu klienta, więc odnowa liczy się
 * zegarem przeglądarki, a nie serwera — dwa zegary różnią się o sekundy, a dług
 * jest „ile brakowało w chwili, gdy przyszła wiadomość”. Brak wpisu znaczy
 * pełną pulę: tak jest po F5 i po restarcie serwera, a pierwsza odmowa i tak
 * przyśle prawdę.
 */
interface PaceStoreState {
  pace: Record<string, PaceState>;
  receive: (broadcast: TokenPaceBroadcast) => void;
  clear: () => void;
}

export const usePaceStore = create<PaceStoreState>((set) => ({
  pace: {},
  receive: ({ tokenId, owedM }) =>
    set((state) => ({ pace: { ...state.pace, [tokenId]: { owedM, at: Date.now() } } })),
  clear: () => set({ pace: {} }),
}));
