import { describe, expect, it } from 'vitest';
import { buildCpredRegistry, createDefaultCharacterData, type CpredRegistry } from './character.js';
import {
  CPRED_SITUATIONAL_MODIFIER_LIMIT,
  effectiveMove,
  planCpredCheck,
  woundCheckPenalty,
  woundState,
} from './rolls.js';
import { formatRollNotation, rollFormula, type DiceRng } from '../../dice.js';

const registry: CpredRegistry = buildCpredRegistry(
  {
    skills: [
      { id: 'perception', name: 'Percepcja', stat: 'int' },
      { id: 'handgun', name: 'Broń krótka', stat: 'ref' },
    ],
  },
  { roles: [{ id: 'solo', name: 'Solo', ability: 'Zmysł Walki' }] },
);

/** Sheet with stats all 5 (35 HP, threshold 18) plus the given overrides. */
function sheet(overrides: Partial<ReturnType<typeof createDefaultCharacterData>> = {}) {
  return { ...createDefaultCharacterData(), ...overrides };
}

/** Deterministic RNG returning the scripted values in order. */
function scriptedRng(values: number[]): DiceRng {
  let index = 0;
  return () => values[index++] ?? 1;
}

describe('wound states (Easy Mode "Progi Rany")', () => {
  const stats = { body: 5, will: 5 }; // hpMax 35, serious threshold 18

  it('classifies the four states by current HP', () => {
    expect(woundState(35, stats)).toBe('healthy');
    expect(woundState(34, stats)).toBe('light');
    expect(woundState(19, stats)).toBe('light');
    expect(woundState(18, stats)).toBe('serious'); // exactly half → serious
    expect(woundState(1, stats)).toBe('serious');
    expect(woundState(0, stats)).toBe('mortal');
    expect(woundState(-5, stats)).toBe('mortal');
  });

  it('applies −2 seriously wounded and −4 mortally wounded to checks', () => {
    expect(woundCheckPenalty('healthy')).toBe(0);
    expect(woundCheckPenalty('light')).toBe(0);
    expect(woundCheckPenalty('serious')).toBe(-2);
    expect(woundCheckPenalty('mortal')).toBe(-4);
  });

  it('drops MOVE by 6 when mortally wounded, never below 1', () => {
    expect(effectiveMove({ move: 8 }, 'serious')).toBe(8);
    expect(effectiveMove({ move: 8 }, 'mortal')).toBe(2);
    expect(effectiveMove({ move: 4 }, 'mortal')).toBe(1);
  });
});

describe('planCpredCheck', () => {
  it('builds 1d10 + stat + skill level with a labelled breakdown', () => {
    const data = sheet({
      stats: { ...createDefaultCharacterData().stats, int: 7 },
      skills: { perception: 6 },
    });
    const result = planCpredCheck(data, registry, { kind: 'skill', skillId: 'perception' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.title).toBe('Percepcja (INT)');
    expect(result.plan.modifierTotal).toBe(13);
    expect(formatRollNotation(result.plan.formula)).toBe('1d10+13');
    expect(result.plan.breakdown).toEqual([
      { label: 'Inteligencja (INT)', value: 7, kind: 'stat' },
      { label: 'Percepcja', value: 6, kind: 'skill' },
    ]);
  });

  it('rolls an untrained skill on the bare stat and says so', () => {
    const result = planCpredCheck(sheet(), registry, { kind: 'skill', skillId: 'handgun' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.modifierTotal).toBe(5);
    expect(result.plan.breakdown[1]).toEqual({
      label: 'Broń krótka (nietrenowana)',
      value: 0,
      kind: 'skill',
    });
  });

  it('rolls a bare stat check', () => {
    const result = planCpredCheck(sheet(), registry, { kind: 'stat', statId: 'body' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.title).toBe('Budowa Ciała (BC)');
    expect(formatRollNotation(result.plan.formula)).toBe('1d10+5');
  });

  it('adds the wound penalty automatically (stage criterion)', () => {
    // 35 HP max, 17 left → seriously wounded → −2 on every check.
    const data = sheet({ hpCurrent: 17, skills: { perception: 4 } });
    const result = planCpredCheck(data, registry, { kind: 'skill', skillId: 'perception' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.woundState).toBe('serious');
    expect(result.plan.breakdown).toContainEqual({
      label: 'Poważnie ranny',
      value: -2,
      kind: 'wound',
    });
    expect(result.plan.modifierTotal).toBe(5 + 4 - 2);
  });

  it('mortally wounded takes −4', () => {
    const result = planCpredCheck(sheet({ hpCurrent: 0 }), registry, {
      kind: 'stat',
      statId: 'ref',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.modifierTotal).toBe(5 - 4);
  });

  it('adds the situational modifier and spent Luck', () => {
    const data = sheet({ luckCurrent: 4 });
    const result = planCpredCheck(data, registry, {
      kind: 'stat',
      statId: 'cool',
      modifier: -3,
      luckSpent: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.luckSpent).toBe(2);
    expect(result.plan.modifierTotal).toBe(5 - 3 + 2);
    expect(result.plan.breakdown).toContainEqual({
      label: 'Modyfikator sytuacyjny',
      value: -3,
      kind: 'situational',
    });
    expect(result.plan.breakdown).toContainEqual({
      label: 'Szczęście (2 pkt)',
      value: 2,
      kind: 'luck',
    });
  });

  it('omits the flat term when everything cancels out', () => {
    // stat 4, mortally wounded (−4) → bare 1d10.
    const data = sheet({
      stats: { ...createDefaultCharacterData().stats, ref: 4 },
      hpCurrent: 0,
    });
    const result = planCpredCheck(data, registry, { kind: 'stat', statId: 'ref' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(formatRollNotation(result.plan.formula)).toBe('1d10');
  });

  it('rejects unknown skills, stats, wild modifiers and overspent Luck', () => {
    expect(planCpredCheck(sheet(), registry, { kind: 'skill', skillId: 'nope' })).toEqual({
      ok: false,
      error: 'UNKNOWN_SKILL',
    });
    expect(planCpredCheck(sheet(), registry, { kind: 'stat', statId: 'nope' as never })).toEqual({
      ok: false,
      error: 'UNKNOWN_STAT',
    });
    expect(
      planCpredCheck(sheet(), registry, {
        kind: 'stat',
        statId: 'int',
        modifier: CPRED_SITUATIONAL_MODIFIER_LIMIT + 1,
      }),
    ).toEqual({ ok: false, error: 'BAD_MODIFIER' });
    expect(
      planCpredCheck(sheet({ luckCurrent: 1 }), registry, {
        kind: 'stat',
        statId: 'int',
        luckSpent: 2,
      }),
    ).toEqual({ ok: false, error: 'NOT_ENOUGH_LUCK' });
    expect(
      planCpredCheck(sheet(), registry, { kind: 'stat', statId: 'int', luckSpent: -1 }),
    ).toEqual({ ok: false, error: 'BAD_REQUEST' });
  });

  it('keeps the CP RED critical rule (the plan is still a single d10 check)', () => {
    const data = sheet({ skills: { perception: 3 } });
    const result = planCpredCheck(data, registry, { kind: 'skill', skillId: 'perception' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // natural 10 → extra d10 (6) added: 10 + 8 + 6 = 24
    const roll = rollFormula(result.plan.formula, scriptedRng([10, 6]));
    expect(roll.critical).toEqual({ type: 'crit', extraRoll: 6 });
    expect(roll.total).toBe(24);
  });
});
