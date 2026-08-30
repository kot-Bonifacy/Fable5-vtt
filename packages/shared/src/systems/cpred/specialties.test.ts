import { describe, expect, it } from 'vitest';
import {
  cpredFabricationEffects,
  cpredFabricationProblem,
  cpredFieldRepairMinutes,
  cpredMedicineEffects,
  cpredMedicineProblem,
  cpredMedicineSkillLevel,
  cpredSheetFabrication,
  cpredSheetMedicine,
  cpredSpecialtiesProblem,
  cpredSpecialtyCap,
  cpredSpecialtyPool,
  cpredUpgradesFor,
  describeSpecialties,
  readCpredFabrication,
  readCpredMedicine,
  CPRED_FABRICATION,
  CPRED_FABRICATION_RULES,
  CPRED_FABRICATION_TASK,
  CPRED_ITEM_UPGRADES,
  CPRED_MEDICINE,
  CPRED_MEDICINE_RULES,
  CPRED_NO_FABRICATION,
  CPRED_NO_MEDICINE,
  type CpredRoleSheet,
} from './roleability.js';
import { buildCpredRegistry } from './character.js';
import type { CpredCharacterData, CpredRegistry } from './character.js';

const registry: CpredRegistry = buildCpredRegistry(
  { skills: [] },
  {
    roles: [
      { id: 'medtech', name: 'Medyk', ability: 'Medycyna' },
      { id: 'tech', name: 'Technik', ability: 'Twórca' },
      { id: 'solo', name: 'Solo', ability: 'Zmysł Walki' },
    ],
  },
);

/** Minimal slice of a sheet — the four fields these rules ever read. */
function sheet(
  patch: Partial<CpredRoleSheet & Pick<CpredCharacterData, 'medicine' | 'fabrication'>>,
): CpredRoleSheet & Pick<CpredCharacterData, 'medicine' | 'fabrication'> {
  return {
    roleId: null,
    roleAbilityRank: 1,
    formerRoles: [],
    medicine: {},
    fabrication: {},
    ...patch,
  };
}

describe('sakiewka Specjalizacji', () => {
  it('Twórca dostaje dwa punkty na poziom, Medycyna jeden', () => {
    expect(cpredSpecialtyPool(CPRED_FABRICATION_RULES, 4)).toBe(8);
    expect(cpredSpecialtyPool(CPRED_MEDICINE_RULES, 4)).toBe(4);
  });

  it('żadna Specjalizacja nie przyjmie więcej punktów niż poziom Zdolności', () => {
    const repair = CPRED_FABRICATION.find((entry) => entry.id === 'repair')!;
    expect(cpredSpecialtyCap(repair, 3)).toBe(3);
    // A tam, gdzie podręcznik drukuje własny sufit, wygrywa on.
    const pharma = CPRED_MEDICINE.find((entry) => entry.id === 'pharma')!;
    expect(cpredSpecialtyCap(pharma, 9)).toBe(5);
  });

  it('rozkład możliwy do kupienia awansami przechodzi, niemożliwy nie', () => {
    // Poziom 2 Twórcy = 4 punkty; po dwa w dwóch Specjalizacjach da się kupić
    // („po punkcie w dwóch różnych" dwa razy pod rząd).
    expect(cpredFabricationProblem({ repair: 2, upgrade: 2 }, 2)).toBeNull();
    // Trzy punkty w jednej przy poziomie 2 — nie da się, bo jeden awans daje
    // tej Specjalizacji najwyżej jeden punkt.
    expect(cpredFabricationProblem({ repair: 3, upgrade: 1 }, 2)).toBe('SPECIALTY_CAP');
    // Pięć punktów przy poziomie 2 to o jeden za dużo w całej sakiewce.
    expect(cpredFabricationProblem({ repair: 2, upgrade: 2, invent: 1 }, 2)).toBe(
      'NOT_ENOUGH_POINTS',
    );
  });

  it('niedokończony przydział jest legalny — to karta świeżo po awansie', () => {
    expect(cpredFabricationProblem({ repair: 1 }, 3)).toBeNull();
    expect(cpredFabricationEffects({ repair: 1 }, 3).left).toBe(5);
  });

  it('Medycyna liczy jeden punkt na poziom', () => {
    expect(cpredMedicineProblem({ surgery: 3 }, 3)).toBeNull();
    expect(cpredMedicineProblem({ surgery: 3, pharma: 1 }, 3)).toBe('NOT_ENOUGH_POINTS');
  });

  it('szósty punkt Chirurgii jest odrzucany, bo nic nie kupuje', () => {
    // Piąty daje Umiejętność 10 — sufit z podręcznika. Szósty byłby spalony,
    // więc VTT odmawia zamiast po cichu przyjąć (bargain z etapu 30a).
    expect(cpredMedicineEffects({ surgery: 5 }, 10).surgerySkill).toBe(10);
    expect(cpredMedicineProblem({ surgery: 6 }, 10)).toBe('SPECIALTY_CAP');
  });

  it('nieznana Specjalizacja i ułamek są odrzucane', () => {
    expect(cpredMedicineProblem({ nonsense: 1 } as never, 5)).toBe('BAD_VALUE');
    expect(cpredMedicineProblem({ surgery: 1.5 }, 5)).toBe('BAD_VALUE');
  });

  it('postać bez tej Zdolności nie może mieć przydziału', () => {
    expect(cpredMedicineProblem({}, null)).toBeNull();
    expect(cpredMedicineProblem({ surgery: 1 }, null)).toBe('NO_ABILITY');
  });
});

