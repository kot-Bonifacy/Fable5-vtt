/**
 * Warsztat: ulepszenia pojazdu za eurodolary i naprawa auta (etap 68, zlecenie
 * MG z 06.11.2026 — „możliwość montażu karabinu pokładowego i innych akcesoriów
 * do auta”).
 *
 * Podręcznik (s. 163): „Poniższe ulepszenia bardzo rzadko pojawiają się
 * w sprzedaży; te opisane przy Poziomie Moto 1 są Bardzo kosztowne, a pozostałe
 * są Luksusowe”. Decyzje MG z 06.11:
 *
 *  - **cena** to cena pasma × 3: Moto 1 → 1000 × 3 = **3000 ed**, reszta →
 *    5000 × 3 = **15 000 ed** (cennik ×10 dawał opancerzenie droższe od auta);
 *  - **poziom sklepu** z pasma: Moto 1 → 3 (Wojskowe), reszta → 4 (Czarny
 *    rynek) — MG przestawia pojedynczy wpis w Kompendium;
 *  - **kupuje się jak auto**: Kompendium (bramki poziomu i „tylko u handlarzy”)
 *    albo handlarz z kategorią „Ulepszenia pojazdów” (warsztat, domyślnie „nie
 *    prowadzi”); montaż **od razu** po zapłacie, z regułami montażu podręcznika;
 *  - **tylko do własnych aut spoza Taboru** — auto Rodziny ulepsza się za Moto;
 *  - **naprawa w warsztacie**: 50 ed za brakujący PUK kadłuba, szyby w cenie,
 *    wrak też, od razu (czas z podręcznika tylko w opisie).
 *
 * Ulepszenie to wpis kompendium (`VehicleUpgradeEntry`) nad wierszem
 * `CPRED_VEHICLE_UPGRADES` — wpisy dopisuje `withVehicleUpgradeEntries`
 * w `loadCompendium`, po cenniku domowym, więc ich cena jest już w ed stołu.
 */

import {
  type CompendiumEntry,
  type CompendiumRegistry,
  type CostCategory,
  type ShopTier,
  type VehicleUpgradeEntry,
} from './compendium.js';
import { cpredHaggledPrice } from './roleability.js';
import {
  CPRED_VEHICLE_UPGRADES,
  CPRED_VEHICLE_UPGRADE_PROBLEMS,
  cpredVehicleDerived,
  cpredVehicleUpgradeProblem,
  readCpredVehicle,
  type CpredVehicleStats,
  type CpredVehicleUpgradeDefinition,
  type CpredVehicleUpgradeId,
  type CpredVehicleUpgradeProblem,
} from './vehicles.js';

/** Mnożnik ceny pasma z s. 163 — decyzja MG z 06.11.2026 („jak w podręczniku ×3”). */
export const CPRED_VEHICLE_UPGRADE_PRICE_SCALE = 3;

/** Pasmo ceny i poziom sklepu ulepszenia: Moto 1 — Bardzo kosztowne, reszta — Luksusowe. */
function upgradeBand(definition: CpredVehicleUpgradeDefinition): {
  costCategory: CostCategory;
  bookPrice: number;
  tier: ShopTier;
} {
  return definition.motoLevel <= 1
    ? { costCategory: 'veryExpensive', bookPrice: 1000, tier: 3 }
    : { costCategory: 'luxury', bookPrice: 5000, tier: 4 };
}

