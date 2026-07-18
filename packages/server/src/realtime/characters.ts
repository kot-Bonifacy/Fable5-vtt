import type {
  CharacterCreatePayload,
  CharacterDeleteBroadcast,
  CharacterIdPayload,
  CharacterUpdatePayload,
  CharacterUpsertBroadcast,
  CharacterView,
  SessionUser,
} from '@vtt/shared';
import {
  ROLE_GM,
  createDefaultCharacterData,
  mergeCharacterData,
  parseCharacterData,
  sanitizeCharacterName,
  sanitizeTokenImageUrl,
  validateCharacterDataPatch,
} from '@vtt/shared';
import type { CpredRegistry } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Character } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitToCampaignUser, gmRoom } from './state.js';

/**
 * Characters travel only to their owner and the GM: every emission is
 * targeted (owner sockets + GM room) and carries no room seq — the whisper
 * pattern. Other players never learn a character exists.
 */

export function toCharacterView(character: Character, registry: CpredRegistry): CharacterView {
  return {
    id: character.id,
    name: character.name,
    ownerId: character.ownerId,
    portraitUrl: character.portraitUrl,
    data: parseCharacterData(character.data, registry),
    updatedAt: character.updatedAt.toISOString(),
  };
}

/** Characters as one viewer sees them: the GM gets all, a player their own. */
export async function fetchCharactersFor(
  prisma: PrismaClient,
  registry: CpredRegistry,
  campaignId: string,
  user: SessionUser,
): Promise<CharacterView[]> {
  const rows = await prisma.character.findMany({
    where: { campaignId, ...(user.role === ROLE_GM ? {} : { ownerId: user.id }) },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => toCharacterView(row, registry));
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

async function requireCampaignCharacter(
  prisma: PrismaClient,
  campaignId: string,
  characterId: unknown,
): Promise<Character> {
  if (typeof characterId !== 'string' || characterId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.campaignId !== campaignId) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
  return character;
}

/** A character owner must be a member of the campaign (players only). */
async function requireValidOwner(
  prisma: PrismaClient,
  campaignId: string,
  ownerId: string | null | undefined,
): Promise<void> {
  if (ownerId === null || ownerId === undefined) return;
  const membership = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId, userId: ownerId } },
  });
  if (!membership) throw new RealtimeError('OWNER_NOT_FOUND');
}

async function emitCharacterUpsert(
  deps: RealtimeDeps,
  campaignId: string,
  view: CharacterView,
): Promise<void> {
  const payload: CharacterUpsertBroadcast = { character: view };
  deps.io.to(gmRoom(campaignId)).emit('character:upsert', payload);
  if (view.ownerId) {
    await emitToCampaignUser(deps.io, campaignId, view.ownerId, 'character:upsert', payload);
  }
}

async function emitCharacterDelete(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
  ownerId: string | null,
): Promise<void> {
  const payload: CharacterDeleteBroadcast = { characterId };
  deps.io.to(gmRoom(campaignId)).emit('character:delete', payload);
  if (ownerId) {
    await emitToCampaignUser(deps.io, campaignId, ownerId, 'character:delete', payload);
  }
}

export const characterCreateEvent = defineEvent<CharacterCreatePayload, CharacterView>({
  name: 'character:create',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const name = sanitizeCharacterName(payload?.name);
    if (name === null) throw new RealtimeError('INVALID_NAME');

    // Players always own what they create; only the GM assigns freely (NPC = null).
    let ownerId: string | null;
    if (user.role === ROLE_GM) {
      ownerId = payload?.ownerId ?? null;
      await requireValidOwner(deps.ctx.prisma, campaignId, ownerId);
    } else {
      ownerId = user.id;
    }

    const character = await deps.ctx.prisma.character.create({
      data: {
        campaignId,
        name,
        ownerId,
        data: JSON.stringify(createDefaultCharacterData()),
      },
    });
    const view = toCharacterView(character, deps.ctx.cpred);
    await emitCharacterUpsert(deps, campaignId, view);
    return view;
  },
});

export const characterUpdateEvent = defineEvent<CharacterUpdatePayload, CharacterView>({
  name: 'character:update',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const character = await requireCampaignCharacter(
      deps.ctx.prisma,
      campaignId,
      payload?.characterId,
    );
    const isGm = user.role === ROLE_GM;
    // Non-owners must not learn the character exists.
    if (!isGm && character.ownerId !== user.id) throw new RealtimeError('CHARACTER_NOT_FOUND');

    const patch = payload?.patch;
    if (typeof patch !== 'object' || patch === null) throw new RealtimeError('BAD_REQUEST');

    const data: Record<string, unknown> = {};
    if ('name' in patch) {
      const name = sanitizeCharacterName(patch.name);
      if (name === null) throw new RealtimeError('INVALID_NAME');
      data.name = name;
    }
    if ('portraitUrl' in patch) {
      const portraitUrl = sanitizeTokenImageUrl(patch.portraitUrl ?? null);
      if (portraitUrl === undefined) throw new RealtimeError('BAD_REQUEST');
      data.portraitUrl = portraitUrl;
    }
    if ('ownerId' in patch) {
      if (!isGm) throw new RealtimeError('FORBIDDEN');
      if (patch.ownerId !== null && typeof patch.ownerId !== 'string') {
        throw new RealtimeError('BAD_REQUEST');
      }
      await requireValidOwner(deps.ctx.prisma, campaignId, patch.ownerId);
      data.ownerId = patch.ownerId;
    }
    if ('data' in patch) {
      const result = validateCharacterDataPatch(patch.data, deps.ctx.cpred);
      if (!result.ok) throw new RealtimeError('INVALID_DATA');
      const current = parseCharacterData(character.data, deps.ctx.cpred);
      data.data = JSON.stringify(mergeCharacterData(current, result.patch));
    }

    const updated = await deps.ctx.prisma.character.update({
      where: { id: character.id },
      data,
    });
    const view = toCharacterView(updated, deps.ctx.cpred);
    await emitCharacterUpsert(deps, campaignId, view);
    // A reassigned character vanishes from the previous owner's list.
    if (character.ownerId && character.ownerId !== updated.ownerId) {
      await emitToCampaignUser(deps.io, campaignId, character.ownerId, 'character:delete', {
        characterId: character.id,
      } satisfies CharacterDeleteBroadcast);
    }
    return view;
  },
});

export const characterDeleteEvent = defineEvent<CharacterIdPayload>({
  name: 'character:delete',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const character = await requireCampaignCharacter(
      deps.ctx.prisma,
      campaignId,
      payload?.characterId,
    );
    if (user.role !== ROLE_GM && character.ownerId !== user.id) {
      throw new RealtimeError('CHARACTER_NOT_FOUND');
    }
    await deps.ctx.prisma.character.delete({ where: { id: character.id } });
    await emitCharacterDelete(deps, campaignId, character.id, character.ownerId);
  },
});
