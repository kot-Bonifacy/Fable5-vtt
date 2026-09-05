import type { MapPingBroadcast, MapPingPayload } from '@vtt/shared';
import { ROLE_GM, sanitizePingPoint } from '@vtt/shared';
import { RealtimeError, defineEvent } from './registry.js';
import { requireCampaignScene } from './scenes.js';
import { sceneRoom } from './state.js';

/**
 * Ping na mapie (etap 35) — rdzeń VTT, bez udziału systemu gry.
 *
 * Zbudowany na `ruler.ts` co do joty, bo ma dokładnie te same własności: nie
 * zapisuje się w bazie, nie dostaje `seq`, nie wraca przy resynchronizacji i nie
 * zostawia po sobie wiersza czatu. Ping jest czymś, co się **stało**; kto nie
 * patrzył, ten nie zobaczył.
 *
 * Zastępuje **atrapę** `gm:ping` z etapu 03 (`handler: () => undefined`), która
 * przez trzydzieści dwa etapy miała nazwę i nie miała treści. Nowe zdarzenie nie
 * jest jej następcą także w drugim sensie: **pinguje każdy**, nie tylko MG.
 * „Patrzcie na te drzwi" jest zdaniem gracza równie często, co prowadzącego.
 */

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

export const mapPingEvent = defineEvent<MapPingPayload, void>({
  name: 'map:ping',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    // Pingować wolno wyłącznie na mapie, na którą się patrzy — ta sama bramka,
    // co przy linijce, i z tego samego powodu: gracz nie rysuje po scenie, którą
    // MG dopiero przygotowuje.
    if (socket.data.viewedSceneId !== scene.id) throw new RealtimeError('SCENE_NOT_VIEWED');

    const point = sanitizePingPoint(payload?.x, payload?.y);
    if (!point) throw new RealtimeError('BAD_REQUEST');

    const broadcast: MapPingBroadcast = {
      sceneId: scene.id,
      userId: user.id,
      userName: user.name,
      x: point.x,
      y: point.y,
      // Przyciągnięcie widoku zabiera oglądającemu kontrolę nad tym, na co
      // patrzy — to uprawnienie prowadzącego. Gracz, który poprosi o `pull`,
      // dostaje zwykły ping zamiast odmowy: gest ma zadziałać, a nie się wywalić.
      pull: payload?.pull === true && user.role === ROLE_GM,
    };
    // `socket.to` pomija nadawcę: pingujący rysuje kółko u siebie od razu, tak
    // samo jak mierzący rysuje swoją linijkę, i echo tylko by je zdublowało.
    socket.to(sceneRoom(scene.id)).emit('map:ping', broadcast);
  },
});
