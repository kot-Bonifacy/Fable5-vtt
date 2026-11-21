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
 * Etap 72f2 — okno „Pościg” MG. Scena jazdy w lewo, trzy pasy, szeroki kadr
 * (48 kratek): Strzała Iskry (Ola), Furgon gangu z kierowcą-NPC-em i Radiowóz
 * poza pościgiem (uciekł przed walką — jak posiłki czekające na swoją rundę).
 *
 * - MG (**Chromium**) przed walką daje Furgonowi własną prędkość startową
 *   (50 mil/h) — na starcie walki rusza z nią, nie z prędkością sceny;
 * - w walce poprawia jego prędkość polem okna;
 * - wypuszcza barykadę na trzecim pasie 20 m przed Strzałą Iskry; okno
 *   prognozuje dojazd i ostrzega, gdy odległość to mniej niż runda jazdy;
 * - przywraca Radiowóz na trzecim (wolnym) pasie od tyłu, z prędkością pościgu;
 * - Ola (**Firefox**) okna nie ma, a Radiowóz widzi dopiero po powrocie.
 */

type Ack<T> = { ok: true; data: T } | { ok: false; error: string };
const dataOf = <T>(ack: unknown): T => {
  const typed = ack as Ack<T>;
  if (!typed.ok) throw new Error(JSON.stringify(ack));
  return typed.data;
};

interface Placed {
  id: string;
  name: string;
  x: number;
  y: number;
  speed: number;
  startSpeed: number | null;
  lane: number;
  lengthSq: number;
  status: string;
}
interface Obstacle {
  id: string;
  kind: string;
  x: number;
  y: number;
  lengthSq: number;
}
interface CombatView {
  round: number;
  activeCombatantId: string | null;
  combatants: { id: string; tokenId: string | null }[];
}

const MAP = 'mapy/Neonowy wiadukt nad cyberpunkowym miastem_24x18.png';

