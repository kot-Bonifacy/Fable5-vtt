/**
 * Licznik wezwań Wsparcia (etap 71f, G32; STR-14, s. 158).
 *
 * „Nadużywanie Wsparcia” kończy się zwolnieniem albo karą finansową od szefa —
 * to decyzja MG, nie automat. Żeby miał ją na czym oprzeć, karta Stróża Prawa
 * pamięta minuty zegara świata, w których **ktoś odpowiedział** na wezwanie,
 * a panel Wsparcia pokazuje MG, ile ich było dziś i w tym tygodniu kalendarza.
 *
 * Czysta logika, bez importu wartości z `character.ts`.
 */

import { MINUTES_PER_DAY, gameWeekIndex } from '../../gametime.js';

/** Tyle ostatnich wezwań pamięta karta. */
export const CPRED_BACKUP_CALLS_MAX = 30;

export function readCpredBackupCalls(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((value): value is number => typeof value === 'number' && Number.isInteger(value))
    .slice(-CPRED_BACKUP_CALLS_MAX);
}

export function cpredBackupCallsWith(calls: readonly number[], nowMinutes: number): number[] {
  return [...calls, nowMinutes].slice(-CPRED_BACKUP_CALLS_MAX);
}

/** Ile wezwań padło tej doby i w tym tygodniu kalendarza świata. */
export function cpredBackupCallCounts(
  calls: readonly number[],
  nowMinutes: number,
): { today: number; week: number } {
  const day = Math.floor(nowMinutes / MINUTES_PER_DAY);
  const week = gameWeekIndex(nowMinutes);
  return {
    today: calls.filter((minute) => Math.floor(minute / MINUTES_PER_DAY) === day).length,
    week: calls.filter((minute) => gameWeekIndex(minute) === week).length,
  };
}
