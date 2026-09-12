import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PORTRAIT_CROP,
  PORTRAIT_CROP_ZOOM_MAX,
  PORTRAIT_CROP_ZOOM_MIN,
  clampPortraitCrop,
  isDefaultPortraitCrop,
  portraitCropPlacement,
  sanitizePortraitCrop,
  type PortraitCrop,
} from './portrait-crop.js';

/** Portret jak z puli: 2:3 w pionie, twarz w górnej trzeciej. */
const TALL = { width: 800, height: 1200 };
const SQUARE = { width: 512, height: 512 };
const WIDE = { width: 1600, height: 900 };

describe('kadr domyślny to dawne zachowanie mapy', () => {
  it('środek obrazu i skala pokrywająca kratkę', () => {
    const place = portraitCropPlacement(DEFAULT_PORTRAIT_CROP, TALL, 100);
    // `fitImage` liczyła dokładnie to: extent / min(w, h) i kotwica 0,5.
    expect(place.scale).toBeCloseTo(100 / 800, 10);
    expect(place.anchorX).toBeCloseTo(0.5, 10);
    expect(place.anchorY).toBeCloseTo(0.5, 10);
  });

  it('rozpoznaje się bez porównywania trzech liczb z ręki', () => {
    expect(isDefaultPortraitCrop({ x: 0.5, y: 0.5, zoom: 1 })).toBe(true);
    expect(isDefaultPortraitCrop({ x: 0.5, y: 0.32, zoom: 1 })).toBe(false);
    expect(isDefaultPortraitCrop({ x: 0.5, y: 0.5, zoom: 1.4 })).toBe(false);
  });
});

describe('krążek nigdy nie wyjeżdża poza obraz', () => {
  it('pion portretu 2:3 daje zapas, poziom nie', () => {
    const crop = clampPortraitCrop({ x: 0.1, y: 0.05, zoom: 1 }, TALL);
    // W poziomie kratka zjada całą szerokość — zostaje sam środek.
    expect(crop.x).toBeCloseTo(0.5, 10);
    // W pionie połowa kratki to 800 / (2 · 1200) = 1/3 wysokości.
    expect(crop.y).toBeCloseTo(1 / 3, 10);
  });

  it('twarz z górnej trzeciej jest osiągalna', () => {
    const crop = clampPortraitCrop({ x: 0.5, y: 0.34, zoom: 1 }, TALL);
    expect(crop.y).toBeCloseTo(0.34, 10);
  });

  it('obraz kwadratowy przy zoomie 1 nie ma czym przesuwać', () => {
    const crop = clampPortraitCrop({ x: 0.2, y: 0.9, zoom: 1 }, SQUARE);
    expect(crop.x).toBeCloseTo(0.5, 10);
    expect(crop.y).toBeCloseTo(0.5, 10);
  });

  it('przybliżenie otwiera swobodę w obu osiach', () => {
    const crop = clampPortraitCrop({ x: 0.2, y: 0.9, zoom: 2 }, SQUARE);
    expect(crop.x).toBeCloseTo(0.25, 10);
    expect(crop.y).toBeCloseTo(0.75, 10);
  });

  it('obraz w poziomie zostawia zapas w poziomie', () => {
    const crop = clampPortraitCrop({ x: 0.1, y: 0.1, zoom: 1 }, WIDE);
    expect(crop.x).toBeCloseTo(900 / (2 * 1600), 10);
    expect(crop.y).toBeCloseTo(0.5, 10);
  });

  it('każdy kadr po zaciśnięciu pokrywa kratkę w całości', () => {
    const extent = 100;
    const cases: PortraitCrop[] = [
      { x: -5, y: -5, zoom: 1 },
      { x: 9, y: 9, zoom: 3 },
      { x: 0.5, y: 0.02, zoom: 1.7 },
      { x: 0.98, y: 0.5, zoom: 2.5 },
    ];
    for (const size of [TALL, SQUARE, WIDE]) {
      for (const raw of cases) {
        const place = portraitCropPlacement(raw, size, extent);
        const shownW = size.width * place.scale;
        const shownH = size.height * place.scale;
        // Lewy górny róg obrazu względem lewego górnego rogu kratki.
        const left = extent / 2 - place.anchorX * shownW;
        const top = extent / 2 - place.anchorY * shownH;
        expect(left).toBeLessThanOrEqual(1e-9);
        expect(top).toBeLessThanOrEqual(1e-9);
        expect(left + shownW).toBeGreaterThanOrEqual(extent - 1e-9);
        expect(top + shownH).toBeGreaterThanOrEqual(extent - 1e-9);
      }
    }
  });
});

describe('przybliżenie ma dno i sufit', () => {
  it('poniżej jedynki krążek przestałby być pokryty', () => {
    expect(clampPortraitCrop({ x: 0.5, y: 0.5, zoom: 0.2 }, TALL).zoom).toBe(
      PORTRAIT_CROP_ZOOM_MIN,
    );
  });

  it('wyżej niż sufit kadruje się już piksele', () => {
    expect(clampPortraitCrop({ x: 0.5, y: 0.5, zoom: 99 }, TALL).zoom).toBe(PORTRAIT_CROP_ZOOM_MAX);
  });

  it('przybliżenie mnoży skalę, nie zastępuje jej', () => {
    const place = portraitCropPlacement({ x: 0.5, y: 0.5, zoom: 2 }, TALL, 100);
    expect(place.scale).toBeCloseTo((100 / 800) * 2, 10);
  });
});

describe('kadr z drutu', () => {
  it('przyjmuje liczby i zaciska je', () => {
    expect(sanitizePortraitCrop({ x: 0.5, y: 0.1, zoom: 1 }, TALL)).toEqual({
      x: 0.5,
      y: 1 / 3,
      zoom: 1,
    });
  });

  it('odrzuca to, co kadrem nie jest', () => {
    expect(sanitizePortraitCrop(null, TALL)).toBeNull();
    expect(sanitizePortraitCrop('0.5', TALL)).toBeNull();
    expect(sanitizePortraitCrop({ x: 0.5, y: 0.5 }, TALL)).toBeNull();
    expect(sanitizePortraitCrop({ x: 0.5, y: 0.5, zoom: 'dużo' }, TALL)).toBeNull();
    expect(sanitizePortraitCrop({ x: Number.NaN, y: 0.5, zoom: 1 }, TALL)).toBeNull();
    expect(
      sanitizePortraitCrop({ x: 0.5, y: 0.5, zoom: Number.POSITIVE_INFINITY }, TALL),
    ).toBeNull();
  });

  it('grafika bez wymiarów wraca na środek zamiast dzielić przez zero', () => {
    expect(clampPortraitCrop({ x: 0.2, y: 0.2, zoom: 3 }, { width: 0, height: 0 })).toEqual(
      DEFAULT_PORTRAIT_CROP,
    );
  });
});
