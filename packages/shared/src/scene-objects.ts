import type { CoverView } from './covers.js';
import { pickCoverAt } from './covers.js';
import type { DrawingView } from './drawings.js';
import { pickDrawingAt } from './drawings.js';
import type { ScenePoint } from './measure.js';
import type { WallView } from './walls.js';
import { pickWallAt } from './walls.js';
import type { DefenseZoneView } from './zones.js';
import { pickZoneAt } from './zones.js';

/**
 * Co stoi na mapie i daje się zaznaczyć (etap 27k).
 *
 * Do 27k każdy rodzaj obiektu miał własną gramatykę kasowania — tryb gumki
 * wewnątrz narzędzia, osobne narzędzie „Gumka", albo wyłącznie przycisk na
 * karcie. Ten plik jest połową naprawy: **jedna** odpowiedź na pytanie „co jest
 * pod kursorem na uzbrojonej warstwie", wspólna dla renderera i dla testów.
 *
 * Druga połowa (klawisz `Delete`, obrys zaznaczenia, cofanie) siedzi u klienta
 * i na serwerze, bo tam należy. Tutaj jest sama geometria — czysta, bez Pixi
 * i bez store'ów, jak reszta `shared`.
 *
 * Żetonów **nie ma** na tej liście i to jest decyzja, nie przeoczenie: figura
 * siedzi w środku walki (celowanie, HUD, budżet ruchu), klik obok niej to
 * rozkaz marszu, a jej id noszą inicjatywa i runy Sieci. Figury kasuje się
 * dalej z menu pod prawym przyciskiem.
 */

/**
 * Rodzaje w kolejności **od wierzchu**: pierwszy wpis jest najwyżej na mapie,
 * więc wygrywa, gdy dwa obiekty leżą pod tym samym punktem. Kolejność jest
 * odwrotnością kolejności rysowania w `MapRenderer` — pinezka MG i gniazdo
 * Sieci są małymi znakami nad wszystkim, rysunek jest tłem pod wszystkim.
 */
export const SCENE_OBJECT_KINDS = [
  'note',
  'netpoint',
  'light',
  'wall',
  'zone',
  'cover',
  'drawing',
] as const;

export type SceneObjectKind = (typeof SCENE_OBJECT_KINDS)[number];

/** Zaznaczony obiekt: rodzaj plus id z jego tabeli (notatka ma id tekstowe). */
export interface SceneObjectRef {
  kind: SceneObjectKind;
  id: number | string;
}

/** Obiekt bez rozciągłości — lampa, gniazdo, pinezka. */
export interface ScenePointMarker {
  id: number | string;
  x: number;
  y: number;
}

/**
 * Co wolno złapać na danej warstwie. Wywołujący podaje **tylko** te kolekcje,
 * których jego uzbrojone narzędzie dotyczy — to jest cała reguła „warstwa":
 * narzędzie świateł nie zaznaczy osłony, choćby leżała pod kursorem.
 */
export interface SceneObjectCandidates {
  walls?: readonly WallView[];
  zones?: readonly DefenseZoneView[];
  covers?: readonly CoverView[];
  lights?: readonly ScenePointMarker[];
  netpoints?: readonly ScenePointMarker[];
  notes?: readonly ScenePointMarker[];
  drawings?: readonly DrawingView[];
}

/**
 * Promień chwytania w pikselach sceny, liczony z kratki.
 *
 * Rośnie z kratką, a nie z powiększeniem, i to jest celowe: przy oddaleniu 0,18×
 * linia ściany ma jeden piksel na ekranie i „kliknij dokładnie w nią" nie jest
 * czynnością, którą da się wykonać. Liczby są tymi samymi, którymi gumki
 * posługiwały się do 27k — przenosiny gramatyki nie miały zmienić celności.
 */
export function sceneObjectTolerance(kind: SceneObjectKind, gridSizePx: number): number {
  switch (kind) {
    case 'wall':
      return Math.max(8, gridSizePx / 5);
    case 'drawing':
      return Math.max(6, gridSizePx / 6);
    case 'light':
    case 'netpoint':
    case 'note':
      return Math.max(12, gridSizePx / 3);
    // Osłona i strefa to prostokąty: trafia się w ich wnętrze, nie w obrys.
    case 'zone':
    case 'cover':
      return 0;
  }
}

function nearestMarker(
  markers: readonly ScenePointMarker[],
  point: ScenePoint,
  tolerance: number,
): ScenePointMarker | null {
  let best: ScenePointMarker | null = null;
  let bestDistance = tolerance;
  for (const marker of markers) {
    const distance = Math.hypot(point.x - marker.x, point.y - marker.y);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = marker;
    }
  }
  return best;
}

/**
 * Co jest pod tym punktem — pierwszy rodzaj z `SCENE_OBJECT_KINDS`, który
 * cokolwiek trafia.
 *
 * `canPickDrawing` jest obowiązkowe z tego samego powodu, dla którego
 * `pickDrawingAt` je ma: gracz sięga **przez** cudzą kreskę do własnej pod nią,
 * a serwer i tak wymusza tę samą regułę. Brak filtru domyślnie przepuszczający
 * wszystko byłby cichym obejściem autorstwa u klienta.
 */
