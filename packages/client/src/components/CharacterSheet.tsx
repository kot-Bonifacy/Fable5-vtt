import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import type { CpredCharacterData, CpredItemRow, PortraitUploadResult } from '@vtt/shared';
import {
  CPRED_STAT_IDS,
  CPRED_STAT_LABELS,
  CPRED_STAT_MAX,
  CPRED_STAT_MIN,
  ROLE_RANK_MAX,
  ROLE_RANK_MIN,
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  deathSaveTarget,
  hpMax,
  humanityMax,
  seriousWoundThreshold,
  skillBase,
  validateCharacterDataPatch,
} from '@vtt/shared';
import { ApiError, apiUpload } from '../api.js';
import { flushCharacterSave, queueCharacterSave } from '../socket.js';
import {
  ensureCpredDataLoaded,
  useCharacterStore,
  type CharacterSheetView,
} from '../stores/characterStore.js';

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
        {tab === 'stats' && <StatsTab data={data} saveData={saveData} />}
        {tab === 'combat' && <CombatTab data={data} saveData={saveData} />}
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

function StatsTab({ data, saveData }: TabProps) {
  const registry = useCharacterStore((s) => s.registry);
  const maxHp = hpMax(data.stats);
  const role = registry.roles.find((r) => r.id === data.roleId) ?? null;

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
          <label key={id} className="stat-box" title={CPRED_STAT_LABELS[id].name}>
            <span className="stat-abbr">{CPRED_STAT_LABELS[id].abbr}</span>
            <input
              type="number"
              min={CPRED_STAT_MIN}
              max={CPRED_STAT_MAX}
              value={data.stats[id]}
              onChange={(e) => setStat(id, e)}
            />
          </label>
        ))}
      </div>

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
          <span>Szczęście</span>
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
            onChange={(e) => saveData({ roleId: e.target.value === '' ? null : e.target.value }, 'roleId')}
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

      <table className="sheet-table skill-table">
        <thead>
          <tr>
            <th>Umiejętność</th>
            <th>Cecha</th>
            <th>Poz.</th>
            <th title="Cecha + poziom">Baza</th>
          </tr>
        </thead>
        <tbody>
          {registry.skills.map((skill) => {
            const level = data.skills[skill.id] ?? 0;
            return (
              <tr key={skill.id} className={level > 0 ? 'skill-trained' : ''}>
                <td>
                  {skill.name}
                  {skill.multiplier === 2 ? ' (×2)' : ''}
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
                  />
                </td>
                <td className="skill-base">{skillBase(data.stats[skill.stat], level)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Generic editable row-list table used by the combat and gear tabs. */
function RowTable<T extends CpredItemRow>({
  rows,
  columns,
  addLabel,
  makeRow,
  onChange,
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

function CombatTab({ data, saveData }: TabProps) {
  return (
    <div className="sheet-combat">
      <h3>Broń</h3>
      <RowTable
        rows={data.weapons}
        columns={[
          { key: 'name', label: 'Nazwa' },
          { key: 'damage', label: 'Obrażenia', maxLength: 32, width: '5.5rem' },
          { key: 'ammo', label: 'Amunicja', maxLength: 32, width: '5.5rem' },
          { key: 'rof', label: 'LA', maxLength: 32, width: '3.5rem' },
          { key: 'notes', label: 'Uwagi', maxLength: 200 },
        ]}
        addLabel="Dodaj broń"
        makeRow={() => ({ id: newRowId(), name: '', damage: '', ammo: '', rof: '', notes: '' })}
        onChange={(rows) => saveData({ weapons: rows }, 'weapons')}
      />

      <h3>Pancerz</h3>
      <RowTable
        rows={data.armor}
        columns={[
          { key: 'name', label: 'Nazwa' },
          { key: 'sp', label: 'OB', numeric: true, max: 30, width: '3.5rem' },
          { key: 'notes', label: 'Uwagi', maxLength: 200 },
        ]}
        addLabel="Dodaj pancerz"
        makeRow={() => ({ id: newRowId(), name: '', sp: 11, notes: '' })}
        onChange={(rows) => saveData({ armor: rows }, 'armor')}
      />
    </div>
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
