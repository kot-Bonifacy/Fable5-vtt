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
  AttackSmartPayload,
  EffectExpirePayload,
  SmokeClearPayload,
  AttackRollPayload,
  AttackRollResult,
  CampaignSwitchBroadcast,
  CharacterInjuryPayload,
  CoverSyncBroadcast,
  DefenseZoneCreatePayload,
  DefenseZoneSyncBroadcast,
  DefenseZoneUpdatePayload,
  DefenseZoneView,
  CpredCreationDraft,
  CreationDraftView,
  CreationFinishPayload,
  SmokeSyncBroadcast,
  CoverUpdatePayload,
  CoverView,
  BotActionTraceBroadcast,
  BotActivityBroadcast,
  BotPlayTurnResult,
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
  CharacterCyberwarePayload,
  CharacterDeleteBroadcast,
  CharacterPatch,
  CharacterRollPayload,
  CharacterUpsertBroadcast,
  CharacterView,
  CombatUpdateBroadcast,
  CombatFacedownConcedePayload,
  CombatFacedownPayload,
  CombatFacedownResistPayload,
  CombatGrapplePayload,
  CombatGrappleResistPayload,
  ReputationRecognisePayload,
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
  EconomyAdjustPayload,
  EconomyBuyPayload,
  EconomyHistoryResult,
  EconomySettlePayload,
  EconomyTransferPayload,
  DrawingClearBroadcast,
  DrawingDeleteBroadcast,
  DrawingShape,
  DrawingStyle,
  DrawingUpdatePayload,
  DrawingUpsertBroadcast,
  DrawingView,
  FogPaintBroadcast,
  BotRelationView,
  FogShape,
  FogSyncBroadcast,
  HandoutDeleteBroadcast,
  HandoutOpenBroadcast,
  HandoutSyncPayload,
  HandoutUpsertBroadcast,
  HandoutUpsertPayload,
  HandoutView,
  JournalDeleteBroadcast,
  JournalDraftBroadcast,
  JournalEntryView,
  JournalErrorBroadcast,
  JournalIndexStatus,
  JournalPlayerSyncPayload,
  JournalPlayerUpsertBroadcast,
  JournalProgressBroadcast,
  JournalSyncPayload,
  JournalUpsertBroadcast,
  JournalUpsertPayload,
  KnowledgeDeleteBroadcast,
  KnowledgeEntryView,
  KnowledgeIndexStatus,
  KnowledgePreviewResult,
  KnowledgeSyncPayload,
  KnowledgeUpsertBroadcast,
  NetArchitectureDeleteBroadcast,
  NetArchitectureListPayload,
  NetArchitectureRollPayload,
  NetArchitectureRollResult,
  NetAccessPointPlacePayload,
  NetAccessPointSyncBroadcast,
  NetAccessPointUpdatePayload,
  NetAccessPointView,
  NetDemonActPayload,
  NetIceActPayload,
  NetRunAbilityPayload,
  NetRunAbilityResult,
  NetRunAttackPayload,
  NetRunPayload,
  NetRunDevicePayload,
  NetRunProgramPayload,
  NetRunSlidePayload,
  NetRunSyncBroadcast,
  CpredNetPosition,
  NetArchitectureSavePayload,
  NetArchitectureView,
  KnowledgeUpsertPayload,
  LightPatch,
  LightSyncBroadcast,
  LightView,
  MapNoteView,
  RelationDeleteBroadcast,
  RelationSetPayload,
  RelationSyncPayload,
  RelationUpsertBroadcast,
  NoteDeleteBroadcast,
  NotePatch,
  NoteUpsertBroadcast,
  DiceSkinId,
  PresenceBroadcast,
  RollGesture,
  MapFxBroadcast,
  RulerBroadcast,
  RulerClearBroadcast,
  SceneVisibility,
  RulerClearPayload,
  RulerUpdatePayload,
  RulesAskPayload,
  RulesChunkBroadcast,
  RulesDoneBroadcast,
  RulesErrorBroadcast,
  RulesIndexStatus,
  RulesSourcesBroadcast,
  SceneActivateBroadcast,
  SceneListBroadcast,
  ScenePatch,
  SceneUndoResult,
  SceneUpdateBroadcast,
  SceneView,
  SceneViewBroadcast,
  ScenePoint,
  ScreamsheetDraftBroadcast,
  ScreamsheetErrorBroadcast,
  ServerHello,
  SocketAck,
  StateSyncPayload,
  TokenAssetDeleteResult,
  TokenCreatePayload,
  TokenDeleteBroadcast,
  TokenMoveBroadcast,
  TokenPatch,
  TokenSyncBroadcast,
  RollParseError,
  ShopTierBroadcast,
  TokenUpsertBroadcast,
  TokenView,
  OpeningSyncBroadcast,
  ExplorationSyncBroadcast,
  VisionSyncBroadcast,
  WallKind,
  WallUpdatePayload,
  WallSyncBroadcast,
  WallView,
  WeaponReloadPayload,
} from '@vtt/shared';
import {
  CHAT_COMMANDS_HELP,
  CPRED_ATTACK_PROBLEM_MESSAGES,
  CPRED_FACEDOWN_PROBLEM_MESSAGES,
  CPRED_GRAPPLE_PROBLEM_MESSAGES,
  MAX_DICE_PER_TERM,
  MAX_DIE_SIDES,
  MAX_ROLL_TERMS,
  ROLE_GM,
  clampShopTier,
  screamsheetErrorText,
  shopTierRefusalText,
  TOKEN_MOVE_RATE_HZ,
  TOKEN_PATH_MAX_POINTS,
  parseChatInput,
} from '@vtt/shared';
import { playRollAnimation, toAnimationNotation } from './dice3d.js';
import { receiveMapFx, releaseMapFx } from './map-fx.js';
import { shouldTypeOut, typeOutMessage } from './typewriter.js';
import { useConnectionStore } from './stores/connectionStore.js';
import { oldestMessageId, useChatStore } from './stores/chatStore.js';
import { useSceneStore } from './stores/sceneStore.js';
import { useAuthStore } from './stores/authStore.js';
import { useTokenStore, type TokenViewerCtx } from './stores/tokenStore.js';
import { useCharacterStore } from './stores/characterStore.js';
import { useCompendiumStore } from './stores/compendiumStore.js';
import { useAiStore } from './stores/aiStore.js';
import { useRulesStore } from './stores/rulesStore.js';
import { useKnowledgeStore } from './stores/knowledgeStore.js';
import { useNetStore } from './stores/netStore.js';
import { useNetRunStore } from './stores/netRunStore.js';
import { useJournalStore } from './stores/journalStore.js';
import { useHandoutStore } from './stores/handoutStore.js';
import { useScreamsheetStore } from './stores/screamsheetStore.js';
import { useRelationStore } from './stores/relationStore.js';
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
import { useSmokeStore } from './stores/smokeStore.js';
import { useZoneStore } from './stores/zoneStore.js';
import { useSettingsStore } from './stores/settingsStore.js';
import { useSelectionStore } from './stores/selectionStore.js';
import { useHudStore } from './stores/hudStore.js';
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

/**
 * Ślad decyzji mechanicznej bota (etap 20a) — notatka wyłącznie u MG.
 *
 * Notatka, a nie wiadomość: karta rzutu, która z tej decyzji wyniknie, jest
 * zwyczajna, a gracze nie mają się dowiedzieć, że rzucał nią model. „Dlaczego
 * bot to zrobił" jest pytaniem MG i zostaje po jego stronie ekranu.
 */