/** `armoredHull` → `vehicle-upgrade.armored-hull`. */
export function cpredVehicleUpgradeEntryId(upgradeId: CpredVehicleUpgradeId): string {
  return `vehicle-upgrade.${upgradeId.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

/** Wpis kompendium ulepszenia — nazwa i opis z naszego streszczenia, cena z pasma × 3. */
export function cpredVehicleUpgradeEntry(
  definition: CpredVehicleUpgradeDefinition,
): VehicleUpgradeEntry {
  const band = upgradeBand(definition);
  return {
    id: cpredVehicleUpgradeEntryId(definition.id),
    category: 'vehicleUpgrade',
    upgradeId: definition.id,
    name: definition.name,
    description: definition.text,
    cost: band.bookPrice * CPRED_VEHICLE_UPGRADE_PRICE_SCALE,
    costCategory: band.costCategory,
    tier: band.tier,
    source: `Podręcznik, s. ${definition.page} — cena pasma × ${CPRED_VEHICLE_UPGRADE_PRICE_SCALE} (zasada domowa)`,
  };
}

/** Wszystkie ulepszenia z s. 163–165 jako wpisy kompendium. */
export function cpredVehicleUpgradeEntries(): VehicleUpgradeEntry[] {
  return CPRED_VEHICLE_UPGRADES.map(cpredVehicleUpgradeEntry);
}

/**
 * Ulepszenia dopisane do katalogu — **po** cenniku domowym (cena jest już
 * w ed stołu). Wpis o tym samym id, który katalog już ma (plik grupy), wygrywa.
 */
export function withVehicleUpgradeEntries(registry: CompendiumRegistry): CompendiumRegistry {
  const added = cpredVehicleUpgradeEntries().filter((entry) => !registry.entryById.has(entry.id));
  if (added.length === 0) return registry;
  const entries = [...registry.entries, ...added];
  return { ...registry, entries, entryById: new Map(entries.map((entry) => [entry.id, entry])) };
}

/** Ulepszenie, które gracz może kupić: wpis z ceną. */
export function cpredVehicleUpgradeForSale(entry: CompendiumEntry): entry is VehicleUpgradeEntry {
  return entry.category === 'vehicleUpgrade' && entry.cost !== null && entry.cost > 0;
}

// ───────────────────────── Montaż w kupionym aucie ─────────────────────────

export type CpredVehicleUpgradeBuyProblem = CpredVehicleUpgradeProblem | 'VEHICLE_IN_FLEET';

export const CPRED_VEHICLE_UPGRADE_BUY_PROBLEMS: Record<CpredVehicleUpgradeBuyProblem, string> = {
  ...CPRED_VEHICLE_UPGRADE_PROBLEMS,
  VEHICLE_IN_FLEET: 'Auto z Taboru Rodziny ulepsza się za poziom Moto, nie w warsztacie.',
};

/**
 * Czy to ulepszenie da się kupić do tego auta: nie do auta z Taboru (decyzja
 * MG z 06.11), a dalej te same reguły montażu co w oknie MG i w Taborze
 * (rodzaj pojazdu, „tylko raz”, Wzmocniona konstrukcja).
 */
export function cpredVehicleUpgradeBuyProblem(
  stats: Pick<CpredVehicleStats, 'kind' | 'upgrades' | 'fleetRowId'>,
  upgradeId: CpredVehicleUpgradeId,
): CpredVehicleUpgradeBuyProblem | null {
  if (stats.fleetRowId) return 'VEHICLE_IN_FLEET';
  return cpredVehicleUpgradeProblem(stats.kind, stats.upgrades, upgradeId);
}

// ───────────────────────── Naprawa w warsztacie ─────────────────────────

/** Cena naprawy za każdy brakujący PUK kadłuba — decyzja MG z 06.11.2026. */
export const CPRED_VEHICLE_REPAIR_PER_HP = 50;

/** Stopień uszkodzeń z „Naprawy pojazdów” (s. 147). */
export type CpredVehicleDamage = 'light' | 'serious' | 'wrecked';

export const CPRED_VEHICLE_DAMAGE: Record<
  CpredVehicleDamage,
  { label: string; dv: number; time: string }
> = {
  light: { label: 'Lekkie uszkodzenia', dv: 9, time: '3 godziny' },
  serious: { label: 'Poważne uszkodzenia', dv: 13, time: '1 dzień' },
  wrecked: { label: 'Zniszczony', dv: 17, time: '1 tydzień' },
};

/**
 * Stopień uszkodzeń auta. Podręcznik nie mówi, gdzie kończą się „lekkie” —
 * zasada domowa (06.11): wrak to PUK 0, poważne — połowa PUK albo mniej,
 * lekkie — reszta (także same szyby).
 */
export function cpredVehicleDamage(
  stats: Pick<CpredVehicleStats, 'hp' | 'hpMax' | 'seats' | 'upgrades'>,
): CpredVehicleDamage {
  if (stats.hp <= 0) return 'wrecked';
  return stats.hp * 2 <= cpredVehicleDerived(stats).hpMax ? 'serious' : 'light';
}

export interface CpredVehicleRepairQuote {
  /** Brakujące PUK kadłuba (do sufitu z ulepszeniami). */
  missingHp: number;
  /** Burty z utłuczoną szybą kuloodporną. */
  windows: number;
  damage: CpredVehicleDamage;
  /** Cena przed targiem: katalogu albo lady (z mnożnikiem handlarza). */
  listed: number;
  price: number;
}

/**
 * Cena naprawy — **jedna** funkcja dla przycisku i serwera; `null` — auto
 * jest całe. 50 ed za brakujący PUK, szyby w cenie, a same szyby kosztują
 * jak jeden PUK. `priceMul` (procent) — mnożnik handlarza jak przy ladzie,
 * `discount` — targ Fixera (jak `cpredVehicleQuote`).
 */
export function cpredVehicleRepairQuote(
  stats: CpredVehicleStats,
  options: { priceMul?: number; discount?: number } = {},
): CpredVehicleRepairQuote | null {
  const missingHp = Math.max(0, cpredVehicleDerived(stats).hpMax - stats.hp);
  const windows = Object.keys(stats.windows).length;
  if (missingHp === 0 && windows === 0) return null;
  const catalog = CPRED_VEHICLE_REPAIR_PER_HP * Math.max(1, missingHp);
  const listed =
    options.priceMul === undefined ? catalog : Math.round((catalog * options.priceMul) / 100);
  return {
    missingHp,
    windows,
    damage: cpredVehicleDamage(stats),
    listed,
    price: cpredHaggledPrice(listed, options.discount ?? 0),
  };
}

/** Auto po naprawie: pełne PUK (z ulepszeniami) i całe szyby. */
export function cpredVehicleRepaired(stats: CpredVehicleStats): CpredVehicleStats {
  return readCpredVehicle({ ...stats, hp: cpredVehicleDerived(stats).hpMax, windows: {} });
}
