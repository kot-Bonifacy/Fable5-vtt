import type { ScenePoint } from '@vtt/shared';

/** How a walked or planned route is turned into a row of boot prints. */
export interface FootprintOptions {
  /** Ground between two prints, in px of the route. */
  stepPx: number;
  /** How far each boot stands off the walked line, in px. */
  offsetPx: number;
  /**
   * How wide a corner the walker rounds, in px — the reach of the smoothing
   * on either side of a sample. Zero keeps the route's own sharp corners.
   */
  turnPx: number;
  /** Ceiling on prints, so a long route cannot flood the layer. */
  max: number;
  /**
   * Route px the prints stop at, when the route runs on past them — a march
   * passes its whole plan and how far the figure has got. The rest of the plan
   * only bends the line, so a print laid down just past a corner stays put as
   * the figure walks on, rather than sliding onto the curve a frame later.
   */
  untilPx?: number;
}

/** One boot print, ready to be drawn. */
export interface FootprintPlacement {
  /** Centre of the print, in the route's own coordinates. */
  x: number;
  y: number;
  /** Direction of travel at this print, in radians (`atan2`, y down). */
  heading: number;
  /** Route px behind this print — measured along the route, not the rounded line. */
  along: number;
  /** +1 for the walker's right boot, −1 for the left. */
  side: 1 | -1;
}

/** Most samples the rounded line is built from, however long the route. */
const MAX_SAMPLES = 2000;

/**
 * Where the boots of a route land (MG, 26.09: „zakręty mi się nie podobają").
 *
 * The route is a polyline — a planned one is two or three string-pulled legs
 * meeting at hard corners, a dragged one is a jittery run of mouse samples. A
 * print that takes its heading and its side from the leg under it swings the
 * whole angle between one print and the next, and at a corner the side offset
 * folds the inner boots onto each other and leaves a hole on the outside. Nobody
 * walks like that: a person rounds a corner over a step or two.
 *
 * So the gait follows a **rounded** copy of the route — resampled evenly and
 * smoothed twice with a box window (a triangle kernel, no overshoot, endpoints
 * held) — while the *spacing* is still counted along the route itself. „One
 * print = one metre" and the colour bands keep meaning metres of the route the
 * figure actually walks; only the line the boots stand on is bent.
 */
export function placeFootprints(
  points: readonly ScenePoint[],
  options: FootprintOptions,
): FootprintPlacement[] {
  const { stepPx, offsetPx, turnPx, max, untilPx = Infinity } = options;
  if (points.length < 2 || !(stepPx > 0) || !(max > 0)) return [];

  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!;
    const to = points[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(to.x - from.x, to.y - from.y));
  }
  const total = cumulative[cumulative.length - 1]!;
  if (!(total > 0)) return [];

  // Evenly spaced samples along the route: sample i sits `i * ds` px in.
  const fine = turnPx > 0 ? turnPx / 6 : stepPx / 4;
  const count = Math.max(2, Math.min(MAX_SAMPLES, Math.ceil(total / Math.max(fine, 0.5))));
  const ds = total / count;
  const xs = new Float64Array(count + 1);
  const ys = new Float64Array(count + 1);
  let leg = 1;
  for (let i = 0; i <= count; i++) {
    const s = i === count ? total : i * ds;
    while (leg < points.length - 1 && cumulative[leg]! < s) leg += 1;
    const from = points[leg - 1]!;
    const to = points[leg]!;
    const length = cumulative[leg]! - cumulative[leg - 1]!;
    const t = length > 0 ? (s - cumulative[leg - 1]!) / length : 0;
    xs[i] = from.x + (to.x - from.x) * t;
    ys[i] = from.y + (to.y - from.y) * t;
  }

  // Two passes of half the turn each make one triangle kernel `turnPx` wide.
  const reach = Math.round(turnPx / 2 / ds);
  if (reach > 0) {
    boxSmooth(xs, reach);
    boxSmooth(ys, reach);
    boxSmooth(xs, reach);
    boxSmooth(ys, reach);
  }

  const end = Math.min(total, untilPx) + 1e-6;
  const placements: FootprintPlacement[] = [];
  for (let along = stepPx; along <= end && placements.length < max; along += stepPx) {
    const u = Math.min(count, along / ds);
    const i = Math.min(count - 1, Math.floor(u));
    const t = u - i;
    const x = xs[i]! + (xs[i + 1]! - xs[i]!) * t;
    const y = ys[i]! + (ys[i + 1]! - ys[i]!) * t;
    const heading = headingAt(xs, ys, i, points, cumulative, along);
    const ux = Math.cos(heading);
    const uy = Math.sin(heading);
    // +1 is the walker's right — the perpendicular below is their right
    // hand, because the map's y runs down the screen.
    const side: 1 | -1 = placements.length % 2 === 0 ? 1 : -1;
    const offset = offsetPx * side;
    placements.push({ x: x - uy * offset, y: y + ux * offset, heading, along, side });
  }
  return placements;
}

/**
 * Moving average in place, with a window that shrinks symmetrically towards
 * the ends — so both ends stay exactly where the route starts and stops, and
 * the first and last steps point along the first and last legs.
 */
function boxSmooth(values: Float64Array, reach: number): void {
  const n = values.length;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i]! + values[i]!;
  for (let i = 0; i < n; i++) {
    const k = Math.min(reach, i, n - 1 - i);
    values[i] = (prefix[i + k + 1]! - prefix[i - k]!) / (2 * k + 1);
  }
}

/** Direction of the rounded line at sample `i`, or of the route's leg if it has none. */
function headingAt(
  xs: Float64Array,
  ys: Float64Array,
  i: number,
  points: readonly ScenePoint[],
  cumulative: readonly number[],
  along: number,
): number {
  const last = xs.length - 1;
  const a = Math.max(0, i - 1);
  const b = Math.min(last, i + 2);
  const dx = xs[b]! - xs[a]!;
  const dy = ys[b]! - ys[a]!;
  if (Math.hypot(dx, dy) > 1e-9) return Math.atan2(dy, dx);
  let leg = 1;
  while (leg < points.length - 1 && cumulative[leg]! < along) leg += 1;
  const from = points[leg - 1]!;
  const to = points[leg]!;
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * How much of a fading trail's print is left, 0–1 (MG, 26.09).
 *
 * The trail goes the way it was laid: first the whole of it stands for `hold`
 * of its life, then a front sweeps from the oldest print to the newest, `edge`
 * of the trail wide, and the newest print goes out as the life ends.
 *
 * @param metres how far along the trail the print stands
 * @param totalMetres the trail's whole length
 * @param elapsed share of the trail's life already gone, 0–1
 */
export function trailFadeStrength(
  metres: number,
  totalMetres: number,
  elapsed: number,
  hold: number,
  edge: number,
): number {
  const sweep = Math.max(0, (elapsed - hold) / (1 - hold));
  const age = totalMetres > 0 ? Math.min(1, metres / totalMetres) : 1;
  const strength = (age + edge - sweep * (1 + edge)) / edge;
  return Math.min(1, Math.max(0, strength));
}
