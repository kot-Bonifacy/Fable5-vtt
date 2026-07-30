import { create } from 'zustand';
import type { LightGlow, LightMask, LightView, StateSyncPayload } from '@vtt/shared';

/**
 * Light of the viewed scene (stage 18b).
 *
 * Split from `wallStore` along the same seam the server splits on — „what blocks
 * sight" versus „what lights it" — and holding, again, two things that look alike
 * but belong to different people:
 *
 *  - **`lights`** is GM data. A player's socket never receives a lamp row (a
 *    light's shape is the shape of the room it stands in), so for a player this
 *    list is always empty and the light markers draw nothing.
 *  - **`mask`** is what a player gets *instead*: the light levels of the ground
 *    they can already see, computed on the server and clipped to their own field
 *    of view. Null means the scene is not dark, so nothing is gated on light.
 *
 * `glows` is the coloured tint layer — the lamps this viewer can actually see.
 * It carries no geometry beyond a circle each.
 */
interface LightStoreState {
  /** GM only; ascending by id. */
  lights: LightView[];
  /** Light levels inside this viewer's field of view; null on a lit scene. */
  mask: LightMask | null;
  glows: LightGlow[];

  applySync: (payload: StateSyncPayload) => void;
  setLights: (sceneId: string, lights: LightView[]) => void;
  setVisionLight: (mask: LightMask | null, glows: LightGlow[]) => void;
}

export const useLightStore = create<LightStoreState>((set) => ({
  lights: [],
  mask: null,
  glows: [],

  applySync: (payload) =>
    set({
      lights: payload.lights,
      mask: payload.vision?.light ?? null,
      glows: payload.vision?.glows ?? [],
    }),

  setLights: (_sceneId, lights) => set({ lights }),
  setVisionLight: (mask, glows) => set({ mask, glows }),
}));

/** The light a click lands on: nearest centre within `tolerance`, else null. */
export function pickLightAt(
  lights: readonly LightView[],
  point: { x: number; y: number },
  tolerance: number,
): LightView | null {
  let best: LightView | null = null;
  let bestDistance = tolerance;
  for (const light of lights) {
    const distance = Math.hypot(point.x - light.x, point.y - light.y);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = light;
    }
  }
  return best;
}
