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
 * Visibility rule: a character travels to its owner, to the GM — and, od etapu
 * 38a, do właściciela **figury**, która jest z tą kartą związana. Ostatnie jest
 * następstwem zniknięcia profilu bojowego: do 38a gracz, któremu MG oddał
 * gangera, dostawał jego liczby w prywatnej części żetonu, a od 38a te liczby
 * mieszkają na karcie. Bez tej trzeciej drogi taki gracz sterowałby figurą,
 * której statystyk nie widzi — a podgląd rzutu liczyłby się z niczego.
 *
 * Every emission is targeted and carries no room seq — the whisper pattern.
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
    where: {
      campaignId,
      ...(user.role === ROLE_GM
        ? {}
        : { OR: [{ ownerId: user.id }, { tokens: { some: { ownerId: user.id } } }] }),
    },
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
  for (const userId of await characterAudience(deps, view.id, view.ownerId)) {
    await emitToCampaignUser(deps.io, campaignId, userId, 'character:upsert', payload);
  }
}

/**
 * Kto poza MG dostaje tę kartę: jej właściciel i właściciele figur, które są
 * z nią związane (etap 38a — patrz reguła widoczności na górze pliku).
 */
async function characterAudience(
  deps: RealtimeDeps,
  characterId: string,
  ownerId: string | null,
): Promise<string[]> {
  const steering = await deps.ctx.prisma.token.findMany({
    where: { characterId, ownerId: { not: null } },
    select: { ownerId: true },
    distinct: ['ownerId'],
  });
  const ids = new Set<string>(ownerId ? [ownerId] : []);
  for (const row of steering) if (row.ownerId) ids.add(row.ownerId);
  return [...ids];
}

export async function emitCharacterDelete(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
  ownerId: string | null,
): Promise<void> {
  const payload: CharacterDeleteBroadcast = { characterId };
  deps.io.to(gmRoom(campaignId)).emit('character:delete', payload);
  // Skasowana karta jest już poza bazą, gdy to leci, więc figur nie ma jak
  // dopytać — kasowanie idzie do właściciela i do MG, tak jak przed 38a.
  // Gracz sterujący figurą i tak dostaje `token:delete` albo `token:upsert`.
  if (ownerId) {
    await emitToCampaignUser(deps.io, campaignId, ownerId, 'character:delete', payload);
  }
}
