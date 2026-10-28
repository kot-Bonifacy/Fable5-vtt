import { useEffect, useMemo, useState } from 'react';
import { ROLE_GM, cpredTurnExhausted } from '@vtt/shared';
import { openDamageCallFor } from '../attack-damage-call.js';
import { nextCombatTurn } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { activeCombatantOf, myActiveCombatant, useCombatStore } from '../stores/combatStore.js';
import { useRollStore } from '../stores/rollStore.js';
import { useTokenStore } from '../stores/tokenStore.js';

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
  const done = useTurnDone(isGm ? null : mine?.turn);
  return {
    shown,
    isGm,
    done,
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

/**
 * Gracz nie ma już w turze nic poza ruchem (etap 63a, zlecenie MG z 28.10),
 * więc „Kończę turę” pulsuje. Nie wtedy, gdy kubek trzyma jeszcze jego rzut:
 * obrażenia za trafienie, Unik albo załadowany atak — z tym tura się nie kończy.
 */
function useTurnDone(turn: Parameters<typeof cpredTurnExhausted>[0]): boolean {
  const exhausted = cpredTurnExhausted(turn);
  const user = useAuthStore((s) => s.user);
  const items = useChatStore((s) => s.items);
  const characters = useCharacterStore((s) => s.characters);
  const tokens = useTokenStore((s) => s.tokens);
  const holding = useRollStore(
    (s) => s.attack !== null || s.pending !== null || s.evasion !== null,
  );
  const damageOwed = useMemo(
    () => exhausted && openDamageCallFor(items, user, characters, tokens, new Set()) !== null,
    [exhausted, items, user, characters, tokens],
  );
  return exhausted && !holding && !damageOwed;
}

export function HudEndTurn() {
  const { shown, isGm, done, name, pending, end } = useEndTurn();
  if (!shown) return null;
  return (
    <section
      className={`hud-end-turn${done ? ' hud-end-turn--done' : ''}`}
      aria-label={isGm ? 'Tura' : 'Twoja tura'}
    >
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
            : done
              ? 'Akcja wykorzystana — zostało najwyżej przejście. Oddaj turę (klawisz E na mapie)'
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
  const { shown, isGm, done, name, pending, end } = useEndTurn();
  if (!shown) return null;
  const label = isGm ? 'Następna tura' : 'Kończę turę';
  return (
    <button
      type="button"
      className={`hud-end-turn-compact${done ? ' hud-end-turn--done' : ''}`}
      disabled={pending}
      title={`${isGm ? 'Tura' : 'Twoja tura'}${name ? ` (${name})` : ''} — ${label.toLowerCase()} (E)`}
      aria-label={label}
      onClick={end}
    >
      {isGm ? '▶' : '✓'}
    </button>
  );
}
