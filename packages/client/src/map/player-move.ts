import type { CombatView, PaceState, PlayerMoveMode, SceneView, TokenView } from '@vtt/shared';
import { PACE_FALLBACK_CAP_M, paceAvailable, paceReadyInMs } from '@vtt/shared';

/**
 * „Ruch graczy” po stronie klienta (etap 45): zdania, etykiety przełącznika MG
 * i pula Eksploracji przełożona na ten sam budżet marszu, który daje Tura.
 * Prawdę rozstrzyga serwer (`MOVE_LOCKED`, `MOVE_PACE`) — tu chodzi o to, żeby
 * kursor powiedział „nie” przed kliknięciem, a trasa zatrzymała się tam, gdzie
 * serwer ją zatrzyma.
 */

/** Odmowa i baner przy Stop — ta sama treść, bo to ta sama sprawa. */
export const PLAYER_MOVE_STOP_NOTE = 'Ruch wstrzymany przez MG.';

/** Odmowa serwera, gdy trasa nie mieści się w puli. */
export const PLAYER_MOVE_PACE_NOTE =
  'Złap oddech — tak daleko na raz nie dojdziesz. Pula metrów odnawia się w kilka sekund.';

/** Poniżej tylu metrów w puli kursor mówi „Złap oddech”, zamiast planować trasę. */
const PACE_MIN_STEP_M = 1;

export const PLAYER_MOVE_MODES: readonly {
  mode: PlayerMoveMode;
  label: string;
  hint: string;
}[] = [
  {
    mode: 'stop',
    label: 'Stop',
    hint: 'Nikt z graczy nie rusza figury, także w walce. Gracze widzą baner. Ciebie to nie dotyczy.',
  },
  {
    mode: 'explore',
    label: 'Eksploracja',
    hint: 'Poza walką każdy krok płaci z puli metrów (ruch z jednej tury), która odnawia się w ~10 s — drużyna nie przebiegnie mapy w kilka sekund.',
  },
  {
    mode: 'free',
    label: 'Swobodny',
    hint: 'Gracze chodzą bez limitu. W trwającej walce uczestnik dalej chodzi z budżetu tury.',
  },
];

export function playerMoveLabel(mode: PlayerMoveMode): string {
  return PLAYER_MOVE_MODES.find((entry) => entry.mode === mode)?.label ?? mode;
}

/** Czy tę figurę pilnuje Tura — wtedy pula milczy, jak na serwerze. */
function inCombat(combat: CombatView | null, tokenId: string): boolean {
  return !!combat?.combatants.some((row) => row.tokenId === tokenId);
}

/**
 * Pula figury gracza, gdy w tej chwili to ona hamuje ruch — `null`, gdy nie
 * (MG, inny tryb, walka, figura bez prywatnego widoku).
 */
export function paceFor(
  scene: SceneView | null,
  combat: CombatView | null,
  token: TokenView | undefined,
  isGm: boolean,
  state: PaceState | undefined,
  now: number,
): { capM: number; availableM: number; readyInMs: number } | null {
  if (isGm || !token || scene?.playerMove !== 'explore') return null;
  if (token.paceCapM === undefined) return null;
  if (inCombat(combat, token.id)) return null;
  const capM = token.paceCapM ?? PACE_FALLBACK_CAP_M;
  return {
    capM,
    availableM: paceAvailable(state, capM, now),
    readyInMs: paceReadyInMs(state, capM, PACE_MIN_STEP_M, now),
  };
}

/** „Złap oddech — ruszysz za 3 s.” albo `null`, gdy pula ma na krok. */
export function paceRefusal(pace: { availableM: number; readyInMs: number } | null): string | null {
  if (!pace || pace.availableM >= PACE_MIN_STEP_M) return null;
  const seconds = Math.max(1, Math.ceil(pace.readyInMs / 1000));
  return `Złap oddech — ruszysz za ${seconds} s.`;
}
