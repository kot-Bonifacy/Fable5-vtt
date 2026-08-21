import { describe, expect, it } from 'vitest';
import {
  FACING_DOWN,
  FACING_LEFT,
  FACING_RIGHT,
  FACING_UP,
  conditionRegistry,
  facingFromDelta,
  facingFromPath,
  normalizeFacing,
  sanitizeFacing,
  tokenCondition,
  type StatusDefinition,
  type TokenCondition,
} from './index.js';

describe('facing (stage 27j)', () => {
  it('reads scene coordinates the way the screen does — up is negative Y', () => {
    expect(facingFromDelta(0, -100)).toBe(FACING_UP);
    expect(facingFromDelta(100, 0)).toBe(FACING_RIGHT);
    expect(facingFromDelta(0, 100)).toBe(FACING_DOWN);
    expect(facingFromDelta(-100, 0)).toBe(FACING_LEFT);
  });

  it('turns a diagonal into the corner between two compass points', () => {
    expect(facingFromDelta(100, -100)).toBe(45);
    expect(facingFromDelta(-100, 100)).toBe(225);
  });

  it('ignores a shake of the hand', () => {
    expect(facingFromDelta(1, 0)).toBeNull();
    expect(facingFromDelta(0, 0)).toBeNull();
    expect(facingFromDelta(Number.NaN, 4)).toBeNull();
  });

  it('folds any angle into a whole degree of [0, 360)', () => {
    expect(normalizeFacing(-90)).toBe(270);
    expect(normalizeFacing(450)).toBe(90);
    expect(normalizeFacing(359.6)).toBe(0);
    expect(normalizeFacing(Number.POSITIVE_INFINITY)).toBe(FACING_UP);
  });

  /**
   * The tail of a walked route is usually a snap onto a square centre — a few
   * pixels long, and often sideways. A figure that faced *that* would finish
   * every march looking somewhere absurd.
   */
  it('takes the direction of the last leg that is actually a leg', () => {
    const route = [
      { x: 0, y: 400 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    expect(facingFromPath(route)).toBe(FACING_UP);
  });

  it('has no opinion about a route that went nowhere', () => {
    expect(facingFromPath([{ x: 100, y: 100 }])).toBeNull();
    expect(facingFromPath([])).toBeNull();
  });

  it('accepts a turn off the wire, refuses a broken one, and forgets on null', () => {
    expect(sanitizeFacing(91.4)).toBe(91);
    expect(sanitizeFacing(-1)).toBe(359);
    expect(sanitizeFacing(null)).toBeNull();
    expect(sanitizeFacing('north')).toBeUndefined();
    expect(sanitizeFacing(Number.NaN)).toBeUndefined();
  });
});

describe('token condition (stage 27j)', () => {
  const REGISTRY: StatusDefinition[] = [
    { id: 'stunned', name: 'Ogłuszony', icon: '/a.svg' },
    { id: 'seriously-wounded', name: 'Poważnie ranny', icon: '/b.svg', condition: 'wounded' },
    { id: 'mortally-wounded', name: 'Śmiertelnie ranny', icon: '/c.svg', condition: 'down' },
    { id: 'unconscious', name: 'Nieprzytomny', icon: '/d.svg', condition: 'down' },
    { id: 'dead', name: 'Martwy', icon: '/e.svg', condition: 'dead' },
  ];
  const conditions = conditionRegistry(REGISTRY);

  const figure = (statuses: string[], hp?: { current: number; max: number } | null) => ({
    statuses,
    ...(hp === undefined ? {} : { hp }),
  });

  it('leaves a healthy figure alone', () => {
    expect(tokenCondition(figure(['stunned'], { current: 40, max: 40 }), conditions)).toBe('ok');
  });

  it('takes the worst of what the stickers say', () => {
    const state: TokenCondition = tokenCondition(
      figure(['seriously-wounded', 'dead', 'stunned']),
      conditions,
    );
    expect(state).toBe('dead');
  });

  /**
   * The whole reason this is derived from statuses and not from hit points: a
   * player is never sent an enemy's HP, and still has to be able to see it drop.
   */
  it('answers for a viewer who was never sent the hit points', () => {
    expect(tokenCondition(figure(['unconscious']), conditions)).toBe('down');
  });

  it('falls back on hit points for a figure nobody statted', () => {
    expect(tokenCondition(figure([], { current: 9, max: 40 }), conditions)).toBe('wounded');
    expect(tokenCondition(figure([], { current: 0, max: 40 }), conditions)).toBe('down');
    expect(tokenCondition(figure([], { current: 40, max: 40 }), conditions)).toBe('ok');
  });

  it('treats a token with no hit points at all as standing', () => {
    expect(tokenCondition(figure([], null), conditions)).toBe('ok');
    expect(tokenCondition(figure([]), conditions)).toBe('ok');
  });

  it('ignores statuses the data gave no condition', () => {
    expect(conditionRegistry(REGISTRY).has('stunned')).toBe(false);
  });
});
