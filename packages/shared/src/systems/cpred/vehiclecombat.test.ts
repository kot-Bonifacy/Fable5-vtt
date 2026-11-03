import { describe, expect, it } from 'vitest';
import { chaseFirstContact, chaseHitsWithFront } from '../../chase.js';
import { cpredWeaponInHands } from './character.js';
import { cpredIsMountRowId, cpredMountRowId, cpredParseMountRowId } from './mountrows.js';
import {
  CPRED_OBSTACLE_MANEUVER_ID,
  CPRED_RAM_DAMAGE,
  CPRED_SPIKES_DAMAGE,
  CPRED_SPIKES_DV,
  cpredSpikesAffect,
  cpredVehicleSpikesLeft,
  cpredManeuversFor,
  cpredMissingMountWeapons,
  cpredMountRowInfo,
  cpredMountWeaponRows,
  cpredRamContinues,
  cpredRamOutcome,
  cpredVehicleManeuver,
  cpredWithMountWeapons,
} from './vehiclecombat.js';
import { readCpredVehicle } from './vehicles.js';

describe('Manewr (s. 192)', () => {
  it('pięć manewrów jezdni z PT 13 i 17, latający ma swoje dwa', () => {
    expect(cpredManeuversFor('car').map((entry) => [entry.id, entry.dv])).toEqual([
      ['swerve', 13],
      ['sharp-turn', 13],
      ['sudden-stop', 13],
      ['bootleg', 17],
      ['jump', 17],
    ]);
    expect(cpredManeuversFor('aircraft').map((entry) => entry.id)).toEqual([
      'landing',
      'air-maneuver',
    ]);
    expect(cpredVehicleManeuver('bootleg')?.name).toBe('Zawrót na ręcznym');
    expect(cpredVehicleManeuver('drift')).toBeNull();
  });
});

describe('taranowanie (s. 192, Pług bojowy s. 164)', () => {
  it('bez Pługa oba pojazdy po 6k6 i Rana dla jadących', () => {
    expect(cpredRamOutcome({ plow: false, front: true, nitro: true })).toEqual({
      rammerDamage: CPRED_RAM_DAMAGE,
      rammerInjured: true,
      struckDamage: '6k6',
    });
  });

  it('Pług przodem zdejmuje obrażenia i Ranę z taranującego, Nitro dokłada 2k6', () => {
    expect(cpredRamOutcome({ plow: true, front: true, nitro: false })).toEqual({
      rammerDamage: null,
      rammerInjured: false,
      struckDamage: '6k6',
    });
    expect(cpredRamOutcome({ plow: true, front: true, nitro: true }).struckDamage).toBe('6k6+2k6');
  });

  it('pieszego bierze tylko pieszy — auto bez PUK, jadący bez Rany (decyzja MG z 03.11)', () => {
    expect(cpredRamOutcome({ plow: false, front: true, nitro: false, pedestrian: true })).toEqual({
      rammerDamage: null,
      rammerInjured: false,
      struckDamage: '6k6',
    });
  });

  it('Pług nie działa przy uderzeniu bokiem ani tyłem', () => {
    expect(cpredRamOutcome({ plow: true, front: false, nitro: true })).toEqual({
      rammerDamage: '6k6',
      rammerInjured: true,
      struckDamage: '6k6',
    });
  });

  it('po pieszym jedzie dalej zawsze, po aucie — gdy PUK spadły do zera', () => {
    expect(cpredRamContinues({ pedestrian: true, hpAfter: 10 })).toBe(true);
    expect(cpredRamContinues({ pedestrian: false, hpAfter: 3 })).toBe(false);
    expect(cpredRamContinues({ pedestrian: false, hpAfter: 0 })).toBe(true);
  });
});

