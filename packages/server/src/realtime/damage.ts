import type {
  ChatMessageView,
  DamageApplyPayload,
  DamageLogEntry,
  DamageUndoPayload,
  RollResult,
  TokenHp,
} from '@vtt/shared';
import { ARMOR_SP_MAX, ROLE_GM, damageTotal } from '@vtt/shared';
import type { Character, Token } from '../generated/prisma/client.js';
import {
  applyDamageToSheet,
  applyDamageToTokenHp,
  isValidHitLocation,
  sheetWoundStatuses,
  undoDamageOnSheet,
  type SheetDamageLog,
  type SheetDamageRequest,
} from '../sheets.js';
import { createMixedRng } from './dice-rng.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { emitTokensById, emitTokensOfCharacter, requireCampaignToken } from './tokens.js';
import { buildCompendiumSync } from './compendium.js';
import {
  INCLUDE_CHAT_NAMES,
  broadcastRedactedChatMessage,
  toChatMessageView,
} from './chat-io.js';

/**
 * Applying damage (stage 15).
 *
 * The GM presses „Zastosuj" on a damage roll's chat card and names a target;
 * everything that decides the outcome is re-read on the server — the rolled
 * total from the stored message, the armor and HP from the target's sheet — so
 * a client can never type its own numbers. The result is logged as a chat
 * message of kind `damage`, and that log is what „Cofnij" reads to put the
 * sheet back (HP, ablated armor, the drawn Critical Injury).
 *
 * Visibility: the log's absolute HP travel only to the GM and the target's
 * owner (`redactChatMessage`); everyone at the table sees the hit itself.
 */

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

function requireMessageId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  return value;
}

/** The stored damage roll a „Zastosuj" refers to. */
async function loadDamageRoll(
  deps: RealtimeDeps,
  campaignId: string,
  messageId: number,
): Promise<RollResult> {
  const message = await deps.ctx.prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!message || message.campaignId !== campaignId || !message.payload) {
    throw new RealtimeError('MESSAGE_NOT_FOUND');
  }
  if (message.kind !== 'roll' && message.kind !== 'gmroll') {
    throw new RealtimeError('NOT_A_DAMAGE_ROLL');
  }
  const roll = JSON.parse(message.payload) as RollResult;
  if (!roll.damage) throw new RealtimeError('NOT_A_DAMAGE_ROLL');
  return roll;
}

function tokenOwnHp(token: Token): TokenHp | null {
  return token.hpMax === null ? null : { current: token.hpCurrent ?? 0, max: token.hpMax };
}

/** Persists the log entry as a chat message and pushes it to the room. */
async function logDamage(
  deps: RealtimeDeps,
  campaignId: string,
  authorId: string,
  entry: DamageLogEntry,
): Promise<ChatMessageView> {
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId,
      kind: 'damage',
      text: `${entry.targetName} — ${entry.locationLabel}`,
      payload: JSON.stringify(entry),
    },
    include: INCLUDE_CHAT_NAMES,
  });
  const view = toChatMessageView(stored);
  await broadcastRedactedChatMessage(deps, campaignId, view);
  return view;
}

