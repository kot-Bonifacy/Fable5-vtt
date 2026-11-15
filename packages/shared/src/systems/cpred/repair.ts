import type { CostCategory } from './compendium.js';
import type { CpredArmorRow } from './character.js';

/**
 * Naprawa przedmiotów (s. 140) i Prowizorka Technika (s. 147) — etap 71c0.
 *
 * Moduł obok `roleability.ts`, nie w nim (umowa etapu 71: doróbki klasy A–B
 * idą do osobnych plików). Mieszka tu to, czego potrzebuje Prowizorka (PT
 * „typowej naprawy takiej rzeczy” i stan łaty na wierszu pancerza), a od
 * etapu 71c2 także zwykła naprawa pancerza i auta Testem oraz montaż
 * ulepszenia auta przez Technika — z czasem pracy, który MG dostaje jako
 * propozycję przesunięcia zegara.
 */

/**
 * PT i czas naprawy przedmiotu według pasma ceny (s. 140, parafraza: od PT 9
 * i godziny dla Tanich i Codziennych do PT 29 i miesiąca dla Luksusowych).
 * Liczby są te same co w tabeli Ulepszania (`CPRED_FABRICATION_TASK`), ale to
 * osobna reguła podręcznika — trzymamy ją osobno, żeby zmiana jednej nie
 * przestawiła po cichu drugiej. Czas w minutach zegara świata (miesiąc = 30 dni).
 */
export const CPRED_REPAIR_TASK: Record<CostCategory, { dv: number; minutes: number }> = {
  cheap: { dv: 9, minutes: 60 },
  everyday: { dv: 9, minutes: 60 },
  costly: { dv: 13, minutes: 6 * 60 },
  premium: { dv: 17, minutes: 24 * 60 },
  expensive: { dv: 21, minutes: 7 * 24 * 60 },
  veryExpensive: { dv: 24, minutes: 14 * 24 * 60 },
  luxury: { dv: 29, minutes: 30 * 24 * 60 },
  superLuxury: { dv: 29, minutes: 30 * 24 * 60 },
};

/**
 * PT naprawy rzeczy bez pasma ceny — wiersz wpisany ręką, bez wpisu
 * Kompendium. „Codzienny” szczebel drabinki trudności (s. 129): MG, który
 * uważa inaczej, ma kartę rzutu z PT przed oczami (zasada domowa 71c0).
 */
export const CPRED_REPAIR_DV_UNKNOWN = 13;

/** PT naprawy przedmiotu z danego pasma albo domyślne, gdy pasma nie ma. */
export function cpredRepairDv(category: CostCategory | null | undefined): number {
  return category ? CPRED_REPAIR_TASK[category].dv : CPRED_REPAIR_DV_UNKNOWN;
}

/**
 * Umiejętność, którą naprawia się pancerz — Podstawowe naprawy (FAQ 1: „za
 * pomocą tej Umiejętności zawsze naprawia się przedmioty nieuwzględnione przez
 * pozostałe Umiejętności techniczne”).
 */
export const CPRED_ARMOR_REPAIR_SKILL_ID = 'basic-tech';

/**
 * Zapasowa definicja tej Umiejętności dla rejestru bez niej — zestaw Easy Mode
 * w `data/public` (świeży klon repo) nie ma Umiejętności naprawczych, a
 * Prowizorka ma działać i tam: poziom 0, sama TECH + Naprawa.
 */
export const CPRED_ARMOR_REPAIR_SKILL = {
  id: CPRED_ARMOR_REPAIR_SKILL_ID,
  name: 'Podstawowe naprawy',
  stat: 'tech',
} as const;

/** Dlaczego tej sztuki pancerza nie da się teraz załatać prowizorką. */
export type CpredFieldRepairProblem =
  | 'UNKNOWN_ARMOR'
  | 'NO_REPAIR_SPECIALTY'
  | 'ARMOR_INTACT'
  | 'ALREADY_PATCHED'
  /** Łata już raz puściła, a pełnej naprawy nie było (TEC-06, #86). */
  | 'PATCH_SPENT';

