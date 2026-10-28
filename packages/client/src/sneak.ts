import { takeCallCup } from './call-cup.js';
import { useChatStore } from './stores/chatStore.js';

/**
 * Skradanie po stronie gracza (etap 61): prośba czeka na MG na czacie jak
 * każda prośba o Test, a gdy MG wybierze modyfikator, kubek z Testem
 * Skradania otwiera się sam — wzorem zamka (`takeCallCup`). Odmowa i
 * wycofanie kończą czekanie bez kubka.
 *
 * MG odpowiada zwykle od razu, ale bywa, że po kilku minutach. Czekanie
 * kończy się z rozstrzygnięciem albo po `WATCH_MS`; zostaje wtedy przycisk
 * „Rzuć” na karcie wezwania.
 */
const WATCH_MS = 30 * 60 * 1000;

export function watchSneakApproval(requestMessageId: number): void {
  const settled = (): boolean => {
    for (const item of useChatStore.getState().items) {
      if (item.type !== 'message' || item.message.id !== requestMessageId) continue;
      const resolution = item.message.request?.resolution;
      if (!resolution) return false;
      if (resolution.kind === 'approved' && resolution.callMessageId !== undefined) {
        takeCallCup(resolution.callMessageId);
      }
      return true;
    }
    return false;
  };
  if (settled()) return;
  const unsubscribe = useChatStore.subscribe(() => {
    if (settled()) {
      unsubscribe();
      window.clearTimeout(timer);
    }
  });
  const timer = window.setTimeout(unsubscribe, WATCH_MS);
}
