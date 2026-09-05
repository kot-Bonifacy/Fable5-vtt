import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io';
import type {
  JournalDeleteBroadcast,
  JournalDraft,
  JournalDraftBroadcast,
  JournalEntryView,
  JournalErrorBroadcast,
  JournalHandoutLink,
  JournalIdPayload,
  JournalIndexStatus,
  JournalLogEntry,
  JournalPlayerEntry,
  JournalPlayerSyncPayload,
  JournalPlayerUpsertBroadcast,
  JournalProgressBroadcast,
  JournalSummarizePayload,
  JournalSyncPayload,
  JournalUpsertBroadcast,
  JournalUpsertPayload,
  KnowledgeVisibility,
  RelationProposal,
  SessionUser,
} from '@vtt/shared';
import {
  BOT_CONTEXT_FALLBACK_TOKENS,
  JOURNAL_HINT_MAX_LENGTH,
  JOURNAL_MAP_MAX_TOKENS,
  JOURNAL_REDUCE_MAX_TOKENS,
  ROLE_GM,
  buildRelationPrompt,
  buildSummaryMapPrompt,
  buildSummaryReducePrompt,
  clampRelation,
  emptyJournalIndexStatus,
  fallbackTitle,
  gameDayKey,
  journalCollection,
  journalDigest,
  journalDocumentText,
  journalSource,
  matchName,
  normalizeSessionDate,
  parseRelationLines,
  planBatches,
  renderTranscriptLine,
  sanitizeRelationNote,
  splitSummaryDraft,
  transcriptBudget,
  validateJournalEntry,
} from '@vtt/shared';
import type { AiChatRequest, RagDocumentInput } from '../ai/gateway.js';
import type { PrismaClient } from '../db.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { fetchBotRelations } from './relations.js';
import { broadcastChatMessage, insertChatMessage } from './chat-io.js';
import { campaignRoom, gmRoom } from './state.js';
import { campaignGameTime } from './gametime.js';

/**
 * Dziennik kampanii i streszczanie sesji (etap 19c).
 *
 * Trzy rzeczy niosą ten moduł.
 *
 *  1. **Streszczenie jest mapowaniem-redukcją, bo log bywa dłuższy niż kontekst.**
 *     Zapis dzieli się na porcje mieszczące się w oknie modelu, każda dostaje
 *     własne notatki, a notatki składa druga generacja. Gdyby notatek też było
 *     za dużo, redukcja powtarza się piętrami — dlatego pętla, a nie dwa kroki.
 *  2. **Log to wyłącznie wypowiedzi publiczne.** Bez rzutów (bot nie zna
 *     mechaniki) i bez szeptów (rozstrzygnięcie MG, 08.08) — dziennik jedzie do
 *     indeksu, który czytają boty, więc szept nie ma tędy jak wyciec.
 *  3. **Model niczego nie zapisuje.** Streszczenie wraca jako szkic do poprawy,
 *     a propozycje relacji jako lista do odklikania. Kryterium etapu brzmi
 *     „żadna relacja nie zmienia się bez kliknięcia MG" i jest tu dosłowne:
 *     ten plik nie ma ani jednego zapisu do `botRelation`.
 *
 * Etap 24b otworzył czwartą: **dziennik wychodzi do graczy, ale wpisem po
 * wpisie**. Kanał gracza jest osobnym kształtem (`JournalPlayerEntry`), a nie
 * okrojonym widokiem MG, i wszystko, co go dotyczy, filtruje zapytanie:
 * `sharedWithPlayers` przy wpisie, `HandoutShare` przy przypiętym materiale.
 * Wpis „tylko MG" nie pojawia się u gracza nawet jako id.
 */

/** Ile sekund wolno zająć jednej generacji. Porcja to kilkaset tokenów. */
const GENERATION_TIMEOUT_MS = 120_000;

/** Twardy limit porcji — zabezpieczenie przed logiem z tysiąca sesji. */
const MAX_BATCHES = 40;

/** Wiersz tabeli łączącej z doczytanym handoutem — tyle, ile trzeba na odnośnik. */
interface JournalHandoutRow {
  handout: { id: string; title: string; imageUrl: string | null };
}

