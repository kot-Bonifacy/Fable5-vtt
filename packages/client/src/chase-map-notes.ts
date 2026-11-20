import {
  ROLE_GM,
  chaseAnchorVehicle,
  chaseObstacleEta,
  cpredRoadSquaresPerRound,
  cpredSpeedMph,
  formatMetres,
  type ChaseDirection,
  type ChaseObstacleView,
  type ScenePoint,
  type SceneVehicleView,
  type SceneView,
  type TokenView,
} from '@vtt/shared';
import { pluralWord } from './plural.js';
import type { ChaseGhost } from './stores/chaseStore.js';

/**
 * Dopiski pod podpisami na mapie pościgu (etap 72d2). Liczby CP RED (mile
 * na godzinę, kratki na rundę) liczą się tu, a nie w `map/ChaseLayer.ts` —
 * warstwa mapy to rdzeń i dostaje gotowe zdania.
 */
export interface ChaseMapNotes {
  /** Druga linia podpisu auta: „150 mil/h” (widzi cały stół). */
  vehicles: Map<string, string>;
  /** Druga linia podpisu przeszkody: „16 m · za 2 tury” dla auta patrzącego. */
  obstacles: Map<string, string>;
}

export const NO_CHASE_NOTES: ChaseMapNotes = { vehicles: new Map(), obstacles: new Map() };

/**
 * Auto, z którego patrzy ten stół: u gracza — auto, w którym siedzi jego
 * figura (to samo, za którym jedzie kamera); u MG — auto kadru.
 */
export function chaseViewerVehicle(
  vehicles: readonly SceneVehicleView[],
  tokens: readonly TokenView[],
  user: { id: string; role: string } | null,
  anchorId: string | null,
): SceneVehicleView | null {
  if (!user) return null;
  if (user.role === ROLE_GM) {
    const id = chaseAnchorVehicle(vehicles, anchorId);
    return vehicles.find((vehicle) => vehicle.id === id) ?? null;
  }
  return (
    vehicles.find(
      (vehicle) =>
        vehicle.status === 'racing' &&
        tokens.some(
          (token) => token.ownerId === user.id && token.vehicleSeat?.sceneVehicleId === vehicle.id,
        ),
    ) ?? null
  );
}

/** „za 1 turę”, „za 2 tury”, „za 5 tur”; 0 — „przy zderzaku”. */
export function chaseRoundsText(rounds: number): string {
  if (rounds <= 0) return 'przy zderzaku';
  return `za ${rounds} ${pluralWord(rounds, 'turę', 'tury', 'tur')}`;
}

/**
 * Dopiski na mapie: prędkość każdego auta w pościgu i prognoza każdej
 * przeszkody przed autem patrzącego. Poza walką (`pursuitSpeed === null`)
 * prędkości są tylko zapowiedzią startu, więc nie ma nic.
 */
export function chaseMapNotes(
  scene: Pick<SceneView, 'kind' | 'width' | 'height' | 'grid' | 'metersPerSquare' | 'chase'> | null,
  vehicles: readonly SceneVehicleView[],
  obstacles: readonly ChaseObstacleView[],
  viewer: SceneVehicleView | null,
): ChaseMapNotes {
  if (!scene || scene.kind !== 'chase' || scene.chase.pursuitSpeed === null) return NO_CHASE_NOTES;
  const notes: ChaseMapNotes = { vehicles: new Map(), obstacles: new Map() };
  for (const vehicle of vehicles) {
    if (vehicle.status !== 'racing' || vehicle.hp <= 0) continue;
    notes.vehicles.set(vehicle.id, `${cpredSpeedMph(vehicle.speed)} mil/h`);
  }
  if (!viewer || viewer.status !== 'racing') return notes;
  const frame = { width: scene.width, height: scene.height, gridSizePx: scene.grid.sizePx };
  for (const obstacle of obstacles) {
    const eta = chaseObstacleEta(
      { centre: viewer, body: viewer },
      { centre: obstacle, widthSq: obstacle.widthSq, lengthSq: obstacle.lengthSq },
      scene.chase.direction,
      frame,
      cpredRoadSquaresPerRound(viewer.speed),
    );
    if (!eta) continue;
    const metres = formatMetres(eta.gapSq * scene.metersPerSquare);
    if (!eta.sameLane) notes.obstacles.set(obstacle.id, `${metres} · inny pas`);
    else if (eta.rounds === null) notes.obstacles.set(obstacle.id, metres);
    else notes.obstacles.set(obstacle.id, `${metres} · ${chaseRoundsText(eta.rounds)}`);
  }
  return notes;
}

/** Cel dystansu: nazwa, odstęp zderzaków w kratkach (ujemny — z tyłu) i zderzak celu na scenie. */
export interface TargetGap {
  name: string;
  gapSq: number;
  /** Środek celu na scenie i połowa jego długości wzdłuż drogi — do miarki ducha. */
  at: ScenePoint;
  halfLengthPx: number;
}

/** Jednostkowy krok „do przodu” po scenie dla kierunku jazdy. */
const FORWARD: Record<ChaseDirection, ScenePoint> = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
};

/**
 * Miarka ducha (72d2): od zderzaka ducha zwróconego do celu do najbliższego
 * zderzaka celu, z tymi samymi metrami co „Po ruchu”. Cel na styku — bez miarki.
 */
export function ghostRuler(
  centre: ScenePoint,
  halfLengthPx: number,
  gap: TargetGap,
  direction: ChaseDirection,
  label: string,
): ChaseGhost['ruler'] {
  if (gap.gapSq === 0) return null;
  const sign = gap.gapSq > 0 ? 1 : -1;
  const step = FORWARD[direction];
  return {
    from: {
      x: centre.x + step.x * sign * halfLengthPx,
      y: centre.y + step.y * sign * halfLengthPx,
    },
    to: {
      x: gap.at.x - step.x * sign * gap.halfLengthPx,
      y: gap.at.y - step.y * sign * gap.halfLengthPx,
    },
    label,
  };
}
