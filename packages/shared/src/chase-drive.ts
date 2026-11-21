/**
 * Jazda w pościgu od etapu 72 — rdzeń VTT, bez liczb CP RED.
 *
 * Model (decyzje MG z 15.11.2026, `docs/etapy/etap-72-poscig-kokpit.md`):
 * jezdnia dzieli się na równe **pasy**, auto stoi środkiem bryły na środku
 * pasa i rusza się raz na turę swojego kierowcy — o przesunięcie wzdłuż drogi
 * (system liczy je z prędkości) i najwyżej o pas w poprzek. Kadr trzyma się
 * **auta kadru**: na początku rundy wszystko na drodze przesuwa się sztywno,
 * żeby auto kadru wróciło na swoje miejsce. Odległości między autami się przy
 * tym nie zmieniają — to ruch kamery, nie aut.
 *
 * Tu tylko geometria i wybór auta kadru. Kroki gazu i hamulca, mile na
 * godzinę, Wyścig i utrata kontroli są w `systems/cpred/chase-drive.ts`.
 */
import type { ScenePoint } from './measure.js';
import {
  CHASE_LANES_MAX,
  CHASE_LANES_MIN,
  CHASE_ROLES,
  chaseBodyHalfExtents,
  chaseIsHorizontal,
  chaseRoadSpanPx,
  chaseShiftAlong,
  clampChaseLanes,
  clampChaseVehicle,
  isChaseRole,
  type ChaseBody,
  type ChaseEntrySide,
  type ChaseRole,
  type ChaseControl,
  type ChaseDirection,
  type ChaseSettings,
  type SceneVehicleStatus,
} from './chase.js';
import { chaseRoadByUrl, type ChaseParkedBody } from './chase-roads.js';

/** Wymiary sceny, z których liczy się jezdnia (pola `Scene`). */
export interface ChaseDriveFrame {
  width: number;
  height: number;
  gridSizePx: number;
  gridOffsetX: number;
  gridOffsetY: number;
}

// ───────────────────────── Pasy ─────────────────────────

// Granice liczby pasów i rola drużyny mieszkają w `chase.ts` (łata sceny
// czyta je w `sanitizeChasePatch`, a `chase.ts` nie może importować tego
// pliku — cykl wywraca serwer w `tsx`, pułapka `testy` z 15.11).
export { CHASE_LANES_MAX, CHASE_LANES_MIN, CHASE_ROLES, clampChaseLanes, isChaseRole };
export type { ChaseRole };
/**
 * Szerokość pasa w kratkach, z której własna mapa MG zgaduje liczbę pasów:
 * auto ma 3 kratki szerokości (`VEHICLE_BODY_SIZES.car`), a pas Neonowej
 * ulicy — 4.
 */
export const CHASE_LANE_GUESS_SQ = 4;

/** Liczba pasów jezdni o tej szerokości w kratkach: `round(kratki / 4)`, co najmniej jeden. */
export function chaseLanesForWidth(squares: number): number {
  return clampChaseLanes(squares / CHASE_LANE_GUESS_SQ);
}

/**
 * Liczba pasów sceny, której MG jej nie podał: wbudowana droga niesie własną
 * (zgodną z namalowanymi liniami), własna mapa — z szerokości pasa jezdni.
 */
export function chaseDefaultLanes(
  backgroundUrl: string | null | undefined,
  settings: Pick<ChaseSettings, 'direction' | 'road'>,
  scene: ChaseDriveFrame,
): number {
  const preset = chaseRoadByUrl(backgroundUrl);
  if (preset) return clampChaseLanes(preset.lanes);
  const span = chaseRoadSpanPx(settings, scene);
  return chaseLanesForWidth((span.to - span.from) / scene.gridSizePx);
}

/**
 * Liczba pasów, jaką widzi szkic sceny (etap 72f1): flaga `lanesFromRoad`
 * liczy ją od nowa z drogi i pasa jezdni szkicu (`chaseDefaultLanes`), więc
 * kreator pokazuje zmianę uchwytów od razu; inaczej — liczba wpisana przez MG.
 * Serwer liczy to samo w `toChaseSettings`.
 */
export function chaseEffectiveLanes(
  backgroundUrl: string | null | undefined,
  settings: Pick<ChaseSettings, 'direction' | 'road' | 'lanes' | 'lanesFromRoad'>,
  scene: ChaseDriveFrame,
): number {
  // Wbudowana droga ma pasy namalowane — liczba MG jej nie zmienia (MG 20.11).
  if (settings.lanesFromRoad || chaseRoadByUrl(backgroundUrl)) {
    return chaseDefaultLanes(backgroundUrl, settings, scene);
  }
  return clampChaseLanes(settings.lanes);
}

