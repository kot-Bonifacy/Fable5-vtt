import { describe, expect, it } from 'vitest';
import type { CoverView } from './covers.js';
import {
  JUMP_DIRECTIONS,
  judgeJumpGeometry,
  jumpBlockingSegments,
  sanitizeJumpDirection,
  type JumpDirection,
  type JumpGeometryInput,
} from './jump.js';
import type { TokenSnapScene } from './tokens.js';
import type { WallView } from './walls.js';

/**
 * Skok (zlecenie MG z 19.10.2026): dwie kratki w jednym z ośmiu kierunków,
 * ponad barierą i osłoną, nigdy przez ścianę, drzwi, okno ani furtkę.
 *
 * Plan: kratka 100 px, mapa 1000 × 1000, figura 1 × 1 na (400, 400) — skok na
 * wschód ląduje na (600, 400), a linia środków biegnie y = 450 od x = 450 do
 * x = 650. Przeszkody stawia się na x = 550, w połowie drogi.
 */

const SCENE: TokenSnapScene = {
  width: 1000,
  height: 1000,
  gridMode: 'grid',
  grid: { sizePx: 100, offsetX: 0, offsetY: 0 },
};
const EAST: JumpDirection = { dx: 1, dy: 0 };
const FROM = { x: 400, y: 400 };

function wall(kind: WallView['kind'], extra: Partial<WallView> = {}): WallView {
  return {
    id: 1,
    sceneId: 's',
    kind,
    open: false,
    playerToggle: false,
    locked: false,
    armor: 0,
    x1: 550,
    y1: 300,
    x2: 550,
    y2: 600,
    ...extra,
  } as WallView;
}

function cover(extra: Partial<CoverView> = {}): CoverView {
  return {
    id: 1,
    sceneId: 's',
    typeId: 'car',
    name: 'Samochód',
    x: 520,
    y: 380,
    width: 60,
    height: 140,
    hpMax: 50,
    hpCurrent: 50,
    ...extra,
  };
}

function judge(extra: Partial<JumpGeometryInput> = {}) {
  return judgeJumpGeometry({
    from: FROM,
    size: 1,
    direction: EAST,
    scene: SCENE,
    walls: [],
    covers: [],
    ...extra,
  });
}

describe('skok — kierunek z drutu', () => {
  it('przyjmuje osiem kierunków i nic poza nimi', () => {
    for (const direction of JUMP_DIRECTIONS) {
      expect(sanitizeJumpDirection(direction)).toEqual(direction);
    }
    expect(sanitizeJumpDirection({ dx: 0, dy: 0 })).toBeNull();
    expect(sanitizeJumpDirection({ dx: 2, dy: 0 })).toBeNull();
    expect(sanitizeJumpDirection({ dx: '1', dy: 0 })).toBeNull();
    expect(sanitizeJumpDirection({})).toBeNull();
  });
});

describe('skok — gdzie ląduje', () => {
  it('dwie kratki w każdym z ośmiu kierunków', () => {
    const landings = JUMP_DIRECTIONS.map((direction) => judge({ direction }));
    expect(landings).toEqual([
      { ok: true, to: { x: 400, y: 200 } },
      { ok: true, to: { x: 600, y: 200 } },
      { ok: true, to: { x: 600, y: 400 } },
      { ok: true, to: { x: 600, y: 600 } },
      { ok: true, to: { x: 400, y: 600 } },
      { ok: true, to: { x: 200, y: 600 } },
      { ok: true, to: { x: 200, y: 400 } },
      { ok: true, to: { x: 200, y: 200 } },
    ]);
  });

  it('skok, który krawędź mapy by skróciła, nie istnieje', () => {
    expect(judge({ from: { x: 800, y: 400 } })).toEqual({ ok: false, problem: 'off-map' });
    expect(judge({ from: { x: 700, y: 400 } })).toEqual({ ok: true, to: { x: 900, y: 400 } });
    expect(judge({ from: { x: 100, y: 400 }, direction: { dx: -1, dy: -1 } })).toEqual({
      ok: false,
      problem: 'off-map',
    });
  });

  it('figura 2 × 2 też przenosi się o dwie kratki', () => {
    expect(judge({ size: 2 })).toEqual({ ok: true, to: { x: 600, y: 400 } });
    expect(judge({ size: 2, from: { x: 700, y: 400 } })).toEqual({
      ok: false,
      problem: 'off-map',
    });
  });
});

describe('skok — co da się przeskoczyć', () => {
  it('barierę tak, ścianę, zamknięte drzwi, okno i furtkę nie', () => {
    expect(judge({ walls: [wall('barrier')] }).ok).toBe(true);
    for (const kind of ['wall', 'door', 'window', 'gate'] as const) {
      expect(judge({ walls: [wall(kind)] })).toEqual({ ok: false, problem: 'terrain' });
    }
  });

  it('przez otwarte drzwi, okno i furtkę skacze się jak przez dziurę', () => {
    for (const kind of ['door', 'window', 'gate'] as const) {
      expect(judge({ walls: [wall(kind, { open: true })] }).ok).toBe(true);
    }
  });

  it('osłonę przeskakuje, ale w niej nie ląduje', () => {
    expect(judge({ covers: [cover()] }).ok).toBe(true);
    expect(judge({ covers: [cover({ x: 600, y: 400, width: 100, height: 100 })] })).toEqual({
      ok: false,
      problem: 'cover',
    });
    // Wrak nie jest już osłoną — można w nim stanąć.
    expect(
      judge({ covers: [cover({ x: 600, y: 400, width: 100, height: 100, hpCurrent: 0 })] }).ok,
    ).toBe(true);
  });

  it('większa figura nie przeskoczy ściany samym brzegiem', () => {
    // Ściana kończy się na y = 480: środek 2 × 2 (y = 500) mija ją, górny pas nie.
    const short = wall('wall', { y1: 300, y2: 480 });
    expect(judge({ size: 2, walls: [short] })).toEqual({ ok: false, problem: 'terrain' });
    expect(jumpBlockingSegments([wall('barrier'), short])).toHaveLength(1);
  });

  it('figury jak w marszu: przez wroga nie, na zajętym polu nie', () => {
    const enemy = { x: 500, y: 400, size: 1 };
    expect(judge({ figures: { pass: [enemy], land: [enemy] } })).toEqual({
      ok: false,
      problem: 'figure',
    });
    expect(judge({ figures: { pass: [], land: [enemy] } }).ok).toBe(true);
    const occupant = { x: 600, y: 400, size: 1 };
    expect(judge({ figures: { pass: [], land: [occupant] } })).toEqual({
      ok: false,
      problem: 'figure',
    });
  });
});
