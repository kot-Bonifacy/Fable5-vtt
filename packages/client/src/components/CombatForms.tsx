import { useMemo, useState } from 'react';
import type { CombatView, CombatantView } from '@vtt/shared';
import {
  COMBAT_INITIATIVE_MAX,
  COMBAT_INITIATIVE_MIN,
  CPRED_CHOKE_ROUNDS_TO_UNCONSCIOUS,
  observedWoundState,
} from '@vtt/shared';
import { combatErrorText, holdCombatAction, sendGrappleAction } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { loadStabilizeCup, useRollStore } from '../stores/rollStore.js';

/**
 * The three actions that need words or a target before anything can be booked
 * (stages 14b and 14d), as components with two homes.
 *
 * They were born inside the „Walka" tab and stayed there until stage 16f gave
 * the map its own action bar — at which point the bar needed the same three
 * forms. Copying them would have been the easy move and the wrong one: „what
 * counts as a valid Hold declaration" would then have had two answers, and the
 * one nobody was looking at would have rotted. So the tab and the bar render
 * the *same* components, and each of them owns its own error line, because an
 * error belongs next to the form that produced it.
 */

/** The sheet acting for a participant — needed for any roll, absent for a statist. */
/**
 * Uczestnik z figurą na mapie. Od etapu 26c kolejka inicjatywy może nieść też
 * Czarnego LOD-a, który żadnego ciała nie ma — a wszystkie formularze poniżej
 * mówią o ciałach (Ustabilizowanie, Pochwycenie, Wstrzymanie Akcji).
 */
function hasFigureRow(row: CombatantView): row is CombatantView & { tokenId: string } {
  return typeof row.tokenId === 'string';
}

function useActingCharacter(combatant: CombatantView) {
  const tokens = useTokenStore((s) => s.tokens);
  const characters = useCharacterStore((s) => s.characters);
  return useMemo(() => {
    const token = combatant.tokenId ? tokens[combatant.tokenId] : undefined;
    if (!token?.characterId) return null;
    return characters[token.characterId] ?? null;
  }, [tokens, characters, combatant.tokenId]);
}

/**
 * „Wstrzymanie Akcji" (s. 168): the Action is reserved rather than spent, and
 * what will spend it is either a sentence the GM watches for or a value in the
 * initiative queue. One of the two is required — a declaration with neither is
 * a turn quietly thrown away.
 */
export function HoldActionForm({
  combatantId,
  onDone,
}: {
  combatantId: string;
  /** Called once the declaration is accepted, or when the form is dismissed. */
  onDone: () => void;
}) {
  const [trigger, setTrigger] = useState('');
  const [initiative, setInitiative] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function declare() {
    setError(null);
    const trimmed = trigger.trim();
    const parsed = Number.parseInt(initiative.trim(), 10);
    const value = Number.isNaN(parsed)
      ? null
      : Math.min(Math.max(parsed, COMBAT_INITIATIVE_MIN), COMBAT_INITIATIVE_MAX);
    if (trimmed.length === 0 && value === null) {
      setError('Opisz wyzwalacz albo podaj wartość w kolejce inicjatywy.');
      return;
    }
    const ack = await holdCombatAction(
      { ...(trimmed ? { trigger: trimmed } : {}), initiative: value },
      combatantId,
    );
    if (!ack.ok) {
      setError(combatErrorText(ack.error));
      return;
    }
    onDone();
  }

  return (
    <div className="combat-hold-form">
      <label>
        <span>Wyzwalacz</span>
        <input
          type="text"
          value={trigger}
          placeholder="gdy ktoś wyjdzie zza rogu"
          onChange={(e) => setTrigger(e.target.value)}
        />
      </label>
      <label>
        <span>albo inicjatywa</span>
        <input
          type="number"
          value={initiative}
          placeholder="12"
          onChange={(e) => setInitiative(e.target.value)}
        />
      </label>
      <div className="scene-editor-row">
        <button type="button" className="small-button" onClick={() => void declare()}>
          Wstrzymaj
        </button>
        <button type="button" className="small-button" onClick={onDone}>
          Anuluj
        </button>
      </div>
      {error && <p className="auth-error">{error}</p>}
      <p className="combat-hint">
        Deklaracja z wartością odpala się sama, gdy kolejka zejdzie do tej wartości. Opisany
        wyzwalacz odpala MG przyciskiem przy wierszu.
      </p>
    </div>
  );
}

/**
 * „Ustabilizowanie": whom to work on. The Action is charged by the server when
 * the dice actually fly, so an abandoned cup costs nothing — the same bargain
 * an aimed weapon makes.
 */
