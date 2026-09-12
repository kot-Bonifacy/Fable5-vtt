import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRID,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  SCENE_DIMENSION_MAX,
  SCENE_DIMENSION_MIN,
  gridCellsAlong,
  gridSizeForColumns,
  normalizeGridOffset,
  sanitizeSceneName,
  sanitizeScenePatch,
} from './scenes.js';

describe('gridSizeForColumns', () => {
  it('dzieli mapę z paczki na kolumny podane w nazwie pliku', () => {
    // „StrefaPrzemysłowa" w wgranej wersji: 1448 × 1086, skala 40 × 30.
    const size = gridSizeForColumns(1448, 40);
    expect(size).toBeCloseTo(36.2, 9);
    expect(gridCellsAlong(1086, size!)).toBeCloseTo(30, 9);
  });

  it('liczy z kolumn, gdy plik nie dzieli się równo na obie osie', () => {
    // Pełna rozdzielczość tej samej mapy: w pionie zostają 4 px reszty, więc
    // wiersze wychodzą ułamkiem — i to jest podpowiedź, nie błąd.
    const size = gridSizeForColumns(2896, 40)!;
    expect(size).toBeCloseTo(72.4, 9);
    expect(gridCellsAlong(2176, size)).toBeCloseTo(30.055, 3);
  });

  it('przycina kratkę do granic, które nałożyłby serwer', () => {
    expect(gridSizeForColumns(400, 100)).toBe(GRID_SIZE_MIN);
    expect(gridSizeForColumns(4096, 1)).toBe(GRID_SIZE_MAX);
  });

  it('odmawia, gdy z danych nie da się kratki policzyć', () => {
    expect(gridSizeForColumns(1448, 0)).toBeNull();
    expect(gridSizeForColumns(1448, -4)).toBeNull();
    expect(gridSizeForColumns(1448, 40.5)).toBeNull();
    expect(gridSizeForColumns(0, 40)).toBeNull();
    expect(gridSizeForColumns(Number.NaN, 40)).toBeNull();
  });

  it('nie dzieli przez zero przy liczeniu wierszy', () => {
    expect(gridCellsAlong(1086, 0)).toBe(0);
  });
});

describe('sanitizeSceneName', () => {
  it('trims and accepts a normal name', () => {
    expect(sanitizeSceneName('  Ulice Night City  ')).toBe('Ulice Night City');
  });

  it('rejects empty, non-string and overlong names', () => {
    expect(sanitizeSceneName('')).toBeNull();
    expect(sanitizeSceneName('   ')).toBeNull();
    expect(sanitizeSceneName(42)).toBeNull();
    expect(sanitizeSceneName('x'.repeat(65))).toBeNull();
  });
});

