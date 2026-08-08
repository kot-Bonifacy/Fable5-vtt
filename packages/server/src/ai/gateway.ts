import type {
  AiGpuInfo,
  AiPurpose,
  AiStatus,
  AiTtsInfo,
  AiUsage,
  RulesIndexStatus,
  RulesPassage,
} from '@vtt/shared';
import { emptyRulesIndexStatus, offlineAiStatus } from '@vtt/shared';

/** Shape of `GET /health` on the gateway (Python side uses snake_case). */
interface GatewayHealth {
  status: 'ok' | 'degraded';
  llama: string;
  model: string | null;
  context_size: number | null;
  queue_length: number;
  busy: boolean;
  managed: boolean;
  restarts: number;
  last_error: string | null;
  gpu: { name: string; memory_total_mb: number; memory_used_mb: number } | null;
  tts?: {
    engine: string;
    device: string;
    available: boolean;
    loaded: boolean;
    queue_length: number;
    busy: boolean;
    voices: number;
    syntheses: number;
    last_synth_ms: number | null;
    vram_mb: number | null;
  } | null;
}

export interface AiChatRequest {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  purpose: AiPurpose;
  botId?: string;
  reasoning?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Stop sequences — bots use them to cut hallucinated dialogue of others. */
  stop?: string[];
}

export type AiStreamEvent =
  | { type: 'queue'; position: number }
  | { type: 'think'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; usage: AiUsage | null }
  | { type: 'error'; code: string; detail?: string };

/** Shape of `GET /rag/status` on the gateway. */
interface GatewayRagStatus {
  enabled: boolean;
  reason: string | null;
  model: string | null;
  device: string;
  model_mismatch: boolean;
  collections: {
    name: string;
    documents: number;
    chunks: number;
    tokens: number;
    indexed_at: string | null;
  }[];
  indexing: {
    running: boolean;
    done: number;
    total: number;
    error: string | null;
  };
}

interface GatewayRagHit {
  chunk_id: number;
  text: string;
  source: string;
  chapter: string;
  section: string;
  page: number | null;
  page_end: number | null;
  score: number;
  dense_rank: number | null;
  fts_rank: number | null;
}

export interface RulesSearchResult {
  passages: RulesPassage[];
  tookMs: number;
}

/** Failure of a RAG call, already worded for the GM. */
export interface RulesFailure {
  code: 'AI_UNREACHABLE' | 'RAG_UNAVAILABLE' | 'AI_ERROR';
  detail: string;
}

export interface AiGatewayOptions {
  url: string;
  apiKey: string;
  healthIntervalMs: number;
  /** Abort a generation that produced nothing for this long. */
  requestTimeoutMs: number;
  fetchImpl?: typeof fetch;
}

const HEALTH_TIMEOUT_MS = 5000;

/**
 * Client of the Python AI gateway. Owns the periodic health-check (so the UI
 * can grey bot features out) and turns the gateway's SSE stream into plain
 * async-iterated events. Every failure path ends in a status of `unreachable`
 * plus an `error` event — never a thrown error that could take a socket down.
 */
