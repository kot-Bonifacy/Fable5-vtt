import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PORTRAIT_CROP,
  PORTRAIT_CROP_ZOOM_MAX,
  PORTRAIT_CROP_ZOOM_MIN,
  clampPortraitCrop,
  isDefaultPortraitCrop,
  portraitCropPlacement,
  sanitizePortraitCrop,
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

/**
 * Granice kadru po poprawce z 12.09.
 *
 * Pierwsza wersja pilnowała, żeby krążek nie wyjechał poza obraz — i MG zgłosił
 * to jako usterkę przy pierwszym użyciu: granica liczyła się do **kratki**,
 * a widoczne koło jest od kratki mniejsze o obwódkę właściciela, więc górnych
 * pikseli portretu nie dawało się wciągnąć w krążek; czubek głowy zostawał pod
 * pierścieniem. Decyzja MG: kadr wolno wywieźć poza obraz, a pustkę zamalowuje
 * tło żetonu. Zostaje jedno: punkt kadru ma leżeć na obrazie.
 */
describe('punkt kadru zostaje na obrazie, brzegi mogą być puste', () => {
  it('górna krawędź obrazu jest osiągalna', () => {
    // To jest dokładnie zgłoszenie MG: czubek głowy na środku krążka.
    expect(clampPortraitCrop({ x: 0.5, y: 0, zoom: 1 }, TALL).y).toBe(0);
  });

  it('pion portretu 2:3 nie jest już wciskany do jednej trzeciej', () => {
    const crop = clampPortraitCrop({ x: 0.1, y: 0.05, zoom: 1 }, TALL);
    expect(crop.x).toBeCloseTo(0.1, 10);
    expect(crop.y).toBeCloseTo(0.05, 10);
  });

  it('twarz z górnej trzeciej jest osiągalna', () => {
    const crop = clampPortraitCrop({ x: 0.5, y: 0.34, zoom: 1 }, TALL);
    expect(crop.y).toBeCloseTo(0.34, 10);
  });

  it('obraz kwadratowy przy zoomie 1 też daje się przesunąć', () => {
    // Dawniej wracał na sam środek — kwadrat pokrywał kratkę bez zapasu.
    const crop = clampPortraitCrop({ x: 0.2, y: 0.9, zoom: 1 }, SQUARE);
    expect(crop.x).toBeCloseTo(0.2, 10);
    expect(crop.y).toBeCloseTo(0.9, 10);
  });

  it('poza obraz nie wychodzi już sam punkt kadru', () => {
    for (const size of [TALL, SQUARE, WIDE]) {
      const low = clampPortraitCrop({ x: -5, y: -0.2, zoom: 2 }, size);
      expect(low.x).toBe(0);
      expect(low.y).toBe(0);
      const high = clampPortraitCrop({ x: 9, y: 1.4, zoom: 3 }, size);
      expect(high.x).toBe(1);
      expect(high.y).toBe(1);
    }
  });

  it('kadr przy krawędzi zostawia pustkę, i tyle, ile z arytmetyki wychodzi', () => {
    // Kadr wywieziony na sam róg: obraz zaczyna się dokładnie na środku kratki,
    // więc lewa i górna połowa krążka zostają puste — tam rysuje się tło żetonu
    // (`PORTRAIT_BACKDROP` w `TokenNode`), a nie mapa spod figury.
    const extent = 100;
    const place = portraitCropPlacement({ x: 0, y: 0, zoom: 1 }, TALL, extent);
    const left = extent / 2 - place.anchorX * TALL.width * place.scale;
    const top = extent / 2 - place.anchorY * TALL.height * place.scale;
    expect(left).toBeCloseTo(extent / 2, 10);
    expect(top).toBeCloseTo(extent / 2, 10);
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
      y: 0.1,
      zoom: 1,
    });
    expect(sanitizePortraitCrop({ x: 2, y: -1, zoom: 9 }, TALL)).toEqual({
      x: 1,
      y: 0,
      zoom: PORTRAIT_CROP_ZOOM_MAX,
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
