import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io';
import type {
  RulesAskPayload,
  RulesChunkBroadcast,
  RulesDoneBroadcast,
  RulesErrorBroadcast,
  RulesIndexStatus,
  RulesPassage,
  RulesSourcesBroadcast,
  RulesStatusBroadcast,
} from '@vtt/shared';
import {
  MAX_RULES_QUESTION_LENGTH,
  RULES_TOP_K,
  ROLE_GM,
  buildRulesSystemPrompt,
  buildRulesUserPrompt,
} from '@vtt/shared';
import type { AiChatRequest } from '../ai/gateway.js';
import { defineEvent, RealtimeError, type RealtimeDeps } from './registry.js';

/**
 * Asystent zasad (etap 19a).
 *
 * Trzy rzeczy odróżniają go od `ai:ask` i od bota z etapu 11:
 *
 *  1. **Najpierw szukanie, potem model.** Fragmenty lecą do klienta osobnym
 *     zdarzeniem, ZANIM padnie pierwszy token odpowiedzi — dzięki temu MG widzi,
 *     na czym asystent się opiera, nawet gdy generacja padnie w połowie.
 *  2. **Tylko MG.** Fragmenty to treść podręcznika; żaden z nich nie może trafić
 *     do pokoju kampanii ani do gracza. Stąd emisje celowane w gniazdo pytającego,
 *     bez `seq` i bez zapisu w historii czatu.
 *  3. **Brak indeksu to nie awaria.** Gateway offline, wyłączony RAG i pusty
 *     indeks kończą się nazwanym powodem w panelu, nie wyjątkiem.
 */

/**
 * Limit odpowiedzi **bez rozumowania**. Odpowiedź o zasadach to kilka zdań, więc
 * krótka smycz oszczędza sekundy.
 *
 * Z włączonym rozumowaniem limitu NIE wysyłamy wcale — i to jest treść błędu
 * znalezionego przy oględzinach 08.08: blok think i odpowiedź dzielą jedną pulę
 * `max_tokens`, a gateway ma na to osobne ustawienie (`reasoning_max_tokens`
 * 1536 przy `reasoning_budget` 640). Podanie tu 420 zastępowało tamte 1536, więc
 * model przemyśliwał całą pulę i oddawał **pustą odpowiedź** przy komplecie
 * poprawnych cytatów. Budżet rozumowania należy do konfiguracji gatewaya i to
 * ona ma o nim decydować.
 */
const ANSWER_MAX_TOKENS = 420;

export function sendRulesStatus(status: RulesIndexStatus, socket: Socket): void {
  const payload: RulesStatusBroadcast = { status };
  socket.emit('rules:status', payload);
}

/** Stan indeksu na żądanie panelu (odpytywany też w trakcie indeksowania). */
export const rulesStatusEvent = defineEvent<undefined, RulesIndexStatus>({
  name: 'rules:status',
  role: ROLE_GM,
  handler: async ({ deps }) => deps.ctx.ai.rulesStatus(),
});

/**
 * Uruchamia indeksowanie podręcznika po stronie gatewaya. Ack wraca od razu —
 * przebieg trwa minuty, a postęp panel dociąga przez `rules:status`.
 */
export const rulesIndexEvent = defineEvent<undefined, RulesIndexStatus>({
  name: 'rules:index',
  role: ROLE_GM,
  handler: async ({ deps }) => {
    const started = await deps.ctx.ai.indexRulebook();
    const status = await deps.ctx.ai.rulesStatus();
    // Odmowa gatewaya wraca jako status z powodem, nie jako kod błędu: „nie
    // znaleziono katalogu podręcznika" mówi MG, co zrobić, a `RAG_UNAVAILABLE`
    // nie mówi nic. Ack niesie tylko kod, więc powód musi jechać w danych.
    return started.ok ? status : { ...status, reason: started.error.detail || status.reason };
  },
});

export const rulesAskEvent = defineEvent<RulesAskPayload, { requestId: string }>({
  name: 'rules:ask',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const question = payload?.question?.trim() ?? '';
    if (!question) throw new RealtimeError('RULES_EMPTY_QUESTION');
    if (question.length > MAX_RULES_QUESTION_LENGTH) {
      throw new RealtimeError('RULES_QUESTION_TOO_LONG');
    }
    if (!deps.ctx.ai.getStatus().available) throw new RealtimeError('AI_UNAVAILABLE');

    const requestId = randomUUID();
    // Odczepione jak `ai:ask`: ack wraca natychmiast, żeby panel mógł pokazać
    // „szukam w podręczniku…" zanim wrócą fragmenty.
    void answerRulesQuestion(deps, socket, requestId, question, payload?.reasoning ?? true);
    return { requestId };
  },
});

