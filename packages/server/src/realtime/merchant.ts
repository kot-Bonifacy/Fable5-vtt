import type {
  CatalogShoppingBroadcast,
  CatalogShoppingPayload,
  CpredCharacterData,
  CpredItemRef,
  CpredMerchantBuyLine,
  CpredPriceContext,
  InventoryMoveEntry,
  MerchantClosedReason,
  MerchantConfigPayload,
  MerchantConfigResult,
  MerchantDealPayload,
  MerchantDealResult,
  MerchantGoneBroadcast,
  MerchantListItem,
  MerchantListResult,
  MerchantRowOverlays,
  MerchantRowPayload,
  MerchantSettings,
  MerchantShelfRowView,
  MerchantShopsBroadcast,
  MerchantUpdateBroadcast,
  MerchantView,
  MerchantViewPayload,
  MerchantViewResult,
  SessionUser,
  TokenCondition,
} from '@vtt/shared';
import {
  CPRED_MELEE_REACH_M,
  INVENTORY_ITEMS_MAX,
  ROLE_GM,
  cpredItemLine,
  cpredMerchantDeal,
  cpredMerchantShelf,
  cpredSheetHpMax,
  entryPrice,
  isCatalogShopping,
  isCpredItemList,
  isMerchantAccess,
  merchantClosedReason,
  merchantRowKey,
  mergeCharacterData,
  parseCharacterData,
  pruneMerchantRows,
  readCatalogShopping,
  readMerchantRowOverlay,
  readMerchantRows,
  readMerchantSettingsPatch,
  tokenCondition,
  tokenTableName,
} from '@vtt/shared';
import type { Character, Merchant, Prisma } from '../generated/prisma/client.js';
import type { PrismaClient } from '../db.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { sheetIsContainer } from '../sheets.js';
import { requireCampaignId } from './combat.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { fetchCustomEntries } from './compendium.js';
import { applyBalance } from './economy.js';
import {
  conditionsOf,
  findCampaignCharacter,
  metresBetweenPlaced,
  postInventoryCard,
  readItemRefs,
  requireOwnCharacter,
  searchableCondition,
  type PlacedToken,
} from './inventory.js';
import {
  isWatchingMerchant,
  setMerchantCardRefresher,
  unwatchMerchant,
  watchMerchant,
} from './merchant-watch.js';
import { campaignMemberSockets, campaignRoom } from './state.js';
import { emitTokensOfCharacter } from './tokens.js';

/**
 * Handlarze (etap 46a, wzór: *Merchant* z Item Piles).
 *
 * Sklep to karta NPC-a z ustawieniami w tabeli `Merchant`; towarem jest jej
 * ekwipunek. Gracz kupuje i sprzedaje **od ręki**, gdy sklep jest otwarty —
 * bez zgody MG (decyzja 4), także w grze solo z botami. Ceny i przenoszenie
 * liczy czysta funkcja `cpredMerchantDeal`; ten plik pilnuje praw (kto widzi
 * półkę, zasięg, sesja), zapisu w jednej transakcji i rozsyłania.
 *
 * Trzy zasady, których pilnuje:
 *
 *  - **ukryty towar i id karty handlarza nie opuszczają serwera** — półka jest
 *    przycinana per widz (`merchantViewFor`), a uchwytem jest `Merchant.id`;
 *  - **dwa zakupy ostatniej sztuki dają jedną sprzedaż** — transakcje sklepów
 *    kampanii idą jedna po drugiej (`withCampaignLock`), a karty czyta się
 *    wewnątrz `$transaction`;
 *  - **klient wysyła sumę, którą pokazał** — inna suma po stronie serwera to
 *    `QUOTE_CHANGED` (wzór: `OFFER_STALE` z 38c), nigdy cicha zmiana ceny.
 */

/* ------------------------------------------------------------------ *
 * Odczyt sklepu
 * ------------------------------------------------------------------ */

type Db = PrismaClient | Prisma.TransactionClient;

