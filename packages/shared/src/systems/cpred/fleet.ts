import { MINUTES_PER_DAY } from '../../gametime.js';
import type { VehicleEntry } from './compendium.js';
import { CPRED_MOTO_ELDER_LEVEL } from './roleability.js';
import type { CpredVehicleStats } from './vehicles.js';

/**
 * Tabor Rodziny po bramce 71 (etap 71c1, s. 161–164) — to, co etap 30d i 65a
 * zostawiły zdaniem w panelu Moto. Osobny moduł obok `roleability.ts` (umowa
 * etapu 71). Stan siedzi na **pojeździe** (`CpredVehicleStats`): które auto
 * jest w użyciu, które przyjedzie rano, które stoi u Rodziny w naprawie.
 */

/**
 * G38 (NOM-06): do Taboru wchodzą wyłącznie pojazdy z tabeli s. 162 — wpisy
 * katalogu z progiem Moto (`motoLevel`). Karetka, radiowóz czy furgon służb
 * progu nie mają, więc w Taborze ich nie ma (do 71c1 liczyły się jako próg 1).
 */
export function cpredFleetVehicleEntry(entry: Pick<VehicleEntry, 'motoLevel'>): boolean {
  return entry.motoLevel !== undefined;
}

/** Auto należy do Taboru — z wiersza awansu albo dokupione przez Głowę Rodziny. */
export function cpredIsFleetVehicle(stats: Pick<CpredVehicleStats, 'fleetRowId' | 'fleetJoined'>) {
  return stats.fleetRowId !== null || stats.fleetJoined === true;
}

/** „Rodzina dokona całkowitej naprawy pojazdu, a prace zajmą tydzień” (s. 162). */
export const CPRED_MOTO_FAMILY_REPAIR_MINUTES = 7 * MINUTES_PER_DAY;

/** Gdzie jest auto Taboru o danej minucie zegara świata. */
export type CpredFleetVehicleState = 'family' | 'arriving' | 'inUse' | 'idle';

export const CPRED_FLEET_STATE_LABELS: Record<CpredFleetVehicleState, string> = {
  family: 'U Rodziny',
  arriving: 'Przyjedzie rano',
  inUse: 'W użyciu',
  idle: 'U Rodziny',
};

export function cpredFleetVehicleState(
  stats: Pick<CpredVehicleStats, 'inUseFrom' | 'inUseUntil' | 'familyRepairUntil'>,
  now: number,
): CpredFleetVehicleState {
  if (stats.familyRepairUntil !== undefined && now < stats.familyRepairUntil) return 'family';
  if (stats.inUseFrom === undefined) return 'idle';
  if (now < stats.inUseFrom) return 'arriving';
  if (stats.inUseUntil !== undefined && now >= stats.inUseUntil) return 'idle';
  return 'inUse';
}

/** Zmiana pól użycia jednego auta (`null` — zdjąć pole). */
export interface CpredFleetUsePatch {
  inUseFrom?: number | null;
  inUseUntil?: number | null;
}

export type CpredFleetUseProblem = 'NOT_FLEET' | 'AT_FAMILY' | 'ELDER_USES_ALL' | 'ALREADY_IN_USE';

export const CPRED_FLEET_USE_PROBLEMS: Record<CpredFleetUseProblem, string> = {
  NOT_FLEET: 'To auto nie należy do Taboru Rodziny.',
  AT_FAMILY: 'To auto stoi u Rodziny w naprawie.',
  ELDER_USES_ALL: 'Głowa Rodziny (Moto 10) używa całego Taboru naraz — nie ma czego wymieniać.',
  ALREADY_IN_USE: 'To auto już jest przy tobie albo właśnie jedzie.',
};

/**
 * G6 (NOM-08): „naraz może używać tylko jednego pojazdu z Taboru; wymieniony
 * przyjedzie następnego ranka” (s. 162, parafraza). Pierwsze auto jest
 * w użyciu od razu; wybór innego, gdy któreś już jest przy Nomadzie, każe mu
 * przyjechać rano (`nextMorning`), a stare zostaje do tej chwili. Wybranie
 * starego z powrotem, zanim wymiana przyjechała, odwołuje ją.
 *
 * Zwraca łaty pól dla każdego auta, które się zmienia.
 */
