import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import type {
  CampaignDetail,
  CompendiumCategory,
  CompendiumEntry,
  CpredCreationDraft,
  CpredLifepath,
  CpredLifepathBotKind,
  CpredLifepathGroup,
  CpredLifepathTable,
  CpredSkillDefinition,
  CpredStatId,
  PortraitUploadResult,
} from '@vtt/shared';
import {
  CPRED_CREATION_METHODS,
  CPRED_CREATION_METHOD_LABELS,
  CPRED_CREATION_STEPS,
  CPRED_CREATION_STEP_LABELS,
  CPRED_STAT_IDS,
  CPRED_STAT_LABELS,
  CREATION_SHOP_TIER,
  LIFEPATH_FIELD_TABLES,
  LIFEPATH_GROUP_LABELS,
  LIFEPATH_GROUP_MAX,
  ROLE_GM,
  SHOP_TIER_LABELS,
  creationAvailableSkills,
  creationBudget,
  creationDataOf,
  creationIssues,
  creationPreview,
  creationPurchases,
  creationRole,
  creationSkillCost,
  creationSkillPointsSpent,
  creationStatPointsSpent,
  creationStatPool,
  creationSpentEddies,
  creationStats,
  emptyLifepathEnemy,
  emptyLifepathPerson,
  entryPrice,
  entryWithinTier,
  formatEddies,
  groupedSkills,
  isLifepathFieldTable,
  lifepathBotDraft,
  lifepathDataOf,
  lifepathMissing,
  lifepathRoleTables,
  lifepathRollLabel,
  searchCompendium,
} from '@vtt/shared';
import { ApiError, apiGet, apiUpload } from '../api.js';
import { botErrorText, createBot, creationErrorText, finishCreation } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useBotStore } from '../stores/botStore.js';
import { ensureCpredDataLoaded, useCharacterStore } from '../stores/characterStore.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import {
  buyCreationEntry,
  clearCreationCup,
  enqueueCreationCall,
  loadCreationCup,
  rollCreationWithGesture,
  rollLifepathCount,
  rollLifepathTables,
  useCreationStore,
} from '../stores/creationStore.js';
import { useRollStore } from '../stores/rollStore.js';

/** Same wording as the sheet's own portrait upload (stage 07). */
function portraitErrorText(error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'UNKNOWN';
  switch (code) {
    case 'FILE_TOO_LARGE':
      return 'Plik jest za duży (limit 8 MB).';
    case 'UNSUPPORTED_IMAGE':
      return 'Nieobsługiwany format — użyj PNG, JPG lub WebP.';
    case 'IMAGE_TOO_LARGE':
      return 'Obraz jest za duży (maks. 2048 px na bok).';
    default:
      return 'Nie udało się wgrać portretu.';
  }
}

