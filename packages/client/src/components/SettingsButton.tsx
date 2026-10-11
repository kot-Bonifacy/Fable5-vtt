import { useEffect, useState } from 'react';
import { useChatStore } from '../stores/chatStore.js';
import { useMusicStore } from '../stores/musicStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useSettingsStore } from '../stores/settingsStore.js';

/** Ile ⚙ stoi między przerywnikami i ile trwa jeden przerywnik (decyzja MG z 11.10). */
const GEAR_MS = 6000;
const STATUS_MS = 2000;

type Status = 'music' | 'ambience';

const STATUS_TITLE: Record<Status, string> = {
  music: 'gra muzyka',
  ambience: 'gra otoczenie sceny',
};

/**
 * Wejście do okna ustawień (etap 27d).
 *
 * Zastąpiło osobne przełączniki w górnym pasku (☀/☾ z 27a i ⌨ z etapu 11):
 * pasek nosi tyle informacji o grze, że nie ma w nim miejsca na rosnącą listę
 * preferencji jednego użytkownika. 11.10 wchłonęło też przycisk muzyki ♫.
 *
 * Żeby muzyka nie zniknęła z paska razem ze swoim przyciskiem, ⚙ co kilka
 * sekund na chwilę oddaje miejsce ikonie tego, co gra: nucie (podkład) albo
 * falom (otoczenie sceny). „!” — przeglądarka zablokowała dźwięk — stoi na
 * stałe, bo wymaga ruchu gracza; kliknięcie otwiera wtedy zakładkę „Dźwięki”.
 */
export function SettingsButton() {
  const open = useSettingsStore((s) => s.open);
  const toggleOpen = useSettingsStore((s) => s.toggleOpen);

  const blocked = useMusicStore((s) => s.blocked);
  const campaignId = useChatStore((s) => s.campaign?.id);
  const synced = useChatStore((s) => s.synced);
  const musicPlaying = useMusicStore(
    (s) =>
      !!s.state && s.state.campaignId === campaignId && !!s.state.playback?.playing && !s.ended,
  );
  const ambience = useSceneStore((s) => s.scene?.ambience);
  const ambiencePlaying = synced && !!ambience && ambience !== 'none';

  const statuses: Status[] = [];
  if (musicPlaying) statuses.push('music');
  if (ambiencePlaying) statuses.push('ambience');
  const statusKey = statuses.join(',');

  // Indeks w kolejce: -1 to ⚙, 0…n-1 to kolejne przerywniki.
  const [shown, setShown] = useState(-1);
  useEffect(() => {
    setShown(-1);
    const count = statusKey ? statusKey.split(',').length : 0;
    if (count === 0) return;
    let index = -1;
    let timer: number;
    const step = () => {
      index = index + 1 < count ? index + 1 : -1;
      setShown(index);
      timer = window.setTimeout(step, index === -1 ? GEAR_MS : STATUS_MS);
    };
    timer = window.setTimeout(step, GEAR_MS);
    return () => window.clearTimeout(timer);
  }, [statusKey]);

  const icon: 'gear' | 'blocked' | Status = blocked ? 'blocked' : (statuses[shown] ?? 'gear');
  const label = 'Ustawienia — kości, widok, dźwięki i muzyka';
  const notes = [
    ...(blocked ? ['przeglądarka zablokowała dźwięk — kliknij'] : []),
    ...statuses.map((s) => STATUS_TITLE[s]),
  ];

  return (
    <button
      type="button"
      className={`small-button settings-button${open ? ' small-button--on' : ''}${
        blocked ? ' settings-button--alert' : ''
      }`}
      title={notes.length ? `${label}\n${notes.join(' · ')}` : label}
      aria-label={label}
      aria-pressed={open}
      onClick={() => {
        if (blocked) {
          useSettingsStore.getState().setTab('sound');
          useSettingsStore.getState().setOpen(true);
        } else toggleOpen();
      }}
    >
      {/* `key` restartuje animację wejścia przy każdej zmianie ikony. */}
      <span key={icon} className="settings-button-icon" aria-hidden="true">
        {icon === 'gear' && '⚙'}
        {icon === 'blocked' && '!'}
        {icon === 'music' && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18V5l12-2v13M9 9l12-2" />
            <ellipse cx="6" cy="18" rx="3" ry="2" />
            <ellipse cx="18" cy="16" rx="3" ry="2" />
          </svg>
        )}
        {icon === 'ambience' && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M2 8c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0" />
            <path d="M2 13c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0" />
            <path d="M2 18c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0" />
          </svg>
        )}
      </span>
    </button>
  );
}
