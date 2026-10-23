import type { ChatMessageView } from '@vtt/shared';
import { openCallDialog } from './components/DiceCup.js';
import { useChatStore } from './stores/chatStore.js';

/**
 * Kubek wezwania od razu po czynności, która je wystawiła — „Otwórz zamek”
 * pojemnika (46b) i „Rozbrój” strefy (58b). Wezwanie przychodzi na czat
 * osobnym zdarzeniem, więc czasem trzeba na nie chwilę poczekać. Gdy nie
 * przyjdzie, zostaje przycisk „Rzuć” na karcie wezwania.
 */
export function takeCallCup(messageId: number): void {
  const find = (): ChatMessageView | undefined => {
    for (const item of useChatStore.getState().items) {
      if (item.type === 'message' && item.message.id === messageId) return item.message;
    }
    return undefined;
  };
  const launch = (message: ChatMessageView | undefined): boolean => {
    if (!message?.check) return false;
    openCallDialog(message.id, message.check);
    return true;
  };
  if (launch(find())) return;
  const unsubscribe = useChatStore.subscribe(() => {
    if (launch(find())) {
      unsubscribe();
      window.clearTimeout(timer);
    }
  });
  const timer = window.setTimeout(unsubscribe, 5000);
}
