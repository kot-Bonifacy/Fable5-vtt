import type { ScenePoint, WallView } from '@vtt/shared';
import { isSegmentClear, isWallKind, movementSegments } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Wall as WallRow } from '../generated/prisma/client.js';

/**
 * Reading wall rows (stage 18a).
 *
 * Split out of `walls.ts` for the same reason `fog-io.ts` was split out of the
 * fog: the token layer and the vision calculation both need „what blocks sight
 * on this scene?" without importing the event handlers, and the handlers need
 * to push a fresh vision after every edit without importing themselves back.
 */

/** Rebuilds a stored row into the shared view. */
export function toWallView(row: WallRow): WallView {
  return {
    id: row.id,
    sceneId: row.sceneId,
    // A hand-edited row must not reach the raycast as an unknown kind; the
    // safe fallback is the one that blocks.
    kind: isWallKind(row.kind) ? row.kind : 'wall',
    open: row.open,
    playerToggle: row.playerToggle,
    locked: row.locked,
    x1: row.x1,
    y1: row.y1,
    x2: row.x2,
    y2: row.y2,
  };
}

/**
 * Walls of one scene, in creation order.
 *
 * Deliberately un-cached. A scene holds tens of rows, SQLite is local, and the
 * alternative — a cache invalidated from every door toggle, wall edit and scene
 * switch — is exactly the kind of bookkeeping that eventually shows a player a
 * room they should not see. If a measurement ever says this is the bottleneck,
 * cache it *then*.
 */
export async function fetchSceneWalls(prisma: PrismaClient, sceneId: string): Promise<WallView[]> {
  const rows = await prisma.wall.findMany({ where: { sceneId }, orderBy: { id: 'asc' } });
  return rows.map(toWallView);
}

/**
 * Does something that stops a body stand between two points (stage 42a)?
 *
 * The geometric half of „can I reach them?". A melee swing and a grab ask it with
 * the very list a walking figure is held to (`movementSegments`), so a fence, a
 * shut gate and a closed window stop an arm exactly where they stop legs.
 */
export async function isBodyBlocked(
  prisma: PrismaClient,
  sceneId: string,
  from: ScenePoint,
  to: ScenePoint,
): Promise<boolean> {
  const walls = await fetchSceneWalls(prisma, sceneId);
  if (walls.length === 0) return false;
  return !isSegmentClear(from, to, movementSegments(walls));
}
