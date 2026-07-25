/** Chat message types and the chat command parser (pure logic, no IO). */

import {
  parseRollNotation,
  type RollFormula,
  type RollParseError,
  type RollResult,
} from './dice.js';

export type ChatKind = 'say' | 'whisper' | 'roll' | 'gmroll';

/** A chat message as seen by clients. Whisper fields are present only for whispers. */
export interface ChatMessageView {
  id: number;
  kind: ChatKind;
  /**
   * Author's user account. An NPC line (bot-generated or typed by the GM with
   * `/jako`) is authored by the GM who runs the bot — the two are
   * indistinguishable on purpose, so players cannot tell a bot from the GM.
   */
  authorId: string;
  /** Display name: the user's, or the NPC's when `botId` is set. */
  authorName: string;
  /** Set when the line was spoken by a bot profile. */
  botId?: string;
  /** NPC portrait (`/uploads/...`); NPC lines only. */
  portraitUrl?: string | null;
  recipientId?: string;
  /** Whisper addressed to a bot. */
  recipientBotId?: string;
  recipientName?: string;
  /** For rolls: the optional label typed after the notation. */
  text: string;
  /** Structured roll outcome — present only for kinds `roll` and `gmroll`. */
  roll?: RollResult;
  /** ISO timestamp — always assigned by the server. */
  createdAt: string;
}

export const MAX_CHAT_MESSAGE_LENGTH = 2000;
export const CHAT_HISTORY_PAGE_SIZE = 50;

/** Aliases accepted for the whisper command (without the leading slash). */
export const WHISPER_ALIASES = ['w', 'whisper', 'szept'];

/** Aliases of the public roll command. */
export const ROLL_ALIASES = ['r', 'roll', 'rzut'];

/** Aliases of the GM roll command (result visible to the author and GMs only). */
export const GM_ROLL_ALIASES = ['gr', 'gmroll'];

/** Aliases of „speak as this NPC" — GM only, no model involved. */
export const AS_BOT_ALIASES = ['jako', 'as'];

/** One-line help shown next to "unknown command" errors. */
export const CHAT_COMMANDS_HELP =
  'Dostępne komendy: /w <imię> <treść> (szept), /r <formuła> [etykieta] (rzut), /gr <formuła> (rzut widoczny dla MG), /jako <bot> <treść> (MG mówi jako NPC)';

export type ParsedChatInput =
  | { kind: 'empty' }
  | { kind: 'say'; text: string }
  | { kind: 'whisper'; targetName: string; text: string }
  | { kind: 'invalid-whisper'; reason: 'MISSING_TARGET' | 'MISSING_TEXT' }
  | { kind: 'roll'; visibility: 'public' | 'gm'; formula: RollFormula; label?: string }
  | { kind: 'invalid-roll'; reason: 'MISSING_NOTATION' | RollParseError }
  /** GM speaks in a bot's name; `targetName` is the bot. */
  | { kind: 'as-bot'; targetName: string; text: string }
  | { kind: 'invalid-as-bot'; reason: 'MISSING_TARGET' | 'MISSING_TEXT' }
  | { kind: 'unknown-command'; command: string };

/**
 * Splits „<target> <text>" arguments (whisper, `/jako`) into name and text.
 *
 * Target resolution order:
 * 1. a name in quotes: `"Jan Kowalski" cześć`,
 * 2. the longest case-insensitive prefix matching one of `knownNames`
 *    (handles names with spaces without quoting),
 * 3. the first whitespace-separated token.
 *
 * A leading `@` is accepted and dropped, so `/w @Vex` works exactly like the
 * `@Vex` mention syntax used to call bots in ordinary messages.
 */
