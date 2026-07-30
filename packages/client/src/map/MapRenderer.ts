import {
  Application,
  Assets,
  Container,
  Graphics,
  RenderTexture,
  Sprite,
  Text,
  Texture,
  type FederatedPointerEvent,
} from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type {
  DrawingShape,
  DrawingStyle,
  DrawingView,
  ExplorationMask,
  FogShape,
  FogShapeView,
  FogState,
  LightGlow,
  LightMask,
  MapNoteView,
  ScenePoint,
  SceneView,
  TokenSnapScene,
  TokenView,
  WallKind,
  WallView,
} from '@vtt/shared';
import {
  DRAWING_FILL_ALPHA,
  DRAWING_PATH_MAX_POINTS,
  FOG_STROKE_MAX_POINTS,
  LIGHT_BRIGHT,
  LIGHT_DIM,
  clampTokenPosition,
  decodeFlagRuns,
  decodeLevelRuns,
  formatMetres,
  formatSquares,
  isOpening,
  normalizeGridOffset,
  polylineMetres,
  simplifyPath,
  snapTokenPosition,
  snapWallPoint,
  squaresForDistance,
  wallMidpoint,
  TOKEN_PATH_MAX_POINTS,
} from '@vtt/shared';
import { TokenNode, type TokenNodeCtx } from './TokenNode.js';

/** One measurement drawn on the map: the line plus who is holding it. */
export interface RulerLine {
  points: ScenePoint[];
  /** Label shown at the far end; the local line has none (it is the user's). */
  userName?: string;
  /** Line colour as 0xrrggbb. */
  color: number;
}

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
  mode: 'draw' | 'erase' | 'lock';
  kind: WallKind;
  snapGrid: boolean;
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
  mode: 'place' | 'erase';
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
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;
/** Screen-pixel distance that turns a click into a drag. */
const DRAG_THRESHOLD_PX = 4;
/** Max gap between two clicks on a token to count as a double-click. */
const DOUBLE_CLICK_MS = 350;

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

