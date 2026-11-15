import { describe, expect, it } from 'vitest';
import {
  buildCpredRegistry,
  createDefaultCharacterData,
  mergeCharacterData,
  parseCharacterData,
  type CpredArmorRow,
  type CpredRegistry,
} from './character.js';
import {
  CPRED_REPAIR_DV_UNKNOWN,
  CPRED_REPAIR_TASK,
  cpredFieldRepairProblem,
  cpredRepairDv,
} from './repair.js';
import { planCpredRoll } from './rolls.js';

/**
 * Prowizorka Technika po bramce 71 (etap 71c0): Test zamiast pewnego sukcesu
 * (TEC-04, #85) i ślad zużytej łaty do pełnej naprawy (TEC-06, #86).
 */

const registry: CpredRegistry = buildCpredRegistry(
  { skills: [{ id: 'basic-tech', name: 'Podstawowe naprawy', stat: 'tech' }] },
  {
    roles: [
      { id: 'tech', name: 'Technik', ability: 'Twórca' },
      { id: 'solo', name: 'Solo', ability: 'Zmysł Walki' },
    ],
  },
);

const jacket = (extra: Partial<CpredArmorRow> = {}): CpredArmorRow => ({
  id: 'a1',
  name: 'Kurtka',
  notes: '',
  sp: 11,
  spCurrent: 7,
  location: 'body',
  ...extra,
});

function technik(row: CpredArmorRow, repair = 2) {
  return {
    ...createDefaultCharacterData(),
    roleId: 'tech',
    roleAbilityRank: 4,
    fabrication: { repair, upgrade: 8 - repair },
    skills: { 'basic-tech': 4 },
    armor: [row],
  };
}

describe('PT naprawy przedmiotu (s. 140)', () => {
  it('rośnie z pasmem ceny, a rzecz bez pasma dostaje Codzienny szczebel', () => {
    expect(cpredRepairDv('everyday')).toBe(9);
    expect(cpredRepairDv('premium')).toBe(17);
    expect(cpredRepairDv('luxury')).toBe(29);
    expect(cpredRepairDv(null)).toBe(CPRED_REPAIR_DV_UNKNOWN);
    expect(CPRED_REPAIR_TASK.costly).toEqual({ dv: 13, minutes: 360 });
  });
});

describe('TEC-04 Prowizorka to Test (#85)', () => {
  it('rzuca TECH + Podstawowe naprawy + Naprawa, bez drugiej Naprawy z listy naprawczej', () => {
    const planned = planCpredRoll(technik(jacket(), 3), registry, {
      kind: 'fieldRepair',
      fieldRepairArmorRowId: 'a1',
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const labels = planned.plan.breakdown.map((row) => row.label);
    expect(labels.filter((label) => label.startsWith('Naprawa'))).toEqual(['Naprawa 3']);
    // TECH 5 + Podstawowe naprawy 4 + Naprawa 3.
    expect(planned.plan.modifierTotal).toBe(12);
    expect(planned.plan.checkRule).toBe(true);
    expect(planned.plan.fieldRepair).toEqual({
      dv: null,
      armorRowId: 'a1',
      armorName: 'Kurtka',
      repairLevel: 3,
    });
  });

  it('niesie PT wpisane przez serwer', () => {
    const planned = planCpredRoll(technik(jacket()), registry, {
      kind: 'fieldRepair',
      fieldRepairArmorRowId: 'a1',
      fieldRepairDv: 17,
    });
    expect(planned.ok && planned.plan.fieldRepair?.dv).toBe(17);
  });

  it('odmawia bez Naprawy, przy pełnym OB, przy trwającej i przy zużytej łacie', () => {
    const ask = (data: ReturnType<typeof technik>) =>
      planCpredRoll(data, registry, { kind: 'fieldRepair', fieldRepairArmorRowId: 'a1' });
    expect(ask({ ...technik(jacket()), fabrication: { repair: 0, upgrade: 8 } })).toEqual({
      ok: false,
      error: 'NO_REPAIR_SPECIALTY',
    });
    expect(ask(technik(jacket({ spCurrent: 11 })))).toEqual({
      ok: false,
      error: 'ARMOR_INTACT',
    });
    expect(ask(technik(jacket({ fieldRepair: { restoredFrom: 7, minutes: 20 } })))).toEqual({
      ok: false,
      error: 'ALREADY_PATCHED',
    });
    expect(ask(technik(jacket({ fieldRepairSpent: true })))).toEqual({
      ok: false,
      error: 'PATCH_SPENT',
    });
    expect(
      planCpredRoll(technik(jacket()), registry, {
        kind: 'fieldRepair',
        fieldRepairArmorRowId: 'nope',
      }),
    ).toEqual({ ok: false, error: 'UNKNOWN_ARMOR' });
  });

  it('Solo z punktami w Naprawie na karcie nie łata — przydział bez Roli nic nie znaczy', () => {
    const solo = { ...technik(jacket()), roleId: 'solo' };
    expect(cpredFieldRepairProblem(jacket(), 0)).toBe('NO_REPAIR_SPECIALTY');
    expect(
      planCpredRoll(solo, registry, { kind: 'fieldRepair', fieldRepairArmorRowId: 'a1' }),
    ).toEqual({ ok: false, error: 'NO_REPAIR_SPECIALTY' });
  });

  it('Szczęście wolno dorzucić — to Test', () => {
    const data = { ...technik(jacket()), luckCurrent: 3 };
    const planned = planCpredRoll(data, registry, {
      kind: 'fieldRepair',
      fieldRepairArmorRowId: 'a1',
      luckSpent: 2,
    });
    expect(planned.ok && planned.plan.luckSpent).toBe(2);
  });
});

describe('TEC-06 ślad zużytej łaty do pełnej naprawy (#86)', () => {
  it('zostaje przy startym OB i przeżywa odczyt karty', () => {
    const data = mergeCharacterData(technik(jacket()), {
      armor: [jacket({ fieldRepairSpent: true })],
    });
    expect(data.armor[0]!.fieldRepairSpent).toBe(true);
    const read = parseCharacterData(JSON.stringify(data), registry);
    expect(read.armor[0]!.fieldRepairSpent).toBe(true);
  });

  it('schodzi, gdy sztuka wraca do pełnego OB (↻ MG)', () => {
    const data = mergeCharacterData(technik(jacket({ fieldRepairSpent: true })), {
      armor: [jacket({ fieldRepairSpent: true, spCurrent: 11 })],
    });
    expect(data.armor[0]!.fieldRepairSpent).toBeUndefined();
    expect(data.armor[0]!.spCurrent).toBe(11);
  });

  it('nie schodzi pod trwającą łatą, choć OB jest wtedy pełne', () => {
    const row = jacket({
      spCurrent: 11,
      fieldRepair: { restoredFrom: 7, minutes: 20 },
      fieldRepairSpent: true,
    });
    const data = mergeCharacterData(technik(row), { armor: [row] });
    expect(data.armor[0]!.fieldRepairSpent).toBe(true);
  });
});
