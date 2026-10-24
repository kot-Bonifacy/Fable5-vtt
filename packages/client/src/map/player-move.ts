import type { PlayerMoveMode } from '@vtt/shared';

/**
 * „Ruch graczy” po stronie klienta (etap 45): zdania i etykiety przełącznika MG.
 * Prawdę rozstrzyga serwer (`MOVE_LOCKED`, `MOVE_PACE`). Od 24.10 pula
 * Eksploracji marszu klikiem nie wiąże — płaci z niej tylko Skok.
 */

/** Odmowa i baner przy Stop — ta sama treść, bo to ta sama sprawa. */
export const PLAYER_MOVE_STOP_NOTE = 'Ruch wstrzymany przez MG.';

/** Odmowa serwera, gdy ruch bez trasy marszu nie mieści się w puli. */
export const PLAYER_MOVE_PACE_NOTE =
  'Złap oddech — tak daleko na raz nie dojdziesz. Pula metrów odnawia się w kilka sekund.';

export const PLAYER_MOVE_MODES: readonly {
  mode: PlayerMoveMode;
  label: string;
  hint: string;
}[] = [
  {
    mode: 'stop',
    label: 'Stop',
    hint: 'Nikt z graczy nie rusza figury, także w walce. Gracze widzą baner. Ciebie to nie dotyczy. Każda sesja zaczyna się w Stop.',
  },
  {
    mode: 'explore',
    label: 'Eksploracja',
    hint: 'Gracze prowadzą figury klikiem, omijając ściany, mgłę i wrogów. Poza walką marsz idzie do celu bez postojów; w walce — z budżetu tury.',
  },
];

export function playerMoveLabel(mode: PlayerMoveMode): string {
  return PLAYER_MOVE_MODES.find((entry) => entry.mode === mode)?.label ?? mode;
}
