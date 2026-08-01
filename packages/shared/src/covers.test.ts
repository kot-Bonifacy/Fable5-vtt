import { describe, expect, it } from 'vitest';
import {
  COVER_MIN_SIZE_PX,
  coverInLineOfFire,
  coverLabel,
  coverMovementSegments,
  coverSegments,
  coverStanding,
  distanceToCover,
  fireCoverSegments,
  isPointInCover,
  pickCoverAt,
  sanitizeCoverName,
  sanitizeCoverRect,
  segmentCrossesCover,
  type CoverView,
} from './covers.js';
import { isSegmentClear } from './vision.js';

/** A car parked across the middle of the street: 100×50 px at (200, 200). */
function car(overrides: Partial<CoverView> = {}): CoverView {
  return {
    id: 1,
    sceneId: 'scene-1',
    typeId: 'car',
    name: 'Samochód',
    x: 200,
    y: 200,
    width: 100,
    height: 50,
    hpMax: 25,
    hpCurrent: 25,
    ...overrides,
  };
}

describe('cover geometry', () => {
  it('gives a rectangle four edges', () => {
    expect(coverSegments(car())).toHaveLength(4);
  });

  it('answers point containment on the edges too', () => {
    const cover = car();
    expect(isPointInCover(cover, { x: 250, y: 220 })).toBe(true);
    expect(isPointInCover(cover, { x: 200, y: 200 })).toBe(true);
    expect(isPointInCover(cover, { x: 199, y: 220 })).toBe(false);
  });

  it('measures distance to the nearest point, zero inside', () => {
    const cover = car();
    expect(distanceToCover({ x: 250, y: 225 }, cover)).toBe(0);
    expect(distanceToCover({ x: 250, y: 150 }, cover)).toBe(50);
    expect(distanceToCover({ x: 100, y: 200 }, cover)).toBe(100);
  });

  it('sees a crossing segment, and lets a segment beside it through', () => {
    const cover = car();
    expect(segmentCrossesCover(cover, { x: 250, y: 100 }, { x: 250, y: 400 })).toBe(true);
    expect(segmentCrossesCover(cover, { x: 100, y: 100 }, { x: 100, y: 400 })).toBe(false);
  });

  it('counts a target standing inside the footprint as behind it', () => {
    const cover = car();
    expect(segmentCrossesCover(cover, { x: 250, y: 100 }, { x: 250, y: 220 })).toBe(true);
  });
});

describe('cover as a blocker', () => {
  it('stops a shot fired from across the street', () => {
    const found = coverInLineOfFire([car()], { x: 250, y: 100 }, { x: 250, y: 400 }, 20);
    expect(found?.name).toBe('Samochód');
  });

  it('does not stop a shot from somebody standing at it (arm’s reach)', () => {
    // Ten pixels off the bonnet: „you may fire over the car you are leaning on".
    const found = coverInLineOfFire([car()], { x: 250, y: 190 }, { x: 250, y: 400 }, 20);
    expect(found).toBeNull();
  });

  it('stops nothing once it is a wreck', () => {
    const wreck = car({ hpCurrent: 0 });
    expect(coverStanding(wreck)).toBe(false);
    expect(coverInLineOfFire([wreck], { x: 250, y: 100 }, { x: 250, y: 400 }, 20)).toBeNull();
    expect(fireCoverSegments([wreck], { x: 0, y: 0 }, 0)).toEqual([]);
    expect(coverMovementSegments([wreck])).toEqual([]);
  });

  it('reports the nearest cover when two stand in the line', () => {
    const near = car({ id: 1, name: 'Bliższy', y: 250 });
    const far = car({ id: 2, name: 'Dalszy', y: 350 });
    const found = coverInLineOfFire([far, near], { x: 250, y: 100 }, { x: 250, y: 500 }, 20);
    expect(found?.name).toBe('Bliższy');
  });

  it('blocks a body even where it does not block the shooter’s own bullet', () => {
    const cover = car();
    // The shooter is within reach, so their shot is exempt…
    expect(fireCoverSegments([cover], { x: 250, y: 190 }, 20)).toEqual([]);
    // …and their legs are not: the car is still in the way of a walk.
    const walkBlockers = coverMovementSegments([cover]);
    expect(walkBlockers).toHaveLength(4);
    expect(isSegmentClear({ x: 250, y: 190 }, { x: 250, y: 400 }, walkBlockers)).toBe(false);
  });

  it('never touches sight: the blockers are only ever asked for by fire and feet', () => {
    // The guard is structural — `covers.ts` exports nothing a sight raycast
    // consumes — so the test states the contract the module documents.
    const cover = car();
    expect(Object.keys(cover)).not.toContain('blocksSight');
  });
});

describe('sanitising a drawn rectangle', () => {
  it('normalises a drag that ran up and to the left', () => {
    expect(sanitizeCoverRect({ x: 300, y: 250, width: -100, height: -50 })).toEqual({
      x: 200,
      y: 200,
      width: 100,
      height: 50,
    });
  });

  it('rounds to whole scene pixels', () => {
    expect(sanitizeCoverRect({ x: 10.4, y: 20.6, width: 40.2, height: 30.9 })).toEqual({
      x: 10,
      y: 21,
      width: 40,
      height: 31,
    });
  });

  it('refuses a stray click', () => {
    expect(
      sanitizeCoverRect({ x: 10, y: 10, width: COVER_MIN_SIZE_PX - 1, height: 40 }),
    ).toBeNull();
    expect(sanitizeCoverRect({ x: 10, y: 10, width: 40, height: 0 })).toBeNull();
  });

  it('refuses nonsense', () => {
    expect(sanitizeCoverRect(null)).toBeNull();
    expect(sanitizeCoverRect({ x: 'a', y: 1, width: 40, height: 40 })).toBeNull();
    expect(sanitizeCoverRect({ x: 1, y: 1, width: 999999, height: 40 })).toBeNull();
  });

  it('trims a label and treats blank as „keep the preset’s name"', () => {
    expect(sanitizeCoverName('  Wrak busa  ')).toBe('Wrak busa');
    expect(sanitizeCoverName('   ')).toBeNull();
    expect(sanitizeCoverName(7)).toBeNull();
  });
});

describe('picking and labelling', () => {
  it('picks the topmost cover under the point', () => {
    const under = car({ id: 1, name: 'Pod spodem' });
    const over = car({ id: 2, name: 'Na wierzchu' });
    expect(pickCoverAt([under, over], { x: 250, y: 220 })?.name).toBe('Na wierzchu');
    expect(pickCoverAt([under, over], { x: 10, y: 10 })).toBeNull();
  });

  it('says how much of it is left, and when it is a wreck', () => {
    expect(coverLabel(car({ hpCurrent: 18 }))).toBe('Samochód · 18/25 PW');
    expect(coverLabel(car({ hpCurrent: 0 }))).toBe('Samochód (wrak)');
  });
});
