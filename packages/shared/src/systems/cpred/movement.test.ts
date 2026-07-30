import { describe, expect, it } from 'vitest';
import {
  CPRED_METRES_PER_MOVE_POINT,
  CPRED_MIN_MOVE,
  armorMovePenalty,
  cpredMoveBudget,
  cpredMoveBudgetFromSheet,
  cpredMovementBlock,
  cpredTerrainFactor,
  injuryMovePenalty,
} from './movement.js';
import type { CpredArmorRow, CpredCriticalInjuryRow } from './character.js';

function armor(penalty: number, extra: Partial<CpredArmorRow> = {}): CpredArmorRow {
  return {
    id: `a${penalty}${extra.location ?? ''}`,
    name: 'Pancerz',
    notes: '',
    sp: 11,
    spCurrent: 11,
    location: 'body',
    ...(penalty !== 0 ? { penalty } : {}),
    ...extra,
  };
}

function injury(name: string, movePenalty?: number): CpredCriticalInjuryRow {
  return {
    id: `criticalInjury.${name}`,
    name,
    effect: '',
    ...(movePenalty !== undefined ? { movePenalty } : {}),
  };
}

describe('effective MOVE', () => {
  it('buys RUCH × 2 metres per Move Action when nothing weighs on it', () => {
    const budget = cpredMoveBudget({ move: 6 });
    expect(budget.move).toBe(6);
    expect(budget.metresPerMove).toBe(6 * CPRED_METRES_PER_MOVE_POINT);
    expect(budget.modifiers).toEqual([]);
    expect(budget.floored).toBe(false);
  });

  it('takes the worst armor penalty rather than summing them (s. 185)', () => {
    expect(armorMovePenalty([armor(-2), armor(-1, { location: 'head' })])).toBe(-2);
    const budget = cpredMoveBudget({
      move: 6,
      armor: [armor(-2), armor(-1, { location: 'head' })],
    });
    expect(budget.move).toBe(4);
  });

  it('ignores armor that is carried but not worn', () => {
    expect(armorMovePenalty([armor(-4, { equipped: false })])).toBe(0);
  });

  it('sums the penalties of the injuries a character carries', () => {
    const injuries = [injury('Zapadnięte płuco', -2), injury('Złamana noga', -4), injury('Blizna')];
    expect(injuryMovePenalty(injuries)).toBe(-6);
  });

  it('never drops below 1, and says so — Mortally Wounded with RUCH 6', () => {
    const budget = cpredMoveBudgetFromSheet({ move: 6, hpCurrent: 0, hpMax: 40 });
    expect(budget.move).toBe(CPRED_MIN_MOVE);
    // The whole point of the floor: a dying character still crawls 2 m.
    expect(budget.metresPerMove).toBe(2);
    expect(budget.floored).toBe(true);
    expect(budget.modifiers).toEqual([{ label: 'Śmiertelnie ranny', value: -6 }]);
  });

  it('stacks armor, wounds and injuries, and explains every one of them', () => {
    const budget = cpredMoveBudgetFromSheet({
      move: 8,
      hpCurrent: 5,
      hpMax: 40,
      armor: [armor(-2)],
      injuries: [injury('Złamana noga', -4)],
    });
    // Seriously Wounded costs no MOVE — only the mortal state does.
    expect(budget.move).toBe(2);
    expect(budget.modifiers.map((m) => m.label)).toEqual(['Pancerz', 'Złamana noga']);
  });

  it('leaves a healthy character alone when the injury carries no penalty', () => {
    const budget = cpredMoveBudgetFromSheet({
      move: 5,
      hpCurrent: 40,
      hpMax: 40,
      injuries: [injury('Uraz ucha')],
    });
    expect(budget.move).toBe(5);
    expect(budget.modifiers).toEqual([]);
  });
});

describe('hard going', () => {
  it('doubles what a metre of path costs', () => {
    expect(cpredTerrainFactor(true)).toBe(2);
    expect(cpredTerrainFactor(false)).toBe(1);
    expect(cpredTerrainFactor(undefined)).toBe(1);
  });
});

describe('statuses that stop a token', () => {
  it('refuses the Prone token and names the Action that fixes it', () => {
    expect(cpredMovementBlock(['prone'])).toContain('Wstanie');
  });

  it('refuses being held and being unconscious', () => {
    expect(cpredMovementBlock(['grappled'])).not.toBeNull();
    expect(cpredMovementBlock(['immobilized'])).not.toBeNull();
    expect(cpredMovementBlock(['unconscious'])).not.toBeNull();
  });

  it('lets a wounded but conscious token walk', () => {
    expect(cpredMovementBlock(['seriously-wounded', 'on-fire'])).toBeNull();
    expect(cpredMovementBlock([])).toBeNull();
  });

  it('reports the deadliest reason first when several apply', () => {
    // „Martwy" outranks „Powalony": telling a corpse to stand up is nonsense.
    expect(cpredMovementBlock(['prone', 'dead'])).toContain('Martwy');
  });
});
