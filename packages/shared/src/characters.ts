/**
 * Core (system-agnostic) character wire types. The sheet's contents live in
 * the opaque `data` payload — its shape, validation and derived values belong
 * to the game-system module (`systems/cpred`), never to the VTT core.
 *
 * Visibility rule: a character is delivered only to its owner and the GM.
 * All character emissions are targeted (owner sockets + GM room) and carry no
 * room seq — the pattern used by whispers and gmrolls.
 */

// Type-only: `protocol.ts` imports `CharacterView` from here, so a value
// import would close a cycle. The gesture lives there with the other roll
// payloads that carry one.
import type { RollGesture } from './protocol.js';

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

/**
 * Server → client: the wizard's stored draft (stage 25a).
 *
 * The draft's contents are opaque here for the same reason a sheet's are —
 * their shape belongs to the game-system module, not to the VTT core.
 */
export interface CreationDraftView<TDraft = unknown> {
  draft: TDraft;
  updatedAt: string;
}

/** Client → server `creation:patch`; top-level keys replace the stored ones. */
export interface CreationPatchPayload {
  patch: Record<string, unknown>;
}

/**
 * Client → server `creation:roll` — the whole stat spread, one d10 per stat.
 *
 * The gesture is the point rather than a decoration: the shake's entropy is
 * mixed into the server's RNG, so the hand that threw the cup genuinely picks
 * which of the equally likely spreads comes out. A player rolls their character
 * up the same way they roll everything else at this table; the GM has a plain
 * button as well, because a GM builds five NPCs in an evening.
 */
export interface CreationRollPayload {
  gesture?: RollGesture;
}

/** Client → server `creation:finish` — turns the draft into a real character. */
export interface CreationFinishPayload {
  /** GM only; players always own what they create. */
  ownerId?: string | null;
}

/**
 * Body of `GET /api/cpred` — the system data files as the **server** reads
 * them.
 *
 * Until stage 25a the client fetched `/public/cpred/skills.json` straight off
 * the static route, which meant it only ever saw the sample list in the repo
 * while the server validated against the full private one: 24 skills existed
 * on the server and could not be set on a sheet. One endpoint, one registry.
 */
export interface CpredDataPayload {
  skills: unknown[];
  roles: unknown[];
  /** Character-creation tables (stage 25a); null when no data file was found. */
  creation: unknown;
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
