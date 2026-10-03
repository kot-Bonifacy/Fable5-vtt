import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { queryOne } from '../../fixtures/db.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { createInvitation } from '../../fixtures/table.ts';
import { characterRow, closeSheet, openSheet } from '../../fixtures/walka.ts';
import { restoreCheckpoint, startInstance } from '../../instance/instance.ts';

/**
 * T7b, część 3: deterministyczne odtworzenie utraty notatek z obciążenia stołu
 * (`t7b-obciazenie`, 02.10). Echo zapisu karty (`character:upsert`) idzie przez
 * kolejkę prezentacji rzutów (`onPresented`), a ack zapisu — od razu. Do
 * poprawki #49 spóźnione echo zapisu A przychodziło po zapisie B i cofało kartę
 * gracza do A; dopisek w tym oknie zapisywał A + C, a B ginęło w bazie. Od 02.10
 * widok karty niesie `revision` i klient odrzuca starszy od posiadanego.
 */

type CharacterStore = { characters: Record<string, { data: { notes: string } }> };

test.describe.serial('T7b odporność: spóźnione echo zapisu karty @odpornosc', () => {
  let mg: Actor;
  let marek: Actor;

  test.beforeAll(async () => {
    test.setTimeout(3 * 60_000);
    await restoreCheckpoint('po-T6');
    await startInstance(DEAD_GATEWAY);
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('#49 notatka zapisana między dwoma rzutami MG nie ginie po spóźnionym echu', async ({
    cast,
  }) => {
    test.setTimeout(3 * 60_000);
    mg = await cast.mg('chromium');
    const campaign = queryOne<{ id: string }>(
      `SELECT id FROM Campaign WHERE name = 'Nocna zmiana'`,
    )!.id;
    marek = await cast.gracz('Marek', 'chromium', await createInvitation(mg, campaign, 'Marek'));
    const gm = await mg.socket();
    const kowal = characterRow('Kowal').id;
    const stored = () => (JSON.parse(characterRow('Kowal').data) as { notes: string }).notes ?? '';
    const seen = async () =>
      (await marek.store<CharacterStore>('character'))?.characters[kowal]?.data.notes ?? '';
    const base = stored();

    const region = await openSheet(marek, 'Kowal');
    const notes = region.getByLabel('Notatki');
    async function append(chunk: string) {
      await notes.click();
      await notes.press('Control+End');
      await notes.pressSequentially(chunk, { delay: 25 });
      // Autozapis po 600 ms ciszy, potem ack.
      await expect.poll(stored, { timeout: 10_000 }).toBe(`${base}${typed}${chunk}`);
      typed += chunk;
    }
    let typed = '';
    const roll = async () =>
      expect(await emitAck(gm, 'chat:send', { text: '/r 2d6' })).toMatchObject({ ok: true });

    // R1 trzyma kolejkę Marka; echo A czeka za nim, R2 za echem A, echo B za R2.
    await roll();
    await append(' ·A');
    await roll();
    await append(' ·B');
    const reverted = await expect
      .poll(seen, { timeout: 20_000, intervals: [100] })
      .toBe(`${base} ·A`)
      .then(
        () => true,
        () => false,
      );
    test.info().annotations.push({
      type: 'karta Marka cofnięta do zapisu A (bez ·B)',
      description: String(reverted),
    });
    expect.soft(reverted, '#49: spóźnione echo zapisu A cofnęło kartę Marka').toBe(false);
    test.info().annotations.push({
      type: 'pole „Notatki” w tej chwili',
      description: await notes.inputValue(),
    });
    await notes.click();
    await notes.press('Control+End');
    await notes.pressSequentially(' ·C', { delay: 25 });
    await expect.poll(stored, { timeout: 10_000 }).toMatch(/ ·C$/);
    await marek.page.waitForTimeout(15_000);
    await closeSheet(marek.page);
    test.info().annotations.push({ type: 'notatki w bazie', description: stored().slice(-40) });
    expect(stored(), 'zapis B przeżył spóźnione echo').toBe(`${base} ·A ·B ·C`);
  });
});
