import { useMemo, useState } from 'react';
import type { CombatView, CombatantView } from '@vtt/shared';
import {
  CPRED_ACTIONS,
  CPRED_ACTION_ESCAPE_GRAPPLE,
  CPRED_ACTION_GRAPPLE,
  CPRED_ACTION_HOLD,
  CPRED_ACTION_STABILIZE,
  CPRED_CHOKE_ROUNDS_TO_UNCONSCIOUS,
  CPRED_FIRE_INTENSITIES,
  COMBAT_INITIATIVE_MAX,
  COMBAT_INITIATIVE_MIN,
  ROLE_GM,
  formatMetres,
  woundStateFromHp,
} from '@vtt/shared';
import {
  combatErrorText,
  holdCombatAction,
  sendGrappleAction,
  setCombatTerrain,
  setTokenEffect,
  spendCombatAction,
} from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { loadStabilizeCup, useRollStore } from '../stores/rollStore.js';
import { AttackLauncher } from './AttackLauncher.js';

/**
 * The action buttons of the „Walka" tab (stage 14b).
 *
 * System-aware on purpose — it reads the CP RED catalogue directly, the same
 * way `AttackControls` and `DamageControls` do, so the core tracker
 * (`CombatPanel`, `CombatBar`) stays free of game rules and only paints the
 * budget the server sends it.
 *
 * What is *not* here: Przeładowanie has a button of its own on the character
 * sheet and books its own cost, so offering it twice would let one turn's Action
 * be spent from two places.
 *
 * Atak used to be in that sentence and stopped being (stage 16b). The row below
 * does not spend anything — it *arms the map*, and the Action is charged by the
 * server when the dice actually fly, so an abandoned cup costs nothing. That is
 * the same bargain Ustabilizowanie and Pochwycenie already make here.
 */

/**
 * Catalogued actions worth a button. Anything resolved elsewhere is out —
 * except the ones that *are* resolved here: Ustabilizowanie opens the cup,
 * Wstrzymanie Akcji opens the declaration form, and the grapple actions get a
 * row of their own below (they need a target, or an existing Hold).
 */
const OWN_FORMS = new Set<string>([CPRED_ACTION_STABILIZE, CPRED_ACTION_HOLD]);
const BUTTONS = CPRED_ACTIONS.filter(
  (action) =>
    action.cost !== 'free' &&
    action.requiresGrapple === undefined &&
    action.id !== CPRED_ACTION_GRAPPLE &&
    action.id !== CPRED_ACTION_ESCAPE_GRAPPLE &&
    (!action.handledElsewhere || OWN_FORMS.has(action.id)),
);

/** Free actions, listed for reference — RAW does not track hands, so nor do we. */
const FREE_ACTIONS = CPRED_ACTIONS.filter((action) => action.cost === 'free');

const GRAPPLE_INTENT_LABELS: Record<'hold' | 'item' | 'escape', string> = {
  hold: 'Pochwycenie',
  item: 'Pochwycenie przedmiotu',
  escape: 'Wyrwanie się',
};

/**
 * Everything a Hold offers this participant (stage 14d).
 *
 * Which half of the row shows is decided by the relation the server sent, not
 * by a checkbox: an Attacker gets Duszenie / Rzut / Ludzka tarcza / Uwolnienie,
 * a Held one gets „Wyrwij się", and anybody free gets „Pochwycenie…". Somebody
 * standing next to a struggling pair gets both — RAW lets a third party pull
 * them apart.
 */
