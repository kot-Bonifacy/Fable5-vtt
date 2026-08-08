import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io';
import type {
  JournalDeleteBroadcast,
  JournalDraft,
  JournalDraftBroadcast,
  JournalEntryView,
  JournalErrorBroadcast,
  JournalIdPayload,
  JournalIndexStatus,
  JournalProgressBroadcast,
  JournalSummarizePayload,
  JournalSyncPayload,
  JournalUpsertBroadcast,
  JournalUpsertPayload,
  KnowledgeVisibility,
  RelationProposal,
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
import { gmRoom } from './state.js';

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
 */

/** Ile sekund wolno zająć jednej generacji. Porcja to kilkaset tokenów. */
const GENERATION_TIMEOUT_MS = 120_000;

/** Twardy limit porcji — zabezpieczenie przed logiem z tysiąca sesji. */
const MAX_BATCHES = 40;

interface JournalRow {
  id: string;
  title: string;
  body: string;
  sessionDate: string;
  tags: string;
  visibility: string;
  throughMessageId: number | null;
  lineCount: number;
  indexedDigest: string | null;
  indexedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
    id: row.id,
    title: row.title,
    body: row.body,
    sessionDate: row.sessionDate,
    tags,
    visibility,
    throughMessageId: row.throughMessageId,
    lineCount: row.lineCount,
    indexedAt: row.indexedAt?.toISOString() ?? null,
    stale: row.indexedDigest !== digest,
    createdAt: row.createdAt.toISOString(),
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
    orderBy: [{ sessionDate: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map(toEntryView);
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

export const journalListEvent = defineEvent<undefined, JournalSyncPayload>({
  name: 'journal:list',
  role: ROLE_GM,
  handler: async ({ deps, socket }) => {
    const campaignId = requireCampaignId(socket.data);
    const entries = await fetchJournalEntries(deps.ctx.prisma, campaignId);
    return {
      entries,
      index: await indexStatus(deps, campaignId, entries),
      pendingLines: await pendingLineCount(deps.ctx.prisma, campaignId),
    };
  },
});

export const journalUpsertEvent = defineEvent<JournalUpsertPayload, JournalEntryView>({
  name: 'journal:upsert',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const result = validateJournalEntry(payload);
    if (!result.ok) throw new RealtimeError(`INVALID_ENTRY:${result.issues[0]?.message ?? ''}`);
    const data = result.entry;

    const id = typeof payload?.id === 'string' && payload.id.length > 0 ? payload.id : null;
    if (id) {
      const existing = await deps.ctx.prisma.journalEntry.findUnique({ where: { id } });
      if (!existing || existing.campaignId !== campaignId)
        throw new RealtimeError('ENTRY_NOT_FOUND');
    }

    const covered =
      typeof payload?.throughMessageId === 'number' ? payload.throughMessageId : undefined;
    const lineCount = typeof payload?.lineCount === 'number' ? payload.lineCount : undefined;
    const stored = id
      ? await deps.ctx.prisma.journalEntry.update({
          where: { id },
          data: { ...data, tags: JSON.stringify(data.tags) },
        })
      : await deps.ctx.prisma.journalEntry.create({
          data: {
            campaignId,
            ...data,
            tags: JSON.stringify(data.tags),
            ...(covered !== undefined ? { throughMessageId: covered } : {}),
            ...(lineCount !== undefined ? { lineCount } : {}),
          },
        });

    // Indeksujemy od razu, jak w 19b: wpis „boty z uprawnieniem" ma działać w
    // następnej wypowiedzi NPC-a, bez restartu gatewaya. Nieudane indeksowanie
    // nie cofa zapisu — zostaje widoczny stan „nieaktualny".
    const entry = toEntryView(stored);
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
    return view;
  },
});

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

    return indexStatus(
      deps,
      campaignId,
      entries.map((entry) => ({ ...entry, stale: false })),
    );
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
