import { normalizeKnowledgeTags } from '../knowledge.js';
import {
  BOT_AUTONOMY_MODES,
  BOT_CATCHPHRASES_MAX,
  BOT_CATCHPHRASE_MAX_LENGTH,
  BOT_FIELD_MAX_LENGTH,
  BOT_KNOWLEDGE_SOURCES,
  BOT_KNOWLEDGE_TOP_K_MAX,
  BOT_KNOWLEDGE_TOP_K_MIN,
  BOT_LESSONS_MAX,
  BOT_LESSON_MAX_LENGTH,
  BOT_MAX_TOKENS_MAX,
  BOT_MAX_TOKENS_MIN,
  BOT_NAME_MAX_LENGTH,
  BOT_SCHEMA_VERSION,
  BOT_TEMPERATURE_MAX,
  BOT_TEMPERATURE_MIN,
  BOT_TYPES,
  type BotAutonomy,
  type BotGeneration,
  type BotKnowledge,
  type BotKnowledgeContext,
  type BotKnowledgeSource,
  type BotLesson,
  type BotPersona,
  type BotProfileData,
  type BotTemplate,
  type BotType,
} from './types.js';

/**
 * Profile storage: defaults, validation and merging. The same code runs on the
 * client (inline hints while editing) and on the server (authoritative check),
 * so both reject the same input with the same Polish message.
 */

export interface BotValidationIssue {
  /** Dot path of the offending field, e.g. „persona.personality". */
  field: string;
  message: string;
}

export function defaultBotGeneration(type: BotType): BotGeneration {
  // NPCs answer in a few sentences; the GM assistant may need room to explain.
  return type === 'gm_assistant'
    ? { temperature: 0.6, maxTokens: 600, reasoning: true }
    : { temperature: 0.85, maxTokens: 200, reasoning: false };
}

export function createDefaultBotData(type: BotType = 'npc'): BotProfileData {
  return {
    schemaVersion: BOT_SCHEMA_VERSION,
    type,
    persona: {
      personality: '',
      motivations: '',
      secrets: '',
      speechStyle: '',
      catchphrases: [],
    },
    knowledge: { world: '', campaign: '', people: '', forbidden: '' },
    // Pusty zbiór źródeł to zachowanie z etapu 11: bot zna wyłącznie swój profil.
    // Nowy bot startuje bez dostępu do bazy wiedzy — MG musi go nadać świadomie.
    knowledgeContext: { sources: [], tags: [], topK: 3 },
    generation: defaultBotGeneration(type),
    lessons: [],
    // Etap 20a: nowy bot niczego nie robi sam. Przełączenie na automat to jedno
    // kliknięcie, ale musi być kliknięciem MG — świeżo napisany bot potrafi
    // wybrać bzdurę, a przy „automacie" widać to dopiero po fakcie.
    autonomy: 'proposal',
    controllerUserId: null,
  };
}

export function sanitizeBotName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > BOT_NAME_MAX_LENGTH) return null;
  return trimmed;
}

function issue(field: string, message: string): BotValidationIssue {
  return { field, message };
}

function validateText(
  raw: unknown,
  field: string,
  label: string,
  max: number,
  issues: BotValidationIssue[],
): string | undefined {
  if (typeof raw !== 'string') {
    issues.push(issue(field, `${label} musi być tekstem.`));
    return undefined;
  }
  if (raw.length > max) {
    issues.push(issue(field, `${label} jest za długi (limit ${max} znaków).`));
    return undefined;
  }
  return raw;
}

