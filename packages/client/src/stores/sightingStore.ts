import { create } from 'zustand';
import type { CpredSighting } from '@vtt/shared';
import { lookAtToken } from '../socket.js';

/**
 * Co gracz widzi na cudzych figurach (etap 41).
 *
 * Rzut oka nie jedzie z żetonem, tylko na żądanie — składa się go z katalogu po
 * stronie serwera, a synchronizacja sceny nie ma po co na to czekać. Ten skład
 * jest więc **podręczną pamięcią zapytań**, a nie stanem świata: prawda siedzi
 * na serwerze i pytanie o nią jest tanie.
 *
 * **Pamięć jest krótka i to jest celowe.** Wpis żyje `TTL` milisekund, bo nic tu
 * nie powie klientowi, że ganger właśnie sięgnął po karabin: karty cudzych figur
 * do gracza nie docierają (`characterAudience`), więc nie ma czego nasłuchiwać.
 * Świeże pytanie przy każdym najechaniu kursorem jest tańsze niż podpięcie się
 * pod cudzą kartę — i bezpieczniejsze, bo nie wymaga wysyłania jej komukolwiek.
 */

/** Jak długo wpis uchodzi za świeży. Tyle, ile trwa jedno spojrzenie na mapę. */
const TTL_MS = 10_000;

interface Entry {
  name: string;
  sighting: CpredSighting | null;
  at: number;
}

interface SightingStoreState {
  /** Ostatnio zobaczone rzuty oka, po id figury. */
  glances: Record<string, Entry>;
  /** Zapytania w locie — bez tego dymek pyta raz na klatkę przy najechaniu. */
  pending: Record<string, true>;
  /**
   * Figura, której okno oględzin stoi otwarte; `null` znaczy „zamknięte".
   *
   * W składzie, a nie w stanie mapy, bo wejść jest więcej niż jedno — menu
   * figury dziś, a dymek pod celownikiem albo pasek akcji jutro. Ta sama umowa,
   * co przy `checkStore`.
   */
  openTokenId: string | null;
  look: (tokenId: string, force?: boolean) => Promise<void>;
  open: (tokenId: string) => void;
  close: () => void;
  forget: (tokenId: string) => void;
}

export const useSightingStore = create<SightingStoreState>((set, get) => ({
  glances: {},
  pending: {},
  openTokenId: null,

  look: async (tokenId, force = false) => {
    const state = get();
    if (state.pending[tokenId]) return;
    const known = state.glances[tokenId];
    if (!force && known && Date.now() - known.at < TTL_MS) return;
    set((s) => ({ pending: { ...s.pending, [tokenId]: true } }));
    const result = await lookAtToken(tokenId);
    set((s) => {
      const { [tokenId]: _gone, ...pending } = s.pending;
      if (!result) return { pending };
      return {
        pending,
        glances: {
          ...s.glances,
          [tokenId]: {
            name: result.name,
            sighting: (result.sighting as CpredSighting | null) ?? null,
            at: Date.now(),
          },
        },
      };
    });
  },

  // Otwarcie **zawsze** odświeża: okno otwiera się po to, żeby się przyjrzeć,
  // a dziesięciosekundowa pamięć dymka jest tu za stara na taki gest.
  open: (tokenId) => {
    set({ openTokenId: tokenId });
    void get().look(tokenId, true);
  },
  close: () => set({ openTokenId: null }),

  forget: (tokenId) =>
    set((s) => {
      const { [tokenId]: _gone, ...glances } = s.glances;
      return { glances };
    }),
}));

/** Rzut oka na tę figurę, jeśli jest w pamięci; `null`, gdy jeszcze nie pytano. */
export function glanceOf(
  glances: Record<string, Entry>,
  tokenId: string | null | undefined,
): CpredSighting | null {
  if (!tokenId) return null;
  return glances[tokenId]?.sighting ?? null;
}
