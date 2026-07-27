import type {
  RulerBroadcast,
  RulerClearBroadcast,
  RulerClearPayload,
  RulerUpdatePayload,
} from '@vtt/shared';
import { ROLE_GM, sanitizeRulerPoints } from '@vtt/shared';
import { RealtimeError, defineEvent } from './registry.js';
import { requireCampaignScene } from './scenes.js';
import { sceneRoom } from './state.js';

/**
 * The shared ruler (stage 16) — core VTT, no game system involved.
 *
 * A measurement is pure presentation: it is never stored, never sequenced and
 * never replayed on a resync, exactly like the intermediate positions of a
 * token drag. It goes to the scene room, so only people actually looking at
 * that map see it.
 *
 * The GM may measure privately (`private: true`): the line then goes nowhere,
 * because measuring the distance to a hidden token would draw a line straight
 * to it on the players' screens.
 */

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

export const rulerUpdateEvent = defineEvent<RulerUpdatePayload, void>({
  name: 'ruler:update',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    // Measuring on a map you are not looking at makes no sense and would let a
    // player draw on a scene the GM is preparing.
    if (socket.data.viewedSceneId !== scene.id) throw new RealtimeError('SCENE_NOT_VIEWED');

    const points = sanitizeRulerPoints(payload?.points);
    if (!points) throw new RealtimeError('BAD_REQUEST');
    if (payload?.private === true && user.role === ROLE_GM) return;

    const broadcast: RulerBroadcast = {
      sceneId: scene.id,
      userId: user.id,
      userName: user.name,
      points,
    };
    // `socket.to` skips the sender: the measurer already draws its own line
    // locally at pointer speed and must not be pulled back by its own echo.
    socket.to(sceneRoom(scene.id)).emit('ruler:update', broadcast);
  },
});

export const rulerClearEvent = defineEvent<RulerClearPayload, void>({
  name: 'ruler:clear',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    const broadcast: RulerClearBroadcast = { sceneId: scene.id, userId: user.id };
    socket.to(sceneRoom(scene.id)).emit('ruler:clear', broadcast);
  },
});
