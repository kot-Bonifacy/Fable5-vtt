/**
 * Who answers a line typed into session chat — pure logic, no IO, so the
 * server (authoritative) and the client (hints in the GM panel) agree.
 *
 * Two ways a bot is called (stage 11 decision, deliberately not more):
 *  1. its name appears in the text — with or without the `@` prefix,
 *  2. „in scene" continuation: the line directly answers the bot's own last
 *     line in the same scene, within `BOT_CONTINUATION_WINDOW_MS`.
 *
 * A bot's own line never calls another bot — that is the loop guard.
 */

/** Optional prefix; `@Vex` and plain `Vex` work the same. */
export const BOT_MENTION_PREFIX = '@';

/** How long after a bot's line a reply still counts as talking to it. */
export const BOT_CONTINUATION_WINDOW_MS = 120_000;

/** At most this many bots answer one line (the GM may address two at once). */
export const BOT_MENTIONS_PER_MESSAGE_MAX = 2;

export interface BotMentionCandidate {
  id: string;
  name: string;
}

/**
 * Polish endings a called name may take: „Vexa", „Vexie", „Vexowi", „Vexem",
 * „Doktorze". A crude but predictable heuristic — real stemming is out of
 * scope, and a missed mention costs one repeated name, not a broken
 * conversation.
 */
const NAME_SUFFIX = '(?:owi|ami|ach|ów|ie|em|ze|ym|ą|ę|a|e|i|o|u|y|m)';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Soft consonants that turn into a digraph when inflected: Kość → Kości. */
const SOFT_ENDINGS: Record<string, string> = { ć: 'ci', ń: 'ni', ś: 'si', ź: 'zi' };

/** One word of a name, with the optional Polish ending. */
function wordPattern(word: string): string {
  const stem = escapeRegExp(word);
  const alternatives = [`${stem}${NAME_SUFFIX}?`];
  // Words ending in „a" inflect by replacing it: Sasha → Sashy, Sashę, Sashą.
  if (/a$/i.test(word)) alternatives.push(`${escapeRegExp(word.slice(0, -1))}${NAME_SUFFIX}`);
  const soft = SOFT_ENDINGS[word.slice(-1).toLowerCase()];
  if (soft) alternatives.push(`${escapeRegExp(word.slice(0, -1))}${soft}${NAME_SUFFIX}?`);
  return `(?:${alternatives.join('|')})`;
}

/**
 * Matches a name with an optional `@` and Polish inflection on EVERY word —
 * „Doktorze Kość" has to find the bot „Doktor Kość" (found in the live test of
 * stage 11: inflecting only the last word missed the vocative).
 *
 * Word boundaries are `\p{L}`-based on purpose: `\b` is ASCII-only in JS, so
 * it could not tell „Vexa" (a mention) from „Vexanne" (a different word).
 */
function mentionPattern(name: string): RegExp {
  const body = name
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map(wordPattern)
    .join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}_])@?${body}(?![\\p{L}\\p{N}_])`, 'iu');
}

/**
 * Ids of bots named in the text, in order of appearance. Longer names win over
 * shorter ones contained in them („Pan Kowalski" is not also „Pan").
 */
export function findBotMentions(text: string, bots: BotMentionCandidate[]): string[] {
  if (typeof text !== 'string' || text.length === 0) return [];
  const ordered = [...bots]
    .filter((bot) => typeof bot?.name === 'string' && bot.name.trim().length > 0)
    .sort((a, b) => b.name.length - a.name.length);

  const found: { id: string; index: number }[] = [];
  let rest = text;
  for (const bot of ordered) {
    const match = mentionPattern(bot.name.trim()).exec(rest);
    if (!match) continue;
    found.push({ id: bot.id, index: match.index });
    // Blank the matched span so a shorter name inside it cannot match again.
    rest =
      rest.slice(0, match.index) +
      ' '.repeat(match[0].length) +
      rest.slice(match.index + match[0].length);
  }
  return found.sort((a, b) => a.index - b.index).map((entry) => entry.id);
}

/** Where the triggering line came from — decides how far a call may reach. */
export type BotTriggerOrigin =
  /** A human at the table. */
  | 'user'
  /** The GM speaking as a bot (`/jako`) — may call another bot by name. */
  | 'gm_as_bot'
  /** A generated bot line — never calls anyone (loop guard). */
  | 'bot';

export interface BotTriggerCandidate {
  id: string;
  name: string;
  /** „In session" — set by the GM; an inactive bot never speaks. */
  active: boolean;
  /** Scene the bot is pinned to; null = answers mentions in any scene. */
  sceneId: string | null;
  archived?: boolean;
}

export interface BotTriggerInput {
  text: string;
  origin: BotTriggerOrigin;
  /** Scene the line was spoken in; null when no scene is active. */
  sceneId: string | null;
  /** The message directly preceding this one in the same scene. */
  previous?: { botId: string | null; agoMs: number } | null;
  /**
   * Bot that spoke this line — it must not answer itself. Matters for `/jako`:
   * „Rina nie wybacza" typed as Rina would otherwise call Rina.
   */
  excludeBotId?: string | null;
  bots: BotTriggerCandidate[];
}

/**
 * Bots that should answer one line, in the order they were called. Empty means
 * nobody was addressed — the overwhelmingly common case, so this must stay
 * cheap and side-effect free.
 */
export function selectBotsToAnswer(input: BotTriggerInput): string[] {
  if (input.origin === 'bot') return [];

  // A pinned bot exists only in its own scene; an unpinned one answers to its
  // name anywhere.
  const present = input.bots.filter(
    (bot) =>
      bot.active &&
      bot.archived !== true &&
      bot.id !== input.excludeBotId &&
      (bot.sceneId === null || bot.sceneId === input.sceneId),
  );
  if (present.length === 0) return [];

  const mentioned = findBotMentions(input.text, present);
  if (mentioned.length > 0) return mentioned.slice(0, BOT_MENTIONS_PER_MESSAGE_MAX);

  // Continuation is the „in scene" mode: only a bot pinned to this very scene
  // keeps a thread going without being named again.
  if (input.origin !== 'user' || input.sceneId === null) return [];
  const previous = input.previous;
  if (!previous?.botId || previous.agoMs > BOT_CONTINUATION_WINDOW_MS) return [];
  const bot = present.find((candidate) => candidate.id === previous.botId);
  if (!bot || bot.sceneId !== input.sceneId) return [];
  return [bot.id];
}
