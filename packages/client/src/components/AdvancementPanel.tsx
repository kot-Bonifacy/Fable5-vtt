import { useState } from 'react';
import {
  ADVANCEMENT_KIND_LABELS,
  cpredAbilityAdvanceStep,
  cpredSkillAdvanceStep,
  formatAdvancementAmount,
  groupedSkills,
  type AdvancementEntryView,
  type CpredAdvanceStep,
} from '@vtt/shared';
import { advanceCharacter, advanceErrorText, fetchAdvancementHistory } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';

/**
 * Wydawanie Punktów Doświadczenia (etap 29a, s. 411).
 *
 * Jeden ekran odpowiadający na trzy pytania naraz — „co mogę podnieść", „ile to
 * kosztuje", „ile mi zostanie" — bo przy stole zadaje się je razem. Ceny liczy
 * ta sama funkcja, którą serwer sprawdza żądanie (`cpredSkillAdvanceStep`,
 * `cpredAbilityAdvanceStep`), więc zapalony guzik i odmowa nie mogą się
 * rozjechać co do grosza.
 *
 * Czego tu nie ma i nie będzie: pola „wpisz nowy poziom". Podręcznik zna tylko
 * jeden ruch w górę — „nie możesz przeskakiwać Poziomów" — a formularz
 * przyjmujący dowolną liczbę byłby zaproszeniem do rzeczy, której serwer i tak
 * odmówi.
 */
export function AdvancementPanel({ characterId }: { characterId: string }) {
  const character = useCharacterStore((s) => s.characters[characterId] ?? null);
  const registry = useCharacterStore((s) => s.registry);
  const [error, setError] = useState<string | null>(null);
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [history, setHistory] = useState<AdvancementEntryView[] | null>(null);
  const [busy, setBusy] = useState(false);

  if (!character) return null;
  const data = character.data;
  const points = data.improvementPoints;
  const ability = cpredAbilityAdvanceStep(data, registry);

  async function buy(step: CpredAdvanceStep): Promise<void> {
    setBusy(true);
    setError(null);
    const ack = await advanceCharacter({
      characterId,
      kind: step.kind,
      ...(step.skillId ? { skillId: step.skillId } : {}),
      to: step.to,
    });
    setBusy(false);
    if (!ack.ok) {
      setError(advanceErrorText(ack.error));
      return;
    }
    // Rejestr otwarty w trakcie musi zobaczyć świeży wiersz, a nie ten sprzed
    // zakupu — inaczej wygląda, jakby awans się nie zapisał.
    if (history !== null) void loadHistory();
  }

  async function loadHistory(): Promise<void> {
    const ack = await fetchAdvancementHistory(characterId);
    setHistory(ack.ok && ack.data ? ack.data.entries : []);
  }

  function row(step: CpredAdvanceStep) {
    const short = points < step.cost;
    return (
      <li key={step.skillId ?? 'ability'} className="awareness-row">
        <span className="awareness-name" title={step.name}>
          {step.name}
          {step.doubled && (
            <span className="advance-x2" title="Umiejętność podwójna: szczebel kosztuje ×2">
              {' '}
              ×2
            </span>
          )}
        </span>
        <span className="awareness-value">
          {step.from} → {step.to}
        </span>
        <span className={short ? 'awareness-cost advance-cost--short' : 'awareness-cost'}>
          {step.cost} PD
        </span>
        <span className="awareness-steps">
          <button
            type="button"
            className="advance-buy"
            onClick={() => void buy(step)}
            disabled={busy || short}
            title={
              short
                ? `Brakuje ${step.cost - points} PD`
                : `Podnieś: ${step.name} na poziom ${step.to} za ${step.cost} PD (zostanie ${points - step.cost})`
            }
            aria-label={`Podnieś: ${step.name} na poziom ${step.to}`}
          >
            Podnieś
          </button>
        </span>
      </li>
    );
  }

  const groups = groupedSkills(registry)
    .map((group) => ({
      ...group,
      steps: group.skills
        .map((skill) => cpredSkillAdvanceStep(data, skill))
        .filter((step): step is CpredAdvanceStep => step !== null)
        .filter((step) => !affordableOnly || step.cost <= points),
    }))
    .filter((group) => group.steps.length > 0);

  return (
    <div className="awareness advance">
      <header className="awareness-head">
        <h4>Awans</h4>
        <p className={points === 0 ? 'awareness-left' : 'awareness-left awareness-left--empty'}>
          {points} PD w zapasie
        </p>
      </header>

      {ability ? (
        <>
          <p className="advance-section">Zdolność Specjalna</p>
          <ul className="awareness-list">{row(ability)}</ul>
        </>
      ) : (
        <p className="awareness-hint">
          {data.roleId
            ? 'Zdolność Specjalna stoi na dziesiątce — wyżej podręcznik nie idzie.'
            : 'Bez Roli nie ma Zdolności Specjalnej do podnoszenia.'}
        </p>
      )}

      <p className="advance-section advance-section--skills">
        Umiejętności
        <label className="advance-filter">
          <input
            type="checkbox"
            checked={affordableOnly}
            onChange={(e) => setAffordableOnly(e.target.checked)}
          />
          tylko na które mnie stać
        </label>
      </p>
      <div className="advance-scroll">
        {groups.length === 0 ? (
          <p className="awareness-hint">Nic w tej cenie — poczekaj na PD po sesji.</p>
        ) : (
          groups.map((group) => (
            <div key={group.id}>
              <p className="advance-group">{group.label}</p>
              <ul className="awareness-list">{group.steps.map(row)}</ul>
            </div>
          ))
        )}
      </div>

      {error && <p className="awareness-error">{error}</p>}
      <p className="awareness-hint">
        Poziomu nie da się przeskoczyć — kolejny zawsze jest o jeden wyżej (s. 411). Ile PD dostaje
        drużyna po sesji, ustala MG.
      </p>

      <details
        className="awareness-extras"
        onToggle={(e) => {
          if ((e.currentTarget as HTMLDetailsElement).open && history === null) void loadHistory();
        }}
      >
        <summary>Rejestr awansów</summary>
        {history === null ? (
          <p className="awareness-hint">Wczytuję…</p>
        ) : history.length === 0 ? (
          <p className="awareness-hint">Jeszcze nic tu nie stanęło.</p>
        ) : (
          <ul className="advance-log">
            {history.map((entry) => (
              <li key={entry.id}>
                <span className="advance-log-when">
                  {new Date(entry.createdAt).toLocaleDateString('pl-PL')}
                </span>
                <span className="advance-log-what" title={ADVANCEMENT_KIND_LABELS[entry.kind]}>
                  {entry.label}
                </span>
                <span className="advance-log-amount">{formatAdvancementAmount(entry.amount)}</span>
                <span className="advance-log-left">{entry.balance} PD</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
