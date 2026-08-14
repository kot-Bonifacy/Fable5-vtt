import { isValidCompendiumId } from './ids.js';
import { hpMax } from './derived.js';
// Type-only on purpose: `creation.ts` reads the registry, so a value import
// here would close a cycle around two module-level constants.
import type { CpredCreationData } from './creation.js';
import {
  CYBERWARE_SLOTS_MAX,
  HUMANITY_MAX_PENALTY_BORGWARE,
  HUMANITY_MIN,
  humanityMaxWith,
  isCyberwareInstall,
  isCyberwareType,
  type CyberwareInstall,
  type CyberwareInstallation,
} from './cyberware.js';
import { isHousingOption, isLifestyleLevel, type CpredLifestyle } from './economy.js';
import {
  ARMOR_LOCATIONS,
  ARMOR_PENALTY_MIN,
  ARMOR_SP_MAX,
  INJURY_ACTION_PENALTY_MIN,
  INJURY_MOVE_PENALTY_MIN,
  type ArmorLocation,
} from './locations.js';
import {
  CPRED_STAT_IDS,
  CPRED_STAT_LABELS,
  CPRED_STAT_MAX,
  CPRED_STAT_MIN,
  type CpredStats,
} from './stats.js';

/**
 * CP RED sheet data stored in the character's JSON column. `schemaVersion`
 * gates future migrations (stages 12/22 add fields). Validation lives here so
 * the server and the client reject the same inputs with the same Polish
 * messages.
 *
 * Version 2 (stage 15) added armor locations with ablated SP, the list of
 * Critical Injuries and the Death Save counter. Older rows simply lack those
 * keys — `parseCharacterData` fills them in, so no data migration is needed.
 */

export const CPRED_SCHEMA_VERSION = 2;

export const SKILL_LEVEL_MIN = 0;
export const SKILL_LEVEL_MAX = 10;
export const ROLE_RANK_MIN = 1;
export const ROLE_RANK_MAX = 10;
export const EDDIES_MAX = 10_000_000;
export const NOTES_MAX_LENGTH = 10_000;
/**
 * Three short prose fields the official sheet prints and the model did not know
 * until stage 27b: „Uzależnienia" beside the Critical Injuries, „Styl" and
 * „Amunicja" in the equipment column. All three are lines on paper, not
 * mechanics — nothing reads them but the sheet — so one modest cap serves them.
 */
export const SHEET_LINE_MAX_LENGTH = 400;
export const ITEM_ROWS_MAX = 40;
export const ITEM_NAME_MAX_LENGTH = 64;
export const ITEM_NOTES_MAX_LENGTH = 200;
export const ITEM_FIELD_MAX_LENGTH = 32;
export const ITEM_QTY_MAX = 999;
export const CRITICAL_INJURY_ROWS_MAX = 12;
export const CRITICAL_INJURY_EFFECT_MAX_LENGTH = 400;
/** Levels the rulebook's Reputation table prints (s. 193, stage 23c). */
export const REPUTATION_LEVEL_MIN = 1;
export const REPUTATION_LEVEL_MAX = 10;
/** Deeds one sheet may carry. Generous — it is a career, not an inventory. */
export const REPUTATION_SOURCE_ROWS_MAX = 30;
export const REPUTATION_NOTE_MAX_LENGTH = 160;
/** Death Saves already taken — the counter only grows while at 0 HP. */
export const DEATH_SAVES_MAX = 20;

/**
 * The nine skill categories of the rulebook, in the order the official sheet
 * prints them: alphabetical by the *Polish* label (Broń Dystansowa, Ciało,
 * Edukacja, Kontrola, Spostrzegawczość, Technika, Umiejętności Społeczne,
 * Walka Wręcz, Występy). Sorting by the English ids — which is what this list
 * used to do, despite the comment claiming otherwise — put Ciało before Broń
 * Dystansowa and made the sheet disagree with the printed one (stage 27a).
 */
export const CPRED_SKILL_GROUPS = [
  'ranged',
  'body',
  'education',
  'control',
  'awareness',
  'technique',
  'social',
  'melee',
  'performance',
] as const;
export type CpredSkillGroup = (typeof CPRED_SKILL_GROUPS)[number];

export const CPRED_SKILL_GROUP_LABELS: Record<CpredSkillGroup, string> = {
  awareness: 'Spostrzegawczość',
  body: 'Ciało',
  control: 'Kontrola',
  education: 'Edukacja',
  melee: 'Walka wręcz',
  performance: 'Występy',
  ranged: 'Broń dystansowa',
  social: 'Umiejętności społeczne',
  technique: 'Technika',
};

export function isCpredSkillGroup(value: unknown): value is CpredSkillGroup {
  return typeof value === 'string' && (CPRED_SKILL_GROUPS as readonly string[]).includes(value);
}

/** One entry of `cpred/skills.json` (public samples or the private full set). */
export interface CpredSkillDefinition {
  id: string;
  name: string;
  stat: (typeof CPRED_STAT_IDS)[number];
  /** Advancement cost multiplier (×2 skills); unused until stage 24. */
  multiplier?: number;
  /** Rulebook category; absent skills fall into a trailing "Inne" group. */
  group?: CpredSkillGroup;
  /** What the skill covers — rulebook text, so only the private file has it. */
  description?: string;
}

/** One entry of `data/public/cpred/roles.json`. */
export interface CpredRoleDefinition {
  id: string;
  name: string;
  /** Polish name of the role's special ability (e.g. "Zmysł Walki"). */
  ability: string;
}

/** Parsed system data files, with id sets for O(1) validation. */
export interface CpredRegistry {
  skills: CpredSkillDefinition[];
  skillIds: ReadonlySet<string>;
  roles: CpredRoleDefinition[];
  roleIds: ReadonlySet<string>;
  /**
   * Character-creation tables (stage 25a). Null until `withCreationData` puts
   * them in — the creator is the only thing that reads them, and every other
   * caller of `buildCpredRegistry` predates them.
   */
  creation: CpredCreationData | null;
}

