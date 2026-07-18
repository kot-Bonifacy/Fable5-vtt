import { hpMax, humanityMax } from './derived.js';
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
 */

export const CPRED_SCHEMA_VERSION = 1;

export const SKILL_LEVEL_MIN = 0;
export const SKILL_LEVEL_MAX = 10;
export const ROLE_RANK_MIN = 1;
export const ROLE_RANK_MAX = 10;
export const EDDIES_MAX = 10_000_000;
export const NOTES_MAX_LENGTH = 10_000;
export const ITEM_ROWS_MAX = 40;
export const ITEM_NAME_MAX_LENGTH = 64;
export const ITEM_NOTES_MAX_LENGTH = 200;
export const ITEM_FIELD_MAX_LENGTH = 32;
export const ITEM_QTY_MAX = 999;
export const ARMOR_SP_MAX = 30;

/** One entry of `data/public/cpred/skills.json`. */
export interface CpredSkillDefinition {
  id: string;
  name: string;
  stat: (typeof CPRED_STAT_IDS)[number];
  /** Advancement cost multiplier (×2 skills); unused until stage 24. */
  multiplier?: number;
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
}

export const EMPTY_CPRED_REGISTRY: CpredRegistry = {
  skills: [],
  skillIds: new Set(),
  roles: [],
  roleIds: new Set(),
};

function isStatId(value: unknown): value is CpredSkillDefinition['stat'] {
  return typeof value === 'string' && (CPRED_STAT_IDS as readonly string[]).includes(value);
}

/** Builds the registry from the raw parsed JSON files, dropping malformed rows. */
export function buildCpredRegistry(rawSkills: unknown, rawRoles: unknown): CpredRegistry {
  const skillsInput = (rawSkills as { skills?: unknown })?.skills;
  const rolesInput = (rawRoles as { roles?: unknown })?.roles;
  const skills = (Array.isArray(skillsInput) ? skillsInput : []).filter(
    (entry): entry is CpredSkillDefinition =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as CpredSkillDefinition).id === 'string' &&
      typeof (entry as CpredSkillDefinition).name === 'string' &&
      isStatId((entry as CpredSkillDefinition).stat),
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
  };
}

/** A plain equipment-ish row (cyberware, and the base of the other rows). */
export interface CpredItemRow {
  id: string;
  name: string;
  notes: string;
}

export interface CpredGearRow extends CpredItemRow {
  qty: number;
}

export interface CpredWeaponRow extends CpredItemRow {
  /** Damage notation, e.g. "3k6" — free text until the compendium (stage 12). */
  damage: string;
  ammo: string;
  /** Rate of fire ("LA" on the Polish sheet). */
  rof: string;
}

export interface CpredArmorRow extends CpredItemRow {
  /** Stopping Power ("OB" on the Polish sheet). */
  sp: number;
}

export interface CpredCharacterData {
  schemaVersion: typeof CPRED_SCHEMA_VERSION;
  stats: CpredStats;
  /** Clamped to [0, hpMax(stats)] on every merge. */
  hpCurrent: number;
  /** Clamped to [0, stats.luck]. */
  luckCurrent: number;
  /** Clamped to [0, humanityMax(stats)]. */
  humanityCurrent: number;
  /** One of the registry's role ids; null = no role picked yet. */
  roleId: string | null;
  roleAbilityRank: number;
  /** skillId → level 1–10; untrained skills are simply absent. */
  skills: Record<string, number>;
  weapons: CpredWeaponRow[];
  armor: CpredArmorRow[];
  gear: CpredGearRow[];
  cyberware: CpredItemRow[];
  eddies: number;
  notes: string;
}

export function createDefaultCharacterData(): CpredCharacterData {
  const stats = Object.fromEntries(CPRED_STAT_IDS.map((id) => [id, 5])) as CpredStats;
  return {
    schemaVersion: CPRED_SCHEMA_VERSION,
    stats,
    hpCurrent: hpMax(stats),
    luckCurrent: stats.luck,
    humanityCurrent: humanityMax(stats),
    roleId: null,
    roleAbilityRank: ROLE_RANK_MIN,
    skills: {},
    weapons: [],
    armor: [],
    gear: [],
    cyberware: [],
    eddies: 0,
    notes: '',
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
  return { id: input.id, name: name.trim(), notes };
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
  for (const key of ['hpCurrent', 'luckCurrent', 'humanityCurrent'] as const) {
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
      const ammo = validateText(row.ammo ?? '', 'weapons', 'Amunicja', ITEM_FIELD_MAX_LENGTH, issues);
      const rof = validateText(row.rof ?? '', 'weapons', 'LA', ITEM_FIELD_MAX_LENGTH, issues);
      if (damage === undefined || ammo === undefined || rof === undefined) return undefined;
      return { ...base, damage, ammo, rof };
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
      return { ...base, sp };
    });
    if (armor) patch.armor = armor;
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
    const cyberware = validateRows<CpredItemRow>(
      input.cyberware,
      'cyberware',
      issues,
      (base) => base,
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
  if ('notes' in input) {
    const notes = validateText(input.notes, 'notes', 'Notatki', NOTES_MAX_LENGTH, issues);
    if (notes !== undefined) patch.notes = notes;
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
  | { ok: true; patch: Partial<CpredCharacterData> }
  | { ok: false; issues: CpredValidationIssue[] } {
  const { patch, issues } = collectCharacterDataPatch(raw, registry);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, patch };
}

/**
 * Clamps stat-dependent pools after a merge: changing BC/SW/SZ/EMP must never
 * leave current HP, luck or humanity above their recomputed maximums.
 */
export function normalizeCharacterData(data: CpredCharacterData): CpredCharacterData {
  return {
    ...data,
    hpCurrent: Math.min(data.hpCurrent, hpMax(data.stats)),
    luckCurrent: Math.min(data.luckCurrent, data.stats.luck),
    humanityCurrent: Math.min(data.humanityCurrent, humanityMax(data.stats)),
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
