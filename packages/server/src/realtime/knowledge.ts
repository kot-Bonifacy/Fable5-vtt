import type {
  BotProfileData,
  KnowledgeDeleteBroadcast,
  KnowledgeEntryType,
  KnowledgeEntryView,
  KnowledgeIdPayload,
  KnowledgeIndexStatus,
  KnowledgePassage,
  KnowledgePreviewPayload,
  KnowledgePreviewResult,
  KnowledgeSyncPayload,
  KnowledgeUpsertBroadcast,
  KnowledgeUpsertPayload,
  KnowledgeVisibility,
} from '@vtt/shared';
import {
  KNOWLEDGE_TYPES,
  KNOWLEDGE_VISIBILITIES,
  ROLE_GM,
  compileBotPrompt,
  emptyKnowledgeIndexStatus,
  estimatePromptTokens,
  journalCollection,
  knowledgeCollection,
  knowledgeDigest,
  knowledgeDocumentText,
  knowledgeSource,
  parseBotData,
  trimKnowledgePassage,
  validateKnowledgeEntry,
} from '@vtt/shared';
import type { RagDocumentInput } from '../ai/gateway.js';
import type { PrismaClient } from '../db.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { requireCampaignBot } from './bots.js';
import { gmRoom } from './state.js';

/**
 * Baza wiedzy kampanii (etap 19b).
 *
 * Trzy rzeczy odróżniają ten moduł od kompendium z etapu 13, choć oba są listą
 * wpisów z edytorem MG:
 *
 *  1. **Nic z tego nie opuszcza pokoju MG.** Wpisy niosą sekrety fabuły, więc
 *     `knowledge:*` emituje wyłącznie do `gmRoom` — gracz nie dowiaduje się nawet,
 *     że baza istnieje. Do graczy trafia dopiero wypowiedź bota, bez śladu źródła.
 *  2. **Baza jest źródłem prawdy, indeks jest jej kopią.** Kopia mieszka w
 *     gatewayu i może się rozjechać (gateway offline w chwili zapisu), więc każdy
 *     wpis nosi odcisk tego, co naprawdę zostało zaindeksowane. „Nieaktualny"
 *     jest stanem widocznym w UI, nie awarią.
 *  3. **Uprawnienia bota są filtrem po stronie gatewaya.** Serwer nie dostaje
 *     fragmentów i ich nie odsiewa — wysyła tagi i widoczność razem z zapytaniem.
 */

/** Ile fragmentów wolno wyszukać jednemu botowi, niezależnie od jego profilu. */
const BOT_SEARCH_HARD_CAP = 6;

