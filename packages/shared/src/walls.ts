/**
 * Walls, doors and windows (stages 18a, 18d) — core VTT, no game system.
 *
 * A wall is stored as a single segment, not as a chain: the editor draws chains
 * because that is how a floor plan is traced, but the raycast in `vision.ts`
 * consumes segments, and „one gesture, N rows" keeps the eraser working on the
 * piece the GM actually clicked.
 *
 * The rule that shapes this whole module: **walls never reach a player.** Where
 * fog (17a) and drawings (17b) send players a mask they are allowed to see, a
 * wall layout is the floor plan of a building the party has not entered yet.
 * Players receive one thing only — doors the GM flagged as theirs to open, and
 * only while those doors lie inside their own field of view.
 *
 * Stage 18d made both of those objects behave like things in a space rather than
 * switches on a board: a door has to be within arm's reach to be worked and can
 * be bolted, and a window shows what is behind it only from up close.
 *
 * Stage 42a added the partition that is meant to be looked through — the
 * chain-link fence, the railing, the glass screen — and with it the one
 * question this module answers that is not about sight: what stops a **body**.
 * Stage 42b gave that partition a number: how much of a round or a blast it
 * takes on the way through (`armor`, `barrierArmorAlong`).
 */

import { fireCoverSegments, type CoverView } from './covers.js';
import type { ScenePoint } from './measure.js';
import { segmentCrossingDistance, type Segment } from './vision.js';

export const WALL_KINDS = ['wall', 'door', 'window', 'barrier', 'gate'] as const;
/**
 * `wall` blocks sight always. `door` and `window` are **openings**: they can be
 * opened, bolted and worked by hand, and what they do to sight depends on that
 * state. A closed door blocks; a closed window blocks only for an observer
 * standing away from it (the net curtain, stage 18d) and dims the light that
 * passes it (`LIGHT_WINDOW_COST`); either one standing open is a hole in the
 * wall — no shadow, no toll on the light.
 *
 * `barrier` and `gate` (stage 42a) never touch sight or light at all. A barrier
 * stops a body — a figure walking, a fist, a grab — and a gate is its opening:
 * the door's mechanism (handle, bolt, arm's reach) in a see-through frame.
 */
export type WallKind = (typeof WALL_KINDS)[number];

/**
 * Can this be opened, bolted and reached for?
 *
 * Doors, windows and gates are one mechanism with three skins. They differ only
 * in what they do while **closed** — a door is opaque, a window is a curtained
 * pane, a gate is a barrier — and once open they are the same hole.
 */
export function isOpening(wall: Pick<WallView, 'kind'>): boolean {
  return wall.kind === 'door' || wall.kind === 'window' || wall.kind === 'gate';
}

/**
 * Is this a see-through partition — a barrier or its gate (stage 42a)?
 *
 * Asked wherever a fence has to be told apart from masonry although both stop a
 * body: sizing a lamp to its room (`roomSegments`) and telling a player which
 * obstacles are in plain sight (`standingBarriers`).
 */
export function isBarrier(wall: Pick<WallView, 'kind'>): boolean {
  return wall.kind === 'barrier' || wall.kind === 'gate';
}

