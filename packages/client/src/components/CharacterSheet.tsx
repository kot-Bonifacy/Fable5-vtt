import { Fragment, useEffect, useMemo, useState, type ChangeEvent, type MouseEvent } from 'react';
import type {
  ArmorLocation,
  CompendiumEntry,
  CpredArmorRow,
  CpredSkillDefinition,
  CpredAttackMode,
  CpredCharacterData,
  CpredCyberdeck,
  CpredCyberwareRow,
  CpredNetInstallRow,
  CpredItemRow,
  CpredLifepath,
  CpredLifepathEnemy,
  CpredLifepathPerson,
  CpredReputationSource,
  CyberwareBodySlot,
  CpredWeaponRow,
  CriticalInjuryEntry,
  LedgerEntryView,
  PortraitUploadResult,
  ResolvedWeapon,
} from '@vtt/shared';
import {
  CPRED_LANGUAGE_SKILL_ID,
  CRITICAL_INJURY_TABLE_LABELS,
  CYBERDECK_SLOTS_MAX,
  SKILL_SPECIALTY_MAX_LENGTH,
  cpredSkillLabel,
  cpredSkillNeedsSpecialty,
  cpredSkillSpecialty,
  isCriticalInjuryEntry,
  cyberdeckEntries,
  cyberdeckSlotsFree,
  cyberdeckSlotsUsed,
  isGearEntry,
  isProgramEntry,
  netProgramProfileOf,
  netProgramSlots,
  programEntries,
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
  CYBERWARE_BODY_SLOT_LABELS,
  CYBERWARE_INSTALL_LABELS,
  CYBERWARE_TYPE_LABELS,
  HOUSING_DEFINITIONS,
  HOUSING_OPTIONS,
  HUMANITY_MIN,
  HUMANITY_THERAPIES,
  HUMANITY_THERAPY_DEFINITIONS,
  IMPROVEMENT_POINTS_MAX,
  LEDGER_KIND_LABELS,
  LIFEPATH_ENEMY_COLUMNS,
  LIFEPATH_GROUP_MAX,
  LIFEPATH_LINE_MAX_LENGTH,
  LIFEPATH_SHEET_FIELDS,
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
  SHEET_LINE_MAX_LENGTH,
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  ammoOptionsFor,
  bodySlotsForType,
  cpredReputation,
  cyberpsychosisFor,
  cyberwareCapacity,
  deathSaveTarget,
  effectiveArmor,
  emptyLifepathEnemy,
  emptyLifepathPerson,
  effectiveCpredStats,
  formatEddies,
  formatLedgerAmount,
  groupedSkills,
  hpMax,
  humanityMaxWith,
  isAmmoEntry,
  isCyberwareBodySlot,
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
  CPRED_COMBAT_AWARENESS_ABILITY,
  cpredFieldRepairMinutes,
  cpredRoleAbilityRank,
  cpredSheetFabrication,
  cpredTreatmentOptions,
  describeCareOptions,
  CPRED_BACKUP_ABILITY,
  CPRED_CHARISMA_ABILITY,
  CPRED_CREDIBILITY_ABILITY,
  CPRED_FABRICATION_ABILITY,
  CPRED_MEDICINE_ABILITY,
  CPRED_MOTO_ABILITY,
  CPRED_OPERATOR_ABILITY,
  CPRED_TEAMWORK_ABILITY,
} from '@vtt/shared';
import { apiUpload } from '../api.js';
import { UPLOAD_ACCEPT_ATTRIBUTE, uploadRequirementText } from '@vtt/shared';
import { fileRejectionText, uploadErrorText } from '../uploads.js';
import { CombatAwarenessPanel } from './CombatAwarenessPanel.js';
import { SpecialtyPanel } from './SpecialtyPanel.js';
import { BackupPanel } from './BackupPanel.js';
import { TeamPanel } from './TeamPanel.js';
import { CharismaPanel } from './CharismaPanel.js';
import { OperatorPanel } from './OperatorPanel.js';
import { MotoPanel } from './MotoPanel.js';
import { CredibilityPanel } from './CredibilityPanel.js';
import { TreatInjury } from './TreatInjury.js';
import { CyberwareBody } from './CyberwareBody.js';
import { FacedownFromSheet } from './FacedownLauncher.js';
import {
  assignCriticalInjury,
  economyErrorText,
  endFieldRepair,
  fetchLedger,
  flushCharacterSave,
  makeFieldRepair,
  queueCharacterSave,
  reloadWeapon,
  sendCyberwareAction,
  transferEddies,
} from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { AdvancementPanel } from './AdvancementPanel.js';
import { PortraitPicker } from './PortraitPicker.js';
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
import { useWindowPlacement } from '../window-placement.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';

type SheetTab = 'stats' | 'bio' | 'chrome' | 'gear';

/**
 * Zakładki idą za stronami wydruku, nie za tematami.
 *
 * „Walka" zniknęła w etapie 27b: broń, pancerz i rany krytyczne drukują się na
 * stronie pierwszej, więc tam wróciły. Zostawienie po nich pustej zakładki
 * znaczyłoby, że to samo mieszka w dwóch miejscach. W 27c doszły dwie
 * pozostałe strony arkusza — Ścieżka Życia i sylwetka cyborgizacji — i stoją
 * w kolejności druku; „Ekwipunek" zostaje na końcu, bo nie ma własnej strony.
 */
const TABS: { id: SheetTab; label: string }[] = [
  { id: 'stats', label: 'Karta' },
  { id: 'bio', label: 'Ścieżka Życia' },
  { id: 'chrome', label: 'Cyborgizacje' },
  { id: 'gear', label: 'Ekwipunek' },
];

