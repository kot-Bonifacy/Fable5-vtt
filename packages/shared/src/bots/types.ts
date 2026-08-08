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

/**
 * Kolekcje, z których bot może czytać (etapy 19b i 19c): baza wiedzy kampanii i
 * dziennik sesji. Podręcznika NIE ma na liście świadomie — żelazna zasada promptu
 * mówi „nie znasz zasad gry", a jego treść jest objęta prawem autorskim i
 * wypowiedź bota idzie na czat do graczy. Kolekcja `rulebook` zostaje przy
 * asystencie zasad.
 *
 * Uwaga do dziennika: wpis rodzi się jako „tylko MG", więc zaznaczenie tego
 * źródła samo z siebie nie daje botowi dostępu do niczego — dopiero MG decyduje
 * per wpis, która sesja jest już „znana w mieście".
 */
export const BOT_KNOWLEDGE_SOURCES = ['campaign', 'journal'] as const;
export type BotKnowledgeSource = (typeof BOT_KNOWLEDGE_SOURCES)[number];

export const BOT_KNOWLEDGE_SOURCE_LABELS: Record<BotKnowledgeSource, string> = {
  campaign: 'Baza wiedzy kampanii',
  journal: 'Dziennik kampanii (streszczenia sesji)',
};

export const BOT_KNOWLEDGE_TOP_K_MIN = 1;
export const BOT_KNOWLEDGE_TOP_K_MAX = 6;
export const BOT_KNOWLEDGE_TAGS_MAX = 12;

/**
 * Co bot ma prawo wyszukać poza własnym profilem. **Pusty zbiór źródeł = bot zna
 * wyłącznie to, co MG wpisał mu w profilu** — dokładnie zachowanie z etapu 11.
 */
export interface BotKnowledgeContext {
  sources: BotKnowledgeSource[];
  /** Filtr tagów w tych kolekcjach; pusty = każdy wpis w kolekcji. */
  tags: string[];
  /** Ile fragmentów dokleić do promptu. */
  topK: number;
}

/**
 * Ile bot może zrobić sam (etap 20a).
 *
 * - `auto` — akcja wykonuje się od razu,
 * - `proposal` — bot pisze zamiar, ktoś klika „Zatwierdź",
 * - `controlled` — bot tylko mówi; mechanikę robi za niego człowiek.
 *
 * Nowy bot startuje na `proposal`: żadna akcja nie wykonuje się bez wiedzy MG,
 * dopóki MG świadomie nie przełączy tego bota na automat.
 */
export const BOT_AUTONOMY_MODES = ['auto', 'proposal', 'controlled'] as const;
export type BotAutonomy = (typeof BOT_AUTONOMY_MODES)[number];

export const BOT_AUTONOMY_LABELS: Record<BotAutonomy, string> = {
  auto: 'Automat',
  proposal: 'Propozycja',
  controlled: 'Kontrolowany',
};

export const BOT_AUTONOMY_HINTS: Record<BotAutonomy, string> = {
  auto: 'Bot wykonuje akcję od razu — rzut ląduje na czacie bez pytania.',
  proposal: 'Bot pisze, co chce zrobić; akcja czeka na „Zatwierdź".',
  controlled: 'Bot tylko mówi — mechanikę wykonuje za niego MG albo gracz.',
};

export interface BotProfileData {
  schemaVersion: typeof BOT_SCHEMA_VERSION;
  type: BotType;
  persona: BotPersona;
  knowledge: BotKnowledge;
  /** Uprawnienia do bazy wiedzy kampanii (etap 19b). */
  knowledgeContext: BotKnowledgeContext;
  generation: BotGeneration;
  lessons: BotLesson[];
  voice: BotVoice;
  /** Ile bot może zrobić sam w mechanice (etap 20a). */
  autonomy: BotAutonomy;
  /**
   * Gracz, który obok MG może zatwierdzać i odrzucać propozycje tego bota
   * (etap 20a). Konto, nie karta postaci: sterowanie towarzyszem można oddać
   * komukolwiek przy stole, także komuś, kto nie jest właścicielem jego karty.
   * `null` = decyduje wyłącznie MG.
   */
  controllerUserId: string | null;
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
  /**
   * Titles of the knowledge entries pasted into this prompt (stage 19b). Titles
   * only — the entries themselves are GM notes and the trace travels with a
   * message id, so a full body here would be one accident away from the table.
   */
  knowledgeTitles?: string[];
  /** How long the knowledge lookup took — it sits in front of the generation. */
  knowledgeMs?: number;
  /**
   * The attitude injected into this prompt (stage 19c). Present only when the
   * caller turned out to be a player character the bot has a relation with —
   * which is exactly the question the GM asks when a line sounds too warm.
   */
  relation?: { characterName: string; value: number };
}

// ---------------------------------------------------------------------------
// Akcje botów w mechanice (etap 20a).
// ---------------------------------------------------------------------------

/**
 * Propozycja akcji bota, jak widzi ją MG (i sterujący gracz) na czacie.
 *
 * Siedzi w `payload` wiadomości rodzaju `proposal`, a nie w pamięci serwera —
 * inaczej restart w środku sesji zostawiałby kartę z martwymi przyciskami.
 * `resolution` jest tym, co odróżnia kartę, na którą ktoś już odpowiedział.
 */
