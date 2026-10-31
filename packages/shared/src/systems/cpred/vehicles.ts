import { VEHICLE_WINDOW_SIDES, isVehicleWindowSide, type VehicleWindowSide } from '../../chase.js';
import {
  VEHICLE_BODY_SIZES,
  vehicleBodyFor,
  vehicleLayoutFor,
  type VehicleBody,
  type VehicleLayoutId,
} from '../../vehicles.js';
import type { VehicleEntry } from './compendium.js';
import type { CpredFleetRow } from './roleability.js';
import { cpredActionBlock } from './statuses.js';
import { hasRequiredCyberware } from './attachments.js';

/**
 * Pojazdy CP RED (etap 65a, s. 189–192 i ulepszenia Moto s. 163–165).
 *
 * Tu mieszkają liczby, które rdzeń trzyma w `Vehicle.system` jako JSON: PUK,
 * fotele, Ruch bitewny, rodzaj i lista ulepszeń. Katalog pojazdów z podręcznika
 * jest w kompendium (`VehicleEntry`, dane w `data/private`), a tu tylko schemat,
 * odczyt, walidacja i rachunek ulepszeń.
 *
 * **Rodzaje są drobniejsze niż w tabelach podręcznika** (lądowe / wodne /
 * powietrzne), bo tak dzielą je ulepszenia: „prócz motocykli, skuterów wodnych
 * i żyrokopterów”, „lądowe i wodne z wyjątkiem motocykli i skuterów wodnych”.
 */

export const CPRED_VEHICLE_KINDS = [
  'motorcycle',
  'car',
  'jetski',
  'boat',
  'gyro',
  'aircraft',
] as const;
export type CpredVehicleKind = (typeof CPRED_VEHICLE_KINDS)[number];

export const CPRED_VEHICLE_KIND_LABELS: Record<CpredVehicleKind, string> = {
  motorcycle: 'Motocykl',
  car: 'Samochód',
  jetski: 'Skuter wodny',
  boat: 'Łódź',
  gyro: 'Żyrokopter',
  aircraft: 'Statek powietrzny',
};

export function isCpredVehicleKind(value: unknown): value is CpredVehicleKind {
  return (CPRED_VEHICLE_KINDS as readonly unknown[]).includes(value);
}

const LAND: readonly CpredVehicleKind[] = ['motorcycle', 'car'];
const WATER: readonly CpredVehicleKind[] = ['jetski', 'boat'];
const AIR: readonly CpredVehicleKind[] = ['gyro', 'aircraft'];
/** „Motocykle, skutery wodne i żyrokoptery” — małe pojazdy z listy wyjątków s. 163–164. */
const SMALL: readonly CpredVehicleKind[] = ['motorcycle', 'jetski', 'gyro'];

export function cpredVehicleIsSmall(kind: CpredVehicleKind): boolean {
  return SMALL.includes(kind);
}

/** Umiejętność kierowcy: Prowadzenie, Żeglowanie albo Pilotaż (s. 192). */
export function cpredVehicleSkillId(kind: CpredVehicleKind): string {
  if (WATER.includes(kind)) return 'pilot-sea-vehicle';
  if (AIR.includes(kind)) return 'pilot-air-vehicle';
  return 'driving';
}

/** Bryła rdzenia dla rodzaju i liczby foteli. */
export function cpredVehicleBody(kind: CpredVehicleKind, seats: number): VehicleBody {
  return vehicleBodyFor(kind === 'motorcycle' || kind === 'jetski', seats);
}

// ───────────────────────── Ulepszenia (s. 163–165) ─────────────────────────

export const CPRED_VEHICLE_UPGRADE_IDS = [
  'armoredHull',
  'bulletproofGlass',
  'commCenter',
  'nitro',
  'flamethrower',
  'machineGun',
  'extraSeats',
  'security',
  'smuggling',
  'reinforced',
  'rocketPod',
  'heavyMount',
  'meleeMount',
  'hovercraft',
  'avEngines',
  'ram',
  'interfaceLink',
  'spikes',
  'quarters',
] as const;
export type CpredVehicleUpgradeId = (typeof CPRED_VEHICLE_UPGRADE_IDS)[number];

/**
 * Ile razy ulepszenie wolno zamontować. `small-once` — kilka razy, ale
 * w motocyklu, skuterze i żyrokopterze raz (Ulepszenie foteli, Skrytki).
 * `twice` — Szyby kuloodporne: drugie wybranie robi z cienkich grube.
 */
export type CpredVehicleUpgradeRepeat = 'once' | 'many' | 'small-once' | 'twice';

export interface CpredVehicleUpgradeDefinition {
  id: CpredVehicleUpgradeId;
  name: string;
  /** Własne streszczenie zasady — pełny tekst stoi w podręczniku na `page`. */
  text: string;
  page: number;
  /** „Wymagany Poziom Moto” — kategoria wpisu Taboru. */
  motoLevel: number;
  /** Czy walka pojazdów (65c–65e) liczy je sama; reszta to wiersz z opisem. */
  combat: boolean;
  repeat: CpredVehicleUpgradeRepeat;
  /** Rodzaje, w których wolno je zamontować. */
  kinds: readonly CpredVehicleKind[];
  /** „Wymaga wzmocnionej konstrukcji”. */
  requiresReinforced?: true;
}