function validatePersona(raw: unknown, issues: BotValidationIssue[]): BotPersona | undefined {
  if (typeof raw !== 'object' || raw === null) {
    issues.push(issue('persona', 'Nieprawidłowy format profilu psychologicznego.'));
    return undefined;
  }
  const input = raw as Record<string, unknown>;
  type PersonaTextField = Exclude<keyof BotPersona, 'catchphrases'>;
  const fields: [PersonaTextField, string][] = [
    ['personality', 'Osobowość'],
    ['motivations', 'Motywacje'],
    ['secrets', 'Sekrety'],
    ['speechStyle', 'Styl wypowiedzi'],
  ];
  const persona = { catchphrases: [] } as unknown as BotPersona;
  for (const [key, label] of fields) {
    const value = validateText(
      input[key] ?? '',
      `persona.${key}`,
      label,
      BOT_FIELD_MAX_LENGTH,
      issues,
    );
    if (value === undefined) return undefined;
    persona[key] = value;
  }

  const rawPhrases = input.catchphrases ?? [];
  if (!Array.isArray(rawPhrases)) {
    issues.push(issue('persona.catchphrases', 'Nieprawidłowy format odzywek.'));
    return undefined;
  }
  if (rawPhrases.length > BOT_CATCHPHRASES_MAX) {
    issues.push(issue('persona.catchphrases', `Za dużo odzywek (limit ${BOT_CATCHPHRASES_MAX}).`));
    return undefined;
  }
  const catchphrases: string[] = [];
  for (const phrase of rawPhrases) {
    const value = validateText(
      phrase,
      'persona.catchphrases',
      'Odzywka',
      BOT_CATCHPHRASE_MAX_LENGTH,
      issues,
    );
    if (value === undefined) return undefined;
    // Empty rows are the editor's „add another" placeholder — just drop them.
    if (value.trim().length > 0) catchphrases.push(value.trim());
  }
  persona.catchphrases = catchphrases;
  return persona;
}

function validateKnowledge(raw: unknown, issues: BotValidationIssue[]): BotKnowledge | undefined {
  if (typeof raw !== 'object' || raw === null) {
    issues.push(issue('knowledge', 'Nieprawidłowy format kontekstu wiedzy.'));
    return undefined;
  }
  const input = raw as Record<string, unknown>;
  const fields: [keyof BotKnowledge, string][] = [
    ['world', 'Wiedza o świecie'],
    ['campaign', 'Wiedza o kampanii'],
    ['people', 'Wiedza o ludziach'],
    ['forbidden', 'Czego nie wie'],
  ];
  const knowledge = {} as BotKnowledge;
  for (const [key, label] of fields) {
    const value = validateText(
      input[key] ?? '',
      `knowledge.${key}`,
      label,
      BOT_FIELD_MAX_LENGTH,
      issues,
    );
    if (value === undefined) return undefined;
    knowledge[key] = value;
  }
  return knowledge;
}

function validateKnowledgeContext(
  raw: unknown,
  issues: BotValidationIssue[],
): BotKnowledgeContext | undefined {
  if (typeof raw !== 'object' || raw === null) {
    issues.push(issue('knowledgeContext', 'Nieprawidłowy format uprawnień do bazy wiedzy.'));
    return undefined;
  }
  const input = raw as Record<string, unknown>;

  const rawSources = Array.isArray(input.sources) ? input.sources : [];
  const sources: BotKnowledgeSource[] = [];
  for (const entry of rawSources) {
    if (!BOT_KNOWLEDGE_SOURCES.includes(entry as BotKnowledgeSource)) {
      issues.push(issue('knowledgeContext.sources', 'Nieznane źródło wiedzy.'));
      return undefined;
    }
    if (!sources.includes(entry as BotKnowledgeSource)) sources.push(entry as BotKnowledgeSource);
  }

  const topK = input.topK ?? 3;
  if (
    !Number.isInteger(topK) ||
    (topK as number) < BOT_KNOWLEDGE_TOP_K_MIN ||
    (topK as number) > BOT_KNOWLEDGE_TOP_K_MAX
  ) {
    issues.push(
      issue(
        'knowledgeContext.topK',
        `Liczba fragmentów musi mieścić się w zakresie ${BOT_KNOWLEDGE_TOP_K_MIN}–${BOT_KNOWLEDGE_TOP_K_MAX}.`,
      ),
    );
    return undefined;
  }

  // Tagi normalizuje ta sama funkcja co po stronie wpisu — inaczej „Gangi" na
  // profilu nigdy nie trafiłoby w „gangi" na wpisie.
  return { sources, tags: normalizeKnowledgeTags(input.tags), topK: topK as number };
}

