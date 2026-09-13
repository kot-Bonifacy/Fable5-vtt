import type { CombatActionLogEntry, ScenePoint, SessionUser } from '@vtt/shared';
import {
  CPRED_ACTION_MOVE,
  ROLE_GM,
  coverMovementSegments,
  firstBlockedStep,
  formatMetres,
  movementSegments,
  polylineMetres,
  tokenCentre,
  tokenTableName,
} from '@vtt/shared';
import type { Scene, Token } from '../generated/prisma/client.js';
import { sheetActionName, sheetMovementBlock, turnDistanceRefusal } from '../sheets.js';
import { RealtimeError, type RealtimeDeps } from './registry.js';
import {
  emitReloaded,
  findCombatantForToken,
  spendTurnForCombatant,
  type CombatantRow,
  type TurnSpendOutcome,
} from './combat.js';
import { actionEntry, logRefusedAction, logSpentAction, turnRefusalMessage } from './combat-log.js';
import { toLightScene } from './lights-io.js';
import { fetchSceneWalls } from './walls-io.js';
import { fetchSceneCovers } from './covers-io.js';

/**
 * The one place a move is judged (stage 14c).
 *
 * `token:move` used to be pure geometry: clamp, snap, broadcast. From this
 * stage it has rules to obey, and they will keep arriving — wall collisions are
 * an accepted idea waiting for a session of their own (POMYSLY, 30.07). So
 * every reason a token may not go somewhere lands here, in this order:
 *
 *  1. **Is anybody enforcing anything?** Outside a running fight — and for the
 *     GM, always — a drag is still just a drag. „Poza aktywną walką `token:move`
 *     działa jak dotąd" is a decision of this stage, not an oversight.
 *  2. **May this token move at all?** Being Prone, Grappled or unconscious is a
 *     flat no, before any arithmetic — a corpse does not run out of metres.
 *  3. **Is the way clear?** Walls, closed windows and standing covers stop a
 *     body (sesja naprawcza 21.08). This one is asked **outside** a fight too:
 *     a wall is a wall whether or not anybody is counting rounds, and until it
 *     was asked here the client's route planner was the only thing enforcing
 *     it — which a drag goes nowhere near.
 *  4. **Does the distance fit?** The path is measured *here*, from points the
 *     client reported and ends the server owns, and charged against the turn.
 *
 * A refusal is never silent: the token snaps back and the GM gets the same kind
 * of card stage 14b gives them for a refused Action, „Przepuść" included.
 */

/** How a refused move is reported back to the client that tried it. */
export const MOVE_REFUSED = 'MOVE_REFUSED';

/** A route that went through a wall, a closed window or a standing cover. */
export const MOVE_BLOCKED_BY_TERRAIN = 'MOVE_BLOCKED_BY_TERRAIN';
export const MOVE_BLOCKED_BY_TERRAIN_MESSAGE =
  'Coś stoi na drodze — tędy nie przejdziesz. Obejdź przeszkodę albo poproś MG.';

/**
 * Rebuilds the route from what the client reported.
 *
 * The client owns the *shape* of the drag and nothing else: both ends are
 * replaced with the server's own numbers, so a path cannot start somewhere
 * convenient or end somewhere other than where the token landed. Reporting a
 * shorter route than the hand actually took is possible and harmless — the
 * straight line is the cheapest anyone could claim, and it is also the shortest
 * way there.
 */
export function movementPath(
  from: ScenePoint,
  to: ScenePoint,
  reported: readonly ScenePoint[] | null,
): ScenePoint[] {
  const points: ScenePoint[] = [from];
  for (const point of reported ?? []) {
    const last = points[points.length - 1]!;
    if (Math.abs(point.x - last.x) < 1 && Math.abs(point.y - last.y) < 1) continue;
    points.push(point);
  }
  const last = points[points.length - 1]!;
  if (Math.abs(to.x - last.x) >= 1 || Math.abs(to.y - last.y) >= 1) points.push(to);
  return points;
}

/** Metres of a route, measured at the token's centre like everything else. */
export function movementMetres(
  scene: Scene,
  token: Pick<Token, 'size'>,
  path: readonly ScenePoint[],
): number {
  return polylineMetres(pathCentres(scene, token, path), toLightScene(scene));
}