/** One stored wall as it goes over the wire — GM only, save for open doors. */
export interface WallView {
  /** Autoincrement id; also the creation order within a chain. */
  id: number;
  sceneId: string;
  kind: WallKind;
  /** Openings only (doors and windows); a plain wall ignores it. */
  open: boolean;
  /** Openings only: players may operate this one, and therefore may see it. */
  playerToggle: boolean;
  /**
   * Openings only (stage 18d): bolted, and a player's click does nothing.
   *
   * **This field is scrubbed to `false` on its way to a player.** A locked door
   * still travels — a door you cannot see is a door you cannot try — but whether
   * it gives is something the character finds out by pulling the handle, not
   * something the client is told in advance. The GM's own list carries the truth.
   */
  locked: boolean;
  /**
   * Barriers and gates only (stage 42b): how much a shot or a blast loses on its
   * way through. Always 0 on every other kind.
   *
   * A bare number and deliberately opaque to the core — the core only adds up
   * what a line crosses (`barrierArmorAlong`); CP RED reads it as Stopping Power
   * and subtracts it before the target's own armour. Like `locked`, it is GM
   * knowledge and is scrubbed to 0 on its way to a player.
   */
  armor: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The highest `armor` a barrier may carry (stage 42b). A guard against a
 * runaway client rather than a rule — no game system is consulted here.
 */
export const WALL_ARMOR_MAX = 99;

/**
 * Arm's reach, in metres (stage 18d) — how close a token has to stand to touch
 * a door, and how close to a window before the pane stops being a bright
 * rectangle and starts being a view.
 *
 * Two metres is one square on a Cyberpunk RED map, and on such a scene it works
 * out to exactly „the square next to it, diagonals included": the centre of an
 * adjacent square sits 1 m from the wall along its edge and 1,41 m from the
 * nearest end diagonally, while two squares out is 3 m and misses. Expressed in
 * metres rather than in squares so that gridless scenes and unusual scales get
 * an answer that still means the length of an arm.
 */
export const WALL_REACH_M = 2;

/** Max points in one drawn chain — a guard against a runaway client. */
export const WALL_CHAIN_MAX_POINTS = 128;
/**
 * Max walls kept per scene. A detailed floor plan runs to a couple of hundred
 * segments; the cap only stops a client from filling the database, and the sight
 * calculation stays comfortable well past it.
 */
export const WALL_MAX_PER_SCENE = 2000;
/** Shorter than this and the segment is a stray click, not a wall. */
export const WALL_MIN_LENGTH = 2;
/**
 * How close a new point has to be to an existing endpoint to snap onto it, in
 * scene pixels. Snapping to *walls* matters more than snapping to the grid: a
 * one-pixel gap between two segments is a slit that light pours through, and it
 * is invisible at the zoom a whole floor plan is drawn at.
 */
export const WALL_ENDPOINT_SNAP_PX = 12;

/** Client → server payload of `wall:create` — one drawn chain. */
export interface WallCreatePayload {
  sceneId: string;
  /** Consecutive points; N points become N−1 segments. */
  points: ScenePoint[];
  kind: WallKind;
  /** Openings only; ignored on a plain wall. */
  playerToggle?: boolean;
  /** Barriers and gates only (stage 42b); absent means 0, ignored elsewhere. */
  armor?: number;
}

/** Client → server payload of `wall:update` — retype or reflag one segment. */
export interface WallUpdatePayload {
  wallId: number;
  patch: {
    kind?: WallKind;
    playerToggle?: boolean;
    /** Openings only (stage 18d); bolting one also shuts it. */
    locked?: boolean;
    /** Barriers and gates only (stage 42b); retyping to anything else zeroes it. */
    armor?: number;
    /**
     * Nowe położenie odcinka (etap 27l) — uchwyty na końcach i przesunięcie
     * całej ściany. Cała czwórka albo nic: pół geometrii to ściana, która
     * jednym końcem stoi tam, gdzie stała, a drugim gdzie indziej, i to nie
     * jest stan, o który ktokolwiek prosi.
     */
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  };
}

export interface WallDeletePayload {
  wallId: number;
}

export interface WallClearPayload {
  sceneId: string;
}

/**
 * Client → server payload of `opening:toggle`. Omitting `open` flips it, which
 * is what a click on the map means; the explicit form exists for tests and for a
 * future keyboard shortcut.
 *
 * One event for doors and windows rather than two, because the interaction is
 * identical down to the refusal codes — only the fiction differs, and fiction is
 * the GM's department.
 */
export interface OpeningTogglePayload {
  wallId: number;
  open?: boolean;
}

/**
 * Server → client `wall:sync` — the whole wall list of one scene, GM only.
 *
 * A full list rather than deltas: walls change only while the GM is editing,
 * a scene holds tens of them, and a list that cannot desync is worth more here
 * than the bytes an upsert would save.
 */
export interface WallSyncBroadcast {
  sceneId: string;
  walls: WallView[];
}

/**
 * Server → client `opening:sync` — the doors *and windows* one player may
 * currently operate and see. Targeted per socket (no seq), because the list
 * differs per viewer.
 */
export interface OpeningSyncBroadcast {
  sceneId: string;
  openings: WallView[];
}

/**
 * Server → client `blocker:sync` (stage 42a) — what one player's route planner
 * has to walk round although the player can see past it: barriers, shut gates,
 * and the closed windows they stand close enough to look through. Only the ones
 * in sight, and only as bare segments — the planner needs geometry, and a wall
 * row would hand the client a kind, an id and a bolt it has no business knowing.
 *
 * Targeted per socket without a seq, like `opening:sync`: every list differs.
 */
export interface BlockerSyncBroadcast {
  sceneId: string;
  segments: Segment[];
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isWallKind(value: unknown): value is WallKind {
  return (WALL_KINDS as readonly unknown[]).includes(value);
}

/**
 * Does this wall stop a line of sight for everybody, wherever they stand?
 *
 * A closed window answers `false` here and is nonetheless a blocker for most
 * observers — see `sightSegmentsFor`. This function is the part of the answer
 * that does not depend on who is asking, and it is what the *light* uses: a pane
 * dims a beam (`LIGHT_WINDOW_COST`), it never stops it. A barrier and a gate
 * answer `false` in every state — being looked through is what they are for.
 */
export function wallBlocksSight(wall: Pick<WallView, 'kind' | 'open'>): boolean {
  switch (wall.kind) {
    case 'wall':
      return true;
    case 'door':
      return !wall.open;
    case 'window':
    case 'barrier':
    case 'gate':
      return false;
  }
}

/**
 * Does this wall stop a **body** (stages 16e, 42a)?
 *
 * The one answer the route planner, the server's refusal of a drop, a bot's
 * approach, a melee swing and a grab all share. Anything closed stops a person —
 * a door, a window (you do not walk through glass), a gate — and anything open is
 * a way through; a wall and a barrier have no open state to offer.
 */
export function wallBlocksMovement(wall: Pick<WallView, 'kind' | 'open'>): boolean {
  switch (wall.kind) {
    case 'wall':
    case 'barrier':
      return true;
    case 'door':
    case 'window':
    case 'gate':
      return !wall.open;
  }
}

/**
 * The panes that currently take their toll on light passing through them
 * (`LIGHT_WINDOW_COST`) — closed windows, and only those.
 *
 * An **open** window is a hole: nothing is left to dim the beam, which is what
 * makes „the window is open" legible on a dark map without anyone saying so. A
 * door is absent from this list in both states — shut it blocks outright, open
 * it costs nothing.
 */
export function tollingWindows(walls: readonly WallView[]): Segment[] {
  const panes: Segment[] = [];
  for (const wall of walls) {
    if (wall.kind !== 'window' || wall.open) continue;
    panes.push({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 });
  }
  return panes;
}

/** The subset of walls the raycast cares about, as bare segments. */
export function blockingSegments(walls: readonly WallView[]): Segment[] {
  const segments: Segment[] = [];
  for (const wall of walls) {
    if (!wallBlocksSight(wall)) continue;
    segments.push({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 });
  }
  return segments;
}

/**
 * What stops a **body** (stage 16e) — core VTT, no game system.
 *
 * A third list next to sight and fire, and it has to be a third one: the three
 * questions genuinely have different answers at a window. Sight is stopped by a
 * closed pane only at a distance (the net curtain of 18d), a bullet is never
 * stopped by glass at all („szyby … nie mają PW", s. 180) — and a person is
 * stopped by it always, until somebody opens the sash. Once it is open the same
 * window is a hole you can climb through, which is exactly what 18e made it.
 *
 * The client's pathfinder, the server's refusal of a drop (`refuseWalkThroughSolid`),
 * a bot's approach and — since stage 42a — a melee swing and a grab all read this
 * same list, which is the point of writing it here. A barrier is the case that
 * made it a list of its own for good: it is in nobody's sight list and in
 * everybody's way.
 */
export function movementSegments(walls: readonly WallView[]): Segment[] {
  const segments: Segment[] = [];
  for (const wall of walls) {
    if (!wallBlocksMovement(wall)) continue;
    segments.push({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 });
  }
  return segments;
}

/**
 * What stops **this observer's body but not their eye** (stage 42a) — the walls
 * a player's route planner has to be told about.
 *
 * The planner of 16e walks wherever the player can see, and for a long time that
 * was enough: whatever stopped a body also stopped sight, so the edge of the
 * field of view was the edge of the walkable floor. Two things break it. A
 * barrier is built to be looked through, and a closed window stops being a
 * curtain for anyone standing at it (18d). In both cases the floor beyond is in
 * view, the planner drew a route across it, and the server refused the drop.
 *
 * Per observer for the window's sake, with the `curtainReachPx` the sight list
 * uses, so the two lists can never disagree about a pane.
 */
export function walkOnlyWallsFor(
  walls: readonly WallView[],
  origin: ScenePoint,
  options: { curtainReachPx: number | null },
): WallView[] {
  const reach = options.curtainReachPx;
  return walls.filter((wall) => {
    if (!wallBlocksMovement(wall) || wallBlocksSight(wall)) return false;
    if (wall.kind !== 'window') return true;
    // A closed pane is see-through from up close — and to everybody in the dark.
    return reach === null || distanceToWall(origin, wall) <= reach;
  });
}

/**
 * The barriers and shut gates of a scene (stage 42a) — what stops a body and is
 * see-through for **everybody**, wherever they stand.
 *
 * What a scene without dynamic vision hands a player's planner: with no raycast
 * there is no observer to measure a window's curtain from, and a window, unlike
 * a fence, is part of the floor plan the party has not been shown.
 */
export function standingBarriers(walls: readonly WallView[]): WallView[] {
  return walls.filter((wall) => isBarrier(wall) && wallBlocksMovement(wall));
}

/**
 * A client-sent `armor` for a barrier (stage 42b): a whole number from 0 to
 * `WALL_ARMOR_MAX`, or null when it is anything else.
 */
export function sanitizeWallArmor(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
  if (raw < 0 || raw > WALL_ARMOR_MAX) return null;
  return raw;
}

/**
 * Crossings closer together than this, in scene pixels, are one crossing.
 *
 * A fence is traced as a chain, so two of its segments share every joint — and a
 * diagonal shot between square centres runs through grid intersections, which is
 * exactly where a grid-snapped chain puts its joints. Counted per segment, one
 * fence would take its armour twice off every such shot.
 */
const BARRIER_CROSSING_MERGE_PX = 1;

/**
 * How much armour stands on the straight line between two points (stage 42b) —
 * the barriers and shut gates it passes, added up.
 *
 * Only what a round *passes through*: a wall or a shut door refuses the shot
 * outright (`fireSegmentsFor`), a window has no armour to give („szyby … nie mają
 * PW", s. 180), and an open gate is a hole. Two fences one behind the other take
 * theirs each; two segments meeting at the point the line crosses count once, at
 * the higher of the two numbers.
 *
 * No exemption for standing at the mesh (decision of the GM, 13.09.2026): a
 * shooter pressed against a fence still fires through it. What lies exactly at
 * either end of the line is not on it — the edge rules of `isSegmentClear`.
 */
export function barrierArmorAlong(
  walls: readonly WallView[],
  from: ScenePoint,
  to: ScenePoint,
): number {
  const crossings: { distance: number; armor: number }[] = [];
  for (const wall of standingBarriers(walls)) {
    if (!(wall.armor > 0)) continue;
    const distance = segmentCrossingDistance(from, to, wall);
    if (distance !== null) crossings.push({ distance, armor: wall.armor });
  }
  crossings.sort((a, b) => a.distance - b.distance);
  let total = 0;
  let last: { distance: number; armor: number } | null = null;
  for (const crossing of crossings) {
    if (last && crossing.distance - last.distance <= BARRIER_CROSSING_MERGE_PX) {
      // The same point of the line: keep the stronger segment, never both.
      if (crossing.armor > last.armor) {
        total += crossing.armor - last.armor;
        last.armor = crossing.armor;
      }
      continue;
    }
    total += crossing.armor;
    last = { ...crossing };
  }
  return total;
}

/** Most points `wallSamplePoints` returns for one segment. */
export const WALL_SAMPLE_MAX = 64;

/**
 * Points along a wall to ask „can this be seen?" of (stage 42a).
 *
 * A fence is long and a field of view is a polygon, so neither its ends — shared
 * with the masonry they meet, on the very edge of the polygon — nor its middle
 * alone will do: a player looking at the near half of a forty-metre fence sees
 * that fence. Interior points only, evenly spread, at most `WALL_SAMPLE_MAX`.
 */
export function wallSamplePoints(wall: Segment, spacingPx: number): ScenePoint[] {
  const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  const spacing = Number.isFinite(spacingPx) && spacingPx > 0 ? spacingPx : Math.max(1, length);
  const count = Math.min(WALL_SAMPLE_MAX, Math.max(1, Math.ceil(length / spacing)));
  const points: ScenePoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    points.push({ x: wall.x1 + (wall.x2 - wall.x1) * t, y: wall.y1 + (wall.y2 - wall.y1) * t });
  }
  return points;
}

/**
 * What blocks sight **for one observer** (stage 18d) — the walls everybody is
 * stopped by, plus the windows this particular observer is too far from to see
 * through.
 *
 * This is the „net curtain" rule, and it is the reason the segment list stopped
 * being shared between viewers. A window is a bright rectangle from the street:
 * a curtain, a grimy pane or a half-drawn blind gives away that there is a room
 * behind it and nothing about what is in the room. Walk up to it and you look
 * through. The rule is deliberately symmetric — the geometry has no idea which
 * side is „inside", and neither has a net curtain.
 *
 * `curtainReachPx` of `null` switches the rule off, which is what a **dark**
 * scene passes: at night a lit window is *more* visible from a distance, not
 * less, and there the pane already costs the light that comes through it.
 *
 * An **open** window is never curtained. There is no glass in the way any more,
 * so it behaves like a doorway — which is the whole point of being able to open
 * one, and the reason a burglar shoves the sash up before looking in.
 *
 * The reach is measured to the nearest point of the pane, so standing at one end
 * of a shop front opens the whole of it. That is a simplification, and the right
 * one: a window is one object, and splitting a pane into the bit you are level
 * with and the bit you are not would be geometry nobody at the table asked for.
 */
export function sightSegmentsFor(
  walls: readonly WallView[],
  origin: ScenePoint,
  options: { curtainReachPx: number | null },
): Segment[] {
  const reach = options.curtainReachPx;
  const segments: Segment[] = [];
  for (const wall of walls) {
    if (wallBlocksSight(wall)) {
      segments.push({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 });
      continue;
    }
    // Only closed windows get the curtain treatment. Anything standing open —
    // a door or a sash — is a hole, and a hole hides nothing from anybody.
    if (reach === null || wall.kind !== 'window' || wall.open) continue;
    if (distanceToWall(origin, wall) <= reach) continue;
    segments.push({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 });
  }
  return segments;
}

/**
 * What stops a **bullet** fired from `origin` (stage 16b) — core VTT, no game
 * system: the shot itself is CP RED's business, the geometry is not.
 *
 * Deliberately the same list as `sightSegmentsFor`, and that identity is the
 * decision of the stage rather than a coincidence worth refactoring away. You
 * shoot where you can see, and the two awkward cases fall out of it for free:
 *
 *  - a **closed window** is not cover in the rules („szyby … nie mają PW i w
 *    związku z tym nie są osłoną", s. 180), so glass must not stop a round —
 *    and it does not, for anybody standing close enough to look through it. From
 *    across the street the same pane is a net curtain (18d), and what refuses the
 *    shot there is not the glass but the fact that the shooter cannot make out
 *    the target behind it;
 *  - a **door** is opaque while shut and a hole once open, exactly as it is for
 *    sight.
 *
 * Stage 16c filled in the promise this wrapper was written for: **cover** is an
 * object that blocks a bullet and nothing else, so its edges are appended here
 * and sight never hears about them. The `coverReachPx` exemption comes with it —
 * a car you are standing at does not stop your own shots (`fireCoverSegments`).
 */
export function fireSegmentsFor(
  walls: readonly WallView[],
  origin: ScenePoint,
  options: {
    curtainReachPx: number | null;
    /** Cover on the scene (stage 16c); omit on a scene that has none. */
    covers?: readonly CoverView[];
    /** How close counts as „standing at it", in scene pixels. */
    coverReachPx?: number;
  },
): Segment[] {
  const segments = sightSegmentsFor(walls, origin, options);
  if (options.covers && options.covers.length > 0) {
    segments.push(...fireCoverSegments(options.covers, origin, options.coverReachPx ?? 0));
  }
  return segments;
}

/**
 * Is any of these points within `reachPx` of the wall (stage 18d)?
 *
 * „Arm's reach" for a door: the distance runs from a token's centre — the point
 * the ruler, the range bands and the field of view all measure from — to the
 * nearest point of the segment, so a door is reachable from anywhere along it
 * rather than only opposite its middle.
 */
export function isWallWithinReach(
  wall: Segment,
  origins: readonly ScenePoint[],
  reachPx: number,
): boolean {
  return origins.some((origin) => distanceToWall(origin, wall) <= reachPx);
}

/**
 * The walls of a room with every door shut and every window boarded (stage
 * 18c) — the shape of the space itself rather than of what can be seen from it.
 *
 * „How big is this room?" and „what can be seen from here?" are different
 * questions and want different segment lists. Measuring a lamp with the doors
 * as they happen to stand would size it by whatever is beyond the one that is
 * open: a bedroom with its door ajar measures as the whole floor. The light
 * still spills through that doorway when it is drawn — the raycast at render
 * time uses the real doors — it just no longer decides how strong the bulb is.
 *
 * A barrier and a gate are left out (stage 42a): a fence does not make a yard
 * into a room, and a lamp on a fenced lot sized to the mesh would light a strip
 * of it and leave the rest dark.
 */
export function roomSegments(walls: readonly WallView[]): Segment[] {
  return walls
    .filter((wall) => !isBarrier(wall))
    .map((wall) => ({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 }));
}

/**
 * Validates a drawn chain and turns it into segments. Points are rounded to
 * whole scene pixels and consecutive duplicates are dropped — a click that did
 * not move is not a wall, and a zero-length segment would give the raycast a
 * direction it cannot compute.
 */
export function sanitizeWallChain(raw: unknown): Segment[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length < 2 || raw.length > WALL_CHAIN_MAX_POINTS) return null;
  const points: ScenePoint[] = [];
  for (const value of raw) {
    if (typeof value !== 'object' || value === null) return null;
    const point = value as Record<string, unknown>;
    if (!finiteNumber(point.x) || !finiteNumber(point.y)) return null;
    const next = { x: Math.round(point.x), y: Math.round(point.y) };
    const last = points[points.length - 1];
    if (last && Math.hypot(next.x - last.x, next.y - last.y) < WALL_MIN_LENGTH) continue;
    points.push(next);
  }
  if (points.length < 2) return null;
  const segments: Segment[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  return segments;
}

/**
 * Validates one moved segment (etap 27l) — uchwyt na końcu ściany i
 * przeciągnięcie całej ściany kończą się tutaj, po obu stronach drutu.
 *
 * Odrzuca odcinek krótszy niż `WALL_MIN_LENGTH` z tego samego powodu, dla
 * którego łańcuch pomija powtórzone punkty: ściana zwinięta do punktu nie
 * zasłania niczego, a raycast dostaje kierunek, którego nie umie policzyć.
 */
export function sanitizeWallSegment(raw: unknown): Segment | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  if (
    !finiteNumber(input.x1) ||
    !finiteNumber(input.y1) ||
    !finiteNumber(input.x2) ||
    !finiteNumber(input.y2)
  ) {
    return null;
  }
  const segment: Segment = {
    x1: Math.round(input.x1),
    y1: Math.round(input.y1),
    x2: Math.round(input.x2),
    y2: Math.round(input.y2),
  };
  if (Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1) < WALL_MIN_LENGTH) return null;
  return segment;
}

