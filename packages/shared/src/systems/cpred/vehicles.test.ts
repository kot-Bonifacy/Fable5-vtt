import { describe, expect, it } from 'vitest';
import { validateCompendiumEntry, type VehicleEntry } from './compendium.js';
import { readCpredFleet, cpredFleetProblem } from './roleability.js';
import {
  CPRED_VEHICLE_FALLBACK,
  cpredFleetRowLevel,
  cpredGuessFleetVehicle,
  cpredVehicleDerived,
  cpredVehicleFromCatalog,
  cpredVehicleLayout,
  cpredVehiclePatch,
  cpredVehicleSize,
  cpredVehicleSkillId,
  cpredVehicleUpgradeProblem,
  cpredVehicleUpgradesProblem,
  readCpredVehicle,
} from './vehicles.js';
import { VEHICLE_LAYOUTS, vehicleLayoutFor } from '../../vehicles.js';

const entry = (over: Partial<VehicleEntry>): VehicleEntry => ({
  id: 'vehicle.test',
  name: 'Test',
  category: 'vehicle',
  cost: 1000,
  vehicleKind: 'car',
  hp: 50,
  seats: 4,
  move: 20,
  ...over,
});

const CATALOG: VehicleEntry[] = [
  entry({
    id: 'vehicle.motocykl',
    name: 'Motocykl',
    vehicleKind: 'motorcycle',
    seats: 2,
    hp: 35,
    motoLevel: 1,
  }),
  entry({
    id: 'vehicle.supermotocykl',
    name: 'Supermotocykl',
    vehicleKind: 'motorcycle',
    seats: 2,
    hp: 35,
    move: 60,
    motoLevel: 7,
  }),
  entry({ id: 'vehicle.samochod-kompaktowy', name: 'Samochód kompaktowy', motoLevel: 1 }),
  entry({ id: 'vehicle.samochod-sportowy', name: 'Samochód sportowy', move: 40, motoLevel: 5 }),
  entry({ id: 'vehicle.motorowka', name: 'Motorówka', vehicleKind: 'boat', motoLevel: 5 }),
];

describe('readCpredVehicle', () => {
  it('fills defaults for an empty or broken payload', () => {
    const stats = readCpredVehicle('{nope');
    expect(stats.kind).toBe(CPRED_VEHICLE_FALLBACK.kind);
    expect(stats.hpMax).toBe(50);
    expect(stats.hp).toBe(50);
    expect(stats.upgrades).toEqual([]);
  });

  it('drops unknown upgrades and duplicate row ids', () => {
    const stats = readCpredVehicle({
      kind: 'car',
      upgrades: [
        { id: 'a', upgradeId: 'nitro' },
        { id: 'a', upgradeId: 'nitro' },
        { id: 'b', upgradeId: 'laserSharks' },
      ],
    });
    expect(stats.upgrades.map((row) => row.upgradeId)).toEqual(['nitro']);
  });

  it('lets current HP reach the reinforced ceiling', () => {
    const stats = readCpredVehicle({
      hpMax: 50,
      hp: 70,
      upgrades: [{ id: 'r', upgradeId: 'reinforced' }],
    });
    expect(stats.hp).toBe(70);
    expect(readCpredVehicle({ hpMax: 50, hp: 70 }).hp).toBe(50);
  });
});

describe('cpredVehicleDerived', () => {
  it('adds +20 PUK, +2 seats per Seat upgrade, hull SP and glass', () => {
    const derived = cpredVehicleDerived({
      hpMax: 50,
      seats: 4,
      upgrades: [
        { upgradeId: 'reinforced' },
        { upgradeId: 'extraSeats' },
        { upgradeId: 'extraSeats' },
        { upgradeId: 'armoredHull' },
        { upgradeId: 'bulletproofGlass' },
        { upgradeId: 'bulletproofGlass' },
        { upgradeId: 'nitro' },
      ] as never,
    });
    expect(derived).toMatchObject({ hpMax: 70, seats: 8, hullSp: 13, windowHp: 30, nitroTanks: 1 });
  });

  it('thin glass is 15 PW, no glass is no cover', () => {
    expect(
      cpredVehicleDerived({
        hpMax: 1,
        seats: 1,
        upgrades: [{ upgradeId: 'bulletproofGlass' }] as never,
      }).windowHp,
    ).toBe(15);
    expect(cpredVehicleDerived({ hpMax: 1, seats: 1, upgrades: [] }).windowHp).toBe(0);
  });
});

