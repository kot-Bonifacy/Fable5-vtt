import { ROLE_GM, type ChatMessageView, type CombatView, type SessionUser } from '@vtt/shared';
import { audioContext, playNaturalNotification } from './cup-notification.js';
import { useSettingsStore } from './stores/settingsStore.js';
import { useChatStore } from './stores/chatStore.js';

export const NOTIFICATION_LABELS = {
  turn: 'Początek Twojej tury',
  whisper: 'Otrzymany szept',
  request: 'Prośba o Test (MG)',
  handout: 'Otrzymany materiał',
  inventory: 'Przedmiot do przyjęcia',
} as const;
export type NotificationKind = keyof typeof NOTIFICATION_LABELS;
export function chatNotification(
  message: ChatMessageView,
  user: Pick<SessionUser, 'id' | 'role'>,
): NotificationKind | null {
  if (message.authorId === user.id) return null;
  if (message.kind === 'whisper' && message.recipientId === user.id && !message.recipientBotId)
    return 'whisper';
  if (
    message.kind === 'request' &&
    message.request &&
    !message.request.resolution &&
    user.role === ROLE_GM
  )
    return 'request';
  if (
    message.kind === 'inventory' &&
    message.inventory?.toOwnerId === user.id &&
    !message.inventory.resolution
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
  if (useSettingsStore.getState().notifications[kind])
    void playNaturalNotification(
      kind,
      () =>
        useSettingsStore.getState().notifications[kind] &&
        useChatStore.getState().synced &&
        useChatStore.getState().campaign?.id === campaignId,
    );
}
export function auditionNotification(kind: NotificationKind) {
  void audioContext()
    .resume()
    .then(() => playNaturalNotification(kind))
    .catch(() => undefined);
}
