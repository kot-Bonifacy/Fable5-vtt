import { create } from 'zustand';
import {
  DRAWING_DEFAULT_COLOR,
  DRAWING_DEFAULT_FONT_SIZE,
  DRAWING_DEFAULT_WIDTH,
  DRAWING_MAX_FONT_SIZE,
  DRAWING_MAX_WIDTH,
  DRAWING_MIN_FONT_SIZE,
  DRAWING_MIN_WIDTH,
  FOG_DEFAULT_BRUSH_RADIUS,
  LIGHT_DEFAULT_BRIGHT_M,
  LIGHT_DEFAULT_COLOR,
  LIGHT_DEFAULT_DIM_M,
  EMPTY_COVER_CATALOGUE,
  WALL_ARMOR_MAX,
  isBarrier,
  buildCoverCatalogue,
  type CpredCoverCatalogue,
  type DrawingStyle,
  type FogMode,
  type WallKind,
} from '@vtt/shared';

/**
 * Which map tool has the left mouse button (stages 17a–17b).
 *
 * Before this stage the ruler owned a boolean of its own; with fog painting,
 * note pinning and now drawing joining it, „armed tool" became a single choice
 * — two tools fighting over the same drag is exactly the bug this prevents.
 * `pointer` is the normal state: pan the map, drag tokens.
 */
export const MAP_TOOLS = [
  'pointer',
  'ruler',
  'fog',
  'note',
  'draw',
  'wall',
  'cover',
  'zone',
  'light',
  'netpoint',
  'spawn',
] as const;
export type MapTool = (typeof MAP_TOOLS)[number];

/**
 * Żeton czekający na postawienie — uzbrojony w zakładce „Tokeny" albo przy
 * wierszu postaci; następny klik w mapę stawia go w tym miejscu.
 *
 * Mieszka **w tym samym store co `tool`** i to jest cała treść poprawki
 * z 28.08. Do tej pory był w `tokenStore`, czyli obok wyboru narzędzia, a nie
 * w nim — więc „uzbrojone narzędzie" i „żeton w ręku" były dwoma niezależnymi
 * stanami i dało się mieć oba naraz. Przy oględzinach 26b jeden klik postawił
 * **i** punkt dostępu, **i** żeton. Sam podwójny skutek zniknął z `clicked`
 * w sesji naprawczej 22.08 (`toolSpentThisClick`), ale zostawił gorszy objaw:
 * żeton wisiał w ręku niewidzialnie, a każdy klik szedł na narzędzie — i nic
 * tego nie tłumaczyło. Jedno pole na tryb znaczy, że dwóch mieć się nie da.
 */
export interface TokenPlacement {
  name: string;
  imageUrl: string | null;
  /**
   * Karta, do której nowy żeton ma być przywiązany (etap 28.08, „Postaw na
   * scenie" przy wierszu postaci). Bez niej powstaje pusty żeton z biblioteki.
   */
  characterId?: string | null;
  /** Właściciel przepisany z karty — żeton postaci gracza ma być jego. */
  ownerId?: string | null;
}

/*
 * Narzędzie ścian nie ma już trybów (etap 27l).
 *
 * Do 27k był tu `WallMode` z gumką w środku — powód, dla którego nikt nie
 * umiał znaleźć kasowania. 27k zabrało gumkę i zostawiło `lock` i `share`;
 * 27l zabrało i je, bo rygiel i „gracze mogą otwierać" przeszły na kartę
 * segmentu, gdzie widać, którego otworu dotyczą. Po każdym z tych kroków
 * zostawało mniej stanu do pamiętania, a pasek robi jedną rzecz: rysuje.
 */

/** How the fog tool paints: a round brush, or a dragged rectangle. */
export type FogBrushShape = 'brush' | 'rect';

/**
 * What the drawing tool draws. `pencil` and `line` both store a `path` — they
 * differ only in how the gesture is sampled — while the rest map one to one
 * onto a shape kind.
 */
export const DRAW_TOOLS = ['pencil', 'line', 'rect', 'ellipse', 'text'] as const;
export type DrawTool = (typeof DRAW_TOOLS)[number];

/** Persisted so the pen a GM likes is still there next session (stage 17b). */
const STORAGE_KEY = 'vtt.drawing-settings';

interface DrawSettings {
  drawTool: DrawTool;
  drawColor: string;
  drawWidth: number;
  drawFilled: boolean;
  drawFontSize: number;
  /** GM only: the next shape lands on the GM layer, invisible to players. */
  drawGmOnly: boolean;
}