/** Short row id (validation caps ids at 32 chars — crypto UUIDs are longer). */
function newRowId(): string {
  return Math.random().toString(36).slice(2, 10);
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
  const placement = useWindowPlacement(`sheet:${characterId}`, () => ({
    x: 90 + (stackIndex % 6) * 28,
    y: 70 + (stackIndex % 6) * 24,
  }));
  const [issues, setIssues] = useState<Record<string, string>>({});

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

  const issueList = Object.values(issues);
  const saveLabel =
    saveState === 'saving' ? 'Zapisywanie…' : saveState === 'error' ? 'Błąd zapisu!' : '';
  const roleName = registry.roles.find((r) => r.id === data.roleId)?.name ?? '';

  return (
    <section
      ref={placement.ref}
      className="sheet-window"
      style={{ ...placement.style, zIndex: 300 + stackIndex }}
      onPointerDown={() => focusSheet(characterId)}
      aria-label={`Karta postaci: ${character.name}`}
    >
      <div className="sheet-header" {...placement.dragProps}>
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
          aria-label="Zamknij kartę"
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
        {tab === 'gear' && <GearTab character={character} data={data} saveData={saveData} />}
        {tab === 'bio' && <LifepathPage character={character} data={data} saveData={saveData} />}
        {tab === 'chrome' && (
          <ChromePage characterId={character.id} data={data} saveData={saveData} />
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
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}

interface TabProps {
  data: CpredCharacterData;
  saveData: (patch: Partial<CpredCharacterData>, fieldKey: string) => void;
}

/**
 * Strona pierwsza karty — układ oficjalnego arkusza CP RED (etap 27a + 27b).
 *
 * Trzy kolumny wydruku, od lewej: tożsamość (portret, ksywa, rola, zdolność,
 * notatki, pule, rany krytyczne, uzależnienia), pionowa kolumna dziesięciu cech
 * i umiejętności rozłożone na trzy kolumny. Pod nimi, przez całą szerokość, pas
 * „Broń i pancerz" — dokładnie tam, gdzie drukuje go karta (27b). Wszystko, co
 * karta umiała wcześniej — rzut z cechy, atak z wiersza broni, Test
 * Przeżywalności, ostrzeżenie o cyberpsychozie — siedzi dalej w tych samych
 * miejscach, tylko ubrane w papier.
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
      <Arsenal character={character} data={data} saveData={saveData} startRoll={startRoll} />
    </div>
  );
}

/**
 * Dolny pas strony pierwszej: „Broń i pancerz" (etap 27b).
 *
 * Na wydruku to jeden blok pod trzema kolumnami i tak samo jest tutaj — pas
 * rozciąga się przez całą szerokość siatki strony.
 */
function Arsenal({
  character,
  data,
  saveData,
  startRoll,
}: TabProps & {
  character: CharacterSheetView;
  startRoll: (target: Omit<RollTarget, 'characterId' | 'characterName'>, shift: boolean) => void;
}) {
  return (
    <section className="cp-arsenal">
      <h3 className="cp-section">Broń i pancerz</h3>
      <WeaponStrip character={character} data={data} saveData={saveData} startRoll={startRoll} />
      <ArmorStrip character={character} data={data} saveData={saveData} />
    </section>
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
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
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
    const rejection = fileRejectionText(file, 'portrait');
    if (rejection) {
      setIssues((current) => ({ ...current, portrait: rejection }));
      return;
    }
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
      setIssues((current) => ({ ...current, portrait: uploadErrorText(error, 'portrait') }));
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
          {/* Wgranie własnego pliku zostało **przy MG** (23.08) — gracz
              wybiera portret z puli kampanii pod ramką. */}
          {isGm ? (
            <label className="cp-portrait-upload">
              {uploading ? 'Wgrywanie…' : 'Wgraj portret'}
              <input
                type="file"
                accept={UPLOAD_ACCEPT_ATTRIBUTE}
                title={uploadRequirementText('portrait')}
                onChange={(e) => void uploadPortrait(e)}
                disabled={uploading}
                hidden
              />
            </label>
          ) : null}
        </div>
        <PortraitPicker
          selectedUrl={character.portraitUrl}
          onPick={(url) => {
            queueCharacterSave(character.id, { portraitUrl: url });
            flushCharacterSave(character.id);
          }}
        />
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
          {/* Etap 29a: Rolę i rangę pisze MG albo płatny awans. Gracz, który
              przełącza Rolę pod zachowaną rangą, dostaje inną Zdolność
              Specjalną na tym samym poziomie za darmo. */}
          <select
            value={data.roleId ?? ''}
            disabled={!isGm}
            title={isGm ? undefined : 'Rolę zmienia MG.'}
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
                readOnly={!isGm}
                title={
                  isGm
                    ? undefined
                    : 'Poziom Zdolności kupuje się PD — patrz „Awans” na stronie drugiej.'
                }
                onChange={(e) => {
                  const value = parseNumberInput(e);
                  if (value !== undefined) saveData({ roleAbilityRank: value }, 'roleAbilityRank');
                }}
                aria-label={`Ranga: ${role.ability}`}
              />
            </span>
          )}
        </div>
        {/* Etap 30a: jedyna Zdolność Specjalna, której punkty się rozdziela —
            reszta Ról ma samą rangę. Panel siedzi pod wierszem Zdolności, bo
            to jej rozwinięcie, a nie osobna część karty. */}
        {cpredRoleAbilityRank(data, registry, CPRED_COMBAT_AWARENESS_ABILITY) !== null && (
          <div className="cp-field cp-awareness">
            <CombatAwarenessPanel characterId={character.id} />
          </div>
        )}
        {/* Etap 30b: dwie kolejne Zdolności, których punkty się rozdziela —
            Medycyna Medyka i Twórca Technika. Stoją w tym samym miejscu, co
            panel Solo, bo to ta sama część karty: rozwinięcie wiersza wyżej. */}
        {cpredRoleAbilityRank(data, registry, CPRED_MEDICINE_ABILITY) !== null && (
          <div className="cp-field cp-awareness">
            <SpecialtyPanel characterId={character.id} ability="medicine" />
          </div>
        )}
        {cpredRoleAbilityRank(data, registry, CPRED_FABRICATION_ABILITY) !== null && (
          <div className="cp-field cp-awareness">
            <SpecialtyPanel characterId={character.id} ability="fabrication" />
          </div>
        )}
        {/* Etap 30c: dwie Zdolności, które stawiają na mapie cudzych ludzi —
            Wsparcie Stróża Prawa i zespół Korpo. Stoją w tym samym miejscu, co
            trzy panele wyżej, bo to nadal rozwinięcie wiersza Zdolności. */}
        {cpredRoleAbilityRank(data, registry, CPRED_BACKUP_ABILITY) !== null && (
          <div className="cp-field cp-awareness">
            <BackupPanel characterId={character.id} />
          </div>
        )}
        {cpredRoleAbilityRank(data, registry, CPRED_TEAMWORK_ABILITY) !== null && (
          <div className="cp-field cp-awareness">
            <TeamPanel characterId={character.id} />
          </div>
        )}
        {/* Etap 30d: cztery ostatnie Zdolności — Rockera, Fixera, Nomady
            i Media. Żadna nie dotyka walki, więc żadna nie ma domu w pasku
            akcji: stoją tylko tutaj, pod wierszem Zdolności, jak sześć
            wcześniejszych. */}
        {cpredRoleAbilityRank(data, registry, CPRED_CHARISMA_ABILITY) !== null && (
          <div className="cp-field cp-awareness">
            <CharismaPanel characterId={character.id} />
          </div>
        )}
        {cpredRoleAbilityRank(data, registry, CPRED_OPERATOR_ABILITY) !== null && (
          <div className="cp-field cp-awareness">
            <OperatorPanel characterId={character.id} />
          </div>
        )}
        {cpredRoleAbilityRank(data, registry, CPRED_MOTO_ABILITY) !== null && (
          <div className="cp-field cp-awareness">
            <MotoPanel characterId={character.id} />
          </div>
        )}
        {cpredRoleAbilityRank(data, registry, CPRED_CREDIBILITY_ABILITY) !== null && (
          <div className="cp-field cp-awareness">
            <CredibilityPanel characterId={character.id} />
          </div>
        )}
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

      <CriticalInjuries data={data} saveData={saveData} characterId={character.id} />

      <div className="cp-panel">
        <div
          className="cp-field cp-notes cp-addictions"
          title="Na czym postać siedzi — dorph, black lace, karta kredytowa. Przy stole to fabuła, nie modyfikator."
        >
          <span className="cp-label">Uzależnienia</span>
          <textarea
            maxLength={SHEET_LINE_MAX_LENGTH}
            value={data.addictions}
            onChange={(e) => saveData({ addictions: e.target.value }, 'addictions')}
            aria-label="Uzależnienia"
          />
        </div>
      </div>
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
                aria-label="Odnów pulę Szczęścia (RAW: na początku każdej sesji)"
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
 * Podpowiedzi dla Umiejętności, które podręcznik każe nazwać (s. 81).
 *
 * Przykłady wprost z opisów w `skills.json` — bo to lista przykładów, nie enum:
 * „Przykładowe specjalizacje to: Geologia, Matematyka, Fizyka…". Nazwa spoza
 * listy jest równie poprawna, więc to `placeholder`, nie walidacja.
 */
const SPECIALTY_HINTS: Record<string, string> = {
  science: 'np. Fizyka, Chemia, Historia',
  'local-expert': 'np. Watson, Pacifica',
  'play-instrument': 'np. gitara, śpiew',
  'martial-arts': 'np. karate, aikido',
  [CPRED_LANGUAGE_SKILL_ID]: 'np. Farsi (Ścieżka Życia)',
};

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
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
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

  /**
   * „W czym?" — Nauka, Wiedza lokalna, Gra na instrumencie i Sztuki walki nie
   * znaczą nic bez dziedziny (s. 81). Język pisze się do Ścieżki Życia, gdzie
   * mieszka od 25b: jedno pole, dwa miejsca do jego wpisania (tu i na stronie
   * drugiej), zawsze ta sama wartość.
   */
  function setSpecialty(skillId: string, value: string) {
    if (skillId === CPRED_LANGUAGE_SKILL_ID) {
      saveData({ lifepath: { ...data.lifepath, language: value } }, 'skills');
      return;
    }
    saveData({ skillSpecialties: { ...data.skillSpecialties, [skillId]: value } }, 'skills');
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
                const rollTitle = `Rzut: ${cpredSkillLabel(skill, data)} (${abbr}) — Shift pomija okno`;
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
                      {cpredSkillNeedsSpecialty(skill.id) && (
                        <input
                          type="text"
                          className="cp-skill-specialty"
                          value={cpredSkillSpecialty(data, skill.id)}
                          maxLength={SKILL_SPECIALTY_MAX_LENGTH}
                          placeholder={SPECIALTY_HINTS[skill.id] ?? 'w czym?'}
                          onChange={(e) => setSpecialty(skill.id, e.target.value)}
                          aria-label={`Specjalizacja: ${skill.name}`}
                          title={`Ta Umiejętność wymaga wyboru — ${
                            SPECIALTY_HINTS[skill.id] ?? 'wpisz dziedzinę'
                          }`}
                        />
                      )}
                    </div>
                    <div className="cp-field cp-skill-cell">
                      {/* Etap 29a: poziom kupuje się PD (panel „Awans” na
                          stronie drugiej). Wpisywalny zostaje u MG — sędzia
                          musi móc naprawić kartę — a cena bez zamkniętych
                          drzwi obok nie jest ceną. */}
                      <input
                        type="number"
                        min={SKILL_LEVEL_MIN}
                        max={SKILL_LEVEL_MAX}
                        value={level}
                        readOnly={!isGm}
                        title={
                          isGm
                            ? undefined
                            : 'Poziom podnosi się za PD — panel „Awans” na stronie drugiej.'
                        }
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

/** Generic editable row-list table, in the sheet's own paper-on-red style. */
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
    <div className="cp-strip">
      <table className="cp-table">
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
                      aria-label={c.label}
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
                      aria-label={c.label}
                      onChange={(e) => updateRow(row.id, c.key, e.target.value)}
                    />
                  )}
                </td>
              ))}
              <td>
                <button
                  type="button"
                  className="cp-mini-button cp-mini-button--danger"
                  onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
                  title="Usuń wiersz"
                  aria-label="Usuń wiersz"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="cp-add" onClick={() => onChange([...rows, makeRow()])}>
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
 * Pas broni ze strony pierwszej: `BROŃ · OBR. · AMUNICJA · LA · UWAGI`
 * (stage 16, przeprowadzka i skóra w 27b).
 *
 * Beyond editing the row it is the place combat starts from: „Atak"/„Seria"/
 * „Zapora" arm the map's crosshair, and the next click on a token loads the cup.
 * Which buttons appear follows the weapon's catalogue entry — only a weapon
 * whose type has autofire can fire a burst.
 */