interface KnowledgeRow {
  id: string;
  title: string;
  body: string;
  type: string;
  tags: string;
  visibility: string;
  indexedDigest: string | null;
  indexedAt: Date | null;
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

function toEntryView(row: KnowledgeRow): KnowledgeEntryView {
  const type = (KNOWLEDGE_TYPES as readonly string[]).includes(row.type)
    ? (row.type as KnowledgeEntryType)
    : 'note';
  const visibility = (KNOWLEDGE_VISIBILITIES as readonly string[]).includes(row.visibility)
    ? (row.visibility as KnowledgeVisibility)
    : 'bots';
  const tags = parseTags(row.tags);
  const digest = knowledgeDigest({ title: row.title, body: row.body, type, tags, visibility });
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    type,
    tags,
    visibility,
    indexedAt: row.indexedAt?.toISOString() ?? null,
    stale: row.indexedDigest !== digest,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDocument(entry: KnowledgeEntryView): RagDocumentInput {
  return {
    source: knowledgeSource(entry.id),
    text: knowledgeDocumentText(entry),
    title: entry.title,
    tags: entry.tags,
    visibility: entry.visibility,
  };
}

export async function fetchKnowledgeEntries(
  prisma: PrismaClient,
  campaignId: string,
): Promise<KnowledgeEntryView[]> {
  const rows = await prisma.knowledgeEntry.findMany({
    where: { campaignId },
    orderBy: { title: 'asc' },
  });
  return rows.map(toEntryView);
}

/**
 * Stan indeksu bazy wiedzy. `pending` liczymy z bazy, nie z gatewaya — gateway
 * wie tylko, ile fragmentów ma, a nie ile MG zdążył napisać od tamtego czasu.
 */
async function indexStatus(
  deps: RealtimeDeps,
  campaignId: string,
  entries?: KnowledgeEntryView[],
): Promise<KnowledgeIndexStatus> {
  const known = entries ?? (await fetchKnowledgeEntries(deps.ctx.prisma, campaignId));
  if (!deps.ctx.ai.getStatus().available && known.length === 0) {
    return { ...emptyKnowledgeIndexStatus(), reason: 'brak połączenia z AI Gateway' };
  }
  const stats = await deps.ctx.ai.collectionStatus(knowledgeCollection(campaignId));
  return {
    ready: stats.ready,
    chunks: stats.chunks,
    documents: stats.documents,
    pending: known.filter((entry) => entry.stale).length,
    reason: stats.reason,
  };
}

/** Zapisuje wynik indeksowania na wpisie — po nim widać, czy kopia jest aktualna. */
async function markIndexed(
  prisma: PrismaClient,
  entry: KnowledgeEntryView,
  indexed: boolean,
): Promise<void> {
  await prisma.knowledgeEntry.update({
    where: { id: entry.id },
    data: indexed
      ? {
          indexedDigest: knowledgeDigest(entry),
          indexedAt: new Date(),
        }
      : { indexedDigest: null },
  });
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

async function emitUpsert(
  deps: RealtimeDeps,
  campaignId: string,
  entry: KnowledgeEntryView,
): Promise<void> {
  const broadcast: KnowledgeUpsertBroadcast = {
    entry,
    index: await indexStatus(deps, campaignId),
  };
  deps.io.to(gmRoom(campaignId)).emit('knowledge:upsert', broadcast);
}

// ---------------------------------------------------------------------------
// Zdarzenia
// ---------------------------------------------------------------------------

export const knowledgeListEvent = defineEvent<undefined, KnowledgeSyncPayload>({
  name: 'knowledge:list',
  role: ROLE_GM,
  handler: async ({ deps, socket }) => {
    const campaignId = requireCampaignId(socket.data);
    const entries = await fetchKnowledgeEntries(deps.ctx.prisma, campaignId);
    return { entries, index: await indexStatus(deps, campaignId, entries) };
  },
});

export const knowledgeUpsertEvent = defineEvent<KnowledgeUpsertPayload, KnowledgeEntryView>({
  name: 'knowledge:upsert',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const result = validateKnowledgeEntry(payload);
    if (!result.ok) throw new RealtimeError(`INVALID_ENTRY:${result.issues[0]?.message ?? ''}`);
    const data = result.entry;

    const id = typeof payload?.id === 'string' && payload.id.length > 0 ? payload.id : null;
    if (id) {
      const existing = await deps.ctx.prisma.knowledgeEntry.findUnique({ where: { id } });
      if (!existing || existing.campaignId !== campaignId) {
        throw new RealtimeError('ENTRY_NOT_FOUND');
      }
    }

    const stored = id
      ? await deps.ctx.prisma.knowledgeEntry.update({
          where: { id },
          data: { ...data, tags: JSON.stringify(data.tags) },
        })
      : await deps.ctx.prisma.knowledgeEntry.create({
          data: { campaignId, ...data, tags: JSON.stringify(data.tags) },
        });

    // Indeksujemy od razu i czekamy: jeden wpis to jeden przebieg embeddera na
    // CPU (dziesiątki ms), a kryterium etapu mówi „zmiana widoczna w odpowiedzi
    // bota bez restartu gatewaya". Nieudane indeksowanie nie cofa zapisu —
    // zostaje widoczny w UI stan „nieaktualny".
    const entry = toEntryView(stored);
    const indexed = await deps.ctx.ai.indexDocuments(knowledgeCollection(campaignId), [
      toDocument(entry),
    ]);
    if (!indexed.ok) {
      deps.log.warn({ entryId: entry.id, err: indexed.error }, 'knowledge entry not indexed');
    }
    await markIndexed(deps.ctx.prisma, entry, indexed.ok);

    const view: KnowledgeEntryView = {
      ...entry,
      stale: !indexed.ok,
      indexedAt: indexed.ok ? new Date().toISOString() : null,
    };
    await emitUpsert(deps, campaignId, view);
    return view;
  },
});

export const knowledgeDeleteEvent = defineEvent<KnowledgeIdPayload, void>({
  name: 'knowledge:delete',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const id = payload?.id;
    if (typeof id !== 'string' || id.length === 0) throw new RealtimeError('BAD_REQUEST');

    const removed = await deps.ctx.prisma.knowledgeEntry.deleteMany({ where: { campaignId, id } });
    if (removed.count === 0) throw new RealtimeError('ENTRY_NOT_FOUND');

    // Wpis skasowany w edytorze musi natychmiast zniknąć z indeksu — inaczej bot
    // dalej pamiętałby miejsce, którego już nie ma.
    const forgotten = await deps.ctx.ai.forgetDocuments(knowledgeCollection(campaignId), [
      knowledgeSource(id),
    ]);
    if (!forgotten.ok) {
      deps.log.warn({ entryId: id, err: forgotten.error }, 'knowledge entry left in the index');
    }

    const broadcast: KnowledgeDeleteBroadcast = {
      id,
      index: await indexStatus(deps, campaignId),
    };
    deps.io.to(gmRoom(campaignId)).emit('knowledge:delete', broadcast);
  },
});

/**
 * Pełny przebieg: indeksuje wszystko, co się rozjechało, i zapomina sieroty
 * (wpisy skasowane, kiedy gateway leżał). Idempotentny — ponowne wywołanie na
 * aktualnej bazie nie dokłada ani jednego fragmentu.
 */
export const knowledgeReindexEvent = defineEvent<undefined, KnowledgeIndexStatus>({
  name: 'knowledge:reindex',
  role: ROLE_GM,
  handler: async ({ deps, socket }) => {
    const campaignId = requireCampaignId(socket.data);
    const collection = knowledgeCollection(campaignId);
    const entries = await fetchKnowledgeEntries(deps.ctx.prisma, campaignId);

    const indexed = await deps.ctx.ai.indexDocuments(collection, entries.map(toDocument));
    if (!indexed.ok) {
      return {
        ...(await indexStatus(deps, campaignId, entries)),
        reason: indexed.error.detail || 'indeksowanie nie powiodło się',
      };
    }
    await Promise.all(entries.map((entry) => markIndexed(deps.ctx.prisma, entry, true)));

    const alive = new Set(entries.map((entry) => knowledgeSource(entry.id)));
    const orphans = (await deps.ctx.ai.forgetOrphans(collection, alive)) ?? 0;
    if (orphans > 0) deps.log.info({ campaignId, orphans }, 'knowledge index pruned');

    const fresh = entries.map((entry) => ({ ...entry, stale: false }));
    return indexStatus(deps, campaignId, fresh);
  },
});

// ---------------------------------------------------------------------------
// Wyszukiwanie dla bota
// ---------------------------------------------------------------------------

export interface BotKnowledgeResult {
  passages: KnowledgePassage[];
  /** Czas samego wyszukiwania — siedzi PRZED generacją, więc liczy się do limitu. */
  tookMs: number;
  /** Dlaczego fragmentów nie ma; null, gdy są albo gdy po prostu nic nie pasuje. */
  reason: string | null;
}

const NO_KNOWLEDGE: BotKnowledgeResult = { passages: [], tookMs: 0, reason: null };

/**
 * Kolekcje, które wolno przeszukać temu botowi. Nazwa kolekcji JEST uprawnieniem
 * do źródła — dziennik, którego bot nie czyta, nie kosztuje go ani jednego
 * mnożenia wektorów, bo nie wchodzi do zapytania.
 */
function botCollections(campaignId: string, data: BotProfileData): string[] {
  const sources = data.knowledgeContext.sources;
  const collections: string[] = [];
  if (sources.includes('campaign')) collections.push(knowledgeCollection(campaignId));
  if (sources.includes('journal')) collections.push(journalCollection(campaignId));
  return collections;
}

/**
 * Co ten bot ma prawo sobie przypomnieć przy tej wypowiedzi.
 *
 * Uprawnienia jadą do gatewaya jako filtr zapytania: `visibility: ['bots']` (wpis
 * „tylko MG" nie ma prawa się pojawić) plus tagi z profilu. Pusty zbiór źródeł
 * kończy się natychmiastowym zerem — bot bez uprawnień nie wykonuje ani jednego
 * zapytania i zachowuje się dokładnie jak w etapie 11.
 *
 * Etap 19c dokłada drugą kolekcję (dziennik), ale nadal JEDNO wyszukiwanie:
 * fragmenty z obu źródeł mają konkurować o te same trzy miejsca w prompcie, a nie
 * dostać po trzy każde.
 */
export async function collectBotKnowledge(
  deps: RealtimeDeps,
  options: { campaignId: string; data: BotProfileData; query: string },
): Promise<BotKnowledgeResult> {
  const context = options.data.knowledgeContext;
  const collections = botCollections(options.campaignId, options.data);
  if (collections.length === 0) return NO_KNOWLEDGE;

  const query = options.query.trim();
  if (query.length === 0) return NO_KNOWLEDGE;
  if (!deps.ctx.ai.getStatus().available) {
    return { ...NO_KNOWLEDGE, reason: 'brak połączenia z AI Gateway' };
  }

  const found = await deps.ctx.ai.searchRules(
    query,
    Math.min(context.topK, BOT_SEARCH_HARD_CAP),
    collections,
    { tags: context.tags, visibility: ['bots'] },
  );
  if (!found.ok) {
    deps.log.warn({ err: found.error }, 'knowledge lookup failed — bot answers from its profile');
    return { ...NO_KNOWLEDGE, reason: found.error.detail || found.error.code };
  }

  return {
    passages: found.result.passages.map((passage) => ({
      chunkId: passage.chunkId,
      entryId: passage.source.replace(/^(entry|session):/, ''),
      // Chunker wkleja tytuł wpisu jako „rozdział" — wpis idzie do indeksu
      // z nagłówkiem `# Tytuł` właśnie po to.
      title: passage.chapter || passage.source,
      text: trimKnowledgePassage(passage.text),
      score: passage.score,
    })),
    tookMs: found.result.tookMs,
    reason: null,
  };
}

/**
 * Podgląd promptu z doklejonymi fragmentami — bez tego „dlaczego bot to
 * powiedział" przestaje być sprawdzalne (wskazówka etapu 19b). Kompiluje go
 * SERWER, tym samym kodem, który idzie do modelu, więc podgląd nie może się
 * rozjechać z rzeczywistością.
 */
export const knowledgePreviewEvent = defineEvent<KnowledgePreviewPayload, KnowledgePreviewResult>({
  name: 'knowledge:preview',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const bot = await requireCampaignBot(deps.ctx.prisma, campaignId, payload?.botId);
    const data = parseBotData(bot.data);
    const message = typeof payload?.message === 'string' ? payload.message.slice(0, 1000) : '';

    const found = await collectBotKnowledge(deps, { campaignId, data, query: message });
    const reason =
      found.reason ??
      (data.knowledgeContext.sources.length === 0
        ? 'Bot nie ma dostępu do żadnego źródła — odpowiada wyłącznie z profilu.'
        : message.trim().length === 0
          ? 'Wpisz zdanie rozmówcy, żeby zobaczyć, co bot sobie przypomni.'
          : found.passages.length === 0
            ? 'Nic w bazie wiedzy nie pasuje do tego zdania (albo nie ma tagu, który bot czyta).'
            : null);

    const prompt = compileBotPrompt({
      name: bot.name,
      data,
      knowledgePassages: found.passages,
    });
    return {
      prompt,
      passages: found.passages,
      reason,
      promptTokens: estimatePromptTokens(prompt),
    };
  },
});