export const EMPTY_CPRED_REGISTRY: CpredRegistry = {
  skills: [],
  skillIds: new Set(),
  roles: [],
  roleIds: new Set(),
  creation: null,
};

function isStatId(value: unknown): value is CpredSkillDefinition['stat'] {
  return typeof value === 'string' && (CPRED_STAT_IDS as readonly string[]).includes(value);
}

/** Builds the registry from the raw parsed JSON files, dropping malformed rows. */
export function buildCpredRegistry(rawSkills: unknown, rawRoles: unknown): CpredRegistry {
  const skillsInput = (rawSkills as { skills?: unknown })?.skills;
  const rolesInput = (rawRoles as { roles?: unknown })?.roles;
  const skills = (Array.isArray(skillsInput) ? skillsInput : [])
    .filter(
      (entry): entry is CpredSkillDefinition =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as CpredSkillDefinition).id === 'string' &&
        typeof (entry as CpredSkillDefinition).name === 'string' &&
        isStatId((entry as CpredSkillDefinition).stat),
    )
    // An unknown category must not create a phantom group on the sheet, so it
    // is dropped rather than trusted; the skill itself still shows up.
    .map((entry) =>
      entry.group !== undefined && !isCpredSkillGroup(entry.group)
        ? { ...entry, group: undefined }
        : entry,
    );
  const roles = (Array.isArray(rolesInput) ? rolesInput : []).filter(
    (entry): entry is CpredRoleDefinition =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as CpredRoleDefinition).id === 'string' &&
      typeof (entry as CpredRoleDefinition).name === 'string' &&
      typeof (entry as CpredRoleDefinition).ability === 'string',
  );
  return {
    skills,
    skillIds: new Set(skills.map((s) => s.id)),
    roles,
    roleIds: new Set(roles.map((r) => r.id)),
    creation: null,
  };
}

/** A skill category with its skills, ready to render as one block. */
export interface CpredSkillGroupView {
  id: CpredSkillGroup | 'other';
  label: string;
  skills: CpredSkillDefinition[];
}

/**
 * Skills split into the rulebook's categories, in its order. Skills with no
 * category (the public sample file has none) end up in a trailing group, so a
 * fresh clone still shows every row.
 */
export function groupedSkills(registry: CpredRegistry): CpredSkillGroupView[] {
  const groups: CpredSkillGroupView[] = CPRED_SKILL_GROUPS.map((id) => ({
    id,
    label: CPRED_SKILL_GROUP_LABELS[id],
    skills: [],
  }));
  const other: CpredSkillGroupView = { id: 'other', label: 'Umiejętności', skills: [] };
  for (const skill of registry.skills) {
    const group = skill.group ? groups.find((entry) => entry.id === skill.group) : undefined;
    (group ?? other).skills.push(skill);
  }
  const filled: CpredSkillGroupView[] = groups.filter((group) => group.skills.length > 0);
  if (other.skills.length > 0) filled.push(other);
  return filled;
}

/** A plain equipment-ish row (cyberware, and the base of the other rows). */
export interface CpredItemRow {
  id: string;
  name: string;
  notes: string;
  /**
   * Compendium entry this row came from (stage 13), e.g. "weapon.zgrzyt-9".
   * The row keeps its own copy of the numbers so a sheet stays readable when
   * the catalogue changes; the reference is what links it back to the card.
   */
  compendiumId?: string;
}

export interface CpredGearRow extends CpredItemRow {
  qty: number;
}

/**
 * A piece of chrome that is already in the body (stage 23a).
 *
 * Everything the rules need is copied off the catalogue entry at install time —
 * the family, the ceiling penalty, the slots — so the row answers „co to ze mną
 * robi" without a second lookup, and stays truthful after the GM edits the
 * table. What is *not* copied is the price: buying is stage 23b.
 */
export interface CpredCyberwareRow extends CpredItemRow, CyberwareInstallation {
  /** Humanity this piece actually cost when it went in — provenance. */
  humanityLoss?: number;
  /** Where it was fitted, for the sheet's line („Klinika"). */
  install?: CyberwareInstall;
}

export interface CpredWeaponRow extends CpredItemRow {
  /** Damage notation, e.g. "3k6" — free text until the compendium (stage 12). */
  damage: string;
  /**
   * Rounds left in the magazine (stage 16). A single shot spends one, a burst
   * ten; at zero the weapon has to be reloaded before it fires again.
   */
  ammoCurrent: number;
  /**
   * Magazine size. Zero means „this weapon does not count rounds" — melee
   * weapons, and bows, whose arrows the rules explicitly do not track.
   */
  ammoMax: number;
  /** Ammunition loaded, as printed on the sheet ("Karabinowa", "Śrutowa"). */
  ammoType: string;
  /**
   * Kind of round in the magazine (stage 16g): a compendium id of an ammunition
   * entry, e.g. „ammo.armour-piercing". Absent means ordinary ammunition, which
   * has no entry because it has no effects („Nie ma cech specjalnych", s. 345).
   *
   * A second field beside `ammoType` rather than a replacement, because the two
   * answer different questions: `ammoType` is the calibre the sheet prints
   * („Karabinowa"), this is what the round *does*.
   */
  ammoId?: string;
  /** Rate of fire ("LA" on the Polish sheet). */
  rof: string;
}

/** Rounds a magazine may hold on the sheet — the compendium's own cap. */
export const WEAPON_AMMO_MAX = 500;

