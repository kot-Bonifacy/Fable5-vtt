import { formatEddies } from './systems/cpred/pricing.js';

/**
 * Prośba o operację u Medyka innego gracza (#41, 30.09.2026).
 *
 * Do 30.09 montaż wszczepu z chirurgiem-postacią uruchamiał wyłącznie ktoś, kto
 * prowadzi **obie** karty — w praktyce MG. Rozstrzygnięcie MG: **pacjent prosi,
 * Medyk przyjmuje**. Medyk podaje cenę (domyślnie to, co pacjent widział na
 * guziku w Kompendium; może zejść do zera — kompan z drużyny), a cała kwota
 * jedzie na jego kartę. Cena nie wyższa od domyślnej to „Operuję" od razu;
 * wyższa wraca do pacjenta do zatwierdzenia — nikt nie zapłaci więcej, niż
 * widział, prosząc. Warunku zasięgu nie ma: operacja to scena między scenami.
 *
 * Karta czatu rodzaju `surgery` jest **jedynym** źródłem prawdy o tym, co ma się
 * stać — serwer czyta z niej pacjenta, Medyka, wpis i cenę, a klient podaje
 * wyłącznie decyzję. Ta sama umowa, co propozycja przekazania z 38b.
 */
export interface SurgeryRequestEntry {
  patientId: string;
  patientName: string;
  patientOwnerId: string | null;
  surgeonId: string;
  surgeonName: string;
  surgeonOwnerId: string | null;
  /** Wpis kompendium wszczepu. */
  entryId: string;
  entryName: string;
  /** Nowy wszczep (`full`) albo znaleziony — sam montaż (`installOnly`). */
  payment: 'full' | 'installOnly';
  /** PT montażu (s. 226) i miejsce — do zdania na karcie. */
  dv: number;
  place: string;
  /** Cena z guzika, który kliknął pacjent — punkt odniesienia dla Medyka. */
  defaultPrice: number;
  /** Chirurgia Medyka w chwili prośby — informacyjnie, Test czyta kartę. */
  surgery: number;
  /** Wycena Medyka powyżej domyślnej, czekająca na zgodę pacjenta. */
  quote?: number;
  /** Wypełniane, gdy sprawa jest zamknięta. `price` — ile naprawdę zapłacono. */
  resolution?: { kind: SurgeryResolutionKind; byName: string; price?: number };
}

export type SurgeryResolutionKind = 'operated' | 'declined' | 'cancelled';

export const SURGERY_RESOLUTION_LABELS: Record<SurgeryResolutionKind, string> = {
  operated: 'Zoperowane',
  declined: 'Medyk odmówił',
  cancelled: 'Wycofane',
};

export function isSurgeryOpen(entry: SurgeryRequestEntry): boolean {
  return entry.resolution === undefined;
}

/** Wycena czeka na pacjenta — Medyk zrobił już swoje. */
export function isSurgeryQuoted(entry: SurgeryRequestEntry): boolean {
  return isSurgeryOpen(entry) && entry.quote !== undefined;
}

/**
 * Strona Medyka: „Operuję" / „Odmawiam". MG w zastępstwie, jak przy przekazaniu
 * (`mayAnswerInventoryMove`) — stół nie ma stać, bo ktoś wyszedł po kawę.
 */
export function maySurgeonAnswer(
  entry: SurgeryRequestEntry,
  userId: string,
  isGm: boolean,
): boolean {
  if (!isSurgeryOpen(entry)) return false;
  return isGm || entry.surgeonOwnerId === userId;
}

/** Strona pacjenta: „Wycofaj", a przy wycenie także „Zgadzam się". */
export function mayPatientAnswer(
  entry: SurgeryRequestEntry,
  userId: string,
  isGm: boolean,
): boolean {
  if (!isSurgeryOpen(entry)) return false;
  return isGm || entry.patientOwnerId === userId;
}

/** Czy ta cena wymaga zgody pacjenta — tylko wyższa od tej, którą widział. */
export function surgeryNeedsApproval(entry: SurgeryRequestEntry, price: number): boolean {
  return price > entry.defaultPrice;
}

/** „Kowal → Iskra: Cyberoko" — nagłówek karty i tekst wiersza czatu. */
export function surgeryHeadline(entry: SurgeryRequestEntry): string {
  return `${entry.patientName} → ${entry.surgeonName}: ${entry.entryName}`;
}

/** Plakietka zamkniętej karty: „Zoperowane — 0 ed", „Wycofane". */
export function surgeryResolutionLabel(entry: SurgeryRequestEntry): string {
  const resolution = entry.resolution;
  if (!resolution) return '';
  const label = SURGERY_RESOLUTION_LABELS[resolution.kind];
  return resolution.price === undefined ? label : `${label} — ${formatEddies(resolution.price)} ed`;
}
