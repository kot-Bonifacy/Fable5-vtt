import { describe, expect, it } from 'vitest';
import {
  GRID_CONTRAST_CASING_PX,
  GRID_CONTRAST_MIN_ALPHA,
  gridLinePositions,
  gridShownTo,
  gridStrokes,
  isLightColor,
  parseGridColor,
} from './map/grid-style.js';

/**
 * Kontrastowa siatka przy edycji sceny (zlecenie MG, 12.09.2026).
 *
 * Wymóg brzmiał: siatka nie musi trafiać w mapę idealnie, ale MG ma sam
 * zauważyć rozjazd przed aktywacją sceny. Na oględzinach czarna siatka 35%
 * na ciemnej mapie Night City była ledwo widoczna — te testy pilnują, żeby
 * tryb roboczy był czytelny na każdym tle i żeby bez niego siatka wyglądała
 * dokładnie tak, jak MG ją zapisał.
 */
describe('wygląd siatki', () => {
  it('bez kontrastu rysuje jedną kreskę w kolorze i kryciu sceny', () => {
    expect(gridStrokes({ color: '#000000', alpha: 0.35 }, false, 4)).toEqual([
      { color: 0x000000, alpha: 0.35 },
    ]);
  });

  it('czarna siatka dostaje białą obwódkę pod spodem i pełną kreskę na wierzchu', () => {
    const [casing, line] = gridStrokes({ color: '#000000', alpha: 0.1 }, true, 1);
    expect(casing).toMatchObject({ color: 0xffffff });
    expect(line).toEqual({ color: 0x000000, alpha: GRID_CONTRAST_MIN_ALPHA });
  });

  it('jasna siatka dostaje czarną obwódkę', () => {
    expect(gridStrokes({ color: '#ffffff', alpha: 0.5 }, true, 1)[0]?.color).toBe(0x000000);
    expect(gridStrokes({ color: '#ffd400', alpha: 0.5 }, true, 1)[0]?.color).toBe(0x000000);
    expect(gridStrokes({ color: '#1e3a8a', alpha: 0.5 }, true, 1)[0]?.color).toBe(0xffffff);
  });

  it('obwódka ma stałą grubość na ekranie, niezależnie od zbliżenia', () => {
    // Mapa 4096 px oglądana w 0,25× — piksel ekranu to 4 piksele świata.
    expect(gridStrokes({ color: '#000000', alpha: 0.35 }, true, 4)[0]?.width).toBe(
      GRID_CONTRAST_CASING_PX * 4,
    );
    // Kreska na wierzchu zostaje linią jednego piksela ekranu.
    expect(gridStrokes({ color: '#000000', alpha: 0.35 }, true, 4)[1]?.width).toBeUndefined();
  });

  it('nie obniża krycia, które MG ustawił wyżej niż próg', () => {
    expect(gridStrokes({ color: '#000000', alpha: 1 }, true, 1)[1]?.alpha).toBe(1);
  });

  it('kolor spoza formatu to czerń, jak domyślna siatka', () => {
    expect(parseGridColor('zielony')).toBe(0);
    expect(parseGridColor('#00ff00')).toBe(0x00ff00);
    expect(isLightColor(0x777777)).toBe(true);
    expect(isLightColor(0x666666)).toBe(false);
  });
});

/**
 * Linie na brzegu mapy odpadają (zlecenie MG, 18.09.2026): u gracza z kamerą
 * dociśniętą do krawędzi kreska leżąca na brzegu obrazu wyglądała jak ramka
 * wystająca poza mapę.
 */
describe('gridLinePositions', () => {
  it('pomija linię na lewym brzegu przy zerowym przesunięciu', () => {
    expect(gridLinePositions(0, 100, 400)).toEqual([100, 200, 300]);
  });

  it('pomija linię na prawym brzegu, także gdy kratka nie sumuje się co do piksela', () => {
    const lines = gridLinePositions(0, 36.2, 1448);
    expect(lines).toHaveLength(39);
    expect(lines[38]).toBeCloseTo(36.2 * 39, 6);
  });

  it('zostawia linie przesunięte od brzegu', () => {
    expect(gridLinePositions(50, 100, 400)).toEqual([50, 150, 250, 350]);
  });

  it('nie rysuje nic dla kratki bez rozmiaru', () => {
    expect(gridLinePositions(0, 0, 400)).toEqual([]);
  });
});

/**
 * Siatka u gracza (zlecenie MG, 15.10.2026): domyślnie jej nie widzi, dopóki
 * MG nie wybierze w oknie sceny „MG i gracze”.
 */
describe('gridShownTo', () => {
  const scene = (visible: boolean, players: boolean, gridMode: 'grid' | 'gridless' = 'grid') => ({
    gridMode,
    grid: { visible, players },
  });

  it('domyślnie („Tylko MG”) siatkę widzi MG, a gracz nie', () => {
    expect(gridShownTo(scene(true, false), true)).toBe(true);
    expect(gridShownTo(scene(true, false), false)).toBe(false);
  });

  it('„MG i gracze” pokazuje ją obu', () => {
    expect(gridShownTo(scene(true, true), true)).toBe(true);
    expect(gridShownTo(scene(true, true), false)).toBe(true);
  });

  it('„Nikt” i scena bez kratek gaszą ją wszystkim', () => {
    expect(gridShownTo(scene(false, true), true)).toBe(false);
    expect(gridShownTo(scene(false, true), false)).toBe(false);
    expect(gridShownTo(scene(true, true, 'gridless'), true)).toBe(false);
    expect(gridShownTo(scene(true, true, 'gridless'), false)).toBe(false);
  });
});