const DEFAULT_DRAW_SETTINGS: DrawSettings = {
  drawTool: 'pencil',
  drawColor: DRAWING_DEFAULT_COLOR,
  drawWidth: DRAWING_DEFAULT_WIDTH,
  drawFilled: false,
  drawFontSize: DRAWING_DEFAULT_FONT_SIZE,
  // The GM's default is the private layer: a sketch that was meant to stay
  // behind the screen cannot be un-shown, while sharing one is a single click.
  drawGmOnly: true,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Bumped when a default changes in a way that should reach people who already
 * used the tool. Version 2 raised the label size from half a grid square to a
 * whole one; anything stored under an older version adopts the new size once,
 * and the stamp is written back immediately — otherwise a deliberate „Mała"
 * would be overwritten on every reload, which is exactly the trap the earlier
 * „is it equal to the old default?" check walked into once the dialog started
 * offering that size as a real choice.
 */
const SETTINGS_VERSION = 2;

type StoredDrawSettings = Partial<DrawSettings> & { version?: number };

/** Reads the stored settings, ignoring anything the format no longer knows. */
function loadDrawSettings(): DrawSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_DRAW_SETTINGS };
  let stored: StoredDrawSettings | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) stored = JSON.parse(raw) as StoredDrawSettings;
  } catch {
    stored = null;
  }
  if (!stored) return { ...DEFAULT_DRAW_SETTINGS };

  const settings: DrawSettings = {
    drawTool: DRAW_TOOLS.includes(stored.drawTool as DrawTool)
      ? (stored.drawTool as DrawTool)
      : DEFAULT_DRAW_SETTINGS.drawTool,
    drawColor:
      typeof stored.drawColor === 'string' && /^#[0-9a-f]{6}$/i.test(stored.drawColor)
        ? stored.drawColor
        : DEFAULT_DRAW_SETTINGS.drawColor,
    drawWidth:
      typeof stored.drawWidth === 'number'
        ? clamp(Math.round(stored.drawWidth), DRAWING_MIN_WIDTH, DRAWING_MAX_WIDTH)
        : DEFAULT_DRAW_SETTINGS.drawWidth,
    drawFilled: stored.drawFilled === true,
    drawFontSize:
      typeof stored.drawFontSize === 'number'
        ? clamp(Math.round(stored.drawFontSize), DRAWING_MIN_FONT_SIZE, DRAWING_MAX_FONT_SIZE)
        : DEFAULT_DRAW_SETTINGS.drawFontSize,
    drawGmOnly: stored.drawGmOnly !== false,
  };

  if (stored.version !== SETTINGS_VERSION) {
    settings.drawFontSize = DEFAULT_DRAW_SETTINGS.drawFontSize;
    saveDrawSettings(settings);
  }
  return settings;
}

function saveDrawSettings(settings: DrawSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, version: SETTINGS_VERSION }));
  } catch {
    // A full or blocked storage must never break the toolbar.
  }
}

interface MapToolStoreState extends DrawSettings {
  tool: MapTool;
  /** Żeton w ręku, czekający na klik w mapę; null = ręka pusta. */
  tokenPlacement: TokenPlacement | null;
  /** Painting or erasing fog — the same two shapes serve both directions. */
  fogMode: FogMode;
  fogShape: FogBrushShape;
  /** Brush radius in scene pixels. */
  fogRadius: number;
  /** What the next drawn chain becomes. */
  wallKind: WallKind;
  /** Doors: may the players open them themselves? */
  wallPlayerToggle: boolean;
  /** Windows: the same question, kept apart because the answer differs. */
  windowPlayerToggle: boolean;
  /**
   * Barriers and gates (stage 42b): the armour the next drawn one gets. Starts at
   * 0 and remembers the last number until the page is reloaded (decision of the
   * GM, 13.09.2026) — a fence is traced in runs, and each run is the same mesh.
   */
  wallArmor: number;
  /** Snap drawn points to the grid (endpoints of existing walls always win). */
  wallSnapGrid: boolean;
  /** Preset the next dragged rectangle becomes („car", „concrete-bollard"…). */
  coverTypeId: string;
  /**
   * The catalogue, fetched once from `data/public`. It lives with the tool
   * settings rather than in `coverStore` because only the GM's palette reads
   * it: what a *player* needs about a cover — its size, name and body points —
   * already travels with the row.
   */
  coverCatalogue: CpredCoverCatalogue;
  /** Compendium entry the next dragged rectangle becomes; '' = nothing armed. */
  zoneEntryId: string;
  /** Hidden until somebody notices it; the default for a system with a spot DV. */
  zoneHidden: boolean;
  /** Architecture the next placed socket leads to; '' = a dead socket. */
  netPointArchitectureId: string;
  /** Hidden until a Scanner finds it — the default, and the point of the flag. */
  netPointHidden: boolean;
  /** „Light this room": the server measures the walls and sizes the lamp. */
  lightFitRoom: boolean;
  /** What the next placed lamp gets, in metres. */
  lightBrightM: number;
  lightDimM: number;
  lightColor: string;
  lightFlicker: boolean;

