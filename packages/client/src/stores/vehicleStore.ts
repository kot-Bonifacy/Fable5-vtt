import { create } from 'zustand';
import type { StateSyncPayload, VehicleView } from '@vtt/shared';

/**
 * Pojazdy kampanii u klienta (etap 65a) — już przycięte przez serwer: MG ma
 * wszystkie, gracz pojazdy swoich kart. `vehicle:*` jest celowane jak karty
 * i nie niesie seq, więc pełny obraz daje tylko `state:sync`.
 */
interface VehicleState {
  vehicles: Record<string, VehicleView>;
  /** Okno „Pojazdy” MG (lista pojazdów kampanii). */
  windowOpen: boolean;

  applySync: (payload: StateSyncPayload) => void;
  upsert: (vehicle: VehicleView) => void;
  remove: (vehicleId: string) => void;
  setWindowOpen: (open: boolean) => void;
}

export const useVehicleStore = create<VehicleState>((set) => ({
  vehicles: {},
  windowOpen: false,

  applySync: (payload) => {
    const vehicles: Record<string, VehicleView> = {};
    for (const vehicle of payload.vehicles ?? []) vehicles[vehicle.id] = vehicle;
    set({ vehicles });
  },
  upsert: (vehicle) => set((state) => ({ vehicles: { ...state.vehicles, [vehicle.id]: vehicle } })),
  remove: (vehicleId) =>
    set((state) => {
      if (!state.vehicles[vehicleId]) return state;
      const { [vehicleId]: _gone, ...vehicles } = state.vehicles;
      return { vehicles };
    }),
  setWindowOpen: (windowOpen) => set({ windowOpen }),
}));

const collator = new Intl.Collator('pl');

/** Pojazdy jednej karty (albo bez właściciela dla `null`), po nazwie. */
export function vehiclesOf(
  vehicles: Record<string, VehicleView>,
  ownerCharacterId: string | null,
): VehicleView[] {
  return Object.values(vehicles)
    .filter((vehicle) => vehicle.ownerCharacterId === ownerCharacterId)
    .sort((a, b) => collator.compare(a.name, b.name));
}
