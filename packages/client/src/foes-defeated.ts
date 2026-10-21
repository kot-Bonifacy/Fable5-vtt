import { useEffect, useState } from 'react';
import { ROLE_GM, foesDefeated } from '@vtt/shared';
import type { PinnedNotice } from './components/NoticeColumn.js';
import { noteAck, notifyChoice } from './notices.js';
import { useNoticeStore } from './stores/noticeStore.js';
import { combatErrorText, endCombat } from './socket.js';
import { useAuthStore } from './stores/authStore.js';
import { useCombatStore } from './stores/combatStore.js';

/**
 * Pytanie przed końcem walki (✕ w pasku tury, „Zakończ walkę” w trackerze) —
 * pasek w kanale komunikatów zamiast przeglądarkowego `window.confirm`, w tej
 * samej skórze co „Przeciwnicy pokonani” (zlecenie MG z 21.10). Walka
 * skończona inną drogą zdejmuje pytanie, które straciło przedmiot.
 */
export function askEndCombat(text: string, confirmLabel: string): void {
  const noticeId = notifyChoice(
    'action',
    `${text} Kolejka inicjatywy zostanie skasowana.`,
    [
      {
        label: confirmLabel,
        run: () => void endCombat().then((ack) => noteAck('action', ack, combatErrorText)),
      },
      { label: 'Anuluj', run: () => undefined },
    ],
    { title: 'Koniec walki', silent: true },
  );
  const stop = useCombatStore.subscribe((state) => {
    if (state.combat !== null) return;
    useNoticeStore.getState().dismiss(noticeId);
    stop();
  });
}

/**
 * „Przeciwnicy pokonani” (17.10.2026, zlecenie MG): gdy w trwającej walce
 * cała strona MG ma stan Martwy, MG dostaje nad mapą bursztynowy pasek
 * z „Zakończ walkę”. Walka nie kończy się sama — za rogiem może czekać druga
 * fala — więc „Jeszcze nie” chowa pasek do następnego takiego stanu. Gracze
 * nie widzą nic.
 */
export function useFoesDefeatedNotice(): PinnedNotice | null {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const defeated = useCombatStore((s) => s.combat !== null && foesDefeated(s.combat));
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    if (!defeated) setDeclined(false);
  }, [defeated]);

  if (!isGm || !defeated || declined) return null;
  return {
    key: 'foes-defeated',
    tone: 'warn',
    title: 'Przeciwnicy pokonani',
    text: 'Wszyscy przeciwnicy drużyny są pokonani. Zakończyć walkę?',
    actions: [
      {
        label: 'Zakończ walkę',
        title: 'Kolejka inicjatywy zostanie skasowana',
        run: () => void endCombat().then((ack) => noteAck('action', ack, combatErrorText)),
      },
      { label: 'Jeszcze nie', run: () => setDeclined(true) },
    ],
  };
}
