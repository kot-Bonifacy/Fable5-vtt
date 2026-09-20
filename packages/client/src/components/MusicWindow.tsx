import { useState } from 'react';
import { MUSIC_ACCEPT, MUSIC_MAX_BYTES, ROLE_GM, type MusicCommand } from '@vtt/shared';
import { apiUpload } from '../api.js';
import { confirmDestructive } from '../confirm.js';
import { controlMusic } from '../socket.js';
import { enableMusic } from '../music-player.js';
import { useAuthStore } from '../stores/authStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { useMusicStore } from '../stores/musicStore.js';
import { useSettingsStore } from '../stores/settingsStore.js';
import { useWindowPlacement } from '../window-placement.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';

export function MusicButton() {
  const open = useMusicStore((s) => s.open);
  const blocked = useMusicStore((s) => s.blocked);
  return (
    <button
      type="button"
      className={`small-button${open ? ' small-button--on' : ''}`}
      title="Podkłady muzyczne"
      aria-label="Podkłady muzyczne"
      aria-pressed={open}
      onClick={() => useMusicStore.setState({ open: !open })}
    >
      {blocked ? (
        '!'
      ) : (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M9 18V5l12-2v13M9 9l12-2" />
          <ellipse cx="6" cy="18" rx="3" ry="2" />
          <ellipse cx="18" cy="16" rx="3" ry="2" />
        </svg>
      )}
    </button>
  );
}

export function MusicWindow() {
  const { state, open, error, blocked, ended } = useMusicStore();
  const gm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const campaignId = useChatStore((s) => s.campaign?.id);
  const synced = useChatStore((s) => s.synced);
  const volume = useSettingsStore((s) => s.musicVolume);
  const setVolume = useSettingsStore((s) => s.setMusicVolume);
  const [busy, setBusy] = useState(false);
  const placement = useWindowPlacement('music', () => ({
    x: Math.max(12, window.innerWidth - 470),
    y: 95,
  }));
  if (!open) return null;
  const playback = state && state.campaignId === campaignId ? state.playback : null;
  const ready = synced && !!campaignId && !busy;
  async function command(action: MusicCommand) {
    setBusy(true);
    useMusicStore.setState({ error: null });
    try {
      const result = await controlMusic(action);
      if (!result.ok)
        useMusicStore.setState({
          error: 'Nie udało się zmienić muzyki. Sprawdź połączenie i aktywną kampanię.',
        });
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: FileList | null) {
    if (!files || !campaignId) return;
    setBusy(true);
    useMusicStore.setState({ error: null });
    try {
      for (const file of Array.from(files)) {
        if (!/\.(mp3|ogg|wav)$/i.test(file.name) || file.size > MUSIC_MAX_BYTES)
          throw new Error('format');
        await apiUpload(`/api/music/${encodeURIComponent(campaignId)}/upload`, file);
      }
    } catch {
      useMusicStore.setState({
        error: 'Nie udało się wgrać pliku. Wybierz MP3, OGG lub WAV do 40 MB i sprawdź połączenie.',
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      ref={placement.ref}
      className="settings-window music-window"
      style={placement.style}
      aria-label="Podkłady muzyczne"
      data-owns-keys
    >
      <div className="settings-window-header" {...placement.dragProps}>
        <span className="settings-window-title">Podkłady muzyczne</span>
        <button
          type="button"
          className="sheet-close"
          title="Zamknij muzykę"
          aria-label="Zamknij muzykę"
          onClick={() => useMusicStore.setState({ open: false })}
        >
          ✕
        </button>
      </div>
      <div className="settings-window-body">
        <section className="settings-group">
          <label className="settings-row">
            <span className="settings-label">Głośność u Ciebie</span>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
            <span className="settings-value">{volume}</span>
          </label>
          <p className="settings-note">
            Zero wycisza muzykę tylko u Ciebie. Efekty i sygnał kubka mają osobne ustawienia.
          </p>
          {blocked && (
            <button type="button" onClick={enableMusic}>
              Włącz odtwarzanie dźwięku
            </button>
          )}
          {error && <p role="alert">{error}</p>}
          <p aria-live="polite">
            {playback
              ? `${playback.playing ? (ended ? 'Zakończono' : 'Odtwarzanie') : 'Pauza'}: ${playback.track.name}`
              : 'Muzyka zatrzymana'}
          </p>
          {!synced && <p role="status">Brak połączenia ze stołem.</p>}
          {gm && playback && campaignId && (
            <>
              <div className="settings-samples">
                <button
                  disabled={!ready}
                  type="button"
                  onClick={() =>
                    void command({ campaignId, action: playback.playing ? 'pause' : 'resume' })
                  }
                >
                  {playback.playing ? 'Pauza' : 'Wznów'}
                </button>
                <button
                  disabled={!ready}
                  type="button"
                  onClick={() => void command({ campaignId, action: 'stop' })}
                >
                  Zatrzymaj
                </button>
              </div>
              <label className="settings-row">
                <input
                  type="checkbox"
                  disabled={!ready}
                  checked={playback.loop}
                  onChange={(e) =>
                    void command({ campaignId, action: 'loop', loop: e.target.checked })
                  }
                />
                Zapętl utwór
              </label>
              <label className="settings-row">
                <span className="settings-label">Głośność dla stołu</span>
                <select
                  disabled={!ready}
                  value={playback.volume}
                  onChange={(e) =>
                    void command({ campaignId, action: 'volume', volume: Number(e.target.value) })
                  }
                >
                  {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => (
                    <option key={v} value={v}>
                      {v}%
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </section>
        {gm && (
          <section className="settings-group">
            <h3 className="settings-group-title">Biblioteka kampanii</h3>
            <label className="music-upload">
              Dodaj podkłady (MP3, OGG, WAV · do 40 MB)
              <input
                type="file"
                accept={MUSIC_ACCEPT}
                multiple
                disabled={!ready}
                onChange={(e) => {
                  void upload(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            {busy && <p role="status">Zapisywanie…</p>}
            <ul className="music-tracks">
              {state &&
                campaignId &&
                state.campaignId === campaignId &&
                state.tracks.map((track) => (
                  <li key={track.id}>
                    <span title={track.name}>{track.name}</span>
                    <button
                      type="button"
                      disabled={!ready}
                      onClick={() =>
                        void command({ campaignId, action: 'play', trackId: track.id })
                      }
                    >
                      Odtwórz
                    </button>
                    <button
                      type="button"
                      disabled={!ready}
                      onClick={() => {
                        if (confirmDestructive(`Usunąć podkład „${track.name}” z biblioteki?`))
                          void command({ campaignId, action: 'remove', trackId: track.id });
                      }}
                    >
                      Usuń
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </div>
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}
