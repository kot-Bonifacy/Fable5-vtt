import type { ScenePoint } from './measure.js';

/**
 * Zatwierdzona trasa marszu gracza (etap 52).
 *
 * Do etapu 52 klatka pośrednia `token:move` gracza była pozycją z ręki —
 * serwer ją rozsyłał i liczył z niej widzenie, nie pytając o nic, więc
 * przeciągnięcie figury przez mur odsłaniało pokój za nim. Od 52 gracz zgłasza
 * trasę z góry (`token:walk`), serwer sprawdza ją całą, a każdą klatkę marszu
 * **rzutuje na tę trasę**: pozycja, z której liczy się widzenie, zawsze leży na
 * drodze, którą wolno było przejść.
 *
 * Rdzeń VTT: sama geometria na pikselach sceny (pozycje figur to lewy górny
 * róg, jak w bazie). O metrach, Turze i systemie gry nie wie nic.
 */

/** Najdalsze odejście lądowania od trasy, w kratkach (marsz kończy się na polu obok). */
export const WALK_LANDING_SLACK_CELLS = 1;

/** Figura na drodze — lewy górny róg w pikselach sceny i bok w kratkach. */
export interface WalkFigure {
  x: number;
  y: number;
  size: number;
}

/** Gdzie na trasie leży punkt najbliższy danemu. */
export interface RouteProjection {
  /** Punkt na trasie. */
  point: ScenePoint;
  /** Ile pikseli trasy od jej początku do `point`. */
  distance: number;
  /** Jak daleko od trasy leżał rzutowany punkt, w pikselach. */
  offset: number;
}

/** Narastające długości trasy: `[0, |p0p1|, |p0p1|+|p1p2|, …]`. */
export function routeLengths(route: readonly ScenePoint[]): number[] {
  const lengths = [0];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!;
    const b = route[i]!;
    lengths.push(lengths[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return lengths;
}

/**
 * Najbliższy punkt trasy. Przy trasie, która przecina samą siebie, wygrywa
 * wcześniejszy odcinek — remis rozstrzyga kolejność, nie przypadek.
 */
export function projectOntoRoute(route: readonly ScenePoint[], point: ScenePoint): RouteProjection {
  const first = route[0];
  if (!first) return { point: { ...point }, distance: 0, offset: 0 };
  const lengths = routeLengths(route);
  let best: RouteProjection = {
    point: { x: first.x, y: first.y },
    distance: 0,
    offset: Math.hypot(point.x - first.x, point.y - first.y),
  };
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!;
    const b = route[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const span = dx * dx + dy * dy;
    const t =
      span > 0 ? Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / span)) : 0;
    const at = { x: a.x + dx * t, y: a.y + dy * t };
    const offset = Math.hypot(point.x - at.x, point.y - at.y);
    if (offset < best.offset - 1e-9) {
      best = { point: at, distance: lengths[i - 1]! + Math.sqrt(span) * t, offset };
    }
  }
  return best;
}

/**
 * Punkty załamania trasy minięte przed `distance` (bez punktu startu) — ta sama
 * łamana, którą klient zgłasza na mecie przerwanego marszu: całe odcinki, a od
 * ostatniego prosto do lądowania.
 */
export function routeWaypointsBefore(route: readonly ScenePoint[], distance: number): ScenePoint[] {
  const lengths = routeLengths(route);
  const passed: ScenePoint[] = [];
  for (let i = 1; i < route.length; i++) {
    if (lengths[i]! >= distance - 0.5) break;
    passed.push({ x: route[i]!.x, y: route[i]!.y });
  }
  return passed;
}

/** Luz na brzegach, żeby figury stykające się bokiem nie liczyły się jako zderzenie. */
const FIGURE_INSET_PX = 1;

/**
 * Czy odcinek `a → b` wchodzi do **otwartego** prostokąta (metoda płyt).
 * Styk z brzegiem nie jest wejściem.
 */
function segmentEntersBox(
  a: ScenePoint,
  b: ScenePoint,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  if (minX >= maxX || minY >= maxY) return false;
  let t0 = 0;
  let t1 = 1;
  const axes: [number, number, number, number][] = [
    [a.x, b.x - a.x, minX, maxX],
    [a.y, b.y - a.y, minY, maxY],
  ];
  for (const [start, delta, min, max] of axes) {
    if (Math.abs(delta) < 1e-9) {
      if (start <= min || start >= max) return false;
      continue;
    }
    const tA = (min - start) / delta;
    const tB = (max - start) / delta;
    t0 = Math.max(t0, Math.min(tA, tB));
    t1 = Math.min(t1, Math.max(tA, tB));
    if (t0 >= t1) return false;
  }
  return true;
}

