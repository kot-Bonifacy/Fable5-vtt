/**
 * Scena pościgu (etap 65b) — rdzeń VTT, bez liczb CP RED.
 *
 * Model ruchu to „bieżnia” (decyzja MG 1 z 30.10, wzór: Tile Scroll w Foundry):
 * tło sceny przewija się w kółko pod autami, a auta stoją w kadrze i przesuwają
 * się tylko względem siebie. Odległości między autami są prawdziwymi
 * odległościami na mapie, więc zasięg, linia strzału i PT działają jak na
 * każdej scenie. Przewijanie tła to dekoracja klienta — serwer niesie tylko
 * tempo i przełącznik „droga jedzie”.
 *
 * Figury w fotelach mają prawdziwe `x`, `y`: serwer przelicza je przy każdym
 * ruchu auta (`vehicleSeatCentre`), więc reszta kodu o pojazdach nie wie.
 */
import type { ScenePoint } from './measure.js';
import type { VehicleLayoutId } from './vehicles.js';
import { VEHICLE_LAYOUTS } from './vehicles.js';
import type { ChaseObstacleView } from './chase-obstacles.js';

export const SCENE_KINDS = ['map', 'chase'] as const;
/** `map` — zwykła mapa, `chase` — scena pościgu z bieżnią i autami. */
export type SceneKind = (typeof SCENE_KINDS)[number];

export function isSceneKind(value: unknown): value is SceneKind {
  return value === 'map' || value === 'chase';
}

export const CHASE_DIRECTIONS = ['right', 'left', 'up', 'down'] as const;
/** Kierunek jazdy aut na scenie pościgu — droga przewija się w przeciwną stronę. */
export type ChaseDirection = (typeof CHASE_DIRECTIONS)[number];

export function isChaseDirection(value: unknown): value is ChaseDirection {
  return (CHASE_DIRECTIONS as readonly unknown[]).includes(value);
}

export const CHASE_DIRECTION_LABELS: Record<ChaseDirection, string> = {
  right: 'w prawo',
  left: 'w lewo',
  up: 'w górę',
  down: 'w dół',
};

export const CHASE_TEMPO_DEFAULT = 40;
export const CHASE_TEMPO_MIN = 0;
export const CHASE_TEMPO_MAX = 200;
/** Najwięcej kratek pasa jezdni — granica sceny i tak przycina wcześniej. */
export const CHASE_ROAD_MAX_SQ = 1000;
/**
 * Długość rundy, w której tempo przelicza się na prędkość bieżni. Rdzeń nie
 * importuje systemu, a prędkość tła to wyłącznie dekoracja — 3 s to runda
 * CP RED, której i tak używa stół.
 */
export const CHASE_ROUND_SECONDS = 3;
/** Ile kratek przenikania na szwie zapętlonego tła (`buildSeamlessStrip` u klienta). */
export const CHASE_SEAM_SQUARES = 3;

/** Ustawienia pościgu sceny — jadą do wszystkich, bo to ich bieżnia. */
export interface ChaseSettings {
  direction: ChaseDirection;
  /** Tempo pościgu (Ruch) — prędkość bieżni, a od 65c dryf aut. */
  tempo: number;
  /** Droga jedzie (bieżnia się przewija) albo stoi. */
  running: boolean;
  /**
   * Pas jezdni w poprzek kierunku jazdy, w kratkach od krawędzi sceny
   * (`from` włącznie, `to` bez). Null — cała szerokość sceny.
   */
  road: { from: number; to: number } | null;
}

/**
 * Ustawienia pościgu sceny, która nigdy ich nie zmieniała. Domyślnie auta jadą
 * w lewo (decyzja MG z 04.11).
 */
export const DEFAULT_CHASE_SETTINGS: ChaseSettings = {
  direction: 'left',
  tempo: CHASE_TEMPO_DEFAULT,
  running: true,
  road: null,
};

/**
 * Kierunek jazdy z proporcji tła: szersze niż wyższe — w lewo (decyzja MG
 * z 04.11; do 03.11 w prawo), inaczej w górę.
 */
export function defaultChaseDirection(width: number, height: number): ChaseDirection {
  return width >= height ? 'left' : 'up';
}

/** Kierunek jazdy w stopniach zgodnie z ruchem wskazówek od „w górę” (jak `Token.facing`). */
export function chaseHeadingDeg(direction: ChaseDirection): number {
  switch (direction) {
    case 'up':
      return 0;
    case 'right':
      return 90;
    case 'down':
      return 180;
    case 'left':
      return 270;
  }
}

/** Czy jazda idzie w poziomie — pas jezdni to wtedy wiersze kratek, nie kolumny. */
export function chaseIsHorizontal(direction: ChaseDirection): boolean {
  return direction === 'right' || direction === 'left';
}

