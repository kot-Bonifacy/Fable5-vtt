import type { ChatMessageView, CombatView, SessionUser } from '@vtt/shared';
import { playNaturalNotification } from './cup-notification.js';
import { useChatStore } from './stores/chatStore.js';

/** Each kind names its own sample in `public/notifications/`. No per-kind switch since 24.09. */
export type NotificationKind = 'turn' | 'whisper' | 'request' | 'handout' | 'inventory';
export function chatNotification(
  message: ChatMessageView,
  user: Pick<SessionUser, 'id' | 'role'>,
): NotificationKind | null {
  if (message.authorId === user.id) return null;
  if (message.kind === 'whisper' && message.recipientId === user.id && !message.recipientBotId)
    return 'whisper';
  // A Test request rings for the GM through „Czeka na MG” (`gm-attention.ts`,
  // 25.09) together with every other matter waiting for the GM's hand.
  if (
    message.kind === 'inventory' &&
    message.inventory?.toOwnerId === user.id &&
    !message.inventory.resolution
  )
    return 'inventory';
  // Prośba o operację (#41) dzwoni u Medyka — jak przekazanie u odbiorcy.
  if (
    message.kind === 'surgery' &&
    message.surgery?.surgeonOwnerId === user.id &&
    !message.surgery.resolution
  )
    return 'inventory';
  return null;
}
type TurnView = Pick<CombatView, 'id' | 'round' | 'activeCombatantId'> & {
  combatants: Pick<CombatView['combatants'][number], 'id' | 'ownerId'>[];
};
export function startsOwnTurn(
  previous: TurnView | null,
  next: TurnView | null,
  userId: string,
): boolean {
  if (!next || next.round < 1 || !next.activeCombatantId) return false;
  if (
    previous?.id === next.id &&
    previous.round === next.round &&
    previous.activeCombatantId === next.activeCombatantId
  )
    return false;
  return next.combatants.some((c) => c.id === next.activeCombatantId && c.ownerId === userId);
}
export function notifyGame(kind: NotificationKind) {
  const campaignId = useChatStore.getState().campaign?.id;
  void playNaturalNotification(
    kind,
    () => useChatStore.getState().synced && useChatStore.getState().campaign?.id === campaignId,
  );
}
