/**
 * AI właściciela (etap 44d): prośba MG o dostęp, zgoda właściciela, przełącznik
 * „Udostępniam AI” i dzierżawa AI przez jedną sesję naraz.
 *
 * Zgoda jest per konto MG i obejmuje wszystkie jego kampanie (decyzja MG
 * z 03.10). Przełącznik i dzierżawa żyją w pamięci serwera — tu są tylko
 * kształty, które jadą do klienta.
 */

/** Stan prośby konta MG; `none` — nigdy nie prosił. */
export type AiAccessStatus = 'none' | 'requested' | 'granted' | 'rejected' | 'revoked';

export function isAiAccessStatus(value: unknown): value is AiAccessStatus {
  return (
    value === 'none' ||
    value === 'requested' ||
    value === 'granted' ||
    value === 'rejected' ||
    value === 'revoked'
  );
}

/** Prośba widziana przez MG, który ją wysłał (`GET /api/ai-access`, push `ai-access:mine`). */
export interface AiAccessView {
  status: AiAccessStatus;
  requestedAt: string | null;
  decidedAt: string | null;
}

/** Decyzja właściciela w panelu: „Zatwierdź”, „Odrzuć”, „Cofnij”. */
export type AiAccessDecision = 'grant' | 'reject' | 'revoke';

/** Wiersz prośby w panelu właściciela. */
export interface OwnerAiRequest {
  userId: string;
  login: string;
  status: Exclude<AiAccessStatus, 'none'>;
  requestedAt: string | null;
  decidedAt: string | null;
}

/** Kto trzyma AI (dzierżawa) — panel właściciela. */
export interface AiLeaseView {
  campaignId: string;
  campaignName: string;
  gmLogin: string;
  /** Kampania z konta MG właściciela. */
  own: boolean;
}

/** Panel „AI właściciela” (`GET /api/owner/ai`, push `ai-access:owner` do kont z flagą). */
export interface OwnerAiState {
  /** „Udostępniam AI” — w pamięci serwera, wyłączony po restarcie i po każdym nowym wejściu. */
  sharing: boolean;
  requests: OwnerAiRequest[];
  /** Ile próśb czeka na decyzję — licznik na znaczku w górnym pasku. */
  pending: number;
  lease: AiLeaseView | null;
  /** „Przejmij AI”: trwa sesja z konta MG właściciela, a AI trzyma inna. */
  canTakeOver: boolean;
}

/** Zdanie o stanie prośby dla MG, który ją wysłał. */
export function aiAccessStatusText(status: AiAccessStatus): string {
  switch (status) {
    case 'none':
      return 'Bez prośby o dostęp do AI właściciela serwera — boty Twoich kampanii są niedostępne.';
    case 'requested':
      return 'Prośba wysłana — czeka na decyzję właściciela.';
    case 'granted':
      return 'Masz zgodę właściciela. Boty działają, gdy właściciel jest obecny i udostępnia AI.';
    case 'rejected':
      return 'Właściciel odrzucił prośbę. Możesz poprosić jeszcze raz.';
    case 'revoked':
      return 'Właściciel cofnął dostęp. Możesz poprosić jeszcze raz.';
  }
}

/** Polskie zdanie odmowy tras AI właściciela; null — nieznany kod. */
export function aiAccessErrorText(code: string): string | null {
  switch (code) {
    case 'OWNER_ACCOUNT':
      return 'Konto właściciela ma AI bez prośby.';
    case 'NO_OWN_SESSION':
      return 'Przejąć AI możesz tylko dla własnej trwającej sesji.';
    case 'NOT_FOUND':
      return 'Nie ma takiej prośby.';
    case 'BAD_DECISION':
      return 'Tej decyzji nie da się podjąć przy obecnym stanie prośby.';
    case 'INVALID_CREDENTIALS':
      return 'Login albo hasło właściciela się nie zgadza.';
    default:
      return null;
  }
}
