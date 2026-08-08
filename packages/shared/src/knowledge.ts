/**
 * Baza wiedzy kampanii (etap 19b).
 *
 * Rdzeń VTT, nie system RPG: „wpis o miejscu, frakcji albo osobie" nie wie nic
 * o Cyberpunku RED i nic z `systems/cpred` tu nie wchodzi.
 *
 * Dwie rzeczy niosą ten plik.
 *
 * 1. **Widoczność jest własnością wpisu, nie zapytania.** `gm` znaczy „ten wpis
 *    nigdy nie trafia do promptu żadnego bota" — filtruje go gateway przy
 *    wyszukiwaniu, nie serwer po fakcie. Sekret fabuły, którego nie wolno powtórzyć
 *    NPC-owi, nie ma prawa nawet kosztować bota jednego mnożenia wektorów.
 * 2. **Tag jest jedynym językiem uprawnień.** Bot dostaje listę tagów, wpis nosi
 *    listę tagów — i to cała reguła. Nie ma listy botów na wpisie, bo wtedy
 *    dopisanie NPC-a wymagałoby przejścia po wszystkich wpisach kampanii.
 */

export const KNOWLEDGE_TYPES = ['place', 'faction', 'npc', 'event', 'note'] as const;
export type KnowledgeEntryType = (typeof KNOWLEDGE_TYPES)[number];

export const KNOWLEDGE_TYPE_LABELS: Record<KnowledgeEntryType, string> = {
  place: 'Miejsce',
  faction: 'Frakcja',
  npc: 'Postać',
  event: 'Wydarzenie',
  note: 'Notatka',
};

/**
 * `gm` = tylko Mistrz Gry (i asystent zasad); `bots` = mogą czytać boty z
 * pasującym tagiem. Handouty dla graczy to osobna sprawa — etap 24.
 */
export const KNOWLEDGE_VISIBILITIES = ['gm', 'bots'] as const;
export type KnowledgeVisibility = (typeof KNOWLEDGE_VISIBILITIES)[number];

export const KNOWLEDGE_VISIBILITY_LABELS: Record<KnowledgeVisibility, string> = {
  gm: 'Tylko MG',
  bots: 'Boty z uprawnieniem',
};

export const KNOWLEDGE_TITLE_MAX_LENGTH = 120;
/** Jeden wpis to notatka MG, nie rozdział — kilka akapitów wystarczy. */
export const KNOWLEDGE_BODY_MAX_LENGTH = 8000;
export const KNOWLEDGE_TAGS_MAX = 12;
export const KNOWLEDGE_TAG_MAX_LENGTH = 32;

/** Nazwa kolekcji RAG z bazą wiedzy — jedna na kampanię, żeby wpisy nie mieszały się między nimi. */
export function knowledgeCollection(campaignId: string): string {
  return `campaign:${campaignId}`;
}

/** Nazwa dokumentu w indeksie. Stała dla wpisu, więc reindeks nadpisuje, a nie dokłada. */
export function knowledgeSource(entryId: string): string {
  return `entry:${entryId}`;
}

/**
 * Tag w postaci porównywalnej. Bez wielkich liter i bez spacji, bo po drugiej
 * stronie stoi `t.tag IN (…)` w SQLite — dopasowanie jest dosłowne.
 */
export function normalizeKnowledgeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, KNOWLEDGE_TAG_MAX_LENGTH);
}

export function normalizeKnowledgeTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const tag = normalizeKnowledgeTag(item);
    if (tag.length > 0 && !seen.includes(tag)) seen.push(tag);
  }
  return seen.slice(0, KNOWLEDGE_TAGS_MAX);
}

/** Jeden wpis, jak widzi go MG. Nigdy nie opuszcza pokoju MG. */
export interface KnowledgeEntryView {
  id: string;
  title: string;
  body: string;
  type: KnowledgeEntryType;
  tags: string[];
  visibility: KnowledgeVisibility;
  /** Kiedy gateway ostatnio zaindeksował tę treść; null = nie ma go w indeksie. */
  indexedAt: string | null;
  /**
   * Treść w bazie różni się od tego, co siedzi w indeksie (albo indeksowanie
   * padło). MG ma to widzieć, bo bot odpowiada ze starej wersji.
   */
  stale: boolean;
  updatedAt: string;
}

/** Stan kolekcji bazy wiedzy — kształtem bliźniaczy do `RulesIndexStatus`. */
export interface KnowledgeIndexStatus {
  /** Gateway żyje, RAG włączony, indeks zbudowany bieżącym modelem. */
  ready: boolean;
  chunks: number;
  documents: number;
  /** Wpisy czekające na (ponowne) zaindeksowanie. */
  pending: number;
  /** Po polsku, z następnym krokiem — null, kiedy wszystko gra. */
  reason: string | null;
}

export function emptyKnowledgeIndexStatus(): KnowledgeIndexStatus {
  return { ready: false, chunks: 0, documents: 0, pending: 0, reason: null };
}

/**
 * Fragment bazy wiedzy doklejony do promptu bota. Bez cytatu i bez numeru
 * strony — bot ma to pamiętać, a nie cytować (patrz `compileBotPrompt`).
 */
