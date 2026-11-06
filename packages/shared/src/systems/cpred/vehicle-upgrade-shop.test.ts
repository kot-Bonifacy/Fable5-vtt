import { describe, expect, it } from 'vitest';
import {
  cpredAssortmentCovers,
  cpredAssortmentVehicleUpgrades,
  cpredMerchantRepairsVehicles,
} from './assortment.js';
import { validateCompendiumEntry, type CompendiumRegistry } from './compendium.js';
import { shopTierOf } from './shop.js';
import {
  CPRED_VEHICLE_UPGRADES,
  cpredVehicleFromCatalog,
  readCpredVehicle,
  type CpredVehicleStats,
} from './vehicles.js';
import {
  cpredVehicleDamage,
  cpredVehicleRepairQuote,
  cpredVehicleRepaired,
  cpredVehicleUpgradeBuyProblem,
  cpredVehicleUpgradeEntries,
  cpredVehicleUpgradeEntryId,
  cpredVehicleUpgradeForSale,
  withVehicleUpgradeEntries,
} from './vehicle-upgrade-shop.js';
import { cpredVehicleQuote } from './vehicle-models.js';

/** Etap 68 (decyzje MG z 06.11.2026): ulepszenia za ed i naprawa w warsztacie. */

const compact = (): CpredVehicleStats =>
  cpredVehicleFromCatalog({
    id: 'vehicle.test',
    vehicleKind: 'car',
    hp: 50,
    seats: 4,
    move: 20,
  });

describe('ulepszenia pojazdu jako wpisy kompendium', () => {
  const entries = cpredVehicleUpgradeEntries();
  const byUpgrade = new Map(entries.map((entry) => [entry.upgradeId, entry]));

  it('każde ulepszenie z s. 163–165 ma wpis z id po myślnikach', () => {
    expect(entries).toHaveLength(CPRED_VEHICLE_UPGRADES.length);
    expect(cpredVehicleUpgradeEntryId('armoredHull')).toBe('vehicle-upgrade.armored-hull');
    expect(byUpgrade.get('machineGun')?.id).toBe('vehicle-upgrade.machine-gun');
    for (const entry of entries) {
      expect(cpredVehicleUpgradeForSale(entry)).toBe(true);
      // Wpis przechodzi tę samą walidację co wpis MG (edytor, paczka).
      expect(validateCompendiumEntry(entry).ok).toBe(true);
    }
  });

  it('cena pasma × 3 i poziom: Moto 1 → 3000 ed i Wojskowe, reszta → 15 000 ed i Czarny rynek', () => {
    const gun = byUpgrade.get('machineGun')!;
    expect(gun).toMatchObject({ cost: 3_000, costCategory: 'veryExpensive' });
    expect(shopTierOf(gun)).toBe(3);
    const hull = byUpgrade.get('armoredHull')!;
    expect(hull).toMatchObject({ cost: 15_000, costCategory: 'luxury' });
    expect(shopTierOf(hull)).toBe(4);
    // MG przestawia poziom pojedynczego wpisu jak każdego innego.
    expect(shopTierOf(gun, { overrides: { [gun.id]: 2 } })).toBe(2);
    // Lada: × mnożnik handlarza, targ Fixera schodzi.
    expect(cpredVehicleQuote(gun, { priceMul: 120, discount: 10 })).toEqual({
      listed: 3_600,
      price: 3_240,
    });
  });

  it('dopisuje się do katalogu, a wpis grupy o tym samym id wygrywa', () => {
    const own = { ...byUpgrade.get('nitro')!, cost: 999 };
    const registry: CompendiumRegistry = {
      weaponTypes: [],
      weaponTypeById: new Map(),
      entries: [own],
      entryById: new Map([[own.id, own]]),
    } as unknown as CompendiumRegistry;
    const next = withVehicleUpgradeEntries(registry);
    expect(next.entries).toHaveLength(CPRED_VEHICLE_UPGRADES.length);
    expect(next.entryById.get(own.id)?.cost).toBe(999);
  });

  it('warsztat handlarza to osobna kategoria — „pozostałe” jej nie obejmują', () => {
    const gun = byUpgrade.get('machineGun')!;
    expect(cpredAssortmentCovers(gun, { base: 4, categories: { vehicle: 4 } })).toBe(false);
    expect(cpredMerchantRepairsVehicles({ base: 4, categories: {} })).toBe(false);
    expect(cpredMerchantRepairsVehicles(null)).toBe(false);
    const workshop = { base: 1 as const, categories: { vehicleUpgrade: 3 as const } };
    expect(cpredMerchantRepairsVehicles(workshop)).toBe(true);
    const offers = cpredAssortmentVehicleUpgrades(entries, workshop).map((e) => e.upgradeId);
    expect(offers).toContain('machineGun');
    expect(offers).not.toContain('armoredHull');
  });
});

