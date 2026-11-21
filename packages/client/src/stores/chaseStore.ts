import { create } from 'zustand';
import type {
  ChaseObstacleView,
  ScenePoint,
  SceneVehicleView,
  StateSyncPayload,
} from '@vtt/shared';

/**
 * Duch auta (etap 72d2): gdzie auto stanie po „Jedź” przy obecnym wyborze
 * pedału i pasa. Stan wyłącznie u tego, kto trzyma kokpit (decyzja MG 20.11:
 * reszta stołu widzi dopiero ruch) — liczy go grupa „Pojazd” (`HudVehicle`),
 * rysuje `ChaseLayer`.
 */
export interface ChaseGhost {
  sceneVehicleId: string;
  /** Środek bryły po ruchu. */
  centre: ScenePoint;
  /** Pas docelowy (podświetlony na mapie). */
  lane: number;
  /** Miarka od zderzaka ducha do celu dystansu z „Po ruchu” albo `null`. */
  ruler: { from: ScenePoint; to: ScenePoint; label: string } | null;
}

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
  /** Okno „Pościg” MG (72f2) otwarte ikoną z paska narzędzi sceny pościgu. */
  windowOpen: boolean;
  /** Duch auta z kokpitu (72d2) albo `null`. */
  ghost: ChaseGhost | null;

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
  setWindowOpen: (open: boolean) => void;
  setGhost: (ghost: ChaseGhost | null) => void;
}

export const useChaseStore = create<ChaseState>((set) => ({
  vehicles: [],
  obstacles: [],
  menu: null,
  obstacleMenu: null,
  windowOpen: false,
  ghost: null,

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
  setWindowOpen: (windowOpen) => set({ windowOpen }),
  setGhost: (ghost) => set({ ghost }),
}));
