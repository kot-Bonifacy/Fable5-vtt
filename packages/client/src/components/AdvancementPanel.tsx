import { useEffect, useState } from 'react';
import {
  ADVANCEMENT_AWARD_MAX,
  ADVANCEMENT_KIND_LABELS,
  ADVANCEMENT_UNDO_PROBLEMS,
  ADVANCEMENT_LABEL_MAX,
  CPRED_MULTICLASS_MIN_RANK,
  cpredAbilityAdvanceSteps,
  cpredRoleRanks,
  cpredSkillAdvanceStep,
  formatAdvancementAmount,
  groupedSkills,
  planCpredAdvances,
  planCpredRoleChange,
  ROLE_GM,
  type AdvancementEntryView,
  type AdvancementUndoProblem,
  type CpredAdvanceRequest,
  type CpredAdvanceStep,
} from '@vtt/shared';
import {
  advanceCharacter,
  advanceErrorText,
  awardImprovementPoints,
  changeCharacterRole,
  fetchAdvancementHistory,
  roleChangeErrorText,
  undoAdvancement,
} from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { COMBAT_LOCKED_HINT, useCombatLocked } from '../stores/combatStore.js';
import { noteAck, notifyInfo, notifyRefusal } from '../notices.js';

/**
 * MG: PD dla jednej postaci, prosto z jej karty (decyzja MG z 20.10).
 *
 * Bliźniak „Po sesji” z Rytuałów stołu, tylko z `characterId` zamiast
 * `everyone` — ten sam `character:xp-award`, więc wiersz rejestru mówi
 * „Przyznane po sesji”, a właściciel dostaje komunikat, czego ręczna zmiana
 * licznika („Korekta MG”) nie daje.
 */
export function XpAwardForm({ characterId, onDone }: { characterId: string; onDone: () => void }) {
  const name = useCharacterStore((s) => s.characters[characterId]?.name ?? '');
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  async function award(): Promise<void> {
    const points = Number.parseInt(amount, 10);
    if (!Number.isInteger(points) || points === 0) {
      notifyRefusal('character', 'Podaj liczbę PD — tabela na s. 410 idzie od 10 do 80 na sesję.');
      return;
    }
    setBusy(true);
    const ack = await awardImprovementPoints({ characterId, amount: points, label: label.trim() });
    setBusy(false);
    if (!noteAck('character', ack, advanceErrorText)) return;
    notifyInfo(`${points > 0 ? 'Przyznano' : 'Zabrano'} ${Math.abs(points)} PD — ${name}.`, {
      title: 'Punkty Doświadczenia',
      topic: 'character',
    });
    onDone();
  }

  return (
    <form
      className="cp-xp-award"
      onSubmit={(event) => {
        event.preventDefault();
        void award();
      }}
    >
      <input
        type="number"
        min={-ADVANCEMENT_AWARD_MAX}
        max={ADVANCEMENT_AWARD_MAX}
        value={amount}
        placeholder="PD"
        autoFocus
        onChange={(e) => setAmount(e.target.value)}
        aria-label="PD do przyznania tej postaci"
        title="Tabela na s. 410–411 idzie od 10 do 80 na sesję; liczba ujemna zabiera (bez komunikatu dla gracza)."
      />
      <input
        type="text"
        maxLength={ADVANCEMENT_LABEL_MAX}
        value={label}
        placeholder="za co (trafia do rejestru i do komunikatu)"
        onChange={(e) => setLabel(e.target.value)}
        aria-label="Powód przyznania PD tej postaci"
      />
      <button type="submit" className="small-button" disabled={busy}>
        Przyznaj
      </button>
      <button type="button" className="small-button" onClick={onDone}>
        Anuluj
      </button>
    </form>
  );
}

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
 *
 * Zmiana Roli przestawia drabinki Zdolności, więc nie miesza się z koszykiem
 * podniesień (24.10.2026): póki coś w nim czeka, `blocked` gasi guzik.
 */