/**
 * Prędkość przewijania tła w pikselach sceny na sekundę: tempo / 4 kratek
 * na rundę (decyzja MG 12 — ta sama miara, co budżet auta w turze).
 */
export function chaseScrollSpeed(tempo: number, gridSizePx: number): number {
  return ((Math.max(0, tempo) / 4) * gridSizePx) / CHASE_ROUND_SECONDS;
}

/** Auto w rachunku ramy: gdzie stoi, czy wiezie drużynę, jak szybko jedzie i kto prowadzi. */
export interface ChaseFrameVehicle {
  status: SceneVehicleStatus;
  party: boolean;
  speed: number;
  control: ChaseControl;
}

/**
 * Prędkość ramy pościgu — z nią przewija się bieżnia i od niej liczy się dryf
 * (decyzja MG z 05.11.2026: „przewijana pod autem droga to jednoznaczna cecha
 * poruszania się auta”). Kadr jedzie z autem drużyny: dopóki któreś auto
 * drużyny w kadrze ma kierowcę i jedzie, rama ma tempo sceny; gdy wszystkie
 * stoją albo toczą się bez kierowcy — tyle, ile najszybsze z nich (najwyżej
 * tempo), więc stojące auto drużyny zatrzymuje drogę, a jadące auta odpływają
 * do przodu. Bez auta drużyny w kadrze rama ma tempo sceny, a auto bez
 * kierowcy odpływa w tył.
 */
export function chaseFrameTempo(tempo: number, vehicles: readonly ChaseFrameVehicle[]): number {
  const limit = Math.max(0, tempo);
  const party = vehicles.filter(
    (vehicle) => vehicle.party && (vehicle.status === 'racing' || vehicle.status === 'wrecked'),
  );
  if (party.length === 0) return limit;
  if (party.some((vehicle) => vehicle.control !== 'none' && vehicle.speed > 0)) return limit;
  return Math.min(limit, Math.max(0, ...party.map((vehicle) => vehicle.speed)));
}

/** Bryła auta, z której liczy się miejsce na mapie — pola z `Vehicle`. */
export interface ChaseBody {
  widthSq: number;
  lengthSq: number;
  layout: VehicleLayoutId;
}

/** Połowy wymiarów bryły w osiach sceny (po obrocie do kierunku jazdy). */
export function chaseBodyHalfExtents(
  body: Pick<ChaseBody, 'widthSq' | 'lengthSq'>,
  direction: ChaseDirection,
  gridSizePx: number,
): { hx: number; hy: number } {
  const across = (body.widthSq * gridSizePx) / 2;
  const along = (body.lengthSq * gridSizePx) / 2;
  return chaseIsHorizontal(direction) ? { hx: along, hy: across } : { hx: across, hy: along };
}

/**
 * Środek fotela w pikselach sceny. Układ foteli jest rysowany przodem do góry
 * (`x` w poprzek od lewej burty, `y` wzdłuż od przodu), więc punkt obraca się
 * o kierunek jazdy wokół środka bryły — przy jeździe w prawo lewa burta
 * (kierowca) jest u góry.
 */
export function vehicleSeatCentre(
  centre: ScenePoint,
  body: ChaseBody,
  seat: number,
  direction: ChaseDirection,
  gridSizePx: number,
): ScenePoint | null {
  const point = VEHICLE_LAYOUTS[body.layout][seat];
  if (!point) return null;
  const lx = (point.x - 0.5) * body.widthSq * gridSizePx;
  const ly = (point.y - 0.5) * body.lengthSq * gridSizePx;
  const rad = (chaseHeadingDeg(direction) * Math.PI) / 180;
  const cos = Math.round(Math.cos(rad));
  const sin = Math.round(Math.sin(rad));
  return { x: centre.x + lx * cos - ly * sin, y: centre.y + lx * sin + ly * cos };
}

/** Lewy górny róg figury o boku `size` kratek siedzącej w fotelu o tym środku. */
export function seatedTokenPosition(
  seatCentre: ScenePoint,
  size: number,
  gridSizePx: number,
): ScenePoint {
  const half = (size * gridSizePx) / 2;
  return { x: seatCentre.x - half, y: seatCentre.y - half };
}

/** Pas jezdni w pikselach wzdłuż osi poprzecznej (y przy jeździe poziomej). */
export function chaseRoadSpanPx(
  settings: Pick<ChaseSettings, 'direction' | 'road'>,
  scene: {
    width: number;
    height: number;
    gridSizePx: number;
    gridOffsetX: number;
    gridOffsetY: number;
  },
): { from: number; to: number } {
  const horizontal = chaseIsHorizontal(settings.direction);
  const extent = horizontal ? scene.height : scene.width;
  if (!settings.road) return { from: 0, to: extent };
  const offset = horizontal ? scene.gridOffsetY : scene.gridOffsetX;
  const from = Math.max(0, offset + settings.road.from * scene.gridSizePx);
  const to = Math.min(extent, offset + settings.road.to * scene.gridSizePx);
  return to > from ? { from, to } : { from: 0, to: extent };
}

