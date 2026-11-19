import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../dice.js';
import { buildCpredRegistry, createDefaultCharacterData, type CpredRegistry } from './character.js';
import {
  CPRED_BRAKE_STEP,
  CPRED_GAS_STEP,
  CPRED_RACE_BONUS_MAX,
  cpredCanSlowBehind,
  cpredDriveAdvance,
  cpredLostControlMove,
  cpredMphToSpeed,
  cpredPedalProblem,
  cpredPedalSpeed,
  cpredRaceBonuses,
  cpredRaceRollers,
  cpredRoadSquaresPerRound,
  cpredSheetWeakDriver,
  cpredSlowBehindSpeed,
  cpredSpeedMph,
  cpredStartSpeed,
  cpredWeakDriver,
} from './chase-drive.js';
import { planCpredRoll } from './rolls.js';

/**
 * Jazda w pościgu od etapu 72a — liczby CP RED nowego modelu (prędkość, pedały,
 * Wyścig, utrata kontroli). Przykład rundy z pliku etapu (punkt 1) jest testem
 * `cpredDriveAdvance` niżej, żeby projekt i kod się nie rozjechały.
 */

const registry: CpredRegistry = buildCpredRegistry(
  {
    skills: [
      { id: 'driving', name: 'Prowadzenie pojazdów', stat: 'ref' },
      { id: 'pilot-sea-vehicle', name: 'Żeglowanie', stat: 'ref' },
    ],
  },
  { roles: [{ id: 'nomad', name: 'Nomada', ability: 'Moto' }] },
);

function sheet(roleId: string | null, rank: number, extra: Record<string, unknown> = {}) {
  return { ...createDefaultCharacterData(), roleId, roleAbilityRank: rank, ...extra };
}

describe('prędkość w mil/h', () => {
  it('Ruch × 5 dla każdego pojazdu — kompakt 100, sportowy 200, supersamochód 300', () => {
    expect(cpredSpeedMph(20)).toBe(100);
    expect(cpredSpeedMph(40)).toBe(200);
    expect(cpredSpeedMph(60)).toBe(300);
    expect(cpredSpeedMph(-5)).toBe(0);
  });

  it('pole MG w mil/h wraca do Ruchu z zaokrągleniem', () => {
    expect(cpredMphToSpeed(150)).toBe(30);
    expect(cpredMphToSpeed(152)).toBe(30);
    expect(cpredMphToSpeed(-10)).toBe(0);
    expect(cpredMphToSpeed(Number.NaN)).toBe(0);
  });
});

describe('pedały', () => {
  it('gaz +10 Ruchu najwyżej do maksimum, hamulec −20 najniżej do zera', () => {
    expect(cpredPedalSpeed(30, 40, 'gas')).toBe(30 + CPRED_GAS_STEP);
    expect(cpredPedalSpeed(35, 40, 'gas')).toBe(40);
    expect(cpredPedalSpeed(30, 40, 'brake')).toBe(30 - CPRED_BRAKE_STEP);
    expect(cpredPedalSpeed(10, 40, 'brake')).toBe(0);
    expect(cpredPedalSpeed(30, 40, null)).toBe(30);
  });

  it('prędkość ponad Ruchem (po zmianie auta) przycina się do maksimum', () => {
    expect(cpredPedalSpeed(60, 40, null)).toBe(40);
    expect(cpredPedalSpeed(60, 40, 'brake')).toBe(20);
  });

  it('gaz wyszarzony przy maksimum, hamulec na postoju', () => {
    expect(cpredPedalProblem(40, 40, 'gas')).toBe('AT_MAX_SPEED');
    expect(cpredPedalProblem(30, 40, 'gas')).toBeNull();
    expect(cpredPedalProblem(0, 40, 'brake')).toBe('STANDING');
    expect(cpredPedalProblem(10, 40, 'brake')).toBeNull();
  });

  it('prędkość startowa: najwyżej Ruch, tylko auto z kierowcą i silnikiem', () => {
    const on = { started: true, driven: true, wrecked: false };
    expect(cpredStartSpeed(20, 30, on)).toBe(20);
    expect(cpredStartSpeed(40, 30, on)).toBe(30);
    expect(cpredStartSpeed(40, 30, { ...on, started: false })).toBe(0);
    expect(cpredStartSpeed(40, 30, { ...on, driven: false })).toBe(0);
    expect(cpredStartSpeed(40, 30, { ...on, wrecked: true })).toBe(0);
  });
});

