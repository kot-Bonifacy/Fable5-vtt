/**
 * Wydrukowany blok statystyk figury (etap 38a).
 *
 * Do 38a figura bez karty trzymała swoje liczby w `Token.combatProfile`, a etap
 * 38a zamienił każdą taką figurę w prawdziwą kartę. Trzy rzeczy z profilu nie
 * dały się na kartę przepisać wprost i to jest cały ten moduł:
 *
 *  - **Wartość bojowa** — „Umiejętność bazowa używana do ataku i obrony.
 *    Reprezentuje sumę Cechy i Umiejętności funkcjonariusza" (s. 158). Jedna
 *    liczba, w której Cecha **już siedzi**, i sięgająca 16 u C-SWAT. Umiejętność
 *    karty ma sufit 10 (`SKILL_LEVEL_MAX`), a Cecha dokłada się na wierzchu —
 *    wpisanie jej wprost dałoby albo Cechę policzoną dwa razy, albo ścięcie do
 *    dziesiątki, czyli dokładnie ten błąd, który 31.08 kazał C-SWAT-owi strzelać
 *    jak krawężnikowi.
 *  - **Zakaz uniku przed pociskami** — „Funkcjonariusze Wsparcia nie mogą Unikać
 *    pocisków" (s. 158). Unik zero tego nie załatwia: `attack:evade` w tym
 *    projekcie kupuje 1k10 także za zero.
 *  - **Wydrukowane PW** — C-SWAT ma PW 35 przy BC 4, a `hpMax(stats)` policzyłoby
 *    z tych Cech 20. Bez własnego maksimum `normalizeCharacterData` ścinałby
 *    funkcjonariuszowi piętnaście punktów przy pierwszym zapisie karty.
 *
 * **To nie jest kategoria karty.** MG odrzucił 05.09 znacznik odróżniający
 * statystów w rosterze — ganger stoi na liście obok Vex. Blok jest tym, czym
 * jest w podręczniku: trzema liczbami, które ktoś wydrukował zamiast liczyć.
 * Nazwanemu NPC-owi wolno mieć Wartość bojową dokładnie tak samo.
 *
 * Osobny plik, a nie pole w `character.ts`, żeby `derived.ts` mógł go czytać:
 * maksimum PW jest funkcją Cech **i** bloku, a `derived.ts` nie ma prawa
 * zaimportować karty (cykl przez `character.ts`).
 */

import { CPRED_STAT_MAX, SKILL_LEVEL_MAX, type CpredStats } from './stats.js';

/**
 * Sufit Wartości bojowej: suma obu limitów, bo dokładnie tym Wartość bojowa
 * jest — Cechą i Umiejętnością zlanymi w jedną liczbę (rozpoznanie z 31.08,
 * przeniesione tu ze `statist.ts`).
 */
export const CPRED_COMBAT_VALUE_MAX = CPRED_STAT_MAX + SKILL_LEVEL_MAX;

/** Najwyższe PW, jakie da się wydrukować figurze. Sufit sanitarny, nie zasada. */
export const CPRED_STATBLOCK_HP_MAX = 500;

export interface CpredStatBlock {
  /**
   * Wartość bojowa: jeden modyfikator do ataku **i** obrony, z Cechą w środku.
   * `null` = figura liczy się normalnie, Cecha + Umiejętność.
   */
  combatValue: number | null;
  /**
   * Poziom Umiejętności, którą ta figura strzela ze swojej broni — **jakakolwiek
   * by ta Umiejętność nie była**. `null` = figura ma wpisane Umiejętności jak
   * każda karta i nie ma czego podstawiać.
   *
   * Jedna liczba zamiast wpisu w `skills`, i to jest świadome ustępstwo. Wpis
   * pod prawdziwym id byłby uczciwszy na karcie, ale wymagałby rozwiązania
   * „broń → Umiejętność" przez kompendium **przy każdym zapisie z menu żetonu
   * i w migracji bazy** — a kompendium mieszka w plikach `data/private/`, nie
   * w bazie, więc SQL migracji nie ma go jak przeczytać. Podręcznik zresztą
   * drukuje NPC-a dokładnie tak: „Broń: karabin szturmowy, umiejętność 13".
   */
  weaponSkill: number | null;
  /** „nie mogą Unikać pocisków" (s. 158) — dotyczy wyłącznie broni dystansowej. */
  noBulletDodge: boolean;
  /** Wydrukowane maksimum PW; `null` = licz z BC i SW jak każdej karcie. */
  hpMax: number | null;
}

export function createDefaultStatBlock(): CpredStatBlock {
  return { combatValue: null, weaponSkill: null, noBulletDodge: false, hpMax: null };
}

function clampInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Naprawia, co się da, i nigdy nie rzuca — ta sama umowa, którą miał
 * `sanitizeCombatProfile`: kolumna tknięta ręką ma dalej działać.
 */
export function sanitizeStatBlock(raw: unknown): CpredStatBlock | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const block: CpredStatBlock = {
    combatValue: clampInt(input.combatValue, 0, CPRED_COMBAT_VALUE_MAX),
    weaponSkill: clampInt(input.weaponSkill, 0, CPRED_COMBAT_VALUE_MAX),
    noBulletDodge: input.noBulletDodge === true,
    hpMax: clampInt(input.hpMax, 1, CPRED_STATBLOCK_HP_MAX),
  };
  // Blok bez ani jednej liczby to karta postaci, nie blok — inaczej każda
  // zwykła karta nosiłaby pusty obiekt, który nic nie znaczy.
  if (
    block.combatValue === null &&
    block.weaponSkill === null &&
    !block.noBulletDodge &&
    block.hpMax === null
  ) {
    return null;
  }
  return block;
}

/** Max PW: wydrukowane, a jak nie ma — 10 + 5 × ⌈(BC + SW) / 2⌉. */
export function statBlockHpMax(
  stats: Pick<CpredStats, 'body' | 'will'>,
  block: CpredStatBlock | null,
): number {
  if (block?.hpMax != null) return block.hpMax;
  return 10 + 5 * Math.ceil((stats.body + stats.will) / 2);
}

/** Cokolwiek niesie Cechy i blok — karta albo jej okrojony widok. */
export interface CpredStatBlockCarrier {
  stats: Pick<CpredStats, 'body' | 'will'>;
  statBlock: CpredStatBlock | null;
}

/**
 * Maksimum PW **tej karty**.
 *
 * Od etapu 38a `hpMax(data.stats)` na pełnej karcie jest błędem, tak jak
 * `data.stats[...]` od etapu 39: figura z wydrukowanymi PW ma ich tyle, ile
 * wydrukowano, a nie tyle, ile wychodzi z BC i SW. `hpMax` zostaje dla miejsc,
 * które mają same Cechy i żadnej karty — kreatora postaci przede wszystkim.
 */
export function cpredSheetHpMax(sheet: CpredStatBlockCarrier): number {
  return statBlockHpMax(sheet.stats, sheet.statBlock);
}

/**
 * Próg Poważnie Rannego **tej karty** — połowa jej maksimum PW, w górę.
 *
 * Bliźniak `seriousWoundThreshold` z `derived.ts`, który bierze same Cechy
 * i zostaje kreatorowi. Na karcie z wydrukowanymi PW tamten pokazywał próg
 * inny niż ten, od którego rzut naprawdę dolicza −2 (poprawione 12.09.2026).
 */
export function cpredSheetSeriousWoundThreshold(sheet: CpredStatBlockCarrier): number {
  return Math.ceil(cpredSheetHpMax(sheet) / 2);
}
