import { create } from 'zustand';
import type { RulesIndexStatus, RulesPassage } from '@vtt/shared';
import { emptyRulesIndexStatus } from '@vtt/shared';

/**
 * Jedno pytanie o zasady i wszystko, co przyszło w odpowiedzi.
 *
 * Fragmenty (`passages`) trzymamy razem z odpowiedzią, bo cytat bez źródła jest
 * niesprawdzalny — a cała wartość asystenta polega na tym, że MG może zajrzeć,
 * z czego to wynikło. Historia żyje wyłącznie w pamięci karty: to treść
 * podręcznika, nie dane kampanii.
 */
export interface RulesExchange {
  requestId: string;
  question: string;
  answer: string;
  thinking: string;
  passages: RulesPassage[];
  /** Sam czas wyszukiwania — część, która nie zależy od modelu. */
  searchMs: number | null;
  totalMs: number | null;
  completionTokens: number | null;
  /** Rozumowanie nie zostawiło miejsca na odpowiedź — pytanie poszło raz jeszcze. */
  retriedWithoutReasoning: boolean;
  done: boolean;
  error: string | null;
  askedAt: number;
}

interface RulesState {
  status: RulesIndexStatus;
  /** Najnowsze pierwsze. */
  exchanges: RulesExchange[];
  setStatus: (status: RulesIndexStatus) => void;
  start: (requestId: string, question: string) => void;
  failLocally: (question: string, error: string) => void;
  setSources: (requestId: string, passages: RulesPassage[], searchMs: number) => void;
  appendChunk: (requestId: string, kind: 'think' | 'delta', text: string) => void;
  finish: (
    requestId: string,
    totalMs: number,
    completionTokens: number | null,
    retriedWithoutReasoning: boolean,
  ) => void;
  fail: (requestId: string, error: string) => void;
  clear: () => void;
}

const MAX_EXCHANGES = 20;

function blank(requestId: string, question: string): RulesExchange {
  return {
    requestId,
    question,
    answer: '',
    thinking: '',
    passages: [],
    searchMs: null,
    totalMs: null,
    completionTokens: null,
    retriedWithoutReasoning: false,
    done: false,
    error: null,
    askedAt: Date.now(),
  };
}

/** Zdarzenie może wyprzedzić ack — nieznane id zakłada wpis, zamiast gubić tekst. */
function patch(
  exchanges: RulesExchange[],
  requestId: string,
  change: (exchange: RulesExchange) => RulesExchange,
): RulesExchange[] {
  if (!exchanges.some((exchange) => exchange.requestId === requestId)) {
    return [change(blank(requestId, '')), ...exchanges].slice(0, MAX_EXCHANGES);
  }
  return exchanges.map((exchange) =>
    exchange.requestId === requestId ? change(exchange) : exchange,
  );
}

export const useRulesStore = create<RulesState>((set) => ({
  status: emptyRulesIndexStatus(),
  exchanges: [],

  setStatus: (status) => set({ status }),

  start: (requestId, question) =>
    set((state) =>
      state.exchanges.some((exchange) => exchange.requestId === requestId)
        ? { exchanges: patch(state.exchanges, requestId, (e) => ({ ...e, question })) }
        : { exchanges: [blank(requestId, question), ...state.exchanges].slice(0, MAX_EXCHANGES) },
    ),

  failLocally: (question, error) =>
    set((state) => ({
      exchanges: [
        { ...blank(`local-${Date.now()}`, question), done: true, error },
        ...state.exchanges,
      ].slice(0, MAX_EXCHANGES),
    })),

  setSources: (requestId, passages, searchMs) =>
    set((state) => ({
      exchanges: patch(state.exchanges, requestId, (e) => ({ ...e, passages, searchMs })),
    })),

  appendChunk: (requestId, kind, text) =>
    set((state) => ({
      exchanges: patch(state.exchanges, requestId, (e) =>
        kind === 'delta'
          ? { ...e, answer: e.answer + text }
          : { ...e, thinking: e.thinking + text },
      ),
    })),

  finish: (requestId, totalMs, completionTokens, retriedWithoutReasoning) =>
    set((state) => ({
      exchanges: patch(state.exchanges, requestId, (e) => ({
        ...e,
        done: true,
        totalMs,
        completionTokens,
        retriedWithoutReasoning,
      })),
    })),

  fail: (requestId, error) =>
    set((state) => ({
      exchanges: patch(state.exchanges, requestId, (e) => ({ ...e, done: true, error })),
    })),

  clear: () => set({ exchanges: [] }),
}));
