import type { BlockerSyncBroadcast, Segment, SessionUser } from '@vtt/shared';
import { ROLE_GM, isPointRevealed, standingBarriers, wallSamplePoints } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Scene } from '../generated/prisma/client.js';
import type { RealtimeDeps } from './registry.js';
import { fetchFogState } from './fog-io.js';
import { campaignRoom } from './state.js';
import { fetchSceneWalls } from './walls-io.js';
import {
  loadVisionContext,
  usesDynamicVision,
  viewerSightFor,
  visibleWalkBlockersFor,
} from './vision.js';

/**
 * Obstacles a player's route planner is told about (stage 42a) — core VTT.
 *
 * Walls never reach a player (18a), and for a long time that cost the planner
 * nothing: whatever stopped a body also stopped the eye, so the edge of a
 * player's field of view was the edge of the floor they could walk. A barrier is
 * the first thing built to be looked through and not walked through, and a
 * planner that does not know about it draws a route straight across the fence
 * the server then refuses.
 *
 * The fix is the smallest crack in „walls never reach a player" that works: bare
 * segments, only of what stops a body and not the eye, only of what the player
 * can see. On a dynamic scene the list is per player and rides with the vision
 * (`visibleWalkBlockersFor`); on a fogged or open map it is one list for every
 * player and is built here.
 */

/**
 * The list for a scene without dynamic vision: every barrier and shut gate — on
 * a fogged map only the ones the GM has revealed at least a piece of.
 */
async function standingBlockersFor(prisma: PrismaClient, scene: Scene): Promise<Segment[]> {
  const barriers = standingBarriers(await fetchSceneWalls(prisma, scene.id));
  if (barriers.length === 0) return [];
  const fog = scene.visibility === 'fog' ? await fetchFogState(prisma, scene) : null;
  // Half a square between samples: fog is painted with a brush, and a stroke
  // narrower than that is not a reveal anybody meant.
  const spacing = scene.gridSizePx / 2;
  return barriers
    .filter(
      (wall) =>
        fog === null ||
        wallSamplePoints(wall, spacing).some((point) => isPointRevealed(point, fog)),
    )
    .map((wall) => ({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 }));
}

/** The planner's obstacles for one viewer — empty for the GM, who has the walls. */
export async function walkBlockersFor(
  prisma: PrismaClient,
  scene: Scene,
  user: SessionUser,
): Promise<Segment[]> {
  if (user.role === ROLE_GM) return [];
  if (!usesDynamicVision(scene)) return standingBlockersFor(prisma, scene);
  const context = await loadVisionContext(prisma, scene);
  return visibleWalkBlockersFor(context, await viewerSightFor(prisma, scene, user.id, context));
}

/**
 * Pushes the list to every player looking at a scene without dynamic vision —
 * after a wall edit, a fog stroke or a change of visibility mode. A dynamic
 * scene sends it with each player's vision instead (`emitVisionToPlayers`), so
 * this returns there without a single query.
 */
export async function emitBlockersToPlayers(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
): Promise<void> {
  if (!scene.active || usesDynamicVision(scene)) return;
  const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
  const players = sockets.filter((member) => {
    const data = member.data as { user: SessionUser; viewedSceneId: string | null };
    return data.user.role !== ROLE_GM && data.viewedSceneId === scene.id;
  });
  if (players.length === 0) return;
  const payload: BlockerSyncBroadcast = {
    sceneId: scene.id,
    segments: await standingBlockersFor(deps.ctx.prisma, scene),
  };
  for (const member of players) member.emit('blocker:sync', payload);
}