/**
 * Środek auta po przycięciu: bryła cała na scenie, a w poprzek — w pasie
 * jezdni. Pas węższy od auta stawia je na środku pasa.
 */
export function clampChaseVehicle(
  centre: ScenePoint,
  body: Pick<ChaseBody, 'widthSq' | 'lengthSq'>,
  settings: Pick<ChaseSettings, 'direction' | 'road'>,
  scene: {
    width: number;
    height: number;
    gridSizePx: number;
    gridOffsetX: number;
    gridOffsetY: number;
  },
): ScenePoint {
  const { hx, hy } = chaseBodyHalfExtents(body, settings.direction, scene.gridSizePx);
  const road = chaseRoadSpanPx(settings, scene);
  const fit = (value: number, min: number, max: number) =>
    max < min ? (min + max) / 2 : Math.min(max, Math.max(min, value));
  if (chaseIsHorizontal(settings.direction)) {
    return {
      x: fit(centre.x, hx, scene.width - hx),
      y: fit(centre.y, road.from + hy, road.to - hy),
    };
  }
  return {
    x: fit(centre.x, road.from + hx, road.to - hx),
    y: fit(centre.y, hy, scene.height - hy),
  };
}

/**
 * Kratki, o które auto o tej szybkości jedzie w jednej Akcji Ruchu kierowcy
 * (decyzja MG 12: `Ruch / 4`) — zasada domowa, opisana
 * w `decyzje-i-uproszczenia.md`. Ta sama miara, co prędkość bieżni.
 */
export function chaseMoveSquares(speed: number): number {
  return Math.max(0, speed) / 4;
}

/**
 * Dryf auta na początku rundy w kratkach wzdłuż kierunku jazdy (decyzja MG 12):
 * auto wolniejsze od tempa pościgu traci `(tempo − Ruch) / 4`, szybsze tyle
 * zyskuje. Ujemny — w tył.
 */
export function chaseDriftSquares(tempo: number, speed: number): number {
  return (Math.max(0, speed) - Math.max(0, tempo)) / 4;
}

/** Środek przesunięty wzdłuż kierunku jazdy o `squares` kratek (ujemne — w tył). */
export function chaseShiftAlong(
  centre: ScenePoint,
  direction: ChaseDirection,
  squares: number,
  gridSizePx: number,
): ScenePoint {
  const step = squares * gridSizePx;
  switch (direction) {
    case 'right':
      return { x: centre.x + step, y: centre.y };
    case 'left':
      return { x: centre.x - step, y: centre.y };
    case 'down':
      return { x: centre.x, y: centre.y + step };
    case 'up':
      return { x: centre.x, y: centre.y - step };
  }
}

/**
 * Czy bryła **cała** wyjechała za krawędź sceny: za tylną — `behind` (zostaje
 * w tyle), za przednią — `escaped` (ucieka). Bryła choć trochę w kadrze — `null`.
 */
export function chaseOffscreen(
  centre: ScenePoint,
  body: Pick<ChaseBody, 'widthSq' | 'lengthSq'>,
  direction: ChaseDirection,
  scene: { width: number; height: number; gridSizePx: number },
): 'behind' | 'escaped' | null {
  const { hx, hy } = chaseBodyHalfExtents(body, direction, scene.gridSizePx);
  switch (direction) {
    case 'right':
      if (centre.x + hx <= 0) return 'behind';
      if (centre.x - hx >= scene.width) return 'escaped';
      return null;
    case 'left':
      if (centre.x - hx >= scene.width) return 'behind';
      if (centre.x + hx <= 0) return 'escaped';
      return null;
    case 'down':
      if (centre.y + hy <= 0) return 'behind';
      if (centre.y - hy >= scene.height) return 'escaped';
      return null;
    case 'up':
      if (centre.y - hy >= scene.height) return 'behind';
      if (centre.y + hy <= 0) return 'escaped';
      return null;
  }
}

/**
 * Środek auta po dryfie: wzdłuż kierunku bez przycięcia do sceny (auto może
 * z niej wyjechać — wtedy odpada z pościgu), w poprzek — w pasie jezdni.
 */
export function chaseDriftedCentre(
  centre: ScenePoint,
  body: Pick<ChaseBody, 'widthSq' | 'lengthSq'>,
  settings: Pick<ChaseSettings, 'direction' | 'road'>,
  scene: {
    width: number;
    height: number;
    gridSizePx: number;
    gridOffsetX: number;
    gridOffsetY: number;
  },
  squares: number,
): ScenePoint {
  const shifted = chaseShiftAlong(centre, settings.direction, squares, scene.gridSizePx);
  const across = clampChaseVehicle(shifted, body, settings, scene);
  return chaseIsHorizontal(settings.direction)
    ? { x: shifted.x, y: across.y }
    : { x: across.x, y: shifted.y };
}

