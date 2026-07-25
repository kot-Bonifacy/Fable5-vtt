import { io, type Socket } from 'socket.io-client';
import type {
  AiAskPayload,
  AiChunkBroadcast,
  AiDoneBroadcast,
  AiErrorBroadcast,
  AiQueueBroadcast,
  AiStatus,
  AiStatusBroadcast,
  BotActivityBroadcast,
  BotChatPayload,
  BotChunkBroadcast,
  BotCreatePayload,
  BotDeleteBroadcast,
  BotErrorBroadcast,
  BotLesson,
  BotNoticeBroadcast,
  BotPatch,
  BotReplyBroadcast,
  BotSayPayload,
  BotTraceBroadcast,
  BotUpsertBroadcast,
  BotView,
  CharacterCreatePayload,
  CharacterDeleteBroadcast,
  CharacterPatch,
  CharacterRollPayload,
  CharacterUpsertBroadcast,
  CharacterView,
  CpredRollRequest,
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
  SpeechPreviewPayload,
  SpeechPreviewResult,
  SpeechStatus,
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
import { speakMessage, unlockAudioOnFirstGesture } from './speech.js';
import { useSpeechStore } from './stores/speechStore.js';
import { useConnectionStore } from './stores/connectionStore.js';
import { oldestMessageId, useChatStore } from './stores/chatStore.js';
import { useSceneStore } from './stores/sceneStore.js';
import { useAuthStore } from './stores/authStore.js';
import { useTokenStore, type TokenViewerCtx } from './stores/tokenStore.js';
import { useCharacterStore } from './stores/characterStore.js';
import { useAiStore } from './stores/aiStore.js';
import { useBotStore } from './stores/botStore.js';

let socket: Socket | undefined;
/** User the live socket authenticated as — a different one forces a reconnect. */
let connectedUserId: string | null = null;

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
    case 'AS_BOT_MISSING_TARGET':
      return 'Podaj bota: /jako <imię> <treść>';
    case 'AS_BOT_MISSING_TEXT':
      return 'Podaj treść wypowiedzi: /jako <imię> <treść>';
    case 'BOT_NOT_FOUND':
      return 'Nie znaleziono NPC-a o tym imieniu.';
    case 'FORBIDDEN':
      return 'Tylko MG może mówić w imieniu NPC-a.';
    case 'NO_CAMPAIGN':
      return 'Brak aktywnej kampanii — czat jest niedostępny.';
    default:
      return `Błąd czatu: ${code}`;
  }
}

/**
 * A bot could not answer. Shown as a local chat note to whoever called it (and
 * the GM) — the transcript itself stays clean, and the rest of the VTT works.
 */
