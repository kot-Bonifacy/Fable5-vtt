import type { Locator } from '@playwright/test';
import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { query } from '../../fixtures/db.ts';
import { characterId } from '../../fixtures/nocna-zmiana.ts';
import {
  ROLES,
  breakdownRow,
  calledTest,
  cardData,
  dataOf,
  gmSocket,
  lastMessageId,
  rollAfter,
  seatRole,
  startFromRoleStart,
} from '../../fixtures/role.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { shakeCup } from '../../fixtures/table.ts';
import { openSheet } from '../../fixtures/walka.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 71b — Nomada, Moto (s. 161–165), stan dzisiejszy, **bez sceny pościgu**
 * (Manewr i Wyścig z Moto — etap 72). Wiersze macierzy: NOM-01, NOM-04, NOM-05,
 * NOM-07, NOM-12, NOM-K2; od 71c1 Tabor po bramce: NOM-06 (G38), NOM-08 (G6),
 * NOM-09 (G7), NOM-11 (G8), NOM-14 (G9); od 71c2 NOM-10 (naprawa auta Testem z Moto).
 */

const NOMAD = ROLES.nomad;
type FleetRow = {
  id: string;
  kind: 'vehicle' | 'upgrade';
  vehicleId?: string;
  upgradeId?: string;
  level: number;
};
const fleet = () => cardData<{ fleet: FleetRow[] }>(NOMAD.card).fleet;
const vehicles = () =>
  query<{ id: string; name: string; system: string }>(
    'SELECT v.id, v.name, v.system FROM Vehicle v WHERE v.ownerCharacterId = ?',
    characterId(NOMAD.card),
  );
type VehicleSystem = {
  hp: number;
  hpMax: number;
  upgrades: { upgradeId: string }[];
  fleetJoined?: true;
  inUseFrom?: number;
  inUseUntil?: number;
  familyRepairUntil?: number;
};
const systemOf = (id: string) =>
  JSON.parse(vehicles().find((row) => row.id === id)?.system ?? '{}') as VehicleSystem;
const eddies = () => cardData<{ eddies: number }>(NOMAD.card).eddies;
const GIFT = 'weapon.tsunami-arms-helix';
/** 1000 ed z s. 162 × cennik domowy sprzętu (etap 47a) — `CPRED_MOTO_UPGRADE_FEE`. */
const FAMILY_UPGRADE = 10_000;