/**
 * Auto wraca do pościgu (MG, „Przywróć”): stawia się przy krawędzi, za którą
 * wypadło — `behind` przy tylnej, `escaped` przy przedniej — w pasie jezdni.
 */
export function chaseReturnCentre(
  centre: ScenePoint,
  body: Pick<ChaseBody, 'widthSq' | 'lengthSq'>,
  settings: Pick<ChaseSettings, 'direction' | 'road'>,
  scene: {
    width: number;
    height: number;
    gridSizePx: number;
    gridOffsetX: number;
    gridOffsetY: number;
  },
): ScenePoint {
  return clampChaseVehicle(centre, body, settings, scene);
}

/**
 * Cel przeciągnięcia auta przycięty do budżetu: punkt na odcinku `from → to`
 * najwyżej `limitPx` pikseli od `from` (miara jak marsz figury — w linii prostej).
 */
export function chaseLimitMove(from: ScenePoint, to: ScenePoint, limitPx: number): ScenePoint {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (distance <= limitPx || distance === 0) return to;
  const ratio = Math.max(0, limitPx) / distance;
  return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
}

/** Przeszkoda na drodze jadącego auta (65d2): bryła innego auta albo pieszy — prostokąt w osiach sceny. */
export interface ChaseObstacleBox {
  id: string;
  centre: ScenePoint;
  hx: number;
  hy: number;
}

/** Pierwsze zetknięcie jadącego auta z przeszkodą (`chaseFirstContact`). */
export interface ChaseContact {
  id: string;
  /** Ułamek odcinka `from → to`, na którym bryły się zetknęły (0…1). */
  t: number;
  /** Środek jadącego auta w chwili zetknięcia. */
  centre: ScenePoint;
  /** Oś, w której bryły się zetknęły — `x` to zderzenie bokiem pionowej krawędzi. */
  axis: 'x' | 'y';
}

const CONTACT_EPSILON = 1e-6;
/** Bryły zachodzące na siebie na starcie mniej niż o tyle pikseli tylko się dotykają (cofka po zderzeniu). */
const TOUCH_TOLERANCE_PX = 0.05;
/**
 * Otarcie zamiast zderzenia (05.11.2026, przebieg 66c): bryły, które w chwili
 * zetknięcia zachodzą na siebie w drugiej osi o mniej niż tyle połowy jadącego,
 * tylko się mijają. Auto przeciągnięte przez MG o ułamek kratki w poprzek
 * (eskorta y = 9,03 obok Wozu y = 12, szerokość 3) nie może zahaczać o sąsiedni
 * pas przy wyprzedzaniu — 0,1 połowy to przy aucie szerokości 3 kratek
 * 0,15 kratki.
 */
const GRAZE_FRACTION = 0.1;

/**
 * Taranowanie (65d2): auto jedzie w linii prostej `from → to` (jak marsz
 * figury), a to jest pierwsza przeszkoda, na którą wjedzie jego bryła. Metoda
 * płyt na prostokątach powiększonych o połowy jadącego. Przeszkoda, na której
 * auto już stoi (bryły zachodzą na starcie), się nie liczy — wyjazd z niej to
 * nie zderzenie. Samo dotknięcie krawędzią też nie.
 */
