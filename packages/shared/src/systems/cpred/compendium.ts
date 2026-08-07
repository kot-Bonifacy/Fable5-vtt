import { parseRollNotation } from '../../dice.js';
import {
  CPRED_AMMO_PATTERNS,
  type CpredAmmoEffect,
  type CpredAmmoPattern,
  type CpredAmmoProfile,
} from './ammo.js';
import { isValidCompendiumId, slugify } from './ids.js';
import {
  ARMOR_LOCATIONS,
  ARMOR_PENALTY_MIN,
  ARMOR_SP_MAX,
  INJURY_ACTION_PENALTY_MIN,
  INJURY_MOVE_PENALTY_MIN,
  type ArmorLocation,
} from './locations.js';
import { CPRED_STAT_IDS } from './stats.js';

/**
 * Compendium of CP RED game objects: weapon types (the rulebook's base rows),
 * concrete weapons, armor, gear and cyberware.
 *
 * Two rules shape this file:
 *  - Structure lives here, content lives in data files. The repository ships
 *    invented sample entries in `data/public/`; rulebook-derived entries stay
 *    in `data/private/` (gitignored).
 *  - Labels follow the Polish edition (OBR., OB, LA, PT), because that is what
 *    the players see on their sheets.
 *
 * Stage 15 (damage), 16 (range DVs) and 23 (cyberware/economy) read these
 * definitions, so keep the numbers structured rather than free text.
 */

export const COMPENDIUM_SCHEMA_VERSION = 1;

export const COMPENDIUM_CATEGORIES = [
  'weapon',
  'ammo',
  'armor',
  'gear',
  'cyberware',
  'criticalInjury',
] as const;
export type CompendiumCategory = (typeof COMPENDIUM_CATEGORIES)[number];

export const COMPENDIUM_CATEGORY_LABELS: Record<CompendiumCategory, string> = {
  weapon: 'Broń',
  ammo: 'Amunicja',
  armor: 'Pancerz',
  gear: 'Sprzęt',
  cyberware: 'Cyborgizacje',
  criticalInjury: 'Rany krytyczne',
};

/**
 * Categories that can be added to a character sheet. Two are excluded, for
 * opposite reasons: nobody buys a Critical Injury (the damage engine draws them,
 * stage 15), and ammunition is not carried as a row but *loaded* into a weapon
 * (stage 16g) — how much of it is in the backpack is stage 23's economy.
 */
export const COMPENDIUM_ITEM_CATEGORIES = COMPENDIUM_CATEGORIES.filter(
  (category) => category !== 'criticalInjury' && category !== 'ammo',
);

/** Weapon quality from the rulebook: poor jams on a 1, excellent adds +1. */
export const WEAPON_QUALITIES = ['poor', 'standard', 'excellent'] as const;
export type WeaponQuality = (typeof WEAPON_QUALITIES)[number];

export const WEAPON_QUALITY_LABELS: Record<WeaponQuality, string> = {
  poor: 'Niska',
  standard: 'Zwykła',
  excellent: 'Doskonała',
};

/** Price bands used by the rulebook's shopping tables ("100 ed (Premium)"). */
export const COST_CATEGORIES = [
  'cheap',
  'everyday',
  'costly',
  'premium',
  'expensive',
  'veryExpensive',
  'luxury',
  'superLuxury',
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

/**
 * Labels of the Polish edition. The ladder is one price per band — 10 Tanie,
 * 20 Codzienne, 50 Drogie, 100 Premium, 500 Kosztowne, 1000 B. kosztowne,
 * 5000 Luksusowe, 10000 Superluksusowe — so „Drogie" sits *below* „Kosztowne",
 * which is the opposite of what the English names suggest.
 */
export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  cheap: 'Tanie',
  everyday: 'Codzienne',
  costly: 'Drogie',
  premium: 'Premium',
  expensive: 'Kosztowne',
  veryExpensive: 'Bardzo kosztowne',
  luxury: 'Luksusowe',
  superLuxury: 'Superluksusowe',
};

/**
 * Range bands of the ranged-combat DV table, in metres. Every weapon type
 * carries one DV per band; `null` means the weapon cannot reach that far
 * ("Nd." in the Polish table).
 */
export const CPRED_RANGE_BANDS = [
  { id: '0-6', min: 0, max: 6 },
  { id: '7-12', min: 7, max: 12 },
  { id: '13-25', min: 13, max: 25 },
  { id: '26-50', min: 26, max: 50 },
  { id: '51-100', min: 51, max: 100 },
  { id: '101-200', min: 101, max: 200 },
  { id: '201-400', min: 201, max: 400 },
  { id: '401-800', min: 401, max: 800 },
] as const;

export type RangeBandId = (typeof CPRED_RANGE_BANDS)[number]['id'];

export function rangeBandLabel(band: (typeof CPRED_RANGE_BANDS)[number]): string {
  // Non-breaking space: the range table is narrow and "0–6 m" must not wrap.
  return `${band.min}–${band.max}\u00A0m`;
}

/** DV per range band; index matches `CPRED_RANGE_BANDS`. */
export type RangeDvTable = (number | null)[];

/**
 * Autofire (stage 16). The rulebook gives bursts their own DV table — which
 * stops at 100 m, so the last three bands are always `null` — and caps the
 * damage multiplier per weapon type (3 for SMGs, 4 for assault rifles).
 */
export interface AutofireProfile {
  /** Highest multiplier the burst's damage may reach. */
  max: number;
  rangeDv: RangeDvTable;
}

/** Upper bound of the autofire multiplier cap; guards imported data. */
export const AUTOFIRE_MAX_MULTIPLIER = 10;

/**
 * DV for a shot at `metres`, or null when out of range / unknown. Stage 16
 * calls this with the measured distance between two tokens.
 */
export function dvForRange(table: RangeDvTable | undefined, metres: number): number | null {
  if (!table || metres < 0) return null;
  const index = CPRED_RANGE_BANDS.findIndex((band) => metres >= band.min && metres <= band.max);
  if (index === -1) return null;
  return table[index] ?? null;
}

