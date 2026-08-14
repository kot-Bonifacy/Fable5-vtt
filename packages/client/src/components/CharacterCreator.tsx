import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type {
  CampaignDetail,
  CpredCreationDraft,
  CpredSkillDefinition,
  CpredStatId,
} from '@vtt/shared';
import {
  CPRED_CREATION_METHODS,
  CPRED_CREATION_METHOD_LABELS,
  CPRED_CREATION_STEPS,
  CPRED_CREATION_STEP_LABELS,
  CPRED_STAT_IDS,
  CPRED_STAT_LABELS,
  ROLE_GM,
  creationAvailableSkills,
  creationDataOf,
  creationIssues,
  creationPreview,
  creationRole,
  creationSkillCost,
  creationSkillPointsSpent,
  creationStatPointsSpent,
  creationStatPool,
  creationStats,
  groupedSkills,
} from '@vtt/shared';
import { apiGet } from '../api.js';
import { creationErrorText, finishCreation, rollCreationStats } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { ensureCpredDataLoaded, useCharacterStore } from '../stores/characterStore.js';
import { enqueueCreationCall, useCreationStore } from '../stores/creationStore.js';

/**
 * The character creator (stage 25a) — a floating window in the same idiom as
 * the sheet, so the map stays visible and the day/night theme from 27a already
 * fits it.
 *
 * Four steps with free movement between them: Role, Stats, Skills, Summary.
 * Nothing here computes a rule on its own — the pools, the ceilings and the
 * list of what is still missing all come from `shared/systems/cpred/creation`,
 * which is the same code the server refuses with.
 */
export function CharacterCreator() {
  const open = useCreationStore((s) => s.open);
  if (!open) return null;
  return <CreatorWindow />;
}

