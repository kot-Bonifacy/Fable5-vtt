import { parseRollNotation } from '../../dice.js';
import { ARMOR_SP_MAX } from './character.js';
import { isValidCompendiumId, slugify } from './ids.js';
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

export const COMPENDIUM_CATEGORIES = ['weapon', 'armor', 'gear', 'cyberware'] as const;
export type CompendiumCategory = (typeof COMPENDIUM_CATEGORIES)[number];

export const COMPENDIUM_CATEGORY_LABELS: Record<CompendiumCategory, string> = {
  weapon: 'Broń',
  armor: 'Pancerz',
  gear: 'Sprzęt',
  cyberware: 'Cyborgizacje',
};

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

export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  cheap: 'Tanie',
  everyday: 'Codzienne',
  costly: 'Kosztowne',
  premium: 'Ekskluzywne',
  expensive: 'Drogie',
  veryExpensive: 'Bardzo drogie',
  luxury: 'Luksusowe',
  superLuxury: 'Superluksusowe',
};

export const ARMOR_LOCATIONS = ['head', 'body', 'shield'] as const;
export type ArmorLocation = (typeof ARMOR_LOCATIONS)[number];

export const ARMOR_LOCATION_LABELS: Record<ArmorLocation, string> = {
  head: 'Głowa',
  body: 'Korpus',
  shield: 'Tarcza',
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

export type CompendiumEntry = WeaponEntry | ArmorEntry | GearEntry | CyberwareEntry;

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
export const WEAPON_SLOTS_MAX = 6;
export const ARMOR_PENALTY_MIN = -6;
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
  const id =
    typeof input.id === 'string' && input.id.length > 0
      ? input.id
      : name
        ? `${category}.${slugify(name)}`
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
  else if (category === 'armor') entry = validateArmor(input, base, issues);
  else if (category === 'cyberware') entry = validateCyberware(input, base, issues);
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
  const rangeDv = Array.isArray(input.rangeDv)
    ? CPRED_RANGE_BANDS.map((_, index) => {
        const value = (input.rangeDv as unknown[])[index];
        return isInteger(value) ? value : null;
      })
    : undefined;
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

/** Skill ids referenced by weapon types must exist in `skills.json`. */
export function compendiumSkillIds(registry: CompendiumRegistry): string[] {
  const ids = new Set<string>();
  for (const type of registry.weaponTypes) if (type.skillId) ids.add(type.skillId);
  return [...ids];
}

/** Stat ids are re-exported for the editor's dropdowns (stage 15 uses them). */
export const COMPENDIUM_STAT_IDS = CPRED_STAT_IDS;