export function chaseFirstContact(
  from: ScenePoint,
  to: ScenePoint,
  mover: { hx: number; hy: number },
  obstacles: readonly ChaseObstacleBox[],
): ChaseContact | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let best: ChaseContact | null = null;
  for (const box of obstacles) {
    const ex = box.hx + mover.hx;
    const ey = box.hy + mover.hy;
    const relX = from.x - box.centre.x;
    const relY = from.y - box.centre.y;
    if (Math.abs(relX) < ex - TOUCH_TOLERANCE_PX && Math.abs(relY) < ey - TOUCH_TOLERANCE_PX) {
      continue;
    }
    const slab = (rel: number, d: number, extent: number): [number, number] | null => {
      if (Math.abs(d) < CONTACT_EPSILON) {
        return Math.abs(rel) < extent - CONTACT_EPSILON ? [-Infinity, Infinity] : null;
      }
      const a = (-extent - rel) / d;
      const b = (extent - rel) / d;
      return a < b ? [a, b] : [b, a];
    };
    const sx = slab(relX, dx, ex);
    const sy = slab(relY, dy, ey);
    if (!sx || !sy) continue;
    const enter = Math.max(sx[0], sy[0]);
    const exit = Math.min(sx[1], sy[1]);
    // Auto, które po zderzeniu stoi przy przeszkodzie (cofka o setną piksela),
    // wjeżdża w nią od razu — wejście „trochę przed startem” to zero.
    const length = Math.max(CONTACT_EPSILON, Math.hypot(dx, dy));
    if (enter < -TOUCH_TOLERANCE_PX / length) continue;
    if (enter >= 1 - CONTACT_EPSILON || exit <= Math.max(0, enter) + CONTACT_EPSILON) continue;
    if (best && best.t <= enter) continue;
    const axis: ChaseContact['axis'] = sx[0] >= sy[0] ? 'x' : 'y';
    // Otarcie: w osi, w której bryły się nie czołowały, zachodzą o włos przez
    // cały odcinek w przeszkodzie — nie tylko w chwili zetknięcia, bo skośny
    // wjazd zaczyna się od rogu, a kończy głęboko.
    const deepest = (rel: number, d: number, extent: number): number => {
      const start = Math.max(0, enter);
      const end = Math.min(1, exit);
      const offsets = [rel + d * start, rel + d * end];
      if (Math.abs(d) >= CONTACT_EPSILON && -rel / d > start && -rel / d < end) offsets.push(0);
      return extent - Math.min(...offsets.map(Math.abs));
    };
    const graze =
      axis === 'x'
        ? deepest(relY, dy, ey) < GRAZE_FRACTION * mover.hy
        : deepest(relX, dx, ex) < GRAZE_FRACTION * mover.hx;
    if (graze) continue;
    // Cofka o setną piksela, żeby bryły po zatrzymaniu nie zachodziły na siebie.
    const t = Math.max(0, enter - 0.01 / length);
    best = {
      id: box.id,
      t,
      centre: { x: from.x + dx * t, y: from.y + dy * t },
      axis,
    };
  }
  return best;
}

/**
 * Czy auto uderzyło przodem (Pług bojowy, s. 164): zetknięcie na osi jazdy
 * i ruch do przodu — auto, które cofa się albo ociera bokiem, przodem nie bije.
 */
export function chaseHitsWithFront(
  direction: ChaseDirection,
  from: ScenePoint,
  to: ScenePoint,
  contact: Pick<ChaseContact, 'axis'>,
): boolean {
  const horizontal = chaseIsHorizontal(direction);
  if ((contact.axis === 'x') !== horizontal) return false;
  const along = horizontal ? to.x - from.x : to.y - from.y;
  const forward = direction === 'right' || direction === 'down' ? 1 : -1;
  return along * forward > 0;
}

/** Czy punkt leży na bryle auta (do trafiania kliknięciem i upuszczeniem). */
export function chaseBodyContains(
  centre: ScenePoint,
  body: Pick<ChaseBody, 'widthSq' | 'lengthSq'>,
  direction: ChaseDirection,
  gridSizePx: number,
  point: ScenePoint,
): boolean {
  const { hx, hy } = chaseBodyHalfExtents(body, direction, gridSizePx);
  return Math.abs(point.x - centre.x) <= hx && Math.abs(point.y - centre.y) <= hy;
}

/** Punkt bryły auta najbliższy `point` — tam celuje strzał w auto (65d, jak osłona z 16c). */
export function chaseBodyNearestPoint(
  centre: ScenePoint,
  body: Pick<ChaseBody, 'widthSq' | 'lengthSq'>,
  direction: ChaseDirection,
  gridSizePx: number,
  point: ScenePoint,
): ScenePoint {
  const { hx, hy } = chaseBodyHalfExtents(body, direction, gridSizePx);
  return {
    x: Math.min(Math.max(point.x, centre.x - hx), centre.x + hx),
    y: Math.min(Math.max(point.y, centre.y - hy), centre.y + hy),
  };
}

export const VEHICLE_WINDOW_SIDES = ['front', 'rear', 'left', 'right'] as const;
/**
 * Burta auta względem kierunku jazdy (65d): szyby kuloodporne przyjmują
 * obrażenia osobno na każdej burcie, a strzał w pasażera idzie przez burtę
 * zwróconą do strzelca. Lewa burta to strona kierowcy (`VEHICLE_LAYOUTS`).
 */
export type VehicleWindowSide = (typeof VEHICLE_WINDOW_SIDES)[number];

export function isVehicleWindowSide(value: unknown): value is VehicleWindowSide {
  return (VEHICLE_WINDOW_SIDES as readonly unknown[]).includes(value);
}

export const VEHICLE_WINDOW_LABELS: Record<VehicleWindowSide, string> = {
  front: 'przednia szyba',
  rear: 'tylna szyba',
  left: 'lewe szyby',
  right: 'prawe szyby',
};

