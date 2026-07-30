import { describe, expect, it } from 'vitest';
import {
  CPRED_ACTIONS,
  CPRED_ACTION_ATTACK,
  CPRED_ACTION_RELOAD,
  CPRED_ACTION_RUN,
  CPRED_ACTION_STAND_UP,
  CPRED_ATTACKS_PER_ACTION,
  cpredAction,
  cpredMetresLeft,
  cpredMoveRefusal,
  cpredTurnBudget,
  forceCpredTurn,
  freshCpredTurn,
  readCpredTurn,
  setCpredHardTerrain,
  spendCpredTurn,
  withCpredMoveAllowance,
  type CpredTurnSpend,
  type CpredTurnState,
} from './turn.js';

type AttackSpend = Extract<CpredTurnSpend, { kind: 'attack' }>;

/** A weapon that fits two attacks into one Action („LA 2"). */
function fast(id = 'w1', name = 'Ciężki pistolet'): AttackSpend {
  return { kind: 'attack', weaponRowId: id, weaponName: name, rof: 2 };
}

/** A weapon whose single attack takes the whole Attack Action („LA 1"). */
function slow(id = 'w2', name = 'Strzelba'): AttackSpend {
  return { kind: 'attack', weaponRowId: id, weaponName: name, rof: 1 };
}

/** Applies a chain of spends, asserting that each one is legal. */
function spendAll(state: CpredTurnState, spends: CpredTurnSpend[]): CpredTurnState {
  return spends.reduce((current, spend) => {
    const result = spendCpredTurn(current, spend);
    if (!result.ok) throw new Error(`unexpected refusal: ${result.error}`);
    return result.state;
  }, state);
}

