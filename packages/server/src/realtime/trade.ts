import { randomBytes } from 'node:crypto';
import type {
  CpredCharacterData,
  CpredItemRef,
  InventoryMoveEntry,
  SessionUser,
  TradeAcceptPayload,
  TradeCancelPayload,
  TradeInvitePayload,
  TradeListResult,
  TradeOfferPayload,
  TradePartnersPayload,
  TradePartnersResult,
  TradePartnerView,
  TradeRespondPayload,
  TradeSideState,
  TradeState,
  TradeUpdateBroadcast,
  TradeView,
} from '@vtt/shared';
import {
  CPRED_MELEE_REACH_M,
  ROLE_GM,
  TRADE_ITEMS_MAX,
  cpredItemLine,
  cpredOfferViews,
  cpredSwapItems,
  isTradeActive,
  isTradeReady,
  mayCancelTrade,
  mayEditTradeOffer,
  mayOperateTradeSide,
  mayViewTrade,
  mergeCharacterData,
  parseCharacterData,
  setTradeAccept,
  setTradeOffer,
  tokenTableName,
  tradeSideOf,
  tradeViewFor,
  withTradeNotice,
} from '@vtt/shared';
import type { Character, Token } from '../generated/prisma/client.js';
import type { PrismaClient } from '../db.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { requireCampaignId } from './combat.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { applyBalance } from './economy.js';
import {
  closestMetres,
  entryLines,
  findCampaignCharacter,
  metresBetweenPlaced,
  postInventoryCard,
  readEddies,
  readItemRefs,
  requireOwnCharacter,
  tokensOf,
  type PlacedToken,
} from './inventory.js';
import { deferView } from './presentation.js';
import { campaignMemberSockets } from './state.js';
import { emitTokensOfCharacter, requireCampaignToken } from './tokens.js';

/**
 * Handel (etap 38c) — dwie strony, dwa pola wymiany, dwie zgody.
 *
 * Stoi w całości na 38b: przedmiot przechodzi z karty na kartę tą samą
 * umową (wiersz jedzie w całości, pancerz przychodzi zdjęty, stos skleja się
 * po `compendiumId`), a gotówka zostawia wpis w historii przez `applyBalance`.
 * Nowe są wyłącznie negocjacje: kto co położył w polu wymiany i kto się na to
 * zgodził. Reguły tego stanu mieszkają w `shared/src/trade.ts`.
 *
 * **Stan handlu jest w pamięci serwera, nie w bazie** — i to jest decyzja, nie
 * skrót. Otwarte negocjacje nie są faktem świata gry: nic się nie wydarzyło,
 * dopóki obie strony się nie zgodziły, a restart serwera zamyka je tak samo
 * jak zamknięcie stołu. Faktem staje się dopiero wykonana wymiana — i ta
 * zapisuje się w kartach, w historii eurodolców i na czacie. Skala projektu
 * (jedna sesja, kilku graczy) nie potrzebuje niczego więcej.
 *
 * Zasięg: `CPRED_MELEE_REACH_M` jak w 38b, mierzony przy zaproszeniu, przy
 * jego przyjęciu i przy wykonaniu. Gdy karty nie stoją na żadnej wspólnej
 * scenie, warunku nie ma (przerwa między scenami).
 */

const trades = new Map<string, TradeState>();
/** Handle w trakcie zapisu — drugi klik „Zgoda" nie może wykonać wymiany drugi raz. */
const executing = new Set<string>();

/** Ile możliwych partnerów pokazuje lista — tyle co źródeł łupu w 38b. */
const PARTNERS_MAX = 12;

/* ------------------------------------------------------------------ *
 * Wspólne pytania
 * ------------------------------------------------------------------ */

function activeTradeOf(campaignId: string, characterId: string): TradeState | undefined {
  for (const trade of trades.values()) {
    if (trade.campaignId !== campaignId || !isTradeActive(trade)) continue;
    if (trade.sides.some((side) => side.characterId === characterId)) return trade;
  }
  return undefined;
}

function requireTrade(campaignId: string, user: SessionUser, tradeId: unknown): TradeState {
  if (typeof tradeId !== 'string' || tradeId.length === 0) throw new RealtimeError('BAD_REQUEST');
  const trade = trades.get(tradeId);
  // Handel, którego ten użytkownik nie widzi, dla niego nie istnieje.
  if (!trade || trade.campaignId !== campaignId || !mayViewTrade(trade, user.id, isGmUser(user))) {
    throw new RealtimeError('TRADE_NOT_FOUND');
  }
  return trade;
}

