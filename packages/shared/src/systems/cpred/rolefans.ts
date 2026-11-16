/**
 * Fani Rockera jako stan gry (etap 71f, G27 i P2; s. 144).
 *
 * Do 71f Efekt Charyzmy był samym rzutem: „ci fani” istnieli tylko w głowach
 * przy stole, a tydzień po nieudanej prośbie — tylko w zdaniu na karcie rzutu.
 * Teraz liczy się to, co da się policzyć:
 *
 *  - **grupy fanów są listą na karcie** (nazwa, wielkość publiczności); udany
 *    Test „nowi fani” dopisuje grupę sam, a kto już jest fanem bez rzutu,
 *    rozstrzyga MG („Dodaj” w panelu);
 *  - **prośba pada do konkretnej grupy** tej wielkości — bez grupy na karcie
 *    nie ma kogo prosić („Zdolność działa tylko na fanach”);
 *  - **nieudana prośba zamyka grupę na 7 dni kalendarza świata**; termin stoi
 *    na wierszu, a blokadę przed czasem zdejmuje MG (to on wie, czy następna
 *    prośba jest „o to samo”);
 *  - **nowych fanów nie robi się w walce** (decyzja bramki P2) — odmowa
 *    serwera, tekst niżej.
 *
 * Treść prośby i to, czy mieści się w szczeblu, dalej ocenia MG.
 *
 * Czysta logika, bez importu wartości z `character.ts`.
 */

import { MINUTES_PER_DAY } from '../../gametime.js';
import {
  CPRED_CHARISMA_AUDIENCES,
  CPRED_CHARISMA_REFUSAL_DAYS,
  type CpredCharismaAudience,
} from './roleability.js';

export interface CpredFanGroup {
  id: string;
  /** „Bywalcy klubu”, „Ochroniarz z bramki” — pisze gracz albo MG. */
  name: string;
  audience: CpredCharismaAudience;
  /** Minuta zegara świata, do której grupa nie spełni prośby (nieudany Test). */
  blockedUntilMinute?: number;
  /** O co proszono, gdy odmówili — do wiersza na karcie. */
  blockedWhat?: string;
}

export const CPRED_FANS_MAX = 24;
export const CPRED_FAN_NAME_MAX = 60;
export const CPRED_FAN_NOTE_MAX = 80;

export function readCpredFans(raw: unknown): CpredFanGroup[] {
  if (!Array.isArray(raw)) return [];
  const fans: CpredFanGroup[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || row.id.length === 0 || row.id.length > 40) continue;
    if (seen.has(row.id)) continue;
    if (!(CPRED_CHARISMA_AUDIENCES as readonly unknown[]).includes(row.audience)) continue;
    const name = typeof row.name === 'string' ? row.name.trim().slice(0, CPRED_FAN_NAME_MAX) : '';
    if (name.length === 0) continue;
    const until = row.blockedUntilMinute;
    const blocked = typeof until === 'number' && Number.isInteger(until) && until > 0;
    seen.add(row.id);
    fans.push({
      id: row.id,
      name,
      audience: row.audience as CpredCharismaAudience,
      ...(blocked ? { blockedUntilMinute: until } : {}),
      ...(blocked && typeof row.blockedWhat === 'string' && row.blockedWhat.trim().length > 0
        ? { blockedWhat: row.blockedWhat.trim().slice(0, CPRED_FAN_NOTE_MAX) }
        : {}),
    });
  }
  return fans.slice(0, CPRED_FANS_MAX);
}

/** Czy ta grupa dalej pamięta odmowę — termin mija sam, bez przemiatania. */
export function cpredFanGroupBlocked(group: CpredFanGroup, nowMinutes: number): boolean {
  return group.blockedUntilMinute !== undefined && nowMinutes < group.blockedUntilMinute;
}

/** Termin blokady po nieudanej prośbie: 7 dób zegara świata od rzutu. */
export function cpredFanRefusalUntil(nowMinutes: number): number {
  return nowMinutes + CPRED_CHARISMA_REFUSAL_DAYS * MINUTES_PER_DAY;
}

export type CpredFansProblem =
  'NO_FAN_GROUP' | 'FANS_REFUSED' | 'FANS_IN_COMBAT' | 'TOO_MANY_FANS' | 'BAD_FAN_NAME';

export const CPRED_FANS_PROBLEMS: Record<CpredFansProblem, string> = {
  NO_FAN_GROUP:
    'Prośba pada do grupy fanów tej wielkości z twojej karty — najpierw ich zdobądź albo poproś MG o wpis.',
  FANS_REFUSED: 'Ci fani niedawno odmówili — poczekaj do terminu na karcie albo zapytaj MG.',
  FANS_IN_COMBAT: 'Nowych fanów nie robi się w walce — poczekaj na koniec starcia.',
  TOO_MANY_FANS: 'Na karcie nie zmieści się więcej grup fanów — MG może którąś usunąć.',
  BAD_FAN_NAME: 'Grupa fanów potrzebuje nazwy.',
};

/**
 * Czy prośbę wolno skierować do tej grupy. Bez zegara (`nowMinutes === null`,
 * podgląd planera) blokada czasu nie jest sprawdzana — rozstrzyga serwer.
 */
export function cpredFavourProblem(
  fans: readonly CpredFanGroup[],
  groupId: unknown,
  audience: CpredCharismaAudience,
  nowMinutes: number | null,
): CpredFansProblem | null {
  const group = fans.find((row) => row.id === groupId);
  if (!group || group.audience !== audience) return 'NO_FAN_GROUP';
  if (nowMinutes !== null && cpredFanGroupBlocked(group, nowMinutes)) return 'FANS_REFUSED';
  return null;
}

/** Lista po nieudanej prośbie: ta grupa zamknięta na tydzień. */
export function cpredFansAfterRefusal(
  fans: readonly CpredFanGroup[],
  groupId: string,
  nowMinutes: number,
  what: string,
): CpredFanGroup[] {
  const note = what.trim().slice(0, CPRED_FAN_NOTE_MAX);
  return fans.map((row) =>
    row.id === groupId
      ? {
          id: row.id,
          name: row.name,
          audience: row.audience,
          blockedUntilMinute: cpredFanRefusalUntil(nowMinutes),
          ...(note ? { blockedWhat: note } : {}),
        }
      : row,
  );
}

/** Zdejmuje blokadę (MG) — wiersz bez dwóch pól, nie z pustymi. */
export function cpredFansUnblocked(
  fans: readonly CpredFanGroup[],
  groupId: string,
): CpredFanGroup[] {
  return fans.map((row) =>
    row.id === groupId ? { id: row.id, name: row.name, audience: row.audience } : row,
  );
}

/** Domyślna nazwa grupy, gdy gracz nie wpisał, kogo zdobył. */
export const CPRED_FAN_DEFAULT_NAMES: Record<CpredCharismaAudience, string> = {
  single: 'Nowy fan',
  small: 'Nowi fani — mała grupa',
  large: 'Nowi fani — duża grupa',
};

/** Lista z nową grupą albo `null`, gdy karta jest pełna. */
export function cpredFansWithGroup(
  fans: readonly CpredFanGroup[],
  group: { id: string; name: string; audience: CpredCharismaAudience },
): CpredFanGroup[] | null {
  if (fans.length >= CPRED_FANS_MAX) return null;
  const name = group.name.trim().slice(0, CPRED_FAN_NAME_MAX);
  return [
    ...fans,
    {
      id: group.id,
      name: name || CPRED_FAN_DEFAULT_NAMES[group.audience],
      audience: group.audience,
    },
  ];
}
