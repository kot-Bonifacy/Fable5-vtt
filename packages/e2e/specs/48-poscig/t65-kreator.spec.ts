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
 * (wbudowana „Neonowa ulica”), Drogę (pas jezdni z drogi, jazda w lewo, trzy
 * namalowane pasy, prędkość startowa w mil/h i „Drużyna goni / ucieka” — od
 * 72f1 zamiast tempa), Auta (dwa wozy z katalogu „Na drogę” — nie lądują na
 * sobie, stoją na środkach pasów, a jeden dostaje zamiar „Goń” drugiego),
 * Plan (od 72f3: notatka na rundę 2) i Gotowe, a „Pełna edycja sceny…”
 * otwiera Edycję na zakładce „Pościg”. Ola
 * (Chromium) po aktywacji widzi drogę i oba auta, ale nie zamiar.
 *
 * Geometrię wolnego miejsca sprawdza `chaseFreeSpot` w `shared`, przewijanie
 * pasa na żywo zostaje do oceny przy stole.
 */

interface Placed {
  id: string;
  name: string;
  x: number;
  y: number;
  widthSq: number;
  lengthSq: number;
  intent?: { intent: string; targetId: string | null } | null;
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

  test('krok „Droga”: pas jezdni z wbudowanej drogi, jazda w lewo, pasy, prędkość i rola', async () => {
    await expect(wizard().getByRole('heading', { name: 'Pas jezdni' })).toBeVisible();
    await expect(wizard().getByLabel('Pas jezdni od kratki')).toHaveValue('6');
    await expect(wizard().getByLabel('Pas jezdni do kratki')).toHaveValue('18');
    // Neonowa ulica ma trzy namalowane pasy — liczby nie zmienia się (MG 20.11).
    const lanes = wizard().getByLabel('Liczba pasów');
    await expect(lanes).toHaveValue('3');
    await expect(lanes).toBeDisabled();
    // „Tempo” zniknęło — prędkość startowa w mil/h (tempo 40 = 200 mil/h).
    await expect(wizard().getByText('Tempo (Ruch)')).toHaveCount(0);
    const speed = wizard().getByLabel('Prędkość startowa');
    await expect(speed).toHaveValue('200');
    await speed.fill('150');
    const role = wizard().getByRole('radiogroup', { name: 'Rola drużyny' });
    await expect(role.getByRole('radio', { name: 'Drużyna goni' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await role.getByRole('radio', { name: 'Drużyna ucieka' }).click();
    // Przejście do „Auta” zapisuje szkic — scena na serwerze ma już drogę.
    await wizard().getByRole('button', { name: 'Dalej →' }).click();
    await expect(wizard().getByRole('heading', { name: /Auta na drodze/ })).toBeVisible();
    const scene = await mg.store<{
      scene: { background: { url: string } | null; chase: { direction: string } };
    }>('scene');
    expect(scene.scene.background?.url).toBe('/art/roads/neon-street.webp');
    expect(scene.scene.chase.direction).toBe('left');
    const chase = (
      await mg.store<{ scene: { chase: { tempo: number; role: string; lanes: number } } }>('scene')
    ).scene.chase;
    expect(chase).toMatchObject({ tempo: 30, role: 'flee', lanes: 3 });
  });

  test('krok „Auta”: dwa wozy z katalogu stają „Na drogę” obok siebie, nie na sobie', async () => {
    // Od 10.11 nic nie jest wybrane z góry: najpierw model, potem „＋ Dodaj …”.
    const gallery = wizard().locator('.vehicle-add');
    const add = gallery.getByRole('button', { name: /^＋ Dodaj / });
    const pickModel = async () => {
      const tiles = gallery.locator('.vehicle-add-tile');
      if ((await tiles.count()) > 0) {
        await tiles.first().click();
        return;
      }
      const others = gallery.locator('.vehicle-add-others');
      if (!(await others.evaluate((node) => (node as HTMLDetailsElement).open))) {
        await others.locator('summary').click();
      }
      await others.getByRole('button').first().click();
    };
    const rows = wizard().locator('.chase-car-row');
    const before = await rows.count();
    await expect(add).toBeDisabled();
    await pickModel();
    await add.click();
    await expect(rows).toHaveCount(before + 1);
    await pickModel();
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
    // Auta stoją na środkach pasów Neonowej ulicy (8, 12 albo 16 m od góry).
    for (const row of [a!, b!]) expect([800, 1200, 1600]).toContain(row.y);
    await expect(wizard().locator('.chase-cars-count')).toHaveText('2');

    // Zamiar autopilota przy aucie NPC-a (72f1): „Goń” drugie auto.
    const row = wizard().locator(`.chase-car-row.is-placed`).first();
    const intent = row.locator('.chase-car-intent select');
    await expect(intent).toHaveValue('manual');
    const option = intent.locator('option', { hasText: /^Goń/ }).first();
    await intent.selectOption({ label: (await option.textContent())! });
    await expect
      .poll(async () =>
        (await placed(mg)).map((vehicle) => vehicle.intent?.intent ?? 'manual').sort(),
      )
      .toEqual(['manual', 'pursue']);
  });

  test('krok „Plan” (72f3): MG dopisuje notatkę na rundę 2', async () => {
    await wizard().getByRole('button', { name: 'Dalej →' }).click();
    const editor = wizard().getByTestId('chase-plan-editor');
    await expect(editor).toContainText('Planu nie ma');
    const form = editor.getByTestId('chase-plan-form');
    await form.getByRole('spinbutton', { name: 'Runda zdarzenia' }).fill('2');
    await form.getByRole('combobox', { name: 'Rodzaj zdarzenia' }).selectOption('note');
    await form.getByRole('textbox', { name: 'Treść notatki' }).fill('Syrena za zakrętem');
    await form.getByRole('button', { name: 'Dodaj do planu' }).click();
    await expect(editor.locator('.chase-plan-row')).toContainText('Notatka: Syrena za zakrętem');
    await wizard().screenshot({ path: test.info().outputPath('kreator-plan.png') });
  });

  test('„Gotowe” podsumowuje scenę, a „Pełna edycja sceny…” otwiera zakładkę „Pościg”', async () => {
    await wizard().getByRole('button', { name: 'Dalej →' }).click();
    const summary = wizard().locator('.chase-wizard-summary');
    await expect(summary).toContainText('Neonowa ulica');
    await expect(summary).toContainText('wiersze 6–18 · 3 pasy');
    await expect(summary).toContainText('ucieka');
    await expect(summary).toContainText('150 mil/h');
    await expect(summary.locator('dd').nth(-2)).toHaveText('2');
    await expect(summary.locator('dd').last()).toHaveText('1 zdarzenie');
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
    // Zamiar to tajemnica MG — gracz go nie dostaje.
    expect((await placed(ola)).every((vehicle) => vehicle.intent === undefined)).toBe(true);
  });
});