function isGmUser(user: SessionUser): boolean {
  return user.role === ROLE_GM;
}

/**
 * Nazwa karty przy stole: gracz występuje pod nazwą karty, NPC — pod nazwą
 * swojej figury, przepuszczoną przez alias (`tokenTableName`, umowa `czat`).
 * Figura z tej samej sceny co druga strona ma pierwszeństwo, bo tę widać.
 */
async function tableNameOf(
  prisma: PrismaClient,
  card: Character,
  preferred: Token | null,
  nearSceneIds: ReadonlySet<string>,
): Promise<string> {
  if (card.ownerId !== null) return card.name;
  if (preferred) return tokenTableName(preferred, preferred.name);
  const placed = await tokensOf(prisma, card.id);
  const pick = placed.find((entry) => nearSceneIds.has(entry.scene.id)) ?? placed[0];
  return pick ? tokenTableName(pick.token, pick.token.name) : card.name;
}

async function requireReach(prisma: PrismaClient, aId: string, bId: string): Promise<void> {
  const metres = await closestMetres(prisma, aId, bId);
  if (metres !== null && metres > CPRED_MELEE_REACH_M) throw new RealtimeError('OUT_OF_REACH');
}

/* ------------------------------------------------------------------ *
 * Rozsyłanie
 * ------------------------------------------------------------------ */

/**
 * Każdy, kto ma prawo widzieć handel, dostaje **własny** przycięty widok:
 * gracz nie poznaje `characterId` karty NPC-a, a „moje pole" jest moje tylko
 * u tego, kto je prowadzi. Odkładane za emisje kart (`deferView`), żeby
 * „wymienione" nie przyszło przed kartą, na której to widać.
 */
async function emitTrade(deps: RealtimeDeps, trade: TradeState): Promise<void> {
  if (deferView(deps, (ready) => emitTrade(ready, trade))) return;
  const sockets = await campaignMemberSockets(deps.io, trade.campaignId);
  for (const socket of sockets) {
    const viewer = (socket.data as { user: SessionUser }).user;
    const isGm = isGmUser(viewer);
    if (!mayViewTrade(trade, viewer.id, isGm)) continue;
    const payload: TradeUpdateBroadcast = { trade: tradeViewFor(trade, viewer.id, isGm) };
    socket.emit('trade:update', payload);
  }
}

function store(trade: TradeState): TradeState {
  if (isTradeActive(trade)) trades.set(trade.id, trade);
  else trades.delete(trade.id);
  return trade;
}

/* ------------------------------------------------------------------ *
 * trade:partners — z kim mogę teraz handlować
 * ------------------------------------------------------------------ */

export const tradePartnersEvent = defineEvent<TradePartnersPayload, TradePartnersResult>({
  name: 'trade:partners',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const isGm = isGmUser(user);
    const anchor = await requireOwnCharacter(prisma, campaignId, user, payload?.characterId);
    // MG handluje za NPC-a, nigdy za gracza — rozstrzygnięcie 3 w `shared/trade.ts`.
    if (anchor.ownerId !== null && anchor.ownerId !== user.id) throw new RealtimeError('NOT_YOURS');
    const operates = (card: Character) => (card.ownerId === null ? isGm : card.ownerId === user.id);

    const found = new Map<string, TradePartnerView & { metres?: number }>();
    const mine = await tokensOf(prisma, anchor.id);
    for (const stand of mine) {
      const neighbours = await prisma.token.findMany({
        where: {
          sceneId: stand.scene.id,
          characterId: { not: null },
          id: { not: stand.token.id },
        },
      });
      for (const token of neighbours) {
        if (!token.characterId || token.characterId === anchor.id) continue;
        if (!isGm && token.hidden) continue;
        const placed: PlacedToken = { token, scene: stand.scene };
        const metres = metresBetweenPlaced(stand, placed);
        if (metres > CPRED_MELEE_REACH_M) continue;
        const known = found.get(token.characterId);
        if (known && (known.metres ?? Infinity) <= metres) continue;
        const card = await prisma.character.findUnique({ where: { id: token.characterId } });
        if (!card || card.campaignId !== campaignId || operates(card)) continue;
        found.set(card.id, {
          tokenId: token.id,
          // Id karty NPC-a gracz poznawać nie ma; kartę gracza zna z listy celów 38b.
          ...(isGm || card.ownerId !== null ? { characterId: card.id } : {}),
          name: card.ownerId !== null ? card.name : tokenTableName(token, token.name),
          metres,
        });
      }
    }

    // Poza sceną: karty graczy, z którymi nie ma wspólnej sceny — warunku
    // zasięgu wtedy nie ma (tak jak przy przekazaniu z 38b). NPC-a poza sceną
    // gracz nie zobaczy; MG handluje NPC-em wyłącznie z graczami.
    const players = await prisma.character.findMany({
      where: { campaignId, ownerId: { not: null }, id: { not: anchor.id } },
      orderBy: { name: 'asc' },
    });
    for (const card of players) {
      if (found.has(card.id) || operates(card)) continue;
      if ((await closestMetres(prisma, anchor.id, card.id)) !== null) continue;
      found.set(card.id, { characterId: card.id, name: card.name });
    }

    const partners = [...found.values()]
      .sort(
        (a, b) =>
          (a.metres ?? Infinity) - (b.metres ?? Infinity) || a.name.localeCompare(b.name, 'pl'),
      )
      .slice(0, PARTNERS_MAX);
    return { partners };
  },
});

