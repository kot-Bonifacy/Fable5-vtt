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

/** Ustawienia pościgu sceny, która nigdy ich nie zmieniała. */
export const DEFAULT_CHASE_SETTINGS: ChaseSettings = {
  direction: 'right',
  tempo: CHASE_TEMPO_DEFAULT,
  running: true,
  road: null,
};

/** Kierunek jazdy z proporcji tła: szersze niż wyższe — w prawo, inaczej w górę. */
export function defaultChaseDirection(width: number, height: number): ChaseDirection {
  return width >= height ? 'right' : 'up';
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
}

/** Server → client `chase:sync` — wszystkie auta jednej sceny (wzór `smoke:sync`). */
export interface ChaseSyncBroadcast {
  seq?: number;
  sceneId: string;
  vehicles: SceneVehicleView[];
}

/** MG: `chase:place` — auto kampanii na drogę tej sceny (albo przestawienie). */
export interface ChasePlacePayload {
  sceneId: string;
  vehicleId: string;
  x: number;
  y: number;
}

/** MG: `chase:move` — przesunięcie auta; figury w fotelach jadą z nim. */
export interface ChaseMovePayload {
  sceneVehicleId: string;
  x: number;
  y: number;
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
