import { findBotMentions } from './mentions.js';
import type { BotType } from './types.js';

/**
 * Keeping a bot in character has two independent layers here:
 *
 *  1. `sanitizeBotReply` — what the table actually sees. Removes the artefacts
 *     a small model produces (own-name prefix, stage directions in asterisks,
 *     hallucinated dialogue of other characters) without a second generation.
 *  2. `detectBotBreak` — did the model genuinely step out of the fiction?
 *     The server uses it to regenerate once with a stronger reminder and, if
 *     that also fails, to warn the GM (who can turn the slip into a lesson).
 *
 * Both are pure functions with no IO, so the same rules apply to the editor's
 * test conversation (stage 10) and to session chat (stage 11).
 */

export type BotBreakReason =
  'empty' | 'ai_self_reference' | 'meta' | 'mechanics' | 'impersonation' | 'language';

/** Polish labels shown to the GM and pasted into the retry reminder. */
export const BOT_BREAK_LABELS: Record<BotBreakReason, string> = {
  empty: 'pusta odpowiedź',
  ai_self_reference: 'przyznanie się do bycia sztuczną inteligencją',
  meta: 'komentarz spoza świata gry',
  mechanics: 'mówienie o mechanice gry',
  impersonation: 'mówienie w imieniu innej postaci',
  language: 'odpowiedź nie po polsku',
};

export const BOT_REPLY_MAX_CHARS = 900;
export const BOT_ASSISTANT_REPLY_MAX_CHARS = 6000;

export interface BotGuardOptions {
  botName: string;
  type: BotType;
  /** Names at the table — used to spot dialogue written for someone else. */
  participants?: string[];
  maxChars?: number;
}

/** `Imię:` at the start of a line — either the bot's own label or a slip. */
const SPEAKER_LINE = /^\s*([\p{L}][\p{L} .'’-]{0,24}?)\s*:\s*(.*)$/u;

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Is this speaker label that person's name? Inflection has to be tolerated:
 * the model labels its own line „Doktorze Kość:" (vocative) as happily as
 * „Doktor Kość:", and an unrecognized label used to be published verbatim.
 */
function isNameOf(label: string, name: string): boolean {
  if (normalizeName(label) === normalizeName(name)) return true;
  return findBotMentions(label, [{ id: 'name', name }]).length > 0;
}

function cutToSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, maxChars);
  const lastStop = Math.max(head.lastIndexOf('.'), head.lastIndexOf('!'), head.lastIndexOf('?'));
  // Only cut on a sentence end if it does not throw away half the answer.
  if (lastStop > maxChars * 0.5) return head.slice(0, lastStop + 1);
  return `${head.trimEnd()}…`;
}

/**
 * Cleans one raw model answer. Returns the text to publish plus whether
 * anything had to be removed (the GM sees a hint in the editor).
 */
