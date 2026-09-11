import { DEFAULT_GRID, type SceneView } from '@vtt/shared';

/**
 * Mapa powitalna gracza (zlecenie MG, 11.09.2026).
 *
 * Do tej pory gracz, który wszedł do kampanii bez aktywnej sceny, dostawał
 * czarne pole i zdanie „Brak aktywnej sceny — MG musi ją aktywować". Zdanie
 * jest prawdziwe, tylko mówi o kuchni, a nie o świecie — a pierwsze, co widzi
 * gracz przy wejściu do gry, buduje (albo psuje) całą resztę wieczoru. Zamiast
 * pustki stoi więc zwykła mapa: brama strefy przemysłowej, 40 × 30 kratek.
 *
 * **To jest tło, a nie scena.** Tu leży cała ostrożność tego pliku: obiekt
 * poniżej jedzie **wyłącznie** do `MapRenderer.setScene`, a `sceneStore` dalej
 * trzyma `null`. Wszystko, co pyta o scenę — stawianie figur, linijka wysyłana
 * innym, ping, efekty walki, mgła — pyta `effectiveScene` i dostaje `null`, więc
 * nadal nie ma czego dotknąć ani czego wysłać. Gracz może tę mapę przesuwać
 * i przybliżać; poza tym jest obrazkiem. Dzięki temu tło nie potrzebuje wiersza
 * w bazie, migracji ani jednej linii na serwerze, a MG nie może go skasować.
 *
 * MG tego tła **nie dostaje** — jego „Brak sceny" to komunikat roboczy
 * („utwórz i aktywuj"), a nie wyrwa w immersji.
 *
 * Plik leży poza repozytorium, bo jest darmową mapą do użytku prywatnego, a
 * repozytorium jest publiczne (zasada z `docs/assety-mapy.md`). Stąd sonda
 * niżej: gdy pliku nie ma — a nie ma go na świeżym klonie i na świeżym VPS-ie,
 * póki go tam nie skopiujesz — `loadWelcomeScene` oddaje `null` i ekran wraca
 * do dawnego zdania. Pełny opis w `docs/assety-mapy.md`.
 */
export const WELCOME_MAP_URL = '/uploads/art/welcome-map.webp';

/** Skala mapy, w kratkach CP RED (1 kratka = 2 m) — stąd bierze się siatka. */
export const WELCOME_MAP_COLUMNS = 40;
export const WELCOME_MAP_ROWS = 30;

/**
 * Identyfikator tła. Nie jest to `cuid` żadnej sceny i nigdy nie wychodzi na
 * sieć — renderer używa go tylko do rozpoznania, że mapa się zmieniła.
 */
export const WELCOME_SCENE_ID = 'welcome-map';

/**
 * Scena-atrapa z rozmiarów wczytanego obrazu.
 *
 * Kratkę liczymy z pliku (`szerokość / 40`), zamiast wpisywać ją na sztywno —
 * przy plakacie logowania wpisane na sztywno współrzędne skończyły się umową
 * „zmiana pliku wymaga przemierzenia liczb od nowa". Tutaj wystarczy, żeby
 * podmieniony plik dalej miał 40 × 30 kratek, i siatka sama siada na miejsce.
 */
export function buildWelcomeScene(width: number, height: number): SceneView {
  return {
    id: WELCOME_SCENE_ID,
    name: 'Brama strefy przemysłowej',
    active: false,
    background: { url: WELCOME_MAP_URL, width, height },
    width,
    height,
    gridMode: 'grid',
    grid: { ...DEFAULT_GRID, sizePx: width / WELCOME_MAP_COLUMNS },
    metersPerSquare: 2,
    // Nic tu nie jest tajne i nie ma czego odsłaniać: mgła malowana potrzebuje
    // MG, a widoczność dynamiczna — figur gracza, których na tle nie ma.
    visibility: 'open',
    dark: false,
    darkSightM: 2,
    explore: false,
  };
}

/** Sonda robi się raz na życie karty — wynik (także „nie ma pliku") zostaje. */
let probe: Promise<SceneView | null> | null = null;

/**
 * Wczytuje obraz tła i oddaje scenę-atrapę; `null`, gdy pliku nie ma.
 *
 * Obraz idzie przez `Image`, a nie przez `Assets.load` Pixi, z dwóch powodów:
 * sonda musi umieć **odmówić** (a od tego, czy plik jest, zależy, czy w ogóle
 * pokazujemy tło), i musi znać naturalne wymiary, zanim renderer cokolwiek
 * dostanie. Drugie wczytanie — to w rendererze — idzie już z pamięci
 * podręcznej przeglądarki.
 */
export function loadWelcomeScene(): Promise<SceneView | null> {
  probe ??= new Promise<SceneView | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = image;
      resolve(width > 0 && height > 0 ? buildWelcomeScene(width, height) : null);
    };
    image.onerror = () => resolve(null);
    image.src = WELCOME_MAP_URL;
  });
  return probe;
}
