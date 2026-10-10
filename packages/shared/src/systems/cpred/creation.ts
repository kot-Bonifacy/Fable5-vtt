import {
  CPRED_STAT_IDS,
  CPRED_STAT_LABELS,
  CPRED_STAT_MAX,
  CPRED_STAT_MIN,
  type CpredStatId,
  type CpredStats,
} from './stats.js';
import {
  CPRED_LANGUAGE_SKILL_ID,
  CPRED_SPECIALTY_SKILL_IDS,
  ROLE_RANK_MIN,
  SKILL_SPECIALTY_MAX_LENGTH,
  cpredSkillNeedsSpecialty,
  createDefaultCharacterData,
  mergeCharacterData,
  type CpredArmorRow,
  type CpredCharacterData,
  type CpredGearRow,
  type CpredRegistry,
  type CpredValidationIssue,
  type CpredWeaponRow,
} from './character.js';
import { humanityMaxWith } from './cyberware.js';
import { hpMax } from './derived.js';
import {
  clearRoleAnswers,
  createDefaultLifepath,
  validateLifepath,
  type CpredLifepath,
} from './lifepath.js';
import { cpredPurchasedAmmoRow, cpredPutAmmo } from './ammostock.js';
import {
  resolveWeapon,
  toAmmoProfile,
  type CompendiumEntry,
  type CompendiumRegistry,
} from './compendium.js';
import { entryPrice, type CpredLifestyle } from './economy.js';
import { formatEddies } from './pricing.js';
import { CPRED_TEAMWORK_ABILITY } from './roleability.js';
import { purchasedSheetRow, type PurchasedRow } from './shopping.js';
import { creationShopRefusalText, creationShopVerdict, type CreationShopRules } from './shop.js';
import { sanitizeTokenImageUrl } from '../../tokens.js';

/**
 * Character creation (stage 25a) — the mechanical half of the wizard.
 *
 * Everything the rules say lives in `cpred/creation.json` (Role stat templates,
 * Role skill lists, pools and limits) — the sample in `data/public` and the
 * imported set in `data/private` — and is replayed here; this module holds the
 * arithmetic and the refusals, never a table.
 *
 * Two of the book's three methods are implemented, by the GM's decision:
 *
 *  - **Krawędziarz** („Na skróty") rolls 1d10 per stat and reads the value out
 *    of the Role's template column, then spends the skill pool on the twenty
 *    skills that Role lists.
 *  - **Kompletny Pakiet** („Wyliczanie") buys stats out of a point pool and
 *    spends the skill pool on anything at all.
 *
 * **Ulicznik** (templates) is deliberately absent: it is ten pre-made
 * characters rather than a procedure, and belongs with ready-made sheets.
 */

export const CPRED_CREATION_SCHEMA_VERSION = 1;

export const CPRED_CREATION_METHODS = ['edgerunner', 'complete'] as const;
export type CpredCreationMethod = (typeof CPRED_CREATION_METHODS)[number];

/** Polish names of the methods, as the rulebook prints them. */
export const CPRED_CREATION_METHOD_LABELS: Record<CpredCreationMethod, string> = {
  edgerunner: 'Krawędziarz (Na skróty)',
  complete: 'Kompletny Pakiet (Wyliczanie)',
};

export const CPRED_CREATION_STEPS = [
  'role',
  'stats',
  'skills',
  'lifepath',
  'gear',
  'details',
  'summary',
] as const;
export type CpredCreationStep = (typeof CPRED_CREATION_STEPS)[number];

export const CPRED_CREATION_STEP_LABELS: Record<CpredCreationStep, string> = {
  role: 'Rola',
  stats: 'Cechy',
  skills: 'Umiejętności',
  lifepath: 'Ścieżka Życia',
  gear: 'Wyposażenie',
  details: 'Opis',
  summary: 'Podsumowanie',
};

/** Highest 1d10 row a Role template can hold — the roll that reads it. */
export const CPRED_TEMPLATE_ROLLS = 10;

export interface CpredCreationLimits {
  statMin: number;
  statMax: number;
  skillMin: number;
  skillMax: number;
}

/** One „Ranga Postaci" row: how many stat points that kind of character buys. */
export interface CpredCreationRank {
  id: string;
  name: string;
  points: number;
}

export interface CpredCreationRole {
  /** Role id of `roles.json`. */
  id: string;
  /** Ten rows of ten stats, in `statOrder`; empty when the data file has none. */
  statTemplates: number[][];
  /** Skill ids this Role may spend points on (Krawędziarz). */
  skills: string[];
}

/**
 * The free Culture of Origin language (s. 45): one skill row, level 4, costing
 * nothing. *Which* language it is comes from the lifepath table in stage 25b —
 * the sheet has a single „Język" row with nowhere to write the specialisation,
 * so 25a only grants the level.
 */
export interface CpredCreationFreeLanguage {
  skillId: string;
  level: number;
}

/**
 * Starting money (stage 25c, s. 41–42 and s. 98–104).
 *
 * Two methods, two very different opening hands: a Krawędziarz gets the Role's
 * fixed package plus pocket money („Otrzymujesz też 500 ed, które możesz
 * dowolnie wydać teraz lub już w czasie gry"), a Kompletny Pakiet buys
 * everything („Masz 2550 ed… Do tego masz 800 ed do wydania tylko na Modę").
 */
export interface CpredCreationBudgets {
  edgerunner: number;
  complete: number;
  /**
   * The fashion-only half of the Complete Package's money. The VTT has no
   * clothing catalogue, so this number is **shown and not spendable** — a
   * wallet that could buy a rifle with it would be handing out 800 ed.
   */
  fashion: number;
}

/**
 * Wyposażenie Roli gratis dla Kompletnego Pakietu (etap 47a, decyzja MG
 * z 09.10.2026). W cenniku domowym 2550 ed nie starcza na dek i sprzęg,
 * a bez nich Netrunner nie gra swoją Rolą — więc podstawowe narzędzie Roli
 * przychodzi za darmo, a gotówka zostaje na resztę. Wartości są celowo
 * nierówne: ma działać Rola, nie równać się kwota. Krawędziarz tego nie
 * dostaje — jego pakiet Roli dokłada MG w całości.
 */
export interface CpredRoleKit {
  /** Wpisy katalogu, które Rola dostaje zawsze. */
  entries: string[];
  /** Jeden do wyboru (Solo: broń); pusta lista — bez wyboru. */
  choose: string[];
}

/** Parsed `cpred/creation.json`. */
export interface CpredCreationData {
  /** Stat ids in the order the Role templates print their columns. */
  statOrder: CpredStatId[];
  limits: CpredCreationLimits;
  /** Points both methods spend on skills (86 in the core rulebook). */
  skillPoints: number;
  statRanks: CpredCreationRank[];
  defaultStatRankId: string;
  /** Rank the Role's Special Ability starts at (4). */
  roleAbilityStart: number;
  /** Skills every character carries at `limits.skillMin` or better. */
  basicSkills: string[];
  freeLanguage: CpredCreationFreeLanguage | null;
  budgets: CpredCreationBudgets;
  roles: CpredCreationRole[];
  /** Rola → wyposażenie gratis Kompletnego Pakietu (etap 47a); brak Roli — nic. */
  roleKits: Record<string, CpredRoleKit>;
}

export const DEFAULT_CREATION_BUDGETS: CpredCreationBudgets = {
  edgerunner: 500,
  complete: 2550,
  fashion: 800,
};

export const DEFAULT_CREATION_LIMITS: CpredCreationLimits = {
  statMin: 2,
  statMax: 8,
  skillMin: 2,
  skillMax: 6,
};

/**
 * What the creator falls back to with no data file at all: every rule it can
 * state without the book, and no Roles. The wizard then refuses at step one
 * („brak danych tworzenia postaci") instead of building a broken sheet.
 */
export const EMPTY_CPRED_CREATION_DATA: CpredCreationData = {
  statOrder: [...CPRED_STAT_IDS],
  limits: DEFAULT_CREATION_LIMITS,
  skillPoints: 86,
  statRanks: [],
  defaultStatRankId: '',
  roleAbilityStart: ROLE_RANK_MIN,
  basicSkills: [],
  freeLanguage: null,
  budgets: DEFAULT_CREATION_BUDGETS,
  roles: [],
  roleKits: {},
};

