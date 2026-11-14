import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { query } from '../../fixtures/db.ts';
import { startFromPoT6, seat } from '../../fixtures/regresja.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import {
  characterRow,
  closeSheet,
  lastMessageId,
  openSheet,
  rollAndWait,
  rollById,
  sheet,
} from '../../fixtures/walka.ts';
import { scriptDice } from '../../instance/instance.ts';

const SHOTS = 'C:/Users/pawel/AppData/Local/Temp/claude/ca83eaeb1d0197b4/65dab242-3622-430f-9cfc-940c9351e08f/scratchpad/';

test.describe.serial('oględziny kubka (Firefox, tymczasowe)', () => {
  let mg: Actor;
  let marek: Actor;

  const cup = () => marek.page.locator('.dice-cup');
  const menu = () => marek.page.locator('.dice-cup-menu');
  const openMenu = async () => {
    await cup().click({ button: 'right', position: { x: 26, y: 26 } });
    await expect(menu()).toBeVisible();
    const box = (await menu().boundingBox())!;
    const hits = await marek.page.evaluate(
      (points) =>
        points.map(
          ([x, y]) => document.elementFromPoint(x!, y!)?.closest('.dice-cup-menu') !== null,
        ),
      [
        [box.x + box.width / 2, box.y + 12],
        [box.x + 40, box.y + box.height - 12],
      ],
    );
    expect(hits).toEqual([true, true]);
  };
  const circle = async () => {
    const box = await marek.page.locator('.dice-cup-icon').boundingBox();
    if (!box) throw new Error('no cup icon');
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const dragTo = async (x: number, y: number) => {
    const from = await circle();
    await marek.page.mouse.move(from.x, from.y);
    await marek.page.mouse.down();
    await marek.page.mouse.move(x, y, { steps: 8 });
    await marek.page.mouse.up();
  };
  const shot = (name: string) =>
    marek.page.screenshot({ path: `${SHOTS}${name}.png` });
  const call = async () => {
    const called = await emitAck<{ messageId: number }>(await mg.socket(), 'check:call', {
      characterId: characterRow('Kowal').id,
      request: { kind: 'skill', skillId: 'handgun' },
      dv: 13,
      visibility: 'public',
    });
    expect(called.ok).toBe(true);
    await expect(cup()).toHaveClass(/dice-cup--call/);
  };

  test.beforeAll(async ({ cast }) => {
    await startFromPoT6(DEAD_GATEWAY);
    test.setTimeout(4 * 60_000);
    const seated = await seat(cast, ['Marek']);
    mg = seated.mg;
    marek = seated.players[0]!;
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('menu, Unik, przenoszenie, Szczęście, rzut', async () => {
    test.setTimeout(3 * 60_000);
    const page = marek.page;
    await expect(cup()).toBeVisible();
    await page.addStyleTag({ content: '.dice-cup { animation: none !important; }' });

    // Prawy przycisk otwiera menu, a nie potrząsa.
    await expect(page.locator('.hud-auto-dodge')).toHaveCount(0);
    await openMenu();
    await expect(cup()).not.toHaveClass(/dice-cup--shaking/);
    await expect(page.locator('.dice-cup-menu-luck--off')).toBeVisible();
    await expect(page.locator('.dice-cup-luck')).toHaveCount(0);
    await shot('01-menu-pusty');

    // Automatyczny Unik z menu trafia na kartę.
    const dodge = menu().getByLabel('Unik i Odskok automatycznie');
    await expect(dodge).toBeChecked();
    await dodge.uncheck();
    await expect
      .poll(() => sheet<{ autoDodge?: boolean }>('Kowal').autoDodge)
      .toBe(false);
    await expect(menu()).toBeVisible();

    // Esc zamyka samo menu.
    await page.keyboard.press('Escape');
    await expect(menu()).toHaveCount(0);

    // Zablokowany kubek nie jedzie: lewy to potrząśnięcie na niby.
    const start = await circle();
    await dragTo(800, 300);
    await expect(cup()).not.toHaveClass(/dice-cup--moved/);

    // Odblokowany: wezwanie nie otwiera okna, lewy przycisk tylko przesuwa.
    await openMenu();
    await menu().getByRole('menuitem', { name: /Odblokuj/ }).click();
    await expect(cup()).toHaveClass(/dice-cup--unlocked/);
    await call();
    await dragTo(500, 300);
    await expect(page.locator('.dialog')).toHaveCount(0);
    await expect(cup()).toHaveClass(/dice-cup--moved/);
    const moved = await circle();
    expect(Math.abs(moved.x - 500)).toBeLessThan(3);
    expect(Math.abs(moved.y - 300)).toBeLessThan(3);
    await shot('02-odblokowany-z-wezwaniem');

    // Esc w trakcie przeciągania wraca na miejsce i nie rusza wezwania.
    await page.mouse.move(moved.x, moved.y);
    await page.mouse.down();
    await page.mouse.move(900, 600, { steps: 4 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    const back = await circle();
    expect(Math.abs(back.x - moved.x)).toBeLessThan(3);
    await expect(cup()).toHaveClass(/dice-cup--call/);

    // Zablokowany: chwyt znów woła okno, Szczęście dalej w menu.
    await openMenu();
    await menu().getByRole('menuitem', { name: /Zablokuj/ }).click();
    await expect(cup()).not.toHaveClass(/dice-cup--unlocked/);
    const before = sheet<{ luckCurrent: number }>('Kowal').luckCurrent;
    test.info().annotations.push({ type: 'pula', description: String(before) });
    await page.mouse.move(moved.x, moved.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.locator('.dialog').last().getByRole('button', { name: 'Weź kubek' }).click();
    await expect(cup()).toHaveClass(/dice-cup--sheet/);

    // Prawa połowa ekranu: etykieta w lewo, ikona zostaje.
    await openMenu();
    await menu().getByRole('menuitem', { name: /Odblokuj/ }).click();
    await dragTo(1300, 400);
    await expect(cup()).toHaveClass(/dice-cup--label-left/);
    const right = await circle();
    expect(Math.abs(right.x - 1300)).toBeLessThan(3);

    await openMenu();
    const spin = menu().getByRole('slider', { name: 'Szczęście do tego rzutu' });
    await spin.focus();
    await spin.press('ArrowUp');
    await spin.press('ArrowUp');
    await expect(page.locator('.dice-cup-luck-badge')).toHaveText('+2');
    await shot('03-menu-szczescie-etykieta-w-lewo');
    await page.keyboard.press('Escape');
    await expect(menu()).toHaveCount(0);
    await expect(cup()).toHaveClass(/dice-cup--sheet/); // Esc nie odłożył rzutu.
    await openMenu();
    await menu().getByRole('menuitem', { name: /Zablokuj/ }).click();

    // Karta postaci pod kubkiem: kubek jest nad oknem.
    const region = await openSheet(marek, 'Kowal');
    const sheetBox = await region.boundingBox();
    test.info().annotations.push({ type: 'karta', description: JSON.stringify(sheetBox) });
    await shot('04-kubek-i-karta');
    const onTop = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return element?.closest('.dice-cup') !== null;
    }, await circle());
    expect(onTop).toBe(true);
    await closeSheet(page);

    // Rzut: punkty lecą i schodzą z puli.
    scriptDice([5]);
    const mark = lastMessageId();
    const id = await rollAndWait(marek, mark, 'Wezwanie: Broń krótka');
    const roll = rollById(id);
    test.info().annotations.push({ type: 'rzut', description: JSON.stringify(roll) });
    expect(JSON.stringify(roll.breakdown)).toContain('Szczęści');
    await expect
      .poll(() => sheet<{ luckCurrent: number }>('Kowal').luckCurrent)
      .toBe(before - 2);
    await expect(page.locator('.dice-cup-luck-badge')).toHaveCount(0);

    // Odświeżenie: pozycja zostaje, blokada wraca.
    await page.reload();
    await expect(cup()).toBeVisible();
    await page.addStyleTag({ content: '.dice-cup { animation: none !important; }' });
    await expect(cup()).toHaveClass(/dice-cup--moved/);
    await expect(cup()).not.toHaveClass(/dice-cup--unlocked/);
    const reloaded = await circle();
    expect(Math.abs(reloaded.x - 1300)).toBeLessThan(3);

    // Mniejsze okno sprowadza kubek na ekran.
    await page.setViewportSize({ width: 900, height: 600 });
    await expect
      .poll(async () => (await circle()).x)
      .toBeLessThan(900);
    await shot('05-male-okno');
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Powrót do rogu oddaje rezerwę panelu.
    await openMenu();
    await menu().getByRole('menuitem', { name: /Wróć do rogu/ }).click();
    await expect(cup()).not.toHaveClass(/dice-cup--moved/);
    const home = await circle();
    expect(home.x).toBeLessThan(start.x + 3);
    await shot('06-w-rogu');
    expect(query<{ n: number }>('SELECT 1 AS n').length).toBe(1);
  });
});
