import { Fragment, useEffect, useMemo, useState, type ChangeEvent, type MouseEvent } from 'react';
import type {
  CpredStatId,
  ArmorLocation,
  CompendiumEntry,
  CpredArmorRow,
  CpredSkillDefinition,
  CpredAttachmentProfile,
  CpredAttackMode,
  CpredCareMode,
  CpredCharacterData,
  CpredCriticalInjuryRow,
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
  CPRED_HOUR_S,
  CPRED_STAT_EFFECT_VALUE_MAX,
  cpredEffectiveStats,
  describeCpredStatEffect,
  describeCpredStatEffectTimer,
  describeCpredStatEffectValue,
  CPRED_LANGUAGE_SKILL_ID,
  cpredHealRate,
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
  formatEddies,
  formatLedgerAmount,
  groupedSkills,
  cpredSheetHpMax,
  humanityMaxWith,
  isAmmoEntry,
  attachmentOptionsFor,
  attachmentProfilesOf,
  attachmentSlotsFree,
  attachmentSlotsUsed,
  describeAttachment,
  fittedAttachmentsFor,
  resolveAttachmentWeapon,
  isCyberwareBodySlot,
  isHousingOption,
  isLifestyleLevel,
  isValidDamageNotation,
  isWeaponEntry,
  monthlyCostOf,
  purchasedSheetRow,
  resolveWeapon,
  cpredDrawnWeapons,
  searchCompendium,
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
  cpredCareOptions,
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
  characterSaveErrorText,
  economyErrorText,
  endFieldRepair,
  fetchLedger,
  flushCharacterSave,
  makeFieldRepair,
  queueCharacterSave,
  restForADay,
  useDose,
  clearWeaponJam,
  drawWeapon,
  reloadWeapon,
  sendCyberwareAction,
  setStatEffect,
  setWeaponAttachment,
  transferEddies,
} from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { askForCheck } from '../stores/checkStore.js';
import { useGameTimeStore } from '../stores/gameTimeStore.js';
import { AdvancementPanel } from './AdvancementPanel.js';
import { PortraitPicker } from './PortraitPicker.js';
import { useAttackStore } from '../stores/attackStore.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import { useInventoryStore } from '../stores/inventoryStore.js';
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
import { NumberStepper } from './NumberStepper.js';

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
  const saveError = useCharacterStore((s) => s.saveErrors[characterId]);
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

  /**
   * The refusal joins the sheet's own complaints (02.09). It belongs in the
   * same strip because it says the same kind of thing — „this card cannot look
   * like that" — and because the header has room for a state, not a sentence.
   */
  const saveIssue = saveState === 'error' && saveError ? characterSaveErrorText(saveError) : null;
  const issueList = [...Object.values(issues), ...(saveIssue ? [saveIssue] : [])];
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
        <span
          className={`sheet-save sheet-save--${saveState ?? 'idle'}`}
          {...(saveIssue ? { title: saveIssue } : {})}
        >
          {saveLabel}
        </span>
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
 * Jak wiersz karty zaczyna rzut: Umiejętność albo Cecha, `Shift` (kubek od
 * ręki) i `Alt` (prośba o Test, etap 40). Alias, bo ten sam podpis wędruje
 * przez trzy komponenty strony pierwszej.
 */
type StartRoll = (
  target: Omit<RollTarget, 'characterId' | 'characterName'>,
  shift: boolean,
  alt?: boolean,
) => void;

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
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  // Prośba o Test (etap 40) ma sens wyłącznie na własnej karcie i wyłącznie
  // u gracza: MG nie prosi sam siebie, ma wezwanie z etapu 32.
  const mayAsk = !isGm && character.ownerId === userId;

  /**
   * Klik otwiera okno rzutu, Shift+klik ładuje kubek od razu z ostatnimi
   * ustawieniami, **Alt+klik prosi MG o Test** (etap 40). Tak czy inaczej sam
   * rzut dzieje się przy kubku — a przy prośbie dopiero po zgodzie MG.
   *
   * Alt dopisał się do gotowej gramatyki modyfikatorów jedną gałęzią i niczego
   * na karcie nie przesunął: wiersz Umiejętności to cztery komórki siatki,
   * w których nie ma miejsca na piąty element.
   */
  function startRoll(
    target: Omit<RollTarget, 'characterId' | 'characterName'>,
    shift: boolean,
    alt = false,
  ) {
    const full: RollTarget = {
      characterId: character.id,
      characterName: character.name,
      ...target,
    };
    // Prośba obejmuje wyłącznie Umiejętność i Cechę; Alt na wierszu obrażeń
    // ma otworzyć zwykłe okno rzutu, a nie cicho nic nie zrobić.
    if (alt && mayAsk && (full.kind === 'skill' || full.kind === 'stat')) {
      askForCheck(full, data, registry);
      return;
    }
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
      <StatColumn data={data} saveData={saveData} startRoll={startRoll} mayAsk={mayAsk} />
      <SkillColumns data={data} saveData={saveData} startRoll={startRoll} mayAsk={mayAsk} />
      <RoleAbilityStrip character={character} data={data} saveData={saveData} />
      <Arsenal character={character} data={data} saveData={saveData} startRoll={startRoll} />
    </div>
  );
}

/**
 * Ogon podpowiedzi przy wierszu, z którego da się rzucić.
 *
 * Jedna funkcja zamiast dwóch napisów, bo dwa wiersze karty (Cecha i BAZA
 * Umiejętności) muszą mówić o Alt+kliku dokładnie to samo — i tylko wtedy, gdy
 * ten widz naprawdę może poprosić.
 */
function rollHintFor(mayAsk: boolean): string {
  return mayAsk ? ' — Shift pomija okno, Alt prosi MG o Test' : ' — Shift pomija okno';
}

/**
 * Pas „Zdolność Specjalna" pod trzema kolumnami strony pierwszej (06.09.2026).
 *
 * Dziewięć paneli Ról z etapów 30a–30d mieszkało do tej sesji **w kolumnie
 * tożsamości**, obok portretu i notatek. Kolumna ma 15 rem i rozciągnąć się nie
 * da (umowa z 30a), a Efekt Charyzmy czy Medycyna Medyka to proza plus trzy
 * progi z przyciskami — więc kolumna rosła dwa razy wyżej od Cech i Umiejętności,
 * a pół strony pierwszej było białą plamą. Wiersz „Zdolność Specjalna" z rangą
 * **zostaje** w kolumnie, bo tak jest na wydruku; przenosi się wyłącznie to, co
 * podręcznik drukuje osobno — rozwinięcie Zdolności.
 *
 * Pas idzie przez całą szerokość siatki, dokładnie tak, jak „Broń i pancerz"
 * z etapu 27b, i znika bez śladu, gdy Rola nie ma czego w nim postawić (osiem
 * z dziewięciu Ról ma samą rangę).
 */
/**
 * Zdolności, które mają w karcie **własny panel**, a nie samą rangę.
 *
 * Lista istnieje po to, żeby pas umiał odpowiedzieć „nie mam czego pokazać"
 * jednym warunkiem, zamiast dziewięciu — a dziesiąty panel dopisuje się w tym
 * jednym miejscu i w gałęzi niżej.
 */
const ROLE_ABILITY_PANEL_IDS = [
  CPRED_COMBAT_AWARENESS_ABILITY,
  CPRED_MEDICINE_ABILITY,
  CPRED_FABRICATION_ABILITY,
  CPRED_BACKUP_ABILITY,
  CPRED_TEAMWORK_ABILITY,
  CPRED_CHARISMA_ABILITY,
  CPRED_OPERATOR_ABILITY,
  CPRED_MOTO_ABILITY,
  CPRED_CREDIBILITY_ABILITY,
] as const;