/** Granice pasu w pikselach w poprzek drogi (`from` bliżej krawędzi `road.from`). */
export function chaseLaneSpanPx(
  lane: number,
  lanes: number,
  settings: Pick<ChaseSettings, 'direction' | 'road'>,
  scene: ChaseDriveFrame,
): { from: number; to: number } {
  const count = clampChaseLanes(lanes);
  const index = Math.min(count - 1, Math.max(0, Math.round(lane)));
  const span = chaseRoadSpanPx(settings, scene);
  const width = (span.to - span.from) / count;
  return { from: span.from + index * width, to: span.from + (index + 1) * width };
}

/** Środek pasu w pikselach w poprzek drogi — tam stoi środek bryły auta. */
export function chaseLaneCentre(
  lane: number,
  lanes: number,
  settings: Pick<ChaseSettings, 'direction' | 'road'>,
  scene: ChaseDriveFrame,
): number {
  const span = chaseLaneSpanPx(lane, lanes, settings, scene);
  return (span.from + span.to) / 2;
}

/**
 * Pas, na którym stoi punkt (środek bryły): numer liczony od krawędzi
 * `road.from` — przy jeździe poziomej od góry ekranu. Punkt poza jezdnią
 * trafia na skrajny pas, więc stare auto postawione krzywo przyciąga się
 * do najbliższego.
 */
export function chaseLaneOf(
  point: ScenePoint,
  lanes: number,
  settings: Pick<ChaseSettings, 'direction' | 'road'>,
  scene: ChaseDriveFrame,
): number {
  const count = clampChaseLanes(lanes);
  const span = chaseRoadSpanPx(settings, scene);
  const across = chaseIsHorizontal(settings.direction) ? point.y : point.x;
  const width = (span.to - span.from) / count;
  const index = Math.floor((across - span.from) / width);
  return Math.min(count - 1, Math.max(0, index));
}

/**
 * Pas po zmianie o `delta` (−1 — w stronę `road.from`, czyli „Pas wyżej” przy
 * jeździe poziomej); `null`, gdy auto stoi przy krawędzi jezdni.
 */
export function chaseLaneTarget(lane: number, delta: number, lanes: number): number | null {
  const next = lane + delta;
  return next >= 0 && next < clampChaseLanes(lanes) ? next : null;
}

/** Środek auta postawionego na środku pasu (ta sama pozycja wzdłuż drogi). */
export function chaseSnapToLane(
  centre: ScenePoint,
  lane: number,
  lanes: number,
  settings: Pick<ChaseSettings, 'direction' | 'road'>,
  scene: ChaseDriveFrame,
): ScenePoint {
  const across = chaseLaneCentre(lane, lanes, settings, scene);
  return chaseIsHorizontal(settings.direction)
    ? { x: centre.x, y: across }
    : { x: across, y: centre.y };
}

// ───────────────────────── Krok ruchu ─────────────────────────

export interface ChaseDriveStepInput {
  centre: ScenePoint;
  /** Pas docelowy (już sprawdzony `chaseLaneTarget`). */
  lane: number;
  /** Przesunięcie wzdłuż drogi w kratkach — ujemne w tył (auto wolniejsze od kadru). */
  advanceSq: number;
  lanes: number;
  settings: Pick<ChaseSettings, 'direction' | 'road'>;
  scene: ChaseDriveFrame;
}

export interface ChaseDriveStep {
  /** Odcinek ruchu w linii prostej — do `chaseFirstContact` (zderzenie na drodze ruchu). */
  from: ScenePoint;
  to: ScenePoint;
  lane: number;
}

/**
 * Ruch auta w turze kierowcy: o `advanceSq` kratek wzdłuż drogi i na środek
 * pasu docelowego. Wzdłuż bez przycięcia do sceny — auto, które wyjedzie za
 * krawędź, odpada z pościgu (`chaseOffscreen`).
 */
export function chaseDriveStep(input: ChaseDriveStepInput): ChaseDriveStep {
  const along = chaseShiftAlong(
    input.centre,
    input.settings.direction,
    input.advanceSq,
    input.scene.gridSizePx,
  );
  return {
    from: input.centre,
    to: chaseSnapToLane(along, input.lane, input.lanes, input.settings, input.scene),
    lane: input.lane,
  };
}

