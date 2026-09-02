import type {
  BotActionProposal,
  CheckCallEntry,
  ChatHistoryPage,
  ChatMessageBroadcast,
  ChatMessageView,
  CombatActionLogEntry,
  DamageLogEntry,
  EconomyLogEntry,
  HandoutLogEntry,
  JournalLogEntry,
  SessionUser,
} from '@vtt/shared';
import { CHAT_HISTORY_PAGE_SIZE, ROLE_GM, isDiceSkinId } from '@vtt/shared';
import type { RollResult } from '@vtt/shared';
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
  // `diceSkin` rides along so a roll card knows whose dice to tumble
  // (stage 27d): the skin belongs to the roller, not to the viewer.
  author: { select: { name: true, diceSkin: true } },
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
  author: { name: string; diceSkin: string };
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
    const roll = JSON.parse(message.payload) as RollResult;
    // Stamped on the way OUT, not stored with the roll: a player who changes
    // their dice today should see yesterday's history in the new ones, and
    // the payload stays a record of what was rolled, not of taste.
    if (isDiceSkinId(message.author.diceSkin)) roll.skin = message.author.diceSkin;
    view.roll = roll;
  } else if (message.kind === 'damage' && message.payload) {
    view.damage = JSON.parse(message.payload) as DamageLogEntry;
  } else if ((message.kind === 'action' || message.kind === 'gmaction') && message.payload) {
    view.action = JSON.parse(message.payload) as CombatActionLogEntry;
  } else if (message.kind === 'proposal' && message.payload) {
    view.proposal = JSON.parse(message.payload) as BotActionProposal;
  } else if (message.kind === 'economy' && message.payload) {
    view.economy = JSON.parse(message.payload) as EconomyLogEntry;
  } else if (message.kind === 'handout' && message.payload) {
    view.handout = JSON.parse(message.payload) as HandoutLogEntry;
  } else if (message.kind === 'journal' && message.payload) {
    view.journal = JSON.parse(message.payload) as JournalLogEntry;
  } else if (message.kind === 'check' && message.payload) {
    view.check = JSON.parse(message.payload) as CheckCallEntry;
  }
  return view;
}

/**
 * Strips what this viewer may not see from a message.
 *
 * Two things, both of them the same rule tokens have followed since stage 05 —
 * what a player cannot see does not leave the server:
 *
 *  - the damage log's absolute HP (and the sheet link that would identify the
 *    target's card): the GM and the target's owner get the numbers, everyone
 *    else sees the hit itself — how much got through, what the armor did,
 *    whether the wound state changed;
 *  - the roster of an area attack (stage 16d). A grenade lobbed into a dark room
 *    reaches whoever is standing there, and listing them on the card would be a
 *    perfect scouting tool. Players read only their **own** figures off it; the
 *    covers stay, because a car is on everybody's screen already.
 */
