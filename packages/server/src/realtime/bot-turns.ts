import { randomUUID } from 'node:crypto';
import type {
  BotActivityBroadcast,
  BotActivityEntry,
  BotChatTurn,
  BotNoticeBroadcast,
  BotSayPayload,
  BotStopPayload,
  BotTraceBroadcast,
  BotTriggerCandidate,
  BotTriggerOrigin,
  ChatMessageView,
  SessionUser,
} from '@vtt/shared';
import {
  BOT_CONTEXT_FALLBACK_TOKENS,
  BOT_CONTEXT_SAFETY_TOKENS,
  BOT_SESSION_HISTORY_MAX_TURNS,
  BOT_TURN_TIMEOUT_MS,
  MAX_CHAT_MESSAGE_LENGTH,
  ROLE_GM,
  compileBotPrompt,
  estimatePromptTokens,
  parseBotData,
  sanitizeBotName,
  selectBotsToAnswer,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { broadcastChatMessage, deliverChatMessageTo, insertChatMessage } from './chat-io.js';
import { campaignParticipants, runBotTurn, type BotRuntime } from './bot-chat.js';
import { getSceneById } from './scenes.js';
import { campaignRoom, gmRoom } from './state.js';

/**
 * Bots as participants of the session chat (stage 11).
 *
 * Everything a bot says on chat goes through the queue here: one generation at
 * a time per campaign (llama-server runs with `--parallel 1` anyway), with the
 * turns in flight broadcast so the table sees „Vex pisze…" and how many bots
 * are waiting. The answer itself is a normal chat message — the transcript is
 * the bots' short-term memory, and stage 12 can attach audio to it later.
 *
 * What players may learn is deliberately limited: a bot line is stored and
 * delivered exactly like an NPC line typed by the GM (`/jako`), and the
 * diagnostics (retry, break warning, timing, token cost) go to the GM room
 * only.
 */

/** A bot as the chat needs it: enough to match a name and route a turn. */
export interface ChatBot extends BotTriggerCandidate {
  portraitUrl: string | null;
}

export interface BotTurnRequest {
  campaignId: string;
  botId: string;
  sceneId: string | null;
  /** Who called the bot — receives the „unavailable" notice. */
  calledByUserId: string;
  /** Answer to a whisper: the line is whispered back to this user only. */
  whisperToUserId?: string | null;
}

interface QueuedTurn {
  request: BotTurnRequest;
  entry: BotActivityEntry;
  /** Throttle guard for streamed text broadcasts. */
  lastFlushAt: number;
}

class CampaignQueue {
  readonly pending: QueuedTurn[] = [];
  current: { turn: QueuedTurn; controller: AbortController } | null = null;
  draining = false;
}

/**
 * In-memory, per campaign — like the seq counters, this is live session state
 * that must not survive a restart (a queued bot line after a crash would
 * arrive out of context).
 */
const queues = new Map<string, CampaignQueue>();

function getQueue(campaignId: string): CampaignQueue {
  const existing = queues.get(campaignId);
  if (existing) return existing;
  const created = new CampaignQueue();
  queues.set(campaignId, created);
  return created;
}

/** Bots that may appear on chat: everything not archived, oldest first. */
export async function listChatBots(prisma: PrismaClient, campaignId: string): Promise<ChatBot[]> {
  return prisma.botProfile.findMany({
    where: { campaignId, archived: false },
    select: { id: true, name: true, active: true, sceneId: true, portraitUrl: true },
    orderBy: { createdAt: 'asc' },
  });
}

/** The account NPC lines are stored under — see `ChatMessage.authorId`. */
async function gmUserId(prisma: PrismaClient): Promise<string | null> {
  const gm = await prisma.user.findFirst({
    where: { role: ROLE_GM },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return gm?.id ?? null;
}

function notice(
  deps: RealtimeDeps,
  campaignId: string,
  userId: string | null,
  payload: BotNoticeBroadcast,
): void {
  // Targeted, never stored: a bot failing to answer is an operational hiccup,
  // not part of the session transcript.
  void (async () => {
    const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
    for (const socket of sockets) {
      const user = (socket.data as { user: SessionUser }).user;
      if (user.id === userId || user.role === ROLE_GM) socket.emit('bot:notice', payload);
    }
  })().catch((error: unknown) => {
    deps.log.warn({ err: error }, 'bot notice delivery failed');
  });
}

function activityEntries(queue: CampaignQueue): BotActivityEntry[] {
  const entries = queue.current ? [queue.current.turn.entry] : [];
  return [...entries, ...queue.pending.map((turn) => turn.entry)];
}

/** Renumbers the queue so „kolejka: 2" stays truthful after every change. */
function renumber(queue: CampaignQueue): void {
  queue.pending.forEach((turn, index) => {
    turn.entry.position = index + 1;
    turn.entry.state = 'queued';
  });
  if (queue.current) {
    queue.current.turn.entry.position = 0;
    queue.current.turn.entry.state = 'typing';
  }
}

/**
 * Pushes the turns in flight to the table. Private turns (answers to whispers)
 * are filtered per socket, so a whispered answer never flashes on the screens
 * of other players.
 */
async function broadcastActivity(deps: RealtimeDeps, campaignId: string): Promise<void> {
  const entries = activityEntries(getQueue(campaignId));
  const room = campaignRoom(campaignId);
  if (!entries.some((entry) => entry.whisperToUserId)) {
    deps.io.to(room).emit('bot:activity', { entries } satisfies BotActivityBroadcast);
    return;
  }
  const sockets = await deps.io.in(room).fetchSockets();
  for (const socket of sockets) {
    const user = (socket.data as { user: SessionUser }).user;
    const visible = entries.filter(
      (entry) =>
        !entry.whisperToUserId || entry.whisperToUserId === user.id || user.role === ROLE_GM,
    );
    socket.emit('bot:activity', { entries: visible } satisfies BotActivityBroadcast);
  }
}

/**
 * Queues one turn per requested bot. Refuses (with a notice to the caller and
 * the GM) when the gateway is down — the graceful degradation rule: chat keeps
 * working, only the bot stays silent.
 */
export async function requestBotTurns(
  deps: RealtimeDeps,
  requests: BotTurnRequest[],
): Promise<void> {
  if (requests.length === 0) return;
  const available = deps.ctx.ai.getStatus().available;
  const queue = getQueue(requests[0]!.campaignId);
  let queued = 0;

  for (const request of requests) {
    const bot = await deps.ctx.prisma.botProfile.findUnique({
      where: { id: request.botId },
      select: {
        id: true,
        name: true,
        campaignId: true,
        active: true,
        archived: true,
        portraitUrl: true,
      },
    });
    if (!bot || bot.campaignId !== request.campaignId || bot.archived || !bot.active) continue;

    if (!available) {
      notice(deps, request.campaignId, request.calledByUserId, {
        botId: bot.id,
        botName: bot.name,
        code: 'AI_UNAVAILABLE',
      });
      continue;
    }
    // One turn per bot at a time: a second call while it is still thinking
    // would just produce two answers to the same line.
    const busy =
      queue.current?.turn.request.botId === bot.id ||
      queue.pending.some((turn) => turn.request.botId === bot.id);
    if (busy) continue;

    queue.pending.push({
      request,
      entry: {
        turnId: randomUUID(),
        botId: bot.id,
        name: bot.name,
        portraitUrl: bot.portraitUrl,
        state: 'queued',
        position: queue.pending.length + 1,
        text: '',
        ...(request.whisperToUserId ? { whisperToUserId: request.whisperToUserId } : {}),
      },
      lastFlushAt: 0,
    });
    queued += 1;
  }

  if (queued === 0) return;
  renumber(queue);
  await broadcastActivity(deps, requests[0]!.campaignId);
  void drain(deps, requests[0]!.campaignId);
}

/** Runs queued turns one at a time until the queue is empty. */
async function drain(deps: RealtimeDeps, campaignId: string): Promise<void> {
  const queue = getQueue(campaignId);
  if (queue.draining) return;
  queue.draining = true;
  try {
    let turn = queue.pending.shift();
    while (turn) {
      const controller = new AbortController();
      queue.current = { turn, controller };
      renumber(queue);
      await broadcastActivity(deps, campaignId);
      try {
        await runQueuedTurn(deps, turn, controller.signal);
      } catch (error) {
        deps.log.error({ err: error, botId: turn.request.botId }, 'bot chat turn failed');
      }
      queue.current = null;
      turn = queue.pending.shift();
    }
  } finally {
    queue.draining = false;
    queue.current = null;
    await broadcastActivity(deps, campaignId).catch(() => undefined);
  }
}

/** GM's emergency brake: drops one turn or the whole queue. */
export async function stopBotTurns(
  deps: RealtimeDeps,
  campaignId: string,
  turnId?: string,
): Promise<void> {
  const queue = getQueue(campaignId);
  if (turnId) {
    const index = queue.pending.findIndex((turn) => turn.entry.turnId === turnId);
    if (index !== -1) queue.pending.splice(index, 1);
    if (queue.current?.turn.entry.turnId === turnId) queue.current.controller.abort();
  } else {
    queue.pending.length = 0;
    queue.current?.controller.abort();
  }
  renumber(queue);
  await broadcastActivity(deps, campaignId);
}

interface BotContext {
  turns: BotChatTurn[];
  promptTokens: number | null;
}

/**
 * The bot's short-term memory: chat lines of the scene it is standing in.
 * Included are public lines, its own lines and whispers exchanged with it;
 * dice rolls are left out on purpose (a bot must not talk about mechanics), as
 * are whispers between other people.
 *
 * Lines spoken with no scene active belong to every scene — otherwise a
 * conversation started before the GM activated a map would vanish.
 */
async function buildBotContext(
  deps: RealtimeDeps,
  bot: BotRuntime,
  request: BotTurnRequest,
  scene: string | null,
  participants: string[],
): Promise<BotContext> {
  const rows = await deps.ctx.prisma.chatMessage.findMany({
    where: {
      campaignId: request.campaignId,
      ...(request.sceneId !== null
        ? { OR: [{ sceneId: request.sceneId }, { sceneId: null }] }
        : { sceneId: null }),
      AND: [
        {
          OR: [
            { kind: 'say' },
            { kind: 'whisper', botId: bot.id },
            { kind: 'whisper', recipientBotId: bot.id },
          ],
        },
      ],
    },
    orderBy: { id: 'desc' },
    take: BOT_SESSION_HISTORY_MAX_TURNS,
    select: {
      kind: true,
      text: true,
      botId: true,
      speakerName: true,
      author: { select: { name: true } },
    },
  });

  const turns: BotChatTurn[] = rows
    .reverse()
    .filter((row) => row.text.trim().length > 0)
    .map((row) => {
      const speaker = row.speakerName ?? row.author.name;
      return row.botId === bot.id
        ? { role: 'bot' as const, text: row.text }
        : {
            role: 'user' as const,
            text: row.text,
            // Whispers are marked so the bot knows what it may not repeat out
            // loud (there is a matching prompt rule).
            speaker: row.kind === 'whisper' ? `${speaker} (szeptem)` : speaker,
          };
    });

  const budget = contextBudget(deps, bot);
  const systemPrompt = compileBotPrompt({
    name: bot.name,
    data: bot.data,
    participants,
    scene,
    mode: request.whisperToUserId ? 'whisper' : 'chat',
  });
  return trimToBudget(deps, systemPrompt, turns, budget);
}

/** Tokens left for the prompt after reserving room for the answer. */
function contextBudget(deps: RealtimeDeps, bot: BotRuntime): number {
  const contextSize = deps.ctx.ai.getStatus().contextSize ?? BOT_CONTEXT_FALLBACK_TOKENS;
  const reserved = bot.data.generation.maxTokens + BOT_CONTEXT_SAFETY_TOKENS;
  return Math.max(512, contextSize - reserved);
}

/**
 * Trims history to the context window measured with the model's own tokenizer
 * (character estimates drift badly on Polish inflection). One measurement per
 * pass, oldest lines dropped first, at most four passes — then a hard cut.
 */
async function trimToBudget(
  deps: RealtimeDeps,
  systemPrompt: string,
  turns: BotChatTurn[],
  budget: number,
): Promise<BotContext> {
  const measure = async (candidate: BotChatTurn[]): Promise<number> => {
    const text = [
      systemPrompt,
      ...candidate.map((turn) => `${turn.speaker ?? ''}: ${turn.text}`),
    ].join('\n');
    const counted = await deps.ctx.ai.countTokens(text);
    return counted ?? estimatePromptTokens(text);
  };

  let current = turns;
  let tokens = await measure(current);
  for (let pass = 0; pass < 4 && tokens > budget && current.length > 1; pass += 1) {
    const drop = Math.max(1, Math.ceil(current.length * 0.3));
    current = current.slice(drop);
    tokens = await measure(current);
  }
  if (tokens > budget && current.length > 1) current = current.slice(-1);
  return { turns: current, promptTokens: tokens };
}

async function runQueuedTurn(
  deps: RealtimeDeps,
  turn: QueuedTurn,
  signal: AbortSignal,
): Promise<void> {
  const { request, entry } = turn;
  const stored = await deps.ctx.prisma.botProfile.findUnique({ where: { id: request.botId } });
  if (!stored || stored.archived || !stored.active) return;

  const bot: BotRuntime = {
    id: stored.id,
    name: stored.name,
    data: parseBotData(stored.data),
  };
  const [scene, participants, authorId] = await Promise.all([
    request.sceneId ? getSceneById(deps.ctx.prisma, request.sceneId) : Promise.resolve(null),
    campaignParticipants(deps.ctx.prisma, request.campaignId),
    gmUserId(deps.ctx.prisma),
  ]);
  if (!authorId) {
    deps.log.error('no GM account to attribute a bot line to');
    return;
  }
  const whisperWith = request.whisperToUserId
    ? ((
        await deps.ctx.prisma.user.findUnique({
          where: { id: request.whisperToUserId },
          select: { name: true },
        })
      )?.name ?? null)
    : null;

  const context = await buildBotContext(deps, bot, request, scene?.name ?? null, participants);
  // Hard cap on one turn, on top of the GM's stop button.
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(BOT_TURN_TIMEOUT_MS)]);

  let outcome;
  try {
    outcome = await runBotTurn(deps, bot, {
      turns: context.turns,
      maxTurns: BOT_SESSION_HISTORY_MAX_TURNS,
      participants,
      scene: scene?.name ?? null,
      mode: request.whisperToUserId ? 'whisper' : 'chat',
      whisperWith,
      signal: deadline,
      onChunk: (text, reset) => {
        entry.text = reset ? '' : entry.text + text;
        const now = Date.now();
        // The provisional text is streamed, but not at 80 events per second.
        if (!reset && now - turn.lastFlushAt < 120) return;
        turn.lastFlushAt = now;
        void broadcastActivity(deps, request.campaignId).catch(() => undefined);
      },
    });
  } catch (error) {
    if (signal.aborted) {
      notice(deps, request.campaignId, request.calledByUserId, {
        botId: bot.id,
        botName: bot.name,
        code: 'BOT_STOPPED',
      });
      return;
    }
    deps.log.warn({ err: error, botId: bot.id }, 'bot turn aborted');
    notice(deps, request.campaignId, request.calledByUserId, {
      botId: bot.id,
      botName: bot.name,
      code: 'BOT_TIMEOUT',
    });
    return;
  }

  // The GM pressed stop while the answer was already coming in: whatever
  // arrived must not reach the table (aborting the HTTP stream alone is not
  // enough — the last chunks may already be in flight).
  if (signal.aborted) {
    notice(deps, request.campaignId, request.calledByUserId, {
      botId: bot.id,
      botName: bot.name,
      code: 'BOT_STOPPED',
    });
    return;
  }

  if (outcome.error) {
    notice(deps, request.campaignId, request.calledByUserId, {
      botId: bot.id,
      botName: bot.name,
      code: outcome.error.code,
      ...(outcome.error.detail ? { detail: outcome.error.detail } : {}),
    });
    return;
  }
  const text = outcome.text.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
  if (text.length === 0) {
    notice(deps, request.campaignId, request.calledByUserId, {
      botId: bot.id,
      botName: bot.name,
      code: 'BOT_EMPTY_REPLY',
    });
    return;
  }

  const message = await deliverBotLine(deps, {
    campaignId: request.campaignId,
    authorId,
    bot,
    text,
    sceneId: request.sceneId,
    whisperToUserId: request.whisperToUserId ?? null,
  });

  // Diagnostics stay with the GM: for players the line is indistinguishable
  // from an NPC line the GM typed.
  const trace: BotTraceBroadcast = {
    messageId: message.id,
    botId: bot.id,
    retried: outcome.retried,
    warning: outcome.warning,
    generationMs: outcome.usage?.generationMs ?? null,
    completionTokens: outcome.usage?.completionTokens ?? null,
    historyTurns: context.turns.length,
    promptTokens: context.promptTokens,
  };
  deps.io.to(gmRoom(request.campaignId)).emit('bot:trace', trace);
}

interface BotLine {
  campaignId: string;
  authorId: string;
  bot: { id: string; name: string };
  text: string;
  sceneId: string | null;
  whisperToUserId: string | null;
}

/** Stores and delivers one NPC line (generated or typed by the GM). */
async function deliverBotLine(deps: RealtimeDeps, line: BotLine): Promise<ChatMessageView> {
  const message = await insertChatMessage(deps.ctx.prisma, {
    campaignId: line.campaignId,
    authorId: line.authorId,
    kind: line.whisperToUserId ? 'whisper' : 'say',
    text: line.text,
    botId: line.bot.id,
    speakerName: line.bot.name,
    sceneId: line.sceneId,
    ...(line.whisperToUserId ? { recipientId: line.whisperToUserId } : {}),
  });
  if (line.whisperToUserId) {
    await deliverChatMessageTo(deps, line.campaignId, message, [line.whisperToUserId], true);
  } else {
    broadcastChatMessage(deps, line.campaignId, message);
  }
  return message;
}

/**
 * The GM speaks in an NPC's name — no model involved. Stored exactly like a
 * generated line, so players cannot tell which NPC lines were written by hand.
 */
export async function speakAsBot(
  deps: RealtimeDeps,
  options: {
    campaignId: string;
    gmUserId: string;
    sceneId: string | null;
    bot: { id: string; name: string };
    text: string;
    whisperToUserId?: string | null;
  },
): Promise<ChatMessageView> {
  const message = await deliverBotLine(deps, {
    campaignId: options.campaignId,
    authorId: options.gmUserId,
    bot: options.bot,
    text: options.text,
    sceneId: options.sceneId,
    whisperToUserId: options.whisperToUserId ?? null,
  });
  // A hand-written NPC line may still call ANOTHER bot by name (a generated
  // line never calls anyone) — but never the NPC it was written for.
  if (!options.whisperToUserId) {
    await triggerBotsForLine(deps, {
      campaignId: options.campaignId,
      sceneId: options.sceneId,
      origin: 'gm_as_bot',
      text: options.text,
      messageId: message.id,
      calledByUserId: options.gmUserId,
      excludeBotId: options.bot.id,
    });
  }
  return message;
}

/**
 * The message directly preceding this one in the same scene — the „in scene"
 * continuation needs to know whether a bot had the last word.
 */
async function previousSceneLine(
  prisma: PrismaClient,
  campaignId: string,
  sceneId: string | null,
  beforeId: number,
): Promise<{ botId: string | null; agoMs: number } | null> {
  if (sceneId === null) return null;
  const previous = await prisma.chatMessage.findFirst({
    where: { campaignId, sceneId, kind: 'say', id: { lt: beforeId } },
    orderBy: { id: 'desc' },
    select: { botId: true, createdAt: true },
  });
  if (!previous) return null;
  return { botId: previous.botId, agoMs: Date.now() - previous.createdAt.getTime() };
}

/** Queues an answer from every bot this chat line called. */
export async function triggerBotsForLine(
  deps: RealtimeDeps,
  line: {
    campaignId: string;
    sceneId: string | null;
    origin: BotTriggerOrigin;
    text: string;
    messageId: number;
    calledByUserId: string;
    /** Bot that spoke the line — it must not answer itself. */
    excludeBotId?: string;
    /** Pass the list when the caller already has it (saves a query). */
    bots?: ChatBot[];
  },
): Promise<void> {
  const bots = line.bots ?? (await listChatBots(deps.ctx.prisma, line.campaignId));
  if (bots.length === 0) return;
  const previous = await previousSceneLine(
    deps.ctx.prisma,
    line.campaignId,
    line.sceneId,
    line.messageId,
  );
  const botIds = selectBotsToAnswer({
    text: line.text,
    origin: line.origin,
    sceneId: line.sceneId,
    previous,
    ...(line.excludeBotId ? { excludeBotId: line.excludeBotId } : {}),
    bots,
  });
  if (botIds.length === 0) return;
  await requestBotTurns(
    deps,
    botIds.map((botId) => ({
      campaignId: line.campaignId,
      botId,
      sceneId: line.sceneId,
      calledByUserId: line.calledByUserId,
    })),
  );
}

/** GM types a line in a bot's name (panel „Boty"; `/jako` does the same). */
export const botSayEvent = defineEvent<BotSayPayload, { messageId: number }>({
  name: 'bot:say',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    if (!socket.data.campaign) throw new RealtimeError('NO_CAMPAIGN');
    const campaignId = socket.data.campaign.id;
    const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
    if (text.length === 0) throw new RealtimeError('BOT_EMPTY_MESSAGE');
    if (text.length > MAX_CHAT_MESSAGE_LENGTH) throw new RealtimeError('MESSAGE_TOO_LONG');

    const bot = await deps.ctx.prisma.botProfile.findUnique({
      where: { id: typeof payload?.botId === 'string' ? payload.botId : '' },
      select: { id: true, name: true, campaignId: true },
    });
    if (!bot || bot.campaignId !== campaignId) throw new RealtimeError('BOT_NOT_FOUND');

    let whisperToUserId: string | null = null;
    if (payload?.whisperToUserId) {
      const target = await deps.ctx.prisma.campaignMember.findUnique({
        where: { campaignId_userId: { campaignId, userId: payload.whisperToUserId } },
        select: { userId: true },
      });
      if (!target) throw new RealtimeError('TARGET_NOT_FOUND');
      whisperToUserId = target.userId;
    }

    const message = await speakAsBot(deps, {
      campaignId,
      gmUserId: user.id,
      sceneId: socket.data.viewedSceneId ?? null,
      bot: { id: bot.id, name: sanitizeBotName(bot.name) ?? bot.name },
      text,
      whisperToUserId,
    });
    return { messageId: message.id };
  },
});

/** GM's stop button: cancels the generating bot and clears the queue. */
export const botStopEvent = defineEvent<BotStopPayload>({
  name: 'bot:stop',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    if (!socket.data.campaign) throw new RealtimeError('NO_CAMPAIGN');
    const turnId = typeof payload?.turnId === 'string' ? payload.turnId : undefined;
    await stopBotTurns(deps, socket.data.campaign.id, turnId);
  },
});
