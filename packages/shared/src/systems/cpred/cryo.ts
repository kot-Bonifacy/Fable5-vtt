/**
 * Kriopompa i stan „w kriośnie” (etap 71d2, G19; s. 150 i s. 353).
 *
 * Obsługa kriosystemów była do 71d2 samą listą w panelu Medycyny
 * (`CPRED_CRYO_LEVELS`). Teraz liczy się to, co da się policzyć:
 *
 *  - **kriopompa jest wierszem Wyposażenia** (wpis `gear.kriopompa` albo
 *    nazwa „Kriopompa”) z licznikiem zużytych ładunków `cryoUsed`; ładunków
 *    jest 1, a u Medyka z 4 i 5 punktami Obsługi kriosystemów — 2 i 3;
 *  - **pierwszy punkt daje pompę** — raz, przyciskiem w panelu Medycyny
 *    (`cryoPumpGranted` na karcie), jak prezent Rodziny Nomady (71c1);
 *  - **zamrożenie** to Akcja Medyka (s. 353: „w ramach Akcji można podłączyć
 *    go do pompy”) i jeden ładunek; pacjent dostaje na kartę stan `cryo`
 *    z terminem tygodnia na zegarze świata — dopóki trwa, nie rzuca przeciw
 *    śmierci i leży nieprzytomny;
 *  - **uzupełnienie płynu** kosztuje 50 ed (Drogo) za ładunek — w cenniku
 *    domowym 47a cenę pasma Drogie sprzętu ogólnego.
 *
 * Prozą zostaje: zgoda przytomnego pacjenta (Medyk mówi przy stole, MG może
 * rozmrozić), osłona worka 15 PW (MG stawia osłonę na mapie), kriozbiorniki
 * z punktów 2–5 (dostęp i własne zbiorniki to miejsca, nie przedmioty).
 *
 * Czysta logika, bez importu wartości z `character.ts` — to `character.ts`
 * czyta stąd czytnik stanu.
 */

import type { CostCategory } from './compendium.js';
import { CPRED_PRICE_SCALE_CONSUMABLE } from './pricing.js';

/** Wpis Kompendium kriopompy (s. 353) — id z importera, stabilne. */
export const CPRED_CRYOPUMP_ENTRY_ID = 'gear.kriopompa';
export const CPRED_CRYOPUMP_NAME = 'Kriopompa';

/** „przez najwyżej tydzień nie muszą wykonywać rzutów obronnych przeciw śmierci” (s. 353). */
export const CPRED_CRYO_MINUTES = 7 * 24 * 60;

/**
 * „Uzupełnienie zużytego płynu kosztuje 50 ed (Drogo) za każdy ładunek”
 * (s. 353). Cennik domowy (etap 47a) mnoży drobny sprzęt z pasma Drogie razy
 * trzy — 150 ed za ładunek.
 */
export const CPRED_CRYO_REFILL_BAND: CostCategory = 'costly';
export const CPRED_CRYO_REFILL_PRICE = 50 * CPRED_PRICE_SCALE_CONSUMABLE;

/** Ładunki kriopompy wg punktów Obsługi kriosystemów jej Medyka (s. 150). */
export function cpredCryopumpCapacity(cryoLevel: number): number {
  if (cryoLevel >= 5) return 3;
  if (cryoLevel >= 4) return 2;
  return 1;
}

function normalized(name: string): string {
  return name.trim().toLowerCase();
}

/** Czy wiersz Wyposażenia jest kriopompą — po wpisie albo po nazwie. */
export function cpredIsCryopump(row: { compendiumId?: string; name: string }): boolean {
  return (
    row.compendiumId === CPRED_CRYOPUMP_ENTRY_ID ||
    normalized(row.name) === normalized(CPRED_CRYOPUMP_NAME)
  );
}

/** Ile ładunków zostało w pompie, którą trzyma Medyk z danym poziomem kriosystemów. */
export function cpredCryopumpCharges(row: { cryoUsed?: number }, cryoLevel: number): number {
  return Math.max(0, cpredCryopumpCapacity(cryoLevel) - (row.cryoUsed ?? 0));
}

/**
 * Pacjent w kriośnie — na **jego** karcie. Termin w minutach zegara świata,
 * jak u efektów na Cechach (`cpredStatEffectExpired` czyta to samo pole).
 * Pisze go wyłącznie silnik: `character:cryo` (zamrożenie, rozmrożenie)
 * i przemiatanie zegara (koniec tygodnia).
 */
