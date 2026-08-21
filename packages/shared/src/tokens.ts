import type { TokenCondition } from './figures.js';
import { sanitizeFacing } from './figures.js';
import { sanitizeTokenLight, type TokenLight } from './lights.js';
// Type-only, like `measure.ts` imports `TokenView` back — erased at runtime,
// so the two modules describing the same map never form a real cycle.
import type { ScenePoint } from './measure.js';
import type { GridMode } from './scenes.js';
import { normalizeGridOffset } from './scenes.js';
import { VISION_RANGE_MAX_METRES } from './vision.js';

export const TOKEN_NAME_MAX_LENGTH = 64;
export const TOKEN_SIZE_MIN = 1;
export const TOKEN_SIZE_MAX = 4;
export const TOKEN_HP_LIMIT = 999;
export const TOKEN_MAX_STATUSES = 16;
/** Max intermediate `token:move` updates per second sent while dragging. */
export const TOKEN_MOVE_RATE_HZ = 20;

export interface TokenHp {
  current: number;
  max: number;
}

/**
 * A token as seen by one viewer. `hp` and `characterId` are present only when
 * the viewer is allowed to see them (the token's owner, the linked
 * character's owner or the GM) — for everyone else the fields are absent and
 * never cross the wire. Players never receive views with `hidden: true` at all.
 */
export interface TokenView {
  id: string;
  sceneId: string;
  name: string;
  /** `/uploads/...` image; null renders as a colored placeholder disc. */
  imageUrl: string | null;
  /** Top-left corner in scene (world) pixels. */
  x: number;
  y: number;
  /** Edge length in grid squares (1×1 … 4×4). */
  size: number;
  /** Owning player's user id; null = GM-controlled (NPC). */
  ownerId: string | null;
  hidden: boolean;
  /** Status ids — definitions (PL name, icon) live in data, not code. */
  statuses: string[];
  /**
   * Which way the figure is turned, in degrees clockwise from up (stage 27j);
   * null = never turned, draw it facing nowhere.
   *
   * Public, unlike the HP: a sentry looking the other way is exactly the thing
   * a player is supposed to be able to see and use. CP RED has no facing rules,
   * so nothing in the engine reads this — it is legibility, not mechanics.
   */
  facing?: number | null;
  /**
   * HP shown on the token's bar. For a token linked to a character this
   * mirrors the sheet (the sheet is the single source of truth); standalone
   * tokens keep their own pair.
   */
  hp?: TokenHp | null;
  /** Linked character id; null = standalone token. */
  characterId?: string | null;
  /**
   * How far this token sees in metres, on a scene with dynamic visibility
   * (stage 18a); null = as far as the walls allow. Private like the HP: the
   * server sends the finished vision polygon anyway, so nobody else needs it.
   */
  visionRange?: number | null;
  /**
   * Light this token carries (stage 18b); null = none. Private like the HP: the
   * people who need it are the GM (who sets it up) and whoever controls the
   * token (who switches it on and off). Everybody else sees the *effect* — a
   * glow and a lit corridor — through their own `vision:sync`.
   */
  light?: TokenLight | null;
  /**
   * Fighting numbers of a token with no character sheet (stage 16b); null or
   * absent for the tokens nobody has statted, which is most of them.
   *
   * Deliberately **opaque here**. The core VTT must not know what a weapon or a
   * Stopping Power is (`systems/cpred` is a different world), so the map layer
   * carries the blob and the system layer reads it — the same bargain
   * `Combatant.turnState` struck in stage 14b.
   *
   * Private like the HP: it names the NPC's gun and how much armour it wears,
   * and a player learns those by being shot at.
   */
  combatProfile?: TokenCombatProfile | null;
}

/**
 * A game system's fighting numbers for one token, as they travel. The core
 * declares the slot; only the system knows the shape (CP RED:
 * `CpredCombatProfile`).
 */
export type TokenCombatProfile = Record<string, unknown>;