const ALL = CPRED_VEHICLE_KINDS;
const NOT_SMALL = CPRED_VEHICLE_KINDS.filter((kind) => !SMALL.includes(kind));

export const CPRED_VEHICLE_UPGRADES: readonly CpredVehicleUpgradeDefinition[] = [
  {
    id: 'armoredHull',
    name: 'Opancerzenie kadłuba',
    text: 'Kadłub dostaje OB 13. Szyby zostają bez ochrony.',
    page: 163,
    motoLevel: 5,
    combat: true,
    repeat: 'once',
    kinds: ALL,
  },
  {
    id: 'bulletproofGlass',
    name: 'Szyby kuloodporne',
    text: 'Szyby stają się osłoną: cienkie 15 PW, po drugim wybraniu grube 30 PW. Każde okno przyjmuje obrażenia osobno.',
    page: 163,
    motoLevel: 1,
    combat: true,
    repeat: 'twice',
    kinds: ALL,
  },
  {
    id: 'commCenter',
    name: 'Centrum komunikacji',
    text: 'Panel z Agentem i miejscem na radiokomunikatory, kodery, odbiornik lokalizatora i rejestrator.',
    page: 163,
    motoLevel: 1,
    combat: false,
    repeat: 'once',
    kinds: ALL,
  },
  {
    id: 'nitro',
    name: 'Nitro',
    text: 'Kierowca za Akcję wykonuje dodatkowy Ruch. Zbiornik raz dziennie; kolejne wybranie to kolejny zbiornik.',
    page: 163,
    motoLevel: 1,
    combat: true,
    repeat: 'many',
    kinds: ALL,
  },
  {
    id: 'flamethrower',
    name: 'Pokładowy miotacz ognia',
    text: 'Miotacz na zewnątrz pojazdu; kierowca strzela za Akcję, nie przeładuje w jeździe.',
    page: 163,
    motoLevel: 1,
    combat: true,
    repeat: 'many',
    kinds: ALL,
  },
  {
    id: 'machineGun',
    name: 'Pokładowy karabin maszynowy',
    text: 'Karabin szturmowy z przodu, 30 pocisków, wyłącznie Ogień ciągły; kierowca strzela za Akcję.',
    page: 163,
    motoLevel: 1,
    combat: true,
    repeat: 'many',
    kinds: ALL,
  },
  {
    id: 'extraSeats',
    name: 'Ulepszenie foteli',
    text: 'Dwa fotele więcej (w motocyklu — kosz). W motocyklu, skuterze i żyrokopterze tylko raz.',
    page: 163,
    motoLevel: 1,
    combat: true,
    repeat: 'small-once',
    kinds: ALL,
  },
  {
    id: 'security',
    name: 'Systemy bezpieczeństwa',
    text: 'Zamki biometryczne (PT 17) z wstrząsem dla intruza i maskowanie stojącego pojazdu (Percepcja PT 17).',
    page: 163,
    motoLevel: 5,
    combat: false,
    repeat: 'once',
    kinds: ALL,
  },
  {
    id: 'smuggling',
    name: 'Skrytki przemytnicze',
    text: 'Dwie ukryte kabury dla kierowcy i pasażera oraz duża skrytka (znalezienie PT 17).',
    page: 163,
    motoLevel: 1,
    combat: false,
    repeat: 'small-once',
    kinds: ALL,
  },
  {
    id: 'reinforced',
    name: 'Wzmocniona konstrukcja',
    text: '+20 PUK (bez szyb) i hol do 10 ton; podstawa pod ciężkie ulepszenia.',
    page: 164,
    motoLevel: 1,
    combat: true,
    repeat: 'once',
    kinds: NOT_SMALL,
  },
  {
    id: 'rocketPod',
    name: 'Pokładowa wyrzutnia rakiet',
    text: 'Zasobnik z trzema rakietami z przodu; kierowca strzela za Akcję, nie przeładuje w jeździe.',
    page: 164,
    motoLevel: 5,
    combat: true,
    repeat: 'many',
    kinds: NOT_SMALL,
    requiresReinforced: true,
  },
  {
    id: 'heavyMount',
    name: 'Stanowisko bardzo ciężkiej broni',
    text: 'Fotel z obrotowym stanowiskiem na dwuręczną broń dystansową — strzela pasażer, przeładowuje i w jeździe.',
    page: 164,
    motoLevel: 5,
    combat: true,
    repeat: 'once',
    kinds: NOT_SMALL,
    requiresReinforced: true,
  },
  {
    id: 'meleeMount',
    name: 'Pokładowa broń biała',
    text: 'Bardzo duża broń biała na zewnątrz pojazdu; kierowca atakuje za Akcję.',
    page: 164,
    motoLevel: 1,
    combat: true,
    repeat: 'many',
    kinds: [...LAND, ...WATER],
  },
  {
    id: 'hovercraft',
    name: 'Poduszkowiec',
    text: 'Śmigła w podwoziu — pojazd ślizga się po wodzie z prędkością łodzi kabinowej.',
    page: 164,
    motoLevel: 5,
    combat: false,
    repeat: 'once',
    kinds: LAND,
  },
  {
    id: 'avEngines',
    name: 'Silniki AV-4',
    text: 'Pojazd lata jak AV-4; w powietrzu prowadzi się go Pilotażem.',
    page: 164,
    motoLevel: 7,
    combat: false,
    repeat: 'once',
    kinds: LAND,
  },
  {
    id: 'ram',
    name: 'Pług bojowy',
    text: 'Taranując przodem, pojazd nie odnosi obrażeń, a jadący — Rany Krytycznej; z Nitro uderzony dostaje +2k6.',
    page: 164,
    motoLevel: 1,
    combat: true,
    repeat: 'once',
    kinds: ['car', 'boat'],
  },
  {
    id: 'interfaceLink',
    name: 'Ulepszone zespolenie ze złączem interfejsu',
    text: 'Kierowca ze złączem i REF 8+ unika ataków za siebie, pasażera i motocykl.',
    page: 165,
    motoLevel: 5,
    combat: true,
    repeat: 'once',
    kinds: ['motorcycle'],
  },
  {
    id: 'spikes',
    name: 'Wyrzutnia kolczatki drogowej',
    text: 'Kierowca za Akcję zrzuca kolczatkę: jadący z tyłu rzuca Prowadzenie PT 17 albo 4k6 w słaby punkt.',
    page: 165,
    motoLevel: 1,
    combat: true,
    repeat: 'many',
    kinds: ['car'],
  },
  {
    id: 'quarters',
    name: 'Zakwaterowanie',
    text: 'Łóżko, toaleta, prysznic i kuchnia (kombiwóz); w łodzi i aerozepie dodatkowe pomieszczenie. Kompakt i sportowy — po wzmocnionej konstrukcji.',
    page: 165,
    motoLevel: 1,
    combat: false,
    repeat: 'many',
    kinds: ['car', 'boat', 'aircraft'],
  },
];