/** Shortest distance from a point to a wall, in scene pixels. */
export function distanceToWall(point: ScenePoint, wall: Segment): number {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - wall.x1, point.y - wall.y1);
  let t = ((point.x - wall.x1) * dx + (point.y - wall.y1) * dy) / lengthSq;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(point.x - (wall.x1 + t * dx), point.y - (wall.y1 + t * dy));
}

/** Midpoint of a wall — where the door glyph sits and what „is it visible?" asks. */
export function wallMidpoint(wall: Segment): ScenePoint {
  return { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
}

/** The wall a click lands on: nearest within `tolerance`, else null. */
export function pickWallAt(
  walls: readonly WallView[],
  point: ScenePoint,
  tolerance: number,
): WallView | null {
  let best: WallView | null = null;
  let bestDistance = tolerance;
  for (const wall of walls) {
    const distance = distanceToWall(point, wall);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = wall;
    }
  }
  return best;
}

/**
 * Czy ten punkt leży przy końcówce istniejącej ściany (etap 27k)?
 *
 * Rozstrzyga spór, który powstał, gdy klik w ścianę zaczął ją **zaznaczać**:
 * promień trafienia w segment (20 px przy kratce 100) jest większy od promienia
 * przyciągania do końcówki (12 px), więc „zaznaczaj zawsze" odebrałoby MG
 * jedyny sposób na dorysowanie ściany dokładnie od narożnika istniejącego muru.
 * Decyzja MG z 23.08: **końcówka rysuje, środek zaznacza**.
 *
 * Zwraca samą końcówkę, bo wywołujący i tak chce ją mieć jako pierwszy punkt
 * łańcucha; `null` znaczy „to jest środek segmentu albo puste pole".
 */
