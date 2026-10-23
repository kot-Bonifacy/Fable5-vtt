/**
 * Zamek w CP RED — jedna reguła dla pojemnika (etap 46b) i otworu: drzwi, okna,
 * bramy (etap 58c).
 *
 * Wyjęte z `container.ts` przy etapie 58c (decyzja MG 4 z 22.10: „zamknięte na
 * klucz drzwi działają jak pojemnik”). Zamek otwiera Test Otwierania zamków
 * albo Elektroniki i zabezpieczeń z PT ustawionym przez MG, klucz to wiersz
 * wyposażenia z tym samym uchwytem, a **każda postać ma jedną próbę** (decyzja
 * MG z 09.10: podręcznik nie pozwala powtarzać nieudanego Testu, dopóki nic się
 * nie zmieni — „Pozwól spróbować znowu” zeruje listę).
 *
 * Stan zamka (otwarte / zamknięte / na zamek) trzyma właściciel: pojemnik
 * w polu `lock` karty, otwór w kolumnach ściany rdzenia (`open`, `locked`).
 * Tu mieszka tylko to, czego rdzeń nie wie — czym i z jakim progiem się go
 * otwiera, i kto już próbował.
 */

import { CHECK_CALL_DV_MAX, CHECK_CALL_DV_MIN } from '../../checks.js';

/** Umiejętności, którymi otwiera się zamek (decyzja MG 14 z etapu 46b). */
export const CPRED_LOCK_SKILLS = ['pick-lock', 'electronics-security'] as const;
export type CpredLockSkill = (typeof CPRED_LOCK_SKILLS)[number];

export function isCpredLockSkill(value: unknown): value is CpredLockSkill {
  return (CPRED_LOCK_SKILLS as readonly unknown[]).includes(value);
}

/** PT zamka, gdy MG go nie ustawił — „Codzienny” z drabinki s. 129. */
export const CPRED_LOCK_DV_DEFAULT = 13;

/** Ile postaci po nieudanej próbie pamięta jeden zamek — zabezpieczenie zapisu. */
export const CPRED_LOCK_TRIED_MAX = 64;

const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{6,40}$/;

/** Czy to wygląda na uchwyt klucza (losowy, nie id karty — gracz nie poznaje id kart, #40). */
export function isCpredKeyId(value: unknown): value is string {
  return typeof value === 'string' && KEY_ID_PATTERN.test(value);
}

/** Czym i z jakim progiem otwiera się zamek. */
export interface CpredLock {
  /** PT Testu zamka. */
  dv: number;
  /** Czym wolno próbować; nigdy pusta. */
  skills: CpredLockSkill[];
  /** Uchwyt kluczy wydanych przez MG; `null` — żadnego klucza jeszcze nie ma. */
  keyId: string | null;
  /** Karty postaci, które nie zdały Testu zamka (jedna próba na postać). */
  tried: string[];
}

export function createCpredLock(overrides: Partial<CpredLock> = {}): CpredLock {
  return {
    dv: CPRED_LOCK_DV_DEFAULT,
    skills: ['pick-lock'],
    keyId: null,
    tried: [],
    ...overrides,
  };
}

/**
 * Zamek z zapisu — zawsze jakiś. Wyrozumiałe dla drobiazgów: nieznana
 * Umiejętność wypada z listy, pusta lista wraca do Otwierania zamków, a zły PT
 * do domyślnego — zamek z literówką ma się dać otworzyć, a nie wywrócić kartę
 * albo ścianę. Brak zapisu (drzwi zaryglowane przed etapem 58c) to zamek
 * domyślny.
 */
export function readCpredLock(raw: unknown): CpredLock {
  const value =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Partial<Record<keyof CpredLock, unknown>>)
      : {};
  const dv =
    typeof value.dv === 'number' &&
    Number.isInteger(value.dv) &&
    value.dv >= CHECK_CALL_DV_MIN &&
    value.dv <= CHECK_CALL_DV_MAX
      ? value.dv
      : CPRED_LOCK_DV_DEFAULT;
  const skills = Array.isArray(value.skills)
    ? [...new Set(value.skills.filter(isCpredLockSkill))]
    : [];
  const tried = Array.isArray(value.tried)
    ? [
        ...new Set(
          value.tried.filter((id): id is string => typeof id === 'string' && id.length > 0),
        ),
      ].slice(-CPRED_LOCK_TRIED_MAX)
    : [];
  return {
    dv,
    skills: skills.length > 0 ? skills : ['pick-lock'],
    keyId: isCpredKeyId(value.keyId) ? value.keyId : null,
    tried,
  };
}

/** Stan zamka u właściciela: otwarte, zamknięte (jedno kliknięcie), na zamek. */
export type CpredLockState = 'open' | 'closed' | 'locked';

/** Co się dzieje po „Otwórz” — rozstrzyga czysta reguła, serwer tylko ją wykonuje. */
export type CpredLockOpening =
  | { kind: 'already-open' }
  | { kind: 'open'; via: 'click' | 'key' | 'gm' }
  | { kind: 'test'; skillId: CpredLockSkill; dv: number }
  | { kind: 'refused'; error: 'LOCK_TRIED' | 'LOCK_SKILL' };

export function cpredLockOpening(
  state: CpredLockState,
  lock: CpredLock,
  opener: { characterId: string; isGm: boolean; hasKey: boolean; skillId?: string },
): CpredLockOpening {
  if (state === 'open') return { kind: 'already-open' };
  if (state === 'closed') return { kind: 'open', via: 'click' };
  // Na zamek. MG otwiera ręką, klucz bez Testu (decyzja MG 14) — i klucz
  // działa także po nieudanej próbie: nie wytrych zawiódł, tylko postać.
  if (opener.isGm) return { kind: 'open', via: 'gm' };
  if (opener.hasKey) return { kind: 'open', via: 'key' };
  if (lock.tried.includes(opener.characterId)) return { kind: 'refused', error: 'LOCK_TRIED' };
  const skillId = opener.skillId ?? lock.skills[0]!;
  if (!isCpredLockSkill(skillId) || !lock.skills.includes(skillId)) {
    return { kind: 'refused', error: 'LOCK_SKILL' };
  }
  return { kind: 'test', skillId, dv: lock.dv };
}

/** Zamek po niezdanym Teście: postać trafia na listę prób (raz). */
export function cpredLockTried<T extends CpredLock>(lock: T, characterId: string): T {
  if (lock.tried.includes(characterId)) return lock;
  return { ...lock, tried: [...lock.tried, characterId].slice(-CPRED_LOCK_TRIED_MAX) };
}