function botActionTraceText(trace: BotActionTraceBroadcast): string {
  const took = `${trace.decisionMs} ms${trace.retried ? ' · poprawka' : ''}`;
  const why = trace.reason ? ` — „${trace.reason}"` : '';
  // Krok tury bojowej (20b) mówi też, KOGO bot widział. To najczęstsza
  // odpowiedź na „dlaczego nie zaatakował", a z samej decyzji nie da się jej
  // odgadnąć — stąd lista figur w śladzie, a nie tylko wybór.
  const where = trace.combat
    ? ` · ${trace.combat.actorName}, krok ${trace.combat.step}` +
      ` · widzi: ${trace.combat.figures.length > 0 ? trace.combat.figures.join(', ') : 'nikogo'}`
    : '';
  const what = trace.combat?.summary ?? trace.optionLabel ?? '?';
  switch (trace.outcome) {
    case 'executed':
      return `🎲 ${trace.botName} wykonał: ${what} · ${took}${where}${why}`;
    case 'proposed':
      return `🎲 ${trace.botName} proponuje: ${what} · ${took}${where}${why}`;
    case 'talk':
      return `🎲 ${trace.botName} uznał to za rozmowę, nie prośbę o test · ${took}${why}`;
    case 'pass':
      return `🎲 ${trace.botName} pasuje · ${took}${where}${why}`;
    default:
      return `🎲 ${trace.botName}: akcja odrzucona — ${trace.refusal ?? 'nieznany powód'} · ${took}${where}`;
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

/** Polish messages for rules-assistant failures (stage 19a). */
function rulesErrorText(code: string, detail?: string): string {
  switch (code) {
    case 'RULES_EMPTY_QUESTION':
      return 'Wpisz pytanie o zasady.';
    case 'RULES_QUESTION_TOO_LONG':
      return 'Pytanie jest za długie — zapytaj o jedną rzecz naraz.';
    case 'RAG_UNAVAILABLE':
      // Powód z gatewaya („podręcznik nie jest jeszcze zaindeksowany", „indeks
      // zbudowano innym modelem") mówi MG, co zrobić — kod sam w sobie nie mówi nic.
      return detail
        ? `Przeszukanie podręcznika nieudane: ${detail}`
        : 'Podręcznik nie jest zaindeksowany — kliknij „Zaindeksuj podręcznik".';
    default:
      return aiErrorText(code, detail);
  }
}

/** Polish messages for bot-editor failures (stage 10). */
export function botErrorText(code: string, detail?: string): string {
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
    useSmokeStore.getState().applySync(payload);
    useZoneStore.getState().applySync(payload);
    useLightStore.getState().applySync(payload);
    useExplorationStore.getState().applySync(payload);
    // Punkty dostępu i runy (26b) przychodzą już pocięte per widz — store
    // nie ma tu czego filtrować.
    useNetRunStore.getState().replacePoints(payload.accessPoints ?? []);
    useNetRunStore.getState().replaceRuns(payload.netRuns ?? []);
    if (payload.ai) useAiStore.getState().setStatus(payload.ai);
  });

  /**
   * MG przełączył aktywną kampanię (błąd #1 z sesji testów walki 08.08).
   *
   * Świat przyszedł już w `state:sync`, który leci tuż przed tym zdarzeniem —
   * tu zostaje to, czego tamten ładunek nie niesie: nazwa w górnym pasku
   * (mieszka w sklepie logowania, karmionym RESTem) i wskaźniki tego widza,
   * które pokazują na figury z poprzedniej kampanii.
   */
  socket.on('campaign:switch', (broadcast: CampaignSwitchBroadcast) => {
    void useAuthStore.getState().initialize();
    useSelectionStore.getState().resetFocus();
    useHudStore.getState().setActiveWeapon(null);
    useHudStore.getState().setForm(null);
    chat().addNote(
      broadcast.campaign
        ? `Aktywna kampania: ${broadcast.campaign.name}.`
        : 'Ta kampania nie jest już aktywna — MG przełączył stół.',
    );
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
  socket.on('bot:action-trace', (broadcast: BotActionTraceBroadcast) =>
    chat().addNote(botActionTraceText(broadcast)),
  );
  socket.on('bot:notice', (broadcast: BotNoticeBroadcast) =>
    chat().addNote(botNoticeText(broadcast)),
  );

  // AI status/streams are targeted, carry no seq and are never persisted —
  // the gateway is an external service, not game state.
  const ai = () => useAiStore.getState();
  socket.on('ai:status', (broadcast: AiStatusBroadcast) => {
    ai().setStatus(broadcast.status);
    // Gateway wrócił — zdejmij zdanie, które właśnie przestało być prawdą.
    // Dziennik trzyma swój błąd u siebie (nie w statusie z serwera), więc bez
    // tego „Brak połączenia z AI Gateway" wisiał w panelu do następnej akcji MG.
    if (broadcast.status.available) useJournalStore.getState().clearAiError();
  });
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

  // Asystent zasad (etap 19a): fragmenty przychodzą PRZED odpowiedzią, więc MG
  // widzi źródła nawet wtedy, gdy generacja się urwie.
  const rules = () => useRulesStore.getState();
  socket.on('rules:sources', (broadcast: RulesSourcesBroadcast) =>
    rules().setSources(broadcast.requestId, broadcast.passages, broadcast.searchMs),
  );
  socket.on('rules:chunk', (broadcast: RulesChunkBroadcast) =>
    rules().appendChunk(broadcast.requestId, broadcast.kind, broadcast.text),
  );
  socket.on('rules:done', (broadcast: RulesDoneBroadcast) =>
    rules().finish(
      broadcast.requestId,
      broadcast.totalMs,
      broadcast.completionTokens,
      broadcast.retriedWithoutReasoning ?? false,
    ),
  );
  socket.on('rules:error', (broadcast: RulesErrorBroadcast) =>
    rules().fail(broadcast.requestId, rulesErrorText(broadcast.code, broadcast.detail)),
  );

  // Baza wiedzy kampanii (etap 19b) — emisje celowane w pokój MG, bez seq:
  // wpisy niosą sekrety fabuły i nie mają prawa dotrzeć do gracza.
  socket.on('knowledge:upsert', (broadcast: KnowledgeUpsertBroadcast) =>
    useKnowledgeStore.getState().upsert(broadcast.entry, broadcast.index),
  );
  socket.on('knowledge:delete', (broadcast: KnowledgeDeleteBroadcast) =>
    useKnowledgeStore.getState().remove(broadcast.id, broadcast.index),
  );

  // Biblioteka Architektur Sieciowych (26a) — ta sama zasada co wyżej: PT,
  // Czarne LOD-y i notatki MG lecą wyłącznie do pokoju MG.
  socket.on('net:architectures', (payload: NetArchitectureListPayload) =>
    useNetStore.getState().replaceAll(payload.architectures),
  );
  socket.on('netpoint:sync', (broadcast: NetAccessPointSyncBroadcast) =>
    useNetRunStore.getState().replacePoints(broadcast.points),
  );
  socket.on('netrun:sync', (broadcast: NetRunSyncBroadcast) =>
    useNetRunStore.getState().replaceRuns(broadcast.runs),
  );
  socket.on('net:deleted', (broadcast: NetArchitectureDeleteBroadcast) =>
    useNetStore.getState().remove(broadcast.id),
  );

  // Dziennik kampanii (19c) i jego wyjście do stołu (24b). Serwer wysyła MG
  // i graczowi **dwa różne kształty** pod tą samą nazwą zdarzenia — gniazdo
  // należy do jednego konta, więc rozstrzyga o tym rola, a nie zgadywanie po
  // polach payloadu.
  socket.on(
    'journal:upsert',
    (broadcast: JournalUpsertBroadcast | JournalPlayerUpsertBroadcast) => {
      const store = useJournalStore.getState();
      if (useAuthStore.getState().user?.role === ROLE_GM) {
        const gm = broadcast as JournalUpsertBroadcast;
        store.upsert(gm.entry, gm.index);
      } else {
        store.upsertShared(broadcast.entry);
      }
    },
  );
  socket.on('journal:delete', (broadcast: JournalDeleteBroadcast) => {
    const store = useJournalStore.getState();
    if (useAuthStore.getState().user?.role === ROLE_GM) store.remove(broadcast.id, broadcast.index);
    else store.removeShared(broadcast.id);
  });
  socket.on('journal:progress', (broadcast: JournalProgressBroadcast) =>
    useJournalStore.getState().setProgress(broadcast),
  );
  socket.on('journal:draft', (broadcast: JournalDraftBroadcast) =>
    useJournalStore.getState().setDraft(broadcast.draft, broadcast.proposals, broadcast.batches),
  );
  socket.on('journal:error', (broadcast: JournalErrorBroadcast) =>
    useJournalStore
      .getState()
      .fail(journalErrorText(broadcast.code, broadcast.detail), broadcast.code),
  );
  // Handouty (etap 24a) — jedyna lista MG z wyjściem do gracza. Serwer wysyła
  // je celowanym emitem do kont z udostępnieniem, więc klient nic nie odsiewa.
  socket.on('handout:upsert', (broadcast: HandoutUpsertBroadcast) =>
    useHandoutStore.getState().upsert(broadcast.handout),
  );
  socket.on('handout:delete', (broadcast: HandoutDeleteBroadcast) =>
    useHandoutStore.getState().remove(broadcast.id),
  );
  // „Masz to w ręku" — okno wyskakuje samo, ale tylko świeżo dopisanym odbiorcom.
  socket.on('handout:open', (broadcast: HandoutOpenBroadcast) => {
    const store = useHandoutStore.getState();
    store.upsert(broadcast.handout);
    store.openHandout(broadcast.handout.id);
  });

  // Generator screamsheetów (24c) — artykuł przychodzi osobnym zdarzeniem,
  // bo model pisze go kilkanaście sekund. Nic tu nie ląduje w bazie: szkic
  // czeka w formularzu MG.
  socket.on('screamsheet:draft', (broadcast: ScreamsheetDraftBroadcast) =>
    useScreamsheetStore
      .getState()
      .complete(broadcast.requestId, broadcast.draft, broadcast.totalMs),
  );
  socket.on('screamsheet:error', (broadcast: ScreamsheetErrorBroadcast) =>
    useScreamsheetStore
      .getState()
      .fail(broadcast.requestId, screamsheetErrorText(broadcast.code, broadcast.detail)),
  );

  socket.on('relation:upsert', (broadcast: RelationUpsertBroadcast) =>
    useRelationStore.getState().upsert(broadcast.relation),
  );
  socket.on('relation:delete', (broadcast: RelationDeleteBroadcast) =>
    useRelationStore.getState().remove(broadcast.botId, broadcast.characterId),
  );

  // The compendium is shared data: room broadcasts with a seq, like chat.
  socket.on('compendium:upsert', (broadcast: CompendiumUpsertBroadcast) => {
    useCompendiumStore.getState().applyUpsert(broadcast.entry);
  });
  socket.on('compendium:delete', (broadcast: CompendiumDeleteBroadcast) => {
    useCompendiumStore.getState().applyDelete(broadcast.id);
  });
  // The GM's shop dial (stage 25c): a room broadcast, because a catalogue that
  // opened up only after a reload is a catalogue the table argues about.
  socket.on('shop:tier', (broadcast: ShopTierBroadcast) => {
    useCompendiumStore.getState().applyShopTier(broadcast.tier);
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
    // Świeża wypowiedź NPC-a dopisuje się słowo po słowie — linia jest już
    // w kanale, odsłania się tylko stopniowo (efekt czysto kliencki).
    if (shouldTypeOut(broadcast.message)) {
      typeOutMessage(broadcast.message);
      return;
    }
    if (hold && roll) {
      const reveal = () => {
        useChatStore.getState().revealMessage(broadcast.message.id);
        // …and with the card, whatever the map was holding behind it (27i).
        releaseMapFx(broadcast.message.id);
      };
      const guard = window.setTimeout(reveal, MAX_ANIMATION_WAIT_MS);
      void playRollAnimation(roll).then((played) => {
        window.clearTimeout(guard);
        window.setTimeout(reveal, played ? CARD_REVEAL_DELAY_MS : 0);
      });
      return;
    }
    // No dice to wait for — an ordinary message, or a table with the animation
    // switched off. The card is already on screen, so the map may fire at once.
    releaseMapFx(broadcast.message.id);
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
      tokens().applyMove(broadcast.tokenId, broadcast.x, broadcast.y, broadcast.facing);
    }
  });

  // Rulers are ephemeral like intermediate drags: no seq, never resynced.
  // Map effects (stage 27i) — never sequenced and never replayed on a resync,
  // exactly like the ruler below: an effect is something that happened, not
  // something that is.
  socket.on('fx:play', (broadcast: MapFxBroadcast) => receiveMapFx(broadcast));
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
  // Smoke rides with the covers (stage 16h) and for the same reason: everybody
  // sees the cloud, and a missed edit would leave a player rolling -4 for a
  // square that has been clear for a round.
  socket.on('smoke:sync', (broadcast: SmokeSyncBroadcast & { seq?: number }) => {
    if (chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    if (viewingScene(broadcast.sceneId)) {
      useSmokeStore.getState().setSmoke(broadcast.sceneId, broadcast.smoke);
    }
  });
  // Strefy bronione (26f) jadą per gniazdo, nie do pokoju: to, czy gracz ma
  // pułapkę w payloadzie, zależy od tego, czy jego postać ją zauważyła — więc
  // jeden broadcast dla wszystkich byłby wyciekiem. Bez `seq` z tego samego
  // powodu, dla którego nie ma go `vision:sync`.
  socket.on('zone:sync', (broadcast: DefenseZoneSyncBroadcast) => {
    if (viewingScene(broadcast.sceneId)) {
      useZoneStore.getState().setZones(broadcast.sceneId, broadcast.zones);
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
    case 'TOKEN_HAS_NO_PROFILE':
      return 'Ta figura nie ma profilu bojowego — uzupełnij go w menu żetonu.';
    case 'STATIST_CANNOT_ROLL_THIS':
      return 'Figura bez karty rzuca tylko na obrażenia z karty ataku.';
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
  /** Sheet rolling; omitted for a statist, whose token carries the numbers. */
  characterId: string | undefined,
  request: CpredRollRequest,
  visibility: 'public' | 'gm',
  gesture?: RollGesture,
  /** Figure rolling when there is no sheet — read only without a character. */
  attackerTokenId?: string,
): void {
  const payload: CharacterRollPayload<CpredRollRequest> = {
    ...(characterId ? { characterId } : { attackerTokenId }),
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

/**
 * MG nadaje ranę krytyczną z ręki (sesja naprawcza 22.08).
 *
 * Ranę zapisuje serwer tą samą funkcją, co rzut na obrażenia, więc niesie
 * wszystkie kary i flagi; na czacie ląduje zwykła karta obrażeń, którą „Cofnij"
 * już umie zdjąć.
 */
export function assignCriticalInjury(payload: CharacterInjuryPayload): void {
  socket?.emit('character:injury', payload, (ack: SocketAck) => {
    if (ack.ok) return;
    useChatStore
      .getState()
      .addNote(
        ack.error === 'INJURY_ALREADY_THERE'
          ? 'Ta postać już ma tę ranę.'
          : ack.error === 'UNKNOWN_INJURY'
            ? 'Nie znalazłem tej rany w kompendium.'
            : damageAckErrorText(ack.error),
      );
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
      ...(request.aimedAt ? { aimedAt: request.aimedAt } : {}),
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
  /** Null for a figure without a sheet — it dodges with its combat profile. */
  characterId: string | null,
  gesture?: RollGesture,
  /** The figure jumping clear of a blast (stage 16d); absent for a dodge. */
  tokenId?: string,
): void {
  const payload: AttackEvadePayload = {
    messageId,
    ...(characterId ? { characterId } : {}),
    ...(tokenId ? { tokenId } : {}),
    ...(gesture ? { gesture } : {}),
  };
  socket?.emit('attack:evade', payload, (ack: SocketAck<{ total: number; hit: boolean }>) => {
    if (!ack.ok) useChatStore.getState().addNote(attackAckErrorText(ack.error));
  });
}

/**
 * The shooter takes the second roll a smart round earned (stage 16h).
 *
 * The mirror image of the dodge above and deliberately a separate call: this one
 * is rolled by the attacker, and it must not mark the defender's Evasion as
 * spent — „cel mogący Unikać dalej może Unikać" (s. 347).
 */
export function sendAttackSmart(
  messageId: number,
  characterId: string,
  gesture?: RollGesture,
  luckSpent?: number,
): void {
  const payload: AttackSmartPayload = {
    messageId,
    characterId,
    ...(luckSpent && luckSpent > 0 ? { luckSpent } : {}),
    ...(gesture ? { gesture } : {}),
  };
  socket?.emit('attack:smart', payload, (ack: SocketAck<{ total: number; hit: boolean }>) => {
    if (!ack.ok) useChatStore.getState().addNote(attackAckErrorText(ack.error));
  });
}

/**
 * The GM ends a timed effect by hand (stage 16h) — „Minęła minuta".
 *
 * Outside a fight this is the only clock there is: no round ticks, so nothing
 * else can take the blindness off. Inside one it is an early exit.
 */
export function expireTimedEffect(payload: EffectExpirePayload): void {
  socket?.emit('effect:expire', payload, (ack: SocketAck<{ removed: string[] }>) => {
    if (!ack.ok) useChatStore.getState().addNote('Nie udało się zdjąć efektu.');
  });
}

/** Clears one cloud of smoke, or every cloud on the scene (stage 16h). */
export function clearSmoke(sceneId: string, smokeId?: number): void {
  const payload: SmokeClearPayload = { sceneId, ...(smokeId !== undefined ? { smokeId } : {}) };
  socket?.emit('smoke:clear', payload, (ack: SocketAck<{ cleared: number }>) => {
    if (!ack.ok) useChatStore.getState().addNote('Nie udało się rozwiać dymu.');
  });
}

/**
 * Reloads a weapon row to a full magazine (an Action at the table).
 *
 * A statist reloads through the same event (29.08) — it simply has no sheet to
 * name, so the token carries the address instead. Exactly one of the two is
 * given, the same bargain `sendCharacterRoll` makes.
 */
export function reloadWeapon(
  characterId: string | undefined,
  weaponRowId: string,
  /**
   * Load this kind of round while reloading (stage 16g); `null` is ordinary
   * ammunition. Changing the round goes through the reload event and not
   * through a sheet edit, which is how „zmiana naboju kosztuje Przeładowanie"
   * comes out enforced rather than merely written down.
   */
  ammoId?: string | null,
  /** Statist doing the reloading, when there is no sheet to name. */
  attackerTokenId?: string,
): void {
  const payload: WeaponReloadPayload = {
    ...(characterId ? { characterId } : { attackerTokenId }),
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

/** Karta rysunku (etap 27l): kolor, grubość, wypełnienie, warstwa, kształt. */
export const updateDrawing = (drawingId: number, patch: DrawingUpdatePayload['patch']) =>
  emitSceneAck<DrawingView>('drawing:update', { drawingId, patch });

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

export const updateWall = (wallId: number, patch: WallUpdatePayload['patch']) =>
  emitSceneAck<WallView>('wall:update', { wallId, patch });

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

export const updateCover = (coverId: number, patch: CoverUpdatePayload['patch']) =>
  emitSceneAck<CoverView>('cover:update', { coverId, patch });

export const deleteCover = (coverId: number) => emitSceneAck('cover:delete', { coverId });

export const clearCovers = (sceneId: string) => emitSceneAck('cover:clear', { sceneId });

/* Strefy bronione (etap 26f). Tylko MG je stawia; liczby — PW, Wartość bojowa,
   efekt — czyta serwer z kompendium, więc klient wysyła wyłącznie prostokąt
   i wpis, dokładnie tak jak przy osłonie wyżej. */

export const createZone = (
  sceneId: string,
  entryId: string,
  rect: { x: number; y: number; width: number; height: number },
  options: { name?: string; hidden?: boolean } = {},
) =>
  emitSceneAck<DefenseZoneView>('zone:create', {
    sceneId,
    entryId,
    ...rect,
    ...options,
  } satisfies DefenseZoneCreatePayload);

export const updateZone = (zoneId: number, patch: DefenseZoneUpdatePayload['patch']) =>
  emitSceneAck<DefenseZoneView>('zone:update', { zoneId, patch });

export const deleteZone = (zoneId: number) => emitSceneAck('zone:delete', { zoneId });

export const clearZones = (sceneId: string) => emitSceneAck('zone:clear', { sceneId });

/** „Odpal system" i „Tura systemu" — ten sam przycisk, bo to ten sam akt. */
export const fireZone = (zoneId: number, tokenId?: string) =>
  emitSceneAck<{ summary: string }>('zone:fire', { zoneId, ...(tokenId ? { tokenId } : {}) });

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

/** Kosz warstwy świateł (etap 27k) — jak `clearWalls`, cofalny jednym `Ctrl+Z`. */
export const clearLights = (sceneId: string) => emitSceneAck('light:clear', { sceneId });

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

/**
 * Pytanie o zasady (MG). Ack oddaje samo id — fragmenty i odpowiedź lecą
 * osobnymi zdarzeniami, jak przy `ai:ask`.
 */
export function askRules(payload: RulesAskPayload): void {
  const question = payload.question.trim();
  if (!question) return;
  if (!socket) {
    useRulesStore.getState().failLocally(question, 'Brak połączenia z serwerem.');
    return;
  }
  socket.emit('rules:ask', payload, (ack: SocketAck<{ requestId: string }>) => {
    const store = useRulesStore.getState();
    if (ack.ok && ack.data) store.start(ack.data.requestId, question);
    else if (!ack.ok) store.failLocally(question, rulesErrorText(ack.error));
  });
}

/** Stan indeksu podręcznika (MG). Odpytywane też w pętli podczas indeksowania. */
export function fetchRulesStatus(): Promise<RulesIndexStatus | null> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve(null);
      return;
    }
    socket.emit('rules:status', (ack: SocketAck<RulesIndexStatus>) => {
      if (ack.ok && ack.data) useRulesStore.getState().setStatus(ack.data);
      resolve(ack.ok ? (ack.data ?? null) : null);
    });
  });
}

/** Uruchamia indeksowanie podręcznika po stronie gatewaya (MG). */
export function indexRulebook(): Promise<RulesIndexStatus | null> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve(null);
      return;
    }
    socket.emit('rules:index', (ack: SocketAck<RulesIndexStatus>) => {
      if (ack.ok && ack.data) useRulesStore.getState().setStatus(ack.data);
      resolve(ack.ok ? (ack.data ?? null) : null);
    });
  });
}

/** Baza wiedzy kampanii (MG). Wołane przy wejściu w zakładkę, nie w `state:sync`. */
export function fetchKnowledge(): Promise<KnowledgeSyncPayload | null> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve(null);
      return;
    }
    socket.emit('knowledge:list', (ack: SocketAck<KnowledgeSyncPayload>) => {
      if (ack.ok && ack.data)
        useKnowledgeStore.getState().replaceAll(ack.data.entries, ack.data.index);
      resolve(ack.ok ? (ack.data ?? null) : null);
    });
  });
}

