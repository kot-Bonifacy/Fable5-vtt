/**
 * Kreator sceny pościgu (zlecenie MG z 03.11) — rdzeń VTT, bez liczb CP RED.
 *
 * Wbudowane drogi to tła z `packages/client/public/art/roads/`, rysowane przez
 * `tools/art/chase-roads.py` z dwóch zdjęć asfaltu CC0 (ambientCG). Każda ma
 * okres 32 kratek i 3 kratki zapasu, więc szew bieżni (`CHASE_SEAM_SQUARES`)
 * przenika dwa identyczne pasy i znika. Wiersze jezdni poniżej są kopią
 * układu ze skryptu — zmieniasz jedno, zmieniasz drugie.
 *
 * Wolne miejsce na drodze (`chaseFreeSpot`) liczy klient przed „Na drogę”:
 * auta stawiane jedno po drugim nie lądują na sobie na środku sceny.
 */
import type { ScenePoint } from './measure.js';
import type { ScenePatch } from './scenes.js';
import {
  chaseBodyHalfExtents,
  chaseIsHorizontal,
  chaseRoadSpanPx,
  type ChaseBody,
  type ChaseDirection,
  type ChaseSettings,
} from './chase.js';

export const CHASE_ROAD_IDS = ['highway', 'street', 'viaduct', 'badlands'] as const;
export type ChaseRoadId = (typeof CHASE_ROAD_IDS)[number];

export interface ChaseRoadPreset {
  id: ChaseRoadId;
  label: string;
  /** Jedno zdanie pod miniaturą w kreatorze. */
  hint: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  gridSizePx: number;
  direction: ChaseDirection;
  /** Pas jezdni w wierszach kratek (`from` włącznie, `to` bez). */
  road: { from: number; to: number };
}

/** Rozmiar każdej wbudowanej drogi: 35 × 18 kratek po 100 px (1 m na kratkę). */
const ROAD_SIZE = { width: 3500, height: 1800, gridSizePx: 100 } as const;

function road(
  id: ChaseRoadId,
  label: string,
  hint: string,
  from: number,
  to: number,
): ChaseRoadPreset {
  return {
    id,
    label,
    hint,
    url: `/art/roads/${id}.webp`,
    thumbUrl: `/art/roads/${id}-thumb.webp`,
    ...ROAD_SIZE,
    // Drogi są symetryczne w poziomie; domyślnie jazda w lewo (MG, 04.11).
    direction: 'left',
    road: { from, to },
  };
}

export const CHASE_ROADS: readonly ChaseRoadPreset[] = [
  road(
    'highway',
    'Autostrada',
    'Trzy pasy w jedną stronę, pobocza i betonowe bariery z odblaskami.',
    2,
    16,
  ),
  road(
    'street',
    'Ulica 2+2',
    'Dwa pasy w każdą stronę, podwójna żółta, chodniki w neonach i przejście dla pieszych.',
    2,
    16,
  ),
  road(
    'viaduct',
    'Estakada',
    'Trzy pasy nad nocnym miastem, neonowe bariery i przepaść po obu stronach.',
    3,
    15,
  ),
  road(
    'badlands',
    'Badlands',
    'Spękana dwupasmówka przez pustkowie — auto zjedzie na twarde pobocze.',
    4,
    14,
  ),
];

/** Wbudowana droga o tym adresie tła albo `null` (tło wgrane przez MG). */
export function chaseRoadByUrl(url: string | null | undefined): ChaseRoadPreset | null {
  if (typeof url !== 'string') return null;
  return CHASE_ROADS.find((preset) => preset.url === url) ?? null;
}

/**
 * Łata sceny, która kładzie wbudowaną drogę: tło, rozmiar, siatka 1 m na
 * kratkę bez przesunięcia, kierunek jazdy i pas jezdni — wszystko, czego MG
 * nie musi już ustawiać ręcznie.
 */
export function chaseRoadPatch(preset: ChaseRoadPreset): ScenePatch {
  return {
    background: { url: preset.url, width: preset.width, height: preset.height },
    width: preset.width,
    height: preset.height,
    grid: { sizePx: preset.gridSizePx, offsetX: 0, offsetY: 0 },
    metersPerSquare: 1,
    chase: { direction: preset.direction, road: { ...preset.road } },
  };
}

