import type { FogShape, FogShapeView, FogState } from '@vtt/shared';
import { sanitizeFogShape } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { FogShape as FogShapeRow, Scene } from '../generated/prisma/client.js';

/**
 * Reading and writing fog rows (stage 17).
 *
 * Split out of `fog.ts` so the token layer can ask „is this spot covered?"
 * without importing the event handlers — and `fog.ts` can push the filtered
 * token list after a repaint without importing itself back.
 */

/** Rebuilds a stored row into the shared shape type; null when unreadable. */
function toFogShapeView(row: FogShapeRow): FogShapeView | null {
  let data: unknown;
  try {
    data = JSON.parse(row.data);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  // The row was validated on the way in — re-validating on the way out keeps a
  // hand-edited database from ever reaching the geometry functions.
  const shape = sanitizeFogShape({ ...data, kind: row.kind, mode: row.mode });
  return shape ? { ...shape, id: row.id } : null;
}

/** Flattens a shape into the columns the table stores. */
export function toFogRowData(shape: FogShape): { mode: string; kind: string; data: string } {
  const geometry =
    shape.kind === 'stroke'
      ? { points: shape.points, radius: shape.radius }
      : { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  return { mode: shape.mode, kind: shape.kind, data: JSON.stringify(geometry) };
}

/** The fog of one scene, in paint order. The same view goes to every viewer. */
export async function fetchFogState(prisma: PrismaClient, scene: Scene): Promise<FogState> {
  // A scene not painting fog needs no shapes at all: skipping the query keeps
  // the common cases (city scenes, handouts, walled interiors) free. The rows
  // stay in the table, so switching the mode back restores the exploration the
  // group had already done.
  if (scene.visibility !== 'fog') return { sceneId: scene.id, enabled: false, shapes: [] };
  const rows = await prisma.fogShape.findMany({
    where: { sceneId: scene.id },
    orderBy: { id: 'asc' },
  });
  return {
    sceneId: scene.id,
    enabled: true,
    shapes: rows.map(toFogShapeView).filter((shape): shape is FogShapeView => shape !== null),
  };
}
