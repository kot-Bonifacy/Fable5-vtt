import type { DiceRng } from '../../dice.js';
import type { CpredCharacterData, CpredRegistry } from './character.js';
import { cpredSkillLevel } from './chromestats.js';
import { cpredSheetMoto } from './roleability.js';
import { cpredEffectiveStat } from './stateffects.js';
import {
  CPRED_DRIVING_TEST_DV,
  CPRED_DRIVING_TEST_THRESHOLD,
  cpredVehicleSkillId,
  type CpredVehicleKind,
} from './vehicles.js';

/**
 * Jazda w pościgu od etapu 72 — liczby CP RED do rdzenia `shared/chase-drive.ts`
 * (decyzje MG z 15.11.2026, `docs/etapy/etap-72-poscig-kokpit.md`).
 *
 * Auto ma **prędkość trwającą między turami** w punktach Ruchu (na ekranie
 * mil/h = Ruch × 5 — skala wydania angielskiego; polskie podaje km/h, Ruch 20
 * = 161 km/h, ale MG 19.11 zostaje przy milach). Kierowca w swojej turze
 * wciska gaz albo hamulec (bezwładność: +10 / −20 Ruchu), a auto przesuwa się
 * o różnicę między swoją prędkością a prędkością pościgu (auta kadru), plus
 * zryw z Wyścigu i Nitro. Wszystko poniżej to zasady domowe — podręcznik
 * opisuje pościg tylko Testami i Manewrami (s. 191–192).
 */

// ───────────────────────── Prędkość i pedały ─────────────────────────

/** Mile na godzinę na punkt Ruchu — jedna skala dla każdego pojazdu (MG, 19.11). */
export const CPRED_MPH_PER_MOVE = 5;
/** Ile punktów Ruchu to jedna kratka przesunięcia na rundę (zasada `Ruch / 4` z 65c). */
export const CPRED_MOVE_PER_SQUARE = 4;
/** Gaz: +10 Ruchu (+50 mil/h) na turę, najwyżej do Ruchu pojazdu (decyzja MG 4). */
export const CPRED_GAS_STEP = 10;
/** Hamulec: −20 Ruchu (−100 mil/h) na turę, najniżej do zera (decyzja MG 4). */
export const CPRED_BRAKE_STEP = 20;

export const CPRED_PEDALS = ['gas', 'brake'] as const;
/** Pedał wciśnięty w turze; `null` — jazda z tą samą prędkością (nic nie kosztuje). */
export type CpredPedal = (typeof CPRED_PEDALS)[number];

export function isCpredPedal(value: unknown): value is CpredPedal {
  return (CPRED_PEDALS as readonly unknown[]).includes(value);
}

/** Prędkość w punktach Ruchu → mile na godzinę na ekranie (kompakt Ruch 20 = 100). */
export function cpredSpeedMph(speed: number): number {
  return Math.round(Math.max(0, speed) * CPRED_MPH_PER_MOVE);
}

/** Mile na godzinę z pola MG → punkty Ruchu (prędkość startowa, poprawka MG). */
export function cpredMphToSpeed(mph: number): number {
  if (!Number.isFinite(mph)) return 0;
  return Math.max(0, Math.round(mph / CPRED_MPH_PER_MOVE));
}

/** Prędkość po pedale w tej turze, w granicach 0…Ruch pojazdu. */
export function cpredPedalSpeed(speed: number, maxSpeed: number, pedal: CpredPedal | null): number {
  const max = Math.max(0, maxSpeed);
  const now = Math.min(max, Math.max(0, speed));
  if (pedal === 'gas') return Math.min(max, now + CPRED_GAS_STEP);
  if (pedal === 'brake') return Math.max(0, now - CPRED_BRAKE_STEP);
  return now;
}

/** Dlaczego pedał jest wyszarzony: gaz przy maksimum, hamulec na postoju. */
export type CpredPedalProblem = 'AT_MAX_SPEED' | 'STANDING';

export const CPRED_PEDAL_PROBLEMS: Record<CpredPedalProblem, string> = {
  AT_MAX_SPEED: 'Auto jedzie już najszybciej, jak umie.',
  STANDING: 'Auto stoi — nie ma czego hamować.',
};

export function cpredPedalProblem(
  speed: number,
  maxSpeed: number,
  pedal: CpredPedal,
): CpredPedalProblem | null {
  if (pedal === 'gas') return speed >= maxSpeed ? 'AT_MAX_SPEED' : null;
  return speed <= 0 ? 'STANDING' : null;
}

