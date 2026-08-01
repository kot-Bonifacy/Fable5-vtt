import { describe, expect, it } from 'vitest';
import {
  blastAreaAt,
  coneAreaTowards,
  describeScatter,
  isInBlast,
  isInCone,
  rollBlastScatter,
  scatteredCentre,
  scatterMaxMetres,
  scatterMinMetres,
  snapToSquareCentre,
  type AreaScene,
} from './areas.js';

/** 50 px per square, 2 m per square — so 25 px per metre. */
const SCENE: AreaScene = {
  grid: { sizePx: 50, offsetX: 0, offsetY: 0, color: '#fff', alpha: 1, visible: true },
  metersPerSquare: 2,
};

/** The same map drawn with an offset grid — snapping must follow the offset. */
const OFFSET_SCENE: AreaScene = { ...SCENE, grid: { ...SCENE.grid, offsetX: 10, offsetY: 30 } };

describe('snapping to the grid square', () => {
  it('puts the centre in the middle of the square the point falls in', () => {
    expect(snapToSquareCentre({ x: 10, y: 10 }, SCENE)).toEqual({ x: 25, y: 25 });
    expect(snapToSquareCentre({ x: 49, y: 51 }, SCENE)).toEqual({ x: 25, y: 75 });
  });

  it('follows a grid that does not start at zero', () => {
    expect(snapToSquareCentre({ x: 12, y: 32 }, OFFSET_SCENE)).toEqual({ x: 35, y: 55 });
  });

  it('handles negative coordinates without falling into the wrong square', () => {
    expect(snapToSquareCentre({ x: -1, y: -1 }, SCENE)).toEqual({ x: -25, y: -25 });
  });
});

describe('blast square', () => {
  it('is 10 m across on a 2 m grid — five squares', () => {
    const area = blastAreaAt({ x: 30, y: 30 }, SCENE);
    expect(area.sideM).toBe(10);
    // 10 m at 25 px per metre.
    expect(area.sidePx).toBe(250);
    expect(area.centre).toEqual({ x: 25, y: 25 });
  });

  it('includes a token exactly on the edge', () => {
    const area = blastAreaAt({ x: 25, y: 25 }, SCENE);
    // The square spans ±125 px around its centre.
    expect(isInBlast(area, { x: 150, y: 25 })).toBe(true);
    expect(isInBlast(area, { x: 25, y: 150 })).toBe(true);
    expect(isInBlast(area, { x: 150, y: 150 })).toBe(true);
  });

  it('excludes a token one pixel outside it', () => {
    const area = blastAreaAt({ x: 25, y: 25 }, SCENE);
    expect(isInBlast(area, { x: 151, y: 25 })).toBe(false);
    expect(isInBlast(area, { x: 25, y: -101 })).toBe(false);
  });

  it('is a square, not a circle — the corner is inside', () => {
    const area = blastAreaAt({ x: 25, y: 25 }, SCENE);
    // 5 m out on both axes is 7,07 m away, and still in the box.
    expect(isInBlast(area, { x: 149, y: 149 })).toBe(true);
  });
});

describe('cone', () => {
  const cone = coneAreaTowards({ x: 0, y: 0 }, { x: 100, y: 0 }, SCENE);

  it('reaches 6 m and no further', () => {
    // 6 m at 25 px per metre = 150 px.
    expect(isInCone(cone, { x: 150, y: 0 })).toBe(true);
    expect(isInCone(cone, { x: 151, y: 0 })).toBe(false);
  });

  it('opens 45° either side of the axis', () => {
    expect(isInCone(cone, { x: 100, y: 99 })).toBe(true);
    expect(isInCone(cone, { x: 100, y: 101 })).toBe(false);
    expect(isInCone(cone, { x: 100, y: -99 })).toBe(true);
  });

  it('does not reach behind the shooter', () => {
    expect(isInCone(cone, { x: -50, y: 0 })).toBe(false);
  });

  it('counts the shooter own square as inside', () => {
    expect(isInCone(cone, { x: 0, y: 0 })).toBe(true);
  });

  it('works across the ±180° seam', () => {
    const westward = coneAreaTowards({ x: 0, y: 0 }, { x: -100, y: 0 }, SCENE);
    expect(isInCone(westward, { x: -100, y: 10 })).toBe(true);
    expect(isInCone(westward, { x: -100, y: -10 })).toBe(true);
    expect(isInCone(westward, { x: 100, y: 0 })).toBe(false);
  });
});

describe('scatter (house rule)', () => {
  /** A die that hands out a fixed sequence, so the rule can be read off. */
  function scriptedRng(values: number[]) {
    let index = 0;
    return () => values[index++ % values.length]!;
  }

  it('turns the direction die into a clock face of ten', () => {
    const first = rollBlastScatter(scriptedRng([1, 10]), 0, 'ZW', SCENE);
    expect(first.angleDeg).toBe(0);
    const seventh = rollBlastScatter(scriptedRng([7, 10]), 0, 'ZW', SCENE);
    expect(seventh.angleDeg).toBe(216);
  });

  it('subtracts the throwing stat from the distance die', () => {
    const scatter = rollBlastScatter(scriptedRng([3, 7]), 4, 'ZW', SCENE);
    expect(scatter.metres).toBe(3);
  });

  it('never lands closer than one square', () => {
    const steady = rollBlastScatter(scriptedRng([3, 2]), 8, 'ZW', SCENE);
    expect(steady.metres).toBe(scatterMinMetres(SCENE));
    expect(steady.metres).toBe(2);
  });

  it('never leaves the rulebook box — two squares is the cap', () => {
    const shaky = rollBlastScatter(scriptedRng([3, 10]), 2, 'ZW', SCENE);
    expect(shaky.metres).toBe(scatterMaxMetres(SCENE));
    expect(shaky.metres).toBe(4);
  });

  it('lands the charge on a square, not between two', () => {
    const scatter = rollBlastScatter(scriptedRng([1, 10]), 2, 'ZW', SCENE);
    const centre = scatteredCentre({ x: 25, y: 25 }, scatter, SCENE);
    // 4 m due east of the middle of a square is the middle of another one.
    expect(centre).toEqual({ x: 125, y: 25 });
  });

  it('explains itself on the card', () => {
    const scatter = rollBlastScatter(scriptedRng([7, 6]), 4, 'ZW', SCENE);
    expect(describeScatter(scatter)).toBe('kierunek 1k10 = 7 (216°) · odległość 1k10 = 6 − ZW 4');
  });
});
