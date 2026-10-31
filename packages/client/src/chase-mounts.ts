import {
  cpredMountDefinition,
  cpredMountWeaponRows,
  cpredParseMountRowId,
  cpredWithMountWeapons,
  isWeaponEntry,
  resolveWeapon,
  type CpredVehicleUpgradeId,
  type CpredWeaponRow,
  type SceneVehicleView,
  type TokenView,
} from '@vtt/shared';
import { useChaseStore } from './stores/chaseStore.js';
import { useCompendiumStore } from './stores/compendiumStore.js';

/**
 * Broń pokładowa auta na pasku kierowcy (etap 65d2). Serwer składa ten sam
 * wiersz z ulepszenia (`cpredMountWeaponRows`) w chwili strzału, więc podgląd
 * i rzut zgadzają się co do broni i magazynka; tu tylko czytamy widok auta.
 */

/** Auto, w którym ta figura siedzi za kierownicą; inaczej `null`. */
export function drivenVehicle(token: TokenView | null | undefined): SceneVehicleView | null {
  const seat = token?.vehicleSeat;
  if (!seat || seat.seat !== 0) return null;
  return (
    useChaseStore.getState().vehicles.find((entry) => entry.id === seat.sceneVehicleId) ?? null
  );
}

/** Wiersze broni pokładowych auta, które ta figura prowadzi. */
export function mountRowsForToken(token: TokenView | null | undefined): CpredWeaponRow[] {
  const vehicle = drivenVehicle(token);
  if (!vehicle || vehicle.mounts.length === 0) return [];
  const compendium = useCompendiumStore.getState();
  const weaponTypeById = new Map(Object.entries(compendium.weaponTypeById));
  const stats = {
    upgrades: vehicle.mounts.map((mount) => ({
      id: mount.id,
      upgradeId: mount.upgradeId as CpredVehicleUpgradeId,
      notes: '',
    })),
    mountAmmo: Object.fromEntries(
      vehicle.mounts.flatMap((mount) => (mount.ammo === undefined ? [] : [[mount.id, mount.ammo]])),
    ) as Record<string, number>,
  };
  return cpredMountWeaponRows(vehicle.vehicleId, stats, (entryId) => {
    const entry = compendium.entries[entryId];
    if (!entry || !isWeaponEntry(entry)) return null;
    const resolved = resolveWeapon(entry, { weaponTypeById });
    return resolved
      ? { damage: resolved.damage, magazine: resolved.magazine, rof: resolved.rof }
      : null;
  });
}

/** Karta kierowcy z bronią pokładową jego auta na końcu listy broni. */
export function withTokenMounts<T extends { weapons: CpredWeaponRow[] }>(
  data: T,
  token: TokenView | null | undefined,
): T {
  return cpredWithMountWeapons(data, mountRowsForToken(token));
}

/** Auto i wiersz ulepszenia broni pokładowej z id wiersza — przeładowanie z paska. */
export function mountReloadTarget(
  weaponRowId: string,
): { sceneVehicleId: string; upgradeRowId: string } | null {
  const parsed = cpredParseMountRowId(weaponRowId);
  if (!parsed) return null;
  const vehicle = useChaseStore
    .getState()
    .vehicles.find((entry) => entry.vehicleId === parsed.vehicleId);
  return vehicle ? { sceneVehicleId: vehicle.id, upgradeRowId: parsed.upgradeRowId } : null;
}

/**
 * Czy ten wiersz to karabin pokładowy, który strzela tylko Ogniem ciągłym
 * (s. 163) — pasek nie pokazuje mu trybu pojedynczego, bo serwer i tak go odmówi.
 */
export function mountAutofireOnly(weaponRowId: string): boolean {
  const parsed = cpredParseMountRowId(weaponRowId);
  if (!parsed) return false;
  const vehicle = useChaseStore
    .getState()
    .vehicles.find((entry) => entry.vehicleId === parsed.vehicleId);
  const mount = vehicle?.mounts.find((entry) => entry.id === parsed.upgradeRowId);
  return mount ? cpredMountDefinition(mount.upgradeId)?.autofireOnly === true : false;
}