/**
 * Prędkość auta na starcie walki: auto z kierowcą i pracującym silnikiem
 * dostaje prędkość startową sceny (dawne „Tempo”), najwyżej swój Ruch;
 * zgaszone, bez kierowcy i wrak — 0.
 */
export function cpredStartSpeed(
  maxSpeed: number,
  startSpeed: number,
  state: { started: boolean; driven: boolean; wrecked: boolean },
): number {
  if (!state.started || !state.driven || state.wrecked) return 0;
  return Math.min(Math.max(0, maxSpeed), Math.max(0, startSpeed));
}

// ───────────────────────── Przesunięcie w turze ─────────────────────────

export interface CpredDriveAdvanceInput {
  /** Prędkość auta po pedale (`cpredPedalSpeed`). */
  speed: number;
  /** Prędkość pościgu — auta kadru z początku rundy, stała w rundzie. */
  pursuitSpeed: number;
  /** Zryw z Wyścigu tej rundy w kratkach (`cpredRaceBonuses`). */
  raceBonus?: number;
  /** Ruch pojazdu, gdy kierowca odpalił w tej turze Nitro; inaczej 0. */
  nitroMove?: number;
}

/**
 * Przesunięcie auta wzdłuż drogi w turze jego kierowcy, w kratkach (ujemne —
 * w tył): `(prędkość − prędkość pościgu) / 4 + zryw + Nitro`. Auto równie
 * szybkie jak kadr stoi, szybsze wysuwa się do przodu, wolniejsze zostaje.
 * Nitro dokłada jednorazowo `Ruch / 4` i prędkości trwałej nie zmienia.
 */
export function cpredDriveAdvance(input: CpredDriveAdvanceInput): number {
  const relative = Math.max(0, input.speed) - Math.max(0, input.pursuitSpeed);
  const nitro = Math.max(0, input.nitroMove ?? 0);
  return (relative + nitro) / CPRED_MOVE_PER_SQUARE + Math.max(0, input.raceBonus ?? 0);
}

/** Ile kratek auto o tej prędkości przejeżdża po drodze w rundzie — prognoza przeszkody. */
export function cpredRoadSquaresPerRound(speed: number): number {
  return Math.max(0, speed) / CPRED_MOVE_PER_SQUARE;
}

// ───────────────────────── Wyścig ─────────────────────────

/** Zryw: 1 kratka za każde 2 punkty przewagi nad najsłabszym wynikiem rundy… */
export const CPRED_RACE_POINTS_PER_SQUARE = 2;
/** …najwyżej 5 kratek. */
export const CPRED_RACE_BONUS_MAX = 5;

/**
 * Słaby kierowca (s. 192: Test zwykłej jazdy, gdy REF + Umiejętność
 * prowadzenia ≤ 9). Od etapu 72 próg liczy też Moto Nomady (NOM-03, decyzja
 * MG z 15.11) — Moto dolicza się do samego Testu, więc i do progu.
 */
export function cpredWeakDriver(ref: number, skill: number, moto = 0): boolean {
  return ref + skill + Math.max(0, moto) <= CPRED_DRIVING_TEST_THRESHOLD;
}

/**
 * Słaby kierowca z karty: REF „jak teraz”, poziom Umiejętności prowadzenia
 * właściwej dla pojazdu (z czipem) i Moto — te same liczby, które planer
 * rzutu kładzie w Teście Wyścigu, więc próg i rzut się nie rozjadą.
 */
export function cpredSheetWeakDriver(
  data: CpredCharacterData,
  registry: CpredRegistry,
  kind: CpredVehicleKind,
): boolean {
  const skillId = cpredVehicleSkillId(kind);
  return cpredWeakDriver(
    cpredEffectiveStat(data, 'ref'),
    cpredSkillLevel(data, skillId),
    cpredSheetMoto(data, registry),
  );
}

export interface CpredRaceEntry {
  /** Auto (albo kierowca) — klucz wyniku. */
  id: string;
  /** Wynik Testu Wyścigu (Cecha + Umiejętność + 1k10 z karami albo sama Cecha + 1k10). */
  total: number;
  /**
   * Słaby kierowca z pełną kartą (`cpredSheetWeakDriver`). Kierowca bez karty
   * (statysta, Wsparcie) nigdy — od samego rzutu kontroli nie traci (MG 15.11).
   */
  weak: boolean;
}

export interface CpredRaceResult {
  /** Kratki zrywu doliczane do ruchu w tej rundzie. */
  bonus: number;
  /** Rzut był Testem zwykłej jazdy słabego kierowcy i go nie zdał — utrata kontroli na rundę. */
  lostControl: boolean;
}

