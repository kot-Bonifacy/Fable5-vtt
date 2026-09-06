import { useEffect, useState } from 'react';
import type { CpredHitLocation, CpredRollRequest } from '@vtt/shared';
import {
  CPRED_AIMED_SHOT_PENALTY,
  CPRED_HIT_LOCATIONS,
  CPRED_HIT_LOCATION_LABELS,
  CPRED_SITUATIONAL_MODIFIER_LIMIT,
  cpredInjuryConditionalModifiers,
  cpredInjuryModifiers,
  formatRollNotation,
  planCpredRoll,
  ROLE_GM,
} from '@vtt/shared';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { askForCheck } from '../stores/checkStore.js';
import {
  useRollStore,
  type PendingRoll,
  type RollCall,
  type RollTarget,
} from '../stores/rollStore.js';

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
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const isDamage = target.kind === 'damage';
  // Wezwanie MG (etap 32): modyfikator i widoczność są **jego** decyzją, więc
  // okno przestaje o nie pytać i pokazuje je jako fakt. Gracz zachowuje jedyny
  // wybór, który przy wezwaniu naprawdę należy do niego — Szczęście.
  const call = target.call;

  const [modifier, setModifier] = useState(
    call ? (call.modifier ?? 0) : isDamage ? 0 : lastModifier,
  );
  const [luckSpent, setLuckSpent] = useState(0);
  const [visibility, setVisibility] = useState<'public' | 'gm'>(
    call ? call.visibility : isDamage ? 'public' : lastVisibility,
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

  // Etap 40: prośbę składa się **własną** kartą i tylko jako gracz — MG ma na
  // to wezwanie z 32. Przy otwartym wezwaniu przycisku nie ma: zgoda już jest.
  const mayAsk =
    !isGm &&
    !call &&
    character.ownerId === userId &&
    (target.kind === 'skill' || target.kind === 'stat');

  const request: CpredRollRequest = {
    kind: target.kind,
    ...(target.skillId ? { skillId: target.skillId } : {}),
    ...(target.statId ? { statId: target.statId } : {}),
    ...(target.weaponRowId ? { weaponRowId: target.weaponRowId } : {}),
    ...(isDamage ? { location } : {}),
    modifier,
    luckSpent,
  };
  // Same pure function the server uses, and the half of its context that is
  // readable from the sheet: the flat penalties of the wounds this character
  // carries („Wstrząśnienie mózgu −2"). Without them the dialog promised a
  // total the server then quietly lowered — found in the browser 30.08 with a
  // GM-typed wound worth −1. What stays server-only is what the sheet cannot
  // know: being Held is a fact about the scene, not about the character.
  const planned = planCpredRoll(character.data, registry, request, {
    modifiers: cpredInjuryModifiers(character.data.criticalInjuries).map((entry) => ({
      label: entry.label,
      value: entry.value,
      kind: 'situational' as const,
    })),
  });
  const luckMax = character.data.luckCurrent;
  const conditional = cpredInjuryConditionalModifiers(character.data.criticalInjuries);

  function confirm() {
    if (!planned.ok) return;
    // Wezwania nie zapamiętujemy: modyfikator MG i jego widoczność nie mają
    // być domyślnymi ustawieniami następnego, własnego rzutu gracza.
    if (call) {
      /* nic do zapamiętania */
    } else if (isDamage) useRollStore.getState().rememberLocation(location);
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
          {call ? 'Wezwanie do Testu — ' : ''}
          {target.characterName}: {planned.ok ? planned.plan.title : 'Rzut'}
        </h3>

        {call && (
          <div className="roll-call-frame">
            {call.prompt && <p className="roll-call-prompt">„{call.prompt}"</p>}
            <p className="roll-dialog-hint">
              Wezwał {call.calledByName} · {callTargetText(call)}
              {call.modifier
                ? ` · modyfikator MG ${call.modifier > 0 ? '+' : '−'}${Math.abs(call.modifier)}`
                : ''}
            </p>
          </div>
        )}

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

        {!call && (
          <>
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
          </>
        )}

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

            {call ? (
              <p className="roll-dialog-hint">
                Widoczność wyniku wybrał MG:{' '}
                {visibility === 'public' ? 'jawna dla stołu' : 'MG i ty'}.
              </p>
            ) : (
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
            )}
          </>
        )}

        {!planned.ok && <p className="auth-error">Nie można wykonać tego rzutu.</p>}

        <div className="scene-editor-row">
          <button className="primary-button" type="button" onClick={confirm} disabled={!planned.ok}>
            Weź kubek
          </button>
          {/* Etap 40: odkrywalna droga do prośby o Test. Gracz, który otworzył
              okno konkretnej Umiejętności, jest o jedno kliknięcie od pytania
              „czy mogę tym rzucić" — a okno ma gdzie postawić pole „po co".
              Przy wezwaniu MG przycisku nie ma: zgoda już padła. */}
          {mayAsk && (
            <button
              type="button"
              className="small-button"
              title="Zapytaj MG, czy da się tym rzucić (Alt + klik w wiersz karty robi to samo)"
              onClick={() => askForCheck(target, character.data, registry)}
            >
              Poproś MG
            </button>
          )}
          <button type="button" className="small-button" onClick={closeDialog}>
            Anuluj
          </button>
        </div>
        <p className="roll-dialog-hint">
          Potrząśnij kubkiem nad stołem i puść, żeby rzucić. Shift + klik w umiejętność pomija to
          okno{mayAsk ? ', Alt + klik prosi MG o Test' : ''}.
        </p>
      </div>
    </div>
  );
}

/** „PT 15 (Trudny)" albo „przeciwstawny — druga strona: 14 + 1k10". */
function callTargetText(call: RollCall): string {
  if (call.opponentBonus !== undefined) {
    return `rzut przeciwstawny — druga strona: ${call.opponentBonus} + 1k10`;
  }
  if (call.dv === undefined) return 'bez progu';
  return call.dvLabel ? `PT ${call.dv} (${call.dvLabel})` : `PT ${call.dv}`;
}
