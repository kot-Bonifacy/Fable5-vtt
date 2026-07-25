/**
 * Speech of bots (stage 12) — types shared by the client, the server and the
 * voice catalogue in `data/public/tts-voices/voices.json`.
 *
 * The one idea worth knowing: a spoken line does not appear on chat all at
 * once. It is written out word by word, in step with the audio, as if someone
 * at the table were taking down what the NPC says. The rhythm travels as
 * `reveal` — „at this millisecond, this many leading characters are visible" —
 * so a muted player sees exactly the same pacing as everyone else, and the
 * client needs to know nothing about phonemes.
 */

/** One point of the writing-out rhythm. */
export interface SpeechRevealPoint {
  /** Milliseconds since playback started. */
  ms: number;
  /** How many leading characters of the line are visible at that moment. */
  chars: number;
}

/** Audio attached to a chat line, plus the rhythm its text is revealed with. */
export interface SpeechTrack {
  /** `/api/tts/<id>` — null when synthesis failed (line then shows at once). */
  audioUrl: string | null;
  durationMs: number;
  reveal: SpeechRevealPoint[];
  /** Preset the line was spoken with; diagnostics only. */
  voiceId: string | null;
}

/** One preset from `data/public/tts-voices/voices.json`. */
export interface TtsVoicePreset {
  id: string;
  name: string;
  description: string;
  engine: string;
  /** Engine-side model id (Piper: file name without `.onnx`). */
  model: string;
  speed: number;
  pitch: number;
}

export interface TtsVoiceCatalogue {
  schemaVersion: number;
  voices: TtsVoicePreset[];
}

/** Speech status as the GM sees it (players get `SpeechStatusPublic`). */
export interface SpeechStatus {
  /** Engine can synthesize right now (gateway up, model present). */
  available: boolean;
  /** GM's session-wide switch. */
  enabled: boolean;
  engine: string;
  device: string;
  loaded: boolean;
  voices: number;
  queueLength: number;
  syntheses: number;
  lastSynthMs: number | null;
}

/**
 * What a player may know: whether bots speak at all. Engine, device, VRAM and
 * counters stay with the GM — same rule as the AI status in stage 09.
 */
export interface SpeechStatusPublic {
  available: boolean;
  enabled: boolean;
}

export function publicSpeechStatus(status: SpeechStatus): SpeechStatusPublic {
  return { available: status.available, enabled: status.enabled };
}

/** GM toggles speech for the whole session. */
export interface SpeechTogglePayload {
  enabled: boolean;
}

/** „Posłuchaj" in the bot editor: synthesize a sample without touching chat. */
export interface SpeechPreviewPayload {
  botId?: string;
  /** Preset to try; falls back to the bot's own when omitted. */
  presetId?: string | null;
  rate?: number;
  pitch?: number;
  /** Sample text; the server substitutes a default when empty. */
  text?: string;
}

export interface SpeechPreviewResult {
  audioUrl: string;
  durationMs: number;
  reveal: SpeechRevealPoint[];
  /** Text after normalisation — shows the GM how numbers and abbreviations read. */
  spokenText: string;
  synthMs: number;
}

/** Uploaded voice sample limits (`/api/uploads/voices`). */
export const VOICE_SAMPLE_MAX_BYTES = 8 * 1024 * 1024;
export const VOICE_SAMPLE_MIN_SECONDS = 3;
export const VOICE_SAMPLE_MAX_SECONDS = 30;

export const SPEECH_PREVIEW_TEXT =
  'Nie znam cię, więc mów szybko. Za 250 eurodolarów wskażę ci właściwe drzwi w Watson.';

/**
 * How long a client may wait for late audio before giving up and showing the
 * line at once. Keeps a chat message from hanging invisible if the audio URL
 * never becomes playable.
 */
export const SPEECH_AUDIO_TIMEOUT_MS = 4000;
