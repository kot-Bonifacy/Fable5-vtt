/** The ten CP RED stats. Ids are English (code convention), labels are Polish. */
export const CPRED_STAT_IDS = [
  'int',
  'ref',
  'dex',
  'tech',
  'cool',
  'will',
  'luck',
  'move',
  'body',
  'emp',
] as const;

export type CpredStatId = (typeof CPRED_STAT_IDS)[number];

export interface CpredStatLabel {
  /** Polish abbreviation as printed on the official sheet. */
  abbr: string;
  /** Full Polish name. */
  name: string;
}

/** Polish labels of the Black Monk edition (ZW = DEX, CHA = COOL, SW = WILL…). */
export const CPRED_STAT_LABELS: Record<CpredStatId, CpredStatLabel> = {
  int: { abbr: 'INT', name: 'Inteligencja' },
  ref: { abbr: 'REF', name: 'Refleks' },
  dex: { abbr: 'ZW', name: 'Zwinność' },
  tech: { abbr: 'TECH', name: 'Technika' },
  cool: { abbr: 'CHA', name: 'Charakter' },
  will: { abbr: 'SW', name: 'Siła Woli' },
  luck: { abbr: 'SZ', name: 'Szczęście' },
  move: { abbr: 'RUCH', name: 'Ruch' },
  body: { abbr: 'BC', name: 'Budowa Ciała' },
  emp: { abbr: 'EMP', name: 'Empatia' },
};

export const CPRED_STAT_MIN = 1;

/**
 * Najniższa Cecha, jaką **karta** utrzyma — zero, nie jedynka (etap 38a).
 *
 * `CPRED_STAT_MIN` zostaje jedynką i pilnuje jej kreator: postać gracza
 * z Cechą zero nie istnieje. Ale od 38a kartę nosi też figura, której
 * podręcznik drukuje **Wartość bojową** zamiast Cech — funkcjonariusz Wsparcia
 * (s. 158), Demon i wieżyczka (s. 212, s. 214) — a tym zeruje się REF, ZW i SW
 * właśnie po to, żeby rozbicie rzutu czytało się uczciwie („Broń długa 14",
 * bez Cechy doliczonej drugi raz). Sufit walidatora jedynką odrzucał całą mapę
 * Cech takiej karty i figura wracała jako przeciętny człowiek po pięć.
 *
 * Zero nie łamie nic niżej: `cpredEffectiveStats` ma podłogę „nigdy wyżej niż
 * wartość bazowa" (etap 39), więc zero zostaje zerem, a nie podnosi się do 1.
 */
export const CPRED_SHEET_STAT_MIN = 0;
export const CPRED_STAT_MAX = 10;

/**
 * Limity poziomu Umiejętności. Mieszkają tu, a nie w `character.ts`, od etapu
 * 38a: sufit Wartości bojowej jest ich sumą z `CPRED_STAT_MAX`, a liczy go
 * `statblock.ts`, który karty zaimportować nie może (cykl). `character.ts`
 * eksportuje je dalej, żeby żaden dotychczasowy import nie musiał się zmieniać.
 */
export const SKILL_LEVEL_MIN = 0;
export const SKILL_LEVEL_MAX = 10;

export type CpredStats = Record<CpredStatId, number>;

export function isCpredStatId(value: unknown): value is CpredStatId {
  return typeof value === 'string' && (CPRED_STAT_IDS as readonly string[]).includes(value);
}
