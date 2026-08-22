/**
 * CP RED areas of effect (stage 16d) — pure geometry, no IO.
 *
 * Two shapes carry the whole chapter:
 *
 *  - the **blast square**: „Wszystkie bronie eksplodujące zadają obrażenia
 *    wszystkim celom (w tym terenowi) na obszarze 10 m x 10 m (5 pól na 5 pól),
 *    przy czym twój cel (pole 2x2 metry, nie osoba) jest środkiem tego obszaru"
 *    (s. 174). The centre being a *square* rather than a person is the reason a
 *    grenade is aimed at the ground and snaps to the grid;
 *  - the **cone**: „każdy cel znajdujący się do 6 m przed tobą (3 pola) i w polu
 *    twojego widzenia" (s. 174) — built here, used by shotgun shell in stage 16g.
 *
 * Everything works in scene pixels and takes the scene's own square size, so a
 * map drawn at any resolution measures right. Metres never leave the labels.
 */

import type { DiceRng } from '../../dice.js';
import { formatMetres, metresPerPixel, type ScenePoint } from '../../measure.js';
import type { SceneView } from '../../scenes.js';

/** Scene fields an area needs: the grid it snaps to and its metre scale. */
export type AreaScene = Pick<SceneView, 'grid' | 'metersPerSquare'>;

/** Side of the explosion square (s. 174). */
export const CPRED_BLAST_SIDE_M = 10;

/** Reach of the shotgun cone (s. 174); the shape itself lands in stage 16g. */
export const CPRED_CONE_RANGE_M = 6;

/**
 * Half-angle of that cone. The rulebook draws a diagram rather than printing a
 * number — „przed tobą" plus a picture — so 45° (a 90° wedge) is a **reading**,
 * chosen because it is what „in front of me" means on a square grid: the three
 * squares ahead plus their diagonals.
 */
export const CPRED_CONE_HALF_ANGLE_DEG = 45;

/** Longest throw of an arm: „Maksymalny zasięg rzutu to 25 m" (s. 177). */
export const CPRED_THROW_RANGE_M = 25;

/** Pixels per metre on this scene; 0 when the grid is unusable. */
function pixelsPerMetre(scene: AreaScene): number {
  const perPixel = metresPerPixel(scene);
  return perPixel > 0 ? 1 / perPixel : 0;
}

/** Square size in metres, falling back to the CP RED default of 2 m. */
export function squareMetres(scene: AreaScene): number {
  return Number.isFinite(scene.metersPerSquare) && scene.metersPerSquare > 0
    ? scene.metersPerSquare
    : 2;
}

/**
 * Centre of the grid square a point falls in.
 *
 * This is the one line that makes „twój cel to pole, nie osoba" true: whatever
 * the player clicked, the explosion is centred on a square.
 */
export function snapToSquareCentre(point: ScenePoint, scene: AreaScene): ScenePoint {
  const cell = scene.grid.sizePx;
  if (!Number.isFinite(cell) || cell <= 0) return { x: point.x, y: point.y };
  const index = (value: number, offset: number) => Math.floor((value - offset) / cell);
  return {
    x: scene.grid.offsetX + (index(point.x, scene.grid.offsetX) + 0.5) * cell,
    y: scene.grid.offsetY + (index(point.y, scene.grid.offsetY) + 0.5) * cell,
  };
}

/** A square area of effect, in scene pixels. */
export interface CpredBlastArea {
  /** Centre of the square — always the middle of a grid square. */
  centre: ScenePoint;
  /** Side in scene pixels. */
  sidePx: number;
  /** Side in metres — what the label says („10 m"). */
  sideM: number;
}

/** The 10×10 m square centred on the square containing `point`. */
export function blastAreaAt(
  point: ScenePoint,
  scene: AreaScene,
  sideM: number = CPRED_BLAST_SIDE_M,
): CpredBlastArea {
  return {
    centre: snapToSquareCentre(point, scene),
    sidePx: sideM * pixelsPerMetre(scene),
    sideM,
  };
}

/**
 * Is this point inside the square? Inclusive on the edge: a token standing on
 * the line is in the blast, because the alternative is telling a player they
 * survived a grenade by a rounding error.
 */
export function isInBlast(area: CpredBlastArea, point: ScenePoint): boolean {
  const half = area.sidePx / 2;
  return (
    Math.abs(point.x - area.centre.x) <= half + EDGE_EPSILON_PX &&
    Math.abs(point.y - area.centre.y) <= half + EDGE_EPSILON_PX
  );
}

/**
 * Slack on the boundary, in scene pixels. Token centres are computed from
 * integer positions and a half-square, so they land exactly on the edge often
 * enough that floating point noise would otherwise decide a life.
 */
const EDGE_EPSILON_PX = 0.001;

/** A wedge in front of somebody, in scene pixels. */
export interface CpredConeArea {
  origin: ScenePoint;
  /** Direction of the axis, in radians. */
  angle: number;
  /** Reach along the axis, in scene pixels. */
  rangePx: number;
  /** Half the opening, in radians. */
  halfAngle: number;
  rangeM: number;
}

/** The cone reaching `rangeM` from `origin` towards `towards`. */
export function coneAreaTowards(
  origin: ScenePoint,
  towards: ScenePoint,
  scene: AreaScene,
  rangeM: number = CPRED_CONE_RANGE_M,
  halfAngleDeg: number = CPRED_CONE_HALF_ANGLE_DEG,
): CpredConeArea {
  return {
    origin: { x: origin.x, y: origin.y },
    angle: Math.atan2(towards.y - origin.y, towards.x - origin.x),
    rangePx: rangeM * pixelsPerMetre(scene),
    halfAngle: (halfAngleDeg * Math.PI) / 180,
    rangeM,
  };
}

