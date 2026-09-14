/**
 * Limity wgrywanych obrazów — jedno źródło dla serwera i dla klienta.
 *
 * Do etapu 24a każdy panel klienta nosił własną kopię tych liczb w prywatnej
 * funkcji `uploadErrorText`, a serwer trzecią — sześć miejsc, w których „maks.
 * 2048 px" trzeba było poprawić razem. Tu stoją raz, a zdania odmowy powstają
 * z nich, więc komunikat nie może rozjechać się z regułą, która go wywołała.
 *
 * Zdania są po polsku, bo to UI; kod odmowy jest angielski, bo to protokół.
 */

import { SCENE_DIMENSION_MAX } from './scenes.js';

export const PORTRAIT_MAX_INPUT_PIXELS = 20_000_000;
export const PORTRAIT_MIN_INPUT_SIDE = 256;
export const PORTRAIT_WEBP_QUALITY = 85;

/** Rodzaje wgrywanych obrazów — po jednym na trasę `/api/uploads/*`. */
export type UploadKind = 'map' | 'token' | 'portrait' | 'handout';

export interface UploadLimits {
  /** Największy przyjmowany plik. */
  maxBytes: number;
  /** Największy bok obrazu: dla portretu po konwersji, dla pozostałych na wejściu. */
  maxSidePx: number;
  /** Czym ta grafika jest w zdaniu odmowy („Mapa jest za duża…"). */
  label: string;
}

/**
 * Mapa bywa wielokrotnie większa od portretu, a handout (plan dzielnicy)
 * leży pomiędzy — stąd cztery różne pary liczb zamiast jednej wspólnej.
 */
export const UPLOAD_LIMITS: Readonly<Record<UploadKind, UploadLimits>> = {
  // Bok mapy to ten sam próg, którym scena przycina swoje wymiary — obraz,
  // którego scena i tak by nie przyjęła, nie ma po co lądować na dysku.
  map: { maxBytes: 40 * 1024 * 1024, maxSidePx: SCENE_DIMENSION_MAX, label: 'Mapa' },
  token: { maxBytes: 8 * 1024 * 1024, maxSidePx: 2048, label: 'Obraz tokenu' },
  portrait: { maxBytes: 10 * 1024 * 1024, maxSidePx: 2048, label: 'Portret' },
  handout: { maxBytes: 12 * 1024 * 1024, maxSidePx: 4096, label: 'Grafika' },
};

/**
 * Typy MIME, które serwer rzeczywiście zapisuje.
 *
 * Ta sama lista jedzie w atrybut `accept` okna wyboru pliku i w sprawdzenie
 * przed wysyłką: okno ma nie pokazywać pliku, którego serwer i tak odrzuci.
 * Serwer i tak wącha zawartość — deklaracja przeglądarki jest wskazówką,
 * nie dowodem.
 */
export const UPLOAD_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Wartość atrybutu `accept` dla każdego `<input type="file">` z obrazem. */
export const UPLOAD_ACCEPT_ATTRIBUTE = UPLOAD_IMAGE_MIME_TYPES.join(',');

/** Formaty tak, jak nazywa je człowiek przy stole. */
export const UPLOAD_FORMATS_TEXT = 'PNG, JPG lub WebP';

/** „12 MB", „1,5 MB" — bez zer, które nic nie wnoszą. */
export function formatUploadSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const rounded = Math.round(mb * 10) / 10;
  return `${String(rounded).replace('.', ',')} MB`;
}

/**
 * Pełne wymaganie jednym zdaniem: format, rozdzielczość i waga.
 *
 * Idzie zarówno w podpowiedź przy przycisku, jak i w każdą odmowę — bo
 * odmowa, która mówi wyłącznie „nieobsługiwany format", zostawia człowieka
 * z pytaniem „to jaki mam podać?".
 */
