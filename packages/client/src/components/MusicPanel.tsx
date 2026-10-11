import { useState } from 'react';
import {
  MUSIC_ACCEPT,
  MUSIC_MAX_BYTES,
  ROLE_GM,
  youtubeVideoId,
  type MusicCommand,
} from '@vtt/shared';
import { SceneAmbience } from './SceneAmbience.js';
import { YouTubeAudioImport } from './YouTubeAudioImport.js';
import { apiPost, apiUpload } from '../api.js';
import { confirmDestructive } from '../confirm.js';
import { controlMusic } from '../socket.js';
import { enableMusic } from '../music-player.js';
import { useAuthStore } from '../stores/authStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { useMusicStore } from '../stores/musicStore.js';
import { useSettingsStore } from '../stores/settingsStore.js';

/**
 * Muzyka w zakładce „Dźwięki” okna ustawień (11.10, decyzja MG: jeden przycisk
 * ⚙ zamiast osobnych „Ustawień” i „Podkładów muzycznych”). Odtwarzacz żyje
 * w `useMusicPlayer` u korzenia stołu, więc zamknięte okno niczego nie wycisza.
 */
export function MusicPanel() {
  const { state, error, blocked, ended } = useMusicStore();
  const gm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const campaignId = useChatStore((s) => s.campaign?.id);
  const synced = useChatStore((s) => s.synced);
  const volume = useSettingsStore((s) => s.musicVolume);
  const setVolume = useSettingsStore((s) => s.setMusicVolume);
  const [busy, setBusy] = useState(false);
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
      return result.ok;
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
  async function importLegacy(url: string, name: string) {
    setBusy(true);
    useMusicStore.setState({ error: null });
    try {
      await apiPost(`/api/music/${encodeURIComponent(campaignId!)}/youtube`, { url, name });
    } catch {
      useMusicStore.setState({
        error: 'Nie udało się rozpocząć importu. Sprawdź, czy inne pobieranie jeszcze trwa.',
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="settings-group">
        <h3 className="settings-group-title">Muzyka</h3>
        {/* „u Ciebie" tylko u MG — tylko on ma obok „Głośność dla stołu" (24.09). */}
        <label
          className="settings-row"
          title={gm ? 'Zero wycisza muzykę tylko u Ciebie — stół słyszy dalej.' : undefined}
        >
          <span className="settings-label">{gm ? 'Głośność u Ciebie' : 'Głośność muzyki'}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
          <span className="settings-value">{volume}</span>
        </label>
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
      <SceneAmbience />
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
          {campaignId && (
            <YouTubeAudioImport key={campaignId} campaignId={campaignId} ready={ready} />
          )}
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
                      youtubeVideoId(track.url)
                        ? void importLegacy(track.url, track.name)
                        : void command({ campaignId, action: 'play', trackId: track.id })
                    }
                  >
                    {youtubeVideoId(track.url) ? 'Pobierz dźwięk' : 'Odtwórz'}
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
    </>
  );
}