function isGmUser(user: SessionUser): boolean {
  return user.role === ROLE_GM;
}

export function merchantSettingsOf(row: Merchant): MerchantSettings {
  return {
    sign: row.sign,
    open: row.open,
    access: isMerchantAccess(row.access) ? row.access : 'reach',
    betweenSessions: row.betweenSessions,
    priceMul: row.priceMul,
    buyBackPct: row.buyBackPct,
    cashInfinite: row.cashInfinite,
  };
}

/**
 * Ceny katalogu kampanii: własne wpisy MG wygrywają z plikami (ta sama reguła
 * co `campaignEntry`), cena to liczba z tabeli albo pasmo (`entryPrice`).
 */
export async function priceContextFor(
  deps: RealtimeDeps,
  campaignId: string,
): Promise<CpredPriceContext> {
  const custom = await fetchCustomEntries(deps.ctx.prisma, campaignId);
  const byId = new Map(custom.map((entry) => [entry.id, entry]));
  return {
    priceOf: (id) => {
      const entry = byId.get(id) ?? deps.ctx.compendium.entryById.get(id);
      return entry ? entryPrice(entry) : null;
    },
  };
}

async function placedTokens(db: Db, characterId: string): Promise<PlacedToken[]> {
  const rows = await db.token.findMany({ where: { characterId }, include: { scene: true } });
  return rows.map((row) => {
    const { scene, ...token } = row;
    return { token, scene };
  });
}

/** Sklep z kartą, figurami i stanem handlarza — wszystko, o co pytają zdarzenia. */
interface LoadedMerchant {
  row: Merchant;
  settings: MerchantSettings;
  overlays: MerchantRowOverlays;
  card: Character;
  data: CpredCharacterData;
  placed: PlacedToken[];
  closed: MerchantClosedReason | null;
  /** Szyld albo nazwa figury przy stole (alias, umowa `czat`). */
  name: string;
}

/**
 * Stan handlarza: gorsze z tego, co mówią jego figury — a sklep zdalny bez
 * figury z samych punktów życia. Ta sama arytmetyka, którą łup rozstrzyga
 * „leży albo nie żyje”, więc martwy handlarz jest w tej samej chwili
 * zamkniętym sklepem i ciałem do przeszukania.
 */
function keeperCondition(
  deps: RealtimeDeps,
  data: CpredCharacterData,
  placed: PlacedToken[],
): TokenCondition {
  const conditions = conditionsOf(deps.ctx.statuses.list);
  if (placed.length === 0) {
    return tokenCondition(
      { statuses: [], hp: { current: data.hpCurrent, max: cpredSheetHpMax(data) } },
      conditions,
    );
  }
  const order: TokenCondition[] = ['ok', 'wounded', 'down', 'dead'];
  let worst: TokenCondition = 'ok';
  for (const stand of placed) {
    const condition = searchableCondition(stand.token, data, conditions);
    if (order.indexOf(condition) > order.indexOf(worst)) worst = condition;
  }
  return worst;
}

async function loadMerchant(
  deps: RealtimeDeps,
  row: Merchant,
  db: Db = deps.ctx.prisma,
): Promise<LoadedMerchant> {
  const card = await db.character.findUnique({ where: { id: row.characterId } });
  if (!card) throw new RealtimeError('MERCHANT_NOT_FOUND');
  const data = parseCharacterData(card.data, deps.ctx.cpred);
  const placed = await placedTokens(db, card.id);
  const settings = merchantSettingsOf(row);
  const figure = placed[0]?.token;
  return {
    row,
    settings,
    overlays: readMerchantRows(row.rows),
    card,
    data,
    placed,
    closed: merchantClosedReason(settings, keeperCondition(deps, data, placed)),
    name: settings.sign || (figure ? tokenTableName(figure, figure.name) : card.name),
  };
}

