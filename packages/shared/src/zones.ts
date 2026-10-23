/**
 * A defended zone standing on the map (stage 26f) — core VTT, no game system.
 *
 * The third rectangle this project draws on a scene, after the cover of 16c and
 * the smoke square of 16h, and it is a rectangle for the reason those two are:
 * **the same system stands in several places of the same building**. „Podłoga
 * elektryczna" is one row of a catalogue; the electrified floor in the lobby and
 * the one in the server room are two things on a map with two switches and two
 * sets of body points.
 *
 * What the core keeps is where it is, whether it is armed, and how much of it is
 * left. *What it does to whoever walks in* is Cyberpunk RED, and lives on the
 * compendium entry `entryId` points at (`CpredNetDefenseEffects`). This module
 * never learns what 6k6 means.
 *
 * Unlike a cover and like an access point, a zone **can be hidden**: „Percepcja
 * PT 17, by zauważyć" (s. 216) is the whole point of a trap, so a zone nobody
 * has spotted is *absent* from a player's payload rather than flagged in it —
 * a client that had the row could draw it whatever the flag said.
 */

import type { ScenePoint } from './measure.js';
import {
  distanceToRect,
  isPointInRect,
  sanitizeRect,
  segmentCrossesRect,
  segmentDistanceToRect,
  type Rect,
} from './rects.js';

/** One stored zone as it goes over the wire, already cut for one pair of eyes. */
export interface DefenseZoneView {
  /** Autoincrement id. */
  id: number;
  sceneId: string;
  /**
   * Catalogue row the numbers come from („defense.podloga-elektryczna"), kept
   * opaque by the core: a string the CP RED compendium understands.
   */
  entryId: string;
  /** Label drawn on the map — „Podłoga w windzie". */
  name: string;
  /** Top-left corner in scene (world) pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Armed = it goes off by itself. The GM's switch and, when the zone hangs off
   * a control node, the netrunner's: turning the device off disarms it.
   *
   * **GM truth only** (stage 51): a player's copy always reads `true`, because
   * a switched-off electric floor looks exactly like a live one, and the label
   * „rozbrojona" told the table what the GM had decided about the guards.
   */
  armed: boolean;
  /**
   * GM-only flag; a hidden zone is simply absent from a player who has not
   * spotted it, and a player's copy of one they did spot reads `false` — from
   * where they stand it is not hidden any more (`spotted` says how they got it).
   */
  hidden: boolean;
  /**
   * Body points of the device itself („PW 10" of the sliding floor are its
   * sprinklers, not the floor); 0/0 means a system the table cannot shoot at,
   * which is what the catalogue prints for half of them.
   *
   * **GM truth only** (stage 51): a player's copy carries 0/0 — the rulebook
   * never shows the table an enemy's body points, and a trap is an enemy. An
   * emplacement with a bound figure carries 0/0 for the GM too: its body points
   * are the figure's.
   */
  hpMax: number;
  hpCurrent: number;
  /** Figures that carry a pass and walk through untouched — GM only. */
  exempt?: string[];
  /** The emplacement figure that fires for this zone (stage 26f) — GM only. */
  tokenId?: string;
  /** Architecture whose control node arms and disarms it — GM only. */
  architectureId?: string | null;
  /** Floor of that architecture (the control node itself) — GM only. */
  floorId?: string;
  /** Device on that node — GM only. */
  deviceId?: string;
  /** GM's own note about what this thing really is. */
  notes?: string;
  /** True on a player's copy when they only have it because somebody spotted it. */
  spotted?: boolean;
  /**
   * The GM's own disarm DV for this zone (stage 58b) — overrides the catalogue
   * entry's; null keeps the entry's. GM only, opaque to the core.
   */
  disarmDv?: number | null;
  /** Characters that tried to disarm it and failed (stage 58b) — GM only. */
  disarmTried?: string[];
}

/** Rectangles only, and axis-aligned — the covers' bargain exactly. */
export const ZONE_MIN_SIZE_PX = 8;
export const ZONE_MAX_SIZE_PX = 20000;
/** Guard against a client filling the table; a trapped floor runs to a handful. */
export const ZONE_MAX_PER_SCENE = 60;
/** Longest label the map is willing to draw. */
export const ZONE_NAME_MAX = 40;
export const ZONE_NOTES_MAX = 500;
/** Most figures the GM may wave through one zone. */
export const ZONE_EXEMPT_MAX = 40;