describe('sanitizeScenePatch', () => {
  it('rejects non-object patches', () => {
    expect(sanitizeScenePatch(null)).toBeNull();
    expect(sanitizeScenePatch('grid')).toBeNull();
  });

  it('rejects a patch with an invalid name', () => {
    expect(sanitizeScenePatch({ name: '   ' })).toBeNull();
  });

  it('clamps scene dimensions and rounds to integers', () => {
    expect(sanitizeScenePatch({ width: 10, height: 99999.7 })).toEqual({
      width: SCENE_DIMENSION_MIN,
      height: SCENE_DIMENSION_MAX,
    });
    expect(sanitizeScenePatch({ width: 4096.4 })).toEqual({ width: 4096 });
  });

  it('clamps grid size and alpha, validates color', () => {
    const patch = sanitizeScenePatch({
      grid: { sizePx: 5, alpha: 3, color: '#FFAA00' },
    });
    expect(patch).toEqual({
      grid: { sizePx: GRID_SIZE_MIN, alpha: 1, color: '#ffaa00' },
    });
    expect(sanitizeScenePatch({ grid: { sizePx: 99999 } })).toEqual({
      grid: { sizePx: GRID_SIZE_MAX },
    });
  });

  it('drops invalid grid fields but keeps valid ones', () => {
    expect(sanitizeScenePatch({ grid: { color: 'red', visible: true, offsetX: 12 } })).toEqual({
      grid: { visible: true, offsetX: 12 },
    });
  });

  it('drops an all-invalid grid patch entirely', () => {
    expect(sanitizeScenePatch({ grid: { color: 'red' } })).toEqual({});
  });

  it('accepts gridMode only for known values', () => {
    expect(sanitizeScenePatch({ gridMode: 'gridless' })).toEqual({ gridMode: 'gridless' });
    expect(sanitizeScenePatch({ gridMode: 'hex' })).toEqual({});
  });

  it('accepts background object and null (clearing)', () => {
    expect(
      sanitizeScenePatch({ background: { url: '/uploads/maps/a.png', width: 4096, height: 4096 } }),
    ).toEqual({ background: { url: '/uploads/maps/a.png', width: 4096, height: 4096 } });
    expect(sanitizeScenePatch({ background: null })).toEqual({ background: null });
  });

  /**
   * Blokada ruchu graczy (zlecenie MG, 12.09.2026) — zwykłe pole łaty, ale
   * **tylko** logiczne. „false" jako napis jest w JavaScripcie prawdą, więc
   * pole przyjmowane na wiarę potrafiłoby otworzyć mapę wtedy, gdy prosi się
   * o jej zamknięcie.
   */
  it('przyjmuje blokadę ruchu wyłącznie jako wartość logiczną', () => {
    expect(sanitizeScenePatch({ playerMoveLocked: true })).toEqual({ playerMoveLocked: true });
    expect(sanitizeScenePatch({ playerMoveLocked: false })).toEqual({ playerMoveLocked: false });
    expect(sanitizeScenePatch({ playerMoveLocked: 'false' })).toEqual({});
    expect(sanitizeScenePatch({ playerMoveLocked: 1 })).toEqual({});
  });

  it('ignores NaN and non-numeric numbers', () => {
    expect(sanitizeScenePatch({ width: Number.NaN, metersPerSquare: '2' })).toEqual({});
  });

  /**
   * Miejsce startu drużyny (11.09.2026). Trzy stany w jednym polu: para liczb
   * wyznacza punkt, `null` go kasuje, brak pola nie mówi nic — i te trzy muszą
   * zostać rozróżnialne po sanityzacji, bo inaczej „usuń punkt" i „nie ruszaj
   * punktu" znaczyłyby to samo.
   */
  it('przyjmuje punkt startu, kasowanie i milczenie jako trzy różne rzeczy', () => {
    expect(sanitizeScenePatch({ spawn: { x: 10.4, y: 20.6 } })).toEqual({
      spawn: { x: 10, y: 21 },
    });
    expect(sanitizeScenePatch({ spawn: null })).toEqual({ spawn: null });
    expect(sanitizeScenePatch({})).toEqual({});
  });

  it('odrzuca punkt startu bez liczb i przycina go do rozmiaru sceny', () => {
    expect(sanitizeScenePatch({ spawn: { x: 'a', y: 2 } })).toEqual({});
    expect(sanitizeScenePatch({ spawn: { x: -50, y: 99999 } })).toEqual({
      spawn: { x: 0, y: 16384 },
    });
  });

  it('clamps metersPerSquare', () => {
    expect(sanitizeScenePatch({ metersPerSquare: 0 })).toEqual({ metersPerSquare: 0.1 });
    expect(sanitizeScenePatch({ metersPerSquare: 2 })).toEqual({ metersPerSquare: 2 });
  });
});

describe('normalizeGridOffset', () => {
  it('wraps offsets into [0, sizePx)', () => {
    expect(normalizeGridOffset(0, 100)).toBe(0);
    expect(normalizeGridOffset(250, 100)).toBe(50);
    expect(normalizeGridOffset(-30, 100)).toBe(70);
    expect(normalizeGridOffset(100, 100)).toBe(0);
  });

  it('returns 0 for a degenerate grid size', () => {
    expect(normalizeGridOffset(55, 0)).toBe(0);
  });
});

describe('DEFAULT_GRID', () => {
  it('matches CP RED conventions (100 px squares, visible)', () => {
    expect(DEFAULT_GRID.sizePx).toBe(100);
    expect(DEFAULT_GRID.visible).toBe(true);
  });
});
