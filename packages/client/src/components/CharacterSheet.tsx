import {
  Fragment,
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
  CompendiumEntry,
  CpredArmorRow,
  CpredSkillDefinition,
  CpredAttackMode,
  CpredCharacterData,
  CpredItemRow,
  CpredReputationSource,
  CpredWeaponRow,
  LedgerEntryView,
  PortraitUploadResult,
  ResolvedWeapon,
} from '@vtt/shared';
import {
  ARMOR_LOCATIONS,
  ARMOR_LOCATION_LABELS,
  describeCpredTimer,
  ARMOR_PENALTY_MIN,
  ARMOR_SP_MAX,
  CPRED_BURST_AMMO_COST,
  CPRED_STAT_IDS,
  CPRED_STAT_LABELS,
  CPRED_STAT_MAX,
  CPRED_STAT_MIN,
  CPRED_SUPPRESSIVE_RANGE_M,
  CPRED_WOUND_LABELS,
  CYBERWARE_INSTALL_LABELS,
  CYBERWARE_TYPE_LABELS,
  HOUSING_DEFINITIONS,
  HOUSING_OPTIONS,
  HUMANITY_MIN,
  HUMANITY_THERAPIES,
  HUMANITY_THERAPY_DEFINITIONS,
  LEDGER_KIND_LABELS,
  LIFESTYLE_DEFINITIONS,
  LIFESTYLE_LEVELS,
  REPUTATION_LEVEL_MAX,
  REPUTATION_LEVEL_MIN,
  REPUTATION_LEVEL_REACH,
  REPUTATION_NOTE_MAX_LENGTH,
  REPUTATION_SOURCE_ROWS_MAX,
  ROLE_GM,
  ROLE_RANK_MAX,
  ROLE_RANK_MIN,
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  ammoOptionsFor,
  cpredReputation,
  cyberpsychosisFor,
  cyberwareCapacity,
  deathSaveTarget,
  effectiveCpredStats,
  formatEddies,
  formatLedgerAmount,
  groupedSkills,
  hpMax,
  humanityMaxWith,
  isAmmoEntry,
  isHousingOption,
  isLifestyleLevel,
  isValidDamageNotation,
  isWeaponEntry,
  monthlyCostOf,
  resolveWeapon,
  seriousWoundThreshold,
  skillBase,
  toAmmoProfile,
  validateCharacterDataPatch,
  woundCheckPenalty,
  woundState,
} from '@vtt/shared';
import { ApiError, apiUpload } from '../api.js';
import {
  economyErrorText,
  fetchLedger,
  flushCharacterSave,
  queueCharacterSave,
  reloadWeapon,
  sendCyberwareAction,
  transferEddies,
} from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
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
  { id: 'stats', label: 'Karta' },
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
  const roleName = registry.roles.find((r) => r.id === data.roleId)?.name ?? '';

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
        {/* Belka tytułowa tylko pokazuje — ksywę edytuje się w jej własnym polu
            na karcie, tak jak na wydruku. Dwa pola na to samo się rozjeżdżają. */}
        <span className="sheet-title">
          <span className="sheet-title-name">{character.name}</span>
          {roleName && <span className="sheet-title-role">{roleName}</span>}
        </span>
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
        {tab === 'stats' && (
          <FrontPage
            character={character}
            data={data}
            saveData={saveData}
            saveName={saveName}
            setIssues={setIssues}
          />
        )}
        {tab === 'combat' && <CombatTab character={character} data={data} saveData={saveData} />}
        {tab === 'gear' && <GearTab character={character} data={data} saveData={saveData} />}
        {tab === 'bio' && <BioTab data={data} saveData={saveData} />}
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

/**
 * Strona pierwsza karty — układ oficjalnego arkusza CP RED (etap 27a).
 *
 * Trzy kolumny wydruku, od lewej: tożsamość (portret, ksywa, rola, zdolność,
 * notatki, pule), pionowa kolumna dziesięciu cech i umiejętności rozłożone na
 * trzy kolumny. Wszystko, co karta umiała wcześniej — rzut z cechy, rzut
 * z umiejętności, Test Przeżywalności, ostrzeżenie o cyberpsychozie — siedzi
 * dalej w tych samych miejscach, tylko ubrane w papier.
 */
function FrontPage({
  character,
  data,
  saveData,
  saveName,
  setIssues,
}: TabProps & {
  character: CharacterSheetView;
  saveName: (value: string) => void;
  setIssues: (updater: (current: Record<string, string>) => Record<string, string>) => void;
}) {
  const registry = useCharacterStore((s) => s.registry);

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

  return (
    <div className="sheet-page">
      <IdentityColumn
        character={character}
        data={data}
        saveData={saveData}
        saveName={saveName}
        setIssues={setIssues}
      />
      <StatColumn data={data} saveData={saveData} startRoll={startRoll} />
      <SkillColumns data={data} saveData={saveData} startRoll={startRoll} />
    </div>
  );
}

