import { expect, type Locator, type Page } from '@playwright/test';
import { clickWorld, dragWorld, worldToClient, type WorldPoint } from './canvas.ts';
import { queryOne } from './db.ts';

/**
 * Budowanie sceny przez UI MG (`testy.md` 5.1, kroki 3.9–3.11): kamera nad
 * mapą, łańcuchy ścian narzędziem „Ściany”, światła, pinezki, figury. Wszystko
 * tymi samymi przyciskami, które klika MG; baza tylko do czekania na zapis.
 */

export type WallKind = 'wall' | 'door' | 'window' | 'barrier' | 'gate';

/** Jeden łańcuch narzędzia ścian: N punktów = N−1 odcinków. */
export interface WallChain {
  kind: WallKind;
  points: readonly (readonly [number, number])[];
}

/** Przyciski rodzaju na pasku „Ustawienia ścian” (początek `title`). */
const WALL_KIND_TITLE: Record<WallKind, string> = {
  wall: 'Ściana pełna',
  door: 'Drzwi — blokują',
  window: 'Okno — z dystansu',
  barrier: 'Bariera — mapa',
  gate: 'Brama — przezierna',
};

/** Pasek narzędzi przykrywa górę mapy — tyle pikseli ekranu zostawiamy wolne nad sceną. */
const TOOLBAR_MARGIN_PX = 115;

function mapArea(page: Page): Locator {
  return page.locator('.map-area');
}

/**
 * Kamera tak, żeby cała scena `width × height` stała na ekranie pod paskiem
 * narzędzi: kółko myszy nad środkiem sceny (kółko trzyma punkt pod kursorem),
 * aż kolejny krok przestałby się mieścić.
 */
export async function fitCamera(page: Page, width: number, height: number): Promise<void> {
  const box = await mapArea(page).boundingBox();
  if (!box) throw new Error('E2E: no map area');
  const fits = (w: number, h: number) =>
    w <= box.width - 40 && h <= box.height - 2 * TOOLBAR_MARGIN_PX;
  for (let step = 0; step < 16; step += 1) {
    const a = await worldToClient(page, { x: 0, y: 0 });
    const b = await worldToClient(page, { x: width, y: height });
    const w = b.x - a.x;
    const h = b.y - a.y;
    const centre = await worldToClient(page, { x: width / 2, y: height / 2 });
    await page.mouse.move(centre.x, centre.y);
    if (!fits(w, h)) await page.mouse.wheel(0, 240);
    else if (fits(w * 1.7, h * 1.7)) await page.mouse.wheel(0, -240);
    else break;
    await page.waitForTimeout(250);
  }
  const a = await worldToClient(page, { x: 0, y: 0 });
  const b = await worldToClient(page, { x: width, y: height });
  expect(a.y, 'scene top below the toolbar').toBeGreaterThanOrEqual(box.y + 90);
  expect(b.y, 'scene bottom on screen').toBeLessThanOrEqual(box.y + box.height);
  expect(a.x).toBeGreaterThanOrEqual(box.x);
  expect(b.x).toBeLessThanOrEqual(box.x + box.width);
}

/** Klik w punkt sceny, który musi być na mapie (nie pod panelem ani paskiem). */
export async function clickOnMap(
  page: Page,
  point: WorldPoint,
  button: 'left' | 'right' = 'left',
): Promise<void> {
  const box = await mapArea(page).boundingBox();
  const at = await worldToClient(page, point);
  if (
    !box ||
    at.x < box.x ||
    at.x > box.x + box.width ||
    at.y < box.y + 50 ||
    at.y > box.y + box.height
  ) {
    throw new Error(`E2E: scene point ${point.x},${point.y} is off screen (${at.x},${at.y})`);
  }
  await clickWorld(page, point, button);
}

