import type {
  ExplorationForgetPayload,
  ExplorationGrid,
  ExplorationMask,
  ExplorationSyncBroadcast,
  LightMask,
  ScenePoint,
  SceneExplorePayload,
  SceneUpdateBroadcast,
  SceneView,
} from '@vtt/shared';
import {
  ROLE_GM,
  createExplorationGrid,
  explorationDimensions,
  fromExplorationMask,
  lightMaskCellPx,
  mergeExploration,
  toExplorationMask,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Scene } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { requireCampaignScene, toSceneView } from './scenes.js';
import { campaignRoom, sceneRoom } from './state.js';

/**
 * Exploration memory (stage 18c) — core VTT, no game system involved.
 *
 * The geometry is in `@vtt/shared` (`exploration.ts`); this module owns the
 * copy the server keeps, decides when it is written down and who hears about
 * it.
 *
 * **Why there is a cache at all.** Every push of a player's field of view can
 * add cells, and while a token is being dragged that is ten pushes a second per
 * moving player. Writing the row each time would put a database round trip on
 * the hot path of a drag for a value that is usually unchanged. So the grid
 * lives in memory, merging is done there, and the row is written behind a short
 * debounce. The cost of that choice is bounded and worth stating plainly: a
 * server killed within a second of a discovery forgets that second. The party
 * walks one corridor twice.
 *
 * **Why it is shared rather than per player.** Exploration is what the *group*
 * has seen; a scout who walks ahead is telling the others what is there. That
 * also makes it one broadcast instead of one payload per socket, and it is the
 * only piece of visibility data in this project that can safely be the same for
 * everybody — because it contains nothing nobody has seen.
 */

/** How long a discovery may sit in memory before it reaches the database. */
const PERSIST_DEBOUNCE_MS = 1000;

/** sceneId → the party's memory of that scene. */
const grids = new Map<string, ExplorationGrid>();
/** sceneId → pending write. */
const pendingWrites = new Map<string, NodeJS.Timeout>();

/** Does this scene remember anything at all? */
export function usesExploration(scene: Pick<Scene, 'visibility' | 'explore'>): boolean {
  return scene.visibility === 'dynamic' && scene.explore;
}

/** Cell edge of this scene's exploration grid — the light mask's, deliberately. */
function cellPxOf(scene: Scene): number {
  return lightMaskCellPx({
    gridMode: scene.gridMode === 'gridless' ? 'gridless' : 'grid',
    grid: {
      sizePx: scene.gridSizePx,
      offsetX: scene.gridOffsetX,
      offsetY: scene.gridOffsetY,
      color: scene.gridColor,
      alpha: scene.gridAlpha,
      visible: scene.gridVisible,
    },
  });
}

/**
 * The party's memory of one scene, from the cache or the database.
 *
 * A stored grid whose cell size or extent no longer matches the scene is
 * dropped rather than resampled: it means the GM changed the grid or resized
 * the map, and a memory stretched over a map that moved underneath it would
 * show the party rooms they never entered. Losing the memory is the honest
 * failure here, and the GM can see it happen.
 */
export async function loadExploration(
  prisma: PrismaClient,
  scene: Scene,
): Promise<ExplorationGrid> {
  const cached = grids.get(scene.id);
  const cell = cellPxOf(scene);
  const { cols, rows } = explorationDimensions(scene, cell);
  if (cached && cached.cell === cell && cached.cols === cols && cached.rows === rows) {
    return cached;
  }

  const row = await prisma.sceneExploration.findUnique({ where: { sceneId: scene.id } });
  let grid: ExplorationGrid;
  if (row && row.cell === cell && row.cols === cols && row.rows === rows) {
    grid = fromExplorationMask({
      cell: row.cell,
      cols: row.cols,
      rows: row.rows,
      runs: parseRuns(row.data),
    });
  } else {
    grid = createExplorationGrid(cell, cols, rows);
  }
  grids.set(scene.id, grid);
  return grid;
}

/** Stored runs are a comma-separated list; a corrupt one starts from black. */
function parseRuns(data: string): number[] {
  if (data.length === 0) return [];
  const runs: number[] = [];
  for (const part of data.split(',')) {
    const value = Number(part);
    runs.push(Number.isFinite(value) ? value : 0);
  }
  return runs;
}

/** The mask a client needs; null when this scene does not remember. */
export async function explorationMaskFor(
  prisma: PrismaClient,
  scene: Scene | null,
): Promise<ExplorationMask | null> {
  if (!scene || !usesExploration(scene)) return null;
  return toExplorationMask(await loadExploration(prisma, scene));
}