/** Lewa kolumna wydruku: kto to jest i ile w nim jeszcze zostało. */
function IdentityColumn({
  character,
  data,
  saveData,
  saveName,
  setIssues,
}: TabProps & {
  character: CharacterSheetView;
  saveName: (value: string) => void;
  setIssues: (updater: (current: Record<string, string>) => Record<string, string>) => void;
}) {
  const registry = useCharacterStore((s) => s.registry);
  const [uploading, setUploading] = useState(false);
  const role = registry.roles.find((r) => r.id === data.roleId) ?? null;
  const maxHp = hpMax(data.stats);
  const wound = woundState(data.hpCurrent, data.stats);
  const woundPenalty = woundCheckPenalty(wound);
  const humanityCeiling = humanityMaxWith(data.stats, data.cyberware);
  const psychosis = cyberpsychosisFor(data.humanityCurrent);

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
      setIssues((current) => ({ ...current, portrait: portraitErrorText(error) }));
    } finally {
      setUploading(false);
    }
  }

  function setPool(key: 'hpCurrent' | 'humanityCurrent', event: ChangeEvent<HTMLInputElement>) {
    const value = parseNumberInput(event);
    if (value === undefined) return;
    saveData({ [key]: value }, key);
  }

  return (
    <div className="cp-identity">
      <div className="cp-panel">
        <div className="cp-field cp-field--notch cp-portrait">
          {character.portraitUrl ? (
            <img src={character.portraitUrl} alt="Portret postaci" />
          ) : (
            <span className="cp-portrait-empty">brak portretu</span>
          )}
          <label className="cp-portrait-upload">
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
      </div>

      <div className="cp-panel">
        <div className="cp-field cp-field--notch cp-row">
          <span className="cp-label">Ksywa</span>
          <input
            type="text"
            maxLength={64}
            value={character.name}
            onChange={(e) => saveName(e.target.value)}
            aria-label="Ksywa"
          />
        </div>
        <div className="cp-field cp-row">
          <span className="cp-label">Rola</span>
          <select
            value={data.roleId ?? ''}
            onChange={(e) =>
              saveData({ roleId: e.target.value === '' ? null : e.target.value }, 'roleId')
            }
            aria-label="Rola"
          >
            <option value="">— brak —</option>
            {registry.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="cp-field cp-row cp-ability">
          <span className="cp-label">
            Zdolność
            <br />
            Specjalna
          </span>
          <span className="cp-ability-name" title={role?.ability ?? ''}>
            {role?.ability ?? '—'}
          </span>
          {role && (
            <span className="cp-rank" title="Ranga zdolności roli">
              <input
                type="number"
                min={ROLE_RANK_MIN}
                max={ROLE_RANK_MAX}
                value={data.roleAbilityRank}
                onChange={(e) => {
                  const value = parseNumberInput(e);
                  if (value !== undefined) saveData({ roleAbilityRank: value }, 'roleAbilityRank');
                }}
                aria-label={`Ranga: ${role.ability}`}
              />
            </span>
          )}
        </div>
        <div className="cp-field cp-notes">
          <span className="cp-label">Notatki</span>
          <textarea
            maxLength={10_000}
            value={data.notes}
            placeholder="Ścieżka życia, kontakty, wrogowie, cele…"
            onChange={(e) => saveData({ notes: e.target.value }, 'notes')}
            aria-label="Notatki"
          />
        </div>
      </div>

      <div className="cp-panel">
        <div
          className="cp-field cp-field--notch cp-pool"
          title="Człowieczeństwo: obecne z maksymalnego. Maksimum to EMP bazowe × 10 minus 2 za każdą cyborgizację (4 za borgizację)."
        >
          <span className="cp-label">Człowieczeństwo</span>
          <span className="cp-pool-value">
            <input
              type="number"
              min={HUMANITY_MIN}
              max={humanityCeiling}
              value={data.humanityCurrent}
              onChange={(e) => setPool('humanityCurrent', e)}
              aria-label="Człowieczeństwo"
            />
            <span className="cp-of">z</span>
            <span className="cp-pool-max">{humanityCeiling}</span>
          </span>
        </div>
      </div>

      <div className="cp-panel cp-pools">
        <div className="cp-field cp-field--notch cp-pool cp-span2" title="Punkty Wytrzymałości">
          <span className="cp-label">Punkty Wytrz.</span>
          <span className="cp-pool-value">
            <input
              type="number"
              min={0}
              max={maxHp}
              value={data.hpCurrent}
              onChange={(e) => setPool('hpCurrent', e)}
              aria-label="Punkty Wytrzymałości"
            />
            <span className="cp-of">z</span>
            <span className="cp-pool-max">{maxHp}</span>
          </span>
        </div>
        <div
          className="cp-field cp-pool cp-pool--flat"
          title="Próg stanu Poważnie ranny (połowa PW)"
        >
          <span className="cp-label">Poważnie Ranny</span>
          <span className="cp-pool-value">≤ {seriousWoundThreshold(data.stats)}</span>
        </div>
        <div
          className="cp-field cp-pool cp-pool--flat"
          title="Test Przeżywalności: rzuć poniżej tej wartości na 1k10"
        >
          <span className="cp-label">Przeżywalność</span>
          <span className="cp-pool-value">{deathSaveTarget(data.stats)}</span>
        </div>
        <p className="cp-note">−2 do wszystkich akcji kiedy Poważnie Ranny</p>
      </div>

      {wound !== 'healthy' && (
        <p className={`cp-alert${wound === 'mortal' ? '' : ' cp-alert--muted'}`}>
          <strong>{CPRED_WOUND_LABELS[wound]}</strong>
          {woundPenalty !== 0 && <span>−{Math.abs(woundPenalty)} do wszystkich testów</span>}
          {wound === 'mortal' && (
            <button
              type="button"
              title={`Rzuć 1k10 pod BC ${deathSaveTarget(data.stats)}. Każdy kolejny test jest o 1 trudniejszy.`}
              onClick={() => loadDeathSaveCup(character.id, character.name, data, registry)}
            >
              Test Przeżywalności
              {data.deathSaves > 0 ? ` (+${data.deathSaves})` : ''}
            </button>
          )}
        </p>
      )}

      {psychosis.level !== 'none' && (
        <p className="cp-alert" title="Empatia użyta w rzutach wynika z Człowieczeństwa (s. 229)">
          <strong>{psychosis.label}</strong>
          <span>{psychosis.note}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Pionowa kolumna cech — kolejność jak na wydruku (INT REF ZW TECH CHA SW SZ
 * RUCH BC EMP), skrót w prawym górnym rogu pola.
 *
 * Dwie cechy mają na karcie dodatkowe małe pole „z": Szczęście (ile puli
 * zostało) i Empatia (ile jej realnie działa po cyborgizacjach). Pierwsze jest
 * do wpisania, drugie liczy się z Człowieczeństwa i dlatego jest tylko do
 * odczytu — inaczej byłaby to druga, kłócąca się kopia tej samej liczby.
 */
function StatColumn({
  data,
  saveData,
  startRoll,
}: TabProps & {
  startRoll: (target: Omit<RollTarget, 'characterId' | 'characterName'>, shift: boolean) => void;
}) {
  const psychosis = cyberpsychosisFor(data.humanityCurrent);

  function setStat(statId: (typeof CPRED_STAT_IDS)[number], event: ChangeEvent<HTMLInputElement>) {
    const value = parseNumberInput(event);
    if (value === undefined) return;
    saveData({ stats: { ...data.stats, [statId]: value } }, `stats.${statId}`);
  }

  return (
    <div className="cp-panel cp-stats">
      {CPRED_STAT_IDS.map((id) => (
        <div key={id} className="cp-field cp-field--notch cp-stat">
          <button
            type="button"
            className="cp-stat-abbr"
            onClick={(e: MouseEvent) => startRoll({ kind: 'stat', statId: id }, e.shiftKey)}
            title={`Rzut: ${CPRED_STAT_LABELS[id].name} (Shift — bez okna)`}
          >
            {CPRED_STAT_LABELS[id].abbr}
          </button>
          <input
            className="cp-stat-value"
            type="number"
            min={CPRED_STAT_MIN}
            max={CPRED_STAT_MAX}
            value={data.stats[id]}
            onChange={(e) => setStat(id, e)}
            aria-label={CPRED_STAT_LABELS[id].name}
          />
          {id === 'luck' && (
            <span className="cp-stat-sub" title="Punkty Szczęścia, które jeszcze zostały">
              <span className="cp-of">z</span>
              <input
                type="number"
                min={0}
                max={data.stats.luck}
                value={data.luckCurrent}
                onChange={(e) => {
                  const value = parseNumberInput(e);
                  if (value !== undefined) saveData({ luckCurrent: value }, 'luckCurrent');
                }}
                aria-label="Szczęście: pula bieżąca"
              />
              <button
                type="button"
                className="cp-mini-button"
                onClick={() => saveData({ luckCurrent: data.stats.luck }, 'luckCurrent')}
                title="Odnów pulę Szczęścia (RAW: na początku każdej sesji)"
                disabled={data.luckCurrent >= data.stats.luck}
              >
                ↻
              </button>
            </span>
          )}
          {id === 'emp' && psychosis.emp !== data.stats.emp && (
            <span
              className="cp-stat-sub"
              title="Empatia użyta w rzutach — wynika z Człowieczeństwa (s. 229)"
            >
              <span className="cp-of">z</span>
              <span className="cp-stat-sub-value">{psychosis.emp}</span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Umiejętności w trzech kolumnach, jak na wydruku.
 *
 * Kolumna CECHA trzyma **wartość** cechy, nie jej skrót — tak jest na karcie
 * (skrót stoi przy nazwie umiejętności) i tylko tak sumę w kolumnie BAZA da się
 * sprawdzić wzrokiem.
 */
function SkillColumns({
  data,
  saveData,
  startRoll,
}: TabProps & {
  startRoll: (target: Omit<RollTarget, 'characterId' | 'characterName'>, shift: boolean) => void;
}) {
  const registry = useCharacterStore((s) => s.registry);
  const groups = useMemo(() => groupedSkills(registry), [registry]);
  // BAZA has to show what the roll will actually use: EMP follows Humanity
  // once there is chrome in the body (stage 23a), and a sheet that printed the
  // base value would disagree with every card the server sends back.
  const effective = effectiveCpredStats(data.stats, data.humanityCurrent);
  const columns = useMemo(() => layoutSkillColumns(groups, SKILL_COLUMN_COUNT), [groups]);

  function setLevel(skillId: string, event: ChangeEvent<HTMLInputElement>) {
    const value = parseNumberInput(event);
    if (value === undefined) return;
    saveData({ skills: { ...data.skills, [skillId]: value } }, 'skills');
  }

  return (
    <div className="sheet-skills">
      {columns.map((column, columnIndex) => (
        <div key={columnIndex} className="cp-panel cp-skill-col">
          {column.map((block, blockIndex) => (
            <Fragment key={`${block.label}-${blockIndex}`}>
              <div className="cp-bar">{block.label}</div>
              <div className="cp-bar cp-bar--th">Poz.</div>
              <div className="cp-bar cp-bar--th">Cecha</div>
              <div className="cp-bar cp-bar--th" title="Cecha + poziom">
                Baza
              </div>
              {block.skills.map((skill) => {
                const level = data.skills[skill.id] ?? 0;
                const abbr = CPRED_STAT_LABELS[skill.stat].abbr;
                const rollTitle = `Rzut: ${skill.name} (${abbr}) — Shift pomija okno`;
                // The rulebook blurb only exists in the private data files.
                const title = skill.description
                  ? `${skill.description}

${rollTitle}`
                  : rollTitle;
                return (
                  <Fragment key={skill.id}>
                    <div
                      className={`cp-field cp-skill-name${level > 0 ? ' cp-skill-name--trained' : ''}`}
                    >
                      <button
                        type="button"
                        className="cp-skill-roll"
                        onClick={(e: MouseEvent) =>
                          startRoll({ kind: 'skill', skillId: skill.id }, e.shiftKey)
                        }
                        title={title}
                      >
                        {skill.name}
                        {skill.multiplier === 2 ? ' (×2)' : ''}{' '}
                        <span className="cp-skill-stat-abbr">({abbr})</span>
                      </button>
                    </div>
                    <div className="cp-field cp-skill-cell">
                      <input
                        type="number"
                        min={SKILL_LEVEL_MIN}
                        max={SKILL_LEVEL_MAX}
                        value={level}
                        onChange={(e) => setLevel(skill.id, e)}
                        aria-label={`Poziom: ${skill.name}`}
                      />
                    </div>
                    <div className="cp-field cp-skill-cell">{effective[skill.stat]}</div>
                    <div className="cp-field cp-skill-cell">
                      <button
                        type="button"
                        className="cp-skill-base"
                        onClick={(e: MouseEvent) =>
                          startRoll({ kind: 'skill', skillId: skill.id }, e.shiftKey)
                        }
                        title={rollTitle}
                      >
                        {skillBase(effective[skill.stat], level)}
                      </button>
                    </div>
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Trzy szpalty umiejętności — tyle, ile drukuje strona pierwsza karty. */
const SKILL_COLUMN_COUNT = 3;

/** Kawałek kategorii przypadający na jedną szpaltę. */
interface SkillColumnBlock {
  label: string;
  skills: CpredSkillDefinition[];
}

/**
 * Rozkłada kategorie na szpalty tak, żeby wyszły równej wysokości.
 *
 * Kategoria **może** przejść przez granicę szpalty — wtedy następna zaczyna się
 * od powtórzonej belki z tą samą nazwą. Tak robi wydruk („Edukacja" stoi na
 * karcie dwa razy) i tylko tak szpalty kończą się w jednej linii: sama „Edukacja"
 * to prawie jedna trzecia listy, więc przy podziale bez rozcinania pierwsza
 * szpalta wychodziła o połowę dłuższa od pozostałych.
 *
 * Miarą jest liczba wierszy: belka kategorii plus jej umiejętności.
 */
function layoutSkillColumns(
  groups: readonly { label: string; skills: CpredSkillDefinition[] }[],
  count: number,
): SkillColumnBlock[][] {
  const columns: SkillColumnBlock[][] = Array.from({ length: count }, () => []);
  const totalRows = groups.reduce((sum, group) => sum + group.skills.length + 1, 0);
  if (totalRows === 0) return columns;
  const target = Math.ceil(totalRows / count);

  let column = 0;
  let height = 0;
  for (const group of groups) {
    let taken = 0;
    while (taken < group.skills.length) {
      if (height >= target && column < count - 1) {
        column += 1;
        height = 0;
      }
      const left = group.skills.length - taken;
      // −1 na belkę kategorii; co najmniej jeden wiersz, żeby pętla zawsze ruszała.
      const room = Math.max(1, target - height - 1);
      const take = column === count - 1 ? left : Math.min(room, left);
      columns[column]!.push({
        label: group.label,
        skills: group.skills.slice(taken, taken + take),
      });
      height += take + 1;
      taken += take;
    }
  }
  return columns;
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
 * What kind of round sits in this weapon's magazine (stage 16g).
 *
 * A `select` rather than a free text field, because the catalogue already knows
 * which rounds fit: „naboje … należy dopasować do rodzaju używanej broni"
 * (s. 344), so a shotgun offers shot and a bow does not.
 *
 * The change travels through `weapon:reload` rather than through a sheet edit,
 * and that is the whole of the „zmiana naboju kosztuje Przeładowanie" decision:
 * out of a fight the event finds no budget to charge, in one it books the Action
 * and fills the magazine, exactly as swapping a magazine does at the table.
 */
function AmmoPicker({
  characterId,
  row,
  resolved,
}: {
  characterId: string;
  row: CpredWeaponRow;
  resolved: ResolvedWeapon | null;
}) {
  const entries = useCompendiumStore((s) => s.entries);
  const order = useCompendiumStore((s) => s.order);
  const options = useMemo(() => {
    const catalogue = order
      .map((id) => entries[id])
      .filter((entry): entry is CompendiumEntry => !!entry)
      .filter(isAmmoEntry)
      .map(toAmmoProfile);
    return ammoOptionsFor(catalogue, resolved);
  }, [entries, order, resolved]);

  // A weapon the catalogue has told nothing about — a hand-typed row, a melee
  // weapon — has no rounds to choose between, and an empty dropdown next to it
  // would be one more thing to explain.
  if (options.length === 0) return null;
  const loaded = row.ammoId && options.some((ammo) => ammo.id === row.ammoId) ? row.ammoId : '';
  const forced = resolved?.ammoIds?.length === 1;

  return (
    <select
      className="weapon-ammo-type"
      value={loaded}
      disabled={forced}
      aria-label={`Rodzaj naboju: ${row.name}`}
      title={
        forced
          ? 'Ta broń strzela tylko jednym rodzajem amunicji.'
          : 'Rodzaj naboju w magazynku. Zmiana w trakcie walki kosztuje Akcję (Przeładowanie) i ładuje magazynek do pełna.'
      }
      onChange={(e) => reloadWeapon(characterId, row.id, e.target.value || null)}
    >
      <option value="">Zwykła</option>
      {options.map((ammo) => (
        <option key={ammo.id} value={ammo.id}>
          {ammo.name}
        </option>
      ))}
    </select>
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
                  <AmmoPicker characterId={character.id} row={row} resolved={resolved} />
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
                      saveData({ weapons: data.weapons.filter((r) => r.id !== row.id) }, 'weapons')
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
            <th style={{ width: '4.5rem' }}>Kara</th>
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
              {/* Stage 14c: heavy armor slows the wearer (REF/ZW/RUCH). The
                  turn budget reads exactly this field, and only from worn
                  pieces — the worst one counts, they do not add up (s. 185). */}
              <td>
                <input
                  type="number"
                  min={ARMOR_PENALTY_MIN}
                  max={0}
                  value={row.penalty ?? 0}
                  onChange={(e) => {
                    const value = parseNumberInput(e);
                    if (value === undefined) return;
                    const clamped = Math.min(0, Math.max(ARMOR_PENALTY_MIN, value));
                    update(row.id, { penalty: clamped === 0 ? undefined : clamped });
                  }}
                  aria-label="Kara pancerza do REF/ZW/RUCH"
                  title="Kara do REF, ZW i RUCH-u. Liczy się najgorsza z noszonych sztuk, kary się nie sumują."
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
            {/*
              A wound that heals by itself (stage 16h). Worth a badge of its own
              rather than a line in the effect text: „czy to zejdzie samo" is the
              first thing a player asks about a blinded eye, and the answer
              differs depending on whether a fight is running.
            */}
            {injury.timed ? (
              <span className="injury-roll" title={injury.timed.source}>
                {describeCpredTimer(injury.timed)}
              </span>
            ) : null}
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

function GearTab({ character, data, saveData }: TabProps & { character: CharacterSheetView }) {
  return (
    <div className="sheet-gear">
      <WalletSection character={character} data={data} saveData={saveData} />

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

      <CyberwareSection characterId={character.id} data={data} saveData={saveData} />
    </div>
  );
}

/**
 * The wallet (stage 23b).
 *
 * The balance stopped being a field and became a **read-out**: every eddie that
 * moves does so through a server event, so a player looks at their money and
 * the GM corrects it — and even the correction lands in the audit under
 * „korekta MG". What the sheet still owns is the Lifestyle picker, because that
 * is a choice, not a transaction.
 */
function WalletSection({
  character,
  data,
  saveData,
}: {
  character: CharacterSheetView;
  data: CpredCharacterData;
  saveData: TabProps['saveData'];
}) {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const [entries, setEntries] = useState<LedgerEntryView[]>([]);
  const [payees, setPayees] = useState<{ id: string; name: string }[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [payeeId, setPayeeId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);

  const characterId = character.id;
  const balance = data.eddies;
  // The server's own timestamp, and deliberately not `balance`: a sheet edit
  // lands in the store optimistically (`localPatch`), so the new number is
  // already there before the request goes out — a refetch keyed on it would
  // read the ledger a moment too early and show the row that is still missing.
  const savedAt = character.updatedAt;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void fetchLedger(characterId).then((ack) => {
      if (!alive || !ack.ok || !ack.data) return;
      setEntries(ack.data.entries);
      setPayees(ack.data.payees);
    });
    return () => {
      alive = false;
    };
  }, [characterId, open, savedAt]);

  async function send() {
    const value = Number.parseInt(amount, 10);
    if (!payeeId || !Number.isInteger(value) || value <= 0) {
      setNote('Podaj kwotę i odbiorcę.');
      return;
    }
    const ack = await transferEddies({
      fromCharacterId: characterId,
      toCharacterId: payeeId,
      amount: value,
      ...(reason.trim() ? { note: reason.trim() } : {}),
    });
    if (!ack.ok) {
      setNote(economyErrorText(ack.error));
      return;
    }
    setAmount('');
    setReason('');
    const name = payees.find((p) => p.id === payeeId)?.name ?? 'odbiorcy';
    setNote(`Przelano ${formatEddies(value)} ed do: ${name}.`);
  }

  const lifestyle = data.lifestyle;
  const monthly = lifestyle ? monthlyCostOf(lifestyle) : null;

  return (
    <section className="sheet-wallet">
      <div className="wallet-head">
        <span className="wallet-balance" title="Eurodolce (ed) — zmienia je wyłącznie serwer">
          {formatEddies(balance)} ed
        </span>
        {isGm ? (
          <label className="wallet-adjust" title="Korekta MG — wpis „korekta MG” w historii">
            korekta
            <input
              type="number"
              min={0}
              max={10_000_000}
              value={balance}
              onChange={(e) => {
                const value = parseNumberInput(e);
                if (value !== undefined) saveData({ eddies: value }, 'eddies');
              }}
            />
          </label>
        ) : null}
        <button
          type="button"
          className="small-button"
          onClick={() => setOpen((current) => !current)}
          title="Historia operacji i przelew"
        >
          {open ? 'Zwiń kasę' : 'Kasa…'}
        </button>
      </div>

      {open ? (
        <div className="wallet-body">
          <div className="wallet-transfer">
            <select value={payeeId} onChange={(e) => setPayeeId(e.target.value)}>
              <option value="">— przelew do… —</option>
              {payees.map((payee) => (
                <option key={payee.id} value={payee.id}>
                  {payee.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              placeholder="ed"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <input
              type="text"
              maxLength={120}
              placeholder="za co (opcjonalnie)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button type="button" className="small-button" onClick={() => void send()}>
              Przelej
            </button>
          </div>

          <label className="wallet-lifestyle">
            Poziom życia
            <select
              value={lifestyle?.level ?? ''}
              onChange={(e) => {
                const level = e.target.value;
                if (!isLifestyleLevel(level)) {
                  saveData({ lifestyle: null }, 'lifestyle');
                  return;
                }
                saveData(
                  { lifestyle: { level, housing: lifestyle?.housing ?? 'street' } },
                  'lifestyle',
                );
              }}
            >
              <option value="">— nie rozliczam —</option>
              {LIFESTYLE_LEVELS.map((level) => (
                <option key={level} value={level} title={LIFESTYLE_DEFINITIONS[level].note}>
                  {LIFESTYLE_DEFINITIONS[level].label} —{' '}
                  {formatEddies(LIFESTYLE_DEFINITIONS[level].monthly)} ed
                </option>
              ))}
            </select>
          </label>
          <label className="wallet-lifestyle">
            Zakwaterowanie
            <select
              value={lifestyle?.housing ?? 'street'}
              disabled={!lifestyle}
              onChange={(e) => {
                const housing = e.target.value;
                if (!lifestyle || !isHousingOption(housing)) return;
                saveData({ lifestyle: { ...lifestyle, housing } }, 'lifestyle');
              }}
            >
              {HOUSING_OPTIONS.map((option) => (
                <option key={option} value={option} title={HOUSING_DEFINITIONS[option].note}>
                  {HOUSING_DEFINITIONS[option].label}
                  {HOUSING_DEFINITIONS[option].rent > 0
                    ? ` — ${formatEddies(HOUSING_DEFINITIONS[option].rent)} ed`
                    : ' — bez czynszu'}
                </option>
              ))}
            </select>
          </label>
          {monthly ? (
            <p className="sheet-hint">
              Pierwszego dnia miesiąca: {formatEddies(monthly.total)} ed (jedzenie{' '}
              {formatEddies(monthly.lifestyle)} + czynsz {formatEddies(monthly.rent)}). Pobiera je
              MG przyciskiem „Rozlicz miesiąc”.
            </p>
          ) : (
            <p className="sheet-hint">
              Bez Poziomu życia ta postać nie jest rozliczana co miesiąc (tak zostają NPC-e i
              statyści).
            </p>
          )}

          <h4>Historia operacji</h4>
          {entries.length === 0 ? (
            <p className="sheet-hint">Na tym koncie nic się jeszcze nie zdarzyło.</p>
          ) : (
            <ul className="wallet-ledger">
              {entries.map((row) => (
                <li key={row.id}>
                  <span
                    className={row.amount < 0 ? 'ledger-out' : 'ledger-in'}
                    title={new Date(row.createdAt).toLocaleString('pl-PL')}
                  >
                    {formatLedgerAmount(row.amount)}
                  </span>
                  <span className="ledger-label">
                    {LEDGER_KIND_LABELS[row.kind]}: {row.label}
                  </span>
                  <span className="ledger-balance">{formatEddies(row.balance)} ed</span>
                </li>
              ))}
            </ul>
          )}
          {note ? <p className="compendium-note">{note}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Installed chrome (stage 23a).
 *
 * Not a `RowTable`: adding a row here is not an edit but a *procedure* — the
 * server rolls what it costs — so the table has no „add" button at all. New
 * hardware arrives from the Compendium tab, and the only thing the sheet lets
 * you edit is the note beside it.
 */
function CyberwareSection({
  characterId,
  data,
  saveData,
}: {
  characterId: string;
  data: CpredCharacterData;
  saveData: TabProps['saveData'];
}) {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const capacity = cyberwareCapacity(data.cyberware);
  const [confirmRow, setConfirmRow] = useState<string | null>(null);
  const [freeTherapy, setFreeTherapy] = useState(false);

  function updateNotes(rowId: string, notes: string) {
    saveData(
      { cyberware: data.cyberware.map((row) => (row.id === rowId ? { ...row, notes } : row)) },
      'cyberware',
    );
  }

  return (
    <>
      <h3>Cyborgizacje</h3>
      {data.cyberware.length === 0 ? (
        <p className="sheet-hint">
          Brak wszczepów. Cyborgizacje instaluje się z zakładki „Kompendium” — serwer rzuca wtedy na
          Utratę Człowieczeństwa.
        </p>
      ) : (
        <>
          <ul className="cyberware-capacity">
            {capacity.map((family) => (
              <li
                key={family.type}
                className={
                  family.missingFoundation || family.used > family.capacity
                    ? 'capacity-over'
                    : undefined
                }
                title={
                  family.pool
                    ? 'Rodzina bez cyborgizacji podstawowej — limit 7 sztuk (s. 111)'
                    : 'Gniazda modyfikacji dawane przez cyborgizacje podstawowe tej rodziny'
                }
              >
                {family.label}: {family.used} / {family.capacity}
                {family.missingFoundation && ' — brak cyborgizacji podstawowej'}
              </li>
            ))}
          </ul>
          <div className="row-table-wrap">
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Nazwa</th>
                  <th style={{ width: '9rem' }}>Rodzina</th>
                  <th style={{ width: '5rem' }}>UC</th>
                  <th>Uwagi</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.cyberware.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.name}
                      {row.foundation && (
                        <span className="cyberware-foundation" title="Cyborgizacja podstawowa">
                          {' '}
                          ⬡ {row.slots ?? 0} gniazd
                        </span>
                      )}
                    </td>
                    <td className="cyberware-family">
                      {row.type ? CYBERWARE_TYPE_LABELS[row.type] : '—'}
                      {row.install && (
                        <span className="cyberware-install">
                          {' · '}
                          {CYBERWARE_INSTALL_LABELS[row.install]}
                        </span>
                      )}
                    </td>
                    <td title="Człowieczeństwo, które ten wszczep zabrał przy montażu">
                      {row.humanityLoss ? `−${row.humanityLoss}` : '—'}
                    </td>
                    <td>
                      <input
                        type="text"
                        maxLength={200}
                        value={row.notes}
                        onChange={(e) => updateNotes(row.id, e.target.value)}
                      />
                    </td>
                    <td>
                      {/* Dwustopniowo, jak kosz przy wpisie wiedzy z 19b:
                          usunięcie wszczepu podnosi sufit Człowieczeństwa
                          i zostawia ślad na czacie. */}
                      <button
                        type="button"
                        className="small-button character-delete"
                        onClick={() => {
                          if (confirmRow !== row.id) {
                            setConfirmRow(row.id);
                            return;
                          }
                          setConfirmRow(null);
                          sendCyberwareAction({ characterId, action: 'remove', rowId: row.id });
                        }}
                        title="Usuń wszczep (sufit Człowieczeństwa wraca, punkty nie)"
                      >
                        {confirmRow === row.id ? 'Tak, usuń' : '✕'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {isGm && (
        <div className="cyberware-therapy">
          <span title="Tydzień terapii u Medyka (s. 230). PT rozstrzyga MG — VTT rzuca sam zysk.">
            Terapia:
          </span>
          {HUMANITY_THERAPIES.map((therapy) => (
            <button
              key={therapy}
              type="button"
              className="small-button"
              onClick={() =>
                sendCyberwareAction({
                  characterId,
                  action: 'therapy',
                  therapy,
                  ...(freeTherapy ? { payment: 'none' as const } : {}),
                })
              }
              title={`${HUMANITY_THERAPY_DEFINITIONS[therapy].label} — PT ${
                HUMANITY_THERAPY_DEFINITIONS[therapy].dv
              }, ${HUMANITY_THERAPY_DEFINITIONS[therapy].cost} ed`}
            >
              +{HUMANITY_THERAPY_DEFINITIONS[therapy].notation}
            </button>
          ))}
          {/* Stage 23b: the week costs 500 / 1000 ed (s. 375) and comes off the
              sheet. „Bez opłaty" is the GM's waiver — a favour, a debt, a job. */}
          <label title="Nie pobieraj eurodolców za terapię">
            <input
              type="checkbox"
              checked={freeTherapy}
              onChange={(e) => setFreeTherapy(e.target.checked)}
            />
            bez opłaty
          </label>
        </div>
      )}
    </>
  );
}

/**
 * Zakładka „Biografia” — dziś sama Reputacja.
 *
 * Portret i pole „Notatki” przeniosły się na stronę pierwszą (etap 27a), bo tam
 * drukuje je oficjalna karta — a dwa edytory tego samego pola tylko mylą.
 * Ścieżka Życia rozpisana na pola zamiast jednego pola prozy to etap 27c.
 */
function BioTab({ data, saveData }: TabProps) {
  return (
    <div className="sheet-bio">
      <ReputationSection data={data} saveData={saveData} />
    </div>
  );
}

/**
 * Reputacja (stage 23c) — the number and the deeds behind it.
 *
 * The number is not editable, and that is the whole design: RAW replaces a
 * Reputation only with a higher one, so the deed list *is* the value and a
 * field beside it would be a second, disagreeing copy. The GM adds deeds; the
 * player reads them (the server refuses their patch either way).
 */
function ReputationSection({
  data,
  saveData,
}: {
  data: CpredCharacterData;
  saveData: TabProps['saveData'];
}) {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const sources = data.reputationSources;
  const current = cpredReputation(sources);

  function write(rows: CpredReputationSource[]) {
    saveData({ reputationSources: rows }, 'reputationSources');
  }

  function addDeed() {
    write([
      ...sources,
      {
        id: newRowId(),
        level: 1,
        note: '',
        // Today, as the GM would have written it — a deed with no date reads
        // like a deed that never happened.
        at: new Date().toISOString().slice(0, 10),
      },
    ]);
  }

  function patchDeed(id: string, patch: Partial<CpredReputationSource>) {
    write(
      sources.map((row) =>
        row.id === id
          ? {
              ...row,
              ...patch,
              // `notorious: false` must leave the row, not sit in it as a lie
              // about the shape the validator produces.
              ...(patch.notorious === false ? { notorious: undefined } : {}),
            }
          : row,
      ) as CpredReputationSource[],
    );
  }

  if (!isGm && sources.length === 0) return null;

  return (
    <section className="sheet-reputation">
      <div className="reputation-head">
        <span
          className={`reputation-value ${current.notorious ? 'reputation-value--bad' : ''}`}
          title={
            current.notorious
              ? 'Zła sława — w Konfrontacji liczy się jako wartość ujemna'
              : 'Reputacja — wchodzi do Konfrontacji jako CHA + Reputacja + 1k10'
          }
        >
          Reputacja {current.notorious ? `−${current.level}` : current.level}
        </span>
        <span className="reputation-reach">
          {current.level > 0
            ? (REPUTATION_LEVEL_REACH[current.level] ?? '')
            : 'Nikt o tobie nie słyszał.'}
        </span>
        {isGm && (
          <button
            type="button"
            className="small-button"
            onClick={addDeed}
            disabled={sources.length >= REPUTATION_SOURCE_ROWS_MAX}
            title="Reputację przyznaje MG za czyny postaci (s. 193)"
          >
            + Wyczyn
          </button>
        )}
      </div>

      {sources.length > 0 && (
        <ul className="reputation-list">
          {sources.map((row) => (
            <li
              key={row.id}
              className={`reputation-row ${row.id === current.source?.id ? 'reputation-row--current' : ''}`}
            >
              {isGm ? (
                <>
                  <input
                    className="reputation-level"
                    type="number"
                    min={REPUTATION_LEVEL_MIN}
                    max={REPUTATION_LEVEL_MAX}
                    value={row.level}
                    title="Poziom 1–10 wg tabeli na s. 193"
                    onChange={(e) => {
                      const value = parseNumberInput(e);
                      if (value !== undefined) patchDeed(row.id, { level: value });
                    }}
                  />
                  <input
                    className="reputation-note"
                    type="text"
                    maxLength={REPUTATION_NOTE_MAX_LENGTH}
                    value={row.note}
                    placeholder="Za co — np. koncert w Afterlife"
                    onChange={(e) => patchDeed(row.id, { note: e.target.value })}
                  />
                  <label className="reputation-bad" title="Zła sława — w Konfrontacji na minus">
                    <input
                      type="checkbox"
                      checked={row.notorious === true}
                      onChange={(e) => patchDeed(row.id, { notorious: e.target.checked })}
                    />
                    zła
                  </label>
                  <span className="reputation-date">{row.at ?? ''}</span>
                  <button
                    type="button"
                    className="small-button"
                    title="Usuń wyczyn"
                    onClick={() => write(sources.filter((entry) => entry.id !== row.id))}
                  >
                    🗑
                  </button>
                </>
              ) : (
                <>
                  <span className="reputation-level">
                    {row.notorious ? `−${row.level}` : row.level}
                  </span>
                  <span className="reputation-note">{row.note || '—'}</span>
                  <span className="reputation-date">{row.at ?? ''}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
