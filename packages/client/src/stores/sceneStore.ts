import { create } from 'zustand';
import type { ScenePatch, SceneSummary, SceneView, StateSyncPayload } from '@vtt/shared';

/** Applies a local (unsaved) editor patch on top of the server scene state. */
export function mergeScenePatch(scene: SceneView, patch: ScenePatch): SceneView {
  return {
    ...scene,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.background !== undefined ? { background: patch.background } : {}),
    ...(patch.width !== undefined ? { width: patch.width } : {}),
    ...(patch.height !== undefined ? { height: patch.height } : {}),
    ...(patch.gridMode !== undefined ? { gridMode: patch.gridMode } : {}),
    ...(patch.metersPerSquare !== undefined ? { metersPerSquare: patch.metersPerSquare } : {}),
    grid: { ...scene.grid, ...patch.grid },
  };
}

interface SceneStoreState {
  /** Scene this client views, as last confirmed by the server. */
  scene: SceneView | null;
  /** GM scene manager list; always empty for players. */
  scenes: SceneSummary[];
  /** Unsaved live-editor changes (GM), merged into `effectiveScene`. */
  draft: ScenePatch | null;
  /** `scene` + `draft` — the thing the map renderer displays. */
  effectiveScene: SceneView | null;

  applySync: (payload: StateSyncPayload) => void;
  /** Replaces the viewed scene (activation for players, scene:view for GM). */
  setScene: (scene: SceneView | null) => void;
  /** Applies a scene broadcast only when it concerns the viewed scene. */
  applyScene: (scene: SceneView) => void;
  setScenes: (scenes: SceneSummary[]) => void;
  setDraft: (draft: ScenePatch | null) => void;
  /** Merges fields into the current draft (live editing). */
  patchDraft: (fields: ScenePatch) => void;
}

function withEffective(
  state: Pick<SceneStoreState, 'scene' | 'draft'>,
): Pick<SceneStoreState, 'scene' | 'draft' | 'effectiveScene'> {
  return {
    ...state,
    effectiveScene:
      state.scene && state.draft ? mergeScenePatch(state.scene, state.draft) : state.scene,
  };
}

export const useSceneStore = create<SceneStoreState>((set, get) => ({
  scene: null,
  scenes: [],
  draft: null,
  effectiveScene: null,

  applySync: (payload) =>
    set((state) => ({
      scenes: payload.scenes,
      // Keep an in-progress draft only if we are still on the same scene.
      ...withEffective({
        scene: payload.scene,
        draft: state.draft && payload.scene?.id === state.scene?.id ? state.draft : null,
      }),
    })),

  setScene: (scene) =>
    set((state) => ({
      ...withEffective({
        scene,
        draft: state.draft && scene?.id === state.scene?.id ? state.draft : null,
      }),
    })),

  applyScene: (scene) => {
    const state = get();
    if (state.scene?.id !== scene.id) return;
    set(withEffective({ scene, draft: state.draft }));
  },

  setScenes: (scenes) => set({ scenes }),

  setDraft: (draft) => set((state) => withEffective({ scene: state.scene, draft })),

  patchDraft: (fields) =>
    set((state) => {
      const draft: ScenePatch = {
        ...state.draft,
        ...fields,
        ...(fields.grid || state.draft?.grid
          ? { grid: { ...state.draft?.grid, ...fields.grid } }
          : {}),
      };
      return withEffective({ scene: state.scene, draft });
    }),
}));