/**
 * A base weapon row of the rulebook ("Ciężki pistolet"). Concrete weapons in
 * the compendium point at one of these and only override what differs.
 */
export interface WeaponTypeDefinition {
  id: string;
  /** Polish name shown in the UI. */
  name: string;
  /** English name from the source material — keeps imports matchable. */
  nameOriginal?: string;
  /** Skill id from `skills.json` (e.g. "bron-krotka"). */
  skillId: string | null;
  /** Damage notation, Polish alias included ("3k6"). */
  damage: string;
  /** Standard magazine size; null for melee and single-load weapons. */
  magazine: number | null;
  /** Rate of fire — "LA" on the Polish sheet. */
  rof: number;
  hands: 1 | 2;
  concealable: boolean;
  /** Attachment slots (3 for most firearms). */
  attachmentSlots?: number;
  melee: boolean;
  /** DV per range band; omitted for melee weapons. */
  rangeDv?: RangeDvTable;
  /** Present only on weapons that can fire bursts. */
  autofire?: AutofireProfile;
  /** True when the weapon can lay down suppressive fire. */
  suppressive?: boolean;
  /**
   * Thrown by hand rather than fired (stage 16d) — a grenade, a knife, a brick.
   * „Aby Rzucić przedmiotem, w ramach Akcji wykonujesz atak dystansowy, testując
   * ZW + Atletyka + 1k10" (s. 177), which is why the skill on the row is
   * Athletics and the DV comes off the Grenade Launcher line of the range table.
   */
  thrown?: boolean;
  /**
   * The „Eksplozja" feature of the weapon table: this one damages a 10×10 m
   * square rather than a person (s. 174). A flag rather than a branch, so a
   * home-made launcher the GM types in explodes too.
   */
  explosive?: boolean;
  /** Hard ceiling on range in metres, beyond the DV table — 25 m for a throw. */
  maxRangeM?: number;
  /** Cartridge the magazine takes ("Karabinowa") — copied onto the sheet. */
  ammunition?: string;
  /**
   * Shapes of round this weapon chambers (stage 16g). „Kule … naboje śrutowe,
   * strzały, granaty i rakiety należy dopasować do rodzaju używanej broni"
   * (s. 344): a shotgun takes both bullets (breneka) and shells, a bow arrows.
   * Absent means the catalogue has not been told, and no special round fits.
   */
  ammoPatterns?: CpredAmmoPattern[];
  /**
   * The only rounds this weapon fires, by id — a list rather than a pattern
   * because the rulebook sometimes names them: a flamethrower „może strzelać
   * tylko zapalającymi pociskami do strzelby" (s. 348). Overrides the patterns.
   */
  ammoIds?: string[];
  /** Caveats from the import, e.g. damage that scales with the wielder. */
  description?: string;
  /** Where the numbers came from — shown in the UI as a provenance note. */
  source?: string;
  /** True when the source material did not give every value. */
  incomplete?: boolean;
}

interface CompendiumEntryBase {
  /** Stable slug, e.g. "weapon.militech-avenger". */
  id: string;
  name: string;
  nameOriginal?: string;
  description?: string;
  /** English source text, kept when the description was translated (stage 13). */
  descriptionOriginal?: string;
  /** Price in eddies; null when the material gives only a band. */
  cost: number | null;
  costCategory?: CostCategory;
  source?: string;
  incomplete?: boolean;
  /** True for entries the GM typed in — those are editable and deletable. */
  custom?: boolean;
}

export interface WeaponEntry extends CompendiumEntryBase {
  category: 'weapon';
  /** Base type this weapon is an instance of; null for one-offs. */
  weaponTypeId: string | null;
  quality: WeaponQuality;
  /** Overrides of the base type — absent means "inherit". */
  damage?: string;
  magazine?: number | null;
  rof?: number;
  hands?: 1 | 2;
  concealable?: boolean;
  attachmentSlots?: number;
  /** Free-text features: "Ogień ciągły (4)", "Złącze smartguna". */
  features?: string[];
}

/**
 * One row of the ammunition table (stage 16g, s. 345–347).
 *
 * A compendium *entry* rather than a table beside the weapon types, and the
 * reason is that ammunition is bought: it has a price band, a description worth
 * reading at the table and a GM who may want to invent a round of their own.
 * All three come free with an entry, and none of them with a bare data table.
 *
 * The machine effects (`CpredAmmoEffect`) ride on the same row, so „what does
 * this round do" is one lookup and never a name comparison.
 */
export interface AmmoEntry extends CompendiumEntryBase, CpredAmmoEffect {
  category: 'ammo';
  /** Shapes this round is made in; a round that fits nothing is refused. */
  patterns: CpredAmmoPattern[];
}

export interface ArmorEntry extends CompendiumEntryBase {
  category: 'armor';
  /** Stopping Power — "OB" on the Polish sheet. */
  sp: number;
  locations: ArmorLocation[];
  /** Penalty to REF/DEX/MOVE, as a negative number. */
  penalty?: number;
}

export interface GearEntry extends CompendiumEntryBase {
  category: 'gear';
}

export interface CyberwareEntry extends CompendiumEntryBase {
  category: 'cyberware';
  /** Humanity loss notation ("2k6") or a fixed number as text. */
  humanityLoss?: string;
  /** Foundational cyberware (a cyberarm) vs an option installed into one. */
  foundation?: boolean;
  /** Option slots this piece provides (foundation) or takes (option). */
  slots?: number;
}

/** The two Critical Injury tables of the rulebook (2d6 each). */
export const CRITICAL_INJURY_TABLES = ['body', 'head'] as const;
export type CriticalInjuryTable = (typeof CRITICAL_INJURY_TABLES)[number];

export const CRITICAL_INJURY_TABLE_LABELS: Record<CriticalInjuryTable, string> = {
  body: 'Korpus',
  head: 'Głowa',
};

export const CRITICAL_INJURY_ROLL_MIN = 2;
export const CRITICAL_INJURY_ROLL_MAX = 12;
export const CRITICAL_INJURY_DEATH_SAVE_PENALTY_MAX = 5;

