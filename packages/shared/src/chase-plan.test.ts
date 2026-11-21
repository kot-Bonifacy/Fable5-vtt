import { describe, expect, it } from 'vitest';
import {
  chasePlanDue,
  chasePlanEventOf,
  chasePlanTitle,
  chasePlanVehicleRefs,
  freshChasePlanEntry,
  mergeChasePlan,
  parseChasePlan,
  readChasePlanEvent,
  readChasePlanEvents,
  remapChasePlan,
  resetChasePlan,
  type ChasePlanEntry,
  type ChasePlanEvent,
} from './chase-plan.js';
import { readSceneTemplate } from './scene-templates.js';

const reinforce: ChasePlanEvent = {
  id: 'p1',
  round: 3,
  text: 'NCPD wchodzi do gry',
  kind: 'reinforce',
  vehicleId: 'cop',
  lane: 1,
  side: 'rear',
  speed: null,
};
const obstacle: ChasePlanEvent = {
  id: 'p2',
  round: 2,
  text: null,
  kind: 'obstacle',
  obstacle: 'barricade',
  lane: 0,
  beforeId: null,
  gapSq: 4,
};
const note: ChasePlanEvent = { id: 'p3', round: 2, text: 'megafon', kind: 'note' };

describe('readChasePlanEvent', () => {
  it('reads each kind and normalises the optional fields', () => {
    expect(readChasePlanEvent({ ...reinforce, speed: undefined })).toEqual(reinforce);
    expect(readChasePlanEvent(obstacle)).toEqual(obstacle);
    expect(readChasePlanEvent({ id: 'm', round: 1, kind: 'maneuver', maneuver: 'swerve' })).toEqual(
      { id: 'm', round: 1, text: null, kind: 'maneuver', vehicleId: null, maneuver: 'swerve' },
    );
    expect(readChasePlanEvent({ ...note, text: '  megafon   z  dachu ' })).toEqual({
      ...note,
      text: 'megafon z dachu',
    });
  });

  it('refuses bad shapes', () => {
    expect(readChasePlanEvent({ ...reinforce, round: 0 })).toBeNull();
    expect(readChasePlanEvent({ ...reinforce, side: 'left' })).toBeNull();
    expect(readChasePlanEvent({ ...reinforce, lane: -1 })).toBeNull();
    expect(readChasePlanEvent({ ...obstacle, obstacle: 'custom' })).toBeNull();
    expect(readChasePlanEvent({ ...obstacle, gapSq: -1 })).toBeNull();
    expect(readChasePlanEvent({ ...note, text: '   ' })).toBeNull();
    expect(readChasePlanEvent({ ...note, text: 'x'.repeat(201) })).toBeNull();
    expect(readChasePlanEvent({ ...note, kind: 'boom' })).toBeNull();
    expect(readChasePlanEvent({ ...note, id: 'z spacją' })).toBeNull();
  });
});

describe('readChasePlanEvents', () => {
  it('sorts by round and keeps the order inside a round', () => {
    expect(readChasePlanEvents([reinforce, obstacle, note])?.map((e) => e.id)).toEqual([
      'p2',
      'p3',
      'p1',
    ]);
  });

  it('refuses a repeated id or one bad row', () => {
    expect(readChasePlanEvents([note, note])).toBeNull();
    expect(readChasePlanEvents([note, { ...obstacle, lane: 'x' }])).toBeNull();
    expect(readChasePlanEvents('nope')).toBeNull();
  });
});

describe('plan state', () => {
  const plan: ChasePlanEntry[] = [obstacle, note, reinforce].map(freshChasePlanEntry);

  it('asks for every waiting row whose round has come, late ones included', () => {
    expect(chasePlanDue(plan, 1)).toEqual([]);
    expect(chasePlanDue(plan, 2).map((e) => e.id)).toEqual(['p2', 'p3']);
    expect(chasePlanDue(plan, 5).map((e) => e.id)).toEqual(['p2', 'p3', 'p1']);
    const answered = plan.map((e) => (e.id === 'p2' ? { ...e, status: 'done' as const } : e));
    expect(chasePlanDue(answered, 2).map((e) => e.id)).toEqual(['p3']);
    const deferred = plan.map((e) => (e.id === 'p3' ? { ...e, dueRound: 3 } : e));
    expect(chasePlanDue(deferred, 2).map((e) => e.id)).toEqual(['p2']);
  });

  it('merges an edit with the stored state and never touches an open question', () => {
    const stored = plan.map((entry): ChasePlanEntry => {
      if (entry.id === 'p2') return { ...entry, status: 'asked', messageId: 7 };
      if (entry.id === 'p3') return { ...entry, status: 'done', messageId: 5 };
      return entry;
    });
    const merged = mergeChasePlan(stored, [
      { ...reinforce, round: 4 },
      { ...note, text: 'syrena' },
      { id: 'p9', round: 1, text: 'nowe', kind: 'note' },
    ]);
    expect(merged.map((e) => [e.id, e.status, e.dueRound])).toEqual([
      ['p9', 'planned', 1],
      ['p3', 'done', 2],
      // Wiersz, o który karta pyta, został — choć edycja go pominęła.
      ['p2', 'asked', 2],
      ['p1', 'planned', 4],
    ]);
    expect(merged.find((e) => e.id === 'p3')?.text).toBe('syrena');
    const edited = mergeChasePlan(stored, [{ ...obstacle, lane: 2 }]);
    expect(edited.find((e) => e.id === 'p2')).toMatchObject({ lane: 0, status: 'asked' });
  });

  it('round-trips through the stored JSON and drops broken rows', () => {
    const stored = JSON.stringify([...plan, { id: 'bad', round: 'x' }]);
    expect(parseChasePlan(stored)).toEqual(plan);
    expect(parseChasePlan('nope')).toEqual([]);
    expect(parseChasePlan(null)).toEqual([]);
  });

  it('resets on a new fight and strips the state for editing', () => {
    const used = plan.map((e): ChasePlanEntry => ({
      ...e,
      status: 'skipped',
      dueRound: 9,
      messageId: 3,
    }));
    expect(resetChasePlan(used)).toEqual(plan);
    expect(chasePlanEventOf(used[0]!)).toEqual(obstacle);
  });
});

