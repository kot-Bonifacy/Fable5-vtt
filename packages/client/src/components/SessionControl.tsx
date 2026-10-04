import { useEffect, useState } from 'react';
import type { SocketAck } from '@vtt/shared';
import { ROLE_GM, sessionErrorText } from '@vtt/shared';
import { endSession, startSession } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { formatSessionClock } from '../session-view.js';

/** Ile sekund „Na pewno?” czeka na drugie kliknięcie. */
const CONFIRM_MS = 5000;

/**
 * Stan sesji w górnym pasku (etap 44c). MG widzi, czy przygotowuje, czy
 * sesja trwa (od kiedy), i jednym przyciskiem ją zaczyna albo kończy. Gracz
 * nie widzi tu niczego — o sesji mówi mu cały ekran.
 *
 * Koniec pyta drugim kliknięciem w tym samym miejscu, a nie oknem
 * przeglądarki: zdejmuje graczy ze stołu w środku gry, ale da się go cofnąć
 * („Rozpocznij sesję”), więc pytanie ma być lekkie i nie blokować karty.
 */
export function SessionControl() {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const campaign = useChatStore((s) => (s.synced ? s.campaign : null));
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  if (!isGm || !campaign) return null;
  const running = campaign.sessionStartedAt !== null;

  async function run(action: () => Promise<SocketAck<unknown>>) {
    setBusy(true);
    try {
      const ack = await action();
      if (!ack.ok) {
        useChatStore
          .getState()
          .addNote(sessionErrorText(ack.error) ?? 'Nie udało się zmienić stanu sesji.');
      }
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!running) {
    return (
      <div className="session-control">
        <span
          className="session-state session-state--prep"
          title="Przygotowujesz kampanię sam — gracze jej nie widzą, a serwer nie liczy jej do miejsc na sesje"
        >
          przygotowanie
        </span>
        <button
          type="button"
          className="small-button session-start"
          disabled={busy}
          onClick={() => void run(() => startSession(campaign.id))}
          title="Zajmuje jedno z miejsc na sesję i wpuszcza graczy tej kampanii na stół"
        >
          Rozpocznij sesję
        </button>
      </div>
    );
  }

  const since = formatSessionClock(campaign.sessionStartedAt!);
  return (
    <div className="session-control">
      <span className="session-state session-state--live" title={`Sesja trwa od ${since}`}>
        sesja · od {since}
      </span>
      {confirming ? (
        <>
          <button
            type="button"
            className="small-button session-end session-end--confirm"
            disabled={busy}
            onClick={() => void run(() => endSession(campaign.id))}
          >
            Na pewno? Zakończ
          </button>
          <button type="button" className="small-button" onClick={() => setConfirming(false)}>
            Anuluj
          </button>
        </>
      ) : (
        <button
          type="button"
          className="small-button session-end"
          disabled={busy}
          onClick={() => setConfirming(true)}
          title="Gracze wracają do widoku między sesjami, a miejsce na sesję się zwalnia"
        >
          Zakończ sesję
        </button>
      )}
    </div>
  );
}