/**
 * How close a figure has to come before it gets a chance to notice a hidden
 * zone, in metres.
 *
 * A **VTT reading, not RAW**: the rulebook prints „Percepcja PT 17, by
 * zauważyć" and no distance at all, exactly as it printed no radius for the
 * Scanner in 26b. Four metres is two squares — near enough that „I saw the
 * wires in the carpet" is a sentence somebody can say at the table, and far
 * enough that a corridor walked at a normal pace offers the roll *before* the
 * first step onto the trap rather than after it.
 */
export const ZONE_SPOT_RANGE_M = 4;

/** Client → server `zone:create`. The numbers are **not** here: the server reads them. */
export interface DefenseZoneCreatePayload {
  sceneId: string;
  /** Compendium row this zone is an instance of. */
  entryId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Overrides the entry's name; blank keeps it. */
  name?: string;
  /** Hidden until somebody notices it; defaults to „hidden when it has a spot DV". */
  hidden?: boolean;
}

/** Client → server `zone:update` — move, rename, arm, reveal, repair or wire one. */
export interface DefenseZoneUpdatePayload {
  zoneId: number;
  patch: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    name?: string;
    armed?: boolean;
    hidden?: boolean;
    /** Current body points; the GM's way to dent or repair one by hand. */
    hpCurrent?: number;
    /** Whole list, not a delta: the form ticks boxes and sends what it sees. */
    exempt?: string[];
    /** The emplacement figure that shoots for this zone; null unbinds it. */
    tokenId?: string | null;
    architectureId?: string | null;
    floorId?: string | null;
    deviceId?: string | null;
    notes?: string;
    /** Disarm DV on this zone (stage 58b); null goes back to the entry's. */
    disarmDv?: number | null;
    /** „Pozwól spróbować znowu” — clears the list of failed disarm attempts. */
    resetDisarmTries?: true;
  };
}

/**
 * Client → server `zone:disarm` (stage 58b) — a player's character tries to
 * disarm a zone it can see, standing within arm's reach of its edge.
 */
export interface DefenseZoneDisarmPayload {
  zoneId: number;
  characterId: string;
}

/** The Test is a check call; the cup opens from its card. */
export interface DefenseZoneDisarmResult {
  callMessageId: number;
}

export interface DefenseZoneDeletePayload {
  zoneId: number;
}

export interface DefenseZoneClearPayload {
  sceneId: string;
}

/**
 * The GM sets a zone off by hand — „Odpal system" on the card, and the Turn of
 * a trap that has its own place in the initiative queue (the gas lift).
 *
 * `tokenId` narrows it to one victim; without it everybody standing inside gets
 * what the system has to give, which is what „w Turze pułapki osoby znajdujące
 * się w pomieszczeniu" (s. 216) says.
 */
export interface DefenseZoneFirePayload {
  zoneId: number;
  tokenId?: string;
}

/**
 * Server → client `zone:sync` — the whole zone list of one scene, cut per
 * viewer. A full list rather than deltas, for the reason the cover list is one:
 * a scene holds a handful and a list that cannot desync is worth the bytes.
 */
export interface DefenseZoneSyncBroadcast {
  sceneId: string;
  zones: DefenseZoneView[];
}

/** Why a zone request was refused — the code and the sentence a human reads. */
export type DefenseZoneProblem =
  | 'ZONE_NOT_FOUND'
  | 'ZONE_UNKNOWN_ENTRY'
  | 'ZONE_LIMIT_REACHED'
  | 'ZONE_NO_EFFECT'
  | 'ZONE_NOBODY_INSIDE';

export const ZONE_MESSAGES: Record<DefenseZoneProblem, string> = {
  ZONE_NOT_FOUND: 'Tej strefy już nie ma — odśwież stronę.',
  ZONE_UNKNOWN_ENTRY: 'Kompendium nie ma wpisu tego systemu obronnego.',
  ZONE_LIMIT_REACHED: 'Na tej scenie stoi już maksymalna liczba stref obronnych.',
  ZONE_NO_EFFECT: 'Ten system nie ma opisanego efektu — uzupełnij go w kompendium.',
  ZONE_NOBODY_INSIDE: 'Na tej strefie nikt nie stoi.',
};