/** One entry of the status registry (`data/public/cpred/statuses.json`). */
export interface StatusDefinition {
  id: string;
  name: string;
  icon: string;
  /**
   * What wearing this sticker does to the figure on the map (stage 27j).
   *
   * Data rather than code, so the core VTT can draw „he is down" without
   * knowing that Cyberpunk RED calls it Nieprzytomny. Absent for the seventeen
   * statuses that change nothing about how the figure stands.
   */
  condition?: TokenCondition;
}

/** Ack data of the token image upload (`POST /api/uploads/tokens`). */
export interface TokenAssetView {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
}

/** Client → server payload of `token:create` (GM only). */
export interface TokenCreatePayload {
  sceneId: string;
  name: string;
  imageUrl?: string | null;
  x: number;
  y: number;
  size?: number;
  ownerId?: string | null;
  hidden?: boolean;
  hp?: TokenHp | null;
  /** Link to a character sheet; its HP then drives the token's bar. */
  characterId?: string | null;
}

/** Mutable token fields; a patch carries any subset. */
export interface TokenPatch {
  name?: string;
  imageUrl?: string | null;
  size?: number;
  ownerId?: string | null;
  hidden?: boolean;
  /** For a linked token the server writes this through to the sheet. */
  hp?: TokenHp | null;
  statuses?: string[];
  characterId?: string | null;
  /** Sight limit in metres; null puts it back to „as far as the walls allow". */
  visionRange?: number | null;
  /** Carried light; null takes the lamp away entirely (stage 18b). */
  light?: TokenLight | null;
  /** Statist's fighting numbers; null takes the profile away (stage 16b). */
  combatProfile?: TokenCombatProfile | null;
  /** Which way the figure looks; null puts it back to „turned nowhere". */
  facing?: number | null;
}

/** Client → server payload of `token:update` (GM only). */
export interface TokenUpdatePayload {
  tokenId: string;
  patch: TokenPatch;
}

/** Client → server payload of `token:delete` (GM only). */
export interface TokenIdPayload {
  tokenId: string;
}

/**
 * Client → server payload of `token:move` (owner or GM). Intermediate drag
 * positions have `final: false` and are not persisted; the drop sends
 * `final: true`, which the server snaps and writes to the DB.
 */
export interface TokenMovePayload {
  tokenId: string;
  x: number;
  y: number;
  final: boolean;
  /**
   * The route the token actually took, in scene pixels (stage 14c). Sent with
   * the drop so the server can charge movement by path length rather than by
   * the straight line to the landing square. Only the *shape* is the client's
   * to report: the server measures it, and anchors both ends itself.
   */
  path?: ScenePoint[];
}

/** Waypoints one drag may report — a guard against runaway payloads. */
export const TOKEN_PATH_MAX_POINTS = 64;

/**
 * Validates a drag path off the wire: at most `TOKEN_PATH_MAX_POINTS` finite
 * points, rounded to whole pixels. An unusable path is not an error — the
 * server falls back to the straight line, which is the shortest route anyone
 * could have taken and therefore the cheapest.
 */
export function sanitizeTokenPath(raw: unknown): ScenePoint[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > TOKEN_PATH_MAX_POINTS) return null;
  const points: ScenePoint[] = [];
  for (const value of raw) {
    if (typeof value !== 'object' || value === null) return null;
    const point = value as Record<string, unknown>;
    if (typeof point.x !== 'number' || !Number.isFinite(point.x)) return null;
    if (typeof point.y !== 'number' || !Number.isFinite(point.y)) return null;
    points.push({ x: Math.round(point.x), y: Math.round(point.y) });
  }
  return points;
}

/**
 * Server → client `token:upsert`: full view of a created/updated token.
 * Sequenced when broadcast campaign-wide (active scene, visible token);
 * targeted variants (GM room, owner's HP view, non-active scenes) carry no seq.
 */
export interface TokenUpsertBroadcast {
  seq?: number;
  token: TokenView;
}

/** Server → client `token:delete` — also emitted to players when a token is hidden. */
export interface TokenDeleteBroadcast {
  seq?: number;
  sceneId: string;
  tokenId: string;
}

