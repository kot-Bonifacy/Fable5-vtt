import { describe, expect, it } from 'vitest';
import { WALL_ARMOR_MAX, barrierArmorAlong, sanitizeWallArmor, type WallView } from './walls.js';

/**
 * Stage 42b: what a round loses on its way through a fence.
 *
 * The core only adds up the armour of what a straight line crosses; what that
 * number does to damage is CP RED's business (`resolveCpredDamage`). The yard: a
 * fence along x = 400 (y 0…600), the shooter west of it at (100, 300), the
 * target east of it at (700, 300). One pixel is one pixel.
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
    armor: 0,
    x1,
    y1,
    x2,
    y2,
    ...extra,
  };
}

const SHOOTER = { x: 100, y: 300 };
const TARGET = { x: 700, y: 300 };

describe('barrierArmorAlong (stage 42b)', () => {
  it('takes the armour of a fence the line passes through', () => {
    const fence = makeWall(1, 'barrier', 400, 0, 400, 600, { armor: 7 });
    expect(barrierArmorAlong([fence], SHOOTER, TARGET)).toBe(7);
  });

  it('adds up two fences one behind the other', () => {
    const near = makeWall(1, 'barrier', 400, 0, 400, 600, { armor: 7 });
    const far = makeWall(2, 'barrier', 600, 0, 600, 600, { armor: 5 });
    expect(barrierArmorAlong([near, far], SHOOTER, TARGET)).toBe(12);
  });

  it('charges a shut gate and lets an open one through for nothing', () => {
    const gate = makeWall(1, 'gate', 400, 0, 400, 600, { armor: 9 });
    expect(barrierArmorAlong([gate], SHOOTER, TARGET)).toBe(9);
    expect(barrierArmorAlong([{ ...gate, open: true }], SHOOTER, TARGET)).toBe(0);
  });

  it('gives nothing for a barrier of armour 0 — the behaviour of 42a', () => {
    const fence = makeWall(1, 'barrier', 400, 0, 400, 600);
    expect(barrierArmorAlong([fence], SHOOTER, TARGET)).toBe(0);
  });

  it('ignores a fence the line does not reach', () => {
    const fence = makeWall(1, 'barrier', 400, 400, 400, 600, { armor: 7 });
    expect(barrierArmorAlong([fence], SHOOTER, TARGET)).toBe(0);
  });

  it('never reads armour off a wall, a door or a window', () => {
    // Retyping zeroes the number on the server; a row that kept one anyway must
    // still give a round nothing to pay — a window has no SP (s. 180) and a wall
    // or a shut door refuses the shot outright elsewhere.
    const walls = [
      makeWall(1, 'wall', 400, 0, 400, 600, { armor: 7 }),
      makeWall(2, 'door', 450, 0, 450, 600, { armor: 7 }),
      makeWall(3, 'window', 500, 0, 500, 600, { armor: 7 }),
    ];
    expect(barrierArmorAlong(walls, SHOOTER, TARGET)).toBe(0);
  });

  it('counts a chain joint once when the line crosses exactly there', () => {
    // A fence traced with a click at every grid line meets itself at (400, 300),
    // and a diagonal shot between square centres runs through such joints.
    const upper = makeWall(1, 'barrier', 400, 0, 400, 300, { armor: 7 });
    const lower = makeWall(2, 'barrier', 400, 300, 400, 600, { armor: 7 });
    expect(barrierArmorAlong([upper, lower], { x: 100, y: 0 }, { x: 700, y: 600 })).toBe(7);
  });

  it('takes the stronger segment where two different ones meet on the line', () => {
    const mesh = makeWall(1, 'barrier', 400, 0, 400, 300, { armor: 5 });
    const plate = makeWall(2, 'barrier', 400, 300, 400, 600, { armor: 9 });
    expect(barrierArmorAlong([mesh, plate], { x: 100, y: 0 }, { x: 700, y: 600 })).toBe(9);
    expect(barrierArmorAlong([plate, mesh], { x: 100, y: 0 }, { x: 700, y: 600 })).toBe(9);
  });

  it('charges a shooter pressed against the mesh — no exemption for standing at it', () => {
    const fence = makeWall(1, 'barrier', 400, 0, 400, 600, { armor: 7 });
    expect(barrierArmorAlong([fence], { x: 395, y: 300 }, TARGET)).toBe(7);
  });

  it('does not charge a line that ends on the fence itself', () => {
    const fence = makeWall(1, 'barrier', 400, 0, 400, 600, { armor: 7 });
    expect(barrierArmorAlong([fence], SHOOTER, { x: 400, y: 300 })).toBe(0);
  });
});

describe('sanitizeWallArmor (stage 42b)', () => {
  it('takes whole numbers from 0 to the cap', () => {
    expect(sanitizeWallArmor(0)).toBe(0);
    expect(sanitizeWallArmor(7)).toBe(7);
    expect(sanitizeWallArmor(WALL_ARMOR_MAX)).toBe(WALL_ARMOR_MAX);
  });

  it('refuses anything else', () => {
    expect(sanitizeWallArmor(-1)).toBeNull();
    expect(sanitizeWallArmor(7.5)).toBeNull();
    expect(sanitizeWallArmor(WALL_ARMOR_MAX + 1)).toBeNull();
    expect(sanitizeWallArmor('7')).toBeNull();
    expect(sanitizeWallArmor(Number.NaN)).toBeNull();
    expect(sanitizeWallArmor(undefined)).toBeNull();
  });
});
