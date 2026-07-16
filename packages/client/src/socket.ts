import { io, type Socket } from 'socket.io-client';
import type { ServerHello } from '@vtt/shared';
import { useConnectionStore } from './stores/connectionStore.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

let socket: Socket | undefined;

export function connectSocket(): Socket {
  if (socket) return socket;

  socket = io(SERVER_URL);
  const { setConnected, setDisconnected, setServerHello } = useConnectionStore.getState();

  socket.on('connect', () => setConnected());
  socket.on('disconnect', () => setDisconnected());
  socket.on('connect_error', () => setDisconnected());
  socket.on('server:hello', (hello: ServerHello) => setServerHello(hello));

  return socket;
}