export const saveKnowledgeEntry = (payload: KnowledgeUpsertPayload) =>
  emitSceneAck<KnowledgeEntryView>('knowledge:upsert', payload);

export const deleteKnowledgeEntry = (id: string) => emitSceneAck('knowledge:delete', { id });

/** Pełny przebieg indeksowania bazy wiedzy — dogania to, co się rozjechało. */
export const reindexKnowledge = () =>
  emitSceneAck<KnowledgeIndexStatus>('knowledge:reindex', undefined);

/**
 * Biblioteka Architektur Sieciowych (26a). Wołane przy wejściu w zakładkę,
 * nie w `state:sync` — u gracza ta lista nie istnieje w ogóle.
 */
export function fetchNetArchitectures(): Promise<NetArchitectureListPayload | null> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve(null);
      return;
    }
    socket.emit('net:list', (ack: SocketAck<NetArchitectureListPayload>) => {
      if (ack.ok && ack.data) useNetStore.getState().replaceAll(ack.data.architectures);
      resolve(ack.ok ? (ack.data ?? null) : null);
    });
  });
}

export const fetchNetArchitecture = (id: string) =>
  emitSceneAck<NetArchitectureView>('net:get', { id });

export const saveNetArchitecture = (payload: NetArchitectureSavePayload) =>
  emitSceneAck<NetArchitectureView>('net:save', payload);

