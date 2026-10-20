import { describe, expect, it } from 'vitest';
import { backgroundLoadFraction, backgroundLoadText } from './map/background-load.js';

const MB = 1024 * 1024;

describe('licznik wczytywania mapy', () => {
  it('pokazuje pobrane z całości w MB po polsku', () => {
    const load = { preview: false, loaded: 1.25 * MB, total: 3.8 * MB };
    expect(backgroundLoadText(load)).toBe('1,3 / 3,8 MB');
    expect(backgroundLoadFraction(load)).toBeCloseTo(1.25 / 3.8);
  });

  it('bez wagi pliku pokazuje same pobrane bajty i nie ma paska', () => {
    const load = { preview: true, loaded: 2 * MB, total: null };
    expect(backgroundLoadText(load)).toBe('2,0 MB');
    expect(backgroundLoadFraction(load)).toBeNull();
  });

  it('przed pierwszym bajtem milczy, a ponad wagę nie wychodzi', () => {
    expect(backgroundLoadText({ preview: false, loaded: 0, total: MB })).toBeNull();
    const over = { preview: false, loaded: 2 * MB, total: MB };
    expect(backgroundLoadText(over)).toBe('1,0 / 1,0 MB');
    expect(backgroundLoadFraction(over)).toBe(1);
  });
});