describe('przesunięcie w turze kierowcy', () => {
  it('przykład rundy z pliku etapu (prędkość pościgu 150 mil/h)', () => {
    const pursuit = cpredMphToSpeed(150);
    // Włóczęga: 150 → gaz → 200, zryw +2.
    const wanderer = cpredPedalSpeed(30, 40, 'gas');
    expect(cpredSpeedMph(wanderer)).toBe(200);
    expect(cpredDriveAdvance({ speed: wanderer, pursuitSpeed: pursuit, raceBonus: 2 })).toBe(4.5);
    // Furgon: 150 bez pedału, zryw 0 — stoi w kadrze.
    expect(cpredDriveAdvance({ speed: 30, pursuitSpeed: pursuit })).toBe(0);
    // Radiowóz: 200, zryw +1.
    expect(cpredDriveAdvance({ speed: 40, pursuitSpeed: pursuit, raceBonus: 1 })).toBe(3.5);
    // Następna runda: pościg 200 mil/h — furgon traci 2,5 kratki na turę.
    expect(cpredDriveAdvance({ speed: 30, pursuitSpeed: 40 })).toBe(-2.5);
  });

  it('Nitro dokłada jednorazowo Ruch / 4', () => {
    expect(cpredDriveAdvance({ speed: 20, pursuitSpeed: 20, nitroMove: 20 })).toBe(5);
  });

  it('auto stojące odpływa w tył o prędkość pościgu / 4', () => {
    expect(cpredDriveAdvance({ speed: 0, pursuitSpeed: 40 })).toBe(-10);
  });

  it('po drodze w rundzie auto przejeżdża prędkość / 4', () => {
    expect(cpredRoadSquaresPerRound(30)).toBe(7.5);
    expect(cpredRoadSquaresPerRound(-1)).toBe(0);
  });
});

describe('Wyścig — zryw', () => {
  it('1 kratka za 2 punkty przewagi nad najsłabszym, sufit 5', () => {
    const results = cpredRaceBonuses([
      { id: 'a', total: 20, weak: false },
      { id: 'b', total: 15, weak: false },
      { id: 'c', total: 12, weak: false },
      { id: 'd', total: 40, weak: false },
    ]);
    expect(results.a).toEqual({ bonus: 4, lostControl: false });
    expect(results.b).toEqual({ bonus: 1, lostControl: false });
    expect(results.c).toEqual({ bonus: 0, lostControl: false });
    expect(results.d!.bonus).toBe(CPRED_RACE_BONUS_MAX);
  });

  it('remis na dole: obaj najsłabsi mają 0', () => {
    const results = cpredRaceBonuses([
      { id: 'a', total: 14, weak: false },
      { id: 'b', total: 14, weak: false },
    ]);
    expect(results.a!.bonus).toBe(0);
    expect(results.b!.bonus).toBe(0);
  });

  it('jeden kierowca — zrywu nie ma', () => {
    expect(cpredRaceBonuses([{ id: 'a', total: 25, weak: false }]).a!.bonus).toBe(0);
    expect(cpredRaceBonuses([])).toEqual({});
  });

  it('słaby kierowca z wynikiem nie wyższym niż PT 10 traci kontrolę i zrywu nie ma', () => {
    const results = cpredRaceBonuses([
      { id: 'weak', total: 10, weak: true },
      { id: 'ok', total: 18, weak: false },
    ]);
    expect(results.weak).toEqual({ bonus: 0, lostControl: true });
    // Jego wynik dalej jest najniższym dla reszty.
    expect(results.ok).toEqual({ bonus: 4, lostControl: false });
  });

  it('słaby kierowca, który zdał jazdę, ściga się normalnie', () => {
    const results = cpredRaceBonuses([
      { id: 'weak', total: 15, weak: true },
      { id: 'ok', total: 11, weak: false },
    ]);
    expect(results.weak).toEqual({ bonus: 2, lostControl: false });
  });

  it('kierowca bez karty (weak: false) od samego rzutu kontroli nie traci', () => {
    const results = cpredRaceBonuses([
      { id: 'statist', total: 3, weak: false },
      { id: 'ok', total: 11, weak: false },
    ]);
    expect(results.statist).toEqual({ bonus: 0, lostControl: false });
  });
});

