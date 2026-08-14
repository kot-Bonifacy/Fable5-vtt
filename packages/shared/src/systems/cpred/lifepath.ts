import type { BotProfileData } from '../../bots/types.js';
import type { CpredRegistry, CpredValidationIssue } from './character.js';

/**
 * The Lifepath (stage 25b) — the narrative half of character creation.
 *
 * Everything the rules print lives in `cpred/lifepath.json` (the sample in
 * `data/public`, the imported set in `data/private`) and is replayed here; this
 * module holds the shape, the refusals and the arithmetic, never a table.
 *
 * Two decisions run through the whole file:
 *
 *  - **The general Lifepath is fields, the Role Lifepath is answers.** Culture,
 *    hair, family background and the rest are the same fourteen boxes on every
 *    sheet, so they get named fields the printed sheet (stage 27c) can lay out.
 *    A Role's questions differ from Role to Role — the Nomad is asked how big
 *    the pack is, the Netrunner who the partner is — so they are stored as
 *    question-and-answer pairs. Naming fifty-two fields nobody but one Role
 *    would ever fill would be the wrong trade.
 *
 *  - **The draft and the sheet hold the same shape.** The wizard fills a
 *    `CpredLifepath` and `creationToCharacterData` copies it across, so „what
 *    the creator collected" and „what the sheet prints" cannot drift apart.
 */

export const CPRED_LIFEPATH_SCHEMA_VERSION = 1;

/** Longest single answer; the Media's ethics rows run to about 150 characters. */
export const LIFEPATH_LINE_MAX_LENGTH = 300;
/** Friends, enemies and tragic loves the sheet will hold. RAW rolls at most 3. */
export const LIFEPATH_GROUP_MAX = 8;
/** Role questions the sheet will hold; the fattest Role Lifepath has seven. */
export const LIFEPATH_ROLE_ANSWERS_MAX = 24;
/** Tables one throw may cover — „Rzuć całą Ścieżkę" needs about twenty. */
export const LIFEPATH_ROLL_TABLES_MAX = 24;

// ─────────────────────────────── dane wejściowe ───────────────────────────────

/** One row of a Lifepath table. */
export interface CpredLifepathEntry {
  /** Lowest die result that draws this row. */
  roll: number;
  /** Highest, when the row covers a range („1–2 Zignorować śmiecia"). */
  rollMax?: number;
  text: string;
  /** The paragraph the book prints beside the answer („Tło rodzinne"). */
  detail?: string;
  /** A list to choose from once the row is drawn — the Culture's languages. */
  options?: string[];
}

export interface CpredLifepathTable {
  id: string;
  label: string;
  /** The book's own prompt. Role tables carry one; the general fields do not. */
  question?: string;
  /** Sides of the die this table is read with — 6 or 10. */
  sides: number;
  entries: CpredLifepathEntry[];
}

export interface CpredLifepathRolePath {
  roleId: string;
  tables: CpredLifepathTable[];
}

/**
 * „Rzuć 1k10 i od wyniku odejmij 7, by sprawdzić, ilu przyjaciół zdobyłeś …
 * (minimum 0)" (s. 50). The same throw counts friends, enemies and tragic
 * loves, so it is one number here rather than three.
 */
export interface CpredLifepathGroupRoll {
  sides: number;
  modifier: number;
  min: number;
}

export interface CpredLifepathData {
  general: CpredLifepathTable[];
  roles: CpredLifepathRolePath[];
  groupRoll: CpredLifepathGroupRoll;
}

export const DEFAULT_LIFEPATH_GROUP_ROLL: CpredLifepathGroupRoll = {
  sides: 10,
  modifier: -7,
  min: 0,
};

/**
 * What the wizard falls back to with no data file: no tables at all, so the
 * Lifepath step says „brak danych Ścieżki Życia" instead of showing an empty
 * list of questions.
 */
