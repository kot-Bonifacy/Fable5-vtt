import type {
  ChatMessageView,
  CpredCharacterData,
  CpredItemRef,
  CpredItemView,
  InventoryGivePayload,
  InventoryGiveResult,
  InventoryItemRefWire,
  InventoryMoveEntry,
  InventoryRespondPayload,
  InventoryTakePayload,
  SessionUser,
  StatusDefinition,
  TokenCondition,
} from '@vtt/shared';
import {
  CPRED_MELEE_REACH_M,
  EDDIES_MAX,
  INVENTORY_ITEMS_MAX,
  INVENTORY_NOTE_MAX,
  ROLE_GM,
  conditionRegistry,
  cpredItemLine,
  cpredMoveItems,
  cpredSheetHpMax,
  isCpredItemList,
  inventoryMoveHeadline,
  isInventoryMoveOpen,
  mayAnswerInventoryMove,
  mayCancelInventoryMove,
  mergeCharacterData,
  reachMetresBetweenTokens,
  metresForRules,
  parseCharacterData,
  tokenCondition,
  tokenTableName,
} from '@vtt/shared';
import type { Character, Scene, Token } from '../generated/prisma/client.js';
import type { PrismaClient } from '../db.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { requireCampaignId } from './combat.js';
import { emitCharacterUpsert, toCharacterView, refuseAwaitingGm } from './character-io.js';
import { applyBalance } from './economy.js';
import { emitTokensOfCharacter, requireCampaignToken, toTokenView } from './tokens.js';
import { toSceneView } from './scenes.js';
import { requireTeamCard } from './team-cards.js';
import { sweepEmptyPile } from './containers.js';
import {
  INCLUDE_CHAT_NAMES,
  deliverChatMessageTo,
  insertChatMessage,
  toChatMessageView,
} from './chat-io.js';

/**
 * Przedmioty między kartami (etap 38b) — przekazanie, łup i przeszukanie.
 *
 * Etap stoi w całości na 38a: figura ostatystykowana ma od tamtej sesji
 * prawdziwą kartę postaci, więc „łup gangera" to jego ekwipunek, a nie osobna
 * lista na żetonie. Dzięki temu cały ten moduł ma **jedną** ścieżkę zapisu:
 * dwie karty, jedna operacja.
 *
 * Trzy rozstrzygnięcia MG z 05.09.2026, których pilnuje ten plik:
 *
 *  1. **Przyjęcie wymaga potwierdzenia odbiorcy.** Przekazanie na kartę, która
 *     ma właściciela innego niż działający, wchodzi jako **propozycja**
 *     czekająca na „Przyjmij" — wzorem wezwania do Testu z etapu 32. Karta bez
 *     właściciela nie ma kto potwierdzić, więc jedzie od ręki.
 *  2. **Cel musi być na wyciągnięcie ręki** (06.09.2026, doprecyzowanie): ten
 *     sam `CPRED_MELEE_REACH_M`, którym Ustabilizowanie mierzy się od 14e,
 *     i **mierzone wszystkim, MG włącznie** — z tego samego powodu, dla którego
 *     mierzy się tam: MG podaje przedmiot figurą, która stoi na mapie. Gdy
 *     którejś ze stron nie ma na wspólnej scenie, nie ma czego mierzyć
 *     i warunku nie ma (przerwa między scenami, „daj mi to" w barze).
 *  3. **Łup statysty to jego ekwipunek.** Gracz przeszukuje wyłącznie kartę
 *     **bez właściciela**, i wyłącznie gdy jej figura leży albo nie żyje;
 *     z karty innego gracza przenosi tylko MG.
 */

/* ------------------------------------------------------------------ *
 * Wspólne pytania
 * ------------------------------------------------------------------ */