const UPGRADE_BY_ID = new Map(CPRED_VEHICLE_UPGRADES.map((entry) => [entry.id, entry] as const));

export function cpredVehicleUpgrade(id: string): CpredVehicleUpgradeDefinition | null {
  return UPGRADE_BY_ID.get(id as CpredVehicleUpgradeId) ?? null;
}

/** Ulepszenia, które w ogóle pasują do pojazdu tego rodzaju (lista do wyboru). */
export function cpredVehicleUpgradesFor(kind: CpredVehicleKind): CpredVehicleUpgradeDefinition[] {
  return CPRED_VEHICLE_UPGRADES.filter((entry) => entry.kinds.includes(kind));
}

// ───────────────────────── Stan pojazdu (`Vehicle.system`) ─────────────────────────

export interface CpredVehicleUpgradeRow {
  id: string;
  upgradeId: CpredVehicleUpgradeId;
  /** Wiersz Taboru Rodziny, z którego to ulepszenie przyszło — zmienia go karta, nie MG. */
  fleetRowId?: string;
  notes: string;
}

export const CPRED_VEHICLE_SCHEMA_VERSION = 1;
export const CPRED_VEHICLE_HP_MAX = 2000;
export const CPRED_VEHICLE_SEATS_MAX = 40;
export const CPRED_VEHICLE_MOVE_MAX = 100;
export const CPRED_VEHICLE_UPGRADES_MAX = 40;
export const CPRED_VEHICLE_NOTES_MAX = 400;

export interface CpredVehicleStats {
  schemaVersion: number;
  kind: CpredVehicleKind;
  /** Wpis katalogu, z którego powstał; `null` — pojazd spoza katalogu. */
  catalogId: string | null;
  /** PUK bazowe (bez Wzmocnionej konstrukcji) i bieżące. */
  hpMax: number;
  hp: number;
  /** Fotele bazowe (bez Ulepszenia foteli). */
  seats: number;
  /** Szybkość bitewna — Cecha Ruch pojazdu. */
  move: number;
  upgrades: CpredVehicleUpgradeRow[];
  /** Wiersz Taboru Rodziny, którym ten pojazd jest; `null` — pojazd spoza Taboru. */
  fleetRowId: string | null;
  notes: string;
  /**
   * Bieżące PW szyb kuloodpornych na każdej burcie (65d) — tylko te, które
   * oberwały; brak burty znaczy pełne PW (`cpredVehicleWindows`).
   */
  windows: Partial<Record<VehicleWindowSide, number>>;
  /**
   * Naboje w magazynkach broni pokładowych (65d2) — po id wiersza ulepszenia;
   * brak wpisu znaczy pełny magazynek (`cpredMountWeaponRows`).
   */
  mountAmmo: Record<string, number>;
}

