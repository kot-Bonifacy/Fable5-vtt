import type { CoverView } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Cover as CoverRow } from '../generated/prisma/client.js';

/**
 * Reading cover rows (stage 16c).
 *
 * Split out of `covers.ts` for the reason `walls-io.ts` was split out of the
 * walls: the attack path and the state sync both need „what stands on this
 * scene?" without importing the event handlers, and the handlers need to push a
 * fresh list after every edit without importing themselves back.
 *
 * Note what is *missing* compared with the wall reader — a filter. Every viewer
 * gets every cover, because a car in the street is not a secret; the only thing
 * that decides whether a player sees one is whether their own field of view
 * reaches it, and that is the renderer's business, not this file's.
 */

export function toCoverView(row: CoverRow): CoverView {
  return {
    id: row.id,
    sceneId: row.sceneId,
    typeId: row.typeId,
    name: row.name,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    hpMax: row.hpMax,
    // A hand-edited row must not hand the geometry a negative wall of health;
    // clamping here keeps `coverStanding` the single definition of „standing".
    hpCurrent: Math.max(0, Math.min(row.hpCurrent, row.hpMax)),
  };
}

/**
 * Covers of one scene, in creation order — which is also the paint order, and
 * therefore the order `pickCoverAt` resolves a click in.
 *
 * Un-cached, like the walls: a scene holds tens of rows and SQLite is local.
 */
export async function fetchSceneCovers(
  prisma: PrismaClient,
  sceneId: string,
): Promise<CoverView[]> {
  const rows = await prisma.cover.findMany({ where: { sceneId }, orderBy: { id: 'asc' } });
  return rows.map(toCoverView);
}