export interface CpredCreationDraft {
  schemaVersion: typeof CPRED_CREATION_SCHEMA_VERSION;
  step: CpredCreationStep;
  method: CpredCreationMethod;
  roleId: string | null;
  /** Which „Ranga Postaci" pool pays for the stats (Kompletny Pakiet only). */
  statRankId: string;
  /** Stats chosen or rolled so far; an untouched stat is simply absent. */
  stats: Partial<Record<CpredStatId, number>>;
  /**
   * The 1d10 that produced each stat (Krawędziarz). Kept next to the value so
   * the summary can show what the server rolled, not what the client says.
   */
  statRolls: Partial<Record<CpredStatId, number>>;
  /** skillId → level; a skill left at zero is absent. */
  skills: Record<string, number>;
  /**
   * skillId → the field it was bought in, for the four skills the rulebook
   * makes you name (s. 81). Collected here rather than left to the sheet,
   * because „Nauka 4" without a specialisation is not a finished character —
   * `creationIssues` refuses to finish one.
   */
  skillSpecialties: Record<string, string>;
  /**
   * The Lifepath as it is being filled in (stage 25b) — the same shape the
   * sheet stores, so finishing is a copy rather than a translation.
   */
  lifepath: CpredLifepath;
  name: string;
  /**
   * The basket (stage 25c): catalogue id → how many copies. It is filled by
   * `creation:buy` on the server and **never by a patch** — the prices, the
   * budget and the shop's unlocked tier are all the server's to read, and a
   * client that could write this list would be shopping for free.
   */
  purchases: Record<string, number>;
  /**
   * Wybrany wpis z `CpredRoleKit.choose` (etap 47a, Solo: broń); null — jeszcze
   * nie wybrano albo Rola nie ma wyboru. Znika ze zmianą Roli i metody.
   */
  kitChoice: string | null;
  /**
   * „Ruszam bez zakupów” (etap 48a, decyzja MG z 10.10): gracz świadomie nie
   * kupuje nic. Bez tego pusty koszyk szkicu gracza jest brakiem — żeby nikt
   * nie wyszedł z kreatora z całą gotówką i gołymi rękami, bo zapomniał.
   */
  skipPurchases: boolean;
  /** Uploaded portrait (`/uploads/portraits/…`); copied onto the sheet. */
  portraitUrl: string | null;
  /** Whether finishing also puts a token on the scene. */
  placeToken: boolean;
  /**
   * The basic skills' minimums are granted by the wizard and kept there
   * (naprawa 2a, the GM's decision): every draft that holds `true` has each
   * basic skill its method can buy raised to `limits.skillMin`, with the cost
   * on the bill like any other level. Drafts saved before that repair read
   * back `false` and are left alone until the player accepts the balance —
   * nobody's pool changes on its own when a window opens.
   */
  skillMinimaAuto: boolean;
  /**
   * The GM's terms from the consent (decyzja MG z 24.09). `skillPool` is the
   * skill budget the GM wrote down — a house rule over the book's fixed 86;
   * null means the book's number. `methodFixed` means the GM chose the method
   * and a player's patch cannot change it. Neither ever comes off a patch:
   * only the server writes them, at `creation:start` and `creation:terms`.
   */
  skillPool: number | null;
  methodFixed: boolean;
}

export const CREATION_NAME_MAX_LENGTH = 64;

/** The skill budget the GM may write into a consent (24.09). */
export const CREATION_SKILL_POOL_MIN = 1;
export const CREATION_SKILL_POOL_MAX = 300;

/** Skill points this draft spends: the GM's number, or the book's 86. */
export function creationSkillPool(data: CpredCreationData, draft: CpredCreationDraft): number {
  return draft.skillPool ?? data.skillPoints;
}

export function isCreationSkillPool(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= CREATION_SKILL_POOL_MIN &&
    value <= CREATION_SKILL_POOL_MAX
  );
}

/** How many copies of one catalogue entry the basket may hold. */
export const CREATION_PURCHASE_QTY_MAX = 20;

export function createDefaultCreationDraft(data: CpredCreationData): CpredCreationDraft {
  return {
    schemaVersion: CPRED_CREATION_SCHEMA_VERSION,
    step: 'role',
    method: 'edgerunner',
    roleId: null,
    statRankId: data.defaultStatRankId || (data.statRanks[0]?.id ?? ''),
    stats: {},
    statRolls: {},
    skills: {},
    skillSpecialties: {},
    lifepath: createDefaultLifepath(),
    name: '',
    purchases: {},
    kitChoice: null,
    skipPurchases: false,
    portraitUrl: null,
    // Session zero ends with a figure on the map, so the box starts ticked; a
    // GM building five gangers in an evening unticks it once.
    placeToken: true,
    skillMinimaAuto: true,
    skillPool: null,
    methodFixed: false,
  };
}

// ────────────────────────────── dane wejściowe ──────────────────────────────

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function readLimits(raw: unknown): CpredCreationLimits {
  const input = (raw ?? {}) as Record<string, unknown>;
  const limits = { ...DEFAULT_CREATION_LIMITS };
  for (const key of ['statMin', 'statMax', 'skillMin', 'skillMax'] as const) {
    const value = input[key];
    if (isInteger(value) && value >= 0) limits[key] = value;
  }
  return limits;
}

function readStatOrder(raw: unknown): CpredStatId[] {
  const order = Array.isArray(raw)
    ? raw.filter((id): id is CpredStatId => (CPRED_STAT_IDS as readonly unknown[]).includes(id))
    : [];
  // A partial order would silently mis-read every template column, so anything
  // short of the full ten falls back to the canonical order.
  return order.length === CPRED_STAT_IDS.length ? order : [...CPRED_STAT_IDS];
}

function readTemplates(raw: unknown, width: number): number[][] {
  if (!Array.isArray(raw)) return [];
  const rows = raw.filter(
    (row): row is number[] =>
      Array.isArray(row) &&
      row.length === width &&
      row.every((value) => isInteger(value) && value >= CPRED_STAT_MIN && value <= CPRED_STAT_MAX),
  );
  // Ten rows or none: a half-read table would make „rzuć 1k10" refuse at random.
  return rows.length === CPRED_TEMPLATE_ROLLS ? rows : [];
}

/**
 * Builds the creation data from the raw parsed JSON, dropping malformed rows.
 * Unknown skill ids are dropped here rather than at spend time — a Role list
 * naming a skill the registry has never heard of would leave a row the wizard
 * can show but nobody can buy.
 */
export function buildCreationData(raw: unknown, registry: CpredRegistry): CpredCreationData {
  const input = (raw ?? {}) as Record<string, unknown>;
  const statOrder = readStatOrder(input.statOrder);
  const limits = readLimits(input.limits);
  const knownRoles = registry.roleIds;

  const roles: CpredCreationRole[] = (Array.isArray(input.roles) ? input.roles : [])
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { id?: unknown }).id === 'string',
    )
    .map((entry) => ({
      id: entry.id as string,
      statTemplates: readTemplates(entry.statTemplates, statOrder.length),
      skills: (Array.isArray(entry.skills) ? entry.skills : []).filter(
        (id): id is string => typeof id === 'string' && registry.skillIds.has(id),
      ),
    }))
    .filter((role) => knownRoles.size === 0 || knownRoles.has(role.id));

  const statRanks: CpredCreationRank[] = (Array.isArray(input.statRanks) ? input.statRanks : [])
    .filter(
      (entry): entry is CpredCreationRank =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as CpredCreationRank).id === 'string' &&
        typeof (entry as CpredCreationRank).name === 'string' &&
        isInteger((entry as CpredCreationRank).points),
    )
    .map((entry) => ({ id: entry.id, name: entry.name, points: entry.points }));

  const rawLanguage = input.freeLanguage as { skillId?: unknown; level?: unknown } | null;
  const freeLanguage =
    rawLanguage &&
    typeof rawLanguage.skillId === 'string' &&
    registry.skillIds.has(rawLanguage.skillId) &&
    isInteger(rawLanguage.level)
      ? { skillId: rawLanguage.skillId, level: rawLanguage.level }
      : null;

  return {
    statOrder,
    limits,
    skillPoints: isInteger(input.skillPoints)
      ? input.skillPoints
      : EMPTY_CPRED_CREATION_DATA.skillPoints,
    statRanks,
    defaultStatRankId:
      typeof input.defaultStatRankId === 'string' &&
      statRanks.some((rank) => rank.id === input.defaultStatRankId)
        ? input.defaultStatRankId
        : (statRanks[0]?.id ?? ''),
    roleAbilityStart: isInteger(input.roleAbilityStart) ? input.roleAbilityStart : ROLE_RANK_MIN,
    basicSkills: (Array.isArray(input.basicSkills) ? input.basicSkills : []).filter(
      (id): id is string => typeof id === 'string' && registry.skillIds.has(id),
    ),
    freeLanguage,
    budgets: readBudgets(input.budgets),
    roles,
    roleKits: readRoleKits(input.roleKits, roles),
  };
}

/**
 * `roleKits` z pliku danych. Id wpisów nie sprawdza się tu z katalogiem — ten
 * jest osobnym rejestrem; `creationRoleKit` pomija to, czego katalog nie zna.
 */
function readRoleKits(
  raw: unknown,
  roles: readonly CpredCreationRole[],
): Record<string, CpredRoleKit> {
  if (typeof raw !== 'object' || raw === null) return {};
  const ids = (value: unknown): string[] =>
    Array.isArray(value)
      ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))]
      : [];
  const kits: Record<string, CpredRoleKit> = {};
  for (const [roleId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!roles.some((role) => role.id === roleId)) continue;
    if (typeof value !== 'object' || value === null) continue;
    const input = value as Record<string, unknown>;
    const kit = { entries: ids(input.entries), choose: ids(input.choose) };
    if (kit.entries.length > 0 || kit.choose.length > 0) kits[roleId] = kit;
  }
  return kits;
}

function readBudgets(raw: unknown): CpredCreationBudgets {
  const input = (raw ?? {}) as Record<string, unknown>;
  const budgets = { ...DEFAULT_CREATION_BUDGETS };
  for (const key of ['edgerunner', 'complete', 'fashion'] as const) {
    const value = input[key];
    if (isInteger(value) && value >= 0) budgets[key] = value;
  }
  return budgets;
}

/** Attaches parsed creation data to a registry built by `buildCpredRegistry`. */
export function withCreationData(registry: CpredRegistry, raw: unknown): CpredRegistry {
  return { ...registry, creation: buildCreationData(raw, registry) };
}

/** The registry's creation data, or the empty set that refuses politely. */
export function creationDataOf(registry: CpredRegistry): CpredCreationData {
  return registry.creation ?? EMPTY_CPRED_CREATION_DATA;
}

// ──────────────────────────────── rachunki ────────────────────────────────

