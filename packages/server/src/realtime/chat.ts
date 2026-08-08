import type {
  ChatHistoryPage,
  ChatHistoryRequest,
  ChatMessageView,
  ChatSendPayload,
  RollFormula,
  RollGesture,
  RollToss,
  SessionUser,
} from '@vtt/shared';
import {
  CHAT_HISTORY_PAGE_SIZE,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_GESTURE_ENTROPY_LENGTH,
  MAX_GESTURE_STRENGTH,
  ROLE_GM,
  parseChatInput,
  rollFormula,
} from '@vtt/shared';
import { createMixedRng } from './dice-rng.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import {
  broadcastChatMessage,
  deliverChatMessageTo,
  deliverRollMessage,
  fetchHistoryPage,
  getRoster,
  insertChatMessage,
} from './chat-io.js';
import {
  listChatBots,
  requestBotTurns,
  speakAsBot,
  triggerBotsForLine,
  type ChatBot,
} from './bot-turns.js';

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/**
 * Scene a line belongs to: the one this socket is looking at. Players always
 * follow the active scene, and a GM previewing another scene is working there,
 * so their lines (and the bots pinned to that scene) belong to it. The chat
 * feed itself stays campaign-wide — the tag only scopes the bots' memory.
 */
function messageSceneId(socketData: { viewedSceneId: string | null }): string | null {
  return socketData.viewedSceneId ?? null;
}

async function persistAndEmitSay(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  sceneId: string | null,
  text: string,
): Promise<ChatMessageView> {
  const message = await insertChatMessage(deps.ctx.prisma, {
    campaignId,
    authorId: user.id,
    kind: 'say',
    text,
    sceneId,
  });
  broadcastChatMessage(deps, campaignId, message);
  return message;
}

/**
 * A whisper to a bot: a private player↔bot conversation. Stored with the bot as
 * recipient and delivered to the author plus the GM — nobody else, not even in
 * network payloads.
 */
async function persistAndEmitWhisperToBot(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  sceneId: string | null,
  bot: ChatBot,
  text: string,
): Promise<void> {
  const message = await insertChatMessage(deps.ctx.prisma, {
    campaignId,
    authorId: user.id,
    kind: 'whisper',
    text,
    recipientBotId: bot.id,
    sceneId,
  });
  await deliverChatMessageTo(deps, campaignId, message, [user.id], true);
  await requestBotTurns(deps, [
    {
      campaignId,
      botId: bot.id,
      sceneId,
      calledByUserId: user.id,
      whisperToUserId: user.id,
    },
  ]);
}

async function persistAndEmitWhisper(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  sceneId: string | null,
  targetName: string,
  text: string,
  bots: ChatBot[],
): Promise<void> {
  const wanted = targetName.toLowerCase();
  const roster = await getRoster(deps.ctx.prisma, campaignId);
  const target = roster.find((entry) => entry.name.toLowerCase() === wanted);
  if (!target) {
    // Only bots in the session can be whispered to — an idle profile must not
    // become a way for players to probe which bots exist.
    const bot = bots.find((entry) => entry.active && entry.name.toLowerCase() === wanted);
    if (!bot) throw new RealtimeError('TARGET_NOT_FOUND');
    await persistAndEmitWhisperToBot(deps, campaignId, user, sceneId, bot, text);
    return;
  }
  if (target.id === user.id) throw new RealtimeError('TARGET_IS_SELF');

  const message = await insertChatMessage(deps.ctx.prisma, {
    campaignId,
    authorId: user.id,
    kind: 'whisper',
    text,
    recipientId: target.id,
    sceneId,
  });
  // Targeted delivery: author and recipient only. No seq — it is not a
  // room-wide broadcast, so it must not create seq gaps.
  await deliverChatMessageTo(deps, campaignId, message, [user.id, target.id]);
}

/**
 * `/jako <bot> <treść>` — the GM speaks in an NPC's name without the model.
 * The bot may be idle („nie w sesji"): voicing an NPC by hand needs no model.
 */
async function persistAndEmitAsBot(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  sceneId: string | null,
  targetName: string,
  text: string,
  bots: ChatBot[],
): Promise<void> {
  const wanted = targetName.toLowerCase();
  const bot = bots.find((entry) => entry.name.toLowerCase() === wanted);
  if (!bot) throw new RealtimeError('BOT_NOT_FOUND');
  await speakAsBot(deps, {
    campaignId,
    gmUserId: user.id,
    sceneId,
    bot: { id: bot.id, name: bot.name },
    text,
  });
}

/**
 * Sanitizes the optional throw vector: all four numbers must be finite, the
 * direction non-degenerate. The direction is re-normalized and the origin
 * clamped to the viewport, so clients can never inject wild values into other
 * viewers' animations.
 */
function sanitizeToss(raw: unknown): RollToss | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { dirX, dirY, originX, originY } = raw as Record<string, unknown>;
  const nums = [dirX, dirY, originX, originY];
  if (!nums.every((n): n is number => typeof n === 'number' && Number.isFinite(n))) {
    return undefined;
  }
  const length = Math.hypot(dirX as number, dirY as number);
  if (length < 1e-6) return undefined;
  const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);
  return {
    dirX: (dirX as number) / length,
    dirY: (dirY as number) / length,
    originX: clamp01(originX as number),
    originY: clamp01(originY as number),
  };
}

