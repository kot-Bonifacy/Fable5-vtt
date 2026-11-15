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
  gmSocket,
  seatRole,
  startFromRoleStart,
} from '../../fixtures/role.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { openSheet } from '../../fixtures/walka.ts';

/**
 * Etap 71b — Nomada, Moto (s. 161–165), stan dzisiejszy, **bez sceny pościgu**
 * (Manewr i Wyścig z Moto — etap 72). Wiersze macierzy: NOM-01, NOM-04, NOM-05,
 * NOM-07, NOM-12, NOM-K2.
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
});