/**
 * The same route measured from the figure's middle instead of its corner.
 *
 * Positions are stored top-left, but every question about geometry — how far,
 * and now „through what" — is a question about where the figure *is*. A 2 × 2
 * token dragged corner-first would otherwise be judged a metre and a half off.
 */
function pathCentres(
  scene: Scene,
  token: Pick<Token, 'size'>,
  path: readonly ScenePoint[],
): ScenePoint[] {
  const half = (token.size * scene.gridSizePx) / 2;
  return path.map((point) => ({ x: point.x + half, y: point.y + half }));
}

/** The move, as the caller describes it before anything has been judged. */
export interface MoveIntent {
  scene: Scene;
  token: Token;
  /** Where the token is now, in scene pixels (top-left, as stored). */
  from: ScenePoint;
  /** Where it is being dropped, already clamped and snapped by the caller. */
  to: ScenePoint;
  /** Waypoints the client reported; null for a plain drag. */
  path: ScenePoint[] | null;
}

/** What the validator decided; the caller only ever sees a pass or a throw. */
export interface MoveVerdict {
  /** Distance charged, in metres (0 when nothing was enforced). */
  metres: number;
  /** True when a fight was actually policing this move. */
  enforced: boolean;
}

/**
 * Judges one drop. Throws `MOVE_REFUSED` after posting the GM's card when the
 * move may not happen; returns quietly otherwise.
 */
export async function validateTokenMove(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  intent: MoveIntent,
): Promise<MoveVerdict> {
  const { scene, token } = intent;
  const walked = movementPath(intent.from, intent.to, intent.path);
  await refuseWalkThroughSolid(deps, campaignId, user, intent, walked);

  const found = await findCombatantForToken(deps.ctx.prisma, scene.id, token.id);
  if (!found) return { metres: 0, enforced: false };

  const path = walked;
  const metres = movementMetres(scene, token, path);

  const blocked = await refuseBlockedByStatus(
    deps,
    campaignId,
    user,
    scene,
    found.combatant,
    token,
  );
  if (blocked) throw new RealtimeError(MOVE_REFUSED);

  const outcome = await spendTurnForCombatant(
    deps,
    found.combat,
    found.combatant,
    { kind: 'move', metres },
    user,
  );
  await settleMovementSpend(deps, campaignId, scene, user, outcome, metres);
  return { metres, enforced: true };
}

/**
 * Posts the card for a refused move (stage 14c). Movement refusals reuse the
 * whole machinery of stage 14b — the same card, the same audience, the same
 * „Przepuść" button — because at the table they are the same conversation:
 * somebody tried to do a thing and the rules said no.
 */
async function logMovementRefusal(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  entry: CombatActionLogEntry,
): Promise<void> {
  await logRefusedAction(deps, campaignId, user, entry);
}

/**
 * Tail of a movement spend: emit the tracker, and turn a refusal into the GM's
 * card plus a thrown error the client answers with a snap-back.
 *
 * A *successful* move is deliberately silent on chat. An Action is a statement
 * („Vex — Przeładowanie"); walking is not, and a line per drag would bury the
 * conversation the tracker exists to support. The exceptions are the two cases
 * that are statements: the GM going past the budget, and a pass being burned.
 */
async function settleMovementSpend(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  user: SessionUser,
  outcome: TurnSpendOutcome,
  metres: number,
): Promise<void> {
  if (outcome.kind === 'not-in-combat') return;
  const name = sheetActionName(CPRED_ACTION_MOVE);
  const distance = `${formatMetres(metres)} ścieżki`;

  if (outcome.kind === 'refused') {
    // A refusal that arrived with a sentence of its own keeps it: a wound says
    // „Uraz ucha: po marszu ponad 4 m…", which is the only version the player
    // can act on (stage 14e). Only a plain budget refusal is phrased here.
    const message =
      outcome.message ??
      (outcome.error === 'NO_MOVE_LEFT'
        ? turnDistanceRefusal(outcome.judged, metres)
        : turnRefusalMessage(outcome.error));
    await logMovementRefusal(deps, campaignId, user, {
      ...actionEntry(outcome.combatant, CPRED_ACTION_MOVE, name, distance),
      refusal: { code: outcome.error, message },
    });
    throw new RealtimeError(MOVE_REFUSED);
  }

  await emitReloaded(deps, campaignId, scene, outcome.combatant.combatId);
  if (!outcome.forced && !outcome.bypassed) return;
  await logSpentAction(deps, campaignId, user, {
    ...actionEntry(outcome.combatant, CPRED_ACTION_MOVE, name, distance),
    ...(outcome.forced ? { overspent: true } : {}),
    ...(outcome.bypassed ? { passed: true } : {}),
  });
}

