import type { CoverView, SessionUser } from '@vtt/shared';
import { ROLE_GM, coversForPlayers } from '@vtt/shared';
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
 * Every viewer gets every *visible* cover, because a car in the street is not
 * a secret. Since 21.10.2026 the GM may hide one (an ambush barricade): it
 * stays in `fetchSceneCovers`, which is what the server's geometry reads, and
 * is cut out of a player's copy by `fetchCoversFor` — absent, not flagged.
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
    hidden: row.hidden,
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

/** Covers of one scene as this viewer may see them: the GM all, a player the visible ones. */
export async function fetchCoversFor(
  prisma: PrismaClient,
  sceneId: string,
  user: Pick<SessionUser, 'role'>,
): Promise<CoverView[]> {
  const covers = await fetchSceneCovers(prisma, sceneId);
  return user.role === ROLE_GM ? covers : coversForPlayers(covers);
}
