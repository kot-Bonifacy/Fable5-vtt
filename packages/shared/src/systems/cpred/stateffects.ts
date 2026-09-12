/**
 * Efekty czasowe modyfikujące Cechy (etap 39) — czysta arytmetyka, bez IO.
 *
 * Do tej sesji VTT umiał nałożyć na figurę **naklejkę** (`token.statuses`) i
 * ranę wygasającą **rundami** (`CpredTimedEffect` z 16h), ale nie umiał jednej
 * rzeczy: obniżyć liczby na karcie na jakiś czas. Podręcznik wymaga tego
 * w kilkunastu miejscach — Nerwosol i Lisz „na godzinę obniżają o 1k6 INT, REF
 * oraz ZW" (s. 205), Skorpion tnie RUCH — i do etapu 37 nie było na czym
 * takiej godziny zawiesić. Teraz jest.
 *
 * Cztery rozstrzygnięcia niosą ten moduł.
 *
 * 1. **Wartość jest zapisana, nie przeliczana.** „1k6" w opisie Programu jest
 *    instrukcją dla **chwili nałożenia**, a nie formułą efektu: efekt trzymający
 *    formułę losowałby się przy każdym odczycie i karta zmieniałaby się sama,
 *    ilekroć ktoś na nią spojrzy. Serwer rzuca raz i zapisuje liczbę — ta sama
 *    umowa, którą wiersz broni ma wobec kompendium.
 *
 * 2. **Dwa zegary, koniunkcja OR.** Efekt kończy się, gdy **którykolwiek**
 *    z terminów minie: runda walki (16h) albo minuta zegara świata (37). Godzina
 *    to 360 rund, więc w starciu praktycznie zawsze zamyka ją zegar świata,
 *    a efekt „na trzy rundy" zamyka licznik rund. Termin świata stawia się
 *    **zawsze**, bo tylko on przeżywa koniec walki: efekt z samym terminem
 *    rundowym, nałożony w rundzie 8 walki, która się skończyła, wisiałby do
 *    ósmej rundy **następnej** walki.
 *
 * 3. **Cecha efektywna liczy się w jednym miejscu** (`cpredEffectiveStats`).
 *    Gdyby modyfikator wchodził do rzutu, ale nie do wartości pochodnej (albo
 *    odwrotnie), karta i kości zaczęłyby mówić dwie różne rzeczy — a to jest
 *    ten rodzaj błędu, który przy stole wychodzi po trzech sesjach.
 *
 * 4. **Efekty nie ruszają PUL** (decyzja MG z 05.09.2026). Maksymalne PW, pula
 *    Szczęścia i sufit Człowieczeństwa liczą się z Cechy **bazowej**, bo
 *    `mergeCharacterData` przycina `hpCurrent` i `luckCurrent` do maksimum przy
 *    **każdym** zapisie karty: maksimum spadające na godzinę zabrałoby punkty
 *    na stałe. Efekt rusza to, co rozstrzyga się „teraz" — Testy, Unik,
 *    Inicjatywę, PT obrony, RUCH i Rzut na Śmierć. Zapisane
 *    w `decyzje-i-uproszczenia.md`.
 */

import { effectiveCpredStats } from './cyberware.js';
import {
  CPRED_STAT_LABELS,
  CPRED_STAT_MAX,
  CPRED_STAT_MIN,
  isCpredStatId,
  type CpredStatId,
  type CpredStats,
} from './stats.js';
import { CPRED_MINUTE_S, describeCpredDuration } from './timed.js';

/** „Na godzinę" — jedyna długość, jakiej podręcznik używa dla tych efektów. */
export const CPRED_HOUR_S = 60 * CPRED_MINUTE_S;

/** Ile efektów naraz mieści karta. Nie reguła, bezpiecznik walidacji. */
export const CPRED_STAT_EFFECTS_MAX = 24;

/** Największa sensowna zmiana Cechy jednym efektem — 1k6 mieści się z zapasem. */
export const CPRED_STAT_EFFECT_VALUE_MAX = 10;

/** Najdłuższy efekt: doba świata. Dłuższy nie jest „czasowy", tylko trwały. */
export const CPRED_STAT_EFFECT_DURATION_MAX_S = 24 * 60 * CPRED_MINUTE_S;

/**
 * Jeden efekt czasowy na jednej Cesze.
 *
 * Osobny byt od `CpredTimedEffect`, choć oba liczą czas: tamten wisi przy
 * **naklejce** i mówi „kiedy ją zdjąć", ten jest **wierszem karty** i niesie
 * własną liczbę. Wspólny typ oznaczałby pole `stat` puste przy każdej naklejce
 * i pole `statusId` puste przy każdym efekcie.
 */