async function answerRulesQuestion(
  deps: RealtimeDeps,
  socket: Socket,
  requestId: string,
  question: string,
  reasoning: boolean,
): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  socket.once('disconnect', abort);
  socket.once('rules:cancel', abort);
  const started = Date.now();

  try {
    const found = await deps.ctx.ai.searchRules(question, RULES_TOP_K);
    if (socket.disconnected) return;
    if (!found.ok) {
      emitError(socket, requestId, found.error.code, found.error.detail);
      return;
    }

    const passages: RulesPassage[] = found.result.passages;
    const sources: RulesSourcesBroadcast = {
      requestId,
      passages,
      searchMs: found.result.tookMs,
    };
    socket.emit('rules:sources', sources);

    const messages = [
      { role: 'system' as const, content: buildRulesSystemPrompt() },
      { role: 'user' as const, content: buildRulesUserPrompt(question, passages) },
    ];

    const first = await generate(deps, socket, requestId, messages, reasoning, controller.signal);
    if (first === null || socket.disconnected) return;

    // Rozumowanie potrafi zjeść całą pulę tokenów i nie zostawić nic na
    // odpowiedź — a `reasoning_budget` llama-servera tego NIE pilnuje (zmierzone
    // 08.08: przyjmuje 640 i generuje 1536 tokenów samego think). Zamiast pustej
    // karty z poprawnymi cytatami powtarzamy pytanie raz, bez rozumowania i na
    // krótkiej smyczy. Fragmenty są już wyszukane, więc kosztuje to samą generację.
    let { completionTokens } = first;
    let retried = false;
    if (reasoning && first.answer.trim().length === 0) {
      deps.log.warn({ requestId }, 'rules answer empty after reasoning — retrying without it');
      retried = true;
      const second = await generate(deps, socket, requestId, messages, false, controller.signal);
      if (second === null || socket.disconnected) return;
      completionTokens = (completionTokens ?? 0) + (second.completionTokens ?? 0);
    }

    const done: RulesDoneBroadcast = {
      requestId,
      totalMs: Date.now() - started,
      completionTokens,
      ...(retried ? { retriedWithoutReasoning: true } : {}),
    };
    socket.emit('rules:done', done);
  } catch (error) {
    deps.log.error({ err: error, requestId }, 'rules question failed');
    emitError(socket, requestId, 'AI_ERROR');
  } finally {
    socket.off('disconnect', abort);
    socket.off('rules:cancel', abort);
  }
}

/**
 * Jedna generacja, strumieniowana do gniazda. Zwraca `null`, gdy poszedł błąd
 * (jest już wysłany) — wołający ma wtedy nic więcej nie robić.
 */
async function generate(
  deps: RealtimeDeps,
  socket: Socket,
  requestId: string,
  messages: AiChatRequest['messages'],
  reasoning: boolean,
  signal: AbortSignal,
): Promise<{ answer: string; completionTokens: number | null } | null> {
  const request: AiChatRequest = {
    messages,
    purpose: 'gm_assistant',
    reasoning,
    // Limit wysyłamy tylko bez rozumowania: blok think i odpowiedź dzielą jedną
    // pulę, więc własne `max_tokens` zastąpiłoby `reasoning_max_tokens` gatewaya.
    ...(reasoning ? {} : { maxTokens: ANSWER_MAX_TOKENS }),
    // Odpowiedź o zasadach ma przepisywać liczby, nie improwizować.
    temperature: 0.2,
  };

  let answer = '';
  let completionTokens: number | null = null;
  for await (const event of deps.ctx.ai.streamChat(request, signal)) {
    if (socket.disconnected) return null;
    switch (event.type) {
      case 'think':
      case 'delta': {
        if (event.type === 'delta') answer += event.text;
        const chunk: RulesChunkBroadcast = { requestId, kind: event.type, text: event.text };
        socket.emit('rules:chunk', chunk);
        break;
      }
      case 'done':
        completionTokens = event.usage?.completionTokens ?? null;
        break;
      case 'error':
        emitError(socket, requestId, event.code, event.detail);
        return null;
      default:
        // `queue` — asystent MG czeka w tej samej kolejce co boty; panel i tak
        // pokazuje „szukam / generuję", więc pozycja niczego nie wnosi.
        break;
    }
  }
  return { answer, completionTokens };
}

function emitError(socket: Socket, requestId: string, code: string, detail?: string): void {
  const payload: RulesErrorBroadcast = { requestId, code, ...(detail ? { detail } : {}) };
  socket.emit('rules:error', payload);
}
