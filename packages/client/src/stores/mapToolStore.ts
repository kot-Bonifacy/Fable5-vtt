import { create } from 'zustand';
import {
  DRAWING_DEFAULT_COLOR,
  DRAWING_DEFAULT_FONT_SIZE,
  DRAWING_DEFAULT_WIDTH,
  DRAWING_LEGACY_FONT_SIZE,
  DRAWING_MAX_FONT_SIZE,
  DRAWING_MAX_WIDTH,
  DRAWING_MIN_FONT_SIZE,
  DRAWING_MIN_WIDTH,
  FOG_DEFAULT_BRUSH_RADIUS,
  type DrawingStyle,
  type FogMode,
} from '@vtt/shared';

/**
 * Which map tool has the left mouse button (stages 17a–17b).
 *
 * Before this stage the ruler owned a boolean of its own; with fog painting,
 * note pinning and now drawing joining it, „armed tool" became a single choice
 * — two tools fighting over the same drag is exactly the bug this prevents.
 * `pointer` is the normal state: pan the map, drag tokens.
 */
export const MAP_TOOLS = ['pointer', 'ruler', 'fog', 'note', 'draw', 'erase'] as const;
export type MapTool = (typeof MAP_TOOLS)[number];

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

/** Reads the stored settings, ignoring anything the format no longer knows. */
function loadDrawSettings(): DrawSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_DRAW_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DRAW_SETTINGS };
    const stored = JSON.parse(raw) as Partial<DrawSettings>;
    return {
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
        // A stored size equal to the old default was never chosen by anyone —
        // it is last version's default sitting in localStorage, and keeping it
        // would mean the new one never reaches the people who already used the
        // text tool once.
        typeof stored.drawFontSize === 'number' &&
        Math.round(stored.drawFontSize) !== DRAWING_LEGACY_FONT_SIZE
          ? clamp(Math.round(stored.drawFontSize), DRAWING_MIN_FONT_SIZE, DRAWING_MAX_FONT_SIZE)
          : DEFAULT_DRAW_SETTINGS.drawFontSize,
      drawGmOnly: stored.drawGmOnly !== false,
    };
  } catch {
    return { ...DEFAULT_DRAW_SETTINGS };
  }
}

function saveDrawSettings(settings: DrawSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A full or blocked storage must never break the toolbar.
  }
}

interface MapToolStoreState extends DrawSettings {
  tool: MapTool;
  /** Painting or erasing fog — the same two shapes serve both directions. */
  fogMode: FogMode;
  fogShape: FogBrushShape;
  /** Brush radius in scene pixels. */
  fogRadius: number;

  setTool: (tool: MapTool) => void;
  /** Clicking the armed tool again puts it away. */
  toggleTool: (tool: MapTool) => void;
  setFogMode: (fogMode: FogMode) => void;
  setFogShape: (fogShape: FogBrushShape) => void;
  setFogRadius: (fogRadius: number) => void;
  setDrawTool: (drawTool: DrawTool) => void;
  setDrawColor: (drawColor: string) => void;
  setDrawWidth: (drawWidth: number) => void;
  setDrawFilled: (drawFilled: boolean) => void;
  setDrawFontSize: (drawFontSize: number) => void;
  setDrawGmOnly: (drawGmOnly: boolean) => void;
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
    ...loadDrawSettings(),

    setTool: (tool) => set({ tool }),
    toggleTool: (tool) => set({ tool: get().tool === tool ? 'pointer' : tool }),
    setFogMode: (fogMode) => set({ fogMode }),
    setFogShape: (fogShape) => set({ fogShape }),
    setFogRadius: (fogRadius) => set({ fogRadius }),
    setDrawTool: (drawTool) => persist({ drawTool }),
    setDrawColor: (drawColor) => persist({ drawColor }),
    setDrawWidth: (drawWidth) => persist({ drawWidth }),
    setDrawFilled: (drawFilled) => persist({ drawFilled }),
    setDrawFontSize: (drawFontSize) => persist({ drawFontSize }),
    setDrawGmOnly: (drawGmOnly) => persist({ drawGmOnly }),
  };
});

/** The style the toolbar currently describes — what a new shape is drawn with. */
export function currentDrawingStyle(state: MapToolStoreState): DrawingStyle {
  return { color: state.drawColor, width: state.drawWidth, filled: state.drawFilled };
}
