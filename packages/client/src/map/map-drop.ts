import type { ScenePoint } from '@vtt/shared';

/**
 * Mapa jako miejsce upuszczenia przedmiotu (etap 46b2) — „Stos” z wiersza
 * ekwipunku przeciągniętego z karty albo z okna „Wymiana”.
 *
 * Przeciąganie idzie zdarzeniami wskaźnika (decyzja MG z 09.10, jak okno
 * „Wymiana” z 38c), a nie HTML5 drag-and-drop, którym panel stawia żetony:
 * wiersz zaczyna się w oknie z `clip-path` i polami, a kończy na płótnie Pixi.
 * Płótno nie wie o oknie, więc `MapArea` zgłasza tu swój renderer, a strona,
 * która przeciąga, pyta o punkt sceny pod kursorem — bez importu `MapArea`.
 */

export interface MapDropTarget {
  clientToWorld(clientX: number, clientY: number): ScenePoint | null;
  showDropGhost(centre: ScenePoint | null): void;
}

let target: MapDropTarget | null = null;

/** `MapArea` po zbudowaniu renderera i `null` przy jego zdjęciu. */
export function setMapDropTarget(next: MapDropTarget | null): void {
  target = next;
}

/**
 * Punkt sceny pod kursorem — tylko wtedy, gdy pod nim naprawdę leży płótno
 * mapy, a nie okno, panel czy pasek nad nim.
 */
export function mapPointUnder(clientX: number, clientY: number): ScenePoint | null {
  if (!target) return null;
  const hit = document.elementFromPoint(clientX, clientY);
  if (!hit?.closest('.map-canvas-host')) return null;
  return target.clientToWorld(clientX, clientY);
}

/** Obrys pola lądowania (to samo przyciąganie do kratki co przy żetonie z panelu). */
export function showMapDropGhost(centre: ScenePoint | null): void {
  target?.showDropGhost(centre);
}