async function requireMerchantRow(
  db: Db,
  campaignId: string,
  merchantId: unknown,
): Promise<Merchant> {
  if (typeof merchantId !== 'string' || merchantId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const row = await db.merchant.findUnique({ where: { id: merchantId } });
  // Sklep innej kampanii nie istnieje — ten sam kod co sklep, którego nie ma.
  if (!row || row.campaignId !== campaignId) throw new RealtimeError('MERCHANT_NOT_FOUND');
  return row;
}

/* ------------------------------------------------------------------ *
 * Kto widzi który sklep
 * ------------------------------------------------------------------ */

/** Co patrzący wie o sobie: rola, czy siedzi przy stole i gdzie stoją jego figury. */
interface Viewer {
  user: SessionUser;
  isGm: boolean;
  /** Gracz między sesjami siedzi w poczekalni (44c); MG zawsze przy stole. */
  atTable: boolean;
}

function viewerOf(socket: { data: { user: SessionUser; atTable?: boolean } }): Viewer {
  const user = socket.data.user;
  return { user, isGm: isGmUser(user), atTable: socket.data.atTable === true };
}

/** Sceny, na których stoją figury kart tego gracza. */
async function playerSceneIds(db: Db, campaignId: string, userId: string): Promise<Set<string>> {
  const tokens = await db.token.findMany({
    where: { character: { campaignId, ownerId: userId } },
    select: { sceneId: true },
  });
  return new Set(tokens.map((token) => token.sceneId));
}

/**
 * Czy gracz może otworzyć półkę. Między sesjami — wyłącznie sklep oznaczony
 * przez MG (decyzja 9, bez mapy i zasięgu). Przy stole: zdalny zawsze (zamknięty
 * pokaże „Zamknięte”), przy figurze — gdy handlarz stoi jawnie na scenie,
 * na której stoi któraś z figur gracza. Odmowa to `MERCHANT_NOT_FOUND`:
 * sklepu, do którego nie ma się dostępu, nie ma.
 */
async function mayOpenMerchant(db: Db, viewer: Viewer, merchant: LoadedMerchant): Promise<boolean> {
  if (viewer.isGm) return true;
  if (!viewer.atTable) return merchant.settings.betweenSessions;
  if (merchant.settings.access === 'remote') return true;
  const scenes = await playerSceneIds(db, merchant.row.campaignId, viewer.user.id);
  return merchant.placed.some((stand) => !stand.token.hidden && scenes.has(stand.scene.id));
}

/**
 * Odmowa dla zdarzeń gracza na konkretnym sklepie. Między sesjami sklep bez
 * znacznika MG mówi wprost `SESSION_NOT_RUNNING` (jak każde zdarzenie stołu
 * poza białą listą), reszta braku dostępu — `MERCHANT_NOT_FOUND`.
 */
async function requireMerchantAccess(
  db: Db,
  viewer: Viewer,
  merchant: LoadedMerchant,
): Promise<void> {
  if (!viewer.isGm && !viewer.atTable && !merchant.settings.betweenSessions) {
    throw new RealtimeError('SESSION_NOT_RUNNING');
  }
  if (!(await mayOpenMerchant(db, viewer, merchant))) {
    throw new RealtimeError('MERCHANT_NOT_FOUND');
  }
}

/** Pozycja doku: gracz przy stole widzi zdalne otwarte, między sesjami — oznaczone. */
function listedFor(viewer: Viewer, merchant: LoadedMerchant): boolean {
  if (viewer.isGm) return true;
  if (merchant.closed !== null) return false;
  if (!viewer.atTable) return merchant.settings.betweenSessions;
  return merchant.settings.access === 'remote';
}

function listItemFor(viewer: Viewer, merchant: LoadedMerchant): MerchantListItem {
  return {
    id: merchant.row.id,
    name: merchant.name,
    access: merchant.settings.access,
    ...(merchant.closed ? { closed: merchant.closed } : {}),
    betweenSessions: merchant.settings.betweenSessions,
    ...(viewer.isGm ? { open: merchant.settings.open, characterId: merchant.card.id } : {}),
  };
}

/**
 * Półka dla jednego patrzącego. Gracz nie dostaje ukrytych wierszy, wierszy
 * bez ceny, ceny wpisanej ręką ani id karty — składane jawnie pole po polu,
 * żeby nowe pole wiersza nie pojechało do gracza samo.
 */
export function merchantViewFor(
  merchant: LoadedMerchant,
  ctx: CpredPriceContext,
  isGm: boolean,
): MerchantView {
  const rows: MerchantShelfRowView[] = cpredMerchantShelf(
    merchant.data,
    merchant.overlays,
    merchant.settings.priceMul,
    ctx,
    { forGm: isGm },
  ).map((row) => ({
    list: row.list,
    rowId: row.rowId,
    name: row.name,
    detail: row.detail,
    qty: row.qty,
    stackable: row.stackable,
    ...(row.compendiumId ? { compendiumId: row.compendiumId } : {}),
    ...(row.armorLocation ? { armorLocation: row.armorLocation } : {}),
    price: row.price,
    infinite: row.infinite,
    ...(isGm ? { hidden: row.hidden } : {}),
    ...(isGm && row.priceOverride !== undefined ? { priceOverride: row.priceOverride } : {}),
  }));
  return {
    id: merchant.row.id,
    name: merchant.name,
    access: merchant.settings.access,
    ...(merchant.closed ? { closed: merchant.closed } : {}),
    betweenSessions: merchant.settings.betweenSessions,
    priceMul: merchant.settings.priceMul,
    buyBackPct: merchant.settings.buyBackPct,
    cash: merchant.settings.cashInfinite ? null : merchant.data.eddies,
    rows,
    ...(isGm ? { characterId: merchant.card.id, settings: merchant.settings } : {}),
  };
}

/* ------------------------------------------------------------------ *
 * Rozsyłanie
 * ------------------------------------------------------------------ */

/**
 * Półka po zmianie — każdemu, kto ją ogląda, w jego własnym przycięciu. Kto
 * stracił prawo (MG zamknął sklep zdalny między sesjami, figura zniknęła
 * ze sceny), dostaje `merchant:gone`, a nie ostatnią półkę.
 */
export async function emitMerchantUpdate(
  deps: RealtimeDeps,
  campaignId: string,
  merchantId: string,
): Promise<void> {
  const sockets = (await campaignMemberSockets(deps.io, campaignId)).filter((socket) =>
    isWatchingMerchant(socket.id, merchantId),
  );
  if (sockets.length === 0) return;
  const row = await deps.ctx.prisma.merchant.findUnique({ where: { id: merchantId } });
  const merchant = row ? await loadMerchant(deps, row).catch(() => null) : null;
  const ctx = await priceContextFor(deps, campaignId);
  for (const socket of sockets) {
    const viewer = viewerOf(socket as never);
    if (!merchant || !(await mayOpenMerchant(deps.ctx.prisma, viewer, merchant))) {
      unwatchMerchant(socket.id, merchantId);
      const gone: MerchantGoneBroadcast = { merchantId };
      socket.emit('merchant:gone', gone);
      continue;
    }
    const payload: MerchantUpdateBroadcast = {
      merchant: merchantViewFor(merchant, ctx, viewer.isGm),
    };
    socket.emit('merchant:update', payload);
  }
}

async function merchantListFor(deps: RealtimeDeps, campaignId: string, viewer: Viewer) {
  const rows = await deps.ctx.prisma.merchant.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
  });
  const list: MerchantListItem[] = [];
  for (const row of rows) {
    const merchant = await loadMerchant(deps, row).catch(() => null);
    if (merchant && listedFor(viewer, merchant)) list.push(listItemFor(viewer, merchant));
  }
  return list;
}

