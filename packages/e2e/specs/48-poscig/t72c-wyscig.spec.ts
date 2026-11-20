import { readFileSync } from 'node:fs';
import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { sceneListRow } from '../../fixtures/brama.ts';
import { material } from '../../fixtures/materials.ts';
import { apiGm, characterId, invite, userId } from '../../fixtures/nocna-zmiana.ts';
import { startFromPoT6 } from '../../fixtures/regresja.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { closeNotices, shakeCup } from '../../fixtures/table.ts';
import { scriptDice } from '../../instance/instance.ts';

/**
 * Etap 72c — Wyścig. Na początku rundy pościgu kierowcy rzucają Test
 * przeciwstawny Prowadzenia: za Gangera (figura bez karty, czyste 1k10) serwer,
 * Iskra (Ola, **Firefox**) kubkiem na wezwanie. Runda stoi bez tury, a pas
 * inicjatywy pisze „Wyścig — czekam na: Iskra”; MG (Chromium) ma kartę
 * w panelu decyzji. Po rzucie Oli zryw wchodzi do ruchu jej auta. W rundzie 2
 * MG pomija Wyścig z panelu decyzji.
 *
 * Liczby Wyścigu sprawdzają `chase-drive.test.ts` (`shared`) i
 * `chase-race.test.ts` (serwer); tu — że stół widzi i rzuca to, co trzeba.
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
  moved: boolean;
  raceBonus: number;
}

const MAP = 'mapy/Neonowy wiadukt nad cyberpunkowym miastem_24x18.png';

test.describe.serial('@szybkie T72c Wyścig: kubek gracza, NPC od serwera, runda czeka', () => {
  let mg: Actor;
  let ola: Actor;
  let gm: Socket;
  let sceneId = '';
  let grid = 0;
  let olaCar: Placed;

  const vehicle = async (actor: Actor, id: string) =>
    (await actor.store<{ vehicles: Placed[] }>('chase')).vehicles.find((row) => row.id === id);
  const combatOf = async (actor: Actor) =>
    (await actor.store<{ combat: { round: number; activeCombatantId: string | null } | null }>(
      'combat',
    ))!.combat;

  test.beforeAll(async ({ cast }) => {
    const mapFile = material(MAP);
    await startFromPoT6(DEAD_GATEWAY);
    test.setTimeout(4 * 60_000);
    cast.viewport = { width: 1600, height: 1000 };
    mg = await cast.mg('chromium');
    ola = await cast.gracz('Ola', 'firefox', await invite(await apiGm(), 'Ola'));
    gm = await mg.socket();

    sceneId = dataOf<{ id: string }>(
      await emitAck(gm, 'scene:create', { name: 'Wyścig', kind: 'chase' }),
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
          // Jazda w lewo; trzy pasy po 4 kratki; prędkość startowa 20 (100 mil/h).
          chase: { road: { from: 4, to: 16 }, tempo: 20 },
        },
      }),
    );
    dataOf(await emitAck(gm, 'scene:activate', { sceneId }));
    dataOf(await emitAck(gm, 'scene:view', { sceneId }));

    const create = async (owner?: string, name?: string) => {
      const created = dataOf<{ id: string }>(
        await emitAck(gm, 'vehicle:create', {
          catalogId: 'vehicle.samochod-sportowy',
          ...(owner ? { ownerCharacterId: owner } : {}),
        }),
      );
      if (name) {
        dataOf(await emitAck(gm, 'vehicle:update', { vehicleId: created.id, patch: { name } }));
      }
      return created.id;
    };
    const place = async (vehicleId: string, x: number, y: number) =>
      dataOf<Placed>(await emitAck(gm, 'chase:place', { sceneId, vehicleId, x, y }));
    olaCar = await place(await create(characterId('Iskra')), grid * 12, grid * 10);
    const gangCar = await place(await create(undefined, 'Wóz Maelstromu'), grid * 6, grid * 14);

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
    // Ganger bez karty — Wyścig rzuca czystym 1k10.
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

    await closeNotices(mg.page);
    await mg.page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await sceneListRow(mg.page, 'Wyścig').getByRole('button', { name: 'Pokaż' }).click();

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
    // Ganger rzuca Wyścig od razu: 3.
    scriptDice([3]);
    dataOf(await emitAck(gm, 'combat:next', undefined));
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('runda 1 stoi bez tury: pas mówi, na kogo czeka, a karta Wyścigu stoi na czacie (Firefox)', async () => {
    await expect(ola.page.getByTestId('combat-bar-race')).toContainText(
      'Wyścig — czekam na: Iskra',
    );
    expect(await combatOf(ola)).toMatchObject({ round: 1, activeCombatantId: null });
    // Belka nie mówi „poczekaj na swoją kolej” — mówi, na co czeka runda.
    await expect(ola.page.getByText('Runda czeka na Wyścig', { exact: false })).toBeVisible();
    await ola.page.getByRole('button', { name: /^Czat/ }).first().click();
    const card = ola.page.getByTestId('chase-race').last();
    await expect(card).toContainText('Wyścig — runda 1');
    await expect(card).toContainText('Wóz Maelstromu');
    await expect(card).toContainText('czeka na kubek');
    // Gracz nie ma przycisków MG.
    await expect(card.getByRole('button', { name: 'Pomiń Wyścig' })).toHaveCount(0);
    await ola.page.screenshot({ path: test.info().outputPath('wyscig-gracz-czeka.png') });
  });

  test('MG widzi Wyścig w panelu decyzji z „Rzuć za…” i „Pomiń Wyścig” (Chromium)', async () => {
    const panel = mg.page.getByTestId('gm-decision');
    await expect(panel).toContainText('Wyścig czeka');
    await expect(panel.getByRole('button', { name: 'Rzuć za: Iskra' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Pomiń Wyścig' })).toBeVisible();
    await panel.screenshot({ path: test.info().outputPath('wyscig-panel-mg.png') });
  });

  test('Ola rzuca kubkiem: zryw +5 i runda rusza od niej; „Jedź” jedzie o zryw (Firefox)', async () => {
    const page = ola.page;
    const call = page.locator('.chat-message.chat-check').last();
    await expect(call).toContainText('Wyścig — runda 1');
    // Iskra: REF 7 + Prowadzenie 0 = 7 ≤ 9 — słaby kierowca, wezwanie z PT 10.
    await expect(call).toContainText('PT 10');
    // 7 + 0 + 9 = 16 > PT 10; zryw ⌊(16 − 3) / 2⌋ = 6 → sufit 5.
    scriptDice([9]);
    await call.getByRole('button', { name: 'Rzuć' }).click();
    await page.locator('.dialog').last().getByRole('button', { name: 'Weź kubek' }).click();
    await shakeCup(page);
    const card = page.getByTestId('chase-race').last();
    await expect(card).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
    await expect(card).toContainText('16 · zryw +5 kr.');
    await expect(page.getByTestId('combat-bar-race')).toHaveCount(0);
    await expect.poll(async () => (await vehicle(ola, olaCar.id))?.raceBonus).toBe(5);
    await card.screenshot({ path: test.info().outputPath('wyscig-karta.png') });
    await expect(mg.page.getByTestId('gm-decision')).toHaveCount(0);

    // Prędkość równa pościgowi — auto jedzie o sam zryw: 5 kratek w lewo.
    const before = (await vehicle(ola, olaCar.id))!.x;
    const group = page.getByTestId('hud-vehicle');
    await group.getByRole('button', { name: /^Jedź/ }).click();
    await expect.poll(async () => (await vehicle(ola, olaCar.id))?.moved).toBe(true);
    expect(((await vehicle(ola, olaCar.id))!.x - before) / grid).toBeCloseTo(-5, 1);
  });

  test('runda 2: MG pomija Wyścig z panelu decyzji, a runda rusza (Chromium)', async () => {
    dataOf(await emitAck(gm, 'combat:next', undefined));
    scriptDice([6]);
    dataOf(await emitAck(gm, 'combat:next', undefined));
    await closeNotices(mg.page);
    const panel = mg.page.getByTestId('gm-decision');
    await expect(panel).toContainText('Wyścig — runda 2');
    await panel.getByRole('button', { name: 'Pomiń Wyścig' }).click();
    await expect(panel).toHaveCount(0);
    await expect.poll(async () => (await combatOf(mg))?.activeCombatantId ?? null).not.toBeNull();
    const card = ola.page.getByTestId('chase-race').last();
    await expect(card).toHaveAttribute('data-status', 'done');
    await expect(card).toContainText('pominięty, bez zrywu');
    await expect(ola.page.locator('.chat-message.chat-check').last()).toContainText('Odwołane');
  });
});
