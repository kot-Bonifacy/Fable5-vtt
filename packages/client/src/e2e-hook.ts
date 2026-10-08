import type { ScenePoint } from '@vtt/shared';
import { diceE2ECounts } from './dice3d.js';
import { useAiStore } from './stores/aiStore.js';
import { useOwnerAiStore } from './stores/ownerAiStore.js';
import { useAuthStore } from './stores/authStore.js';
import { useBotStore } from './stores/botStore.js';
import { useCharacterStore } from './stores/characterStore.js';
import { useChatStore } from './stores/chatStore.js';
import { useCombatStore } from './stores/combatStore.js';
import { useCoverStore } from './stores/coverStore.js';
import { useDrawingStore } from './stores/drawingStore.js';
import { useExplorationStore } from './stores/explorationStore.js';
import { useFogStore } from './stores/fogStore.js';
import { useHandoutStore } from './stores/handoutStore.js';
import { useLightStore } from './stores/lightStore.js';
import { useMusicStore } from './stores/musicStore.js';
import { useNetRunStore } from './stores/netRunStore.js';
import { usePaceStore } from './stores/paceStore.js';
import { useRollStore } from './stores/rollStore.js';
import { useSceneStore } from './stores/sceneStore.js';
import { useSelectionStore } from './stores/selectionStore.js';
import { useSettingsStore } from './stores/settingsStore.js';
import { useTableStore } from './stores/tableStore.js';
import { useTokenStore } from './stores/tokenStore.js';
import { useTradeStore } from './stores/tradeStore.js';
import { useWallStore } from './stores/wallStore.js';
import { useZoneStore } from './stores/zoneStore.js';

/**
 * Hak testów E2E: `window.__vttE2E` (plan testów bety, `testy.md` 4.3; zgoda MG z 26.09.2026).
 *
 * Istnieje **wyłącznie w buildzie `vite build --mode e2e`**. Oba wejścia niżej są
 * owinięte w `import.meta.env.MODE === 'e2e'`, które Vite podmienia na stałą, więc
 * w zwykłym buildzie cała treść wypada jako martwy kod — test `00-baseline`
 * pilnuje, że napisu `__vttE2E` nie ma w paczce produkcyjnej.
 *
 * Hak tylko **czyta**: kamerę (klik w płótno Pixi po współrzędnych sceny), magazyny
 * i liczniki obiektów (T7c, zgoda MG z 02.10). Stan zmienia się wyłącznie przez UI
 * albo gniazdo, jak u gracza.
 */
export interface VttE2EHook {
  /** Punkt sceny → `clientX`/`clientY`; `null`, gdy mapy nie ma na ekranie. */
  worldToClient(point: ScenePoint): ScenePoint | null;
  stores: Record<string, { getState(): unknown }>;
  /**
   * Liczniki do szukania wycieku (T7c): drzewo i tekstury Pixi mapy, stół kości 3D
   * (three.js) i DOM. Działa w obu silnikach — sterty JS Firefox nie udostępnia.
   */
  counts(): {
    pixi: Record<string, number> | null;
    dice: Record<string, number> | null;
    dom: { nodes: number; canvases: number };
  };
}

declare global {
  interface Window {
    __vttE2E?: VttE2EHook;
  }
}

let mapToClient: ((point: ScenePoint) => ScenePoint | null) | null = null;
let mapCounts: (() => Record<string, number> | null) | null = null;

/** Wołane raz ze startu aplikacji (`main.tsx`). */
export function installE2EHook(): void {
  if (import.meta.env.MODE === 'e2e') {
    window.__vttE2E = {
      worldToClient: (point) => mapToClient?.(point) ?? null,
      counts: () => ({
        pixi: mapCounts?.() ?? null,
        dice: diceE2ECounts(),
        dom: {
          nodes: document.getElementsByTagName('*').length,
          canvases: document.getElementsByTagName('canvas').length,
        },
      }),
      stores: {
        ai: useAiStore,
        auth: useAuthStore,
        bot: useBotStore,
        character: useCharacterStore,
        chat: useChatStore,
        combat: useCombatStore,
        cover: useCoverStore,
        drawing: useDrawingStore,
        exploration: useExplorationStore,
        fog: useFogStore,
        handout: useHandoutStore,
        light: useLightStore,
        music: useMusicStore,
        netRun: useNetRunStore,
        ownerAi: useOwnerAiStore,
        pace: usePaceStore,
        roll: useRollStore,
        scene: useSceneStore,
        selection: useSelectionStore,
        settings: useSettingsStore,
        table: useTableStore,
        token: useTokenStore,
        trade: useTradeStore,
        wall: useWallStore,
        zone: useZoneStore,
      },
    };
  }
}

/** Renderer mapy zgłasza się tu po starcie i wyrejestrowuje (`null`) przy sprzątaniu. */
export function exposeMapToE2E(
  renderer: {
    worldToClient(point: ScenePoint): ScenePoint | null;
    e2eCounts(): Record<string, number> | null;
  } | null,
): void {
  if (import.meta.env.MODE === 'e2e') {
    mapToClient = renderer ? (point) => renderer.worldToClient(point) : null;
    mapCounts = renderer ? () => renderer.e2eCounts() : null;
  }
}
