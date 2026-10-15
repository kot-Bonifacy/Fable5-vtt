import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { sceneListRow } from '../../fixtures/brama.ts';
import { characterId } from '../../fixtures/nocna-zmiana.ts';
import {
  activateScene,
  queryOne,
  sceneByName,
  seat,
  startFromPoT6,
} from '../../fixtures/regresja.ts';
import { dragWorld } from '../../fixtures/canvas.ts';
import { clickOnMap, setPlayerMove } from '../../fixtures/scene.ts';
import { centreOn } from '../../fixtures/wydajnosc.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { emitAck, type Ack } from '../../fixtures/socket.ts';

/**
 * Etap 45 „Ruch i widzenie drużyny” (zlecenie MG z 08.10): nowa scena startuje
 * w Stop i Dynamicznej, MG jednym kliknięciem w górnym pasku zatrzymuje
 * i puszcza drużynę, gracz widzi baner, Eksploracja hamuje pulą metrów, która
 * odnawia się w ~10 s, Stop zatrzymuje też walkę, drużyna widzi się za ścianą
 * i w czerni ręcznej mgły, a znaczek diagnozy MG mówi, czemu drużyna nie
 * chodzi. Do tego przekazanie karty: figura idzie za nowym właścicielem.
 * Od etapu 52 przełącznik ma dwa tryby (bez „Swobodnego”), a gracz nie
 * przeciąga figury — wskazuje cel klikiem i potwierdza drugim.
 *
 * MG w Chromium, Marek i Ola w **Firefoksie**. Start z `po-T6` („Nocna
 * zmiana”: Marek prowadzi Kowala, Ola — Iskrę). Ruch przez gniazdo graczy —
 * odpowiedź serwera jest tu prawdą; UI sprawdza przełącznik, baner i diagnozę.
 */

const SCENE = 'Ulica 45';
/** Domyślna nowa scena: 4000 × 3000 px, pole 100 px = 2 m. */
const SIZE = { width: 4000, height: 3000 };
const PX_PER_M = 50;

function okData<T>(ack: Ack<T>): T {
  if (!ack.ok || ack.data === undefined) throw new Error(`E2E: ${JSON.stringify(ack)}`);
  return ack.data;
}

interface StoreToken {
  id: string;
  ownerId: string | null;
  partyVision?: boolean;
  paceCapM?: number | null;
}

