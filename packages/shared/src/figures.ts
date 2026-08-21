/**
 * How a figure *reads* on the map (stage 27j).
 *
 * Two questions the renderer keeps asking and must not answer for itself:
 * „which way is this one turned" and „what kind of trouble is it in". Both are
 * pure arithmetic over data the core already carries, and both have to give the
 * same answer on the server (which persists the angle) and in the browser
 * (which draws it), so they live here rather than in `TokenNode`.
 *
 * Nothing in this file knows what Cyberpunk RED is. The wound states arrive as
 * *data* — a status definition may declare which condition it puts a figure in
 * — exactly as the status icons themselves do (stage 05).
 */

import type { ScenePoint } from './measure.js';
import type { StatusDefinition, TokenHp, TokenView } from './tokens.js';

/**
 * Facing in degrees, 0 = up (north), growing clockwise.
 *
 * The convention Foundry's `rotation` uses, and the one a person reading the
 * number out of the database will guess right: 90 is east, 180 is down. Kept in
 * degrees rather than radians because it is a *stored* value — a column, a
 * payload and a tooltip — and only the renderer needs it in radians.
 */
export const FACING_UP = 0;
export const FACING_RIGHT = 90;
export const FACING_DOWN = 180;
export const FACING_LEFT = 270;

/** Folds any angle into [0, 360) and rounds it to a whole degree. */
export function normalizeFacing(degrees: number): number {
  if (!Number.isFinite(degrees)) return FACING_UP;
  const wrapped = Math.round(degrees) % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * Smallest movement that counts as „turned that way", in scene pixels.
 *
 * A drop half a pixel from where the figure stood is a hand that shook, not a
 * decision, and letting it set the facing would spin sentries at random. Two
 * pixels is well under a step on any grid this project draws.
 */
export const FACING_MIN_TRAVEL_PX = 2;

/**
 * Which way a figure ends up looking after moving (or aiming) by this delta,
 * or null when the delta is too small to mean anything.
 *
 * Scene coordinates grow downwards, so „up" is negative Y — the flip lives here
 * and nowhere else.
 */
export function facingFromDelta(dx: number, dy: number): number | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.hypot(dx, dy) < FACING_MIN_TRAVEL_PX) return null;
  return normalizeFacing((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/**
 * Facing at the end of a walked route: the direction of its last real leg.
 *
 * Measured from the last waypoint far enough back to count rather than from the
 * one before the end — the tail of a route is often a snap onto a square centre,
 * a fraction of a pixel long, and a figure that turned to face *that* would end
 * every march looking somewhere absurd.
 */
export function facingFromPath(points: readonly ScenePoint[]): number | null {
  const end = points[points.length - 1];
  if (!end) return null;
  for (let i = points.length - 2; i >= 0; i--) {
    const from = points[i]!;
    const facing = facingFromDelta(end.x - from.x, end.y - from.y);
    if (facing !== null) return facing;
  }
  return null;
}

/** Validates a facing off the wire; `undefined` = invalid, `null` = „forget it". */
export function sanitizeFacing(raw: unknown): number | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  return normalizeFacing(raw);
}

/**
 * What kind of shape a figure is in, from worst to best.
 *
 * Four states rather than a percentage because the map is answering a question
 * asked across a table — „is he still up?" — and a bar answers it with a length
 * nobody reads at a glance. `dead` and `down` are *facts about the figure*;
 * `wounded` is a warning; `ok` draws nothing extra.
 */
export type TokenCondition = 'ok' | 'wounded' | 'down' | 'dead';

const CONDITION_ORDER: Readonly<Record<TokenCondition, number>> = {
  ok: 0,
  wounded: 1,
  down: 2,
  dead: 3,
};

/**
 * Below this share of maximum HP a figure counts as wounded when nothing on it
 * says otherwise.
 *
 * CP RED's own Seriously Wounded threshold, and the server already keeps the
 * matching status on every token bound to hit points — so this is the fallback
 * for the tokens nobody statted, not the rule. Half, because that is the number
 * the rules use; the core does not know *why*.
 */
export const WOUNDED_HP_RATIO = 0.5;

/** A figure at zero hit points is down whatever else it is wearing. */
function conditionFromHp(hp: TokenHp | null | undefined): TokenCondition {
  if (!hp || hp.max <= 0) return 'ok';
  if (hp.current <= 0) return 'down';
  return hp.current / hp.max < WOUNDED_HP_RATIO ? 'wounded' : 'ok';
}

/**
 * The condition a figure is in, taking the worst of what its statuses say and
 * what its hit points say.
 *
 * `conditions` maps status id → condition and comes from the registry the
 * server serves (`data/public/cpred/statuses.json`); a viewer who was not sent
 * the HP simply falls back on the statuses, which everybody gets. That is why a
 * player can see an enemy drop without ever learning its hit points.
 */
export function tokenCondition(
  token: Pick<TokenView, 'statuses'> & { hp?: TokenHp | null },
  conditions: ReadonlyMap<string, TokenCondition>,
): TokenCondition {
  let worst = conditionFromHp(token.hp);
  for (const statusId of token.statuses) {
    const condition = conditions.get(statusId);
    if (condition && CONDITION_ORDER[condition] > CONDITION_ORDER[worst]) worst = condition;
  }
  return worst;
}

/** Builds the id → condition lookup from the status registry. */
export function conditionRegistry(
  statuses: readonly StatusDefinition[],
): Map<string, TokenCondition> {
  const map = new Map<string, TokenCondition>();
  for (const status of statuses) {
    if (status.condition) map.set(status.id, status.condition);
  }
  return map;
}