export function creationRole(
  data: CpredCreationData,
  roleId: string | null,
): CpredCreationRole | null {
  if (roleId === null) return null;
  return data.roles.find((role) => role.id === roleId) ?? null;
}

/** Stat points the chosen rank pays out (Kompletny Pakiet). */
export function creationStatPool(data: CpredCreationData, draft: CpredCreationDraft): number {
  const rank = data.statRanks.find((entry) => entry.id === draft.statRankId);
  return rank?.points ?? 0;
}

/** Buying a stat costs its value — „Rozdziel punkty Cech między dziesięć Cech". */
export function creationStatPointsSpent(draft: CpredCreationDraft): number {
  return CPRED_STAT_IDS.reduce((sum, id) => sum + (draft.stats[id] ?? 0), 0);
}

/**
 * Raising a skill costs one point per level, two for the (×2) skills. The free
 * Culture of Origin language is not on this bill.
 */
export function creationSkillCost(
  skillId: string,
  level: number,
  data: CpredCreationData,
  registry: CpredRegistry,
): number {
  if (data.freeLanguage?.skillId === skillId) return 0;
  const multiplier = registry.skills.find((skill) => skill.id === skillId)?.multiplier ?? 1;
  return level * multiplier;
}

/** One source for method-specific minimums, the free grant and the ceiling. */
export function creationSkillLimits(
  draft: CpredCreationDraft,
  data: CpredCreationData,
  skillId: string,
): { min: number; max: number; free: boolean } {
  if (data.freeLanguage?.skillId === skillId) {
    return { min: data.freeLanguage.level, max: data.freeLanguage.level, free: true };
  }
  return {
    min:
      data.basicSkills.includes(skillId) || draft.method === 'edgerunner'
        ? data.limits.skillMin
        : 1,
    max: data.limits.skillMax,
    free: false,
  };
}

/** The free language is a grant, including in drafts saved before this repair. */
export function creationSkillLevel(
  draft: CpredCreationDraft,
  data: CpredCreationData,
  skillId: string,
): number {
  return data.freeLanguage?.skillId === skillId
    ? data.freeLanguage.level
    : (draft.skills[skillId] ?? 0);
}

/**
 * Points still owed on the free language's row. The sheet keeps a single
 * „Język" entry, so the basic Język (slang uliczny) shares it with the free
 * Culture of Origin language. The grant is free (s. 45); the slang's basic
 * minimum is not — s. 90 pays 2 for it and leaves Jay 60 of 86 after the
 * thirteen basics. Without this charge the shared row saved every character
 * two points. Zero when the free language is not a basic skill in the data.
 */
export function creationFreeLanguageCharge(
  data: CpredCreationData,
  registry: CpredRegistry,
): number {
  const skillId = data.freeLanguage?.skillId;
  if (!skillId || !data.basicSkills.includes(skillId)) return 0;
  const multiplier = registry.skills.find((skill) => skill.id === skillId)?.multiplier ?? 1;
  return data.limits.skillMin * multiplier;
}

export function creationSkillPointsSpent(
  draft: CpredCreationDraft,
  data: CpredCreationData,
  registry: CpredRegistry,
): number {
  return Object.entries(draft.skills).reduce(
    (sum, [skillId, level]) => sum + creationSkillCost(skillId, level, data, registry),
    creationFreeLanguageCharge(data, registry),
  );
}

/** A basic skill still short of its minimum, and what raising it costs. */
export interface CpredCreationMinimum {
  skillId: string;
  level: number;
  min: number;
  cost: number;
}

/**
 * Basic skills the draft's method can buy that sit below the minimum. The free
 * language is not among them: its row is granted at 4 and its slang minimum is
 * already on the bill through `creationFreeLanguageCharge`.
 */
export function creationMissingSkillMinima(
  draft: CpredCreationDraft,
  data: CpredCreationData,
  registry: CpredRegistry,
): CpredCreationMinimum[] {
  const allowed = new Set(creationAvailableSkills(draft, data, registry));
  const missing: CpredCreationMinimum[] = [];
  for (const skillId of data.basicSkills) {
    if (skillId === data.freeLanguage?.skillId || !allowed.has(skillId)) continue;
    const level = draft.skills[skillId] ?? 0;
    const min = data.limits.skillMin;
    if (level >= min) continue;
    const cost =
      creationSkillCost(skillId, min, data, registry) -
      creationSkillCost(skillId, level, data, registry);
    missing.push({ skillId, level, min, cost });
  }
  return missing;
}

/** Raises every missing minimum; never lowers a level somebody chose. */
export function creationWithSkillMinima(
  draft: CpredCreationDraft,
  data: CpredCreationData,
  registry: CpredRegistry,
): CpredCreationDraft {
  const missing = creationMissingSkillMinima(draft, data, registry);
  if (missing.length === 0) return draft;
  const skills = { ...draft.skills };
  for (const row of missing) skills[row.skillId] = row.min;
  return { ...draft, skills };
}

/** Everything one skill row of the wizard shows, computed in one place. */
export interface CpredCreationSkillRow {
  skillId: string;
  /** Level on the draft; the free language shows its grant. */
  level: number;
  /** Lowest legal level once the skill is taken. */
  min: number;
  max: number;
  /** The free Culture of Origin language — no buttons, its own card. */
  free: boolean;
  /** A book requirement: every character carries it at `min` or better. */
  basic: boolean;
  /**
   * On the chosen Role's list. For Krawędziarz that *is* the list; for
   * Kompletny Pakiet it is only a hint of what the Role usually knows.
   */
  roleListed: boolean;
  multiplier: number;
  /** Points this row puts on the bill. */
  cost: number;
  /** Points still owed before the row is legal. */
  missingPoints: number;
  /** The linked stat, `null` until it is set or rolled. */
  statValue: number | null;
  /** Stat + level, the base every Check of this skill adds 1d10 to. */
  checkBase: number | null;
  /** Level after „+" / „−", or `null` when the button has nothing to do. */
  up: number | null;
  down: number | null;
}

export function creationSkillRow(
  draft: CpredCreationDraft,
  data: CpredCreationData,
  registry: CpredRegistry,
  skillId: string,
): CpredCreationSkillRow {
  const skill = registry.skills.find((entry) => entry.id === skillId);
  const limits = creationSkillLimits(draft, data, skillId);
  const basic = data.basicSkills.includes(skillId);
  const multiplier = skill?.multiplier ?? 1;
  const level = limits.free ? limits.min : (draft.skills[skillId] ?? 0);
  const role = creationRole(data, draft.roleId);
  const statValue = skill ? (draft.stats[skill.stat] ?? null) : null;

  let missingPoints = 0;
  if (!limits.free && (basic || level > 0) && level < limits.min) {
    missingPoints = (limits.min - level) * multiplier;
  }

  // Level 1 of a skill whose minimum is 2 is never a legal stop, so the
  // buttons step over it: „+" from nothing buys the minimum at once and „−"
  // from the minimum gives the skill up. A basic skill cannot be given up.
  let up: number | null = null;
  let down: number | null = null;
  if (!limits.free) {
    if (level < limits.max) up = level < limits.min ? limits.min : level + 1;
    if (level > 0) {
      if (basic) down = level > limits.min ? level - 1 : null;
      else down = level - 1 < limits.min ? 0 : level - 1;
    }
  }

  return {
    skillId,
    level,
    min: limits.min,
    max: limits.max,
    free: limits.free,
    basic,
    roleListed: role?.skills.includes(skillId) ?? false,
    multiplier,
    cost: limits.free
      ? creationFreeLanguageCharge(data, registry)
      : creationSkillCost(skillId, level, data, registry),
    missingPoints,
    statValue,
    checkBase: statValue === null ? null : statValue + level,
    up,
    down,
  };
}

/**
 * The wizard step where an issue from `creationIssues` is fixed — the summary
 * sends the player there, and the step tabs count what is still open.
 */
export function creationIssueStep(field: string): CpredCreationStep {
  const head = field.split('.')[0];
  switch (head) {
    case 'roleId':
      return 'role';
    case 'statRankId':
    case 'stats':
      return 'stats';
    case 'skills':
    case 'skillSpecialties':
      return 'skills';
    case 'lifepath':
      return 'lifepath';
    case 'purchases':
    case 'kitChoice':
      return 'gear';
    case 'name':
      return 'details';
    default:
      return 'summary';
  }
}

/**
 * Skills the current method lets the draft spend on. Krawędziarz is held to the
 * Role's twenty; Kompletny Pakiet may buy anything the registry knows.
 */
export function creationAvailableSkills(
  draft: CpredCreationDraft,
  data: CpredCreationData,
  registry: CpredRegistry,
): string[] {
  if (draft.method === 'complete') return registry.skills.map((skill) => skill.id);
  const role = creationRole(data, draft.roleId);
  return role ? role.skills : [];
}

/** The stat a 1d10 reads out of the Role's template column. */
export function creationTemplateStat(
  role: CpredCreationRole,
  data: CpredCreationData,
  statId: CpredStatId,
  roll: number,
): number | null {
  const row = role.statTemplates[roll - 1];
  const column = data.statOrder.indexOf(statId);
  if (!row || column === -1) return null;
  return row[column] ?? null;
}

/* ─────────────────────────── wyposażenie startowe ─────────────────────────── */

/** One line of the basket, priced from the catalogue the server holds. */
export interface CpredCreationPurchase {
  /** Klucz koszyka — id wpisu, a dla amunicji `id@typ broni` (`creationBasketKey`). */
  entryId: string;
  name: string;
  /** Sztuki — a dla amunicji paczki (s. 344: 10 naboi albo 1 granat). */
  qty: number;
  /** Price of one copy. */
  price: number;
  total: number;
}

