/**
 * Pojemnik w CP RED (etap 46b) — zamek, klucz i Test, którym się go otwiera.
 *
 * Pojemnik jest kartą z polem `container` (decyzja MG 13 z 08.10.2026): bez
 * Cech, PW i inicjatywy, z ekwipunkiem jako zawartością. Ten plik trzyma to,
 * czego rdzeń (`containers.ts`) nie wie. Reguła samego zamka (Test, klucz,
 * jedna próba na postać) od etapu 58c jest wspólna z drzwiami — `lock.ts`.
 *
 * Moduł nie importuje `character.ts` w czasie wykonania, bo to `character.ts`
 * czyta stąd walidację pola. Karta pojemnika i operacje na ekwipunku
 * mieszkają w `containercard.ts`.
 */

import { isContainerLock, type ContainerLock } from '../../containers.js';
import {
  cpredLockOpening,
  createCpredLock,
  cpredLockTried,
  readCpredLock,
  type CpredLock,
  type CpredLockOpening,
} from './lock.js';

/** Pole `container` karty pojemnika. */
export interface CpredContainer extends CpredLock {
  lock: ContainerLock;
  /** Stos z upuszczenia — znika razem z kartą, gdy jest pusty. */
  pile: boolean;
}

export function createCpredContainer(overrides: Partial<CpredContainer> = {}): CpredContainer {
  return { lock: 'open', ...createCpredLock(), pile: false, ...overrides };
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
  return { lock: value.lock, ...readCpredLock(value), pile: value.pile === true };
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

/** Co się dzieje po „Otwórz” pojemnika — wspólna reguła zamka (`lock.ts`). */
export type CpredContainerOpening = CpredLockOpening;

export function cpredContainerOpening(
  container: CpredContainer,
  opener: { characterId: string; isGm: boolean; hasKey: boolean; skillId?: string },
): CpredContainerOpening {
  return cpredLockOpening(container.lock, container, opener);
}

/** Zamek po Teście: zdany otwiera, niezdany zapisuje postać na liście prób. */
export function cpredLockTestSettled(
  container: CpredContainer,
  characterId: string,
  success: boolean,
): CpredContainer {
  if (success) return { ...container, lock: 'open' };
  return cpredLockTried(container, characterId);
}
