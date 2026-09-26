import type { Page } from '@playwright/test';

/**
 * Płótno Pixi we współrzędnych sceny (`testy.md` 4.3). Punkt sceny przelicza
 * kamera klienta (`window.__vttE2E.worldToClient`, tylko build `--mode e2e`),
 * nigdy piksele zrzutu. Uwaga z pułapek `ogledziny`: klik w puste pole przy
 * zaznaczonej figurze to rozkaz marszu, a pozycję po marszu sprawdza się w bazie.
 */
export interface WorldPoint {
  x: number;
  y: number;
}

export async function worldToClient(page: Page, point: WorldPoint): Promise<WorldPoint> {
  const client = await page.evaluate((p) => window.__vttE2E?.worldToClient(p) ?? null, point);
  if (!client) throw new Error('E2E: the map is not on screen (no __vttE2E camera)');
  return client;
}

/** Najazd kursorem po drodze (trasa liczy się na `pointermove`), potem klik. */
export async function clickWorld(
  page: Page,
  point: WorldPoint,
  button: 'left' | 'right' = 'left',
): Promise<void> {
  const { x, y } = await worldToClient(page, point);
  await page.mouse.move(x - 4, y - 4);
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.click(x, y, { button });
}

export async function dragWorld(page: Page, from: WorldPoint, to: WorldPoint): Promise<void> {
  const start = await worldToClient(page, from);
  const end = await worldToClient(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
}