export function pickSceneObject(
  point: ScenePoint,
  candidates: SceneObjectCandidates,
  options: { gridSizePx: number; canPickDrawing?: (drawing: DrawingView) => boolean },
): SceneObjectRef | null {
  const grid = options.gridSizePx > 0 ? options.gridSizePx : 100;
  for (const kind of SCENE_OBJECT_KINDS) {
    const tolerance = sceneObjectTolerance(kind, grid);
    switch (kind) {
      case 'note': {
        const hit = candidates.notes && nearestMarker(candidates.notes, point, tolerance);
        if (hit) return { kind, id: hit.id };
        break;
      }
      case 'netpoint': {
        const hit = candidates.netpoints && nearestMarker(candidates.netpoints, point, tolerance);
        if (hit) return { kind, id: hit.id };
        break;
      }
      case 'light': {
        const hit = candidates.lights && nearestMarker(candidates.lights, point, tolerance);
        if (hit) return { kind, id: hit.id };
        break;
      }
      case 'wall': {
        const hit = candidates.walls && pickWallAt(candidates.walls, point, tolerance);
        if (hit) return { kind, id: hit.id };
        break;
      }
      case 'zone': {
        const hit = candidates.zones && pickZoneAt(candidates.zones, point);
        if (hit) return { kind, id: hit.id };
        break;
      }
      case 'cover': {
        const hit = candidates.covers && pickCoverAt(candidates.covers, point);
        if (hit) return { kind, id: hit.id };
        break;
      }
      case 'drawing': {
        const hit =
          candidates.drawings &&
          pickDrawingAt(
            [...candidates.drawings],
            point,
            tolerance,
            options.canPickDrawing ?? (() => true),
          );
        if (hit) return { kind, id: hit.id };
        break;
      }
    }
  }
  return null;
}

/** Nazwa rodzaju w bierniku — „Usunięto ścianę", „Kliknij osłonę". */
const ACCUSATIVE: Record<SceneObjectKind, string> = {
  note: 'notatkę',
  netpoint: 'punkt dostępu',
  light: 'światło',
  wall: 'ścianę',
  zone: 'strefę bronioną',
  cover: 'osłonę',
  drawing: 'rysunek',
};

/** Mianownik liczby pojedynczej — używany, gdy zdanie zaczyna się od obiektu. */
const NOMINATIVE: Record<SceneObjectKind, string> = {
  note: 'notatka',
  netpoint: 'punkt dostępu',
  light: 'światło',
  wall: 'ściana',
  zone: 'strefa broniona',
  cover: 'osłona',
  drawing: 'rysunek',
};

/**
 * Odmiana przez liczbę, bo polszczyzna ma trzy formy, a komunikat „cofnięto 2
 * osłona" czyta się jak błąd programu. Kolejno: 1, 2–4, 5+ (z wyjątkiem
 * nastek — „12 osłon", nie „12 osłony").
 */
const PLURALS: Record<SceneObjectKind, [string, string, string]> = {
  note: ['notatkę', 'notatki', 'notatek'],
  netpoint: ['punkt dostępu', 'punkty dostępu', 'punktów dostępu'],
  light: ['światło', 'światła', 'świateł'],
  wall: ['ścianę', 'ściany', 'ścian'],
  zone: ['strefę bronioną', 'strefy bronione', 'stref bronionych'],
  cover: ['osłonę', 'osłony', 'osłon'],
  drawing: ['rysunek', 'rysunki', 'rysunków'],
};

export function sceneObjectAccusative(kind: SceneObjectKind): string {
  return ACCUSATIVE[kind];
}

export function sceneObjectNominative(kind: SceneObjectKind): string {
  return NOMINATIVE[kind];
}

/** „ścianę", „3 ściany", „7 ścian" — liczebnik razem z właściwą formą. */
export function sceneObjectCountLabel(kind: SceneObjectKind, count: number): string {
  const [one, few, many] = PLURALS[kind];
  if (count === 1) return one;
  const lastTwo = count % 100;
  const last = count % 10;
  const form = last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
  return `${count} ${form}`;
}

/**
 * Klient → serwer `scene:undo`: „cofnij moje ostatnie usunięcie na tej scenie".
 *
 * Bez wskazania, **co** cofnąć, i to jest celowe: bufor jest stosem, a `Ctrl+Z`
 * znaczy „to, co przed chwilą", nie „ten obiekt". Klient nie ma po co znać
 * zawartości stosu — nie mógłby jej i tak wyświetlić uczciwie, bo drugi MG przy
 * tym samym stole odkłada tam swoje pozycje.
 */
export interface SceneUndoPayload {
  sceneId: string;
}

/** Odpowiedź na `scene:undo` — co i ile wróciło, plus gotowe zdanie na czat. */
export interface SceneUndoResult {
  kind: SceneObjectKind;
  count: number;
  note: string;
}
