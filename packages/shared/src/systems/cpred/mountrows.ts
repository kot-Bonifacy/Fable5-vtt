/**
 * Id wierszy broni pokładowych (etap 65d2) — liść bez importów, bo pyta o nie
 * `character.ts` (broń spoza limitu rąk), a reszta pojazdów stoi wyżej.
 *
 * Broń pokładowa nie leży na karcie: wiersz broni powstaje z ulepszenia pojazdu
 * w chwili strzału (`cpredMountWeaponRows`) i dostaje id
 * `mount:<id pojazdu>:<id wiersza ulepszenia>`, więc serwer z samego id wie,
 * w którym aucie szukać magazynka.
 */
export const CPRED_MOUNT_ROW_PREFIX = 'mount:';

export function cpredMountRowId(vehicleId: string, upgradeRowId: string): string {
  return `${CPRED_MOUNT_ROW_PREFIX}${vehicleId}:${upgradeRowId}`;
}

export function cpredIsMountRowId(rowId: string): boolean {
  return rowId.startsWith(CPRED_MOUNT_ROW_PREFIX);
}

/** Pojazd i wiersz ulepszenia z id wiersza broni pokładowej; inne id — `null`. */
export function cpredParseMountRowId(
  rowId: unknown,
): { vehicleId: string; upgradeRowId: string } | null {
  if (typeof rowId !== 'string' || !cpredIsMountRowId(rowId)) return null;
  const rest = rowId.slice(CPRED_MOUNT_ROW_PREFIX.length);
  const split = rest.indexOf(':');
  if (split <= 0 || split === rest.length - 1) return null;
  return { vehicleId: rest.slice(0, split), upgradeRowId: rest.slice(split + 1) };
}
