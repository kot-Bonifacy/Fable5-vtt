import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { sceneListRow, openSceneEditor } from '../../fixtures/brama.ts';
import { dragWorld, worldToClient, type WorldPoint } from '../../fixtures/canvas.ts';
import { KNAJPA } from '../../fixtures/maps.ts';
import { material } from '../../fixtures/materials.ts';
import {
  activateScene,
  chatLine,
  figureOn,
  query,
  queryOne,
  sceneByName,
  seat,
  startFromPoT6,
  viewedScene,
} from '../../fixtures/regresja.ts';
import {
  clickOnMap,
  clickTool,
  dragCharacterToMap,
  drawCover,
  dropTool,
  fitCamera,
  openObjectCard,
  pickTool,
  tokenCentre,
} from '../../fixtures/scene.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { Canaries } from '../../fixtures/sniffer.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { userId } from '../../fixtures/nocna-zmiana.ts';

/**
 * T8c, mapa i sceny (`testy.md` 6.4): trzecia scena „Lombard” z mapy MG
 * (podgląd, aktywacja, powrót), rysowanie z warstwą MG, ping, zaznaczanie wielu
 * figur, karty obiektów i `Ctrl+Z` edycji sceny. Lombard ma widoczność „Pełna”,
 * żeby ściany i pole widzenia nie mieszały się do obszarów, które tu sprawdzamy.
 */

const LOMBARD = { file: 'mapy/Pawn_Shop-24x18.png', width: 1448, height: 1086, columns: 24 };
const CELL = LOMBARD.width / LOMBARD.columns;
/** Środek pola (kolumna, wiersz) „Lombardu”. */
const at = (column: number, row: number): WorldPoint => ({
  x: (column + 0.5) * CELL,
  y: (row + 0.5) * CELL,
});

