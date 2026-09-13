import { describe, expect, it } from 'vitest';
import {
  WALL_SAMPLE_MAX,
  fireSegmentsFor,
  isBarrier,
  isOpening,
  isWallKind,
  movementSegments,
  roomSegments,
  sightSegmentsFor,
  standingBarriers,
  walkOnlyWallsFor,
  wallBlocksMovement,
  wallBlocksSight,
  wallSamplePoints,
  type WallView,
} from './walls.js';

/**
 * Stage 42a: the partition that is looked through and not walked through.
 *
 * A chain-link fence, a railing, a glass screen. The three lists this module
 * keeps — what stops an eye, a round and a body — finally have three different
 * answers for one object, and these tests pin each of them down.
 *
 * The plan: a fence along x = 400 (y 0…600) with a gate below it (y 600…800), a
 * window along x = 800 and a brick wall along y = 900. One pixel is one pixel;
 * arm's reach is 100 px.
 */

function makeWall(
  id: number,
  kind: WallView['kind'],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  extra: Partial<WallView> = {},
): WallView {
  return {
    id,
    sceneId: 's',
    kind,
    open: false,
    playerToggle: false,
    locked: false,
    x1,
    y1,
    x2,
    y2,
    ...extra,
  };
}

const FENCE = makeWall(1, 'barrier', 400, 0, 400, 600);
const GATE = makeWall(2, 'gate', 400, 600, 400, 800);
const PANE = makeWall(3, 'window', 800, 0, 800, 400);
const BRICK = makeWall(4, 'wall', 0, 900, 1000, 900);
const REACH_PX = 100;

function segmentOf(wall: WallView) {
  return { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 };
}

describe('barrier and gate — what they stop', () => {
  it('are known kinds, and only the gate is an opening', () => {
    expect(isWallKind('barrier')).toBe(true);
    expect(isWallKind('gate')).toBe(true);
    expect(isWallKind('fence')).toBe(false);
    expect(isOpening(GATE)).toBe(true);
    expect(isOpening(FENCE)).toBe(false);
    expect(isBarrier(FENCE)).toBe(true);
    expect(isBarrier(GATE)).toBe(true);
    expect(isBarrier(PANE)).toBe(false);
  });

  it('never stop sight, in any state and from any distance', () => {
    for (const wall of [FENCE, GATE, { ...GATE, open: true }]) {
      expect(wallBlocksSight(wall)).toBe(false);
    }
    expect(
      sightSegmentsFor([FENCE, GATE], { x: 390, y: 300 }, { curtainReachPx: REACH_PX }),
    ).toEqual([]);
    expect(sightSegmentsFor([FENCE, GATE], { x: 0, y: 300 }, { curtainReachPx: REACH_PX })).toEqual(
      [],
    );
  });

  it('let a round through — the SP of a barrier is stage 42b', () => {
    expect(fireSegmentsFor([FENCE, GATE], { x: 0, y: 300 }, { curtainReachPx: REACH_PX })).toEqual(
      [],
    );
  });

  it('stop a body: a barrier always, a gate while it is shut', () => {
    expect(wallBlocksMovement(FENCE)).toBe(true);
    expect(wallBlocksMovement(GATE)).toBe(true);
    expect(wallBlocksMovement({ ...GATE, open: true })).toBe(false);
    expect(movementSegments([FENCE, GATE])).toEqual([segmentOf(FENCE), segmentOf(GATE)]);
    expect(movementSegments([FENCE, { ...GATE, open: true }])).toEqual([segmentOf(FENCE)]);
  });

  it('leaves the three older kinds exactly as they were', () => {
    const shutDoor = makeWall(5, 'door', 0, 0, 0, 100);
    const openDoor = makeWall(6, 'door', 0, 100, 0, 200, { open: true });
    const openPane = makeWall(7, 'window', 0, 200, 0, 300, { open: true });
    expect(movementSegments([BRICK, shutDoor, openDoor, PANE, openPane])).toEqual([
      segmentOf(BRICK),
      segmentOf(shutDoor),
      segmentOf(PANE),
    ]);
  });

  it('does not make a yard into a room when a lamp is sized', () => {
    expect(roomSegments([FENCE, GATE, BRICK, PANE])).toEqual([segmentOf(BRICK), segmentOf(PANE)]);
  });
});

describe("walkOnlyWallsFor — what a player's route planner is told about", () => {
  it('hands over barriers and shut gates, never a wall or a shut door', () => {
    const shutDoor = makeWall(5, 'door', 0, 0, 0, 100);
    const found = walkOnlyWallsFor(
      [FENCE, GATE, BRICK, shutDoor],
      { x: 0, y: 0 },
      {
        curtainReachPx: REACH_PX,
      },
    );
    expect(found.map((wall) => wall.id)).toEqual([1, 2]);
  });

  it('leaves out an open gate — there is nothing left to walk round', () => {
    expect(
      walkOnlyWallsFor([{ ...GATE, open: true }], { x: 0, y: 0 }, { curtainReachPx: REACH_PX }),
    ).toEqual([]);
  });

  it('counts a closed window only for someone standing at the glass', () => {
    // 50 px from the pane: the curtain is off, the floor beyond is in view, and
    // the planner must not walk through the glass.
    expect(walkOnlyWallsFor([PANE], { x: 750, y: 200 }, { curtainReachPx: REACH_PX })).toEqual([
      PANE,
    ]);
    // 300 px away the pane is a wall to this observer — sight stops at it anyway.
    expect(walkOnlyWallsFor([PANE], { x: 500, y: 200 }, { curtainReachPx: REACH_PX })).toEqual([]);
  });

  it('counts it from anywhere in the dark, where a pane curtains nothing', () => {
    expect(walkOnlyWallsFor([PANE], { x: 100, y: 200 }, { curtainReachPx: null })).toEqual([PANE]);
  });

  it('has an observer-free twin for maps without dynamic vision — windows excluded', () => {
    const openGate = makeWall(8, 'gate', 0, 0, 0, 100, { open: true });
    expect(standingBarriers([FENCE, GATE, openGate, PANE, BRICK]).map((wall) => wall.id)).toEqual([
      1, 2,
    ]);
  });
});

describe('wallSamplePoints', () => {
  it('spreads interior points evenly and never lands on an end', () => {
    expect(wallSamplePoints({ x1: 0, y1: 0, x2: 100, y2: 0 }, 25)).toEqual([
      { x: 12.5, y: 0 },
      { x: 37.5, y: 0 },
      { x: 62.5, y: 0 },
      { x: 87.5, y: 0 },
    ]);
  });

  it('falls back to the midpoint when the spacing means nothing', () => {
    const wall = { x1: 0, y1: 0, x2: 100, y2: 0 };
    expect(wallSamplePoints(wall, Number.POSITIVE_INFINITY)).toEqual([{ x: 50, y: 0 }]);
    expect(wallSamplePoints(wall, 0)).toEqual([{ x: 50, y: 0 }]);
  });

  it('caps a very long wall', () => {
    expect(wallSamplePoints({ x1: 0, y1: 0, x2: 100_000, y2: 0 }, 1)).toHaveLength(WALL_SAMPLE_MAX);
  });
});
