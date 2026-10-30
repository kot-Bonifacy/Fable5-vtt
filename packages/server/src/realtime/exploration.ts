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
  SessionUser,
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

/**
 * Pamięć jednego gracza (30.10.2026): scena bez „Gracze dzielą się widokiem”
 * (`Scene.partySight`) pokazuje graczowi tylko to, co sam zobaczył — inaczej
 * zwiad jednego dalej rysowałby plan mapy całej drużynie, a MG chodziło o to,
 * żeby każdy chodził sam. Serwer dopisuje wzrok gracza do obu pamięci naraz;
 * przełącznik wybiera tylko, którą gracz dostaje.
 */
interface MemoryKey {
  sceneId: string;
  /** `null` — pamięć drużyny (`SceneExploration`); inaczej `PlayerExploration`. */
  userId: string | null;
}

/** Kto patrzy — tyle z konta, ile pamięć potrzebuje. */
type MemoryViewer = Pick<SessionUser, 'id' | 'role'>;

function cacheKey(key: MemoryKey): string {
  return key.userId === null ? key.sceneId : `${key.sceneId}:${key.userId}`;
}

/** sceneId (drużyna) albo sceneId:userId (gracz) → pamięć tej sceny. */
const grids = new Map<string, ExplorationGrid>();
/** Ten sam klucz → zaplanowany zapis. */
const pendingWrites = new Map<string, NodeJS.Timeout>();

/** Does this scene remember anything at all? */
export function usesExploration(scene: Pick<Scene, 'visibility' | 'explore'>): boolean {
  return scene.visibility === 'dynamic' && scene.explore;
}

/** Which memory this viewer's screen draws — the party's or their own. */
function memoryKeyFor(scene: Pick<Scene, 'id' | 'partySight'>, viewer: MemoryViewer): MemoryKey {
  return {
    sceneId: scene.id,
    userId: scene.partySight || viewer.role === ROLE_GM ? null : viewer.id,
  };
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
      players: scene.gridPlayers,
    },
  });
}

type StoredMemory = { cell: number; cols: number; rows: number; data: string } | null;

async function readMemoryRow(prisma: PrismaClient, key: MemoryKey): Promise<StoredMemory> {
  return key.userId === null
    ? prisma.sceneExploration.findUnique({ where: { sceneId: key.sceneId } })
    : prisma.playerExploration.findUnique({
        where: { sceneId_userId: { sceneId: key.sceneId, userId: key.userId } },
      });
}

/**
 * One memory of one scene — the party's or a player's — from the cache or the
 * database.
 *
 * A stored grid whose cell size or extent no longer matches the scene is
 * dropped rather than resampled: it means the GM changed the grid or resized
 * the map, and a memory stretched over a map that moved underneath it would
 * show the party rooms they never entered. Losing the memory is the honest
 * failure here, and the GM can see it happen.
 *
 * Gracz bez własnego zapisu zaczyna od czystej mapy — także na scenie, na
 * której koledzy już coś zwiedzili. To, co znał sprzed przełącznika, przepisała
 * mu migracja z 30.10. Kopia pamięci drużyny przy pierwszym odczycie wniosłaby
 * mu to, co kolega zobaczył chwilę wcześniej w tej samej pętli wzroku.
 */
async function loadMemory(
  prisma: PrismaClient,
  scene: Scene,
  key: MemoryKey,
): Promise<ExplorationGrid> {
  const id = cacheKey(key);
  const cached = grids.get(id);
  const cell = cellPxOf(scene);
  const { cols, rows } = explorationDimensions(scene, cell);
  if (cached && cached.cell === cell && cached.cols === cols && cached.rows === rows) {
    return cached;
  }

  const row = await readMemoryRow(prisma, key);
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
  grids.set(id, grid);
  return grid;
}