/** Lista sklepów dla doku — każdemu członkowi kampanii jego własna, po zmianie ustawień. */
export async function emitMerchantShops(deps: RealtimeDeps, campaignId: string): Promise<void> {
  for (const socket of await campaignMemberSockets(deps.io, campaignId)) {
    const viewer = viewerOf(socket as never);
    const payload: MerchantShopsBroadcast = {
      merchants: await merchantListFor(deps, campaignId, viewer),
    };
    socket.emit('merchant:shops', payload);
  }
}

// Zapis karty handlarza (towar dopisany przez MG, handel, łup) odświeża półkę,
// a dok sklepów — bo handlarz, który właśnie padł (PW na karcie), zamyka sklep
// zdalny i ten ma zniknąć z „Sklepy (N)” bez czekania na zmianę ustawień (46a2).
setMerchantCardRefresher(async (deps, campaignId, characterId) => {
  const row = await deps.ctx.prisma.merchant.findUnique({ where: { characterId } });
  if (!row || row.campaignId !== campaignId) return;
  await emitMerchantUpdate(deps, campaignId, row.id);
  await emitMerchantShops(deps, campaignId);
});

/* ------------------------------------------------------------------ *
 * Kolejka transakcji
 * ------------------------------------------------------------------ */

const campaignLocks = new Map<string, Promise<unknown>>();

