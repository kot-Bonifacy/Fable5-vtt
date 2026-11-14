import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { architecture, runOf } from '../../fixtures/brama.ts';
import { apiGm, cookieHeader, invite } from '../../fixtures/nocna-zmiana.ts';
import { seat, startFromPoT6 } from '../../fixtures/regresja.ts';
import { DEAD_GATEWAY, rawSocket } from '../../fixtures/security.ts';
import {
  abilityButton,
  buildNetScene,
  exitUp,
  exitsDown,
  floorCard,
  goUp,
  jackIn,
  planFloors,
  positionOf,
  runWindow,
  takeExit,
  trailSteps,
  throwNetRoll,
} from '../../fixtures/siec.ts';
import { Canaries } from '../../fixtures/sniffer.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 70a „Okno SIEĆ: jedno piętro”. Do 70a okno rysowało cały szyb z „?” na
 * nieodkrytych piętrach — gracz znał liczbę pięter i odnóg, a ładunek niósł ich
 * `id`. Teraz serwer wysyła graczowi piętro pod stopami, wyjścia z niego i ślad
 * odwiedzonych; reszty szybu w ładunku nie ma. MG dalej widzi całość w „Planie
 * Architektury”.
 *
 * Architektura ma 8 pięter: wejście → hasło → Plik (rozwidlenie) → węzeł → Plik →
 * dno, a z Pliku odnoga na dwa piętra (płytsza od trzonu — przy remisie głębokości
 * Architektura nie ma dna i Wirusa nie ma gdzie zostawić). Etykiety, notatki i `id` pięter to kanarki: podsłuch Oli
 * nie może zobaczyć żadnego, zanim zasady go ujawnią (Zwiad albo wejście).
 * Odnoga jest bez LOD-u — Programy wymagałyby prywatnego kompendium, a automat
 * LOD-u ma własny spec w 70e.
 */

const SCENE = 'Serwerownia 70a';
const ARCHITECTURE = 'Sieć serwerowni 70a';
const SOCKET_AT = { x: 360, y: 460 };
/** Okno gracza po 70a (`--net-screen` w `17-net.css`). */
const PLAYER_WIDTH = 360;

