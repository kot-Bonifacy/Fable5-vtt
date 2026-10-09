import type {
  ContainerConfigPayload,
  ContainerCreatePayload,
  ContainerCreateResult,
  ContainerOpenPayload,
  ContainerOpenResult,
  ContainerPutPayload,
  CpredCharacterData,
  CpredContainer,
  InventoryDropPayload,
  InventoryDropResult,
  InventoryMoveEntry,
  SessionUser,
} from '@vtt/shared';
import { randomBytes } from 'node:crypto';
import {
  CHECK_CALL_DV_MAX,
  CHECK_CALL_DV_MIN,
  CONTAINER_PILES_PER_SCENE_MAX,
  CONTAINER_PRESET_LOOKS,
  CPRED_MELEE_REACH_M,
  ROLE_GM,
  createContainerSheet,
  cpredContainerEmpty,
  cpredContainerOpening,
  cpredHasKey,
  cpredKeyRow,
  cpredLockTestSettled,
  cpredRowId,
  cpredWithContainer,
  isContainerLock,
  isContainerPreset,
  isCpredLockSkill,
  cpredItemLists,
  cpredItemListsOverflow,
  mergeCharacterData,
  parseCharacterData,
  sanitizeTokenName,
  snapTokenPosition,
  tokenTableName,
} from '@vtt/shared';
import type { Character, Scene, Token } from '../generated/prisma/client.js';
import type { PrismaClient } from '../db.js';
import { sheetIsContainer, toLinkedSheet } from '../sheets.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { requireCampaignId } from './combat.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { createCheckCall, type CheckFrame } from './checks.js';
import {
  entryLines,
  findCampaignCharacter,
  metresBetweenPlaced,
  moveBetweenCards,
  postInventoryCard,
  readEddies,
  readItemRefs,
  requireOwnCharacter,
  tokensOf,
  type PlacedToken,
} from './inventory.js';
import { requireCampaignScene } from './scenes.js';
import {
  concealedFrom,
  concealmentFor,
  emitTokenUpsert,
  emitTokensOfCharacter,
  removeCardWithFigures,
  requireCampaignToken,
  toSnapScene,
} from './tokens.js';

/**
 * Pojemniki na scenie (etap 46b, wzór: Item Piles z Foundry VTT).
 *
 * Pojemnik to **figura z kartą** (decyzja MG 13): skrzynia, bagażnik i schowek
 * stawia MG narzędziem w pasku mapy, „Stos” powstaje sam, gdy ktoś upuści
 * przedmiot na mapę. Zawartość jest ekwipunkiem karty, więc przenoszenie idzie
 * tą samą drogą co łup z 38b (`moveBetweenCards`), a limit 40 wierszy, mgła
 * i ukrycie przez MG działają bez nowej gałęzi.
 *
 * Trzy umowy, których pilnuje ten plik:
 *
 *  1. **Zawartość nieotwartego pojemnika nie opuszcza serwera** (decyzja 14).
 *     Gracz dostaje nazwę i stan zamka (`TokenView.container`), a wiersze
 *     dopiero wtedy, gdy zamek jest otwarty — w `exchange:counterparts`.
 *     Karta pojemnika nie ma właściciela, więc `character:upsert` i tak jedzie
 *     wyłącznie do MG.
 *  2. **Stan zamka pisze tylko serwer** — `container:*` i rozliczenie Testu
 *     w `character-rolls.ts`. Łata karty z polem `container` pada w
 *     `character:update` dla wszystkich, MG też: inaczej autozapis jego karty
 *     zamknąłby skrzynię, którą gracz właśnie otworzył.
 *  3. **Zasięg ręki mierzy się wszystkim, MG włącznie** — ta sama umowa co
 *     przy łupie (`CPRED_MELEE_REACH_M`, bez furtki „brak wspólnej sceny”).
 */

/* ------------------------------------------------------------------ *
 * Wspólne pytania
 * ------------------------------------------------------------------ */

