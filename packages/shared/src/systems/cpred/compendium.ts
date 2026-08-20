import { parseRollNotation } from '../../dice.js';
import {
  CPRED_AMMO_PATTERNS,
  type CpredAmmoEffect,
  type CpredAmmoPattern,
  type CpredAmmoProfile,
} from './ammo.js';
import { SMOKE_PENALTY_MIN, SMOKE_SIDE_M_MAX } from '../../smoke.js';
import {
  CYBERWARE_SLOTS_MAX,
  isCyberwareInstall,
  isCyberwareType,
  type CyberwareHumanityLoss,
  type CyberwareInstall,
  type CyberwareType,
} from './cyberware.js';
import { isValidCompendiumId, slugify } from './ids.js';
import {
  ARMOR_LOCATIONS,
  ARMOR_PENALTY_MIN,
  ARMOR_SP_MAX,
  INJURY_ACTION_PENALTY_MIN,
  INJURY_MOVE_PENALTY_MIN,
  type ArmorLocation,
} from './locations.js';
import {
  NET_DEFENSE_KINDS,
  NET_DEFENSE_MINUTES_MAX,
  NET_DEFENSE_STAT_MAX,
  NET_DEFENSE_TRIGGER_MAX,
  NET_PROGRAM_CLASSES,
  NET_PROGRAM_STAT_MAX,
  NET_PROGRAM_TARGETS,
  isNetDefenseSystem,
  netProgramSlots,
  readNetDefenseEffects,
  readNetProgramEffects,
  type CpredNetDefenseProfile,
  type CpredNetProgramProfile,
  type NetDefenseKind,
  type NetProgramClass,
  type NetProgramTarget,
} from './netrunning.js';
import { CPRED_STAT_IDS, type CpredStatId } from './stats.js';

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
  'program',
  'netDefense',
  'criticalInjury',
] as const;
export type CompendiumCategory = (typeof COMPENDIUM_CATEGORIES)[number];

export const COMPENDIUM_CATEGORY_LABELS: Record<CompendiumCategory, string> = {
  weapon: 'Broń',
  ammo: 'Amunicja',
  armor: 'Pancerz',
  gear: 'Sprzęt',
  cyberware: 'Cyborgizacje',
  program: 'Programy',
  netDefense: 'Obrona Sieci',
  criticalInjury: 'Rany krytyczne',
};

/**
 * Categories that can be added to a character sheet as a row of their own.
 * Four are excluded, each for its own reason: nobody buys a Critical Injury
 * (the damage engine draws them, stage 15); ammunition is not carried as a row
 * but *loaded* into a weapon (stage 16g); a Program goes into a cyberdeck slot
 * rather than the backpack (stage 26a); and Net defenders belong to an
 * architecture, never to a person.
 */
export const COMPENDIUM_ITEM_CATEGORIES = COMPENDIUM_CATEGORIES.filter(
  (category) =>
    category !== 'criticalInjury' &&
    category !== 'ammo' &&
    category !== 'program' &&
    category !== 'netDefense',
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
 * Availability tiers (stage 25c) — **not a rule of the rulebook**, a mechanism
 * of the campaign: the GM unlocks bands of the catalogue as the campaign goes
 * on rather than handing a starting party the whole shop.
 *
 * They live here, next to the price bands, because the tier is a property of
 * the entry — the arithmetic that derives one from a price and the refusal that
 * reads it are in `shop.ts`.
 */
export const SHOP_TIERS = [1, 2, 3, 4] as const;
export type ShopTier = (typeof SHOP_TIERS)[number];

export const SHOP_TIER_MIN: ShopTier = 1;
export const SHOP_TIER_MAX: ShopTier = 4;

export function isShopTier(value: unknown): value is ShopTier {
  return typeof value === 'number' && (SHOP_TIERS as readonly number[]).includes(value);
}

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
  /**
   * Availability tier (stage 25c). Absent means „derive it from the price" —
   * which is what almost every entry does; the field exists so the GM can move
   * a single item off the rung its price would put it on (a cheap gun that is
   * still hard to come by, a pricey toy sold on every corner).
   */
  tier?: ShopTier;
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
  /**
   * Slots this piece of gear *offers* — a cyberdeck, and nothing else so far
   * (stage 26a). Read out of the item's own description by the importer, so a
   * GM's home-made deck says how big it is in the same field.
   */
  deckSlots?: number;
  /** Slots this piece *takes* in a deck — the hardware upgrades of s. 208. */
  deckSlotCost?: number;
}

