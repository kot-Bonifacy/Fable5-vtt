import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io';
import type {
  AiUsage,
  BotChatPayload,
  BotChatTurn,
  BotChunkBroadcast,
  BotErrorBroadcast,
  BotLesson,
  BotProfileData,
  BotReplyBroadcast,
  BotTeachPayload,
  BotView,
} from '@vtt/shared';
import {
  BOT_BREAK_LABELS,
  BOT_CORRECTION_MAX_LENGTH,
  BOT_HISTORY_MAX_TURNS,
  BOT_TEST_MESSAGE_MAX_LENGTH,
  ROLE_GM,
  appendLesson,
  buildLessonPrompt,
  buildRetryAnchor,
  buildRoleAnchor,
  compileBotPrompt,
  createLesson,
  detectBotBreak,
  normalizeLesson,
  parseBotData,
  sanitizeBotReply,
  type BotBreakReason,
} from '@vtt/shared';
import type { AiChatRequest } from '../ai/gateway.js';
import type { PrismaClient } from '../db.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitBotUpsert, requireCampaignBot, toBotView } from './bots.js';

/**
 * Running one bot turn — the piece stage 11 reuses to put bots on the session
 * chat, so it knows nothing about sockets beyond an optional chunk callback.
 *
 * Staying in character has three layers here:
 *  1. the compiled system prompt (hard rules),
 *  2. a role anchor appended as the LAST message (a 9B model follows the end
 *     of the context far better than its beginning),
 *  3. detection + ONE automatic retry with a stronger reminder; whatever
 *     survives that is delivered sanitized, with a warning for the GM.
 */

export interface BotRuntime {
  id: string;
  name: string;
  data: BotProfileData;
}

export interface BotTurnOptions {
  /** Conversation so far, oldest first, including the new incoming line. */
  turns: BotChatTurn[];
  /** Names at the table — used for stop sequences and slip detection. */
  participants: string[];
  scene?: string | null;
  /** Provisional streamed text; `reset` clears what was streamed before. */
  onChunk?: (text: string, reset: boolean) => void;
  signal?: AbortSignal;
}

export interface BotTurnOutcome {
  text: string;
  retried: boolean;
  /** Polish description of a slip that survived the retry; null when clean. */
  warning: string | null;
  usage: AiUsage | null;
  error: { code: string; detail?: string } | null;
}

const DEFAULT_SPEAKER = 'Mistrz Gry';

function trimTurns(turns: BotChatTurn[] | undefined): BotChatTurn[] {
  if (!Array.isArray(turns)) return [];
  return turns
    .filter((turn) => typeof turn?.text === 'string' && turn.text.trim().length > 0)
    .slice(-BOT_HISTORY_MAX_TURNS)
    .map((turn) => ({
      role: turn.role === 'bot' ? 'bot' : 'user',
      text: turn.text.slice(0, BOT_TEST_MESSAGE_MAX_LENGTH),
      ...(typeof turn.speaker === 'string' ? { speaker: turn.speaker.slice(0, 48) } : {}),
    }));
}

/** Who said what — the bot's own lines as `assistant`, everyone else prefixed. */
function toMessages(bot: BotRuntime, turns: BotChatTurn[]): AiChatRequest['messages'] {
  return turns.map((turn) =>
    turn.role === 'bot'
      ? { role: 'assistant' as const, content: turn.text }
      : { role: 'user' as const, content: `${turn.speaker ?? DEFAULT_SPEAKER}: ${turn.text}` },
  );
}

/**
 * Puts the role anchor at the very end of the context — folded into the last
 * user message rather than sent as a second `system` message: the Qwen chat
 * template used by our model refuses those outright („System message must be
 * at the beginning"), and the end of the context is exactly where a 9B model
 * pays the most attention anyway.
 */
function withAnchors(
  messages: AiChatRequest['messages'],
  ...anchors: string[]
): AiChatRequest['messages'] {
  const text = anchors.filter((anchor) => anchor.trim().length > 0).join('\n');
  if (text.length === 0) return messages;
  const lastUser = messages.findLastIndex((message) => message.role === 'user');
  if (lastUser === -1) return [...messages, { role: 'user', content: text }];
  return messages.map((message, index) =>
    index === lastUser ? { ...message, content: `${message.content}\n\n${text}` } : message,
  );
}

/** Cuts the model off as soon as it starts writing someone else's line. */
function stopSequences(bot: BotRuntime, participants: string[]): string[] {
  return participants
    .filter((name) => name && name !== bot.name)
    .slice(0, 4)
    .map((name) => `\n${name}:`);
}