test.describe.serial('T45 ruch i widzenie drużyny', () => {
  let mg: Actor;
  let marek: Actor;
  let ola: Actor;
  let gmSocket: Socket;
  let marekSocket: Socket;
  let sceneId: string;
  let kowalId: string;
  let iskraId: string;

  const tokensOf = async (actor: Actor): Promise<Record<string, StoreToken>> =>
    (await actor.store<{ tokens: Record<string, StoreToken> }>('token')).tokens;

  const tokenRow = (id: string) =>
    queryOne<{ x: number; y: number; ownerId: string | null }>(
      'SELECT x, y, ownerId FROM Token WHERE id = ?',
      id,
    )!;

  const playerMoveOf = (id: string) =>
    queryOne<{ playerMove: string }>('SELECT playerMove FROM Scene WHERE id = ?', id)?.playerMove;

  const userIdOf = (name: string) =>
    queryOne<{ id: string }>('SELECT id FROM User WHERE name = ?', name)!.id;

  const move = (socket: Socket, tokenId: string, x: number, y: number) =>
    emitAck(socket, 'token:move', { tokenId, x, y, final: true });

  test.beforeAll(async () => {
    await startFromPoT6(DEAD_GATEWAY);
  });

  test.afterAll(async ({ cast }) => {
    gmSocket?.disconnect();
    marekSocket?.disconnect();
    await cast.closeAll();
  });

  test('nowa scena startuje w Stop i Dynamicznej, MG widzi przełącznik i diagnozę', async ({
    cast,
  }) => {
    test.setTimeout(3 * 60_000);
    const table = await seat(cast, ['Marek', 'Ola']);
    mg = table.mg;
    [marek, ola] = table.players as [Actor, Actor];

    const page = mg.page;
    await page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await page.getByRole('textbox', { name: 'Nazwa nowej sceny' }).fill(SCENE);
    await page.getByRole('button', { name: 'Utwórz', exact: true }).click();
    await expect(sceneListRow(page, SCENE)).toBeVisible();
    const editor = page.locator('.scene-editor');
    if (await editor.isVisible()) {
      await editor
        .getByRole('button', { name: /Zamknij|Anuluj zmiany/ })
        .last()
        .click();
    }
    expect(queryOne('SELECT playerMove, visibility FROM Scene WHERE name = ?', SCENE)).toEqual({
      playerMove: 'stop',
      visibility: 'dynamic',
    });
    await activateScene(mg, SCENE, [marek, ola], SIZE);
    sceneId = sceneByName(SCENE).id;

    const switcher = page.getByRole('radiogroup', { name: 'Ruch graczy' });
    await expect(switcher.getByRole('radio', { name: 'Stop' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // Karty graczy nie mają tu figur — diagnoza to mówi.
    await page.locator('.player-move-issues').click();
    const popover = page.locator('.player-move-popover');
    await expect(popover).toContainText('„Kowal” nie ma figury na tej scenie.');
    await expect(popover).toContainText('„Iskra” nie ma figury na tej scenie.');
    await page.keyboard.press('Escape');

    // Gracz widzi, czemu nie pójdzie.
    for (const player of [marek, ola]) {
      await expect(player.page.locator('.map-placement-hint--stop')).toHaveText(
        'Ruch wstrzymany przez MG.',
      );
    }
  });

  test('figury kart graczy biorą właściciela karty; Stop odmawia graczowi, MG nie', async () => {
    gmSocket = await mg.socket();
    marekSocket = await marek.socket();
    const place = async (card: string, y: number) => {
      return okData(
        await emitAck<{ id: string; ownerId: string | null }>(gmSocket, 'token:create', {
          sceneId,
          name: card,
          x: 400,
          y,
          characterId: characterId(card),
        }),
      );
    };
    const kowal = await place('Kowal', 400);
    const iskra = await place('Iskra', 800);
    kowalId = kowal.id;
    iskraId = iskra.id;
    expect(kowal.ownerId).toBe(userIdOf('Marek'));
    expect(iskra.ownerId).toBe(userIdOf('Ola'));
    await expect(mg.page.locator('.player-move-issues')).toHaveCount(0);

    expect(await move(marekSocket, kowalId, 600, 400)).toEqual({ ok: false, error: 'MOVE_LOCKED' });
    expect((await move(gmSocket, kowalId, 500, 400)).ok).toBe(true);
    expect((await move(gmSocket, kowalId, 400, 400)).ok).toBe(true);
  });

  test('etap 52: dwa tryby; przeciągnięcie gracza nic nie robi, cel wskazany i potwierdzony idzie', async () => {
    const radios = mg.page.getByRole('radiogroup', { name: 'Ruch graczy' }).getByRole('radio');
    await expect(radios).toHaveText(['Stop', 'Eksploracja']);
    await setPlayerMove(mg.page, 'Eksploracja');
    await expect.poll(() => playerMoveOf(sceneId)).toBe('explore');
    await expect(marek.page.locator('.map-placement-hint--stop')).toHaveCount(0);

    const page = marek.page;
    // Gracz nie oddali kamery na całą scenę (najwyżej 10 kratek wokół, 11.10) —
    // kamera jedzie na Kowala chwytem za podłogę obok niego.
    await centreOn(page, { x: 650, y: 650 });
    const centre = { x: 450, y: 450 };
    const target = { x: 650, y: 450 };
    // Przeciągnięcie kilka pól dalej — figura stoi, gracz słyszy dlaczego.
    await clickOnMap(page, { x: 650, y: 650 });
    await page.keyboard.press('Escape');
    await dragWorld(page, centre, { x: 850, y: 450 });
    await page.waitForTimeout(800);
    expect(tokenRow(kowalId)).toMatchObject({ x: 400, y: 400 });
    await expect
      .poll(async () =>
        ((await marek.store<{ items: { type: string; text?: string }[] }>('chat'))?.items ?? [])
          .filter((item) => item.type === 'note')
          .map((item) => item.text ?? '')
          .join(' '),
      )
      .toContain('Figury nie przeciągasz');

    // Pierwszy klik w podłoże wskazuje cel — figura stoi; drugi w to samo pole rusza.
    await page.keyboard.press('Escape');
    await clickOnMap(page, centre);
    await page.waitForTimeout(300);
    await clickOnMap(page, target);
    await page.waitForTimeout(1_500);
    expect(tokenRow(kowalId)).toMatchObject({ x: 400, y: 400 });
    await clickOnMap(page, target);
    await expect
      .poll(() => tokenRow(kowalId), { timeout: 10_000 })
      .toMatchObject({ x: 600, y: 400 });
    await page.keyboard.press('Escape');
    expect((await move(gmSocket, kowalId, 400, 400)).ok).toBe(true);
    // Pula odrasta przed następnym testem, który liczy ją od pełnej.
    await mg.page.waitForTimeout(10_500);
  });

  test('Eksploracja: pula z karty, odmowa „Złap oddech” i odnowa po ~10 s', async () => {
    test.setTimeout(2 * 60_000);
    await setPlayerMove(mg.page, 'Eksploracja');
    await expect.poll(() => playerMoveOf(sceneId)).toBe('explore');
    let cap = 0;
    await expect
      .poll(async () => {
        cap = (await tokensOf(marek))[kowalId]?.paceCapM ?? 0;
        return cap;
      })
      .toBeGreaterThan(0);
    // Cudza figura nie zdradza puli.
    expect((await tokensOf(ola))[kowalId]?.paceCapM).toBeUndefined();

    const full = cap * PX_PER_M;
    expect((await move(marekSocket, kowalId, 400 + full, 400)).ok).toBe(true);
    expect(await move(marekSocket, kowalId, 400 + full + 200, 400)).toEqual({
      ok: false,
      error: 'MOVE_PACE',
    });
    // Klient Marka dostał stan puli — kursor mówi „Złap oddech”.
    await expect
      .poll(async () => {
        const pace = await marek.store<{ pace: Record<string, { owedM: number }> }>('pace');
        return pace.pace[kowalId]?.owedM ?? 0;
      })
      .toBeGreaterThan(cap - 0.5);

    await mg.page.waitForTimeout(10_500);
    expect((await move(marekSocket, kowalId, 400, 400)).ok).toBe(true);
    expect(tokenRow(kowalId)).toMatchObject({ x: 400, y: 400 });
  });

  test('Stop zatrzymuje także uczestnika walki w jego turze', async () => {
    await setPlayerMove(mg.page, 'Eksploracja');
    await expect.poll(() => playerMoveOf(sceneId)).toBe('explore');
    const started = okData(
      await emitAck<{ combatants: { id: string; tokenId: string }[] }>(gmSocket, 'combat:start', {
        sceneId,
        tokenIds: [kowalId],
      }),
    );
    const row = started.combatants.find((entry) => entry.tokenId === kowalId)!;
    await emitAck(gmSocket, 'combat:set-initiative', { combatantId: row.id, initiative: 20 });
    expect((await emitAck(gmSocket, 'combat:next', {})).ok).toBe(true);
    expect((await move(marekSocket, kowalId, 500, 400)).ok).toBe(true);

    await setPlayerMove(mg.page, 'Stop');
    await expect.poll(() => playerMoveOf(sceneId)).toBe('stop');
    await expect(marek.page.locator('.map-placement-hint--stop')).toBeVisible();
    expect(await move(marekSocket, kowalId, 600, 400)).toEqual({ ok: false, error: 'MOVE_LOCKED' });
    expect((await emitAck(gmSocket, 'combat:end', {})).ok).toBe(true);
    expect((await move(gmSocket, kowalId, 400, 400)).ok).toBe(true);
  });

  test('drużyna widzi się za ścianą; „oczy drużyny” wyłączone i ukryta figura znikają', async () => {
    expect(
      (
        await emitAck(gmSocket, 'wall:create', {
          sceneId,
          kind: 'wall',
          points: [
            { x: 0, y: 700 },
            { x: 2000, y: 700 },
          ],
        })
      ).ok,
    ).toBe(true);
    await expect.poll(async () => (await tokensOf(ola))[kowalId]?.partyVision).toBe(true);

    await emitAck(gmSocket, 'token:update', { tokenId: kowalId, patch: { sharedVision: false } });
    await expect.poll(async () => kowalId in (await tokensOf(ola))).toBe(false);
    await emitAck(gmSocket, 'token:update', { tokenId: kowalId, patch: { sharedVision: null } });
    await expect.poll(async () => kowalId in (await tokensOf(ola))).toBe(true);

    await emitAck(gmSocket, 'token:update', { tokenId: kowalId, patch: { hidden: true } });
    await expect.poll(async () => kowalId in (await tokensOf(ola))).toBe(false);
    await emitAck(gmSocket, 'token:update', { tokenId: kowalId, patch: { hidden: false } });
    await expect.poll(async () => kowalId in (await tokensOf(ola))).toBe(true);
  });

  test('w czerni ręcznej mgły drużyna dalej się widzi, a diagnoza przełącza na Dynamiczną', async () => {
    expect((await emitAck(gmSocket, 'scene:visibility', { sceneId, visibility: 'fog' })).ok).toBe(
      true,
    );
    await expect
      .poll(async () => {
        const seen = await tokensOf(ola);
        return [kowalId in seen, iskraId in seen];
      })
      .toEqual([true, true]);

    const page = mg.page;
    await page.locator('.player-move-issues').click();
    const popover = page.locator('.player-move-popover');
    await expect(popover).toContainText('„Kowal” stoi w czerni ręcznej mgły');
    await page.screenshot({ path: test.info().outputPath('mg-diagnoza.png') });
    await ola.page.screenshot({ path: test.info().outputPath('ola-mgla.png') });
    await popover.getByRole('button', { name: 'Przełącz na Dynamiczną' }).click();
    await expect.poll(() => sceneByName(SCENE).visibility).toBe('dynamic');
    await expect(page.locator('.player-move-issues')).toHaveCount(0);
  });

  test('przekazana karta zabiera figurę: Marek prowadzi Iskrę, Ola już nie', async () => {
    await setPlayerMove(mg.page, 'Eksploracja');
    await expect.poll(() => playerMoveOf(sceneId)).toBe('explore');
    const olaSocket = await ola.socket();
    const marekUserId = userIdOf('Marek');
    const olaUserId = userIdOf('Ola');
    try {
      await emitAck(gmSocket, 'character:update', {
        characterId: characterId('Iskra'),
        patch: { ownerId: marekUserId },
      });
      await expect.poll(() => tokenRow(iskraId).ownerId).toBe(marekUserId);
      expect((await move(marekSocket, iskraId, 600, 800)).ok).toBe(true);
      expect(await move(olaSocket, iskraId, 400, 800)).toEqual({ ok: false, error: 'FORBIDDEN' });
    } finally {
      await emitAck(gmSocket, 'character:update', {
        characterId: characterId('Iskra'),
        patch: { ownerId: olaUserId },
      });
    }
    await expect.poll(() => tokenRow(iskraId).ownerId).toBe(olaUserId);
    expect((await move(olaSocket, iskraId, 400, 800)).ok).toBe(true);
    olaSocket.disconnect();
    await marek.page.screenshot({ path: test.info().outputPath('marek-eksploracja.png') });
  });
});
