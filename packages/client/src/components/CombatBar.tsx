import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TurnBudgetView } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import { nextCombatTurn, previousCombatTurn } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCombatStore, activeCombatantOf, myActiveCombatant } from '../stores/combatStore.js';
import { useDeathSavePrompt } from '../death-save.js';

/**
 * The tracker's always-visible face, floating over the map: round number,
 * the initiative queue and whose turn it is. Everything that needs more room —
 * rolling, reordering, adding participants — lives in the „Walka" tab.
 *
 * The bar can be dragged anywhere over the map by its round label — the one
 * spot that carries no button, so grabbing it never fights the controls. Where
 * it was put is remembered between sessions, like a desktop icon; a
 * double-click on the label sends it back to the top centre.
 */

const POSITION_KEY = 'vtt.combatBarPosition';
/** Arrow-key nudge for the focused handle (px). */
const NUDGE_STEP = 16;

/** Bar position in map-area pixels; null = the default top-centre spot. */
interface BarPosition {
  x: number;
  y: number;
}

function readStoredPosition(): BarPosition | null {
  try {
    const raw = window.localStorage.getItem(POSITION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { x, y } = parsed as Partial<BarPosition>;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: x as number, y: y as number };
  } catch {
    // Unreadable storage only costs the remembered spot.
    return null;
  }
}

function storePosition(position: BarPosition | null): void {
  try {
    if (position) window.localStorage.setItem(POSITION_KEY, JSON.stringify(position));
    else window.localStorage.removeItem(POSITION_KEY);
  } catch {
    // Private mode: the bar still moves, it just forgets where.
  }
}

/**
 * What is left of the acting participant's turn (stage 14b): one pip per unit,
 * filled once it is spent. The labels come from the game system, so this stays
 * a row of dots whatever „Ruch" and „Akcja" turn out to mean in a future RPG.
 */
function TurnBudget({ budget }: { budget: TurnBudgetView }) {
  return (
    <div
      className="combat-budget"
      title={
        budget.note
          ? `${budget.note}${budget.overspent ? ` · przekroczenie ×${budget.overspent}` : ''}`
          : 'Budżet tury'
      }
    >
      {budget.resources.map((resource) => (
        <span key={resource.id} className="combat-budget-item">
          <span className="combat-budget-label">{resource.label}</span>
          <span className="combat-budget-pips" aria-label={`${resource.used} z ${resource.max}`}>
            {Array.from({ length: Math.max(resource.max, resource.used) }, (_, index) => (
              <span
                key={index}
                className={`combat-budget-pip${
                  index < resource.used ? ' combat-budget-pip--spent' : ''
                }${index >= resource.max ? ' combat-budget-pip--over' : ''}`}
              />
            ))}
          </span>
        </span>
      ))}
      {budget.bypass && (
        <span className="combat-budget-flag" title="MG przepuścił jedną akcję">
          przepustka
        </span>
      )}
      {budget.overspent ? (
        <span className="combat-budget-flag combat-budget-flag--over" title="Poza budżetem tury">
          +{budget.overspent}
        </span>
      ) : null}
    </div>
  );
}

export function CombatBar() {
  const combat = useCombatStore((s) => s.combat);
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const myTurn = useMemo(() => myActiveCombatant(combat, user?.id ?? null), [combat, user?.id]);
  const acting = useMemo(() => activeCombatantOf(combat), [combat]);
  // RAW: a Mortally Wounded character rolls at the start of each of their turns.
  const deathSave = useDeathSavePrompt();

  const barRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<BarPosition | null>(readStoredPosition);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ pointerId: number; grabX: number; grabY: number } | null>(null);

  /** Keeps the bar inside the map, whatever its current size is. */
  const clamp = useCallback((x: number, y: number): BarPosition => {
    const bar = barRef.current;
    const parent = bar?.offsetParent as HTMLElement | null;
    if (!bar || !parent) return { x: Math.round(x), y: Math.round(y) };
    const maxX = Math.max(0, parent.clientWidth - bar.offsetWidth);
    const maxY = Math.max(0, parent.clientHeight - bar.offsetHeight);
    return {
      x: Math.min(Math.max(Math.round(x), 0), maxX),
      y: Math.min(Math.max(Math.round(y), 0), maxY),
    };
  }, []);

  /** Where the bar sits right now, in map-area px (also while still default). */
  const currentOffset = useCallback((): BarPosition => {
    const bar = barRef.current;
    const parent = bar?.offsetParent as HTMLElement | null;
    if (!bar || !parent) return position ?? { x: 0, y: 0 };
    const barRect = bar.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    // Read the rendered box: the default spot is centred with a transform,
    // which offsetLeft would not account for.
    return { x: barRect.left - parentRect.left, y: barRect.top - parentRect.top };
  }, [position]);

  // A shrinking window (or a wider side panel) must not strand the bar
  // outside the map.
  useEffect(() => {
    if (!position) return;
    const onResize = () => setPosition((current) => (current ? clamp(current.x, current.y) : null));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [position, clamp]);

  const onHandleDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const origin = currentOffset();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      grabX: event.clientX - origin.x,
      grabY: event.clientY - origin.y,
    };
    setDragging(true);
  };

  const onHandleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(clamp(event.clientX - drag.grabX, event.clientY - drag.grabY));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    setPosition((current) => {
      storePosition(current);
      return current;
    });
  };

  const onHandleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-NUDGE_STEP, 0],
      ArrowRight: [NUDGE_STEP, 0],
      ArrowUp: [0, -NUDGE_STEP],
      ArrowDown: [0, NUDGE_STEP],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    const origin = position ?? currentOffset();
    const moved = clamp(origin.x + delta[0], origin.y + delta[1]);
    setPosition(moved);
    storePosition(moved);
  };

  const resetPosition = () => {
    setPosition(null);
    storePosition(null);
  };

  if (!combat) return null;
  const activeId = combat.activeCombatantId;

  return (
    <div
      ref={barRef}
      className={`combat-bar${dragging ? ' combat-bar--dragging' : ''}`}
      role="group"
      aria-label="Kolejka inicjatywy"
      style={position ? { left: position.x, top: position.y, transform: 'none' } : undefined}
    >
      <div
        className="combat-bar-round combat-bar-handle"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={resetPosition}
        onKeyDown={onHandleKeyDown}
        tabIndex={0}
        role="button"
        // No tooltip on purpose: the grab cursor says it all, and a hint
        // floating over the map would break the table's mood. The label keeps
        // an aria-label, which only assistive tech reads out.
        aria-label="Przesuń pasek walki"
      >
        {combat.round === 0 ? 'PRZED WALKĄ' : `RUNDA ${combat.round}`}
      </div>
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
            {combatant.held && (
              <span className="combat-chip-held" title="Akcja wstrzymana">
                ⏸
              </span>
            )}
            <span className="combat-chip-initiative">{combatant.initiative ?? '—'}</span>
          </li>
        ))}
      </ol>
      {/* The budget belongs to whoever is acting — the queue above says who. */}
      {acting?.turn && <TurnBudget budget={acting.turn} />}
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
      {deathSave && (
        <button
          type="button"
          className="combat-bar-death-save"
          onClick={deathSave.roll}
          title={`${deathSave.characterName} jest śmiertelnie ranny — rzut 1k10 pod BC${
            deathSave.savesTaken > 0 ? `, +${deathSave.savesTaken} za poprzednie testy` : ''
          }`}
        >
          Test Przeżywalności
          {deathSave.savesTaken > 0 ? ` +${deathSave.savesTaken}` : ''}
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
