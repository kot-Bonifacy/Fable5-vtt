import type { SmokeView } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Smoke as SmokeRow } from '../generated/prisma/client.js';

/**
 * Reading smoke rows (stage 16h).
 *
 * Split out of `smoke.ts` for the reason `covers-io.ts` was split out of the
 * covers: the roll path and the state sync both need „what hangs on this
 * scene?" without importing the event handlers, and the handlers need to push a
 * fresh list after every change without importing themselves back.
 *
 * Like the covers and unlike the walls, there is no filter here — every viewer
 * gets every cloud. A bank of smoke in the street is not a secret; whether a
 * given player can see the square is their field of view's business.
 */

export function toSmokeView(row: SmokeRow): SmokeView {
  return {
    id: row.id,
    sceneId: row.sceneId,
    name: row.name,
    x: row.x,
    y: row.y,
    sideM: row.sideM,
    penalty: row.penalty,
  };
}

/** Clouds hanging on one scene, in the order they were laid down. */
export async function fetchSceneSmoke(prisma: PrismaClient, sceneId: string): Promise<SmokeView[]> {
  const rows = await prisma.smoke.findMany({ where: { sceneId }, orderBy: { id: 'asc' } });
  return rows.map(toSmokeView);
}