export async function findCampaignCharacter(
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

/**
 * Karta, którą ten użytkownik prowadzi.
 *
 * Odmowa jest `CHARACTER_NOT_FOUND`, a nie `FORBIDDEN`, i to jest ta sama
 * ostrożność, co w `character:update`: gracz nie ma się dowiedzieć nawet tego,
 * że dana karta istnieje.
 */
export async function requireOwnCharacter(
  prisma: PrismaClient,
  campaignId: string,
  user: SessionUser,
  characterId: unknown,
): Promise<Character> {
  const character = await findCampaignCharacter(prisma, campaignId, characterId);
  if (user.role !== ROLE_GM && character.ownerId !== user.id) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
  refuseAwaitingGm(character, user);
  return character;
}

/**
 * Adresy wierszy z żądania. Pusta lista przechodzi wyłącznie na życzenie
 * wołającego — przy przekazaniu samej gotówki i w polu wymiany handlu.
 */
export function readItemRefs(raw: unknown, allowEmpty = false): CpredItemRef[] {
  if (!Array.isArray(raw)) throw new RealtimeError(allowEmpty ? 'BAD_REQUEST' : 'NO_ITEMS');
  if (raw.length === 0 && !allowEmpty) throw new RealtimeError('NO_ITEMS');
  if (raw.length > INVENTORY_ITEMS_MAX) throw new RealtimeError('BAD_REQUEST');
  return raw.map((entry) => {
    const item = entry as InventoryItemRefWire;
    if (typeof item !== 'object' || item === null) throw new RealtimeError('BAD_REQUEST');
    if (!isCpredItemList(item.list)) throw new RealtimeError('BAD_REQUEST');
    if (typeof item.rowId !== 'string' || item.rowId.length === 0) {
      throw new RealtimeError('BAD_REQUEST');
    }
    if (item.qty !== undefined) {
      if (!Number.isInteger(item.qty) || item.qty < 1) throw new RealtimeError('BAD_QTY');
      return { list: item.list, rowId: item.rowId, qty: item.qty };
    }
    return { list: item.list, rowId: item.rowId };
  });
}

export function readEddies(raw: unknown): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > EDDIES_MAX) {
    throw new RealtimeError('BAD_REQUEST');
  }
  return raw;
}

/* ------------------------------------------------------------------ *
 * Zasięg ramienia
 * ------------------------------------------------------------------ */

export interface PlacedToken {
  token: Token;
  scene: Scene;
}

export async function tokensOf(prisma: PrismaClient, characterId: string): Promise<PlacedToken[]> {
  const rows = await prisma.token.findMany({
    where: { characterId },
    include: { scene: true },
  });
  return rows.map((row) => {
    const { scene, ...token } = row;
    return { token: token as Token, scene };
  });
}

/**
 * Zasięg ręki między dwiema figurami — po polach, ze skosami (#24): sąsiad po
 * skosie stoi tuż obok, choć prosta między środkami ma 2,83 m.
 */
export function metresBetweenPlaced(a: PlacedToken, b: PlacedToken): number {
  return metresForRules(
    reachMetresBetweenTokens(
      toTokenView(a.token, true),
      toTokenView(b.token, true),
      toSceneView(a.scene),
    ),
  );
}

/**
 * Najmniejsza odległość między figurami dwóch kart, albo `null`, gdy nie stoją
 * na żadnej wspólnej scenie.
 *
 * `null` **nie znaczy „daleko"** — znaczy „nie ma czego mierzyć". Karta, która
 * nigdzie nie stoi, jest poza sceną, a przekazywanie czegokolwiek między
 * scenami dzieje się w przerwie, którą i tak rozlicza MG.
 */
