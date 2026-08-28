import { describe, expect, it } from 'vitest';
import {
  MAP_FX_MAX_TRACERS,
  MAP_FX_SOUNDS,
  mapFxTracerCount,
  trimMapFxBatch,
  trimMapFxForViewer,
  type MapFxEffect,
} from './fx.js';
import type { ScenePoint } from './measure.js';

const MUZZLE: ScenePoint = { x: 100, y: 100 };
const TARGET: ScenePoint = { x: 500, y: 100 };

function shot(): Extract<MapFxEffect, { kind: 'shot' }> {
  return {
    kind: 'shot',
    style: 'bullet',
    from: MUZZLE,
    to: TARGET,
    hit: true,
    shots: 1,
    sound: 'shot-pistol',
  };
}

/** „Everything left of x is in view" — a wall down the middle of the map. */
function leftOf(edge: number) {
  return (point: ScenePoint) => point.x < edge;
}

describe('trimMapFxForViewer — shot', () => {
  it('lets a shot between two visible points through untouched', () => {
    const effect = shot();
    expect(trimMapFxForViewer(effect, () => true)).toBe(effect);
  });

  it('drops a shot whose both ends are out of sight', () => {
    expect(trimMapFxForViewer(shot(), () => false)).toBeNull();
  });

  it('keeps the muzzle and cuts the line when the target is hidden', () => {
    const trimmed = trimMapFxForViewer(shot(), leftOf(300));
    expect(trimmed).not.toBeNull();
    if (trimmed?.kind !== 'shot') throw new Error('expected a shot');
    expect(trimmed.from).toEqual(MUZZLE);
    expect(trimmed.to).toBeNull();
    // The bang belongs to the muzzle, and the muzzle is in view.
    expect(trimmed.sound).toBe('shot-pistol');
  });

  it('silences a shot that arrives from a shooter nobody can see', () => {
    const trimmed = trimMapFxForViewer(shot(), (point) => point.x > 300);
    if (trimmed?.kind !== 'shot') throw new Error('expected a shot');
    expect(trimmed.from).toBeNull();
    expect(trimmed.to).toEqual(TARGET);
    // Hearing „pistol" would name the calibre of a gun nobody has seen.
    expect(trimmed.sound).toBeNull();
  });

  it('keeps a shot at a patch of ground with no target end at all', () => {
    const effect: MapFxEffect = { ...shot(), to: null };
    expect(trimMapFxForViewer(effect, () => true)).toBe(effect);
    expect(trimMapFxForViewer(effect, () => false)).toBeNull();
  });
});

describe('trimMapFxForViewer — everything with one place', () => {
  const cases: MapFxEffect[] = [
    { kind: 'blast', at: MUZZLE, sideM: 4, sound: 'explosion' },
    { kind: 'cloud', at: MUZZLE, sideM: 10, variant: 'gas', sound: 'gas' },
    { kind: 'float', at: MUZZLE, text: '−12', tone: 'damage' },
    { kind: 'spark', at: MUZZLE, sound: 'reload-pistol' },
    {
      kind: 'cone',
      from: MUZZLE,
      angleDeg: 0,
      halfAngleDeg: 15,
      rangeM: 8,
      sound: 'shot-shotgun',
    },
  ];

  for (const effect of cases) {
    it(`passes and drops a ${effect.kind} by its own point`, () => {
      expect(trimMapFxForViewer(effect, () => true)).toBe(effect);
      expect(trimMapFxForViewer(effect, () => false)).toBeNull();
    });
  }
});

describe('trimMapFxForViewer — defended zone', () => {
  const zap: MapFxEffect = {
    kind: 'zap',
    rect: { x: 0, y: 0, width: 400, height: 200 },
    sound: 'zap',
  };

  it('draws the whole rectangle when any corner is in view', () => {
    // Only the left edge is visible; the centre (200) is not.
    expect(trimMapFxForViewer(zap, leftOf(100))).toBe(zap);
  });

  it('draws it from the centre alone when every corner is hidden', () => {
    const centreOnly = (point: ScenePoint) => point.x === 200 && point.y === 100;
    expect(trimMapFxForViewer(zap, centreOnly)).toBe(zap);
  });

  it('drops it when nothing of it is observable', () => {
    expect(trimMapFxForViewer(zap, () => false)).toBeNull();
  });
});

describe('trimMapFxBatch', () => {
  it('keeps the survivors in order and drops the rest', () => {
    const effects: MapFxEffect[] = [
      { kind: 'float', at: MUZZLE, text: 'A', tone: 'note' },
      { kind: 'float', at: TARGET, text: 'B', tone: 'note' },
      { kind: 'float', at: MUZZLE, text: 'C', tone: 'note' },
    ];
    const kept = trimMapFxBatch(effects, leftOf(300));
    expect(kept.map((e) => (e.kind === 'float' ? e.text : ''))).toEqual(['A', 'C']);
  });

  it('gives an empty list rather than a null when nothing survives', () => {
    expect(trimMapFxBatch([{ kind: 'spark', at: MUZZLE, sound: null }], () => false)).toEqual([]);
  });
});

describe('mapFxTracerCount', () => {
  it('never draws fewer than one round', () => {
    expect(mapFxTracerCount(0)).toBe(1);
    expect(mapFxTracerCount(-4)).toBe(1);
  });

  it('caps a long burst where the eye stops counting', () => {
    expect(mapFxTracerCount(10)).toBe(MAP_FX_MAX_TRACERS);
    expect(mapFxTracerCount(3)).toBe(3);
  });

  it('survives a number that is not one', () => {
    expect(mapFxTracerCount(Number.NaN)).toBe(1);
  });
});

describe('MAP_FX_SOUNDS', () => {
  it('lists every sound exactly once', () => {
    expect(new Set(MAP_FX_SOUNDS).size).toBe(MAP_FX_SOUNDS.length);
  });
});