/** Narzędzie z paska mapy po początku `title` („Ściany (W)”, „Światła (L)”…). */
export async function pickTool(page: Page, title: string): Promise<void> {
  const button = page.locator(`.map-tools button[title^="${title}"]`);
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

/**
 * Zdejmuje narzędzie z ręki. Esc zdejmuje najpierw zaznaczenie (np. ściany po
 * dwukliku), dopiero następny — narzędzie; przełączniki opcji na drugim rzędzie
 * paska też mają `aria-pressed`, więc liczą się tylko przyciski narzędzi.
 */
export async function dropTool(page: Page): Promise<void> {
  const pressed = page.locator('.map-tools > button[aria-pressed="true"]');
  for (let guard = 0; guard < 3 && (await pressed.count()) > 0; guard += 1) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  await expect(pressed).toHaveCount(0);
}

function wallCount(sceneId: string): number {
  return queryOne<{ n: number }>('SELECT count(*) AS n FROM Wall WHERE sceneId = ?', sceneId)!.n;
}

export interface WallOptions {
  /** Drzwi i bramy, które otwierają gracze (przełącznik „oko” na pasku). */
  playerToggle?: boolean;
  /** OB bariery i bramy. */
  armor?: number;
  hidesFigures?: boolean;
}

/**
 * Łańcuchy ścian narzędziem „Ściany” — bez przyciągania do siatki (końce
 * istniejących ścian dalej łapią w promieniu 12 px, więc styki są szczelne).
 * Po każdym łańcuchu czeka na zapis w bazie: następny klik po Enter, zanim
 * magazyn ścian przyjmie poprzedni łańcuch, bywał gubiony (T3b, oględziny MCP).
 */
export async function drawWalls(
  page: Page,
  sceneId: string,
  chains: readonly WallChain[],
  options: WallOptions = {},
): Promise<void> {
  await pickTool(page, 'Ściany (W)');
  const snap = page.locator('button[title^="Przyciąganie do siatki włączone"]');
  if (await snap.count()) await snap.click();
  for (const chain of chains) {
    await page.locator(`button[title^="${WALL_KIND_TITLE[chain.kind]}"]`).click();
    if (chain.kind === 'door' || chain.kind === 'gate') {
      const noun = chain.kind === 'door' ? 'Drzwi' : 'Brama';
      const mgOnly = page.locator(`button[title^="${noun} tylko dla MG"]`);
      const forPlayers = page.locator(
        `button[title^="Gracze mogą otwierać ${chain.kind === 'door' ? 'te drzwi' : 'tę bramę'}"]`,
      );
      const wanted = options.playerToggle ?? true;
      if (wanted && (await mgOnly.count())) await mgOnly.click();
      if (!wanted && (await forPlayers.count())) await forPlayers.click();
    }
    if (chain.kind === 'barrier' || chain.kind === 'gate') {
      await page.getByLabel('OB nowej bariery').fill(String(options.armor ?? 0));
      const hides = page
        .locator('[aria-label="Ustawienia ścian"] label', { hasText: 'Zasłania figury' })
        .locator('input');
      if ((await hides.isChecked()) !== (options.hidesFigures ?? false)) await hides.click();
    }
    const before = wallCount(sceneId);
    for (const [x, y] of chain.points) {
      await clickOnMap(page, { x, y });
      await page.waitForTimeout(120);
    }
    await page.keyboard.press('Enter');
    await expect
      .poll(() => wallCount(sceneId), {
        message: `${chain.kind} ${JSON.stringify(chain.points)}`,
      })
      .toBe(before + chain.points.length - 1);
  }
  await dropTool(page);
}

/**
 * Karta obiektu sceny z dwukliku — przy narzędziu tego obiektu w ręku
 * (ściany: „Ściany (W)”); bez narzędzia dwuklik na mapie niczego nie otwiera.
 */
export async function openObjectCard(
  page: Page,
  tool: string,
  point: WorldPoint,
): Promise<Locator> {
  await pickTool(page, tool);
  const at = await worldToClient(page, point);
  await page.mouse.move(at.x, at.y - 4);
  await page.mouse.move(at.x, at.y, { steps: 2 });
  await page.mouse.dblclick(at.x, at.y);
  const card = page.getByLabel(/^Karta obiektu: /);
  await expect(card).toBeVisible();
  return card;
}

/** Punkty narzędzia, które stawia się jednym klikiem (światła, gniazda, start). */
export async function clickTool(page: Page, title: string, points: WorldPoint[]): Promise<void> {
  await pickTool(page, title);
  for (const point of points) {
    await clickOnMap(page, point);
    await page.waitForTimeout(250);
  }
  await dropTool(page);
}

/** Pinezka „Notatka MG” z treścią. */
export async function gmNote(page: Page, point: WorldPoint, text: string): Promise<void> {
  await pickTool(page, 'Notatka MG (N)');
  await clickOnMap(page, point);
  await page.getByLabel('Treść notatki').fill(text);
  await page.getByRole('button', { name: 'Zapisz', exact: true }).click();
  await expect(page.getByLabel('Treść notatki')).toHaveCount(0);
  await dropTool(page);
}

/** Prostokąt osłony narzędziem „Osłony (O)”. */
export async function drawCover(page: Page, from: WorldPoint, to: WorldPoint): Promise<void> {
  await pickTool(page, 'Osłony (O)');
  await dragWorld(page, from, to);
  await page.waitForTimeout(400);
  await dropTool(page);
}

/** Grafika w bibliotece żetonów (nazwa = nazwa pliku) i figura z niej w punkcie sceny. */
export async function placeTokenFromFile(
  page: Page,
  file: string,
  assetName: string,
  point: WorldPoint,
): Promise<void> {
  await page.getByRole('button', { name: 'Tokeny', exact: true }).click();
  const asset = page.locator('.token-asset', { hasText: assetName });
  if ((await asset.count()) === 0) {
    await page.locator('.token-panel input[type=file]').setInputFiles(file);
    await expect(asset).toBeVisible();
  }
  await asset.click();
  await clickOnMap(page, point);
  await page.keyboard.press('Escape');
}

/** Stepper (`role=spinbutton`) do wartości — strzałki klawiatury, jak człowiek z klawiaturą. */
export async function setStepper(stepper: Locator, target: number): Promise<void> {
  await stepper.focus();
  for (let guard = 0; guard < 60; guard += 1) {
    const now = Number(await stepper.getAttribute('aria-valuenow'));
    if (now === target) return;
    await stepper.press(now < target ? 'ArrowUp' : 'ArrowDown');
    await expect(stepper).not.toHaveAttribute('aria-valuenow', String(now));
  }
  await expect(stepper).toHaveAttribute('aria-valuenow', String(target));
}

/** Menu figury (prawy klik) i okno „Edycja tokenu”. */
export async function openTokenEditor(page: Page, point: WorldPoint): Promise<Locator> {
  await clickOnMap(page, point, 'right');
  await page.getByRole('button', { name: /Edytuj…/ }).click();
  const dialog = page.locator('.dialog', { hasText: 'Edycja tokenu' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Pozycja pola, na którym stoi figura o lewym górnym rogu `x, y` i boku `size` kratek. */
export function tokenCentre(
  token: { x: number; y: number; size: number },
  gridSizePx: number,
): WorldPoint {
  return { x: token.x + (token.size * gridSizePx) / 2, y: token.y + (token.size * gridSizePx) / 2 };
}
