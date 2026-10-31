/**
 * Sceny przykładowe (etap 66, zlecenie MG z 31.10).
 *
 * Wzorzec sceny to plik `data/public/scenes/<id>/scene.json` w repozytorium —
 * gotowa scena do testów albo szybkiego użycia, którą widzi **każdy MG**
 * w panelu scen (sekcja „Przykładowe”) i dokłada do swojej kampanii jako
 * zwykłą, własną kopię. Wzorca nie zmienia się z aplikacji: nowy dokłada się
 * commitem (decyzja MG z 31.10 — „wzorce w repo”).
 *
 * Rdzeń zna tu tylko geometrię: tło, siatkę, widoczność i ciemność, ustawienia
 * pościgu, auta (bryła i grafika), figury (miejsce albo fotel, ikona urządzenia,
 * kierunek), ściany, osłony, gniazda Sieci i notatki MG (etap 66b). Liczby
 * systemu — z czego zbudować auto, kartę NPC-a i Architekturę Sieci — leżą
 * w nieprzejrzanych polach `system`, które czyta moduł systemu
 * (`systems/cpred/scene-template.ts`). Wzorzec opisuje
 * NPC-a statblokiem i id wpisów kompendium, a nie treścią podręcznika, więc
 * może leżeć w publicznym repo; kartę buduje serwer z kompendium kampanii.
 *
 * Położenia są w **kratkach** (środek auta, figury, notatki), bo wzorzec pisze
 * się ręką przy oglądanej mapie — serwer mnoży je przez `gridSizePx`.
 */

import {
  CHASE_DIRECTIONS,
  CHASE_TEMPO_MAX,
  CHASE_TEMPO_MIN,
  type ChaseDirection,
} from './chase.js';
import { isAmbiencePreset, type AmbiencePreset } from './music.js';
import { NOTE_ICONS, NOTE_TEXT_MAX_LENGTH, type NoteIcon } from './notes.js';
import {
  SCENE_NAME_MAX_LENGTH,
  isPlayerMoveMode,
  isSceneVisibility,
  type PlayerMoveMode,
  type SceneVisibility,
} from './scenes.js';
import { COVER_HP_MAX, COVER_NAME_MAX } from './covers.js';
import { SCENE_DARK_SIGHT_DEFAULT_M, SCENE_DARK_SIGHT_MAX_M } from './lights.js';
import {
  isTokenDisposition,
  sanitizeTokenGlyph,
  type TokenDisposition,
  type TokenGlyph,
} from './tokens.js';
import { VEHICLE_NAME_MAX, isVehicleArtUrl } from './vehicles.js';
import { VISION_RANGE_MAX_METRES } from './vision.js';
import { WALL_ARMOR_MAX, WALL_KINDS, type WallKind } from './walls.js';

export const SCENE_TEMPLATE_SCHEMA_VERSION = 1;

/** Kategorie wzorców w panelu scen — dziś jedna. */
export const SCENE_TEMPLATE_CATEGORIES = { examples: 'Przykładowe' } as const;
export type SceneTemplateCategory = keyof typeof SCENE_TEMPLATE_CATEGORIES;

/** Id wzorca to nazwa katalogu: małe litery, cyfry i myślniki. */
export const SCENE_TEMPLATE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Tło wzorca leży obok jego pliku w `data/public/scenes/` (serwer wydaje je pod `/public/`). */
export const SCENE_TEMPLATE_URL_PREFIX = '/public/scenes/';

export const SCENE_TEMPLATE_DESCRIPTION_MAX = 600;
export const SCENE_TEMPLATE_VEHICLES_MAX = 12;
export const SCENE_TEMPLATE_FIGURES_MAX = 40;
export const SCENE_TEMPLATE_NOTES_MAX = 12;
/** Odcinki ścian po rozcięciu łańcuchów — plan budynku, nie labirynt bez końca. */
export const SCENE_TEMPLATE_WALL_SEGMENTS_MAX = 600;
export const SCENE_TEMPLATE_COVERS_MAX = 60;
export const SCENE_TEMPLATE_ACCESS_POINTS_MAX = 12;
const FIGURE_NAME_MAX = 64;
const ACCESS_POINT_NAME_MAX = 60;
const ACCESS_POINT_NOTES_MAX = 1000;
const KEY_PATTERN = /^[a-z0-9-]{1,32}$/;

