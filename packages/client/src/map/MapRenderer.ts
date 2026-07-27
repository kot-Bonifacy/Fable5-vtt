import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  type FederatedPointerEvent,
} from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { ScenePoint, SceneView, TokenSnapScene, TokenView } from '@vtt/shared';
import {
  clampTokenPosition,
  formatMetres,
  formatSquares,
  normalizeGridOffset,
  polylineMetres,
  snapTokenPosition,
  squaresForDistance,
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

/** Extra pannable margin around the scene, as a fraction of its size. */
const PAN_MARGIN = 0.5;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;
/** Screen-pixel distance that turns a click into a drag. */
const DRAG_THRESHOLD_PX = 4;
/** Max gap between two clicks on a token to count as a double-click. */
const DOUBLE_CLICK_MS = 350;

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
  onTokenMove: ((tokenId: string, x: number, y: number, final: boolean) => void) | null = null;
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

  private readonly app = new Application();
  private viewport: Viewport | null = null;
  private readonly background = new Sprite();
  private readonly grid = new Graphics();
  private readonly rangeLayer = new Container();
  private readonly rangeGraphics = new Graphics();
  private readonly tokenLayer = new Container();
  private readonly dragGhost = new Graphics();
  private readonly overlayLayer = new Container();
  private readonly rulerGraphics = new Graphics();
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
  /** Labels drawn on the overlay layer — rebuilt on every redraw. */
  private readonly overlayTexts: Text[] = [];
  private readonly rangeTexts: Text[] = [];
  /** Last overlay input, so a zoom can redraw at the new screen scale. */
  private lastRulers: RulerLine[] = [];
  private lastRingCentre: ScenePoint | null = null;
  private lastRings: RangeRing[] = [];

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
    // Range rings sit under the tokens so they never hide a portrait; the
    // ruler sits above everything, because a measurement is meant to be read.
    this.rangeLayer.addChild(this.rangeGraphics);
    viewport.addChild(this.rangeLayer);
    viewport.addChild(this.tokenLayer);
    viewport.addChild(this.dragGhost);
    this.overlayLayer.addChild(this.rulerGraphics);
    viewport.addChild(this.overlayLayer);
    this.app.stage.addChild(viewport);
    this.viewport = viewport;

    viewport.on('clicked', (event) => {
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
      this.setRangeRings(null, []);
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
    if (sceneChanged) {
      this.clearTokens();
      this.fitScene(scene);
    }
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

  private applyMapCursor(): void {
    const canvas = this.app.canvas;
    if (!canvas) return;
    canvas.style.cursor = this.targeting ? 'crosshair' : this.rulerMode ? 'cell' : '';
  }

  /**
   * Pointer handling of the ruler. It lives on the viewport rather than on the
   * stage so the coordinates are already world-space, and it only takes over
   * the left button while the tool is armed.
   */
  private wireRuler(viewport: Viewport): void {
    viewport.eventMode = 'static';

    viewport.on('pointerdown', (event: FederatedPointerEvent) => {
      if (!this.rulerMode || event.button !== 0 || this.drag) return;
      const world = viewport.toWorld(event.global.x, event.global.y);
      const start = { x: Math.round(world.x), y: Math.round(world.y) };
      // Two points from the start: the second one follows the pointer.
      this.rulerPoints = [start, { ...start }];
      viewport.plugins.pause('drag');
      this.emitRuler();
    });

    viewport.on('pointermove', (event: FederatedPointerEvent) => {
      const points = this.rulerPoints;
      if (!points) return;
      const world = viewport.toWorld(event.global.x, event.global.y);
      points[points.length - 1] = { x: Math.round(world.x), y: Math.round(world.y) };
      this.emitRuler();
    });

    const end = () => {
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

  /** Re-renders the overlays at the current zoom (labels are screen-sized). */
  private refreshOverlays(): void {
    if (this.destroyed) return;
    this.setRulers(this.lastRulers);
    this.setRangeRings(this.lastRingCentre, this.lastRings);
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
      if (this.rulerMode) return;
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

    if (!drag.moved || drag.node.destroyed) return;
    const snapScene = this.snapScene();
    const token = drag.node.token;
    const pos = snapScene
      ? snapTokenPosition(drag.lastX, drag.lastY, token.size, snapScene)
      : { x: drag.lastX, y: drag.lastY };
    drag.node.position.set(pos.x, pos.y);
    drag.node.alpha = token.hidden ? 0.5 : 1;
    if (commit) this.onTokenMove?.(token.id, pos.x, pos.y, true);
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
      this.app.destroy(true, { children: true });
      this.tokenNodes.clear();
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
