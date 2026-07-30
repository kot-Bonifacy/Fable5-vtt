import { useMemo, useState } from 'react';
import type { CombatView, CombatantView } from '@vtt/shared';
import {
  CPRED_ACTIONS,
  CPRED_ACTION_HOLD,
  CPRED_ACTION_STABILIZE,
  COMBAT_INITIATIVE_MAX,
  COMBAT_INITIATIVE_MIN,
  ROLE_GM,
  formatMetres,
  woundStateFromHp,
} from '@vtt/shared';
import {
  combatErrorText,
  holdCombatAction,
  setCombatTerrain,
  spendCombatAction,
} from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { loadStabilizeCup, useRollStore } from '../stores/rollStore.js';

/**
 * The action buttons of the „Walka" tab (stage 14b).
 *
 * System-aware on purpose — it reads the CP RED catalogue directly, the same
 * way `AttackControls` and `DamageControls` do, so the core tracker
 * (`CombatPanel`, `CombatBar`) stays free of game rules and only paints the
 * budget the server sends it.
 *
 * What is *not* here: Atak and Przeładowanie have buttons of their own on the
 * character sheet and book their own cost, so offering them twice would let one
 * turn's Action be spent from two places.
 */

/**
 * Catalogued actions worth a button. Anything resolved elsewhere is out —
 * except the two that *are* resolved here: Ustabilizowanie opens the cup, and
 * Wstrzymanie Akcji opens the declaration form.
 */
const OWN_FORMS = new Set<string>([CPRED_ACTION_STABILIZE, CPRED_ACTION_HOLD]);
const BUTTONS = CPRED_ACTIONS.filter(
  (action) => action.cost !== 'free' && (!action.handledElsewhere || OWN_FORMS.has(action.id)),
);

/** Free actions, listed for reference — RAW does not track hands, so nor do we. */
const FREE_ACTIONS = CPRED_ACTIONS.filter((action) => action.cost === 'free');

/** „Ustabilizowanie" needs somebody to work on; these are the candidates. */
interface StabilizeTarget {
  tokenId: string;
  name: string;
  /** Only a wounded target is worth the Action. */
  wounded: boolean;
}

