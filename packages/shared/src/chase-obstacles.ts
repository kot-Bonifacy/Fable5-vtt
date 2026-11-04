/**
 * Przeszkody i ruch uliczny na scenie pościgu (etap 65e) — rdzeń VTT, bez
 * liczb CP RED (Testy, PT i kości zderzenia zna `systems/cpred/vehiclecombat.ts`).
 *
 * Przeszkoda stoi na drodze, więc w kadrze bieżni jedzie w tył z prędkością
 * pościgu: na początku każdej rundy o `tempo / 4` kratek. Auto jadące z Ruchem
 * zbliża się do niej o `Ruch / 4` — dlatego zderzenie liczy się **ruchem
 * względnym** (`chaseObstacleSweep`): auto, które stoi na drodze (zgaszone,
 * wrak), jedzie razem z przeszkodą i nigdy w nią nie wjedzie.
 */
import type { ScenePoint } from './measure.js';
import {
  chaseBodyHalfExtents,
  chaseFirstContact,
  chaseIsHorizontal,
  chaseOffscreen,
  chaseShiftAlong,
  clampChaseVehicle,
  type ChaseSettings,
} from './chase.js';

export const CHASE_OBSTACLE_KINDS = [
  'civilian-car',
  'barricade',
  'roadwork',
  'wreck',
  'spikes',
  'custom',
] as const;
/** Rodzaj przeszkody — `spikes` to kolczatka (przejeżdża się po niej), reszta zatrzymuje auto. */
export type ChaseObstacleKind = (typeof CHASE_OBSTACLE_KINDS)[number];

export function isChaseObstacleKind(value: unknown): value is ChaseObstacleKind {
  return (CHASE_OBSTACLE_KINDS as readonly unknown[]).includes(value);
}

export interface ChaseObstaclePreset {
  label: string;
  /** Szerokość w poprzek jazdy i długość wzdłuż — w kratkach, jak bryła auta. */
  widthSq: number;
  lengthSq: number;
  /** PW przeszkody jako osłony przy taranowaniu; 0 — nie zatrzymuje (kolczatka). */
  hp: number;
  /** Grafiki rysowane przodem do góry (jak auta); kilka — serwer wybiera jedną. */
  art: readonly string[];
  /** Grafika szara jak wrak (65d1). */
  wreckTint?: true;
  /**
   * Beton (decyzja MG z 04.11.2026): taranowanie go nie rusza, a auto, które
   * w niego wjedzie, jest od razu wrakiem. Zostaje na drodze po uderzeniu.
   */
  unbreakable?: true;
}

/**
 * Wbudowane przeszkody. Grafiki: auta z paczki z 65b (Unlucky Studio, CC0),
 * barierki, pachołki i beczki z Kenney Racing Pack (CC0), kolczatka z ikony
 * „Caltrops” (game-icons.net, CC BY 3.0) — `public/art/obstacles/ATTRIBUTION.md`.
 */
export const CHASE_OBSTACLE_PRESETS: Record<ChaseObstacleKind, ChaseObstaclePreset> = {
  'civilian-car': {
    label: 'Auto cywilne',
    widthSq: 3,
    lengthSq: 5,
    hp: 25,
    art: [
      '/art/vehicles/car-taxi.webp',
      '/art/vehicles/pickup-blue.webp',
      '/art/vehicles/car-orange.webp',
      '/art/vehicles/van-white.webp',
    ],
  },
  barricade: {
    label: 'Barykada',
    widthSq: 3,
    lengthSq: 1,
    hp: 30,
    art: ['/art/obstacles/barricade.webp'],
    unbreakable: true,
  },
  roadwork: {
    label: 'Roboty drogowe',
    widthSq: 3,
    lengthSq: 2,
    hp: 15,
    art: ['/art/obstacles/roadwork.webp'],
  },
  wreck: {
    label: 'Wrak',
    widthSq: 3,
    lengthSq: 5,
    hp: 40,
    art: ['/art/vehicles/car-black-viper.webp', '/art/vehicles/car-police.webp'],
    wreckTint: true,
  },
  spikes: {
    label: 'Kolczatka',
    widthSq: 3,
    lengthSq: 1,
    hp: 0,
    art: ['/art/obstacles/spikes.webp'],
  },
  custom: {
    label: 'Przeszkoda',
    widthSq: 3,
    lengthSq: 2,
    hp: 20,
    art: [],
  },
};

/** Betonowa przeszkoda (04.11.2026): nie do rozbicia, auto rozbija się na niej. */
export function chaseObstacleUnbreakable(kind: string): boolean {
  return isChaseObstacleKind(kind) && CHASE_OBSTACLE_PRESETS[kind].unbreakable === true;
}

/** Czy przeszkoda tego rodzaju zatrzymuje auto (kolczatka — nie, po niej się przejeżdża). */
export function chaseObstacleCollides(kind: ChaseObstacleKind): boolean {
  return kind !== 'spikes';
}

