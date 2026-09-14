import { describe, expect, it } from 'vitest';
import { walkFloorFor } from './map/walk-sight.js';

describe('walkFloorFor', () => {
  it('confines a route to sight under dynamic vision once it has arrived', () => {
    expect(walkFloorFor('dynamic', true)).toBe('sight');
  });

  it('leaves the floor open under dynamic vision until the first field of view', () => {
    expect(walkFloorFor('dynamic', false)).toBe('open');
  });

  it('keeps a route on revealed floor under painted fog, vision push or not (13.09.2026)', () => {
    expect(walkFloorFor('fog', true)).toBe('revealed');
    expect(walkFloorFor('fog', false)).toBe('revealed');
  });

  it('never confines a route on an open map, even after a vision push (42c)', () => {
    expect(walkFloorFor('open', true)).toBe('open');
    expect(walkFloorFor('open', false)).toBe('open');
  });
});