/** A label as it sits on the map: sized in scene pixels, so it zooms with it. */
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
    | ((tokenId: string, x: number, y: number, final: boolean, path?: ScenePoint[]) => void)
    | null = null;
  /** Right-click on a token; coordinates are browser client px (for the menu). */
  onTokenMenu: ((tokenId: string, clientX: number, clientY: number) => void) | null = null;
  /** Plain click on the map (world px) — used by token placement mode. */
  onMapClick: ((x: number, y: number) => void) | null = null;
  /** Double-click on a token — opens its character sheet (stage 08). */
  onTokenActivate: ((tokenId: string) => void) | null = null;
  /** Click on a token while the crosshair is armed (stage 16). */
  onTokenTarget: ((tokenId: string) => void) | null = null;
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
  /** A drawing gesture finished — send it to the server (stage 17b). */
  onDrawingCreate: ((shape: DrawingShape) => void) | null = null;
  /** Click with the text tool armed: the caller asks for the words (world px). */
  onDrawingTextPlace: ((x: number, y: number) => void) | null = null;
  /** Click with the eraser armed; the caller decides which drawing that hits. */
  onDrawingErase: ((x: number, y: number) => void) | null = null;
  /** A wall chain was closed — send its points to the server (stage 18a). */
  onWallChain: ((points: ScenePoint[]) => void) | null = null;
  /** Click with the wall eraser armed; the caller picks the segment. */
  onWallErase: ((x: number, y: number) => void) | null = null;
  /** Click with the bolt armed (stage 18d); the caller picks the door. */
  onWallLock: ((x: number, y: number) => void) | null = null;
  /** Click on a door or window glyph — open or close it. */
  onOpeningToggle: ((wallId: number) => void) | null = null;
  /** Click with the light tool armed: place a lamp, or retune the one here. */
  onLightPlace: ((x: number, y: number) => void) | null = null;
  /** Click with the light eraser armed; the caller picks the lamp. */
  onLightErase: ((x: number, y: number) => void) | null = null;
  /** Click on a lamp marker with no tool armed — switch it on or off. */
  onLightToggle: ((lightId: number) => void) | null = null;

  private readonly app = new Application();
  private viewport: Viewport | null = null;
  private readonly background = new Sprite();
  private readonly grid = new Graphics();
  /** Public drawings: map content, so they sit under the tokens (stage 17b). */
  private readonly drawLayer = new Container();
  /** GM-layer drawings — above the fog, next to the note pins. */
  private readonly gmDrawLayer = new Container();
  private readonly drawNodes = new Map<number, Container>();
  /** The gesture in progress; never leaves the renderer until it is finished. */
  private readonly drawPreview = new Graphics();
  private readonly rangeLayer = new Container();
  private readonly rangeGraphics = new Graphics();
  private readonly tokenLayer = new Container();
  private readonly dragGhost = new Graphics();
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
  private erasing = false;
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
  private lastWalls: WallView[] = [];
  private lastOpenings: WallView[] = [];
  private lastVisionPolygons: ScenePoint[][] = [];
  private visionActive = false;
  private lastLightMask: LightMask | null = null;
  private lastGlows: RenderGlow[] = [];
  private lastLights: LightMarker[] = [];
  /** Wall tool settings; `armed` decides whether a click traces or erases. */
  private wall: WallSettings = { armed: false, mode: 'draw', kind: 'wall', snapGrid: true };
  /** The chain being traced: confirmed points plus the one under the pointer. */
  private wallPoints: ScenePoint[] | null = null;
  private wallCursor: ScenePoint | null = null;
  /** Light tool settings; `armed` decides whether a click places or removes. */
  private light: LightSettings = { armed: false, mode: 'place' };
  /** Ticker phase for flickering lamps — renderer-side, never a network event. */
  private flickerPhase = 0;
  private hasFlicker = false;

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: host, backgroundAlpha: 0, antialias: true });
    // React StrictMode may unmount while init is in flight.
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    host.appendChild(this.app.canvas);

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
    // Range rings sit under the tokens so they never hide a portrait; the
    // ruler sits above everything, because a measurement is meant to be read.
    this.rangeLayer.addChild(this.rangeGraphics);
    viewport.addChild(this.rangeLayer);
    viewport.addChild(this.tokenLayer);
    viewport.addChild(this.dragGhost);
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
    this.app.stage.addChild(viewport);
    this.viewport = viewport;
    this.app.ticker.add(this.tickFlicker);

    viewport.on('clicked', (event) => {
      // A wall or lamp click was already handled on pointerdown; letting it
      // through here would also drop a token in the middle of a floor plan.
      if (this.wall.armed || this.light.armed) return;
      if (this.notePlacing) {
        this.onNotePlace?.(Math.round(event.world.x), Math.round(event.world.y));
        return;
      }
      this.onMapClick?.(event.world.x, event.world.y);
    });

    this.wireRuler(viewport);
    // Overlay labels are sized in screen pixels, so a zoom has to redraw them.
    viewport.on('zoomed', () => this.refreshOverlays());
    viewport.on('zoomed-end', () => this.refreshOverlays());

    this.app.renderer.on('resize', (width: number, height: number) => {
      viewport.resize(width, height);
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
      this.setDrawings([]);
      this.setWalls([], []);
      this.setLights([]);
      this.setGlows([]);
      this.setVision([], false, null);
      this.fogSprite.visible = false;
      this.clearTokens();
      return;
    }

    const sceneChanged = scene.id !== this.sceneId;
    this.sceneId = scene.id;
    viewport.worldWidth = scene.width;
    viewport.worldHeight = scene.height;
    viewport.clamp({
      left: -scene.width * PAN_MARGIN,
      top: -scene.height * PAN_MARGIN,
      right: scene.width * (1 + PAN_MARGIN),
      bottom: scene.height * (1 + PAN_MARGIN),
      underflow: 'center',
    });

    this.updateBackground(scene);
    this.drawGrid(scene);
    // The scene's size drives the fog texture, so a resized (or swapped) map
    // has to recomposite it before the next frame.
    this.setFog(this.lastFog, this.lastFogPending, this.fogIsGm);
    this.setVision(this.lastVisionPolygons, this.visionActive);
    if (sceneChanged) {
      this.clearTokens();
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
      node.update(token, ctx, this.drag?.node === node);
    }
    for (const [id, node] of this.tokenNodes) {
      if (!seen.has(id)) {
        if (this.drag?.node === node) this.endDrag(false);
        this.tokenNodes.delete(id);
        this.movableTokens.delete(id);
        node.destroy({ children: true });
      }
    }
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
    this.applyMapCursor();
  }

  /** Arms the note tool: a click on empty map asks for a new pin. */
  setNotePlacing(active: boolean): void {
    if (this.notePlacing === active) return;
    this.notePlacing = active;
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

  /** Arms the eraser: a click reports the world point it landed on. */
  setErasing(active: boolean): void {
    if (this.erasing === active) return;
    this.erasing = active;
    this.applyMapCursor();
  }

  private applyMapCursor(): void {
    const canvas = this.app.canvas;
    if (!canvas) return;
    canvas.style.cursor = this.targeting
      ? 'crosshair'
      : this.fogBrush.armed
        ? 'crosshair'
        : this.draw.armed
          ? 'crosshair'
          : this.wall.armed
            ? this.wall.mode === 'draw'
              ? 'crosshair'
              : 'pointer'
            : this.light.armed
              ? this.light.mode === 'erase'
                ? 'pointer'
                : 'copy'
              : this.erasing
                ? 'pointer'
                : this.notePlacing
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
   * Reconciles the drawing layers with the store (diff by id). A drawing is
   * immutable once stored — there is no `drawing:update` — so a node that
   * already exists never has to be repainted, which keeps a scene with a few
   * hundred sketches free of per-frame work.
   */
  setDrawings(drawings: DrawingView[]): void {
    if (this.destroyed) return;
    const seen = new Set<number>();

    for (const drawing of drawings) {
      seen.add(drawing.id);
      if (this.drawNodes.has(drawing.id)) continue;
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
      node.destroy({ children: true });
    }
  }

  /**
   * Pointer handling of the ruler. It lives on the viewport rather than on the
   * stage so the coordinates are already world-space, and it only takes over
   * the left button while the tool is armed.
   */
  private wireRuler(viewport: Viewport): void {
    viewport.eventMode = 'static';

    viewport.on('pointerdown', (event: FederatedPointerEvent) => {
      if (event.button !== 0 || this.drag) return;
      const world = viewport.toWorld(event.global.x, event.global.y);
      const point = { x: Math.round(world.x), y: Math.round(world.y) };

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
      if (this.light.armed) {
        // A lamp is placed, not dragged: it has no extent of its own, only a
        // position and a reach set in the panel.
        if (this.light.mode === 'erase') this.onLightErase?.(point.x, point.y);
        else this.onLightPlace?.(point.x, point.y);
        return;
      }
      if (this.wall.armed) {
        if (this.wall.mode === 'erase') {
          this.onWallErase?.(point.x, point.y);
          return;
        }
        if (this.wall.mode === 'lock') {
          // Like the eraser, this reports where the click landed and lets the
          // caller pick the segment — it holds the wall list already.
          this.onWallLock?.(point.x, point.y);
          return;
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
      if (this.erasing) {
        this.onDrawingErase?.(point.x, point.y);
        return;
      }
      if (this.draw.armed) {
        // Text is placed, not dragged: the click only says where, the words
        // come from a dialog.
        if (this.draw.tool === 'text') {
          this.onDrawingTextPlace?.(point.x, point.y);
          return;
        }
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

      const points = this.rulerPoints;
      if (!points) return;
      points[points.length - 1] = point;
      this.emitRuler();
    });

    const end = () => {
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
        this.drawPoints = null;
        this.drawStart = null;
        this.drawEnd = null;
        this.viewport?.plugins.resume('drag');
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
   * Arms or disarms the wall tool. Like every other map tool it takes the left
   * button off the viewport — a drag has to mean one thing at a time.
   */
  setWallMode(settings: WallSettings): void {
    const wasDrawing = this.wall.armed && this.wall.mode === 'draw';
    this.wall = settings;
    // Leaving the pencil drops the chain being traced, whether the tool was put
    // away or merely switched to the eraser or the bolt. Half a wall left hanging
    // while the next click means something else also leaves the map un-draggable,
    // because tracing pauses the drag plugin.
    if (wasDrawing && !(settings.armed && settings.mode === 'draw')) this.cancelWallChain();
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
          // The eraser and the bolt both have to reach the segment under the
          // glyph, so they keep the click while they are armed.
          if (this.wall.armed && this.wall.mode !== 'draw') return;
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
  }

  /** Re-renders the overlays at the current zoom (labels are screen-sized). */
  private refreshOverlays(): void {
    if (this.destroyed) return;
    this.setRulers(this.lastRulers);
    this.drawMoveOverlay();
    this.setRangeRings(this.lastRingCentre, this.lastRings);
    this.setNotes(this.lastNotes);
    // Wall handles, door glyphs and lamp handles are screen-sized, like the note
    // pins: at a typical 0.18x map zoom a world-scaled handle is a few pixels.
    this.drawWallLayer();
    this.setLights(this.lastLights);
  }

  private clearTokens(): void {
    if (this.drag) this.endDrag(false);
    for (const node of this.tokenNodes.values()) node.destroy({ children: true });
    this.tokenNodes.clear();
    this.movableTokens.clear();
    this.tokenLayer.removeChildren();
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
      // With the crosshair armed a click picks the target instead of dragging.
      if (this.targeting) {
        event.stopPropagation();
        this.onTokenTarget?.(node.tokenId);
        return;
      }
      // A map tool owns the left button while it is armed. Without this a
      // click that was meant to paint fog or draw a line would *also* grab the
      // token underneath and drag it — the two gestures ran at once, because
      // Pixi bubbles the token's event up to the viewport as well.
      if (
        this.rulerMode ||
        this.fogBrush.armed ||
        this.draw.armed ||
        this.wall.armed ||
        this.erasing
      ) {
        return;
      }
      const now = performance.now();
      if (now - lastClickAt < DOUBLE_CLICK_MS) {
        lastClickAt = 0;
        this.onTokenActivate?.(node.tokenId);
        return;
      }
      lastClickAt = now;
      if (this.movableTokens.get(node.tokenId) === false) return;
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
      // The viewport must not pan while a token is being dragged.
      this.viewport.plugins.pause('drag');
      this.app.stage.eventMode = 'static';
      this.app.stage.on('pointermove', this.onDragMove);
      this.app.stage.on('pointerup', this.onDragEnd);
      this.app.stage.on('pointerupoutside', this.onDragEnd);
    });
  }

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
    drag.node.position.set(pos.x, pos.y);
    drag.lastX = pos.x;
    drag.lastY = pos.y;
    this.samplePath(drag, pos);
    this.drawMoveOverlay();

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
  };

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
    if (!drag) return;
    this.drag = null;
    this.app.stage.off('pointermove', this.onDragMove);
    this.app.stage.off('pointerup', this.onDragEnd);
    this.app.stage.off('pointerupoutside', this.onDragEnd);
    this.viewport?.plugins.resume('drag');
    this.dragGhost.clear();
    this.drawMoveOverlay();

    if (!drag.moved || drag.node.destroyed) return;
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
