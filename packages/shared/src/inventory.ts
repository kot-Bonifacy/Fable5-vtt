/**
 * Przedmiot zmieniający właściciela, tak jak zapisuje to czat (etap 38b).
 *
 * Rdzeń VTT, nie CP RED: tutaj mieszka wyłącznie to, co karta czatu musi
 * narysować (kto, komu, co i jak się to skończyło) oraz stan czekającej
 * propozycji. **Czym** są przenoszone rzeczy — wierszem broni, pancerza czy
 * wyposażenia, a w następnym systemie RPG czymkolwiek innym — jedzie w `system`
 * jako nieprzezroczysta paczka, dokładnie tak jak `CheckCallEntry.system` wozi
 * żądanie rzutu od etapu 32.
 *
 * Dwie rzeczy, których w tym pliku nie ma i być nie powinno: reguły „kto może
 * z czyjej karty brać" (to pytanie serwera, bo zależy od figur na scenie)
 * i samego przenoszenia (`cpredMoveItems`, bo to ekwipunek konkretnego systemu).
 */

/**
 * Skąd wzięła się ta operacja.
 *
 * `give` to „masz, weź to" — wychodzi z karty, którą wysyłający kontroluje,
 * i **czeka na zgodę odbiorcy** (decyzja MG z 05.09.2026). `take` to „zdejmuję
 * to z ciała" — nie czeka na nic, bo nie ma kto potwierdzić, a warunki, na
 * jakich w ogóle wolno je wykonać, sprawdził serwer, zanim cokolwiek pojechało.
 */
export type InventoryMoveKind = 'give' | 'take';

export const INVENTORY_MOVE_TITLES: Record<InventoryMoveKind, string> = {
  give: 'Przekazanie',
  take: 'Łup',
};

/** Jak skończyła się propozycja przekazania. */
export type InventoryResolutionKind = 'accepted' | 'declined' | 'cancelled';

export const INVENTORY_RESOLUTION_LABELS: Record<InventoryResolutionKind, string> = {
  accepted: 'Przyjęte',
  declined: 'Odrzucone',
  cancelled: 'Wycofane',
};

/** Najdłuższy dopisek, jaki wysyłający dołoży do przekazania. */
export const INVENTORY_NOTE_MAX = 120;

/** Ile pozycji naraz przyjmuje jedno żądanie — „Zabierz wszystko" mieści się. */
export const INVENTORY_ITEMS_MAX = 40;

/**
 * Przekazanie albo łup, tak jak widzi to karta czatu.
 *
 * Zapisywane w `payload` wiadomości rodzaju `inventory` i — dla propozycji
 * czekającej — **jedyne** źródło prawdy o tym, co ma pojechać: kiedy odbiorca
 * kliknie „Przyjmij", serwer czyta stąd listę wierszy. Klient jej nie podaje,
 * tą samą umową, którą wezwanie do Testu z 32 trzyma Umiejętność i próg.
 */
export interface InventoryMoveEntry {
  kind: InventoryMoveKind;
  fromCharacterId: string;
  /** Nazwa karty źródłowej, zdenormalizowana — wiersz ma przeżyć jej skasowanie. */
  fromName: string;
  toCharacterId: string;
  toName: string;
  /** Właściciel karty odbiorcy; `null` znaczy NPC, więc nie ma kto przyjmować. */
  toOwnerId: string | null;
  /** Kto zainicjował — karta mówi to obu stronom. */
  actorName: string;
  /** Po linijce na rzecz: „Zgrzyt 9 (12/30 · celownik)", „Stimpak × 2". */
  lines: string[];
  /** Eurodolce jadące tą samą operacją; nieobecne, gdy nie ruszyły. */
  eddies?: number;
  /** Zdanie od wysyłającego („za opatrunek"). */
  note?: string;
  /** Żądanie dla systemu (CP RED: `CpredItemRef[]`) — tu nieprzezroczyste. */
  system: Record<string, unknown>;
  /** Wypełniane, gdy sprawa jest zamknięta; brak znaczy „czeka na decyzję". */
  resolution?: { kind: InventoryResolutionKind; byName: string };
}

/** Propozycja, na którą nikt jeszcze nie odpowiedział. */
export function isInventoryMoveOpen(entry: InventoryMoveEntry): boolean {
  return entry.resolution === undefined;
}

/**
 * Kto może kliknąć „Przyjmij" albo „Odrzuć": właściciel karty odbiorcy albo MG.
 *
 * MG jest tu z tego samego powodu, dla którego może rzucić za nieobecnego
 * gracza (`mayAnswerCheckCall`, etap 32): stół nie ma stać, bo ktoś wyszedł po
 * kawę.
 */
export function mayAnswerInventoryMove(
  entry: InventoryMoveEntry,
  userId: string,
  isGm: boolean,
): boolean {
  if (!isInventoryMoveOpen(entry)) return false;
  return isGm || entry.toOwnerId === userId;
}

/** Kto może wycofać propozycję: ten, kto ją wysłał, albo MG. */
export function mayCancelInventoryMove(
  entry: InventoryMoveEntry,
  userId: string,
  isGm: boolean,
  authorId: string,
): boolean {
  if (!isInventoryMoveOpen(entry)) return false;
  return isGm || authorId === userId;
}

/**
 * Plakietka zamkniętej karty: „Przyjęte", „Zabrane", „Odrzucone", „Wycofane".
 *
 * Łup nie jest „przyjmowany" — nie ma kogo o zgodę zapytać, więc to samo pole
 * `accepted` czyta się przy nim innym słowem. Jedna funkcja zamiast gałęzi
 * w karcie czatu, bo to samo zdanie pada też w dzienniku.
 */
export function inventoryResolutionLabel(entry: InventoryMoveEntry): string {
  const resolution = entry.resolution;
  if (!resolution) return '';
  if (resolution.kind === 'accepted' && entry.kind === 'take') return 'Zabrane';
  return INVENTORY_RESOLUTION_LABELS[resolution.kind];
}

/** „Vex → Rico" — nagłówek karty czatu. */
export function inventoryMoveHeadline(entry: InventoryMoveEntry): string {
  return `${entry.fromName} → ${entry.toName}`;
}