/** Wiersz listy w panelu scen — bez treści wzorca. */
export interface SceneTemplateSummary {
  id: string;
  name: string;
  description: string;
  category: SceneTemplateCategory;
  kind: 'map' | 'chase';
  backgroundUrl: string | null;
  vehicles: number;
  figures: number;
}

export interface SceneTemplateChase {
  direction: ChaseDirection;
  tempo: number;
  running: boolean;
  /** Pas jezdni w kratkach (jak `Scene.chaseRoadFrom/To`); `null` — cała szerokość. */
  road: { from: number; to: number } | null;
}

export interface SceneTemplateScene {
  kind: 'map' | 'chase';
  backgroundUrl: string | null;
  backgroundWidth: number | null;
  backgroundHeight: number | null;
  /** Rozmiar sceny; brak — rozmiar tła. */
  width: number;
  height: number;
  gridSizePx: number;
  gridOffsetX: number;
  gridOffsetY: number;
  gridVisible: boolean;
  gridPlayers: boolean;
  metersPerSquare: number;
  visibility: SceneVisibility;
  /** Ciemność sceny (etap 18b) — działa tylko przy widoczności „dynamic”. */
  dark: boolean;
  /** Wzrok w ciemności bez światła, w metrach. */
  darkSightM: number;
  /** Pamięć odkrytej mapy (etap 18c); domyślnie włączona poza pościgiem. */
  explore: boolean;
  /** „Gracze dzielą się widokiem” (30.10) — domyślnie wyłączone jak na nowej scenie. */
  partySight: boolean;
  playerMove: PlayerMoveMode;
  ambience: AmbiencePreset;
  /** Miejsce startu drużyny w kratkach. */
  spawn: { x: number; y: number } | null;
  chase: SceneTemplateChase | null;
}

export interface SceneTemplateVehicle {
  /** Klucz, którym figury wskazują auto (`figures[].vehicle.key`). */
  key: string;
  name: string;
  /** Wbudowana grafika auta (`/art/vehicles/…`); `null` — domyślna wg układu. */
  imageUrl: string | null;
  /** Środek bryły w kratkach. */
  x: number;
  y: number;
  /** Z czego zbudować auto — czyta moduł systemu. */
  system: unknown;
}

export interface SceneTemplateFigure {
  /**
   * Klucz, którym figurę wskazuje reszta wzorca (urządzenie w Architekturze
   * Sieci); `null` — figury nikt nie wskazuje.
   */
  key: string | null;
  name: string;
  /** Miejsce w kratkach — dla figury poza autem. */
  x: number;
  y: number;
  /** Fotel w aucie wzorca (0 — kierowca); `null` — figura stoi na mapie. */
  vehicle: { key: string; seat: number } | null;
  disposition: TokenDisposition | null;
  hidden: boolean;
  /** Ikona urządzenia (kamera, dron…) zamiast inicjału — `Token.glyph`. */
  glyph: TokenGlyph | null;
  /** Kierunek w stopniach zgodnie z zegarem od góry (`Token.facing`); `null` — bez grotu. */
  facing: number | null;
  /** Zasięg wzroku w metrach (`Token.visionRange`); `null` — tyle, ile pozwolą ściany. */
  visionRange: number | null;
  /** Statblok karty NPC-a — czyta moduł systemu. */
  system: unknown;
}

export interface SceneTemplateNote {
  x: number;
  y: number;
  icon: NoteIcon;
  text: string;
}

/**
 * Ściana wzorca to **łańcuch** punktów w kratkach, jak rysuje go edytor —
 * serwer tnie go na odcinki (`Wall` to zawsze jeden odcinek). Drzwi i brama to
 * zwykle łańcuch z dwóch punktów.
 */
export interface SceneTemplateWall {
  kind: WallKind;
  points: { x: number; y: number }[];
  /** Tylko otwory (drzwi, okno, brama). */
  open: boolean;
  playerToggle: boolean;
  locked: boolean;
  /** Tylko bariery i bramy: ile pocisk traci po drodze. */
  armor: number;
  /** Tylko bariery: zasłania figury, nie mapę. */
  hidesFigures: boolean;
}

/** Osłona (etap 16c): prostokąt w kratkach — lewy górny róg i rozmiar. */
export interface SceneTemplateCover {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  hidden: boolean;
}

/** Gniazdo Sieci (etap 26b) — miejsce na mapie; Architekturę buduje moduł systemu. */
export interface SceneTemplateAccessPoint {
  name: string;
  x: number;
  y: number;
  /** Domyślnie ukryte, jak każde nowe gniazdo — do znalezienia Skanerem. */
  hidden: boolean;
  notes: string;
  /** Klucz Architektury z `system` wzorca; `null` — gniazdo bez Sieci. */
  net: string | null;
}

