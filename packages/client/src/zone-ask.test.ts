import { describe, expect, it } from 'vitest';
import type { CompendiumEntry, DefenseZoneView, NetDeviceView, NetRunPayload } from '@vtt/shared';
import { zoneGuardNote, zoneNetSwitch, zonesOnWalk } from './zone-ask.js';

const scene = { id: 's1', grid: { sizePx: 100 } } as Parameters<typeof zonesOnWalk>[0]['scene'];

const zone = (id: number, x: number, y: number, w = 200, h = 200): DefenseZoneView => ({
  id,
  sceneId: 's1',
  entryId: 'defense.podloga-elektryczna',
  name: `Strefa ${id}`,
  x,
  y,
  width: w,
  height: h,
  armed: true,
  hidden: false,
  hpMax: 0,
  hpCurrent: 0,
});

// Figura 1×1 w (0, 0) — środek (50, 50).
const token = { x: 0, y: 0, size: 1 };

describe('zonesOnWalk (70d, 66e pkt 3)', () => {
  const floor = zone(1, 400, 0);

  it('a click inside a zone asks, before any route', () => {
    const hit = zonesOnWalk({ zones: [floor], scene, token, goal: { x: 450, y: 50 }, route: null });
    expect(hit.map((z) => z.id)).toEqual([1]);
  });

  it('a click beside it does not ask by itself', () => {
    const hit = zonesOnWalk({ zones: [floor], scene, token, goal: { x: 350, y: 50 }, route: null });
    expect(hit).toEqual([]);
  });

  it('a walk through the zone to a point beyond it asks', () => {
    const route = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 700, y: 0 },
    ];
    const hit = zonesOnWalk({ zones: [floor], scene, token, goal: { x: 750, y: 50 }, route });
    expect(hit.map((z) => z.id)).toEqual([1]);
  });

  it('a walk round the zone does not', () => {
    const route = [
      { x: 0, y: 0 },
      { x: 0, y: 300 },
      { x: 700, y: 300 },
    ];
    expect(zonesOnWalk({ zones: [floor], scene, token, goal: { x: 750, y: 350 }, route })).toEqual(
      [],
    );
  });

  it('a zone the figure already stands on does not ask — stepping off is not stepping on', () => {
    const under = zone(2, 0, 0);
    expect(
      zonesOnWalk({ zones: [under], scene, token, goal: { x: 150, y: 150 }, route: null }),
    ).toEqual([]);
  });

  it('a zone of another scene is not on this walk', () => {
    const elsewhere = { ...floor, sceneId: 's2' };
    expect(
      zonesOnWalk({ zones: [elsewhere], scene, token, goal: { x: 450, y: 50 }, route: null }),
    ).toEqual([]);
  });
});

describe('zoneNetSwitch (70d)', () => {
  const device = (patch: Partial<NetDeviceView>): NetDeviceView => ({
    id: 'zone-1',
    name: 'Podłoga',
    deviceKind: 'environment',
    operations: ['on', 'off'],
    on: true,
    zoneId: 1,
    ...patch,
  });
  const run = (devices: NetDeviceView[], onTrail = false) =>
    ({
      runId: 'r1',
      run: onTrail
        ? {
            here: { id: 'entry', kind: 'empty' },
            trail: [{ id: 'node', kind: 'controlNode', devices }],
          }
        : { here: { id: 'node', kind: 'controlNode', devices }, trail: [] },
    }) as unknown as NetRunPayload;

  it('finds the device of the zone on the node under foot and offers the opposite switch', () => {
    const sw = zoneNetSwitch([run([device({})])], 1);
    expect(sw).toMatchObject({ runId: 'r1', floorId: 'node', device: { id: 'zone-1' } });
  });

  it('finds it on a node held further up the trail', () => {
    expect(zoneNetSwitch([run([device({ on: false })], true)], 1)?.floorId).toBe('node');
  });

  it('a zone disarmed on the spot or of another node has no switch', () => {
    expect(zoneNetSwitch([run([device({ disarmed: true, on: false, operations: [] })])], 1)).toBe(
      null,
    );
    expect(zoneNetSwitch([run([device({ zoneId: 2 })])], 1)).toBe(null);
    expect(zoneNetSwitch([], 1)).toBe(null);
  });
});

describe('zoneGuardNote (zaległość 14.11, pkt 3)', () => {
  const entries = {
    'defense.wiezyczka': {
      id: 'defense.wiezyczka',
      category: 'netDefense',
      defenseKind: 'emplacement',
    },
    'defense.dron': { id: 'defense.dron', category: 'netDefense', defenseKind: 'drone' },
    'defense.podloga-elektryczna': {
      id: 'defense.podloga-elektryczna',
      category: 'netDefense',
      defenseKind: 'environment',
    },
  } as unknown as Record<string, CompendiumEntry>;

  it('obszar straży wieżyczki i drona mówi, że tu się strzela', () => {
    expect(zoneGuardNote({ entryId: 'defense.wiezyczka' }, entries)).toMatch(/wieżyczki.*strzela/);
    expect(zoneGuardNote({ entryId: 'defense.dron' }, entries)).toMatch(/drona.*strzela/);
  });

  it('strefa środowiskowa i nieznany wpis — bez dopisku', () => {
    expect(zoneGuardNote({ entryId: 'defense.podloga-elektryczna' }, entries)).toBeNull();
    expect(zoneGuardNote({ entryId: 'defense.nie-ma' }, entries)).toBeNull();
  });
});
