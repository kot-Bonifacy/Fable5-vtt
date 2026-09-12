import type { ScenePoint } from './measure.js';

export const GRID_MODES = ['grid', 'gridless'] as const;
export type GridMode = (typeof GRID_MODES)[number];

export const SCENE_VISIBILITIES = ['open', 'fog', 'dynamic'] as const;
/**
 * How a scene decides what a player may see (stages 17a, 18a):
 *  - `open` — everything; a city map, a handout, a scene already explored;
 *  - `fog` — the hand-painted fog of war: the GM uncovers with a brush;
 *  - `dynamic` — the field of view of the player's own tokens, blocked by walls.
 *
 * One setting rather than two switches. „Hand fog *and* dynamic vision" would
 * give the GM two independent sources of black and no way to tell which one is
 * hiding the corridor; overlaying them deliberately waits for stage 18b, where
 * manual fog becomes an explicit override on top of exploration.
 */
export type SceneVisibility = (typeof SCENE_VISIBILITIES)[number];

export function isSceneVisibility(value: unknown): value is SceneVisibility {
  return value === 'open' || value === 'fog' || value === 'dynamic';
}

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
  /** What limits a player's view here: nothing, hand-painted fog, or walls. */
  visibility: SceneVisibility;
  /**
   * Is it dark in here (stage 18b)? Only meaningful in `dynamic` visibility —
   * darkness limits what a *token* sees, and the other two modes do not ask
   * tokens anything. Off means the scene is lit end to end, which is the right
   * default for a street, a bar or a daylight map.
   */
  dark: boolean;
  /**
   * How far a token sees in the dark with no light, in metres (stage 18b).
   * Zero is „nothing at all"; the default of one grid square exists so a player
   * without a torch reads their screen as darkness rather than as a crash.
   */
  darkSightM: number;
  /**
   * Does this scene stay on the plan once the party has walked it (stage 18c)?
   * Only meaningful in `dynamic` visibility. On means an area already seen
   * remains drawn — the map, never the tokens — dimmed behind the current field
   * of view.
   */
  explore: boolean;
  /**
   * Czy gracze mają na tej mapie związane ręce (zlecenie MG, 12.09.2026)?
   *
   * `true` znaczy „figurą tu nie ruszasz", i dotyczy **wyłącznie graczy** — MG
   * nie jest tym związany nigdy, tak samo jak nie jest związany budżetem Tury.
   * Powód jest z sesji: drużyna, która dostanie mapę przed rozpoczęciem gry,
   * obejdzie ją własną figurą i pozna zanim MG cokolwiek powie.
   *
   * Pole jedzie **do graczy**, bo to ich klient ma nie podnosić figury i ma
   * umieć powiedzieć, dlaczego. Tajemnicy w nim nie ma: prawdę i tak rozstrzyga
   * serwer przy `token:move`, a wiedza „MG jeszcze nie otworzył mapy" nie jest
   * niczym, czego gracz nie zobaczyłby przy pierwszej próbie.
   */
  playerMoveLocked: boolean;
  /**
   * Gdzie na tej mapie zaczyna patrzeć gracz, który nie ma tu jeszcze figury
   * (11.09.2026) — „miejsce startu drużyny", stawiane przez MG narzędziem mapy.
   *
   * `null` znaczy „MG nie wyznaczył", a nie „brak": kamera bierze wtedy środek
   * dolnej krawędzi mapy, bo drużyna zwykle wchodzi z dołu kadru. Pole jedzie
   * do graczy, bo to **ich** kamera je czyta — nie jest niczym tajnym, a
   * znacznik na mapie widzi i tak wyłącznie MG.
   */
  spawn: ScenePoint | null;
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
  /** Miejsce startu drużyny; `null` kasuje wyznaczony punkt (11.09.2026). */
  spawn?: ScenePoint | null;
  /**
   * Blokada ruchu graczy po tej mapie (12.09.2026).
   *
   * Zwykłe pole łaty, a nie własne zdarzenie jak `visibility`, `dark` czy
   * `explore` — i to jest cała różnica między nimi: tamte trzy **odbierają
   * graczom figury** w chwili przełączenia, więc muszą przefiltrować listy
   * tokenów. Ta niczego nie zabiera i nie pokazuje; zmienia tylko odpowiedź na
   * pytanie „wolno mi tę figurę podnieść".
   */
  playerMoveLocked?: boolean;
  // `visibility` is deliberately NOT patchable here: changing it has to
  // re-filter every player's token list in the same breath, so it goes through
  // `scene:visibility` (stages 17a, 18a) rather than the generic scene patch.
  //
  // `dark` and `darkSightM` are out for the same reason and travel on
  // `scene:lighting` (stage 18b): turning the lights out takes every token in
  // an unlit spot away from the players who could see it a moment ago.
}

/**
 * Client → server payload of `scene:lighting` (stage 18b). Either field may be
 * omitted; sending neither is a no-op rather than an error.
 */
export interface SceneLightingPayload {
  sceneId: string;
  dark?: boolean;
  darkSightM?: number;
}

/**
 * Client → server payload of `scene:explore` (stage 18c) — the switch on the
 * party's memory of this map.
 *
 * Its own event rather than a scene patch field for the reason the other two
 * have one: it changes what every player's screen shows the moment it flips.
 * Unlike them it takes no token away, because a remembered room never showed
 * anybody who was standing in it.
 */
export interface SceneExplorePayload {
  sceneId: string;
  explore: boolean;
}

/**
 * Client → server payload of `scene:visibility`.
 *
 * Its own event rather than a field of `ScenePatch`, for the reason fog had one
 * in 17a: switching a scene to `fog` or `dynamic` must take tokens away from
 * players in the same operation, so it needs a handler that re-filters their
 * lists — not a field somebody flips in passing while renaming the scene.
 */
export interface SceneVisibilityPayload {
  sceneId: string;
  visibility: SceneVisibility;
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

  if (typeof input.playerMoveLocked === 'boolean') {
    patch.playerMoveLocked = input.playerMoveLocked;
  }

  if ('spawn' in input) {
    const spawn = input.spawn;
    if (spawn === null) {
      patch.spawn = null;
    } else if (
      typeof spawn === 'object' &&
      spawn !== null &&
      isFiniteNumber((spawn as ScenePoint).x) &&
      isFiniteNumber((spawn as ScenePoint).y)
    ) {
      // Punkt spoza mapy byłby kamerą wycelowaną w czerń, a rozmiar sceny
      // klient i tak zna — ale przycina go serwer, bo klient może kłamać.
      const { x, y } = spawn as ScenePoint;
      patch.spawn = {
        x: Math.round(clamp(x, 0, SCENE_DIMENSION_MAX)),
        y: Math.round(clamp(y, 0, SCENE_DIMENSION_MAX)),
      };
    }
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
