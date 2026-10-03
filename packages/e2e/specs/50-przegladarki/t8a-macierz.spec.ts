import { expect, test, type Actor, type Engine } from '../../fixtures/actors.ts';
import { query } from '../../fixtures/db.ts';
import { KNAJPA } from '../../fixtures/maps.ts';
import { campaignId } from '../../fixtures/nocna-zmiana.ts';
import { clickOnMap, fitCamera, tokenCentre } from '../../fixtures/scene.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { createInvitation, rollTotals, rollWithCup, say } from '../../fixtures/table.ts';
import {
  activeName,
  aim,
  cellCentre,
  chipInitiatives,
  clientsSeeTurn,
  closeSheet,
  combatantOf,
  combatants,
  combatRow,
  endPlayerTurn,
  lastMessageId,
  noDodge,
  openSheet,
  queueOf,
  rollAndWait,
  rollById,
  sceneRow,
  settledWithoutApply,
  sheet,
  sumOf,
  token,
} from '../../fixtures/walka.ts';
import {
  hasCheckpoint,
  pendingDice,
  restoreCheckpoint,
  scriptDice,
  startInstance,
} from '../../instance/instance.ts';

/**
 * T8a, macierz silników (`testy.md` 6.4): skrót scenariusza z punktu `po-T3`
 * w dwóch układach — MG w Chromium, gracze w Firefoksie, i odwrotnie (decyzja MG
 * z 03.10). Na ekranie 1920 × 1080: czat i szept, rzut kubkiem, notatka na karcie,
 * marsz, walka z inicjatywą, strzał z obrażeniami, koniec tur i walki. Konsola
 * każdego aktora bez nowych błędów przez cały skrót.
 */

const LAYOUTS: { mg: Engine; gracze: Engine }[] = [
  { mg: 'chromium', gracze: 'firefox' },
  { mg: 'firefox', gracze: 'chromium' },
];