/** Czy figura jest pojemnikiem — jedno pytanie dla wszystkich list figur (ryzyko 8). */
export async function containerTokenIds(
  prisma: PrismaClient,
  tokens: readonly Pick<Token, 'id' | 'characterId'>[],
): Promise<Set<string>> {
  const ids = [...new Set(tokens.map((t) => t.characterId).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Set();
  const cards = await prisma.character.findMany({
    where: { id: { in: ids } },
    select: { id: true, data: true },
  });
  const containers = new Set(cards.filter((card) => sheetIsContainer(card)).map((card) => card.id));
  return new Set(
    tokens.filter((t) => t.characterId && containers.has(t.characterId)).map((t) => t.id),
  );
}

/** To samo dla jednej figury. */
export async function isContainerToken(
  prisma: PrismaClient,
  token: Pick<Token, 'id' | 'characterId'>,
): Promise<boolean> {
  return (await containerTokenIds(prisma, [token])).has(token.id);
}

interface ContainerAt {
  token: Token;
  scene: Scene;
  card: Character;
  data: CpredCharacterData;
  container: CpredContainer;
}

/**
 * Figura pojemnika, którą ten użytkownik widzi. Ukryta albo pod mgłą — dla
 * gracza nie istnieje (`TOKEN_NOT_FOUND`, jak w oględzinach), a figura, która
 * pojemnikiem nie jest, to `NOT_A_CONTAINER`.
 */
async function requireContainerToken(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  tokenId: unknown,
): Promise<ContainerAt> {
  const prisma = deps.ctx.prisma;
  const { token, scene } = await requireCampaignToken(prisma, campaignId, tokenId);
  const isGm = user.role === ROLE_GM;
  if (!isGm && token.hidden) throw new RealtimeError('TOKEN_NOT_FOUND');
  if (!token.characterId) throw new RealtimeError('NOT_A_CONTAINER');
  const card = await findCampaignCharacter(prisma, campaignId, token.characterId);
  const data = parseCharacterData(card.data, deps.ctx.cpred);
  if (!data.container) throw new RealtimeError('NOT_A_CONTAINER');
  if (!isGm) {
    const concealment = await concealmentFor(prisma, scene, user);
    if (concealedFrom(token, scene, concealment, toLinkedSheet(card, deps.ctx.cpred), user.id)) {
      throw new RealtimeError('TOKEN_NOT_FOUND');
    }
  }
  return { token, scene, card, data, container: data.container };
}

/** Figura karty działającego musi stać na scenie pojemnika i na wyciągnięcie ręki. */
async function requireReach(
  prisma: PrismaClient,
  characterId: string,
  target: PlacedToken,
): Promise<void> {
  const stands = (await tokensOf(prisma, characterId)).filter(
    (placed) => placed.scene.id === target.scene.id,
  );
  if (stands.length === 0) throw new RealtimeError('NOT_ON_SCENE');
  const metres = Math.min(...stands.map((stand) => metresBetweenPlaced(stand, target)));
  if (metres > CPRED_MELEE_REACH_M) throw new RealtimeError('OUT_OF_REACH');
}

/** Zapisuje nowy stan pojemnika i rozsyła kartę (MG) oraz figury (cały stół). */
async function writeContainer(
  deps: RealtimeDeps,
  campaignId: string,
  card: Character,
  data: CpredCharacterData,
  container: CpredContainer,
): Promise<Character> {
  const saved = await deps.ctx.prisma.character.update({
    where: { id: card.id },
    data: { data: JSON.stringify(mergeCharacterData(data, cpredWithContainer(data, container))) },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
  await emitTokensOfCharacter(deps, campaignId, saved);
  return saved;
}

/**
 * Pusty stos znika razem z kartą (Item Piles: „delete when empty”). Skrzynia,
 * bagażnik i schowek zostają — stawia je MG i to on je zabiera.
 *
 * Woła to każda droga, która coś z karty wyjmuje (łup, przekazanie MG, przyjęta
 * propozycja), bo z punktu widzenia stosu to ta sama czynność.
 */
export async function sweepEmptyPile(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
): Promise<void> {
  const card = await deps.ctx.prisma.character.findUnique({ where: { id: characterId } });
  if (!card || card.campaignId !== campaignId || card.ownerId !== null) return;
  if (!sheetIsContainer(card)) return;
  const data = parseCharacterData(card.data, deps.ctx.cpred);
  if (!data.container?.pile || !cpredContainerEmpty(data)) return;
  await removeCardWithFigures(deps, campaignId, card.id);
}

/** Losowy uchwyt kluczy — nie id karty, bo tego gracz nie ma prawa poznać (#40). */
function newKeyId(): string {
  return randomBytes(12).toString('base64url');
}

/* ------------------------------------------------------------------ *
 * container:create — MG stawia skrzynię
 * ------------------------------------------------------------------ */

export const containerCreateEvent = defineEvent<ContainerCreatePayload, ContainerCreateResult>({
  name: 'container:create',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const scene = await requireCampaignScene(
      prisma,
      campaignId,
      payload?.sceneId ?? socket.data.viewedSceneId,
    );
    if (!isContainerPreset(payload?.preset)) throw new RealtimeError('BAD_REQUEST');
    const x = payload.x;
    const y = payload.y;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x + y)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const look = CONTAINER_PRESET_LOOKS[payload.preset];
    const name =
      payload.name === undefined ? look.name : (sanitizeTokenName(payload.name) ?? look.name);
    const spot = snapTokenPosition(x, y, 1, toSnapScene(scene));

    const card = await prisma.character.create({
      data: {
        campaignId,
        name,
        ownerId: null,
        data: JSON.stringify(createContainerSheet({ lock: 'closed' })),
      },
    });
    await emitCharacterUpsert(deps, campaignId, toCharacterView(card, deps.ctx.cpred));
    const token = await prisma.token.create({
      data: {
        sceneId: scene.id,
        name,
        imageUrl: look.imageUrl,
        x: spot.x,
        y: spot.y,
        size: 1,
        ownerId: null,
        characterId: card.id,
      },
    });
    await emitTokenUpsert(deps, campaignId, scene, token, toLinkedSheet(card, deps.ctx.cpred));
    return { tokenId: token.id, characterId: card.id };
  },
});

/* ------------------------------------------------------------------ *
 * container:config — zamek, PT, Umiejętności, klucz
 * ------------------------------------------------------------------ */

export const containerConfigEvent = defineEvent<ContainerConfigPayload, void>({
  name: 'container:config',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const card = await findCampaignCharacter(prisma, campaignId, payload?.characterId);
    const data = parseCharacterData(card.data, deps.ctx.cpred);
    if (!data.container) throw new RealtimeError('NOT_A_CONTAINER');
    let container: CpredContainer = { ...data.container };

    if (payload.lock !== undefined) {
      if (!isContainerLock(payload.lock)) throw new RealtimeError('BAD_REQUEST');
      container.lock = payload.lock;
    }
    if (payload.dv !== undefined) {
      const dv = payload.dv;
      if (!Number.isInteger(dv) || dv < CHECK_CALL_DV_MIN || dv > CHECK_CALL_DV_MAX) {
        throw new RealtimeError('BAD_REQUEST');
      }
      container.dv = dv;
    }
    if (payload.skills !== undefined) {
      if (!Array.isArray(payload.skills) || payload.skills.length === 0) {
        throw new RealtimeError('BAD_REQUEST');
      }
      if (!payload.skills.every(isCpredLockSkill)) throw new RealtimeError('BAD_REQUEST');
      container.skills = [...new Set(payload.skills)];
    }
    if (payload.resetTries === true) container.tried = [];

    // „Wydaj klucz”: wiersz wyposażenia na wskazanej karcie. Uchwyt kluczy
    // powstaje przy pierwszym wydaniu i zostaje — drugi klucz otwiera to samo.
    if (payload.issueKeyTo !== undefined) {
      const holder = await findCampaignCharacter(prisma, campaignId, payload.issueKeyTo);
      if (holder.id === card.id) throw new RealtimeError('BAD_REQUEST');
      if (container.keyId === null) container = { ...container, keyId: newKeyId() };
      const holderData = parseCharacterData(holder.data, deps.ctx.cpred);
      const gear = [...holderData.gear, cpredKeyRow(cpredRowId(), container.keyId!, card.name)];
      if (cpredItemListsOverflow(cpredItemLists({ ...holderData, gear })))
        throw new RealtimeError('TOO_MANY_ROWS');
      const savedHolder = await prisma.character.update({
        where: { id: holder.id },
        data: { data: JSON.stringify(mergeCharacterData(holderData, { gear })) },
      });
      await emitCharacterUpsert(deps, campaignId, toCharacterView(savedHolder, deps.ctx.cpred));
    }

    await writeContainer(deps, campaignId, card, data, container);
  },
});

/* ------------------------------------------------------------------ *
 * container:open — „Otwórz”, klucz albo Test zamka
 * ------------------------------------------------------------------ */

/** Otwarte wezwanie tej postaci do Testu tego zamka — drugie „Otwórz zamek” go nie dubluje. */
async function openLockCall(
  prisma: PrismaClient,
  campaignId: string,
  characterId: string,
  tokenId: string,
): Promise<number | null> {
  const rows = await prisma.chatMessage.findMany({
    where: { campaignId, kind: 'check' },
    select: { id: true, payload: true },
    orderBy: { id: 'desc' },
    take: 50,
  });
  for (const row of rows) {
    if (!row.payload) continue;
    const entry = JSON.parse(row.payload) as {
      characterId?: string;
      resolved?: unknown;
      cancelled?: unknown;
      system?: { containerTokenId?: string };
    };
    if (entry.characterId !== characterId || entry.system?.containerTokenId !== tokenId) continue;
    if (entry.resolved === undefined && entry.cancelled === undefined) return row.id;
  }
  return null;
}

export const containerOpenEvent = defineEvent<ContainerOpenPayload, ContainerOpenResult>({
  name: 'container:open',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const opener = await requireOwnCharacter(prisma, campaignId, user, payload?.characterId);
    const at = await requireContainerToken(deps, campaignId, user, payload?.tokenId);
    if (opener.id === at.card.id) throw new RealtimeError('BAD_REQUEST');
    await requireReach(prisma, opener.id, at);

    const openerData = parseCharacterData(opener.data, deps.ctx.cpred);
    const verdict = cpredContainerOpening(at.container, {
      characterId: opener.id,
      isGm: user.role === ROLE_GM,
      hasKey: cpredHasKey(openerData, at.container.keyId),
      ...(typeof payload?.skillId === 'string' ? { skillId: payload.skillId } : {}),
    });

    switch (verdict.kind) {
      case 'already-open':
        return { outcome: 'open' };
      case 'open':
        await writeContainer(deps, campaignId, at.card, at.data, { ...at.container, lock: 'open' });
        return { outcome: 'open' };
      case 'refused':
        throw new RealtimeError(verdict.error);
      case 'test': {
        const pending = await openLockCall(prisma, campaignId, opener.id, at.token.id);
        if (pending !== null) return { outcome: 'test', callMessageId: pending };
        // Zamek „wzywa” do Testu tą samą drogą, którą MG wzywa od etapu 32:
        // kubek otwiera się z karty wezwania, próg i Umiejętność siedzą
        // w zapisanym wezwaniu, a werdykt rozlicza `character-rolls.ts`.
        const frame: CheckFrame = { dv: verdict.dv, modifier: 0, visibility: 'public' };
        const created = await createCheckCall(deps, {
          campaignId,
          user,
          characterId: opener.id,
          request: { kind: 'skill', skillId: verdict.skillId },
          frame,
          prompt: `Zamek: ${tokenTableName(at.token, at.token.name)}`,
          containerTokenId: at.token.id,
          calledByName: tokenTableName(at.token, at.token.name),
        });
        return { outcome: 'test', callMessageId: created.messageId };
      }
    }
  },
});

