/**
 * Zegar świata kampanii (etap 37) — rdzeń VTT, nie system RPG.
 *
 * Do tej sesji czas w tym VTT istniał **wyłącznie w rundach walki**:
 * `CpredTimedEffect` liczy sekundy przez `currentRound`, a poza starciem nie
 * było niczego, co wiedziałoby, że minęła noc. Skutki było widać w trzech
 * miejscach naraz — rozliczenie miesiąca odpalało się wtedy, kiedy MG sobie
 * przypomniał, dzień odpoczynku nie miał żadnego związku z „minęła doba",
 * a dziennik kampanii datował wpisy datą realną.
 *
 * Trzy rzeczy niosą ten plik.
 *
 * 1. **Czas to jedna liczba: minuty od epoki uniksowej, liczone w UTC.**
 *    Nie `DateTime`, bo strefa czasowa serwera nie ma nic wspólnego z porą dnia
 *    w Night City, a każde przejście przez lokalny czas przesuwałoby granicę
 *    doby o kilka godzin przy zmianie środowiska. Nie tekst, bo po tekście nie
 *    da się dodać dziesięciu minut ani porównać dwóch chwil. Wszystkie odczyty
 *    idą przez `getUTC*`, żeby wynik był ten sam w Warszawie i na VPS-ie.
 *
 * 2. **Zegar podpowiada, nie rządzi** (decyzja MG z 05.09.2026). Przesunięcie
 *    czasu nie zabiera nikomu pieniędzy ani nie leczy: `settleDue` mówi tylko,
 *    że minął pierwszy dzień miesiąca, a `gameDaysBetween` — ile dób odpoczynku
 *    MG ma komu **zaproponować**. To ta sama zasada, na której stoi cały
 *    rozdział 11 („nic nie rusza się samo") i którą etap 32 zastosował do
 *    skutków Testu.
 *
 * 3. **Kalendarz jest gregoriański i bez stref.** Świat Cyberpunka używa
 *    naszego kalendarza, więc jedyne, co tu jest własne, to polskie nazwy
 *    miesięcy i pory dnia — reszta to arytmetyka `Date` w UTC.
 */

/**
 * Domyślny start kampanii: 1 stycznia 2045, 08:00.
 *
 * Rok kanoniczny „Czasu Czerwieni" i godzina, o której drużyna zwykle wstaje.
 * Ta sama liczba stoi jako `@default` w kolumnie `Campaign.gameTime` — kampania
 * założona przed tym etapem dostaje ją migracją, więc nigdzie nie ma kampanii
 * bez zegara.
 */
export const GAME_TIME_DEFAULT = 39_447_840;

/** Minuta w dobie i doba w minutach — używane wszędzie niżej. */
export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/**
 * Granice sensownej daty: 2000–2199.
 *
 * Nie są regułą świata, tylko bezpiecznikiem pola tekstowego — MG, który
 * wpisze rok 20450, ma dostać odmowę, a nie kampanię, w której nic nie da się
 * porównać. Górna granica jest hojna: kampania w 2077 mieści się z zapasem.
 */
export const GAME_TIME_MIN = Math.trunc(Date.UTC(2000, 0, 1) / 60_000);
export const GAME_TIME_MAX = Math.trunc(Date.UTC(2200, 0, 1) / 60_000);

/** Czy liczba nadaje się na zegar świata (całkowita i w granicach). */
export function isGameTime(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= GAME_TIME_MIN &&
    value <= GAME_TIME_MAX
  );
}

/**
 * Stan zegara, jak jedzie po sieci.
 *
 * Dwie liczby, bo monit rozliczenia musi przeżyć przeładowanie strony:
 * „czy minął pierwszy dzień miesiąca" jest pytaniem o **różnicę** między
 * bieżącym miesiącem świata a ostatnim rozliczonym, a nie o to, czy ktoś
 * widział kartę na czacie.
 */
export interface GameTimeState {
  /** Minuty od epoki uniksowej (UTC). */
  minutes: number;
  /** Ostatni rozliczony miesiąc świata („2045-03"); null = nigdy nie rozliczano. */
  settledMonth: string | null;
}

/* ------------------------------------------------------------------ *
 * Odczyt: data, godzina, pora dnia
 * ------------------------------------------------------------------ */

function dateOf(minutes: number): Date {
  return new Date(minutes * 60_000);
}