/** Gdy katalogu nie ma (próbka, plik bez wpisu): kompakt z tabeli s. 190. */
export const CPRED_VEHICLE_FALLBACK = { kind: 'car', hpMax: 50, seats: 4, move: 20 } as const;

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.round(raw)));
}

function readUpgradeRows(raw: unknown): CpredVehicleUpgradeRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: CpredVehicleUpgradeRow[] = [];
  const seen = new Set<string>();
  for (const entry of raw.slice(0, CPRED_VEHICLE_UPGRADES_MAX)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === 'string' && row.id.length > 0 ? row.id.slice(0, 40) : null;
    const upgrade = typeof row.upgradeId === 'string' ? cpredVehicleUpgrade(row.upgradeId) : null;
    if (!id || !upgrade || seen.has(id)) continue;
    seen.add(id);
    rows.push({
      id,
      upgradeId: upgrade.id,
      ...(typeof row.fleetRowId === 'string' && row.fleetRowId.length > 0
        ? { fleetRowId: row.fleetRowId }
        : {}),
      notes: typeof row.notes === 'string' ? row.notes.slice(0, CPRED_VEHICLE_NOTES_MAX) : '',
    });
  }
  return rows;
}

/** Odczyt `Vehicle.system` — wszystko, czego brak albo co jest zepsute, dostaje wartość domyślną. */
export function readCpredVehicle(raw: unknown): CpredVehicleStats {
  const input =
    typeof raw === 'string'
      ? safeParse(raw)
      : typeof raw === 'object' && raw !== null
        ? (raw as Record<string, unknown>)
        : {};
  const kind = isCpredVehicleKind(input.kind) ? input.kind : CPRED_VEHICLE_FALLBACK.kind;
  const hpMax = clampInt(input.hpMax, 1, CPRED_VEHICLE_HP_MAX, CPRED_VEHICLE_FALLBACK.hpMax);
  const stats: CpredVehicleStats = {
    schemaVersion: CPRED_VEHICLE_SCHEMA_VERSION,
    kind,
    catalogId: typeof input.catalogId === 'string' && input.catalogId ? input.catalogId : null,
    hpMax,
    hp: 0,
    seats: clampInt(input.seats, 1, CPRED_VEHICLE_SEATS_MAX, CPRED_VEHICLE_FALLBACK.seats),
    move: clampInt(input.move, 0, CPRED_VEHICLE_MOVE_MAX, CPRED_VEHICLE_FALLBACK.move),
    upgrades: readUpgradeRows(input.upgrades),
    fleetRowId: typeof input.fleetRowId === 'string' && input.fleetRowId ? input.fleetRowId : null,
    notes: typeof input.notes === 'string' ? input.notes.slice(0, CPRED_VEHICLE_NOTES_MAX) : '',
    windows: {},
    mountAmmo: {},
  };
  // Bieżące PUK liczy się od sufitu z ulepszeniami — Wzmocniona konstrukcja to +20.
  const derived = cpredVehicleDerived(stats);
  stats.hp = clampInt(input.hp, 0, derived.hpMax, derived.hpMax);
  stats.windows = readWindows(input.windows, derived.windowHp);
  stats.mountAmmo = readMountAmmo(input.mountAmmo, stats.upgrades);
  return stats;
}

function readMountAmmo(
  raw: unknown,
  upgrades: readonly CpredVehicleUpgradeRow[],
): Record<string, number> {
  if (typeof raw !== 'object' || raw === null) return {};
  const rows = new Set(upgrades.map((row) => row.id));
  const ammo: Record<string, number> = {};
  for (const [rowId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!rows.has(rowId) || typeof value !== 'number' || !Number.isFinite(value)) continue;
    ammo[rowId] = Math.max(0, Math.min(1000, Math.round(value)));
  }
  return ammo;
}

function readWindows(raw: unknown, max: number): Partial<Record<VehicleWindowSide, number>> {
  if (max <= 0 || typeof raw !== 'object' || raw === null) return {};
  const windows: Partial<Record<VehicleWindowSide, number>> = {};
  for (const [side, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isVehicleWindowSide(side)) continue;
    const hp = clampInt(value, 0, max, max);
    if (hp < max) windows[side] = hp;
  }
  return windows;
}

