import type { ScenePoint } from '@vtt/shared';
import { routeLengths } from '@vtt/shared';

/**
 * Zatwierdzone trasy marszu graczy (etap 52), w pamięci procesu.
 *
 * Trasa żyje od `token:walk` do klatki końcowej marszu — kilka sekund. Klucz to
 * figura: drugi marsz tej samej figury zastępuje pierwszy, a restart serwera
 * gubi trasę, więc marsz w locie dostaje `MOVE_NOT_PLANNED` i figura wraca —
 * tak samo jak przy każdej innej odmowie.
 */
export interface ApprovedWalk {
  userId: string;
  sceneId: string;
  /** Trasa od pozycji startowej (włącznie) do celu, lewy górny róg. */
  route: ScenePoint[];
  /** Długość trasy w pikselach — górna granica `reached`. */
  length: number;
  /** Najdalszy punkt trasy, do którego doszła klatka marszu, w pikselach. */
  reached: number;
  approvedAt: number;
}

/** Po tylu ms zapomniana trasa przestaje obowiązywać (marsz trwa sekundy). */
export const WALK_TTL_MS = 5 * 60_000;

const walks = new Map<string, ApprovedWalk>();

/** Zegar tras — testy go podmieniają. */
export const walkClock = { now: (): number => Date.now() };

export function approveWalk(
  tokenId: string,
  walk: Omit<ApprovedWalk, 'length' | 'reached' | 'approvedAt'>,
): ApprovedWalk {
  const lengths = routeLengths(walk.route);
  const approved: ApprovedWalk = {
    ...walk,
    length: lengths[lengths.length - 1] ?? 0,
    reached: 0,
    approvedAt: walkClock.now(),
  };
  walks.set(tokenId, approved);
  return approved;
}

/**
 * Trasa, po której ten gracz prowadzi tę figurę z tego miejsca — albo `null`.
 *
 * Figura, która od zatwierdzenia ruszyła się inną drogą (MG ją przestawił,
 * Pochwycenie ją pociągnęło), unieważnia trasę: start nie jest już tam, gdzie
 * figura stoi, więc i reszta trasy nie mówi prawdy.
 */
export function activeWalk(
  tokenId: string,
  userId: string,
  sceneId: string,
  standing: ScenePoint,
): ApprovedWalk | null {
  const walk = walks.get(tokenId);
  if (!walk) return null;
  const start = walk.route[0];
  const stale =
    walk.userId !== userId ||
    walk.sceneId !== sceneId ||
    walkClock.now() - walk.approvedAt > WALK_TTL_MS ||
    !start ||
    Math.abs(start.x - standing.x) >= 1 ||
    Math.abs(start.y - standing.y) >= 1;
  if (stale) {
    walks.delete(tokenId);
    return null;
  }
  return walk;
}

/** Marsz skończony (wylądował albo odmówiono mu lądowania) — trasy już nie ma. */
export function endWalk(tokenId: string): void {
  walks.delete(tokenId);
}

/**
 * Marsze graczy w toku na scenie (etap 56) — zauważenie wroga zatrzymuje je
 * wszystkie naraz, a nie tylko marsz figury, która zobaczyła.
 */
export function walksOnScene(sceneId: string): [string, ApprovedWalk][] {
  const now = walkClock.now();
  return [...walks.entries()].filter(
    ([, walk]) => walk.sceneId === sceneId && now - walk.approvedAt <= WALK_TTL_MS,
  );
}
