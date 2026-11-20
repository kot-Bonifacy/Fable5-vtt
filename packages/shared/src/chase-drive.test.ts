import { describe, expect, it } from 'vitest';
import { chaseFirstContact, type ChaseSettings } from './chase.js';
import {
  CHASE_LANES_MAX,
  chaseAnchorShift,
  chaseAnchorVehicle,
  chaseDefaultLanes,
  chaseDriveStep,
  chaseEffectiveLanes,
  chaseLaneCentre,
  chaseLaneOf,
  chaseLanesForWidth,
  chaseLaneSpanPx,
  chaseLaneTarget,
  chaseObstacleEta,
  chaseSnapToLane,
  clampChaseLanes,
  isChaseRole,
  type ChaseAnchorCandidate,
} from './chase-drive.js';
import { chaseRoadByUrl } from './chase-roads.js';

/** Neonowa ulica: 35 × 24 kratki po 100 px, jezdnia 6–18, trzy pasy po 4 m. */
const neon = { width: 3500, height: 2400, gridSizePx: 100, gridOffsetX: 0, gridOffsetY: 0 };
const left: Pick<ChaseSettings, 'direction' | 'road'> = {
  direction: 'left',
  road: { from: 6, to: 18 },
};
const car = { widthSq: 3, lengthSq: 5 };

describe('pasy', () => {
  it('Neonowa ulica: trzy pasy po 4 m, środki na 8, 12 i 16 m', () => {
    expect(chaseDefaultLanes('/art/roads/neon-street.webp', left, neon)).toBe(3);
    expect([0, 1, 2].map((lane) => chaseLaneCentre(lane, 3, left, neon))).toEqual([
      800, 1200, 1600,
    ]);
    expect(chaseLaneSpanPx(1, 3, left, neon)).toEqual({ from: 1000, to: 1400 });
  });

  it('pasy wbudowanej drogi zgadzają się z jej namalowanymi liniami (4 m)', () => {
    const preset = chaseRoadByUrl('/art/roads/neon-street.webp')!;
    const span = chaseLaneSpanPx(0, preset.lanes, { direction: 'left', road: preset.road }, neon);
    expect(span.to - span.from).toBe(400);
  });

  it('własna mapa: round(szerokość jezdni / 4), co najmniej jeden, najwyżej osiem', () => {
    expect(chaseLanesForWidth(12)).toBe(3);
    expect(chaseLanesForWidth(9)).toBe(2);
    expect(chaseLanesForWidth(10)).toBe(3);
    expect(chaseLanesForWidth(1)).toBe(1);
    expect(chaseLanesForWidth(100)).toBe(CHASE_LANES_MAX);
    expect(
      chaseDefaultLanes('/uploads/c1/maps/a.webp', { direction: 'left', road: null }, neon),
    ).toBe(6);
    expect(clampChaseLanes(Number.NaN)).toBe(1);
  });

  it('liczba pasów szkicu: z drogi albo wpisana przez MG, wbudowana zawsze namalowana (72f1)', () => {
    const own = '/uploads/c1/maps/a.webp';
    const neonUrl = '/art/roads/neon-street.webp';
    expect(chaseEffectiveLanes(own, { ...left, lanes: 5, lanesFromRoad: true }, neon)).toBe(3);
    // Szkic poszerzył jezdnię — liczba z szerokości idzie za nim.
    const wide = { direction: 'left' as const, road: { from: 2, to: 22 } };
    expect(chaseEffectiveLanes(own, { ...wide, lanes: 5, lanesFromRoad: true }, neon)).toBe(5);
    expect(chaseEffectiveLanes(own, { ...wide, lanes: 2, lanesFromRoad: false }, neon)).toBe(2);
    expect(chaseEffectiveLanes(neonUrl, { ...wide, lanes: 2, lanesFromRoad: false }, neon)).toBe(3);
    expect(chaseEffectiveLanes(own, { ...left, lanes: 99, lanesFromRoad: false }, neon)).toBe(
      CHASE_LANES_MAX,
    );
  });

  it('pas punktu: od krawędzi road.from, poza jezdnią — skrajny', () => {
    expect(chaseLaneOf({ x: 0, y: 1199 }, 3, left, neon)).toBe(1);
    expect(chaseLaneOf({ x: 0, y: 1000 }, 3, left, neon)).toBe(1);
    expect(chaseLaneOf({ x: 0, y: 999 }, 3, left, neon)).toBe(0);
    expect(chaseLaneOf({ x: 0, y: 100 }, 3, left, neon)).toBe(0);
    expect(chaseLaneOf({ x: 0, y: 2300 }, 3, left, neon)).toBe(2);
  });

  it('w pionie pasy idą w poprzek osi x', () => {
    const up: Pick<ChaseSettings, 'direction' | 'road'> = {
      direction: 'up',
      road: { from: 2, to: 10 },
    };
    expect(chaseLaneCentre(0, 2, up, neon)).toBe(400);
    expect(chaseLaneOf({ x: 900, y: 0 }, 2, up, neon)).toBe(1);
    expect(chaseSnapToLane({ x: 123, y: 456 }, 1, 2, up, neon)).toEqual({ x: 800, y: 456 });
  });

  it('zmiana pasa o jeden, przy krawędzi jezdni — null', () => {
    expect(chaseLaneTarget(1, -1, 3)).toBe(0);
    expect(chaseLaneTarget(1, 1, 3)).toBe(2);
    expect(chaseLaneTarget(0, -1, 3)).toBeNull();
    expect(chaseLaneTarget(2, 1, 3)).toBeNull();
  });

  it('auto postawione krzywo przyciąga się do środka swojego pasa', () => {
    const centre = { x: 1700, y: 903 };
    const lane = chaseLaneOf(centre, 3, left, neon);
    expect(chaseSnapToLane(centre, lane, 3, left, neon)).toEqual({ x: 1700, y: 800 });
  });
});

