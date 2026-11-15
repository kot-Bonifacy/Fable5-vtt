import type { Locator } from '@playwright/test';
import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { characterId } from '../../fixtures/nocna-zmiana.ts';
import {
  ROLES,
  breakdownRow,
  calledTest,
  cardData,
  gmSocket,
  lastMessageId,
  rollAfter,
  seatRole,
  startFromRoleStart,
} from '../../fixtures/role.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { shakeCup } from '../../fixtures/table.ts';
import { closeSheet, openSheet } from '../../fixtures/walka.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 71b — Technik, Twórca (s. 147–149). Wiersze macierzy: TEC-01, TEC-02,
 * TEC-04 (#85), TEC-06 (#86), TEC-10, TEC-11. Od 71c0 Prowizorka to Test przez
 * kubek, a zużyta łata blokuje następną do pełnej naprawy.
 * Ulepszanie, Wytwarzanie i Wynajdywanie nie mają rzutu (TEC-07 ❌) — nie ma czego klikać.
 */

const TECH = ROLES.tech;
type Armor = {
  id: string;
  sp: number;
  spCurrent: number;
  fieldRepair?: unknown;
  fieldRepairSpent?: boolean;
  upgrade?: unknown;
};
const armor = () =>
  cardData<{ armor: Armor[] }>(TECH.card).armor.find((row) => row.id === 'r71-kurtka')!;
const fabrication = () => cardData<{ fabrication: Record<string, number> }>(TECH.card).fabrication;

test.describe.serial('@szybkie T71 Technik — Twórca', () => {
  let mg: Actor;
  let bartek: Actor;
  let card: Locator;
  let gm: Socket;
  const panel = () => card.locator('[data-sheet-panel="fabrication"]');
  const plus = (name: string) =>
    panel().getByRole('button', { name: `Dołóż punkt: ${name}`, exact: true });

  test.beforeAll(async ({ cast }) => {
    await startFromRoleStart();
    ({ mg, player: bartek, card } = await seatRole(cast, 'tech'));
    gm = await gmSocket();
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
  });

  test('TEC-01 punkt na poziom w dwóch różnych Specjalizacjach: 4 + 4 i koniec puli', async () => {
    await expect(panel()).toContainText('Do rozdzielenia: 8 z 8');
    for (const name of ['Naprawa', 'Ulepszanie']) {
      for (let guard = 0; guard < 8 && (await plus(name).isEnabled()); guard += 1) {
        const before = JSON.stringify(fabrication());
        await plus(name).click();
        await expect.poll(() => JSON.stringify(fabrication())).not.toBe(before);
      }
    }
    expect(fabrication()).toEqual({ repair: 4, upgrade: 4 });
    await expect(panel()).toContainText('Wszystkie punkty rozdzielone');
    const refused = await emitAck(await bartek.socket(), 'character:update', {
      characterId: characterId(TECH.card),
      patch: { data: { fabrication: { repair: 5, upgrade: 3 } } },
    });
    expect(refused).toMatchObject({ ok: false });
    expect(fabrication()).toEqual({ repair: 4, upgrade: 4 });
  });

  test('TEC-02 Naprawa dokłada poziom do Testu Podstaw techniki', async () => {
    const roll = await calledTest(
      gm,
      bartek,
      TECH.card,
      { kind: 'skill', skillId: 'basic-tech' },
      13,
      [4],
    );
    expect(breakdownRow(roll, 'Naprawa')?.value, JSON.stringify(roll.breakdown)).toBe(4);
    // TECH 8 + Podstawy techniki 6 + Naprawa 4 + kość 4.
    expect(roll.total).toBe(22);
    expect(pendingDice()).toBe('');
  });

  test('#85 TEC-04 Prowizorka to Test przez kubek: PT naprawy kurtki (Premium 17), Naprawa w rozbiciu', async () => {
    card = await openSheet(bartek, TECH.card);
    await card.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    const since = lastMessageId();
    scriptDice([5]);
    await card.getByRole('button', { name: 'Prowizorka', exact: true }).click();
    await shakeCup(bartek.page);
    const roll = await rollAfter(since, 'Prowizorka', 'roll');
    expect(breakdownRow(roll, 'Naprawa')?.value, JSON.stringify(roll.breakdown)).toBe(4);
    // TECH 8 + Podstawowe naprawy 6 + Naprawa 4 + kość 5 = 23 > PT 17 (Premium, s. 140).
    expect(roll.total).toBe(23);
    expect(roll.outcome?.success, JSON.stringify(roll.outcome)).toBe(true);
    expect(roll.outcome?.detail).toContain('PT 17');
    expect(pendingDice()).toBe('');
    await expect.poll(() => armor().spCurrent).toBe(11);
    expect(armor().fieldRepair).toBeTruthy();
  });

  test('#86 TEC-06 „Koniec prowizorki” zostawia ślad — drugiej łaty nie ma do pełnej naprawy', async () => {
    await card.getByRole('button', { name: 'Koniec prowizorki', exact: true }).click();
    await expect.poll(() => armor().spCurrent).toBe(7);
    expect(armor().fieldRepair ?? null).toBeNull();
    expect(armor().fieldRepairSpent).toBe(true);
    await expect(card.getByRole('button', { name: 'Prowizorka', exact: true })).toBeDisabled();
    const ack = await emitAck(await bartek.socket(), 'character:roll', {
      characterId: characterId(TECH.card),
      request: { kind: 'fieldRepair', fieldRepairArmorRowId: 'r71-kurtka' },
      visibility: 'public',
    });
    expect(ack).toEqual({ ok: false, error: 'PATCH_SPENT' });
    // Stara droga bez rzutu też odmawia.
    const direct = await emitAck(await bartek.socket(), 'character:field-repair', {
      characterId: characterId(TECH.card),
      armorRowId: 'r71-kurtka',
    });
    expect(direct).toEqual({ ok: false, error: 'FIELD_REPAIR_NEEDS_ROLL' });
  });

  test('TEC-10 TEC-11 Ulepszanie +1 OB klika MG, raz na przedmiot', async () => {
    await expect(card.locator('.armor-actions')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Ulepsz: +1 OB' })).toHaveCount(0);
    await closeSheet(bartek.page);
    const gmCard = await openSheet(mg, TECH.card);
    await gmCard.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    await gmCard.getByRole('button', { name: 'Ulepsz: +1 OB' }).click();
    await expect.poll(() => armor().sp).toBe(12);
    expect(armor().upgrade).toBeTruthy();
    await expect(gmCard.getByRole('button', { name: 'Ulepsz: +1 OB' })).toHaveCount(0);
    await closeSheet(mg.page);
    for (const actor of [mg, bartek]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });
});
