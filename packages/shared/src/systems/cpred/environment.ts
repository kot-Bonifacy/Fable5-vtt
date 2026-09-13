/**
 * What the ground a figure stands on does to its rolls (stage 16h) — pure
 * logic, no IO.
 *
 * The first tenant is smoke, and it is here rather than in `statuses.ts` for a
 * reason worth writing down: a status is carried by a figure and travels with
 * it, while a cloud is carried by the *map* and is left behind by anyone who
 * walks out of it. The two look identical on a chat card — a named entry in the
 * breakdown — and are opposite in every other respect, which is exactly the
 * kind of pair that fuses into one confused table if it shares a module.
 *
 * The core measures who is inside which cloud (`smoke.ts`); this module decides
 * what being inside one is worth. „Działania w dymie mają zwykle −4" (s. 347) —
 * and „zwykle" is why the number rides on the cloud rather than living here.
 */

import type { RollBreakdownEntry } from '../../dice.js';
import type { SmokeView } from '../../smoke.js';

/** The penalty the rulebook prints, and what a hand-placed cloud defaults to. */
export const CPRED_SMOKE_PENALTY = -4;

/**
 * Breakdown kind carried by „you cannot see the target properly" penalties.
 *
 * A kind of its own rather than `situational`, because from stage 31 something
 * reads it: „Celownik noktowizyjny … zmniejsza do zera modyfikatory ujemne za
 * strzelanie do celu ukrytego w ciemności, dymie, mgle itp." (s. 343). A night
 * sight has to be able to tell a cloud apart from being Held, and a label in
 * Polish is not something to branch on.
 */
export const CPRED_OBSCUREMENT_KIND = 'obscurement';

/** A physical screen is not smoke: optics never cancel this house-rule penalty. */
export function cpredBarrierModifiers(penalty: number): RollBreakdownEntry[] {
  return penalty < 0 && Number.isFinite(penalty)
    ? [{ label: 'Cel zasłonięty barierą', kind: 'situational', value: Math.round(penalty) }]
    : [];
}

/**
 * Named modifiers the clouds a figure stands in add to every Check they make.
 *
 * Clouds **stack**, deliberately: RAW gives no ceiling, and two grenades on one
 * square are two grenades. Each one keeps its own row, so a player looking at
 * „Dym −4 · Dym −4" can see why the roll was hopeless instead of being told.
 */
export function cpredSmokeModifiers(
  clouds: readonly Pick<SmokeView, 'name' | 'penalty'>[],
): RollBreakdownEntry[] {
  return clouds
    .filter((cloud) => Number.isFinite(cloud.penalty) && cloud.penalty !== 0)
    .map((cloud) => ({
      label: cloud.name,
      value: Math.round(cloud.penalty),
      kind: CPRED_OBSCUREMENT_KIND,
    }));
}
