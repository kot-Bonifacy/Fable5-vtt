import { describe, expect, it } from 'vitest';
import {
  cpredCareRefusal,
  cpredParseCare,
  cpredTreatmentOptions,
  describeCareOptions,
  CPRED_SURGERY_SKILL_ID,
} from './treatment.js';
import { buildCpredRegistry } from './character.js';
import type { CpredCharacterData, CpredRegistry } from './character.js';

const registry: CpredRegistry = buildCpredRegistry(
  { skills: [] },
  {
    roles: [
      { id: 'medtech', name: 'Medyk', ability: 'Medycyna' },
      { id: 'solo', name: 'Solo', ability: 'Zmysł Walki' },
    ],
  },
);

function healer(
  patch: Partial<Pick<CpredCharacterData, 'roleId' | 'roleAbilityRank' | 'medicine'>>,
): Pick<CpredCharacterData, 'roleId' | 'roleAbilityRank' | 'medicine'> {
  return { roleId: null, roleAbilityRank: 1, medicine: {}, ...patch };
}

describe('zdania o leczeniu z tabeli ran (s. 187–188)', () => {
  it('jedna gałąź z własnym PT', () => {
    expect(cpredParseCare('Chirurgia PT 17')).toEqual([
      { skillId: CPRED_SURGERY_SKILL_ID, name: 'Chirurgia', dv: 17, medicOnly: true },
    ]);
  });

  it('dwie gałęzie, każda ze swoim PT', () => {
    const options = cpredParseCare('Ratownictwo medyczne PT 15 lub Chirurgia PT 13');
    expect(options.map((entry) => [entry.name, entry.dv])).toEqual([
      ['Ratownictwo medyczne', 15],
      ['Chirurgia', 13],
    ]);
  });

  it('dwie gałęzie o wspólnym PT — liczba stoi tylko przy drugiej', () => {
    const options = cpredParseCare('Ratownictwo medyczne lub Chirurgia PT 13');
    expect(options.map((entry) => [entry.name, entry.dv])).toEqual([
      ['Ratownictwo medyczne', 13],
      ['Chirurgia', 13],
    ]);
  });

  it('„Nd." to brak drogi, a nie rzut o nieznanym PT', () => {
    expect(cpredParseCare('Nd.')).toEqual([]);
    expect(cpredParseCare(undefined)).toEqual([]);
  });

  it('zdania, którego VTT nie rozumie, nie zamienia w rzut', () => {
    expect(cpredParseCare('Trzy tygodnie w kriozbiorniku')).toEqual([]);
  });
});

describe('która droga zdejmuje ranę na stałe', () => {
  it('zwykła rana bierze zdanie z kolumny „Leczenie"', () => {
    const options = cpredTreatmentOptions({
      quickFix: 'Ratownictwo medyczne PT 13',
      treatment: 'Chirurgia PT 15',
    });
    expect(options).toHaveLength(1);
    expect(options[0]!.name).toBe('Chirurgia');
  });

  it('„Łatanie trwale usuwa Efekt tej Rany" oddaje robotę kolumnie obok', () => {
    const options = cpredTreatmentOptions({
      quickFix: 'Pierwsza pomoc lub Ratownictwo medyczne PT 13',
      treatment: 'Łatanie trwale usuwa Efekt tej Rany.',
    });
    expect(options.map((entry) => entry.name)).toEqual(['Pierwsza pomoc', 'Ratownictwo medyczne']);
    expect(options.every((entry) => entry.dv === 13)).toBe(true);
  });

  it('opis to zdanie, które karta drukuje przy guziku', () => {
    expect(
      describeCareOptions(cpredParseCare('Ratownictwo medyczne PT 15 lub Chirurgia PT 13')),
    ).toBe('Ratownictwo medyczne PT 15 lub Chirurgia PT 13');
    expect(describeCareOptions([])).toBe('brak drogi leczenia');
  });
});

describe('Chirurgia jest bramą Medyka', () => {
  const surgery = cpredParseCare('Chirurgia PT 17')[0]!;
  const paramedic = cpredParseCare('Ratownictwo medyczne PT 15')[0]!;

  it('Ratownik bez Medycyny dostaje odmowę zdaniem', () => {
    const solo = healer({ roleId: 'solo', roleAbilityRank: 6 });
    expect(cpredCareRefusal(surgery, solo, registry)).toMatch(/tylko Medykom/);
    // …ale własną drogą rusza bez przeszkód.
    expect(cpredCareRefusal(paramedic, solo, registry)).toBeNull();
  });

  it('Medyk bez punktu w Chirurgii też, i zdanie mówi czego brakuje', () => {
    const medic = healer({ roleId: 'medtech', roleAbilityRank: 4, medicine: { pharma: 4 } });
    expect(cpredCareRefusal(surgery, medic, registry)).toMatch(/Specjalizacji Chirurgia/);
  });

  it('Medyk z Chirurgią operuje', () => {
    const medic = healer({ roleId: 'medtech', roleAbilityRank: 4, medicine: { surgery: 2 } });
    expect(cpredCareRefusal(surgery, medic, registry)).toBeNull();
  });
});
