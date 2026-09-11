import {
  Application,
  Assets,
  Circle,
  Container,
  Graphics,
  RenderTexture,
  Sprite,
  Text,
  Texture,
  type FederatedPointerEvent,
} from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { MapFxLayer } from './MapFxLayer.js';
import {
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  PLAYER_VIEW_SQUARES_AROUND,
  coverZoom,
  startCamera,
} from './camera.js';
import type {
  CoverView,
  SmokeView,
  DefenseZoneView,
  DrawingShape,
  DrawingStyle,
  DrawingView,
  ExplorationMask,
  FogShape,
  FogShapeView,
  FogState,
  LightGlow,
  LightMask,
  MapFxEffect,
  MapNoteView,
  SceneHandleId,
  SceneObjectKind,
  SceneObjectRef,
  SceneObjectShape,
  ScenePoint,
  SceneView,
  TokenSnapScene,
  TokenView,
  WalkPassable,
  WalkStep,
  WallKind,
  WallView,
} from '@vtt/shared';
import {
  COVER_MIN_SIZE_PX,
  ZONE_MIN_SIZE_PX,
  CPRED_CONE_HALF_ANGLE_DEG,
  DRAWING_FILL_ALPHA,
  DRAWING_PATH_MAX_POINTS,
  FOG_STROKE_MAX_POINTS,
  LIGHT_BRIGHT,
  LIGHT_DIM,
  MAP_PING_TTL_MS,
  WALK_RADIUS_CELLS,
  clampTokenPosition,
  coverStanding,
  zoneLabel,
  zoneStanding,
  drawingBounds,
  decodeFlagRuns,
  decodeLevelRuns,
  facingFromDelta,
  formatMetres,
  formatSquares,
  isOpening,
  metresPerPixel,
  NET_ACCESS_RANGE_M,
  pickSceneHandle,
  pickSceneObject,
  dragSceneShape,
  sceneHandleCursor,
  sceneHandlesOf,
  snapScenePoint,
  SCENE_HANDLE_SIZE_PX,
  smokeSidePx,
  normalizeGridOffset,
  planWalk,
  polylineMetres,
  reachableCells,
  simplifyPath,
  snapToSquareCentre,
  snapTokenPosition,
  snapWallPoint,
  squaresForDistance,
  thinWalk,
  walkGridForScene,
  wallEndpointNear,
  wallMidpoint,
  TOKEN_PATH_MAX_POINTS,
} from '@vtt/shared';
import { TokenNode, type TokenNodeCtx } from './TokenNode.js';
import { playStepSound } from '../sfx.js';
import { useSettingsStore } from '../stores/settingsStore.js';

/**
 * A template the pointer drags around (stages 16d, 16g): the square a charge
 * covers, or the wedge a shotgun sprays. Two shapes, one drawing layer — and
 * one flag telling the map whether the next click still belongs to a figure.
 */
export type AreaPreview = { kind: 'blast'; sideM: number } | { kind: 'cone'; rangeM: number };

/** Two previews are the same when their shape and their size are. */
function samePreview(a: AreaPreview | null, b: AreaPreview | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  return a.kind === 'blast' && b.kind === 'blast'
    ? a.sideM === b.sideM
    : (a as { rangeM: number }).rangeM === (b as { rangeM: number }).rangeM;
}

/** One measurement drawn on the map: the line plus who is holding it. */
export interface RulerLine {
  points: ScenePoint[];
  /** Label shown at the far end; the local line has none (it is the user's). */
  userName?: string;
  /** Line colour as 0xrrggbb. */
  color: number;
}

/**
 * Why the steered figure changed.
 *
 * The left rail keeps describing a figure after it stops being steered, so it
 * has to tell „the user said never mind" from „the map was swapped under it".
 * The renderer is the only thing that knows which of the four just happened.
 */
export type SelectionChange =
  /** A click on a figure, or `Tab`. */
  | 'pick'
  /** „Never mind" — right click on bare map, or the last rung of Escape. */
  | 'dismiss'
  /** The scene was swapped out. */
  | 'scene'
  /** The figure left the map (deleted, or moved out of sight). */
  | 'gone';

/** One range band drawn as a ring around a token (stage 16). */
export interface RangeRing {
  /** Radius in scene pixels. */
  radiusPx: number;
  /** „PT 15" — printed where the ring meets the horizontal axis. */
  label: string;
}

/** The fog tool's current setting, pushed in from the toolbar. */
export interface FogBrushSettings {
  /** Painting fog is off while this is null. */
  armed: boolean;
  mode: 'reveal' | 'hide';
  shape: 'brush' | 'rect';
  radius: number;
}

/** Which shape the drawing tool produces (stage 17b). */
export type DrawToolKind = 'pencil' | 'line' | 'rect' | 'ellipse' | 'text';

/** The drawing tool's current setting, pushed in from the toolbar. */
export interface DrawSettings {
  armed: boolean;
  tool: DrawToolKind;
  style: DrawingStyle;
  /** GM layer: the shape is sent with `gmOnly`, and previewed dashed. */
  gmOnly: boolean;
  /** Label height in scene pixels — a drawing's text belongs to the map. */
  fontSize: number;
}

/** The wall tool's current setting, pushed in from the toolbar (stages 18a, 18d). */
export interface WallSettings {
  armed: boolean;
  /** Od 27k bez `erase`: kasuje się zaznaczeniem i `Delete`, jak wszędzie. */
  kind: WallKind;
  snapGrid: boolean;
}

/**
 * The cover tool's current setting (stage 16c). Which preset a new rectangle
 * becomes is deliberately absent for the reason the lamp's parameters are: the
 * renderer reports the gesture, and the caller — which holds the toolbar — turns
 * it into an intent.
 */
export interface CoverSettings {
  armed: boolean;
}

/**
 * The defended-zone tool's current setting (stage 26f). The same two modes the
 * cover tool has, and for the same reason: a trapped floor is dragged out to the
 * size of the floor, and removing one has to be deliberate.
 */
export interface ZoneSettings {
  armed: boolean;
}

/**
 * The light tool's current setting (stage 18b). The lamp's own parameters are
 * deliberately absent: the renderer only reports *where* the click landed, and
 * the caller — which already holds the toolbar state — decides whether that
 * means „place a new lamp with these settings" or „retune the one under the
 * pointer".
 */
export interface LightSettings {
  armed: boolean;
}

/**
 * A glow as the renderer wants it: the wire shape plus, for the GM, the polygon
 * the walls let its light out into (stage 18c).
 *
 * Only the GM ever carries a clip. A player is handed no wall geometry, and for
 * them the darkness cover drawn above this layer already trims whatever a lamp
 * spills round a corner — which is why the leak was only ever visible on the
 * GM's own screen.
 */
export type RenderGlow = LightGlow & { clip?: ScenePoint[] };

/**
 * One lamp handle on the GM's layer (stage 18b). Already in scene pixels — the
 * renderer never sees metres, so the grid scale stays in one place.
 */
/**
 * Net access point on the map (stage 26b). Unlike a lamp, this one is drawn for
 * **everybody** — a player who has found the socket has to be able to walk up
 * to it. What is hidden never arrives: the server leaves it out of the payload.
 */
export interface AccessPointMarker {
  id: number;
  x: number;
  y: number;
  name: string;
  /** GM only: still hidden from the players, so it is drawn ghosted. */
  hidden: boolean;
  /** No architecture behind it yet — a dead socket the GM has not wired. */
  dead: boolean;
}

export interface AccessPointSettings {
  armed: boolean;
}

export interface LightMarker {
  id: number;
  x: number;
  y: number;
  /** Outer reach in scene pixels — drawn as a ring, because reach is a distance. */
  radiusPx: number;
  color: string;
  enabled: boolean;
}

/**
 * How each kind of wall is drawn on the GM's layer. Players never receive a
 * wall, so this palette is read by exactly one person at the table — it only
 * has to make „what blocks sight right now?" legible at a glance.
 */
const WALL_COLORS: Record<WallKind, number> = {
  wall: 0xf87171,
  door: 0xfbbf24,
  window: 0x38bdf8,
};

/**
 * Cover (stage 16c). Steel-grey rather than a colour of its own: a car is part
 * of the map, and the palette of this layer has to stay quieter than the tokens
 * standing on it. A wreck keeps the shape and loses the weight.
 */
const COVER_FILL_COLOR = 0x64748b;
const COVER_STROKE_COLOR = 0xcbd5e1;
/**
 * Smoke (stage 16h). Deliberately close to the cover grey and deliberately
 * softer: both are „the world got in the way", and the difference between them
 * is that one has an edge you can lean on and the other does not.
 */
const SMOKE_FILL_COLOR = 0x9aa3ad;
const SMOKE_STROKE_COLOR = 0xd7dce2;
const COVER_WRECK_COLOR = 0x94a3b8;
/**
 * Defended zones (stage 26f). Hazard amber, deliberately the only warm colour in
 * this half of the palette: a cover and a cloud are things the world put in your
 * way, and a trapped floor is a thing that will *do something to you*. A
 * disarmed one keeps the shape and loses the heat.
 */
const ZONE_FILL_COLOR = 0xd97706;
const ZONE_STROKE_COLOR = 0xfbbf24;
const ZONE_IDLE_COLOR = 0x9a8866;

/** Green while it will hold, amber while it might, red when it is nearly gone. */
function coverBarColor(ratio: number): number {
  if (ratio > 0.6) return 0x4ade80;
  if (ratio > 0.25) return 0xfbbf24;
  return 0xf87171;
}

/**
 * A bolted door (stage 18d). Violet rather than a shade of the door's amber: the
 * GM has to be able to count the locked doors on a floor plan at a glance, and a
 * brightness difference already means „open" on this layer.
 */
const WALL_LOCKED_COLOR = 0xc084fc;

/** Extra pannable margin around the scene, as a fraction of its size. */
const PAN_MARGIN = 0.5;
/**
 * How far a freehand stroke may stray from the simplified line, in scene
 * pixels. Three is under a tenth of a grid square: the eye cannot tell, and a
 * long stroke loses nine samples in ten (see `simplifyPath` in shared).
 */
const DRAW_SIMPLIFY_TOLERANCE = 3;
/** Minimum pointer travel between freehand samples, in scene pixels. */
const DRAW_SAMPLE_STEP = 4;
/** Fog opacity for the GM — dark enough to read as fog, light enough to plan through. */
const FOG_GM_ALPHA = 0.55;
/**
 * Longest edge of the fog render texture. A scene is capped to this, so a
 * 4096 px map composites into 2048 px (16 MB instead of 64 MB) and the fog
 * edge picks up a soft two-pixel feather, which looks better than a hard one.
 */
const FOG_TEXTURE_MAX_PX = 2048;
/**
 * How much cover a dimly lit patch keeps (stage 18b). Between „fully lit" (no
 * cover at all) and „dark" (opaque), and close enough to the fog's own 0.55 that
 * the three states read as one family of darkness.
 */
const DIM_COVER_ALPHA = 0.45;
/**
 * How much of the cover an explored cell lifts (stage 18c).
 *
 * Not a free number: erasing with alpha `a` multiplies what is underneath by
 * `1 - a`, so a fully covered cell has to land on `DIM_COVER_ALPHA` for the
 * memory of a room and a dimly lit room to read the same. Both mean „you know
 * the shape of this but are not looking at it".
 */
const EXPLORED_ERASE_ALPHA = 1 - DIM_COVER_ALPHA;
/**
 * What the GM's own overrides look like on the GM's screen (stage 18c). The GM
 * is never covered, so their brush has nothing to erase — it is drawn as a
 * tint instead, and only strongly enough to be unmistakable while planning.
 */
/**
 * Sylwetka gniazda Sieci na mapie (etapy 26b i 27e). Plik leży w `public/`
 * klienta, więc URL jest stały w dev i po zbudowaniu; barwi go `tint`, bo
 * game-icons rysuje białą sylwetkę. Atrybucja: `public/icons/ATTRIBUTION.md`.
 */
const NET_POINT_GLYPH_URL = '/icons/jack-plug.svg';
/** Bok ikony w pikselach sceny przy zoomie 1:1 — tyle, ile miało emoji. */
const NET_POINT_GLYPH_PX = 22;
const OVERRIDE_GM_HIDE_ALPHA = 0.5;
const OVERRIDE_GM_REVEAL_ALPHA = 0.22;
const OVERRIDE_GM_REVEAL_COLOR = 0x38bdf8;
/**
 * Concentric rings used to fake a light's falloff. Pixi v8 can do a radial
 * gradient fill, but rings drawn additively are a) predictable across drivers
 * and b) indistinguishable from a gradient at table zoom. Ten is where the
 * banding stops being visible on a wide neon tube.
 */
const GLOW_RING_COUNT = 28;
/**
 * How many pixels of the „unlit" canvas one mask cell becomes before it is
 * blurred (stage 18c).
 *
 * The mask carries three levels, so scaling it up on its own puts two visible
 * steps in every pool of light — read at the table as two concentric rings
 * rather than as a lamp. Supersampling first and blurring after turns those
 * steps into a ramp, and it costs nothing on the wire: a whole field of view is
 * a canvas of a few hundred pixels a side.
 */
const UNLIT_SUPERSAMPLE = 6;
/**
 * Blur radius on that canvas, in supersampled pixels — a little under one cell,
 * which spreads each step across roughly two metres of map. Wider than that and
 * a torch stops having an edge at all; narrower and the rings come back.
 */
const UNLIT_BLUR_PX = 4;
/**
 * Peak opacity of the coloured glow at a lamp's centre.
 *
 * Deliberately low. The glow is decoration — what decides visibility is the
 * mask under it — and because the layer blends additively, a lit street with ten
 * overlapping lamps stacks all of them. Measured on the test map: 0.4 washed the
 * whole quarter out, 0.28 keeps a single lamp's colour obvious while ten of them
 * still read as separate pools of light.
 */
const GLOW_ALPHA = 0.28;
/** How far a flickering lamp's glow dips, as a fraction of its own alpha. */
const FLICKER_DEPTH = 0.22;
/** Zbliżenia i kadr startowy mieszkają w `camera.ts` — tu tylko z nich korzystamy. */
const MIN_ZOOM = MAP_MIN_ZOOM;
const MAX_ZOOM = MAP_MAX_ZOOM;
/** Screen-pixel distance that turns a click into a drag. */
const DRAG_THRESHOLD_PX = 4;
/** Max gap between two clicks on a token to count as a double-click. */
const DOUBLE_CLICK_MS = 350;
/** Ile pikseli ekranu wolno drgnąć ręce, żeby gest liczył się jeszcze jako klik. */
const TAP_SLOP_PX = 6;

/**
 * Czy to ten sam obiekt scenerii (etap 27k). Porównanie po wartości, bo każdy
 * `pickSceneObject` oddaje świeżą parę `{ kind, id }` — porównanie referencji
 * nie zgodziłoby się nigdy, więc obrys przerysowywałby się na każdym ruchu myszy.
 */
function sameRef(a: SceneObjectRef | null, b: SceneObjectRef | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.id === b.id;
}
/** How long after a drop a map click is still the drop's own pointer release. */
const DRAG_CLICK_GRACE_MS = 250;
/**
 * Longest gap between two march frames that counts as real time, in ms. Beyond
 * it the renderer is assumed to have stalled and the march simply resumes.
 */
const MARCH_MAX_FRAME_MS = 100;
/** Dashes in the selection ring — coarse enough to read as dashed at table zoom. */
const SELECT_RING_DASHES = 12;
/**
 * Barwa zaznaczenia grupowego i ramki, którą się je bierze (etap 35).
 *
 * Niebieska, bo cztery kolory na figurze są już zajęte: biel to „prowadzę tę
 * figurę", bursztyn to tura i uchwyt, zieleń i czerwień to metry ruchu. Ta sama
 * barwa dla obwódki i dla ramki jest celowa — ramka mówi „to zaraz będzie
 * zaznaczone", więc mówi to kolorem zaznaczenia.
 */
const GROUP_RING_COLOR = 0x60a5fa;
/** Barwa pingu — cyjan, którego nie nosi na mapie nic innego. */
const PING_COLOR = 0x22d3ee;
/**
 * How fast a token walks a planned route, in metres of ground per second
 * (stage 16e, chosen by the GM). A full CP RED turn of a MOVE 6 character is
 * twelve metres, so a turn's worth of walking takes about four seconds: slow
 * enough that the table sees *which way* the figure went — which is often the
 * content of the scene — and slow enough to stop it by hand halfway.
 */
const WALK_SPEED_M_PER_S = 3;
/**
 * Longest route planned outside a fight, in metres. Inside one the turn budget
 * decides, and it is always smaller than this.
 */
const WALK_FREE_RANGE_M = 80;
/**
 * How long a walked route lingers behind the figure, in ms (stage 27j).
 *
 * The trail is not decoration: at a table two people ask „wait, which way did
 * he come in?" the moment a figure stops, and by then the line the march drew
 * has already been cleared. Long enough to answer that, short enough that a
 * fight does not end up drawn over with green string.
 */
const TRAIL_FADE_MS = 1600;

/**
 * Metres of ground between footsteps (stage 27j).
 *
 * A stride, near enough — the walk speed is 3 m/s, so this is a step about
 * every half second, which is the rate a person walking sounds like.
 */
const STEP_EVERY_M = 1.5;

/**
 * Shaded floor: the squares the turn can still pay for (stage 27j).
 *
 * Cool and faint on purpose. The route is the loud thing on this layer, and a
 * fill that competed with it would turn „where may I go" and „where am I
 * going" into one indistinguishable green.
 */
const REACH_FILL = 0x38bdf8;
const REACH_FILL_ALPHA = 0.1;
const REACH_EDGE_ALPHA = 0.45;

/** Route preview colours: what will be walked, and what will not. */
const WALK_COLOR = 0x4ade80;
const WALK_COLOR_BEYOND = 0x94a3b8;
/**
 * The second reach band: ground this turn still reaches, but only by taking the
 * trade the system offers („Bieg" — the Action spent on another Move Action).
 *
 * Amber because the two questions are „will I get there" and „what will it
 * cost me", and a second green would answer the first one twice. It is a
 * *line* colour: the one warm **fill** on the map is still the blast template
 * below, which nothing else may take.
 */
const WALK_COLOR_EXTRA = 0xfbbf24;
/** „Walk that way" — a route that ends at the edge of what is known. */
const WALK_COLOR_UNKNOWN = 0x38bdf8;
/**
 * A single **left** boot sole, pointing up the −Y axis (Lorc, CC BY 3.0).
 *
 * A boot rather than a bare foot (MG, 23.08): people walk in boots, and a row
 * of naked soles on a Night City street reads as somebody's very bad day.
 * Mirrored on x it becomes the right boot — which is the whole reason the
 * glyph is one print and not the artist's pair.
 */
const FOOTPRINT_GLYPH_URL = '/icons/boot-print.svg';
/**
 * How much ground one boot print stands for, in metres.
 *
 * A stride, so the trail reads as somebody walking rather than as a dotted
 * line — and it doubles as a gauge: counting prints is counting metres, which
 * is the question this whole preview exists to answer.
 */
const FOOTPRINT_STEP_M = 1;
/**
 * Print size and side offset, as a share of the **token's own width**.
 *
 * Map units, not screen units (MG, 23.08): a trail that swelled as the map was
 * zoomed out belonged to the screen rather than to the figure walking it, and
 * next to a token it was never the same size twice. Tied to the token, a big
 * figure leaves big prints and the trail keeps one size at every zoom.
 *
 * The ratios are the glyph's own: 200 × 478 in its viewBox, so `W` over `H` is
 * kept near 1 : 2.4 or the boot comes out squashed.
 */
const FOOTPRINT_W_RATIO = 0.17;
const FOOTPRINT_H_RATIO = 0.4;
const FOOTPRINT_OFFSET_RATIO = 0.13;
/**
 * How far each boot turns away from the centre line, in radians.
 *
 * Toes out, never in (MG, 23.08). Feet planted dead parallel — or worse,
 * splayed the wrong way — read as a mannequin being dragged; a few degrees of
 * toe-out is what a walking human actually leaves behind.
 */
const FOOTPRINT_TOE_OUT = 0.09;
/**
 * Least room a print gets before the trail thins itself out, as a multiple of
 * the print's own length. Below this the boots overlap into a smear.
 */
const FOOTPRINT_GAP_RATIO = 1.15;
/** Ceiling on prints per route, so a long GM route cannot flood the layer. */
const FOOTPRINT_MAX = 160;
/**
 * The explosion template (stage 16d). Amber, and it is the only warm fill on
 * the map: everything else the overlay draws is a line, so a filled patch in a
 * colour nothing else uses reads as „this ground is about to be dangerous"
 * without a legend.
 */
const BLAST_COLOR = 0xfb923c;
/**
 * The target under the crosshair (stage 16f). Red, and solid: the three rings
 * of 16e are white, green/blue/red *ownership* and amber — a fourth mark that
 * shared any of them would be one shape too many to read at a glance.
 */
const AIM_COLOR = 0xf87171;
/** Corner brackets of the target reticle, as a fraction of its radius. */
const AIM_BRACKET = 0.45;

/** Paints one fog shape: a round-capped band for a stroke, a box for a rect. */
function drawFogShape(graphics: Graphics, shape: FogShape): void {
  if (shape.kind === 'rect') {
    graphics.rect(shape.x, shape.y, shape.width, shape.height).fill({ color: 0x000000, alpha: 1 });
    return;
  }
  const [first, ...rest] = shape.points;
  if (!first) return;
  // A click without a drag is one disc; anything longer is a thick polyline,
  // which is exactly the geometry `fogShapeContains` tests on the server.
  if (rest.length === 0) {
    graphics.circle(first.x, first.y, shape.radius).fill({ color: 0x000000, alpha: 1 });
    return;
  }
  graphics.moveTo(first.x, first.y);
  for (const point of rest) graphics.lineTo(point.x, point.y);
  graphics.stroke({
    color: 0x000000,
    alpha: 1,
    width: shape.radius * 2,
    cap: 'round',
    join: 'round',
  });
}

/** `#rrggbb` → the number Pixi wants. Sanitized upstream, so this cannot fail. */
function colorOf(style: DrawingStyle): number {
  return parseInt(style.color.slice(1), 16);
}

/**
 * Paints one drawing. Rect and ellipse take their optional fill first and the
 * outline on top, so a filled area still reads as a bounded shape rather than
 * a smudge; a one-point path is a dot, the mark a click of the pencil leaves.
 */
function drawDrawingShape(graphics: Graphics, shape: DrawingShape, style: DrawingStyle): void {
  const color = colorOf(style);
  const stroke = { color, width: style.width, cap: 'round', join: 'round', alpha: 1 } as const;

  if (shape.kind === 'path') {
    const [first, ...rest] = shape.points;
    if (!first) return;
    if (rest.length === 0) {
      graphics.circle(first.x, first.y, Math.max(style.width / 2, 1)).fill({ color });
      return;
    }
    graphics.moveTo(first.x, first.y);
    for (const point of rest) graphics.lineTo(point.x, point.y);
    graphics.stroke(stroke);
    return;
  }

  if (shape.kind === 'rect') {
    graphics.rect(shape.x, shape.y, shape.width, shape.height);
  } else if (shape.kind === 'ellipse') {
    graphics.ellipse(shape.x, shape.y, shape.radiusX, shape.radiusY);
  } else {
    return; // text is a Text node, not geometry
  }
  if (style.filled) graphics.fill({ color, alpha: DRAWING_FILL_ALPHA });
  graphics.stroke(stroke);
}

/**
 * Did this pointer event land on a token (stage 16e)?
 *
 * Asked of `clicked`, which fires whatever the pointer was over — the viewport
 * cannot tell the map from the figures standing on it. A click on a token has
 * already been answered by the token's own handler, so the walk branch has to
 * stand down or one click would both select a figure and send it walking.
 */
function tokenNodeOf(target: unknown): TokenNode | null {
  let node = target as { parent?: unknown } | null;
  while (node) {
    if (node instanceof TokenNode) return node;
    node = (node.parent ?? null) as { parent?: unknown } | null;
  }
  return null;
}

function isTokenTarget(target: unknown): boolean {
  return tokenNodeOf(target) !== null;
}

/** A label as it sits on the map: sized in scene pixels, so it zooms with it. */
/**
 * Odcisk namalowanego rysunku (etap 27l): kształt, styl i warstwa. Węzeł
 * przemalowuje się dokładnie wtedy, gdy odcisk się zmienił.
 */
function drawingSignature(drawing: DrawingView): string {
  return JSON.stringify([drawing.shape, drawing.style, drawing.gmOnly]);
}

function createDrawingText(text: string, fontSize: number, style: DrawingStyle): Text {
  const label = new Text({
    text,
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize,
      fill: colorOf(style),
      // The outline is what keeps a caption readable over both a lit floor
      // plan and a dark alley without the user having to pick a colour twice.
      stroke: { color: 0x000000, width: Math.max(2, fontSize / 10) },
    },
  });
  label.resolution = 2;
  return label;
}

interface DragState {
  node: TokenNode;
  /** World-space offset between the pointer and the token's top-left. */
  grabDx: number;
  grabDy: number;
  startGlobalX: number;
  startGlobalY: number;
  moved: boolean;
  lastX: number;
  lastY: number;
  /**
   * The route the hand actually took, as token top-left positions (stage 14c).
   * The server charges movement by this path's length, so it is collected from
   * every pointer event rather than from the throttled network frames.
   */
  path: ScenePoint[];
  /** How far apart two samples must be to be worth keeping, in world px. */
  sampleGap: number;
}

/**
 * A march in progress (stage 16e): the token walking a planned route on its
 * own, in front of the whole table.
 *
 * It rides the *drag* channel rather than a new one — intermediate `token:move`
 * frames with `final: false`, exactly what a hand dragging the figure sends —
 * and that is what makes the fog open in front of it for free: the server
 * already refreshes the mover's own field of view on every intermediate frame
 * (`emitDragVision`). A march is a drag without the hand.
 */
interface MarchState {
  node: TokenNode;
  /** Where the figure set off from — the server measures the route from here. */
  start: ScenePoint;
  /** Waypoints of the walk, as token top-left positions. */
  route: ScenePoint[];
  /**
   * Distance from `start` to each waypoint, in scene pixels — the prefix sums
   * that turn „how long have I been walking" into „where am I". Computed once,
   * because the route never changes while it is being walked.
   */
  distances: number[];
  /**
   * `performance.now()` when the figure set off — pushed forward whenever the
   * renderer stalls, so a gap between frames is absorbed instead of being
   * covered at once. See `MARCH_MAX_FRAME_MS`.
   */
  startedAt: number;
  /** When the march was last advanced, for spotting those gaps. */
  lastTickAt: number;
  /** Where the figure is right now, between two waypoints. */
  x: number;
  y: number;
  /**
   * The route already covered. The server charges by what it is sent, so an
   * interrupted march must report the ground it walked and never the plan it
   * abandoned — otherwise stopping halfway would still cost the whole trip.
   */
  walked: ScenePoint[];
  /** Scene pixels per second. */
  speedPx: number;
  /** Metres walked when the last footstep was played (stage 27j). */
  lastStepAt: number;
  /**
   * Where the figure was when it last turned (stage 27j).
   *
   * Not the previous frame: at three metres a second a frame is under a
   * pixel of travel, which `facingFromDelta` rightly refuses to call a
   * direction. Keeping the last *turn* as the anchor means the nose swings
   * once the figure has actually gone somewhere.
   */
  lastFacingX: number;
  lastFacingY: number;
  /** The plan was cut by the turn budget — say so when the figure stops. */
  clipped: boolean;
  /** Budget as it stood when the march started, for the landing arithmetic. */
  budget: { metresLeft: number; costFactor: number } | null;
}

/**
 * What is left of the dragged token's movement, as the tracker reports it
 * (stage 14c). Orientation only: the client cannot know about walls, and from
 * this stage it does not know about hard going either — the server does the
 * arithmetic and the reach circle is drawn from its answer.
 */
export interface MoveAllowance {
  tokenId: string;
  /** Metres still walkable this turn. */
  metresLeft: number;
  /** Metres of budget one metre of ground costs (2 in hard going). */
  costFactor: number;
  /**
   * Would going past this be refused? False for the GM, who may overspend — the
   * server logs it as „poza budżetem" and lets the figure walk (stage 14b).
   *
   * It decides whether a planned route is *cut* at the budget (stage 16e). Cut
   * for a player, because the alternative is a refusal and a snap-back; drawn
   * but not cut for the GM, because clipping them would be a rule the server
   * does not have.
   */
  enforced?: boolean;
  /**
   * Metres of budget the participant could still buy by taking the trade the
   * system offers — absent when that trade is gone.
   *
   * Orientation only, exactly like the rest of this record: the route is drawn
   * a second colour that far, and *nothing here spends anything*. Taking the
   * trade is still a button in the action bar, and the server still books it.
   */
  extraMetres?: number;
  /** What the system calls that trade („Bieg"), for the label on the map. */
  extraLabel?: string;
}

/**
 * Owns the Pixi Application and the scene display list. React only calls
 * `init` / `setScene` / `destroy` — rendering never goes through React state,
 * so chat re-renders cannot touch the canvas or the viewport transform.
 *
 * Layer order (stage 04): background → grid. Later stages append containers:
 * drawings → tokens → lighting → fog → UI overlay.
 */