for (const layout of LAYOUTS) {
  test.describe.serial(`@szybkie T8a macierz: MG ${layout.mg}, gracze ${layout.gracze}`, () => {
    let mg: Actor;
    let marek: Actor;
    let ola: Actor;
    let cell: number;
    const everyone = () => [mg, marek, ola];

    test.beforeAll(async () => {
      test.skip(!hasCheckpoint('po-T3'), 'brak punktu po-T3 — najpierw pełny przebieg T3');
      test.setTimeout(3 * 60_000);
      await restoreCheckpoint('po-T3');
      await startInstance(DEAD_GATEWAY);
      cell = sceneRow().gridSizePx;
    });

    test.afterAll(async ({ cast }) => {
      await cast.closeAll();
    });

    test('start z po-T3: MG, Marek i Ola przy „Knajpie”', async ({ cast }) => {
      test.setTimeout(2 * 60_000);
      cast.viewport = { width: 1920, height: 1080 };
      mg = await cast.mg(layout.mg);
      marek = await cast.gracz(
        'Marek',
        layout.gracze,
        await createInvitation(mg, campaignId(), 'Marek'),
      );
      ola = await cast.gracz('Ola', layout.gracze, await createInvitation(mg, campaignId(), 'Ola'));
      expect(query('SELECT id FROM Combat')).toEqual([]);
      for (const actor of everyone()) {
        await expect
          .poll(
            async () =>
              (await actor.store<{ scene: { name: string } | null }>('scene'))?.scene?.name,
          )
          .toBe('Knajpa');
        await fitCamera(actor.page, KNAJPA.width, KNAJPA.height).catch(() => undefined);
      }
    });

    test('czat do stołu i szept MG do Marka, którego Ola nie dostaje', async () => {
      const line = `Macierz ${layout.mg}: knajpa pachnie smażonym krylem.`;
      await say(mg, line);
      for (const actor of [marek, ola]) {
        await expect(actor.page.locator('.chat-message', { hasText: line })).toBeVisible();
      }
      const secret = `Szept ${layout.mg}: Rzeźnik ma dług u Pasera.`;
      const mark = await ola.sniffer.mark();
      await say(mg, `/w Marek ${secret}`);
      await expect(marek.page.locator('.chat-message', { hasText: secret })).toBeVisible();
      await mg.page.waitForTimeout(1_000);
      await expect(ola.page.locator('.chat-message', { hasText: secret })).toHaveCount(0);
      expect(await ola.sniffer.found([secret], mark)).toEqual([]);
    });

    test('rzut kubkiem Oli: ten sam wynik u trojga i w bazie', async () => {
      const before = await Promise.all(
        everyone().map(async (a) => (await rollTotals(a.page)).length),
      );
      scriptDice([6, 3]);
      await rollWithCup(ola.page, '/r 2d10');
      for (const [i, actor] of everyone().entries()) {
        await expect
          .poll(async () => (await rollTotals(actor.page)).slice(before[i]), {
            message: actor.name,
            timeout: 20_000,
          })
          .toEqual(['9']);
      }
      expect(pendingDice()).toBe('');
    });

    test('notatka Marka na karcie Kowala dochodzi do bazy i do MG', async () => {
      const note = ` | Macierz ${layout.gracze}: zażółć gęślą jaźń.`;
      const before = sheet<{ notes: string }>('Kowal').notes;
      const region = await openSheet(marek, 'Kowal');
      const notes = region.getByLabel('Notatki');
      await notes.click();
      await notes.press('Control+End');
      await notes.pressSequentially(note, { delay: 20 });
      await expect.poll(() => sheet<{ notes: string }>('Kowal').notes).toBe(before + note);
      await closeSheet(marek.page);
      const gmView = await openSheet(mg, 'Kowal');
      await expect(gmView.getByLabel('Notatki')).toHaveValue(before + note);
      await closeSheet(mg.page);
    });

    test('walka: inicjatywa kubkiem, ta sama kolejka u trojga', async () => {
      test.setTimeout(3 * 60_000);
      await mg.page.getByRole('button', { name: 'Walka', exact: true }).first().click();
      await mg.page.getByRole('checkbox', { name: /^Zbir$/ }).check();
      await mg.page.getByRole('button', { name: /Rozpocznij walkę/ }).click();
      await expect.poll(() => combatants().length).toBe(3);

      async function rollInitiative(actor: Actor, face: number) {
        scriptDice([face]);
        await actor.page.getByRole('button', { name: /^Rzuć inicjatywę:/ }).click();
        const roll = rollById(await rollAndWait(actor, lastMessageId(), 'Inicjatywa'));
        await expect
          .poll(() => chipInitiatives(mg), {
            timeout: 30_000,
            message: `${actor.name} na pasie MG`,
          })
          .toContain(String(roll.total));
        return roll;
      }
      const kowal = await rollInitiative(marek, 10);
      const iskraRef = sheet<{ stats: { ref: number } }>('Iskra').stats.ref;
      const iskra = await rollInitiative(ola, Math.max(1, Math.min(9, kowal.total - 1 - iskraRef)));
      expect(iskra.total).toBeLessThan(kowal.total);
      scriptDice([1]);
      await mg.page.getByRole('button', { name: 'Rzuć wszystkim', exact: true }).click();
      await expect.poll(() => combatants().every((c) => c.initiative !== null)).toBe(true);
      expect(combatantOf('Zbir').initiative).toBeLessThan(iskra.total);
      await mg.page.getByRole('button', { name: 'Start', exact: true }).click();
      await expect.poll(activeName).toBe('Kowal');
      // Pas „Przed walką” ma już tę kolejność — start dochodzi do klienta dopiero
      // po animacji ostatniej kości inicjatywy, a wcześniejszy klik w mapę nic nie robi.
      await clientsSeeTurn(...everyone());
      for (const actor of everyone()) {
        await expect
          .poll(() => queueOf(actor), { message: actor.name, timeout: 30_000 })
          .toEqual(['Kowal', 'Iskra', 'Zbir']);
      }
    });

    test('tura Marka: marsz, strzał w Zbira, obrażenia zastosowane przez MG', async () => {
      test.setTimeout(3 * 60_000);
      const spot = cellCentre(cell, 12, 14);
      await clickOnMap(marek.page, tokenCentre(token('Kowal'), cell));
      await clickOnMap(marek.page, spot);
      await expect
        .poll(() => [Math.round(token('Kowal').x / cell), Math.round(token('Kowal').y / cell)], {
          timeout: 20_000,
        })
        .toEqual([12, 14]);

      let before = lastMessageId();
      await aim(marek, spot, tokenCentre(token('Zbir'), cell));
      const cup = await marek.store<{ attack: { modifierTotal: number } | null }>('roll');
      // 16 m to PT 20, a trafienie musi je przebić: bez Zmysłu Walki z T4a Kowal
      // potrzebuje dziesiątki z dorzutem (10 na k10 wybucha jeszcze jedną kością).
      const need = Math.max(2, 21 - (cup?.attack?.modifierTotal ?? 0));
      const faces = need <= 9 ? [need] : [10, Math.max(1, need - 10)];
      scriptDice(faces);
      const attackId = await rollAndWait(marek, before, 'Bardzo ciężki pistolet → Zbir');
      const attack = rollById(attackId);
      expect(pendingDice()).toBe('');
      expect(attack.total).toBe(faces.reduce((a, b) => a + b, 0) + sumOf(attack));
      expect(attack.attack?.hit).toBe(true);
      for (const actor of everyone()) {
        await actor.page.getByRole('button', { name: /^Czat/ }).first().click();
        await expect(
          actor.page.locator('.chat-roll', { hasText: 'Bardzo ciężki pistolet → Zbir' }).last(),
          actor.name,
          // Dziesiątka z dorzutem to dwie animacje kości po kolei — karta przychodzi później.
        ).toContainText(String(attack.total), { timeout: 30_000 });
      }

      await noDodge(mg, attackId, 'Bardzo ciężki pistolet → Zbir');
      // PW przed rzutem: obrażenia rozliczają się same, gdy kości padną (03.10).
      const hpBefore = sheet<{ hpCurrent: number }>('Zbir').hpCurrent;
      scriptDice([5, 4, 3, 2]);
      before = lastMessageId();
      await marek.page
        .locator('.chat-message', { hasText: 'Bardzo ciężki pistolet → Zbir' })
        .last()
        .getByRole('button', { name: /^Obrażenia/ })
        .click();
      await rollAndWait(marek, before, 'Bardzo ciężki pistolet — obrażenia');
      await expect.poll(() => sheet<{ hpCurrent: number }>('Zbir').hpCurrent).toBe(hpBefore - 3);
      await settledWithoutApply(mg, 'Bardzo ciężki pistolet — obrażenia');
      await endPlayerTurn(marek);
      expect(activeName()).toBe('Iskra');
    });

    test('tura Oli kończy się jej ręką, MG zamyka walkę', async () => {
      await expect(ola.page.getByRole('button', { name: 'Kończę turę' })).toBeVisible({
        timeout: 20_000,
      });
      await endPlayerTurn(ola);
      expect(activeName()).toBe('Zbir');
      await mg.page.getByRole('button', { name: 'Wyłącz tryb turowy' }).click();
      await expect.poll(() => combatRow() ?? null).toBeNull();
      for (const player of [marek, ola]) {
        await expect(player.page.getByRole('group', { name: 'Kolejka inicjatywy' })).toHaveCount(
          0,
          {
            timeout: 20_000,
          },
        );
      }
    });

    test('konsola bez nowych błędów u trojga', () => {
      for (const actor of everyone()) {
        expect.soft(actor.unexpectedErrors(), `${actor.name} (${actor.engine})`).toEqual([]);
      }
    });
  });
}