test.describe.serial('T8c mapa i sceny: Lombard, rysunki, ping, grupa, obiekty', () => {
  let mg: Actor;
  let marek: Actor;
  const fromMarek = new Canaries();

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

  test('Lombard: nowa scena z mapy, podgląd MG nie dociera do gracza, aktywacja przenosi stół', async () => {
    test.setTimeout(3 * 60_000);
    material(LOMBARD.file);
    const page = mg.page;
    await page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await page.getByRole('textbox', { name: 'Nazwa nowej sceny' }).fill('Lombard');
    await page.getByRole('button', { name: 'Utwórz', exact: true }).click();
    const editor = await openSceneEditor(page, 'Lombard');
    await editor
      .locator('.scene-upload-button input[type=file]')
      .setInputFiles(material(LOMBARD.file));
    await expect(editor.getByText(new RegExp(`^${LOMBARD.width}×\\d+ px$`))).toBeVisible();
    await editor.getByRole('tab', { name: 'Siatka' }).click();
    await editor.locator('#grid-columns').fill(String(LOMBARD.columns));
    await editor.getByRole('tab', { name: 'Widoczność' }).click();
    await editor.locator('input[name=scene-visibility][value=open]').click();
    await expect(editor.locator('input[name=scene-visibility][value=open]')).toBeChecked();
    await editor.getByRole('button', { name: 'Zapisz' }).click();
    await expect(editor).toBeHidden();
    await expect.poll(() => Math.round(sceneByName('Lombard').gridSizePx * 10)).toBe(603);
    const lombard = sceneByName('Lombard');
    expect(lombard.active).toBe(0);
    const mapUrl = queryOne<{ backgroundUrl: string | null }>(
      'SELECT backgroundUrl FROM Scene WHERE id = ?',
      lombard.id,
    )?.backgroundUrl;
    expect(mapUrl).toBeTruthy();
    fromMarek.track(mapUrl!);

    // Podgląd: nowa scena otwiera się MG sama („podgląd”), Marek zostaje w Knajpie
    // i nie dostaje ani id sceny, ani adresu mapy.
    const mark = 0;
    await expect(sceneListRow(page, 'Lombard')).toContainText('podgląd');
    await expect.poll(() => viewedScene(mg)).toBe('Lombard');
    await fitCamera(page, LOMBARD.width, LOMBARD.height);
    await page.waitForTimeout(1_000);
    expect(await viewedScene(marek)).toBe('Knajpa');
    expect(await marek.sniffer.found(fromMarek.secretNow, mark)).toEqual([]);

    // Odmowa: gracz nie aktywuje sceny.
    const refused = await emitAck(await marek.socket(), 'scene:activate', { sceneId: lombard.id });
    expect(refused).toMatchObject({ ok: false });
    expect(sceneByName('Lombard').active).toBe(0);

    await activateScene(mg, 'Lombard', [marek], LOMBARD);
    fromMarek.reveal(mapUrl!);
    // Figury graczy stawia MG — przeciąga wiersz z „Postaci” (pułapka `testy`, T5a).
    await page.getByRole('button', { name: 'Postacie', exact: true }).click();
    for (const [name, column] of [
      ['Kowal', 8],
      ['Iskra', 9],
    ] as const) {
      await dragCharacterToMap(page, name, at(column, 12));
      await expect.poll(() => figureOn('Lombard', name)?.ownerId ?? null).not.toBeNull();
    }
    await page.keyboard.press('Escape');
    await expect
      .poll(async () =>
        Object.values(
          (
            await marek.store<{ tokens: Record<string, { name: string; sceneId: string }> }>(
              'token',
            )
          )?.tokens ?? {},
        )
          .filter((t) => t.sceneId === lombard.id)
          .map((t) => t.name)
          .sort(),
      )
      .toEqual(['Iskra', 'Kowal']);
  });

  test('rysowanie: prostokąt dla stołu, podpis na warstwie MG, ołówek gracza i jego „Cofnij”', async () => {
    test.setTimeout(3 * 60_000);
    const page = mg.page;
    const lombardId = sceneByName('Lombard').id;
    const drawings = (author?: string) =>
      query<{ id: number; kind: string; gmOnly: number; authorId: string }>(
        `SELECT id, kind, gmOnly, authorId FROM MapDrawing WHERE sceneId = ?${
          author ? ' AND authorId = ?' : ''
        } ORDER BY id`,
        ...(author ? [lombardId, author] : [lombardId]),
      );
    const storeIds = async (actor: Actor) =>
      Object.keys(
        (await actor.store<{ drawings: Record<string, unknown> }>('drawing'))?.drawings ?? {},
      )
        .map(Number)
        .sort((a, b) => a - b);

    // MG: warstwa MG jest domyślna (szkic zza zasłony nie da się „odpokazać”) —
    // podpis z kanarkiem nie dociera do gracza ani wierszem, ani treścią.
    const secret = fromMarek.secret('podpis-MG');
    const mark = await marek.sniffer.mark();
    await pickTool(page, 'Rysowanie (R)');
    await expect(page.locator('button[title^="Rysujesz na warstwie MG"]')).toBeVisible();
    await page.locator('button[title^="Tekst"]').click();
    await clickOnMap(page, at(3, 8));
    const caption = page.getByRole('dialog', { name: 'Podpis na mapie' });
    await expect(caption).toContainText('warstwa MG');
    await caption.locator('input').fill(`Sejf pod ladą ${secret}`);
    await caption.locator('input').press('Enter');
    await expect.poll(() => drawings().length).toBe(1);
    const hidden = drawings()[0]!;
    expect(hidden).toMatchObject({ kind: 'text', gmOnly: 1 });

    // MG: prostokąt dla wszystkich — jeden klik oka na pasku.
    await page.locator('button[title^="Rysujesz na warstwie MG"]').click();
    await expect(page.locator('button[title^="Rysujesz dla wszystkich"]')).toBeVisible();
    await page.locator('button[title="Prostokąt"]').click();
    await dragWorld(page, at(2, 2), at(6, 5));
    await expect.poll(() => drawings().length).toBe(2);
    const shared = drawings()[1]!;
    expect(shared).toMatchObject({ kind: 'rect', gmOnly: 0 });
    await expect.poll(() => storeIds(marek)).toEqual([shared.id]);
    await dropTool(page);
    expect(await marek.sniffer.found(fromMarek.secretNow, mark)).toEqual([]);
    expect(await storeIds(mg)).toEqual([hidden.id, shared.id]);

    // Marek: ołówek, MG widzi kreskę; „Cofnij mój ostatni rysunek” ją zdejmuje.
    const marekId = userId('Marek');
    const player = marek.page;
    await fitCamera(player, LOMBARD.width, LOMBARD.height).catch(() => undefined);
    await pickTool(player, 'Rysowanie (R)');
    await player.locator('button[title^="Ołówek"]').click();
    await dragWorld(player, at(14, 3), at(18, 6));
    await expect.poll(() => drawings(marekId).length).toBe(1);
    const own = drawings(marekId)[0]!;
    expect(own.kind).toBe('path');
    await expect.poll(() => storeIds(mg)).toContain(own.id);

    // Odmowa: rysunku MG gracz nie skasuje.
    const refused = await emitAck(await marek.socket(), 'drawing:delete', {
      drawingId: shared.id,
    });
    expect(refused).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(drawings().map((d) => d.id)).toContain(shared.id);

    await player.locator('button[title="Cofnij mój ostatni rysunek"]').click();
    await expect.poll(() => drawings(marekId)).toEqual([]);
    await expect.poll(() => storeIds(mg)).not.toContain(own.id);
    await dropTool(player);
  });

  test('ping: gracz wskazuje miejsce MG, MG przyciąga widok gracza; ping na cudzej scenie odmówiony', async () => {
    const mark = await mg.sniffer.mark();
    const player = marek.page;
    await player.keyboard.press('Escape');
    await player.keyboard.press('Escape');
    await player.keyboard.down('Alt');
    await clickOnMap(player, at(12, 8));
    await player.keyboard.up('Alt');
    await expect.poll(() => mg.sniffer.found(['"map:ping"'], mark)).toEqual(['"map:ping"']);
    const frame = await mg.sniffer.evidence('"map:ping"', mark, 300);
    expect(frame).toContain('"userName":"Marek"');
    expect(frame).toContain('"pull":false');

    // Alt + Shift MG: widok Marka jedzie do wskazanego punktu. Kamera Marka najpierw
    // zbliżona nad lewym górnym rogiem — przy całej mapie w kadrze `clamp` i tak
    // trzyma środek, a punkt przy krawędzi nie może stanąć na środku ekranu.
    const target = at(14, 10);
    const box = (await player.locator('.map-area').boundingBox())!;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const distance = async () => {
      const p = await worldToClient(player, target);
      return Math.hypot(p.x - centre.x, p.y - centre.y);
    };
    const corner = await worldToClient(player, at(3, 3));
    await player.mouse.move(corner.x, corner.y);
    for (let step = 0; step < 4; step += 1) {
      await player.mouse.wheel(0, -240);
      await player.waitForTimeout(150);
    }
    const before = await distance();
    expect(before).toBeGreaterThan(200);
    const pullMark = await marek.sniffer.mark();
    await mg.page.keyboard.down('Alt');
    await mg.page.keyboard.down('Shift');
    await clickOnMap(mg.page, target);
    await mg.page.keyboard.up('Shift');
    await mg.page.keyboard.up('Alt');
    await expect
      .poll(() => marek.sniffer.found(['"pull":true'], pullMark))
      .toEqual(['"pull":true']);
    await expect.poll(distance, { timeout: 5_000 }).toBeLessThan(80);

    const refused = await emitAck(await marek.socket(), 'map:ping', {
      sceneId: sceneByName('Knajpa').id,
      x: 100,
      y: 100,
    });
    expect(refused).toEqual({ ok: false, error: 'SCENE_NOT_VIEWED' });
    await fitCamera(player, LOMBARD.width, LOMBARD.height).catch(() => undefined);
  });

  test('wiele figur: ramka MG bierze dwie, przeciągnięcie niesie obie; Ctrl+A gracza tylko jego', async () => {
    const page = mg.page;
    const kowal = figureOn('Lombard', 'Kowal')!;
    const iskra = figureOn('Lombard', 'Iskra')!;
    await page.keyboard.press('Escape');
    await page.keyboard.down('Shift');
    await dragWorld(page, at(7, 11), { x: 11 * CELL - 4, y: 14 * CELL - 4 });
    await page.keyboard.up('Shift');
    await expect
      .poll(async () =>
        [...((await mg.store<{ groupIds: string[] }>('selection'))?.groupIds ?? [])].sort(),
      )
      .toEqual([kowal.id, iskra.id].sort());
    await dragWorld(page, tokenCentre(kowal, CELL), {
      x: tokenCentre(kowal, CELL).x + 3 * CELL,
      y: tokenCentre(kowal, CELL).y + 2 * CELL,
    });
    for (const before of [kowal, iskra]) {
      await expect
        .poll(
          () => {
            const now = figureOn('Lombard', before.name)!;
            return [Math.round((now.x - before.x) / CELL), Math.round((now.y - before.y) / CELL)];
          },
          { message: before.name },
        )
        .toEqual([3, 2]);
    }
    await page.keyboard.press('Escape');

    // Odmowa: Ctrl+A gracza zaznacza wyłącznie figurę, którą steruje.
    await marek.page
      .locator('.map-area canvas')
      .first()
      .focus()
      .catch(() => undefined);
    await marek.page.keyboard.press('Control+a');
    await expect
      .poll(async () => (await marek.store<{ groupIds: string[] }>('selection'))?.groupIds)
      .toEqual([kowal.id]);
    await marek.page.keyboard.press('Escape');
  });

  test('obiekty sceny: karta osłony i światła, usunięcie osłony i Ctrl+Z; gracz nie cofnie cudzego', async () => {
    test.setTimeout(3 * 60_000);
    const page = mg.page;
    const lombardId = sceneByName('Lombard').id;
    const covers = () =>
      query<{ id: number; hidden: number; hpMax: number }>(
        'SELECT id, hidden, hpMax FROM Cover WHERE sceneId = ? ORDER BY id',
        lombardId,
      );

    await drawCover(page, at(14, 12), { x: 18 * CELL, y: 14 * CELL });
    await expect.poll(() => covers().length).toBe(1);
    expect(covers()[0]!.hidden).toBe(0);
    const card = await openObjectCard(page, 'Osłony (O)', { x: 16 * CELL, y: 13 * CELL });
    await card.getByRole('checkbox', { name: 'Widoczna dla graczy' }).uncheck();
    await expect.poll(() => covers()[0]?.hidden).toBe(1);
    // Ukryta osłona nie jedzie do gracza.
    await expect
      .poll(async () => (await marek.store<{ covers: unknown[] }>('cover'))?.covers.length)
      .toBe(0);
    await card.getByRole('button', { name: 'Zamknij kartę' }).click();

    // Zaznaczona osłona → Delete; gracz próbuje cofnąć — nic nie wraca; Ctrl+Z MG — wraca.
    await clickOnMap(page, { x: 16 * CELL, y: 13 * CELL });
    await page.keyboard.press('Delete');
    await expect.poll(() => covers()).toEqual([]);
    // Bufor cofania jest per osoba: Ctrl+Z Marka oddaje jego własną kreskę (zdjętą
    // „Cofnij” w teście rysowania), następne — już nic; osłony MG żadne nie rusza.
    const socket = await marek.socket();
    expect(await emitAck(socket, 'scene:undo', { sceneId: lombardId })).toMatchObject({
      ok: true,
      data: { kind: 'drawing', count: 1 },
    });
    expect(await emitAck(socket, 'scene:undo', { sceneId: lombardId })).toEqual({
      ok: false,
      error: 'NOTHING_TO_UNDO',
    });
    expect(covers()).toEqual([]);
    await page.keyboard.press('Control+z');
    await expect.poll(() => covers().map((c) => c.hidden)).toEqual([1]);
    // Zdanie serwera to notka czatu MG — widać ją w zakładce „Czat”.
    await page.getByRole('button', { name: 'Czat', exact: true }).click();
    await expect(chatLine(page, /Przywrócono osłonę/)).toBeVisible();
    await dropTool(page);

    // Światło z karty: jasny promień 8 m; gracz nie dostaje listy świateł.
    await clickTool(page, 'Światła (L)', [at(4, 15)]);
    await expect
      .poll(() => query('SELECT id FROM MapLight WHERE sceneId = ?', lombardId).length)
      .toBe(1);
    const light = await openObjectCard(page, 'Światła (L)', at(4, 15));
    await light.locator('input[type=range]').first().fill('8');
    await expect
      .poll(
        () =>
          queryOne<{ brightM: number }>('SELECT brightM FROM MapLight WHERE sceneId = ?', lombardId)
            ?.brightM,
      )
      .toBe(8);
    await light.getByRole('button', { name: 'Zamknij kartę' }).click();
    await dropTool(page);
    expect((await marek.store<{ lights: unknown[] }>('light'))?.lights).toEqual([]);
  });

  test('powrót do „Knajpy”: aktywacja przenosi Marka, Lombard zostaje na liście', async () => {
    await activateScene(mg, 'Knajpa', [marek], KNAJPA);
    expect(sceneByName('Lombard').active).toBe(0);
    expect(figureOn('Knajpa', 'Kowal')).toBeTruthy();
    for (const actor of [mg, marek]) {
      expect(actor.unexpectedErrors(), actor.name).toEqual([]);
    }
  });
});