interface JournalRow {
  id: string;
  title: string;
  body: string;
  sessionDate: string;
  worldDate: string | null;
  tags: string;
  visibility: string;
  sharedWithPlayers: boolean;
  throughMessageId: number | null;
  lineCount: number;
  indexedDigest: string | null;
  indexedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  handouts: JournalHandoutRow[];
}

/**
 * Przypięte handouty MG widzi wszystkie. Gracz — tylko te, które dostał, i to
 * odsiewa `where` w zapytaniu (patrz `includeHandoutsFor`), a nie ta funkcja.
 */
const INCLUDE_HANDOUTS = {
  handouts: { include: { handout: { select: { id: true, title: true, imageUrl: true } } } },
} as const;

/**
 * Ten sam `include`, zawężony do materiałów udostępnionych temu graczowi.
 *
 * Filtr stoi w zapytaniu, nie w mapowaniu po fakcie — wpis dziennika może
 * wskazywać handout, którego gracz nie dostał, i wtedy nawet **tytuł** tego
 * materiału nie ma prawa opuścić serwera.
 */
function includeHandoutsFor(userId: string) {
  return {
    handouts: {
      where: { handout: { shares: { some: { userId } } } },
      include: { handout: { select: { id: true, title: true, imageUrl: true } } },
    },
  } as const;
}

function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string')
      : [];
  } catch {
    return [];
  }
}

const collator = new Intl.Collator('pl');

function toHandoutLinks(rows: JournalHandoutRow[]): JournalHandoutLink[] {
  return rows
    .map((row) => ({
      id: row.handout.id,
      title: row.handout.title,
      hasImage: row.handout.imageUrl !== null,
    }))
    .sort((a, b) => collator.compare(a.title, b.title));
}

/** Wpis w kształcie gracza: bez tagów, bez widoczności, bez stanu indeksu. */
function toPlayerEntry(row: JournalRow): JournalPlayerEntry {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    sessionDate: row.sessionDate,
    worldDate: row.worldDate,
    handouts: toHandoutLinks(row.handouts),
    createdAt: row.createdAt.toISOString(),
  };
}