export interface CpredArmorRow extends CpredItemRow {
  /** Stopping Power the piece has when undamaged ("OB" on the Polish sheet). */
  sp: number;
  /** SP left after ablation; repairs put it back up to `sp`. */
  spCurrent: number;
  /** Where it is worn — decides which hit it stops (stage 15). */
  location: ArmorLocation;
  /** Carried but not worn armor protects nothing; absent means worn. */
  equipped?: boolean;
  /**
   * Penalty this piece puts on REF/ZW/RUCH, as a negative number (stage 14c).
   * Copied from the catalogue when the armor is bought, like `sp` — so a
   * hand-edited one-off („ta kurtka ma podszewkę") stays hand-edited.
   */
  penalty?: number;
}

/**
 * A Critical Injury the character currently suffers (stage 15). The row keeps
 * its own copy of the name and effect so the sheet stays readable even if the
 * GM later edits the injury table.
 */
export interface CpredCriticalInjuryRow {
  /** Compendium id of the injury (`criticalInjury.zapadniete-pluco`). */
  id: string;
  name: string;
  effect: string;
  /** The 2d6 value that drew it — shown on the sheet as provenance. */
  rolled?: number;
  /** Some injuries make every later Death Save harder. */
  deathSavePenalty?: number;
  /**
   * RUCH this injury costs, as a negative number (stage 14c): a collapsed lung
   * is −2, a broken leg −4, a severed one −6. Copied from the compendium when
   * the injury is drawn, so editing the table never rewrites old wounds.
   */
  movePenalty?: number;
  /**
   * Machine effects the turn hooks enforce (stage 14e). All four are copied
   * from the compendium with the rest of the row, so the tracker never needs a
   * table of injury names — a GM's own row works exactly like a printed one.
   */
  /** „W swojej kolejnej Turze nie możesz wykonać Akcji" (Uraz kręgosłupa). */
  noActionNextTurn?: boolean;
  /** Walking more than 4 m costs the next turn's Move Action (the ears). */
  noMoveAfterRun?: boolean;
  /** Walking more than 4 m re-opens the wound at the end of the turn. */
  dotAfterRun?: boolean;
  /** „Nie możesz Unikać ataków" (Odcięta noga). */
  noDodge?: boolean;
  /** Flat penalty to every Check made from the sheet („−2 do wszystkich Akcji"). */
  actionPenalty?: number;
  /**
   * This wound heals by itself (stage 16h) — tear gas and a flashbang leave
   * „Uraz oka" and „Uraz ucha" for a minute, not for a surgeon.
   *
   * The row is otherwise an ordinary injury and is enforced by exactly the same
   * flags, which is the point: a temporary „Uraz ucha" stops a run for the same
   * reason a permanent one does. What differs is only who takes it off — the
   * round counter, or the GM's card when no fight is running.
   */
  timed?: CpredTimedInjury;
}

/** When a self-healing wound comes off, and what put it there (stage 16h). */
export interface CpredTimedInjury {
  /** Round of the running combat it expires at; absent outside a fight. */
  expiresAtRound?: number;
  /** „Amunicja hukbłyskowa" — provenance, shown on the sheet and the card. */
  source: string;
  /** Seconds of fiction it lasts, for the label. */
  durationS: number;
}

/**
 * One thing the character is known for on the Street (stage 23c).
 *
 * Lives here rather than in `reputation.ts` for the same reason
 * `CpredCriticalInjuryRow` does: it is a row of the sheet, and the sheet's own
 * module must stay importable without dragging the rules in behind it. What the
 * rows *mean* — which one is current, what sign it takes in a Konfrontacja — is
 * `reputation.ts`, which reads this type and never the other way round.
 *
 * The date is stored, not derived: „kiedy" is half the answer to „za co", and a
 * list a GM can read back as a career needs it.
 */
export interface CpredReputationSource {
  id: string;
  /** 1–10 off the rulebook's table. */
  level: number;
  /** „Koncert w Afterlife, o którym mówiło całe Watson." */
  note: string;
  /**
   * This is what they are *infamous* for — cowardice, betrayal, walking out on
   * an ally. RAW: such a deed still gets a level, people still recognise them
   * for it, and the number turns negative in a Konfrontacja.
   */
  notorious?: boolean;
  /** ISO date of the deed (`2026-08-09`), as the GM entered it. */
  at?: string;
}

/**
 * Extra Death Save difficulty carried by the injuries suffered right now.
 * Lives next to the row type (not in `damage.ts`) so the roll planner can use
 * it without the two modules importing each other.
 */
export function injuryDeathSavePenalty(injuries: readonly CpredCriticalInjuryRow[]): number {
  return injuries.reduce((sum, injury) => sum + (injury.deathSavePenalty ?? 0), 0);
}

