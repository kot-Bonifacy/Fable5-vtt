/**
 * AI gateway contract — core VTT module (no RPG system knowledge).
 *
 * The gateway runs on the GM's PC with the GPU; the VTT server talks to it over
 * HTTP and relays results through Socket.IO. Everything here must degrade: when
 * the gateway is down the rest of the VTT keeps working and bot features are
 * greyed out.
 */

/** Why a generation was requested — drives defaults (e.g. thinking blocks). */
export type AiPurpose = 'npc' | 'gm_assistant' | 'test';

/** llama-server lifecycle as reported by the gateway, plus our own 'unreachable'. */
export type AiLlamaStatus =
  | 'starting'
  | 'ready'
  | 'unhealthy'
  | 'stopped'
  | 'external'
  /** The gateway itself did not answer — set by the VTT server, not the gateway. */
  | 'unreachable';

export interface AiGpuInfo {
  name: string;
  memoryTotalMb: number;
  memoryUsedMb: number;
}

/**
 * Bot availability pushed to clients. Players receive only the fields they need
 * to see features greyed out; model name, GPU and error details are GM-only.
 */
export interface AiStatus {
  /** True only when a generation would actually be accepted right now. */
  available: boolean;
  llama: AiLlamaStatus;
  /** Requests waiting in the gateway queue (0 = free). */
  queueLength: number;
  busy: boolean;
  checkedAt: string;
  // --- GM only (absent for players) ---
  model?: string | null;
  contextSize?: number | null;
  restarts?: number;
  gpu?: AiGpuInfo | null;
  error?: string | null;
}

export function offlineAiStatus(now: Date = new Date()): AiStatus {
  return {
    available: false,
    llama: 'unreachable',
    queueLength: 0,
    busy: false,
    checkedAt: now.toISOString(),
  };
}

/** Strips GM-only diagnostics before sending a status to a player. */
export function publicAiStatus(status: AiStatus): AiStatus {
  return {
    available: status.available,
    llama: status.llama,
    queueLength: status.queueLength,
    busy: status.busy,
    checkedAt: status.checkedAt,
  };
}

/** Client → server payload of `ai:ask` (GM test screen). */
export interface AiAskPayload {
  /** Free-form question; the gateway wraps it into a chat message. */
  prompt: string;
  /** Optional system prompt — stage 10 replaces this with bot profiles. */
  system?: string;
  purpose?: AiPurpose;
  /** Show the model's reasoning; defaults to true for `gm_assistant`. */
  reasoning?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export const MAX_AI_PROMPT_LENGTH = 4000;

/** Server → client streaming chunk of an `ai:ask` answer (targeted, no seq). */
export interface AiChunkBroadcast {
  requestId: string;
  /** `think` arrives only when the request asked for reasoning. */
  kind: 'think' | 'delta';
  text: string;
}

/** Server → client: the request is queued behind other generations. */
export interface AiQueueBroadcast {
  requestId: string;
  position: number;
}

export interface AiUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  generationMs: number | null;
  tokensPerSecond: number | null;
}

export interface AiDoneBroadcast {
  requestId: string;
  usage: AiUsage | null;
}

export interface AiErrorBroadcast {
  requestId: string;
  /** Machine-readable code; the client maps it to a Polish message. */
  code: string;
  detail?: string;
}

export interface AiStatusBroadcast {
  status: AiStatus;
}
