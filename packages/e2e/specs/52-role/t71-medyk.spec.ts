import type { Locator } from '@playwright/test';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { characterId } from '../../fixtures/nocna-zmiana.ts';
import {
  ROLES,
  cardData,
  lastMessageId,
  rollAfter,
  seatRole,
  startFromRoleStart,
} from '../../fixtures/role.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 71b — Medyk, Medycyna (s. 149–150), stan dzisiejszy. Wiersze macierzy:
 * MED-01, MED-02, MED-07, MED-08, MED-09, MED-10, MED-15.
 * Chirurgia na ranie krytycznej i wszczepy (MED-05, MED-06) mają testy serwera
 * i scenariusz T5b (Iskra) — tu Medyk z kreatora i jego Farmaceutyki.
 */

const MED = ROLES.medtech;
type Gear = { name: string; qty: number; compendiumId?: string };
type Sheet = {
  medicine: Record<string, number>;
  eddies: number;
  gear: Gear[];
  recovery: { antibioticDays: number };
};
const sheet = () => cardData<Sheet>(MED.card);
const antibiotics = () => sheet().gear.filter((row) => /Antybiotyk/.test(row.name));

test.describe.serial('@szybkie T71 Medyk — Medycyna', () => {
  let celina: Actor;
  let card: Locator;
  const panel = () => card.locator('[data-sheet-panel="medicine"]');
  const plus = (name: string) =>
    panel().getByRole('button', { name: `Dołóż punkt: ${name}`, exact: true });

  test.beforeAll(async ({ cast }) => {
    await startFromRoleStart();
    ({ player: celina, card } = await seatRole(cast, 'medtech'));
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('MED-01 MED-02 MED-07 punkt na poziom: Chirurgia za 2 punkty Umiejętności, Farmaceutyki do Technologii Medycznej', async () => {
    await expect(panel()).toContainText('Do rozdzielenia: 4 z 4');
    for (const name of [
      'Chirurgia',
      'Chirurgia',
      'Technologia Medyczna (Farmaceutyki)',
      'Technologia Medyczna (Farmaceutyki)',
    ]) {
      const before = JSON.stringify(sheet().medicine);
      await plus(name).click();
      await expect.poll(() => JSON.stringify(sheet().medicine)).not.toBe(before);
    }
    expect(sheet().medicine).toEqual({ surgery: 2, pharma: 2 });
    await expect(panel()).toContainText('Wszystkie punkty rozdzielone');
    await expect(panel()).toContainText('Chirurgia 4');
    await expect(panel()).toContainText('Technologia Medyczna 2');
    const refused = await emitAck(await celina.socket(), 'character:update', {
      characterId: characterId(MED.card),
      patch: { data: { medicine: { surgery: 3, pharma: 2 } } },
    });
    expect(refused).toMatchObject({ ok: false });
  });

  test('MED-08 MED-09 dwa punkty Farmaceutyków otwierają dwa środki; partia Antybiotyku: Test PT 13, surowce, dawki', async () => {
    const pharma = panel().locator('details', {
      hasText: 'Farmaceutyki — dostęp do 2 z 5 środków',
    });
    await pharma.locator('summary').click();
    await expect(pharma.getByRole('button', { name: /^Wytwórz/ })).toHaveCount(2);
    const eddies = sheet().eddies;
    const since = lastMessageId();
    scriptDice([8]);
    await pharma
      .locator('li', { hasText: 'Antybiotyk' })
      .getByRole('button', { name: /^Wytwórz/ })
      .click();
    const roll = await rollAfter(since, 'Antybiotyk');
    // TECH 7 + Technologia Medyczna 2 + kość 8 = 17 ≥ PT 13.
    expect(roll.total, JSON.stringify(roll)).toBe(17);
    expect(pendingDice()).toBe('');
    await expect.poll(() => antibiotics().reduce((sum, row) => sum + row.qty, 0)).toBe(2);
    expect(sheet().eddies).toBeLessThan(eddies);
    test
      .info()
      .annotations.push({ type: 'koszt partii', description: String(eddies - sheet().eddies) });

    // Trzeci środek tabeli (Turbo uzdrawiacz) jest poza dwoma punktami.
    const refused = await emitAck(await celina.socket(), 'character:craft-pharma', {
      characterId: characterId(MED.card),
      pharmaId: 'pharma.turbo-uzdrawiacz',
    });
    expect(refused).toMatchObject({ ok: false });
  });

  test('MED-10 MED-15 dawka Antybiotyku podana sobie: tydzień leczenia, jedna dawka mniej', async () => {
    await card.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    const doses = card.locator('.cp-doses');
    await expect(doses.locator('select')).toHaveValue('');
    await doses
      .locator('li', { hasText: 'Antybiotyk' })
      .getByRole('button', { name: /^(Podaj|Zażyj)$/ })
      .click();
    await expect.poll(() => antibiotics().reduce((sum, row) => sum + row.qty, 0)).toBe(1);
    await expect.poll(() => sheet().recovery.antibioticDays).toBe(7);
    expect(celina.unexpectedErrors()).toEqual([]);
  });
});
