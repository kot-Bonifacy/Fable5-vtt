import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { worldToClient, type WorldPoint } from '../../fixtures/canvas.ts';
import { KNAJPA } from '../../fixtures/maps.ts';
import { MEASUREMENTS_DIR } from '../../fixtures/pomiary.ts';
import { campaignId, characterId } from '../../fixtures/nocna-zmiana.ts';
import { query, queryOne, startFromPoT6, viewedScene } from '../../fixtures/regresja.ts';
import { clickOnMap, fitCamera, tokenCentre } from '../../fixtures/scene.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { Canaries } from '../../fixtures/sniffer.ts';
import { emitAck, type Ack } from '../../fixtures/socket.ts';
import { createInvitation, shakeCup } from '../../fixtures/table.ts';
import {
  cellCentre,
  closeSheet,
  expectClean,
  lastMessageId,
  messageAfter,
  openSheet,
  sheet,
  token,
} from '../../fixtures/walka.ts';
import { scriptDice } from '../../instance/instance.ts';

/**
 * Etap 46b2 — pojemniki na scenie (`etap-46-wymiana-sklepy.md`, tabela
 * „E2E 46b”). Start z `po-T6` („Nocna zmiana”, „Knajpa”): Marek gra Kowalem
 * (8, 8), Ola Iskrą (8, 9), obaj przy stoliku.
 *
 * MG i Marek w Chromium, **Ola w Firefoksie**. Odstępstwa od szkicu tabeli:
 * stimpaka nie ma w `po-T6`, więc Ola wkłada latarkę; „Knajpa” ma widzenie
 * Dynamiczne, a nie ręczną mgłę, więc 46b.7 sprawdza figurę ukrytą przez MG
 * (mgłę i wzrok pokrywa ta sama `concealedFrom`, z testem jednostkowym
 * serwera). 46b.4b dokłada drugie wejście stosu: okno „Wymiana”.
 *
 * Decyzje MG z 09.10 (46b2): stos przeciąga się z karty i z okna „Wymiana”,
 * bez znaczka zamka na mapie, karta pojemnika u MG kompaktowa.
 */

type Row = { id: string; name: string; qty?: number; compendiumId?: string; notes?: string };
type Card = {
  eddies: number;
  gear: (Row & { key?: string })[];
  weapons: Row[];
  armor: Row[];
  container?: { lock: string; tried: string[]; keyId: string | null; pile: boolean };
};

function okData<T>(ack: Ack<T>): T {
  if (!ack.ok) throw new Error(`E2E: ${JSON.stringify(ack)}`);
  return ack.data as T;
}

