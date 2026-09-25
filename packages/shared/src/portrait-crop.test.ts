import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PORTRAIT_CROP,
  PORTRAIT_CROP_ZOOM_MAX,
  PORTRAIT_CROP_ZOOM_MIN,
  clampPortraitCrop,
  isDefaultPortraitCrop,
  PORTRAIT_BANNER_ASPECT,
  clampPortraitBannerCrop,
  portraitBannerCropOf,
  portraitBannerCropPlacement,
  portraitBannerFor,
  portraitBannerPlacement,
  sanitizePortraitBannerCrop,
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

describe('portraitBannerPlacement — kadr w banerze lewego panelu (25.09)', () => {
  const BANNER = 0.75;

  it('bez przybliżenia obraz pokrywa baner, a kadr z góry obrazu stoi u góry banera', () => {
    expect(portraitBannerPlacement({ x: 0.5, y: 0.2, zoom: 1 }, TALL, BANNER)).toEqual({
      width: 1,
      height: 2,
      left: 0,
      top: 0,
    });
  });

  it('górna krawędź krążka żetonu siada u góry banera — głowa nie jest ucięta', () => {
    // Krążek przy zoomie 1 obejmuje 800 px, czyli od 1/6 do 5/6 wysokości obrazu.
    const middle = portraitBannerPlacement({ x: 0.5, y: 0.5, zoom: 1 }, TALL, BANNER);
    expect(middle.top + (1 / 6) * middle.height).toBeCloseTo(0.02);
  });

  it('krążek żetonu zajmuje w banerze dwie trzecie wysokości — półtora raza szerzej', () => {
    const place = portraitBannerPlacement({ x: 0.5, y: 0.2, zoom: 4 }, TALL, BANNER);
    expect(place.width).toBeCloseTo(2);
    expect(place.height).toBeCloseTo(4);
    // Krążek przy zoomie 4 pokazuje 200 px obrazu; w banerze to 200 / 1200 wysokości obrazu.
    expect((place.height * 200) / 1200).toBeCloseTo(2 / 3);
    expect(place.left).toBeCloseTo(-0.5);
    // Górna krawędź krążka: 0,2 − 100/1200 wysokości obrazu.
    expect(place.top + (0.2 - 100 / 1200) * place.height).toBeCloseTo(0.02);
  });

  it('dosuwa kadr przy krawędzi obrazu, zamiast odsłaniać pusty pas', () => {
    const place = portraitBannerPlacement({ x: 1, y: 1, zoom: 4 }, TALL, BANNER);
    expect(place.left).toBeCloseTo(1 - place.width);
    expect(place.top).toBeCloseTo(1 - place.height);
  });

  it('szeroki obraz pokrywa baner wysokością', () => {
    const place = portraitBannerPlacement(DEFAULT_PORTRAIT_CROP, WIDE, BANNER);
    expect(place.height).toBeCloseTo(1);
    expect(place.width).toBeGreaterThan(1);
    expect(place.left).toBeCloseTo(0.5 - place.width / 2);
  });
});

describe('własny kadr banera (25.09)', () => {
  it('zoom 1 pokrywa baner, a punkt kadru siada na środku ramki', () => {
    const place = portraitBannerCropPlacement({ x: 0.5, y: 0.3, zoom: 1 }, TALL);
    expect(place.width).toBeCloseTo(1);
    expect(place.height).toBeCloseTo(2);
    expect(place.left).toBeCloseTo(0);
    expect(place.top + 0.3 * place.height).toBeCloseTo(0.5);
  });

  it('nie wypuszcza ramki poza obraz — punkt kadru dosuwa się do krawędzi', () => {
    const safe = clampPortraitBannerCrop({ x: 0, y: 0, zoom: 1 }, TALL);
    expect(safe).toEqual({ x: 0.5, y: 0.25, zoom: 1 });
    const place = portraitBannerCropPlacement({ x: 0, y: 0, zoom: 1 }, TALL);
    expect(place.top).toBeCloseTo(0);
    expect(clampPortraitBannerCrop({ x: 0.5, y: 0.5, zoom: 0.2 }, TALL).zoom).toBe(1);
  });

  it('odwrotność odtwarza ułożenie, więc zakładka „Baner” rusza od tego, co widać', () => {
    const auto = portraitBannerPlacement(
      { x: 0.45, y: 0.3, zoom: 2 },
      TALL,
      PORTRAIT_BANNER_ASPECT,
    );
    const again = portraitBannerCropPlacement(portraitBannerCropOf(auto, TALL), TALL);
    expect(again.width).toBeCloseTo(auto.width);
    expect(again.left).toBeCloseTo(auto.left);
    expect(again.top).toBeCloseTo(auto.top);
  });

  it('baner wybiera: własny kadr, potem kadr żetonu, a bez kadru — górę grafiki', () => {
    const own = { x: 0.5, y: 0.7, zoom: 1 };
    const withOwn = portraitBannerFor({ ...TALL, crop: DEFAULT_PORTRAIT_CROP, bannerCrop: own });
    expect(withOwn).toEqual(portraitBannerCropPlacement(own, TALL));
    const fromToken = portraitBannerFor({
      ...TALL,
      crop: { x: 0.5, y: 0.5, zoom: 2 },
      bannerCrop: null,
    });
    expect(fromToken).toEqual(
      portraitBannerPlacement({ x: 0.5, y: 0.5, zoom: 2 }, TALL, PORTRAIT_BANNER_ASPECT),
    );
    const plain = portraitBannerFor({ ...TALL, crop: DEFAULT_PORTRAIT_CROP, bannerCrop: null });
    expect(plain.top).toBe(0);
    expect(plain.left).toBeCloseTo(0);
  });

  it('odrzuca śmieci z drutu, liczby zaciska', () => {
    expect(sanitizePortraitBannerCrop({ x: 'a', y: 0, zoom: 1 }, TALL)).toBeNull();
    expect(sanitizePortraitBannerCrop(null, TALL)).toBeNull();
    expect(sanitizePortraitBannerCrop({ x: 0.5, y: 0.5, zoom: 9 }, TALL)?.zoom).toBe(4);
  });
});