describe('Wyścig — kto rzuca', () => {
  it('dwóch i więcej kierowców — wszyscy', () => {
    const drivers = [
      { id: 'a', weak: false },
      { id: 'b', weak: true },
    ];
    expect(cpredRaceRollers(drivers)).toEqual(drivers);
  });

  it('jedno auto — rzuca tylko słaby kierowca, jako Test zwykłej jazdy (MG 19.11)', () => {
    expect(cpredRaceRollers([{ id: 'a', weak: false }])).toEqual([]);
    const weak = [{ id: 'a', weak: true }];
    expect(cpredRaceRollers(weak)).toEqual(weak);
    expect(cpredRaceBonuses([{ id: 'a', total: 9, weak: true }]).a).toEqual({
      bonus: 0,
      lostControl: true,
    });
    expect(cpredRaceRollers([])).toEqual([]);
  });
});

describe('słaby kierowca — próg z Moto (NOM-03)', () => {
  it('REF + Umiejętność + Moto ≤ 9', () => {
    expect(cpredWeakDriver(5, 4)).toBe(true);
    expect(cpredWeakDriver(5, 5)).toBe(false);
    expect(cpredWeakDriver(5, 3, 1)).toBe(true);
    expect(cpredWeakDriver(5, 4, 1)).toBe(false);
  });

  it('NOM-03 Nomada z REF 5, Prowadzeniem 4 i Moto 1 nie jest słabym kierowcą', () => {
    const nomad = sheet('nomad', 1, { skills: { driving: 4 } });
    expect(nomad.stats.ref).toBe(5);
    expect(cpredSheetWeakDriver(nomad, registry, 'car')).toBe(false);
    const plain = sheet(null, 0, { skills: { driving: 4 } });
    expect(cpredSheetWeakDriver(plain, registry, 'car')).toBe(true);
  });

  it('próg czyta te same liczby, które planer kładzie w Teście prowadzenia', () => {
    const nomad = sheet('nomad', 2, { skills: { driving: 2 } });
    const planned = planCpredRoll(nomad, registry, { kind: 'skill', skillId: 'driving' });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.modifierTotal).toBe(5 + 2 + 2);
    expect(cpredSheetWeakDriver(nomad, registry, 'car')).toBe(planned.plan.modifierTotal <= 9);
  });

  it('łódź liczy Żeglowanie, nie Prowadzenie', () => {
    const sailor = sheet(null, 0, { skills: { driving: 8, 'pilot-sea-vehicle': 1 } });
    expect(cpredSheetWeakDriver(sailor, registry, 'boat')).toBe(true);
    expect(cpredSheetWeakDriver(sailor, registry, 'car')).toBe(false);
  });
});

describe('utrata kontroli', () => {
  const fixed = (value: number) => () => value;

  it('prędkość −10 Ruchu, 1k6: 1–2 pas wyżej, 3–4 prosto, 5–6 pas niżej', () => {
    expect(cpredLostControlMove(30, fixed(1))).toEqual({ speed: 20, laneDelta: -1, die: 1 });
    expect(cpredLostControlMove(30, fixed(2)).laneDelta).toBe(-1);
    expect(cpredLostControlMove(30, fixed(3)).laneDelta).toBe(0);
    expect(cpredLostControlMove(30, fixed(4)).laneDelta).toBe(0);
    expect(cpredLostControlMove(30, fixed(5)).laneDelta).toBe(1);
    expect(cpredLostControlMove(30, fixed(6)).laneDelta).toBe(1);
  });

  it('prędkość nie spada poniżej zera', () => {
    expect(cpredLostControlMove(5, fixed(3)).speed).toBe(0);
  });

  it('rzuca dokładnie jedną kością k6 z wstrzykniętego RNG', () => {
    const sides: number[] = [];
    const rng = createSeededRng(7);
    const outcome = cpredLostControlMove(20, (n) => {
      sides.push(n);
      return rng(n);
    });
    expect(sides).toEqual([6]);
    expect(outcome.die).toBeGreaterThanOrEqual(1);
    expect(outcome.die).toBeLessThanOrEqual(6);
  });
});

describe('„Zwolnij za nim”', () => {
  it('dostępne, gdy różnica prędkości mieści się w zwykłym hamulcu (100 mil/h)', () => {
    expect(cpredCanSlowBehind(40, 20)).toBe(true);
    expect(cpredCanSlowBehind(40, 19)).toBe(false);
    expect(cpredCanSlowBehind(20, 40)).toBe(true);
    expect(cpredCanSlowBehind(30, 0)).toBe(false);
  });

  it('auto przyjmuje prędkość blokującego, najwyżej swój Ruch', () => {
    expect(cpredSlowBehindSpeed(25, 40)).toBe(25);
    expect(cpredSlowBehindSpeed(60, 40)).toBe(40);
    expect(cpredSlowBehindSpeed(-5, 40)).toBe(0);
  });
});