test.describe.serial('@szybkie T70a okno SIEĆ: jedno piętro', () => {
  let gm: Socket;
  let mg: Actor;
  let ola: Actor;
  const canaries = new Canaries();
  /** Etykiety pięter (kanarki) po kluczu `t0…t5`, `b0`, `b1`. */
  const label: Record<string, string> = {};
  /** `id` pięter z bazy po tym samym kluczu. */
  const floorIds: Record<string, string> = {};
  let trunkId = '';
  let branchId = '';
  let fileNote = '';

  /** Żaden kanarek „tajny w tej chwili” nie dotarł do Oli. */
  const expectNoLeak = async (actor: Actor = ola) => {
    const leaked = await actor.sniffer.found(canaries.secretNow);
    if (leaked.length > 0) {
      test.info().annotations.push({
        type: `wyciek u ${actor.name}`,
        description: `${leaked.join(', ')} … ${await actor.sniffer.evidence(leaked[0]!, 0, 200)}`,
      });
    }
    expect(leaked).toEqual([]);
  };
  /** Wejście na piętro ujawnia jego etykietę i `id`. */
  const entered = (key: string) => {
    canaries.reveal(label[key]!);
    canaries.reveal(floorIds[key]!);
  };

  test.beforeAll(async ({ cast }) => {
    await startFromPoT6(DEAD_GATEWAY);
    test.setTimeout(4 * 60_000);
    const { socket } = await rawSocket(await cookieHeader(await apiGm()));
    gm = socket!;

    for (const key of ['t0', 't1', 't2', 't3', 't4', 't5', 'b0', 'b1']) {
      label[key] = canaries.secret(key);
    }
    fileNote = canaries.secret('notatka-pliku');
    await buildNetScene(gm, {
      scene: SCENE,
      runner: { character: 'Iskra', player: 'Ola', at: { x: 200, y: 300 } },
      socketAt: SOCKET_AT,
      architecture: {
        name: ARCHITECTURE,
        branches: [
          {
            id: 'kid-trzon-70a',
            parentFloor: null,
            floors: [
              { id: 'kid-t0-4a1c', kind: 'empty', label: label.t0! },
              { id: 'kid-t1-9e27', kind: 'password', label: label.t1!, dv: 6 },
              { id: 'kid-t2-c35b', kind: 'file', label: label.t2!, dv: 6, notes: fileNote },
              { id: 'kid-t3-71d8', kind: 'controlNode', label: label.t3!, dv: 6 },
              { id: 'kid-t4-e60f', kind: 'file', label: label.t4!, dv: 6 },
              { id: 'kid-t5-0d77', kind: 'empty', label: label.t5! },
            ],
          },
          {
            id: 'kid-odnoga-70a',
            name: canaries.secret('nazwa-odnogi'),
            parentFloor: 2,
            floors: [
              { id: 'kid-b0-2f94', kind: 'file', label: label.b0!, dv: 6 },
              { id: 'kid-b1-b8a3', kind: 'empty', label: label.b1! },
            ],
          },
        ],
      },
    });
    const shaft = architecture(ARCHITECTURE).shaft.branches as unknown as {
      id: string;
      floors: { id: string }[];
    }[];
    trunkId = shaft[0]!.id;
    branchId = shaft[1]!.id;
    shaft[0]!.floors.forEach((floor, index) => (floorIds[`t${index}`] = floor.id));
    shaft[1]!.floors.forEach((floor, index) => (floorIds[`b${index}`] = floor.id));
    for (const id of Object.values(floorIds)) {
      // Własne `id` zostały w bazie — inaczej podsłuch szukałby „f0-3” w całym ruchu.
      expect(id).toMatch(/^kid-/);
      canaries.track(id);
    }

    ({
      mg,
      players: [ola],
    } = (await seat(cast, ['Ola'], SCENE)) as { mg: Actor; players: [Actor] });
    ola.page.setDefaultTimeout(15_000);
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
  });

  test('1. podłączenie: jedna karta piętra, wyjście „Niżej: ?”, okno 360 px z dala od kubka', async () => {
    await jackIn(ola, SOCKET_AT);
    entered('t0');
    await expect(floorCard(ola)).toHaveCount(1);
    await expect(floorCard(ola).locator('.net-floor-card-title')).toHaveText(label.t0!);
    await expect(floorCard(ola).locator('.net-floor-card-meta')).toContainText('głębokość 1');
    await expect(exitsDown(ola)).toHaveCount(1);
    await expect(exitsDown(ola)).toHaveText('▼ Niżej: ?');
    await expect(exitUp(ola)).toHaveCount(0);
    // Gracz nie ma planu szybu ani żadnego „z N”.
    await expect(runWindow(ola).locator('.net-plan, .net-run-floor')).toHaveCount(0);
    await expect(runWindow(ola)).not.toContainText(/\d\s*(z|\/)\s*\d/);
    await expect(runWindow(ola).locator('.net-run-title')).toContainText('SIEĆ');

    const box = (await runWindow(ola).boundingBox())!;
    const cup = (await ola.page.locator('.dice-cup').boundingBox())!;
    test.info().annotations.push({
      type: 'okno i kubek (Firefox)',
      description: JSON.stringify({ box, cup }),
    });
    expect(box.width).toBeLessThanOrEqual(PLAYER_WIDTH);
    const apart =
      box.x + box.width <= cup.x ||
      cup.x + cup.width <= box.x ||
      box.y + box.height <= cup.y ||
      cup.y + cup.height <= box.y;
    expect(apart, 'okno runu nie nachodzi na kubek').toBe(true);
  });

  test('2. podsłuch: ładunek Oli nie zna żadnego piętra poza wejściem', async () => {
    await expectNoLeak();
    // Kontrola podsłuchu: etykieta wejścia naprawdę jedzie tym kanałem.
    expect(await ola.sniffer.found([label.t0!])).toEqual([label.t0!]);
  });

  test('3. hasło: „Niżej” wyszarzone z powodem, Backdoor otwiera zjazd', async () => {
    await takeExit(ola, 'Iskra');
    entered('t1');
    await expect(floorCard(ola).locator('.net-floor-card-title')).toHaveText(label.t1!);
    const down = exitsDown(ola);
    await expect(down).toHaveCount(1);
    await expect(down).toBeDisabled();
    await expect(down).toHaveAttribute('title', /Hasło pod stopami blokuje zjazd/);
    // Na haśle nie ma Ajdi ani Kontroli — tylko to, co ma tu zastosowanie.
    await expect(abilityButton(ola, 'Ajdi')).toHaveCount(0);
    await expect(abilityButton(ola, 'Kontrola')).toHaveCount(0);

    scriptDice([9]);
    await abilityButton(ola, 'Backdoor').click();
    await throwNetRoll(ola.page);
    await expect.poll(() => runOf('Iskra')?.state.broken).toContain(floorIds.t1);
    expect(pendingDice()).toBe('');
    await expect(down).toBeEnabled({ timeout: 20_000 });
    await expect(floorCard(ola)).toContainText('złamane');
    await expectNoLeak();
  });

  test('4. Zwiad: wyjście dostaje rodzaj i nazwę bez PT; na rozwidleniu dwa wyjścia', async () => {
    scriptDice([9]);
    await abilityButton(ola, 'Zwiad').click();
    await throwNetRoll(ola.page);
    const down = exitsDown(ola);
    await expect(down).toHaveClass(/net-exit--scouted/, { timeout: 20_000 });
    expect(pendingDice()).toBe('');
    canaries.reveal(label.t2!);
    await expect(down).toContainText(label.t2!);
    await expect(down).not.toContainText('PT');
    // Zwiad mówi, czym jest piętro niżej — nie daje jego `id` ani notatki.
    await expectNoLeak();

    await takeExit(ola, 'Iskra');
    entered('t2');
    await expect(exitsDown(ola)).toHaveCount(2);
    await expect(exitsDown(ola, 'Niżej')).toHaveText('▼ Niżej: ?');
    await expect(exitsDown(ola, 'Odnoga')).toContainText('?');
    // Nazwa odnogi to też wiedza z szybu — nieznane wyjście jej nie niesie.
    await expectNoLeak();
  });

  test('4b. Maskowanie: piętro bez LOD-u to łatwe PT, sukces zostaje znacznikiem (14.11)', async () => {
    scriptDice([9]);
    await abilityButton(ola, 'Maskowanie').click();
    await throwNetRoll(ola.page);
    await expect(floorCard(ola)).toContainText('ślady zatarte', { timeout: 20_000 });
    expect(pendingDice()).toBe('');
    // Zamaskowane piętro zamyka Maskowanie — przycisk wyszarzony jak zużyta próba.
    await expect(abilityButton(ola, 'Maskowanie')).toBeDisabled();
    await runWindow(ola).screenshot({
      path: test.info().outputPath('maskowanie-karta-gracza.png'),
    });
    await expectNoLeak();
  });

  test('5. ślad: klik w pierwsze piętro wraca, klik w ostatnie odwiedzone schodzi z powrotem', async () => {
    await expect(trailSteps(ola)).toHaveCount(3);
    await trailSteps(ola).first().click();
    await expect.poll(() => positionOf('Iskra')?.floor).toBe(0);
    await expect(floorCard(ola).locator('.net-floor-card-title')).toHaveText(label.t0!);
    // Ślad dalej zna trzy piętra — nie mniej i nie więcej.
    await expect(trailSteps(ola)).toHaveCount(3);
    await runWindow(ola).locator(`.net-trail-step[title*="${label.t2!}"]`).click();
    await expect.poll(() => positionOf('Iskra')?.floor).toBe(2);
    await expect(floorCard(ola).locator('.net-floor-card-title')).toHaveText(label.t2!);
    await expectNoLeak();
  });

  test('6. surowe gniazdo: piętro nieodwiedzone i zmyślone dostają tę samą odmowę', async () => {
    const socket = await ola.socket();
    const runId = runOf('Iskra')!.id;
    const move = (to: { branchId: string; floor: number }) =>
      emitAck(socket, 'netrun:move', { runId, to });
    const deep = await move({ branchId: trunkId, floor: 4 });
    const branchDeep = await move({ branchId, floor: 1 });
    const madeUp = await move({ branchId: trunkId, floor: 40 });
    const noBranch = await move({ branchId: 'zmyslona-odnoga', floor: 0 });
    // Gniazdo oddaje odmowę już po polsku (`NET_NO_SUCH_FLOOR`).
    expect(deep).toEqual({ ok: false, error: 'Nie ma takiego piętra w tej Architekturze.' });
    for (const ack of [branchDeep, madeUp, noBranch]) expect(ack).toEqual(deep);
    expect(positionOf('Iskra')).toEqual({ branchId: trunkId, floor: 2 });
    // Kopia i obsługa urządzenia z `floorId` spoza odwiedzonych — bez rozróżniania.
    const copyDeep = await emitAck(socket, 'netrun:copy', { runId, floorId: floorIds.t4 });
    const copyMadeUp = await emitAck(socket, 'netrun:copy', { runId, floorId: 'kid-nie-ma' });
    expect(copyDeep).toMatchObject({ ok: false });
    expect(copyDeep).toEqual(copyMadeUp);
    await expectNoLeak();
  });

  test('7. dno: „Dalej nie ma zejścia”, Wirus tylko tam', async () => {
    await takeExit(ola, 'Iskra', 'Niżej');
    entered('t3');
    await expect(floorCard(ola).locator('.net-floor-card-title')).toHaveText(label.t3!);
    await expect(abilityButton(ola, 'Kontrola')).toBeVisible();
    await expect(abilityButton(ola, 'Wirus')).toHaveCount(0);
    await takeExit(ola, 'Iskra', 'Niżej');
    entered('t4');
    await expect(abilityButton(ola, 'Wirus')).toHaveCount(0);
    await takeExit(ola, 'Iskra', 'Niżej');
    entered('t5');
    await expect(exitsDown(ola)).toHaveCount(0);
    await expect(runWindow(ola).locator('.net-exit-end')).toHaveText('Dalej nie ma zejścia.');
    await expect(abilityButton(ola, 'Wirus')).toBeVisible();
    await goUp(ola, 'Iskra');
    await expect(floorCard(ola).locator('.net-floor-card-title')).toHaveText(label.t4!);
    await expect(abilityButton(ola, 'Wirus')).toHaveCount(0);
    await goUp(ola, 'Iskra');
    await expect(floorCard(ola).locator('.net-floor-card-title')).toHaveText(label.t3!);
    await expectNoLeak();
  });

  test('8. MG: „Plan Architektury” pokazuje cały szyb z pozycją Iskry', async () => {
    await expect(runWindow(mg)).toBeVisible();
    await expect(runWindow(mg).locator('.net-run-title')).toContainText(ARCHITECTURE);
    await expect(planFloors(mg)).toHaveCount(8);
    const here = runWindow(mg).locator('.net-plan .net-run-floor--here');
    await expect(here).toHaveCount(1);
    await expect(here).toContainText(label.t3!);
    for (const key of ['t0', 't1', 't2', 't3', 't4', 't5', 'b0', 'b1']) {
      await expect(runWindow(mg).locator('.net-plan')).toContainText(label[key]!);
    }
    // MG ma tę samą kartę piętra co gracz, a obok plan.
    await expect(floorCard(mg).locator('.net-floor-card-title')).toHaveText(label.t3!);
    // Znacznik Maskowania z kroku 4b stoi na planie MG przy tamtym piętrze.
    await expect(
      runWindow(mg).locator('.net-plan .net-run-floor', { hasText: label.t2! }),
    ).toContainText('ślady zatarte');
    // Czerwone ślady (zlecenie MG z 14.11): piętra opuszczone bez Maskowania mają
    // czerwony brzeg i plakietkę; zamaskowane t2 i t3 pod stopami — nie.
    const planRow = (key: string) =>
      runWindow(mg).locator('.net-plan .net-run-floor', { hasText: label[key]! });
    for (const key of ['t0', 't1', 't4', 't5']) {
      await expect(planRow(key), key).toHaveClass(/net-run-floor--traces/);
      await expect(planRow(key).locator('.net-run-floor-flag--traces')).toHaveText(
        'ślady: bez maskowania',
      );
    }
    for (const key of ['t2', 't3', 'b0', 'b1']) {
      await expect(planRow(key), key).not.toHaveClass(/net-run-floor--traces/);
    }
    await expect(planRow('t1').locator('.net-run-floor-flag--traces')).toHaveCSS(
      'color',
      'rgb(255, 59, 78)',
    );
    // Gracz widzi tę samą czerwień w śladzie (MG 14.11: „gracz też niech widzi”).
    await expect(runWindow(ola).locator('.net-trail-step--traces')).toHaveCount(4);
    await expect(runWindow(ola).locator(`.net-trail-step[title*="${label.t1!}"]`)).toHaveAttribute(
      'title',
      /ślady: bez maskowania/,
    );
    await runWindow(mg).screenshot({ path: test.info().outputPath('maskowanie-plan-mg.png') });
    await runWindow(ola).screenshot({ path: test.info().outputPath('slady-gracz.png') });
  });

  test('9. konsola czysta; okno w Chromium jako gracz', async ({ cast }) => {
    for (const actor of [mg, ola]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
    const chromiumOla = await cast.gracz('Ola', 'chromium', await invite(await apiGm(), 'Ola'));
    await expect(runWindow(chromiumOla)).toBeVisible({ timeout: 30_000 });
    await expect(floorCard(chromiumOla)).toHaveCount(1);
    await expect(floorCard(chromiumOla).locator('.net-floor-card-title')).toHaveText(label.t3!);
    await expect(runWindow(chromiumOla).locator('.net-plan, .net-run-floor')).toHaveCount(0);
    const box = (await runWindow(chromiumOla).boundingBox())!;
    test.info().annotations.push({ type: 'okno (Chromium)', description: JSON.stringify(box) });
    expect(box.width).toBeLessThanOrEqual(PLAYER_WIDTH);
    // Druga karta tej samej graczki: te same granice ładunku.
    await expectNoLeak(chromiumOla);
    expect(chromiumOla.unexpectedErrors(), 'Ola (Chromium)').toEqual([]);
  });
});