/**
 * Rozliczenie Testu zamka — woła je rzut na wezwanie z `containerTokenId`.
 * Zdany otwiera, niezdany zapisuje postać na liście prób. Pojemnik, który
 * w międzyczasie zniknął albo przestał nim być, nie ma czego rozliczać.
 */
export async function settleLockTest(
  deps: RealtimeDeps,
  campaignId: string,
  tokenId: string,
  characterId: string,
  success: boolean,
): Promise<void> {
  const token = await deps.ctx.prisma.token.findUnique({
    where: { id: tokenId },
    include: { scene: true },
  });
  if (!token?.characterId || token.scene.campaignId !== campaignId) return;
  const card = await deps.ctx.prisma.character.findUnique({ where: { id: token.characterId } });
  if (!card) return;
  const data = parseCharacterData(card.data, deps.ctx.cpred);
  if (!data.container || data.container.lock !== 'locked') return;
  await writeContainer(
    deps,
    campaignId,
    card,
    data,
    cpredLockTestSettled(data.container, characterId, success),
  );
}

/* ------------------------------------------------------------------ *
 * container:put — z mojej karty do otwartego pojemnika
 * ------------------------------------------------------------------ */

export const containerPutEvent = defineEvent<ContainerPutPayload, { messageId: number }>({
  name: 'container:put',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const from = await requireOwnCharacter(prisma, campaignId, user, payload?.fromCharacterId);
    const at = await requireContainerToken(deps, campaignId, user, payload?.tokenId);
    if (from.id === at.card.id) throw new RealtimeError('BAD_REQUEST');
    if (at.container.lock !== 'open') throw new RealtimeError('CONTAINER_LOCKED');
    await requireReach(prisma, from.id, at);

    const eddies = readEddies(payload?.eddies);
    const refs = readItemRefs(payload?.items, eddies > 0);
    const result = await moveBetweenCards(deps, campaignId, from, at.card, refs, eddies, user.id);
    const name = tokenTableName(at.token, at.token.name);
    const entry: InventoryMoveEntry = {
      kind: 'give',
      fromCharacterId: from.id,
      fromName: from.name,
      toCharacterId: at.card.id,
      toName: name,
      toOwnerId: null,
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
      [from.ownerId],
      from.ownerId,
    );
    return { messageId: message.id };
  },
});

