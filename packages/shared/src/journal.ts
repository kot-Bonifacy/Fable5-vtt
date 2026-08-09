/**
 * Dziennik kampanii (etap 19c) — streszczenia rozegranych sesji.
 *
 * Rdzeń VTT, nie system RPG: streszczenie to tekst o tym, co się wydarzyło przy
 * stole, i nic z `systems/cpred` tu nie wchodzi.
 *
 * Trzy rzeczy niosą ten plik.
 *
 * 1. **Uprawnienia są dokładnie te co w bazie wiedzy z 19b** — widoczność
 *    („tylko MG" / „boty z uprawnieniem") plus tagi. Nowy wpis dziennika rodzi
 *    się jako „tylko MG": streszczenie jest relacją z perspektywy drużyny i
 *    zawiera rzeczy, przy których NPC-a nie było. Do promptów bota trafia
 *    dopiero wtedy, gdy MG je przejrzy i świadomie nada tagi.
 * 2. **Streszczanie jest mapowaniem-redukcją, a nie jednym zapytaniem.** Log
 *    sesji bywa dłuższy niż okno kontekstu, więc dzieli się na porcje, każda
 *    dostaje własne notatki, a notatki składa druga generacja. Podział jest
 *    czystą funkcją (`planBatches`) właśnie po to, żeby dało się go przetestować
 *    bez modelu.
 * 3. **Propozycje relacji są tekstem, nie JSON-em.** Model 9B potrafi wypisać
 *    „Barman | Vex | −2 | powód" znacznie pewniej niż poprawny JSON, a parser
 *    po naszej stronie i tak musi być tolerancyjny, bo nazwy przyjdą odmienione.
 *
 * Etap 24b dokłada czwartą: **uprawnienie gracza jest osobne od uprawnienia
 * bota**. Bot pamięta wpis przez zgodny tag, gracz czyta go, bo MG uznał, że
 * drużyna może wiedzieć — to dwa różne pytania, więc `sharedWithPlayers` jest
 * osobnym polem, a nie trzecim szczeblem `visibility`.
 */

import { estimatePromptTokens } from './bots/prompt.js';
import { normalizeRecipientIds } from './handouts.js';
import { fingerprint, normalizeKnowledgeTags, type KnowledgeVisibility } from './knowledge.js';
import {
  clampRelation,
  RELATION_LABELS,
  RELATION_MAX,
  RELATION_MIN,
  type RelationProposal,
} from './relations.js';

export const JOURNAL_TITLE_MAX_LENGTH = 120;
/** Streszczenie sesji to kilka akapitów, nie opowiadanie. */
export const JOURNAL_BODY_MAX_LENGTH = 12_000;

/** Nazwa kolekcji RAG z dziennikiem — trzecia obok podręcznika i bazy wiedzy. */
export function journalCollection(campaignId: string): string {
  return `journal:${campaignId}`;
}

/** Nazwa dokumentu w indeksie. Stała dla wpisu, więc reindeks nadpisuje, a nie dokłada. */
export function journalSource(entryId: string): string {
  return `session:${entryId}`;
}

/** Ile handoutów wolno przypiąć do jednego wpisu. Kronika, nie katalog. */
export const JOURNAL_HANDOUTS_MAX = 12;

/** Handout przypięty do wpisu — tyle, ile trzeba, żeby narysować odnośnik. */
export interface JournalHandoutLink {
  id: string;
  title: string;
  hasImage: boolean;
}

/**
 * Wpis dziennika, jak widzi go gracz.
 *
 * Osobny, mniejszy kształt — nie okrojony widok MG. Tagi są językiem uprawnień
 * botów, `visibility` mówi o pamięci NPC-ów, a stan indeksu jest sprawą
 * gatewaya: żadna z tych rzeczy nie ma czego szukać po drugiej stronie stołu,
 * więc nie ma jej w typie, którym serwer odpowiada graczowi.
 */
export interface JournalPlayerEntry {
  id: string;
  title: string;
  body: string;
  /** Dzień, którego dotyczy sesja (ISO, sama data) — po nim sortuje się dziennik. */
  sessionDate: string;
  /**
   * Handouty przypięte do wpisu. U gracza **wyłącznie te, które dostał** —
   * filtruje je zapytanie na serwerze, nie widok.
   */
  handouts: JournalHandoutLink[];
  createdAt: string;
}

