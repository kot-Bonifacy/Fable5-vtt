import { useEffect, useMemo, useState } from 'react';
import type { CheckCallPayload, CpredRollRequest, CpredStatId } from '@vtt/shared';
import {
  CHECK_CALL_DV_MAX,
  CHECK_CALL_DV_MIN,
  CHECK_CALL_OPPONENT_MAX,
  CHECK_CALL_OPPONENT_MIN,
  CHECK_CALL_PROMPT_MAX,
  CPRED_DIFFICULTY_LADDER,
  CPRED_SITUATIONAL_MODIFIER_LIMIT,
  CPRED_STAT_IDS,
  CPRED_STAT_LABELS,
  cpredSkillLabel,
} from '@vtt/shared';
import { callCheck, checkCallErrorText } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useChatStore } from '../stores/chatStore.js';

/**
 * „Wezwij do Testu" (etap 32) — okno MG, w którym powstaje wezwanie.
 *
 * Cały zakres Testu jest tutaj: **każda Umiejętność i każda Cecha**, próg
 * z drabinki podręcznika albo wpisany z ręki, a zamiast progu — rzut
 * przeciwstawny streszczony jedną liczbą drugiej strony. Skutków nie ma
 * świadomie: nieudany Test kończy się zdaniem MG i jego ręką na karcie
 * postaci (decyzja MG z 02.09.2026).
 */
