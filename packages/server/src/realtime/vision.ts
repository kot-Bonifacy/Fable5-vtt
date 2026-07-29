import type { ScenePoint, SceneView, SessionUser, WallView } from '@vtt/shared';
import {
  ROLE_GM,
  blockingSegments,
  computeVisionPolygon,
  isSegmentClear,
  metresPerPixel,
  sceneBoundsSegments,
  tokenCentre,
  wallMidpoint,
  type Segment,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Scene, Token } from '../generated/prisma/client.js';
import type { RealtimeDeps } from './registry.js';
import { fetchSceneWalls } from './walls-io.js';
import { campaignRoom, emitToCampaignUser } from './state.js';

/**
 * Server-side field of view (stage 18a) — core VTT, no game system involved.
 *
 * This module is the reason walls never leave the server. It answers two
 * questions and emits one event:
 *
 *  - **„may this viewer see that point?"** — asked by the token layer before a
 *    token goes into anybody's payload. Hiding by omission is the only kind of
 *    hiding this project accepts;
 *  - **„what does this viewer see?"** — the finished polygons, pushed as
 *    `vision:sync` so the client can cut them out of a black sheet. The client
 *    receives the *result* of the raycast and never the geometry behind it.
 *
 * The GM is exempt from all of it: they see every token anyway, so they never
 * pay for a raycast.
 */

/** Scene fields the measurement helpers need off a database row. */
function toMeasureScene(scene: Scene): Pick<SceneView, 'grid' | 'metersPerSquare'> {
  return {
    grid: {
      sizePx: scene.gridSizePx,
      offsetX: scene.gridOffsetX,
      offsetY: scene.gridOffsetY,
      color: scene.gridColor,
      alpha: scene.gridAlpha,
      visible: scene.gridVisible,
    },
    metersPerSquare: scene.metersPerSquare,
  };
}

/** Does this scene decide visibility from walls at all? */
export function usesDynamicVision(scene: Pick<Scene, 'visibility'>): boolean {
  return scene.visibility === 'dynamic';
}

/**
 * Everything the raycast needs for one scene: the walls (for door lookups) and
 * the segments that currently block sight, scene border included.
 */
export interface SceneVisionContext {
  walls: WallView[];
  segments: Segment[];
}

export async function loadVisionContext(
  prisma: PrismaClient,
  scene: Scene,
): Promise<SceneVisionContext> {
  const walls = await fetchSceneWalls(prisma, scene.id);
  return {
    walls,
    // The scene border is always part of the set: without it a ray fired
    // through an open door would run to infinity and the polygon would be
    // unbounded.
    segments: [...blockingSegments(walls), ...sceneBoundsSegments(scene)],
  };
}

/**
 * Tokens that give this user sight on this scene: the ones they own, plus the
 * ones bound to a character they own.
 *
 * Hidden tokens count. A player who was given a hidden token can still see with
 * it — hiding is about what *others* may see, and the alternative would blind a
 * player for a reason they cannot observe.
 */
async function fetchVisionTokens(
  prisma: PrismaClient,
  sceneId: string,
  userId: string,
): Promise<Token[]> {
  return prisma.token.findMany({
    where: {
      sceneId,
      OR: [{ ownerId: userId }, { character: { ownerId: userId } }],
    },
  });
}

/** Turns one token into the origin and radius its sight is cast from. */
function visionSourceOf(
  token: Pick<Token, 'x' | 'y' | 'size' | 'visionRange'>,
  scene: Scene,
): { origin: ScenePoint; radiusPx: number | null } {
  const measure = toMeasureScene(scene);
  // Sight is measured from the token's centre — the same point the ruler and
  // the range bands use, so „where a token is" means one thing across the VTT.
  const origin = tokenCentre(token, measure);
  if (token.visionRange === null) return { origin, radiusPx: null };
  const perPixel = metresPerPixel(measure);
  if (perPixel <= 0) return { origin, radiusPx: null };
  return { origin, radiusPx: token.visionRange / perPixel };
}

/**
 * The polygons one player sees on this scene. Empty means „sees nothing" —
 * which is exactly what a player with no token on the scene gets, and is a
 * deliberate answer rather than a missing one.
 *
 * `liveOverride` lets a drag in flight be reflected before it is persisted: the
 * token being dragged is cast from where the pointer is, not from the position
 * still in the database.
 */
export async function visionPolygonsFor(
  prisma: PrismaClient,
  scene: Scene,
  userId: string,
  context: SceneVisionContext,
  liveOverride?: { tokenId: string; x: number; y: number },
): Promise<ScenePoint[][]> {
  const tokens = await fetchVisionTokens(prisma, scene.id, userId);
  return tokens.map((token) => {
    const positioned =
      liveOverride && liveOverride.tokenId === token.id
        ? { ...token, x: liveOverride.x, y: liveOverride.y }
        : token;
    const source = visionSourceOf(positioned, scene);
    return computeVisionPolygon(source.origin, context.segments, source.radiusPx);
  });
}

