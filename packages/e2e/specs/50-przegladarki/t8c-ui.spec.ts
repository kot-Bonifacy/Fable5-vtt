import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { campaignId } from '../../fixtures/nocna-zmiana.ts';
import { queryOne, sceneByName, seat, startFromPoT6 } from '../../fixtures/regresja.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { rollTotals, rollWithCup } from '../../fixtures/table.ts';
import { E2E_DIR } from '../../instance/paths.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * T8c, UI i ustawienia (`testy.md` 6.4): pomoc i lista skrótów, okno ustawień
 * (skórka kości, animacja 3D, głośność), muzyka i odgłos sceny, pełny ekran
 * w Firefoksie, pływające okna (przeciąganie, pamięć położenia, krawędź ekranu).
 * Czego automat nie usłyszy ani nie zobaczy — ręczne oględziny (sekcja 12).
 */

/** Sekunda tonu 440 Hz, 8 kHz mono — wygenerowana, nie z repo ani z materiałów MG. */
function toneWav(): string {
  const rate = 8_000;
  const samples = rate;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8_000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  const dir = join(E2E_DIR, 'tmp');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'Ton testowy.wav');
  writeFileSync(file, Buffer.concat([header, data]));
  return file;
}

const SETTINGS_BUTTON = 'Ustawienia — kości, widok, dźwięki i muzyka';

/** Okno pamięta ostatnią zakładkę (11.10), więc test zawsze wybiera ją sam. */
async function openSettings(page: Page, tab: 'Ogólne' | 'Dźwięki' = 'Ogólne'): Promise<Locator> {
  const window = page.getByRole('region', { name: 'Ustawienia' });
  if (!(await window.isVisible()))
    await page.getByRole('button', { name: SETTINGS_BUTTON }).click();
  await expect(window).toBeVisible();
  await window.getByRole('tab', { name: tab }).click();
  return window;
}

async function closeSettings(page: Page): Promise<void> {
  // Okno ustawień nie zamyka się Esc (pułapka `ogledziny`) — tylko jego ✕.
  await page.getByRole('button', { name: 'Zamknij ustawienia' }).click();
  await expect(page.getByRole('region', { name: 'Ustawienia' })).toBeHidden();
}

/** Muzyka mieszka w zakładce „Dźwięki” okna ustawień (11.10). */
function openMusic(page: Page): Promise<Locator> {
  return openSettings(page, 'Dźwięki');
}

