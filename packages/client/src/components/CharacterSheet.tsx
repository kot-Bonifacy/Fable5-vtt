import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import type {
  ArmorLocation,
  CpredArmorRow,
  CpredAttackMode,
  CpredCharacterData,
  CpredItemRow,
  CpredWeaponRow,
  PortraitUploadResult,
  ResolvedWeapon,
} from '@vtt/shared';
import {
  ARMOR_LOCATIONS,
  ARMOR_LOCATION_LABELS,
  ARMOR_SP_MAX,
  CPRED_BURST_AMMO_COST,
  CPRED_STAT_IDS,
  CPRED_STAT_LABELS,
  CPRED_STAT_MAX,
  CPRED_STAT_MIN,
  CPRED_SUPPRESSIVE_RANGE_M,
  CPRED_WOUND_LABELS,
  ROLE_RANK_MAX,
  ROLE_RANK_MIN,
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  deathSaveTarget,
  groupedSkills,
  hpMax,
  humanityMax,
  isValidDamageNotation,
  isWeaponEntry,
  resolveWeapon,
  seriousWoundThreshold,
  skillBase,
  validateCharacterDataPatch,
  woundCheckPenalty,
  woundState,
} from '@vtt/shared';
import { ApiError, apiUpload } from '../api.js';
import { flushCharacterSave, queueCharacterSave, reloadWeapon } from '../socket.js';
import { useAttackStore } from '../stores/attackStore.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import {
  ensureCpredDataLoaded,
  useCharacterStore,
  type CharacterSheetView,
} from '../stores/characterStore.js';
import {
  loadDeathSaveCup,
  quickLoadCup,
  useRollStore,
  type RollTarget,
} from '../stores/rollStore.js';

type SheetTab = 'stats' | 'combat' | 'gear' | 'bio';

const TABS: { id: SheetTab; label: string }[] = [
  { id: 'stats', label: 'Statystyki i umiejętności' },
  { id: 'combat', label: 'Walka' },
  { id: 'gear', label: 'Ekwipunek' },
  { id: 'bio', label: 'Biografia' },
];

/** Short row id (validation caps ids at 32 chars — crypto UUIDs are longer). */
function newRowId(): string {
  return Math.random().toString(36).slice(2, 10);
}

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

/** Parses a number input; returns undefined for the transient empty state. */
function parseNumberInput(event: ChangeEvent<HTMLInputElement>): number | undefined {
  const raw = event.target.value.trim();
  if (raw === '') return undefined;
  return Number(raw);
}

/** Renders every open sheet as its own floating window (last one on top). */
export function CharacterSheets() {
  const openSheets = useCharacterStore((s) => s.openSheets);
  return (
    <>
      {openSheets.map((id, index) => (
        <CharacterSheetWindow key={id} characterId={id} stackIndex={index} />
      ))}
    </>
  );
}

