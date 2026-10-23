/**
 * Rozbrajanie pułapki przez gracza (etap 58b, decyzje MG z 22.10).
 *
 * Strefa bronioną jest rdzeniem (`zones.ts`): prostokąt, przełącznik, PW.
 * To, że rozbraja ją Test Elektroniki i zabezpieczeń z PT wpisu systemu
 * obronnego, że każda postać ma jedną próbę i że porażka o 5 i więcej
 * odpala system na rozbrajającego — to jest Cyberpunk RED i mieszka tutaj,
 * tak jak reguła zamka pojemnika mieszka w `container.ts`.
 *
 * Porażka o 5+ to **zasada domowa** (podręcznik jej nie mówi; decyzja MG 2).
 * „Porażka o N” liczy się jak przy każdym Teście: PT minus wynik, więc wynik
 * równy PT to porażka o 0, a o 5 — wynik PT − 5 i niżej.
 */

import type { CpredLockSkill } from './lock.js';

/** Umiejętność rozbrajania — „PT 13 Elektronika i zabezpieczenia” (s. 216). */
export const CPRED_DISARM_SKILL_ID: CpredLockSkill = 'electronics-security';

/** Od tylu punktów porażki system odpala się na rozbrajającego (decyzja MG 2). */
export const CPRED_DISARM_BACKFIRE_MARGIN = 5;

/** Ile postaci po nieudanej próbie pamięta jedna strefa — jak zamek. */
export const CPRED_DISARM_TRIED_MAX = 64;

/**
 * PT rozbrojenia tej strefy: nadpisanie MG na strefie wygrywa z wpisem
 * kompendium. `null` — system, którego ręką rozbroić się nie da (wpis bez PT
 * i bez nadpisania), np. wieżyczka, którą wyłącza się węzłem albo kulą.
 */
export function cpredTrapDisarmDv(
  zoneOverride: number | null | undefined,
  entryDv: number | undefined,
): number | null {
  if (typeof zoneOverride === 'number') return zoneOverride;
  return entryDv ?? null;
}

export type CpredTrapDisarmRefusal = 'ZONE_NO_DISARM' | 'DISARM_IN_COMBAT' | 'DISARM_TRIED';

/** Czy ta postać może teraz próbować — rozstrzyga reguła, serwer tylko ją wykonuje. */
export type CpredTrapDisarmOpening =
  | { kind: 'test'; skillId: CpredLockSkill; dv: number }
  | { kind: 'refused'; error: CpredTrapDisarmRefusal };

export function cpredTrapDisarmOpening(input: {
  dv: number | null;
  tried: readonly string[];
  characterId: string;
  inCombat: boolean;
}): CpredTrapDisarmOpening {
  if (input.dv === null) return { kind: 'refused', error: 'ZONE_NO_DISARM' };
  // Rozbrajanie trwa minuty (`disableMinutes`), a runda — trzy sekundy
  // (decyzja MG 3): w walce nie ma na nie czasu.
  if (input.inCombat) return { kind: 'refused', error: 'DISARM_IN_COMBAT' };
  if (input.tried.includes(input.characterId)) return { kind: 'refused', error: 'DISARM_TRIED' };
  return { kind: 'test', skillId: CPRED_DISARM_SKILL_ID, dv: input.dv };
}

/** Co zrobił Test: rozbroił, nie rozbroił, czy odpalił system na rozbrajającego. */
export type CpredTrapDisarmOutcome = 'disarmed' | 'kept' | 'backfire';

/**
 * Werdykt Testu rozbrajania. `success` przychodzi z rzutu (ta sama reguła
 * „wynik > PT” co każdy Test), a `total` i `dv` mówią tylko, o ile się nie udało.
 */
export function cpredTrapDisarmOutcome(
  success: boolean,
  total: number,
  dv: number,
): CpredTrapDisarmOutcome {
  if (success) return 'disarmed';
  return dv - total >= CPRED_DISARM_BACKFIRE_MARGIN ? 'backfire' : 'kept';
}

/** Lista prób po nieudanym Teście — postać raz, najnowsze na końcu. */
export function cpredTrapDisarmTried(tried: readonly string[], characterId: string): string[] {
  if (tried.includes(characterId)) return [...tried];
  return [...tried, characterId].slice(-CPRED_DISARM_TRIED_MAX);
}
