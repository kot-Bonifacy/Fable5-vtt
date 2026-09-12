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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