/**
 * A Program: Booster, Defender, Aggressor or Black ICE (stage 26a, s. 201–207).
 *
 * One category for all four because they are one table in the rulebook and one
 * thing in the fiction — software that sits in a deck slot and has ATK, OBR and
 * REZ. What separates Black ICE is `blackIce` on the profile, not a category of
 * its own: it costs two slots and carries PER/PRĘ, and every other rule about
 * it reads those fields.
 */
export interface ProgramEntry extends CompendiumEntryBase, CpredNetProgramProfile {
  category: 'program';
}

/**
 * A Net defender that is not carried in a deck — a Demon for now (stage 26a).
 * The drones, emplacements and environmental traps of s. 212–216 join this
 * category in stage 26c, which is when their own fields get decided.
 */
export interface NetDefenseEntry extends CompendiumEntryBase, CpredNetDefenseProfile {
  category: 'netDefense';
}

export interface CyberwareEntry extends CompendiumEntryBase, CyberwareHumanityLoss {
  category: 'cyberware';
  /** One of the eight families of the rulebook's tables (stage 23a). */
  type?: CyberwareType;
  /** „Montaż" — Galeria / Klinika / Szpital, or `none` for a plug-in chip. */
  install?: CyberwareInstall;
  /** Foundational cyberware (a cyberarm) vs an option installed into one. */
  foundation?: boolean;
  /** Option slots this piece provides — foundations only. */
  slots?: number;
  /** Slots this piece takes in its family; absent means the table's one. */
  slotCost?: number;
  /** „Wymaga sprzęgu neuralnego" — prose, because the tables are prose. */
  requires?: string;
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
  | WeaponEntry
  | AmmoEntry
  | ArmorEntry
  | GearEntry
  | CyberwareEntry
  | ProgramEntry
  | NetDefenseEntry
  | CriticalInjuryEntry;

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
/** Highest flat Humanity cost in the tables is 14 (borgware); leave room. */
export const CYBERWARE_HUMANITY_LOSS_MAX = 30;

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
  // Ids are slugs, so a camelCase category needs a lowercase prefix of its own.
  //
  // „Obrona Sieci" splits in two (corrected in 26f): the bestiary of s. 212 is
  // `demon.…`, the three defence-system tables of s. 213–216 are `defense.…`.
  // That is what the import writes, and a hand-typed turret landing under
  // `demon.` would be the one row of the catalogue whose id lied about what it
  // is — which matters now that a zone on the map points at one by id.
  const idPrefix =
    category === 'criticalInjury'
      ? 'injury'
      : category === 'netDefense'
        ? input.defenseKind === 'demon'
          ? 'demon'
          : 'defense'
        : category;
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

  // An unusable tier is dropped rather than refused: the entry is still a
  // perfectly good catalogue row, it just falls back to the price's own rung.
  const tier = isShopTier(input.tier) ? input.tier : undefined;

  const base: CompendiumEntryBase = {
    id,
    name: name ?? '',
    cost,
    ...(nameOriginal ? { nameOriginal } : {}),
    ...(description ? { description } : {}),
    ...(descriptionOriginal ? { descriptionOriginal } : {}),
    ...(costCategory ? { costCategory } : {}),
    ...(tier ? { tier } : {}),
    ...(source ? { source } : {}),
    ...(input.incomplete === true ? { incomplete: true as const } : {}),
    ...(input.custom === true ? { custom: true as const } : {}),
  };