function safeParse(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Liczby, z którymi pojazd wjeżdża do walki — baza plus ulepszenia. */
export interface CpredVehicleDerived {
  hpMax: number;
  seats: number;
  /** OB kadłuba: 13 z Opancerzenia, inaczej 0 (s. 163). */
  hullSp: number;
  /** PW każdego okna: 0 (szyby nie są osłoną), 15 cienkie, 30 grube. */
  windowHp: number;
  nitroTanks: number;
  /** Ile sztuk każdego ulepszenia stoi w pojeździe. */
  counts: Partial<Record<CpredVehicleUpgradeId, number>>;
}

export const CPRED_VEHICLE_REINFORCED_HP = 20;
export const CPRED_VEHICLE_EXTRA_SEATS = 2;
export const CPRED_VEHICLE_ARMORED_HULL_SP = 13;
export const CPRED_VEHICLE_WINDOW_HP = [0, 15, 30] as const;

export function cpredVehicleUpgradeCounts(
  upgrades: readonly Pick<CpredVehicleUpgradeRow, 'upgradeId'>[],
): Partial<Record<CpredVehicleUpgradeId, number>> {
  const counts: Partial<Record<CpredVehicleUpgradeId, number>> = {};
  for (const row of upgrades) counts[row.upgradeId] = (counts[row.upgradeId] ?? 0) + 1;
  return counts;
}

export function cpredVehicleDerived(
  stats: Pick<CpredVehicleStats, 'hpMax' | 'seats' | 'upgrades'>,
): CpredVehicleDerived {
  const counts = cpredVehicleUpgradeCounts(stats.upgrades);
  const glass = Math.min(2, counts.bulletproofGlass ?? 0);
  return {
    hpMax: stats.hpMax + (counts.reinforced ? CPRED_VEHICLE_REINFORCED_HP : 0),
    seats: stats.seats + CPRED_VEHICLE_EXTRA_SEATS * (counts.extraSeats ?? 0),
    hullSp: counts.armoredHull ? CPRED_VEHICLE_ARMORED_HULL_SP : 0,
    windowHp: CPRED_VEHICLE_WINDOW_HP[glass] ?? 0,
    nitroTanks: counts.nitro ?? 0,
    counts,
  };
}

/** Układ foteli na mapie dla tego pojazdu — z foteli po ulepszeniach. */
export function cpredVehicleLayout(stats: CpredVehicleStats): VehicleLayoutId {
  const seats = cpredVehicleDerived(stats).seats;
  return vehicleLayoutFor(cpredVehicleBody(stats.kind, seats), seats);
}

/** Rozmiar bryły w kratkach dla tego pojazdu. */
export function cpredVehicleSize(stats: CpredVehicleStats): { widthSq: number; lengthSq: number } {
  const seats = cpredVehicleDerived(stats).seats;
  return { ...VEHICLE_BODY_SIZES[cpredVehicleBody(stats.kind, seats)] };
}

export type CpredVehicleUpgradeProblem =
  'UPGRADE_NOT_FOR_KIND' | 'UPGRADE_ONCE' | 'UPGRADE_NEEDS_REINFORCED';

export const CPRED_VEHICLE_UPGRADE_PROBLEMS: Record<CpredVehicleUpgradeProblem, string> = {
  UPGRADE_NOT_FOR_KIND: 'Tego ulepszenia nie montuje się w pojeździe tego rodzaju.',
  UPGRADE_ONCE: 'To ulepszenie stoi już w tym pojeździe tyle razy, ile wolno.',
  UPGRADE_NEEDS_REINFORCED: 'To ulepszenie wymaga Wzmocnionej konstrukcji.',
};

function repeatLimit(definition: CpredVehicleUpgradeDefinition, kind: CpredVehicleKind): number {
  switch (definition.repeat) {
    case 'once':
      return 1;
    case 'twice':
      return 2;
    case 'small-once':
      return cpredVehicleIsSmall(kind) ? 1 : Infinity;
    default:
      return Infinity;
  }
}

/**
 * Czy da się dołożyć to ulepszenie do pojazdu, który już ma `upgrades`.
 * „O ile nie napisano inaczej, dane ulepszenie można zamontować w pojeździe
 * tylko raz” (s. 163) — dlatego `once` jest domyślne, a wyjątki są nazwane.
 */
export function cpredVehicleUpgradeProblem(
  kind: CpredVehicleKind,
  upgrades: readonly Pick<CpredVehicleUpgradeRow, 'upgradeId'>[],
  upgradeId: CpredVehicleUpgradeId,
): CpredVehicleUpgradeProblem | null {
  const definition = UPGRADE_BY_ID.get(upgradeId);
  if (!definition || !definition.kinds.includes(kind)) return 'UPGRADE_NOT_FOR_KIND';
  const counts = cpredVehicleUpgradeCounts(upgrades);
  if ((counts[upgradeId] ?? 0) >= repeatLimit(definition, kind)) return 'UPGRADE_ONCE';
  if (definition.requiresReinforced && !counts.reinforced) return 'UPGRADE_NEEDS_REINFORCED';
  return null;
}

/** Cała lista po kolei: każdy wiersz sprawdzany względem wierszy przed nim. */
export function cpredVehicleUpgradesProblem(
  kind: CpredVehicleKind,
  upgrades: readonly Pick<CpredVehicleUpgradeRow, 'upgradeId'>[],
): CpredVehicleUpgradeProblem | null {
  // Wzmocniona konstrukcja liczy się dla całej listy — kolejność wierszy
  // nie ma znaczenia przy stole, więc nie może go mieć tutaj.
  const reinforced = upgrades.filter((row) => row.upgradeId === 'reinforced');
  const rest = upgrades.filter((row) => row.upgradeId !== 'reinforced');
  const placed: Pick<CpredVehicleUpgradeRow, 'upgradeId'>[] = [];
  for (const row of [...reinforced, ...rest]) {
    const problem = cpredVehicleUpgradeProblem(kind, placed, row.upgradeId);
    if (problem) return problem;
    placed.push(row);
  }
  return null;
}

/** Nowy pojazd z wpisu katalogu: pełne PUK, bez ulepszeń. */
export function cpredVehicleFromCatalog(
  entry: Pick<VehicleEntry, 'id' | 'vehicleKind' | 'hp' | 'seats' | 'move'> | null,
): CpredVehicleStats {
  const base = entry
    ? { kind: entry.vehicleKind, hpMax: entry.hp, seats: entry.seats, move: entry.move }
    : CPRED_VEHICLE_FALLBACK;
  return readCpredVehicle({ ...base, catalogId: entry?.id ?? null, hp: base.hpMax });
}

/**
 * Łata MG na liczby pojazdu (`vehicle:update`). Zwraca pełny nowy stan albo
 * kod odmowy — ulepszenia sprawdza ta sama funkcja, co Tabor Rodziny.
 * Wiersze ulepszeń z Taboru (`fleetRowId`) zostają takie, jakie są: zmienia je
 * karta Nomady, nie okno pojazdu.
 */
export function cpredVehiclePatch(
  current: CpredVehicleStats,
  raw: unknown,
): { ok: true; stats: CpredVehicleStats } | { ok: false; code: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, code: 'BAD_REQUEST' };
  const patch = raw as Record<string, unknown>;
  if ('kind' in patch && !isCpredVehicleKind(patch.kind)) return { ok: false, code: 'BAD_REQUEST' };
  for (const field of ['hp', 'hpMax', 'seats', 'move'] as const) {
    if (field in patch && (typeof patch[field] !== 'number' || !Number.isFinite(patch[field]))) {
      return { ok: false, code: 'BAD_REQUEST' };
    }
  }
  if ('upgrades' in patch && !Array.isArray(patch.upgrades)) {
    return { ok: false, code: 'BAD_REQUEST' };
  }
  const fromFleet = current.upgrades.filter((row) => row.fleetRowId);
  const own =
    'upgrades' in patch
      ? readUpgradeRows(patch.upgrades).filter((row) => !row.fleetRowId)
      : current.upgrades.filter((row) => !row.fleetRowId);
  const next = readCpredVehicle({
    ...current,
    ...('kind' in patch ? { kind: patch.kind } : {}),
    ...('hpMax' in patch ? { hpMax: patch.hpMax } : {}),
    ...('hp' in patch ? { hp: patch.hp } : {}),
    ...('seats' in patch ? { seats: patch.seats } : {}),
    ...('move' in patch ? { move: patch.move } : {}),
    ...('notes' in patch && typeof patch.notes === 'string' ? { notes: patch.notes } : {}),
    // Szyby (65d): MG wstawia nowe łatą `windows: {}` albo ustawia PW burty.
    ...('windows' in patch && typeof patch.windows === 'object' && patch.windows !== null
      ? { windows: patch.windows }
      : {}),
    upgrades: [...fromFleet, ...own],
  });
  const problem = cpredVehicleUpgradesProblem(next.kind, next.upgrades);
  if (problem) return { ok: false, code: problem };
  return { ok: true, stats: next };
}