export function redactChatMessage(message: ChatMessageView, user: SessionUser): ChatMessageView {
  if (user.role === ROLE_GM) return message;
  let view = message;

  const area = view.roll?.attack?.area;
  if (area) {
    const visible = area.targets.filter(
      (target) => target.coverId !== undefined || target.ownerId === user.id,
    );
    if (visible.length !== area.targets.length) {
      view = {
        ...view,
        roll: {
          ...view.roll!,
          attack: { ...view.roll!.attack!, area: { ...area, targets: visible } },
        },
      };
    }
  }

  // The same rule for the checks a volley or a gas round forced (stage 16h).
  // These rows name figures too — „Ganger — 12 m · SW+Koncentracja …" — and
  // suppressive fire had been broadcasting them to the whole table since stage
  // 16, hidden tokens and unrevealed fog included.
  const checks = view.roll?.attack?.forcedChecks;
  if (checks) {
    const visible = checks.filter((check) => check.ownerId === user.id);
    if (visible.length !== checks.length) {
      // An emptied list is dropped rather than sent as `[]`, and the difference
      // is a sentence: the card reads „nikt nie stał w zasięgu" off an empty
      // array, which would be a lie told to the player whose figures simply are
      // not on the list. No field at all means „nothing here for you".
      const { forcedChecks: _hidden, ...rest } = view.roll!.attack!;
      view = {
        ...view,
        roll: {
          ...view.roll!,
          attack: visible.length > 0 ? { ...rest, forcedChecks: visible } : rest,
        },
      };
    }
  }

  const damage = view.damage;
  if (!damage) return view;
  if (damage.targetOwnerId && damage.targetOwnerId === user.id) return view;
  const { hp: _hp, characterId: _characterId, targetOwnerId: _owner, ...visible } = damage;
  return { ...view, damage: visible };
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
        // `proposal` (stage 20a) is on the GM's list for the same reason bot
        // whispers are: the GM runs the bots, so every intention of theirs is
        // theirs to answer — including one authored under another GM account.
        // `economy` (stage 23b) is here for the mirror-image reason: the wallet
        // cards are private, but the GM audits every one of them, including a
        // purchase a player made without asking. `handout` (stage 24a) follows
        // the same rule: the GM hands the material out, so every copy of the
        // line is theirs to see, one per recipient. `journal` (stage 24b) needs
        // no such reasoning on either list: a chronicle entry is opened to the
        // whole table at once, so its line is public and carries no addressee.
        {
          kind: {
            in: [
              'say',
              'roll',
              'gmroll',
              'damage',
              'action',
              'gmaction',
              'proposal',
              'economy',
              'handout',
              'journal',
              // `check` (etap 32) trafia tu z powodu, dla którego jest tu
              // `proposal`: wezwanie do Testu wystawia MG, więc każde jest jego
              // sprawą — także wystawione z drugiego konta MG.
              'check',
            ],
          },
        },
        { authorId: user.id },
        { recipientId: user.id },
        { botId: { not: null } },
        { recipientBotId: { not: null } },
      ],
    };
  }
  // `gmaction` (a refused action) is deliberately absent: a player sees only
  // their own, through the `authorId` clause below.
  return {
    OR: [
      { kind: { in: ['say', 'roll', 'damage', 'action', 'journal'] } },
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
    include: INCLUDE_CHAT_NAMES,
    orderBy: { id: 'desc' },
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return {
    messages: page.map((row) => redactChatMessage(toChatMessageView(row), user)),
    hasMore,
  };
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
  event: 'chat:message' | 'chat:update' = 'chat:message',
): Promise<void> {
  const targets = new Set(userIds.filter((id): id is string => typeof id === 'string'));
  const payload: ChatMessageBroadcast = { message };
  const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
  for (const socket of sockets) {
    const socketUser = (socket.data as { user: SessionUser }).user;
    if (targets.has(socketUser.id) || (includeGm && socketUser.role === ROLE_GM)) {
      socket.emit(event, payload);
    }
  }
}

/**
 * Room-wide delivery where each viewer gets their own cut of the message
 * (stage 15: the damage log's HP). One seq is drawn for the room and sent to
 * every socket in it, so the sequence stays gapless for everyone — this is a
 * broadcast, only redacted per recipient.
 */
export async function broadcastRedactedChatMessage(
  deps: RealtimeDeps,
  campaignId: string,
  message: ChatMessageView,
  event: 'chat:message' | 'chat:update' = 'chat:message',
): Promise<void> {
  const room = campaignRoom(campaignId);
  const seq = deps.seqs.next(room);
  const sockets = await deps.io.in(room).fetchSockets();
  for (const socket of sockets) {
    const socketUser = (socket.data as { user: SessionUser }).user;
    const payload: ChatMessageBroadcast = { seq, message: redactChatMessage(message, socketUser) };
    socket.emit(event, payload);
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
    // Redacted rather than broadcast raw since stage 16d: an area attack's card
    // carries a list of everyone it reached, and that list is not public.
    await broadcastRedactedChatMessage(deps, campaignId, message);
    return;
  }
  await deliverChatMessageTo(deps, campaignId, message, [authorId], true);
}
