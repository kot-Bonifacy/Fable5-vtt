import type { AiGpuInfo, AiPurpose, AiStatus, AiUsage } from '@vtt/shared';
import { offlineAiStatus } from '@vtt/shared';

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
    a.gpu?.memoryUsedMb !== b.gpu?.memoryUsedMb
  );
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
