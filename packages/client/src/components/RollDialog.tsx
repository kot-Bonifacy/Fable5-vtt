import { useEffect, useState } from 'react';
import type { CpredHitLocation, CpredRollRequest } from '@vtt/shared';
import {
  CPRED_AIMED_SHOT_PENALTY,
  CPRED_HIT_LOCATIONS,
  CPRED_HIT_LOCATION_LABELS,
  CPRED_SITUATIONAL_MODIFIER_LIMIT,
  cpredInjuryConditionalModifiers,
  formatRollNotation,
  planCpredRoll,
} from '@vtt/shared';
import { useCharacterStore } from '../stores/characterStore.js';
import { useRollStore, type PendingRoll, type RollTarget } from '../stores/rollStore.js';

/**
 * The pre-roll dialog: situational modifier, Luck to spend and who sees the
 * result. Confirming loads the dice cup — the throw happens when the cup is
 * shaken and released (the gesture feeds the server's RNG).
 */
export function RollDialog() {
  const target = useRollStore((s) => s.target);
  if (!target) return null;
  return <RollDialogBody target={target} />;
}

function RollDialogBody({ target }: { target: RollTarget }) {
  const character = useCharacterStore((s) => s.characters[target.characterId]);
  const registry = useCharacterStore((s) => s.registry);
  const closeDialog = useRollStore((s) => s.closeDialog);
  const lastModifier = useRollStore((s) => s.lastModifier);
  const lastVisibility = useRollStore((s) => s.lastVisibility);
  const lastLocation = useRollStore((s) => s.lastLocation);
  const isDamage = target.kind === 'damage';

  const [modifier, setModifier] = useState(isDamage ? 0 : lastModifier);
  const [luckSpent, setLuckSpent] = useState(0);
  const [visibility, setVisibility] = useState<'public' | 'gm'>(
    isDamage ? 'public' : lastVisibility,
  );
  const [location, setLocation] = useState<CpredHitLocation>(lastLocation);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDialog();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeDialog]);

  if (!character) return null;

  const request: CpredRollRequest = {
    kind: target.kind,
    ...(target.skillId ? { skillId: target.skillId } : {}),
    ...(target.statId ? { statId: target.statId } : {}),
    ...(target.weaponRowId ? { weaponRowId: target.weaponRowId } : {}),
    ...(isDamage ? { location } : {}),
    modifier,
    luckSpent,
  };
  // Same pure function the server uses — the preview can never disagree.
  const planned = planCpredRoll(character.data, registry, request);
  const luckMax = character.data.luckCurrent;
  const conditional = cpredInjuryConditionalModifiers(character.data.criticalInjuries);

  function confirm() {
    if (!planned.ok) return;
    if (isDamage) useRollStore.getState().rememberLocation(location);
    else useRollStore.getState().remember(modifier, visibility);
    const pending: PendingRoll = {
      ...target,
      request,
      visibility,
      title: planned.plan.title,
      modifierTotal: planned.plan.modifierTotal,
    };
    useRollStore.getState().loadCup(pending);
  }

  return (
    <div className="dialog-backdrop" onClick={closeDialog}>
      <div className="dialog roll-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="panel-section-title">
          {target.characterName}: {planned.ok ? planned.plan.title : 'Rzut'}
        </h3>

        {planned.ok && (
          <ul className="roll-preview">
            {planned.plan.breakdown.map((entry) => (
              <li key={`${entry.kind}-${entry.label}`} className={`roll-preview--${entry.kind}`}>
                <span>{entry.label}</span>
                <span>
                  {entry.value >= 0 ? '+' : '−'}
                  {Math.abs(entry.value)}
                </span>
              </li>
            ))}
            <li className="roll-preview-total">
              <span>{isDamage ? 'Rzut na obrażenia' : '1k10 +'}</span>
              <span>
                {isDamage
                  ? formatRollNotation(planned.plan.formula).replace('d', 'k')
                  : planned.plan.modifierTotal}
              </span>
            </li>
          </ul>
        )}

        {isDamage && (
          <fieldset className="roll-visibility">
            <legend className="auth-label">Trafienie</legend>
            {CPRED_HIT_LOCATIONS.map((id) => (
              <label key={id}>
                <input
                  type="radio"
                  name="roll-location"
                  checked={location === id}
                  onChange={() => setLocation(id)}
                />{' '}
                {CPRED_HIT_LOCATION_LABELS[id]}
              </label>
            ))}
            <p className="roll-dialog-hint">
              {location === 'head'
                ? `Strzał celowany: ${CPRED_AIMED_SHOT_PENALTY} do ataku, a obrażenia po pancerzu liczą się podwójnie.`
                : 'RAW: atak bez celowania zawsze trafia w korpus.'}
            </p>
          </fieldset>
        )}

        {/*
          Kary warunkowe ran krytycznych (29.08). Nic ich nie odejmuje samo:
          „−4 do wszystkich Akcji wykonywanych tą ręką" wymaga wiedzy, której
          VTT nie ma, więc rana podaje liczbę i warunek, a decyzję podejmuje
          rzucający — jednym kliknięciem, zamiast przepisywania z prozy.
        */}
        {!isDamage && conditional.length > 0 && (
          <div className="roll-conditional">
            <span className="auth-label">Kary warunkowe — kliknij, jeśli dotyczą</span>
            {conditional.map((penalty) => (
              <button
                key={`${penalty.label}-${penalty.condition}`}
                type="button"
                className={`small-button${modifier === penalty.value ? ' small-button--on' : ''}`}
                title={`${penalty.label}: ${penalty.condition}`}
                onClick={() =>
                  setModifier((current) => (current === penalty.value ? 0 : penalty.value))
                }
              >
                {penalty.label} {penalty.value}
              </button>
            ))}
          </div>
        )}

        <label className="auth-label" htmlFor="roll-modifier">
          {isDamage ? 'Modyfikator obrażeń' : 'Modyfikator sytuacyjny'}
        </label>
        <input
          id="roll-modifier"
          type="number"
          min={-CPRED_SITUATIONAL_MODIFIER_LIMIT}
          max={CPRED_SITUATIONAL_MODIFIER_LIMIT}
          value={modifier}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (Number.isFinite(value)) {
              setModifier(
                Math.max(
                  -CPRED_SITUATIONAL_MODIFIER_LIMIT,
                  Math.min(CPRED_SITUATIONAL_MODIFIER_LIMIT, Math.round(value)),
                ),
              );
            }
          }}
        />

        {/* Luck buys successes on Checks, never damage (RAW). */}
        {!isDamage && (
          <>
            <label className="auth-label" htmlFor="roll-luck">
              Punkty Szczęścia (pula: {luckMax})
            </label>
            <input
              id="roll-luck"
              type="number"
              min={0}
              max={luckMax}
              value={luckSpent}
              disabled={luckMax === 0}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value)) {
                  setLuckSpent(Math.max(0, Math.min(luckMax, Math.round(value))));
                }
              }}
              title="Deklarowane przed rzutem — każdy punkt to +1 do wyniku"
            />

            <fieldset className="roll-visibility">
              <legend className="auth-label">Widoczność</legend>
              <label>
                <input
                  type="radio"
                  name="roll-visibility"
                  checked={visibility === 'public'}
                  onChange={() => setVisibility('public')}
                />{' '}
                Publiczny
              </label>
              <label>
                <input
                  type="radio"
                  name="roll-visibility"
                  checked={visibility === 'gm'}
                  onChange={() => setVisibility('gm')}
                />{' '}
                Tylko dla MG
              </label>
            </fieldset>
          </>
        )}

        {!planned.ok && <p className="auth-error">Nie można wykonać tego rzutu.</p>}

        <div className="scene-editor-row">
          <button className="primary-button" type="button" onClick={confirm} disabled={!planned.ok}>
            Weź kubek
          </button>
          <button type="button" className="small-button" onClick={closeDialog}>
            Anuluj
          </button>
        </div>
        <p className="roll-dialog-hint">
          Potrząśnij kubkiem nad stołem i puść, żeby rzucić. Shift + klik w umiejętność pomija to
          okno.
        </p>
      </div>
    </div>
  );
}
