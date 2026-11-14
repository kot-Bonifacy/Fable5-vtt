import type { NetFloorKind, NetTraces } from '@vtt/shared';
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

/**
 * Czerwony znacznik niezatartych śladów (zlecenie MG z 14.11): plakietka planu MG,
 * karty piętra i dymek śladu mówią to samo.
 */
export const TRACES_LABELS: Record<NetTraces, string> = {
  failed: 'ślady: nieudane',
  unmasked: 'ślady: bez maskowania',
};

export const TRACES_TITLES: Record<NetTraces, string> = {
  failed: 'Maskowanie się nie udało — ślady netrunnera zostały na tym piętrze',
  unmasked: 'Netrunner zszedł z tego piętra bez Maskowania — ślady zostały',
};

/** Nazwa piętra dla człowieka: etykieta MG, a bez niej rodzaj. */
export function floorName(floor: { kind: NetFloorKind; label?: string }): string {
  return floor.label || NET_FLOOR_KIND_LABELS[floor.kind];
}