// ───────────────────────── Kadr ─────────────────────────

export const CHASE_ROLE_LABELS: Record<ChaseRole, string> = {
  pursue: 'Drużyna goni',
  flee: 'Drużyna ucieka',
};

/**
 * Gdzie stoi auto kadru: tyle długości kadru od tylnej krawędzi, gdy drużyna
 * goni, i tyle samo od przedniej, gdy ucieka.
 */
export const CHASE_ANCHOR_FRACTION = 0.3;

/** Pozycja punktu wzdłuż drogi w pikselach, liczona od tylnej krawędzi kadru. */
export function chaseAlongFromRear(
  point: ScenePoint,
  direction: ChaseDirection,
  scene: { width: number; height: number },
): number {
  switch (direction) {
    case 'right':
      return point.x;
    case 'left':
      return scene.width - point.x;
    case 'down':
      return point.y;
    case 'up':
      return scene.height - point.y;
  }
}

/**
 * Sztywne przesunięcie kadru na początku rundy w kratkach wzdłuż kierunku
 * jazdy (ujemne — w tył): o tyle przesuwa się wszystko na drodze — auta,
 * figury w fotelach, przeszkody — żeby środek auta kadru stanął na swoim
 * miejscu (`CHASE_ANCHOR_FRACTION`).
 */
export function chaseAnchorShift(
  anchor: ScenePoint,
  direction: ChaseDirection,
  role: ChaseRole,
  scene: { width: number; height: number; gridSizePx: number },
): number {
  const length = chaseIsHorizontal(direction) ? scene.width : scene.height;
  const target = (role === 'pursue' ? CHASE_ANCHOR_FRACTION : 1 - CHASE_ANCHOR_FRACTION) * length;
  return (target - chaseAlongFromRear(anchor, direction, scene)) / scene.gridSizePx;
}

/** Auto w wyborze auta kadru. */
export interface ChaseAnchorCandidate {
  id: string;
  status: SceneVehicleStatus;
  party: boolean;
  control: ChaseControl;
  speed: number;
}

/**
 * Auto kadru: wskazane przez MG, o ile jest w kadrze; inaczej pierwsze auto
 * drużyny z kierowcą (reguła z 05.11), potem pierwsze auto drużyny w ogóle
 * (stoi auto drużyny → stoi droga), a bez auta drużyny — najszybsze auto
 * w kadrze. Wrak drużyny trzyma kadr, wrak obcy nie. `null` — pusta droga.
 */
export function chaseAnchorVehicle(
  vehicles: readonly ChaseAnchorCandidate[],
  chosenId: string | null = null,
): string | null {
  const inFrame = (vehicle: ChaseAnchorCandidate) =>
    vehicle.status === 'racing' || vehicle.status === 'wrecked';
  const chosen = chosenId ? vehicles.find((vehicle) => vehicle.id === chosenId) : undefined;
  if (chosen && inFrame(chosen)) return chosen.id;
  const party = vehicles.filter((vehicle) => vehicle.party && inFrame(vehicle));
  const driven = party.find((vehicle) => vehicle.status === 'racing' && vehicle.control !== 'none');
  if (driven) return driven.id;
  if (party.length > 0) return party[0]!.id;
  let fastest: ChaseAnchorCandidate | null = null;
  for (const vehicle of vehicles) {
    if (vehicle.status !== 'racing') continue;
    if (!fastest || vehicle.speed > fastest.speed) fastest = vehicle;
  }
  return fastest?.id ?? null;
}

// ───────────────────────── Prognoza przeszkody ─────────────────────────

export interface ChaseObstacleEta {
  /** Odstęp od przedniego zderzaka auta do przeszkody wzdłuż drogi, w kratkach (0 — styk). */
  gapSq: number;
  /** Za ile rund auto do niej dojedzie; `null` — auto stoi i nie dojedzie wcale. */
  rounds: number | null;
  /** Czy przeszkoda zachodzi w poprzek na bryłę auta — stoi na jego drodze. */
  sameLane: boolean;
}

/**
 * Podpis przeszkody „16 m · za 2 tury” dla jednego auta. Przeszkoda stoi na
 * drodze, a kadr jedzie z prędkością pościgu, więc auto zbliża się do niej
 * o tyle kratek na rundę, ile samo przejeżdża po drodze (`roadSqPerRound` —
 * system liczy je z prędkości auta). Przeszkoda za przednim zderzakiem
 * (minięta) — `null`.
 */