function botNoticeText(notice: BotNoticeBroadcast): string {
  switch (notice.code) {
    case 'AI_UNAVAILABLE':
    case 'AI_UNREACHABLE':
      return `${notice.botName} nie odpowiada — model jest niedostępny (AI Gateway offline).`;
    case 'BOT_STOPPED':
      return `Przerwano wypowiedź ${notice.botName}.`;
    case 'BOT_TIMEOUT':
      return `${notice.botName} nie odpowiedział w limicie czasu.`;
    case 'BOT_EMPTY_REPLY':
      return `${notice.botName} nie miał nic do powiedzenia.`;
    default:
      return notice.detail
        ? `${notice.botName}: błąd modelu — ${notice.detail}`
        : `${notice.botName}: błąd modelu (${notice.code}).`;
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

/** Polish messages for AI failures — the gateway is optional by design. */
function aiErrorText(code: string, detail?: string): string {
  switch (code) {
    case 'AI_UNAVAILABLE':
      return 'Model jest niedostępny — sprawdź, czy AI Gateway i llama-server działają.';
    case 'AI_UNREACHABLE':
      return 'Brak połączenia z AI Gateway. Reszta VTT działa normalnie.';
    case 'AI_EMPTY_PROMPT':
      return 'Wpisz treść pytania.';
    case 'AI_PROMPT_TOO_LONG':
      return 'Pytanie jest za długie.';
    default:
      return detail ? `Błąd AI: ${detail}` : `Błąd AI: ${code}`;
  }
}

/** Polish messages for bot-editor failures (stage 10). */
function botErrorText(code: string, detail?: string): string {
  switch (code) {
    case 'BOT_NOT_FOUND':
      return 'Nie znaleziono bota — odśwież stronę.';
    case 'BOT_EMPTY_MESSAGE':
      return 'Wpisz treść wypowiedzi.';
    case 'BOT_MESSAGE_TOO_LONG':
      return 'Wypowiedź jest za długa.';
    case 'BOT_EMPTY_CORRECTION':
      return 'Wpisz treść korekty.';
    case 'BOT_CORRECTION_TOO_LONG':
      return 'Korekta jest za długa.';
    case 'INVALID_NAME':
      return 'Imię bota musi mieć od 1 do 48 znaków.';
    case 'NAME_TAKEN':
      return 'To imię nosi już gracz albo inny bot — przy stole imiona muszą być unikalne.';
    case 'INVALID_DATA':
      return 'Nieprawidłowe dane profilu.';
    case 'FORBIDDEN':
      return 'Boty może edytować tylko MG.';
    default:
      return aiErrorText(code, detail);
  }
}

/**
 * Connects to the server on the same origin (Vite proxy in dev). Passing a
 * different `userId` (someone else joined in the same browser) drops the old
 * connection first — otherwise the previous user's socket would keep feeding
 * their state into the stores.
 */
export function connectSocket(userId: string): Socket {
  if (socket && connectedUserId === userId) return socket;
  if (socket) disconnectSocket();
  connectedUserId = userId;

  socket = io();
  const { setConnected, setDisconnected, setServerHello } = useConnectionStore.getState();
  const chat = () => useChatStore.getState();
  // Browsers refuse to play audio before the user has touched the page.
  unlockAudioOnFirstGesture();

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
    useBotStore.getState().applySync(payload);
    if (payload.ai) useAiStore.getState().setStatus(payload.ai);
  });

  // Bot profiles are GM-only and targeted at the GM room — no seq, like whispers.
  const bots = () => useBotStore.getState();
  socket.on('bot:upsert', (broadcast: BotUpsertBroadcast) => bots().applyUpsert(broadcast.bot));
  socket.on('bot:delete', (broadcast: BotDeleteBroadcast) => bots().applyDelete(broadcast.botId));
  socket.on('bot:chunk', (broadcast: BotChunkBroadcast) =>
    bots().appendChunk(broadcast.botId, broadcast.text, broadcast.reset === true),
  );
  socket.on('bot:reply', (broadcast: BotReplyBroadcast) => bots().finishBotTurn(broadcast));
  socket.on('bot:error', (broadcast: BotErrorBroadcast) =>
    bots().failBotTurn(broadcast.botId, botErrorText(broadcast.code, broadcast.detail)),
  );

  // Session chat: turns in flight („Vex pisze…" + queue) are ephemeral state,
  // broadcast without a seq; failures arrive targeted as a local chat note.
  socket.on('bot:activity', (broadcast: BotActivityBroadcast) =>
    chat().setBotActivity(broadcast.entries ?? []),
  );
  socket.on('bot:trace', (broadcast: BotTraceBroadcast) => chat().addBotTrace(broadcast));
  socket.on('bot:notice', (broadcast: BotNoticeBroadcast) =>
    chat().addNote(botNoticeText(broadcast)),
  );

  // AI status/streams are targeted, carry no seq and are never persisted —
  // the gateway is an external service, not game state.
  const ai = () => useAiStore.getState();
  socket.on('ai:status', (broadcast: AiStatusBroadcast) => ai().setStatus(broadcast.status));
  socket.on('speech:status', (status: SpeechStatus) => useSpeechStore.getState().setStatus(status));
  socket.on('ai:queue', (broadcast: AiQueueBroadcast) =>
    ai().setQueuePosition(broadcast.requestId, broadcast.position),
  );
  socket.on('ai:chunk', (broadcast: AiChunkBroadcast) =>
    ai().appendChunk(broadcast.requestId, broadcast.kind, broadcast.text),
  );
  socket.on('ai:done', (broadcast: AiDoneBroadcast) =>
    ai().finishExchange(broadcast.requestId, broadcast.usage),
  );
  socket.on('ai:error', (broadcast: AiErrorBroadcast) =>
    ai().failExchange(broadcast.requestId, aiErrorText(broadcast.code, broadcast.detail)),
  );

  // Character emissions are always targeted (owner + GM) and carry no seq.
  socket.on('character:upsert', (broadcast: CharacterUpsertBroadcast) => {
    useCharacterStore.getState().applyUpsert(broadcast.character);
  });
  socket.on('character:delete', (broadcast: CharacterDeleteBroadcast) => {
    useCharacterStore.getState().applyDelete(broadcast.characterId);
  });
  socket.on('chat:message', (broadcast: ChatMessageBroadcast) => {
    const roll = broadcast.message.roll;
    const speech = broadcast.message.speech;
    // Live rolls (never history/resync) replay the server's results in 3D;
    // their chat card is held back so the table reads the dice first.
    // A spoken NPC line is held for the same reason: it joins the feed when the
    // NPC starts saying it, then writes itself out in step with the voice.
    const hold = (roll !== undefined && toAnimationNotation(roll) !== null) || speech !== undefined;
    if (chat().applyMessage(broadcast, hold)) {
      socket?.emit('state:request');
      return;
    }
    if (speech) {
      speakMessage(broadcast.message);
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
  connectedUserId = null;
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
  if (parsed.kind === 'invalid-as-bot') {
    store.addNote(
      chatErrorText(
        parsed.reason === 'MISSING_TARGET' ? 'AS_BOT_MISSING_TARGET' : 'AS_BOT_MISSING_TEXT',
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

/** Polish hints for the sheet-roll rejections the server can return. */
function rollAckErrorText(code: string): string {
  switch (code) {
    case 'CHARACTER_NOT_FOUND':
      return 'Nie możesz rzucać tą postacią.';
    case 'NOT_ENOUGH_LUCK':
      return 'Za mało punktów Szczęścia w puli.';
    case 'UNKNOWN_SKILL':
      return 'Nieznana umiejętność — odśwież stronę.';
    case 'UNKNOWN_STAT':
      return 'Nieznana cecha — odśwież stronę.';
    case 'BAD_MODIFIER':
      return 'Modyfikator sytuacyjny poza dozwolonym zakresem.';
    default:
      return `Błąd rzutu: ${code}`;
  }
}

/**
 * Sends a sheet check. The server re-derives every modifier from the stored
 * sheet (wound penalty included), spends the Luck and rolls — the client only
 * declares the intention and hands over the cup gesture.
 */
export function sendCharacterRoll(
  characterId: string,
  request: CpredRollRequest,
  visibility: 'public' | 'gm',
  gesture?: RollGesture,
): void {
  const payload: CharacterRollPayload<CpredRollRequest> = {
    characterId,
    request,
    visibility,
    ...(gesture ? { gesture } : {}),
  };
  socket?.emit('character:roll', payload, (ack: SocketAck<{ messageId: number }>) => {
    if (!ack.ok) useChatStore.getState().addNote(rollAckErrorText(ack.error));
  });
}

/**
 * Asks the model from the GM test screen. The ack only hands back a request id —
 * the answer arrives as `ai:chunk` events until `ai:done`.
 */
export function askAi(payload: AiAskPayload): void {
  const store = useAiStore.getState();
  const prompt = payload.prompt.trim();
  if (!prompt) return;
  if (!socket) {
    store.failLocally(prompt, 'Brak połączenia z serwerem.');
    return;
  }
  socket.emit('ai:ask', payload, (ack: SocketAck<{ requestId: string }>) => {
    const ai = useAiStore.getState();
    if (ack.ok && ack.data) ai.startExchange(ack.data.requestId, prompt);
    else if (!ack.ok) ai.failLocally(prompt, aiErrorText(ack.error));
  });
}

/** Forces an immediate gateway health check (GM). */
export function refreshAiStatus(): Promise<AiStatus | null> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve(null);
      return;
    }
    socket.emit('ai:refresh', (ack: SocketAck<AiStatus>) => {
      if (ack.ok && ack.data) useAiStore.getState().setStatus(ack.data);
      resolve(ack.ok ? (ack.data ?? null) : null);
    });
  });
}

export const createBot = (payload: BotCreatePayload) =>
  emitSceneAck<BotView>('bot:create', payload);

export const deleteBot = (botId: string) => emitSceneAck('bot:delete', { botId });

export const duplicateBot = (botId: string) => emitSceneAck<BotView>('bot:duplicate', { botId });

/** Immediate (non-debounced) profile update — activation, archiving, portraits. */
export const updateBot = (botId: string, patch: BotPatch) =>
  emitSceneAck<BotView>('bot:update', { botId, patch });

/** Turns a GM correction into a lesson stored in the profile. */
export const teachBot = (botId: string, correction: string, quote?: string) =>
  emitSceneAck<{ lesson: BotLesson; bot: BotView }>('bot:teach', {
    botId,
    correction,
    ...(quote ? { quote } : {}),
  });

interface BotSaveBuffer {
  patch: BotPatch;
  timer: number;
}

const botSaveBuffers = new Map<string, BotSaveBuffer>();
const BOT_SAVE_DEBOUNCE_MS = 600;

/**
 * Optimistically applies a profile edit and schedules a debounced
 * `bot:update`. A profile edited mid-session takes effect on the bot's very
 * next line — the prompt is compiled from the stored profile every time.
 */
export function queueBotSave(botId: string, patch: BotPatch): void {
  useBotStore.getState().localPatch(botId, patch);

  const buffer = botSaveBuffers.get(botId) ?? { patch: {}, timer: 0 };
  const { data, ...rest } = patch;
  Object.assign(buffer.patch, rest);
  if (data) buffer.patch.data = { ...buffer.patch.data, ...data };
  window.clearTimeout(buffer.timer);
  buffer.timer = window.setTimeout(() => flushBotSave(botId), BOT_SAVE_DEBOUNCE_MS);
  botSaveBuffers.set(botId, buffer);
}

/** Sends the buffered profile patch now (editor close, tab switch). */
export function flushBotSave(botId: string): void {
  const buffer = botSaveBuffers.get(botId);
  if (!buffer) return;
  botSaveBuffers.delete(botId);
  window.clearTimeout(buffer.timer);

  const store = useBotStore.getState();
  store.beginSave(botId);
  if (!socket) {
    store.endSave(botId, null, false);
    return;
  }
  socket.emit('bot:update', { botId, patch: buffer.patch }, (ack: SocketAck<BotView>) => {
    useBotStore.getState().endSave(botId, ack.ok ? (ack.data ?? null) : null, ack.ok);
  });
}

/**
 * Sends one turn of the editor's test conversation. The answer streams back as
 * `bot:chunk` and is replaced by the final, sanitized `bot:reply`.
 */
export function sendBotChat(payload: BotChatPayload): void {
  const store = useBotStore.getState();
  const message = payload.message.trim();
  if (!message) return;
  store.addUserTurn(payload.botId, message);
  if (!socket) {
    store.startBotTurn(payload.botId, 'local');
    store.failBotTurn(payload.botId, 'Brak połączenia z serwerem.');
    return;
  }
  socket.emit('bot:chat', payload, (ack: SocketAck<{ requestId: string }>) => {
    const bots = useBotStore.getState();
    if (ack.ok && ack.data) bots.startBotTurn(payload.botId, ack.data.requestId);
    else if (!ack.ok) {
      bots.startBotTurn(payload.botId, 'local');
      bots.failBotTurn(payload.botId, botErrorText(ack.error));
    }
  });
}

/** GM's emergency stop for a generating bot (bot editor). */
export function cancelBotChat(): void {
  socket?.emit('bot:cancel');
}

/** GM types a line in an NPC's name — same result as `/jako` on chat. */
export const sayAsBot = (payload: BotSayPayload) =>
  emitSceneAck<{ messageId: number }>('bot:say', payload);

/** GM's emergency stop for bots speaking on session chat. */
export function stopBots(turnId?: string): void {
  socket?.emit('bot:stop', turnId ? { turnId } : {});
}

/** GM's session-wide switch for bot speech. */
export const toggleSpeech = (enabled: boolean) =>
  emitSceneAck<{ enabled: boolean }>('speech:toggle', { enabled });

/** „Posłuchaj" in the bot editor — synthesis outside the session. */
export const previewVoice = (payload: SpeechPreviewPayload) =>
  emitSceneAck<SpeechPreviewResult>('speech:preview', payload);

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
  buffer.timer = window.setTimeout(
    () => flushCharacterSave(characterId),
    CHARACTER_SAVE_DEBOUNCE_MS,
  );
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
