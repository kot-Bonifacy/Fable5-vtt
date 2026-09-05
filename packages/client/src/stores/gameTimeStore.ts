import { create } from 'zustand';
import { GAME_TIME_DEFAULT, type GameTimeState, type StateSyncPayload } from '@vtt/shared';

/**
 * Zegar świata u klienta (etap 37).
 *
 * Stan, nie gest — inaczej niż ping z etapu 35: datę widać przez cały czas
 * w górnym pasku, przeżywa przeładowanie strony i przychodzi w `state:sync`.
 *
 * `days` jest jedynym polem, które **nie** pochodzi z serwerowego stanu: to
 * własność ostatniego skoku („minęły trzy doby"), z której MG składa propozycję
 * odpoczynku. Żyje w tej przeglądarce i ginie przy przeładowaniu, i tak ma być
 * — propozycja odpoczynku sprzed dwóch godzin nie jest już propozycją, tylko
 * przypomnieniem o czymś, co MG albo zrobił, albo świadomie pominął.
 */
interface GameTimeStoreState extends GameTimeState {
  /** Ile pełnych dób minęło ostatnim skokiem; 0 = nie ma czego proponować. */
  pendingRestDays: number;
  /** Okno zegara MG jest otwarte. */
  open: boolean;

  applySync: (payload: StateSyncPayload) => void;
  applyTime: (time: GameTimeState) => void;
  /** Skok zakończony u MG: nowy stan plus doby do zaproponowania. */
  applyJump: (time: GameTimeState, days: number) => void;
  clearRestDays: () => void;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
}

export const useGameTimeStore = create<GameTimeStoreState>((set) => ({
  minutes: GAME_TIME_DEFAULT,
  settledMonth: null,
  pendingRestDays: 0,
  open: false,

  applySync: (payload) =>
    set({
      minutes: payload.gameTime?.minutes ?? GAME_TIME_DEFAULT,
      settledMonth: payload.gameTime?.settledMonth ?? null,
    }),

  // Rozgłoszenie od serwera nie rusza propozycji odpoczynku: MG, który
  // przesunął zegar w drugiej karcie, dostał ją tam wraz z ackiem.
  applyTime: (time) => set({ minutes: time.minutes, settledMonth: time.settledMonth }),

  applyJump: (time, days) =>
    set((state) => ({
      minutes: time.minutes,
      settledMonth: time.settledMonth,
      // Doby się **sumują**: dwa skoki po dobie to dwa dni odpoczynku do
      // rozdania, a nie ostatni z nich. Skok krótszy niż doba niczego nie
      // zeruje — MG, który po nocy przesunął zegar o dziesięć minut, nie stracił
      // propozycji, której jeszcze nie rozdał.
      pendingRestDays: state.pendingRestDays + days,
    })),

  clearRestDays: () => set({ pendingRestDays: 0 }),
  setOpen: (open) => set({ open }),
  toggleOpen: () => set((state) => ({ open: !state.open })),
}));