export function chaseObstacleEta(
  vehicle: { centre: ScenePoint; body: Pick<ChaseBody, 'widthSq' | 'lengthSq'> },
  obstacle: { centre: ScenePoint; widthSq: number; lengthSq: number },
  direction: ChaseDirection,
  scene: { width: number; height: number; gridSizePx: number },
  roadSqPerRound: number,
): ChaseObstacleEta | null {
  const grid = scene.gridSizePx;
  const car = chaseBodyHalfExtents(vehicle.body, direction, grid);
  const own = chaseBodyHalfExtents(obstacle, direction, grid);
  const horizontal = chaseIsHorizontal(direction);
  const carAlong = chaseAlongFromRear(vehicle.centre, direction, scene);
  const obstacleAlong = chaseAlongFromRear(obstacle.centre, direction, scene);
  if (obstacleAlong + (horizontal ? own.hx : own.hy) <= carAlong + (horizontal ? car.hx : car.hy)) {
    return null;
  }
  const gapPx =
    obstacleAlong - (horizontal ? own.hx : own.hy) - (carAlong + (horizontal ? car.hx : car.hy));
  const gapSq = Math.max(0, gapPx / grid);
  const acrossGap = horizontal
    ? Math.abs(obstacle.centre.y - vehicle.centre.y)
    : Math.abs(obstacle.centre.x - vehicle.centre.x);
  const sameLane = acrossGap < (horizontal ? car.hy + own.hy : car.hx + own.hx);
  const step = Math.max(0, roadSqPerRound);
  const rounds = gapSq === 0 ? 0 : step > 0 ? Math.ceil(gapSq / step) : null;
  return { gapSq, rounds, sameLane };
}

// ───────────────────────── Okno „Pościg” (etap 72f2) ─────────────────────────

/** Punkt sceny z położenia wzdłuż drogi (od tylnej krawędzi kadru) i w poprzek. */
export function chasePointAlong(
  along: number,
  across: number,
  direction: ChaseDirection,
  scene: { width: number; height: number },
): ScenePoint {
  switch (direction) {
    case 'right':
      return { x: along, y: across };
    case 'left':
      return { x: scene.width - along, y: across };
    case 'down':
      return { x: across, y: along };
    case 'up':
      return { x: across, y: scene.height - along };
  }
}

/** Auto, przed którym MG stawia przeszkodę — środek i bryła. */
export interface ChaseDropBefore {
  centre: ScenePoint;
  body: Pick<ChaseBody, 'widthSq' | 'lengthSq'>;
}

/** Pół długości bryły wzdłuż drogi w pikselach. */
function halfAlongPx(
  body: Pick<ChaseBody, 'widthSq' | 'lengthSq'>,
  direction: ChaseDirection,
  grid: number,
): number {
  const { hx, hy } = chaseBodyHalfExtents(body, direction, grid);
  return chaseIsHorizontal(direction) ? hx : hy;
}

/**
 * Najdalszy odstęp przeszkody od przedniego zderzaka auta w kratkach, przy
 * którym przeszkoda stoi jeszcze cała w kadrze (decyzja MG 21.11: tylko
 * w kadrze). Ujemny — przed autem nie ma na nią miejsca.
 */
export function chaseObstacleMaxGapSq(
  before: ChaseDropBefore,
  body: Pick<ChaseBody, 'widthSq' | 'lengthSq'>,
  direction: ChaseDirection,
  scene: { width: number; height: number; gridSizePx: number },
): number {
  const grid = scene.gridSizePx;
  const length = chaseIsHorizontal(direction) ? scene.width : scene.height;
  const carFront =
    chaseAlongFromRear(before.centre, direction, scene) + halfAlongPx(before.body, direction, grid);
  return (length - carFront - 2 * halfAlongPx(body, direction, grid)) / grid;
}

/**
 * Środek przeszkody wypuszczonej z okna „Pościg” (etap 72f2): w poprzek — na
 * środku pasa, wzdłuż — `gapSq` kratek przed przednim zderzakiem auta
 * `before`, a bez auta przy przedniej krawędzi kadru. Za daleko — przycięta
 * do przedniej krawędzi: przeszkoda zawsze stoi cała w kadrze.
 */
