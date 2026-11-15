import { describe, expect, it } from 'vitest';
import { buildCpredRegistry, createDefaultCharacterData, type CpredArmorRow } from './character.js';
import {
  CPRED_TECH_VEHICLE_UPGRADE_TASK,
  cpredArmorNeedsRepair,
  cpredArmorRepaired,
  cpredArmorRepairTask,
  cpredFailedWorkMinutes,
} from './repair.js';
import { cpredTechVehicleUpgradeProblem, cpredVehicleRepairTask } from './vehiclework.js';
import { planCpredRoll } from './rolls.js';
import { cpredVehicleTechSkillId, readCpredVehicle } from './vehicles.js';
import { formatWorkDuration } from '../../gametime.js';

/**
 * Etap 71c2 — zwykła naprawa pancerza i auta Testem (TEC-19, TEC-15, NOM-10,
 * TEC-S1) i montaż ulepszenia auta przez Technika (TEC-18).
 */

const registry = buildCpredRegistry(
  {
    skills: [
      { id: 'basic-tech', name: 'Podstawowe naprawy', stat: 'tech' },
      { id: 'land-vehicle-tech', name: 'Naprawa pojazdów lądowych', stat: 'tech' },
    ],
  },
  {
    roles: [
      { id: 'tech', name: 'Technik', ability: 'Twórca' },
      { id: 'nomad', name: 'Nomada', ability: 'Moto' },
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

function technik(repair: number, upgrade: number) {
  return {
    ...createDefaultCharacterData(),
    roleId: 'tech',
    roleAbilityRank: 4,
    fabrication: { repair, upgrade },
    skills: { 'basic-tech': 4, 'land-vehicle-tech': 4 },
  };
}

const vehicleTarget = { kind: 'vehicle' as const, vehicleId: 'v1' };

describe('TEC-19 zwykła naprawa pancerza (s. 140)', () => {
  it('PT i czas z pasma ceny; bez wpisu — PT 13 i 6 godzin', () => {
    expect(cpredArmorRepairTask('premium')).toEqual({ dv: 17, minutes: 24 * 60 });
    expect(cpredArmorRepairTask('everyday')).toEqual({ dv: 9, minutes: 60 });
    expect(cpredArmorRepairTask(null)).toEqual({ dv: 13, minutes: 6 * 60 });
  });

  it('TEC-15 „Szybsza naprawa” połowi czas, PT zostaje', () => {
    expect(cpredArmorRepairTask('premium', 'fastRepair')).toEqual({ dv: 17, minutes: 12 * 60 });
    expect(cpredArmorRepairTask('premium', 'armorSp')).toEqual({ dv: 17, minutes: 24 * 60 });
  });

  it('naprawy potrzebuje starte OB albo trwająca łata; pełna naprawa zdejmuje łatę i ślad', () => {
    expect(cpredArmorNeedsRepair(jacket())).toBe(true);
    expect(cpredArmorNeedsRepair(jacket({ spCurrent: 11 }))).toBe(false);
    const patched = jacket({ spCurrent: 11, fieldRepair: { restoredFrom: 7, minutes: 20 } });
    expect(cpredArmorNeedsRepair(patched)).toBe(true);
    expect(cpredArmorRepaired(patched)).toEqual(jacket({ spCurrent: 11 }));
    expect(cpredArmorRepaired(jacket({ fieldRepairSpent: true }))).toEqual(
      jacket({ spCurrent: 11 }),
    );
  });

  it('porażka kosztuje połowę czasu (s. 140), a czas pisze się po ludzku', () => {
    expect(cpredFailedWorkMinutes(24 * 60)).toBe(12 * 60);
    expect(formatWorkDuration(12 * 60)).toBe('12 godzin');
    expect(formatWorkDuration(24 * 60)).toBe('1 dzień');
    expect(formatWorkDuration(3 * 24 * 60)).toBe('3 dni');
    expect(formatWorkDuration(14 * 24 * 60)).toBe('2 tygodnie');
    expect(formatWorkDuration(90)).toBe('90 minut');
    expect(formatWorkDuration(180)).toBe('3 godziny');
  });

  it('rzut pancerza: TECH + Podstawowe naprawy + Naprawa, PT od serwera', () => {
    const planned = planCpredRoll(technik(3, 5), registry, {
      kind: 'repair',
      repairTarget: { kind: 'armor', characterId: 'c1', armorRowId: 'a1' },
      work: { dv: 17, minutes: 1440, targetName: 'Kurtka' },
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.title).toBe('Naprawa: Kurtka');
    // TECH domyślnej karty + Podstawowe naprawy 4 + Naprawa 3.
    expect(planned.plan.modifierTotal).toBe(createDefaultCharacterData().stats.tech + 7);
    expect(planned.plan.work).toMatchObject({ task: 'repair', terms: { dv: 17 } });
  });
});

describe('TEC-S1 NOM-10 naprawa auta Testem (s. 147)', () => {
  const car = (hp: number) => readCpredVehicle({ kind: 'car', hpMax: 50, hp, seats: 4, move: 20 });

  it('PT i czas ze stopnia uszkodzeń; całe auto nie ma czego naprawiać', () => {
    expect(cpredVehicleRepairTask(car(40))).toEqual({ dv: 9, minutes: 180, damage: 'light' });
    expect(cpredVehicleRepairTask(car(20))).toEqual({
      dv: 13,
      minutes: 24 * 60,
      damage: 'serious',
    });
    expect(cpredVehicleRepairTask(car(0))).toEqual({
      dv: 17,
      minutes: 7 * 24 * 60,
      damage: 'wrecked',
    });
    expect(cpredVehicleRepairTask(car(50))).toBeNull();
  });

  it('Umiejętność wg rodzaju pojazdu', () => {
    expect(cpredVehicleTechSkillId('car')).toBe('land-vehicle-tech');
    expect(cpredVehicleTechSkillId('boat')).toBe('sea-vehicle-tech');
    expect(cpredVehicleTechSkillId('gyro')).toBe('air-vehicle-tech');
  });

  it('Nomada rzuca TECH + Naprawa pojazdów + Moto; Technik dokłada Naprawę', () => {
    const nomad = {
      ...createDefaultCharacterData(),
      roleId: 'nomad',
      roleAbilityRank: 3,
      skills: { 'land-vehicle-tech': 4 },
    };
    const planned = planCpredRoll(nomad, registry, {
      kind: 'repair',
      repairTarget: vehicleTarget,
      repairSkillId: 'land-vehicle-tech',
      work: { dv: 13, minutes: 1440, targetName: 'Osa' },
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.title).toBe('Naprawa: Osa');
    expect(planned.plan.breakdown.map((row) => row.label)).toContain('Moto 3');

    const fixed = planCpredRoll(technik(3, 5), registry, {
      kind: 'repair',
      repairTarget: vehicleTarget,
      repairSkillId: 'land-vehicle-tech',
    });
    expect(fixed.ok && fixed.plan.breakdown.map((row) => row.label)).toContain('Naprawa 3');
    // Podgląd klienta: warunków pracy jeszcze nie ma.
    expect(fixed.ok && fixed.plan.work?.terms).toBeNull();
  });

  it('odmawia Umiejętności spoza listy naprawczej i celu bez adresu', () => {
    expect(
      planCpredRoll(technik(3, 5), registry, {
        kind: 'repair',
        repairTarget: vehicleTarget,
        repairSkillId: 'driving',
      }),
    ).toEqual({ ok: false, error: 'UNKNOWN_SKILL' });
    expect(
      planCpredRoll(technik(3, 5), registry, {
        kind: 'repair',
        repairTarget: { kind: 'armor', characterId: '', armorRowId: 'a1' },
      }),
    ).toEqual({ ok: false, error: 'BAD_REQUEST' });
  });
});

describe('TEC-18 Technik montuje ulepszenie auta z progu Moto 1 (s. 148)', () => {
  const car = readCpredVehicle({ kind: 'car', hpMax: 50, hp: 50, seats: 4, move: 20 });

  it('PT 24 i dwa tygodnie — jak rzecz Bardzo kosztowna', () => {
    expect(CPRED_TECH_VEHICLE_UPGRADE_TASK).toEqual({ dv: 24, minutes: 14 * 24 * 60 });
  });

  it('bez Ulepszania, ponad Moto 1, drugi raz w tym samym aucie i poza rodzajem — odmowa', () => {
    expect(cpredTechVehicleUpgradeProblem(0, car, 'spikes')).toBe('NO_UPGRADE_SPECIALTY');
    expect(cpredTechVehicleUpgradeProblem(2, car, 'nope')).toBe('UNKNOWN_UPGRADE');
    expect(cpredTechVehicleUpgradeProblem(2, car, 'armoredHull')).toBe('NOT_MOTO_ONE');
    expect(cpredTechVehicleUpgradeProblem(2, car, 'spikes')).toBeNull();
    const done = readCpredVehicle({
      ...car,
      upgrades: [{ id: 'u1', upgradeId: 'spikes', techUpgrade: true, notes: '' }],
    });
    expect(done.upgrades[0]?.techUpgrade).toBe(true);
    expect(cpredTechVehicleUpgradeProblem(2, done, 'nitro')).toBe('TECH_UPGRADE_USED');
    const bike = readCpredVehicle({ kind: 'motorcycle', hpMax: 30, hp: 30, seats: 1, move: 20 });
    expect(cpredTechVehicleUpgradeProblem(2, bike, 'spikes')).toBe('UPGRADE_NOT_FOR_KIND');
  });

  it('rzut: TECH + Naprawa pojazdów + Ulepszanie, bez Naprawy', () => {
    const planned = planCpredRoll(technik(3, 5), registry, {
      kind: 'vehicleUpgrade',
      repairTarget: vehicleTarget,
      repairSkillId: 'land-vehicle-tech',
      vehicleUpgradeId: 'spikes',
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const labels = planned.plan.breakdown.map((row) => row.label);
    expect(labels).toContain('Ulepszanie 5');
    expect(labels.some((label) => /^Naprawa \d/.test(label))).toBe(false);
    expect(planned.plan.title).toBe('Ulepszanie');
    const none = planCpredRoll(technik(8, 0), registry, {
      kind: 'vehicleUpgrade',
      repairTarget: vehicleTarget,
      repairSkillId: 'land-vehicle-tech',
      vehicleUpgradeId: 'spikes',
    });
    expect(none).toEqual({ ok: false, error: 'NO_UPGRADE_SPECIALTY' });
  });
});
