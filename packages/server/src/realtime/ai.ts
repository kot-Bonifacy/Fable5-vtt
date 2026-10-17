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
import type { SessionUser } from '@vtt/shared';
import { MAX_AI_PROMPT_LENGTH, ROLE_ADMIN, ROLE_GM } from '@vtt/shared';
import type { AiChatRequest } from '../ai/gateway.js';
import type { CampaignAi } from '../ai/access.js';
import { defineEvent, RealtimeError, type RealtimeDeps } from './registry.js';

/**
 * Bot availability is not game state: it carries no seq and is never persisted.
 * Since stage 44d it is per campaign — the owner's AI may be shared with one
 * table and busy for another — so every socket gets its own computed status:
 * the GM learns why bots are off (`reason`), a player only that they are.
 */
export function broadcastAiStatus(deps: RealtimeDeps): void {
  for (const socket of deps.io.sockets.sockets.values()) sendAiStatus(deps, socket, true);
}

/** Status for one socket's campaign, filtered by role — on connect and in `state:sync`. */
export function aiStatusFor(
  deps: RealtimeDeps,
  user: SessionUser,
  campaignId: string | null,
): AiStatus {
  // Administrator (etap 53) widzi stan gatewaya jak MG — diagnostyka PC właściciela.
  const gm = user.role === ROLE_GM || user.role === ROLE_ADMIN;
  return deps.ctx.ai.statusFor(campaignId, { gm, owner: user.owner });
}

/** Co gniazdo już wie — bez znacznika czasu sprawdzenia. */
function aiStatusKey(status: AiStatus): string {
  const { checkedAt: _checkedAt, ...meaningful } = status;
  return JSON.stringify(meaningful);
}

/** Status jedzie w `state:sync` — zapamiętaj go jak wysłany osobno. */
export function syncedAiStatus(
  deps: RealtimeDeps,
  socket: Socket,
  user: SessionUser,
  campaignId: string | null,
): AiStatus {
  const status = aiStatusFor(deps, user, campaignId);
  socket.data.aiStatusKey = aiStatusKey(status);
  return status;
}

/**
 * `onlyChanged` — rozgłoszenie po zmianie dzierżawy czy zgody: gniazdo, któremu
 * nic się nie zmieniło, nie dostaje nic. Inaczej start sesji jednej grupy
 * stukałby `ai:status` u wszystkich stołów serwera.
 */
export function sendAiStatus(deps: RealtimeDeps, socket: Socket, onlyChanged = false): void {
  const user = socket.data.user as SessionUser | undefined;
  if (!user) return;
  const campaignId = (socket.data.campaign as { id: string } | null | undefined)?.id ?? null;
  const status = aiStatusFor(deps, user, campaignId);
  const key = aiStatusKey(status);
  if (onlyChanged && socket.data.aiStatusKey === key) return;
  socket.data.aiStatusKey = key;
  const payload: AiStatusBroadcast = { status };
  socket.emit('ai:status', payload);
}

/** Brama AI kampanii (44d) — jedyna droga z kodu gry do gatewaya. */
export function campaignAi(deps: RealtimeDeps, campaignId: string): CampaignAi {
  return deps.ctx.ai.forCampaign(campaignId);
}

/** Brama AI kampanii gniazda — zdarzenie bez kampanii dostaje `NO_ACTIVE_CAMPAIGN`. */
export function socketAi(deps: RealtimeDeps, socket: Socket): CampaignAi {
  const campaign = socket.data.campaign as { id: string } | null | undefined;
  if (!campaign) throw new RealtimeError('NO_ACTIVE_CAMPAIGN');
  return deps.ctx.ai.forCampaign(campaign.id);
}

/**
 * GM test screen: sends one question to the model and streams the answer back
 * to the asking socket only — through the campaign's AI gate, like every
 * other AI request (stage 44d).
 */
export const aiAskEvent = defineEvent<AiAskPayload, { requestId: string }>({
  name: 'ai:ask',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    // Napisy albo nic (#15) — liczba w tych polach padała na `.trim` jako INTERNAL.
    const prompt = typeof payload?.prompt === 'string' ? payload.prompt.trim() : '';
    const system = typeof payload?.system === 'string' ? payload.system.trim() : '';
    if (!prompt) throw new RealtimeError('AI_EMPTY_PROMPT');
    if (prompt.length > MAX_AI_PROMPT_LENGTH) throw new RealtimeError('AI_PROMPT_TOO_LONG');
    const ai = socketAi(deps, socket);
    if (!ai.getStatus().available) throw new RealtimeError('AI_UNAVAILABLE');

    const requestId = randomUUID();
    const purpose = payload.purpose ?? 'test';
    const request: AiChatRequest = {
      messages: [
        ...(system ? [{ role: 'system' as const, content: system }] : []),
        { role: 'user' as const, content: prompt },
      ],
      purpose,
      ...(payload.reasoning !== undefined ? { reasoning: payload.reasoning } : {}),
      ...(payload.maxTokens !== undefined ? { maxTokens: payload.maxTokens } : {}),
      ...(payload.temperature !== undefined ? { temperature: payload.temperature } : {}),
    };

    // Streaming runs detached: the ack returns immediately so the client can
    // render a placeholder while tokens arrive.
    void streamToSocket(ai, deps, socket, requestId, request);
    return { requestId };
  },
});

async function streamToSocket(
  ai: CampaignAi,
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
    for await (const event of ai.streamChat(request, controller.signal)) {
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

/**
 * Forces a health check now — the test screen's „sprawdź ponownie" button.
 * Health is the gateway's, not a campaign's, so it is no AI request; the
 * answer goes through the gate like any status.
 */
export const aiRefreshEvent = defineEvent<undefined, AiStatus>({
  name: 'ai:refresh',
  role: ROLE_GM,
  handler: async ({ deps, socket, user }) => {
    await deps.ctx.ai.gateway.checkHealth();
    const campaignId = (socket.data.campaign as { id: string } | null | undefined)?.id ?? null;
    return aiStatusFor(deps, user, campaignId);
  },
});