/**
 * One row of a Critical Injury table (stage 15). It lives in the compendium
 * rather than in a data file of its own because the free material only carries
 * the body table — the GM has to be able to type the missing rows in, and the
 * compendium already has the editor, the per-campaign storage and the sync.
 *
 * `description` holds the injury's effect (the rules text shown on the sheet).
 */
export interface CriticalInjuryEntry extends CompendiumEntryBase {
  category: 'criticalInjury';
  table: CriticalInjuryTable;
  /** 2d6 value that draws this injury, 2–12. */
  roll: number;
  /** „Łatanie" — the temporary fix and its DV, as free text. */
  quickFix?: string;
  /** „Leczenie" — the permanent treatment and its DV. */
  treatment?: string;
  /** Injuries that make every later Death Save harder (RAW: +1). */
  deathSavePenalty?: number;
  /**
   * RUCH the injury costs while it lasts, as a negative number (stage 14c):
   * a collapsed lung −2, a broken leg −4, an amputated one −6. The tracker
   * enforces whatever the table says, so a GM's own row works the same way.
   */
  movePenalty?: number;
  /**
   * Machine effects the turn hooks enforce (stage 14e). Flags rather than
   * prose, for the same reason `movePenalty` is a number: the effect text is
   * for the player, and the tracker cannot read Polish.
   */
  /** „W swojej kolejnej Turze nie możesz wykonać Akcji" (Uraz kręgosłupa). */
  noActionNextTurn?: boolean;
  /** Walking more than 4 m costs the next turn's Move Action (the ear injuries). */
  noMoveAfterRun?: boolean;
  /** Walking more than 4 m re-opens the wound at the end of the turn. */
  dotAfterRun?: boolean;
  /** „Nie możesz Unikać ataków" (Odcięta noga). */
  noDodge?: boolean;
  /** Flat penalty to every Check made from the sheet („−2 do wszystkich Akcji"). */
  actionPenalty?: number;
}

export type CompendiumEntry =
  WeaponEntry | AmmoEntry | ArmorEntry | GearEntry | CyberwareEntry | CriticalInjuryEntry;

export function isCriticalInjuryEntry(entry: CompendiumEntry): entry is CriticalInjuryEntry {
  return entry.category === 'criticalInjury';
}

/** The injury's effect text — the sheet copies it onto the character. */
export function criticalInjuryEffect(entry: CriticalInjuryEntry): string {
  return entry.description ?? '';
}

/** Injuries of one table, sorted by their 2d6 value. */
export function criticalInjuryTable(
  entries: readonly CompendiumEntry[],
  table: CriticalInjuryTable,
): CriticalInjuryEntry[] {
  return entries
    .filter(isCriticalInjuryEntry)
    .filter((entry) => entry.table === table)
    .sort((a, b) => a.roll - b.roll);
}

/** Shape of one compendium JSON file (`data/public|private/cpred/compendium`). */
export interface CompendiumFile {
  schemaVersion?: number;
  /** Free-text provenance for the whole file, shown in the UI. */
  source?: string;
  weaponTypes?: WeaponTypeDefinition[];
  entries?: CompendiumEntry[];
}

export interface CompendiumRegistry {
  weaponTypes: WeaponTypeDefinition[];
  weaponTypeById: ReadonlyMap<string, WeaponTypeDefinition>;
  entries: CompendiumEntry[];
  entryById: ReadonlyMap<string, CompendiumEntry>;
}

export const EMPTY_COMPENDIUM: CompendiumRegistry = {
  weaponTypes: [],
  weaponTypeById: new Map(),
  entries: [],
  entryById: new Map(),
};

/** Damage notation must parse with the dice engine and roll dice. */
export function isValidDamageNotation(value: string): boolean {
  const parsed = parseRollNotation(value);
  if (!parsed.ok) return false;
  return parsed.formula.terms.some((term) => term.kind === 'dice');
}

export const COMPENDIUM_NAME_MAX_LENGTH = 80;
/** Provenance notes are long by design: "Easy Mode PL — karta postaci…". */
export const COMPENDIUM_SOURCE_MAX_LENGTH = 300;
export const COMPENDIUM_DESCRIPTION_MAX_LENGTH = 1000;
export const COMPENDIUM_FEATURES_MAX = 12;
export const COMPENDIUM_FEATURE_MAX_LENGTH = 80;
export const COMPENDIUM_COST_MAX = 10_000_000;
export const WEAPON_ROF_MAX = 10;
export const WEAPON_MAGAZINE_MAX = 500;
/** Ceiling on a weapon type's hard range cap; guards imported data (stage 16d). */
export const WEAPON_MAX_RANGE_M = 1000;
export const WEAPON_SLOTS_MAX = 6;
export const CYBERWARE_SLOTS_MAX = 10;

export interface CompendiumIssue {
  field: string;
  message: string;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function checkName(raw: unknown, issues: CompendiumIssue[]): string | undefined {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    issues.push({ field: 'name', message: 'Nazwa jest wymagana.' });
    return undefined;
  }
  if (raw.length > COMPENDIUM_NAME_MAX_LENGTH) {
    issues.push({
      field: 'name',
      message: `Nazwa jest za długa (limit ${COMPENDIUM_NAME_MAX_LENGTH} znaków).`,
    });
    return undefined;
  }
  return raw.trim();
}

function checkOptionalText(
  raw: unknown,
  field: string,
  label: string,
  maxLength: number,
  issues: CompendiumIssue[],
): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') {
    issues.push({ field, message: `${label} musi być tekstem.` });
    return undefined;
  }
  if (raw.length > maxLength) {
    issues.push({ field, message: `${label} jest za długi (limit ${maxLength} znaków).` });
    return undefined;
  }
  return raw.trim();
}