function CharacterSheetWindow({
  characterId,
  stackIndex,
}: {
  characterId: string;
  stackIndex: number;
}) {
  const character = useCharacterStore((s) => s.characters[characterId]);
  const registry = useCharacterStore((s) => s.registry);
  const saveState = useCharacterStore((s) => s.saveStates[characterId]);
  const closeSheet = useCharacterStore((s) => s.closeSheet);
  const focusSheet = useCharacterStore((s) => s.focusSheet);

  const [tab, setTab] = useState<SheetTab>('stats');
  const [position, setPosition] = useState(() => ({
    x: 90 + (stackIndex % 6) * 28,
    y: 70 + (stackIndex % 6) * 24,
  }));
  const [issues, setIssues] = useState<Record<string, string>>({});
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  useEffect(() => {
    ensureCpredDataLoaded();
    // Buffered edits must not be lost when the window unmounts.
    return () => flushCharacterSave(characterId);
  }, [characterId]);

  if (!character) return null;
  const data = character.data;

  /** Validates one sheet-data patch and either saves it or surfaces the Polish message. */
  function saveData(patch: Partial<CpredCharacterData>, fieldKey: string) {
    const result = validateCharacterDataPatch(patch, registry);
    if (!result.ok) {
      const message = result.issues[0]?.message ?? 'Nieprawidłowa wartość.';
      setIssues((current) => ({ ...current, [fieldKey]: message }));
      return;
    }
    setIssues((current) => {
      if (!(fieldKey in current)) return current;
      const next = { ...current };
      delete next[fieldKey];
      return next;
    });
    queueCharacterSave(characterId, { data: result.patch });
  }

  function saveName(value: string) {
    // The raw value lands in the store (typing "Johnny Silver" needs the
    // space to survive); the server trims before persisting.
    if (value.trim().length === 0 || value.length > 64) {
      setIssues((current) => ({ ...current, name: 'Imię musi mieć od 1 do 64 znaków.' }));
      return;
    }
    setIssues((current) => {
      const next = { ...current };
      delete next.name;
      return next;
    });
    queueCharacterSave(characterId, { name: value });
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    // Buttons and inputs inside the header keep their normal behaviour.
    if ((event.target as HTMLElement).closest('button, input')) return;
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
      x: Math.max(0, Math.min(window.innerWidth - 120, drag.baseX + event.clientX - drag.startX)),
      y: Math.max(0, Math.min(window.innerHeight - 60, drag.baseY + event.clientY - drag.startY)),
    });
  }

  function endDrag() {
    dragRef.current = null;
  }

  const issueList = Object.values(issues);
  const saveLabel =
    saveState === 'saving' ? 'Zapisywanie…' : saveState === 'error' ? 'Błąd zapisu!' : '';

  return (
    <section
      className="sheet-window"
      style={{ left: position.x, top: position.y, zIndex: 300 + stackIndex }}
      onPointerDown={() => focusSheet(characterId)}
      aria-label={`Karta postaci: ${character.name}`}
    >
      <div
        className="sheet-header"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {character.portraitUrl ? (
          <img className="sheet-header-portrait" src={character.portraitUrl} alt="" />
        ) : null}
        <input
          className="sheet-name"
          type="text"
          maxLength={64}
          value={character.name}
          onChange={(e) => saveName(e.target.value)}
          title="Imię / ksywa postaci"
        />
        <span className={`sheet-save sheet-save--${saveState ?? 'idle'}`}>{saveLabel}</span>
        <button
          type="button"
          className="sheet-close"
          onClick={() => closeSheet(characterId)}
          title="Zamknij kartę"
        >
          ✕
        </button>
      </div>

      <nav className="sheet-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`sheet-tab ${tab === t.id ? 'sheet-tab--active' : ''}`}
            onClick={() => {
              flushCharacterSave(characterId);
              setTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="sheet-body">
        {tab === 'stats' && <StatsTab character={character} data={data} saveData={saveData} />}
        {tab === 'combat' && <CombatTab character={character} data={data} saveData={saveData} />}
        {tab === 'gear' && <GearTab data={data} saveData={saveData} />}
        {tab === 'bio' && (
          <BioTab character={character} data={data} saveData={saveData} setIssues={setIssues} />
        )}
      </div>

      {issueList.length > 0 && (
        <div className="sheet-issues">
          {issueList.map((message) => (
            <p key={message} className="auth-error">
              {message}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

interface TabProps {
  data: CpredCharacterData;
  saveData: (patch: Partial<CpredCharacterData>, fieldKey: string) => void;
}

function StatsTab({ character, data, saveData }: TabProps & { character: CharacterSheetView }) {
  const registry = useCharacterStore((s) => s.registry);
  const maxHp = hpMax(data.stats);
  const role = registry.roles.find((r) => r.id === data.roleId) ?? null;
  const wound = woundState(data.hpCurrent, data.stats);
  const woundPenalty = woundCheckPenalty(wound);

  /**
   * Click opens the roll dialog, Shift+click loads the cup straight away with
   * the last used settings. Either way the throw itself happens at the cup.
   */
  function startRoll(target: Omit<RollTarget, 'characterId' | 'characterName'>, shift: boolean) {
    const full: RollTarget = {
      characterId: character.id,
      characterName: character.name,
      ...target,
    };
    if (shift) quickLoadCup(full, data, registry);
    else useRollStore.getState().openDialog(full);
  }

  function setStat(statId: (typeof CPRED_STAT_IDS)[number], event: ChangeEvent<HTMLInputElement>) {
    const value = parseNumberInput(event);
    if (value === undefined) return;
    saveData({ stats: { ...data.stats, [statId]: value } }, `stats.${statId}`);
  }

  function setPool(
    key: 'hpCurrent' | 'luckCurrent' | 'humanityCurrent',
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const value = parseNumberInput(event);
    if (value === undefined) return;
    saveData({ [key]: value }, key);
  }

  return (
    <div className="sheet-stats">
      <div className="stat-grid">
        {CPRED_STAT_IDS.map((id) => (
          <div key={id} className="stat-box" title={CPRED_STAT_LABELS[id].name}>
            <button
              type="button"
              className="stat-abbr stat-roll"
              onClick={(e: MouseEvent) => startRoll({ kind: 'stat', statId: id }, e.shiftKey)}
              title={`Rzut: ${CPRED_STAT_LABELS[id].name} (Shift — bez okna)`}
            >
              {CPRED_STAT_LABELS[id].abbr}
            </button>
            <input
              type="number"
              min={CPRED_STAT_MIN}
              max={CPRED_STAT_MAX}
              value={data.stats[id]}
              onChange={(e) => setStat(id, e)}
              aria-label={CPRED_STAT_LABELS[id].name}
            />
          </div>
        ))}
      </div>

      {wound !== 'healthy' && (
        <p className={`wound-badge wound-badge--${wound}`}>
          {CPRED_WOUND_LABELS[wound]}
          {woundPenalty !== 0 && ` — −${Math.abs(woundPenalty)} do wszystkich testów`}
          {wound === 'mortal' && ' i Testy Przeżywalności'}
          {wound === 'mortal' && (
            <button
              type="button"
              className="small-button death-save-button"
              title={`Rzuć 1k10 pod BC ${deathSaveTarget(data.stats)}. Każdy kolejny test jest o 1 trudniejszy.`}
              onClick={() => loadDeathSaveCup(character.id, character.name, data, registry)}
            >
              Test Przeżywalności
              {data.deathSaves > 0 ? ` (+${data.deathSaves})` : ''}
            </button>
          )}
        </p>
      )}

      <div className="derived-strip">
        <label className="derived-box" title="Punkty Wytrzymałości: obecne / maksymalne">
          <span>PW</span>
          <span className="derived-value">
            <input
              type="number"
              min={0}
              max={maxHp}
              value={data.hpCurrent}
              onChange={(e) => setPool('hpCurrent', e)}
            />
            <span> / {maxHp}</span>
          </span>
        </label>
        <div className="derived-box" title="Próg stanu Poważnie ranny (połowa PW)">
          <span>Poważnie ranny</span>
          <span className="derived-value">≤ {seriousWoundThreshold(data.stats)}</span>
        </div>
        <div className="derived-box" title="Test Przeżywalności: rzuć poniżej tej wartości na 1k10">
          <span>Przeżywalność</span>
          <span className="derived-value">{deathSaveTarget(data.stats)}</span>
        </div>
        <label className="derived-box" title="Punkty Szczęścia: obecne / maksymalne (SZ)">
          <span>
            Szczęście
            <button
              type="button"
              className="luck-refresh"
              onClick={() => saveData({ luckCurrent: data.stats.luck }, 'luckCurrent')}
              title="Odnów pulę Szczęścia (RAW: na początku każdej sesji)"
              disabled={data.luckCurrent >= data.stats.luck}
            >
              ↻
            </button>
          </span>
          <span className="derived-value">
            <input
              type="number"
              min={0}
              max={data.stats.luck}
              value={data.luckCurrent}
              onChange={(e) => setPool('luckCurrent', e)}
            />
            <span> / {data.stats.luck}</span>
          </span>
        </label>
        <label className="derived-box" title="Człowieczeństwo: obecne / maksymalne (EMP × 10)">
          <span>Człowieczeństwo</span>
          <span className="derived-value">
            <input
              type="number"
              min={0}
              max={humanityMax(data.stats)}
              value={data.humanityCurrent}
              onChange={(e) => setPool('humanityCurrent', e)}
            />
            <span> / {humanityMax(data.stats)}</span>
          </span>
        </label>
      </div>

      <div className="sheet-role-row">
        <label>
          Rola
          <select
            value={data.roleId ?? ''}
            onChange={(e) =>
              saveData({ roleId: e.target.value === '' ? null : e.target.value }, 'roleId')
            }
          >
            <option value="">— brak —</option>
            {registry.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        {role && (
          <label title={`Zdolność specjalna roli: ${role.ability}`}>
            {role.ability} (ranga)
            <input
              type="number"
              min={ROLE_RANK_MIN}
              max={ROLE_RANK_MAX}
              value={data.roleAbilityRank}
              onChange={(e) => {
                const value = parseNumberInput(e);
                if (value !== undefined) saveData({ roleAbilityRank: value }, 'roleAbilityRank');
              }}
            />
          </label>
        )}
      </div>

      <SkillTable data={data} saveData={saveData} startRoll={startRoll} />
    </div>
  );
}

/**
 * The skill table, one collapsible block per rulebook category.
 *
 * The full rulebook list is 66 rows, so the sheet opens only the categories the
 * character has actually trained in — everything else is one click away. A
 * character with nothing trained yet (a fresh sheet) gets every block open,
 * because there is nothing to hide behind.
 */
function SkillTable({
  data,
  saveData,
  startRoll,
}: {
  data: CpredCharacterData;
  saveData: TabProps['saveData'];
  startRoll: (target: Omit<RollTarget, 'characterId' | 'characterName'>, shift: boolean) => void;
}) {
  const registry = useCharacterStore((s) => s.registry);
  const groups = useMemo(() => groupedSkills(registry), [registry]);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // The registry arrives after the first render, so the default cannot be a
  // useState initialiser; it is applied once, when the groups first show up.
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (defaultsApplied.current || groups.length === 0) return;
    defaultsApplied.current = true;
    const trained = groups.filter((group) =>
      group.skills.some((skill) => (data.skills[skill.id] ?? 0) > 0),
    );
    setOpen(new Set((trained.length > 0 ? trained : groups).map((group) => group.id)));
  }, [groups, data.skills]);

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <table className="sheet-table skill-table">
      <thead>
        <tr>
          <th>Umiejętność</th>
          <th>Cecha</th>
          <th>Poz.</th>
          <th title="Cecha + poziom">Baza</th>
        </tr>
      </thead>
      {groups.map((group) => {
        const isOpen = open.has(group.id);
        const trained = group.skills.filter((skill) => (data.skills[skill.id] ?? 0) > 0).length;
        return (
          <tbody key={group.id}>
            <tr className="skill-group">
              <th colSpan={4}>
                <button
                  type="button"
                  className="skill-group-toggle"
                  onClick={() => toggle(group.id)}
                  aria-expanded={isOpen}
                >
                  <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span> {group.label}
                  <span className="skill-group-count">
                    {trained}/{group.skills.length}
                  </span>
                </button>
              </th>
            </tr>
            {isOpen &&
              group.skills.map((skill) => {
                const level = data.skills[skill.id] ?? 0;
                const rollTitle = `Rzut: ${skill.name} (${CPRED_STAT_LABELS[skill.stat].abbr}) — Shift pomija okno`;
                // The rulebook blurb only exists in the private data files.
                const title = skill.description
                  ? `${skill.description}\n\n${rollTitle}`
                  : rollTitle;
                return (
                  <tr key={skill.id} className={level > 0 ? 'skill-trained' : ''}>
                    <td>
                      <button
                        type="button"
                        className="skill-roll"
                        onClick={(e: MouseEvent) =>
                          startRoll({ kind: 'skill', skillId: skill.id }, e.shiftKey)
                        }
                        title={title}
                      >
                        {skill.name}
                        {skill.multiplier === 2 ? ' (×2)' : ''}
                      </button>
                    </td>
                    <td>{CPRED_STAT_LABELS[skill.stat].abbr}</td>
                    <td>
                      <input
                        type="number"
                        min={SKILL_LEVEL_MIN}
                        max={SKILL_LEVEL_MAX}
                        value={level}
                        onChange={(e) => {
                          const value = parseNumberInput(e);
                          if (value === undefined) return;
                          saveData({ skills: { ...data.skills, [skill.id]: value } }, 'skills');
                        }}
                        aria-label={`Poziom: ${skill.name}`}
                      />
                    </td>
                    <td className="skill-base">
                      <button
                        type="button"
                        className="skill-roll skill-base-roll"
                        onClick={(e: MouseEvent) =>
                          startRoll({ kind: 'skill', skillId: skill.id }, e.shiftKey)
                        }
                        title={rollTitle}
                      >
                        {skillBase(data.stats[skill.stat], level)}
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        );
      })}
    </table>
  );
}

/** Generic editable row-list table used by the combat and gear tabs. */
function RowTable<T extends CpredItemRow>({
  rows,
  columns,
  addLabel,
  makeRow,
  onChange,
  action,
}: {
  rows: T[];
  columns: {
    key: keyof T & string;
    label: string;
    numeric?: boolean;
    max?: number;
    maxLength?: number;
    width?: string;
  }[];
  addLabel: string;
  makeRow: () => T;
  onChange: (rows: T[]) => void;
  /** Optional trailing cell, e.g. the weapon's damage-roll button. */
  action?: { label: string; render: (row: T) => ReactNode };
}) {
  function updateRow(rowId: string, key: keyof T & string, value: string | number) {
    onChange(rows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)));
  }

  return (
    <div className="row-table-wrap">
      <table className="sheet-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined}>
                {c.label}
              </th>
            ))}
            {action && <th>{action.label}</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((c) => (
                <td key={c.key}>
                  {c.numeric ? (
                    <input
                      type="number"
                      min={0}
                      max={c.max ?? 999}
                      value={row[c.key] as number}
                      onChange={(e) => {
                        const value = parseNumberInput(e);
                        if (value !== undefined) updateRow(row.id, c.key, value);
                      }}
                    />
                  ) : (
                    <input
                      type="text"
                      maxLength={c.maxLength ?? 64}
                      value={row[c.key] as string}
                      onChange={(e) => updateRow(row.id, c.key, e.target.value)}
                    />
                  )}
                </td>
              ))}
              {action && <td className="row-action-cell">{action.render(row)}</td>}
              <td>
                <button
                  type="button"
                  className="small-button character-delete"
                  onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
                  title="Usuń wiersz"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="small-button" onClick={() => onChange([...rows, makeRow()])}>
        {addLabel}
      </button>
    </div>
  );
}

/**
 * The weapon list (stage 16). Beyond editing the row it is the place combat
 * starts from: „Atak"/„Seria"/„Zapora" arm the map's crosshair, and the next
 * click on a token loads the cup. Which buttons appear follows the weapon's
 * catalogue entry — only a weapon whose type has autofire can fire a burst.
 */
function WeaponTable({
  character,
  data,
  saveData,
  startRoll,
}: {
  character: CharacterSheetView;
  data: CpredCharacterData;
  saveData: TabProps['saveData'];
  startRoll: (target: Omit<RollTarget, 'characterId' | 'characterName'>, shift: boolean) => void;
}) {
  const entries = useCompendiumStore((s) => s.entries);
  const weaponTypeById = useCompendiumStore((s) => s.weaponTypeById);
  const tokens = useTokenStore((s) => s.tokens);

  /** Catalogue stats of a row, or null for a hand-typed weapon. */
  function resolvedOf(row: CpredWeaponRow): ResolvedWeapon | null {
    const entry = row.compendiumId ? entries[row.compendiumId] : undefined;
    if (!entry || !isWeaponEntry(entry)) return null;
    return resolveWeapon(entry, { weaponTypeById: new Map(Object.entries(weaponTypeById)) });
  }

  function updateRow(rowId: string, patch: Partial<CpredWeaponRow>) {
    saveData(
      { weapons: data.weapons.map((row) => (row.id === rowId ? { ...row, ...patch } : row)) },
      'weapons',
    );
  }

  /** Draws (or hides) this weapon's DV bands around the character's token. */
  function showRangeRings(row: CpredWeaponRow, resolved: ResolvedWeapon) {
    const own = Object.values(tokens).find((token) => token.characterId === character.id);
    if (!own || !resolved.rangeDv) return;
    useAttackStore.getState().toggleOverlay({
      tokenId: own.id,
      weaponName: row.name,
      rangeDv: resolved.rangeDv,
      autofire: false,
    });
  }

  /** Arms the map: the next click on a token fires this weapon. */
  function aim(row: CpredWeaponRow, mode: CpredAttackMode, resolved: ResolvedWeapon | null) {
    const own = Object.values(tokens).find((token) => token.characterId === character.id);
    useAttackStore.getState().arm({
      characterId: character.id,
      characterName: character.name,
      ...(own ? { attackerTokenId: own.id } : {}),
      weaponRowId: row.id,
      weaponName: row.name,
      mode,
      aimed: false,
      modifier: 0,
      melee: resolved?.melee ?? false,
    });
  }

  return (
    <div className="row-table-wrap">
      <table className="sheet-table weapon-table">
        <thead>
          <tr>
            <th>Nazwa</th>
            <th style={{ width: '5.5rem' }}>Obrażenia</th>
            <th style={{ width: '7rem' }}>Amunicja</th>
            <th style={{ width: '3.5rem' }}>LA</th>
            <th>Uwagi</th>
            <th>Atak</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.weapons.map((row) => {
            const resolved = resolvedOf(row);
            const tracksAmmo = row.ammoMax > 0;
            const empty = tracksAmmo && row.ammoCurrent <= 0;
            return (
              <tr key={row.id}>
                <td>
                  <input
                    type="text"
                    maxLength={64}
                    value={row.name}
                    onChange={(e) => updateRow(row.id, { name: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    maxLength={32}
                    value={row.damage}
                    onChange={(e) => updateRow(row.id, { damage: e.target.value })}
                  />
                </td>
                <td className="weapon-ammo-cell">
                  {tracksAmmo ? (
                    <>
                      <input
                        type="number"
                        className={`weapon-ammo-input${empty ? ' weapon-ammo-input--empty' : ''}`}
                        min={0}
                        max={row.ammoMax}
                        value={row.ammoCurrent}
                        aria-label={`Stan magazynka: ${row.name}`}
                        onChange={(e) => {
                          const value = parseNumberInput(e);
                          if (value !== undefined) {
                            updateRow(row.id, { ammoCurrent: Math.min(value, row.ammoMax) });
                          }
                        }}
                      />
                      <span className="weapon-ammo-max">/{row.ammoMax}</span>
                      <button
                        type="button"
                        className="small-button"
                        disabled={row.ammoCurrent >= row.ammoMax}
                        title={`Przeładuj do pełna${row.ammoType ? ` (${row.ammoType})` : ''}`}
                        onClick={() => reloadWeapon(character.id, row.id)}
                      >
                        ⟳
                      </button>
                    </>
                  ) : (
                    <span className="weapon-ammo-none" title="Ta broń nie liczy amunicji">
                      —
                    </span>
                  )}
                </td>
                <td>
                  <input
                    type="text"
                    maxLength={32}
                    value={row.rof}
                    onChange={(e) => updateRow(row.id, { rof: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    maxLength={200}
                    value={row.notes}
                    onChange={(e) => updateRow(row.id, { notes: e.target.value })}
                  />
                </td>
                <td className="weapon-actions">
                  <button
                    type="button"
                    className="small-button"
                    disabled={empty}
                    title={
                      empty
                        ? 'Pusty magazynek — przeładuj'
                        : resolved?.melee
                          ? 'Atak wręcz — wskaż cel na mapie (do 2 m)'
                          : 'Atak — wskaż cel na mapie'
                    }
                    onClick={() => aim(row, 'single', resolved)}
                  >
                    Atak
                  </button>
                  {resolved?.autofire && (
                    <button
                      type="button"
                      className="small-button"
                      disabled={row.ammoCurrent < CPRED_BURST_AMMO_COST}
                      title={`Ogień ciągły — ${CPRED_BURST_AMMO_COST} naboi, obrażenia 2k6 × przerzut (do ×${resolved.autofire.max})`}
                      onClick={() => aim(row, 'autofire', resolved)}
                    >
                      Seria
                    </button>
                  )}
                  {resolved?.suppressive && (
                    <button
                      type="button"
                      className="small-button"
                      disabled={row.ammoCurrent < CPRED_BURST_AMMO_COST}
                      title={`Ogień zaporowy — ${CPRED_BURST_AMMO_COST} naboi, testy SW u wszystkich w ${CPRED_SUPPRESSIVE_RANGE_M} m`}
                      onClick={() => aim(row, 'suppressive', resolved)}
                    >
                      Zapora
                    </button>
                  )}
                  {resolved?.rangeDv && (
                    <button
                      type="button"
                      className="small-button"
                      title="Pokaż pierścienie przedziałów PT wokół swojego tokenu (kliknij ponownie, by schować)"
                      onClick={() => showRangeRings(row, resolved)}
                    >
                      ◎
                    </button>
                  )}
                  <button
                    type="button"
                    className="small-button"
                    disabled={!isValidDamageNotation(row.damage)}
                    title={
                      isValidDamageNotation(row.damage)
                        ? 'Sam rzut na obrażenia, bez testu trafienia (Shift — bez okna)'
                        : 'Uzupełnij obrażenia notacją kości, np. 3k6'
                    }
                    onClick={(event: MouseEvent) =>
                      startRoll({ kind: 'damage', weaponRowId: row.id }, event.shiftKey)
                    }
                  >
                    OBR.
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className="small-button character-delete"
                    onClick={() =>
                      saveData(
                        { weapons: data.weapons.filter((r) => r.id !== row.id) },
                        'weapons',
                      )
                    }
                    title="Usuń wiersz"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        type="button"
        className="small-button"
        onClick={() =>
          saveData(
            {
              weapons: [
                ...data.weapons,
                {
                  id: newRowId(),
                  name: '',
                  damage: '',
                  ammoCurrent: 0,
                  ammoMax: 0,
                  ammoType: '',
                  rof: '',
                  notes: '',
                },
              ],
            },
            'weapons',
          )
        }
      >
        Dodaj broń
      </button>
    </div>
  );
}

function CombatTab({ character, data, saveData }: TabProps & { character: CharacterSheetView }) {
  const registry = useCharacterStore((s) => s.registry);

  /** Same path as a skill roll: dialog, or straight to the cup on Shift. */
  function startRoll(target: Omit<RollTarget, 'characterId' | 'characterName'>, shift: boolean) {
    const full: RollTarget = {
      characterId: character.id,
      characterName: character.name,
      ...target,
    };
    if (shift) quickLoadCup(full, data, registry);
    else useRollStore.getState().openDialog(full);
  }

  return (
    <div className="sheet-combat">
      <h3>Broń</h3>
      <WeaponTable character={character} data={data} saveData={saveData} startRoll={startRoll} />

      <h3>Pancerz</h3>
      <ArmorTable data={data} saveData={saveData} />

      <h3>Rany krytyczne</h3>
      <CriticalInjuries data={data} saveData={saveData} />
    </div>
  );
}

/**
 * Worn armor: SP as bought, SP after ablation and where it sits. The damage
 * flow reads exactly these three (stage 15) — the highest worn SP of the hit
 * location is what stops the shot.
 */
function ArmorTable({ data, saveData }: TabProps) {
  function update(rowId: string, patch: Partial<CpredArmorRow>) {
    saveData(
      { armor: data.armor.map((row) => (row.id === rowId ? { ...row, ...patch } : row)) },
      'armor',
    );
  }

  return (
    <div className="row-table-wrap">
      <table className="sheet-table">
        <thead>
          <tr>
            <th>Nazwa</th>
            <th style={{ width: '6.5rem' }}>Lokacja</th>
            <th style={{ width: '4rem' }}>OB</th>
            <th style={{ width: '4.5rem' }}>Bieżące</th>
            <th style={{ width: '4rem' }}>Noszony</th>
            <th>Uwagi</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.armor.map((row) => (
            <tr key={row.id} className={row.equipped === false ? 'armor-row--stowed' : undefined}>
              <td>
                <input
                  type="text"
                  maxLength={64}
                  value={row.name}
                  onChange={(e) => update(row.id, { name: e.target.value })}
                />
              </td>
              <td>
                <select
                  value={row.location}
                  onChange={(e) => update(row.id, { location: e.target.value as ArmorLocation })}
                  aria-label="Lokacja pancerza"
                >
                  {ARMOR_LOCATIONS.map((id) => (
                    <option key={id} value={id}>
                      {ARMOR_LOCATION_LABELS[id]}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  type="number"
                  min={0}
                  max={ARMOR_SP_MAX}
                  value={row.sp}
                  onChange={(e) => {
                    const value = parseNumberInput(e);
                    if (value === undefined) return;
                    update(row.id, { sp: value, spCurrent: Math.min(row.spCurrent, value) });
                  }}
                  aria-label="OB pancerza"
                />
              </td>
              <td className={row.spCurrent < row.sp ? 'armor-ablated' : undefined}>
                <input
                  type="number"
                  min={0}
                  max={row.sp}
                  value={row.spCurrent}
                  onChange={(e) => {
                    const value = parseNumberInput(e);
                    if (value !== undefined) update(row.id, { spCurrent: Math.min(value, row.sp) });
                  }}
                  aria-label="Bieżące OB (po ablacji)"
                  title="Ablacja: każde przebicie obniża OB o 1. Naprawa przywraca pełną wartość."
                />
              </td>
              <td className="armor-worn-cell">
                <input
                  type="checkbox"
                  checked={row.equipped !== false}
                  onChange={(e) => update(row.id, { equipped: e.target.checked })}
                  aria-label="Noszony"
                />
              </td>
              <td>
                <input
                  type="text"
                  maxLength={200}
                  value={row.notes}
                  onChange={(e) => update(row.id, { notes: e.target.value })}
                />
              </td>
              <td className="armor-actions">
                <button
                  type="button"
                  className="small-button"
                  disabled={row.spCurrent >= row.sp}
                  title="Napraw pancerz do pełnego OB"
                  onClick={() => update(row.id, { spCurrent: row.sp })}
                >
                  Napraw
                </button>
                <button
                  type="button"
                  className="small-button character-delete"
                  onClick={() =>
                    saveData({ armor: data.armor.filter((r) => r.id !== row.id) }, 'armor')
                  }
                  title="Usuń pancerz"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="small-button"
        onClick={() =>
          saveData(
            {
              armor: [
                ...data.armor,
                {
                  id: newRowId(),
                  name: '',
                  sp: 11,
                  spCurrent: 11,
                  location: 'body' as ArmorLocation,
                  notes: '',
                },
              ],
            },
            'armor',
          )
        }
      >
        Dodaj pancerz
      </button>
    </div>
  );
}

/**
 * Critical Injuries the character is suffering. They are drawn by the damage
 * flow; here they can be read (the effect is the rules text) and removed —
 * „Łatanie" and „Leczenie" are played out at the table, not automated.
 */
function CriticalInjuries({ data, saveData }: TabProps) {
  if (data.criticalInjuries.length === 0) {
    return <p className="placeholder-text">Brak ran krytycznych.</p>;
  }
  return (
    <ul className="injury-list">
      {data.criticalInjuries.map((injury, index) => (
        <li key={`${injury.id}-${index}`} className="injury-row">
          <div className="injury-head">
            <span className="injury-name">{injury.name}</span>
            {injury.rolled ? <span className="injury-roll">2k6 = {injury.rolled}</span> : null}
            {injury.deathSavePenalty ? (
              <span className="injury-penalty">
                +{injury.deathSavePenalty} do Testu Przeżywalności
              </span>
            ) : null}
            <button
              type="button"
              className="small-button character-delete"
              title="Usuń ranę (wyleczona albo załatana)"
              onClick={() =>
                saveData(
                  { criticalInjuries: data.criticalInjuries.filter((_, i) => i !== index) },
                  'criticalInjuries',
                )
              }
            >
              ✕
            </button>
          </div>
          <p className="injury-effect">{injury.effect}</p>
        </li>
      ))}
    </ul>
  );
}

function GearTab({ data, saveData }: TabProps) {
  return (
    <div className="sheet-gear">
      <label className="sheet-eddies" title="Eurodolce (eb)">
        Eurodolce (eb)
        <input
          type="number"
          min={0}
          max={10_000_000}
          value={data.eddies}
          onChange={(e) => {
            const value = parseNumberInput(e);
            if (value !== undefined) saveData({ eddies: value }, 'eddies');
          }}
        />
      </label>

      <h3>Sprzęt</h3>
      <RowTable
        rows={data.gear}
        columns={[
          { key: 'name', label: 'Nazwa' },
          { key: 'qty', label: 'Ilość', numeric: true, width: '4rem' },
          { key: 'notes', label: 'Uwagi', maxLength: 200 },
        ]}
        addLabel="Dodaj sprzęt"
        makeRow={() => ({ id: newRowId(), name: '', qty: 1, notes: '' })}
        onChange={(rows) => saveData({ gear: rows }, 'gear')}
      />

      <h3>Cyborgizacje</h3>
      <RowTable
        rows={data.cyberware}
        columns={[
          { key: 'name', label: 'Nazwa' },
          { key: 'notes', label: 'Uwagi', maxLength: 200 },
        ]}
        addLabel="Dodaj cyborgizację"
        makeRow={() => ({ id: newRowId(), name: '', notes: '' })}
        onChange={(rows) => saveData({ cyberware: rows }, 'cyberware')}
      />
    </div>
  );
}

function BioTab({
  character,
  data,
  saveData,
  setIssues,
}: TabProps & {
  character: CharacterSheetView;
  setIssues: (updater: (current: Record<string, string>) => Record<string, string>) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function uploadPortrait(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const result = await apiUpload<PortraitUploadResult>('/api/uploads/portraits', file);
      queueCharacterSave(character.id, { portraitUrl: result.url });
      flushCharacterSave(character.id);
      setIssues((current) => {
        const next = { ...current };
        delete next.portrait;
        return next;
      });
    } catch (error) {
      const message = portraitErrorText(error);
      setIssues((current) => ({ ...current, portrait: message }));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="sheet-bio">
      <div className="sheet-portrait-row">
        {character.portraitUrl ? (
          <img className="sheet-portrait" src={character.portraitUrl} alt="Portret postaci" />
        ) : (
          <div className="sheet-portrait sheet-portrait--empty">brak portretu</div>
        )}
        <label className="small-button scene-upload-button">
          {uploading ? 'Wgrywanie…' : 'Wgraj portret'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void uploadPortrait(e)}
            disabled={uploading}
            hidden
          />
        </label>
      </div>

      <label className="sheet-notes-label">
        Notatki i biografia
        <textarea
          className="sheet-notes"
          maxLength={10_000}
          value={data.notes}
          placeholder="Ścieżka życia, kontakty, wrogowie, cele…"
          onChange={(e) => saveData({ notes: e.target.value }, 'notes')}
        />
      </label>
    </div>
  );
}