export interface SceneTemplate {
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  category: SceneTemplateCategory;
  scene: SceneTemplateScene;
  vehicles: SceneTemplateVehicle[];
  figures: SceneTemplateFigure[];
  /** Notatki warstwy MG (`MapNote`) — gracz ich nie dostaje. */
  notes: SceneTemplateNote[];
  walls: SceneTemplateWall[];
  covers: SceneTemplateCover[];
  accessPoints: SceneTemplateAccessPoint[];
  /** Dane systemu dla całej sceny (CP RED: Architektury Sieci) — czyta moduł systemu. */
  system: unknown;
}

export interface SceneTemplateCreatePayload {
  templateId: string;
}

export interface SceneTemplateCreateResult {
  sceneId: string;
  /**
   * Czego wzorzec chciał, a kompendium tej kampanii nie zna (auto z katalogu,
   * broń, pancerz) — scena powstaje mimo to, MG dostaje listę.
   */
  missing: string[];
}

/* ───────────────────────── odczyt pliku ───────────────────────── */

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

function readChase(raw: unknown): SceneTemplateChase | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (!isObj(raw)) return undefined;
  const direction = (CHASE_DIRECTIONS as readonly unknown[]).includes(raw.direction)
    ? (raw.direction as ChaseDirection)
    : null;
  if (!direction) return undefined;
  const tempo = finite(raw.tempo) ? Math.round(raw.tempo) : 40;
  if (tempo < CHASE_TEMPO_MIN || tempo > CHASE_TEMPO_MAX) return undefined;
  let road: SceneTemplateChase['road'] = null;
  if (raw.road !== undefined && raw.road !== null) {
    if (!isObj(raw.road) || !Number.isInteger(raw.road.from) || !Number.isInteger(raw.road.to)) {
      return undefined;
    }
    const from = raw.road.from as number;
    const to = raw.road.to as number;
    if (from < 0 || to <= from) return undefined;
    road = { from, to };
  }
  return { direction, tempo, running: raw.running !== false, road };
}

function readScene(raw: unknown): SceneTemplateScene | null {
  if (!isObj(raw)) return null;
  const kind =
    raw.kind === 'chase' ? 'chase' : raw.kind === 'map' || raw.kind === undefined ? 'map' : null;
  if (!kind) return null;
  let backgroundUrl: string | null = null;
  if (raw.backgroundUrl !== undefined && raw.backgroundUrl !== null) {
    if (
      typeof raw.backgroundUrl !== 'string' ||
      !raw.backgroundUrl.startsWith(SCENE_TEMPLATE_URL_PREFIX) ||
      raw.backgroundUrl.includes('..')
    ) {
      return null;
    }
    backgroundUrl = raw.backgroundUrl;
  }
  const bgWidth =
    finite(raw.backgroundWidth) && raw.backgroundWidth > 0 ? raw.backgroundWidth : null;
  const bgHeight =
    finite(raw.backgroundHeight) && raw.backgroundHeight > 0 ? raw.backgroundHeight : null;
  if (backgroundUrl && (bgWidth === null || bgHeight === null)) return null;
  const width = finite(raw.width) && raw.width > 0 ? raw.width : (bgWidth ?? 4000);
  const height = finite(raw.height) && raw.height > 0 ? raw.height : (bgHeight ?? 3000);
  const gridSizePx = finite(raw.gridSizePx) && raw.gridSizePx >= 10 ? raw.gridSizePx : null;
  if (gridSizePx === null) return null;
  const chase = readChase(raw.chase);
  if (chase === undefined) return null;
  if (kind === 'chase' && chase === null) return null;
  let spawn: SceneTemplateScene['spawn'] = null;
  if (isObj(raw.spawn) && finite(raw.spawn.x) && finite(raw.spawn.y)) {
    spawn = { x: raw.spawn.x, y: raw.spawn.y };
  }
  if (raw.dark !== undefined && typeof raw.dark !== 'boolean') return null;
  let darkSightM = SCENE_DARK_SIGHT_DEFAULT_M;
  if (raw.darkSightM !== undefined) {
    if (!finite(raw.darkSightM) || raw.darkSightM < 0) return null;
    if (raw.darkSightM > SCENE_DARK_SIGHT_MAX_M) return null;
    darkSightM = raw.darkSightM;
  }
  return {
    kind,
    backgroundUrl,
    backgroundWidth: bgWidth,
    backgroundHeight: bgHeight,
    width,
    height,
    gridSizePx,
    gridOffsetX: finite(raw.gridOffsetX) ? raw.gridOffsetX : 0,
    gridOffsetY: finite(raw.gridOffsetY) ? raw.gridOffsetY : 0,
    gridVisible: raw.gridVisible !== false,
    gridPlayers: raw.gridPlayers === true,
    metersPerSquare:
      finite(raw.metersPerSquare) && raw.metersPerSquare > 0
        ? raw.metersPerSquare
        : kind === 'chase'
          ? 1
          : 2,
    visibility: isSceneVisibility(raw.visibility)
      ? raw.visibility
      : kind === 'chase'
        ? 'open'
        : 'dynamic',
    // Pościg nie ma ścian ani ciemności (jak `scene:create` z rodzajem „Pościg”).
    dark: kind === 'map' && raw.dark === true,
    darkSightM,
    explore: kind === 'map' && raw.explore !== false,
    partySight: raw.partySight === true,
    playerMove: isPlayerMoveMode(raw.playerMove) ? raw.playerMove : 'stop',
    ambience: isAmbiencePreset(raw.ambience) ? raw.ambience : 'none',
    spawn,
    chase: kind === 'chase' ? chase : null,
  };
}

