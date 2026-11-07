import type { SceneVisibility, ScenePoint, WalkStep } from '@vtt/shared';
import { isPointInPolygon } from '@vtt/shared';

/**
 * Which floor a player's route planner may step on (stages 16e, 18a; 13.09.2026).
 *
 * - `sight` — the field of view their own tokens describe. Dynamic vision only,
 *   and only once the first field of view has arrived.
 * - `revealed` — the revealed floor of a painted fog (GM decision of
 *   13.09.2026), plus the cells the figure stands on. The server refuses a step
 *   into the black on the drop as well.
 * - `open` — every point; what stands in the way arrives as bare segments
 *   (`blocker:sync`).
 *
 * The mode has to be asked, not the vision alone: since stage 42c a fogged or
 * open map receives a `vision:sync` too — polygons empty, carrying only the
 * figure mask — and „walk only where you can see" over an empty polygon list
 * refused every step on the map until the page was reloaded (regression found
 * 13.09.2026).
 */
export type WalkFloor = 'sight' | 'revealed' | 'open';

export function walkFloorFor(visibility: SceneVisibility, hasVision: boolean): WalkFloor {
  if (visibility === 'fog') return 'revealed';
  return visibility === 'dynamic' && hasVision ? 'sight' : 'open';
}

/**
 * „Krok mieści się w jednym oku” — krawędziowa połowa chodzenia po widoku
 * (66e, pkt 16, 07.11.2026).
 *
 * Planer gracza nie zna ścian: wierzy, że brzeg wielokąta widoku **jest**
 * ścianą (etap 16e). To prawda dla jednego wielokąta, ale nie dla sumy kilku —
 * przejęta kamera albo wspólny widok drużyny widzi korytarz za ścianą biura,
 * więc pole w biurze (oko Iskry) i pole za ścianą (oko kamery) są „widoczne”
 * oba, a krok między nimi przechodzi przez mur. Planer rysował taką trasę,
 * serwer odmawiał („Coś stoi na drodze”) i figura nie wychodziła z biura.
 *
 * Krok (i wyprostowany odcinek) przechodzi więc tylko wtedy, gdy wszystkie
 * jego próbki — co `spacing` pikseli, z oboma końcami — leżą w **tym samym**
 * wielokącie. Przejście z oka do oka zostaje, ale tam, gdzie oba widoki
 * nachodzą na siebie, czyli po podłodze, a nie przez ścianę.
 *
 * Przy jednym wielokącie nic nie dokłada (`undefined`) — tam brzeg i tak jest
 * ścianą, a test kosztowałby każdy krok A*.
 */
export function sightStepTest(
  polygons: readonly (readonly ScenePoint[])[],
  spacing: number,
): WalkStep | undefined {
  if (polygons.length < 2) return undefined;
  const step = spacing > 0 ? spacing : 1;
  const cache = new Map<string, readonly number[]>();
  const eyesOf = (point: ScenePoint): readonly number[] => {
    const key = `${point.x},${point.y}`;
    const known = cache.get(key);
    if (known) return known;
    const eyes: number[] = [];
    polygons.forEach((polygon, index) => {
      if (isPointInPolygon(point, polygon)) eyes.push(index);
    });
    // Zamknięcie żyje do następnej zmiany widoku; sufit chroni przed planem,
    // który przeczesze całą wielką mapę.
    if (cache.size > 50_000) cache.clear();
    cache.set(key, eyes);
    return eyes;
  };
  return (from, to) => {
    let common = eyesOf(from);
    if (common.length === 0) return false;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const samples = Math.max(2, Math.ceil(distance / step));
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const eyes = eyesOf({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      common = common.filter((index) => eyes.includes(index));
      if (common.length === 0) return false;
    }
    return true;
  };
}
