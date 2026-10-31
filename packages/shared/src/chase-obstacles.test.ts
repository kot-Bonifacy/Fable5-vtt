import { describe, expect, it } from 'vitest';
import {
  CHASE_OBSTACLE_PRESETS,
  chaseObstacleCollides,
  chaseObstacleDrifted,
  chaseObstacleGone,
  chaseObstaclePastVehicle,
  chaseObstacleSpawnCentre,
  chaseObstacleSweep,
  chaseSpikesCrossed,
  chaseSpikesDropCentre,
  readChaseObstacleHp,
  readChaseObstacleName,
} from './chase-obstacles.js';
import { chaseBodyHalfExtents } from './chase.js';

const GRID = 100;
const FRAME = { width: 2400, height: 1800, gridSizePx: GRID, gridOffsetX: 0, gridOffsetY: 0 };
const RIGHT = { direction: 'right' as const, road: { from: 4, to: 14 }, tempo: 40, running: true };
const CAR = { widthSq: 3, lengthSq: 5 };
const BARRICADE = { widthSq: 4, lengthSq: 1 };

/** Auto w osiach sceny przy jeździe w prawo: dryf z `from` do `to`. */
function car(id: string, from: { x: number; y: number }, to = from) {
  return { id, from, to, ...chaseBodyHalfExtents(CAR, 'right', GRID) };
}

describe('wypuszczenie przeszkody (65e)', () => {
  it('staje przy przedniej krawędzi, w poprzek tam, gdzie kliknął MG, w pasie jezdni', () => {
    // Bryła barykady w prawo: 1 kratka wzdłuż (hx 50), 4 w poprzek (hy 200).
    expect(chaseObstacleSpawnCentre({ x: 300, y: 900 }, BARRICADE, RIGHT, FRAME)).toEqual({
      x: 2350,
      y: 900,
    });
    // Klik poza pasem — przycięta do pasa 400…1400.
    expect(chaseObstacleSpawnCentre({ x: 300, y: 100 }, BARRICADE, RIGHT, FRAME)).toEqual({
      x: 2350,
      y: 600,
    });
    expect(
      chaseObstacleSpawnCentre(
        { x: 700, y: 900 },
        BARRICADE,
        { direction: 'up', road: null },
        FRAME,
      ),
    ).toEqual({ x: 700, y: 50 });
  });

  it('dryf rundy: w tył o tempo / 4 kratek, droga stoi — przeszkoda też', () => {
    expect(chaseObstacleDrifted({ x: 2000, y: 900 }, RIGHT, GRID)).toEqual({ x: 1000, y: 900 });
    expect(chaseObstacleDrifted({ x: 2000, y: 900 }, { ...RIGHT, running: false }, GRID)).toEqual({
      x: 2000,
      y: 900,
    });
    expect(chaseObstacleDrifted({ x: 900, y: 500 }, { ...RIGHT, direction: 'up' }, GRID)).toEqual({
      x: 900,
      y: 1500,
    });
  });

  it('znika dopiero cała za tylną krawędzią', () => {
    expect(chaseObstacleGone({ x: 40, y: 900 }, BARRICADE, 'right', FRAME)).toBe(false);
    expect(chaseObstacleGone({ x: -50, y: 900 }, BARRICADE, 'right', FRAME)).toBe(true);
    expect(chaseObstacleGone({ x: 2450, y: 900 }, BARRICADE, 'right', FRAME)).toBe(false);
  });

  it('kolczatka nie zatrzymuje, reszta tak', () => {
    expect(chaseObstacleCollides('spikes')).toBe(false);
    expect(chaseObstacleCollides('barricade')).toBe(true);
    expect(CHASE_OBSTACLE_PRESETS.spikes.hp).toBe(0);
  });
});