// ───────────────────────── Tabor Rodziny ↔ pojazdy ─────────────────────────

/** Tylko to, czego potrzebuje dopasowanie — wpis katalogu albo jego zastępstwo w teście. */
type CatalogVehicle = Pick<VehicleEntry, 'id' | 'name' | 'vehicleKind' | 'motoLevel'>;

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Słowa, po których da się zgadnąć rodzaj, gdy nazwa wiersza nie jest nazwą z katalogu. */
const KIND_HINTS: readonly [RegExp, CpredVehicleKind][] = [
  [/skuter/, 'jetski'],
  [/zyrokopter/, 'gyro'],
  [/(motocykl|motor\b|scigacz)/, 'motorcycle'],
  [/(lodz|jacht|motorowk)/, 'boat'],
  [/(helikopter|aerozep|av-?\d|aerodyn|samolot)/, 'aircraft'],
];

export const CPRED_FLEET_COMPACT_ID = 'vehicle.samochod-kompaktowy';

/**
 * Pojazd dla starego wiersza „Pojazd” Taboru (sprzed 65a: sama nazwa i kategoria).
 * Najpierw nazwa z katalogu zawarta w nazwie wiersza (najdłuższa wygrywa —
 * „Supermotocykl” to nie „Motocykl”), potem rodzaj zgadnięty po słowie i pierwszy
 * pojazd tego rodzaju z kategorii wiersza, na końcu kompakt. `guessed` mówi, czy
 * MG powinien rzucić okiem.
 */
