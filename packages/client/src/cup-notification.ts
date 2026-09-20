import { useEffect, useRef } from 'react';
import { useSettingsStore } from './stores/settingsStore.js';

/** A call and its loaded roll share one identity, including after reconnect. */
export class CupNotificationGate {
  private previous: string | null = null;
  private calls = new Set<string>();
  activate(key: string | null): boolean {
    const changed = key !== this.previous;
    this.previous = key;
    if (!key || !changed) return false;
    if (key.startsWith('call:')) {
      if (this.calls.has(key)) return false;
      this.calls.add(key);
    }
    return true;
  }
}

let context: AudioContext | null = null;
let sample: Promise<AudioBuffer> | null = null;
function audioContext(): AudioContext {
  return (context ??= new AudioContext());
}
export async function playCupNotification(stillCurrent: () => boolean = () => true) {
  const volume = useSettingsStore.getState().notificationVolume / 100;
  if (!volume) return;
  try {
    const ctx = audioContext();
    if (ctx.state !== 'running') return;
    sample ??= fetch('/notifications/cup-ready.wav')
      .then((r) => {
        if (!r.ok) throw new Error('Audio unavailable');
        return r.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .catch((error: unknown) => {
        sample = null;
        throw error;
      });
    const buffer = await sample;
    if (!stillCurrent() || !useSettingsStore.getState().notificationVolume) return;
    const gain = ctx.createGain();
    gain.gain.value = volume * 0.6;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain).connect(ctx.destination);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start();
  } catch {
    /* Visual cup remains usable when audio is unavailable. */
  }
}
export function auditionCupNotification() {
  void audioContext()
    .resume()
    .then(() => playCupNotification())
    .catch(() => undefined);
}
export function useCupNotification(key: string | null, campaignId: string | null) {
  const gate = useRef(new CupNotificationGate());
  const current = useRef(key);
  const waiting = useRef<string | null>(null);
  const previousCampaign = useRef<string | null>(null);
  current.current = key;
  useEffect(() => {
    if (previousCampaign.current !== campaignId) {
      previousCampaign.current = campaignId;
      gate.current = new CupNotificationGate();
      waiting.current = null;
    }
    if (!gate.current.activate(key)) return;
    if (context?.state === 'running') void playCupNotification(() => current.current === key);
    else waiting.current = key;
  }, [key, campaignId]);
  useEffect(() => {
    const unlock = () => {
      void audioContext()
        .resume()
        .then(() => {
          const pending = waiting.current;
          waiting.current = null;
          if (pending && pending === current.current)
            void playCupNotification(() => current.current === pending);
        })
        .catch(() => undefined);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
}