test.describe.serial('@szybkie T72f2 okno „Pościg”: kadr, prędkości, posiłki, przeszkody', () => {
  let mg: Actor;
  let ola: Actor;
  let gm: Socket;
  let sceneId = '';
  let grid = 0;
  let width = 0;
  let iskraCar: Placed;
  let vanCar: Placed;
  let policeCar: Placed;
  let iskra = '';
  let vanDriver = '';

  const vehicle = async (actor: Actor, id: string) =>
    (await actor.store<{ vehicles: Placed[] }>('chase')).vehicles.find((row) => row.id === id);
  const obstacles = async (actor: Actor) =>
    (await actor.store<{ obstacles: Obstacle[] }>('chase')).obstacles;
  /** „Następna tura” MG; runda stojąca na kubku Oli (Wyścig) — drugie kliknięcie ją pomija. */
  const next = async () => {
    scriptDice([5]);
    const view = dataOf<CombatView>(await emitAck(gm, 'combat:next', undefined));
    if (view.round >= 1 && view.activeCombatantId === null) {
      return dataOf<CombatView>(await emitAck(gm, 'combat:next', undefined));
    }
    return view;
  };
  const panel = () => mg.page.getByRole('region', { name: 'Pościg' });
  /** Wiersz auta po nazwie — sama treść wiersza nie wystarcza (lista zamiaru wymienia cudze auta). */
  const carRow = (name: string) =>
    panel()
      .locator('.chase-window-car')
      .filter({ has: mg.page.locator('.chase-window-car-name', { hasText: name }) });

  test.beforeAll(async ({ cast }) => {
    const mapFile = material(MAP);
    await startFromPoT6(DEAD_GATEWAY);
    test.setTimeout(4 * 60_000);
    cast.viewport = { width: 1600, height: 1000 };
    mg = await cast.mg('chromium');
    ola = await cast.gracz('Ola', 'firefox', await invite(await apiGm(), 'Ola'));
    gm = await mg.socket();

    sceneId = dataOf<{ id: string }>(
      await emitAck(gm, 'scene:create', { name: 'Okno pościgu', kind: 'chase' }),
    ).id;
    const api = await apiGm();
    const upload = await api.post('/api/uploads/maps', {
      multipart: {
        file: { name: 'wiadukt.png', mimeType: 'image/png', buffer: readFileSync(mapFile) },
      },
    });
    const map = (await upload.json()) as { url: string; width: number; height: number };
    await api.dispose();
    grid = map.width / 48;
    width = map.width;
    dataOf(
      await emitAck(gm, 'scene:update', {
        sceneId,
        patch: {
          background: map,
          grid: { sizePx: grid },
          // Jazda w lewo; trzy pasy po 4 kratki (środki 6, 10, 14), 100 mil/h na starcie.
          chase: { road: { from: 4, to: 16 }, tempo: 20 },
        },
      }),
    );
    dataOf(await emitAck(gm, 'scene:activate', { sceneId }));
    dataOf(await emitAck(gm, 'scene:view', { sceneId }));

    const create = async (name: string, imageUrl: string, owner?: string) => {
      const created = dataOf<{ id: string }>(
        await emitAck(gm, 'vehicle:create', {
          catalogId: 'vehicle.samochod-sportowy',
          ...(owner ? { ownerCharacterId: owner } : {}),
        }),
      );
      dataOf(
        await emitAck(gm, 'vehicle:update', { vehicleId: created.id, patch: { name, imageUrl } }),
      );
      return created.id;
    };
    const place = async (vehicleId: string, x: number, y: number) =>
      dataOf<Placed>(await emitAck(gm, 'chase:place', { sceneId, vehicleId, x, y }));
    // Iskra stoi już tam, gdzie trzyma ją kadr (30% od tylnej, prawej krawędzi).
    iskraCar = await place(
      await create('Strzała Iskry', '/art/vehicles/furia.webp', characterId('Iskra')),
      grid * 33.6,
      grid * 6,
    );
    vanCar = await place(
      await create('Furgon gangu', '/art/vehicles/widmo.webp'),
      grid * 42,
      grid * 10,
    );
    policeCar = await place(
      await create('Radiowóz', '/art/vehicles/widmo.webp'),
      grid * 20,
      grid * 14,
    );
    // Radiowóz czeka poza pościgiem — jak posiłki z rezerwy.
    dataOf(await emitAck(gm, 'chase:escape', { sceneVehicleId: policeCar.id }));

    const figure = async (name: string, y: number, extra: Record<string, unknown> = {}) =>
      dataOf<{ id: string }>(
        await emitAck(gm, 'token:create', { sceneId, name, x: grid * 2, y: grid * y, ...extra }),
      ).id;
    iskra = await figure('Iskra', 2, {
      characterId: characterId('Iskra'),
      ownerId: userId('Ola'),
    });
    vanDriver = await figure('Kierowca gangu', 4, { hp: { current: 30, max: 30 } });
    for (const [tokenId, sceneVehicleId] of [
      [iskra, iskraCar.id],
      [vanDriver, vanCar.id],
    ] as const) {
      dataOf(await emitAck(gm, 'vehicle:seat', { tokenId, sceneVehicleId, seat: 0 }));
    }

    await closeNotices(mg.page);
    await mg.page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await sceneListRow(mg.page, 'Okno pościgu').getByRole('button', { name: 'Pokaż' }).click();
    await closeNotices(ola.page);
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('przed walką: okno otwiera ikona MG, Furgon dostaje własną prędkość startową', async () => {
    await expect(ola.page.getByRole('button', { name: 'Pościg', exact: true })).toHaveCount(0);
    await mg.page.getByRole('button', { name: 'Pościg', exact: true }).click();
    await expect(panel()).toBeVisible();
    await expect(panel().locator('.chase-window-status')).toHaveText(
      'Przed walką · prędkość startowa 100 mil/h',
    );
    await expect(panel()).toContainText('Przeszkody wypuszcza się w walce');
    // Radiowóz jest wśród posiłków, nie wśród aut w kadrze.
    await expect(panel().locator('.chase-window-car--off')).toContainText('Radiowóz');

    const speed = panel().getByRole('spinbutton', { name: 'Prędkość: Furgon gangu' });
    await expect(speed).toHaveValue('');
    await speed.fill('50');
    await speed.press('Enter');
    await expect.poll(async () => (await vehicle(mg, vanCar.id))?.startSpeed).toBe(10);
    await panel().screenshot({ path: test.info().outputPath('okno-przed-walka.png') });
  });

  test('w walce: Furgon rusza z 50 mil/h, MG poprawia prędkość polem okna', async () => {
    const combat = dataOf<CombatView>(
      await emitAck(gm, 'combat:start', { sceneId, tokenIds: [iskra, vanDriver] }),
    );
    const order: Record<string, number> = { [iskra]: 18, [vanDriver]: 12 };
    for (const row of combat.combatants) {
      dataOf(
        await emitAck(gm, 'combat:set-initiative', {
          combatantId: row.id,
          initiative: order[row.tokenId ?? ''] ?? 10,
        }),
      );
    }
    await next(); // runda 1, tura Iskry
    await closeNotices(mg.page);
    await closeNotices(ola.page);
    await expect.poll(async () => (await vehicle(mg, vanCar.id))?.speed).toBe(10);
    await expect(panel().locator('.chase-window-status')).toHaveText('Runda 1 · pościg 100 mil/h');
    const speed = panel().getByRole('spinbutton', { name: 'Prędkość: Furgon gangu' });
    await expect(speed).toHaveValue('50');
    await speed.fill('150');
    await speed.press('Enter');
    await expect.poll(async () => (await vehicle(mg, vanCar.id))?.speed).toBe(30);
    // Kolejność od czoła: Strzała Iskry (kadr) przed Furgonem.
    await expect(panel().locator('.chase-window-car').first()).toContainText('Strzała Iskry');
    await expect(carRow('Furgon gangu').locator('.chase-window-gap')).toHaveText(/^−/);
  });

  test('barykada 20 m przed Strzałą Iskry na trzecim pasie, z prognozą', async () => {
    const form = panel().locator('.chase-window-obstacle');
    await form.getByRole('combobox', { name: 'Rodzaj przeszkody' }).selectOption('barricade');
    await form.getByRole('combobox', { name: 'Pas przeszkody' }).selectOption('2');
    await form.getByRole('combobox', { name: 'Przed którym autem' }).selectOption(iskraCar.id);
    const gap = form.getByRole('spinbutton', { name: 'Odległość przeszkody' });
    // Za blisko — mniej niż runda jazdy: okno ostrzega, ale nie blokuje.
    await gap.fill('2');
    await expect(form.locator('.chase-window-hint--warn')).toContainText('nie zdąży');
    await gap.fill('20');
    await expect(form.locator('.chase-window-hint')).toContainText('dojedzie za');
    await expect(form.locator('.chase-window-hint--warn')).toHaveCount(0);
    await form.getByRole('button', { name: 'Wypuść' }).click();
    await expect.poll(async () => (await obstacles(ola)).length).toBe(1);

    const mps = (await mg.store<{ scene: { metersPerSquare: number } }>('scene')).scene
      .metersPerSquare;
    const car = (await vehicle(mg, iskraCar.id))!;
    const [barricade] = await obstacles(mg);
    // Jazda w lewo: przód auta to mniejsze `x`; barykada ma 1 kratkę wzdłuż.
    const expected = car.x - (car.lengthSq / 2 + 20 / mps + barricade!.lengthSq / 2) * grid;
    expect(barricade!.x).toBeCloseTo(expected, 1);
    expect(barricade!.y).toBeCloseTo(grid * 14, 1);
    await expect(panel().locator('.chase-window-obstacle-row')).toContainText(
      'przed autem kadru · inny pas',
    );
    await panel().screenshot({ path: test.info().outputPath('okno-przeszkoda.png') });
  });

  test('Radiowóz wraca na trzecim pasie od tyłu z prędkością pościgu; Ola go widzi (Firefox)', async () => {
    expect(await vehicle(ola, policeCar.id)).toBeUndefined();
    const row = panel().locator('.chase-window-car--off', { hasText: 'Radiowóz' });
    // Trzeci pas: przy tylnej krawędzi drugiego stoi Furgon — tam auto wjechałoby dalej.
    await row.getByRole('combobox', { name: 'Pas wjazdu: Radiowóz' }).selectOption('2');
    await row.getByRole('combobox', { name: 'Strona kadru: Radiowóz' }).selectOption('rear');
    await row.getByRole('button', { name: 'Przywróć do pościgu' }).click();
    await expect.poll(async () => (await vehicle(mg, policeCar.id))?.status).toBe('racing');
    const police = (await vehicle(mg, policeCar.id))!;
    // Prędkość pościgu tej rundy (100 mil/h); tył kadru przy jeździe w lewo to prawa krawędź.
    expect(police).toMatchObject({ lane: 2, speed: 20 });
    expect(police.x).toBeCloseTo(width - (police.lengthSq / 2) * grid, 1);
    await expect.poll(async () => (await vehicle(ola, policeCar.id))?.status).toBe('racing');
    await expect(carRow('Radiowóz')).toBeVisible();
    await mg.page.screenshot({ path: test.info().outputPath('okno-posilki.png') });
    await ola.page.screenshot({ path: test.info().outputPath('ola-posilki.png') });
  });
});
