import type {
  CpredCharacterData,
  CpredSightingWeaponFacts,
  SightingLogEntry,
  SightingLookPayload,
  SightingLookResult,
  SessionUser,
} from '@vtt/shared';
import {
  ROLE_GM,
  cpredDrawnWeapons,
  cpredSighting,
  isWeaponEntry,
  parseCharacterData,
} from '@vtt/shared';
import type { Character, Scene, Token } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { requireCampaignId } from './combat.js';
import { requireCampaignToken, concealedFrom, concealmentFor } from './tokens.js';
import { toLinkedSheet } from '../sheets.js';
import { buildCompendiumSync } from './compendium.js';
import { deliverChatMessageTo, insertChatMessage } from './chat-io.js';

/**
 * Oględziny cudzej figury (etap 41) — „co on ma na sobie".
 *
 * Etap wziął się z tego, że wybór punktu Celowania (s. 170) zapadał w ciemno:
 * o tym, czy warto strzelać w głowę, rozstrzyga pancerz głowy, a gracz nie miał
 * do niego **żadnej** drogi. Karta cudzej figury nie jedzie do graczy i nie
 * zacznie — więc jedzie to, co widać, złożone tutaj.
 *
 * ## Trzy rzeczy, których ten plik pilnuje
 *
 *  1. **Widać tylko to, co widać.** Warunek jest ten sam, którym mapa decyduje
 *     o rysowaniu żetonu (`concealedFrom`), i celowo ten sam: gdyby oględziny
 *     miały własną definicję „widzę", rozjechałaby się z mgłą przy pierwszej
 *     ścianie. Figura ukryta przez MG nie istnieje dla gracza tak samo tutaj,
 *     jak na mapie.
 *  2. **Dwie warstwy rozstrzyga serwer.** Rzut oka wolno każdemu, kto widzi
 *     figurę; liczby wychodzą **wyłącznie** kartą czatu po zdanym Teście
 *     Percepcji (`character-rolls.ts`). Klient nie ma jak poprosić o warstwę
 *     szczegółową — nie ma na to pola w żądaniu, i to jest zamek, nie
 *     przeoczenie.
 *  3. **Klasę broni składa katalog.** „Karabin szturmowy" jest nazwą **typu**,
 *     nie egzemplarza, i tylko dlatego wolno ją pokazać za darmo: z drugiej
 *     strony ulicy widać, że ktoś trzyma karabin, a nie że jest to Ronin.
 */

/** Co katalog wie o broniach w rękach — mapa `rowId` → fakty dla `shared`. */
export async function weaponFactsFor(
  deps: RealtimeDeps,
  campaignId: string,
  data: CpredCharacterData,
): Promise<Record<string, CpredSightingWeaponFacts>> {
  const drawn = cpredDrawnWeapons(data);
  const withEntries = drawn.filter((row) => row.compendiumId);
  if (withEntries.length === 0) return {};
  const compendium = await buildCompendiumSync(deps, campaignId);
  const typeById = new Map(compendium.weaponTypes.map((type) => [type.id, type]));
  const facts: Record<string, CpredSightingWeaponFacts> = {};
  for (const row of withEntries) {
    const entry = compendium.entries.find((candidate) => candidate.id === row.compendiumId);
    if (!entry || !isWeaponEntry(entry)) continue;
    const type = entry.weaponTypeId ? typeById.get(entry.weaponTypeId) : undefined;
    if (type) facts[row.id] = { typeName: type.name };
  }
  return facts;
}

/**
 * Co widać na tej karcie — jedno wejście na obie warstwy.
 *
 * `detailed` rozstrzyga **wołający**, i jest dokładnie dwóch: to zdarzenie
 * (zawsze `false`) i zdany Test Percepcji (`true`). Trzeciego być nie powinno.
 */
export async function buildSighting(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  detailed: boolean,
): Promise<Record<string, unknown>> {
  const data = parseCharacterData(character.data, deps.ctx.cpred);
  const weapons = await weaponFactsFor(deps, campaignId, data);
  return cpredSighting(data, { detailed, weapons }) as unknown as Record<string, unknown>;
}

