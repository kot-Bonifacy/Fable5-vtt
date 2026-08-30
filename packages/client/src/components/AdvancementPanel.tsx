import { useState } from 'react';
import {
  ADVANCEMENT_KIND_LABELS,
  CPRED_MULTICLASS_MIN_RANK,
  cpredAbilityAdvanceSteps,
  cpredRoleRanks,
  cpredSkillAdvanceStep,
  formatAdvancementAmount,
  groupedSkills,
  planCpredRoleChange,
  type AdvancementEntryView,
  type CpredAdvanceStep,
} from '@vtt/shared';
import {
  advanceCharacter,
  advanceErrorText,
  changeCharacterRole,
  fetchAdvancementHistory,
  roleChangeErrorText,
} from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';

/**
 * Zmiana Roli (etap 29b, s. 143).
 *
 * Stoi w „Awansie", a nie przy wierszu „Rola" na stronie pierwszej, bo to jest
 * zakup: nowa Rola kosztuje pierwszy szczebel drabinki Zdolności (60 PD)
 * i otwiera się dopiero przy Zdolności bieżącej Roli na poziomie 4. Wybór Roli
 * na stronie pierwszej został ręką MG — tam poprawia się kartę, tutaj się gra.
 *
 * Powrót do Roli, którą postać już miała, jest za darmo (decyzja MG,
 * 30.08.2026): ranga siedzi na karcie i działa, zmienia się wyłącznie to, którą
 * Rolą widzi cię Ulica.
 */
function RoleChangeSection({ characterId }: { characterId: string }) {
  const character = useCharacterStore((s) => s.characters[characterId] ?? null);
  const registry = useCharacterStore((s) => s.registry);
  const [picked, setPicked] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!character) return null;
  const data = character.data;
  const held = cpredRoleRanks(data);
  const current = held[0] ?? null;
  if (!current) return null;

  const roleName = (id: string) => registry.roles.find((r) => r.id === id)?.name ?? id;
  const candidates = registry.roles.filter((role) => role.id !== current.roleId);
  const plan = picked ? planCpredRoleChange(data, registry, picked) : null;
  const gated = current.rank < CPRED_MULTICLASS_MIN_RANK;

  async function change(): Promise<void> {
    setBusy(true);
    setError(null);
    const ack = await changeCharacterRole({ characterId, roleId: picked });
    setBusy(false);
    if (!ack.ok) {
      setError(roleChangeErrorText(ack.error));
      return;
    }
    setPicked('');
  }

  return (
    <>
      <p className="advance-section">Rola</p>
      <ul className="awareness-list">
        {held.map((row, index) => (
          <li key={row.roleId} className="awareness-row">
            <span className="awareness-name">{roleName(row.roleId)}</span>
            <span className="awareness-value">{index === 0 ? 'bieżąca' : 'poprzednia'}</span>
            <span className="awareness-cost">{row.rank}</span>
            <span className="awareness-steps" />
          </li>
        ))}
      </ul>
      <div className="advance-role">
        <select
          value={picked}
          onChange={(e) => {
            setPicked(e.target.value);
            setError(null);
          }}
          disabled={gated || busy}
          aria-label="Nowa Rola"
          title={
            gated
              ? `Rolę zmienia się przy Zdolności bieżącej Roli na poziomie ${CPRED_MULTICLASS_MIN_RANK}.`
              : undefined
          }
        >
          <option value="">— zmień Rolę na —</option>
          {candidates.map((role) => {
            const priced = planCpredRoleChange(data, registry, role.id);
            const suffix = !priced.ok
              ? ''
              : priced.plan.returning
                ? ` — powrót (${priced.plan.ability} ${priced.plan.rank})`
                : ` — ${priced.plan.cost} PD`;
            return (
              <option key={role.id} value={role.id}>
                {role.name}
                {suffix}
              </option>
            );
          })}
        </select>
        <button
          type="button"
          className="advance-buy"
          onClick={() => void change()}
          disabled={busy || plan === null || !plan.ok}
          /* Nazwa Roli stoi w mianowniku po dwukropku, nigdy w środku zdania:
             `roles.json` niesie „Nomada", a „zostań Nomada" to nie jest zdanie
             po polsku — odmiany nazwy z pliku danych nie da się zgadnąć. */
          title={
            plan?.ok
              ? plan.plan.returning
                ? `Powrót do Roli: ${plan.plan.roleName} — za darmo, ${plan.plan.ability} wraca na poziom ${plan.plan.rank}.`
                : `Nowa Rola: ${plan.plan.roleName} — ${plan.plan.cost} PD, ${plan.plan.ability} od poziomu 1 (zostanie ${plan.plan.left} PD). Poprzednia Rola (${roleName(plan.plan.from.roleId)}) zostaje na karcie i działa dalej.`
              : undefined
          }
        >
          Zmień
        </button>
      </div>
      {plan && !plan.ok && <p className="awareness-error">{roleChangeErrorText(plan.problem)}</p>}
      {error && <p className="awareness-error">{error}</p>}
      <p className="awareness-hint">
        {gated
          ? `Rolę zmienia się dopiero przy Zdolności Specjalnej bieżącej Roli na poziomie ${CPRED_MULTICLASS_MIN_RANK} — dziś ${roleName(current.roleId)} ma ${current.rank} (s. 143).`
          : 'Nowa Rola startuje od poziomu 1 i kosztuje 60 PD; poprzednia zostaje na karcie, działa i dalej rośnie (s. 143).'}
      </p>
    </>
  );
}

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
  // Etap 29b: karta może nieść kilka Ról, a każda ma swoją drabinkę — Solo,
  // które zostało Nomadą, kupuje Zmysł Walki i Moto niezależnie.
  const abilities = cpredAbilityAdvanceSteps(data, registry);
  const held = cpredRoleRanks(data);
  const current = held[0] ?? null;

  async function buy(step: CpredAdvanceStep): Promise<void> {
    setBusy(true);
    setError(null);
    const ack = await advanceCharacter({
      characterId,
      kind: step.kind,
      ...(step.skillId ? { skillId: step.skillId } : {}),
      ...(step.roleId ? { roleId: step.roleId } : {}),
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
      <li key={step.skillId ?? step.roleId ?? 'ability'} className="awareness-row">
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

      {abilities.length > 0 ? (
        <>
          <p className="advance-section">
            {abilities.length > 1 ? 'Zdolności Specjalne' : 'Zdolność Specjalna'}
          </p>
          <ul className="awareness-list">{abilities.map(row)}</ul>
        </>
      ) : (
        <p className="awareness-hint">
          {data.roleId
            ? 'Zdolność Specjalna stoi na dziesiątce — wyżej podręcznik nie idzie.'
            : 'Bez Roli nie ma Zdolności Specjalnej do podnoszenia.'}
        </p>
      )}

      <RoleChangeSection characterId={characterId} />

      {/* Etap 29b: „cały czas możesz podnosić poziom Zdolności Specjalnej
          poprzedniej Roli i korzystać z oferowanych przez nią korzyści"
          (s. 143) — dlatego wyżej stoi lista, a nie jeden wiersz. */}
      {held.length > 1 && current && (
        <p className="awareness-hint">
          Rolą, przez którą widzi cię Ulica, jest ta na górze listy:{' '}
          {registry.roles.find((r) => r.id === current.roleId)?.name ?? '—'}. Poprzednie działają
          dalej i dalej rosną.
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