export function sanitizeBotReply(
  raw: string,
  options: BotGuardOptions,
): { text: string; changed: boolean } {
  const source = raw.replace(/\r/g, '').trim();
  const maxChars =
    options.maxChars ??
    (options.type === 'gm_assistant' ? BOT_ASSISTANT_REPLY_MAX_CHARS : BOT_REPLY_MAX_CHARS);

  // The GM assistant is allowed to write lists, headings and mechanics.
  if (options.type === 'gm_assistant') {
    const text = cutToSentence(source, maxChars);
    return { text, changed: text !== source };
  }

  const botName = normalizeName(options.botName);
  // Only a name that belongs to somebody at the table counts as a speaker
  // label. Anything else („Krótko: nie.", „Cena: dwa tysiące") is an ordinary
  // Polish sentence — treating every word before a colon as dialogue used to
  // throw whole answers away (found by the stage 11 tests).
  const others = (options.participants ?? []).filter(
    (name) => name.trim().length > 0 && normalizeName(name) !== botName,
  );
  const lines: string[] = [];
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) {
      lines.push('');
      continue;
    }
    // A whole line in brackets/parentheses is a stage direction or an OOC note.
    if (/^[([{*_].*[)\]}*_]$/.test(line) && line.length > 2) continue;

    const speaker = SPEAKER_LINE.exec(line);
    if (speaker) {
      const who = speaker[1] ?? '';
      if (isNameOf(who, options.botName)) {
        // The model labelled its own line — keep the content, drop the label.
        lines.push((speaker[2] ?? '').trim());
        continue;
      }
      // Somebody else at the table: the model started writing the scene for
      // them. Cut everything from here on.
      if (others.some((name) => isNameOf(who, name))) break;
    }
    lines.push(line);
  }

  let text = lines
    .join('\n')
    // Inline stage directions: *zapala papierosa*, _wzdycha_.
    .replace(/\*[^*\n]{1,120}\*/g, '')
    .replace(/_[^_\n]{1,120}_/g, '')
    .replace(/[*_`#]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // A fully quoted answer („…") reads as a quotation of someone else.
  const quoted = /^[„"'](.*)["'"]$/s.exec(text);
  if (quoted?.[1] && !quoted[1].includes('"')) text = quoted[1].trim();

  text = cutToSentence(text, maxChars);
  return { text, changed: text !== source };
}

// `\w` is ASCII-only in JS, so Polish endings need explicit letter classes —
// „sztuczną inteligencją" would slip through a `sztuczn\w+` pattern.
const AI_PATTERNS: RegExp[] = [
  /jako\s+(sztuczn[\p{L}]+\s+inteligencj[\p{L}]+|model[\p{L}]*\s+j[eę]zykow[\p{L}]*|asystent[\p{L}]*|bot|program)/iu,
  /jestem\s+(tylko\s+)?(sztuczn[\p{L}]+\s+inteligencj[\p{L}]+|modelem|botem|programem|asystentem|ai\b)/iu,
  /(model[\p{L}]*\s+j[eę]zykow[\p{L}]*|sztuczn[\p{L}]+\s+inteligencj[\p{L}]+|czat\s?bot[\p{L}]*)/iu,
  /\b(as an ai|language model|i'?m an ai|chat\s?bot)\b/i,
];

const META_PATTERNS: RegExp[] = [
  /(system\s?prompt|prompt[\p{L}]*\s+systemow[\p{L}]*|moje\s+instrukcje|zgodnie\s+z\s+instrukcj[\p{L}]+|moich\s+wytycznych)/iu,
  /(nie\s+mogę\s+(spełnić|tego\s+zrobić|pomóc\s+w\s+tym)|przepraszam,\s+ale\s+nie\s+mogę)/iu,
  /\bOOC\b/,
  /(poza\s+grą|out\s+of\s+character|mistrz[\p{L}]*\s+gry|sesj[\p{L}]+\s+rpg|gr[\p{L}]+\s+fabularn[\p{L}]+)/iu,
];

const MECHANICS_PATTERNS: RegExp[] = [
  /\b\d+\s?[dk]\s?\d{1,3}\b/i,
  /\b[dk]10\b/i,
  /\bDV\s?\d{1,2}\b/,
  /punkt[\p{L}]*\s+(życia|zdrowia)/iu,
  /(rzut[\p{L}]*\s+na\s+[\p{L}]+|rzuć\s+(kość|kostk[\p{L}]+|k10)|test\s+umiejętnoś[\p{L}]+|klas[\p{L}]+\s+trudności|poziom\s+umiejętnoś[\p{L}]+)/iu,
];

/** Cyrillic/Greek text, or Latin text with no Polish marks and English glue words. */
function looksNotPolish(text: string): boolean {
  if (/[Ѐ-ӿͰ-Ͽ]/.test(text)) return true;
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length < 40) return false;
  if (/[ąćęłńóśźż]/i.test(text)) return false;
  const english =
    text.match(/\b(the|and|you|your|is|are|with|that|this|for|have|not|but|what|about)\b/gi)
      ?.length ?? 0;
  return english >= 3;
}

/**
 * Looks at the RAW answer (before sanitizing) so a slip is noticed even when
 * the cleanup would have hidden it. `null` = the bot stayed in character.
 */
export function detectBotBreak(raw: string, options: BotGuardOptions): BotBreakReason | null {
  const text = raw.trim();
  if (text.length === 0) return 'empty';
  if (looksNotPolish(text)) return 'language';
  // The assistant *is* a helper and talks rules — only language matters there.
  if (options.type === 'gm_assistant') return null;

  if (AI_PATTERNS.some((pattern) => pattern.test(text))) return 'ai_self_reference';
  if (META_PATTERNS.some((pattern) => pattern.test(text))) return 'meta';
  if (MECHANICS_PATTERNS.some((pattern) => pattern.test(text))) return 'mechanics';

  const botName = normalizeName(options.botName);
  for (const participant of options.participants ?? []) {
    const who = normalizeName(participant);
    if (who.length === 0 || who === botName) continue;
    const escaped = who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`^\\s*${escaped}\\s*:`, 'im').test(text)) return 'impersonation';
  }
  return null;
}