/* ------------------------------------------------------------------ *
 * trade:invite — „pohandlujmy"
 * ------------------------------------------------------------------ */

export const tradeInviteEvent = defineEvent<TradeInvitePayload, { trade: TradeView }>({
  name: 'trade:invite',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const isGm = isGmUser(user);
    const from = await requireOwnCharacter(prisma, campaignId, user, payload?.fromCharacterId);
    if (from.ownerId !== null && from.ownerId !== user.id) throw new RealtimeError('NOT_YOURS');

    let to: Character;
    let toToken: Token | null = null;
    if (typeof payload?.toTokenId === 'string' && payload.toTokenId.length > 0) {
      const { token } = await requireCampaignToken(prisma, campaignId, payload.toTokenId);
      if (!isGm && token.hidden) throw new RealtimeError('TOKEN_NOT_FOUND');
      if (!token.characterId) throw new RealtimeError('NO_SHEET');
      to = await findCampaignCharacter(prisma, campaignId, token.characterId);
      toToken = token;
    } else {
      to = await findCampaignCharacter(prisma, campaignId, payload?.toCharacterId);
      // NPC-a gracz wskazuje wyłącznie figurą — id jego karty nie zna i nie ma znać.
      if (!isGm && to.ownerId === null) throw new RealtimeError('CHARACTER_NOT_FOUND');
    }
    if (to.id === from.id) throw new RealtimeError('BAD_REQUEST');

    const toOperatedByMe = to.ownerId === null ? isGm : to.ownerId === user.id;
    if (toOperatedByMe) throw new RealtimeError('SAME_OPERATOR');
    const busy = () => activeTradeOf(campaignId, from.id) ?? activeTradeOf(campaignId, to.id);
    if (busy()) throw new RealtimeError('CHARACTER_BUSY');

    await requireReach(prisma, from.id, to.id);

    const fromScenes = new Set((await tokensOf(prisma, from.id)).map((entry) => entry.scene.id));
    const toScenes = new Set((await tokensOf(prisma, to.id)).map((entry) => entry.scene.id));
    const fromName = await tableNameOf(prisma, from, null, toScenes);
    const toName = await tableNameOf(prisma, to, toToken, fromScenes);

    // Sprawdzane PO ostatnim `await` — inaczej dwa zaproszenia w tej samej
    // chwili przeszłyby oba i jedna karta handlowałaby na dwa fronty.
    if (busy()) throw new RealtimeError('CHARACTER_BUSY');

    const side = (card: Character, name: string): TradeSideState => ({
      characterId: card.id,
      name,
      ownerId: card.ownerId,
      items: [],
      views: [],
      eddies: 0,
      accepted: false,
    });
    const trade = store({
      id: randomBytes(8).toString('hex'),
      campaignId,
      status: 'invited',
      version: 1,
      sides: [side(from, fromName), side(to, toName)],
    });
    await emitTrade(deps, trade);
    return { trade: tradeViewFor(trade, user.id, isGm) };
  },
});

