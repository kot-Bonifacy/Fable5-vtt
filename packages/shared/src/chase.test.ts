import { describe, expect, it } from 'vitest';
import {
  chaseBodyContains,
  chaseDriftSquares,
  chaseDriftedCentre,
  chaseFrameTempo,
  chaseLimitMove,
  chaseMoveSquares,
  chaseOffscreen,
  chaseShiftAlong,
  chaseRoadSpanPx,
  chaseScrollSpeed,
  clampChaseVehicle,
  defaultChaseDirection,
  sanitizeChasePatch,
  seatAtPoint,
  seatedTokenPosition,
  vehicleSeatCentre,
  type ChaseBody,
  chaseBodyNearestPoint,
  vehicleSideFacing,
} from './chase.js';
import { sanitizeScenePatch } from './scenes.js';

const CAR: ChaseBody = { widthSq: 3, lengthSq: 5, layout: 'car-4' };
const SCENE = { width: 2400, height: 1800, gridSizePx: 100, gridOffsetX: 0, gridOffsetY: 0 };

describe('vehicleSeatCentre', () => {
  it('stawia kierowcę z przodu po lewej burcie auta jadącego w górę', () => {
    const seat = vehicleSeatCentre({ x: 1000, y: 1000 }, CAR, 0, 'up', 100);
    // x: (0,3 − 0,5) × 300 = −60, y: (0,38 − 0,5) × 500 = −60
    expect(seat).toEqual({ x: 940, y: 940 });
  });

  it('obraca układ z kierunkiem jazdy — w prawo kierowca jest u góry z przodu', () => {
    const seat = vehicleSeatCentre({ x: 1000, y: 1000 }, CAR, 0, 'right', 100)!;
    expect(seat.x).toBeCloseTo(1060);
    expect(seat.y).toBeCloseTo(940);
  });

  it('w dół i w lewo lustrzanie do góry i prawa', () => {
    const down = vehicleSeatCentre({ x: 0, y: 0 }, CAR, 0, 'down', 100)!;
    const left = vehicleSeatCentre({ x: 0, y: 0 }, CAR, 0, 'left', 100)!;
    expect(down.x).toBeCloseTo(60);
    expect(down.y).toBeCloseTo(60);
    expect(left.x).toBeCloseTo(-60);
    expect(left.y).toBeCloseTo(60);
  });

  it('fotel spoza układu to null', () => {
    expect(vehicleSeatCentre({ x: 0, y: 0 }, CAR, 4, 'up', 100)).toBeNull();
  });

  it('figura w fotelu stoi rogiem pół boku od środka fotela', () => {
    expect(seatedTokenPosition({ x: 940, y: 940 }, 1, 100)).toEqual({ x: 890, y: 890 });
  });
});

describe('seatAtPoint', () => {
  it('trafia fotel w promieniu pół kratki i nic poza nim', () => {
    const centre = { x: 1000, y: 1000 };
    expect(seatAtPoint(centre, CAR, 'right', 100, { x: 1070, y: 935 })).toBe(0);
    expect(seatAtPoint(centre, CAR, 'right', 100, { x: 1000, y: 1000 })).toBeNull();
  });
});

