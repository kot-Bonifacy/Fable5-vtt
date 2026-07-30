import { describe, expect, it } from 'vitest';
import {
  CPRED_ACTIONS,
  CPRED_ACTION_ATTACK,
  CPRED_ACTION_RELOAD,
  CPRED_ACTION_RUN,
  CPRED_ACTION_STAND_UP,
  CPRED_ATTACKS_PER_ACTION,
  cpredAction,
  cpredTurnBudget,
  forceCpredTurn,
  freshCpredTurn,
  readCpredTurn,
  spendCpredTurn,
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
