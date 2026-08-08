import type {
  BotRelationView,
  RelationDeleteBroadcast,
  RelationDeletePayload,
  RelationSetPayload,
  RelationSyncPayload,
  RelationUpsertBroadcast,
} from '@vtt/shared';
import { ROLE_GM, clampRelation, sanitizeRelationNote } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import { RealtimeError, defineEvent } from './registry.js';
import { gmRoom } from './state.js';

/**
 * Relacje NPC↔postacie (etap 19c).
 *
 * Trzy rzeczy odróżniają ten moduł od reszty stanu kampanii:
 *
 *  1. **Nic z tego nie opuszcza pokoju MG.** „Barman nienawidzi Vexa" to wiedza
 *     MG; gracz ma to usłyszeć w tonie NPC-a, a nie odczytać z payloadu.
 *  2. **Relacja jest stanem trwałym, nie zdarzeniem.** Nie ma historii zmian —
 *     jest bieżący stopień i zdanie „skąd", które MG może poprawić w każdej chwili.
 *  3. **Żadna zmiana nie dzieje się sama.** Model potrafi tylko zaproponować
 *     (patrz `journal.ts`); zapisać ją może wyłącznie `relation:set` z gniazda MG.
 */

interface RelationRow {
  botId: string;
  characterId: string;
  value: number;
  note: string;
  updatedAt: Date;
  bot: { name: string };
  character: { name: string };
}

function toView(row: RelationRow): BotRelationView {
  return {
    botId: row.botId,
    characterId: row.characterId,
    botName: row.bot.name,
    characterName: row.character.name,
    value: row.value,
    note: row.note,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const INCLUDE_NAMES = {
  bot: { select: { name: true } },
  character: { select: { name: true } },
} as const;

export async function fetchRelations(
  prisma: PrismaClient,
  campaignId: string,
): Promise<BotRelationView[]> {
  const rows = await prisma.botRelation.findMany({
    where: { bot: { campaignId } },
    include: INCLUDE_NAMES,
    orderBy: [{ botId: 'asc' }, { characterId: 'asc' }],
  });
  return rows.map(toView);
}

/** Relacje jednego bota, w postaci gotowej do promptu i do propozycji. */
export async function fetchBotRelations(
  prisma: PrismaClient,
  botId: string,
): Promise<BotRelationView[]> {
  const rows = await prisma.botRelation.findMany({
    where: { botId },
    include: INCLUDE_NAMES,
  });
  return rows.map(toView);
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/**
 * Postać, którą przy stole reprezentuje ten gracz — czyli z kim NPC właściwie
 * rozmawia.
 *
 * Gracz z jedną postacią jest jednoznaczny i tak wygląda 99% przypadków. Przy
 * dwóch rozstrzyga **scena**: postać, która ma tam swój token, jest tą, którą
 * gracz teraz gra. Dopiero gdy i to nie rozstrzyga, wygrywa ostatnio ruszana
 * karta — zgadywanie jest tu tańsze niż pytanie gracza w środku rozmowy.
 */
export async function speakingCharacter(
  prisma: PrismaClient,
  options: { campaignId: string; userId: string; sceneId: string | null },
): Promise<{ id: string; name: string } | null> {
  const owned = await prisma.character.findMany({
    where: { campaignId: options.campaignId, ownerId: options.userId },
    select: { id: true, name: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (owned.length === 0) return null;
  if (owned.length === 1) return { id: owned[0]!.id, name: owned[0]!.name };

  if (options.sceneId) {
    const onScene = await prisma.token.findFirst({
      where: {
        sceneId: options.sceneId,
        characterId: { in: owned.map((character) => character.id) },
      },
      select: { characterId: true },
    });
    const match = owned.find((character) => character.id === onScene?.characterId);
    if (match) return { id: match.id, name: match.name };
  }
  return { id: owned[0]!.id, name: owned[0]!.name };
}

/** Nastawienie bota do postaci, którą reprezentuje mówiący. Null = brak wpisu. */
export async function relationForSpeaker(
  prisma: PrismaClient,
  options: { botId: string; campaignId: string; userId: string | null; sceneId: string | null },
): Promise<{ characterName: string; value: number; note: string } | null> {
  if (!options.userId) return null;
  const character = await speakingCharacter(prisma, {
    campaignId: options.campaignId,
    userId: options.userId,
    sceneId: options.sceneId,
  });
  if (!character) return null;
  const row = await prisma.botRelation.findUnique({
    where: { botId_characterId: { botId: options.botId, characterId: character.id } },
    select: { value: true, note: true },
  });
  // Brak wiersza to nie „obojętny", tylko „nie ma o czym mówić" — pusta sekcja
  // promptu jest tańsza i nie każe modelowi udawać znajomości.
  if (!row) return null;
  return { characterName: character.name, value: row.value, note: row.note };
}

// ---------------------------------------------------------------------------
// Zdarzenia
// ---------------------------------------------------------------------------

export const relationListEvent = defineEvent<undefined, RelationSyncPayload>({
  name: 'relation:list',
  role: ROLE_GM,
  handler: async ({ deps, socket }) => ({
    relations: await fetchRelations(deps.ctx.prisma, requireCampaignId(socket.data)),
  }),
});

export const relationSetEvent = defineEvent<RelationSetPayload, BotRelationView>({
  name: 'relation:set',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const botId = typeof payload?.botId === 'string' ? payload.botId : '';
    const characterId = typeof payload?.characterId === 'string' ? payload.characterId : '';
    if (!botId || !characterId) throw new RealtimeError('BAD_REQUEST');

    const [bot, character] = await Promise.all([
      deps.ctx.prisma.botProfile.findUnique({ where: { id: botId }, select: { campaignId: true } }),
      deps.ctx.prisma.character.findUnique({
        where: { id: characterId },
        select: { campaignId: true },
      }),
    ]);
    if (!bot || bot.campaignId !== campaignId) throw new RealtimeError('BOT_NOT_FOUND');
    if (!character || character.campaignId !== campaignId) {
      throw new RealtimeError('CHARACTER_NOT_FOUND');
    }

    const value = clampRelation(payload?.value);
    const note = sanitizeRelationNote(payload?.note);
    const row = await deps.ctx.prisma.botRelation.upsert({
      where: { botId_characterId: { botId, characterId } },
      create: { botId, characterId, value, note },
      update: { value, note },
      include: INCLUDE_NAMES,
    });

    const view = toView(row);
    deps.io
      .to(gmRoom(campaignId))
      .emit('relation:upsert', { relation: view } satisfies RelationUpsertBroadcast);
    return view;
  },
});

export const relationDeleteEvent = defineEvent<RelationDeletePayload, void>({
  name: 'relation:delete',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const botId = typeof payload?.botId === 'string' ? payload.botId : '';
    const characterId = typeof payload?.characterId === 'string' ? payload.characterId : '';
    if (!botId || !characterId) throw new RealtimeError('BAD_REQUEST');

    const removed = await deps.ctx.prisma.botRelation.deleteMany({
      where: { botId, characterId, bot: { campaignId } },
    });
    if (removed.count === 0) throw new RealtimeError('RELATION_NOT_FOUND');
    deps.io
      .to(gmRoom(campaignId))
      .emit('relation:delete', { botId, characterId } satisfies RelationDeleteBroadcast);
  },
});