/* ------------------------------------------------------------------ *
 * trade:respond — zaproszony przyjmuje albo odrzuca
 * ------------------------------------------------------------------ */

export const tradeRespondEvent = defineEvent<TradeRespondPayload, void>({
  name: 'trade:respond',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const isGm = isGmUser(user);
    const trade = requireTrade(campaignId, user, payload?.tradeId);
    if (trade.status !== 'invited') throw new RealtimeError('TRADE_NOT_OPEN');
    const invitee = mayOperateTradeSide(trade.sides[1], user.id, isGm);

    if (payload?.accept !== true) {
      if (!invitee && !mayCancelTrade(trade, user.id, isGm)) throw new RealtimeError('NOT_YOURS');
      await emitTrade(deps, store({ ...trade, status: 'cancelled', closedBy: user.name }));
      return;
    }

    if (!invitee) throw new RealtimeError('NOT_YOURS');
    await requireReach(deps.ctx.prisma, trade.sides[0].characterId, trade.sides[1].characterId);
    const current = trades.get(trade.id);
    if (!current || current.status !== 'invited') throw new RealtimeError('TRADE_NOT_OPEN');
    await emitTrade(deps, store({ ...current, status: 'open' }));
  },
});

/* ------------------------------------------------------------------ *
 * trade:offer — nowa zawartość własnego pola wymiany
 * ------------------------------------------------------------------ */

export const tradeOfferEvent = defineEvent<TradeOfferPayload, void>({
  name: 'trade:offer',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const isGm = isGmUser(user);
    const trade = requireTrade(campaignId, user, payload?.tradeId);
    const sideIndex = tradeSideOf(trade, user.id, isGm);
    if (sideIndex === null) throw new RealtimeError('NOT_YOURS');
    // Etap 46a: zapraszający kładzie rzeczy w swoje pole od razu, zaproszony —
    // po „Przyjmij” (rozstrzygnięcie 1 w `shared/trade.ts`).
    if (!mayEditTradeOffer(trade, sideIndex)) throw new RealtimeError('TRADE_NOT_OPEN');
    if (executing.has(trade.id)) throw new RealtimeError('TRADE_BUSY');

    const items = readItemRefs(payload?.items, true);
    if (items.length > TRADE_ITEMS_MAX) throw new RealtimeError('BAD_REQUEST');
    const eddies = readEddies(payload?.eddies);

    const card = await findCampaignCharacter(
      deps.ctx.prisma,
      campaignId,
      trade.sides[sideIndex].characterId,
    );
    const data = parseCharacterData(card.data, deps.ctx.cpred);
    if (eddies > data.eddies) throw new RealtimeError('NOT_ENOUGH_EDDIES');
    const offer = cpredOfferViews(data, items);
    if (!offer.ok) throw new RealtimeError(offer.error);

    const current = trades.get(trade.id);
    if (!current || !mayEditTradeOffer(current, sideIndex)) {
      throw new RealtimeError('TRADE_NOT_OPEN');
    }
    if (executing.has(trade.id)) throw new RealtimeError('TRADE_BUSY');
    await emitTrade(
      deps,
      store(setTradeOffer(current, sideIndex, { items: offer.refs, views: offer.views, eddies })),
    );
  },
});

/* ------------------------------------------------------------------ *
 * trade:accept — zgoda (albo jej cofnięcie); dwie zgody wykonują wymianę
 * ------------------------------------------------------------------ */

export const tradeAcceptEvent = defineEvent<TradeAcceptPayload, void>({
  name: 'trade:accept',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const isGm = isGmUser(user);
    const trade = requireTrade(campaignId, user, payload?.tradeId);
    const sideIndex = tradeSideOf(trade, user.id, isGm);
    if (sideIndex === null) throw new RealtimeError('NOT_YOURS');
    if (executing.has(trade.id)) throw new RealtimeError('TRADE_BUSY');
    const version = payload?.version;
    if (typeof version !== 'number' || !Number.isInteger(version)) {
      throw new RealtimeError('BAD_REQUEST');
    }

    const next = setTradeAccept(trade, sideIndex, payload?.accepted === true, version);
    if (!next.ok) throw new RealtimeError(next.error);
    store(next.trade);
    if (!isTradeReady(next.trade)) {
      await emitTrade(deps, next.trade);
      return;
    }

    // Od tej chwili handel jest zamknięty dla zmian — synchronicznie, przed
    // pierwszym `await`, bo drugi klik może przyjść w tej samej pętli zdarzeń.
    executing.add(trade.id);
    try {
      await executeTrade(deps, next.trade, user);
    } catch (error) {
      // Odmowy z `refuse`/`cancelWith` zostawiły już stan i powód. Każdy inny
      // błąd (baza, transakcja) zdejmuje zgody — inaczej handel zostałby
      // „gotowy", a następne kliknięcie próbowałoby go wykonać po cichu.
      if (!(error instanceof RealtimeError)) {
        const current = trades.get(trade.id);
        if (current) await emitTrade(deps, store(withTradeNotice(current, 'TRADE_FAILED')));
      }
      throw error;
    } finally {
      executing.delete(trade.id);
    }
  },
});