/**
 * Jeden wpis dziennika, jak widzi go MG: widok gracza plus wszystko, czego
 * gracz nie dostaje. Rozszerzenie, a nie osobny typ, bo oś czasu i wyszukiwarka
 * mają wtedy jedno wejście dla obu stron stołu.
 */
export interface JournalEntryView extends JournalPlayerEntry {
  tags: string[];
  visibility: KnowledgeVisibility;
  /** Czy wpis czyta cały stół (etap 24b) — niezależne od uprawnienia botów. */
  sharedWithPlayers: boolean;
  /**
   * Ostatnia wiadomość czatu objęta tym streszczeniem. Od niej startuje
   * następne — dzięki temu „zakończ sesję" nie streszcza po raz drugi tego,
   * co już jest w dzienniku.
   */
  throughMessageId: number | null;
  /** Ile linii czatu weszło do streszczenia (0 dla wpisu pisanego ręcznie). */
  lineCount: number;
  indexedAt: string | null;
  /** Treść w bazie różni się od tego, co siedzi w indeksie. */
  stale: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Stan kolekcji dziennika — bliźniaczy do `KnowledgeIndexStatus`. */
export interface JournalIndexStatus {
  ready: boolean;
  chunks: number;
  documents: number;
  pending: number;
  reason: string | null;
}

export function emptyJournalIndexStatus(): JournalIndexStatus {
  return { ready: false, chunks: 0, documents: 0, pending: 0, reason: null };
}

export interface JournalUpsertPayload {
  /** Pusty przy tworzeniu nowego wpisu. */
  id?: string;
  title: string;
  body: string;
  sessionDate: string;
  tags: string[];
  visibility: KnowledgeVisibility;
  /** Czy wpis widzi stół. Pominięte = bez zmiany (nowy wpis rodzi się ukryty). */
  sharedWithPlayers?: boolean;
  /** Pełna lista przypiętych handoutów — jak przy udostępnianiu, stan, nie różnica. */
  handoutIds?: string[];
  /** Ustawiane tylko przy zapisie świeżo wygenerowanego streszczenia. */
  throughMessageId?: number | null;
  lineCount?: number;
}

export interface JournalIdPayload {
  id: string;
}

export interface JournalSyncPayload {
  entries: JournalEntryView[];
  index: JournalIndexStatus;
  /** Ile linii czatu czeka na streszczenie (od ostatniego wpisu do teraz). */
  pendingLines: number;
  /** Handouty, które MG może przypiąć do wpisu (etap 24b); u gracza pusta. */
  handouts: JournalHandoutLink[];
}

/** Odpowiedź na `journal:list` u gracza — sam dziennik, bez narzędzi MG. */
export interface JournalPlayerSyncPayload {
  entries: JournalPlayerEntry[];
}

export interface JournalUpsertBroadcast {
  entry: JournalEntryView;
  index: JournalIndexStatus;
}

/** To samo zdarzenie u gracza — inny kształt, bo inny odbiorca. */
export interface JournalPlayerUpsertBroadcast {
  entry: JournalPlayerEntry;
}

export interface JournalDeleteBroadcast {
  id: string;
  index?: JournalIndexStatus;
}

/**
 * Linia na czacie towarzysząca odsłonięciu wpisu (rodzaj wiadomości `journal`).
 *
 * Inaczej niż handout z 24a, wpis dziennika **nie wyskakuje** graczowi na ekran
 * (rozstrzygnięcie MG, 09.08): kronikę czyta się przed grą, a nie w środku
 * sceny — linia jest zaproszeniem, nie przerwaniem.
 */
export interface JournalLogEntry {
  entryId: string;
  title: string;
  sessionDate: string;
}

// ---------------------------------------------------------------------------
// Streszczanie sesji
// ---------------------------------------------------------------------------

/** Client → server: „zakończ sesję i streść". */
export interface JournalSummarizePayload {
  /** Podpowiedź MG do promptu („skup się na wątku z Militechem"). Może być pusta. */
  hint?: string;
}

export const JOURNAL_HINT_MAX_LENGTH = 300;

/**
 * Świeże streszczenie, zanim MG je zatwierdzi. Nie ma go w bazie — poprawki
 * robi się w formularzu, a dopiero „Zapisz do dziennika" tworzy wpis.
 */
export interface JournalDraft {
  title: string;
  body: string;
  sessionDate: string;
  throughMessageId: number | null;
  lineCount: number;
}

/** Postęp streszczania. Idzie do gniazda MG, bo trwa dziesiątki sekund. */
export interface JournalProgressBroadcast {
  requestId: string;
  /** `read` = zbieranie czatu, `map` = notatki z porcji, `reduce` = składanie, `relations` = propozycje. */
  stage: 'read' | 'map' | 'reduce' | 'relations';
  done: number;
  total: number;
}

export interface JournalDraftBroadcast {
  requestId: string;
  draft: JournalDraft;
  /** Propozycje zmian relacji — do zatwierdzenia po jednej, nigdy automatycznie. */
  proposals: RelationProposal[];
  /** Ile porcji przeszło przez model; 1 = log zmieścił się w kontekście. */
  batches: number;
  totalMs: number;
}

export interface JournalErrorBroadcast {
  requestId: string;
  code: string;
  detail?: string;
}

/** Jedna linia zapisu, jak trafia do modelu. */
export interface TranscriptLine {
  speaker: string;
  text: string;
}

export function renderTranscriptLine(line: TranscriptLine): string {
  const speaker = line.speaker.trim();
  const text = line.text.trim().replace(/\s+/g, ' ');
  return speaker.length > 0 ? `${speaker}: ${text}` : text;
}

/**
 * Dzieli bloki tekstu na porcje mieszczące się w budżecie tokenów.
 *
 * Blok jest niepodzielny — pojedyncza wypowiedź dłuższa od budżetu dostaje
 * własną porcję i zostaje przycięta dopiero przez model. Dzielenie zdania w
 * połowie kosztowałoby więcej sensu, niż jest warte: limit wypowiedzi na czacie
 * to 2000 znaków, a budżet liczy się w tysiącach tokenów.
 */
export function planBatches(blocks: string[], budgetTokens: number): string[][] {
  const budget = Math.max(1, budgetTokens);
  const batches: string[][] = [];
  let current: string[] = [];
  let tokens = 0;

  for (const block of blocks) {
    const cost = estimatePromptTokens(block) + 1;
    if (current.length > 0 && tokens + cost > budget) {
      batches.push(current);
      current = [];
      tokens = 0;
    }
    current.push(block);
    tokens += cost;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Ile tokenów wolno oddać jednej porcji zapisu. Zostawia miejsce na instrukcję
 * i na notatki, które model ma wygenerować — okno kontekstu dzieli się na trzy.
 */
export function transcriptBudget(contextTokens: number, answerTokens: number): number {
  return Math.max(512, Math.floor((contextTokens - answerTokens) * 0.7));
}

/** Ile tokenów przeznaczamy na notatki z jednej porcji. */
export const JOURNAL_MAP_MAX_TOKENS = 700;
/** Ile na gotowe streszczenie. */
export const JOURNAL_REDUCE_MAX_TOKENS = 900;

/**
 * Notatki z jednej porcji zapisu. Punkty, nie proza: to materiał dla drugiej
 * generacji, a nie tekst dla człowieka — i model trzyma się faktów, kiedy pisze
 * listę, znacznie lepiej niż kiedy pisze akapit.
 */
export function buildSummaryMapPrompt(options: {
  transcript: string;
  index: number;
  total: number;
  campaignName?: string | null;
}): { system: string; user: string } {
  const where = options.campaignName ? ` w kampanii „${options.campaignName}"` : '';
  return {
    system: [
      `Jesteś kronikarzem sesji RPG${where}. Dostajesz fragment zapisu rozmowy przy stole` +
        ' i wypisujesz z niego same fakty.',
      '',
      '# Zasady',
      '1. Odpowiadasz po polsku, wypunktowaną listą (myślnik na początku wiersza).',
      '2. Piszesz WYŁĄCZNIE to, co jest w zapisie. Nie dopowiadasz, nie zgadujesz motywów' +
        ' i nie oceniasz postaci.',
      '3. Zachowujesz imiona i nazwy własne dokładnie tak, jak padły.',
      '4. Pomijasz rozmowy o zasadach gry, kościach i technikaliach.',
      '5. Jeśli w tym fragmencie nic się nie wydarzyło, piszesz jeden wiersz: „- (nic istotnego)".',
    ].join('\n'),
    user: [
      `Fragment ${options.index} z ${options.total} zapisu sesji:`,
      '',
      options.transcript,
      '',
      'Wypisz w punktach, co się w tym fragmencie wydarzyło.',
    ].join('\n'),
  };
}

/**
 * Składanie notatek w jedno streszczenie. Tytuł jedzie w pierwszej linii, bo
 * proszenie modelu 9B o dwa osobne wywołania (raz treść, raz tytuł) kosztuje
 * drugą generację, a format „Tytuł: …" trzyma się on bez trudu.
 */
export function buildSummaryReducePrompt(options: {
  notes: string[];
  campaignName?: string | null;
  hint?: string | null;
}): { system: string; user: string } {
  const where = options.campaignName ? ` w kampanii „${options.campaignName}"` : '';
  const hint = options.hint?.trim();
  return {
    system: [
      `Jesteś kronikarzem sesji RPG${where}. Z notatek z przebiegu sesji układasz jedno` +
        ' streszczenie do dziennika kampanii.',
      '',
      '# Zasady',
      '1. Pierwszy wiersz to „Tytuł: " i krótki tytuł sesji (do 60 znaków).',
      '2. Potem jeden do trzech akapitów prozą, po polsku, w czasie przeszłym.',
      '3. Opierasz się WYŁĄCZNIE na notatkach. Nie dodajesz wydarzeń, których w nich nie ma.',
      '4. Zachowujesz imiona i nazwy własne. Piszesz o postaciach po imieniu, nie „drużyna".',
      '5. Bez wstępu, bez komentarza od siebie i bez wypunktowań w treści.',
    ].join('\n'),
    user: [
      'Notatki z przebiegu sesji:',
      '',
      options.notes.join('\n'),
      '',
      hint ? `Mistrz Gry prosi: ${hint}` : '',
      'Ułóż z tego streszczenie sesji.',
    ]
      .filter((part) => part.length > 0)
      .join('\n'),
  };
}

/** Czysty tytuł i treść z surowej odpowiedzi modelu. */
export function splitSummaryDraft(raw: string): { title: string; body: string } {
  const lines = raw.trim().split('\n');
  let title = '';
  let start = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (line.length === 0) continue;
    const match = /^(?:tytuł|tytul|title)\s*[:—-]\s*(.+)$/i.exec(line);
    if (match) {
      title = match[1]!.replace(/^[„"']|["'"]$/g, '').trim();
      start = index + 1;
    }
    break;
  }
  const body = lines
    .slice(start)
    .join('\n')
    .replace(/^\s+/, '')
    .trimEnd()
    .slice(0, JOURNAL_BODY_MAX_LENGTH);
  return { title: title.slice(0, JOURNAL_TITLE_MAX_LENGTH), body };
}

/** Domyślny tytuł, gdy model go nie podał — pierwsze zdanie streszczenia. */
export function fallbackTitle(body: string, date: string): string {
  const sentence =
    body
      .trim()
      .split(/(?<=[.!?])\s/)[0]
      ?.trim() ?? '';
  if (sentence.length >= 8) return sentence.slice(0, JOURNAL_TITLE_MAX_LENGTH);
  return `Sesja ${date}`;
}

// ---------------------------------------------------------------------------
// Propozycje zmian relacji
// ---------------------------------------------------------------------------

const RELATION_SCALE_HELP = Object.entries(RELATION_LABELS)
  .sort((a, b) => Number(a[0]) - Number(b[0]))
  .map(([value, label]) => `${Number(value) > 0 ? `+${value}` : value} = ${label}`)
  .join(', ');

/**
 * Prompt wyciągający ze streszczenia zmiany nastawienia NPC-ów.
 *
 * Model podaje **docelowy stopień**, nie różnicę: różnicę musiałby liczyć od
 * wartości, której nie widzi po swojej stronie, a stopnie i tak dostaje wypisane
 * razem z listą NPC-ów.
 */
export function buildRelationPrompt(options: {
  summary: string;
  bots: { name: string; relations: { characterName: string; value: number }[] }[];
  characters: string[];
}): { system: string; user: string } {
  const roster = options.bots
    .map((bot) => {
      const known = bot.relations
        .map(
          (relation) =>
            `${relation.characterName} ${relation.value > 0 ? '+' : ''}${relation.value}`,
        )
        .join(', ');
      return known.length > 0 ? `- ${bot.name} (dziś: ${known})` : `- ${bot.name}`;
    })
    .join('\n');

  return {
    system: [
      'Jesteś asystentem Mistrza Gry. Czytasz streszczenie sesji i wypisujesz, jak zmieniło się' +
        ' nastawienie postaci niezależnych (NPC) do postaci graczy.',
      '',
      '# Format odpowiedzi',
      'Każda zmiana to jeden wiersz w formacie:',
      'NPC | postać | stopień | powód',
      `Stopień to liczba całkowita od ${RELATION_MIN} do ${RELATION_MAX} (${RELATION_SCALE_HELP}).`,
      'Powód to jedno krótkie zdanie oparte na streszczeniu.',
      '',
      '# Zasady',
      '1. Wypisujesz wyłącznie NPC-ów i postacie z podanych list. Nikogo nie dopisujesz.',
      '2. Proponujesz zmianę tylko wtedy, gdy w streszczeniu naprawdę coś między nimi zaszło.',
      '3. Nie piszesz nic poza wierszami w tym formacie — bez wstępu i bez podsumowania.',
      '4. Jeśli nic się nie zmieniło, odpowiadasz jednym słowem: BRAK.',
    ].join('\n'),
    user: [
      'Streszczenie sesji:',
      '',
      options.summary.trim(),
      '',
      'Postacie niezależne (NPC):',
      roster.length > 0 ? roster : '- (brak)',
      '',
      'Postacie graczy:',
      options.characters.map((name) => `- ${name}`).join('\n') || '- (brak)',
      '',
      'Wypisz zmiany nastawienia.',
    ].join('\n'),
  };
}

/** Jedna sparsowana linia propozycji — bez wiązania z id-kami. */
export interface ParsedRelationLine {
  botName: string;
  characterName: string;
  value: number;
  note: string;
}

function normalizeName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[„”"'’.,!?;:—–()[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const LABEL_TO_VALUE = new Map<string, number>(
  Object.entries(RELATION_LABELS).map(([value, label]) => [normalizeName(label), Number(value)]),
);

function parseRelationValue(raw: string): number | null {
  const text = raw.trim();
  const number = /^[+-]?\d+$/.exec(text.replace(/[−–—]/g, '-'));
  if (number) return clampRelation(Number(number[0]));
  const byLabel = LABEL_TO_VALUE.get(normalizeName(text));
  return byLabel === undefined ? null : byLabel;
}

/**
 * Dopasowanie imienia z odpowiedzi modelu do znanej nazwy.
 *
 * Polszczyzna jest fleksyjna, a model odmienia („Vexowi", „Kai"), więc po
 * dosłownym trafieniu próbujemy wspólnego przedrostka — na tyle długiego, żeby
 * nie skleić „Rico" z „Ricardo", i na tyle krótkiego, żeby złapać końcówkę.
 */
export function matchName<T extends { id: string; name: string }>(
  candidates: T[],
  mentioned: string,
): T | null {
  const needle = normalizeName(mentioned);
  if (needle.length === 0) return null;
  const exact = candidates.find((candidate) => normalizeName(candidate.name) === needle);
  if (exact) return exact;
  const stems = candidates
    .map((candidate) => ({ candidate, name: normalizeName(candidate.name) }))
    .filter(({ name }) => {
      if (name.length < 4) return false;
      const stem = name.slice(0, Math.max(4, name.length - 2));
      return needle.startsWith(stem);
    })
    .sort((a, b) => b.name.length - a.name.length);
  return stems[0]?.candidate ?? null;
}

/** Wiersze „NPC | postać | stopień | powód" z surowej odpowiedzi modelu. */
export function parseRelationLines(raw: string): ParsedRelationLine[] {
  const parsed: ParsedRelationLine[] = [];
  for (const line of raw.split('\n')) {
    const text = line.trim().replace(/^[-*•\d.)\s]+/, '');
    if (text.length === 0 || /^brak$/i.test(text)) continue;
    const parts = text.split('|').map((part) => part.trim());
    if (parts.length < 3) continue;
    const value = parseRelationValue(parts[2] ?? '');
    if (value === null) continue;
    const botName = parts[0] ?? '';
    const characterName = parts[1] ?? '';
    if (botName.length === 0 || characterName.length === 0) continue;
    parsed.push({ botName, characterName, value, note: parts[3]?.trim() ?? '' });
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Walidacja i indeks
// ---------------------------------------------------------------------------

export interface JournalValidationIssue {
  field: string;
  message: string;
}

/** ISO-owa data bez czasu; wpis dziennika opisuje dzień, nie sekundę. */
export function normalizeSessionDate(raw: unknown): string {
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
  const parsed = typeof raw === 'string' ? new Date(raw) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return date.toISOString().slice(0, 10);
}

/**
 * Treść wysyłana do indeksu. Tytuł jako nagłówek markdown — chunker z 19a wkleja
 * go w pierwszą linię KAŻDEGO fragmentu, więc model widzi, z której sesji jest
 * akapit, nawet gdy sam akapit tego nie mówi.
 */
export function journalDocumentText(entry: {
  title: string;
  body: string;
  sessionDate: string;
}): string {
  return `# ${entry.title}\n\nSesja z ${entry.sessionDate}.\n\n${entry.body}`;
}

/**
 * Odcisk treści, którą trzyma indeks RAG.
 *
 * `sharedWithPlayers` świadomie tu NIE wchodzi: odsłonięcie wpisu graczom nie
 * zmienia ani jednego bajtu tego, co widzi gateway, więc gdyby wchodziło,
 * kliknięcie „pokaż stołowi" oznaczałoby cały wpis jako nieaktualny i kazało
 * MG przeindeksować dziennik bez powodu.
 */
export function journalDigest(entry: {
  title: string;
  body: string;
  sessionDate: string;
  tags: string[];
  visibility: KnowledgeVisibility;
}): string {
  return fingerprint(
    [
      entry.title,
      entry.sessionDate,
      entry.visibility,
      [...entry.tags].sort().join(','),
      entry.body,
    ].join(' '),
  );
}

/**
 * Waliduje wpis dziennika. Ta sama funkcja chodzi u klienta (podpowiedź w
 * formularzu) i na serwerze (rozstrzygnięcie), więc oba odrzucają to samo z tym
 * samym komunikatem — jak w bazie wiedzy z 19b.
 */
export function validateJournalEntry(raw: unknown):
  | {
      ok: true;
      entry: {
        title: string;
        body: string;
        sessionDate: string;
        tags: string[];
        visibility: KnowledgeVisibility;
        sharedWithPlayers: boolean;
      };
      /** Przypięte handouty — osobno, bo to nie kolumna wpisu, tylko relacja. */
      handoutIds: string[];
    }
  | { ok: false; issues: JournalValidationIssue[] } {
  const issues: JournalValidationIssue[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, issues: [{ field: 'entry', message: 'Nieprawidłowe dane wpisu.' }] };
  }
  const input = raw as Record<string, unknown>;

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title.length === 0) issues.push({ field: 'title', message: 'Wpis musi mieć tytuł.' });
  if (title.length > JOURNAL_TITLE_MAX_LENGTH) {
    issues.push({
      field: 'title',
      message: `Tytuł jest za długi (limit ${JOURNAL_TITLE_MAX_LENGTH} znaków).`,
    });
  }

  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (body.length === 0) issues.push({ field: 'body', message: 'Wpis musi mieć treść.' });
  if (body.length > JOURNAL_BODY_MAX_LENGTH) {
    issues.push({
      field: 'body',
      message: `Treść jest za długa (limit ${JOURNAL_BODY_MAX_LENGTH} znaków).`,
    });
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    entry: {
      title,
      body,
      sessionDate: normalizeSessionDate(input.sessionDate),
      tags: normalizeKnowledgeTags(input.tags),
      // Wpis dziennika domyślnie NIE jest dla botów: streszczenie zna całą sesję,
      // także to, przy czym NPC-a nie było (rozstrzygnięcie MG, 08.08).
      visibility: input.visibility === 'bots' ? 'bots' : 'gm',
      // …ani dla stołu, i z tego samego powodu: kronika rodzi się u MG.
      sharedWithPlayers: input.sharedWithPlayers === true,
    },
    handoutIds: normalizeHandoutIds(input.handoutIds),
  };
}

/**
 * Lista id przypiętych handoutów: bez duplikatów, bez pustych, z limitem.
 *
 * Normalizacja jest ta sama co przy odbiorcach handoutu z 24a — „unikalne
 * niepuste id w kolejności podania" — więc jedzie tą samą funkcją zamiast
 * własnej kopii, która by się z nią kiedyś rozjechała.
 */
export function normalizeHandoutIds(raw: unknown): string[] {
  return normalizeRecipientIds(raw).slice(0, JOURNAL_HANDOUTS_MAX);
}

// ---------------------------------------------------------------------------
// Oś czasu i wyszukiwarka (etap 24b)
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'Styczeń',
  'Luty',
  'Marzec',
  'Kwiecień',
  'Maj',
  'Czerwiec',
  'Lipiec',
  'Sierpień',
  'Wrzesień',
  'Październik',
  'Listopad',
  'Grudzień',
];

/** Nagłówek grupy na osi czasu: „Sierpień 2026". */
export function journalMonthLabel(sessionDate: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(sessionDate);
  if (!match) return 'Bez daty';
  const month = MONTH_NAMES[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : `${match[1]}`;
}

/** Jedna grupa osi czasu — miesiąc sesji i wpisy z niego. */
export interface JournalMonthGroup<T> {
  /** `YYYY-MM`; „?" dla wpisu z popsutą datą. */
  key: string;
  label: string;
  entries: T[];
}

/**
 * Grupuje wpisy po miesiącu sesji, **zachowując podaną kolejność**.
 *
 * Sortowanie zostaje po stronie wołającego (store układa listę raz), więc ta
 * funkcja jest czystym podziałem: dwie grupy o tym samym kluczu nie powstaną,
 * bo lista przychodzi już posortowana malejąco po dacie.
 */
export function groupJournalByMonth<T extends { sessionDate: string }>(
  entries: T[],
): JournalMonthGroup<T>[] {
  const groups: JournalMonthGroup<T>[] = [];
  for (const entry of entries) {
    const key = /^\d{4}-\d{2}/.exec(entry.sessionDate)?.[0] ?? '?';
    const last = groups.at(-1);
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, label: journalMonthLabel(entry.sessionDate), entries: [entry] });
  }
  return groups;
}

/**
 * Tekst porównywalny dla wyszukiwarki: małe litery bez znaków diakrytycznych.
 *
 * Bez tego „wjazd na Zaułek" nie znajdowałby się po wpisaniu „zaulek", a przy
 * polskim stole to najczęstszy sposób pisania w pośpiechu. Rozkład NFD odcina
 * ogonki i kreski jako znaki łączące (`\p{M}`), ale `ł` nie jest literą
 * z akcentem i się nie rozkłada — stąd dla niego osobne przejście.
 */
export function foldForSearch(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase();
}

/**
 * Czy wpis pasuje do zapytania: **wszystkie** słowa muszą być w tytule albo
 * w treści. Iloczyn, nie suma — dopisanie słowa ma zawężać listę.
 *
 * Wyszukiwanie liczy się u klienta, na wpisach, które i tak już przyszły. FTS5
 * z 19a stoi po stronie gatewaya, więc oparcie o niego zakładki znaczyłoby, że
 * z martwym gatewayem dziennika nie da się przeszukać — a dziennik ma działać
 * wtedy tak samo (zasada degradacji z CLAUDE.md).
 */
export function journalMatches(entry: { title: string; body: string }, query: string): boolean {
  const words = foldForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${foldForSearch(entry.title)} ${foldForSearch(entry.body)}`;
  return words.every((word) => haystack.includes(word));
}