function splitTargetArgs(
  rawArgs: string,
  knownNames: string[],
): { targetName: string; text: string } | null {
  const args = rawArgs.startsWith('@') ? rawArgs.slice(1).trimStart() : rawArgs;
  if (args.length === 0) return null;
  const quoted = /^"([^"]+)"\s*(.*)$/s.exec(args) ?? /^'([^']+)'\s*(.*)$/s.exec(args);
  if (quoted) {
    return { targetName: quoted[1]!.trim(), text: quoted[2]!.trim() };
  }

  const argsLower = args.toLowerCase();
  let match: { name: string; length: number } | null = null;
  for (const name of knownNames) {
    const nameLower = name.toLowerCase();
    if (!argsLower.startsWith(nameLower)) continue;
    const rest = args.slice(name.length);
    if (rest.length > 0 && !/^\s/.test(rest)) continue; // name must end on a word boundary
    if (!match || name.length > match.length) {
      match = { name, length: name.length };
    }
  }
  if (match) {
    return { targetName: match.name, text: args.slice(match.length).trim() };
  }

  const firstToken = /^(\S+)\s*(.*)$/s.exec(args);
  if (!firstToken) return null;
  return { targetName: firstToken[1]!, text: firstToken[2]!.trim() };
}

/**
 * Splits roll-command arguments into notation and label. The whole argument
 * string is tried first (so `/r 1d10 + 5` works); otherwise the first token
 * is the notation and the rest becomes the label (`/r 1d10+5 atak z bliska`).
 */
function parseRollArgs(visibility: 'public' | 'gm', args: string): ParsedChatInput {
  if (args.length === 0) return { kind: 'invalid-roll', reason: 'MISSING_NOTATION' };

  const whole = parseRollNotation(args);
  if (whole.ok) return { kind: 'roll', visibility, formula: whole.formula };

  const split = /^(\S+)\s*(.*)$/s.exec(args);
  const first = parseRollNotation(split?.[1] ?? '');
  if (!first.ok) return { kind: 'invalid-roll', reason: first.error };

  const label = (split?.[2] ?? '').trim();
  return { kind: 'roll', visibility, formula: first.formula, ...(label ? { label } : {}) };
}

/**
 * Parses raw chat input into an intention. Extensible: new commands get their
 * own alias list and branch here.
 *
 * `knownNames` (campaign roster plus the GM's bots) improves parsing of names
 * with spaces; the caller (server) remains authoritative for target resolution
 * and for who may be addressed at all.
 */
export function parseChatInput(raw: string, knownNames: string[] = []): ParsedChatInput {
  const input = raw.trim();
  if (input.length === 0) return { kind: 'empty' };

  // "//tekst" escapes the command prefix and sends "/tekst" as a message.
  if (input.startsWith('//')) return { kind: 'say', text: input.slice(1) };
  if (!input.startsWith('/')) return { kind: 'say', text: input };

  const parsed = /^\/(\S*)\s*(.*)$/s.exec(input);
  const command = (parsed?.[1] ?? '').toLowerCase();
  const args = (parsed?.[2] ?? '').trim();

  if (ROLL_ALIASES.includes(command) || GM_ROLL_ALIASES.includes(command)) {
    const visibility = GM_ROLL_ALIASES.includes(command) ? 'gm' : 'public';
    return parseRollArgs(visibility, args);
  }

  if (WHISPER_ALIASES.includes(command)) {
    if (args.length === 0) return { kind: 'invalid-whisper', reason: 'MISSING_TARGET' };
    const split = splitTargetArgs(args, knownNames);
    if (!split) return { kind: 'invalid-whisper', reason: 'MISSING_TARGET' };
    if (split.text.length === 0) return { kind: 'invalid-whisper', reason: 'MISSING_TEXT' };
    return { kind: 'whisper', targetName: split.targetName, text: split.text };
  }

  if (AS_BOT_ALIASES.includes(command)) {
    if (args.length === 0) return { kind: 'invalid-as-bot', reason: 'MISSING_TARGET' };
    const split = splitTargetArgs(args, knownNames);
    if (!split) return { kind: 'invalid-as-bot', reason: 'MISSING_TARGET' };
    if (split.text.length === 0) return { kind: 'invalid-as-bot', reason: 'MISSING_TEXT' };
    return { kind: 'as-bot', targetName: split.targetName, text: split.text };
  }

  return { kind: 'unknown-command', command };
}