  let entry: CompendiumEntry | undefined;
  if (category === 'weapon') entry = validateWeapon(input, base, issues);
  else if (category === 'ammo') entry = validateAmmo(input, base, issues);
  else if (category === 'armor') entry = validateArmor(input, base, issues);
  else if (category === 'cyberware') entry = validateCyberware(input, base, issues);
  else if (category === 'program') entry = validateProgram(input, base, issues);
  else if (category === 'netDefense') entry = validateNetDefense(input, base, issues);
  else if (category === 'criticalInjury') entry = validateCriticalInjury(input, base, issues);
  else entry = validateGear(input, base, issues);

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
/** Rails on the stage 16h flags. */
export const AMMO_CHECK_DV_MAX = 40;
/** Ten minutes of fiction — far past anything the table prints. */
export const AMMO_CHECK_DURATION_S_MAX = 600;
export const AMMO_SMART_MAX_MISS = 10;
export const AMMO_SMART_BONUS_MAX = 20;

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

  // Stage 16h — the half of the table that hurts nobody directly.
  if (input.noDamage === true) ammo.noDamage = true;

  const check = readAmmoCheck(input.check, issues);
  if (issues.length > 0) return undefined;
  if (check) ammo.check = check;

  const smoke = readAmmoSmoke(input.smoke, issues);
  if (issues.length > 0) return undefined;
  if (smoke) ammo.smoke = smoke;

  const smart = readAmmoSmart(input.smart, issues);
  if (issues.length > 0) return undefined;
  if (smart) ammo.smart = smart;
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

/**
 * The check a no-damage round forces (stage 16h) and what failing it costs.
 *
 * Nothing here is looked up: the skill id, the injury ids and the status ids are
 * carried as written, exactly as `ignites.statusId` has been since 16g. A round
 * naming a skill this campaign's registry has never heard of degrades to a roll
 * on the bare stat rather than being refused at import — the Easy Mode list has
 * 41 skills and „Cyberinżynieria" is not one of them.
 */
function readAmmoCheck(
  raw: unknown,
  issues: CompendiumIssue[],
): CpredAmmoEffect['check'] | undefined {
  if (raw === undefined || raw === null) return undefined;
  const input = typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const skillId = input && typeof input.skillId === 'string' ? input.skillId : '';
  const dv = input?.dv;
  const failureRaw = input?.failure;
  if (
    !skillId ||
    !isValidCompendiumId(skillId) ||
    !isInteger(dv) ||
    dv < 1 ||
    dv > AMMO_CHECK_DV_MAX
  ) {
    issues.push({
      field: 'check',
      message: `Wymuszony test: identyfikator umiejętności i PT od 1 do ${AMMO_CHECK_DV_MAX}.`,
    });
    return undefined;
  }
  const failure =
    typeof failureRaw === 'object' && failureRaw !== null
      ? (failureRaw as Record<string, unknown>)
      : null;
  if (!failure) {
    issues.push({ field: 'check', message: 'Wymuszony test musi mówić, co daje porażka.' });
    return undefined;
  }

  const damage = failure.damage;
  if (damage !== undefined && damage !== null) {
    if (typeof damage !== 'string' || !isValidDamageNotation(damage)) {
      issues.push({ field: 'check', message: 'Obrażenia porażki: notacja kości, np. 3k6.' });
      return undefined;
    }
  }
  const statuses = readIdList(failure.statuses);
  const injuries = readIdList(failure.injuries);
  if (statuses === null || injuries === null) {
    issues.push({ field: 'check', message: 'Nieprawidłowe identyfikatory statusów albo ran.' });
    return undefined;
  }
  const durationS = failure.durationS;
  if (durationS !== undefined && durationS !== null) {
    if (!isInteger(durationS) || durationS <= 0 || durationS > AMMO_CHECK_DURATION_S_MAX) {
      issues.push({
        field: 'check',
        message: `Czas trwania efektu: sekundy od 1 do ${AMMO_CHECK_DURATION_S_MAX}.`,
      });
      return undefined;
    }
  }
  // A failure that costs nothing is a row somebody half-filled, and it would
  // roll dice at the table to no purpose.
  if (typeof damage !== 'string' && statuses.length === 0 && injuries.length === 0) {
    issues.push({
      field: 'check',
      message: 'Porażka testu musi coś dawać: obrażenia, status albo ranę krytyczną.',
    });
    return undefined;
  }

  const skillLabel = input && typeof input.skillLabel === 'string' ? input.skillLabel : '';
  const statId = (CPRED_STAT_IDS as readonly unknown[]).includes(input?.statId)
    ? (input!.statId as CpredStatId)
    : undefined;
  return {
    skillId,
    ...(skillLabel ? { skillLabel: skillLabel.slice(0, COMPENDIUM_NAME_MAX_LENGTH) } : {}),
    ...(statId ? { statId } : {}),
    dv,
    ...(input?.biologicalOnly === true ? { biologicalOnly: true as const } : {}),
    failure: {
      ...(typeof damage === 'string' ? { damage } : {}),
      ...(statuses.length > 0 ? { statuses } : {}),
      ...(injuries.length > 0 ? { injuries } : {}),
      ...(isInteger(durationS) && durationS > 0 ? { durationS } : {}),
    },
  };
}

/** A list of compendium-shaped ids, or null when one of them is not. */
function readIdList(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string' || !isValidCompendiumId(value)) return null;
    ids.push(value);
  }
  return ids;
}

