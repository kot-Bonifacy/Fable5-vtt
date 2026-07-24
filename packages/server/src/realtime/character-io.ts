import type {
  CharacterDeleteBroadcast,
  CharacterUpsertBroadcast,
  CharacterView,
  CpredRegistry,
  SessionUser,
} from '@vtt/shared';
import { ROLE_GM, parseCharacterData } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Character } from '../generated/prisma/client.js';
import type { RealtimeDeps } from './registry.js';
import { emitToCampaignUser, gmRoom } from './state.js';

/**
 * Reading and delivering characters, split out of the event handlers so the
 * token layer can reuse it without importing them (and without an import
 * cycle: tokens → character-io, characters → tokens).
 *
 * Visibility rule: a character travels only to its owner and the GM. Every
 * emission is targeted and carries no room seq — the whisper pattern.
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

export async function emitCharacterUpsert(
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

export async function emitCharacterDelete(
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
