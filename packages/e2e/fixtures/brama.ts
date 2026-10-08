import type { Locator, Page } from '@playwright/test';
import { expect, type Actor } from './actors.ts';
import { dragWorld, type WorldPoint } from './canvas.ts';
import { query, queryOne } from './db.ts';
import { material } from './materials.ts';
import { characterId } from './nocna-zmiana.ts';
import {
  dropTool,
  openObjectCard,
  openTokenEditor,
  pickTool,
  placeTokenFromFile,
  setStepper,
} from './scene.ts';

/**
 * Scena „Brama” (T5a, T5b — `testy.md` 5.3): lista scen MG, statyści z kartą,
 * boty, mgła ręczna, strefy bronione i stan Sieci z bazy. Wszystko po nazwach —
 * punkty kontrolne zapisuje każdy pełny przebieg od nowa.
 */

export type SceneRow = {
  id: string;
  name: string;
  active: number;
  visibility: string;
  gridSizePx: number;
  playerMove: string;
};
export type BramaTokenRow = {
  id: string;
  name: string;
  sceneId: string;
  x: number;
  y: number;
  size: number;
  hidden: number;
  ownerId: string | null;
  characterId: string | null;
};
export type ZoneRow = {
  id: number;
  entryId: string;
  name: string;
  armed: number;
  hidden: number;
  tokenId: string | null;
  architectureId: string | null;
  floorId: string | null;
  deviceId: string | null;
  notes: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export const sceneByName = (name: string): SceneRow => {
  const row = queryOne<SceneRow>('SELECT * FROM Scene WHERE name = ?', name);
  if (!row) throw new Error(`E2E: no scene "${name}"`);
  return row;
};
export const tokensOn = (sceneId: string): BramaTokenRow[] =>
  query<BramaTokenRow>('SELECT * FROM Token WHERE sceneId = ? ORDER BY createdAt', sceneId);
export const tokenOn = (sceneId: string, name: string): BramaTokenRow => {
  const row = tokensOn(sceneId).find((t) => t.name === name);
  if (!row) throw new Error(`E2E: no token "${name}"`);
  return row;
};
/** Figura postaci na scenie (po karcie — figury graczy stawia aktywacja, #9). */
export const figureOf = (sceneId: string, character: string): BramaTokenRow | undefined =>
  tokensOn(sceneId).find((t) => t.characterId === characterId(character));
export const zonesOn = (sceneId: string): ZoneRow[] =>
  query<ZoneRow>('SELECT * FROM DefenseZone WHERE sceneId = ? ORDER BY id', sceneId);

/** Architektura z biblioteki: wiersz i sparsowany szyb. */
export function architecture(name: string) {
  const row = queryOne<{ id: string; name: string; data: string; runtime: string }>(
    'SELECT id, name, data, runtime FROM NetArchitecture WHERE name = ?',
    name,
  );
  if (!row) throw new Error(`E2E: no architecture "${name}"`);
  return {
    ...row,
    shaft: JSON.parse(row.data) as {
      branches: {
        parentFloor: number | null;
        floors: {
          id: string;
          kind: string;
          label: string;
          dv?: number;
          programIds?: string[];
          devices?: { id: string; name: string; deviceKind: string; tokenId?: string }[];
          notes?: string;
        }[];
      }[];
    },
  };
}

/** Run postaci z bazy: stan szybu (pozycja, odkryte, złamane, rozpoznane). */
export function runOf(character: string) {
  const row = queryOne<{ id: string; data: string }>(
    'SELECT r.id, r.data FROM NetRun r JOIN Character c ON c.id = r.characterId WHERE c.name = ?',
    character,
  );
  if (!row) return null;
  return {
    id: row.id,
    state: JSON.parse(row.data) as {
      position: { branchId: string; floor: number };
      entered: string[];
      broken: string[];
      identified: string[];
    },
  };
}

/** Wiersz sceny na liście „Sceny” MG. */
export function sceneListRow(page: Page, name: string): Locator {
  return page.locator('.scene-row').filter({
    has: page.locator('.scene-row-name', { hasText: new RegExp(`^${name}$`) }),
  });
}

export async function openSceneEditor(page: Page, name: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Sceny', exact: true }).click();
  const editor = page.locator('.scene-editor');
  if (!(await editor.isVisible())) {
    await sceneListRow(page, name).getByRole('button', { name: 'Edytuj' }).click();
  }
  await expect(editor.getByRole('heading', { name: `Edycja: ${name}` })).toBeVisible();
  return editor;
}

export interface StatistProfile {
  ref: number;
  skill: number;
  dodge: number;
  armor: number;
  weapon: string;
}

/**
 * Statysta z karty: figura z grafiki, „Statystyki bojowe” w oknie edycji (jak
 * T3b 3.11). `hp` włącza pasek PW; figura dostaje własną kartę NPC.
 */
export async function placeStatist(
  page: Page,
  sceneId: string,
  file: string,
  at: WorldPoint,
  name: string,
  profile: StatistProfile,
  hp?: number,
): Promise<BramaTokenRow> {
  const asset = file.replace(/^.*\//, '').replace(/\.\w+$/, '');
  const before = new Set(tokensOn(sceneId).map((t) => t.id));
  await placeTokenFromFile(page, material(file), asset, at);
  await expect.poll(() => tokensOn(sceneId).some((t) => !before.has(t.id))).toBe(true);
  const dialog = await openTokenEditor(page, at);
  await dialog.locator('#token-name').fill(name);
  if (hp !== undefined) {
    await dialog.getByLabel('Pasek HP').check();
    const [current, max] = await dialog.locator('.scene-number-input').all();
    await max!.fill(String(hp));
    await current!.fill(String(hp));
  }
  await dialog.getByLabel('Statystyki bojowe (figura dostaje własną kartę)').check();
  await setStepper(dialog.getByRole('spinbutton', { name: 'Cecha REF' }), profile.ref);
  await setStepper(
    dialog.getByRole('spinbutton', { name: 'Poziom umiejętności broni' }),
    profile.skill,
  );
  await setStepper(dialog.getByRole('spinbutton', { name: 'Poziom Uniku' }), profile.dodge);
  await setStepper(dialog.getByRole('spinbutton', { name: 'OB pancerza statysty' }), profile.armor);
  await dialog.locator('#statist-weapon').selectOption({ label: profile.weapon });
  await dialog.getByRole('button', { name: 'Zapisz' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => tokenOn(sceneId, name).characterId).not.toBeNull();
  return tokenOn(sceneId, name);
}

export type Persona = Record<
  'Osobowość' | 'Motywacje i cele' | 'Sekrety' | 'Styl wypowiedzi',
  string
>;

/** Bot z archetypu, osobowość, powiązana karta (jak T3b 3.12). */
export async function createBot(
  page: Page,
  template: string,
  name: string,
  persona: Persona,
  card: string,
): Promise<void> {
  await page.getByRole('button', { name: 'Boty', exact: true }).click();
  const panel = page.locator('.bot-create');
  await panel.getByTitle('Archetyp startowy').selectOption({ label: template });
  await panel.getByRole('textbox').fill(name);
  await panel.getByRole('button', { name: 'Utwórz', exact: true }).click();
  const editor = page.getByLabel(`Edytor bota: ${name}`);
  await expect(editor).toBeVisible();
  for (const [label, text] of Object.entries(persona)) {
    await editor.getByLabel(new RegExp(`^${label}`)).fill(text);
  }
  await expect
    .poll(
      () => queryOne<{ data: string }>('SELECT data FROM BotProfile WHERE name = ?', name)?.data,
    )
    .toContain(persona.Sekrety);
  await editor.getByRole('button', { name: 'Wiedza i model' }).click();
  await editor
    .locator('label', { hasText: 'Powiązana karta postaci' })
    .locator('select')
    .selectOption({ label: card });
  await expect
    .poll(
      () =>
        queryOne<{ characterId: string | null }>(
          'SELECT characterId FROM BotProfile WHERE name = ?',
          name,
        )?.characterId,
    )
    .toBe(characterId(card));
  await editor.getByRole('button', { name: 'Zamknij edytor' }).click();
}

/** Mgła ręczna: prostokąt odsłonięcia narzędziem „Mgła wojny (F)”. */
export async function revealFog(page: Page, from: WorldPoint, to: WorldPoint): Promise<void> {
  await pickTool(page, 'Mgła wojny (F)');
  const options = page.getByRole('group', { name: 'Ustawienia mgły' });
  const reveal = options.locator('button[title="Odsłanianie mapy"]');
  if ((await reveal.getAttribute('aria-pressed')) !== 'true') await reveal.click();
  const rect = options.locator('button[title^="Prostokąt"]');
  if ((await rect.getAttribute('aria-pressed')) !== 'true') await rect.click();
  await dragWorld(page, from, to);
  await page.waitForTimeout(400);
  await dropTool(page);
}

/**
 * Strefa broniona narzędziem „Strefy bronione”: system z kompendium, ukrycie
 * (oko na pasku) i prostokąt przeciągnięty po mapie.
 */
export async function drawZone(
  page: Page,
  sceneId: string,
  system: string,
  hidden: boolean,
  from: WorldPoint,
  to: WorldPoint,
): Promise<ZoneRow> {
  await pickTool(page, 'Strefy bronione');
  const options = page.getByRole('group', { name: 'Ustawienia stref bronionych' });
  await options.getByLabel('System obronny').selectOption({ label: system });
  const eye = options.locator('button[aria-pressed]').first();
  if (((await eye.getAttribute('aria-pressed')) === 'true') !== hidden) await eye.click();
  const before = zonesOn(sceneId).length;
  await dragWorld(page, from, to);
  await expect.poll(() => zonesOn(sceneId).length, { message: system }).toBe(before + 1);
  await dropTool(page);
  return zonesOn(sceneId).at(-1)!;
}

/** Karta strefy (dwuklik z narzędziem stref w ręku). */
export async function openZoneCard(page: Page, point: WorldPoint): Promise<Locator> {
  return openObjectCard(page, 'Strefy bronione', point);
}

/** Id figur widocznych u aktora — to samo, co rysuje jego mapa. */
export async function visibleTokenIds(actor: Actor): Promise<string[]> {
  const state = await actor.store<{ tokens: Record<string, unknown> }>('token');
  return Object.keys(state?.tokens ?? {});
}