/**
 * Transakcje sklepów jednej kampanii jedna po drugiej. SQLite i tak pisze
 * jednym pisarzem, ale dwie transakcje, które najpierw czytają, a potem chcą
 * pisać, potrafią się nawzajem zablokować (`SQLITE_BUSY`) — a „ostatnia
 * sztuka” ma się skończyć jedną sprzedażą i `OUT_OF_STOCK`, nie awarią. Skala
 * projektu (kilku graczy) nie odczuje kolejki.
 */
async function withCampaignLock<T>(campaignId: string, run: () => Promise<T>): Promise<T> {
  const previous = campaignLocks.get(campaignId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(run);
  campaignLocks.set(campaignId, next);
  try {
    return await next;
  } finally {
    if (campaignLocks.get(campaignId) === next) campaignLocks.delete(campaignId);
  }
}

/* ------------------------------------------------------------------ *
 * merchant:list i merchant:view
 * ------------------------------------------------------------------ */

export const merchantListEvent = defineEvent<void, MerchantListResult>({
  name: 'merchant:list',
  handler: async ({ deps, socket }) => {
    const campaignId = requireCampaignId(socket.data);
    return { merchants: await merchantListFor(deps, campaignId, viewerOf(socket as never)) };
  },
});

export const merchantViewEvent = defineEvent<MerchantViewPayload, MerchantViewResult>({
  name: 'merchant:view',
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const row = await requireMerchantRow(deps.ctx.prisma, campaignId, payload?.merchantId);
    const merchant = await loadMerchant(deps, row);
    const viewer = viewerOf(socket as never);
    await requireMerchantAccess(deps.ctx.prisma, viewer, merchant);
    watchMerchant(socket.id, row.id);
    const ctx = await priceContextFor(deps, campaignId);
    return { merchant: merchantViewFor(merchant, ctx, viewer.isGm) };
  },
});

/* ------------------------------------------------------------------ *
 * merchant:deal — „Zapłać”
 * ------------------------------------------------------------------ */

/** Najwięcej sztuk jednej pozycji koszyka — powyżej to literówka, nie zakup. */
const BUY_QTY_MAX = 999;

function readBuyLines(raw: unknown): CpredMerchantBuyLine[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > INVENTORY_ITEMS_MAX) {
    throw new RealtimeError('BAD_REQUEST');
  }
  return raw.map((entry) => {
    const line = entry as Record<string, unknown> | null;
    if (typeof line !== 'object' || line === null) throw new RealtimeError('BAD_REQUEST');
    if (!isCpredItemList(line.list)) throw new RealtimeError('BAD_REQUEST');
    if (typeof line.rowId !== 'string' || line.rowId.length === 0) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const qty = line.qty;
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > BUY_QTY_MAX) {
      throw new RealtimeError('BAD_QTY');
    }
    return { list: line.list, rowId: line.rowId, qty };
  });
}

