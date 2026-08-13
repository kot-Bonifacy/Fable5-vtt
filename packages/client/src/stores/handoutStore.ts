import { create } from 'zustand';
import type { HandoutRecipient, HandoutView } from '@vtt/shared';

/**
 * Handouty u klienta (etap 24a).
 *
 * Inaczej niż baza wiedzy z 19b, ten store istnieje **po obu stronach stołu** —
 * tyle że gracz dostaje z serwera wyłącznie to, co mu udostępniono, i bez pola
 * `sharedWith`. Nic tu nie filtrujemy: filtr stoi w zapytaniu na serwerze,
 * a klient wyświetla to, co przyszło.
 *
 * `open` to stos otwartych okien (ostatnie na wierzchu) — ten sam wzorzec, co
 * karty postaci z etapu 07. Udostępnienie wpycha na niego okno u odbiorcy.
 */
interface HandoutState {
  handouts: Record<string, HandoutView>;
  /** Kolejność wyświetlania: najnowszy handout u góry. */
  order: string[];
  /** Kandydaci na odbiorców — niepusta lista tylko u MG. */
  recipients: HandoutRecipient[];
  loaded: boolean;
  /**
   * Handout otwarty w edytorze MG. `new` = nowa notatka, `new-screamsheet` =
   * nowa gazeta (24c), id = edycja istniejącego, null = formularz zamknięty.
   */
  editing: string | 'new' | 'new-screamsheet' | null;
  /** Otwarte okna handoutów, od spodu stosu. */
  open: string[];

  replaceAll: (handouts: HandoutView[], recipients: HandoutRecipient[]) => void;
  upsert: (handout: HandoutView) => void;
  remove: (id: string) => void;
  setEditing: (editing: string | 'new' | 'new-screamsheet' | null) => void;
  openHandout: (id: string) => void;
  closeHandout: (id: string) => void;
  focusHandout: (id: string) => void;
}

function sortIds(handouts: Record<string, HandoutView>): string[] {
  return Object.values(handouts)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((handout) => handout.id);
}

export const useHandoutStore = create<HandoutState>((set, get) => ({
  handouts: {},
  order: [],
  recipients: [],
  loaded: false,
  editing: null,
  open: [],

  replaceAll: (handouts, recipients) => {
    const byId: Record<string, HandoutView> = {};
    for (const handout of handouts) byId[handout.id] = handout;
    set((state) => ({
      handouts: byId,
      order: sortIds(byId),
      recipients,
      loaded: true,
      // Okno handoutu, którego już nie mamy, nie ma czego pokazać.
      open: state.open.filter((id) => id in byId),
    }));
  },

  upsert: (handout) =>
    set((state) => {
      const handouts = { ...state.handouts, [handout.id]: handout };
      return { handouts, order: sortIds(handouts) };
    }),

  remove: (id) =>
    set((state) => {
      const handouts = { ...state.handouts };
      delete handouts[id];
      return {
        handouts,
        order: sortIds(handouts),
        editing: state.editing === id ? null : state.editing,
        open: state.open.filter((openId) => openId !== id),
      };
    }),

  setEditing: (editing) => set({ editing }),

  openHandout: (id) =>
    set((state) => ({ open: [...state.open.filter((openId) => openId !== id), id] })),

  closeHandout: (id) => set((state) => ({ open: state.open.filter((openId) => openId !== id) })),

  focusHandout: (id) => {
    if (get().open.at(-1) === id) return;
    set((state) => ({ open: [...state.open.filter((openId) => openId !== id), id] }));
  },
}));
