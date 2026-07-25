import type {
  ChatHistoryPage,
  ChatMessageBroadcast,
  ChatMessageView,
  SessionUser,
} from '@vtt/shared';
import { CHAT_HISTORY_PAGE_SIZE, ROLE_GM } from '@vtt/shared';
import type { RollResult, SpeechTrack } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { RealtimeDeps } from './registry.js';
import { campaignRoom } from './state.js';

/**
 * Storage and delivery of chat messages, split out of `chat.ts` so the bot
 * runner can persist and emit lines without importing the command handlers
 * (which in turn have to call the runner — this is the same cycle break as
 * `character-io.ts` in stage 08).
 */

export interface RosterUser {
  id: string;
  name: string;
}

/**
 * Everyone who can be addressed by name in a campaign: its members plus GMs.
 * Also the list bot names must not collide with — two „Vex" at one table make
 * `/w Vex` ambiguous and let a bot steal lines meant for a player.
 */
export async function getRoster(prisma: PrismaClient, campaignId: string): Promise<RosterUser[]> {
  const [members, gms] = await Promise.all([
    prisma.campaignMember.findMany({ where: { campaignId }, include: { user: true } }),
    prisma.user.findMany({ where: { role: ROLE_GM } }),
  ]);
  const byId = new Map<string, RosterUser>();
  for (const gm of gms) byId.set(gm.id, { id: gm.id, name: gm.name });
  for (const member of members)
    byId.set(member.userId, { id: member.userId, name: member.user.name });
  return [...byId.values()];
}

/** Relations needed to render any message, including NPC lines spoken by bots. */
export const INCLUDE_CHAT_NAMES = {
  author: { select: { name: true } },
  recipient: { select: { name: true } },
  bot: { select: { name: true, portraitUrl: true } },
  recipientBot: { select: { name: true } },
} as const;

interface StoredMessage {
  id: number;
  kind: string;
  authorId: string;
  text: string;
  recipientId: string | null;
  payload: string | null;
  botId: string | null;
  recipientBotId: string | null;
  speakerName: string | null;
  createdAt: Date;
  author: { name: string };
  recipient: { name: string } | null;
  bot: { name: string; portraitUrl: string | null } | null;
  recipientBot: { name: string } | null;
}

export function toChatMessageView(message: StoredMessage): ChatMessageView {
  const view: ChatMessageView = {
    id: message.id,
    kind: message.kind as ChatMessageView['kind'],
    authorId: message.authorId,
    // The stored speaker name wins: it keeps the transcript honest after a bot
    // is renamed or deleted.
    authorName: message.speakerName ?? message.bot?.name ?? message.author.name,
    text: message.text,
    createdAt: message.createdAt.toISOString(),
  };
  if (message.botId) {
    view.botId = message.botId;
    view.portraitUrl = message.bot?.portraitUrl ?? null;
  }
  if (message.recipientId && message.recipient) {
    view.recipientId = message.recipientId;
    view.recipientName = message.recipient.name;
  } else if (message.recipientBotId) {
    view.recipientBotId = message.recipientBotId;
    view.recipientName = message.recipientBot?.name ?? '?';
  }
  if ((message.kind === 'roll' || message.kind === 'gmroll') && message.payload) {
    view.roll = JSON.parse(message.payload) as RollResult;
  } else if (message.botId && message.payload) {
    // NPC line with a voice: audio plus the rhythm its text is written out
    // with. Stored so „odtwórz ponownie" still works after a reload.
    const stored = JSON.parse(message.payload) as { speech?: SpeechTrack };
    if (stored.speech) view.speech = stored.speech;
  }
  return view;
}

/**
 * Visibility filter applied in the query — invisible messages (foreign
 * whispers, foreign GM rolls for players) never leave the DB layer.
 *
 * The one asymmetry: whispers with a bot on either side are visible to the GM,
 * because the GM runs the bots. Player↔player whispers stay private even from
 * the GM, exactly as in stage 03.
 */