describe('krok ruchu', () => {
  it('jazda w lewo: przesunięcie wzdłuż i zmiana pasa jednym odcinkiem', () => {
    const step = chaseDriveStep({
      centre: { x: 2000, y: 1200 },
      lane: 0,
      advanceSq: 4.5,
      lanes: 3,
      settings: left,
      scene: neon,
    });
    expect(step).toEqual({ from: { x: 2000, y: 1200 }, to: { x: 1550, y: 800 }, lane: 0 });
  });

  it('ruch w tył bez przycięcia do sceny — auto może wypaść za tylną krawędź', () => {
    const step = chaseDriveStep({
      centre: { x: 3300, y: 1200 },
      lane: 1,
      advanceSq: -10,
      lanes: 3,
      settings: left,
      scene: neon,
    });
    expect(step.to).toEqual({ x: 4300, y: 1200 });
  });

  it('odcinek kroku trafia w auto na pasie docelowym (chaseFirstContact)', () => {
    const step = chaseDriveStep({
      centre: { x: 2000, y: 1200 },
      lane: 0,
      advanceSq: 6,
      lanes: 3,
      settings: left,
      scene: neon,
    });
    const contact = chaseFirstContact(step.from, step.to, { hx: 250, hy: 150 }, [
      { id: 'van', centre: { x: 1500, y: 800 }, hx: 350, hy: 150 },
    ]);
    expect(contact?.id).toBe('van');
  });
});

