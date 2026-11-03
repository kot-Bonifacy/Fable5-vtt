import type { CpredWeaponRow } from './character.js';
import { cpredMountRowId } from './mountrows.js';
import {
  cpredVehicleUpgrade,
  type CpredVehicleKind,
  type CpredVehicleStats,
  type CpredVehicleUpgradeId,
} from './vehicles.js';

/**
 * Walka pojazdów — Manewr, taranowanie i bronie pokładowe (etap 65d2,
 * s. 163–165 i 192). Czyste reguły: serwer rzuca kości i zapisuje, rdzeń
 * pościgu (`shared/chase.ts`) liczy geometrię zderzenia.
 */

// ───────────────────────── Manewr (s. 192) ─────────────────────────

export const CPRED_VEHICLE_MANEUVER_IDS = [
  'swerve',
  'sharp-turn',
  'sudden-stop',
  'bootleg',
  'jump',
  'landing',
  'air-maneuver',
] as const;
export type CpredVehicleManeuverId = (typeof CPRED_VEHICLE_MANEUVER_IDS)[number];

export interface CpredVehicleManeuver {
  id: CpredVehicleManeuverId;
  name: string;
  dv: number;
  /** Tylko pojazd latający (Lądowanie, Manewr w powietrzu). */
  air: boolean;
}

/** „Sytuacje wymagające Manewru” (s. 192). */
export const CPRED_VEHICLE_MANEUVERS: readonly CpredVehicleManeuver[] = [
  { id: 'swerve', name: 'Gwałtowny skręt', dv: 13, air: false },
  { id: 'sharp-turn', name: 'Ostry zakręt', dv: 13, air: false },
  { id: 'sudden-stop', name: 'Nagłe zatrzymanie', dv: 13, air: false },
  { id: 'bootleg', name: 'Zawrót na ręcznym', dv: 17, air: false },
  { id: 'jump', name: 'Skok', dv: 17, air: false },
  { id: 'landing', name: 'Lądowanie', dv: 13, air: true },
  { id: 'air-maneuver', name: 'Manewr w powietrzu', dv: 17, air: true },
];

const AIR_KINDS: readonly CpredVehicleKind[] = ['gyro', 'aircraft'];

export function cpredVehicleManeuver(id: unknown): CpredVehicleManeuver | null {
  return CPRED_VEHICLE_MANEUVERS.find((entry) => entry.id === id) ?? null;
}

/**
 * Manewry, które pasują do pojazdu: latający ma lądowanie i manewr
 * w powietrzu, reszta — pięć manewrów jezdni (łódź też: tabela nie wyróżnia
 * wody, a skręt i nagłe zatrzymanie to ta sama sztuka za sterem).
 */
export function cpredManeuversFor(kind: CpredVehicleKind): CpredVehicleManeuver[] {
  const air = AIR_KINDS.includes(kind);
  return CPRED_VEHICLE_MANEUVERS.filter((entry) => entry.air === air);
}

/** „Manewr … zabiera obie Akcje: Akcję i Akcję Ruchu” (s. 192) — tytuł karty rzutu. */
export function cpredManeuverTitle(maneuver: CpredVehicleManeuver): string {
  return `Manewr: ${maneuver.name}`;
}

// ───────────────────────── Taranowanie (s. 192, Pług bojowy s. 164) ─────────────────────────

/** „…otrzymujecie po 6k6 obrażeń” (s. 192). */
export const CPRED_RAM_DAMAGE = '6k6';
/** Pług bojowy pod Nitro: „…otrzymują dodatkowe 2k6 obrażeń” (s. 164). */
export const CPRED_RAM_PLOW_NITRO_BONUS = '2k6';
/** „…pieszy musi wykonać udany Test ZW + Unik + 1k10 przeciw PT 13” (s. 192). */
export const CPRED_RAM_DODGE_DV = 13;
export const CPRED_RAM_DODGE_SKILL_ID = 'evasion';
/** Rana Krytyczna każdego uczestnika wypadku (s. 192) — wpis kompendium ran po nazwie. */
export const CPRED_RAM_INJURY_NAME = 'Odgięciowy uraz kręgosłupa szyjnego';

