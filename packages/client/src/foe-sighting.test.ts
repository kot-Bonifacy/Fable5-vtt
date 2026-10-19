import { describe, expect, it } from 'vitest';
import { sightingText } from './foe-sighting.js';

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
