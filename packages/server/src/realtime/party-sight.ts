import type { ScenePartySightPayload, SceneUpdateBroadcast, SceneView } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import { RealtimeError, defineEvent } from './registry.js';
import { requireCampaignScene, toSceneView } from './scenes.js';
import { campaignRoom, sceneRoom } from './state.js';
import { emitSceneTokensToPlayers } from './tokens.js';
import { emitVisionToPlayers } from './vision.js';
import { emitExploration } from './exploration.js';

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/**
 * „Gracze dzielą się widokiem” (30.10.2026, zlecenie MG) — przełącznik sceny
 * w oknie jej edycji, domyślnie wyłączony.
 *
 * Wyłączony: każdy gracz patrzy tylko oczami własnych figur i pamięta tylko to,
 * co sam zobaczył, bo przy „oczach drużyny” z etapu 45 drużyna zostawiała
 * zwiedzanie mapy jednemu graczowi. Własne zdarzenie, a nie pole łaty sceny,
 * z powodu, dla którego mają je `scene:lighting` i `scene:visibility`:
 * przełączenie zabiera graczom figury kolegów i kawałki mapy, więc w tym samym
 * kroku trzeba przeliczyć każdemu wzrok, listę figur i pamięć mapy.
 */
export const scenePartySightEvent = defineEvent<ScenePartySightPayload, SceneView>({
  name: 'scene:party-sight',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    if (typeof payload?.partySight !== 'boolean') throw new RealtimeError('BAD_REQUEST');
    if (scene.partySight === payload.partySight) return toSceneView(scene);

    const updated = await deps.ctx.prisma.scene.update({
      where: { id: scene.id },
      data: { partySight: payload.partySight },
    });
    const view = toSceneView(updated);
    if (updated.active) {
      const room = campaignRoom(campaignId);
      deps.io.to(room).emit('scene:update', {
        seq: deps.seqs.next(room),
        scene: view,
      } satisfies SceneUpdateBroadcast);
    } else {
      deps.io
        .to(sceneRoom(updated.id))
        .emit('scene:update', { scene: view } satisfies SceneUpdateBroadcast);
    }
    // Lista figur niesie rozstrzygnięte `partyVision`, więc jedzie także na
    // scenie bez ścian i mgły — klient rysuje według niej okienka w mgle.
    await emitVisionToPlayers(deps, campaignId, updated);
    await emitSceneTokensToPlayers(deps, campaignId, updated);
    await emitExploration(deps, campaignId, updated);
    return view;
  },
});
