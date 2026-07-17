import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Texture,
  type FederatedPointerEvent,
} from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { SceneView, TokenSnapScene, TokenView } from '@vtt/shared';
import { clampTokenPosition, normalizeGridOffset, snapTokenPosition } from '@vtt/shared';
import { TokenNode, type TokenNodeCtx } from './TokenNode.js';

/** Extra pannable margin around the scene, as a fraction of its size. */
const PAN_MARGIN = 0.5;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;
/** Screen-pixel distance that turns a click into a drag. */
const DRAG_THRESHOLD_PX = 4;

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

  private readonly app = new Application();
  private viewport: Viewport | null = null;
  private readonly background = new Sprite();
  private readonly grid = new Graphics();
  private readonly tokenLayer = new Container();
  private readonly dragGhost = new Graphics();
  private readonly tokenNodes = new Map<string, TokenNode>();
  private drag: DragState | null = null;
  private scene: SceneView | null = null;
  private sceneId: string | null = null;
  private backgroundUrl: string | null = null;
  private destroyed = false;

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
    viewport.addChild(this.tokenLayer);
    viewport.addChild(this.dragGhost);
    this.app.stage.addChild(viewport);
    this.viewport = viewport;

    viewport.on('clicked', (event) => {
      this.onMapClick?.(event.world.x, event.world.y);
    });

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
      const movable = ctx.isGm || token.ownerId === ctx.myUserId;
      node.eventMode = movable ? 'static' : 'none';
      node.cursor = 'pointer';
      node.update(token, ctx, this.drag?.node === node);
    }
    for (const [id, node] of this.tokenNodes) {
      if (!seen.has(id)) {
        if (this.drag?.node === node) this.endDrag(false);
        this.tokenNodes.delete(id);
        node.destroy({ children: true });
      }
    }
  }

  private clearTokens(): void {
    if (this.drag) this.endDrag(false);
    for (const node of this.tokenNodes.values()) node.destroy({ children: true });
    this.tokenNodes.clear();
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
    node.on('pointerdown', (event: FederatedPointerEvent) => {
      if (event.button === 2) {
        const rect = this.app.canvas.getBoundingClientRect();
        this.onTokenMenu?.(node.tokenId, rect.left + event.global.x, rect.top + event.global.y);
        return;
      }
      if (event.button !== 0 || this.drag || !this.viewport) return;
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
    const pos = clampTokenPosition(world.x - drag.grabDx, world.y - drag.grabDy, token.size, snapScene);
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
    if (this.viewport) {
      this.app.destroy(true, { children: true });
      this.viewport = null;
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