/** The party's memory of one scene (stage 18c). */
export async function loadExploration(
  prisma: PrismaClient,
  scene: Scene,
): Promise<ExplorationGrid> {
  return loadMemory(prisma, scene, { sceneId: scene.id, userId: null });
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

/**
 * The mask this viewer's client needs; null when this scene does not remember.
 * Bez `viewer` — pamięć drużyny.
 */
export async function explorationMaskFor(
  prisma: PrismaClient,
  scene: Scene | null,
  viewer?: MemoryViewer,
): Promise<ExplorationMask | null> {
  if (!scene || !usesExploration(scene)) return null;
  const key = viewer ? memoryKeyFor(scene, viewer) : { sceneId: scene.id, userId: null };
  return toExplorationMask(await loadMemory(prisma, scene, key));
}

/** Queues the row write; repeated calls inside the window collapse into one. */
function schedulePersist(prisma: PrismaClient, key: MemoryKey): void {
  const id = cacheKey(key);
  if (pendingWrites.has(id)) return;
  const timer = setTimeout(() => {
    pendingWrites.delete(id);
    void persistMemory(prisma, key);
  }, PERSIST_DEBOUNCE_MS);
  // The write must never be the reason a test run or a shutdown hangs.
  timer.unref?.();
  pendingWrites.set(id, timer);
}

async function persistMemory(prisma: PrismaClient, key: MemoryKey): Promise<void> {
  const id = cacheKey(key);
  const timer = pendingWrites.get(id);
  if (timer) {
    clearTimeout(timer);
    pendingWrites.delete(id);
  }
  const grid = grids.get(id);
  if (!grid) return;
  const mask = toExplorationMask(grid);
  const row = { cell: mask.cell, cols: mask.cols, rows: mask.rows, data: mask.runs.join(',') };
  if (key.userId === null) {
    await prisma.sceneExploration.upsert({
      where: { sceneId: key.sceneId },
      create: { sceneId: key.sceneId, ...row },
      update: row,
    });
  } else {
    const ids = { sceneId: key.sceneId, userId: key.userId };
    await prisma.playerExploration.upsert({
      where: { sceneId_userId: ids },
      create: { ...ids, ...row },
      update: row,
    });
  }
}

/** Klucze pamięci graczy tej sceny, które siedzą w pamięci procesu. */
function playerKeysOf(sceneId: string): MemoryKey[] {
  const prefix = `${sceneId}:`;
  const keys: MemoryKey[] = [];
  for (const id of grids.keys()) {
    if (id.startsWith(prefix)) keys.push({ sceneId, userId: id.slice(prefix.length) });
  }
  return keys;
}

/** Writes one scene's memories (the party's and every player's) now. */
export async function persistExploration(prisma: PrismaClient, sceneId: string): Promise<void> {
  await persistMemory(prisma, { sceneId, userId: null });
  for (const key of playerKeysOf(sceneId)) await persistMemory(prisma, key);
}

/**
 * Folds one viewer's current sight into the party's memory and their own.
 *
 * Returns true when that added something to the memory this viewer's screen
 * draws, which is the caller's cue to tell them. On a group standing still in
 * a room they know, it returns false for every push — the common case, and the
 * reason nothing here is throttled beyond the write.
 */
export async function recordSight(
  prisma: PrismaClient,
  scene: Scene,
  viewer: MemoryViewer,
  sight: { polygons: readonly (readonly ScenePoint[])[]; mask?: LightMask | null },
): Promise<boolean> {
  if (!usesExploration(scene)) return false;
  const shown = memoryKeyFor(scene, viewer);
  const keys: MemoryKey[] = [{ sceneId: scene.id, userId: null }];
  if (viewer.role !== ROLE_GM) keys.push({ sceneId: scene.id, userId: viewer.id });
  let grew = false;
  for (const key of keys) {
    const grid = await loadMemory(prisma, scene, key);
    if (mergeExploration(grid, sight) === 0) continue;
    schedulePersist(prisma, key);
    if (key.userId === shown.userId) grew = true;
  }
  return grew;
}

/**
 * Sends the memory to everyone looking at the scene.
 *
 * Scena dzieląca widok: jedna rozgłoska dla wszystkich, MG też — jego klient
 * nie rysuje zasłony, więc ją pomija. Scena bez dzielenia (30.10): każdy gracz
 * dostaje własną pamięć, a `onlyUserIds` zawęża to do tych, którym urosła.
 */
export async function emitExploration(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  options?: { onlyUserIds?: ReadonlySet<string> },
): Promise<void> {
  const room = scene.active ? campaignRoom(campaignId) : sceneRoom(scene.id);
  if (scene.partySight || !usesExploration(scene)) {
    const mask = await explorationMaskFor(deps.ctx.prisma, scene);
    const broadcast: ExplorationSyncBroadcast = { sceneId: scene.id, mask };
    deps.io.to(room).emit('explore:sync', broadcast);
    return;
  }
  const sockets = await deps.io.in(room).fetchSockets();
  for (const member of sockets) {
    const user = (member.data as { user: SessionUser }).user;
    if (options?.onlyUserIds && !options.onlyUserIds.has(user.id)) continue;
    const mask = await explorationMaskFor(deps.ctx.prisma, scene, user);
    member.emit('explore:sync', { sceneId: scene.id, mask } satisfies ExplorationSyncBroadcast);
  }
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
  // Pamięci graczy idą razem z nią — inaczej odczyt odtworzyłby każdemu jego
  // własny plan, a „Zapomnij” ma czyścić mapę wszystkim.
  dropPlayerMemories(scene.id);
  await deps.ctx.prisma.playerExploration.deleteMany({ where: { sceneId: scene.id } });
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

/**
 * Drops one scene's memory from the cache **without writing it** — the
 * campaign rollback (stage 57b) has just put the copy's row back, and a queued
 * write of the old memory would overwrite it a second later.
 */
export function dropExplorationCache(sceneId: string): void {
  dropCached(sceneId);
  dropPlayerMemories(sceneId);
}

function dropCached(id: string): void {
  const timer = pendingWrites.get(id);
  if (timer) clearTimeout(timer);
  pendingWrites.delete(id);
  grids.delete(id);
}

/** Zapomina z pamięci procesu (bez zapisu) pamięci graczy jednej sceny. */
function dropPlayerMemories(sceneId: string): void {
  for (const key of playerKeysOf(sceneId)) dropCached(cacheKey(key));
}

/** Test hook: drops the in-memory copy so a fresh server reads the rows again. */
export function resetExplorationCache(): void {
  for (const timer of pendingWrites.values()) clearTimeout(timer);
  pendingWrites.clear();
  grids.clear();
}