test.describe.serial('@szybkie T71 Nomada — Moto', () => {
  let damian: Actor;
  let card: Locator;
  let gm: Socket;
  const panel = () => card.locator('[data-sheet-panel="fleet"]');

  test.beforeAll(async ({ cast }) => {
    await startFromRoleStart();
    ({ player: damian, card } = await seatRole(cast, 'nomad'));
    gm = await gmSocket();
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
  });

  test('NOM-01 Moto dokłada poziom do Testu Prowadzenia pojazdów (poza pościgiem)', async () => {
    const roll = await calledTest(
      gm,
      damian,
      NOMAD.card,
      { kind: 'skill', skillId: 'driving' },
      13,
      [3],
    );
    expect(breakdownRow(roll, 'Moto')?.value, JSON.stringify(roll.breakdown)).toBe(4);
    // REF 7 + Prowadzenie 6 + Moto 4 + kość 3.
    expect(roll.total).toBe(20);
  });

  test('NOM-04 NOM-07 NOM-K2 wpis „Pojazd” Taboru staje się prawdziwym autem na karcie', async () => {
    card = await openSheet(damian, NOMAD.card);
    await expect(panel()).toBeVisible();
    await panel().getByRole('button', { name: 'Dołóż pojazd' }).click();
    await expect.poll(() => fleet().length).toBe(1);
    await expect.poll(() => fleet()[0]?.vehicleId ?? null, { timeout: 15_000 }).not.toBeNull();
    expect(vehicles().map((v) => v.id)).toContain(fleet()[0]!.vehicleId);
    await expect(panel()).toContainText('PUK');
  });

  test('NOM-04 NOM-12 wpis „Ulepszenie” trafia do auta Taboru; po czterech wpisach koniec', async () => {
    const upgrade = panel().getByRole('button', { name: 'Dołóż ulepszenie' });
    for (let entries = 1; entries < NOMAD.rank; entries += 1) {
      await expect(upgrade).toBeEnabled();
      await upgrade.click();
      await expect.poll(() => fleet().length).toBe(entries + 1);
    }
    await expect(upgrade).toBeDisabled();
    await expect(panel().getByRole('button', { name: 'Dołóż pojazd' })).toBeDisabled();
    const rows = fleet().filter((row) => row.kind === 'upgrade');
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.vehicleId, JSON.stringify(row)).toBe(fleet()[0]!.vehicleId);
      expect(row.upgradeId, JSON.stringify(row)).toBeTruthy();
    }
    const system = JSON.parse(vehicles()[0]!.system) as { upgrades?: { fleetRowId?: string }[] };
    test
      .info()
      .annotations.push({ type: 'ulepszenia auta', description: JSON.stringify(system.upgrades) });
    expect((system.upgrades ?? []).filter((entry) => entry.fleetRowId).length).toBe(3);
  });

  test('NOM-04 NOM-05 gniazdo nie dopisze piątego wpisu ani pojazdu ponad próg Moto', async () => {
    const player = await damian.socket();
    const current = fleet();
    const tooMany = await emitAck(player, 'character:update', {
      characterId: characterId(NOMAD.card),
      patch: {
        data: {
          fleet: [
            ...current,
            {
              id: 'piaty',
              kind: 'vehicle',
              name: 'Motocykl',
              level: 1,
              notes: '',
              compendiumId: 'vehicle.motocykl',
            },
          ],
        },
      },
    });
    expect(tooMany).toMatchObject({ ok: false });
    const tooHigh = await emitAck(player, 'character:update', {
      characterId: characterId(NOMAD.card),
      patch: {
        data: {
          fleet: [
            {
              id: 'super',
              kind: 'vehicle',
              name: 'Supersamochód',
              level: 9,
              notes: '',
              compendiumId: 'vehicle.supersamochod',
            },
          ],
        },
      },
    });
    expect(tooHigh).toMatchObject({ ok: false });
    expect(fleet().length).toBe(4);
    expect(damian.unexpectedErrors()).toEqual([]);
  });

  // ───────────── 71c1: Tabor po bramce (G38, G6, G7, G8, G9) ─────────────

  const tab = (name: 'Karta' | 'Ekwipunek') =>
    card.getByRole('button', { name, exact: true }).click();
  const vehicleCard = (id: string) => card.locator(`.vehicle-card[data-vehicle-id="${id}"]`);
  const fleetCar = () => fleet()[0]!.vehicleId!;
  let bought = '';

  test('NOM-06 G38 Tabor podsuwa tylko pojazdy z tabeli s. 162; gniazdo nie wpisze Karetki', async () => {
    await tab('Karta');
    const options = await panel()
      .locator('.fleet-row select')
      .first()
      .locator('option')
      .allTextContents();
    expect(options.length).toBeGreaterThan(0);
    for (const name of ['Karetka', 'Radiowóz', 'Taksówka']) {
      expect(options.join(' | ')).not.toContain(name);
    }
    const player = await damian.socket();
    const forged = await emitAck(player, 'character:update', {
      characterId: characterId(NOMAD.card),
      patch: {
        data: {
          fleet: fleet().map((row, i) =>
            i === 0 ? { ...row, compendiumId: 'vehicle.karetka' } : row,
          ),
        },
      },
    });
    expect(forged).toEqual({ ok: false, error: 'NOT_FLEET_VEHICLE' });
  });

  test('NOM-08 G6 „Biorę to auto” — jedno auto Taboru w użyciu', async () => {
    await tab('Ekwipunek');
    const car = vehicleCard(fleetCar());
    await expect(car).toContainText('U Rodziny');
    await car.getByRole('button', { name: 'Biorę to auto' }).click();
    await expect.poll(() => systemOf(fleetCar()).inUseFrom ?? null).not.toBeNull();
    await expect(car.locator('[data-fleet-state="inUse"]')).toHaveText('W użyciu');
    const player = await damian.socket();
    expect(await emitAck(player, 'vehicle:fleet-use', { vehicleId: fleetCar() })).toEqual({
      ok: false,
      error: 'ALREADY_IN_USE',
    });
  });

  test('NOM-09 G7 wrak do Rodziny: 500 ed i tydzień poza Taborem', async () => {
    const player = await damian.socket();
    expect(await emitAck(player, 'vehicle:family-repair', { vehicleId: fleetCar() })).toEqual({
      ok: false,
      error: 'NOT_WRECKED',
    });
    dataOf(
      await emitAck(gm, 'vehicle:update', { vehicleId: fleetCar(), patch: { system: { hp: 0 } } }),
      'vehicle:update wrak',
    );
    dataOf(
      await emitAck(gm, 'character:update', {
        characterId: characterId(NOMAD.card),
        patch: { data: { eddies: 600 } },
      }),
      'character:update 600 ed',
    );
    const car = vehicleCard(fleetCar());
    await car.getByRole('button', { name: /Oddaj Rodzinie do naprawy/ }).click();
    await expect.poll(eddies).toBe(100);
    const back = systemOf(fleetCar());
    expect(back.hp).toBe(back.hpMax);
    expect(back.familyRepairUntil).toBeGreaterThan(0);
    expect(back.inUseFrom).toBeUndefined();
    await expect(car.locator('[data-fleet-state="family"]')).toContainText('U Rodziny do');
    await expect(car.getByRole('button', { name: 'Biorę to auto' })).toHaveCount(0);
    expect(await emitAck(player, 'vehicle:fleet-use', { vehicleId: fleetCar() })).toEqual({
      ok: false,
      error: 'AT_FAMILY',
    });
  });

  test('NOM-11 G8 Głowa Rodziny dokłada auto do Taboru i ulepsza je po cenniku Rodziny', async () => {
    bought = dataOf<{ id: string }>(
      await emitAck(gm, 'vehicle:create', {
        catalogId: 'vehicle.samochod-kompaktowy',
        ownerCharacterId: characterId(NOMAD.card),
      }),
      'vehicle:create kompakt',
    ).id;
    const player = await damian.socket();
    expect(await emitAck(player, 'vehicle:fleet-join', { vehicleId: bought })).toEqual({
      ok: false,
      error: 'NOT_FAMILY_ELDER',
    });
    dataOf(
      await emitAck(gm, 'character:update', {
        characterId: characterId(NOMAD.card),
        patch: { data: { roleAbilityRank: 10, eddies: 3 * FAMILY_UPGRADE } },
      }),
      'character:update Moto 10',
    );
    const car = vehicleCard(bought);
    await car.getByRole('button', { name: 'Do Taboru Rodziny' }).click();
    await expect.poll(() => systemOf(bought).fleetJoined ?? false).toBe(true);
    await expect(car.locator('[data-fleet-state]')).toHaveText('W Taborze');
    await car.getByRole('combobox', { name: /Ulepszenie od Rodziny/ }).selectOption({
      label: 'Wzmocniona konstrukcja',
    });
    await car.getByRole('button', { name: /Rodzina montuje/ }).click();
    await expect.poll(eddies).toBe(2 * FAMILY_UPGRADE);
    expect(systemOf(bought).upgrades.map((row) => row.upgradeId)).toContain('reinforced');
    // Na Moto 10 cały Tabor jest przy Nomadzie — wymiany nie ma.
    expect(await emitAck(player, 'vehicle:fleet-use', { vehicleId: bought })).toEqual({
      ok: false,
      error: 'ELDER_USES_ALL',
    });
  });

  test('NOM-14 G9 pierwsze Stanowisko bardzo ciężkiej broni — broń od Rodziny, raz', async () => {
    const player = await damian.socket();
    expect(
      await emitAck(player, 'character:fleet-gift', {
        characterId: characterId(NOMAD.card),
        entryId: GIFT,
      }),
    ).toEqual({ ok: false, error: 'NO_HEAVY_MOUNT' });
    const car = vehicleCard(bought);
    await car.getByRole('combobox', { name: /Ulepszenie od Rodziny/ }).selectOption({
      label: 'Stanowisko bardzo ciężkiej broni',
    });
    await car.getByRole('button', { name: /Rodzina montuje/ }).click();
    await expect.poll(eddies).toBe(FAMILY_UPGRADE);
    expect(systemOf(bought).upgrades.map((row) => row.upgradeId)).toContain('heavyMount');

    await tab('Karta');
    await panel().getByRole('combobox', { name: 'Prezent od Rodziny' }).selectOption(GIFT);
    await panel().getByRole('button', { name: 'Weź od Rodziny' }).click();
    await expect
      .poll(() => cardData<{ fleetGift: string | null }>(NOMAD.card).fleetGift)
      .toBe(GIFT);
    const weapons = cardData<{ weapons: { notes?: string }[] }>(NOMAD.card).weapons;
    expect(weapons.filter((row) => row.notes === 'Prezent od Rodziny')).toHaveLength(1);
    await expect(panel()).toContainText('Prezent od Rodziny:');
    expect(
      await emitAck(player, 'character:fleet-gift', {
        characterId: characterId(NOMAD.card),
        entryId: GIFT,
      }),
    ).toEqual({ ok: false, error: 'GIFT_TAKEN' });
    expect(
      await emitAck(player, 'character:update', {
        characterId: characterId(NOMAD.card),
        patch: { data: { fleetGift: null } },
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(damian.unexpectedErrors()).toEqual([]);
  });

  test('NOM-10 TEC-S1 G11 Nomada naprawia auto Testem: Naprawa pojazdów + Moto, PT ze stopnia uszkodzeń', async () => {
    const full = systemOf(bought).hp;
    dataOf(
      await emitAck(gm, 'vehicle:update', {
        vehicleId: bought,
        patch: { system: { hp: Math.floor(full / 2) } },
      }),
      'vehicle:update pół PUK',
    );
    await tab('Ekwipunek');
    const car = vehicleCard(bought);
    const since = lastMessageId();
    scriptDice([5]);
    await car.getByRole('button', { name: 'Napraw (Test)' }).click();
    await shakeCup(damian.page);
    const roll = await rollAfter(since, 'Naprawa', 'roll');
    expect(breakdownRow(roll, 'Moto')?.value, JSON.stringify(roll.breakdown)).toBe(10);
    expect(roll.outcome?.success, JSON.stringify(roll.outcome)).toBe(true);
    // Połowa PUK albo mniej — „Poważne uszkodzenia”: PT 13 i dzień (s. 147).
    expect(roll.outcome?.detail).toContain('PT 13');
    expect(roll.clock).toMatchObject({ minutes: 24 * 60 });
    expect(pendingDice()).toBe('');
    await expect.poll(() => systemOf(bought).hp).toBe(full);
    await expect(car.getByRole('button', { name: 'Napraw (Test)' })).toHaveCount(0);
    expect(damian.unexpectedErrors()).toEqual([]);
  });
});