  setTool: (tool: MapTool) => void;
  /** Clicking the armed tool again puts it away. */
  toggleTool: (tool: MapTool) => void;
  /** Bierze żeton do ręki (albo odkłada go, gdy `null`). */
  setTokenPlacement: (placement: TokenPlacement | null) => void;
  setFogMode: (fogMode: FogMode) => void;
  setFogShape: (fogShape: FogBrushShape) => void;
  setFogRadius: (fogRadius: number) => void;
  setDrawTool: (drawTool: DrawTool) => void;
  setDrawColor: (drawColor: string) => void;
  setDrawWidth: (drawWidth: number) => void;
  setDrawFilled: (drawFilled: boolean) => void;
  setDrawFontSize: (drawFontSize: number) => void;
  setDrawGmOnly: (drawGmOnly: boolean) => void;
  setWallKind: (wallKind: WallKind) => void;
  setWallPlayerToggle: (wallPlayerToggle: boolean) => void;
  setWindowPlayerToggle: (windowPlayerToggle: boolean) => void;
  /** Clamped to a whole number from 0 to `WALL_ARMOR_MAX`. */
  setWallArmor: (wallArmor: number) => void;
  setWallSnapGrid: (wallSnapGrid: boolean) => void;
  setCoverTypeId: (coverTypeId: string) => void;
  setCoverCatalogue: (coverCatalogue: CpredCoverCatalogue) => void;
  setZoneEntryId: (zoneEntryId: string) => void;
  setZoneHidden: (zoneHidden: boolean) => void;
  setNetPointArchitectureId: (netPointArchitectureId: string) => void;
  setNetPointHidden: (netPointHidden: boolean) => void;
  setLightFitRoom: (lightFitRoom: boolean) => void;
  setLightBrightM: (lightBrightM: number) => void;
  setLightDimM: (lightDimM: number) => void;
  setLightColor: (lightColor: string) => void;
  setLightFlicker: (lightFlicker: boolean) => void;
}

