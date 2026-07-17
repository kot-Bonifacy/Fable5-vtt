import { io, type Socket } from 'socket.io-client';
import type {
  ChatHistoryPage,
  ChatMessageBroadcast,
  PresenceBroadcast,
  SceneActivateBroadcast,
  SceneListBroadcast,
  ScenePatch,
  SceneUpdateBroadcast,
  SceneView,
  SceneViewBroadcast,
  ServerHello,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import { CHAT_COMMANDS_HELP, ROLE_GM, parseChatInput } from '@vtt/shared';
import { useConnectionStore } from './stores/connectionStore.js';
import { oldestMessageId, useChatStore } from './stores/chatStore.js';
import { useSceneStore } from './stores/sceneStore.js';
import { useAuthStore } from './stores/authStore.js';

let socket: Socket | undefined;

function chatErrorText(code: string): string {
  switch (code) {
    case 'UNKNOWN_COMMAND':
      return `Nieznana komenda. ${CHAT_COMMANDS_HELP}`;
    case 'WHISPER_MISSING_TARGET':
      return 'Podaj adresata szeptu: /w <imię> <treść>';
    case 'WHISPER_MISSING_TEXT':
      return 'Podaj treść szeptu: /w <imię> <treść>';
    case 'TARGET_NOT_FOUND':
      return 'Nie znaleziono odbiorcy o tym imieniu.';
    case 'TARGET_IS_SELF':
      return 'Nie możesz szeptać do samego siebie.';
    case 'MESSAGE_TOO_LONG':
      return 'Wiadomość jest za długa (limit 2000 znaków).';
    case 'NO_CAMPAIGN':
      return 'Brak aktywnej kampanii — czat jest niedostępny.';
    default:
      return `Błąd czatu: ${code}`;
  }
}

/** Connects to the server on the same origin (Vite proxy in dev). */
export function connectSocket(): Socket {
  if (socket) return socket;

  socket = io();
  const { setConnected, setDisconnected, setServerHello } = useConnectionStore.getState();
  const chat = () => useChatStore.getState();

  socket.on('connect', () => setConnected());
  socket.on('disconnect', () => {
    setDisconnected();
    chat().setDesynced();
  });
  socket.on('connect_error', () => setDisconnected());
  socket.on('server:hello', (hello: ServerHello) => setServerHello(hello));

  const scenes = () => useSceneStore.getState();

  socket.on('state:sync', (payload: StateSyncPayload) => {
    chat().applySync(payload);
    scenes().applySync(payload);
  });
  socket.on('chat:message', (broadcast: ChatMessageBroadcast) => {
    if (chat().applyMessage(broadcast)) socket?.emit('state:request');
  });
  socket.on('presence:update', (broadcast: PresenceBroadcast) => {
    if (chat().applyPresence(broadcast)) socket?.emit('state:request');
  });

  socket.on('scene:update', (broadcast: SceneUpdateBroadcast) => {
    if (chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    scenes().applyScene(broadcast.scene);
  });
  socket.on('scene:activate', (broadcast: SceneActivateBroadcast) => {
    if (chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    // Players follow the active scene; the GM keeps their own view (the
    // server moves only player sockets between scene rooms).
    if (useAuthStore.getState().user?.role === ROLE_GM) {
      scenes().applyScene(broadcast.scene);
    } else {
      scenes().setScene(broadcast.scene);
    }
  });
  socket.on('scene:list', (broadcast: SceneListBroadcast) => scenes().setScenes(broadcast.scenes));
  socket.on('scene:view', (broadcast: SceneViewBroadcast) => scenes().setScene(broadcast.scene));

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = undefined;
  useConnectionStore.getState().setDisconnected();
  useChatStore.getState().setDesynced();
}

/**
 * Sends raw chat input. Obvious mistakes (unknown command, incomplete
 * whisper) are caught locally for an instant hint; the server re-parses and
 * stays authoritative for everything else.
 */
export function sendChatInput(text: string): void {
  const store = useChatStore.getState();
  const parsed = parseChatInput(text);
  if (parsed.kind === 'empty') return;
  if (parsed.kind === 'unknown-command') {
    store.addNote(`Nieznana komenda /${parsed.command}. ${CHAT_COMMANDS_HELP}`);
    return;
  }
  if (parsed.kind === 'invalid-whisper') {
    store.addNote(
      chatErrorText(
        parsed.reason === 'MISSING_TARGET' ? 'WHISPER_MISSING_TARGET' : 'WHISPER_MISSING_TEXT',
      ),
    );
    return;
  }
  socket?.emit('chat:send', { text }, (ack: SocketAck) => {
    if (!ack.ok) useChatStore.getState().addNote(chatErrorText(ack.error));
  });
}

function emitSceneAck<T = undefined>(event: string, payload: unknown): Promise<SocketAck<T>> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve({ ok: false, error: 'NOT_CONNECTED' });
      return;
    }
    socket.emit(event, payload, (ack: SocketAck<T>) => resolve(ack));
  });
}

export const createScene = (name: string) =>
  emitSceneAck<SceneView>('scene:create', { name });

export const updateScene = (sceneId: string, patch: ScenePatch) =>
  emitSceneAck<SceneView>('scene:update', { sceneId, patch });

export const deleteScene = (sceneId: string) => emitSceneAck('scene:delete', { sceneId });

export const activateScene = (sceneId: string) => emitSceneAck('scene:activate', { sceneId });

/** GM-only: switches this client's viewed scene (players always follow the active one). */
export async function viewScene(sceneId: string): Promise<SocketAck<SceneView>> {
  const ack = await emitSceneAck<SceneView>('scene:view', { sceneId });
  if (ack.ok && ack.data) useSceneStore.getState().setScene(ack.data);
  return ack;
}

/** Requests the previous page of chat history (infinite scroll upwards). */
export function loadOlderHistory(): void {
  const store = useChatStore.getState();
  if (!socket || store.loadingHistory || !store.hasMoreHistory) return;
  const beforeId = oldestMessageId(store.items);
  if (beforeId === null) return;

  store.setLoadingHistory(true);
  socket.emit('chat:history', { beforeId }, (ack: SocketAck<ChatHistoryPage>) => {
    const chat = useChatStore.getState();
    if (ack.ok && ack.data) {
      chat.prependHistory(ack.data);
    } else {
      chat.setLoadingHistory(false);
    }
  });
}
