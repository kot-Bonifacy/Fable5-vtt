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

/**
 * Punkt sceny na ekranie, gdy kamera już stoi. Start tury gracza i NPC-a u MG
 * przewozi kamerę na figurę (`frameToken`, ~0,5 s): klik policzony w trakcie
 * przejazdu trafia obok — a od etapu 54 klik w podłoże przy zaznaczonej figurze
 * od razu ją rusza, więc chybiony klik w żeton to marsz w przypadkowe miejsce.
 */
export async function stillWorldToClient(page: Page, point: WorldPoint): Promise<WorldPoint> {
  let last = await worldToClient(page, point);
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await page.waitForTimeout(120);
    const now = await worldToClient(page, point);
    if (Math.abs(now.x - last.x) < 0.5 && Math.abs(now.y - last.y) < 0.5) return now;
    last = now;
  }
  return last;
}

/** Najazd kursorem po drodze (trasa liczy się na `pointermove`), potem klik. */
export async function clickWorld(
  page: Page,
  point: WorldPoint,
  button: 'left' | 'right' = 'left',
): Promise<void> {
  const { x, y } = await stillWorldToClient(page, point);
  await page.mouse.move(x - 4, y - 4);
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.click(x, y, { button });
}

/**
 * Jak marsz klikiem ma pójść (etap 54): `auto` — drugi klik tylko wtedy, gdy
 * mapa wskazała cel do potwierdzenia; `one` / `confirm` — test pilnuje, że
 * potwierdzenia nie było (zielony pas, poza walką) albo że było (bursztyn,
 * szary, mgła w turze figury).
 */
export type WalkClicks = 'auto' | 'one' | 'confirm';

/** Czy klik w podłoże czeka na drugi w to samo pole (hak E2E). */
export async function walkTargetPending(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__vttE2E?.walkTargetPending() ?? false);
}

/**
 * Marsz klikiem (etap 54, wzór BG3): jeden klik w podłoże rusza figurę; w turze
 * figury cel poza zielonym pasem czeka na drugi klik w to samo pole. Przerwa
 * między nimi jak u człowieka — dwa kliknięcia, nie jeden gest. Drugi klik
 * w trakcie marszu by go **zatrzymał**, więc pada tylko przy wskazanym celu.
 */
export async function walkWorld(
  page: Page,
  point: WorldPoint,
  clicks: WalkClicks = 'auto',
): Promise<void> {
  await clickWorld(page, point);
  await page.waitForTimeout(150);
  const pending = await walkTargetPending(page);
  if (clicks === 'one' && pending) {
    throw new Error(`E2E: walk to ${point.x},${point.y} asked for a second click`);
  }
  if (clicks === 'confirm' && !pending) {
    throw new Error(`E2E: walk to ${point.x},${point.y} did not wait for a second click`);
  }
  if (!pending) return;
  await page.waitForTimeout(150);
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
