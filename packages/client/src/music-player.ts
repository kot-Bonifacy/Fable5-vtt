import { useEffect } from 'react';
import { useMusicStore } from './stores/musicStore.js';
import { useSettingsStore } from './stores/settingsStore.js';
import { useChatStore } from './stores/chatStore.js';

let player: HTMLAudioElement | null = null;

export function musicPosition(position: number, elapsed: number, duration: number, loop: boolean) {
  const wanted = Math.max(0, position + elapsed);
  return loop ? wanted % duration : Math.min(wanted, duration);
}

function synchronize() {
  const audio = player;
  const { state, receivedAt } = useMusicStore.getState();
  const playback = state?.playback;
  if (!audio || !playback || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
  const elapsed = playback.playing
    ? Math.max(0, state.serverNow - playback.startedAt + performance.now() - receivedAt) / 1000
    : 0;
  const target = musicPosition(playback.position, elapsed, audio.duration, playback.loop);
  if (Math.abs(audio.currentTime - target) > 0.8) audio.currentTime = target;
}

export function enableMusic() {
  const audio = player;
  if (!audio || !useMusicStore.getState().state?.playback?.playing) return;
  synchronize();
  if (!audio.loop && Number.isFinite(audio.duration) && audio.currentTime >= audio.duration) {
    audio.pause();
    useMusicStore.setState({ ended: true });
    return;
  }
  void audio
    .play()
    .then(() => useMusicStore.setState({ blocked: false, ended: false }))
    .catch((error: unknown) => {
      if (audio !== player) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (error instanceof DOMException && error.name === 'NotAllowedError')
        useMusicStore.setState({ blocked: true });
      else useMusicStore.setState({ error: 'Nie można odtworzyć podkładu. Sprawdź plik audio.' });
    });
}

/** One player per table, independent of whether its control window is open. */
export function useMusicPlayer() {
  const state = useMusicStore((s) => s.state);
  const volume = useSettingsStore((s) => s.musicVolume);
  const synced = useChatStore((s) => s.synced);
  const campaignId = useChatStore((s) => s.campaign?.id);
  const playback = synced && state?.campaignId === campaignId ? state?.playback : null;
  const url = playback?.track.url;
  useEffect(() => {
    if (!url) return;
    const audio = new Audio(url);
    player = audio;
    audio.preload = 'auto';
    audio.addEventListener('loadedmetadata', enableMusic);
    const error = () =>
      useMusicStore.setState({ error: 'Nie można wczytać podkładu. Sprawdź plik audio.' });
    audio.addEventListener('error', error);
    const ended = () => useMusicStore.setState({ ended: true });
    audio.addEventListener('ended', ended);
    const timer = window.setInterval(synchronize, 5000);
    return () => {
      clearInterval(timer);
      audio.pause();
      audio.removeEventListener('loadedmetadata', enableMusic);
      audio.removeEventListener('error', error);
      audio.removeEventListener('ended', ended);
      audio.removeAttribute('src');
      audio.load();
      if (player === audio) player = null;
    };
  }, [url]);
  useEffect(() => {
    if (!player || !playback) return;
    player.volume = ((volume / 100) * playback.volume) / 100;
    player.loop = playback.loop;
    synchronize();
    if (playback.playing) enableMusic();
    else player.pause();
  }, [playback, volume]);
  useEffect(() => {
    const unlock = () => {
      if (useMusicStore.getState().blocked) enableMusic();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
}