function toEntryView(row: JournalRow): JournalEntryView {
  const visibility: KnowledgeVisibility = row.visibility === 'bots' ? 'bots' : 'gm';
  const tags = parseTags(row.tags);
  const digest = journalDigest({
    title: row.title,
    body: row.body,
    sessionDate: row.sessionDate,
    tags,
    visibility,
  });
  return {
    ...toPlayerEntry(row),
    tags,
    visibility,
    sharedWithPlayers: row.sharedWithPlayers,
    throughMessageId: row.throughMessageId,
    lineCount: row.lineCount,
    indexedAt: row.indexedAt?.toISOString() ?? null,
    stale: row.indexedDigest !== digest,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDocument(entry: JournalEntryView): RagDocumentInput {
  return {
    source: journalSource(entry.id),
    text: journalDocumentText(entry),
    title: entry.title,
    tags: entry.tags,
    visibility: entry.visibility,
  };
}

export async function fetchJournalEntries(
  prisma: PrismaClient,
  campaignId: string,
): Promise<JournalEntryView[]> {
  const rows = await prisma.journalEntry.findMany({
    where: { campaignId },
    include: INCLUDE_HANDOUTS,
    orderBy: [{ sessionDate: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map(toEntryView);
}

/**
 * Dziennik, jak widzi go gracz: wyłącznie wpisy odsłonięte stołowi, z odnośnikami
 * do materiałów, które ten konkretny gracz naprawdę dostał.
 */
export async function fetchSharedJournal(
  prisma: PrismaClient,
  campaignId: string,
  userId: string,
): Promise<JournalPlayerEntry[]> {
  const rows = await prisma.journalEntry.findMany({
    where: { campaignId, sharedWithPlayers: true },
    include: includeHandoutsFor(userId),
    orderBy: [{ sessionDate: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map(toPlayerEntry);
}

/** Materiały, które MG może przypiąć do wpisu — sama etykieta, bez treści. */
async function fetchPinnableHandouts(
  prisma: PrismaClient,
  campaignId: string,
): Promise<JournalHandoutLink[]> {
  const rows = await prisma.handout.findMany({
    where: { campaignId },
    select: { id: true, title: true, imageUrl: true },
  });
  return rows
    .map((row) => ({ id: row.id, title: row.title, hasImage: row.imageUrl !== null }))
    .sort((a, b) => collator.compare(a.title, b.title));
}

/**
 * Rozsyła wpis graczom — każdemu w jego własnym kształcie, bo lista przypiętych
 * materiałów zależy od tego, co komu udostępniono.
 *
 * `null` znaczy „ten gracz nie ma prawa tego widzieć": wtedy zamiast treści
 * jedzie `journal:delete`, bo z jego strony wpis przestaje istnieć — dokładnie
 * jak przy cofniętym udostępnieniu handoutu w 24a.
 */
async function emitToPlayers(deps: RealtimeDeps, campaignId: string, entryId: string) {
  const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
  const computed = new Map<string, JournalPlayerEntry | null>();
  for (const socket of sockets) {
    const user = (socket.data as { user: SessionUser }).user;
    if (user.role === ROLE_GM) continue;
    if (!computed.has(user.id)) {
      const row = await deps.ctx.prisma.journalEntry.findFirst({
        where: { id: entryId, campaignId, sharedWithPlayers: true },
        include: includeHandoutsFor(user.id),
      });
      computed.set(user.id, row ? toPlayerEntry(row) : null);
    }
    const entry = computed.get(user.id) ?? null;
    if (entry) {
      const broadcast: JournalPlayerUpsertBroadcast = { entry };
      socket.emit('journal:upsert', broadcast);
    } else {
      const broadcast: JournalDeleteBroadcast = { id: entryId };
      socket.emit('journal:delete', broadcast);
    }
  }
}

/** „Tego wpisu już nie ma" — do wszystkich graczy przy stole. */
async function emitDeleteToPlayers(deps: RealtimeDeps, campaignId: string, id: string) {
  const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
  const broadcast: JournalDeleteBroadcast = { id };
  for (const socket of sockets) {
    const user = (socket.data as { user: SessionUser }).user;
    if (user.role !== ROLE_GM) socket.emit('journal:delete', broadcast);
  }
}

/**
 * Odsłonięte wpisy, które wymieniają ten handout — pytane **przed** zmianą,
 * bo skasowanie materiału zabiera ze sobą wiersze łączące.
 */
export async function journalEntriesWithHandout(
  prisma: PrismaClient,
  campaignId: string,
  handoutId: string,
): Promise<string[]> {
  const links = await prisma.journalHandout.findMany({
    where: { handoutId, entry: { campaignId, sharedWithPlayers: true } },
    select: { entryId: true },
  });
  return links.map((link) => link.entryId);
}

/**
 * Odświeża wskazane wpisy u graczy (etap 24b).
 *
 * Woła to moduł handoutów: gracz, któremu MG właśnie dał mapę, ma zobaczyć ją
 * także jako odnośnik w kronice — bez przeładowywania zakładki. Odnośnik nie
 * jest własnością wpisu, tylko przecięciem wpisu z udostępnieniem, więc zmiana
 * po **którejkolwiek** stronie musi dojechać do gracza.
 */
export async function refreshJournalEntries(
  deps: RealtimeDeps,
  campaignId: string,
  entryIds: string[],
): Promise<void> {
  for (const entryId of entryIds) await emitToPlayers(deps, campaignId, entryId);
}

async function indexStatus(
  deps: RealtimeDeps,
  campaignId: string,
  entries?: JournalEntryView[],
): Promise<JournalIndexStatus> {
  const known = entries ?? (await fetchJournalEntries(deps.ctx.prisma, campaignId));
  if (!deps.ctx.ai.getStatus().available && known.length === 0) {
    return { ...emptyJournalIndexStatus(), reason: 'brak połączenia z AI Gateway' };
  }
  const stats = await deps.ctx.ai.collectionStatus(journalCollection(campaignId));
  return {
    ready: stats.ready,
    chunks: stats.chunks,
    documents: stats.documents,
    pending: known.filter((entry) => entry.stale).length,
    reason: stats.reason,
  };
}

async function markIndexed(
  prisma: PrismaClient,
  entry: JournalEntryView,
  indexed: boolean,
): Promise<void> {
  await prisma.journalEntry.update({
    where: { id: entry.id },
    data: indexed
      ? { indexedDigest: journalDigest(entry), indexedAt: new Date() }
      : { indexedDigest: null },
  });
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/**
 * Skąd zacząć następne streszczenie: pierwsza wiadomość po tej, którą objął
 * ostatni wpis. Bez tego „zakończ sesję" streszczałoby całą historię kampanii
 * od nowa przy każdym kliknięciu.
 */
async function lastCoveredMessageId(
  prisma: PrismaClient,
  campaignId: string,
): Promise<number | null> {
  const row = await prisma.journalEntry.findFirst({
    where: { campaignId, throughMessageId: { not: null } },
    orderBy: { throughMessageId: 'desc' },
    select: { throughMessageId: true },
  });
  return row?.throughMessageId ?? null;
}

interface TranscriptRow {
  id: number;
  text: string;
  speakerName: string | null;
  author: { name: string };
}

/**
 * Zapis sesji do streszczenia: **same wypowiedzi publiczne**, w kolejności.
 * Rzuty kości i szepty zostają poza — pierwsze są mechaniką, o której NPC nie
 * ma prawa mówić, drugie są prywatne, a wpis dziennika może trafić do promptu.
 */
async function readTranscript(
  prisma: PrismaClient,
  campaignId: string,
  afterId: number | null,
): Promise<{ lines: string[]; lastId: number | null }> {
  const rows: TranscriptRow[] = await prisma.chatMessage.findMany({
    where: {
      campaignId,
      kind: 'say',
      ...(afterId !== null ? { id: { gt: afterId } } : {}),
    },
    orderBy: { id: 'asc' },
    select: { id: true, text: true, speakerName: true, author: { select: { name: true } } },
  });
  const usable = rows.filter((row) => row.text.trim().length > 0);
  return {
    lines: usable.map((row) =>
      renderTranscriptLine({ speaker: row.speakerName ?? row.author.name, text: row.text }),
    ),
    lastId: usable.at(-1)?.id ?? null,
  };
}

async function pendingLineCount(prisma: PrismaClient, campaignId: string): Promise<number> {
  const afterId = await lastCoveredMessageId(prisma, campaignId);
  return prisma.chatMessage.count({
    where: { campaignId, kind: 'say', ...(afterId !== null ? { id: { gt: afterId } } : {}) },
  });
}

async function emitUpsert(
  deps: RealtimeDeps,
  campaignId: string,
  entry: JournalEntryView,
): Promise<void> {
  const broadcast: JournalUpsertBroadcast = {
    entry,
    index: await indexStatus(deps, campaignId),
  };
  deps.io.to(gmRoom(campaignId)).emit('journal:upsert', broadcast);
}

// ---------------------------------------------------------------------------
// Zdarzenia — dziennik
// ---------------------------------------------------------------------------

/**
 * Lista wpisów — jedyne zdarzenie tego modułu dostępne graczowi (etap 24b).
 *
 * Rola nie stoi w definicji, tylko w gałęzi: gracz i MG dostają **dwa różne
 * kształty**, a nie ten sam obiekt z paroma polami wyciętymi po drodze. Reszta
 * zdarzeń dziennika (zapis, kasowanie, reindeks, streszczanie) zostaje przy
 * `ROLE_GM`.
 */
export const journalListEvent = defineEvent<
  undefined,
  JournalSyncPayload | JournalPlayerSyncPayload
>({
  name: 'journal:list',
  handler: async ({ deps, socket, user }) => {
    const campaignId = requireCampaignId(socket.data);
    if (user.role !== ROLE_GM) {
      return { entries: await fetchSharedJournal(deps.ctx.prisma, campaignId, user.id) };
    }
    const entries = await fetchJournalEntries(deps.ctx.prisma, campaignId);
    return {
      entries,
      index: await indexStatus(deps, campaignId, entries),
      pendingLines: await pendingLineCount(deps.ctx.prisma, campaignId),
      handouts: await fetchPinnableHandouts(deps.ctx.prisma, campaignId),
    };
  },
});

export const journalUpsertEvent = defineEvent<JournalUpsertPayload, JournalEntryView>({
  name: 'journal:upsert',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const result = validateJournalEntry(payload);
    if (!result.ok) throw new RealtimeError(`INVALID_ENTRY:${result.issues[0]?.message ?? ''}`);
    const data = result.entry;

    const id = typeof payload?.id === 'string' && payload.id.length > 0 ? payload.id : null;
    let wasShared = false;
    if (id) {
      const existing = await deps.ctx.prisma.journalEntry.findUnique({ where: { id } });
      if (!existing || existing.campaignId !== campaignId)
        throw new RealtimeError('ENTRY_NOT_FOUND');
      wasShared = existing.sharedWithPlayers;
    }

    // Handout spoza kampanii nie da się przypiąć podrobionym payloadem —
    // `JournalHandout` nie zna pojęcia kampanii, więc pilnuje tego ten warunek.
    if (result.handoutIds.length > 0) {
      const known = await deps.ctx.prisma.handout.count({
        where: { campaignId, id: { in: result.handoutIds } },
      });
      if (known !== result.handoutIds.length) throw new RealtimeError('UNKNOWN_HANDOUT');
    }

    const covered =
      typeof payload?.throughMessageId === 'number' ? payload.throughMessageId : undefined;
    const lineCount = typeof payload?.lineCount === 'number' ? payload.lineCount : undefined;
    const stored = id
      ? await deps.ctx.prisma.journalEntry.update({
          where: { id },
          data: { ...data, tags: JSON.stringify(data.tags) },
          include: INCLUDE_HANDOUTS,
        })
      : await deps.ctx.prisma.journalEntry.create({
          data: {
            campaignId,
            ...data,
            // Data świata stempluje się **przy powstaniu wpisu** i już się nie
            // zmienia: poprawka literówki w streszczeniu sprzed miesiąca nie
            // ma prawa przenieść tej sesji w kalendarzu Night City.
            worldDate: gameDayKey((await campaignGameTime(deps.ctx.prisma, campaignId)).minutes),
            tags: JSON.stringify(data.tags),
            ...(covered !== undefined ? { throughMessageId: covered } : {}),
            ...(lineCount !== undefined ? { lineCount } : {}),
          },
          include: INCLUDE_HANDOUTS,
        });

    const fresh = await syncHandoutLinks(deps.ctx.prisma, stored, result.handoutIds);

    // Indeksujemy od razu, jak w 19b: wpis „boty z uprawnieniem" ma działać w
    // następnej wypowiedzi NPC-a, bez restartu gatewaya. Nieudane indeksowanie
    // nie cofa zapisu — zostaje widoczny stan „nieaktualny".
    const entry = toEntryView(fresh);
    const indexed = await deps.ctx.ai.indexDocuments(journalCollection(campaignId), [
      toDocument(entry),
    ]);
    if (!indexed.ok) {
      deps.log.warn({ entryId: entry.id, err: indexed.error }, 'journal entry not indexed');
    }
    await markIndexed(deps.ctx.prisma, entry, indexed.ok);

    const view: JournalEntryView = {
      ...entry,
      stale: !indexed.ok,
      indexedAt: indexed.ok ? new Date().toISOString() : null,
    };
    await emitUpsert(deps, campaignId, view);
    await emitToPlayers(deps, campaignId, view.id);

    // Ślad na czacie tylko przy odsłonięciu, nie przy każdej poprawce
    // odsłoniętego wpisu — „udostępnienie jest zdarzeniem", jak w 24a.
    if (view.sharedWithPlayers && !wasShared) await announceEntry(deps, campaignId, user.id, view);
    return view;
  },
});

/**
 * Ustawia przypięte materiały na dokładnie tę listę, którą przysłał MG.
 *
 * Stan, nie ciąg operacji: formularz wysyła zaznaczone chipy, a różnicę liczy
 * serwer — ten sam kształt, co lista odbiorców handoutu w 24a.
 */
async function syncHandoutLinks(
  prisma: PrismaClient,
  stored: JournalRow,
  wanted: string[],
): Promise<JournalRow> {
  const before = stored.handouts.map((row) => row.handout.id);
  const removed = before.filter((handoutId) => !wanted.includes(handoutId));
  const added = wanted.filter((handoutId) => !before.includes(handoutId));
  if (removed.length === 0 && added.length === 0) return stored;

  if (removed.length > 0) {
    await prisma.journalHandout.deleteMany({
      where: { entryId: stored.id, handoutId: { in: removed } },
    });
  }
  if (added.length > 0) {
    await prisma.journalHandout.createMany({
      data: added.map((handoutId) => ({ entryId: stored.id, handoutId })),
    });
  }
  return prisma.journalEntry.findUniqueOrThrow({
    where: { id: stored.id },
    include: INCLUDE_HANDOUTS,
  });
}

/**
 * Linia na czacie: „📓 Nowy wpis w dzienniku".
 *
 * Inaczej niż handout z 24a — jeden wiersz dla całego stołu, nie kopia na
 * odbiorcę. Wpis dziennika jest odsłaniany wszystkim naraz, więc `visibleTo`
 * przepuszcza rodzaj `journal` bez pytania o adresata, a wiersz może być
 * zwyczajnym rozgłoszeniem z numerem sekwencji.
 */
async function announceEntry(
  deps: RealtimeDeps,
  campaignId: string,
  gmId: string,
  entry: JournalEntryView,
): Promise<void> {
  const log: JournalLogEntry = {
    entryId: entry.id,
    title: entry.title,
    sessionDate: entry.sessionDate,
  };
  const message = await insertChatMessage(deps.ctx.prisma, {
    campaignId,
    authorId: gmId,
    kind: 'journal',
    text: entry.title,
    payload: JSON.stringify(log),
  });
  broadcastChatMessage(deps, campaignId, message);
}

export const journalDeleteEvent = defineEvent<JournalIdPayload, void>({
  name: 'journal:delete',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const id = payload?.id;
    if (typeof id !== 'string' || id.length === 0) throw new RealtimeError('BAD_REQUEST');

    const removed = await deps.ctx.prisma.journalEntry.deleteMany({ where: { campaignId, id } });
    if (removed.count === 0) throw new RealtimeError('ENTRY_NOT_FOUND');

    const forgotten = await deps.ctx.ai.forgetDocuments(journalCollection(campaignId), [
      journalSource(id),
    ]);
    if (!forgotten.ok) {
      deps.log.warn({ entryId: id, err: forgotten.error }, 'journal entry left in the index');
    }

    const broadcast: JournalDeleteBroadcast = { id, index: await indexStatus(deps, campaignId) };
    deps.io.to(gmRoom(campaignId)).emit('journal:delete', broadcast);
    // Bez rozróżniania, kto go miał: wpis odsłonięty stołowi jest odsłonięty
    // całemu stołowi, a `journal:delete` na nieznane id jest u gracza pustą
    // operacją.
    await emitDeleteToPlayers(deps, campaignId, id);
  },
});

export const journalReindexEvent = defineEvent<undefined, JournalIndexStatus>({
  name: 'journal:reindex',
  role: ROLE_GM,
  handler: async ({ deps, socket }) => {
    const campaignId = requireCampaignId(socket.data);
    const collection = journalCollection(campaignId);
    const entries = await fetchJournalEntries(deps.ctx.prisma, campaignId);

    const indexed = await deps.ctx.ai.indexDocuments(collection, entries.map(toDocument));
    if (!indexed.ok) {
      return {
        ...(await indexStatus(deps, campaignId, entries)),
        reason: indexed.error.detail || 'indeksowanie nie powiodło się',
      };
    }
    await Promise.all(entries.map((entry) => markIndexed(deps.ctx.prisma, entry, true)));

    const alive = new Set(entries.map((entry) => journalSource(entry.id)));
    const orphans = (await deps.ctx.ai.forgetOrphans(collection, alive)) ?? 0;
    if (orphans > 0) deps.log.info({ campaignId, orphans }, 'journal index pruned');

    // To samo, co w knowledge.ts: bez rozesłania wpisów chip „nieaktualny" wisi
    // na każdym wierszu aż do przeładowania strony. Gracz nic tu nie dostaje —
    // świeżość indeksu to wiedza MG.
    // To samo co w knowledge.ts — wpis ma przyjechać z prawdziwym `indexedAt`.
    const fresh = await fetchJournalEntries(deps.ctx.prisma, campaignId);
    const status = await indexStatus(deps, campaignId, fresh);
    for (const entry of fresh) {
      const broadcast: JournalUpsertBroadcast = { entry, index: status };
      deps.io.to(gmRoom(campaignId)).emit('journal:upsert', broadcast);
    }
    return status;
  },
});

// ---------------------------------------------------------------------------
// Streszczanie sesji
// ---------------------------------------------------------------------------

export const journalSummarizeEvent = defineEvent<JournalSummarizePayload, { requestId: string }>({
  name: 'journal:summarize',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    if (!deps.ctx.ai.getStatus().available) throw new RealtimeError('AI_UNAVAILABLE');
    const hint =
      typeof payload?.hint === 'string'
        ? payload.hint.trim().slice(0, JOURNAL_HINT_MAX_LENGTH)
        : '';

    const requestId = randomUUID();
    // Odczepione jak `rules:ask`: ack wraca od razu, bo streszczanie długiego
    // logu to dziesiątki sekund, a czat ma w tym czasie działać normalnie.
    void summarizeSession(deps, socket, requestId, campaignId, hint);
    return { requestId };
  },
});

async function summarizeSession(
  deps: RealtimeDeps,
  socket: Socket,
  requestId: string,
  campaignId: string,
  hint: string,
): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  socket.once('disconnect', abort);
  socket.once('journal:cancel', abort);
  const started = Date.now();

  const progress = (stage: JournalProgressBroadcast['stage'], done: number, total: number) => {
    if (!socket.disconnected) socket.emit('journal:progress', { requestId, stage, done, total });
  };

  try {
    progress('read', 0, 1);
    const afterId = await lastCoveredMessageId(deps.ctx.prisma, campaignId);
    const { lines, lastId } = await readTranscript(deps.ctx.prisma, campaignId, afterId);
    if (lines.length === 0) {
      emitError(socket, requestId, 'JOURNAL_EMPTY_LOG');
      return;
    }

    const campaign = await deps.ctx.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { name: true },
    });
    const contextSize = deps.ctx.ai.getStatus().contextSize ?? BOT_CONTEXT_FALLBACK_TOKENS;
    const budget = transcriptBudget(contextSize, JOURNAL_MAP_MAX_TOKENS);
    const batches = planBatches(lines, budget).slice(0, MAX_BATCHES);

    // Mapowanie: notatki z każdej porcji osobno.
    const notes: string[] = [];
    for (const [index, batch] of batches.entries()) {
      progress('map', index, batches.length);
      const { system, user } = buildSummaryMapPrompt({
        transcript: batch.join('\n'),
        index: index + 1,
        total: batches.length,
        campaignName: campaign?.name ?? null,
      });
      const note = await generate(deps, system, user, JOURNAL_MAP_MAX_TOKENS, controller.signal);
      if (note === null) {
        emitError(socket, requestId, 'AI_ERROR', `nie udało się streścić porcji ${index + 1}`);
        return;
      }
      notes.push(note.trim());
      if (socket.disconnected || controller.signal.aborted) return;
    }
    progress('map', batches.length, batches.length);

    // Redukcja: notatki w jedno streszczenie. Piętrami, bo przy bardzo długiej
    // sesji same notatki potrafią nie zmieścić się w kontekście.
    let level = notes;
    let guard = 0;
    while (level.length > 1 && planBatches(level, budget).length > 1 && guard < 3) {
      progress('reduce', guard, guard + 2);
      const groups = planBatches(level, budget);
      const folded: string[] = [];
      for (const group of groups) {
        const { system, user } = buildSummaryReducePrompt({
          notes: group,
          campaignName: campaign?.name ?? null,
        });
        const part = await generate(
          deps,
          system,
          user,
          JOURNAL_REDUCE_MAX_TOKENS,
          controller.signal,
        );
        if (part === null) {
          emitError(socket, requestId, 'AI_ERROR', 'nie udało się złożyć notatek');
          return;
        }
        folded.push(splitSummaryDraft(part).body);
      }
      level = folded;
      guard += 1;
    }

    progress('reduce', 1, 1);
    const reduce = buildSummaryReducePrompt({
      notes: level,
      campaignName: campaign?.name ?? null,
      hint,
    });
    const raw = await generate(
      deps,
      reduce.system,
      reduce.user,
      JOURNAL_REDUCE_MAX_TOKENS,
      controller.signal,
    );
    if (raw === null) {
      emitError(socket, requestId, 'AI_ERROR', 'nie udało się złożyć streszczenia');
      return;
    }
    if (socket.disconnected || controller.signal.aborted) return;

    const sessionDate = normalizeSessionDate(new Date().toISOString());
    const split = splitSummaryDraft(raw);
    const body = split.body.trim().length > 0 ? split.body : raw.trim();
    const draft: JournalDraft = {
      title: split.title || fallbackTitle(body, sessionDate),
      body,
      sessionDate,
      throughMessageId: lastId,
      lineCount: lines.length,
    };

    progress('relations', 0, 1);
    const proposals = await proposeRelations(deps, campaignId, body, controller.signal);
    progress('relations', 1, 1);
    if (socket.disconnected || controller.signal.aborted) return;

    const done: JournalDraftBroadcast = {
      requestId,
      draft,
      proposals,
      batches: batches.length,
      totalMs: Date.now() - started,
    };
    socket.emit('journal:draft', done);
  } catch (error) {
    deps.log.error({ err: error, requestId }, 'session summary failed');
    emitError(socket, requestId, 'AI_ERROR');
  } finally {
    socket.off('disconnect', abort);
    socket.off('journal:cancel', abort);
  }
}

/**
 * Jedna generacja bez strumienia. Zwraca `null`, gdy model odmówił — wołający
 * kończy wtedy całe streszczanie, bo połowa notatek jest gorsza niż żadne.
 *
 * Rozumowania nie włączamy: streszczanie to przepisywanie faktów, a blok think
 * dzieliłby pulę tokenów z odpowiedzią (błąd znaleziony w 19a).
 */
async function generate(
  deps: RealtimeDeps,
  system: string,
  user: string,
  maxTokens: number,
  signal: AbortSignal,
): Promise<string | null> {
  const request: AiChatRequest = {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    purpose: 'gm_assistant',
    reasoning: false,
    maxTokens,
    // Kronikarz ma przepisywać, nie improwizować.
    temperature: 0.2,
  };
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(GENERATION_TIMEOUT_MS)]);

  let text = '';
  try {
    for await (const event of deps.ctx.ai.streamChat(request, deadline)) {
      if (event.type === 'delta') text += event.text;
      if (event.type === 'error') {
        deps.log.warn({ code: event.code, detail: event.detail }, 'journal generation failed');
        return null;
      }
    }
  } catch (error) {
    deps.log.warn({ err: error }, 'journal generation aborted');
    return null;
  }
  return text.trim().length > 0 ? text : null;
}

/**
 * Propozycje zmian relacji ze streszczenia. Zwraca listę do odklikania — ten
 * kod nie zapisuje ani jednej relacji (kryterium etapu).
 */
async function proposeRelations(
  deps: RealtimeDeps,
  campaignId: string,
  summary: string,
  signal: AbortSignal,
): Promise<RelationProposal[]> {
  const [bots, characters] = await Promise.all([
    deps.ctx.prisma.botProfile.findMany({
      where: { campaignId, archived: false },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    }),
    deps.ctx.prisma.character.findMany({
      where: { campaignId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  if (bots.length === 0 || characters.length === 0) return [];

  const known = new Map<string, Map<string, number>>();
  const roster = await Promise.all(
    bots.map(async (bot) => {
      const relations = await fetchBotRelations(deps.ctx.prisma, bot.id);
      known.set(bot.id, new Map(relations.map((row) => [row.characterId, row.value])));
      return {
        name: bot.name,
        relations: relations.map((row) => ({
          characterName: row.characterName,
          value: row.value,
        })),
      };
    }),
  );

  const { system, user } = buildRelationPrompt({
    summary,
    bots: roster,
    characters: characters.map((character) => character.name),
  });
  const raw = await generate(deps, system, user, 400, signal);
  if (raw === null) return [];

  const proposals: RelationProposal[] = [];
  for (const line of parseRelationLines(raw)) {
    const bot = matchName(bots, line.botName);
    const character = matchName(characters, line.characterName);
    // Model bywa wynalazczy — NPC ani postać spoza kampanii nie mają prawa
    // pojawić się w liście do zatwierdzenia.
    if (!bot || !character) continue;
    const currentValue = known.get(bot.id)?.get(character.id) ?? 0;
    const value = clampRelation(line.value);
    if (value === currentValue) continue;
    if (proposals.some((row) => row.botId === bot.id && row.characterId === character.id)) continue;
    proposals.push({
      botId: bot.id,
      botName: bot.name,
      characterId: character.id,
      characterName: character.name,
      value,
      currentValue,
      note: sanitizeRelationNote(line.note),
    });
  }
  return proposals;
}

function emitError(socket: Socket, requestId: string, code: string, detail?: string): void {
  const payload: JournalErrorBroadcast = { requestId, code, ...(detail ? { detail } : {}) };
  if (!socket.disconnected) socket.emit('journal:error', payload);
}