export interface CpredCharacterData {
  schemaVersion: typeof CPRED_SCHEMA_VERSION;
  stats: CpredStats;
  /** Clamped to [0, hpMax(stats)] on every merge. */
  hpCurrent: number;
  /** Clamped to [0, stats.luck]. */
  luckCurrent: number;
  /**
   * Clamped to [HUMANITY_MIN, humanityMaxWith(stats, cyberware)]. Unlike every
   * other pool this one may go **below zero** — „Ostra cyberpsychoza" is a state
   * the rules name (s. 232), not an impossible number.
   */
  humanityCurrent: number;
  /** One of the registry's role ids; null = no role picked yet. */
  roleId: string | null;
  roleAbilityRank: number;
  /** skillId → level 1–10; untrained skills are simply absent. */
  skills: Record<string, number>;
  weapons: CpredWeaponRow[];
  armor: CpredArmorRow[];
  gear: CpredGearRow[];
  cyberware: CpredCyberwareRow[];
  /** Critical Injuries suffered right now (stage 15). */
  criticalInjuries: CpredCriticalInjuryRow[];
  /**
   * Death Saves already taken since going Mortally Wounded. Each one makes the
   * next harder (+1); regaining a single HP resets the counter (RAW:
   * modifiers accumulate „dopóki nie zostaniesz ustabilizowany").
   */
  deathSaves: number;
  /**
   * Eurodollars. From stage 23b this number is written **only by the server**:
   * a purchase, a transfer, the monthly settlement or a GM correction, each of
   * them leaving a ledger row. A player's sheet patch carrying `eddies` is
   * refused — the audit is worth nothing with a back door next to it.
   */
  eddies: number;
  /**
   * Lifestyle and Accommodation (s. 376). Null means „ta postać nie prowadzi
   * rachunków" and the monthly settlement skips it — most NPCs and every
   * mannequin on a test scene never want a rent line.
   */
  lifestyle: CpredLifestyle | null;
  /**
   * What the Street knows this character for (stage 23c). The *list* is stored
   * and the number is derived from it (`cpredReputation`), because RAW replaces
   * a Reputation only with a higher one — a separately typed value would be a
   * second home for one fact.
   *
   * Written by the GM alone: „Reputacja zawsze zależy od czynów i działań
   * Postaci, i przydziela ją MG" (s. 193). A player's sheet patch carrying it is
   * refused, the same way `eddies` is.
   */
  reputationSources: CpredReputationSource[];
  notes: string;
  /**
   * Addictions the character carries (stage 27b) — the sheet prints them right
   * under the Critical Injuries, and for the same reason: both are things done
   * to the body that the table has to keep in view.
   *
   * Prose, not a row list. „Uzależnienie od dorpha, dwa razy dziennie" has no
   * machine meaning in CP RED — no roll reads it — and a table of empty columns
   * would be a worse home for it than one line.
   */
  addictions: string;
  /**
   * How the character dresses and carries themselves („Styl" on page two).
   * Fiction the Konfrontacja and Wygląd lean on at the table, never a modifier.
   */
  style: string;
  /**
   * Spare ammunition carried outside the magazines („Amunicja" on page two),
   * e.g. „9 mm × 60, śrut × 12".
   *
   * Deliberately free text and deliberately *not* wired to `ammoCurrent`: the
   * rules track rounds in the gun (s. 344) and leave the backpack to the table,
   * so a counter here would be a second, disagreeing truth about reloading.
   */
  ammoStock: string;
}

export function createDefaultCharacterData(): CpredCharacterData {
  const stats = Object.fromEntries(CPRED_STAT_IDS.map((id) => [id, 5])) as CpredStats;
  return {
    schemaVersion: CPRED_SCHEMA_VERSION,
    stats,
    hpCurrent: hpMax(stats),
    luckCurrent: stats.luck,
    // A fresh sheet has no chrome, so the ceiling is the bare EMP × 10.
    humanityCurrent: humanityMaxWith(stats, []),
    roleId: null,
    roleAbilityRank: ROLE_RANK_MIN,
    skills: {},
    weapons: [],
    armor: [],
    gear: [],
    cyberware: [],
    criticalInjuries: [],
    deathSaves: 0,
    eddies: 0,
    lifestyle: null,
    reputationSources: [],
    notes: '',
    addictions: '',
    style: '',
    ammoStock: '',
  };
}