function checkCost(raw: unknown, issues: CompendiumIssue[]): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (!isInteger(raw) || raw < 0 || raw > COMPENDIUM_COST_MAX) {
    issues.push({
      field: 'cost',
      message: `Cena musi być liczbą całkowitą od 0 do ${COMPENDIUM_COST_MAX} ed.`,
    });
    return null;
  }
  return raw;
}

/**
 * Validates one entry coming from the GM editor or an import file. Returns the
 * normalised entry, or the Polish problems to show next to the fields.
 */
export function validateCompendiumEntry(
  raw: unknown,
): { ok: true; entry: CompendiumEntry } | { ok: false; issues: CompendiumIssue[] } {
  const issues: CompendiumIssue[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, issues: [{ field: 'entry', message: 'Nieprawidłowy format wpisu.' }] };
  }
  const input = raw as Record<string, unknown>;
  const category = input.category;
  if (
    typeof category !== 'string' ||
    !(COMPENDIUM_CATEGORIES as readonly string[]).includes(category)
  ) {
    issues.push({ field: 'category', message: 'Nieznana kategoria wpisu.' });
    return { ok: false, issues };
  }

  const name = checkName(input.name, issues);
  // Ids are slugs, so the category prefix has to be lowercase too.
  const idPrefix = category === 'criticalInjury' ? 'injury' : category;
  const id =
    typeof input.id === 'string' && input.id.length > 0
      ? input.id
      : name
        ? `${idPrefix}.${slugify(name)}`
        : '';
  if (!isValidCompendiumId(id)) {
    issues.push({
      field: 'id',
      message: 'Identyfikator może zawierać tylko małe litery, cyfry, "-" i ".".',
    });
  }

  const description = checkOptionalText(
    input.description,
    'description',
    'Opis',
    COMPENDIUM_DESCRIPTION_MAX_LENGTH,
    issues,
  );
  const nameOriginal = checkOptionalText(
    input.nameOriginal,
    'nameOriginal',
    'Nazwa oryginalna',
    COMPENDIUM_NAME_MAX_LENGTH,
    issues,
  );
  const source = checkOptionalText(
    input.source,
    'source',
    'Źródło',
    COMPENDIUM_SOURCE_MAX_LENGTH,
    issues,
  );
  const descriptionOriginal = checkOptionalText(
    input.descriptionOriginal,
    'descriptionOriginal',
    'Oryginalny opis',
    COMPENDIUM_DESCRIPTION_MAX_LENGTH,
    issues,
  );
  const cost = checkCost(input.cost, issues);
  const costCategory =
    typeof input.costCategory === 'string' &&
    (COST_CATEGORIES as readonly string[]).includes(input.costCategory)
      ? (input.costCategory as CostCategory)
      : undefined;

  const base: CompendiumEntryBase = {
    id,
    name: name ?? '',
    cost,
    ...(nameOriginal ? { nameOriginal } : {}),
    ...(description ? { description } : {}),
    ...(descriptionOriginal ? { descriptionOriginal } : {}),
    ...(costCategory ? { costCategory } : {}),
    ...(source ? { source } : {}),
    ...(input.incomplete === true ? { incomplete: true as const } : {}),
    ...(input.custom === true ? { custom: true as const } : {}),
  };

  let entry: CompendiumEntry | undefined;
  if (category === 'weapon') entry = validateWeapon(input, base, issues);
  else if (category === 'ammo') entry = validateAmmo(input, base, issues);
  else if (category === 'armor') entry = validateArmor(input, base, issues);
  else if (category === 'cyberware') entry = validateCyberware(input, base, issues);
  else if (category === 'criticalInjury') entry = validateCriticalInjury(input, base, issues);
  else entry = { ...base, category: 'gear' };

  if (issues.length > 0 || !entry) return { ok: false, issues };
  return { ok: true, entry };
}

function validateWeapon(
  input: Record<string, unknown>,
  base: CompendiumEntryBase,
  issues: CompendiumIssue[],
): WeaponEntry | undefined {
  const weaponTypeId =
    typeof input.weaponTypeId === 'string' && input.weaponTypeId.length > 0
      ? input.weaponTypeId
      : null;
  const quality =
    typeof input.quality === 'string' &&
    (WEAPON_QUALITIES as readonly string[]).includes(input.quality)
      ? (input.quality as WeaponQuality)
      : 'standard';

  const weapon: WeaponEntry = { ...base, category: 'weapon', weaponTypeId, quality };

  if (input.damage !== undefined && input.damage !== null && input.damage !== '') {
    if (typeof input.damage !== 'string' || !isValidDamageNotation(input.damage)) {
      issues.push({ field: 'damage', message: 'Obrażenia muszą być notacją kości, np. "3k6".' });
    } else {
      weapon.damage = input.damage;
    }
  } else if (!weaponTypeId) {
    issues.push({ field: 'damage', message: 'Podaj obrażenia albo wybierz typ broni.' });
  }

  if (input.magazine !== undefined && input.magazine !== null) {
    if (!isInteger(input.magazine) || input.magazine < 0 || input.magazine > WEAPON_MAGAZINE_MAX) {
      issues.push({
        field: 'magazine',
        message: `Magazynek musi być liczbą od 0 do ${WEAPON_MAGAZINE_MAX}.`,
      });
    } else {
      weapon.magazine = input.magazine;
    }
  }

  if (input.rof !== undefined && input.rof !== null) {
    if (!isInteger(input.rof) || input.rof < 1 || input.rof > WEAPON_ROF_MAX) {
      issues.push({ field: 'rof', message: `LA musi być liczbą od 1 do ${WEAPON_ROF_MAX}.` });
    } else {
      weapon.rof = input.rof;
    }
  }

  if (input.hands !== undefined && input.hands !== null) {
    if (input.hands !== 1 && input.hands !== 2) {
      issues.push({ field: 'hands', message: 'Liczba rąk to 1 albo 2.' });
    } else {
      weapon.hands = input.hands;
    }
  }

  if (typeof input.concealable === 'boolean') weapon.concealable = input.concealable;

  if (input.attachmentSlots !== undefined && input.attachmentSlots !== null) {
    if (
      !isInteger(input.attachmentSlots) ||
      input.attachmentSlots < 0 ||
      input.attachmentSlots > WEAPON_SLOTS_MAX
    ) {
      issues.push({
        field: 'attachmentSlots',
        message: `Gniazda na dodatki: liczba od 0 do ${WEAPON_SLOTS_MAX}.`,
      });
    } else {
      weapon.attachmentSlots = input.attachmentSlots;
    }
  }

  const features = validateFeatures(input.features, issues);
  if (features.length > 0) weapon.features = features;
  return weapon;
}