export interface CpredRamInput {
  /** Taranujący ma Pług bojowy (ulepszenie `ram`). */
  plow: boolean;
  /** Uderzył przodem (`chaseHitsWithFront`). */
  front: boolean;
  /** W tej turze kierowca odpalił Nitro (s. 164: „…był pod działaniem Nitro”). */
  nitro: boolean;
}

export interface CpredRamOutcome {
  /** Kości obrażeń taranującego auta; `null` — Pług je zdjął. */
  rammerDamage: string | null;
  /** Czy jadący taranującym dostają Ranę Krytyczną. */
  rammerInjured: boolean;
  /** Kości obrażeń uderzonego (auta albo pieszego). */
  struckDamage: string;
}

/**
 * Kto ile bierze przy taranowaniu (s. 192): oba pojazdy po 6k6 i Rana Krytyczna
 * dla każdego jadącego. Pług bojowy przy uderzeniu przodem zdejmuje obrażenia
 * i Ranę z taranującego, a pod Nitro dokłada uderzonemu 2k6 (s. 164).
 */
export function cpredRamOutcome(input: CpredRamInput): CpredRamOutcome {
  const plowed = input.plow && input.front;
  return {
    rammerDamage: plowed ? null : CPRED_RAM_DAMAGE,
    rammerInjured: !plowed,
    struckDamage:
      plowed && input.nitro
        ? `${CPRED_RAM_DAMAGE}+${CPRED_RAM_PLOW_NITRO_BONUS}`
        : CPRED_RAM_DAMAGE,
  };
}

/** Czy auto ma Pług bojowy. */
export function cpredVehicleHasPlow(stats: Pick<CpredVehicleStats, 'upgrades'>): boolean {
  return stats.upgrades.some((row) => row.upgradeId === 'ram');
}

/**
 * Czy taranujący jedzie dalej (s. 192): po pieszym — zawsze, po osłonie albo
 * aucie — tylko, gdy jego PW spadły do zera; inaczej staje przy przeszkodzie.
 */
export function cpredRamContinues(struck: { pedestrian: boolean; hpAfter: number }): boolean {
  return struck.pedestrian || struck.hpAfter <= 0;
}

// ───────────────────────── Bronie pokładowe (s. 163–164) ─────────────────────────

export type CpredMountUpgradeId = Extract<
  CpredVehicleUpgradeId,
  'machineGun' | 'flamethrower' | 'rocketPod' | 'meleeMount'
>;

export interface CpredMountDefinition {
  /** Wpis katalogu broni, którą ulepszenie jest. */
  entryId: string;
  /** Pojemność magazynka z opisu ulepszenia; `null` — z typu broni; 0 — bez naboi. */
  magazine: number | null;
  /** „…może strzelać tylko Ogniem ciągłym” (karabin maszynowy). */
  autofireOnly: boolean;
  /** „…razi cele przed pojazdem” — `front`; z boku i z tyłu też — `any`. */
  arc: 'front' | 'any';
}

/**
 * Bronie pokładowe z ulepszeń Moto. Kierowca używa ich za Akcję; nie da się
 * ich przeładować w czasie jazdy (odmowa `MOUNT_RELOAD_MOVING` na serwerze). Stanowisko
 * bardzo ciężkiej broni (`heavyMount`) tu nie stoi: pasażer strzela z niego
 * własną bronią z karty, jak z każdego fotela.
 */