export async function closestMetres(
  prisma: PrismaClient,
  aId: string,
  bId: string,
): Promise<number | null> {
  const [left, right] = await Promise.all([tokensOf(prisma, aId), tokensOf(prisma, bId)]);
  let best: number | null = null;
  for (const a of left) {
    for (const b of right) {
      if (a.scene.id !== b.scene.id) continue;
      const metres = metresBetweenPlaced(a, b);
      if (best === null || metres < best) best = metres;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Stan figury, którą się przeszukuje
 * ------------------------------------------------------------------ */

export function conditionsOf(statuses: StatusDefinition[]): ReadonlyMap<string, TokenCondition> {
  return conditionRegistry(statuses);
}

/**
 * Czy ta figura leży albo nie żyje.
 *
 * Liczone tak samo, jak rysuje to mapa (`tokenCondition` z etapu 27j): gorsze
 * z tego, co mówią naklejki, i z tego, co mówią punkty. Dzięki temu „ten
 * ganger leży" znaczy przy stole i w tym pliku dokładnie to samo.
 */
export function searchableCondition(
  token: Token,
  data: CpredCharacterData,
  conditions: ReadonlyMap<string, TokenCondition>,
): TokenCondition {
  const max = cpredSheetHpMax(data);
  const view = toTokenView(token, true);
  return tokenCondition(
    { statuses: view.statuses, hp: { current: data.hpCurrent, max } },
    conditions,
  );
}

/* ------------------------------------------------------------------ *
 * Zapis obu kart
 * ------------------------------------------------------------------ */

/**
 * Zapisuje jedną stronę operacji i rozsyła kartę oraz jej żetony.
 *
 * Eurodolce jadą przez `applyBalance` z etapu 23b — nie dlatego, że tak
 * wygodniej, tylko dlatego, że **saldo pisze serwer albo nikt**, a każdy jego
 * ruch zostawia wiersz audytu. Łup 350 ed z kieszeni gangera ma w historii
 * wyglądać tak samo, jak przelew.
 */
async function writeSide(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  data: CpredCharacterData,
  money: { amount: number; label: string; counterpartyId: string } | null,
  actorId: string,
): Promise<void> {
  if (money && money.amount !== 0) {
    await applyBalance(
      deps,
      campaignId,
      character,
      data,
      {
        kind: 'transfer',
        amount: money.amount,
        label: money.label,
        counterpartyId: money.counterpartyId,
      },
      actorId,
    );
    return;
  }
  const saved = await deps.ctx.prisma.character.update({
    where: { id: character.id },
    data: { data: JSON.stringify(data) },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
  // Karta jest źródłem prawdy żetonu od etapu 08 — a od 38a także jego PW
  // i pancerza. Zapis karty bez odświeżenia figur ugryzł ten projekt już raz.
  await emitTokensOfCharacter(deps, campaignId, saved);
}

/**
 * Wykonuje przeniesienie: wiersze ekwipunku i ewentualne eurodolce.
 *
 * Jedno miejsce dla przekazania, łupu i przyjętej propozycji — bo z punktu
 * widzenia obu kart to jest jedna i ta sama czynność. Rozdzielenie jej dałoby
 * trzy miejsca, w których trzeba pamiętać o `emitTokensOfCharacter`.
 */
export async function moveBetweenCards(
  deps: RealtimeDeps,
  campaignId: string,
  from: Character,
  to: Character,
  refs: readonly CpredItemRef[],
  eddies: number,
  actorId: string,
): Promise<{ moved: CpredItemView[]; eddies: number }> {
  const registry = deps.ctx.cpred;
  const fromData = parseCharacterData(from.data, registry);
  const toData = parseCharacterData(to.data, registry);

  // Sama gotówka (okno „Wymiana", wiersz „Gotówka →") nie przesuwa żadnego
  // wiersza — `cpredMoveItems` odmawia pustej listy, więc tu się go nie woła.
  const move: ReturnType<typeof cpredMoveItems> =
    refs.length > 0
      ? cpredMoveItems(fromData, toData, refs)
      : { ok: true, result: { from: fromData, to: toData, moved: [] } };
  if (!move.ok) throw new RealtimeError(move.error);
  if (eddies > fromData.eddies) throw new RealtimeError('NOT_ENOUGH_EDDIES');
  if (move.result.moved.length === 0 && eddies === 0) throw new RealtimeError('NO_ITEMS');

  const nextFrom = mergeCharacterData(fromData, {
    weapons: move.result.from.weapons,
    armor: move.result.from.armor,
    gear: move.result.from.gear,
  });
  const nextTo = mergeCharacterData(toData, {
    weapons: move.result.to.weapons,
    armor: move.result.to.armor,
    gear: move.result.to.gear,
  });

  await writeSide(
    deps,
    campaignId,
    from,
    nextFrom,
    eddies > 0 ? { amount: -eddies, label: `do: ${to.name}`, counterpartyId: to.id } : null,
    actorId,
  );
  await writeSide(
    deps,
    campaignId,
    to,
    nextTo,
    eddies > 0 ? { amount: eddies, label: `od: ${from.name}`, counterpartyId: from.id } : null,
    actorId,
  );
  return { moved: move.result.moved, eddies };
}

/* ------------------------------------------------------------------ *
 * Karta czatu
 * ------------------------------------------------------------------ */

export function entryLines(moved: CpredItemView[], eddies: number): string[] {
  const lines = moved.map((view) => cpredItemLine(view));
  if (eddies > 0) lines.push(`Gotówka: ${eddies} ed`);
  return lines;
}

/**
 * Kto poza MG dostanie ten wiersz w **historii**.
 *
 * `recipientId` przepuszcza `visibleTo`, a autor widzi swoje przez `authorId` —
 * razem pokrywają obie strony każdej operacji, którą ktoś rozpoczął ze swojej
 * karty. Jedyny przypadek, w którym adres jest tylko jeden, to MG przenoszący
 * między dwiema kartami graczy: wiersz zapisuje się wtedy u tego, kto dostaje,
 * a drugi gracz widzi go na żywo i ma odświeżoną kartę. Świadomie — drugiego
 * adresata `ChatMessage` nie ma, a dwa wiersze na jedno zdarzenie kłamałyby
 * o tym, ile razy coś się stało.
 */
function historyRecipient(
  actorId: string,
  fromOwnerId: string | null,
  toOwnerId: string | null,
): string | null {
  if (toOwnerId && toOwnerId !== actorId) return toOwnerId;
  if (fromOwnerId && fromOwnerId !== actorId) return fromOwnerId;
  return null;
}

export async function postInventoryCard(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  entry: InventoryMoveEntry,
  audience: (string | null)[],
  fromOwnerId: string | null,
): Promise<ChatMessageView> {
  const message = await insertChatMessage(deps.ctx.prisma, {
    campaignId,
    authorId: user.id,
    kind: 'inventory',
    text: inventoryMoveHeadline(entry),
    recipientId: historyRecipient(user.id, fromOwnerId, entry.toOwnerId),
    payload: JSON.stringify(entry),
  });
  await deliverChatMessageTo(deps, campaignId, message, audience, true);
  return message;
}

/** Odsyła zmienioną kartę propozycji obu stronom — wzorem wezwania z 32. */
async function emitInventoryUpdate(
  deps: RealtimeDeps,
  campaignId: string,
  messageId: number,
  entry: InventoryMoveEntry,
  audience: (string | null)[],
): Promise<void> {
  const stored = await deps.ctx.prisma.chatMessage.update({
    where: { id: messageId },
    data: { payload: JSON.stringify(entry) },
    include: INCLUDE_CHAT_NAMES,
  });
  await deliverChatMessageTo(
    deps,
    campaignId,
    toChatMessageView(stored),
    audience,
    true,
    'chat:update',
  );
}

/* ------------------------------------------------------------------ *
 * inventory:give — „masz, weź to"
 * ------------------------------------------------------------------ */

export const inventoryGiveEvent = defineEvent<InventoryGivePayload, InventoryGiveResult>({
  name: 'inventory:give',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const from = await requireOwnCharacter(prisma, campaignId, user, payload?.fromCharacterId);
    // NPC-owi spoza drużyny gracz daje przez okno handlu, nie po id karty (#40).
    const to = await requireTeamCard(prisma, campaignId, user, payload?.toCharacterId);
    if (to.id === from.id) throw new RealtimeError('BAD_REQUEST');

    const eddies = readEddies(payload?.eddies);
    const refs = readItemRefs(payload?.items, eddies > 0);
    const note =
      typeof payload?.note === 'string' ? payload.note.trim().slice(0, INVENTORY_NOTE_MAX) : '';

    const metres = await closestMetres(prisma, from.id, to.id);
    if (metres !== null && metres > CPRED_MELEE_REACH_M) {
      throw new RealtimeError('OUT_OF_REACH');
    }

    // Sprawdzenie „czy to w ogóle da się przenieść" pada TERAZ, u wysyłającego,
    // a nie odbiorcy przy „Przyjmij" — tą samą umową, którą wezwanie do Testu
    // planuje rzut w chwili wystawiania (etap 32).
    const fromData = parseCharacterData(from.data, deps.ctx.cpred);
    const toData = parseCharacterData(to.data, deps.ctx.cpred);
    const preview: ReturnType<typeof cpredMoveItems> =
      refs.length > 0
        ? cpredMoveItems(fromData, toData, refs)
        : { ok: true, result: { from: fromData, to: toData, moved: [] } };
    if (!preview.ok) throw new RealtimeError(preview.error);
    if (eddies > fromData.eddies) throw new RealtimeError('NOT_ENOUGH_EDDIES');

    // Karta bez właściciela nie ma kto przyjąć, a własna karta nie ma po co.
    const direct = to.ownerId === null || to.ownerId === user.id;
    const entry: InventoryMoveEntry = {
      kind: 'give',
      fromCharacterId: from.id,
      fromName: from.name,
      toCharacterId: to.id,
      toName: to.name,
      toOwnerId: to.ownerId,
      actorName: user.name,
      lines: entryLines(preview.result.moved, eddies),
      ...(eddies > 0 ? { eddies } : {}),
      ...(note ? { note } : {}),
      system: { items: refs } as unknown as Record<string, unknown>,
      ...(direct ? { resolution: { kind: 'accepted' as const, byName: user.name } } : {}),
    };

    if (direct) {
      await moveBetweenCards(deps, campaignId, from, to, refs, eddies, user.id);
    }
    // MG opróżnia stos trybem MG („Skąd: Stos”) — pusty znika tak samo jak po łupie.
    if (direct) await sweepEmptyPile(deps, campaignId, from.id);
    const message = await postInventoryCard(
      deps,
      campaignId,
      user,
      entry,
      [from.ownerId, to.ownerId],
      from.ownerId,
    );
    return { messageId: message.id, pending: !direct };
  },
});

/* ------------------------------------------------------------------ *
 * inventory:take — „zdejmuję to z ciała"
 * ------------------------------------------------------------------ */

export const inventoryTakeEvent = defineEvent<InventoryTakePayload, { messageId: number }>({
  name: 'inventory:take',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const isGm = user.role === ROLE_GM;
    const to = await requireOwnCharacter(prisma, campaignId, user, payload?.toCharacterId);
    const { token, scene } = await requireCampaignToken(prisma, campaignId, payload?.fromTokenId);
    if (!isGm && token.hidden) throw new RealtimeError('TOKEN_NOT_FOUND');
    if (!token.characterId) throw new RealtimeError('NO_SHEET');
    if (token.characterId === to.id) throw new RealtimeError('BAD_REQUEST');
    const from = await findCampaignCharacter(prisma, campaignId, token.characterId);

    const eddies = readEddies(payload?.eddies);
    const refs = readItemRefs(payload?.items, eddies > 0);
    const fromData = parseCharacterData(from.data, deps.ctx.cpred);

    // Pojemnik (46b): bierze każdy, kto stoi obok, ale tylko z otwartego —
    // zawartość zamkniętego nie opuszcza serwera, więc i wyjąć jej nie ma jak.
    if (fromData.container) {
      if (fromData.container.lock !== 'open' && !isGm) throw new RealtimeError('CONTAINER_LOCKED');
    } else if (!isGm) {
      if (from.ownerId !== null) throw new RealtimeError('NOT_YOURS');
      const condition = searchableCondition(token, fromData, conditionsOf(deps.ctx.statuses.list));
      if (condition !== 'down' && condition !== 'dead') throw new RealtimeError('STILL_STANDING');
    }

    // Przeszukanie jest czynnością **przy** ciele: figura biorącego musi stać na
    // tej samej scenie i w zasięgu ramienia. Inaczej niż przy przekazaniu nie ma
    // tu furtki „brak wspólnej sceny" — nie da się przeszukać zwłok, przy
    // których się nie stoi.
    const stands = (await tokensOf(prisma, to.id)).filter((placed) => placed.scene.id === scene.id);
    if (stands.length === 0) throw new RealtimeError('NOT_ON_SCENE');
    const metres = Math.min(...stands.map((stand) => metresBetweenPlaced(stand, { token, scene })));
    if (metres > CPRED_MELEE_REACH_M) throw new RealtimeError('OUT_OF_REACH');

    const result = await moveBetweenCards(deps, campaignId, from, to, refs, eddies, user.id);
    const entry: InventoryMoveEntry = {
      kind: 'take',
      fromCharacterId: from.id,
      fromName: tokenTableName(token, token.name),
      toCharacterId: to.id,
      toName: to.name,
      toOwnerId: to.ownerId,
      actorName: user.name,
      lines: entryLines(result.moved, result.eddies),
      ...(result.eddies > 0 ? { eddies: result.eddies } : {}),
      system: { items: refs } as unknown as Record<string, unknown>,
      resolution: { kind: 'accepted', byName: user.name },
    };
    const message = await postInventoryCard(
      deps,
      campaignId,
      user,
      entry,
      [from.ownerId, to.ownerId],
      from.ownerId,
    );
    await sweepEmptyPile(deps, campaignId, from.id);
    return { messageId: message.id };
  },
});

/* ------------------------------------------------------------------ *
 * inventory:respond — „Przyjmij", „Odrzuć", „Wycofaj"
 * ------------------------------------------------------------------ */

export const inventoryRespondEvent = defineEvent<InventoryRespondPayload, void>({
  name: 'inventory:respond',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const messageId = payload?.messageId;
    if (typeof messageId !== 'number' || !Number.isInteger(messageId)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const stored = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: INCLUDE_CHAT_NAMES,
    });
    if (
      !stored ||
      stored.campaignId !== campaignId ||
      stored.kind !== 'inventory' ||
      !stored.payload
    ) {
      throw new RealtimeError('OFFER_NOT_FOUND');
    }
    const entry = JSON.parse(stored.payload) as InventoryMoveEntry;
    if (!isInventoryMoveOpen(entry)) throw new RealtimeError('OFFER_CLOSED');

    const isGm = user.role === ROLE_GM;
    const accept = payload?.accept === true;
    const mayAnswer = mayAnswerInventoryMove(entry, user.id, isGm);
    const mayCancel = mayCancelInventoryMove(entry, user.id, isGm, stored.authorId);
    if (accept && !mayAnswer) throw new RealtimeError('OFFER_NOT_YOURS');
    if (!accept && !mayAnswer && !mayCancel) throw new RealtimeError('OFFER_NOT_YOURS');

    const from = await findCampaignCharacter(prisma, campaignId, entry.fromCharacterId);
    const to = await findCampaignCharacter(prisma, campaignId, entry.toCharacterId);
    const audience = [from.ownerId, to.ownerId, stored.authorId];

    if (!accept) {
      // Odrzucone przez odbiorcę, wycofane przez wysyłającego — ta sama
      // ścieżka, dwa różne zdania, bo przy stole to dwie różne rzeczy.
      entry.resolution = {
        kind: mayAnswer && entry.toOwnerId === user.id ? 'declined' : 'cancelled',
        byName: user.name,
      };
      await emitInventoryUpdate(deps, campaignId, messageId, entry, audience);
      return;
    }

    const refs = (entry.system as { items?: CpredItemRef[] }).items ?? [];
    const result = await moveBetweenCards(
      deps,
      campaignId,
      from,
      to,
      refs,
      entry.eddies ?? 0,
      user.id,
    );
    entry.lines = entryLines(result.moved, result.eddies);
    entry.resolution = { kind: 'accepted', byName: user.name };
    await emitInventoryUpdate(deps, campaignId, messageId, entry, audience);
    await sweepEmptyPile(deps, campaignId, from.id);
  },
});
