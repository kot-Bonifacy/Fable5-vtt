import { coverStanding, isPointInCover, type CoverView } from './covers.js';
import type { ScenePoint } from './measure.js';
import { firstBlockedStep } from './pathfinding.js';
import { clampTokenPosition, snapTokenPosition, type TokenSnapScene } from './tokens.js';
import type { Segment } from './vision.js';
import { firstFigureBlock, type WalkFigure } from './walk-route.js';
import { wallBlocksMovement, type WallView } from './walls.js';

/**
 * Skok (zlecenie MG z 19.10.2026) — rdzeń VTT, bez systemu gry.
 *
 * Figura przenosi się o dwie kratki w jednym z ośmiu kierunków i po drodze
 * przeskakuje to, co ciało zatrzymuje, ale co da się przesadzić: barierę
 * (płot, barierkę — `barrier`) i osłonę (samochód, skrzynię). Ściany, drzwi,
 * okna i furtki w barierze (`gate` to mechanizm drzwi) zatrzymują skok jak
 * marsz. Ląduje się na wolnym polu: nie w osłonie, nie na figurze i nie poza
 * mapą. Czy gracz to miejsce **widzi**, rozstrzyga serwer — widzenie liczy
 * się z wielokątów, których rdzeń geometrii tu nie zna.
 *
 * Koszt jest stały i płaci się metrami ruchu, nie Akcją: w walce z dystansu
 * tury, poza nią z puli Eksploracji. Kto tylu metrów nie ma, nie skacze.
 */

/** O ile kratek przenosi skok. */
export const JUMP_CELLS = 2;

/** Ile metrów ruchu kosztuje skok, bez względu na kierunek i teren. */
export const JUMP_COST_M = 8;

/** Kierunek skoku: krok siatki w poziomie i w pionie, nigdy (0, 0). */
export interface JumpDirection {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}

/** Osiem kierunków, od północy zgodnie z ruchem wskazówek zegara. */
export const JUMP_DIRECTIONS: readonly JumpDirection[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
];

/** Client → server `token:jump`: skok tej figury w tym kierunku. */
export interface TokenJumpPayload {
  tokenId: string;
  dx: number;
  dy: number;
}

/** Client → server `token:jump-options`: dokąd ta figura może teraz skoczyć. */
export interface TokenJumpOptionsPayload {
  tokenId: string;
}

/** Jedno pole, na które da się skoczyć — lewy górny róg figury po skoku. */
export interface TokenJumpOption extends JumpDirection {
  x: number;
  y: number;
}

/** Odpowiedź `token:jump-options`. */
export interface TokenJumpOptionsView {
  /** Pola lądowania, które serwer przyjmie; puste, gdy skoku nie ma. */
  options: TokenJumpOption[];
  /**
   * Czemu figura nie skacze wcale (stan, brak metrów, cudza tura) — zdanie do
   * pokazania graczowi. Null, gdy skok jest możliwy co do zasady, nawet jeśli
   * żaden kierunek nie jest wolny.
   */
  refusal: string | null;
}

/** Kierunek z drutu albo null, gdy to nie jeden z ośmiu. */
export function sanitizeJumpDirection(raw: { dx?: unknown; dy?: unknown }): JumpDirection | null {
  const { dx, dy } = raw;
  if (dx !== -1 && dx !== 0 && dx !== 1) return null;
  if (dy !== -1 && dy !== 0 && dy !== 1) return null;
  if (dx === 0 && dy === 0) return null;
  return { dx, dy };
}

/**
 * Co zatrzymuje skok: wszystko, co zatrzymuje ciało, poza barierą.
 *
 * Osłony nie ma na tej liście wcale — przesadza się ją tak samo jak barierę,
 * a to, że nie wolno w niej wylądować, sprawdza `landsInCover`.
 */
export function jumpBlockingSegments(walls: readonly WallView[]): Segment[] {
  const segments: Segment[] = [];
  for (const wall of walls) {
    if (wall.kind === 'barrier' || !wallBlocksMovement(wall)) continue;
    segments.push({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 });
  }
  return segments;
}

/** Dlaczego skok w ten kierunek się nie uda — bez nazywania przeszkody. */
export type JumpGeometryProblem = 'off-map' | 'terrain' | 'cover' | 'figure';

export interface JumpGeometryInput {
  /** Gdzie figura stoi teraz — lewy górny róg, piksele sceny. */
  from: ScenePoint;
  /** Bok figury w kratkach. */
  size: number;
  direction: JumpDirection;
  scene: TokenSnapScene;
  walls: readonly WallView[];
  covers: readonly CoverView[];
  /**
   * Figury jak w marszu (`firstFigureBlock`): przez `pass` nie przeskoczysz,
   * na `land` nie wylądujesz. Kto jest kim, rozstrzyga wołający.
   */
  figures?: { pass: readonly WalkFigure[]; land: readonly WalkFigure[] };
}

export type JumpGeometryVerdict =
  { ok: true; to: ScenePoint } | { ok: false; problem: JumpGeometryProblem };

/**
 * Gdzie ląduje skok i czy geometria go puszcza.
 *
 * Linia skoku idzie od środka do środka, a dla figury większej niż kratka —
 * jedną ścieżką na każde jej pole, tak jak sprawdza marsz (`firstBlockedStep`),
 * więc ściany nie przeskoczy się samym brzegiem żetonu.
 */
export function judgeJumpGeometry(input: JumpGeometryInput): JumpGeometryVerdict {
  const { from, scene, direction } = input;
  const cell = scene.grid.sizePx;
  const size = Math.max(1, Math.round(input.size));
  if (!(cell > 0)) return { ok: false, problem: 'off-map' };
  const wanted = {
    x: from.x + direction.dx * JUMP_CELLS * cell,
    y: from.y + direction.dy * JUMP_CELLS * cell,
  };
  // Krawędź mapy przycięłaby skok do krótszego — taki skok nie istnieje.
  const clamped = clampTokenPosition(wanted.x, wanted.y, size, scene);
  if (Math.abs(clamped.x - wanted.x) > 0.5 || Math.abs(clamped.y - wanted.y) > 0.5) {
    return { ok: false, problem: 'off-map' };
  }
  const to = snapTokenPosition(clamped.x, clamped.y, size, scene);

  const half = (size * cell) / 2;
  const centres = [
    { x: from.x + half, y: from.y + half },
    { x: to.x + half, y: to.y + half },
  ];
  if (firstBlockedStep(centres, jumpBlockingSegments(input.walls), { size, cell })) {
    return { ok: false, problem: 'terrain' };
  }
  if (landsInCover(to, size, cell, input.covers)) return { ok: false, problem: 'cover' };
  if (input.figures && firstFigureBlock([from, to], size, cell, input.figures)) {
    return { ok: false, problem: 'figure' };
  }
  return { ok: true, to };
}

/** Czy któreś pole figury po wylądowaniu leży w stojącej osłonie. */
function landsInCover(
  to: ScenePoint,
  size: number,
  cell: number,
  covers: readonly CoverView[],
): boolean {
  const standing = covers.filter(coverStanding);
  if (standing.length === 0) return false;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const centre = { x: to.x + (col + 0.5) * cell, y: to.y + (row + 0.5) * cell };
      if (standing.some((cover) => isPointInCover(cover, centre))) return true;
    }
  }
  return false;
}