export function visibleTo(user: SessionUser) {
  if (user.role === ROLE_GM) {
    return {
      OR: [
        { kind: { in: ['say', 'roll', 'gmroll'] } },
        { authorId: user.id },
        { recipientId: user.id },
        { botId: { not: null } },
        { recipientBotId: { not: null } },
      ],
    };
  }
  return {
    OR: [{ kind: { in: ['say', 'roll'] } }, { authorId: user.id }, { recipientId: user.id }],
  };
}

/**
 * Fetches a page of chat history visible to the user, ascending by id.
 * `beforeId` (exclusive) paginates backwards; omit it for the latest page.
 */
export async function fetchHistoryPage(
  prisma: PrismaClient,
  campaignId: string,
  user: SessionUser,
  beforeId?: number,
  limit = CHAT_HISTORY_PAGE_SIZE,
): Promise<ChatHistoryPage> {
  const rows = await prisma.chatMessage.findMany({
    where: {
      campaignId,
      ...(beforeId !== undefined ? { id: { lt: beforeId } } : {}),
      ...visibleTo(user),
    },
    include: INCLUDE_CHAT_NAMES,
    orderBy: { id: 'desc' },
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return { messages: page.map(toChatMessageView), hasMore };
}

export interface NewChatMessage {
  campaignId: string;
  authorId: string;
  kind: ChatMessageView['kind'];
  text: string;
  recipientId?: string | null;
  payload?: string | null;
  /** Bot that spoke the line (generated or typed by the GM with `/jako`). */
  botId?: string | null;
  recipientBotId?: string | null;
  speakerName?: string | null;
  /** Scene the line belongs to — the bots' short-term memory is per scene. */
  sceneId?: string | null;
}

/** Persists one message and returns it in client shape. */
export async function insertChatMessage(
  prisma: PrismaClient,
  message: NewChatMessage,
): Promise<ChatMessageView> {
  const stored = await prisma.chatMessage.create({
    data: message,
    include: INCLUDE_CHAT_NAMES,
  });
  return toChatMessageView(stored);
}

/** Room-wide broadcast — carries a seq, so clients can detect a missed event. */
export function broadcastChatMessage(
  deps: RealtimeDeps,
  campaignId: string,
  message: ChatMessageView,
): void {
  const room = campaignRoom(campaignId);
  const payload: ChatMessageBroadcast = { seq: deps.seqs.next(room), message };
  deps.io.to(room).emit('chat:message', payload);
}

/**
 * Targeted delivery (the whisper pattern): only the listed users — and the GM
 * when `includeGm` — receive the message, so it never reaches other clients,
 * not even in network payloads. No seq: it is not a room-wide broadcast, so it
 * must not create seq gaps.
 */
export async function deliverChatMessageTo(
  deps: RealtimeDeps,
  campaignId: string,
  message: ChatMessageView,
  userIds: (string | null | undefined)[],
  includeGm = false,
): Promise<void> {
  const targets = new Set(userIds.filter((id): id is string => typeof id === 'string'));
  const payload: ChatMessageBroadcast = { message };
  const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
  for (const socket of sockets) {
    const socketUser = (socket.data as { user: SessionUser }).user;
    if (targets.has(socketUser.id) || (includeGm && socketUser.role === ROLE_GM)) {
      socket.emit('chat:message', payload);
    }
  }
}

/**
 * Delivers a stored roll message. Public rolls broadcast to the campaign room
 * with a seq; GM rolls go targeted to the author's and GMs' sockets only.
 * Shared with sheet rolls (`character:roll`).
 */
export async function deliverRollMessage(
  deps: RealtimeDeps,
  campaignId: string,
  authorId: string,
  message: ChatMessageView,
): Promise<void> {
  if (message.kind !== 'gmroll') {
    broadcastChatMessage(deps, campaignId, message);
    return;
  }
  await deliverChatMessageTo(deps, campaignId, message, [authorId], true);
}