function WeaponStrip({
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
      modifier: 0,
      melee: resolved?.melee ?? false,
    });
  }

  return (
    <div className="cp-strip">
      <table className="cp-table weapon-table">
        <thead>
          {/* Nagłówki dokładnie z wydruku; „Atak" i kosz to nasze dwie kolumny
              więcej — karta papierowa nie ma czym strzelać. */}
          <tr>
            <th>Broń</th>
            <th style={{ width: '5.5rem' }}>Obr.</th>
            <th style={{ width: '7rem' }}>Amunicja</th>
            <th style={{ width: '3.5rem' }}>LA</th>
            <th>Uwagi</th>
            <th>Atak</th>
            <th style={{ width: '2rem' }} />
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
                        aria-label={`Przeładuj do pełna${row.ammoType ? ` (${row.ammoType})` : ''}`}
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
                      aria-label="Pokaż pierścienie przedziałów PT wokół swojego tokenu (kliknij ponownie, by schować)"
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
                    aria-label="Usuń wiersz"
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
        className="cp-add"
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
        + Broń
      </button>
    </div>
  );
}

/** OB, jakie ma świeżo kupiona kurtka — tyle, ile najczęstszy pancerz z tabeli. */
const ARMOR_DEFAULT_SP = 11;

/**
 * Pancerz jak na wydruku: trzy wiersze — Głowa, Ciało, Tarcza (etap 27b).
 *
 * Wiersz pokazuje tę sztukę, która **naprawdę zatrzyma strzał**: wybiera ją
 * `effectiveArmor`, czyli dokładnie ta funkcja, którą czyta silnik obrażeń
 * z etapu 15 (najmocniejsza noszona w danej lokacji). Dzięki temu karta i karta
 * obrażeń nigdy nie mówią dwóch różnych rzeczy.
 *
 * Sztuki zdjęte i drugie w tej samej lokacji schodzą pod spód, do listy „reszta
 * pancerza" — bez niej trzy wiersze kłamałyby przez przemilczenie.
 *
 * Jedno odstępstwo od wydruku: kolumna „Uwagi". Papierowa karta jej tu nie ma,
 * ale nasze wiersze noszą notatkę (własną albo z kompendium), a pas broni nad
 * nimi taką kolumnę drukuje — dwie tabele jednego pasa czyta się lepiej, gdy
 * kończą się w tym samym miejscu.
 */