export interface CpredStatEffect {
  /** Własne id wiersza — „zdejmij" wskazuje jeden efekt, nie wszystkie z Cechy. */
  id: string;
  stat: CpredStatId;
  /**
   * Zmiana Cechy ze znakiem, **wylosowana raz i zapisana**. Ujemna dla
   * Nerwosolu, dodatnia dla wszystkiego, co podkręca.
   */
  value: number;
  /** „Nerwosol", „Lisz" — to, co pisze chip na karcie i karta na czacie. */
  source: string;
  /** Wpis kompendium, z którego efekt przyszedł; brak = ręka MG. */
  compendiumId?: string;
  /** „1k6" — notacja, z której padła liczba; sam napis, do podpowiedzi. */
  rolled?: string;
  /** Długość w sekundach fikcji, dla etykiety („na godzinę"). */
  durationS: number;
  /** Runda trwającej walki, w której efekt schodzi; brak = nic nie liczy rund. */
  expiresAtRound?: number;
  /** Minuta zegara świata, w której efekt schodzi (etap 37). */
  expiresAtMinute?: number;
}

/**
 * Karta widziana oczami tego modułu — trzy pola, nie cały arkusz.
 *
 * Strukturalnie, a nie przez `CpredCharacterData`, bo `character.ts` importuje
 * **ten** plik (potrzebuje typu wiersza do walidacji), więc import w drugą
 * stronę zamknąłby cykl. To ten sam zabieg, którym `cyberware.ts` trzyma się
 * z dala od karty.
 */
export interface CpredStatSheet {
  stats: CpredStats;
  humanityCurrent: number;
  statEffects: readonly CpredStatEffect[];
}

/** Obie wskazówki zegara naraz; `null` znaczy „ten zegar nie chodzi". */
export interface CpredEffectClock {
  /** Runda trwającej walki albo null poza starciem. */
  round: number | null;
  /** Minuty zegara świata albo null, gdy wołający ich nie zna. */
  minutes: number | null;
}

/* ------------------------------------------------------------------ *
 * Cecha efektywna
 * ------------------------------------------------------------------ */

/**
 * Podłoga i sufit jednej Cechy.
 *
 * Podłogą jest `CPRED_STAT_MIN`, **ale nigdy wyżej niż wartość bazowa**:
 * Empatia obniżona Człowieczeństwem schodzi do zera i schodzić do zera ma
 * (s. 229), więc zaciskanie do jedynki **podnosiłoby** ją cyberpsychopacie.
 * Sufit działa tak samo w drugą stronę.
 */
function clampStat(base: number, value: number): number {
  const floor = Math.min(CPRED_STAT_MIN, base);
  const ceiling = Math.max(CPRED_STAT_MAX, base);
  return Math.max(floor, Math.min(ceiling, value));
}

/** Suma zmian tej Cechy, **bez** podłogi i sufitu. */
export function cpredStatEffectSum(
  effects: readonly CpredStatEffect[],
  statId: CpredStatId,
): number {
  return effects.reduce((sum, effect) => (effect.stat === statId ? sum + effect.value : sum), 0);
}

/** Efekty siedzące na tej Cesze, w kolejności nałożenia. */
export function cpredStatEffectsFor(
  effects: readonly CpredStatEffect[],
  statId: CpredStatId,
): CpredStatEffect[] {
  return effects.filter((effect) => effect.stat === statId);
}

/**
 * Cechy, którymi karta **gra teraz**: bazowe, poprawione Człowieczeństwem
 * (etap 23a), przesunięte efektami i przycięte do podłogi i sufitu.
 *
 * Jedyna droga do liczby, na którą pada kość. Zwraca ten sam obiekt, gdy nic
 * się nie zmieniło — planer rzutu porównuje przez wartość, a alokacja na każdy
 * wiersz rozbicia byłaby czystym marnotrawstwem (ta sama umowa, którą ma
 * `effectiveCpredStats`).
 */
export function cpredEffectiveStats(sheet: CpredStatSheet): CpredStats {
  const withHumanity = effectiveCpredStats(sheet.stats, sheet.humanityCurrent);
  if (sheet.statEffects.length === 0) return withHumanity;
  let changed = false;
  const result = { ...withHumanity };
  for (const statId of Object.keys(result) as CpredStatId[]) {
    const sum = cpredStatEffectSum(sheet.statEffects, statId);
    if (sum === 0) continue;
    const next = clampStat(withHumanity[statId], withHumanity[statId] + sum);
    if (next !== result[statId]) {
      result[statId] = next;
      changed = true;
    }
  }
  return changed ? result : withHumanity;
}