describe('Umiejętności z Medycyny', () => {
  it('Chirurgia to dwa punkty Umiejętności za punkt Specjalizacji', () => {
    expect(cpredMedicineEffects({ surgery: 3 }, 5).surgerySkill).toBe(6);
  });

  it('Technologia Medyczna to suma Farmaceutyków i kriosystemów', () => {
    const effects = cpredMedicineEffects({ pharma: 3, cryo: 2 }, 5);
    expect(effects.medtechSkill).toBe(5);
  });

  it('poziom liczony z karty jest zerem dla każdej innej Roli', () => {
    const medic = sheet({ roleId: 'medtech', roleAbilityRank: 4, medicine: { surgery: 2 } });
    expect(cpredMedicineSkillLevel(medic, registry, 'medicine.surgery')).toBe(4);
    const solo = sheet({ roleId: 'solo', roleAbilityRank: 4, medicine: { surgery: 2 } });
    expect(cpredMedicineSkillLevel(solo, registry, 'medicine.surgery')).toBe(0);
    expect(cpredSheetMedicine(solo, registry)).toEqual(CPRED_NO_MEDICINE);
  });
});

describe('Twórca na karcie', () => {
  it('czyta się z karty tylko Technikowi', () => {
    const tech = sheet({ roleId: 'tech', roleAbilityRank: 3, fabrication: { repair: 2 } });
    expect(cpredSheetFabrication(tech, registry).repair).toBe(2);
    const medic = sheet({ roleId: 'medtech', roleAbilityRank: 3, fabrication: { repair: 2 } });
    expect(cpredSheetFabrication(medic, registry)).toEqual(CPRED_NO_FABRICATION);
  });

  it('obie sakiewki naraz sprawdza jedna funkcja', () => {
    const tech = sheet({ roleId: 'tech', roleAbilityRank: 1, fabrication: { repair: 2 } });
    expect(cpredSpecialtiesProblem(tech, registry)).toBe('SPECIALTY_CAP');
    const ok = sheet({ roleId: 'tech', roleAbilityRank: 2, fabrication: { repair: 2 } });
    expect(cpredSpecialtiesProblem(ok, registry)).toBeNull();
  });
});

describe('czytanie i opis', () => {
  it('zapis odrzuca śmieci, zachowuje liczby', () => {
    expect(readCpredMedicine({ surgery: 2, pharma: 'dwa', nonsense: 4 })).toEqual({ surgery: 2 });
    expect(readCpredFabrication(null)).toEqual({});
  });

  it('opis to jedno zdanie o tym, co gdzie stoi', () => {
    expect(describeSpecialties({ repair: 2, invent: 1 }, CPRED_FABRICATION)).toBe(
      'Naprawa 2, Wynajdywanie 1',
    );
    expect(describeSpecialties({}, CPRED_FABRICATION)).toBe('nic nie rozdzielono');
  });
});

describe('Ulepszanie i Prowizorka', () => {
  it('podręcznik drukuje dziesięć skutków Ulepszania', () => {
    // Dziesięć punktorów, policzonych na stronie — opis etapu mówił jedenaście.
    expect(CPRED_ITEM_UPGRADES).toHaveLength(10);
    // Dokładnie jeden z nich VTT liczy sam; reszta jest zapisem dla stołu.
    expect(CPRED_ITEM_UPGRADES.filter((entry) => entry.effect !== undefined)).toHaveLength(1);
  });

  it('każdy skutek trafia tylko na pasujące wiersze karty', () => {
    expect(cpredUpgradesFor('armor').map((entry) => entry.id)).toContain('armorSp');
    expect(cpredUpgradesFor('weapon').map((entry) => entry.id)).not.toContain('armorSp');
  });

  it('prowizorka trzyma 10 minut na poziom Naprawy', () => {
    expect(cpredFieldRepairMinutes(3)).toBe(30);
    expect(cpredFieldRepairMinutes(0)).toBe(0);
  });

  it('tabela PT/czasu ma wiersz dla każdej Kategorii Cenowej', () => {
    expect(CPRED_FABRICATION_TASK.cheap.dv).toBe(9);
    expect(CPRED_FABRICATION_TASK.luxury.dv).toBe(29);
    expect(Object.keys(CPRED_FABRICATION_TASK)).toHaveLength(8);
  });
});