export const deleteNetArchitecture = (id: string) => emitSceneAck('net:delete', { id });

export const rollNetArchitecture = (payload: NetArchitectureRollPayload) =>
  emitSceneAck<NetArchitectureRollResult>('net:roll', payload);

/**
 * Punkty dostępu i run (etap 26b).
 *
 * Bez własnego `fetch` na starcie: jedno i drugie jedzie w `state:sync`, bo
 * punkt dostępu jest częścią sceny, a run trwa w tle całej sesji — gracz ma go
 * zobaczyć od razu po wejściu, nie po otwarciu zakładki.
 */
export const placeNetAccessPoint = (payload: NetAccessPointPlacePayload) =>
  emitSceneAck<NetAccessPointView>('netpoint:place', payload);

export const updateNetAccessPoint = (payload: NetAccessPointUpdatePayload) =>
  emitSceneAck<NetAccessPointView>('netpoint:update', payload);

export const removeNetAccessPoint = (id: number) => emitSceneAck('netpoint:remove', { id });

/** Kosz warstwy gniazd (etap 27k). */
export const clearNetAccessPoints = (sceneId: string) =>
  emitSceneAck('netpoint:clear', { sceneId });

export const startNetRun = (tokenId: string, accessPointId: number) =>
  emitSceneAck<NetRunPayload>('netrun:start', { tokenId, accessPointId });