export interface KnowledgePassage {
  chunkId: number;
  /** Id wpisu, z którego pochodzi — po nim MG rozpoznaje wpis w śladzie. */
  entryId: string;
  title: string;
  text: string;
  score: number;
}

/**
 * Twardy limit jednego fragmentu w prompcie bota. Fragmenty mają ~420 tokenów,
 * ale jeden rozwlekły wpis MG nie może wypchnąć historii rozmowy z kontekstu —
 * a to ona jest pamięcią krótkotrwałą bota z etapu 11.
 */
export const KNOWLEDGE_PASSAGE_MAX_CHARS = 1500;

export function trimKnowledgePassage(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= KNOWLEDGE_PASSAGE_MAX_CHARS
    ? trimmed
    : `${trimmed.slice(0, KNOWLEDGE_PASSAGE_MAX_CHARS)}…`;
}

export interface KnowledgeUpsertPayload {
  /** Pusty przy tworzeniu nowego wpisu. */
  id?: string;
  title: string;
  body: string;
  type: KnowledgeEntryType;
  tags: string[];
  visibility: KnowledgeVisibility;
}

export interface KnowledgeIdPayload {
  id: string;
}

export interface KnowledgeSyncPayload {
  entries: KnowledgeEntryView[];
  index: KnowledgeIndexStatus;
}

export interface KnowledgeUpsertBroadcast {
  entry: KnowledgeEntryView;
  index: KnowledgeIndexStatus;
}

export interface KnowledgeDeleteBroadcast {
  id: string;
  index: KnowledgeIndexStatus;
}

/** Podgląd promptu bota z doklejonymi fragmentami (edytor botów, zakładka „Prompt"). */
export interface KnowledgePreviewPayload {
  botId: string;
  /** Zdanie rozmówcy, po którym szuka się w bazie. Puste = sam profil. */
  message: string;
}

export interface KnowledgePreviewResult {
  /** Dokładnie ten tekst, który dostałby model. */
  prompt: string;
  passages: KnowledgePassage[];
  /** Powód, dla którego fragmentów nie ma (brak uprawnień, gateway offline…). */
  reason: string | null;
  promptTokens: number;
}

export interface KnowledgeValidationIssue {
  field: string;
  message: string;
}

/**
 * Waliduje wpis. Ta sama funkcja chodzi u klienta (podpowiedź w formularzu) i na
 * serwerze (rozstrzygnięcie), więc oba odrzucają to samo z tym samym komunikatem.
 */
export function validateKnowledgeEntry(
  raw: unknown,
):
  | { ok: true; entry: Omit<KnowledgeUpsertPayload, 'id'> }
  | { ok: false; issues: KnowledgeValidationIssue[] } {
  const issues: KnowledgeValidationIssue[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, issues: [{ field: 'entry', message: 'Nieprawidłowe dane wpisu.' }] };
  }
  const input = raw as Record<string, unknown>;

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title.length === 0) issues.push({ field: 'title', message: 'Wpis musi mieć tytuł.' });
  if (title.length > KNOWLEDGE_TITLE_MAX_LENGTH) {
    issues.push({
      field: 'title',
      message: `Tytuł jest za długi (limit ${KNOWLEDGE_TITLE_MAX_LENGTH} znaków).`,
    });
  }

  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (body.length === 0) issues.push({ field: 'body', message: 'Wpis musi mieć treść.' });
  if (body.length > KNOWLEDGE_BODY_MAX_LENGTH) {
    issues.push({
      field: 'body',
      message: `Treść jest za długa (limit ${KNOWLEDGE_BODY_MAX_LENGTH} znaków).`,
    });
  }

  const type = KNOWLEDGE_TYPES.includes(input.type as KnowledgeEntryType)
    ? (input.type as KnowledgeEntryType)
    : 'note';
  const visibility = KNOWLEDGE_VISIBILITIES.includes(input.visibility as KnowledgeVisibility)
    ? (input.visibility as KnowledgeVisibility)
    : 'bots';

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    entry: { title, body, type, tags: normalizeKnowledgeTags(input.tags), visibility },
  };
}

/**
 * Treść wysyłana do indeksu. Tytuł jedzie jako nagłówek markdown, więc chunker
 * z 19a wkleja go w pierwszą linię KAŻDEGO fragmentu — dzięki temu embedding
 * widzi, o czym jest akapit, nawet gdy sam akapit nie powtarza nazwy miejsca.
 */
export function knowledgeDocumentText(entry: {
  title: string;
  body: string;
  type: KnowledgeEntryType;
}): string {
  return `# ${entry.title}\n\n${KNOWLEDGE_TYPE_LABELS[entry.type]}.\n\n${entry.body}`;
}

/** Odcisk treści — po nim widać, czy indeks jest aktualny. Nie musi być kryptograficzny. */
export function knowledgeDigest(entry: {
  title: string;
  body: string;
  type: KnowledgeEntryType;
  tags: string[];
  visibility: KnowledgeVisibility;
}): string {
  const payload = [
    entry.title,
    entry.type,
    entry.visibility,
    [...entry.tags].sort().join(','),
    entry.body,
  ].join(' ');
  // FNV-1a: krótki, stabilny i bez zależności — zmiana jednego znaku zmienia wynik.
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${payload.length.toString(36)}-${hash.toString(36)}`;
}