describe('pas jezdni', () => {
  it('bez pasa auto ma całą scenę, przycięte do bryły', () => {
    const at = clampChaseVehicle({ x: 10, y: 10 }, CAR, { direction: 'right', road: null }, SCENE);
    // Jazda w prawo: wzdłuż (x) pół długości 250, w poprzek (y) pół szerokości 150.
    expect(at).toEqual({ x: 250, y: 150 });
  });

  it('w poprzek trzyma auto w pasie, wzdłuż — na scenie', () => {
    const settings = { direction: 'right' as const, road: { from: 6, to: 12 } };
    expect(chaseRoadSpanPx(settings, SCENE)).toEqual({ from: 600, to: 1200 });
    expect(clampChaseVehicle({ x: 5000, y: 100 }, CAR, settings, SCENE)).toEqual({
      x: 2150,
      y: 750,
    });
    expect(clampChaseVehicle({ x: 900, y: 1700 }, CAR, settings, SCENE)).toEqual({
      x: 900,
      y: 1050,
    });
  });

  it('pas w pionie liczy kolumny; za wąski stawia auto na środku pasa', () => {
    const settings = { direction: 'up' as const, road: { from: 4, to: 6 } };
    expect(clampChaseVehicle({ x: 0, y: 900 }, CAR, settings, SCENE)).toEqual({ x: 500, y: 900 });
  });

  it('bryła zawiera punkt po obrocie', () => {
    expect(chaseBodyContains({ x: 0, y: 0 }, CAR, 'right', 100, { x: 240, y: 0 })).toBe(true);
    expect(chaseBodyContains({ x: 0, y: 0 }, CAR, 'up', 100, { x: 240, y: 0 })).toBe(false);
  });
});

describe('ustawienia pościgu', () => {
  it('kierunek z proporcji tła', () => {
    expect(defaultChaseDirection(2400, 1800)).toBe('left');
    expect(defaultChaseDirection(1000, 3000)).toBe('up');
  });

  it('bieżnia jedzie tempo / 4 kratek na rundę', () => {
    expect(chaseScrollSpeed(40, 100)).toBeCloseTo((10 * 100) / 3);
    expect(chaseScrollSpeed(-5, 100)).toBe(0);
  });

  it('łata odrzuca złe pola i przycina tempo', () => {
    expect(
      sanitizeChasePatch({
        direction: 'diagonal',
        tempo: 999,
        running: false,
        road: { from: 5, to: 3 },
      }),
    ).toEqual({ tempo: 200, running: false });
    expect(sanitizeChasePatch({ road: null })).toEqual({ road: null });
    expect(sanitizeChasePatch({ road: { from: 2, to: 8 } })).toEqual({ road: { from: 2, to: 8 } });
  });

  it('łata sceny niesie rodzaj i ustawienia pościgu', () => {
    expect(sanitizeScenePatch({ kind: 'chase', chase: { direction: 'left' } })).toEqual({
      kind: 'chase',
      chase: { direction: 'left' },
    });
    expect(sanitizeScenePatch({ kind: 'boat' })).toEqual({});
  });
});

