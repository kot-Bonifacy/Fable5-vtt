import type { CampaignSummary, Role } from './auth.js';
import type { ChatMessageView } from './chat.js';
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

/** Client → server payload of `chat:send`. Raw input — the server parses commands. */
export interface ChatSendPayload {
  text: string;
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