function validateFeatures(raw: unknown, issues: CompendiumIssue[]): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    issues.push({ field: 'features', message: 'Cechy specjalne muszą być listą.' });
    return [];
  }
  if (raw.length > COMPENDIUM_FEATURES_MAX) {
    issues.push({
      field: 'features',
      message: `Za dużo cech specjalnych (limit ${COMPENDIUM_FEATURES_MAX}).`,
    });
    return [];
  }
  const features: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string' || value.length > COMPENDIUM_FEATURE_MAX_LENGTH) {
      issues.push({
        field: 'features',
        message: `Cecha specjalna musi być tekstem do ${COMPENDIUM_FEATURE_MAX_LENGTH} znaków.`,
      });
      return [];
    }
    const trimmed = value.trim();
    if (trimmed) features.push(trimmed);
  }
  return features;
}

/** Rails on the ammunition flags; they guard imported data, not game balance. */
export const AMMO_ABLATION_BONUS_MAX = 10;
export const AMMO_DOT_DAMAGE_MAX = 20;
export const AMMO_SPREAD_DV_MAX = 30;
export const AMMO_SPREAD_RANGE_M_MAX = 50;

/**
 * One ammunition row (stage 16g). Every effect is optional — a round with no
 * flags is „Amunicja zwykła", which the rulebook itself describes as „Nie ma
 * cech specjalnych" (s. 345) — but the patterns are not: a round that fits
 * nothing could never be loaded, so an empty list is a mistake worth naming.
 */
function validateAmmo(
  input: Record<string, unknown>,
  base: CompendiumEntryBase,
  issues: CompendiumIssue[],
): AmmoEntry | undefined {
  const patterns = readAmmoPatterns(input.patterns);
  if (patterns.length === 0) {
    issues.push({
      field: 'patterns',
      message: 'Wybierz przynajmniej jeden rodzaj naboju (kule, śrut, strzały, granaty, rakiety).',
    });
    return undefined;
  }
  const ammo: AmmoEntry = { ...base, category: 'ammo', patterns };

  if (input.ablationBonus !== undefined && input.ablationBonus !== null) {
    if (
      !isInteger(input.ablationBonus) ||
      input.ablationBonus < 0 ||
      input.ablationBonus > AMMO_ABLATION_BONUS_MAX
    ) {
      issues.push({
        field: 'ablationBonus',
        message: `Dodatkowe uszkodzenie pancerza: liczba od 0 do ${AMMO_ABLATION_BONUS_MAX}.`,
      });
      return undefined;
    }
    if (input.ablationBonus > 0) ammo.ablationBonus = input.ablationBonus;
  }
  if (input.noAblation === true) ammo.noAblation = true;
  if (input.noCriticalInjury === true) ammo.noCriticalInjury = true;
  if (input.nonLethal === true) ammo.nonLethal = true;
  if (input.noAim === true) ammo.noAim = true;

  const ignites = readAmmoIgnites(input.ignites, issues);
  if (issues.length > 0) return undefined;
  if (ignites) ammo.ignites = ignites;

  if (input.extraInjuryOn !== undefined && input.extraInjuryOn !== null) {
    if (
      !Array.isArray(input.extraInjuryOn) ||
      !input.extraInjuryOn.every((value) => typeof value === 'string' && isValidCompendiumId(value))
    ) {
      issues.push({ field: 'extraInjuryOn', message: 'Nieprawidłowe identyfikatory ran.' });
      return undefined;
    }
    if (input.extraInjuryOn.length > 0) ammo.extraInjuryOn = [...input.extraInjuryOn];
  }

  const spread = readAmmoSpread(input.spread, issues);
  if (issues.length > 0) return undefined;
  if (spread) ammo.spread = spread;
  return ammo;
}

function readAmmoPatterns(raw: unknown): CpredAmmoPattern[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<CpredAmmoPattern>();
  for (const value of raw) {
    if ((CPRED_AMMO_PATTERNS as readonly unknown[]).includes(value)) {
      seen.add(value as CpredAmmoPattern);
    }
  }
  return [...seen];
}

/** „cel zostaje podpalony … 2 punkty obrażeń" — the status and its number. */
function readAmmoIgnites(
  raw: unknown,
  issues: CompendiumIssue[],
): CpredAmmoEffect['ignites'] | undefined {
  if (raw === undefined || raw === null) return undefined;
  const input = typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const statusId = input && typeof input.statusId === 'string' ? input.statusId : '';
  const damage = input?.damage;
  if (
    !statusId ||
    !isValidCompendiumId(statusId) ||
    !isInteger(damage) ||
    damage <= 0 ||
    damage > AMMO_DOT_DAMAGE_MAX
  ) {
    issues.push({
      field: 'ignites',
      message: `Podpalenie: identyfikator statusu i obrażenia od 1 do ${AMMO_DOT_DAMAGE_MAX}.`,
    });
    return undefined;
  }
  return { statusId, damage };
}

/** The shotgun shell's fixed numbers (s. 174), read off the catalogue row. */
function readAmmoSpread(
  raw: unknown,
  issues: CompendiumIssue[],
): CpredAmmoEffect['spread'] | undefined {
  if (raw === undefined || raw === null) return undefined;
  const input = typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const dv = input?.dv;
  const damage = input?.damage;
  const coneRangeM = input?.coneRangeM;
  if (
    !isInteger(dv) ||
    dv < 1 ||
    dv > AMMO_SPREAD_DV_MAX ||
    typeof damage !== 'string' ||
    !isValidDamageNotation(damage) ||
    !isInteger(coneRangeM) ||
    coneRangeM < 1 ||
    coneRangeM > AMMO_SPREAD_RANGE_M_MAX
  ) {
    issues.push({
      field: 'spread',
      message: 'Śrut: PT, obrażenia notacją kości i zasięg stożka w metrach.',
    });
    return undefined;
  }
  return { dv, damage, coneRangeM };
}