/** Najmniejsza odległość figur kupującego i handlarza na wspólnej scenie; `null` — brak sceny. */
function closestBetween(a: PlacedToken[], b: PlacedToken[]): number | null {
  let best: number | null = null;
  for (const left of a) {
    for (const right of b) {
      if (left.scene.id !== right.scene.id) continue;
      const metres = metresBetweenPlaced(left, right);
      if (best === null || metres < best) best = metres;
    }
  }
  return best;
}

/** Linijki jednej strony transakcji; pusta strona mówi to wprost. */
function dealLines(items: string[], eddies: number): string[] {
  const lines = [...items];
  if (eddies > 0) lines.push(`Gotówka: ${eddies} ed`);
  return lines.length > 0 ? lines : ['nic'];
}

export const merchantDealEvent = defineEvent<MerchantDealPayload, MerchantDealResult>({
  name: 'merchant:deal',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const viewer = viewerOf(socket as never);
    const buyer = await requireOwnCharacter(prisma, campaignId, user, payload?.characterId);
    const buy = readBuyLines(payload?.buy);
    const sell: CpredItemRef[] = readItemRefs(payload?.sell ?? [], true);
    const expectTotal = payload?.expectTotal;
    if (typeof expectTotal !== 'number' || !Number.isInteger(expectTotal)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const ctx = await priceContextFor(deps, campaignId);

    const outcome = await withCampaignLock(campaignId, () =>
      prisma.$transaction(async (tx) => {
        const row = await requireMerchantRow(tx, campaignId, payload?.merchantId);
        if (row.characterId === buyer.id) throw new RealtimeError('BAD_REQUEST');
        const merchant = await loadMerchant(deps, row, tx);
        await requireMerchantAccess(tx, viewer, merchant);
        if (merchant.closed) throw new RealtimeError('MERCHANT_CLOSED');

        // Karta kupującego czytana tu, w transakcji — nie ta z początku obsługi.
        const buyerCard = await tx.character.findUnique({ where: { id: buyer.id } });
        if (!buyerCard || buyerCard.campaignId !== campaignId) {
          throw new RealtimeError('CHARACTER_NOT_FOUND');
        }
        // Sklep przy figurze sprzedaje temu, kto przy nim stoi — bez furtki
        // „brak wspólnej sceny”, bo sklep przy figurze stoi przy figurze.
        // Między sesjami nie ma mapy, więc nie ma i zasięgu (decyzja 9).
        if (viewer.atTable && merchant.settings.access === 'reach') {
          const metres = closestBetween(await placedTokens(tx, buyerCard.id), merchant.placed);
          if (metres === null || metres > CPRED_MELEE_REACH_M) {
            throw new RealtimeError('OUT_OF_REACH');
          }
        }

        const buyerData = parseCharacterData(buyerCard.data, deps.ctx.cpred);
        const deal = cpredMerchantDeal({
          buyer: buyerData,
          merchant: merchant.data,
          overlays: merchant.overlays,
          priceMul: merchant.settings.priceMul,
          buyBackPct: merchant.settings.buyBackPct,
          cashInfinite: merchant.settings.cashInfinite,
          buy,
          sell,
          ctx,
        });
        if (!deal.ok) throw new RealtimeError(deal.error);
        const { quote } = deal.result;
        if (quote.total !== expectTotal) throw new RealtimeError('QUOTE_CHANGED');

        const paid = quote.buy - quote.haggleOff;
        const counterparty = merchant.card.id;
        let nextBuyer = mergeCharacterData(buyerData, {
          weapons: deal.result.buyer.weapons,
          armor: deal.result.buyer.armor,
          gear: deal.result.buyer.gear,
          haggle: deal.result.buyer.haggle,
        });
        const buyerFlows = [
          { kind: 'purchase' as const, amount: -paid, label: `${merchant.name}: zakup` },
          { kind: 'sale' as const, amount: quote.sell, label: `${merchant.name}: sprzedaż` },
        ].filter((flow) => flow.amount !== 0);
        for (const flow of buyerFlows) {
          nextBuyer = await applyBalance(
            deps,
            campaignId,
            buyerCard,
            nextBuyer,
            { ...flow, counterpartyId: counterparty },
            user.id,
            { tx, emit: false },
          );
        }
        if (buyerFlows.length === 0) {
          await tx.character.update({
            where: { id: buyerCard.id },
            data: { data: JSON.stringify(nextBuyer) },
          });
        }

        // Lustro u handlarza; kasa „bez dna” nie zapisuje ruchów gotówki.
        let nextMerchant = mergeCharacterData(merchant.data, {
          weapons: deal.result.merchant.weapons,
          armor: deal.result.merchant.armor,
          gear: deal.result.merchant.gear,
        });
        const merchantFlows = merchant.settings.cashInfinite
          ? []
          : [
              { kind: 'sale' as const, amount: paid, label: `sprzedaż: ${buyerCard.name}` },
              { kind: 'purchase' as const, amount: -quote.sell, label: `skup: ${buyerCard.name}` },
            ].filter((flow) => flow.amount !== 0);
        for (const flow of merchantFlows) {
          nextMerchant = await applyBalance(
            deps,
            campaignId,
            merchant.card,
            nextMerchant,
            { ...flow, counterpartyId: buyerCard.id },
            user.id,
            { tx, emit: false },
          );
        }
        if (merchantFlows.length === 0) {
          await tx.character.update({
            where: { id: merchant.card.id },
            data: { data: JSON.stringify(nextMerchant) },
          });
        }
        await tx.merchant.update({
          where: { id: row.id },
          data: { rows: JSON.stringify(deal.result.overlays) },
        });

        return {
          buyerCard,
          merchant,
          balance: nextBuyer.eddies,
          quote,
          bought: deal.result.bought,
          sold: deal.result.sold,
        };
      }),
    );

    // Emisje dopiero po transakcji: karty obu stron (zapis karty handlarza
    // odświeża też półkę u oglądających — `notifyMerchantCard`).
    for (const id of [outcome.buyerCard.id, outcome.merchant.card.id]) {
      const saved = await prisma.character.findUniqueOrThrow({ where: { id } });
      await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
      await emitTokensOfCharacter(deps, campaignId, saved);
    }

    // Karta czatu u kupującego i MG (decyzja z 08.10): co oddał, co dostał.
    const { quote } = outcome;
    const entry: InventoryMoveEntry = {
      kind: 'shop',
      fromCharacterId: outcome.buyerCard.id,
      fromName: outcome.buyerCard.name,
      toCharacterId: outcome.merchant.card.id,
      toName: outcome.merchant.name,
      toOwnerId: null,
      actorName: user.name,
      lines: dealLines(outcome.sold.map(cpredItemLine), Math.max(0, quote.total)),
      returnLines: dealLines(outcome.bought.map(cpredItemLine), Math.max(0, -quote.total)),
      system: {},
      resolution: { kind: 'accepted', byName: user.name },
    };
    await postInventoryCard(
      deps,
      campaignId,
      user,
      entry,
      [outcome.buyerCard.ownerId],
      outcome.buyerCard.ownerId,
    );
    return { total: quote.total, balance: outcome.balance };
  },
});