export function uploadRequirementText(kind: UploadKind): string {
  const limits = UPLOAD_LIMITS[kind];
  if (kind === 'portrait') {
    return `${UPLOAD_FORMATS_TEXT}, do ${formatUploadSize(limits.maxBytes)}, minimum ${PORTRAIT_MIN_INPUT_SIDE} × ${PORTRAIT_MIN_INPUT_SIDE} px, maks. ${PORTRAIT_MAX_INPUT_PIXELS / 1_000_000} mln pikseli; automatyczny zapis WebP do ${limits.maxSidePx} px dłuższego boku bez kadrowania`;
  }
  return `${UPLOAD_FORMATS_TEXT}, maks. ${limits.maxSidePx} px na bok, do ${formatUploadSize(limits.maxBytes)}`;
}

/** Kody odmowy, którymi odpowiadają trasy `/api/uploads/*`. */
export type UploadRejectionCode =
  | 'NO_FILE'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_IMAGE'
  | 'IMAGE_TOO_LARGE'
  | 'NO_CAMPAIGN'
  | 'IMAGE_TOO_SMALL'
  | 'INVALID_IMAGE'
  | 'ANIMATED_IMAGE'
  | 'CAMPAIGN_CHANGED';

/**
 * Zdanie odmowy dla kodu z serwera — zawsze z pełnym wymaganiem na końcu.
 */
export function uploadRejectionText(code: string | null | undefined, kind: UploadKind): string {
  const limits = UPLOAD_LIMITS[kind];
  const requirement = uploadRequirementText(kind);
  switch (code) {
    case 'NO_FILE':
      return `Nie wybrano pliku. Wymagany ${requirement}.`;
    case 'FILE_TOO_LARGE':
      return `Plik jest za duży (limit ${formatUploadSize(limits.maxBytes)}). Wymagany ${requirement}.`;
    case 'UNSUPPORTED_IMAGE':
      return `Nieobsługiwany format. Wymagany ${requirement}.`;
    case 'IMAGE_TOO_LARGE':
      if (kind === 'portrait')
        return `Portret przekracza limit liczby pikseli. Wymagany ${requirement}.`;
      return `${limits.label} ma za dużą rozdzielczość (maks. ${limits.maxSidePx} px na bok). Wymagany ${requirement}.`;
    case 'IMAGE_TOO_SMALL':
      return `Portret ma za małą rozdzielczość. Wymagany ${requirement}.`;
    case 'INVALID_IMAGE':
      return `Nie można odczytać obrazu — plik może być uszkodzony. Wymagany ${requirement}.`;
    case 'ANIMATED_IMAGE':
      return `Portret musi być nieruchomym obrazem. Wymagany ${requirement}.`;
    case 'NO_CAMPAIGN':
      return 'Brak aktywnej kampanii.';
    case 'CAMPAIGN_CHANGED':
      return 'Aktywna kampania zmieniła się. Otwórz bibliotekę właściwej kampanii i ponów dodawanie.';
    default:
      return `Nie udało się wgrać pliku. Wymagany ${requirement}.`;
  }
}

/**
 * To, co da się sprawdzić przed wysłaniem: deklarowany typ i waga.
 *
 * Nie zastępuje serwera — rozdzielczości bez zdekodowania obrazu i tak stąd
 * nie widać, a typ deklaruje przeglądarka. Oszczędza za to czterdzieści
 * megabajtów jazdy po to, żeby usłyszeć „za duży", i mówi to od razu.
 * Zwraca zdanie odmowy albo `null`, gdy plik nadaje się do wysłania.
 */
export function localUploadRejection(
  file: { readonly type?: string; readonly size?: number } | null | undefined,
  kind: UploadKind,
): string | null {
  if (!file) return uploadRejectionText('NO_FILE', kind);
  const limits = UPLOAD_LIMITS[kind];
  // Pusty `type` znaczy „przeglądarka nie wie" — niech rozstrzygnie serwer.
  if (file.type && !(UPLOAD_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return uploadRejectionText('UNSUPPORTED_IMAGE', kind);
  }
  if (typeof file.size === 'number' && file.size > limits.maxBytes) {
    return uploadRejectionText('FILE_TOO_LARGE', kind);
  }
  return null;
}