/** One human-readable (Polish) validation problem, keyed for inline display. */
export interface CpredValidationIssue {
  /** Dot path of the offending field, e.g. "stats.int" or "weapons". */
  field: string;
  message: string;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function issue(field: string, message: string): CpredValidationIssue {
  return { field, message };
}

function validateStats(raw: unknown, issues: CpredValidationIssue[]): CpredStats | undefined {
  if (typeof raw !== 'object' || raw === null) {
    issues.push(issue('stats', 'Nieprawidłowy format statystyk.'));
    return undefined;
  }
  const input = raw as Record<string, unknown>;
  const stats = {} as CpredStats;
  for (const id of CPRED_STAT_IDS) {
    const value = input[id];
    if (!isInteger(value) || value < CPRED_STAT_MIN || value > CPRED_STAT_MAX) {
      issues.push(
        issue(
          `stats.${id}`,
          `Cecha ${CPRED_STAT_LABELS[id].name} musi być liczbą całkowitą od ${CPRED_STAT_MIN} do ${CPRED_STAT_MAX}.`,
        ),
      );
      return undefined;
    }
    stats[id] = value;
  }
  return stats;
}

function validateSkills(
  raw: unknown,
  registry: CpredRegistry,
  issues: CpredValidationIssue[],
): Record<string, number> | undefined {
  if (typeof raw !== 'object' || raw === null) {
    issues.push(issue('skills', 'Nieprawidłowy format umiejętności.'));
    return undefined;
  }
  const skills: Record<string, number> = {};
  for (const [id, level] of Object.entries(raw as Record<string, unknown>)) {
    // Unknown ids are dropped, not rejected — data files may shrink (stage 12).
    if (!registry.skillIds.has(id)) continue;
    if (!isInteger(level) || level < SKILL_LEVEL_MIN || level > SKILL_LEVEL_MAX) {
      issues.push(
        issue(
          `skills.${id}`,
          `Poziom umiejętności musi być liczbą całkowitą od ${SKILL_LEVEL_MIN} do ${SKILL_LEVEL_MAX}.`,
        ),
      );
      return undefined;
    }
    if (level > 0) skills[id] = level;
  }
  return skills;
}

function validateText(
  raw: unknown,
  field: string,
  label: string,
  maxLength: number,
  issues: CpredValidationIssue[],
): string | undefined {
  if (typeof raw !== 'string') {
    issues.push(issue(field, `${label} musi być tekstem.`));
    return undefined;
  }
  if (raw.length > maxLength) {
    issues.push(issue(field, `${label} jest za długi (limit ${maxLength} znaków).`));
    return undefined;
  }
  return raw;
}

/** The ammunition fields of a weapon row, or undefined when the input is bad. */
type WeaponAmmo = Pick<CpredWeaponRow, 'ammoCurrent' | 'ammoMax' | 'ammoType'>;

/**
 * Reads a weapon's ammunition (stage 16), migrating rows written before it.
 *
 * Until stage 16 a weapon had one free-text `ammo` field, which players used
 * for either the magazine size ("30") or the cartridge ("Karabinowa"). Both
 * readings are honoured: a number becomes a full magazine, anything else
 * becomes the ammunition type. Nobody has to retype their sheet.
 */
function readWeaponAmmo(
  row: Record<string, unknown>,
  issues: CpredValidationIssue[],
): WeaponAmmo | undefined {
  const legacy = typeof row.ammo === 'string' ? row.ammo.trim() : '';
  const legacyMagazine = /^\d{1,3}$/.test(legacy) ? Number(legacy) : null;

  const rawMax = row.ammoMax ?? legacyMagazine ?? 0;
  if (!isInteger(rawMax) || rawMax < 0 || rawMax > WEAPON_AMMO_MAX) {
    issues.push(issue('weapons', `Magazynek musi być liczbą od 0 do ${WEAPON_AMMO_MAX}.`));
    return undefined;
  }
  const rawCurrent = row.ammoCurrent ?? legacyMagazine ?? 0;
  if (!isInteger(rawCurrent) || rawCurrent < 0 || rawCurrent > WEAPON_AMMO_MAX) {
    issues.push(issue('weapons', `Stan magazynka musi być liczbą od 0 do ${WEAPON_AMMO_MAX}.`));
    return undefined;
  }
  const ammoType = validateText(
    row.ammoType ?? (legacyMagazine === null ? legacy : ''),
    'weapons',
    'Rodzaj amunicji',
    ITEM_FIELD_MAX_LENGTH,
    issues,
  );
  if (ammoType === undefined) return undefined;
  // A magazine can never hold more than it fits; an untracked weapon (max 0)
  // keeps its counter at zero instead of showing "3/0".
  return { ammoCurrent: Math.min(rawCurrent, rawMax), ammoMax: rawMax, ammoType };
}

function validateRowBase(
  raw: unknown,
  field: string,
  issues: CpredValidationIssue[],
): CpredItemRow | undefined {
  if (typeof raw !== 'object' || raw === null) {
    issues.push(issue(field, 'Nieprawidłowy wiersz listy.'));
    return undefined;
  }
  const input = raw as Record<string, unknown>;
  if (typeof input.id !== 'string' || input.id.length === 0 || input.id.length > 32) {
    issues.push(issue(field, 'Nieprawidłowy wiersz listy.'));
    return undefined;
  }
  const name = validateText(input.name, field, 'Nazwa', ITEM_NAME_MAX_LENGTH, issues);
  const notes = validateText(input.notes ?? '', field, 'Uwagi', ITEM_NOTES_MAX_LENGTH, issues);
  if (name === undefined || notes === undefined) return undefined;
  const compendiumId =
    typeof input.compendiumId === 'string' && isValidCompendiumId(input.compendiumId)
      ? input.compendiumId
      : undefined;
  return {
    id: input.id,
    // Nie przycinamy nazwy. Karta zapisuje się po każdym znaku, więc `trim()`
    // zjadał spację na końcu, zanim zdążyła wejść następna litera — żadnej
    // wielowyrazowej nazwy („Ciężki pancerz bojowy") nie dało się wpisać
    // ręcznie. Uwagi i pozostała proza idą przez `validateText` bez przycinania
    // i zachowują się poprawnie; nazwa była tu jedynym wyjątkiem.
    name,
    notes,
    ...(compendiumId ? { compendiumId } : {}),
  };
}

function validateRows<T extends CpredItemRow>(
  raw: unknown,
  field: string,
  issues: CpredValidationIssue[],
  extend: (base: CpredItemRow, input: Record<string, unknown>) => T | undefined,
): T[] | undefined {
  if (!Array.isArray(raw)) {
    issues.push(issue(field, 'Nieprawidłowy format listy.'));
    return undefined;
  }
  if (raw.length > ITEM_ROWS_MAX) {
    issues.push(issue(field, `Za dużo pozycji na liście (limit ${ITEM_ROWS_MAX}).`));
    return undefined;
  }
  const rows: T[] = [];
  for (const entry of raw) {
    const base = validateRowBase(entry, field, issues);
    if (!base) return undefined;
    const row = extend(base, entry as Record<string, unknown>);
    if (!row) return undefined;
    rows.push(row);
  }
  return rows;
}

/**
 * Critical Injuries carried by the sheet. Malformed rows are rejected rather
 * than dropped: they are written by the server after a damage roll, so a bad
 * one means a bug, not stale user input.
 */
/**
 * The self-healing half of an injury row (stage 16h), or undefined when the
 * wound is an ordinary one.
 *
 * Dropped rather than refused when malformed: a broken timer would otherwise
 * throw the whole sheet away, and the safe failure here is a wound that stays
 * until somebody takes it off — which is what every wound did before 16h.
 */
function validateTimedInjury(raw: unknown): { timed: CpredTimedInjury } | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const value = raw as Record<string, unknown>;
  if (typeof value.source !== 'string' || value.source.length === 0) return undefined;
  const durationS = value.durationS;
  if (!isInteger(durationS) || durationS <= 0) return undefined;
  const expires = value.expiresAtRound;
  return {
    timed: {
      source: value.source.slice(0, ITEM_NAME_MAX_LENGTH),
      durationS,
      ...(isInteger(expires) && expires > 0 ? { expiresAtRound: expires } : {}),
    },
  };
}