export const EMPTY_CPRED_LIFEPATH_DATA: CpredLifepathData = {
  general: [],
  roles: [],
  groupRoll: DEFAULT_LIFEPATH_GROUP_ROLL,
};

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function readEntries(raw: unknown, sides: number): CpredLifepathEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: CpredLifepathEntry[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    if (!isInteger(row.roll) || row.roll < 1 || row.roll > sides) continue;
    if (typeof row.text !== 'string' || row.text.length === 0) continue;
    const entry: CpredLifepathEntry = {
      roll: row.roll,
      text: row.text.slice(0, LIFEPATH_LINE_MAX_LENGTH),
    };
    if (isInteger(row.rollMax) && row.rollMax > row.roll && row.rollMax <= sides) {
      entry.rollMax = row.rollMax;
    }
    if (typeof row.detail === 'string' && row.detail.length > 0) {
      entry.detail = row.detail.slice(0, LIFEPATH_LINE_MAX_LENGTH * 4);
    }
    if (Array.isArray(row.options)) {
      const options = row.options.filter(
        (option): option is string => typeof option === 'string' && option.length > 0,
      );
      if (options.length > 0) entry.options = options;
    }
    entries.push(entry);
  }
  return entries;
}

function readTable(raw: unknown): CpredLifepathTable | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  if (typeof input.id !== 'string' || input.id.length === 0) return null;
  const sides = isInteger(input.sides) && input.sides > 1 ? input.sides : 10;
  const entries = readEntries(input.entries, sides);
  // A table nobody can roll on is worse than no table: the wizard would show a
  // „Rzuć" button that always refuses.
  if (entries.length === 0) return null;
  const table: CpredLifepathTable = {
    id: input.id,
    label: typeof input.label === 'string' && input.label ? input.label : input.id,
    sides,
    entries,
  };
  if (typeof input.question === 'string' && input.question.length > 0) {
    table.question = input.question;
  }
  return table;
}

export function buildLifepathData(raw: unknown): CpredLifepathData {
  const input = (raw ?? {}) as Record<string, unknown>;
  const general = (Array.isArray(input.general) ? input.general : [])
    .map(readTable)
    .filter((table): table is CpredLifepathTable => table !== null);

  const roles: CpredLifepathRolePath[] = (Array.isArray(input.roles) ? input.roles : [])
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { roleId?: unknown }).roleId === 'string',
    )
    .map((entry) => ({
      roleId: entry.roleId as string,
      tables: (Array.isArray(entry.tables) ? entry.tables : [])
        .map(readTable)
        .filter((table): table is CpredLifepathTable => table !== null),
    }));

  const rawGroup = (input.groupRoll ?? {}) as Record<string, unknown>;
  const groupRoll: CpredLifepathGroupRoll = {
    sides: isInteger(rawGroup.sides) && rawGroup.sides > 1 ? rawGroup.sides : 10,
    modifier: isInteger(rawGroup.modifier) ? rawGroup.modifier : -7,
    min: isInteger(rawGroup.min) && rawGroup.min >= 0 ? rawGroup.min : 0,
  };
  return { general, roles, groupRoll };
}

/** Attaches parsed Lifepath tables to a registry built by `buildCpredRegistry`. */
export function withLifepathData(registry: CpredRegistry, raw: unknown): CpredRegistry {
  return { ...registry, lifepath: buildLifepathData(raw) };
}

/** The registry's Lifepath tables, or the empty set that refuses politely. */
export function lifepathDataOf(registry: CpredRegistry): CpredLifepathData {
  return registry.lifepath ?? EMPTY_CPRED_LIFEPATH_DATA;
}

export function lifepathRoleTables(
  data: CpredLifepathData,
  roleId: string | null,
): CpredLifepathTable[] {
  if (roleId === null) return [];
  return data.roles.find((role) => role.roleId === roleId)?.tables ?? [];
}

/** Every table the wizard can roll on for this draft — general plus the Role's. */
export function lifepathTables(
  data: CpredLifepathData,
  roleId: string | null,
): CpredLifepathTable[] {
  return [...data.general, ...lifepathRoleTables(data, roleId)];
}

export function lifepathTable(
  data: CpredLifepathData,
  roleId: string | null,
  tableId: string,
): CpredLifepathTable | null {
  return lifepathTables(data, roleId).find((table) => table.id === tableId) ?? null;
}

/** The row a die result draws, honouring the ranged rows („1–2", „3–4"). */
export function lifepathEntryFor(
  table: CpredLifepathTable,
  roll: number,
): CpredLifepathEntry | null {
  return (
    table.entries.find((entry) => roll >= entry.roll && roll <= (entry.rollMax ?? entry.roll)) ??
    null
  );
}