/**
 * Is this point inside the cone? The origin itself counts as inside — the
 * muzzle is not a safe place to stand, and a zero-length vector has no angle
 * to compare.
 */
export function isInCone(area: CpredConeArea, point: ScenePoint): boolean {
  const dx = point.x - area.origin.x;
  const dy = point.y - area.origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance > area.rangePx + EDGE_EPSILON_PX) return false;
  if (distance <= EDGE_EPSILON_PX) return true;
  const delta = Math.abs(normaliseAngle(Math.atan2(dy, dx) - area.angle));
  return delta <= area.halfAngle + ANGLE_EPSILON;
}

/** Slack on the cone's edge, in radians — the same reasoning as the square's. */
const ANGLE_EPSILON = 1e-9;

/** Folds an angle into (−π, π] so two directions can be compared. */
function normaliseAngle(radians: number): number {
  const twoPi = Math.PI * 2;
  let value = radians % twoPi;
  if (value > Math.PI) value -= twoPi;
  if (value <= -Math.PI) value += twoPi;
  return value;
}

/**
 * Where a missed charge lands — a **house rule**, and deliberately labelled as
 * one wherever it is shown.
 *
 * The rulebook hands this to the GM: „Jeśli nie trafisz w wybrany cel, MG
 * decyduje, gdzie ląduje ładunek wybuchowy, wybierając punkt na obszarze
 * 10 m × 10 m wyśrodkowanym na pierwotnym celu" (s. 174). A decision is no use
 * to a bot throwing a grenade in stage 20, or to a GM playing solo, so the VTT
 * rolls for it instead — and shows the roll, so the table can see where the
 * blast came from rather than being told.
 *
 * Direction is a clock face of ten, the system's own die. Distance is the same
 * die minus the stat that threw (DEX by hand, REF from a launcher), clamped to
 * one or two squares: a steady hand drops it next door, a shaky one two squares
 * off. Two squares is the furthest square *centre* inside the rulebook's 10×10 m
 * box, so the cap is the book's, not an invention.
 */
export interface CpredScatter {
  /** 1d10 that picked the direction. */
  directionDie: number;
  /** 1d10 that picked the distance. */
  distanceDie: number;
  /** The stat subtracted from the distance die. */
  stat: number;
  /** Label of that stat („ZW"), for the card. */
  statLabel: string;
  /** Direction in degrees, clockwise from east. */
  angleDeg: number;
  /** Distance in metres, after the clamp. */
  metres: number;
  /**
   * Which end of the range caught the roll, when one did (stage 16d house
   * rule). On the roll rather than derived at the card, because the card is
   * where it was missed: „odległość 1k10 = 5 − ZW 7 = 2 m" is arithmetic that
   * does not add up, and a GM reading it at the table counts on their fingers
   * and calls it a bug (bug #7 of the 08.08 combat session).
   */
  clamped?: 'min' | 'max';
}

/** Closest a scattered charge may land: one square. */
export function scatterMinMetres(scene: AreaScene): number {
  return squareMetres(scene);
}

/** Furthest: two squares — the outer ring of the rulebook's 10×10 m box. */
export function scatterMaxMetres(scene: AreaScene): number {
  return squareMetres(scene) * 2;
}

/** Rolls the scatter. `stat` is the attribute the throw was made with. */
export function rollBlastScatter(
  rng: DiceRng,
  stat: number,
  statLabel: string,
  scene: AreaScene,
): CpredScatter {
  const directionDie = rng(10);
  const distanceDie = rng(10);
  const min = scatterMinMetres(scene);
  const max = scatterMaxMetres(scene);
  const rolled = distanceDie - stat;
  const metres = Math.min(Math.max(rolled, min), max);
  return {
    directionDie,
    distanceDie,
    stat,
    statLabel,
    // Ten positions, 36° apart, starting due east.
    angleDeg: (directionDie - 1) * 36,
    metres,
    ...(rolled < min
      ? { clamped: 'min' as const }
      : rolled > max
        ? { clamped: 'max' as const }
        : {}),
  };
}

/** Where the charge actually goes off, snapped back onto the grid. */
export function scatteredCentre(
  aim: ScenePoint,
  scatter: CpredScatter,
  scene: AreaScene,
): ScenePoint {
  const radians = (scatter.angleDeg * Math.PI) / 180;
  const px = scatter.metres * pixelsPerMetre(scene);
  return snapToSquareCentre(
    { x: aim.x + Math.cos(radians) * px, y: aim.y + Math.sin(radians) * px },
    scene,
  );
}

/** „kierunek 1k10 = 7 (216°) · odległość 1k10 = 6 − ZW 4 = 2 m" — card text. */
export function describeScatter(scatter: CpredScatter): string {
  const arithmetic = `kierunek 1k10 = ${scatter.directionDie} (${scatter.angleDeg}°) · odległość 1k10 = ${
    scatter.distanceDie
  } − ${scatter.statLabel} ${scatter.stat}`;
  const result = formatMetres(scatter.metres);
  // Kiedy zadziałał limit, karta mówi „→ najmniej/najwyżej", a nie „=" — bo
  // odejmowanie i wynik przestały być tym samym zdaniem.
  if (scatter.clamped === 'min') {
    return `${arithmetic} → najmniej ${result} (ładunek zawsze schodzi o pole)`;
  }
  if (scatter.clamped === 'max') {
    return `${arithmetic} → najwyżej ${result} (dalej niż o dwa pola nie odbija)`;
  }
  return `${arithmetic} = ${result}`;
}