async function generateOnce(
  deps: RealtimeDeps,
  bot: BotRuntime,
  messages: AiChatRequest['messages'],
  options: BotTurnOptions,
  onChunk: ((text: string) => void) | undefined,
): Promise<{
  raw: string;
  usage: AiUsage | null;
  error: { code: string; detail?: string } | null;
}> {
  const { generation, type } = bot.data;
  const request: AiChatRequest = {
    messages,
    purpose: type === 'gm_assistant' ? 'gm_assistant' : 'npc',
    botId: bot.id,
    reasoning: generation.reasoning,
    maxTokens: generation.maxTokens,
    temperature: generation.temperature,
    stop: stopSequences(bot, options.participants),
  };

  let raw = '';
  let usage: AiUsage | null = null;
  for await (const event of deps.ctx.ai.streamChat(request, options.signal)) {
    switch (event.type) {
      case 'delta':
        raw += event.text;
        onChunk?.(event.text);
        break;
      case 'done':
        usage = event.usage;
        break;
      case 'error':
        return {
          raw,
          usage,
          error: { code: event.code, ...(event.detail ? { detail: event.detail } : {}) },
        };
      default:
        // `queue` and `think` are diagnostics; a bot's reasoning never leaks.
        break;
    }
  }
  return { raw, usage, error: null };
}

export async function runBotTurn(
  deps: RealtimeDeps,
  bot: BotRuntime,
  options: BotTurnOptions,
): Promise<BotTurnOutcome> {
  const turns = trimTurns(options.turns);
  const promptCtx = {
    name: bot.name,
    data: bot.data,
    participants: options.participants,
    scene: options.scene ?? null,
  };
  const guard = {
    botName: bot.name,
    type: bot.data.type,
    participants: options.participants,
  };
  const base: AiChatRequest['messages'] = [
    { role: 'system', content: compileBotPrompt(promptCtx) },
    ...toMessages(bot, turns),
  ];

  const first = await generateOnce(
    deps,
    bot,
    withAnchors(base, buildRoleAnchor(promptCtx)),
    options,
    options.onChunk ? (text) => options.onChunk?.(text, false) : undefined,
  );
  if (first.error) {
    return { text: '', retried: false, warning: null, usage: first.usage, error: first.error };
  }

  // Detection runs on the RAW answer: a slip must be noticed even when the
  // sanitizer would have quietly swept it under the carpet.
  let reason: BotBreakReason | null = detectBotBreak(first.raw, guard);
  if (!reason) {
    return {
      text: sanitizeBotReply(first.raw, guard).text,
      retried: false,
      warning: null,
      usage: first.usage,
      error: null,
    };
  }

  deps.log.warn({ botId: bot.id, reason }, 'bot broke character — retrying once');
  options.onChunk?.('', true);
  const retry = await generateOnce(
    deps,
    bot,
    withAnchors(base, buildRoleAnchor(promptCtx), buildRetryAnchor(promptCtx, reason)),
    options,
    options.onChunk ? (text) => options.onChunk?.(text, false) : undefined,
  );
  if (retry.error) {
    // The retry failed to reach the model — deliver the cleaned first answer.
    return {
      text: sanitizeBotReply(first.raw, guard).text,
      retried: true,
      warning: BOT_BREAK_LABELS[reason],
      usage: first.usage,
      error: null,
    };
  }

  reason = detectBotBreak(retry.raw, guard);
  return {
    text: sanitizeBotReply(retry.raw, guard).text,
    retried: true,
    warning: reason ? BOT_BREAK_LABELS[reason] : null,
    usage: retry.usage,
    error: null,
  };
}

/**
 * Names at the table: campaign members plus their characters. Used both for
 * stop sequences and for spotting a bot that starts speaking for a player.
 */
export async function campaignParticipants(
  prisma: PrismaClient,
  campaignId: string,
): Promise<string[]> {
  const [members, characters] = await Promise.all([
    prisma.campaignMember.findMany({
      where: { campaignId },
      select: { user: { select: { name: true } } },
    }),
    prisma.character.findMany({ where: { campaignId }, select: { name: true } }),
  ]);
  const names = new Set<string>();
  for (const member of members) names.add(member.user.name);
  for (const character of characters) names.add(character.name);
  return [...names];
}

/**
 * Test conversation in the bot editor (GM only, never touches session chat).
 * The answer streams in as provisional text and is replaced by the final,
 * sanitized `bot:reply`.
 */
export const botChatEvent = defineEvent<BotChatPayload, { requestId: string }>({
  name: 'bot:chat',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    if (!socket.data.campaign) throw new RealtimeError('NO_CAMPAIGN');
    const campaignId = socket.data.campaign.id;
    const bot = await requireCampaignBot(deps.ctx.prisma, campaignId, payload?.botId);
    const message = payload?.message?.trim() ?? '';
    if (!message) throw new RealtimeError('BOT_EMPTY_MESSAGE');
    if (message.length > BOT_TEST_MESSAGE_MAX_LENGTH)
      throw new RealtimeError('BOT_MESSAGE_TOO_LONG');
    if (!deps.ctx.ai.getStatus().available) throw new RealtimeError('AI_UNAVAILABLE');

    const runtime: BotRuntime = { id: bot.id, name: bot.name, data: parseBotData(bot.data) };
    const requestId = randomUUID();
    const speaker = payload?.speaker?.trim() || DEFAULT_SPEAKER;
    const turns: BotChatTurn[] = [
      ...trimTurns(payload?.history),
      { role: 'user', text: message, speaker },
    ];

    // Detached like `ai:ask`: the ack returns at once so the editor can show
    // „bot pisze…" while tokens arrive.
    void streamBotAnswer(deps, socket, requestId, runtime, campaignId, turns);
    return { requestId };
  },
});