/** Jedna Cecha „jak teraz" — skrót na wołających, którym zależy na jednej. */
export function cpredEffectiveStat(sheet: CpredStatSheet, statId: CpredStatId): number {
  return cpredEffectiveStats(sheet)[statId];
}

/**
 * Ile efekty **naprawdę** zabrały tej Cesze, po podłodze i suficie.
 *
 * Różnica między Cechą efektywną a tą samą Cechą bez efektów — a nie suma
 * `value`, bo suma nie wie o podłodze. Rozbicie rzutu rysuje się z tej liczby,
 * więc wiersze karty zawsze sumują się do tego, czym rzuca kość.
 */
export function cpredStatEffectDelta(sheet: CpredStatSheet, statId: CpredStatId): number {
  const base = effectiveCpredStats(sheet.stats, sheet.humanityCurrent)[statId];
  return cpredEffectiveStats(sheet)[statId] - base;
}

/**
 * Wiersze rozbicia rzutu dla jednej Cechy — po jednym na efekt.
 *
 * Osobne wiersze, a nie mniejsza liczba w wierszu Cechy, dokładnie z tego
 * powodu, dla którego osobnym wierszem jest kara z pancerza: modyfikator jest
 * **czasowy i zdejmowalny**, a gracz, który czyta „REF 8 · Lisz −3", wie, że
 * za godzinę będzie rzucał inaczej.
 *
 * Gdy podłoga przycina sumę, wiersze **nie** mogą jej sumować wprost — inaczej
 * karta pokazywałaby REF −2. Wtedy zamiast listy idzie jeden wiersz zbiorczy
 * z nazwami źródeł i przyciętą liczbą; nic nie ginie, a suma się zgadza.
 */
export function cpredStatEffectRows(
  sheet: CpredStatSheet,
  statId: CpredStatId,
): { label: string; value: number }[] {
  const rows = cpredStatEffectsFor(sheet.statEffects, statId);
  if (rows.length === 0) return [];
  const delta = cpredStatEffectDelta(sheet, statId);
  if (delta === 0) return [];
  const raw = cpredStatEffectSum(sheet.statEffects, statId);
  if (raw === delta) return rows.map((effect) => ({ label: effect.source, value: effect.value }));
  return [{ label: rows.map((effect) => effect.source).join(', '), value: delta }];
}

/* ------------------------------------------------------------------ *
 * Wygasanie
 * ------------------------------------------------------------------ */

/**
 * Czy któryś z dwóch zegarów dogonił efekt.
 *
 * OR, nie AND: „na godzinę" nałożone w walce ma zejść po godzinie świata,
 * choćby walka trwała, a „na trzy rundy" ma zejść w rundzie szóstej, choćby
 * MG nie ruszył zegara.
 */
export function cpredStatEffectExpired(
  effect: Pick<CpredStatEffect, 'expiresAtRound' | 'expiresAtMinute'>,
  clock: CpredEffectClock,
): boolean {
  if (
    effect.expiresAtRound !== undefined &&
    clock.round !== null &&
    clock.round >= effect.expiresAtRound
  ) {
    return true;
  }
  return (
    effect.expiresAtMinute !== undefined &&
    clock.minutes !== null &&
    clock.minutes >= effect.expiresAtMinute
  );
}

/** Rozdziela listę na to, co zostaje, i to, czego czas minął. */
export function cpredExpireStatEffects(
  effects: readonly CpredStatEffect[],
  clock: CpredEffectClock,
): { kept: CpredStatEffect[]; expired: CpredStatEffect[] } {
  const kept: CpredStatEffect[] = [];
  const expired: CpredStatEffect[] = [];
  for (const effect of effects) {
    (cpredStatEffectExpired(effect, clock) ? expired : kept).push(effect);
  }
  return { kept, expired };
}

/**
 * Terminy efektu nakładanego **teraz** — oba naraz.
 *
 * Runda jest opcjonalna (poza walką nic nie liczy rund), minuta świata jest
 * obowiązkowa, o ile wołający zna zegar. Patrz akapit 2 w nagłówku pliku.
 */
export function cpredStatEffectDeadlines(
  clock: CpredEffectClock,
  durationS: number,
): Pick<CpredStatEffect, 'expiresAtRound' | 'expiresAtMinute'> {
  const rounds = Math.max(1, Math.ceil(durationS / 10));
  const minutes = Math.max(1, Math.ceil(durationS / CPRED_MINUTE_S));
  return {
    ...(clock.round !== null && clock.round >= 1
      ? { expiresAtRound: Math.round(clock.round) + rounds }
      : {}),
    ...(clock.minutes !== null ? { expiresAtMinute: clock.minutes + minutes } : {}),
  };
}