function RoleAbilityStrip({ character, data }: TabProps & { character: CharacterSheetView }) {
  const registry = useCharacterStore((s) => s.registry);
  const role = registry.roles.find((r) => r.id === data.roleId) ?? null;
  const panels = ROLE_ABILITY_PANEL_IDS.filter(
    (ability) => cpredRoleAbilityRank(data, registry, ability) !== null,
  );
  if (panels.length === 0) return null;

  return (
    <div className="cp-strip cp-role-strip">
      <h3 className="cp-section">Zdolność Specjalna{role ? ` — ${role.ability}` : ''}</h3>
      <div className="cp-role-cards">
        {/* Etap 30a: jedyna Zdolność Specjalna, której punkty się rozdziela —
            reszta Ról ma samą rangę. Panel siedzi pod wierszem Zdolności, bo
            to jej rozwinięcie, a nie osobna część karty. */}
        {cpredRoleAbilityRank(data, registry, CPRED_COMBAT_AWARENESS_ABILITY) !== null && (
          <div className="cp-ability-card">
            <CombatAwarenessPanel characterId={character.id} />
          </div>
        )}
        {/* Etap 30b: dwie kolejne Zdolności, których punkty się rozdziela —
            Medycyna Medyka i Twórca Technika. Stoją w tym samym miejscu, co
            panel Solo, bo to ta sama część karty: rozwinięcie wiersza wyżej. */}
        {cpredRoleAbilityRank(data, registry, CPRED_MEDICINE_ABILITY) !== null && (
          <div className="cp-ability-card">
            <SpecialtyPanel characterId={character.id} ability="medicine" />
          </div>
        )}
        {cpredRoleAbilityRank(data, registry, CPRED_FABRICATION_ABILITY) !== null && (
          <div className="cp-ability-card">
            <SpecialtyPanel characterId={character.id} ability="fabrication" />
          </div>
        )}
        {/* Etap 30c: dwie Zdolności, które stawiają na mapie cudzych ludzi —
            Wsparcie Stróża Prawa i zespół Korpo. Stoją w tym samym miejscu, co
            trzy panele wyżej, bo to nadal rozwinięcie wiersza Zdolności. */}
        {cpredRoleAbilityRank(data, registry, CPRED_BACKUP_ABILITY) !== null && (
          <div className="cp-ability-card">
            <BackupPanel characterId={character.id} />
          </div>
        )}
        {cpredRoleAbilityRank(data, registry, CPRED_TEAMWORK_ABILITY) !== null && (
          <div className="cp-ability-card">
            <TeamPanel characterId={character.id} />
          </div>
        )}
        {/* Etap 30d: cztery ostatnie Zdolności — Rockera, Fixera, Nomady
            i Media. Żadna nie dotyka walki, więc żadna nie ma domu w pasku
            akcji: stoją tylko tutaj, pod wierszem Zdolności, jak sześć
            wcześniejszych. */}
        {cpredRoleAbilityRank(data, registry, CPRED_CHARISMA_ABILITY) !== null && (
          <div className="cp-ability-card">
            <CharismaPanel characterId={character.id} />
          </div>
        )}
        {cpredRoleAbilityRank(data, registry, CPRED_OPERATOR_ABILITY) !== null && (
          <div className="cp-ability-card">
            <OperatorPanel characterId={character.id} />
          </div>
        )}
        {cpredRoleAbilityRank(data, registry, CPRED_MOTO_ABILITY) !== null && (
          <div className="cp-ability-card">
            <MotoPanel characterId={character.id} />
          </div>
        )}
        {cpredRoleAbilityRank(data, registry, CPRED_CREDIBILITY_ABILITY) !== null && (
          <div className="cp-ability-card">
            <CredibilityPanel characterId={character.id} />
          </div>
        )}
      </div>
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
  startRoll: StartRoll;
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
  const maxHp = cpredSheetHpMax(data);
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

  // Człowieczeństwo zostaje polem do wpisania: sięga 100, a strzałki mają sens
  // do dwóch cyfr (decyzja MG z 06.09).
  function setHumanity(event: ChangeEvent<HTMLInputElement>) {
    const value = parseNumberInput(event);
    if (value === undefined) return;
    saveData({ humanityCurrent: value }, 'humanityCurrent');
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
              <NumberStepper
                min={ROLE_RANK_MIN}
                max={ROLE_RANK_MAX}
                value={data.roleAbilityRank}
                readOnly={!isGm}
                {...(isGm
                  ? {}
                  : {
                      title: 'Poziom Zdolności kupuje się PD — patrz „Awans” na stronie drugiej.',
                    })}
                onChange={(value) => saveData({ roleAbilityRank: value }, 'roleAbilityRank')}
                label={`Ranga: ${role.ability}`}
              />
            </span>
          )}
        </div>
        {/* Etap 29b: Role, którymi postać była wcześniej. „Cały czas możesz
            podnosić poziom Zdolności Specjalnej poprzedniej Roli i korzystać
            z oferowanych przez nią korzyści" (s. 143) — więc stoją w tym samym
            miejscu, co bieżąca, a nie w archiwum na końcu karty. Rangę pisze
            MG albo płatny awans; zmienia się Rolę w „Awansie" na stronie
            drugiej, bo to zakup. */}
        {data.formerRoles.map((entry) => {
          const former = registry.roles.find((r) => r.id === entry.roleId) ?? null;
          if (!former) return null;
          return (
            <div key={entry.roleId} className="cp-field cp-row cp-ability cp-ability--former">
              <span className="cp-label" title="Rola, którą ta postać była wcześniej">
                {former.name}
              </span>
              <span className="cp-ability-name" title={former.ability}>
                {former.ability}
              </span>
              <span className="cp-rank" title="Ranga zdolności poprzedniej roli">
                <NumberStepper
                  min={ROLE_RANK_MIN}
                  max={ROLE_RANK_MAX}
                  value={entry.rank}
                  readOnly={!isGm}
                  {...(isGm
                    ? {}
                    : {
                        title: 'Poziom Zdolności kupuje się PD — patrz „Awans” na stronie drugiej.',
                      })}
                  onChange={(value) =>
                    saveData(
                      {
                        formerRoles: data.formerRoles.map((row) =>
                          row.roleId === entry.roleId ? { ...row, rank: value } : row,
                        ),
                      },
                      'formerRoles',
                    )
                  }
                  label={`Ranga: ${former.ability}`}
                />
              </span>
            </div>
          );
        })}
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
              onChange={setHumanity}
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
            <NumberStepper
              min={0}
              max={maxHp}
              value={data.hpCurrent}
              onChange={(value) => saveData({ hpCurrent: value }, 'hpCurrent')}
              label="Punkty Wytrzymałości"
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
          <span className="cp-pool-value">{deathSaveTarget(cpredEffectiveStats(data))}</span>
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
              title={`Rzuć 1k10 pod BC ${deathSaveTarget(cpredEffectiveStats(data))}. Każdy kolejny test jest o 1 trudniejszy.`}
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

      <RecoveryPanel data={data} characterId={character.id} />

      <StatEffects data={data} characterId={character.id} />

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
  mayAsk,
}: TabProps & {
  startRoll: StartRoll;
  mayAsk: boolean;
}) {
  const rollHint = rollHintFor(mayAsk);
  const psychosis = cyberpsychosisFor(data.humanityCurrent);
  // Etap 39: to samo małe pole „z", którym Empatia mówi od 23a, ile jej realnie
  // działa — teraz dla każdej Cechy, którą przesunął efekt czasowy. Nowego
  // miejsca na karcie nie ma i mieć nie powinna: gracz szuka tej liczby tam,
  // gdzie stoi Cecha, a nie w drugim panelu obok.
  const effective = cpredEffectiveStats(data);

  function setStat(statId: (typeof CPRED_STAT_IDS)[number], value: number) {
    saveData({ stats: { ...data.stats, [statId]: value } }, `stats.${statId}`);
  }

  return (
    <div className="cp-panel cp-stats">
      {CPRED_STAT_IDS.map((id) => (
        <div key={id} className="cp-field cp-field--notch cp-stat">
          <button
            type="button"
            className="cp-stat-abbr"
            onClick={(e: MouseEvent) =>
              startRoll({ kind: 'stat', statId: id }, e.shiftKey, e.altKey)
            }
            title={`Rzut: ${CPRED_STAT_LABELS[id].name}${rollHint}`}
          >
            {CPRED_STAT_LABELS[id].abbr}
          </button>
          <NumberStepper
            className="cp-stat-value"
            min={CPRED_STAT_MIN}
            max={CPRED_STAT_MAX}
            value={data.stats[id]}
            onChange={(value) => setStat(id, value)}
            label={CPRED_STAT_LABELS[id].name}
          />
          {id === 'luck' && (
            <span className="cp-stat-sub" title="Punkty Szczęścia, które jeszcze zostały">
              <span className="cp-of">z</span>
              <NumberStepper
                min={0}
                max={data.stats.luck}
                value={data.luckCurrent}
                onChange={(value) => saveData({ luckCurrent: value }, 'luckCurrent')}
                label="Szczęście: pula bieżąca"
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
          {id !== 'luck' && effective[id] !== data.stats[id] && (
            <span
              className={`cp-stat-sub${
                effective[id] < data.stats[id] ? ' cp-stat-sub--down' : ' cp-stat-sub--up'
              }`}
              title={
                id === 'emp' && effective.emp === psychosis.emp
                  ? 'Empatia użyta w rzutach — wynika z Człowieczeństwa (s. 229)'
                  : `${CPRED_STAT_LABELS[id].name} użyta w rzutach — przesunięta efektami czasowymi`
              }
            >
              <span className="cp-of">z</span>
              <span className="cp-stat-sub-value">{effective[id]}</span>
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
  mayAsk,
}: TabProps & {
  startRoll: StartRoll;
  mayAsk: boolean;
}) {
  const rollHint = rollHintFor(mayAsk);
  const registry = useCharacterStore((s) => s.registry);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const groups = useMemo(() => groupedSkills(registry), [registry]);
  // BAZA has to show what the roll will actually use: EMP follows Humanity
  // once there is chrome in the body (stage 23a), and a sheet that printed the
  // base value would disagree with every card the server sends back.
  //
  // Od 06.09 przez `cpredEffectiveStats`, a nie `effectiveCpredStats`: to
  // druga funkcja liczy **także** efekty czasowe z etapu 39, a umowa tamtego
  // etapu mówi, że jedyną drogą do liczby, na którą pada kość, jest ona. Do tej
  // sesji kolumny CECHA i BAZA pokazywały REF 8 przy Liszu −3, a kość leciała
  // z piątki — kolumna Cech obok liczyła się już poprawnie, więc karta
  // przeczyła sama sobie o dwie komórki dalej.
  const effective = cpredEffectiveStats(data);
  const columns = useMemo(() => layoutSkillColumns(groups, SKILL_COLUMN_COUNT), [groups]);

  function setLevel(skillId: string, value: number) {
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
                const rollTitle = `Rzut: ${cpredSkillLabel(skill, data)} (${abbr})${rollHint}`;
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
                          startRoll({ kind: 'skill', skillId: skill.id }, e.shiftKey, e.altKey)
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
                      <NumberStepper
                        min={SKILL_LEVEL_MIN}
                        max={SKILL_LEVEL_MAX}
                        value={level}
                        readOnly={!isGm}
                        {...(isGm
                          ? {}
                          : {
                              title: 'Poziom podnosi się za PD — panel „Awans” na stronie drugiej.',
                            })}
                        onChange={(value) => setLevel(skill.id, value)}
                        label={`Poziom: ${skill.name}`}
                      />
                    </div>
                    <div className="cp-field cp-skill-cell">{effective[skill.stat]}</div>
                    <div className="cp-field cp-skill-cell">
                      <button
                        type="button"
                        className="cp-skill-base"
                        onClick={(e: MouseEvent) =>
                          startRoll({ kind: 'skill', skillId: skill.id }, e.shiftKey, e.altKey)
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
  attachment,
}: {
  characterId: string;
  row: CpredWeaponRow;
  resolved: ResolvedWeapon | null;
  /**
   * The bolted-on weapon this picker loads, when it is not the row's own gun
   * (02.09). Its magazine, its choice of round, and its own reload — the row id
   * still addresses the sheet, because that is where both magazines live.
   */
  attachment?: { id: string; name: string };
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
  const current = attachment ? row.attachmentAmmoId?.[attachment.id] : row.ammoId;
  const loaded = current && options.some((ammo) => ammo.id === current) ? current : '';
  const forced = resolved?.ammoIds?.length === 1;

  return (
    <select
      className="weapon-ammo-type"
      value={loaded}
      disabled={forced}
      aria-label={`Rodzaj naboju: ${attachment?.name ?? row.name}`}
      title={
        forced
          ? 'Ta broń strzela tylko jednym rodzajem amunicji.'
          : 'Rodzaj naboju w magazynku. Zmiana w trakcie walki kosztuje Akcję (Przeładowanie) i ładuje magazynek do pełna.'
      }
      onChange={(e) =>
        reloadWeapon(characterId, row.id, e.target.value || null, undefined, attachment?.id)
      }
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
 * Gniazda na dodatki przy wierszu broni (etap 31, s. 342).
 *
 * „Każda zwykła (nie egzotyczna) broń dystansowa ma trzy gniazda na dodatki" —
 * i to jest cała ta kontrolka: tyle kwadracików, ile gniazd, wypełnione tym, co
 * już wisi na broni. Montaż idzie **zdarzeniem**, nie łatą karty, bo magazynek
 * po dołożeniu bębna liczy się z tabeli w kompendium, a drugiej kopii tego
 * samego dodatku nie wolno przyjąć — obie odpowiedzi należą do serwera.
 *
 * Wiersz bez gniazd (broń biała, egzotyk, wiersz bez wpisu z katalogu) nie
 * dostaje nic: pusty pasek byłby jeszcze jedną rzeczą do wytłumaczenia.
 */
function WeaponAttachments({
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
  const [picking, setPicking] = useState(false);

  const catalogue = useMemo(
    () =>
      attachmentProfilesOf(
        order.map((id) => entries[id]).filter((entry): entry is CompendiumEntry => !!entry),
      ),
    [entries, order],
  );
  const fitted = useMemo(
    () => fittedAttachmentsFor(row.attachmentIds, catalogue, resolved),
    [row.attachmentIds, catalogue, resolved],
  );
  const options = useMemo(
    () => attachmentOptionsFor(catalogue, resolved, fitted),
    [catalogue, resolved, fitted],
  );

  const slots = resolved?.attachmentSlots ?? 0;
  if (slots <= 0) return null;
  const used = attachmentSlotsUsed(fitted);
  const free = attachmentSlotsFree(resolved, fitted);

  return (
    <div className="weapon-slots">
      <span
        className="weapon-slots-boxes"
        aria-label={`Gniazda na dodatki: ${used} z ${slots} zajęte`}
        title={`Gniazda na dodatki: ${used} z ${slots} zajęte`}
      >
        {Array.from({ length: slots }, (_, index) => (
          <span
            key={index}
            className={`weapon-slot${index < used ? ' weapon-slot--used' : ''}`}
            aria-hidden
          />
        ))}
      </span>
      {fitted.map((attachment) => (
        <button
          key={attachment.id}
          type="button"
          className="weapon-slot-chip"
          title={`${describeAttachment(attachment)} — kliknij, żeby zdjąć`}
          onClick={() => setWeaponAttachment(characterId, row.id, attachment.id, 'unmount')}
        >
          {attachment.name} <span aria-hidden>✕</span>
        </button>
      ))}
      {free > 0 && options.length > 0 && (
        <button
          type="button"
          className="small-button"
          title="Dołóż dodatek z katalogu — pasują tylko te, które podręcznik dopuszcza do tej broni"
          onClick={() => setPicking(true)}
        >
          + Dodatek
        </button>
      )}
      {picking && (
        <ul className="weapon-slot-picker">
          {options.map((attachment) => (
            <li key={attachment.id}>
              <button
                type="button"
                className="weapon-picker-row"
                onClick={() => {
                  setPicking(false);
                  setWeaponAttachment(characterId, row.id, attachment.id, 'mount');
                }}
              >
                <span className="weapon-picker-name">{attachment.name}</span>
                <span className="weapon-picker-stats">{describeAttachment(attachment)}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="small-button" onClick={() => setPicking(false)}>
              Anuluj
            </button>
          </li>
        </ul>
      )}
    </div>
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
  startRoll: StartRoll;
}) {
  const entries = useCompendiumStore((s) => s.entries);
  const weaponTypeById = useCompendiumStore((s) => s.weaponTypeById);
  const tokens = useTokenStore((s) => s.tokens);
  /**
   * Otwarty wybór broni z katalogu (naprawa 31.08): `null` — zamknięty,
   * `{ rowId: null }` — dopisuje nowy wiersz, `{ rowId }` — wiąże istniejący.
   */
  const [picking, setPicking] = useState<{ rowId: string | null } | null>(null);

  /**
   * Co ta postać ma w rękach (etap 41).
   *
   * Czytane przez `cpredDrawnWeapons`, a nie wprost z pola, bo tam mieszka
   * reguła domyślna: karta, przy której nikt nigdy nie dobył ani nie schował
   * broni, **pokazuje pierwszą z listy**. Guzik „Schowaj" przy niej nie jest
   * więc martwy — jest pierwszą deklaracją rąk tej figury.
   */
  const inHands = cpredDrawnWeapons(data).map((row) => row.id);

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

  /**
   * Broń, którą ktoś doczepił do tego wiersza (etap 31) — bagnet, podwieszany
   * granatnik, podwieszana strzelba.
   *
   * Rozwiązywana z katalogu za każdym razem, a nie kopiowana na kartę: tabela
   * zasięgów granatnika należy do granatnika, więc MG poprawiający ją w jednym
   * miejscu poprawia ją wszystkim.
   */
  function secondaryRowsOf(
    row: CpredWeaponRow,
  ): { attachment: CpredAttachmentProfile; weapon: ResolvedWeapon }[] {
    const catalogue = attachmentProfilesOf(Object.values(entries));
    const types = new Map(Object.entries(weaponTypeById));
    const rows: { attachment: CpredAttachmentProfile; weapon: ResolvedWeapon }[] = [];
    for (const attachment of fittedAttachmentsFor(row.attachmentIds, catalogue, resolvedOf(row))) {
      const weapon = resolveAttachmentWeapon(attachment, { weaponTypeById: types });
      if (weapon) rows.push({ attachment, weapon });
    }
    return rows;
  }

  /**
   * Bierze broń z katalogu — nowym wierszem albo wiążąc wiersz już wpisany.
   *
   * Do 31.08 „+ Broń" dokładała pusty wiersz z samą nazwą, a taka broń nie
   * strzelała: bez `compendiumId` planer nie ma jak dojść do typu broni, a więc
   * do tabeli zasięgów, i odmawiał zdaniem „Ta broń nie ma tabeli zasięgów".
   * Pole nazwy wyglądało przy tym jak pole z podpowiedziami, a nim nie było.
   *
   * Wiersz budujemy tym samym `purchasedSheetRow`, którym buduje go zakup
   * i „Dodaj za darmo" — łup, zakup i ręka MG mają być tym samym wierszem.
   * Wiązanie istniejącego **zostawia nazwę i uwagi** (przezwisko broni jest
   * własnością gracza), a liczby bierze z katalogu, bo to one mają się zgadzać
   * z wybranym modelem. Magazynek nie rośnie przy wiązaniu w środku walki.
   */
  function takeFromCatalogue(entry: CompendiumEntry, picked: ResolvedWeapon | null) {
    const target = picking?.rowId ?? null;
    setPicking(null);
    const built = purchasedSheetRow(entry, picked, newRowId());
    if (!built || built.list !== 'weapons') return;
    if (target === null) {
      saveData({ weapons: [...data.weapons, built.row] }, 'weapons');
      return;
    }
    const row = data.weapons.find((candidate) => candidate.id === target);
    if (!row) return;
    const magazine = built.row.ammoMax;
    updateRow(target, {
      compendiumId: entry.id,
      damage: built.row.damage,
      ammoMax: magazine,
      ammoCurrent: row.ammoMax > 0 ? Math.min(row.ammoCurrent, magazine) : magazine,
      ammoType: built.row.ammoType,
      rof: built.row.rof,
    });
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

  /**
   * Arms the map: the next click on a token fires this weapon.
   *
   * Since stage 31 „this weapon" may be the thing bolted under the barrel —
   * `firedWith` is then the bayonet or the underbarrel, and everything the
   * crosshair says about the shot (its name, whether it is melee) comes off
   * that weapon rather than off the rifle carrying it.
   */
  function aim(
    row: CpredWeaponRow,
    mode: CpredAttackMode,
    resolved: ResolvedWeapon | null,
    firedWith?: { attachment: CpredAttachmentProfile; resolved: ResolvedWeapon },
  ) {
    const own = Object.values(tokens).find((token) => token.characterId === character.id);
    useAttackStore.getState().arm({
      characterId: character.id,
      characterName: character.name,
      ...(own ? { attackerTokenId: own.id } : {}),
      weaponRowId: row.id,
      weaponName: firedWith ? `${row.name} · ${firedWith.attachment.name}` : row.name,
      mode,
      modifier: 0,
      melee: (firedWith ? firedWith.resolved : resolved)?.melee ?? false,
      ...(firedWith
        ? { attachmentId: firedWith.attachment.id, attachmentName: firedWith.attachment.name }
        : {}),
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
          {data.weapons.flatMap((row) => {
            const resolved = resolvedOf(row);
            const tracksAmmo = row.ammoMax > 0;
            const empty = tracksAmmo && row.ammoCurrent <= 0;
            return [
              <tr key={row.id}>
                <td>
                  <input
                    type="text"
                    maxLength={64}
                    value={row.name}
                    onChange={(e) => updateRow(row.id, { name: e.target.value })}
                  />
                  {/* Wiersz bez wpisu z katalogu nie ma tabeli zasięgów, więc
                      nie strzela. Do 31.08 mówił to dopiero planer, w chwili
                      gdy strzał już się nie udał — teraz mówi to karta. */}
                  {!resolved && (
                    <button
                      type="button"
                      className="small-button weapon-unbound"
                      title="Ta broń nie ma wpisu z katalogu, więc nie zna tabeli zasięgów i nie wystrzeli. Wskaż model — obrażenia, magazynek i szybkostrzelność uzupełnią się z kompendium, nazwa i uwagi zostaną Twoje."
                      onClick={() => setPicking({ rowId: row.id })}
                    >
                      ⚠ Wskaż broń z katalogu
                    </button>
                  )}
                  {/* „Broń niskiej jakości … nie nadaje się do użytku"
                      (s. 244). Guzik, a nie sam chip: usterkę usuwa się Akcją
                      i bez Testu, więc karta ma umieć to, co pasek akcji —
                      inaczej gracz, który patrzy na kartę, widzi wyłącznie
                      zdanie o tym, że broń nie działa. */}
                  {row.jammed === true && (
                    <button
                      type="button"
                      className="small-button weapon-jammed"
                      title="Broń niskiej jakości zacięła się po Krytycznej Porażce. Usunięcie usterki kosztuje Akcję i nie wymaga Testu."
                      onClick={() => clearWeaponJam(character.id, row.id)}
                    >
                      ⚠ Zacięta — usuń usterkę
                    </button>
                  )}
                  {/* Etap 41: co jest w rękach, a co w kaburze.
                      Guzik, a nie plakietka, bo to jest **czynność** z ceną
                      z podręcznika (s. 168): dobycie za darmo, schowanie za
                      Akcję. Od pierwszego kliknięcia ta figura ma zadeklarowane
                      ręce i od tej chwili planer ataku odmawia broni, której
                      w nich nie ma — dopóki nikt nie kliknie, karta pokazuje
                      pierwszą broń i niczego nie zabrania. */}
                  {inHands.includes(row.id) ? (
                    <span className="weapon-hands">
                      <span className="weapon-hands-badge" title="Ta broń jest w rękach">
                        ✊ W rękach
                      </span>
                      <button
                        type="button"
                        className="small-button"
                        title="Schowanie broni do kabury zabiera Akcję (s. 168)."
                        onClick={() => drawWeapon(character.id, row.id, 'holster')}
                      >
                        Schowaj (Akcja)
                      </button>
                      <button
                        type="button"
                        className="small-button"
                        title="Upuszczenie trzymanej broni nie wymaga Akcji (s. 168)."
                        onClick={() => drawWeapon(character.id, row.id, 'drop')}
                      >
                        Upuść
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="small-button weapon-draw"
                      title="Sięgnięcie wolną ręką po łatwo dostępną broń nie wymaga Akcji (s. 168)."
                      onClick={() => drawWeapon(character.id, row.id, 'draw')}
                    >
                      Dobądź
                    </button>
                  )}
                  {/* Etap 31: trzy gniazda i to, co w nich siedzi. */}
                  <WeaponAttachments characterId={character.id} row={row} resolved={resolved} />
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
                      <NumberStepper
                        className={`weapon-ammo-input${empty ? ' weapon-ammo-input--empty' : ''}`}
                        min={0}
                        max={row.ammoMax}
                        value={Math.min(row.ammoCurrent, row.ammoMax)}
                        label={`Stan magazynka: ${row.name}`}
                        onChange={(value) => updateRow(row.id, { ammoCurrent: value })}
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
                  <div className="weapon-actions-row">
                    <button
                      type="button"
                      className="small-button"
                      disabled={empty || !resolved}
                      title={
                        !resolved
                          ? 'Ta broń nie ma wpisu z katalogu — wskaż model, żeby poznała tabelę zasięgów'
                          : empty
                            ? 'Pusty magazynek — przeładuj'
                            : resolved.melee
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
                  </div>
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
              </tr>,
              // Etap 31: bagnet i broń podwieszana to ta sama sztuka żelastwa,
              // ale drugi sposób zrobienia komuś krzywdy — więc drugi wiersz
              // pod tym samym wierszem, a nie druga pozycja na liście broni.
              ...secondaryRowsOf(row).map(({ attachment, weapon }) => (
                <tr key={`${row.id}:${attachment.id}`} className="weapon-secondary">
                  <td>
                    <span className="weapon-secondary-name">↳ {attachment.name}</span>
                  </td>
                  <td>{weapon.damage}</td>
                  <td className="weapon-ammo-cell">
                    {(weapon.magazine ?? 0) > 0 ? (
                      <>
                        <span className="weapon-ammo-max">
                          {row.attachmentAmmo?.[attachment.id] ?? weapon.magazine}/{weapon.magazine}
                        </span>
                        <button
                          type="button"
                          className="small-button"
                          disabled={
                            (row.attachmentAmmo?.[attachment.id] ?? weapon.magazine ?? 0) >=
                            (weapon.magazine ?? 0)
                          }
                          title="Przeładuj podwieszaną broń — własny magazynek, ta sama Akcja"
                          aria-label={`Przeładuj: ${attachment.name}`}
                          onClick={() =>
                            reloadWeapon(character.id, row.id, undefined, undefined, attachment.id)
                          }
                        >
                          ⟳
                        </button>
                      </>
                    ) : (
                      <span className="weapon-ammo-none" title="Ta broń nie liczy amunicji">
                        —
                      </span>
                    )}
                    {/* Ten sam wybór naboju, co w wierszu głównym (02.09) —
                        bez niego z granatnika podwieszanego nie dało się
                        wystrzelić dymu ani gazu, choć katalog je oferuje. */}
                    <AmmoPicker
                      characterId={character.id}
                      row={row}
                      resolved={weapon}
                      attachment={{ id: attachment.id, name: attachment.name }}
                    />
                  </td>
                  <td>{weapon.rof}</td>
                  <td className="weapon-secondary-note">
                    {weapon.melee ? 'broń biała — do 2 m' : (weapon.typeName ?? '')}
                  </td>
                  <td className="weapon-actions">
                    <div className="weapon-actions-row">
                      <button
                        type="button"
                        className="small-button"
                        disabled={
                          (weapon.magazine ?? 0) > 0 &&
                          (row.attachmentAmmo?.[attachment.id] ?? 0) <= 0
                        }
                        title={
                          weapon.melee
                            ? 'Atak wręcz — wskaż cel na mapie (do 2 m)'
                            : 'Atak podwieszaną bronią — wskaż cel na mapie'
                        }
                        onClick={() =>
                          aim(row, 'single', resolved, { attachment, resolved: weapon })
                        }
                      >
                        Atak
                      </button>
                    </div>
                  </td>
                  <td />
                </tr>
              )),
            ];
          })}
        </tbody>
      </table>
      <button
        type="button"
        className="cp-add"
        title="Broń bierze się z katalogu — stamtąd przychodzi tabela zasięgów, bez której nic nie wystrzeli. Nazwę można potem zmienić na własną."
        onClick={() => setPicking({ rowId: null })}
      >
        + Broń z katalogu
      </button>
      {picking && (
        <WeaponCatalogPicker
          binding={picking.rowId !== null}
          onPick={takeFromCatalogue}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

/** Ile modeli pokazuje wybór naraz; reszta czeka na doprecyzowanie szukania. */
const WEAPON_PICKER_LIMIT = 40;

/**
 * Wybór modelu broni z kompendium (naprawa 31.08).
 *
 * Broń na karcie musi wskazywać **konkretny wpis katalogu**, bo dopiero on
 * prowadzi do typu broni, a typ niesie tabelę zasięgów: bez tego planer odmawia
 * strzału („Ta broń nie ma tabeli zasięgów"). Dlatego wiersz nie powstaje już
 * z wolnego tekstu — powstaje z wyboru, a nazwę wolno zmienić po fakcie.
 *
 * Świadomie **nie** dopasowuje po nazwie: „Pistolet" pasowałby do kilkunastu
 * modeli i po cichu przypiąłby złą tabelę zasięgów, czyli zły PT na każdym
 * dystansie. Lepiej, żeby MG wskazał raz, niż żeby VTT zgadywał co strzał.
 */
function WeaponCatalogPicker({
  binding,
  onPick,
  onClose,
}: {
  binding: boolean;
  onPick: (entry: CompendiumEntry, resolved: ResolvedWeapon | null) => void;
  onClose: () => void;
}) {
  const entries = useCompendiumStore((s) => s.entries);
  const order = useCompendiumStore((s) => s.order);
  const weaponTypeById = useCompendiumStore((s) => s.weaponTypeById);
  const [query, setQuery] = useState('');

  const found = useMemo(() => {
    const catalogue = order
      .map((id) => entries[id])
      .filter((entry): entry is CompendiumEntry => !!entry);
    return searchCompendium(catalogue, query, 'weapon').slice(0, WEAPON_PICKER_LIMIT);
  }, [entries, order, query]);

  const types = useMemo(() => new Map(Object.entries(weaponTypeById)), [weaponTypeById]);

  return (
    <div className="weapon-picker">
      <div className="weapon-picker-head">
        <input
          type="search"
          className="weapon-picker-search"
          placeholder="Szukaj w katalogu broni…"
          aria-label="Szukaj w katalogu broni"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              onClose();
            }
          }}
        />
        <button type="button" className="small-button" onClick={onClose}>
          Anuluj
        </button>
      </div>
      {found.length === 0 ? (
        <p className="weapon-picker-empty">
          {order.length === 0
            ? 'Katalog jest pusty — wczytaj kompendium w zakładce „Kompendium”.'
            : 'Nic takiego nie ma w katalogu. Brakujący model dopisuje MG własnym wpisem.'}
        </p>
      ) : (
        <ul className="weapon-picker-list">
          {found.map((entry) => {
            const resolved = isWeaponEntry(entry)
              ? resolveWeapon(entry, { weaponTypeById: types })
              : null;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className="weapon-picker-row"
                  onClick={() => onPick(entry, resolved)}
                >
                  <span className="weapon-picker-name">{entry.name}</span>
                  {/* Trzy liczby, po których poznaje się model: obrażenia,
                      magazynek i szybkostrzelność. Brak typu broni widać
                      od razu, bo to jedyny wiersz bez nich. */}
                  <span className="weapon-picker-stats">
                    {resolved
                      ? `${resolved.damage || '—'} · mag. ${resolved.magazine ?? '—'} · LA ${resolved.rof}`
                      : 'bez typu broni — nie zna tabeli zasięgów'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="weapon-picker-hint">
        {binding
          ? 'Nazwa i uwagi wiersza zostaną Twoje — z katalogu przyjdą obrażenia, magazynek, szybkostrzelność i tabela zasięgów.'
          : 'Nazwę dopisanego wiersza możesz potem zmienić na własną — wiązanie z katalogiem zostaje.'}
      </p>
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
                <span className="cp-armor-slot">{ARMOR_LOCATION_LABELS[location]}</span>
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
      <NumberStepper
        min={0}
        max={row.sp}
        value={Math.min(row.spCurrent, row.sp)}
        onChange={(value) => update(row.id, { spCurrent: value })}
        label="Bieżące OB (po ablacji)"
        title="Ablacja: każde przebicie obniża OB o 1. Naprawa przywraca pełną wartość."
      />
      <span className="cp-of">z</span>
      <NumberStepper
        min={0}
        max={ARMOR_SP_MAX}
        value={row.sp}
        onChange={(value) =>
          update(row.id, { sp: value, spCurrent: Math.min(row.spCurrent, value) })
        }
        label="OB pancerza (nieuszkodzonego)"
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
    <NumberStepper
      min={ARMOR_PENALTY_MIN}
      max={0}
      value={row.penalty ?? 0}
      onChange={(value) => update(row.id, { penalty: value === 0 ? undefined : value })}
      format={(value) => (value === 0 ? '0' : `−${Math.abs(value)}`)}
      label="Kara pancerza do REF/ZW/RUCH"
      title="Kara do REF, ZW i RUCH-u. Liczy się najgorsza z noszonych sztuk, kary się nie sumują."
    />
  );
}

/**
 * Rekonwalescencja (s. 222–223) — jedyne miejsce, z którego PW wracają same.
 *
 * Panel jest **pod progami ran i nad Ranami Krytycznymi**, bo tam czyta się go
 * przy stole: najpierw „jak bardzo mnie boli", potem „ile odzyskam do jutra",
 * a dopiero potem lista złamań.
 *
 * Znika u postaci z kompletem PW i bez rozpoczętego procesu — zdrowemu
 * człowiekowi guzik „Dzień odpoczynku" nie ma co powiedzieć.
 */
function RecoveryPanel({ data, characterId }: { data: CpredCharacterData; characterId: string }) {
  const [busy, setBusy] = useState(false);
  const max = cpredSheetHpMax(data);
  const rate = cpredHealRate(data);
  if (data.hpCurrent >= max && !data.recovery.stabilized) return null;

  async function rest(strained: boolean) {
    setBusy(true);
    try {
      await restForADay(characterId, strained);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cp-panel cp-recovery">
      <div className="cp-field cp-field--notch cp-recovery-field">
        <span className="cp-label">Rekonwalescencja</span>
        {data.recovery.stabilized ? (
          <p className="cp-recovery-rate">
            <strong>+{rate.perDay} PW</strong> za pełny dzień odpoczynku
            <span className="cp-recovery-sources">
              {rate.sources.map((row) => row.label).join(' · ')}
            </span>
          </p>
        ) : (
          <p className="cp-recovery-rate cp-recovery-rate--idle">
            Naturalne leczenie nie ruszyło. Ktoś musi wykonać Akcję „Ustabilizowanie" — dopiero
            wtedy dzień odpoczynku cokolwiek daje (s. 222).
          </p>
        )}
      </div>
      <div className="cp-recovery-buttons">
        <button
          type="button"
          className="primary-button"
          disabled={busy || !data.recovery.stabilized}
          title={
            data.recovery.stabilized
              ? `Minął pełny dzień odpoczynku: +${rate.perDay} PW`
              : 'Najpierw Ustabilizowanie'
          }
          onClick={() => void rest(false)}
        >
          Dzień odpoczynku
        </button>
        <button
          type="button"
          disabled={busy || !data.recovery.stabilized}
          title="Postać się nadwyrężyła: za ten dzień nie odzyskuje PW, rany otwierają się i trzeba ją ustabilizować od nowa (s. 223)."
          onClick={() => void rest(true)}
        >
          Nadwyrężyła się
        </button>
      </div>
    </div>
  );
}

/** Ten sam wiersz rany bez łaty — „minął dzień", efekty wracają. */
function stripPatch(row: CpredCriticalInjuryRow): CpredCriticalInjuryRow {
  const { patched: _patched, ...rest } = row;
  return rest;
}

/**
 * Critical Injuries the character is suffering. They are drawn by the damage
 * flow; here they can be read (the effect is the rules text) and removed —
 * „Łatanie" and „Leczenie" are played out at the table, not automated.
 *
 * Od etapu 27b stoją w kolumnie tożsamości strony pierwszej, bo tam drukuje je
 * karta — obok Uzależnień i pod Przeżywalnością.
 */
/**
 * Efekty czasowe na Cechach (etap 39) — chipy i formularz MG.
 *
 * Stoi **nad** Krytycznymi Urazami i pod stanem zdrowia, bo odpowiada na to
 * samo pytanie co one („w jakim ona jest stanie"), a nie na „co potrafi".
 * Panelu nie ma wcale, gdy lista jest pusta i patrzy gracz: pusty prostokąt
 * z napisem „bez efektów" na każdej karcie stołu byłby szumem.
 *
 * Odliczanie liczy się z zegara świata trzymanego w `gameTimeStore` — ta sama
 * liczba, którą pokazuje górny pasek. Gracz widzi w pasku dobę i porę dnia
 * (rozstrzygnięcie z 05.09), ale minuta jedzie do klienta i tutaj mówi rzecz
 * uczciwą: ile jeszcze **tego** efektu zostało.
 */
function StatEffects({ data, characterId }: { data: CpredCharacterData; characterId: string }) {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const minutes = useGameTimeStore((s) => s.minutes);
  const [stat, setStat] = useState<CpredStatId>('ref');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const [durationS, setDurationS] = useState(String(CPRED_HOUR_S));

  if (data.statEffects.length === 0 && !isGm) return null;

  function apply() {
    const parsed = parseStatEffectAmount(amount);
    if (!parsed || source.trim().length === 0) return;
    setStatEffect({
      characterId,
      stat,
      source: source.trim(),
      durationS: Number(durationS),
      ...parsed,
    });
    setAmount('');
    setSource('');
  }

  return (
    <div className="cp-panel cp-stat-effects">
      <div className="cp-bar">Efekty czasowe</div>
      {data.statEffects.length === 0 ? (
        <div className="cp-field cp-injuries-empty">bez efektów na Cechach</div>
      ) : (
        <ul className="stat-effect-list">
          {data.statEffects.map((effect) => (
            <li key={effect.id} className="cp-field stat-effect-row">
              <span
                className={`stat-effect-value${
                  effect.value < 0 ? ' stat-effect-value--down' : ' stat-effect-value--up'
                }`}
              >
                {describeCpredStatEffectValue(effect)}
              </span>
              <span className="stat-effect-source">{effect.source}</span>
              <span
                className="stat-effect-timer"
                title={
                  effect.rolled
                    ? `Wylosowane raz przy nałożeniu (${effect.rolled}) i zapisane na karcie.`
                    : 'Wpisane przez MG przy nałożeniu.'
                }
              >
                {describeCpredStatEffectTimer(effect, { round: null, minutes })}
              </span>
              {isGm && (
                <button
                  type="button"
                  className="cp-mini-button"
                  title="Zdejmij ten efekt"
                  aria-label={`Zdejmij efekt: ${describeCpredStatEffect(effect)}`}
                  onClick={() => setStatEffect({ characterId, effectId: effect.id })}
                >
                  ⌫
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isGm && (
        <div className="cp-field stat-effect-form">
          <select
            value={stat}
            onChange={(e) => setStat(e.target.value as CpredStatId)}
            aria-label="Cecha efektu"
          >
            {CPRED_STAT_IDS.map((id) => (
              <option key={id} value={id}>
                {CPRED_STAT_LABELS[id].abbr}
              </option>
            ))}
          </select>
          <input
            className="stat-effect-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="−2 albo −1k6"
            title="Liczba przesuwa Cechę wprost; notacja („−1k6”) jest rzucana raz, na serwerze, i zapisywana jako liczba."
            aria-label="O ile"
          />
          <input
            className="stat-effect-source-input"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="źródło, np. Nerwosol"
            maxLength={64}
            aria-label="Źródło efektu"
          />
          <select
            value={durationS}
            onChange={(e) => setDurationS(e.target.value)}
            aria-label="Czas trwania"
          >
            {STAT_EFFECT_DURATIONS.map((option) => (
              <option key={option.seconds} value={option.seconds}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={apply}
            disabled={parseStatEffectAmount(amount) === null || source.trim().length === 0}
            title="Nałóż efekt — serwer policzy oba terminy (runda walki i zegar świata)"
          >
            Nałóż
          </button>
        </div>
      )}
    </div>
  );
}

/** Długości, które MG wybiera jednym kliknięciem; godzina jest domyślna (RAW). */
const STAT_EFFECT_DURATIONS: readonly { seconds: number; label: string }[] = [
  { seconds: 60, label: 'na minutę' },
  { seconds: 10 * 60, label: 'na 10 min' },
  { seconds: CPRED_HOUR_S, label: 'na godzinę' },
  { seconds: 6 * CPRED_HOUR_S, label: 'na 6 h' },
  { seconds: 24 * CPRED_HOUR_S, label: 'na dobę' },
];

/**
 * „−2" albo „−1k6" — jedno pole na obie drogi.
 *
 * Dwa pola („ile" i „czym rzucić") kłóciłyby się przy każdym wpisaniu obu,
 * a MG i tak pisze jedno albo drugie. Znak czyta się z przodu napisu i dotyczy
 * obu: „−1k6" ma **obniżyć** Cechę, a rzut jest o wielkości, nie o kierunku.
 */
function parseStatEffectAmount(
  raw: string,
): { value: number } | { formula: string; negative: boolean } | null {
  const text = raw.trim().replace('−', '-');
  if (text.length === 0) return null;
  const negative = text.startsWith('-');
  const body = text.replace(/^[+-]/, '').trim();
  if (body.length === 0) return null;
  if (/^\d+$/.test(body)) {
    const value = Number(body);
    if (value === 0 || value > CPRED_STAT_EFFECT_VALUE_MAX) return null;
    return { value: negative ? -value : value };
  }
  if (!/^\d*[kd]\d+$/i.test(body)) return null;
  return { formula: body, negative };
}

function CriticalInjuries({ data, saveData, characterId }: TabProps & { characterId: string }) {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const entriesById = useCompendiumStore((s) => s.entries);
  const order = useCompendiumStore((s) => s.order);
  const tokens = useTokenStore((s) => s.tokens);
  /**
   * Figura pacjenta na scenie — adres, którego potrzebuje rzut na leczenie.
   * Szukanie stoi tutaj, a nie w `TreatInjury`, odkąd formularz obsługuje też
   * figury bez karty: pacjentem jest żeton, a karta wie tylko, który to jej.
   */
  const patientToken = useMemo(
    () => Object.values(tokens).find((token) => token.characterId === characterId) ?? null,
    [tokens, characterId],
  );
  const [picked, setPicked] = useState('');
  /**
   * Rana i tryb, w którym otwarto przy niej formularz; naraz tylko jeden.
   * Klucz jest parą, bo Łatanie i Leczenie tej samej rany to dwa różne zdania
   * z tabeli i dwa różne rzuty.
   */
  const [treating, setTreating] = useState<{ id: string; mode: CpredCareMode } | null>(null);
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
            <li
              key={`${injury.id}-${index}`}
              className={`cp-field injury-row${injury.patched ? ' injury-row--patched' : ''}`}
            >
              <div className="injury-head">
                <span className="injury-name">{injury.name}</span>
                {/*
                  Etap 15: rana załatana zostaje na karcie — milkną tylko jej
                  skutki, i tylko do końca dnia. Chip mówi kto i czym, a ⌫ obok
                  kończy łatę: dzień mija na stole, nie w zegarze VTT.
                */}
                {injury.patched ? (
                  <span
                    className="injury-patched"
                    title={`Załatane: ${injury.patched.skill} — ${injury.patched.by}. Efekt rany milczy do końca dnia.`}
                  >
                    załatana
                    <button
                      type="button"
                      className="cp-mini-button"
                      title="Minął dzień — łata puszcza, efekt rany wraca"
                      aria-label={`Zdejmij łatę z rany: ${injury.name}`}
                      onClick={() =>
                        saveData(
                          {
                            criticalInjuries: data.criticalInjuries.map((row, i) =>
                              i === index ? stripPatch(row) : row,
                            ),
                          },
                          'criticalInjuries',
                        )
                      }
                    >
                      ⌫
                    </button>
                  </span>
                ) : null}
                {/* Skąd ta rana (naprawa 31.08). Wyrzucona pokazuje wynik,
                    nazwana — chip „nadana": ręka MG, gaz, granat hukowy albo
                    Celowanie w nogę. Zero na miejscu wyniku znaczyło do 31.08
                    dokładnie tyle, co brak wiersza, więc prowieniencja ginęła. */}
                {injury.rolled ? (
                  <span className="injury-roll" title="Wynik 2k6 z tabeli ran krytycznych">
                    2k6 = {injury.rolled}
                  </span>
                ) : injury.assigned ? (
                  <span
                    className="injury-roll"
                    title="Ranę nazwał efekt albo MG — nikt nie rzucał na tabelę"
                  >
                    nadana
                  </span>
                ) : null}
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
                {/*
                  Etap 15: „Łatanie niweluje efekt rany do końca dnia" (s. 223).
                  Osobny guzik, nie drugi tryb tego samego — bo to inne zdanie
                  z tabeli, inne PT i zwykle inna Umiejętność. Gaśnie, gdy rana
                  jest już załatana: drugi raz nie ma czego uciszać.
                */}
                {cpredCareOptions(injury, 'quickFix').length > 0 && (
                  <button
                    type="button"
                    className="cp-mini-button"
                    disabled={injury.patched !== undefined}
                    title={
                      injury.patched
                        ? 'Ta rana jest już załatana — jej efekt milczy do końca dnia.'
                        : `Łatanie: ${describeCareOptions(cpredCareOptions(injury, 'quickFix'))}`
                    }
                    aria-label={`Załataj ranę: ${injury.name}`}
                    onClick={() =>
                      setTreating(
                        treating?.id === injury.id && treating.mode === 'quickFix'
                          ? null
                          : { id: injury.id, mode: 'quickFix' },
                      )
                    }
                  >
                    Załataj
                  </button>
                )}
                {cpredTreatmentOptions(injury).length > 0 && (
                  <button
                    type="button"
                    className="cp-mini-button"
                    title={`Leczenie: ${describeCareOptions(cpredTreatmentOptions(injury))}`}
                    aria-label={`Lecz ranę: ${injury.name}`}
                    onClick={() =>
                      setTreating(
                        treating?.id === injury.id && treating.mode === 'treatment'
                          ? null
                          : { id: injury.id, mode: 'treatment' },
                      )
                    }
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
              {treating?.id === injury.id &&
                (patientToken ? (
                  <TreatInjury
                    patient={{
                      tokenId: patientToken.id,
                      name: patientToken.name,
                      characterId,
                    }}
                    injury={injury}
                    mode={treating.mode}
                    onClose={() => setTreating(null)}
                  />
                ) : (
                  <p className="injury-care">
                    Ta postać nie stoi na scenie — nie ma kogo opatrzyć.
                  </p>
                ))}
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
      <div className="cp-panel cp-deck">
        {/* Wiersz „bez deku" jest polem karty jak każde inne — do 06.09 lista
            rozwijana leżała wprost na czerwonym panelu, bez białego pola pod
            sobą, i był to jedyny taki wiersz w całym arkuszu. */}
        <div className="cp-field cp-row cp-deck--empty">
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
          <NumberStepper
            min={1}
            max={CYBERDECK_SLOTS_MAX}
            value={deck.slots}
            onChange={(value) => patchDeck({ slots: value })}
            label="Gniazda cyberdeka"
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
      {/* Etap 38b: jedyne wejście gracza do przekazywania i do przeszukiwania
          ciał. Guzik stoi nad ekwipunkiem, bo o przenoszeniu myśli się patrząc
          na listę rzeczy, a nie szukając narzędzia gdzie indziej. */}
      <div className="sheet-gear-actions">
        <button
          type="button"
          className="cp-add"
          title="Przekaż coś komuś albo przeszukaj leżącą figurę obok"
          onClick={() => useInventoryStore.getState().open(character.id)}
        >
          Wymiana…
        </button>
      </div>
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

      <DosesSection character={character} data={data} />

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
 * Dawki farmaceutyków, które ta postać nosi (s. 150).
 *
 * Osobna sekcja pod tabelą wyposażenia, a nie kolumna w niej: wiersz z dawką
 * **jest** zwykłym wyposażeniem (ma nazwę, ilość i uwagi, i tak się go edytuje),
 * a różni się jedną rzeczą — da się go zużyć. Guzik przy tabeli ogólnej
 * kazałby jej wiedzieć o farmaceutykach; tutaj wie o nich tylko ta lista.
 *
 * Znika, kiedy nie ma czego podawać — a to jest stan każdej karty poza Medykiem.
 */
function DosesSection({
  character,
  data,
}: {
  character: CharacterSheetView;
  data: CpredCharacterData;
}) {
  const tokens = useTokenStore((s) => s.tokens);
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const doses = data.gear.filter((row) => row.consumable);
  if (doses.length === 0) return null;

  const figures = Object.values(tokens).filter((token) => token.name.length > 0);

  return (
    <div className="cp-panel cp-doses">
      <div className="cp-field cp-field--notch cp-doses-target-field">
        <span className="cp-label">Farmaceutyki</span>
        <label className="cp-doses-target">
          Komu:
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">sobie</option>
            {figures.map((token) => (
              <option key={token.id} value={token.id}>
                {token.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className="cp-doses-list">
        {doses.map((row) => (
          <li key={row.id}>
            <span className="cp-doses-name">{row.name}</span>
            <span className="cp-doses-qty">× {row.qty}</span>
            <button
              type="button"
              disabled={busy || row.qty < 1}
              title={
                row.qty < 1
                  ? 'Nie ma już ani jednej dawki.'
                  : `Wstrzyknięcie jednej dawki zajmuje Akcję. ${row.notes}`
              }
              onClick={() => {
                setBusy(true);
                void useDose(character.id, row.id, targetId || undefined).finally(() =>
                  setBusy(false),
                );
              }}
            >
              Podaj
            </button>
          </li>
        ))}
      </ul>
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
      <h3 className="cp-section">Cyborgizacje</h3>
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
                  <NumberStepper
                    className="reputation-level"
                    min={REPUTATION_LEVEL_MIN}
                    max={REPUTATION_LEVEL_MAX}
                    value={row.level}
                    title="Poziom 1–10 wg tabeli na s. 193"
                    onChange={(value) => patchDeed(row.id, { level: value })}
                    label="Poziom Reputacji"
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