describe('upgrade rules', () => {
  it('refuses reinforced frame on a motorcycle', () => {
    expect(cpredVehicleUpgradeProblem('motorcycle', [], 'reinforced')).toBe('UPGRADE_NOT_FOR_KIND');
    expect(cpredVehicleUpgradeProblem('car', [], 'reinforced')).toBeNull();
  });

  it('a rocket pod needs the reinforced frame, in any order of rows', () => {
    expect(cpredVehicleUpgradeProblem('car', [], 'rocketPod')).toBe('UPGRADE_NEEDS_REINFORCED');
    expect(
      cpredVehicleUpgradesProblem('car', [{ upgradeId: 'rocketPod' }, { upgradeId: 'reinforced' }]),
    ).toBeNull();
  });

  it('once means once, glass twice, seats once on small vehicles only', () => {
    expect(cpredVehicleUpgradeProblem('car', [{ upgradeId: 'armoredHull' }], 'armoredHull')).toBe(
      'UPGRADE_ONCE',
    );
    const glass = [{ upgradeId: 'bulletproofGlass' as const }];
    expect(cpredVehicleUpgradeProblem('car', glass, 'bulletproofGlass')).toBeNull();
    expect(cpredVehicleUpgradeProblem('car', [...glass, ...glass], 'bulletproofGlass')).toBe(
      'UPGRADE_ONCE',
    );
    const seats = [{ upgradeId: 'extraSeats' as const }];
    expect(cpredVehicleUpgradeProblem('motorcycle', seats, 'extraSeats')).toBe('UPGRADE_ONCE');
    expect(cpredVehicleUpgradeProblem('car', seats, 'extraSeats')).toBeNull();
  });

  it('ram plough fits a car but not a motorcycle or jetski', () => {
    expect(cpredVehicleUpgradeProblem('car', [], 'ram')).toBeNull();
    expect(cpredVehicleUpgradeProblem('motorcycle', [], 'ram')).toBe('UPGRADE_NOT_FOR_KIND');
    expect(cpredVehicleUpgradeProblem('jetski', [], 'ram')).toBe('UPGRADE_NOT_FOR_KIND');
  });
});

describe('cpredVehiclePatch', () => {
  const base = readCpredVehicle({
    kind: 'car',
    hpMax: 50,
    upgrades: [{ id: 'f', upgradeId: 'nitro', fleetRowId: 'row1' }],
  });

  it('keeps fleet upgrades whatever the GM sends', () => {
    const result = cpredVehiclePatch(base, { upgrades: [{ id: 'g', upgradeId: 'armoredHull' }] });
    expect(result.ok && result.stats.upgrades.map((row) => row.upgradeId)).toEqual([
      'nitro',
      'armoredHull',
    ]);
  });

  it('refuses an upgrade that breaks the rules', () => {
    expect(cpredVehiclePatch(base, { upgrades: [{ id: 'g', upgradeId: 'rocketPod' }] })).toEqual({
      ok: false,
      code: 'UPGRADE_NEEDS_REINFORCED',
    });
  });

  it('refuses junk numbers', () => {
    expect(cpredVehiclePatch(base, { hp: 'lots' }).ok).toBe(false);
  });
});