/**
 * Klucz koszyka (etap 46c). Zwykły towar to id wpisu, a amunicja — id wpisu
 * i typu broni, który wyznacza kaliber: „przeciwpancerna do pistoletu”
 * i „przeciwpancerna do karabinu” to dwa wiersze koszyka i dwa pudełka.
 */
export function creationBasketKey(entryId: string, weaponTypeId?: string | null): string {
  return weaponTypeId ? `${entryId}@${weaponTypeId}` : entryId;
}

/** Odwrotność `creationBasketKey`. */
export function creationBasketEntry(key: string): { entryId: string; weaponTypeId: string | null } {
  const at = key.indexOf('@');
  return at === -1
    ? { entryId: key, weaponTypeId: null }
    : { entryId: key.slice(0, at), weaponTypeId: key.slice(at + 1) || null };
}

/** Eddies this method starts with — the shopping money, without the fashion half. */
export function creationBudget(data: CpredCreationData, draft: CpredCreationDraft): number {
  return draft.method === 'complete' ? data.budgets.complete : data.budgets.edgerunner;
}

/**
 * The basket as lines, in catalogue order of whatever the lookup hands back.
 * An entry the catalogue no longer knows, or one that lost its price, is
 * dropped: the wizard must not bill for a row it cannot show.
 */
export function creationPurchases(
  draft: CpredCreationDraft,
  lookup: (entryId: string) => CompendiumEntry | undefined,
  /** Typy broni — wtedy wiersz amunicji mówi kaliber („… · C. Pistolet”). */
  weaponTypeById?: CompendiumRegistry['weaponTypeById'],
): CpredCreationPurchase[] {
  const lines: CpredCreationPurchase[] = [];
  for (const [key, qty] of Object.entries(draft.purchases)) {
    if (!isInteger(qty) || qty <= 0) continue;
    const { entryId, weaponTypeId } = creationBasketEntry(key);
    const entry = lookup(entryId);
    if (!entry) continue;
    // Amunicja bez kalibru nie jest towarem (`AMMO_CALIBRE_REQUIRED`).
    if ((entry.category === 'ammo') !== (weaponTypeId !== null)) continue;
    const price = entryPrice(entry);
    if (price === null) continue;
    const calibre = weaponTypeId ? weaponTypeById?.get(weaponTypeId)?.ammunition : undefined;
    const name = calibre ? `${entry.name} · ${calibre}` : entry.name;
    lines.push({ entryId: key, name, qty, price, total: price * qty });
  }
  return lines;
}

export function creationSpentEddies(lines: readonly CpredCreationPurchase[]): number {
  return lines.reduce((sum, line) => sum + line.total, 0);
}

/** Jedna rzecz z wyposażenia Roli gratis (etap 47a). */
export interface CpredCreationKitLine {
  entryId: string;
  name: string;
  /** Cena w sklepie — ile Rola dostaje za darmo; null, gdy wpis jej nie ma. */
  value: number | null;
  /**
   * Czy „Utwórz postać” kładzie to na kartę. Chrom nie: kreator nie montuje
   * cyborgizacji (Utratę Człowieczeństwa losuje montaż), więc wszczepia go MG
   * w Kompendium („Dodaj za darmo”) — mówi o tym `creationLeftOutside`.
   */
  onSheet: boolean;
}

/** Wyposażenie gratis tej Roli, gdy szkic jest Kompletnym Pakietem; inaczej null. */
export function creationRoleKitOf(
  draft: Pick<CpredCreationDraft, 'method' | 'roleId'>,
  data: Pick<CpredCreationData, 'roleKits'>,
): CpredRoleKit | null {
  if (draft.method !== 'complete' || draft.roleId === null) return null;
  return data.roleKits[draft.roleId] ?? null;
}

function kitLine(entry: CompendiumEntry): CpredCreationKitLine {
  return {
    entryId: entry.id,
    name: entry.name,
    value: entryPrice(entry),
    onSheet: entry.category !== 'cyberware' && purchasedSheetRow(entry, null, 'probe') !== null,
  };
}

/** Lista „do wyboru” wyposażenia Roli — to, co katalog zna. */
export function creationRoleKitChoices(
  draft: Pick<CpredCreationDraft, 'method' | 'roleId'>,
  data: Pick<CpredCreationData, 'roleKits'>,
  lookup: (entryId: string) => CompendiumEntry | undefined,
): CpredCreationKitLine[] {
  const kit = creationRoleKitOf(draft, data);
  if (!kit) return [];
  return kit.choose
    .map((id) => lookup(id))
    .filter((entry): entry is CompendiumEntry => entry !== undefined)
    .map(kitLine);
}

/**
 * Co Rola dostaje za darmo: stałe wpisy i wybrany z listy. Wpis, którego
 * katalog nie zna, znika po cichu — jak wiersz koszyka w `creationPurchases`.
 */
export function creationRoleKit(
  draft: Pick<CpredCreationDraft, 'method' | 'roleId' | 'kitChoice'>,
  data: Pick<CpredCreationData, 'roleKits'>,
  lookup: (entryId: string) => CompendiumEntry | undefined,
): CpredCreationKitLine[] {
  const kit = creationRoleKitOf(draft, data);
  if (!kit) return [];
  const ids = [...kit.entries];
  if (draft.kitChoice !== null && kit.choose.includes(draft.kitChoice)) ids.push(draft.kitChoice);
  return ids
    .map((id) => lookup(id))
    .filter((entry): entry is CompendiumEntry => entry !== undefined)
    .map(kitLine);
}

/**
 * Wiersze karty z wyposażenia Roli — jedno źródło dla `creationOutcome`
 * i `creation:finish`, tak jak `purchasedSheetRow` dla koszyka.
 */
export function creationKitSheetRows(
  lines: readonly CpredCreationKitLine[],
  lookup: (entryId: string) => CompendiumEntry | undefined,
  compendium: Pick<CompendiumRegistry, 'weaponTypeById'>,
  nextRowId: () => string,
): PurchasedRow[] {
  const rows: PurchasedRow[] = [];
  for (const line of lines) {
    if (!line.onSheet) continue;
    const entry = lookup(line.entryId);
    if (!entry) continue;
    const resolved = entry.category === 'weapon' ? resolveWeapon(entry, compendium) : null;
    const row = purchasedSheetRow(entry, resolved, nextRowId());
    if (row) rows.push(row);
  }
  return rows;
}

/** Derived values the wizard shows while the stats are still moving. */
export interface CpredCreationPreview {
  hpMax: number;
  seriousWound: number;
  deathSave: number;
  humanity: number;
}

export function creationPreview(stats: CpredStats): CpredCreationPreview {
  const max = hpMax(stats);
  return {
    hpMax: max,
    seriousWound: Math.ceil(max / 2),
    deathSave: stats.body,
    humanity: humanityMaxWith(stats, []),
  };
}

/** Fills the gaps of a half-finished draft so the preview always has ten stats. */
export function creationStats(draft: CpredCreationDraft, data: CpredCreationData): CpredStats {
  const stats = {} as CpredStats;
  for (const id of CPRED_STAT_IDS) stats[id] = draft.stats[id] ?? data.limits.statMin;
  return stats;
}

// ─────────────────────────────── walidacja ───────────────────────────────

function issue(field: string, message: string): CpredValidationIssue {
  return { field, message };
}

/**
 * Everything standing between the draft and a finished sheet, in Polish and in
 * the order the wizard walks. An empty list means „Utwórz postać" may fire.
 */
