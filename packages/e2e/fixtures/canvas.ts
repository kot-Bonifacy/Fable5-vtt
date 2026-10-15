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

/**
 * Marsz klikiem (etap 52): pierwszy klik w podłoże wskazuje cel, drugi w to samo
 * pole rusza figurę. Przerwa między nimi jak u człowieka — dwa kliknięcia, nie
 * jeden gest.
 */
export async function walkWorld(page: Page, point: WorldPoint): Promise<void> {
  await clickWorld(page, point);
  await page.waitForTimeout(250);
  await clickWorld(page, point);
}

export async function dragWorld(page: Page, from: WorldPoint, to: WorldPoint): Promise<void> {
  const start = await worldToClient(page, from);
  const end = await worldToClient(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
}

/**
 * Ile pikseli zrzutu jest jaśniejszych niż `threshold` (suma R + G + B) w pasie
 * ±`band` px wzdłuż odcinka sceny `from` → `to` (#53: szew zasłony). Zrzut
 * dekoduje sama przeglądarka (`<img>` → `<canvas>`), więc suita nie potrzebuje
 * biblioteki do PNG.
 */
export async function brightPixelsAlong(
  page: Page,
  from: WorldPoint,
  to: WorldPoint,
  { band = 2, threshold = 60 }: { band?: number; threshold?: number } = {},
): Promise<number> {
  const a = await worldToClient(page, from);
  const b = await worldToClient(page, to);
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ({ png, a, b, band, threshold }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      // Zrzut jest w pikselach urządzenia, kamera — w pikselach CSS.
      const scale = width / window.innerWidth;
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * scale);
      let bright = 0;
      for (let i = 0; i <= steps; i += 1) {
        const x = Math.round((a.x + ((b.x - a.x) * i) / steps) * scale);
        const yc = (a.y + ((b.y - a.y) * i) / steps) * scale;
        for (let dy = -band; dy <= band; dy += 1) {
          const y = Math.round(yc + dy);
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const o = (y * width + x) * 4;
          if (data[o]! + data[o + 1]! + data[o + 2]! > threshold) bright += 1;
        }
      }
      return bright;
    },
    { png, a, b, band, threshold },
  );
}
