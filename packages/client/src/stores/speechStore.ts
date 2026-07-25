import { create } from 'zustand';
import type { SpeechStatus } from '@vtt/shared';

/**
 * Bot speech as the client sees it: the session-wide switch (server), the
 * listener's own settings (this browser) and the writing-out progress of lines
 * being spoken right now.
 *
 * `revealed[messageId]` = how many leading characters of that line are visible.
 * A line missing from the map is shown whole — that covers history, resync and
 * every line that never had a voice.
 */
interface SpeechStoreState {
  status: SpeechStatus | null;
  /** Muted in this browser only; the GM's switch is `status.enabled`. */
  muted: boolean;
  volume: number;
  revealed: Record<number, number>;

  setStatus: (status: SpeechStatus) => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  /** A line starts being spoken: show it empty, then grow it. */
  startReveal: (messageId: number) => void;
  setRevealed: (messageId: number, chars: number) => void;
  /** Done speaking — drop the entry so the line renders whole from now on. */
  finishReveal: (messageId: number) => void;
  reset: () => void;
}

const MUTED_KEY = 'vtt.speech.muted';
const VOLUME_KEY = 'vtt.speech.volume';

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

function readVolume(): number {
  try {
    const stored = Number(window.localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.9;
  } catch {
    return 0.9;
  }
}

function persist(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode: settings simply do not survive a reload.
  }
}

export const useSpeechStore = create<SpeechStoreState>((set) => ({
  status: null,
  muted: readMuted(),
  volume: readVolume(),
  revealed: {},

  setStatus: (status) => set({ status }),

  setMuted: (muted) => {
    persist(MUTED_KEY, muted ? '1' : '0');
    set({ muted });
  },

  setVolume: (volume) => {
    const clamped = Math.max(0, Math.min(1, volume));
    persist(VOLUME_KEY, String(clamped));
    set({ volume: clamped });
  },

  startReveal: (messageId) => set((state) => ({ revealed: { ...state.revealed, [messageId]: 0 } })),

  setRevealed: (messageId, chars) =>
    set((state) =>
      state.revealed[messageId] === chars
        ? state
        : { revealed: { ...state.revealed, [messageId]: chars } },
    ),

  finishReveal: (messageId) =>
    set((state) => {
      if (!(messageId in state.revealed)) return state;
      const next = { ...state.revealed };
      delete next[messageId];
      return { revealed: next };
    }),

  reset: () => set({ revealed: {} }),
}));

/** Whether bots can speak at all right now (engine up + GM's switch on). */
export function speechActive(status: SpeechStatus | null): boolean {
  return status?.available === true && status.enabled;
}