function readVehicle(raw: unknown): SceneTemplateVehicle | null {
  if (!isObj(raw)) return null;
  const key = typeof raw.key === 'string' && KEY_PATTERN.test(raw.key) ? raw.key : null;
  const name = text(raw.name, VEHICLE_NAME_MAX);
  if (!key || !name || !finite(raw.x) || !finite(raw.y)) return null;
  let imageUrl: string | null = null;
  if (raw.imageUrl !== undefined && raw.imageUrl !== null) {
    if (!isVehicleArtUrl(raw.imageUrl)) return null;
    imageUrl = raw.imageUrl;
  }
  return { key, name, imageUrl, x: raw.x, y: raw.y, system: raw.system ?? null };
}

function readFigure(raw: unknown, vehicleKeys: ReadonlySet<string>): SceneTemplateFigure | null {
  if (!isObj(raw)) return null;
  const name = text(raw.name, FIGURE_NAME_MAX);
  if (!name) return null;
  let key: string | null = null;
  if (raw.key !== undefined && raw.key !== null) {
    if (typeof raw.key !== 'string' || !KEY_PATTERN.test(raw.key)) return null;
    key = raw.key;
  }
  const glyph = raw.glyph === undefined ? null : sanitizeTokenGlyph(raw.glyph);
  if (glyph === undefined) return null;
  let facing: number | null = null;
  if (raw.facing !== undefined && raw.facing !== null) {
    if (!finite(raw.facing)) return null;
    facing = ((raw.facing % 360) + 360) % 360;
  }
  let visionRange: number | null = null;
  if (raw.visionRange !== undefined && raw.visionRange !== null) {
    if (!finite(raw.visionRange) || raw.visionRange < 1) return null;
    if (raw.visionRange > VISION_RANGE_MAX_METRES) return null;
    visionRange = raw.visionRange;
  }
  let vehicle: SceneTemplateFigure['vehicle'] = null;
  if (raw.vehicle !== undefined && raw.vehicle !== null) {
    const seat = isObj(raw.vehicle) ? raw.vehicle.seat : undefined;
    const key = isObj(raw.vehicle) ? raw.vehicle.key : undefined;
    if (typeof key !== 'string' || !vehicleKeys.has(key)) return null;
    if (!Number.isInteger(seat) || (seat as number) < 0) return null;
    vehicle = { key, seat: seat as number };
  }
  // Figura w fotelu bierze miejsce z auta — liczby są wtedy nieobowiązkowe.
  if (!vehicle && (!finite(raw.x) || !finite(raw.y))) return null;
  return {
    key,
    name,
    x: finite(raw.x) ? raw.x : 0,
    y: finite(raw.y) ? raw.y : 0,
    vehicle,
    disposition: isTokenDisposition(raw.disposition) ? raw.disposition : null,
    hidden: raw.hidden === true,
    glyph,
    facing,
    visionRange,
    system: raw.system ?? null,
  };
}

