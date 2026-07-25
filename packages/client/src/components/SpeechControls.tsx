import { useState } from 'react';
import { toggleSpeech } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { speechActive, useSpeechStore } from '../stores/speechStore.js';

/**
 * Speech controls in the top bar.
 *
 * Everyone gets a mute button and a volume slider that live in their own
 * browser; the GM additionally gets the session-wide switch, which silences
 * bots for the whole table. Muting locally never changes the pace at which
 * lines are written out — a muted player sees exactly what the others hear.
 */
export function SpeechControls() {
  const status = useSpeechStore((s) => s.status);
  const muted = useSpeechStore((s) => s.muted);
  const volume = useSpeechStore((s) => s.volume);
  const setMuted = useSpeechStore((s) => s.setMuted);
  const setVolume = useSpeechStore((s) => s.setVolume);
  const isGm = useAuthStore((s) => s.user?.role) === 'GM';
  const [slider, setSlider] = useState(false);

  if (!status?.available && !isGm) return null;

  const active = speechActive(status);
  const title = !status?.available
    ? 'Silnik mowy niedostępny — boty odpowiadają samym tekstem'
    : !status.enabled
      ? 'Mowa botów wyłączona przez MG'
      : muted
        ? 'Mowa botów wyciszona u Ciebie'
        : 'Mowa botów włączona';

  return (
    <span className={`speech-controls${active ? '' : ' speech-controls--off'}`}>
      <button
        type="button"
        className="small-button"
        title={title}
        aria-label={title}
        onClick={() => setMuted(!muted)}
        onDoubleClick={() => setSlider((open) => !open)}
      >
        {!active ? '🔇' : muted ? '🔈' : '🔊'}
      </button>
      {slider && (
        <input
          className="speech-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          title={`Głośność mowy: ${Math.round(volume * 100)}%`}
          onChange={(event) => setVolume(Number(event.target.value))}
        />
      )}
      {isGm && status?.available && (
        <button
          type="button"
          className={`small-button${status.enabled ? ' small-button--on' : ''}`}
          title={
            status.enabled
              ? 'Wyłącz mowę botów dla całego stołu'
              : 'Włącz mowę botów dla całego stołu'
          }
          onClick={() => void toggleSpeech(!status.enabled)}
        >
          {status.enabled ? 'Mowa: wł.' : 'Mowa: wył.'}
        </button>
      )}
    </span>
  );
}
