import { describe, expect, it } from 'vitest';
import {
  CUP_SIZE_PX,
  clampCupPosition,
  cupLabelOnLeft,
  cupPlacedStyle,
  defaultCupPosition,
  parseCupPosition,
} from './cup-placement.js';

const viewport = { width: 1000, height: 800 };

describe('clampCupPosition', () => {
  it('leaves a position that fits on the screen', () => {
    expect(clampCupPosition({ x: 300, y: 200 }, viewport)).toEqual({ x: 300, y: 200 });
  });

  it('brings a cup saved on a bigger monitor back on the screen', () => {
    expect(clampCupPosition({ x: 5000, y: 5000 }, viewport)).toEqual({
      x: 1000 - CUP_SIZE_PX - 4,
      y: 800 - CUP_SIZE_PX - 4,
    });
  });

  it('keeps the cup off the top and left edges', () => {
    expect(clampCupPosition({ x: -40, y: -40 }, viewport)).toEqual({ x: 4, y: 4 });
  });

  it('survives a window smaller than the cup', () => {
    expect(clampCupPosition({ x: 90, y: 90 }, { width: 20, height: 20 })).toEqual({ x: 4, y: 4 });
  });
});

describe('defaultCupPosition', () => {
  it('matches the bottom-left corner set by the stylesheet', () => {
    expect(defaultCupPosition(viewport)).toEqual({ x: 16, y: 800 - 16 - CUP_SIZE_PX });
  });
});

describe('cupLabelOnLeft and cupPlacedStyle', () => {
  it('keeps the label on the right in the left half of the screen', () => {
    const point = { x: 100, y: 200 };
    expect(cupLabelOnLeft(point, viewport)).toBe(false);
    expect(cupPlacedStyle(point, viewport)).toEqual({ left: 100, top: 200, bottom: 'auto' });
  });

  it('anchors the icon by its right edge when the label grows left', () => {
    const point = { x: 800, y: 200 };
    expect(cupLabelOnLeft(point, viewport)).toBe(true);
    expect(cupPlacedStyle(point, viewport)).toEqual({
      left: 'auto',
      right: 1000 - 800 - CUP_SIZE_PX,
      top: 200,
      bottom: 'auto',
    });
  });
});

describe('parseCupPosition', () => {
  it('reads a stored point', () => {
    expect(parseCupPosition('{"x":12,"y":34}')).toEqual({ x: 12, y: 34 });
  });

  it.each([null, '', 'nie json', '[]', '{"x":1}', '{"x":"1","y":2}', '{"x":1e999,"y":2}'])(
    'treats %s as no position',
    (raw) => {
      expect(parseCupPosition(raw)).toBeNull();
    },
  );
});
