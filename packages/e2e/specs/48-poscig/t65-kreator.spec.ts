import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { apiGm, invite } from '../../fixtures/nocna-zmiana.ts';
import { startFromPoT6 } from '../../fixtures/regresja.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { closeNotices } from '../../fixtures/table.ts';

/**
 * Kreator pościgu (zlecenie MG z 03.11) — stały E2E z zaległości 03.11. MG
 * w **Firefoksie** zakłada scenę „Pościg”, kreator prowadzi go przez Tło
 * (wbudowana „Neonowa ulica”), Drogę (pas jezdni z drogi, jazda w lewo), Auta
 * (dwa wozy z katalogu „Na drogę” — nie lądują na sobie) i Gotowe, a „Pełna
 * edycja sceny…” otwiera Edycję na zakładce „Pościg”. Ola (Chromium) po
 * aktywacji widzi drogę i oba auta.
 *
 * Geometrię wolnego miejsca sprawdza `chaseFreeSpot` w `shared`, przewijanie
 * pasa na żywo zostaje do oceny przy stole.
 */

interface Placed {
  id: string;
  x: number;
  y: number;
  widthSq: number;
  lengthSq: number;
}

const NAME = 'Pościg kreatora';

test.describe.serial('@szybkie T65 kreator pościgu', () => {
  let mg: Actor;
  let ola: Actor;
  let gm: Socket;

  const wizard = () => mg.page.getByRole('region', { name: 'Kreator pościgu' });
  const placed = async (actor: Actor) =>
    (await actor.store<{ vehicles: Placed[] }>('chase')).vehicles;

  test.beforeAll(async ({ cast }) => {
    await startFromPoT6(DEAD_GATEWAY);
    test.setTimeout(4 * 60_000);
    cast.viewport = { width: 1600, height: 1000 };
    mg = await cast.mg('firefox');
    ola = await cast.gracz('Ola', 'chromium', await invite(await apiGm(), 'Ola'));
    gm = await mg.socket();
    await closeNotices(mg.page);
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('„Utwórz → Pościg” otwiera kreator, a „Dalej” czeka na wybór drogi', async () => {
    await mg.page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await mg.page.getByPlaceholder('Nazwa nowej sceny').fill(NAME);
    await mg.page.getByLabel('Rodzaj nowej sceny').selectOption('chase');
    await mg.page.getByRole('button', { name: 'Utwórz', exact: true }).click();
    await expect(wizard()).toBeVisible();
    await expect(wizard().getByRole('heading', { name: `Kreator pościgu: ${NAME}` })).toBeVisible();
    await expect(wizard().getByRole('button', { name: 'Dalej →' })).toBeDisabled();

    await wizard().getByRole('radio', { name: 'Neonowa ulica' }).click();
    await expect(wizard().getByRole('radio', { name: 'Neonowa ulica' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await wizard().getByRole('button', { name: 'Dalej →' }).click();
  });

  test('krok „Droga”: pas jezdni z wbudowanej drogi, jazda w lewo', async () => {
    await expect(wizard().getByRole('heading', { name: 'Pas jezdni' })).toBeVisible();
    await expect(wizard().getByLabel('Pas jezdni od kratki')).toHaveValue('6');
    await expect(wizard().getByLabel('Pas jezdni do kratki')).toHaveValue('18');
    // Przejście do „Auta” zapisuje szkic — scena na serwerze ma już drogę.
    await wizard().getByRole('button', { name: 'Dalej →' }).click();
    await expect(wizard().getByRole('heading', { name: /Auta na drodze/ })).toBeVisible();
    const scene = await mg.store<{
      scene: { background: { url: string } | null; chase: { direction: string } };
    }>('scene');
    expect(scene.scene.background?.url).toBe('/art/roads/neon-street.webp');
    expect(scene.scene.chase.direction).toBe('left');
  });

  test('krok „Auta”: dwa wozy z katalogu stają „Na drogę” obok siebie, nie na sobie', async () => {
    const add = wizard().getByRole('button', { name: '＋ Dodaj pojazd' });
    const rows = wizard().locator('.chase-car-row');
    const before = await rows.count();
    await add.click();
    await expect(rows).toHaveCount(before + 1);
    await add.click();
    await expect(rows).toHaveCount(before + 2);

    for (let i = 0; i < 2; i += 1) {
      await wizard().getByRole('button', { name: 'Na drogę' }).first().click();
      await expect.poll(async () => (await placed(mg)).length).toBe(i + 1);
    }
    const [a, b] = await placed(mg);
    const grid = (await mg.store<{ scene: { grid: { sizePx: number } } }>('scene')).scene.grid
      .sizePx;
    // Bryły (jazda w poziomie: długość wzdłuż x) nie zachodzą na siebie.
    const apart =
      Math.abs(a!.x - b!.x) >= ((a!.lengthSq + b!.lengthSq) / 2) * grid - 0.5 ||
      Math.abs(a!.y - b!.y) >= ((a!.widthSq + b!.widthSq) / 2) * grid - 0.5;
    expect(apart).toBe(true);
    await expect(wizard().locator('.chase-cars-count')).toHaveText('2');
  });

  test('„Gotowe” podsumowuje scenę, a „Pełna edycja sceny…” otwiera zakładkę „Pościg”', async () => {
    await wizard().getByRole('button', { name: 'Dalej →' }).click();
    const summary = wizard().locator('.chase-wizard-summary');
    await expect(summary).toContainText('Neonowa ulica');
    await expect(summary).toContainText('wiersze 6–18');
    await expect(summary.locator('dd').last()).toHaveText('2');
    await wizard().getByRole('button', { name: 'Pełna edycja sceny…' }).click();
    await expect(wizard()).toBeHidden();
    const editor = mg.page.getByRole('region', { name: 'Edycja sceny' });
    await expect(editor.getByRole('tab', { name: 'Pościg' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await mg.page.keyboard.press('Escape');
  });

  test('Ola (Chromium) po aktywacji widzi drogę i oba auta', async () => {
    const sceneId = (await mg.store<{ scene: { id: string } }>('scene')).scene.id;
    const ack = (await emitAck(gm, 'scene:activate', { sceneId })) as { ok: boolean };
    expect(ack.ok).toBe(true);
    await expect
      .poll(
        async () =>
          (
            await ola.store<{ scene: { id: string; background: { url: string } | null } | null }>(
              'scene',
            )
          ).scene?.background?.url ?? null,
      )
      .toBe('/art/roads/neon-street.webp');
    await expect.poll(async () => (await placed(ola)).length).toBe(2);
  });
});
