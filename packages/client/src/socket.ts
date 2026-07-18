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
  TokenCreatePayload,
  TokenDeleteBroadcast,
  TokenMoveBroadcast,
  TokenPatch,
  RollParseError,
  TokenUpsertBroadcast,
  TokenView,
} from '@vtt/shared';
import {
  CHAT_COMMANDS_HELP,
  MAX_DICE_PER_TERM,
  MAX_DIE_SIDES,
  MAX_ROLL_TERMS,
  ROLE_GM,
  TOKEN_MOVE_RATE_HZ,
  parseChatInput,
} from '@vtt/shared';
import { playRollAnimation } from './dice3d.js';
import { useConnectionStore } from './stores/connectionStore.js';
import { oldestMessageId, useChatStore } from './stores/chatStore.js';
import { useSceneStore } from './stores/sceneStore.js';
import { useAuthStore } from './stores/authStore.js';
import { useTokenStore, type TokenViewerCtx } from './stores/tokenStore.js';

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
    case 'ROLL_MISSING_NOTATION':
      return 'Podaj formułę rzutu: /r 1d10+5';
    case 'ROLL_BAD_NOTATION':
      return 'Nieprawidłowa formuła rzutu (przykłady: 1d10+5, 2d6+3).';
    case 'NO_CAMPAIGN':
      return 'Brak aktywnej kampanii — czat jest niedostępny.';
    default:
      return `Błąd czatu: ${code}`;
  }
}

/** Local hints for roll-notation mistakes — matches the server's validation. */
function rollErrorText(reason: 'MISSING_NOTATION' | RollParseError): string {
  switch (reason) {
    case 'MISSING_NOTATION':
    case 'EMPTY':
      return 'Podaj formułę rzutu: /r 1d10+5';
    case 'TOO_MANY_TERMS':
      return `Za dużo członów w formule (maksymalnie ${MAX_ROLL_TERMS}).`;
    case 'TOO_MANY_DICE':
      return `Za dużo kości w jednym członie (maksymalnie ${MAX_DICE_PER_TERM}).`;
    case 'BAD_SIDES':
      return `Nieprawidłowa liczba ścianek kości (od 2 do ${MAX_DIE_SIDES}).`;
    case 'SYNTAX':
      return 'Nieprawidłowa formuła rzutu (przykłady: 1d10+5, 2d6+3).';
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
  const tokens = () => useTokenStore.getState();
  const viewer = (): TokenViewerCtx => {
    const user = useAuthStore.getState().user;
    return { myUserId: user?.id ?? null, isGm: user?.role === ROLE_GM };
  };

  socket.on('state:sync', (payload: StateSyncPayload) => {
    chat().applySync(payload);
    scenes().applySync(payload);
    tokens().applySync(payload, viewer());
  });
  socket.on('chat:message', (broadcast: ChatMessageBroadcast) => {
    if (chat().applyMessage(broadcast)) {
      socket?.emit('state:request');
      return;
    }
    // Live rolls (never history/resync) replay the server's results in 3D.
    if (broadcast.message.roll) playRollAnimation(broadcast.message.roll);
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
      const changed = useSceneStore.getState().scene?.id !== broadcast.scene.id;
      scenes().setScene(broadcast.scene);
      // A scene switch means a new token set — refetch the filtered state.
      if (changed) socket?.emit('state:request');
    }
  });
  socket.on('scene:list', (broadcast: SceneListBroadcast) => scenes().setScenes(broadcast.scenes));
  socket.on('scene:view', (broadcast: SceneViewBroadcast) => {
    scenes().setScene(broadcast.scene);
    socket?.emit('state:request');
  });

  // Token events for other scenes can reach us (campaign-wide broadcasts
  // while the GM previews another scene) — filter by the viewed scene.
  const viewingScene = (sceneId: string) => useSceneStore.getState().scene?.id === sceneId;

  socket.on('token:upsert', (broadcast: TokenUpsertBroadcast) => {
    if (chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    if (viewingScene(broadcast.token.sceneId)) tokens().upsert(broadcast.token, viewer());
  });
  socket.on('token:delete', (broadcast: TokenDeleteBroadcast) => {
    if (chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    if (viewingScene(broadcast.sceneId)) tokens().remove(broadcast.tokenId);
  });
  socket.on('token:move', (broadcast: TokenMoveBroadcast) => {
    // Intermediate frames carry no seq on purpose — never gap-check them.
    if (broadcast.seq !== undefined && chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    if (viewingScene(broadcast.sceneId)) {
      tokens().applyMove(broadcast.tokenId, broadcast.x, broadcast.y);
    }
  });

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
  if (parsed.kind === 'invalid-roll') {
    store.addNote(rollErrorText(parsed.reason));
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

export const createScene = (name: string) => emitSceneAck<SceneView>('scene:create', { name });

export const updateScene = (sceneId: string, patch: ScenePatch) =>
  emitSceneAck<SceneView>('scene:update', { sceneId, patch });

export const deleteScene = (sceneId: string) => emitSceneAck('scene:delete', { sceneId });

export const activateScene = (sceneId: string) => emitSceneAck('scene:activate', { sceneId });

/** GM-only: switches this client's viewed scene (players always follow the active one). */
export async function viewScene(sceneId: string): Promise<SocketAck<SceneView>> {
  const ack = await emitSceneAck<SceneView>('scene:view', { sceneId });
  if (ack.ok && ack.data) {
    useSceneStore.getState().setScene(ack.data);
    // Tokens of the newly viewed scene arrive with the fresh state.
    socket?.emit('state:request');
  }
  return ack;
}

export const createToken = (payload: TokenCreatePayload) =>
  emitSceneAck<TokenView>('token:create', payload);

export const updateToken = (tokenId: string, patch: TokenPatch) =>
  emitSceneAck<TokenView>('token:update', { tokenId, patch });

export const deleteToken = (tokenId: string) => emitSceneAck('token:delete', { tokenId });

let lastMoveSentAt = 0;

/**
 * Streams drag positions, throttled to TOKEN_MOVE_RATE_HZ; the final position
 * always goes out and resolves with the server-snapped coordinates.
 */
export function sendTokenMove(
  tokenId: string,
  x: number,
  y: number,
  final: boolean,
): Promise<SocketAck<{ x: number; y: number }>> | null {
  if (!final) {
    const now = Date.now();
    if (now - lastMoveSentAt < 1000 / TOKEN_MOVE_RATE_HZ) return null;
    lastMoveSentAt = now;
    socket?.emit('token:move', { tokenId, x, y, final: false });
    return null;
  }
  return emitSceneAck<{ x: number; y: number }>('token:move', { tokenId, x, y, final: true });
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
