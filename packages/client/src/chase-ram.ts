import {
  chaseBodyHalfExtents,
  chaseFirstContact,
  type ChaseObstacleBox,
  type ScenePoint,
  type SceneVehicleView,
} from '@vtt/shared';
import { useChaseStore } from './stores/chaseStore.js';
import { useCombatStore } from './stores/combatStore.js';
import { useSceneStore } from './stores/sceneStore.js';
import { useTokenStore } from './stores/tokenStore.js';

/**
 * Taranowanie od strony klienta (etap 65d2): ta sama geometria, co na serwerze
 * (`chaseFirstContact`), żeby przed wysłaniem ruchu zapytać „Taranuj?”. Liczy
 * się tylko w walce — poza nią MG ustawia szyk, a auta przechodzą przez siebie.
 * Serwer i tak sprawdza drogę sam: bez `ram` auto staje przed przeszkodą.
 */
export function chaseObstacleAhead(vehicle: SceneVehicleView, to: ScenePoint): string | null {
  const scene = useSceneStore.getState().scene;
  if (!scene || !useCombatStore.getState().combat) return null;
  const direction = scene.chase.direction;
  const grid = scene.grid.sizePx;
  const names = new Map<string, string>();
  const boxes: ChaseObstacleBox[] = [];
  for (const other of useChaseStore.getState().vehicles) {
    if (other.id === vehicle.id || other.sceneId !== scene.id) continue;
    if (other.status !== 'racing' && other.status !== 'wrecked') continue;
    boxes.push({
      id: other.id,
      centre: { x: other.x, y: other.y },
      ...chaseBodyHalfExtents(other, direction, grid),
    });
    names.set(other.id, other.name);
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
    names.set(token.id, token.name);
  }
  // Przeszkody MG (65e) poza kolczatką — po niej się przejeżdża.
  for (const obstacle of useChaseStore.getState().obstacles) {
    if (obstacle.sceneId !== scene.id || obstacle.kind === 'spikes') continue;
    boxes.push({
      id: `obstacle:${obstacle.id}`,
      centre: { x: obstacle.x, y: obstacle.y },
      ...chaseBodyHalfExtents(obstacle, direction, grid),
    });
    names.set(`obstacle:${obstacle.id}`, obstacle.name);
  }
  const contact = chaseFirstContact(
    { x: vehicle.x, y: vehicle.y },
    to,
    chaseBodyHalfExtents(vehicle, direction, grid),
    boxes,
  );
  return contact ? (names.get(contact.id) ?? null) : null;
}
