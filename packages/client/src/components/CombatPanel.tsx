import { useEffect, useMemo, useRef, useState } from 'react';
import type { CombatantView, TokenView, TurnBudgetView } from '@vtt/shared';
import { formatMetres } from '@vtt/shared';
import {
  COMBAT_INITIATIVE_MAX,
  COMBAT_INITIATIVE_MIN,
  ROLE_GM,
  findInitiativeTies,
} from '@vtt/shared';
import {
  addToCombat,
  endCombat,
  nextCombatTurn,
  previousCombatTurn,
  releaseCombatHold,
  removeFromCombat,
  reorderCombat,
  rerollCombatTie,
  resetCombatTurn,
  rollCombatInitiativeForAll,
  setCombatInitiative,
  startCombat,
} from '../socket.js';
import { BotTurnButton } from './BotTurnButton.js';
import { CombatActions } from './CombatActions.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCombatStore } from '../stores/combatStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { useRollStore } from '../stores/rollStore.js';
import { EmptyState } from './EmptyState.js';

/** Tokens likely to fight: the players' characters come pre-ticked. */
function defaultSelection(tokens: TokenView[]): string[] {
  return tokens.filter((token) => token.ownerId !== null).map((token) => token.id);
}

/** The picker the GM starts a fight from (no combat running yet). */
function CombatSetup({ tokens }: { tokens: TokenView[] }) {
  const sceneId = useSceneStore((s) => s.effectiveScene?.id ?? null);
  const selection = useCombatStore((s) => s.selection);
  const toggleSelection = useCombatStore((s) => s.toggleSelection);
  const setSelection = useCombatStore((s) => s.setSelection);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  // Pre-tick the player tokens once, then leave the GM's choices alone.
  useEffect(() => {
    if (initialized.current || tokens.length === 0) return;
    initialized.current = true;
    setSelection(defaultSelection(tokens));
  }, [tokens, setSelection]);

  async function begin() {
    if (!sceneId || selection.length === 0) return;
    setStarting(true);
    setError(null);
    const ack = await startCombat(sceneId, selection);
    setStarting(false);
    if (!ack.ok) setError('Nie udało się rozpocząć walki.');
  }

  return (
    <div className="combat-panel">
      <p className="combat-hint">
        Zaznacz uczestników i rozpocznij walkę. Posiłki dodasz w trakcie — z tej listy albo z menu
        kontekstowego tokenu.
      </p>
      {tokens.length === 0 ? (
        <EmptyState
          text={
            'Na scenie nie ma jeszcze żadnych figur — postaw je z zakładki „Tokeny”, zanim zaczniesz walkę.'
          }
        />
      ) : (
        <ul className="combat-picker">
          {tokens.map((token) => (
            <li key={token.id}>
              <label className="combat-picker-row">
                <input
                  type="checkbox"
                  checked={selection.includes(token.id)}
                  onChange={() => toggleSelection(token.id)}
                />
                <span className="combat-picker-name">{token.name}</span>
                {token.hidden && <span className="combat-tag">ukryty</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="auth-error">{error}</p>}
      <div className="scene-editor-row">
        <button
          className="primary-button"
          type="button"
          onClick={() => void begin()}
          disabled={starting || selection.length === 0}
        >
          {starting ? 'Rozpoczynanie…' : `Rozpocznij walkę (${selection.length})`}
        </button>
        <button
          type="button"
          className="small-button"
          onClick={() => setSelection(defaultSelection(tokens))}
        >
          Tylko postacie graczy
        </button>
      </div>
    </div>
  );
}

/** „Ruch 0/1 · Akcja 1/1 · Ataki 2/2" — the budget squeezed into a row. */
function budgetSummary(budget: TurnBudgetView): string {
  const parts = budget.resources.map(
    (resource) => `${resource.label} ${resource.used}/${resource.max}`,
  );
  if (budget.distance) {
    const used = formatMetres(budget.distance.used);
    const max = formatMetres(budget.distance.max);
    const metres = `${budget.distance.label} ${used}/${max}`;
    parts.push(budget.distance.hard ? `${metres} (utrudniony ×2)` : metres);
  }
  if (budget.overspent) parts.push(`poza budżetem ×${budget.overspent}`);
  if (budget.bypass) parts.push('przepustka MG');
  return parts.join(' · ');
}

/** One row of the tracker; the GM can drag it to settle a tie by hand. */
function CombatRow({
  combatant,
  index,
  isActive,
  isGm,
  canRoll,
  hp,
  onDragStart,
  onDrop,
}: {
  combatant: CombatantView;
  index: number;
  isActive: boolean;
  isGm: boolean;
  canRoll: boolean;
  hp: { current: number; max: number } | null;
  onDragStart: (id: string) => void;
  onDrop: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === '') {
      void setCombatInitiative(combatant.id, null);
      return;
    }
    const value = Number.parseInt(trimmed, 10);
    if (Number.isNaN(value)) return;
    const clamped = Math.min(Math.max(value, COMBAT_INITIATIVE_MIN), COMBAT_INITIATIVE_MAX);
    void setCombatInitiative(combatant.id, clamped);
  }

  function loadCup() {
    useRollStore.getState().loadInitiativeCup({
      combatantId: combatant.id,
      name: combatant.name,
      modifierTotal: combatant.tieBreak ?? 0,
    });
  }

  return (
    <li
      className={`combat-row${isActive ? ' combat-row--active' : ''}`}
      draggable={isGm}
      onDragStart={() => onDragStart(combatant.id)}
      onDragOver={(e) => {
        if (isGm) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(combatant.id);
      }}
    >
      <span className="combat-row-index">{index + 1}</span>
      {combatant.imageUrl ? (
        <img className="combat-row-portrait" src={combatant.imageUrl} alt="" />
      ) : (
        <span className="combat-row-portrait combat-row-portrait--empty">
          {combatant.name.trim().charAt(0).toUpperCase() || '?'}
        </span>
      )}
      <span className="combat-row-main">
        <span className="combat-row-name">
          {combatant.name}
          {combatant.hidden && <span className="combat-tag">ukryty</span>}
          {combatant.tokenId === null && <span className="combat-tag">w Sieci</span>}
        </span>
        <span className="combat-row-meta">
          {hp ? `PW ${hp.current}/${hp.max}` : ''}
          {combatant.tieBreak !== null ? ` · REF ${combatant.tieBreak}` : ''}
          {combatant.turn ? ` · ${budgetSummary(combatant.turn)}` : ''}
        </span>
        {/* What their next turn already owes (stage 14e). Shown before the turn
            starts on purpose: a wound that landed on somebody else's turn is
            invisible until the tracker says so. */}
        {combatant.owes?.map((line) => (
          <span key={line} className="combat-row-held combat-row-held--owes">
            🩼 {line}
          </span>
        ))}
        {combatant.grapple && (
          <span className="combat-row-held">
            🤼{' '}
            {combatant.grapple.role === 'attacker'
              ? `trzyma ${combatant.grapple.otherName}`
              : `w Trzymaniu — ${combatant.grapple.otherName}`}
            {combatant.grapple.shield ? ' · Ludzka tarcza' : ''}
            {combatant.grapple.chokeStreak ? ` · Duszenie ×${combatant.grapple.chokeStreak}` : ''}
          </span>
        )}
        {combatant.held && (
          <span className="combat-row-held">
            ⏸{' '}
            {combatant.held.initiative !== null
              ? `wstrzymana przy ${combatant.held.initiative}`
              : `wstrzymana: ${combatant.held.trigger ?? 'wyzwalacz opisany'}`}
            {isGm && (
              <button
                type="button"
                className="small-button"
                onClick={() => void releaseCombatHold(combatant.id)}
                title="Odpal wstrzymaną Akcję teraz"
              >
                Odpal
              </button>
            )}
          </span>
        )}
      </span>
      {canRoll && (
        <button
          type="button"
          className="small-button"
          onClick={loadCup}
          title="Załaduj kubek — rzut wykonasz potrząsając kubkiem"
          aria-label="Załaduj kubek — rzut wykonasz potrząsając kubkiem"
        >
          🎲
        </button>
      )}
      {isGm && editing ? (
        <input
          className="combat-row-initiative-input"
          type="number"
          autoFocus
          // Select what is there: typing a new value must replace the old one,
          // not append to it (3 + „15" would land as 315, clamped to 99).
          onFocus={(e) => e.target.select()}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <span
          className="combat-row-initiative"
          onClick={
            isGm
              ? () => {
                  setDraft(combatant.initiative === null ? '' : String(combatant.initiative));
                  setEditing(true);
                }
              : undefined
          }
          title={isGm ? 'Kliknij, aby wpisać inicjatywę ręcznie' : undefined}
        >
          {combatant.initiative ?? '—'}
        </span>
      )}
      {/* Etap 20b: pokazuje się samo przy figurze prowadzonej przez bota. */}
      <BotTurnButton tokenId={combatant.tokenId} />
      {isGm && combatant.turn && (
        <button
          type="button"
          className="small-button"
          onClick={() => void resetCombatTurn(combatant.id)}
          title="Zwróć turę — pełny budżet Ruchu i Akcji"
          aria-label="Zwróć turę — pełny budżet Ruchu i Akcji"
        >
          ↺
        </button>
      )}
      {isGm && (
        <button
          type="button"
          className="small-button"
          onClick={() => void removeFromCombat(combatant.id)}
          title="Usuń z walki"
          aria-label="Usuń z walki"
        >
          ✕
        </button>
      )}
    </li>
  );
}

export function CombatPanel() {
  const combat = useCombatStore((s) => s.combat);
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  // Raw store slices only — a selector deriving a new array on every render
  // loops React (the trap from stages 10 and 13).
  const tokenMap = useTokenStore((s) => s.tokens);
  const [dragged, setDragged] = useState<string | null>(null);

  const tokens = useMemo(() => Object.values(tokenMap), [tokenMap]);
  const ties = useMemo(() => (combat ? findInitiativeTies(combat.combatants) : []), [combat]);
  const outsiders = useMemo(() => {
    if (!combat) return [];
    const inFight = new Set(combat.combatants.map((c) => c.tokenId));
    return tokens.filter((token) => !inFight.has(token.id));
  }, [combat, tokens]);

  if (!combat) {
    return isGm ? (
      <CombatSetup tokens={tokens} />
    ) : (
      <div className="combat-panel">
        <EmptyState text="Walka nie trwa — Kolejka Inicjatywy pojawi się tutaj, gdy MG włączy tryb turowy." />
      </div>
    );
  }

  /** May this viewer roll for the participant? Owner or GM. */
  // Uczestnik bez figury to Czarny LOD z etapu 26c: inicjatywy się nie rzuca,
  // bo LOD wskakuje na czoło kolejki „o jeden punkt wyżej" (s. 205).
  const mayRoll = (combatant: CombatantView): boolean =>
    combatant.tokenId !== null && (isGm || (user !== null && combatant.ownerId === user.id));

  /** The participant this viewer may spend a turn for, if any (stage 14b). */
  const active = combat.combatants.find((c) => c.id === combat.activeCombatantId) ?? null;
  const actor = isGm
    ? active
    : (combat.combatants.find(
        (c) => user !== null && c.ownerId === user.id && (c.id === active?.id || c.held),
      ) ?? null);

  function handleDrop(targetId: string) {
    if (!isGm || !combat || dragged === null || dragged === targetId) return;
    const ids = combat.combatants.map((c) => c.id);
    const from = ids.indexOf(dragged);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    setDragged(null);
    void reorderCombat(ids);
  }

  return (
    <div className="combat-panel">
      <div className="combat-header">
        <span className="combat-header-round">
          {combat.round === 0 ? 'Przed pierwszą rundą' : `Runda ${combat.round}`}
        </span>
        {isGm && (
          <span className="combat-header-buttons">
            <button
              type="button"
              className="small-button"
              onClick={() => void previousCombatTurn()}
              title="Poprzednia tura"
              aria-label="Poprzednia tura"
            >
              ◀
            </button>
            <button type="button" className="small-button" onClick={() => void nextCombatTurn()}>
              {combat.round === 0 ? 'Start' : 'Następna tura ▶'}
            </button>
          </span>
        )}
      </div>

      {isGm && (
        <div className="scene-editor-row">
          <button
            className="primary-button"
            type="button"
            onClick={() => void rollCombatInitiativeForAll(false)}
          >
            Rzuć wszystkim
          </button>
          <button
            type="button"
            className="small-button"
            onClick={() => void rollCombatInitiativeForAll(true)}
            title="Przerzuca inicjatywę także tym, którzy już ją mają"
          >
            Przerzuć wszystkim
          </button>
        </div>
      )}

      {ties.map((group) => (
        <p key={group.map((c) => c.id).join('-')} className="combat-tie">
          Remis ({group[0]?.initiative}): {group.map((c) => c.name).join(', ')}
          {isGm && (
            <button
              type="button"
              className="small-button"
              onClick={() => void rerollCombatTie(group.map((c) => c.id))}
              title="Zasady: remis rozstrzyga się ponownym rzutem"
            >
              Przerzuć remis
            </button>
          )}
        </p>
      ))}

      <ol className="combat-list">
        {combat.combatants.map((combatant, index) => {
          const token = combatant.tokenId ? tokenMap[combatant.tokenId] : undefined;
          return (
            <CombatRow
              key={combatant.id}
              combatant={combatant}
              index={index}
              isActive={combatant.id === combat.activeCombatantId}
              isGm={isGm}
              canRoll={mayRoll(combatant)}
              hp={token?.hp ?? null}
              onDragStart={setDragged}
              onDrop={handleDrop}
            />
          );
        })}
      </ol>

      {/* Action buttons belong to whoever may actually act: the GM (always,
          for the acting participant) and a player on their own turn — or with
          an Action they held into somebody else's. */}
      {actor && <CombatActions combat={combat} combatant={actor} />}

      {isGm && (
        <p className="combat-hint">
          Kolejność: wyższa inicjatywa zawsze pierwsza, remisy rozstrzyga REF. Przeciągnij wiersz,
          żeby zdecydować inaczej — kolejny rzut inicjatywy porządkuje listę od nowa.
        </p>
      )}

      {isGm && outsiders.length > 0 && (
        <>
          <p className="panel-section-title">Dołącz do walki</p>
          <ul className="combat-picker">
            {outsiders.map((token) => (
              <li key={token.id} className="combat-picker-row">
                <span className="combat-picker-name">{token.name}</span>
                {token.hidden && <span className="combat-tag">ukryty</span>}
                <button
                  type="button"
                  className="small-button"
                  onClick={() => void addToCombat([token.id])}
                >
                  Dodaj
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {isGm && (
        <div className="scene-editor-row">
          <button
            type="button"
            className="small-button small-button--danger"
            onClick={() => {
              if (window.confirm('Zakończyć walkę? Kolejka inicjatywy zostanie skasowana.')) {
                void endCombat();
              }
            }}
          >
            Zakończ walkę
          </button>
        </div>
      )}
    </div>
  );
}