export const useMapToolStore = create<MapToolStoreState>((set, get) => {
  /** Every drawing setter goes through here, so nothing can forget to persist. */
  const persist = (patch: Partial<DrawSettings>) =>
    set((state) => {
      const next: DrawSettings = {
        drawTool: state.drawTool,
        drawColor: state.drawColor,
        drawWidth: state.drawWidth,
        drawFilled: state.drawFilled,
        drawFontSize: state.drawFontSize,
        drawGmOnly: state.drawGmOnly,
        ...patch,
      };
      saveDrawSettings(next);
      return next;
    });

  return {
    tool: 'pointer',
    fogMode: 'reveal',
    fogShape: 'brush',
    fogRadius: FOG_DEFAULT_BRUSH_RADIUS,
    wallKind: 'wall',
    // Doors default to the players' — the GM who wants a secret door unticks
    // it, which is the rarer case and the one worth a deliberate click.
    wallPlayerToggle: true,
    // Windows default the other way (stage 18e). Doors are drawn one at a time
    // and in doorways; windows are traced in runs along a whole elevation, so
    // „players may" by default would bury the map in 🪟 handles and announce
    // that every window in Night City is a way in. The GM opens the one that
    // matters with a single click.
    windowPlayerToggle: false,
    wallArmor: 0,
    wallSnapGrid: true,
    coverTypeId: '',
    coverCatalogue: EMPTY_COVER_CATALOGUE,
    zoneEntryId: '',
    zoneHidden: true,
    netPointArchitectureId: '',
    netPointHidden: true,
    lightFitRoom: false,
    lightBrightM: LIGHT_DEFAULT_BRIGHT_M,
    lightDimM: LIGHT_DEFAULT_DIM_M,
    lightColor: LIGHT_DEFAULT_COLOR,
    lightFlicker: false,
    ...loadDrawSettings(),

    tokenPlacement: null,

    // „Jedno kliknięcie trafia w jedną rzecz" — a to znaczy, że jednym
    // przypisaniem odkłada się poprzedni tryb. Narzędzie wytrąca żeton z ręki
    // i odwrotnie; `pointer` niczego nie wytrąca, bo to jest stan „ręce wolne".
    setTool: (tool) => set(tool === 'pointer' ? { tool } : { tool, tokenPlacement: null }),
    toggleTool: (tool) => {
      const next = get().tool === tool ? 'pointer' : tool;
      set(next === 'pointer' ? { tool: next } : { tool: next, tokenPlacement: null });
    },
    setTokenPlacement: (tokenPlacement) =>
      set(tokenPlacement === null ? { tokenPlacement } : { tokenPlacement, tool: 'pointer' }),
    setFogMode: (fogMode) => set({ fogMode }),
    setFogShape: (fogShape) => set({ fogShape }),
    setFogRadius: (fogRadius) => set({ fogRadius }),
    setDrawTool: (drawTool) => persist({ drawTool }),
    setDrawColor: (drawColor) => persist({ drawColor }),
    setDrawWidth: (drawWidth) => persist({ drawWidth }),
    setDrawFilled: (drawFilled) => persist({ drawFilled }),
    setDrawFontSize: (drawFontSize) => persist({ drawFontSize }),
    setDrawGmOnly: (drawGmOnly) => persist({ drawGmOnly }),
    setWallKind: (wallKind) => set({ wallKind }),
    setWallPlayerToggle: (wallPlayerToggle) => set({ wallPlayerToggle }),
    setWindowPlayerToggle: (windowPlayerToggle) => set({ windowPlayerToggle }),
    setWallArmor: (wallArmor) =>
      set({
        wallArmor: Number.isFinite(wallArmor)
          ? Math.min(WALL_ARMOR_MAX, Math.max(0, Math.round(wallArmor)))
          : 0,
      }),
    setWallSnapGrid: (wallSnapGrid) => set({ wallSnapGrid }),
    setCoverTypeId: (coverTypeId) => set({ coverTypeId }),
    setCoverCatalogue: (coverCatalogue) =>
      set((state) => ({
        coverCatalogue,
        // First catalogue in also picks the first preset, so the palette is
        // never armed with nothing selected.
        coverTypeId: state.coverTypeId || (coverCatalogue.presets[0]?.id ?? ''),
      })),
    setZoneEntryId: (zoneEntryId) => set({ zoneEntryId }),
    setZoneHidden: (zoneHidden) => set({ zoneHidden }),
    setNetPointArchitectureId: (netPointArchitectureId) => set({ netPointArchitectureId }),
    setNetPointHidden: (netPointHidden) => set({ netPointHidden }),
    setLightFitRoom: (lightFitRoom) => set({ lightFitRoom }),
    setLightBrightM: (lightBrightM) => set({ lightBrightM }),
    setLightDimM: (lightDimM) => set({ lightDimM }),
    setLightColor: (lightColor) => set({ lightColor }),
    setLightFlicker: (lightFlicker) => set({ lightFlicker }),
  };
});

/**
 * Is the opening about to be drawn the players' to work? Reads the flag that
 * belongs to the selected kind, so switching door ↔ window never silently
 * carries one kind's answer over to the other. A gate (stage 42a) shares the
 * door's flag: both are drawn one at a time, in a way through.
 */
export function currentPlayerToggle(state: MapToolStoreState): boolean {
  return state.wallKind === 'window' ? state.windowPlayerToggle : state.wallPlayerToggle;
}

/**
 * The armour the chain about to be drawn gets (stage 42b) — the toolbar's number
 * for a barrier or a gate, and nothing for any other kind, so a fence's number
 * never rides along on a wall drawn right after it.
 */
export function currentWallArmor(state: MapToolStoreState): number | undefined {
  return isBarrier({ kind: state.wallKind }) ? state.wallArmor : undefined;
}

/** The style the toolbar currently describes — what a new shape is drawn with. */
export function currentDrawingStyle(state: MapToolStoreState): DrawingStyle {
  return { color: state.drawColor, width: state.drawWidth, filled: state.drawFilled };
}

let catalogueRequested = false;

/**
 * Fetches the cover catalogue once per session.
 *
 * From the **API** rather than from `/public/`, unlike the status registry: a
 * group playing with the rulebook's own table has it in `data/private/`, which
 * is never served as a static file, and a palette reading the public samples
 * would promise body points the server does not use. A failure only leaves the
 * palette empty — every cover already on a scene keeps its numbers, because
 * those live on the row.
 */
export function ensureCoverCatalogueLoaded(): void {
  if (catalogueRequested) return;
  catalogueRequested = true;
  fetch('/api/cpred/covers')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((data: unknown) => {
      useMapToolStore.getState().setCoverCatalogue(buildCoverCatalogue(data));
    })
    .catch(() => {
      catalogueRequested = false;
    });
}
