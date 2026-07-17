import { describe, expect, it } from 'vitest';
import {
  clampTokenPosition,
  sanitizeTokenHp,
  sanitizeTokenImageUrl,
  sanitizeTokenPatch,
  snapTokenPosition,
  type TokenSnapScene,
} from './tokens.js';

const gridScene: TokenSnapScene = {
  width: 1000,
  height: 800,
  gridMode: 'grid',
  grid: { sizePx: 100, offsetX: 0, offsetY: 0 },
};

describe('snapTokenPosition', () => {
  it('snaps to the nearest cell corner', () => {
    expect(snapTokenPosition(130, 270, 1, gridScene)).toEqual({ x: 100, y: 300 });
    expect(snapTokenPosition(149, 249, 1, gridScene)).toEqual({ x: 100, y: 200 });
  });

  it('respects the grid offset', () => {
    const scene = { ...gridScene, grid: { sizePx: 100, offsetX: 30, offsetY: 50 } };
    expect(snapTokenPosition(120, 160, 1, scene)).toEqual({ x: 130, y: 150 });
  });

  it('keeps large tokens fully inside the scene', () => {
    // 2×2 token = 200 px: the last valid column starts at 800.
    expect(snapTokenPosition(950, 790, 2, gridScene)).toEqual({ x: 800, y: 600 });
    expect(snapTokenPosition(-500, -500, 2, gridScene)).toEqual({ x: 0, y: 0 });
  });

  it('normalizes denormalized offsets the same way as the grid renderer', () => {
    const scene = { ...gridScene, grid: { sizePx: 100, offsetX: -70, offsetY: 230 } };
    expect(snapTokenPosition(120, 120, 1, scene)).toEqual({ x: 130, y: 130 });
  });

  it('only clamps in gridless mode', () => {
    const scene: TokenSnapScene = { ...gridScene, gridMode: 'gridless' };
    expect(snapTokenPosition(123.4, 56.7, 1, scene)).toEqual({ x: 123.4, y: 56.7 });
    expect(snapTokenPosition(5000, -20, 1, scene)).toEqual({ x: 900, y: 0 });
  });

  it('clamps without snapping for intermediate positions', () => {
    expect(clampTokenPosition(123, -5, 1, gridScene)).toEqual({ x: 123, y: 0 });
  });
});

describe('sanitizeTokenImageUrl', () => {
  it('accepts local uploads/public paths and null', () => {
    expect(sanitizeTokenImageUrl('/uploads/tokens/abc.png')).toBe('/uploads/tokens/abc.png');
    expect(sanitizeTokenImageUrl('/public/tokens/solo.svg')).toBe('/public/tokens/solo.svg');
    expect(sanitizeTokenImageUrl(null)).toBeNull();
  });

  it('rejects external URLs and traversal', () => {
    expect(sanitizeTokenImageUrl('https://evil.example/x.png')).toBeUndefined();
    expect(sanitizeTokenImageUrl('/uploads/../secret.db')).toBeUndefined();
    expect(sanitizeTokenImageUrl('/etc/passwd')).toBeUndefined();
  });
});

describe('sanitizeTokenHp', () => {
  it('normalizes and clamps the pair', () => {
    expect(sanitizeTokenHp({ current: 55.4, max: 40 })).toEqual({ current: 40, max: 40 });
    expect(sanitizeTokenHp({ current: -3, max: 25 })).toEqual({ current: 0, max: 25 });
  });

  it('passes null through and rejects garbage', () => {
    expect(sanitizeTokenHp(null)).toBeNull();
    expect(sanitizeTokenHp({ current: 'x', max: 10 })).toBeUndefined();
    expect(sanitizeTokenHp(7)).toBeUndefined();
  });
});

describe('sanitizeTokenPatch', () => {
  it('accepts a full valid patch', () => {
    const patch = sanitizeTokenPatch(
      {
        name: '  Morgan ',
        imageUrl: null,
        size: 2.4,
        ownerId: 'user-1',
        hidden: true,
        hp: { current: 10, max: 30 },
        statuses: ['stunned', 'stunned', 'on-fire'],
      },
      new Set(['stunned', 'on-fire']),
    );
    expect(patch).toEqual({
      name: 'Morgan',
      imageUrl: null,
      size: 2,
      ownerId: 'user-1',
      hidden: true,
      hp: { current: 10, max: 30 },
      statuses: ['stunned', 'on-fire'],
    });
  });

  it('drops unknown status ids instead of failing', () => {
    const patch = sanitizeTokenPatch({ statuses: ['stunned', 'made-up'] }, new Set(['stunned']));
    expect(patch).toEqual({ statuses: ['stunned'] });
  });

  it('rejects invalid fields', () => {
    expect(sanitizeTokenPatch({ name: '' })).toBeNull();
    expect(sanitizeTokenPatch({ hidden: 'yes' })).toBeNull();
    expect(sanitizeTokenPatch({ statuses: 'stunned' })).toBeNull();
    expect(sanitizeTokenPatch({ imageUrl: 'http://x/y.png' })).toBeNull();
    expect(sanitizeTokenPatch('nope')).toBeNull();
  });
});