export class AiGateway {
  private status: AiStatus;
  private timer: NodeJS.Timeout | null = null;
  private listeners = new Set<(status: AiStatus) => void>();
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: AiGatewayOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.status = offlineAiStatus();
  }

  getStatus(): AiStatus {
    return this.status;
  }

  onStatusChange(listener: (status: AiStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Starts periodic health polling; the first check runs immediately. */
  start(): void {
    if (this.timer) return;
    void this.checkHealth();
    this.timer = setInterval(() => void this.checkHealth(), this.options.healthIntervalMs);
    // Polling must never hold the process open (tests, graceful shutdown).
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  async checkHealth(): Promise<AiStatus> {
    let next: AiStatus;
    try {
      const response = await this.fetchImpl(`${this.options.url}/health`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      if (!response.ok) {
        next = { ...offlineAiStatus(), error: `gateway HTTP ${response.status}` };
      } else {
        next = toStatus((await response.json()) as GatewayHealth);
      }
    } catch (error) {
      next = { ...offlineAiStatus(), error: describeError(error) };
    }
    const changed = isMeaningfullyDifferent(this.status, next);
    this.status = next;
    if (changed) for (const listener of this.listeners) listener(next);
    return next;
  }

  /**
   * Measures a text with the model's own tokenizer — used to trim bot chat
   * history to the context window. Returns null when the gateway cannot
   * answer; the caller then falls back to a character estimate rather than
   * skipping the bot's line.
   */
  async countTokens(text: string): Promise<number | null> {
    if (text.length === 0) return 0;
    try {
      const response = await this.fetchImpl(`${this.options.url}/tokenize`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.options.apiKey ? { 'x-api-key': this.options.apiKey } : {}),
        },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { count?: unknown };
      return typeof body.count === 'number' && Number.isFinite(body.count) ? body.count : null;
    } catch {
      return null;
    }
  }

  /**
   * State of the gateway's RAG index. Never throws: a gateway that is down is a
   * „not ready" status with a reason, exactly like a gateway with an empty index —
   * the panel says what to do in both cases.
   */
  async rulesStatus(): Promise<RulesIndexStatus> {
    try {
      const response = await this.fetchImpl(`${this.options.url}/rag/status`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      if (!response.ok) {
        return { ...emptyRulesIndexStatus(), reason: `gateway HTTP ${response.status}` };
      }
      return toRulesStatus((await response.json()) as GatewayRagStatus);
    } catch (error) {
      return {
        ...emptyRulesIndexStatus(),
        reason: `brak połączenia z AI Gateway (${describeError(error)})`,
      };
    }
  }

  /**
   * Hybrid search over the indexed rulebook. The passages are book text, so the
   * caller must only ever relay them to the GM.
   */
  async searchRules(
    query: string,
    topK: number,
    collection = 'rulebook',
  ): Promise<{ ok: true; result: RulesSearchResult } | { ok: false; error: RulesFailure }> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.url}/rag/search`, {
        method: 'POST',
        headers: this.jsonHeaders(),
        body: JSON.stringify({ query, collection, top_k: topK }),
        signal: AbortSignal.timeout(this.options.requestTimeoutMs),
      });
    } catch (error) {
      void this.checkHealth();
      return { ok: false, error: { code: 'AI_UNREACHABLE', detail: describeError(error) } };
    }
    if (!response.ok) {
      return {
        ok: false,
        error: {
          // 503 from `/rag/search` means „RAG cannot answer" (disabled, empty
          // index, model changed) — a different problem from a dead model.
          code: response.status === 503 ? 'RAG_UNAVAILABLE' : 'AI_ERROR',
          detail: await safeDetail(response),
        },
      };
    }
    const body = (await response.json()) as { hits?: GatewayRagHit[]; took_ms?: number };
    return {
      ok: true,
      result: {
        passages: (body.hits ?? []).map(toPassage),
        tookMs: typeof body.took_ms === 'number' ? body.took_ms : 0,
      },
    };
  }

  /**
   * Asks the gateway to (re)index the rulebook from ITS OWN disk. No book text
   * crosses the VTT server — that is the stage-19a licensing requirement, and the
   * reason this is a bare trigger rather than an upload.
   */
  async indexRulebook(): Promise<{ ok: true } | { ok: false; error: RulesFailure }> {
    try {
      const response = await this.fetchImpl(`${this.options.url}/rag/index/rulebook`, {
        method: 'POST',
        headers: this.jsonHeaders(),
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      if (!response.ok) {
        return {
          ok: false,
          error: {
            code: response.status === 503 ? 'RAG_UNAVAILABLE' : 'AI_ERROR',
            detail: await safeDetail(response),
          },
        };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: { code: 'AI_UNREACHABLE', detail: describeError(error) } };
    }
  }

  private jsonHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
      ...(this.options.apiKey ? { 'x-api-key': this.options.apiKey } : {}),
    };
  }

  /**
   * Streams one generation. Yields queue positions first (if the gateway is
   * busy), then the answer. Errors are yielded, not thrown.
   */
  async *streamChat(request: AiChatRequest, signal?: AbortSignal): AsyncGenerator<AiStreamEvent> {
    const body = {
      messages: request.messages,
      purpose: request.purpose,
      bot_id: request.botId ?? null,
      reasoning: request.reasoning ?? null,
      max_tokens: request.maxTokens ?? null,
      temperature: request.temperature ?? null,
      stop: request.stop ?? null,
    };

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.url}/chat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.options.apiKey ? { 'x-api-key': this.options.apiKey } : {}),
        },
        body: JSON.stringify(body),
        signal: signal ?? AbortSignal.timeout(this.options.requestTimeoutMs),
      });
    } catch (error) {
      // A dead gateway must be reflected in the UI without waiting for the poll.
      void this.checkHealth();
      yield { type: 'error', code: 'AI_UNREACHABLE', detail: describeError(error) };
      return;
    }

    if (!response.ok || !response.body) {
      const detail = await safeText(response);
      yield {
        type: 'error',
        code: response.status === 503 ? 'AI_UNAVAILABLE' : 'AI_ERROR',
        detail,
      };
      return;
    }

    for await (const event of parseSse(response.body)) {
      switch (event.name) {
        case 'queue':
          yield { type: 'queue', position: Number(event.data.position ?? 0) };
          break;
        case 'think':
          yield { type: 'think', text: String(event.data.text ?? '') };
          break;
        case 'delta':
          yield { type: 'delta', text: String(event.data.text ?? '') };
          break;
        case 'done':
          yield { type: 'done', usage: toUsage(event.data.usage) };
          return;
        case 'error':
          yield { type: 'error', code: 'AI_ERROR', detail: String(event.data.message ?? '') };
          return;
        default:
          break;
      }
    }
  }
}

interface SseEvent {
  name: string;
  data: Record<string, unknown>;
}

/** Minimal SSE reader: `event:` + `data:` pairs separated by blank lines. */
async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = parseSseBlock(block);
      if (event) yield event;
      boundary = buffer.indexOf('\n\n');
    }
  }
  const tail = parseSseBlock(buffer);
  if (tail) yield tail;
}

function parseSseBlock(block: string): SseEvent | null {
  let name = '';
  let raw = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) name = line.slice(6).trim();
    else if (line.startsWith('data:')) raw += line.slice(5).trim();
  }
  if (!name) return null;
  try {
    return { name, data: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} };
  } catch {
    return null;
  }
}

function toStatus(health: GatewayHealth, now: Date = new Date()): AiStatus {
  const llama = normalizeLlamaStatus(health.llama);
  return {
    available: health.status === 'ok' && (llama === 'ready' || llama === 'external'),
    llama,
    queueLength: health.queue_length ?? 0,
    busy: health.busy ?? false,
    checkedAt: now.toISOString(),
    model: health.model ?? null,
    contextSize: health.context_size ?? null,
    restarts: health.restarts ?? 0,
    gpu: toGpu(health.gpu),
    error: health.last_error ?? null,
    tts: toTts(health.tts),
  };
}

function toTts(tts: GatewayHealth['tts']): AiTtsInfo | null {
  if (!tts) return null;
  return {
    engine: tts.engine,
    device: tts.device,
    available: tts.available,
    loaded: tts.loaded,
    queueLength: tts.queue_length ?? 0,
    busy: tts.busy ?? false,
    voices: tts.voices ?? 0,
    syntheses: tts.syntheses ?? 0,
    lastSynthMs: tts.last_synth_ms ?? null,
    vramMb: tts.vram_mb ?? null,
  };
}

function normalizeLlamaStatus(value: string): AiStatus['llama'] {
  switch (value) {
    case 'starting':
    case 'ready':
    case 'unhealthy':
    case 'stopped':
    case 'external':
      return value;
    default:
      return 'unreachable';
  }
}

function toGpu(gpu: GatewayHealth['gpu']): AiGpuInfo | null {
  if (!gpu) return null;
  return {
    name: gpu.name,
    memoryTotalMb: gpu.memory_total_mb,
    memoryUsedMb: gpu.memory_used_mb,
  };
}

function toUsage(raw: unknown): AiUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const usage = raw as Record<string, unknown>;
  const num = (value: unknown) => (typeof value === 'number' ? value : null);
  return {
    promptTokens: num(usage.prompt_tokens),
    completionTokens: num(usage.completion_tokens),
    generationMs: num(usage.generation_ms),
    tokensPerSecond: num(usage.tokens_per_second),
  };
}

/** `checkedAt` alone must not trigger a broadcast — only real changes do. */
function isMeaningfullyDifferent(a: AiStatus, b: AiStatus): boolean {
  return (
    a.available !== b.available ||
    a.llama !== b.llama ||
    a.queueLength !== b.queueLength ||
    a.busy !== b.busy ||
    a.model !== b.model ||
    a.contextSize !== b.contextSize ||
    a.restarts !== b.restarts ||
    a.error !== b.error ||
    a.gpu?.memoryUsedMb !== b.gpu?.memoryUsedMb ||
    a.tts?.available !== b.tts?.available ||
    a.tts?.loaded !== b.tts?.loaded ||
    a.tts?.queueLength !== b.tts?.queueLength
  );
}

function toPassage(hit: GatewayRagHit): RulesPassage {
  return {
    chunkId: hit.chunk_id,
    text: hit.text,
    source: hit.source,
    chapter: hit.chapter ?? '',
    section: hit.section ?? '',
    page: hit.page ?? null,
    pageEnd: hit.page_end ?? null,
    score: hit.score ?? 0,
    denseRank: hit.dense_rank ?? null,
    keywordRank: hit.fts_rank ?? null,
  };
}

function toRulesStatus(status: GatewayRagStatus): RulesIndexStatus {
  // One collection per corpus; stage 19a indexes only the rulebook, later stages
  // add their own and report them separately.
  const rulebook = status.collections?.find((entry) => entry.name === 'rulebook') ?? null;
  const chunks = rulebook?.chunks ?? 0;
  const indexing = status.indexing?.running ?? false;
  return {
    enabled: status.enabled,
    ready: status.enabled && chunks > 0 && !status.model_mismatch,
    model: status.model ?? null,
    device: status.device ?? 'cpu',
    chunks,
    documents: rulebook?.documents ?? 0,
    indexedAt: rulebook?.indexed_at ?? null,
    indexing,
    progress: indexing ? { done: status.indexing.done, total: status.indexing.total } : null,
    reason: rulesReason(status, chunks),
  };
}

/** Why the assistant cannot answer — in the GM's language, with the next step. */
function rulesReason(status: GatewayRagStatus, chunks: number): string | null {
  if (!status.enabled) return status.reason ?? 'moduł RAG jest wyłączony w konfiguracji gatewaya';
  if (status.indexing?.error) return status.indexing.error;
  if (status.model_mismatch) {
    return `indeks zbudowano innym modelem niż ${status.model ?? '?'} — zaindeksuj podręcznik ponownie`;
  }
  if (chunks === 0) return 'podręcznik nie jest jeszcze zaindeksowany';
  return null;
}

async function safeDetail(response: Response): Promise<string> {
  const text = await safeText(response);
  try {
    const body = JSON.parse(text) as { detail?: unknown };
    if (typeof body.detail === 'string') return body.detail;
  } catch {
    // Nie JSON — oddajemy surowy tekst.
  }
  return text;
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '';
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