/** Queues the row write; repeated calls inside the window collapse into one. */
function schedulePersist(prisma: PrismaClient, sceneId: string): void {
  if (pendingWrites.has(sceneId)) return;
  const timer = setTimeout(() => {
    pendingWrites.delete(sceneId);
    void persistExploration(prisma, sceneId);
  }, PERSIST_DEBOUNCE_MS);
  // The write must never be the reason a test run or a shutdown hangs.
  timer.unref?.();
  pendingWrites.set(sceneId, timer);
}

/** Writes one scene's memory now, cancelling any queued write. */
export async function persistExploration(prisma: PrismaClient, sceneId: string): Promise<void> {
  const timer = pendingWrites.get(sceneId);
  if (timer) {
    clearTimeout(timer);
    pendingWrites.delete(sceneId);
  }
  const grid = grids.get(sceneId);
  if (!grid) return;
  const mask = toExplorationMask(grid);
  const data = mask.runs.join(',');
  await prisma.sceneExploration.upsert({
    where: { sceneId },
    create: { sceneId, cell: mask.cell, cols: mask.cols, rows: mask.rows, data },
    update: { cell: mask.cell, cols: mask.cols, rows: mask.rows, data },
  });
}

/**
 * Folds one viewer's current sight into the party's memory.
 *
 * Returns true when that added something, which is the caller's cue to tell
 * everybody. On a group standing still in a room they know, it returns false
 * for every push — the common case, and the reason nothing here is throttled
 * beyond the write.
 */
export async function recordSight(
  prisma: PrismaClient,
  scene: Scene,
  sight: { polygons: readonly (readonly ScenePoint[])[]; mask?: LightMask | null },
): Promise<boolean> {
  if (!usesExploration(scene)) return false;
  const grid = await loadExploration(prisma, scene);
  const added = mergeExploration(grid, sight);
  if (added === 0) return false;
  schedulePersist(prisma, scene.id);
  return true;
}

/**
 * Sends the party's memory to everyone looking at the scene.
 *
 * One broadcast for all of them, GM included: the GM's client draws no cover at
 * all, so it simply ignores it, and a targeted emission would buy nothing.
 */
export async function emitExploration(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
): Promise<void> {
  const mask = await explorationMaskFor(deps.ctx.prisma, scene);
  const broadcast: ExplorationSyncBroadcast = { sceneId: scene.id, mask };
  const room = scene.active ? campaignRoom(campaignId) : sceneRoom(scene.id);
  deps.io.to(room).emit('explore:sync', broadcast);
}

/** Drops one scene's memory — from the cache, the row and every client. */
export async function forgetExploration(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
): Promise<void> {
  const cell = cellPxOf(scene);
  const { cols, rows } = explorationDimensions(scene, cell);
  grids.set(scene.id, createExplorationGrid(cell, cols, rows));
  await persistExploration(deps.ctx.prisma, scene.id);
  await emitExploration(deps, campaignId, scene);
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/**
 * „Forget the exploration" — the GM's undo for a map the party has learned.
 *
 * It does not touch the tokens: exploration never put one on anybody's screen
 * (a remembered room is a memory of a room, not a live feed of who is in it),
 * so there is nothing to re-filter.
 */
export const explorationForgetEvent = defineEvent<ExplorationForgetPayload>({
  name: 'explore:forget',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    await forgetExploration(deps, campaignId, scene);
  },
});

/**
 * The per-scene switch. Turning it off blacks out everything the party is not
 * looking at right now, but keeps the memory: a GM who wanted a horror scene
 * dark for one fight gets their map back when they switch it on again.
 */
export const sceneExploreEvent = defineEvent<SceneExplorePayload, SceneView>({
  name: 'scene:explore',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    if (typeof payload?.explore !== 'boolean') throw new RealtimeError('BAD_REQUEST');
    if (scene.explore === payload.explore) return toSceneView(scene);

    const updated = await deps.ctx.prisma.scene.update({
      where: { id: scene.id },
      data: { explore: payload.explore },
    });
    const view = toSceneView(updated);
    if (updated.active) {
      const room = campaignRoom(campaignId);
      deps.io.to(room).emit('scene:update', {
        seq: deps.seqs.next(room),
        scene: view,
      } satisfies SceneUpdateBroadcast);
    } else {
      deps.io
        .to(sceneRoom(updated.id))
        .emit('scene:update', { scene: view } satisfies SceneUpdateBroadcast);
    }
    await emitExploration(deps, campaignId, updated);
    return view;
  },
});

/** Test hook: drops the in-memory copy so a fresh server reads the rows again. */
export function resetExplorationCache(): void {
  for (const timer of pendingWrites.values()) clearTimeout(timer);
  pendingWrites.clear();
  grids.clear();
}
