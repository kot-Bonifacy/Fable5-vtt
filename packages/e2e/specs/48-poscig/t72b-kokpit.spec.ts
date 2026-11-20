import { readFileSync } from 'node:fs';
import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { sceneListRow } from '../../fixtures/brama.ts';
import { material } from '../../fixtures/materials.ts';
import { apiGm, characterId, invite, userId } from '../../fixtures/nocna-zmiana.ts';
import { startFromPoT6 } from '../../fixtures/regresja.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { closeNotices } from '../../fixtures/table.ts';
import { scriptDice } from '../../instance/instance.ts';

/**
 * Etap 72b2 — grupa „Pojazd” w lewej belce. Scena pościgu jedzie w lewo, jezdnia
 * ma trzy pasy (kratki 4–16). Iskra (Ola, **Firefox**) prowadzi swoje sportowe
 * auto z belki: Gaz i „Pas wyżej”, potem „Jedź”; po ruchu krzyżak gaśnie. MG
 * (Chromium) w turze Gangera prowadzi auto NPC-a tym samym kokpitem (hamulec).
 * Na początku rundy 2 kadr stawia auto Iskry z powrotem na 30 % od tyłu,
 * a `shiftSq` sceny rośnie o tyle samo — z niego droga przeskakuje razem z autami.
 *
 * Liczby ruchu sprawdza `chase-drive.test.ts` w `shared` i serwerze; tu —
 * że belka wysyła to, co pokazuje.
 */

type Ack<T> = { ok: true; data: T } | { ok: false; error: string };
const dataOf = <T>(ack: unknown): T => {
  const typed = ack as Ack<T>;
  if (!typed.ok) throw new Error(JSON.stringify(ack));
  return typed.data;
};

interface Placed {
  id: string;
  x: number;
  y: number;
  speed: number;
  lane: number;
  moved: boolean;
}
interface ChaseView {
  pursuitSpeed: number | null;
  shiftSq: number;
  lanes: number;
}

const MAP = 'mapy/Neonowy wiadukt nad cyberpunkowym miastem_24x18.png';

