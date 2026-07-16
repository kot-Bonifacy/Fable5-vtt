import { create } from 'zustand';
import type { ServerHello } from '@vtt/shared';

interface ConnectionState {
  connected: boolean;
  serverHello?: ServerHello;
  setConnected: () => void;
  setDisconnected: () => void;
  setServerHello: (hello: ServerHello) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connected: false,
  serverHello: undefined,
  setConnected: () => set({ connected: true }),
  setDisconnected: () => set({ connected: false }),
  setServerHello: (hello) => set({ serverHello: hello }),
}));
