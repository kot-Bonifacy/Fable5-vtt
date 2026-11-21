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
 * Etap 72d1 — grupa „Pojazd” w pełnym kształcie. Scena jak w `t72b-kokpit`
 * (jazda w lewo, trzy pasy), ale auto gangu jedzie przed Iskrą na **tym samym**
 * górnym pasie, a auto Iskry ma Nitro. Ola (**Firefox**):
 *
 * - w belce widzi rządek ikon auta (Nitro z liczbą zbiorników, Manewr, Silnik),
 *   a menu auta w walce nie ma już akcji kierowcy — odsyła do belki;
 * - Gaz pod zderzak gangu daje **wiersz „Zderzenie” w belce** (nie pasek);
 * - Manewr z szuflady: udany Gwałtowny skręt pozwala zjechać o dwa pasy;
 * - w rundzie 2 Nitro zapala się i „Po ruchu” mówi „z Nitro”;
 * - barykada MG staje przed zderzakiem: wiersz „Na drodze” w belce i pasek,
 *   a Nagłe zatrzymanie z belki zatrzymuje auto i gasi oba.
 *
 * MG (Chromium) tylko przesuwa tury i wypuszcza barykadę.
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
  swerveReady: boolean;
  nitroArmed: boolean;
}
interface Obstacle {
  id: string;
  blockingVehicleId: string | null;
}
interface CombatView {
  round: number;
  activeCombatantId: string | null;
}

const MAP = 'mapy/Neonowy wiadukt nad cyberpunkowym miastem_24x18.png';

