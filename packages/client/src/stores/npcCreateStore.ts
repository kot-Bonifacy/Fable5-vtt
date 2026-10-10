import { create } from 'zustand';

/** Okno „Nowa postać” MG (etap 49a) — samo „otwarte / zamknięte”. */
interface NpcCreateState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useNpcCreateStore = create<NpcCreateState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
