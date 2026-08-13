import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io';
import type {
  ScreamsheetDraftBroadcast,
  ScreamsheetErrorBroadcast,
  ScreamsheetGeneratePayload,
} from '@vtt/shared';
import type { AiChatRequest } from '../ai/gateway.js';
import {
  DEFAULT_SCREAMSHEET_OUTLET,
  ROLE_GM,
  SCREAMSHEET_MAX_TOKENS,
  SCREAMSHEET_OUTLET_MAX_LENGTH,
  SCREAMSHEET_TEMPERATURE,
  SCREAMSHEET_TOPIC_MAX_LENGTH,
  buildScreamsheetPrompt,
  parseScreamsheetDraft,
} from '@vtt/shared';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';

/**
 * Generator screamsheetów (etap 24c).
 *
 * Osobny moduł od `handouts.ts` z jednego powodu: zapis kartki i napisanie
 * artykułu to dwie różne operacje o różnym czasie życia. Zapis wraca ackiem
 * w milisekundach, generacja trwa kilka–kilkanaście sekund i musi dać się
 * przerwać, więc jedzie wzorcem `journal:summarize` — ack niesie `requestId`,
 * a gotowy tekst przychodzi osobnym `screamsheet:draft`.
 *
 * Ten kod **nie zapisuje niczego do bazy**. Model pisze szkic, szkic ląduje
 * w formularzu MG, a handoutem staje się dopiero po „Zapisz" (kryterium etapu:
 * treść nie idzie do graczy bez decyzji MG).
 */

/** Model 9B pisze ~800 tokenów w kilkanaście sekund; minuta to zapas na kolejkę. */
const GENERATION_TIMEOUT_MS = 60_000;

export const screamsheetGenerateEvent = defineEvent<
  ScreamsheetGeneratePayload,
  { requestId: string }
>({
  name: 'screamsheet:generate',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    if (!socket.data.campaign) throw new RealtimeError('NO_CAMPAIGN');
    const campaignId = socket.data.campaign.id;
    // Degradacja z CLAUDE.md: bez gatewaya generator odmawia po polsku, a MG
    // wypełnia szablon ręcznie — reszta zakładki działa normalnie.
    if (!deps.ctx.ai.getStatus().available) throw new RealtimeError('AI_UNAVAILABLE');

    const topic =
      typeof payload?.topic === 'string'
        ? payload.topic.trim().slice(0, SCREAMSHEET_TOPIC_MAX_LENGTH)
        : '';
    if (topic.length === 0) throw new RealtimeError('EMPTY_TOPIC');

    const outlet =
      typeof payload?.outlet === 'string' && payload.outlet.trim().length > 0
        ? payload.outlet.trim().slice(0, SCREAMSHEET_OUTLET_MAX_LENGTH)
        : DEFAULT_SCREAMSHEET_OUTLET;

    const requestId = randomUUID();
    void writeScreamsheet(deps, socket, requestId, campaignId, topic, outlet);
    return { requestId };
  },
});

async function writeScreamsheet(
  deps: RealtimeDeps,
  socket: Socket,
  requestId: string,
  campaignId: string,
  topic: string,
  outlet: string,
): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  socket.once('disconnect', abort);
  socket.once('screamsheet:cancel', abort);
  const started = Date.now();

  try {
    const campaign = await deps.ctx.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { name: true },
    });
    const { system, user } = buildScreamsheetPrompt({
      topic,
      outlet,
      campaignName: campaign?.name ?? null,
    });

    const request: AiChatRequest = {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      purpose: 'gm_assistant',
      // Bez rozumowania: blok think dzieliłby pulę tokenów z artykułem (błąd
      // znaleziony w 19a), a brukowiec nie ma nic do przemyślenia.
      reasoning: false,
      maxTokens: SCREAMSHEET_MAX_TOKENS,
      temperature: SCREAMSHEET_TEMPERATURE,
    };
    const deadline = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(GENERATION_TIMEOUT_MS),
    ]);

    let text = '';
    for await (const event of deps.ctx.ai.streamChat(request, deadline)) {
      if (event.type === 'delta') text += event.text;
      if (event.type === 'error') {
        deps.log.warn({ code: event.code, detail: event.detail }, 'screamsheet generation failed');
        emitError(socket, requestId, 'AI_ERROR', event.detail || event.code);
        return;
      }
    }
    if (socket.disconnected || controller.signal.aborted) return;

    const draft = parseScreamsheetDraft(text);
    if (draft.headline.length === 0 && draft.body.length === 0) {
      emitError(socket, requestId, 'AI_ERROR', 'pusta odpowiedź modelu');
      return;
    }

    const done: ScreamsheetDraftBroadcast = { requestId, draft, totalMs: Date.now() - started };
    socket.emit('screamsheet:draft', done);
  } catch (error) {
    deps.log.error({ err: error, requestId }, 'screamsheet generation aborted');
    emitError(socket, requestId, 'AI_ERROR');
  } finally {
    socket.off('disconnect', abort);
    socket.off('screamsheet:cancel', abort);
  }
}

function emitError(socket: Socket, requestId: string, code: string, detail?: string): void {
  const payload: ScreamsheetErrorBroadcast = { requestId, code, ...(detail ? { detail } : {}) };
  if (!socket.disconnected) socket.emit('screamsheet:error', payload);
}