/**
 * Czy ten widz może w ogóle przyjrzeć się tej figurze.
 *
 * MG widzi wszystko i nie płaci za zapytanie o widoczność — tak samo, jak przy
 * synchronizacji sceny. Graczowi odmawia się `TOKEN_NOT_FOUND`, a nie
 * `FORBIDDEN`, i to ta sama ostrożność, co przy cudzej karcie: samo „ta figura
 * istnieje, ale jej nie widzisz" jest informacją, której nie ma prawa dostać.
 */
async function requireVisibleToken(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  tokenId: unknown,
): Promise<{ token: Token; scene: Scene }> {
  const { token, scene } = await requireCampaignToken(deps.ctx.prisma, campaignId, tokenId);
  if (user.role === ROLE_GM) return { token, scene };
  if (token.hidden) throw new RealtimeError('TOKEN_NOT_FOUND');
  const character = token.characterId
    ? await deps.ctx.prisma.character.findUnique({ where: { id: token.characterId } })
    : null;
  const linked = character ? toLinkedSheet(character, deps.ctx.cpred) : null;
  const concealment = await concealmentFor(deps.ctx.prisma, scene, user);
  if (concealedFrom(token, scene, concealment, linked, user.id)) {
    throw new RealtimeError('TOKEN_NOT_FOUND');
  }
  return { token, scene };
}

/**
 * `sighting:look` — rzut oka na figurę, bez rzutu i bez ceny.
 *
 * Zawsze warstwa pobieżna. Liczby przychodzą osobno, kartą czatu po zdanym
 * Teście — i dlatego to zdarzenie nie ma żadnego pola, którym dałoby się
 * o nie poprosić.
 */
export const sightingLookEvent = defineEvent<SightingLookPayload, SightingLookResult>({
  name: 'sighting:look',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { token } = await requireVisibleToken(deps, campaignId, user, payload?.tokenId);
    // Nazwa jedzie tą samą regułą, co na żetonie: stół dostaje alias, jeśli MG
    // go nadał. Okno oględzin nie ma prawa być jedynym miejscem w VTT, w którym
    // „Ochroniarz" nazywa się „Snajper Arasaki".
    const isGm = user.role === ROLE_GM;
    const name = isGm ? token.name : (token.publicName ?? token.name);
    if (!token.characterId) return { tokenId: token.id, name, sighting: null };
    const character = await deps.ctx.prisma.character.findUnique({
      where: { id: token.characterId },
    });
    if (!character || character.campaignId !== campaignId) {
      return { tokenId: token.id, name, sighting: null };
    }
    return {
      tokenId: token.id,
      name,
      sighting: await buildSighting(deps, campaignId, character, false),
    };
  },
});

/**
 * Zdany Test Percepcji: liczby lądują na czacie u tego, kto patrzył.
 *
 * **Nie rzuca wyjątkami.** Woła się to po udanym rzucie, więc odmowa oznaczałaby
 * przewrócenie całej karty rzutu za to, że figura zdążyła w międzyczasie zejść
 * ze sceny albo schować się we mgle. Cisza jest tu właściwą odpowiedzią: rzut
 * padł, a nie było już na co patrzeć.
 *
 * Widoczność sprawdza się **mimo** zdanego Testu, i to nie jest nadgorliwość:
 * `sightingTokenId` przychodzi od klienta, a zdanie Testu nie jest prawem do
 * obejrzenia dowolnej figury w kampanii.
 */
export async function revealSighting(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  tokenId: string,
  actorName: string,
): Promise<void> {
  let token: Token;
  try {
    ({ token } = await requireVisibleToken(deps, campaignId, user, tokenId));
  } catch {
    return;
  }
  if (!token.characterId) return;
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: token.characterId },
  });
  if (!character || character.campaignId !== campaignId) return;
  const isGm = user.role === ROLE_GM;
  const target = isGm ? token.name : (token.publicName ?? token.name);
  const entry: SightingLogEntry = {
    actor: actorName,
    target,
    targetTokenId: token.id,
    sighting: await buildSighting(deps, campaignId, character, true),
  };
  const view = await insertChatMessage(deps.ctx.prisma, {
    campaignId,
    authorId: user.id,
    kind: 'sighting',
    text: `Oględziny: ${target}`,
    payload: JSON.stringify(entry),
  });
  await deliverChatMessageTo(deps, campaignId, view, [user.id], true);
}
