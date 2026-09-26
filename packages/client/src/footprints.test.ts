import { describe, expect, it } from 'vitest';
import { placeFootprints, trailFadeStrength, type FootprintOptions } from './map/footprints.js';

const OPTIONS: FootprintOptions = { stepPx: 50, offsetPx: 13, turnPx: 75, max: 160 };

/** Smallest angle between two headings, in radians. */
function turn(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

describe('placeFootprints', () => {
  it('stawia odcisk co krok trasy, na przemian prawy i lewy', () => {
    const prints = placeFootprints(
      [
        { x: 0, y: 0 },
        { x: 500, y: 0 },
      ],
      OPTIONS,
    );
    expect(prints.map((p) => p.along)).toEqual([50, 100, 150, 200, 250, 300, 350, 400, 450, 500]);
    expect(prints.map((p) => p.side)).toEqual([1, -1, 1, -1, 1, -1, 1, -1, 1, -1]);
    // Idąc w prawo (+x), prawa ręka jest w dół ekranu (+y).
    expect(prints[0]!.y).toBeCloseTo(13);
    expect(prints[1]!.y).toBeCloseTo(-13);
    for (const print of prints) expect(print.heading).toBeCloseTo(0);
  });

  it('liczy metry po trasie, nie po zaokrąglonej linii', () => {
    const route = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 300 },
    ];
    const prints = placeFootprints(route, OPTIONS);
    expect(prints).toHaveLength(12);
    expect(prints.at(-1)!.along).toBeCloseTo(600);
  });

  it('skręca łukiem — żaden krok nie obraca buta o cały róg', () => {
    const prints = placeFootprints(
      [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 300 },
      ],
      OPTIONS,
    );
    expect(prints[0]!.heading).toBeCloseTo(0);
    expect(prints.at(-1)!.heading).toBeCloseTo(Math.PI / 2);
    const swings = prints.slice(1).map((p, i) => turn(p.heading, prints[i]!.heading));
    expect(Math.max(...swings)).toBeLessThan(Math.PI / 4);
    // Obrót rozkłada się na kilka kroków, a nie zbiera w jednym.
    expect(swings.filter((s) => s > 0.05).length).toBeGreaterThanOrEqual(3);
  });

  it('nie zbija butów po wewnętrznej stronie zakrętu', () => {
    const prints = placeFootprints(
      [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 300 },
      ],
      OPTIONS,
    );
    for (let i = 2; i < prints.length; i++) {
      // Ta sama stopa dwa kroki dalej — nigdy blisko siebie.
      const a = prints[i - 2]!;
      const b = prints[i]!;
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(OPTIONS.stepPx);
    }
  });

  it('wygładza drżenie ciągniętej myszy', () => {
    const jitter = Array.from({ length: 101 }, (_, i) => ({ x: i * 5, y: i % 2 === 0 ? 0 : 6 }));
    const prints = placeFootprints(jitter, OPTIONS);
    for (const print of prints.slice(0, -1)) expect(Math.abs(print.heading)).toBeLessThan(0.1);
  });

  it('zostawia pustą listę dla trasy bez długości i pilnuje sufitu', () => {
    expect(placeFootprints([{ x: 1, y: 1 }], OPTIONS)).toEqual([]);
    expect(
      placeFootprints(
        [
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ],
        OPTIONS,
      ),
    ).toEqual([]);
    const long = placeFootprints(
      [
        { x: 0, y: 0 },
        { x: 100000, y: 0 },
      ],
      OPTIONS,
    );
    expect(long).toHaveLength(160);
  });
});

describe('placeFootprints — marsz w toku', () => {
  const plan = [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 300 },
  ];

  it('stawia odciski tylko do miejsca, w którym jest figura', () => {
    const prints = placeFootprints(plan, { ...OPTIONS, untilPx: 320 });
    expect(prints.map((p) => p.along)).toEqual([50, 100, 150, 200, 250, 300]);
  });

  it('odcisk tuż za rogiem nie przesuwa się, gdy figura idzie dalej', () => {
    const early = placeFootprints(plan, { ...OPTIONS, untilPx: 360 });
    const later = placeFootprints(plan, { ...OPTIONS, untilPx: 600 });
    early.forEach((print, i) => {
      expect(later[i]!.x).toBeCloseTo(print.x);
      expect(later[i]!.y).toBeCloseTo(print.y);
      expect(later[i]!.heading).toBeCloseTo(print.heading);
    });
  });
});

describe('trailFadeStrength', () => {
  const fade = (metres: number, elapsed: number) =>
    trailFadeStrength(metres, 10, elapsed, 0.2, 0.3);

  it('trzyma cały ślad w pełnej sile, zanim zacznie gasnąć', () => {
    for (const metres of [0, 5, 10]) expect(fade(metres, 0.2)).toBe(1);
  });

  it('gasi od najstarszego odcisku do najnowszego', () => {
    for (const elapsed of [0.3, 0.5, 0.7, 0.9]) {
      const oldest = fade(1, elapsed);
      const middle = fade(5, elapsed);
      const newest = fade(10, elapsed);
      expect(oldest).toBeLessThanOrEqual(middle);
      expect(middle).toBeLessThanOrEqual(newest);
    }
    expect(fade(1, 0.5)).toBe(0);
    expect(fade(10, 0.5)).toBe(1);
  });

  it('kończy na zerze razem z życiem śladu', () => {
    expect(fade(10, 1)).toBe(0);
    expect(fade(10, 0.95)).toBeGreaterThan(0);
  });
});
