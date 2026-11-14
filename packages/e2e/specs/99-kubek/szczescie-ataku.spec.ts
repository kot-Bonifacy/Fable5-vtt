import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { queryOne } from '../../fixtures/db.ts';
import { startFromPoT6, seat } from '../../fixtures/regresja.ts';
import { tokenCentre } from '../../fixtures/scene.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import {
  aim,
  lastMessageId,
  rollAndWait,
  rollById,
  sheet,
  token,
  type RollJson,
} from '../../fixtures/walka.ts';
import { clickOnMap } from '../../fixtures/scene.ts';
import { scriptDice } from '../../instance/instance.ts';

const SHOTS =
  'C:/Users/pawel/AppData/Local/Temp/claude/ca83eaeb1d0197b4/65dab242-3622-430f-9cfc-940c9351e08f/scratchpad/';
const TITLE = '→ Manekin';

test.describe.serial('Szczęście z menu kubka przed atakiem (Firefox, tymczasowe)', () => {
  let mg: Actor;
  let marek: Actor;
  let cell = 0;

  test.beforeAll(async ({ cast }) => {
    await startFromPoT6(DEAD_GATEWAY);
    test.setTimeout(4 * 60_000);
    const seated = await seat(cast, ['Marek']);
    mg = seated.mg;
    marek = seated.players[0]!;
    const scene = queryOne<{ id: string; gridSizePx: number }>(
      `SELECT id, gridSizePx FROM Scene WHERE name = 'Knajpa'`,
    )!;
    cell = scene.gridSizePx;
    const kowal = token('Kowal');
    const placed = await emitAck(await mg.socket(), 'token:create', {
      sceneId: scene.id,
      name: 'Manekin',
      x: kowal.x + 2 * cell,
      y: kowal.y,
    });
    expect(placed.ok, JSON.stringify(placed)).toBe(true);
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  const loadShot = async () => {
    const page = marek.page;
    await aim(marek, tokenCentre(token('Kowal'), cell), tokenCentre(token('Manekin'), cell));
    await expect(page.locator('.dice-cup')).toHaveClass(/dice-cup--attack/);
    // Okno Celowania przy kursorze — „bez celowania”, zwykły strzał w korpus.
    await page.mouse.click(5, 300);
    const cup = await marek.store<{ attack: { modifierTotal: number } | null }>('roll');
    return cup!.attack!.modifierTotal;
  };

  const setLuck = async (points: number) => {
    const page = marek.page;
    await page.locator('.dice-cup').click({ button: 'right', position: { x: 26, y: 26 } });
    const menu = page.locator('.dice-cup-menu');
    await expect(menu).toBeVisible();
    const spin = menu.getByRole('slider', { name: 'Szczęście do tego rzutu' });
    await spin.focus();
    for (let i = 0; i < points; i += 1) await spin.press('ArrowUp');
    await expect(spin).toHaveAttribute('aria-valuenow', String(points));
    await page.screenshot({ path: `${SHOTS}atak-menu-szczescie.png` });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    if (points > 0) await expect(page.locator('.dice-cup-luck-badge')).toHaveText(`+${points}`);
  };

  const shoot = async (face: number): Promise<RollJson> => {
    scriptDice([face]);
    const before = lastMessageId();
    const id = await rollAndWait(marek, before, TITLE);
    const roll = rollById(id);
    test.info().annotations.push({ type: `strzał (kość ${face})`, description: JSON.stringify(roll) });
    return roll;
  };

  test('ta sama kość: bez Szczęścia pudło na remisie, z +2 trafienie', async () => {
    test.setTimeout(3 * 60_000);
    const page = marek.page;
    await clickOnMap(page, tokenCentre(token('Kowal'), cell));
    const slot = page.getByRole('complementary', { name: 'Panel aktywnej postaci' }).locator('.hud-slot').first();
    await page.waitForTimeout(500);
    if (!(await page.locator('.hud-armed').isVisible())) await slot.click();
    await page.screenshot({ path: `${SHOTS}atak-po-slocie.png` });
    await expect(page.locator('.hud-armed')).toBeVisible();

    // Rozpoznanie: modyfikator z kubka, PT z karty serwera.
    const mod = await loadShot();
    const probe = await shoot(5);
    const dv = probe.attack!.system!.dv!;
    expect(probe.total).toBe(5 + mod);
    // Kość, przy której suma bez Szczęścia równa się PT — remis wygrywa obrońca.
    const face = dv - mod;
    test.info().annotations.push({ type: 'PT / mod / kość', description: `${dv} / ${mod} / ${face}` });
    expect(face, 'kość z przedziału 2–9 (bez krytyka i pecha)').toBeGreaterThanOrEqual(2);
    expect(face).toBeLessThanOrEqual(9);

    const poolBefore = sheet<{ luckCurrent: number }>('Kowal').luckCurrent;

    // 1. Bez Szczęścia: suma = PT, pudło, pula nietknięta.
    await loadShot();
    const miss = await shoot(face);
    expect(miss.total).toBe(dv);
    expect(miss.attack?.hit).toBe(false);
    expect(sheet<{ luckCurrent: number }>('Kowal').luckCurrent).toBe(poolBefore);

    // 2. Ta sama kość, +2 Szczęścia z menu kubka: suma PT + 2, trafienie.
    await loadShot();
    await setLuck(2);
    const hit = await shoot(face);
    expect(hit.total).toBe(dv + 2);
    expect(hit.attack?.hit).toBe(true);
    expect(hit.breakdown).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 2, label: expect.stringMatching(/Szczęści/) })]),
    );
    await expect
      .poll(() => sheet<{ luckCurrent: number }>('Kowal').luckCurrent)
      .toBe(poolBefore - 2);
    await expect(page.locator('.dice-cup-luck-badge')).toHaveCount(0);

    // Karta na czacie gracza pokazuje trafienie z Szczęściem.
    await page.getByRole('button', { name: /^Czat/ }).first().click();
    await page.screenshot({ path: `${SHOTS}atak-karta-czatu.png` });
  });
});