function validateArmor(
  input: Record<string, unknown>,
  base: CompendiumEntryBase,
  issues: CompendiumIssue[],
): ArmorEntry | undefined {
  if (!isInteger(input.sp) || input.sp < 0 || input.sp > ARMOR_SP_MAX) {
    issues.push({ field: 'sp', message: `OB musi być liczbą całkowitą od 0 do ${ARMOR_SP_MAX}.` });
    return undefined;
  }
  const rawLocations = Array.isArray(input.locations) ? input.locations : [];
  const locations = rawLocations.filter((value): value is ArmorLocation =>
    (ARMOR_LOCATIONS as readonly unknown[]).includes(value),
  );
  if (locations.length === 0) {
    issues.push({ field: 'locations', message: 'Wybierz przynajmniej jedną lokację pancerza.' });
    return undefined;
  }
  const armor: ArmorEntry = { ...base, category: 'armor', sp: input.sp, locations };
  if (input.penalty !== undefined && input.penalty !== null) {
    if (!isInteger(input.penalty) || input.penalty > 0 || input.penalty < ARMOR_PENALTY_MIN) {
      issues.push({
        field: 'penalty',
        message: `Kara pancerza musi być liczbą od ${ARMOR_PENALTY_MIN} do 0.`,
      });
      return undefined;
    }
    if (input.penalty !== 0) armor.penalty = input.penalty;
  }
  return armor;
}

function validateCriticalInjury(
  input: Record<string, unknown>,
  base: CompendiumEntryBase,
  issues: CompendiumIssue[],
): CriticalInjuryEntry | undefined {
  const table = (CRITICAL_INJURY_TABLES as readonly unknown[]).includes(input.table)
    ? (input.table as CriticalInjuryTable)
    : undefined;
  if (!table) {
    issues.push({ field: 'table', message: 'Wybierz tabelę rany: korpus albo głowa.' });
    return undefined;
  }
  if (
    !isInteger(input.roll) ||
    input.roll < CRITICAL_INJURY_ROLL_MIN ||
    input.roll > CRITICAL_INJURY_ROLL_MAX
  ) {
    issues.push({
      field: 'roll',
      message: `Wynik 2k6 musi być liczbą od ${CRITICAL_INJURY_ROLL_MIN} do ${CRITICAL_INJURY_ROLL_MAX}.`,
    });
    return undefined;
  }
  if (!base.description) {
    issues.push({ field: 'description', message: 'Efekt rany jest wymagany.' });
    return undefined;
  }
  const injury: CriticalInjuryEntry = {
    ...base,
    category: 'criticalInjury',
    table,
    roll: input.roll,
  };
  const quickFix = checkOptionalText(
    input.quickFix,
    'quickFix',
    'Łatanie',
    COMPENDIUM_NAME_MAX_LENGTH,
    issues,
  );
  const treatment = checkOptionalText(
    input.treatment,
    'treatment',
    'Leczenie',
    COMPENDIUM_NAME_MAX_LENGTH,
    issues,
  );
  if (quickFix) injury.quickFix = quickFix;
  if (treatment) injury.treatment = treatment;
  if (input.deathSavePenalty !== undefined && input.deathSavePenalty !== null) {
    if (
      !isInteger(input.deathSavePenalty) ||
      input.deathSavePenalty < 0 ||
      input.deathSavePenalty > CRITICAL_INJURY_DEATH_SAVE_PENALTY_MAX
    ) {
      issues.push({
        field: 'deathSavePenalty',
        message: `Kara do Testu Przeżywalności: liczba od 0 do ${CRITICAL_INJURY_DEATH_SAVE_PENALTY_MAX}.`,
      });
      return undefined;
    }
    if (input.deathSavePenalty > 0) injury.deathSavePenalty = input.deathSavePenalty;
  }
  if (input.movePenalty !== undefined && input.movePenalty !== null) {
    if (
      !isInteger(input.movePenalty) ||
      input.movePenalty > 0 ||
      input.movePenalty < INJURY_MOVE_PENALTY_MIN
    ) {
      issues.push({
        field: 'movePenalty',
        message: `Kara do RUCH-u: liczba od ${INJURY_MOVE_PENALTY_MIN} do 0.`,
      });
      return undefined;
    }
    if (input.movePenalty < 0) injury.movePenalty = input.movePenalty;
  }
  if (input.actionPenalty !== undefined && input.actionPenalty !== null) {
    if (
      !isInteger(input.actionPenalty) ||
      input.actionPenalty > 0 ||
      input.actionPenalty < INJURY_ACTION_PENALTY_MIN
    ) {
      issues.push({
        field: 'actionPenalty',
        message: `Kara do rzutów: liczba od ${INJURY_ACTION_PENALTY_MIN} do 0.`,
      });
      return undefined;
    }
    if (input.actionPenalty < 0) injury.actionPenalty = input.actionPenalty;
  }
  // The turn flags need no range check — anything but `true` means „no effect".
  if (input.noActionNextTurn === true) injury.noActionNextTurn = true;
  if (input.noMoveAfterRun === true) injury.noMoveAfterRun = true;
  if (input.dotAfterRun === true) injury.dotAfterRun = true;
  if (input.noDodge === true) injury.noDodge = true;
  return injury;
}