describe('catalogue and body', () => {
  it('a new vehicle from the catalogue has full PUK and its own body', () => {
    const bike = cpredVehicleFromCatalog(CATALOG[0]!);
    expect(bike).toMatchObject({
      kind: 'motorcycle',
      hp: 35,
      hpMax: 35,
      catalogId: 'vehicle.motocykl',
    });
    expect(cpredVehicleLayout(bike)).toBe('bike-2');
    expect(cpredVehicleSize(bike)).toEqual({ widthSq: 2, lengthSq: 3 });
    expect(cpredVehicleLayout(cpredVehicleFromCatalog(CATALOG[2]!))).toBe('car-4');
    expect(cpredVehicleFromCatalog(null).hpMax).toBe(50);
  });

  it('seat upgrades grow the layout, a van past six seats', () => {
    const van = readCpredVehicle({
      kind: 'car',
      seats: 4,
      upgrades: [
        { id: 'a', upgradeId: 'extraSeats' },
        { id: 'b', upgradeId: 'extraSeats' },
      ],
    });
    expect(cpredVehicleLayout(van)).toBe('van-8');
    expect(cpredVehicleSize(van)).toEqual({ widthSq: 3, lengthSq: 7 });
  });

  it('every layout puts the driver first and keeps seats inside the body', () => {
    for (const seats of Object.values(VEHICLE_LAYOUTS)) {
      expect(seats[0]?.driver).toBe(true);
      expect(seats.filter((seat) => seat.driver)).toHaveLength(1);
      for (const seat of seats) {
        expect(seat.x).toBeGreaterThan(0);
        expect(seat.x).toBeLessThan(1);
        expect(seat.y).toBeGreaterThan(0);
        expect(seat.y).toBeLessThan(1);
      }
    }
    expect(vehicleLayoutFor('bike', 4)).toBe('car-4');
    expect(vehicleLayoutFor('car', 30)).toBe('van-8');
  });

  it('the driving skill follows the kind', () => {
    expect(cpredVehicleSkillId('car')).toBe('driving');
    expect(cpredVehicleSkillId('jetski')).toBe('pilot-sea-vehicle');
    expect(cpredVehicleSkillId('gyro')).toBe('pilot-air-vehicle');
  });

  it('the compendium validates a vehicle entry', () => {
    const ok = validateCompendiumEntry({
      category: 'vehicle',
      name: 'Samochód kompaktowy',
      vehicleKind: 'car',
      hp: 50,
      seats: 4,
      move: 20,
      motoLevel: 1,
      cost: 30000,
    });
    expect(ok.ok && ok.entry.id).toBe('vehicle.samochod-kompaktowy');
    const bad = validateCompendiumEntry({ category: 'vehicle', name: 'X', vehicleKind: 'tank' });
    expect(bad.ok).toBe(false);
  });
});

describe('Tabor Rodziny', () => {
  it('guesses the vehicle of an old row by name, longest name first', () => {
    expect(cpredGuessFleetVehicle('Supermotocykl Rodziny', 7, CATALOG).entry?.id).toBe(
      'vehicle.supermotocykl',
    );
    expect(cpredGuessFleetVehicle('samochod sportowy', 5, CATALOG)).toMatchObject({
      guessed: false,
    });
  });

  it('falls back on a hint word, then on the compact', () => {
    expect(cpredGuessFleetVehicle('Stara łódź wujka', 5, CATALOG)).toMatchObject({
      kind: 'boat',
      guessed: true,
    });
    expect(cpredGuessFleetVehicle('Rumak', 1, CATALOG)).toMatchObject({
      guessed: true,
      entry: { id: 'vehicle.samochod-kompaktowy' },
    });
  });

  it('the row takes the level of what was chosen, so the rank check bites', () => {
    const lookup = (id: string) => CATALOG.find((row) => row.id === id) ?? null;
    const [row] = readCpredFleet([
      {
        id: 'r',
        kind: 'vehicle',
        name: 'Supermotocykl',
        level: 1,
        compendiumId: 'vehicle.supermotocykl',
      },
    ]);
    const level = cpredFleetRowLevel(row!, lookup);
    expect(level).toBe(7);
    expect(cpredFleetProblem([{ ...row!, level }], 4)).toBe('LEVEL_ABOVE_RANK');
    const [upgrade] = readCpredFleet([
      {
        id: 'u',
        kind: 'upgrade',
        name: 'Opancerzenie',
        level: 1,
        upgradeId: 'armoredHull',
        vehicleId: 'v1',
      },
    ]);
    expect(cpredFleetRowLevel(upgrade!, lookup)).toBe(5);
    expect(upgrade).toMatchObject({ vehicleId: 'v1', upgradeId: 'armoredHull' });
  });

  it('a vehicle row does not keep an upgrade id and vice versa', () => {
    const rows = readCpredFleet([
      {
        id: 'a',
        kind: 'vehicle',
        name: 'Auto',
        level: 1,
        upgradeId: 'nitro',
        compendiumId: 'vehicle.x',
      },
      {
        id: 'b',
        kind: 'upgrade',
        name: 'Nitro',
        level: 1,
        compendiumId: 'vehicle.x',
        upgradeId: 'nitro',
      },
    ]);
    expect(rows[0]).not.toHaveProperty('upgradeId');
    expect(rows[1]).not.toHaveProperty('compendiumId');
  });
});