/** „Zasnuwa kwadrat 10 m × 10 m … działania w dymie mają zwykle −4" (s. 347). */
function readAmmoSmoke(
  raw: unknown,
  issues: CompendiumIssue[],
): CpredAmmoEffect['smoke'] | undefined {
  if (raw === undefined || raw === null) return undefined;
  const input = typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const sideM = input?.sideM;
  const penalty = input?.penalty;
  if (
    !isInteger(sideM) ||
    sideM < 1 ||
    sideM > SMOKE_SIDE_M_MAX ||
    !isInteger(penalty) ||
    penalty >= 0 ||
    penalty < SMOKE_PENALTY_MIN
  ) {
    issues.push({
      field: 'smoke',
      message: `Dym: bok kwadratu 1–${SMOKE_SIDE_M_MAX} m i ujemny modyfikator (do ${SMOKE_PENALTY_MIN}).`,
    });
    return undefined;
  }
  return { sideM, penalty };
}

/** „Jeśli chybisz o 4 lub mniej … drugi rzut 1k10 + 10" (s. 347). */
function readAmmoSmart(
  raw: unknown,
  issues: CompendiumIssue[],
): CpredAmmoEffect['smart'] | undefined {
  if (raw === undefined || raw === null) return undefined;
  const input = typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const maxMiss = input?.maxMiss;
  const bonus = input?.bonus;
  if (
    !isInteger(maxMiss) ||
    maxMiss < 1 ||
    maxMiss > AMMO_SMART_MAX_MISS ||
    !isInteger(bonus) ||
    bonus < 0 ||
    bonus > AMMO_SMART_BONUS_MAX
  ) {
    issues.push({
      field: 'smart',
      message: `Amunicja inteligentna: chybienie 1–${AMMO_SMART_MAX_MISS} i premia 0–${AMMO_SMART_BONUS_MAX}.`,
    });
    return undefined;
  }
  const requires = input && typeof input.requires === 'string' ? input.requires : '';
  return {
    maxMiss,
    bonus,
    ...(requires ? { requires: requires.slice(0, COMPENDIUM_NAME_MAX_LENGTH) } : {}),
  };
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

/** Deck slots must be a small positive count; anything else is dropped, not refused. */
function slotCount(raw: unknown, field: string, issues: CompendiumIssue[]): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (!isInteger(raw) || raw < 1 || raw > WEAPON_SLOTS_MAX * 2) {
    issues.push({
      field,
      message: `Liczba gniazd musi być liczbą całkowitą od 1 do ${WEAPON_SLOTS_MAX * 2}.`,
    });
    return undefined;
  }
  return raw;
}

function validateGear(
  input: Record<string, unknown>,
  base: CompendiumEntryBase,
  issues: CompendiumIssue[],
): GearEntry | undefined {
  const deckSlots = slotCount(input.deckSlots, 'deckSlots', issues);
  const deckSlotCost = slotCount(input.deckSlotCost, 'deckSlotCost', issues);
  if (issues.length > 0) return undefined;
  return {
    ...base,
    category: 'gear',
    ...(deckSlots !== undefined ? { deckSlots } : {}),
    ...(deckSlotCost !== undefined ? { deckSlotCost } : {}),
  };
}

