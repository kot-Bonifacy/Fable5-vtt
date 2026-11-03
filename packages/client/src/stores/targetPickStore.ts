import { create } from 'zustand';

/**
 * Wybór celu ze stosu figur (03.11.2026, zlecenie MG).
 *
 * Gdy klik celownika trafia w pole, na którym stoi więcej niż jeden cel,
 * mapa nie strzela w figurę z wierzchu, tylko zostawia tu listę — menu przy
 * kursorze (`TargetPickMenu`) pyta, w którą. Nic tu nie jest jeszcze strzałem:
 * wybór wraca tą samą drogą, którą poszedłby klik w pojedynczą figurę.
 */
export interface TargetPick {
  /** Figury pod kliknięciem, od wierzchu stosu. */
  tokenIds: string[];
  /** Współrzędne klienta kliknięcia: menu staje przy kursorze. */
  x: number;
  y: number;
}

interface TargetPickState {
  pick: TargetPick | null;
  open: (pick: TargetPick) => void;
  close: () => void;
}

export const useTargetPickStore = create<TargetPickState>((set) => ({
  pick: null,
  open: (pick) => set({ pick }),
  close: () => set({ pick: null }),
}));
