import type { CpredNetArchitecture, NetDifficulty } from './systems/cpred/index.js';

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
