import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import type { CampaignSummary, SessionUser } from '@vtt/shared';
import { ROLE_GM, createServerHello } from '@vtt/shared';
import type { AppContext } from '../context.js';
import { SESSION_COOKIE, resolveSession } from '../auth/sessions.js';
import { SocketRateLimiter } from '../rate-limit.js';
import { armSessionExpiry, sessionRoom } from './session-guard.js';
import { registerEvents, type RealtimeDeps, type RealtimeEvent } from './registry.js';
import { RoomSequences, campaignRoom, gmRoom } from './state.js';
import { broadcastPresence } from './presence.js';
import { releaseSocketAim, tokenAimEvent } from './aim.js';
import { campaignActivateEvent, resolveSocketCampaign } from './campaigns.js';
import { chatHistoryEvent, chatSendEvent } from './chat.js';
import { diceSkinEvent } from './dice-skins.js';
import {
  joinInitialScene,
  sceneActivateEvent,
  sceneCreateEvent,
  sceneDeleteEvent,
  sceneUpdateEvent,
  sceneViewEvent,
} from './scenes.js';
import {
  tokenAssetDeleteEvent,
  tokenCreateEvent,
  tokenDeleteEvent,
  tokenDuplicateEvent,
  tokenFacingEvent,
  tokenFearedEvent,
  tokenMoveEvent,
  tokenStatEvent,
  tokenUpdateEvent,
} from './tokens.js';
import {
  combatAddEvent,
  combatOrderEvent,
  combatRerollTieEvent,
  combatRollAllEvent,
  combatRollEvent,
  combatSetInitiativeEvent,
  combatStartEvent,
} from './combat.js';
import {
  combatActionEvent,
  combatAllowEvent,
  combatEndEvent,
  combatHoldEvent,
  combatHoldReleaseEvent,
  combatNextEvent,
  combatPreviousEvent,
  combatRemoveEvent,
  combatResetTurnEvent,
  combatTerrainEvent,
} from './combat-actions.js';
import { grappleActionEvent, grappleAttemptEvent, grappleResistEvent } from './grapple.js';
import {
  facedownAttemptEvent,
  facedownConcedeEvent,
  facedownResistEvent,
  reputationRecogniseEvent,
} from './facedown.js';
import { tokenEffectEvent } from './turn-effects.js';
import { effectExpireEvent } from './timed-effects.js';
import {
  characterBackupCallEvent,
  characterCombatAwarenessEvent,
  characterFieldRepairEvent,
  characterCreateEvent,
  characterDeleteEvent,
  characterPlayReadyEvent,
  characterUpdateEvent,
} from './characters.js';
import {
  creationBuyEvent,
  creationDiscardEvent,
  creationFinishEvent,
  creationLifepathCountEvent,
  creationLifepathRollEvent,
  creationPatchEvent,
  creationAcceptRulesEvent,
  creationDiscardPlayerEvent,
  creationPermitEvent,
  creationPermitStateEvent,
  creationPermitsEvent,
  creationRequestEvent,
  creationRerollEvent,
  creationTermsEvent,
  creationRollEvent,
  creationStartEvent,
  creationRanksEvent,
  creationPeekEvent,
  creationSetRankEvent,
} from './creation.js';
import { characterRollEvent } from './character-rolls.js';
import {
  characterCraftPharmaEvent,
  characterRestEvent,
  characterUseDoseEvent,
} from './recovery.js';
import {
  checkCallEvent,
  checkCancelEvent,
  checkRequestCancelEvent,
  checkRequestEvent,
  checkRequestResolveEvent,
} from './checks.js';
import {
  inventoryGiveEvent,
  inventoryRespondEvent,
  inventorySourcesEvent,
  inventoryTakeEvent,
} from './inventory.js';
import {
  tradeAcceptEvent,
  tradeCancelEvent,
  tradeInviteEvent,
  tradeListEvent,
  tradeOfferEvent,
  tradePartnersEvent,
  tradeRespondEvent,
} from './trade.js';
import { characterCyberwareEvent } from './cyberware.js';
import { cyberwareRequestEvent, cyberwareRespondEvent, cyberwareSurgeonsEvent } from './surgery.js';
import {
  economyAdjustEvent,
  economyBuyEvent,
  economyHistoryEvent,
  economySettleEvent,
  economyTransferEvent,
} from './economy.js';
import { characterInjuryEvent, damageApplyEvent, damageUndoEvent } from './damage.js';
import { characterStatEffectEvent } from './stat-effects.js';
import {
  attackEvadeEvent,
  attackNoEvadeEvent,
  attackRollEvent,
  attackSmartEvent,
  weaponAttachmentEvent,
  weaponClearJamEvent,
  weaponDrawEvent,
  weaponReloadEvent,
} from './attacks.js';
import { sightingLookEvent } from './sighting.js';
import { rulerClearEvent, rulerUpdateEvent } from './ruler.js';
import { mapPingEvent } from './ping.js';
import { fogPaintEvent, fogResetEvent, fogUndoEvent, sceneVisibilityEvent } from './fog.js';
import {
  openingToggleEvent,
  wallClearEvent,
  wallCreateEvent,
  wallDeleteEvent,
  wallUpdateEvent,
} from './walls.js';
import { coverClearEvent, coverCreateEvent, coverDeleteEvent, coverUpdateEvent } from './covers.js';
import { smokeClearEvent } from './smoke.js';
import {
  zoneClearEvent,
  zoneCreateEvent,
  zoneDeleteEvent,
  zoneFireEvent,
  zoneUpdateEvent,
} from './zones.js';
import { backupResolveEvent } from './backup.js';
import { characterTeamHireEvent, characterTeamLoyaltyEvent } from './team.js';
import { characterHaggleEvent } from './haggle.js';
import {
  characterAdvanceEvent,
  characterRoleChangeEvent,
  characterXpAwardEvent,
  characterXpHistoryEvent,
} from './advancement.js';
import {
  lightClearEvent,
  lightCreateEvent,
  lightDeleteEvent,
  lightUpdateEvent,
  sceneLightingEvent,
  tokenLightToggleEvent,
} from './lights.js';
import { explorationForgetEvent, sceneExploreEvent } from './exploration.js';
import {
  drawingClearEvent,
  drawingCreateEvent,
  drawingDeleteEvent,
  drawingUpdateEvent,
} from './drawings.js';
import { noteCreateEvent, noteDeleteEvent, noteUpdateEvent } from './notes.js';
import { sceneUndoEvent } from './scene-undo.js';
import { compendiumDeleteEvent, compendiumUpsertEvent } from './compendium.js';
import {
  portraitCropEvent,
  portraitVisibilityEvent,
  portraitWantEvent,
  portraitWantedEvent,
} from './portraits.js';
import { shopEntryTierEvent, shopTierEvent } from './shop.js';
import {
  tableDeleteEvent,
  tableListEvent,
  tableRollEvent,
  tableShowEvent,
  tableUpsertEvent,
} from './tables.js';
import { timeSetEvent } from './gametime.js';
import { botCreateEvent, botDeleteEvent, botDuplicateEvent, botUpdateEvent } from './bots.js';
import { botChatEvent, botTeachEvent } from './bot-chat.js';
import { botSayEvent, botStopEvent } from './bot-turns.js';
import { botActEvent, botProposalResolveEvent } from './bot-actions.js';
import { botPlayTurnEvent } from './bot-combat.js';
import { aiAskEvent, aiRefreshEvent, broadcastAiStatus, sendAiStatus } from './ai.js';
import { rulesAskEvent, rulesIndexEvent, rulesStatusEvent } from './rules.js';
import {
  knowledgeDeleteEvent,
  knowledgeListEvent,
  knowledgePreviewEvent,
  knowledgeReindexEvent,
  knowledgeUpsertEvent,
} from './knowledge.js';
import {
  netArchitectureDeleteEvent,
  netArchitectureGetEvent,
  netArchitectureListEvent,
  netArchitectureRollEvent,
  netArchitectureSaveEvent,
} from './netrunning.js';
import {
  netPointClearEvent,
  netPointPlaceEvent,
  netPointRemoveEvent,
  netPointUpdateEvent,
  netRunAbilityEvent,
  netRunCopyEvent,
  netRunLeaveEvent,
  netRunMoveEvent,
  netRunStartEvent,
  netScanEvent,
} from './netrun.js';
import {
  netAttackEvent,
  netGlueClearEvent,
  netIceDetectEvent,
  netIceTurnEvent,
  netProgramEvent,
  netSlideEvent,
} from './netcombat.js';
import { netDeviceEvent } from './netdevices.js';
import { netDemonDetectEvent, netDemonTurnEvent } from './netdemons.js';
import {
  journalDeleteEvent,
  journalListEvent,
  journalReindexEvent,
  journalSummarizeEvent,
  journalUpsertEvent,
} from './journal.js';
import {
  handoutDeleteEvent,
  handoutListEvent,
  handoutShareEvent,
  handoutUpsertEvent,
} from './handouts.js';
import { screamsheetGenerateEvent } from './screamsheets.js';
import { relationDeleteEvent, relationListEvent, relationSetEvent } from './relations.js';
import {
  archiveCharacterImportEvent,
  archiveListEvent,
  archiveSceneImportEvent,
  archiveSnapshotEvent,
} from './archive.js';
import { sendStateSync, stateRequestEvent } from './sync.js';
import { musicControlEvent, musicStateEvent } from './music.js';