function validateGeneration(
  raw: unknown,
  type: BotType,
  issues: BotValidationIssue[],
): BotGeneration | undefined {
  if (typeof raw !== 'object' || raw === null) {
    issues.push(issue('generation', 'Nieprawidłowy format parametrów generacji.'));
    return undefined;
  }
  const input = raw as Record<string, unknown>;
  const fallback = defaultBotGeneration(type);

  const temperature = input.temperature ?? fallback.temperature;
  if (
    typeof temperature !== 'number' ||
    !Number.isFinite(temperature) ||
    temperature < BOT_TEMPERATURE_MIN ||
    temperature > BOT_TEMPERATURE_MAX
  ) {
    issues.push(
      issue(
        'generation.temperature',
        `Temperatura musi mieścić się w zakresie ${BOT_TEMPERATURE_MIN}–${BOT_TEMPERATURE_MAX}.`,
      ),
    );
    return undefined;
  }

  const maxTokens = input.maxTokens ?? fallback.maxTokens;
  if (
    !Number.isInteger(maxTokens) ||
    (maxTokens as number) < BOT_MAX_TOKENS_MIN ||
    (maxTokens as number) > BOT_MAX_TOKENS_MAX
  ) {
    issues.push(
      issue(
        'generation.maxTokens',
        `Długość odpowiedzi musi być liczbą od ${BOT_MAX_TOKENS_MIN} do ${BOT_MAX_TOKENS_MAX} tokenów.`,
      ),
    );
    return undefined;
  }

  const reasoning = input.reasoning ?? fallback.reasoning;
  if (typeof reasoning !== 'boolean') {
    issues.push(issue('generation.reasoning', 'Nieprawidłowa wartość pola rozumowania.'));
    return undefined;
  }
  return { temperature, maxTokens: maxTokens as number, reasoning };
}

function validateLessons(raw: unknown, issues: BotValidationIssue[]): BotLesson[] | undefined {
  if (!Array.isArray(raw)) {
    issues.push(issue('lessons', 'Nieprawidłowy format wniosków.'));
    return undefined;
  }
  if (raw.length > BOT_LESSONS_MAX) {
    issues.push(issue('lessons', `Za dużo wniosków (limit ${BOT_LESSONS_MAX}).`));
    return undefined;
  }
  const lessons: BotLesson[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      issues.push(issue('lessons', 'Nieprawidłowy wniosek.'));
      return undefined;
    }
    const input = entry as Record<string, unknown>;
    const text = validateText(input.text, 'lessons', 'Wniosek', BOT_LESSON_MAX_LENGTH, issues);
    if (text === undefined) return undefined;
    if (typeof input.id !== 'string' || input.id.length === 0 || input.id.length > 32) {
      issues.push(issue('lessons', 'Nieprawidłowy wniosek.'));
      return undefined;
    }
    const note =
      input.note === undefined || input.note === null
        ? undefined
        : validateText(input.note, 'lessons', 'Uwaga MG', BOT_CATCHPHRASE_MAX_LENGTH * 3, issues);
    if (input.note !== undefined && input.note !== null && note === undefined) return undefined;
    lessons.push({
      id: input.id,
      text: text.trim(),
      source: input.source === 'self' ? 'self' : 'gm',
      enabled: input.enabled !== false,
      createdAt: typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString(),
      ...(note !== undefined ? { note } : {}),
    });
  }
  return lessons;
}

/**
 * Validates one profile patch (any subset of top-level keys). `type` is needed
 * for generation defaults, so callers pass the currently stored type.
 */
