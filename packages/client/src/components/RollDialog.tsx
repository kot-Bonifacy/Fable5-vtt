import { useEffect, useState } from 'react';
import type { CpredRollRequest } from '@vtt/shared';
import { CPRED_SITUATIONAL_MODIFIER_LIMIT, planCpredCheck } from '@vtt/shared';
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

  const [modifier, setModifier] = useState(lastModifier);
  const [luckSpent, setLuckSpent] = useState(0);
  const [visibility, setVisibility] = useState<'public' | 'gm'>(lastVisibility);

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
    modifier,
    luckSpent,
  };
  // Same pure function the server uses — the preview can never disagree.
  const planned = planCpredCheck(character.data, registry, request);
  const luckMax = character.data.luckCurrent;

  function confirm() {
    if (!planned.ok) return;
    useRollStore.getState().remember(modifier, visibility);
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
              <span>1k10 +</span>
              <span>{planned.plan.modifierTotal}</span>
            </li>
          </ul>
        )}

        <label className="auth-label" htmlFor="roll-modifier">
          Modyfikator sytuacyjny
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

        {!planned.ok && <p className="auth-error">Nie można wykonać tego rzutu.</p>}

        <div className="scene-editor-row">
          <button type="button" onClick={confirm} disabled={!planned.ok}>
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
