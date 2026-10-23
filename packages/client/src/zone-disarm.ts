import type { DefenseZoneView, SceneView, TokenView } from '@vtt/shared';
import { CPRED_MELEE_REACH_M, distanceToRect, metresPerPixel, tokenCentre } from '@vtt/shared';
import { disarmZone, zoneDisarmErrorText } from './socket.js';
import { notifyInfo, notifyRefusal } from './notices.js';
import { takeCallCup } from './call-cup.js';

/**
 * Rozbrajanie pułapki przez gracza (etap 58b).
 *
 * Gracz ma w `zoneStore` wyłącznie strefy, które widzi (jawne albo przez
 * siebie zauważone), więc nie ma czego tu filtrować pod kątem tajemnicy —
 * zostaje zasięg ręki od krawędzi, ta sama miara co na serwerze. Czy system
 * w ogóle da się rozbroić i czy postać już próbowała, mówi dopiero serwer:
 * graczowi nie wolno wiedzieć, czy MG nie rozbroił go wcześniej (etap 51).
 */
export function zonesWithinReach(
  token: Pick<TokenView, 'x' | 'y' | 'size'>,
  zones: readonly DefenseZoneView[],
  scene: Pick<SceneView, 'grid' | 'metersPerSquare'> | null,
): DefenseZoneView[] {
  if (!scene) return [];
  const perPixel = metresPerPixel(scene);
  if (perPixel <= 0) return [];
  const centre = tokenCentre(token, scene);
  return zones.filter(
    (zone) => distanceToRect(centre, zone) * perPixel <= CPRED_MELEE_REACH_M + 1e-6,
  );
}

/** „Rozbrój” z menu figury: wezwanie do Testu i od razu kubek. */
export async function startDisarm(zone: DefenseZoneView, characterId: string): Promise<void> {
  const ack = await disarmZone(zone.id, characterId);
  if (!ack.ok || !ack.data) {
    notifyRefusal('check', zoneDisarmErrorText(ack.ok ? 'BAD_REQUEST' : ack.error));
    return;
  }
  notifyInfo('Test Elektroniki i zabezpieczeń — rzuć kubkiem. Wezwanie czeka też na czacie.', {
    title: `Rozbrajanie: ${zone.name}`,
    topic: 'check',
  });
  takeCallCup(ack.data.callMessageId);
}
