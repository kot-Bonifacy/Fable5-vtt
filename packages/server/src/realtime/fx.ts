import type { Scene } from '../generated/prisma/client.js';
import type { MapFxBroadcast, MapFxEffect, ScenePoint, SessionUser } from '@vtt/shared';
import { ROLE_GM, isPointRevealed, isPointVisible, trimMapFxBatch } from '@vtt/shared';
import { concealmentFor, type Concealment } from './tokens.js';
import type { RealtimeDeps } from './registry.js';
import { campaignRoom } from './state.js';
import { isPointObservable, loadVisionContext } from './vision.js';

/**
 * The map's effect channel (stage 27i).
 *
 * A shot, a blast, a number floating off a figure — none of it is state. It is
 * never stored, never sequenced and never replayed on a resync, exactly like
 * the shared ruler of stage 16 and the intermediate positions of a drag: a
 * player who reconnects a second late simply missed the bang, and the chat card
 * that outlives it is where the *fact* lives.
 *
 * Targeted per socket rather than broadcast to the scene room, and that is the
 * point of the module. „Dane niewidoczne dla gracza nie opuszczają serwera" has
 * to hold for a muzzle flash as firmly as it holds for a token list, and every
 * viewer's answer differs — one player standing in the lit corridor sees the
 * shooter, the one round the corner sees only the impact. Trimming happens in
 * `trimMapFxForViewer` (pure, in `shared`, tested there); this file is the part
 * that knows what each socket can see.
 */

/** Where a figure of this size standing at `x,y` has its middle. */
export function fxCentre(
  token: { x: number; y: number; size: number },
  scene: Pick<Scene, 'gridSizePx'>,
): ScenePoint {
  const half = (token.size * scene.gridSizePx) / 2;
  return { x: token.x + half, y: token.y + half };
}

/**
 * Is one point observable to a viewer under their concealment?
 *
 * The point version of `concealedFrom` — the same three regimes, minus the „you
 * always see your own figure" exemption, which has no meaning for a patch of
 * ground. On a fog scene an unrevealed square hides an effect exactly as it
 * hides a token; on a dynamic-vision scene the walls and the light decide, and
 * the GM's brush outranks both (stage 18c).
 */
export function pointObservable(
  point: ScenePoint,
  concealment: Concealment,
  figure = true,
): boolean {
  if (figure && concealment.figurePolygons && !isPointVisible(point, concealment.figurePolygons))
    return false;
  if (concealment.kind === 'none') return true;
  if (concealment.kind === 'fog') {
    if (!concealment.fog.enabled) return true;
    return isPointRevealed(point, concealment.fog);
  }
  return isPointObservable(
    point,
    concealment.polygons,
    concealment.lighting,
    concealment.overrides,
  );
}

/**
 * Plays a batch of effects for everybody currently looking at this scene.
 *
 * Only viewers of *this* map hear it: a GM previewing another scene (stage 04)
 * is not at this table right now, and a player whose client is elsewhere would
 * get a bang with no picture. An inactive scene therefore costs nothing but the
 * socket walk.
 *
 * The GM is subject to no concealment and never pays for the raycast, the same
 * bargain `fetchSceneTokensFor` struck.
 */
export async function emitMapFx(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  effects: readonly MapFxEffect[],
  /** Roll card the batch waits for, when it belongs to one (see `MapFxBroadcast`). */
  afterMessageId?: number,
): Promise<void> {
  if (effects.length === 0) return;
  const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
  const viewers = sockets.filter(
    (member) => (member.data as { viewedSceneId: string | null }).viewedSceneId === scene.id,
  );
  if (viewers.length === 0) return;

  const after = afterMessageId !== undefined ? { afterMessageId } : {};
  const full: MapFxBroadcast = { sceneId: scene.id, effects: [...effects], ...after };
  // One raycast context for the whole batch: every player on a dynamic-vision
  // scene needs the same walls and the same lamps, and loading them once per
  // socket is how a single grenade turned into six identical queries.
  const needsVision = viewers.some(
    (member) => (member.data as { user: SessionUser }).user.role !== ROLE_GM,
  );
  const context = needsVision ? await loadVisionContext(deps.ctx.prisma, scene) : undefined;

  for (const member of viewers) {
    const user = (member.data as { user: SessionUser }).user;
    if (user.role === ROLE_GM) {
      member.emit('fx:play', full);
      continue;
    }
    const concealment = await concealmentFor(deps.ctx.prisma, scene, user, context);
    const trimmed =
      concealment.kind === 'none' && !concealment.figurePolygons
        ? full.effects
        : trimMapFxBatch(
            full.effects,
            (point) => pointObservable(point, concealment),
            (point) => pointObservable(point, concealment, false),
          );
    // „Nothing survived" is silence, not an empty envelope: a client that got
    // `effects: []` would have to decide what it means, and there is nothing
    // to decide.
    if (trimmed.length === 0) continue;
    const payload: MapFxBroadcast = { sceneId: scene.id, effects: trimmed, ...after };
    member.emit('fx:play', payload);
  }
}