function readPoint(raw: unknown): { x: number; y: number } | null {
  if (Array.isArray(raw) && raw.length === 2 && finite(raw[0]) && finite(raw[1])) {
    return { x: raw[0], y: raw[1] };
  }
  if (isObj(raw) && finite(raw.x) && finite(raw.y)) return { x: raw.x, y: raw.y };
  return null;
}

function readWall(raw: unknown): SceneTemplateWall | null {
  if (!isObj(raw) || !Array.isArray(raw.points) || raw.points.length < 2) return null;
  const kind: WallKind | null =
    raw.kind === undefined
      ? 'wall'
      : (WALL_KINDS as readonly unknown[]).includes(raw.kind)
        ? (raw.kind as WallKind)
        : null;
  if (!kind) return null;
  const points: { x: number; y: number }[] = [];
  for (const entry of raw.points) {
    const point = readPoint(entry);
    if (!point) return null;
    points.push(point);
  }
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.x === b.x && a.y === b.y) return null;
  }
  const opening = kind === 'door' || kind === 'window' || kind === 'gate';
  const barrier = kind === 'barrier' || kind === 'gate';
  let armor = 0;
  if (raw.armor !== undefined) {
    if (!barrier || !Number.isInteger(raw.armor)) return null;
    armor = raw.armor as number;
    if (armor < 0 || armor > WALL_ARMOR_MAX) return null;
  }
  return {
    kind,
    points,
    open: opening && raw.open === true,
    playerToggle: opening && raw.playerToggle === true,
    locked: opening && raw.locked === true,
    armor,
    hidesFigures: kind === 'barrier' && raw.hidesFigures === true,
  };
}

function readCover(raw: unknown): SceneTemplateCover | null {
  if (!isObj(raw)) return null;
  const name = text(raw.name, COVER_NAME_MAX);
  if (!name || !finite(raw.x) || !finite(raw.y)) return null;
  if (!finite(raw.width) || !finite(raw.height) || raw.width <= 0 || raw.height <= 0) return null;
  if (!Number.isInteger(raw.hp) || (raw.hp as number) < 0 || (raw.hp as number) > COVER_HP_MAX) {
    return null;
  }
  return {
    name,
    x: raw.x,
    y: raw.y,
    width: raw.width,
    height: raw.height,
    hp: raw.hp as number,
    hidden: raw.hidden === true,
  };
}

function readAccessPoint(raw: unknown): SceneTemplateAccessPoint | null {
  if (!isObj(raw) || !finite(raw.x) || !finite(raw.y)) return null;
  const name = text(raw.name, ACCESS_POINT_NAME_MAX);
  if (!name) return null;
  let notes = '';
  if (raw.notes !== undefined) {
    const read = text(raw.notes, ACCESS_POINT_NOTES_MAX);
    if (read === null) return null;
    notes = read;
  }
  let net: string | null = null;
  if (raw.net !== undefined && raw.net !== null) {
    if (typeof raw.net !== 'string' || !KEY_PATTERN.test(raw.net)) return null;
    net = raw.net;
  }
  return { name, x: raw.x, y: raw.y, hidden: raw.hidden !== false, notes, net };
}

function readNote(raw: unknown): SceneTemplateNote | null {
  if (!isObj(raw) || !finite(raw.x) || !finite(raw.y)) return null;
  const body = text(raw.text, NOTE_TEXT_MAX_LENGTH);
  if (!body) return null;
  const icon = (NOTE_ICONS as readonly unknown[]).includes(raw.icon)
    ? (raw.icon as NoteIcon)
    : NOTE_ICONS[0];
  return { x: raw.x, y: raw.y, icon, text: body };
}

/**
 * Wzorzec z pliku albo `null`, gdy plik jest zepsuty. Odmawia w całości,
 * a nie po kawałku: wzorzec pisze się w repo i ma się wysypać w teście, a nie
 * po cichu zgubić auto przy stole. `id` to nazwa katalogu — plik jej nie niesie.
 */
