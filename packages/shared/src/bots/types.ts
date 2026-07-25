/**
 * Bot profiles — core VTT feature, no RPG-system knowledge. A profile is
 * everything the GM authors before (and during) a session: who the bot is,
 * what it knows, how it talks and what it has been taught.
 *
 * Visibility rule: profiles carry secrets and GM notes, so they are delivered
 * to the GM room only — players never learn they exist (stage 11 shows them
 * only the bot's chat messages).
 */

export const BOT_SCHEMA_VERSION = 1;

/** `companion` = party NPC with an optional sheet; `gm_assistant` = GM's helper. */
export type BotType = 'npc' | 'companion' | 'gm_assistant';

export const BOT_TYPES = ['npc', 'companion', 'gm_assistant'] as const;

export const BOT_TYPE_LABELS: Record<BotType, string> = {
  npc: 'NPC',
  companion: 'Towarzysz',
  gm_assistant: 'Asystent MG',
};

export const BOT_NAME_MAX_LENGTH = 48;
/** Per free-text profile field (personality, knowledge…). */
export const BOT_FIELD_MAX_LENGTH = 1500;
export const BOT_CATCHPHRASES_MAX = 8;
export const BOT_CATCHPHRASE_MAX_LENGTH = 200;
export const BOT_LESSONS_MAX = 40;
export const BOT_LESSON_MAX_LENGTH = 200;
export const BOT_CORRECTION_MAX_LENGTH = 500;
/** One turn typed into the editor's test conversation. */
export const BOT_TEST_MESSAGE_MAX_LENGTH = 1000;
/** How many past turns of a test conversation travel back to the model. */
export const BOT_HISTORY_MAX_TURNS = 20;

export const BOT_TEMPERATURE_MIN = 0;
export const BOT_TEMPERATURE_MAX = 1.5;
export const BOT_MAX_TOKENS_MIN = 40;
export const BOT_MAX_TOKENS_MAX = 1200;

/** Who the character is — the part that drives voice and behaviour. */
export interface BotPersona {
  personality: string;
  motivations: string;
  /** Never revealed outright; the bot may lie or dodge instead. */
  secrets: string;
  speechStyle: string;
  /** Sample lines; a small model keeps style far better with them. */
  catchphrases: string[];
}

/** What the bot may know. Everything outside this is off-limits by prompt rule. */
export interface BotKnowledge {
  world: string;
  campaign: string;
  /** What it knows about the player characters and other NPCs. */
  people: string;
  /** Explicit blind spots — things it must not know or must not talk about. */
  forbidden: string;
}

export interface BotGeneration {
  temperature: number;
  maxTokens: number;
  /** Thinking blocks; defaults to true only for `gm_assistant`. */
  reasoning: boolean;
}

/**
 * One rule the bot was taught. Stage 10 only produces `gm` lessons (from a GM
 * correction); `self` is reserved for the bot's own conclusions (stage 19).
 */
export interface BotLesson {
  id: string;
  text: string;
  source: 'gm' | 'self';
  enabled: boolean;
  createdAt: string;
  /** The GM's original wording, kept so a lesson can be judged later. */
  note?: string;
}

/**
 * Placeholder for stage 12 (TTS). Declared now so adding speech needs no
 * migration — the whole profile lives in one JSON column.
 */
export interface BotVoice {
  enabled: boolean;
  /** Id of a bundled Polish preset, or null when a sample is used. */
  presetId: string | null;
  /** `/uploads/...` path of a cloning sample. */
  sampleUrl: string | null;
  /** 0.5–1.5, 1 = engine default. */
  rate: number;
}

export interface BotProfileData {
  schemaVersion: typeof BOT_SCHEMA_VERSION;
  type: BotType;
  persona: BotPersona;
  knowledge: BotKnowledge;
  generation: BotGeneration;
  lessons: BotLesson[];
  voice: BotVoice;
}

/** A bot profile as delivered to the GM. */
export interface BotView {
  id: string;
  name: string;
  portraitUrl: string | null;
  /** Linked character sheet (companions); null for plain NPCs. */
  characterId: string | null;
  /** Active in the current session — stage 11 lets active bots speak. */
  active: boolean;
  archived: boolean;
  data: BotProfileData;
  updatedAt: string;
}

/** One archetype from `data/public/bot-templates/index.json`. */
export interface BotTemplate {
  id: string;
  label: string;
  description: string;
  /** Suggested name — the GM renames it right after creating the bot. */
  name: string;
  data: Partial<BotProfileData>;
}

export interface BotCreatePayload {
  name: string;
  /** Full profile body — „nowy bot z szablonu" sends the archetype here. */
  data?: Partial<BotProfileData>;
}

export interface BotPatch {
  name?: string;
  portraitUrl?: string | null;
  characterId?: string | null;
  active?: boolean;
  archived?: boolean;
  /** Partial profile body; top-level keys replace the stored ones. */
  data?: Record<string, unknown>;
}

export interface BotUpdatePayload {
  botId: string;
  patch: BotPatch;
}

export interface BotIdPayload {
  botId: string;
}

/** One past turn of the editor's test conversation. */
export interface BotChatTurn {
  role: 'user' | 'bot';
  text: string;
  /** Who said it (the GM's stand-in name); defaults to „Mistrz Gry". */
  speaker?: string;
}

/** Client → server payload of `bot:chat` (test conversation in the editor). */
export interface BotChatPayload {
  botId: string;
  message: string;
  /** Preceding turns, oldest first; the server trims to the token budget. */
  history?: BotChatTurn[];
  speaker?: string;
}

/** Client → server payload of `bot:teach` — a GM correction becomes a lesson. */
export interface BotTeachPayload {
  botId: string;
  correction: string;
  /** The bot line that provoked the correction (helps the model compress it). */
  quote?: string;
}

export interface BotUpsertBroadcast {
  bot: BotView;
}

export interface BotDeleteBroadcast {
  botId: string;
}

/** Provisional streamed text — replaced by the final `bot:reply`. */
export interface BotChunkBroadcast {
  requestId: string;
  botId: string;
  text: string;
  /** The answer is being regenerated — drop what was streamed so far. */
  reset?: boolean;
}

/**
 * Final, sanitized answer. `retried` marks a regenerated answer and `warning`
 * carries the break reason the GM should see (both stayed inside the server
 * until now — the player-facing path in stage 11 sends neither).
 */
export interface BotReplyBroadcast {
  requestId: string;
  botId: string;
  text: string;
  retried: boolean;
  warning: string | null;
  usage: { completionTokens: number | null; generationMs: number | null } | null;
}

export interface BotErrorBroadcast {
  requestId: string;
  botId: string;
  code: string;
  detail?: string;
}