/* ------------------------------------------------------------------ *
 * inventory:drop — przedmiot z karty na mapę: stos
 * ------------------------------------------------------------------ */

export const inventoryDropEvent = defineEvent<InventoryDropPayload, InventoryDropResult>({
  name: 'inventory:drop',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const isGm = user.role === ROLE_GM;
    const from = await requireOwnCharacter(prisma, campaignId, user, payload?.fromCharacterId);
    if (sheetIsContainer(from)) throw new RealtimeError('BAD_REQUEST');
    const scene = await requireCampaignScene(prisma, campaignId, socket.data.viewedSceneId);
    const x = payload?.x;
    const y = payload?.y;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x + y)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const eddies = readEddies(payload?.eddies);
    const refs = readItemRefs(payload?.items, eddies > 0);

    // Stos ląduje na polu pod kursorem, a to pole musi być na wyciągnięcie ręki
    // od figury upuszczającego — jak łup, tylko w drugą stronę.
    const spot = snapTokenPosition(x, y, 1, toSnapScene(scene));
    const stands = (await tokensOf(prisma, from.id)).filter((p) => p.scene.id === scene.id);
    if (stands.length === 0) throw new RealtimeError('NOT_ON_SCENE');
    const phantom: PlacedToken = {
      token: { ...stands[0]!.token, id: 'drop', x: spot.x, y: spot.y, size: 1 },
      scene,
    };
    const metres = Math.min(...stands.map((stand) => metresBetweenPlaced(stand, phantom)));
    if (metres > CPRED_MELEE_REACH_M) throw new RealtimeError('OUT_OF_REACH');

    // Na polu stoi już stos, który widzę? Dokładam do niego (Item Piles robi
    // tak samo): dwa worki na jednym polu byłyby dwoma kliknięciami za dużo.
    const onSpot = await prisma.token.findMany({
      where: { sceneId: scene.id, x: spot.x, y: spot.y, characterId: { not: null } },
    });
    let pile: { token: Token; card: Character } | null = null;
    for (const token of onSpot) {
      if (!isGm && token.hidden) continue;
      const card = await prisma.character.findUnique({ where: { id: token.characterId! } });
      if (!card || card.campaignId !== campaignId) continue;
      const data = parseCharacterData(card.data, deps.ctx.cpred);
      if (data.container?.pile && data.container.lock === 'open') {
        pile = { token, card };
        break;
      }
    }

    if (!pile) {
      const sceneTokens = await prisma.token.findMany({
        where: { sceneId: scene.id, characterId: { not: null } },
        select: { id: true, characterId: true },
      });
      const containers = await containerTokenIds(prisma, sceneTokens);
      if (containers.size >= CONTAINER_PILES_PER_SCENE_MAX)
        throw new RealtimeError('TOO_MANY_PILES');
      const look = CONTAINER_PRESET_LOOKS.pile;
      const card = await prisma.character.create({
        data: {
          campaignId,
          name: look.name,
          ownerId: null,
          data: JSON.stringify(createContainerSheet({ lock: 'open', pile: true })),
        },
      });
      await emitCharacterUpsert(deps, campaignId, toCharacterView(card, deps.ctx.cpred));
      const token = await prisma.token.create({
        data: {
          sceneId: scene.id,
          name: look.name,
          imageUrl: look.imageUrl,
          x: spot.x,
          y: spot.y,
          size: 1,
          ownerId: null,
          characterId: card.id,
        },
      });
      pile = { token, card };
    }

    let result: Awaited<ReturnType<typeof moveBetweenCards>>;
    try {
      result = await moveBetweenCards(deps, campaignId, from, pile.card, refs, eddies, user.id);
    } catch (error) {
      // Świeży stos, do którego nic nie doleciało, nie może zostać na mapie.
      await sweepEmptyPile(deps, campaignId, pile.card.id);
      throw error;
    }
    const entry: InventoryMoveEntry = {
      kind: 'give',
      fromCharacterId: from.id,
      fromName: from.name,
      toCharacterId: pile.card.id,
      toName: tokenTableName(pile.token, pile.token.name),
      toOwnerId: null,
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
      [from.ownerId],
      from.ownerId,
    );
    return { tokenId: pile.token.id, messageId: message.id };
  },
});
