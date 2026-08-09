import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import type { CampaignSummary, SessionUser } from '@vtt/shared';
import { ROLE_GM, createServerHello } from '@vtt/shared';
import type { AppContext } from '../context.js';
import type { PrismaClient } from '../db.js';
import { SESSION_COOKIE, resolveSessionUser } from '../auth/sessions.js';
import { getActiveCampaign } from '../routes/helpers.js';
import { defineEvent, registerEvents, type RealtimeDeps, type RealtimeEvent } from './registry.js';
import { RoomSequences, campaignRoom, gmRoom } from './state.js';
import { broadcastPresence } from './presence.js';
import { chatHistoryEvent, chatSendEvent } from './chat.js';
import {
  joinInitialScene,
  sceneActivateEvent,
  sceneCreateEvent,
  sceneDeleteEvent,
  sceneUpdateEvent,
  sceneViewEvent,
} from './scenes.js';
import { tokenCreateEvent, tokenDeleteEvent, tokenMoveEvent, tokenUpdateEvent } from './tokens.js';
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
import { tokenEffectEvent } from './turn-effects.js';
import { effectExpireEvent } from './timed-effects.js';
import { characterCreateEvent, characterDeleteEvent, characterUpdateEvent } from './characters.js';
import { characterRollEvent } from './character-rolls.js';
import { characterCyberwareEvent } from './cyberware.js';
import {
  economyAdjustEvent,
  economyBuyEvent,
  economyHistoryEvent,
  economySettleEvent,
  economyTransferEvent,
} from './economy.js';
import { damageApplyEvent, damageUndoEvent } from './damage.js';
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
  lightCreateEvent,
  lightDeleteEvent,
  lightUpdateEvent,
  sceneLightingEvent,
  tokenLightToggleEvent,
} from './lights.js';
import { explorationForgetEvent, sceneExploreEvent } from './exploration.js';
import { drawingClearEvent, drawingCreateEvent, drawingDeleteEvent } from './drawings.js';
import { noteCreateEvent, noteDeleteEvent, noteUpdateEvent } from './notes.js';
import { compendiumDeleteEvent, compendiumUpsertEvent } from './compendium.js';
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
  journalDeleteEvent,
  journalListEvent,
  journalReindexEvent,
  journalSummarizeEvent,
  journalUpsertEvent,
} from './journal.js';
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
  stateRequestEvent,
  chatSendEvent,
  chatHistoryEvent,
  sceneCreateEvent,
  sceneUpdateEvent,
  sceneDeleteEvent,
  sceneActivateEvent,
  sceneViewEvent,
  tokenCreateEvent,
  tokenUpdateEvent,
  tokenDeleteEvent,
  tokenMoveEvent,
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
  tokenEffectEvent,
  effectExpireEvent,
  compendiumUpsertEvent,
  compendiumDeleteEvent,
  characterCreateEvent,
  characterUpdateEvent,
  characterDeleteEvent,
  characterRollEvent,
  characterCyberwareEvent,
  economyBuyEvent,
  economyTransferEvent,
  economyAdjustEvent,
  economySettleEvent,
  economyHistoryEvent,
  damageApplyEvent,
  damageUndoEvent,
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
  lightCreateEvent,
  lightUpdateEvent,
  lightDeleteEvent,
  tokenLightToggleEvent,
  sceneLightingEvent,
  sceneExploreEvent,
  explorationForgetEvent,
  drawingCreateEvent,
  drawingDeleteEvent,
  drawingClearEvent,
  noteCreateEvent,
  noteUpdateEvent,
  noteDeleteEvent,
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
  journalListEvent,
  journalUpsertEvent,
  journalDeleteEvent,
  journalReindexEvent,
  journalSummarizeEvent,
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

/**
 * The campaign a user's socket should join: the active campaign for the GM,
 * and for a player — only if they are a member of it.
 */
async function resolveSocketCampaign(
  prisma: PrismaClient,
  user: SessionUser,
): Promise<CampaignSummary | null> {
  const campaign = await getActiveCampaign(prisma);
  if (!campaign) return null;
  if (user.role === ROLE_GM) return campaign;
  const membership = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId: campaign.id, userId: user.id } },
  });
  return membership ? campaign : null;
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
