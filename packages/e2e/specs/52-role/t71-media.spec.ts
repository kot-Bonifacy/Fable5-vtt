import type { Locator } from '@playwright/test';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { campaignId, characterId } from '../../fixtures/nocna-zmiana.ts';
import {
  ROLES,
  cardData,
  dataOf,
  gmSocket,
  lastMessageId,
  messagesAfter,
  rollAfter,
  seatRole,
  startFromRoleStart,
} from '../../fixtures/role.ts';
import { queryOne } from '../../fixtures/db.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { shakeCup } from '../../fixtures/table.ts';
import { closeSheet, openSheet } from '../../fixtures/walka.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 71b / 71f — Media, Wiarygodność (s. 151–153). Wiersze macierzy:
 * MDA-01, MDA-02, MDA-03, MDA-04 (licznik Pogłosek w tygodniu), MDA-05
 * („Szukaj pogłosek”), MDA-07, MDA-08, MDA-09, MDA-10 (rejestr publikacji).
 */

const TOPIC = 'Przekręt w ratuszu';

interface MediaSheet {
  publications?: { topic: string; believed: boolean; again?: boolean }[];
  rumourWeek?: { week: number; rolls: number } | null;
}

const MEDIA = ROLES.media;
const gameMinutes = (): number =>
  queryOne<{ gameTime: number }>('SELECT gameTime FROM Campaign WHERE id = ?', campaignId())!
    .gameTime;

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
    // MDA-10: materiał bez tematu nie idzie.
    await expect(panel().getByRole('button', { name: 'Publikuj' })).toBeDisabled();
    await panel().getByLabel('Temat materiału').fill(TOPIC);
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
      request: {
        kind: 'reliability',
        reliabilityProof: 'none',
        reliabilityTopic: 'Inna sprawa',
        luckSpent: 1,
      },
      visibility: 'public',
    });
    expect(refused).toMatchObject({ ok: false });
  });

  test('MDA-10 rejestr publikacji: temat wraca tylko z nowymi informacjami', async () => {
    const sheet = () => cardData<MediaSheet>(MEDIA.card);
    await expect.poll(() => sheet().publications?.map((row) => row.topic)).toEqual([TOPIC]);
    await expect(panel().getByTestId('publications')).toContainText('Publikacje (1)');
    // Ten sam temat (pole wciąż go trzyma): guzik gaśnie, gniazdo odmawia.
    await expect(panel().getByRole('button', { name: 'Publikuj' })).toBeDisabled();
    const refused = await emitAck(await iga.socket(), 'character:roll', {
      characterId: characterId(MEDIA.card),
      request: { kind: 'reliability', reliabilityProof: 'none', reliabilityTopic: TOPIC },
      visibility: 'public',
    });
    expect(refused).toMatchObject({ ok: false, error: 'ALREADY_PUBLISHED' });
    await panel().getByLabel('Mam nowe informacje').check();
    const since = lastMessageId();
    scriptDice([9]);
    await panel().getByRole('button', { name: 'Publikuj' }).click();
    await shakeCup(iga.page);
    const roll = await rollAfter(since, 'Rzetelno', 'roll');
    expect(roll.outcome?.success, JSON.stringify(roll.outcome)).toBe(false);
    await expect.poll(() => sheet().publications?.length).toBe(2);
    expect(sheet().publications![1]).toMatchObject({ believed: false, again: true });
    // Rejestru nie przepisze łata karty, a wpisu nie usunie gracz.
    const forged = await emitAck(await iga.socket(), 'character:update', {
      characterId: characterId(MEDIA.card),
      patch: { data: { publications: [] } },
    });
    expect(forged).toMatchObject({ ok: false });
  });

  test('MDA-05 „Szukaj pogłosek”: gracz prosi o Test, MG wzywa z PT z tabeli', async () => {
    const since = lastMessageId();
    const search = panel().getByTestId('rumour-search');
    await search.getByLabel('Jakiej pogłoski szukasz').selectOption('typical');
    await search.getByRole('button', { name: 'Szukaj pogłosek' }).click();
    await expect
      .poll(() =>
        messagesAfter(since).some((row) => row.payload?.includes('Szukanie pogłosek: typowa')),
      )
      .toBe(true);
    // Gracz nie wystawi sobie wezwania z progiem — to zdarzenie MG.
    const forged = await emitAck(await iga.socket(), 'check:call', {
      characterId: characterId(MEDIA.card),
      request: { kind: 'skill', skillId: 'library-search', modifier: 0, luckSpent: 0 },
      dv: 1,
      visibility: 'public',
    });
    expect(forged).toMatchObject({ ok: false });
    await closeSheet(iga.page);
    const gmCard = await openSheet(mg, MEDIA.card);
    const before = lastMessageId();
    await gmCard
      .getByTestId('rumour-search')
      .getByRole('button', { name: 'Szukaj pogłosek' })
      .click();
    // Domyślnie mglista pogłoska — aktywne PT 13.
    await expect
      .poll(() =>
        messagesAfter(before).some(
          (row) => row.kind === 'check' && row.payload?.includes('"dv":13') === true,
        ),
      )
      .toBe(true);
    await closeSheet(mg.page);
    card = await openSheet(iga, MEDIA.card);
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
    // MDA-04: dwa rzuty w tym tygodniu kalendarza — licznik na guziku i na karcie.
    await expect(rumours).toHaveText('Pogłoski 2/2');
    expect(cardData<MediaSheet>(MEDIA.card).rumourWeek?.rolls).toBe(2);
    await closeSheet(mg.page);
    await iga.page.getByRole('button', { name: /^Czat/ }).first().click();
    // Karta rzutu MG nazywa się „Pogłoski”; „Szukanie pogłosek” z MDA-05 to co innego.
    await expect(iga.page.locator('.chat-message', { hasText: /Pogłoski/ })).toHaveCount(0);
    for (const actor of [mg, iga]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });

  test('MDA-04 tydzień z jednym rzutem Pogłosek zostawia MG przypomnienie', async () => {
    const gm = await gmSocket();
    try {
      const week = 7 * 24 * 60;
      const now = gameMinutes;
      // Następny tydzień: licznik zeruje się bez przypomnienia (były dwa rzuty).
      const first = lastMessageId();
      dataOf(await emitAck(gm, 'time:set', { minutes: now() + week }), 'time:set +tydzień');
      await expect.poll(() => cardData<MediaSheet>(MEDIA.card).rumourWeek?.rolls).toBe(0);
      expect(messagesAfter(first).some((row) => row.text.includes('rzutów Pogłosek'))).toBe(false);
      // Jeden rzut i kolejny tydzień: wiersz dla MG.
      scriptDice([2]);
      dataOf(
        await emitAck(gm, 'character:roll', {
          characterId: characterId(MEDIA.card),
          request: { kind: 'rumour', modifier: 0, luckSpent: 0 },
          visibility: 'gm',
        }),
        'Pogłoski z gniazda MG',
      );
      const second = lastMessageId();
      dataOf(await emitAck(gm, 'time:set', { minutes: now() + week }), 'time:set +tydzień');
      await expect
        .poll(() =>
          messagesAfter(second).some(
            (row) =>
              row.kind === 'gmaction' && row.text.includes('minął tydzień z 1 z 2 rzutów Pogłosek'),
          ),
        )
        .toBe(true);
    } finally {
      gm.close();
    }
  });
});
