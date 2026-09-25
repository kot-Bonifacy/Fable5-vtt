import { useEffect, useMemo, useState } from 'react';
import { ROLE_GM } from '@vtt/shared';
import { nextCombatTurn } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { myActiveCombatant, useCombatStore } from '../stores/combatStore.js';

/**
 * „Kończę turę" — the player's end of the turn, at the top of the left rail
 * (owner's call, 25.09).
 *
 * It lived in the top bar as a small pill the same weight as a reminder; the
 * most important button a player has during a fight now sits beside the actions
 * the turn is played with. It shows whenever the turn is the player's,
 * whatever the rail happens to describe — also with nothing selected — so
 * the player never has to go looking for a figure to be allowed to finish.
 *
 * The GM steps the queue from the strip over the map and does not get this.
 * „E" on the map still does the same thing; the server re-checks whose turn
 * it is either way.
 */
function useEndTurn() {
  const combat = useCombatStore((s) => s.combat);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const mine = useMemo(() => myActiveCombatant(combat, userId), [combat, userId]);
  const activeId = combat?.activeCombatantId ?? null;
  const [pending, setPending] = useState(false);

  // One press, one turn: a double click would otherwise end this turn and —
  // when the next participant is the same player's second figure — that one
  // too. The lock lifts when the queue actually moves, or when the server says no.
  useEffect(() => setPending(false), [activeId, combat?.round]);

  return {
    mine: isGm ? null : mine,
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
  const { mine, pending, end } = useEndTurn();
  if (!mine) return null;
  return (
    <section className="hud-end-turn" aria-label="Twoja tura">
      <span className="hud-end-turn-label">
        Twoja tura
        <span className="hud-end-turn-name">{mine.name}</span>
      </span>
      <button
        type="button"
        className="hud-end-turn-button"
        disabled={pending}
        title="Oddaj turę następnemu w kolejce (klawisz E na mapie)"
        onClick={end}
      >
        Kończę turę
        <kbd className="hud-end-turn-key">E</kbd>
      </button>
    </section>
  );
}

/** The same button on the collapsed rail: a turn must be endable with the map at full width. */
export function HudEndTurnCompact() {
  const { mine, pending, end } = useEndTurn();
  if (!mine) return null;
  return (
    <button
      type="button"
      className="hud-end-turn-compact"
      disabled={pending}
      title={`Twoja tura (${mine.name}) — kończę turę (E)`}
      aria-label="Kończę turę"
      onClick={end}
    >
      ✓
    </button>
  );
}
