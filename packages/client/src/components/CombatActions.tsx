import { useState } from 'react';
import type { CombatView, CombatantView } from '@vtt/shared';
import {
  CPRED_ACTIONS,
  CPRED_ACTION_ESCAPE_GRAPPLE,
  CPRED_ACTION_GRAPPLE,
  CPRED_ACTION_HOLD,
  CPRED_ACTION_STABILIZE,
  CPRED_FIRE_INTENSITIES,
  ROLE_GM,
  cpredActionRefusal,
  cpredTurnRefusalInput,
  formatMetres,
} from '@vtt/shared';
import { combatErrorText, setCombatTerrain, setTokenEffect, spendCombatAction } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { useRollStore } from '../stores/rollStore.js';
import { AttackLauncher } from './AttackLauncher.js';
import { GrapplePanel, HoldActionForm, StabilizePicker } from './CombatForms.js';

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
 *
 * Since stage 16f the three forms below are shared components rather than local
 * markup: the map's action bar opens the same Wstrzymanie, Ustabilizowanie and
 * Zwarcie, and a second copy of any of them would be a second set of rules.
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
  // Wiersz bez figury to Czarny LOD z etapu 26c — nie ma czego oznaczać.
  const statuses = row?.tokenId ? (tokens[row.tokenId]?.statuses ?? []) : [];

  async function set(statusId: string, active: boolean, damage?: number | null) {
    if (!row?.tokenId) return;
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
  const cupBusy = useRollStore((s) => s.pending !== null);

  const [error, setError] = useState<string | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [stabilizeOpen, setStabilizeOpen] = useState(false);
  const [attackOpen, setAttackOpen] = useState(false);

  async function spend(actionId: string) {
    setError(null);
    const ack = await spendCombatAction(actionId, undefined, combatant.id);
    if (!ack.ok) setError(combatErrorText(ack.error));
  }

  async function toggleTerrain(hard: boolean) {
    setError(null);
    const ack = await setCombatTerrain(hard, combatant.id);
    if (!ack.ok) setError(combatErrorText(ack.error));
  }

  const budget = combatant.turn;
  const distance = budget?.distance;
  // Jedno źródło odmowy dla obu drzwi (10.09). Do 12.09 zakładka pytała tylko
  // „czy Akcja wydana", a pasek na mapie szedł przez `cpredActionRefusal` —
  // więc Bieg bywał tu klikalny, a tam wyszarzony, i odwrotnie: formularze
  // zostawały żywe po zużytej Akcji. Serwer odmawiał w obu przypadkach, ale
  // obietnica interfejsu się rozjeżdżała.
  const refusalInput = {
    statuses: combatant.tokenId ? (tokenMap[combatant.tokenId]?.statuses ?? []) : [],
    turn: cpredTurnRefusalInput(budget),
    isGm,
  };

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
          // Formularze też płacą Akcję — do 12.09 były wyjęte z warunku
          // „zużyta Akcja" jako otwierające okno, więc zostawały klikalne,
          // a deklaracja wracała z serwera odmową. Pasek na mapie gasił je
          // od 16f; teraz gasi je to samo zdanie.
          const refusal = cpredActionRefusal(action.id, refusalInput);
          if (action.id === CPRED_ACTION_STABILIZE) {
            return (
              <button
                key={action.id}
                type="button"
                className="small-button"
                title={refusal ?? action.hint}
                disabled={cupBusy || refusal !== null}
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
                title={refusal ?? action.hint}
                disabled={refusal !== null}
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
              title={refusal ?? action.hint}
              // The GM is never blocked — their buttons stay live even when the
              // budget is gone, and the tracker reports the overspend; that rule
              // lives inside `cpredActionRefusal`, not here.
              disabled={refusal !== null}
              onClick={() => void spend(action.id)}
            >
              {action.name}
            </button>
          );
        })}
      </div>

      {holdOpen && <HoldActionForm combatantId={combatant.id} onDone={() => setHoldOpen(false)} />}

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
        {attackOpen && combatant.tokenId && (
          <AttackLauncher
            token={tokenMap[combatant.tokenId]}
            onArmed={() => setAttackOpen(false)}
          />
        )}
      </div>

      <GrapplePanel combat={combat} combatant={combatant} cupBusy={cupBusy} />

      {isGm && <PeriodicEffects combat={combat} />}

      {stabilizeOpen && (
        <StabilizePicker
          combat={combat}
          combatant={combatant}
          onDone={() => setStabilizeOpen(false)}
        />
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
