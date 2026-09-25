/**
 * Kadr portretu na mapie — jak grafika jest ujęta w krążku żetonu (12.09).
 *
 * Do tej pory mapa kadrowała ślepo: `fitImage` skalowała obraz tak, żeby
 * pokrył kratkę, i stawiała go środkiem na środku. Portret jest prawie zawsze
 * prostokątem w pionie, a twarz siedzi w jego górnej trzeciej — więc żeton
 * dostawał tors, a broda kończyła się na krawędzi krążka. MG nie miał czym
 * tego poprawić: jedynym wyjściem było przyciąć plik w edytorze grafiki przed
 * wgraniem.
 *
 * Kadr jest **metadanymi, nie nowym plikiem**, i to jest wymuszone: kopie
 * zapasowe trzymają `uploads/` na twardych dowiązaniach, co jest bezpieczne
 * wyłącznie dlatego, że plik uploadu nigdy się nie zmienia (umowa obszaru
 * `serwer`). Przy okazji wychodzi na tym dokładnie to, o co prosił MG: oryginał
 * zostaje nietknięty i wszędzie poza mapą widać go w całości.
 *
 * Zapis jest **znormalizowany**, więc nie zależy ani od rozmiaru pliku, ani od
 * kratki sceny: ten sam kadr czyta się tak samo dla żetonu 1 × 1 na kratce
 * 47 px i dla 4 × 4 na kratce 100 px.
 */

/**
 * Punkt obrazu, który ma wylądować na środku krążka, i przybliżenie.
 *
 * - `x`, `y` — ułamek szerokości i wysokości **obrazu** (0 = lewa/górna
 *   krawędź, 1 = prawa/dolna). Domyślne 0,5/0,5 to dawne „na środek".
 * - `zoom` — mnożnik skali pokrywającej kratkę. 1 znaczy „obraz dotyka kratki
 *   krótszym bokiem" (dawne zachowanie), 2 — „w kratce mieści się połowa
 *   krótszego boku". Mniej niż 1 nie istnieje: przy pomniejszeniu portret
 *   przestałby sięgać brzegów krążka nawet ustawiony na środku.
 *
 * Punkt kadru wolno dowieźć **do samej krawędzi obrazu** (12.09, po zgłoszeniu
 * MG): czubek głowy siada wtedy na środku krążka, a to, czego nad nim nie ma,
 * zamalowuje tło żetonu.
 */
export interface PortraitCrop {
  x: number;
  y: number;
  zoom: number;
}

/** Kadr, który daje dokładnie to, co mapa rysowała przed 12.09. */
export const DEFAULT_PORTRAIT_CROP: Readonly<PortraitCrop> = { x: 0.5, y: 0.5, zoom: 1 };

/** Poniżej 1 krążek przestałby być pokryty obrazem — stąd twarde dno. */
export const PORTRAIT_CROP_ZOOM_MIN = 1;
/**
 * Sufit przybliżenia. Cztery, bo portret 2048 px przy kratce 100 px ma zapas
 * ostrości mniej więcej do tego miejsca; wyżej kadruje się już piksele.
 */
export const PORTRAIT_CROP_ZOOM_MAX = 4;

/** Rozmiar grafiki w pikselach — tyle kadr potrzebuje wiedzieć o pliku. */
export interface PortraitImageSize {
  width: number;
  height: number;
}

/** Czy to jest dawne „na środek", którego nie ma po co zapisywać ani wysyłać. */
export function isDefaultPortraitCrop(crop: PortraitCrop): boolean {
  return (
    crop.x === DEFAULT_PORTRAIT_CROP.x &&
    crop.y === DEFAULT_PORTRAIT_CROP.y &&
    crop.zoom === DEFAULT_PORTRAIT_CROP.zoom
  );
}

/**
 * Wciska kadr w granice obrazu: środek krążka musi leżeć **na** grafice.
 *
 * Do 12.09 granica była ciaśniejsza — krążek nie miał prawa wyjechać poza
 * obraz ani rogiem — i to był błąd, który MG zgłosił od razu przy pierwszym
 * użyciu: górnych pikseli portretu nie dawało się wciągnąć w krążek, bo
 * ograniczenie zatrzymywało obraz, gdy jego krawędź dotykała krawędzi
 * **kratki**, a widoczne koło jest od kratki mniejsze o obwódkę właściciela.
 * Czubek głowy zostawał więc pod pierścieniem i nie było jak go stamtąd wyjąć.
 *
 * Od 12.09 (decyzja MG) kadr **może** wyjechać poza obraz: pusty pas zamalowuje
 * tło żetonu, dokładnie to samo, na którym stoi figura bez portretu. Zostaje
 * jedno ograniczenie — punkt kadru, czyli to, co ląduje na środku krążka, ma
 * leżeć na obrazie. Inaczej dałoby się ustawić żeton, na którym portretu nie
 * ma wcale, a kadr przestałby cokolwiek znaczyć.
 */
