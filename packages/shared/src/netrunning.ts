import type {
  CpredNetArchitecture,
  CpredNetPosition,
  NetAbilityId,
  NetDifficulty,
  NetRunView,
} from './systems/cpred/index.js';
import type { RollGesture } from './protocol.js';

/**
 * Wire shapes of the Net Architecture library (stage 26a).
 *
 * Everything here is GM-only. An architecture carries the DVs, the Black ICE and
 * the GM's notes about what each floor actually runs in the real world, so the
 * whole payload goes to `gmRoom` and nowhere else — the same rule as the
 * campaign knowledge base from 19b. What a player eventually sees is a *run*
 * (stage 26b), assembled from the floors they have uncovered.
 */

/** One row of the library list — enough to pick from, without the shaft. */
export interface NetArchitectureSummary {
  id: string;
  name: string;
  difficulty: NetDifficulty;
  /** Floors across every branch — the number the GM recognises it by. */
  floors: number;
  branches: number;
  updatedAt: string;
}

/** A stored architecture: the summary plus the shaft itself. */
export interface NetArchitectureView extends NetArchitectureSummary {
  architecture: CpredNetArchitecture;
  notes: string;
}

export interface NetArchitectureListPayload {
  architectures: NetArchitectureSummary[];
}

export interface NetArchitectureGetPayload {
  id: string;
}

export interface NetArchitectureSavePayload {
  /** Absent when creating; present when saving an existing one. */
  id?: string;
  architecture: unknown;
}

export interface NetArchitectureIdPayload {
  id: string;
}

/**
 * „Wylosuj architekturę" — steps 1 and 2 of s. 210, rolled on the server like
 * every other die in this project. The result is *not* stored: it comes back
 * as a draft the GM edits and saves, so a roll they dislike costs nothing.
 */
export interface NetArchitectureRollPayload {
  name: string;
  difficulty: NetDifficulty;
  /** Fix the shape instead of rolling it — the GM's own „cztery piętra". */
  floors?: number;
  branches?: number;
}

export interface NetArchitectureRollResult {
  architecture: CpredNetArchitecture;
  /** One Polish line for the chat: what the dice actually said. */
  summary: string;
}

export interface NetArchitectureDeleteBroadcast {
  id: string;
}

// ─────────────────────────── punkty dostępu (etap 26b) ───────────────────────────

/**
 * A socket in the world an Architecture hangs off (stage 26b).
 *
 * Scene data, unlike the architecture itself: „sieć klubu Afterlife" is one
 * build that may be reachable from the terminal behind the bar *and* from the
 * junction box in the alley, and each of those is a place on a map.
 *
 * A hidden point never leaves the server for a player — it is what the Scanner
 * is for. `architectureName` travels only to the GM: a player who has found the
 * socket has found a socket, not the name of what is behind it.
 */
export interface NetAccessPointView {
  id: number;
  sceneId: string;
  name: string;
  x: number;
  y: number;
  /** GM-only flag; a hidden point is simply absent from a player's payload. */
  hidden: boolean;
  /** Library row it leads to; null = a dead socket the GM has not wired yet. */
  architectureId: string | null;
  /** GM only. */
  architectureName?: string;
  /** GM's own note about the socket. */
  notes?: string;
}

export interface NetAccessPointSyncBroadcast {
  sceneId: string;
  points: NetAccessPointView[];
  seq?: number;
}

export interface NetAccessPointPlacePayload {
  sceneId: string;
  x: number;
  y: number;
  name?: string;
  architectureId?: string | null;
  hidden?: boolean;
}

export interface NetAccessPointUpdatePayload {
  id: number;
  name?: string;
  architectureId?: string | null;
  hidden?: boolean;
  notes?: string;
}

export interface NetAccessPointIdPayload {
  id: number;
}

// ──────────────────────────────── run (etap 26b) ────────────────────────────────

/**
 * One intrusion as it leaves the server. Built per viewer: the GM gets the whole
 * shaft, the netrunner gets what they have uncovered, and everybody else gets
 * nothing at all — the filtering happens before the emit, never in CSS.
 */
export interface NetRunPayload {
  runId: string;
  tokenId: string;
  characterId: string;
  characterName: string;
  accessPointId: number;
  accessPointName: string;
  /** The netrunner's Interface rank — the number every Check adds. */
  interfaceRank: number;
  /** True for the GM's copy, which carries the whole shaft. */
  gmView: boolean;
  run: NetRunView;
}

export interface NetRunSyncBroadcast {
  runs: NetRunPayload[];
}

export interface NetRunStartPayload {
  tokenId: string;
  accessPointId: number;
}

export interface NetRunIdPayload {
  runId: string;
}

export interface NetRunMovePayload {
  runId: string;
  to: CpredNetPosition;
}

/** „Zapisanie kopii na twoim cyberdeku nie zużywa Akcji Sieciowej" (s. 198). */
export interface NetRunCopyPayload {
  runId: string;
  floorId: string;
}

export interface NetRunAbilityPayload {
  runId: string;
  ability: NetAbilityId;
  /** Wirus only: what it is meant to do, and the two numbers the GM named. */
  virus?: { description: string; dv: number; actions: number };
  gesture?: RollGesture;
}

export interface NetRunAbilityResult {
  /** Chat message the roll produced, so the client can scroll to it. */
  messageId: number;
  total: number;
  success: boolean;
  /** One Polish line the run window prints under the shaft. */
  summary: string;
}