function ArmorStrip({ character, data, saveData }: TabProps & { character: CharacterSheetView }) {
  const registry = useCharacterStore((s) => s.registry);
  const tokens = useTokenStore((s) => s.tokens);
  // Poziom Specjalizacji Naprawa decyduje, czy „Prowizorka" ma się w ogóle
  // pokazać; figura na scenie — kto płaci za nią Akcję, gdy trwa walka.
  const repair = cpredSheetFabrication(data, registry).repair;
  const ownToken = Object.values(tokens).find((token) => token.characterId === character.id);

  function write(rows: CpredArmorRow[]) {
    saveData({ armor: rows }, 'armor');
  }

  /**
   * „Zwiększasz OB przedmiotu o 1" (s. 148) — jedyny z jedenastu skutków
   * Ulepszania, który VTT umie policzyć samo. Reszta stoi wypisana w panelu
   * Twórcy i rozgrywa się przy stole (`decyzje-i-uproszczenia.md`).
   */
  function upgradeSp(row: CpredArmorRow) {
    write(
      data.armor.map((entry) =>
        entry.id === row.id
          ? {
              ...entry,
              sp: entry.sp + 1,
              spCurrent: entry.spCurrent + 1,
              upgrade: 'armorSp',
            }
          : entry,
      ),
    );
  }

  function update(rowId: string, patch: Partial<CpredArmorRow>) {
    write(data.armor.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }

  function addAt(location: ArmorLocation) {
    write([
      ...data.armor,
      {
        id: newRowId(),
        name: '',
        sp: ARMOR_DEFAULT_SP,
        spCurrent: ARMOR_DEFAULT_SP,
        location,
        notes: '',
      },
    ]);
  }

  const printed = ARMOR_LOCATIONS.map((location) => ({
    location,
    row: effectiveArmor(data.armor, location),
  }));
  const printedIds = new Set(printed.map((slot) => slot.row?.id).filter(Boolean));
  const rest = data.armor.filter((row) => !printedIds.has(row.id));

  return (
    <div className="cp-strip">
      <table className="cp-table armor-table">
        <thead>
          <tr>
            <th>Pancerz</th>
            <th style={{ width: '5rem' }}>OB</th>
            <th style={{ width: '3.5rem' }}>Kara</th>
            <th>Uwagi</th>
            <th style={{ width: '3.4rem' }} />
          </tr>
        </thead>
        <tbody>
          {printed.map(({ location, row }) => (
            <tr key={location}>
              <td className="armor-slot-cell">
                <span className="cp-slot">{ARMOR_LOCATION_LABELS[location]}</span>
                {row ? (
                  <input
                    type="text"
                    maxLength={64}
                    value={row.name}
                    onChange={(e) => update(row.id, { name: e.target.value })}
                    aria-label={`Pancerz: ${ARMOR_LOCATION_LABELS[location]}`}
                  />
                ) : (
                  <button
                    type="button"
                    className="cp-add"
                    onClick={() => addAt(location)}
                    title={`Załóż pancerz w lokacji: ${ARMOR_LOCATION_LABELS[location]}`}
                  >
                    + Załóż
                  </button>
                )}
              </td>
              {row ? (
                <>
                  <td className="armor-sp-cell">
                    <ArmorSp row={row} update={update} />
                  </td>
                  <td>
                    <ArmorPenalty row={row} update={update} />
                  </td>
                  <td>
                    <input
                      type="text"
                      maxLength={200}
                      value={row.notes}
                      onChange={(e) => update(row.id, { notes: e.target.value })}
                      aria-label="Uwagi o pancerzu"
                    />
                  </td>
                  <td className="armor-actions">
                    {/* Etap 30b — Prowizorka Technika (s. 147). Guzik pojawia
                        się tylko przy starciu OB i tylko Technikowi z punktem
                        w Naprawie; drugi klik oddaje sztuce jej starte OB. */}
                    {row.fieldRepair ? (
                      <button
                        type="button"
                        className="cp-mini-button"
                        title={`Prowizorka na ${row.fieldRepair.minutes} min — kliknij, gdy puści (OB wraca do ${row.fieldRepair.restoredFrom})`}
                        aria-label="Zakończ prowizorkę"
                        onClick={() => void endFieldRepair(character.id, row.id)}
                      >
                        ⌫
                      </button>
                    ) : repair > 0 && row.spCurrent < row.sp ? (
                      <button
                        type="button"
                        className="cp-mini-button"
                        title={`Prowizorka: pełne OB na ${cpredFieldRepairMinutes(repair)} min. Kosztuje Akcję, gdy trwa walka.`}
                        aria-label="Prowizorka — tymczasowa naprawa"
                        onClick={() => void makeFieldRepair(character.id, row.id, ownToken?.id)}
                      >
                        ⚒
                      </button>
                    ) : null}
                    {!row.upgrade && (
                      <button
                        type="button"
                        className="cp-mini-button"
                        title="Ulepszanie: +1 OB (s. 148). Jeden przedmiot można ulepszyć tylko raz."
                        aria-label="Ulepsz: +1 OB"
                        onClick={() => upgradeSp(row)}
                      >
                        ⊕
                      </button>
                    )}
                    <button
                      type="button"
                      className="cp-mini-button"
                      title="Zdejmij — sztuka schodzi na dół i przestaje chronić"
                      aria-label="Zdejmij — sztuka schodzi na dół i przestaje chronić"
                      onClick={() => update(row.id, { equipped: false })}
                    >
                      ⤓
                    </button>
                    <button
                      type="button"
                      className="cp-mini-button cp-mini-button--danger"
                      title="Usuń pancerz"
                      aria-label="Usuń pancerz"
                      onClick={() => write(data.armor.filter((r) => r.id !== row.id))}
                    >
                      ✕
                    </button>
                  </td>
                </>
              ) : (
                <td colSpan={4} className="armor-empty">
                  nic tu nie chroni
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="cp-note">Kara dotyczy REF, ZW i RUCHU</p>

      {rest.length > 0 && (
        <>
          <div className="cp-bar cp-bar--sub" title="Zdjęte i zapasowe sztuki — nie chronią">
            Reszta pancerza ({rest.length})
          </div>
          <table className="cp-table armor-table armor-table--rest">
            <tbody>
              {rest.map((row) => (
                <tr key={row.id} className={row.equipped === false ? 'armor-row--stowed' : ''}>
                  <td className="armor-slot-cell">
                    <select
                      value={row.location}
                      onChange={(e) =>
                        update(row.id, { location: e.target.value as ArmorLocation })
                      }
                      aria-label="Lokacja pancerza"
                    >
                      {ARMOR_LOCATIONS.map((id) => (
                        <option key={id} value={id}>
                          {ARMOR_LOCATION_LABELS[id]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      maxLength={64}
                      value={row.name}
                      onChange={(e) => update(row.id, { name: e.target.value })}
                      aria-label="Nazwa pancerza"
                    />
                  </td>
                  <td className="armor-sp-cell">
                    <ArmorSp row={row} update={update} />
                  </td>
                  <td>
                    <ArmorPenalty row={row} update={update} />
                  </td>
                  <td>
                    <input
                      type="text"
                      maxLength={200}
                      value={row.notes}
                      onChange={(e) => update(row.id, { notes: e.target.value })}
                      aria-label="Uwagi o pancerzu"
                    />
                  </td>
                  <td className="armor-actions">
                    {/* Sztuka noszona, która i tak stoi tutaj, jest słabsza od
                        wydrukowanej — mówimy to wprost, zamiast zostawiać MG
                        z pytaniem, czemu jej nie widać wyżej. */}
                    {row.equipped === false ? (
                      <button
                        type="button"
                        className="cp-mini-button"
                        title="Załóż"
                        aria-label="Załóż"
                        onClick={() => update(row.id, { equipped: true })}
                      >
                        ⤒
                      </button>
                    ) : (
                      <span className="armor-weaker" title="Noszona, ale słabsza od wpisanej wyżej">
                        słabsza
                      </span>
                    )}
                    <button
                      type="button"
                      className="cp-mini-button cp-mini-button--danger"
                      title="Usuń pancerz"
                      aria-label="Usuń pancerz"
                      onClick={() => write(data.armor.filter((r) => r.id !== row.id))}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <button type="button" className="cp-add" onClick={() => addAt('body')}>
        + Pancerz
      </button>
    </div>
  );
}

/**
 * OB w idiomie tej karty: „bieżące z bazowego", tak jak PW i Człowieczeństwo
 * wyżej. Ablacja z etapu 15 zbija lewą liczbę, ↻ przywraca ją do prawej.
 */
function ArmorSp({
  row,
  update,
}: {
  row: CpredArmorRow;
  update: (rowId: string, patch: Partial<CpredArmorRow>) => void;
}) {
  const ablated = row.spCurrent < row.sp;
  return (
    <span className={`armor-sp${ablated ? ' armor-ablated' : ''}`}>
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
      <span className="cp-of">z</span>
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
        aria-label="OB pancerza (nieuszkodzonego)"
      />
      {ablated && (
        <button
          type="button"
          className="cp-mini-button"
          title="Napraw pancerz do pełnego OB"
          aria-label="Napraw pancerz do pełnego OB"
          onClick={() => update(row.id, { spCurrent: row.sp })}
        >
          ↻
        </button>
      )}
    </span>
  );
}

/**
 * Stage 14c: heavy armor slows the wearer (REF/ZW/RUCH). The turn budget reads
 * exactly this field, and only from worn pieces — the worst one counts, they do
 * not add up (s. 185).
 */
function ArmorPenalty({
  row,
  update,
}: {
  row: CpredArmorRow;
  update: (rowId: string, patch: Partial<CpredArmorRow>) => void;
}) {
  return (
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
  );
}

/**
 * Critical Injuries the character is suffering. They are drawn by the damage
 * flow; here they can be read (the effect is the rules text) and removed —
 * „Łatanie" and „Leczenie" are played out at the table, not automated.
 *
 * Od etapu 27b stoją w kolumnie tożsamości strony pierwszej, bo tam drukuje je
 * karta — obok Uzależnień i pod Przeżywalnością.
 */
function CriticalInjuries({ data, saveData, characterId }: TabProps & { characterId: string }) {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const entriesById = useCompendiumStore((s) => s.entries);
  const order = useCompendiumStore((s) => s.order);
  const [picked, setPicked] = useState('');
  /** Rana, przy której otwarto formularz leczenia; naraz tylko jedna. */
  const [treating, setTreating] = useState<string | null>(null);
  /**
   * Tabela ran do wyboru — obie strony ciała, po numerze 2k6, tak jak drukuje
   * je podręcznik. Rana, którą postać już ma, wypada z listy: serwer i tak jej
   * nie zdubluje, a wybór, który zawsze kończy się odmową, jest gorszy niż brak
   * wyboru.
   */
  const choices = useMemo(() => {
    const taken = new Set(data.criticalInjuries.map((injury) => injury.id));
    return order
      .map((id) => entriesById[id])
      .filter(
        (entry): entry is CriticalInjuryEntry =>
          entry !== undefined && isCriticalInjuryEntry(entry) && !taken.has(entry.id),
      )
      .sort((a, b) => (a.table === b.table ? a.roll - b.roll : a.table.localeCompare(b.table)));
  }, [entriesById, order, data.criticalInjuries]);

  return (
    <div className="cp-panel cp-injuries">
      <div className="cp-bar">Krytyczne Urazy</div>
      {data.criticalInjuries.length === 0 ? (
        <div className="cp-field cp-injuries-empty">bez ran krytycznych</div>
      ) : (
        <ul className="injury-list">
          {data.criticalInjuries.map((injury, index) => (
            <li key={`${injury.id}-${index}`} className="cp-field injury-row">
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
                {/*
                  Kara, której VTT nie umie zastosować samo: nie wie, w której
                  ręce jest broń ani czy ten Test wymaga mówienia (s. 187–188).
                  Stoi tu jako osobny chip, a nie w prozie efektu, bo to jedyny
                  sposób, żeby ktokolwiek ją zauważył przed rzutem — samo okno
                  rzutu podaje ją potem do kliknięcia.
                */}
                {injury.conditionalPenalty ? (
                  <span
                    className="injury-penalty"
                    title={`Stosuje MG/gracz: ${injury.conditionalPenalty.condition}`}
                  >
                    {injury.conditionalPenalty.value} · {injury.conditionalPenalty.condition}
                  </span>
                ) : null}
                {injury.headDamageMultiplier ? (
                  <span
                    className="injury-penalty"
                    title="Obrażenia, które przejdą przez pancerz na głowie, mnożą się tym razem"
                  >
                    trafienia w głowę ×{injury.headDamageMultiplier}
                  </span>
                ) : null}
                {/*
                  Etap 30b: droga leczenia z tabeli s. 187 — guzik pojawia się
                  tylko wtedy, gdy zdanie przy ranie da się odczytać na rzut
                  („Nd." nie da się). Kasowanie ✕ obok zostaje: MG nadal musi
                  móc zdjąć ranę bez rzutu, gdy rozstrzygnął ją narracyjnie.
                */}
                {cpredTreatmentOptions(injury).length > 0 && (
                  <button
                    type="button"
                    className="cp-mini-button"
                    title={`Leczenie: ${describeCareOptions(cpredTreatmentOptions(injury))}`}
                    aria-label={`Lecz ranę: ${injury.name}`}
                    onClick={() => setTreating(treating === injury.id ? null : injury.id)}
                  >
                    Lecz
                  </button>
                )}
                <button
                  type="button"
                  className="cp-mini-button cp-mini-button--danger"
                  title="Usuń ranę (wyleczona albo załatana)"
                  aria-label="Usuń ranę (wyleczona albo załatana)"
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
              {injury.quickFix ? (
                <p className="injury-care" title="Znosi efekt rany do końca dnia — rozstrzyga MG">
                  Łatanie: {injury.quickFix}
                </p>
              ) : null}
              {treating === injury.id && (
                <TreatInjury
                  patientId={characterId}
                  injury={injury}
                  onClose={() => setTreating(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {/*
        Ręczne nadanie rany (sesja naprawcza 22.08). RAW pozwala MG przypisać
        ranę narracyjnie, a do tej pory jedyną drogą na kartę był rzut obrażeń
        z dwiema szóstkami (1/36) albo nietrafiony test amunicji z 16h — więc
        „spadasz z drabiny i łamiesz rękę" nie miało jak się wydarzyć.
      */}
      {isGm && choices.length > 0 && (
        <div className="cp-field injury-assign">
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            aria-label="Rana krytyczna do nadania"
            title="Rana wchodzi z pełnymi karami, tak jak wylosowana. Kartę na czacie można cofnąć."
          >
            <option value="">— nadaj ranę —</option>
            {choices.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {CRITICAL_INJURY_TABLE_LABELS[entry.table]} {entry.roll}: {entry.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="cp-mini-button"
            disabled={picked === ''}
            title="Nadaje ranę bez rzutu — na czat idzie karta, którą da się cofnąć."
            onClick={() => {
              if (picked === '') return;
              assignCriticalInjury({ characterId, injuryId: picked });
              setPicked('');
            }}
          >
            Nadaj
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Cyberdek i jego gniazda (etap 26a) — dół zakładki „Ekwipunek".
 *
 * Dek stoi tutaj, a nie na stronie z cyborgizacjami, bo w podręczniku jest
 * sprzętem, nie wszczepem: kupuje się go, wozi w plecaku i wymienia jedną Akcją
 * w Somie. Sekcja pojawia się dopiero, gdy postać dek **ma** — większość ludzi
 * przy stole nie sieciuje, a puste okienko na każdej karcie byłoby szumem.
 *
 * Liczby Programu kopiują się z kompendium w chwili włożenia, tak jak obrażenia
 * broni z etapu 13: zmiana katalogu nie przepisuje wstecz cudzego deku.
 */
function CyberdeckSection({ data, saveData }: TabProps) {
  const entriesById = useCompendiumStore((s) => s.entries);
  const order = useCompendiumStore((s) => s.order);
  const entries = useMemo(
    () => order.map((id) => entriesById[id]).filter((entry): entry is CompendiumEntry => !!entry),
    [entriesById, order],
  );
  const decks = useMemo(() => cyberdeckEntries(entries), [entries]);
  const programs = useMemo(() => programEntries(entries), [entries]);
  const hardware = useMemo(
    () => entries.filter((entry) => isGearEntry(entry) && !!entry.deckSlotCost),
    [entries],
  );

  const deck = data.cyberdeck;
  if (!deck) {
    return (
      <div className="cp-panel cp-deck cp-deck--empty">
        <span className="cp-label">Cyberdek</span>
        <select
          value=""
          onChange={(event) => {
            const entry = decks.find((row) => row.id === event.target.value);
            if (!entry) return;
            saveData(
              {
                cyberdeck: {
                  compendiumId: entry.id,
                  name: entry.name,
                  slots: entry.deckSlots ?? 1,
                  installed: [],
                },
              },
              'cyberdeck',
            );
          }}
        >
          <option value="">Bez deku — wybierz z kompendium…</option>
          {decks.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} ({entry.deckSlots} gniazd)
            </option>
          ))}
        </select>
      </div>
    );
  }

  const used = cyberdeckSlotsUsed(deck);
  const free = cyberdeckSlotsFree(deck);

  function patchDeck(next: Partial<CpredCyberdeck>) {
    if (!deck) return;
    saveData({ cyberdeck: { ...deck, ...next } }, 'cyberdeck');
  }

  function install(entry: CompendiumEntry) {
    if (!deck) return;
    const isProgram = isProgramEntry(entry);
    const cost = isProgram
      ? netProgramSlots(entry)
      : isGearEntry(entry)
        ? (entry.deckSlotCost ?? 1)
        : 1;
    if (cost > free) return;
    const row: CpredNetInstallRow = {
      id: newRowId(),
      compendiumId: entry.id,
      name: entry.name,
      notes: '',
      kind: isProgram ? 'program' : 'hardware',
      slotCost: cost,
      // Cała mechanika wpisu razem z „Efektem" (etap 26c) — kopiowana jedną
      // funkcją z `shared`, żeby gniazdo deku nie mogło zapomnieć pola.
      ...(isProgram ? { program: netProgramProfileOf(entry) } : {}),
    };
    patchDeck({ installed: [...deck.installed, row] });
  }

  return (
    <div className="cp-panel cp-deck">
      <div className="cp-bar cp-bar--plain">
        <span>{deck.name}</span>
        <span className={`cp-deck-slots ${free === 0 ? 'cp-deck-slots--full' : ''}`}>
          gniazda {used} / {deck.slots}
        </span>
        <label
          className="cp-deck-capacity"
          title="Kombinezon Bodyweight i cyberręka z dekiem dokładają gniazdo (s. 208)"
        >
          <span>Gniazd</span>
          <input
            type="number"
            min={1}
            max={CYBERDECK_SLOTS_MAX}
            value={deck.slots}
            onChange={(event) => {
              const value = Number.parseInt(event.target.value, 10);
              if (Number.isInteger(value)) patchDeck({ slots: value });
            }}
          />
        </label>
        <button
          type="button"
          className="cp-mini-button cp-mini-button--danger"
          title="Odłącz cyberdek od tej postaci"
          aria-label="Odłącz cyberdek od tej postaci"
          onClick={() => saveData({ cyberdeck: null }, 'cyberdeck')}
        >
          ✕
        </button>
      </div>

      <table className="cp-table cp-deck-table">
        <thead>
          <tr>
            <th>Zawartość gniazd</th>
            <th className="cp-num">ATK</th>
            <th className="cp-num">OBR</th>
            <th className="cp-num">REZ</th>
            <th className="cp-num">Gniazd</th>
            <th aria-label="Usuń" />
          </tr>
        </thead>
        <tbody>
          {deck.installed.length === 0 ? (
            <tr>
              <td colSpan={6} className="placeholder-text">
                Dek jest pusty — Programy i Ulepszenia Sprzętowe wkłada się poniżej.
              </td>
            </tr>
          ) : (
            deck.installed.map((row) => (
              <tr key={row.id} className={row.program?.blackIce ? 'cp-deck-row--ice' : ''}>
                <td>
                  {row.name}
                  {row.program?.blackIce ? <span className="cp-deck-tag">Czarny LOD</span> : null}
                  {row.kind === 'hardware' ? <span className="cp-deck-tag">sprzęt</span> : null}
                </td>
                <td className="cp-num">{row.program ? row.program.atk : '—'}</td>
                <td className="cp-num">{row.program ? row.program.def : '—'}</td>
                <td className="cp-num">{row.program ? row.program.rez : '—'}</td>
                <td className="cp-num">{row.slotCost}</td>
                <td>
                  <button
                    type="button"
                    className="cp-mini-button cp-mini-button--danger"
                    title="Wyjmij z gniazda"
                    aria-label="Wyjmij z gniazda"
                    onClick={() =>
                      patchDeck({
                        installed: deck.installed.filter((entry) => entry.id !== row.id),
                      })
                    }
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="cp-deck-install">
        <select
          value=""
          disabled={free === 0}
          onChange={(event) => {
            const entry = entries.find((row) => row.id === event.target.value);
            if (entry) install(entry);
          }}
        >
          <option value="">
            {free === 0 ? 'Brak wolnych gniazd' : `+ Program albo ulepszenie (wolne: ${free})…`}
          </option>
          {programs.map((entry) => (
            <option key={entry.id} value={entry.id} disabled={netProgramSlots(entry) > free}>
              {entry.name} — {netProgramSlots(entry)} gn.
            </option>
          ))}
          {hardware.map((entry) => (
            <option
              key={entry.id}
              value={entry.id}
              disabled={(isGearEntry(entry) ? (entry.deckSlotCost ?? 1) : 1) > free}
            >
              {entry.name} — {isGearEntry(entry) ? (entry.deckSlotCost ?? 1) : 1} gn. (sprzęt)
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * Zakładka „Ekwipunek" — prawa kolumna strony drugiej wydruku (etap 27b).
 *
 * Kolejność jak na karcie: Wyposażenie, pod nim czarne plakietki Amunicji
 * i Gotówki, a niżej Styl / Zakwaterowanie / Wynajem / Poziom życia. Cyborgizacje
 * zostają na dole do etapu 27c — tam dostaną własną stronę z sylwetką.
 */
function GearTab({ character, data, saveData }: TabProps & { character: CharacterSheetView }) {
  return (
    <div className="sheet-gear">
      {/* Bez osobnej belki tytułowej — na wydruku tytułem tego bloku jest sam
          nagłówek kolumny „Wyposażenie", a dwa te same słowa nad sobą to szum. */}
      <RowTable
        rows={data.gear}
        columns={[
          { key: 'name', label: 'Wyposażenie' },
          { key: 'qty', label: 'Ilość', numeric: true, width: '4rem' },
          { key: 'notes', label: 'Uwagi', maxLength: 200 },
        ]}
        addLabel="+ Wyposażenie"
        makeRow={() => ({ id: newRowId(), name: '', qty: 1, notes: '' })}
        onChange={(rows) => saveData({ gear: rows }, 'gear')}
      />

      <div className="cp-panel cp-plaques">
        <div
          className="cp-field cp-plaque"
          title="Zapas noszony poza magazynkami. Magazynki liczą się osobno, przy każdej broni."
        >
          <span className="cp-label">Amunicja</span>
          <input
            type="text"
            maxLength={SHEET_LINE_MAX_LENGTH}
            value={data.ammoStock}
            placeholder="np. 9 mm × 60, śrut × 12"
            onChange={(e) => saveData({ ammoStock: e.target.value }, 'ammoStock')}
            aria-label="Amunicja (zapas)"
          />
        </div>
        <WalletSection character={character} data={data} saveData={saveData} />
      </div>

      <LifestyleFields data={data} saveData={saveData} />

      <CyberdeckSection data={data} saveData={saveData} />
    </div>
  );
}

/**
 * Styl, Zakwaterowanie, Wynajem i Poziom życia — cztery pola z dołu strony
 * drugiej (etap 27b), spięte z ekonomią z 23b.
 *
 * „Wynajem" jest **tylko do odczytu**: czynsz wynika z wybranego Zakwaterowania
 * (s. 376), a wpisywalna kopia byłaby drugą, kłócącą się liczbą — tak samo jak
 * saldo, którego karta też nie pozwala pisać.
 */
function LifestyleFields({ data, saveData }: TabProps) {
  const lifestyle = data.lifestyle;
  const monthly = lifestyle ? monthlyCostOf(lifestyle) : null;

  return (
    <>
      <div className="cp-panel cp-lifestyle">
        <div className="cp-field cp-field--notch cp-row cp-span2">
          <span className="cp-label">Styl</span>
          <input
            type="text"
            maxLength={SHEET_LINE_MAX_LENGTH}
            value={data.style}
            placeholder="Jak się nosi — skóra, garnitur, chrom na wierzchu…"
            onChange={(e) => saveData({ style: e.target.value }, 'style')}
            aria-label="Styl"
          />
        </div>
        <div className="cp-field cp-row">
          <span className="cp-label">Zakwaterowanie</span>
          <select
            value={lifestyle?.housing ?? 'street'}
            disabled={!lifestyle}
            aria-label="Zakwaterowanie"
            title={
              lifestyle
                ? 'Gdzie postać sypia — czynsz schodzi z konta pierwszego dnia miesiąca.'
                : 'Najpierw wybierz Poziom życia — bez niego ta postać nie jest rozliczana.'
            }
            onChange={(e) => {
              const housing = e.target.value;
              if (!lifestyle || !isHousingOption(housing)) return;
              saveData({ lifestyle: { ...lifestyle, housing } }, 'lifestyle');
            }}
          >
            {HOUSING_OPTIONS.map((option) => (
              <option key={option} value={option} title={HOUSING_DEFINITIONS[option].note}>
                {HOUSING_DEFINITIONS[option].label}
              </option>
            ))}
          </select>
        </div>
        <div className="cp-field cp-row" title="Czynsz wynika z Zakwaterowania (s. 376)">
          <span className="cp-label">Wynajem</span>
          <span className="cp-readout">
            {monthly ? `${formatEddies(monthly.rent)} ed / mies.` : '—'}
          </span>
        </div>
        <div className="cp-field cp-row cp-span2">
          <span className="cp-label">Poziom życia</span>
          <select
            value={lifestyle?.level ?? ''}
            aria-label="Poziom życia"
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
        </div>
      </div>
      {monthly ? (
        <p className="sheet-hint">
          Pierwszego dnia miesiąca: {formatEddies(monthly.total)} ed (jedzenie{' '}
          {formatEddies(monthly.lifestyle)} + czynsz {formatEddies(monthly.rent)}). Pobiera je MG
          przyciskiem „Rozlicz miesiąc”.
        </p>
      ) : (
        <p className="sheet-hint">
          Bez Poziomu życia ta postać nie jest rozliczana co miesiąc (tak zostają NPC-e i statyści).
        </p>
      )}
    </>
  );
}

/**
 * The wallet (stage 23b).
 *
 * The balance stopped being a field and became a **read-out**: every eddie that
 * moves does so through a server event, so a player looks at their money and
 * the GM corrects it — and even the correction lands in the audit under
 * „korekta MG".
 *
 * Od etapu 27b saldo jest czarną plakietką „Gotówka" z wydruku, a wybór Poziomu
 * życia i Zakwaterowania przeniósł się wyżej, do pól karty (`LifestyleFields`) —
 * to wybór, nie operacja na koncie. Za przyciskiem „Kasa…" zostaje to, co jest
 * operacją: przelew i historia.
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

  return (
    <section className="sheet-wallet cp-field cp-plaque">
      <span className="cp-label">Gotówka</span>
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
          className="cp-add"
          onClick={() => setOpen((current) => !current)}
          title="Historia operacji i przelew"
        >
          {open ? 'Zwiń kasę' : 'Kasa…'}
        </button>
      </div>

      {open ? (
        <div className="wallet-body">
          <div className="wallet-transfer">
            <select
              value={payeeId}
              aria-label="Przelew do"
              onChange={(e) => setPayeeId(e.target.value)}
            >
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
              aria-label="Kwota przelewu"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <input
              type="text"
              maxLength={120}
              placeholder="za co (opcjonalnie)"
              aria-label="Tytuł przelewu"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button type="button" className="cp-add" onClick={() => void send()}>
              Przelej
            </button>
          </div>

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
/**
 * Strona trzecia arkusza (etap 27c): sylwetka z gniazdami, cztery listy boczne
 * i pod nimi tabela wszystkich wszczepów.
 *
 * Podział pracy jest celowy: rysunek odpowiada na „co gdzie siedzi", tabela na
 * „ile mnie kosztowało i jak to zdjąć". Wiersz wskazany na sylwetce podświetla
 * się w tabeli — dzięki temu obie połowy mówią o tym samym przedmiocie, a nie
 * o dwóch listach do porównywania wzrokiem.
 */
function ChromePage({
  characterId,
  data,
  saveData,
}: {
  characterId: string;
  data: CpredCharacterData;
  saveData: TabProps['saveData'];
}) {
  const [focusRowId, setFocusRowId] = useState<string | null>(null);

  return (
    <div className="sheet-chrome">
      <CyberwareBody data={data} focusRowId={focusRowId} onFocusRow={setFocusRowId} />
      <CyberwareSection
        characterId={characterId}
        data={data}
        saveData={saveData}
        focusRowId={focusRowId}
      />
    </div>
  );
}

function CyberwareSection({
  characterId,
  data,
  saveData,
  focusRowId,
}: {
  characterId: string;
  data: CpredCharacterData;
  saveData: TabProps['saveData'];
  focusRowId: string | null;
}) {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const capacity = cyberwareCapacity(data.cyberware);
  const [confirmRow, setConfirmRow] = useState<string | null>(null);
  const [freeTherapy, setFreeTherapy] = useState(false);

  function updateSlot(rowId: string, bodySlot: CyberwareBodySlot | null) {
    saveData(
      {
        cyberware: data.cyberware.map((row) =>
          row.id === rowId
            ? // Puste znaczy „jeszcze nie wiadomo", więc pole musi z wiersza
              // zniknąć, a nie zostać w nim jako pusty napis.
              ({
                ...row,
                ...(bodySlot ? { bodySlot } : { bodySlot: undefined }),
              } as CpredCyberwareRow)
            : row,
        ),
      },
      'cyberware',
    );
  }

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
                {family.places && (
                  <ul className="cyberware-places">
                    {family.places.map((place) => (
                      <li
                        key={place.slot}
                        className={
                          place.missingFoundation || place.used > place.capacity
                            ? 'capacity-over'
                            : undefined
                        }
                        title="Gniazda w tym konkretnym miejscu — o tym, co gdzie siedzi, decyduje kolumna „Gniazdo” w tabeli niżej"
                      >
                        {place.label}: {place.used} / {place.capacity}
                        {place.missingFoundation && ' — nie ma w czym'}
                      </li>
                    ))}
                    {family.unplaced ? (
                      <li
                        className="capacity-unplaced"
                        title="Liczą się do rodziny, ale nikt nie powiedział, gdzie siedzą — wybierz miejsce w kolumnie „Gniazdo”."
                      >
                        bez przypisanego miejsca: {family.unplaced}
                      </li>
                    ) : null}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <div className="row-table-wrap">
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Nazwa</th>
                  <th style={{ width: '9rem' }}>Rodzina</th>
                  <th style={{ width: '9.5rem' }}>Gniazdo</th>
                  <th style={{ width: '5rem' }}>UC</th>
                  <th>Uwagi</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.cyberware.map((row) => (
                  <tr
                    key={row.id}
                    className={row.id === focusRowId ? 'cyberware-row--focus' : undefined}
                  >
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
                    <td className="cyberware-slot">
                      {/* Rodziny z jednym miejscem na ciele (Cyberaudio,
                          Sprzęg neuralny) nie mają o co pytać — pokazują
                          gniazdo i nie dają go zmienić. */}
                      {(() => {
                        const options = row.type ? bodySlotsForType(row.type) : [];
                        if (options.length === 0) return <span className="cp-dim">—</span>;
                        if (options.length === 1) {
                          return <span>{CYBERWARE_BODY_SLOT_LABELS[options[0]!]}</span>;
                        }
                        return (
                          <select
                            value={row.bodySlot ?? ''}
                            title="Gdzie na ciele siedzi ten wszczep — rysunek na górze bierze to stąd"
                            onChange={(e) =>
                              updateSlot(
                                row.id,
                                isCyberwareBodySlot(e.target.value) ? e.target.value : null,
                              )
                            }
                          >
                            <option value="">— wybierz —</option>
                            {options.map((slot) => (
                              <option key={slot} value={slot}>
                                {CYBERWARE_BODY_SLOT_LABELS[slot]}
                              </option>
                            ))}
                          </select>
                        );
                      })()}
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
 * Strona druga arkusza (etap 27c) — Ścieżka Życia rozpisana na pola.
 *
 * Do 25b całe to życie mieszkało w jednym polu „Notatki”, a od 25b kreator
 * zapisywał je w `data.lifepath`, którego karta nie umiała pokazać. Tutaj
 * kończy się ta luka: postać wychodząca z kreatora ma życiorys, który widać.
 *
 * Wszystko jest edytowalne, bo taka jest zasada całego rozdziału: „Jeśli
 * wylosujesz coś, co nie pasuje do twojej wizji Postaci, odpowiednio zmień
 * wynik” (s. 44). Karta nie zna tu ani jednej listy zamkniętej.
 */
function LifepathPage({ character, data, saveData }: TabProps & { character: CharacterSheetView }) {
  const lifepath = data.lifepath;
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);

  function writeLifepath(patch: Partial<CpredLifepath>) {
    saveData({ lifepath: { ...lifepath, ...patch } }, 'lifepath');
  }

  return (
    <div className="sheet-bio">
      <div className="cp-panel cp-lifepath-head">
        <div className="cp-field cp-field--notch cp-row cp-span2">
          <span className="cp-label">Pseudonimy</span>
          <input
            type="text"
            maxLength={SHEET_LINE_MAX_LENGTH}
            value={data.aliases}
            placeholder="Pod jakimi ksywami znają cię na Ulicy"
            onChange={(e) => saveData({ aliases: e.target.value }, 'aliases')}
            aria-label="Pseudonimy"
          />
        </div>
        <div
          className="cp-field cp-row"
          title={
            isGm
              ? 'PD przyznaje MG po sesji (s. 408). Ręczna zmiana tej liczby zostaje w rejestrze awansów.'
              : 'PD przyznaje MG po sesji (s. 408). Wydaje się je niżej, w panelu „Awans”.'
          }
        >
          <span className="cp-label">Punkty Doświadczenia</span>
          {/* Etap 29a: licznik pisze serwer. MG zostaje pole (korekta ląduje
              w rejestrze), gracz widzi liczbę — wydaje ją panel niżej. */}
          <input
            type="number"
            min={0}
            max={IMPROVEMENT_POINTS_MAX}
            value={data.improvementPoints}
            readOnly={!isGm}
            onChange={(e) => {
              const value = parseNumberInput(e);
              if (value !== undefined) saveData({ improvementPoints: value }, 'improvementPoints');
            }}
            aria-label="Punkty Doświadczenia"
          />
        </div>
        <div className="cp-field cp-span2 cp-advance">
          <AdvancementPanel characterId={character.id} />
        </div>
      </div>

      <div className="cp-panel cp-lifepath">
        <div className="cp-bar cp-bar--plain">Ścieżka Życia</div>
        {LIFEPATH_SHEET_FIELDS.map((entry) => (
          <div key={entry.field} className={`cp-field cp-row ${entry.wide ? 'cp-span2' : ''}`}>
            <span className="cp-label">{entry.label}</span>
            <input
              type="text"
              maxLength={LIFEPATH_LINE_MAX_LENGTH}
              value={lifepath[entry.field]}
              onChange={(e) => writeLifepath({ [entry.field]: e.target.value })}
              aria-label={entry.label}
            />
          </div>
        ))}
      </div>

      <LifepathPeople
        title="Przyjaciele"
        people={lifepath.friends}
        noteLabel="Kim jest dla ciebie"
        onChange={(friends) => writeLifepath({ friends })}
      />
      <LifepathPeople
        title="Tragiczna historia miłosna"
        people={lifepath.tragicLoves}
        noteLabel="Jak to się skończyło"
        onChange={(tragicLoves) => writeLifepath({ tragicLoves })}
      />
      <LifepathEnemies enemies={lifepath.enemies} onChange={(e) => writeLifepath({ enemies: e })} />

      {lifepath.roleAnswers.length > 0 && (
        <div className="cp-panel cp-lifepath">
          <div className="cp-bar cp-bar--plain">Ścieżka Życia Roli</div>
          {lifepath.roleAnswers.map((answer, index) => (
            <div key={answer.id} className="cp-field cp-row cp-span2">
              <span className="cp-label">{answer.question}</span>
              <input
                type="text"
                maxLength={LIFEPATH_LINE_MAX_LENGTH}
                value={answer.answer}
                onChange={(e) => {
                  const roleAnswers = lifepath.roleAnswers.map((row, i) =>
                    i === index ? { ...row, answer: e.target.value } : row,
                  );
                  writeLifepath({ roleAnswers });
                }}
                aria-label={answer.question}
              />
            </div>
          ))}
        </div>
      )}

      <ReputationSection character={character} data={data} saveData={saveData} />
    </div>
  );
}

/**
 * Przyjaciele i dawne miłości — dwie listy o tym samym kształcie (imię plus
 * jedno zdanie), więc jeden komponent. Wrogowie mają cztery kolumny i własny.
 */
function LifepathPeople({
  title,
  people,
  noteLabel,
  onChange,
}: {
  title: string;
  people: CpredLifepathPerson[];
  noteLabel: string;
  onChange: (people: CpredLifepathPerson[]) => void;
}) {
  function patch(index: number, fields: Partial<CpredLifepathPerson>) {
    onChange(people.map((row, i) => (i === index ? { ...row, ...fields } : row)));
  }

  return (
    <div className="cp-panel cp-lifepath-group">
      <div className="cp-bar cp-bar--plain">
        {title}
        <button
          type="button"
          className="cp-bar-add"
          title={`Dopisz — ${title.toLowerCase()}`}
          aria-label={`Dopisz — ${title.toLowerCase()}`}
          disabled={people.length >= LIFEPATH_GROUP_MAX}
          onClick={() => onChange([...people, emptyLifepathPerson(newRowId())])}
        >
          +
        </button>
      </div>
      {people.length === 0 ? (
        <div className="cp-field cp-body-list-empty">—</div>
      ) : (
        people.map((person, index) => (
          <div key={person.id} className="cp-lifepath-person">
            <div className="cp-field cp-row">
              <span className="cp-label">Kto</span>
              <input
                type="text"
                maxLength={LIFEPATH_LINE_MAX_LENGTH}
                value={person.name}
                placeholder="Imię albo ksywa"
                onChange={(e) => patch(index, { name: e.target.value })}
                aria-label={`${title} — kto`}
              />
            </div>
            <div className="cp-field cp-row">
              <span className="cp-label">{noteLabel}</span>
              <input
                type="text"
                maxLength={LIFEPATH_LINE_MAX_LENGTH}
                value={person.note}
                onChange={(e) => patch(index, { note: e.target.value })}
                aria-label={`${title} — ${noteLabel}`}
              />
            </div>
            <button
              type="button"
              className="small-button character-delete"
              title="Usuń z listy"
              aria-label="Usuń z listy"
              onClick={() => onChange(people.filter((_, i) => i !== index))}
            >
              ✕
            </button>
          </div>
        ))
      )}
    </div>
  );
}

/** Wrogowie: cztery kolumny tabeli z s. 51, każda jako osobne pole. */
function LifepathEnemies({
  enemies,
  onChange,
}: {
  enemies: CpredLifepathEnemy[];
  onChange: (enemies: CpredLifepathEnemy[]) => void;
}) {
  function patch(index: number, fields: Partial<CpredLifepathEnemy>) {
    onChange(enemies.map((row, i) => (i === index ? { ...row, ...fields } : row)));
  }

  return (
    <div className="cp-panel cp-lifepath-group">
      <div className="cp-bar cp-bar--plain">
        Wrogowie
        <button
          type="button"
          className="cp-bar-add"
          title="Dopisz wroga"
          aria-label="Dopisz wroga"
          disabled={enemies.length >= LIFEPATH_GROUP_MAX}
          onClick={() => onChange([...enemies, emptyLifepathEnemy(newRowId())])}
        >
          +
        </button>
      </div>
      {enemies.length === 0 ? (
        <div className="cp-field cp-body-list-empty">—</div>
      ) : (
        enemies.map((enemy, index) => (
          <div key={enemy.id} className="cp-lifepath-enemy">
            <div className="cp-field cp-row cp-span2">
              <span className="cp-label">Kto</span>
              <input
                type="text"
                maxLength={LIFEPATH_LINE_MAX_LENGTH}
                value={enemy.name}
                placeholder="Imię albo ksywa"
                onChange={(e) => patch(index, { name: e.target.value })}
                aria-label="Wróg — kto"
              />
              <button
                type="button"
                className="small-button character-delete"
                title="Usuń wroga"
                aria-label="Usuń wroga"
                onClick={() => onChange(enemies.filter((_, i) => i !== index))}
              >
                ✕
              </button>
            </div>
            {LIFEPATH_ENEMY_COLUMNS.map((column) => (
              <div key={column.field} className="cp-field cp-row">
                <span className="cp-label">{column.label}</span>
                <input
                  type="text"
                  maxLength={LIFEPATH_LINE_MAX_LENGTH}
                  value={enemy[column.field]}
                  onChange={(e) => patch(index, { [column.field]: e.target.value })}
                  aria-label={`Wróg — ${column.label}`}
                />
              </div>
            ))}
          </div>
        ))
      )}
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
  character,
  data,
  saveData,
}: {
  character: CharacterSheetView;
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
        {/* Drzwi gracza do Konfrontacji (28.08). Stoją przy Reputacji, bo to
            ona wchodzi do rzutu — a nie w pasku akcji, bo Konfrontacja nie jest
            Akcją tury i nie ma jej płacić z budżetu walki. MG ma swoje wejście
            w menu żetonu i widzi oba. */}
        <FacedownFromSheet characterId={character.id} characterName={character.name} />
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
                    aria-label="Usuń wyczyn"
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
