import type { CampaignSummary } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import { useAuthStore } from './stores/authStore.js';
import { useChatStore } from './stores/chatStore.js';

/**
 * Widok między sesjami (etap 44c): gracz ma kampanię, ale żadna sesja nie
 * trwa — siedzi przy karcie, dzienniku, handoutach i historii czatu, bez
 * mapy, walki i kubka. MG nigdy: on w tym czasie przygotowuje przy stole.
 */
export function isBetweenSessions(campaign: CampaignSummary | null, isGm: boolean): boolean {
  return !isGm && campaign !== null && campaign.sessionStartedAt === null;
}

/** Stan z ostatniego `state:sync` (albo `session:changed`), nie z REST-a. */
export function useBetweenSessions(): boolean {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  return useChatStore((s) => s.synced && isBetweenSessions(s.campaign, isGm));
}

/** „19:04”, a gdy to nie dziś — „3 paź, 19:04”. */
export function formatSessionClock(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  if (at.toDateString() === now.toDateString()) return time;
  const day = at.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
  return `${day}, ${time}`;
}
