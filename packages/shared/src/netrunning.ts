import type {
  CpredAttackRequest,
  CpredNetArchitecture,
  CpredNetPosition,
  NetAbilityId,
  NetDeviceOperation,
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
  /** Nowe położenie na mapie (etap 27l) — uchwyt przesuwania gniazda. */
  x?: number;
  y?: number;
}

export interface NetAccessPointIdPayload {
  id: number;
}

/** Kosz warstwy gniazd (etap 27k) — bliźniak `LightClearPayload`. */
export interface NetAccessPointClearPayload {
  sceneId: string;
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

// ─────────────────────────── walka w Sieci (etap 26c) ───────────────────────────

/**
 * Running or stopping a Program — one Net Action either way (s. 201).
 *
 * Aggressors are deliberately not addressable here: „są uruchomione przy
 * Ataku, a kiedy zostaną użyte, wyłączają się automatycznie", so firing one is
 * `netrun:attack` and there is nothing to keep running afterwards.
 */
export interface NetRunProgramPayload {
  runId: string;
  /** Deck row (`CpredNetInstallRow.id`) to run, or the copy's row to stop. */
  rowId: string;
  action: 'run' | 'stop';
}

/**
 * One exchange of blows. `rowId` names the Aggressor being fired; leaving it
 * out is Paf, „atak wymierzony w Program … bez Programu" (s. 201).
 *
 * Exactly one of `iceId` and `demonId` names the target (stage 26e). Two fields
 * rather than one id and a kind, because the two live in different halves of
 * the run's state and the server has to look them up in different places — a
 * single field would only move that fork one line later.
 */
export interface NetRunAttackPayload {
  runId: string;
  iceId?: string;
  /** Stage 26e: a Demon, which defends with an Interface Check instead of OBR. */
  demonId?: string;
  rowId?: string;
  gesture?: RollGesture;
}

/** „Ucieczka na sąsiednie piętro windy" — the destination the player picked. */
export interface NetRunSlidePayload {
  runId: string;
  iceId?: string;
  /** Only ever a refusal: a Demon has no PER to slip away from (stage 26e). */
  demonId?: string;
  to?: CpredNetPosition;
  gesture?: RollGesture;
}

/**
 * The GM's two buttons on a Black ICE (decision of 15.08: „wszystko na klik
 * MG"). `detect` is the encounter of s. 205 — the Speed contest, the free hit
 * and the jump to the head of the initiative queue; `turn` is one of its Turns.
 */
export interface NetIceActPayload {
  runId: string;
  iceId: string;
  gesture?: RollGesture;
}

export interface NetRunGluePayload {
  runId: string;
}

// ─────────────────────────── Demony (etap 26e) ───────────────────────────

/**
 * The GM's two buttons on a Demon (decision of 16.08: „wszystko na klik MG",
 * the same bargain 26c struck with the Black ICE).
 *
 * `detect` has no contest behind it — a Demon has no PRĘ, so noticing an
 * intruder is a fact, not a roll: it starts hunting and takes the head of the
 * initiative queue. `turn` plays its whole Turn at once, targets included.
 */
export interface NetDemonActPayload {
  runId: string;
  demonId: string;
  gesture?: RollGesture;
}

// ─────────────────────── węzły kontrolne (etap 26d) ───────────────────────

/**
 * Operating one thing hanging off a control node (s. 199).
 *
 * The node is named by its floor rather than by an id of its own, because a
 * control node *is* a floor — that is where its DV, its hold and its
 * once-per-Turn ledger already live. `targetTokenId` and `request` are the
 * turret's shot: the very same fields `attack:roll` takes, so a turret firing
 * a burst is one flag rather than a second protocol.
 */
export interface NetRunDevicePayload {
  runId: string;
  floorId: string;
  deviceId: string;
  operation: NetDeviceOperation;
  /** Who the turret is aimed at; ignored by every other operation. */
  targetTokenId?: string;
  /**
   * Only the parts of the shot the window has an opinion about — today that is
   * `ignoreCover`, set by „Strzelaj mimo osłony" after a refusal. The weapon row
   * is never named here: a turret has one barrel and the server picks it.
   */
  request?: Partial<CpredAttackRequest>;
  gesture?: RollGesture;
}
