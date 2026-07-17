/** Chat message types and the chat command parser (pure logic, no IO). */

export type ChatKind = 'say' | 'whisper';

/** A chat message as seen by clients. Whisper fields are present only for whispers. */
export interface ChatMessageView {
  id: number;
  kind: ChatKind;
  authorId: string;
  authorName: string;
  recipientId?: string;
  recipientName?: string;
  text: string;
  /** ISO timestamp — always assigned by the server. */
  createdAt: string;
}

export const MAX_CHAT_MESSAGE_LENGTH = 2000;
export const CHAT_HISTORY_PAGE_SIZE = 50;

/** Aliases accepted for the whisper command (without the leading slash). */
export const WHISPER_ALIASES = ['w', 'whisper', 'szept'];

/** One-line help shown next to "unknown command" errors. */
export const CHAT_COMMANDS_HELP = 'Dostępne komendy: /w <imię> <treść> (szept)';

export type ParsedChatInput =
  | { kind: 'empty' }
  | { kind: 'say'; text: string }
  | { kind: 'whisper'; targetName: string; text: string }
  | { kind: 'invalid-whisper'; reason: 'MISSING_TARGET' | 'MISSING_TEXT' }
  | { kind: 'unknown-command'; command: string };

/**
 * Splits whisper arguments into target name and message text.
 *
 * Target resolution order:
 * 1. a name in quotes: `"Jan Kowalski" cześć`,
 * 2. the longest case-insensitive prefix matching one of `knownNames`
 *    (handles names with spaces without quoting),
 * 3. the first whitespace-separated token.
 */
function splitWhisperArgs(
  args: string,
  knownNames: string[],
): { targetName: string; text: string } | null {
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
 * Parses raw chat input into an intention. Extensible: new commands (e.g. /r
 * in stage 06) get their own alias list and branch here.
 *
 * `knownNames` (campaign roster) improves whisper parsing for names with
 * spaces; the caller (server) remains authoritative for target resolution.
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

  if (WHISPER_ALIASES.includes(command)) {
    if (args.length === 0) return { kind: 'invalid-whisper', reason: 'MISSING_TARGET' };
    const split = splitWhisperArgs(args, knownNames);
    if (!split) return { kind: 'invalid-whisper', reason: 'MISSING_TARGET' };
    if (split.text.length === 0) return { kind: 'invalid-whisper', reason: 'MISSING_TEXT' };
    return { kind: 'whisper', targetName: split.targetName, text: split.text };
  }

  return { kind: 'unknown-command', command };
}