export function cpredGuessFleetVehicle<T extends CatalogVehicle>(
  rowName: string,
  rowLevel: number,
  catalog: readonly T[],
): { entry: T | null; kind: CpredVehicleKind; guessed: boolean } {
  const name = fold(rowName);
  const byName = catalog
    .filter((entry) => name.includes(fold(entry.name)))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (byName) return { entry: byName, kind: byName.vehicleKind, guessed: false };
  const hinted = KIND_HINTS.find(([pattern]) => pattern.test(name))?.[1];
  if (hinted) {
    const sameKind = catalog
      .filter((entry) => entry.vehicleKind === hinted && (entry.motoLevel ?? 1) <= rowLevel)
      .sort((a, b) => (b.motoLevel ?? 1) - (a.motoLevel ?? 1))[0];
    return { entry: sameKind ?? null, kind: hinted, guessed: true };
  }
  const compact = catalog.find((entry) => entry.id === CPRED_FLEET_COMPACT_ID) ?? null;
  return { entry: compact, kind: compact?.vehicleKind ?? 'car', guessed: true };
}

/**
 * Kategoria wiersza Taboru z tego, co wybrano: pojazd z katalogu stoi
 * w kategorii swojego progu (s. 162), ulepszenie — w swoim „Wymaganym Poziomie
 * Moto”. Wiersz dostaje wyższą z dwóch, więc istniejąca kontrola
 * `LEVEL_ABOVE_RANK` odmawia supersamochodu Nomadzie z Moto 4.
 */
export function cpredFleetRowLevel(
  row: CpredFleetRow,
  lookup: (compendiumId: string) => Pick<VehicleEntry, 'motoLevel'> | null,
): number {
  if (row.kind === 'vehicle' && row.compendiumId) {
    return Math.max(row.level, lookup(row.compendiumId)?.motoLevel ?? 1);
  }
  if (row.kind === 'upgrade' && row.upgradeId) {
    return Math.max(row.level, cpredVehicleUpgrade(row.upgradeId)?.motoLevel ?? 1);
  }
  return row.level;
}

// ───────────────────────── Pościg (etap 65c, s. 191–192) ─────────────────────────

/** PT Testu zwykłej jazdy (s. 192). */
export const CPRED_DRIVING_TEST_DV = 10;
/** „…jeśli suma REF i odpowiedniej Umiejętności prowadzenia jest większa od 9” (s. 192). */
export const CPRED_DRIVING_TEST_THRESHOLD = 9;
/** Wszczep, który zwalnia rękę z kierownicy (s. 191). */
export const CPRED_INTERFACE_PLUGS_NAME = 'Złącza interfejsu';

/**
 * Czy kierowca w każdej turze rzuca Test zwykłej jazdy: REF + Umiejętność
 * prowadzenia ≤ 9 (s. 192).
 */
export function cpredDrivingTestNeeded(ref: number, skill: number): boolean {
  return ref + skill <= CPRED_DRIVING_TEST_THRESHOLD;
}

/**
 * Liczby pojazdu w pościgu: kratki na Akcję Ruchu (`Ruch / 4`), dryf na rundę
 * i zbiorniki Nitro, które jeszcze zostały. Zgaszony silnik nie daje ruchu,
 * a droga zabiera auto w tył z pełnym tempem (decyzja MG 12).
 */
export function cpredVehicleChase(
  stats: CpredVehicleStats,
  chase: { tempo: number; started: boolean; nitroUsed: number },
): { moveSq: number; driftSq: number; nitroLeft: number } {
  // Wrak nie jedzie (65d1): droga zabiera go w tył z pełnym tempem, jak zgaszone auto.
  const speed = chase.started && !cpredVehicleWrecked(stats) ? stats.move : 0;
  return {
    moveSq: Math.max(0, speed) / 4,
    driftSq: (Math.max(0, speed) - Math.max(0, chase.tempo)) / 4,
    nitroLeft: Math.max(0, cpredVehicleDerived(stats).nitroTanks - chase.nitroUsed),
  };
}

/**
 * Czy kierowca z tymi stanami panuje nad autem: Nieprzytomny, Martwy
 * i Śmiertelnie Ranny nie prowadzą (65c) — auto jedzie bez kontroli, dopóki
 * ktoś się nie przesiądzie.
 */
export function cpredDriverIncapable(statuses: readonly string[]): boolean {
  return statuses.includes('mortally-wounded') || cpredActionBlock(statuses) !== null;
}

// ───────────────────────── Walka pojazdów (etap 65d1, s. 191) ─────────────────────────

/** „Atak … wykonuje się go z modyfikatorem −8” — Celowanie w słaby punkt (s. 191). */
export const CPRED_VEHICLE_WEAK_SPOT_PENALTY = -8;
/** „…obrażenia, które przejdą przez OB pancerza, mnoży się ×2” (s. 191). */
export const CPRED_VEHICLE_WEAK_SPOT_MULTIPLIER = 2;
/** „…jeśli pojazd porusza się, trafienie atakiem bronią białą w słaby punkt ma PT 13” (s. 191). */
export const CPRED_VEHICLE_MOVING_MELEE_DV = 13;
export const CPRED_VEHICLE_WEAK_SPOT_LABEL = 'Słaby punkt pojazdu';
/** Ulepszone zespolenie: kierowca z REF 8+ unika za siebie, pasażera i motocykl (s. 165). */
export const CPRED_INTERFACE_LINK_MIN_REF = 8;