describe('cpred turn budget', () => {
  it('starts every turn with one Move Action and one Action', () => {
    const state = freshCpredTurn();
    expect(state.moveMax).toBe(1);
    expect(state.moveUsed).toBe(0);
    expect(state.action).toBeNull();
  });

  it('spends the Move Action once and refuses a second', () => {
    const moved = spendAll(freshCpredTurn(), [{ kind: 'move' }]);
    expect(moved.moveUsed).toBe(1);
    expect(spendCpredTurn(moved, { kind: 'move' })).toEqual({
      ok: false,
      error: 'NO_MOVE_LEFT',
    });
  });

  it('spends the Action once and refuses a second', () => {
    const reloaded = spendAll(freshCpredTurn(), [
      { kind: 'action', actionId: CPRED_ACTION_RELOAD },
    ]);
    expect(reloaded.action?.id).toBe(CPRED_ACTION_RELOAD);
    expect(spendCpredTurn(reloaded, { kind: 'action', actionId: CPRED_ACTION_STAND_UP })).toEqual({
      ok: false,
      error: 'NO_ACTION_LEFT',
    });
  });

  it('refuses an attack after the Action went somewhere else', () => {
    const reloaded = spendAll(freshCpredTurn(), [
      { kind: 'action', actionId: CPRED_ACTION_RELOAD },
    ]);
    expect(spendCpredTurn(reloaded, fast())).toEqual({ ok: false, error: 'NO_ACTION_LEFT' });
  });

  it('fits two attacks of an LA 2 weapon into one Attack Action', () => {
    const after = spendAll(freshCpredTurn(), [fast(), fast()]);
    expect(after.action?.id).toBe(CPRED_ACTION_ATTACK);
    expect(after.action?.attack?.count).toBe(CPRED_ATTACKS_PER_ACTION);
    expect(after.action?.attack?.closed).toBe(true);
    expect(spendCpredTurn(after, fast())).toEqual({ ok: false, error: 'ROF_EXCEEDED' });
  });

  it('lets the two attacks come from two different LA 2 weapons', () => {
    const after = spendAll(freshCpredTurn(), [
      fast('pistol', 'Ciężki pistolet'),
      fast('machete', 'Maczeta'),
    ]);
    expect(after.action?.attack?.weaponRowIds).toEqual(['pistol', 'machete']);
    expect(after.action?.attack?.weaponNames).toEqual(['Ciężki pistolet', 'Maczeta']);
  });

  it('lets an LA 1 weapon attack once and closes the Action', () => {
    const after = spendAll(freshCpredTurn(), [slow()]);
    expect(after.action?.attack?.count).toBe(1);
    expect(after.action?.attack?.closed).toBe(true);
    expect(spendCpredTurn(after, slow('other', 'Karabin'))).toEqual({
      ok: false,
      error: 'ROF_EXCEEDED',
    });
  });

  it('refuses an LA 1 weapon as the second half of an Attack Action', () => {
    const opened = spendAll(freshCpredTurn(), [fast()]);
    expect(opened.action?.attack?.closed).toBe(false);
    expect(spendCpredTurn(opened, slow())).toEqual({ ok: false, error: 'ROF_EXCEEDED' });
  });

  it('treats an aimed shot as a single attack that eats the Action', () => {
    const aimed = spendAll(freshCpredTurn(), [{ ...fast(), aimed: true }]);
    expect(aimed.action?.label).toBe('Celowany atak');
    expect(aimed.action?.attack?.closed).toBe(true);
    expect(spendCpredTurn(aimed, fast())).toEqual({ ok: false, error: 'ROF_EXCEEDED' });
  });

  it('refuses to aim once an Attack Action is already open', () => {
    const opened = spendAll(freshCpredTurn(), [fast()]);
    expect(spendCpredTurn(opened, { ...fast(), aimed: true })).toEqual({
      ok: false,
      error: 'AIM_NEEDS_FULL_ACTION',
    });
  });

  it('grants Bieg a second Move Action, but only after the first was spent', () => {
    expect(
      spendCpredTurn(freshCpredTurn(), { kind: 'action', actionId: CPRED_ACTION_RUN }),
    ).toEqual({ ok: false, error: 'RUN_NEEDS_MOVE' });
    const running = spendAll(freshCpredTurn(), [
      { kind: 'move' },
      { kind: 'action', actionId: CPRED_ACTION_RUN },
    ]);
    expect(running.moveMax).toBe(2);
    const runMoved = spendAll(running, [{ kind: 'move' }]);
    expect(runMoved.moveUsed).toBe(2);
    expect(spendCpredTurn(runMoved, { kind: 'move' })).toEqual({
      ok: false,
      error: 'NO_MOVE_LEFT',
    });
  });

  it('never charges for a free action', () => {
    const state = freshCpredTurn();
    const drawn = spendCpredTurn(state, { kind: 'action', actionId: 'draw-weapon' });
    expect(drawn).toEqual({ ok: true, state });
  });

  it('rejects an action that is not in the catalogue', () => {
    expect(spendCpredTurn(freshCpredTurn(), { kind: 'action', actionId: 'teleport' })).toEqual({
      ok: false,
      error: 'UNKNOWN_ACTION',
    });
  });

  it('keeps the catalogue free of duplicate ids and gives every entry a name', () => {
    const ids = CPRED_ACTIONS.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const action of CPRED_ACTIONS) {
      expect(action.name.length).toBeGreaterThan(0);
      expect(cpredAction(action.id)).toBe(action);
    }
  });
});

describe('forceCpredTurn (the GM is never blocked)', () => {
  it('books a third attack and counts the overspend', () => {
    const twice = spendAll(freshCpredTurn(), [fast(), fast()]);
    const third = forceCpredTurn(twice, fast());
    expect(third.action?.attack?.count).toBe(3);
    expect(third.overspent).toBe(1);
  });

  it('replaces the Action of an NPC that already acted', () => {
    const reloaded = spendAll(freshCpredTurn(), [
      { kind: 'action', actionId: CPRED_ACTION_RELOAD },
    ]);
    const forced = forceCpredTurn(reloaded, { kind: 'action', actionId: CPRED_ACTION_STAND_UP });
    expect(forced.action?.id).toBe(CPRED_ACTION_STAND_UP);
    expect(forced.overspent).toBe(1);
  });

  it('leaves a legal spend alone, overspend counter included', () => {
    const moved = forceCpredTurn(freshCpredTurn(), { kind: 'move' });
    expect(moved.moveUsed).toBe(1);
    expect(moved.overspent).toBe(0);
  });
});

