import type { CostCategory } from './compendium.js';
import type { CpredArmorRow } from './character.js';

/**
 * Naprawa przedmiotów (s. 140) i Prowizorka Technika (s. 147) — etap 71c0.
 *
 * Moduł obok `roleability.ts`, nie w nim (umowa etapu 71: doróbki klasy A–B
 * idą do osobnych plików). Etap 71c2 dołoży tu zwykłą naprawę Technikiem
 * z czasem w kalendarzu; dziś mieszka tu to, czego potrzebuje Prowizorka:
 * PT „typowej naprawy takiej rzeczy” i stan łaty na wierszu pancerza.
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
