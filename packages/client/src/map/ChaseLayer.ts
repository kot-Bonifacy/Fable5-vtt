import { Assets, Container, Graphics, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import {
  CHASE_SEAM_SQUARES,
  VEHICLE_LAYOUTS,
  chaseHeadingDeg,
  chaseIsHorizontal,
  chaseLimitMove,
  chaseScrollSpeed,
  chaseFrameTempo,
  CHASE_CONTROL_LABELS,
  chaseRoadByUrl,
  chaseRoadCells,
  chaseRoadSpanPx,
  clampChaseVehicle,
  defaultVehicleArt,
  vehicleSeatCentre,
  type ChaseDirection,
  type ChaseObstacleView,
  type SceneVehicleView,
  type SceneView,
  type ScenePoint,
} from '@vtt/shared';
import { DESTROY_TREE } from './pixi-destroy.js';

/**
 * Scena pościgu na płótnie (etap 65b): bieżnia i auta.
 *
 * **Bieżnia** to tło sceny jako `TilingSprite` przewijany wzdłuż kierunku
 * jazdy — wyłącznie u klienta; serwer niesie tempo, „droga jedzie” i auta,
 * z których rama (`chaseFrameTempo`) mówi, jak szybko przewija się droga,
 * a fazy przewijania nikt nie synchronizuje (dekoracja, na której nic nie
 * polega). Żeby zapętlić **każdą** mapę drogi, tekstura powstaje na płótnie:
 * ostatnie `CHASE_SEAM_SQUARES` kratek przenikają się z pierwszymi, więc szew
 * nie przejeżdża przez ekran.
 *
 * **Auto** to obrazek rysowany przodem do góry, obrócony do kierunku jazdy,
 * z podpisem i znacznikami wolnych foteli. Figury w fotelach są zwykłymi
 * żetonami nad autem — ich pozycje przelicza serwer.
 */

/** Ułamek prędkości bieżni przy `prefers-reduced-motion` — droga jedzie, ale wolno. */
const REDUCED_MOTION_FACTOR = 0.12;
const SEAT_FREE_COLOR = 0x7fe7ff;
const SEAT_DRIVER_COLOR = 0xffb547;
const BODY_FILL = 0x1b2230;
const BODY_EDGE = 0x7fe7ff;

interface ObstacleNode {
  root: Container;
  body: Container;
  sprite: Sprite | null;
  shape: Graphics;
  label: Text;
  imageUrl: string | null;
}

/** Obrys przeszkody, która czeka na wybór kierowcy (65e). */
const OBSTACLE_BLOCK_COLOR = 0xffb547;
const OBSTACLE_FILL = 0x3a2a1a;

interface VehicleNode {
  root: Container;
  body: Container;
  sprite: Sprite | null;
  placeholder: Graphics;
  seats: Graphics;
  label: Text;
  imageUrl: string | null;
}

/** Tekstura tła z przenikającym się szwem — okres bieżni wzdłuż kierunku jazdy. */
async function buildSeamlessTexture(
  url: string,
  direction: ChaseDirection,
  seamFraction: number,
): Promise<{ texture: Texture; periodFraction: number } | null> {
  const source = await Assets.load<Texture>(url);
  const resource = source.source.resource as CanvasImageSource | undefined;
  if (!resource) return null;
  const width = source.source.pixelWidth;
  const height = source.source.pixelHeight;
  const horizontal = chaseIsHorizontal(direction);
  const length = horizontal ? width : height;
  const seam = Math.max(1, Math.min(Math.floor(length / 3), Math.round(length * seamFraction)));
  const period = length - seam;
  const canvas = document.createElement('canvas');
  canvas.width = horizontal ? period : width;
  canvas.height = horizontal ? height : period;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Okres to obraz bez ostatnich `seam` pikseli, a jego początek przenika się
  // z tym ogonem: na `0` stoi koniec obrazu, na `seam` — już sam obraz. Po
  // zawinięciu za `period - 1` (obraz) idzie `0` (piksel `period` obrazu), więc
  // szwu nie ma ani na zawinięciu, ani na końcu przenikania.
  ctx.drawImage(resource, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  const strip = document.createElement('canvas');
  strip.width = horizontal ? seam : width;
  strip.height = horizontal ? height : seam;
  const stripCtx = strip.getContext('2d');
  if (!stripCtx) return null;
  if (horizontal) {
    stripCtx.drawImage(resource, period, 0, seam, height, 0, 0, seam, height);
  } else {
    stripCtx.drawImage(resource, 0, period, width, seam, 0, 0, width, seam);
  }
  const fade = horizontal
    ? stripCtx.createLinearGradient(0, 0, seam, 0)
    : stripCtx.createLinearGradient(0, 0, 0, seam);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  stripCtx.globalCompositeOperation = 'destination-in';
  stripCtx.fillStyle = fade;
  stripCtx.fillRect(0, 0, strip.width, strip.height);
  ctx.drawImage(strip, 0, 0);
  return { texture: Texture.from(canvas), periodFraction: period / length };
}

/**
 * Gotowa pętla wbudowanej drogi (`ChaseRoadPreset.strip`, MG 05.11): już
 * zapętlona, więc bez przenikania szwu. Kopia na płótnie, bo `setScene`
 * niszczy poprzednią teksturę bieżni, a tej z `Assets` nie wolno.
 */
async function buildStripTexture(url: string): Promise<Texture | null> {
  const source = await Assets.load<Texture>(url);
  const resource = source.source.resource as CanvasImageSource | undefined;
  if (!resource) return null;
  const canvas = document.createElement('canvas');
  canvas.width = source.source.pixelWidth;
  canvas.height = source.source.pixelHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(resource, 0, 0);
  return Texture.from(canvas);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/** Podpis auta: nazwa i — gdy coś jest nie tak — stan (65c). */
function vehicleCaption(vehicle: SceneVehicleView): string {
  // Wrak (65d1) przed silnikiem — to jest powód, dla którego auto stoi.
  if (vehicle.hp <= 0) return `${vehicle.name} · wrak`;
  if (!vehicle.started) return `${vehicle.name} · silnik zgaszony`;
  if (vehicle.control !== 'driver') {
    return `${vehicle.name} · ${CHASE_CONTROL_LABELS[vehicle.control]}`;
  }
  return vehicle.name;
}

/** Szarość wraku (65d1) — mnożona przez grafikę auta. */
const WRECK_TINT = 0x6b6b6b;

export class ChaseLayer {
  /** Bieżnia — stoi w miejscu tła sceny, które na scenie pościgu się chowa. */
  readonly road = new TilingSprite({ texture: Texture.EMPTY, width: 1, height: 1 });
  /** Auta — pod żetonami, nad osłonami. */
  readonly layer = new Container();

  private scene: SceneView | null = null;
  private roadKey: string | null = null;
  private roadTexture: Texture | null = null;
  private readonly nodes = new Map<string, VehicleNode>();
  /** Przeszkody (65e) — pod autami, nad bieżnią. */
  private readonly obstacleLayer = new Container();
  private readonly obstacleNodes = new Map<string, ObstacleNode>();
  private obstacles: ChaseObstacleView[] = [];
  private vehicles: SceneVehicleView[] = [];
  private occupied = new Map<string, Set<number>>();
  /** Pas jezdni u MG — dwie przerywane linie wzdłuż drogi. */
  private readonly band = new Graphics();
  private showBand = false;
  /**
   * Edycja pasa (kreator pościgu, 03.11): przy otwartej zakładce „Pościg”
   * albo kroku „Droga” kreatora MG ciągnie krawędzie pasa wprost na mapie.
   * Teren poza pasem przygasa, krawędzie są ciągłe i mają uchwyty, a podgląd
   * trwa do puszczenia przycisku — potem pas wraca ze szkicu sceny.
   */
  private bandEdit = false;
  private bandPreview: { from: number; to: number } | null = null;
  private bandHover: 'from' | 'to' | null = null;
  /**
   * Auto ciągnięte przez MG albo kierowcę: id, środek pod kursorem, skąd
   * ruszyło i budżet kierowcy w pikselach (65c; `null` — bez limitu).
   */
  private dragging: {
    id: string;
    centre: ScenePoint;
    origin: ScenePoint;
    limitPx: number | null;
  } | null = null;
  private destroyed = false;

  constructor() {
    this.road.visible = false;
    this.road.eventMode = 'none';
    this.layer.eventMode = 'none';
    this.layer.addChild(this.band, this.obstacleLayer);
  }

  /** Czy bieżnia zastępuje tło (scena pościgu z tłem). */
  get active(): boolean {
    return this.scene?.kind === 'chase' && this.scene.background !== null;
  }

  setScene(scene: SceneView | null): void {
    this.scene = scene;
    this.bandPreview = null;
    if (!scene || scene.kind !== 'chase' || !scene.background) {
      this.road.visible = false;
      this.roadKey = null;
      if (!scene || scene.kind !== 'chase') this.setVehicles([], new Map());
      else this.redraw();
      return;
    }
    const { background } = scene;
    this.road.width = background.width;
    this.road.height = background.height;
    const seamFraction =
      (CHASE_SEAM_SQUARES * scene.grid.sizePx) /
      (chaseIsHorizontal(scene.chase.direction) ? background.width : background.height);
    const key = `${background.url}|${scene.chase.direction}|${seamFraction.toFixed(4)}`;
    // Pętla wbudowanej drogi jest pozioma — przy jeździe w pionie zostaje zwykłe tło.
    const strip = chaseIsHorizontal(scene.chase.direction)
      ? (chaseRoadByUrl(background.url)?.strip ?? null)
      : null;
    if (key !== this.roadKey && strip) {
      this.roadKey = key;
      this.road.visible = false;
      void buildStripTexture(strip)
        .then((texture) => {
          if (this.destroyed || this.roadKey !== key || !texture) return;
          this.roadTexture?.destroy(true);
          this.roadTexture = texture;
          this.road.texture = texture;
          this.road.tilePosition.set(0, 0);
          // Ta sama skala w obu osiach: wysokość pętli = wysokość tła.
          const scale = background.height / texture.height;
          this.road.tileScale.set(scale, scale);
          this.road.visible = true;
        })
        .catch(() => {
          // Bez pętli zostaje zwykłe tło (jak niżej).
        });
    } else if (key !== this.roadKey) {
      this.roadKey = key;
      this.road.visible = false;
      void buildSeamlessTexture(background.url, scene.chase.direction, seamFraction)
        .then((built) => {
          if (this.destroyed || this.roadKey !== key || !built) return;
          this.roadTexture?.destroy(true);
          this.roadTexture = built.texture;
          this.road.texture = built.texture;
          this.road.tilePosition.set(0, 0);
          // Tekstura jest krótsza od tła o szew, a rysuje się w skali tła.
          const horizontal = chaseIsHorizontal(scene.chase.direction);
          this.road.tileScale.set(
            background.width / (built.texture.width / (horizontal ? built.periodFraction : 1)),
            background.height / (built.texture.height / (horizontal ? 1 : built.periodFraction)),
          );
          this.road.visible = true;
        })
        .catch(() => {
          // Bez bieżni zostaje zwykłe tło — `active` pyta o scenę, a renderer
          // pokaże je z powrotem, gdy `road` nie stanie się widoczny.
        });
    }
    this.redraw();
  }

  /** Przewija drogę — woła ticker renderera z czasem klatki w sekundach. */
  tick(seconds: number): void {
    const scene = this.scene;
    if (!scene || !this.road.visible || !scene.chase.running) return;
    // Droga przewija się z ramą (05.11.2026): stojące auto drużyny ją zatrzymuje.
    const speed =
      chaseScrollSpeed(chaseFrameTempo(scene.chase.tempo, this.vehicles), scene.grid.sizePx) *
      (prefersReducedMotion() ? REDUCED_MOTION_FACTOR : 1);
    const step = speed * seconds;
    // Auta jadą w `direction`, więc droga ucieka w przeciwną stronę.
    switch (scene.chase.direction) {
      case 'right':
        this.road.tilePosition.x -= step;
        break;
      case 'left':
        this.road.tilePosition.x += step;
        break;
      case 'down':
        this.road.tilePosition.y -= step;
        break;
      case 'up':
        this.road.tilePosition.y += step;
        break;
    }
  }

  /** Auta sceny i zajęte fotele (`sceneVehicleId` → numery foteli). */
  setVehicles(
    vehicles: SceneVehicleView[],
    occupied: Map<string, Set<number>>,
    showBand = this.showBand,
  ): void {
    this.vehicles = vehicles;
    this.occupied = occupied;
    this.showBand = showBand;
    this.redraw();
  }

  /** Przeszkody sceny (65e). */
  setObstacles(obstacles: ChaseObstacleView[]): void {
    this.obstacles = obstacles;
    this.redraw();
  }

  /** Przeszkoda pod punktem sceny — z wierzchu, czyli z końca listy. */
  pickObstacle(point: ScenePoint): ChaseObstacleView | null {
    const scene = this.scene;
    if (!scene || scene.kind !== 'chase') return null;
    const horizontal = chaseIsHorizontal(scene.chase.direction);
    for (let index = this.obstacles.length - 1; index >= 0; index -= 1) {
      const obstacle = this.obstacles[index]!;
      const hx = ((horizontal ? obstacle.lengthSq : obstacle.widthSq) * scene.grid.sizePx) / 2;
      const hy = ((horizontal ? obstacle.widthSq : obstacle.lengthSq) * scene.grid.sizePx) / 2;
      if (Math.abs(point.x - obstacle.x) <= hx && Math.abs(point.y - obstacle.y) <= hy) {
        return obstacle;
      }
    }
    return null;
  }

  /** Auto pod punktem sceny — z wierzchu, czyli z końca listy. */
  pick(point: ScenePoint): SceneVehicleView | null {
    const scene = this.scene;
    if (!scene || scene.kind !== 'chase') return null;
    for (let index = this.vehicles.length - 1; index >= 0; index -= 1) {
      const vehicle = this.vehicles[index]!;
      const centre = this.dragging?.id === vehicle.id ? this.dragging.centre : vehicle;
      const horizontal = chaseIsHorizontal(scene.chase.direction);
      const hx = ((horizontal ? vehicle.lengthSq : vehicle.widthSq) * scene.grid.sizePx) / 2;
      const hy = ((horizontal ? vehicle.widthSq : vehicle.lengthSq) * scene.grid.sizePx) / 2;
      if (Math.abs(point.x - centre.x) <= hx && Math.abs(point.y - centre.y) <= hy) return vehicle;
    }
    return null;
  }

  beginDrag(id: string, centre: ScenePoint, limitPx: number | null = null): void {
    const vehicle = this.vehicles.find((entry) => entry.id === id);
    const origin = vehicle ? { x: vehicle.x, y: vehicle.y } : centre;
    this.dragging = { id, centre, origin, limitPx };
  }

  /** Środek auta po przycięciu do pasa — podgląd ciągnięcia i to, co pójdzie do serwera. */
  dragTo(centre: ScenePoint): ScenePoint | null {
    const scene = this.scene;
    const drag = this.dragging;
    if (!scene || !drag) return null;
    const vehicle = this.vehicles.find((entry) => entry.id === drag.id);
    if (!vehicle) return null;
    const clamped = clampChaseVehicle(centre, vehicle, scene.chase, {
      width: scene.width,
      height: scene.height,
      gridSizePx: scene.grid.sizePx,
      gridOffsetX: scene.grid.offsetX,
      gridOffsetY: scene.grid.offsetY,
    });
    // Pas jezdni jest wypukły, więc odcinek od miejsca startu do przyciętego
    // celu cały w nim leży — budżet przycina już po pasie.
    drag.centre =
      drag.limitPx === null ? clamped : chaseLimitMove(drag.origin, clamped, drag.limitPx);
    this.redraw();
    return drag.centre;
  }

  /**
   * Kończy ciągnięcie: auto zostaje tam, gdzie je puszczono (do odpowiedzi
   * serwera, która przyjdzie listą aut), a środek idzie do `chase:move`.
   */
  commitDrag(): ScenePoint | null {
    const drag = this.dragging;
    this.dragging = null;
    if (!drag) return null;
    this.vehicles = this.vehicles.map((vehicle) =>
      vehicle.id === drag.id ? { ...vehicle, x: drag.centre.x, y: drag.centre.y } : vehicle,
    );
    this.redraw();
    return drag.centre;
  }

  private redraw(): void {
    if (this.destroyed) return;
    const scene = this.scene;
    const seen = new Set<string>();
    this.drawBand();
    if (scene && scene.kind === 'chase') {
      for (const vehicle of this.vehicles) {
        seen.add(vehicle.id);
        this.drawVehicle(scene, vehicle);
      }
    }
    for (const [id, node] of this.nodes) {
      if (seen.has(id)) continue;
      this.nodes.delete(id);
      node.root.destroy(DESTROY_TREE);
    }
    const seenObstacles = new Set<string>();
    if (scene && scene.kind === 'chase') {
      for (const obstacle of this.obstacles) {
        seenObstacles.add(obstacle.id);
        this.drawObstacle(scene, obstacle);
      }
    }
    for (const [id, node] of this.obstacleNodes) {
      if (seenObstacles.has(id)) continue;
      this.obstacleNodes.delete(id);
      node.root.destroy(DESTROY_TREE);
    }
  }

  /**
   * Przeszkoda (65e): grafika przodem do góry, obrócona do kierunku jazdy jak
   * auto, wrak szary. Bez grafiki — bryła z ukośnymi pasami. Podpis z PW, bo
   * PW przeszkody to jej odporność na taranowanie; czekająca na kierowcę ma
   * bursztynowy obrys.
   */
  private drawObstacle(scene: SceneView, obstacle: ChaseObstacleView): void {
    const grid = scene.grid.sizePx;
    let node = this.obstacleNodes.get(obstacle.id);
    if (!node) {
      const root = new Container();
      const body = new Container();
      const shape = new Graphics();
      const label = new Text({
        text: '',
        style: {
          fontFamily: 'system-ui, sans-serif',
          fontSize: 24,
          fill: 0xf2f4f8,
          stroke: { color: 0x000000, width: 5 },
        },
      });
      label.anchor.set(0.5, 1);
      body.addChild(shape);
      root.addChild(body, label);
      this.obstacleLayer.addChild(root);
      node = { root, body, sprite: null, shape, label, imageUrl: null };
      this.obstacleNodes.set(obstacle.id, node);
    }
    const width = obstacle.widthSq * grid;
    const length = obstacle.lengthSq * grid;
    const direction = scene.chase.direction;
    node.root.position.set(obstacle.x, obstacle.y);
    node.body.rotation = (chaseHeadingDeg(direction) * Math.PI) / 180;
    node.body.tint = obstacle.wreckTint ? WRECK_TINT : 0xffffff;

    if (node.imageUrl !== obstacle.imageUrl) {
      node.imageUrl = obstacle.imageUrl;
      node.sprite?.destroy();
      node.sprite = null;
      const url = obstacle.imageUrl;
      if (url) {
        const target = node;
        void Assets.load<Texture>(url)
          .then((texture) => {
            if (this.destroyed || target.imageUrl !== url || target.root.destroyed) return;
            const sprite = new Sprite(texture);
            sprite.anchor.set(0.5);
            target.sprite = sprite;
            target.body.addChildAt(sprite, 0);
            this.redraw();
          })
          .catch(() => undefined);
      }
    }
    if (node.sprite) {
      const texture = node.sprite.texture;
      node.sprite.scale.set(Math.min(width / texture.width, length / texture.height));
    }
    node.shape.clear();
    if (!node.sprite) {
      node.shape
        .roundRect(-width / 2, -length / 2, width, length, Math.min(width, length) * 0.15)
        .fill({ color: OBSTACLE_FILL, alpha: 0.9 })
        .stroke({ color: SEAT_DRIVER_COLOR, width: Math.max(2, grid * 0.05), alpha: 0.9 });
      const step = grid * 0.4;
      for (let x = -width / 2; x < width / 2; x += step * 2) {
        const end = Math.min(width / 2, x + step);
        node.shape
          .moveTo(x, -length / 2 + 2)
          .lineTo(end, length / 2 - 2)
          .stroke({ color: SEAT_DRIVER_COLOR, width: Math.max(2, grid * 0.06), alpha: 0.55 });
      }
    }
    if (obstacle.blockingVehicleId) {
      node.shape
        .roundRect(-width / 2 - 4, -length / 2 - 4, width + 8, length + 8, grid * 0.1)
        .stroke({ color: OBSTACLE_BLOCK_COLOR, width: Math.max(3, grid * 0.07), alpha: 1 });
    }

    node.label.text =
      obstacle.kind === 'spikes' ? obstacle.name : `${obstacle.name} · ${obstacle.hp} PW`;
    node.label.style.fontSize = Math.max(11, grid * 0.18);
    const horizontal = chaseIsHorizontal(direction);
    node.label.position.set(0, -(horizontal ? width : length) / 2 - grid * 0.06);
  }

  /** Włącza i wyłącza uchwyty pasa jezdni (tylko MG, tylko na scenie pościgu). */
  setBandEdit(on: boolean): void {
    if (this.bandEdit === on) return;
    this.bandEdit = on;
    this.bandPreview = null;
    this.bandHover = null;
    this.drawBand();
  }

  /** Pas, który rysują uchwyty: podgląd przeciągania, pas sceny albo cała szerokość. */
  bandRoad(): { from: number; to: number } | null {
    const scene = this.scene;
    if (!scene || scene.kind !== 'chase') return null;
    if (this.bandPreview) return this.bandPreview;
    if (scene.chase.road) return scene.chase.road;
    return { from: 0, to: chaseRoadCells(scene.chase.direction, this.gridOf(scene)) };
  }

  /** Podgląd pasa w trakcie przeciągania krawędzi. */
  previewBand(road: { from: number; to: number }): void {
    this.bandPreview = road;
    this.drawBand();
  }

  /** Podświetla krawędź pod kursorem. */
  setBandHover(edge: 'from' | 'to' | null): void {
    if (this.bandHover === edge) return;
    this.bandHover = edge;
    this.drawBand();
  }

  /** Krawędź pasa pod punktem (w granicach tolerancji w pikselach sceny). */
  bandHandleAt(point: ScenePoint, tolerance: number): 'from' | 'to' | null {
    const scene = this.scene;
    const road = this.bandRoad();
    if (!this.bandEdit || !scene || !road) return null;
    const span = chaseRoadSpanPx({ direction: scene.chase.direction, road }, this.gridOf(scene));
    const horizontal = chaseIsHorizontal(scene.chase.direction);
    const across = horizontal ? point.y : point.x;
    const along = horizontal ? point.x : point.y;
    const length = horizontal ? scene.width : scene.height;
    if (along < 0 || along > length) return null;
    const toFrom = Math.abs(across - span.from);
    const toTo = Math.abs(across - span.to);
    if (Math.min(toFrom, toTo) > tolerance) return null;
    return toFrom <= toTo ? 'from' : 'to';
  }

  private gridOf(scene: SceneView) {
    return {
      width: scene.width,
      height: scene.height,
      gridSizePx: scene.grid.sizePx,
      gridOffsetX: scene.grid.offsetX,
      gridOffsetY: scene.grid.offsetY,
    };
  }

  private drawBand(): void {
    this.band.clear();
    const scene = this.scene;
    if (!scene || scene.kind !== 'chase') return;
    if (this.bandEdit) {
      this.drawBandEditor(scene);
      return;
    }
    if (!this.showBand || !scene.chase.road) return;
    const span = chaseRoadSpanPx(scene.chase, this.gridOf(scene));
    const horizontal = chaseIsHorizontal(scene.chase.direction);
    const length = horizontal ? scene.width : scene.height;
    const dash = scene.grid.sizePx * 0.5;
    for (const at of [span.from, span.to]) {
      for (let pos = 0; pos < length; pos += dash * 2) {
        const end = Math.min(length, pos + dash);
        if (horizontal) this.band.moveTo(pos, at).lineTo(end, at);
        else this.band.moveTo(at, pos).lineTo(at, end);
      }
    }
    this.band.stroke({
      color: SEAT_DRIVER_COLOR,
      width: Math.max(2, scene.grid.sizePx * 0.05),
      alpha: 0.7,
    });
  }

  /**
   * Pas w edycji: przyciemnienie poza jezdnią (tam auto nie wjedzie), ciągłe
   * krawędzie i uchwyty co 6 kratek — w każdym miejscu kadru jest za co złapać.
   */
  private drawBandEditor(scene: SceneView): void {
    const road = this.bandRoad();
    if (!road) return;
    const span = chaseRoadSpanPx({ direction: scene.chase.direction, road }, this.gridOf(scene));
    const horizontal = chaseIsHorizontal(scene.chase.direction);
    const length = horizontal ? scene.width : scene.height;
    const extent = horizontal ? scene.height : scene.width;
    const grid = scene.grid.sizePx;
    const shade = (from: number, to: number) => {
      if (to <= from) return;
      if (horizontal) this.band.rect(0, from, length, to - from);
      else this.band.rect(from, 0, to - from, length);
    };
    shade(0, span.from);
    shade(span.to, extent);
    this.band.fill({ color: 0x000000, alpha: 0.45 });

    const edges: ['from' | 'to', number][] = [
      ['from', span.from],
      ['to', span.to],
    ];
    for (const [edge, at] of edges) {
      const hot = this.bandHover === edge || (this.bandPreview !== null && this.bandHover === null);
      const colour = hot ? 0xffffff : SEAT_DRIVER_COLOR;
      if (horizontal) this.band.moveTo(0, at).lineTo(length, at);
      else this.band.moveTo(at, 0).lineTo(at, length);
      this.band.stroke({ color: colour, width: Math.max(3, grid * 0.06), alpha: 0.95 });
      const gripAlong = grid * 0.9;
      const gripAcross = grid * 0.32;
      for (let pos = grid * 3; pos < length; pos += grid * 6) {
        if (horizontal) {
          this.band.roundRect(
            pos - gripAlong / 2,
            at - gripAcross / 2,
            gripAlong,
            gripAcross,
            gripAcross / 2,
          );
        } else {
          this.band.roundRect(
            at - gripAcross / 2,
            pos - gripAlong / 2,
            gripAcross,
            gripAlong,
            gripAcross / 2,
          );
        }
      }
      this.band
        .fill({ color: colour, alpha: 1 })
        .stroke({ color: 0x0b0f17, width: Math.max(2, grid * 0.03), alpha: 0.9 });
      // Dwie kreski na uchwycie mówią „ciągnij w poprzek”.
      for (let pos = grid * 3; pos < length; pos += grid * 6) {
        for (const shift of [-grid * 0.08, grid * 0.08]) {
          if (horizontal)
            this.band
              .moveTo(pos + shift, at - gripAcross * 0.28)
              .lineTo(pos + shift, at + gripAcross * 0.28);
          else
            this.band
              .moveTo(at - gripAcross * 0.28, pos + shift)
              .lineTo(at + gripAcross * 0.28, pos + shift);
        }
      }
      this.band.stroke({ color: 0x0b0f17, width: Math.max(2, grid * 0.025), alpha: 0.8 });
    }
  }

  private drawVehicle(scene: SceneView, vehicle: SceneVehicleView): void {
    const grid = scene.grid.sizePx;
    let node = this.nodes.get(vehicle.id);
    if (!node) {
      const root = new Container();
      const body = new Container();
      const placeholder = new Graphics();
      const seats = new Graphics();
      const label = new Text({
        text: '',
        style: {
          fontFamily: 'system-ui, sans-serif',
          fontSize: 28,
          fill: 0xf2f4f8,
          stroke: { color: 0x000000, width: 5 },
        },
      });
      label.anchor.set(0.5, 1);
      body.addChild(placeholder);
      root.addChild(body, seats, label);
      this.layer.addChild(root);
      node = { root, body, sprite: null, placeholder, seats, label, imageUrl: null };
      this.nodes.set(vehicle.id, node);
    }
    const width = vehicle.widthSq * grid;
    const length = vehicle.lengthSq * grid;
    const centre = this.dragging?.id === vehicle.id ? this.dragging.centre : vehicle;
    const direction = scene.chase.direction;
    node.root.position.set(centre.x, centre.y);
    node.body.rotation = (chaseHeadingDeg(direction) * Math.PI) / 180;
    node.root.alpha = vehicle.status === 'racing' ? 1 : vehicle.status === 'wrecked' ? 0.8 : 0.45;
    // Wrak (65d1) traci kolor — szary kadłub, który droga zabiera w tył.
    node.body.tint = vehicle.status === 'wrecked' ? WRECK_TINT : 0xffffff;

    // Auto bez grafiki dostaje wbudowaną wg bryły; motocykl zostaje bryłą.
    const art = vehicle.imageUrl ?? defaultVehicleArt(vehicle.layout);
    if (node.imageUrl !== art) {
      node.imageUrl = art;
      node.sprite?.destroy();
      node.sprite = null;
      const url = art;
      if (url) {
        const target = node;
        void Assets.load<Texture>(url)
          .then((texture) => {
            if (this.destroyed || target.imageUrl !== url || target.root.destroyed) return;
            const sprite = new Sprite(texture);
            sprite.anchor.set(0.5);
            target.sprite = sprite;
            target.body.addChild(sprite);
            this.redraw();
          })
          .catch(() => undefined);
      }
    }
    if (node.sprite) {
      // Obrazek wpisany w bryłę z zachowaniem proporcji — auto z paczki
      // jest smuklejsze od kompaktu 3×5 i rozciągnięte wyglądałoby jak beczka.
      const texture = node.sprite.texture;
      const fit = Math.min(width / texture.width, length / texture.height);
      node.sprite.scale.set(fit);
    }
    // Bryła bez grafiki (albo zanim grafika dojdzie): zaokrąglony kadłub
    // z przednią szybą, żeby było widać, gdzie przód.
    node.placeholder.clear();
    if (!node.sprite) {
      node.placeholder
        .roundRect(-width / 2, -length / 2, width, length, Math.min(width, length) * 0.18)
        .fill({ color: BODY_FILL, alpha: 0.92 })
        .stroke({ color: BODY_EDGE, width: Math.max(2, grid * 0.04), alpha: 0.9 })
        .roundRect(-width * 0.38, -length * 0.4, width * 0.76, length * 0.14, grid * 0.08)
        .fill({ color: BODY_EDGE, alpha: 0.35 });
    }

    const taken = this.occupied.get(vehicle.id);
    node.seats.clear();
    const seatCount = VEHICLE_LAYOUTS[vehicle.layout].length;
    for (let seat = 0; seat < seatCount; seat += 1) {
      if (taken?.has(seat)) continue;
      const at = vehicleSeatCentre(centre, vehicle, seat, direction, grid);
      if (!at) continue;
      const color = seat === 0 ? SEAT_DRIVER_COLOR : SEAT_FREE_COLOR;
      node.seats
        .circle(at.x - centre.x, at.y - centre.y, grid * 0.32)
        .fill({ color: 0x000000, alpha: 0.35 })
        .stroke({ color, width: Math.max(2, grid * 0.05), alpha: 0.9 });
      if (seat === 0) {
        // Kierownica: drugi, mniejszy okrąg w znaczniku fotela kierowcy.
        node.seats
          .circle(at.x - centre.x, at.y - centre.y, grid * 0.14)
          .stroke({ color, width: Math.max(2, grid * 0.04), alpha: 0.9 });
      }
    }

    node.label.text = vehicleCaption(vehicle);
    node.label.style.fontSize = Math.max(12, grid * 0.22);
    const horizontal = chaseIsHorizontal(direction);
    node.label.position.set(0, -(horizontal ? width : length) / 2 - grid * 0.08);
  }

  destroy(): void {
    this.destroyed = true;
    for (const node of this.nodes.values()) node.root.destroy(DESTROY_TREE);
    this.nodes.clear();
    for (const node of this.obstacleNodes.values()) node.root.destroy(DESTROY_TREE);
    this.obstacleNodes.clear();
    this.roadTexture?.destroy(true);
    this.roadTexture = null;
  }
}
