import type { CampaignSummary } from './auth.js';

/**
 * Sesje i sloty (etap 44c).
 *
 * Przygotowanie to nie sesja: MG pracuje w otwartej kampanii sam, bez slotu.
 * „Rozpocznij sesję” zajmuje jedno z `VTT_MAX_SESSIONS` miejsc i wpuszcza na
 * stół graczy tej kampanii, „Zakończ sesję” (albo zegar bezczynności) je
 * zwalnia, a gracze wracają do widoku „Między sesjami”.
 */

/** Dlaczego sesja się skończyła: MG kliknął, nikogo przy stole, nic się nie działo. */
export type SessionEndReason = 'gm' | 'empty' | 'idle';

/**
 * `session:changed` — sesja kampanii ruszyła albo się skończyła. Idzie do
 * każdego gniazda kampanii (stół i gracze między sesjami); gracz przenoszony
 * na stół albo z niego dostaje przed nim pełny `state:sync`.
 */
export interface SessionChangedPush {
  campaign: CampaignSummary;
  /** Tylko przy końcu sesji. */
  reason?: SessionEndReason;
}

/** Odmowa trzeciego startu (zdanie z rozpiski etapu, decyzja MG z 03.10). */
export const SESSION_SLOTS_FULL_TEXT =
  'Wszystkie miejsca na sesje są zajęte — serwer nie obsłuży więcej sesji naraz. Spróbuj, gdy któraś się skończy.';

/** Polskie zdanie dla kodu odmowy z obszaru sesji; null — kod spoza obszaru. */
export function sessionErrorText(code: string): string | null {
  switch (code) {
    case 'SESSION_SLOTS_FULL':
      return SESSION_SLOTS_FULL_TEXT;
    case 'SESSION_NOT_RUNNING':
      return 'Sesja nie trwa — to zadziała, gdy MG ją rozpocznie.';
    case 'SESSION_RUNNING':
      return 'Masz trwającą sesję — zakończ ją, zanim przejdziesz do innej kampanii.';
    case 'CAMPAIGN_NOT_OPEN':
      return 'Sesję rozpoczyna się w kampanii, którą masz otwartą przy stole.';
    default:
      return null;
  }
}

/** Wpis dla MG, gdy slot zwolnił zegar, a nie on sam. */
export function sessionAutoEndText(reason: 'empty' | 'idle', minutes: number): string {
  return reason === 'empty'
    ? `Sesja zakończona automatycznie: przez ${formatMinutes(minutes)} nikogo nie było przy stole. Miejsce na sesję jest wolne.`
    : `Sesja zakończona automatycznie: przez ${formatMinutes(minutes)} nic się przy stole nie wydarzyło. Miejsce na sesję jest wolne.`;
}

function formatMinutes(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? 'godzinę' : `${hours} h`;
  }
  return `${minutes} min`;
}
