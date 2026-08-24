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
  const isWindow = kind === 'window';
  switch (code) {
    case 'FORBIDDEN':
      return isWindow
        ? 'Tego okna nie ruszysz — MG go nie udostępnił.'
        : 'Tych drzwi nie otworzysz — MG ich nie udostępnił.';
    case 'WALL_NOT_FOUND':
      return isWindow ? 'Nie widzisz tego okna.' : 'Nie widzisz tych drzwi.';
    // Stage 18d. „Za daleko" names the thing, which is safe — the player was
    // shown it. „Zamknięte na klucz" is only ever said to someone whose token
    // stands at the handle, so the message is the character's discovery.
    case 'OPENING_OUT_OF_REACH':
      return isWindow
        ? 'Za daleko — podejdź do okna (na jedną kratkę).'
        : 'Za daleko — podejdź do drzwi (na jedną kratkę).';
    case 'OPENING_LOCKED':
      return isWindow
        ? 'Okno zamknięte na skobel — nie ustąpi.'
        : 'Zamknięte na klucz — same drzwi nie ustąpią.';
    default:
      return isWindow
        ? `Nie udało się poruszyć oknem: ${code ?? 'nieznany błąd'}.`
        : `Nie udało się poruszyć drzwiami: ${code ?? 'nieznany błąd'}.`;
  }
}
