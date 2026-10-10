import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { queryOne, seat, startFromPoT6 } from '../../fixtures/regresja.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { closeSheet, openSheet } from '../../fixtures/walka.ts';

/**
 * T8c, leczenie i efekty ręką MG (zaległość z 10.10.2026, punkt 5): MG leczy
 * Kowala strzałką PW na karcie i nakłada mu efekt z panelu „Efekty czasowe”,
 * a Marek widzi oba skutki bez przeładowania — liczbę na karcie, pasek swojej
 * figury i efekt na karcie. Gniazdo (przycinanie, naklejki ran, odmowy gracza)
 * sprawdza `server/src/gm-care.test.ts`; tu jest tylko szew UI ↔ serwer.
 */

interface Sheet {
  hpCurrent: number;
  statEffects: { stat: string; value: number; source: string }[];
}

function kowal(): { id: string; data: Sheet } {
  const row = queryOne<{ id: string; data: string }>(
    `SELECT id, data FROM Character WHERE name = 'Kowal'`,
  )!;
  return { id: row.id, data: JSON.parse(row.data) as Sheet };
}

function kowalTokenId(): string {
  return queryOne<{ id: string }>(
    `SELECT t.id FROM Token t JOIN Scene s ON s.id = t.sceneId
     WHERE s.name = 'Knajpa' AND t.characterId = ?`,
    kowal().id,
  )!.id;
}

/** Pasek PW figury Kowala w sklepie gracza — to, co rysuje mapa. */
async function barOf(actor: Actor, tokenId: string): Promise<number | undefined> {
  const state = await actor.store<{
    tokens: Record<string, { hp?: { current: number } | null }>;
  }>('token');
  return state.tokens[tokenId]?.hp?.current;
}

test.describe.serial('T8c leczenie: PW i efekt z karty MG, skutki u gracza', () => {
  let mg: Actor;
  let marek: Actor;
  let tokenId: string;
  let start: number;

  test.beforeAll(async () => {
    await startFromPoT6(DEAD_GATEWAY);
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('start z po-T6: MG i Marek przy „Knajpie”, Kowal ranny', async ({ cast }) => {
    const table = await seat(cast, ['Marek']);
    mg = table.mg;
    marek = table.players[0]!;
    tokenId = kowalTokenId();
    // Punkt wyjścia nie zależy od tego, jak skończył się łańcuch: MG ustawia
    // Kowalowi 10 PW (poniżej progu Poważnie Rannego przy każdych Cechach).
    const ack = await emitAck(await mg.socket(), 'character:update', {
      characterId: kowal().id,
      patch: { data: { hpCurrent: 10 } },
    });
    expect(ack).toMatchObject({ ok: true });
    await expect.poll(() => barOf(marek, tokenId)).toBe(10);
    start = 10;
  });

  test('MG leczy strzałką PW na karcie — Marek widzi liczbę na karcie i pasek figury', async () => {
    const region = await openSheet(mg, 'Kowal');
    const more = region.getByRole('button', { name: 'Punkty Wytrzymałości: więcej' });
    for (let i = 0; i < 3; i += 1) {
      await more.click();
      await expect(
        region.getByRole('spinbutton', { name: 'Punkty Wytrzymałości' }),
      ).toHaveAttribute('aria-valuenow', String(start + i + 1));
    }
    await expect.poll(() => kowal().data.hpCurrent).toBe(start + 3);
    await closeSheet(mg.page);

    await expect.poll(() => barOf(marek, tokenId)).toBe(start + 3);
    const own = await openSheet(marek, 'Kowal');
    await expect(own.getByRole('spinbutton', { name: 'Punkty Wytrzymałości' })).toHaveAttribute(
      'aria-valuenow',
      String(start + 3),
    );
    await closeSheet(marek.page);
  });

  test('MG nakłada efekt z „Efektów czasowych” — Marek widzi go na swojej karcie', async () => {
    const source = 'Środek przeciwbólowy';
    const region = await openSheet(mg, 'Kowal');
    const panel = region.locator('.cp-stat-effects');
    await panel.getByLabel('Cecha efektu').selectOption({ label: 'BC' });
    await panel.getByLabel('O ile').fill('1');
    await panel.getByLabel('Źródło efektu').fill(source);
    await panel.getByLabel('Czas trwania').selectOption({ label: 'na 10 min' });
    await panel.getByRole('button', { name: 'Nałóż', exact: true }).click();
    await expect
      .poll(() => kowal().data.statEffects.map((e) => [e.stat, e.value, e.source]))
      .toEqual([['body', 1, source]]);
    await closeSheet(mg.page);

    const own = await openSheet(marek, 'Kowal');
    await expect(own.locator('.cp-stat-effects')).toContainText(source);
    // Gracz efektu nie nakłada — panel bez przycisku „Nałóż”.
    await expect(own.getByRole('button', { name: 'Nałóż', exact: true })).toHaveCount(0);
    await closeSheet(marek.page);
  });
});