/* ------------------------------------------------------------------ *
 * MG: merchant:config, merchant:row, campaign:catalog-shopping
 * ------------------------------------------------------------------ */

export const merchantConfigEvent = defineEvent<MerchantConfigPayload, MerchantConfigResult>({
  name: 'merchant:config',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const card = await findCampaignCharacter(prisma, campaignId, payload?.characterId);
    const existing = await prisma.merchant.findUnique({ where: { characterId: card.id } });

    if (payload?.merchant === null) {
      if (!existing) return {};
      await prisma.merchant.delete({ where: { id: existing.id } });
      await emitMerchantUpdate(deps, campaignId, existing.id);
      await emitMerchantShops(deps, campaignId);
      return {};
    }

    // Sklepem jest karta NPC-a: karta gracza ma właściciela, który o swoim
    // ekwipunku decyduje sam.
    if (card.ownerId !== null) throw new RealtimeError('NOT_NPC');
    // Skrzynia nie zostaje sklepem (46b): towar wykłada handlarz, nie bagażnik.
    if (sheetIsContainer(card)) throw new RealtimeError('NOT_NPC');
    const patch = readMerchantSettingsPatch(payload?.merchant);
    if (!patch) throw new RealtimeError('BAD_REQUEST');
    const saved = existing
      ? await prisma.merchant.update({ where: { id: existing.id }, data: patch })
      : await prisma.merchant.create({ data: { campaignId, characterId: card.id, ...patch } });
    await emitMerchantUpdate(deps, campaignId, saved.id);
    await emitMerchantShops(deps, campaignId);
    return { merchantId: saved.id };
  },
});