/**
 * Doors this player may operate *and* can currently see.
 *
 * The one crack in „walls never reach a player", and a deliberate one: a door
 * nobody can see is a door nobody can open. The GM decides which doors are the
 * players' to work by flagging them, and even those only travel once they are
 * in line of sight — so a marked door deep in an unexplored building still
 * gives nothing away.
 */
export function visibleDoorsFor(
  context: SceneVisionContext,
  sources: readonly { origin: ScenePoint; radiusPx: number | null }[],
): WallView[] {
  const doors = context.walls.filter((wall) => wall.kind === 'door' && wall.playerToggle);
  if (doors.length === 0 || sources.length === 0) return [];
  return doors.filter((door) => {
    const midpoint = wallMidpoint(door);
    // The door being tested is removed from the blockers: a closed door must
    // not hide itself.
    const others = context.segments.filter(
      (segment) =>
        !(
          segment.x1 === door.x1 &&
          segment.y1 === door.y1 &&
          segment.x2 === door.x2 &&
          segment.y2 === door.y2
        ),
    );
    return sources.some((source) => {
      if (source.radiusPx !== null) {
        const distance = Math.hypot(midpoint.x - source.origin.x, midpoint.y - source.origin.y);
        if (distance > source.radiusPx) return false;
      }
      return isSegmentClear(source.origin, midpoint, others);
    });
  });
}

/** The vision sources of one player — needed on its own for the door test. */
export async function visionSourcesFor(
  prisma: PrismaClient,
  scene: Scene,
  userId: string,
): Promise<{ origin: ScenePoint; radiusPx: number | null }[]> {
  const tokens = await fetchVisionTokens(prisma, scene.id, userId);
  return tokens.map((token) => visionSourceOf(token, scene));
}

/** What one player's socket needs after any change to what they can see. */
export interface ViewerVision {
  polygons: ScenePoint[][];
  doors: WallView[];
}

/**
 * Everything one viewer sees on a dynamic scene. Returns null for the GM and
 * for scenes that do not use walls — the caller then sends nothing, and the
 * client renders no cover.
 */
export async function computeViewerVision(
  prisma: PrismaClient,
  scene: Scene,
  user: SessionUser,
  context?: SceneVisionContext,
): Promise<ViewerVision | null> {
  if (!usesDynamicVision(scene) || user.role === ROLE_GM) return null;
  const ctx = context ?? (await loadVisionContext(prisma, scene));
  const sources = await visionSourcesFor(prisma, scene, user.id);
  return {
    polygons: sources.map((source) =>
      computeVisionPolygon(source.origin, ctx.segments, source.radiusPx),
    ),
    doors: visibleDoorsFor(ctx, sources),
  };
}

/**
 * How often a player's own field of view is recomputed while they drag a token,
 * in milliseconds. Ten pushes a second is smooth enough that the darkness feels
 * attached to the token, and it is the price of keeping the walls on the server:
 * a client holding the geometry could redraw every frame, and would also hold
 * the floor plan.
 */
const DRAG_VISION_INTERVAL_MS = 100;
/** userId:sceneId → when their vision was last pushed mid-drag. */
const lastDragPush = new Map<string, number>();

/**
 * Pushes one moving player their own field of view, at most ten times a second.
 * `force` (the drop) always goes through — the position that got persisted must
 * never be the one frame that was throttled away.
 */
export async function emitDragVision(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  userId: string,
  live: { tokenId: string; x: number; y: number },
  force: boolean,
): Promise<void> {
  if (!scene.active || !usesDynamicVision(scene)) return;
  const key = `${userId}:${scene.id}`;
  const now = Date.now();
  if (!force && now - (lastDragPush.get(key) ?? 0) < DRAG_VISION_INTERVAL_MS) return;
  lastDragPush.set(key, now);

  const context = await loadVisionContext(deps.ctx.prisma, scene);
  const polygons = await visionPolygonsFor(deps.ctx.prisma, scene, userId, context, live);
  await emitToCampaignUser(deps.io, campaignId, userId, 'vision:sync', {
    sceneId: scene.id,
    polygons,
  });
}

/**
 * Pushes every player viewing this scene their own field of view and door list.
 *
 * Targeted per socket without a seq, like `token:sync`: every player's polygons
 * differ, so this could never be a room broadcast. Only the active scene has
 * player viewers, so a GM's private preview costs nothing.
 */
export async function emitVisionToPlayers(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  options?: { onlyUserIds?: ReadonlySet<string> },
): Promise<void> {
  if (!scene.active || !usesDynamicVision(scene)) return;
  const context = await loadVisionContext(deps.ctx.prisma, scene);
  const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
  for (const member of sockets) {
    const data = member.data as { user: SessionUser; viewedSceneId: string | null };
    if (data.user.role === ROLE_GM || data.viewedSceneId !== scene.id) continue;
    if (options?.onlyUserIds && !options.onlyUserIds.has(data.user.id)) continue;
    const vision = await computeViewerVision(deps.ctx.prisma, scene, data.user, context);
    if (!vision) continue;
    member.emit('vision:sync', { sceneId: scene.id, polygons: vision.polygons });
    member.emit('door:sync', { sceneId: scene.id, doors: vision.doors });
  }
}