describe('montaż kupionego ulepszenia', () => {
  it('reguły podręcznika i bez aut z Taboru', () => {
    const car = compact();
    expect(cpredVehicleUpgradeBuyProblem(car, 'machineGun')).toBeNull();
    expect(cpredVehicleUpgradeBuyProblem(car, 'rocketPod')).toBe('UPGRADE_NEEDS_REINFORCED');
    expect(cpredVehicleUpgradeBuyProblem(car, 'interfaceLink')).toBe('UPGRADE_NOT_FOR_KIND');
    const armored = readCpredVehicle({
      ...car,
      upgrades: [{ id: 'a', upgradeId: 'armoredHull', notes: '' }],
    });
    expect(cpredVehicleUpgradeBuyProblem(armored, 'armoredHull')).toBe('UPGRADE_ONCE');
    expect(cpredVehicleUpgradeBuyProblem({ ...car, fleetRowId: 'tabor' }, 'nitro')).toBe(
      'VEHICLE_IN_FLEET',
    );
  });
});

describe('naprawa w warsztacie', () => {
  it('całe auto — nic do naprawy', () => {
    expect(cpredVehicleRepairQuote(compact())).toBeNull();
  });

  it('50 ed za brakujący PUK, z mnożnikiem lady i targiem', () => {
    const car = readCpredVehicle({ ...compact(), hp: 40 });
    expect(cpredVehicleRepairQuote(car)).toMatchObject({
      missingHp: 10,
      damage: 'light',
      listed: 500,
      price: 500,
    });
    expect(cpredVehicleRepairQuote(car, { priceMul: 150, discount: 20 })).toMatchObject({
      listed: 750,
      price: 600,
    });
  });

  it('stopień uszkodzeń: połowa PUK to poważne, PUK 0 to wrak', () => {
    expect(cpredVehicleDamage(readCpredVehicle({ ...compact(), hp: 26 }))).toBe('light');
    expect(cpredVehicleDamage(readCpredVehicle({ ...compact(), hp: 25 }))).toBe('serious');
    const wreck = readCpredVehicle({ ...compact(), hp: 0 });
    expect(cpredVehicleDamage(wreck)).toBe('wrecked');
    expect(cpredVehicleRepairQuote(wreck)?.listed).toBe(2_500);
  });

  it('same szyby kosztują jak jeden PUK, naprawa wstawia je i dobija PUK do sufitu', () => {
    const glass = readCpredVehicle({
      ...compact(),
      hp: 60,
      upgrades: [
        { id: 'r', upgradeId: 'reinforced', notes: '' },
        { id: 'g', upgradeId: 'bulletproofGlass', notes: '' },
      ],
      windows: { left: 3 },
    });
    expect(glass.hp).toBe(60);
    expect(cpredVehicleRepairQuote(glass)).toMatchObject({ missingHp: 10, windows: 1 });
    const fixed = cpredVehicleRepaired(glass);
    expect(fixed.hp).toBe(70);
    expect(fixed.windows).toEqual({});
    const onlyGlass = readCpredVehicle({ ...fixed, windows: { front: 0 } });
    expect(cpredVehicleRepairQuote(onlyGlass)).toMatchObject({ missingHp: 0, listed: 50 });
  });
});