describe('przecięcie toru przeszkody z bryłą auta (65e)', () => {
  const half = chaseBodyHalfExtents(BARRICADE, 'right', GRID);

  it('auto z prędkością pościgu spotyka przeszkodę — staje ona przy jego zderzaku', () => {
    // Auto (przód na x = 1250) stoi w kadrze, przeszkoda jedzie z 2000 do 1000.
    const hits = chaseObstacleSweep(
      { from: { x: 2000, y: 900 }, to: { x: 1000, y: 900 }, ...half },
      [car('a', { x: 1000, y: 900 })],
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]!.id).toBe('a');
    // Zderzak auta 1250 + połowa barykady 50 — z cofką o setną piksela.
    expect(hits[0]!.centre.x).toBeCloseTo(1300, 1);
    expect(hits[0]!.centre.y).toBe(900);
  });

  it('auto stojące na drodze (dryf w tył z pełnym tempem) nigdy w nią nie wjeżdża', () => {
    expect(
      chaseObstacleSweep({ from: { x: 2000, y: 900 }, to: { x: 1000, y: 900 }, ...half }, [
        car('a', { x: 1000, y: 900 }, { x: 0, y: 900 }),
      ]),
    ).toEqual([]);
  });

  it('auto wolniejsze od tempa zbliża się tylko o swój Ruch — przeszkoda daleko go mija', () => {
    // Kompakt Ruch 20: względnie przeszkoda jedzie tylko 5 kratek, a stoi 7 przed zderzakiem.
    expect(
      chaseObstacleSweep({ from: { x: 2000, y: 900 }, to: { x: 1000, y: 900 }, ...half }, [
        car('a', { x: 1000, y: 900 }, { x: 500, y: 900 }),
      ]),
    ).toEqual([]);
  });

  it('auto obok na innym pasie nie zatrzymuje przeszkody, a pierwsze trafione — tak', () => {
    const hits = chaseObstacleSweep(
      { from: { x: 2200, y: 900 }, to: { x: 1200, y: 900 }, ...half },
      [
        car('obok', { x: 1500, y: 400 }),
        car('dalej', { x: 1000, y: 900 }),
        car('blizej', { x: 1600, y: 900 }),
      ],
    );
    expect(hits.map((hit) => hit.id)).toEqual(['blizej', 'dalej']);
  });

  it('przeszkoda, która już zachodzi na auto, go nie trafia', () => {
    expect(
      chaseObstacleSweep({ from: { x: 1100, y: 900 }, to: { x: 100, y: 900 }, ...half }, [
        car('a', { x: 1000, y: 900 }),
      ]),
    ).toEqual([]);
  });

  it('po minięciu staje za tylnym zderzakiem auta', () => {
    const past = chaseObstaclePastVehicle(
      { x: 1300, y: 800, ...BARRICADE },
      { x: 1000, y: 900, ...CAR },
      'right',
      GRID,
    );
    expect(past.x).toBeCloseTo(1000 - 250 - 50 - 5);
    expect(past.y).toBe(800);
    const up = chaseObstaclePastVehicle(
      { x: 900, y: 300, ...BARRICADE },
      { x: 900, y: 1000, ...CAR },
      'up',
      GRID,
    );
    expect(up).toEqual({ x: 900, y: 1000 + 250 + 50 + 5 });
  });
});

describe('kolczatka (65e)', () => {
  it('ląduje tuż za tylnym zderzakiem, na środku auta', () => {
    expect(
      chaseSpikesDropCentre(
        { x: 1000, y: 900, ...CAR },
        CHASE_OBSTACLE_PRESETS.spikes,
        'right',
        GRID,
      ),
    ).toEqual({ x: 1000 - 250 - 50 - 5, y: 900 });
  });

  it('auto zrzucające kolczatkę jedzie od niej — tor się nie przecina', () => {
    const spikes = chaseSpikesDropCentre(
      { x: 1000, y: 900, ...CAR },
      CHASE_OBSTACLE_PRESETS.spikes,
      'right',
      GRID,
    );
    const half = chaseBodyHalfExtents(CHASE_OBSTACLE_PRESETS.spikes, 'right', GRID);
    expect(
      chaseObstacleSweep({ from: spikes, to: { x: spikes.x - 1000, y: spikes.y }, ...half }, [
        car('a', { x: 1000, y: 900 }),
      ]),
    ).toEqual([]);
    // Auto z tyłu z prędkością pościgu przejeżdża po niej.
    expect(
      chaseObstacleSweep({ from: spikes, to: { x: spikes.x - 1000, y: spikes.y }, ...half }, [
        car('b', { x: 200, y: 900 }),
      ]).map((hit) => hit.id),
    ).toEqual(['b']);
  });

  it('kierowca w turze przejeżdża po kolczatkach na swojej drodze', () => {
    const mover = chaseBodyHalfExtents(CAR, 'right', GRID);
    const half = chaseBodyHalfExtents(CHASE_OBSTACLE_PRESETS.spikes, 'right', GRID);
    const spikes = [
      { id: 'na-drodze', centre: { x: 1200, y: 900 }, ...half },
      { id: 'obok', centre: { x: 1200, y: 200 }, ...half },
      { id: 'pod-celem', centre: { x: 1600, y: 900 }, ...half },
    ];
    expect(chaseSpikesCrossed({ x: 600, y: 900 }, { x: 1500, y: 900 }, mover, spikes)).toEqual([
      'na-drodze',
      'pod-celem',
    ]);
  });
});

describe('łaty z drutu', () => {
  it('nazwa i PW', () => {
    expect(readChaseObstacleName('  Barykada  ')).toBe('Barykada');
    expect(readChaseObstacleName('   ')).toBeNull();
    expect(readChaseObstacleHp(30)).toBe(30);
    expect(readChaseObstacleHp(-1)).toBeNull();
    expect(readChaseObstacleHp(2.5)).toBeNull();
  });
});