async function streamBotAnswer(
  deps: RealtimeDeps,
  socket: Socket,
  requestId: string,
  bot: BotRuntime,
  campaignId: string,
  turns: BotChatTurn[],
): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  socket.once('disconnect', abort);
  socket.once('bot:cancel', abort);

  try {
    const participants = await campaignParticipants(deps.ctx.prisma, campaignId);
    const outcome = await runBotTurn(deps, bot, {
      turns,
      participants,
      signal: controller.signal,
      onChunk: (text, reset) => {
        if (socket.disconnected) return;
        const chunk: BotChunkBroadcast = {
          requestId,
          botId: bot.id,
          text,
          ...(reset ? { reset: true } : {}),
        };
        socket.emit('bot:chunk', chunk);
      },
    });
    if (socket.disconnected) return;

    if (outcome.error) {
      const error: BotErrorBroadcast = {
        requestId,
        botId: bot.id,
        code: outcome.error.code,
        ...(outcome.error.detail ? { detail: outcome.error.detail } : {}),
      };
      socket.emit('bot:error', error);
      return;
    }

    const reply: BotReplyBroadcast = {
      requestId,
      botId: bot.id,
      text: outcome.text,
      retried: outcome.retried,
      warning: outcome.warning,
      usage: outcome.usage
        ? {
            completionTokens: outcome.usage.completionTokens,
            generationMs: outcome.usage.generationMs,
          }
        : null,
    };
    socket.emit('bot:reply', reply);
  } catch (error) {
    deps.log.error({ err: error, botId: bot.id }, 'bot turn failed');
    socket.emit('bot:error', {
      requestId,
      botId: bot.id,
      code: 'AI_ERROR',
    } satisfies BotErrorBroadcast);
  } finally {
    socket.off('disconnect', abort);
    socket.off('bot:cancel', abort);
  }
}

/**
 * „The bot learns": a GM correction becomes one rule stored in the profile and
 * injected into every following prompt (and into the role anchor, so the
 * newest corrections are the last thing the model reads).
 *
 * The model only phrases the rule. With the gateway down the correction is
 * stored verbatim — learning must not depend on the GPU being up.
 */
export const botTeachEvent = defineEvent<BotTeachPayload, { lesson: BotLesson; bot: BotView }>({
  name: 'bot:teach',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    if (!socket.data.campaign) throw new RealtimeError('NO_CAMPAIGN');
    const campaignId = socket.data.campaign.id;
    const bot = await requireCampaignBot(deps.ctx.prisma, campaignId, payload?.botId);
    const correction = payload?.correction?.trim() ?? '';
    if (!correction) throw new RealtimeError('BOT_EMPTY_CORRECTION');
    if (correction.length > BOT_CORRECTION_MAX_LENGTH) {
      throw new RealtimeError('BOT_CORRECTION_TOO_LONG');
    }

    const quote = payload?.quote?.trim().slice(0, BOT_TEST_MESSAGE_MAX_LENGTH);
    const text = await phraseLesson(deps, bot.name, correction, quote);
    const data = appendLesson(parseBotData(bot.data), createLesson(text, 'gm', correction));

    const updated = await deps.ctx.prisma.botProfile.update({
      where: { id: bot.id },
      data: { data: JSON.stringify(data) },
    });
    const view = toBotView(updated);
    emitBotUpsert(deps, campaignId, view);
    const lesson = view.data.lessons.at(-1);
    if (!lesson) throw new RealtimeError('INTERNAL');
    return { lesson, bot: view };
  },
});

/** Asks the model to compress the correction; falls back to the raw wording. */
async function phraseLesson(
  deps: RealtimeDeps,
  botName: string,
  correction: string,
  quote: string | undefined,
): Promise<string> {
  if (!deps.ctx.ai.getStatus().available) return normalizeLesson(correction);
  const { system, user } = buildLessonPrompt(botName, correction, quote);
  let raw = '';
  try {
    for await (const event of deps.ctx.ai.streamChat({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      purpose: 'test',
      reasoning: false,
      // Rephrasing, not inventing: low temperature, room for one sentence.
      temperature: 0.2,
      maxTokens: 120,
      // One rule, not a monologue — anything past the first paragraph is noise.
      stop: ['\n\n', 'Uwaga:'],
    })) {
      if (event.type === 'delta') raw += event.text;
      if (event.type === 'error') return normalizeLesson(correction);
    }
  } catch (error) {
    deps.log.warn({ err: error }, 'lesson phrasing failed — storing the raw correction');
    return normalizeLesson(correction);
  }
  const lesson = normalizeLesson(raw);
  return lesson.length > 0 ? lesson : normalizeLesson(correction);
}