/**
 * Prostokąt pozycji (lewy górny róg idącego), w których idący o boku
 * `moverExtent` nachodzi na figurę — suma Minkowskiego, pomniejszona o luz.
 */
function blockedBox(figure: WalkFigure, moverExtent: number, cell: number) {
  const extent = figure.size * cell;
  return {
    minX: figure.x - moverExtent + FIGURE_INSET_PX,
    minY: figure.y - moverExtent + FIGURE_INSET_PX,
    maxX: figure.x + extent - FIGURE_INSET_PX,
    maxY: figure.y + extent - FIGURE_INSET_PX,
  };
}

function overlapsAt(point: ScenePoint, figure: WalkFigure, moverExtent: number, cell: number) {
  const box = blockedBox(figure, moverExtent, cell);
  return point.x > box.minX && point.x < box.maxX && point.y > box.minY && point.y < box.maxY;
}

/** Czy idący o boku `moverSize` kratek, stojąc w `position` (lewy górny róg), nachodzi na figurę. */
export function overlapsFigure(
  position: ScenePoint,
  moverSize: number,
  cell: number,
  figure: WalkFigure,
): boolean {
  return overlapsAt(position, figure, moverSize * cell, cell);
}

/**
 * Pytania planera trasy (etap 52) w tej samej geometrii co `firstFigureBlock`,
 * tylko pole po polu: planer sprawdza środek każdego pola figury i linię, którą
 * ten środek przejdzie. Kwadrat pola przesunięty wzdłuż linii wchodzi na figurę
 * wtedy i tylko wtedy, gdy linia jego środka wchodzi w figurę powiększoną
 * o pół pola — więc suma linii pól to dokładnie ruch całej figury, jak na serwerze.
 */
export function pointInFigure(point: ScenePoint, figure: WalkFigure, cell: number): boolean {
  const extent = figure.size * cell;
  return (
    point.x > figure.x &&
    point.x < figure.x + extent &&
    point.y > figure.y &&
    point.y < figure.y + extent
  );
}

/** Czy linia środka jednego pola idącego (`a → b`) wchodzi na figurę. */
export function laneHitsFigure(
  a: ScenePoint,
  b: ScenePoint,
  figure: WalkFigure,
  cell: number,
): boolean {
  const half = cell / 2;
  const extent = figure.size * cell;
  return segmentEntersBox(
    a,
    b,
    figure.x - half + FIGURE_INSET_PX,
    figure.y - half + FIGURE_INSET_PX,
    figure.x + extent + half - FIGURE_INSET_PX,
    figure.y + extent + half - FIGURE_INSET_PX,
  );
}

/**
 * Czy trasa przechodzi przez figurę albo kończy się na niej (etap 52, decyzja MG).
 *
 * `pass` — figury, przez które nie da się przejść; `land` — figury, na których
 * nie da się stanąć. Kto jest kim, rozstrzyga wołający (system gry, widoczność):
 * rdzeń sprawdza tylko geometrię całej figury, nie jej środka, i nie pozwala
 * ściąć rogu po skosie między dwiema figurami ani obok jednej.
 *
 * Figura, na którą idący już nachodzi na starcie (MG postawił ich jedną na
 * drugiej), nie zatrzymuje go — inaczej nie mógłby z niej zejść.
 */
export function firstFigureBlock(
  path: readonly ScenePoint[],
  moverSize: number,
  cell: number,
  blockers: { pass: readonly WalkFigure[]; land: readonly WalkFigure[] },
): 'pass' | 'land' | null {
  const start = path[0];
  if (!start || cell <= 0) return null;
  const extent = moverSize * cell;
  const free = (figure: WalkFigure) => !overlapsAt(start, figure, extent, cell);
  const pass = blockers.pass.filter(free);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    for (const figure of pass) {
      const box = blockedBox(figure, extent, cell);
      if (segmentEntersBox(a, b, box.minX, box.minY, box.maxX, box.maxY)) return 'pass';
    }
  }
  const end = path[path.length - 1]!;
  if (blockers.land.filter(free).some((figure) => overlapsAt(end, figure, extent, cell))) {
    return 'land';
  }
  return null;
}
