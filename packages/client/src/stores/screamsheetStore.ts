import { create } from 'zustand';
import type { ScreamsheetDraft } from '@vtt/shared';

/**
 * Generator screamsheetów u klienta (etap 24c).
 *
 * Osobny store od `handoutStore`, bo dotyczy czegoś innego: tamten trzyma
 * **materiały stołu** (i istnieje po obu stronach), a ten — jedno trwające
 * pytanie do modelu na ekranie MG. Szkic nigdzie się nie zapisuje: leży tu do
 * chwili, w której formularz go przepisze albo MG go wyrzuci.
 *
 * `requestId` odsiewa spóźnialskich — odpowiedź na anulowane żądanie nie ma
 * prawa wskoczyć do formularza, w którym MG już pisze co innego.
 */
interface ScreamsheetState {
  requestId: string | null;
  busy: boolean;
  error: string | null;
  draft: ScreamsheetDraft | null;
  /** Ile trwała ostatnia generacja — MG widzi, czy warto czekać drugi raz. */
  totalMs: number | null;

  start: (requestId: string) => void;
  complete: (requestId: string, draft: ScreamsheetDraft, totalMs: number) => void;
  fail: (requestId: string | null, message: string) => void;
  takeDraft: () => void;
  reset: () => void;
}

export const useScreamsheetStore = create<ScreamsheetState>((set, get) => ({
  requestId: null,
  busy: false,
  error: null,
  draft: null,
  totalMs: null,

  start: (requestId) => set({ requestId, busy: true, error: null, draft: null, totalMs: null }),

  complete: (requestId, draft, totalMs) => {
    if (get().requestId !== requestId) return;
    set({ busy: false, draft, totalMs, error: null });
  },

  // `null` w miejscu żądania to odmowa z acka (np. martwy gateway) — ona
  // dotyczy zawsze tego, co MG właśnie kliknął.
  fail: (requestId, message) => {
    if (requestId !== null && get().requestId !== requestId) return;
    set({ busy: false, error: message, draft: null, requestId: null });
  },

  takeDraft: () => set({ draft: null, requestId: null, busy: false }),

  reset: () => set({ requestId: null, busy: false, error: null, draft: null, totalMs: null }),
}));