export class MapRenderer {
  /** Reports background loading, so the UI can show a spinner. */
  onLoadingChange: ((loading: boolean) => void) | null = null;
  /** Streams drag positions; `final` marks the drop (authoritative snap). */
  onTokenMove:
    ((tokenId: string, x: number, y: number, final: boolean, path?: ScenePoint[]) => void) | null =
    null;
  /** Right-click on a token; coordinates are browser client px (for the menu). */
  onTokenMenu: ((tokenId: string, clientX: number, clientY: number) => void) | null = null;
  /**
   * Plain click on the map (world px) — used by token placement mode. Returns
   * whether the click was consumed: from stage 16e the same click may mean
   * „walk here", and exactly one of the two has to win it.
   */
  onMapClick: ((x: number, y: number) => boolean) | null = null;
  /** The steered token changed (stage 16e); null means nothing is selected. */
  onSelectionChange: ((tokenId: string | null, reason: SelectionChange) => void) | null = null;
  /**
   * Klik w figurę, której ten widz nie prowadzi (31.08) — pasek ma ją opisać,
   * nikt nie bierze jej do ręki. Osobny callback, nie `onSelectionChange`
   * z nowym powodem, bo tamten mówi o **sterowaniu**, a to jest jego brak.
   */
  onTokenPreview: ((tokenId: string) => void) | null = null;
  /**
   * Ramka zamknięta na pustym tle (etap 35) — lista figur, które w niej stanęły.
   *
   * Renderer podaje **wyłącznie te, którymi ten widz może sterować**: ma pod
   * ręką `movableTokens`, a wołający nie. Stąd „gracz z ramką na całą mapę
   * dostaje pod kontrolę wyłącznie swoje figury" jest zdaniem o tej jednej
   * linijce filtra, a nie o sześciu sprawdzeniach rozsypanych po operacjach.
   */
  onGroupSelect: ((tokenIds: string[]) => void) | null = null;
  /** `Shift`+klik w figurę: dołóż ją do zaznaczenia albo odejmij (etap 35). */
  onGroupToggle: ((tokenId: string) => void) | null = null;
  /**
   * Ping w to miejsce (etap 35). `pull` znaczy „i przyciągnij tam widok" —
   * renderer o uprawnieniach nie wie nic, przekazuje sam gest.
   */
  onPing: ((x: number, y: number, pull: boolean) => void) | null = null;
  /** Alt+przeciągnięcie figury: postaw jej kopię tam, gdzie ją upuszczono. */
  onTokenDuplicate: ((tokenId: string, x: number, y: number) => void) | null = null;
  /** Something worth a line on the chat happened to a march („marsz przerwany…"). */
  onWalkNote: ((text: string) => void) | null = null;
  /** A march began (token id) or ended (null) — the caller watches for interruptions. */
  onWalkStateChange: ((tokenId: string | null) => void) | null = null;
  /** „Turn this figure by hand" (stage 27j) — the knob on the selection ring. */
  onTokenFacing: ((tokenId: string, facing: number) => void) | null = null;
  /** Double-click on a token — opens its character sheet (stage 08). */
  onTokenActivate: ((tokenId: string) => void) | null = null;
  /**
   * Click on a token while the crosshair is armed (stage 16).
   *
   * Niesie też pozycję kliknięcia — od 31.08 zaraz po wskazaniu celu wyskakuje
   * przy kursorze wybór Celowania, a renderer jest jedynym, kto wie, gdzie ten
   * kursor był (ta sama umowa, co przy `onTokenMenu` i `onAimHover`).
   */
  onTokenTarget: ((tokenId: string, clientX: number, clientY: number) => void) | null = null;
  /**
   * The pointer moved onto (or off) a token the selected figure can aim at
   * (stage 16f). The screen position travels with it so the caller can float a
   * bubble there — the renderer knows where the pointer is, and the DOM does
   * not.
   */
  onAimHover:
    ((hover: { tokenId: string; clientX: number; clientY: number } | null) => void) | null = null;
  /** The local ruler changed; null means the measurement ended. */
  onRulerChange: ((points: ScenePoint[] | null) => void) | null = null;
  /** A fog stroke/rectangle is being drawn (preview); null ends the gesture. */
  onFogPreview: ((shape: FogShape | null) => void) | null = null;
  /** The GM finished a fog gesture — send it to the server. */
  onFogPaint: ((shape: FogShape) => void) | null = null;
  /** Click on the map with the note tool armed (world px). */
  onNotePlace: ((x: number, y: number) => void) | null = null;
  /** Click on an existing GM note pin. */
  onNoteActivate: ((noteId: string) => void) | null = null;
  /** Klik w mapę z uzbrojonym narzędziem miejsca startu (world px, 11.09). */
  onSpawnPlace: ((x: number, y: number) => void) | null = null;
  /** A drawing gesture finished — send it to the server (stage 17b). */
  onDrawingCreate: ((shape: DrawingShape) => void) | null = null;
  /** Click with the text tool armed: the caller asks for the words (world px). */
  onDrawingTextPlace: ((x: number, y: number) => void) | null = null;
  /** A wall chain was closed — send its points to the server (stage 18a). */
  onWallChain: ((points: ScenePoint[]) => void) | null = null;
  /** Click on a door or window glyph — open or close it. */
  onOpeningToggle: ((wallId: number) => void) | null = null;
  /** Click with the light tool armed: place a lamp, or retune the one here. */
  onLightPlace: ((x: number, y: number) => void) | null = null;
  onAccessPointPlace: ((x: number, y: number) => void) | null = null;
  /** Clicking a socket with no tool armed: the GM edits it, a player jacks in. */
  onAccessPointOpen: ((id: number) => void) | null = null;
  /** Click on a lamp marker with no tool armed — switch it on or off. */
  onLightToggle: ((lightId: number) => void) | null = null;
  /** A cover rectangle was dragged out (stage 16c) — world pixels. */
  onCoverRect: ((rect: { x: number; y: number; width: number; height: number }) => void) | null =
    null;
  /**
   * Click on a cover with no tool armed (stage 16c) — „ostrzelaj samochód".
   *
   * Returns whether the click was consumed, exactly like `onMapClick`: with no
   * weapon in hand a car is scenery and the click has to fall through to the
   * walk planner underneath.
   */
  onCoverClick: ((coverId: number) => boolean) | null = null;
  /** A defended-zone rectangle was dragged out (stage 26f) — world pixels. */
  onZoneRect: ((rect: { x: number; y: number; width: number; height: number }) => void) | null =
    null;
  /**
   * Zaznaczono obiekt scenerii na uzbrojonej warstwie (etap 27k). Renderer
   * maluje obrys sam; wywołanie jest po to, żeby store i pasek narzędzi
   * wiedziały, co `Delete` skasuje.
   */
  onSceneSelect: ((ref: SceneObjectRef | null) => void) | null = null;
  /** Dwuklik w obiekt: otwórz jego kartę tam, gdzie taka istnieje. */
  onSceneActivate: ((ref: SceneObjectRef) => void) | null = null;
  /** Obiekt pod kursorem — służy wyłącznie podpowiedzi pod paskiem narzędzi. */
  onSceneHover: ((ref: SceneObjectRef | null) => void) | null = null;
  /**
   * Uchwyt puszczony (etap 27l): obiekt ma stanąć tam, gdzie pokazuje kształt.
   *
   * Renderer nie wysyła niczego sam — to samo rozdzielenie, które ma reszta
   * gestów mapy: renderer wie, gdzie jest kursor, a wywołujący wie, którym
   * zdarzeniem się to zapisuje.
   */
  onSceneTransform: ((ref: SceneObjectRef, shape: SceneObjectShape) => void) | null = null;

