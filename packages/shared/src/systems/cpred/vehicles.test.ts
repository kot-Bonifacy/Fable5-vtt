import { describe, expect, it } from 'vitest';
import { validateCompendiumEntry, type VehicleEntry } from './compendium.js';
import { readCpredFleet, cpredFleetProblem } from './roleability.js';
import {
  cpredDriverIncapable,
  cpredDrivingTestNeeded,
  cpredCoastSpeed,
  cpredVehicleChase,
  cpredVehicleSpeed,
  CPRED_VEHICLE_FALLBACK,
  cpredFleetRowLevel,
  cpredGuessFleetVehicle,
  cpredVehicleDerived,
  cpredVehicleFromCatalog,
  cpredVehicleLayout,
  cpredVehicleHpAfterUpgrades,
  cpredVehiclePatch,
  cpredVehicleSize,
  cpredVehicleSkillId,
  cpredVehicleUpgradeProblem,
  cpredVehicleUpgradesProblem,
  readCpredVehicle,
  cpredInterfaceLinkDodges,
  cpredVehicleHit,
  cpredVehicleWindowHit,
  cpredVehicleWindows,
  cpredVehicleWrecked,
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

  it('reinforced frame moves current PUK too, unless the GM sent them', () => {
    const mounted = cpredVehiclePatch(base, { upgrades: [{ id: 'r', upgradeId: 'reinforced' }] });
    expect(mounted.ok && [mounted.stats.hp, cpredVehicleDerived(mounted.stats).hpMax]).toEqual([
      70, 70,
    ]);
    if (!mounted.ok) return;
    const removed = cpredVehiclePatch(mounted.stats, { upgrades: [] });
    expect(removed.ok && removed.stats.hp).toBe(50);
    const typed = cpredVehiclePatch(base, {
      hp: 30,
      upgrades: [{ id: 'r', upgradeId: 'reinforced' }],
    });
    expect(typed.ok && typed.stats.hp).toBe(30);
  });
});

