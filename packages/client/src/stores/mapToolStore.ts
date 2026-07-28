import { create } from 'zustand';
import { FOG_DEFAULT_BRUSH_RADIUS, type FogMode } from '@vtt/shared';

/**
 * Which map tool has the left mouse button (stage 17).
 *
 * Before this stage the ruler owned a boolean of its own; with fog painting
 * and note pinning joining it, „armed tool" became a single choice — two tools
 * fighting over the same drag is exactly the bug this prevents. `pointer` is
 * the normal state: pan the map, drag tokens.
 */
export const MAP_TOOLS = ['pointer', 'ruler', 'fog', 'note'] as const;
export type MapTool = (typeof MAP_TOOLS)[number];

/** How the fog tool paints: a round brush, or a dragged rectangle. */
export type FogBrushShape = 'brush' | 'rect';

interface MapToolStoreState {
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
}

export const useMapToolStore = create<MapToolStoreState>((set, get) => ({
  tool: 'pointer',
  fogMode: 'reveal',
  fogShape: 'brush',
  fogRadius: FOG_DEFAULT_BRUSH_RADIUS,

  setTool: (tool) => set({ tool }),
  toggleTool: (tool) => set({ tool: get().tool === tool ? 'pointer' : tool }),
  setFogMode: (fogMode) => set({ fogMode }),
  setFogShape: (fogShape) => set({ fogShape }),
  setFogRadius: (fogRadius) => set({ fogRadius }),
}));