function validateCyberware(
  input: Record<string, unknown>,
  base: CompendiumEntryBase,
  issues: CompendiumIssue[],
): CyberwareEntry | undefined {
  const cyberware: CyberwareEntry = { ...base, category: 'cyberware' };
  if (
    input.humanityLoss !== undefined &&
    input.humanityLoss !== null &&
    input.humanityLoss !== ''
  ) {
    if (typeof input.humanityLoss !== 'string' || input.humanityLoss.length > 16) {
      issues.push({
        field: 'humanityLoss',
        message: 'Utrata człowieczeństwa: notacja kości ("2k6") albo liczba.',
      });
      return undefined;
    }
    const numeric = Number(input.humanityLoss);
    if (!Number.isInteger(numeric) && !isValidDamageNotation(input.humanityLoss)) {
      issues.push({
        field: 'humanityLoss',
        message: 'Utrata człowieczeństwa: notacja kości ("2k6") albo liczba.',
      });
      return undefined;
    }
    cyberware.humanityLoss = input.humanityLoss;
  }
  if (input.foundation === true) cyberware.foundation = true;
  if (input.slots !== undefined && input.slots !== null) {
    if (!isInteger(input.slots) || input.slots < 0 || input.slots > CYBERWARE_SLOTS_MAX) {
      issues.push({ field: 'slots', message: `Gniazda: liczba od 0 do ${CYBERWARE_SLOTS_MAX}.` });
      return undefined;
    }
    cyberware.slots = input.slots;
  }
  return cyberware;
}

/** A DV table read off a data file: exactly one slot per band, `null` for „Nd.". */
function readRangeDvTable(raw: unknown): RangeDvTable | undefined {
  if (!Array.isArray(raw)) return undefined;
  return CPRED_RANGE_BANDS.map((_, index) => {
    const value = raw[index];
    return isInteger(value) ? value : null;
  });
}

/** An autofire profile is only usable with both a cap and a reachable band. */
function readAutofireProfile(raw: unknown): AutofireProfile | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const input = raw as Record<string, unknown>;
  if (!isInteger(input.max) || input.max < 1 || input.max > AUTOFIRE_MAX_MULTIPLIER) {
    return undefined;
  }
  const rangeDv = readRangeDvTable(input.rangeDv);
  if (!rangeDv || rangeDv.every((value) => value === null)) return undefined;
  return { max: input.max, rangeDv };
}

function validateWeaponType(raw: unknown): WeaponTypeDefinition | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const input = raw as Record<string, unknown>;
  if (typeof input.id !== 'string' || !isValidCompendiumId(input.id)) return undefined;
  if (typeof input.name !== 'string' || input.name.length === 0) return undefined;
  if (typeof input.damage !== 'string' || !isValidDamageNotation(input.damage)) return undefined;
  const melee = input.melee === true;
  const rof = isInteger(input.rof) && input.rof >= 1 && input.rof <= WEAPON_ROF_MAX ? input.rof : 1;
  const magazine =
    isInteger(input.magazine) && input.magazine >= 0 && input.magazine <= WEAPON_MAGAZINE_MAX
      ? input.magazine
      : null;
  const rangeDv = readRangeDvTable(input.rangeDv);
  const autofire = readAutofireProfile(input.autofire);
  const ammoPatterns = readAmmoPatterns(input.ammoPatterns);
  const ammoIds = Array.isArray(input.ammoIds)
    ? input.ammoIds.filter(
        (value): value is string => typeof value === 'string' && isValidCompendiumId(value),
      )
    : [];
  return {
    id: input.id,
    name: input.name,
    ...(typeof input.nameOriginal === 'string' ? { nameOriginal: input.nameOriginal } : {}),
    skillId: typeof input.skillId === 'string' ? input.skillId : null,
    damage: input.damage,
    magazine,
    rof,
    hands: input.hands === 2 ? 2 : 1,
    concealable: input.concealable === true,
    ...(isInteger(input.attachmentSlots) ? { attachmentSlots: input.attachmentSlots } : {}),
    melee,
    ...(rangeDv && !melee ? { rangeDv } : {}),
    ...(autofire && !melee ? { autofire } : {}),
    ...(input.suppressive === true && !melee ? { suppressive: true as const } : {}),
    ...(input.thrown === true && !melee ? { thrown: true as const } : {}),
    ...(input.explosive === true && !melee ? { explosive: true as const } : {}),
    ...(isInteger(input.maxRangeM) && input.maxRangeM > 0 && input.maxRangeM <= WEAPON_MAX_RANGE_M
      ? { maxRangeM: input.maxRangeM }
      : {}),
    ...(typeof input.ammunition === 'string' && input.ammunition.length > 0
      ? { ammunition: input.ammunition.slice(0, COMPENDIUM_NAME_MAX_LENGTH) }
      : {}),
    ...(ammoPatterns.length > 0 && !melee ? { ammoPatterns } : {}),
    ...(ammoIds.length > 0 && !melee ? { ammoIds } : {}),
    ...(typeof input.description === 'string'
      ? { description: input.description.slice(0, COMPENDIUM_DESCRIPTION_MAX_LENGTH) }
      : {}),
    ...(typeof input.source === 'string' ? { source: input.source } : {}),
    ...(input.incomplete === true ? { incomplete: true as const } : {}),
  };
}

/**
 * Builds the registry from parsed compendium files, dropping malformed rows so
 * a bad line in a data file can never take the server down. Later files win on
 * id collisions — private rulebook data overrides the public samples.
 */
export function buildCompendium(files: readonly unknown[]): CompendiumRegistry {
  const weaponTypeById = new Map<string, WeaponTypeDefinition>();
  const entryById = new Map<string, CompendiumEntry>();

  for (const file of files) {
    const parsed = (file ?? {}) as CompendiumFile;
    for (const raw of parsed.weaponTypes ?? []) {
      const weaponType = validateWeaponType(raw);
      if (weaponType) weaponTypeById.set(weaponType.id, weaponType);
    }
    for (const raw of parsed.entries ?? []) {
      const result = validateCompendiumEntry({ source: parsed.source, ...(raw as object) });
      if (result.ok) entryById.set(result.entry.id, result.entry);
    }
  }

  const collator = new Intl.Collator('pl');
  const weaponTypes = [...weaponTypeById.values()].sort((a, b) => collator.compare(a.name, b.name));
  const entries = [...entryById.values()].sort((a, b) => collator.compare(a.name, b.name));
  return { weaponTypes, weaponTypeById, entries, entryById };
}