export function CombatActions({
  combat,
  combatant,
}: {
  combat: CombatView;
  combatant: CombatantView;
}) {
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const tokenMap = useTokenStore((s) => s.tokens);
  const characters = useCharacterStore((s) => s.characters);
  const registry = useCharacterStore((s) => s.registry);
  const cupBusy = useRollStore((s) => s.pending !== null);

  const [error, setError] = useState<string | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdTrigger, setHoldTrigger] = useState('');
  const [holdInitiative, setHoldInitiative] = useState('');
  const [stabilizeOpen, setStabilizeOpen] = useState(false);

  /** The sheet acting right now — needed for a roll, absent for a statist. */
  const actingCharacter = useMemo(() => {
    const token = tokenMap[combatant.tokenId];
    if (!token?.characterId) return null;
    return characters[token.characterId] ?? null;
  }, [tokenMap, characters, combatant.tokenId]);

  const targets = useMemo<StabilizeTarget[]>(
    () =>
      combat.combatants.map((row) => {
        const token = tokenMap[row.tokenId];
        const hp = token?.hp ?? null;
        return {
          tokenId: row.tokenId,
          name: row.name,
          wounded: hp !== null && woundStateFromHp(hp.current, hp.max) !== 'healthy',
        };
      }),
    [combat.combatants, tokenMap],
  );

  async function spend(actionId: string) {
    setError(null);
    const ack = await spendCombatAction(actionId, undefined, combatant.id);
    if (!ack.ok) setError(combatErrorText(ack.error));
  }

  async function declareHold() {
    setError(null);
    const trimmed = holdTrigger.trim();
    const parsed = Number.parseInt(holdInitiative.trim(), 10);
    const initiative = Number.isNaN(parsed)
      ? null
      : Math.min(Math.max(parsed, COMBAT_INITIATIVE_MIN), COMBAT_INITIATIVE_MAX);
    if (trimmed.length === 0 && initiative === null) {
      setError('Opisz wyzwalacz albo podaj wartość w kolejce inicjatywy.');
      return;
    }
    const ack = await holdCombatAction(
      { ...(trimmed ? { trigger: trimmed } : {}), initiative },
      combatant.id,
    );
    if (!ack.ok) {
      setError(combatErrorText(ack.error));
      return;
    }
    setHoldOpen(false);
    setHoldTrigger('');
    setHoldInitiative('');
  }

  function stabilize(target: StabilizeTarget) {
    setError(null);
    if (!actingCharacter) {
      setError('Ten uczestnik nie ma karty postaci — rzut wykonaj z karty medyka.');
      return;
    }
    // The Action is charged by the server when the dice actually fly, so an
    // abandoned cup costs nothing.
    loadStabilizeCup(
      { characterId: actingCharacter.id, characterName: actingCharacter.name },
      { tokenId: target.tokenId, name: target.name },
      actingCharacter.data,
      registry,
    );
    setStabilizeOpen(false);
  }

  async function toggleTerrain(hard: boolean) {
    setError(null);
    const ack = await setCombatTerrain(hard, combatant.id);
    if (!ack.ok) setError(combatErrorText(ack.error));
  }

  const budget = combatant.turn;
  const actionSpent = budget?.resources.find((r) => r.id === 'action')?.used === 1;
  const distance = budget?.distance;

  return (
    <div className="combat-actions">
      <p className="panel-section-title">Akcje — {combatant.name}</p>
      {distance && (
        <p className="combat-hint">
          Ruch: {formatMetres(Math.max(0, distance.max - distance.used))} z{' '}
          {formatMetres(distance.max)} pozostało
          {distance.note ? ` · ${distance.note}` : ''}
          {'. '}
          <button
            type="button"
            className={`small-button${distance.hard ? ' small-button--on' : ''}`}
            title="Pływanie, wspinaczka, gruz: każdy metr ścieżki kosztuje dwa metry budżetu (RAW)."
            onClick={() => void toggleTerrain(!distance.hard)}
          >
            {distance.hard ? 'Ruch utrudniony ×2 — wyłącz' : 'Ruch utrudniony ×2'}
          </button>
        </p>
      )}
      {combatant.held && (
        <p className="combat-hint combat-hint--held">
          Akcja wstrzymana:{' '}
          {combatant.held.initiative !== null
            ? `przy inicjatywie ${combatant.held.initiative}`
            : (combatant.held.trigger ?? 'wyzwalacz opisany')}
        </p>
      )}
      <div className="combat-action-grid">
        {BUTTONS.map((action) => {
          if (action.id === CPRED_ACTION_STABILIZE) {
            return (
              <button
                key={action.id}
                type="button"
                className="small-button"
                title={action.hint}
                disabled={cupBusy}
                onClick={() => setStabilizeOpen((open) => !open)}
              >
                {action.name}…
              </button>
            );
          }
          if (action.id === CPRED_ACTION_HOLD) {
            return (
              <button
                key={action.id}
                type="button"
                className="small-button"
                title={action.hint}
                onClick={() => setHoldOpen((open) => !open)}
              >
                {action.name}…
              </button>
            );
          }
          return (
            <button
              key={action.id}
              type="button"
              className="small-button"
              title={action.hint}
              // The GM is never blocked — their buttons stay live even when the
              // budget is gone, and the tracker reports the overspend.
              disabled={!isGm && action.cost === 'action' && actionSpent}
              onClick={() => void spend(action.id)}
            >
              {action.name}
            </button>
          );
        })}
      </div>

      {holdOpen && (
        <div className="combat-hold-form">
          <label>
            <span>Wyzwalacz</span>
            <input
              type="text"
              value={holdTrigger}
              placeholder="gdy ktoś wyjdzie zza rogu"
              onChange={(e) => setHoldTrigger(e.target.value)}
            />
          </label>
          <label>
            <span>albo inicjatywa</span>
            <input
              type="number"
              value={holdInitiative}
              placeholder="12"
              onChange={(e) => setHoldInitiative(e.target.value)}
            />
          </label>
          <div className="scene-editor-row">
            <button type="button" className="small-button" onClick={() => void declareHold()}>
              Wstrzymaj
            </button>
            <button type="button" className="small-button" onClick={() => setHoldOpen(false)}>
              Anuluj
            </button>
          </div>
          <p className="combat-hint">
            Deklaracja z wartością odpala się sama, gdy kolejka zejdzie do tej wartości. Opisany
            wyzwalacz odpala MG przyciskiem przy wierszu.
          </p>
        </div>
      )}

      {stabilizeOpen && (
        <ul className="combat-picker">
          {targets.map((target) => (
            <li key={target.tokenId} className="combat-picker-row">
              <span className="combat-picker-name">{target.name}</span>
              {!target.wounded && <span className="combat-tag">bez ran</span>}
              <button
                type="button"
                className="small-button"
                onClick={() => stabilize(target)}
                title="Ładuje kubek — PT wylicza serwer z progu ran celu"
              >
                Ustabilizuj
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="auth-error">{error}</p>}
      <p className="combat-hint">
        Za darmo, bez klikania:{' '}
        {FREE_ACTIONS.map((action) => action.name)
          .join(', ')
          .toLowerCase()}
        .
      </p>
    </div>
  );
}
