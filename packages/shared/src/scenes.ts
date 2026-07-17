export const GRID_MODES = ['grid', 'gridless'] as const;
export type GridMode = (typeof GRID_MODES)[number];

/** Grid overlay configuration; all pixel values are in scene (world) space. */
export interface GridConfig {
  /** Square size in px; CP RED maps usually pair this with 2 m per square. */
  sizePx: number;
  offsetX: number;
  offsetY: number;
  /** Line color as #rrggbb. */
  color: string;
  /** Line opacity 0..1. */
  alpha: number;
  visible: boolean;
}

export interface SceneBackground {
  url: string;
  width: number;
  height: number;
}

/** Full scene state, as rendered by viewers of that scene. */
export interface SceneView {
  id: string;
  name: string;
  active: boolean;
  background: SceneBackground | null;
  width: number;
  height: number;
  gridMode: GridMode;
  grid: GridConfig;
  metersPerSquare: number;
}

/** List entry for the GM scene manager — never sent to players. */
export interface SceneSummary {
  id: string;
  name: string;
  active: boolean;
  hasBackground: boolean;
}

/** Ack data of the map upload endpoint (`POST /api/uploads/maps`). */
export interface MapUploadResult {
  url: string;
  width: number;
  height: number;
}

/** Client → server payload of `scene:create`. */
export interface SceneCreatePayload {
  name: string;
}

/** Mutable scene fields; a patch carries any subset. */
export interface ScenePatch {
  name?: string;
  background?: SceneBackground | null;
  width?: number;
  height?: number;
  gridMode?: GridMode;
  grid?: Partial<GridConfig>;
  metersPerSquare?: number;
}

/** Client → server payload of `scene:update`. */
export interface SceneUpdatePayload {
  sceneId: string;
  patch: ScenePatch;
}

/** Client → server payload of `scene:delete` / `scene:activate` / `scene:view`. */
export interface SceneIdPayload {
  sceneId: string;
}

/** Payload of the `scene:activate` broadcast (campaign room, sequenced). */
export interface SceneActivateBroadcast {
  seq: number;
  scene: SceneView;
}

/**
 * Payload of the `scene:update` broadcast. Sequenced when the update concerns
 * the active scene (campaign room); targeted (no seq) for GM-only previews.
 */
export interface SceneUpdateBroadcast {
  seq?: number;
  scene: SceneView;
}

/** Payload of `scene:list` — targeted at GM sockets only, no seq. */
export interface SceneListBroadcast {
  scenes: SceneSummary[];
}

/**
 * Server → client `scene:view`: forces this socket's viewed scene (e.g. the
 * scene it was previewing got deleted). Targeted, no seq.
 */
export interface SceneViewBroadcast {
  scene: SceneView | null;
}

export const SCENE_NAME_MAX_LENGTH = 64;
export const SCENE_DIMENSION_MIN = 256;
export const SCENE_DIMENSION_MAX = 16384;
export const GRID_SIZE_MIN = 16;
export const GRID_SIZE_MAX = 1024;
export const METERS_PER_SQUARE_MIN = 0.1;
export const METERS_PER_SQUARE_MAX = 100;

export const DEFAULT_GRID: GridConfig = {
  sizePx: 100,
  offsetX: 0,
  offsetY: 0,
  color: '#000000',
  alpha: 0.35,
  visible: true,
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Trims and validates a scene name; returns null when invalid. */
export function sanitizeSceneName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > SCENE_NAME_MAX_LENGTH) return null;
  return trimmed;
}

/**
 * Normalizes a raw (untrusted) scene patch: clamps numbers, validates the
 * color and grid mode, drops unknown/invalid fields. Returns null when the
 * patch is not an object or a provided name is invalid — otherwise a safe
 * patch containing only the accepted fields.
 */
export function sanitizeScenePatch(raw: unknown): ScenePatch | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const patch: ScenePatch = {};

  if ('name' in input) {
    const name = sanitizeSceneName(input.name);
    if (name === null) return null;
    patch.name = name;
  }

  if ('background' in input) {
    const bg = input.background;
    if (bg === null) {
      patch.background = null;
    } else if (
      typeof bg === 'object' &&
      bg !== null &&
      typeof (bg as SceneBackground).url === 'string' &&
      isFiniteNumber((bg as SceneBackground).width) &&
      isFiniteNumber((bg as SceneBackground).height)
    ) {
      const { url, width, height } = bg as SceneBackground;
      patch.background = {
        url,
        width: Math.round(clamp(width, 1, SCENE_DIMENSION_MAX)),
        height: Math.round(clamp(height, 1, SCENE_DIMENSION_MAX)),
      };
    }
  }

  if (isFiniteNumber(input.width)) {
    patch.width = Math.round(clamp(input.width, SCENE_DIMENSION_MIN, SCENE_DIMENSION_MAX));
  }
  if (isFiniteNumber(input.height)) {
    patch.height = Math.round(clamp(input.height, SCENE_DIMENSION_MIN, SCENE_DIMENSION_MAX));
  }
  if (input.gridMode === 'grid' || input.gridMode === 'gridless') {
    patch.gridMode = input.gridMode;
  }
  if (isFiniteNumber(input.metersPerSquare)) {
    patch.metersPerSquare = clamp(
      input.metersPerSquare,
      METERS_PER_SQUARE_MIN,
      METERS_PER_SQUARE_MAX,
    );
  }

  if (typeof input.grid === 'object' && input.grid !== null) {
    const grid = input.grid as Record<string, unknown>;
    const gridPatch: Partial<GridConfig> = {};
    if (isFiniteNumber(grid.sizePx)) {
      gridPatch.sizePx = clamp(grid.sizePx, GRID_SIZE_MIN, GRID_SIZE_MAX);
    }
    if (isFiniteNumber(grid.offsetX)) gridPatch.offsetX = grid.offsetX;
    if (isFiniteNumber(grid.offsetY)) gridPatch.offsetY = grid.offsetY;
    if (typeof grid.color === 'string' && HEX_COLOR_RE.test(grid.color)) {
      gridPatch.color = grid.color.toLowerCase();
    }
    if (isFiniteNumber(grid.alpha)) gridPatch.alpha = clamp(grid.alpha, 0, 1);
    if (typeof grid.visible === 'boolean') gridPatch.visible = grid.visible;
    if (Object.keys(gridPatch).length > 0) patch.grid = gridPatch;
  }

  return patch;
}

/**
 * Wraps a grid offset into [0, sizePx) — offsets are periodic, so the stored
 * value stays canonical no matter how far a slider was dragged.
 */
export function normalizeGridOffset(offset: number, sizePx: number): number {
  if (sizePx <= 0) return 0;
  const wrapped = offset % sizePx;
  return wrapped < 0 ? wrapped + sizePx : wrapped;
}