/**
 * The character creator (stage 25a) — a floating window in the same idiom as
 * the sheet, so the map stays visible and the day/night theme from 27a already
 * fits it.
 *
 * Seven steps with free movement between them: Role, Stats, Skills, Lifepath
 * (stage 25b), Gear, Description and Summary (stage 25c). Nothing here computes
 * a rule on its own — the pools, the ceilings, the Lifepath tables, the prices
 * and the list of what is still missing all come from `shared/systems/cpred`,
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

  // The catalogue goes in so the wizard can price the basket: without it the
  // list of what is missing would quietly skip „wydane 3000 z 2550 ed".
  const entriesById = useCompendiumStore((s) => s.entries);
  const issues = draft
    ? creationIssues(draft, data, registry, (entryId: string) => entriesById[entryId])
    : [];
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
            {draft.step === 'lifepath' && <LifepathStep draft={draft} />}
            {draft.step === 'gear' && <GearStep draft={draft} />}
            {draft.step === 'details' && <DetailsStep draft={draft} />}
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
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const registry = useCharacterStore((s) => s.registry);
  const patch = useCreationStore((s) => s.patch);
  const busy = useCreationStore((s) => s.busy);
  const inCup = useRollStore((s) => s.creation !== null);
  const data = creationDataOf(registry);
  const role = creationRole(data, draft.roleId);
  const roleName = registry.roles.find((entry) => entry.id === draft.roleId)?.name ?? '';

  const preview = creationPreview(creationStats(draft, data));
  const pool = creationStatPool(data, draft);
  const spent = creationStatPointsSpent(draft);

  const rollable = role !== null && draft.method === 'edgerunner' && role.statTemplates.length > 0;

  // The cup may only hold a spread it can still throw. Switching to Kompletny
  // Pakiet, or backing out of the Role, has to put it down.
  useEffect(() => {
    if (!rollable) clearCreationCup();
    return clearCreationCup;
  }, [rollable]);

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
            {/* The spread goes through the cup, like every other roll at this
                table: shaking it is what a player came here for, and the shake
                really seeds the server's dice. The GM keeps a plain button as
                well — five NPCs in an evening is not a ceremony. */}
            <button
              type="button"
              className={`small-button ${inCup ? '' : 'small-button--primary'}`}
              disabled={busy}
              onClick={() =>
                inCup
                  ? clearCreationCup()
                  : loadCreationCup(`Rozkład Cech${roleName ? ` — ${roleName}` : ''}`)
              }
            >
              {inCup ? '↩ Odłóż kubek' : '🥤 Weź kubek i rzuć Cechy'}
            </button>
            {isGm && (
              <button
                type="button"
                className="small-button"
                disabled={busy}
                onClick={() => void rollCreationWithGesture()}
                title="Skrót dla MG: rzuca bez potrząsania kubkiem"
              >
                🎲 Rzuć od razu
              </button>
            )}
            <span className="creator-hint">
              {inCup
                ? 'Kubek czeka w rogu ekranu — złap go, potrząśnij i puść. Esc odkłada.'
                : 'Rzuca serwer i zostawia kartę na czacie. Można rzucać ponownie — liczy się ostatni rzut.'}
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

// ───────────────────────── krok 4: Ścieżka Życia ─────────────────────────

/**
 * The Lifepath step (stage 25b).
 *
 * Every row is „wylosuj albo wybierz" — the two the book offers, side by side,
 * and never one without the other: „Jeśli wylosujesz coś, co nie pasuje do
 * twojej wizji Postaci, odpowiednio zmień wynik" (s. 44). The dice always
 * belong to the server; the picker writes straight into the draft.
 *
 * The step is **not** required to finish the character. That is the book's own
 * position on the chapter (a set of prompts, not a rule), and it keeps the GM's
 * five-NPCs-an-evening path as short as it was in 25a.
 */
function LifepathStep({ draft }: { draft: CpredCreationDraft }) {
  const registry = useCharacterStore((s) => s.registry);
  const data = useMemo(() => lifepathDataOf(registry), [registry]);
  const roleTables = useMemo(() => lifepathRoleTables(data, draft.roleId), [data, draft.roleId]);
  const roleName = registry.roles.find((entry) => entry.id === draft.roleId)?.name ?? '';

  if (data.general.length === 0) {
    return (
      <p className="creator-empty">
        Brak danych Ścieżki Życia — kreator nie ma z czego czytać tabel. Uruchom
        <code> tools/import/parse-lifepath.py</code>.
      </p>
    );
  }

  const fieldTables = data.general.filter((table) => isLifepathFieldTable(table.id));
  const missing = lifepathMissing(draft.lifepath, data, draft.roleId);
  // One throw for the whole path: fourteen questions, fourteen dice, one card.
  const everything = [...fieldTables, ...roleTables].map((table) => table.id);

  return (
    <div className="creator-step">
      <div className="creator-stats-head">
        <button
          type="button"
          className="small-button small-button--primary"
          disabled={everything.length === 0}
          onClick={() => void rollLifepathTables(everything)}
        >
          🎲 Rzuć całą Ścieżkę
        </button>
        <span className={`creator-pool ${missing > 0 ? '' : 'creator-pool--done'}`}>
          {missing === 0 ? 'Ścieżka wypełniona' : `${missing} bez odpowiedzi`}
        </span>
        <span className="creator-hint">
          Rzuca serwer i zostawia kartę na czacie. Każdy wynik można zmienić ręcznie — tak mówi
          podręcznik.
        </span>
      </div>

      <section className="creator-lifepath-group">
        <h4>Kim jesteś</h4>
        {fieldTables.map((table) => (
          <LifepathFieldRow key={table.id} draft={draft} table={table} />
        ))}
      </section>

      <LifepathPeople draft={draft} group="friends" tables={data.general} />
      <LifepathPeople draft={draft} group="enemies" tables={data.general} />
      <LifepathPeople draft={draft} group="tragicLoves" tables={data.general} />

      {roleTables.length > 0 && (
        <section className="creator-lifepath-group">
          <h4>Ścieżka Życia Roli{roleName ? ` — ${roleName}` : ''}</h4>
          {roleTables.map((table) => (
            <LifepathFieldRow key={table.id} draft={draft} table={table} />
          ))}
        </section>
      )}
      {draft.roleId === null && (
        <p className="creator-hint">
          Ścieżka Życia Roli pojawi się po wybraniu Roli w kroku pierwszym.
        </p>
      )}
    </div>
  );
}