/**
 * Is this system still working?
 *
 * „Pułapkę można pokonać, obniżając jej PW do 0" (s. 216). A zone with no body
 * points printed (0/0) can never be shot down and is therefore always standing —
 * that is the honest reading of a blank cell, not a system that starts broken.
 */
export function zoneStanding(zone: Pick<DefenseZoneView, 'hpMax' | 'hpCurrent'>): boolean {
  return zone.hpMax <= 0 || zone.hpCurrent > 0;
}

/** Will this zone go off at all: armed, unbroken, and not waved through. */
export function zoneLive(zone: DefenseZoneView, tokenId?: string): boolean {
  if (!zone.armed) return false;
  if (!zoneStanding(zone)) return false;
  if (tokenId && (zone.exempt ?? []).includes(tokenId)) return false;
  return true;
}

/** Is this point inside the zone (edges included)? */
export function isPointInZone(zone: Rect, point: ScenePoint): boolean {
  return isPointInRect(zone, point);
}

/**
 * Did a walk from `from` to `to` touch this zone?
 *
 * The straight segment rather than the destination alone: a figure that crosses
 * the electrified floor on the way past has walked on it, and a trap that only
 * fired when somebody *stopped* on it would be a trap nobody could spring.
 */
export function zoneTouchedBy(zone: Rect, from: ScenePoint, to: ScenePoint): boolean {
  return segmentCrossesRect(zone, from, to);
}

/**
 * The same question for a whole path (stage 16e records one per move).
 *
 * A path of one point is a drop with no recorded route — then the straight line
 * from where the figure stood is all there is, which is what `zoneTouchedBy`
 * already answers.
 */
export function zoneTouchedByPath(zone: Rect, path: readonly ScenePoint[]): boolean {
  if (path.length === 0) return false;
  if (path.length === 1) return isPointInZone(zone, path[0]!);
  for (let i = 1; i < path.length; i++) {
    if (segmentCrossesRect(zone, path[i - 1]!, path[i]!)) return true;
  }
  return false;
}

/**
 * Did a walk come within `rangePx` of this zone anywhere along the way (stage
 * 58a)? The Perception roll belongs to the moment the figure was near, so a
 * path that crossed the trap's four metres and ended far past it still counts —
 * until 58a only the landing square was asked, and walking through a trap in
 * one click never offered the roll at all.
 *
 * A path of one point is a figure standing there.
 */
export function zoneWithinReachOfPath(
  zone: Rect,
  path: readonly ScenePoint[],
  rangePx: number,
): boolean {
  if (path.length === 0) return false;
  if (path.length === 1) return distanceToRect(path[0]!, zone) <= rangePx;
  for (let i = 1; i < path.length; i++) {
    if (segmentDistanceToRect(zone, path[i - 1]!, path[i]!) <= rangePx) return true;
  }
  return false;
}

/**
 * The zone a click lands on: the topmost (last placed) one containing the
 * point, else null — the covers' rule, and for the same reason: later rows are
 * drawn later, and a click should hit what the eye sees.
 */
export function pickZoneAt(
  zones: readonly DefenseZoneView[],
  point: ScenePoint,
): DefenseZoneView | null {
  for (let i = zones.length - 1; i >= 0; i--) {
    const zone = zones[i]!;
    if (isPointInZone(zone, point)) return zone;
  }
  return null;
}

/** Turns a drag into a stored zone rectangle, or null when it was a stray click. */
export function sanitizeZoneRect(raw: unknown): Rect | null {
  return sanitizeRect(raw, { min: ZONE_MIN_SIZE_PX, max: ZONE_MAX_SIZE_PX });
}

/** Trims a GM-typed label; empty means „keep the catalogue entry's name". */
export function sanitizeZoneName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, ZONE_NAME_MAX);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * „Podłoga elektryczna · 20/20 PW · uzbrojona · ukryta" — the GM's one-line
 * description; a player reads the name alone (stage 51), because body points
 * and the switch are the GM's business and the server sends neither.
 */
export function zoneLabel(zone: DefenseZoneView, gm = true): string {
  if (!gm) return zone.name;
  const parts: string[] = [zone.name];
  if (zone.hpMax > 0) parts.push(`${zone.hpCurrent}/${zone.hpMax} PW`);
  parts.push(zoneStanding(zone) ? (zone.armed ? 'uzbrojona' : 'rozbrojona') : 'zniszczona');
  if (zone.hidden) parts.push('ukryta');
  return parts.join(' · ');
}
