import { describe, expect, it } from 'vitest';
import { CHASE_SEAM_SQUARES, chaseRoadSpanPx } from './chase.js';
import {
  CHASE_ROADS,
  chaseFreeSpot,
  chaseRoadByUrl,
  chaseRoadCells,
  chaseRoadPatch,
  chaseRoadWithEdge,
} from './chase-roads.js';
import { sanitizeScenePatch } from './scenes.js';

const scene = { width: 3500, height: 1800, gridSizePx: 100, gridOffsetX: 0, gridOffsetY: 0 };

describe('wbudowane drogi', () => {
  it('każda droga ma okres 32 kratek i zapas na szew bieżni', () => {
    for (const preset of CHASE_ROADS) {
      expect(preset.width / preset.gridSizePx - CHASE_SEAM_SQUARES).toBe(32);
      expect(preset.road.from).toBeGreaterThanOrEqual(0);
      expect(preset.road.to).toBeLessThanOrEqual(preset.height / preset.gridSizePx);
      expect(preset.road.to - preset.road.from).toBeGreaterThanOrEqual(8);
    }
  });

  it('rozpoznaje drogę po adresie tła, a obce adresy nie', () => {
    expect(chaseRoadByUrl('/art/roads/viaduct.webp')?.id).toBe('viaduct');
    expect(chaseRoadByUrl('/art/roads/../uploads/x.webp')).toBeNull();
    expect(chaseRoadByUrl('/uploads/c1/maps/a.webp')).toBeNull();
    expect(chaseRoadByUrl(null)).toBeNull();
  });

  it('łata drogi przechodzi przez sanitizeScenePatch bez strat', () => {
    const patch = chaseRoadPatch(CHASE_ROADS[0]!);
    expect(sanitizeScenePatch(patch)).toEqual(patch);
    expect(patch.chase).toEqual({ direction: 'right', road: { from: 2, to: 16 } });
    expect(patch.metersPerSquare).toBe(1);
  });
});

describe('chaseRoadWithEdge', () => {
  const grid = { sizePx: 100, offset: 0 };

  it('przyciąga krawędź do linii siatki', () => {
    expect(chaseRoadWithEdge({ from: 2, to: 16 }, 'from', 349, grid, 18)).toEqual({
      from: 3,
      to: 16,
    });
    expect(chaseRoadWithEdge({ from: 2, to: 16 }, 'to', 1420, grid, 18)).toEqual({
      from: 2,
      to: 14,
    });
  });

  it('nie wypuszcza krawędzi za scenę', () => {
    expect(chaseRoadWithEdge({ from: 2, to: 16 }, 'from', -500, grid, 18).from).toBe(0);
    expect(chaseRoadWithEdge({ from: 2, to: 16 }, 'to', 9000, grid, 18).to).toBe(18);
  });

  it('krawędzie się nie mijają i zostaje kratka jezdni', () => {
    expect(chaseRoadWithEdge({ from: 2, to: 6 }, 'from', 1500, grid, 18)).toEqual({
      from: 5,
      to: 6,
    });
    expect(chaseRoadWithEdge({ from: 5, to: 9 }, 'to', 0, grid, 18)).toEqual({ from: 5, to: 6 });
  });

  it('liczy z przesunięciem siatki', () => {
    expect(
      chaseRoadWithEdge({ from: 2, to: 16 }, 'from', 330, { sizePx: 100, offset: 30 }, 17).from,
    ).toBe(3);
  });
});

describe('chaseRoadCells', () => {
  it('w poprzek jazdy poziomej to wiersze, pionowej — kolumny', () => {
    expect(chaseRoadCells('right', scene)).toBe(18);
    expect(chaseRoadCells('up', scene)).toBe(35);
    expect(chaseRoadCells('right', { ...scene, gridOffsetY: 50 })).toBe(17);
  });
});

describe('chaseFreeSpot', () => {
  const car = { widthSq: 3, lengthSq: 5 };
  const settings = { direction: 'right' as const, road: { from: 2, to: 16 } };

  it('pierwsze auto staje na środku jezdni', () => {
    expect(chaseFreeSpot(car, [], settings, scene)).toEqual({ x: 1750, y: 900 });
  });

  it('kolejne auta nie nachodzą na stojące i zostają w pasie jezdni', () => {
    const parked: { x: number; y: number; widthSq: number; lengthSq: number }[] = [];
    const span = chaseRoadSpanPx(settings, scene);
    for (let i = 0; i < 8; i += 1) {
      const spot = chaseFreeSpot(car, parked, settings, scene);
      for (const other of parked) {
        const apart = Math.abs(spot.x - other.x) >= 500 || Math.abs(spot.y - other.y) >= 300;
        expect(apart).toBe(true);
      }
      expect(spot.y - 150).toBeGreaterThanOrEqual(span.from);
      expect(spot.y + 150).toBeLessThanOrEqual(span.to);
      expect(spot.x - 250).toBeGreaterThanOrEqual(0);
      expect(spot.x + 250).toBeLessThanOrEqual(scene.width);
      parked.push({ ...spot, ...car });
    }
  });

  it('drugie auto staje obok pierwszego, na sąsiednim pasie', () => {
    const first = chaseFreeSpot(car, [], settings, scene);
    const second = chaseFreeSpot(car, [{ ...first, ...car }], settings, scene);
    expect(second.x).toBe(first.x);
    expect(Math.abs(second.y - first.y)).toBe(400);
  });

  it('jazda w górę układa auta w kolumnach', () => {
    const up = { direction: 'up' as const, road: null };
    const tall = { ...scene, width: 1800, height: 3500 };
    const first = chaseFreeSpot(car, [], up, tall);
    expect(first).toEqual({ x: 900, y: 1750 });
    const second = chaseFreeSpot(car, [{ ...first, ...car }], up, tall);
    expect(second.y).toBe(1750);
  });

  it('pełna droga oddaje środek sceny', () => {
    const narrow = { direction: 'right' as const, road: { from: 0, to: 3 } };
    const small = { ...scene, width: 600, height: 300 };
    const first = chaseFreeSpot(car, [], narrow, small);
    expect(chaseFreeSpot(car, [{ ...first, ...car }], narrow, small)).toEqual({ x: 300, y: 150 });
  });
});
