import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { throwNetRoll } from '../../fixtures/siec.ts';
import { runOf } from '../../fixtures/brama.ts';
import { apiGm, characterId, cookieHeader, invite, userId } from '../../fixtures/nocna-zmiana.ts';
import { startFromPoT6 } from '../../fixtures/regresja.ts';
import { centreCamera, clickOnMap } from '../../fixtures/scene.ts';
import { DEAD_GATEWAY, rawSocket } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 62 „Sieć ze sceny” (zlecenie MG z 28.10). W grze netrunner podłączył się
 * w „restauracji Mariana” i nie zobaczył żadnej kamery: kamery stały na mapie
 * tylko jako figury, a gniazdo nie prowadziło do żadnej Architektury. Teraz
 * figura z ikoną urządzenia sama jest urządzeniem Sieci, gniazdo bez
 * Architektury składa prostą Sieć ze sceny, a nazwę i rodzaj urządzeń netrunner
 * widzi na piętrze ich węzła (od 70a; wcześniej od podłączenia). Ola (Firefox) gra Iskrą, MG stawia scenę z gniazda.
 */

type Ack<T> = { ok: true; data: T } | { ok: false; error: string };
const dataOf = <T>(ack: unknown): T => {
  const typed = ack as Ack<T>;
  if (!typed.ok) throw new Error(JSON.stringify(ack));
  return typed.data;
};

const SCENE = 'restauracja Mariana';
const SOCKET_AT = { x: 360, y: 460 };
const CAMERA_NAME = 'Kamera nad barem';

