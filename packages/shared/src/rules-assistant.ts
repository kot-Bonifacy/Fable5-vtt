/**
 * Asystent zasad — kontrakt i prompt (stage 19a).
 *
 * Core VTT module: it knows about „a searchable corpus of rules text", not about
 * Cyberpunk RED. Which book got indexed is a gateway-side configuration; nothing
 * here may import from `systems/cpred`.
 *
 * Why this is NOT a bot profile: the `gm_assistant` bot type (stage 10) has a
 * persona, catchphrases and GM-taught lessons — everything that makes an answer
 * about rules less trustworthy. A rules answer has to be colourless and checkable,
 * so it skips the persona machinery entirely and is verified against the quoted
 * passages the GM can expand.
 */

/** One indexed passage, as the gateway returns it. */
export interface RulesPassage {
  chunkId: number;
  /** The passage itself — GM-only, it is copyrighted book text. */
  text: string;
  /** File the passage came from (chapter file of the manual). */
  source: string;
  chapter: string;
  section: string;
  page: number | null;
  pageEnd: number | null;
  /** Fusion score; only useful for diagnosing bad retrieval. */
  score: number;
  /** Position in the semantic / full-text ranking, or null when it missed. */
  denseRank: number | null;
  keywordRank: number | null;
}

/** State of the gateway's index, as far as the UI needs to care. */
export interface RulesIndexStatus {
  /** The RAG module is configured and its model can be loaded. */
  enabled: boolean;
  /** Enabled AND something is indexed AND the index matches the current model. */
  ready: boolean;
  model: string | null;
  device: string;
  chunks: number;
  documents: number;
  indexedAt: string | null;
  indexing: boolean;
  /** Documents processed / total, while indexing runs. */
  progress: { done: number; total: number } | null;
  /** Polish explanation of why it is not ready. */
  reason: string | null;
}

export function emptyRulesIndexStatus(): RulesIndexStatus {
  return {
    enabled: false,
    ready: false,
    model: null,
    device: 'cpu',
    chunks: 0,
    documents: 0,
    indexedAt: null,
    indexing: false,
    progress: null,
    reason: null,
  };
}

/** Client → server: one question about the rules (GM only). */
export interface RulesAskPayload {
  question: string;
  /** Show the model's reasoning; defaults to true. */
  reasoning?: boolean;
}

export const MAX_RULES_QUESTION_LENGTH = 500;

/** Server → client: which passages the answer was built from. Arrives first. */
export interface RulesSourcesBroadcast {
  requestId: string;
  passages: RulesPassage[];
  /** How long the search took — the part that does not depend on the LLM. */
  searchMs: number;
}

export interface RulesChunkBroadcast {
  requestId: string;
  kind: 'think' | 'delta';
  text: string;
}

export interface RulesDoneBroadcast {
  requestId: string;
  /** Wall-clock time from question to last token — the 15 s budget of stage 19a. */
  totalMs: number;
  completionTokens: number | null;
  /**
   * The reasoning pass produced no answer at all and the question was asked
   * again without it. Surfaced to the GM rather than hidden: it explains both a
   * long wait and a plainer answer than the toggle promised.
   */
  retriedWithoutReasoning?: boolean;
}

export interface RulesErrorBroadcast {
  requestId: string;
  code: string;
  detail?: string;
}

export interface RulesStatusBroadcast {
  status: RulesIndexStatus;
}

/**
 * How many passages go into the prompt. Measured in stage 19a: five ~420-token
 * passages plus the question and the answer stay far inside the 32k context, and
 * the model picks the right one; more passages mostly add distractors.
 */
export const RULES_TOP_K = 5;

/**
 * Cap on a single passage inside the prompt. Chunks are already ~420 tokens, but
 * a table kept whole (chunker rule 2) can be much longer — and one runaway table
 * must not push the other four passages out of the answer.
 */
export const RULES_PASSAGE_MAX_CHARS = 2400;

/** Human-readable source of a passage: „Rozdział › Sekcja, s. 186". */
export function citationOf(passage: RulesPassage): string {
  const where = [passage.chapter, passage.section].filter((part) => part.length > 0).join(' › ');
  if (passage.page === null) return where;
  const pages =
    passage.pageEnd && passage.pageEnd !== passage.page
      ? `s. ${passage.page}–${passage.pageEnd}`
      : `s. ${passage.page}`;
  return where ? `${where}, ${pages}` : pages;
}

function trimPassage(text: string): string {
  return text.length <= RULES_PASSAGE_MAX_CHARS
    ? text
    : `${text.slice(0, RULES_PASSAGE_MAX_CHARS)}…`;
}

/**
 * The system prompt. Two things carry it, both measured on a 9B model in stages
 * 09–11: numbered rules beat prose, and the model invents rules unless told —
 * explicitly and with a way out — that saying „nie ma tego w podręczniku" is the
 * expected answer, not a failure.
 */
export function buildRulesSystemPrompt(): string {
  return [
    'Jesteś asystentem Mistrza Gry. Odpowiadasz na pytania o zasady gry WYŁĄCZNIE na podstawie' +
      ' fragmentów podręcznika, które dostajesz razem z pytaniem.',
    '',
    '# Żelazne zasady',
    '1. Odpowiadasz po polsku, rzeczowo i zwięźle — kilka zdań, bez wstępów i bez powtarzania pytania.',
    '2. Opierasz się TYLKO na podanych fragmentach. Nie dopowiadasz z pamięci, nawet jeśli znasz tę grę.',
    '3. Jeśli we fragmentach nie ma odpowiedzi, mówisz wprost: „Nie ma tego w podanych fragmentach"' +
      ' i wskazujesz, czego najbliżej udało się znaleźć. To jest poprawna odpowiedź, nie porażka.',
    '4. Po każdym twierdzeniu podajesz numer fragmentu w nawiasie kwadratowym, np. [2]. Numery bierzesz' +
      ' z nagłówków fragmentów.',
    '5. Liczby (PT, obrażenia, zasięgi, modyfikatory) przepisujesz dokładnie tak, jak stoją w tekście.' +
      ' Nie przeliczasz ich i nie zaokrąglasz.',
    '6. Nie wcielasz się w postać, nie opisujesz scen i nie proponujesz fabuły — na to jest osobny bot.',
  ].join('\n');
}

/** The user turn: numbered passages, then the question. */
export function buildRulesUserPrompt(question: string, passages: RulesPassage[]): string {
  if (passages.length === 0) {
    return [
      'Nie znaleziono żadnych fragmentów podręcznika dla tego pytania.',
      '',
      `Pytanie Mistrza Gry: ${question.trim()}`,
      '',
      'Odpowiedz jednym zdaniem, że w zaindeksowanym podręczniku nie ma nic na ten temat.',
    ].join('\n');
  }

  const blocks = passages.map(
    (passage, index) => `[${index + 1}] ${citationOf(passage)}\n${trimPassage(passage.text)}`,
  );
  return [
    'Fragmenty podręcznika:',
    '',
    blocks.join('\n\n---\n\n'),
    '',
    // The question goes LAST: on a 9B model the end of the context is what gets
    // answered (measured in stage 11 — hence the role anchor in bot prompts).
    `Pytanie Mistrza Gry: ${question.trim()}`,
  ].join('\n');
}
