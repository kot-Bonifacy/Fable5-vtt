import { create } from 'zustand';

/**
 * Okno pomocy ze skrótami (etap 27f).
 *
 * Osobny store, a nie pole w `settingsStore`, bo to nie jest ustawienie: nic
 * się tu nie zapisuje między sesjami i nic nie jedzie na serwer. Okno albo
 * jest otwarte, albo go nie ma.
 */
interface HelpState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
}

export const useHelpStore = create<HelpState>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggleOpen: () => set({ open: !get().open }),
}));
