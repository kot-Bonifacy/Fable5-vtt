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
 * Speech (stage 12). The whole profile lives in one JSON column, so adding it
 * needed no migration — `parseBotData` fills the section in for older bots.
 */
export interface BotVoice {
  enabled: boolean;
  /** Id of a bundled Polish preset, or null when a sample is used. */
  presetId: string | null;
  /** `/uploads/voices/...` path of a cloning sample (engines that support it). */
  sampleUrl: string | null;
  /** 0.5–2.0, 1 = preset default. */
  rate: number;
  /**
   * 0.7–1.4, 1 = preset default. Piper has no pitch control, so the engine
   * composes it from synthesis speed and playback sample rate — see the adapter.
   */
  pitch: number;
}

export const BOT_VOICE_RATE_MIN = 0.5;
export const BOT_VOICE_RATE_MAX = 2;
export const BOT_VOICE_PITCH_MIN = 0.7;
export const BOT_VOICE_PITCH_MAX = 1.4;

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
  /** Active in the current session — only active bots speak on chat. */
  active: boolean;
  /**
   * Scene the bot is pinned to („tryb w scenie"): there it also answers a
   * direct continuation of its own last line. Null = present everywhere, but
   * only when called by name.
   */
  sceneId: string | null;
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
  /** Scene pin; null unpins („wszystkie scenki"). */
  sceneId?: string | null;
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

// ---------------------------------------------------------------------------
// Session chat (stage 11) — bots as participants of the campaign chat.
// ---------------------------------------------------------------------------

/** How many past chat lines of the scene may travel back to the model. */
export const BOT_SESSION_HISTORY_MAX_TURNS = 40;
/** Hard cap on one bot turn — the criterion is „the whole thing ≤ ~15 s". */
export const BOT_TURN_TIMEOUT_MS = 20_000;
/** Tokens kept free in the context window for the answer and prompt overhead. */
export const BOT_CONTEXT_SAFETY_TOKENS = 512;
/** Context assumed when the gateway does not report its window. */
export const BOT_CONTEXT_FALLBACK_TOKENS = 8192;

/** Client → server payload of `bot:say` — the GM speaks as a bot (no model). */
export interface BotSayPayload {
  botId: string;
  text: string;
  /** Set to whisper the line privately to one user instead of the whole room. */
  whisperToUserId?: string | null;
}

/** Client → server payload of `bot:stop` — the GM's emergency brake. */
export interface BotStopPayload {
  /** One turn; omit to drop the whole queue. */
  turnId?: string;
}

/**
 * One bot turn in flight, as everyone at the table sees it. `text` carries the
 * provisional answer so chat can stream it; the final, sanitized line arrives
 * as a normal `chat:message` and the entry disappears.
 */
export interface BotActivityEntry {
  turnId: string;
  botId: string;
  name: string;
  portraitUrl: string | null;
  /** `queued` = waiting for the model, `typing` = generating now. */
  state: 'queued' | 'typing';
  /** 0 = generating, 1+ = place in the queue. */
  position: number;
  text: string;
  /**
   * The answer will be spoken (stage 12). Then `text` stays empty on purpose:
   * the line appears only when the NPC starts saying it, so a live preview
   * would give away the punchline.
   */
  speaking?: boolean;
  /**
   * Private turn (answer to a whisper) — delivered only to this user and the
   * GM, so a whispered answer never flashes on other clients.
   */
  whisperToUserId?: string;
}

/** Payload of `bot:activity` — the full list of turns in flight (no seq). */
export interface BotActivityBroadcast {
  entries: BotActivityEntry[];
}

/**
 * A bot could not answer (gateway down, timeout, GM stop). Targeted at the
 * person who called it plus the GM — never a room broadcast, and never stored,
 * so the transcript stays clean.
 */
export interface BotNoticeBroadcast {
  botId: string;
  botName: string;
  code: string;
  detail?: string;
}

/**
 * GM-only diagnostics of a delivered bot line, keyed by the chat message id:
 * players receive the message alone, so a bot's line is indistinguishable from
 * an NPC line typed by the GM (`/jako`).
 */
export interface BotTraceBroadcast {
  messageId: number;
  botId: string;
  /** The answer was regenerated after the bot stepped out of character. */
  retried: boolean;
  /** Polish description of a slip that survived the retry; null when clean. */
  warning: string | null;
  generationMs: number | null;
  completionTokens: number | null;
  /** Chat lines that fitted in the context window, and their token cost. */
  historyTurns: number;
  promptTokens: number | null;
}