/**
 * „Nie tędy" — the route walked through something solid (sesja naprawcza 21.08).
 *
 * The geometry is the client's own: `movementSegments` and `coverMovementSegments`
 * are the very lists stage 16e hands its route planner, so a refusal here can
 * only ever mean the figure did **not** come from the planner — a drag, a bot
 * with a stale idea of the map, or a hand-made payload. That is the whole point:
 * planning is not enforcement, and until this check existed the only thing
 * standing between a player and a walk through a wall was their own client.
 *
 * The GM is exempt, like everywhere else in this module. Placing figures is
 * half of what a GM does with a map, and a scene is built by dropping people
 * into rooms whose doors are not cut yet.
 */
async function refuseWalkThroughSolid(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  intent: MoveIntent,
  walked: readonly ScenePoint[],
): Promise<void> {
  if (user.role === ROLE_GM) return;
  const { scene, token } = intent;
  const [walls, covers] = await Promise.all([
    fetchSceneWalls(deps.ctx.prisma, scene.id),
    fetchSceneCovers(deps.ctx.prisma, scene.id),
  ]);
  const solid = [...movementSegments(walls), ...coverMovementSegments(covers)];
  // Not the centre line alone: a 2×2 figure keeps its middle a metre clear of
  // the wall its edge is walking through (stage 27j). The footprint traces one
  // lane per cell, which is the same geometry the client's planner respects.
  const blocked = firstBlockedStep(pathCentres(scene, token, walked), solid, {
    size: token.size,
    cell: scene.gridSizePx,
  });
  if (!blocked) return;

  // Nothing is named: the refusal says a route was blocked, never *by what*.
  // A player who cannot see a wall must not learn its position by walking into
  // it — the same reason walls never leave the server (stage 18a).
  const found = await findCombatantForToken(deps.ctx.prisma, scene.id, token.id);
  if (found) {
    await logMovementRefusal(deps, campaignId, user, {
      ...actionEntry(found.combatant, CPRED_ACTION_MOVE, sheetActionName(CPRED_ACTION_MOVE), ''),
      refusal: { code: MOVE_BLOCKED_BY_TERRAIN, message: MOVE_BLOCKED_BY_TERRAIN_MESSAGE },
    });
  }
  throw new RealtimeError(MOVE_REFUSED);
}

/**
 * „Powalony token musi najpierw wstać." Statuses are checked before the budget
 * because they are not an arithmetic problem: telling a Grappled player they
 * ran out of metres would send them looking for a shorter route.
 *
 * The GM is exempt, and so is a participant the GM already waved through —
 * their one-shot pass is spent on the budget a moment later.
 */
async function refuseBlockedByStatus(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  scene: Scene,
  combatant: CombatantRow,
  token: Token,
): Promise<boolean> {
  if (user.role === ROLE_GM || combatant.actionBypass) return false;
  const statuses = readStatuses(token.statuses);
  const message = sheetMovementBlock(statuses);
  if (!message) return false;
  const entry: CombatActionLogEntry = {
    combatantId: combatant.id,
    actorName: tokenTableName(token, token.name),
    actionId: 'move',
    actionName: sheetActionName('move'),
    refusal: { code: 'MOVE_BLOCKED', message },
  };
  await logMovementRefusal(deps, campaignId, user, entry);
  return true;
}

function readStatuses(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Centre of a token at a given position — used by callers drawing the reach. */
export function centreOf(scene: Scene, token: Pick<Token, 'size'>, at: ScenePoint): ScenePoint {
  return tokenCentre({ x: at.x, y: at.y, size: token.size }, toLightScene(scene));
}