/**
 * Odmowa w chwili wykonania: zgody przepadają, powód widzą obie strony,
 * a klikający dostaje go jeszcze w odpowiedzi.
 */
async function refuse(deps: RealtimeDeps, trade: TradeState, code: string): Promise<never> {
  await emitTrade(deps, store(withTradeNotice(trade, code)));
  throw new RealtimeError(code);
}

async function cancelWith(
  deps: RealtimeDeps,
  trade: TradeState,
  code: string,
  byName: string,
): Promise<never> {
  await emitTrade(deps, store({ ...trade, status: 'cancelled', closedBy: byName, notice: code }));
  throw new RealtimeError(code);
}

function sameViews(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Wymiana: obie karty, gotówka w obie strony, jedna transakcja.
 *
 * Wszystko, na co strony się zgodziły, sprawdza się jeszcze raz **z kart
 * w bazie** — od zgody do wykonania ktoś mógł zużyć stimpak z pola wymiany
 * albo wystrzelić z oferowanej broni. Rzecz, która wygląda inaczej niż
 * w chwili zgody, zdejmuje zgody (`OFFER_STALE`) zamiast pojechać w nowym
 * stanie: druga strona zgadzała się na magazynek 12/30, nie 11/30.
 */
async function executeTrade(
  deps: RealtimeDeps,
  trade: TradeState,
  user: SessionUser,
): Promise<void> {
  const prisma = deps.ctx.prisma;
  const campaignId = trade.campaignId;
  const [sideA, sideB] = trade.sides;

  const cardA = await prisma.character.findUnique({ where: { id: sideA.characterId } });
  const cardB = await prisma.character.findUnique({ where: { id: sideB.characterId } });
  if (!cardA || !cardB || cardA.campaignId !== campaignId || cardB.campaignId !== campaignId) {
    return cancelWith(deps, trade, 'CHARACTER_NOT_FOUND', user.name);
  }
  // Karta zmieniła właściciela w trakcie — ktoś inny niż ten, kto negocjował,
  // zgodziłby się tu za nią.
  if (cardA.ownerId !== sideA.ownerId || cardB.ownerId !== sideB.ownerId) {
    return cancelWith(deps, trade, 'OWNER_CHANGED', user.name);
  }

  const metres = await closestMetres(prisma, cardA.id, cardB.id);
  if (metres !== null && metres > CPRED_MELEE_REACH_M) return refuse(deps, trade, 'OUT_OF_REACH');

  const registry = deps.ctx.cpred;
  const dataA = parseCharacterData(cardA.data, registry);
  const dataB = parseCharacterData(cardB.data, registry);
  const refsA = sideA.items as CpredItemRef[];
  const refsB = sideB.items as CpredItemRef[];
  const offerA = cpredOfferViews(dataA, refsA);
  const offerB = cpredOfferViews(dataB, refsB);
  if (
    !offerA.ok ||
    !offerB.ok ||
    !sameViews(offerA.views, sideA.views) ||
    !sameViews(offerB.views, sideB.views)
  ) {
    return refuse(deps, trade, 'OFFER_STALE');
  }
  if (sideA.eddies > dataA.eddies || sideB.eddies > dataB.eddies) {
    return refuse(deps, trade, 'NOT_ENOUGH_EDDIES');
  }

  const swap = cpredSwapItems(dataA, dataB, refsA, refsB);
  if (!swap.ok) return refuse(deps, trade, swap.error);

  const nextA = mergeCharacterData(dataA, {
    weapons: swap.result.a.weapons,
    armor: swap.result.a.armor,
    gear: swap.result.a.gear,
  });
  const nextB = mergeCharacterData(dataB, {
    weapons: swap.result.b.weapons,
    armor: swap.result.b.armor,
    gear: swap.result.b.gear,
  });

  // Obie karty i wszystkie wpisy historii w JEDNEJ transakcji: przedmiot,
  // który zniknął z jednej karty i nie pojawił się na drugiej, jest gorszy
  // niż handel, który się nie udał (ta sama zasada, co `cpredMoveItems`).
  await prisma.$transaction(async (tx) => {
    const write = async (
      card: Character,
      data: CpredCharacterData,
      paid: number,
      received: number,
      other: Character,
      otherName: string,
    ) => {
      let current = data;
      const flows = [
        { amount: -paid, label: `handel: do ${otherName}` },
        { amount: received, label: `handel: od ${otherName}` },
      ].filter((flow) => flow.amount !== 0);
      for (const flow of flows) {
        current = await applyBalance(
          deps,
          campaignId,
          card,
          current,
          { kind: 'transfer', amount: flow.amount, label: flow.label, counterpartyId: other.id },
          user.id,
          { tx, emit: false },
        );
      }
      if (flows.length === 0) {
        await tx.character.update({
          where: { id: card.id },
          data: { data: JSON.stringify(current) },
        });
      }
    };
    await write(cardA, nextA, sideA.eddies, sideB.eddies, cardB, sideB.name);
    await write(cardB, nextB, sideB.eddies, sideA.eddies, cardA, sideA.name);
  });

  for (const id of [cardA.id, cardB.id]) {
    const saved = await prisma.character.findUniqueOrThrow({ where: { id } });
    await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, registry));
    // Karta jest źródłem prawdy żetonu (etap 08) — podniesiony pancerz
    // i oddana broń zmieniają to, co figura pokazuje.
    await emitTokensOfCharacter(deps, campaignId, saved);
  }

  const entry: InventoryMoveEntry = {
    kind: 'trade',
    fromCharacterId: cardA.id,
    fromName: sideA.name,
    toCharacterId: cardB.id,
    toName: sideB.name,
    toOwnerId: cardB.ownerId,
    actorName: user.name,
    lines: tradeLines(swap.result.fromA.map(cpredItemLine), sideA.eddies),
    returnLines: tradeLines(swap.result.fromB.map(cpredItemLine), sideB.eddies),
    ...(sideA.eddies > 0 ? { eddies: sideA.eddies } : {}),
    system: {},
    resolution: { kind: 'accepted', byName: user.name },
  };
  await postInventoryCard(
    deps,
    campaignId,
    user,
    entry,
    [cardA.ownerId, cardB.ownerId],
    cardA.ownerId,
  );
  await emitTrade(deps, store({ ...trade, status: 'done', closedBy: user.name }));
}

