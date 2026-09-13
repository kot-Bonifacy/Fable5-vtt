import { describe, expect, it } from 'vitest';
import {
  barrierConcealPenaltyAlong,
  figureBarriers,
  sanitizeConcealPenalty,
  type WallView,
} from './walls.js';
import { cpredBarrierModifiers } from './systems/cpred/environment.js';

const wall: WallView = {
  id: 1,
  sceneId: 's',
  kind: 'barrier',
  open: false,
  locked: false,
  playerToggle: false,
  armor: 0,
  hidesFigures: true,
  concealPenalty: -4,
  x1: 50,
  y1: 0,
  x2: 50,
  y2: 100,
};

describe('figure barriers', () => {
  it('only standing barriers hide, without a curtain-distance exception', () => {
    expect(
      figureBarriers([
        wall,
        { ...wall, kind: 'gate', open: true },
        { ...wall, kind: 'wall' },
        { ...wall, hidesFigures: false },
      ]),
    ).toEqual([wall]);
    expect(barrierConcealPenaltyAlong([wall], { x: 49, y: 50 }, { x: 51, y: 50 })).toBe(-4);
  });
  it('takes the worst penalty, not the sum, including at a chain joint', () => {
    expect(
      barrierConcealPenaltyAlong(
        [wall, { ...wall, x1: 70, x2: 70, concealPenalty: -6 }],
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ),
    ).toBe(-6);
    expect(barrierConcealPenaltyAlong([wall, wall], { x: 0, y: 50 }, { x: 100, y: 50 })).toBe(-4);
  });
  it('a clear line and a zero-penalty screen add no modifier', () => {
    expect(barrierConcealPenaltyAlong([wall], { x: 0, y: 150 }, { x: 100, y: 150 })).toBe(0);
    expect(cpredBarrierModifiers(0)).toEqual([]);
    expect(cpredBarrierModifiers(-6)).toEqual([
      { label: 'Cel zasłonięty barierą', value: -6, kind: 'situational' },
    ]);
  });
  it.each([1, -100, 0.5, NaN, Infinity, '-4', null])('refuses an invalid penalty %s', (value) => {
    expect(sanitizeConcealPenalty(value)).toBeNull();
  });
});