export const damageApplyEvent = defineEvent<DamageApplyPayload, { messageId: number }>({
  name: 'damage:apply',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const sourceMessageId = requireMessageId(payload?.messageId);
    const roll = await loadDamageRoll(deps, campaignId, sourceMessageId);
    const { token } = await requireCampaignToken(deps.ctx.prisma, campaignId, payload?.tokenId);

    const location = isValidHitLocation(payload?.location)
      ? payload.location
      : isValidHitLocation(roll.damage?.location)
        ? roll.damage.location
        : 'body';
    if (payload?.armorSp !== undefined) {
      if (
        typeof payload.armorSp !== 'number' ||
        !Number.isInteger(payload.armorSp) ||
        payload.armorSp < 0 ||
        payload.armorSp > ARMOR_SP_MAX
      ) {
        throw new RealtimeError('BAD_REQUEST');
      }
    }

    const request: SheetDamageRequest = {
      // Autofire rolls 2d6 and multiplies the sum (stage 16); the factor is
      // read off the stored roll, never off the client's request.
      damage: damageTotal(roll),
      criticalInjury: roll.criticalDamage === true,
      location,
      ...(payload?.armorSp !== undefined ? { armorSp: payload.armorSp } : {}),
      ...(payload?.ignoreArmor === true || roll.damage?.ignoreArmor ? { ignoreArmor: true } : {}),
    };

    let log: SheetDamageLog;
    let character: Character | null = null;
    if (token.characterId) {
      character = await deps.ctx.prisma.character.findUnique({ where: { id: token.characterId } });
    }

    if (character) {
      // The injury table is campaign data: imported files plus whatever the GM
      // typed in (the head table has no free source — see tools/import).
      const compendium = await buildCompendiumSync(deps, campaignId);
      const applied = applyDamageToSheet(
        character,
        deps.ctx.cpred,
        request,
        compendium.entries,
        createMixedRng(),
      );
      log = applied.log;
      const saved = await deps.ctx.prisma.character.update({
        where: { id: character.id },
        data: { data: applied.data },
      });
      character = saved;
      await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
      // Refreshes HP bars and, since stage 15, the wound status badges.
      await emitTokensOfCharacter(deps, campaignId, saved);
    } else {
      const hp = tokenOwnHp(token);
      if (!hp) throw new RealtimeError('TOKEN_HAS_NO_HP');
      const applied = applyDamageToTokenHp(hp, request);
      log = applied.log;
      await deps.ctx.prisma.token.update({
        where: { id: token.id },
        data: {
          hpCurrent: applied.hp.current,
          statuses: JSON.stringify(sheetWoundStatuses(parseTokenStatuses(token), applied.hp)),
        },
      });
      await emitTokensById(deps, campaignId, [token.id]);
    }

    const entry: DamageLogEntry = {
      ...log,
      sourceMessageId,
      targetTokenId: token.id,
      targetName: token.name,
      characterId: character?.id ?? null,
      targetOwnerId: character?.ownerId ?? token.ownerId,
    };
    const view = await logDamage(deps, campaignId, user.id, entry);
    return { messageId: view.id };
  },
});

function parseTokenStatuses(token: Token): string[] {
  try {
    const parsed: unknown = JSON.parse(token.statuses);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export const damageUndoEvent = defineEvent<DamageUndoPayload, void>({
  name: 'damage:undo',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const messageId = requireMessageId(payload?.messageId);
    const message = await deps.ctx.prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: INCLUDE_CHAT_NAMES,
    });
    if (
      !message ||
      message.campaignId !== campaignId ||
      message.kind !== 'damage' ||
      !message.payload
    ) {
      throw new RealtimeError('MESSAGE_NOT_FOUND');
    }
    const entry = JSON.parse(message.payload) as DamageLogEntry;
    if (entry.undone) throw new RealtimeError('ALREADY_UNDONE');

    // Statuses the hit put on come off first: a restored sheet that stays
    // „Nieprzytomny" looks like the undo half-worked (stage 14d).
    if (entry.statusesAdded && entry.statusesAdded.length > 0) {
      const token = await deps.ctx.prisma.token.findUnique({ where: { id: entry.targetTokenId } });
      if (token) {
        const statuses = parseTokenStatuses(token).filter(
          (id) => !entry.statusesAdded!.includes(id),
        );
        await deps.ctx.prisma.token.update({
          where: { id: token.id },
          data: { statuses: JSON.stringify(statuses) },
        });
      }
    }

    if (entry.characterId) {
      const character = await deps.ctx.prisma.character.findUnique({
        where: { id: entry.characterId },
      });
      // A deleted sheet leaves nothing to restore — the entry is still marked
      // as taken back, so the card stops offering a button that cannot work.
      if (character && character.campaignId === campaignId) {
        const restored = undoDamageOnSheet(character, deps.ctx.cpred, entry);
        const saved = await deps.ctx.prisma.character.update({
          where: { id: character.id },
          data: { data: restored.data },
        });
        await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
        await emitTokensOfCharacter(deps, campaignId, saved);
      }
    } else if (entry.hp) {
      const token = await deps.ctx.prisma.token.findUnique({ where: { id: entry.targetTokenId } });
      if (token) {
        const hp: TokenHp = { current: entry.hp.before, max: entry.hp.max };
        await deps.ctx.prisma.token.update({
          where: { id: token.id },
          data: {
            hpCurrent: hp.current,
            statuses: JSON.stringify(sheetWoundStatuses(parseTokenStatuses(token), hp)),
          },
        });
        await emitTokensById(deps, campaignId, [token.id]);
      }
    }

    const undoneEntry: DamageLogEntry = { ...entry, undone: true, undoneByName: user.name };
    const updated = await deps.ctx.prisma.chatMessage.update({
      where: { id: message.id },
      data: { payload: JSON.stringify(undoneEntry) },
      include: INCLUDE_CHAT_NAMES,
    });
    await broadcastRedactedChatMessage(deps, campaignId, toChatMessageView(updated), 'chat:update');
  },
});
