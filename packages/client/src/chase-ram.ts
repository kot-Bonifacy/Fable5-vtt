import {
  chaseBodyHalfExtents,
  chaseFirstContact,
  chaseHitsWithFront,
  chaseObstacleUnbreakable,
  TURN_ONCE_RAM,
  type ChaseObstacleBox,
  type ScenePoint,
  type SceneVehicleView,
} from '@vtt/shared';
import { useChaseStore } from './stores/chaseStore.js';
import { useCombatStore } from './stores/combatStore.js';
import { useSceneStore } from './stores/sceneStore.js';
import { useTokenStore } from './stores/tokenStore.js';

/** W co wjedzie auto — rodzaj decyduje, kto ile bierze (`resolveRam` na serwerze). */
export type ChaseRamStruck = 'vehicle' | 'pedestrian' | 'obstacle' | 'concrete';

/**
 * Jedno zdanie paska „Zderzenie” (zaległość 66c z 04.11): to samo, co policzy
 * `cpredRamOutcome` na serwerze — Pług bojowy przodem zdejmuje szkodę
 * z taranującego, bokiem nie działa, pieszy obrywa sam, beton robi z auta wrak.
 */
export function chaseRamText(struck: ChaseRamStruck, plow: boolean, front: boolean): string {
  const plowed = plow && front;
  switch (struck) {
    case 'concrete':
      return 'Beton nie ustępuje: auto będzie wrakiem, a jadący dostaną Ranę Krytyczną — Pług nie pomoże.';
    case 'pedestrian':
      return 'Pieszy próbuje uskoczyć (ZW + Unik, PT 13); jak nie zdąży, bierze 6k6 i Ranę Krytyczną. Auto nic nie bierze.';
    case 'obstacle':
      return plowed
        ? 'Pług bojowy: przeszkoda bierze 6k6 w PW (pod Nitro +2k6), auto nic.'
        : 'Przeszkoda bierze 6k6 w PW, auto 6k6, a jadący Ranę Krytyczną.';
    case 'vehicle':
      if (plowed) {
        return 'Pług bojowy przodem: uderzone auto bierze 6k6 (pod Nitro +2k6), a jego jadący Ranę Krytyczną. Twoje auto nic nie bierze.';
      }
      return plow
        ? 'Uderzenie nie przodem — Pług nie zadziała: po 6k6 dla obu aut i Rana Krytyczna dla wszystkich jadących.'
        : 'Po 6k6 dla obu aut i Rana Krytyczna dla wszystkich jadących.';
  }
}

/**
 * Kierowca tego auta taranował już w swojej trwającej turze (decyzja MG
 * z 06.11.2026: jeden taran na turę) — pasek „Zderzenie” daje wtedy tylko
 * „Zatrzymaj się przed”. Serwer i tak odmawia drugiego (`RAM_USED`).
 */
export function chaseRamUsedThisTurn(vehicle: SceneVehicleView): boolean {
  const combat = useCombatStore.getState().combat;
  if (!combat || combat.round < 1) return false;
  const tokens = useTokenStore.getState().tokens;
  const driver = Object.values(tokens).find(
    (token) => token.vehicleSeat?.sceneVehicleId === vehicle.id && token.vehicleSeat?.seat === 0,
  );
  if (!driver) return false;
  const row = combat.combatants.find((entry) => entry.tokenId === driver.id);
  if (!row || combat.activeCombatantId !== row.id) return false;
  return row.turn?.onceUsed?.includes(TURN_ONCE_RAM) === true;
}

/**
 * Taranowanie od strony klienta (etap 65d2): ta sama geometria, co na serwerze
 * (`chaseFirstContact`), żeby przed wysłaniem ruchu zapytać „Taranuj?”. Liczy
 * się tylko w walce — poza nią MG ustawia szyk, a auta przechodzą przez siebie.
 * Serwer i tak sprawdza drogę sam: bez `ram` auto staje przed przeszkodą.
 */
export function chaseObstacleAhead(
  vehicle: SceneVehicleView,
  to: ScenePoint,
): { name: string; text: string } | null {
  const scene = useSceneStore.getState().scene;
  if (!scene || !useCombatStore.getState().combat) return null;
  const direction = scene.chase.direction;
  const grid = scene.grid.sizePx;
  const struck = new Map<string, { name: string; kind: ChaseRamStruck }>();
  const boxes: ChaseObstacleBox[] = [];
  for (const other of useChaseStore.getState().vehicles) {
    if (other.id === vehicle.id || other.sceneId !== scene.id) continue;
    if (other.status !== 'racing' && other.status !== 'wrecked') continue;
    boxes.push({
      id: other.id,
      centre: { x: other.x, y: other.y },
      ...chaseBodyHalfExtents(other, direction, grid),
    });
    struck.set(other.id, { name: other.name, kind: 'vehicle' });
  }
  for (const token of Object.values(useTokenStore.getState().tokens)) {
    if (token.sceneId !== scene.id || token.vehicleSeat || token.hidden) continue;
    if (!token.characterId && !token.hp) continue;
    const half = (Math.max(1, token.size) * grid) / 2;
    boxes.push({
      id: token.id,
      centre: { x: token.x + half, y: token.y + half },
      hx: half,
      hy: half,
    });
    struck.set(token.id, { name: token.name, kind: 'pedestrian' });
  }
  // Przeszkody MG (65e) poza kolczatką — po niej się przejeżdża.
  for (const obstacle of useChaseStore.getState().obstacles) {
    if (obstacle.sceneId !== scene.id || obstacle.kind === 'spikes') continue;
    boxes.push({
      id: `obstacle:${obstacle.id}`,
      centre: { x: obstacle.x, y: obstacle.y },
      ...chaseBodyHalfExtents(obstacle, direction, grid),
    });
    struck.set(`obstacle:${obstacle.id}`, {
      name: obstacle.name,
      kind: chaseObstacleUnbreakable(obstacle.kind) ? 'concrete' : 'obstacle',
    });
  }
  const from = { x: vehicle.x, y: vehicle.y };
  const contact = chaseFirstContact(
    from,
    to,
    chaseBodyHalfExtents(vehicle, direction, grid),
    boxes,
  );
  const hit = contact ? struck.get(contact.id) : undefined;
  if (!contact || !hit) return null;
  // Przód tak samo jak `firstChaseContact` na serwerze.
  const front = chaseHitsWithFront(direction, from, to, contact);
  return { name: hit.name, text: chaseRamText(hit.kind, vehicle.ramPlow, front) };
}
