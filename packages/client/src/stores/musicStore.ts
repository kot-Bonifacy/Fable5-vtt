import { create } from 'zustand';
import type { MusicState } from '@vtt/shared';
import { useChatStore } from './chatStore.js';

export const useMusicStore = create<{
  state: MusicState | null;
  receivedAt: number;
  error: string | null;
  blocked: boolean;
  ended: boolean;
  apply: (state: MusicState) => void;
}>((set, get) => ({
  state: null,
  receivedAt: 0,
  error: null,
  blocked: false,
  ended: false,
  apply: (state) => {
    if (useChatStore.getState().campaign?.id !== state.campaignId) return;
    const previous = get().state;
    if (previous?.campaignId === state.campaignId && previous.revision > state.revision) return;
    set({ state, receivedAt: performance.now() });
  },
}));
