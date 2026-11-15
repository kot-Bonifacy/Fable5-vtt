import type { Locator } from '@playwright/test';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { characterId } from '../../fixtures/nocna-zmiana.ts';
import {
  ROLES,
  lastMessageId,
  messagesAfter,
  rollAfter,
  seatRole,
  startFromRoleStart,
} from '../../fixtures/role.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { shakeCup } from '../../fixtures/table.ts';
import { closeSheet, openSheet } from '../../fixtures/walka.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 71b — Media, Wiarygodność (s. 151–153), stan dzisiejszy. Wiersze
 * macierzy: MDA-01, MDA-02, MDA-03, MDA-07, MDA-08, MDA-09. Licznik Pogłosek
 * w tygodniu (MDA-04) i rejestr publikacji (MDA-10) to ❌ — nie ma czego klikać.
 */

const MEDIA = ROLES.media;

test.describe.serial('@szybkie T71 Media — Wiarygodność', () => {
  let mg: Actor;
  let iga: Actor;
  let card: Locator;
  const panel = () => card.locator('.cp-role-strip');

  test.beforeAll(async ({ cast }) => {
    await startFromRoleStart();
    ({ mg, player: iga, card } = await seatRole(cast, 'media'));
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('MDA-07 MDA-08 Rzetelność 3 na 10 przy randze 4, rzetelny dowód +1; „Publikuj” to goła kość', async () => {
    await expect(panel()).toContainText('Rzetelność: 3 na 10');
    await panel().getByLabel('Dowody w materiale').selectOption('solid');
    await expect(panel()).toContainText('Rzetelność: 4 na 10');
    const since = lastMessageId();
    scriptDice([4]);
    await panel().getByRole('button', { name: 'Publikuj' }).click();
    await shakeCup(iga.page);
    const roll = await rollAfter(since, 'Rzetelno', 'roll');
    expect(roll.total, JSON.stringify(roll)).toBe(4);
    expect(roll.outcome?.success, JSON.stringify(roll.outcome)).toBe(true);
    expect(pendingDice()).toBe('');
    // Pogłoski to rzut MG — gracz nie ma przycisku.
    await expect(panel().getByRole('button', { name: 'Pogłoski' })).toHaveCount(0);
  });

  test('MDA-09 w Teście Rzetelności nie używa się Szczęścia — gniazdo odrzuca', async () => {
    const refused = await emitAck(await iga.socket(), 'character:roll', {
      characterId: characterId(MEDIA.card),
      request: { kind: 'reliability', reliabilityProof: 'none', luckSpent: 1 },
      visibility: 'public',
    });
    expect(refused).toMatchObject({ ok: false });
  });

  test('MDA-01 MDA-02 MDA-03 Pogłoski: potajemny rzut MG, remis z progiem nic nie daje, przebity próg — tak', async () => {
    await closeSheet(iga.page);
    const gmCard = await openSheet(mg, MEDIA.card);
    const rumours = gmCard.locator('.cp-role-strip').getByRole('button', { name: 'Pogłoski' });
    const outcomes: (string | undefined)[] = [];
    for (const face of [3, 4]) {
      const since = lastMessageId();
      scriptDice([face]);
      await rumours.click();
      await shakeCup(mg.page);
      const roll = await rollAfter(since, 'Pogłos');
      expect(roll.total).toBe(4 + face);
      outcomes.push(roll.outcome?.label);
      const row = messagesAfter(since).find((message) => message.id === roll.id)!;
      test
        .info()
        .annotations.push({ type: `Pogłoski ${4 + face}`, description: JSON.stringify(row) });
    }
    // 7 to dokładnie próg „zasłyszanej” pogłoski — remis nie wystarcza; 8 przebija.
    expect(outcomes[0]).not.toEqual(outcomes[1]);
    await closeSheet(mg.page);
    await iga.page.getByRole('button', { name: /^Czat/ }).first().click();
    await expect(iga.page.locator('.chat-message', { hasText: 'Pogłos' })).toHaveCount(0);
    for (const actor of [mg, iga]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });
});
