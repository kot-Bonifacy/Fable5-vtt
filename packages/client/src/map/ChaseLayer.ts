import { Assets, Container, Graphics, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import {
  CHASE_SEAM_SQUARES,
  VEHICLE_LAYOUTS,
  chaseHeadingDeg,
  chaseIsHorizontal,
  chaseScrollSpeed,
  chaseRoadSpanPx,
  clampChaseVehicle,
  defaultVehicleArt,
  vehicleSeatCentre,
  type ChaseDirection,
  type SceneVehicleView,
  type SceneView,
  type ScenePoint,
} from '@vtt/shared';
import { DESTROY_TREE } from './pixi-destroy.js';

/**
 * Scena pościgu na płótnie (etap 65b): bieżnia i auta.
 *
 * **Bieżnia** to tło sceny jako `TilingSprite` przewijany wzdłuż kierunku
 * jazdy — wyłącznie u klienta; serwer niesie tylko tempo i „droga jedzie”,
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

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

export class ChaseLayer {
  /** Bieżnia — stoi w miejscu tła sceny, które na scenie pościgu się chowa. */
  readonly road = new TilingSprite({ texture: Texture.EMPTY, width: 1, height: 1 });
  /** Auta — pod żetonami, nad osłonami. */
  readonly layer = new Container();

  private scene: SceneView | null = null;
  private roadKey: string | null = null;
  private roadTexture: Texture | null = null;
  private readonly nodes = new Map<string, VehicleNode>();
  private vehicles: SceneVehicleView[] = [];
  private occupied = new Map<string, Set<number>>();
  /** Pas jezdni u MG — dwie przerywane linie wzdłuż drogi. */
  private readonly band = new Graphics();
  private showBand = false;
  /** Auto ciągnięte przez MG: id i środek pod kursorem (przed przycięciem). */
  private dragging: { id: string; centre: ScenePoint } | null = null;
  private destroyed = false;

  constructor() {
    this.road.visible = false;
    this.road.eventMode = 'none';
    this.layer.eventMode = 'none';
    this.layer.addChild(this.band);
  }

  /** Czy bieżnia zastępuje tło (scena pościgu z tłem). */
  get active(): boolean {
    return this.scene?.kind === 'chase' && this.scene.background !== null;
  }

  setScene(scene: SceneView | null): void {
    this.scene = scene;
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
    if (key !== this.roadKey) {
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
    const speed =
      chaseScrollSpeed(scene.chase.tempo, scene.grid.sizePx) *
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

  beginDrag(id: string, centre: ScenePoint): void {
    this.dragging = { id, centre };
  }

  /** Środek auta po przycięciu do pasa — podgląd ciągnięcia i to, co pójdzie do serwera. */
  dragTo(centre: ScenePoint): ScenePoint | null {
    const scene = this.scene;
    const drag = this.dragging;
    if (!scene || !drag) return null;
    const vehicle = this.vehicles.find((entry) => entry.id === drag.id);
    if (!vehicle) return null;
    drag.centre = clampChaseVehicle(centre, vehicle, scene.chase, {
      width: scene.width,
      height: scene.height,
      gridSizePx: scene.grid.sizePx,
      gridOffsetX: scene.grid.offsetX,
      gridOffsetY: scene.grid.offsetY,
    });
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
  }

  private drawBand(): void {
    this.band.clear();
    const scene = this.scene;
    if (!scene || scene.kind !== 'chase' || !this.showBand || !scene.chase.road) return;
    const span = chaseRoadSpanPx(scene.chase, {
      width: scene.width,
      height: scene.height,
      gridSizePx: scene.grid.sizePx,
      gridOffsetX: scene.grid.offsetX,
      gridOffsetY: scene.grid.offsetY,
    });
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
    node.root.alpha = vehicle.status === 'racing' ? 1 : 0.45;

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

    node.label.text = vehicle.name;
    node.label.style.fontSize = Math.max(12, grid * 0.22);
    const horizontal = chaseIsHorizontal(direction);
    node.label.position.set(0, -(horizontal ? width : length) / 2 - grid * 0.08);
  }

  destroy(): void {
    this.destroyed = true;
    for (const node of this.nodes.values()) node.root.destroy(DESTROY_TREE);
    this.nodes.clear();
    this.roadTexture?.destroy(true);
    this.roadTexture = null;
  }
}