/** Writes a whole Lifepath back to the server; every edit goes through here. */
function useLifepathPatch() {
  const patch = useCreationStore((s) => s.patch);
  return (lifepath: CpredLifepath) => void patch({ lifepath });
}

/**
 * A line of Lifepath prose — a friend's name, an answer written by hand.
 *
 * It keeps what is being typed locally and sends it on blur, and that is not a
 * nicety. Every patch replaces the whole Lifepath and is built from the draft
 * the server last returned, so a field that saved on each keystroke would build
 * the second letter's patch on top of the state from before the first — typing
 * „Stary Vex" into an enemy left „x" behind. The sheet gets away with
 * per-keystroke saves because it patches one field at a time; this does not.
 */
function LifepathTextInput({
  value,
  placeholder,
  className,
  autoFocus,
  onCommit,
  onDone,
}: {
  value: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onCommit: (next: string) => void;
  onDone?: () => void;
}) {
  const [local, setLocal] = useState(value);
  // A roll elsewhere brings a fresh draft back; nothing is in flight for this
  // field at that moment, so following it is safe and keeps re-rolls visible.
  useEffect(() => setLocal(value), [value]);

  return (
    <input
      className={className}
      type="text"
      autoFocus={autoFocus}
      value={local}
      placeholder={placeholder}
      onChange={(event) => setLocal(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      onBlur={() => {
        if (local !== value) onCommit(local);
        onDone?.();
      }}
    />
  );
}

/** The value a table currently holds on the draft, whatever kind of table it is. */
function lifepathValue(lifepath: CpredLifepath, table: CpredLifepathTable): string {
  if (isLifepathFieldTable(table.id)) return lifepath[LIFEPATH_FIELD_TABLES[table.id]];
  return lifepath.roleAnswers.find((answer) => answer.id === table.id)?.answer ?? '';
}

/**
 * One question: what it says now, a picker holding the table, and a die.
 *
 * The picker keeps an extra row for a value that is not in the table — an
 * answer typed by hand, or one left over from an older import — so choosing
 * nothing never silently rewrites what the player wrote.
 */
function LifepathFieldRow({
  draft,
  table,
}: {
  draft: CpredCreationDraft;
  table: CpredLifepathTable;
}) {
  const write = useLifepathPatch();
  const [typing, setTyping] = useState(false);
  const value = lifepathValue(draft.lifepath, table);
  const known = table.entries.some((entry) => entry.text === value);
  const entry = table.entries.find((row) => row.text === value);

  function set(next: string) {
    const lifepath = { ...draft.lifepath };
    if (isLifepathFieldTable(table.id)) {
      lifepath[LIFEPATH_FIELD_TABLES[table.id]] = next;
      // A new Culture means a new shortlist of languages; the old pick is a lie.
      if (table.id === 'culture') lifepath.language = '';
    } else {
      const answers = [...lifepath.roleAnswers];
      const at = answers.findIndex((answer) => answer.id === table.id);
      const row = { id: table.id, question: table.question ?? table.label, answer: next };
      if (at === -1) answers.push(row);
      else answers[at] = row;
      lifepath.roleAnswers = answers;
    }
    write(lifepath);
  }

  return (
    <>
      <div className="creator-lifepath-row">
        <span className="creator-lifepath-label" title={table.question ?? table.label}>
          {table.label}
        </span>
        {typing ? (
          <LifepathTextInput
            className="creator-lifepath-input"
            autoFocus
            value={value}
            placeholder="Własnymi słowami…"
            onCommit={set}
            onDone={() => setTyping(false)}
          />
        ) : (
          <select
            className="creator-lifepath-select"
            value={known ? value : ''}
            onChange={(e) => set(e.target.value)}
          >
            <option value="">{value && !known ? value : '— nie wybrano —'}</option>
            {table.entries.map((row) => (
              <option key={row.roll} value={row.text}>
                {lifepathRollLabel(row)} · {row.text}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="small-button"
          title="Wpisz własnymi słowami"
          onClick={() => setTyping((on) => !on)}
        >
          ✎
        </button>
        <button
          type="button"
          className="small-button"
          title={`Rzuć 1k${table.sides}`}
          onClick={() => void rollLifepathTables([table.id])}
        >
          🎲
        </button>
      </div>
      {/* „Tło rodzinne" prints a paragraph beside the answer; it is the half of
          that table a player actually reads back at the session. */}
      {entry?.detail && <p className="creator-lifepath-detail">{entry.detail}</p>}
      {table.id === 'culture' && <LifepathLanguageRow draft={draft} table={table} />}
    </>
  );
}

/**
 * „Język ten traktuje się jak Umiejętność i jego początkowy poziom wynosi 4"
 * (s. 45). Stage 25a granted the level and had nowhere to write the name — this
 * row is that place, and it is why the Lifepath sits in the creator rather than
 * only on the sheet.
 */
function LifepathLanguageRow({
  draft,
  table,
}: {
  draft: CpredCreationDraft;
  table: CpredLifepathTable;
}) {
  const write = useLifepathPatch();
  const entry = table.entries.find((row) => row.text === draft.lifepath.culture);
  const options = entry?.options ?? [];

  return (
    <div className="creator-lifepath-row creator-lifepath-row--sub">
      <span className="creator-lifepath-label">Język ojczysty</span>
      {options.length > 0 ? (
        <select
          className="creator-lifepath-select"
          value={draft.lifepath.language}
          onChange={(e) => write({ ...draft.lifepath, language: e.target.value })}
        >
          <option value="">— nie wybrano —</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <LifepathTextInput
          className="creator-lifepath-input"
          value={draft.lifepath.language}
          placeholder={
            draft.lifepath.culture ? 'Wpisz język' : 'Najpierw ustal kulturę pochodzenia'
          }
          onCommit={(next) => write({ ...draft.lifepath, language: next })}
        />
      )}
      <span className="creator-lifepath-note">poziom 4, za darmo</span>
    </div>
  );
}

/** Which kind of NPC each rolled list turns into (stage 10 bot profiles). */
const BOT_KINDS: Record<CpredLifepathGroup, CpredLifepathBotKind> = {
  friends: 'friend',
  enemies: 'enemy',
  tragicLoves: 'love',
};

/** Table ids that fill a cell of one of the three rolled lists. */
const GROUP_COLUMNS: Record<CpredLifepathGroup, { tableId: string; field: string }[]> = {
  friends: [{ tableId: 'friend', field: 'note' }],
  enemies: [
    { tableId: 'enemyWho', field: 'who' },
    { tableId: 'enemyCause', field: 'cause' },
    { tableId: 'enemyResources', field: 'resources' },
    { tableId: 'revenge', field: 'revenge' },
  ],
  tragicLoves: [{ tableId: 'tragicLove', field: 'note' }],
};

/**
 * Friends, enemies and tragic loves: a list whose *length* is rolled („1k10 − 7,
 * minimum 0"), then one throw per column per row.
 *
 * The names are always typed. No table in the book names anybody — that is the
 * table's job, and the sheet is where the name has to survive.
 */
function LifepathPeople({
  draft,
  group,
  tables,
}: {
  draft: CpredCreationDraft;
  group: CpredLifepathGroup;
  tables: CpredLifepathTable[];
}) {
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const setError = useCreationStore((s) => s.setError);
  const write = useLifepathPatch();
  const botKind = BOT_KINDS[group];
  // Its own flag rather than the window's `busy`: naming somebody and pressing
  // 🤖 straight after put a patch in flight, and a button greyed out by `busy`
  // simply swallowed the click. Everything here is queued anyway — the only
  // thing worth blocking is a second bot for the same person.
  const [makingBot, setMakingBot] = useState(false);

  /**
   * Somebody the Lifepath invented becomes a bot profile in one click.
   *
   * The whole point is that the enemy already exists — a reason and a grudge
   * were rolled at session zero — and retyping that into the bot editor by hand
   * is the step at which most of these NPCs quietly stop existing. GM only,
   * because `bot:create` is; a player's enemy is the GM's to bring to life.
   */
  async function toBot(index: number) {
    // The profile is built *inside* the queued call, from the store rather than
    // from this render's props. Typing a name and clicking 🤖 straight after
    // leaves the name's patch still in flight: the queue has already applied it
    // by the time this runs, and the props have not caught up. Reading them
    // here named the bot „Wróg — Kanciarz" instead of „Radna Okoye".
    setMakingBot(true);
    const ack = await enqueueCreationCall(() => {
      const current = useCreationStore.getState().draft;
      const person = current?.lifepath[group][index];
      if (!person) return Promise.resolve({ ok: false as const, error: 'DRAFT_NOT_FOUND' });
      const seed = lifepathBotDraft(botKind, person, current.name);
      return createBot({ name: seed.name, data: seed.data });
    });
    setMakingBot(false);
    if (!ack.ok || !ack.data) {
      setError(botErrorText(ack.ok ? 'INVALID_DATA' : ack.error));
      return;
    }
    useBotStore.getState().openEditor(ack.data.id);
  }
  const columns = GROUP_COLUMNS[group].filter((column) =>
    tables.some((table) => table.id === column.tableId),
  );
  const rows = draft.lifepath[group];

  function add() {
    const lifepath = { ...draft.lifepath };
    const at = rows.length + 1;
    if (group === 'enemies') {
      lifepath.enemies = [...lifepath.enemies, emptyLifepathEnemy(`enemy${at}`)];
    } else {
      const prefix = group === 'friends' ? 'friend' : 'love';
      lifepath[group] = [...lifepath[group], emptyLifepathPerson(`${prefix}${at}`)];
    }
    write(lifepath);
  }

  function remove(index: number) {
    const lifepath = { ...draft.lifepath };
    if (group === 'enemies') lifepath.enemies = lifepath.enemies.filter((_, i) => i !== index);
    else lifepath[group] = lifepath[group].filter((_, i) => i !== index);
    write(lifepath);
  }

  function edit(index: number, field: string, value: string) {
    const lifepath = { ...draft.lifepath };
    if (group === 'enemies') {
      lifepath.enemies = lifepath.enemies.map((row, i) =>
        i === index ? { ...row, [field]: value } : row,
      );
    } else {
      lifepath[group] = lifepath[group].map((row, i) =>
        i === index ? { ...row, [field]: value } : row,
      );
    }
    write(lifepath);
  }

  return (
    <section className="creator-lifepath-group">
      <h4>
        {LIFEPATH_GROUP_LABELS[group]}
        <span className="creator-lifepath-count">{rows.length}</span>
        <button
          type="button"
          className="small-button"
          title="Rzuć 1k10 − 7 (minimum 0)"
          onClick={() => void rollLifepathCount(group)}
        >
          🎲 ilu
        </button>
        <button
          type="button"
          className="small-button"
          disabled={rows.length >= LIFEPATH_GROUP_MAX}
          onClick={add}
        >
          + dopisz
        </button>
      </h4>
      {rows.length === 0 && <p className="creator-hint">Na razie nikogo.</p>}
      {rows.map((row, index) => (
        <div key={row.id} className="creator-lifepath-person">
          <LifepathTextInput
            className="creator-lifepath-input creator-lifepath-input--name"
            value={row.name}
            placeholder={group === 'enemies' ? 'Kto to jest?' : 'Imię'}
            onCommit={(next) => edit(index, 'name', next)}
          />
          {columns.map((column) => {
            const table = tables.find((entry) => entry.id === column.tableId);
            if (!table) return null;
            const value = (row as unknown as Record<string, string>)[column.field] ?? '';
            const known = table.entries.some((entry) => entry.text === value);
            return (
              <span key={column.tableId} className="creator-lifepath-cell">
                <select
                  className="creator-lifepath-select"
                  title={table.label}
                  value={known ? value : ''}
                  onChange={(e) => edit(index, column.field, e.target.value)}
                >
                  <option value="">{value && !known ? value : `— ${table.label} —`}</option>
                  {table.entries.map((entry) => (
                    <option key={entry.roll} value={entry.text}>
                      {lifepathRollLabel(entry)} · {entry.text}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="small-button"
                  title={`Rzuć: ${table.label}`}
                  onClick={() => void rollLifepathTables([table.id], index)}
                >
                  🎲
                </button>
              </span>
            );
          })}
          {isGm && (
            <button
              type="button"
              className="small-button"
              disabled={makingBot}
              title="Zrób z tego szkic bota i otwórz edytor"
              onClick={() => void toBot(index)}
            >
              🤖
            </button>
          )}
          <button
            type="button"
            className="small-button small-button--danger"
            title="Usuń"
            onClick={() => remove(index)}
          >
            🗑
          </button>
        </div>
      ))}
    </section>
  );
}

// ───────────────────────── krok 5: Wyposażenie ─────────────────────────

/** The three catalogue shelves a starting character can carry off. */
const CREATOR_SHELVES: { id: CompendiumCategory; label: string }[] = [
  { id: 'weapon', label: 'Broń' },
  { id: 'armor', label: 'Pancerz' },
  { id: 'gear', label: 'Sprzęt' },
];

/**
 * Starting purchases (stage 25c).
 *
 * The shop is the catalogue of stage 13 and the money is the rulebook's
 * (500 ed for a Krawędziarz, 2550 for a Kompletny Pakiet) — but the shelf is
 * held to availability level 1, which is the GM's wish for session zero: a
 * fresh character buys what any kiosk sells, not what a Fixer keeps in the back.
 * Everything above that level is simply not on this list; the whole catalogue
 * with its greyed-out rows is one tab away in „Kompendium".
 */
function GearStep({ draft }: { draft: CpredCreationDraft }) {
  const registry = useCharacterStore((s) => s.registry);
  const busy = useCreationStore((s) => s.busy);
  const entriesById = useCompendiumStore((s) => s.entries);
  const order = useCompendiumStore((s) => s.order);
  const [shelf, setShelf] = useState<CompendiumCategory>('weapon');
  const [query, setQuery] = useState('');
  const data = creationDataOf(registry);

  const lookup = useMemo(() => (entryId: string) => entriesById[entryId], [entriesById]);
  const lines = useMemo(() => creationPurchases(draft, lookup), [draft, lookup]);
  const spent = creationSpentEddies(lines);
  const budget = creationBudget(data, draft);
  const left = budget - spent;

  const shelfEntries = useMemo(() => {
    const all = order.map((id) => entriesById[id]).filter((e): e is CompendiumEntry => !!e);
    return searchCompendium(all, query, shelf).filter(
      (entry) => entryWithinTier(entry, CREATION_SHOP_TIER) && entryPrice(entry) !== null,
    );
  }, [entriesById, order, query, shelf]);

  return (
    <div className="creator-step creator-gear">
      <div className="creator-budget">
        <strong>{formatEddies(left)} ed</strong>
        <span className="creator-hint">
          zostaje z {formatEddies(budget)} ed startowych · wydane {formatEddies(spent)} ed
        </span>
        {draft.method === 'complete' && data.budgets.fashion > 0 ? (
          <span className="creator-hint">
            Podręcznik daje jeszcze {formatEddies(data.budgets.fashion)} ed wyłącznie na Modę — VTT
            nie prowadzi katalogu ubrań, więc te pieniądze zostają na papierze.
          </span>
        ) : null}
        {draft.method === 'edgerunner' ? (
          <span className="creator-hint">
            Krawędziarz dostaje w podręczniku dodatkowo odgórny pakiet Roli (broń, pancerz,
            ekwipunek) — na razie dokłada go MG przyciskiem „Dodaj za darmo" w Kompendium.
          </span>
        ) : null}
      </div>

      {lines.length > 0 ? (
        <ul className="creator-basket">
          {lines.map((line) => (
            <li key={line.entryId}>
              <span className="creator-basket-name">
                {line.name}
                {line.qty > 1 ? <span className="creator-basket-qty">×{line.qty}</span> : null}
              </span>
              <span className="creator-basket-price">{formatEddies(line.total)} ed</span>
              <button
                type="button"
                className="small-button"
                disabled={busy}
                title="Odłóż jedną sztukę"
                onClick={() => void buyCreationEntry(line.entryId, -1)}
              >
                −
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="creator-hint">
          Koszyk jest pusty. Wszystko można też dokupić później — eurodolce zostają na karcie.
        </p>
      )}

      <div className="creator-shop-head">
        {CREATOR_SHELVES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`compendium-category ${shelf === entry.id ? 'compendium-category--active' : ''}`}
            onClick={() => setShelf(entry.id)}
          >
            {entry.label}
          </button>
        ))}
        <input
          className="compendium-search"
          type="search"
          value={query}
          placeholder="Szukaj…"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <ul className="creator-shop">
        {shelfEntries.length === 0 ? (
          <li className="placeholder-text">
            Nic na poziomie 1 ({SHOP_TIER_LABELS[CREATION_SHOP_TIER]}) w tej kategorii.
          </li>
        ) : null}
        {shelfEntries.map((entry) => {
          const price = entryPrice(entry) ?? 0;
          const held = draft.purchases[entry.id] ?? 0;
          return (
            <li key={entry.id}>
              <button
                type="button"
                className="creator-shop-row"
                disabled={busy || price > left}
                title={price > left ? 'Za mało startowych eurodolców.' : `Dołóż — ${price} ed`}
                onClick={() => void buyCreationEntry(entry.id, 1)}
              >
                <span className="creator-shop-name">
                  {entry.name}
                  {held > 0 ? <span className="creator-basket-qty">×{held}</span> : null}
                </span>
                <span className="creator-shop-price">{formatEddies(price)} ed</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ───────────────────────── krok 6: Opis ─────────────────────────

/**
 * Everything the sheet shows before a single number: the street name, the face
 * and whether the character walks onto the map when the wizard closes.
 */
function DetailsStep({ draft }: { draft: CpredCreationDraft }) {
  const patch = useCreationStore((s) => s.patch);
  const busy = useCreationStore((s) => s.busy);
  const [name, setName] = useState(draft.name);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function uploadPortrait(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const result = await apiUpload<PortraitUploadResult>('/api/uploads/portraits', file);
      await patch({ portraitUrl: result.url });
    } catch (error) {
      setUploadError(portraitErrorText(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="creator-step creator-details">
      <label className="creator-name">
        Ksywa na Ulicy
        {/* Sent on every keystroke, like the sheet saves. Saving on blur alone
            cost „Utwórz postać" a click in 25a: the button is disabled until
            the name reaches the server, so the press that blurred the field
            found it still greyed out. The raw value goes out (the space in a
            two-word ksywa has to survive — that was the 13.08 bug) and the
            server trims when it writes the character. */}
        <input
          type="text"
          maxLength={64}
          value={name}
          placeholder="Zgrzyt"
          onChange={(event) => {
            setName(event.target.value);
            void patch({ name: event.target.value });
          }}
        />
      </label>

      <div className="creator-portrait">
        {draft.portraitUrl ? (
          <img src={draft.portraitUrl} alt="Portret postaci" />
        ) : (
          <span className="creator-portrait-empty">brak portretu</span>
        )}
        {/* Its own label rather than the sheet's `cp-portrait-upload`: that one
            is a hover overlay pinned to the sheet's portrait frame, and out
            here it would simply be invisible. */}
        <label className="small-button creator-portrait-upload">
          {uploading ? 'Wgrywanie…' : draft.portraitUrl ? 'Zmień portret' : 'Wgraj portret'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => void uploadPortrait(event)}
            disabled={uploading || busy}
            hidden
          />
        </label>
        {draft.portraitUrl ? (
          <button
            type="button"
            className="small-button"
            disabled={busy}
            onClick={() => void patch({ portraitUrl: null })}
          >
            Usuń portret
          </button>
        ) : null}
        {uploadError ? <p className="auth-error">{uploadError}</p> : null}
      </div>

      <label className="creator-checkbox">
        <input
          type="checkbox"
          checked={draft.placeToken}
          disabled={busy}
          onChange={(event) => void patch({ placeToken: event.target.checked })}
        />
        <span>
          Postaw żeton na aktywnej scenie
          <span className="creator-hint">
            Portret posłuży za obrazek żetonu, dopóki MG nie wybierze innego.
          </span>
        </span>
      </label>
    </div>
  );
}

// ───────────────────────── krok 7: Podsumowanie ─────────────────────────

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
  const entriesById = useCompendiumStore((s) => s.entries);
  const data = creationDataOf(registry);
  const role = registry.roles.find((entry) => entry.id === draft.roleId);
  const preview = creationPreview(creationStats(draft, data));
  const taken = Object.entries(draft.skills).filter(([, level]) => level > 0);
  const lines = useMemo(
    () => creationPurchases(draft, (entryId: string) => entriesById[entryId]),
    [draft, entriesById],
  );
  const left = creationBudget(data, draft) - creationSpentEddies(lines);

  return (
    <div className="creator-step creator-summary">
      {/* The name lives in „Opis" — one field, one place. Here it is what the
          card will say, next to the face that goes with it. */}
      <p className="creator-summary-name">
        {draft.portraitUrl ? <img src={draft.portraitUrl} alt="" /> : null}
        <strong>{draft.name.trim() || 'Bez imienia'}</strong>
        <span className="creator-hint">
          {draft.placeToken ? 'Żeton stanie na aktywnej scenie.' : 'Bez żetonu na scenie.'}
        </span>
      </p>

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
          Język kultury pochodzenia wchodzi za darmo na poziomie {data.freeLanguage.level}
          {draft.lifepath.language ? ` — ${draft.lifepath.language}` : ' — jeszcze nie wybrany'}.
        </p>
      )}
      <p className="creator-hint">
        Wyposażenie ({lines.length}):{' '}
        {lines.map((line) => `${line.name}${line.qty > 1 ? ` ×${line.qty}` : ''}`).join(' · ') ||
          'nic kupionego'}
        {' · '}w kieszeni zostaje {formatEddies(Math.max(0, left))} ed
      </p>
      <LifepathSummary draft={draft} />
    </div>
  );
}

/** What the Lifepath step collected, in one paragraph. */
function LifepathSummary({ draft }: { draft: CpredCreationDraft }) {
  const { lifepath } = draft;
  const said = [
    lifepath.culture && `pochodzenie: ${lifepath.culture}`,
    lifepath.personality && `charakter: ${lifepath.personality}`,
    lifepath.familyBackground && `rodzina: ${lifepath.familyBackground}`,
    lifepath.lifeGoal && `cel: ${lifepath.lifeGoal}`,
  ].filter(Boolean);
  const people = [
    lifepath.friends.length > 0 && `przyjaciele: ${lifepath.friends.length}`,
    lifepath.enemies.length > 0 && `wrogowie: ${lifepath.enemies.length}`,
    lifepath.tragicLoves.length > 0 && `miłości: ${lifepath.tragicLoves.length}`,
  ].filter(Boolean);

  return (
    <p className="creator-hint">
      Ścieżka Życia:{' '}
      {said.length === 0 && people.length === 0
        ? 'pusta — można ją wypełnić teraz albo później na karcie'
        : [...said, ...people].join(' · ')}
      {lifepath.roleAnswers.length > 0 && ` · Rola: ${lifepath.roleAnswers.length} odpowiedzi`}
    </p>
  );
}
