import { useEffect, useState } from 'react';
import { AMBIENCE_PRESETS, ROLE_GM, type AmbiencePreset } from '@vtt/shared';
import { useSceneStore } from '../stores/sceneStore.js';
import { useSettingsStore } from '../stores/settingsStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { updateScene } from '../socket.js';

/** Mounted at the table root: ambience continues with the library closed. */
export function useSceneAmbience() {
  const scene = useSceneStore((s) => s.scene);
  const synced = useChatStore((s) => s.synced);
  const preset = synced ? scene?.ambience : undefined;
  useEffect(() => {
    if (!preset || preset === 'none') return;
    const audio = new Audio(`/ambience/${preset}.wav`);
    audio.loop = true;
    let disposed = false;
    const play = () => {
      if (disposed) return;
      audio.volume = useSettingsStore.getState().ambientVolume / 100;
      void audio.play().catch(() => undefined);
    };
    const unsubscribe = useSettingsStore.subscribe((s) => {
      audio.volume = s.ambientVolume / 100;
    });
    play();
    window.addEventListener('pointerdown', play);
    window.addEventListener('keydown', play);
    return () => {
      disposed = true;
      unsubscribe();
      window.removeEventListener('pointerdown', play);
      window.removeEventListener('keydown', play);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, [preset, scene?.id]);
}
export function SceneAmbience() {
  const scene = useSceneStore((s) => s.scene);
  const synced = useChatStore((s) => s.synced);
  const gm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const volume = useSettingsStore((s) => s.ambientVolume);
  const setVolume = useSettingsStore((s) => s.setAmbientVolume);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function change(ambience: AmbiencePreset) {
    if (!scene) return;
    setBusy(true);
    setError(false);
    try {
      const result = await updateScene(scene.id, { ambience });
      setError(!result.ok);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-group">
      <h3 className="settings-group-title">Otoczenie sceny{scene ? ` — ${scene.name}` : ''}</h3>
      <label
        className="settings-row"
        title={gm ? 'Zero wycisza otoczenie tylko u Ciebie — stół słyszy dalej.' : undefined}
      >
        <span className="settings-label">
          {gm ? 'Głośność otoczenia u Ciebie' : 'Głośność otoczenia'}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
        <span className="settings-value">{volume}</span>
      </label>
      {gm && scene ? (
        <label
          className="settings-row"
          title="Otoczenie gra razem z muzyką. Każdy słyszy odgłos sceny, którą ogląda."
        >
          <span className="settings-label">Odgłos na oglądanej scenie</span>
          <select
            disabled={!synced || busy}
            value={scene.ambience ?? 'none'}
            onChange={(e) => void change(e.target.value as AmbiencePreset)}
          >
            {Object.entries(AMBIENCE_PRESETS).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      ) : gm ? (
        <p>Wybierz scenę, aby ustawić jej otoczenie.</p>
      ) : null}
      {error && <p role="alert">Nie udało się zapisać otoczenia. Sprawdź połączenie.</p>}
    </section>
  );
}