export interface CpredCryoState {
  /** Kto zamroził — imię postaci Medyka, do karty i podpowiedzi. */
  by: string;
  /** Karta Medyka, który zamroził — on (i MG) może rozmrozić. */
  byCharacterId: string;
  /** Minuta zegara świata, w której kończy się tydzień ochrony; bez niej — do rozmrożenia. */
  expiresAtMinute?: number;
  /** Status „Nieprzytomny” dołożony przez zamrożenie — rozmrożenie go zdejmuje. */
  addedUnconscious?: boolean;
}

export function readCpredCryo(raw: unknown): CpredCryoState | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.by !== 'string' || row.by.trim().length === 0) return null;
  if (typeof row.byCharacterId !== 'string' || row.byCharacterId.length === 0) return null;
  const minute = row.expiresAtMinute;
  return {
    by: row.by.slice(0, 80),
    byCharacterId: row.byCharacterId.slice(0, 64),
    ...(typeof minute === 'number' && Number.isInteger(minute) && minute > 0
      ? { expiresAtMinute: minute }
      : {}),
    ...(row.addedUnconscious === true ? { addedUnconscious: true as const } : {}),
  };
}

/** Licznik zużytych ładunków z zapisu wiersza — tylko przy pompie, w granicach. */
export function readCpredCryoUsed(
  row: { compendiumId?: string; name: string },
  raw: unknown,
): number | undefined {
  if (!cpredIsCryopump(row)) return undefined;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) return undefined;
  return Math.min(raw, cpredCryopumpCapacity(5));
}

/** „W kriośnie (Kira) do 12.11 06:00” — tytuł plakietki i karty czatu składa klient. */
export const CPRED_CRYO_LABEL = 'W kriośnie';

// ─────────────────────────────── Odmowy ───────────────────────────────

export type CpredCryoProblem =
  | 'NOT_A_MEDIC'
  | 'NO_CRYO_SPECIALTY'
  | 'PUMP_GRANTED'
  | 'NOT_A_CRYOPUMP'
  | 'NO_CHARGES'
  | 'ALREADY_FROZEN'
  | 'NOT_FROZEN'
  | 'NO_TARGET_SHEET'
  | 'CRYO_SELF'
  | 'NOTHING_TO_REFILL'
  | 'IN_CRYO';

export const CPRED_CRYO_PROBLEMS: Record<CpredCryoProblem, string> = {
  NOT_A_MEDIC: 'Kriopompę obsługuje wyłącznie Medyk (s. 353).',
  NO_CRYO_SPECIALTY: 'Kriopompę z Medycyny daje pierwszy punkt w Obsłudze kriosystemów.',
  PUMP_GRANTED: 'Kriopompę z Obsługi kriosystemów ta postać już odebrała.',
  NOT_A_CRYOPUMP: 'To nie jest kriopompa.',
  NO_CHARGES: 'Kriopompa nie ma już ładunków — trzeba uzupełnić płyn.',
  ALREADY_FROZEN: 'Ta postać już leży w kriośnie.',
  NOT_FROZEN: 'Ta postać nie jest w kriośnie.',
  NO_TARGET_SHEET: 'Zamrozić można tylko postać z kartą.',
  CRYO_SELF: 'Medyk nie zamrozi sam siebie — ktoś musi podłączyć pompę.',
  NOTHING_TO_REFILL: 'Kriopompa ma komplet ładunków.',
  IN_CRYO: 'Postać w kriośnie nie rzuca przeciw śmierci (s. 353).',
};

// ─────────────────────────── Zdarzenie `character:cryo` ───────────────────────────

/**
 * Jedno zdarzenie na cztery czynności. `characterId` to karta Medyka (odbiór,
 * zamrożenie, uzupełnienie — jego pompa i jego portfel) albo karta pacjenta
 * (rozmrożenie).
 */
export interface CharacterCryoPayload {
  action: 'grant' | 'freeze' | 'thaw' | 'refill';
  characterId: string;
  /** Wiersz kriopompy w Wyposażeniu Medyka (`freeze`, `refill`). */
  gearRowId?: string;
  /** Figura pacjenta w zasięgu ramienia (`freeze`). */
  targetTokenId?: string;
}

export interface CharacterCryoAck {
  /** Ładunki pompy po czynności (`freeze`, `refill`). */
  charges?: number;
  /** Zapłacone ed (`refill`). */
  paid?: number;
}