/* ------------------------------------------------------------------ *
 * Etykiety
 * ------------------------------------------------------------------ */

/** „REF −3" — sama zmiana, ze znakiem, jak stoi na chipie. */
export function describeCpredStatEffectValue(effect: CpredStatEffect): string {
  const sign = effect.value > 0 ? '+' : '−';
  return `${CPRED_STAT_LABELS[effect.stat].abbr} ${sign}${Math.abs(effect.value)}`;
}

/** „REF −3 (Lisz)" — jedno zdanie na kartę czatu i na listę. */
export function describeCpredStatEffect(effect: CpredStatEffect): string {
  return `${describeCpredStatEffectValue(effect)} (${effect.source})`;
}

/**
 * Ile jeszcze zostało, w słowach — „zostaje 42 min", „do rundy 9".
 *
 * Zegar świata wygrywa, gdy oba terminy stoją: to on kończy każdy efekt „na
 * godzinę", a odliczanie w rundach do 363 nie mówi przy stole niczego. Gdy nie
 * chodzi żaden zegar, zdanie mówi to wprost — gracz, którego postać jest pod
 * Nerwosolem, ma prawo wiedzieć, czy cokolwiek odlicza, i jest to ta sama
 * szczerość, którą `describeCpredTimer` wprowadził w 16h.
 */
export function describeCpredStatEffectTimer(
  effect: Pick<CpredStatEffect, 'expiresAtRound' | 'expiresAtMinute' | 'durationS'>,
  clock: CpredEffectClock,
): string {
  if (effect.expiresAtMinute !== undefined && clock.minutes !== null) {
    const left = effect.expiresAtMinute - clock.minutes;
    if (left <= 0) return 'czas minął';
    if (left < 60) return `zostaje ${left} min`;
    const hours = Math.floor(left / 60);
    const rest = left % 60;
    return rest === 0 ? `zostaje ${hours} h` : `zostaje ${hours} h ${rest} min`;
  }
  if (effect.expiresAtRound !== undefined) return `do rundy ${effect.expiresAtRound}`;
  return `${describeCpredDuration(effect.durationS)} — zdejmuje MG`;
}

/* ------------------------------------------------------------------ *
 * Odczyt z danych
 * ------------------------------------------------------------------ */

/**
 * Wiersz z JSON-a albo `null`.
 *
 * Zły wiersz **odpada po cichu**, a nie wywraca karty: efekty pisze silnik
 * (rzut Czarnego LOD-u, ręka MG), więc zepsute pole jest starą daną, a nie
 * literówką, na której poprawienie ktoś czeka — ta sama umowa, którą ma
 * `validateTimedInjury` z 16h.
 */
export function readCpredStatEffect(raw: unknown): CpredStatEffect | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string' || row.id.length === 0 || row.id.length > 32) return null;
  if (!isCpredStatId(row.stat)) return null;
  if (typeof row.source !== 'string' || row.source.trim().length === 0) return null;
  const value = row.value;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value === 0 ||
    Math.abs(value) > CPRED_STAT_EFFECT_VALUE_MAX
  ) {
    return null;
  }
  const durationS = row.durationS;
  if (
    typeof durationS !== 'number' ||
    !Number.isInteger(durationS) ||
    durationS <= 0 ||
    durationS > CPRED_STAT_EFFECT_DURATION_MAX_S
  ) {
    return null;
  }
  const round = row.expiresAtRound;
  const minute = row.expiresAtMinute;
  return {
    id: row.id,
    stat: row.stat,
    value,
    source: row.source.slice(0, 64),
    durationS,
    ...(typeof row.compendiumId === 'string' && row.compendiumId.length > 0
      ? { compendiumId: row.compendiumId }
      : {}),
    ...(typeof row.rolled === 'string' && row.rolled.length > 0 && row.rolled.length <= 16
      ? { rolled: row.rolled }
      : {}),
    ...(typeof round === 'number' && Number.isInteger(round) && round > 0
      ? { expiresAtRound: round }
      : {}),
    ...(typeof minute === 'number' && Number.isInteger(minute) && minute > 0
      ? { expiresAtMinute: minute }
      : {}),
  };
}

/** Cała lista, z pominięciem wierszy, których nie da się odczytać. */
export function readCpredStatEffects(raw: unknown): CpredStatEffect[] {
  if (!Array.isArray(raw)) return [];
  const rows: CpredStatEffect[] = [];
  for (const entry of raw.slice(0, CPRED_STAT_EFFECTS_MAX)) {
    const row = readCpredStatEffect(entry);
    if (row) rows.push(row);
  }
  return rows;
}