/** „1–2" / „7" — how the wizard prints a row's die result. */
export function lifepathRollLabel(entry: CpredLifepathEntry): string {
  return entry.rollMax ? `${entry.roll}–${entry.rollMax}` : String(entry.roll);
}

/** How many friends / enemies / tragic loves a throw of the group die gives. */
export function lifepathGroupCount(roll: number, group: CpredLifepathGroupRoll): number {
  return Math.max(group.min, Math.min(LIFEPATH_GROUP_MAX, roll + group.modifier));
}

// ─────────────────────────────── kształt karty ───────────────────────────────

export interface CpredLifepathPerson {
  id: string;
  /** Who they are, in the player's own words; the tables never name anybody. */
  name: string;
  /** What the table said — the relation, or how the love story ended. */
  note: string;
}

export interface CpredLifepathEnemy {
  id: string;
  name: string;
  /** „Dawny przyjaciel", „Eks" — the Enemy column of the table (s. 51). */
  who: string;
  cause: string;
  /** What the injured party can bring to bear. */
  resources: string;
  /** „Słodka zemsta" — what happens when the two of you meet again. */
  revenge: string;
}

export interface CpredLifepathAnswer {
  /** Table id, so re-rolling one question replaces its own answer. */
  id: string;
  question: string;
  answer: string;
}

/**
 * The Lifepath as it sits on a sheet. Every general field is a plain string,
 * because that is what page two of the printed sheet has room for; the three
 * lists are lists because the book rolls their length.
 */
export interface CpredLifepath {
  /** „Afryka Zachodnia" — the Culture of Origin. */
  culture: string;
  /**
   * The language that comes with it, at level 4. Stage 25a grants the level and
   * had nowhere to write *which* language — this is that place.
   */
  language: string;
  personality: string;
  clothing: string;
  hair: string;
  affectation: string;
  valueMost: string;
  feelingsAboutPeople: string;
  mostValuedPerson: string;
  mostValuedPossession: string;
  familyBackground: string;
  familyCrisis: string;
  childhoodEnvironment: string;
  lifeGoal: string;
  friends: CpredLifepathPerson[];
  enemies: CpredLifepathEnemy[];
  tragicLoves: CpredLifepathPerson[];
  /** The Role's own questions, in the order the book asks them. */
  roleAnswers: CpredLifepathAnswer[];
}

/** The general tables that fill exactly one field, by table id. */
export const LIFEPATH_FIELD_TABLES = {
  culture: 'culture',
  personality: 'personality',
  clothing: 'clothing',
  hair: 'hair',
  affectation: 'affectation',
  valueMost: 'valueMost',
  feelingsAboutPeople: 'feelingsAboutPeople',
  mostValuedPerson: 'mostValuedPerson',
  mostValuedPossession: 'mostValuedPossession',
  familyBackground: 'familyBackground',
  familyCrisis: 'familyCrisis',
  childhoodEnvironment: 'childhoodEnvironment',
  lifeGoal: 'lifeGoal',
} as const satisfies Record<string, keyof CpredLifepath>;

export type CpredLifepathFieldTable = keyof typeof LIFEPATH_FIELD_TABLES;

export function isLifepathFieldTable(id: string): id is CpredLifepathFieldTable {
  return Object.prototype.hasOwnProperty.call(LIFEPATH_FIELD_TABLES, id);
}

/** The three lists whose length the book rolls. */
export const LIFEPATH_GROUPS = ['friends', 'enemies', 'tragicLoves'] as const;
export type CpredLifepathGroup = (typeof LIFEPATH_GROUPS)[number];

export const LIFEPATH_GROUP_LABELS: Record<CpredLifepathGroup, string> = {
  friends: 'Przyjaciele',
  enemies: 'Wrogowie',
  tragicLoves: 'Tragiczne miłości',
};

export function isLifepathGroup(value: unknown): value is CpredLifepathGroup {
  return typeof value === 'string' && (LIFEPATH_GROUPS as readonly string[]).includes(value);
}

/** Table id → which cell of which list it fills. */
export const LIFEPATH_GROUP_TABLES: Record<
  string,
  { group: CpredLifepathGroup; field: 'note' | 'who' | 'cause' | 'resources' | 'revenge' }