export function readSceneTemplate(raw: unknown, id: string): SceneTemplate | null {
  if (!SCENE_TEMPLATE_ID_PATTERN.test(id) || !isObj(raw)) return null;
  if (raw.schemaVersion !== SCENE_TEMPLATE_SCHEMA_VERSION) return null;
  const name = text(raw.name, SCENE_NAME_MAX_LENGTH);
  if (!name) return null;
  const description =
    raw.description === undefined ? '' : text(raw.description, SCENE_TEMPLATE_DESCRIPTION_MAX);
  if (description === null) return null;
  const category: SceneTemplateCategory = 'examples';
  if (raw.category !== undefined && raw.category !== category) return null;
  const scene = readScene(raw.scene);
  if (!scene) return null;

  const rawVehicles = Array.isArray(raw.vehicles) ? raw.vehicles : [];
  const rawFigures = Array.isArray(raw.figures) ? raw.figures : [];
  const rawNotes = Array.isArray(raw.notes) ? raw.notes : [];
  const rawWalls = Array.isArray(raw.walls) ? raw.walls : [];
  const rawCovers = Array.isArray(raw.covers) ? raw.covers : [];
  const rawPoints = Array.isArray(raw.accessPoints) ? raw.accessPoints : [];
  if (
    rawVehicles.length > SCENE_TEMPLATE_VEHICLES_MAX ||
    rawFigures.length > SCENE_TEMPLATE_FIGURES_MAX ||
    rawNotes.length > SCENE_TEMPLATE_NOTES_MAX ||
    rawCovers.length > SCENE_TEMPLATE_COVERS_MAX ||
    rawPoints.length > SCENE_TEMPLATE_ACCESS_POINTS_MAX
  ) {
    return null;
  }
  // Auta tylko na scenie pościgu — na mapie nie ma ich gdzie postawić.
  if (rawVehicles.length > 0 && scene.kind !== 'chase') return null;
  // Ściany, osłony i gniazda tylko na mapie — bieżnia pościgu przewija tło
  // pod wszystkim, co na niej stoi.
  if (
    scene.kind === 'chase' &&
    (rawWalls.length > 0 || rawCovers.length > 0 || rawPoints.length > 0)
  ) {
    return null;
  }

  const vehicles: SceneTemplateVehicle[] = [];
  for (const row of rawVehicles) {
    const vehicle = readVehicle(row);
    if (!vehicle || vehicles.some((other) => other.key === vehicle.key)) return null;
    vehicles.push(vehicle);
  }
  const keys = new Set(vehicles.map((vehicle) => vehicle.key));
  const figures: SceneTemplateFigure[] = [];
  const seats = new Set<string>();
  const figureKeys = new Set<string>();
  for (const row of rawFigures) {
    const figure = readFigure(row, keys);
    if (!figure) return null;
    if (figure.key) {
      if (figureKeys.has(figure.key)) return null;
      figureKeys.add(figure.key);
    }
    if (figure.vehicle) {
      const seat = `${figure.vehicle.key}#${figure.vehicle.seat}`;
      if (seats.has(seat)) return null;
      seats.add(seat);
    }
    figures.push(figure);
  }
  const notes: SceneTemplateNote[] = [];
  for (const row of rawNotes) {
    const note = readNote(row);
    if (!note) return null;
    notes.push(note);
  }
  const walls: SceneTemplateWall[] = [];
  let segments = 0;
  for (const row of rawWalls) {
    const wall = readWall(row);
    if (!wall) return null;
    segments += wall.points.length - 1;
    walls.push(wall);
  }
  if (segments > SCENE_TEMPLATE_WALL_SEGMENTS_MAX) return null;
  const covers: SceneTemplateCover[] = [];
  for (const row of rawCovers) {
    const cover = readCover(row);
    if (!cover) return null;
    covers.push(cover);
  }
  const accessPoints: SceneTemplateAccessPoint[] = [];
  for (const row of rawPoints) {
    const point = readAccessPoint(row);
    if (!point) return null;
    accessPoints.push(point);
  }

  return {
    schemaVersion: SCENE_TEMPLATE_SCHEMA_VERSION,
    id,
    name,
    description,
    category,
    scene,
    vehicles,
    figures,
    notes,
    walls,
    covers,
    accessPoints,
    system: raw.system ?? null,
  };
}

export function sceneTemplateSummary(template: SceneTemplate): SceneTemplateSummary {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    kind: template.scene.kind,
    backgroundUrl: template.scene.backgroundUrl,
    vehicles: template.vehicles.length,
    figures: template.figures.length,
  };
}

/** Kratki wzorca → piksele sceny (środek kratki `x` to `x × kratka + przesunięcie`). */
export function sceneTemplatePoint(
  scene: Pick<SceneTemplateScene, 'gridSizePx' | 'gridOffsetX' | 'gridOffsetY'>,
  at: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: scene.gridOffsetX + at.x * scene.gridSizePx,
    y: scene.gridOffsetY + at.y * scene.gridSizePx,
  };
}
