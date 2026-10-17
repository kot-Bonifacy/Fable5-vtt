import { useEffect, useMemo, useState } from 'react';
import { ROLE_GM } from '@vtt/shared';
import { nextCombatTurn } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { activeCombatantOf, myActiveCombatant, useCombatStore } from '../stores/combatStore.js';

/**
 * The end of the turn, at the bottom of the left rail (owner's call, 16.10).
 *
 * For a player it is „Kończę turę" and shows only while the turn is theirs,
 * whatever the rail happens to describe — also with nothing selected — so the
 * player never has to go looking for a figure to be allowed to finish.
 *
 * The GM gets the same block as „Następna tura" through the whole fight, with
 * the acting figure's name: the ▶ that used to step the queue from the strip
 * over the map moved here, so ending a turn is one place for everybody. Starting
 * the fight stays on the strip — that is a different gesture.
 *
 * „E" on the map still does the same thing; the server re-checks whose turn
 * it is either way.
 */
function useEndTurn() {
  const combat = useCombatStore((s) => s.combat);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const mine = useMemo(() => myActiveCombatant(combat, userId), [combat, userId]);
  const active = useMemo(() => activeCombatantOf(combat), [combat]);
  const activeId = combat?.activeCombatantId ?? null;
  const [pending, setPending] = useState(false);

  // One press, one turn: a double click would otherwise end this turn and —
  // when the next participant is the same player's second figure — that one
  // too. The lock lifts when the queue actually moves, or when the server says no.
  useEffect(() => setPending(false), [activeId, combat?.round]);

  const shown = isGm ? (combat?.round ?? 0) > 0 : mine !== null;
  return {
    shown,
    isGm,
    name: (isGm ? active?.name : mine?.name) ?? '',
    pending,
    end: () => {
      if (pending) return;
      setPending(true);
      // A refusal leaves the queue where it was, so nothing would lift the lock.
      void nextCombatTurn().then((ack) => {
        if (!ack.ok) setPending(false);
      });
    },
  };
}

export function HudEndTurn() {
  const { shown, isGm, name, pending, end } = useEndTurn();
  if (!shown) return null;
  return (
    <section className="hud-end-turn" aria-label={isGm ? 'Tura' : 'Twoja tura'}>
      <span className="hud-end-turn-label">
        {isGm ? 'Tura' : 'Twoja tura'}
        {name && <span className="hud-end-turn-name">{name}</span>}
      </span>
      <button
        type="button"
        className="hud-end-turn-button"
        disabled={pending}
        title={
          isGm
            ? 'Zamyka bieżącą turę i oddaje ją następnemu w kolejce (klawisz E na mapie)'
            : 'Oddaj turę następnemu w kolejce (klawisz E na mapie)'
        }
        onClick={end}
      >
        {isGm ? 'Następna tura' : 'Kończę turę'}
        <kbd className="hud-end-turn-key" aria-hidden="true">
          E
        </kbd>
      </button>
    </section>
  );
}

/** The same button on the collapsed rail: a turn must be endable with the map at full width. */
export function HudEndTurnCompact() {
  const { shown, isGm, name, pending, end } = useEndTurn();
  if (!shown) return null;
  const label = isGm ? 'Następna tura' : 'Kończę turę';
  return (
    <button
      type="button"
      className="hud-end-turn-compact"
      disabled={pending}
      title={`${isGm ? 'Tura' : 'Twoja tura'}${name ? ` (${name})` : ''} — ${label.toLowerCase()} (E)`}
      aria-label={label}
      onClick={end}
    >
      {isGm ? '▶' : '✓'}
    </button>
  );
}
