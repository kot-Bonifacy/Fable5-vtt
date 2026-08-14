import {
  CPRED_STAT_IDS,
  CPRED_STAT_LABELS,
  CPRED_STAT_MAX,
  CPRED_STAT_MIN,
  type CpredStatId,
  type CpredStats,
} from './stats.js';
import {
  ROLE_RANK_MIN,
  createDefaultCharacterData,
  type CpredCharacterData,
  type CpredRegistry,
  type CpredValidationIssue,
} from './character.js';
import { humanityMaxWith } from './cyberware.js';
import { hpMax } from './derived.js';

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

export const CPRED_CREATION_STEPS = ['role', 'stats', 'skills', 'summary'] as const;
export type CpredCreationStep = (typeof CPRED_CREATION_STEPS)[number];

export const CPRED_CREATION_STEP_LABELS: Record<CpredCreationStep, string> = {
  role: 'Rola',
  stats: 'Cechy',
  skills: 'Umiejętności',
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
  roles: CpredCreationRole[];
}

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
  roles: [],
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
  name: string;
}

export const CREATION_NAME_MAX_LENGTH = 64;

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
    name: '',
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
    roles,
  };
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

export function creationSkillPointsSpent(
  draft: CpredCreationDraft,
  data: CpredCreationData,
  registry: CpredRegistry,
): number {
  return Object.entries(draft.skills).reduce(
    (sum, [skillId, level]) => sum + creationSkillCost(skillId, level, data, registry),
    0,
  );
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
    if (spent > pool) {
      issues.push(issue('stats', `Punkty Cech: wydane ${spent} z ${pool}.`));
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
    if (!allowed.has(skillId)) {
      issues.push(issue(`skills.${skillId}`, `Umiejętność ${name} nie należy do listy tej Roli.`));
    }
    const ceiling =
      data.freeLanguage?.skillId === skillId ? data.freeLanguage.level : data.limits.skillMax;
    if (!isInteger(level) || level < 1 || level > ceiling) {
      issues.push(
        issue(
          `skills.${skillId}`,
          `Umiejętność ${name} musi mieścić się w przedziale 1–${ceiling}.`,
        ),
      );
    }
  }

  for (const skillId of data.basicSkills) {
    const level = draft.skills[skillId] ?? 0;
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
  if (spent > data.skillPoints) {
    issues.push(issue('skills', `Punkty umiejętności: wydane ${spent} z ${data.skillPoints}.`));
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
 *  - **Changing the Role or the method wipes what it invalidates.** A spread
 *    rolled off the Solo template means nothing on the Netrunner one, and a
 *    skill bought off one Role's list is not on another's.
 */
export function mergeCreationDraft(
  current: CpredCreationDraft,
  patch: Record<string, unknown>,
  data: CpredCreationData,
  registry: CpredRegistry,
): CpredCreationDraft | null {
  const next: CpredCreationDraft = {
    ...current,
    stats: { ...current.stats },
    statRolls: { ...current.statRolls },
    skills: { ...current.skills },
  };

  if ('step' in patch) {
    const step = patch.step;
    if (!isCreationStep(step)) return null;
    next.step = step;
  }
  if ('method' in patch) {
    const method = patch.method;
    if (!isCreationMethod(method)) return null;
    if (method !== current.method) {
      next.stats = {};
      next.statRolls = {};
    }
    next.method = method;
  }
  if ('roleId' in patch) {
    const roleId = patch.roleId;
    if (roleId !== null && typeof roleId !== 'string') return null;
    if (roleId !== null && creationRole(data, roleId) === null) return null;
    if (roleId !== current.roleId) {
      next.stats = {};
      next.statRolls = {};
    }
    next.roleId = roleId;
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
    next.statRolls = {};
  }
  if ('skills' in patch) {
    const skills = readSkillPatch(patch.skills, data, registry);
    if (skills === null) return null;
    next.skills = skills;
  }
  if ('name' in patch) {
    if (typeof patch.name !== 'string') return null;
    next.name = patch.name.slice(0, CREATION_NAME_MAX_LENGTH);
  }

  // A Role or method change may have orphaned skills; drop them rather than
  // leave the wizard showing a bill for rows it no longer displays.
  const allowed = new Set(creationAvailableSkills(next, data, registry));
  next.skills = Object.fromEntries(
    Object.entries(next.skills).filter(([skillId]) => allowed.has(skillId)),
  );
  return next;
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
    name: typeof input.name === 'string' ? input.name.slice(0, CREATION_NAME_MAX_LENGTH) : '',
  };
  const allowed = new Set(creationAvailableSkills(draft, data, registry));
  draft.skills = Object.fromEntries(
    Object.entries(draft.skills).filter(([skillId]) => allowed.has(skillId)),
  );
  return draft;
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
  };
}