/**
 * Burta zwrócona do punktu: współrzędne punktu w układzie auta (przód wzdłuż
 * kierunku jazdy, lewo — w stronę kierowcy) dzielone przez połowy bryły; wygrywa
 * oś, w której punkt leży dalej od środka. Punkt w środku bryły (strzelec
 * w aucie) daje przód — wołający i tak nie pyta o szybę z wnętrza.
 */
export function vehicleSideFacing(
  centre: ScenePoint,
  body: Pick<ChaseBody, 'widthSq' | 'lengthSq'>,
  direction: ChaseDirection,
  point: ScenePoint,
): VehicleWindowSide {
  const forward =
    direction === 'right'
      ? { x: 1, y: 0 }
      : direction === 'left'
        ? { x: -1, y: 0 }
        : direction === 'up'
          ? { x: 0, y: -1 }
          : { x: 0, y: 1 };
  const left = { x: forward.y, y: -forward.x };
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;
  const along = (dx * forward.x + dy * forward.y) / Math.max(1e-6, body.lengthSq);
  const across = (dx * left.x + dy * left.y) / Math.max(1e-6, body.widthSq);
  if (Math.abs(along) >= Math.abs(across)) return along >= 0 ? 'front' : 'rear';
  return across >= 0 ? 'left' : 'right';
}

/**
 * Fotel najbliższy punktu, o ile punkt leży w promieniu połowy kratki od jego
 * środka — upuszczenie figury przez MG i klik gracza w znacznik fotela.
 */
export function seatAtPoint(
  centre: ScenePoint,
  body: ChaseBody,
  direction: ChaseDirection,
  gridSizePx: number,
  point: ScenePoint,
): number | null {
  let best: { seat: number; distance: number } | null = null;
  const seats = VEHICLE_LAYOUTS[body.layout].length;
  for (let seat = 0; seat < seats; seat += 1) {
    const at = vehicleSeatCentre(centre, body, seat, direction, gridSizePx);
    if (!at) continue;
    const distance = Math.hypot(at.x - point.x, at.y - point.y);
    if (distance <= gridSizePx * 0.5 && (!best || distance < best.distance)) {
      best = { seat, distance };
    }
  }
  return best?.seat ?? null;
}

/**
 * Łata ustawień pościgu z drutu — pola spoza zakresu odpadają po cichu,
 * jak w `sanitizeScenePatch`. `road: null` kasuje pas.
 */
export function sanitizeChasePatch(raw: unknown): Partial<ChaseSettings> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const patch: Partial<ChaseSettings> = {};
  if (isChaseDirection(input.direction)) patch.direction = input.direction;
  if (typeof input.tempo === 'number' && Number.isFinite(input.tempo)) {
    patch.tempo = Math.round(Math.min(CHASE_TEMPO_MAX, Math.max(CHASE_TEMPO_MIN, input.tempo)));
  }
  if (typeof input.running === 'boolean') patch.running = input.running;
  if ('road' in input) {
    const road = input.road;
    if (road === null) patch.road = null;
    else if (typeof road === 'object' && road !== null) {
      const { from, to } = road as Record<string, unknown>;
      if (
        typeof from === 'number' &&
        typeof to === 'number' &&
        Number.isInteger(from) &&
        Number.isInteger(to) &&
        from >= 0 &&
        to > from &&
        to <= CHASE_ROAD_MAX_SQ
      ) {
        patch.road = { from, to };
      }
    }
  }
  return patch;
}

export const SCENE_VEHICLE_STATUSES = ['racing', 'behind', 'escaped', 'wrecked'] as const;
/**
 * Stan auta w pościgu: `racing` — w kadrze, `behind` / `escaped` — odpadło za
 * tylną albo przednią krawędzią (65c), `wrecked` — PUK 0 (65d).
 */
export type SceneVehicleStatus = (typeof SCENE_VEHICLE_STATUSES)[number];

export function isSceneVehicleStatus(value: unknown): value is SceneVehicleStatus {
  return (SCENE_VEHICLE_STATUSES as readonly unknown[]).includes(value);
}

/**
 * Auto poza pościgiem (`behind`, `escaped`): gracz nie widzi ani auta, ani
 * figur w jego fotelach (poza własnymi), a załoga nie wchodzi do walki, póki
 * MG nie przywróci auta (66c — także auto w rezerwie ze wzorca).
 */
export function sceneVehicleOffstage(status: string): boolean {
  return status === 'behind' || status === 'escaped';
}

