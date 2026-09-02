import { describe, expect, it } from 'vitest';
import { buildCpredRegistry, createDefaultCharacterData, type CpredRegistry } from './character.js';
import {
  CPRED_DIFFICULTY_LADDER,
  CPRED_SITUATIONAL_MODIFIER_LIMIT,
  cpredCheckOutcome,
  cpredDifficultyRungAt,
  effectiveMove,
  planCpredRoll,
  resolveCpredDeathSave,
  woundCheckPenalty,
  woundState,
} from './rolls.js';
import { CPRED_EVERYDAY_DV } from './attacks.js';
import { formatRollNotation, rollFormula, type DiceRng } from '../../dice.js';

const registry: CpredRegistry = buildCpredRegistry(
  {
    skills: [
      { id: 'perception', name: 'Percepcja', stat: 'int' },
      { id: 'handgun', name: 'Broń krótka', stat: 'ref' },
      { id: 'basic-tech', name: 'Podstawowe naprawy', stat: 'tech' },
    ],
  },
  {
    roles: [
      { id: 'solo', name: 'Solo', ability: 'Zmysł Walki' },
      { id: 'tech', name: 'Technik', ability: 'Twórca' },
    ],
  },
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

describe('planCpredRoll', () => {
  it('builds 1d10 + stat + skill level with a labelled breakdown', () => {
    const data = sheet({
      stats: { ...createDefaultCharacterData().stats, int: 7 },
      skills: { perception: 6 },
    });
    const result = planCpredRoll(data, registry, { kind: 'skill', skillId: 'perception' });
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
    const result = planCpredRoll(sheet(), registry, { kind: 'skill', skillId: 'handgun' });
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
    const result = planCpredRoll(sheet(), registry, { kind: 'stat', statId: 'body' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.title).toBe('Budowa Ciała (BC)');
    expect(formatRollNotation(result.plan.formula)).toBe('1d10+5');
  });

  it('adds the wound penalty automatically (stage criterion)', () => {
    // 35 HP max, 17 left → seriously wounded → −2 on every check.
    const data = sheet({ hpCurrent: 17, skills: { perception: 4 } });
    const result = planCpredRoll(data, registry, { kind: 'skill', skillId: 'perception' });
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
    const result = planCpredRoll(sheet({ hpCurrent: 0 }), registry, {
      kind: 'stat',
      statId: 'ref',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.modifierTotal).toBe(5 - 4);
  });

  it('adds the situational modifier and spent Luck', () => {
    const data = sheet({ luckCurrent: 4 });
    const result = planCpredRoll(data, registry, {
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
    const result = planCpredRoll(data, registry, { kind: 'stat', statId: 'ref' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(formatRollNotation(result.plan.formula)).toBe('1d10');
  });

  it('rejects unknown skills, stats, wild modifiers and overspent Luck', () => {
    expect(planCpredRoll(sheet(), registry, { kind: 'skill', skillId: 'nope' })).toEqual({
      ok: false,
      error: 'UNKNOWN_SKILL',
    });
    expect(planCpredRoll(sheet(), registry, { kind: 'stat', statId: 'nope' as never })).toEqual({
      ok: false,
      error: 'UNKNOWN_STAT',
    });
    expect(
      planCpredRoll(sheet(), registry, {
        kind: 'stat',
        statId: 'int',
        modifier: CPRED_SITUATIONAL_MODIFIER_LIMIT + 1,
      }),
    ).toEqual({ ok: false, error: 'BAD_MODIFIER' });
    expect(
      planCpredRoll(sheet({ luckCurrent: 1 }), registry, {
        kind: 'stat',
        statId: 'int',
        luckSpent: 2,
      }),
    ).toEqual({ ok: false, error: 'NOT_ENOUGH_LUCK' });
    expect(
      planCpredRoll(sheet(), registry, { kind: 'stat', statId: 'int', luckSpent: -1 }),
    ).toEqual({ ok: false, error: 'BAD_REQUEST' });
  });

  it('keeps the CP RED critical rule (the plan is still a single d10 check)', () => {
    const data = sheet({ skills: { perception: 3 } });
    const result = planCpredRoll(data, registry, { kind: 'skill', skillId: 'perception' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // natural 10 → extra d10 (6) added: 10 + 8 + 6 = 24
    const roll = rollFormula(result.plan.formula, scriptedRng([10, 6]));
    expect(roll.critical).toEqual({ type: 'crit', extraRoll: 6 });
    expect(roll.total).toBe(24);
  });
});

describe('planCpredRoll — damage (stage 15)', () => {
  const weapon = {
    id: 'w1',
    name: 'Zgrzyt-9',
    notes: '',
    damage: '3k6',
    ammoCurrent: 8,
    ammoMax: 8,
    ammoType: 'Ś. Pistolet',
    rof: '2',
  };

  it('rolls the weapon row’s notation, with no check rule and no wound penalty', () => {
    const data = sheet({ hpCurrent: 0, weapons: [weapon] });
    const result = planCpredRoll(data, registry, { kind: 'damage', weaponRowId: 'w1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(formatRollNotation(result.plan.formula)).toBe('3d6');
    expect(result.plan.checkRule).toBe(false);
    expect(result.plan.breakdown).toEqual([]);
    expect(result.plan.damage).toEqual({ location: 'body', weaponName: 'Zgrzyt-9' });
    expect(result.plan.title).toBe('Zgrzyt-9 — obrażenia (Korpus)');
  });

  it('carries the aimed location and the GM’s flat modifier', () => {
    const data = sheet({ weapons: [weapon] });
    const result = planCpredRoll(data, registry, {
      kind: 'damage',
      weaponRowId: 'w1',
      location: 'head',
      modifier: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(formatRollNotation(result.plan.formula)).toBe('3d6+2');
    expect(result.plan.damage?.location).toBe('head');
    expect(result.plan.title).toContain('Głowa');
  });

  it('rejects an unknown weapon row, unrollable damage and spent Luck', () => {
    const data = sheet({ weapons: [weapon, { ...weapon, id: 'w2', damage: 'brak' }] });
    expect(planCpredRoll(data, registry, { kind: 'damage', weaponRowId: 'nope' })).toEqual({
      ok: false,
      error: 'UNKNOWN_WEAPON',
    });
    expect(planCpredRoll(data, registry, { kind: 'damage', weaponRowId: 'w2' })).toEqual({
      ok: false,
      error: 'BAD_DAMAGE',
    });
    expect(
      planCpredRoll(data, registry, { kind: 'damage', weaponRowId: 'w1', luckSpent: 1 }),
    ).toEqual({ ok: false, error: 'BAD_REQUEST' });
  });
});

describe('planCpredRoll — Death Save (stage 15)', () => {
  it('rolls a bare d10 against BODY, with the accumulated modifiers beside it', () => {
    const data = sheet({
      hpCurrent: 0,
      deathSaves: 2,
      criticalInjuries: [
        { id: 'injury.urwana-reka', name: 'Urwana ręka', effect: '…', deathSavePenalty: 1 },
      ],
    });
    const result = planCpredRoll(data, registry, { kind: 'deathSave' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(formatRollNotation(result.plan.formula)).toBe('1d10');
    expect(result.plan.checkRule).toBe(false);
    expect(result.plan.deathSave).toEqual({
      target: 5,
      modifier: 3,
      savesTaken: 2,
      injuryPenalty: 1,
    });
  });

  it('survives under BODY, dies on it, and always dies on a natural 10', () => {
    const plan = { target: 7, modifier: 2 };
    expect(resolveCpredDeathSave(4, plan)).toMatchObject({ survived: true, total: 6 });
    expect(resolveCpredDeathSave(5, plan)).toMatchObject({ survived: false, total: 7 });
    expect(resolveCpredDeathSave(10, { target: 20, modifier: 0 })).toMatchObject({
      survived: false,
      automaticFailure: true,
    });
  });
});

/**
 * Wyczucie zagrożenia (etap 30a, s. 146): „Za każdy punkt dodaj +1 do Testów
 * Percepcji". Liczy się z samej karty, więc podgląd u klienta i werdykt
 * serwera dochodzą do tej samej liczby bez żadnego kontekstu.
 */
describe('Wyczucie zagrożenia w Teście Percepcji', () => {
  function solo(points: number) {
    return sheet({
      roleId: 'solo',
      roleAbilityRank: 6,
      combatAwareness: { threatSense: points },
      skills: { perception: 4 },
    });
  }

  it('dokłada nazwany wiersz do rozbicia Percepcji', () => {
    const planned = planCpredRoll(solo(3), registry, { kind: 'skill', skillId: 'perception' });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const row = planned.plan.breakdown.find((entry) => entry.label.startsWith('Wyczucie'));
    expect(row).toEqual({ label: 'Wyczucie zagrożenia 3', value: 3, kind: 'situational' });
    // INT 5 + Percepcja 4 + 3.
    expect(planned.plan.modifierTotal).toBe(12);
  });

  it('nie dotyka innych Umiejętności', () => {
    const planned = planCpredRoll(solo(3), registry, { kind: 'skill', skillId: 'handgun' });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.breakdown.some((entry) => entry.label.startsWith('Wyczucie'))).toBe(false);
  });

  it('bez przydziału nie dokłada wiersza', () => {
    const planned = planCpredRoll(solo(0), registry, { kind: 'skill', skillId: 'perception' });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.breakdown.some((entry) => entry.label.startsWith('Wyczucie'))).toBe(false);
  });
});

/**
 * Wykrycie słabości (etap 30a, s. 146): „+1 do obrażeń (przed uwzględnieniem
 * pancerza)". Wpada do rzutu na obrażenia jako term, a nie do rachunku
 * pancerza — więc pancerz, który potem trzeba pokonać, jest pełny.
 */
describe('Wykrycie słabości w rzucie na obrażenia', () => {
  const armed = sheet({
    weapons: [
      {
        id: 'w1',
        name: 'Ciężki pistolet',
        damage: '3k6',
        notes: '',
        ammoCurrent: 8,
        ammoMax: 8,
        ammoType: '',
        rof: '1',
      },
    ],
  });

  it('dokłada term i nazwany wiersz', () => {
    const planned = planCpredRoll(armed, registry, {
      kind: 'damage',
      weaponRowId: 'w1',
      weakSpot: 2,
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(formatRollNotation(planned.plan.formula)).toBe('3d6+2');
    expect(planned.plan.breakdown).toContainEqual({
      label: 'Wykrycie słabości 2',
      value: 2,
      kind: 'situational',
    });
    expect(planned.plan.modifierTotal).toBe(2);
  });

  it('bez liczby zostawia notację broni nietkniętą', () => {
    const planned = planCpredRoll(armed, registry, { kind: 'damage', weaponRowId: 'w1' });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(formatRollNotation(planned.plan.formula)).toBe('3d6');
  });
});

/**
 * „Dodaj poziom tej Specjalizacji do Testów Podstawowych napraw…" (s. 147,
 * etap 30b). Liczone z samej karty, jak Precyzyjny atak w 30a — podgląd
 * klienta i werdykt serwera dochodzą do tej samej liczby bez kontekstu.
 */
describe('Naprawa Twórcy w Testach technicznych', () => {
  it('dokłada poziom Specjalizacji do wymienionej Umiejętności', () => {
    const planned = planCpredRoll(
      sheet({
        roleId: 'tech',
        roleAbilityRank: 3,
        fabrication: { repair: 3, upgrade: 3 },
        skills: { 'basic-tech': 4 },
      }),
      registry,
      { kind: 'skill', skillId: 'basic-tech' },
    );
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.breakdown.map((entry) => entry.label)).toContain('Naprawa 3');
    // TECH 5 + Umiejętność 4 + Naprawa 3.
    expect(planned.plan.modifierTotal).toBe(12);
  });

  it('nie dokłada niczego Umiejętności spoza listy', () => {
    const planned = planCpredRoll(
      sheet({
        roleId: 'tech',
        roleAbilityRank: 3,
        fabrication: { repair: 3, upgrade: 3 },
        skills: { handgun: 4 },
      }),
      registry,
      { kind: 'skill', skillId: 'handgun' },
    );
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.breakdown.some((entry) => entry.label.startsWith('Naprawa'))).toBe(false);
  });

  it('i nikomu, kto nie jest Technikiem — przydział bez Roli nic nie znaczy', () => {
    const planned = planCpredRoll(
      sheet({ roleId: 'solo', roleAbilityRank: 3, fabrication: { repair: 3 }, skills: {} }),
      registry,
      { kind: 'skill', skillId: 'basic-tech' },
    );
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.modifierTotal).toBe(5);
  });
});

describe('drabinka Poziomów Trudności (s. 130)', () => {
  it('ma siedem szczebli w rosnącej kolejności', () => {
    expect(CPRED_DIFFICULTY_LADDER.map((rung) => rung.dv)).toEqual([9, 13, 15, 17, 21, 24, 29]);
  });

  it('„Codzienny" to 13 — ten sam szczebel, którym bije się statystę bez karty', () => {
    expect(cpredDifficultyRungAt(13)?.label).toBe('Codzienny');
    expect(cpredDifficultyRungAt(13)?.dv).toBe(CPRED_EVERYDAY_DV);
  });

  it('liczba spoza tabeli nie ma szczebla', () => {
    expect(cpredDifficultyRungAt(14)).toBeNull();
  });
});

describe('werdykt Testu na wezwanie MG', () => {
  it('zdaje wynik WYŻSZY od PT', () => {
    expect(cpredCheckOutcome(16, { dv: 15 }).success).toBe(true);
  });

  it('remis nie zdaje — `>=` przy PT jest błędem, nie wariantem', () => {
    const outcome = cpredCheckOutcome(15, { dv: 15 });
    expect(outcome.success).toBe(false);
    expect(outcome.label).toBe('Niezdane');
    expect(outcome.detail).toBe('15 ≤ PT 15 (Trudny)');
  });

  it('nazywa szczebel w opisie, gdy PT stoi na drabince', () => {
    expect(cpredCheckOutcome(20, { dv: 17 }).detail).toBe('20 > PT 17 (Profesjonalny)');
  });

  it('przy rzucie przeciwstawnym remis wygrywa druga strona', () => {
    expect(cpredCheckOutcome(18, { opponentTotal: 18, opponentBonus: 12 }).success).toBe(false);
    expect(cpredCheckOutcome(19, { opponentTotal: 18, opponentBonus: 12 }).success).toBe(true);
  });

  it('opis rzutu przeciwstawnego pokazuje obie liczby', () => {
    expect(cpredCheckOutcome(19, { opponentTotal: 18, opponentBonus: 12 }).detail).toBe(
      '19 vs 18 (druga strona: 12 + 1k10)',
    );
  });
});