export const leaveNetRun = (runId: string) => emitSceneAck('netrun:leave', { runId });

export const moveNetRun = (runId: string, to: CpredNetPosition) =>
  emitSceneAck<NetRunPayload>('netrun:move', { runId, to });

export const copyNetFile = (runId: string, floorId: string) =>
  emitSceneAck<NetRunPayload>('netrun:copy', { runId, floorId });

export const useNetAbility = (payload: NetRunAbilityPayload) =>
  emitSceneAck<NetRunAbilityResult>('netrun:ability', payload);

export const runNetScan = (tokenId: string, gesture?: RollGesture) =>
  emitSceneAck<NetRunAbilityResult>('netrun:scan', { tokenId, gesture });

/* ── walka w Sieci (etap 26c) ── */

/** Uruchomienie albo zatrzymanie Programu — po jednej Akcji Sieciowej. */
export const toggleNetProgram = (payload: NetRunProgramPayload) =>
  emitSceneAck<NetRunAbilityResult>('netrun:program', payload);

/** Atak Agresorem z deku albo Paf, gdy `rowId` nie ma. */
export const attackInNet = (payload: NetRunAttackPayload) =>
  emitSceneAck<NetRunAbilityResult>('netrun:attack', payload);

export const slideInNet = (payload: NetRunSlidePayload) =>
  emitSceneAck<NetRunAbilityResult>('netrun:slide', payload);

/** Dwa przyciski MG: wykrycie intruza i Tura Czarnego LOD-u. */
export const iceDetects = (payload: NetIceActPayload) =>
  emitSceneAck<NetRunAbilityResult>('netrun:ice:detect', payload);

export const iceTakesTurn = (payload: NetIceActPayload) =>
  emitSceneAck<NetRunAbilityResult>('netrun:ice:turn', payload);

export const clearNetGlue = (runId: string) => emitSceneAck('netrun:glue', { runId });

/* ── węzły kontrolne (etap 26d) ── */

/**
 * Obsługa jednej rzeczy podłączonej do przejętego węzła — po Akcji Sieciowej
 * za każdą, a sam węzeł raz na Turę. Strzał z wieżyczki idzie tą samą drogą:
 * `operation: 'fire'` plus cel, a serwer odpala silnik ataku z etapu 16.
 */
export const operateNetDevice = (payload: NetRunDevicePayload) =>
  emitSceneAck<NetRunAbilityResult>('netrun:device', payload);

/* ── Demony (etap 26e) ── */

/**
 * Dwa przyciski MG przy Demonie. „Wykrycie" nie ma za sobą testu — Demon nie ma
 * PRĘDKOŚCI — a „Tura" rozgrywa całą jego Turę naraz, z celami wybranymi przez
 * silnik (decyzja MG z 16.08).
 */
export const demonDetects = (payload: NetDemonActPayload) =>
  emitSceneAck<NetRunAbilityResult>('netrun:demon:detect', payload);

export const demonTakesTurn = (payload: NetDemonActPayload) =>
  emitSceneAck<NetRunAbilityResult>('netrun:demon:turn', payload);

/**
 * Dziennik kampanii. Wołane przy wejściu w zakładkę, nie w `state:sync`.
 *
 * Od 24b odpowiada też graczowi — samymi wpisami odsłoniętymi stołowi, bez
 * narzędzi MG. Kształt rozstrzyga rola konta, tak jak przy rozgłoszeniach.
 */
export function fetchJournal(): Promise<JournalSyncPayload | JournalPlayerSyncPayload | null> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve(null);
      return;
    }
    const isGm = useAuthStore.getState().user?.role === ROLE_GM;
    socket.emit('journal:list', (ack: SocketAck<JournalSyncPayload | JournalPlayerSyncPayload>) => {
      if (ack.ok && ack.data) {
        const store = useJournalStore.getState();
        if (isGm) {
          const data = ack.data as JournalSyncPayload;
          store.replaceAll(data.entries, data.index, data.pendingLines, data.handouts);
        } else {
          store.replaceShared((ack.data as JournalPlayerSyncPayload).entries);
        }
      }
      resolve(ack.ok ? (ack.data ?? null) : null);
    });
  });
}

export const saveJournalEntry = (payload: JournalUpsertPayload) =>
  emitSceneAck<JournalEntryView>('journal:upsert', payload);

export const deleteJournalEntry = (id: string) => emitSceneAck('journal:delete', { id });

export const reindexJournal = () => emitSceneAck<JournalIndexStatus>('journal:reindex', undefined);

/**
 * Handouty (etap 24a). Wołane przy wejściu w zakładkę, nie w `state:sync` —
 * u gracza lista bywa pusta przez całą sesję, a u MG rośnie między sesjami.
 */
export function fetchHandouts(): Promise<HandoutSyncPayload | null> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve(null);
      return;
    }
    socket.emit('handout:list', (ack: SocketAck<HandoutSyncPayload>) => {
      if (ack.ok && ack.data) {
        useHandoutStore.getState().replaceAll(ack.data.handouts, ack.data.recipients);
      }
      resolve(ack.ok ? (ack.data ?? null) : null);
    });
  });
}

