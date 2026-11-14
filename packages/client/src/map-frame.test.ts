import { describe, expect, it } from 'vitest';
import { clearOfRunWindow } from './map-frame.js';

const rect = (left: number, right: number, top = 0, bottom = 900) => ({
  left,
  right,
  top,
  bottom,
  width: right - left,
});

describe('clearOfRunWindow — kadr obok okna Sieci (70f pkt 1)', () => {
  const map = rect(0, 1600);

  it('okno z prawej: punkt na środku lewego pasa, granica kamery rośnie w prawo', () => {
    const { offset, insets } = clearOfRunWindow(map, rect(1200, 1600));
    expect(offset).toEqual({ x: 600 - 800, y: 0 });
    // 400 px zasłonięte + pół wolnego pasa (600): urządzenie przy prawym
    // brzegu sceny dojedzie na środek pasa, a nie zostanie pod oknem.
    expect(insets).toEqual({ left: 0, right: 1000 });
  });

  it('okno z lewej: granica rośnie w lewo', () => {
    const { offset, insets } = clearOfRunWindow(map, rect(0, 400));
    expect(offset).toEqual({ x: 1000 - 800, y: 0 });
    expect(insets).toEqual({ left: 1000, right: 0 });
  });

  it('okno poza mapą albo zwinięte — bez przesunięcia i bez zapasu', () => {
    expect(clearOfRunWindow(map, rect(1700, 2000))).toEqual({
      offset: { x: 0, y: 0 },
      insets: { left: 0, right: 0 },
    });
    expect(clearOfRunWindow(map, undefined).insets).toEqual({ left: 0, right: 0 });
  });
});
