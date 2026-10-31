import { create } from 'zustand';
import type {
  ChaseObstacleKind,
  ChaseObstacleView,
  SceneVehicleView,
  StateSyncPayload,
} from '@vtt/shared';

/**
 * Auta na oglądanej scenie pościgu (etap 65b) — już przycięte przez serwer:
 * MG ma wszystkie, gracz te w kadrze. `chase:sync` niesie zawsze pełną listę
 * sceny, więc store tylko ją podmienia. Od 65e — także przeszkody (jawne).
 */
interface ChaseState {
  vehicles: SceneVehicleView[];
  obstacles: ChaseObstacleView[];
  /** Menu auta otwarte kliknięciem (id auta na scenie) albo `null`. */
  menu: { sceneVehicleId: string; clientX: number; clientY: number } | null;
  /** Menu przeszkody u MG (65e) albo `null`. */
  obstacleMenu: { obstacleId: string; clientX: number; clientY: number } | null;
  /**
   * Przeszkoda w ręku MG (65e): rodzaj z palety „Przeszkody”, a dla własnej —
   * nazwa i PW. Klik w drogę wypuszcza ją przy przedniej krawędzi.
   */
  armed: { kind: ChaseObstacleKind; name?: string; hp?: number; imageUrl?: string } | null;
  /** Rząd palety „Przeszkody” pod paskiem narzędzi MG. */
  palette: boolean;

  applySync: (payload: StateSyncPayload) => void;
  setVehicles: (
    sceneId: string,
    vehicles: SceneVehicleView[],
    obstacles?: ChaseObstacleView[],
  ) => void;
  openMenu: (sceneVehicleId: string, clientX: number, clientY: number) => void;
  closeMenu: () => void;
  openObstacleMenu: (obstacleId: string, clientX: number, clientY: number) => void;
  closeObstacleMenu: () => void;
  arm: (armed: ChaseState['armed']) => void;
  setPalette: (open: boolean) => void;
}

export const useChaseStore = create<ChaseState>((set) => ({
  vehicles: [],
  obstacles: [],
  menu: null,
  obstacleMenu: null,
  armed: null,
  palette: false,

  applySync: (payload) =>
    set({
      vehicles: payload.sceneVehicles ?? [],
      obstacles: payload.sceneObstacles ?? [],
      menu: null,
      obstacleMenu: null,
    }),
  setVehicles: (_sceneId, vehicles, obstacles) =>
    set((state) => {
      const nextObstacles = obstacles ?? state.obstacles;
      return {
        vehicles,
        obstacles: nextObstacles,
        menu:
          state.menu && vehicles.some((vehicle) => vehicle.id === state.menu?.sceneVehicleId)
            ? state.menu
            : null,
        obstacleMenu:
          state.obstacleMenu &&
          nextObstacles.some((obstacle) => obstacle.id === state.obstacleMenu?.obstacleId)
            ? state.obstacleMenu
            : null,
      };
    }),
  openMenu: (sceneVehicleId, clientX, clientY) =>
    set({ menu: { sceneVehicleId, clientX, clientY } }),
  closeMenu: () => set({ menu: null }),
  openObstacleMenu: (obstacleId, clientX, clientY) =>
    set({ obstacleMenu: { obstacleId, clientX, clientY } }),
  closeObstacleMenu: () => set({ obstacleMenu: null }),
  arm: (armed) => set({ armed }),
  setPalette: (palette) => set(palette ? { palette } : { palette, armed: null }),
}));