export function clampPortraitCrop(crop: PortraitCrop, size: PortraitImageSize): PortraitCrop {
  if (!(size.width > 0) || !(size.height > 0)) return { ...DEFAULT_PORTRAIT_CROP };
  return {
    x: clamp(crop.x, 0, 1),
    y: clamp(crop.y, 0, 1),
    zoom: clamp(crop.zoom, PORTRAIT_CROP_ZOOM_MIN, PORTRAIT_CROP_ZOOM_MAX),
  };
}

/**
 * Kadr z tego, co przyszło po drucie — albo `null`, gdy to nie jest kadr.
 *
 * Liczby idą przez `clampPortraitCrop`, a nie przez odrzucenie: suwak klienta
 * i tak nie wypuści wartości spoza zakresu, a zaokrąglenie zmiennoprzecinkowe
 * przy krawędzi („0,3333333333333333 zamiast 1/3") nie jest błędem żądania.
 * Odrzuca się to, co kadrem nie jest: braki, teksty, NaN.
 */
export function sanitizePortraitCrop(input: unknown, size: PortraitImageSize): PortraitCrop | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  const x = raw.x;
  const y = raw.y;
  const zoom = raw.zoom;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(zoom)) return null;
  return clampPortraitCrop({ x, y, zoom }, size);
}

/** Jak mapa ma ustawić sprite'a portretu, żeby wyszedł zadany kadr. */
export interface PortraitCropPlacement {
  /** Mnożnik, którym skaluje się teksturę (obie osie równo). */
  scale: number;
  /** Kotwica sprite'a — ten punkt obrazu siada na środku kratki. */
  anchorX: number;
  anchorY: number;
}

/**
 * Przelicza kadr na ustawienia sprite'a dla kratki o boku `extent`.
 *
 * Sprite stoi kotwicą na środku kratki, więc kotwica **jest** punktem kadru —
 * dzięki temu obrót leżącej figury (`CONDITION_TILT_DEG`) dalej kręci się wokół
 * środka krążka, a nie wokół środka pliku.
 *
 * Przy domyślnym kadrze wychodzi dokładnie to, co liczyła dawna `fitImage`:
 * `extent / min(w, h)` i kotwica 0,5 — stąd żadna figura nie drgnie po
 * migracji.
 */
export function portraitCropPlacement(
  crop: PortraitCrop,
  image: PortraitImageSize,
  extent: number,
): PortraitCropPlacement {
  const safe = clampPortraitCrop(crop, image);
  const cover = extent / Math.min(image.width, image.height);
  return { scale: cover * safe.zoom, anchorX: safe.x, anchorY: safe.y };
}

/**
 * Ile razy szerzej od krążka żetonu patrzy baner portretu (decyzja MG z 25.09:
 * „szerzej, więcej postaci” — widać ramiona, twarz mniejsza niż na mapie).
 */
export const PORTRAIT_BANNER_ZOOM_OUT = 1.5;

/**
 * Na jakiej wysokości banera siada górna krawędź krążka żetonu (poprawka MG
 * z 25.09). Baner trzyma się góry kadru, a nie jego środka: przy wąskim
 * portrecie skala „pokryj ramkę” powiększa krążek ponad wysokość banera,
 * a środek na 40 % ucinał wtedy czubek głowy.
 */
export const PORTRAIT_BANNER_TOP = 0.02;

/**
 * Jak ułożyć obraz w banerze, wszystko w ułamkach ramki: `width` i `left`
 * względem jej szerokości, `height` i `top` — wysokości.
 */
export interface PortraitBannerPlacement {
  width: number;
  height: number;
  left: number;
  top: number;
}

/**
 * Kadr z mapy przeniesiony na baner lewego panelu (zlecenie MG z 25.09).
 *
 * Skala: to, co krążek żetonu pokazuje na całej średnicy, zajmuje w banerze
 * `1 / PORTRAIT_BANNER_ZOOM_OUT` wysokości — ale nigdy mniej niż „obraz pokrywa
 * baner”, bo pusty pas nad głową wyglądałby w panelu jak zepsuty plik (na
 * mapie zamalowuje go tło żetonu, tu nie ma czym). Położenie: punkt kadru na
 * środku szerokości, a górna krawędź krążka na `PORTRAIT_BANNER_TOP` wysokości
 * — to, co MG ujął w krążku, zaczyna się u góry banera, a podpis przykrywa
 * najwyżej ramiona. Przy krawędzi obrazu kadr się dosuwa.
 *
 * `aspect` to wysokość ramki przez szerokość (baner 4:3 → 0,75).
 */
