import type {
  CharacterCreatePayload,
  CharacterDeleteBroadcast,
  CharacterIdPayload,
  CharacterUpdatePayload,
  CharacterView,
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
import type { PrismaClient } from '../db.js';
import type { Character } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent } from './registry.js';
import { applyBalance } from './economy.js';
import { emitToCampaignUser } from './state.js';
import { emitCharacterDelete, emitCharacterUpsert, toCharacterView } from './character-io.js';
import { emitRuns } from './netrun-io.js';
import { emitTokensById, emitTokensOfCharacter } from './tokens.js';

/**
 * Character event handlers. Delivery and view mapping live in
 * `character-io.ts`; sheet changes also refresh the HP bars of every token
 * linked to the character (stage 08 — the sheet is the source of truth).
 */

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
    // Stage 23b: eddies leave this path entirely. The GM's own number field is
    // still a number field, but it lands as a correction with a ledger row —
    // an audit with an unlogged back door next to it is decoration.
    let adjustBalance: number | undefined;
    if ('data' in patch) {
      const result = validateCharacterDataPatch(patch.data, deps.ctx.cpred);
      if (!result.ok) throw new RealtimeError('INVALID_DATA');
      const { eddies, ...sheet } = result.patch;
      if (eddies !== undefined) {
        if (!isGm) throw new RealtimeError('FORBIDDEN');
        adjustBalance = eddies;
      }
      // Stage 23c: „Reputacja zawsze zależy od czynów i działań Postaci, i
      // przydziela ją MG" (s. 193). Unlike eddies it stays on this path — there
      // is no ledger to write, only a door to close.
      if (sheet.reputationSources !== undefined && !isGm) throw new RealtimeError('FORBIDDEN');
      const current = parseCharacterData(character.data, deps.ctx.cpred);
      data.data = JSON.stringify(mergeCharacterData(current, sheet));
    }

    let updated = await deps.ctx.prisma.character.update({
      where: { id: character.id },
      data,
    });
    if (adjustBalance !== undefined) {
      const current = parseCharacterData(updated.data, deps.ctx.cpred);
      const delta = adjustBalance - current.eddies;
      if (delta !== 0) {
        // `emit: false` — the upsert two lines down carries the new balance
        // anyway, and two upserts for one edit is how a sheet flickers.
        await applyBalance(
          deps,
          campaignId,
          updated,
          current,
          // „Korekta MG: ręczna zmiana salda" — the kind already says who, so
          // the label says what, rather than repeating the word twice.
          { kind: 'adjust', amount: delta, label: 'ręczna zmiana salda' },
          user.id,
          { merge: true, emit: false },
        );
        updated = await deps.ctx.prisma.character.findUniqueOrThrow({
          where: { id: character.id },
        });
      }
    }
    const view = toCharacterView(updated, deps.ctx.cpred);
    await emitCharacterUpsert(deps, campaignId, view);
    // HP and stats drive the bars of every token bound to this sheet.
    if ('data' in patch || 'ownerId' in patch || 'name' in patch) {
      await emitTokensOfCharacter(deps, campaignId, updated);
    }
    // The run window paints this sheet's cyberdeck (stage 26c), so a Program
    // put in or taken out has to reach it — otherwise a netrunner mid-run sees
    // a rack that is one save out of date.
    if (
      'data' in patch &&
      (await deps.ctx.prisma.netRun.count({ where: { characterId: character.id } })) > 0
    ) {
      await emitRuns(deps, campaignId);
    }
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
    // Tokens are unlinked by the DB (SetNull); refresh them so their bars
    // fall back to their own HP instead of showing the dead sheet's.
    const linkedTokens = await deps.ctx.prisma.token.findMany({
      where: { characterId: character.id },
      select: { id: true },
    });
    await deps.ctx.prisma.character.delete({ where: { id: character.id } });
    await emitCharacterDelete(deps, campaignId, character.id, character.ownerId);
    await emitTokensById(
      deps,
      campaignId,
      linkedTokens.map((token) => token.id),
    );
  },
});