export function cpredFleetUsePlan(
  fleet: readonly { id: string; stats: CpredVehicleStats }[],
  targetId: string,
  now: number,
  nextMorning: number,
  motoRank: number,
):
  | { ok: true; patches: Map<string, CpredFleetUsePatch> }
  | { ok: false; error: CpredFleetUseProblem } {
  const target = fleet.find((row) => row.id === targetId);
  if (!target || !cpredIsFleetVehicle(target.stats)) return { ok: false, error: 'NOT_FLEET' };
  if (motoRank >= CPRED_MOTO_ELDER_LEVEL) return { ok: false, error: 'ELDER_USES_ALL' };
  const state = (row: { stats: CpredVehicleStats }) => cpredFleetVehicleState(row.stats, now);
  if (state(target) === 'family') return { ok: false, error: 'AT_FAMILY' };
  if (state(target) === 'arriving') return { ok: false, error: 'ALREADY_IN_USE' };

  const patches = new Map<string, CpredFleetUsePatch>();
  const arriving = fleet.filter((row) => row.id !== targetId && state(row) === 'arriving');
  const current = fleet.find((row) => row.id !== targetId && state(row) === 'inUse');

  if (state(target) === 'inUse') {
    // Stare auto zostaje: wymiana w drodze zawraca.
    if (target.stats.inUseUntil === undefined && arriving.length === 0) {
      return { ok: false, error: 'ALREADY_IN_USE' };
    }
    patches.set(target.id, { inUseUntil: null });
    for (const row of arriving) patches.set(row.id, { inUseFrom: null, inUseUntil: null });
    return { ok: true, patches };
  }
  for (const row of arriving) patches.set(row.id, { inUseFrom: null, inUseUntil: null });
  if (!current) {
    patches.set(target.id, { inUseFrom: now, inUseUntil: null });
    return { ok: true, patches };
  }
  patches.set(current.id, { inUseUntil: nextMorning });
  patches.set(target.id, { inUseFrom: nextMorning, inUseUntil: null });
  return { ok: true, patches };
}

/** Pola auta po łacie użycia — `null` zdejmuje pole. */
export function cpredWithFleetUse(
  stats: CpredVehicleStats,
  patch: CpredFleetUsePatch,
): CpredVehicleStats {
  const next: CpredVehicleStats = { ...stats };
  for (const key of ['inUseFrom', 'inUseUntil'] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

export type CpredFamilyRepairProblem = 'NOT_FLEET' | 'NOT_WRECKED' | 'AT_FAMILY';

export const CPRED_FAMILY_REPAIR_PROBLEMS: Record<CpredFamilyRepairProblem, string> = {
  NOT_FLEET: 'Rodzina naprawia tylko auta swojego Taboru.',
  NOT_WRECKED:
    'Rodzina bierze do naprawy auto zniszczone; zwykłe naprawy to obowiązek Nomady (s. 162).',
  AT_FAMILY: 'To auto już stoi u Rodziny w naprawie.',
};

/**
 * G7 (NOM-09): zniszczone auto Taboru Rodzina naprawia tydzień, a Nomada
 * płaci za to 500 ed (s. 162). Zwykłe naprawy są jego sprawą — dlatego tylko wrak.
 */
export function cpredFamilyRepairProblem(
  stats: CpredVehicleStats,
  now: number,
): CpredFamilyRepairProblem | null {
  if (!cpredIsFleetVehicle(stats)) return 'NOT_FLEET';
  if (cpredFleetVehicleState(stats, now) === 'family') return 'AT_FAMILY';
  if (stats.hp > 0) return 'NOT_WRECKED';
  return null;
}

/**
 * G9 (NOM-14): przy pierwszym Stanowisku bardzo ciężkiej broni Rodzina daruje
 * jedną z trzech broni (s. 164). Id wpisów Kompendium z `weapons-base.json`.
 */
export const CPRED_FLEET_GIFT_WEAPON_IDS: readonly string[] = [
  'weapon.tsunami-arms-helix',
  'weapon.karabin-elektromagnetyczny-rhinemetall-emg-86',
  'weapon.granatnik-militech-cowboy-u-56',
];

export const CPRED_FLEET_GIFT_UPGRADE_ID = 'heavyMount';

export type CpredFleetGiftProblem = 'NO_HEAVY_MOUNT' | 'GIFT_TAKEN' | 'NOT_A_GIFT';

export const CPRED_FLEET_GIFT_PROBLEMS: Record<CpredFleetGiftProblem, string> = {
  NO_HEAVY_MOUNT:
    'Prezent od Rodziny przychodzi z pierwszym Stanowiskiem bardzo ciężkiej broni w aucie Taboru.',
  GIFT_TAKEN: 'Rodzina już podarowała broń — kolejne trzeba zdobyć samemu (s. 164).',
  NOT_A_GIFT: 'Rodzina daruje jedną z trzech broni z s. 164.',
};

export function cpredFleetGiftProblem(
  fleet: readonly CpredVehicleStats[],
  taken: string | null,
  entryId: string,
): CpredFleetGiftProblem | null {
  if (taken !== null) return 'GIFT_TAKEN';
  const mounted = fleet.some(
    (stats) =>
      cpredIsFleetVehicle(stats) &&
      stats.upgrades.some((row) => row.upgradeId === CPRED_FLEET_GIFT_UPGRADE_ID),
  );
  if (!mounted) return 'NO_HEAVY_MOUNT';
  if (!CPRED_FLEET_GIFT_WEAPON_IDS.includes(entryId)) return 'NOT_A_GIFT';
  return null;
}
