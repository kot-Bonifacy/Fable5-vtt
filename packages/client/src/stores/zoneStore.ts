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
 * `editingZoneId` działa jak `editingPointId` w `netRunStore` z 26b: klik
 * w prostokąt otwiera kartę MG, a nie okno modalne.
 */
interface ZoneStoreState {
  /** Rosnąco po id — to jest kolejność malowania i kolejność klikania. */
  zones: DefenseZoneView[];
  /** Strefa otwarta na karcie MG; null = karta zamknięta. */
  editingZoneId: number | null;

  applySync: (payload: StateSyncPayload) => void;
  setZones: (sceneId: string, zones: DefenseZoneView[]) => void;
  editZone: (zoneId: number | null) => void;
}

export const useZoneStore = create<ZoneStoreState>((set) => ({
  zones: [],
  editingZoneId: null,

  applySync: (payload) => set({ zones: payload.zones }),
  setZones: (_sceneId, zones) =>
    set((state) => ({
      zones,
      // Karta otwarta na strefie, którą MG właśnie skasował, zamyka się sama.
      editingZoneId: zones.some((zone) => zone.id === state.editingZoneId)
        ? state.editingZoneId
        : null,
    })),
  editZone: (editingZoneId) => set({ editingZoneId }),
}));

/** Strefa pod punktem, od wierzchu; null, gdy klik trafił w czyste podłoże. */
export function zoneAt(point: ScenePoint): DefenseZoneView | null {
  return pickZoneAt(useZoneStore.getState().zones, point);
}
