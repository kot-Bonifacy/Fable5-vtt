import { describe, expect, it } from 'vitest';
import {
  CPRED_FLEET_GIFT_WEAPON_IDS,
  cpredFamilyRepairProblem,
  cpredFleetGiftProblem,
  cpredFleetUsePlan,
  cpredFleetVehicleEntry,
  cpredFleetVehicleState,
  cpredIsFleetVehicle,
  cpredWithFleetUse,
} from './fleet.js';
import { readCpredVehicle, type CpredVehicleStats } from './vehicles.js';

/** Tabor Rodziny po bramce 71 (etap 71c1): NOM-06, NOM-08, NOM-09, NOM-11, NOM-14. */

const car = (extra: Record<string, unknown> = {}): CpredVehicleStats =>
  readCpredVehicle({ kind: 'car', hpMax: 50, seats: 4, move: 20, fleetRowId: 'r1', ...extra });

const NOW = 1_000_000;
const MORNING = NOW + 600;

describe('NOM-06 Tabor tylko z tabeli s. 162 (G38)', () => {
  it('pojazd bez progu Moto (Karetka, radiowóz) nie wchodzi do Taboru', () => {
    expect(cpredFleetVehicleEntry({ motoLevel: 1 })).toBe(true);
    expect(cpredFleetVehicleEntry({})).toBe(false);
  });
});

describe('NOM-08 jedno auto naraz, wymiana rano (G6)', () => {
  it('pierwsze auto jest w użyciu od razu', () => {
    const plan = cpredFleetUsePlan([{ id: 'a', stats: car() }], 'a', NOW, MORNING, 4);
    expect(plan.ok && plan.patches.get('a')).toEqual({ inUseFrom: NOW, inUseUntil: null });
  });

  it('wymiana: nowe przyjeżdża rano, stare zostaje do tej chwili', () => {
    const fleet = [
      { id: 'a', stats: car({ inUseFrom: NOW - 10 }) },
      { id: 'b', stats: car({ fleetRowId: 'r2' }) },
    ];
    const plan = cpredFleetUsePlan(fleet, 'b', NOW, MORNING, 4);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const a = cpredWithFleetUse(fleet[0]!.stats, plan.patches.get('a')!);
    const b = cpredWithFleetUse(fleet[1]!.stats, plan.patches.get('b')!);
    expect(cpredFleetVehicleState(a, NOW)).toBe('inUse');
    expect(cpredFleetVehicleState(b, NOW)).toBe('arriving');
    expect(cpredFleetVehicleState(a, MORNING)).toBe('idle');
    expect(cpredFleetVehicleState(b, MORNING)).toBe('inUse');
    // Odczyt z zapisu przenosi pola użycia.
    expect(readCpredVehicle(JSON.stringify(b)).inUseFrom).toBe(MORNING);
  });

  it('powrót do starego, zanim wymiana przyjechała, odwołuje ją', () => {
    const fleet = [
      { id: 'a', stats: car({ inUseFrom: NOW - 10, inUseUntil: MORNING }) },
      { id: 'b', stats: car({ fleetRowId: 'r2', inUseFrom: MORNING }) },
    ];
    const plan = cpredFleetUsePlan(fleet, 'a', NOW, MORNING, 4);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.patches.get('a')).toEqual({ inUseUntil: null });
    expect(plan.patches.get('b')).toEqual({ inUseFrom: null, inUseUntil: null });
  });

  it('odmawia auta spoza Taboru, auta u Rodziny i Głowie Rodziny', () => {
    const plain = { id: 'x', stats: car({ fleetRowId: null }) };
    expect(cpredFleetUsePlan([plain], 'x', NOW, MORNING, 4)).toEqual({
      ok: false,
      error: 'NOT_FLEET',
    });
    const away = { id: 'a', stats: car({ familyRepairUntil: NOW + 5 }) };
    expect(cpredFleetUsePlan([away], 'a', NOW, MORNING, 4)).toEqual({
      ok: false,
      error: 'AT_FAMILY',
    });
    expect(cpredFleetUsePlan([{ id: 'a', stats: car() }], 'a', NOW, MORNING, 10)).toEqual({
      ok: false,
      error: 'ELDER_USES_ALL',
    });
  });
});

describe('NOM-09 naprawa wraku u Rodziny (G7)', () => {
  it('tylko wrak z Taboru, i nie drugi raz', () => {
    expect(cpredFamilyRepairProblem(car({ hp: 0 }), NOW)).toBeNull();
    expect(cpredFamilyRepairProblem(car({ hp: 30 }), NOW)).toBe('NOT_WRECKED');
    expect(cpredFamilyRepairProblem(car({ hp: 0, fleetRowId: null }), NOW)).toBe('NOT_FLEET');
    expect(cpredFamilyRepairProblem(car({ hp: 0, familyRepairUntil: NOW + 1 }), NOW)).toBe(
      'AT_FAMILY',
    );
  });
});

describe('NOM-11 auto dokupione przez Głowę Rodziny (G8)', () => {
  it('jest w Taborze bez wiersza awansu', () => {
    expect(cpredIsFleetVehicle(car({ fleetRowId: null, fleetJoined: true }))).toBe(true);
    expect(cpredIsFleetVehicle(car({ fleetRowId: null }))).toBe(false);
  });
});

describe('NOM-14 broń od Rodziny (G9)', () => {
  const mounted = car({ upgrades: [{ id: 'u1', upgradeId: 'heavyMount', notes: '' }] });
  const gift = CPRED_FLEET_GIFT_WEAPON_IDS[0]!;

  it('raz, przy Stanowisku w aucie Taboru, jedna z trzech broni', () => {
    expect(cpredFleetGiftProblem([mounted], null, gift)).toBeNull();
    expect(cpredFleetGiftProblem([car()], null, gift)).toBe('NO_HEAVY_MOUNT');
    expect(cpredFleetGiftProblem([mounted], gift, gift)).toBe('GIFT_TAKEN');
    expect(cpredFleetGiftProblem([mounted], null, 'weapon.inna')).toBe('NOT_A_GIFT');
  });
});
