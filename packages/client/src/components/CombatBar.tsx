import { useMemo } from 'react';
import { ROLE_GM } from '@vtt/shared';
import { nextCombatTurn, previousCombatTurn } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCombatStore, myActiveCombatant } from '../stores/combatStore.js';

/**
 * The tracker's always-visible face, floating over the map: round number,
 * the initiative queue and whose turn it is. Everything that needs more room —
 * rolling, reordering, adding participants — lives in the „Walka" tab.
 */
export function CombatBar() {
  const combat = useCombatStore((s) => s.combat);
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const myTurn = useMemo(() => myActiveCombatant(combat, user?.id ?? null), [combat, user?.id]);

  if (!combat) return null;
  const activeId = combat.activeCombatantId;

  return (
    <div className="combat-bar" role="group" aria-label="Kolejka inicjatywy">
      <span className="combat-bar-round">
        {combat.round === 0 ? 'PRZED WALKĄ' : `RUNDA ${combat.round}`}
      </span>
      {isGm && (
        <button
          type="button"
          className="combat-bar-step"
          onClick={() => void previousCombatTurn()}
          title="Poprzednia tura"
          aria-label="Poprzednia tura"
        >
          ◀
        </button>
      )}
      <ol className="combat-bar-queue">
        {combat.combatants.map((combatant) => (
          <li
            key={combatant.id}
            className={`combat-chip${combatant.id === activeId ? ' combat-chip--active' : ''}${
              combatant.hidden ? ' combat-chip--hidden' : ''
            }`}
            title={
              combatant.tieBreak !== null
                ? `${combatant.name} — inicjatywa ${combatant.initiative ?? '—'} (REF ${combatant.tieBreak})`
                : `${combatant.name} — inicjatywa ${combatant.initiative ?? '—'}`
            }
          >
            {combatant.imageUrl ? (
              <img className="combat-chip-portrait" src={combatant.imageUrl} alt="" />
            ) : (
              <span className="combat-chip-portrait combat-chip-portrait--empty">
                {combatant.name.trim().charAt(0).toUpperCase() || '?'}
              </span>
            )}
            <span className="combat-chip-name">{combatant.name}</span>
            <span className="combat-chip-initiative">{combatant.initiative ?? '—'}</span>
          </li>
        ))}
      </ol>
      {isGm && (
        <button
          type="button"
          className="combat-bar-step"
          onClick={() => void nextCombatTurn()}
          title={combat.round === 0 ? 'Rozpocznij rundę 1' : 'Następna tura'}
          aria-label="Następna tura"
        >
          ▶
        </button>
      )}
      {/* The acting player ends their own turn; the server re-checks whose it is. */}
      {!isGm && myTurn && (
        <button type="button" className="combat-bar-end-turn" onClick={() => void nextCombatTurn()}>
          Kończę turę
        </button>
      )}
    </div>
  );
}
