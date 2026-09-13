import { snapTokenPosition, type TokenSnapScene } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { marchStopPoint } from './map/march-landing.js';

const scene: TokenSnapScene = {
  width: 2500,
  height: 2500,
  gridMode: 'grid',
  grid: { sizePx: 100, offsetX: 0, offsetY: 0 },
};

/** Where the figure ends up: the stop point, then the same snap the server applies. */
function landing(
  position: { x: number; y: number },
  next: { x: number; y: number } | undefined,
  mode: 'nearest' | 'ahead',
) {
  const point = marchStopPoint(position, next, scene.grid.sizePx, mode);
  return snapTokenPosition(point.x, point.y, 1, scene);
}

describe('marchStopPoint', () => {
  // A diagonal step past the end of a barrier, cut 40% of the way in.
  const leaving = { x: 1640, y: 1740 };
  const stepInto = { x: 1700, y: 1800 };

  it('rounds a sighting back to the square it came from under the plain snap', () => {
    expect(landing(leaving, stepInto, 'nearest')).toEqual({ x: 1600, y: 1700 });
  });

  it('lands a sighting on the square the figure was stepping into', () => {
    expect(landing(leaving, stepInto, 'ahead')).toEqual(stepInto);
  });

  // Recorded on the 42c inspection (13.09.2026): a smoothed leg from (1600, 1700)
  // to (1800, 1600) passing just under the end of a barrier at (1700, 1700),
  // cut at (1639, 1681). Pushing each axis on its own gave (1700, 1600) — the
  // far side of the barrier's end, refused by the server.
  it('stays beside a smoothed leg that hugs the end of a wall', () => {
    expect(landing({ x: 1639, y: 1681 }, { x: 1800, y: 1600 }, 'ahead')).toEqual({
      x: 1700,
      y: 1700,
    });
  });

  it('moves just under half a square along the leg', () => {
    expect(marchStopPoint({ x: 1600, y: 1700 }, { x: 1900, y: 1700 }, 100, 'ahead')).toEqual({
      x: 1649.5,
      y: 1700,
    });
  });

  it('never goes past the next waypoint', () => {
    expect(marchStopPoint({ x: 1690, y: 1700 }, { x: 1700, y: 1700 }, 100, 'ahead')).toEqual({
      x: 1700,
      y: 1700,
    });
  });

  it('leaves a figure standing exactly on a square where it is', () => {
    expect(landing({ x: 1600, y: 1700 }, stepInto, 'ahead')).toEqual({ x: 1600, y: 1700 });
  });

  it('follows the leg when walking up and left', () => {
    expect(landing({ x: 1760, y: 1760 }, { x: 1700, y: 1700 }, 'ahead')).toEqual({
      x: 1700,
      y: 1700,
    });
  });

  it('keeps the position when the march has no waypoint left', () => {
    expect(marchStopPoint(leaving, undefined, 100, 'ahead')).toEqual(leaving);
  });

  it('keeps the position under the plain snap', () => {
    expect(marchStopPoint(leaving, stepInto, 100, 'nearest')).toEqual(leaving);
  });
});