export function StabilizePicker({
  combat,
  combatant,
  onDone,
}: {
  combat: CombatView;
  combatant: CombatantView;
  onDone: () => void;
}) {
  const tokens = useTokenStore((s) => s.tokens);
  const registry = useCharacterStore((s) => s.registry);
  const acting = useActingCharacter(combatant);
  const [error, setError] = useState<string | null>(null);

  const targets = useMemo(
    () =>
      // Uczestnik bez figury (Czarny LOD z 26c) nie jest celem żadnej z tych
      // Akcji — Ustabilizowanie, Pochwycenie i reszta dotyczą ciał.
      combat.combatants.filter(hasFigureRow).map((row) => {
        const token = tokens[row.tokenId];
        return {
          tokenId: row.tokenId,
          name: row.name,
          // Trzy stany, nie dwa: cudze PW nie opuszczają serwera, więc gracz
          // patrzy na tę listę bez liczb i musi dostać „nie wiadomo" zamiast
          // „bez ran" — inaczej lista, która istnieje po to, żeby wybrać
          // konającego, ogłasza, że nikt nie jest ranny.
          wounds: observedWoundState({ hp: token?.hp, statuses: token?.statuses }),
        };
      }),
    [combat.combatants, tokens],
  );

  function stabilize(target: { tokenId: string; name: string }) {
    if (!acting) {
      setError('Ten uczestnik nie ma karty postaci — rzut wykonaj z karty medyka.');
      return;
    }
    loadStabilizeCup(
      { characterId: acting.id, characterName: acting.name },
      target,
      acting.data,
      registry,
    );
    onDone();
  }

  return (
    <>
      <ul className="combat-picker">
        {targets.map((target) => (
          <li key={target.tokenId} className="combat-picker-row">
            <span className="combat-picker-name">{target.name}</span>
            {target.wounds === 'healthy' && <span className="combat-tag">bez ran</span>}
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
      {error && <p className="auth-error">{error}</p>}
    </>
  );
}

const GRAPPLE_INTENT_LABELS: Record<'hold' | 'item' | 'escape', string> = {
  hold: 'Pochwycenie',
  item: 'Pochwycenie przedmiotu',
  escape: 'Wyrwanie się',
};

/**
 * Everything a Hold offers this participant (stage 14d).
 *
 * Which half of the panel shows is decided by the relation the server sent, not
 * by a checkbox: an Attacker gets Duszenie / Rzut / Ludzka tarcza / Uwolnienie,
 * a Held one gets „Wyrwij się", and anybody free gets „Pochwycenie…". Somebody
 * standing next to a struggling pair gets both — RAW lets a third party pull
 * them apart.
 */
export function GrapplePanel({
  combat,
  combatant,
  cupBusy,
  /** The bar opens it already unfolded; the „Walka" tab starts it closed. */
  startOpen = false,
  onDone,
}: {
  combat: CombatView;
  combatant: CombatantView;
  cupBusy: boolean;
  startOpen?: boolean;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const [error, setError] = useState<string | null>(null);
  const acting = useActingCharacter(combatant);

  const grapple = combatant.grapple;
  const holding = grapple?.role === 'attacker';
  const held = grapple?.role === 'defender';
  /** Everybody else in the fight — targets for a grab or for a rescue. */
  const others = combat.combatants.filter((row) => row.id !== combatant.id).filter(hasFigureRow);

  /** Duszenie, Rzut, Ludzka tarcza and letting go — no roll, just an Action. */
  async function holdAction(kind: 'choke' | 'throw' | 'human-shield' | 'release') {
    setError(null);
    const ack = await sendGrappleAction(kind, combatant.id);
    if (!ack.ok) {
      setError(combatErrorText(ack.error));
      return;
    }
    onDone?.();
  }

  /** Loads an opposed test into the cup; the server charges the Action later. */
  function attempt(targetTokenId: string, targetName: string, intent: 'hold' | 'item' | 'escape') {
    setError(null);
    if (!acting) {
      setError('Ten uczestnik nie ma karty postaci — Pochwycenie rzuca się z karty.');
      return;
    }
    useRollStore.getState().loadGrappleCup({
      characterId: acting.id,
      characterName: acting.name,
      title: `${GRAPPLE_INTENT_LABELS[intent]} → ${targetName}`,
      modifierTotal: 0,
      attempt: { targetTokenId, attackerTokenId: combatant.tokenId ?? '', intent },
    });
    setOpen(false);
    onDone?.();
  }

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
              onClick={() => void holdAction('choke')}
            >
              Duszenie
            </button>
            <button
              type="button"
              className="small-button"
              title="Obrażenia równe twojej BC; kończy Trzymanie, a cel jest Powalony."
              onClick={() => void holdAction('throw')}
            >
              Rzut
            </button>
            <button
              type="button"
              className="small-button"
              title="Zasłaniasz się Trzymanym przed ostrzałem (nie przed bronią białą ani strzałem w głowę)."
              disabled={grapple?.shield === true}
              onClick={() => void holdAction('human-shield')}
            >
              Ludzka tarcza
            </button>
            <button
              type="button"
              className="small-button"
              title="Puszczasz Trzymanego — nie kosztuje Akcji."
              onClick={() => void holdAction('release')}
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
            onClick={() => setOpen((value) => !value)}
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
                    onClick={() => attempt(row.tokenId, row.name, 'escape')}
                  >
                    Wyrwij
                  </button>
                )}
                {!held && (
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => attempt(row.tokenId, row.name, 'hold')}
                  >
                    Pochwyć
                  </button>
                )}
                {!held && (
                  <button
                    type="button"
                    className="small-button"
                    title="Zamiast Trzymania — wyrywasz przedmiot z ręki celu (efekt opisowy)"
                    onClick={() => attempt(row.tokenId, row.name, 'item')}
                  >
                    Przedmiot
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