export const merchantRowEvent = defineEvent<MerchantRowPayload, void>({
  name: 'merchant:row',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    if (!isCpredItemList(payload?.list) || typeof payload?.rowId !== 'string') {
      throw new RealtimeError('BAD_REQUEST');
    }
    const list = payload.list;
    const rowId = payload.rowId;
    const overlay = payload.overlay === null ? null : readMerchantRowOverlay(payload.overlay);
    if (payload.overlay !== null && overlay === null) throw new RealtimeError('BAD_REQUEST');

    const merchantId = await withCampaignLock(campaignId, () =>
      prisma.$transaction(async (tx) => {
        const row = await requireMerchantRow(tx, campaignId, payload.merchantId);
        const card = await tx.character.findUnique({ where: { id: row.characterId } });
        if (!card) throw new RealtimeError('MERCHANT_NOT_FOUND');
        const data = parseCharacterData(card.data, deps.ctx.cpred);
        const existing = new Set<string>();
        for (const name of ['weapons', 'armor', 'gear'] as const) {
          for (const item of data[name]) existing.add(merchantRowKey(name, item.id));
        }
        const key = merchantRowKey(list, rowId);
        if (!existing.has(key)) throw new RealtimeError('ROW_NOT_FOUND');
        const overlays = pruneMerchantRows(readMerchantRows(row.rows), existing);
        if (overlay) overlays[key] = overlay;
        else delete overlays[key];
        await tx.merchant.update({
          where: { id: row.id },
          data: { rows: JSON.stringify(overlays) },
        });
        return row.id;
      }),
    );
    await emitMerchantUpdate(deps, campaignId, merchantId);
  },
});

export const catalogShoppingEvent = defineEvent<CatalogShoppingPayload, CatalogShoppingPayload>({
  name: 'campaign:catalog-shopping',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const mode = payload?.mode;
    if (!isCatalogShopping(mode)) throw new RealtimeError('BAD_REQUEST');
    await deps.ctx.prisma.campaign.update({
      where: { id: campaignId },
      data: { catalogShopping: mode },
    });
    const room = campaignRoom(campaignId);
    const broadcast: CatalogShoppingBroadcast = { seq: deps.seqs.next(room), mode };
    deps.io.to(room).emit('campaign:catalog-shopping', broadcast);
    return { mode };
  },
});

/** Przełącznik kampanii — `economy:buy` gracza pyta o niego przed portfelem. */
export async function campaignCatalogShopping(prisma: PrismaClient, campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { catalogShopping: true },
  });
  return readCatalogShopping(campaign?.catalogShopping);
}

/** Sklep karty, jeśli ta karta jest handlarzem — dla `exchange:counterparts`. */
export async function merchantsOfCampaign(
  deps: RealtimeDeps,
  campaignId: string,
): Promise<Map<string, LoadedMerchant>> {
  const rows = await deps.ctx.prisma.merchant.findMany({ where: { campaignId } });
  const byCharacter = new Map<string, LoadedMerchant>();
  for (const row of rows) {
    const merchant = await loadMerchant(deps, row).catch(() => null);
    if (merchant) byCharacter.set(row.characterId, merchant);
  }
  return byCharacter;
}

export type { LoadedMerchant };
