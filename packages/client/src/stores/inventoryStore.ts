import { create } from 'zustand';

/**
 * Okno „Wymiana" (etap 38b) — które karty właśnie ze sobą handlują.
 *
 * Magazyn jest celowo pusty poza adresem: sam ekwipunek mieszka tam, gdzie
 * mieszkał — karta w `characterStore`, cudza figura w odpowiedzi serwera na
 * `inventory:sources`. Drugi magazyn na te same rzeczy rozjechałby się przy
 * pierwszym `character:upsert`.
 */
interface InventoryStoreState {
  /**
   * Karta, do której należy otwarte okno („moja strona" wymiany).
   *
   * Z karty postaci jest to karta, z której otwarto okno; z menu figury u MG —
   * karta tej figury, więc jej ekwipunek staje po lewej i MG rozdaje z niego.
   */
  anchorId: string | null;
  /** Figura wskazana wprost („Przeszukaj"), jeśli okno otwarto z mapy. */
  anchorTokenId: string | null;
  open: (characterId: string, tokenId?: string) => void;
  close: () => void;
}

export const useInventoryStore = create<InventoryStoreState>((set) => ({
  anchorId: null,
  anchorTokenId: null,
  open: (characterId, tokenId) => set({ anchorId: characterId, anchorTokenId: tokenId ?? null }),
  close: () => set({ anchorId: null, anchorTokenId: null }),
}));