test.describe.serial('T62 Sieć ze sceny: kamery bez Architektury', () => {
  let gm: Socket;
  let ola: Actor;
  let sceneId = '';
  const polygonsOf = async (actor: Actor) =>
    (await actor.store<{ polygons: unknown[] }>('wall'))?.polygons.length ?? 0;
  let basePolygons = 0;

  const runWindow = () => ola.page.locator('.net-run-window');

  test.beforeAll(async ({ cast }) => {
    await startFromPoT6(DEAD_GATEWAY);
    test.setTimeout(4 * 60_000);
    const { socket } = await rawSocket(await cookieHeader(await apiGm()));
    gm = socket!;

    sceneId = dataOf<{ id: string }>(await emitAck(gm, 'scene:create', { name: SCENE })).id;
    await emitAck(gm, 'scene:update', {
      sceneId,
      patch: { width: 2000, height: 2000, playerMove: 'explore' },
    });
    await emitAck(gm, 'scene:activate', { sceneId });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'dynamic' });
    // Sala za ścianą: bez oczu kamery Iskra jej nie widzi.
    await emitAck(gm, 'wall:create', {
      sceneId,
      kind: 'wall',
      points: [
        { x: 0, y: 1000 },
        { x: 2000, y: 1000 },
      ],
    });

    await emitAck(gm, 'token:create', {
      sceneId,
      name: 'Iskra',
      x: 200,
      y: 300,
      ownerId: userId('Ola'),
      characterId: characterId('Iskra'),
    });
    // Tak jak w grze: kamery to same figury z ikoną, nic nie jest wpięte w Sieć.
    const camera = dataOf<{ id: string }>(
      await emitAck(gm, 'token:create', {
        sceneId,
        name: CAMERA_NAME,
        x: 400,
        y: 1400,
        glyph: 'camera',
        hidden: true,
      }),
    ).id;
    await emitAck(gm, 'token:facing', { tokenId: camera, facing: 90 });
    await emitAck(gm, 'token:create', {
      sceneId,
      name: 'Wieżyczka',
      x: 1600,
      y: 1600,
      glyph: 'turret',
    });
    await emitAck(gm, 'token:create', { sceneId, name: 'Mina', x: 1000, y: 1700, glyph: 'mine' });
    await emitAck(gm, 'token:create', { sceneId, name: 'Marian', x: 1200, y: 1400 });
    dataOf(
      await emitAck(gm, 'netpoint:place', {
        sceneId,
        ...SOCKET_AT,
        name: 'Gniazdo przy kasie',
        architectureId: null,
        hidden: false,
      }),
    );

    ola = await cast.gracz('Ola', 'firefox', await invite(await apiGm(), 'Ola'));
    ola.page.setDefaultTimeout(15_000);
    await expect
      .poll(async () => (await ola.store<{ scene: { name: string } | null }>('scene'))?.scene?.name)
      .toBe(SCENE);
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
  });

  test('gniazdo bez Architektury: karta pozwala się podłączyć', async () => {
    basePolygons = await polygonsOf(ola);
    await centreCamera(ola.page, { x: 600, y: 500 });
    await ola.page.waitForTimeout(500);
    await clickOnMap(ola.page, SOCKET_AT);
    const card = ola.page.getByLabel(/^Karta obiektu: /);
    await expect(card).toBeVisible();
    // Gracz nie dostaje podpowiedzi MG o Sieci ze sceny.
    await expect(card).not.toContainText('Bez Architektury');
    await card.getByRole('button', { name: 'Podłącz się' }).click();
    await expect(runWindow()).toBeVisible();
    // 70a: belka stanu nie pisze już punktu dostępu — piętro stoi w karcie.
    await expect(runWindow().locator('.net-floor-card-title')).toHaveText('Wejście');
  });

  test('po podłączeniu okno nie mówi o urządzeniach nic — tylko wyjście „Niżej: ?”', async () => {
    // 70a (decyzja MG nr 2 z 11.11): lista urządzeń dopiero na piętrze ich węzła.
    await expect(runWindow().locator('.net-sighted-device')).toHaveCount(0);
    await expect(runWindow().locator('.net-floor-card')).toHaveCount(1);
    await expect(runWindow().locator('.net-exit--down')).toHaveText('▼ Niżej: ?');
    expect(await ola.sniffer.found([CAMERA_NAME])).toEqual([]);
  });

  test('MG: gniazdo podpięte do złożonej „Sieć: restauracja Mariana”', async () => {
    const list = dataOf<{ architectures: { id: string; name: string }[] }>(
      await emitAck(gm, 'net:list', undefined),
    ).architectures;
    expect(list.map((entry) => entry.name)).toContain(`Sieć: ${SCENE}`);
  });

  test('zjazd na węzły: nazwy i rodzaje, po Kontroli „Monitoringu” i „Obrony” oba urządzenia przejęte', async () => {
    await runWindow().locator('.net-exit--down').click();
    await expect.poll(() => runOf('Iskra')?.state.position.floor).toBe(1);
    // Etap 70d: węzły wg rodzaju — kamera w „Monitoringu”, wieżyczka w „Obronie”.
    await expect(runWindow().locator('.net-floor-card-title')).toHaveText('Monitoring');
    // Przed Kontrolą: nazwa stołu i rodzaj. Kamera stoi na warstwie MG, więc
    // nazwa figury zostaje u MG, a gracz zna sam rodzaj.
    const sighted = runWindow().locator('.net-node-sighted');
    await expect(sighted.locator('.net-sighted-device')).toHaveText(['Kamera']);
    await expect(sighted).not.toContainText('Mina');
    await expect(sighted).not.toContainText('Marian');
    expect(await ola.sniffer.found([CAMERA_NAME])).toEqual([]);

    // Interfejs Iskry + 9 przebija PT węzła Sieci ze sceny (Standardowy, 8).
    scriptDice([9]);
    await runWindow().locator('.net-abilities').getByRole('button', { name: 'Kontrola' }).click();
    await throwNetRoll(ola.page);
    const devices = runWindow().locator('.net-eye');
    await devices.first().waitFor({ timeout: 20_000 });
    expect(pendingDice()).toBe('');
    await expect(devices).toHaveCount(1);

    // Piętro niżej „Obrona” z wieżyczką — druga Kontrola.
    await runWindow().locator('.net-exit--down').click();
    await expect.poll(() => runOf('Iskra')?.state.position.floor).toBe(2);
    await expect(runWindow().locator('.net-floor-card-title')).toHaveText('Obrona');
    await expect(sighted.locator('.net-sighted-device')).toHaveText(['Wieżyczka']);
    scriptDice([9]);
    await runWindow().locator('.net-abilities').getByRole('button', { name: 'Kontrola' }).click();
    await throwNetRoll(ola.page);
    await expect(devices).toHaveCount(2, { timeout: 20_000 });
    expect(pendingDice()).toBe('');
    // Etap 70b/70c: figury prowadzi się z mapy — „Obróć”, „Strzelaj” i „Wyłącz”
    // stoją na lewej belce przejętej figury, a pasek „Oczy i urządzenia” ma dla
    // nich tylko miniaturę-oko (kadr i zaznaczenie).
    await expect(runWindow().locator('.net-eye[data-eye]')).toHaveCount(2);
    await expect(devices.getByRole('button', { name: /Obróć|Strzel|Wyłącz/ })).toHaveCount(0);
    await expect
      .poll(async () =>
        (
          await ola.store<{ runs: { operated: { deviceKind: string }[] }[] }>('netRun')
        ).runs[0]?.operated
          .map((figure) => figure.deviceKind)
          .sort(),
      )
      .toEqual(['camera', 'turret']);
    // Od 70c patrzy też wieżyczka (koło na zasięg figury) — dwie pary oczu.
    await expect.poll(() => polygonsOf(ola)).toBe(basePolygons + 2);
    await expect
      .poll(async () =>
        Object.values(
          (await ola.store<{ tokens: Record<string, { name: string }> }>('token'))?.tokens ?? {},
        ).map((token) => token.name),
      )
      .toContain('Marian');
  });

  test('MG stawia kamerę w trakcie runu: Iskra patrzy przez nią bez ponownego podłączenia', async () => {
    // Zgłoszenie MG z 29.10: figury dopinał tylko `netrun:start`, więc kamera
    // postawiona przy trzymanym węźle nie dawała obrazu aż do odłączenia.
    await emitAck(gm, 'token:create', { sceneId, name: 'Kucharz', x: 300, y: 1800 });
    const late = dataOf<{ id: string }>(
      await emitAck(gm, 'token:create', {
        sceneId,
        name: 'Kamera w kuchni',
        x: 300,
        y: 1100,
        glyph: 'camera',
        hidden: true,
      }),
    ).id;
    await emitAck(gm, 'token:facing', { tokenId: late, facing: 180 });
    await expect(runWindow().locator('.net-eye')).toHaveCount(3);
    await expect.poll(() => polygonsOf(ola)).toBe(basePolygons + 3);
    await expect
      .poll(async () =>
        Object.values(
          (await ola.store<{ tokens: Record<string, { name: string }> }>('token'))?.tokens ?? {},
        ).map((token) => token.name),
      )
      .toContain('Kucharz');
  });

  test('„Odłącz się”: drugie podłączenie trafia w tę samą Sieć, bez drugiej Architektury', async () => {
    // Kadr na kamerę dojeżdża po animacji kości (pułapka `siec`) — czekamy, aż stanie.
    await ola.page.waitForTimeout(3500);
    await ola.page.getByRole('button', { name: 'Odłącz się' }).click();
    await expect(runWindow()).toBeHidden();
    // Kontrola przewiozła kadr na kamerę — wracamy nad gniazdo.
    await centreCamera(ola.page, { x: 600, y: 500 });
    await ola.page.waitForTimeout(500);
    await clickOnMap(ola.page, SOCKET_AT);
    await ola.page
      .getByLabel(/^Karta obiektu: /)
      .getByRole('button', { name: 'Podłącz się' })
      .click();
    // Urządzenia stoją na piętrze węzła: przed Kontrolą z nazwy i rodzaju,
    // a z pamięci przejętych węzłów (02.11) od razu w pasku — obie kamery
    // „Monitoringu” i wieżyczka „Obrony” ze śladu (70d: dwa węzły zamiast jednego).
    await runWindow().locator('.net-exit--down').click();
    await expect.poll(() => runOf('Iskra')?.state.position.floor).toBe(1);
    await expect(runWindow().locator('.net-sighted-device, .net-eye')).toHaveCount(3);
    const list = dataOf<{ architectures: { name: string }[] }>(
      await emitAck(gm, 'net:list', undefined),
    ).architectures;
    expect(list.filter((entry) => entry.name === `Sieć: ${SCENE}`)).toHaveLength(1);
  });
});