export const CPRED_VEHICLE_MOUNTS: Record<CpredMountUpgradeId, CpredMountDefinition> = {
  machineGun: { entryId: 'weapon.assault-rifle', magazine: 30, autofireOnly: true, arc: 'front' },
  flamethrower: {
    entryId: 'weapon.miotacz-ognia',
    magazine: null,
    autofireOnly: false,
    arc: 'any',
  },
  rocketPod: { entryId: 'weapon.rocket-launcher', magazine: 3, autofireOnly: false, arc: 'front' },
  meleeMount: { entryId: 'weapon.very-heavy-melee', magazine: 0, autofireOnly: false, arc: 'any' },
};

export function cpredMountDefinition(upgradeId: string): CpredMountDefinition | null {
  return (CPRED_VEHICLE_MOUNTS as Record<string, CpredMountDefinition>)[upgradeId] ?? null;
}

/** Co wiersz broni pokładowej bierze z katalogu: kości i magazynek typu broni. */
export type CpredMountWeaponLookup = (
  entryId: string,
) => { damage: string; magazine: number | null; rof: number } | null;

export interface CpredMountRowInfo {
  vehicleId: string;
  upgradeRowId: string;
  upgradeId: CpredMountUpgradeId;
  definition: CpredMountDefinition;
}

/**
 * Wiersze broni pokładowych auta, z których strzela kierowca — gotowe do
 * dołożenia do jego listy broni na czas strzału (`cpredWithMountWeapons`).
 * Ulepszenie, którego broni katalog nie zna, wiersza nie daje.
 */
export function cpredMountWeaponRows(
  vehicleId: string,
  stats: Pick<CpredVehicleStats, 'upgrades' | 'mountAmmo'>,
  lookup: CpredMountWeaponLookup,
): CpredWeaponRow[] {
  const rows: CpredWeaponRow[] = [];
  const seen = new Map<string, number>();
  for (const upgrade of stats.upgrades) {
    const definition = cpredMountDefinition(upgrade.upgradeId);
    if (!definition) continue;
    const weapon = lookup(definition.entryId);
    if (!weapon) continue;
    const magazine = definition.magazine ?? weapon.magazine ?? 0;
    const name = cpredVehicleUpgrade(upgrade.upgradeId)?.name ?? upgrade.upgradeId;
    const count = (seen.get(upgrade.upgradeId) ?? 0) + 1;
    seen.set(upgrade.upgradeId, count);
    rows.push({
      id: cpredMountRowId(vehicleId, upgrade.id),
      name: count > 1 ? `${name} ${count}` : name,
      compendiumId: definition.entryId,
      notes: 'Broń pokładowa — kierowca strzela za Akcję, nie przeładuje w czasie jazdy.',
      damage: weapon.damage,
      ammoCurrent: Math.min(magazine, stats.mountAmmo[upgrade.id] ?? magazine),
      ammoMax: magazine,
      ammoType: '',
      rof: String(weapon.rof),
    });
  }
  return rows;
}

/**
 * Bronie pokładowe auta, których broni katalog nie zna — `cpredMountWeaponRows`
 * pomija je po cichu, więc kierowca nie ma ich na pasku. Okno pojazdu i menu
 * auta pokazują je MG jako ostrzeżenie (decyzja MG z 03.11). Każde ulepszenie
 * raz, w kolejności montażu.
 */
export function cpredMissingMountWeapons(
  stats: Pick<CpredVehicleStats, 'upgrades'>,
  known: (entryId: string) => boolean,
): { upgradeId: CpredMountUpgradeId; name: string; entryId: string }[] {
  const missing: { upgradeId: CpredMountUpgradeId; name: string; entryId: string }[] = [];
  for (const upgrade of stats.upgrades) {
    const definition = cpredMountDefinition(upgrade.upgradeId);
    if (!definition || known(definition.entryId)) continue;
    if (missing.some((entry) => entry.upgradeId === upgrade.upgradeId)) continue;
    missing.push({
      upgradeId: upgrade.upgradeId as CpredMountUpgradeId,
      name: cpredVehicleUpgrade(upgrade.upgradeId)?.name ?? upgrade.upgradeId,
      entryId: definition.entryId,
    });
  }
  return missing;
}

