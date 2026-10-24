import { io, type Socket } from 'socket.io-client';
import type { AuthEndedPush, MusicCommand, MusicState, TokenJumpOptionsView } from '@vtt/shared';
import { useMusicStore } from './stores/musicStore.js';
import { chatNotification, notifyGame, startsOwnTurn } from './game-notifications.js';
import { loadOwedDeathSave } from './death-save.js';
import type {
  AiAccessView,
  AiAskPayload,
  AiChunkBroadcast,
  AiDoneBroadcast,
  AiErrorBroadcast,
  AiQueueBroadcast,
  AiStatus,
  AiStatusBroadcast,
  AttackEvadePayload,
  AttackNoEvadePayload,
  AttackRollPayload,
  AttackRollResult,
  AttackSmartPayload,
  BlockerSyncBroadcast,
  BotActionTraceBroadcast,
  BotActivityBroadcast,
  BotChatPayload,
  BotChunkBroadcast,
  BotCreatePayload,
  BotDeleteBroadcast,
  BotErrorBroadcast,
  BotLesson,
  BotNoticeBroadcast,
  BotPatch,
  BotPlayTurnResult,
  BotRelationView,
  BotReplyBroadcast,
  BotSayPayload,
  BotTraceBroadcast,
  BotUpsertBroadcast,
  BotView,
  CampaignCopyFailedPush,
  CampaignSummary,
  CampaignSwitchBroadcast,
  CatalogShopping,
  CatalogShoppingBroadcast,
  CatalogShoppingPayload,
  CharacterAdvancePayload,
  CharacterCreatePayload,
  CharacterCyberwarePayload,
  CharacterDeckPayload,
  CharacterDeleteBroadcast,
  CharacterInjuryPayload,
  CharacterPatch,
  CharacterRoleChangePayload,
  CharacterRollPayload,
  CharacterChemsPayload,
  CharacterStatEffectPayload,
  CharacterUpsertBroadcast,
  CharacterView,
  CharacterXpAwardedPush,
  CharacterXpAwardPayload,
  CharacterXpAwardResult,
  CharacterXpHistoryResult,
  CharacterXpUndoPayload,
  AdvancementUndoProblem,
  ChatHistoryPage,
  ChatMessageBroadcast,
  ChatRecolorPush,
  ChatSendPayload,
  CheckCallPayload,
  CheckCancelPayload,
  CheckRequestCancelPayload,
  CheckRequestPayload,
  CheckRequestResolvePayload,
  CombatFacedownConcedePayload,
  CombatFacedownPayload,
  CombatFacedownResistPayload,
  CombatGrapplePayload,
  CombatGrappleResistPayload,
  CombatUpdateBroadcast,
  CombatView,
  CompendiumDeleteBroadcast,
  CompendiumEntry,
  CompendiumUpsertBroadcast,
  CoverSyncBroadcast,
  CoverUpdatePayload,
  CoverView,
  CpredAdvanceProblem,
  CpredAttackRequest,
  CpredCombatAwarenessProblem,
  CpredCreationDraft,
  CpredHaggleProblem,
  CpredNetPosition,
  CpredRoleChangeProblem,
  CpredRollRequest,
  CpredStatId,
  CpredTeamProblem,
  CreationDraftPeek,
  CreationDraftView,
  CreationFinishPayload,
  CreationFinishResult,
  CreationPatchPayload,
  CreationPermitRow,
  CreationPermitState,
  CreationRankDraft,
  CreationRandomNpcResult,
  CreationRerolledPush,
  CreationTerms,
  CyberwareRequestPayload,
  CyberwareRespondPayload,
  CyberwareSurgeonsPayload,
  CyberwareSurgeonsResult,
  DamageApplyPayload,
  DamageUndoPayload,
  DefenseZoneCreatePayload,
  DefenseZoneSyncBroadcast,
  DefenseZoneDisarmResult,
  DefenseZoneUpdatePayload,
  DefenseZoneView,
  DiceSkinId,
  DrawingClearBroadcast,
  DrawingDeleteBroadcast,
  DrawingShape,
  DrawingStyle,
  DrawingUpdatePayload,
  DrawingUpsertBroadcast,
  DrawingView,
  EconomyAdjustPayload,
  EconomyBuyPayload,
  EconomyHistoryResult,
  EconomySettlePayload,
  EconomyTransferPayload,
  EffectExpirePayload,
  ExplorationSyncBroadcast,
  FogPaintBroadcast,
  FogShape,
  FogSyncBroadcast,
  GameTimeAck,
  GameTimeBroadcast,
  GameTimeStepId,
  HandoutDeleteBroadcast,
  HandoutOpenBroadcast,
  HandoutSyncPayload,
  HandoutUpsertBroadcast,
  HandoutUpsertPayload,
  HandoutView,
  ContainerConfigPayload,
  ContainerCreatePayload,
  ContainerCreateResult,
  ContainerOpenPayload,
  ContainerOpenResult,
  OpeningLockConfigPayload,
  OpeningPickPayload,
  OpeningPickResult,
  ContainerPutPayload,
  ExchangeCounterpartsPayload,
  ExchangeCounterpartsResult,
  InventoryDropPayload,
  InventoryDropResult,
  InventoryGivePayload,
  InventoryGiveResult,
  MerchantConfigPayload,
  MerchantConfigResult,
  MerchantDealPayload,
  MerchantDealResult,
  MerchantGoneBroadcast,
  MerchantListResult,
  MerchantRowPayload,
  MerchantShopsBroadcast,
  MerchantUpdateBroadcast,
  MerchantViewResult,
  InventoryRespondPayload,
  InventoryTakePayload,
  JournalDeleteBroadcast,
  JournalDraftBroadcast,
  JournalEntryView,
  JournalErrorBroadcast,
  JournalIndexStatus,
  JournalPendingPush,
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
  KnowledgeUpsertPayload,
  LightPatch,
  LightSyncBroadcast,
  LightView,
  MapFxBroadcast,
  MapNoteView,
  MapPingBroadcast,
  MapPingPayload,
  NetAccessPointPlacePayload,
  NetAccessPointSyncBroadcast,
  NetAccessPointUpdatePayload,
  NetAccessPointView,
  NetArchitectureDeleteBroadcast,
  NetArchitectureListPayload,
  NetArchitectureRollPayload,
  NetArchitectureRollResult,
  NetArchitectureSavePayload,
  NetArchitectureView,
  NetDemonActPayload,
  NetIceActPayload,
  NetRunAbilityPayload,
  NetRunAbilityResult,
  NetRunAttackPayload,
  NetRunDevicePayload,
  NetRunPayload,
  NetRunProgramPayload,
  NetRunSlidePayload,
  NetRunSyncBroadcast,
  NoteDeleteBroadcast,
  NotePatch,
  NoteUpsertBroadcast,
  OpeningSyncBroadcast,
  PortraitAssetView,
  PortraitCrop,
  PortraitCropBroadcast,
  PortraitWantedRow,
  PresenceBroadcast,
  RandomTableDeleteBroadcast,
  RandomTableListPayload,
  RandomTableRollPayload,
  RandomTableUpsertBroadcast,
  RandomTableUpsertPayload,
  RandomTableView,
  RelationDeleteBroadcast,
  RelationSetPayload,
  RelationSyncPayload,
  RelationUpsertBroadcast,
  ReputationRecognisePayload,
  RollGesture,
  RollParseError,
  RulerBroadcast,
  RulerClearBroadcast,
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
  ScenePoint,
  SceneUndoResult,
  SceneUpdateBroadcast,
  SceneView,
  SceneViewBroadcast,
  SceneVisibility,
  ScreamsheetDraftBroadcast,
  ScreamsheetErrorBroadcast,
  ServerHello,
  SessionChangedPush,
  ShopEntryTierBroadcast,
  ShopTierBroadcast,
  SightingLookPayload,
  SightingLookResult,
  SmokeClearPayload,
  SmokeSyncBroadcast,
  SocketAck,
  StateSyncPayload,
  TokenAimBroadcast,
  HiddenSpottedBroadcast,
  TokenHaltBroadcast,
  CombatJoinedBroadcast,
  CombatOverspendAsk,
  TokenTargetBroadcast,
  TokenAssetDeleteResult,
  TokenCombatProfile,
  TokenCreatePayload,
  TokenDeleteBroadcast,
  TokenMoveBroadcast,
  TokenPaceBroadcast,
  TokenPatch,
  TokenSyncBroadcast,
  TokenUpsertBroadcast,
  TokenView,
  TradeAcceptPayload,
  TradeInvitePayload,
  TradeListResult,
  TradeOfferPayload,
  TradeUpdateBroadcast,
  TradeView,
  VisionSyncBroadcast,
  WallKind,
  WallSyncBroadcast,
  WallUpdatePayload,
  WallView,
  WeaponAttachmentPayload,
  WeaponAttachmentResult,
  WeaponClearJamPayload,
  WeaponDrawPayload,
  WeaponReloadPayload,
} from '@vtt/shared';
import {
  CPRED_STAT_EFFECT_VALUE_MAX,
  CHAT_COMMANDS_HELP,
  describeXpAwardNotice,
  CPRED_ADVANCE_PROBLEMS,
  ADVANCEMENT_UNDO_PROBLEMS,
  CPRED_ROLE_CHANGE_PROBLEMS,
  CPRED_ATTACHMENT_PROBLEM_MESSAGES,
  CPRED_ATTACK_PROBLEM_MESSAGES,
  CPRED_TURN_PROBLEM_MESSAGES,
  CPRED_COMBAT_AWARENESS_PROBLEMS,
  CPRED_DEATH_SAVE_PENDING_MESSAGE,
  CPRED_FLEET_PROBLEMS,
  CPRED_ROLES_PROBLEMS,
  CPRED_SPECIALTY_PROBLEMS,
  CPRED_HAGGLE_PROBLEMS,
  CPRED_MERCHANT_PROBLEM_TEXTS,
  CPRED_TEAM_PROBLEMS,
  CPRED_FACEDOWN_PROBLEM_MESSAGES,
  CPRED_GRAPPLE_PROBLEM_MESSAGES,
  CYBERWARE_INSTALL_REFUSAL_MESSAGES,
  MAX_DICE_PER_TERM,
  MAX_DIE_SIDES,
  MAX_ROLL_TERMS,
  GM_OVER_BUDGET,
  ROLE_GM,
  clampShopTier,
  creationShopRefusalText,
  screamsheetErrorText,
  shopTierRefusalText,
  TOKEN_MOVE_RATE_HZ,
  TOKEN_AIM_INTERVAL_MS,
  TOKEN_PATH_MAX_POINTS,
  isTradeActive,
  parseChatInput,
} from '@vtt/shared';
import { playRollAnimation, toAnimationNotation, cancelDiceAnimations } from './dice3d.js';
import { rollPresentation } from './roll-presentation.js';
import { receiveMapFx, releaseMapFx } from './map-fx.js';
import { shouldTypeOut, typeOutMessage } from './typewriter.js';
import { useConnectionStore } from './stores/connectionStore.js';
import { oldestMessageId, useChatStore } from './stores/chatStore.js';
import { useSceneStore } from './stores/sceneStore.js';
import { useAuthStore } from './stores/authStore.js';
import { noteMoveFrame, useTokenStore, type TokenViewerCtx } from './stores/tokenStore.js';
import { useCharacterStore } from './stores/characterStore.js';
import { useCreationStore } from './stores/creationStore.js';
import { useCompendiumStore } from './stores/compendiumStore.js';
import { usePortraitStore } from './stores/portraitStore.js';
import { useGameTimeStore } from './stores/gameTimeStore.js';
import { useAiStore } from './stores/aiStore.js';
import { useRulesStore } from './stores/rulesStore.js';
import { useKnowledgeStore } from './stores/knowledgeStore.js';
import { useTableStore } from './stores/tableStore.js';
import { useNetStore } from './stores/netStore.js';
import { useNetRunStore } from './stores/netRunStore.js';
import { useJournalStore } from './stores/journalStore.js';
import { useHandoutStore } from './stores/handoutStore.js';
import { useScreamsheetStore } from './stores/screamsheetStore.js';
import { useRelationStore } from './stores/relationStore.js';
import { useBotStore } from './stores/botStore.js';
import { useCreationRankStore } from './stores/creationRankStore.js';
import { gmAttentionNow, useGmAttentionStore } from './stores/gmAttentionStore.js';
import { newGmAttention } from './gm-attention.js';
import { useCombatStore } from './stores/combatStore.js';
import { useRulerStore } from './stores/rulerStore.js';
import { receiveMapPing, showLocalPing } from './map-ping.js';
import { COMBAT_PENDING_NOTE, receiveHiddenSpotted, receiveWalkHalt } from './walk-halt.js';
import { receiveTokenAim } from './map-aim.js';
import { useDrawingStore } from './stores/drawingStore.js';
import { useFogStore } from './stores/fogStore.js';
import { useNoteStore } from './stores/noteStore.js';
import { useWallStore } from './stores/wallStore.js';
import { useLightStore } from './stores/lightStore.js';
import { useExplorationStore } from './stores/explorationStore.js';
import { useCoverStore } from './stores/coverStore.js';
import { useSmokeStore } from './stores/smokeStore.js';
import { useTargetStore } from './stores/targetStore.js';
import { usePaceStore } from './stores/paceStore.js';
import { PLAYER_MOVE_PACE_NOTE, PLAYER_MOVE_STOP_NOTE } from './map/player-move.js';
import { useZoneStore } from './stores/zoneStore.js';
import { useSettingsStore } from './stores/settingsStore.js';
import { useSelectionStore } from './stores/selectionStore.js';
import { useHudStore } from './stores/hudStore.js';
import { useExchangeStore } from './stores/exchangeStore.js';
import { useOwnerAiStore } from './stores/ownerAiStore.js';
import { aiAccessSentence, aiUnavailableMessage } from './ai-status.js';
import { offerCoverChoice, offerShieldChoice } from './attack-targeting.js';
import { clearNotices, noteAck, notifyChoice, notifyInfo, notifyRefusal } from './notices.js';
import { useNoticeStore } from './stores/noticeStore.js';

let socket: Socket | undefined;
/** User the live socket authenticated as — a different one forces a reconnect. */
let connectedUserId: string | null = null;

/** Ruler updates per second while dragging — presentation, not state. */
const RULER_RATE_HZ = 20;
let lastRulerSentAt = 0;

/** Extra time after the dice settle before the chat card spoils the total. */
const CARD_REVEAL_DELAY_MS = 2500;
/**
 * #48 (T7b, 02.10): a live roll that waited behind the dice longer than this
 * shows as a card at once, without its animation. Rolls play one at a time
 * (~6 s each) and the whole socket waits behind them, so a busy table fell
 * minutes behind the server; this keeps it a few seconds behind at most.
 */
const CATCH_UP_LAG_MS = 3000;

/**
 * A player's character fresh from the creator, before the GM's „Przyjmij do
 * gry" (decyzja MG z 24.09): the sheet is for looking at, nothing on it works.
 */
export const CHARACTER_AWAITING_GM_TEXT =
  'Ta postać czeka na zatwierdzenie MG — do tego czasu karta jest tylko do podglądu.';

/**
 * Zlecenie MG z 21.10.2026: póki w kampanii trwa walka (od „Załóż starcie”),
 * gracz nie rozwija postaci, nie robi zakupów i nie prosi o wszczep.
 */
export const COMBAT_LOCKED_TEXT =
  'W trakcie walki nie rozwiniesz postaci ani nie zrobisz zakupów — poczekaj na koniec starcia.';