describe('kadr', () => {
  it('drużyna goni: auto kadru 30 % długości od tylnej krawędzi', () => {
    // Jazda w lewo — tylna krawędź po prawej (x = 3500), cel 2450.
    expect(chaseAnchorShift({ x: 2450, y: 1200 }, 'left', 'pursue', neon)).toBeCloseTo(0);
    // Auto wysunęło się o 4,5 kratki do przodu — kadr cofa wszystko o 4,5.
    expect(chaseAnchorShift({ x: 2000, y: 1200 }, 'left', 'pursue', neon)).toBeCloseTo(-4.5);
    // Auto zostało w tyle — wszystko jedzie do przodu.
    expect(chaseAnchorShift({ x: 3000, y: 1200 }, 'left', 'pursue', neon)).toBeCloseTo(5.5);
  });

  it('drużyna ucieka: auto kadru 30 % od przedniej krawędzi', () => {
    expect(chaseAnchorShift({ x: 1050, y: 1200 }, 'left', 'flee', neon)).toBeCloseTo(0);
    expect(chaseAnchorShift({ x: 1050, y: 1200 }, 'right', 'flee', neon)).toBeCloseTo(14);
    expect(chaseAnchorShift({ x: 0, y: 720 }, 'down', 'pursue', neon)).toBeCloseTo(0);
  });

  it('rola drużyny z drutu', () => {
    expect(isChaseRole('pursue')).toBe(true);
    expect(isChaseRole('flee')).toBe(true);
    expect(isChaseRole('chase')).toBe(false);
  });

  const candidate = (
    id: string,
    over: Partial<ChaseAnchorCandidate> = {},
  ): ChaseAnchorCandidate => ({
    id,
    status: 'racing',
    party: false,
    control: 'driver',
    speed: 20,
    ...over,
  });

  it('auto kadru: wskazane przez MG, potem auto drużyny z kierowcą', () => {
    const vehicles = [
      candidate('npc', { speed: 60 }),
      candidate('empty', { party: true, control: 'none' }),
      candidate('party', { party: true }),
    ];
    expect(chaseAnchorVehicle(vehicles)).toBe('party');
    expect(chaseAnchorVehicle(vehicles, 'npc')).toBe('npc');
    // Wskazane auto poza kadrem nie trzyma kadru.
    expect(
      chaseAnchorVehicle([candidate('gone', { status: 'escaped' }), ...vehicles], 'gone'),
    ).toBe('party');
  });

  it('auto drużyny bez kierowcy dalej trzyma kadr (stoi auto drużyny — stoi droga)', () => {
    const vehicles = [
      candidate('npc', { speed: 60 }),
      candidate('wreck', { party: true, status: 'wrecked', control: 'none', speed: 0 }),
    ];
    expect(chaseAnchorVehicle(vehicles)).toBe('wreck');
  });

  it('bez auta drużyny — najszybsze auto w kadrze; pusta droga — null', () => {
    const vehicles = [
      candidate('slow', { speed: 20 }),
      candidate('fast', { speed: 40 }),
      candidate('behind', { status: 'behind', speed: 60 }),
      candidate('wreck', { status: 'wrecked', speed: 0 }),
    ];
    expect(chaseAnchorVehicle(vehicles)).toBe('fast');
    expect(chaseAnchorVehicle([])).toBeNull();
  });
});

describe('prognoza przeszkody', () => {
  const vehicle = { centre: { x: 2450, y: 1200 }, body: car };

  it('„16 m · za 2 tury”: odstęp od przedniego zderzaka i rundy z prędkości po drodze', () => {
    // Przód auta na x = 2200; przeszkoda 2 × 2 o środku 500 — tył na 600.
    const eta = chaseObstacleEta(
      vehicle,
      { centre: { x: 500, y: 1200 }, widthSq: 2, lengthSq: 2 },
      'left',
      neon,
      10,
    );
    expect(eta).toEqual({ gapSq: 16, rounds: 2, sameLane: true });
  });

  it('przeszkoda na innym pasie — sameLane: false', () => {
    const eta = chaseObstacleEta(
      vehicle,
      { centre: { x: 500, y: 800 }, widthSq: 2, lengthSq: 2 },
      'left',
      neon,
      10,
    );
    expect(eta?.sameLane).toBe(false);
  });

  it('auto stojące nie dojedzie wcale, przeszkoda przy zderzaku — 0 rund', () => {
    const far = chaseObstacleEta(
      vehicle,
      { centre: { x: 500, y: 1200 }, widthSq: 2, lengthSq: 2 },
      'left',
      neon,
      0,
    );
    expect(far?.rounds).toBeNull();
    const touching = chaseObstacleEta(
      vehicle,
      { centre: { x: 2100, y: 1200 }, widthSq: 2, lengthSq: 2 },
      'left',
      neon,
      0,
    );
    expect(touching).toEqual({ gapSq: 0, rounds: 0, sameLane: true });
  });

  it('przeszkoda minięta (za przednim zderzakiem) — null', () => {
    expect(
      chaseObstacleEta(
        vehicle,
        { centre: { x: 3000, y: 1200 }, widthSq: 2, lengthSq: 2 },
        'left',
        neon,
        10,
      ),
    ).toBeNull();
  });
});