  private readonly app = new Application();
  private viewport: Viewport | null = null;
  private readonly background = new Sprite();
  private readonly grid = new Graphics();
  /** Public drawings: map content, so they sit under the tokens (stage 17b). */
  private readonly drawLayer = new Container();
  /** GM-layer drawings — above the fog, next to the note pins. */
  private readonly gmDrawLayer = new Container();
  private readonly drawNodes = new Map<number, Container>();
  /**
   * Czym namalowano węzeł rysunku — kształt, styl i warstwa w jednym napisie
   * (etap 27l). Porównanie napisów zamiast pola po polu, bo kształtów jest
   * cztery i każdy ma inne pola; koszt to jedno `JSON.stringify` na rysunek
   * przy zdarzeniu, a zdarzenia przychodzą tylko wtedy, gdy ktoś coś zmienił.
   */
  private readonly drawSignatures = new Map<number, string>();
  /** The gesture in progress; never leaves the renderer until it is finished. */
  private readonly drawPreview = new Graphics();
  /**
   * Cover (stage 16c). Map content like the public drawings, so it sits *under*
   * the tokens — a figure crouching behind a car must not be hidden by the car
   * — and under the fog, which conceals it exactly as it conceals the map.
   */
  private readonly coverLayer = new Container();
  private readonly coverGraphics = new Graphics();
  private readonly smokeLayer = new Container();
  private readonly smokeGraphics = new Graphics();
  /** One label per cloud („Dym −4"), kept in step with the rows. */
  private readonly smokeLabels = new Map<number, Text>();
  /**
   * Defended zones (stage 26f). Under the tokens like the covers and the smoke:
   * the point of the layer is showing *who is standing in it*, and burying the
   * figure would cost exactly that.
   */
  private readonly zoneLayer = new Container();
  private readonly zoneGraphics = new Graphics();
  private readonly zoneLabels = new Map<number, Text>();
  /** One label per cover („Samochód 18/25"), kept in step with the rows. */
  private readonly coverLabels = new Map<number, Text>();
  private readonly rangeLayer = new Container();
  private readonly rangeGraphics = new Graphics();
  private readonly tokenLayer = new Container();
  private readonly dragGhost = new Graphics();
  /**
   * Shots, blasts and floating numbers (stage 27i).
   *
   * Above the figures — a muzzle flash belongs in front of the man holding the
   * gun — and below the light, the fog and the field of view, which is not a
   * detail: an effect that survived the server's filter can still be standing
   * in a corner this viewer has gone dark on, and it has to be swallowed by the
   * same sheet that swallows the floor there.
   */
  private readonly fx = new MapFxLayer();
  /**
   * The coloured glow of lamps this viewer can see (stage 18b) — above the
   * tokens, so a torch warms the figure holding it, and below the darkness
   * cover, which trims whatever the glow spills past a corner.
   */
  private readonly lightLayer = new Container();
  private readonly glowNodes: Graphics[] = [];
  /** One clip per glow — the GM's lamps are cut to what the walls let out. */
  private readonly glowMasks: Graphics[] = [];
  private readonly fogLayer = new Container();
  private readonly fogSprite = new Sprite();
  /** Off-stage container rendered into `fogTexture`; scaled down for memory. */
  private readonly fogScratch = new Container();
  private readonly fogCover = new Graphics();
  /** One Graphics per run of same-mode shapes — blend mode lives on the node. */
  private readonly fogPasses: Graphics[] = [];
  private fogTexture: RenderTexture | null = null;
  /** Walls and door glyphs — GM only, above the fog like the note pins. */
  private readonly wallLayer = new Container();
  private readonly wallGraphics = new Graphics();
  private readonly openingNodes = new Map<number, Container>();
  /**
   * The player's field of view, composited exactly like the fog: a black sheet
   * with the polygons erased out of it.
   */
  private readonly visionLayer = new Container();
  private readonly visionSprite = new Sprite();
  private readonly visionScratch = new Container();
  private readonly visionCover = new Graphics();
  private readonly visionCutout = new Graphics();
  private visionTexture: RenderTexture | null = null;
  /**
   * The unlit part of what this viewer can see (stage 18b): the light mask drawn
   * back over the holes the polygons punched, so only the *lit* part of the field
   * of view ends up transparent. A one-pixel-per-cell canvas scaled up with
   * linear filtering, which is what gives a light a soft edge for free.
   */
  private readonly unlitSprite = new Sprite();
  /** One pixel per mask cell — the levels as they came off the wire. */
  private unlitCellCanvas: HTMLCanvasElement | null = null;
  /** The same thing blown up and blurred; this is what the texture shows. */
  private unlitCanvas: HTMLCanvasElement | null = null;
  private unlitTexture: Texture | null = null;
  /**
   * What the party already walked (stage 18c), drawn as a partial `erase`: an
   * explored cell has its cover lifted to `DIM_COVER_ALPHA` instead of being
   * cleared, so a remembered room reads as the map seen once rather than as the
   * map being looked at. Same one-pixel-per-cell canvas trick as the unlit
   * sheet, which also gives the boundary of the memory a soft edge.
   *
   * Deliberately drawn *after* the unlit sheet: an area you have explored stays
   * on the plan even when you are standing in it in the dark. You remember the
   * shape of the room you cannot currently see.
   */
  private readonly exploredSprite = new Sprite();
  private exploredCanvas: HTMLCanvasElement | null = null;
  private exploredTexture: Texture | null = null;
  private lastExploration: ExplorationMask | null = null;
  /**
   * The GM's overrides over dynamic vision (stage 18c), composited last: they
   * outrank the walls, the light and the memory, exactly as they do on the
   * server when it decides which tokens a player may receive.
   */
  private readonly overridePasses: Graphics[] = [];
  private visionOverrides: FogShapeView[] = [];
  /** Lamp markers — GM only, above the fog like the walls they usually accompany. */
  private readonly lightMarkerLayer = new Container();
  private readonly netPointLayer = new Container();
  private readonly netPointNodes = new Map<number, Container>();
  private lastAccessPoints: AccessPointMarker[] = [];
  private readonly lightNodes = new Map<number, Container>();
  private readonly noteLayer = new Container();
  private readonly noteNodes = new Map<string, Container>();
  private readonly overlayLayer = new Container();
  private readonly rulerGraphics = new Graphics();
  /** The reach circle and the trail of a drag in progress (stage 14c). */
  private readonly moveGraphics = new Graphics();
  private moveText: Text | null = null;
  private moveAllowance: MoveAllowance | null = null;
  private readonly tokenNodes = new Map<string, TokenNode>();
  /** tokenId → may the local user drag it (GM or owner). */
  private readonly movableTokens = new Map<string, boolean>();
  private drag: DragState | null = null;
  private scene: SceneView | null = null;
  private sceneId: string | null = null;
  private backgroundUrl: string | null = null;
  private destroyed = false;
  /** Ruler tool armed: the map measures instead of panning. */
  private rulerMode = false;
  /** Waypoints of the measurement in progress; the last one follows the pointer. */
  private rulerPoints: ScenePoint[] | null = null;
  /** Crosshair armed by „Atakuj": the next token click reports a target. */
  private targeting = false;
  /** Note tool armed: the next click on empty map drops a pin. */
  private notePlacing = false;
  /** Narzędzie miejsca startu: następny klik w mapę wyznacza punkt (11.09). */
  private spawnPlacing = false;
  /** Czy kamera jest zamknięta w granicach mapy (gracz) — patrz `setCameraLocked`. */
  private cameraLocked = false;
  /** Fog brush settings; `armed` decides whether a drag paints. */
  private fogBrush: FogBrushSettings = {
    armed: false,
    mode: 'reveal',
    shape: 'brush',
    radius: 120,
  };
  /** Fog gesture in progress: brush samples, or the rectangle's origin. */
  private fogStroke: ScenePoint[] | null = null;
  private fogRectStart: ScenePoint | null = null;
  private fogRectEnd: ScenePoint | null = null;
  /** Drawing tool settings; `armed` decides whether a drag draws. */
  private draw: DrawSettings = {
    armed: false,
    tool: 'pencil',
    style: { color: '#22d3ee', width: 6, filled: false },
    gmOnly: false,
    fontSize: 48,
  };
  /** Eraser armed: a click reports the world point, the caller picks the shape. */
  /** Drawing gesture in progress: freehand samples, or the drag's two corners. */
  private drawPoints: ScenePoint[] | null = null;
  private drawStart: ScenePoint | null = null;
  private drawEnd: ScenePoint | null = null;
  private lastFog: FogState | null = null;
  private lastFogPending: FogShape | null = null;
  private fogIsGm = false;
  /** Labels drawn on the overlay layer — rebuilt on every redraw. */
  private readonly overlayTexts: Text[] = [];
  private readonly rangeTexts: Text[] = [];
  /** Last overlay input, so a zoom can redraw at the new screen scale. */
  private lastRulers: RulerLine[] = [];
  private lastRingCentre: ScenePoint | null = null;
  private lastRings: RangeRing[] = [];
  private lastNotes: MapNoteView[] = [];
  /** Znacznik miejsca startu drużyny — rysowany wyłącznie u MG (11.09). */
  private spawnNode: Container | null = null;
  private lastSpawn: ScenePoint | null = null;
  private lastWalls: WallView[] = [];
  private lastOpenings: WallView[] = [];
  private lastVisionPolygons: ScenePoint[][] = [];
  private visionActive = false;
  private lastLightMask: LightMask | null = null;
  private lastGlows: RenderGlow[] = [];
  private lastLights: LightMarker[] = [];
  /** Wall tool settings; `armed` decides whether a click traces or erases. */
  private wall: WallSettings = { armed: false, kind: 'wall', snapGrid: true };
  /** The chain being traced: confirmed points plus the one under the pointer. */
  private wallPoints: ScenePoint[] | null = null;
  private wallCursor: ScenePoint | null = null;
  /** Light tool settings; `armed` decides whether a click places or removes. */
  private light: LightSettings = { armed: false };
  private netPoint: AccessPointSettings = { armed: false };
  /** Cover tool settings (stage 16c); a drag draws, a click erases. */
  private cover: CoverSettings = { armed: false };
  /** Corners of the rectangle being dragged, null when no drag is in flight. */
  private coverRectStart: ScenePoint | null = null;
  private coverRectEnd: ScenePoint | null = null;
  private lastCovers: CoverView[] = [];
  private lastSmoke: SmokeView[] = [];
  /** Zone tool settings (stage 26f); a drag draws, a click erases. */
  private zone: ZoneSettings = { armed: false };
  private zoneRectStart: ScenePoint | null = null;
  private zoneRectEnd: ScenePoint | null = null;
  private lastZones: DefenseZoneView[] = [];
  private lastDrawings: DrawingView[] = [];
  /**
   * Zaznaczony i najechany obiekt scenerii (etap 27k) — lustro
   * `sceneSelectionStore`, tak jak `selectedTokenId` jest lustrem
   * `selectionStore`. Renderer trzyma własną kopię, bo maluje obrys w każdej
   * klatce przeskalowania, a store czyta React.
   */
  private sceneSelected: SceneObjectRef | null = null;
  private sceneHovered: SceneObjectRef | null = null;
  private readonly sceneSelectGraphics = new Graphics();
  /**
   * Kto patrzy — potrzebne wyłącznie po to, żeby gracz nie łapał obrysem cudzej
   * kreski. Uzupełniane z `setTokens`, które i tak niesie te dwa pola.
   */
  private viewerIsGm = false;
  private viewerId: string | null = null;
  /**
   * Ostatnie trafienie i jego czas — Pixi nie ma dwukliku, więc liczymy dwa
   * szybkie kliknięcia w ten sam obiekt (tak samo jak otwieranie karty figury).
   */
  private lastScenePick: { ref: SceneObjectRef; at: number } | null = null;
  /**
   * Czy `pointerdown` już zużył ten klik na zaznaczenie.
   *
   * Potrzebne dla **notatek**: pinezka stawia się w `clicked`, a nie w
   * `pointerdown`, więc bez tej flagi klik w istniejącą pinezkę zaznaczyłby ją
   * i od razu wbił obok drugą. Zerowane na początku każdego `pointerdown`, więc
   * gest przerwany przeciągnięciem niczego nie zostawia na potem.
   */
  private layerPickSpent = false;
  /**
   * Gdzie zaczął się gest na warstwie rysowanej przeciągnięciem i co pod nim
   * leżało. Prostokąt osłony, strefy i kształt rysunku powstają z **ruchu**, a
   * krótkie kliknięcie w istniejący obiekt ma go zaznaczyć — więc decyzja
   * zapada dopiero przy puszczeniu przycisku (patrz `tapPick`).
   */
  private dragPick: { ref: SceneObjectRef; at: ScenePoint } | null = null;
  /**
   * Trwające przeciąganie uchwytu zaznaczonego obiektu (etap 27l).
   *
   * `base` to kształt sprzed gestu, `current` to jego podgląd — obrys idzie za
   * kursorem, a obiekt przeskakuje dopiero na puszczenie przycisku. Podgląd
   * zamiast ruchu na żywo z tego samego powodu, dla którego trasa figury jest
   * podglądem: przesunięcie ściany o piksel to przeliczenie widoczności całej
   * sceny na serwerze, więc dwadzieścia razy na sekundę byłoby dwadzieścia
   * razy za dużo.
   */
  private sceneDrag: {
    ref: SceneObjectRef;
    handle: SceneHandleId;
    origin: ScenePoint;
    base: SceneObjectShape;
    current: SceneObjectShape;
    /** Rysunki wolno przesuwać, ale nie skalować — ścieżki nie da się rozciągnąć. */
    moveOnly: boolean;
  } | null = null;
  /**
   * The tools whose click is answered on `pointerdown` and ends in a `return`
   * there — walls, lamps, sockets, covers and zones. `viewport` still emits
   * `clicked` on the release of that very gesture, so every one of them has to
   * be named here or the click is spent twice: once on the tool, once on the
   * game underneath. That was bug #8 of the 08.08 combat session — erasing a
   * wreck sent the selected figure marching out of its turn budget, and erasing
   * a car loaded the dice cup with an attack on it. Covers were the tool that
   * showed it; zones (stage 26f) and sockets (stage 26b) arrived later with the
   * same shape and the same hole.
   *
   * The brush-like tools (ruler, fog, drawing, eraser) are **not** here: their
   * gesture ends on pointerup, and `clicked` refuses them a few lines further
   * down instead.
   */
  private get toolSpentThisClick(): boolean {
    return (
      this.wall.armed ||
      this.light.armed ||
      this.netPoint.armed ||
      this.cover.armed ||
      this.zone.armed
    );
  }
  /**
   * „A map tool owns the pointer" — every tool, brushes included. The wider
   * half of the same rule: while one of these is in hand the pointer is not
   * aiming, not planning a walk and not picking figures up, because that
   * gesture is already spoken for. Four places asked this question with four
   * hand-written lists before the repair session of 22.08, and three of them
   * had drifted — which is how the cover tool ended up drawing a route under
   * the cursor and dragging the figure it was erasing scenery around.
   */
  private get mapToolArmed(): boolean {
    return (
      this.rulerMode ||
      this.notePlacing ||
      this.spawnPlacing ||
      this.fogBrush.armed ||
      this.draw.armed ||
      this.toolSpentThisClick
    );
  }
  /**
   * Czy kursor niesie teraz `Alt`, czyli czy klik w podłogę byłby pingiem.
   *
   * Wyłącznie po to, żeby mapa nie rysowała trasy marszu, której ten klik nie
   * wykona — ping sam z siebie nie potrzebuje żadnego stanu.
   */
  private pingArmed = false;
  /** Ticker phase for flickering lamps — renderer-side, never a network event. */
  private flickerPhase = 0;
  private hasFlicker = false;
  /** The token this viewer steers (stage 16e); mirrors `selectionStore`. */
  private selectedTokenId: string | null = null;
  /**
   * „May a token stand here?", injected by the caller (stage 16e).
   *
   * The renderer deliberately never learns what makes a point passable. The GM
   * hands in a predicate reading real walls, a player one reading their own
   * field of view and the party's memory, and neither shape reaches this file —
   * the same bargain `planWalk` strikes in `shared`, one layer down.
   */
  private walkPassable: WalkPassable | null = null;
  /** Edge test for callers whose obstacles are lines (the GM's walls). */
  private walkCanStep: WalkStep | undefined = undefined;
  /** Why this token may not walk at all („Powalony"), or null when it may. */
  private walkRefusal: string | null = null;
  /** The route under the cursor and the march, drawn above everything. */
  private readonly walkGraphics = new Graphics();
  /**
   * Footprints along that route (repair session 23.08).
   *
   * Their own container rather than more `Graphics`, because each print is a
   * rotated, mirrored, tinted sprite — and because a pool of sprites can be
   * reused frame after frame, which a redrawn path cannot. Purely painterly, so
   * it must never be what a click lands on (the hit-test pitfall of 27i).
   */
  private readonly footprintLayer = new Container();
  private footprintTexture: Texture | null = null;
  /** Prints made once and re-aimed since; `visible` decides how many are in use. */
  private readonly footprints: Sprite[] = [];
  /**
   * The floor the turn can still pay for (stage 27j).
   *
   * Its own layer under the route, because the two answer different questions
   * and change at different rates: the shading moves when the figure or its
   * budget does, the route moves with every pointer event.
   */
  private readonly reachGraphics = new Graphics();
  /** Cells the shading was computed for, keyed like `walkHover`. */
  private reach: { key: string; cells: ScenePoint[] } | null = null;
  /**
   * The line a finished march leaves behind, and how much of its life is left.
   *
   * Kept as geometry rather than as a fading `Graphics.alpha` so a second march
   * can start while the first is still fading without the two sharing a dial.
   */
  private trail: { points: ScenePoint[]; half: number; life: number } | null = null;
  private readonly trailGraphics = new Graphics();
  /** Whose turn it is, kept from the last token push so the pulse can find it. */
  private activeTokenId: string | null = null;
  /**
   * The third ring — „this figure obeys my clicks" (stage 16e).
   *
   * On the overlay rather than on the token, and that is not a layering
   * preference: a token draws itself in **world** pixels, and a table looks at a
   * 4096 px map at about a fifth of scale, where a two-pixel ring is half a
   * screen pixel of nothing. Overlay strokes are multiplied by `overlayScale()`,
   * so this one is the same weight at every zoom — the treatment the ruler and
   * the route already get, for the same reason.
   */
  private readonly selectGraphics = new Graphics();
  /**
   * Zaznaczenie wielu figur i ramka, którą się je bierze (etap 35).
   *
   * Osobne `Graphics` obok pierścienia sterowanej figury, bo to są dwie różne
   * rzeczy naraz: jedna figura jest **prowadzona** (biały pierścień z gałką
   * obrotu), a sześć jest **zaznaczonych** (niebieskie obwódki). Sterowana
   * figura należy do grupy, więc na niej świecą obie — i tak ma być, bo
   * kliknięcie w podłogę wyśle w drogę właśnie ją.
   */
  private readonly groupGraphics = new Graphics();
  /** Figury zaznaczone grupowo — lustro `selectionStore.groupIds`. */
  private groupTokenIds: string[] = [];
  /** Ciągnięta ramka w pikselach sceny; null, gdy nikt nie ciągnie. */
  private marquee: { start: ScenePoint; end: ScenePoint } | null = null;
  /**
   * Czy ruch grupowy jest w tej chwili dozwolony (etap 35, rozstrzygnięcie MG).
   *
   * Poza walką tak, **w walce nie**: budżet metrów z 14c jest per figura, więc
   * grupowe przeciągnięcie byłoby jedyną drogą omijającą ekonomię ruchu. Pyta
   * o to `MapArea`, bo to ona wie, czy walka trwa — renderer zna tylko odpowiedź.
   */
  private groupDragAllowed = true;
  /**
   * Reszta grupy jadąca za przeciąganą figurą: węzeł i jego przesunięcie
   * względem niej w chwili chwytu. Null, gdy jedzie sama.
   */
  private groupDrag: { node: TokenNode; dx: number; dy: number }[] | null = null;
  /**
   * Alt+przeciągnięcie: gest, który zamiast przesunąć figurę, postawi jej kopię.
   *
   * Własny stan, a nie flaga w `drag`, i to jest istota rzeczy: przy klonowaniu
   * **oryginał się nie rusza**. Gdyby gest szedł zwykłą drogą przeciągania, do
   * serwera poleciałaby seria `token:move` figury, która ma stać w miejscu —
   * a kopia i tak powstałaby dopiero na puszczeniu przycisku.
   */
  private cloneDrag: {
    node: TokenNode;
    grabDx: number;
    grabDy: number;
    startGlobalX: number;
    startGlobalY: number;
    moved: boolean;
    at: ScenePoint;
  } | null = null;
  /**
   * Pingi na mapie (etap 35) — kółka gasnące same z siebie.
   *
   * Trzymane w rendererze, a nie w store: ping niczego nie renderuje poza sobą
   * i nie przeżywa dwóch sekund, więc każdy subskrybent zustanda przeliczałby
   * drzewo komponentów za rzecz, która już się stała (ta sama umowa, co przy
   * efektach walki z 27i).
   */
  private readonly pingLayer = new Container();
  private readonly pings: { node: Container; ring: Graphics; x: number; y: number; at: number }[] =
    [];
  /**
   * Does the selected figure have a weapon in hand (stage 16f)?
   *
   * The whole of what turns a pointer into a crosshair. The renderer never
   * learns *which* weapon — that is a rule, and the bar owns it; it only needs
   * to know whether pointing at somebody means anything right now.
   */
  private aimReady = false;
  /** Token under the crosshair, redrawn as a reticle on the overlay. */
  private aimTokenId: string | null = null;
  private readonly aimGraphics = new Graphics();
  /**
   * The area template that follows the pointer (stages 16d, 16g).
   *
   * Set while a charge — or a shotgun loaded with shot — is in hand, and it is
   * the only thing in this file that knows about areas: the size comes from the
   * rules module through the action bar, and where the square lands comes from
   * the grid. The renderer's job is to make „it goes off *here*" visible before
   * the click, because the shape is the whole decision: a metre of pointer
   * travel is a person in or out.
   *
   * The two shapes differ in what the click then means, and the flag says so
   * without this file having to know why: a blast **replaces** the target (the
   * click lands on the ground), a cone only *shows* what a perfectly ordinary
   * shot at a figure will also sweep.
   */
  private areaPreview: AreaPreview | null = null;
  /** Centre of the square (snapped) or the point the cone is aimed at. */
  private areaHover: ScenePoint | null = null;
  private readonly blastGraphics = new Graphics();
  /**
   * The rotation knob on the selection ring (stage 27j), while it is being
   * dragged. Null the rest of the time — the knob is drawn regardless, it is
   * only *grabbed* rarely.
   */
  private rotating: { tokenId: string; facing: number } | null = null;
  /**
   * Last planned route, keyed by the goal cell. A* would otherwise run on every
   * pointer event — dozens of times a second — to produce the same polyline.
   */
  private walkHover: {
    key: string;
    points: ScenePoint[];
    walkable: ScenePoint[];
    truncated: boolean;
    metres: number;
    spent: number;
    complete: boolean;
  } | null = null;
  private march: MarchState | null = null;
  /** Cursor the route preview asks for; '' leaves the tool cursors alone. */
  private walkCursor = '';
  /**
   * Corners the player insisted on with Shift+click (stage 16e).
   *
   * The escape hatch for the one thing an automatic route cannot know: *why*
   * you are going somewhere. The shortest way past a doorway may be the way
   * past the doorway somebody is aiming through, and no pathfinder is going to
   * work that out. Each waypoint is planned to in turn, so the legs still go
   * round corners — this bends the route, it does not replace it.
   */
  private walkWaypoints: ScenePoint[] = [];
  /**
   * When a token drag last ended, in ticker time.
   *
   * The viewport does not pan while a figure is being dragged (its drag plugin
   * is paused), so as far as `pixi-viewport` is concerned nothing moved and the
   * drop still counts as a *click* on the map. Without this the release of a
   * drag would immediately send the same figure walking somewhere else — and it
   * would only happen when the pointer left the portrait during the drag, which
   * is exactly the kind of bug that survives a demo and shows up at the table.
   */
  private dragEndedAt = 0;

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: host, backgroundAlpha: 0, antialias: true });
    // React StrictMode may unmount while init is in flight.
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    host.appendChild(this.app.canvas);
    // Fire and forget: the route reads perfectly well as a line, so a missing
    // or slow glyph must not hold the map up. The first route drawn after it
    // lands gets the prints.
    void Assets.load<Texture>(FOOTPRINT_GLYPH_URL)
      .then((texture) => {
        if (this.destroyed) return;
        this.footprintTexture = texture;
        this.drawWalkPreview();
      })
      .catch(() => {
        // Brak pliku zostawia samą linię — trasa nadal mówi wszystko, co musi.
      });

    const viewport = new Viewport({
      events: this.app.renderer.events,
      ticker: this.app.ticker,
      screenWidth: host.clientWidth,
      screenHeight: host.clientHeight,
    });
    viewport
      .drag({ mouseButtons: 'left-middle' })
      .wheel()
      .pinch()
      .decelerate({ friction: 0.9 })
      .clampZoom({ minScale: MIN_ZOOM, maxScale: MAX_ZOOM });
    viewport.addChild(this.background);
    viewport.addChild(this.grid);
    // Public drawings are map content: they go under the tokens (a sketched
    // route must not cover a portrait) and under the fog, which therefore
    // conceals them exactly as it conceals the map they annotate.
    viewport.addChild(this.drawLayer);
    // Cover goes above the drawings and below the tokens: it is a thing in the
    // world, and things in the world do not cover the people standing at them.
    this.coverLayer.addChild(this.coverGraphics);
    viewport.addChild(this.coverLayer);
    // Smoke goes with the covers and just above them: a cloud drifts over the
    // car it was thrown at, and neither of them may hide the people standing
    // there — which is why both sit below the token layer.
    this.smokeLayer.addChild(this.smokeGraphics);
    viewport.addChild(this.smokeLayer);
    // Defended zones (stage 26f) go with the covers and the smoke and for the
    // same reason: the whole job of the layer is showing who is standing in one.
    this.zoneLayer.addChild(this.zoneGraphics);
    viewport.addChild(this.zoneLayer);
    // Range rings sit under the tokens so they never hide a portrait; the
    // ruler sits above everything, because a measurement is meant to be read.
    this.rangeLayer.addChild(this.rangeGraphics);
    viewport.addChild(this.rangeLayer);
    // Net sockets (stage 26b) are **scenery**, so they go under the figures
    // rather than over them like the lamp handles. Not a cosmetic choice: the
    // usual thing to do with a terminal is to walk up to it, and a marker over
    // the tokens would take the click, the drag and the context menu away from
    // whoever is standing on it. Unlike a lamp, this layer is not GM-only —
    // once a Scanner has found a socket, the player has to see where to stand.
    viewport.addChild(this.netPointLayer);
    viewport.addChild(this.tokenLayer);
    viewport.addChild(this.dragGhost);
    viewport.addChild(this.fx.container);
    // Light is above the tokens — a torch has to warm the figure carrying it —
    // and below the cover, which is what stops a glow leaking round a corner.
    viewport.addChild(this.lightLayer);
    // Fog hides the map and everything standing on it, so it sits above the
    // tokens; the GM layer and the ruler stay readable on top of the fog.
    this.fogLayer.addChild(this.fogSprite);
    viewport.addChild(this.fogLayer);
    // The player's field of view sits with the fog: both are the same kind of
    // cover, and a scene never runs the two at once (one visibility mode).
    this.visionLayer.addChild(this.visionSprite);
    viewport.addChild(this.visionLayer);
    // The GM's own layer: drawings the players never receive, drawn over the
    // fog so the GM can plan through it — the same treatment as note pins.
    viewport.addChild(this.gmDrawLayer);
    // Walls are GM-only and have to stay readable over everything, including
    // the fog they usually accompany.
    this.wallLayer.addChild(this.wallGraphics);
    viewport.addChild(this.wallLayer);
    // Lamp markers keep the walls' treatment: GM-only and readable over the
    // cover, because they are edited while looking at the finished darkness.
    viewport.addChild(this.lightMarkerLayer);
    viewport.addChild(this.noteLayer);
    this.overlayLayer.addChild(this.rulerGraphics);
    this.overlayLayer.addChild(this.moveGraphics);
    // Obrys zaznaczonej scenerii pod pierścieniem figury: jedno i drugie nigdy
    // nie świeci naraz (zaznaczenia wykluczają się wzajemnie), ale kolejność
    // ma znaczenie w chwili przełączenia.
    this.overlayLayer.addChild(this.sceneSelectGraphics);
    // Obwódki grupy pod pierścieniem sterowanej figury: na tej jednej, która
    // jest i prowadzona, i zaznaczona, biały pierścień ma być na wierzchu.
    this.overlayLayer.addChild(this.groupGraphics);
    this.overlayLayer.addChild(this.selectGraphics);
    this.overlayLayer.addChild(this.aimGraphics);
    // Ping ma być widoczny nad wszystkim, po to się go wysyła. Czysto malarski,
    // więc `eventMode = 'none'` — pułapka z 27i: pełnoekranowa warstwa bez tego
    // staje między kursorem a figurami i psuje trafianie w żetony.
    this.pingLayer.eventMode = 'none';
    this.overlayLayer.addChild(this.pingLayer);
    // The shaded floor goes under the route and the trail: it is the ground,
    // and the two green lines are things drawn on it.
    this.overlayLayer.addChild(this.reachGraphics);
    this.overlayLayer.addChild(this.trailGraphics);
    this.overlayLayer.addChild(this.walkGraphics);
    // Prints over the line, not under it: the line is the thin thing holding
    // the shape together, the prints are what the eye actually reads.
    this.footprintLayer.eventMode = 'none';
    this.overlayLayer.addChild(this.footprintLayer);
    this.overlayLayer.addChild(this.blastGraphics);
    this.overlayLayer.addChild(this.drawPreview);
    viewport.addChild(this.overlayLayer);
    // Scratch container: the fog is rendered into a texture at reduced scale,
    // never added to the stage.
    this.fogScratch.addChild(this.fogCover);
    this.visionScratch.addChild(this.visionCover);
    this.visionScratch.addChild(this.visionCutout);
    // Order inside the cover: black sheet, holes for what is in view, the unlit
    // part painted back in, the party's memory lifted to a dim grey, and last
    // the GM's overrides — which win over all of it. What survives is „seen and
    // lit", „seen once", or „the GM said so".
    this.visionScratch.addChild(this.unlitSprite);
    this.exploredSprite.blendMode = 'erase';
    this.visionScratch.addChild(this.exploredSprite);
    // Layers that are pure covering: they draw over the map and must never be
    // the thing a click lands on. Without this the darkness sheet a player has
    // over the whole scene sits between the pointer and every token on it.
    for (const layer of [
      this.background,
      this.grid,
      this.drawLayer,
      this.gmDrawLayer,
      // Cover is drawn, never clicked *in Pixi*: a click on a car is resolved
      // from world coordinates by the caller, which holds the cover list. Left
      // interactive it would sit between the pointer and the viewport and break
      // the same hit test the covering layers broke before stage 16e.
      this.coverLayer,
      this.smokeLayer,
      this.zoneLayer,
      this.rangeLayer,
      this.dragGhost,
      this.lightLayer,
      this.fogLayer,
      this.visionLayer,
      this.overlayLayer,
    ]) {
      layer.eventMode = 'none';
    }
    this.app.stage.addChild(viewport);
    this.viewport = viewport;
    this.app.ticker.add(this.tickFlicker);
    this.app.ticker.add(this.tickMarch);
    this.app.ticker.add(this.tickTrail);
    this.app.ticker.add(this.tickTurn);
    this.app.ticker.add(this.tickFx);
    this.app.ticker.add(this.tickPing);

    /**
     * What one left click on the map means — the whole order of precedence in
     * one place (stage 16e), rather than a condition per feature scattered over
     * the file. The same treatment the refusals of `door:toggle` got in 18d, and
     * for the same reason: a click is one gesture with six possible meanings,
     * and the only way to keep them straight is to write the order down.
     *
     *   placing a token → map tool (ruler, fog, drawing, walls, lights)
     *   → armed crosshair (16b) → steered token walks → empty click
     */
    viewport.on('clicked', (event) => {
      // The tools that finish their gesture on pointerdown have already spent
      // this click; letting it through here would also drop a token in the
      // middle of a floor plan or send a figure marching (see the getter).
      if (this.toolSpentThisClick) return;
      // `pointerdown` zaznaczył obiekt na tej warstwie — ten klik jest zużyty
      // (27k). Bez tego klik w istniejącą pinezkę zaznaczyłby ją i od razu wbił
      // obok drugą, bo notatka stawia się dopiero tutaj.
      if (this.layerPickSpent) return;
      if (this.notePlacing) {
        this.onNotePlace?.(Math.round(event.world.x), Math.round(event.world.y));
        return;
      }
      if (this.spawnPlacing) {
        this.onSpawnPlace?.(Math.round(event.world.x), Math.round(event.world.y));
        return;
      }
      if (this.onMapClick?.(event.world.x, event.world.y)) return;
      // A weapon in hand used to swallow this click; since stage 16f it does
      // not — the ground under an armed figure still means „walk there", which
      // is the difference between a crosshair and a modal targeting mode.
      if (this.rulerMode || this.fogBrush.armed || this.draw.armed) return;
      // A click that landed on a token has already been answered by the token
      // itself — selecting it, opening its sheet, stopping a march.
      if (isTokenTarget(event.event.target)) return;
      // The release of a drag is not an order to walk (see `dragEndedAt`).
      if (performance.now() - this.dragEndedAt < DRAG_CLICK_GRACE_MS) return;
      const pointer = event.event as FederatedPointerEvent;
      // Ping (etap 35) przed wszystkim, co klik w podłogę znaczył do tej pory.
      // `Alt` był na pustym polu wolny: znaczy coś **na figurze** („to jest cel,
      // nie moja następna figura", 16f), a tam ten klik i tak nie dochodzi.
      // `Alt+Shift` u MG dokłada przyciągnięcie widoku; u gracza serwer zetnie
      // je do zwykłego pingu, więc gest nie wywala się, tylko robi mniej.
      if (pointer.altKey === true) {
        this.onPing?.(
          Math.round(event.world.x),
          Math.round(event.world.y),
          pointer.shiftKey === true,
        );
        return;
      }
      if (pointer.shiftKey === true) {
        this.addWalkWaypoint(event.world.x, event.world.y);
        return;
      }
      this.walkTo(event.world.x, event.world.y);
    });

    this.wireRuler(viewport);
    // Overlay labels are sized in screen pixels, so a zoom has to redraw them.
    viewport.on('zoomed', () => this.refreshOverlays());
    viewport.on('zoomed-end', () => this.refreshOverlays());

    this.app.renderer.on('resize', (width: number, height: number) => {
      viewport.resize(width, height);
      // Dolna granica zbliżenia zależy od kształtu płótna: okno rozciągnięte
      // w bok przy niezmienionym zoomie odsłoniłoby czerń za krawędzią mapy.
      this.applyCameraBounds();
    });
  }

  setScene(scene: SceneView | null): void {
    const viewport = this.viewport;
    if (!viewport || this.destroyed) return;
    this.scene = scene;

    if (!scene) {
      this.sceneId = null;
      this.backgroundUrl = null;
      this.background.visible = false;
      this.grid.clear();
      this.setRulers([]);
      this.setMoveAllowance(null);
      this.setRangeRings(null, []);
      this.setNotes([]);
      this.setSpawn(null);
      this.setDrawings([]);
      this.setWalls([], []);
      this.setLights([]);
      this.setGlows([]);
      this.setVision([], false, null);
      this.fogSprite.visible = false;
      this.fx.setScene(null);
      this.clearTokens();
      return;
    }

    const sceneChanged = scene.id !== this.sceneId;
    this.sceneId = scene.id;
    viewport.worldWidth = scene.width;
    viewport.worldHeight = scene.height;
    this.applyCameraBounds();

    this.updateBackground(scene);
    this.drawGrid(scene);
    // The effect layer measures blasts in metres, so it needs the scene's scale
    // — and a scene change wipes whatever was still burning on the old map.
    this.fx.setScene(scene);
    // The scene's size drives the fog texture, so a resized (or swapped) map
    // has to recomposite it before the next frame.
    this.setFog(this.lastFog, this.lastFogPending, this.fogIsGm);
    this.setVision(this.lastVisionPolygons, this.visionActive);
    if (sceneChanged) {
      this.clearTokens();
      // Zaznaczenie obiektu należy do sceny — id ściany z poprzedniej mapy
      // narysowałoby obrys w pustce (27k).
      this.sceneSelected = null;
      this.sceneHovered = null;
      this.lastScenePick = null;
      this.drawSceneSelectOutline();
      this.onSceneSelect?.(null);
      this.setSpawn(null);
      this.setDrawings([]);
      this.setWalls([], []);
      this.setLights([]);
      this.setGlows([]);
      this.setVision([], false, null);
      this.cancelDrawGesture();
      this.cancelWallChain();
      this.fitScene(scene);
    }
    // `fitScene` changes the zoom by hand, and pixi-viewport only emits
    // `zoomed` for its own plugins (wheel, pinch) — so nothing else would tell
    // the screen-sized overlays to rescale. Without this a note pin dropped
    // before the map settled renders at world scale: three pixels tall on a
    // 4096 px map, which is how the same bug showed up for ruler labels in
    // stage 16.
    this.refreshOverlays();
  }

  /** Reconciles the token layer with the store state (diff by id). */
  setTokens(tokens: TokenView[], ctx: TokenNodeCtx): void {
    if (!this.viewport || this.destroyed) return;
    this.activeTokenId = ctx.activeTokenId;
    // Kto patrzy — wyłącznie po to, by gracz nie łapał obrysem cudzej kreski
    // (etap 27k). Nie nowe wejście do renderera: te dwa pola i tak tu jadą.
    this.viewerIsGm = ctx.isGm;
    this.viewerId = ctx.myUserId;
    const seen = new Set<string>();
    for (const token of tokens) {
      seen.add(token.id);
      let node = this.tokenNodes.get(token.id);
      if (!node) {
        node = new TokenNode(token);
        this.tokenNodes.set(token.id, node);
        this.tokenLayer.addChild(node);
        this.wireInteraction(node);
      }
      // Every token stays interactive (double-click opens its sheet); only
      // dragging is restricted to the GM and the token's owner.
      const movable = ctx.isGm || token.ownerId === ctx.myUserId;
      this.movableTokens.set(token.id, movable);
      node.eventMode = 'static';
      node.cursor = movable ? 'pointer' : 'default';
      // A figure in the middle of a march owns its own position, exactly as a
      // dragged one does: the store still holds where the server last saw it.
      node.update(token, ctx, this.drag?.node === node || this.march?.node === node);
    }
    for (const [id, node] of this.tokenNodes) {
      if (!seen.has(id)) {
        if (this.drag?.node === node) this.endDrag(false);
        if (this.march?.node === node) this.finishMarch(null, false);
        if (this.cloneDrag?.node === node) this.onCloneEnd();
        if (this.selectedTokenId === id) this.setSelection(null, 'gone');
        // Figura, której już nie ma, wypada też z zaznaczenia grupowego —
        // inaczej operacja grupowa próbowałaby ruszyć nieistniejący żeton.
        if (this.groupTokenIds.includes(id)) {
          this.groupTokenIds = this.groupTokenIds.filter((entry) => entry !== id);
        }
        if (this.aimTokenId === id) this.clearAim();
        this.tokenNodes.delete(id);
        this.movableTokens.delete(id);
        node.destroy({ children: true });
      }
    }
    // The ring and the reticle live on the overlay, so they do not travel with
    // the figure — every push that can move one has to redraw them.
    this.drawSelectionRing();
    this.drawGroupRings();
    // Obrys zaznaczonej scenerii ma stałą grubość na ekranie, jak pierścień
    // figury nad nim (27k).
    this.drawSceneSelectOutline();
    this.drawAimReticle();
    this.updateReach();
  }

  /**
   * Arms or disarms the ruler. While it is armed the viewport stops panning on
   * the left button — dragging measures instead — and the cursor says so.
   */
  setRulerMode(active: boolean): void {
    if (this.rulerMode === active) return;
    this.rulerMode = active;
    if (!active) this.finishRuler();
    this.applyMapCursor();
  }

  /** Arms the crosshair: the next click on a token reports it as a target. */
  setTargeting(active: boolean): void {
    if (this.targeting === active) return;
    this.targeting = active;
    if (!active) this.clearAim();
    this.applyMapCursor();
  }

  /** Arms the note tool: a click on empty map asks for a new pin. */
  setNotePlacing(active: boolean): void {
    if (this.notePlacing === active) return;
    this.notePlacing = active;
    this.applyMapCursor();
  }

  /** Uzbraja narzędzie miejsca startu: klik w mapę wyznacza punkt (11.09). */
  setSpawnPlacing(active: boolean): void {
    if (this.spawnPlacing === active) return;
    this.spawnPlacing = active;
    this.applyMapCursor();
  }

  /**
   * Arms or disarms fog painting. Like the ruler it takes the left button off
   * the viewport, because a drag has to mean one thing at a time.
   */
  setFogBrush(settings: FogBrushSettings): void {
    const wasArmed = this.fogBrush.armed;
    this.fogBrush = settings;
    if (wasArmed && !settings.armed) this.cancelFogGesture();
    this.applyMapCursor();
  }

  /**
   * Arms or disarms drawing. Like the ruler and the fog brush it takes the left
   * button off the viewport — a drag has to mean one thing at a time.
   */
  setDrawMode(settings: DrawSettings): void {
    const wasArmed = this.draw.armed;
    this.draw = settings;
    if (wasArmed && !settings.armed) this.cancelDrawGesture();
    this.applyMapCursor();
  }

  /**
   * The pointer says what the click will do. Tools come first — an armed brush
   * means the same thing everywhere — and the walk cursor fills the gap left
   * when none of them is holding the button (stage 16e): a hand over ground the
   * figure can reach, the „that way" arrow over the dark, and the barred circle
   * when the selected token may not move at all.
   */
  private applyMapCursor(): void {
    const canvas = this.app.canvas;
    if (!canvas) return;
    // The reticle outranks everything: it is the most specific thing the
    // pointer can be doing, and it is already filtered against every armed
    // tool (`aimTargetFor`).
    if (this.aimTokenId) {
      canvas.style.cursor = 'crosshair';
      return;
    }
    if (this.walkCursor && !this.targeting && !this.mapToolArmed) {
      canvas.style.cursor = this.walkCursor;
      return;
    }
    // Obiekt pod kursorem na uzbrojonej warstwie wygrywa z kształtem samego
    // narzędzia (etap 27k). To jedno załatwia „nie wiedziałem, że to jest
    // klikalne" — dłoń nad gniazdem mówi, że klik czegoś dotyczy, zanim
    // ktokolwiek przeczyta podpowiedź pod paskiem.
    if (this.sceneHovered) {
      canvas.style.cursor = 'pointer';
      return;
    }
    canvas.style.cursor = this.targeting
      ? 'crosshair'
      : this.fogBrush.armed
        ? 'crosshair'
        : this.draw.armed
          ? 'crosshair'
          : this.wall.armed
            ? 'crosshair'
            : this.cover.armed
              ? 'crosshair'
              : this.zone.armed
                ? 'crosshair'
                : this.light.armed
                  ? 'copy'
                  : this.netPoint.armed
                    ? 'copy'
                    : this.notePlacing
                      ? 'copy'
                      : this.spawnPlacing
                        ? 'copy'
                        : this.rulerMode
                          ? 'cell'
                          : '';
  }

  private cancelFogGesture(): void {
    if (!this.fogStroke && !this.fogRectStart) return;
    this.fogStroke = null;
    this.fogRectStart = null;
    this.viewport?.plugins.resume('drag');
    this.onFogPreview?.(null);
  }

  /** The shape the current gesture describes; null when nothing is usable yet. */
  private fogGestureShape(): FogShape | null {
    const { mode, radius } = this.fogBrush;
    if (this.fogStroke && this.fogStroke.length > 0) {
      return { kind: 'stroke', mode, radius, points: this.fogStroke.map((p) => ({ ...p })) };
    }
    const start = this.fogRectStart;
    const end = this.fogRectEnd;
    if (!start || !end) return null;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (width < 1 || height < 1) return null;
    return { kind: 'rect', mode, x, y, width, height };
  }

  private cancelDrawGesture(): void {
    if (!this.drawPoints && !this.drawStart) return;
    this.drawPoints = null;
    this.drawStart = null;
    this.drawEnd = null;
    this.drawPreview.clear();
    this.viewport?.plugins.resume('drag');
  }

  /** The shape the drawing gesture describes; null when nothing is usable yet. */
  private drawGestureShape(): DrawingShape | null {
    if (this.drawPoints && this.drawPoints.length > 0) {
      return { kind: 'path', points: this.drawPoints.map((point) => ({ ...point })) };
    }
    const start = this.drawStart;
    const end = this.drawEnd;
    if (!start || !end) return null;
    if (this.draw.tool === 'ellipse') {
      const radiusX = Math.abs(end.x - start.x) / 2;
      const radiusY = Math.abs(end.y - start.y) / 2;
      if (radiusX < 1 || radiusY < 1) return null;
      return {
        kind: 'ellipse',
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
        radiusX,
        radiusY,
      };
    }
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (width < 1 || height < 1) return null;
    return {
      kind: 'rect',
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width,
      height,
    };
  }

  /** Redraws the shape under the cursor on the overlay, above everything else. */
  private renderDrawPreview(): void {
    this.drawPreview.clear();
    const shape = this.drawGestureShape();
    if (!shape) return;
    drawDrawingShape(this.drawPreview, shape, this.draw.style);
    // A GM-layer shape is previewed dimmer, so „nobody else will see this" is
    // visible while it is being drawn rather than only afterwards.
    this.drawPreview.alpha = this.draw.gmOnly ? 0.65 : 0.9;
  }

  /** Drops the preview once the server has answered (ack or rejection). */
  clearDrawingPreview(): void {
    if (this.destroyed) return;
    this.drawPreview.clear();
  }

  /**
   * Reconciles the drawing layers with the store (diff by id).
   *
   * Do 27l rysunek był **niezmienny** — nie istniało `drawing:update` — więc
   * węzeł raz namalowany nigdy nie musiał się przemalować i wystarczyło pytać
   * o samo id. Karta rysunku to zmieniła: kolor, grubość, treść etykiety i
   * **warstwa** dają się teraz zmienić po fakcie, a poprawiona literówka
   * zostawała na mapie w starym brzmieniu (błąd znaleziony przy oględzinach
   * 24.08). Stąd odcisk: gdy się różni, węzeł powstaje od nowa — co przy okazji
   * jest jedynym poprawnym sposobem na przeniesienie go między warstwą MG
   * a wspólną, bo to jest zmiana rodzica, a nie właściwości.
   */
  setDrawings(drawings: DrawingView[]): void {
    if (this.destroyed) return;
    // Trzymamy listę, mimo że węzły są diffowane po id: od 27k warstwa rysunku
    // daje się zaznaczyć, a trafienie liczy geometria z `shared`, nie hit-test
    // Pixi (kreska ma szerokość jednego piksela ekranu przy oddaleniu 0,18×).
    this.lastDrawings = drawings;
    const seen = new Set<number>();

    for (const drawing of drawings) {
      seen.add(drawing.id);
      const signature = drawingSignature(drawing);
      const existing = this.drawNodes.get(drawing.id);
      if (existing) {
        if (this.drawSignatures.get(drawing.id) === signature) continue;
        this.drawNodes.delete(drawing.id);
        existing.destroy({ children: true });
      }
      this.drawSignatures.set(drawing.id, signature);
      const layer = drawing.gmOnly ? this.gmDrawLayer : this.drawLayer;
      let node: Container;
      if (drawing.shape.kind === 'text') {
        const label = createDrawingText(drawing.shape.text, drawing.shape.fontSize, drawing.style);
        label.position.set(drawing.shape.x, drawing.shape.y);
        node = label;
      } else {
        const graphics = new Graphics();
        drawDrawingShape(graphics, drawing.shape, drawing.style);
        node = graphics;
      }
      // The GM's own layer is dimmed a touch: at the table it has to be
      // instantly distinguishable from what the players are also looking at.
      node.alpha = drawing.gmOnly ? 0.75 : 1;
      this.drawNodes.set(drawing.id, node);
      layer.addChild(node);
    }

    for (const [id, node] of this.drawNodes) {
      if (seen.has(id)) continue;
      this.drawNodes.delete(id);
      this.drawSignatures.delete(id);
      node.destroy({ children: true });
    }
    this.refreshSceneSelectOutline('drawing');
  }

  /**
   * Pointer handling of the ruler. It lives on the viewport rather than on the
   * stage so the coordinates are already world-space, and it only takes over
   * the left button while the tool is armed.
   */
  private wireRuler(viewport: Viewport): void {
    viewport.eventMode = 'static';

    viewport.on('pointerdown', (event: FederatedPointerEvent) => {
      // Right button on bare map drops the selection (stage 16e) — the same
      // „never mind" every game of this shape uses, and it never competes with
      // the GM's token menu, which is a right click *on a figure*.
      if (event.button === 2 && !isTokenTarget(event.target)) {
        this.finishMarch(null);
        this.setSelection(null, 'dismiss');
        return;
      }
      if (event.button !== 0 || this.drag) return;
      const world = viewport.toWorld(event.global.x, event.global.y);
      const point = { x: Math.round(world.x), y: Math.round(world.y) };
      // Nowy gest zaczyna się z czystym kontem: flaga „ten klik już poszedł na
      // zaznaczenie" nie może przeżyć do następnego naciśnięcia (etap 27k).
      this.layerPickSpent = false;
      this.dragPick = null;

      // The rotation knob outranks the bare map but not an armed tool (stage
      // 27j): a click meant to paint fog must not turn a figure standing under
      // the brush, and the knob is a handle on the selection, not a tool of
      // its own.
      if (!this.mapToolArmed && this.grabFacingKnob(world)) return;

      // Uchwyty zaznaczonego obiektu (27l) wyprzedzają wszystkie narzędzia:
      // klik zaznaczył, więc drugi gest **z niego** znaczy „przesuń to", a nie
      // „narysuj obok". Rozstrzygnięcie MG z 24.08.
      if (this.grabSceneHandle(point)) return;

      // Ramka zaznaczenia (etap 35). Przed wszystkimi narzędziami rysowania,
      // ale **po** uchwytach: `Shift` na pustym tle jest wolny (panorama zostaje
      // na gołym lewym przycisku — rozstrzygnięcie MG z 05.09), a `Shift`+klik
      // bez przeciągnięcia dalej dokłada załamanie trasy marszu, bo `clicked`
      // nie pada po geście, który przekroczył próg przesunięcia.
      if (!this.mapToolArmed && event.shiftKey && !isTokenTarget(event.target)) {
        this.marquee = { start: point, end: { ...point } };
        viewport.plugins.pause('drag');
        this.drawGroupRings();
        return;
      }
      if (this.fogBrush.armed) {
        if (this.fogBrush.shape === 'brush') {
          this.fogStroke = [point];
        } else {
          this.fogRectStart = point;
          this.fogRectEnd = { ...point };
        }
        viewport.plugins.pause('drag');
        this.onFogPreview?.(this.fogGestureShape());
        return;
      }
      if (this.cover.armed) {
        // Warstwa rysowana przeciągnięciem (27k): gest zaczyna się normalnie,
        // a decyzja „to było zaznaczenie, nie nowy prostokąt" zapada dopiero
        // przy puszczeniu przycisku — inaczej nie dałoby się narysować osłony
        // nachodzącej na już stojącą.
        this.rememberDragPick(point);
        // A cover *is* an extent, so unlike a lamp it is dragged out: the GM
        // draws the car the size the car is.
        this.coverRectStart = point;
        this.coverRectEnd = { ...point };
        viewport.plugins.pause('drag');
        this.drawCoverLayer();
        return;
      }
      if (this.zone.armed) {
        this.rememberDragPick(point);
        // A defended zone is an extent, like a cover: the GM drags out the piece
        // of floor that is trapped.
        this.zoneRectStart = point;
        this.zoneRectEnd = { ...point };
        viewport.plugins.pause('drag');
        this.drawZoneLayer();
        return;
      }
      if (this.light.armed) {
        // A lamp is placed, not dragged: it has no extent of its own, only a
        // position and a reach set in the panel. Klik w istniejącą lampę ją
        // **zaznacza** (27k); przestrojenie do ustawień z paska przeszło na
        // dwuklik, bo pierwszy klik musi znaczyć to samo co na każdej warstwie.
        const hit = this.pickOnArmedLayer(point);
        if (hit) {
          this.takeScenePick(hit);
          return;
        }
        this.onLightPlace?.(point.x, point.y);
        return;
      }
      if (this.netPoint.armed) {
        // A socket is a spot on a wall — placed like a lamp, never dragged.
        const hit = this.pickOnArmedLayer(point);
        if (hit) {
          this.takeScenePick(hit);
          return;
        }
        this.onAccessPointPlace?.(point.x, point.y);
        return;
      }
      // Pinezka MG. Sama się stawia dopiero w `clicked`, więc tu jest wyłącznie
      // łapanie istniejącej — a `layerPickSpent` pilnuje, żeby po zaznaczeniu
      // nie wbić obok drugiej.
      if (this.notePlacing) {
        const hit = this.pickOnArmedLayer(point);
        if (hit) {
          this.takeScenePick(hit);
          return;
        }
      }
      if (this.wall.armed) {
        // „Końcówka rysuje, środek zaznacza" (decyzja MG z 23.08). Promień
        // trafienia w segment jest większy od promienia przyciągania do
        // narożnika, więc bez tego wyjątku nie dałoby się rozpocząć nowego
        // łańcucha dokładnie na rogu istniejącego muru. Trwający łańcuch ma
        // pierwszeństwo nad jednym i drugim: raz zaczętego obrysu pokoju nie
        // przerywa się zaznaczeniem.
        if (!this.wallPoints) {
          const onEndpoint = wallEndpointNear(this.lastWalls, point) !== null;
          if (!onEndpoint) {
            const hit = this.pickOnArmedLayer(point);
            if (hit) {
              this.takeScenePick(hit);
              return;
            }
          }
        }
        // Walls are traced click by click, not dragged: a floor plan is a
        // sequence of corners, and holding the button down for twenty metres
        // of corridor is neither accurate nor comfortable.
        const snapped = this.snapWall(point);
        const chain = this.wallPoints;
        if (!chain) {
          this.wallPoints = [snapped];
          this.wallCursor = { ...snapped };
          viewport.plugins.pause('drag');
          this.drawWallLayer();
          return;
        }
        const last = chain[chain.length - 1]!;
        // Clicking the same corner twice closes the chain — the same gesture
        // that ends a polygon in every drawing program.
        if (snapped.x === last.x && snapped.y === last.y) {
          this.finishWallChain();
          return;
        }
        chain.push(snapped);
        this.wallCursor = { ...snapped };
        this.drawWallLayer();
        return;
      }
      if (this.draw.armed) {
        // Text is placed, not dragged: the click only says where, the words
        // come from a dialog — więc na tej jednej odmianie narzędzia
        // zaznaczenie musi zapaść od razu, jak przy lampie.
        if (this.draw.tool === 'text') {
          const hit = this.pickOnArmedLayer(point);
          if (hit) {
            this.takeScenePick(hit);
            return;
          }
          this.onDrawingTextPlace?.(point.x, point.y);
          return;
        }
        this.rememberDragPick(point);
        if (this.draw.tool === 'pencil') {
          this.drawPoints = [point];
        } else if (this.draw.tool === 'line') {
          // A straight line is a two-point polyline; the second end follows
          // the pointer, exactly like the ruler's.
          this.drawPoints = [point, { ...point }];
        } else {
          this.drawStart = point;
          this.drawEnd = { ...point };
        }
        viewport.plugins.pause('drag');
        this.renderDrawPreview();
        return;
      }
      if (!this.rulerMode) return;
      // Two points from the start: the second one follows the pointer.
      this.rulerPoints = [point, { ...point }];
      viewport.plugins.pause('drag');
      this.emitRuler();
    });

    viewport.on('pointermove', (event: FederatedPointerEvent) => {
      const world = viewport.toWorld(event.global.x, event.global.y);
      const point = { x: Math.round(world.x), y: Math.round(world.y) };

      // Who is under the pointer decides everything below it (stage 16f): a
      // token the selected figure can aim at gets the reticle and suppresses
      // the route, while empty ground keeps behaving exactly as in 16e — that
      // is what „bez wchodzenia w tryb" means in code.
      this.updateAim(tokenNodeOf(event.target), event);

      // The route follows the cursor before any tool gets a say: it is not a
      // gesture, it is what the map looks like while a figure is selected, and
      // the method itself stands down when a tool is armed.
      //
      // …a od 35 stoi też pod `Alt`, bo ten klawisz zabrał temu kliknięciu
      // znaczenie: z `Alt` klik w podłogę pinguje, a nie wysyła figurę w drogę.
      // Ślady butów obiecywałyby marsz, którego ten gest nie zrobi (znalezione
      // przy oględzinach 05.09).
      this.pingArmed = event.altKey === true;
      this.trackWalkHover(point);
      // …and the explosion template follows it in the same breath, for the same
      // reason: with a grenade in hand it *is* what the map looks like.
      this.trackAreaHover(point);
      // Przeciąganie uchwytu wyprzedza wszystko poniżej (27l): to jest gest,
      // a nie stan mapy, i trwa aż do puszczenia przycisku.
      if (this.sceneDrag) {
        this.moveSceneHandle(point, event.ctrlKey || event.metaKey);
        return;
      }

      // Obrys pod kursorem na uzbrojonej warstwie (27k). Tylko poza trwającym
      // gestem: w połowie ciągnięcia prostokąta pytanie „co tu leży" nie ma
      // adresata, a pickowanie na każdym `pointermove` kosztowałoby za darmo.
      if (!this.gestureInFlight()) {
        this.setSceneHover(this.armedLayerKind() ? this.pickOnArmedLayer(point) : null);
        this.applyHandleCursor(point);
      }

      if (this.fogStroke) {
        const last = this.fogStroke[this.fogStroke.length - 1]!;
        // Thin the stroke as it is drawn: samples closer than a fifth of the
        // brush add nothing the round caps do not already cover, and the cap
        // on stroke length is what keeps a slow drag from being rejected.
        const minStep = Math.max(4, this.fogBrush.radius / 5);
        if (Math.hypot(point.x - last.x, point.y - last.y) >= minStep) {
          if (this.fogStroke.length < FOG_STROKE_MAX_POINTS) this.fogStroke.push(point);
          this.onFogPreview?.(this.fogGestureShape());
        }
        return;
      }
      if (this.fogRectStart) {
        this.fogRectEnd = point;
        this.onFogPreview?.(this.fogGestureShape());
        return;
      }
      if (this.coverRectStart) {
        this.coverRectEnd = point;
        this.drawCoverLayer();
        return;
      }
      if (this.zoneRectStart) {
        this.zoneRectEnd = point;
        this.drawZoneLayer();
        return;
      }

      if (this.wallPoints) {
        const snapped = this.snapWall(point);
        const cursor = this.wallCursor;
        if (!cursor || cursor.x !== snapped.x || cursor.y !== snapped.y) {
          this.wallCursor = snapped;
          this.drawWallLayer();
        }
        return;
      }

      if (this.drawPoints) {
        if (this.draw.tool === 'line') {
          // The line tool keeps two points: the anchor and the pointer.
          this.drawPoints[1] = point;
        } else {
          const last = this.drawPoints[this.drawPoints.length - 1]!;
          // Thin the stroke as it is drawn; what survives this still goes
          // through Douglas–Peucker before it is sent.
          if (Math.hypot(point.x - last.x, point.y - last.y) < DRAW_SAMPLE_STEP) return;
          if (this.drawPoints.length < DRAWING_PATH_MAX_POINTS) this.drawPoints.push(point);
        }
        this.renderDrawPreview();
        return;
      }
      if (this.drawStart) {
        this.drawEnd = point;
        this.renderDrawPreview();
        return;
      }

      if (this.marquee) {
        this.marquee.end = point;
        this.drawGroupRings();
        return;
      }

      const points = this.rulerPoints;
      if (!points) return;
      points[points.length - 1] = point;
      this.emitRuler();
    });

    const end = () => {
      if (this.marquee) {
        const marquee = this.marquee;
        const dragged =
          Math.abs(marquee.end.x - marquee.start.x) >= DRAG_THRESHOLD_PX ||
          Math.abs(marquee.end.y - marquee.start.y) >= DRAG_THRESHOLD_PX;
        const picked = dragged ? this.tokensInMarquee() : null;
        this.marquee = null;
        this.viewport?.plugins.resume('drag');
        this.drawGroupRings();
        // Gest, który nie ruszył się z miejsca, **nie jest ramką** — to zwykły
        // `Shift`+klik, czyli załamanie trasy marszu z 16e, i `clicked` zaraz
        // je dołoży. Bez tego progu każde takie kliknięcie zdejmowałoby przy
        // okazji zaznaczenie grupowe.
        if (picked === null) return;
        // Pusta ramka też coś znaczy: „nie ci" — zdejmuje zaznaczenie, zamiast
        // zostawiać pod spodem poprzednie sześć figur.
        this.onGroupSelect?.(picked);
        return;
      }
      // Uchwyt puszczony (27l) — przed wszystkimi gestami rysowania, bo żaden
      // z nich nie mógł się zacząć: chwyt uchwytu kończy `pointerdown`.
      if (this.sceneDrag) {
        this.releaseSceneHandle();
        return;
      }
      if (this.coverRectStart) {
        const rect = this.coverGestureRect();
        const at = this.coverRectEnd;
        this.coverRectStart = null;
        this.coverRectEnd = null;
        this.viewport?.plugins.resume('drag');
        this.drawCoverLayer();
        if (this.tapPick(at)) return;
        if (rect) this.onCoverRect?.(rect);
        return;
      }
      if (this.zoneRectStart) {
        const rect = this.zoneGestureRect();
        const at = this.zoneRectEnd;
        this.zoneRectStart = null;
        this.zoneRectEnd = null;
        this.viewport?.plugins.resume('drag');
        this.drawZoneLayer();
        if (this.tapPick(at)) return;
        if (rect) this.onZoneRect?.(rect);
        return;
      }
      if (this.fogStroke || this.fogRectStart) {
        const shape = this.fogGestureShape();
        this.fogStroke = null;
        this.fogRectStart = null;
        this.fogRectEnd = null;
        this.viewport?.plugins.resume('drag');
        this.onFogPreview?.(null);
        if (shape) this.onFogPaint?.(shape);
        return;
      }
      if (this.drawPoints || this.drawStart) {
        let shape = this.drawGestureShape();
        // Freehand arrives at pointer rate; simplifying here — before the wire,
        // not after — is what keeps one stroke a single small row.
        if (shape?.kind === 'path' && this.draw.tool === 'pencil') {
          shape = { kind: 'path', points: simplifyPath(shape.points, DRAW_SIMPLIFY_TOLERANCE) };
        }
        const at = this.drawEnd ?? this.drawPoints?.[this.drawPoints.length - 1] ?? null;
        this.drawPoints = null;
        this.drawStart = null;
        this.drawEnd = null;
        this.viewport?.plugins.resume('drag');
        if (this.tapPick(at)) {
          this.drawPreview.clear();
          return;
        }
        // The preview stays on screen until the server answers, so a stroke
        // never blinks out of existence while the ack is in flight.
        if (shape) this.onDrawingCreate?.(shape);
        else this.drawPreview.clear();
        return;
      }
      if (this.rulerPoints) this.finishRuler();
    };
    viewport.on('pointerup', end);
    viewport.on('pointerupoutside', end);
  }

  /**
   * Drops a waypoint at the pointer, turning the measurement into a polyline.
   * Called from the map component on Space, the way Foundry uses Ctrl.
   */
  addRulerWaypoint(): void {
    const points = this.rulerPoints;
    if (!points || points.length >= 24) return;
    const last = points[points.length - 1]!;
    points.push({ ...last });
    this.emitRuler();
  }

  private finishRuler(): void {
    this.rulerPoints = null;
    this.viewport?.plugins.resume('drag');
    this.onRulerChange?.(null);
  }

  private emitRuler(): void {
    if (this.rulerPoints) this.onRulerChange?.(this.rulerPoints.map((p) => ({ ...p })));
  }

  /**
   * World units per screen pixel. Overlay text and line widths are multiplied
   * by it so a label stays the same size on screen at any zoom — a map drawn
   * at 4096 px is usually viewed at 0.18×, where an unscaled 18 px label would
   * render three pixels tall and be unreadable.
   */
  private overlayScale(): number {
    const scale = this.viewport?.scale.x ?? 1;
    return scale > 0 ? 1 / scale : 1;
  }

  /** Redraws every measurement on the map — the local one plus the remote ones. */
  setRulers(lines: RulerLine[]): void {
    if (this.destroyed) return;
    this.lastRulers = lines;
    this.rulerGraphics.clear();
    for (const text of this.overlayTexts) text.destroy();
    this.overlayTexts.length = 0;
    const scene = this.scene;
    if (!scene) return;
    const k = this.overlayScale();

    for (const line of lines) {
      if (line.points.length < 2) continue;
      const first = line.points[0]!;
      this.rulerGraphics.moveTo(first.x, first.y);
      for (const point of line.points.slice(1)) this.rulerGraphics.lineTo(point.x, point.y);
      this.rulerGraphics.stroke({ color: line.color, width: 3 * k, alpha: 0.9 });
      for (const point of line.points) {
        this.rulerGraphics.circle(point.x, point.y, 5 * k).fill({ color: line.color, alpha: 0.9 });
      }

      const metres = polylineMetres(line.points, scene);
      const squares = squaresForDistance(metres, scene);
      const end = line.points[line.points.length - 1]!;
      const label = new Text({
        text: `${line.userName ? `${line.userName}: ` : ''}${formatMetres(metres)} · ${formatSquares(squares)}`,
        style: {
          fontFamily: 'system-ui, sans-serif',
          fontSize: 18,
          fill: 0xffffff,
          stroke: { color: 0x000000, width: 4 },
        },
      });
      label.scale.set(k);
      label.position.set(end.x + 12 * k, end.y - 28 * k);
      this.overlayLayer.addChild(label);
      this.overlayTexts.push(label);
    }
  }

  /**
   * How far the token being dragged may still go (stage 14c).
   *
   * The circle it draws is explicitly *orientation*: it measures straight-line
   * reach, while the server charges the length of the route — so walking round
   * a corner runs out sooner than the ring suggests, and the ring is drawn
   * dashed and labelled to admit it. Walls are not in it at all: they never
   * leave the server, which is the whole reason the truth lives there.
   */
  setMoveAllowance(allowance: MoveAllowance | null): void {
    if (this.destroyed) return;
    this.moveAllowance = allowance;
    this.drawMoveOverlay();
    this.updateReach();
  }

  /** Metres of the drag in progress, or null when nothing is being dragged. */
  private draggedMetres(): number | null {
    const drag = this.drag;
    const scene = this.scene;
    if (!drag || !drag.moved || !scene) return null;
    const half = (drag.node.token.size * scene.grid.sizePx) / 2;
    const centres = [...drag.path, { x: drag.lastX, y: drag.lastY }].map((point) => ({
      x: point.x + half,
      y: point.y + half,
    }));
    return polylineMetres(centres, scene);
  }

  /**
   * Paints the reach circle and, while a token is moving, the trail behind it
   * with a running metre count. The trail turns red the moment the route costs
   * more than the tracker says is left — the drop would snap back, and finding
   * that out before letting go is the difference between a budget and a trap.
   */
  private drawMoveOverlay(): void {
    this.moveGraphics.clear();
    this.moveText?.destroy();
    this.moveText = null;
    const scene = this.scene;
    const allowance = this.moveAllowance;
    if (!scene) return;

    const k = this.overlayScale();
    const drag = this.drag;
    const metres = this.draggedMetres();
    const perMetre = scene.grid.sizePx / (scene.metersPerSquare || 2);
    const factor = allowance && allowance.costFactor > 0 ? allowance.costFactor : 1;
    const spent = metres === null ? 0 : metres * factor;
    const over = allowance !== null && spent > allowance.metresLeft + 0.05;

    // The reach circle sits on the token that owns the budget — while it is
    // being dragged, on the position it is being dragged *from*, because that
    // is where the metres are measured from.
    if (allowance && allowance.metresLeft > 0) {
      const node = this.tokenNodes.get(allowance.tokenId);
      if (node) {
        const origin =
          drag?.node === node
            ? { x: drag.path[0]?.x ?? node.x, y: drag.path[0]?.y ?? node.y }
            : { x: node.x, y: node.y };
        const half = (node.token.size * scene.grid.sizePx) / 2;
        const radius = (allowance.metresLeft / factor) * perMetre;
        this.moveGraphics
          .circle(origin.x + half, origin.y + half, radius)
          .stroke({ color: 0x4ade80, width: 1.5 * k, alpha: 0.5 });
      }
    }

    if (!drag || metres === null) return;
    const half = (drag.node.token.size * scene.grid.sizePx) / 2;
    const trail = [...drag.path, { x: drag.lastX, y: drag.lastY }];
    const first = trail[0]!;
    this.moveGraphics.moveTo(first.x + half, first.y + half);
    for (const point of trail.slice(1)) {
      this.moveGraphics.lineTo(point.x + half, point.y + half);
    }
    this.moveGraphics.stroke({
      color: over ? 0xf87171 : 0x4ade80,
      width: 3 * k,
      alpha: 0.85,
      cap: 'round',
      join: 'round',
    });

    const label = new Text({
      text:
        allowance === null
          ? formatMetres(metres)
          : `${formatMetres(spent)} / ${formatMetres(allowance.metresLeft)}`,
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 18,
        fill: over ? 0xfca5a5 : 0xbbf7d0,
        stroke: { color: 0x0b1220, width: 4 },
      },
    });
    label.scale.set(k);
    label.position.set(drag.lastX + half + 12 * k, drag.lastY + half - 30 * k);
    this.overlayLayer.addChild(label);
    this.moveText = label;
  }

  /**
   * The token this viewer steers (stage 16e). Only ever a token they may move —
   * the caller decides that, because „may I move this?" is an ownership
   * question and this file does not know who is logged in.
   */
  setSelection(tokenId: string | null, reason: SelectionChange = 'pick'): void {
    if (this.destroyed) return;
    // Two reasons are reported even when nothing was steered, because the rail
    // outlives the selection: „never mind" has a figure to dismiss precisely
    // when nothing is selected (the rail shows one the user never clicked), and
    // a scene swap has to reach the rail's per-scene memory whether or not a
    // figure happened to be under the ring. `pick` and `gone` are idempotent.
    if (this.selectedTokenId === tokenId) {
      if (reason === 'dismiss' || reason === 'scene') this.onSelectionChange?.(tokenId, reason);
      return;
    }
    this.applySelection(tokenId);
    this.onSelectionChange?.(tokenId, reason);
  }

  /**
   * Wyrównuje pierścień do figury, którą store **już** uznał za prowadzoną
   * (etap 35) — bez zgłaszania zmiany z powrotem.
   *
   * Potrzebne dokładnie w jednym miejscu i z jednego powodu: zaznaczenie
   * grupowe wybiera kotwicę **w store**, bo tylko on wie, co ostatecznie
   * wyszło z `Shift`+kliknięcia. Gdyby wyrównanie szło przez `setSelection`,
   * odesłałoby `onSelectionChange` → `select(anchor)` → a ten świadomie zeruje
   * grupę (patrz `selectionStore`), czyli ramka kasowałaby sama siebie.
   *
   * Znalezione przy oględzinach 05.09: po ramce lewy panel opisywał kotwicę,
   * a mapa nie miała pierścienia i klik w podłogę nikogo nie wysyłał w drogę.
   */
  syncSteering(tokenId: string | null): void {
    if (this.destroyed || this.selectedTokenId === tokenId) return;
    this.applySelection(tokenId);
  }

  /** Wspólny środek obu dróg: co się dzieje z mapą, gdy zmienia się prowadzona figura. */
  private applySelection(tokenId: string | null): void {
    this.selectedTokenId = tokenId;
    this.walkWaypoints = [];
    this.walkHover = null;
    // The reticle belongs to whoever was doing the aiming; a new figure has
    // not raised a weapon yet.
    this.clearAim();
    this.drawSelectionRing();
    this.drawWalkPreview();
    this.updateReach();
    this.applyMapCursor();
  }

  /**
   * Które figury są zaznaczone grupowo (etap 35) — lustro `selectionStore`.
   *
   * Renderer tego stanu **nie tworzy**: ramka i `Shift`+klik zgłaszają się
   * callbackiem, store rozstrzyga, a tutaj wraca gotowa lista. Ten sam układ,
   * co przy pojedynczym zaznaczeniu — dzięki niemu `Ctrl+A` z klawiatury i
   * ramka z myszy dochodzą do tego samego miejsca jedną drogą.
   */
  setGroupSelection(tokenIds: readonly string[]): void {
    if (this.destroyed) return;
    this.groupTokenIds = [...tokenIds];
    this.drawGroupRings();
  }

  /**
   * `Ctrl+A`: bierze wszystkie figury, którymi ten widz może sterować.
   *
   * Ten sam filtr, którym sieje ramka (`movableTokens`), i to jest cały powód,
   * dla którego mieszka tutaj, a nie w `MapArea`: dwie listy „co wolno wziąć"
   * rozjechałyby się przy pierwszej zmianie reguł własności.
   */
  selectAllSteerable(): void {
    if (this.destroyed) return;
    const picked: string[] = [];
    for (const [id, node] of this.tokenNodes) {
      if (node.destroyed) continue;
      if (this.movableTokens.get(id) === false) continue;
      picked.push(id);
    }
    this.onGroupSelect?.(picked);
  }

  /** Czy wolno teraz ciągnąć całą grupę naraz (poza walką tak, w walce nie). */
  setGroupDragAllowed(allowed: boolean): void {
    this.groupDragAllowed = allowed;
  }

  /**
   * Obwódki zaznaczonych figur i ramka, którą się je bierze.
   *
   * Ciągła i niebieska, w odróżnieniu od białej przerywanej wokół figury
   * **prowadzonej**: na tej jednej, która jest jednym i drugim, obie muszą dać
   * się odczytać naraz — dokładnie tak, jak pierścień właściciela i bursztynowa
   * poświata tury czytają się obok siebie od 27h.
   */
  private drawGroupRings(): void {
    this.groupGraphics.clear();
    const scene = this.scene;
    if (!scene) return;
    const k = this.overlayScale();
    for (const id of this.groupTokenIds) {
      const node = this.tokenNodes.get(id);
      if (!node || node.destroyed) continue;
      const half = (node.token.size * scene.grid.sizePx) / 2;
      this.groupGraphics
        .circle(node.x + half, node.y + half, half + 8 * k)
        .stroke({ color: GROUP_RING_COLOR, width: 3 * k, alpha: 0.9 });
    }
    const marquee = this.marquee;
    if (!marquee) return;
    const x = Math.min(marquee.start.x, marquee.end.x);
    const y = Math.min(marquee.start.y, marquee.end.y);
    const width = Math.abs(marquee.end.x - marquee.start.x);
    const height = Math.abs(marquee.end.y - marquee.start.y);
    this.groupGraphics
      .rect(x, y, width, height)
      .fill({ color: GROUP_RING_COLOR, alpha: 0.12 })
      .rect(x, y, width, height)
      .stroke({ color: GROUP_RING_COLOR, width: 2 * k, alpha: 0.9 });
  }

  /** Figury, które stanęły w ramce — tylko te, którymi ten widz może sterować. */
  private tokensInMarquee(): string[] {
    const scene = this.scene;
    const marquee = this.marquee;
    if (!scene || !marquee) return [];
    const left = Math.min(marquee.start.x, marquee.end.x);
    const right = Math.max(marquee.start.x, marquee.end.x);
    const top = Math.min(marquee.start.y, marquee.end.y);
    const bottom = Math.max(marquee.start.y, marquee.end.y);
    const picked: string[] = [];
    for (const [id, node] of this.tokenNodes) {
      if (node.destroyed) continue;
      // Filtr, na którym stoi całe „gracz dostaje pod kontrolę wyłącznie swoje
      // figury": ramka nie bierze niczego, czego ten widz i tak nie ruszy.
      if (this.movableTokens.get(id) === false) continue;
      const extent = node.token.size * scene.grid.sizePx;
      // Przecięcie, nie zawieranie: ganger dwa razy większy od ramki ma się
      // złapać, a przy zoomie stołu trafienie w całą figurę bywa trudne.
      if (node.x > right || node.x + extent < left) continue;
      if (node.y > bottom || node.y + extent < top) continue;
      picked.push(id);
    }
    return picked;
  }

  /* ── Ping (etap 35) ──────────────────────────────────────────────────── */

  /**
   * Kółko z imieniem w tym miejscu, gasnące samo po `MAP_PING_TTL_MS`.
   *
   * Rysowane w pikselach ekranu (`overlayScale`), jak każda inna nakładka: przy
   * zoomie stołu ping o światowym promieniu byłby kropką, a na przybliżonej
   * mapie zasłoniłby pół pokoju.
   */
  addPing(x: number, y: number, userName: string): void {
    if (this.destroyed || !this.scene) return;
    const node = new Container();
    const ring = new Graphics();
    node.addChild(ring);
    const label = new Text({
      text: userName,
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 16,
        fill: PING_COLOR,
        stroke: { color: 0x0b1220, width: 4 },
      },
    });
    label.anchor.set(0.5, 1);
    node.addChild(label);
    node.position.set(x, y);
    this.pingLayer.addChild(node);
    this.pings.push({ node, ring, x, y, at: performance.now() });
  }

  /**
   * Przesuwa widok na ten punkt — ping MG w wariancie „przyciągnij widok".
   *
   * Bez animacji i bez zmiany zoomu: to jest gest „popatrz tutaj", a nie
   * podróż. Kto oglądał inny róg mapy, ma zobaczyć wskazane miejsce w tej samej
   * skali, w której pracował.
   */
  pullViewTo(x: number, y: number): void {
    if (this.destroyed) return;
    this.viewport?.moveCenter(x, y);
    this.refreshOverlays();
  }

  /**
   * Zamyka kamerę w granicach mapy albo ją wypuszcza (decyzja MG, 11.09).
   *
   * Zamknięta jest u **gracza**: ani przeciągnięciem, ani oddaleniem nie wyjdzie
   * poza obraz — ekran zawsze leży w całości wewnątrz mapy. MG zostaje
   * z marginesem, bo ścianę albo osłonę na samej krawędzi rysuje się, mając
   * dokąd wyjechać.
   */
  setCameraLocked(locked: boolean): void {
    if (this.cameraLocked === locked) return;
    this.cameraLocked = locked;
    this.applyCameraBounds();
  }

  /**
   * Przykłada granice przesuwania i oddalania do bieżącej sceny.
   *
   * Wołane przy każdej zmianie sceny **i przy zmianie rozmiaru okna**: dolna
   * granica zbliżenia to `coverZoom`, a ta zależy od kształtu płótna — bez tego
   * rozciągnięte okno odsłania czerń przy niezmienionym zoomie.
   *
   * Uwaga na `clampZoom`: wtyczka pixi-viewport czyta **albo** `minWidth`/
   * `maxWidth`, **albo** `minScale`/`maxScale` (pierwsza para wygrywa i drugiej
   * już nie patrzy), więc granica „nie oddalaj się poniżej pokrycia" musi być
   * policzona tutaj i podana jako skala.
   */
  private applyCameraBounds(): void {
    const viewport = this.viewport;
    const scene = this.scene;
    if (!viewport || !scene || this.destroyed) return;
    const margin = this.cameraLocked ? 0 : PAN_MARGIN;
    viewport.clamp({
      left: -scene.width * margin,
      top: -scene.height * margin,
      right: scene.width * (1 + margin),
      bottom: scene.height * (1 + margin),
      underflow: 'center',
    });
    const floor = this.cameraLocked
      ? coverZoom(scene, { width: viewport.screenWidth, height: viewport.screenHeight })
      : MIN_ZOOM;
    viewport.clampZoom({ minScale: Math.min(floor, MAX_ZOOM), maxScale: MAX_ZOOM });
  }

  /**
   * Kadr startowy gracza: przybliżenie na osiem kratek wokół punktu.
   *
   * Osobne od `fitScene`, bo mówi co innego — `fitScene` odpowiada „gdzie jest
   * ta mapa", a to „gdzie jesteś ty". Wołane raz na wejście na scenę; dalej
   * widok należy do gracza.
   */
  frameAround(point: ScenePoint, squaresAround = PLAYER_VIEW_SQUARES_AROUND): void {
    const viewport = this.viewport;
    const scene = this.scene;
    if (!viewport || !scene || this.destroyed) return;
    // Płótno bez rozmiaru to układ strony, który jeszcze nie usiadł — kadr
    // policzony z zera nie miałby z czego wyjść.
    if (viewport.screenWidth <= 0 || viewport.screenHeight <= 0) return;
    const shot = startCamera(
      scene,
      { width: viewport.screenWidth, height: viewport.screenHeight },
      point,
      squaresAround,
    );
    viewport.setZoom(shot.zoom, true);
    viewport.moveCenter(shot.x, shot.y);
    this.refreshOverlays();
  }

  private readonly tickPing = (): void => {
    if (this.pings.length === 0) return;
    const now = performance.now();
    const k = this.overlayScale();
    for (let index = this.pings.length - 1; index >= 0; index--) {
      const ping = this.pings[index]!;
      const progress = (now - ping.at) / MAP_PING_TTL_MS;
      if (progress >= 1) {
        ping.node.destroy({ children: true });
        this.pings.splice(index, 1);
        continue;
      }
      // Trzy fale zamiast jednej: jedno kółko na dwusekundowym zaniku ginie
      // w tle mapy, trzy rozchodzące się czyta się jak puknięcie w stół.
      ping.ring.clear();
      for (let wave = 0; wave < 3; wave++) {
        const phase = (progress * 3 - wave) % 3;
        if (phase < 0 || phase > 1) continue;
        ping.ring
          .circle(0, 0, (10 + phase * 34) * k)
          .stroke({ color: PING_COLOR, width: 3 * k, alpha: (1 - phase) * (1 - progress) });
      }
      ping.node.scale.set(1);
      const label = ping.node.children[1] as Text | undefined;
      if (label) {
        label.scale.set(k);
        label.position.set(0, -18 * k);
        label.alpha = 1 - progress;
      }
    }
  };

  /**
   * Draws the selection ring around the steered figure, in screen-constant
   * weight. Dashed, so it cannot be mistaken for the solid owner ring under it
   * or the amber turn halo outside it — on a token that is yours, selected and
   * acting, all three have to be readable at once.
   */
  private drawSelectionRing(): void {
    this.selectGraphics.clear();
    const scene = this.scene;
    const node = this.selectedTokenId ? this.tokenNodes.get(this.selectedTokenId) : undefined;
    if (!scene || !node || node.destroyed) return;
    const half = (node.token.size * scene.grid.sizePx) / 2;
    const k = this.overlayScale();
    // Outside the portrait and outside the turn halo: at table zoom the token
    // is a dozen screen pixels across, and anything drawn *inside* it lands on
    // the artwork instead of round it.
    const radius = half + 8 * k;
    const arc = Math.PI / SELECT_RING_DASHES;
    for (let dash = 0; dash < SELECT_RING_DASHES; dash++) {
      const start = dash * arc * 2;
      this.selectGraphics.arc(node.x + half, node.y + half, radius, start, start + arc);
      this.selectGraphics.stroke({ color: 0xffffff, width: 2.5 * k, alpha: 0.95 });
    }

    // The rotation knob (stage 27j). On the ring rather than in a menu, because
    // turning is a thing you do *while looking at the map* — and on the overlay
    // rather than on the token, so it stays a thumb-sized target at every zoom.
    const knob = this.facingKnob();
    if (!knob) return;
    const grabbed = this.rotating !== null;
    this.selectGraphics
      .moveTo(node.x + half, node.y + half)
      .lineTo(knob.x, knob.y)
      .stroke({ color: 0xffffff, width: 1.5 * k, alpha: grabbed ? 0.55 : 0.25 })
      .circle(knob.x, knob.y, 6 * k)
      .fill({ color: grabbed ? 0xfacc15 : 0xe2e8f0, alpha: 0.95 })
      .circle(knob.x, knob.y, 6 * k)
      .stroke({ color: 0x0b1220, width: 1.5 * k, alpha: 0.9 });
  }

  // ─────────────── sceneria: zaznaczanie, obrys i dwuklik (27k) ───────────────

  /**
   * Która warstwa jest uzbrojona — a więc co wolno pod nią złapać.
   *
   * To jest **cała** reguła „warstwa" z etapu 27k, zapisana w jednym miejscu:
   * narzędzie świateł nie zaznaczy osłony, choćby leżała dokładnie pod
   * kursorem. Wskaźnik (`pointer`) nie łapie niczego i to też jest decyzja —
   * klik w puste pole przy zaznaczonej figurze jest rozkazem marszu, a warstwa
   * scenerii pod wskaźnikiem odbierałaby ten klik w połowie sesji walki.
   */
  private armedLayerKind(): SceneObjectKind | null {
    if (this.wall.armed) return 'wall';
    if (this.cover.armed) return 'cover';
    if (this.zone.armed) return 'zone';
    if (this.light.armed) return 'light';
    if (this.netPoint.armed) return 'netpoint';
    if (this.notePlacing) return 'note';
    if (this.draw.armed) return 'drawing';
    return null;
  }

  /** Co leży pod tym punktem na uzbrojonej warstwie (i tylko na niej). */
  private pickOnArmedLayer(point: ScenePoint): SceneObjectRef | null {
    const kind = this.armedLayerKind();
    if (!kind) return null;
    const gridSizePx = this.scene?.grid.sizePx ?? 100;
    return pickSceneObject(
      point,
      {
        wall: { walls: this.lastWalls },
        cover: { covers: this.lastCovers },
        zone: { zones: this.lastZones },
        light: { lights: this.lastLights },
        netpoint: { netpoints: this.lastAccessPoints },
        note: { notes: this.lastNotes },
        drawing: { drawings: this.lastDrawings },
      }[kind],
      {
        gridSizePx,
        // Gracz sięga przez cudzą kreskę do własnej pod nią — ta sama reguła,
        // którą serwer i tak wymusza przy usuwaniu.
        canPickDrawing: (drawing) =>
          this.viewerIsGm || (this.viewerId !== null && drawing.authorId === this.viewerId),
      },
    );
  }

  /**
   * Lustro `sceneSelectionStore`: obrys idzie za tym, co wybrał React.
   *
   * Renderer trzyma własną kopię zamiast czytać store w pętli rysowania, bo
   * obrys przerysowuje się przy każdej zmianie powiększenia — tak samo jak
   * pierścień zaznaczonej figury.
   */
  setSceneSelection(ref: SceneObjectRef | null): void {
    if (this.destroyed) return;
    if (sameRef(this.sceneSelected, ref)) return;
    this.sceneSelected = ref;
    this.drawSceneSelectOutline();
  }

  /** Podświetlenie pod kursorem — zgłaszane na zewnątrz, żeby pasek mógł mówić. */
  private setSceneHover(ref: SceneObjectRef | null): void {
    if (sameRef(this.sceneHovered, ref)) return;
    this.sceneHovered = ref;
    this.drawSceneSelectOutline();
    this.applyMapCursor();
    this.onSceneHover?.(ref);
  }

  /**
   * Klik na uzbrojonej warstwie: zaznacza, a przy drugim szybkim kliknięciu w
   * to samo — otwiera kartę.
   *
   * Zwraca `true`, gdy klik został zużyty. Wywołujący ma wtedy **nie** tworzyć
   * niczego nowego, bo gest znaczył „ten obiekt", a nie „tutaj".
   */
  private takeScenePick(ref: SceneObjectRef): boolean {
    const now = performance.now();
    const previous = this.lastScenePick;
    this.lastScenePick = { ref, at: now };
    this.layerPickSpent = true;
    if (previous && sameRef(previous.ref, ref) && now - previous.at < DOUBLE_CLICK_MS) {
      // Dwuklik nie zdejmuje zaznaczenia: karta otwiera się nad obiektem, który
      // nadal jest wybrany, więc `Delete` po jej zamknięciu robi to samo.
      this.onSceneActivate?.(ref);
      return true;
    }
    this.setSceneSelection(ref);
    this.onSceneSelect?.(ref);
    return true;
  }

  /** Czy właśnie trwa gest rysowania — prostokąt, kształt albo łańcuch ścian. */
  private gestureInFlight(): boolean {
    return (
      this.coverRectStart !== null ||
      this.zoneRectStart !== null ||
      this.drawPoints !== null ||
      this.drawStart !== null ||
      this.wallPoints !== null ||
      this.fogStroke !== null ||
      this.fogRectStart !== null
    );
  }

  /**
   * Zapamiętuje, co leżało pod początkiem gestu na warstwie rysowanej
   * przeciągnięciem (osłona, strefa, kształt rysunku).
   */
  private rememberDragPick(point: ScenePoint): void {
    const hit = this.pickOnArmedLayer(point);
    this.dragPick = hit ? { ref: hit, at: point } : null;
  }

  /**
   * Czy ten gest był krótkim kliknięciem w obiekt, a nie rysowaniem?
   *
   * Próg liczony w pikselach **ekranu**, nie sceny: przy oddaleniu 0,18× ta
   * sama drobna nieuwaga ręki to trzydzieści kilka pikseli mapy, więc stały
   * próg w jednostkach świata robiłby z każdego kliknięcia przeciągnięcie.
   */
  private tapPick(at: ScenePoint | null): boolean {
    const pending = this.dragPick;
    this.dragPick = null;
    if (!pending) return false;
    const slop = TAP_SLOP_PX * this.overlayScale();
    if (at && Math.hypot(at.x - pending.at.x, at.y - pending.at.y) > slop) return false;
    return this.takeScenePick(pending.ref);
  }

  /**
   * Obrys zaznaczenia i podświetlenie pod kursorem.
   *
   * Jedna ścieżka `Graphics` na oba stany, bo nigdy nie ma ich więcej niż dwa,
   * a osobna warstwa na najechanie kosztowałaby tyle samo rysowania i jeden
   * dodatkowy powód do rozjechania się. Grubość liczona `overlayScale()` —
   * obrys ma być tak samo widoczny przy każdym powiększeniu, jak pierścień
   * figury obok niego.
   */
  private drawSceneSelectOutline(): void {
    if (this.destroyed) return;
    const g = this.sceneSelectGraphics;
    g.clear();
    const k = this.overlayScale();
    // Najechanie najpierw, żeby zaznaczenie rysowało się nad nim, gdy to ten
    // sam obiekt (kursor stoi nad tym, co się właśnie kliknęło — częsty stan).
    if (this.sceneHovered && !sameRef(this.sceneHovered, this.sceneSelected)) {
      this.strokeSceneObject(g, this.sceneHovered, 0xd6f5ff, 2 * k, 0.55, 4 * k);
    }
    if (this.sceneSelected) {
      // W trakcie przeciągania obrys pokazuje **cel**, nie stan zapisany:
      // to jest jedyna informacja zwrotna, jaką gest ma przed puszczeniem.
      const drag = this.sceneDrag;
      if (drag && sameRef(drag.ref, this.sceneSelected)) {
        this.strokeSceneShape(g, drag.current, 0xffd166, 3 * k, 0.95, 6 * k, drag.ref.kind);
      } else {
        this.strokeSceneObject(g, this.sceneSelected, 0xffd166, 3 * k, 0.95, 6 * k);
      }
      this.drawSceneHandles(g, k);
    }
  }

  /**
   * Kwadraciki w rogach prostokąta i na końcach odcinka (etap 27l).
   *
   * Obiekty punktowe i rysunki ich nie dostają: lampa nie ma czego skalować,
   * a rysunek jest w prostokąt tylko **wpisany** — kwadracik w jego rogu
   * obiecywałby rozciąganie, którego nie ma. Jedno i drugie przesuwa się
   * chwytając samo siebie.
   */
  private drawSceneHandles(g: Graphics, k: number): void {
    const ref = this.sceneSelected;
    if (!ref) return;
    const drag = this.sceneDrag;
    const found =
      drag && sameRef(drag.ref, ref)
        ? { shape: drag.current, moveOnly: drag.moveOnly }
        : this.sceneShapeOf(ref);
    if (!found || found.moveOnly) return;
    const side = SCENE_HANDLE_SIZE_PX * k;
    for (const handle of sceneHandlesOf(found.shape)) {
      g.rect(handle.x - side / 2, handle.y - side / 2, side, side)
        .fill({ color: 0x0b1220, alpha: 0.9 })
        .stroke({ color: 0xffd166, width: 2 * k, alpha: 0.95 });
    }
  }

  /** Obrys dowolnego z trzech kształtów — używany przez podgląd przeciągania. */
  private strokeSceneShape(
    g: Graphics,
    shape: SceneObjectShape,
    color: number,
    width: number,
    alpha: number,
    pad: number,
    kind: SceneObjectKind,
  ): void {
    const stroke = { color, width, alpha };
    if (shape.form === 'segment') {
      g.moveTo(shape.x1, shape.y1)
        .lineTo(shape.x2, shape.y2)
        .stroke({ ...stroke, width: width * 2 });
      for (const end of [
        { x: shape.x1, y: shape.y1 },
        { x: shape.x2, y: shape.y2 },
      ]) {
        g.circle(end.x, end.y, pad * 0.7).fill({ color, alpha });
      }
      return;
    }
    if (shape.form === 'point') {
      // Pinezka ma kotwicę u dołu, więc jej obrys siedzi wyżej niż punkt —
      // ta sama poprawka, którą ma `strokeSceneObject`. Bez niej kółko
      // przeskakiwałoby o własną wysokość w chwili złapania uchwytu.
      const dy = kind === 'note' ? pad * 1.4 : 0;
      g.circle(shape.x, shape.y - dy, pad * 2.2).stroke(stroke);
      return;
    }
    g.rect(shape.x - pad, shape.y - pad, shape.width + pad * 2, shape.height + pad * 2).stroke(
      stroke,
    );
  }

  /**
   * Geometria zaznaczonego obiektu sprowadzona do trzech kształtów (etap 27l).
   *
   * `moveOnly` odróżnia rysunek od osłony: prostokąt osłony da się rozciągnąć
   * za róg, a rysunek jest tylko **wpisany** w prostokąt — jego rogi nie są
   * niczyimi uchwytami, bo skalowanie ścieżki to inna operacja niż przesunięcie
   * jej ramki (i osobny pomysł, nie ten etap).
   */
  private sceneShapeOf(ref: SceneObjectRef): { shape: SceneObjectShape; moveOnly: boolean } | null {
    switch (ref.kind) {
      case 'wall': {
        const wall = this.lastWalls.find((entry) => entry.id === ref.id);
        return wall
          ? {
              shape: { form: 'segment', x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 },
              moveOnly: false,
            }
          : null;
      }
      case 'cover': {
        const cover = this.lastCovers.find((entry) => entry.id === ref.id);
        return cover
          ? {
              shape: {
                form: 'rect',
                x: cover.x,
                y: cover.y,
                width: cover.width,
                height: cover.height,
              },
              moveOnly: false,
            }
          : null;
      }
      case 'zone': {
        const zone = this.lastZones.find((entry) => entry.id === ref.id);
        return zone
          ? {
              shape: { form: 'rect', x: zone.x, y: zone.y, width: zone.width, height: zone.height },
              moveOnly: false,
            }
          : null;
      }
      case 'light': {
        const light = this.lastLights.find((entry) => entry.id === ref.id);
        return light ? { shape: { form: 'point', x: light.x, y: light.y }, moveOnly: true } : null;
      }
      case 'netpoint': {
        const point = this.lastAccessPoints.find((entry) => entry.id === ref.id);
        return point ? { shape: { form: 'point', x: point.x, y: point.y }, moveOnly: true } : null;
      }
      case 'note': {
        const note = this.lastNotes.find((entry) => entry.id === ref.id);
        return note ? { shape: { form: 'point', x: note.x, y: note.y }, moveOnly: true } : null;
      }
      case 'drawing': {
        const drawing = this.lastDrawings.find((entry) => entry.id === ref.id);
        if (!drawing) return null;
        const box = drawingBounds(drawing.shape);
        return {
          shape: { form: 'rect', x: box.x, y: box.y, width: box.width, height: box.height },
          moveOnly: true,
        };
      }
    }
  }

  /**
   * Kursor mówi, że coś da się złapać — jedyna podpowiedź, jaką uchwyt ma
   * przed pierwszym przeciągnięciem. Bez wpisu zostawia kursor warstwy, którym
   * zajmuje się `applyMapCursor`.
   */
  private applyHandleCursor(point: ScenePoint): void {
    const ref = this.sceneSelected;
    const canvas = this.app.canvas as HTMLCanvasElement | undefined;
    if (!canvas) return;
    if (!ref || this.armedLayerKind() !== ref.kind) return;
    const found = this.sceneShapeOf(ref);
    if (!found) return;
    const handle = pickSceneHandle(found.shape, point, this.handleTolerance());
    if (!handle || (found.moveOnly && handle !== 'move')) {
      this.applyMapCursor();
      return;
    }
    canvas.style.cursor = sceneHandleCursor(handle);
  }

  /**
   * Obiekt spod obrysu się zmienił — przerysuj obrys i uchwyty (etap 27l).
   *
   * Wołane z każdego settera list obiektów, bo obrys nie jest kopiowany: rysuje
   * się z **bieżącej** geometrii. Bez tego przesunięta ściana zostawiała żółty
   * ślad tam, gdzie stała przed chwilą — pierwszy błąd znaleziony przy
   * oględzinach 24.08. Redraw kosztuje jedną ścieżkę `Graphics`, a listy
   * przychodzą tylko wtedy, gdy MG coś zmienił.
   */
  private refreshSceneSelectOutline(kind: SceneObjectKind): void {
    if (this.sceneSelected?.kind !== kind && this.sceneHovered?.kind !== kind) return;
    this.drawSceneSelectOutline();
  }

  /** Promień trafienia w uchwyt w pikselach **sceny** — stały na ekranie. */
  private handleTolerance(): number {
    return SCENE_HANDLE_SIZE_PX * this.overlayScale();
  }

  /**
   * Czy ten `pointerdown` złapał uchwyt zaznaczonego obiektu?
   *
   * Uchwyty należą do warstwy, tak samo jak zaznaczenie (27k): narzędzie
   * świateł nie przesunie osłony, choćby leżała pod kursorem. Trwający łańcuch
   * ścian wygrywa z uchwytami — raz zaczętego obrysu pokoju nie przerywa się
   * przesunięciem sąsiedniego muru.
   */
  private grabSceneHandle(point: ScenePoint): boolean {
    const ref = this.sceneSelected;
    if (!ref || this.wallPoints) return false;
    if (this.armedLayerKind() !== ref.kind) return false;
    const found = this.sceneShapeOf(ref);
    if (!found) return false;
    const handle = pickSceneHandle(found.shape, point, this.handleTolerance());
    if (!handle) return false;
    if (found.moveOnly && handle !== 'move') return false;
    this.sceneDrag = {
      ref,
      handle,
      origin: point,
      base: found.shape,
      current: found.shape,
      moveOnly: found.moveOnly,
    };
    this.viewport?.plugins.pause('drag');
    return true;
  }

  /**
   * Dokąd trafi przeciągany punkt. Przyciąganie do kratki jest domyślne,
   * `Ctrl` je wyłącza na czas gestu (rozstrzygnięcie MG z 24.08) — a końcówka
   * ściany łapie **końcówki innych ścian** przed kratką, dokładnie tak jak
   * przy rysowaniu, bo szczelina między dwoma murami jest dziurą, przez którą
   * leje się światło.
   */
  private snapForDrag(ref: SceneObjectRef, precise: boolean): (point: ScenePoint) => ScenePoint {
    const scene = this.scene;
    const grid = scene
      ? { sizePx: scene.grid.sizePx, offsetX: scene.grid.offsetX, offsetY: scene.grid.offsetY }
      : null;
    if (ref.kind === 'wall') {
      const others = this.lastWalls.filter((wall) => wall.id !== ref.id);
      // Przełącznik „przyciągaj do kratki" z paska nadal obowiązuje — tak jak
      // przy rysowaniu, gdzie jego opis obiecuje „końce ścian nadal łapią".
      const useGrid = this.wall.snapGrid && !precise;
      return (point) =>
        snapWallPoint(point, others, {
          gridSizePx: useGrid ? (grid?.sizePx ?? null) : null,
          gridOffsetX: grid?.offsetX,
          gridOffsetY: grid?.offsetY,
        });
    }
    if (precise) return (point) => ({ x: Math.round(point.x), y: Math.round(point.y) });
    return (point) => snapScenePoint(point, grid);
  }

  /** Uchwyt jedzie za kursorem; obiekt stoi, dopóki nie puścimy przycisku. */
  private moveSceneHandle(point: ScenePoint, precise: boolean): void {
    const drag = this.sceneDrag;
    if (!drag) return;
    drag.current = dragSceneShape(drag.base, drag.handle, point, {
      origin: drag.origin,
      snap: this.snapForDrag(drag.ref, precise),
    });
    this.drawSceneSelectOutline();
  }

  /**
   * Koniec gestu. Ruch idzie do wywołującego; **gest bez ruchu wraca jako
   * zwykłe kliknięcie** i to jest tu najważniejsze zdanie.
   *
   * Uchwyt „przesuń" pokrywa cały zaznaczony obiekt, więc drugie kliknięcie
   * dwukliku ląduje na nim, a nie na warstwie. Bez tego przejścia karta nie
   * otwierałaby się nigdy na obiekcie, który jest już zaznaczony — czyli
   * dokładnie na tym, w który MG właśnie kliknął (znalezione przy oględzinach
   * 24.08).
   */
  private releaseSceneHandle(): void {
    const drag = this.sceneDrag;
    if (!drag) return;
    this.sceneDrag = null;
    this.viewport?.plugins.resume('drag');
    this.drawSceneSelectOutline();
    this.applyMapCursor();
    if (JSON.stringify(drag.base) === JSON.stringify(drag.current)) {
      this.takeScenePick(drag.ref);
      return;
    }
    this.onSceneTransform?.(drag.ref, drag.current);
    this.layerPickSpent = true;
  }

  /** Rysuje obrys jednego obiektu — kształt zależy od tego, czym obiekt jest. */
  private strokeSceneObject(
    g: Graphics,
    ref: SceneObjectRef,
    color: number,
    width: number,
    alpha: number,
    pad: number,
  ): void {
    const stroke = { color, width, alpha };
    switch (ref.kind) {
      case 'wall': {
        const wall = this.lastWalls.find((entry) => entry.id === ref.id);
        if (!wall) return;
        g.moveTo(wall.x1, wall.y1)
          .lineTo(wall.x2, wall.y2)
          .stroke({ ...stroke, width: width * 2 });
        // Kropki na końcach: bez nich zaznaczona ściana jest tylko grubszą
        // kreską i nie widać, gdzie się kończy w łańcuchu sąsiadów.
        for (const end of [
          { x: wall.x1, y: wall.y1 },
          { x: wall.x2, y: wall.y2 },
        ]) {
          g.circle(end.x, end.y, pad * 0.7).fill({ color, alpha });
        }
        return;
      }
      case 'cover': {
        const cover = this.lastCovers.find((entry) => entry.id === ref.id);
        if (!cover) return;
        g.rect(cover.x - pad, cover.y - pad, cover.width + pad * 2, cover.height + pad * 2).stroke(
          stroke,
        );
        return;
      }
      case 'zone': {
        const zone = this.lastZones.find((entry) => entry.id === ref.id);
        if (!zone) return;
        g.rect(zone.x - pad, zone.y - pad, zone.width + pad * 2, zone.height + pad * 2).stroke(
          stroke,
        );
        return;
      }
      case 'light': {
        const light = this.lastLights.find((entry) => entry.id === ref.id);
        if (!light) return;
        g.circle(light.x, light.y, pad * 2.2).stroke(stroke);
        return;
      }
      case 'netpoint': {
        const point = this.lastAccessPoints.find((entry) => entry.id === ref.id);
        if (!point) return;
        g.circle(point.x, point.y, pad * 2.2).stroke(stroke);
        return;
      }
      case 'note': {
        const note = this.lastNotes.find((entry) => entry.id === ref.id);
        if (!note) return;
        // Pinezka ma kotwicę u dołu (`anchor.set(0.5, 1)`), więc kółko wokół
        // punktu minęłoby się z glifem o całą jego wysokość.
        g.circle(note.x, note.y - pad * 1.4, pad * 2.2).stroke(stroke);
        return;
      }
      case 'drawing': {
        const drawing = this.lastDrawings.find((entry) => entry.id === ref.id);
        if (!drawing) return;
        const box = drawingBounds(drawing.shape);
        g.rect(box.x - pad, box.y - pad, box.width + pad * 2, box.height + pad * 2).stroke(stroke);
        return;
      }
    }
  }

  /**
   * Where the rotation knob sits right now, or null when there is nothing to
   * turn. Pointing „up" when the figure has never been turned, so the handle is
   * always somewhere the hand can find it rather than nowhere at all.
   */
  private facingKnob(): (ScenePoint & { centre: ScenePoint }) | null {
    const scene = this.scene;
    const node = this.selectedTokenId ? this.tokenNodes.get(this.selectedTokenId) : undefined;
    if (!scene || !node || node.destroyed) return null;
    if (this.movableTokens.get(node.tokenId) === false) return null;
    const half = (node.token.size * scene.grid.sizePx) / 2;
    const k = this.overlayScale();
    const centre = { x: node.x + half, y: node.y + half };
    const distance = half + 22 * k;
    const angle = (((this.rotating?.facing ?? node.facing ?? 0) - 90) * Math.PI) / 180;
    return {
      x: centre.x + Math.cos(angle) * distance,
      y: centre.y + Math.sin(angle) * distance,
      centre,
    };
  }

  /** Did this click land on the rotation knob? Starts the turn if it did. */
  private grabFacingKnob(point: ScenePoint): boolean {
    const knob = this.facingKnob();
    const node = this.selectedTokenId ? this.tokenNodes.get(this.selectedTokenId) : undefined;
    if (!knob || !node) return false;
    if (Math.hypot(point.x - knob.x, point.y - knob.y) > 11 * this.overlayScale()) return false;
    this.rotating = { tokenId: node.tokenId, facing: node.facing ?? 0 };
    this.viewport?.plugins.pause('drag');
    this.app.stage.eventMode = 'static';
    this.app.stage.on('pointermove', this.onRotateMove);
    this.app.stage.on('pointerup', this.onRotateEnd);
    this.app.stage.on('pointerupoutside', this.onRotateEnd);
    this.drawSelectionRing();
    return true;
  }

  private readonly onRotateMove = (event: FederatedPointerEvent): void => {
    const rotating = this.rotating;
    const viewport = this.viewport;
    const knob = this.facingKnob();
    if (!rotating || !viewport || !knob) return;
    const world = viewport.toWorld(event.global.x, event.global.y);
    const facing = facingFromDelta(world.x - knob.centre.x, world.y - knob.centre.y);
    if (facing === null || facing === rotating.facing) return;
    rotating.facing = facing;
    // Turned locally first, reported on release: a figure that waited for the
    // server on every degree would lag a hand that is drawing a circle.
    this.tokenNodes.get(rotating.tokenId)?.showFacing(facing);
    this.drawSelectionRing();
  };

  /**
   * Puts a figure's nose back where the store has it — the undo of a refused
   * turn. The local angle outranks the store's by design (see `TokenNode`), so
   * a rejection has to say so out loud rather than wait for a sync.
   */
  showTokenFacing(tokenId: string, facing: number | null): void {
    if (this.destroyed) return;
    this.tokenNodes.get(tokenId)?.showFacing(facing);
    this.drawSelectionRing();
  }

  private readonly onRotateEnd = (): void => {
    const rotating = this.rotating;
    this.rotating = null;
    this.app.stage.off('pointermove', this.onRotateMove);
    this.app.stage.off('pointerup', this.onRotateEnd);
    this.app.stage.off('pointerupoutside', this.onRotateEnd);
    this.viewport?.plugins.resume('drag');
    // The release of a turn is not an order to walk — the same guard a token
    // drag needs, and for the same reason: `pixi-viewport` still calls a short
    // gesture a click on the map underneath it.
    this.dragEndedAt = performance.now();
    this.drawSelectionRing();
    this.drawWalkPreview();
    if (rotating) this.onTokenFacing?.(rotating.tokenId, rotating.facing);
  };

  /**
   * Does the steered figure have a weapon in hand right now (stage 16f)?
   *
   * Pushed by the action bar, which is the only place that knows. Nothing else
   * about the weapon reaches this file: „can I hit them from here" is a rule
   * and lives in `planCpredAttack`, and the reticle is drawn whether or not the
   * shot would land — the bubble next to it says which.
   */
  setAimReady(active: boolean): void {
    if (this.destroyed || this.aimReady === active) return;
    this.aimReady = active;
    if (!active) this.clearAim();
  }

  /**
   * Arms — or puts away — the area template (stages 16d, 16g).
   *
   * `null` is „nothing of the sort in hand", which takes the shape off the map
   * and hands the pointer back to the route preview. Nothing here decides
   * whether the shot is legal; the bar has already asked the rules that
   * question, and the server asks it again when the dice fly.
   */
  setAreaPreview(preview: AreaPreview | null): void {
    if (this.destroyed) return;
    if (samePreview(this.areaPreview, preview)) return;
    this.areaPreview = preview;
    if (!preview) {
      this.areaHover = null;
      this.blastGraphics.clear();
    }
    this.applyMapCursor();
  }

  /** Follows the pointer with the template; called from the move handler. */
  private trackAreaHover(point: ScenePoint): void {
    const scene = this.scene;
    if (!this.areaPreview || !scene) {
      if (this.areaHover) {
        this.areaHover = null;
        this.blastGraphics.clear();
      }
      return;
    }
    // A blast snaps to the square it will be centred on; a cone only needs a
    // direction, so it follows the raw pointer.
    const aim = this.areaPreview.kind === 'blast' ? snapToSquareCentre(point, scene) : { ...point };
    if (this.areaHover && this.areaHover.x === aim.x && this.areaHover.y === aim.y) return;
    this.areaHover = aim;
    this.drawAreaPreview();
  }

  /**
   * The patch the shot would cover, drawn on the grid it snaps to.
   *
   * Deliberately a filled shape rather than an outline: the question the player
   * is answering is „who is inside", and an outline makes that a guess at the
   * edges — which is exactly where the rule bites.
   */
  private drawAreaPreview(): void {
    this.blastGraphics.clear();
    const scene = this.scene;
    const aim = this.areaHover;
    const preview = this.areaPreview;
    if (!scene || !aim || !preview) return;
    const perPixel = metresPerPixel(scene);
    if (perPixel <= 0) return;
    const k = this.overlayScale();

    if (preview.kind === 'cone') {
      // The wedge starts at the muzzle, so it needs the figure holding the gun;
      // with none selected there is nothing to draw from.
      const node = this.selectedTokenId ? this.tokenNodes.get(this.selectedTokenId) : undefined;
      if (!node || node.destroyed) return;
      const half = (node.token.size * scene.grid.sizePx) / 2;
      const origin = { x: node.x + half, y: node.y + half };
      const angle = Math.atan2(aim.y - origin.y, aim.x - origin.x);
      const halfAngle = (CPRED_CONE_HALF_ANGLE_DEG * Math.PI) / 180;
      const reach = preview.rangeM / perPixel;
      this.blastGraphics
        .moveTo(origin.x, origin.y)
        .arc(origin.x, origin.y, reach, angle - halfAngle, angle + halfAngle)
        .lineTo(origin.x, origin.y)
        .fill({ color: BLAST_COLOR, alpha: 0.16 })
        .stroke({ color: BLAST_COLOR, width: 2.5 * k, alpha: 0.85 });
      return;
    }

    const half = preview.sideM / perPixel / 2;
    this.blastGraphics
      .rect(aim.x - half, aim.y - half, half * 2, half * 2)
      .fill({ color: BLAST_COLOR, alpha: 0.18 })
      .stroke({ color: BLAST_COLOR, width: 2.5 * k, alpha: 0.9 });
    // A cross on the centre square: the charge lands on *that* one, and on a
    // 5×5 template the middle is otherwise impossible to point at.
    const cell = scene.grid.sizePx / 2;
    this.blastGraphics
      .moveTo(aim.x - cell, aim.y)
      .lineTo(aim.x + cell, aim.y)
      .moveTo(aim.x, aim.y - cell)
      .lineTo(aim.x, aim.y + cell)
      .stroke({ color: BLAST_COLOR, width: 2 * k, alpha: 0.75 });
  }

  /**
   * Is this token something the pointer is *aiming at* rather than reaching
   * for — and if so, which node?
   *
   * The rule is the one every top-down RPG uses: a figure I steer is somebody I
   * **select**, anybody else is somebody I can **shoot**. Which leaves the GM,
   * who steers the whole map and would otherwise never be able to switch
   * figures — so for them the plain click keeps selecting and `Alt` is how they
   * say „this one is a target, not my next pawn". A player holding `Alt` gets
   * the same escape hatch for the rare shot at their own side.
   *
   * The crosshair armed from a sheet (stages 16 and 16b) overrides all of it:
   * that gesture already said „the next token I click is a target".
   */
  private aimTargetFor(node: TokenNode | null, altKey: boolean): TokenNode | null {
    if (!node || node.destroyed) return null;
    // A map tool owns the pointer while it is armed — a fog brush over a
    // portrait paints fog, and a crosshair there would be a lie.
    if (this.mapToolArmed) return null;
    if (this.targeting) return node;
    if (!this.aimReady || !this.selectedTokenId) return null;
    if (node.tokenId === this.selectedTokenId) return null;
    const steerable = this.movableTokens.get(node.tokenId) !== false;
    if (steerable && !altKey) return null;
    return node;
  }

  /** Puts the reticle on a token, or takes it off; reports both to the caller. */
  private updateAim(node: TokenNode | null, event: FederatedPointerEvent): void {
    const target = this.march ? null : this.aimTargetFor(node, event.altKey === true);
    const id = target?.tokenId ?? null;
    if (id !== this.aimTokenId) {
      this.aimTokenId = id;
      this.drawAimReticle();
      this.applyMapCursor();
    }
    // The position is reported even when the token has not changed: the bubble
    // follows the pointer across a large figure rather than sticking to the
    // spot it was first seen at.
    this.onAimHover?.(
      id ? { tokenId: id, clientX: event.client.x, clientY: event.client.y } : null,
    );
  }

  /** Takes the reticle down — selection changed, weapon put away, scene swapped. */
  private clearAim(): void {
    if (this.aimTokenId === null) return;
    this.aimTokenId = null;
    this.drawAimReticle();
    this.applyMapCursor();
    this.onAimHover?.(null);
  }

  /**
   * Corner brackets round the token under the crosshair.
   *
   * Brackets rather than a fourth ring, and that is the whole design: a token
   * can already be wearing an owner ring, the turn halo and the selection
   * dashes at once, and a circle inside that stack is unreadable. A bracketed
   * box says „sights" in the visual language of every game that has them.
   */
  private drawAimReticle(): void {
    this.aimGraphics.clear();
    const scene = this.scene;
    const node = this.aimTokenId ? this.tokenNodes.get(this.aimTokenId) : undefined;
    if (!scene || !node || node.destroyed) return;
    const extent = node.token.size * scene.grid.sizePx;
    const k = this.overlayScale();
    const pad = 6 * k;
    const left = node.x - pad;
    const top = node.y - pad;
    const right = node.x + extent + pad;
    const bottom = node.y + extent + pad;
    const arm = (right - left) * AIM_BRACKET;
    const corners: [number, number, number, number][] = [
      [left, top, 1, 1],
      [right, top, -1, 1],
      [left, bottom, 1, -1],
      [right, bottom, -1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      this.aimGraphics
        .moveTo(x + dx * arm, y)
        .lineTo(x, y)
        .lineTo(x, y + dy * arm);
    }
    this.aimGraphics.stroke({ color: AIM_COLOR, width: 2.5 * k, alpha: 0.95, cap: 'square' });
  }

  /**
   * Hands in what counts as walkable ground (stage 16e).
   *
   * Null switches route planning off entirely, which is what a scene with no
   * visibility model wants: with no walls and no polygons there is nothing to
   * walk *round*, and a straight line is the whole of the answer.
   */
  setWalkPassable(isPassable: WalkPassable | null, canStep?: WalkStep): void {
    if (this.destroyed) return;
    this.walkPassable = isPassable;
    this.walkCanStep = canStep;
    this.walkHover = null;
    // New rules, so the shaded floor has to be flooded again even though the
    // figure has not moved and its turn has not changed: those are all the
    // cache key knows about. Without this line a wall drawn — or rubbed out —
    // during somebody's turn left the old shape on the map until the token was
    // nudged, which is exactly what it looked like when 27j was checked.
    this.reach = null;
    this.drawWalkPreview();
    this.updateReach();
  }

  /**
   * Why the selected token may not walk right now — „Powalony", „nie twoja
   * tura" — or null when it may. The sentence is the caller's, because every
   * one of those reasons is a rule and rules live in the game system.
   */
  setWalkRefusal(reason: string | null): void {
    if (this.destroyed || this.walkRefusal === reason) return;
    this.walkRefusal = reason;
    this.walkHover = null;
    this.drawWalkPreview();
    this.updateReach();
    this.applyMapCursor();
  }

  /** Is a token walking a planned route right now? */
  isMarching(): boolean {
    return this.march !== null;
  }

  /**
   * Stops a march where the figure stands (stage 16e) — the hand of the player,
   * or one of the three automatic reasons the caller watches for. The ground
   * already covered is what gets sent and therefore what gets charged.
   */
  interruptWalk(note: string | null): void {
    if (!this.march) return;
    this.finishMarch(note);
  }

  /** The turn's remaining movement, but only when it belongs to the steered token. */
  private walkBudget(): {
    metresLeft: number;
    costFactor: number;
    enforced: boolean;
    extraMetres: number;
    extraLabel: string | null;
  } | null {
    const allowance = this.moveAllowance;
    if (!allowance || allowance.tokenId !== this.selectedTokenId) return null;
    const extra = allowance.extraMetres ?? 0;
    return {
      metresLeft: allowance.metresLeft,
      costFactor: allowance.costFactor > 0 ? allowance.costFactor : 1,
      enforced: allowance.enforced !== false,
      extraMetres: extra > 0 ? extra : 0,
      extraLabel: extra > 0 ? (allowance.extraLabel ?? null) : null,
    };
  }

  /** Where the walking figure is this frame — the store still holds the old spot. */
  marchPosition(): ScenePoint | null {
    return this.march ? { x: this.march.x, y: this.march.y } : null;
  }

  /**
   * Plans the route to a point under the cursor, budget already applied.
   *
   * The route starts at the token's **real** position rather than at the cell it
   * snaps to: the server measures from where the figure stands, and a plan
   * measured from anywhere else would be billed differently than it was drawn.
   */
  private planWalkRoute(goal: ScenePoint): {
    points: ScenePoint[];
    walkable: ScenePoint[];
    truncated: boolean;
    metres: number;
    spent: number;
    complete: boolean;
  } | null {
    const scene = this.scene;
    const isPassable = this.walkPassable;
    const node = this.selectedTokenId ? this.tokenNodes.get(this.selectedTokenId) : undefined;
    if (!scene || !isPassable || !node || node.destroyed) return null;
    const cell = scene.grid.sizePx;
    const perPixel = metresPerPixel(scene);
    if (cell <= 0 || perPixel <= 0) return null;

    const grid = walkGridForScene(
      scene,
      normalizeGridOffset(scene.grid.offsetX, cell),
      normalizeGridOffset(scene.grid.offsetY, cell),
    );
    const budget = this.walkBudget();
    const enforced = budget?.enforced ? budget : null;
    // The search reaches exactly as far as the turn can pay for, plus a cell of
    // slack so the route may bulge round a corner on its way to the far edge.
    // „What the turn can pay for" now includes the trade — a band the player is
    // not allowed to walk into is still a band they have to be able to *see*,
    // and a route that stops at the green edge cannot show them where the amber
    // one ends.
    const reachM = enforced
      ? (enforced.metresLeft + enforced.extraMetres) / enforced.costFactor
      : WALK_FREE_RANGE_M;
    const radiusCells = Math.min(
      WALK_RADIUS_CELLS,
      Math.max(1, Math.ceil(reachM / (cell * perPixel)) + 1),
    );
    const extent = node.token.size * cell;
    const from = { x: node.x, y: node.y };
    const options = {
      grid,
      isPassable,
      ...(this.walkCanStep ? { canStep: this.walkCanStep } : {}),
      size: node.token.size,
      radiusCells,
    };
    // One leg per insisted-on corner, then the leg to the cursor. A leg that
    // could not be finished ends the route there: walking past a waypoint you
    // asked for would be worse than stopping at it.
    const legs = [...this.walkWaypoints, goal];
    const points: ScenePoint[] = [from];
    let truncated = false;
    for (const leg of legs) {
      const start = points[points.length - 1]!;
      const plan = planWalk(start, { x: leg.x - extent / 2, y: leg.y - extent / 2 }, options);
      if (!plan) return null;
      points.push(...plan.points.slice(1));
      if (plan.truncated) {
        truncated = true;
        break;
      }
    }
    const clipped = this.clipToBudget(points, scene, node.token.size, enforced);
    return {
      points,
      walkable: clipped.points,
      truncated,
      metres: clipped.metres,
      spent: clipped.spent,
      complete: clipped.complete,
    };
  }

  /**
   * How much of a planned route the turn can actually pay for.
   *
   * `clipWalkToBudget` in `shared` cuts on a **waypoint**, which is right for
   * the bot — its routes are planned unsmoothed precisely so that every cell is
   * a waypoint the cut can land on (20b) — and wrong here. A smoothed route
   * across open ground has exactly two points, start and end, so that cut
   * collapses to the start: „idź, ile starczy" would answer „nie ruszysz się"
   * for every click past the budget, which is what the search radius used to
   * hide by never planning that far in the first place.
   *
   * So the cut lands **on the metre** — and then snaps, because the server
   * snaps whatever landing it is sent and bills the path it arrives with
   * (`movementPath` appends the snapped position). An unsnapped end would be
   * nudged up to half a square further and refused for the difference, which is
   * the same trap `marchLanding` walks back out of. A snap that no longer fits
   * steps back a square at a time; a route with nowhere left to stand falls
   * back to the last whole waypoint, which is where this started.
   */
  private clipToBudget(
    points: readonly ScenePoint[],
    scene: SceneView,
    size: number,
    budget: { metresLeft: number; costFactor: number } | null,
  ): { points: ScenePoint[]; metres: number; spent: number; complete: boolean } {
    const first = points[0];
    const factor = budget && budget.costFactor > 0 ? budget.costFactor : 1;
    const full = polylineMetres(points, scene);
    if (!first) return { points: [], metres: 0, spent: 0, complete: true };
    if (!budget) return { points: [...points], metres: full, spent: full * factor, complete: true };

    // A tenth of a metre of slack: the metre count is rounded to one decimal on
    // both ends of the wire, and „12 m of 12 m" must not come back refused.
    const allowed = Math.max(0, budget.metresLeft) / factor;
    if (full <= allowed + 0.05) {
      return { points: [...points], metres: full, spent: full * factor, complete: true };
    }

    const kept: ScenePoint[] = [first];
    let overflow = 1;
    for (; overflow < points.length; overflow++) {
      const candidate = [...kept, points[overflow]!];
      if (polylineMetres(candidate, scene) > allowed + 0.05) break;
      kept.push(points[overflow]!);
    }
    const short = (): {
      points: ScenePoint[];
      metres: number;
      spent: number;
      complete: boolean;
    } => {
      const metres = polylineMetres(kept, scene);
      return { points: kept, metres, spent: metres * factor, complete: false };
    };

    const from = kept[kept.length - 1]!;
    const to = points[overflow];
    const snapScene = this.snapScene();
    const perPixel = metresPerPixel(scene);
    const cell = scene.grid.sizePx;
    if (!to || !snapScene || perPixel <= 0 || cell <= 0) return short();
    const legPx = Math.hypot(to.x - from.x, to.y - from.y);
    if (legPx <= 0) return short();

    const half = (size * cell) / 2;
    let along = (allowed - polylineMetres(kept, scene)) / perPixel;
    for (let tries = 0; tries < 6 && along > 0; tries++, along -= cell) {
      const reach = Math.min(along, legPx);
      const landing = snapTokenPosition(
        from.x + ((to.x - from.x) * reach) / legPx,
        from.y + ((to.y - from.y) * reach) / legPx,
        size,
        snapScene,
      );
      // A snap that lands back where the figure already stands is not a step.
      if (Math.abs(landing.x - from.x) < 1 && Math.abs(landing.y - from.y) < 1) continue;
      const candidate = [...kept, landing];
      const metres = polylineMetres(candidate, scene);
      if (metres > allowed + 0.05) continue;
      // The leg was planned clear for the whole figure, but the snap moves the
      // landing off it by up to half a square — enough to clip the corner of a
      // wall the route was hugging.
      if (
        this.walkCanStep &&
        !this.walkCanStep(
          { x: from.x + half, y: from.y + half },
          { x: landing.x + half, y: landing.y + half },
        )
      ) {
        continue;
      }
      return { points: candidate, metres, spent: metres * factor, complete: false };
    }
    return short();
  }

  /**
   * Recomputes the route under the cursor, at most once per destination cell.
   *
   * Without the cache A* runs on every pointer event — dozens of times a second
   * — to produce the polyline it produced last time. The key carries everything
   * that can change the answer, so it also serves as the invalidation.
   */
  private trackWalkHover(point: ScenePoint): void {
    const scene = this.scene;
    const node = this.selectedTokenId ? this.tokenNodes.get(this.selectedTokenId) : undefined;
    const blocked =
      this.march !== null ||
      this.drag !== null ||
      // Turning a figure is not planning a walk (stage 27j): the knob is
      // dragged across the map, and every frame of that would otherwise draw a
      // route to wherever the hand happened to be.
      this.rotating !== null ||
      this.rulerMode ||
      // `Alt` w dłoni: ten klik jest pingiem, nie marszem (etap 35).
      this.pingArmed ||
      // A charge in hand owns the click: the next one says where it lands, not
      // where the figure walks (stage 16d). A cone is *not* such a case — it is
      // an ordinary shot at a figure that happens to spray (16g) — so only the
      // shape that replaces the target blocks the route.
      this.areaPreview?.kind === 'blast' ||
      // A weapon in hand no longer freezes the map (stage 16f): only the
      // pointer actually resting on a target does, because that click is
      // already spoken for.
      this.aimTokenId !== null ||
      this.mapToolArmed;
    if (!scene || !node || node.destroyed || blocked || !this.walkPassable) {
      if (this.walkHover || this.walkCursor) {
        this.walkHover = null;
        this.walkCursor = '';
        this.drawWalkPreview();
        this.applyMapCursor();
      }
      return;
    }
    if (this.walkRefusal) {
      this.walkHover = null;
      this.setWalkCursor('not-allowed');
      this.drawWalkPreview();
      return;
    }

    const cell = scene.grid.sizePx || 1;
    const budget = this.walkBudget();
    const key = [
      node.tokenId,
      Math.round(node.x),
      Math.round(node.y),
      Math.floor(point.x / cell),
      Math.floor(point.y / cell),
      budget ? budget.metresLeft : -1,
      budget ? budget.costFactor : 1,
      budget ? budget.extraMetres : 0,
      this.walkWaypoints.length,
    ].join(':');
    if (this.walkHover?.key === key) return;

    const route = this.planWalkRoute(point);
    this.walkHover = route ? { key, ...route } : null;
    this.setWalkCursor(route === null ? '' : route.truncated ? 'alias' : 'pointer');
    this.drawWalkPreview();
  }

  private setWalkCursor(cursor: string): void {
    if (this.walkCursor === cursor) return;
    this.walkCursor = cursor;
    this.applyMapCursor();
  }

  /**
   * Paints the route as a trail of boot prints, coloured by how much of the
   * turn each metre of it costs: green while this turn's movement pays for it,
   * amber where it is reached only by taking the trade the system offers
   * („Bieg" — the Action spent on a second Move Action), grey where the turn
   * cannot reach at all. Where the green runs out is where the figure stops.
   *
   * The bands are the point of the preview (repair session 23.08). „Idź, ile
   * starczy" (16e) told the player where they would *land*; it never told them
   * how far this turn could go **at most**, and that is the number a plan is
   * made of — whether the cover across the street is one Action away or two
   * decides the turn before a single metre is spent.
   *
   * Prints and nothing else (MG, 23.08). The route started out with a line
   * under the prints, a number on every leg, a total and a „Bieg" figure, a bar
   * where each band ended and an ✖ on the landing square; one by one they all
   * came off. What is left says the same thing: the prints have a direction, a
   * gait and a spacing of one metre, and their colour is the answer. Precision
   * past that is the ruler's job, not the route's.
   *
   * The amber band is *information only*: clicking into it still walks to the
   * green edge, because the Action is spent by the action bar and booked by the
   * server, never by a click on the floor.
   */
  private drawWalkPreview(): void {
    this.walkGraphics.clear();
    this.hideFootprints();
    const hover = this.walkHover;
    const scene = this.scene;
    const node = this.selectedTokenId ? this.tokenNodes.get(this.selectedTokenId) : undefined;
    if (!hover || !scene || !node || node.destroyed || this.march) return;
    if (hover.points.length < 2) return;

    const half = (node.token.size * scene.grid.sizePx) / 2;
    const k = this.overlayScale();
    const budget = this.walkBudget();
    const color = hover.truncated ? WALK_COLOR_UNKNOWN : WALK_COLOR;
    // Band edges in metres of *ground*, which is what the route is measured in;
    // the budget is in metres of turn, and hard going makes the two differ.
    const moveGround = budget ? budget.metresLeft / budget.costFactor : Infinity;
    const extraGround = budget
      ? (budget.metresLeft + budget.extraMetres) / budget.costFactor
      : Infinity;
    const bandAt = (metres: number): { color: number; alpha: number } => {
      if (metres <= moveGround + 0.05) return { color, alpha: 0.95 };
      if (metres <= extraGround + 0.05) return { color: WALK_COLOR_EXTRA, alpha: 0.9 };
      return { color: WALK_COLOR_BEYOND, alpha: 0.45 };
    };
    this.drawFootprints(hover.points, scene, half, bandAt);

    // The corners the player insisted on, so „I asked for this route" is visible
    // while it is being built rather than only inferable from its shape.
    for (const waypoint of this.walkWaypoints) {
      this.walkGraphics.circle(waypoint.x, waypoint.y, 5 * k).fill({ color: 0xfacc15, alpha: 0.9 });
    }

    // Nothing else on the route (MG, 23.08).
    //
    // The preview grew a bar where each band ended, a big ✖ on the landing
    // square, a number on every leg, a total, and what „Bieg" would buy — and
    // one by one they all came off. Each was a second way of saying what the
    // colours already say, drawn at a precision nobody plans a turn to. Where
    // the green runs out is where the figure stops; that is the whole message,
    // and anyone who wants the exact metre has the ruler.
  }

  /**
   * Walks the route once and drops a boot print every metre of it, tinted by
   * the band that metre falls in.
   *
   * Prints rather than dashes because the question is „how far do I get", and a
   * trail of boots answers it by being *countable*: four prints to the corner
   * is four metres, without reading a single label. They alternate left and
   * right off the centre line, so the trail has a gait — a single file of
   * identical marks reads as a dotted line and loses that.
   *
   * Sized off the token rather than off the screen, so the trail stays the same
   * size at every zoom, and thinned to whole metres when a print would be
   * longer than the metre it stands on.
   */
  private drawFootprints(
    points: readonly ScenePoint[],
    scene: SceneView,
    half: number,
    bandAt: (metres: number) => { color: number; alpha: number },
  ): void {
    if (!this.footprintTexture) return;
    const perPixel = metresPerPixel(scene);
    if (perPixel <= 0) return;
    const metrePx = FOOTPRINT_STEP_M / perPixel;
    if (metrePx <= 0) return;
    const tokenPx = half * 2;
    const printW = tokenPx * FOOTPRINT_W_RATIO;
    const printH = tokenPx * FOOTPRINT_H_RATIO;
    const offsetPx = tokenPx * FOOTPRINT_OFFSET_RATIO;
    // Whole metres only, so „one print = one metre" survives the thinning as
    // „one print = two metres" rather than becoming an arbitrary spacing.
    const stride = Math.max(1, Math.ceil((printH * FOOTPRINT_GAP_RATIO) / metrePx));
    const stepPx = stride * metrePx;

    let used = 0;
    let travelled = 0;
    let next = stepPx;
    for (let i = 1; i < points.length && used < FOOTPRINT_MAX; i++) {
      const from = points[i - 1]!;
      const to = points[i]!;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy);
      if (length <= 0) continue;
      const ux = dx / length;
      const uy = dy / length;
      const angle = Math.atan2(dy, dx);
      while (next <= travelled + length && used < FOOTPRINT_MAX) {
        const along = next - travelled;
        // +1 is the walker's right — the perpendicular below is their right
        // hand, because the map's y runs down the screen.
        const side = used % 2 === 0 ? 1 : -1;
        const offset = offsetPx * side;
        // Each print asks for itself: the band is a question about the metre it
        // stands on, not about the leg it happens to lie in, so a boundary
        // falling in the middle of a long straight still lands in the right
        // place.
        const band = bandAt(next * perPixel);
        const print = this.footprintAt(used);
        print.visible = true;
        print.tint = band.color;
        print.alpha = band.alpha;
        // Turned out of the line of travel, so the pair reads as a gait.
        print.rotation = angle + Math.PI / 2 + FOOTPRINT_TOE_OUT * side;
        print.setSize(printW, printH);
        // The glyph is the left boot, so the right one is the mirrored print.
        print.scale.x = Math.abs(print.scale.x) * -side;
        print.position.set(
          from.x + half + ux * along - uy * offset,
          from.y + half + uy * along + ux * offset,
        );
        used += 1;
        next += stepPx;
      }
      travelled += length;
    }
  }

  /** One print from the pool, made on first use and re-aimed ever after. */
  private footprintAt(index: number): Sprite {
    const existing = this.footprints[index];
    if (existing) return existing;
    const print = new Sprite(this.footprintTexture ?? Texture.EMPTY);
    print.anchor.set(0.5);
    this.footprintLayer.addChild(print);
    this.footprints[index] = print;
    return print;
  }

  private hideFootprints(): void {
    for (const print of this.footprints) print.visible = false;
  }

  /**
   * The floor this turn can still pay for (stage 27j).
   *
   * Only inside a fight, where a turn has a number: out of combat the answer is
   * „anywhere you can see", and flooding eighty metres of map to say so would
   * be a lot of work to draw a shrug.
   *
   * Drawn for the GM too, whose budget is **not** enforced (14b: going over is
   * logged, not refused). The shading says how far the turn pays for, which is
   * as true for them as for a player — and it is the same bargain the reach
   * circle already struck.
   *
   * Recomputed on the same three things that can change the answer — which
   * figure is steered, where it stands, how much of its turn is left — and
   * cached on exactly those, because the flood is a few hundred nodes and the
   * pointer moves sixty times a second.
   */
  private updateReach(): void {
    const scene = this.scene;
    const node = this.selectedTokenId ? this.tokenNodes.get(this.selectedTokenId) : undefined;
    const budget = this.walkBudget();
    const isPassable = this.walkPassable;
    const cell = scene?.grid.sizePx ?? 0;
    const perPixel = scene ? metresPerPixel(scene) : 0;
    if (
      !scene ||
      !node ||
      node.destroyed ||
      !isPassable ||
      !budget ||
      this.walkRefusal ||
      cell <= 0 ||
      perPixel <= 0
    ) {
      if (this.reach) {
        this.reach = null;
        this.reachGraphics.clear();
      }
      return;
    }
    // A figure with nothing left to spend gets no shading at all (stage 27j
    // backlog): the flood would answer with the starting cell alone, and one
    // pale square under the feet reads as „this token is selected", not as
    // „you have no way out of here". The route preview under the cursor still
    // says no with its ✖, which is the message that was wanted.
    if (budget.metresLeft <= 0) {
      if (this.reach) {
        this.reach = null;
        this.reachGraphics.clear();
      }
      return;
    }
    const metresPerCell = cell * perPixel;
    const budgetCells = budget.metresLeft / budget.costFactor / metresPerCell;
    const key = [
      node.tokenId,
      Math.round(node.x),
      Math.round(node.y),
      budget.metresLeft,
      budget.costFactor,
      node.token.size,
    ].join(':');
    if (this.reach?.key === key) return;

    const grid = walkGridForScene(
      scene,
      normalizeGridOffset(scene.grid.offsetX, cell),
      normalizeGridOffset(scene.grid.offsetY, cell),
    );
    const cells = reachableCells(
      { x: node.x, y: node.y },
      {
        grid,
        isPassable,
        ...(this.walkCanStep ? { canStep: this.walkCanStep } : {}),
        size: node.token.size,
        radiusCells: Math.min(WALK_RADIUS_CELLS, Math.max(1, Math.ceil(budgetCells) + 1)),
        budgetCells,
      },
    );
    this.reach = { key, cells };
    this.drawReach();
  }

  /**
   * Shades the reachable floor and draws a line round the outside of it.
   *
   * Drawn as a *union of squares*, not as one square per answer: a 2×2 figure
   * gets one anchor per position and four squares of floor, and painting the
   * footprints one on top of another would stack their alpha into a mess. The
   * outline is the edges no neighbour claims, which is what makes the shape
   * read as one area instead of a mosaic.
   */
  private drawReach(): void {
    this.reachGraphics.clear();
    const scene = this.scene;
    const reach = this.reach;
    const node = this.selectedTokenId ? this.tokenNodes.get(this.selectedTokenId) : undefined;
    if (!scene || !reach || !node || node.destroyed) return;
    const cell = scene.grid.sizePx;
    const size = node.token.size;
    const covered = new Set<string>();
    for (const anchor of reach.cells) {
      const col = Math.round((anchor.x - normalizeGridOffset(scene.grid.offsetX, cell)) / cell);
      const row = Math.round((anchor.y - normalizeGridOffset(scene.grid.offsetY, cell)) / cell);
      for (let dr = 0; dr < size; dr++) {
        for (let dc = 0; dc < size; dc++) covered.add(`${col + dc},${row + dr}`);
      }
    }
    const originX = normalizeGridOffset(scene.grid.offsetX, cell);
    const originY = normalizeGridOffset(scene.grid.offsetY, cell);
    for (const cellKey of covered) {
      const [col, row] = cellKey.split(',').map(Number) as [number, number];
      this.reachGraphics.rect(originX + col * cell, originY + row * cell, cell, cell);
    }
    this.reachGraphics.fill({ color: REACH_FILL, alpha: REACH_FILL_ALPHA });

    const k = this.overlayScale();
    for (const cellKey of covered) {
      const [col, row] = cellKey.split(',').map(Number) as [number, number];
      const x = originX + col * cell;
      const y = originY + row * cell;
      if (!covered.has(`${col},${row - 1}`)) this.reachGraphics.moveTo(x, y).lineTo(x + cell, y);
      if (!covered.has(`${col},${row + 1}`)) {
        this.reachGraphics.moveTo(x, y + cell).lineTo(x + cell, y + cell);
      }
      if (!covered.has(`${col - 1},${row}`)) this.reachGraphics.moveTo(x, y).lineTo(x, y + cell);
      if (!covered.has(`${col + 1},${row}`)) {
        this.reachGraphics.moveTo(x + cell, y).lineTo(x + cell, y + cell);
      }
    }
    this.reachGraphics.stroke({ color: REACH_FILL, width: 2 * k, alpha: REACH_EDGE_ALPHA });
  }

  /**
   * The „it is this one's turn" heartbeat (stage 27j).
   *
   * A halo that merely sits there is one more ring on a figure that already has
   * three; a halo that breathes is the only thing on the map that moves while
   * nothing is happening, and the eye finds it without being told. Slow — one
   * beat every two seconds — because the point is to be findable, not urgent.
   *
   * Obeys „Animacja 3D" off, like every other moving thing (27d, 27i): that
   * switch means „nie chcę przedstawienia", and this is a small one.
   */
  private readonly tickTurn = (): void => {
    const id = this.activeTokenId;
    if (!id) return;
    const node = this.tokenNodes.get(id);
    if (!node || node.destroyed) return;
    if (!useSettingsStore.getState().animate) {
      node.pulseTurn(1);
      return;
    }
    const phase = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * Math.PI);
    node.pulseTurn(Math.round(phase * 20) / 20);
  };

  /** Fades the line a finished march left behind (stage 27j). */
  private readonly tickTrail = (): void => {
    const trail = this.trail;
    if (!trail) return;
    trail.life -= this.app.ticker.deltaMS;
    if (trail.life <= 0) {
      this.trail = null;
      this.trailGraphics.clear();
      return;
    }
    this.drawTrail();
  };

  private drawTrail(): void {
    this.trailGraphics.clear();
    const trail = this.trail;
    if (!trail || trail.points.length < 2) return;
    const alpha = Math.min(1, trail.life / TRAIL_FADE_MS) * 0.55;
    const k = this.overlayScale();
    const [first, ...rest] = trail.points;
    this.trailGraphics.moveTo(first!.x + trail.half, first!.y + trail.half);
    for (const point of rest) this.trailGraphics.lineTo(point.x + trail.half, point.y + trail.half);
    this.trailGraphics.stroke({
      color: WALK_COLOR,
      width: 3 * k,
      alpha,
      cap: 'round',
      join: 'round',
    });
    // A dot where the figure set off, so a trail that ends under a token still
    // says which end of it is the beginning.
    this.trailGraphics
      .circle(first!.x + trail.half, first!.y + trail.half, 4 * k)
      .fill({ color: WALK_COLOR, alpha });
  }

  /**
   * Shift+click: „go through here first". Only accepted where the figure can
   * actually get to" — a corner it cannot reach would silently end every route
   * at the same place, which reads as the map being broken.
   */
  private addWalkWaypoint(worldX: number, worldY: number): void {
    if (this.march || !this.selectedTokenId || this.walkRefusal) return;
    if (this.walkWaypoints.length >= 8) return;
    const route = this.planWalkRoute({ x: worldX, y: worldY });
    if (!route || route.truncated || route.points.length < 2) return;
    this.walkWaypoints.push({ x: worldX, y: worldY });
    this.walkHover = null;
    this.trackWalkHover({ x: worldX, y: worldY });
  }

  /**
   * Sends the steered token along the route under the cursor.
   *
   * A click while a march is running stops it instead — the fourth reason a
   * march ends (stage 16e), and the only one that is a hand rather than an
   * event.
   */
  private walkTo(worldX: number, worldY: number): void {
    if (this.march) {
      this.finishMarch('Marsz przerwany.');
      return;
    }
    const node = this.selectedTokenId ? this.tokenNodes.get(this.selectedTokenId) : undefined;
    const scene = this.scene;
    if (!node || node.destroyed || !scene) return;
    if (this.walkRefusal) {
      this.onWalkNote?.(this.walkRefusal);
      return;
    }
    this.trackWalkHover({ x: worldX, y: worldY });
    const hover = this.walkHover;
    const budget = this.walkBudget();
    if (!hover || hover.points.length < 2) return;
    if (hover.walkable.length < 2) {
      this.onWalkNote?.('Nie starcza ruchu w tej turze — postać zostaje w miejscu.');
      return;
    }

    const perPixel = metresPerPixel(scene);
    const start = { x: node.x, y: node.y };
    const route = hover.walkable.slice(1);
    const distances: number[] = [];
    let running = 0;
    let previous = start;
    for (const point of route) {
      running += Math.hypot(point.x - previous.x, point.y - previous.y);
      distances.push(running);
      previous = point;
    }
    this.march = {
      node,
      start,
      route,
      distances,
      startedAt: performance.now(),
      lastTickAt: performance.now(),
      lastStepAt: 0,
      lastFacingX: node.x,
      lastFacingY: node.y,
      x: node.x,
      y: node.y,
      walked: [],
      speedPx: perPixel > 0 ? WALK_SPEED_M_PER_S / perPixel : node.token.size * scene.grid.sizePx,
      clipped: !hover.complete,
      // Only an enforced budget can refuse a landing, so only an enforced one
      // has any say in where an interrupted march is allowed to stop.
      budget: budget?.enforced ? budget : null,
    };
    // The corners were an instruction for *this* walk; the next click starts
    // from the automatic route again.
    this.walkWaypoints = [];
    this.walkHover = null;
    this.walkGraphics.clear();
    this.hideFootprints();
    this.setWalkCursor('');
    this.onWalkStateChange?.(node.tokenId);
  }

  /**
   * One frame of a march.
   *
   * Interpolated in Pixi's own ticker rather than a `setInterval`, so the figure
   * moves in step with the frame it is drawn in. The network frames are *not*
   * per-frame: `sendTokenMove` throttles the intermediate ones to 20 Hz on its
   * way out, exactly as it does for a drag.
   */
  private readonly tickMarch = (): void => {
    const march = this.march;
    if (!march) return;
    if (march.node.destroyed || !this.scene) {
      this.finishMarch(null, false);
      return;
    }
    // A stall is absorbed, never covered. If the renderer went away for a
    // while — a background tab, a long frame, the browser reflowing a window —
    // the figure carries on from where it was instead of appearing at the spot
    // it „should" have reached. Walking is something the table watches, and a
    // figure that jumps two rooms because a frame was late is worse than a
    // figure that arrives a moment late.
    const now = performance.now();
    const gap = now - march.lastTickAt;
    if (gap > MARCH_MAX_FRAME_MS) march.startedAt += gap - MARCH_MAX_FRAME_MS;
    march.lastTickAt = now;

    // How far along the route the figure should be *now*, measured from the
    // wall clock rather than by adding up frame deltas.
    //
    // The difference matters more than it looks. An accumulating walker drifts
    // with every irregular frame and, worse, is not idempotent: run the same
    // frame twice and the figure moves twice as far. Reading the clock makes
    // the position a pure function of „when did this march start", so a stutter,
    // a slow frame or a doubled tick all land in exactly the same place — and a
    // march can never outrun its own speed.
    const travelled = (march.speedPx * (now - march.startedAt)) / 1000;
    const total = march.distances[march.distances.length - 1] ?? 0;
    const done = travelled >= total;

    let leg = 0;
    while (leg < march.distances.length && march.distances[leg]! <= travelled) leg++;
    if (done || leg >= march.distances.length) {
      const last = march.route[march.route.length - 1];
      if (last) {
        march.x = last.x;
        march.y = last.y;
      }
      march.walked = march.route.map((point) => ({ ...point }));
    } else {
      const from = leg === 0 ? march.start : march.route[leg - 1]!;
      const to = march.route[leg]!;
      const legStart = leg === 0 ? 0 : march.distances[leg - 1]!;
      const legLength = march.distances[leg]! - legStart;
      const t = legLength > 0 ? (travelled - legStart) / legLength : 1;
      march.x = from.x + (to.x - from.x) * t;
      march.y = from.y + (to.y - from.y) * t;
      // Only whole waypoints count as walked: the leg in progress is charged
      // from where the figure actually stands if the march is cut short.
      march.walked = march.route.slice(0, leg).map((point) => ({ ...point }));
    }

    march.node.position.set(march.x, march.y);
    // The figure turns as it walks, one frame ahead of the server: the drop
    // will confirm the same angle, and a figure that walked a corridor
    // backwards until it arrived would be the map lying for four seconds.
    const facing = facingFromDelta(march.x - march.lastFacingX, march.y - march.lastFacingY);
    if (facing !== null) {
      march.node.showFacing(facing);
      march.lastFacingX = march.x;
      march.lastFacingY = march.y;
    }
    // A step every stride of ground rather than every so many milliseconds:
    // the march can be interrupted, resumed and stalled, and only distance
    // walked is the same thing a footstep is.
    const scene = this.scene;
    if (scene) {
      const walkedM = travelled * metresPerPixel(scene);
      if (walkedM - march.lastStepAt >= STEP_EVERY_M) {
        march.lastStepAt = walkedM;
        playStepSound();
      }
    }
    this.drawSelectionRing();
    this.drawMarchTrail(march);
    this.onTokenMove?.(march.node.token.id, march.x, march.y, false);
    if (done) {
      this.finishMarch(march.clipped ? 'Koniec ruchu w tej turze — postać zatrzymuje się.' : null);
    }
  };

  /** The line behind a walking figure, so the table can see which way it went. */
  private drawMarchTrail(march: MarchState): void {
    this.walkGraphics.clear();
    this.hideFootprints();
    const scene = this.scene;
    if (!scene) return;
    const half = (march.node.token.size * scene.grid.sizePx) / 2;
    const k = this.overlayScale();
    const trail = [march.start, ...march.walked, { x: march.x, y: march.y }];
    const first = trail[0]!;
    this.walkGraphics.moveTo(first.x + half, first.y + half);
    for (const point of trail.slice(1)) this.walkGraphics.lineTo(point.x + half, point.y + half);
    this.walkGraphics.stroke({
      color: WALK_COLOR,
      width: 3 * k,
      alpha: 0.7,
      cap: 'round',
      join: 'round',
    });
  }

  /**
   * Where a stopped figure actually stands, and the route it is billed for.
   *
   * The snap is the awkward part. A march is cut mid-leg, the server snaps
   * whatever position it is sent, and a snap forward can cost up to half a
   * square that the budget no longer has — turning an interruption into a
   * refusal and a snap-back. So a landing that no longer fits walks *back* to
   * the last waypoint that does; the figure stops a step short rather than
   * having the whole move rejected.
   */
  private marchLanding(
    march: MarchState,
    scene: SceneView,
  ): { point: ScenePoint; walked: ScenePoint[] } {
    const snapScene = this.snapScene();
    const snapped = snapScene
      ? snapTokenPosition(march.x, march.y, march.node.token.size, snapScene)
      : { x: march.x, y: march.y };
    const budget = march.budget;
    if (!budget) return { point: snapped, walked: march.walked };
    const limit = budget.metresLeft / budget.costFactor + 0.05;
    const fits = (walked: readonly ScenePoint[], end: ScenePoint): boolean =>
      polylineMetres([march.start, ...walked, end], scene) <= limit;
    if (fits(march.walked, snapped)) return { point: snapped, walked: march.walked };
    for (let i = march.walked.length - 1; i >= 0; i--) {
      const walked = march.walked.slice(0, i);
      const end = march.walked[i]!;
      if (fits(walked, end)) return { point: end, walked };
    }
    return { point: march.start, walked: [] };
  }

  /**
   * Ends a march: commit where the figure stopped, and say why if it matters.
   *
   * `commit` is false when the march ended because its *token* did — a scene
   * switch, a deleted figure, the renderer being torn down. Reporting a landing
   * for a token that no longer exists would charge a turn for a walk nobody can
   * see, and the position the server holds is already the right one.
   */
  private finishMarch(note: string | null, commit = true): void {
    const march = this.march;
    if (!march) return;
    this.march = null;
    this.walkGraphics.clear();
    this.hideFootprints();

    const scene = this.scene;
    if (commit && scene && !march.node.destroyed) {
      const { point, walked } = this.marchLanding(march, scene);
      march.node.position.set(point.x, point.y);
      const path = thinWalk([...walked, point], TOKEN_PATH_MAX_POINTS);
      this.onTokenMove?.(march.node.token.id, point.x, point.y, true, path);
      // The line the figure walked outlives the walk by a second and a half
      // (stage 27j): „which way did he come in?" is asked *after* somebody
      // stops, and until now the answer was cleared on the same frame.
      this.trail = {
        points: [march.start, ...walked, point],
        half: (march.node.token.size * scene.grid.sizePx) / 2,
        life: TRAIL_FADE_MS,
      };
      this.drawTrail();
    }
    this.onWalkStateChange?.(null);
    if (note) this.onWalkNote?.(note);
  }

  /** Draws the DV bands of a weapon as rings around a token (optional toggle). */
  setRangeRings(centre: ScenePoint | null, rings: RangeRing[]): void {
    if (this.destroyed) return;
    this.lastRingCentre = centre;
    this.lastRings = rings;
    this.rangeGraphics.clear();
    for (const text of this.rangeTexts) text.destroy();
    this.rangeTexts.length = 0;
    if (!centre) return;
    const k = this.overlayScale();

    for (const ring of rings) {
      this.rangeGraphics
        .circle(centre.x, centre.y, ring.radiusPx)
        .stroke({ color: 0x38bdf8, width: 2 * k, alpha: 0.45 });
      const label = new Text({
        text: ring.label,
        style: {
          fontFamily: 'system-ui, sans-serif',
          fontSize: 16,
          fill: 0x7dd3fc,
          stroke: { color: 0x0b1220, width: 4 },
        },
      });
      label.scale.set(k);
      label.position.set(centre.x + ring.radiusPx - 8 * k, centre.y - 22 * k);
      this.rangeLayer.addChild(label);
      this.rangeTexts.push(label);
    }
  }

  /**
   * Redraws the fog of war.
   *
   * The mask cannot be a Pixi mask: the shape list interleaves reveals and
   * re-covers in paint order, and no single mask geometry expresses that. So
   * the fog is composited into a render texture instead — a black sheet over
   * the whole scene, then one Graphics per run of same-mode shapes, reveals
   * drawn with the `erase` blend mode, which punches real transparency rather
   * than painting grey. The texture is deliberately coarse: fog edges gain
   * nothing from pixel precision, and a 4096 px map would otherwise cost
   * 64 MB of VRAM.
   */
  setFog(fog: FogState | null, pending: FogShape | null, isGm: boolean): void {
    if (this.destroyed) return;
    this.lastFog = fog;
    this.lastFogPending = pending;
    this.fogIsGm = isGm;
    const scene = this.scene;

    if (!scene || !fog) {
      this.fogSprite.visible = false;
      return;
    }
    // A dynamic scene draws no fog. What it may have is the GM's overrides, and
    // those are composited into the vision sheet for a player — but the GM has
    // no vision sheet, so this layer is where they get to see their own brush.
    if (!fog.enabled) {
      if (isGm) {
        this.drawOverridePreview(scene, fog.overrides, pending);
      } else {
        this.fogSprite.visible = false;
      }
      return;
    }

    const factor = Math.max(1, Math.max(scene.width, scene.height) / FOG_TEXTURE_MAX_PX);
    const width = Math.max(1, Math.ceil(scene.width / factor));
    const height = Math.max(1, Math.ceil(scene.height / factor));
    if (!this.fogTexture || this.fogTexture.width !== width || this.fogTexture.height !== height) {
      this.fogTexture?.destroy(true);
      this.fogTexture = RenderTexture.create({ width, height, antialias: true });
      this.fogSprite.texture = this.fogTexture;
    }
    this.fogScratch.scale.set(1 / factor);

    // The sheet everything else is carved out of.
    this.fogCover.clear().rect(0, 0, scene.width, scene.height).fill({ color: 0x000000, alpha: 1 });

    const shapes: FogShape[] = pending ? [...fog.shapes, pending] : [...fog.shapes];
    let pass = 0;
    for (let i = 0; i < shapes.length;) {
      const mode = shapes[i]!.mode;
      const graphics = this.fogPass(pass++);
      // `erase` removes the sheet's alpha where a reveal was painted; a
      // re-cover is an ordinary opaque draw on top of it.
      graphics.blendMode = mode === 'reveal' ? 'erase' : 'normal';
      while (i < shapes.length && shapes[i]!.mode === mode) {
        drawFogShape(graphics, shapes[i]!);
        i++;
      }
    }
    for (let i = pass; i < this.fogPasses.length; i++) this.fogPasses[i]!.clear();

    this.app.renderer.render({ container: this.fogScratch, target: this.fogTexture, clear: true });
    this.fogSprite.visible = true;
    this.fogSprite.position.set(0, 0);
    this.fogSprite.setSize(scene.width, scene.height);
    // The GM plans through the fog; players get the real thing.
    this.fogSprite.alpha = isGm ? FOG_GM_ALPHA : 1;
  }

  /**
   * The GM's view of their own overrides on a dynamic scene (stage 18c).
   *
   * Two flat tints instead of the player's composite: black where the players
   * are being kept out, blue where they are being let through. The GM is
   * planning against this, so it has to say „I painted here" rather than
   * pretend to be what a player sees — that is what the player preview button
   * of stage 17a is for.
   */
  private drawOverridePreview(
    scene: SceneView,
    overrides: FogShapeView[],
    pending: FogShape | null,
  ): void {
    const shapes: FogShape[] = pending ? [...overrides, pending] : overrides;
    if (shapes.length === 0) {
      this.fogSprite.visible = false;
      return;
    }
    const factor = Math.max(1, Math.max(scene.width, scene.height) / FOG_TEXTURE_MAX_PX);
    const width = Math.max(1, Math.ceil(scene.width / factor));
    const height = Math.max(1, Math.ceil(scene.height / factor));
    if (!this.fogTexture || this.fogTexture.width !== width || this.fogTexture.height !== height) {
      this.fogTexture?.destroy(true);
      this.fogTexture = RenderTexture.create({ width, height, antialias: true });
      this.fogSprite.texture = this.fogTexture;
    }
    this.fogScratch.scale.set(1 / factor);
    // No sheet at all here: the base is transparent and each shape adds its own
    // tint, so „reveal" is visible as itself rather than as a hole in nothing.
    this.fogCover.clear();

    let pass = 0;
    for (let i = 0; i < shapes.length;) {
      const mode = shapes[i]!.mode;
      const graphics = this.fogPass(pass++);
      graphics.blendMode = 'normal';
      graphics.alpha = mode === 'reveal' ? OVERRIDE_GM_REVEAL_ALPHA : OVERRIDE_GM_HIDE_ALPHA;
      graphics.tint = mode === 'reveal' ? OVERRIDE_GM_REVEAL_COLOR : 0x000000;
      while (i < shapes.length && shapes[i]!.mode === mode) {
        drawFogShape(graphics, shapes[i]!);
        i++;
      }
    }
    for (let i = pass; i < this.fogPasses.length; i++) this.fogPasses[i]!.clear();

    this.app.renderer.render({ container: this.fogScratch, target: this.fogTexture, clear: true });
    this.fogSprite.visible = true;
    this.fogSprite.position.set(0, 0);
    this.fogSprite.setSize(scene.width, scene.height);
    this.fogSprite.alpha = 1;
  }

  /**
   * Lazily grows the pool of blend passes and hands back a cleared one.
   *
   * Alpha and tint are reset along with the geometry: the same pool draws the
   * fog (opaque black) and the GM's override preview (tinted and translucent),
   * and a pass that kept last frame's tint would paint the fog blue.
   */
  private fogPass(index: number): Graphics {
    let graphics = this.fogPasses[index];
    if (!graphics) {
      graphics = new Graphics();
      this.fogPasses[index] = graphics;
      this.fogScratch.addChild(graphics);
    }
    graphics.clear();
    graphics.alpha = 1;
    graphics.tint = 0xffffff;
    return graphics;
  }

  /**
   * Arms or disarms the cover tool (stage 16c). Leaving it mid-drag drops the
   * rectangle rather than storing half of it.
   */
  setCoverTool(settings: CoverSettings): void {
    this.cover = settings;
    if (!settings.armed) this.cancelCoverRect();
    this.applyMapCursor();
  }

  /** Drops the rectangle being dragged without sending it (Esc, tool change). */
  cancelCoverRect(): boolean {
    if (!this.coverRectStart) return false;
    this.coverRectStart = null;
    this.coverRectEnd = null;
    this.viewport?.plugins.resume('drag');
    this.drawCoverLayer();
    return true;
  }

  /** The dragged rectangle in scene pixels, or null when it was a stray click. */
  private coverGestureRect(): {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null {
    const start = this.coverRectStart;
    const end = this.coverRectEnd;
    if (!start || !end) return null;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (width < COVER_MIN_SIZE_PX || height < COVER_MIN_SIZE_PX) return null;
    return { x, y, width, height };
  }

  /**
   * Arms or disarms the defended-zone tool (stage 26f) — the cover tool's own
   * bargain, including dropping a half-dragged rectangle on the way out.
   */
  setZoneTool(settings: ZoneSettings): void {
    this.zone = settings;
    if (!settings.armed) this.cancelZoneRect();
    this.applyMapCursor();
  }

  cancelZoneRect(): boolean {
    if (!this.zoneRectStart) return false;
    this.zoneRectStart = null;
    this.zoneRectEnd = null;
    this.viewport?.plugins.resume('drag');
    this.drawZoneLayer();
    return true;
  }

  private zoneGestureRect(): { x: number; y: number; width: number; height: number } | null {
    const start = this.zoneRectStart;
    const end = this.zoneRectEnd;
    if (!start || !end) return null;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (width < ZONE_MIN_SIZE_PX || height < ZONE_MIN_SIZE_PX) return null;
    return { x, y, width, height };
  }

  /**
   * The defended-zone layer (stage 26f).
   *
   * A zone has to read as „the ground here will do something to you", which is a
   * different statement from a cover's „this will stop a bullet" and from smoke's
   * „this makes things harder". So: hazard amber, a dashed edge, and no fill
   * heavy enough to hide the floor — plus two states worth telling apart at a
   * glance. A **disarmed** zone is drawn pale, because a switched-off trap is
   * still a thing the GM has to see; a zone the viewer only has because somebody
   * **spotted** it gets a dotted edge, so a player knows they are looking at
   * something they found rather than at furniture.
   */
  setZones(zones: DefenseZoneView[]): void {
    if (this.destroyed) return;
    this.lastZones = zones;
    this.drawZoneLayer();
    this.refreshSceneSelectOutline('zone');
  }

  private drawZoneLayer(): void {
    if (this.destroyed) return;
    const k = this.overlayScale();
    this.zoneGraphics.clear();
    const seen = new Set<number>();

    for (const zone of this.lastZones) {
      seen.add(zone.id);
      const standing = zoneStanding(zone);
      const live = standing && zone.armed;
      this.zoneGraphics
        .rect(zone.x, zone.y, zone.width, zone.height)
        .fill({ color: ZONE_FILL_COLOR, alpha: live ? 0.22 : 0.08 })
        .stroke({
          color: live ? ZONE_STROKE_COLOR : ZONE_IDLE_COLOR,
          width: (live ? 3 : 2) * k,
          alpha: live ? 0.9 : 0.5,
        });

      // Diagonal hatching, drawn only while the system is live: it is the one
      // mark that survives at table zoom without a legend, and it stops a
      // disarmed zone from looking like an armed one at a glance.
      if (live) {
        const step = 22 * k;
        const span = zone.width + zone.height;
        for (let offset = 0; offset < span; offset += step) {
          const x1 = zone.x + Math.min(offset, zone.width);
          const y1 = zone.y + Math.max(0, offset - zone.width);
          const x2 = zone.x + Math.max(0, offset - zone.height);
          const y2 = zone.y + Math.min(offset, zone.height);
          this.zoneGraphics
            .moveTo(x1, y1)
            .lineTo(x2, y2)
            .stroke({ color: ZONE_STROKE_COLOR, width: 1 * k, alpha: 0.28 });
        }
      }

      let label = this.zoneLabels.get(zone.id);
      if (!label) {
        label = new Text({
          text: '',
          style: {
            fontFamily: 'system-ui, sans-serif',
            fontSize: 14,
            fill: 0xffe2b0,
            stroke: { color: 0x000000, width: 3 },
          },
        });
        label.anchor.set(0.5, 0.5);
        this.zoneLabels.set(zone.id, label);
        this.zoneLayer.addChild(label);
      }
      label.text = zoneLabel(zone);
      label.scale.set(k);
      label.alpha = live ? 0.95 : 0.55;
      label.position.set(zone.x + zone.width / 2, zone.y + zone.height / 2);
    }

    for (const [id, label] of this.zoneLabels) {
      if (seen.has(id)) continue;
      this.zoneLabels.delete(id);
      label.destroy();
    }

    const pending = this.zoneRectStart && this.zoneRectEnd ? this.zoneGestureRect() : null;
    if (pending) {
      this.zoneGraphics
        .rect(pending.x, pending.y, pending.width, pending.height)
        .fill({ color: ZONE_FILL_COLOR, alpha: 0.18 })
        .stroke({ color: ZONE_STROKE_COLOR, width: 2 * k, alpha: 0.8 });
    }
  }

  /**
   * The cover layer (stage 16c) — the one map object everybody sees, so this
   * runs for players as well as for the GM.
   *
   * What it has to say in one glance is „will this stop a bullet, and for how
   * much longer": hence the body-point bar along the top edge, and hence a
   * wrecked cover drawn as a pale outline rather than removed. A wreck is still
   * scenery, and „the car is gone" would be a worse lie than „the car is a
   * wreck" — it stopped being cover, not being there.
   */
  setCovers(covers: CoverView[]): void {
    if (this.destroyed) return;
    this.lastCovers = covers;
    this.drawCoverLayer();
    this.refreshSceneSelectOutline('cover');
  }

  private drawCoverLayer(): void {
    if (this.destroyed) return;
    const k = this.overlayScale();
    this.coverGraphics.clear();
    const seen = new Set<number>();

    for (const cover of this.lastCovers) {
      seen.add(cover.id);
      const standing = coverStanding(cover);
      this.coverGraphics
        .rect(cover.x, cover.y, cover.width, cover.height)
        .fill({ color: COVER_FILL_COLOR, alpha: standing ? 0.32 : 0.1 })
        .stroke({
          color: standing ? COVER_STROKE_COLOR : COVER_WRECK_COLOR,
          width: (standing ? 3 : 2) * k,
          alpha: standing ? 0.95 : 0.5,
        });

      if (standing && cover.hpMax > 0) {
        // The bar rides on the top edge rather than floating above it: at table
        // zoom anything detached from the rectangle reads as a separate object.
        const ratio = Math.max(0, Math.min(1, cover.hpCurrent / cover.hpMax));
        const height = 4 * k;
        this.coverGraphics
          .rect(cover.x, cover.y, cover.width, height)
          .fill({ color: 0x000000, alpha: 0.45 })
          .rect(cover.x, cover.y, cover.width * ratio, height)
          .fill({ color: coverBarColor(ratio), alpha: 0.9 });
      }

      let label = this.coverLabels.get(cover.id);
      if (!label) {
        label = new Text({
          text: '',
          style: {
            fontFamily: 'system-ui, sans-serif',
            fontSize: 14,
            fill: 0xf2f4f8,
            stroke: { color: 0x000000, width: 3 },
          },
        });
        label.anchor.set(0.5, 0.5);
        this.coverLabels.set(cover.id, label);
        this.coverLayer.addChild(label);
      }
      label.text = standing
        ? `${cover.name} ${cover.hpCurrent}/${cover.hpMax}`
        : `${cover.name} (wrak)`;
      label.scale.set(k);
      label.alpha = standing ? 0.95 : 0.5;
      label.position.set(cover.x + cover.width / 2, cover.y + cover.height / 2);
    }

    for (const [id, label] of this.coverLabels) {
      if (seen.has(id)) continue;
      this.coverLabels.delete(id);
      label.destroy();
    }

    // The rectangle under the pointer, while the GM is dragging one out.
    const pending = this.coverRectStart && this.coverRectEnd ? this.coverGestureRect() : null;
    if (pending) {
      this.coverGraphics
        .rect(pending.x, pending.y, pending.width, pending.height)
        .fill({ color: COVER_FILL_COLOR, alpha: 0.2 })
        .stroke({ color: COVER_STROKE_COLOR, width: 2 * k, alpha: 0.8 });
    }
  }

  /**
   * The smoke layer (stage 16h) — drawn for everybody, like the covers.
   *
   * A cloud has to read as „the ground here is worse" and not as „something is
   * standing here", so it is a soft grey square with a dashed edge and no bar,
   * no label box and no outline weight. It sits *under* the tokens: a figure in
   * smoke is still a figure, and burying it would cost the one thing the layer
   * exists to show — who is inside.
   */
  setSmoke(smoke: SmokeView[]): void {
    if (this.destroyed) return;
    this.lastSmoke = smoke;
    this.drawSmokeLayer();
  }

  private drawSmokeLayer(): void {
    if (this.destroyed) return;
    const k = this.overlayScale();
    this.smokeGraphics.clear();
    const seen = new Set<number>();

    const scene = this.scene;
    for (const cloud of this.lastSmoke) {
      seen.add(cloud.id);
      const side = scene ? smokeSidePx(cloud, scene) : 0;
      if (side <= 0) continue;
      const x = cloud.x - side / 2;
      const y = cloud.y - side / 2;
      this.smokeGraphics
        .rect(x, y, side, side)
        .fill({ color: SMOKE_FILL_COLOR, alpha: 0.42 })
        .stroke({ color: SMOKE_STROKE_COLOR, width: 2 * k, alpha: 0.6 });

      let label = this.smokeLabels.get(cloud.id);
      if (!label) {
        label = new Text({
          text: '',
          style: {
            fontFamily: 'system-ui, sans-serif',
            fontSize: 14,
            fill: 0xe6e8ec,
            stroke: { color: 0x000000, width: 3 },
          },
        });
        label.anchor.set(0.5, 0.5);
        this.smokeLabels.set(cloud.id, label);
        this.smokeLayer.addChild(label);
      }
      // The penalty is the whole point of the square, so it is on the square.
      label.text = `${cloud.name} ${cloud.penalty}`;
      label.scale.set(k);
      label.alpha = 0.75;
      label.position.set(cloud.x, cloud.y);
    }

    for (const [id, label] of this.smokeLabels) {
      if (seen.has(id)) continue;
      this.smokeLabels.delete(id);
      label.destroy();
    }
  }

  /**
   * Arms or disarms the wall tool. Like every other map tool it takes the left
   * button off the viewport — a drag has to mean one thing at a time.
   */
  setWallTool(settings: WallSettings): void {
    const wasArmed = this.wall.armed;
    this.wall = settings;
    // Putting the tool away drops the chain being traced. Half a wall left
    // hanging while the next click means something else also leaves the map
    // un-draggable, because tracing pauses the drag plugin.
    if (wasArmed && !settings.armed) this.cancelWallChain();
    this.drawWallLayer();
    this.applyMapCursor();
  }

  /**
   * Drops the chain being traced without sending it (Esc, tool change).
   * Returns whether there was anything to drop, so Esc can cancel the chain
   * first and only put the tool away on a second press — one mis-click must
   * not cost a whole floor plan, and an Esc that only ever cancelled would
   * leave no way out of the tool.
   */
  cancelWallChain(): boolean {
    if (!this.wallPoints) return false;
    this.wallPoints = null;
    this.wallCursor = null;
    this.viewport?.plugins.resume('drag');
    this.drawWallLayer();
    return true;
  }

  /**
   * Closes the chain being traced and hands it over. Called on a double click,
   * on Enter, and on the click that lands back on the starting point — the
   * three ways a floor plan is normally finished.
   */
  finishWallChain(): void {
    const points = this.wallPoints;
    this.wallPoints = null;
    this.wallCursor = null;
    // Tracing paused the viewport's drag so a chain click could never also pan
    // the map; every exit from the gesture has to hand it back.
    this.viewport?.plugins.resume('drag');
    if (points && points.length >= 2) this.onWallChain?.(points.map((point) => ({ ...point })));
    this.drawWallLayer();
  }

  /** Where a drawn point actually lands: existing endpoints first, grid second. */
  private snapWall(point: ScenePoint): ScenePoint {
    const scene = this.scene;
    const gridSizePx =
      this.wall.snapGrid && scene && scene.gridMode === 'grid' ? scene.grid.sizePx : null;
    return snapWallPoint(point, this.lastWalls, { gridSizePx });
  }

  /**
   * The wall layer (GM only) plus the opening glyphs (also the players', for the
   * doors and windows they were given). Redrawn whole on every change — a scene
   * holds tens of segments, and a diff would buy nothing but a way to get out of
   * step.
   */
  setWalls(walls: WallView[], openings: WallView[]): void {
    if (this.destroyed) return;
    this.lastWalls = walls;
    this.lastOpenings = openings;
    this.drawWallLayer();
    this.refreshSceneSelectOutline('wall');
  }

  private drawWallLayer(): void {
    if (this.destroyed) return;
    const k = this.overlayScale();
    this.wallGraphics.clear();

    for (const wall of this.lastWalls) {
      const open = isOpening(wall) && wall.open;
      this.wallGraphics
        .moveTo(wall.x1, wall.y1)
        .lineTo(wall.x2, wall.y2)
        .stroke({
          color: wall.locked ? WALL_LOCKED_COLOR : WALL_COLORS[wall.kind],
          width: 4 * k,
          // Anything standing open lets sight through; drawing it paler is what
          // makes „what is blocking right now?" readable without clicking. A
          // *closed* window is drawn solid since stage 18d — it stops everyone
          // who is not standing at it — and stays cyan, so the kind is still
          // legible at a glance.
          alpha: open ? 0.35 : 0.85,
          cap: 'round',
        });
      // Endpoints are the thing that has to line up exactly — a two-pixel gap
      // between segments is a slit light pours through, and invisible at the
      // zoom a floor plan is traced at.
      for (const end of [
        { x: wall.x1, y: wall.y1 },
        { x: wall.x2, y: wall.y2 },
      ]) {
        this.wallGraphics.circle(end.x, end.y, 4 * k).fill({ color: 0xffffff, alpha: 0.5 });
      }
    }

    // The chain in progress, with the segment that follows the pointer.
    const chain = this.wallPoints;
    if (chain && chain.length > 0) {
      const preview = this.wallCursor ? [...chain, this.wallCursor] : chain;
      const first = preview[0]!;
      this.wallGraphics.moveTo(first.x, first.y);
      for (const point of preview.slice(1)) this.wallGraphics.lineTo(point.x, point.y);
      this.wallGraphics.stroke({
        color: WALL_COLORS[this.wall.kind],
        width: 4 * k,
        alpha: 0.6,
        cap: 'round',
      });
      for (const point of preview) {
        this.wallGraphics.circle(point.x, point.y, 5 * k).fill({ color: 0xffffff, alpha: 0.8 });
      }
    }

    this.syncOpeningGlyphs(k);
  }

  /**
   * Clickable handles for doors and windows — the only wall objects a player may
   * ever touch.
   *
   * The padlock badge (stage 18d) is driven by `locked` alone and needs no notion
   * of who is looking: the server scrubs that flag out of every player's opening
   * list, so a `true` here can only have arrived on the GM's own socket. The data
   * is the gate, which is one fewer thing to get wrong than a role check would be.
   *
   * Both the glyph and the badge are refreshed on every pass rather than only at
   * creation: the GM can retype a door into a window under the same row id, and a
   * cached 🚪 over a window would be the map lying about what is there.
   */
  private syncOpeningGlyphs(k: number): void {
    const seen = new Set<number>();
    for (const opening of this.lastOpenings) {
      seen.add(opening.id);
      let node = this.openingNodes.get(opening.id);
      if (!node) {
        node = new Container();
        const glyph = new Text({
          text: '🚪',
          style: { fontFamily: 'system-ui, sans-serif', fontSize: 22 },
        });
        glyph.anchor.set(0.5, 0.5);
        glyph.label = 'glyph';
        node.addChild(glyph);
        const bolt = new Text({
          text: '🔒',
          style: { fontFamily: 'system-ui, sans-serif', fontSize: 13 },
        });
        bolt.anchor.set(0.5, 0.5);
        // Off the corner rather than over it: the glyph still has to read as a
        // door or a pane, and the eye is meant to catch the lock second.
        bolt.position.set(11, -11);
        bolt.visible = false;
        bolt.label = 'bolt';
        node.addChild(bolt);
        node.eventMode = 'static';
        node.cursor = 'pointer';
        node.on('pointerdown', (event: FederatedPointerEvent) => {
          if (event.button !== 0) return;
          // Przy uzbrojonym narzędziu ścian klik należy do warstwy (27k):
          // pierwszy zaznacza segment, dwuklik otwiera jego kartę. Klamka
          // działa wtedy, gdy narzędzie jest odłożone — tak jak przy stole.
          if (this.wall.armed) return;
          event.stopPropagation();
          this.onOpeningToggle?.(opening.id);
        });
        this.openingNodes.set(opening.id, node);
        this.wallLayer.addChild(node);
      }
      const centre = wallMidpoint(opening);
      node.position.set(centre.x, centre.y);
      node.scale.set(k);
      // Anything standing open is dimmed, so „what is blocking right now?" reads
      // from across the map without clicking — the same language the segments
      // themselves speak.
      node.alpha = opening.open ? 0.45 : 1;
      const glyph = node.getChildByLabel('glyph');
      if (glyph instanceof Text) glyph.text = opening.kind === 'window' ? '🪟' : '🚪';
      const bolt = node.getChildByLabel('bolt');
      if (bolt) bolt.visible = opening.locked;
    }

    for (const [id, node] of this.openingNodes) {
      if (seen.has(id)) continue;
      this.openingNodes.delete(id);
      node.destroy({ children: true });
    }
  }

  /**
   * Redraws the player's field of view (stages 18a, 18b).
   *
   * The same composite as the fog, for the same reason: a black sheet over the
   * scene with the visible polygons punched out of it by the `erase` blend
   * mode. `active` is the scene's visibility mode — with it off nothing is
   * drawn at all, while an *empty* polygon list with it on is a real answer:
   * a player with no token on the scene sees nothing.
   *
   * On a dark scene a third pass paints the unlit part back in from `mask`, so
   * what stays transparent is the intersection of „in view" and „lit". Doing it
   * as a paint-back rather than an intersection is what lets the polygons stay
   * crisp while the light keeps a soft edge — and it is the only arrangement
   * that works without the client ever holding a light's true outline.
   */
  setVision(polygons: ScenePoint[][], active: boolean, mask?: LightMask | null): void {
    if (this.destroyed) return;
    this.lastVisionPolygons = polygons;
    this.visionActive = active;
    if (mask !== undefined) this.lastLightMask = mask;
    this.redrawVision();
  }

  /**
   * The party's memory of this map (stage 18c). Null is „this scene forgets",
   * which is not the same as an empty mask — a scene that remembers, walked by
   * nobody yet — but they compose identically, so nothing here has to care.
   */
  setExploration(mask: ExplorationMask | null): void {
    if (this.destroyed) return;
    this.lastExploration = mask;
    this.redrawVision();
  }

  /**
   * The GM's overrides for this scene (stage 18c). They arrive on the fog
   * events, because they are painted with the fog brush, but on a dynamic scene
   * they belong to *this* sheet — the fog layer is not drawn there at all.
   */
  setVisionOverrides(overrides: FogShapeView[]): void {
    if (this.destroyed) return;
    this.visionOverrides = overrides;
    this.redrawVision();
  }

  /** Composites the cover a player sees: walls, light, memory, GM overrides. */
  private redrawVision(): void {
    const scene = this.scene;
    const polygons = this.lastVisionPolygons;

    if (!scene || !this.visionActive) {
      this.visionSprite.visible = false;
      this.unlitSprite.visible = false;
      this.exploredSprite.visible = false;
      return;
    }

    const factor = Math.max(1, Math.max(scene.width, scene.height) / FOG_TEXTURE_MAX_PX);
    const width = Math.max(1, Math.ceil(scene.width / factor));
    const height = Math.max(1, Math.ceil(scene.height / factor));
    if (
      !this.visionTexture ||
      this.visionTexture.width !== width ||
      this.visionTexture.height !== height
    ) {
      this.visionTexture?.destroy(true);
      this.visionTexture = RenderTexture.create({ width, height, antialias: true });
      this.visionSprite.texture = this.visionTexture;
    }
    this.visionScratch.scale.set(1 / factor);

    this.visionCover
      .clear()
      .rect(0, 0, scene.width, scene.height)
      .fill({ color: 0x000000, alpha: 1 });
    this.visionCutout.clear();
    this.visionCutout.blendMode = 'erase';
    for (const polygon of polygons) {
      if (polygon.length < 3) continue;
      this.visionCutout.poly(polygon.map((point) => ({ x: point.x, y: point.y })));
      this.visionCutout.fill({ color: 0x000000, alpha: 1 });
    }
    this.updateUnlitSheet(this.lastLightMask);
    this.updateExploredSheet(this.lastExploration);
    this.drawVisionOverrides();

    this.app.renderer.render({
      container: this.visionScratch,
      target: this.visionTexture,
      clear: true,
    });
    this.visionSprite.visible = true;
    this.visionSprite.position.set(0, 0);
    this.visionSprite.setSize(scene.width, scene.height);
  }

  /**
   * Rebuilds the „unlit" sheet from a light mask.
   *
   * The mask is one byte per cell, so it lands first on a canvas of exactly that
   * size — and then goes through a supersampled blur (stage 18c). Bilinear
   * upscaling alone leaves the two boundaries between the three levels visible
   * as concentric rings around every lamp; blurring them turns the pair of steps
   * into a single ramp, which is what light actually does. The wire format is
   * untouched: this is a rendering decision, made where the pixels are.
   *
   * Both canvases and the texture are reused between pushes: at ten masks a
   * second during a drag, allocating them each time would be pure churn.
   */
  private updateUnlitSheet(mask: LightMask | null): void {
    if (!mask || mask.cols <= 0 || mask.rows <= 0) {
      this.unlitSprite.visible = false;
      return;
    }
    const width = mask.cols * UNLIT_SUPERSAMPLE;
    const height = mask.rows * UNLIT_SUPERSAMPLE;
    let canvas = this.unlitCanvas;
    if (!canvas || canvas.width !== width || canvas.height !== height) {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      this.unlitCanvas = canvas;
      this.unlitTexture?.destroy(true);
      this.unlitTexture = Texture.from(canvas);
      this.unlitSprite.texture = this.unlitTexture;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      this.unlitSprite.visible = false;
      return;
    }
    let cells = this.unlitCellCanvas;
    if (!cells || cells.width !== mask.cols || cells.height !== mask.rows) {
      cells = document.createElement('canvas');
      cells.width = mask.cols;
      cells.height = mask.rows;
      this.unlitCellCanvas = cells;
    }
    const cellContext = cells.getContext('2d');
    if (!cellContext) {
      this.unlitSprite.visible = false;
      return;
    }
    const levels = decodeLevelRuns(mask.runs, mask.cols * mask.rows);
    const image = cellContext.createImageData(mask.cols, mask.rows);
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i]!;
      // Black throughout (the RGB bytes stay zero); only the opacity differs,
      // which is what makes this a cover rather than a picture.
      image.data[i * 4 + 3] =
        level === LIGHT_BRIGHT ? 0 : level === LIGHT_DIM ? Math.round(DIM_COVER_ALPHA * 255) : 255;
    }
    cellContext.putImageData(image, 0, 0);

    // Blown up and blurred, so the three levels become one ramp. The blur pulls
    // transparency in from outside the canvas at its border, which is harmless:
    // the outer ring of cells lies outside the viewer's polygon, where the cover
    // underneath was never erased and is opaque on its own.
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.filter = `blur(${UNLIT_BLUR_PX}px)`;
    context.drawImage(cells, 0, 0, canvas.width, canvas.height);
    context.filter = 'none';
    this.unlitTexture?.source.update();
    this.unlitSprite.visible = true;
    this.unlitSprite.position.set(mask.x, mask.y);
    this.unlitSprite.setSize(mask.cols * mask.cell, mask.rows * mask.cell);
  }

  /**
   * Rebuilds the „already explored" sheet (stage 18c).
   *
   * A partial erase rather than a hole: `EXPLORED_ERASE_ALPHA` is chosen so a
   * fully covered cell lands exactly on `DIM_COVER_ALPHA`, the same grey the
   * light mask uses for „made out, not seen clearly". Memory and dim light
   * reading the same is the point — both mean „you know the shape of this".
   */
  private updateExploredSheet(mask: ExplorationMask | null): void {
    if (!mask || mask.cols <= 0 || mask.rows <= 0) {
      this.exploredSprite.visible = false;
      return;
    }
    let canvas = this.exploredCanvas;
    if (!canvas || canvas.width !== mask.cols || canvas.height !== mask.rows) {
      canvas = document.createElement('canvas');
      canvas.width = mask.cols;
      canvas.height = mask.rows;
      this.exploredCanvas = canvas;
      this.exploredTexture?.destroy(true);
      this.exploredTexture = Texture.from(canvas);
      this.exploredSprite.texture = this.exploredTexture;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      this.exploredSprite.visible = false;
      return;
    }
    const cells = decodeFlagRuns(mask.runs, mask.cols * mask.rows);
    const image = context.createImageData(mask.cols, mask.rows);
    const strength = Math.round(EXPLORED_ERASE_ALPHA * 255);
    for (let i = 0; i < cells.length; i++) image.data[i * 4 + 3] = cells[i] ? strength : 0;
    context.putImageData(image, 0, 0);
    this.exploredTexture?.source.update();
    this.exploredSprite.visible = true;
    this.exploredSprite.position.set(0, 0);
    this.exploredSprite.setSize(mask.cols * mask.cell, mask.rows * mask.cell);
  }

  /**
   * Draws the GM's overrides into the cover (stage 18c), in paint order.
   *
   * Last word on the sheet, matching what the server already decided about the
   * tokens: `hide` is an opaque draw that no amount of light undoes, `reveal` an
   * erase that no wall undoes. Same two blend modes the fog uses, for the same
   * reason — and the same rule that the newest shape covering a point wins.
   */
  private drawVisionOverrides(): void {
    const shapes = this.visionOverrides;
    let pass = 0;
    for (let i = 0; i < shapes.length;) {
      const mode = shapes[i]!.mode;
      const graphics = this.overridePass(pass++);
      graphics.blendMode = mode === 'reveal' ? 'erase' : 'normal';
      while (i < shapes.length && shapes[i]!.mode === mode) {
        drawFogShape(graphics, shapes[i]!);
        i++;
      }
    }
    for (let i = pass; i < this.overridePasses.length; i++) this.overridePasses[i]!.clear();
  }

  /** Lazily grows the override blend passes and hands back a cleared one. */
  private overridePass(index: number): Graphics {
    let graphics = this.overridePasses[index];
    if (!graphics) {
      graphics = new Graphics();
      this.overridePasses[index] = graphics;
      this.visionScratch.addChild(graphics);
    }
    graphics.clear();
    return graphics;
  }

  /**
   * The coloured glow of the lamps this viewer can see (stage 18b).
   *
   * Additive concentric rings rather than a gradient fill: predictable on every
   * driver, and at table zoom nobody can tell. This layer is decoration — what
   * decides visibility is the mask above and the server's own filtering — so it
   * is free to be approximate.
   */
  setGlows(glows: RenderGlow[]): void {
    if (this.destroyed) return;
    this.lastGlows = glows;
    this.hasFlicker = glows.some((glow) => glow.flicker);
    while (this.glowNodes.length < glows.length) {
      const node = new Graphics();
      node.blendMode = 'add';
      this.glowNodes.push(node);
      this.lightLayer.addChild(node);
    }
    for (let i = 0; i < this.glowNodes.length; i++) {
      const node = this.glowNodes[i]!;
      const glow = glows[i];
      node.clear();
      const clip = this.glowMask(i);
      clip.clear();
      node.mask = null;
      if (!glow) {
        node.visible = false;
        continue;
      }
      node.visible = true;
      node.alpha = 1;
      const color = parseInt(glow.color.slice(1), 16);
      const outer = Math.max(glow.dimPx, glow.brightPx);
      if (outer <= 0) {
        node.visible = false;
        continue;
      }
      for (let ring = GLOW_RING_COUNT; ring >= 1; ring--) {
        const radius = (outer * ring) / GLOW_RING_COUNT;
        // Each ring adds the same amount, so the centre — covered by all of
        // them — ends up brightest without any per-pixel maths.
        node.circle(glow.x, glow.y, radius).fill({
          color,
          alpha: GLOW_ALPHA / GLOW_RING_COUNT,
        });
      }
      // A lamp shut inside a room must not pour colour through its walls. The
      // clip is the light's own raycast, and only the GM ever has one: a player
      // is handed no wall geometry, and for them the darkness cover above this
      // layer does the same job.
      if (glow.clip && glow.clip.length >= 3) {
        clip.poly(glow.clip.map((point: ScenePoint) => ({ x: point.x, y: point.y })));
        clip.fill({ color: 0xffffff, alpha: 1 });
        node.mask = clip;
      }
    }
  }

  /** Lazily grows the glow clip pool and hands back the one for this glow. */
  private glowMask(index: number): Graphics {
    let graphics = this.glowMasks[index];
    if (!graphics) {
      graphics = new Graphics();
      this.glowMasks[index] = graphics;
      this.lightLayer.addChild(graphics);
    }
    return graphics;
  }

  /**
   * Flickering lamps, animated here rather than in the data: a candle mrugające
   * over the network would be an event per frame, and the alpha of a decorative
   * layer is exactly the kind of thing a client may decide for itself.
   */
  /**
   * Ages every live map effect (stage 27i).
   *
   * Driven by the Pixi ticker rather than by `setTimeout`, so a burst and the
   * figures it is aimed at move on the same clock. A scene with nothing going
   * off costs one comparison per frame — the bargain `tickFlicker` struck.
   */
  private readonly tickFx = (): void => {
    if (this.destroyed || !this.fx.busy) return;
    this.fx.setOverlayScale(this.overlayScale());
    this.fx.tick(this.app.ticker.deltaMS);
  };

  /**
   * Plays a batch the server sent. Nothing is validated here: what arrives has
   * already been trimmed to what this viewer may see (`trimMapFxForViewer`).
   */
  playFx(effects: readonly MapFxEffect[]): void {
    if (this.destroyed) return;
    this.fx.setOverlayScale(this.overlayScale());
    this.fx.play(effects);
  }

  private readonly tickFlicker = (): void => {
    // A scene with no flickering lamp costs one comparison per frame.
    if (this.destroyed || !this.hasFlicker) return;
    this.flickerPhase += 0.12;
    for (let i = 0; i < this.lastGlows.length; i++) {
      const glow = this.lastGlows[i]!;
      const node = this.glowNodes[i];
      if (!node || !glow.flicker) continue;
      // Two out-of-phase sines: irregular enough to read as a flame, cheap
      // enough to be free, and never fully dark.
      const wobble =
        Math.sin(this.flickerPhase + i) * 0.6 + Math.sin(this.flickerPhase * 2.7 + i * 1.7) * 0.4;
      node.alpha = 1 - FLICKER_DEPTH * (0.5 - wobble / 2);
    }
  };

  /**
   * Arms or disarms the light tool. Like every other map tool it takes the left
   * button off the viewport — a click has to mean one thing at a time.
   */
  setLightTool(settings: LightSettings): void {
    this.light = settings;
    this.applyMapCursor();
  }

  /**
   * Draws the GM's lamp markers (stage 18b). Players never receive a lamp row,
   * so for them this stays empty and the glow layer is all they see.
   *
   * Each marker carries its outer radius as a dashed-looking ring, because the
   * question a GM asks while dressing a scene is „how far does this reach?" and
   * the glow alone does not answer it once several lamps overlap.
   */
  setLights(lights: LightMarker[]): void {
    if (this.destroyed) return;
    this.lastLights = lights;
    const k = this.overlayScale();
    const seen = new Set<number>();

    for (const light of lights) {
      seen.add(light.id);
      let node = this.lightNodes.get(light.id);
      let ring: Graphics;
      if (!node) {
        node = new Container();
        ring = new Graphics();
        node.addChild(ring);
        const glyph = new Text({
          text: '💡',
          style: { fontFamily: 'system-ui, sans-serif', fontSize: 20 },
        });
        glyph.anchor.set(0.5, 0.5);
        node.addChild(glyph);
        node.eventMode = 'static';
        node.cursor = 'pointer';
        node.on('pointerdown', (event: FederatedPointerEvent) => {
          if (event.button !== 0) return;
          // While a light tool is armed the click belongs to the tool: the
          // eraser has to reach the lamp under the glyph, and „place" retunes it.
          if (this.light.armed) return;
          event.stopPropagation();
          this.onLightToggle?.(light.id);
        });
        this.lightNodes.set(light.id, node);
        this.lightMarkerLayer.addChild(node);
      } else {
        ring = node.children[0] as Graphics;
      }
      node.position.set(light.x, light.y);
      // The glyph is screen-sized (it is a handle), the ring is world-sized (it
      // is a distance) — so only the glyph rescales with the zoom.
      const glyph = node.children[1];
      if (glyph) glyph.scale.set(k);
      ring
        .clear()
        .circle(0, 0, light.radiusPx)
        .stroke({
          color: parseInt(light.color.slice(1), 16),
          width: 2 * k,
          alpha: light.enabled ? 0.7 : 0.25,
        });
      // A switched-off lamp is dimmed, so its state reads from across the map.
      node.alpha = light.enabled ? 1 : 0.4;
    }

    for (const [id, node] of this.lightNodes) {
      if (seen.has(id)) continue;
      this.lightNodes.delete(id);
      node.destroy({ children: true });
    }
    this.refreshSceneSelectOutline('light');
  }

  /**
   * Arms or disarms the access point tool (stage 26b) — GM only, like the lamps.
   */
  setAccessPointTool(settings: AccessPointSettings): void {
    this.netPoint = settings;
    this.applyMapCursor();
  }

  /**
   * Draws the net sockets (stage 26b).
   *
   * Everybody gets this layer, unlike the lamp markers: what a player may know
   * about is decided on the server, and a socket that reached the client is one
   * they have found. Three states read at a glance — wired, dead (no
   * Architecture behind it) and hidden (GM's own preview of what is still to be
   * discovered).
   *
   * The 6 m ring is the point of the marker: „musisz być w promieniu 6 metrów"
   * is a question about standing in the right place, and a glyph alone does not
   * answer it.
   */
  setAccessPoints(points: AccessPointMarker[]): void {
    if (this.destroyed) return;
    this.lastAccessPoints = points;
    const k = this.overlayScale();
    const seen = new Set<number>();
    const scene = this.scene;
    const radiusPx = scene
      ? (NET_ACCESS_RANGE_M * scene.grid.sizePx) / (scene.metersPerSquare || 2)
      : 0;

    for (const point of points) {
      seen.add(point.id);
      let node = this.netPointNodes.get(point.id);
      let ring: Graphics;
      if (!node) {
        node = new Container();
        ring = new Graphics();
        node.addChild(ring);
        // Sylwetka jacka zamiast emoji (etap 27e): 🔌 ma na Windowsie domyślną
        // prezentację tekstową, więc Pixi rysowało czarny, płaski znak, który na
        // ciemnej mapie znikał. Sprite ładuje się asynchronicznie — do czasu
        // wczytania stoi pusty, dokładnie jak naklejki statusów na żetonach.
        const glyph = new Sprite();
        glyph.anchor.set(0.5, 0.5);
        glyph.setSize(NET_POINT_GLYPH_PX, NET_POINT_GLYPH_PX);
        glyph.tint = 0xd6f5ff;
        node.addChild(glyph);
        Assets.load<Texture>(NET_POINT_GLYPH_URL)
          .then((texture) => {
            if (glyph.destroyed) return;
            glyph.texture = texture;
            glyph.setSize(NET_POINT_GLYPH_PX, NET_POINT_GLYPH_PX);
          })
          .catch(() => {
            // Brak pliku nie może zabrać gniazda z mapy — zostaje sam pierścień
            // i podpis, które i tak niosą „tu jest punkt dostępu".
          });
        const label = new Text({
          text: point.name,
          style: {
            fontFamily: 'system-ui, sans-serif',
            fontSize: 13,
            fill: 0xd6f5ff,
            stroke: { color: 0x02121a, width: 4 },
          },
        });
        label.anchor.set(0.5, 0);
        label.position.set(0, 14);
        node.addChild(label);
        node.eventMode = 'static';
        node.cursor = 'pointer';
        node.on('pointerdown', (event: FederatedPointerEvent) => {
          if (event.button !== 0) return;
          // While the tool is armed the click belongs to the tool — the eraser
          // has to be able to reach the socket under its own glyph.
          if (this.netPoint.armed) return;
          event.stopPropagation();
          this.onAccessPointOpen?.(point.id);
        });
        // Only the glyph is a handle. Without this the container's hit area
        // would be the union of its children — the 6 m ring and the label —
        // and a figure standing on the socket could no longer be clicked,
        // dragged or right-clicked, because the marker sits above the tokens.
        node.hitArea = new Circle(0, 0, 1);
        this.netPointNodes.set(point.id, node);
        this.netPointLayer.addChild(node);
      } else {
        ring = node.children[0] as Graphics;
      }
      node.position.set(point.x, point.y);
      const glyph = node.children[1] as Sprite | undefined;
      // `setSize` zapisuje się w skali sprite'a, więc mnożenie przez `k` musi iść
      // przez rozmiar, a nie przez `scale` — inaczej pierwsze przełączenie zoomu
      // składa ikonę do zera.
      if (glyph) glyph.setSize(NET_POINT_GLYPH_PX * k, NET_POINT_GLYPH_PX * k);
      // The handle is the glyph, so its reach follows the glyph's screen size.
      (node.hitArea as Circle).radius = 13 * k;
      const label = node.children[2] as Text | undefined;
      if (label) {
        label.text = point.name;
        label.scale.set(k);
        label.position.set(0, 14 * k);
      }
      ring
        .clear()
        .circle(0, 0, radiusPx)
        .stroke({ color: point.dead ? 0x8b93a1 : 0x35e0ff, width: 2 * k, alpha: 0.6 });
      // A socket the players cannot see yet is the GM's own preview.
      node.alpha = point.hidden ? 0.45 : 1;
    }

    for (const [id, node] of this.netPointNodes) {
      if (seen.has(id)) continue;
      this.netPointNodes.delete(id);
      node.destroy({ children: true });
    }
    this.refreshSceneSelectOutline('netpoint');
  }

  /** Draws the GM's note pins. Players never receive notes, so this stays empty. */
  setNotes(notes: MapNoteView[]): void {
    if (this.destroyed) return;
    this.lastNotes = notes;
    const k = this.overlayScale();
    const seen = new Set<string>();

    for (const note of notes) {
      seen.add(note.id);
      let node = this.noteNodes.get(note.id);
      if (!node) {
        node = new Container();
        const glyph = new Text({
          text: note.icon,
          style: { fontFamily: 'system-ui, sans-serif', fontSize: 28 },
        });
        glyph.anchor.set(0.5, 1);
        node.addChild(glyph);
        node.eventMode = 'static';
        node.cursor = 'pointer';
        node.on('pointerdown', (event: FederatedPointerEvent) => {
          if (event.button !== 0) return;
          // Przy uzbrojonym narzędziu notatek klik należy do warstwy (27k):
          // pierwszy zaznacza pinezkę, dwuklik otwiera jej kartę. Bez wypuszcz-
          // enia zdarzenia dalej `pointerdown` na widoku nigdy by go nie
          // zobaczył — dokładnie ta sama umowa, którą mają gniazda i lampy.
          if (this.notePlacing) return;
          event.stopPropagation();
          this.onNoteActivate?.(note.id);
        });
        this.noteNodes.set(note.id, node);
        this.noteLayer.addChild(node);
      }
      const glyph = node.children[0] as Text;
      if (glyph.text !== note.icon) glyph.text = note.icon;
      node.position.set(note.x, note.y);
      node.scale.set(k);
    }

    for (const [id, node] of this.noteNodes) {
      if (seen.has(id)) continue;
      this.noteNodes.delete(id);
      node.destroy({ children: true });
    }
    this.refreshSceneSelectOutline('note');
  }

  /**
   * Znacznik miejsca startu drużyny (11.09) — chorągiewka tam, gdzie MG
   * postawił punkt, z kropką na samym punkcie.
   *
   * Rysuje go **wyłącznie MG**: gracz punkt zna (jego kamera z niego korzysta),
   * ale chorągiewka na mapie byłaby rekwizytem, którego przy stole nie ma.
   * Jak pinezka notatki jest skalowany do ekranu, nie do świata, i nie łapie
   * kliknięć — przestawia się go tym samym narzędziem, którym się go stawia.
   */
  setSpawn(point: ScenePoint | null): void {
    if (this.destroyed) return;
    this.lastSpawn = point;
    if (!point) {
      this.spawnNode?.destroy({ children: true });
      this.spawnNode = null;
      return;
    }
    if (!this.spawnNode) {
      const node = new Container();
      const dot = new Graphics();
      dot.circle(0, 0, 4).fill({ color: 0xfacc15, alpha: 0.95 });
      dot.circle(0, 0, 4).stroke({ color: 0x0b1220, width: 1.5, alpha: 0.9 });
      const glyph = new Text({
        text: '🚩',
        style: { fontFamily: 'system-ui, sans-serif', fontSize: 24 },
      });
      // Drzewce chorągiewki stoi w punkcie, a płótno powiewa w prawo i w górę.
      glyph.anchor.set(0.15, 1);
      node.addChild(dot);
      node.addChild(glyph);
      node.eventMode = 'none';
      this.spawnNode = node;
      this.noteLayer.addChild(node);
    }
    this.spawnNode.position.set(point.x, point.y);
    this.spawnNode.scale.set(this.overlayScale());
  }

  /** Re-renders the overlays at the current zoom (labels are screen-sized). */
  private refreshOverlays(): void {
    if (this.destroyed) return;
    this.setRulers(this.lastRulers);
    this.drawMoveOverlay();
    this.drawSelectionRing();
    this.drawGroupRings();
    this.drawAimReticle();
    this.drawWalkPreview();
    this.drawReach();
    this.drawTrail();
    this.setRangeRings(this.lastRingCentre, this.lastRings);
    this.setNotes(this.lastNotes);
    this.setSpawn(this.lastSpawn);
    // Wall handles, door glyphs and lamp handles are screen-sized, like the note
    // pins: at a typical 0.18x map zoom a world-scaled handle is a few pixels.
    this.drawWallLayer();
    // The cover label and its body-point bar are screen-sized for the same
    // reason: the rectangle is world geometry, the reading on it is not.
    this.drawCoverLayer();
    // A cloud's label is screen-sized for the same reason a cover's is: the
    // square is world geometry, the „−4" written on it is not.
    this.drawSmokeLayer();
    this.setLights(this.lastLights);
    // Net sockets carry a screen-sized glyph and a screen-sized label too, and
    // their hit area is measured in the same units — so they have to be redrawn
    // with the rest of the handles rather than only when the list changes.
    this.setAccessPoints(this.lastAccessPoints);
  }

  /**
   * A selection and a march belong to one scene. Both are dropped without a
   * final frame: the tokens they refer to are about to be destroyed, and the
   * server's own positions are the ones that survive a scene switch.
   */
  private clearWalkState(): void {
    this.finishMarch(null, false);
    this.clearAim();
    this.walkWaypoints = [];
    this.walkHover = null;
    this.walkGraphics.clear();
    this.hideFootprints();
    this.selectGraphics.clear();
    this.aimGraphics.clear();
    this.reach = null;
    this.reachGraphics.clear();
    this.trail = null;
    this.trailGraphics.clear();
    this.rotating = null;
    this.setWalkCursor('');
    this.setSelection(null, 'scene');
  }

  private clearTokens(): void {
    if (this.drag) this.endDrag(false);
    if (this.cloneDrag) this.onCloneEnd();
    this.clearWalkState();
    for (const node of this.tokenNodes.values()) node.destroy({ children: true });
    this.tokenNodes.clear();
    this.movableTokens.clear();
    this.tokenLayer.removeChildren();
    // Zaznaczenie grupowe i pingi należą do sceny, którą właśnie zdjęto: obwódki
    // wskazywałyby figury, których nie ma, a ping — miejsce na innej mapie.
    this.groupTokenIds = [];
    this.groupDrag = null;
    this.marquee = null;
    this.drawGroupRings();
    this.clearPings();
  }

  /** Zdejmuje wszystkie kółka pingów — zmiana sceny, zamknięcie mapy. */
  private clearPings(): void {
    for (const ping of this.pings) ping.node.destroy({ children: true });
    this.pings.length = 0;
  }

  private snapScene(): TokenSnapScene | null {
    const scene = this.scene;
    if (!scene) return null;
    return {
      width: scene.width,
      height: scene.height,
      gridMode: scene.gridMode,
      grid: {
        sizePx: scene.grid.sizePx,
        offsetX: scene.grid.offsetX,
        offsetY: scene.grid.offsetY,
      },
    };
  }

  private wireInteraction(node: TokenNode): void {
    // Pixi has no dblclick: count two quick clicks on the same token.
    let lastClickAt = 0;
    node.on('pointerdown', (event: FederatedPointerEvent) => {
      if (event.button === 2) {
        const rect = this.app.canvas.getBoundingClientRect();
        this.onTokenMenu?.(node.tokenId, rect.left + event.global.x, rect.top + event.global.y);
        return;
      }
      if (event.button !== 0) return;
      // A token under the crosshair is a target, not something to pick up —
      // whether the crosshair came from a sheet (16b) or from the weapon in the
      // action bar (16f). The caller decides which of the two is firing.
      if (this.aimTargetFor(node, event.altKey === true)) {
        event.stopPropagation();
        const rect = this.app.canvas.getBoundingClientRect();
        this.onTokenTarget?.(node.tokenId, rect.left + event.global.x, rect.top + event.global.y);
        return;
      }
      // A map tool owns the left button while it is armed. Without this a
      // click that was meant to paint fog or draw a line would *also* grab the
      // token underneath and drag it — the two gestures ran at once, because
      // Pixi bubbles the token's event up to the viewport as well.
      if (this.mapToolArmed) return;
      // `Shift`+klik w figurę: dokłada ją do zaznaczenia albo odejmuje (etap 35).
      // Przed chwytem, bo `Shift` z przeciągnięciem po pustym tle jest ramką —
      // ta sama litera klawisza znaczy w obu miejscach „to samo, i jeszcze to".
      // `stopPropagation`, żeby ten sam gest nie zaczął jednocześnie ramki na
      // widoku pod spodem.
      if (event.shiftKey === true && this.movableTokens.get(node.tokenId) !== false) {
        event.stopPropagation();
        this.onGroupToggle?.(node.tokenId);
        return;
      }
      // Alt+przeciągnięcie: kopia figury tam, gdzie ją upuszczono (etap 35).
      // Dochodzi tu wyłącznie wtedy, gdy `aimTargetFor` wyżej nie uznał figury
      // za cel — a uznaje ją tylko przy uzbrojonej broni. Bez broni w ręku `Alt`
      // na figurze był wolny.
      if (event.altKey === true && this.viewerIsGm && this.viewport) {
        const world = this.viewport.toWorld(event.global.x, event.global.y);
        event.stopPropagation();
        this.cloneDrag = {
          node,
          grabDx: world.x - node.x,
          grabDy: world.y - node.y,
          startGlobalX: event.global.x,
          startGlobalY: event.global.y,
          moved: false,
          at: { x: node.x, y: node.y },
        };
        this.viewport.plugins.pause('drag');
        this.app.stage.eventMode = 'static';
        this.app.stage.on('pointermove', this.onCloneMove);
        this.app.stage.on('pointerup', this.onCloneEnd);
        this.app.stage.on('pointerupoutside', this.onCloneEnd);
        return;
      }
      // The rotation knob (stage 27j) sits outside its figure's ring, which
      // means it regularly lands *on top of another figure* — two people
      // standing in adjacent squares is the normal case, not the odd one. Pixi
      // hands the event to the deepest target first, so without this the knob
      // would be unusable exactly when the map is crowded: the click would pick
      // up the neighbour instead of turning the selection.
      if (this.viewport) {
        const world = this.viewport.toWorld(event.global.x, event.global.y);
        if (this.grabFacingKnob(world)) {
          event.stopPropagation();
          return;
        }
      }
      const now = performance.now();
      if (now - lastClickAt < DOUBLE_CLICK_MS) {
        lastClickAt = 0;
        this.onTokenActivate?.(node.tokenId);
        return;
      }
      lastClickAt = now;
      // Clicking anything while a figure is walking stops it where it stands
      // (stage 16e) — a hand on the map outranks a plan, always.
      if (this.march) {
        this.finishMarch('Marsz przerwany.');
        return;
      }
      // Cudza figura: sterować nią nie wolno, ale **pokazać** ją w pasku owszem
      // (31.08). Do tej pory klik kończył się tu po cichu, przez co gracz nie
      // miał jak zajrzeć w stan figury, której nie prowadzi — a od 31.08 pasek
      // niesie jej rany i formularz łatania. Ognisko paska, nie sterowanie:
      // ring i podgląd marszu zostają przy figurze, którą ten gracz prowadzi.
      if (this.movableTokens.get(node.tokenId) === false) {
        this.onTokenPreview?.(node.tokenId);
        return;
      }
      if (this.drag || !this.viewport) return;
      const world = this.viewport.toWorld(event.global.x, event.global.y);
      this.drag = {
        node,
        grabDx: world.x - node.x,
        grabDy: world.y - node.y,
        startGlobalX: event.global.x,
        startGlobalY: event.global.y,
        moved: false,
        lastX: node.x,
        lastY: node.y,
        path: [{ x: node.x, y: node.y }],
        // A quarter of a square: enough to keep a curve round a corner, small
        // enough that a wobbling hand is not billed for the wobble.
        sampleGap: Math.max(4, (this.scene?.grid.sizePx ?? 100) / 4),
      };
      // Ruch grupowy (etap 35): reszta zaznaczonych jedzie za chwyconą figurą,
      // każda ze swoim przesunięciem. Zapamiętane **w chwili chwytu**, bo tylko
      // wtedy szyk grupy jest tym, co widz miał na ekranie.
      //
      // Warunek `groupDragAllowed` to rozstrzygnięcie MG z 05.09: w walce grupowo
      // się nie chodzi, bo budżet metrów z 14c jest per figura i grupowy chwyt
      // byłby jedyną drogą, która go nie widzi.
      this.groupDrag =
        this.groupDragAllowed &&
        this.groupTokenIds.length > 1 &&
        this.groupTokenIds.includes(node.tokenId)
          ? this.groupTokenIds
              .filter((id) => id !== node.tokenId)
              .map((id) => this.tokenNodes.get(id))
              .filter((other): other is TokenNode => other !== undefined && !other.destroyed)
              .map((other) => ({ node: other, dx: other.x - node.x, dy: other.y - node.y }))
          : null;
      // The viewport must not pan while a token is being dragged.
      this.viewport.plugins.pause('drag');
      this.app.stage.eventMode = 'static';
      this.app.stage.on('pointermove', this.onDragMove);
      this.app.stage.on('pointerup', this.onDragEnd);
      this.app.stage.on('pointerupoutside', this.onDragEnd);
    });
  }

  /**
   * Alt+przeciągnięcie w toku: duch pokazuje, gdzie stanie kopia (etap 35).
   *
   * **Oryginał się nie rusza** — i to jest cała różnica względem zwykłego
   * chwytu. Za kursorem idzie sam obrys (ten sam `dragGhost`, który przy
   * przeciąganiu pokazuje pole docelowe), więc gest widać, a do serwera nie
   * leci ani jedna klatka ruchu figury, która ma stać w miejscu.
   */
  private readonly onCloneMove = (event: FederatedPointerEvent): void => {
    const clone = this.cloneDrag;
    const viewport = this.viewport;
    const snapScene = this.snapScene();
    if (!clone || !viewport || !snapScene) return;
    if (!clone.moved) {
      const dx = event.global.x - clone.startGlobalX;
      const dy = event.global.y - clone.startGlobalY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      clone.moved = true;
    }
    const world = viewport.toWorld(event.global.x, event.global.y);
    const token = clone.node.token;
    const pos = clampTokenPosition(
      world.x - clone.grabDx,
      world.y - clone.grabDy,
      token.size,
      snapScene,
    );
    clone.at = pos;
    const landing =
      snapScene.gridMode === 'grid' ? snapTokenPosition(pos.x, pos.y, token.size, snapScene) : pos;
    const extent = token.size * snapScene.grid.sizePx;
    this.dragGhost
      .clear()
      .rect(landing.x, landing.y, extent, extent)
      .stroke({ color: GROUP_RING_COLOR, width: 2, alpha: 0.95 })
      .fill({ color: GROUP_RING_COLOR, alpha: 0.15 });
  };

  private readonly onCloneEnd = (): void => {
    const clone = this.cloneDrag;
    this.cloneDrag = null;
    this.app.stage.off('pointermove', this.onCloneMove);
    this.app.stage.off('pointerup', this.onCloneEnd);
    this.app.stage.off('pointerupoutside', this.onCloneEnd);
    this.viewport?.plugins.resume('drag');
    this.dragGhost.clear();
    if (!clone) return;
    // Gest bez ruchu **nie klonuje**. Alt+klik w figurę bez uzbrojonej broni nie
    // znaczył dotąd nic i ma nie zacząć znaczyć „postaw drugiego gangera" —
    // przypadkowa kopia jest tańsza do zrobienia niż do zauważenia.
    if (!clone.moved || clone.node.destroyed) return;
    this.onTokenDuplicate?.(clone.node.tokenId, Math.round(clone.at.x), Math.round(clone.at.y));
    // Ślad po geście schodzi razem z nim: `dragEndedAt` pilnuje, żeby puszczenie
    // przycisku nie zostało odczytane jako rozkaz marszu (patrz `clicked`).
    this.dragEndedAt = performance.now();
  };

  private readonly onDragMove = (event: FederatedPointerEvent): void => {
    const drag = this.drag;
    const viewport = this.viewport;
    const snapScene = this.snapScene();
    if (!drag || !viewport || !snapScene) return;

    if (!drag.moved) {
      const dx = event.global.x - drag.startGlobalX;
      const dy = event.global.y - drag.startGlobalY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      drag.node.alpha *= 0.75;
    }

    const world = viewport.toWorld(event.global.x, event.global.y);
    const token = drag.node.token;
    const pos = clampTokenPosition(
      world.x - drag.grabDx,
      world.y - drag.grabDy,
      token.size,
      snapScene,
    );
    // The figure turns towards where the hand is taking it (stage 27j) — the
    // same courtesy a march gets, measured from the previous *sample* rather
    // than the previous frame, because a pixel of pointer travel is not a
    // direction and `facingFromDelta` says so.
    const lastSample = drag.path[drag.path.length - 1]!;
    const dragFacing = facingFromDelta(pos.x - lastSample.x, pos.y - lastSample.y);
    if (dragFacing !== null) drag.node.showFacing(dragFacing);
    drag.node.position.set(pos.x, pos.y);
    drag.lastX = pos.x;
    drag.lastY = pos.y;
    this.samplePath(drag, pos);
    this.drawMoveOverlay();
    this.drawSelectionRing();

    // Ghost outline previews the snapped landing cell.
    this.dragGhost.clear();
    if (snapScene.gridMode === 'grid') {
      const snapped = snapTokenPosition(pos.x, pos.y, token.size, snapScene);
      const extent = token.size * snapScene.grid.sizePx;
      this.dragGhost
        .rect(snapped.x, snapped.y, extent, extent)
        .stroke({ color: 0xfacc15, width: 2, alpha: 0.9 })
        .fill({ color: 0xfacc15, alpha: 0.12 });
    }

    this.onTokenMove?.(token.id, pos.x, pos.y, false);
    this.moveGroupWith(drag.node, snapScene, false);
  };

  /**
   * Przesuwa resztę zaznaczonych figur o tyle, o ile przesunęła się chwycona.
   *
   * Każda jest przycinana do sceny **osobno** (`clampTokenPosition`), więc grupa
   * przy krawędzi mapy zbija się, zamiast wyjeżdżać poza planszę. O to, czy
   * figurze wolno tam stanąć, pyta serwer — po jednym `token:move` na figurę,
   * dokładnie tak, jakby przesunięto je pojedynczo.
   */
  private moveGroupWith(anchor: TokenNode, snapScene: TokenSnapScene, final: boolean): void {
    const group = this.groupDrag;
    if (!group) return;
    for (const member of group) {
      if (member.node.destroyed) continue;
      const free = clampTokenPosition(
        anchor.x + member.dx,
        anchor.y + member.dy,
        member.node.token.size,
        snapScene,
      );
      // Na upuszczeniu przyciągamy do kratki od razu, żeby figura nie skakała
      // dopiero na echo z serwera — tak samo jak robi to chwycona figura.
      const pos = final
        ? snapTokenPosition(free.x, free.y, member.node.token.size, snapScene)
        : free;
      member.node.position.set(pos.x, pos.y);
      this.onTokenMove?.(member.node.tokenId, pos.x, pos.y, final);
    }
    this.drawGroupRings();
  }

  /**
   * Keeps the drag's route without keeping every pointer event.
   *
   * Samples closer together than `sampleGap` are dropped, which is what stops
   * a shaking hand from costing metres. When even the thinned path threatens
   * the payload cap the gap doubles and the whole trail is re-thinned, so a
   * long walk loses detail rather than losing its tail.
   */
  private samplePath(drag: DragState, point: ScenePoint): void {
    const last = drag.path[drag.path.length - 1]!;
    if (Math.hypot(point.x - last.x, point.y - last.y) < drag.sampleGap) return;
    drag.path.push({ x: point.x, y: point.y });
    if (drag.path.length < TOKEN_PATH_MAX_POINTS - 1) return;
    drag.sampleGap *= 2;
    const thinned: ScenePoint[] = [drag.path[0]!];
    for (const candidate of drag.path.slice(1)) {
      const previous = thinned[thinned.length - 1]!;
      if (Math.hypot(candidate.x - previous.x, candidate.y - previous.y) >= drag.sampleGap) {
        thinned.push(candidate);
      }
    }
    drag.path = thinned;
  }

  private readonly onDragEnd = (): void => {
    this.endDrag(true);
  };

  /** Tears down drag state; `commit` sends the snapped final position. */
  private endDrag(commit: boolean): void {
    const drag = this.drag;
    const group = this.groupDrag;
    if (!drag) return;
    this.drag = null;
    this.groupDrag = null;
    this.app.stage.off('pointermove', this.onDragMove);
    this.app.stage.off('pointerup', this.onDragEnd);
    this.app.stage.off('pointerupoutside', this.onDragEnd);
    this.viewport?.plugins.resume('drag');
    this.dragGhost.clear();
    this.drawMoveOverlay();

    // A press that never became a drag is a click, and a click on a figure you
    // may move selects it (stage 16e). Reading the same `DRAG_THRESHOLD_PX` the
    // drag already uses is what keeps the two gestures from competing: below it
    // nothing moved, above it nothing was selected.
    if (!drag.moved && !drag.node.destroyed) {
      this.setSelection(drag.node.tokenId);
      return;
    }
    if (!drag.moved || drag.node.destroyed) return;
    this.dragEndedAt = performance.now();
    const snapScene = this.snapScene();
    const token = drag.node.token;
    const pos = snapScene
      ? snapTokenPosition(drag.lastX, drag.lastY, token.size, snapScene)
      : { x: drag.lastX, y: drag.lastY };
    drag.node.position.set(pos.x, pos.y);
    drag.node.alpha = token.hidden ? 0.5 : 1;
    // The route travels with the drop: the first point is where the token
    // stood, and the server replaces both ends with its own numbers anyway.
    if (commit) this.onTokenMove?.(token.id, pos.x, pos.y, true, drag.path.slice(1));
    // Reszta grupy ląduje **po** chwyconej figurze i bez trasy: idą obok siebie,
    // a nie każda swoją drogą, więc trasa chwyconej jest jedyną, która cokolwiek
    // znaczy. Serwer i tak przycina każdą osobno.
    if (commit && group && snapScene) {
      this.groupDrag = group;
      this.moveGroupWith(drag.node, snapScene, true);
      this.groupDrag = null;
    }
  }

  /**
   * Puts a token back where the server says it is — the snap-back a refused
   * move ends in (stage 14c). The node may already be gone (scene switch), in
   * which case the authoritative position arrives with the next sync anyway.
   */
  snapTokenBack(tokenId: string, x: number, y: number): void {
    if (this.destroyed) return;
    const node = this.tokenNodes.get(tokenId);
    if (!node || node.destroyed) return;
    node.position.set(x, y);
    node.alpha = node.token.hidden ? 0.5 : 1;
  }

  destroy(): void {
    if (this.destroyed) return;
    // Before the flag: a march holds a node and a ticker, and both are about to
    // stop existing. Nothing is committed — the server keeps its own position.
    this.finishMarch(null, false);
    this.destroyed = true;
    const viewport = this.viewport;
    this.viewport = null;
    if (viewport) {
      // Order matters: `Viewport.destroy` unhooks its plugins from the app
      // ticker, so it has to run while that ticker still exists. Destroying
      // the application first kills the ticker and the viewport teardown then
      // throws („Cannot read properties of null (reading 'next')"), which took
      // the whole app down with a white screen whenever the map unmounted —
      // leaving the game for the GM panel, or any HMR reload during a session.
      viewport.destroy({ children: true });
      // The fog scratch container is off-stage, so `destroy({children:true})`
      // above never reaches it — and its render texture is real VRAM.
      this.fogScratch.destroy({ children: true });
      this.fogTexture?.destroy(true);
      this.fogTexture = null;
      this.visionScratch.destroy({ children: true });
      this.visionTexture?.destroy(true);
      this.visionTexture = null;
      // The unlit sheet's texture wraps a canvas of its own, and it lives inside
      // the off-stage scratch container — so nothing above reaches it either.
      this.unlitTexture?.destroy(true);
      this.unlitTexture = null;
      this.unlitCanvas = null;
      this.app.ticker.remove(this.tickFlicker);
      this.app.ticker.remove(this.tickMarch);
      this.app.ticker.remove(this.tickFx);
      // The layer owns sprites and text of its own; the viewport teardown above
      // reaches its container, but its item list still holds the references.
      this.fx.destroy();
      this.app.destroy(true, { children: true });
      this.tokenNodes.clear();
      this.noteNodes.clear();
      this.drawNodes.clear();
      this.openingNodes.clear();
      this.lightNodes.clear();
    }
    // When init is still pending, it destroys the app itself on completion.
  }

  private updateBackground(scene: SceneView): void {
    const url = scene.background?.url ?? null;
    if (scene.background) {
      this.background.width = scene.background.width;
      this.background.height = scene.background.height;
    }
    if (url === this.backgroundUrl) return;
    this.backgroundUrl = url;

    if (!url) {
      this.background.texture = Texture.EMPTY;
      this.background.visible = false;
      return;
    }
    this.onLoadingChange?.(true);
    Assets.load<Texture>(url)
      .then((texture) => {
        // Ignore stale loads: the scene/background changed in the meantime.
        if (this.destroyed || this.backgroundUrl !== url) return;
        this.background.texture = texture;
        this.background.visible = true;
      })
      .catch(() => {
        if (this.backgroundUrl === url) this.background.visible = false;
      })
      .finally(() => {
        if (!this.destroyed) this.onLoadingChange?.(false);
      });
  }

  private drawGrid(scene: SceneView): void {
    this.grid.clear();
    if (scene.gridMode === 'gridless' || !scene.grid.visible) return;
    const size = scene.grid.sizePx;
    if (size < 4) return;

    const offsetX = normalizeGridOffset(scene.grid.offsetX, size);
    const offsetY = normalizeGridOffset(scene.grid.offsetY, size);
    for (let x = offsetX; x <= scene.width; x += size) {
      this.grid.moveTo(x, 0).lineTo(x, scene.height);
    }
    for (let y = offsetY; y <= scene.height; y += size) {
      this.grid.moveTo(0, y).lineTo(scene.width, y);
    }
    // pixelLine keeps the grid crisp at 1 device pixel across zoom levels.
    this.grid.stroke({
      color: parseInt(scene.grid.color.slice(1), 16),
      alpha: scene.grid.alpha,
      pixelLine: true,
    });
  }

  private fitScene(scene: SceneView): void {
    const viewport = this.viewport;
    if (!viewport) return;
    const scale = Math.min(
      viewport.screenWidth / scene.width,
      viewport.screenHeight / scene.height,
    );
    viewport.setZoom(Math.min(Math.max(scale, MIN_ZOOM), 1), true);
    viewport.moveCenter(scene.width / 2, scene.height / 2);
  }
}
