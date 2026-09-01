import { describe, expect, it } from 'vitest';
import { isInSmoke, smokeAt, smokeSidePx, type SmokeScene, type SmokeView } from './smoke.js';
import { CPRED_OBSCUREMENT_KIND, cpredSmokeModifiers } from './systems/cpred/environment.js';

/**
 * Smoke on the map (stage 16h) — a square that penalises rather than hides.
 *
 * Two things are worth pinning down: who counts as standing in the cloud (the
 * boundary decides a roll, so it must not be decided by floating point noise),
 * and that two clouds stay two rows in the breakdown rather than being folded
 * into one silent number.
 */

/** 50 px squares, 2 m each — the project's default scale. */
const scene: SmokeScene = {
  grid: { sizePx: 50, offsetX: 0, offsetY: 0, color: '#fff', alpha: 1, visible: true },
  metersPerSquare: 2,
};

function cloud(overrides: Partial<SmokeView> = {}): SmokeView {
  return {
    id: 1,
    sceneId: 'scene-1',
    name: 'Dym',
    x: 500,
    y: 500,
    sideM: 10,
    penalty: -4,
    ...overrides,
  };
}

describe('smoke geometry', () => {
  it('measures the square in scene pixels from its metres', () => {
    // 10 m at 2 m per 50 px square = five squares = 250 px.
    expect(smokeSidePx(cloud(), scene)).toBeCloseTo(250);
  });

  it('holds everybody inside the square', () => {
    expect(isInSmoke(cloud(), { x: 500, y: 500 }, scene)).toBe(true);
    expect(isInSmoke(cloud(), { x: 600, y: 600 }, scene)).toBe(true);
  });

  it('counts the boundary as inside — a rounding error must not decide a roll', () => {
    expect(isInSmoke(cloud(), { x: 625, y: 500 }, scene)).toBe(true);
    expect(isInSmoke(cloud(), { x: 626, y: 500 }, scene)).toBe(false);
  });

  it('lets nobody stand in a cloud on a scene with no usable grid', () => {
    const broken: SmokeScene = { ...scene, grid: { ...scene.grid, sizePx: 0 } };
    expect(isInSmoke(cloud(), { x: 500, y: 500 }, broken)).toBe(false);
  });

  it('returns every cloud a point is in, not just the first', () => {
    const clouds = [cloud(), cloud({ id: 2, x: 560 })];
    expect(smokeAt(clouds, { x: 520, y: 500 }, scene).map((c) => c.id)).toEqual([1, 2]);
    expect(smokeAt(clouds, { x: 100, y: 100 }, scene)).toEqual([]);
  });
});

describe('what standing in smoke costs', () => {
  it('gives each cloud its own named row', () => {
    const rows = cpredSmokeModifiers([cloud(), cloud({ id: 2, name: 'Dym' })]);
    expect(rows).toHaveLength(2);
    // Stage 31: the kind is `obscurement` so a night sight can find the row.
    expect(rows[0]).toEqual({ label: 'Dym', value: -4, kind: CPRED_OBSCUREMENT_KIND });
  });

  it('drops a cloud that costs nothing rather than printing a zero', () => {
    expect(cpredSmokeModifiers([cloud({ penalty: 0 })])).toEqual([]);
  });
});