/** Szyby każdej burty z bieżącymi PW; `null`, gdy szyby nie są osłoną (bez kuloodpornych). */
export function cpredVehicleWindows(
  stats: CpredVehicleStats,
): Record<VehicleWindowSide, { hp: number; max: number }> | null {
  const max = cpredVehicleDerived(stats).windowHp;
  if (max <= 0) return null;
  const windows = {} as Record<VehicleWindowSide, { hp: number; max: number }>;
  for (const side of VEHICLE_WINDOW_SIDES) {
    windows[side] = { hp: Math.min(max, stats.windows[side] ?? max), max };
  }
  return windows;
}

/** Czy pojazd jest wrakiem: „Gdy PUK spadną do zera, pojazd uznaje się za Zniszczony” (s. 191). */
export function cpredVehicleWrecked(stats: Pick<CpredVehicleStats, 'hp'>): boolean {
  return stats.hp <= 0;
}

export interface CpredVehicleHit {
  /** Co pokazały kości (z mnożnikiem ognia ciągłego). */
  damage: number;
  /** Trafienie w słaby punkt: obrażenia po OB ×2. */
  weakSpot?: boolean;
  /** Broń biała „ignoruje połowę OB” (s. 176) — także kadłuba. */
  halvesArmor?: boolean;
  /** OB barier na linii strzału (42b), odejmowane przed kadłubem. */
  barrierSp?: number;
}

export interface CpredVehicleHitResult {
  hpBefore: number;
  hpAfter: number;
  /** OB kadłuba, które zadziałało w tym trafieniu (po połowie dla broni białej). */
  armorSp: number;
  /** Ile przeszło przez OB — przed mnożnikiem słabego punktu. */
  through: number;
  /** Ile zeszło z PUK. */
  lost: number;
  wrecked: boolean;
}

/**
 * Trafienie w kadłub (s. 191): obrażenia minus OB barier i kadłuba, ×2 przy
 * słabym punkcie, z PUK do zera — nadwyżka przepada jak przy osłonie (s. 179).
 * OB kadłuba się nie zdziera: podręcznik mówi o ablacji pancerza postaci,
 * pojazdu — nie (rozstrzygnięcie 65d1).
 */
export function cpredVehicleHit(
  stats: Pick<CpredVehicleStats, 'hp' | 'hpMax' | 'seats' | 'upgrades'>,
  hit: CpredVehicleHit,
): CpredVehicleHitResult {
  const hull = cpredVehicleDerived(stats).hullSp;
  const armorSp = hit.halvesArmor ? Math.ceil(hull / 2) : hull;
  const afterBarrier = Math.max(0, Math.round(hit.damage) - Math.max(0, hit.barrierSp ?? 0));
  const through = Math.max(0, afterBarrier - armorSp);
  const dealt = hit.weakSpot ? through * CPRED_VEHICLE_WEAK_SPOT_MULTIPLIER : through;
  const hpAfter = Math.max(0, stats.hp - dealt);
  return {
    hpBefore: stats.hp,
    hpAfter,
    armorSp,
    through,
    lost: stats.hp - hpAfter,
    wrecked: hpAfter <= 0,
  };
}

/**
 * Trafienie w szybę kuloodporną burty: jak w osłonę — PW w dół, nadwyżka
 * przepada (s. 179). Zwraca nowe PW tej burty.
 */
export function cpredVehicleWindowHit(
  current: number,
  damage: number,
  barrierSp = 0,
): { hpBefore: number; hpAfter: number } {
  const dealt = Math.max(0, Math.round(damage) - Math.max(0, barrierSp));
  return { hpBefore: current, hpAfter: Math.max(0, current - dealt) };
}

/**
 * Ulepszone zespolenie ze złączem interfejsu (s. 165): motocykl z tym
 * ulepszeniem i kierowca ze Złączami interfejsu oraz REF 8+ — wtedy kierowca
 * unika ataków wymierzonych w motocykl i w pasażera.
 */
export function cpredInterfaceLinkDodges(
  stats: Pick<CpredVehicleStats, 'kind' | 'upgrades'>,
  driver: { ref: number; cyberware: readonly string[] },
): boolean {
  if (stats.kind !== 'motorcycle') return false;
  if (!(
    cpredVehicleDerived({ hpMax: 1, seats: 1, upgrades: stats.upgrades }).counts.interfaceLink ?? 0
  )) {
    return false;
  }
  return (
    driver.ref >= CPRED_INTERFACE_LINK_MIN_REF &&
    hasRequiredCyberware([CPRED_INTERFACE_PLUGS_NAME], driver.cyberware)
  );
}

/** Nazwy ulepszeń pojazdu po kolei — panel auta. */
export function cpredVehicleUpgradeNames(stats: Pick<CpredVehicleStats, 'upgrades'>): string[] {
  return stats.upgrades.map((row) => cpredVehicleUpgrade(row.upgradeId)?.name ?? row.upgradeId);
}
