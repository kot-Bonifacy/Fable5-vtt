import { io, type Socket } from 'socket.io-client';
import type { ServerHello } from '@vtt/shared';
import { useConnectionStore } from './stores/connectionStore.js';

let socket: Socket | undefined;

/** Connects to the server on the same origin (Vite proxy in dev). */
export function connectSocket(): Socket {
  if (socket) return socket;

  socket = io();
  const { setConnected, setDisconnected, setServerHello } = useConnectionStore.getState();

  socket.on('connect', () => setConnected());
  socket.on('disconnect', () => setDisconnected());
  socket.on('connect_error', () => setDisconnected());
  socket.on('server:hello', (hello: ServerHello) => setServerHello(hello));

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = undefined;
  useConnectionStore.getState().setDisconnected();
}