/**
 * Czy Technik z daną Naprawą może załatać ten wiersz. Jedna funkcja dla guzika
 * na karcie, planera rzutu i serwera — kolejność odmów to kolejność, w jakiej
 * gracz powinien je usłyszeć.
 */
export function cpredFieldRepairProblem(
  row: CpredArmorRow | undefined,
  repairLevel: number,
): CpredFieldRepairProblem | null {
  if (!row) return 'UNKNOWN_ARMOR';
  if (repairLevel < 1) return 'NO_REPAIR_SPECIALTY';
  if (row.fieldRepair) return 'ALREADY_PATCHED';
  if (row.fieldRepairSpent) return 'PATCH_SPENT';
  if (row.spCurrent >= row.sp) return 'ARMOR_INTACT';
  return null;
}

// ─────────────── Zwykła naprawa i montaż Technikiem (etap 71c2) ───────────────

/** Co da się naprawić Testem: wiersz pancerza karty drużyny albo pojazd. */
export type CpredRepairTarget =
  | { kind: 'armor'; characterId: string; armorRowId: string }
  | { kind: 'vehicle'; vehicleId: string };

export function isCpredRepairTarget(value: unknown): value is CpredRepairTarget {
  if (typeof value !== 'object' || value === null) return false;
  const target = value as Record<string, unknown>;
  const id = (key: string) => typeof target[key] === 'string' && (target[key] as string).length > 0;
  if (target.kind === 'armor') return id('characterId') && id('armorRowId');
  if (target.kind === 'vehicle') return id('vehicleId');
  return false;
}

/** PT i czas pracy w minutach zegara świata. */
export interface CpredWorkTask {
  dv: number;
  minutes: number;
}

/**
 * „Szybsza naprawa” z Ulepszania (s. 148, TEC-15): rzecz przeprojektowana tak,
 * że „można ją w pełni naprawić dwa razy szybciej”. Czyta pole `upgrade`
 * wiersza — stempel Ulepszania, który i tak trzyma „tylko raz”.
 */
export const CPRED_FAST_REPAIR_UPGRADE = 'fastRepair';

/**
 * Czy sztuka pancerza potrzebuje zwykłej naprawy: starte OB albo trwająca
 * łata (pod Prowizorką OB jest pełne tylko na chwilę — s. 147).
 */
export function cpredArmorNeedsRepair(row: CpredArmorRow): boolean {
  return row.spCurrent < row.sp || row.fieldRepair !== undefined;
}

/**
 * PT i czas zwykłej naprawy sztuki pancerza (s. 140): pasmo ceny wpisu
 * Kompendium, a bez wpisu — PT 13 jak Prowizorka i czas Drogiego szczebla
 * (6 godzin). „Szybsza naprawa” połowi czas.
 */
export function cpredArmorRepairTask(
  category: CostCategory | null | undefined,
  upgrade?: string,
): CpredWorkTask {
  const minutes = category ? CPRED_REPAIR_TASK[category].minutes : CPRED_REPAIR_TASK.costly.minutes;
  return {
    dv: cpredRepairDv(category),
    minutes: upgrade === CPRED_FAST_REPAIR_UPGRADE ? Math.round(minutes / 2) : minutes,
  };
}

/**
 * Czy łata Prowizorki puściła (etap 71d1, G12): „Prowizorka działa przez 10
 * minut na poziom tej Specjalizacji” (s. 147). Terminy stawia serwer przy
 * udanym Teście tą samą `cpredStatEffectDeadlines`, co efektom na Cechach —
 * rundowy w trwającej walce i światowy zawsze — i wygasa **alternatywa**, jak
 * tam. Łata sprzed 71d1 terminów nie ma i puszcza tylko guzikiem.
 */