function validateCriticalInjuries(
  raw: unknown,
  issues: CpredValidationIssue[],
): CpredCriticalInjuryRow[] | undefined {
  if (!Array.isArray(raw)) {
    issues.push(issue('criticalInjuries', 'Nieprawidłowy format listy ran krytycznych.'));
    return undefined;
  }
  if (raw.length > CRITICAL_INJURY_ROWS_MAX) {
    issues.push(
      issue('criticalInjuries', `Za dużo ran krytycznych (limit ${CRITICAL_INJURY_ROWS_MAX}).`),
    );
    return undefined;
  }
  const rows: CpredCriticalInjuryRow[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      issues.push(issue('criticalInjuries', 'Nieprawidłowy wiersz rany krytycznej.'));
      return undefined;
    }
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || !isValidCompendiumId(row.id)) {
      issues.push(issue('criticalInjuries', 'Nieprawidłowy identyfikator rany krytycznej.'));
      return undefined;
    }
    const name = validateText(
      row.name,
      'criticalInjuries',
      'Nazwa rany',
      ITEM_NAME_MAX_LENGTH,
      issues,
    );
    const effect = validateText(
      row.effect ?? '',
      'criticalInjuries',
      'Efekt rany',
      CRITICAL_INJURY_EFFECT_MAX_LENGTH,
      issues,
    );
    if (name === undefined || effect === undefined) return undefined;
    const rolled = row.rolled;
    const penalty = row.deathSavePenalty;
    const movePenalty = row.movePenalty;
    const actionPenalty = row.actionPenalty;
    rows.push({
      id: row.id,
      name,
      effect,
      ...(isInteger(rolled) && rolled >= 2 && rolled <= 12 ? { rolled } : {}),
      ...(isInteger(penalty) && penalty > 0 && penalty <= 5 ? { deathSavePenalty: penalty } : {}),
      ...(isInteger(movePenalty) && movePenalty < 0 && movePenalty >= INJURY_MOVE_PENALTY_MIN
        ? { movePenalty }
        : {}),
      // The machine effects of stage 14e. Booleans are copied only when true,
      // so a row that never had them stays byte-identical after a round trip.
      ...(row.noActionNextTurn === true ? { noActionNextTurn: true as const } : {}),
      ...(row.noMoveAfterRun === true ? { noMoveAfterRun: true as const } : {}),
      ...(row.dotAfterRun === true ? { dotAfterRun: true as const } : {}),
      ...(row.noDodge === true ? { noDodge: true as const } : {}),
      ...(isInteger(actionPenalty) &&
      actionPenalty < 0 &&
      actionPenalty >= INJURY_ACTION_PENALTY_MIN
        ? { actionPenalty }
        : {}),
      // Stage 16h: a wound that heals by itself keeps its timer through every
      // round trip, or it would become permanent the first time the sheet is
      // saved for any other reason.
      ...(validateTimedInjury(row.timed) ?? {}),
    });
  }
  return rows;
}

/**
 * The deeds a character is known for (stage 23c). Rejected rather than dropped
 * when malformed: they come from a GM's form, so a bad row is a typo somebody
 * should see, not stale data to be quietly swallowed.
 */
function validateReputationSources(
  raw: unknown,
  issues: CpredValidationIssue[],
): CpredReputationSource[] | undefined {
  if (!Array.isArray(raw)) {
    issues.push(issue('reputationSources', 'Nieprawidłowy format listy Reputacji.'));
    return undefined;
  }
  if (raw.length > REPUTATION_SOURCE_ROWS_MAX) {
    issues.push(
      issue('reputationSources', `Za dużo wpisów Reputacji (limit ${REPUTATION_SOURCE_ROWS_MAX}).`),
    );
    return undefined;
  }
  const rows: CpredReputationSource[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      issues.push(issue('reputationSources', 'Nieprawidłowy wiersz Reputacji.'));
      return undefined;
    }
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || row.id.length === 0 || row.id.length > 32) {
      issues.push(issue('reputationSources', 'Nieprawidłowy wiersz Reputacji.'));
      return undefined;
    }
    const level = row.level;
    if (!isInteger(level) || level < REPUTATION_LEVEL_MIN || level > REPUTATION_LEVEL_MAX) {
      issues.push(
        issue(
          'reputationSources',
          `Poziom Reputacji musi być liczbą od ${REPUTATION_LEVEL_MIN} do ${REPUTATION_LEVEL_MAX}.`,
        ),
      );
      return undefined;
    }
    const note = validateText(
      row.note ?? '',
      'reputationSources',
      'Opis wyczynu',
      REPUTATION_NOTE_MAX_LENGTH,
      issues,
    );
    if (note === undefined) return undefined;
    // The date is a label, not a timestamp — anything that is not a plain
    // `YYYY-MM-DD` is dropped rather than refused, so a half-typed field never
    // blocks the save the GM is in the middle of.
    const at =
      typeof row.at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.at) ? row.at : undefined;
    rows.push({
      id: row.id,
      level,
      note,
      ...(row.notorious === true ? { notorious: true as const } : {}),
      ...(at ? { at } : {}),
    });
  }
  return rows;
}