function GrappleRow({
  combat,
  combatant,
  cupBusy,
  open,
  onToggle,
  onAttempt,
  onHoldAction,
}: {
  combat: CombatView;
  combatant: CombatantView;
  cupBusy: boolean;
  open: boolean;
  onToggle: () => void;
  onAttempt: (tokenId: string, name: string, intent: 'hold' | 'item' | 'escape') => void;
  onHoldAction: (kind: 'choke' | 'throw' | 'human-shield' | 'release') => void;
}) {
  const grapple = combatant.grapple;
  const holding = grapple?.role === 'attacker';
  const held = grapple?.role === 'defender';

  /** Everybody else in the fight — targets for a grab or for a rescue. */
  const others = combat.combatants.filter((row) => row.id !== combatant.id);

  return (
    <div className="combat-grapple">
      <p className="panel-section-title">Zwarcie</p>
      {grapple && (
        <p className="combat-hint combat-hint--held">
          {holding ? `Trzymasz: ${grapple.otherName}` : `Trzyma cię: ${grapple.otherName}`}
          {grapple.shield ? ' · Ludzka tarcza' : ''}
          {grapple.chokeStreak
            ? ` · Duszenie ${grapple.chokeStreak}/${CPRED_CHOKE_ROUNDS_TO_UNCONSCIOUS} rund`
            : ''}
          {' · obie strony −2 do Akcji'}
        </p>
      )}
      <div className="combat-action-grid">
        {holding && (
          <>
            <button
              type="button"
              className="small-button"
              title="Obrażenia równe twojej BC, bez pancerza. Trzy Rundy pod rząd = Nieprzytomny."
              onClick={() => onHoldAction('choke')}
            >
              Duszenie
            </button>
            <button
              type="button"
              className="small-button"
              title="Obrażenia równe twojej BC; kończy Trzymanie, a cel jest Powalony."
              onClick={() => onHoldAction('throw')}
            >
              Rzut
            </button>
            <button
              type="button"
              className="small-button"
              title="Zasłaniasz się Trzymanym przed ostrzałem (nie przed bronią białą ani strzałem w głowę)."
              disabled={grapple?.shield === true}
              onClick={() => onHoldAction('human-shield')}
            >
              Ludzka tarcza
            </button>
            <button
              type="button"
              className="small-button"
              title="Puszczasz Trzymanego — nie kosztuje Akcji."
              onClick={() => onHoldAction('release')}
            >
              Uwolnij (za darmo)
            </button>
          </>
        )}
        {!holding && (
          <button
            type="button"
            className="small-button"
            title={
              held
                ? 'Test sporny przeciw Trzymającemu — sukces kończy Trzymanie'
                : 'Test sporny ZW + Bijatyka. Zasięg 2 m, mierzy serwer.'
            }
            disabled={cupBusy}
            onClick={onToggle}
          >
            {held ? 'Wyrwij się…' : 'Pochwycenie…'}
          </button>
        )}
      </div>

      {open && !holding && (
        <ul className="combat-picker">
          {others.map((row) => {
            // Wrestling free is a test against whoever is *doing* the holding,
            // so the only sensible targets for it are Attackers.
            const isAttacker = row.grapple?.role === 'attacker';
            return (
              <li key={row.id} className="combat-picker-row">
                <span className="combat-picker-name">{row.name}</span>
                {isAttacker && <span className="combat-tag">trzyma {row.grapple!.otherName}</span>}
                {isAttacker && (
                  <button
                    type="button"
                    className="small-button"
                    title="Akcja + wygrany test sporny kończy Trzymanie dla wszystkich"
                    onClick={() => onAttempt(row.tokenId, row.name, 'escape')}
                  >
                    Wyrwij
                  </button>
                )}
                {!held && (
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => onAttempt(row.tokenId, row.name, 'hold')}
                  >
                    Pochwyć
                  </button>
                )}
                {!held && (
                  <button
                    type="button"
                    className="small-button"
                    title="Zamiast Trzymania — wyrywasz przedmiot z ręki celu (efekt opisowy)"
                    onClick={() => onAttempt(row.tokenId, row.name, 'item')}
                  >
                    Przedmiot
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** „Ustabilizowanie" needs somebody to work on; these are the candidates. */
interface StabilizeTarget {
  tokenId: string;
  name: string;
  /** Only a wounded target is worth the Action. */
  wounded: boolean;
}

/**
 * The GM's switchboard for what a turn costs by itself (stage 14e).
 *
 * A GM control because the *source* is never in the model: the VTT does not
 * know the barrel exploded or that this one is under water. It knows what a
 * status costs once it is there — the same division of labour „ruch utrudniony"
 * settled in 14c. Here rather than only in the token's context menu because a
 * fight is where these get set, and because the menu is the one surface that
 * cannot be reached without a mouse.
 */
function PeriodicEffects({ combat }: { combat: CombatView }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokens = useTokenStore((s) => s.tokens);

  const chosen = target ?? combat.activeCombatantId ?? combat.combatants[0]?.id ?? null;
  const row = combat.combatants.find((entry) => entry.id === chosen) ?? null;
  const statuses = row ? (tokens[row.tokenId]?.statuses ?? []) : [];

  async function set(statusId: string, active: boolean, damage?: number | null) {
    if (!row) return;
    setError(null);
    const ack = await setTokenEffect(row.tokenId, statusId, active, damage);
    if (!ack.ok) setError(combatErrorText(ack.error));
  }

  return (
    <div className="combat-effects">
      <p className="panel-section-title">
        Efekty okresowe
        <button
          type="button"
          className="small-button"
          onClick={() => setOpen((value) => !value)}
          title="Podpalenie, trucizna i tonięcie — obrażenia nalicza serwer na przejściu tury"
        >
          {open ? 'Zwiń' : 'Rozwiń'}
        </button>
      </p>
      {open && (
        <>
          <label className="combat-effect-target">
            <span>Cel</span>
            <select value={chosen ?? ''} onChange={(e) => setTarget(e.target.value)}>
              {combat.combatants.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <div className="combat-effect-row">
            <span className="combat-effect-name">
              Podpalony{statuses.includes(ON_FIRE) ? ' — pali się' : ''}
            </span>
            {CPRED_FIRE_INTENSITIES.map((rung) => (
              <button
                key={rung.damage}
                type="button"
                className="small-button"
                title={`${rung.damage} obrażeń na koniec każdej tury, bez pancerza`}
                onClick={() => void set(ON_FIRE, true, rung.damage)}
              >
                {rung.label} ({rung.damage})
              </button>
            ))}
            <button
              type="button"
              className="small-button"
              disabled={!statuses.includes(ON_FIRE)}
              onClick={() => void set(ON_FIRE, false)}
            >
              Ugaś
            </button>
          </div>
          <div className="combat-effect-row">
            <span className="combat-effect-name">
              Zatruty{statuses.includes(POISONED) ? ' — trucizna działa' : ''}
            </span>
            {[2, 4, 6].map((damage) => (
              <button
                key={damage}
                type="button"
                className="small-button"
                title={`${damage} obrażeń na koniec każdej tury, bez pancerza`}
                onClick={() => void set(POISONED, true, damage)}
              >
                {damage}
              </button>
            ))}
            <button
              type="button"
              className="small-button"
              disabled={!statuses.includes(POISONED)}
              onClick={() => void set(POISONED, false)}
            >
              Odtruj
            </button>
          </div>
          <div className="combat-effect-row">
            <span className="combat-effect-name">
              Tonięcie{statuses.includes(DROWNING) ? ' — tonie' : ''}
            </span>
            <button
              type="button"
              className="small-button"
              title="Obrażenia równe BC celu, na początku każdej jego tury (wartości nie da się ustawić)"
              onClick={() => void set(DROWNING, !statuses.includes(DROWNING))}
            >
              {statuses.includes(DROWNING) ? 'Wyciągnij' : 'Topi się (BC)'}
            </button>
          </div>
          {error && <p className="auth-error">{error}</p>}
        </>
      )}
    </div>
  );
}

const ON_FIRE = 'on-fire';
const POISONED = 'poisoned';
const DROWNING = 'drowning';

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
  const [grappleOpen, setGrappleOpen] = useState(false);
  const [attackOpen, setAttackOpen] = useState(false);

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

  /**
   * Loads a grapple test into the cup (stage 14d). The Action is charged by the
   * server when the dice actually fly, so an abandoned cup costs nothing — the
   * same bargain Ustabilizowanie makes.
   */
  function grappleAt(
    targetTokenId: string,
    targetName: string,
    intent: 'hold' | 'item' | 'escape',
  ) {
    setError(null);
    if (!actingCharacter) {
      setError('Ten uczestnik nie ma karty postaci — Pochwycenie rzuca się z karty.');
      return;
    }
    useRollStore.getState().loadGrappleCup({
      characterId: actingCharacter.id,
      characterName: actingCharacter.name,
      title: `${GRAPPLE_INTENT_LABELS[intent]} → ${targetName}`,
      modifierTotal: 0,
      attempt: { targetTokenId, attackerTokenId: combatant.tokenId, intent },
    });
    setGrappleOpen(false);
  }

  /** Duszenie, Rzut, Ludzka tarcza and letting go — no roll, just an Action. */
  async function holdAction(kind: 'choke' | 'throw' | 'human-shield' | 'release') {
    setError(null);
    const ack = await sendGrappleAction(kind, combatant.id);
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

      {/* Stage 16b: the second door into an attack. „Atak" used to live only on
          the weapon row of an open sheet, so a statist could not fire at all and
          the GM had to open somebody's sheet to shoot with anybody. */}
      <div className="combat-grapple">
        <p className="panel-section-title">
          Atak
          <button
            type="button"
            className="small-button"
            title="Wybierz broń, potem kliknij cel na mapie"
            onClick={() => setAttackOpen((open) => !open)}
          >
            {attackOpen ? 'Zwiń' : 'Broń…'}
          </button>
        </p>
        {attackOpen && (
          <AttackLauncher
            token={tokenMap[combatant.tokenId]}
            onArmed={() => setAttackOpen(false)}
          />
        )}
      </div>

      <GrappleRow
        combat={combat}
        combatant={combatant}
        cupBusy={cupBusy}
        open={grappleOpen}
        onToggle={() => setGrappleOpen((open) => !open)}
        onAttempt={grappleAt}
        onHoldAction={(kind) => void holdAction(kind)}
      />

      {isGm && <PeriodicEffects combat={combat} />}

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