export function cpredFieldRepairExpired(
  row: Pick<CpredArmorRow, 'fieldRepair'>,
  clock: { round: number | null; minutes: number | null },
): boolean {
  const patch = row.fieldRepair;
  if (!patch) return false;
  if (patch.expiresAtRound !== undefined && clock.round !== null) {
    if (clock.round >= patch.expiresAtRound) return true;
  }
  return (
    patch.expiresAtMinute !== undefined &&
    clock.minutes !== null &&
    clock.minutes >= patch.expiresAtMinute
  );
}

/**
 * Koniec Prowizorki: „przedmiot wraca do stanu, w którym był” (s. 147) — OB
 * sprzed łaty, a jeśli pod łatą sztuka oberwała jeszcze niżej, to niższe;
 * ślad zużytej łaty (`fieldRepairSpent`, #86) czeka na pełną naprawę. Ta sama
 * funkcja dla guzika „Koniec prowizorki” i dla zegara.
 */
export function cpredFieldRepairEnded(row: CpredArmorRow): CpredArmorRow {
  if (!row.fieldRepair) return row;
  const { fieldRepair, ...rest } = row;
  return {
    ...rest,
    spCurrent: Math.min(fieldRepair.restoredFrom, row.spCurrent, row.sp),
    fieldRepairSpent: true as const,
  };
}

/** Sztuka po zwykłej naprawie: pełne OB, bez łaty (ślad zużytej łaty zdejmuje czytnik karty). */
export function cpredArmorRepaired(row: CpredArmorRow): CpredArmorRow {
  const { fieldRepair: _patch, fieldRepairSpent: _spent, ...rest } = row;
  return { ...rest, spCurrent: row.sp };
}

/**
 * Montaż ulepszenia auta Technikiem: „ulepszenia pojazdu … są traktowane jako
 * 1000 ed (Bardzo kosztowne)” (s. 148) — PT 24 i dwa tygodnie z tabeli
 * Ulepszania (`CPRED_FABRICATION_TASK.veryExpensive`).
 */
export const CPRED_TECH_VEHICLE_UPGRADE_TASK: CpredWorkTask = {
  dv: 24,
  minutes: 14 * 24 * 60,
};

/**
 * „Jeśli Test się nie powiedzie, w połowie prac orientujesz się, że musisz
 * zaczynać od początku” (s. 140, s. 148) — porażka kosztuje połowę czasu.
 */
export function cpredFailedWorkMinutes(minutes: number): number {
  return Math.round(minutes / 2);
}

/** Dlaczego zwykłej naprawy nie da się zacząć. */
export type CpredRepairProblem = 'UNKNOWN_ARMOR' | 'NOTHING_TO_REPAIR';

export const CPRED_REPAIR_PROBLEMS: Record<CpredRepairProblem, string> = {
  UNKNOWN_ARMOR: 'Nie ma takiej sztuki pancerza na karcie.',
  NOTHING_TO_REPAIR: 'Ta rzecz jest cała — nie ma czego naprawiać.',
};

/**
 * Zapasowe nazwy Umiejętności naprawczych dla rejestru bez nich (Easy Mode
 * z `data/public`) — Test idzie wtedy na samą TECH + Specjalizację, jak
 * Prowizorka z `CPRED_ARMOR_REPAIR_SKILL`.
 */
export const CPRED_REPAIR_SKILL_FALLBACK_NAMES: Record<string, string> = {
  'basic-tech': 'Podstawowe naprawy',
  'land-vehicle-tech': 'Naprawa pojazdów lądowych',
  'sea-vehicle-tech': 'Naprawa pojazdów wodnych',
  'air-vehicle-tech': 'Naprawa statków powietrznych',
};

// ─────────────── Lista robót dla drużyny (`repair:targets`, 71c2) ───────────────

/** O czyją listę pyta klient — karta, która będzie naprawiać. */
export interface CpredRepairTargetsPayload {
  characterId: string;
}
