import { localUploadRejection, uploadRejectionText, type UploadKind } from '@vtt/shared';
import { ApiError } from './api.js';

/**
 * Wgrywanie obrazu widziane z panelu: co powiedzieć, gdy plik nie przejdzie.
 *
 * Reguły i zdania stoją w `@vtt/shared` razem z limitami, którymi żyje serwer
 * — tutaj zostaje jedno tłumaczenie `ApiError` na kod odmowy i sprawdzenie,
 * które da się zrobić bez wysyłania pliku.
 */

/** Zdanie dla odmowy z serwera — zawsze z pełnym wymaganiem formatu i rozmiaru. */
export function uploadErrorText(error: unknown, kind: UploadKind): string {
  return uploadRejectionText(error instanceof ApiError ? error.code : null, kind);
}

/**
 * Zdanie dla pliku, który odpada jeszcze przed wysyłką, albo `null`.
 *
 * Wywoływane tuż po wyborze pliku: czterdziestomegabajtowy PNG nie musi
 * przejechać przez sieć po to, żeby usłyszeć „za duży".
 */
export function fileRejectionText(file: File | undefined | null, kind: UploadKind): string | null {
  return localUploadRejection(file, kind);
}
