/**
 * Sceny przykładowe (etap 66, zlecenie MG z 31.10).
 *
 * Wzorzec sceny to plik `data/public/scenes/<id>/scene.json` w repozytorium —
 * gotowa scena do testów albo szybkiego użycia, którą widzi **każdy MG**
 * w panelu scen (sekcja „Przykładowe”) i dokłada do swojej kampanii jako
 * zwykłą, własną kopię. Wzorca nie zmienia się z aplikacji: nowy dokłada się
 * commitem (decyzja MG z 31.10 — „wzorce w repo”).
 *
 * Rdzeń zna tu tylko geometrię: tło, siatkę, ustawienia pościgu, auta (bryła
 * i grafika), figury (miejsce albo fotel) i notatki MG. Liczby systemu — z czego
 * zbudować auto i kartę NPC-a — leżą w nieprzejrzanych polach `system`, które
 * czyta moduł systemu (`systems/cpred/scene-template.ts`). Wzorzec opisuje
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
import { isTokenDisposition, type TokenDisposition } from './tokens.js';
import { VEHICLE_NAME_MAX, isVehicleArtUrl } from './vehicles.js';

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
const FIGURE_NAME_MAX = 64;
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
  name: string;
  /** Miejsce w kratkach — dla figury poza autem. */
  x: number;
  y: number;
  /** Fotel w aucie wzorca (0 — kierowca); `null` — figura stoi na mapie. */
  vehicle: { key: string; seat: number } | null;
  disposition: TokenDisposition | null;
  hidden: boolean;
  /** Statblok karty NPC-a — czyta moduł systemu. */
  system: unknown;
}

export interface SceneTemplateNote {
  x: number;
  y: number;
  icon: NoteIcon;
  text: string;
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
    name,
    x: finite(raw.x) ? raw.x : 0,
    y: finite(raw.y) ? raw.y : 0,
    vehicle,
    disposition: isTokenDisposition(raw.disposition) ? raw.disposition : null,
    hidden: raw.hidden === true,
    system: raw.system ?? null,
  };
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
  if (
    rawVehicles.length > SCENE_TEMPLATE_VEHICLES_MAX ||
    rawFigures.length > SCENE_TEMPLATE_FIGURES_MAX ||
    rawNotes.length > SCENE_TEMPLATE_NOTES_MAX
  ) {
    return null;
  }
  // Auta tylko na scenie pościgu — na mapie nie ma ich gdzie postawić.
  if (rawVehicles.length > 0 && scene.kind !== 'chase') return null;

  const vehicles: SceneTemplateVehicle[] = [];
  for (const row of rawVehicles) {
    const vehicle = readVehicle(row);
    if (!vehicle || vehicles.some((other) => other.key === vehicle.key)) return null;
    vehicles.push(vehicle);
  }
  const keys = new Set(vehicles.map((vehicle) => vehicle.key));
  const figures: SceneTemplateFigure[] = [];
  const seats = new Set<string>();
  for (const row of rawFigures) {
    const figure = readFigure(row, keys);
    if (!figure) return null;
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
