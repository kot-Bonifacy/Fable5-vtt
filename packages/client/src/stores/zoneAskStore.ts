import { create } from 'zustand';
import type { ScenePoint } from '@vtt/shared';

/**
 * Okienko strefy przy kursorze (etap 70d) — klik albo marsz w zauważoną
 * strefę. Nic tu nie jest jeszcze marszem: „Wejdź mimo to” puszcza ten sam
 * klik drugi raz, bez pytania (`MapRenderer.walkToWaived`).
 */
export interface ZoneAsk {
  /** Strefy, w które klik albo trasa wchodzi. */
  zoneIds: number[];
  /** Figura, która miała iść. */
  tokenId: string;
  /** Punkt kliknięcia w świecie — tam idzie „Wejdź mimo to”. */
  goal: ScenePoint;
  /** Współrzędne klienta kliknięcia: okienko staje przy kursorze. */
  x: number;
  y: number;
}

interface ZoneAskState {
  ask: ZoneAsk | null;
  open: (ask: ZoneAsk) => void;
  close: () => void;
}

export const useZoneAskStore = create<ZoneAskState>((set) => ({
  ask: null,
  open: (ask) => set({ ask }),
  close: () => set({ ask: null }),
}));
