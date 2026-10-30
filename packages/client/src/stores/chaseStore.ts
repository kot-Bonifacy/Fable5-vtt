import { create } from 'zustand';
import type { SceneVehicleView, StateSyncPayload } from '@vtt/shared';

/**
 * Auta na oglądanej scenie pościgu (etap 65b) — już przycięte przez serwer:
 * MG ma wszystkie, gracz te w kadrze. `chase:sync` niesie zawsze pełną listę
 * sceny, więc store tylko ją podmienia.
 */
interface ChaseState {
  vehicles: SceneVehicleView[];
  /** Menu auta otwarte kliknięciem (id auta na scenie) albo `null`. */
  menu: { sceneVehicleId: string; clientX: number; clientY: number } | null;

  applySync: (payload: StateSyncPayload) => void;
  setVehicles: (sceneId: string, vehicles: SceneVehicleView[]) => void;
  openMenu: (sceneVehicleId: string, clientX: number, clientY: number) => void;
  closeMenu: () => void;
}

export const useChaseStore = create<ChaseState>((set) => ({
  vehicles: [],
  menu: null,

  applySync: (payload) => set({ vehicles: payload.sceneVehicles ?? [], menu: null }),
  setVehicles: (_sceneId, vehicles) =>
    set((state) => ({
      vehicles,
      menu:
        state.menu && vehicles.some((vehicle) => vehicle.id === state.menu?.sceneVehicleId)
          ? state.menu
          : null,
    })),
  openMenu: (sceneVehicleId, clientX, clientY) =>
    set({ menu: { sceneVehicleId, clientX, clientY } }),
  closeMenu: () => set({ menu: null }),
}));