function RoleChangeSection({ characterId, blocked }: { characterId: string; blocked: boolean }) {
  const character = useCharacterStore((s) => s.characters[characterId] ?? null);
  const registry = useCharacterStore((s) => s.registry);
  const [picked, setPicked] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useCombatLocked();

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
    const ack = await changeCharacterRole({ characterId, roleId: picked });
    setBusy(false);
    if (!noteAck('character', ack, roleChangeErrorText)) return;
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
          }}
          disabled={gated || busy || locked}
          aria-label="Nowa Rola"
          title={
            locked
              ? COMBAT_LOCKED_HINT
              : gated
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
          disabled={busy || locked || blocked || plan === null || !plan.ok}
          /* Nazwa Roli stoi w mianowniku po dwukropku, nigdy w środku zdania:
             `roles.json` niesie „Nomada", a „zostań Nomada" to nie jest zdanie
             po polsku — odmiany nazwy z pliku danych nie da się zgadnąć. */
          title={
            locked
              ? COMBAT_LOCKED_HINT
              : blocked
                ? 'Najpierw zatwierdź albo odrzuć podniesienia z koszyka.'
                : plan?.ok
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
 * ta sama funkcja, którą serwer sprawdza żądanie (`planCpredAdvances`), więc
 * zapalony guzik i odmowa nie mogą się rozjechać co do grosza.
 *
 * „Podnieś" nie wydaje od razu (zlecenie MG z 24.10.2026): kliknięcia zbierają
 * się w koszyk, ceny kolejnych szczebli liczą się już od podniesionych
 * poziomów, a PD odchodzą dopiero przy „Zatwierdź zmiany" — jednym żądaniem,
 * całym albo wcale. „−" przy wierszu zdejmuje jego ostatni szczebel z koszyka.
 *
 * Czego tu nie ma i nie będzie: pola „wpisz nowy poziom". Podręcznik zna tylko
 * jeden ruch w górę — „nie możesz przeskakiwać Poziomów" — a formularz
 * przyjmujący dowolną liczbę byłby zaproszeniem do rzeczy, której serwer i tak
 * odmówi.
 */
export function AdvancementPanel({ characterId }: { characterId: string }) {
  const character = useCharacterStore((s) => s.characters[characterId] ?? null);
  const registry = useCharacterStore((s) => s.registry);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [history, setHistory] = useState<AdvancementEntryView[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<CpredAdvanceRequest[]>([]);
  const locked = useCombatLocked();

  /*
   * Rejestr czyta się na **stempel serwera**, nie na saldo — ta sama umowa, co
   * przy bliźniaczym rejestrze eurodolców z 23b, i z tego samego powodu: własna
   * łata karty ląduje w składzie optymistycznie, więc licznik zna nową liczbę,
   * zanim żądanie wyjdzie, a lista czytana na saldzie wróciłaby bez wiersza,
   * który dopiero powstaje.
   *
   * Wyzwalaczem jest cokolwiek, co ruszy kartę, bo PD dopisuje nie tylko ta
   * karta: pulę po sesji i korektę wpisuje MG (znalezione przy oględzinach
   * 09.09 — otwarty rejestr zostawał wtedy przy liście sprzed przyznania,
   * a licznik nad nim już rósł).
   */
  const savedAt = character?.updatedAt ?? null;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void fetchAdvancementHistory(characterId).then((ack) => {
      if (!alive) return;
      setHistory(ack.ok && ack.data ? ack.data.entries : []);
    });
    return () => {
      alive = false;
    };
  }, [characterId, open, savedAt]);

  // Koszyk należy do jednej karty — inna karta w tym samym oknie zaczyna od zera.
  useEffect(() => setPending([]), [characterId]);

  if (!character) return null;
  const data = character.data;
  const available = data.improvementPoints;
  // Karta „po zmianach": ta sama funkcja, którą serwer przyjmie koszyk. Gdy
  // pod spodem ktoś ruszył kartę (MG zabrał PD, cofnął awans), koszyk może
  // przestać się spinać — wtedy panel mówi dlaczego i liczy od karty.
  const basket = planCpredAdvances(data, registry, pending);
  const projected = basket.ok ? basket.sheet : data;
  const points = projected.improvementPoints;
  // Etap 29b: karta może nieść kilka Ról, a każda ma swoją drabinkę — Solo,
  // które zostało Nomadą, kupuje Zmysł Walki i Moto niezależnie.
  const abilities = cpredAbilityAdvanceSteps(projected, registry);
  const held = cpredRoleRanks(projected);
  const current = held[0] ?? null;

  const sameRow =
    (a: { kind: string; skillId?: string | null; roleId?: string | null }) =>
    (b: CpredAdvanceRequest) =>
      a.kind === b.kind &&
      (a.kind === 'skill'
        ? (a.skillId ?? null) === (b.skillId ?? null)
        : (a.roleId ?? null) === (b.roleId ?? null));

  function add(step: CpredAdvanceStep): void {
    setPending((list) => [
      ...list,
      {
        kind: step.kind,
        ...(step.skillId ? { skillId: step.skillId } : {}),
        ...(step.roleId ? { roleId: step.roleId } : {}),
        to: step.to,
      },
    ]);
  }

  function drop(step: CpredAdvanceStep): void {
    setPending((list) => {
      const match = sameRow(step);
      for (let index = list.length - 1; index >= 0; index -= 1) {
        if (match(list[index] as CpredAdvanceRequest)) {
          return [...list.slice(0, index), ...list.slice(index + 1)];
        }
      }
      return list;
    });
  }

  async function commit(): Promise<void> {
    setBusy(true);
    const ack = await advanceCharacter({ characterId, steps: pending });
    setBusy(false);
    if (!noteAck('character', ack, advanceErrorText)) return;
    setPending([]);
    // Rejestru nie odświeża się tutaj: zakup rusza kartę, a `savedAt` wyżej
    // czyta go za każdym razem, gdy karta się ruszy — jedną drogą dla wiersza
    // własnego i dla tego, który dopisał MG.
  }

  async function undo(entry: AdvancementEntryView): Promise<void> {
    setBusy(true);
    const ack = await undoAdvancement({ characterId, entryId: entry.id });
    setBusy(false);
    noteAck('character', ack, advanceErrorText);
  }

  function row(step: CpredAdvanceStep) {
    const short = points < step.cost;
    const queued = pending.filter(sameRow(step)).length;
    return (
      <li
        key={step.skillId ?? step.roleId ?? 'ability'}
        className={queued > 0 ? 'awareness-row advance-row--pending' : 'awareness-row'}
      >
        <span className="awareness-name" title={step.name}>
          {step.name}
          {step.doubled && (
            <span className="advance-x2" title="Umiejętność podwójna: szczebel kosztuje ×2">
              {' '}
              ×2
            </span>
          )}
          {queued > 0 && (
            <span
              className="advance-queued"
              title={`Do zatwierdzenia: ${step.from - queued} → ${step.from}`}
            >
              {' '}
              +{queued}
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
          {queued > 0 && (
            <button
              type="button"
              className="advance-buy"
              onClick={() => drop(step)}
              disabled={busy}
              title={`Wycofaj z koszyka: ${step.name} ${step.from} → ${step.from - 1}`}
              aria-label={`Wycofaj: ${step.name} z poziomu ${step.from}`}
            >
              −
            </button>
          )}
          <button
            type="button"
            className="advance-buy"
            onClick={() => add(step)}
            disabled={busy || short || locked}
            title={
              locked
                ? COMBAT_LOCKED_HINT
                : short
                  ? `Brakuje ${step.cost - points} PD`
                  : `Podnieś: ${step.name} na poziom ${step.to} za ${step.cost} PD (zostanie ${points - step.cost}) — wydasz przy „Zatwierdź zmiany”`
            }
            aria-label={`Podnieś: ${step.name} na poziom ${step.to}`}
          >
            Podnieś
          </button>
        </span>
      </li>
    );
  }

  // Ostatni wiersz rejestru u MG: czy „Cofnij” przejdzie, a jak nie — dlaczego.
  function undoButton(entry: AdvancementEntryView) {
    if (!isGm || entry.kind === 'undo' || entry.undone) return <span />;
    const ok = entry.undo === 'ok';
    return (
      <button
        type="button"
        className="advance-buy"
        onClick={() => void undo(entry)}
        disabled={busy || !ok}
        title={
          ok
            ? entry.kind === 'spend' || entry.kind === 'role'
              ? `Cofnij: ${entry.label} — poziom wraca, a do puli zwrot ${Math.abs(entry.amount)} PD`
              : `Cofnij: ${entry.label} — ${formatAdvancementAmount(-entry.amount)}`
            : entry.undo
              ? ADVANCEMENT_UNDO_PROBLEMS[entry.undo as AdvancementUndoProblem]
              : undefined
        }
        aria-label={`Cofnij wpis: ${entry.label}`}
      >
        ↶
      </button>
    );
  }

  const groups = groupedSkills(registry)
    .map((group) => ({
      ...group,
      steps: group.skills
        .map((skill) => cpredSkillAdvanceStep(projected, skill))
        .filter((step): step is CpredAdvanceStep => step !== null)
        .filter((step) => !affordableOnly || step.cost <= points || pending.some(sameRow(step))),
    }))
    .filter((group) => group.steps.length > 0);

  // Podsumowanie koszyka: jeden wpis na wiersz, od poziomu sprzed koszyka.
  const summary = basket.ok
    ? [
        ...basket.plans
          .reduce((rows, plan) => {
            const key = `${plan.kind}:${plan.skillId ?? plan.roleId ?? ''}`;
            const row = rows.get(key);
            rows.set(
              key,
              row ? { ...row, to: plan.to } : { name: plan.name, from: plan.from, to: plan.to },
            );
            return rows;
          }, new Map<string, { name: string; from: number; to: number }>())
          .values(),
      ]
    : [];

  return (
    <div className="awareness advance">
      <header className="awareness-head">
        <h4>Awans</h4>
        <p className={points === 0 ? 'awareness-left' : 'awareness-left awareness-left--empty'}>
          {pending.length > 0
            ? `${points} z ${available} PD po zmianach`
            : `${available} PD w zapasie`}
        </p>
      </header>
      {locked && (
        <p className="awareness-hint">W trakcie walki punktów się nie wydaje — awans po starciu.</p>
      )}

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

      <RoleChangeSection characterId={characterId} blocked={pending.length > 0} />

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

      {pending.length > 0 && (
        <div className="advance-basket">
          {basket.ok ? (
            <p className="advance-basket-what">
              {summary.map((entry) => `${entry.name} ${entry.from} → ${entry.to}`).join(', ')}
              {' · '}
              {formatAdvancementAmount(points - available)}
            </p>
          ) : (
            <p className="awareness-error">
              {advanceErrorText(basket.problem)} Karta zmieniła się w międzyczasie — odrzuć i
              wybierz od nowa.
            </p>
          )}
          <div className="awareness-buttons">
            <button
              type="button"
              className="small-button"
              onClick={() => void commit()}
              disabled={busy || locked || !basket.ok}
              title={locked ? COMBAT_LOCKED_HINT : `Wydaje ${available - points} PD na raz`}
            >
              Zatwierdź zmiany
            </button>
            <button
              type="button"
              className="small-button"
              onClick={() => setPending([])}
              disabled={busy}
            >
              Odrzuć
            </button>
          </div>
        </div>
      )}

      <p className="awareness-hint">
        Poziomu nie da się przeskoczyć — kolejny zawsze jest o jeden wyżej (s. 411). Ile PD dostaje
        drużyna po sesji, ustala MG.
      </p>

      <details
        className="awareness-extras"
        onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>Rejestr awansów</summary>
        {history === null ? (
          <p className="awareness-hint">Wczytuję…</p>
        ) : history.length === 0 ? (
          <p className="awareness-hint">Jeszcze nic tu nie stanęło.</p>
        ) : (
          <ul className={isGm ? 'advance-log advance-log--gm' : 'advance-log'}>
            {history.map((entry) => (
              <li key={entry.id} className={entry.undone ? 'advance-log--undone' : undefined}>
                <span className="advance-log-when">
                  {new Date(entry.createdAt).toLocaleDateString('pl-PL')}
                </span>
                <span
                  className="advance-log-what"
                  title={
                    entry.undone
                      ? `${ADVANCEMENT_KIND_LABELS[entry.kind]} — cofnięte przez MG`
                      : ADVANCEMENT_KIND_LABELS[entry.kind]
                  }
                >
                  {entry.label}
                </span>
                <span className="advance-log-amount">{formatAdvancementAmount(entry.amount)}</span>
                <span className="advance-log-left">{entry.balance} PD</span>
                {isGm && undoButton(entry)}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
