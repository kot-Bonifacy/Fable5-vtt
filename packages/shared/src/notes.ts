/**
 * GM layer notes (stage 17) — core VTT, no game system involved.
 *
 * A note is a pin dropped on the map with text behind it: „za tymi drzwiami
 * czeka zasadzka", „tu leży karta dostępu". It lives entirely on the GM layer,
 * which is not a CSS trick — the server only ever emits notes into the GM room,
 * so a player's socket never receives one, no matter what their client asks
 * for.
 */

export const NOTE_TEXT_MAX_LENGTH = 2000;

/**
 * Pin icons the GM can choose from. A closed set rather than free text, so a
 * note can never smuggle arbitrary markup onto someone's map.
 */
export const NOTE_ICONS = ['📌', '💀', '🔑', '⚠️', '💬', '💰', '🚪', '👁️', '🔥', '❓'] as const;
export type NoteIcon = (typeof NOTE_ICONS)[number];
export const DEFAULT_NOTE_ICON: NoteIcon = '📌';

/** One note on the GM layer. Never leaves the server for a player socket. */
export interface MapNoteView {
  id: string;
  sceneId: string;
  /** Pin tip position in scene (world) pixels. */
  x: number;
  y: number;
  icon: NoteIcon;
  text: string;
}

/** Client → server payload of `note:create`. */
export interface NoteCreatePayload {
  sceneId: string;
  x: number;
  y: number;
  text: string;
  icon?: string;
}

/** Mutable note fields; a patch carries any subset. */
export interface NotePatch {
  x?: number;
  y?: number;
  text?: string;
  icon?: NoteIcon;
}

/** Client → server payload of `note:update`. */
export interface NoteUpdatePayload {
  noteId: string;
  patch: NotePatch;
}

/** Client → server payload of `note:delete`. */
export interface NoteIdPayload {
  noteId: string;
}

/**
 * Server → client `note:upsert` / `note:delete`. Both are GM-room only and
 * therefore carry no seq: the campaign sequence counts events every client is
 * expected to receive, and a targeted emission must never create a gap.
 */
export interface NoteUpsertBroadcast {
  note: MapNoteView;
}

export interface NoteDeleteBroadcast {
  sceneId: string;
  noteId: string;
}

/** Trims and bounds note text; returns null when nothing usable is left. */
export function sanitizeNoteText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > NOTE_TEXT_MAX_LENGTH) return null;
  return trimmed;
}

/** Falls back to the default pin for anything not in the closed icon set. */
export function sanitizeNoteIcon(raw: unknown): NoteIcon {
  return NOTE_ICONS.includes(raw as NoteIcon) ? (raw as NoteIcon) : DEFAULT_NOTE_ICON;
}

/** Normalizes an untrusted note patch; null when the patch itself is unusable. */
export function sanitizeNotePatch(raw: unknown): NotePatch | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const patch: NotePatch = {};
  if ('text' in input) {
    const text = sanitizeNoteText(input.text);
    if (text === null) return null;
    patch.text = text;
  }
  if ('icon' in input) patch.icon = sanitizeNoteIcon(input.icon);
  if (typeof input.x === 'number' && Number.isFinite(input.x)) patch.x = Math.round(input.x);
  if (typeof input.y === 'number' && Number.isFinite(input.y)) patch.y = Math.round(input.y);
  return patch;
}
