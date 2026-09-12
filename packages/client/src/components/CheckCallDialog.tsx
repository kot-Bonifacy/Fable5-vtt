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
import { useCheckStore, type CheckCallDraft } from '../stores/checkStore.js';
import { NumberStepper, signed } from './NumberStepper.js';

/**
 * „Wezwij do Testu" (etap 32) — okno MG, w którym powstaje wezwanie.
 *
 * Cały zakres Testu jest tutaj: **każda Umiejętność i każda Cecha**, próg
 * z drabinki podręcznika albo wpisany z ręki, a zamiast progu — rzut
 * przeciwstawny streszczony jedną liczbą drugiej strony. Skutków nie ma
 * świadomie: nieudany Test kończy się zdaniem MG i jego ręką na karcie
 * postaci (decyzja MG z 02.09.2026).
 *
 * Od etapu 40 to okno ma **dwa wejścia**: przycisk ⚄ w panelu „Postacie"
 * i „Ustaw…" na karcie prośby gracza. Drugie wchodzi z wypełnioną postacią,
 * Umiejętnością i zdaniem „po co" — a wysłanie stamtąd zamyka prośbę tym samym
 * żądaniem, którym wystawia wezwanie.
 */
export function CheckCallDialog() {
  const draft = useCheckStore((s) => s.callDraft);
  if (!draft) return null;
  // Klucz po prośbie i postaci: „Ustaw…" na drugiej karcie ma dać świeże pola,
  // a nie Umiejętność zapamiętaną z poprzedniej prośby.
  return (
    <CheckCallDialogBody
      key={`${draft.requestMessageId ?? ''}-${draft.characterId}`}
      draft={draft}
    />
  );
}

function CheckCallDialogBody({ draft }: { draft: CheckCallDraft }) {
  const { characterId, characterName } = draft;
  const onClose = useCheckStore((s) => s.closeCall);
  const registry = useCharacterStore((s) => s.registry);
  const character = useCharacterStore((s) => s.characters[characterId]);

  const [kind, setKind] = useState<'skill' | 'stat'>(
    draft.request?.kind === 'stat' ? 'stat' : 'skill',
  );
  const [skillId, setSkillId] = useState(draft.request?.skillId ?? '');
  const [statId, setStatId] = useState<CpredStatId>(
    (draft.request?.statId as CpredStatId | undefined) ?? 'int',
  );
  const [against, setAgainst] = useState<'dv' | 'opposed'>('dv');
  const [dv, setDv] = useState(13);
  const [opponentBonus, setOpponentBonus] = useState(10);
  const [modifier, setModifier] = useState(0);
  const [prompt, setPrompt] = useState(draft.prompt ?? '');
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
      // Zgoda i wezwanie jadą jednym żądaniem — inaczej dałoby się zostawić
      // prośbę otwartą przy wystawionym wezwaniu, i odwrotnie.
      ...(draft.requestMessageId !== undefined ? { requestMessageId: draft.requestMessageId } : {}),
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
        {draft.requestMessageId !== undefined && (
          <p className="roll-dialog-hint">
            Odpowiedź na prośbę gracza — wysłanie zamknie ją zgodą.
          </p>
        )}

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
            <span className="auth-label">PT (własna liczba)</span>
            <NumberStepper
              min={CHECK_CALL_DV_MIN}
              max={CHECK_CALL_DV_MAX}
              value={dv}
              onChange={setDv}
              label="PT (własna liczba)"
            />
          </>
        ) : (
          <>
            <span className="auth-label">
              Druga strona: Cecha + Umiejętność (1k10 dorzuci serwer)
            </span>
            <NumberStepper
              min={CHECK_CALL_OPPONENT_MIN}
              max={CHECK_CALL_OPPONENT_MAX}
              value={opponentBonus}
              onChange={setOpponentBonus}
              label="Druga strona: Cecha + Umiejętność"
            />
            <p className="roll-dialog-hint">Remis wygrywa druga strona (s. 130).</p>
          </>
        )}

        <span className="auth-label">Modyfikator sytuacyjny</span>
        <NumberStepper
          min={-CPRED_SITUATIONAL_MODIFIER_LIMIT}
          max={CPRED_SITUATIONAL_MODIFIER_LIMIT}
          value={modifier}
          onChange={setModifier}
          format={signed}
          label="Modyfikator sytuacyjny"
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