test.describe.serial('T8c UI: skróty, ustawienia, muzyka, pełny ekran, okna', () => {
  let mg: Actor;
  let marek: Actor;

  test.beforeAll(async () => {
    await startFromPoT6(DEAD_GATEWAY);
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('start z po-T6: MG i Marek przy „Knajpie”', async ({ cast }) => {
    const table = await seat(cast, ['Marek']);
    mg = table.mg;
    marek = table.players[0]!;
  });

  test('pomoc: „?” otwiera skróty, szukanie zawęża listę, gracz nie widzi skrótów MG', async () => {
    const shortcuts = (page: Page) => page.getByRole('region', { name: 'Skróty klawiszowe' });
    for (const [actor, role, pull] of [
      [marek, 'Gracz', 0],
      [mg, 'Mistrz Gry', 1],
    ] as const) {
      const page = actor.page;
      await page.locator('body').press('?');
      const window = shortcuts(page);
      await expect(window, actor.name).toBeVisible();
      await expect(window).toContainText(role);
      const search = window.locator('.shortcuts-search input');
      await search.fill('ping');
      await expect(
        window.locator('.shortcuts-row', { hasText: 'Wskaż miejsce wszystkim' }),
      ).toHaveCount(1);
      await search.fill('przenieś tam widok');
      await expect(window.locator('.shortcuts-row'), actor.name).toHaveCount(pull);
      await search.press('Escape');
      await page.keyboard.press('Escape');
      await expect(window, actor.name).toBeHidden();
    }
  });

  test('ustawienia kości: skórka jedzie z rzutem do MG, wybór przeżywa F5', async () => {
    test.setTimeout(3 * 60_000);
    const page = marek.page;
    let settings = await openSettings(page);
    await settings.locator('.settings-skin', { hasText: 'Kwas' }).click();
    await expect
      .poll(
        () =>
          queryOne<{ diceSkin: string }>(`SELECT diceSkin FROM User WHERE name = 'Marek'`)
            ?.diceSkin,
      )
      .toBe('acid');
    // Kości toczą się zawsze — przełącznik „Animacja 3D” zniknął 10.10.
    await expect(settings.locator('label', { hasText: 'Animacja 3D' })).toHaveCount(0);
    settings = await openSettings(page, 'Dźwięki');
    const volume = settings.locator('label', { hasText: 'Głośność efektów' }).locator('input');
    await volume.fill('35');
    await closeSettings(page);

    // Odmowa: skórki spoza listy serwer nie przyjmie.
    const refused = await emitAck(await marek.socket(), 'dice:skin', { skin: 'zloto' });
    expect(refused).toMatchObject({ ok: false });
    expect(
      queryOne<{ diceSkin: string }>(`SELECT diceSkin FROM User WHERE name = 'Marek'`)?.diceSkin,
    ).toBe('acid');

    const mark = await mg.sniffer.mark();
    const before = (await rollTotals(page)).length;
    scriptDice([7]);
    await rollWithCup(page, '/r 1d10');
    await expect
      .poll(async () => (await rollTotals(page)).slice(before), { timeout: 30_000 })
      .toEqual(['7']);
    expect(pendingDice()).toBe('');
    await expect.poll(() => mg.sniffer.found(['"skin":"acid"'], mark)).toEqual(['"skin":"acid"']);

    await page.reload();
    await expect
      .poll(async () => (await marek.store<{ status: string }>('auth'))?.status)
      .toBe('authenticated');
    settings = await openSettings(page);
    await expect(settings.locator('.settings-skin', { hasText: 'Kwas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    settings = await openSettings(page, 'Dźwięki');
    await expect(
      settings.locator('label', { hasText: 'Głośność efektów' }).locator('input'),
    ).toHaveValue('35');
    await closeSettings(page);
  });

  test('muzyka: MG wgrywa i puszcza podkład, Marek widzi odtwarzanie i pauzę; odgłos sceny; gracz nie steruje', async () => {
    test.setTimeout(3 * 60_000);
    const page = mg.page;
    const music = await openMusic(page);
    await music.locator('.music-upload input[type=file]').setInputFiles(toneWav());
    const track = music.locator('.music-tracks li', { hasText: 'Ton testowy' });
    await expect(track).toBeVisible({ timeout: 20_000 });
    await track.getByRole('button', { name: 'Odtwórz' }).click();
    await expect(music.getByText(/^Odtwarzanie: Ton testowy/)).toBeVisible();

    const playerMusic = await openMusic(marek.page);
    await expect(playerMusic.getByText(/Ton testowy/)).toBeVisible();
    await expect(playerMusic.getByText('Biblioteka kampanii')).toHaveCount(0);
    const state = await marek.store<{
      state: { playback: { playing: boolean; track: { name: string } } | null } | null;
      blocked: boolean;
    }>('music');
    test.info().annotations.push({
      type: 'muzyka u Marka (Firefox)',
      description: JSON.stringify({ playback: state?.state?.playback, blocked: state?.blocked }),
    });
    expect(state?.state?.playback?.track.name).toMatch(/Ton testowy/);

    await music.getByRole('button', { name: 'Pauza' }).click();
    await expect(playerMusic.getByText(/^Pauza: Ton testowy/)).toBeVisible();

    // Odgłos sceny: „Deszcz” na Knajpie — Marek pobiera plik otoczenia.
    const rain = marek.page.waitForRequest(/\/ambience\/rain\.wav/, { timeout: 15_000 });
    await music
      .locator('label', { hasText: 'Odgłos na oglądanej scenie' })
      .locator('select')
      .selectOption('rain');
    await expect
      .poll(
        () =>
          queryOne<{ ambience: string }>(
            'SELECT ambience FROM Scene WHERE id = ?',
            sceneByName('Knajpa').id,
          )?.ambience,
      )
      .toBe('rain');
    await rain;
    await expect(playerMusic.locator('select')).toHaveCount(0);

    // Odmowa: gracz nie steruje muzyką ani nie wgrywa podkładów.
    const refused = await emitAck(await marek.socket(), 'music:control', {
      campaignId: campaignId(),
      action: 'stop',
    });
    expect(refused).toEqual({ ok: false, error: 'FORBIDDEN' });
    const upload = await marek.page.request.post(`/api/music/${campaignId()}/upload`, {
      multipart: { file: { name: 'x.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFF') } },
    });
    expect(upload.status()).toBe(403);

    await music.getByRole('button', { name: 'Zatrzymaj' }).click();
    await expect(playerMusic.getByText('Muzyka zatrzymana')).toBeVisible();
    await music
      .locator('label', { hasText: 'Odgłos na oglądanej scenie' })
      .locator('select')
      .selectOption('none');
    await closeSettings(page);
    await closeSettings(marek.page);
  });

  test('pełny ekran w Firefoksie: włączenie z ustawień, Esc wychodzi, „Wróć do pełnego ekranu”', async () => {
    const page = marek.page;
    const isFull = () => page.evaluate(() => document.fullscreenElement !== null);
    const settings = await openSettings(page);
    const toggle = settings.locator('label', { hasText: 'Pełny ekran' }).locator('input');
    await expect(toggle).toBeEnabled();
    await toggle.check();
    await expect.poll(isFull).toBe(true);
    // W Firefoksie (bez Keyboard Lock) pierwsze Esc wychodzi z pełnego ekranu.
    await page.keyboard.press('Escape');
    await expect.poll(isFull).toBe(false);
    await expect(toggle).toBeChecked();
    const back = settings.getByRole('button', { name: /Wróć do pełnego ekranu/ });
    await back.click();
    await expect.poll(isFull).toBe(true);
    await toggle.uncheck();
    await expect.poll(isFull).toBe(false);
    await closeSettings(page);
  });

  test('pływające okno: belka przesuwa, położenie przeżywa F5, okna nie da się wypchnąć za ekran', async () => {
    const page = marek.page;
    let settings = await openSettings(page);
    const header = settings.locator('.settings-window-header');
    const start = (await header.boundingBox())!;
    await page.mouse.move(start.x + 40, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x - 400, start.y + 200, { steps: 10 });
    await page.mouse.up();
    const moved = (await settings.boundingBox())!;
    expect(Math.round(moved.x - start.x)).toBeLessThan(-300);
    await page.reload();
    await expect
      .poll(async () => (await marek.store<{ status: string }>('auth'))?.status)
      .toBe('authenticated');
    settings = await openSettings(page);
    const again = (await settings.boundingBox())!;
    expect(Math.abs(again.x - moved.x)).toBeLessThan(3);
    expect(Math.abs(again.y - moved.y)).toBeLessThan(3);

    // Odmowa: wypchnięte w prawy dolny róg — belka zostaje na ekranie, do złapania.
    const grab = (await settings.locator('.settings-window-header').boundingBox())!;
    await page.mouse.move(grab.x + 40, grab.y + grab.height / 2);
    await page.mouse.down();
    await page.mouse.move(5_000, 5_000, { steps: 10 });
    await page.mouse.up();
    const edge = (await settings.locator('.settings-window-header').boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(edge.x).toBeLessThan(viewport.width - 100);
    expect(edge.y + edge.height).toBeLessThan(viewport.height);
    await closeSettings(page);
    for (const actor of [mg, marek]) {
      expect(actor.unexpectedErrors(), actor.name).toEqual([]);
    }
  });
});
