import type { NetFloorKind } from '@vtt/shared';
import { NET_FLOOR_KIND_LABELS } from '@vtt/shared';

/** Ikona piętra — jedno spojrzenie mówi, co za drzwiami. */
export const FLOOR_GLYPHS: Record<NetFloorKind, string> = {
  empty: '◇',
  password: '🔒',
  file: '🗎',
  controlNode: '⚙',
  ice: '☠',
  demon: '👹',
};

/** Nazwa piętra dla człowieka: etykieta MG, a bez niej rodzaj. */
export function floorName(floor: { kind: NetFloorKind; label?: string }): string {
  return floor.label || NET_FLOOR_KIND_LABELS[floor.kind];
}
