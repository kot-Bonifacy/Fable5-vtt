import { readFileSync } from 'node:fs';
import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { sceneListRow } from '../../fixtures/brama.ts';
import { clickWorld } from '../../fixtures/canvas.ts';
import { material } from '../../fixtures/materials.ts';
import { apiGm, characterId, invite, userId } from '../../fixtures/nocna-zmiana.ts';
import { startFromPoT6 } from '../../fixtures/regresja.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { closeNotices } from '../../fixtures/table.ts';
import { scriptDice } from '../../instance/instance.ts';

/**
 * Etap 65e „Przeszkody i ruch uliczny” na scenie pościgu z mapą wiaduktu. MG
 * (Chromium) wypuszcza barykadę z palety „Przeszkody” — poza walką przycisk
 * jest wyszarzony. Na początku rundy barykada dojeżdża do auta Iskry (Ola,
 * **Firefox**) i staje przy zderzaku, a Ola dostaje pasek z „Gwałtowny skręt /
 * Taranuj”. Udany skręt (kości skryptowane) zostawia barykadę za autem. Auto
 * gangu zrzuca kolczatkę, a puste auto za nim wjeżdża na nią: bez kierowcy
 * Testu nie ma — 4k6 w słaby punkt.
 *
 * Geometrię i reguły sprawdzają `chase-obstacles.test.ts` w `shared` i serwerze.
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
  hp: number;
  control: string;
}
interface Obstacle {
  id: string;
  kind: string;
  x: number;
  blockingVehicleId: string | null;
}

const MAP = 'mapy/Neonowy wiadukt nad cyberpunkowym miastem_24x18.png';

test.describe.serial('@szybkie T65e pościg: przeszkody i kolczatka', () => {
  let mg: Actor;
  let ola: Actor;
  let gm: Socket;
  let sceneId = '';
  let grid = 0;
  let olaCar: Placed;
  let gangCar: Placed;
  let emptyCar: Placed;

  const obstacles = async (actor: Actor) =>
    (await actor.store<{ obstacles: Obstacle[] }>('chase')).obstacles;
  const vehicle = async (actor: Actor, id: string) =>
    (await actor.store<{ vehicles: Placed[] }>('chase')).vehicles.find((row) => row.id === id);

  test.beforeAll(async ({ cast }) => {
    const mapFile = material(MAP);
    await startFromPoT6(DEAD_GATEWAY);
    test.setTimeout(4 * 60_000);
    cast.viewport = { width: 1600, height: 1000 };
    mg = await cast.mg('chromium');
    ola = await cast.gracz('Ola', 'firefox', await invite(await apiGm(), 'Ola'));
    gm = await mg.socket();

    sceneId = dataOf<{ id: string }>(
      await emitAck(gm, 'scene:create', { name: 'Wiadukt', kind: 'chase' }),
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
          chase: { road: { from: 6, to: 13 }, tempo: 40 },
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
    // Sportowy: Ruch 40 = tempo, więc auta nie dryfują, a przeszkoda zbliża się 10 kratek na rundę.
    olaCar = await place(await create(undefined, characterId('Iskra')), grid * 12, grid * 11.5);
    gangCar = await place(
      await create({
        name: 'Wóz Maelstromu',
        system: { upgrades: [{ id: 'u-spikes', upgradeId: 'spikes', notes: '' }] },
      }),
      grid * 15,
      grid * 7.5,
    );
    emptyCar = await place(await create({ name: 'Porzucony wóz' }), grid * 8, grid * 7.5);

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
    await sceneListRow(mg.page, 'Wiadukt').getByRole('button', { name: 'Pokaż' }).click();
    await expect(mg.page.getByRole('button', { name: 'Przeszkody' })).toBeDisabled();

    const combat = dataOf<{ combatants: { id: string; tokenId: string }[] }>(
      await emitAck(gm, 'combat:start', { sceneId, tokenIds: [iskra.id, ganger.id] }),
    );
    for (const row of combat.combatants) {
      dataOf(
        await emitAck(gm, 'combat:set-initiative', {
          combatantId: row.id,
          initiative: row.tokenId === ganger.id ? 18 : 12,
        }),
      );
    }
    dataOf(await emitAck(gm, 'combat:next'));
    await closeNotices(ola.page);
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('MG wypuszcza barykadę z palety przy przedniej krawędzi pasa Iskry', async () => {
    const button = mg.page.getByRole('button', { name: 'Przeszkody' });
    await expect(button).toBeEnabled();
    await button.click();
    const palette = mg.page.getByRole('group', { name: 'Rodzaj przeszkody' });
    await palette.getByRole('button', { name: 'Barykada' }).click();
    await clickWorld(mg.page, { x: grid * 6, y: grid * 11.5 });
    await expect.poll(async () => (await obstacles(ola)).length).toBe(1);
    const [barricade] = await obstacles(ola);
    expect(barricade).toMatchObject({ kind: 'barricade', blockingVehicleId: null });
    expect(barricade!.x).toBeCloseTo(grid * 23.5, 0);
    await mg.page.keyboard.press('Escape');
  });

  test('nowa runda: barykada staje przed autem, a Ola omija ją Gwałtownym skrętem (Firefox)', async () => {
    dataOf(await emitAck(gm, 'combat:next'));
    dataOf(await emitAck(gm, 'combat:next'));
    await expect
      .poll(async () => (await obstacles(ola))[0]?.blockingVehicleId ?? null)
      .toBe(olaCar.id);
    const bar = ola.page.locator('.notice', { hasText: 'Na drodze: Barykada' });
    await expect(bar).toBeVisible();
    // REF 7 + Prowadzenie 0 + 9 = 16 ≥ PT 13.
    scriptDice([9]);
    await bar.getByRole('button', { name: 'Gwałtowny skręt' }).click();
    // Odpowiedź przychodzi po animacji kości 3D.
    await expect
      .poll(
        async () => {
          const [row] = await obstacles(ola);
          return row ? row.blockingVehicleId : 'brak';
        },
        { timeout: 30_000 },
      )
      .toBeNull();
    await expect(bar).toBeHidden();
    expect((await obstacles(ola))[0]!.x).toBeLessThan(olaCar.x);
    expect(await vehicle(ola, olaCar.id)).toMatchObject({ control: 'driver', hp: olaCar.hp });
    await expect(
      ola.page.locator('.chat-row', { hasText: 'Manewr: Gwałtowny skręt' }).last(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('kolczatka z auta gangu: puste auto za nim bierze 4k6 w słaby punkt', async () => {
    // Tura gangu (inicjatywa 18) — MG zrzuca kolczatkę za kierowcę-NPC-a.
    dataOf(await emitAck(gm, 'vehicle:spikes', { sceneVehicleId: gangCar.id }));
    await expect
      .poll(async () => (await obstacles(ola)).some((row) => row.kind === 'spikes'))
      .toBe(true);
    // 3 + 3 + 3 + 3 = 12 przez OB 0, ×2 w słaby punkt.
    scriptDice([3, 3, 3, 3]);
    dataOf(await emitAck(gm, 'combat:next'));
    dataOf(await emitAck(gm, 'combat:next'));
    await expect
      .poll(async () => (await vehicle(ola, emptyCar.id))?.hp, { timeout: 30_000 })
      .toBe(emptyCar.hp - 24);
    expect((await vehicle(ola, gangCar.id))?.hp).toBe(gangCar.hp);
  });
});
