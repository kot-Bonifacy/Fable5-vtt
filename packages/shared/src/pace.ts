/**
 * Pula metrów Eksploracji (etap 45, decyzja MG z 08.10.2026).
 *
 * Poza walką na scenie w trybie „Eksploracja” przeciągnięcie figury i Skok
 * płacą z puli, która się odnawia: pełna mieści ruch figury z jednej tury
 * walki, a pusta napełnia się cała w `PACE_REFILL_MS`. Gracz nie przeniesie
 * figury przez mapę kilkoma szarpnięciami. Marsz klikiem puli nie płaci
 * (zlecenie MG z 24.10): postój „Złap oddech” co kilkanaście metrów rwał
 * eksplorację, a tempo marszu i tak trzyma prędkość chodu.
 *
 * Rdzeń VTT: liczy wyłącznie metry i milisekundy. Ile mieści pula, mówi system
 * (CP RED: RUCH × 2 m z karty), a gdzie leży stan — serwer, w pamięci.
 *
 * Stan to **dług** w chwili `at`, nie zapas: figura, która nigdzie nie szła,
 * nie ma żadnego wpisu, a pełna pula nie wymaga niczego pamiętać. Dług maleje
 * liniowo w czasie, więc jedna liczba i jeden znacznik czasu opisują pulę
 * w każdej chwili, bez zegara tykającego na serwerze.
 */

/** Ile trwa napełnienie pustej puli, w milisekundach (decyzja MG: ~10 s). */
export const PACE_REFILL_MS = 10_000;

/**
 * Pula figury, o której system nic nie wie (figura bez karty). Ruch z tury
 * przeciętnej postaci — sama liczba, bez wiedzy, skąd się bierze.
 */
export const PACE_FALLBACK_CAP_M = 12;

/**
 * Luz na zaokrąglenia: metry trasy jadą po drucie z jedną cyfrą po przecinku,
 * a „12 m z 12 m” nie może wrócić odmową. Ten sam luz trzyma `clipToBudget`.
 */
export const PACE_SLACK_M = 0.05;

/** Dług puli jednej figury: ile metrów brakowało do pełna w chwili `at` (ms). */
export interface PaceState {
  owedM: number;
  at: number;
}

/** Server → client `token:pace` — stan puli figury, wysyłany jej graczom. */
export interface TokenPaceBroadcast {
  tokenId: string;
  /** Dług w chwili wysyłki; klient przelicza go własnym zegarem. */
  owedM: number;
}

function validCap(capM: number): number {
  return Number.isFinite(capM) && capM > 0 ? capM : PACE_FALLBACK_CAP_M;
}

/** Dług w chwili `now`: maleje o całą pulę na `PACE_REFILL_MS`. */
export function paceOwed(state: PaceState | null | undefined, capM: number, now: number): number {
  if (!state || state.owedM <= 0) return 0;
  const cap = validCap(capM);
  const elapsed = Math.max(0, now - state.at);
  const owed = state.owedM - (cap * elapsed) / PACE_REFILL_MS;
  return owed > 0 ? Math.min(owed, cap) : 0;
}

/** Ile metrów figura może przejść w chwili `now`. */
export function paceAvailable(
  state: PaceState | null | undefined,
  capM: number,
  now: number,
): number {
  const cap = validCap(capM);
  return Math.max(0, cap - paceOwed(state, cap, now));
}

/** Za ile milisekund pula będzie pełna (0 — już jest). */
export function paceFullInMs(
  state: PaceState | null | undefined,
  capM: number,
  now: number,
): number {
  const cap = validCap(capM);
  return Math.ceil((paceOwed(state, cap, now) * PACE_REFILL_MS) / cap);
}

/**
 * Za ile milisekund pula uzbiera `metres` (0 — już ma). Zdanie „ruszysz za 3 s”
 * przy pustej puli pyta o jeden metr, nie o pełną pulę.
 */
export function paceReadyInMs(
  state: PaceState | null | undefined,
  capM: number,
  metres: number,
  now: number,
): number {
  const cap = validCap(capM);
  const missing = Math.min(metres, cap) - paceAvailable(state, cap, now);
  return missing > 0 ? Math.ceil((missing * PACE_REFILL_MS) / cap) : 0;
}

/**
 * Wydatek `metres` z puli w chwili `now`: nowy stan albo `null`, gdy pula tyle
 * nie mieści (z luzem `PACE_SLACK_M`). Dług nigdy nie przekracza pełnej puli.
 */
export function paceSpend(
  state: PaceState | null | undefined,
  capM: number,
  metres: number,
  now: number,
): PaceState | null {
  const cap = validCap(capM);
  const spend = Number.isFinite(metres) && metres > 0 ? metres : 0;
  const owed = paceOwed(state, cap, now);
  if (spend > cap - owed + PACE_SLACK_M) return null;
  return { owedM: Math.min(cap, owed + spend), at: now };
}