export function creationIssues(
  draft: CpredCreationDraft,
  data: CpredCreationData,
  registry: CpredRegistry,
  /**
   * Catalogue lookup for the basket (stage 25c). Optional because the wizard's
   * first four steps have nothing to do with shopping — and because a caller
   * without a catalogue must not be told the basket is empty when it is not.
   */
  lookup?: (entryId: string) => CompendiumEntry | undefined,
  /**
   * Availability rules (naprawa 3b). With them a basket row the creator's shelf
   * no longer carries — the GM moved it up, or it was bought under the old
   * price ladder — is an issue; without them only a missing entry is.
   */
  shopRules?: CreationShopRules,
  /**
   * Etap 48a: przypomnienie o zakupach dotyczy szkicu **gracza** — MG robiący
   * pięciu NPC-ów w jeden wieczór nie odhacza „Ruszam bez zakupów” pięć razy.
   */
  options: { requirePurchases?: boolean } = {},
): CpredValidationIssue[] {
  const issues: CpredValidationIssue[] = [];
  const role = creationRole(data, draft.roleId);
  if (role === null) {
    issues.push(issue('roleId', 'Wybierz Rolę.'));
  }

  for (const id of CPRED_STAT_IDS) {
    const value = draft.stats[id];
    if (value === undefined) {
      issues.push(
        issue(`stats.${id}`, `Cecha ${CPRED_STAT_LABELS[id].name} nie została ustalona.`),
      );
      continue;
    }
    if (!isInteger(value) || value < data.limits.statMin || value > data.limits.statMax) {
      issues.push(
        issue(
          `stats.${id}`,
          `Cecha ${CPRED_STAT_LABELS[id].name} musi mieścić się w przedziale ${data.limits.statMin}–${data.limits.statMax}.`,
        ),
      );
    }
  }

  if (draft.method === 'complete') {
    const pool = creationStatPool(data, draft);
    const spent = creationStatPointsSpent(draft);
    if (spent !== pool) {
      issues.push(
        issue(
          'stats',
          `Punkty Cech: wydane ${spent} z ${pool}. Pozostało: ${pool - spent}. Rozdziel całą pulę.`,
        ),
      );
    }
  }

  const allowed = new Set(creationAvailableSkills(draft, data, registry));
  const names = new Map(registry.skills.map((skill) => [skill.id, skill.name]));
  for (const [skillId, level] of Object.entries(draft.skills)) {
    const name = names.get(skillId) ?? skillId;
    if (!registry.skillIds.has(skillId)) {
      issues.push(issue(`skills.${skillId}`, `Nieznana umiejętność: ${skillId}.`));
      continue;
    }
    if (!allowed.has(skillId) && data.freeLanguage?.skillId !== skillId) {
      issues.push(issue(`skills.${skillId}`, `Umiejętność ${name} nie należy do listy tej Roli.`));
    }
    const limits = creationSkillLimits(draft, data, skillId);
    if (!isInteger(level) || (!limits.free && level < limits.min) || level > limits.max) {
      issues.push(
        issue(
          `skills.${skillId}`,
          `Umiejętność ${name} musi mieścić się w przedziale ${limits.min}–${limits.max}.`,
        ),
      );
    }
  }

  // „Zawsze, gdy podnosisz tę Umiejętność, musisz wybrać, którą specjalizację
  // rozwijasz" (s. 81). Do 22.08 kreator zapisywał „Nauka 4" i nie pytał w czym,
  // a karta nie miała gdzie tego trzymać — teraz ma i nie skończy bez odpowiedzi.
  //
  // Dwa wyjątki, oba świadome:
  //  - **Język** ma swoją nazwę przy kulturze pochodzenia od 25b;
  //  - **umiejętność podstawowa** (Wiedza lokalna jest na liście każdej Roli)
  //    nie blokuje. Podstawowej się nie kupuje — dostaje ją każda postać, więc
  //    wymóg wpisania obszaru byłby podatkiem od **każdego** NPC-a, a ten etap
  //    trzyma ścieżkę „pięciu NPC-ów w jeden wieczór" tak krótką, jak była
  //    w 25a. Pole i tak stoi w kreatorze i na karcie — tylko nie zatrzymuje.
  for (const skillId of CPRED_SPECIALTY_SKILL_IDS) {
    const level = draft.skills[skillId] ?? 0;
    if (level <= 0) continue;
    if (data.basicSkills.includes(skillId)) continue;
    if ((draft.skillSpecialties[skillId] ?? '').trim()) continue;
    const name = names.get(skillId) ?? skillId;
    issues.push(
      issue(
        `skillSpecialties.${skillId}`,
        `Umiejętność ${name} wymaga wyboru — wpisz, w czym postać się specjalizuje.`,
      ),
    );
  }

  for (const skillId of data.basicSkills) {
    const level = creationSkillLevel(draft, data, skillId);
    if (level < data.limits.skillMin) {
      const name = names.get(skillId) ?? skillId;
      issues.push(
        issue(
          `skills.${skillId}`,
          `Umiejętność podstawowa ${name} musi być co najmniej na poziomie ${data.limits.skillMin}.`,
        ),
      );
    }
  }

  const spent = creationSkillPointsSpent(draft, data, registry);
  const skillPool = creationSkillPool(data, draft);
  if (spent !== skillPool) {
    issues.push(
      issue(
        'skills',
        `Punkty umiejętności: wydane ${spent} z ${skillPool}. Pozostało: ${skillPool - spent}. Rozdziel całą pulę.`,
      ),
    );
  }
  if (data.freeLanguage && !draft.lifepath.language.trim()) {
    issues.push(
      issue('lifepath.language', 'Wybierz język ojczysty — darmowy język kultury pochodzenia.'),
    );
  }

  const kit = creationRoleKitOf(draft, data);
  if (
    kit &&
    kit.choose.length > 0 &&
    (draft.kitChoice === null || !kit.choose.includes(draft.kitChoice))
  ) {
    issues.push(issue('kitChoice', 'Wybierz broń z wyposażenia Roli — dostajesz ją za darmo.'));
  }

  if (lookup) {
    for (const key of Object.keys(draft.purchases)) {
      const entry = lookup(creationBasketEntry(key).entryId);
      if (!entry || entryPrice(entry) === null) {
        issues.push(
          issue(
            'purchases',
            'Przedmiot z koszyka nie jest już dostępny lub nie ma ceny. Usuń go z koszyka.',
          ),
        );
        continue;
      }
      if (!shopRules) continue;
      const shelf = creationShopVerdict(entry, draft.roleId, shopRules);
      if (!shelf.allowed) {
        issues.push(
          issue(
            'purchases',
            `${entry.name}: ${creationShopRefusalText(shelf.tier, shelf.roleTool)} Usuń z koszyka.`,
          ),
        );
      }
    }
    const budget = creationBudget(data, draft);
    const spentEddies = creationSpentEddies(creationPurchases(draft, lookup));
    if (
      options.requirePurchases &&
      !draft.skipPurchases &&
      Object.keys(draft.purchases).length === 0
    ) {
      issues.push(
        issue(
          'purchases',
          `Nic nie kupiono — cała gotówka (${formatEddies(budget)} ed) zostaje w kieszeni. Zrób zakupy albo zaznacz „Ruszam bez zakupów”.`,
        ),
      );
    }
    if (spentEddies > budget) {
      issues.push(
        issue(
          'purchases',
          `Zakupy startowe: wydane ${formatEddies(spentEddies)} z ${formatEddies(budget)} ed.`,
        ),
      );
    }
  }

  const name = draft.name.trim();
  if (name.length === 0) {
    issues.push(issue('name', 'Wpisz imię postaci.'));
  } else if (name.length > CREATION_NAME_MAX_LENGTH) {
    issues.push(
      issue('name', `Imię postaci może mieć najwyżej ${CREATION_NAME_MAX_LENGTH} znaków.`),
    );
  }

  return issues;
}

// ────────────────────────────── łatka szkicu ──────────────────────────────

/**
 * Merges a client patch into the stored draft.
 *
 * Two things here are integrity, not tidiness:
 *
 *  - **A Krawędziarz's stats never come off a patch.** They are read out of the
 *    Role template by `creation:roll` on the server; a client that could write
 *    them would be rolling its own dice. Kompletny Pakiet buys its stats, so
 *    there the patch is the only way in — and the pool is checked at the end.
 *  - **Changing the Role or the method wipes what it invalidates** — a skill
 *    bought off one Role's list is not on another's — **but never the dice.**
 *    A player rolls each stat once (decyzja MG z 24.09), so the faces in
 *    `statRolls` outlive every Role and method change and a Krawędziarz's
 *    stats are re-read from them off the current Role's template. Wiping them
 *    would make „change the Role and back" a free re-roll.
 */
