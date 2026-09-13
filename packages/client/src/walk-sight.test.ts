import { describe, expect, it } from 'vitest';
import { confinesWalkToSight } from './map/walk-sight.js';

describe('confinesWalkToSight', () => {
  it('confines a route to sight under dynamic vision once it has arrived', () => {
    expect(confinesWalkToSight('dynamic', true)).toBe(true);
  });

  it('leaves the floor open under dynamic vision until the first field of view', () => {
    expect(confinesWalkToSight('dynamic', false)).toBe(false);
  });

  it('never confines a route on a fogged or open map, even after a vision push (42c)', () => {
    for (const visibility of ['fog', 'open'] as const) {
      expect(confinesWalkToSight(visibility, true)).toBe(false);
      expect(confinesWalkToSight(visibility, false)).toBe(false);
    }
  });
});
