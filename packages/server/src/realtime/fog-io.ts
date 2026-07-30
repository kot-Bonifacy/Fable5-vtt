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

/** Which set of shapes the brush writes to on this scene (stage 18c). */
export function paintsOverride(scene: Pick<Scene, 'visibility'>): boolean {
  return scene.visibility === 'dynamic';
}

/** The shapes of one set, in paint order. */
async function fetchShapes(
  prisma: PrismaClient,
  sceneId: string,
  override: boolean,
): Promise<FogShapeView[]> {
  const rows = await prisma.fogShape.findMany({
    where: { sceneId, override },
    orderBy: { id: 'asc' },
  });
  return rows.map(toFogShapeView).filter((shape): shape is FogShapeView => shape !== null);
}

/**
 * The fog of one scene, in paint order. The same view goes to every viewer.
 *
 * Exactly one of the two lists is ever populated, decided by the scene's mode:
 * a scene painting fog reads the fog set, a scene on dynamic vision reads the
 * GM's overrides (stage 18c), and an open scene reads neither. Both sets stay
 * in the table through a mode change, so switching back restores the work the
 * GM had already done — and switching *over* never reinterprets it.
 */
export async function fetchFogState(prisma: PrismaClient, scene: Scene): Promise<FogState> {
  // A scene doing neither needs no shapes at all: skipping the query keeps the
  // common cases (city scenes, handouts) free.
  if (scene.visibility === 'fog') {
    return {
      sceneId: scene.id,
      enabled: true,
      shapes: await fetchShapes(prisma, scene.id, false),
      overrides: [],
    };
  }
  if (scene.visibility === 'dynamic') {
    return {
      sceneId: scene.id,
      enabled: false,
      shapes: [],
      overrides: await fetchShapes(prisma, scene.id, true),
    };
  }
  return { sceneId: scene.id, enabled: false, shapes: [], overrides: [] };
}
