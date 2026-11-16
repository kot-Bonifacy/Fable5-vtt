/**
 * Pogłoski i publikacje Media jako stan gry (etap 71f; G28, G29, G30; s. 151–152).
 *
 *  - **G28 (MDA-04)** — „przynajmniej dwa razy na tydzień MG wykonuje potajemny
 *    Test”: karta liczy rzuty Pogłosek w tygodniu kalendarza świata
 *    (`rumourWeek`), panel MG pokazuje „1 / 2”, a przemiatanie zegara
 *    przypomina MG, gdy tydzień minął bez dwóch;
 *  - **G29 (MDA-05)** — aktywne szukanie to zwykły Test Umiejętności o PT
 *    z tabeli: tu mieszkają trzy Umiejętności, którymi się szuka, a skrót
 *    w panelu wystawia wezwanie (MG) albo prośbę o Test (gracz);
 *  - **G30 (MDA-10)** — rejestr publikacji na karcie (temat, data świata,
 *    dowody, wynik). Tego samego tematu nie publikuje się ponownie „bez
 *    nowych informacji” — powtórka wymaga zaznaczenia, że są, i zostaje
 *    w rejestrze oznaczona; czy informacje naprawdę są nowe, ocenia MG.
 *
 * Czysta logika, bez importu wartości z `character.ts`.
 */

import { gameWeekIndex } from '../../gametime.js';
import {
  CPRED_PROOF_LEVELS,
  CPRED_RUMOUR_ROLLS_PER_WEEK,
  type CpredProofLevel,
} from './roleability.js';

// ───────────────────────── G28 — licznik tygodnia ─────────────────────────

/** Rzuty Pogłosek MG w jednym tygodniu kalendarza świata. */
export interface CpredRumourWeek {
  /** `gameWeekIndex` tygodnia, którego dotyczy licznik. */
  week: number;
  rolls: number;
}

export function readCpredRumourWeek(raw: unknown): CpredRumourWeek | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.week !== 'number' || !Number.isInteger(row.week)) return null;
  const rolls =
    typeof row.rolls === 'number' && Number.isInteger(row.rolls) && row.rolls > 0
      ? Math.min(row.rolls, 99)
      : 0;
  return { week: row.week, rolls };
}

/** Ile razy MG rzucał Pogłoski w bieżącym tygodniu. */
export function cpredRumourRollsThisWeek(
  state: CpredRumourWeek | null,
  nowMinutes: number,
): number {
  return state && state.week === gameWeekIndex(nowMinutes) ? state.rolls : 0;
}

/** Licznik po rzucie Pogłosek. */
export function cpredRumourWeekAfterRoll(
  state: CpredRumourWeek | null,
  nowMinutes: number,
): CpredRumourWeek {
  return {
    week: gameWeekIndex(nowMinutes),
    rolls: cpredRumourRollsThisWeek(state, nowMinutes) + 1,
  };
}

/**
 * Przemiatanie zegara: co zrobić z licznikiem, gdy zegar stoi w `nowMinutes`.
 *
 * `missed` to liczba rzutów w tygodniu, który właśnie minął bez dwóch — MG
 * dostaje przypomnienie. Karta bez licznika zaczyna liczyć po cichu (nie
 * wiadomo, co działo się wcześniej); zegar cofnięty też tylko przestawia
 * tydzień. `next === null` znaczy „bez zmian”.
 */
export function cpredRumourWeekSweep(
  state: CpredRumourWeek | null,
  nowMinutes: number,
): { next: CpredRumourWeek | null; missed: number | null } {
  const week = gameWeekIndex(nowMinutes);
  if (state && state.week === week) return { next: null, missed: null };
  const next = { week, rolls: 0 };
  if (!state || state.week > week) return { next, missed: null };
  return {
    next,
    missed: state.rolls < CPRED_RUMOUR_ROLLS_PER_WEEK ? state.rolls : null,
  };
}

// ───────────────────────── G29 — aktywne szukanie ─────────────────────────