/** Weapon stats after inheriting from the base type — what the UI shows. */
export interface ResolvedWeapon {
  damage: string;
  magazine: number | null;
  rof: number;
  hands: 1 | 2;
  concealable: boolean;
  attachmentSlots: number;
  skillId: string | null;
  rangeDv?: RangeDvTable;
  autofire?: AutofireProfile;
  suppressive?: boolean;
  /** Thrown by hand rather than fired (stage 16d). */
  thrown?: boolean;
  /** Damages a square rather than a person (stage 16d). */
  explosive?: boolean;
  /** Hard range ceiling in metres, on top of the DV table (stage 16d). */
  maxRangeM?: number;
  /** Cartridge the type takes; empty when the weapon counts no rounds. */
  ammoType?: string;
  /** Shapes of round this weapon chambers (stage 16g). */
  ammoPatterns?: CpredAmmoPattern[];
  /** The only rounds it fires, when the catalogue names them (flamethrower). */
  ammoIds?: string[];
  typeName?: string;
  melee: boolean;
}

export function resolveWeapon(
  weapon: WeaponEntry,
  registry: Pick<CompendiumRegistry, 'weaponTypeById'>,
): ResolvedWeapon {
  const type = weapon.weaponTypeId ? registry.weaponTypeById.get(weapon.weaponTypeId) : undefined;
  return {
    damage: weapon.damage ?? type?.damage ?? '1k6',
    magazine: weapon.magazine !== undefined ? weapon.magazine : (type?.magazine ?? null),
    rof: weapon.rof ?? type?.rof ?? 1,
    hands: weapon.hands ?? type?.hands ?? 1,
    concealable: weapon.concealable ?? type?.concealable ?? false,
    attachmentSlots: weapon.attachmentSlots ?? type?.attachmentSlots ?? 0,
    skillId: type?.skillId ?? null,
    ...(type?.rangeDv ? { rangeDv: type.rangeDv } : {}),
    ...(type?.autofire ? { autofire: type.autofire } : {}),
    ...(type?.suppressive ? { suppressive: true as const } : {}),
    ...(type?.thrown ? { thrown: true as const } : {}),
    ...(type?.explosive ? { explosive: true as const } : {}),
    ...(type?.maxRangeM !== undefined ? { maxRangeM: type.maxRangeM } : {}),
    ...(type?.ammunition ? { ammoType: type.ammunition } : {}),
    ...(type?.ammoPatterns ? { ammoPatterns: type.ammoPatterns } : {}),
    ...(type?.ammoIds ? { ammoIds: type.ammoIds } : {}),
    ...(type ? { typeName: type.name } : {}),
    melee: type?.melee ?? false,
  };
}

/** Case- and diacritics-insensitive search over names and descriptions. */
export function searchCompendium(
  entries: readonly CompendiumEntry[],
  query: string,
  category?: CompendiumCategory,
): CompendiumEntry[] {
  const needle = slugify(query);
  return entries.filter((entry) => {
    if (category && entry.category !== category) return false;
    if (!needle) return true;
    const haystack = slugify(
      `${entry.name} ${entry.nameOriginal ?? ''} ${entry.description ?? ''}`,
    );
    return haystack.includes(needle);
  });
}

/** "550 ed (Drogie)" — the label used on cards and in the editor. */
export function formatCost(entry: Pick<CompendiumEntryBase, 'cost' | 'costCategory'>): string {
  const band = entry.costCategory ? COST_CATEGORY_LABELS[entry.costCategory] : undefined;
  if (entry.cost === null) return band ?? '—';
  return band ? `${entry.cost} ed (${band})` : `${entry.cost} ed`;
}

/** Guard used by the sheet code before touching weapon-only fields. */
export function isWeaponEntry(entry: CompendiumEntry): entry is WeaponEntry {
  return entry.category === 'weapon';
}

export function isArmorEntry(entry: CompendiumEntry): entry is ArmorEntry {
  return entry.category === 'armor';
}

/** Guard used before touching ammunition-only fields (stage 16g). */
export function isAmmoEntry(entry: CompendiumEntry): entry is AmmoEntry {
  return entry.category === 'ammo';
}

/**
 * The ammunition rows of a catalogue, as the rules want them: id, name, the
 * patterns they fit and the flags. Strips the shopping half of the entry (price,
 * provenance, translations) so nothing downstream has to carry it around.
 */
export function ammoProfilesOf(entries: readonly CompendiumEntry[]): CpredAmmoProfile[] {
  return entries.filter(isAmmoEntry).map(toAmmoProfile);
}

/** One catalogue row, read as a cartridge. */
export function toAmmoProfile(entry: AmmoEntry): CpredAmmoProfile {
  return {
    id: entry.id,
    name: entry.name,
    patterns: [...entry.patterns],
    ...(entry.ablationBonus ? { ablationBonus: entry.ablationBonus } : {}),
    ...(entry.noAblation ? { noAblation: true as const } : {}),
    ...(entry.noCriticalInjury ? { noCriticalInjury: true as const } : {}),
    ...(entry.nonLethal ? { nonLethal: true as const } : {}),
    ...(entry.noAim ? { noAim: true as const } : {}),
    ...(entry.ignites ? { ignites: { ...entry.ignites } } : {}),
    ...(entry.extraInjuryOn ? { extraInjuryOn: [...entry.extraInjuryOn] } : {}),
    ...(entry.spread ? { spread: { ...entry.spread } } : {}),
  };
}

/** Skill ids referenced by weapon types must exist in `skills.json`. */
export function compendiumSkillIds(registry: CompendiumRegistry): string[] {
  const ids = new Set<string>();
  for (const type of registry.weaponTypes) if (type.skillId) ids.add(type.skillId);
  return [...ids];
}

/** Stat ids are re-exported for the editor's dropdowns (stage 15 uses them). */
export const COMPENDIUM_STAT_IDS = CPRED_STAT_IDS;