/**
 * Pas jezdni z przeciągniętej krawędzi (uchwyty na mapie): pozycja w pikselach
 * w poprzek drogi → numer linii siatki, przycięty do sceny, a krawędzie nie
 * mijają się i zostawiają co najmniej jedną kratkę jezdni.
 */
export function chaseRoadWithEdge(
  road: { from: number; to: number },
  edge: 'from' | 'to',
  positionPx: number,
  grid: { sizePx: number; offset: number },
  cells: number,
): { from: number; to: number } {
  const line = Math.round((positionPx - grid.offset) / grid.sizePx);
  if (edge === 'from') {
    return { from: Math.max(0, Math.min(line, road.to - 1)), to: road.to };
  }
  return { from: road.from, to: Math.min(Math.max(1, cells), Math.max(line, road.from + 1)) };
}

/** Ile pełnych kratek mieści scena w poprzek kierunku jazdy. */
export function chaseRoadCells(
  direction: ChaseDirection,
  scene: {
    width: number;
    height: number;
    gridSizePx: number;
    gridOffsetX: number;
    gridOffsetY: number;
  },
): number {
  const horizontal = chaseIsHorizontal(direction);
  const extent = horizontal ? scene.height : scene.width;
  const offset = horizontal ? scene.gridOffsetY : scene.gridOffsetX;
  return Math.max(1, Math.floor((extent - offset) / scene.gridSizePx));
}

/** Auto, które już stoi na drodze — środek i bryła. */
export interface ChaseParkedBody {
  x: number;
  y: number;
  widthSq: number;
  lengthSq: number;
}

/**
 * Wolne miejsce dla auta na drodze: kolejne pasy w poprzek (szerokość bryły
 * i kratka odstępu), od środka jezdni na zewnątrz, a w każdym pasie pozycje
 * od środka sceny do przodu i do tyłu co długość bryły i kratkę. Pierwsza,
 * w której bryła nie nachodzi na żadne stojące auto (z kratką odstępu), wygrywa.
 * Gdy miejsca nie ma — środek sceny (MG przestawi auto ręką).
 */
export function chaseFreeSpot(
  body: Pick<ChaseBody, 'widthSq' | 'lengthSq'>,
  parked: readonly ChaseParkedBody[],
  settings: Pick<ChaseSettings, 'direction' | 'road'>,
  scene: {
    width: number;
    height: number;
    gridSizePx: number;
    gridOffsetX: number;
    gridOffsetY: number;
  },
): ScenePoint {
  const grid = scene.gridSizePx;
  const horizontal = chaseIsHorizontal(settings.direction);
  const { hx, hy } = chaseBodyHalfExtents(body, settings.direction, grid);
  const span = chaseRoadSpanPx(settings, scene);
  const halfAcross = horizontal ? hy : hx;
  const halfAlong = horizontal ? hx : hy;
  const length = horizontal ? scene.width : scene.height;

  const acrossSlots: number[] = [];
  const middle = (span.from + span.to) / 2;
  const laneStep = halfAcross * 2 + grid;
  const maxOffset = (span.to - span.from) / 2;
  for (let k = 0; ; k += 1) {
    const offset = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * laneStep;
    if (Math.abs(offset) > maxOffset) break;
    const at = middle + offset;
    if (at - halfAcross >= span.from - 0.5 && at + halfAcross <= span.to + 0.5)
      acrossSlots.push(at);
  }
  if (acrossSlots.length === 0) acrossSlots.push(middle);

  const alongStep = halfAlong * 2 + grid;
  const alongSlots: number[] = [];
  for (let k = 0; ; k += 1) {
    const offset = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * alongStep;
    if (Math.abs(offset) > length / 2) break;
    const at = length / 2 + offset;
    if (at - halfAlong >= 0 && at + halfAlong <= length) alongSlots.push(at);
  }
  if (alongSlots.length === 0) alongSlots.push(length / 2);

  const overlaps = (centre: ScenePoint): boolean =>
    parked.some((other) => {
      const o = chaseBodyHalfExtents(other, settings.direction, grid);
      return (
        Math.abs(centre.x - other.x) < hx + o.hx + grid * 0.5 &&
        Math.abs(centre.y - other.y) < hy + o.hy + grid * 0.5
      );
    });

  for (const along of alongSlots) {
    for (const across of acrossSlots) {
      const centre = horizontal ? { x: along, y: across } : { x: across, y: along };
      if (!overlaps(centre)) return centre;
    }
  }
  return { x: scene.width / 2, y: scene.height / 2 };
}