export function mergeCreationDraft(
  current: CpredCreationDraft,
  patch: Record<string, unknown>,
  data: CpredCreationData,
  registry: CpredRegistry,
  /**
   * The basket's catalogue and shelf rules (naprawa 3b). A Role change takes
   * off the previous Role's tools — only when these are given, because a caller
   * without a catalogue cannot tell a medbag from a flashlight.
   */
  shop?: CreationShopContext,
): CpredCreationDraft | null {
  const next: CpredCreationDraft = {
    ...current,
    stats: { ...current.stats },
    statRolls: { ...current.statRolls },
    skills: { ...current.skills },
    skillSpecialties: { ...current.skillSpecialties },
    purchases: { ...current.purchases },
  };

  // The basket is the server's ledger, not a form field — see `purchases`.
  if ('purchases' in patch) return null;
  // The GM's terms (24.09) are written by the server alone.
  if ('skillPool' in patch || 'methodFixed' in patch) return null;

  if ('step' in patch) {
    const step = patch.step;
    if (!isCreationStep(step)) return null;
    next.step = step;
  }
  if ('method' in patch) {
    const method = patch.method;
    if (!isCreationMethod(method)) return null;
    // The GM chose the method with the consent (24.09); only `creation:terms`
    // changes it, and it unfixes the draft for that one merge.
    if (current.methodFixed && method !== current.method) return null;
    if (method !== current.method) {
      next.stats = {};
      // The two methods shop with different money (500 vs 2550 ed), so a basket
      // filled under one of them is not a bill the other agreed to.
      next.purchases = {};
      // Wyposażenie Roli gratis ma tylko Kompletny Pakiet (etap 47a).
      next.kitChoice = null;
    }
    next.method = method;
  }
  if ('roleId' in patch) {
    const roleId = patch.roleId;
    if (roleId !== null && typeof roleId !== 'string') return null;
    if (roleId !== null && creationRole(data, roleId) === null) return null;
    if (roleId !== current.roleId) {
      next.stats = {};
      // „Jakim rodzajem Solo jesteś?" means nothing on a Netrunner's sheet, so
      // the Role's own Lifepath answers go with the Role. The general half —
      // culture, family, enemies — is the character's and stays.
      next.lifepath = clearRoleAnswers(next.lifepath);
      // A Medyk's medbag is not a Solo's to buy at session zero (naprawa 3b).
      if (shop) next.purchases = creationBasketForRole(next.purchases, roleId, shop);
      // Strzelba Solo nie jest wyborem Medyka (etap 47a).
      next.kitChoice = null;
    }
    next.roleId = roleId;
  }
  if ('kitChoice' in patch) {
    const choice = patch.kitChoice;
    if (choice !== null) {
      if (typeof choice !== 'string' || next.method !== 'complete' || next.roleId === null) {
        return null;
      }
      if (!(data.roleKits[next.roleId]?.choose ?? []).includes(choice)) return null;
    }
    next.kitChoice = choice ?? null;
  }
  if ('statRankId' in patch) {
    const rankId = patch.statRankId;
    if (typeof rankId !== 'string' || !data.statRanks.some((rank) => rank.id === rankId)) {
      return null;
    }
    next.statRankId = rankId;
  }
  if ('stats' in patch) {
    // Krawędziarz rolls; only Kompletny Pakiet writes its own numbers.
    if (next.method !== 'complete') return null;
    const stats = readStatPatch(patch.stats, data);
    if (stats === null) return null;
    next.stats = stats;
  }
  if ('skills' in patch) {
    const skills = readSkillPatch(patch.skills, data, registry);
    if (skills === null) return null;
    next.skills = skills;
  }
  if ('skillSpecialties' in patch) {
    const specialties = readSkillSpecialties(patch.skillSpecialties, registry);
    if (specialties === null) return null;
    next.skillSpecialties = specialties;
  }
  if ('lifepath' in patch) {
    // Every Lifepath field is prose the player may rewrite („odpowiednio zmień
    // wynik", s. 44), so the patch is cleaned rather than refused. What the
    // *server* rolls comes in through `creation:lifepath-roll`, not through here.
    next.lifepath = validateLifepath(patch.lifepath, []);
  }
  if ('name' in patch) {
    if (typeof patch.name !== 'string') return null;
    next.name = patch.name.slice(0, CREATION_NAME_MAX_LENGTH);
  }
  if ('portraitUrl' in patch) {
    // Same rule as a sheet's portrait (stage 07): a local upload path or
    // nothing at all — never a URL somebody else's server can serve.
    const portraitUrl = sanitizeTokenImageUrl(patch.portraitUrl ?? null);
    if (portraitUrl === undefined) return null;
    next.portraitUrl = portraitUrl;
  }
  if ('placeToken' in patch) {
    if (typeof patch.placeToken !== 'boolean') return null;
    next.placeToken = patch.placeToken;
  }
  if ('skipPurchases' in patch) {
    if (typeof patch.skipPurchases !== 'boolean') return null;
    next.skipPurchases = patch.skipPurchases;
  }
  if ('skillMinimaAuto' in patch) {
    // An older draft accepts the balance once; switching it back off would
    // only let a basic skill slip below the floor the finish refuses anyway.
    if (patch.skillMinimaAuto !== true) return null;
    next.skillMinimaAuto = true;
  }

  // A Krawędziarz's stats are a pure function of the Role and the dice, so a
  // Role or method change reads them again instead of losing them.
  if (
    next.method === 'edgerunner' &&
    (next.method !== current.method || next.roleId !== current.roleId)
  ) {
    next.stats = creationRolledStats(next, data);
  }

  // A Role or method change may have orphaned skills; drop them rather than
  // leave the wizard showing a bill for rows it no longer displays.
  const allowed = new Set(creationAvailableSkills(next, data, registry));
  next.skills = Object.fromEntries(
    Object.entries(next.skills).filter(([skillId]) => allowed.has(skillId)),
  );
  // After the filter: a Krawędziarz gets his minimums the moment a Role gives
  // him a list, and no patch can take a basic skill under the floor.
  return next.skillMinimaAuto ? creationWithSkillMinima(next, data, registry) : next;
}

/** Catalogue and shelf rules for the starting basket (naprawa 3b). */
export interface CreationShopContext {
  lookup: (entryId: string) => CompendiumEntry | undefined;
  rules: CreationShopRules;
}

/**
 * The basket a draft of this Role may keep: rows off another Role's tool list
 * go. A row the catalogue does not know stays — `creationIssues` already asks
 * the player to take it out, and silently dropping it would hide the reason.
 */
export function creationBasketForRole(
  purchases: Readonly<Record<string, number>>,
  roleId: string | null,
  shop: CreationShopContext,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(purchases).filter(([key]) => {
      const entry = shop.lookup(creationBasketEntry(key).entryId);
      return !entry || creationShopVerdict(entry, roleId, shop.rules).allowed;
    }),
  );
}

/** What changing the Role or the method would do to a draft (naprawa 2b). */
export interface CpredCreationChangeEffect {
  /** One line per kind of thing that goes; empty means nothing is lost. */
  lost: string[];
  /** Consequences that take nothing away: new minimums, levels to fix, money. */
  notes: string[];
}

/** An answer shortened for a list line; the whole text is on the sheet. */
function shortAnswer(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length > 48 ? `${clean.slice(0, 47)}…` : clean;
}

/**
 * Lists what a Role or method change takes off the draft, read off the same
 * `mergeCreationDraft` the server applies — so the wizard's warning cannot
 * promise less than the write does. The wizard asks only when `lost` is not
 * empty; `notes` ride along in the same window.
 */
export function creationChangeEffect(
  current: CpredCreationDraft,
  patch: { method?: CpredCreationMethod; roleId?: string | null },
  data: CpredCreationData,
  registry: CpredRegistry,
  lookup?: (entryId: string) => CompendiumEntry | undefined,
  shopRules?: CreationShopRules,
): CpredCreationChangeEffect {
  const lost: string[] = [];
  const notes: string[] = [];
  const next = mergeCreationDraft(
    current,
    patch,
    data,
    registry,
    lookup && shopRules ? { lookup, rules: shopRules } : undefined,
  );
  if (next === null) return { lost, notes };
  const names = new Map(registry.skills.map((skill) => [skill.id, skill.name]));
  const nameOf = (skillId: string) => names.get(skillId) ?? skillId;

  const statList = (ids: readonly CpredStatId[], stats: Partial<Record<CpredStatId, number>>) =>
    ids.map((id) => `${CPRED_STAT_LABELS[id].abbr} ${stats[id]}`).join(' · ');
  if (current.method === 'complete') {
    // Typed points are the only stats a change can really take away.
    const typed = CPRED_STAT_IDS.filter(
      (id) => current.stats[id] !== undefined && next.stats[id] !== current.stats[id],
    );
    if (typed.length > 0 && next.method !== 'complete') {
      lost.push(`Rozdzielone Cechy (${typed.length}): ${statList(typed, current.stats)}.`);
    }
  } else {
    // The dice stay in the draft whatever happens (decyzja MG z 24.09), so a
    // Krawędziarz loses nothing — the stats are hidden or read off another
    // template, and the note says which.
    const rolled = CPRED_STAT_IDS.filter((id) => current.statRolls[id] !== undefined);
    if (rolled.length > 0 && next.method !== 'edgerunner') {
      notes.push(
        `Wylosowane Cechy znikną z widoku, ale rzuty zostają w szkicu — wrócą po powrocie do Krawędziarza.`,
      );
    } else if (rolled.length > 0) {
      const moved = rolled.filter((id) => next.stats[id] !== current.stats[id]);
      const hidden = moved.filter((id) => next.stats[id] === undefined);
      if (hidden.length > 0) {
        notes.push(
          `Nowa Rola nie ma szablonu Cech — wylosowane (${statList(hidden, current.stats)}) wrócą z rzutami, gdy go dostanie.`,
        );
      } else if (moved.length > 0) {
        notes.push(
          `Rzuty zostają, a Cechy czyta szablon nowej Roli: ${moved
            .map((id) => `${CPRED_STAT_LABELS[id].abbr} ${current.stats[id]} → ${next.stats[id]}`)
            .join(' · ')}.`,
        );
      }
    }
  }

  const lowered = Object.entries(current.skills).filter(
    ([skillId, level]) => level > 0 && (next.skills[skillId] ?? 0) < level,
  );
  if (lowered.length > 0) {
    lost.push(
      `Umiejętności (${lowered.length}): ${lowered
        .map(([skillId, level]) => {
          const after = next.skills[skillId] ?? 0;
          return `${nameOf(skillId)} ${level}${after > 0 ? ` → ${after}` : ''}`;
        })
        .join(' · ')}.`,
    );
  }

  const basket = Object.entries(current.purchases).filter(
    ([entryId]) => next.purchases[entryId] === undefined,
  );
  if (basket.length > 0) {
    const pieces = basket.reduce((sum, [, qty]) => sum + qty, 0);
    const lines = lookup
      ? creationPurchases({ ...current, purchases: Object.fromEntries(basket) }, lookup)
      : [];
    const listed = lines
      .map((line) => `${line.name}${line.qty > 1 ? ` ×${line.qty}` : ''}`)
      .join(' · ');
    lost.push(
      lines.length > 0
        ? `Koszyk (${pieces} szt. za ${formatEddies(creationSpentEddies(lines))} ed): ${listed}.`
        : `Koszyk: ${pieces} szt.`,
    );
  }

  if (current.kitChoice !== null && next.kitChoice === null) {
    const name = lookup?.(current.kitChoice)?.name ?? current.kitChoice;
    lost.push(`Wybór z wyposażenia Roli: ${name}.`);
  }

  const answers = current.lifepath.roleAnswers.filter(
    (answer) =>
      answer.answer.trim() && !next.lifepath.roleAnswers.some((kept) => kept.id === answer.id),
  );
  if (answers.length > 0) {
    lost.push(
      `Odpowiedzi Ścieżki Życia Roli (${answers.length}): ${answers
        .map((answer) => shortAnswer(answer.answer))
        .join(' · ')}.`,
    );
  }

  const granted = Object.entries(next.skills).filter(
    ([skillId, level]) => level > (current.skills[skillId] ?? 0),
  );
  if (granted.length > 0) {
    notes.push(
      `Kreator przydzieli minima podstawowych (${granted.length}): ${granted
        .map(([skillId, level]) => `${nameOf(skillId)} ${level}`)
        .join(' · ')}.`,
    );
  }
  const belowMin = Object.entries(next.skills).filter(
    ([skillId, level]) => level > 0 && level < creationSkillLimits(next, data, skillId).min,
  );
  if (belowMin.length > 0) {
    notes.push(
      `Ta metoda nie zna poziomu 1 — do podniesienia albo zdjęcia (${belowMin.length}): ${belowMin
        .map(([skillId, level]) => `${nameOf(skillId)} ${level}`)
        .join(' · ')}.`,
    );
  }
  const leftBefore =
    creationSkillPool(data, current) - creationSkillPointsSpent(current, data, registry);
  const leftAfter = creationSkillPool(data, next) - creationSkillPointsSpent(next, data, registry);
  if (leftBefore !== leftAfter) {
    notes.push(`Punkty umiejętności: pozostało ${leftBefore} → ${leftAfter}.`);
  }
  if (next.method !== current.method) {
    notes.push(
      `Pieniądze startowe: ${formatEddies(creationBudget(data, current))} → ${formatEddies(
        creationBudget(data, next),
      )} ed.`,
    );
  }
  return { lost, notes };
}