/** Auto na scenie pościgu tak, jak widzi je klient — bryła jedzie razem z miejscem. */
export interface SceneVehicleView {
  id: string;
  sceneId: string;
  vehicleId: string;
  /** Środek bryły w pikselach sceny. */
  x: number;
  y: number;
  status: SceneVehicleStatus;
  name: string;
  imageUrl: string | null;
  widthSq: number;
  lengthSq: number;
  layout: VehicleLayoutId;
  /** Karta właściciela; `null` = auto MG albo NPC-a. */
  ownerCharacterId: string | null;
  /**
   * Figury tej sceny, których kartom wolno siąść za kierownicą poza
   * właścicielem. Figury, nie karty: `characterId` cudzej figury do gracza
   * nie jedzie (`TokenView` w widoku publicznym).
   */
  driverTokenIds: string[];
  /** Silnik pracuje (65c). Auto postawione przez MG jest już uruchomione. */
  started: boolean;
  /**
   * Kto panuje nad autem (65c): `driver` — kierowca zdolny do działania,
   * `none` — pusty fotel kierowcy albo kierowca leży, `lost` — utrata
   * kontroli (zwykła jazda, puszczona kierownica) do następnej rundy.
   */
  control: ChaseControl;
  /** Kratki na Akcję Ruchu kierowcy (`Ruch / 4`) — system liczy, rdzeń rysuje. */
  moveSq: number;
  /** Dryf na rundę w kratkach (ujemny — w tył); 0 bez tempa albo ze zgaszonym silnikiem. */
  driftSq: number;
  /** Zbiorniki Nitro, które jeszcze zostały na ten pościg. */
  nitroLeft: number;
  /** Kolczatki w wyrzutni na ten pościg (65e); 0 — brak wyrzutni albo pusta. */
  spikesLeft: number;
  /** Czy auto zużyło Nitro albo kolczatkę — MG może je uzupełnić (`vehicle:refill`). */
  refillable: boolean;
  /**
   * Punkty kadłuba (65d) — jawne dla całego stołu, jak PW osłony (16c): każdy
   * widzi, jak maska się sypie. 0 = wrak (`status: 'wrecked'` w kadrze).
   */
  hp: number;
  hpMax: number;
  /** OB kadłuba (0 bez opancerzenia). */
  armorSp: number;
  /** Szyby, które są osłoną (kuloodporne) — PW każdej burty; `null` = szyby nie chronią. */
  windows: Record<VehicleWindowSide, { hp: number; max: number }> | null;
  /** Nazwy ulepszeń do panelu auta — system liczy, rdzeń wypisuje. */
  upgrades: string[];
  /**
   * Auto ma Pług bojowy (zaległość 66c z 04.11): pasek „Zderzenie” mówi przed
   * taranowaniem, kto ile bierze — system liczy, rdzeń wypisuje.
   */
  ramPlow: boolean;
  /** Manewry, które pasują do tego pojazdu (65d2) — system liczy, menu auta wypisuje. */
  maneuvers: ChaseManeuverOption[];
  /**
   * Wezwanie MG do Manewru (65d2), które czeka na kierowcę; `null` — brak.
   * Kierowca-gracz widzi pasek z „Wykonaj”, a za NPC-a MG rzuca od razu.
   */
  maneuverCall: ChaseManeuverOption | null;
  /**
   * Bronie pokładowe (65d2): wiersz ulepszenia, jego rodzaj i naboje w magazynku
   * (brak — pełny). Klient kierowcy składa z nich wiersze broni paska.
   */
  mounts: { id: string; upgradeId: string; ammo?: number }[];
  /**
   * Auto jedzie (05.11.2026): droga jedzie, a auto ma własną prędkość — kierowcę
   * i silnik albo jeszcze się toczy bez kierowcy. Przeładowanie broni
   * pokładowej, „nieruchomy pojazd” w ataku, odgłos jazdy.
   */
  moving: boolean;
  /**
   * Własna prędkość auta w jednostkach Ruchu (05.11.2026): z kierowcą — Ruch,
   * bez kierowcy — malejący pęd, zgaszone i wrak — 0. System liczy, rdzeń
   * składa z niej ramę (`chaseFrameTempo`).
   */
  speed: number;
  /** Auto wiezie drużynę: karta gracza jest jego właścicielem albo figura gracza siedzi w fotelu. */
  party: boolean;
  /**
   * To auto stoi na drodze (wrak, zgaszony silnik) i dryfem stanęło przed
   * zderzakiem auta o tym id — czeka na wybór jego kierowcy, jak przeszkoda
   * z 65e (przegląd 03.11). `null` — nikogo nie blokuje.
   */
  blockingVehicleId: string | null;
}

/**
 * `chase:vehicle-answer` — kierowca auta, przed którym stanęło stojące auto
 * (`blockingVehicleId`), wybiera Gwałtowny skręt albo taranowanie; MG za każdego.
 */
export interface ChaseVehicleAnswerPayload {
  /** Auto stojące na drodze — to, które blokuje. */
  sceneVehicleId: string;
  choice: 'swerve' | 'ram';
}