test.describe.serial('@szybkie T72b kokpit: grupa „Pojazd” w belce', () => {
  let mg: Actor;
  let ola: Actor;
  let gm: Socket;
  let sceneId = '';
  let grid = 0;
  let olaCar: Placed;
  let gangCar: Placed;
  let shiftAfterRound1 = 0;

  const vehicle = async (actor: Actor, id: string) =>
    (await actor.store<{ vehicles: Placed[] }>('chase')).vehicles.find((row) => row.id === id);
  const chase = async (actor: Actor) =>
    (await actor.store<{ scene: { chase: ChaseView } | null }>('scene')).scene!.chase;

  test.beforeAll(async ({ cast }) => {
    const mapFile = material(MAP);
    await startFromPoT6(DEAD_GATEWAY);
    test.setTimeout(4 * 60_000);
    cast.viewport = { width: 1600, height: 1000 };
    mg = await cast.mg('chromium');
    ola = await cast.gracz('Ola', 'firefox', await invite(await apiGm(), 'Ola'));
    gm = await mg.socket();

    sceneId = dataOf<{ id: string }>(
      await emitAck(gm, 'scene:create', { name: 'Kokpit', kind: 'chase' }),
    ).id;
    const api = await apiGm();
    const upload = await api.post('/api/uploads/maps', {
      multipart: {
        file: { name: 'wiadukt.png', mimeType: 'image/png', buffer: readFileSync(mapFile) },
      },
    });
    const map = (await upload.json()) as { url: string; width: number; height: number };
    await api.dispose();
    grid = map.width / 24;
    dataOf(
      await emitAck(gm, 'scene:update', {
        sceneId,
        patch: {
          background: map,
          grid: { sizePx: grid },
          // Jazda w lewo (domyślna); jezdnia 12 kratek = 3 pasy po 4 (środki 6, 10, 14).
          // Prędkość startowa 20 (100 mil/h) — sportowy ma maksimum 40 (200 mil/h).
          chase: { road: { from: 4, to: 16 }, tempo: 20 },
        },
      }),
    );
    dataOf(await emitAck(gm, 'scene:activate', { sceneId }));
    dataOf(await emitAck(gm, 'scene:view', { sceneId }));

    const create = async (patch?: Record<string, unknown>, owner?: string) => {
      const created = dataOf<{ id: string }>(
        await emitAck(gm, 'vehicle:create', {
          catalogId: 'vehicle.samochod-sportowy',
          ...(owner ? { ownerCharacterId: owner } : {}),
        }),
      );
      if (patch) dataOf(await emitAck(gm, 'vehicle:update', { vehicleId: created.id, patch }));
      return created.id;
    };
    const place = async (vehicleId: string, x: number, y: number) =>
      dataOf<Placed>(await emitAck(gm, 'chase:place', { sceneId, vehicleId, x, y }));
    // Auto Iskry na środkowym pasie, auto gangu przed nim (w lewo) na dolnym.
    // Grafika modelu stoi na kaflu auta w belce (MG 20.11).
    olaCar = await place(
      await create({ imageUrl: '/art/vehicles/car-red.webp' }, characterId('Iskra')),
      grid * 12,
      grid * 10,
    );
    gangCar = await place(await create({ name: 'Wóz Maelstromu' }), grid * 6, grid * 14);

    const iskra = dataOf<{ id: string }>(
      await emitAck(gm, 'token:create', {
        sceneId,
        name: 'Iskra',
        characterId: characterId('Iskra'),
        ownerId: userId('Ola'),
        x: grid * 2,
        y: grid * 2,
      }),
    );
    dataOf(
      await emitAck(gm, 'vehicle:seat', { tokenId: iskra.id, sceneVehicleId: olaCar.id, seat: 0 }),
    );
    const ganger = dataOf<{ id: string }>(
      await emitAck(gm, 'token:create', {
        sceneId,
        name: 'Ganger',
        x: grid * 2,
        y: grid * 4,
        hp: { current: 30, max: 30 },
      }),
    );
    dataOf(
      await emitAck(gm, 'vehicle:seat', {
        tokenId: ganger.id,
        sceneVehicleId: gangCar.id,
        seat: 0,
      }),
    );

    // MG ogląda swoją scenę osobno — przełącza się na pościg w „Scenach”.
    await closeNotices(mg.page);
    await mg.page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await sceneListRow(mg.page, 'Kokpit').getByRole('button', { name: 'Pokaż' }).click();

    const combat = dataOf<{ combatants: { id: string; tokenId: string }[] }>(
      await emitAck(gm, 'combat:start', { sceneId, tokenIds: [iskra.id, ganger.id] }),
    );
    for (const row of combat.combatants) {
      dataOf(
        await emitAck(gm, 'combat:set-initiative', {
          combatantId: row.id,
          initiative: row.tokenId === iskra.id ? 18 : 12,
        }),
      );
    }
    dataOf(await emitAck(gm, 'combat:next', undefined));
    await closeNotices(ola.page);
    await closeNotices(mg.page);
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('runda 1: kadr stawia auto Iskry na 30 % od tyłu, belka Oli pokazuje „Pojazd” (Firefox)', async () => {
    // Jazda w lewo: tył kadru to prawa krawędź, 30 % z 24 kratek → x 16,8.
    await expect
      .poll(async () => ((await vehicle(ola, olaCar.id))?.x ?? 0) / grid)
      .toBeCloseTo(16.8, 1);
    const view = await chase(ola);
    expect(view).toMatchObject({ pursuitSpeed: 20, lanes: 3 });
    shiftAfterRound1 = view.shiftSq;
    expect(shiftAfterRound1).toBeCloseTo(-4.8, 1);

    const group = ola.page.getByTestId('hud-vehicle');
    await expect(group).toBeVisible();
    await expect(group).toContainText('100 mil/h · maks. 200');
    // Grupa zajmuje miejsce Biegu, Skoku i Skradania.
    await expect(ola.page.locator('.hud-rail .hud-slot--medium', { hasText: 'Bieg' })).toHaveCount(
      0,
    );
    // Krzyżak jak na ekranie: przy jeździe w lewo gaz stoi z lewej, hamulec z prawej.
    const gas = group.getByRole('button', { name: /^Gaz/ });
    const brake = group.getByRole('button', { name: /^Hamulec/ });
    const gasBox = (await gas.boundingBox())!;
    const brakeBox = (await brake.boundingBox())!;
    expect(gasBox.x).toBeLessThan(brakeBox.x);
    await group.screenshot({ path: test.info().outputPath('pojazd-przed.png') });
    await ola.page.screenshot({ path: test.info().outputPath('stol-gracza.png') });
  });

  test('Ola: Gaz + Pas wyżej, „Jedź” — auto przyspiesza, zmienia pas i krzyżak gaśnie (Firefox)', async () => {
    const group = ola.page.getByTestId('hud-vehicle');
    await group.getByRole('button', { name: /^Gaz/ }).click();
    await expect(group.getByRole('button', { name: /^Gaz/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await group.getByRole('button', { name: /^Pas wyżej/ }).click();
    await expect(group).toContainText('100 → 150 mil/h');
    await expect(group).toContainText('pas 1 z 3');
    await expect(group.getByRole('button', { name: /^Jedź/ })).toContainText('Akcja Ruchu');
    await group.screenshot({ path: test.info().outputPath('pojazd-wybor.png') });

    // Iskra: REF 7 + Prowadzenie 0 — słaby kierowca rzuca Test zwykłej jazdy (do 72c).
    scriptDice([9]);
    await group.getByRole('button', { name: /^Jedź/ }).click();
    // +50 mil/h (30 Ruchu) przy prędkości pościgu 20: (30 − 20) / 4 = 2,5 kratki w lewo.
    await expect
      .poll(async () => (await vehicle(ola, olaCar.id))?.moved, { timeout: 30_000 })
      .toBe(true);
    const moved = (await vehicle(ola, olaCar.id))!;
    expect(moved).toMatchObject({ speed: 30, lane: 0 });
    expect(moved.x / grid).toBeCloseTo(14.3, 1);
    await expect(group.getByRole('button', { name: /^Gaz/ })).toHaveClass(/hud-slot--refused/);
    await expect(group).toContainText('150 mil/h · maks. 200');
    await group.screenshot({ path: test.info().outputPath('pojazd-po.png') });
  });

  test('MG w turze Gangera hamuje autem NPC-a z belki (Chromium)', async () => {
    dataOf(await emitAck(gm, 'combat:next', undefined));
    await closeNotices(mg.page);
    const group = mg.page.getByTestId('hud-vehicle');
    await expect(group).toBeVisible();
    await expect(group).toContainText('Wóz Maelstromu');
    await group.getByRole('button', { name: /^Hamulec/ }).click();
    await group.getByRole('button', { name: /^Jedź/ }).click();
    // −100 mil/h: 20 → 0 Ruchu, (0 − 20) / 4 = 5 kratek w tył (w prawo).
    await expect.poll(async () => (await vehicle(mg, gangCar.id))?.moved).toBe(true);
    const moved = (await vehicle(mg, gangCar.id))!;
    expect(moved.speed).toBe(0);
    expect(moved.x / grid).toBeCloseTo(10.8 + 5, 1);
  });

  test('runda 2: kadr wraca za autem Iskry, a przesunięcie trafia do sceny (Firefox)', async () => {
    dataOf(await emitAck(gm, 'combat:next', undefined));
    // Auto kadru ma 30 Ruchu, więc stoi znów na 16,8; kadr przesunął się o −2,5.
    await expect
      .poll(async () => ((await vehicle(ola, olaCar.id))?.x ?? 0) / grid)
      .toBeCloseTo(16.8, 1);
    const view = await chase(ola);
    expect(view.pursuitSpeed).toBe(30);
    expect(view.shiftSq - shiftAfterRound1).toBeCloseTo(-2.5, 1);
    const group = ola.page.getByTestId('hud-vehicle');
    await expect(group.getByRole('button', { name: /^Gaz/ })).not.toHaveClass(/hud-slot--refused/);
    await expect(group.getByRole('button', { name: /^Pas wyżej/ })).toHaveClass(
      /hud-slot--refused/,
    );
  });
});
