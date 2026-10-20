import { expect, type Locator, type Page } from '@playwright/test';
import { shakeCup } from './table.ts';

/**
 * Kreator postaci gracza przez UI (`testy.md` 5.1, kroki 3.6–3.7) — te same
 * przyciski, które klika człowiek. Rzuty idą kubkiem po jednej kości, a wynik
 * przychodzi dopiero po animacji kości 3D (~6–7 s na rzut, T3a 26.09).
 */

/** Czas na jeden rzut kubkiem: gest, rzut serwera, animacja i karta czatu. */
const CUP_ROLL_MS = 25_000;

export function creatorWindow(page: Page): Locator {
  return page.getByRole('region', { name: 'Kreator postaci' });
}

/** Otwiera kreator z zakładki „Postacie” i przechodzi okno zasad, jeśli się pokaże. */
export async function openCreator(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Postacie', exact: true }).click();
  // Etap 49a: MG wchodzi przez okno „Nowa postać” → „Postać gracza”; szkic
  // wznawia się obok. Gracz ma „Stwórz postać” z karty zgody (20.10).
  const door = page.getByRole('button', { name: /Stwórz postać|Wznów|Nowa postać/ });
  const label = (await door.first().textContent()) ?? '';
  const resume = page.getByRole('button', { name: /Wznów szkic|Wznów tworzenie postaci/ });
  if (/Nowa postać/.test(label) && !(await resume.isVisible())) {
    await door.first().click();
    const npc = page.getByRole('region', { name: 'Nowa postać' });
    await npc.getByRole('radio', { name: 'Postać gracza' }).click();
    await npc.getByRole('button', { name: /Otwórz kreator postaci/ }).click();
  } else if (await resume.isVisible()) {
    await resume.click();
  } else {
    await door.first().click();
  }
  const rules = page.getByRole('button', { name: 'Rozumiem, zaczynam' });
  const window = creatorWindow(page);
  await expect(rules.or(window)).toBeVisible();
  if (await rules.isVisible()) await rules.click();
  await expect(window).toBeVisible();
  return window;
}

export async function goToStep(page: Page, step: RegExp): Promise<void> {
  await creatorWindow(page)
    .getByRole('navigation', { name: 'Kroki kreatora' })
    .getByRole('button', { name: step })
    .click();
}

/** Ile Cech Krawędziarza ma już wynik rzutu („rzut N” w wierszu). */
async function rolledStats(window: Locator): Promise<number> {
  return window.getByText(/^rzut \d+$/).count();
}

/**
 * Cechy Krawędziarza: „Weź kubek” ładuje pierwszą Cechę, a po każdym rzucie
 * kubek sam bierze następną (`chain`). Rzucamy, aż wszystkie dziesięć ma wynik.
 */
export async function rollStatsWithCup(page: Page): Promise<void> {
  const window = creatorWindow(page);
  await window.getByRole('button', { name: '🥤 Weź kubek', exact: true }).click();
  for (let rolled = await rolledStats(window); rolled < 10;) {
    await shakeCup(page);
    await expect
      .poll(() => rolledStats(window), { timeout: CUP_ROLL_MS, message: `stat ${rolled + 1}` })
      .toBeGreaterThan(rolled);
    rolled = await rolledStats(window);
  }
}

/** Licznik „N bez odpowiedzi” z kroku Ścieżki Życia. */
export async function lifepathLeft(page: Page): Promise<number> {
  const text = await creatorWindow(page).innerText();
  return Number(/(\d+) bez odpowiedzi/.exec(text)?.[1] ?? 0);
}

/**
 * Ścieżka Życia kubkiem, tabela po tabeli, aż zostanie `stopAt` bez odpowiedzi
 * (0 = do końca). Kubek odłożony (np. po F5) bierze się od nowa.
 */
