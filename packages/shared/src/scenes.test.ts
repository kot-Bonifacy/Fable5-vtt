import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRID,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  SCENE_DIMENSION_MAX,
  SCENE_DIMENSION_MIN,
  normalizeGridOffset,
  sanitizeSceneName,
  sanitizeScenePatch,
} from './scenes.js';

describe('sanitizeSceneName', () => {
  it('trims and accepts a normal name', () => {
    expect(sanitizeSceneName('  Ulice Night City  ')).toBe('Ulice Night City');
  });

  it('rejects empty, non-string and overlong names', () => {
    expect(sanitizeSceneName('')).toBeNull();
    expect(sanitizeSceneName('   ')).toBeNull();
    expect(sanitizeSceneName(42)).toBeNull();
    expect(sanitizeSceneName('x'.repeat(65))).toBeNull();
  });
});

describe('sanitizeScenePatch', () => {
  it('rejects non-object patches', () => {
    expect(sanitizeScenePatch(null)).toBeNull();
    expect(sanitizeScenePatch('grid')).toBeNull();
  });

  it('rejects a patch with an invalid name', () => {
    expect(sanitizeScenePatch({ name: '   ' })).toBeNull();
  });

  it('clamps scene dimensions and rounds to integers', () => {
    expect(sanitizeScenePatch({ width: 10, height: 99999.7 })).toEqual({
      width: SCENE_DIMENSION_MIN,
      height: SCENE_DIMENSION_MAX,
    });
    expect(sanitizeScenePatch({ width: 4096.4 })).toEqual({ width: 4096 });
  });

  it('clamps grid size and alpha, validates color', () => {
    const patch = sanitizeScenePatch({
      grid: { sizePx: 5, alpha: 3, color: '#FFAA00' },
    });
    expect(patch).toEqual({
      grid: { sizePx: GRID_SIZE_MIN, alpha: 1, color: '#ffaa00' },
    });
    expect(sanitizeScenePatch({ grid: { sizePx: 99999 } })).toEqual({
      grid: { sizePx: GRID_SIZE_MAX },
    });
  });

  it('drops invalid grid fields but keeps valid ones', () => {
    expect(
      sanitizeScenePatch({ grid: { color: 'red', visible: true, offsetX: 12 } }),
    ).toEqual({ grid: { visible: true, offsetX: 12 } });
  });

  it('drops an all-invalid grid patch entirely', () => {
    expect(sanitizeScenePatch({ grid: { color: 'red' } })).toEqual({});
  });

  it('accepts gridMode only for known values', () => {
    expect(sanitizeScenePatch({ gridMode: 'gridless' })).toEqual({ gridMode: 'gridless' });
    expect(sanitizeScenePatch({ gridMode: 'hex' })).toEqual({});
  });

  it('accepts background object and null (clearing)', () => {
    expect(
      sanitizeScenePatch({ background: { url: '/uploads/maps/a.png', width: 4096, height: 4096 } }),
    ).toEqual({ background: { url: '/uploads/maps/a.png', width: 4096, height: 4096 } });
    expect(sanitizeScenePatch({ background: null })).toEqual({ background: null });
  });

  it('ignores NaN and non-numeric numbers', () => {
    expect(sanitizeScenePatch({ width: Number.NaN, metersPerSquare: '2' })).toEqual({});
  });

  it('clamps metersPerSquare', () => {
    expect(sanitizeScenePatch({ metersPerSquare: 0 })).toEqual({ metersPerSquare: 0.1 });
    expect(sanitizeScenePatch({ metersPerSquare: 2 })).toEqual({ metersPerSquare: 2 });
  });
});

describe('normalizeGridOffset', () => {
  it('wraps offsets into [0, sizePx)', () => {
    expect(normalizeGridOffset(0, 100)).toBe(0);
    expect(normalizeGridOffset(250, 100)).toBe(50);
    expect(normalizeGridOffset(-30, 100)).toBe(70);
    expect(normalizeGridOffset(100, 100)).toBe(0);
  });

  it('returns 0 for a degenerate grid size', () => {
    expect(normalizeGridOffset(55, 0)).toBe(0);
  });
});

describe('DEFAULT_GRID', () => {
  it('matches CP RED conventions (100 px squares, visible)', () => {
    expect(DEFAULT_GRID.sizePx).toBe(100);
    expect(DEFAULT_GRID.visible).toBe(true);
  });
});
