import type { WallKind } from '@vtt/shared';

/**
 * Odmowy warstw mapy po polsku (wydzielone w etapie 27l).
 *
 * Do 27l te funkcje były prywatne w `MapArea.tsx`, bo tylko on wołał zdarzenia
 * ścian, osłon, świateł i rysunków. Karty obiektów wołają dokładnie te same
 * zdarzenia i muszą tłumaczyć odmowy **tym samym zdaniem** — kopia w karcie
 * rozjechałaby się z oryginałem przy pierwszym nowym kodzie błędu.
 */

/** Polish hints for the rejections `drawing:create` can come back with. */
export function drawingErrorText(code: string | undefined): string {
  switch (code) {
    case 'DRAWING_LIMIT_REACHED':
      return 'Na tej scenie jest już maksymalna liczba rysunków — wyczyść część z nich.';
    case 'SCENE_NOT_VIEWED':
      return 'Ta scena nie jest już wyświetlana — rysunek nie został zapisany.';
    case 'NOT_CONNECTED':
      return 'Brak połączenia z serwerem — rysunek nie został zapisany.';
    default:
      return `Nie udało się zapisać rysunku: ${code ?? 'nieznany błąd'}.`;
  }
}

/** Polish hints for the rejections `wall:create` can come back with. */
export function wallErrorText(code: string | undefined): string {
  switch (code) {
    case 'WALL_LIMIT_REACHED':
      return 'Na tej scenie jest już maksymalna liczba ścian.';
    case 'NOT_CONNECTED':
      return 'Brak połączenia z serwerem — ściana nie została zapisana.';
    default:
      return `Nie udało się zapisać ściany: ${code ?? 'nieznany błąd'}.`;
  }
}

/** Polish hints for the rejections the cover events can come back with. */
export function coverErrorText(code: string | undefined): string {
  switch (code) {
    case 'COVER_LIMIT_REACHED':
      return 'Na tej scenie jest już maksymalna liczba osłon.';
    case 'COVER_NOT_FOUND':
      return 'Ta osłona już nie istnieje — odśwież stronę.';
    case 'UNKNOWN_COVER_TYPE':
      return 'Nie znam takiego rodzaju osłony — sprawdź katalog w data/public.';
    case 'COVER_HAS_NO_HP':
      return 'To nie jest osłona: taki materiał nie zatrzyma kuli (podręcznik, s. 179).';
    case 'NOT_CONNECTED':
      return 'Brak połączenia z serwerem — osłona nie została zapisana.';
    default:
      return `Nie udało się zmienić osłony: ${code ?? 'nieznany błąd'}.`;
  }
}

/** Polish hints for the rejections the light events can come back with. */
export function lightErrorText(code: string | undefined): string {
  switch (code) {
    case 'LIGHT_LIMIT_REACHED':
      return 'Na tej scenie jest już maksymalna liczba świateł.';
    case 'LIGHT_NOT_FOUND':
      return 'To światło już nie istnieje — odśwież stronę.';
    case 'NO_LIGHT':
      return 'Ten token nie ma latarki — MG musi ją najpierw ustawić.';
    case 'FORBIDDEN':
      return 'To nie twój token.';
    case 'NOT_CONNECTED':
      return 'Brak połączenia z serwerem — zmiana światła nie została zapisana.';
    default:
      return `Nie udało się zmienić światła: ${code ?? 'nieznany błąd'}.`;
  }
}

/**
 * Polish hints for `opening:toggle`, worded for whichever thing was clicked.
 *
 * The kind comes from the client's own list rather than from the ack: the server
 * says why it refused, and the map already knows what the player reached for.
 */
export function openingErrorText(code: string | undefined, kind: WallKind | undefined): string {
  const words = OPENING_REFUSALS[kind === 'window' || kind === 'gate' ? kind : 'door'];
  // Stage 18d. „Za daleko" names the thing, which is safe — the player was
  // shown it. „Zamknięte na klucz" is only ever said to someone whose token
  // stands at the handle, so the message is the character's discovery.
  switch (code) {
    case 'FORBIDDEN':
    case 'WALL_NOT_FOUND':
    case 'OPENING_OUT_OF_REACH':
    case 'OPENING_LOCKED':
      return words[code];
    default:
      return `${words.failed}: ${code ?? 'nieznany błąd'}.`;
  }
}

/** The same four refusals, worded for the thing that was reached for. */
const OPENING_REFUSALS = {
  door: {
    FORBIDDEN: 'Tych drzwi nie otworzysz — MG ich nie udostępnił.',
    WALL_NOT_FOUND: 'Nie widzisz tych drzwi.',
    OPENING_OUT_OF_REACH: 'Za daleko — podejdź do drzwi (na jedną kratkę).',
    OPENING_LOCKED: 'Zamknięte na klucz — same drzwi nie ustąpią.',
    failed: 'Nie udało się poruszyć drzwiami',
  },
  window: {
    FORBIDDEN: 'Tego okna nie ruszysz — MG go nie udostępnił.',
    WALL_NOT_FOUND: 'Nie widzisz tego okna.',
    OPENING_OUT_OF_REACH: 'Za daleko — podejdź do okna (na jedną kratkę).',
    OPENING_LOCKED: 'Okno zamknięte na skobel — nie ustąpi.',
    failed: 'Nie udało się poruszyć oknem',
  },
  // Stage 42a.
  gate: {
    FORBIDDEN: 'Tej bramy nie otworzysz — MG jej nie udostępnił.',
    WALL_NOT_FOUND: 'Nie widzisz tej bramy.',
    OPENING_OUT_OF_REACH: 'Za daleko — podejdź do bramy (na jedną kratkę).',
    OPENING_LOCKED: 'Brama zamknięta na kłódkę — nie ustąpi.',
    failed: 'Nie udało się poruszyć bramą',
  },
} as const;

/**
 * Odmowy operacji na figurach (etap 35): kopia, ukrycie, naklejka, kosz.
 *
 * Jedna funkcja na wszystkie, bo idą jednym zdarzeniem na figurę i wszystkie
 * potrafią odmówić z tego samego powodu — a operacja grupowa mówi jednym
 * zdaniem o całej paczce, nie sześcioma o każdej z osobna.
 */
export function tokenErrorText(code: string | undefined): string {
  switch (code) {
    case 'TOKEN_NOT_FOUND':
      return 'Tej figury już nie ma na scenie.';
    case 'FORBIDDEN':
      return 'Tej operacji na figurach może dokonać wyłącznie MG.';
    case 'NOT_CONNECTED':
      return 'Brak połączenia z serwerem — nic nie zostało zmienione.';
    default:
      return `Nie udało się zmienić figury: ${code ?? 'nieznany błąd'}.`;
  }
}

/** Odmowy łatki sceny puszczanej z mapy — dziś wyłącznie miejsce startu (11.09). */
export function sceneErrorText(code: string | undefined): string {
  switch (code) {
    case 'SCENE_NOT_FOUND':
      return 'Tej sceny już nie ma — punkt startu nie został zapisany.';
    case 'FORBIDDEN':
      return 'Miejsce startu wyznacza MG.';
    case 'NOT_CONNECTED':
      return 'Brak połączenia z serwerem — punkt startu nie został zapisany.';
    default:
      return `Nie udało się zapisać miejsca startu: ${code ?? 'nieznany błąd'}.`;
  }
}
