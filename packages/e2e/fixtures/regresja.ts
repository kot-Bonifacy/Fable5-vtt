import { expect, type Locator, type Page } from '@playwright/test';
import type { Actor, Cast, Engine } from './actors.ts';
import { sceneListRow } from './brama.ts';
import { query, queryOne } from './db.ts';
import { campaignId } from './nocna-zmiana.ts';
import { fitCamera } from './scene.ts';
import { createInvitation } from './table.ts';
import { hasCheckpoint, restoreCheckpoint, startInstance } from '../instance/instance.ts';
import { test } from './actors.ts';

/**
 * T8c, pobieżna regresja (`testy.md` 6.4): obszary, których scenariusz „Nocna
 * zmiana” nie dotknął, po jednej szczęśliwej ścieżce i jednej odmowie na obszar.
 * Start z `po-T6` (rozegrana kampania), jeden układ: MG w Chromium, gracze
 * w Firefoksie, ekran 1920 × 1080 (decyzja MG z 03.10, sesja T8c).
 */

export const MG_ENGINE: Engine = 'chromium';
export const PLAYER_ENGINE: Engine = 'firefox';

/** Odtworzenie `po-T6` i instancja; pomija plik z powodem, gdy punktu nie ma. */
export async function startFromPoT6(extraEnv: NodeJS.ProcessEnv = {}): Promise<void> {
  test.skip(!hasCheckpoint('po-T6'), 'brak punktu po-T6 — najpierw pełny przebieg T3–T6b');
  test.setTimeout(3 * 60_000);
  await restoreCheckpoint('po-T6');
  await startInstance(extraEnv);
}

/** MG i gracze przy stole w układzie T8c; każdy czeka na scenę `scene`. */
export async function seat(
  cast: Cast,
  players: string[],
  scene = 'Knajpa',
): Promise<{ mg: Actor; players: Actor[] }> {
  cast.viewport = { width: 1920, height: 1080 };
  const mg = await cast.mg(MG_ENGINE);
  const seated: Actor[] = [];
  for (const name of players) {
    seated.push(await cast.gracz(name, PLAYER_ENGINE, await createInvitation(mg, campaignId())));
  }
  for (const actor of [mg, ...seated]) await expect.poll(() => viewedScene(actor)).toBe(scene);
  return { mg, players: seated };
}

export async function viewedScene(actor: Actor): Promise<string | undefined> {
  return (await actor.store<{ scene: { name: string } | null }>('scene'))?.scene?.name;
}

export interface SceneRow {
  id: string;
  name: string;
  active: number;
  gridSizePx: number;
  visibility: string;
}

export function sceneByName(name: string): SceneRow {
  const row = queryOne<SceneRow>(
    'SELECT id, name, active, gridSizePx, visibility FROM Scene WHERE name = ?',
    name,
  );
  if (!row) throw new Error(`E2E: no scene "${name}"`);
  return row;
}

export interface FigureRow {
  id: string;
  name: string;
  x: number;
  y: number;
  size: number;
  ownerId: string | null;
}

/** Figura postaci `character` na scenie `scene` (po nazwie karty). */
export function figureOn(scene: string, character: string): FigureRow | undefined {
  return queryOne<FigureRow>(
    `SELECT t.id, t.name, t.x, t.y, t.size, t.ownerId FROM Token t
       JOIN Scene s ON s.id = t.sceneId JOIN Character c ON c.id = t.characterId
      WHERE s.name = ? AND c.name = ?`,
    scene,
    character,
  );
}

/** Aktywacja sceny z listy MG i „Pokaż” u MG; gracze idą za aktywną. */
export async function activateScene(
  mg: Actor,
  name: string,
  players: Actor[],
  size: { width: number; height: number },
): Promise<void> {
  const page = mg.page;
  await page.getByRole('button', { name: 'Sceny', exact: true }).click();
  await sceneListRow(page, name).getByRole('button', { name: 'Aktywuj' }).click();
  await expect.poll(() => sceneByName(name).active).toBe(1);
  if ((await viewedScene(mg)) !== name) {
    await sceneListRow(page, name).getByRole('button', { name: 'Pokaż' }).click();
  }
  for (const actor of [mg, ...players]) {
    await expect.poll(() => viewedScene(actor), { message: actor.name }).toBe(name);
    await fitCamera(actor.page, size.width, size.height).catch(() => undefined);
  }
}

/** Wiersze czatu z tekstem (karta, notka, wiadomość) — po `textContent`, bez `text-transform`. */
export function chatLine(page: Page, text: string | RegExp): Locator {
  return page.locator('.chat-message, .chat-note', { hasText: text });
}

/** Odczyt wiersza bazy, który ma się pojawić — z czekaniem. */
export async function pollRow<T>(sql: string, ...params: (string | number)[]): Promise<T> {
  let row: T | undefined;
  await expect
    .poll(() => {
      row = queryOne<T>(sql, ...params);
      return row !== undefined;
    })
    .toBe(true);
  return row!;
}

export { query, queryOne };
