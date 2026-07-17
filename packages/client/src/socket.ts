import { io, type Socket } from 'socket.io-client';
import type {
  ChatHistoryPage,
  ChatMessageBroadcast,
  PresenceBroadcast,
  ServerHello,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import { CHAT_COMMANDS_HELP, parseChatInput } from '@vtt/shared';
import { useConnectionStore } from './stores/connectionStore.js';
import { oldestMessageId, useChatStore } from './stores/chatStore.js';

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

  socket.on('state:sync', (payload: StateSyncPayload) => chat().applySync(payload));
  socket.on('chat:message', (broadcast: ChatMessageBroadcast) => {
    if (chat().applyMessage(broadcast)) socket?.emit('state:request');
  });
  socket.on('presence:update', (broadcast: PresenceBroadcast) => {
    if (chat().applyPresence(broadcast)) socket?.emit('state:request');
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
  socket?.emit('chat:send', { text }, (ack: SocketAck) => {
    if (!ack.ok) useChatStore.getState().addNote(chatErrorText(ack.error));
  });
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