describe('jazda w pościgu (65c)', () => {
  it('budżet to Ruch / 4 kratek, dryf (Ruch − tempo) / 4', () => {
    expect(chaseMoveSquares(40)).toBe(10);
    expect(chaseDriftSquares(40, 20)).toBe(-5);
    expect(chaseDriftSquares(40, 40)).toBe(0);
    expect(chaseDriftSquares(40, 60)).toBe(5);
  });

  it('przesuwa środek wzdłuż kierunku jazdy', () => {
    expect(chaseShiftAlong({ x: 500, y: 500 }, 'right', -2, 100)).toEqual({ x: 300, y: 500 });
    expect(chaseShiftAlong({ x: 500, y: 500 }, 'up', 3, 100)).toEqual({ x: 500, y: 200 });
  });

  it('dryf nie przycina wzdłuż drogi, ale trzyma pas w poprzek', () => {
    const settings = { direction: 'right' as const, road: { from: 6, to: 12 } };
    const drifted = chaseDriftedCentre({ x: 200, y: 100 }, CAR, settings, SCENE, -5);
    expect(drifted).toEqual({ x: -300, y: 750 });
  });

  it('odpada dopiero bryła cała za krawędzią: w tyle albo ucieka', () => {
    expect(chaseOffscreen({ x: -240, y: 900 }, CAR, 'right', SCENE)).toBeNull();
    expect(chaseOffscreen({ x: -250, y: 900 }, CAR, 'right', SCENE)).toBe('behind');
    expect(chaseOffscreen({ x: 2650, y: 900 }, CAR, 'right', SCENE)).toBe('escaped');
    expect(chaseOffscreen({ x: 1200, y: 2050 }, CAR, 'up', SCENE)).toBe('behind');
  });

  it('rama jedzie z autem drużyny: stojące zatrzymuje drogę (decyzja MG z 05.11)', () => {
    const party = { status: 'racing' as const, party: true, control: 'driver' as const };
    const npc = { status: 'racing' as const, party: false, control: 'driver' as const };
    // Bez auta drużyny w kadrze — tempo sceny, choćby NPC stał.
    expect(chaseFrameTempo(40, [{ ...npc, speed: 0, control: 'none' }])).toBe(40);
    // Auto drużyny z kierowcą — tempo sceny, nawet wolniejsze od tempa.
    expect(
      chaseFrameTempo(40, [
        { ...party, speed: 20 },
        { ...npc, speed: 40 },
      ]),
    ).toBe(40);
    // Auto drużyny bez kierowcy stoi — droga stoi.
    expect(chaseFrameTempo(40, [{ ...party, speed: 0, control: 'none' }])).toBe(0);
    // …toczy się — droga zwalnia razem z nim, najwyżej do tempa.
    expect(chaseFrameTempo(40, [{ ...party, speed: 20, control: 'none' }])).toBe(20);
    // Wrak drużyny w kadrze też stoi; auto za krawędzią się nie liczy.
    expect(chaseFrameTempo(40, [{ ...party, status: 'wrecked', speed: 0 }])).toBe(0);
    expect(chaseFrameTempo(40, [{ ...party, status: 'behind', speed: 0, control: 'none' }])).toBe(
      40,
    );
    // Dwa auta drużyny: wystarczy, że jedno jedzie z kierowcą.
    expect(
      chaseFrameTempo(40, [
        { ...party, speed: 0, control: 'none' },
        { ...party, speed: 40 },
      ]),
    ).toBe(40);
  });

  it('przycina przeciągnięcie do budżetu w linii prostej', () => {
    expect(chaseLimitMove({ x: 0, y: 0 }, { x: 300, y: 400 }, 250)).toEqual({ x: 150, y: 200 });
    expect(chaseLimitMove({ x: 0, y: 0 }, { x: 30, y: 40 }, 250)).toEqual({ x: 30, y: 40 });
  });
});

describe('burty auta i punkt celowania (etap 65d1)', () => {
  const body = { widthSq: 3, lengthSq: 5 };
  const centre = { x: 500, y: 300 };

  it('burta zwrócona do strzelca liczy się względem kierunku jazdy', () => {
    // Jazda w prawo: przód w prawo, lewa burta (kierowca) u góry.
    expect(vehicleSideFacing(centre, body, 'right', { x: 900, y: 310 })).toBe('front');
    expect(vehicleSideFacing(centre, body, 'right', { x: 100, y: 280 })).toBe('rear');
    expect(vehicleSideFacing(centre, body, 'right', { x: 520, y: 100 })).toBe('left');
    expect(vehicleSideFacing(centre, body, 'right', { x: 480, y: 600 })).toBe('right');
    // Jazda w górę: lewa burta po lewej stronie ekranu.
    expect(vehicleSideFacing(centre, body, 'up', { x: 100, y: 300 })).toBe('left');
    expect(vehicleSideFacing(centre, body, 'up', { x: 500, y: 0 })).toBe('front');
  });

  it('strzał w auto celuje w najbliższy punkt bryły', () => {
    // 5 × 3 kratki po 50 px, w prawo: połowy 125 × 75.
    expect(chaseBodyNearestPoint(centre, body, 'right', 50, { x: 900, y: 300 })).toEqual({
      x: 625,
      y: 300,
    });
    expect(chaseBodyNearestPoint(centre, body, 'right', 50, { x: 0, y: 0 })).toEqual({
      x: 375,
      y: 225,
    });
  });
});
