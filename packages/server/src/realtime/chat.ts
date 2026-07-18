import type {
  ChatHistoryPage,
  ChatHistoryRequest,
  ChatMessageBroadcast,
  ChatMessageView,
  ChatSendPayload,
  RollFormula,
  RollGesture,
  RollResult,
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
import type { PrismaClient } from '../db.js';
import { createMixedRng } from './dice-rng.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { campaignRoom } from './state.js';

interface RosterUser {
  id: string;
  name: string;
}

/** Everyone who can be whispered to in a campaign: its members plus GMs. */
async function getRoster(prisma: PrismaClient, campaignId: string): Promise<RosterUser[]> {
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

interface StoredMessage {
  id: number;
  kind: string;
  authorId: string;
  text: string;
  recipientId: string | null;
  payload: string | null;
  createdAt: Date;
  author: { name: string };
  recipient: { name: string } | null;
}

function toView(message: StoredMessage): ChatMessageView {
  const view: ChatMessageView = {
    id: message.id,
    kind: message.kind as ChatMessageView['kind'],
    authorId: message.authorId,
    authorName: message.author.name,
    text: message.text,
    createdAt: message.createdAt.toISOString(),
  };
  if (message.recipientId && message.recipient) {
    view.recipientId = message.recipientId;
    view.recipientName = message.recipient.name;
  }
  if ((message.kind === 'roll' || message.kind === 'gmroll') && message.payload) {
    view.roll = JSON.parse(message.payload) as RollResult;
  }
  return view;
}

const INCLUDE_NAMES = { author: true, recipient: true } as const;

/**
 * Visibility filter applied in the query — invisible messages (foreign
 * whispers, foreign GM rolls for players) never leave the DB layer.
 */
function visibleTo(user: SessionUser) {
  return {
    OR: [
      { kind: { in: user.role === ROLE_GM ? ['say', 'roll', 'gmroll'] : ['say', 'roll'] } },
      { authorId: user.id },
      { recipientId: user.id },
    ],
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
    include: INCLUDE_NAMES,
    orderBy: { id: 'desc' },
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return { messages: page.map(toView), hasMore };
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

async function persistAndEmitSay(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  text: string,
): Promise<void> {
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: { campaignId, authorId: user.id, kind: 'say', text },
    include: INCLUDE_NAMES,
  });
  const room = campaignRoom(campaignId);
  const payload: ChatMessageBroadcast = { seq: deps.seqs.next(room), message: toView(stored) };
  deps.io.to(room).emit('chat:message', payload);
}

async function persistAndEmitWhisper(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  targetName: string,
  text: string,
): Promise<void> {
  const roster = await getRoster(deps.ctx.prisma, campaignId);
  const target = roster.find((r) => r.name.toLowerCase() === targetName.toLowerCase());
  if (!target) throw new RealtimeError('TARGET_NOT_FOUND');
  if (target.id === user.id) throw new RealtimeError('TARGET_IS_SELF');

  const stored = await deps.ctx.prisma.chatMessage.create({
    data: { campaignId, authorId: user.id, kind: 'whisper', text, recipientId: target.id },
    include: INCLUDE_NAMES,
  });

  // Targeted delivery: only sockets of the author and the recipient — the
  // whisper never reaches other clients, not even in network payloads. No
  // seq: it is not a room-wide broadcast, so it must not create seq gaps.
  const payload: ChatMessageBroadcast = { message: toView(stored) };
  const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
  for (const socket of sockets) {
    const socketUser = (socket.data as { user: SessionUser }).user;
    if (socketUser.id === user.id || socketUser.id === target.id) {
      socket.emit('chat:message', payload);
    }
  }
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
function sanitizeGesture(raw: unknown): RollGesture | undefined {
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

/**
 * Executes a roll server-side and delivers the result. Public rolls broadcast
 * to the campaign room with a seq; GM rolls go targeted (whisper pattern,
 * no seq) to the author's and GMs' sockets only — other players never see
 * them, not even in network payloads.
 */
async function persistAndEmitRoll(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  visibility: 'public' | 'gm',
  formula: RollFormula,
  label: string | undefined,
  gesture: RollGesture | undefined,
): Promise<void> {
  const result = rollFormula(formula, createMixedRng(gesture?.entropy));
  if (gesture && gesture.strength > 0) result.tossStrength = gesture.strength;
  if (gesture?.toss) result.toss = gesture.toss;
  const kind = visibility === 'gm' ? 'gmroll' : 'roll';
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId: user.id,
      kind,
      text: label ?? '',
      payload: JSON.stringify(result),
    },
    include: INCLUDE_NAMES,
  });

  const room = campaignRoom(campaignId);
  if (kind === 'roll') {
    const payload: ChatMessageBroadcast = { seq: deps.seqs.next(room), message: toView(stored) };
    deps.io.to(room).emit('chat:message', payload);
    return;
  }

  const payload: ChatMessageBroadcast = { message: toView(stored) };
  const sockets = await deps.io.in(room).fetchSockets();
  for (const socket of sockets) {
    const socketUser = (socket.data as { user: SessionUser }).user;
    if (socketUser.id === user.id || socketUser.role === ROLE_GM) {
      socket.emit('chat:message', payload);
    }
  }
}

export const chatSendEvent = defineEvent<ChatSendPayload>({
  name: 'chat:send',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const text = typeof payload?.text === 'string' ? payload.text : '';
    if (text.length > MAX_CHAT_MESSAGE_LENGTH) throw new RealtimeError('MESSAGE_TOO_LONG');

    const roster = await getRoster(deps.ctx.prisma, campaignId);
    const parsed = parseChatInput(
      text,
      roster.map((r) => r.name),
    );

    switch (parsed.kind) {
      case 'empty':
        throw new RealtimeError('EMPTY_MESSAGE');
      case 'unknown-command':
        throw new RealtimeError('UNKNOWN_COMMAND');
      case 'invalid-whisper':
        throw new RealtimeError(
          parsed.reason === 'MISSING_TARGET' ? 'WHISPER_MISSING_TARGET' : 'WHISPER_MISSING_TEXT',
        );
      case 'invalid-roll':
        throw new RealtimeError(
          parsed.reason === 'MISSING_NOTATION' ? 'ROLL_MISSING_NOTATION' : 'ROLL_BAD_NOTATION',
        );
      case 'say':
        await persistAndEmitSay(deps, campaignId, user, parsed.text);
        return;
      case 'whisper':
        await persistAndEmitWhisper(deps, campaignId, user, parsed.targetName, parsed.text);
        return;
      case 'roll':
        await persistAndEmitRoll(
          deps,
          campaignId,
          user,
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
