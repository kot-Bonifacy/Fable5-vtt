import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import type { CampaignSummary, SessionUser } from '@vtt/shared';
import { ROLE_GM, createServerHello } from '@vtt/shared';
import type { AppContext } from '../context.js';
import { SESSION_COOKIE, resolveSessionUser } from '../auth/sessions.js';
import { defineEvent, registerEvents, type RealtimeDeps, type RealtimeEvent } from './registry.js';
import { RoomSequences, campaignRoom, gmRoom } from './state.js';
import { broadcastPresence } from './presence.js';
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
  tokenFacingEvent,
  tokenFearedEvent,
  tokenMoveEvent,
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
import { characterCreateEvent, characterDeleteEvent, characterUpdateEvent } from './characters.js';
import {
  creationBuyEvent,
  creationDiscardEvent,
  creationFinishEvent,
  creationLifepathCountEvent,
  creationLifepathRollEvent,
  creationPatchEvent,
  creationRollEvent,
  creationStartEvent,
} from './creation.js';
import { characterRollEvent } from './character-rolls.js';
import { characterCyberwareEvent } from './cyberware.js';
import {
  economyAdjustEvent,
  economyBuyEvent,
  economyHistoryEvent,
  economySettleEvent,
  economyTransferEvent,
} from './economy.js';
import { characterInjuryEvent, damageApplyEvent, damageUndoEvent } from './damage.js';
import {
  attackEvadeEvent,
  attackRollEvent,
  attackSmartEvent,
  weaponReloadEvent,
} from './attacks.js';
import { rulerClearEvent, rulerUpdateEvent } from './ruler.js';
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
import { shopTierEvent } from './shop.js';
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
import { sendStateSync, stateRequestEvent } from './sync.js';

declare module 'socket.io' {
  interface SocketData {
    user: SessionUser;
    /** Active campaign this socket belongs to (room joined); null when none. */
    campaign: CampaignSummary | null;
    /** Scene this socket currently views (scene room joined); null when none. */
    viewedSceneId: string | null;
  }
}

// Placeholder GM-only event: establishes the role-guard pattern (and is
// covered by tests) until real GM actions arrive in stages 04+.
const gmPingEvent = defineEvent({
  name: 'gm:ping',
  role: ROLE_GM,
  handler: () => undefined,
});

const EVENTS: RealtimeEvent<never, unknown>[] = [
  gmPingEvent,
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
  tokenUpdateEvent,
  tokenDeleteEvent,
  tokenAssetDeleteEvent,
  tokenMoveEvent,
  tokenFacingEvent,
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
  shopTierEvent,
  characterCreateEvent,
  characterUpdateEvent,
  characterDeleteEvent,
  creationStartEvent,
  creationPatchEvent,
  creationRollEvent,
  creationLifepathRollEvent,
  creationLifepathCountEvent,
  creationBuyEvent,
  creationFinishEvent,
  creationDiscardEvent,
  characterRollEvent,
  characterCyberwareEvent,
  economyBuyEvent,
  economyTransferEvent,
  economyAdjustEvent,
  economySettleEvent,
  economyHistoryEvent,
  damageApplyEvent,
  damageUndoEvent,
  characterInjuryEvent,
  attackRollEvent,
  attackEvadeEvent,
  attackSmartEvent,
  weaponReloadEvent,
  rulerUpdateEvent,
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
): Promise<SessionUser | null> {
  if (!cookieHeader) return null;
  const cookies = app.parseCookie(cookieHeader);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = app.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  return resolveSessionUser(ctx.prisma, unsigned.value);
}

export function setupRealtime(io: SocketIOServer, app: FastifyInstance, ctx: AppContext): void {
  const deps: RealtimeDeps = { io, log: app.log, ctx, seqs: new RoomSequences() };

  // Gateway coming back or going down flips bot availability for everyone.
  ctx.ai.onStatusChange((status) => {
    broadcastAiStatus(deps, status);
  });

  io.use((socket, next) => {
    authenticateHandshake(app, ctx, socket.handshake.headers.cookie)
      .then((user) => {
        if (!user) {
          next(new Error('UNAUTHORIZED'));
          return;
        }
        socket.data.user = user;
        next();
      })
      .catch(() => next(new Error('UNAUTHORIZED')));
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    app.log.info({ socketId: socket.id, userId: user.id, role: user.role }, 'socket connected');

    socket.emit('server:hello', createServerHello());
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