export function wallEndpointNear(
  walls: readonly WallView[],
  point: ScenePoint,
  radiusPx: number = WALL_ENDPOINT_SNAP_PX,
): ScenePoint | null {
  let best: ScenePoint | null = null;
  let bestDistance = radiusPx;
  for (const wall of walls) {
    for (const candidate of [
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 },
    ]) {
      const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
  }
  return best ? { ...best } : null;
}

/**
 * Where a drawn point should actually land. An existing wall endpoint wins over
 * the grid: closing a room exactly is what makes the difference between a sealed
 * wall and a slit that lights the whole map, and the GM cannot see a two-pixel
 * gap at the zoom a floor plan is traced at.
 */
export function snapWallPoint(
  point: ScenePoint,
  walls: readonly WallView[],
  options: {
    gridSizePx: number | null;
    snapRadiusPx?: number;
    /**
     * Przesunięcie kratki ze sceny (etap 27l). Domyślne zero zachowuje wynik
     * z 18a dla każdej zwykłej mapy; na scenie z kratką narysowaną od 30 px
     * pominięcie tego pola przyciągało ścianę **obok** narysowanej linii —
     * żeton honorował offset od 05, ściana nie.
     */
    gridOffsetX?: number;
    gridOffsetY?: number;
  },
): ScenePoint {
  const best = wallEndpointNear(walls, point, options.snapRadiusPx ?? WALL_ENDPOINT_SNAP_PX);
  if (best) return best;

  const size = options.gridSizePx;
  if (size !== null && Number.isFinite(size) && size > 0) {
    // Walls run along the edges of squares, not through their middles, so the
    // grid snap targets intersections.
    const ox = options.gridOffsetX ?? 0;
    const oy = options.gridOffsetY ?? 0;
    return {
      x: Math.round((point.x - ox) / size) * size + ox,
      y: Math.round((point.y - oy) / size) * size + oy,
    };
  }
  return { x: Math.round(point.x), y: Math.round(point.y) };
}
