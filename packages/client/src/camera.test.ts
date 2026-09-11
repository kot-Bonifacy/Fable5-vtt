import { describe, expect, it } from 'vitest';
import {
  MAP_MAX_ZOOM,
  PLAYER_VIEW_SQUARES_AROUND,
  coverZoom,
  partyStart,
  startCamera,
} from './map/camera.js';

/**
 * Kamera gracza (zlecenie MG, 11.09.2026) — dwie obietnice, których w typach
 * nie widać, a które łatwo zepsuć jedną zamianą `min` na `max`:
 *
 *  1. **Ani piksela poza mapą.** Najmniejsze zbliżenie to takie, przy którym
 *     ekran w całości leży w mapie. `min` zamiast `max` w `coverZoom` daje
 *     kadr mieszczący całą mapę — i czarne pasy, których MG nie chce.
 *  2. **Osiem kratek wokół siebie**, licząc w węższym wymiarze ekranu. Przy
 *     liczeniu z szerokości gracz na szerokim oknie dostałby widok z lotu
 *     ptaka zamiast okolicy.
 */

/** Mapa powitalna po podmianie pliku 11.09: 2896 × 2176 px, kratka 72,4 px. */
const MAPA = { width: 2896, height: 2176, grid: { sizePx: 72.4 } };
/** Płótno mapy na oknie 1400 × 900 — tyle zostaje po panelu bocznym i HUD-zie. */
const EKRAN = { width: 1160, height: 780 };

describe('kamera gracza', () => {
  it('nie pozwala oddalić się na tyle, żeby zobaczyć czerń za mapą', () => {
    const zoom = coverZoom(MAPA, EKRAN);
    // Przy tym zbliżeniu widoczny kawałek świata jest nie większy niż mapa
    // w OBU wymiarach — to jest dokładnie „ani piksela poza mapą".
    expect(EKRAN.width / zoom).toBeLessThanOrEqual(MAPA.width + 0.001);
    expect(EKRAN.height / zoom).toBeLessThanOrEqual(MAPA.height + 0.001);
    // I jeden z wymiarów wypełnia mapę co do piksela — dalej się nie da.
    const dopasowane =
      Math.abs(EKRAN.width / zoom - MAPA.width) < 0.001 ||
      Math.abs(EKRAN.height / zoom - MAPA.height) < 0.001;
    expect(dopasowane).toBe(true);
  });

  it('startuje przybliżony na osiem kratek wokół punktu — w węższym wymiarze', () => {
    const shot = startCamera(MAPA, EKRAN, { x: 1448, y: 1088 });
    const widoczneKratkiWPionie = EKRAN.height / shot.zoom / MAPA.grid.sizePx;
    expect(widoczneKratkiWPionie).toBeCloseTo(PLAYER_VIEW_SQUARES_AROUND * 2 + 1, 6);
    // W szerszym wymiarze wychodzi więcej i to jest w porządku: „niewiele
    // więcej niż 8 kratek wokół siebie" mówi o promieniu, nie o kadrze.
    expect(EKRAN.width / shot.zoom / MAPA.grid.sizePx).toBeGreaterThan(widoczneKratkiWPionie);
  });

  it('nie zbliża się mniej, niż wymaga pokrycie ekranu mapą', () => {
    // Mapa mniejsza niż jeden kadr „8 kratek wokół": pokrycie wygrywa.
    const mala = { width: 400, height: 300, grid: { sizePx: 10 } };
    const shot = startCamera(mala, EKRAN, { x: 200, y: 150 });
    expect(shot.zoom).toBeGreaterThanOrEqual(coverZoom(mala, EKRAN));
    expect(shot.zoom).toBeLessThanOrEqual(MAP_MAX_ZOOM);
  });

  it('wpisuje kadr w mapę, więc punkt przy krawędzi nie odsłania czerni', () => {
    const shot = startCamera(MAPA, EKRAN, { x: 0, y: MAPA.height });
    const polSzerokosci = EKRAN.width / shot.zoom / 2;
    const polWysokosci = EKRAN.height / shot.zoom / 2;
    expect(shot.x - polSzerokosci).toBeGreaterThanOrEqual(-0.001);
    expect(shot.y + polWysokosci).toBeLessThanOrEqual(MAPA.height + 0.001);
  });

  it('nie zwija mapy do punktu, gdy płótno nie ma jeszcze rozmiaru', () => {
    const shot = startCamera(MAPA, { width: 0, height: 0 }, { x: 10, y: 10 });
    expect(shot.zoom).toBeGreaterThan(0);
    expect(Number.isFinite(shot.x)).toBe(true);
    expect(Number.isFinite(shot.y)).toBe(true);
  });

  it('bez figury i bez punktu MG patrzy się ze środka dolnej krawędzi', () => {
    expect(partyStart(MAPA, null)).toEqual({ x: MAPA.width / 2, y: MAPA.height });
  });

  it('punkt wyznaczony przez MG wygrywa z domyślnym dołem mapy', () => {
    const wyznaczony = { x: 100, y: 200 };
    expect(partyStart(MAPA, wyznaczony)).toEqual(wyznaczony);
  });
});