/** Ulepszenie, którym jest wiersz broni pokładowej tego auta; inne — `null`. */
export function cpredMountRowInfo(
  vehicleId: string,
  upgradeRowId: string,
  stats: Pick<CpredVehicleStats, 'upgrades'>,
): CpredMountRowInfo | null {
  const upgrade = stats.upgrades.find((row) => row.id === upgradeRowId);
  if (!upgrade) return null;
  const definition = cpredMountDefinition(upgrade.upgradeId);
  if (!definition) return null;
  return {
    vehicleId,
    upgradeRowId,
    upgradeId: upgrade.upgradeId as CpredMountUpgradeId,
    definition,
  };
}

/** Lista broni karty z bronią pokładową auta na końcu (kierowca w fotelu 0). */
export function cpredWithMountWeapons<T extends { weapons: CpredWeaponRow[] }>(
  data: T,
  mounted: readonly CpredWeaponRow[],
): T {
  if (mounted.length === 0) return data;
  const own = new Set(data.weapons.map((row) => row.id));
  return { ...data, weapons: [...data.weapons, ...mounted.filter((row) => !own.has(row.id))] };
}

/** Czy auto ma choć jedną broń pokładową — menu auta i pasek kierowcy. */
export function cpredVehicleHasMounts(stats: Pick<CpredVehicleStats, 'upgrades'>): boolean {
  return stats.upgrades.some((row) => cpredMountDefinition(row.upgradeId) !== null);
}

/** Pełny magazynek broni pokładowej po przeładowaniu — nowy `mountAmmo`. */
export function cpredMountReloaded(
  stats: Pick<CpredVehicleStats, 'mountAmmo'>,
  upgradeRowId: string,
  magazine: number,
): Record<string, number> {
  return { ...stats.mountAmmo, [upgradeRowId]: magazine };
}

// ───────────────────────── Przeszkody i kolczatka (etap 65e, s. 165 i 192) ─────────────────────────

/**
 * Przeszkoda na drodze to sytuacja z tabeli Manewrów (s. 192): kierowca omija
 * ją Gwałtownym skrętem, a porażka to utrata kontroli i zderzenie.
 */
export const CPRED_OBSTACLE_MANEUVER_ID: CpredVehicleManeuverId = 'swerve';

/** „…Test Prowadzenia pojazdów lądowych o PT 17, by ominąć wyrzuconą kolczatkę” (s. 165). */
export const CPRED_SPIKES_DV = 17;
/** „…pojazdy otrzymują 4k6 obrażeń w słaby punkt” (s. 165). */
export const CPRED_SPIKES_DAMAGE = '4k6';

/**
 * Kolczatki, które auto ma jeszcze na ten pościg. Podręcznik nie mówi, ile
 * kolczatek mieści wyrzutnia — „każde dodatkowe wykupienie zwiększa liczbę” —
 * więc zasada domowa liczy jak Nitro: jedna na każde wykupienie, na pościg
 * (uzupełnienie „nie w czasie jazdy”, czyli po pościgu).
 */
export function cpredVehicleSpikesLeft(
  stats: Pick<CpredVehicleStats, 'upgrades'>,
  used: number,
): number {
  const owned = stats.upgrades.filter((row) => row.upgradeId === 'spikes').length;
  return Math.max(0, owned - Math.max(0, used));
}

/**
 * Czy kolczatka rusza ten pojazd: „inne pojazdy z oponami” (s. 165) — auto
 * i motocykl, ale nie poduszkowiec (ulepszenie `hovercraft`), łódź ani maszyna
 * latająca.
 */
export function cpredSpikesAffect(stats: Pick<CpredVehicleStats, 'kind' | 'upgrades'>): boolean {
  if (stats.kind !== 'car' && stats.kind !== 'motorcycle') return false;
  return !stats.upgrades.some((row) => row.upgradeId === 'hovercraft');
}