describe('zderzenie brył na drodze (`chaseFirstContact`)', () => {
  const car = { hx: 250, hy: 150 };
  const other = { id: 'b', centre: { x: 1000, y: 500 }, hx: 250, hy: 150 };

  it('auto jadące w prawo staje przodem na tylnym zderzaku drugiego', () => {
    const contact = chaseFirstContact({ x: 300, y: 500 }, { x: 900, y: 500 }, car, [other]);
    expect(contact?.id).toBe('b');
    expect(contact?.axis).toBe('x');
    expect(contact?.centre.x).toBeCloseTo(500, 1);
    expect(chaseHitsWithFront('right', { x: 300, y: 500 }, { x: 900, y: 500 }, contact!)).toBe(
      true,
    );
  });

  it('wjazd z boku to oś poprzeczna — nie przód', () => {
    const contact = chaseFirstContact({ x: 1000, y: 100 }, { x: 1000, y: 400 }, car, [other]);
    expect(contact?.axis).toBe('y');
    expect(contact?.centre.y).toBeCloseTo(200, 1);
    expect(chaseHitsWithFront('right', { x: 1000, y: 100 }, { x: 1000, y: 400 }, contact!)).toBe(
      false,
    );
  });

  it('cofanie w auto za sobą nie jest uderzeniem przodem', () => {
    const contact = chaseFirstContact({ x: 1700, y: 500 }, { x: 1100, y: 500 }, car, [other]);
    expect(contact?.centre.x).toBeCloseTo(1500, 1);
    expect(chaseHitsWithFront('right', { x: 1700, y: 500 }, { x: 1100, y: 500 }, contact!)).toBe(
      false,
    );
  });

  it('obok w innym pasie, samo dotknięcie i bryły zachodzące na starcie — bez zderzenia', () => {
    expect(chaseFirstContact({ x: 300, y: 200 }, { x: 1600, y: 200 }, car, [other])).toBeNull();
    expect(chaseFirstContact({ x: 300, y: 500 }, { x: 500, y: 500 }, car, [other])).toBeNull();
    expect(chaseFirstContact({ x: 900, y: 500 }, { x: 1400, y: 500 }, car, [other])).toBeNull();
  });

  it('auto stojące po zderzeniu przy przeszkodzie wjeżdża w nią od razu', () => {
    const first = chaseFirstContact({ x: 300, y: 500 }, { x: 900, y: 500 }, car, [other])!;
    const again = chaseFirstContact(first.centre, { x: 700, y: 500 }, car, [other]);
    expect(again?.id).toBe('b');
    expect(again?.t).toBe(0);
  });

  it('z dwóch przeszkód na drodze wygrywa bliższa', () => {
    const near = { id: 'a', centre: { x: 700, y: 500 }, hx: 50, hy: 50 };
    expect(chaseFirstContact({ x: 300, y: 500 }, { x: 900, y: 500 }, car, [other, near])?.id).toBe(
      'a',
    );
  });
});

describe('bronie pokładowe (s. 163–164)', () => {
  const stats = readCpredVehicle({
    kind: 'car',
    hpMax: 50,
    seats: 4,
    move: 20,
    upgrades: [
      { id: 'u-mg', upgradeId: 'machineGun', notes: '' },
      { id: 'u-mg2', upgradeId: 'machineGun', notes: '' },
      { id: 'u-nitro', upgradeId: 'nitro', notes: '' },
      { id: 'u-fire', upgradeId: 'flamethrower', notes: '' },
    ],
    mountAmmo: { 'u-mg': 12, 'u-stray': 3 },
  });
  const lookup = (entryId: string) =>
    entryId === 'weapon.assault-rifle'
      ? { damage: '5k6', magazine: 25, rof: 1 }
      : entryId === 'weapon.miotacz-ognia'
        ? { damage: '5k6', magazine: 4, rof: 1 }
        : null;

  it('id wiersza niesie pojazd i ulepszenie', () => {
    const id = cpredMountRowId('veh-1', 'u-mg');
    expect(cpredIsMountRowId(id)).toBe(true);
    expect(cpredParseMountRowId(id)).toEqual({ vehicleId: 'veh-1', upgradeRowId: 'u-mg' });
    expect(cpredParseMountRowId('w-pistol')).toBeNull();
    expect(cpredParseMountRowId('mount:veh-1')).toBeNull();
  });

  it('karabin ma 30 naboi z opisu, miotacz — magazynek typu; Nitro nie jest bronią', () => {
    expect(stats.mountAmmo).toEqual({ 'u-mg': 12 });
    const rows = cpredMountWeaponRows('veh-1', stats, lookup);
    expect(rows.map((row) => [row.name, row.ammoCurrent, row.ammoMax])).toEqual([
      ['Pokładowy karabin maszynowy', 12, 30],
      ['Pokładowy karabin maszynowy 2', 30, 30],
      ['Pokładowy miotacz ognia', 4, 4],
    ]);
    expect(rows[0]!.compendiumId).toBe('weapon.assault-rifle');
    expect(cpredMountRowInfo('veh-1', 'u-mg', stats)?.definition).toMatchObject({
      autofireOnly: true,
      arc: 'front',
    });
    expect(cpredMountRowInfo('veh-1', 'u-nitro', stats)).toBeNull();
  });

  it('broń pokładowa jest pod ręką kierowcy, poza limitem jednej broni', () => {
    const rows = cpredMountWeaponRows('veh-1', stats, lookup);
    const data = cpredWithMountWeapons({ weapons: [], drawnWeaponRowIds: [] }, rows);
    expect(data.weapons).toHaveLength(3);
    expect(cpredWeaponInHands(data, rows[0]!.id)).toBe(true);
  });
});

