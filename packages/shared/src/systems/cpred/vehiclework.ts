import type { CpredItemUpgradeTargetView } from './fabrication.js';
import type { CpredRepairTarget, CpredWorkTask } from './repair.js';
import {
  CPRED_VEHICLE_DAMAGE,
  cpredVehicleRepairQuote,
  type CpredVehicleDamage,
} from './vehicle-upgrade-shop.js';
import {
  CPRED_VEHICLE_UPGRADE_PROBLEMS,
  cpredVehicleUpgrade,
  cpredVehicleUpgradeProblem,
  type CpredVehicleStats,
  type CpredVehicleUpgradeProblem,
} from './vehicles.js';

/**
 * Naprawa auta Testem i montaż ulepszenia auta przez Technika (etap 71c2) —
 * część `repair.ts`, która zna pojazdy. Osobno, bo `repair.ts` czyta planer
 * rzutu (`rolls.ts`), a pojazdy i warsztat ciągną za sobą moduły, które same
 * sięgają po planer: wspólny plik zamykał cykl importów i `vehicle-upgrade-shop`
 * startował przed `vehicles` (ReferenceError przy starcie serwera, 15.11).
 */

/**
 * PT i czas naprawy pojazdu ze stopnia uszkodzeń (s. 147, „Naprawa pojazdów”;
 * stopień liczy `cpredVehicleDamage` — ta sama zasada domowa co warsztat
 * z etapu 68). `null` — auto jest całe.
 */
export function cpredVehicleRepairTask(
  stats: CpredVehicleStats,
): (CpredWorkTask & { damage: CpredVehicleDamage }) | null {
  const quote = cpredVehicleRepairQuote(stats);
  if (!quote) return null;
  const row = CPRED_VEHICLE_DAMAGE[quote.damage];
  return { dv: row.dv, minutes: row.minutes, damage: quote.damage };
}

/** Dlaczego Technik nie zamontuje tego ulepszenia w tym aucie. */
export type CpredTechUpgradeProblem =
  | CpredVehicleUpgradeProblem
  | 'UNKNOWN_UPGRADE'
  | 'NO_UPGRADE_SPECIALTY'
  | 'NOT_MOTO_ONE'
  | 'TECH_UPGRADE_USED';

export const CPRED_TECH_UPGRADE_PROBLEMS: Record<CpredTechUpgradeProblem, string> = {
  ...CPRED_VEHICLE_UPGRADE_PROBLEMS,
  UNKNOWN_UPGRADE: 'Nie ma takiego ulepszenia pojazdu.',
  NO_UPGRADE_SPECIALTY:
    'Ulepszenie montuje Technik z co najmniej 1 punktem w Specjalizacji Ulepszanie.',
  NOT_MOTO_ONE: 'Technik montuje tylko ulepszenia z progu Moto 1 (s. 148).',
  TECH_UPGRADE_USED:
    'To auto Technik już raz ulepszył — Ulepszaniem ulepsza się przedmiot tylko raz (s. 148).',
};

/**
 * Czy Technik z danym poziomem Ulepszania zamontuje to ulepszenie w tym aucie:
 * próg Moto 1 (s. 148), jeden montaż Technikiem na auto, potem te same reguły
 * montażu co w oknie MG i w Taborze. Auto z Taboru też — to Zdolność
 * Technika, nie zakup w warsztacie (decyzja 71c2).
 */
export function cpredTechVehicleUpgradeProblem(
  upgradeLevel: number,
  stats: Pick<CpredVehicleStats, 'kind' | 'upgrades'>,
  upgradeId: string,
): CpredTechUpgradeProblem | null {
  if (upgradeLevel < 1) return 'NO_UPGRADE_SPECIALTY';
  const upgrade = cpredVehicleUpgrade(upgradeId);
  if (!upgrade) return 'UNKNOWN_UPGRADE';
  if (upgrade.motoLevel > 1) return 'NOT_MOTO_ONE';
  if (stats.upgrades.some((row) => row.techUpgrade)) return 'TECH_UPGRADE_USED';
  return cpredVehicleUpgradeProblem(stats.kind, stats.upgrades, upgrade.id);
}

/** Ulepszenie, które ta karta mogłaby zamontować w aucie (tylko z Ulepszaniem ≥ 1). */
export interface CpredTechUpgradeOption {
  upgradeId: string;
  name: string;
  /** Surowce w ed — cena wpisu Kompendium kampanii (s. 148: ta sama kategoria). */
  cost: number;
  /** Czemu nie, albo `null`. */
  problem: CpredTechUpgradeProblem | null;
}

/** Jedna rzecz drużyny, którą da się naprawić albo ulepszyć. */
export interface CpredRepairTargetView {
  target: CpredRepairTarget;
  /** Nazwa rzeczy — „Lekka kurtka kuloodporna”, „Osa”. */
  name: string;
  /** Czyja — imię postaci (nigdy konto gracza). */
  ownerName: string;
  /** Umiejętność, którą się ją naprawia. */
  skillId: string;
  /** „OB 7/11”, „Poważne uszkodzenia”, „cała”. */
  state: string;
  /** Warunki zwykłej naprawy; `null` — nie ma czego naprawiać. */
  repair: CpredWorkTask | null;
  /** Tylko auta i tylko dla karty z Ulepszaniem. */
  upgrades?: CpredTechUpgradeOption[];
}

export interface CpredRepairTargetsAck {
  targets: CpredRepairTargetView[];
  /** Rzeczy drużyny do Ulepszania Testem (etap 71d2) — tylko dla karty z Ulepszaniem. */
  items?: CpredItemUpgradeTargetView[];
}