export const saveHandout = (payload: HandoutUpsertPayload) =>
  emitSceneAck<HandoutView>('handout:upsert', payload);

export const deleteHandout = (id: string) => emitSceneAck('handout:delete', { id });

/** Ustawia listę odbiorców na dokładnie tę — serwer wyliczy, kto doszedł. */
export const shareHandout = (id: string, userIds: string[]) =>
  emitSceneAck<HandoutView>('handout:share', { id, userIds });

/**
 * „Napisz screamsheet". Jak przy streszczaniu: ack niesie tylko id żądania,
 * a gotowy artykuł przychodzi osobnym `screamsheet:draft`. Odmowa z acka
 * (martwy gateway, puste hasło) ląduje w store od razu — po polsku.
 */
export async function generateScreamsheet(topic: string, outlet: string): Promise<void> {
  const store = useScreamsheetStore.getState();
  store.start('');
  const ack = await emitSceneAck<{ requestId: string }>('screamsheet:generate', { topic, outlet });
  if (!ack.ok || !ack.data) {
    store.fail(null, screamsheetErrorText(ack.ok ? 'AI_ERROR' : ack.error));
    return;
  }
  store.start(ack.data.requestId);
}

export const cancelScreamsheet = () => {
  socket?.emit('screamsheet:cancel');
  useScreamsheetStore.getState().reset();
};

/**
 * „Zakończ sesję i streść". Ack niesie samo id żądania — wynik przychodzi
 * osobnym `journal:draft`, bo streszczanie długiego logu to dziesiątki sekund.
 */
export const summarizeSession = (hint: string) =>
  emitSceneAck<{ requestId: string }>('journal:summarize', { hint });

export const cancelSummary = () => socket?.emit('journal:cancel');

/** Po polsku, z następnym krokiem — kody odmowy widzi tylko MG. */
export function journalErrorText(code: string, detail?: string): string {
  if (code.startsWith('INVALID_ENTRY:')) {
    return code.slice('INVALID_ENTRY:'.length) || 'Nieprawidłowe dane wpisu.';
  }
  switch (code) {
    case 'ENTRY_NOT_FOUND':
      return 'Tego wpisu już nie ma.';
    case 'UNKNOWN_HANDOUT':
      return 'Któryś z przypiętych materiałów nie należy do tej kampanii.';
    case 'JOURNAL_EMPTY_LOG':
      return 'Nie ma czego streścić — od ostatniego wpisu dziennika nikt nic nie powiedział na czacie.';
    case 'AI_UNAVAILABLE':
      return 'Brak połączenia z AI Gateway — streszczanie wymaga modelu.';
    default:
      return detail ? `Streszczanie nie poszło: ${detail}` : 'Streszczanie nie poszło.';
  }
}

/** Relacje NPC↔postacie (MG). */
export function fetchRelations(): Promise<RelationSyncPayload | null> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve(null);
      return;
    }
    socket.emit('relation:list', (ack: SocketAck<RelationSyncPayload>) => {
      if (ack.ok && ack.data) useRelationStore.getState().replaceAll(ack.data.relations);
      resolve(ack.ok ? (ack.data ?? null) : null);
    });
  });
}

export const setRelation = (payload: RelationSetPayload) =>
  emitSceneAck<BotRelationView>('relation:set', payload);

export const deleteRelation = (botId: string, characterId: string) =>
  emitSceneAck('relation:delete', { botId, characterId });

/** Podgląd promptu bota z doklejonymi fragmentami (edytor botów, zakładka „Prompt"). */
export const previewBotPrompt = (botId: string, message: string) =>
  emitSceneAck<KnowledgePreviewResult>('knowledge:preview', { botId, message });

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
  const store = useBotStore.getState();
  store.localPatch(botId, patch);

  // Ta sama umowa co przy karcie postaci — patrz `queueCharacterSave`.
  const open = botSaveBuffers.get(botId);
  if (!open) store.beginSave(botId);

  const buffer = open ?? { patch: {}, timer: 0 };
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

  // `beginSave` już poszło przy kolejkowaniu — jeden bufor to jeden zapis.
  const store = useBotStore.getState();
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

/**
 * „Zatwierdź" / „Odrzuć" na karcie propozycji bota (etap 20a). Zatwierdzenie
 * zwraca id wiadomości z rzutem — karta po kliknięciu przestaje oferować przyciski.
 */
export const resolveBotProposal = (messageId: number, approve: boolean) =>
  emitSceneAck<{ rollMessageId: number | null }>('bot:proposal', { messageId, approve });

/** „Poproś o akcję" — MG pyta bota wprost, z pominięciem detektora prośby. */
export const askBotToAct = (botId: string, request: string) =>
  emitSceneAck<{ outcome: string }>('bot:act', { botId, request });

/**
 * „Graj turę" (etap 20b) — MG oddaje turę figury botowi, który ją prowadzi.
 *
 * Zawsze na klik, także w trybie automat (decyzja MG): tempo walki należy do
 * stołu, a nie do wskaźnika tury.
 */
export const playBotTurn = (tokenId: string) =>
  emitSceneAck<BotPlayTurnResult>('bot:play-turn', { tokenId });

/**
 * `Ctrl+Z` — cofnij ostatnie własne usunięcie na tej scenie (etap 27k).
 *
 * Bez wskazania, co cofnąć: bufor jest stosem na serwerze, a klient zna tylko
 * własne wciśnięcie klawisza. Serwer odsyła gotowe zdanie na czat, bo tylko on
 * wie, ile wierszy naprawdę wróciło.
 */
export const undoSceneDelete = (sceneId: string) =>
  emitSceneAck<SceneUndoResult>('scene:undo', { sceneId });

function emitSceneAck<T = undefined>(event: string, payload: unknown): Promise<SocketAck<T>> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve({ ok: false, error: 'NOT_CONNECTED' });
      return;
    }
    socket.emit(event, payload, (ack: SocketAck<T>) => resolve(ack));
  });
}

/**
 * Zapisuje skórkę kości tego użytkownika (etap 27d).
 *
 * Jedyne ustawienie wyglądu, które opuszcza przeglądarkę — i musi, bo przy
 * stole widać kości **rzucającego**. Serwer odsyła to, co naprawdę zapisał,
 * więc klient, którego wartości nie przyjęto, i tak kończy zsynchronizowany.
 */
export async function sendDiceSkin(skin: DiceSkinId): Promise<void> {
  const ack = await emitSceneAck<DiceSkinId>('dice:skin', { skin });
  if (ack.ok && ack.data) useSettingsStore.getState().applySkin(ack.data);
}

/**
 * Przełącza aktywną kampanię (MG). Serwer przenosi **wszystkie** podpięte
 * gniazda do nowej kampanii i odsyła każdemu pełny `state:sync` — dlatego to
 * zdarzenie gniazda, a nie kolejna trasa REST: panel MG nie ma jak przestawić
 * cudzego ekranu, a serwer ma.
 */
export const activateCampaign = (campaignId: string) =>
  emitSceneAck('campaign:activate', { campaignId });

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

/**
 * Zdejmuje grafikę z biblioteki żetonów (MG). Ack mówi, ile figur na mapie
 * wróciło przez to do krążka — panel powtarza tę liczbę, bo kosz biblioteki
 * potrafi zmienić scenę, a nie tylko listę.
 */
export const deleteTokenAsset = (assetId: string) =>
  emitSceneAck<TokenAssetDeleteResult>('token:asset-delete', { assetId });

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

/**
 * Konfrontacja (stage 23c): starting one. Costs no Action and needs no combat,
 * so unlike a Pochwycenie there is nothing here to be refused for being out of
 * turn — only for being out of sight.
 */