export function chaseObstacleDropCentre(input: {
  lane: number;
  lanes: number;
  body: Pick<ChaseBody, 'widthSq' | 'lengthSq'>;
  settings: Pick<ChaseSettings, 'direction' | 'road'>;
  scene: ChaseDriveFrame;
  before?: (ChaseDropBefore & { gapSq: number }) | null;
}): ScenePoint {
  const { direction } = input.settings;
  const grid = input.scene.gridSizePx;
  const length = chaseIsHorizontal(direction) ? input.scene.width : input.scene.height;
  const half = halfAlongPx(input.body, direction, grid);
  const front = length - half;
  let along = front;
  if (input.before) {
    const carFront =
      chaseAlongFromRear(input.before.centre, direction, input.scene) +
      halfAlongPx(input.before.body, direction, grid);
    along = carFront + Math.max(0, input.before.gapSq) * grid + half;
  }
  along = Math.min(front, Math.max(half, along));
  const across = chaseLaneCentre(input.lane, input.lanes, input.settings, input.scene);
  return clampChaseVehicle(
    chasePointAlong(along, across, direction, input.scene),
    input.body,
    input.settings,
    input.scene,
  );
}

/**
 * Miejsce wjazdu auta przywróconego do pościgu (etap 72f2): środek pasa,
 * możliwie najbliżej wybranej krawędzi kadru (cała bryła w kadrze), krokiem
 * jednej kratki w głąb, póki nie nachodzi na stojące auto (z pół kratki
 * odstępu, jak `chaseFreeSpot`). Brak miejsca — sama krawędź (MG poprawi).
 */
export function chaseEntryCentre(input: {
  lane: number;
  lanes: number;
  side: ChaseEntrySide;
  body: Pick<ChaseBody, 'widthSq' | 'lengthSq'>;
  parked: readonly ChaseParkedBody[];
  settings: Pick<ChaseSettings, 'direction' | 'road'>;
  scene: ChaseDriveFrame;
}): ScenePoint {
  const { direction } = input.settings;
  const grid = input.scene.gridSizePx;
  const length = chaseIsHorizontal(direction) ? input.scene.width : input.scene.height;
  const half = halfAlongPx(input.body, direction, grid);
  const own = chaseBodyHalfExtents(input.body, direction, grid);
  const across = chaseLaneCentre(input.lane, input.lanes, input.settings, input.scene);
  const at = (along: number) =>
    clampChaseVehicle(
      chasePointAlong(along, across, direction, input.scene),
      input.body,
      input.settings,
      input.scene,
    );
  const free = (centre: ScenePoint) =>
    !input.parked.some((other) => {
      const o = chaseBodyHalfExtents(other, direction, grid);
      return (
        Math.abs(centre.x - other.x) < own.hx + o.hx + grid * 0.5 &&
        Math.abs(centre.y - other.y) < own.hy + o.hy + grid * 0.5
      );
    });
  const edge = input.side === 'rear' ? half : length - half;
  const step = input.side === 'rear' ? grid : -grid;
  for (let along = edge; along >= half - 0.5 && along <= length - half + 0.5; along += step) {
    const centre = at(along);
    if (free(centre)) return centre;
  }
  return at(edge);
}

// ───────────────────────── Zamiar auta (autopilot, etap 72e) ─────────────────────────

/**
 * Zamiar auta NPC-a (etap 72e, decyzja MG 10): `manual` — MG prowadzi sam
 * kokpitem, reszta — autopilot dobiera pedał i pas w turze kierowcy. Zamiar
 * jest tajemnicą MG: do graczy nie jedzie (`SceneVehicleView.intent`).
 */
export const CHASE_INTENTS = ['manual', 'flee', 'pursue', 'keep', 'ram', 'block'] as const;
export type ChaseIntent = (typeof CHASE_INTENTS)[number];

export function isChaseIntent(value: unknown): value is ChaseIntent {
  return (CHASE_INTENTS as readonly unknown[]).includes(value);
}

export const CHASE_INTENT_LABELS: Record<ChaseIntent, string> = {
  manual: 'Ręcznie',
  flee: 'Uciekaj',
  pursue: 'Goń',
  keep: 'Trzymaj dystans',
  ram: 'Taranuj',
  block: 'Blokuj',
};

/** Zamiary, które jadą względem innego auta (`targetId`). */
export function chaseIntentNeedsTarget(intent: ChaseIntent): boolean {
  return intent !== 'manual' && intent !== 'flee';
}

/** Podpis zamiaru: „Goń: Włóczęga”, „Uciekaj”. */
export function chaseIntentLabel(intent: ChaseIntent, targetName: string | null): string {
  const label = CHASE_INTENT_LABELS[intent];
  return chaseIntentNeedsTarget(intent) && targetName ? `${label}: ${targetName}` : label;
}
