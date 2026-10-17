import { query, stateFingerprint } from '../../fixtures/db.ts';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import {
  createCampaign,
  createInvitation,
  rollTotals,
  rollWithCup,
  say,
} from '../../fixtures/table.ts';
import {
  pendingDice,
  restoreCheckpoint,
  saveCheckpoint,
  scriptDice,
  startInstance,
} from '../../instance/instance.ts';

/**
 * Pierwszy test dymny suity (`testy.md` 6.1): MG w Chromium, Ola z zaproszenia
 * w Firefoksie, czat w obie strony, rzut kubkiem z tym samym wynikiem u obojga
 * i w bazie — potem punkt kontrolny zapisany, odtworzony i porównany.
 */
test.describe.serial('@szybkie dym: MG w Chromium, Ola w Firefoksie', () => {
  let mg: Actor;
  let ola: Actor;
  let campaignId: string;

  const lastRollTotal = (): string => {
    const [row] = query<{ payload: string }>(
      `SELECT payload FROM ChatMessage WHERE campaignId = ? AND kind = 'roll'
         ORDER BY id DESC LIMIT 1`,
      campaignId,
    );
    return String((JSON.parse(row!.payload) as { total: number }).total);
  };

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('MG loguje się, Ola wchodzi z zaproszenia', async ({ cast }) => {
    mg = await cast.mg('chromium');
    campaignId = await createCampaign(mg, 'Dym T1');
    ola = await cast.gracz('Ola', 'firefox', await createInvitation(mg, campaignId, 'Ola'));
    // Kampania założona przez API po zalogowaniu — ekran MG dowiaduje się o niej po F5.
    await mg.page.reload();
    await expect(mg.page.getByLabel('Wiadomość czatu')).toBeEnabled();
    await expect(ola.page.getByLabel('Wiadomość czatu')).toBeEnabled();
    expect(query("SELECT name, role FROM User WHERE role <> 'ADMIN' ORDER BY role")).toEqual([
      { name: 'MG', role: 'GM' },
      { name: 'Ola', role: 'PLAYER' },
    ]);
  });

  test('czat dochodzi w obie strony', async () => {
    await say(mg, 'Witaj w Night City, Olu.');
    await expect(
      ola.page.locator('.chat-message', { hasText: 'Witaj w Night City, Olu.' }),
    ).toBeVisible();
    await say(ola, 'Dzięki, MG — gdzie jest bar?');
    await expect(mg.page.locator('.chat-message', { hasText: 'gdzie jest bar?' })).toBeVisible();
    const lines = query<{ text: string }>(
      `SELECT text FROM ChatMessage WHERE campaignId = ? AND kind = 'say' ORDER BY id`,
      campaignId,
    ).map((row) => row.text);
    expect(lines).toEqual(['Witaj w Night City, Olu.', 'Dzięki, MG — gdzie jest bar?']);
  });

  test('rzut kubkiem ze skryptem kości: ten sam wynik u obojga i w bazie', async () => {
    scriptDice([7]);
    await rollWithCup(ola.page, '/r 1d10');
    await expect.poll(() => rollTotals(ola.page)).toEqual(['7']);
    await expect.poll(() => rollTotals(mg.page)).toEqual(['7']);
    expect(pendingDice()).toBe('');
    expect(lastRollTotal()).toBe('7');
  });

  test('rzut kubkiem bez skryptu: zgodny u obojga i z bazą', async () => {
    await rollWithCup(mg.page, '/r 2d6');
    await expect.poll(async () => (await rollTotals(mg.page)).length).toBe(2);
    await expect.poll(async () => (await rollTotals(ola.page)).length).toBe(2);
    const total = lastRollTotal();
    expect((await rollTotals(mg.page)).at(-1)).toBe(total);
    expect((await rollTotals(ola.page)).at(-1)).toBe(total);
  });

  test('WebGL i klatki animacji działają w obu silnikach (warunek płótna Pixi)', async () => {
    for (const actor of [mg, ola]) {
      const probe = await actor.page.evaluate(async () => {
        const webgl = Boolean(document.createElement('canvas').getContext('webgl2'));
        const frames = await new Promise<number>((resolve) => {
          let count = 0;
          const tick = () => {
            count += 1;
            if (count < 30) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          setTimeout(() => resolve(count), 1_000);
        });
        return { webgl, frames, visible: document.visibilityState };
      });
      expect(probe, `${actor.name} (${actor.engine})`).toEqual({
        webgl: true,
        frames: 30,
        visible: 'visible',
      });
    }
  });

  test('konsola bez nowych błędów w obu silnikach', () => {
    expect(mg.unexpectedErrors()).toEqual([]);
    expect(ola.unexpectedErrors()).toEqual([]);
  });

  test('punkt kontrolny: kopia, odtworzenie na czystym katalogu, ten sam stan', async () => {
    const before = stateFingerprint();
    saveCheckpoint('dym-T1');
    await restoreCheckpoint('dym-T1');
    await startInstance();
    expect(stateFingerprint()).toEqual(before);
    // Sesje wróciły z kopią: po F5 oboje są przy stole bez logowania.
    for (const actor of [mg, ola]) {
      await actor.page.reload();
      await expect(actor.page.getByLabel('Wiadomość czatu')).toBeEnabled();
    }
    await expect.poll(() => rollTotals(ola.page)).toHaveLength(2);
  });
});