export async function rollLifepathWithCup(page: Page, stopAt = 0): Promise<void> {
  const window = creatorWindow(page);
  // Licznik czytany przed wyrenderowaniem kroku dałby 0 i pętla nie rzuciłaby ani razu.
  await expect(window.getByText(/\d+ bez odpowiedzi/)).toBeVisible();
  for (let left = await lifepathLeft(page); left > stopAt; left = await lifepathLeft(page)) {
    if ((await page.getByText(/Odłóż kubek/).count()) === 0) {
      await window.getByRole('button', { name: '🥤 Weź kubek', exact: true }).click();
    }
    await shakeCup(page);
    await expect
      .poll(() => lifepathLeft(page), { timeout: CUP_ROLL_MS, message: `lifepath ${left}` })
      .toBeLessThan(left);
  }
}

/** Wybrane odpowiedzi Ścieżki Życia (etykieta → wartość listy), do porównań przed i po F5. */
export async function lifepathAnswers(page: Page): Promise<string[]> {
  const rows = creatorWindow(page).locator('.creator-lifepath-row');
  await expect(rows.first()).toBeVisible();
  return rows.evaluateAll((rows) =>
    rows.map(
      (row) =>
        `${row.querySelector('.creator-lifepath-label')?.textContent ?? ''}=${
          row.querySelector('select')?.value ?? ''
        }`,
    ),
  );
}

/**
 * Poziomy umiejętności przyciskiem „+” (id z `data-creation-field="skills.<id>"`).
 * Każde kliknięcie czeka na odpowiedź serwera — kolejka szkicu łączy zapisy.
 */
export async function setSkillLevels(page: Page, levels: Record<string, number>): Promise<void> {
  const window = creatorWindow(page);
  for (const [id, level] of Object.entries(levels)) {
    const row = window.locator(`li[data-creation-field="skills.${id}"]`);
    const spin = row.getByRole('spinbutton');
    for (let guard = 0; guard < 10; guard += 1) {
      const now = Number(await spin.getAttribute('aria-valuenow'));
      if (now >= level) break;
      await row.getByRole('button', { name: /^Podnieś/ }).click();
      await expect(spin).not.toHaveAttribute('aria-valuenow', String(now));
    }
    await expect(spin).toHaveAttribute('aria-valuenow', String(level));
  }
}

/** Zakupy w kroku Wyposażenie (zakładka „Broń”/„Pancerz”/„Sprzęt” przed nazwą). */
export async function buy(page: Page, tab: string, names: string[]): Promise<void> {
  const window = creatorWindow(page);
  await window.getByRole('button', { name: tab, exact: true }).click();
  for (const name of names) {
    const add = window.getByRole('button', { name: `Dołóż do koszyka: ${name}`, exact: true });
    await add.click();
    await expect(
      window
        .locator('.creator-shop-item')
        .filter({
          has: page.getByRole('button', { name: `Dołóż do koszyka: ${name}`, exact: true }),
        })
        .getByText('×1'),
    ).toBeVisible();
  }
}

/**
 * Portret z puli MG i dwa kadry: żeton (przesunięcie i przybliżenie) oraz
 * osobny kadr banera (zakładka „Baner”, od 25.09).
 */
export async function pickPortrait(
  page: Page,
  name: string,
  crop: { tokenZoom: number; bannerZoom: number },
): Promise<void> {
  await creatorWindow(page).getByRole('button', { name: 'Wybierz portret' }).click();
  await page.getByRole('button', { name: `Wybierz portret „${name}”` }).click();
  const stage = page.getByRole('group', { name: /Kadr portretu na mapie/ });
  const box = await stage.boundingBox();
  if (!box) throw new Error('E2E: the portrait crop stage is not on screen');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 15, box.y + box.height / 2 + 25, { steps: 5 });
  await page.mouse.up();
  await page.getByRole('slider', { name: /Przybliżenie/ }).fill(String(crop.tokenZoom));
  await page.getByRole('tab', { name: 'Baner' }).click();
  await page.getByRole('slider', { name: /Przybliżenie/ }).fill(String(crop.bannerZoom));
  await page.getByRole('button', { name: 'Zapisz kadr' }).click();
  await expect(page.getByRole('button', { name: 'Zapisz kadr' })).toBeHidden();
}