/** Linijki jednej strony handlu; pusta strona mówi to wprost. */
function tradeLines(items: string[], eddies: number): string[] {
  const lines = entryLines([], eddies);
  const all = [...items, ...lines];
  return all.length > 0 ? all : ['nic'];
}

/* ------------------------------------------------------------------ *
 * trade:cancel i trade:list
 * ------------------------------------------------------------------ */

export const tradeCancelEvent = defineEvent<TradeCancelPayload, void>({
  name: 'trade:cancel',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const trade = requireTrade(campaignId, user, payload?.tradeId);
    if (!mayCancelTrade(trade, user.id, isGmUser(user))) throw new RealtimeError('TRADE_NOT_OPEN');
    if (executing.has(trade.id)) throw new RealtimeError('TRADE_BUSY');
    await emitTrade(deps, store({ ...trade, status: 'cancelled', closedBy: user.name }));
  },
});

/** Otwarte handle, które ten użytkownik widzi — po przeładowaniu strony i po powrocie. */
export const tradeListEvent = defineEvent<void, TradeListResult>({
  name: 'trade:list',
  handler: ({ socket, user }) => {
    const campaignId = requireCampaignId(socket.data);
    const isGm = isGmUser(user);
    const list: TradeView[] = [];
    for (const trade of trades.values()) {
      if (trade.campaignId !== campaignId || !isTradeActive(trade)) continue;
      if (!mayViewTrade(trade, user.id, isGm)) continue;
      list.push(tradeViewFor(trade, user.id, isGm));
    }
    return { trades: list };
  },
});
