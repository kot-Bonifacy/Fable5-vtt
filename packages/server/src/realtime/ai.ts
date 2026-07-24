import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io';
import type {
  AiAskPayload,
  AiChunkBroadcast,
  AiDoneBroadcast,
  AiErrorBroadcast,
  AiQueueBroadcast,
  AiStatus,
  AiStatusBroadcast,
} from '@vtt/shared';
import { MAX_AI_PROMPT_LENGTH, ROLE_GM, publicAiStatus } from '@vtt/shared';
import type { AiChatRequest } from '../ai/gateway.js';
import { defineEvent, RealtimeError, type RealtimeDeps } from './registry.js';

/**
 * Bot availability is not game state: it carries no seq and is never persisted.
 * A player only learns whether AI features work at all; the model name, GPU
 * usage and gateway errors stay with the GM — hence a per-socket emit instead
 * of a room broadcast.
 */
export function broadcastAiStatus(deps: RealtimeDeps, status: AiStatus): void {
  const forGm: AiStatusBroadcast = { status };
  const forPlayer: AiStatusBroadcast = { status: publicAiStatus(status) };
  for (const socket of deps.io.sockets.sockets.values()) {
    socket.emit('ai:status', socket.data.user?.role === ROLE_GM ? forGm : forPlayer);
  }
}

/** Status for one socket, filtered by role — used on connect and in `state:sync`. */
export function aiStatusFor(deps: RealtimeDeps, isGm: boolean): AiStatus {
  const status = deps.ctx.ai.getStatus();
  return isGm ? status : publicAiStatus(status);
}

export function sendAiStatus(deps: RealtimeDeps, socket: Socket): void {
  const payload: AiStatusBroadcast = {
    status: aiStatusFor(deps, socket.data.user.role === ROLE_GM),
  };
  socket.emit('ai:status', payload);
}

/**
 * GM test screen: sends one question to the model and streams the answer back
 * to the asking socket only. Stage 11 will reuse `ctx.ai.streamChat` to post
 * bot answers into the chat instead.
 */
export const aiAskEvent = defineEvent<AiAskPayload, { requestId: string }>({
  name: 'ai:ask',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const prompt = payload?.prompt?.trim() ?? '';
    if (!prompt) throw new RealtimeError('AI_EMPTY_PROMPT');
    if (prompt.length > MAX_AI_PROMPT_LENGTH) throw new RealtimeError('AI_PROMPT_TOO_LONG');
    if (!deps.ctx.ai.getStatus().available) throw new RealtimeError('AI_UNAVAILABLE');

    const requestId = randomUUID();
    const purpose = payload.purpose ?? 'test';
    const request: AiChatRequest = {
      messages: [
        ...(payload.system?.trim()
          ? [{ role: 'system' as const, content: payload.system.trim() }]
          : []),
        { role: 'user' as const, content: prompt },
      ],
      purpose,
      ...(payload.reasoning !== undefined ? { reasoning: payload.reasoning } : {}),
      ...(payload.maxTokens !== undefined ? { maxTokens: payload.maxTokens } : {}),
      ...(payload.temperature !== undefined ? { temperature: payload.temperature } : {}),
    };

    // Streaming runs detached: the ack returns immediately so the client can
    // render a placeholder while tokens arrive.
    void streamToSocket(deps, socket, requestId, request);
    return { requestId };
  },
});

async function streamToSocket(
  deps: RealtimeDeps,
  socket: Socket,
  requestId: string,
  request: AiChatRequest,
): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  socket.once('disconnect', abort);
  socket.once('ai:cancel', abort);

  try {
    for await (const event of deps.ctx.ai.streamChat(request, controller.signal)) {
      if (socket.disconnected) return;
      switch (event.type) {
        case 'queue': {
          const payload: AiQueueBroadcast = { requestId, position: event.position };
          socket.emit('ai:queue', payload);
          break;
        }
        case 'think':
        case 'delta': {
          const payload: AiChunkBroadcast = { requestId, kind: event.type, text: event.text };
          socket.emit('ai:chunk', payload);
          break;
        }
        case 'done': {
          const payload: AiDoneBroadcast = { requestId, usage: event.usage };
          socket.emit('ai:done', payload);
          break;
        }
        case 'error': {
          const payload: AiErrorBroadcast = {
            requestId,
            code: event.code,
            ...(event.detail ? { detail: event.detail } : {}),
          };
          socket.emit('ai:error', payload);
          break;
        }
      }
    }
  } catch (error) {
    deps.log.error({ err: error, requestId }, 'ai stream failed');
    const payload: AiErrorBroadcast = { requestId, code: 'AI_ERROR' };
    socket.emit('ai:error', payload);
  } finally {
    socket.off('disconnect', abort);
    socket.off('ai:cancel', abort);
  }
}

/** Forces a health check now — the test screen's „sprawdź ponownie" button. */
export const aiRefreshEvent = defineEvent<undefined, AiStatus>({
  name: 'ai:refresh',
  role: ROLE_GM,
  handler: async ({ deps }) => deps.ctx.ai.checkHealth(),
});
