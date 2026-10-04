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
 * Why AI is off for a campaign (stage 44d). `offline` is the gateway itself;
 * the rest come from the owner's AI being shared with other GMs.
 */
export type AiAccessReason = 'offline' | 'busy' | 'no-consent' | 'sharing-off' | 'owner-absent';

/** Polish sentence for the GM — bot panel, AI panel, refused requests. */
export function aiAccessReasonText(reason: AiAccessReason): string {
  switch (reason) {
    case 'offline':
      return 'AI Gateway nie odpowiada.';
    case 'busy':
      return 'AI zajęte przez inną sesję.';
    case 'no-consent':
      return 'Brak zgody właściciela na AI — poproś o dostęp w Panelu MG.';
    case 'sharing-off':
      return 'Właściciel nie udostępnia teraz AI.';
    case 'owner-absent':
      return 'Właściciela serwera nie ma przy komputerze — AI wróci, gdy wejdzie i je udostępni.';
  }
}

/**
 * Powód odmowy z gotowego zdania — brama AI wysyła w zdarzeniu błędu sam tekst
 * (`detail`), a zdanie o nieudanej turze bota chce wiedzieć, że to nie awaria.
 */
export function aiAccessReasonOfText(text: string | undefined): AiAccessReason | null {
  if (!text) return null;
  const reasons: AiAccessReason[] = [
    'offline',
    'busy',
    'no-consent',
    'sharing-off',
    'owner-absent',
  ];
  return reasons.find((reason) => aiAccessReasonText(reason) === text) ?? null;
}

/**
 * Dlaczego AI nie działa, w jednym zdaniu bez kropki — do komunikatów paneli
 * (dziennik, baza wiedzy). Bez powodu albo przy martwym gatewayu: brak połączenia.
 */
export function aiUnavailableText(status: AiStatus): string {
  const reason = status.reason;
  if (!reason || reason === 'offline') return 'brak połączenia z AI Gateway';
  return aiAccessReasonText(reason).replace(/\.$/, '');
}

export function isAiAccessReason(value: unknown): value is AiAccessReason {
  return (
    value === 'offline' ||
    value === 'busy' ||
    value === 'no-consent' ||
    value === 'sharing-off' ||
    value === 'owner-absent'
  );
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
  /**
   * Why bots are off for THIS campaign although the gateway may be fine
   * (stage 44d: the owner's consent, switch, presence and the AI lease).
   * GM only — a player learns just „boty niedostępne”.
   */
  reason?: AiAccessReason | null;
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
