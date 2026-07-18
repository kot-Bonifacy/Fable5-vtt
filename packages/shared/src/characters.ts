/**
 * Core (system-agnostic) character wire types. The sheet's contents live in
 * the opaque `data` payload — its shape, validation and derived values belong
 * to the game-system module (`systems/cpred`), never to the VTT core.
 *
 * Visibility rule: a character is delivered only to its owner and the GM.
 * All character emissions are targeted (owner sockets + GM room) and carry no
 * room seq — the pattern used by whispers and gmrolls.
 */

export const CHARACTER_NAME_MAX_LENGTH = 64;

/** A character as seen by someone allowed to see it (the owner or the GM). */
export interface CharacterView<TData = unknown> {
  id: string;
  name: string;
  /** Owning player's user id; null = GM-controlled (NPC). */
  ownerId: string | null;
  /** `/uploads/...` portrait; null renders a placeholder. */
  portraitUrl: string | null;
  /** System-specific sheet payload (validated by the system module). */
  data: TData;
  updatedAt: string;
}

/** Client → server payload of `character:create`. */
export interface CharacterCreatePayload {
  name: string;
  /** GM only; players always own the characters they create. */
  ownerId?: string | null;
}

/** Mutable character fields; a patch carries any subset. */
export interface CharacterPatch {
  name?: string;
  /** GM only. */
  ownerId?: string | null;
  portraitUrl?: string | null;
  /** Partial system data — top-level keys replace the stored ones. */
  data?: Record<string, unknown>;
}

/** Client → server payload of `character:update`. */
export interface CharacterUpdatePayload {
  characterId: string;
  patch: CharacterPatch;
}

/** Client → server payload of `character:delete` (owner or GM). */
export interface CharacterIdPayload {
  characterId: string;
}

/** Server → client `character:upsert` — always targeted, never sequenced. */
export interface CharacterUpsertBroadcast {
  character: CharacterView;
}

/** Server → client `character:delete` — also sent to a player who lost ownership. */
export interface CharacterDeleteBroadcast {
  characterId: string;
}

/** Ack data of the portrait upload (`POST /api/uploads/portraits`). */
export interface PortraitUploadResult {
  url: string;
  width: number;
  height: number;
}

/** Trims and validates a character name; returns null when invalid. */
export function sanitizeCharacterName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > CHARACTER_NAME_MAX_LENGTH) return null;
  return trimmed;
}
