import { io, type Socket } from 'socket.io-client';
import type {
  CharacterCreatePayload,
  CharacterDeleteBroadcast,
  CharacterPatch,
  CharacterUpsertBroadcast,
  CharacterView,
  ChatHistoryPage,
  ChatMessageBroadcast,
  ChatSendPayload,
  PresenceBroadcast,
  RollGesture,
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
import { playRollAnimation, toAnimationNotation } from './dice3d.js';
import { useConnectionStore } from './stores/connectionStore.js';
import { oldestMessageId, useChatStore } from './stores/chatStore.js';
import { useSceneStore } from './stores/sceneStore.js';
import { useAuthStore } from './stores/authStore.js';
import { useTokenStore, type TokenViewerCtx } from './stores/tokenStore.js';
import { useCharacterStore } from './stores/characterStore.js';

let socket: Socket | undefined;

/** Extra time after the dice settle before the chat card spoils the total. */
const CARD_REVEAL_DELAY_MS = 2500;
/** Safety net: reveal the card even if the animation never reports back. */
const MAX_ANIMATION_WAIT_MS = 15_000;

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
    useCharacterStore.getState().applySync(payload);
  });

  // Character emissions are always targeted (owner + GM) and carry no seq.
  socket.on('character:upsert', (broadcast: CharacterUpsertBroadcast) => {
    useCharacterStore.getState().applyUpsert(broadcast.character);
  });
  socket.on('character:delete', (broadcast: CharacterDeleteBroadcast) => {
    useCharacterStore.getState().applyDelete(broadcast.characterId);
  });
  socket.on('chat:message', (broadcast: ChatMessageBroadcast) => {
    const roll = broadcast.message.roll;
    // Live rolls (never history/resync) replay the server's results in 3D;
    // their chat card is held back so the table reads the dice first.
    const hold = roll !== undefined && toAnimationNotation(roll) !== null;
    if (chat().applyMessage(broadcast, hold)) {
      socket?.emit('state:request');
      return;
    }
    if (hold && roll) {
      const reveal = () => useChatStore.getState().revealMessage(broadcast.message.id);
      const guard = window.setTimeout(reveal, MAX_ANIMATION_WAIT_MS);
      void playRollAnimation(roll).then((played) => {
        window.clearTimeout(guard);
        window.setTimeout(reveal, played ? CARD_REVEAL_DELAY_MS : 0);
      });
    }
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
 * stays authoritative for everything else. `gesture` accompanies rolls
 * thrown with the dice cup.
 */
export function sendChatInput(text: string, gesture?: RollGesture): void {
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
  const payload: ChatSendPayload = parsed.kind === 'roll' && gesture ? { text, gesture } : { text };
  socket?.emit('chat:send', payload, (ack: SocketAck) => {
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

export const createCharacter = (payload: CharacterCreatePayload) =>
  emitSceneAck<CharacterView>('character:create', payload);

export const deleteCharacter = (characterId: string) =>
  emitSceneAck('character:delete', { characterId });

/** Immediate (non-debounced) character update — owner assignment, portraits. */
export const updateCharacter = (characterId: string, patch: CharacterPatch) =>
  emitSceneAck<CharacterView>('character:update', { characterId, patch });

interface CharacterSaveBuffer {
  patch: CharacterPatch;
  timer: number;
}

const characterSaveBuffers = new Map<string, CharacterSaveBuffer>();
/** Idle time after the last keystroke before the sheet autosaves. */
const CHARACTER_SAVE_DEBOUNCE_MS = 600;

/**
 * Optimistically applies a sheet edit and schedules a debounced
 * `character:update`. Consecutive edits merge into one patch (`data` keys
 * shallowly), so fast typing produces a single save.
 */
export function queueCharacterSave(characterId: string, patch: CharacterPatch): void {
  const store = useCharacterStore.getState();
  store.localPatch(characterId, patch);

  const buffer = characterSaveBuffers.get(characterId) ?? { patch: {}, timer: 0 };
  const { data, ...rest } = patch;
  Object.assign(buffer.patch, rest);
  if (data) buffer.patch.data = { ...buffer.patch.data, ...data };
  window.clearTimeout(buffer.timer);
  buffer.timer = window.setTimeout(() => flushCharacterSave(characterId), CHARACTER_SAVE_DEBOUNCE_MS);
  characterSaveBuffers.set(characterId, buffer);
}

/** Sends the buffered patch now (sheet close, tab switch, page hide). */
export function flushCharacterSave(characterId: string): void {
  const buffer = characterSaveBuffers.get(characterId);
  if (!buffer) return;
  characterSaveBuffers.delete(characterId);
  window.clearTimeout(buffer.timer);

  const store = useCharacterStore.getState();
  store.beginSave(characterId);
  if (!socket) {
    store.endSave(characterId, null, false);
    return;
  }
  socket.emit(
    'character:update',
    { characterId, patch: buffer.patch },
    (ack: SocketAck<CharacterView>) => {
      useCharacterStore.getState().endSave(characterId, ack.ok ? (ack.data ?? null) : null, ack.ok);
    },
  );
}

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