/** Manewr pojazdu na liście menu auta: id systemu i podpis z PT. */
export interface ChaseManeuverOption {
  id: string;
  label: string;
}

export const CHASE_CONTROLS = ['driver', 'none', 'lost'] as const;
export type ChaseControl = (typeof CHASE_CONTROLS)[number];

export const CHASE_CONTROL_LABELS: Record<ChaseControl, string> = {
  driver: 'kierowca prowadzi',
  none: 'bez kierowcy',
  lost: 'utrata kontroli',
};

/** Server → client `chase:sync` — wszystkie auta jednej sceny (wzór `smoke:sync`). */
export interface ChaseSyncBroadcast {
  seq?: number;
  sceneId: string;
  vehicles: SceneVehicleView[];
  /** Przeszkody tej sceny (65e) — wszyscy widzą wszystkie. */
  obstacles: ChaseObstacleView[];
}

/** MG: `chase:place` — auto kampanii na drogę tej sceny (albo przestawienie). */
export interface ChasePlacePayload {
  sceneId: string;
  vehicleId: string;
  x: number;
  y: number;
}

/**
 * `chase:move` — przesunięcie auta; figury w fotelach jadą z nim. MG przesuwa
 * każde auto bez budżetu, gracz — auto, w którym jego figura siedzi za
 * kierownicą (65c): poza walką bez budżetu, w walce w swojej turze za Akcję
 * Ruchu kierowcy.
 */
export interface ChaseMovePayload {
  sceneVehicleId: string;
  x: number;
  y: number;
  /**
   * Taranowanie (65d2): w walce auto, którego droga trafia na inne auto albo
   * pieszego, bez tej flagi staje przed przeszkodą, a z nią w nią wjeżdża.
   */
  ram?: boolean;
}

/**
 * `vehicle:maneuver` — kierowca wykonuje Manewr (65d2, s. 192): sam za Akcję
 * w swojej turze albo na wezwanie MG (bez kosztu). MG rzuca za kierowcę-NPC-a.
 */
export interface VehicleManeuverPayload {
  sceneVehicleId: string;
  maneuverId: string;
}

/** MG: `vehicle:maneuver-call` — wzywa kierowcę do Manewru; `maneuverId: null` odwołuje. */
export interface VehicleManeuverCallPayload {
  sceneVehicleId: string;
  maneuverId: string | null;
}

/** `vehicle:mount-reload` — kierowca przeładowuje broń pokładową na postoju (65d2). */
export interface VehicleMountReloadPayload {
  sceneVehicleId: string;
  upgradeRowId: string;
}

/**
 * `vehicle:engine` — uruchomienie albo zatrzymanie auta (65c). Kierowca
 * w walce płaci Akcją, a uruchomienie przesuwa go na początek kolejki; MG
 * przełącza bez kosztu.
 */
export interface VehicleEnginePayload {
  sceneVehicleId: string;
  on: boolean;
}

/** `vehicle:nitro` — kierowca w walce za Akcję dostaje drugi Ruch pojazdu (65c). */
export interface VehicleNitroPayload {
  sceneVehicleId: string;
}

/**
 * MG: `vehicle:refill` — auto znowu ma pełne zbiorniki Nitro i pełną wyrzutnię
 * kolczatki (decyzja MG z 03.11: „raz dziennie” bez zegara świata).
 */
export interface VehicleRefillPayload {
  sceneVehicleId: string;
}

/** MG: `chase:restore` — auto, które odpadło z pościgu, wraca na drogę (65c). */
export interface ChaseRestorePayload {
  sceneVehicleId: string;
}

/**
 * MG: `chase:escape` — auto ucieka z pościgu ręką MG (zaległość z 04.11):
 * tak samo jak za przednią krawędzią — `escaped`, załoga znika graczom
 * i wychodzi z kolejki, a „Przywróć do pościgu” je cofa.
 */
export interface ChaseEscapePayload {
  sceneVehicleId: string;
}

/** MG: `vehicle:control` — oddaje kierowcy kontrolę przed następną rundą (65c). */
export interface VehicleControlPayload {
  sceneVehicleId: string;
}

/** MG: `chase:remove` — auto schodzi z drogi, figury zostają, gdzie siedziały. */
export interface ChaseRemovePayload {
  sceneVehicleId: string;
}

/** `vehicle:seat` — figura siada w fotelu (gracz własną, MG każdą). */
export interface VehicleSeatPayload {
  tokenId: string;
  sceneVehicleId: string;
  seat: number;
}

/**
 * `vehicle:allow-driver` — właściciel auta (albo MG) daje kierownicę karcie
 * tej figury. Zgoda trzyma się karty, więc przeżywa nową figurę tej postaci.
 */
export interface VehicleAllowDriverPayload {
  sceneVehicleId: string;
  tokenId: string;
  allow: boolean;
}
