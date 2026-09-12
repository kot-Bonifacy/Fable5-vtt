import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isHeldEscapeRepeat,
  opensFullscreen,
  shouldArmAutoEntry,
  type AutoEntryState,
} from './fullscreen.js';

/**
 * Pełny ekran (zlecenie MG z 12.09).
 *
 * Samego `requestFullscreen` nie da się tu sprawdzić — testy chodzą bez DOM-u,
 * a przeglądarka i tak odmówiłaby bez prawdziwego gestu. Sprawdzane są więc
 * decyzje, które wokół niego zapadają, i trzy miejsca, w których gest istnieje.
 */

const ARMED: AutoEntryState = {
  preferred: true,
  authenticated: true,
  supported: true,
  fullscreen: false,
  spent: false,
};

describe('pełny ekran po odświeżeniu strony', () => {
  it('zalogowany, który go chce, dostaje go przy pierwszym geście', () => {
    expect(shouldArmAutoEntry(ARMED)).toBe(true);
  });

  it('kto sam wyszedł z pełnego ekranu, nie zostaje wciągnięty z powrotem', () => {
    // Bez tego wyjście byłoby niemożliwe: Esc zdejmuje pełny ekran, a następne
    // kliknięcie w mapę zakładałoby go od nowa.
    expect(shouldArmAutoEntry({ ...ARMED, spent: true })).toBe(false);
  });

  it('ekran logowania nie czeka na gest — gestem jest samo „Zaloguj się"', () => {
    expect(shouldArmAutoEntry({ ...ARMED, authenticated: false })).toBe(false);
  });

  it('nie czeka, gdy nikt go nie chce, już jest albo przeglądarka go nie ma', () => {
    expect(shouldArmAutoEntry({ ...ARMED, preferred: false })).toBe(false);
    expect(shouldArmAutoEntry({ ...ARMED, fullscreen: true })).toBe(false);
    expect(shouldArmAutoEntry({ ...ARMED, supported: false })).toBe(false);
  });

  it('Esc niczego nie otwiera — kliknięcie i każdy inny klawisz tak', () => {
    expect(opensFullscreen({ type: 'keydown', key: 'Escape' })).toBe(false);
    expect(opensFullscreen({ type: 'keydown', key: 'a' })).toBe(true);
    expect(opensFullscreen({ type: 'pointerdown' })).toBe(true);
  });
});

describe('Esc w pełnym ekranie', () => {
  it('przytrzymany Esc nie schodzi po drabinie wyjścia, zanim pełny ekran zniknie', () => {
    expect(isHeldEscapeRepeat({ key: 'Escape', repeat: true }, true)).toBe(true);
  });

  it('pojedyncze wciśnięcie zostaje dla VTT', () => {
    expect(isHeldEscapeRepeat({ key: 'Escape', repeat: false }, true)).toBe(false);
  });

  it('poza pełnym ekranem drabina działa jak dotąd, także przytrzymana', () => {
    expect(isHeldEscapeRepeat({ key: 'Escape', repeat: true }, false)).toBe(false);
  });

  it('inne przytrzymane klawisze przechodzą', () => {
    expect(isHeldEscapeRepeat({ key: 'Shift', repeat: true }, true)).toBe(false);
  });
});

describe('gdzie pełny ekran ma swój gest', () => {
  const read = (...path: string[]) => readFileSync(join(import.meta.dirname, ...path), 'utf8');

  /**
   * Gestem jest kliknięcie w formularzu, a odpowiedź serwera już go nie niesie:
   * wywołanie po `await` działa w Chrome i przepada w Firefoksie, gdy serwer
   * się zamyśli. Test pilnuje kolejności, nie samej obecności.
   */
  it.each([
    ['LoginPage.tsx', 'async function handleSubmit', 'await loginGm'],
    ['JoinPage.tsx', 'async function join', 'await joinCampaign'],
  ])('%s wchodzi w pełny ekran przed czekaniem na serwer', (file, start, wait) => {
    const source = read('pages', file);
    const body = source.slice(source.indexOf(start));
    const entry = body.indexOf('enterPreferredFullscreen()');
    expect(entry, 'brak wejścia w pełny ekran').toBeGreaterThan(0);
    expect(entry, 'wejście po `await` przepada w Firefoksie').toBeLessThan(body.indexOf(wait));
  });

  it('wylogowanie wraca do okna', () => {
    const source = read('stores', 'authStore.ts');
    expect(source.slice(source.indexOf('logout: async'))).toContain('leaveFullscreenOnLogout()');
  });

  it('automat i blokada Esc siedzą w korzeniu aplikacji, nie w jednej trasie', () => {
    const source = read('App.tsx');
    const root = source.slice(source.indexOf('export function App()'));
    expect(root).toContain('useFullscreen(');
  });
});
