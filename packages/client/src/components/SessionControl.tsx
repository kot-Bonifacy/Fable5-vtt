import { useEffect, useRef, useState } from 'react';
import type { SocketAck } from '@vtt/shared';
import { ROLE_GM, sessionErrorText } from '@vtt/shared';
import { endSession, startSession } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCampaignPlayersStore } from '../stores/campaignPlayersStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { useSessionReadiness } from '../stores/gmAttentionStore.js';
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
 *
 * Start pyta o braki stołu (15.10, zlecenie MG): scena bez miejsca startu
 * i gracze bez postaci przyjętej do gry. Lista rozwija się pod przyciskiem,
 * a „Rozpocznij mimo to” zaczyna sesję — przypomnienie, nie blokada. Bez
 * braków sesja startuje od pierwszego kliknięcia.
 */
export function SessionControl() {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const campaign = useChatStore((s) => (s.synced ? s.campaign : null));
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [checking, setChecking] = useState(false);
  const readiness = useSessionReadiness();
  const checkRef = useRef<HTMLDivElement>(null);
  // Gracze kampanii (także nieobecni) do listy braków. Lista obecności
  // zmienia się, gdy ktoś nowy wchodzi z zaproszenia — wtedy czytamy ją od nowa.
  const presenceKey = useChatStore((s) =>
    s.presence
      .map((entry) => entry.userId)
      .sort()
      .join(' '),
  );
  const campaignId = campaign?.id ?? null;
  useEffect(() => {
    if (!isGm || !campaignId) return;
    void useCampaignPlayersStore.getState().load();
  }, [isGm, campaignId, presenceKey]);

  useEffect(() => {
    if (!checking) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!checkRef.current?.contains(event.target as Node)) setChecking(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setChecking(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [checking]);

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
      setChecking(false);
    }
  }

  if (!running) {
    const start = () => void run(() => startSession(campaign.id));
    return (
      <div className="session-control" ref={checkRef}>
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
          aria-expanded={readiness.length > 0 ? checking : undefined}
          onClick={() => (readiness.length > 0 ? setChecking((value) => !value) : start())}
          title="Zajmuje jedno z miejsc na sesję i wpuszcza graczy tej kampanii na stół"
        >
          Rozpocznij sesję
        </button>
        {checking && readiness.length > 0 && (
          <div className="session-check" role="dialog" aria-label="Zanim wpuścisz graczy">
            <p className="session-check-title">Zanim wpuścisz graczy</p>
            <ul className="session-check-list">
              {readiness.map((issue) => (
                <li key={issue.key} className="session-check-row">
                  {issue.text}
                </li>
              ))}
            </ul>
            {readiness.some((issue) => issue.kind === 'spawn') && (
              <p className="session-check-hint">
                Miejsce startu wyznaczasz chorągiewką 🚩 w pasku mapy (G), na aktywnej scenie.
              </p>
            )}
            <div className="session-check-actions">
              <button
                type="button"
                className="small-button small-button--primary"
                disabled={busy}
                onClick={start}
              >
                Rozpocznij mimo to
              </button>
              <button type="button" className="small-button" onClick={() => setChecking(false)}>
                Wróć do przygotowań
              </button>
            </div>
          </div>
        )}
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
