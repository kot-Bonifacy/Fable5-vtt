import type { AiStatus } from './ai.js';
import type { CampaignSummary, Role } from './auth.js';
import type { BotView } from './bots/types.js';
import type { ChatMessageView } from './chat.js';
import type { CombatView } from './combat.js';
import type { CharacterView } from './characters.js';
import type { CompendiumEntry, WeaponTypeDefinition } from './systems/cpred/compendium.js';
import type { RollToss } from './dice.js';
import type { SceneSummary, SceneView } from './scenes.js';
import type { TokenView } from './tokens.js';

/** Server → client payload confirming a successful Socket.IO handshake. */
export interface ServerHello {
  serverTime: string;
  version: string;
}

/** One online user in a campaign room (deduplicated across tabs). */
export interface PresenceEntry {
  userId: string;
  name: string;
  role: Role;
}

/**
 * Full room state pushed by the server on connect, after reconnect and on
 * `state:request`. `seq` is the room's sequence counter — room-wide broadcasts
 * carry consecutive values, a gap on the client means a missed event and
 * triggers a resync.
 */
export interface StateSyncPayload {
  seq: number;
  campaign: CampaignSummary | null;
  presence: PresenceEntry[];
  /** Latest chat messages visible to this user, ascending by id. */
  messages: ChatMessageView[];
  hasMoreHistory: boolean;
  /** Scene this socket is viewing (players: the active scene; GM: any). */
  scene: SceneView | null;
  /** All campaign scenes — GM only, always empty for players. */
  scenes: SceneSummary[];
  /** Tokens of the viewed scene, already filtered for this viewer. */
  tokens: TokenView[];
  /** Characters this user may see: the GM gets all, a player only their own. */
  characters: CharacterView[];
  /** Bot profiles — GM only (they carry secrets), always empty for players. */
  bots: BotView[];
  /** Bot availability, filtered by role (players get no diagnostics). */
  ai: AiStatus;
  /** Item catalogue — the same for everyone; players pick gear from it. */
  compendium: CompendiumSyncPayload;
  /** Combat of the viewed scene, filtered for this viewer; null = no fight. */
  combat: CombatView | null;
}

/** Weapon base rows plus every entry: imported ones and the GM's own. */
export interface CompendiumSyncPayload {
  weaponTypes: WeaponTypeDefinition[];
  entries: CompendiumEntry[];
}

/** GM writes one of the campaign's own compendium entries. */
export interface CompendiumUpsertPayload {
  entry: unknown;
}

export interface CompendiumIdPayload {
  id: string;
}

export interface CompendiumUpsertBroadcast {
  seq: number;
  entry: CompendiumEntry;
}

export interface CompendiumDeleteBroadcast {
  seq: number;
  id: string;
}

/** Payload of `chat:message`. `seq` is absent for targeted whisper deliveries. */
export interface ChatMessageBroadcast {
  seq?: number;
  message: ChatMessageView;
}

/** Payload of `presence:update`. */
export interface PresenceBroadcast {
  seq: number;
  presence: PresenceEntry[];
}

/**
 * Physical shake gesture accompanying a roll command. The entropy digest is
 * MIXED into the server's crypto randomness (the gesture genuinely influences
 * the outcome, but can never be predicted or steered); the strength and toss
 * only drive the 3D animation.
 */
export interface RollGesture {
  /** Digest of the mouse-shake samples (hex, client-computed). */
  entropy: string;
  /** Toss strength 0–3 (shake speed) — animation boost for all viewers. */
  strength: number;
  /** Release direction + point, so every viewer replays the same throw. */
  toss?: RollToss;
}

export const MAX_GESTURE_ENTROPY_LENGTH = 256;
export const MAX_GESTURE_STRENGTH = 3;

/** Client → server payload of `chat:send`. Raw input — the server parses commands. */
export interface ChatSendPayload {
  text: string;
  /** Present when the roll was thrown with the dice cup. */
  gesture?: RollGesture;
}

/**
 * Client → server payload of `character:roll` — a check rolled from a sheet.
 * The request itself is system-specific (CP RED: `CpredRollRequest`), so the
 * core protocol only carries it; the server's system module validates it.
 */
export interface CharacterRollPayload<TRequest = unknown> {
  characterId: string;
  request: TRequest;
  /** `gm` = result visible to the author and the GM only (whisper pattern). */
  visibility: 'public' | 'gm';
  /** Present when the roll was thrown with the dice cup. */
  gesture?: RollGesture;
}

/**
 * A player (or the GM) rolls initiative for one participant. Lives here rather
 * than in `combat.ts` because it carries the cup gesture — the tracker itself
 * knows nothing about dice.
 */
export interface CombatRollPayload {
  combatantId: string;
  gesture?: RollGesture;
}

/** Client → server payload of `chat:history`. */
export interface ChatHistoryRequest {
  /** Return messages with id lower than this (exclusive). */
  beforeId: number;
  limit?: number;
}

/** Ack data of `chat:history`. Messages ascending by id. */
export interface ChatHistoryPage {
  messages: ChatMessageView[];
  hasMore: boolean;
}

export const PROTOCOL_VERSION = '0.1.0';

export function createServerHello(now: Date = new Date()): ServerHello {
  return {
    serverTime: now.toISOString(),
    version: PROTOCOL_VERSION,
  };
}