test.describe.serial('T46b pojemniki na scenie', () => {
  let mg: Actor;
  let marek: Actor;
  let ola: Actor;
  let gmSocket: Socket;
  let marekSocket: Socket;
  let olaSocket: Socket;
  let cell: number;
  const canaries = new Canaries();
  let secretItem: string;
  let hiddenName: string;

  const card = (name: string) => sheet<Card>(name);
  const exchange = (actor: Actor) => actor.page.locator('section[aria-label="Wymiana"]');
  const gear = (name: string, item: string) =>
    card(name)
      .gear.filter((row) => row.name === item)
      .reduce((sum, row) => sum + (row.qty ?? 0), 0);
  const gm = (event: string, payload: unknown) => emitAck(gmSocket, event, payload);
  const piles = () =>
    query<{ id: string; x: number; y: number }>(
      `SELECT t.id, t.x, t.y FROM Token t JOIN Character c ON c.id = t.characterId
         WHERE c.data LIKE '%"pile":true%'`,
    );
  /** Figury w magazynie klienta — to, co serwer temu widzowi wysłał. */
  const tokenNames = async (actor: Actor) =>
    Object.values(
      (await actor.store<{ tokens: Record<string, { name: string }> }>('token')).tokens,
    ).map((t) => t.name);

  /** Zrzut do oględzin (`.e2e/pomiary/46b2`): okno pojemnika, karta MG, stos. */
  async function shot(actor: Actor, name: string) {
    const dir = join(MEASUREMENTS_DIR, '46b2');
    mkdirSync(dir, { recursive: true });
    await actor.page.screenshot({ path: join(dir, `${name}-${actor.name}-${actor.engine}.png`) });
  }

  async function doubleClickOn(actor: Actor, point: WorldPoint) {
    await actor.page.keyboard.press('Escape');
    const { x, y } = await worldToClient(actor.page, point);
    await actor.page.mouse.move(x - 4, y - 4);
    await actor.page.mouse.move(x, y, { steps: 4 });
    await actor.page.mouse.dblclick(x, y);
  }

  /**
   * Okno przesunięte za belkę do prawej krawędzi ekranu — stolik drużyny leży
   * w lewej części mapy i zostaje odsłonięty. Chwyt w środku belki: w lewym
   * rogu karty siedzi portret, który Firefox zacząłby ciągnąć jak obrazek.
   */
  async function moveAway(actor: Actor, header: Locator) {
    const page = actor.page;
    const box = (await header.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(1915, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await fitCamera(page, KNAJPA.width, KNAJPA.height).catch(() => undefined);
  }

  /** Wiersz złapany w oknie albo na karcie i puszczony nad polem mapy. */
  async function dragToMap(page: Page, handle: Locator, point: WorldPoint) {
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const target = await worldToClient(page, point);
    await page.mouse.move(target.x, target.y, { steps: 14 });
    await page.mouse.up();
  }

  async function placeContainer(kind: 'Skrzynia' | 'Bagażnik', column: number, row: number) {
    const page = mg.page;
    await page.keyboard.press('Escape');
    const tools = page.getByRole('group', { name: 'Rodzaj pojemnika' });
    if (!(await tools.isVisible())) await page.getByRole('button', { name: 'Pojemnik' }).click();
    await tools.getByRole('button', { name: kind }).click();
    await clickOnMap(page, cellCentre(cell, column, row));
    await expect.poll(() => tokenCell(kind)).toEqual([column, row]);
    const region = page.getByRole('region', { name: `Karta postaci: ${kind}` });
    await expect(region).toBeVisible();
    return region;
  }

  const tokenCell = (name: string) => {
    try {
      const t = token(name);
      return [Math.round(t.x / cell), Math.round(t.y / cell)];
    } catch {
      return null;
    }
  };

  /** Karta pojemnika z „Postaci” — grupa „Pojemniki” jest zwinięta. */
  async function openContainerSheet(name: string) {
    const page = mg.page;
    await page.getByRole('button', { name: 'Postacie', exact: true }).click();
    const group = page.locator('[data-character-group="containers"]');
    if ((await group.getAttribute('open')) === null) await group.locator('summary').click();
    await group.getByText(name, { exact: true }).first().click();
    const region = page.getByRole('region', { name: `Karta postaci: ${name}` });
    await expect(region).toBeVisible();
    return region;
  }

  async function rollLock(actor: Actor, faces: number[]) {
    scriptDice(faces);
    const before = lastMessageId();
    await actor.page.locator('.dialog').last().getByRole('button', { name: 'Weź kubek' }).click();
    await shakeCup(actor.page);
    await expect
      .poll(() => messageAfter(before, 'Wezwanie: Otwieranie zamków')?.id ?? 0, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
  }

  test.beforeAll(async () => {
    await startFromPoT6(DEAD_GATEWAY);
  });

  test.afterAll(async ({ cast }) => {
    for (const socket of [gmSocket, marekSocket, olaSocket]) socket?.disconnect();
    await cast.closeAll();
  });

  test('46b.0 stół: MG i Marek w Chromium, Ola w Firefoksie, latarki Iskry', async ({ cast }) => {
    test.setTimeout(4 * 60_000);
    cast.viewport = { width: 1920, height: 1080 };
    mg = await cast.mg('chromium');
    marek = await cast.gracz(
      'Marek',
      'chromium',
      await createInvitation(mg, campaignId(), 'Marek'),
    );
    ola = await cast.gracz('Ola', 'firefox', await createInvitation(mg, campaignId(), 'Ola'));
    for (const actor of [mg, marek, ola]) {
      await expect.poll(() => viewedScene(actor)).toBe('Knajpa');
      await fitCamera(actor.page, KNAJPA.width, KNAJPA.height).catch(() => undefined);
    }
    gmSocket = await mg.socket();
    marekSocket = await marek.socket();
    olaSocket = await ola.socket();
    cell = queryOne<{ gridSizePx: number }>(
      `SELECT gridSizePx FROM Scene WHERE name = 'Knajpa'`,
    )!.gridSizePx;
    expect(tokenCell('Kowal')).toEqual([8, 8]);
    expect(tokenCell('Iskra')).toEqual([8, 9]);
    okData(
      await gm('character:update', {
        characterId: characterId('Iskra'),
        patch: {
          data: {
            gear: [
              ...card('Iskra').gear,
              {
                id: 'e2e-latarka',
                name: 'Latarka',
                qty: 2,
                compendiumId: 'gear.latarka',
                notes: '',
              },
            ],
          },
        },
      }),
    );
    expect(gear('Iskra', 'Latarka')).toBe(2);
  });

  test('46b.1 MG stawia „Skrzynię” na zamek z dwiema rzeczami; gracze nie widzą zawartości', async () => {
    const region = await placeContainer('Skrzynia', 9, 8);
    // Kompaktowa karta: zamiast stron karty postaci — zamek i zawartość.
    await expect(region.locator('[data-container-sheet]')).toBeVisible();
    await expect(region.getByRole('button', { name: 'Ekwipunek', exact: true })).toHaveCount(0);
    await region.getByLabel('Stan zamka').selectOption('locked');
    await expect.poll(() => card('Skrzynia').container?.lock).toBe('locked');
    await expect(region.getByRole('spinbutton', { name: 'PT zamka' })).toHaveAttribute(
      'aria-valuenow',
      '13',
    );

    secretItem = canaries.secret('skrzynia');
    okData(
      await gm('character:update', {
        characterId: characterId('Skrzynia'),
        patch: {
          data: {
            gear: [
              {
                id: 'skrzynia-lina',
                name: 'Lina (60 m)',
                qty: 1,
                compendiumId: 'gear.lina-60-m',
                notes: '',
              },
              { id: 'skrzynia-sekret', name: secretItem, qty: 1, notes: '' },
            ],
          },
        },
      }),
    );
    await expect(region).toContainText(secretItem);
    await shot(mg, '1-karta-skrzyni');
    await closeSheet(mg.page);

    // Karta pojemnika idzie do zwiniętej grupy „Pojemniki” w „Postaciach”.
    await mg.page.getByRole('button', { name: 'Postacie', exact: true }).click();
    const group = mg.page.locator('[data-character-group="containers"]');
    await expect(group.locator('summary')).toHaveText('Pojemniki (1)');
    await expect(group).not.toHaveAttribute('open', '');

    await expect.poll(() => tokenNames(marek)).toContain('Skrzynia');
    await doubleClickOn(marek, cellCentre(cell, 9, 8));
    await expect(exchange(marek)).toHaveAttribute('data-exchange-mode', 'container');
    await expect(exchange(marek)).toContainText('Zamknięty na zamek');
    await expect(exchange(marek).getByRole('button', { name: 'Otwórz zamek' })).toBeVisible();
    await shot(marek, '1-skrzynia-zamknieta');
    for (const player of [marek, ola]) await expectClean(player, canaries.secretNow);
  });

  test('46b.2 Marek: „Otwórz zamek” — porażka, „Pozwól spróbować znowu”, sukces', async () => {
    await exchange(marek).getByRole('button', { name: 'Otwórz zamek' }).click();
    // TECH 4 + 0 + 3 = 7 przeciw PT 13.
    await rollLock(marek, [3]);
    await expect.poll(() => card('Skrzynia').container?.tried).toEqual([characterId('Kowal')]);
    expect(card('Skrzynia').container?.lock).toBe('locked');
    await expect(exchange(marek)).toContainText('zamek nie puścił', { timeout: 30_000 });
    await expect(exchange(marek).getByRole('button', { name: 'Otwórz zamek' })).toHaveCount(0);
    for (const player of [marek, ola]) await expectClean(player, canaries.secretNow);

    const region = await openContainerSheet('Skrzynia');
    await expect(region).toContainText('Nieudane próby: 1');
    await region.getByRole('button', { name: /Pozwól spróbować znowu/ }).click();
    await expect.poll(() => card('Skrzynia').container?.tried).toEqual([]);
    await closeSheet(mg.page);

    await expect(exchange(marek).getByRole('button', { name: 'Otwórz zamek' })).toBeVisible();
    await exchange(marek).getByRole('button', { name: 'Otwórz zamek' }).click();
    // Krytyczny sukces: 4 + 10 + 9.
    await rollLock(marek, [10, 9]);
    await expect.poll(() => card('Skrzynia').container?.lock).toBe('open');
    canaries.reveal(secretItem);
    // Figura skrzyni dochodzi do klienta za kośćmi (umowa „rzuty doganiają stół”),
    // a krytyk to dwie kości — okno odświeża się dopiero po ich animacji.
    await expect(exchange(marek)).toContainText(secretItem, { timeout: 30_000 });
    await expect(exchange(marek)).toContainText('Lina (60 m)');
    await shot(marek, '2-skrzynia-otwarta');
  });

  test('46b.3 Ola wkłada latarkę, Marek „Zabierz wszystko” — nic nie ginie', async () => {
    await doubleClickOn(ola, cellCentre(cell, 9, 8));
    await expect(exchange(ola)).toHaveAttribute('data-exchange-mode', 'container');
    const qty = exchange(ola).getByLabel('Ile sztuk: Latarka');
    await qty.fill('1');
    await exchange(ola).getByRole('button', { name: 'Włóż: Latarka' }).click();
    await expect.poll(() => gear('Skrzynia', 'Latarka')).toBe(1);
    expect(gear('Iskra', 'Latarka')).toBe(1);
    await shot(ola, '3-wklada');
    // Okno Marka odświeża się samo: zapis karty skrzyni przychodzi nową figurą.
    await expect(exchange(marek)).toContainText('Latarka');
    await exchange(marek).getByRole('button', { name: 'Zabierz wszystko' }).click();
    await expect.poll(() => gear('Kowal', 'Latarka')).toBe(1);
    expect(gear('Kowal', 'Lina (60 m)')).toBe(1);
    expect(gear('Kowal', secretItem)).toBe(1);
    expect(card('Skrzynia').gear).toEqual([]);
    // Skrzynia nie jest stosem — pusta zostaje na mapie.
    expect(tokenCell('Skrzynia')).toEqual([9, 8]);
    await expect(exchange(marek)).toContainText('Pusto.');
  });

  test('46b.4 Ola w Firefoksie przeciąga latarkę z karty na mapę: „Stos”, Marek go opróżnia', async () => {
    await exchange(ola).getByRole('button', { name: 'Zamknij okno wymiany' }).click();
    const region = await openSheet(ola, 'Iskra');
    await region.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    await moveAway(ola, region.locator('.sheet-header'));
    const row = region.locator('tr', { has: ola.page.locator('input[value="Latarka"]') });
    await dragToMap(ola.page, row.locator('[data-map-drop-handle]'), cellCentre(cell, 7, 9));
    await expect.poll(() => piles().length).toBe(1);
    expect(tokenCell('Stos')).toEqual([7, 9]);
    expect(gear('Stos', 'Latarka')).toBe(1);
    expect(gear('Iskra', 'Latarka')).toBe(0);
    expect(
      queryOne<{ imageUrl: string }>('SELECT imageUrl FROM Token WHERE id = ?', token('Stos').id)
        ?.imageUrl,
    ).toBe('/public/tokens/containers/pile.svg');
    await shot(ola, '4-stos');
    await closeSheet(ola.page);

    await expect.poll(() => tokenNames(marek)).toContain('Stos');
    await exchange(marek).getByRole('button', { name: 'Zamknij okno wymiany' }).click();
    await doubleClickOn(marek, cellCentre(cell, 7, 9));
    await expect(exchange(marek)).toHaveAttribute('data-exchange-mode', 'container');
    await exchange(marek).getByRole('button', { name: 'Zabierz wszystko' }).click();
    await expect.poll(() => gear('Kowal', 'Latarka')).toBe(2);
    // Pusty stos znika razem z kartą (Item Piles: „delete when empty”).
    await expect.poll(() => piles().length).toBe(0);
    await expect.poll(() => tokenNames(marek)).not.toContain('Stos');
  });

  test('46b.4b Marek kładzie latarkę z okna „Wymiana” — ilość z pola przy wierszu', async () => {
    const window = exchange(marek);
    await expect(window).toHaveAttribute('data-exchange-mode', 'none');
    await moveAway(marek, window.locator('.inventory-window-header'));
    await window.getByLabel('Ile sztuk: Latarka').fill('1');
    await dragToMap(
      marek.page,
      window.locator('[data-own-item="Latarka"]'),
      cellCentre(cell, 9, 7),
    );
    await expect.poll(() => piles().length).toBe(1);
    expect(gear('Stos', 'Latarka')).toBe(1);
    expect(gear('Kowal', 'Latarka')).toBe(1);
    // Za daleko: pole kilka kratek od Kowala.
    const far = await emitAck(marekSocket, 'inventory:drop', {
      fromCharacterId: characterId('Kowal'),
      x: 15 * cell,
      y: 8 * cell,
      items: [{ list: 'gear', rowId: card('Kowal').gear.find((r) => r.name === 'Latarka')!.id }],
    });
    expect(far).toEqual({ ok: false, error: 'OUT_OF_REACH' });
    await shot(marek, '4b-okno-stos');
  });

  test('46b.5 MG wydaje klucz do „Bagażnika”; Ola otwiera bez Testu, klucz nie pasuje do skrzyni', async () => {
    const region = await placeContainer('Bagażnik', 7, 10);
    await region.getByLabel('Stan zamka').selectOption('locked');
    await expect.poll(() => card('Bagażnik').container?.lock).toBe('locked');
    await region.getByLabel('Komu wydać klucz').selectOption({ label: 'Iskra' });
    await region.getByRole('button', { name: '🔑 Wydaj klucz' }).click();
    await expect.poll(() => card('Iskra').gear.some((row) => row.key)).toBe(true);
    expect(card('Iskra').gear.find((row) => row.key)?.name).toBe('Klucz: Bagażnik');
    await shot(mg, '5-klucz');
    await closeSheet(mg.page);
    // Skrzynia znowu na zamek — do sprawdzenia, że klucz Iskry jej nie otwiera.
    okData(await gm('container:config', { characterId: characterId('Skrzynia'), lock: 'locked' }));

    await doubleClickOn(ola, cellCentre(cell, 7, 10));
    await expect(exchange(ola)).toHaveAttribute('data-exchange-mode', 'container');
    await exchange(ola).getByRole('button', { name: '🔑 Otwórz kluczem' }).click();
    await expect.poll(() => card('Bagażnik').container?.lock).toBe('open');
    expect(card('Bagażnik').container?.tried).toEqual([]);
    await expect(exchange(ola)).toContainText('Pusto.');

    await exchange(ola).getByRole('button', { name: 'Zamknij okno wymiany' }).click();
    await doubleClickOn(ola, cellCentre(cell, 9, 8));
    await expect(exchange(ola)).toContainText('Zamknięty na zamek');
    await expect(exchange(ola).getByRole('button', { name: '🔑 Otwórz kluczem' })).toHaveCount(0);
    await expect(exchange(ola).getByRole('button', { name: 'Otwórz zamek' })).toBeVisible();
    await shot(ola, '5-skrzynia-bez-klucza');
    await exchange(ola).getByRole('button', { name: 'Zamknij okno wymiany' }).click();
  });

  test('46b.6 tryb turowy: skrzyni nie ma w inicjatywie, strzał w nią odmawia', async () => {
    const scene = queryOne<{ id: string }>(`SELECT id FROM Scene WHERE name = 'Knajpa'`)!;
    const ids = ['Kowal', 'Iskra', 'Skrzynia', 'Bagażnik', 'Stos'].map((name) => token(name).id);
    const started = okData(await gm('combat:start', { sceneId: scene.id, tokenIds: ids })) as {
      combatants: { tokenId: string }[];
    };
    try {
      expect(started.combatants.map((row) => row.tokenId).sort()).toEqual(
        [token('Kowal').id, token('Iskra').id].sort(),
      );
      await expect(marek.page.locator('.combat-bar')).toBeVisible();
      await expect(marek.page.locator('.combat-bar')).not.toContainText('Skrzynia');
      const pistol = card('Kowal').weapons.find((row) => row.name === 'Bardzo ciężki pistolet')!;
      const shot1 = await emitAck(marekSocket, 'attack:roll', {
        characterId: characterId('Kowal'),
        attackerTokenId: token('Kowal').id,
        targetTokenId: token('Skrzynia').id,
        request: { weaponRowId: pistol.id, mode: 'single' },
      });
      expect(shot1).toEqual({ ok: false, error: 'NOT_A_TARGET' });
      // Menu figury u gracza: pojemnik nie ma „Przyjrzyj się”, tylko „Otwórz…”.
      await marek.page.keyboard.press('Escape');
      await clickOnMap(marek.page, tokenCentre(token('Skrzynia'), cell), 'right');
      await expect(marek.page.getByRole('button', { name: /📦 Otwórz…/ })).toBeVisible();
      await expect(marek.page.getByRole('button', { name: '🔍 Przyjrzyj się…' })).toHaveCount(0);
      await marek.page.keyboard.press('Escape');
    } finally {
      await gm('combat:end', {});
    }
  });

  test('46b.7 pojemnik ukryty przez MG: gracz go nie dostaje ani nie otworzy', async () => {
    const created = okData(
      await gm('container:create', { x: 10 * cell, y: 9 * cell, preset: 'stash' }),
    ) as { tokenId: string };
    okData(await gm('token:update', { tokenId: created.tokenId, patch: { hidden: true } }));
    // Nazwa-kanarek dopiero pod ukryciem: odtąd jedzie wyłącznie do MG.
    hiddenName = canaries.secret('schowek');
    okData(await gm('token:update', { tokenId: created.tokenId, patch: { name: hiddenName } }));
    await expect.poll(() => token(hiddenName).hidden).toBe(1);
    await expect.poll(() => tokenNames(marek)).not.toContain('Schowek');
    expect(
      await emitAck(marekSocket, 'container:open', {
        tokenId: created.tokenId,
        characterId: characterId('Kowal'),
      }),
    ).toEqual({ ok: false, error: 'TOKEN_NOT_FOUND' });
    const listed = okData(
      await emitAck(marekSocket, 'exchange:counterparts', { characterId: characterId('Kowal') }),
    ) as { counterparts: { tokenId?: string }[] };
    expect(listed.counterparts.map((row) => row.tokenId)).not.toContain(created.tokenId);
    expect(await tokenNames(marek)).not.toContain(hiddenName);
    for (const player of [marek, ola]) await expectClean(player, canaries.secretNow);
  });
});