/**
 * Kto rzuca na początku rundy: przy co najmniej dwóch kierowcach w kadrze —
 * wszyscy (Wyścig), przy jednym — tylko słaby kierowca z pełną kartą, a jego
 * rzut jest samym Testem zwykłej jazdy bez zrywu (decyzja MG z 19.11: reguła
 * s. 192 działa także w samotnym aucie). Kolejność wejścia zostaje.
 */
export function cpredRaceRollers<T extends { weak: boolean }>(drivers: readonly T[]): T[] {
  return drivers.length >= 2 ? [...drivers] : drivers.filter((driver) => driver.weak);
}

/**
 * Wyścig rundy (Test przeciwstawny Prowadzenia, decyzja MG 6): zryw każdego
 * kierowcy to `floor((wynik − najniższy wynik) / 2)` kratek, najwyżej 5;
 * najsłabszy ma 0. Przy jednym kierowcy zrywu nie ma.
 *
 * Słaby kierowca zdaje jazdę, gdy wynik przewyższa PT 10 (jak każdy Test —
 * `cpredCheckOutcome`); inaczej traci kontrolę i zrywu nie dostaje, ale jego
 * wynik dalej jest „najniższym” dla reszty — przegrał wyścig.
 */
export function cpredRaceBonuses(
  entries: readonly CpredRaceEntry[],
): Record<string, CpredRaceResult> {
  const results: Record<string, CpredRaceResult> = {};
  if (entries.length === 0) return results;
  const lowest = Math.min(...entries.map((entry) => entry.total));
  for (const entry of entries) {
    const lostControl = entry.weak && entry.total <= CPRED_DRIVING_TEST_DV;
    const lead = Math.floor((entry.total - lowest) / CPRED_RACE_POINTS_PER_SQUARE);
    results[entry.id] = {
      bonus: lostControl || entries.length < 2 ? 0 : Math.min(CPRED_RACE_BONUS_MAX, lead),
      lostControl,
    };
  }
  return results;
}

// ───────────────────────── Utrata kontroli ─────────────────────────

/** Utrata kontroli zbija prędkość od razu o 10 Ruchu (−50 mil/h). */
export const CPRED_LOST_CONTROL_SLOWDOWN = 10;

export interface CpredLostControlMove {
  /** Prędkość po utracie kontroli. */
  speed: number;
  /** Zmiana pasa: −1 — pas wyżej (w stronę `road.from`), 0 — prosto, +1 — pas niżej. */
  laneDelta: -1 | 0 | 1;
  /** Wynik 1k6 do karty czatu. */
  die: number;
}

/**
 * Automat utraty kontroli (zasada domowa w miejsce „MG wyznacza ruch”):
 * prędkość −10 Ruchu, a 1k6 wybiera tor — 1–2 pas wyżej, 3–4 prosto, 5–6 pas
 * niżej. Auto przy krawędzi jezdni zostaje na pasie — przycina wołający
 * (`chaseLaneTarget`), bo tylko on zna liczbę pasów.
 */
export function cpredLostControlMove(speed: number, rng: DiceRng): CpredLostControlMove {
  const die = rng(6);
  const laneDelta: -1 | 0 | 1 = die <= 2 ? -1 : die <= 4 ? 0 : 1;
  return { speed: Math.max(0, speed - CPRED_LOST_CONTROL_SLOWDOWN), laneDelta, die };
}

// ───────────────────────── Zderzenie na drodze ruchu ─────────────────────────

/**
 * „Zwolnij za nim” — auto staje przy zderzaku blokującego i przyjmuje jego
 * prędkość, bez Testu, gdy wystarcza zwykły hamulec: różnica prędkości
 * najwyżej 100 mil/h (`CPRED_BRAKE_STEP`). Przy większej zostaje taran,
 * zmiana pasa albo Manewr. `speed` to prędkość z początku tury, sprzed pedału.
 */
export function cpredCanSlowBehind(speed: number, blockerSpeed: number): boolean {
  return Math.max(0, speed) - Math.max(0, blockerSpeed) <= CPRED_BRAKE_STEP;
}

/** Prędkość po „Zwolnij za nim”: blokującego, najwyżej Ruch własnego auta. */
export function cpredSlowBehindSpeed(blockerSpeed: number, maxSpeed: number): number {
  return Math.min(Math.max(0, maxSpeed), Math.max(0, blockerSpeed));
}