export function CheckCallDialog({
  characterId,
  characterName,
  onClose,
}: {
  characterId: string;
  characterName: string;
  onClose: () => void;
}) {
  const registry = useCharacterStore((s) => s.registry);
  const character = useCharacterStore((s) => s.characters[characterId]);

  const [kind, setKind] = useState<'skill' | 'stat'>('skill');
  const [skillId, setSkillId] = useState('');
  const [statId, setStatId] = useState<CpredStatId>('int');
  const [against, setAgainst] = useState<'dv' | 'opposed'>('dv');
  const [dv, setDv] = useState(13);
  const [opponentBonus, setOpponentBonus] = useState(10);
  const [modifier, setModifier] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'gm'>('public');
  const [busy, setBusy] = useState(false);

  const skills = useMemo(
    () =>
      [...registry.skills].sort((a, b) =>
        cpredSkillLabel(a, character?.data).localeCompare(
          cpredSkillLabel(b, character?.data),
          'pl',
        ),
      ),
    [registry.skills, character?.data],
  );

  useEffect(() => {
    if (skillId === '' && skills.length > 0) setSkillId(skills[0]!.id);
  }, [skillId, skills]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit() {
    const request: CpredRollRequest =
      kind === 'skill' ? { kind: 'skill', skillId } : { kind: 'stat', statId };
    const payload: CheckCallPayload<CpredRollRequest> = {
      characterId,
      request,
      ...(against === 'dv' ? { dv } : { opponentBonus }),
      ...(modifier !== 0 ? { modifier } : {}),
      ...(prompt.trim().length > 0 ? { prompt: prompt.trim() } : {}),
      visibility,
    };
    setBusy(true);
    const ack = await callCheck(payload);
    setBusy(false);
    if (!ack.ok) {
      useChatStore.getState().addNote(checkCallErrorText(ack.error));
      return;
    }
    onClose();
  }

  const ready = kind === 'stat' || skillId !== '';

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog check-call-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="panel-section-title">Wezwij do Testu — {characterName}</h3>

        <fieldset className="roll-visibility">
          <legend className="auth-label">Czym rzuca</legend>
          <label>
            <input
              type="radio"
              name="check-kind"
              checked={kind === 'skill'}
              onChange={() => setKind('skill')}
            />{' '}
            Umiejętność
          </label>
          <label>
            <input
              type="radio"
              name="check-kind"
              checked={kind === 'stat'}
              onChange={() => setKind('stat')}
            />{' '}
            Cecha
          </label>
        </fieldset>

        {kind === 'skill' ? (
          <>
            <label className="auth-label" htmlFor="check-skill">
              Umiejętność
            </label>
            <select id="check-skill" value={skillId} onChange={(e) => setSkillId(e.target.value)}>
              {skills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {cpredSkillLabel(skill, character?.data)} ({CPRED_STAT_LABELS[skill.stat].abbr})
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label className="auth-label" htmlFor="check-stat">
              Cecha
            </label>
            <select
              id="check-stat"
              value={statId}
              onChange={(e) => setStatId(e.target.value as CpredStatId)}
            >
              {CPRED_STAT_IDS.map((id) => (
                <option key={id} value={id}>
                  {CPRED_STAT_LABELS[id].name} ({CPRED_STAT_LABELS[id].abbr})
                </option>
              ))}
            </select>
          </>
        )}

        <fieldset className="roll-visibility">
          <legend className="auth-label">Przeciw czemu</legend>
          <label>
            <input
              type="radio"
              name="check-against"
              checked={against === 'dv'}
              onChange={() => setAgainst('dv')}
            />{' '}
            Poziom Trudności
          </label>
          <label>
            <input
              type="radio"
              name="check-against"
              checked={against === 'opposed'}
              onChange={() => setAgainst('opposed')}
            />{' '}
            Rzut przeciwstawny
          </label>
        </fieldset>

        {against === 'dv' ? (
          <>
            <div className="check-ladder">
              {CPRED_DIFFICULTY_LADDER.map((rung) => (
                <button
                  key={rung.id}
                  type="button"
                  className={`small-button${dv === rung.dv ? ' small-button--on' : ''}`}
                  title={rung.note}
                  onClick={() => setDv(rung.dv)}
                >
                  {rung.label} {rung.dv}
                </button>
              ))}
            </div>
            <label className="auth-label" htmlFor="check-dv">
              PT (własna liczba)
            </label>
            <input
              id="check-dv"
              type="number"
              min={CHECK_CALL_DV_MIN}
              max={CHECK_CALL_DV_MAX}
              value={dv}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value)) {
                  setDv(
                    Math.max(CHECK_CALL_DV_MIN, Math.min(CHECK_CALL_DV_MAX, Math.round(value))),
                  );
                }
              }}
            />
          </>
        ) : (
          <>
            <label className="auth-label" htmlFor="check-opponent">
              Druga strona: Cecha + Umiejętność (1k10 dorzuci serwer)
            </label>
            <input
              id="check-opponent"
              type="number"
              min={CHECK_CALL_OPPONENT_MIN}
              max={CHECK_CALL_OPPONENT_MAX}
              value={opponentBonus}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value)) {
                  setOpponentBonus(
                    Math.max(
                      CHECK_CALL_OPPONENT_MIN,
                      Math.min(CHECK_CALL_OPPONENT_MAX, Math.round(value)),
                    ),
                  );
                }
              }}
            />
            <p className="roll-dialog-hint">Remis wygrywa druga strona (s. 130).</p>
          </>
        )}

        <label className="auth-label" htmlFor="check-modifier">
          Modyfikator sytuacyjny
        </label>
        <input
          id="check-modifier"
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

        <label className="auth-label" htmlFor="check-prompt">
          Co się dzieje (widzi to wezwany)
        </label>
        <textarea
          id="check-prompt"
          rows={2}
          maxLength={CHECK_CALL_PROMPT_MAX}
          value={prompt}
          placeholder="Coś brzęknęło pod twoją stopą…"
          onChange={(e) => setPrompt(e.target.value)}
        />

        <fieldset className="roll-visibility">
          <legend className="auth-label">Kto zobaczy wynik</legend>
          <label>
            <input
              type="radio"
              name="check-visibility"
              checked={visibility === 'public'}
              onChange={() => setVisibility('public')}
            />{' '}
            Cały stół
          </label>
          <label>
            <input
              type="radio"
              name="check-visibility"
              checked={visibility === 'gm'}
              onChange={() => setVisibility('gm')}
            />{' '}
            Tylko MG i wezwany
          </label>
        </fieldset>

        <div className="scene-editor-row">
          <button
            type="button"
            className="primary-button"
            disabled={!ready || busy}
            onClick={() => void submit()}
          >
            Wezwij
          </button>
          <button type="button" className="small-button" onClick={onClose}>
            Anuluj
          </button>
        </div>
        <p className="roll-dialog-hint">
          Wezwanie stanie na czacie wezwanego i zawoła z jego kubka. Skutki — przedmiot, PW, rana —
          rozliczasz ręką po werdykcie.
        </p>
      </div>
    </div>
  );
}