function programStat(
  raw: unknown,
  field: string,
  label: string,
  issues: CompendiumIssue[],
): number | undefined {
  if (raw === undefined || raw === null || raw === '') return 0;
  if (!isInteger(raw) || raw < 0 || raw > NET_PROGRAM_STAT_MAX) {
    issues.push({
      field,
      message: `${label} musi być liczbą całkowitą od 0 do ${NET_PROGRAM_STAT_MAX}.`,
    });
    return undefined;
  }
  return raw;
}

function validateProgram(
  input: Record<string, unknown>,
  base: CompendiumEntryBase,
  issues: CompendiumIssue[],
): ProgramEntry | undefined {
  const programClass = (NET_PROGRAM_CLASSES as readonly unknown[]).includes(input.programClass)
    ? (input.programClass as NetProgramClass)
    : undefined;
  if (!programClass) {
    issues.push({ field: 'programClass', message: 'Wybierz klasę Programu.' });
    return undefined;
  }
  const target = (NET_PROGRAM_TARGETS as readonly unknown[]).includes(input.target)
    ? (input.target as NetProgramTarget)
    : undefined;
  const blackIce = input.blackIce === true;

  const atk = programStat(input.atk, 'atk', 'ATK', issues);
  const def = programStat(input.def, 'def', 'OBR', issues);
  const rez = programStat(input.rez, 'rez', 'REZ', issues);
  // PER and PRĘ only exist on Black ICE; on anything else they are dropped so a
  // GM who switches a row back to „Agresor" is not left with orphan numbers.
  const per = blackIce ? programStat(input.per, 'per', 'PER', issues) : undefined;
  const speed = blackIce ? programStat(input.speed, 'speed', 'PRĘ', issues) : undefined;
  const slots = slotCount(input.slots, 'slots', issues);
  const icon = checkOptionalText(
    input.icon,
    'icon',
    'Ikona',
    COMPENDIUM_DESCRIPTION_MAX_LENGTH,
    issues,
  );
  if (issues.length > 0 || atk === undefined || def === undefined || rez === undefined) {
    return undefined;
  }

  // The „Efekt" column as numbers (stage 26c). Never a refusal: a Program the
  // engine cannot help with is still a Program the GM may want in the catalogue.
  const effects = readNetProgramEffects(input.effects);

  const profile: CpredNetProgramProfile = {
    programClass,
    ...(target ? { target } : {}),
    ...(blackIce ? { blackIce: true as const } : {}),
    atk,
    def,
    rez,
    ...(per !== undefined ? { per } : {}),
    ...(speed !== undefined ? { speed } : {}),
    ...(icon ? { icon } : {}),
    ...(effects ? { effects } : {}),
  };
  // Slots are stored only when they differ from what the class already implies,
  // so the „Black ICE takes two" rule stays in one place.
  const implied = netProgramSlots(profile);
  return {
    ...base,
    category: 'program',
    ...profile,
    ...(slots !== undefined && slots !== implied ? { slots } : {}),
  };
}

/**
 * A number a defence system's table prints, or nothing at all.
 *
 * Unlike `programStat`, a blank cell here means **absent**, not zero: „25 PW"
 * and „PW: brak" are different rows in the same table, and a laser grid with no
 * hit points is not a laser grid with none left.
 */
function defenseStat(
  raw: unknown,
  field: string,
  label: string,
  max: number,
  issues: CompendiumIssue[],
): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (!isInteger(raw) || raw < 0 || raw > max) {
    issues.push({ field, message: `${label} musi być liczbą całkowitą od 0 do ${max}.` });
    return undefined;
  }
  return raw;
}

/**
 * „Obrona Sieci" — one category, four kinds, two very different sets of columns
 * (stage 26d).
 *
 * A Demon is required to carry all four of its numbers, because every one of
 * them is read by the rules the moment it acts. A defence system is required to
 * carry none: the three tables of s. 213–216 leave most cells blank, and a
 * camera with no Combat Value is not a half-filled row — it is a camera.
 */