/** Validates every recognized top-level key, collecting problems as it goes. */
function collectCharacterDataPatch(
  raw: unknown,
  registry: CpredRegistry,
): { patch: Partial<CpredCharacterData>; issues: CpredValidationIssue[] } {
  const issues: CpredValidationIssue[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { patch: {}, issues: [issue('data', 'Nieprawidłowe dane karty.')] };
  }
  const input = raw as Record<string, unknown>;
  const patch: Partial<CpredCharacterData> = {};

  if ('stats' in input) {
    const stats = validateStats(input.stats, issues);
    if (stats) patch.stats = stats;
  }
  for (const key of ['hpCurrent', 'luckCurrent'] as const) {
    if (key in input) {
      const value = input[key];
      // Upper bounds depend on stats and are clamped in normalizeCharacterData.
      if (!isInteger(value) || value < 0 || value > 999) {
        issues.push(issue(key, 'Wartość musi być liczbą całkowitą od 0 w górę.'));
      } else {
        patch[key] = value;
      }
    }
  }
  if ('humanityCurrent' in input) {
    const value = input.humanityCurrent;
    // The one pool with a negative floor (s. 232) — see the field's comment.
    if (!isInteger(value) || value < HUMANITY_MIN || value > 999) {
      issues.push(
        issue('humanityCurrent', `Człowieczeństwo musi być liczbą całkowitą od ${HUMANITY_MIN}.`),
      );
    } else {
      patch.humanityCurrent = value;
    }
  }
  if ('roleId' in input) {
    if (input.roleId === null) {
      patch.roleId = null;
    } else if (typeof input.roleId !== 'string' || !registry.roleIds.has(input.roleId)) {
      issues.push(issue('roleId', 'Nieznana rola.'));
    } else {
      patch.roleId = input.roleId;
    }
  }
  if ('roleAbilityRank' in input) {
    const value = input.roleAbilityRank;
    if (!isInteger(value) || value < ROLE_RANK_MIN || value > ROLE_RANK_MAX) {
      issues.push(
        issue(
          'roleAbilityRank',
          `Ranga zdolności roli musi być liczbą od ${ROLE_RANK_MIN} do ${ROLE_RANK_MAX}.`,
        ),
      );
    } else {
      patch.roleAbilityRank = value;
    }
  }
  if ('skills' in input) {
    const skills = validateSkills(input.skills, registry, issues);
    if (skills) patch.skills = skills;
  }
  if ('weapons' in input) {
    const weapons = validateRows<CpredWeaponRow>(input.weapons, 'weapons', issues, (base, row) => {
      const damage = validateText(
        row.damage ?? '',
        'weapons',
        'Obrażenia',
        ITEM_FIELD_MAX_LENGTH,
        issues,
      );
      const ammo = readWeaponAmmo(row, issues);
      const rof = validateText(row.rof ?? '', 'weapons', 'LA', ITEM_FIELD_MAX_LENGTH, issues);
      if (damage === undefined || ammo === undefined || rof === undefined) return undefined;
      // Stage 16g: which *kind* of round is in the magazine, as a reference to
      // the catalogue. Kept apart from `ammoType` on purpose — that one is the
      // calibre printed on the sheet („Karabinowa"), and „Amunicja zapalająca do
      // karabinu" is both at once.
      const ammoId =
        typeof row.ammoId === 'string' && isValidCompendiumId(row.ammoId) ? row.ammoId : undefined;
      return { ...base, damage, ...ammo, rof, ...(ammoId ? { ammoId } : {}) };
    });
    if (weapons) patch.weapons = weapons;
  }
  if ('armor' in input) {
    const armor = validateRows<CpredArmorRow>(input.armor, 'armor', issues, (base, row) => {
      const sp = row.sp ?? 0;
      if (!isInteger(sp) || sp < 0 || sp > ARMOR_SP_MAX) {
        issues.push(issue('armor', `OB pancerza musi być liczbą od 0 do ${ARMOR_SP_MAX}.`));
        return undefined;
      }
      // Ablated SP defaults to undamaged armor — rows written before stage 15
      // simply had no current value.
      const spCurrent = row.spCurrent ?? sp;
      if (!isInteger(spCurrent) || spCurrent < 0 || spCurrent > ARMOR_SP_MAX) {
        issues.push(issue('armor', `Bieżące OB musi być liczbą od 0 do ${ARMOR_SP_MAX}.`));
        return undefined;
      }
      const location = (ARMOR_LOCATIONS as readonly unknown[]).includes(row.location)
        ? (row.location as ArmorLocation)
        : 'body';
      const penalty = row.penalty;
      if (penalty !== undefined && penalty !== null) {
        if (!isInteger(penalty) || penalty > 0 || penalty < ARMOR_PENALTY_MIN) {
          issues.push(
            issue('armor', `Kara pancerza musi być liczbą od ${ARMOR_PENALTY_MIN} do 0.`),
          );
          return undefined;
        }
      }
      return {
        ...base,
        sp,
        spCurrent: Math.min(spCurrent, sp),
        location,
        ...(row.equipped === false ? { equipped: false } : {}),
        ...(isInteger(penalty) && penalty < 0 ? { penalty } : {}),
      };
    });
    if (armor) patch.armor = armor;
  }
  if ('criticalInjuries' in input) {
    const injuries = validateCriticalInjuries(input.criticalInjuries, issues);
    if (injuries) patch.criticalInjuries = injuries;
  }
  if ('deathSaves' in input) {
    const value = input.deathSaves;
    if (!isInteger(value) || value < 0 || value > DEATH_SAVES_MAX) {
      issues.push(
        issue('deathSaves', `Liczba Testów Przeżywalności musi być od 0 do ${DEATH_SAVES_MAX}.`),
      );
    } else {
      patch.deathSaves = value;
    }
  }
  if ('gear' in input) {
    const gear = validateRows<CpredGearRow>(input.gear, 'gear', issues, (base, row) => {
      const qty = row.qty ?? 1;
      if (!isInteger(qty) || qty < 0 || qty > ITEM_QTY_MAX) {
        issues.push(issue('gear', `Ilość musi być liczbą od 0 do ${ITEM_QTY_MAX}.`));
        return undefined;
      }
      return { ...base, qty };
    });
    if (gear) patch.gear = gear;
  }
  if ('cyberware' in input) {
    const cyberware = validateRows<CpredCyberwareRow>(
      input.cyberware,
      'cyberware',
      issues,
      (base, row) => {
        // Every field here is optional and dropped when malformed rather than
        // refused: rows written before stage 23a have none of them, and a row
        // that lost its slot count is still a piece of chrome on the sheet.
        const slots = row.slots;
        const slotCost = row.slotCost;
        const penalty = row.humanityMaxPenalty;
        const loss = row.humanityLoss;
        return {
          ...base,
          ...(isCyberwareType(row.type) ? { type: row.type } : {}),
          ...(isCyberwareInstall(row.install) ? { install: row.install } : {}),
          ...(row.foundation === true ? { foundation: true as const } : {}),
          ...(isInteger(slots) && slots >= 0 && slots <= CYBERWARE_SLOTS_MAX ? { slots } : {}),
          ...(isInteger(slotCost) && slotCost >= 0 && slotCost <= CYBERWARE_SLOTS_MAX
            ? { slotCost }
            : {}),
          ...(isInteger(penalty) && penalty > 0 && penalty <= HUMANITY_MAX_PENALTY_BORGWARE
            ? { humanityMaxPenalty: penalty }
            : {}),
          ...(isInteger(loss) && loss >= 0 && loss <= 999 ? { humanityLoss: loss } : {}),
        };
      },
    );
    if (cyberware) patch.cyberware = cyberware;
  }
  if ('eddies' in input) {
    const value = input.eddies;
    if (!isInteger(value) || value < 0 || value > EDDIES_MAX) {
      issues.push(issue('eddies', `Eurodolce muszą być liczbą od 0 do ${EDDIES_MAX}.`));
    } else {
      patch.eddies = value;
    }
  }
  if ('lifestyle' in input) {
    const raw = input.lifestyle;
    if (raw === null) {
      patch.lifestyle = null;
    } else if (typeof raw === 'object') {
      const row = raw as Record<string, unknown>;
      if (isLifestyleLevel(row.level) && isHousingOption(row.housing)) {
        patch.lifestyle = { level: row.level, housing: row.housing };
      } else {
        issues.push(issue('lifestyle', 'Nieznany Poziom życia albo Zakwaterowanie.'));
      }
    } else {
      issues.push(issue('lifestyle', 'Nieprawidłowy format Poziomu życia.'));
    }
  }
  if ('reputationSources' in input) {
    const sources = validateReputationSources(input.reputationSources, issues);
    if (sources) patch.reputationSources = sources;
  }
  if ('notes' in input) {
    const notes = validateText(input.notes, 'notes', 'Notatki', NOTES_MAX_LENGTH, issues);
    if (notes !== undefined) patch.notes = notes;
  }
  // Stage 27b — the three prose lines the printed sheet has and the model did
  // not. Missing from an older row simply means „empty", which is what
  // `createDefaultCharacterData` already says.
  if ('addictions' in input) {
    const value = validateText(
      input.addictions,
      'addictions',
      'Uzależnienia',
      SHEET_LINE_MAX_LENGTH,
      issues,
    );
    if (value !== undefined) patch.addictions = value;
  }
  if ('style' in input) {
    const value = validateText(input.style, 'style', 'Styl', SHEET_LINE_MAX_LENGTH, issues);
    if (value !== undefined) patch.style = value;
  }
  if ('ammoStock' in input) {
    const value = validateText(
      input.ammoStock,
      'ammoStock',
      'Amunicja',
      SHEET_LINE_MAX_LENGTH,
      issues,
    );
    if (value !== undefined) patch.ammoStock = value;
  }

  return { patch, issues };
}