/**
 * Server → client `token:sync` — the complete token list of a scene as this
 * one socket may see it, replacing whatever it held. Sent when a change can
 * add *and* remove tokens for the same viewer at once, which is exactly what
 * repainting the fog of war does (stage 17). Targeted, therefore no seq.
 */
export interface TokenSyncBroadcast {
  sceneId: string;
  tokens: TokenView[];
}

/** Server → client `token:move`. `byUserId` lets the dragging client skip its own echo. */
export interface TokenMoveBroadcast {
  seq?: number;
  sceneId: string;
  tokenId: string;
  x: number;
  y: number;
  final: boolean;
  byUserId: string;
  /**
   * Where the figure ended up looking (stage 27j) — sent only on the drop, and
   * only when walking actually turned it. Rides the move rather than a second
   * broadcast because it *is* part of the move: a figure that arrives and then
   * pivots a frame later reads as two events at the table.
   */
  facing?: number | null;
}

/** Client → server `token:facing`: turn a figure by hand (stage 27j). */
export interface TokenFacingPayload {
  tokenId: string;
  /** Degrees clockwise from up; null forgets the manual turn. */
  facing: number | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Trims and validates a token name; returns null when invalid. */
export function sanitizeTokenName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > TOKEN_NAME_MAX_LENGTH) return null;
  return trimmed;
}

// Only same-origin asset paths — no external URLs, no path traversal.
const TOKEN_IMAGE_URL_RE = /^\/(uploads|public)\/[A-Za-z0-9_\-./]+$/;

/** Validates a token image URL: a safe local path, null (no image) or undefined (invalid). */
export function sanitizeTokenImageUrl(url: unknown): string | null | undefined {
  if (url === null) return null;
  if (typeof url !== 'string' || url.includes('..') || !TOKEN_IMAGE_URL_RE.test(url)) {
    return undefined;
  }
  return url;
}

/** Clamps token size to whole squares within [1, 4]; null when invalid. */
export function sanitizeTokenSize(size: unknown): number | null {
  if (!isFiniteNumber(size)) return null;
  return Math.round(clamp(size, TOKEN_SIZE_MIN, TOKEN_SIZE_MAX));
}

/**
 * Validates an HP pair: max ≥ 1, current clamped to [0, max]. Returns the
 * normalized pair, null (explicitly no HP) or undefined (invalid input).
 */
export function sanitizeTokenHp(raw: unknown): TokenHp | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'object') return undefined;
  const { current, max } = raw as TokenHp;
  if (!isFiniteNumber(current) || !isFiniteNumber(max)) return undefined;
  const safeMax = Math.round(clamp(max, 1, TOKEN_HP_LIMIT));
  return { current: Math.round(clamp(current, 0, safeMax)), max: safeMax };
}

/**
 * Sight limit in metres (stage 18a). Null is a real value — „as far as the
 * walls allow" — so, like the HP pair, `undefined` is what signals a rejection
 * and zero is folded into null rather than making a token blind by typo.
 */
export function sanitizeVisionRange(raw: unknown): number | null | undefined {
  if (raw === null) return null;
  if (!isFiniteNumber(raw)) return undefined;
  if (raw <= 0) return null;
  return Math.round(clamp(raw, 1, VISION_RANGE_MAX_METRES) * 10) / 10;
}

/**
 * Normalizes a raw (untrusted) token patch: validates each provided field and
 * drops unknown ones. `validStatusIds` filters the status list against the
 * data-driven registry. Returns null when the patch as a whole is invalid.
 */
