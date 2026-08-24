import { create } from 'zustand';
import type { DefenseZoneView, ScenePoint, StateSyncPayload } from '@vtt/shared';
import { pickZoneAt } from '@vtt/shared';

/**
 * Strefy bronione na oglądanej scenie (etap 26f).
 *
 * Odwrotność `coverStore`: osłona jedzie do wszystkich, bo samochód na ulicy
 * nie jest tajemnicą, a **pułapka jest**. Lista, którą tu widzimy, jest już
 * pocięta na serwerze — gracz dostaje wyłącznie strefy odsłonięte albo
 * zauważone przez jego postać, więc klient nie ma czego ukrywać i niczego nie
 * filtruje.
 *
 * Która strefa jest otwarta na karcie, **nie jest** tutaj od 27l: to jest stan
 * karty, wspólny dla siedmiu rodzajów obiektów sceny, więc mieszka
 * w `sceneCardStore`. Ten store trzyma same dane.
 */
interface ZoneStoreState {
  /** Rosnąco po id — to jest kolejność malowania i kolejność klikania. */
  zones: DefenseZoneView[];

  applySync: (payload: StateSyncPayload) => void;
  setZones: (sceneId: string, zones: DefenseZoneView[]) => void;
}

export const useZoneStore = create<ZoneStoreState>((set) => ({
  zones: [],

  applySync: (payload) => set({ zones: payload.zones }),
  // Karta otwarta na strefie, którą MG właśnie skasował, zamyka się sama —
  // pilnuje tego `SceneObjectCard`, bo obiekt znika spod niej tak samo
  // w każdym z siedmiu store'ów.
  setZones: (_sceneId, zones) => set({ zones }),
}));

/** Strefa pod punktem, od wierzchu; null, gdy klik trafił w czyste podłoże. */
export function zoneAt(point: ScenePoint): DefenseZoneView | null {
  return pickZoneAt(useZoneStore.getState().zones, point);
}
