import type { SessionUser } from '@vtt/shared';
import { ROLE_GM, parseBotData } from '@vtt/shared';
import type { Character, Prisma } from '../generated/prisma/client.js';
import type { PrismaClient } from '../db.js';
import { RealtimeError } from './registry.js';

/**
 * Karty, które gracz wolno wskazać po id — drużyna, nie cała kampania (#40, 30.09.2026).
 *
 * Drużyna to karty graczy i karty towarzyszy-botów (profil `companion`, nie
 * w archiwum): towarzysz mówi na czacie pod własnym imieniem, więc jego karta
 * nie jest tajemnicą, a przy grze solo to on stoi obok gracza. Każdy inny NPC —
 * także taki, któremu MG dał głos bota (Paser) — jest sprawą MG: gracz wskazuje
 * go **figurą** (okno handlu, menu żetonu), a id i prawdziwej nazwy jego karty
 * nie poznaje. Do 30.09 lista odbiorców przelewu (`economy:history`)
 * i przekazania (`inventory:sources`) niosła graczowi wszystkie karty kampanii
 * z prawdziwymi nazwami, więc umowa handlu, która obiecywała to samo, nie
 * ukrywała niczego.
 *
 * MG widzi wszystko — filtr jest pusty. Typ bota siedzi w JSON-ie profilu,
 * więc towarzyszy zbiera się tu, a nie warunkiem w zapytaniu.
 */
export async function teamCardsWhere(
  prisma: PrismaClient,
  campaignId: string,
  user: SessionUser,
): Promise<Prisma.CharacterWhereInput> {
  if (user.role === ROLE_GM) return {};
  const bots = await prisma.botProfile.findMany({
    where: { campaignId, archived: false, characterId: { not: null } },
    select: { characterId: true, data: true },
  });
  const companions = bots
    .filter((bot) => parseBotData(bot.data).type === 'companion')
    .map((bot) => bot.characterId!);
  return { OR: [{ ownerId: { not: null } }, { id: { in: companions } }] };
}

/**
 * Karta wskazana po id przez gracza jako odbiorca — przelew, przekazanie.
 * Karta spoza drużyny odpada tym samym `CHARACTER_NOT_FOUND`, co karta spoza
 * kampanii: gracz nie ma się dowiedzieć nawet tego, że istnieje.
 */
export async function requireTeamCard(
  prisma: PrismaClient,
  campaignId: string,
  user: SessionUser,
  characterId: unknown,
): Promise<Character> {
  if (typeof characterId !== 'string' || characterId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const character = await prisma.character.findFirst({
    where: {
      AND: [{ id: characterId, campaignId }, await teamCardsWhere(prisma, campaignId, user)],
    },
  });
  if (!character) throw new RealtimeError('CHARACTER_NOT_FOUND');
  return character;
}

/**
 * Czy karta należy do drużyny (gracz albo towarzysz-bot) — ta sama definicja
 * co `teamCardsWhere`, dla jednej karty. Handel (46a) niesie to w stronie,
 * żeby widok mógł podać graczowi id karty kolegi, a nie NPC-a.
 */
export async function isTeamCard(
  prisma: PrismaClient,
  campaignId: string,
  card: Pick<Character, 'id' | 'ownerId'>,
): Promise<boolean> {
  if (card.ownerId !== null) return true;
  const bot = await prisma.botProfile.findFirst({
    where: { campaignId, archived: false, characterId: card.id },
    select: { data: true },
  });
  return bot !== null && parseBotData(bot.data).type === 'companion';
}