declare module 'socket.io' {
  interface SocketData {
    user: SessionUser;
    /** Session that opened this socket — logout disconnects its room (#11). */
    sessionId: string;
    /** Epoch ms after which the session (and this socket) is over (#11). */
    sessionExpiresAt: number;
    /** Active campaign this socket belongs to (room joined); null when none. */
    campaign: CampaignSummary | null;
    /** Scene this socket currently views (scene room joined); null when none. */
    viewedSceneId: string | null;
  }
}

/**
 * Every event a socket can emit. Exported for the E2E role matrix
 * (`packages/e2e`, `testy.md` 6.2): the test reads this list rather than a copy,
 * so an event added later is probed without anyone editing the test.
 */
export const EVENTS: RealtimeEvent<never, unknown>[] = [
  musicControlEvent,
  musicStateEvent,
  archiveListEvent,
  archiveSnapshotEvent,
  archiveCharacterImportEvent,
  archiveSceneImportEvent,
  campaignActivateEvent,
  stateRequestEvent,
  chatSendEvent,
  chatHistoryEvent,
  diceSkinEvent,
  sceneCreateEvent,
  sceneUpdateEvent,
  sceneDeleteEvent,
  sceneActivateEvent,
  sceneViewEvent,
  tokenCreateEvent,
  tokenStatEvent,
  tokenUpdateEvent,
  tokenDeleteEvent,
  tokenDuplicateEvent,
  tokenAssetDeleteEvent,
  tokenMoveEvent,
  tokenFacingEvent,
  tokenAimEvent,
  tokenFearedEvent,
  combatStartEvent,
  combatAddEvent,
  combatRemoveEvent,
  combatRollAllEvent,
  combatRerollTieEvent,
  combatRollEvent,
  combatSetInitiativeEvent,
  combatOrderEvent,
  combatNextEvent,
  combatPreviousEvent,
  combatEndEvent,
  combatActionEvent,
  combatAllowEvent,
  combatHoldEvent,
  combatHoldReleaseEvent,
  combatResetTurnEvent,
  combatTerrainEvent,
  grappleAttemptEvent,
  grappleResistEvent,
  grappleActionEvent,
  facedownAttemptEvent,
  facedownResistEvent,
  facedownConcedeEvent,
  reputationRecogniseEvent,
  tokenEffectEvent,
  effectExpireEvent,
  compendiumUpsertEvent,
  compendiumDeleteEvent,
  portraitCropEvent,
  portraitVisibilityEvent,
  portraitWantEvent,
  portraitWantedEvent,
  shopTierEvent,
  shopEntryTierEvent,
  timeSetEvent,
  tableListEvent,
  tableUpsertEvent,
  tableDeleteEvent,
  tableRollEvent,
  tableShowEvent,
  characterCreateEvent,
  characterUpdateEvent,
  characterBackupCallEvent,
  backupResolveEvent,
  characterTeamHireEvent,
  characterTeamLoyaltyEvent,
  characterHaggleEvent,
  characterCombatAwarenessEvent,
  characterFieldRepairEvent,
  characterDeleteEvent,
  characterPlayReadyEvent,
  creationStartEvent,
  creationRanksEvent,
  creationPeekEvent,
  creationSetRankEvent,
  creationPatchEvent,
  creationAcceptRulesEvent,
  creationDiscardPlayerEvent,
  creationPermitEvent,
  creationPermitStateEvent,
  creationPermitsEvent,
  creationRequestEvent,
  creationRerollEvent,
  creationTermsEvent,
  creationRollEvent,
  creationLifepathRollEvent,
  creationLifepathCountEvent,
  creationBuyEvent,
  creationFinishEvent,
  creationDiscardEvent,
  characterRollEvent,
  characterRestEvent,
  characterCraftPharmaEvent,
  characterUseDoseEvent,
  checkCallEvent,
  checkCancelEvent,
  checkRequestEvent,
  checkRequestCancelEvent,
  checkRequestResolveEvent,
  inventorySourcesEvent,
  inventoryGiveEvent,
  inventoryTakeEvent,
  inventoryRespondEvent,
  tradePartnersEvent,
  tradeInviteEvent,
  tradeRespondEvent,
  tradeOfferEvent,
  tradeAcceptEvent,
  tradeCancelEvent,
  tradeListEvent,
  characterCyberwareEvent,
  cyberwareSurgeonsEvent,
  cyberwareRequestEvent,
  cyberwareRespondEvent,
  economyBuyEvent,
  economyTransferEvent,
  economyAdjustEvent,
  economySettleEvent,
  economyHistoryEvent,
  characterAdvanceEvent,
  characterRoleChangeEvent,
  characterXpAwardEvent,
  characterXpHistoryEvent,
  damageApplyEvent,
  damageUndoEvent,
  characterInjuryEvent,
  characterStatEffectEvent,
  attackRollEvent,
  attackEvadeEvent,
  attackNoEvadeEvent,
  attackSmartEvent,
  weaponAttachmentEvent,
  weaponClearJamEvent,
  weaponDrawEvent,
  weaponReloadEvent,
  sightingLookEvent,
  rulerUpdateEvent,
  mapPingEvent,
  rulerClearEvent,
  fogPaintEvent,
  fogResetEvent,
  fogUndoEvent,
  sceneVisibilityEvent,
  wallCreateEvent,
  wallUpdateEvent,
  wallDeleteEvent,
  wallClearEvent,
  openingToggleEvent,
  coverCreateEvent,
  coverUpdateEvent,
  coverDeleteEvent,
  coverClearEvent,
  smokeClearEvent,
  zoneCreateEvent,
  zoneUpdateEvent,
  zoneDeleteEvent,
  zoneClearEvent,
  zoneFireEvent,
  lightCreateEvent,
  lightUpdateEvent,
  lightDeleteEvent,
  lightClearEvent,
  tokenLightToggleEvent,
  sceneLightingEvent,
  sceneExploreEvent,
  explorationForgetEvent,
  drawingCreateEvent,
  drawingUpdateEvent,
  drawingDeleteEvent,
  drawingClearEvent,
  noteCreateEvent,
  noteUpdateEvent,
  noteDeleteEvent,
  sceneUndoEvent,
  aiAskEvent,
  aiRefreshEvent,
  rulesAskEvent,
  rulesIndexEvent,
  rulesStatusEvent,
  knowledgeListEvent,
  knowledgeUpsertEvent,
  knowledgeDeleteEvent,
  knowledgeReindexEvent,
  knowledgePreviewEvent,
  netArchitectureListEvent,
  netArchitectureGetEvent,
  netArchitectureSaveEvent,
  netArchitectureDeleteEvent,
  netArchitectureRollEvent,
  netPointPlaceEvent,
  netPointUpdateEvent,
  netPointRemoveEvent,
  netPointClearEvent,
  netRunStartEvent,
  netRunLeaveEvent,
  netRunMoveEvent,
  netRunCopyEvent,
  netRunAbilityEvent,
  netScanEvent,
  netProgramEvent,
  netAttackEvent,
  netSlideEvent,
  netIceDetectEvent,
  netIceTurnEvent,
  netGlueClearEvent,
  netDeviceEvent,
  netDemonDetectEvent,
  netDemonTurnEvent,
  journalListEvent,
  journalUpsertEvent,
  journalDeleteEvent,
  journalReindexEvent,
  journalSummarizeEvent,
  handoutListEvent,
  handoutUpsertEvent,
  handoutDeleteEvent,
  handoutShareEvent,
  screamsheetGenerateEvent,
  relationListEvent,
  relationSetEvent,
  relationDeleteEvent,
  botCreateEvent,
  botUpdateEvent,
  botDeleteEvent,
  botDuplicateEvent,
  botChatEvent,
  botTeachEvent,
  botSayEvent,
  botStopEvent,
  botActEvent,
  botProposalResolveEvent,
  botPlayTurnEvent,
] as RealtimeEvent<never, unknown>[];

