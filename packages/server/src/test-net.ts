import type { NetFloorView, NetRunPayload } from '@vtt/shared';

/**
 * Piętro runu dla testów dymnych (etap 70a) — tylko dla `*.test.ts`.
 *
 * Do 70a każdy ładunek niósł cały szyb (`run.branches`) i testy szukały piętra
 * w nim. Teraz szyb dostaje tylko MG (`shaft`), a gracz — piętro pod stopami
 * (`here`) i ślad (`trail`). Pomocnik pyta po kolei o wszystkie trzy, więc test
 * mówi „piętro f1 w tym ładunku” i dostaje `undefined`, gdy ładunek go nie zna
 * — co samo w sobie jest asercją o wycieku.
 */
export function runFloor(run: NetRunPayload, id: string): NetFloorView | undefined {
  const plan = run.run.shaft?.flatMap((branch) => branch.floors).find((floor) => floor.id === id);
  if (plan) return plan;
  if (run.run.here?.id === id) return run.run.here;
  const step = run.run.trail.find((entry) => entry.id === id);
  if (!step) return undefined;
  const { position, onPath: _onPath, ...rest } = step;
  return { ...rest, branchId: position.branchId, index: position.floor, knowledge: 'entered' };
}