describe('cpredVehicleHpAfterUpgrades', () => {
  const plain = [{ upgradeId: 'nitro' as const }];
  const framed = [...plain, { upgradeId: 'reinforced' as const }];

  it('adds 20 on mounting and takes 20 on removal, damage stays', () => {
    expect(cpredVehicleHpAfterUpgrades(40, plain, framed)).toBe(60);
    expect(cpredVehicleHpAfterUpgrades(60, framed, plain)).toBe(40);
    expect(cpredVehicleHpAfterUpgrades(40, plain, plain)).toBe(40);
  });

  it('a wreck stays a wreck, removal never wrecks a running car', () => {
    expect(cpredVehicleHpAfterUpgrades(0, plain, framed)).toBe(0);
    expect(cpredVehicleHpAfterUpgrades(5, framed, plain)).toBe(1);
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
    // Furgon z modelu z Ulepszeniem foteli: osiem miejsc w bryle furgonu.
    expect(cpredVehicleLayout(readCpredVehicle({ kind: 'car', seats: 6, van: true }))).toBe(
      'van-6',
    );
    expect(
      cpredVehicleLayout(
        readCpredVehicle({
          kind: 'car',
          seats: 6,
          van: true,
          upgrades: [{ id: 'a', upgradeId: 'extraSeats' }],
        }),
      ),
    ).toBe('van-8');
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
    // Furgon (MG 06.11): sześć foteli w trzech rzędach za kabiną, osiem — w czterech.
    expect(vehicleLayoutFor('van', 6)).toBe('van-6');
    expect(vehicleLayoutFor('van', 4)).toBe('van-6');
    expect(vehicleLayoutFor('van', 8)).toBe('van-8');
    for (const id of ['van-6', 'van-8'] as const) {
      expect(VEHICLE_LAYOUTS[id][0]!.y).toBeGreaterThanOrEqual(0.3);
    }
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

describe('pojazd w pościgu (65c)', () => {
  const stats = readCpredVehicle({ kind: 'car', hpMax: 50, seats: 4, move: 20 });

  it('liczy budżet, dryf i zbiorniki Nitro; zgaszony silnik daje pełny dryf w tył', () => {
    expect(cpredVehicleChase(stats, { tempo: 40, started: true, nitroUsed: 0 })).toEqual({
      moveSq: 5,
      driftSq: -5,
      nitroLeft: 0,
    });
    const nitro = readCpredVehicle({
      kind: 'car',
      hpMax: 50,
      seats: 4,
      move: 40,
      upgrades: [
        { id: 'a', upgradeId: 'nitro' },
        { id: 'b', upgradeId: 'nitro' },
      ],
    });
    expect(cpredVehicleChase(nitro, { tempo: 40, started: false, nitroUsed: 1 })).toEqual({
      moveSq: 0,
      driftSq: -10,
      nitroLeft: 1,
    });
  });

  it('bez kierowcy auto powoli zwalnia: połowa na rundę, poniżej 4 stoi (05.11)', () => {
    expect(cpredCoastSpeed(40)).toBe(20);
    expect(cpredCoastSpeed(20)).toBe(10);
    expect(cpredCoastSpeed(10)).toBe(5);
    expect(cpredCoastSpeed(5)).toBe(0);
    expect(cpredCoastSpeed(0)).toBe(0);
  });

  it('własna prędkość: kierowca — Ruch, bez kierowcy — pęd, zgaszone i wrak — 0 (05.11)', () => {
    expect(cpredVehicleSpeed(stats, { started: true, driven: true, momentum: null })).toBe(20);
    expect(cpredVehicleSpeed(stats, { started: true, driven: false, momentum: null })).toBe(0);
    expect(cpredVehicleSpeed(stats, { started: true, driven: false, momentum: 10 })).toBe(10);
    // Pęd nie przekracza Ruchu auta.
    expect(cpredVehicleSpeed(stats, { started: true, driven: false, momentum: 40 })).toBe(20);
    expect(cpredVehicleSpeed(stats, { started: false, driven: true, momentum: 20 })).toBe(0);
    const wreck = readCpredVehicle({ kind: 'car', hpMax: 50, hp: 0, seats: 4, move: 20 });
    expect(cpredVehicleSpeed(wreck, { started: true, driven: true, momentum: 20 })).toBe(0);
  });

  it('dryf liczy się z podanej prędkości i ramy, budżet kierowcy zostaje z Ruchu (05.11)', () => {
    // Auto bez kierowcy toczy się 10 na drodze 40: −7,5 kratki; budżet bez zmian.
    expect(cpredVehicleChase(stats, { tempo: 40, started: true, nitroUsed: 0, speed: 10 })).toEqual(
      { moveSq: 5, driftSq: -7.5, nitroLeft: 0 },
    );
    // Auto drużyny stoi — rama 0, auto z kierowcą odjeżdża do przodu.
    expect(cpredVehicleChase(stats, { tempo: 0, started: true, nitroUsed: 0 })).toMatchObject({
      driftSq: 5,
    });
  });

  it('Test zwykłej jazdy przy REF + Umiejętność ≤ 9', () => {
    expect(cpredDrivingTestNeeded(5, 4)).toBe(true);
    expect(cpredDrivingTestNeeded(6, 4)).toBe(false);
  });

  it('Nieprzytomny, Martwy i Śmiertelnie Ranny nie prowadzą', () => {
    expect(cpredDriverIncapable(['mortally-wounded'])).toBe(true);
    expect(cpredDriverIncapable(['unconscious'])).toBe(true);
    expect(cpredDriverIncapable(['prone'])).toBe(false);
  });
});

describe('walka pojazdów (etap 65d1, s. 191)', () => {
  const armored = readCpredVehicle({
    kind: 'car',
    hpMax: 50,
    seats: 4,
    move: 40,
    upgrades: [
      { id: 'u1', upgradeId: 'armoredHull', notes: '' },
      { id: 'u2', upgradeId: 'bulletproofGlass', notes: '' },
    ],
  });

  it('trafienie w kadłub: obrażenia minus OB kadłuba z PUK, nadwyżka przepada', () => {
    const hit = cpredVehicleHit(armored, { damage: 20 });
    expect(hit).toMatchObject({ armorSp: 13, through: 7, lost: 7, hpAfter: 43, wrecked: false });
    const plain = readCpredVehicle({ kind: 'car', hpMax: 50, seats: 4, move: 40, hp: 5 });
    expect(cpredVehicleHit(plain, { damage: 30 })).toMatchObject({
      armorSp: 0,
      lost: 5,
      hpAfter: 0,
      wrecked: true,
    });
  });

  it('słaby punkt mnoży ×2 to, co przeszło przez OB; broń biała bierze połowę OB', () => {
    expect(cpredVehicleHit(armored, { damage: 20, weakSpot: true }).lost).toBe(14);
    expect(cpredVehicleHit(armored, { damage: 20, halvesArmor: true })).toMatchObject({
      armorSp: 7,
      lost: 13,
    });
    expect(cpredVehicleHit(armored, { damage: 20, barrierSp: 5 }).lost).toBe(2);
  });

  it('szyby kuloodporne: każda burta osobno, pełne PW tam, gdzie nic nie oberwało', () => {
    const windows = cpredVehicleWindows({ ...armored, windows: { left: 4 } });
    expect(windows?.left).toEqual({ hp: 4, max: 15 });
    expect(windows?.front).toEqual({ hp: 15, max: 15 });
    expect(cpredVehicleWindows(readCpredVehicle({ kind: 'car' }))).toBeNull();
    expect(cpredVehicleWindowHit(15, 20)).toEqual({ hpBefore: 15, hpAfter: 0 });
    // Odczyt przycina do sufitu i gubi burty spoza listy.
    const read = readCpredVehicle({ ...armored, windows: { left: 99, roof: 1, rear: 3 } });
    expect(read.windows).toEqual({ rear: 3 });
  });

  it('wrak nie jedzie: dryf z pełnym tempem, jak zgaszone auto', () => {
    const wreck = { ...armored, hp: 0 };
    expect(cpredVehicleWrecked(wreck)).toBe(true);
    expect(cpredVehicleChase(wreck, { tempo: 40, started: true, nitroUsed: 0 })).toMatchObject({
      moveSq: 0,
      driftSq: -10,
    });
  });

  it('Ulepszone zespolenie: motocykl, złącza interfejsu i REF 8+ (s. 165)', () => {
    const bike = readCpredVehicle({
      kind: 'motorcycle',
      seats: 2,
      upgrades: [{ id: 'l', upgradeId: 'interfaceLink', notes: '' }],
    });
    const plugs = ['Złącza interfejsu'];
    expect(cpredInterfaceLinkDodges(bike, { ref: 8, cyberware: plugs })).toBe(true);
    expect(cpredInterfaceLinkDodges(bike, { ref: 7, cyberware: plugs })).toBe(false);
    expect(cpredInterfaceLinkDodges(bike, { ref: 9, cyberware: [] })).toBe(false);
    expect(cpredInterfaceLinkDodges({ ...bike, upgrades: [] }, { ref: 9, cyberware: plugs })).toBe(
      false,
    );
  });
});
