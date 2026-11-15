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
  messagesAfter,
  seatRole,
  startFromRoleStart,
} from '../../fixtures/role.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { closeSheet, openSheet } from '../../fixtures/walka.ts';
import { pendingDice } from '../../instance/instance.ts';

/**
 * Etap 71b — Technik, Twórca (s. 147–149), stan dzisiejszy. Wiersze macierzy:
 * TEC-01, TEC-02, TEC-04 (#85), TEC-06 (#86), TEC-10, TEC-11.
 * Ulepszanie, Wytwarzanie i Wynajdywanie nie mają rzutu (TEC-07 ❌) — nie ma czego klikać.
 */

const TECH = ROLES.tech;
type Armor = {
  id: string;
  sp: number;
  spCurrent: number;
  fieldRepair?: unknown;
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
  let patchMark = 0;
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

  test('TEC-04 Prowizorka oddaje kurtce pełne OB; „Koniec prowizorki” przywraca stan sprzed', async () => {
    card = await openSheet(bartek, TECH.card);
    await card.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    patchMark = lastMessageId();
    await card.getByRole('button', { name: 'Prowizorka', exact: true }).click();
    await expect.poll(() => armor().spCurrent).toBe(11);
    expect(armor().fieldRepair).toBeTruthy();
    await card.getByRole('button', { name: 'Koniec prowizorki', exact: true }).click();
    await expect.poll(() => armor().spCurrent).toBe(7);
    expect(armor().fieldRepair ?? null).toBeNull();
  });

  test('#85 TEC-04 Prowizorka to Test (PT naprawy, z poziomem Naprawy) — dziś bez rzutu', async () => {
    test.fail(true, '#85 — Prowizorka zawsze się udaje, karty rzutu nie ma');
    const rolls = messagesAfter(patchMark).filter((row) => row.kind === 'roll');
    expect(rolls.length).toBeGreaterThan(0);
  });

  test('#86 TEC-06 raz załatanej rzeczy nie łata się drugi raz przed pełną naprawą — dziś wolno', async () => {
    test.fail(true, '#86 — po „Koniec prowizorki” znacznik znika i kurtkę da się załatać znowu');
    const ack = await emitAck(await bartek.socket(), 'character:field-repair', {
      characterId: characterId(TECH.card),
      armorRowId: 'r71-kurtka',
    });
    expect(ack).toMatchObject({ ok: false });
  });

  test('TEC-10 TEC-11 Ulepszanie +1 OB klika MG, raz na przedmiot', async () => {
    // Stan po #86 bywa różny (łata albo nie) — MG zaczyna od czystej kurtki.
    if (armor().fieldRepair) {
      await emitAck(gm, 'character:field-repair', {
        characterId: characterId(TECH.card),
        armorRowId: 'r71-kurtka',
        undo: true,
      });
    }
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