/**
 * Sanitizes the optional cup gesture: clamps the strength, drops malformed or
 * oversized payloads (the entropy is free-form client data — it only ever
 * feeds a hash, but we keep it bounded).
 */
export function sanitizeGesture(raw: unknown): RollGesture | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { entropy, strength, toss } = raw as {
    entropy?: unknown;
    strength?: unknown;
    toss?: unknown;
  };
  if (typeof entropy !== 'string' || entropy.length === 0) return undefined;
  if (entropy.length > MAX_GESTURE_ENTROPY_LENGTH) return undefined;
  const clamped =
    typeof strength === 'number' && Number.isFinite(strength)
      ? Math.min(Math.max(Math.round(strength), 0), MAX_GESTURE_STRENGTH)
      : 0;
  const gesture: RollGesture = { entropy, strength: clamped };
  const sanitizedToss = sanitizeToss(toss);
  if (sanitizedToss) gesture.toss = sanitizedToss;
  return gesture;
}

/** Executes a chat-command roll server-side and delivers the result. */
async function persistAndEmitRoll(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  sceneId: string | null,
  visibility: 'public' | 'gm',
  formula: RollFormula,
  label: string | undefined,
  gesture: RollGesture | undefined,
): Promise<void> {
  const result = rollFormula(formula, createMixedRng(gesture?.entropy));
  if (gesture && gesture.strength > 0) result.tossStrength = gesture.strength;
  if (gesture?.toss) result.toss = gesture.toss;
  const message = await insertChatMessage(deps.ctx.prisma, {
    campaignId,
    authorId: user.id,
    kind: visibility === 'gm' ? 'gmroll' : 'roll',
    text: label ?? '',
    payload: JSON.stringify(result),
    sceneId,
  });
  await deliverRollMessage(deps, campaignId, user.id, message);
}

export const chatSendEvent = defineEvent<ChatSendPayload>({
  name: 'chat:send',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const sceneId = messageSceneId(socket.data);
    const text = typeof payload?.text === 'string' ? payload.text : '';
    if (text.length > MAX_CHAT_MESSAGE_LENGTH) throw new RealtimeError('MESSAGE_TOO_LONG');

    const [roster, bots] = await Promise.all([
      getRoster(deps.ctx.prisma, campaignId),
      listChatBots(deps.ctx.prisma, campaignId),
    ]);
    // Bot names join the roster only to parse multi-word targets; who may be
    // addressed at all is decided below, per command.
    const parsed = parseChatInput(text, [
      ...roster.map((entry) => entry.name),
      ...bots.map((entry) => entry.name),
    ]);

    switch (parsed.kind) {
      case 'empty':
        throw new RealtimeError('EMPTY_MESSAGE');
      case 'unknown-command':
        throw new RealtimeError('UNKNOWN_COMMAND');
      case 'invalid-whisper':
        throw new RealtimeError(
          parsed.reason === 'MISSING_TARGET' ? 'WHISPER_MISSING_TARGET' : 'WHISPER_MISSING_TEXT',
        );
      case 'invalid-as-bot':
        throw new RealtimeError(
          parsed.reason === 'MISSING_TARGET' ? 'AS_BOT_MISSING_TARGET' : 'AS_BOT_MISSING_TEXT',
        );
      case 'invalid-roll':
        throw new RealtimeError(
          parsed.reason === 'MISSING_NOTATION' ? 'ROLL_MISSING_NOTATION' : 'ROLL_BAD_NOTATION',
        );
      case 'say': {
        const message = await persistAndEmitSay(deps, campaignId, user, sceneId, parsed.text);
        await triggerBotsForLine(deps, {
          campaignId,
          sceneId,
          origin: 'user',
          text: parsed.text,
          messageId: message.id,
          calledByUserId: user.id,
          calledByName: user.name,
          bots,
        });
        return;
      }
      case 'whisper':
        await persistAndEmitWhisper(
          deps,
          campaignId,
          user,
          sceneId,
          parsed.targetName,
          parsed.text,
          bots,
        );
        return;
      case 'as-bot':
        // Speaking as an NPC is a GM power — a player must not be able to put
        // words in an NPC's mouth.
        if (user.role !== ROLE_GM) throw new RealtimeError('FORBIDDEN');
        await persistAndEmitAsBot(
          deps,
          campaignId,
          user,
          sceneId,
          parsed.targetName,
          parsed.text,
          bots,
        );
        return;
      case 'roll':
        await persistAndEmitRoll(
          deps,
          campaignId,
          user,
          sceneId,
          parsed.visibility,
          parsed.formula,
          parsed.label,
          sanitizeGesture(payload.gesture),
        );
        return;
    }
  },
});

export const chatHistoryEvent = defineEvent<ChatHistoryRequest, ChatHistoryPage>({
  name: 'chat:history',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const beforeId = typeof payload?.beforeId === 'number' ? payload.beforeId : undefined;
    if (beforeId === undefined || !Number.isInteger(beforeId) || beforeId <= 0) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const limit = Math.min(
      typeof payload.limit === 'number' && payload.limit > 0
        ? payload.limit
        : CHAT_HISTORY_PAGE_SIZE,
      CHAT_HISTORY_PAGE_SIZE,
    );
    return fetchHistoryPage(deps.ctx.prisma, campaignId, user, beforeId, limit);
  },
});