export const CHASE_OBSTACLE_NAME_MAX = 40;
export const CHASE_OBSTACLE_HP_MAX = 500;
export const CHASE_OBSTACLE_SIZE_MAX = 12;

/** Przeszkoda na scenie tak, jak widzi ją klient — jawna dla całego stołu. */
export interface ChaseObstacleView {
  id: string;
  sceneId: string;
  kind: ChaseObstacleKind;
  name: string;
  /** Środek w pikselach sceny. */
  x: number;
  y: number;
  widthSq: number;
  lengthSq: number;
  hp: number;
  hpMax: number;
  imageUrl: string | null;
  /** Szara grafika (wrak). */
  wreckTint: boolean;
  /**
   * Auto, przed którego zderzakiem przeszkoda stanęła i czeka na wybór
   * kierowcy: Manewr (Gwałtowny skręt) albo taranowanie. `null` — nikt.
   */
  blockingVehicleId: string | null;
}

/** MG: `chase:obstacle-spawn` — przeszkoda przy przedniej krawędzi, na pasie pod kursorem. */
export interface ChaseObstacleSpawnPayload {
  sceneId: string;
  kind: ChaseObstacleKind;
  /** Punkt kliknięcia — z niego liczy się tylko położenie w poprzek drogi. */
  x: number;
  y: number;
  /** Własna nazwa, PW i grafika (`custom`; przy innych zastępują domyślne). */
  name?: string;
  hp?: number;
  imageUrl?: string;
}

/** MG: `chase:obstacle-remove`. */
export interface ChaseObstacleRemovePayload {
  obstacleId: string;
}

export const CHASE_OBSTACLE_CHOICES = ['swerve', 'ram'] as const;
export type ChaseObstacleChoice = (typeof CHASE_OBSTACLE_CHOICES)[number];

/** `chase:obstacle-answer` — kierowca (albo MG) wybiera Manewr albo taranowanie. */
export interface ChaseObstacleAnswerPayload {
  obstacleId: string;
  choice: ChaseObstacleChoice;
}

type Frame = {
  width: number;
  height: number;
  gridSizePx: number;
  gridOffsetX: number;
  gridOffsetY: number;
};

/**
 * Środek nowej przeszkody: wzdłuż drogi — tuż przy przedniej krawędzi kadru
 * (cała w kadrze), w poprzek — tam, gdzie MG kliknął, przycięta do pasa jezdni.
 */
export function chaseObstacleSpawnCentre(
  point: ScenePoint,
  body: { widthSq: number; lengthSq: number },
  settings: Pick<ChaseSettings, 'direction' | 'road'>,
  scene: Frame,
): ScenePoint {
  const { hx, hy } = chaseBodyHalfExtents(body, settings.direction, scene.gridSizePx);
  const front: ScenePoint =
    settings.direction === 'right'
      ? { x: scene.width - hx, y: point.y }
      : settings.direction === 'left'
        ? { x: hx, y: point.y }
        : settings.direction === 'down'
          ? { x: point.x, y: scene.height - hy }
          : { x: point.x, y: hy };
  return clampChaseVehicle(front, body, settings, scene);
}

/** Kratki, o które przeszkoda jedzie w kadrze na początku rundy — w tył, `tempo / 4`. */
export function chaseObstacleDriftSquares(tempo: number, running: boolean): number {
  return running ? -Math.max(0, tempo) / 4 : 0;
}

/** Środek przeszkody po dryfie rundy (bez przycięcia — może wyjechać za tylną krawędź). */
export function chaseObstacleDrifted(
  centre: ScenePoint,
  settings: Pick<ChaseSettings, 'direction' | 'tempo' | 'running'>,
  gridSizePx: number,
): ScenePoint {
  const squares = chaseObstacleDriftSquares(settings.tempo, settings.running);
  return squares === 0 ? centre : chaseShiftAlong(centre, settings.direction, squares, gridSizePx);
}

/** Czy przeszkoda cała wyjechała za tylną krawędź — wtedy znika. */
export function chaseObstacleGone(
  centre: ScenePoint,
  body: { widthSq: number; lengthSq: number },
  direction: ChaseSettings['direction'],
  scene: { width: number; height: number; gridSizePx: number },
): boolean {
  return chaseOffscreen(centre, body, direction, scene) === 'behind';
}

/** Auto w czasie rundy: skąd i dokąd dojechało (dryf), z połowami bryły. */
export interface ChaseSweepVehicle {
  id: string;
  from: ScenePoint;
  to: ScenePoint;
  hx: number;
  hy: number;
}

export interface ChaseSweepHit {
  id: string;
  /** Ułamek ruchu względnego, na którym bryły się zetknęły (0…1). */
  t: number;
  /** Gdzie stanie przeszkoda: przy zderzaku auta na jego miejscu po rundzie. */
  centre: ScenePoint;
}