describe('remapChasePlan', () => {
  it('rewrites car references and drops rows that point nowhere', () => {
    const plan: ChasePlanEvent[] = [
      reinforce,
      { ...obstacle, beforeId: 'van' },
      { id: 'p4', round: 1, text: null, kind: 'maneuver', vehicleId: null, maneuver: 'swerve' },
      { id: 'p5', round: 1, text: null, kind: 'maneuver', vehicleId: 'gone', maneuver: 'swerve' },
      note,
    ];
    expect(chasePlanVehicleRefs(plan)).toEqual(['cop', 'van', 'gone']);
    const ids = new Map([
      ['cop', 'id-cop'],
      ['van', 'id-van'],
    ]);
    expect(remapChasePlan(plan, ids).map((e) => e.id)).toEqual(['p1', 'p2', 'p4', 'p3']);
    expect(remapChasePlan(plan, ids)[0]).toMatchObject({ vehicleId: 'id-cop' });
    expect(remapChasePlan(plan, ids)[1]).toMatchObject({ beforeId: 'id-van' });
  });
});

describe('chasePlanTitle', () => {
  const names = {
    vehicle: (id: string) => (id === 'cop' ? 'Radiowóz NCPD' : null),
    maneuver: (id: string) => (id === 'swerve' ? 'Gwałtowny skręt (PT 13)' : null),
    metersPerSquare: 2,
  };
  const mph = (speed: number) => speed * 5;

  it('says what happens in Polish', () => {
    expect(chasePlanTitle(reinforce, names, mph)).toBe(
      'Posiłki: Radiowóz NCPD — pas 2, od tyłu, prędkość pościgu',
    );
    expect(chasePlanTitle({ ...reinforce, speed: 30, side: 'front' }, names, mph)).toBe(
      'Posiłki: Radiowóz NCPD — pas 2, od przodu, 150 mil/h',
    );
    expect(chasePlanTitle(obstacle, names, mph)).toBe(
      'Przeszkoda: Barykada — pas 1, 8 m przed: autem kadru',
    );
    expect(chasePlanTitle({ ...obstacle, gapSq: null }, names, mph)).toBe(
      'Przeszkoda: Barykada — pas 1, przy przedniej krawędzi kadru',
    );
    expect(
      chasePlanTitle(
        { id: 'm', round: 1, text: null, kind: 'maneuver', vehicleId: null, maneuver: 'swerve' },
        names,
        mph,
      ),
    ).toBe('Manewr na wezwanie: Gwałtowny skręt (PT 13) — wszystkie auta z kierowcą');
    expect(chasePlanTitle(note, names, mph)).toBe('Notatka: megafon');
  });
});

describe('scene template plan', () => {
  const template = (plan: unknown) => ({
    schemaVersion: 1,
    name: 'Próba',
    scene: {
      kind: 'chase',
      backgroundUrl: '/public/scenes/proba/map.webp',
      backgroundWidth: 1000,
      backgroundHeight: 600,
      gridSizePx: 50,
      chase: { direction: 'left', plan },
    },
    vehicles: [{ key: 'cop', name: 'Radiowóz', x: 5, y: 5, system: { catalogIds: ['vehicle.x'] } }],
    figures: [],
  });

  it('reads the plan with car keys and generated ids', () => {
    expect(readSceneTemplate(template(undefined), 'proba')?.scene.chase?.plan).toEqual([]);
    const read = readSceneTemplate(
      template([{ round: 3, kind: 'reinforce', vehicleId: 'cop', lane: 0, side: 'rear' }]),
      'proba',
    );
    expect(read?.scene.chase?.plan).toEqual([
      {
        id: 'p1',
        round: 3,
        text: null,
        kind: 'reinforce',
        vehicleId: 'cop',
        lane: 0,
        side: 'rear',
        speed: null,
      },
    ]);
  });

  it('refuses a plan pointing at a car the template does not have', () => {
    expect(
      readSceneTemplate(
        template([{ round: 3, kind: 'reinforce', vehicleId: 'van', lane: 0, side: 'rear' }]),
        'proba',
      ),
    ).toBeNull();
  });
});