> = {
  friend: { group: 'friends', field: 'note' },
  tragicLove: { group: 'tragicLoves', field: 'note' },
  enemyWho: { group: 'enemies', field: 'who' },
  enemyCause: { group: 'enemies', field: 'cause' },
  enemyResources: { group: 'enemies', field: 'resources' },
  revenge: { group: 'enemies', field: 'revenge' },
};

export function createDefaultLifepath(): CpredLifepath {
  return {
    culture: '',
    language: '',
    personality: '',
    clothing: '',
    hair: '',
    affectation: '',
    valueMost: '',
    feelingsAboutPeople: '',
    mostValuedPerson: '',
    mostValuedPossession: '',
    familyBackground: '',
    familyCrisis: '',
    childhoodEnvironment: '',
    lifeGoal: '',
    friends: [],
    enemies: [],
    tragicLoves: [],
    roleAnswers: [],
  };
}

/** True when nothing has been filled in — the sheet then hides the section. */
export function isLifepathEmpty(lifepath: CpredLifepath): boolean {
  const fields = Object.values(LIFEPATH_FIELD_TABLES).every((field) => lifepath[field] === '');
  return (
    fields &&
    lifepath.language === '' &&
    lifepath.friends.length === 0 &&
    lifepath.enemies.length === 0 &&
    lifepath.tragicLoves.length === 0 &&
    lifepath.roleAnswers.length === 0
  );
}

export function emptyLifepathPerson(id: string): CpredLifepathPerson {
  return { id, name: '', note: '' };
}

export function emptyLifepathEnemy(id: string): CpredLifepathEnemy {
  return { id, name: '', who: '', cause: '', resources: '', revenge: '' };
}

// ──────────────────────────────── walidacja ────────────────────────────────

function line(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, LIFEPATH_LINE_MAX_LENGTH) : '';
}

function readPeople(raw: unknown, prefix: string): CpredLifepathPerson[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, LIFEPATH_GROUP_MAX).map((item, index) => {
    const row = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    return {
      id: typeof row.id === 'string' && row.id ? row.id.slice(0, 40) : `${prefix}${index + 1}`,
      name: line(row.name),
      note: line(row.note),
    };
  });
}

function readEnemies(raw: unknown): CpredLifepathEnemy[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, LIFEPATH_GROUP_MAX).map((item, index) => {
    const row = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    return {
      id: typeof row.id === 'string' && row.id ? row.id.slice(0, 40) : `enemy${index + 1}`,
      name: line(row.name),
      who: line(row.who),
      cause: line(row.cause),
      resources: line(row.resources),
      revenge: line(row.revenge),
    };
  });
}

function readAnswers(raw: unknown): CpredLifepathAnswer[] {
  if (!Array.isArray(raw)) return [];
  const answers: CpredLifepathAnswer[] = [];
  for (const item of raw.slice(0, LIFEPATH_ROLE_ANSWERS_MAX)) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || row.id.length === 0) continue;
    answers.push({
      id: row.id.slice(0, 80),
      question: line(row.question),
      answer: line(row.answer),
    });
  }
  return answers;
}

/**
 * Reads a Lifepath off a stored sheet or a client patch.
 *
 * Deliberately tolerant rather than refusing: every field is free prose that
 * the GM may overwrite by hand („zmień wynik, jeśli nie pasuje do wizji
 * Postaci" — s. 44), so there is nothing here a wrong value could break. The
 * only hard limits are lengths and list sizes, and those are clamped.
 */
export function validateLifepath(raw: unknown, _issues: CpredValidationIssue[]): CpredLifepath {
  const base = createDefaultLifepath();
  if (typeof raw !== 'object' || raw === null) return base;
  const input = raw as Record<string, unknown>;
  const lifepath: CpredLifepath = { ...base };
  for (const field of Object.values(LIFEPATH_FIELD_TABLES)) {
    lifepath[field] = line(input[field]) as never;
  }
  lifepath.language = line(input.language);
  lifepath.friends = readPeople(input.friends, 'friend');
  lifepath.enemies = readEnemies(input.enemies);
  lifepath.tragicLoves = readPeople(input.tragicLoves, 'love');
  lifepath.roleAnswers = readAnswers(input.roleAnswers);
  return lifepath;
}