export function portraitBannerPlacement(
  crop: PortraitCrop,
  image: PortraitImageSize,
  aspect: number,
): PortraitBannerPlacement {
  const safe = clampPortraitCrop(crop, image);
  // Skala w szerokościach ramki na piksel obrazu (ramka ma szerokość 1).
  const scale = Math.max(
    1 / image.width,
    aspect / image.height,
    (aspect * safe.zoom) / (PORTRAIT_BANNER_ZOOM_OUT * Math.min(image.width, image.height)),
  );
  const width = image.width * scale;
  const height = (image.height * scale) / aspect;
  // Promień krążka w ułamkach wysokości obrazu: krążek żetonu obejmuje
  // krótszy bok obrazu podzielony przez przybliżenie.
  const radius = Math.min(image.width, image.height) / safe.zoom / 2 / image.height;
  return {
    width,
    height,
    left: clamp(0.5 - safe.x * width, 1 - width, 0),
    top: clamp(PORTRAIT_BANNER_TOP - (safe.y - radius) * height, 1 - height, 0),
  };
}

/** Baner portretu w lewym panelu jest 4:3 — wysokość przez szerokość. */
export const PORTRAIT_BANNER_ASPECT = 3 / 4;

/** Sufit przybliżenia własnego kadru banera — ten sam powód, co przy żetonie. */
export const PORTRAIT_BANNER_ZOOM_MAX = 4;

/** Skala „obraz pokrywa ramkę” w szerokościach ramki na piksel obrazu. */
function bannerCover(image: PortraitImageSize, aspect: number): number {
  return Math.max(1 / image.width, aspect / image.height);
}

/**
 * Wciska własny kadr banera w granice (25.09). Inaczej niż przy żetonie
 * ramka **nie** wyjeżdża poza obraz — w panelu pustego pasa nie ma czym
 * zamalować — więc punkt kadru (środek banera) trzyma się tak daleko od
 * krawędzi, żeby ramka jeszcze mieściła się na grafice. `zoom` 1 znaczy
 * „obraz dokładnie pokrywa baner”.
 */
export function clampPortraitBannerCrop(
  crop: PortraitCrop,
  image: PortraitImageSize,
  aspect: number = PORTRAIT_BANNER_ASPECT,
): PortraitCrop {
  if (!(image.width > 0) || !(image.height > 0)) return { ...DEFAULT_PORTRAIT_CROP };
  const zoom = clamp(crop.zoom, 1, PORTRAIT_BANNER_ZOOM_MAX);
  const scale = bannerCover(image, aspect) * zoom;
  const width = image.width * scale;
  const height = (image.height * scale) / aspect;
  return {
    x: clamp(crop.x, 0.5 / width, 1 - 0.5 / width),
    y: clamp(crop.y, 0.5 / height, 1 - 0.5 / height),
    zoom,
  };
}

/** Własny kadr banera: punkt kadru na środku ramki, skala „pokryj” × `zoom`. */
export function portraitBannerCropPlacement(
  crop: PortraitCrop,
  image: PortraitImageSize,
  aspect: number = PORTRAIT_BANNER_ASPECT,
): PortraitBannerPlacement {
  const safe = clampPortraitBannerCrop(crop, image, aspect);
  const scale = bannerCover(image, aspect) * safe.zoom;
  const width = image.width * scale;
  const height = (image.height * scale) / aspect;
  return { width, height, left: 0.5 - safe.x * width, top: 0.5 - safe.y * height };
}

/**
 * Odwrotność `portraitBannerCropPlacement`: jakim własnym kadrem da się
 * powtórzyć dane ułożenie. Edytor zaczyna od niego zakładkę „Baner”, gdy
 * baner jeszcze wylicza się sam — przeciąganie rusza od tego, co już widać.
 */
export function portraitBannerCropOf(
  placement: PortraitBannerPlacement,
  image: PortraitImageSize,
  aspect: number = PORTRAIT_BANNER_ASPECT,
): PortraitCrop {
  const zoom = placement.width / (image.width * bannerCover(image, aspect));
  return clampPortraitBannerCrop(
    {
      x: (0.5 - placement.left) / placement.width,
      y: (0.5 - placement.top) / placement.height,
      zoom,
    },
    image,
    aspect,
  );
}

/**
 * Jak baner ma pokazać portret (25.09): własny kadr, jeśli jest; inaczej kadr
 * żetonu przeniesiony na baner; a portret, którego nikt nie kadrował — od góry
 * grafiki, bo tam siedzi głowa.
 */
export function portraitBannerFor(
  asset: PortraitImageSize & { crop: PortraitCrop; bannerCrop: PortraitCrop | null },
  aspect: number = PORTRAIT_BANNER_ASPECT,
): PortraitBannerPlacement {
  if (asset.bannerCrop) return portraitBannerCropPlacement(asset.bannerCrop, asset, aspect);
  if (isDefaultPortraitCrop(asset.crop)) {
    const scale = bannerCover(asset, aspect);
    const width = asset.width * scale;
    return { width, height: (asset.height * scale) / aspect, left: 0.5 - width / 2, top: 0 };
  }
  return portraitBannerPlacement(asset.crop, asset, aspect);
}

/** Kadr banera z drutu albo z bazy — `null`, gdy to nie jest kadr. */
export function sanitizePortraitBannerCrop(
  input: unknown,
  image: PortraitImageSize,
): PortraitCrop | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  const { x, y, zoom } = raw;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(zoom)) return null;
  return clampPortraitBannerCrop({ x, y, zoom }, image);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