async function authenticateHandshake(
  app: FastifyInstance,
  ctx: AppContext,
  cookieHeader: string | undefined,
): Promise<{ user: SessionUser; sessionId: string; expiresAt: Date } | null> {
  if (!cookieHeader) return null;
  const cookies = app.parseCookie(cookieHeader);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = app.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  const session = await resolveSession(ctx.prisma, unsigned.value);
  return session ? { ...session, sessionId: unsigned.value } : null;
}

export function setupRealtime(io: SocketIOServer, app: FastifyInstance, ctx: AppContext): void {
  const deps: RealtimeDeps = {
    io,
    log: app.log,
    ctx,
    seqs: new RoomSequences(),
    ...(ctx.config.rateLimits ? { rateLimiter: new SocketRateLimiter() } : {}),
  };

  // Gateway coming back or going down flips bot availability for everyone.
  ctx.ai.onStatusChange((status) => {
    broadcastAiStatus(deps, status);
  });

  io.use((socket, next) => {
    authenticateHandshake(app, ctx, socket.handshake.headers.cookie)
      .then((session) => {
        if (!session) {
          next(new Error('UNAUTHORIZED'));
          return;
        }
        socket.data.user = session.user;
        socket.data.sessionId = session.sessionId;
        socket.data.sessionExpiresAt = session.expiresAt.getTime();
        next();
      })
      .catch(() => next(new Error('UNAUTHORIZED')));
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    app.log.info({ socketId: socket.id, userId: user.id, role: user.role }, 'socket connected');
    // „Ostatnie wejście” w panelu właściciela (44a) — sesja żyje rok, więc samo
    // logowanie mówiłoby o tym niewiele.
    void ctx.prisma.user
      .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);

    socket.emit('server:hello', createServerHello());
    // #11: gniazdo żyje tyle, co jego sesja — wylogowanie rozłącza pokój sesji,
    // a wygaśnięcie — zegar.
    void socket.join(sessionRoom(socket.data.sessionId));
    armSessionExpiry(socket);
    registerEvents(deps, socket, EVENTS);
    sendAiStatus(deps, socket);

    void (async () => {
      try {
        const campaign = await resolveSocketCampaign(ctx.prisma, user);
        socket.data.campaign = campaign;
        socket.data.viewedSceneId = null;
        if (campaign) {
          await socket.join(campaignRoom(campaign.id));
          if (user.role === ROLE_GM) await socket.join(gmRoom(campaign.id));
          await joinInitialScene(deps, socket, campaign.id);
          await broadcastPresence(deps, campaign.id);
        }
        await sendStateSync(deps, socket, user);
      } catch (error) {
        app.log.error({ err: error, socketId: socket.id }, 'socket room setup failed');
      }
    })();

    socket.on('disconnect', (reason) => {
      app.log.info({ socketId: socket.id, reason }, 'socket disconnected');
      // Grot zostałby u reszty stołu obrócony na zawsze (`token:aim`).
      releaseSocketAim(deps, socket.id);
      const campaign = socket.data.campaign;
      if (campaign) {
        // The socket already left its rooms — recompute presence for the rest.
        void broadcastPresence(deps, campaign.id).catch((error: unknown) => {
          app.log.error({ err: error }, 'presence broadcast after disconnect failed');
        });
      }
    });
  });
}