// ─────────────────────────────── zapis wyniku ───────────────────────────────

/**
 * Where one throw lands. `index` picks the friend / enemy / love; the table id
 * says which of their cells it fills.
 */
export interface CpredLifepathRollTarget {
  tableId: string;
  index?: number;
}

/**
 * Writes a drawn row into the Lifepath.
 *
 * The three kinds of table are told apart by their id alone — a field table, a
 * cell of one of the rolled lists, or a Role question — so the caller never has
 * to say which kind it is asking for, and a table that is none of them is
 * refused rather than silently dropped.
 */
export function applyLifepathEntry(
  lifepath: CpredLifepath,
  table: CpredLifepathTable,
  entry: CpredLifepathEntry,
  index?: number,
): CpredLifepath | null {
  if (isLifepathFieldTable(table.id)) {
    const next: CpredLifepath = { ...lifepath, [LIFEPATH_FIELD_TABLES[table.id]]: entry.text };
    // A Culture of Origin comes with a shortlist of languages; picking one is
    // the player's job, but leaving the field pointing at the old Culture's
    // language would be a lie, so it is cleared with the roll.
    if (table.id === 'culture') next.language = '';
    return next;
  }

  const group = LIFEPATH_GROUP_TABLES[table.id];
  if (group) {
    if (index === undefined || index < 0) return null;
    if (group.group === 'enemies') {
      const enemies = [...lifepath.enemies];
      const enemy = enemies[index];
      if (!enemy) return null;
      enemies[index] = { ...enemy, [group.field]: entry.text };
      return { ...lifepath, enemies };
    }
    const people = [...lifepath[group.group]];
    const person = people[index];
    if (!person) return null;
    people[index] = { ...person, note: entry.text };
    return { ...lifepath, [group.group]: people };
  }

  // Anything else is one of the Role's own questions.
  const answers = [...lifepath.roleAnswers];
  const at = answers.findIndex((answer) => answer.id === table.id);
  const answer: CpredLifepathAnswer = {
    id: table.id,
    question: table.question ?? table.label,
    answer: entry.text,
  };
  if (at === -1) {
    if (answers.length >= LIFEPATH_ROLE_ANSWERS_MAX) return null;
    answers.push(answer);
  } else {
    answers[at] = answer;
  }
  return { ...lifepath, roleAnswers: answers };
}

/**
 * Resizes one of the rolled lists, keeping what is already written in it.
 *
 * Shrinking drops from the end rather than clearing: a second throw of the
 * group die must not wipe the enemy whose name the table has already agreed on.
 */
export function resizeLifepathGroup(
  lifepath: CpredLifepath,
  group: CpredLifepathGroup,
  count: number,
): CpredLifepath {
  const size = Math.max(0, Math.min(LIFEPATH_GROUP_MAX, count));
  if (group === 'enemies') {
    const enemies = [...lifepath.enemies].slice(0, size);
    while (enemies.length < size) enemies.push(emptyLifepathEnemy(`enemy${enemies.length + 1}`));
    return { ...lifepath, enemies };
  }
  const people = [...lifepath[group]].slice(0, size);
  const prefix = group === 'friends' ? 'friend' : 'love';
  while (people.length < size) people.push(emptyLifepathPerson(`${prefix}${people.length + 1}`));
  return { ...lifepath, [group]: people };
}

/**
 * Drops the answers to a Role's questions. Called when the Role changes: „Jakim
 * rodzajem Solo jesteś?" means nothing on a Netrunner's sheet, exactly as a
 * stat spread rolled off the Solo template means nothing on theirs (stage 25a).
 */
export function clearRoleAnswers(lifepath: CpredLifepath): CpredLifepath {
  return { ...lifepath, roleAnswers: [] };
}

/** Keeps only the answers whose question the given Role still asks. */
export function pruneRoleAnswers(
  lifepath: CpredLifepath,
  data: CpredLifepathData,
  roleId: string | null,
): CpredLifepath {
  const known = new Set(lifepathRoleTables(data, roleId).map((table) => table.id));
  const kept = lifepath.roleAnswers.filter((answer) => known.has(answer.id));
  return kept.length === lifepath.roleAnswers.length
    ? lifepath
    : { ...lifepath, roleAnswers: kept };
}