function validateNetDefense(
  input: Record<string, unknown>,
  base: CompendiumEntryBase,
  issues: CompendiumIssue[],
): NetDefenseEntry | undefined {
  const defenseKind = (NET_DEFENSE_KINDS as readonly unknown[]).includes(input.defenseKind)
    ? (input.defenseKind as NetDefenseKind)
    : undefined;
  if (!defenseKind) {
    issues.push({ field: 'defenseKind', message: 'Wybierz rodzaj obrony Sieci.' });
    return undefined;
  }
  const icon = checkOptionalText(
    input.icon,
    'icon',
    'Ikona',
    COMPENDIUM_DESCRIPTION_MAX_LENGTH,
    issues,
  );

  if (defenseKind === 'demon') {
    const rez = programStat(input.rez, 'rez', 'REZ', issues);
    const interfaceRank = programStat(input.interfaceRank, 'interfaceRank', 'Interfejs', issues);
    const netActions = programStat(input.netActions, 'netActions', 'Akcje Sieciowe', issues);
    const combatValue = programStat(input.combatValue, 'combatValue', 'Wartość bojowa', issues);
    if (
      issues.length > 0 ||
      rez === undefined ||
      interfaceRank === undefined ||
      netActions === undefined ||
      combatValue === undefined
    ) {
      return undefined;
    }
    const profile: CpredNetDefenseProfile = {
      defenseKind,
      rez,
      interfaceRank,
      netActions,
      combatValue,
      ...(icon ? { icon } : {}),
    };
    return { ...base, category: 'netDefense', ...profile };
  }

  const combatValue = defenseStat(
    input.combatValue,
    'combatValue',
    'Wartość bojowa',
    NET_DEFENSE_STAT_MAX,
    issues,
  );
  const disableDv = defenseStat(
    input.disableDv,
    'disableDv',
    'PT unieszkodliwienia',
    NET_DEFENSE_STAT_MAX,
    issues,
  );
  const disableMinutes = defenseStat(
    input.disableMinutes,
    'disableMinutes',
    'Czas unieszkodliwienia',
    NET_DEFENSE_MINUTES_MAX,
    issues,
  );
  const hp = defenseStat(input.hp, 'hp', 'PW', NET_DEFENSE_STAT_MAX * 10, issues);
  const move = defenseStat(input.move, 'move', 'RUCH', NET_DEFENSE_STAT_MAX, issues);
  const spotDv = defenseStat(input.spotDv, 'spotDv', 'PT zauważenia', NET_DEFENSE_STAT_MAX, issues);
  const trigger = checkOptionalText(
    input.trigger,
    'trigger',
    'Standardowa aktywacja',
    NET_DEFENSE_TRIGGER_MAX,
    issues,
  );
  if (issues.length > 0) return undefined;

  // Stage 26f: the „Efekt" column, in numbers. Read with the same forgiveness
  // `readNetProgramEffects` gets — a malformed effect leaves a row the GM rules
  // on, which is where every one of these rows stood before this stage.
  const effects = readNetDefenseEffects(input.effects);

  const profile: CpredNetDefenseProfile = {
    defenseKind,
    ...(combatValue !== undefined ? { combatValue } : {}),
    ...(disableDv !== undefined ? { disableDv } : {}),
    ...(disableMinutes !== undefined ? { disableMinutes } : {}),
    ...(hp !== undefined ? { hp } : {}),
    ...(move !== undefined ? { move } : {}),
    ...(spotDv !== undefined ? { spotDv } : {}),
    ...(trigger ? { trigger } : {}),
    ...(effects ? { effects } : {}),
    ...(icon ? { icon } : {}),
  };
  return { ...base, category: 'netDefense', ...profile };
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
  // The tables print both readings of the same cost — „7 (2k6)" is a flat 7 at
  // character creation and a roll in play (s. 111) — so the entry carries both.
  if (input.humanityLossFixed !== undefined && input.humanityLossFixed !== null) {
    if (
      !isInteger(input.humanityLossFixed) ||
      input.humanityLossFixed < 0 ||
      input.humanityLossFixed > CYBERWARE_HUMANITY_LOSS_MAX
    ) {
      issues.push({
        field: 'humanityLossFixed',
        message: `Stała utrata człowieczeństwa: liczba od 0 do ${CYBERWARE_HUMANITY_LOSS_MAX}.`,
      });
      return undefined;
    }
    if (input.humanityLossFixed > 0) cyberware.humanityLossFixed = input.humanityLossFixed;
  }
  if (input.humanityLossHalved === true) cyberware.humanityLossHalved = true;
  if (isCyberwareType(input.type)) cyberware.type = input.type;
  if (isCyberwareInstall(input.install)) cyberware.install = input.install;
  if (input.foundation === true) cyberware.foundation = true;
  for (const field of ['slots', 'slotCost'] as const) {
    const value = input[field];
    if (value === undefined || value === null) continue;
    if (!isInteger(value) || value < 0 || value > CYBERWARE_SLOTS_MAX) {
      issues.push({ field, message: `Gniazda: liczba od 0 do ${CYBERWARE_SLOTS_MAX}.` });
      return undefined;
    }
    cyberware[field] = value;
  }
  if (typeof input.requires === 'string' && input.requires.trim().length > 0) {
    cyberware.requires = input.requires.trim().slice(0, COMPENDIUM_FEATURE_MAX_LENGTH);
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
  /**
   * Id of the weapon type this came from („weapon-type.assault-rifle").
   *
   * Carried alongside the name because the hotbar picks a slot's icon from it
   * (stage 27h): a name is what the table reads, an id is what code may branch
   * on, and „Karabin szturmowy" is one rename away from silently losing its
   * picture.
   */
  typeId?: string;
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
    ...(weapon.weaponTypeId ? { typeId: weapon.weaponTypeId } : {}),
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

export function isGearEntry(entry: CompendiumEntry): entry is GearEntry {
  return entry.category === 'gear';
}

export function isProgramEntry(entry: CompendiumEntry): entry is ProgramEntry {
  return entry.category === 'program';
}

export function isNetDefenseEntry(entry: CompendiumEntry): entry is NetDefenseEntry {
  return entry.category === 'netDefense';
}

/** Demons only — what the architecture editor may drop on a `demon` floor. */
export function netDemonEntries(entries: readonly CompendiumEntry[]): NetDefenseEntry[] {
  return entries.filter(
    (entry): entry is NetDefenseEntry => isNetDefenseEntry(entry) && entry.defenseKind === 'demon',
  );
}

/** The three defence-system tables — what a control node may be wired to (26d). */
export function netDefenseSystemEntries(entries: readonly CompendiumEntry[]): NetDefenseEntry[] {
  return entries.filter(
    (entry): entry is NetDefenseEntry =>
      isNetDefenseEntry(entry) && isNetDefenseSystem(entry.defenseKind),
  );
}

/** Programs a cyberdeck can hold, catalogue order. */
export function programEntries(entries: readonly CompendiumEntry[]): ProgramEntry[] {
  return entries.filter(isProgramEntry);
}

/** Gear that offers deck slots — the cyberdecks, and whatever the GM invents. */
export function cyberdeckEntries(entries: readonly CompendiumEntry[]): GearEntry[] {
  return entries.filter((entry): entry is GearEntry => isGearEntry(entry) && !!entry.deckSlots);
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
    // Stage 16h. Every flag has to be copied by hand here — the profile is what
    // travels with the shot (`CpredAttackMeta.ammo`), so anything missed at this
    // line is a rule the combat code never sees, however carefully the
    // catalogue row was typed.
    ...(entry.noDamage ? { noDamage: true as const } : {}),
    ...(entry.check ? { check: { ...entry.check, failure: { ...entry.check.failure } } } : {}),
    ...(entry.smoke ? { smoke: { ...entry.smoke } } : {}),
    ...(entry.smart ? { smart: { ...entry.smart } } : {}),
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