export function sanitizeTokenPatch(
  raw: unknown,
  validStatusIds?: ReadonlySet<string>,
): TokenPatch | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const patch: TokenPatch = {};

  if ('name' in input) {
    const name = sanitizeTokenName(input.name);
    if (name === null) return null;
    patch.name = name;
  }
  if ('imageUrl' in input) {
    const imageUrl = sanitizeTokenImageUrl(input.imageUrl);
    if (imageUrl === undefined) return null;
    patch.imageUrl = imageUrl;
  }
  if ('size' in input) {
    const size = sanitizeTokenSize(input.size);
    if (size === null) return null;
    patch.size = size;
  }
  if ('ownerId' in input) {
    if (input.ownerId !== null && typeof input.ownerId !== 'string') return null;
    patch.ownerId = input.ownerId;
  }
  if ('hidden' in input) {
    if (typeof input.hidden !== 'boolean') return null;
    patch.hidden = input.hidden;
  }
  if ('hp' in input) {
    const hp = sanitizeTokenHp(input.hp);
    if (hp === undefined) return null;
    patch.hp = hp;
  }
  if ('facing' in input) {
    const facing = sanitizeFacing(input.facing);
    if (facing === undefined) return null;
    patch.facing = facing;
  }
  if ('characterId' in input) {
    if (input.characterId !== null && typeof input.characterId !== 'string') return null;
    patch.characterId = input.characterId;
  }
  if ('visionRange' in input) {
    const range = sanitizeVisionRange(input.visionRange);
    if (range === undefined) return null;
    patch.visionRange = range;
  }
  if ('light' in input) {
    const light = sanitizeTokenLight(input.light);
    if (light === undefined) return null;
    patch.light = light;
  }
  if ('combatProfile' in input) {
    // Shape only. What the fields mean, and which values are legal, is the game
    // system's to decide — the core would have to know what a Stopping Power is
    // to say more, and that is exactly the knowledge this layer must not have.
    if (input.combatProfile === null) patch.combatProfile = null;
    else if (typeof input.combatProfile === 'object' && !Array.isArray(input.combatProfile)) {
      patch.combatProfile = input.combatProfile as TokenCombatProfile;
    } else return null;
  }
  if ('statuses' in input) {
    if (!Array.isArray(input.statuses)) return null;
    const seen = new Set<string>();
    for (const status of input.statuses) {
      if (typeof status !== 'string') return null;
      if (validStatusIds && !validStatusIds.has(status)) continue;
      seen.add(status);
    }
    patch.statuses = [...seen].slice(0, TOKEN_MAX_STATUSES);
  }

  return patch;
}

/** Scene fields needed to snap/clamp a token position. */
export interface TokenSnapScene {
  width: number;
  height: number;
  gridMode: GridMode;
  grid: { sizePx: number; offsetX: number; offsetY: number };
}

function snapAxis(
  value: number,
  offset: number,
  cell: number,
  limit: number,
  extent: number,
): number {
  const origin = normalizeGridOffset(offset, cell);
  const col = Math.round((value - origin) / cell);
  const maxCol = Math.floor((limit - extent - origin) / cell);
  if (maxCol < 0) return clamp(value, 0, Math.max(0, limit - extent));
  return origin + clamp(col, 0, maxCol) * cell;
}

/**
 * Authoritative snap: aligns a token's top-left corner to the grid (grid mode)
 * or just clamps it into the scene (gridless). Pure — used by the client for
 * the drag ghost and by the server for the final position.
 */
export function snapTokenPosition(
  x: number,
  y: number,
  size: number,
  scene: TokenSnapScene,
): { x: number; y: number } {
  const cell = scene.grid.sizePx;
  const extent = size * cell;
  if (scene.gridMode !== 'grid' || cell <= 0) {
    return {
      x: clamp(x, 0, Math.max(0, scene.width - extent)),
      y: clamp(y, 0, Math.max(0, scene.height - extent)),
    };
  }
  return {
    x: snapAxis(x, scene.grid.offsetX, cell, scene.width, extent),
    y: snapAxis(y, scene.grid.offsetY, cell, scene.height, extent),
  };
}

/** Clamps a free (intermediate) position into the scene without snapping. */
export function clampTokenPosition(
  x: number,
  y: number,
  size: number,
  scene: TokenSnapScene,
): { x: number; y: number } {
  const extent = size * scene.grid.sizePx;
  return {
    x: clamp(x, 0, Math.max(0, scene.width - extent)),
    y: clamp(y, 0, Math.max(0, scene.height - extent)),
  };
}
