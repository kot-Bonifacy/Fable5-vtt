import { create } from 'zustand';
import type { AiStatus, AiUsage } from '@vtt/shared';
import { offlineAiStatus } from '@vtt/shared';

/** One question asked from the GM test screen, streamed in as it generates. */
export interface AiExchange {
  requestId: string;
  prompt: string;
  /** Answer text so far (never contains reasoning). */
  answer: string;
  /** Model's reasoning, only when the request asked for it. */
  thinking: string;
  queuePosition: number | null;
  done: boolean;
  usage: AiUsage | null;
  error: string | null;
  startedAt: number;
}

interface AiState {
  status: AiStatus;
  /** Newest first. Kept in memory only — the test screen is a diagnostic tool. */
  exchanges: AiExchange[];
  setStatus: (status: AiStatus) => void;
  startExchange: (requestId: string, prompt: string) => void;
  /** Marks a locally-rejected question (never reached the server). */
  failLocally: (prompt: string, error: string) => void;
  setQueuePosition: (requestId: string, position: number) => void;
  appendChunk: (requestId: string, kind: 'think' | 'delta', text: string) => void;
  finishExchange: (requestId: string, usage: AiUsage | null) => void;
  failExchange: (requestId: string, error: string) => void;
  clear: () => void;
}

const MAX_EXCHANGES = 20;

function blank(requestId: string, prompt: string): AiExchange {
  return {
    requestId,
    prompt,
    answer: '',
    thinking: '',
    queuePosition: null,
    done: false,
    usage: null,
    error: null,
    startedAt: Date.now(),
  };
}

/**
 * Applies a change to one exchange. A chunk can outrun the `ai:ask`
 * acknowledgement, so an unknown id creates the entry instead of dropping
 * tokens on the floor — `startExchange` then fills in the prompt.
 */
function patch(
  exchanges: AiExchange[],
  requestId: string,
  change: (exchange: AiExchange) => AiExchange,
): AiExchange[] {
  if (!exchanges.some((exchange) => exchange.requestId === requestId)) {
    return [change(blank(requestId, '')), ...exchanges].slice(0, MAX_EXCHANGES);
  }
  return exchanges.map((exchange) =>
    exchange.requestId === requestId ? change(exchange) : exchange,
  );
}

export const useAiStore = create<AiState>((set) => ({
  status: offlineAiStatus(),
  exchanges: [],

  setStatus: (status) => set({ status }),

  startExchange: (requestId, prompt) =>
    set((state) =>
      state.exchanges.some((exchange) => exchange.requestId === requestId)
        ? // Chunks arrived first — only the prompt is still missing.
          { exchanges: patch(state.exchanges, requestId, (e) => ({ ...e, prompt })) }
        : { exchanges: [blank(requestId, prompt), ...state.exchanges].slice(0, MAX_EXCHANGES) },
    ),

  failLocally: (prompt, error) =>
    set((state) => ({
      exchanges: [
        { ...blank(`local-${Date.now()}`, prompt), done: true, error },
        ...state.exchanges,
      ].slice(0, MAX_EXCHANGES),
    })),

  setQueuePosition: (requestId, position) =>
    set((state) => ({
      exchanges: patch(state.exchanges, requestId, (e) => ({ ...e, queuePosition: position })),
    })),

  appendChunk: (requestId, kind, text) =>
    set((state) => ({
      exchanges: patch(state.exchanges, requestId, (e) =>
        kind === 'delta'
          ? { ...e, answer: e.answer + text, queuePosition: null }
          : { ...e, thinking: e.thinking + text, queuePosition: null },
      ),
    })),

  finishExchange: (requestId, usage) =>
    set((state) => ({
      exchanges: patch(state.exchanges, requestId, (e) => ({
        ...e,
        done: true,
        usage,
        queuePosition: null,
      })),
    })),

  failExchange: (requestId, error) =>
    set((state) => ({
      exchanges: patch(state.exchanges, requestId, (e) => ({
        ...e,
        done: true,
        error,
        queuePosition: null,
      })),
    })),

  clear: () => set({ exchanges: [] }),
}));
