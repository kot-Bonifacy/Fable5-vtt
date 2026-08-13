import type {
  HandoutDeleteBroadcast,
  HandoutIdPayload,
  HandoutLogEntry,
  HandoutOpenBroadcast,
  HandoutRecipient,
  HandoutSharePayload,
  HandoutSyncPayload,
  HandoutUpsertBroadcast,
  HandoutUpsertPayload,
  HandoutView,
  SessionUser,
} from '@vtt/shared';
import {
  ROLE_GM,
  normalizeRecipientIds,
  normalizeScreamsheetMeta,
  parseHandoutKind,
  validateHandout,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { deliverChatMessageTo, insertChatMessage } from './chat-io.js';
import { journalEntriesWithHandout, refreshJournalEntries } from './journal.js';
import { campaignRoom, gmRoom } from './state.js';

/**
 * Handouty — materiały MG podawane graczom do ręki (etap 24a).
 *
 * Trzy rzeczy odróżniają ten moduł od bazy wiedzy z 19b, choć oba są listą
 * wpisów z edytorem MG:
 *
 *  1. **To jedyna lista MG, która ma wyjście do gracza.** Baza wiedzy nie
 *     opuszcza `gmRoom` w ogóle; handout opuszcza go dokładnie dla tych kont,
 *     które są w `HandoutShare`. Filtr siedzi w zapytaniu (`where: { shares:
 *     { some: { userId } } }`), nie w mapowaniu po fakcie — gracz bez
 *     udostępnienia nie zobaczy handoutu nawet w payloadzie.
 *  2. **Widok MG i widok gracza to dwa różne kształty.** MG dostaje
 *     `sharedWith`, gracz nie dostaje tego pola wcale: „komu jeszcze MG to
 *     pokazał" jest informacją o stole, nie o handoucie.
 *  3. **Udostępnienie jest zdarzeniem, nie stanem.** Kto właśnie doszedł do
 *     listy, dostaje okno na wierzch i wiersz na czacie; kto już był, nie
 *     dostaje nic — inaczej dopisanie trzeciego gracza wyskakiwałoby dwóm
 *     pierwszym drugi raz.
 */

interface HandoutRow {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  kind: string;
  lead: string | null;
  outlet: string | null;
  dateline: string | null;
  createdAt: Date;
  updatedAt: Date;
  shares?: { userId: string }[];
}

/**
 * Wiersz bazy jako widok. `withShares` decyduje o kształcie: lista odbiorców
 * jedzie WYŁĄCZNIE do MG, więc jest osobnym parametrem, a nie polem, które
 * ktoś kiedyś zapomni usunąć przed wysyłką.
 */
function toHandoutView(row: HandoutRow, withShares: boolean): HandoutView {
  const kind = parseHandoutKind(row.kind);
  const view: HandoutView = {
    id: row.id,
    title: row.title,
    body: row.body,
    image:
      row.imageUrl && row.imageWidth !== null && row.imageHeight !== null
        ? { url: row.imageUrl, width: row.imageWidth, height: row.imageHeight }
        : null,
    kind,
    // Meble gazety wychodzą z bazy znormalizowane, więc wiersz zapisany przed
    // 24c (albo z pustą winietą) rysuje się jak każdy inny screamsheet.
    screamsheet:
      kind === 'screamsheet'
        ? normalizeScreamsheetMeta({ lead: row.lead, outlet: row.outlet, dateline: row.dateline })
        : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (withShares) view.sharedWith = (row.shares ?? []).map((share) => share.userId);
  return view;
}

const INCLUDE_SHARES = { shares: { select: { userId: true } } } as const;

/** Wszystkie handouty kampanii — widok MG, z listami odbiorców. */
export async function fetchHandoutsForGm(
  prisma: PrismaClient,
  campaignId: string,
): Promise<HandoutView[]> {
  const rows = await prisma.handout.findMany({
    where: { campaignId },
    include: INCLUDE_SHARES,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row) => toHandoutView(row, true));
}

/**
 * Handouty udostępnione temu graczowi. Filtr jest częścią zapytania — nic
 * spoza udostępnień nie wychodzi z warstwy bazy.
 */
export async function fetchHandoutsForPlayer(
  prisma: PrismaClient,
  campaignId: string,
  userId: string,
): Promise<HandoutView[]> {
  const rows = await prisma.handout.findMany({
    where: { campaignId, shares: { some: { userId } } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row) => toHandoutView(row, false));
}

export function fetchHandoutsFor(
  prisma: PrismaClient,
  campaignId: string,
  user: SessionUser,
): Promise<HandoutView[]> {
  return user.role === ROLE_GM
    ? fetchHandoutsForGm(prisma, campaignId)
    : fetchHandoutsForPlayer(prisma, campaignId, user.id);
}

/** Kandydaci na odbiorców: gracze należący do kampanii, alfabetycznie. */
async function fetchRecipients(
  prisma: PrismaClient,
  campaignId: string,
): Promise<HandoutRecipient[]> {
  const members = await prisma.campaignMember.findMany({
    where: { campaignId, user: { role: { not: ROLE_GM } } },
    include: { user: { select: { id: true, name: true } } },
  });
  return members
    .map((member) => ({ userId: member.user.id, name: member.user.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

async function requireHandout(
  prisma: PrismaClient,
  campaignId: string,
  id: unknown,
): Promise<HandoutRow & { shares: { userId: string }[] }> {
  if (typeof id !== 'string' || id.length === 0) throw new RealtimeError('BAD_REQUEST');
  const row = await prisma.handout.findUnique({ where: { id }, include: INCLUDE_SHARES });
  if (!row || row.campaignId !== campaignId) throw new RealtimeError('HANDOUT_NOT_FOUND');
  return row;
}

/**
 * Wysyła zdarzenie do wszystkich gniazd wymienionych kont. Wzorzec szeptu
 * z `chat-io.ts`, tyle że nie chodzi o wiadomość — handout jedzie tą samą
 * drogą, bo dotyczy tej samej garstki ludzi.
 */
async function emitToUsers(
  deps: RealtimeDeps,
  campaignId: string,
  userIds: Iterable<string>,
  event: string,
  payload: unknown,
): Promise<void> {
  const targets = new Set(userIds);
  if (targets.size === 0) return;
  const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
  for (const socket of sockets) {
    const user = (socket.data as { user: SessionUser }).user;
    if (targets.has(user.id)) socket.emit(event, payload);
  }
}

/**
 * Rozsyła zmienioną treść: MG dostaje wersję z listą odbiorców, każdy odbiorca
 * — swoją, bez listy.
 */
async function emitUpsert(
  deps: RealtimeDeps,
  campaignId: string,
  row: HandoutRow & { shares: { userId: string }[] },
): Promise<HandoutView> {
  const gmView = toHandoutView(row, true);
  const playerView = toHandoutView(row, false);
  const forGm: HandoutUpsertBroadcast = { handout: gmView };
  const forPlayers: HandoutUpsertBroadcast = { handout: playerView };
  deps.io.to(gmRoom(campaignId)).emit('handout:upsert', forGm);
  await emitToUsers(
    deps,
    campaignId,
    row.shares.map((share) => share.userId),
    'handout:upsert',
    forPlayers,
  );
  return gmView;
}

// ---------------------------------------------------------------------------
// Zdarzenia
// ---------------------------------------------------------------------------

/** Lista handoutów. Jedyne zdarzenie tego modułu dostępne graczowi. */
export const handoutListEvent = defineEvent<undefined, HandoutSyncPayload>({
  name: 'handout:list',
  handler: async ({ deps, socket, user }) => {
    const campaignId = requireCampaignId(socket.data);
    const handouts = await fetchHandoutsFor(deps.ctx.prisma, campaignId, user);
    // Lista kandydatów na odbiorców to skład stołu — gracz nie musi jej znać
    // z tej strony (widzi obecnych w panelu obecności), a MG bez niej nie ma
    // czego zaznaczyć.
    const recipients =
      user.role === ROLE_GM ? await fetchRecipients(deps.ctx.prisma, campaignId) : [];
    return { handouts, recipients };
  },
});

export const handoutUpsertEvent = defineEvent<HandoutUpsertPayload, HandoutView>({
  name: 'handout:upsert',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const result = validateHandout(payload);
    if (!result.ok) {
      throw new RealtimeError(`INVALID_HANDOUT:${result.issues[0]?.message ?? ''}`);
    }
    const { title, body, image, kind, screamsheet } = result.handout;
    const data = {
      title,
      body,
      imageUrl: image?.url ?? null,
      imageWidth: image?.width ?? null,
      imageHeight: image?.height ?? null,
      kind,
      lead: screamsheet?.lead ?? null,
      outlet: screamsheet?.outlet ?? null,
      dateline: screamsheet?.dateline ?? null,
    };

    const id = typeof payload?.id === 'string' && payload.id.length > 0 ? payload.id : null;
    if (id) await requireHandout(deps.ctx.prisma, campaignId, id);

    const stored = id
      ? await deps.ctx.prisma.handout.update({ where: { id }, data, include: INCLUDE_SHARES })
      : await deps.ctx.prisma.handout.create({
          data: { campaignId, ...data },
          include: INCLUDE_SHARES,
        });

    return emitUpsert(deps, campaignId, stored);
  },
});

export const handoutDeleteEvent = defineEvent<HandoutIdPayload, void>({
  name: 'handout:delete',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const row = await requireHandout(deps.ctx.prisma, campaignId, payload?.id);
    // Wiersze łączące z dziennikiem (24b) znikną kaskadowo razem z handoutem,
    // więc wpisy do odświeżenia trzeba znać wcześniej.
    const linked = await journalEntriesWithHandout(deps.ctx.prisma, campaignId, row.id);
    await deps.ctx.prisma.handout.delete({ where: { id: row.id } });

    const broadcast: HandoutDeleteBroadcast = { id: row.id };
    deps.io.to(gmRoom(campaignId)).emit('handout:delete', broadcast);
    await emitToUsers(
      deps,
      campaignId,
      row.shares.map((share) => share.userId),
      'handout:delete',
      broadcast,
    );
    await refreshJournalEntries(deps, campaignId, linked);
  },
});

/**
 * Ustawia listę odbiorców na dokładnie tę, którą przysłał MG.
 *
 * Kolejność ma znaczenie: najpierw zapis, potem powiadomienia. Kto doszedł,
 * dostaje handout, okno na wierzch i wiersz na czacie; komu zabrano — samo
 * `handout:delete`, bo z jego strony ta kartka przestaje istnieć.
 */
export const handoutShareEvent = defineEvent<HandoutSharePayload, HandoutView>({
  name: 'handout:share',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const row = await requireHandout(deps.ctx.prisma, campaignId, payload?.id);

    const wanted = normalizeRecipientIds(payload?.userIds);
    const allowed = new Set(
      (await fetchRecipients(deps.ctx.prisma, campaignId)).map((entry) => entry.userId),
    );
    // Konto spoza kampanii nie może dostać handoutu przez podrobiony payload —
    // `HandoutShare` nie zna pojęcia kampanii, więc pilnuje tego ten warunek.
    if (wanted.some((id) => !allowed.has(id))) throw new RealtimeError('UNKNOWN_RECIPIENT');

    const before = new Set(row.shares.map((share) => share.userId));
    const after = new Set(wanted);
    const added = wanted.filter((id) => !before.has(id));
    const removed = [...before].filter((id) => !after.has(id));

    if (removed.length > 0) {
      await deps.ctx.prisma.handoutShare.deleteMany({
        where: { handoutId: row.id, userId: { in: removed } },
      });
    }
    if (added.length > 0) {
      await deps.ctx.prisma.handoutShare.createMany({
        data: added.map((userId) => ({ handoutId: row.id, userId })),
      });
    }

    const fresh = await deps.ctx.prisma.handout.findUniqueOrThrow({
      where: { id: row.id },
      include: INCLUDE_SHARES,
    });
    const gmView = await emitUpsert(deps, campaignId, fresh);

    if (removed.length > 0) {
      const broadcast: HandoutDeleteBroadcast = { id: row.id };
      await emitToUsers(deps, campaignId, removed, 'handout:delete', broadcast);
    }

    if (added.length > 0) {
      const open: HandoutOpenBroadcast = { handout: toHandoutView(fresh, false) };
      await emitToUsers(deps, campaignId, added, 'handout:open', open);
      await announceShare(deps, campaignId, user.id, fresh, added);
    }

    // Odnośnik w kronice (24b) jest przecięciem wpisu z udostępnieniem, więc
    // zmiana po tej stronie też musi dojechać do gracza.
    if (added.length > 0 || removed.length > 0) {
      await refreshJournalEntries(
        deps,
        campaignId,
        await journalEntriesWithHandout(deps.ctx.prisma, campaignId, row.id),
      );
    }

    return gmView;
  },
});

/**
 * Ślad na czacie: jeden wiersz na odbiorcę, wzorcem szeptu.
 *
 * Dlaczego nie jeden wspólny wiersz: po przeładowaniu strony historię czatu
 * odsiewa `visibleTo`, a ono zna tylko `authorId` i `recipientId`. Wiersz bez
 * adresata byłby albo niewidoczny dla graczy, albo widoczny dla wszystkich —
 * a handout ma zostawić ślad dokładnie u tych, którzy go dostali.
 */
async function announceShare(
  deps: RealtimeDeps,
  campaignId: string,
  gmId: string,
  row: HandoutRow,
  recipients: string[],
): Promise<void> {
  const entry: HandoutLogEntry = {
    handoutId: row.id,
    title: row.title,
    hasImage: row.imageUrl !== null,
    kind: parseHandoutKind(row.kind),
  };
  const payload = JSON.stringify(entry);
  for (const recipientId of recipients) {
    const message = await insertChatMessage(deps.ctx.prisma, {
      campaignId,
      authorId: gmId,
      kind: 'handout',
      text: row.title,
      recipientId,
      payload,
    });
    await deliverChatMessageTo(deps, campaignId, message, [recipientId], true);
  }
}