/**
 * Nazwane dziedziny umiejętności, wspólne dla zapisu i odczytu szkicu.
 *
 * Musi to być **jedna** funkcja: dopóki czytał ją tylko patch, `parseCreationDraft`
 * nie przepisywał `skillSpecialties` ze składowanego szkicu i gubił je przy każdym
 * odczycie — pola „w czym?" nie dało się wypełnić, bo wracało puste.
 *
 * `null` znaczy „szkic jest popsuty, nie tykaj go"; puste `{}` to legalny wynik.
 */
function readSkillSpecialties(
  raw: unknown,
  registry: CpredRegistry,
): Record<string, string> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const specialties: Record<string, string> = {};
  for (const [skillId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!registry.skillIds.has(skillId)) continue;
    if (!cpredSkillNeedsSpecialty(skillId) || skillId === CPRED_LANGUAGE_SKILL_ID) continue;
    if (typeof value !== 'string') return null;
    const text = value.trim().slice(0, SKILL_SPECIALTY_MAX_LENGTH);
    if (text) specialties[skillId] = text;
  }
  return specialties;
}

/**
 * Reads a stored draft back. Unlike `mergeCreationDraft` this trusts the stats
 * — the server wrote them — but it still drops anything the data files have
 * stopped knowing about, so a re-imported `creation.json` cannot resurrect a
 * Role or a skill that no longer exists.
 */
export function parseCreationDraft(
  raw: unknown,
  data: CpredCreationData,
  registry: CpredRegistry,
): CpredCreationDraft {
  const base = createDefaultCreationDraft(data);
  if (typeof raw !== 'object' || raw === null) return base;
  const input = raw as Record<string, unknown>;

  const roleId =
    typeof input.roleId === 'string' && creationRole(data, input.roleId) !== null
      ? input.roleId
      : null;
  const draft: CpredCreationDraft = {
    ...base,
    step: isCreationStep(input.step) ? input.step : base.step,
    method: isCreationMethod(input.method) ? input.method : base.method,
    roleId,
    statRankId:
      typeof input.statRankId === 'string' &&
      data.statRanks.some((rank) => rank.id === input.statRankId)
        ? input.statRankId
        : base.statRankId,
    stats: readStoredStats(input.stats),
    statRolls: readStoredStats(input.statRolls),
    skills: readSkillPatch(input.skills, data, registry) ?? {},
    skillSpecialties: readSkillSpecialties(input.skillSpecialties, registry) ?? {},
    lifepath: validateLifepath(input.lifepath, []),
    name: typeof input.name === 'string' ? input.name.slice(0, CREATION_NAME_MAX_LENGTH) : '',
    purchases: readPurchases(input.purchases),
    kitChoice:
      typeof input.kitChoice === 'string' &&
      roleId !== null &&
      (data.roleKits[roleId]?.choose ?? []).includes(input.kitChoice)
        ? input.kitChoice
        : null,
    skipPurchases: input.skipPurchases === true,
    portraitUrl: sanitizeTokenImageUrl(input.portraitUrl ?? null) ?? null,
    placeToken: input.placeToken !== false,
    // Absent means a draft from before naprawa 2a: its levels stay as saved.
    skillMinimaAuto: input.skillMinimaAuto === true,
    skillPool: isCreationSkillPool(input.skillPool) ? input.skillPool : null,
    methodFixed: input.methodFixed === true,
  };
  const allowed = new Set(creationAvailableSkills(draft, data, registry));
  draft.skills = Object.fromEntries(
    Object.entries(draft.skills).filter(([skillId]) => allowed.has(skillId)),
  );
  return draft;
}

/**
 * Reads the stored basket back. Ids are not checked against the catalogue here
 * — `creationPurchases` drops what the shop no longer sells — but the counts
 * are, so a hand-edited draft cannot bill for −3 rifles.
 */
export function readPurchases(raw: unknown): Record<string, number> {
  if (typeof raw !== 'object' || raw === null) return {};
  const purchases: Record<string, number> = {};
  for (const [entryId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (entryId.length === 0) continue;
    if (!isInteger(value) || value <= 0) continue;
    purchases[entryId] = Math.min(value, CREATION_PURCHASE_QTY_MAX);
  }
  return purchases;
}

function readStoredStats(raw: unknown): Partial<Record<CpredStatId, number>> {
  if (typeof raw !== 'object' || raw === null) return {};
  const input = raw as Record<string, unknown>;
  const stats: Partial<Record<CpredStatId, number>> = {};
  for (const id of CPRED_STAT_IDS) {
    const value = input[id];
    if (isInteger(value)) stats[id] = value;
  }
  return stats;
}

function isCreationStep(value: unknown): value is CpredCreationStep {
  return typeof value === 'string' && (CPRED_CREATION_STEPS as readonly string[]).includes(value);
}

function isCreationMethod(value: unknown): value is CpredCreationMethod {
  return typeof value === 'string' && (CPRED_CREATION_METHODS as readonly string[]).includes(value);
}

function readStatPatch(
  raw: unknown,
  data: CpredCreationData,
): Partial<Record<CpredStatId, number>> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const stats: Partial<Record<CpredStatId, number>> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!(CPRED_STAT_IDS as readonly string[]).includes(key)) return null;
    if (value === null || value === undefined) continue;
    if (!isInteger(value) || value < data.limits.statMin || value > data.limits.statMax)
      return null;
    stats[key as CpredStatId] = value;
  }
  return stats;
}

function readSkillPatch(
  raw: unknown,
  data: CpredCreationData,
  registry: CpredRegistry,
): Record<string, number> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const skills: Record<string, number> = {};
  for (const [skillId, value] of Object.entries(input)) {
    if (!registry.skillIds.has(skillId)) return null;
    if (value === null || value === undefined || value === 0) continue;
    const ceiling =
      data.freeLanguage?.skillId === skillId ? data.freeLanguage.level : data.limits.skillMax;
    if (!isInteger(value) || value < 1 || value > ceiling) return null;
    skills[skillId] = value;
  }
  return skills;
}

/**
 * A Krawędziarz's stats read out of the current Role's template from the dice
 * already in the draft; empty without a Role or a template.
 */
export function creationRolledStats(
  draft: CpredCreationDraft,
  data: CpredCreationData,
): Partial<Record<CpredStatId, number>> {
  const role = creationRole(data, draft.roleId);
  const stats: Partial<Record<CpredStatId, number>> = {};
  if (role === null) return stats;
  for (const id of CPRED_STAT_IDS) {
    const roll = draft.statRolls[id];
    if (roll === undefined) continue;
    const value = creationTemplateStat(role, data, id, roll);
    if (value !== null) stats[id] = value;
  }
  return stats;
}

/** The first stat still without a die, in the order the templates print them. */
export function creationNextStatToRoll(draft: CpredCreationDraft): CpredStatId | null {
  return CPRED_STAT_IDS.find((id) => draft.statRolls[id] === undefined) ?? null;
}

/**
 * Takes the dice off the given stats (all of them without a list) — the GM's
 * „Pozwól przerzucić" and nothing else: a player rolls each stat once.
 */
export function clearRolledStats(
  draft: CpredCreationDraft,
  statIds: readonly CpredStatId[] = CPRED_STAT_IDS,
): CpredCreationDraft {
  const statRolls = { ...draft.statRolls };
  const stats = { ...draft.stats };
  for (const id of statIds) {
    delete statRolls[id];
    if (draft.method === 'edgerunner') delete stats[id];
  }
  return { ...draft, stats, statRolls };
}

/**
 * Writes a rolled spread into the draft. The 1d10 per stat is the server's,
 * and so is the value it reads out of the Role's template column.
 */
export function applyRolledSpread(
  draft: CpredCreationDraft,
  role: CpredCreationRole,
  data: CpredCreationData,
  rolls: Partial<Record<CpredStatId, number>>,
): CpredCreationDraft {
  const stats: Partial<Record<CpredStatId, number>> = {};
  const statRolls: Partial<Record<CpredStatId, number>> = {};
  for (const id of CPRED_STAT_IDS) {
    const roll = rolls[id];
    if (roll === undefined) continue;
    const value = creationTemplateStat(role, data, id, roll);
    if (value === null) continue;
    stats[id] = value;
    statRolls[id] = roll;
  }
  return {
    ...draft,
    stats: { ...draft.stats, ...stats },
    statRolls: { ...draft.statRolls, ...statRolls },
  };
}

// ───────────────────────────── szkic → karta ─────────────────────────────