export interface BotActionProposal {
  botId: string;
  botName: string;
  /** Karta postaci, którą bot chce rzucać; null = bot jej nie ma. */
  characterId: string | null;
  characterName: string | null;
  /** Nazwa testu w języku MG („Percepcja"). */
  optionLabel: string;
  /** Nieprzezroczysty identyfikator (u nas: id umiejętności CP RED). */
  optionId: string;
  /**
   * Akcja bojowa zamiast rzutu z karty (etap 20b).
   *
   * Ta sama karta, drugi rodzaj treści: MG czyta „Atak: Rico — Ciężki pistolet"
   * tam, gdzie 20a pisało „Percepcja", i klika te same dwa przyciski. Osobne
   * pole, a nie inne znaczenie `optionId`, bo po zatwierdzeniu wykonanie idzie
   * zupełnie inną ścieżką — `attack:roll` albo `token:move`, nie `character:roll`.
   */
  combat?: BotCombatProposal;
  /** Jedno zdanie modelu, dlaczego właśnie to. */
  reason: string;
  /** Wypowiedź, która wywołała decyzję — kontekst dla klikającego. */
  request: string;
  /** Kto obok MG może to zatwierdzić; null = tylko MG. */
  controllerUserId: string | null;
  /** Ustawione po kliknięciu; karta przestaje wtedy oferować przyciski. */
  resolution?: 'approved' | 'rejected';
  resolvedByName?: string;
  /** Wiadomość z kartą rzutu, która powstała po zatwierdzeniu. */
  rollMessageId?: number;
  /** Dlaczego akcja jest niewykonalna (bot bez karty, brak umiejętności). */
  blocked?: string;
}

/**
 * Akcja bojowa zaproponowana przez bota (etap 20b) — treść karty i wszystko,
 * czego wykonanie potrzebuje po kliknięciu „Zatwierdź".
 *
 * Identyfikatory (token celu, slot broni) siedzą tu, a nie w pamięci serwera,
 * z tego samego powodu co reszta karty: propozycja ma przeżyć restart. Ale
 * **żaden z nich nie jest zaufany po powrocie** — przed wykonaniem wszystko
 * przechodzi te same bezpieczniki co przy decyzji (cel istnieje, jest widoczny,
 * nie jest samym botem), bo między propozycją a klikiem mogła minąć runda.
 */
export interface BotCombatProposal {
  /** Co bot chce zrobić: `attack`, `approach`, `retreat`, `reload`, `pass`. */
  kind: string;
  /** Jedno zdanie do karty („Atak: Rico — Ciężki pistolet"). */
  summary: string;
  /** Token, którego akcja dotyczy; null dla przeładowania i pasa. */
  targetTokenId: string | null;
  targetLabel: string | null;
  /** Slot paska akcji z 16f (`weapon:<rowId>:<mode>`); null, gdy bez broni. */
  weaponSlotId: string | null;
  weaponLabel: string | null;
  /** Token bota, który ma wykonać akcję — figura, nie karta. */
  actorTokenId: string;
  /** Który to krok tury; po wykonaniu serwer sam robi następny. */
  step: number;
}

/** Klient → serwer: MG albo sterujący gracz odpowiada na kartę propozycji. */
export interface BotProposalResolvePayload {
  messageId: number;
  approve: boolean;
}

/**
 * Klient → serwer: „Graj turę" (etap 20b). MG wskazuje figurę prowadzoną przez
 * bota, a serwer rozgrywa jej turę zgodnie z trybem autonomii tego bota.
 */
export interface BotPlayTurnPayload {
  /** Figura na mapie; bot jest z niej wyliczany po karcie postaci. */
  tokenId: string;
}

/** Ack `bot:play-turn` — ile kroków poszło i czym się skończyły. */
export interface BotPlayTurnResult {
  /** Ostatni wynik: wykonane, zaproponowane, odmówione albo pas. */
  outcome: 'executed' | 'proposed' | 'refused' | 'pass';
  /** Ile decyzji zapadło (0 = bot nie dostał nawet pierwszego pytania). */
  steps: number;
  /** Powód po polsku, gdy tura się nie odbyła. */
  refusal?: string;
}

/** Klient → serwer: „Poproś o akcję" — ścieżka pewna, z pominięciem detektora. */
export interface BotActPayload {
  botId: string;
  /** Czego MG chce; trafia do promptu decyzyjnego jako wypowiedź. */
  request: string;
}

/**
 * Ślad decyzji mechanicznej bota — wyłącznie dla MG, jak `bot:trace` z 19b.
 * Gracze widzą samą kartę rzutu, nieodróżnialną od rzutu człowieka.
 */
export interface BotActionTraceBroadcast {
  botId: string;
  botName: string;
  /** Co model wybrał: `check`, `talk` albo `null`, gdy odpowiedź odpadła. */
  decision: string | null;
  /** Nazwa testu, gdy padł wybór. */
  optionLabel?: string;
  reason?: string;
  /** Tryb autonomii, w którym decyzja zapadła. */
  autonomy: BotAutonomy;
  /** Co się z nią stało: wykonana, zaproponowana, odrzucona przez walidację. */
  outcome: 'executed' | 'proposed' | 'refused' | 'talk' | 'pass';
  /** Powód odrzucenia po polsku. */
  refusal?: string;
  /** Ile trwał sam przebieg decyzyjny. */
  decisionMs: number;
  /** Czy poszła druga próba po nieudanej walidacji. */
  retried: boolean;
  /**
   * Krok tury bojowej (etap 20b): który to raz w tej turze i co bot widział.
   *
   * MG czyta to, gdy bot „zrobił coś dziwnego": lista figur w menu odpowiada na
   * pytanie, czy bot w ogóle widział tego, kogo miał zaatakować — a to jest
   * najczęstsza odpowiedź, i nie da się jej odgadnąć z samej decyzji.
   */
  combat?: {
    step: number;
    /** Figura, którą bot prowadzi. */
    actorName: string;
    /** Etykiety figur, które miał w menu (widoczne dla jego tokenu). */
    figures: string[];
    /** Jedno zdanie o wybranej akcji. */
    summary?: string;
  };
}