function CreatorWindow() {
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const registry = useCharacterStore((s) => s.registry);
  const draft = useCreationStore((s) => s.draft);
  const error = useCreationStore((s) => s.error);
  const busy = useCreationStore((s) => s.busy);
  const patch = useCreationStore((s) => s.patch);
  const setDraft = useCreationStore((s) => s.setDraft);
  const setError = useCreationStore((s) => s.setError);
  const setBusy = useCreationStore((s) => s.setBusy);
  const closeCreator = useCreationStore((s) => s.closeCreator);
  const discard = useCreationStore((s) => s.discard);
  const openSheet = useCharacterStore((s) => s.openSheet);

  const [position, setPosition] = useState(() => ({ x: 120, y: 60 }));
  const [ownerId, setOwnerId] = useState('');
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  useEffect(() => {
    ensureCpredDataLoaded();
  }, []);

  useEffect(() => {
    if (!isGm) return;
    apiGet<CampaignDetail[]>('/api/campaigns')
      .then((campaigns) => {
        const active = campaigns.find((c) => c.active);
        setPlayers(active?.players.map((p) => ({ id: p.id, name: p.name })) ?? []);
      })
      .catch(() => setPlayers([]));
  }, [isGm]);

  const data = useMemo(() => creationDataOf(registry), [registry]);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button, input, select')) return;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: position.x,
      baseY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    setPosition({
      x: Math.max(0, Math.min(window.innerWidth - 160, drag.baseX + event.clientX - drag.startX)),
      y: Math.max(0, Math.min(window.innerHeight - 60, drag.baseY + event.clientY - drag.startY)),
    });
  }

  async function finish() {
    setBusy(true);
    setError(null);
    const ack = await enqueueCreationCall(() =>
      finishCreation(isGm ? { ownerId: ownerId === '' ? null : ownerId } : {}),
    );
    setBusy(false);
    if (!ack.ok || !ack.data) {
      setError(creationErrorText(ack.ok ? undefined : ack.error));
      return;
    }
    // The finished sheet opens straight away — the wizard's whole promise is
    // „skończone znaczy grywalne".
    openSheet(ack.data.id);
    closeCreator();
    setDraft(null);
  }

  const issues = draft ? creationIssues(draft, data, registry) : [];
  const stepIndex = draft ? CPRED_CREATION_STEPS.indexOf(draft.step) : 0;

  return (
    <section
      className="sheet-window creator-window"
      style={{ left: position.x, top: position.y, zIndex: 320 }}
      aria-label="Kreator postaci"
    >
      <div
        className="sheet-header"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => (dragRef.current = null)}
        onPointerCancel={() => (dragRef.current = null)}
      >
        <span className="sheet-title">
          <span className="sheet-title-name">Kreator postaci</span>
          {draft && (
            <span className="sheet-title-role">{CPRED_CREATION_METHOD_LABELS[draft.method]}</span>
          )}
        </span>
        <span className={`sheet-save sheet-save--${busy ? 'saving' : 'idle'}`}>
          {busy ? 'Zapisywanie…' : ''}
        </span>
        <button
          type="button"
          className="sheet-close"
          onClick={closeCreator}
          title="Schowaj kreator"
        >
          ✕
        </button>
      </div>

      {data.roles.length === 0 ? (
        <p className="creator-empty">
          Brak danych tworzenia postaci — kreator nie ma z czego czytać tabel Ról. Uruchom
          <code> tools/import/parse-creation.py</code>.
        </p>
      ) : !draft ? (
        <p className="creator-empty">Wczytuję szkic…</p>
      ) : (
        <>
          <nav className="sheet-tabs creator-steps">
            {CPRED_CREATION_STEPS.map((step, index) => (
              <button
                key={step}
                type="button"
                className={`sheet-tab ${draft.step === step ? 'sheet-tab--active' : ''}`}
                onClick={() => void patch({ step })}
              >
                <span className="creator-step-number">{index + 1}</span>
                {CPRED_CREATION_STEP_LABELS[step]}
              </button>
            ))}
          </nav>

          <div className="sheet-body creator-body">
            {draft.step === 'role' && <RoleStep draft={draft} />}
            {draft.step === 'stats' && <StatsStep draft={draft} />}
            {draft.step === 'skills' && <SkillsStep draft={draft} />}
            {draft.step === 'summary' && (
              <SummaryStep
                draft={draft}
                isGm={isGm}
                players={players}
                ownerId={ownerId}
                onOwnerChange={setOwnerId}
              />
            )}
          </div>

          <footer className="creator-footer">
            <button
              type="button"
              className="small-button"
              disabled={stepIndex === 0}
              onClick={() => void patch({ step: CPRED_CREATION_STEPS[stepIndex - 1] })}
            >
              ← Wstecz
            </button>
            <span className="creator-issues-count">
              {issues.length === 0
                ? 'Postać gotowa'
                : `${issues.length} ${issues.length === 1 ? 'brak' : 'braków'} do uzupełnienia`}
            </span>
            {draft.step === 'summary' ? (
              <button
                type="button"
                className="small-button small-button--primary"
                disabled={busy || issues.length > 0}
                onClick={() => void finish()}
              >
                Utwórz postać
              </button>
            ) : (
              <button
                type="button"
                className="small-button"
                onClick={() => void patch({ step: CPRED_CREATION_STEPS[stepIndex + 1] })}
              >
                Dalej →
              </button>
            )}
            <button
              type="button"
              className="small-button small-button--danger"
              onClick={() => {
                if (window.confirm('Wyrzucić szkic postaci? Tego nie da się cofnąć.')) {
                  void discard();
                }
              }}
              title="Kasuje szkic razem z tym, co już wybrano"
            >
              🗑 Wyrzuć szkic
            </button>
          </footer>

          {error && <p className="auth-error creator-error">{error}</p>}
          {/* The list is the wizard's honest answer to „czemu nie mogę kliknąć
              »Utwórz«" — the same list the server refuses with. */}
          {draft.step === 'summary' && issues.length > 0 && (
            <ul className="creator-issues">
              {issues.map((issue) => (
                <li key={`${issue.field}:${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

// ─────────────────────────────── krok 1: Rola ───────────────────────────────

function RoleStep({ draft }: { draft: CpredCreationDraft }) {
  const registry = useCharacterStore((s) => s.registry);
  const patch = useCreationStore((s) => s.patch);
  const data = creationDataOf(registry);

  return (
    <div className="creator-step">
      <fieldset className="creator-methods">
        <legend>Metoda tworzenia</legend>
        {CPRED_CREATION_METHODS.map((method) => (
          <label key={method} className="creator-method">
            <input
              type="radio"
              name="creation-method"
              checked={draft.method === method}
              onChange={() => void patch({ method })}
            />
            <span>
              <strong>{CPRED_CREATION_METHOD_LABELS[method]}</strong>
              <span className="creator-method-note">
                {method === 'edgerunner'
                  ? `1k10 na każdą Cechę z szablonu Roli · ${data.skillPoints} pkt na 20 umiejętności Roli`
                  : `pula punktów na Cechy · ${data.skillPoints} pkt na dowolne umiejętności`}
              </span>
            </span>
          </label>
        ))}
        {/* Changing the method throws the stats away, so say it before the click. */}
        <p className="creator-hint">
          Zmiana metody albo Roli kasuje ustalone Cechy — szablon Roli jest inny dla każdej.
        </p>
      </fieldset>

      <div className="creator-roles">
        {data.roles.map((role) => {
          const definition = registry.roles.find((entry) => entry.id === role.id);
          const chosen = draft.roleId === role.id;
          return (
            <button
              key={role.id}
              type="button"
              className={`creator-role ${chosen ? 'creator-role--chosen' : ''}`}
              onClick={() => void patch({ roleId: role.id })}
            >
              <strong>{definition?.name ?? role.id}</strong>
              <span className="creator-role-ability">
                {definition?.ability ?? '—'} · {data.roleAbilityStart}
              </span>
              <span className="creator-role-skills">{role.skills.length} umiejętności</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────── krok 2: Cechy ───────────────────────────────

function StatsStep({ draft }: { draft: CpredCreationDraft }) {
  const registry = useCharacterStore((s) => s.registry);
  const patch = useCreationStore((s) => s.patch);
  const busy = useCreationStore((s) => s.busy);
  const setDraft = useCreationStore((s) => s.setDraft);
  const setError = useCreationStore((s) => s.setError);
  const setBusy = useCreationStore((s) => s.setBusy);
  const data = creationDataOf(registry);
  const role = creationRole(data, draft.roleId);

  const preview = creationPreview(creationStats(draft, data));
  const pool = creationStatPool(data, draft);
  const spent = creationStatPointsSpent(draft);

  async function roll() {
    setBusy(true);
    setError(null);
    const ack = await enqueueCreationCall(() => rollCreationStats());
    setBusy(false);
    if (!ack.ok || !ack.data) {
      setError(creationErrorText(ack.ok ? undefined : ack.error));
      return;
    }
    setDraft(ack.data.draft);
  }

  if (role === null) {
    return (
      <p className="creator-empty">Najpierw wybierz Rolę — bez niej nie ma z czego losować.</p>
    );
  }

  return (
    <div className="creator-step">
      <div className="creator-stats-head">
        {draft.method === 'edgerunner' ? (
          <>
            <button
              type="button"
              className="small-button small-button--primary"
              disabled={busy}
              onClick={() => void roll()}
            >
              🎲 Rzuć Cechy (10 × 1k10)
            </button>
            <span className="creator-hint">
              Rzuca serwer i zostawia kartę na czacie. Można rzucać ponownie — liczy się ostatni
              rzut.
            </span>
          </>
        ) : (
          <>
            <label className="creator-rank">
              Ranga Postaci
              <select
                value={draft.statRankId}
                onChange={(e) => void patch({ statRankId: e.target.value })}
              >
                {data.statRanks.map((rank) => (
                  <option key={rank.id} value={rank.id}>
                    {rank.name} — {rank.points} pkt
                  </option>
                ))}
              </select>
            </label>
            <span className={`creator-pool ${spent > pool ? 'creator-pool--over' : ''}`}>
              Punkty Cech: {spent} z {pool}
            </span>
          </>
        )}
      </div>

      <table className="creator-stats">
        <tbody>
          {CPRED_STAT_IDS.map((id) => (
            <StatRow key={id} statId={id} draft={draft} />
          ))}
        </tbody>
      </table>

      <dl className="creator-derived">
        <div>
          <dt>Punkty Wytrzymałości</dt>
          <dd>{preview.hpMax}</dd>
        </div>
        <div>
          <dt>Poważnie Ranny</dt>
          <dd>{preview.seriousWound}</dd>
        </div>
        <div>
          <dt>Przeżywalność</dt>
          <dd>{preview.deathSave}</dd>
        </div>
        <div>
          <dt>Człowieczeństwo</dt>
          <dd>{preview.humanity}</dd>
        </div>
      </dl>
    </div>
  );
}

function StatRow({ statId, draft }: { statId: CpredStatId; draft: CpredCreationDraft }) {
  const registry = useCharacterStore((s) => s.registry);
  const patch = useCreationStore((s) => s.patch);
  const data = creationDataOf(registry);
  const label = CPRED_STAT_LABELS[statId];
  const value = draft.stats[statId];
  const roll = draft.statRolls[statId];

  return (
    <tr>
      <th scope="row">
        <span className="creator-stat-abbr">{label.abbr}</span>
        <span className="creator-stat-name">{label.name}</span>
      </th>
      <td className="creator-stat-value">
        {draft.method === 'complete' ? (
          <input
            type="number"
            min={data.limits.statMin}
            max={data.limits.statMax}
            value={value ?? ''}
            placeholder="—"
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isInteger(next)) return;
              if (next < data.limits.statMin || next > data.limits.statMax) return;
              void patch({ stats: { ...draft.stats, [statId]: next } });
            }}
          />
        ) : (
          <strong>{value ?? '—'}</strong>
        )}
      </td>
      <td className="creator-stat-roll">{roll !== undefined ? `rzut ${roll}` : ''}</td>
    </tr>
  );
}

// ──────────────────────────── krok 3: Umiejętności ────────────────────────────

function SkillsStep({ draft }: { draft: CpredCreationDraft }) {
  const registry = useCharacterStore((s) => s.registry);
  const data = creationDataOf(registry);
  const available = useMemo(
    () => new Set(creationAvailableSkills(draft, data, registry)),
    [draft, data, registry],
  );
  const groups = useMemo(
    () =>
      groupedSkills(registry)
        .map((group) => ({ ...group, skills: group.skills.filter((s) => available.has(s.id)) }))
        .filter((group) => group.skills.length > 0),
    [registry, available],
  );
  const spent = creationSkillPointsSpent(draft, data, registry);

  return (
    <div className="creator-step">
      <div className="creator-stats-head">
        <span className={`creator-pool ${spent > data.skillPoints ? 'creator-pool--over' : ''}`}>
          Punkty umiejętności: {spent} z {data.skillPoints}
        </span>
        <span className="creator-hint">
          Podstawowe co najmniej {data.limits.skillMin}, każda najwyżej {data.limits.skillMax}.
          Umiejętności oznaczone ×2 kosztują dwa punkty za poziom.
        </span>
      </div>

      {groups.map((group) => (
        <section key={group.id} className="creator-skill-group">
          <h4>{group.label}</h4>
          <ul>
            {group.skills.map((skill) => (
              <SkillRow key={skill.id} skill={skill} draft={draft} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SkillRow({ skill, draft }: { skill: CpredSkillDefinition; draft: CpredCreationDraft }) {
  const registry = useCharacterStore((s) => s.registry);
  const patch = useCreationStore((s) => s.patch);
  const data = creationDataOf(registry);
  const level = draft.skills[skill.id] ?? 0;
  const isBasic = data.basicSkills.includes(skill.id);
  const isFree = data.freeLanguage?.skillId === skill.id;
  const ceiling = isFree ? data.freeLanguage!.level : data.limits.skillMax;

  function setLevel(next: number) {
    if (next < 0 || next > ceiling) return;
    void patch({ skills: { ...draft.skills, [skill.id]: next } });
  }

  return (
    <li className={`creator-skill ${isBasic ? 'creator-skill--basic' : ''}`}>
      <span className="creator-skill-name">
        {skill.name}
        {skill.multiplier === 2 && <span className="creator-skill-x2">×2</span>}
        {isBasic && (
          <span className="creator-skill-basic-mark" title="Umiejętność podstawowa">
            •
          </span>
        )}
      </span>
      <span className="creator-skill-stat">{CPRED_STAT_LABELS[skill.stat].abbr}</span>
      <span className="creator-skill-controls">
        <button type="button" className="small-button" onClick={() => setLevel(level - 1)}>
          −
        </button>
        <strong className={level === 0 ? 'creator-skill-level--zero' : ''}>{level}</strong>
        <button type="button" className="small-button" onClick={() => setLevel(level + 1)}>
          +
        </button>
      </span>
      <span className="creator-skill-cost">
        {creationSkillCost(skill.id, level, data, registry)} pkt
      </span>
    </li>
  );
}

// ───────────────────────── krok 4: Podsumowanie ─────────────────────────

function SummaryStep({
  draft,
  isGm,
  players,
  ownerId,
  onOwnerChange,
}: {
  draft: CpredCreationDraft;
  isGm: boolean;
  players: { id: string; name: string }[];
  ownerId: string;
  onOwnerChange: (value: string) => void;
}) {
  const registry = useCharacterStore((s) => s.registry);
  const patch = useCreationStore((s) => s.patch);
  const data = creationDataOf(registry);
  const role = registry.roles.find((entry) => entry.id === draft.roleId);
  const preview = creationPreview(creationStats(draft, data));
  const [name, setName] = useState(draft.name);
  const taken = Object.entries(draft.skills).filter(([, level]) => level > 0);

  return (
    <div className="creator-step creator-summary">
      <label className="creator-name">
        Imię postaci
        {/* Sent on every keystroke, like the sheet saves. Saving on blur alone
            cost „Utwórz postać" a click: the button is disabled until the name
            reaches the server, so the press that blurred the field found it
            still greyed out and did nothing. The raw value goes out (the space
            in a two-word ksywa has to survive — that was the 13.08 bug), and
            the server trims when it writes the character. */}
        <input
          type="text"
          maxLength={64}
          value={name}
          placeholder="Ksywa na Ulicy"
          onChange={(e) => {
            setName(e.target.value);
            void patch({ name: e.target.value });
          }}
        />
      </label>

      {isGm && (
        <label className="creator-name">
          Właściciel
          <select value={ownerId} onChange={(e) => onOwnerChange(e.target.value)}>
            <option value="">NPC (MG)</option>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <dl className="creator-derived">
        <div>
          <dt>Rola</dt>
          <dd>{role?.name ?? '—'}</dd>
        </div>
        <div>
          <dt>Zdolność Specjalna</dt>
          <dd>
            {role?.ability ?? '—'} {role ? data.roleAbilityStart : ''}
          </dd>
        </div>
        <div>
          <dt>Punkty Wytrzymałości</dt>
          <dd>{preview.hpMax}</dd>
        </div>
        <div>
          <dt>Człowieczeństwo</dt>
          <dd>{preview.humanity}</dd>
        </div>
      </dl>

      <p className="creator-hint">
        Cechy:{' '}
        {CPRED_STAT_IDS.map((id) => `${CPRED_STAT_LABELS[id].abbr} ${draft.stats[id] ?? '—'}`).join(
          ' · ',
        )}
      </p>
      <p className="creator-hint">
        Umiejętności ({taken.length}):{' '}
        {taken
          .map(([id, level]) => `${registry.skills.find((s) => s.id === id)?.name ?? id} ${level}`)
          .join(' · ') || 'żadnej'}
      </p>
      {data.freeLanguage && (
        <p className="creator-hint">
          Język kultury pochodzenia wchodzi za darmo na poziomie {data.freeLanguage.level} — którym
          językiem jest, ustala Ścieżka Życia (etap 25b).
        </p>
      )}
    </div>
  );
}