test.describe.serial('@szybkie T72d belka: akcje auta i decyzje kierowcy w grupie „Pojazd”', () => {
  let mg: Actor;
  let ola: Actor;
  let gm: Socket;
  let sceneId = '';
  let grid = 0;
  let olaCar: Placed;

  const vehicle = async (actor: Actor, id: string) =>
    (await actor.store<{ vehicles: Placed[] }>('chase')).vehicles.find((row) => row.id === id);
  const obstacles = async (actor: Actor) =>
    (await actor.store<{ obstacles: Obstacle[] }>('chase')).obstacles;
  /** „Następna tura” MG; runda stojąca na Wyścigu (kubek Oli) — drugie kliknięcie go pomija. */
  const next = async () => {
    const view = dataOf<CombatView>(await emitAck(gm, 'combat:next', undefined));
    if (view.round >= 1 && view.activeCombatantId === null) {
      return dataOf<CombatView>(await emitAck(gm, 'combat:next', undefined));
    }
    return view;
  };

  test.beforeAll(async ({ cast }) => {
    const mapFile = material(MAP);
    await startFromPoT6(DEAD_GATEWAY);
    test.setTimeout(4 * 60_000);
    cast.viewport = { width: 1600, height: 1000 };
    mg = await cast.mg('chromium');
    ola = await cast.gracz('Ola', 'firefox', await invite(await apiGm(), 'Ola'));
    gm = await mg.socket();

    sceneId = dataOf<{ id: string }>(
      await emitAck(gm, 'scene:create', { name: 'Belka', kind: 'chase' }),
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
          // Jazda w lewo; trzy pasy po 4 kratki (środki 6, 10, 14), 100 mil/h na starcie.
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
    // Oba auta na górnym pasie: gang z przodu (w lewo), Iskra tuż za nim.
    olaCar = await place(
      await create(
        {
          imageUrl: '/art/vehicles/car-red.webp',
          system: { upgrades: [{ id: 'u-nitro', upgradeId: 'nitro', notes: '' }] },
        },
        characterId('Iskra'),
      ),
      grid * 12,
      grid * 6,
    );
    const gangCar = await place(await create({ name: 'Wóz Maelstromu' }), grid * 6, grid * 6);

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

    await closeNotices(mg.page);
    await mg.page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await sceneListRow(mg.page, 'Belka').getByRole('button', { name: 'Pokaż' }).click();

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
    // Runda 1 — Wyścig MG pomija (o nim jest `t72c-wyscig`); tura Iskry.
    await next();
    await closeNotices(ola.page);
    await closeNotices(mg.page);
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('w belce stoją ikony auta, a menu auta w walce odsyła do belki (Firefox)', async () => {
    const group = ola.page.getByTestId('hud-vehicle');
    await expect(group).toBeVisible();
    const tools = group.getByRole('group', { name: 'Auto' });
    await expect(tools.getByRole('button', { name: /^Nitro/ })).toBeVisible();
    await expect(tools.getByRole('button', { name: /^Nitro/ })).toContainText('1');
    await expect(tools.getByRole('button', { name: /^Manewr/ })).toBeVisible();
    await expect(tools.getByRole('button', { name: /^Zgaś silnik/ })).toBeVisible();
    // Sportowy bez wyrzutni — kolczatki nie ma.
    await expect(tools.getByRole('button', { name: /kolczatk/ })).toHaveCount(0);
    await group.screenshot({ path: test.info().outputPath('pojazd-ikony.png') });

    // Klik w kafel auta: panel auta z fotelami, bez Nitro i silnika.
    await group.locator('.hud-slot--large').click();
    const menu = ola.page.getByRole('menu', { name: /^Auto: / });
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('w grupie „Pojazd” w lewej belce');
    await expect(menu.getByRole('button', { name: /^Nitro/ })).toHaveCount(0);
    await expect(menu.getByRole('button', { name: /silnik/ })).toHaveCount(0);
    await ola.page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('Gaz pod zderzak gangu: pytanie o zderzenie stoi wierszem w belce (Firefox)', async () => {
    const group = ola.page.getByTestId('hud-vehicle');
    await group.getByRole('button', { name: /^Gaz/ }).click();
    await group.getByRole('button', { name: /^Jedź/ }).click();
    const row = group.locator('[data-decision="contact"]');
    await expect(row).toBeVisible();
    await expect(row).toContainText('Wóz Maelstromu');
    await expect(row.getByRole('button', { name: /^Taranuj/ })).toBeVisible();
    await expect(row.getByRole('button', { name: /^Zwolnij za nim/ })).toBeVisible();
    // Bez paska „Zderzenie” nad mapą (od 72d).
    await expect(ola.page.locator('.notice', { hasText: 'Taranować' })).toHaveCount(0);
    await group.screenshot({ path: test.info().outputPath('pojazd-zderzenie.png') });
    await row.getByRole('button', { name: /^Zmienię plan/ }).click();
    await expect(row).toBeHidden();
    // Nic się nie stało: auto nie jechało, Gaz zostaje do odznaczenia.
    expect((await vehicle(ola, olaCar.id))?.moved).toBe(false);
    await group.getByRole('button', { name: /^Gaz/ }).click();
    await expect(group.getByRole('button', { name: /^Gaz/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('Manewr z szuflady: Gwałtowny skręt i zjazd o dwa pasy (Firefox)', async () => {
    const group = ola.page.getByTestId('hud-vehicle');
    await group.getByRole('button', { name: /^Manewr/ }).click();
    const drawer = group.getByRole('list', { name: 'Manewry' });
    await expect(drawer).toBeVisible();
    // REF 7 + Prowadzenie 0 + 9 = 16 > PT 13.
    scriptDice([9]);
    await drawer.getByRole('button', { name: /^Gwałtowny skręt/ }).click();
    await expect(drawer).toBeHidden();
    await expect
      .poll(async () => (await vehicle(ola, olaCar.id))?.swerveReady, { timeout: 30_000 })
      .toBe(true);
    const lower = group.getByRole('button', { name: /^Pas niżej/ });
    await lower.click();
    await expect(group).toContainText('pas 2 z 3');
    await lower.click();
    await expect(lower).toContainText('o dwa pasy');
    await expect(group).toContainText('pas 3 z 3');
    await group.screenshot({ path: test.info().outputPath('pojazd-dwa-pasy.png') });
    await group.getByRole('button', { name: /^Jedź/ }).click();
    await expect
      .poll(async () => (await vehicle(ola, olaCar.id))?.moved, { timeout: 30_000 })
      .toBe(true);
    expect(await vehicle(ola, olaCar.id)).toMatchObject({ lane: 2, swerveReady: false });
  });

  test('runda 2: Nitro zapala się w belce, a „Po ruchu” liczy je do „Jedź” (Firefox)', async () => {
    await next();
    await next();
    await closeNotices(ola.page);
    const group = ola.page.getByTestId('hud-vehicle');
    const nitro = group.getByRole('button', { name: /^Nitro/ });
    await expect(nitro).not.toHaveClass(/hud-slot--refused/);
    await nitro.click();
    await expect.poll(async () => (await vehicle(ola, olaCar.id))?.nitroArmed).toBe(true);
    await expect(nitro).toHaveAttribute('aria-pressed', 'true');
    await expect(group.locator('.hud-vehicle-after')).toContainText('z Nitro');
    // Prędkość równa pościgowi, Wyścig pominięty: samo Nitro, Ruch 40 / 4 = 10 kratek po 1 m.
    await expect(group.locator('.hud-vehicle-after')).toContainText('+10 m');
  });

  test('barykada przed zderzakiem: wiersz w belce, Nagłe zatrzymanie gasi go i pasek (Firefox)', async () => {
    // Tura Iskry w rundzie 2 trwa: MG wypuszcza barykadę na dolny pas (pas Iskry).
    dataOf(
      await emitAck(gm, 'chase:obstacle-spawn', {
        sceneId,
        kind: 'barricade',
        lane: (await vehicle(ola, olaCar.id))!.lane,
      }),
    );
    // Tura po turze, aż barykada stanie przy zderzaku (początek rundy) — po
    // każdej turze czekamy, aż stół MG dogoni serwer, żeby nie przeskoczyć tury Iskry.
    for (let turn = 0; turn < 12; turn += 1) {
      const view = await next();
      await expect
        .poll(
          async () =>
            (await mg.store<{ combat: CombatView | null }>('combat')).combat?.activeCombatantId,
        )
        .toBe(view.activeCombatantId);
      const [row] = await obstacles(mg);
      if (row?.blockingVehicleId === olaCar.id) break;
    }
    await expect
      .poll(async () => (await obstacles(ola))[0]?.blockingVehicleId ?? null)
      .toBe(olaCar.id);
    const group = ola.page.getByTestId('hud-vehicle');
    const row = group.locator('[data-decision="blocker"]');
    await expect(row).toBeVisible();
    await expect(row).toContainText('Barykada');
    await expect(row.getByRole('button', { name: /^Gwałtowny skręt/ })).toBeVisible();
    await expect(row.getByRole('button', { name: /^Taranuj/ })).toBeVisible();
    const bar = ola.page.locator('.notice', { hasText: 'Na drodze: Barykada' });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Nagłe zatrzymanie' })).toBeVisible();
    await group.screenshot({ path: test.info().outputPath('pojazd-przeszkoda.png') });
    // REF 7 + Prowadzenie 0 + 9 = 16 > PT 13.
    scriptDice([9]);
    await row.getByRole('button', { name: /^Nagłe zatrzymanie/ }).click();
    await expect
      .poll(
        async () => {
          const [row] = await obstacles(ola);
          return row ? row.blockingVehicleId : 'brak';
        },
        {
          timeout: 30_000,
        },
      )
      .toBeNull();
    expect((await vehicle(ola, olaCar.id))?.speed).toBe(0);
    await expect(row).toBeHidden();
    await expect(bar).toBeHidden();
    await expect(
      ola.page.locator('.chat-row', { hasText: 'Manewr: Nagłe zatrzymanie' }).last(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