function chatErrorText(code: string): string {
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  switch (code) {
    case 'RATE_LIMITED':
      return RATE_LIMITED_TEXT;
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
    case 'SESSION_NOT_RUNNING':
      return 'Między sesjami czat służy do rozmowy — rzuty i tabele wrócą przy stole.';
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
    // 503: gateway żyje, ale model jest zajęty albo się ładuje — inna rada niż
    // martwy gateway (#21).
    case 'AI_UNAVAILABLE': {
      // AI właściciela (44d): „zajęte przez inną sesję” to nie „model się ładuje”.
      const access = aiAccessSentence(notice.detail);
      if (access) return `${notice.botName} nie odpowiada — ${access}`;
      return `${notice.botName} nie odpowiada — model jest zajęty albo jeszcze niegotowy; spróbuj za chwilę.`;
    }
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
      // Pas po odmowie (poprawka) niesie powód, którego serwer nie przyjął.
      return trace.refusal
        ? `🎲 ${trace.botName} pasuje po odmowie („${trace.optionLabel ?? '?'}” — ${trace.refusal}) · ${took}${where}${why}`
        : `🎲 ${trace.botName} pasuje · ${took}${where}${why}`;
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
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  switch (code) {
    case 'AI_UNAVAILABLE':
      return aiUnavailableMessage(
        'Model jest niedostępny — sprawdź, czy AI Gateway i llama-server działają.',
        detail,
      );
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
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
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
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
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

  // Keep every state broadcast in wire order, including resync and chat updates.
  // A roll pauses presentation, never the network or the authoritative server.
  const onPresented = <T>(
    event: string,
    listener: (payload: T) => void,
    isRoll: (payload: T) => boolean = () => false,
  ) =>
    socket!.on(event, (payload: T) =>
      rollPresentation.deliver(() => listener(payload), undefined, isRoll(payload)),
    );
  /**
   * „Czeka na MG” (25.09): a live push that opens a new matter for the GM
   * pops a card and rings. Only pushes are wrapped — the answers that load
   * state after a sync or F5 are history, not news, and must stay silent.
   */
  const watchGmAttention = <T>(apply: () => T): T => {
    const before = gmAttentionNow();
    const result = apply();
    const fresh = useChatStore.getState().synced ? newGmAttention(before, gmAttentionNow()) : [];
    if (fresh.length > 0) {
      useGmAttentionStore.getState().announce(fresh);
      notifyGame('request');
    }
    return result;
  };

  // #49: the first `state:sync` of a connection is taken whole (a restored
  // snapshot may hold older sheets); a later resync keeps newer revisions.
  let syncedSinceConnect = false;
  socket.on('connect', () => {
    syncedSinceConnect = false;
    setConnected();
  });
  onPresented('creation:rank', (rank: { draftId: string; statRankId: string }) => {
    const store = useCreationStore.getState();
    if (store.draftId === rank.draftId && store.draft) {
      useCreationStore.setState({
        draft: { ...store.draft, statRankId: rank.statRankId },
        rankApproved: true,
      });
    }
  });
  // Decyzja MG z 24.09: the GM let this draft throw some stats again.
  onPresented('creation:rerolled', (push: CreationRerolledPush) => {
    const store = useCreationStore.getState();
    if (store.draftId !== push.draftId || !store.draft) return;
    const stats = { ...store.draft.stats };
    const statRolls = { ...store.draft.statRolls };
    for (const id of push.statIds) {
      if (store.draft.method === 'edgerunner') delete stats[id as CpredStatId];
      delete statRolls[id as CpredStatId];
    }
    useCreationStore.setState({ draft: { ...store.draft, stats, statRolls } });
  });
  // 24.09: the GM's answer to my request, or a consent spent or taken back.
  onPresented('creation:permit-state', (state: CreationPermitState) => {
    const before = useCreationStore.getState().permit?.status;
    useCreationStore.getState().setPermit(state);
    // #57 (T8b): zgoda przychodziła po cichu — w „Postaciach” pojawiał się
    // kreator, a gracz patrzący na czat nie wiedział, że może zaczynać.
    if (before === 'requested' && state.status === 'granted') {
      notifyGame('handout');
      // Pytanie traci sens, gdy kreator jest otwarty — a otwarty inną drogą
      // (zakładka „Postacie”) zasłaniałby mu kroki (18.10, T3a).
      if (useCreationStore.getState().open) return;
      const noticeId = notifyChoice(
        'character',
        'Masz zgodę MG na postać — kreator czeka w zakładce „Postacie”.',
        [{ label: 'Otwórz kreator', run: () => void useCreationStore.getState().openCreator() }],
        { tone: 'info', title: 'Postać', silent: true },
      );
      const stop = useCreationStore.subscribe((creation) => {
        if (!creation.open) return;
        useNoticeStore.getState().dismiss(noticeId);
        stop();
      });
    }
  });
  onPresented('creation:permits-sync', (rows: CreationPermitRow[]) =>
    watchGmAttention(() => useCreationRankStore.getState().replacePermits(rows)),
  );
  // #68: gracz poprosił o portret, a pula graczy jest wyczerpana.
  socket.on('portrait:wanted-sync', (rows: PortraitWantedRow[]) =>
    watchGmAttention(() => usePortraitStore.getState().setWanted(rows)),
  );
  // 24.09: the GM changed the terms of my draft — read it again from the server.
  onPresented('creation:terms-changed', (push: { draftId: string }) => {
    const store = useCreationStore.getState();
    if (store.draftId === push.draftId && store.open) void store.reload();
  });
  // 24.09: the GM threw my draft away — the wizard has nothing left to show.
  onPresented('creation:discarded', (push: { draftId: string }) =>
    useCreationStore.getState().dropDiscarded(push.draftId),
  );
  // Naprawa 2b: the GM's rank list lives off the server's pushes.
  onPresented('creation:ranks-sync', (rows: CreationRankDraft[]) =>
    watchGmAttention(() => useCreationRankStore.getState().replace(rows)),
  );
  socket.on('disconnect', () => {
    // Serwer zdejmuje grot rozłączonego gniazda sam; po powrocie nie ma czego zdejmować.
    resetTokenAim();
    rollPresentation.clear();
    cancelDiceAnimations();
    setDisconnected();
    chat().setDesynced();
  });
  socket.on('connect_error', (error: Error) => {
    setDisconnected();
    // Sesja skończyła się, gdy gniazdo było rozłączone (uśpiony laptop, #11):
    // ponowne połączenie odbija się od `io.use`, a „rozłączono" wisiałoby
    // w nieskończoność. Ekran logowania mówi, co zrobić.
    if (error.message === 'UNAUTHORIZED') useAuthStore.getState().sessionEnded('expired');
  });
  // #11: serwer kończy sesję tego gniazda (wylogowanie w innej karcie, wygaśnięcie)
  // i zaraz je rozłączy — klient wraca na ekran logowania z notką.
  socket.on('auth:ended', (push: AuthEndedPush) =>
    useAuthStore.getState().sessionEnded(push.reason),
  );
  socket.on('server:hello', (hello: ServerHello) => setServerHello(hello));
  socket.on('music:state', (state: MusicState) => useMusicStore.getState().apply(state));

  const scenes = () => useSceneStore.getState();
  const tokens = () => useTokenStore.getState();
  const viewer = (): TokenViewerCtx => {
    const user = useAuthStore.getState().user;
    return { myUserId: user?.id ?? null, isGm: user?.role === ROLE_GM };
  };

  onPresented('state:sync', (payload: StateSyncPayload) => {
    // Another campaign, or the same one after a gap: old cards are history.
    useGmAttentionStore.getState().clear();
    chat().applySync(payload);
    // Gracz między sesjami (44c) nie słyszy stołu — ani podkładu MG z przygotowań.
    const seated =
      payload.campaign !== null && (payload.campaign.sessionStartedAt !== null || viewer().isGm);
    if (useMusicStore.getState().state?.campaignId !== payload.campaign?.id || !seated)
      useMusicStore.setState({ state: null, error: null, blocked: false });
    if (seated) void fetchMusic();
    scenes().applySync(payload);
    tokens().applySync(payload, viewer());
    useCharacterStore.getState().applySync(payload, !syncedSinceConnect);
    syncedSinceConnect = true;
    useBotStore.getState().applySync(payload);
    useCompendiumStore.getState().applySync(payload);
    useCombatStore.getState().applySync(payload);
    useFogStore.getState().applySync(payload);
    useDrawingStore.getState().applySync(payload);
    useNoteStore.getState().applySync(payload);
    useWallStore.getState().applySync(payload);
    useCoverStore.getState().applySync(payload);
    useSmokeStore.getState().applySync(payload);
    useTargetStore.getState().applySync(payload);
    useZoneStore.getState().applySync(payload);
    useLightStore.getState().applySync(payload);
    useExplorationStore.getState().applySync(payload);
    // Punkty dostępu i runy (26b) przychodzą już pocięte per widz — store
    // nie ma tu czego filtrować.
    useNetRunStore.getState().replacePoints(payload.accessPoints ?? []);
    useNetRunStore.getState().replaceRuns(payload.netRuns ?? []);
    if (payload.ai) useAiStore.getState().setStatus(payload.ai);
    useGameTimeStore.getState().applySync(payload);
    // The sync lands once the socket sits in the GM room. The answer is made
    // in the server's creation queue and rides the same connection as the
    // pushes, so they arrive in the order they were made. A campaign switch
    // syncs again.
    // Naprawa 3d: my own draft's header rides the same queue, for everyone —
    // after F5 the „Postacie" tab says „Wznów szkic…" instead of pretending
    // there is nothing to resume.
    void peekCreation().then((ack) =>
      useCreationStore.getState().setPeek(ack.ok ? (ack.data ?? null) : null),
    );
    // 20.10: PD, które MG przyznał pod nieobecność gracza. Serwer oddaje je
    // raz — kolejny sync (F5, druga karta) dostaje pustą listę.
    if (!viewer().isGm) {
      void fetchUnseenXpAwards().then((ack) => {
        if (ack.ok && ack.data) showXpAwards(ack.data);
      });
    }
    // 24.09: a player's next character starts with the GM's consent.
    void creationPermitState().then((ack) =>
      useCreationStore.getState().setPermit(ack.ok ? (ack.data ?? null) : null),
    );
    if (viewer().isGm) {
      void listCreationRanks().then((ack) =>
        useCreationRankStore.getState().replace(ack.ok ? (ack.data ?? []) : []),
      );
      void listCreationPermits().then((ack) =>
        useCreationRankStore.getState().replacePermits(ack.ok ? (ack.data ?? []) : []),
      );
      void emitSceneAck<PortraitWantedRow[]>('portrait:wanted', undefined).then((ack) =>
        usePortraitStore.getState().setWanted(ack.ok ? (ack.data ?? []) : []),
      );
    } else {
      useCreationRankStore.getState().replace([]);
      useCreationRankStore.getState().replacePermits([]);
    }
    // Etap 38c: otwarte handle żyją w pamięci serwera, nie w `state:sync` —
    // po przeładowaniu i po przełączeniu kampanii dociąga się je osobno.
    void listTrades().then((ack) =>
      useExchangeStore.getState().replaceTrades(ack.ok ? (ack.data?.trades ?? []) : []),
    );
    refreshMerchants();
  });

  // Etap 38c: każdy widz dostaje własny, przycięty widok handlu. Zaproszenie
  // do handlu dzwoni tym samym dźwiękiem, co przedmiot czekający na przyjęcie.
  onPresented('trade:update', (broadcast: TradeUpdateBroadcast) => {
    const trade = broadcast.trade;
    const known = useExchangeStore.getState().trades[trade.id];
    if (trade.status === 'invited' && !known && trade.sides[1].mine) notifyGame('inventory');
    useExchangeStore.getState().applyTrade(trade);
    // Ślad po handlu, który właśnie się skończył (etap 55b: z doku do kanału).
    if (!isTradeActive(trade))
      notifyInfo(tradeClosedText(trade), { title: 'Wymiana', topic: 'exchange' });
  });

  // Etap 46a: sklepy. Półkę dostaje tylko ten, kto ją ogląda (`merchant:view`
  // zapisuje widza), każdy w swoim przycięciu; dok — każdy swoją listę.
  onPresented('merchant:update', (broadcast: MerchantUpdateBroadcast) => {
    useExchangeStore.getState().applyShelf(broadcast.merchant);
  });
  onPresented('merchant:gone', (broadcast: MerchantGoneBroadcast) => {
    useExchangeStore.getState().dropShelf(broadcast.merchantId);
  });
  onPresented('merchant:shops', (broadcast: MerchantShopsBroadcast) => {
    useExchangeStore.getState().setShops(broadcast.merchants);
  });

  /**
   * MG przełączył aktywną kampanię (błąd #1 z sesji testów walki 08.08).
   *
   * Świat przyszedł już w `state:sync`, który leci tuż przed tym zdarzeniem —
   * tu zostaje to, czego tamten ładunek nie niesie: nazwa w górnym pasku
   * (mieszka w sklepie logowania, karmionym RESTem) i wskaźniki tego widza,
   * które pokazują na figury z poprzedniej kampanii.
   */
  /**
   * Sesja kampanii ruszyła albo się skończyła (etap 44c). Gracza przesadzonego
   * na stół albo z niego niesie już `state:sync` sprzed tego zdarzenia — tu
   * zostaje nagłówek, stan sesji w obu magazynach i jedno zdanie na czacie.
   */
  /** Stan sesji mówi pasek z własnym nagłówkiem — to nie „informacja” byle jaka. */
  const SESSION = { title: 'Sesja' };
  onPresented('session:changed', (push: SessionChangedPush) => {
    useAuthStore.setState({ activeCampaign: push.campaign });
    useChatStore.setState({ campaign: push.campaign });
    const isGm = useAuthStore.getState().user?.role === ROLE_GM;
    if (push.campaign.sessionStartedAt) {
      notifyInfo(
        isGm ? 'Sesja rozpoczęta — gracze są przy stole.' : 'MG rozpoczął sesję.',
        SESSION,
      );
    } else if (push.reason === 'gm') {
      notifyInfo(
        isGm
          ? 'Sesja zakończona — miejsce na sesję jest wolne, a Ty przygotowujesz dalej.'
          : 'MG zakończył sesję. Do zobaczenia przy następnej.',
        SESSION,
      );
    } else if (!isGm) {
      notifyInfo('Sesja zakończyła się sama — przy stole długo nic się nie działo.', SESSION);
    }
    // Podkład grany przy stole milknie u gracza, który od niego odchodzi.
    if (!isGm && !push.campaign.sessionStartedAt) {
      useMusicStore.setState({ state: null, error: null, blocked: false });
    }
    // Etap 46a: przy stole dok ma sklepy zdalne, między sesjami — oznaczone.
    refreshMerchants();
  });

  // Kopie kampanii (57b): zapis w tle skończony — lista w „Kopiach” do odświeżenia;
  // błąd kopii — pasek dla MG (gracze tego zdarzenia nie dostają).
  socket.on('archive:copies', () => {
    for (const listener of campaignCopyListeners) listener();
  });
  socket.on('archive:copy-failed', (push: CampaignCopyFailedPush) => {
    notifyRefusal('archive', push.text, { title: 'Kopie', tone: 'warn' });
  });

  onPresented('campaign:switch', (broadcast: CampaignSwitchBroadcast) => {
    useAuthStore.setState({ activeCampaign: broadcast.campaign });
    usePortraitStore.getState().reset();
    if (broadcast.campaign) void usePortraitStore.getState().load(true);
    void useAuthStore.getState().initialize();
    useSelectionStore.getState().resetFocus();
    useHudStore.getState().setActiveWeapon(null);
    useHudStore.getState().setForm(null);
    // Komunikaty starej kampanii nie dotyczą nowej.
    useNoticeStore.getState().reset();
    notifyInfo(
      broadcast.campaign
        ? `Otwarta kampania: ${broadcast.campaign.name}.`
        : 'Twoje konto nie należy już do żadnej kampanii.',
      { title: 'Kampania' },
    );
  });

  // Bot profiles are GM-only and targeted at the GM room — no seq, like whispers.
  const bots = () => useBotStore.getState();
  onPresented('bot:upsert', (broadcast: BotUpsertBroadcast) => bots().applyUpsert(broadcast.bot));
  onPresented('bot:delete', (broadcast: BotDeleteBroadcast) => bots().applyDelete(broadcast.botId));
  onPresented('bot:chunk', (broadcast: BotChunkBroadcast) =>
    bots().appendChunk(broadcast.botId, broadcast.text, broadcast.reset === true),
  );
  onPresented('bot:reply', (broadcast: BotReplyBroadcast) => bots().finishBotTurn(broadcast));
  onPresented('bot:error', (broadcast: BotErrorBroadcast) =>
    bots().failBotTurn(broadcast.botId, botErrorText(broadcast.code, broadcast.detail)),
  );

  // Session chat: turns in flight („Vex pisze…" + queue) are ephemeral state,
  // broadcast without a seq; failures arrive targeted as a local chat note.
  onPresented('bot:activity', (broadcast: BotActivityBroadcast) =>
    chat().setBotActivity(broadcast.entries ?? []),
  );
  onPresented('bot:trace', (broadcast: BotTraceBroadcast) => chat().addBotTrace(broadcast));
  onPresented('bot:action-trace', (broadcast: BotActionTraceBroadcast) =>
    chat().addNote(botActionTraceText(broadcast)),
  );
  onPresented('bot:notice', (broadcast: BotNoticeBroadcast) =>
    chat().addNote(botNoticeText(broadcast)),
  );

  // AI status/streams are targeted, carry no seq and are never persisted —
  // the gateway is an external service, not game state.
  const ai = () => useAiStore.getState();
  onPresented('ai:status', (broadcast: AiStatusBroadcast) => {
    ai().setStatus(broadcast.status);
    // Gateway wrócił — zdejmij zdanie, które właśnie przestało być prawdą.
    // Dziennik trzyma swój błąd u siebie (nie w statusie z serwera), więc bez
    // tego „Brak połączenia z AI Gateway" wisiał w panelu do następnej akcji MG.
    if (broadcast.status.available) useJournalStore.getState().clearAiError();
  });
  // Prośba MG o AI właściciela (44d) — poza `seq`, jak status AI. Panel AI
  // (`ai-access:owner`) od etapu 53 słyszy tylko gniazdo administratora.
  socket.on('ai-access:mine', (mine: AiAccessView) => useOwnerAiStore.getState().setMine(mine));
  onPresented('ai:queue', (broadcast: AiQueueBroadcast) =>
    ai().setQueuePosition(broadcast.requestId, broadcast.position),
  );
  onPresented('ai:chunk', (broadcast: AiChunkBroadcast) =>
    ai().appendChunk(broadcast.requestId, broadcast.kind, broadcast.text),
  );
  onPresented('ai:done', (broadcast: AiDoneBroadcast) =>
    ai().finishExchange(broadcast.requestId, broadcast.usage),
  );
  onPresented('ai:error', (broadcast: AiErrorBroadcast) =>
    ai().failExchange(broadcast.requestId, aiErrorText(broadcast.code, broadcast.detail)),
  );

  // Asystent zasad (etap 19a): fragmenty przychodzą PRZED odpowiedzią, więc MG
  // widzi źródła nawet wtedy, gdy generacja się urwie.
  const rules = () => useRulesStore.getState();
  onPresented('rules:sources', (broadcast: RulesSourcesBroadcast) =>
    rules().setSources(broadcast.requestId, broadcast.passages, broadcast.searchMs),
  );
  onPresented('rules:chunk', (broadcast: RulesChunkBroadcast) =>
    rules().appendChunk(broadcast.requestId, broadcast.kind, broadcast.text),
  );
  onPresented('rules:done', (broadcast: RulesDoneBroadcast) =>
    rules().finish(
      broadcast.requestId,
      broadcast.totalMs,
      broadcast.completionTokens,
      broadcast.retriedWithoutReasoning ?? false,
    ),
  );
  onPresented('rules:error', (broadcast: RulesErrorBroadcast) =>
    rules().fail(broadcast.requestId, rulesErrorText(broadcast.code, broadcast.detail)),
  );

  // Baza wiedzy kampanii (etap 19b) — emisje celowane w pokój MG, bez seq:
  // wpisy niosą sekrety fabuły i nie mają prawa dotrzeć do gracza.
  onPresented('knowledge:upsert', (broadcast: KnowledgeUpsertBroadcast) =>
    useKnowledgeStore.getState().upsert(broadcast.entry, broadcast.index),
  );
  onPresented('knowledge:delete', (broadcast: KnowledgeDeleteBroadcast) =>
    useKnowledgeStore.getState().remove(broadcast.id, broadcast.index),
  );

  // Tabele losowe (34) — jak wyżej, wyłącznie do pokoju MG: tabela jest
  // narzędziem MG, a jej wiersze zdradzają, co jeszcze może się wydarzyć.
  // Bez kolejki kości (#72, 10.10): lista tabel nie zdradza żadnego wyniku,
  // więc nie ma po co czekać, aż stół dokręci jawne losowanie.
  socket.on('table:upsert', (broadcast: RandomTableUpsertBroadcast) =>
    useTableStore.getState().upsert(broadcast.table),
  );
  socket.on('table:delete', (broadcast: RandomTableDeleteBroadcast) =>
    useTableStore.getState().remove(broadcast.id),
  );

  // Biblioteka Architektur Sieciowych (26a) — ta sama zasada co wyżej: PT,
  // Czarne LOD-y i notatki MG lecą wyłącznie do pokoju MG.
  onPresented('net:architectures', (payload: NetArchitectureListPayload) =>
    useNetStore.getState().replaceAll(payload.architectures),
  );
  onPresented('netpoint:sync', (broadcast: NetAccessPointSyncBroadcast) =>
    useNetRunStore.getState().replacePoints(broadcast.points),
  );
  onPresented('netrun:sync', (broadcast: NetRunSyncBroadcast) =>
    useNetRunStore.getState().replaceRuns(broadcast.runs),
  );
  onPresented('net:deleted', (broadcast: NetArchitectureDeleteBroadcast) =>
    useNetStore.getState().remove(broadcast.id),
  );

  // Dziennik kampanii (19c) i jego wyjście do stołu (24b). Serwer wysyła MG
  // i graczowi **dwa różne kształty** pod tą samą nazwą zdarzenia — gniazdo
  // należy do jednego konta, więc rozstrzyga o tym rola, a nie zgadywanie po
  // polach payloadu.
  onPresented(
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
  onPresented('journal:delete', (broadcast: JournalDeleteBroadcast) => {
    const store = useJournalStore.getState();
    if (useAuthStore.getState().user?.role === ROLE_GM) store.remove(broadcast.id, broadcast.index);
    else store.removeShared(broadcast.id);
  });
  onPresented('journal:pending', (push: JournalPendingPush) =>
    useJournalStore.getState().setPending(push.pendingLines),
  );
  onPresented('journal:progress', (broadcast: JournalProgressBroadcast) =>
    useJournalStore.getState().setProgress(broadcast),
  );
  onPresented('journal:draft', (broadcast: JournalDraftBroadcast) =>
    useJournalStore.getState().setDraft(broadcast.draft, broadcast.proposals, broadcast.batches),
  );
  onPresented('journal:error', (broadcast: JournalErrorBroadcast) =>
    useJournalStore
      .getState()
      .fail(journalErrorText(broadcast.code, broadcast.detail), broadcast.code),
  );
  // Handouty (etap 24a) — jedyna lista MG z wyjściem do gracza. Serwer wysyła
  // je celowanym emitem do kont z udostępnieniem, więc klient nic nie odsiewa.
  onPresented('handout:upsert', (broadcast: HandoutUpsertBroadcast) =>
    useHandoutStore.getState().upsert(broadcast.handout),
  );
  onPresented('handout:delete', (broadcast: HandoutDeleteBroadcast) =>
    useHandoutStore.getState().remove(broadcast.id),
  );
  // „Masz to w ręku" — okno wyskakuje samo, ale tylko świeżo dopisanym odbiorcom.
  onPresented('handout:open', (broadcast: HandoutOpenBroadcast) => {
    const store = useHandoutStore.getState();
    store.upsert(broadcast.handout);
    store.openHandout(broadcast.handout.id);
    if (chat().synced && useAuthStore.getState().user?.role !== ROLE_GM) notifyGame('handout');
  });

  // Generator screamsheetów (24c) — artykuł przychodzi osobnym zdarzeniem,
  // bo model pisze go kilkanaście sekund. Nic tu nie ląduje w bazie: szkic
  // czeka w formularzu MG.
  onPresented('screamsheet:draft', (broadcast: ScreamsheetDraftBroadcast) =>
    useScreamsheetStore
      .getState()
      .complete(broadcast.requestId, broadcast.draft, broadcast.totalMs),
  );
  onPresented('screamsheet:error', (broadcast: ScreamsheetErrorBroadcast) =>
    useScreamsheetStore
      .getState()
      .fail(broadcast.requestId, screamsheetErrorText(broadcast.code, broadcast.detail)),
  );

  onPresented('relation:upsert', (broadcast: RelationUpsertBroadcast) =>
    useRelationStore.getState().upsert(broadcast.relation),
  );
  onPresented('relation:delete', (broadcast: RelationDeleteBroadcast) =>
    useRelationStore.getState().remove(broadcast.botId, broadcast.characterId),
  );

  // The compendium is shared data: room broadcasts with a seq, like chat.
  //
  // Rozgłoszenie, które **rysuje** `seq` na serwerze, musi go u klienta
  // **skonsumować** — inaczej następna wiadomość czatu wygląda jak luka i cały
  // stół idzie w zbędny `state:request` (znalezione 05.09 przy etapie 37,
  // dotyczyło czterech zdarzeń naraz: obu kompendium, sklepu i zegara).
  onPresented('compendium:upsert', (broadcast: CompendiumUpsertBroadcast) => {
    if (chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    useCompendiumStore.getState().applyUpsert(broadcast.entry);
  });
  onPresented('compendium:delete', (broadcast: CompendiumDeleteBroadcast) => {
    if (chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    useCompendiumStore.getState().applyDelete(broadcast.id);
  });
  // The GM's shop dial (stage 25c): a room broadcast, because a catalogue that
  // opened up only after a reload is a catalogue the table argues about.
  onPresented('shop:tier', (broadcast: ShopTierBroadcast) => {
    if (chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    useCompendiumStore.getState().applyShopTier(broadcast.tier);
  });
  // „Zakupy z katalogu” (etap 46a) — ta sama droga co próg sklepu: „Kup”
  // znika graczowi w chwili, gdy MG przestawi dźwignię.
  onPresented('campaign:catalog-shopping', (broadcast: CatalogShoppingBroadcast) => {
    if (chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    useCompendiumStore.getState().applyCatalogShopping(broadcast.mode);
  });
  // One entry moved by the GM for this campaign (naprawa 3b) — same reasoning.
  onPresented('shop:entry-tier', (broadcast: ShopEntryTierBroadcast) => {
    if (chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    useCompendiumStore.getState().applyShopEntryTier(broadcast.entryId, broadcast.tier);
  });
  // Kadr portretu na mapie (12.09). Rozgłoszenie do całego stołu, bo kadr jest
  // cechą obrazka: poprawione ujęcie ma trafić na każdą figurę, która ten plik
  // nosi, u wszystkich naraz.
  onPresented('portrait:crop', (broadcast: PortraitCropBroadcast) => {
    if (chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    applyPortraitBroadcast(broadcast);
  });
  // MG przeniósł portret między pulą graczy a portretami NPC (23.09).
  onPresented('portrait:visibility', (broadcast: PortraitCropBroadcast) => {
    if (chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    applyPortraitBroadcast(broadcast);
  });
  // Zegar świata (etap 37): rozgłoszenie, nie resynchronizacja — data w pasku
  // ma zmienić się u wszystkich w chwili, w której MG kliknął „+1 dzień".
  onPresented('time:set', (broadcast: GameTimeBroadcast) => {
    if (chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    useGameTimeStore.getState().applyTime(broadcast.time);
  });

  // Character emissions are always targeted (owner + GM) and carry no seq.
  onPresented('character:upsert', (broadcast: CharacterUpsertBroadcast) => {
    const known = useCharacterStore.getState().characters[broadcast.character.id];
    watchGmAttention(() => useCharacterStore.getState().applyUpsert(broadcast.character));
    // #57: „Przyjmij do gry” też szło po cichu — zmianę widać było tylko po
    // figurze na mapie. Notka idzie do właściciela karty, nie do MG.
    const me = useAuthStore.getState().user;
    if (
      known &&
      !known.playReady &&
      broadcast.character.playReady &&
      me &&
      me.role !== ROLE_GM &&
      broadcast.character.ownerId === me.id
    ) {
      const id = broadcast.character.id;
      notifyChoice(
        'character',
        `Postać „${broadcast.character.name}” przyjęta do gry — karta jest odblokowana, a figura stoi na mapie.`,
        [{ label: 'Otwórz kartę', run: () => useCharacterStore.getState().openSheet(id) }],
        { tone: 'info', title: 'Postać', silent: true },
      );
      notifyGame('handout');
    }
  });
  onPresented('character:delete', (broadcast: CharacterDeleteBroadcast) => {
    useCharacterStore.getState().applyDelete(broadcast.characterId);
  });
  onPresented(
    'chat:message',
    (broadcast: ChatMessageBroadcast) => {
      const fresh =
        chat().synced &&
        !chat().items.some(
          (item) => item.type === 'message' && item.message.id === broadcast.message.id,
        ) &&
        !chat().held.some((message) => message.id === broadcast.message.id);
      // Losowanie z tabeli (34) tumbla **pierwszą** kością łańcucha: patrzy się
      // na nią tak samo, jak na każdy inny rzut, a podrzuty zostają liczbami na
      // karcie — dwie animacje z jednego kliknięcia nikomu nic nie mówią.
      const roll = broadcast.message.roll ?? broadcast.message.rolltable?.steps[0]?.roll;
      // Live rolls (never history/resync) replay the server's results in 3D;
      // their chat card is held back so the table reads the dice first. A roll
      // that already waited too long behind other dice catches up instead (#48).
      const hold =
        fresh &&
        roll !== undefined &&
        toAnimationNotation(roll) !== null &&
        rollPresentation.lagMs() <= CATCH_UP_LAG_MS;
      if (watchGmAttention(() => chat().applyMessage(broadcast, hold))) {
        socket?.emit('state:request');
        return;
      }
      const listener = useAuthStore.getState().user;
      const notification = fresh && listener ? chatNotification(broadcast.message, listener) : null;
      if (notification) notifyGame(notification);
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
        const presentation = playRollAnimation(roll).then(async (played) => {
          // The pause is for reading the dice — cut short when the next roll is
          // already waiting for the table (#48).
          if (played)
            await Promise.race([
              new Promise((resolve) => window.setTimeout(resolve, CARD_REVEAL_DELAY_MS)),
              rollPresentation.untilRollWaiting(),
            ]);
        });
        rollPresentation.hold(presentation, reveal);
        return;
      }
      // No dice to wait for — an ordinary message, or a table with the animation
      // switched off. The card is already on screen, so the map may fire at once.
      releaseMapFx(broadcast.message.id);
    },
    (broadcast) => {
      const roll = broadcast.message.roll ?? broadcast.message.rolltable?.steps[0]?.roll;
      return roll !== undefined && toAnimationNotation(roll) !== null;
    },
  );
  // A message that changed after the fact (stage 15: the GM took an applied
  // damage entry back) — replaced in place, never appended again.
  // A dodge (or a smart round's second go) rides one along as `dice` (17.10):
  // the table watches it fall first, and only then the card changes its verdict.
  onPresented(
    'chat:update',
    (broadcast: ChatMessageBroadcast) => {
      const apply = () => {
        if (chat().updateMessage(broadcast)) socket?.emit('state:request');
      };
      const dice = broadcast.dice;
      if (
        !dice ||
        !chat().synced ||
        toAnimationNotation(dice) === null ||
        rollPresentation.lagMs() > CATCH_UP_LAG_MS
      ) {
        apply();
        return;
      }
      const presentation = playRollAnimation(dice).then(async (played) => {
        if (played)
          await Promise.race([
            new Promise((resolve) => window.setTimeout(resolve, CARD_REVEAL_DELAY_MS)),
            rollPresentation.untilRollWaiting(),
          ]);
      });
      rollPresentation.hold(presentation, apply);
    },
    (broadcast) => broadcast.dice !== undefined && toAnimationNotation(broadcast.dice) !== null,
  );
  // Etap 60c: MG zmienił kolor gracza — pokazane karty przemalowują się w miejscu.
  onPresented('chat:recolor', (push: ChatRecolorPush) => chat().recolorAuthor(push));
  onPresented('presence:update', (broadcast: PresenceBroadcast) => {
    if (chat().applyPresence(broadcast)) socket?.emit('state:request');
  });

  onPresented('scene:update', (broadcast: SceneUpdateBroadcast) => {
    if (chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    scenes().applyScene(broadcast.scene);
  });
  onPresented('scene:activate', (broadcast: SceneActivateBroadcast) => {
    if (chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    // Who follows the activation is decided by the store (`followActivation`);
    // a scene switch means a new token set — refetch the filtered state.
    const isGm = useAuthStore.getState().user?.role === ROLE_GM;
    if (scenes().followActivation(broadcast.scene, isGm)) socket?.emit('state:request');
  });
  onPresented('scene:list', (broadcast: SceneListBroadcast) =>
    scenes().setScenes(broadcast.scenes),
  );
  onPresented('scene:view', (broadcast: SceneViewBroadcast) => {
    scenes().setScene(broadcast.scene);
    socket?.emit('state:request');
  });

  // Token events for other scenes can reach us (campaign-wide broadcasts
  // while the GM previews another scene) — filter by the viewed scene.
  const viewingScene = (sceneId: string) => useSceneStore.getState().scene?.id === sceneId;

  onPresented('token:upsert', (broadcast: TokenUpsertBroadcast) => {
    if (chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    if (viewingScene(broadcast.token.sceneId)) {
      tokens().upsert(broadcast.token, viewer(), broadcast.moved === true);
    }
  });
  onPresented('token:delete', (broadcast: TokenDeleteBroadcast) => {
    if (chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    if (viewingScene(broadcast.sceneId)) {
      tokens().remove(broadcast.tokenId);
      useTargetStore.getState().forget(broadcast.tokenId);
    }
  });
  // The tracker arrives as a whole: the public view campaign-wide (with a
  // seq), the GM's full view targeted right after it (no seq, like whispers).
  onPresented('combat:update', (broadcast: CombatUpdateBroadcast) => {
    if (broadcast.seq !== undefined && chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    if (viewingScene(broadcast.sceneId)) {
      const user = useAuthStore.getState().user;
      if (
        chat().synced &&
        user &&
        startsOwnTurn(useCombatStore.getState().combat, broadcast.combat, user.id)
      )
        notifyGame('turn');
      useCombatStore.getState().setCombat(broadcast.combat);
    }
  });

  onPresented('token:move', (broadcast: TokenMoveBroadcast) => {
    // Intermediate frames carry no seq on purpose — never gap-check them.
    if (broadcast.seq !== undefined && chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    if (viewingScene(broadcast.sceneId)) {
      noteMoveFrame(broadcast.tokenId, broadcast.final);
      tokens().applyMove(broadcast.tokenId, broadcast.x, broadcast.y, broadcast.facing);
    }
  });

  // Pula Eksploracji (etap 45) — prywatna, bez seq: stan chwili, nie historia.
  onPresented('token:pace', (broadcast: TokenPaceBroadcast) =>
    usePaceStore.getState().receive(broadcast),
  );

  // Rulers are ephemeral like intermediate drags: no seq, never resynced.
  // Map effects (stage 27i) — never sequenced and never replayed on a resync,
  // exactly like the ruler below: an effect is something that happened, not
  // something that is.
  onPresented('fx:play', (broadcast: MapFxBroadcast) => receiveMapFx(broadcast));
  onPresented('ruler:update', (broadcast: RulerBroadcast) => {
    if (!viewingScene(broadcast.sceneId)) return;
    useRulerStore.getState().receive(broadcast);
  });

  onPresented('ruler:clear', (broadcast: RulerClearBroadcast) => {
    useRulerStore.getState().drop(broadcast.userId);
  });

  // Ping (etap 35) — efemeryczny jak linijka wyżej: bez `seq`, bez zapisu, bez
  // powtórki. Idzie prosto do mapy przez `map-ping.js`, tą samą drogą co efekty
  // walki: to nie jest stan, z którego cokolwiek się renderuje.
  onPresented('map:ping', (broadcast: MapPingBroadcast) => receiveMapPing(broadcast));
  // Grot celowania (03.10) — ulotny jak ping: bez `seq`, bez zapisu, bez powtórki.
  onPresented('token:aim', (broadcast: TokenAimBroadcast) => receiveTokenAim(broadcast));
  // Etap 56: drużyna zobaczyła wroga — marsz staje (tylko u prowadzącego).
  onPresented('token:halt', (broadcast: TokenHaltBroadcast) => receiveWalkHalt(broadcast));
  // Etap 58a: udany rzut na Percepcję przy ukrytej rzeczy (tylko u właściciela).
  onPresented('hidden:spotted', (spotted: HiddenSpottedBroadcast) => receiveHiddenSpotted(spotted));
  // Etap 56: wróg zauważony w trwającej walce dołączył sam (tylko MG).
  // Wydatek MG poza budżetem tury czeka na potwierdzenie (19.10.2026).
  onPresented('combat:overspend-ask', (ask: CombatOverspendAsk) => {
    notifyChoice(
      'overspend',
      `${ask.actorName}: ${ask.reason} Wykonać mimo to?`,
      [
        {
          label: 'Wykonaj poza budżetem',
          title: 'Przekroczenie zostanie policzone w trackerze i oznaczone na czacie',
          run: () => confirmOverspend(ask.askId),
        },
        { label: 'Anuluj', run: () => undefined },
      ],
      { title: 'Poza budżetem tury' },
    );
  });
  // 20.10: MG przyznał PD postaci tego gracza, a gracz jest przy stole.
  // Potwierdzenie od razu, przed kolejką prezentacji: serwer uznaje komunikat
  // za pokazany dopiero po nim, a bez niego odda go po następnym `state:sync`.
  socket.on('character:xp-awarded', (push: CharacterXpAwardedPush, ack?: () => void) => {
    ack?.();
    rollPresentation.deliver(() => showXpAwards(push));
  });
  onPresented('combat:joined', (broadcast: CombatJoinedBroadcast) => {
    if (!viewingScene(broadcast.sceneId)) return;
    const names = broadcast.tokenIds
      .map((id) => tokens().tokens[id]?.name)
      .filter((name): name is string => Boolean(name));
    if (names.length === 0) return;
    notifyInfo(`Do walki dołącza: ${names.join(', ')} — inicjatywę rzucił serwer.`, {
      title: 'Drużyna widzi wroga',
    });
  });
  // Trwały cel (etap 50c) — już przefiltrowany do tych, którzy widzą obie figury.
  onPresented('token:target', (broadcast: TokenTargetBroadcast) => {
    if (viewingScene(broadcast.sceneId)) useTargetStore.getState().apply(broadcast);
  });

  // Fog of war (stage 17). The mask is campaign-wide state on the active
  // scene, so it is sequenced like tokens; a GM previewing another map gets
  // targeted, seq-less copies which must not be gap-checked.
  const fog = () => useFogStore.getState();
  onPresented('fog:paint', (broadcast: FogPaintBroadcast) => {
    if (broadcast.seq !== undefined && chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    if (viewingScene(broadcast.sceneId)) {
      fog().append(broadcast.sceneId, broadcast.shape, broadcast.override === true);
    }
  });
  onPresented('fog:sync', (broadcast: FogSyncBroadcast) => {
    if (broadcast.seq !== undefined && chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    if (viewingScene(broadcast.fog.sceneId)) fog().setFog(broadcast.fog);
  });

  // Repainting the fog can both add and remove tokens for one viewer, so the
  // server sends the whole filtered list instead of a stream of deltas.
  onPresented('token:sync', (broadcast: TokenSyncBroadcast) => {
    if (viewingScene(broadcast.sceneId)) tokens().applyTokens(broadcast.tokens, viewer());
  });

  // Map drawings (stage 17b). Public ones are campaign-wide state and carry a
  // seq; the GM layer arrives targeted at the GM room, so — like whispers and
  // note pins — those must never be gap-checked.
  const drawings = () => useDrawingStore.getState();
  onPresented('drawing:upsert', (broadcast: DrawingUpsertBroadcast) => {
    if (broadcast.seq !== undefined && chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    if (viewingScene(broadcast.drawing.sceneId)) drawings().upsert(broadcast.drawing);
  });
  onPresented('drawing:delete', (broadcast: DrawingDeleteBroadcast) => {
    if (broadcast.seq !== undefined && chat().applySeq(broadcast.seq)) {
      socket?.emit('state:request');
      return;
    }
    if (viewingScene(broadcast.sceneId)) drawings().remove(broadcast.drawingId);
  });
  onPresented('drawing:clear', (broadcast: DrawingClearBroadcast) => {
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
  onPresented('wall:sync', (broadcast: WallSyncBroadcast) => {
    if (viewingScene(broadcast.sceneId)) {
      useWallStore.getState().setWalls(broadcast.sceneId, broadcast.walls);
    }
  });
  onPresented('vision:sync', (broadcast: VisionSyncBroadcast) => {
    if (!viewingScene(broadcast.sceneId)) return;
    // One event, two stores: the server computes the field of view and the light
    // inside it in a single pass, and splitting the payload here would only mean
    // two chances for the map to draw a mask that belongs to another position.
    useWallStore.getState().setVision(broadcast.polygons, broadcast.figurePolygons);
    useLightStore.getState().setVisionLight(broadcast.light ?? null, broadcast.glows ?? []);
  });
  // Lamp rows are GM-only and targeted at the GM room — no seq, like walls.
  onPresented('light:sync', (broadcast: LightSyncBroadcast) => {
    if (viewingScene(broadcast.sceneId)) {
      useLightStore.getState().setLights(broadcast.sceneId, broadcast.lights);
    }
  });
  // Cover is the one scene object every viewer receives (stage 16c), so unlike
  // `wall:sync` this one goes to the room and carries a seq on the active
  // scene — a missed edit would leave somebody planning a route through a car
  // that is no longer there.
  onPresented('cover:sync', (broadcast: CoverSyncBroadcast & { seq?: number }) => {
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
  onPresented('smoke:sync', (broadcast: SmokeSyncBroadcast & { seq?: number }) => {
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
  onPresented('zone:sync', (broadcast: DefenseZoneSyncBroadcast) => {
    if (viewingScene(broadcast.sceneId)) {
      useZoneStore.getState().setZones(broadcast.sceneId, broadcast.zones);
    }
  });
  onPresented('opening:sync', (broadcast: OpeningSyncBroadcast) => {
    if (viewingScene(broadcast.sceneId)) useWallStore.getState().setOpenings(broadcast.openings);
  });
  // What the route planner walks round although the player sees past it (stage
  // 42a) — per socket like the openings, and never the walls themselves.
  onPresented('blocker:sync', (broadcast: BlockerSyncBroadcast) => {
    if (viewingScene(broadcast.sceneId)) useWallStore.getState().setBlockers(broadcast.segments);
  });
  // The party's memory of the map (stage 18c). One broadcast for everybody —
  // exploration is shared, so unlike `vision:sync` it is not composed per
  // socket — and no seq, because a missed one is corrected by the next
  // discovery rather than by a resync.
  onPresented('explore:sync', (broadcast: ExplorationSyncBroadcast) => {
    if (viewingScene(broadcast.sceneId)) {
      useExplorationStore.getState().setExploration(broadcast.mask);
    }
  });

  // GM layer notes are targeted at the GM room — no seq, like whispers.
  onPresented('note:upsert', (broadcast: NoteUpsertBroadcast) => {
    if (viewingScene(broadcast.note.sceneId)) useNoteStore.getState().upsert(broadcast.note);
  });
  onPresented('note:delete', (broadcast: NoteDeleteBroadcast) => {
    useNoteStore.getState().remove(broadcast.noteId);
  });

  return socket;
}

export function disconnectSocket(): void {
  rollPresentation.clear();
  cancelDiceAnimations();
  useOwnerAiStore.getState().reset();
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
  // #73 — `/tab` jedzie przez `chat:send`, ale jego odmowy (FORBIDDEN, brak
  // tabeli) mówią o tabelach, nie o `/jako`.
  const tableCommand = parsed.kind === 'rolltable' || parsed.kind === 'invalid-rolltable';
  const errorText = (code: string): string =>
    tableCommand && (code === 'FORBIDDEN' || code.startsWith('TABLE_'))
      ? randomTableErrorText(code)
      : chatErrorText(code);
  socket?.emit('chat:send', payload, (ack: SocketAck) => {
    if (!ack.ok) useChatStore.getState().addNote(errorText(ack.error));
  });
}

/** Polish hints for the sheet-roll rejections the server can return. */
function rollAckErrorText(code: string): string {
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
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
      return 'Figura bez karty rzuca na obrażenia i Umiejętnościami wpisanymi w jej profil.';
    // #27 — obrażenia za atak rzuca figura, która strzelała, nie ta z tą samą bronią.
    case 'NOT_THE_SHOOTER':
      return 'Obrażenia za ten atak rzuca ten, kto go wykonał.';
    // #56 — jedno trafienie, jeden rzut obrażeń (03.10).
    case 'DAMAGE_ALREADY_ROLLED':
      return 'Obrażenia za to trafienie już rzucono — ponownie dopiero po „Cofnij” MG.';
    // Test Przeżywalności (17.10): raz, na początku tury, i tylko Śmiertelnie Ranny.
    case 'NOT_MORTALLY_WOUNDED':
      return 'Test Przeżywalności rzuca tylko Śmiertelnie Ranny.';
    case 'DEATH_SAVE_NOT_DUE':
      return 'W walce Test Przeżywalności rzucasz raz, na początku swojej tury.';
    // Unik przed obrażeniami (03.10, decyzja MG po T8b).
    case 'AWAITING_EVASION':
      return 'Obrażenia czekają, aż cel zdecyduje o uniku („Unik” albo „Bez uniku” na karcie ataku).';
    // Stage 30b — the three refusals „Leczenie" can come back with.
    case 'INJURY_NOT_FOUND':
      return 'Ta figura nie ma już tej rany.';
    case 'NO_TREATMENT':
      return 'Ta rana nie ma drogi leczenia, którą VTT umie rozstrzygnąć („Nd.").';
    case 'NO_SURGERY':
      return 'Chirurgia jest dostępna tylko Medykom z punktami w tej Specjalizacji.';
    // Stage 15 — the two the quick fix adds.
    case 'SELF_TREATMENT':
      return 'Nie można leczyć samego siebie — załatać można (s. 223).';
    case 'INJURY_ALREADY_PATCHED':
      return 'Ta rana jest już załatana — jej efekt milczy do końca dnia.';
    // Etap 32 — wezwanie do Testu, które w międzyczasie przestało czekać.
    case 'CALL_NOT_FOUND':
      return 'Nie znalazłem tego wezwania na czacie.';
    case 'CALL_CLOSED':
      return 'To wezwanie jest już rozliczone albo odwołane.';
    case 'CALL_NOT_YOURS':
      return 'To wezwanie należy do kogoś innego.';
    // 19.10 — Test gracza pada wyłącznie na wezwanie, z progiem od MG.
    case 'CHECK_NEEDS_GM_DV':
      return 'Test rzucasz dopiero, gdy MG ustali jego Poziom Trudności — kliknij Umiejętność na karcie, żeby go poprosić.';
    // Ustabilizowanie od 03.09 wymaga długości ramienia — to czynność przy
    // pacjencie, a nie na odległość.
    case 'STABILIZE_OUT_OF_REACH':
      return 'Za daleko — Ustabilizowanie wymaga zasięgu ramienia (2 m).';
    case 'STABILIZE_NOT_ON_SCENE':
      return 'Ta postać nie ma figury na scenie pacjenta — nie ma jak go dosięgnąć.';
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
  /** Wezwanie MG, na które ten rzut odpowiada (etap 32). */
  callMessageId?: number,
): void {
  const payload: CharacterRollPayload<CpredRollRequest> = {
    ...(characterId ? { characterId } : { attackerTokenId }),
    request,
    visibility,
    ...(callMessageId !== undefined ? { callMessageId } : {}),
    ...(gesture ? { gesture } : {}),
  };
  socket?.emit('character:roll', payload, (ack: SocketAck<{ messageId: number }>) => {
    noteAck('check', ack, rollAckErrorText);
  });
}

/**
 * „Wezwij do Testu" (etap 32) — MG prosi jedną postać o rzut na nietypowe
 * wydarzenie. Zwraca id karty wezwania, która staje na czacie z przyciskiem.
 */
export const callCheck = (payload: CheckCallPayload<CpredRollRequest>) =>
  emitSceneAck<{ messageId: number }>('check:call', payload);

/** „Odwołaj" na karcie wezwania — działa, dopóki nikt nie potrząsnął kubkiem. */
export const cancelCheck = (messageId: number) =>
  emitSceneAck('check:cancel', { messageId } satisfies CheckCancelPayload);

/**
 * „Poproś MG o Test" (etap 40) — gracz wskazuje z własnej karty Umiejętność
 * albo Cechę i dopisuje zdanie „po co". Ani progu, ani widoczności tu nie ma:
 * jedno i drugie należy do MG i dochodzi dopiero przy zgodzie.
 */
export const requestCheck = (payload: CheckRequestPayload<CpredRollRequest>) =>
  emitSceneAck<{ messageId: number }>('check:request', payload);

/** „Wycofaj" na własnej karcie prośby — dopóki MG nie odpowiedział. */
export const cancelCheckRequest = (messageId: number) =>
  emitSceneAck('check:request-cancel', { messageId } satisfies CheckRequestCancelPayload);

/** Klik w szczebel drabinki albo „Odmów" na karcie prośby — MG only. */
export const resolveCheckRequest = (payload: CheckRequestResolvePayload) =>
  emitSceneAck<{ callMessageId?: number }>('check:request-resolve', payload);

/* ------------------------------------------------------------------ *
 * Przedmioty między kartami (etap 38b)
 * ------------------------------------------------------------------ */

/** Z kim mogę teraz coś wymienić — jedna lista okna „Wymiana” (etap 46a). */
export const fetchExchangeCounterparts = (payload: ExchangeCounterpartsPayload) =>
  emitSceneAck<ExchangeCounterpartsResult>('exchange:counterparts', payload);

/** „Oddaj" — na kartę z właścicielem wchodzi jako propozycja do przyjęcia. */
export const giveInventory = (payload: InventoryGivePayload) =>
  emitSceneAck<InventoryGiveResult>('inventory:give', payload);

/** „Zabierz" — łup z figury, która leży albo nie żyje. Bez pytania nikogo. */
export const takeInventory = (payload: InventoryTakePayload) =>
  emitSceneAck<{ messageId: number }>('inventory:take', payload);

/* ----- Pojemniki (etap 46b) ----- */

/** MG: skrzynia, bagażnik albo schowek w punkcie mapy — karta z figurą. */
export const createContainer = (payload: ContainerCreatePayload) =>
  emitSceneAck<ContainerCreateResult>('container:create', payload);

/** MG: zamek, PT, Umiejętności, „Wydaj klucz”, „Pozwól spróbować znowu”. */
export const configContainer = (payload: ContainerConfigPayload) =>
  emitSceneAck('container:config', payload);

/** „Otwórz” / „Otwórz zamek” — kliknięcie, klucz albo wezwanie do Testu zamka. */
export const openContainer = (payload: ContainerOpenPayload) =>
  emitSceneAck<ContainerOpenResult>('container:open', payload);

/** „→” — z mojej karty do otwartego pojemnika w zasięgu ręki. */
export const putIntoContainer = (payload: ContainerPutPayload) =>
  emitSceneAck<{ messageId: number }>('container:put', payload);

/** Wiersz z karty na mapę — nowy „Stos” albo dołożenie do stosu na tym polu. */
export const dropInventory = (payload: InventoryDropPayload) =>
  emitSceneAck<InventoryDropResult>('inventory:drop', payload);

/** „Przyjmij" / „Odrzuć" / „Wycofaj" na karcie przekazania. */
export const respondInventory = (messageId: number, accept: boolean) =>
  emitSceneAck('inventory:respond', { messageId, accept } satisfies InventoryRespondPayload);

/* ----- Handel (etap 38c) ----- */

export const inviteTrade = (payload: TradeInvitePayload) =>
  emitSceneAck<{ trade: TradeView }>('trade:invite', payload);

export const respondTrade = (tradeId: string, accept: boolean) =>
  emitSceneAck('trade:respond', { tradeId, accept });

export const offerTrade = (payload: TradeOfferPayload) => emitSceneAck('trade:offer', payload);

export const acceptTrade = (payload: TradeAcceptPayload) => emitSceneAck('trade:accept', payload);

export const cancelTrade = (tradeId: string) => emitSceneAck('trade:cancel', { tradeId });

export const listTrades = () => emitSceneAck<TradeListResult>('trade:list', undefined);

/* ----- Sklepy (etap 46a) ----- */

export const listMerchants = () => emitSceneAck<MerchantListResult>('merchant:list', undefined);

/** Półka dla tego widza — serwer zapisuje go jako oglądającego (`merchant:update`). */
export const viewMerchant = (merchantId: string) =>
  emitSceneAck<MerchantViewResult>('merchant:view', { merchantId });

/** „Zapłać” — koszyk i pole sprzedaży w jednej transakcji, z sumą pokazaną w oknie. */
export const dealMerchant = (payload: MerchantDealPayload) =>
  emitSceneAck<MerchantDealResult>('merchant:deal', payload);

/** MG: karta NPC-a staje się handlarzem, zmienia ustawienia albo przestaje nim być (`null`). */
export const configMerchant = (payload: MerchantConfigPayload) =>
  emitSceneAck<MerchantConfigResult>('merchant:config', payload);

/** MG: „∞”, „ukryty” i cena przy jednym wierszu towaru; `overlay: null` zdejmuje nakładkę. */
export const setMerchantRow = (payload: MerchantRowPayload) =>
  emitSceneAck('merchant:row', payload);

/**
 * Lista sklepów dla doku i ekranu „Między sesjami” oraz ponowne obejrzenie
 * półek, które klient trzyma — serwer zapomina oglądających przy rozłączeniu,
 * więc po `state:sync` bez tego okno zostałoby z półką, która się nie odświeża.
 */
export function refreshMerchants(): void {
  void listMerchants().then((ack) =>
    useExchangeStore.getState().setShops(ack.ok ? (ack.data?.merchants ?? []) : []),
  );
  for (const merchantId of Object.keys(useExchangeStore.getState().shelves)) {
    void viewMerchant(merchantId).then((ack) => {
      if (ack.ok && ack.data) useExchangeStore.getState().applyShelf(ack.data.merchant);
      else useExchangeStore.getState().dropShelf(merchantId);
    });
  }
}

/** Polskie komunikaty odmowy sklepu; kody wyceny mówią zdaniami z `shared`. */
export function merchantErrorText(code: string): string {
  if (code === 'COMBAT_LOCKED') return COMBAT_LOCKED_TEXT;
  if (code in CPRED_MERCHANT_PROBLEM_TEXTS) {
    return CPRED_MERCHANT_PROBLEM_TEXTS[code as keyof typeof CPRED_MERCHANT_PROBLEM_TEXTS];
  }
  switch (code) {
    case 'MERCHANT_NOT_FOUND':
      return 'Tego sklepu tu nie ma.';
    case 'MERCHANT_CLOSED':
      return 'Sklep jest zamknięty — handlarz teraz nie obsługuje.';
    case 'QUOTE_CHANGED':
      return 'Ceny albo towar zmieniły się, zanim zapłaciłeś — sprawdź nową sumę i zapłać jeszcze raz.';
    case 'OUT_OF_REACH':
      return 'Za daleko — do handlarza trzeba podejść na wyciągnięcie ręki.';
    case 'SESSION_NOT_RUNNING':
      return 'Ten sklep działa tylko w trakcie sesji.';
    case 'NOT_NPC':
      return 'Sklepem może być wyłącznie karta NPC-a.';
    default:
      return inventoryErrorText(code);
  }
}

/** Polskie komunikaty odmowy przy handlu — wspólne kody z 38b idą przez `inventoryErrorText`. */
/** Ślad po zakończonym handlu: „Wymienione: A ⇄ B” albo „Handel przerwany — kto (dlaczego)”. */
export function tradeClosedText(trade: TradeView): string {
  if (trade.status === 'done') return `Wymienione: ${trade.sides[0].name} ⇄ ${trade.sides[1].name}`;
  const by = trade.closedBy ? ` — ${trade.closedBy}` : '';
  const why =
    trade.status === 'cancelled' && trade.notice ? ` (${tradeErrorText(trade.notice)})` : '';
  return `Handel przerwany${by}${why}`;
}

export function tradeErrorText(code: string): string {
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  switch (code) {
    case 'TRADE_NOT_FOUND':
      return 'Tego handlu już nie ma.';
    case 'TRADE_NOT_OPEN':
      return 'Ten handel nie jest otwarty — czeka na przyjęcie zaproszenia albo już się skończył.';
    case 'TRADE_CHANGED':
      return 'Pole wymiany zmieniło się przed twoją zgodą — sprawdź je jeszcze raz.';
    case 'TRADE_EMPTY':
      return 'Oba pola wymiany są puste — nie ma na co się zgadzać.';
    case 'TRADE_BUSY':
      return 'Wymiana właśnie się wykonuje.';
    case 'TRADE_FAILED':
      return 'Wymiana nie zapisała się — nic się nie zmieniło. Spróbujcie jeszcze raz.';
    case 'CHARACTER_BUSY':
      return 'Któraś z tych kart już handluje — najpierw trzeba skończyć tamten handel.';
    case 'SAME_OPERATOR':
      return 'Obie karty prowadzisz ty — do tego służy przekazanie w oknie „Wymiana".';
    case 'OFFER_STALE':
      return 'Coś z pola wymiany zmieniło się na karcie (zużyte, zdjęte, wystrzelane) — popraw ofertę i zgódźcie się jeszcze raz.';
    case 'OWNER_CHANGED':
      return 'Karta zmieniła właściciela w trakcie handlu — handel przerwany.';
    case 'NOT_YOURS':
      return 'To nie twoja strona handlu.';
    default:
      return inventoryErrorText(code);
  }
}

/** Polskie komunikaty odmowy przy przenoszeniu przedmiotów (etap 38b). */
export function inventoryErrorText(code: string): string {
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  switch (code) {
    case 'CHARACTER_NOT_FOUND':
      return 'Nie ma takiej karty w tej kampanii.';
    case 'TOKEN_NOT_FOUND':
      return 'Nie ma takiej figury na scenie.';
    case 'NO_SHEET':
      return 'Ta figura nie ma karty, więc nie ma czego przeszukać.';
    case 'NOT_YOURS':
      return 'Z karty innego gracza przenosi wyłącznie MG.';
    case 'STILL_STANDING':
      return 'Ta figura stoi na nogach — przeszukać da się dopiero leżącą albo martwą.';
    case 'NOT_ON_SCENE':
      return 'Twoja figura nie stoi na tej scenie.';
    case 'OUT_OF_REACH':
      return 'Za daleko — przedmiot podaje się na wyciągnięcie ręki.';
    case 'ITEM_NOT_FOUND':
      return 'Tej pozycji już nie ma na karcie źródłowej.';
    case 'BAD_QTY':
      return 'Zła ilość — nie da się przenieść więcej, niż jest.';
    case 'TOO_MANY_ROWS':
      return 'Karta odbiorcy nie ma już miejsca na kolejne pozycje.';
    case 'NO_ITEMS':
      return 'Nie wskazano, co przenieść.';
    case 'NOT_ENOUGH_EDDIES':
      return 'Na karcie źródłowej nie ma tylu eurodolców.';
    case 'OFFER_NOT_FOUND':
      return 'Nie znalazłem tej propozycji na czacie.';
    case 'OFFER_CLOSED':
      return 'Ta propozycja jest już zamknięta.';
    case 'OFFER_NOT_YOURS':
      return 'To nie jest twoja decyzja.';
    // Etap 46b — pojemniki i stos.
    case 'NOT_A_CONTAINER':
      return 'Ta figura nie jest pojemnikiem.';
    case 'CONTAINER_LOCKED':
      return 'Pojemnik jest zamknięty — najpierw go otwórz.';
    case 'LOCK_TRIED':
      return 'Ta postać już próbowała otworzyć ten zamek i się nie udało. Spróbować znowu pozwala MG.';
    case 'LOCK_SKILL':
      return 'Tego zamka nie otworzysz tą Umiejętnością.';
    case 'TOO_MANY_PILES':
      return 'Na tej scenie leży już za dużo stosów i pojemników — pozbierajcie coś najpierw.';
    case 'BAD_REQUEST':
      return 'Tego nie da się tak zrobić.';
    default:
      return `Błąd przenoszenia: ${code}`;
  }
}

/** Polskie komunikaty odmowy przy wystawianiu wezwania do Testu (etap 32). */
/**
 * Odmowy tabel losowych (etap 34). `INVALID_TABLE:` niesie gotowe zdanie
 * z `validateRandomTable` — walidator i formularz mówią to samo tym samym
 * zdaniem, więc klient go **nie tłumaczy**, tylko pokazuje.
 */
export function randomTableErrorText(code: string): string {
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  if (code.startsWith('INVALID_TABLE:')) {
    const message = code.slice('INVALID_TABLE:'.length).trim();
    return message.length > 0 ? message : 'Tabela ma błąd — sprawdź zakresy wierszy.';
  }
  switch (code) {
    case 'TABLE_NOT_FOUND':
      return 'Nie ma takiej tabeli w tej kampanii.';
    case 'SUBTABLE_NOT_FOUND':
      return 'Wskazana tabela podrzutu już nie istnieje — odśwież zakładkę.';
    case 'TABLE_EMPTY':
      return 'Ta tabela nie ma wierszy, z których dałoby się losować.';
    case 'MESSAGE_NOT_FOUND':
      return 'Nie znalazłem tego losowania na czacie.';
    case 'ALREADY_SHOWN':
      return 'Ten wynik jest już pokazany stołowi.';
    case 'TABLE_MISSING_NAME':
      return 'Podaj nazwę tabeli: /tab <nazwa>.';
    case 'FORBIDDEN':
      return 'Tabele losowe są narzędziem MG.';
    default:
      return `Błąd tabeli: ${code}`;
  }
}

/** Polskie zdania odmów prośby o Test (etap 40). */
export function checkRequestErrorText(code: string): string {
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  switch (code) {
    case 'CHARACTER_NOT_FOUND':
      return 'Nie ma takiej postaci w tej kampanii.';
    case 'CHARACTER_NOT_YOURS':
      return 'O Test prosi się własną kartą — cudzej nie ruszasz.';
    case 'REQUEST_NOT_FOUND':
      return 'Nie znalazłem tej prośby na czacie.';
    case 'REQUEST_CLOSED':
      return 'Ta prośba jest już rozstrzygnięta albo wycofana.';
    case 'REQUEST_NOT_YOURS':
      return 'Wycofać prośbę może tylko ten, kto ją wysłał.';
    case 'REQUEST_LIMIT':
      return 'Masz już trzy prośby czekające na MG — poczekaj albo wycofaj jedną.';
    case 'UNKNOWN_SKILL':
      return 'Nieznana umiejętność — odśwież stronę.';
    case 'UNKNOWN_STAT':
      return 'Nieznana cecha — odśwież stronę.';
    case 'FORBIDDEN':
      return 'O prośbach rozstrzyga MG.';
    case 'BAD_REQUEST':
      return 'Niepełna prośba — wybierz Umiejętność albo Cechę.';
    default:
      return `Błąd prośby o Test: ${code}`;
  }
}

export function checkCallErrorText(code: string): string {
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  switch (code) {
    case 'CHARACTER_NOT_FOUND':
      return 'Nie ma takiej postaci w tej kampanii.';
    case 'UNKNOWN_SKILL':
      return 'Nieznana umiejętność — odśwież stronę.';
    case 'UNKNOWN_STAT':
      return 'Nieznana cecha — odśwież stronę.';
    case 'CALL_NOT_FOUND':
      return 'Nie znalazłem tego wezwania na czacie.';
    case 'CALL_CLOSED':
      return 'To wezwanie jest już rozliczone albo odwołane.';
    case 'FORBIDDEN':
      return 'Wezwania do Testu wystawia MG.';
    case 'BAD_REQUEST':
      return 'Niepełne wezwanie — sprawdź próg i wybraną Umiejętność.';
    default:
      return `Błąd wezwania: ${code}`;
  }
}

/** Polish hints for the damage rejections (GM-only actions, stage 15). */
function damageAckErrorText(code: string): string {
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  switch (code) {
    case 'MESSAGE_NOT_FOUND':
      return 'Nie znalazłem tego rzutu na czacie.';
    case 'NOT_A_DAMAGE_ROLL':
      return 'Ten wpis nie jest rzutem na obrażenia.';
    case 'TOKEN_NOT_FOUND':
      return 'Nie ma takiego tokenu na scenie.';
    case 'TOKEN_HAS_NO_HP':
      return 'Ten token nie ma PW — powiąż go z kartą albo ustaw PW w menu tokenu.';
    // Rana nadana figurze bez karty potrzebuje profilu, bo w nim mieszka (31.08).
    case 'TOKEN_HAS_NO_PROFILE':
      return 'Ta figura nie ma profilu bojowego — nie ma gdzie zapisać rany. Uzupełnij profil w „Edytuj…”.';
    case 'ALREADY_UNDONE':
      return 'To rozliczenie zostało już cofnięte.';
    // #26 — jedna karta obrażeń trafia jeden cel raz; „Cofnij” zdejmuje blokadę.
    case 'DAMAGE_ALREADY_APPLIED':
      return 'Te obrażenia już trafiły ten cel — żeby rozliczyć je od nowa, najpierw „Cofnij”.';
    case 'FORBIDDEN':
      return 'Obrażenia rozlicza MG.';
    default:
      return `Błąd rozliczenia obrażeń: ${code}`;
  }
}

/** GM applies a rolled damage total to a token (server recomputes everything). */
export function applyDamage(payload: DamageApplyPayload): void {
  socket?.emit('damage:apply', payload, (ack: SocketAck<{ messageId: number }>) => {
    noteAck('attack', ack, damageAckErrorText);
  });
}

/** GM takes back an applied damage entry (HP, armor and injury are restored). */
export function undoDamage(messageId: number): void {
  const payload: DamageUndoPayload = { messageId };
  socket?.emit('damage:undo', payload, (ack: SocketAck) => {
    noteAck('attack', ack, damageAckErrorText);
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
    notifyRefusal(
      'character',
      ack.error === 'INJURY_ALREADY_THERE'
        ? 'Ta figura już ma tę ranę.'
        : ack.error === 'UNKNOWN_INJURY'
          ? 'Nie znalazłem tej rany w kompendium.'
          : damageAckErrorText(ack.error),
    );
  });
}

/**
 * MG nakłada albo zdejmuje efekt czasowy na Cesze (etap 39).
 *
 * Jedna funkcja na obie czynności, bo jedno jest zdarzenie: żądanie z `effectId`
 * zdejmuje, żądanie z `stat` nakłada. Odmowa idzie notatką na czat, jak przy
 * nadaniu rany wyżej — MG rzadko patrzy wtedy na kartę, a zawsze na feed.
 */
export function setStatEffect(payload: CharacterStatEffectPayload): void {
  socket?.emit('character:stat-effect', payload, (ack: SocketAck) => {
    noteAck('character', ack, statEffectAckErrorText);
  });
}

function statEffectAckErrorText(code: string | undefined): string {
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  switch (code) {
    case 'EFFECT_NOT_FOUND':
      return 'Tego efektu nie ma już na karcie.';
    case 'UNKNOWN_STAT':
      return 'Nie znam takiej Cechy.';
    case 'BAD_VALUE':
      return `Zmiana Cechy musi być liczbą różną od zera, najwyżej o ${CPRED_STAT_EFFECT_VALUE_MAX}.`;
    case 'BAD_DURATION':
      return 'Czas trwania musi być dodatni i krótszy niż doba.';
    case 'TOO_MANY_EFFECTS':
      return 'Ta karta niesie już komplet efektów czasowych.';
    case 'CHARACTER_NOT_FOUND':
      return 'Nie znalazłem tej karty w kampanii.';
    case 'FORBIDDEN':
      return 'Efekty czasowe nakłada wyłącznie MG.';
    case 'OFFLINE':
      return 'Brak połączenia z serwerem.';
    default:
      return 'Nie udało się zmienić efektów czasowych.';
  }
}

/**
 * Odpowiedź na atak albo przeładowanie w kanale komunikatów (etap 55): zgoda
 * zamyka odmowy tematu `attack`, odmowa staje na pasku. Odmowę z budżetu tury
 * serwer dodatkowo wpisuje na czat kartą „Odmowa” (`logRefusedAction` — zapis
 * dla MG); pasek mówi ją zdaniem z `CPRED_TURN_PROBLEM_MESSAGES`, nie kodem
 * (do 17.10 notka mówiła „Błąd ataku: ROF_EXCEEDED”).
 */
function noteAttackAck(ack: SocketAck<unknown>): void {
  noteAck('attack', ack, (code) =>
    code in CPRED_TURN_PROBLEM_MESSAGES
      ? CPRED_TURN_PROBLEM_MESSAGES[code as keyof typeof CPRED_TURN_PROBLEM_MESSAGES]
      : attackAckErrorText(code),
  );
}

/** Polish hints for attack rejections (stage 16). */
function attackAckErrorText(code: string): string {
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  const known = CPRED_ATTACK_PROBLEM_MESSAGES[code as keyof typeof CPRED_ATTACK_PROBLEM_MESSAGES];
  if (known) return known;
  switch (code) {
    case 'TOKEN_NOT_FOUND':
      return 'Nie ma takiego celu na scenie.';
    case 'NOT_A_TARGET':
      return 'To pojemnik, a nie cel — w skrzynię się nie strzela.';
    case 'ATTACKER_NOT_ON_SCENE':
      return 'Ta postać nie ma tokenu na tej scenie.';
    case 'ATTACKER_NOT_LINKED':
      return 'Ten token nie należy do tej postaci.';
    case 'ATTACKER_ON_OTHER_SCENE':
      return 'Atakujący stoi na innej scenie.';
    case 'CHARACTER_NOT_FOUND':
      return 'Nie możesz atakować tą postacią.';
    case 'NOT_THE_TARGET':
      return 'O uniku decyduje tylko cel ataku albo MG.';
    case 'ALREADY_EVADED':
      return 'Ten atak został już zakwestionowany unikiem.';
    case 'DAMAGE_ALREADY_ROLLED':
      return 'Obrażenia za to trafienie już padły — na unik jest za późno.';
    case 'NOT_AN_ATTACK':
      return 'Ten wpis nie jest atakiem.';
    case 'WEAPON_HAS_NO_MAGAZINE':
      return 'Ta broń nie ma magazynka do przeładowania.';
    // Etap 41. Ręce są dwie, a karabin zajmuje obie — zdanie mówi, co zrobić,
    // bo obie drogi są jednym kliknięciem i różnią się wyłącznie ceną.
    case 'HANDS_FULL':
      return 'Nie masz wolnej ręki — schowaj (Akcja) albo upuść to, co trzymasz.';
    // Stage 31 — the four ways an attachment can be refused. The engine's own
    // messages are reused so the greyed-out button and the refusal say the same
    // sentence, which is the umowa the ammunition codes already follow.
    case 'UNKNOWN_ATTACHMENT':
      return CPRED_ATTACHMENT_PROBLEM_MESSAGES.UNKNOWN_ATTACHMENT;
    case 'ATTACHMENT_DOES_NOT_FIT':
      return CPRED_ATTACHMENT_PROBLEM_MESSAGES.ATTACHMENT_DOES_NOT_FIT;
    case 'ATTACHMENT_NO_SLOTS':
      return CPRED_ATTACHMENT_PROBLEM_MESSAGES.ATTACHMENT_NO_SLOTS;
    case 'ATTACHMENT_ALREADY_FITTED':
      return CPRED_ATTACHMENT_PROBLEM_MESSAGES.ATTACHMENT_ALREADY_FITTED;
    case 'ATTACHMENT_GROUP_TAKEN':
      return CPRED_ATTACHMENT_PROBLEM_MESSAGES.ATTACHMENT_GROUP_TAKEN;
    // Etap 48c: dodatek jest towarem — montuje się go z Wyposażenia.
    case 'ATTACHMENT_NOT_IN_GEAR':
      return 'Tego dodatku nie masz w Wyposażeniu — kup go, weź od kogoś albo poproś MG.';
    case 'UNKNOWN_AMMO':
      return 'Nie ma takiego naboju w kompendium.';
    // Etap 46c: przeładowanie i rzut biorą z zapasu w ekwipunku.
    case 'NO_AMMO':
      return 'Nie masz amunicji do tej broni — kup ją, weź od kogoś albo zmień rodzaj naboju.';
    case 'AMMO_MISMATCH':
      return 'Ten nabój nie pasuje do tej broni.';
    case 'TOKEN_HAS_NO_PROFILE':
      return 'Ten token nie ma profilu bojowego — uzupełnij go w „Edytuj…” w menu tokenu.';
    // Trzy powody, dla których Unik nie dochodzi do skutku. Wszystkie jadą
    // `attack:evade`, czyli tędy — a nie przez ogólne `ackErrorText`, gdzie
    // dwa z tych zdań już stały. Bez nich kubek wracał z „Błąd ataku:
    // BACKUP_CANNOT_DODGE" (znalezione przy oględzinach 30c).
    case 'BACKUP_CANNOT_DODGE':
      return 'Funkcjonariusze Wsparcia nie mogą Unikać pocisków.';
    case 'SHIELD_CANNOT_DODGE':
      return CPRED_GRAPPLE_PROBLEM_MESSAGES.SHIELD_CANNOT_DODGE;
    case 'DODGE_BLOCKED':
      return 'W tym stanie nie można Unikać.';
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
    noteAttackAck(ack);
    if (!ack.ok) return;
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
  /** Punkty Szczęścia z licznika kubka; 0 = bez Szczęścia. */
  luckSpent = 0,
): void {
  const payload: AttackEvadePayload = {
    messageId,
    ...(characterId ? { characterId } : {}),
    ...(tokenId ? { tokenId } : {}),
    ...(luckSpent > 0 ? { luckSpent } : {}),
    ...(gesture ? { gesture } : {}),
  };
  socket?.emit('attack:evade', payload, (ack: SocketAck<{ total: number; hit: boolean }>) => {
    noteAttackAck(ack);
  });
}

/**
 * „Bez uniku" (03.10, decyzja MG po T8b) — the defender lets the hit land, and
 * the damage roll stops waiting for them. `tokenId` names the row of a blast.
 */
export function declineEvasion(payload: AttackNoEvadePayload): void {
  socket?.emit('attack:no-evade', payload, (ack: SocketAck<void>) => {
    noteAttackAck(ack);
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
    noteAttackAck(ack);
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
    noteAck('character', ack, () => 'Nie udało się zdjąć efektu.');
  });
}

/** Clears one cloud of smoke, or every cloud on the scene (stage 16h). */
export function clearSmoke(sceneId: string, smokeId?: number): void {
  const payload: SmokeClearPayload = { sceneId, ...(smokeId !== undefined ? { smokeId } : {}) };
  socket?.emit('smoke:clear', payload, (ack: SocketAck<{ cleared: number }>) => {
    noteAck('scene', ack, () => 'Nie udało się rozwiać dymu.');
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
  /** Refill the weapon bolted onto this row instead of the row (stage 31). */
  attachmentId?: string,
): void {
  const payload: WeaponReloadPayload = {
    ...(characterId ? { characterId } : { attackerTokenId }),
    weaponRowId,
    ...(ammoId !== undefined ? { ammoId } : {}),
    ...(attachmentId ? { attachmentId } : {}),
  };
  socket?.emit('weapon:reload', payload, (ack: SocketAck<{ ammo: number }>) => {
    noteAttackAck(ack);
  });
}

/**
 * Clears a jammed poor-quality weapon (s. 244) — an Action, and no Test.
 *
 * Its own event rather than a second job for `weapon:reload`, because the two
 * are different Actions: working the slide on a jam does not put a magazine in,
 * and letting one click do both would hand the table two Actions for one.
 */
export function clearWeaponJam(characterId: string, weaponRowId: string): void {
  const payload: WeaponClearJamPayload = { characterId, weaponRowId };
  socket?.emit('weapon:clear-jam', payload, (ack: SocketAck<{ jammed: boolean }>) => {
    noteAttackAck(ack);
  });
}

/**
 * Co postać bierze do rąk, a co z nich odkłada (etap 41).
 *
 * Trzy gesty jednym zdarzeniem, bo różnią się wyłącznie ceną, którą przypisał im
 * podręcznik (s. 168): dobycie i upuszczenie są darmowe, schowanie kosztuje
 * Akcję. Cenę księguje serwer — klient prosi, nie rozlicza.
 */
export function drawWeapon(
  characterId: string,
  weaponRowId: string,
  mode: 'draw' | 'holster' | 'drop' = 'draw',
): void {
  const payload: WeaponDrawPayload = { characterId, weaponRowId, mode };
  socket?.emit('weapon:draw', payload, (ack: SocketAck<{ hands: string[] }>) => {
    noteAttackAck(ack);
  });
}

/**
 * Rzut oka na cudzą figurę (etap 41) — „co on ma na sobie".
 *
 * Zapytanie na żądanie, bo rzut oka składa się z katalogu po stronie serwera.
 * Odmowa jest **cicha**: pytanie pada przy najechaniu kursorem, a figura, której
 * nie widać, ma nie zostawiać po sobie zdania na czacie za każdym ruchem myszy.
 */
export async function lookAtToken(tokenId: string): Promise<SightingLookResult | null> {
  return new Promise((resolve) => {
    const payload: SightingLookPayload = { tokenId };
    if (!socket) {
      resolve(null);
      return;
    }
    socket.emit('sighting:look', payload, (ack: SocketAck<SightingLookResult>) => {
      resolve(ack.ok ? (ack.data ?? null) : null);
    });
  });
}

/**
 * Bolts an attachment onto a weapon, or takes it off (stage 31, s. 342).
 *
 * Its own event rather than a sheet patch, because what a mount does to the row
 * is not what the client wrote: the magazine follows a table in the catalogue,
 * a second copy is refused, and the rounds in a shrinking magazine have to be
 * clamped. All three are the server's answers — see `weapon:attachment`.
 */
export function setWeaponAttachment(
  characterId: string,
  weaponRowId: string,
  attachmentId: string,
  action: 'mount' | 'unmount',
): void {
  const payload: WeaponAttachmentPayload = { characterId, weaponRowId, attachmentId, action };
  socket?.emit('weapon:attachment', payload, (ack: SocketAck<WeaponAttachmentResult>) => {
    noteAttackAck(ack);
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

/**
 * Ping mapy (etap 35): kółko z imieniem w tym miejscu, u każdego, kto ogląda
 * tę scenę. Bez potwierdzenia i bez czekania — jak `ruler:update`, bo to jest
 * gest, a nie zmiana stanu. Kółko u siebie rysuje wołający (serwer pomija
 * nadawcę), więc dokładamy je tutaj od razu.
 */
export function sendPing(sceneId: string, x: number, y: number, pull: boolean): void {
  const payload: MapPingPayload = { sceneId, x, y, ...(pull ? { pull: true } : {}) };
  socket?.emit('map:ping', payload);
  // Własne kółko od razu: serwer rozsyła ping przez `socket.to`, więc do
  // nadawcy nie wraca. Bez tej linijki pingujący jako jedyny nic nie widzi.
  showLocalPing(sceneId, x, y, useAuthStore.getState().user?.name ?? 'Ja');
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
  /** Barriers and gates only (stage 42b); the server keeps it nowhere else. */
  armor?: number,
  hidesFigures?: boolean,
  concealPenalty?: number,
) =>
  emitSceneAck<WallView[]>('wall:create', {
    sceneId,
    points,
    kind,
    playerToggle,
    ...(armor !== undefined ? { armor } : {}),
    hidesFigures,
    concealPenalty,
  });

export const updateWall = (wallId: number, patch: WallUpdatePayload['patch']) =>
  emitSceneAck<WallView>('wall:update', { wallId, patch });

export const deleteWall = (wallId: number) => emitSceneAck('wall:delete', { wallId });

export const clearWalls = (sceneId: string) => emitSceneAck('wall:clear', { sceneId });

export const toggleOpening = (wallId: number, open?: boolean) =>
  emitSceneAck<WallView>('opening:toggle', { wallId, open });

/** Wytrych po „zamknięte na klucz” (58c) — klucz otwiera, inaczej wezwanie do Testu zamka. */
export const pickOpening = (payload: OpeningPickPayload) =>
  emitSceneAck<OpeningPickResult>('opening:pick', payload);

/** Zamek otworu u MG (58c): PT, Umiejętności, klucz, nowe próby. */
export const configOpeningLock = (payload: OpeningLockConfigPayload) =>
  emitSceneAck('opening:lock-config', payload);

/* Cover (stage 16c). GM-only to edit; visible to everybody unless the GM hid
   it (21.10.2026), when only the GM gets the row. */

export const createCover = (
  sceneId: string,
  hpMax: number,
  hidden: boolean,
  rect: { x: number; y: number; width: number; height: number },
) => emitSceneAck<CoverView>('cover:create', { sceneId, hpMax, hidden, ...rect });

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
  options: { name?: string; hidden?: boolean; spotDv?: number; disarmDv?: number } = {},
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

/** Gracz rozbraja zauważoną strefę (58b) — serwer wystawia wezwanie do Testu. */
export const disarmZone = (zoneId: number, characterId: string) =>
  emitSceneAck<DefenseZoneDisarmResult>('zone:disarm', { zoneId, characterId });

/** Polskie odmowy `zone:disarm` (58b). */
export function zoneDisarmErrorText(code: string): string {
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  switch (code) {
    case 'ZONE_NOT_FOUND':
      return 'Tej strefy już nie ma — odśwież stronę.';
    case 'NOT_ON_SCENE':
      return 'Twoja figura nie stoi na tej scenie.';
    case 'OUT_OF_REACH':
      return 'Za daleko — podejdź do krawędzi strefy (na jedną kratkę).';
    case 'ZONE_NO_DISARM':
      return 'Tego systemu nie rozbroisz ręką — wyłącza go węzeł w Sieci albo zniszczenie.';
    case 'DISARM_IN_COMBAT':
      return 'Rozbrajanie trwa minuty — w trakcie walki nie ma na nie czasu.';
    case 'DISARM_TRIED':
      return 'Ta postać już próbowała i się nie udało. Spróbować znowu pozwala MG.';
    case 'CHARACTER_NOT_FOUND':
      return 'Nie ma takiej karty w tej kampanii.';
    default:
      return `Nie udało się: ${code}`;
  }
}

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

/** Music has its own revision; refresh it after each table synchronization. */
export async function fetchMusic() {
  const ack = await emitMusicAck<MusicState>('music:request', undefined);
  if (ack.ok && ack.data) useMusicStore.getState().apply(ack.data);
}

function emitMusicAck<T = undefined>(event: string, payload: unknown): Promise<SocketAck<T>> {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve({ ok: false, error: 'NOT_CONNECTED' });
      return;
    }
    socket.timeout(8000).emit(event, payload, (error: Error | null, ack: SocketAck<T>) => {
      resolve(error ? { ok: false, error: 'TIMEOUT' } : ack);
    });
  });
}
export const controlMusic = (command: MusicCommand) => emitMusicAck('music:control', command);

/** Tabele losowe (34). Wołane przy wejściu w zakładkę, nie w `state:sync`. */
export function fetchRandomTables(): Promise<RandomTableListPayload | null> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve(null);
      return;
    }
    socket.emit('table:list', (ack: SocketAck<RandomTableListPayload>) => {
      if (ack.ok && ack.data) useTableStore.getState().replaceAll(ack.data.tables);
      resolve(ack.ok ? (ack.data ?? null) : null);
    });
  });
}

/**
 * Zapis i usunięcie tabeli potwierdzają się od razu (#72, decyzja MG z 10.10):
 * do 10.10 szły przez `emitSceneAck`, więc formularz MG stał otwarty, dopóki
 * kości wcześniejszego jawnego losowania się nie dokręciły, i drugi klik
 * „Dodaj tabelę” trafiał w próżnię. Samo losowanie zostaje w kolejce kości.
 */
function emitTableAck<T = undefined>(event: string, payload: unknown): Promise<SocketAck<T>> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve({ ok: false, error: 'NOT_CONNECTED' });
      return;
    }
    socket.emit(event, payload, (ack: SocketAck<T>) => {
      if (!ack.ok && ack.error === 'RATE_LIMITED') noteRateLimited();
      resolve(ack);
    });
  });
}

export const saveRandomTable = (payload: RandomTableUpsertPayload) =>
  emitTableAck<RandomTableView>('table:upsert', payload);

export const deleteRandomTable = (id: string) => emitTableAck('table:delete', { id });

/**
 * Losowanie z tabeli. **Nie dotyka `rollStore`** — i to jest cała treść tego
 * etapu po stronie klienta: rzut wzięty do ręki w oknie postaci i czekające
 * wezwanie do Testu mają przeżyć dowolną liczbę kliknięć „Losuj".
 */
export const rollRandomTableNow = (payload: RandomTableRollPayload) =>
  emitSceneAck('table:roll', payload);

/** „Pokaż stołowi" — dokłada publiczny wiersz z tym samym wynikiem. */
export const showRandomTableRoll = (messageId: number) => emitSceneAck('table:show', { messageId });

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

/* ------------------------------------------------------------------ */
/* Kopie zapasowe i pliki wymiany (etap 33)                            */
/* ------------------------------------------------------------------ */

/**
 * Pobranie pliku wymiany.
 *
 * Zwykły `<a href>`, a nie `fetch` + `Blob`: przeglądarka sama przeczyta
 * `Content-Disposition` i zaproponuje nazwę z ogonkami, a zrzut kampanii
 * z czatem nie musi przechodzić przez pamięć karty. Adres jest względny —
 * klient i serwer są tego samego pochodzenia (proxy Vite w dev, Caddy w prod),
 * dokładnie jak `/uploads/...`.
 */
/** Zakładka „Kopie” słucha, kiedy serwer odłożył (albo zrotował) kopię kampanii (57b). */
const campaignCopyListeners = new Set<() => void>();

export function subscribeCampaignCopies(listener: () => void): () => void {
  campaignCopyListeners.add(listener);
  return () => campaignCopyListeners.delete(listener);
}

export function downloadArchive(path: string): void {
  const link = document.createElement('a');
  link.href = path;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
}

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
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
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
      return aiUnavailableMessage(
        'Brak połączenia z AI Gateway — streszczanie wymaga modelu.',
        detail,
      );
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
 * Zdanie dla MG, gdy „Graj turę" wróciło odmową gniazda (#35, 29.09) — kod
 * w nawiasie („(AI_UNAVAILABLE)") nie mówił, co zrobić. Tura i tak toczy się
 * dalej ręką MG, więc każde zdanie o modelu kończy się tą radą.
 */
export function botTurnErrorText(code: string): string {
  switch (code) {
    case 'AI_UNAVAILABLE': {
      const access = aiAccessSentence();
      if (access)
        return `${access.charAt(0).toLowerCase()}${access.slice(1, -1)} — zagraj tę turę ręką.`;
      return 'model jest niedostępny (AI Gateway nie odpowiada albo model się ładuje) — zagraj tę turę ręką.';
    }
    case 'AI_UNREACHABLE':
      return 'brak połączenia z AI Gateway — zagraj tę turę ręką.';
    case 'TOKEN_NOT_FOUND':
      return 'tej figury już nie ma na scenie.';
    default:
      return 'tura się nie odbyła — coś poszło nie tak po stronie serwera; zagraj ją ręką.';
  }
}

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
    socket.emit(event, payload, (ack: SocketAck<T>) => {
      if (!ack.ok && ack.error === 'RATE_LIMITED') noteRateLimited();
      rollPresentation.deliver(
        () => resolve(ack),
        () => resolve({ ok: false, error: 'NOT_CONNECTED' }),
      );
    });
  });
}

const RATE_LIMITED_TEXT = 'Za szybko — odczekaj chwilę i spróbuj ponownie.';
let rateLimitedNotedAt = 0;

/**
 * Limit tempa serwera (#13, 01.10): zwykły klient go nie dotyka (20 zdarzeń na
 * sekundę z zapasem 60), więc odmowa to seria kliknięć albo skrypt. Jedna
 * notka na kilka sekund zamiast tylu, ile było odmów — każda formatka i tak
 * pokaże swój błąd obok siebie.
 */
function noteRateLimited(): void {
  const now = Date.now();
  if (now - rateLimitedNotedAt < 5_000) return;
  rateLimitedNotedAt = now;
  notifyInfo(RATE_LIMITED_TEXT, { title: 'Za szybko' });
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
export const openCampaign = (campaignId: string) =>
  emitSceneAck<CampaignSummary>('campaign:open', { campaignId });

/** „Rozpocznij sesję” (etap 44c): slot i gracze tej kampanii na stół. */
export const startSession = (campaignId: string) =>
  emitSceneAck<CampaignSummary>('session:start', { campaignId });

/** „Zakończ sesję” (etap 44c): slot wolny, gracze wracają do widoku między sesjami. */
export const endSession = (campaignId: string) => emitSceneAck('session:end', { campaignId });

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

/**
 * Sześć pól szybkiego edytora (etap 38a) — zakłada figurze kartę albo poprawia
 * tę, którą już ma. Osobne zdarzenie, nie łata żetonu: karta i podpięcie muszą
 * powstać razem, inaczej pierwszy zerwany krok zostawia figurę bez statystyk.
 */
export const statToken = (tokenId: string, quick: TokenCombatProfile) =>
  emitSceneAck<TokenView>('token:stat', { tokenId, quick });

/**
 * Kasowanie figury; `deleteCharacter` zabiera przy okazji jej kartę.
 *
 * Pyta o to menu figury, a nie serwer — i wyłącznie wtedy, gdy karta nie ma
 * właściciela i nie stoi na żadnej innej scenie (etap 38a).
 */
export const deleteToken = (tokenId: string, deleteCharacter = false) =>
  emitSceneAck('token:delete', { tokenId, deleteCharacter });

/**
 * Trwały cel figury (etap 50c): `targetId` — w kogo mierzy, null — zdejmuje.
 * Odpowiedź od razu wpisuje się do magazynu; rozgłoszenie do reszty stołu
 * przyniesie to samo.
 */
export async function setTokenTarget(
  tokenId: string,
  targetId: string | null,
): Promise<SocketAck<TokenTargetBroadcast>> {
  const ack = await emitSceneAck<TokenTargetBroadcast>('token:target', { tokenId, targetId });
  if (ack.ok && ack.data) useTargetStore.getState().apply(ack.data);
  return ack;
}

/**
 * Kopia figury obok oryginału (etap 35). Numer, profil bojowy statysty i pełne
 * PW rozstrzyga serwer — patrz `token:duplicate`.
 */
export const duplicateToken = (tokenId: string, x?: number, y?: number) =>
  emitSceneAck<TokenView>('token:duplicate', { tokenId, x, y });

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

export const nextCombatTurn = () =>
  emitSceneAck<CombatView>('combat:next', {}).then((ack) => {
    // Kończę turę bez Testu Przeżywalności (17.10): powód musi dojść do gracza,
    // bo przycisk sam z siebie tylko się odblokowuje. Kubek od razu trzyma
    // ten Test (24.10) — następnym krokiem jest rzut, nie szukanie przycisku.
    if (!ack.ok && ack.error === 'DEATH_SAVE_PENDING') {
      notifyRefusal('action', combatErrorText(ack.error));
      loadOwedDeathSave();
    }
    return ack;
  });

export const previousCombatTurn = () => emitSceneAck<CombatView>('combat:previous', {});

export const endCombat = () => emitSceneAck('combat:end', {});

/**
 * One participant's own initiative, thrown with the dice cup — the gesture
 * carries into the server's RNG and the result lands on chat like any roll.
 */
export function sendInitiativeRoll(combatantId: string, gesture?: RollGesture): void {
  const payload = gesture ? { combatantId, gesture } : { combatantId };
  socket?.emit('combat:roll', payload, (ack: SocketAck<{ initiative: number }>) => {
    noteAck('action', ack, combatErrorText);
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

/** „Wykonaj poza budżetem” — serwer powtarza wstrzymaną intencję MG. */
function confirmOverspend(askId: string): void {
  void emitSceneAck('combat:overspend', { askId }).then((ack) => {
    noteAck('overspend', ack, combatErrorText);
  });
}

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
  /** Punkty Szczęścia z licznika kubka; 0 = bez Szczęścia. */
  luckSpent = 0,
): void {
  const payload: CombatGrapplePayload<RollGesture> = {
    characterId,
    targetTokenId,
    intent,
    ...(attackerTokenId ? { attackerTokenId } : {}),
    ...(luckSpent > 0 ? { luckSpent } : {}),
    ...(gesture ? { gesture } : {}),
  };
  socket?.emit('grapple:attempt', payload, (ack: SocketAck<{ messageId: number }>) => {
    noteAck('action', ack, grappleAckErrorText);
  });
}

/** „Broń się": the defender answers an attempt already sitting on the chat. */
export function sendGrappleResist(
  messageId: number,
  characterId: string,
  gesture?: RollGesture,
  /** Punkty Szczęścia z licznika kubka; 0 = bez Szczęścia. */
  luckSpent = 0,
): void {
  const payload: CombatGrappleResistPayload<RollGesture> = {
    messageId,
    characterId,
    ...(luckSpent > 0 ? { luckSpent } : {}),
    ...(gesture ? { gesture } : {}),
  };
  socket?.emit('grapple:resist', payload, (ack: SocketAck<{ total: number; won: boolean }>) => {
    noteAck('action', ack, grappleAckErrorText);
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
  /** Punkty Szczęścia z licznika kubka; 0 = bez Szczęścia. */
  luckSpent = 0,
): void {
  const payload: CombatFacedownPayload<RollGesture> = {
    characterId,
    targetTokenId,
    ...(challengerTokenId ? { challengerTokenId } : {}),
    ...(luckSpent > 0 ? { luckSpent } : {}),
    ...(gesture ? { gesture } : {}),
  };
  socket?.emit('facedown:attempt', payload, (ack: SocketAck<{ messageId: number }>) => {
    noteAck('action', ack, facedownAckErrorText);
  });
}

/** „Postaw się": the other side answers with real dice instead of half a one. */
export function sendFacedownResist(
  messageId: number,
  characterId: string,
  gesture?: RollGesture,
  /** Punkty Szczęścia z licznika kubka; 0 = bez Szczęścia. */
  luckSpent = 0,
): void {
  const payload: CombatFacedownResistPayload<RollGesture> = {
    messageId,
    characterId,
    ...(luckSpent > 0 ? { luckSpent } : {}),
    ...(gesture ? { gesture } : {}),
  };
  socket?.emit('facedown:resist', payload, (ack: SocketAck<{ total: number }>) => {
    noteAck('action', ack, facedownAckErrorText);
  });
}

/** The loser picks: back off, or stand there and carry the −2. */
export function sendFacedownConcede(messageId: number, choice: 'withdraw' | 'stand'): void {
  const payload: CombatFacedownConcedePayload = { messageId, choice };
  socket?.emit('facedown:concede', payload, (ack: SocketAck<{ choice: string }>) => {
    noteAck('action', ack, facedownAckErrorText);
  });
}

/** „Czy go znam?" — 1k10 against the other person's Reputation (s. 193). */
export function sendReputationRecognise(characterId: string, targetTokenId: string): void {
  const payload: ReputationRecognisePayload = { characterId, targetTokenId };
  socket?.emit('reputation:recognise', payload, (ack: SocketAck<{ known: boolean }>) => {
    noteAck('action', ack, facedownAckErrorText);
  });
}

function facedownAckErrorText(code: string): string {
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
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
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
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
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  switch (code) {
    case 'NOT_A_TARGET':
      return 'To pojemnik, a nie przeciwnik — nie walczy i nie da się go pochwycić.';
    case 'COMBAT_NOT_FOUND':
      return 'Nie ma trwającej walki na tej scenie.';
    case 'COMBATANT_NOT_FOUND':
      return 'Nie znaleziono uczestnika walki — odśwież stronę.';
    case 'INITIATIVE_ALREADY_ROLLED':
      return 'Inicjatywę rzuca się raz na całą walkę. Przerzut może zarządzić tylko MG.';
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
    case 'HOLD_NEEDS_INITIATIVE':
      return 'Wstrzymując Akcję, podaj wartość inicjatywy, przy której wchodzisz.';
    case 'HOLD_NOT_LOWER':
      return 'Wstrzymanie obniża inicjatywę — podaj wartość niższą niż Twoja.';
    case 'NOTHING_HELD':
      return 'Ten uczestnik nie ma wstrzymanej Akcji.';
    case 'USE_HOLD_EVENT':
      return 'Wstrzymanie Akcji deklaruje się osobnym przyciskiem.';
    // Stage 14c: the metres (or the status) that stopped the drag are on the
    // refusal card; the tracker only needs to say that it was stopped.
    case 'MOVE_REFUSED':
      return 'Ruch odrzucony — szczegóły na karcie odmowy.';
    case GM_OVER_BUDGET:
      return 'Poza budżetem tury — zdecyduj na pasku nad mapą.';
    case 'OVERSPEND_EXPIRED':
      return 'To pytanie już wygasło — wykonaj akcję jeszcze raz.';
    // Etap 45: „Ruch graczy: Stop” w górnym pasku MG.
    case 'MOVE_LOCKED':
      return PLAYER_MOVE_STOP_NOTE;
    case 'MOVE_PACE':
      return PLAYER_MOVE_PACE_NOTE;
    case 'COMBAT_PENDING':
      return COMBAT_PENDING_NOTE;
    // Stage 14d: the refusal already carries its own sentence on the card.
    case 'STATUS_BLOCKED':
      return 'Stan tokenu nie pozwala na tę Akcję — szczegóły na karcie odmowy.';
    case 'DODGE_BLOCKED':
      return 'W tym stanie nie można Unikać.';
    // Stage 30c: „Funkcjonariusze Wsparcia nie mogą Unikać pocisków" (s. 158).
    case 'BACKUP_CANNOT_DODGE':
      return 'Funkcjonariusze Wsparcia nie mogą Unikać pocisków.';
    case 'NO_ABILITY':
      return 'Ta postać nie ma tej Zdolności Specjalnej.';
    case 'BACKUP_LEVEL_TOO_HIGH':
      return 'Można wezwać wyłącznie grupę o poziomie nie wyższym niż Zdolność.';
    case 'BACKUP_NOT_FOUND':
      return 'Nie ma takiego wezwania w toku.';
    case 'UNKNOWN_BACKUP_TIER':
      return 'Nie znam takiej kategorii Wsparcia.';
    // Stage 14e: a Critical Injury took this turn's Action or Move Action away
    // before it began. The wound's own sentence rides on the refusal card.
    case 'ACTION_BLOCKED':
      return 'Rana krytyczna zabiera ci Akcję w tej turze — szczegóły na karcie odmowy.';
    case 'MOVE_BLOCKED':
      return 'Rana krytyczna zabiera ci Akcję Ruchu w tej turze — szczegóły na karcie odmowy.';
    // 17.10: Śmiertelnie Ranny najpierw rzuca Test Przeżywalności (s. 187).
    case 'DEATH_SAVE_PENDING':
      return CPRED_DEATH_SAVE_PENDING_MESSAGE;
    default:
      return `Błąd walki: ${code}`;
  }
}

// ─────────────────────────── kreator postaci (25a) ───────────────────────────

/** Creator writes must not wait forever or buffer a stale intent while offline. */
function emitCreationAck<T = undefined>(event: string, payload: unknown): Promise<SocketAck<T>> {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve({ ok: false, error: 'NOT_CONNECTED' });
      return;
    }
    socket.timeout(10000).emit(event, payload, (error: Error | null, ack: SocketAck<T>) => {
      rollPresentation.deliver(() =>
        resolve(error ? { ok: false, error: 'CREATION_TIMEOUT' } : ack),
      );
    });
  });
}

export const listCreationRanks = () =>
  emitCreationAck<CreationRankDraft[]>('creation:ranks', undefined);
/** The header of my own draft, or null — what „Wznów szkic…" is built from. */
export const peekCreation = () =>
  emitCreationAck<CreationDraftPeek | null>('creation:peek', undefined);
export const setCreationRank = (draftId: string, statRankId: string) =>
  emitCreationAck('creation:set-rank', { draftId, statRankId });

type CreationDraft = CreationDraftView<CpredCreationDraft>;

/** Opens the wizard; returns the stored draft, or a fresh one. */
export const startCreation = () => emitCreationAck<CreationDraft>('creation:start', undefined);

export const patchCreation = (
  patch: Record<string, unknown>,
  guard: Omit<CreationPatchPayload, 'patch'> = {},
) => emitCreationAck<CreationDraft>('creation:patch', { patch, ...guard });

/**
 * One 1d10 for one stat, rolled by the server against the Role's template —
 * from the dice cup, with its gesture. Without `statId` it is the GM's plain
 * button: every stat still missing, no cup (the server refuses it a player).
 */
export const rollCreationStats = (statId?: CpredStatId, gesture?: RollGesture) =>
  emitCreationAck<CreationDraft>('creation:roll', { statId, gesture });

/**
 * Rolls one Lifepath table from the cup (stage 25b); many at once only for the
 * GM's plain button. `index` picks the friend / enemy / tragic love the row
 * belongs to and is ignored by the tables that fill a field of their own.
 */
export const rollCreationLifepath = (tableIds: string[], index?: number, gesture?: RollGesture) =>
  emitCreationAck<CreationDraft>('creation:lifepath-roll', { tableIds, index, gesture });

/** „Rzuć 1k10 i odejmij 7" — how many friends, enemies or tragic loves. */
export const rollCreationLifepathCount = (group: string, gesture?: RollGesture) =>
  emitCreationAck<CreationDraft>('creation:lifepath-count', { group, gesture });

/** Where my consent to a new character stands (24.09). */
export const creationPermitState = () =>
  emitCreationAck<CreationPermitState>('creation:permit-state', undefined);
/** „Poproś MG o stworzenie postaci" — or, with `cancel`, taking the request back. */
export const requestCreation = (cancel = false) =>
  emitCreationAck<CreationPermitState>('creation:request', cancel ? { cancel: true } : undefined);
/** „Rozumiem, zaczynam" under the creation rules. */
export const acceptCreationRules = () =>
  emitCreationAck<CreationPermitState>('creation:accept-rules', undefined);
/**
 * The GM's answer to a request — with the terms when agreeing (24.09) — or
 * taking back a consent not used yet.
 */
export const answerCreationRequest = (userId: string, grant: boolean, terms?: CreationTerms) =>
  emitCreationAck('creation:permit', { userId, grant, terms });
/** New terms for a player's draft already being built. */
export const setCreationTerms = (draftId: string, terms: CreationTerms) =>
  emitCreationAck('creation:terms', { draftId, terms });
export const listCreationPermits = () =>
  emitCreationAck<CreationPermitRow[]>('creation:permits', undefined);
/** The GM throws away a player's draft — the only way a player's creation starts over. */
export const discardPlayerDraft = (draftId: string) =>
  emitCreationAck('creation:discard-player', { draftId });

/** The GM's „Pozwól przerzucić" — the dice off one stat of a draft, or all of them. */
export const rerollCreationStats = (draftId: string, statId?: CpredStatId) =>
  emitCreationAck('creation:reroll', { draftId, statId });

/**
 * One item into or out of the wizard's basket (stage 25c). A delta rather than
 * a quantity: two quick clicks on „+" must not race each other onto the same
 * total, and the server is the one holding the prices anyway.
 */
export const buyCreationItem = (entryId: string, delta: 1 | -1, weaponTypeId?: string) =>
  emitCreationAck<CreationDraft>('creation:buy', {
    entryId,
    delta,
    // Etap 46c: kaliber amunicji (typ broni); przy reszcie wpisów go nie ma.
    ...(weaponTypeId ? { weaponTypeId } : {}),
  });

export const finishCreation = (payload: CreationFinishPayload = {}) =>
  emitCreationAck<CreationFinishResult>('creation:finish', payload);

export const discardCreation = (draftId?: string) =>
  emitCreationAck('creation:discard', { draftId });

export function creationErrorText(code: string | undefined): string {
  if (code === 'COMBAT_LOCKED') return COMBAT_LOCKED_TEXT;
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  // „CREATION_SHOP_LOCKED:2:1" — the item's level and whether it is a tool of
  // the draft's Role (naprawa 3b); the creator has its own shelf, not the
  // campaign's, so the sentence says that shelf's rule.
  if (code?.startsWith('CREATION_SHOP_LOCKED')) {
    const [, entryTier, roleTool] = code.split(':');
    return `Poza sklepem kreatora. ${creationShopRefusalText(
      clampShopTier(Number(entryTier)),
      roleTool === '1',
    )}`;
  }
  switch (code) {
    case 'CREATION_SAVE_PENDING':
      return 'Najpierw ponów zapis oczekujących zmian.';
    case 'DRAFT_CHANGED':
      return 'Szkic zmienił się w innym oknie lub na serwerze. Wczytaj zapis serwera przed kolejną edycją; oczekujące zmiany nie zostały nadpisane.';
    case 'CREATION_RANK_PENDING':
      return 'MG musi ustalić Rangę Postaci dla tego szkicu.';
    case 'FORBIDDEN':
      return 'Rangę Postaci ustala wyłącznie MG.';
    case 'NOT_CONNECTED':
      return 'Brak połączenia. Zmiana nie została wysłana. Połącz się ponownie i ponów zapis.';
    case 'CREATION_TIMEOUT':
      return 'Brak potwierdzenia zapisu. Serwer mógł go wykonać. Ponów zapis pól lub zakończenie; przed ponownym zakupem lub rzutem odśwież szkic.';
    case 'CREATION_DATA_MISSING':
      return 'Brak danych tworzenia postaci — kreator nie ma z czego czytać tabel.';
    case 'DRAFT_NOT_FOUND':
      return 'Szkic postaci przepadł. Otwórz kreator jeszcze raz.';
    case 'PORTRAIT_TAKEN':
      return 'Ten portret jest już zajęty. Wybierz inny z galerii.';
    case 'PORTRAIT_NOT_AVAILABLE':
      return 'Ten portret nie jest już dostępny w galerii MG.';
    case 'METHOD_DOES_NOT_ROLL':
      return 'Ta metoda nie losuje Cech — Kompletny Pakiet je kupuje.';
    case 'ROLE_NOT_CHOSEN':
      return 'Najpierw wybierz Rolę.';
    case 'ROLE_HAS_NO_TEMPLATE':
      return 'Ta Rola nie ma w danych szablonu Cech — wybierz Kompletny Pakiet.';
    case 'STAT_ALREADY_ROLLED':
      return 'Ta Cecha jest już wylosowana. Przerzut może pozwolić tylko MG.';
    case 'STATS_ALREADY_ROLLED':
      return 'Wszystkie Cechy są już wylosowane.';
    case 'CREATION_NOT_PERMITTED':
      return 'Nową postać tworzy się za zgodą MG — najpierw poproś o nią w zakładce „Postacie”.';
    case 'CREATION_RULES_PENDING':
      return 'Najpierw przeczytaj zasady tworzenia postaci i kliknij „Rozumiem, zaczynam”.';
    case 'DRAFT_EXISTS':
      return 'Ten gracz ma już szkic postaci — zgoda jest w użyciu.';
    case 'BAD_TERMS':
      return 'Warunki zgody są niepełne: metoda, Ranga Postaci i pula umiejętności (1–300).';
    case 'NO_REQUEST':
      return 'Ten gracz nie prosi teraz o kreator.';
    case 'NOTHING_TO_REROLL':
      return 'Tu nie ma czego przerzucać — ta Cecha nie jest jeszcze wylosowana.';
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
    case 'CATALOG_CLOSED':
      return 'MG zamknął zakupy z katalogu — kupisz u handlarza.';
    case 'NOT_PURCHASABLE':
      return 'Tego się w kreatorze nie kupuje: cyborgizacje instaluje się z karty wpisu.';
    case 'AMMO_CALIBRE_REQUIRED':
      return 'Wybierz kaliber — amunicję kupuje się do konkretnej broni.';
    case 'AMMO_MISMATCH':
      return 'Ten nabój nie pasuje do wybranego kalibru.';
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

/**
 * „🎲 Losuj z Roli” w oknie „Nowa postać” (etap 49b): serwer rzuca 1k10 na
 * wiersz Cech i oddaje statblok; formularz wypełnia się po animacji kości.
 */
export const rollRandomNpc = (roleId: string) =>
  emitCreationAck<CreationRandomNpcResult>('creation:random-npc', { roleId });

export const deleteCharacter = (characterId: string) =>
  emitSceneAck('character:delete', { characterId });

/** Immediate (non-debounced) character update — owner assignment, portraits. */
export const updateCharacter = (characterId: string, patch: CharacterPatch) =>
  emitSceneAck<CharacterView>('character:update', { characterId, patch });

/**
 * MG przyjmuje postać do gry albo cofa gotowość (naprawa 3c).
 *
 * Osobne zdarzenie, nie łata karty: to decyzja MG, a nie pole, które zapisuje
 * autozapis arkusza. Odpowiedź niesie pełny widok karty, więc znaczek na
 * zakładce gaśnie z tego samego rozgłoszenia, które widzą inne okna.
 */
export const setCharacterPlayReady = (characterId: string, ready: boolean) =>
  emitSceneAck<CharacterView>('character:play-ready', { characterId, ready });

/**
 * Saving a Solo's Zmysł Walki allocation (stage 30a).
 *
 * Its own event rather than a sheet patch, and never debounced: „w trakcie
 * walki (w ramach Akcji)" (s. 146) means the save may cost an Action, and an
 * Action must not be charged by an autosave timer firing behind the player.
 *
 * `tokenId` is the figure that pays, when one is standing on the scene; the
 * server charges nothing when no fight is running.
 */
export const saveCombatAwareness = (
  characterId: string,
  allocation: Record<string, number>,
  tokenId?: string,
) =>
  emitSceneAck<CharacterView>('character:combat-awareness', {
    characterId,
    allocation,
    ...(tokenId ? { tokenId } : {}),
  });

/**
 * „Prowizorka" Technika (etap 30b) — Akcja, gdy trwa walka.
 *
 * `tokenId` to figura, która płaci; poza walką serwer nie liczy nic. Odmowa
 * wraca kodem silnika i tłumaczy ją `fieldRepairErrorText` niżej.
 */
export async function makeFieldRepair(
  characterId: string,
  armorRowId: string,
  tokenId?: string,
): Promise<void> {
  const ack = await emitSceneAck<CharacterView>('character:field-repair', {
    characterId,
    armorRowId,
    ...(tokenId ? { tokenId } : {}),
  });
  noteAck('character', ack, fieldRepairErrorText);
}

/** Koniec prowizorki — starte OB wraca na wiersz. Nie kosztuje nic. */
export async function endFieldRepair(characterId: string, armorRowId: string): Promise<void> {
  const ack = await emitSceneAck<CharacterView>('character:field-repair', {
    characterId,
    armorRowId,
    undo: true,
  });
  noteAck('character', ack, fieldRepairErrorText);
}

/** Polskie zdania dla odmów, którymi kończy się `character:field-repair`. */
export function fieldRepairErrorText(code: string): string {
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  switch (code) {
    case 'UNKNOWN_ARMOR':
      return 'Nie ma takiej sztuki pancerza na karcie.';
    case 'NO_REPAIR_SPECIALTY':
      return 'Prowizorkę robi Technik z co najmniej 1 punktem w Specjalizacji Naprawa.';
    case 'ARMOR_INTACT':
      return 'Ta sztuka ma pełne OB — nie ma czego prowizorycznie naprawiać.';
    case 'ALREADY_PATCHED':
      return 'Ta sztuka jest już na prowizorce — najpierw napraw ją zwyczajnie.';
    case 'NOT_PATCHED':
      return 'Ta sztuka nie jest na prowizorce.';
    default:
      return combatErrorText(code);
  }
}

/**
 * Jeden pełny dzień odpoczynku (s. 222–223).
 *
 * Liczby nie ma tu wcale — klient deklaruje wyłącznie „minął dzień" i czy
 * postać się nadwyrężyła. PW wylicza serwer z Budowy Ciała, chromu
 * i antybiotyku, a karta na czacie pokazuje rozbicie.
 */
export async function restForADay(characterId: string, strained = false): Promise<void> {
  const ack = await emitSceneAck<{ healed: number; hpCurrent: number; refusal: string | null }>(
    'character:rest',
    { characterId, ...(strained ? { strained: true } : {}) },
  );
  noteAck('character', ack, recoveryErrorText);
}

/** Partia dawek farmaceutyku: Test PT 13 i 200 ed surowców (s. 150). */
export async function craftPharmaceutical(
  characterId: string,
  pharmaId: string,
  gesture?: RollGesture,
): Promise<void> {
  const ack = await emitSceneAck<{ doses: number; balance: number }>('character:craft-pharma', {
    characterId,
    pharmaId,
    ...(gesture ? { gesture } : {}),
  });
  noteAck('character', ack, recoveryErrorText);
}

/**
 * Podanie jednej dawki (s. 150) — Akcja, gdy trwa walka.
 *
 * `targetTokenId` pominięty znaczy „sobie". Dawka schodzi z ekwipunku
 * podającego, a skutek ląduje na karcie celu — obie rzeczy robi jedno zdarzenie.
 * `hostile` to atak strzykawką bezigłową na cel, który się broni: rzut robi
 * serwer, a pudło zostawia dawkę.
 */
export async function useDose(
  characterId: string,
  gearRowId: string,
  targetTokenId?: string,
  hostile = false,
): Promise<void> {
  const ack = await emitSceneAck<{ qtyLeft: number; healed: number; hit?: boolean }>(
    'character:use-dose',
    {
      characterId,
      gearRowId,
      ...(targetTokenId ? { targetTokenId } : {}),
      ...(hostile ? { hostile: true } : {}),
    },
  );
  noteAck('character', ack, recoveryErrorText);
}

/**
 * Fiolka trucizny albo biotoksyny na lekką broń białą (etap 59b, s. 353) —
 * Akcja w walce, trucizna działa 30 minut.
 */
export async function coatWeapon(
  characterId: string,
  gearRowId: string,
  weaponRowId: string,
): Promise<void> {
  const ack = await emitSceneAck('character:coat-weapon', { characterId, gearRowId, weaponRowId });
  noteAck('character', ack, recoveryErrorText);
}

/** Ręka MG na chemii karty (etap 59b/59c): dawka, trucizna, terapia, uzależnienie. */
export function setChems(payload: CharacterChemsPayload): void {
  socket?.emit('character:chems', payload, (ack: SocketAck) => {
    noteAck('character', ack, statEffectAckErrorText);
  });
}

/** Polskie zdania dla odmów z trzech zdarzeń powrotu do zdrowia. */
export function recoveryErrorText(code: string): string {
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  switch (code) {
    case 'UNKNOWN_PHARMA':
      return 'Nie znam takiego farmaceutyku.';
    case 'PHARMA_NOT_UNLOCKED':
      return 'Ten Medyk nie ma jeszcze dostępu do tego środka — brakuje punktów w Farmaceutykach.';
    case 'NO_MEDTECH_SKILL':
      return 'Wytwarzanie wymaga Umiejętności Technologia Medyczna na poziomie co najmniej 1.';
    case 'NOT_ENOUGH_EDDIES':
      return 'Za mało eurodolców na surowce (200 ed za partię).';
    case 'NOT_A_CONSUMABLE':
      return 'Ten wiersz ekwipunku nie jest dawką, którą da się podać.';
    case 'NOT_A_TOXIN':
      return 'Ten wiersz nie jest fiolką trucizny ani biotoksyny.';
    case 'NOT_A_LIGHT_BLADE':
      return 'Fiolkę rozsmarowuje się wyłącznie na lekkiej broni białej (1k6).';
    case 'UNKNOWN_WEAPON':
      return 'Tej broni nie ma już na karcie.';
    case 'NO_DOSES_LEFT':
      return 'Nie ma już ani jednej dawki.';
    case 'NOT_A_MEDIC':
      return 'Postać niebędąca Medykiem nie potrafi poprawnie podawać farmaceutyków (s. 150).';
    case 'DOSE_OUT_OF_REACH':
      return 'Za daleko — zastrzyk wymaga zasięgu ramienia (2 m).';
    case 'NO_AIRHYPO':
      return 'Do zastrzyku siłą potrzebna jest Strzykawka bezigłowa w ekwipunku.';
    case 'HOSTILE_DOSE_TARGET':
      return 'Siłą podaje się komuś innemu, kto stoi na mapie — wybierz go w polu „Komu”.';
    default:
      return combatErrorText(code);
  }
}

/**
 * Wezwanie Wsparcia (etap 30c, s. 158).
 *
 * `tokenId` to figura, która płaci Akcję i przy której staną funkcjonariusze;
 * bez niej wezwanie jest samym rzutem na czacie. Gest kubka jedzie jak przy
 * każdym innym rzucie, bo to rzut jak każdy inny — tyle że o cudzą pomoc.
 */
export async function callBackup(
  characterId: string,
  level: number,
  tokenId?: string,
  gesture?: RollGesture,
): Promise<{ ok: boolean; answered?: boolean; rounds?: number | null; secondGroup?: boolean }> {
  const ack = await emitSceneAck<{
    answered: boolean;
    rounds: number | null;
    tierId: string | null;
    secondGroup: boolean;
  }>('character:backup-call', {
    characterId,
    level,
    ...(tokenId ? { tokenId } : {}),
    ...(gesture ? { gesture } : {}),
  });
  if (!noteAck('action', ack, combatErrorText)) {
    return { ok: false };
  }
  return {
    ok: true,
    answered: ack.data?.answered ?? false,
    rounds: ack.data?.rounds ?? null,
    secondGroup: ack.data?.secondGroup ?? false,
  };
}

/** MG rozstrzyga los grupy w drodze: nazywa drugą, stawia teraz albo odwołuje. */
export async function resolveBackup(
  pendingId: string,
  action: 'second' | 'place' | 'cancel',
  tierId?: string,
): Promise<void> {
  const ack = await emitSceneAck<{ placed: boolean }>('backup:resolve', {
    pendingId,
    action,
    ...(tierId ? { tierId } : {}),
  });
  noteAck('action', ack, combatErrorText);
}

/** HR przysyła nowego pracownika: losuje wiersz Cech i Lojalność (etap 30c). */
export async function hireTeamMember(
  characterId: string,
  professionId: string,
  name: string,
  replacement?: boolean,
): Promise<boolean> {
  const ack = await emitSceneAck<CharacterView>('character:team-hire', {
    characterId,
    professionId,
    name,
    ...(replacement ? { replacement: true } : {}),
  });
  if (!noteAck('action', ack, teamErrorText)) {
    return false;
  }
  return true;
}

/** Wszystko, co dzieje się z Lojalnością potem: Test, tabela, koniec sesji, zwolnienie. */
export async function changeTeamLoyalty(
  characterId: string,
  memberId: string,
  what: { changeId?: string; test?: boolean; endSession?: boolean; dismiss?: boolean },
): Promise<void> {
  const ack = await emitSceneAck<CharacterView>('character:team-loyalty', {
    characterId,
    memberId,
    ...what,
  });
  noteAck('action', ack, teamErrorText);
}

/** Polskie zdania dla odmów zespołu — te same, którymi silnik wyszarza guziki. */
export function teamErrorText(code: string): string {
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  if (code in CPRED_TEAM_PROBLEMS) return CPRED_TEAM_PROBLEMS[code as CpredTeamProblem];
  switch (code) {
    case 'TEAM_MEMBER_NOT_FOUND':
      return 'Tej osoby nie ma w zespole.';
    case 'INVALID_NAME':
      return 'Pracownik potrzebuje imienia.';
    // #75 — jedyna odmowa FORBIDDEN zespołu to Lojalność, którą prowadzi MG;
    // `combatErrorText` powiedziałby o turze.
    case 'FORBIDDEN':
      return 'Lojalność zespołu prowadzi MG.';
    default:
      return combatErrorText(code);
  }
}

/**
 * Targowanie się (etap 30d, s. 159).
 *
 * `opponentBonus` to jedna liczba, którą podaje MG: CHA + Handel + Znajomości
 * drugiej strony. Jej kość spada na serwerze obok kości Fixera, bo sprzedawca
 * jest fikcją, a nie kartą — pytanie o trzy liczby osobno byłoby pytaniem
 * trzy razy o jedno.
 */
export async function strikeHaggle(
  characterId: string,
  dealId: string,
  opponentBonus: number,
  gesture?: RollGesture,
): Promise<{ ok: boolean; won?: boolean }> {
  const ack = await emitSceneAck<{ won: boolean; dealId: string | null }>('character:haggle', {
    characterId,
    dealId,
    opponentBonus,
    ...(gesture ? { gesture } : {}),
  });
  if (!noteAck('exchange', ack, haggleErrorText)) {
    return { ok: false };
  }
  return { ok: true, won: ack.data?.won ?? false };
}

/** Fixer zdejmuje dobity targ z karty — bez rzutu i bez karty na czacie. */
export async function dropHaggle(characterId: string): Promise<void> {
  const ack = await emitSceneAck<unknown>('character:haggle', { characterId, clear: true });
  noteAck('exchange', ack, haggleErrorText);
}

/** Polskie zdania dla odmów Targowania się i Taboru — te same, co w silniku. */
export function haggleErrorText(code: string): string {
  if (code === 'COMBAT_LOCKED') return COMBAT_LOCKED_TEXT;
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  if (code in CPRED_HAGGLE_PROBLEMS) return CPRED_HAGGLE_PROBLEMS[code as CpredHaggleProblem];
  if (code in CPRED_FLEET_PROBLEMS) {
    return CPRED_FLEET_PROBLEMS[code as keyof typeof CPRED_FLEET_PROBLEMS];
  }
  return combatErrorText(code);
}

/** Polish sentences for the refusals `character:combat-awareness` can return. */
export function combatAwarenessErrorText(code: string): string {
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  if (code in CPRED_COMBAT_AWARENESS_PROBLEMS) {
    return CPRED_COMBAT_AWARENESS_PROBLEMS[code as CpredCombatAwarenessProblem];
  }
  return combatErrorText(code);
}

/**
 * Why a sheet patch was refused, in one sentence for the card's issue strip.
 *
 * Every code here means the same thing on the wire — the server wrote nothing —
 * but „Błąd zapisu!" alone left the GM guessing which of a dozen rules had
 * spoken (02.09). The engine's own tables answer first, because the sentence
 * that greys a button out and the sentence that explains a refusal should not
 * be two different sentences.
 */
export function characterSaveErrorText(code: string): string {
  if (code === 'COMBAT_LOCKED') return COMBAT_LOCKED_TEXT;
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  if (code in CPRED_ROLES_PROBLEMS) {
    return CPRED_ROLES_PROBLEMS[code as keyof typeof CPRED_ROLES_PROBLEMS];
  }
  if (code in CPRED_SPECIALTY_PROBLEMS) {
    return CPRED_SPECIALTY_PROBLEMS[code as keyof typeof CPRED_SPECIALTY_PROBLEMS];
  }
  if (code in CPRED_FLEET_PROBLEMS) {
    return CPRED_FLEET_PROBLEMS[code as keyof typeof CPRED_FLEET_PROBLEMS];
  }
  switch (code) {
    case 'OFFLINE':
      return 'Brak połączenia z serwerem — zmiana nie została zapisana.';
    case 'FORBIDDEN':
      return 'Tego pola nie zmienia się z karty — zmienia je własna Akcja albo MG.';
    case 'INVALID_NAME':
      return 'Imię musi mieć od 1 do 64 znaków.';
    case 'INVALID_DATA':
      return 'Serwer nie przyjął tych danych karty — popraw ostatnią zmianę.';
    // Etap 46c (decyzja MG z 09.10): na karcie z zapasem naboi ręką tylko ubywa.
    case 'AMMO_LOCKED':
      return 'Naboi przybywa z zakupu, wymiany, łupu albo od MG — ręką możesz je tylko odjąć.';
    // Etap 48c (decyzje MG z 10.10): rzeczy z mechaniką nie przybywają z ręki.
    case 'ITEM_LOCKED':
      return 'Przedmioty i ich liczby przychodzą z zakupu, wymiany, łupu albo od MG — na karcie piszesz uwagi, wyrzucasz i zużywasz.';
    // Etap 48a (decyzja MG z 10.10): kwaterunek od Korporacji wg Pracy Zespołowej.
    case 'HOUSING_LOCKED':
      return 'To zakwaterowanie daje Korporacja od odpowiedniej rangi Pracy Zespołowej — ustawia je MG.';
    case 'CHARACTER_NOT_FOUND':
      return 'Nie ma takiej postaci w tej kampanii — odśwież stronę.';
    case 'BAD_REQUEST':
      return 'Serwer nie zrozumiał tej zmiany — odśwież stronę.';
    default:
      return `Serwer odmówił zapisu (${code}).`;
  }
}

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
    store.endSave(characterId, null, false, 'OFFLINE');
    return;
  }
  socket.emit(
    'character:update',
    { characterId, patch: buffer.patch },
    (ack: SocketAck<CharacterView>) => {
      useCharacterStore
        .getState()
        .endSave(
          characterId,
          ack.ok ? (ack.data ?? null) : null,
          ack.ok,
          ack.ok ? undefined : ack.error,
        );
    },
  );
}

let lastMoveSentAt = 0;

type AimReport = { tokenId: string; facing: number | null };
/** Ostatni grot, który poszedł do serwera; null — nic nie wisi u stołu. */
let aimSent: AimReport | null = null;
let aimPending: AimReport | null = null;
let aimSentAt = 0;
let aimTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Grot celowania do reszty stołu (03.10, zlecenie MG) — najwyżej jeden
 * `token:aim` na `TOKEN_AIM_INTERVAL_MS`. Pierwsza zmiana idzie od razu,
 * następne zbierają się w jedną wysyłkę na końcu okna: stół widzi obrót bez
 * zwłoki, a przeciągnięcie kursora przez tłum to jedna wiadomość, nie dziesięć.
 * Liczy się tylko ostatni stan — gniazdo ma jeden celownik, a serwer sam
 * zdejmuje stary grot, gdy przychodzi nowa figura.
 */
export function reportTokenAim(tokenId: string, facing: number | null): void {
  aimPending = { tokenId, facing };
  if (aimTimer) return;
  const wait = aimSentAt + TOKEN_AIM_INTERVAL_MS - Date.now();
  if (wait <= 0) flushTokenAim();
  else aimTimer = setTimeout(flushTokenAim, wait);
}

function flushTokenAim(): void {
  aimTimer = null;
  const next = aimPending;
  aimPending = null;
  if (!next || !socket?.connected) return;
  if (next.facing === null) {
    // Zdjęcie celownika zdejmuje to, co wisi — a gdy nic nie wisi, nie ma o czym mówić.
    if (!aimSent || aimSent.facing === null) return;
    next.tokenId = aimSent.tokenId;
  } else if (aimSent && aimSent.tokenId === next.tokenId && aimSent.facing === next.facing) {
    return;
  }
  socket.emit('token:aim', next);
  aimSent = next;
  aimSentAt = Date.now();
}

function resetTokenAim(): void {
  if (aimTimer) clearTimeout(aimTimer);
  aimTimer = null;
  aimPending = null;
  aimSent = null;
}

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
  extra?: boolean,
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
    // Etap 54: marsz w drugi pas zasięgu prosi o handel (CP RED — Bieg).
    ...(extra === true ? { extra: true } : {}),
  });
}

/**
 * „Idę tędy” (etap 52) — trasa marszu gracza do zatwierdzenia przed pierwszym
 * krokiem. Bez niej serwer nie przyjmie klatek marszu (`MOVE_NOT_PLANNED`).
 */
export const requestTokenWalk = (tokenId: string, route: ScenePoint[], extra = false) =>
  emitSceneAck<{ tokenId: string }>('token:walk', {
    tokenId,
    route: route.slice(0, TOKEN_PATH_MAX_POINTS),
    ...(extra ? { extra: true } : {}),
  });

/**
 * Skok (19.10.2026): pola, na które ta figura może teraz skoczyć — serwer zna
 * rodzaj każdej ściany, klient gracza nie, więc to on rozstrzyga, co jest
 * barierą do przeskoczenia.
 */
export const requestJumpOptions = (tokenId: string) =>
  emitSceneAck<TokenJumpOptionsView>('token:jump-options', { tokenId });

/** Skok tej figury w jednym z ośmiu kierunków — odpowiedź to pole lądowania. */
export const sendTokenJump = (tokenId: string, dx: number, dy: number) =>
  emitSceneAck<{ x: number; y: number }>('token:jump', { tokenId, dx, dy });

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
    rollPresentation.deliver(() => {
      const chat = useChatStore.getState();
      if (ack.ok && ack.data) {
        chat.prependHistory(ack.data);
      } else {
        chat.setLoadingHistory(false);
      }
    });
  });
}

/** Polish text for a refusal of `character:cyberware` (stage 23a). */
function cyberwareErrorText(code: string | undefined): string {
  if (code === 'COMBAT_LOCKED') return COMBAT_LOCKED_TEXT;
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
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
    // Etap 48c: znaleziony wszczep to wiersz Wyposażenia.
    case 'CYBERWARE_NOT_IN_GEAR':
      return 'Znalezionego wszczepu nie ma w Wyposażeniu — za samą robociznę montuje się tylko to, co postać przyniosła.';
    case 'CHARACTER_NOT_FOUND':
      return 'Nie możesz zmieniać tej karty.';
    // 04.09.2026: trzy odmowy z s. 111 i dwie z s. 226 — do tej pory
    // arytmetyka gniazd była wyłącznie chipem na karcie.
    case 'MISSING_FOUNDATION':
    case 'NO_SLOTS':
    case 'POOL_FULL':
      return CYBERWARE_INSTALL_REFUSAL_MESSAGES[code];
    case 'SELF_INSTALL':
      return 'Sam sobie tego nie wszczepisz — poza galerią potrzebny jest ktoś drugi (s. 226).';
    case 'NO_SURGERY_SKILL':
      return 'Ta postać nie ma Chirurgii — montaż wykonuje Medyk albo ripperdoc MG (s. 226).';
    case 'BAD_SURGEON':
      return 'Poziom chirurga musi być liczbą z zakresu 0–20.';
    case 'FORBIDDEN':
      return 'Tę operację może zlecić tylko MG.';
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
 *
 * Resolves to the refusal sentence — the one the chat gets as well — or to null
 * once the server took the intention (13.09). A caller that writes „Instaluję…"
 * next to the button waits for it: until it could, a refused install left the
 * compendium card saying one thing and the chat another.
 */
/**
 * Cyberdek i jego gniazda (etap 48b) — podpięcie i odpięcie deku, włożenie
 * i wyjęcie Programu albo Ulepszenia, liczba gniazd (MG). Wszystko z Wyposażenia
 * i do niego, jednym zapisem serwera; odmowa idzie notką na czat i wraca.
 */
export function sendDeckAction(payload: CharacterDeckPayload): Promise<string | null> {
  const current = socket;
  if (!current) {
    const text = deckErrorText('OFFLINE');
    notifyRefusal('character', text);
    return Promise.resolve(text);
  }
  // Zbuforowany autozapis Wyposażenia przyszedłby po zapisie serwera i oddałby
  // do plecaka rzecz, która właśnie weszła do gniazda.
  flushCharacterSave(payload.characterId);
  return new Promise((resolve) => {
    current.emit('character:deck', payload, (ack: SocketAck<CharacterView>) => {
      if (ack.ok) {
        clearNotices('character');
        resolve(null);
        return;
      }
      const text = deckErrorText(ack.error);
      notifyRefusal('character', text);
      resolve(text);
    });
  });
}

/** Polskie zdania dla odmów `character:deck`. */
export function deckErrorText(code: string): string {
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  switch (code) {
    case 'OFFLINE':
      return 'Brak połączenia z serwerem — dek został bez zmian.';
    case 'ITEM_NOT_FOUND':
      return 'Tej rzeczy nie ma już w Wyposażeniu ani w deku — odśwież kartę.';
    case 'NOT_A_DECK':
      return 'To nie jest cyberdek — podłączyć można tylko dek z Wyposażenia.';
    case 'NOT_INSTALLABLE':
      return 'Do gniazda deku wkłada się tylko Programy i Ulepszenia Sprzętowe.';
    case 'NO_DECK':
      return 'Najpierw podłącz cyberdek z Wyposażenia.';
    case 'NO_FREE_SLOTS':
      return 'W deku nie ma tylu wolnych gniazd — najpierw coś wyjmij.';
    case 'TOO_MANY_ROWS':
      return 'Wyposażenie jest pełne — zrób miejsce, zanim coś z deku wyjmiesz.';
    case 'BAD_SLOTS':
      return 'Gniazd nie może być mniej niż zajętych ani więcej niż 16.';
    case 'NET_RUN_ACTIVE':
      return 'W trakcie runu nie przepina się deku — najpierw wyjdź z Sieci.';
    case 'FORBIDDEN':
      return 'Liczbę gniazd zmienia MG.';
    default:
      return `Serwer odmówił (${code}).`;
  }
}

export function sendCyberwareAction(
  payload: Omit<CharacterCyberwarePayload, 'gesture'>,
  gesture?: RollGesture,
): Promise<string | null> {
  const current = socket;
  if (!current) {
    const text = cyberwareErrorText('OFFLINE');
    notifyRefusal('character', text);
    return Promise.resolve(text);
  }
  // Anything buffered would otherwise land after the server's own write and
  // overwrite the freshly rolled Humanity with the pre-install value.
  flushCharacterSave(payload.characterId);
  const full: CharacterCyberwarePayload = { ...payload, ...(gesture ? { gesture } : {}) };
  return new Promise((resolve) => {
    current.emit('character:cyberware', full, (ack: SocketAck<{ messageId: number | null }>) => {
      if (ack.ok) {
        clearNotices('character');
        resolve(null);
        return;
      }
      const text = cyberwareErrorText(ack.error);
      notifyRefusal('character', text);
      resolve(text);
    });
  });
}

/* ----- Prośba o operację u Medyka innego gracza (#41, 30.09.2026) ----- */

/** Medycy innych graczy, u których pacjent może poprosić o operację. */
export const fetchSurgeons = (patientId: string) =>
  emitSceneAck<CyberwareSurgeonsResult>('cyberware:surgeons', {
    patientId,
  } satisfies CyberwareSurgeonsPayload);

/** „Zainstaluj" z Medykiem innego gracza — karta prośby zamiast montażu. */
export function requestSurgery(payload: CyberwareRequestPayload) {
  // Zapis karty pacjenta czekający w buforze wyprzedziłby odczyt serwera.
  flushCharacterSave(payload.patientId);
  return emitSceneAck<{ messageId: number }>('cyberware:request', payload);
}

/** „Operuję", „Zgadzam się", „Odmawiam", „Wycofaj" na karcie prośby. */
export const respondSurgery = (payload: CyberwareRespondPayload) =>
  emitSceneAck<{ pending: boolean }>('cyberware:respond', payload);

/** Polskie zdanie odmowy przy prośbie o operację — reszta jak przy montażu. */
export function surgeryErrorText(code: string | undefined): string {
  if (code === 'COMBAT_LOCKED') return COMBAT_LOCKED_TEXT;
  switch (code) {
    case 'SURGERY_NOT_FOUND':
    case 'SURGERY_CLOSED':
      return 'Ta prośba jest już zamknięta.';
    case 'SURGERY_NOT_YOURS':
      return 'To nie twoja decyzja — odpowiada Medyk albo pacjent.';
    case 'SURGERY_QUOTED':
      return 'Wycena czeka na zgodę pacjenta.';
    case 'SURGERY_NOT_QUOTED':
      return 'Medyk nie podał jeszcze ceny.';
    case 'BAD_PRICE':
      return 'Cena musi być liczbą całkowitą od zera w górę.';
    case 'NO_SURGERY_NEEDED':
      return 'Ten wszczep wchodzi bez operacji — nie ma o co prosić.';
    case 'NOT_ENOUGH_EDDIES':
      return 'Pacjenta na to nie stać — Medyk może zejść z ceny.';
    case 'CHARACTER_NOT_FOUND':
      return 'Nie znalazłem tej postaci.';
    case 'NOT_CONNECTED':
      return cyberwareErrorText('OFFLINE');
    default:
      return cyberwareErrorText(code);
  }
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
  if (code === 'COMBAT_LOCKED') return COMBAT_LOCKED_TEXT;
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  const locked = shopTierErrorText(code);
  if (locked) return locked;
  switch (code) {
    case 'NOT_ENOUGH_EDDIES':
      return 'Za mało eurodolców.';
    case 'NO_PRICE':
      return 'Ten wpis nie ma ceny — uzupełnij ją w kompendium albo podaj własną.';
    case 'NOT_PURCHASABLE':
      return 'Tego się tu nie kupuje: cyborgizacje instaluje się z karty wpisu.';
    case 'AMMO_CALIBRE_REQUIRED':
      return 'Wybierz kaliber — amunicję kupuje się do konkretnej broni.';
    case 'AMMO_MISMATCH':
      return 'Ten nabój nie pasuje do wybranego kalibru.';
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
    socket.emit(event, payload, (ack: SocketAck<T>) =>
      rollPresentation.deliver(
        () => resolve(ack),
        () => resolve({ ok: false, error: 'NOT_CONNECTED' }),
      ),
    );
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

/**
 * Etap 29a: kupuje jeden poziom Umiejętności albo Zdolności Specjalnej.
 *
 * `flushCharacterSave` z tego samego powodu, co przy zakupie: łata czekająca
 * na debounce wylądowałaby po zapisie serwera i przywróciła licznik sprzed
 * wydatku.
 */
export function advanceCharacter(
  payload: CharacterAdvancePayload,
): Promise<SocketAck<CharacterView>> {
  flushCharacterSave(payload.characterId);
  return emitEconomy('character:advance', payload);
}

/** MG: rozdaje pulę PD po sesji — jednej postaci albo całemu stołowi. */
export function awardImprovementPoints(
  payload: CharacterXpAwardPayload,
): Promise<SocketAck<CharacterXpAwardResult>> {
  if (payload.characterId) flushCharacterSave(payload.characterId);
  return emitEconomy('character:xp-award', payload);
}

/** Gracz: PD przyznane jego postaciom, o których jeszcze nie słyszał. */
function fetchUnseenXpAwards(): Promise<SocketAck<CharacterXpAwardedPush>> {
  return emitEconomy('character:xp-unseen', undefined);
}

/**
 * Komunikat o przyznanych PD (decyzja MG z 20.10) — jeden pasek na postać.
 * Bez tematu, bo pasek w temacie wypiera poprzedni, a dwie postacie jednego
 * gracza to dwa komunikaty; stoi do kliknięcia, bo bywa pierwszą rzeczą, jaką
 * gracz widzi po wejściu. „Rozwiń postać” otwiera kartę na panelu „Awans”.
 */
function showXpAwards(push: CharacterXpAwardedPush): void {
  for (const notice of push.awards) {
    useNoticeStore.getState().show({
      tone: 'info',
      title: 'Punkty Doświadczenia',
      text: describeXpAwardNotice(notice),
      topic: null,
      lifetime: null,
      actions: [
        {
          label: 'Rozwiń postać',
          title: 'Otwiera kartę postaci na panelu „Awans”, gdzie wydaje się PD',
          run: () => useCharacterStore.getState().focusPanel(notice.characterId, 'bio', 'advance'),
        },
      ],
    });
  }
}

/** Rejestr awansów jednej karty — od najnowszego. */
export function fetchAdvancementHistory(
  characterId: string,
): Promise<SocketAck<CharacterXpHistoryResult>> {
  return emitEconomy('character:xp-history', { characterId });
}

/**
 * MG: cofa jeden wpis rejestru awansów (zlecenie MG z 24.10) — poziom wraca,
 * PD wracają do puli albo z niej schodzą. `flushCharacterSave` z tego samego
 * powodu, co przy awansie.
 */
export function undoAdvancement(
  payload: CharacterXpUndoPayload,
): Promise<SocketAck<CharacterView>> {
  flushCharacterSave(payload.characterId);
  return emitEconomy('character:xp-undo', payload);
}

/** Polskie zdania dla odmów, które potrafi zwrócić `character:advance`. */
export function advanceErrorText(code: string): string {
  if (code === 'COMBAT_LOCKED') return COMBAT_LOCKED_TEXT;
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  if (code === 'ENTRY_NOT_FOUND') return 'Tego wpisu nie ma już w rejestrze.';
  if (code in CPRED_ADVANCE_PROBLEMS) {
    return CPRED_ADVANCE_PROBLEMS[code as CpredAdvanceProblem];
  }
  if (code in ADVANCEMENT_UNDO_PROBLEMS) {
    return ADVANCEMENT_UNDO_PROBLEMS[code as AdvancementUndoProblem];
  }
  return combatErrorText(code);
}

/**
 * Etap 29b: postać bierze na siebie inną Rolę (s. 143).
 *
 * `flushCharacterSave` z tego samego powodu, co przy awansie: łata czekająca
 * na debounce wylądowałaby po zapisie serwera i przywróciła starą Rolę.
 */
export function changeCharacterRole(
  payload: CharacterRoleChangePayload,
): Promise<SocketAck<CharacterView>> {
  flushCharacterSave(payload.characterId);
  return emitEconomy('character:role-change', payload);
}

/** Polskie zdania dla odmów, które potrafi zwrócić `character:role-change`. */
export function roleChangeErrorText(code: string): string {
  if (code === 'COMBAT_LOCKED') return COMBAT_LOCKED_TEXT;
  if (code === 'CHARACTER_AWAITING_GM') return CHARACTER_AWAITING_GM_TEXT;
  if (code in CPRED_ROLE_CHANGE_PROBLEMS) {
    return CPRED_ROLE_CHANGE_PROBLEMS[code as CpredRoleChangeProblem];
  }
  return combatErrorText(code);
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

/**
 * MG przesuwa zegar świata (etap 37).
 *
 * Skok jedzie **identyfikatorem**, nie liczbą minut: „+1 h" jest intencją,
 * a arytmetykę robi serwer — ta sama zasada, co przy rzutach kośćmi. Ustawienie
 * daty wprost jest jedynym wejściem, które niesie liczbę, i jedynym, którym da
 * się zegar cofnąć.
 */
export function setGameTime(
  payload: { step: GameTimeStepId } | { minutes: number; start?: boolean },
): Promise<SocketAck<GameTimeAck>> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve({ ok: false, error: 'OFFLINE' });
      return;
    }
    socket.emit('time:set', payload, (ack: SocketAck<GameTimeAck>) => {
      if (ack.ok && ack.data) useGameTimeStore.getState().applyJump(ack.data.time, ack.data.days);
      resolve(ack);
    });
  });
}

/**
 * MG: przestawia kadr portretu na mapie (12.09); cały stół słyszy.
 *
 * Zapisuje się **cały** kadr, a nie różnicę — okno kadrowania i tak trzyma trzy
 * liczby naraz, a serwer i tak je zaciska do granic tego obrazu.
 */
export function setPortraitCrop(
  assetId: string,
  crop: PortraitCrop,
  /** Kadr banera (25.09): pominięty — bez zmian, `null` — „jak żeton”. */
  bannerCrop?: PortraitCrop | null,
): Promise<SocketAck<PortraitAssetView>> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve({ ok: false, error: 'OFFLINE' });
      return;
    }
    socket.emit(
      'portrait:crop',
      { assetId, crop, ...(bannerCrop !== undefined ? { bannerCrop } : {}) },
      (ack: SocketAck<PortraitAssetView>) => resolve(ack),
    );
  });
}

/**
 * Wiersz puli z rozgłoszenia: pełny albo — u gracza, przy portrecie NPC, którego
 * nic nie nosi — samo polecenie „zapomnij” (23.09).
 */
function applyPortraitBroadcast(broadcast: PortraitCropBroadcast): void {
  const store = usePortraitStore.getState();
  if (broadcast.asset) store.applyUpsert(broadcast.asset);
  else if (broadcast.removedId) store.applyRemove(broadcast.removedId);
}

/** MG: przenosi portret między pulą graczy a portretami NPC (23.09). */
/**
 * „Poproś MG o portret" (#68) — gracz, któremu pula nie zostawiła wolnej
 * twarzy. `PORTRAIT_AVAILABLE`: w międzyczasie coś się zwolniło.
 */
export function requestPortrait(): Promise<SocketAck<PortraitWantedRow[]>> {
  return emitSceneAck<PortraitWantedRow[]>('portrait:want', undefined);
}

export function setPortraitGmOnly(
  assetId: string,
  gmOnly: boolean,
): Promise<SocketAck<PortraitAssetView>> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve({ ok: false, error: 'OFFLINE' });
      return;
    }
    socket.emit('portrait:visibility', { assetId, gmOnly }, (ack: SocketAck<PortraitAssetView>) =>
      resolve(ack),
    );
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

/** GM: „Zakupy z katalogu: wszędzie / tylko u handlarzy” (etap 46a). */
export function setCatalogShopping(
  mode: CatalogShopping,
): Promise<SocketAck<CatalogShoppingPayload>> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve({ ok: false, error: 'OFFLINE' });
      return;
    }
    socket.emit('campaign:catalog-shopping', { mode }, (ack: SocketAck<CatalogShoppingPayload>) =>
      resolve(ack),
    );
  });
}

/** GM: one entry's availability in this campaign; `null` = back to automatic. */
export function setShopEntryTier(
  entryId: string,
  tier: number | null,
): Promise<SocketAck<{ entryId: string; tier: number | null }>> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve({ ok: false, error: 'OFFLINE' });
      return;
    }
    socket.emit(
      'shop:entry-tier',
      { entryId, tier },
      (ack: SocketAck<{ entryId: string; tier: number | null }>) => resolve(ack),
    );
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