export function sendFacedownAttempt(
  characterId: string,
  targetTokenId: string,
  challengerTokenId?: string,
  gesture?: RollGesture,
): void {
  const payload: CombatFacedownPayload<RollGesture> = {
    characterId,
    targetTokenId,
    ...(challengerTokenId ? { challengerTokenId } : {}),
    ...(gesture ? { gesture } : {}),
  };
  socket?.emit('facedown:attempt', payload, (ack: SocketAck<{ messageId: number }>) => {
    if (!ack.ok) useChatStore.getState().addNote(facedownAckErrorText(ack.error));
  });
}

/** „Postaw się": the other side answers with real dice instead of half a one. */
export function sendFacedownResist(
  messageId: number,
  characterId: string,
  gesture?: RollGesture,
): void {
  const payload: CombatFacedownResistPayload<RollGesture> = {
    messageId,
    characterId,
    ...(gesture ? { gesture } : {}),
  };
  socket?.emit('facedown:resist', payload, (ack: SocketAck<{ total: number }>) => {
    if (!ack.ok) useChatStore.getState().addNote(facedownAckErrorText(ack.error));
  });
}

/** The loser picks: back off, or stand there and carry the −2. */
export function sendFacedownConcede(messageId: number, choice: 'withdraw' | 'stand'): void {
  const payload: CombatFacedownConcedePayload = { messageId, choice };
  socket?.emit('facedown:concede', payload, (ack: SocketAck<{ choice: string }>) => {
    if (!ack.ok) useChatStore.getState().addNote(facedownAckErrorText(ack.error));
  });
}

/** „Czy go znam?" — 1k10 against the other person's Reputation (s. 193). */
export function sendReputationRecognise(characterId: string, targetTokenId: string): void {
  const payload: ReputationRecognisePayload = { characterId, targetTokenId };
  socket?.emit('reputation:recognise', payload, (ack: SocketAck<{ known: boolean }>) => {
    if (!ack.ok) useChatStore.getState().addNote(facedownAckErrorText(ack.error));
  });
}

function facedownAckErrorText(code: string): string {
  const known =
    CPRED_FACEDOWN_PROBLEM_MESSAGES[code as keyof typeof CPRED_FACEDOWN_PROBLEM_MESSAGES];
  if (known) return known;
  switch (code) {
    case 'ALREADY_ANSWERED':
      return 'Ta Konfrontacja została już zakwestionowana.';
    case 'NOT_THE_DEFENDER':
      return 'Tylko druga strona Konfrontacji może się postawić.';
    case 'ATTACKER_NOT_ON_SCENE':
      return 'Ta postać nie ma tokenu na tej scenie.';
    default:
      return combatErrorText(code);
  }
}

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
    case 'COMBATANT_HAS_NO_FIGURE':
      return 'Ten uczestnik nie ma figury na mapie — Czarny LOD działa tylko w Sieci.';
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

// ─────────────────────────── kreator postaci (25a) ───────────────────────────

type CreationDraft = CreationDraftView<CpredCreationDraft>;

/** Opens the wizard; returns the stored draft, or a fresh one. */
export const startCreation = () => emitSceneAck<CreationDraft>('creation:start', undefined);

export const patchCreation = (patch: Record<string, unknown>) =>
  emitSceneAck<CreationDraft>('creation:patch', { patch });

/**
 * One 1d10 per stat, rolled by the server against the Role's template.
 *
 * The gesture is present when the spread came out of the dice cup — a player
 * shakes for their Cechy like for everything else; the GM's plain button rolls
 * without one.
 */
export const rollCreationStats = (gesture?: RollGesture) =>
  emitSceneAck<CreationDraft>('creation:roll', { gesture });

/**
 * Rolls one or many Lifepath tables in a single throw (stage 25b). `index`
 * picks the friend / enemy / tragic love the row belongs to and is ignored by
 * the tables that fill a field of their own.
 */
export const rollCreationLifepath = (tableIds: string[], index?: number) =>
  emitSceneAck<CreationDraft>('creation:lifepath-roll', { tableIds, index });

/** „Rzuć 1k10 i odejmij 7" — how many friends, enemies or tragic loves. */
export const rollCreationLifepathCount = (group: string) =>
  emitSceneAck<CreationDraft>('creation:lifepath-count', { group });

/**
 * One item into or out of the wizard's basket (stage 25c). A delta rather than
 * a quantity: two quick clicks on „+" must not race each other onto the same
 * total, and the server is the one holding the prices anyway.
 */
export const buyCreationItem = (entryId: string, delta: 1 | -1) =>
  emitSceneAck<CreationDraft>('creation:buy', { entryId, delta });

export const finishCreation = (payload: CreationFinishPayload = {}) =>
  emitSceneAck<CharacterView>('creation:finish', payload);

export const discardCreation = () => emitSceneAck('creation:discard', undefined);

