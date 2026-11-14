import { describe, expect, it } from 'vitest';
import { netSightingText, sightingText } from './foe-sighting.js';

describe('wezwanie MG po zauważeniu wroga (etap 56)', () => {
  it('jeden widzi jednego', () => {
    expect(sightingText(['Vex'], ['Bandzior'])).toBe(
      'Vex widzi wroga: Bandzior. Drużyna stoi, dopóki nie zdecydujesz.',
    );
  });

  it('kilku widzi kilku — liczba mnoga po obu stronach', () => {
    expect(sightingText(['Vex', 'Kowal', 'Ola'], ['Bandzior', 'Zbir'])).toBe(
      'Vex, Kowal i Ola widzą wrogów: Bandzior, Zbir. Drużyna stoi, dopóki nie zdecydujesz.',
    );
  });

  it('bez nazwanego obserwatora mówi „Drużyna”', () => {
    expect(sightingText([], ['Bandzior'])).toMatch(/^Drużyna widzi wroga: Bandzior\./);
  });
});

describe('wezwanie MG po wykryciu w Sieci (decyzja MG z 14.11)', () => {
  it('LOD wykrył netrunnera', () => {
    expect(netSightingText(['Kolec'], { foes: ['Sowa'], traces: false })).toBe(
      'Kolec — wykrycie w Sieci: Sowa. Drużyna stoi, dopóki nie zdecydujesz.',
    );
  });

  it('samo nieudane Maskowanie', () => {
    expect(netSightingText(['Kolec'], { foes: [], traces: true })).toBe(
      'Kolec — Maskowanie nieudane, ślady zostały w Sieci. Drużyna stoi, dopóki nie zdecydujesz.',
    );
  });

  it('jedno i drugie w jednym starciu', () => {
    expect(netSightingText(['Kolec'], { foes: ['Sowa', 'Mur'], traces: true })).toBe(
      'Kolec — wykrycie w Sieci: Sowa, Mur. Maskowanie też nieudane. Drużyna stoi, dopóki nie zdecydujesz.',
    );
  });
});