export function validateBotDataPatch(
  raw: unknown,
  currentType: BotType = 'npc',
): { ok: true; patch: Partial<BotProfileData> } | { ok: false; issues: BotValidationIssue[] } {
  const issues: BotValidationIssue[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, issues: [issue('data', 'Nieprawidłowe dane bota.')] };
  }
  const input = raw as Record<string, unknown>;
  const patch: Partial<BotProfileData> = {};

  let type = currentType;
  if ('type' in input) {
    if (!BOT_TYPES.includes(input.type as BotType)) {
      issues.push(issue('type', 'Nieznany typ bota.'));
    } else {
      type = input.type as BotType;
      patch.type = type;
    }
  }
  if ('persona' in input) {
    const persona = validatePersona(input.persona, issues);
    if (persona) patch.persona = persona;
  }
  if ('knowledge' in input) {
    const knowledge = validateKnowledge(input.knowledge, issues);
    if (knowledge) patch.knowledge = knowledge;
  }
  if ('knowledgeContext' in input) {
    const context = validateKnowledgeContext(input.knowledgeContext, issues);
    if (context) patch.knowledgeContext = context;
  }
  if ('generation' in input) {
    const generation = validateGeneration(input.generation, type, issues);
    if (generation) patch.generation = generation;
  }
  if ('lessons' in input) {
    const lessons = validateLessons(input.lessons, issues);
    if (lessons) patch.lessons = lessons;
  }
  // `voice` z etapu 12 jest świadomie pomijane: mowa botów została wycofana, a
  // stare profile mogą mieć tę sekcję w JSON-ie — patch bez niej po prostu
  // przestaje ją zapisywać, zamiast odrzucać całe żądanie.
  if ('autonomy' in input) {
    if (!BOT_AUTONOMY_MODES.includes(input.autonomy as BotAutonomy)) {
      issues.push(issue('autonomy', 'Nieznany tryb autonomii.'));
    } else {
      patch.autonomy = input.autonomy as BotAutonomy;
    }
  }
  if ('controllerUserId' in input) {
    // Czy ten identyfikator należy do członka kampanii, rozstrzyga serwer —
    // tutaj sprawdzamy sam kształt, jak przy `characterId` w `BotPatch`.
    const controller = input.controllerUserId;
    if (controller === null || controller === undefined) {
      patch.controllerUserId = null;
    } else if (typeof controller === 'string' && controller.length > 0 && controller.length <= 64) {
      patch.controllerUserId = controller;
    } else {
      issues.push(issue('controllerUserId', 'Nieprawidłowy sterujący gracz.'));
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, patch };
}

/** Merges a validated patch into stored data (top-level keys replace). */
export function mergeBotData(
  current: BotProfileData,
  patch: Partial<BotProfileData>,
): BotProfileData {
  return {
    ...current,
    ...patch,
    schemaVersion: BOT_SCHEMA_VERSION,
  };
}

/**
 * Reads the stored JSON, filling in anything a older/partial profile lacks —
 * a bot must never fail to load because a field was added later.
 */
export function parseBotData(raw: unknown): BotProfileData {
  let input: unknown = raw;
  if (typeof raw === 'string') {
    try {
      input = JSON.parse(raw);
    } catch {
      input = {};
    }
  }
  const source = (typeof input === 'object' && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  const type = BOT_TYPES.includes(source.type as BotType) ? (source.type as BotType) : 'npc';
  const base = createDefaultBotData(type);
  const result = validateBotDataPatch(source, type);
  return result.ok ? mergeBotData(base, result.patch) : base;
}

/**
 * Reads the archetype library. Malformed rows are dropped rather than
 * rejected — a broken template file must not take the editor down.
 */
export function parseBotTemplates(raw: unknown): BotTemplate[] {
  const input = (raw as { templates?: unknown })?.templates;
  if (!Array.isArray(input)) return [];
  return input.filter(
    (entry): entry is BotTemplate =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as BotTemplate).id === 'string' &&
      typeof (entry as BotTemplate).label === 'string' &&
      typeof (entry as BotTemplate).name === 'string' &&
      typeof (entry as BotTemplate).data === 'object' &&
      (entry as BotTemplate).data !== null,
  );
}

/** Short id for a lesson row (validation caps ids at 32 chars). */
function lessonId(): string {
  return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createLesson(
  text: string,
  source: BotLesson['source'] = 'gm',
  note?: string,
): BotLesson {
  return {
    id: lessonId(),
    text: text.trim().slice(0, BOT_LESSON_MAX_LENGTH),
    source,
    enabled: true,
    createdAt: new Date().toISOString(),
    ...(note ? { note: note.trim() } : {}),
  };
}

/** Appends a lesson, dropping the oldest one when the cap is reached. */
export function appendLesson(data: BotProfileData, lesson: BotLesson): BotProfileData {
  const lessons = [...data.lessons, lesson];
  return { ...data, lessons: lessons.slice(-BOT_LESSONS_MAX) };
}