/**
 * Validates a partial sheet patch (any subset of top-level keys). Returns the
 * cleaned patch, or the list of Polish problems when anything is invalid —
 * the client renders them inline, the server refuses to save.
 */
export function validateCharacterDataPatch(
  raw: unknown,
  registry: CpredRegistry,
):
  { ok: true; patch: Partial<CpredCharacterData> } | { ok: false; issues: CpredValidationIssue[] } {
  const { patch, issues } = collectCharacterDataPatch(raw, registry);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, patch };
}

/**
 * Clamps stat-dependent pools after a merge: changing BC/SW/SZ/EMP must never
 * leave current HP, luck or humanity above their recomputed maximums.
 */
export function normalizeCharacterData(data: CpredCharacterData): CpredCharacterData {
  const hpCurrent = Math.min(data.hpCurrent, hpMax(data.stats));
  return {
    ...data,
    hpCurrent,
    luckCurrent: Math.min(data.luckCurrent, data.stats.luck),
    // The ceiling moves with the chrome (s. 230), so pulling a piece out raises
    // it and installing one lowers it — the current value follows either way.
    humanityCurrent: Math.max(
      HUMANITY_MIN,
      Math.min(data.humanityCurrent, humanityMaxWith(data.stats, data.cyberware)),
    ),
    // Ablation can never leave a piece of armor above its undamaged SP.
    armor: data.armor.map((row) => (row.spCurrent > row.sp ? { ...row, spCurrent: row.sp } : row)),
    // RAW: the Death Save modifiers accumulate „dopóki nie zostaniesz
    // ustabilizowany" — a single regained HP wipes the counter.
    deathSaves: hpCurrent >= 1 ? 0 : Math.min(data.deathSaves, DEATH_SAVES_MAX),
  };
}

/**
 * Applies a validated patch onto the stored data (top-level keys replace) and
 * re-clamps the dependent pools.
 */
export function mergeCharacterData(
  current: CpredCharacterData,
  patch: Partial<CpredCharacterData>,
): CpredCharacterData {
  return normalizeCharacterData({ ...current, ...patch, schemaVersion: CPRED_SCHEMA_VERSION });
}

/**
 * Parses the JSON column tolerantly: valid fields are kept, anything missing
 * or malformed falls back to defaults. Old rows (or a future schema bump)
 * never take the sheet down.
 */
export function parseCharacterData(raw: unknown, registry: CpredRegistry): CpredCharacterData {
  const defaults = createDefaultCharacterData();
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return defaults;
    }
  }
  // Tolerant: keep whatever validated, default the rest (issues are dropped).
  const { patch } = collectCharacterDataPatch(parsed, registry);
  return mergeCharacterData(defaults, patch);
}
