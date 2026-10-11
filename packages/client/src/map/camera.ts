import type { ScenePoint } from '@vtt/shared';

/**
 * Zasady kamery mapy (11.09.2026) — osobno od renderera, bo to czysta
 * arytmetyka, a `MapRenderer` ciągnie za sobą Pixi i pół sklepu stanu.
 *
 * Dwie decyzje MG stoją za tym plikiem:
 *
 *  1. **Gracz nie widzi poza mapę — ani piksela czerni.** Nie „prawie":
 *     minimalne oddalenie to takie, przy którym ekran **w całości** mieści się
 *     w mapie (`coverZoom`). Cena jest świadoma: na szerokim oknie mapy 40 × 30
 *     nie da się objąć w całości, bo góra i dół wyjdą poza ekran. MG ma dalej
 *     wolną kamerę — margines bywa potrzebny przy rysowaniu ścian na krawędzi.
 *  2. **Gracz zaczyna przybliżony na pięć kratek wokół siebie**, a nie nad
 *     całą mapą. Pięć to promień: w węższym wymiarze ekranu mieści się
 *     `2 × 5 + 1` kratek, w szerszym wychodzi więcej, i to jest w porządku.
 *     Do 11.10.2026 było osiem — MG uznał, że za szeroki kadr psuje imersję.
 *  3. **Gracz nie oddala się dalej niż na dwa kadry startowe** (11.10.2026,
 *     `PLAYER_MAX_VIEW_SQUARES_AROUND`) — widzi okolicę, a nie plan całej mapy.
 */

/** Skrajne zbliżenia mapy; dzieli je renderer i kadr startowy. */
export const MAP_MIN_ZOOM = 0.05;
export const MAP_MAX_ZOOM = 8;

/** Ile kratek wokół siebie widzi gracz na starcie (promień). */
export const PLAYER_VIEW_SQUARES_AROUND = 5;

/** Najdalsze oddalenie gracza (promień w kratkach) — dwa kadry startowe. */
export const PLAYER_MAX_VIEW_SQUARES_AROUND = PLAYER_VIEW_SQUARES_AROUND * 2;

/** Tyle, ile kamera musi wiedzieć o scenie — bez reszty `SceneView`. */
export interface CameraScene {
  width: number;
  height: number;
  grid: { sizePx: number };
}

/** Rozmiar płótna w pikselach CSS. */
export interface CameraScreen {
  width: number;
  height: number;
}

export interface CameraShot {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Najmniejsze zbliżenie, przy którym ekran leży **w całości** wewnątrz mapy.
 *
 * Bierze się `max`, nie `min`: przy `min` (czyli „zmieść całą mapę") kadr
 * wystaje poza mapę w tym wymiarze, w którym proporcje się nie zgadzają — i to
 * właśnie jest czerń, której ma nie być.
 */
export function coverZoom(scene: CameraScene, screen: CameraScreen): number {
  if (scene.width <= 0 || scene.height <= 0) return MAP_MIN_ZOOM;
  return Math.max(screen.width / scene.width, screen.height / scene.height);
}

/** Zbliżenie, przy którym w węższym wymiarze ekranu mieści się `2r + 1` kratek. */
function zoomForSquares(scene: CameraScene, screen: CameraScreen, squaresAround: number): number {
  const span = (squaresAround * 2 + 1) * scene.grid.sizePx;
  return span > 0 ? Math.min(screen.width, screen.height) / span : MAP_MAX_ZOOM;
}

/**
 * Dolna granica zbliżenia gracza: nie dalej niż `PLAYER_MAX_VIEW_SQUARES_AROUND`
 * kratek wokół — i nigdy poza mapę (`coverZoom`, decyzja 1).
 */
export function playerMinZoom(scene: CameraScene, screen: CameraScreen): number {
  return Math.max(
    zoomForSquares(scene, screen, PLAYER_MAX_VIEW_SQUARES_AROUND),
    coverZoom(scene, screen),
    MAP_MIN_ZOOM,
  );
}

/** Środek kadru wpisany w mapę; gdy mapa jest węższa od ekranu — jej środek. */
function centreWithin(value: number, half: number, size: number): number {
  if (half * 2 >= size) return size / 2;
  return Math.min(Math.max(value, half), size - half);
}

/**
 * Kadr startowy gracza: przybliżenie na `squaresAround` kratek wokół punktu,
 * przycięte do granic mapy.
 *
 * Zbliżenie nigdy nie schodzi poniżej `coverZoom` — inaczej „zacznij blisko"
 * kłóciłoby się z „nie widzisz poza mapę" na małej mapie albo w wysokim oknie.
 */
export function startCamera(
  scene: CameraScene,
  screen: CameraScreen,
  anchor: ScenePoint,
  squaresAround: number = PLAYER_VIEW_SQUARES_AROUND,
): CameraShot {
  const wanted = zoomForSquares(scene, screen, squaresAround);
  // `MAP_MIN_ZOOM` w tej samej klamrze nie jest ozdobą: płótno o zerowym
  // rozmiarze (kadr policzony, zanim układ strony usiadł) dałoby bez niego
  // zbliżenie **0**, czyli mapę zwiniętą do punktu i czarny ekran do
  // przeładowania karty.
  const zoom = Math.min(Math.max(wanted, coverZoom(scene, screen), MAP_MIN_ZOOM), MAP_MAX_ZOOM);
  return {
    zoom,
    x: centreWithin(anchor.x, screen.width / zoom / 2, scene.width),
    y: centreWithin(anchor.y, screen.height / zoom / 2, scene.height),
  };
}

/**
 * Gdzie zaczyna patrzeć gracz, gdy nie ma tu jeszcze własnej figury: punkt
 * wyznaczony przez MG, a jeśli go nie wyznaczył — środek dolnej krawędzi mapy.
 *
 * Dół, bo stamtąd drużyna wchodzi w kadr; kadr i tak zostanie wpisany w mapę,
 * więc „środek dolnej krawędzi" znaczy „najniżej, jak się da, pośrodku".
 */
export function partyStart(scene: CameraScene, spawn: ScenePoint | null): ScenePoint {
  return spawn ?? { x: scene.width / 2, y: scene.height };
}
