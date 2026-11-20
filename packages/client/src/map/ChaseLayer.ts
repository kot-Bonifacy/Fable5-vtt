import { Assets, Container, Graphics, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import {
  CHASE_SEAM_SQUARES,
  VEHICLE_LAYOUTS,
  chaseHeadingDeg,
  chaseIsHorizontal,
  chaseLimitMove,
  chaseObstacleUnbreakable,
  chaseScrollSpeed,
  chaseFrameTempo,
  CHASE_CONTROL_LABELS,
  chaseEffectiveLanes,
  chaseLaneSpanPx,
  chaseRoadByUrl,
  chaseRoadCells,
  chaseRoadSpanPx,
  clampChaseVehicle,
  defaultVehicleArt,
  seatedTokenPosition,
  vehicleSeatCentre,
  type ChaseDirection,
  type ChaseObstacleView,
  type SceneVehicleView,
  type SceneView,
  type ScenePoint,
} from '@vtt/shared';
import type { ChaseGhost } from '../stores/chaseStore.js';
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
 * żetonami nad autem — ich pozycje przelicza serwer, a w czasie dojazdu
 * renderer stawia je w fotelach auta takiego, jakie widać (`seatedTokenAt`).
 *
 * **Dojazd (etap 72d2):** zmiana miejsca auta albo przeszkody nie przeskakuje,
 * tylko dojeżdża (`DRIVE_GLIDE_MS`); sztywne przesunięcie kadru na początku
 * rundy jedzie dłużej (`FRAME_GLIDE_MS`) razem z drogą — dojazdy zaczęte tuż
 * przed albo po zmianie `shiftSq` dostają jego czas, bo serwer rozsyła auta
 * i widok sceny osobno. `prefers-reduced-motion` — skok jak dotąd.
 *
 * **Duch auta (72d2):** u tego, kto trzyma kokpit — miejsce po „Jedź”,
 * podświetlony pas docelowy i miarka do celu dystansu (`setGhost`).
 */

/** Ułamek prędkości bieżni przy `prefers-reduced-motion` — droga jedzie, ale wolno. */
const REDUCED_MOTION_FACTOR = 0.12;
const SEAT_FREE_COLOR = 0x7fe7ff;
const SEAT_DRIVER_COLOR = 0xffb547;
const BODY_FILL = 0x1b2230;
const BODY_EDGE = 0x7fe7ff;
/** Dopiski pod nazwą (prędkość, prognoza przeszkody) — jaśniejsza szarość. */
const NOTE_COLOR = 0xc9d4e3;
/** Przezroczystość grafiki ducha auta. */
const GHOST_ALPHA = 0.4;

/** Dojazd auta po „Jedź” i każda inna zmiana miejsca (decyzja MG 20.11: ~0,6 s). */
export const DRIVE_GLIDE_MS = 600;
/** Najazd kadru na początku rundy — razem z drogą (MG 20.11: ~0,8 s). */
export const FRAME_GLIDE_MS = 800;
/** Dojazd zaczęty tyle przed albo po zmianie `shiftSq` należy do najazdu kadru. */
const FRAME_SYNC_MS = 250;

/** Łagodny start i koniec dojazdu. */
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Dojazd jednego węzła: skąd, dokąd i kiedy. */
interface Glide {
  from: ScenePoint;
  to: ScenePoint;
  t0: number;
  duration: number;
}

/** Przewinięcie drogi o przesunięcie kadru rozłożone na czas najazdu. */
interface RoadGlide {
  dx: number;
  dy: number;
  applied: number;
  t0: number;
}

interface ObstacleNode {
  root: Container;
  body: Container;
  sprite: Sprite | null;
  shape: Graphics;
  label: Text;
  note: Text;
  imageUrl: string | null;
}

interface GhostNode {
  root: Container;
  body: Container;
  sprite: Sprite | null;
  outline: Graphics;
  imageUrl: string | null;
}

function noteText(fontSize: number): Text {
  const text = new Text({
    text: '',
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize,
      fill: NOTE_COLOR,
      stroke: { color: 0x000000, width: 4 },
    },
  });
  text.anchor.set(0.5, 1);
  return text;
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
  note: Text;
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

/**
 * Podpis nad bryłą: nazwa, a pod nią — gdy jest — dopisek mniejszym drukiem
 * (72d2: prędkość auta, prognoza przeszkody). Oba stoją nad bryłą, dopisek
 * bliżej niej.
 */
function placeCaption(label: Text, note: Text, text: string, bottom: number, size: number): void {
  note.text = text;
  note.visible = text !== '';
  note.style.fontSize = size;
  note.position.set(0, bottom);
  label.position.set(0, note.visible ? bottom - note.height : bottom);
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
  /**
   * Suma przesunięć kadru, którą droga już przebyła (etap 72b2) — scena
   * i wartość `ChaseSettings.shiftSq`; nowa różnica przesuwa teksturę.
   */
  private shownShift: { sceneId: string; shiftSq: number } | null = null;
  /** Dojazdy aut (`v:id`) i przeszkód (`o:id`) w toku (72d2). */
  private readonly glides = new Map<string, Glide>();
  private roadGlide: RoadGlide | null = null;
  /** Kiedy przyszła ostatnia zmiana `shiftSq` — do zgrania dojazdów z najazdem kadru. */
  private frameAt: number | null = null;
  /** Dopiski pod podpisami (prędkość aut, prognoza przeszkód). */
  private notes: { vehicles: Map<string, string>; obstacles: Map<string, string> } = {
    vehicles: new Map(),
    obstacles: new Map(),
  };
  private ghost: ChaseGhost | null = null;
  /** Pas docelowy ducha — pod przeszkodami i autami. */
  private readonly laneGlow = new Graphics();
  /** Duch auta i miarka — nad przeszkodami, pod autami. */
  private readonly ghostLayer = new Container();
  private ghostNode: GhostNode | null = null;
  private readonly ruler = new Graphics();
  private readonly rulerLabel = new Text({
    text: '',
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 24,
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 5 },
    },
  });

  constructor() {
    this.road.visible = false;
    this.road.eventMode = 'none';
    this.layer.eventMode = 'none';
    this.rulerLabel.anchor.set(0.5, 1);
    this.rulerLabel.visible = false;
    this.ghostLayer.addChild(this.ruler, this.rulerLabel);
    this.layer.addChild(this.band, this.laneGlow, this.obstacleLayer, this.ghostLayer);
  }

  /** Czy bieżnia zastępuje tło (scena pościgu z tłem). */
  get active(): boolean {
    return this.scene?.kind === 'chase' && this.scene.background !== null;
  }

  setScene(scene: SceneView | null): void {
    this.scene = scene;
    this.bandPreview = null;
    this.followFrameShift(scene);
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

  /**
   * Sztywne przesunięcie kadru na początku rundy (etap 72): serwer przestawia
   * auta, figury w fotelach i przeszkody naraz, a droga jedzie o tyle samo —
   * inaczej auta wyglądałyby, jakby same przejechały po jezdni. Od 72d2 (MG
   * 20.11) to płynny najazd: droga i wszystko na niej dojeżdżają razem
   * w `FRAME_GLIDE_MS`. Pierwszy widok sceny tylko zapamiętuje sumę.
   */
  private followFrameShift(scene: SceneView | null): void {
    if (!scene || scene.kind !== 'chase') {
      this.shownShift = null;
      this.finishGlides();
      return;
    }
    const { shiftSq } = scene.chase;
    const shown = this.shownShift;
    this.shownShift = { sceneId: scene.id, shiftSq };
    if (!shown || shown.sceneId !== scene.id) {
      this.finishGlides();
      return;
    }
    if (shown.shiftSq === shiftSq) return;
    // Dodatnie przesunięcie jedzie w kierunku jazdy, tak jak auta.
    const px = (shiftSq - shown.shiftSq) * scene.grid.sizePx;
    const step = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] }[scene.chase.direction];
    this.finishRoadGlide();
    if (prefersReducedMotion()) {
      this.road.tilePosition.x += step[0]! * px;
      this.road.tilePosition.y += step[1]! * px;
      return;
    }
    const now = performance.now();
    this.frameAt = now;
    this.roadGlide = { dx: step[0]! * px, dy: step[1]! * px, applied: 0, t0: now };
    // Auta i przeszkody przyszły tuż przed widokiem sceny — dojadą razem z drogą.
    for (const [key, glide] of this.glides) {
      if (now - glide.t0 > FRAME_SYNC_MS) continue;
      this.glides.set(key, {
        from: this.glidePoint(glide, now),
        to: glide.to,
        t0: now,
        duration: FRAME_GLIDE_MS,
      });
    }
  }

  /** Domyka przewinięcie drogi, które jeszcze trwa (nowy najazd albo nowa scena). */
  private finishRoadGlide(): void {
    const glide = this.roadGlide;
    if (!glide) return;
    const rest = 1 - glide.applied;
    this.road.tilePosition.x += glide.dx * rest;
    this.road.tilePosition.y += glide.dy * rest;
    this.roadGlide = null;
  }

  private finishGlides(): void {
    this.finishRoadGlide();
    this.glides.clear();
    this.frameAt = null;
  }

  private glidePoint(glide: Glide, now: number): ScenePoint {
    const t = glide.duration <= 0 ? 1 : Math.min(1, Math.max(0, (now - glide.t0) / glide.duration));
    const k = easeInOut(t);
    return {
      x: glide.from.x + (glide.to.x - glide.from.x) * k,
      y: glide.from.y + (glide.to.y - glide.from.y) * k,
    };
  }

  /** Gdzie węzeł stoi teraz na ekranie — w trakcie dojazdu albo na miejscu z serwera. */
  private shownAt(key: string, target: ScenePoint): ScenePoint {
    const glide = this.glides.get(key);
    return glide ? this.glidePoint(glide, performance.now()) : { x: target.x, y: target.y };
  }

  /**
   * Nowe miejsca z serwera: węzeł, który już stał gdzie indziej, dojeżdża
   * z miejsca, w którym go teraz widać. Nowy węzeł staje od razu.
   */
  private startGlides(
    prefix: 'v' | 'o',
    before: ReadonlyMap<string, ScenePoint>,
    next: readonly { id: string; x: number; y: number }[],
  ): void {
    const now = performance.now();
    const reduced = prefersReducedMotion();
    const live = new Set<string>();
    for (const item of next) {
      const key = `${prefix}:${item.id}`;
      live.add(key);
      const was = before.get(item.id);
      if (!was || (was.x === item.x && was.y === item.y)) continue;
      if (reduced || this.dragging?.id === item.id) {
        this.glides.delete(key);
        continue;
      }
      const glide = this.glides.get(key);
      const from = glide ? this.glidePoint(glide, now) : was;
      const frame = this.frameAt !== null && now - this.frameAt < FRAME_SYNC_MS;
      this.glides.set(key, {
        from,
        to: { x: item.x, y: item.y },
        t0: frame ? this.frameAt! : now,
        duration: frame ? FRAME_GLIDE_MS : DRIVE_GLIDE_MS,
      });
    }
    for (const key of this.glides.keys()) {
      if (key.startsWith(`${prefix}:`) && !live.has(key)) this.glides.delete(key);
    }
  }

  /** Czy to auto jest właśnie ciągnięte myszą. */
  isDragging(id: string): boolean {
    return this.dragging?.id === id;
  }

  /** Czy coś na drodze jeszcze dojeżdża — renderer prowadzi wtedy figury w fotelach. */
  get gliding(): boolean {
    return this.glides.size > 0 || this.roadGlide !== null;
  }

  /** Środek auta tak, jak go teraz widać (ciągnięte, w dojeździe albo na miejscu). */
  shownVehicleCentre(id: string): ScenePoint | null {
    const vehicle = this.vehicles.find((entry) => entry.id === id);
    if (!vehicle) return null;
    if (this.dragging?.id === id) return this.dragging.centre;
    return this.shownAt(`v:${id}`, vehicle);
  }

  /**
   * Lewy górny róg figury w fotelu auta tak, jak auto widać — te same wzory co
   * `seatPosition` na serwerze, więc na miejscu wychodzi dokładnie pozycja z bazy.
   */
  seatedTokenAt(seat: { sceneVehicleId: string; seat: number }, size: number): ScenePoint | null {
    const scene = this.scene;
    const vehicle = this.vehicles.find((entry) => entry.id === seat.sceneVehicleId);
    const centre = this.shownVehicleCentre(seat.sceneVehicleId);
    if (!scene || scene.kind !== 'chase' || !vehicle || !centre) return null;
    const at = vehicleSeatCentre(
      centre,
      vehicle,
      seat.seat,
      scene.chase.direction,
      scene.grid.sizePx,
    );
    return at ? seatedTokenPosition(at, size, scene.grid.sizePx) : null;
  }

  /** Dojazdy aut i przeszkód w tej klatce; po końcu węzeł stoi w miejscu z serwera. */
  private tickGlides(now: number): void {
    if (this.roadGlide) {
      const glide = this.roadGlide;
      const k = easeInOut(Math.min(1, (now - glide.t0) / FRAME_GLIDE_MS));
      this.road.tilePosition.x += glide.dx * (k - glide.applied);
      this.road.tilePosition.y += glide.dy * (k - glide.applied);
      glide.applied = k;
      if (k >= 1) this.roadGlide = null;
    }
    for (const [key, glide] of this.glides) {
      const id = key.slice(2);
      const node = key.startsWith('v:') ? this.nodes.get(id) : this.obstacleNodes.get(id);
      const at = this.glidePoint(glide, now);
      if (key.startsWith('v:') && this.dragging?.id === id) {
        this.glides.delete(key);
        continue;
      }
      node?.root.position.set(at.x, at.y);
      if (now - glide.t0 >= glide.duration) this.glides.delete(key);
    }
  }

  /** Przewija drogę — woła ticker renderera z czasem klatki w sekundach. */
  tick(seconds: number): void {
    if (this.gliding) this.tickGlides(performance.now());
    const scene = this.scene;
    if (!scene || !this.road.visible || !scene.chase.running) return;
    // W walce droga jedzie z prędkością pościgu (etap 72, auto kadru z początku
    // rundy); poza nią z ramą (05.11.2026): stojące auto drużyny ją zatrzymuje.
    const tempo = scene.chase.pursuitSpeed ?? chaseFrameTempo(scene.chase.tempo, this.vehicles);
    const speed =
      chaseScrollSpeed(tempo, scene.grid.sizePx) *
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
    const before = new Map(this.vehicles.map((vehicle) => [vehicle.id, vehicle as ScenePoint]));
    this.vehicles = vehicles;
    this.occupied = occupied;
    this.showBand = showBand;
    this.startGlides('v', before, vehicles);
    this.redraw();
  }

  /** Przeszkody sceny (65e). */
  setObstacles(obstacles: ChaseObstacleView[]): void {
    const before = new Map(this.obstacles.map((obstacle) => [obstacle.id, obstacle as ScenePoint]));
    this.obstacles = obstacles;
    this.startGlides('o', before, obstacles);
    this.redraw();
  }

  /** Dopiski pod podpisami aut i przeszkód (72d2) — gotowe zdania od klienta. */
  setNotes(notes: { vehicles: Map<string, string>; obstacles: Map<string, string> }): void {
    this.notes = notes;
    this.redraw();
  }

  /** Duch auta z kokpitu (72d2) albo `null`. */
  setGhost(ghost: ChaseGhost | null): void {
    this.ghost = ghost;
    this.drawGhost();
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
    this.drawGhost();
  }

  /**
   * Duch auta (72d2): grafika auta w miejscu po ruchu, pas docelowy
   * podświetlony przez całą długość kadru i miarka od zderzaka ducha do celu.
   */
  private drawGhost(): void {
    if (this.destroyed) return;
    const scene = this.scene;
    const ghost = this.ghost;
    const vehicle = ghost ? this.vehicles.find((entry) => entry.id === ghost.sceneVehicleId) : null;
    this.laneGlow.clear();
    this.ruler.clear();
    this.rulerLabel.visible = false;
    if (!scene || scene.kind !== 'chase' || !ghost || !vehicle) {
      if (this.ghostNode) this.ghostNode.root.visible = false;
      return;
    }
    const grid = scene.grid.sizePx;
    const direction = scene.chase.direction;
    const horizontal = chaseIsHorizontal(direction);

    const lane = chaseLaneSpanPx(ghost.lane, scene.chase.lanes, scene.chase, this.gridOf(scene));
    const length = horizontal ? scene.width : scene.height;
    if (horizontal) this.laneGlow.rect(0, lane.from, length, lane.to - lane.from);
    else this.laneGlow.rect(lane.from, 0, lane.to - lane.from, length);
    this.laneGlow.fill({ color: SEAT_FREE_COLOR, alpha: 0.1 });
    for (const at of [lane.from, lane.to]) {
      if (horizontal) this.laneGlow.moveTo(0, at).lineTo(length, at);
      else this.laneGlow.moveTo(at, 0).lineTo(at, length);
    }
    this.laneGlow.stroke({ color: SEAT_FREE_COLOR, width: Math.max(2, grid * 0.04), alpha: 0.45 });

    let node = this.ghostNode;
    if (!node) {
      const root = new Container();
      const body = new Container();
      const outline = new Graphics();
      body.addChild(outline);
      root.addChild(body);
      this.ghostLayer.addChildAt(root, 0);
      node = { root, body, sprite: null, outline, imageUrl: null };
      this.ghostNode = node;
    }
    node.root.visible = true;
    node.root.position.set(ghost.centre.x, ghost.centre.y);
    node.body.rotation = (chaseHeadingDeg(direction) * Math.PI) / 180;
    const width = vehicle.widthSq * grid;
    const bodyLength = vehicle.lengthSq * grid;
    const art = vehicle.imageUrl ?? defaultVehicleArt(vehicle.layout);
    if (node.imageUrl !== art) {
      node.imageUrl = art;
      node.sprite?.destroy();
      node.sprite = null;
      if (art) {
        const target = node;
        void Assets.load<Texture>(art)
          .then((texture) => {
            if (this.destroyed || target.imageUrl !== art || target.root.destroyed) return;
            const sprite = new Sprite(texture);
            sprite.anchor.set(0.5);
            sprite.alpha = GHOST_ALPHA;
            target.sprite = sprite;
            target.body.addChildAt(sprite, 0);
            this.drawGhost();
          })
          .catch(() => undefined);
      }
    }
    if (node.sprite) {
      const texture = node.sprite.texture;
      const along = bodyLength / texture.height;
      node.sprite.scale.set(Math.min(along, width / texture.width), along);
    }
    node.outline
      .clear()
      .roundRect(-width / 2, -bodyLength / 2, width, bodyLength, Math.min(width, bodyLength) * 0.18)
      .fill({ color: SEAT_FREE_COLOR, alpha: node.sprite ? 0.06 : 0.18 })
      .stroke({ color: SEAT_FREE_COLOR, width: Math.max(2, grid * 0.05), alpha: 0.85 });

    const ruler = ghost.ruler;
    if (!ruler) return;
    const tick = grid * 0.35;
    // Kreski na końcach w poprzek drogi — jak na miarce z narzędzi mapy.
    const across = horizontal ? { x: 0, y: tick } : { x: tick, y: 0 };
    this.ruler
      .moveTo(ruler.from.x, ruler.from.y)
      .lineTo(ruler.to.x, ruler.to.y)
      .moveTo(ruler.from.x - across.x, ruler.from.y - across.y)
      .lineTo(ruler.from.x + across.x, ruler.from.y + across.y)
      .moveTo(ruler.to.x - across.x, ruler.to.y - across.y)
      .lineTo(ruler.to.x + across.x, ruler.to.y + across.y)
      .stroke({ color: 0xffffff, width: Math.max(2, grid * 0.05), alpha: 0.9 });
    this.rulerLabel.text = ruler.label;
    this.rulerLabel.style.fontSize = Math.max(12, grid * 0.24);
    this.rulerLabel.position.set(
      (ruler.from.x + ruler.to.x) / 2 - across.x * 0.4,
      (ruler.from.y + ruler.to.y) / 2 - across.y * 0.4,
    );
    this.rulerLabel.visible = true;
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
      const note = noteText(20);
      body.addChild(shape);
      root.addChild(body, label, note);
      this.obstacleLayer.addChild(root);
      node = { root, body, sprite: null, shape, label, note, imageUrl: null };
      this.obstacleNodes.set(obstacle.id, node);
    }
    const width = obstacle.widthSq * grid;
    const length = obstacle.lengthSq * grid;
    const direction = scene.chase.direction;
    const shown = this.shownAt(`o:${obstacle.id}`, obstacle);
    node.root.position.set(shown.x, shown.y);
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

    // Kolczatki i betonu się nie rozbija, więc PW przy nich tylko mylą (05.11).
    node.label.text =
      obstacle.kind === 'spikes' || chaseObstacleUnbreakable(obstacle.kind)
        ? obstacle.name
        : `${obstacle.name} · ${obstacle.hp} PW`;
    node.label.style.fontSize = Math.max(11, grid * 0.18);
    const horizontal = chaseIsHorizontal(direction);
    placeCaption(
      node.label,
      node.note,
      this.notes.obstacles.get(obstacle.id) ?? '',
      -(horizontal ? width : length) / 2 - grid * 0.06,
      Math.max(10, grid * 0.16),
    );
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

    // Linie pasów ruchu (72f1): przerywane między pasami, liczba ze szkicu
    // (własna mapa — z szerokości jezdni na żywo, póki MG jej nie wpisał).
    const lanes = chaseEffectiveLanes(
      scene.background?.url,
      { ...scene.chase, road },
      this.gridOf(scene),
    );
    const laneWidth = (span.to - span.from) / lanes;
    const dash = grid * 0.8;
    for (let lane = 1; lane < lanes; lane += 1) {
      const at = span.from + lane * laneWidth;
      for (let pos = 0; pos < length; pos += dash * 2) {
        const end = Math.min(length, pos + dash);
        if (horizontal) this.band.moveTo(pos, at).lineTo(end, at);
        else this.band.moveTo(at, pos).lineTo(at, end);
      }
    }
    if (lanes > 1) {
      this.band.stroke({ color: 0xffffff, width: Math.max(2, grid * 0.05), alpha: 0.75 });
    }

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
      const note = noteText(22);
      body.addChild(placeholder);
      root.addChild(body, seats, label, note);
      this.layer.addChild(root);
      node = { root, body, sprite: null, placeholder, seats, label, note, imageUrl: null };
      this.nodes.set(vehicle.id, node);
    }
    const width = vehicle.widthSq * grid;
    const length = vehicle.lengthSq * grid;
    // Znaczniki foteli rysują się względem środka, więc wystarczy środek z dojazdu.
    const centre =
      this.dragging?.id === vehicle.id
        ? this.dragging.centre
        : this.shownAt(`v:${vehicle.id}`, vehicle);
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
      // Długość obrazka to długość bryły (zaległość z 04.11): furgon 93×196
      // wpisany w 3×7 wychodził o 0,7 kratki krótszy i auta „dotykały” go
      // w powietrzu. Szerszy od bryły obrazek najwyżej się lekko zwęża.
      const texture = node.sprite.texture;
      const along = length / texture.height;
      node.sprite.scale.set(Math.min(along, width / texture.width), along);
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
    placeCaption(
      node.label,
      node.note,
      this.notes.vehicles.get(vehicle.id) ?? '',
      -(horizontal ? width : length) / 2 - grid * 0.08,
      Math.max(10, grid * 0.18),
    );
  }

  destroy(): void {
    this.destroyed = true;
    for (const node of this.nodes.values()) node.root.destroy(DESTROY_TREE);
    this.nodes.clear();
    for (const node of this.obstacleNodes.values()) node.root.destroy(DESTROY_TREE);
    this.obstacleNodes.clear();
    this.ghostNode = null;
    this.glides.clear();
    this.roadGlide = null;
    this.roadTexture?.destroy(true);
    this.roadTexture = null;
  }
}
