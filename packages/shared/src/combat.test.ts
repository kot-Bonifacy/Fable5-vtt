import { describe, expect, it } from 'vitest';
import {
  activeCombatant,
  filterCombatForPlayer,
  findInitiativeTies,
  nextTurn,
  previousTurn,
  resolveInitiativeOrder,
  sortCombatants,
  type CombatView,
  type CombatantView,
} from './combat.js';

function combatant(partial: Partial<CombatantView> & { id: string }): CombatantView {
  return {
    tokenId: `token-${partial.id}`,
    name: partial.id,
    imageUrl: null,
    initiative: null,
    tieBreak: null,
    order: 0,
    ownerId: null,
    ...partial,
  };
}

function combat(combatants: CombatantView[], partial: Partial<CombatView> = {}): CombatView {
  return {
    id: 'combat-1',
    sceneId: 'scene-1',
    round: 0,
    activeCombatantId: null,
    combatants,
    ...partial,
  };
}

describe('sortCombatants', () => {
  it('orders by initiative, highest first', () => {
    const order = sortCombatants([
      combatant({ id: 'a', initiative: 12 }),
      combatant({ id: 'b', initiative: 18 }),
      combatant({ id: 'c', initiative: 15 }),
    ]).map((c) => c.id);
    expect(order).toEqual(['b', 'c', 'a']);
  });

  it('lets the manual position decide a tie — the GM drag has the final say', () => {
    // Higher REF, but the GM dragged it below: display follows the drag.
    const order = sortCombatants([
      combatant({ id: 'dragged-down', initiative: 14, tieBreak: 8, order: 5 }),
      combatant({ id: 'dragged-up', initiative: 14, tieBreak: 3, order: 2 }),
    ]).map((c) => c.id);
    expect(order).toEqual(['dragged-up', 'dragged-down']);
  });

  it('never lets the manual position beat a higher initiative', () => {
    const order = sortCombatants([
      combatant({ id: 'low', initiative: 9, order: 0 }),
      combatant({ id: 'high', initiative: 17, order: 9 }),
    ]).map((c) => c.id);
    expect(order).toEqual(['high', 'low']);
  });

  it('puts participants without initiative at the bottom', () => {
    const order = sortCombatants([
      combatant({ id: 'unrolled', order: 1 }),
      combatant({ id: 'rolled', initiative: -3 }),
    ]).map((c) => c.id);
    expect(order).toEqual(['rolled', 'unrolled']);
  });

  it('does not mutate its input', () => {
    const input = [combatant({ id: 'a', initiative: 5 }), combatant({ id: 'b', initiative: 9 })];
    sortCombatants(input);
    expect(input.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('resolveInitiativeOrder', () => {
  it('breaks ties by the tie-breaker (CP RED: REF)', () => {
    const order = resolveInitiativeOrder([
      combatant({ id: 'slow', initiative: 14, tieBreak: 3 }),
      combatant({ id: 'quick', initiative: 14, tieBreak: 8 }),
    ]).map((c) => c.id);
    expect(order).toEqual(['quick', 'slow']);
  });

  it('keeps a drag between genuinely tied participants across renumbering', () => {
    const order = resolveInitiativeOrder([
      combatant({ id: 'dragged-down', initiative: 14, tieBreak: 8, order: 5 }),
      combatant({ id: 'dragged-up', initiative: 14, tieBreak: 8, order: 2 }),
    ]).map((c) => c.id);
    expect(order).toEqual(['dragged-up', 'dragged-down']);
  });

  it('sorts a participant without a sheet below one with a REF', () => {
    const order = resolveInitiativeOrder([
      combatant({ id: 'statist', initiative: 11, tieBreak: null }),
      combatant({ id: 'solo', initiative: 11, tieBreak: 2 }),
    ]).map((c) => c.id);
    expect(order).toEqual(['solo', 'statist']);
  });
});

describe('findInitiativeTies', () => {
  it('reports only genuine ties (same initiative and same REF)', () => {
    const groups = findInitiativeTies([
      combatant({ id: 'a', initiative: 14, tieBreak: 8 }),
      combatant({ id: 'b', initiative: 14, tieBreak: 8 }),
      combatant({ id: 'c', initiative: 14, tieBreak: 5 }),
      combatant({ id: 'd', initiative: 11, tieBreak: 5 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('ignores participants that have not rolled yet', () => {
    expect(findInitiativeTies([combatant({ id: 'a' }), combatant({ id: 'b' })])).toEqual([]);
  });
});

describe('nextTurn', () => {
  const roster = [
    combatant({ id: 'a', initiative: 18 }),
    combatant({ id: 'b', initiative: 14 }),
    combatant({ id: 'c', initiative: 9 }),
  ];

  it('starts round 1 on the highest initiative', () => {
    expect(nextTurn(combat(roster))).toEqual({ round: 1, activeCombatantId: 'a' });
  });

  it('walks down the order inside a round', () => {
    const state = combat(roster, { round: 1, activeCombatantId: 'a' });
    expect(nextTurn(state)).toEqual({ round: 1, activeCombatantId: 'b' });
  });

  it('opens the next round after the last participant', () => {
    const state = combat(roster, { round: 1, activeCombatantId: 'c' });
    expect(nextTurn(state)).toEqual({ round: 2, activeCombatantId: 'a' });
  });

  it('restarts the order when the active participant is gone', () => {
    const state = combat(roster, { round: 3, activeCombatantId: 'removed' });
    expect(nextTurn(state)).toEqual({ round: 3, activeCombatantId: 'a' });
  });

  it('does nothing with an empty roster', () => {
    expect(nextTurn(combat([], { round: 2 }))).toEqual({ round: 2, activeCombatantId: null });
  });

  it('follows a mid-combat initiative change on the next step', () => {
    // Reinforcements roll high and join between two turns of round 2.
    const withLatecomer = [...roster, combatant({ id: 'late', initiative: 16 })];
    const state = combat(withLatecomer, { round: 2, activeCombatantId: 'a' });
    expect(nextTurn(state)).toEqual({ round: 2, activeCombatantId: 'late' });
  });
});

describe('previousTurn', () => {
  const roster = [combatant({ id: 'a', initiative: 18 }), combatant({ id: 'b', initiative: 14 })];

  it('steps back inside a round', () => {
    const state = combat(roster, { round: 2, activeCombatantId: 'b' });
    expect(previousTurn(state)).toEqual({ round: 2, activeCombatantId: 'a' });
  });

  it('wraps back into the previous round', () => {
    const state = combat(roster, { round: 2, activeCombatantId: 'a' });
    expect(previousTurn(state)).toEqual({ round: 1, activeCombatantId: 'b' });
  });

  it('never goes before the first turn of round 1', () => {
    const state = combat(roster, { round: 1, activeCombatantId: 'a' });
    expect(previousTurn(state)).toEqual({ round: 1, activeCombatantId: 'a' });
  });

  it('stays put before the combat has started', () => {
    expect(previousTurn(combat(roster))).toEqual({ round: 0, activeCombatantId: null });
  });
});

describe('filterCombatForPlayer', () => {
  const hiddenEnemy = combatant({ id: 'sniper', initiative: 20, hidden: true });
  const visible = combatant({ id: 'ziti', initiative: 12, ownerId: 'user-1' });

  it('drops hidden participants entirely', () => {
    const view = filterCombatForPlayer(combat([hiddenEnemy, visible], { round: 1 }));
    expect(view.combatants.map((c) => c.id)).toEqual(['ziti']);
    expect(JSON.stringify(view)).not.toContain('sniper');
  });

  it('hides whose turn it is while a hidden participant acts', () => {
    const state = combat([hiddenEnemy, visible], { round: 1, activeCombatantId: 'sniper' });
    expect(filterCombatForPlayer(state).activeCombatantId).toBeNull();
  });

  it('keeps the active participant when it is visible', () => {
    const state = combat([hiddenEnemy, visible], { round: 1, activeCombatantId: 'ziti' });
    const view = filterCombatForPlayer(state);
    expect(view.activeCombatantId).toBe('ziti');
    expect(activeCombatant(view)?.name).toBe('ziti');
  });

  it('strips the hidden flag from the remaining rows', () => {
    const view = filterCombatForPlayer(combat([visible], { round: 1 }));
    expect(view.combatants[0]).not.toHaveProperty('hidden');
  });
});
