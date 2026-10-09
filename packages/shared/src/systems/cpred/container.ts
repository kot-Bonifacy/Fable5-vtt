/**
 * Pojemnik w CP RED (etap 46b) — zamek, klucz i Test, którym się go otwiera.
 *
 * Pojemnik jest kartą z polem `container` (decyzja MG 13 z 08.10.2026): bez
 * Cech, PW i inicjatywy, z ekwipunkiem jako zawartością. Ten plik trzyma to,
 * czego rdzeń (`containers.ts`) nie wie: że zamek otwiera Test Otwierania
 * zamków albo Elektroniki i zabezpieczeń z PT ustawionym przez MG, że klucz to
 * wiersz wyposażenia, i że **każda postać ma jedną próbę** (decyzja MG z 09.10:
 * podręcznik nie pozwala powtarzać nieudanego Testu, dopóki nic się nie zmieni
 * — „Pozwól spróbować znowu” zeruje listę).
 *
 * Moduł nie importuje `character.ts` w czasie wykonania, bo to `character.ts`
 * czyta stąd walidację pola. Karta pojemnika i operacje na ekwipunku
 * mieszkają w `containercard.ts`.
 */

import { CHECK_CALL_DV_MAX, CHECK_CALL_DV_MIN } from '../../checks.js';
import { isContainerLock, type ContainerLock } from '../../containers.js';

/** Umiejętności, którymi otwiera się zamek (decyzja MG 14). */
export const CPRED_LOCK_SKILLS = ['pick-lock', 'electronics-security'] as const;
export type CpredLockSkill = (typeof CPRED_LOCK_SKILLS)[number];

export function isCpredLockSkill(value: unknown): value is CpredLockSkill {
  return (CPRED_LOCK_SKILLS as readonly unknown[]).includes(value);
}

/** PT zamka, gdy MG go nie ustawił — „Trudne” z drabinki s. 129. */
export const CPRED_LOCK_DV_DEFAULT = 13;

/** Ile postaci po nieudanej próbie pamięta jeden zamek — zabezpieczenie zapisu. */
export const CPRED_LOCK_TRIED_MAX = 64;

const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{6,40}$/;

/** Czy to wygląda na uchwyt klucza (losowy, nie id karty — gracz nie poznaje id kart, #40). */
export function isCpredKeyId(value: unknown): value is string {
  return typeof value === 'string' && KEY_ID_PATTERN.test(value);
}

/** Pole `container` karty pojemnika. */
export interface CpredContainer {
  lock: ContainerLock;
  /** PT Testu zamka — czytany tylko przy `locked`. */
  dv: number;
  /** Czym wolno próbować; nigdy pusta. */
  skills: CpredLockSkill[];
  /** Uchwyt kluczy wydanych przez MG; `null` — żadnego klucza jeszcze nie ma. */
  keyId: string | null;
  /** Stos z upuszczenia — znika razem z kartą, gdy jest pusty. */
  pile: boolean;
  /** Karty postaci, które nie zdały Testu zamka (jedna próba na postać). */
  tried: string[];
}

export function createCpredContainer(overrides: Partial<CpredContainer> = {}): CpredContainer {
  return {
    lock: 'open',
    dv: CPRED_LOCK_DV_DEFAULT,
    skills: ['pick-lock'],
    keyId: null,
    pile: false,
    tried: [],
    ...overrides,
  };
}

/**
 * Pole `container` z zapisu karty albo `null`, gdy go nie ma; `undefined`,
 * gdy jest, ale zepsute (walidacja karty zgłasza wtedy problem).
 *
 * Wyrozumiałe dla drobiazgów: nieznana Umiejętność wypada z listy, pusta lista
 * wraca do Otwierania zamków, a zły PT do domyślnego — zamek z literówką ma się
 * dać otworzyć, a nie wywrócić kartę.
 */
export function readCpredContainer(raw: unknown): CpredContainer | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Partial<Record<keyof CpredContainer, unknown>>;
  if (!isContainerLock(value.lock)) return undefined;
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
    lock: value.lock,
    dv,
    skills: skills.length > 0 ? skills : ['pick-lock'],
    keyId: isCpredKeyId(value.keyId) ? value.keyId : null,
    pile: value.pile === true,
    tried,
  };
}

/**
 * Czy ta karta jest pojemnikiem — **jedno** pytanie dla każdej listy figur
 * (inicjatywa, cele ataku i wybuchu, oględziny, tura bota, rozliczenie
 * miesiąca, lista odbiorców przelewu; ryzyko 8 w pliku etapu).
 */
export function isContainerCard(sheet: { container?: CpredContainer | null }): boolean {
  return sheet.container !== null && sheet.container !== undefined;
}

/**
 * Szybkie pytanie o surowy zapis karty, bez parsowania całego arkusza — listy
 * figur zadają je dla każdego żetonu na scenie.
 */
export function isContainerCardJson(raw: string): boolean {
  if (!raw.includes('"container"')) return false;
  try {
    const parsed = JSON.parse(raw) as { container?: unknown };
    return readCpredContainer(parsed.container) != null;
  } catch {
    return false;
  }
}

/** Co się dzieje po „Otwórz” — rozstrzyga czysta reguła, serwer tylko ją wykonuje. */
export type CpredContainerOpening =
  | { kind: 'already-open' }
  | { kind: 'open'; via: 'click' | 'key' | 'gm' }
  | { kind: 'test'; skillId: CpredLockSkill; dv: number }
  | { kind: 'refused'; error: 'LOCK_TRIED' | 'LOCK_SKILL' };

export function cpredContainerOpening(
  container: CpredContainer,
  opener: { characterId: string; isGm: boolean; hasKey: boolean; skillId?: string },
): CpredContainerOpening {
  if (container.lock === 'open') return { kind: 'already-open' };
  if (container.lock === 'closed') return { kind: 'open', via: 'click' };
  // Na zamek. MG otwiera ręką, klucz bez Testu (decyzja MG 14) — i klucz
  // działa także po nieudanej próbie: nie wytrych zawiódł, tylko postać.
  if (opener.isGm) return { kind: 'open', via: 'gm' };
  if (opener.hasKey) return { kind: 'open', via: 'key' };
  if (container.tried.includes(opener.characterId)) return { kind: 'refused', error: 'LOCK_TRIED' };
  const skillId = opener.skillId ?? container.skills[0]!;
  if (!isCpredLockSkill(skillId) || !container.skills.includes(skillId)) {
    return { kind: 'refused', error: 'LOCK_SKILL' };
  }
  return { kind: 'test', skillId, dv: container.dv };
}

/** Zamek po Teście: zdany otwiera, niezdany zapisuje postać na liście prób. */
export function cpredLockTestSettled(
  container: CpredContainer,
  characterId: string,
  success: boolean,
): CpredContainer {
  if (success) return { ...container, lock: 'open' };
  if (container.tried.includes(characterId)) return container;
  return { ...container, tried: [...container.tried, characterId].slice(-CPRED_LOCK_TRIED_MAX) };
}