/**
 * Turns a finished draft into a stage-07 sheet. The free language is written
 * here rather than carried in the draft: it costs nothing, so a draft holding
 * it would let the wizard show it as spendable.
 */
export function creationToCharacterData(
  draft: CpredCreationDraft,
  data: CpredCreationData,
  /** From `creationLifestyle` — null leaves the sheet off the monthly bill. */
  lifestyle: CpredLifestyle | null = null,
): CpredCharacterData {
  const stats = creationStats(draft, data);
  const skills: Record<string, number> = {};
  for (const [skillId, level] of Object.entries(draft.skills)) {
    if (level > 0) skills[skillId] = level;
  }
  if (data.freeLanguage) {
    skills[data.freeLanguage.skillId] = Math.max(
      skills[data.freeLanguage.skillId] ?? 0,
      data.freeLanguage.level,
    );
  }
  const base = createDefaultCharacterData();
  return {
    ...base,
    stats,
    hpCurrent: hpMax(stats),
    luckCurrent: stats.luck,
    humanityCurrent: humanityMaxWith(stats, []),
    roleId: draft.roleId,
    roleAbilityRank: data.roleAbilityStart,
    skills,
    skillSpecialties: { ...draft.skillSpecialties },
    // Copied, not translated: the draft and the sheet hold the same shape, so
    // a Lifepath field the wizard collects cannot go missing on the sheet.
    lifepath: draft.lifepath,
    // „Styl" on page one (stage 27b) asks the same question the Lifepath has
    // just answered three times over, so it is filled in rather than left for
    // the player to copy by hand. It stays an ordinary editable line.
    style: lifepathStyleLine(draft.lifepath),
    lifestyle,
  };
}

/**
 * Where a fresh character lives (s. 105): a rented container on kibble — and
 * a Korpo in the company conapt on a good prepack. Only a character somebody
 * plays gets the bill; an NPC the GM builds stays off the monthly settlement
 * like every other NPC sheet (stage 23b). The book's free first month needs no
 * field: the settlement is the GM's button.
 *
 * The Korpo is known by the name of its Ability, like every Role test in the
 * engine — the Role ids come from a data file the table may rename.
 */
export function creationLifestyle(
  registry: Pick<CpredRegistry, 'roles'>,
  roleId: string | null,
  owned: boolean,
): CpredLifestyle | null {
  if (!owned) return null;
  const role = registry.roles.find((entry) => entry.id === roleId);
  return role?.ability === CPRED_TEAMWORK_ABILITY
    ? { level: 'goodPrepack', housing: 'corpoConapt' }
    : { level: 'kibble', housing: 'container' };
}

/** What „Utwórz postać" writes, as the summary shows it (naprawa 3a). */
export interface CpredCreationOutcome {
  /** The sheet after the starting money came in and every basket line went out. */
  sheet: CpredCharacterData;
  purchases: CpredCreationPurchase[];
  /** Wyposażenie Roli gratis (etap 47a) — także chrom, którego karta nie dostaje. */
  kit: CpredCreationKitLine[];
  budget: number;
  spent: number;
}

/**
 * The finished sheet, computed before anything is written — so the summary
 * reads the same rows, balance and lifestyle the server is about to store.
 *
 * `creation:finish` builds its sheet in steps (a ledger row per basket line),
 * but out of the same three pieces: `creationToCharacterData`, the catalogue
 * row of `purchasedSheetRow` and the eddies left after the basket. The server
 * test holds the two results equal, row ids aside.
 */
export function creationOutcome(
  draft: CpredCreationDraft,
  data: CpredCreationData,
  registry: Pick<CpredRegistry, 'roles'>,
  lookup: (entryId: string) => CompendiumEntry | undefined,
  compendium: Pick<CompendiumRegistry, 'weaponTypeById'>,
  owned: boolean,
): CpredCreationOutcome {
  const purchases = creationPurchases(draft, lookup, compendium.weaponTypeById);
  const budget = creationBudget(data, draft);
  const spent = creationSpentEddies(purchases);
  const base = creationToCharacterData(
    draft,
    data,
    creationLifestyle(registry, draft.roleId, owned),
  );
  const weapons: CpredWeaponRow[] = [...base.weapons];
  const armor: CpredArmorRow[] = [...base.armor];
  const gear: CpredGearRow[] = [...base.gear];
  let gearWithAmmo: CpredGearRow[] = gear;
  let rows = 0;
  // Etap 47a: wyposażenie Roli kładzie się przed koszykiem, tak jak w `creation:finish`.
  const kit = creationRoleKit(draft, data, lookup);
  for (const purchased of creationKitSheetRows(kit, lookup, compendium, () => {
    rows += 1;
    return `creation-${rows}`;
  })) {
    if (purchased.list === 'weapons') weapons.push(purchased.row);
    else if (purchased.list === 'armor') armor.push(purchased.row);
    else gearWithAmmo = [...gearWithAmmo, purchased.row];
  }
  for (const line of purchases) {
    const { entryId, weaponTypeId } = creationBasketEntry(line.entryId);
    const entry = lookup(entryId);
    if (!entry) continue;
    // Etap 46c: amunicja to pudełko — `qty` paczek jednym wierszem, sklejone
    // z pudełkiem tego samego rodzaju i kalibru.
    if (entry.category === 'ammo') {
      const type = weaponTypeId ? compendium.weaponTypeById.get(weaponTypeId) : undefined;
      rows += 1;
      const box = type
        ? cpredPurchasedAmmoRow(toAmmoProfile(entry), type, line.qty, `creation-${rows}`)
        : null;
      if (box?.ammo) {
        gearWithAmmo = cpredPutAmmo(gearWithAmmo, { ...box, ammo: box.ammo }, box.qty, () => {
          rows += 1;
          return `creation-${rows}`;
        });
      }
      continue;
    }
    const resolved = entry.category === 'weapon' ? resolveWeapon(entry, compendium) : null;
    for (let copy = 0; copy < line.qty; copy += 1) {
      rows += 1;
      const purchased = purchasedSheetRow(entry, resolved, `creation-${rows}`);
      if (!purchased) continue;
      if (purchased.list === 'weapons') weapons.push(purchased.row);
      else if (purchased.list === 'armor') armor.push(purchased.row);
      else gearWithAmmo = [...gearWithAmmo, purchased.row];
    }
  }
  return {
    sheet: mergeCharacterData(base, { weapons, armor, gear: gearWithAmmo, eddies: budget - spent }),
    purchases,
    kit,
    budget,
    spent,
  };
}

/** One thing the book hands a new character that the wizard does not. */
export interface CpredCreationOutside {
  id: 'package' | 'fashion' | 'cyberware' | 'kit';
  title: string;
  text: string;
}

/**
 * The deliberate gaps of stage 25c, said where the player decides (the gear
 * step), before „Utwórz postać" and after it — so „gotowe" never stands for
 * the rulebook's whole starting kit (naprawa 3a).
 */
export function creationLeftOutside(
  draft: Pick<CpredCreationDraft, 'method'>,
  data: Pick<CpredCreationData, 'budgets'>,
  /** Wyposażenie Roli gratis (`creationRoleKit`) — jego chrom kreator zostawia MG. */
  kit: readonly CpredCreationKitLine[] = [],
): CpredCreationOutside[] {
  const lines: CpredCreationOutside[] = [];
  const kitChrome = kit.filter((line) => !line.onSheet);
  if (kitChrome.length > 0) {
    lines.push({
      id: 'kit',
      title: 'Chrom z wyposażenia Roli',
      text:
        `${kitChrome.map((line) => line.name).join(', ')} — chrom należny za darmo, ale kreator ` +
        'nie montuje cyborgizacji. MG wszczepia go na gotowej postaci w Kompendium przyciskiem ' +
        '„Dodaj za darmo”; Utrata Człowieczeństwa liczy się jak zwykle.',
    });
  }
  if (draft.method === 'edgerunner') {
    lines.push({
      id: 'package',
      title: 'Pakiet Roli',
      text:
        'Krawędziarz dostaje w podręczniku gotowy zestaw broni, pancerza, sprzętu i cyborgizacji ' +
        'swojej Roli. Kreator go nie wydaje — dokłada go MG przyciskiem „Dodaj za darmo” w Kompendium.',
    });
  }
  if (draft.method === 'complete' && data.budgets.fashion > 0) {
    lines.push({
      id: 'fashion',
      title: 'Moda',
      text:
        `Podręcznik daje jeszcze ${formatEddies(data.budgets.fashion)} ed wyłącznie na ubrania ` +
        'i cybermodę, a niewydane przepadają. VTT nie ma katalogu Mody, więc tych pieniędzy nie ma ' +
        'na karcie — wygląd opisuje pole „Styl”.',
    });
  }
  lines.push({
    id: 'cyberware',
    title: 'Cyborgizacje',
    text:
      (draft.method === 'complete'
        ? 'W podręczniku kupuje się je z tej samej puli, co wyposażenie. '
        : 'Te z pakietu Roli dokłada MG, a własne kupuje się za eurodolce z karty. ') +
      'W VTT instaluje się je dopiero na gotowej postaci, w Kompendium — Utrata Człowieczeństwa ' +
      'jest wtedy losowana, choć przy tworzeniu postaci podręcznik liczy stałą wartość.',
  });
  return lines;
}

/** „Biznesowe · Krótkie i kręcone · Kolczyki w nosie" — the sheet's Styl line. */
export function lifepathStyleLine(lifepath: CpredLifepath): string {
  return [lifepath.clothing, lifepath.hair, lifepath.affectation].filter(Boolean).join(' · ');
}
