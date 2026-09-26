import type { ScenePoint } from '@vtt/shared';
import { useAuthStore } from './stores/authStore.js';
import { useBotStore } from './stores/botStore.js';
import { useCharacterStore } from './stores/characterStore.js';
import { useChatStore } from './stores/chatStore.js';
import { useCombatStore } from './stores/combatStore.js';
import { useExplorationStore } from './stores/explorationStore.js';
import { useHandoutStore } from './stores/handoutStore.js';
import { useRollStore } from './stores/rollStore.js';
import { useSceneStore } from './stores/sceneStore.js';
import { useTokenStore } from './stores/tokenStore.js';

/**
 * Hak testów E2E: `window.__vttE2E` (plan testów bety, `testy.md` 4.3; zgoda MG z 26.09.2026).
 *
 * Istnieje **wyłącznie w buildzie `vite build --mode e2e`**. Oba wejścia niżej są
 * owinięte w `import.meta.env.MODE === 'e2e'`, które Vite podmienia na stałą, więc
 * w zwykłym buildzie cała treść wypada jako martwy kod — test `00-baseline`
 * pilnuje, że napisu `__vttE2E` nie ma w paczce produkcyjnej.
 *
 * Hak tylko **czyta**: kamerę (klik w płótno Pixi po współrzędnych sceny) i magazyny.
 * Stan zmienia się wyłącznie przez UI albo gniazdo, jak u gracza.
 */
export interface VttE2EHook {
  /** Punkt sceny → `clientX`/`clientY`; `null`, gdy mapy nie ma na ekranie. */
  worldToClient(point: ScenePoint): ScenePoint | null;
  stores: Record<string, { getState(): unknown }>;
}

declare global {
  interface Window {
    __vttE2E?: VttE2EHook;
  }
}

let mapToClient: ((point: ScenePoint) => ScenePoint | null) | null = null;

/** Wołane raz ze startu aplikacji (`main.tsx`). */
export function installE2EHook(): void {
  if (import.meta.env.MODE === 'e2e') {
    window.__vttE2E = {
      worldToClient: (point) => mapToClient?.(point) ?? null,
      stores: {
        auth: useAuthStore,
        bot: useBotStore,
        character: useCharacterStore,
        chat: useChatStore,
        combat: useCombatStore,
        exploration: useExplorationStore,
        handout: useHandoutStore,
        roll: useRollStore,
        scene: useSceneStore,
        token: useTokenStore,
      },
    };
  }
}

/** Renderer mapy zgłasza się tu po starcie i wyrejestrowuje (`null`) przy sprzątaniu. */
export function exposeMapToE2E(
  renderer: { worldToClient(point: ScenePoint): ScenePoint | null } | null,
): void {
  if (import.meta.env.MODE === 'e2e') {
    mapToClient = renderer ? (point) => renderer.worldToClient(point) : null;
  }
}
