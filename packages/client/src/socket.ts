import { io, type Socket } from 'socket.io-client';
import type {
  AiAskPayload,
  AiChunkBroadcast,
  AiDoneBroadcast,
  AiErrorBroadcast,
  AiQueueBroadcast,
  AiStatus,
  AiStatusBroadcast,
  AttackEvadePayload,
  AttackRollPayload,
  AttackRollResult,
  CoverSyncBroadcast,
  CoverView,
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
  CombatUpdateBroadcast,
  CombatGrapplePayload,
  CombatGrappleResistPayload,
  CombatView,
  CompendiumDeleteBroadcast,
  CompendiumEntry,
  CompendiumUpsertBroadcast,
  CpredAttackRequest,
  CpredRollRequest,
  ChatHistoryPage,
  ChatMessageBroadcast,
  ChatSendPayload,
  DamageApplyPayload,
  DamageUndoPayload,
  DrawingClearBroadcast,
  DrawingDeleteBroadcast,
  DrawingShape,
  DrawingStyle,
  DrawingUpsertBroadcast,
  DrawingView,
  FogPaintBroadcast,
  FogShape,
  FogSyncBroadcast,
  LightPatch,
  LightSyncBroadcast,
  LightView,
  MapNoteView,
  NoteDeleteBroadcast,
  NotePatch,
  NoteUpsertBroadcast,
  PresenceBroadcast,
  RollGesture,
  RulerBroadcast,
  RulerClearBroadcast,
  SceneVisibility,
  RulerClearPayload,
  RulerUpdatePayload,
  SceneActivateBroadcast,
  SceneListBroadcast,
  ScenePatch,
  SceneUpdateBroadcast,
  SceneView,
  SceneViewBroadcast,
  ScenePoint,
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
  TokenSyncBroadcast,
  RollParseError,
  TokenUpsertBroadcast,
  TokenView,
  OpeningSyncBroadcast,
  ExplorationSyncBroadcast,
  VisionSyncBroadcast,
  WallKind,
  WallSyncBroadcast,
  WallView,
  WeaponReloadPayload,
} from '@vtt/shared';
import {
  CHAT_COMMANDS_HELP,
  CPRED_ATTACK_PROBLEM_MESSAGES,
  CPRED_GRAPPLE_PROBLEM_MESSAGES,
  MAX_DICE_PER_TERM,
  MAX_DIE_SIDES,
  MAX_ROLL_TERMS,
  ROLE_GM,
  TOKEN_MOVE_RATE_HZ,
  TOKEN_PATH_MAX_POINTS,
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
import { useCompendiumStore } from './stores/compendiumStore.js';
import { useAiStore } from './stores/aiStore.js';
import { useBotStore } from './stores/botStore.js';
import { useCombatStore } from './stores/combatStore.js';
import { useRulerStore } from './stores/rulerStore.js';
import { useDrawingStore } from './stores/drawingStore.js';
import { useFogStore } from './stores/fogStore.js';
import { useNoteStore } from './stores/noteStore.js';
import { useWallStore } from './stores/wallStore.js';
import { useLightStore } from './stores/lightStore.js';
import { useExplorationStore } from './stores/explorationStore.js';
import { useCoverStore } from './stores/coverStore.js';
import { offerCoverChoice, offerShieldChoice } from './attack-targeting.js';

let socket: Socket | undefined;
/** User the live socket authenticated as — a different one forces a reconnect. */
let connectedUserId: string | null = null;

/** Ruler updates per second while dragging — presentation, not state. */
const RULER_RATE_HZ = 20;
let lastRulerSentAt = 0;

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
    useCompendiumStore.getState().applySync(payload);
    useCombatStore.getState().applySync(payload);
    useFogStore.getState().applySync(payload);
    useDrawingStore.getState().applySync(payload);
    useNoteStore.getState().applySync(payload);
    useWallStore.getState().applySync(payload);
    useCoverStore.getState().applySync(payload);
    useLightStore.getState().applySync(payload);
    useExplorationStore.getState().applySync(payload);
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

  // The compendium is shared data: room broadcasts with a seq, like chat.
  socket.on('compendium:upsert', (broadcast: CompendiumUpsertBroadcast) => {
    useCompendiumStore.getState().applyUpsert(broadcast.entry);
  });
  socket.on('compendium:delete', (broadcast: CompendiumDeleteBroadcast) => {
    useCompendiumStore.getState().applyDelete(broadcast.id);
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
  // A message that changed after the fact (stage 15: the GM took an applied
  // damage entry back) — replaced in place, never appended again.
  socket.on('chat:update', (broadcast: ChatMessageBroadcast) => {
    if (chat().updateMessage(broadcast)) socket?.emit('state:request');
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
  // The tracker arrives as a whole: the public view campaign-wide (with a
  // seq), the GM's full view targeted right after it (no seq, like whispers).
  socket.on('combat:update', (broadcast: CombatUpdateBroadcast) => {
    if (broadcast.seq !== undefined && chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    if (viewingScene(broadcast.sceneId)) useCombatStore.getState().setCombat(broadcast.combat);
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

  // Rulers are ephemeral like intermediate drags: no seq, never resynced.
  socket.on('ruler:update', (broadcast: RulerBroadcast) => {
    if (!viewingScene(broadcast.sceneId)) return;
    useRulerStore.getState().receive(broadcast);
  });

  socket.on('ruler:clear', (broadcast: RulerClearBroadcast) => {
    useRulerStore.getState().drop(broadcast.userId);
  });

  // Fog of war (stage 17). The mask is campaign-wide state on the active
  // scene, so it is sequenced like tokens; a GM previewing another map gets
  // targeted, seq-less copies which must not be gap-checked.
  const fog = () => useFogStore.getState();
  socket.on('fog:paint', (broadcast: FogPaintBroadcast) => {
    if (broadcast.seq !== undefined && chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    if (viewingScene(broadcast.sceneId)) {
      fog().append(broadcast.sceneId, broadcast.shape, broadcast.override === true);
    }
  });
  socket.on('fog:sync', (broadcast: FogSyncBroadcast) => {
    if (broadcast.seq !== undefined && chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    if (viewingScene(broadcast.fog.sceneId)) fog().setFog(broadcast.fog);
  });

  // Repainting the fog can both add and remove tokens for one viewer, so the
  // server sends the whole filtered list instead of a stream of deltas.
  socket.on('token:sync', (broadcast: TokenSyncBroadcast) => {
    if (viewingScene(broadcast.sceneId)) tokens().applyTokens(broadcast.tokens, viewer());
  });

  // Map drawings (stage 17b). Public ones are campaign-wide state and carry a
  // seq; the GM layer arrives targeted at the GM room, so — like whispers and
  // note pins — those must never be gap-checked.
  const drawings = () => useDrawingStore.getState();
  socket.on('drawing:upsert', (broadcast: DrawingUpsertBroadcast) => {
    if (broadcast.seq !== undefined && chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    if (viewingScene(broadcast.drawing.sceneId)) drawings().upsert(broadcast.drawing);
  });
  socket.on('drawing:delete', (broadcast: DrawingDeleteBroadcast) => {
    if (broadcast.seq !== undefined && chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    if (viewingScene(broadcast.sceneId)) drawings().remove(broadcast.drawingId);
  });
  socket.on('drawing:clear', (broadcast: DrawingClearBroadcast) => {
    if (broadcast.seq !== undefined && chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    // The sweep carries a rule, not a list: „drop this author's drawings" (or
    // all of them) lands correctly on every client, each of which already
    // holds only what it may see.
    drawings().clear(broadcast.sceneId, broadcast.authorId);
  });

  // Walls, openings and the field of view (stage 18a). All three are targeted —
  // walls at the GM room, vision and openings at one player's socket — so none of
  // them carries a seq and none may be gap-checked.
  socket.on('wall:sync', (broadcast: WallSyncBroadcast) => {
    if (viewingScene(broadcast.sceneId)) {
      useWallStore.getState().setWalls(broadcast.sceneId, broadcast.walls);
    }
  });
  socket.on('vision:sync', (broadcast: VisionSyncBroadcast) => {
    if (!viewingScene(broadcast.sceneId)) return;
    // One event, two stores: the server computes the field of view and the light
    // inside it in a single pass, and splitting the payload here would only mean
    // two chances for the map to draw a mask that belongs to another position.
    useWallStore.getState().setVision(broadcast.polygons);
    useLightStore.getState().setVisionLight(broadcast.light ?? null, broadcast.glows ?? []);
  });
  // Lamp rows are GM-only and targeted at the GM room — no seq, like walls.
  socket.on('light:sync', (broadcast: LightSyncBroadcast) => {
    if (viewingScene(broadcast.sceneId)) {
      useLightStore.getState().setLights(broadcast.sceneId, broadcast.lights);
    }
  });
  // Cover is the one scene object every viewer receives (stage 16c), so unlike
  // `wall:sync` this one goes to the room and carries a seq on the active
  // scene — a missed edit would leave somebody planning a route through a car
  // that is no longer there.
  socket.on('cover:sync', (broadcast: CoverSyncBroadcast & { seq?: number }) => {
    if (chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    if (viewingScene(broadcast.sceneId)) {
      useCoverStore.getState().setCovers(broadcast.sceneId, broadcast.covers);
    }
  });
  socket.on('opening:sync', (broadcast: OpeningSyncBroadcast) => {
    if (viewingScene(broadcast.sceneId)) useWallStore.getState().setOpenings(broadcast.openings);
  });
  // The party's memory of the map (stage 18c). One broadcast for everybody —
  // exploration is shared, so unlike `vision:sync` it is not composed per
  // socket — and no seq, because a missed one is corrected by the next
  // discovery rather than by a resync.
  socket.on('explore:sync', (broadcast: ExplorationSyncBroadcast) => {
    if (viewingScene(broadcast.sceneId)) {
      useExplorationStore.getState().setExploration(broadcast.mask);
    }
  });

  // GM layer notes are targeted at the GM room — no seq, like whispers.
  socket.on('note:upsert', (broadcast: NoteUpsertBroadcast) => {
    if (viewingScene(broadcast.note.sceneId)) useNoteStore.getState().upsert(broadcast.note);
  });
  socket.on('note:delete', (broadcast: NoteDeleteBroadcast) => {
    useNoteStore.getState().remove(broadcast.noteId);
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

/** Polish hints for the damage rejections (GM-only actions, stage 15). */
function damageAckErrorText(code: string): string {
  switch (code) {
    case 'MESSAGE_NOT_FOUND':
      return 'Nie znalazłem tego rzutu na czacie.';
    case 'NOT_A_DAMAGE_ROLL':
      return 'Ten wpis nie jest rzutem na obrażenia.';
    case 'TOKEN_NOT_FOUND':
      return 'Nie ma takiego tokenu na scenie.';
    case 'TOKEN_HAS_NO_HP':
      return 'Ten token nie ma PW — powiąż go z kartą albo ustaw PW w menu tokenu.';
    case 'ALREADY_UNDONE':
      return 'To rozliczenie zostało już cofnięte.';
    case 'FORBIDDEN':
      return 'Obrażenia rozlicza MG.';
    default:
      return `Błąd rozliczenia obrażeń: ${code}`;
  }
}

/** GM applies a rolled damage total to a token (server recomputes everything). */
export function applyDamage(payload: DamageApplyPayload): void {
  socket?.emit('damage:apply', payload, (ack: SocketAck<{ messageId: number }>) => {
    if (!ack.ok) useChatStore.getState().addNote(damageAckErrorText(ack.error));
  });
}

/** GM takes back an applied damage entry (HP, armor and injury are restored). */
export function undoDamage(messageId: number): void {
  const payload: DamageUndoPayload = { messageId };
  socket?.emit('damage:undo', payload, (ack: SocketAck) => {
    if (!ack.ok) useChatStore.getState().addNote(damageAckErrorText(ack.error));
  });
}

/** Polish hints for attack rejections (stage 16). */
function attackAckErrorText(code: string): string {
  const known = CPRED_ATTACK_PROBLEM_MESSAGES[code as keyof typeof CPRED_ATTACK_PROBLEM_MESSAGES];
  if (known) return known;
  switch (code) {
    case 'TOKEN_NOT_FOUND':
      return 'Nie ma takiego celu na scenie.';
    case 'ATTACKER_NOT_ON_SCENE':
      return 'Ta postać nie ma tokenu na tej scenie.';
    case 'ATTACKER_NOT_LINKED':
      return 'Ten token nie należy do tej postaci.';
    case 'ATTACKER_ON_OTHER_SCENE':
      return 'Atakujący stoi na innej scenie.';
    case 'CHARACTER_NOT_FOUND':
      return 'Nie możesz atakować tą postacią.';
    case 'NOT_THE_TARGET':
      return 'Unikać może tylko cel ataku.';
    case 'ALREADY_EVADED':
      return 'Ten atak został już zakwestionowany unikiem.';
    case 'NOT_AN_ATTACK':
      return 'Ten wpis nie jest atakiem.';
    case 'WEAPON_HAS_NO_MAGAZINE':
      return 'Ta broń nie ma magazynka do przeładowania.';
    case 'UNKNOWN_AMMO':
      return 'Nie ma takiego naboju w kompendium.';
    case 'TOKEN_HAS_NO_PROFILE':
      return 'Ten token nie ma profilu bojowego — uzupełnij go w „Edytuj…” w menu tokenu.';
    default:
      return `Błąd ataku: ${code}`;
  }
}

/**
 * Fires from the map. The client names the target token and the weapon; the
 * server measures the distance between the tokens and derives the DV — that is
 * why no distance travels here.
 */
export function sendAttackRoll(
  /** Sheet firing; omitted for a statist, whose token carries the numbers. */
  characterId: string | undefined,
  /** What is aimed at: a token, a cover (16c) or a square of ground (16d). */
  target: { tokenId?: string; coverId?: number; point?: ScenePoint },
  request: CpredAttackRequest,
  attackerTokenId?: string,
  gesture?: RollGesture,
): void {
  const payload: AttackRollPayload<CpredAttackRequest> = {
    ...(characterId ? { characterId } : {}),
    ...(target.point
      ? { targetPoint: target.point }
      : target.coverId !== undefined
        ? { targetCoverId: target.coverId }
        : { targetTokenId: target.tokenId ?? '' }),
    request,
    ...(attackerTokenId ? { attackerTokenId } : {}),
    ...(gesture ? { gesture } : {}),
  };
  socket?.emit('attack:roll', payload, (ack: SocketAck<AttackRollResult>) => {
    if (!ack.ok) {
      useChatStore.getState().addNote(attackAckErrorText(ack.error));
      return;
    }
    // Stage 16c: the shot did not happen because something was in the way, and
    // the server says *what*. Nothing was rolled and nothing was spent, so the
    // answer is a card with the two choices rather than an error — the same
    // card the local preview raises for a cover it could see coming.
    const blocked = ack.data?.blocked;
    if (!blocked || !attackerTokenId) return;
    const intent = {
      ...(characterId ? { characterId } : {}),
      attackerTokenId,
      weaponRowId: request.weaponRowId,
      mode: request.mode,
      ...(request.aimed ? { aimed: true } : {}),
      ...(request.modifier ? { modifier: request.modifier } : {}),
    };
    if (blocked.kind === 'cover') {
      if (!target.tokenId) return;
      offerCoverChoice(intent, target.tokenId, {
        id: blocked.coverId,
        name: blocked.name,
        hpCurrent: blocked.hpCurrent,
        hpMax: blocked.hpMax,
      });
      return;
    }
    if (target.tokenId) offerShieldChoice(intent, target.tokenId, blocked);
  });
}

/** The defender contests an attack: the DV is replaced by a real Evasion roll. */
export function sendAttackEvade(
  messageId: number,
  characterId: string,
  gesture?: RollGesture,
  /** The figure jumping clear of a blast (stage 16d); absent for a dodge. */
  tokenId?: string,
): void {
  const payload: AttackEvadePayload = {
    messageId,
    characterId,
    ...(tokenId ? { tokenId } : {}),
    ...(gesture ? { gesture } : {}),
  };
  socket?.emit('attack:evade', payload, (ack: SocketAck<{ total: number; hit: boolean }>) => {
    if (!ack.ok) useChatStore.getState().addNote(attackAckErrorText(ack.error));
  });
}

/** Reloads a weapon row to a full magazine (an Action at the table). */
export function reloadWeapon(
  characterId: string,
  weaponRowId: string,
  /**
   * Load this kind of round while reloading (stage 16g); `null` is ordinary
   * ammunition. Changing the round goes through the reload event and not
   * through a sheet edit, which is how „zmiana naboju kosztuje Przeładowanie"
   * comes out enforced rather than merely written down.
   */
  ammoId?: string | null,
): void {
  const payload: WeaponReloadPayload = {
    characterId,
    weaponRowId,
    ...(ammoId !== undefined ? { ammoId } : {}),
  };
  socket?.emit('weapon:reload', payload, (ack: SocketAck<{ ammo: number }>) => {
    if (!ack.ok) useChatStore.getState().addNote(attackAckErrorText(ack.error));
  });
}

/**
 * Streams the ruler while it is being dragged. Throttled like token drags —
 * a measurement is presentation, not state, and nobody needs 120 Hz of it.
 */
export function sendRuler(sceneId: string, points: ScenePoint[], isPrivate: boolean): void {
  const now = Date.now();
  if (now - lastRulerSentAt < 1000 / RULER_RATE_HZ) return;
  lastRulerSentAt = now;
  const payload: RulerUpdatePayload = {
    sceneId,
    points,
    ...(isPrivate ? { private: true } : {}),
  };
  socket?.emit('ruler:update', payload);
}

/** Tells the other viewers the measurement is over. */
export function clearRuler(sceneId: string): void {
  lastRulerSentAt = 0;
  const payload: RulerClearPayload = { sceneId };
  socket?.emit('ruler:clear', payload);
}

/* Fog of war and the GM layer (stage 17) — GM-only calls; the server rejects
   them for a player regardless of what the UI shows. */

export const paintFog = (sceneId: string, shape: FogShape) =>
  emitSceneAck('fog:paint', { sceneId, shape });

export const resetFog = (sceneId: string, mode: 'reveal' | 'hide' | 'clear') =>
  emitSceneAck('fog:reset', { sceneId, mode });

export const undoFog = (sceneId: string) => emitSceneAck('fog:undo', { sceneId });

export const setSceneVisibility = (sceneId: string, visibility: SceneVisibility) =>
  emitSceneAck<SceneVisibility>('scene:visibility', { sceneId, visibility });

/* Exploration memory (stage 18c) — GM-only. */

export const setSceneExplore = (sceneId: string, explore: boolean) =>
  emitSceneAck<SceneView>('scene:explore', { sceneId, explore });

export const forgetExploration = (sceneId: string) => emitSceneAck('explore:forget', { sceneId });

export const createNote = (sceneId: string, x: number, y: number, text: string, icon?: string) =>
  emitSceneAck<MapNoteView>('note:create', { sceneId, x, y, text, icon });

export const updateNote = (noteId: string, patch: NotePatch) =>
  emitSceneAck<MapNoteView>('note:update', { noteId, patch });

export const deleteNote = (noteId: string) => emitSceneAck('note:delete', { noteId });

/* Map drawings (stage 17b) — open to players too; the server enforces both the
   GM layer and „your own lines are yours". */

export const createDrawing = (
  sceneId: string,
  shape: DrawingShape,
  style: DrawingStyle,
  gmOnly: boolean,
) => emitSceneAck<DrawingView>('drawing:create', { sceneId, shape, style, gmOnly });

export const deleteDrawing = (drawingId: number) => emitSceneAck('drawing:delete', { drawingId });

export const clearDrawings = (sceneId: string, scope: 'mine' | 'all') =>
  emitSceneAck('drawing:clear', { sceneId, scope });

/* Walls, doors and windows (stage 18a). Everything here is GM-only except
   `toggleOpening`, which a player may use on a door or window the GM flagged —
   and only from arm's reach, while they can see it and it is not bolted; the
   server checks all of it, whatever the UI offers. */

export const createWalls = (
  sceneId: string,
  points: ScenePoint[],
  kind: WallKind,
  playerToggle: boolean,
) => emitSceneAck<WallView[]>('wall:create', { sceneId, points, kind, playerToggle });

export const updateWall = (
  wallId: number,
  patch: { kind?: WallKind; playerToggle?: boolean; locked?: boolean },
) => emitSceneAck<WallView>('wall:update', { wallId, patch });

export const deleteWall = (wallId: number) => emitSceneAck('wall:delete', { wallId });

export const clearWalls = (sceneId: string) => emitSceneAck('wall:clear', { sceneId });

export const toggleOpening = (wallId: number, open?: boolean) =>
  emitSceneAck<WallView>('opening:toggle', { wallId, open });

/* Cover (stage 16c). GM-only to edit, visible to everybody — the body points
   are *not* sent: the server reads them out of the catalogue the preset names,
   so a client cannot type its own toughness into a car. */

export const createCover = (
  sceneId: string,
  typeId: string,
  rect: { x: number; y: number; width: number; height: number },
) => emitSceneAck<CoverView>('cover:create', { sceneId, typeId, ...rect });

export const updateCover = (
  coverId: number,
  patch: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    name?: string;
    hpCurrent?: number;
  },
) => emitSceneAck<CoverView>('cover:update', { coverId, patch });

export const deleteCover = (coverId: number) => emitSceneAck('cover:delete', { coverId });

export const clearCovers = (sceneId: string) => emitSceneAck('cover:clear', { sceneId });

/* Lights and darkness (stage 18b). GM-only except `toggleTokenLight`, which the
   controller of a token may use on their own torch — the server checks that,
   whatever the UI offers. */

export const createLight = (
  sceneId: string,
  x: number,
  y: number,
  spec: { brightM: number; dimM: number; color: string; flicker: boolean; fitRoom?: boolean },
) => emitSceneAck<LightView>('light:create', { sceneId, x, y, ...spec });

export const updateLight = (lightId: number, patch: LightPatch, fitRoom?: boolean) =>
  emitSceneAck<LightView>('light:update', { lightId, patch, fitRoom });

export const deleteLight = (lightId: number) => emitSceneAck('light:delete', { lightId });

/** Zapal/zgaś — the one light action a player performs, on a token they control. */
export const toggleTokenLight = (tokenId: string, on?: boolean) =>
  emitSceneAck<TokenView>('token:light', { tokenId, on });

export const setSceneLighting = (sceneId: string, patch: { dark?: boolean; darkSightM?: number }) =>
  emitSceneAck<SceneView>('scene:lighting', { sceneId, ...patch });

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

/* Combat tracker (stage 14). Every call resolves with the fresh combat view;
   the same state also arrives as a broadcast, so the UI may ignore the ack. */

export const startCombat = (sceneId: string, tokenIds: string[]) =>
  emitSceneAck<CombatView>('combat:start', { sceneId, tokenIds });

export const addToCombat = (tokenIds: string[]) =>
  emitSceneAck<CombatView>('combat:add', { tokenIds });

export const removeFromCombat = (combatantId: string) =>
  emitSceneAck<CombatView>('combat:remove', { combatantId });

export const rollCombatInitiativeForAll = (rerollAll = false) =>
  emitSceneAck<CombatView>('combat:roll-all', { rerollAll });

export const rerollCombatTie = (combatantIds: string[]) =>
  emitSceneAck<CombatView>('combat:reroll-tie', { combatantIds });

export const setCombatInitiative = (combatantId: string, initiative: number | null) =>
  emitSceneAck<CombatView>('combat:set-initiative', { combatantId, initiative });

export const reorderCombat = (combatantIds: string[]) =>
  emitSceneAck<CombatView>('combat:order', { combatantIds });

export const nextCombatTurn = () => emitSceneAck<CombatView>('combat:next', {});

export const previousCombatTurn = () => emitSceneAck<CombatView>('combat:previous', {});

export const endCombat = () => emitSceneAck('combat:end', {});

/**
 * One participant's own initiative, thrown with the dice cup — the gesture
 * carries into the server's RNG and the result lands on chat like any roll.
 */
export function sendInitiativeRoll(combatantId: string, gesture?: RollGesture): void {
  const payload = gesture ? { combatantId, gesture } : { combatantId };
  socket?.emit('combat:roll', payload, (ack: SocketAck<{ initiative: number }>) => {
    if (!ack.ok) useChatStore.getState().addNote(combatErrorText(ack.error));
  });
}

/* Action economy (stage 14b). The budget itself is never sent by the client —
   it only names an intention, and the server answers with the fresh tracker. */

export const spendCombatAction = (actionId: string, note?: string, combatantId?: string) =>
  emitSceneAck<CombatView>('combat:action', {
    actionId,
    ...(note ? { note } : {}),
    ...(combatantId ? { combatantId } : {}),
  });

/** GM waves one refused action through — a single-use pass. */
export const allowCombatAction = (combatantId: string, messageId?: number) =>
  emitSceneAck<CombatView>('combat:allow', {
    combatantId,
    ...(messageId !== undefined ? { messageId } : {}),
  });

/** „Wstrzymanie Akcji": a described trigger, a queue value, or both. */
export const holdCombatAction = (
  declaration: { trigger?: string; initiative?: number | null },
  combatantId?: string,
) =>
  emitSceneAck<CombatView>('combat:hold', {
    ...declaration,
    ...(combatantId ? { combatantId } : {}),
  });

export const releaseCombatHold = (combatantId: string) =>
  emitSceneAck<CombatView>('combat:hold-release', { combatantId });

export const resetCombatTurn = (combatantId: string) =>
  emitSceneAck<CombatView>('combat:reset-turn', { combatantId });

/** „Ruch utrudniony": the mover declares it, the server charges double for it. */
export const setCombatTerrain = (hard: boolean, combatantId?: string) =>
  emitSceneAck<CombatView>('combat:terrain', {
    hard,
    ...(combatantId ? { combatantId } : {}),
  });

/**
 * Periodic effects (stage 14e). The GM says „pali się, i to mocno"; what that
 * costs per turn is the server's business, and even the intensity is validated
 * there — a status the rules compute themselves ignores the number entirely.
 */
export const setTokenEffect = (
  tokenId: string,
  statusId: string,
  active: boolean,
  damage?: number | null,
) =>
  emitSceneAck<{ statuses: string[] }>('token:effect', {
    tokenId,
    statusId,
    active,
    ...(damage !== undefined ? { damage } : {}),
  });

/* Grappling (stage 14d). Like an attack, the client names an intention and a
   target token — never a distance, never a DV, never who ends up holding whom. */

/** Pochwycenie, taking an item, or wrestling free — one opposed test each. */
export function sendGrappleAttempt(
  characterId: string,
  targetTokenId: string,
  intent: 'hold' | 'item' | 'escape',
  attackerTokenId?: string,
  gesture?: RollGesture,
): void {
  const payload: CombatGrapplePayload<RollGesture> = {
    characterId,
    targetTokenId,
    intent,
    ...(attackerTokenId ? { attackerTokenId } : {}),
    ...(gesture ? { gesture } : {}),
  };
  socket?.emit('grapple:attempt', payload, (ack: SocketAck<{ messageId: number }>) => {
    if (!ack.ok) useChatStore.getState().addNote(grappleAckErrorText(ack.error));
  });
}

/** „Broń się": the defender answers an attempt already sitting on the chat. */
export function sendGrappleResist(
  messageId: number,
  characterId: string,
  gesture?: RollGesture,
): void {
  const payload: CombatGrappleResistPayload<RollGesture> = {
    messageId,
    characterId,
    ...(gesture ? { gesture } : {}),
  };
  socket?.emit('grapple:resist', payload, (ack: SocketAck<{ total: number; won: boolean }>) => {
    if (!ack.ok) useChatStore.getState().addNote(grappleAckErrorText(ack.error));
  });
}

/** Duszenie, Rzut, Ludzka tarcza, Uwolnienie — no roll, just an Action. */
export const sendGrappleAction = (
  kind: 'choke' | 'throw' | 'human-shield' | 'release',
  combatantId?: string,
) =>
  emitSceneAck<CombatView>('grapple:action', {
    kind,
    ...(combatantId ? { combatantId } : {}),
  });

function grappleAckErrorText(code: string): string {
  const known = CPRED_GRAPPLE_PROBLEM_MESSAGES[code as keyof typeof CPRED_GRAPPLE_PROBLEM_MESSAGES];
  if (known) return known;
  switch (code) {
    case 'NOT_AN_OPPOSED_TEST':
      return 'Ten wpis nie jest testem spornym.';
    case 'ALREADY_ANSWERED':
      return 'Ten test został już zakwestionowany.';
    case 'TOKEN_HAS_NO_HP':
      return 'Ten cel nie ma punktów wytrzymałości.';
    default:
      return combatErrorText(code);
  }
}

/** Polish messages for tracker rejections. */
export function combatErrorText(code: string): string {
  switch (code) {
    case 'COMBAT_NOT_FOUND':
      return 'Nie ma trwającej walki na tej scenie.';
    case 'COMBATANT_NOT_FOUND':
      return 'Nie znaleziono uczestnika walki — odśwież stronę.';
    case 'TOKEN_NOT_FOUND':
      return 'Nie znaleziono tokenu — odśwież stronę.';
    case 'TOO_MANY_COMBATANTS':
      return 'Za dużo uczestników walki.';
    case 'FORBIDDEN':
      return 'To nie jest twoja tura.';
    case 'SCENE_NOT_FOUND':
      return 'Scena zniknęła — odśwież stronę.';
    // Budget refusals (stage 14b) — the same wording the GM's card shows.
    case 'NOT_YOUR_TURN':
      return 'To nie jest twoja tura.';
    case 'NO_ACTION_LEFT':
      return 'Nie masz już Akcji w tej turze.';
    case 'NO_MOVE_LEFT':
      return 'Nie masz już Akcji Ruchu w tej turze.';
    case 'ROF_EXCEEDED':
      return 'Ta broń nie zmieści się w rozpoczętej Akcji Ataku (LA).';
    case 'AIM_NEEDS_FULL_ACTION':
      return 'Celowanie zabiera całą Akcję — nie po rozpoczętym ataku.';
    case 'RUN_NEEDS_MOVE':
      return 'Bieg wymaga wcześniejszego wykonania Akcji Ruchu w tej turze.';
    case 'HOLD_NEEDS_DECLARATION':
      return 'Wstrzymanie Akcji wymaga opisu wyzwalacza albo wartości w kolejce.';
    case 'NOTHING_HELD':
      return 'Ten uczestnik nie ma wstrzymanej Akcji.';
    case 'USE_HOLD_EVENT':
      return 'Wstrzymanie Akcji deklaruje się osobnym przyciskiem.';
    // Stage 14c: the metres (or the status) that stopped the drag are on the
    // refusal card; the tracker only needs to say that it was stopped.
    case 'MOVE_REFUSED':
      return 'Ruch odrzucony — szczegóły na karcie odmowy.';
    // Stage 14d: the refusal already carries its own sentence on the card.
    case 'STATUS_BLOCKED':
      return 'Stan tokenu nie pozwala na tę Akcję — szczegóły na karcie odmowy.';
    case 'DODGE_BLOCKED':
      return 'W tym stanie nie można Unikać.';
    // Stage 14e: a Critical Injury took this turn's Action or Move Action away
    // before it began. The wound's own sentence rides on the refusal card.
    case 'ACTION_BLOCKED':
      return 'Rana krytyczna zabiera ci Akcję w tej turze — szczegóły na karcie odmowy.';
    case 'MOVE_BLOCKED':
      return 'Rana krytyczna zabiera ci Akcję Ruchu w tej turze — szczegóły na karcie odmowy.';
    default:
      return `Błąd walki: ${code}`;
  }
}

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
  path?: ScenePoint[],
): Promise<SocketAck<{ x: number; y: number }>> | null {
  if (!final) {
    const now = Date.now();
    if (now - lastMoveSentAt < 1000 / TOKEN_MOVE_RATE_HZ) return null;
    lastMoveSentAt = now;
    socket?.emit('token:move', { tokenId, x, y, final: false });
    return null;
  }
  // The route rides on the drop only (stage 14c): the server charges movement
  // by its length, and intermediate frames are a hand in motion, not a walk.
  return emitSceneAck<{ x: number; y: number }>('token:move', {
    tokenId,
    x,
    y,
    final: true,
    ...(path && path.length > 0 ? { path: path.slice(0, TOKEN_PATH_MAX_POINTS) } : {}),
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

/** GM: creates or updates one of the campaign's own compendium entries. */
export function saveCompendiumEntry(entry: unknown): Promise<SocketAck<CompendiumEntry>> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve({ ok: false, error: 'OFFLINE' });
      return;
    }
    socket.emit('compendium:upsert', { entry }, (ack: SocketAck<CompendiumEntry>) => resolve(ack));
  });
}

/** GM: removes one of the campaign's own entries (imported data is read-only). */
export function deleteCompendiumEntry(id: string): Promise<SocketAck> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve({ ok: false, error: 'OFFLINE' });
      return;
    }
    socket.emit('compendium:delete', { id }, (ack: SocketAck) => resolve(ack));
  });
}