/**
 * Przecięcie toru przeszkody z bryłami aut w jednej rundzie (65e). Liczy ruch
 * **względny**: w układzie auta przeszkoda jedzie z `from − auto.from` do
 * `to − auto.to`, więc auto z prędkością pościgu spotyka ją po `Ruch / 4`
 * kratek, a auto stojące na drodze — nigdy. Zwraca auta w kolejności zetknięcia
 * (pierwsze — to, przed którym przeszkoda się zatrzyma). Przeszkoda, która już
 * na początku zachodzi na auto, go nie trafia (jak w `chaseFirstContact`).
 */
export function chaseObstacleSweep(
  obstacle: { from: ScenePoint; to: ScenePoint; hx: number; hy: number },
  vehicles: readonly ChaseSweepVehicle[],
): ChaseSweepHit[] {
  const hits: ChaseSweepHit[] = [];
  for (const vehicle of vehicles) {
    const relFrom = { x: obstacle.from.x - vehicle.from.x, y: obstacle.from.y - vehicle.from.y };
    const relTo = { x: obstacle.to.x - vehicle.to.x, y: obstacle.to.y - vehicle.to.y };
    const contact = chaseFirstContact(relFrom, relTo, obstacle, [
      { id: vehicle.id, centre: { x: 0, y: 0 }, hx: vehicle.hx, hy: vehicle.hy },
    ]);
    if (!contact) continue;
    hits.push({
      id: vehicle.id,
      t: contact.t,
      centre: { x: vehicle.to.x + contact.centre.x, y: vehicle.to.y + contact.centre.y },
    });
  }
  return hits.sort((a, b) => a.t - b.t);
}

/**
 * Gdzie przeszkoda staje po minięciu auta (Manewr udany albo zderzenie, które
 * jej nie rozbiło): tuż za tylnym zderzakiem, w tym samym miejscu w poprzek.
 */
export function chaseObstaclePastVehicle(
  obstacle: { x: number; y: number; widthSq: number; lengthSq: number },
  vehicle: { x: number; y: number; widthSq: number; lengthSq: number },
  direction: ChaseSettings['direction'],
  gridSizePx: number,
): ScenePoint {
  const car = chaseBodyHalfExtents(vehicle, direction, gridSizePx);
  const own = chaseBodyHalfExtents(obstacle, direction, gridSizePx);
  const gap = 0.05 * gridSizePx;
  if (chaseIsHorizontal(direction)) {
    const sign = direction === 'right' ? 1 : -1;
    return { x: vehicle.x - sign * (car.hx + own.hx + gap), y: obstacle.y };
  }
  const sign = direction === 'down' ? 1 : -1;
  return { x: obstacle.x, y: vehicle.y - sign * (car.hy + own.hy + gap) };
}

/**
 * Kolczatka wyrzucona z auta (65e): tuż za tylnym zderzakiem, na środku auta
 * w poprzek. Zwraca środek bez przycięcia — za tylną krawędzią znika od razu.
 */
export function chaseSpikesDropCentre(
  vehicle: { x: number; y: number; widthSq: number; lengthSq: number },
  spikes: { widthSq: number; lengthSq: number },
  direction: ChaseSettings['direction'],
  gridSizePx: number,
): ScenePoint {
  return chaseObstaclePastVehicle(
    { x: vehicle.x, y: vehicle.y, ...spikes },
    vehicle,
    direction,
    gridSizePx,
  );
}

/**
 * Kolczatki, po których przejechało auto jadące `from → to` (kierowca w turze):
 * bryła auta na odcinku dotyka kolczatki. Bez kolejności — każda rzuca osobno.
 */
export function chaseSpikesCrossed(
  from: ScenePoint,
  to: ScenePoint,
  mover: { hx: number; hy: number },
  spikes: readonly { id: string; centre: ScenePoint; hx: number; hy: number }[],
): string[] {
  const crossed: string[] = [];
  for (const box of spikes) {
    const overlapsAt = (point: ScenePoint) =>
      Math.abs(point.x - box.centre.x) < box.hx + mover.hx &&
      Math.abs(point.y - box.centre.y) < box.hy + mover.hy;
    if (overlapsAt(to) || chaseFirstContact(from, to, mover, [box])) crossed.push(box.id);
  }
  return crossed;
}

/** Łata nazwy z drutu: przycięta; pusta — `null`. */
export function readChaseObstacleName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().slice(0, CHASE_OBSTACLE_NAME_MAX);
  return name.length > 0 ? name : null;
}

/** PW z drutu: liczba całkowita w zakresie; inaczej `null`. */
export function readChaseObstacleHp(raw: unknown): number | null {
  return typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw >= 0 &&
    raw <= CHASE_OBSTACLE_HP_MAX
    ? raw
    : null;
}