/** Nazwy miesięcy w dopełniaczu — „15 **marca** 2045" to jedyna forma, jakiej potrzebujemy. */
export const GAME_MONTH_NAMES: readonly string[] = [
  'stycznia',
  'lutego',
  'marca',
  'kwietnia',
  'maja',
  'czerwca',
  'lipca',
  'sierpnia',
  'września',
  'października',
  'listopada',
  'grudnia',
];

/** Dni tygodnia — pora dnia mówi „rano", ale „w piątek" bywa całą treścią sceny. */
export const GAME_WEEKDAY_NAMES: readonly string[] = [
  'niedziela',
  'poniedziałek',
  'wtorek',
  'środa',
  'czwartek',
  'piątek',
  'sobota',
];

/** „15 marca 2045". */
export function formatGameDate(minutes: number): string {
  const date = dateOf(minutes);
  return `${date.getUTCDate()} ${GAME_MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** „08:05" — zawsze dwie cyfry, bo zegar czyta się jednym spojrzeniem. */
export function formatGameClock(minutes: number): string {
  const date = dateOf(minutes);
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** „piątek". */
export function formatGameWeekday(minutes: number): string {
  return GAME_WEEKDAY_NAMES[dateOf(minutes).getUTCDay()]!;
}

/**
 * Pora dnia — cztery, nie sześć.
 *
 * Podział jest po tym, **co się o tej porze robi w Night City**, a nie po
 * astronomii: nocą ulica należy do kogo innego niż po południu, a różnica
 * między „świtem" a „przedpołudniem" nie zmienia w tej grze niczego.
 */
export type GameDayPart = 'night' | 'morning' | 'day' | 'evening';

export const GAME_DAY_PART_LABELS: Record<GameDayPart, string> = {
  night: 'noc',
  morning: 'rano',
  day: 'dzień',
  evening: 'wieczór',
};

export function gameDayPart(minutes: number): GameDayPart {
  const hour = dateOf(minutes).getUTCHours();
  if (hour < 5 || hour >= 22) return 'night';
  if (hour < 11) return 'morning';
  if (hour < 17) return 'day';
  return 'evening';
}

/** „15 marca 2045, 08:05 · rano" — pełne zdanie zegara, jedno dla całego VTT. */
export function formatGameTime(minutes: number): string {
  return `${formatGameDate(minutes)}, ${formatGameClock(minutes)} · ${
    GAME_DAY_PART_LABELS[gameDayPart(minutes)]
  }`;
}

/** Klucz miesiąca („2045-03") — po nim rozstrzyga się monit rozliczenia. */
export function gameMonthKey(minutes: number): string {
  const date = dateOf(minutes);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Klucz doby („2045-03-15") — data świata dla wpisu dziennika. */
export function gameDayKey(minutes: number): string {
  const date = dateOf(minutes);
  return (
    `${date.getUTCFullYear()}-` +
    `${String(date.getUTCMonth() + 1).padStart(2, '0')}-` +
    `${String(date.getUTCDate()).padStart(2, '0')}`
  );
}

/**
 * Ile **północy** minęło między dwiema chwilami.
 *
 * Nie „ile pełnych 24 godzin", bo doba odpoczynku podręcznika (s. 222) to noc
 * przespana, a nie odliczone 1440 minut: skok z 23:00 na 07:00 następnego dnia
 * jest jednym dniem odpoczynku, choć trwał osiem godzin. Wstecz zwraca 0 —
 * cofnięty zegar nie odbiera niczego, co już się stało.
 */
export function gameDaysBetween(from: number, to: number): number {
  if (to <= from) return 0;
  return Math.floor(to / MINUTES_PER_DAY) - Math.floor(from / MINUTES_PER_DAY);
}

/* ------------------------------------------------------------------ *
 * Skoki zegara
 * ------------------------------------------------------------------ */

/**
 * Cztery skoki (decyzja MG z 05.09.2026) plus ustawienie daty wprost.
 *
 * `morning` jest jedynym, który nie jest dodawaniem: skacze do **najbliższej
 * godziny 6:00 po** bieżącej chwili, więc o 23:00 daje siedem godzin, a o 7:00
 * — dwadzieścia trzy. Dokładnie tak używa się go przy stole („śpimy do rana"),
 * i dlatego nie da się go zapisać jako stałej liczby minut.
 */
export type GameTimeStepId = 'min10' | 'hour' | 'morning' | 'day';

export interface GameTimeStep {
  id: GameTimeStepId;
  /** Napis na przycisku. */
  label: string;
  /** Podpowiedź: co ten skok robi. */
  title: string;
  /** Zdanie na czacie: „Minęła godzina". */
  past: string;
}

/** Godzina, o której zaczyna się „rano" dla skoku „do rana". */
export const GAME_MORNING_HOUR = 6;

export const GAME_TIME_STEPS: readonly GameTimeStep[] = [
  {
    id: 'min10',
    label: '+10 min',
    title: 'Przesuń zegar świata o dziesięć minut',
    past: 'Minęło dziesięć minut',
  },
  { id: 'hour', label: '+1 h', title: 'Przesuń zegar świata o godzinę', past: 'Minęła godzina' },
  {
    id: 'morning',
    label: 'do rana',
    title: `Przesuń zegar do najbliższej godziny ${GAME_MORNING_HOUR}:00`,
    past: 'Minęła noc',
  },
  { id: 'day', label: '+1 dzień', title: 'Przesuń zegar świata o dobę', past: 'Minęła doba' },
];

export function isGameTimeStepId(value: unknown): value is GameTimeStepId {
  return GAME_TIME_STEPS.some((step) => step.id === value);
}

export function gameTimeStep(id: GameTimeStepId): GameTimeStep {
  return GAME_TIME_STEPS.find((step) => step.id === id)!;
}

/** Nowa chwila po skoku. Czysta funkcja — ten sam kod liczy serwer i podgląd klienta. */
export function applyGameTimeStep(minutes: number, id: GameTimeStepId): number {
  switch (id) {
    case 'min10':
      return minutes + 10;
    case 'hour':
      return minutes + MINUTES_PER_HOUR;
    case 'day':
      return minutes + MINUTES_PER_DAY;
    case 'morning': {
      const midnight = Math.floor(minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY;
      const morning = midnight + GAME_MORNING_HOUR * MINUTES_PER_HOUR;
      // Równo o 6:00 „do rana" ma dać **jutro**, nie stać w miejscu: gest
      // znaczy „prześpijmy to", a nie „nic się nie dzieje".
      return morning > minutes ? morning : morning + MINUTES_PER_DAY;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Ustawienie daty wprost
 * ------------------------------------------------------------------ */

/** Wartości dla `<input type="date">` i `<input type="time">`. */
export function gameTimeToInput(minutes: number): { date: string; time: string } {
  return { date: gameDayKey(minutes), time: formatGameClock(minutes) };
}

/**
 * Odwrotność `gameTimeToInput`; `null` znaczy „to nie jest data".
 *
 * Składana ręcznie z `Date.UTC`, a nie przez `new Date('2045-03-15T08:00')` —
 * ten drugi zapis przeglądarki czytają jako czas **lokalny**, więc zegar świata
 * przesuwałby się o strefę czasową osoby, która go ustawiła.
 */
export function gameTimeFromInput(date: string, time: string): number | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const clock = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!day || !clock) return null;
  const year = Number(day[1]);
  const month = Number(day[2]);
  const dayOfMonth = Number(day[3]);
  const hour = Number(clock[1]);
  const minute = Number(clock[2]);
  if (month < 1 || month > 12 || dayOfMonth < 1 || dayOfMonth > 31) return null;
  if (hour > 23 || minute > 59) return null;
  const stamp = Date.UTC(year, month - 1, dayOfMonth, hour, minute);
  const minutes = Math.trunc(stamp / 60_000);
  // 31 lutego przechodzi przez `Date.UTC` jako 3 marca; kalendarz ma prawo
  // poprawić MG, ale nie ma prawa udawać, że wpisał co innego.
  if (dateOf(minutes).getUTCDate() !== dayOfMonth) return null;
  return isGameTime(minutes) ? minutes : null;
}

/**
 * „jedna doba", „trzy doby", „30 dób" — odmiana liczebnika po polsku.
 *
 * Czysta funkcja w rdzeniu, bo tej samej liczby używa nagłówek okna zegara,
 * karta czatu i podpowiedź przycisku, a polska liczba mnoga ma trzy formy:
 * 1 → „doba", końcówka 2–4 (poza 12–14) → „doby", reszta → „dób". Bez tego
 * VTT pisze „minęły 30 doby", co widać przy stole natychmiast.
 */
export function gameDaysLabel(days: number): string {
  const abs = Math.abs(days);
  if (abs === 1) return 'jedna doba';
  const last = abs % 10;
  const lastTwo = abs % 100;
  const few = last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14);
  return `${abs} ${few ? 'doby' : 'dób'}`;
}

/** „Minęła doba", „Minęły trzy doby", „Minęło 30 dób" — czasownik idzie za liczbą. */
export function gameDaysPassed(days: number): string {
  const abs = Math.abs(days);
  if (abs === 1) return 'minęła doba';
  const last = abs % 10;
  const lastTwo = abs % 100;
  const few = last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14);
  return few ? `minęły ${abs} doby` : `minęło ${abs} dób`;
}

/**
 * Klucz doby („2045-03-15") wypisany po ludzku („15 marca 2045").
 *
 * Osobno od `formatGameDate`, bo `JournalEntry.worldDate` trzyma **datę**,
 * a nie chwilę: wpis dziennika nie ma godziny i nie ma jej mieć. Nieczytelny
 * klucz wraca niezmieniony zamiast udawać datę — kronika ma prawo pokazać
 * dziwny wpis, nie ma prawa go poprawiać.
 */
export function formatWorldDate(dayKey: string): string {
  const minutes = gameTimeFromInput(dayKey, '00:00');
  return minutes === null ? dayKey : formatGameDate(minutes);
}

/* ------------------------------------------------------------------ *
 * Monit rozliczenia miesiąca
 * ------------------------------------------------------------------ */

/**
 * Czy MG należy się monit „rozlicz miesiąc".
 *
 * Porównanie **kluczy miesiąca**, nie liczenie dni: pierwszy dzień miesiąca
 * bywa przekroczony jednym skokiem o tydzień, a dwoma po dziesięć minut, i
 * w obu wypadkach monit ma pojawić się dokładnie raz. Kampania bez ani jednego
 * rozliczenia (`settledMonth === null`) monitu **nie dostaje**: świeży stół nie
 * zaczyna od zaległego czynszu — pierwsze rozliczenie stempluje miesiąc, a od
 * niego liczy się każdy następny.
 */
export function settleDue(state: GameTimeState): boolean {
  if (state.settledMonth === null) return false;
  return gameMonthKey(state.minutes) > state.settledMonth;
}

/**
 * Ile miesięcy zostało nierozliczonych — monit ma umieć powiedzieć „trzy", gdy
 * drużyna zniknęła z miasta na kwartał.
 */
export function settleMonthsDue(state: GameTimeState): number {
  if (state.settledMonth === null) return 0;
  const [year, month] = state.settledMonth.split('-').map(Number);
  if (!year || !month) return 0;
  const now = dateOf(state.minutes);
  const months = (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() + 1 - month);
  return Math.max(0, months);
}

/* ------------------------------------------------------------------ *
 * Czat
 * ------------------------------------------------------------------ */

/**
 * Skok zegara, jak zapisuje go czat (rodzaj `time`).
 *
 * Karta jest **publiczna i bez przycisków**: to, że minęła noc, dotyczy całego
 * stołu, a wszystko, co z tego wynika — rozliczenie, odpoczynek — jest sprawą
 * MG i siedzi w oknie zegara, nie w feedzie. Zdania są gotowe, bo czat nie ma
 * prawa znać kalendarza: renderer wypisuje `title` i `to`, i tyle.
 */
export interface TimeLogEntry {
  /** „Minęła noc", „Zegar ustawiony". */
  title: string;
  /** Chwila przed skokiem — pełne zdanie zegara. */
  from: string;
  /** Chwila po skoku — pełne zdanie zegara. */
  to: string;
  /** Ile pełnych dób minęło; 0 przy krótkich skokach i przy cofnięciu. */
  days: number;
  /**
   * Zegar poszedł wstecz. Karta mówi to wprost, bo cofnięcie **niczego nie
   * odwraca** — pobrany czynsz zostaje pobrany, a wyleczone PW wyleczone.
   */
  backwards?: boolean;
}

/** Tytuł karty czatu dla danego skoku; ustawienie daty wprost ma własne zdanie. */
export function timeLogTitle(step: GameTimeStepId | null, backwards: boolean): string {
  if (backwards) return 'Zegar cofnięty';
  if (step === null) return 'Zegar ustawiony';
  return gameTimeStep(step).past;
}