describe('turn state round-trip and projection', () => {
  it('survives serialization', () => {
    const state = spendAll(freshCpredTurn(), [{ kind: 'move' }, fast('pistol', 'Zgrzyt')]);
    expect(readCpredTurn(JSON.stringify(state))).toEqual(state);
  });

  it('falls back to a fresh turn on unreadable input', () => {
    expect(readCpredTurn('{not json')).toEqual(freshCpredTurn());
    expect(readCpredTurn(null)).toEqual(freshCpredTurn());
    expect(readCpredTurn(42)).toEqual(freshCpredTurn());
  });

  it('paints Ruch, Akcja and Ataki for the tracker', () => {
    const budget = cpredTurnBudget(freshCpredTurn());
    expect(budget.resources.map((r) => [r.id, r.used, r.max])).toEqual([
      ['move', 0, 1],
      ['action', 0, 1],
      ['attacks', 0, 2],
    ]);
    expect(budget.note).toBeUndefined();
  });

  it('shows a closed Attack Action at its real ceiling', () => {
    const budget = cpredTurnBudget(spendAll(freshCpredTurn(), [slow('shotgun', 'Strzelba')]));
    const attacks = budget.resources.find((resource) => resource.id === 'attacks');
    expect(attacks).toEqual({ id: 'attacks', label: 'Ataki', used: 1, max: 1 });
    expect(budget.note).toBe('Atak: Strzelba');
  });

  it('names both weapons of a split Attack Action', () => {
    const budget = cpredTurnBudget(
      spendAll(freshCpredTurn(), [fast('a', 'Zgrzyt'), fast('b', 'Maczeta')]),
    );
    expect(budget.note).toBe('Atak: Zgrzyt + Maczeta');
  });

  it('reports an overspending GM', () => {
    const twice = spendAll(freshCpredTurn(), [fast(), fast()]);
    expect(cpredTurnBudget(forceCpredTurn(twice, fast())).overspent).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * Movement in metres (stage 14c)
 * ------------------------------------------------------------------ */

/** A turn belonging to somebody with RUCH 6, i.e. 12 m per Move Action. */
function walker(metresPerMove = 12): CpredTurnState {
  return freshCpredTurn({ metresPerMove });
}

/** Walks `metres` of path, asserting the step was legal. */
function walk(state: CpredTurnState, metres: number, hard?: boolean): CpredTurnState {
  const result = spendCpredTurn(state, { kind: 'move', metres, ...(hard ? { hard } : {}) });
  if (!result.ok) throw new Error(`unexpected refusal: ${result.error}`);
  return result.state;
}

describe('cpred movement budget', () => {
  it('lets a RUCH 6 character walk 11 m and refuses the next 3 m', () => {
    const after = walk(walker(), 11);
    expect(after.metresUsed).toBe(11);
    const tooFar = spendCpredTurn(after, { kind: 'move', metres: 3 });
    expect(tooFar).toEqual({ ok: false, error: 'NO_MOVE_LEFT' });
  });

  it('spends one pool across several drags, not one budget per drag', () => {
    const after = walk(walk(walk(walker(), 4), 4), 4);
    expect(after.metresUsed).toBe(12);
    expect(spendCpredTurn(after, { kind: 'move', metres: 0.5 }).ok).toBe(false);
  });

  it('splits movement around the Action („ruch → atak → ruch")', () => {
    const moved = walk(walker(), 5);
    const attacked = spendAll(moved, [fast()]);
    const finished = walk(attacked, 7);
    expect(finished.metresUsed).toBe(12);
    expect(finished.action?.id).toBe(CPRED_ACTION_ATTACK);
  });

  it('lets the last legal metre through despite float noise', () => {
    // 3 × 4.1 m adds up to 12.299…; the budget is 12.3 after rounding.
    const after = walk(walk(walk(walker(12.3), 4.1), 4.1), 4.1);
    expect(after.metresUsed).toBeCloseTo(12.3, 5);
  });

  it('gives Bieg a second Move Action worth of metres', () => {
    const moved = walk(walker(), 12);
    const running = spendCpredTurn(moved, { kind: 'action', actionId: CPRED_ACTION_RUN });
    expect(running.ok).toBe(true);
    if (!running.ok) return;
    const after = walk(running.state, 12);
    expect(after.metresUsed).toBe(24);
    expect(spendCpredTurn(after, { kind: 'move', metres: 1 }).ok).toBe(false);
  });

  it('unlocks Bieg once the first metre is walked, not before', () => {
    expect(spendCpredTurn(walker(), { kind: 'action', actionId: CPRED_ACTION_RUN })).toEqual({
      ok: false,
      error: 'RUN_NEEDS_MOVE',
    });
    const stepped = walk(walker(), 1);
    expect(spendCpredTurn(stepped, { kind: 'action', actionId: CPRED_ACTION_RUN }).ok).toBe(true);
  });

  it('charges hard going double', () => {
    const after = walk(walker(), 6, true);
    expect(after.metresUsed).toBe(12);
    expect(spendCpredTurn(after, { kind: 'move', metres: 1 }).ok).toBe(false);
  });

  it('remembers a declared hard going for later steps', () => {
    const declared = setCpredHardTerrain(walker(), true);
    expect(walk(declared, 3).metresUsed).toBe(6);
  });

  it('books the „Akcja Ruchu" button as a whole Move Action of metres', () => {
    const after = spendCpredTurn(walker(), { kind: 'move' });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.state.metresUsed).toBe(12);
    expect(after.state.moveUsed).toBe(1);
    // Narrated movement is still movement: no drag fits afterwards.
    expect(spendCpredTurn(after.state, { kind: 'move', metres: 1 }).ok).toBe(false);
  });

  it('leaves a participant without a sheet unpoliced', () => {
    const statist = freshCpredTurn();
    const after = walk(statist, 400);
    expect(after.metresUsed).toBe(400);
    expect(after.moveUsed).toBe(1);
    expect(cpredTurnBudget(after).distance).toBeUndefined();
  });

  it('shrinks what is left when a leg breaks mid-turn', () => {
    const moved = walk(walker(), 6);
    // A Critical Injury lands on somebody else's turn: RUCH 6 → 2, so 4 m.
    const hurt = withCpredMoveAllowance(moved, { metresPerMove: 4, note: 'Złamana noga −4' });
    expect(cpredMetresLeft(hurt)).toBe(0);
    expect(spendCpredTurn(hurt, { kind: 'move', metres: 1 }).ok).toBe(false);
    expect(cpredTurnBudget(hurt).distance?.note).toBe('Złamana noga −4');
  });

  it('paints the distance as „used / max m" for the tracker', () => {
    const budget = cpredTurnBudget(walk(walker(), 7.5));
    expect(budget.distance).toEqual({ label: 'Dystans', used: 7.5, max: 12, unit: 'm' });
    expect(budget.resources.find((r) => r.id === 'move')).toEqual({
      id: 'move',
      label: 'Ruch',
      used: 1,
      max: 1,
    });
  });

  it('explains a refusal in metres, not in rules', () => {
    const after = walk(walker(), 10);
    expect(cpredMoveRefusal(after, 5)).toBe('Za daleko o 3 m — zostało ci 2 m ruchu.');
  });

  it('lets the GM walk past the budget and counts the overspend', () => {
    const after = forceCpredTurn(walk(walker(), 12), { kind: 'move', metres: 8 });
    expect(after.metresUsed).toBe(20);
    expect(after.overspent).toBe(1);
    expect(cpredTurnBudget(after).distance).toEqual({
      label: 'Dystans',
      used: 20,
      max: 12,
      unit: 'm',
    });
  });

  it('survives a round trip through the JSON column', () => {
    const declared = setCpredHardTerrain(walk(walker(), 3.5), true);
    const restored = readCpredTurn(JSON.stringify(declared));
    expect(restored).toEqual(declared);
  });

  it('reads a stage 14b row back as a turn that has not walked anywhere', () => {
    const legacy = readCpredTurn({ moveMax: 1, moveUsed: 1, action: null, overspent: 0 });
    expect(legacy.metresUsed).toBe(0);
    expect(legacy.metresPerMove).toBeNull();
    expect(legacy.moveUsed).toBe(1);
  });
});
