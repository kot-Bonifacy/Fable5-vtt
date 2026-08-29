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
  cpredRunMetres,
  cpredTurnBlockReason,
  cpredTurnPhaseRan,
  cpredTurnBudget,
  forceCpredTurn,
  freshCpredTurn,
  markCpredTurnPhase,
  markCpredRoundOnce,
  clearCpredRoundOnce,
  cpredRoundOnceUsed,
  readCpredTurn,
  readCpredTurnLedger,
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
    expect(budget.distance).toEqual({
      label: 'Dystans',
      used: 7.5,
      max: 12,
      unit: 'm',
      // The Action is still unspent, so a Bieg is still on the table.
      extra: { label: 'Bieg', max: 12 },
    });
    expect(budget.resources.find((r) => r.id === 'move')).toEqual({
      id: 'move',
      label: 'Ruch',
      used: 1,
      max: 1,
    });
  });

  it('offers a Bieg as a second Move Action while the Action is unspent', () => {
    expect(cpredRunMetres(walker())).toBe(12);
    expect(cpredRunMetres(walk(walker(), 12))).toBe(12);
  });

  it('takes the Bieg off the table once the Action is gone', () => {
    const attacked = spendAll(walker(), [fast()]);
    expect(cpredRunMetres(attacked)).toBe(0);
    expect(cpredTurnBudget(attacked).distance?.extra).toBeUndefined();
    // A wound that took the Action (14e) closes the same door, and so does one
    // that took the Move Action — a Bieg would only grant a move it refuses.
    expect(cpredRunMetres(freshCpredTurn({ metresPerMove: 12 }, { noAction: 'Uraz' }))).toBe(0);
    expect(cpredRunMetres(freshCpredTurn({ metresPerMove: 12 }, { noMove: 'Uraz' }))).toBe(0);
  });

  it('folds the Bieg into the maximum once it is actually taken', () => {
    const run = spendAll(walk(walker(), 12), [{ kind: 'action', actionId: CPRED_ACTION_RUN }]);
    // The metres moved from „extra" into „max": there is nothing left to trade,
    // and the map must not draw the same ten metres as a second band twice.
    expect(cpredTurnBudget(run).distance?.max).toBe(24);
    expect(cpredRunMetres(run)).toBe(0);
  });

  it('offers nothing to a participant without a sheet', () => {
    expect(cpredRunMetres(freshCpredTurn())).toBe(0);
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
      extra: { label: 'Bieg', max: 12 },
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

/* ------------------------------------------------------------------ *
 * Turn automation (stage 14e)
 * ------------------------------------------------------------------ */

describe('debts one turn hands to the next', () => {
  const spine = 'Uraz kręgosłupa: w tej turze nie wykonujesz Akcji (Akcja Ruchu zostaje).';
  const ear = 'Uraz ucha: po marszu ponad 4 m w tej turze nie wykonujesz Akcji Ruchu.';

  it('refuses the Action and lets the walking through', () => {
    const state = freshCpredTurn({ metresPerMove: 12 }, { noAction: spine });
    const acted = spendCpredTurn(state, { kind: 'action', actionId: CPRED_ACTION_RELOAD });
    expect(acted).toEqual({ ok: false, error: 'ACTION_BLOCKED' });
    // „ale możesz wykonać Akcję Ruchu" — the half of the rule that is easy to
    // lose when a block is implemented as „the turn is over".
    expect(spendCpredTurn(state, { kind: 'move', metres: 8 }).ok).toBe(true);
  });

  it('refuses an attack too — an attack is an Action', () => {
    const state = freshCpredTurn({ metresPerMove: 12 }, { noAction: spine });
    expect(spendCpredTurn(state, fast())).toEqual({ ok: false, error: 'ACTION_BLOCKED' });
  });

  it('refuses the walk and lets the Action through', () => {
    const state = freshCpredTurn({ metresPerMove: 12 }, { noMove: ear });
    expect(spendCpredTurn(state, { kind: 'move', metres: 1 })).toEqual({
      ok: false,
      error: 'MOVE_BLOCKED',
    });
    expect(spendCpredTurn(state, { kind: 'action', actionId: CPRED_ACTION_RELOAD }).ok).toBe(true);
  });

  it('hands the GM the reason, not just the code', () => {
    const state = freshCpredTurn(null, { noAction: spine });
    expect(cpredTurnBlockReason(state, 'ACTION_BLOCKED')).toBe(spine);
    expect(cpredTurnBlockReason(state, 'NO_ACTION_LEFT')).toBeNull();
  });

  it('paints a blocked resource as spent, with the reason in the note', () => {
    const budget = cpredTurnBudget(freshCpredTurn({ metresPerMove: 12 }, { noMove: ear }));
    expect(budget.resources.find((r) => r.id === 'move')?.used).toBe(1);
    expect(budget.note).toContain('Uraz ucha');
  });

  it('lets the GM force past a block and counts the overspend', () => {
    const state = freshCpredTurn(null, { noAction: spine });
    const forced = forceCpredTurn(state, { kind: 'action', actionId: CPRED_ACTION_RELOAD });
    expect(forced.overspent).toBe(1);
    expect(forced.action?.id).toBe(CPRED_ACTION_RELOAD);
  });

  it('does not survive into the turn after next', () => {
    const blocked = freshCpredTurn(null, { noAction: spine });
    expect(freshCpredTurn(null).blockedAction).toBeNull();
    expect(blocked.blockedAction).toBe(spine);
  });
});

describe('metres walked versus metres spent', () => {
  it('counts hard going twice in the budget and once on the ground', () => {
    const after = walk(walker(), 3, true);
    expect(after.metresUsed).toBe(6);
    // The rib does not know the ground was rubble: „ponad 4 m na piechotę"
    // is about distance covered, and 3 m is 3 m.
    expect(after.metresWalked).toBe(3);
  });

  it('accumulates raw distance across several drags', () => {
    const after = walk(walk(walker(), 2.5), 3);
    expect(after.metresWalked).toBe(5.5);
  });

  it('counts a narrated Move Action as a full move of walking', () => {
    const after = spendCpredTurn(walker(), { kind: 'move' });
    expect(after.ok && after.state.metresWalked).toBe(12);
  });

  it('counts the GM’s forced overrun on the ground as well', () => {
    const after = forceCpredTurn(walk(walker(), 12), { kind: 'move', metres: 8 });
    expect(after.metresWalked).toBe(20);
  });

  it('reads a stage 14c row back with the budget as its distance', () => {
    // Nothing in an old row says how much of the budget was terrain, so the
    // safe reading is „they walked what they paid" — it errs towards enforcing
    // the injury rather than towards forgetting it.
    const legacy = readCpredTurn({ moveMax: 1, moveUsed: 1, metresUsed: 9, overspent: 0 });
    expect(legacy.metresWalked).toBe(9);
    expect(legacy.blockedAction).toBeNull();
    expect(legacy.blockedMove).toBeNull();
  });
});

describe('the turn-hook ledger', () => {
  it('remembers each phase separately, per round', () => {
    const ended = markCpredTurnPhase({}, 'turn-end', 3);
    expect(cpredTurnPhaseRan(ended, 'turn-end', 3)).toBe(true);
    // The start of that same turn is a different question with its own answer.
    expect(cpredTurnPhaseRan(ended, 'turn-start', 3)).toBe(false);
    // Stepping back and forward lands on the same round: nothing fires twice.
    expect(cpredTurnPhaseRan(ended, 'turn-end', 4)).toBe(false);
    expect(cpredTurnPhaseRan({}, 'turn-end', 3)).toBe(false);
  });

  it('lives outside the budget, because a fresh budget must not clear it', () => {
    // The whole reason for the extra column: „Zwróć turę" and stepping the
    // pointer back both hand out a fresh budget, and both must leave the
    // ledger standing — otherwise the second pass burns the same NPC again.
    const ledger = markCpredTurnPhase(markCpredTurnPhase({}, 'turn-start', 2), 'turn-end', 2);
    expect(readCpredTurnLedger(JSON.stringify(ledger))).toEqual(ledger);
    expect(Object.keys(freshCpredTurn())).not.toContain('endedRound');
  });

  it('reads garbage as „nothing has fired yet"', () => {
    expect(readCpredTurnLedger('nie-json')).toEqual({});
    expect(readCpredTurnLedger(null)).toEqual({});
    expect(readCpredTurnLedger({ endedRound: 'trzy' })).toEqual({});
  });

  it('survives the JSON column with everything stage 14e added to the budget', () => {
    const state = setCpredHardTerrain(
      { ...walk(walker(10), 3.5), blockedMove: 'Uraz ucha: …', blockedAction: 'Kręgosłup: …' },
      true,
    );
    expect(readCpredTurn(JSON.stringify(state))).toEqual(state);
  });
});

/**
 * „Pierwsze w tej Rundzie" (etap 30a) — Redukcja obrażeń i Wykrycie słabości.
 *
 * Stempel jest numerem Rundy, nie flagą: stary wpis z poprzedniej Rundy sam
 * przestaje obowiązywać, więc nic nie trzeba czyścić przy przejściu dalej.
 */
describe('zdolności raz na Rundę', () => {
  it('stempluje Rundę i widzi ją tylko w tej Rundzie', () => {
    const ledger = markCpredRoundOnce({}, 'damageReduction', 3);
    expect(cpredRoundOnceUsed(ledger, 'damageReduction', 3)).toBe(true);
    expect(cpredRoundOnceUsed(ledger, 'damageReduction', 4)).toBe(false);
    expect(cpredRoundOnceUsed(ledger, 'weakSpot', 3)).toBe(false);
  });

  it('nie miesza się ze stemplami początku i końca tury', () => {
    const ledger = markCpredRoundOnce(markCpredTurnPhase({}, 'turn-end', 2), 'weakSpot', 2);
    expect(cpredTurnPhaseRan(ledger, 'turn-end', 2)).toBe(true);
    expect(cpredRoundOnceUsed(ledger, 'weakSpot', 2)).toBe(true);
  });

  it('przechodzi przez zapis i odczyt', () => {
    const stored = JSON.stringify(markCpredRoundOnce({ startedRound: 5 }, 'weakSpot', 5));
    const read = readCpredTurnLedger(stored);
    expect(read.startedRound).toBe(5);
    expect(cpredRoundOnceUsed(read, 'weakSpot', 5)).toBe(true);
  });

  it('„Cofnij" zdejmuje stempel i zostawia resztę', () => {
    const ledger = markCpredRoundOnce(
      markCpredTurnPhase({}, 'turn-start', 7),
      'damageReduction',
      7,
    );
    const cleared = clearCpredRoundOnce(ledger, 'damageReduction');
    expect(cpredRoundOnceUsed(cleared, 'damageReduction', 7)).toBe(false);
    expect(cpredTurnPhaseRan(cleared, 'turn-start', 7)).toBe(true);
  });

  it('odczyt wycina śmieci w stemplach', () => {
    expect(readCpredTurnLedger('{"once":{"weakSpot":"trzy","nieznane":2}}').once).toBeUndefined();
  });
});