export function creationErrorText(code: string | undefined): string {
  // The creator always shops at level 1, so this one reads as „nie na start".
  const locked = shopTierErrorText(code);
  if (locked) return `${locked} Zakupy startowe idą wyłącznie po poziomie 1.`;
  switch (code) {
    case 'CREATION_DATA_MISSING':
      return 'Brak danych tworzenia postaci — kreator nie ma z czego czytać tabel.';
    case 'DRAFT_NOT_FOUND':
      return 'Szkic postaci przepadł. Otwórz kreator jeszcze raz.';
    case 'METHOD_DOES_NOT_ROLL':
      return 'Ta metoda nie losuje Cech — Kompletny Pakiet je kupuje.';
    case 'ROLE_NOT_CHOSEN':
      return 'Najpierw wybierz Rolę.';
    case 'ROLE_HAS_NO_TEMPLATE':
      return 'Ta Rola nie ma w danych szablonu Cech — wybierz Kompletny Pakiet.';
    case 'CREATION_INCOMPLETE':
      return 'Postać nie jest jeszcze gotowa — sprawdź listę braków.';
    case 'INVALID_NAME':
      return 'Nieprawidłowe imię postaci (1–64 znaki).';
    case 'INVALID_DATA':
      return 'Serwer odrzucił tę zmianę.';
    case 'OWNER_NOT_FOUND':
      return 'Wybrany gracz nie należy do kampanii.';
    case 'LIFEPATH_TABLE_UNKNOWN':
      return 'Nie znam tej tabeli Ścieżki Życia — sprawdź, czy Rola się nie zmieniła.';
    case 'LIFEPATH_TARGET_UNKNOWN':
      return 'Nie ma takiego wiersza — najpierw rzuć, ilu masz przyjaciół, wrogów albo miłości.';
    case 'LIFEPATH_ROLL_MISSED':
      return 'Wynik kości nie trafił w żaden wiersz tabeli — dane Ścieżki Życia są niepełne.';
    case 'NOT_ENOUGH_EDDIES':
      return 'Za mało startowych eurodolców na ten zakup.';
    case 'NO_PRICE':
      return 'Ten wpis nie ma ceny — uzupełnij ją w kompendium.';
    case 'NOT_PURCHASABLE':
      return 'Tego się w kreatorze nie kupuje: cyborgizacje instaluje się z karty wpisu, amunicję ładuje się do broni.';
    case 'ENTRY_NOT_FOUND':
      return 'Nie znalazłem tego wpisu w kompendium.';
    case 'TOO_MANY_ROWS':
      return 'Więcej sztuk tego przedmiotu kreator nie przyjmie.';
    case undefined:
      return 'Nieznany błąd kreatora.';
    default:
      return `Błąd kreatora: ${code}`;
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

  /**
   * A buffer counts as an in-flight save from the moment it opens, not from the
   * moment it is sent. `endSave` adopts the server's view once nothing is
   * pending, and the server does not know about a patch still waiting out its
   * debounce — adopting then would roll the sheet back to the previous list and
   * the next edit would rebuild it from that, losing the row for good.
   */
  const open = characterSaveBuffers.get(characterId);
  if (!open) store.beginSave(characterId);

  const buffer = open ?? { patch: {}, timer: 0 };
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

  // `beginSave` już poszło przy kolejkowaniu — jeden bufor to jeden zapis.
  const store = useCharacterStore.getState();
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

/**
 * Turns a figure by hand (stage 27j) — the rotation knob on the selection ring.
 *
 * Its own event rather than a `token:update` patch for the reason the light
 * switch has one: `token:update` is GM-only, and which way you are looking is a
 * decision the person holding the figure makes during a fight.
 */
export const setTokenFacing = (tokenId: string, facing: number | null) =>
  emitSceneAck<TokenView>('token:facing', { tokenId, facing });

/**
 * Names whom a figure backed down from (stage 23c), so the „Onieśmielony"
 * sticker the GM ticked by hand actually costs its −2.
 *
 * Separate from `token:update` because that event never writes `statusData`,
 * which is where the rule looks — the sticker alone has always been half the
 * condition, and until 22.08 the other half had no door.
 */
export const setTokenFeared = (tokenId: string, fearedTokenIds: string[]) =>
  emitSceneAck<TokenView>('token:feared', { tokenId, fearedTokenIds });

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

/** Polish text for a refusal of `character:cyberware` (stage 23a). */
function cyberwareErrorText(code: string | undefined): string {
  switch (code) {
    case 'ENTRY_NOT_FOUND':
      return 'Nie znalazłem tej cyborgizacji w kompendium.';
    case 'ROW_NOT_FOUND':
      return 'Tej cyborgizacji nie ma już na karcie.';
    case 'TOO_MANY_ROWS':
      return 'Lista cyborgizacji jest pełna.';
    // Stage 23b: the operation is paid for before the dice are thrown.
    case 'NOT_ENOUGH_EDDIES':
      return 'Za mało eurodolców na wszczep i montaż.';
    case 'NO_PRICE':
      return 'Ten wpis nie ma ceny — uzupełnij ją w kompendium albo wybierz „Znaleziony”.';
    case 'CHARACTER_NOT_FOUND':
      return 'Nie możesz zmieniać tej karty.';
    case 'OFFLINE':
      return 'Brak połączenia z serwerem.';
    default:
      return 'Nie udało się wykonać operacji na cyborgizacji.';
  }
}

/**
 * Installs, removes or treats — the three ways Humanity moves (stage 23a).
 *
 * Not a sheet edit: the cost of a piece of chrome is rolled on the server, so
 * the client sends the intention and reads the result off the card and the
 * refreshed sheet, exactly like a Check.
 */
export function sendCyberwareAction(
  payload: Omit<CharacterCyberwarePayload, 'gesture'>,
  gesture?: RollGesture,
): void {
  if (!socket) {
    useChatStore.getState().addNote(cyberwareErrorText('OFFLINE'));
    return;
  }
  // Anything buffered would otherwise land after the server's own write and
  // overwrite the freshly rolled Humanity with the pre-install value.
  flushCharacterSave(payload.characterId);
  const full: CharacterCyberwarePayload = { ...payload, ...(gesture ? { gesture } : {}) };
  socket.emit('character:cyberware', full, (ack: SocketAck<{ messageId: number | null }>) => {
    if (!ack.ok) useChatStore.getState().addNote(cyberwareErrorText(ack.error));
  });
}

/* ------------------------------------------------------------------ *
 * Eddies (stage 23b)
 *
 * Every one of these is an ack call rather than fire-and-forget: a wallet
 * refuses (no money, no price, a full sheet), and a refusal the user does not
 * see is a purchase they think went through.
 * ------------------------------------------------------------------ */

/** Polish text for a refusal of any of the `economy:*` events. */
/**
 * „SHOP_TIER_LOCKED:3:1" — the item's own level and the campaign's, in one
 * code. Both numbers travel because „nie wolno" alone sends the player to ask
 * the GM without knowing what to ask for.
 */
function shopTierErrorText(code: string | undefined): string | null {
  if (!code?.startsWith('SHOP_TIER_LOCKED')) return null;
  const [, entryTier, unlocked] = code.split(':');
  const wanted = clampShopTier(Number(entryTier));
  const open = clampShopTier(Number(unlocked));
  return `Poza zasięgiem sklepu. ${shopTierRefusalText(wanted, open)}`;
}

export function economyErrorText(code: string | undefined): string {
  const locked = shopTierErrorText(code);
  if (locked) return locked;
  switch (code) {
    case 'NOT_ENOUGH_EDDIES':
      return 'Za mało eurodolców.';
    case 'NO_PRICE':
      return 'Ten wpis nie ma ceny — uzupełnij ją w kompendium albo podaj własną.';
    case 'NOT_PURCHASABLE':
      return 'Tego się tu nie kupuje: cyborgizacje instaluje się z karty wpisu, amunicję ładuje się do broni.';
    case 'ENTRY_NOT_FOUND':
      return 'Nie znalazłem tego wpisu w kompendium.';
    case 'TOO_MANY_ROWS':
      return 'Ta lista na karcie jest pełna.';
    case 'CHARACTER_NOT_FOUND':
      return 'Nie ma takiej postaci w tej kampanii.';
    case 'FORBIDDEN':
      return 'Tylko MG może to zrobić.';
    case 'BAD_REQUEST':
      return 'Nieprawidłowa kwota.';
    case 'OFFLINE':
    case 'NOT_CONNECTED':
      return 'Brak połączenia z serwerem.';
    default:
      return 'Nie udało się wykonać operacji na eurodolcach.';
  }
}

function emitEconomy<T>(event: string, payload: unknown): Promise<SocketAck<T>> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve({ ok: false, error: 'OFFLINE' });
      return;
    }
    socket.emit(event, payload, (ack: SocketAck<T>) => resolve(ack));
  });
}

/** Buys one catalogue entry: the price leaves the wallet, the row lands. */
export function buyCompendiumEntry(
  payload: EconomyBuyPayload,
): Promise<SocketAck<{ balance: number }>> {
  // Anything buffered would otherwise land after the server's own write and
  // overwrite the freshly charged balance with the pre-purchase one.
  flushCharacterSave(payload.characterId);
  return emitEconomy('economy:buy', payload);
}

export function transferEddies(
  payload: EconomyTransferPayload,
): Promise<SocketAck<{ balance: number }>> {
  flushCharacterSave(payload.fromCharacterId);
  return emitEconomy('economy:transfer', payload);
}

/** GM only: sets a balance outright, leaving a „korekta MG" in the audit. */
export function adjustEddies(
  payload: EconomyAdjustPayload,
): Promise<SocketAck<{ balance: number }>> {
  flushCharacterSave(payload.characterId);
  return emitEconomy('economy:adjust', payload);
}

/** GM only: the first of the month for every character with a Lifestyle. */
export function settleMonth(
  payload: EconomySettlePayload = {},
): Promise<SocketAck<{ charged: number; shortfall: number; settled: number; skipped: number }>> {
  return emitEconomy('economy:settle', payload);
}

/** The audit of one wallet — newest first — plus who it can pay. */
export function fetchLedger(characterId: string): Promise<SocketAck<EconomyHistoryResult>> {
  return emitEconomy('economy:history', { characterId });
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

/** GM: moves the campaign's shop tier (stage 25c); everyone hears about it. */
export function setShopTier(tier: number): Promise<SocketAck<{ tier: number }>> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve({ ok: false, error: 'OFFLINE' });
      return;
    }
    socket.emit('shop:tier', { tier }, (ack: SocketAck<{ tier: number }>) => resolve(ack));
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
