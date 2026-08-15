import { NET_RUN_PROBLEM_MESSAGES } from '@vtt/shared';

/**
 * Polskie zdania za odmowami netrunningu (etap 26b).
 *
 * Większość tekstów mieszka w `shared` (`NET_RUN_PROBLEM_MESSAGES`), bo tymi
 * samymi zdaniami odmawia serwer — tutaj dochodzą wyłącznie kody rdzenia VTT
 * (uprawnienia, brak połączenia) i te, które serwer odsyła jako gotowe zdanie.
 */
export function netErrorText(code: string | undefined): string {
  if (!code) return 'Nie udało się — nieznany błąd.';
  const known = NET_RUN_PROBLEM_MESSAGES[code as keyof typeof NET_RUN_PROBLEM_MESSAGES];
  if (known) return known;
  switch (code) {
    case 'FORBIDDEN':
      return 'To nie twoja postać.';
    case 'ACCESS_POINT_NOT_FOUND':
      return 'Tego punktu dostępu już nie ma — odśwież stronę.';
    case 'ARCHITECTURE_NOT_FOUND':
      return 'Architektura, do której prowadzi to gniazdo, zniknęła z biblioteki.';
    case 'TOO_MANY_ACCESS_POINTS':
      return 'Na tej scenie jest już maksymalna liczba punktów dostępu.';
    case 'NOT_YOUR_TURN':
      return 'To nie jest twoja tura.';
    case 'NO_ACTION_LEFT':
      return 'Akcja tej tury już poszła na coś innego — Akcje Sieciowe biorą całą Akcję.';
    case 'NO_NET_ACTIONS_LEFT':
      return 'Nie masz już Akcji Sieciowych w tej turze.';
    case 'ACTION_BLOCKED':
      return 'Rana krytyczna zabiera ci Akcję w tej turze.';
    case 'STATUS_BLOCKED':
      return 'Stan postaci nie pozwala teraz na tę Akcję.';
    case 'NOT_CONNECTED':
      return 'Brak połączenia z serwerem.';
    case 'BAD_REQUEST':
      return 'Serwer nie zrozumiał żądania.';
    default:
      // Serwer odsyła część odmów ruchu po szybie jako gotowe polskie zdanie
      // („Hasło serwisowe (PT 8) blokuje drogę…") — wtedy kod *jest* tekstem.
      return code.includes(' ') ? code : `Nie udało się: ${code}.`;
  }
}