// ──────────────────────────── wróg → szkic bota ────────────────────────────

/**
 * Who from the Lifepath is being turned into a bot. Three kinds because the
 * three tell the model three different things: an enemy is coming for you, a
 * friend has your back, and a tragic love is a wound that still talks.
 */
export type CpredLifepathBotKind = 'enemy' | 'friend' | 'love';

export const LIFEPATH_BOT_KIND_LABELS: Record<CpredLifepathBotKind, string> = {
  enemy: 'Wróg',
  friend: 'Przyjaciel',
  love: 'Dawna miłość',
};

export interface CpredLifepathBotDraft {
  name: string;
  data: Partial<BotProfileData>;
}

function joined(parts: (string | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(' ');
}

/**
 * Turns somebody the Lifepath invented into a bot profile the GM can open in
 * the editor from stage 10.
 *
 * A **draft**, emphatically: the fields are seeded from the table rows and
 * nothing else, because the rows are prompts, not characterisation. What the
 * conversion is really for is that the enemy already exists — the player rolled
 * a reason and a grudge at session zero — and typing that back into the bot
 * editor by hand is the step at which most of these NPCs quietly stop existing.
 */
export function lifepathBotDraft(
  kind: CpredLifepathBotKind,
  person: CpredLifepathPerson | CpredLifepathEnemy,
  characterName: string,
): CpredLifepathBotDraft {
  const who = characterName.trim() || 'Postać gracza';
  const enemy = kind === 'enemy' ? (person as CpredLifepathEnemy) : null;
  const note = kind === 'enemy' ? '' : (person as CpredLifepathPerson).note;
  const name = person.name.trim() || `${LIFEPATH_BOT_KIND_LABELS[kind]} — ${who}`;

  const personality =
    kind === 'enemy'
      ? joined([enemy?.who && `${enemy.who}.`, `Ma powód, żeby nienawidzić: ${who}.`])
      : kind === 'friend'
        ? joined([note && `${note}.`, `Trzyma z ${who}.`])
        : joined([note && `${note}.`, `Był(a) blisko z ${who}, dziś to już przeszłość.`]);

  const motivations =
    kind === 'enemy'
      ? joined([
          enemy?.cause && `Poszło o to: ${enemy.cause}.`,
          enemy?.revenge && `Przy spotkaniu zamierza: ${enemy.revenge}.`,
        ])
      : kind === 'friend'
        ? `Chce, żeby ${who} wyszedł(-a) z tego cało.`
        : `Nie wie, czego chce od ${who} — i to jest problem.`;

  // What the enemy can bring to bear is exactly the thing a bot must not blurt
  // out; the secrets field is the one the prompt keeps behind the teeth.
  const secrets = enemy?.resources ? `Za sobą ma: ${enemy.resources}.` : '';

  return {
    name: name.slice(0, LIFEPATH_LINE_MAX_LENGTH),
    data: {
      type: 'npc',
      persona: {
        personality,
        motivations,
        secrets,
        speechStyle: '',
        catchphrases: [],
      },
      knowledge: {
        world: '',
        campaign: '',
        people: joined([
          `${who} — ${LIFEPATH_BOT_KIND_LABELS[kind].toLowerCase()} z przeszłości.`,
          enemy?.cause && `Zatarg: ${enemy.cause}.`,
          note && `Łączy ich: ${note}.`,
        ]),
        forbidden: '',
      },
    },
  };
}

/** Lifepath questions still unanswered — the wizard's „ile zostało" counter. */
export function lifepathMissing(
  lifepath: CpredLifepath,
  data: CpredLifepathData,
  roleId: string | null,
): number {
  let missing = 0;
  for (const table of data.general) {
    if (isLifepathFieldTable(table.id) && lifepath[LIFEPATH_FIELD_TABLES[table.id]] === '') {
      missing += 1;
    }
  }
  for (const table of lifepathRoleTables(data, roleId)) {
    if (!lifepath.roleAnswers.some((answer) => answer.id === table.id && answer.answer !== '')) {
      missing += 1;
    }
  }
  return missing;
}