/** Trzy Umiejętności aktywnego szukania (s. 151) — po nazwie, jak broń Wsparcia. */
export const CPRED_RUMOUR_SEARCH_SKILL_NAMES: readonly string[] = [
  'Przeszukiwanie baz danych',
  'Konwersacja',
  'Przesłuchiwanie',
];

/** Umiejętności szukania pogłosek, które zna rejestr tej instalacji. */
export function cpredRumourSearchSkills<T extends { id: string; name: string }>(
  skills: readonly T[],
): T[] {
  const byName = new Map(skills.map((skill) => [skill.name.trim().toLowerCase(), skill]));
  return CPRED_RUMOUR_SEARCH_SKILL_NAMES.flatMap((name) => {
    const skill = byName.get(name.toLowerCase());
    return skill ? [skill] : [];
  });
}

// ───────────────────────── G30 — rejestr publikacji ─────────────────────────

export interface CpredPublication {
  id: string;
  topic: string;
  /** Minuta zegara świata, w której materiał poszedł. */
  atMinute: number;
  proof: CpredProofLevel;
  believed: boolean;
  /** Powtórka tematu „z nowymi informacjami” — zaznaczył to publikujący. */
  again?: true;
}

/** Rejestr trzyma najnowsze; starsze wypadają. */
export const CPRED_PUBLICATIONS_MAX = 40;
export const CPRED_PUBLICATION_TOPIC_MAX = 80;

export function readCpredPublications(raw: unknown): CpredPublication[] {
  if (!Array.isArray(raw)) return [];
  const list: CpredPublication[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || row.id.length === 0 || row.id.length > 40) continue;
    if (seen.has(row.id)) continue;
    const topic =
      typeof row.topic === 'string' ? row.topic.trim().slice(0, CPRED_PUBLICATION_TOPIC_MAX) : '';
    if (topic.length === 0) continue;
    if (typeof row.atMinute !== 'number' || !Number.isFinite(row.atMinute)) continue;
    if (!(CPRED_PROOF_LEVELS as readonly unknown[]).includes(row.proof)) continue;
    seen.add(row.id);
    list.push({
      id: row.id,
      topic,
      atMinute: Math.round(row.atMinute),
      proof: row.proof as CpredProofLevel,
      believed: row.believed === true,
      ...(row.again === true ? { again: true as const } : {}),
    });
  }
  return list.slice(-CPRED_PUBLICATIONS_MAX);
}

/** Temat do porównania: bez wielkości liter i zbędnych odstępów. */
export function cpredTopicKey(topic: string): string {
  return topic.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function cpredTopicPublished(list: readonly CpredPublication[], topic: string): boolean {
  const key = cpredTopicKey(topic);
  return key.length > 0 && list.some((row) => cpredTopicKey(row.topic) === key);
}

export type CpredPublicationProblem = 'NO_TOPIC' | 'ALREADY_PUBLISHED' | 'PUBLICATION_NOT_FOUND';

export const CPRED_PUBLICATION_PROBLEMS: Record<CpredPublicationProblem, string> = {
  NO_TOPIC: 'Publikacja potrzebuje tematu — wpisz, o czym jest materiał.',
  ALREADY_PUBLISHED:
    'Ten temat już poszedł — ponownie tylko z nowymi informacjami (zaznacz to przy publikacji).',
  PUBLICATION_NOT_FOUND: 'Nie ma takiej publikacji.',
};

export function cpredPublicationProblem(
  list: readonly CpredPublication[],
  topic: unknown,
  newInfo: boolean,
): CpredPublicationProblem | null {
  if (typeof topic !== 'string' || cpredTopicKey(topic).length === 0) return 'NO_TOPIC';
  if (topic.trim().length > CPRED_PUBLICATION_TOPIC_MAX) return 'NO_TOPIC';
  if (!newInfo && cpredTopicPublished(list, topic)) return 'ALREADY_PUBLISHED';
  return null;
}

/** Rejestr z nowym wpisem na końcu, przycięty do najnowszych. */
export function cpredPublicationsWith(
  list: readonly CpredPublication[],
  entry: CpredPublication,
): CpredPublication[] {
  return [...list, entry].slice(-CPRED_PUBLICATIONS_MAX);
}