describe('kolczatka (65e, s. 165)', () => {
  it('jedna kolczatka na każde wykupienie, na pościg', () => {
    const stats = readCpredVehicle({
      kind: 'car',
      upgrades: [
        { id: 'a', upgradeId: 'spikes' },
        { id: 'b', upgradeId: 'spikes' },
        { id: 'c', upgradeId: 'nitro' },
      ],
    });
    expect(cpredVehicleSpikesLeft(stats, 0)).toBe(2);
    expect(cpredVehicleSpikesLeft(stats, 2)).toBe(0);
    expect(cpredVehicleSpikesLeft(readCpredVehicle({ kind: 'car' }), 0)).toBe(0);
  });

  it('rusza tylko pojazdy z oponami', () => {
    expect(cpredSpikesAffect(readCpredVehicle({ kind: 'car' }))).toBe(true);
    expect(cpredSpikesAffect(readCpredVehicle({ kind: 'motorcycle' }))).toBe(true);
    expect(cpredSpikesAffect(readCpredVehicle({ kind: 'boat' }))).toBe(false);
    expect(
      cpredSpikesAffect(
        readCpredVehicle({ kind: 'car', upgrades: [{ id: 'h', upgradeId: 'hovercraft' }] }),
      ),
    ).toBe(false);
  });

  it('przeszkodę omija się Gwałtownym skrętem PT 13, kolczatkę — Testem PT 17 i 4k6', () => {
    expect(cpredVehicleManeuver(CPRED_OBSTACLE_MANEUVER_ID)).toMatchObject({
      name: 'Gwałtowny skręt',
      dv: 13,
    });
    expect(CPRED_SPIKES_DV).toBe(17);
    expect(CPRED_SPIKES_DAMAGE).toBe('4k6');
  });
});

describe('broń pokładowa spoza katalogu', () => {
  it('wymienia każde ulepszenie raz, gdy katalog nie zna jego broni', () => {
    const stats = readCpredVehicle({
      kind: 'car',
      upgrades: [
        { id: 'a', upgradeId: 'flamethrower' },
        { id: 'b', upgradeId: 'flamethrower' },
        { id: 'c', upgradeId: 'machineGun' },
        { id: 'd', upgradeId: 'nitro' },
      ],
    });
    expect(
      cpredMissingMountWeapons(stats, (entryId) => entryId === 'weapon.assault-rifle'),
    ).toEqual([
      {
        upgradeId: 'flamethrower',
        name: 'Pokładowy miotacz ognia',
        entryId: 'weapon.miotacz-ognia',
      },
    ]);
    expect(cpredMissingMountWeapons(stats, () => true)).toEqual([]);
  });
});
